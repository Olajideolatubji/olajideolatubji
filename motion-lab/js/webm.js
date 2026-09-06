/* A minimal WebM (Matroska) muxer.
 *
 * This exists for one reason. The obvious way to get video out of a canvas is
 * MediaRecorder over captureStream, but MediaRecorder timestamps frames off
 * the wall clock: it can only record as fast as the video plays. A three-hour
 * render would take three hours, and any hitch in the render becomes a hitch
 * in the file.
 *
 * WebCodecs' VideoEncoder has no such tie — frames carry the timestamps we
 * give them — but it hands back raw encoded chunks with no container. So we
 * write the container. Roughly 200 lines of EBML buys frame-exact output at
 * whatever speed the machine can render, which is what makes long-form
 * possible at all.
 *
 * Video only, one track. Audio is exported separately and muxed with ffmpeg;
 * see the export panel for the command. */

ML.webm = (() => {

  /* EBML primitives ---------------------------------------------------- */

  const bytes = arr => new Uint8Array(arr);

  function concat(list) {
    let len = 0;
    for (const a of list) len += a.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const a of list) { out.set(a, o); o += a.length; }
    return out;
  }

  /* Element IDs are written as-is — they already carry their own length
   * marker in the top bits. */
  function id(v) {
    const out = [];
    for (let shift = 24; shift >= 0; shift -= 8) {
      const b = (v >>> shift) & 0xff;
      if (out.length || b) out.push(b);
    }
    return bytes(out.length ? out : [0]);
  }

  /* Sizes are variable-length integers with a leading marker bit. */
  function vint(value) {
    let length = 1;
    while (length < 8 && value >= Math.pow(2, 7 * length) - 1) length++;
    const out = new Uint8Array(length);
    let v = value;
    for (let i = length - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256); }
    out[0] |= 1 << (8 - length);
    return out;
  }

  function uintBytes(value) {
    if (value === 0) return bytes([0]);
    const out = [];
    let v = value;
    while (v > 0) { out.unshift(v & 0xff); v = Math.floor(v / 256); }
    return bytes(out);
  }

  function f64Bytes(value) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, value, false);
    return b;
  }

  const elem = (elemId, payload) => concat([id(elemId), vint(payload.length), payload]);
  const uintEl = (elemId, value) => elem(elemId, uintBytes(value));
  const floatEl = (elemId, value) => elem(elemId, f64Bytes(value));
  const strEl = (elemId, s) => elem(elemId, new TextEncoder().encode(s));
  const master = (elemId, children) => elem(elemId, concat(children));

  const ID = {
    EBML: 0x1A45DFA3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42F7,
    EBMLMaxIDLength: 0x42F2, EBMLMaxSizeLength: 0x42F3,
    DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
    Segment: 0x18538067,
    Info: 0x1549A966, TimecodeScale: 0x2AD7B1, MuxingApp: 0x4D80, WritingApp: 0x5741, Duration: 0x4489,
    Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackUID: 0x73C5,
    FlagLacing: 0x9C, Language: 0x22B59C, CodecID: 0x86, TrackType: 0x83, DefaultDuration: 0x23E383,
    Video: 0xE0, PixelWidth: 0xB0, PixelHeight: 0xBA, DisplayWidth: 0x54B0, DisplayHeight: 0x54BA,
    Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3,
    Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7,
    CueTrack: 0xF7, CueClusterPosition: 0xF1
  };

  /* Muxer -------------------------------------------------------------- */

  /* Chunks arrive from the encoder in decode order with microsecond
   * timestamps. Clusters are cut on keyframes, and also whenever the block's
   * offset from the cluster start would overflow the signed 16-bit relative
   * timecode a SimpleBlock carries — a real limit at long durations, and the
   * bug that makes naive muxers produce files that fall apart after a few
   * minutes. */
  function mux(opts) {
    const { width, height, codec, frameDurationNs, chunks } = opts;
    const TIMECODE_SCALE = 1e6; // one millisecond per tick

    const header = master(ID.EBML, [
      uintEl(ID.EBMLVersion, 1),
      uintEl(ID.EBMLReadVersion, 1),
      uintEl(ID.EBMLMaxIDLength, 4),
      uintEl(ID.EBMLMaxSizeLength, 8),
      strEl(ID.DocType, 'webm'),
      uintEl(ID.DocTypeVersion, 2),
      uintEl(ID.DocTypeReadVersion, 2)
    ]);

    const lastMs = chunks.length ? chunks[chunks.length - 1].timestamp / 1000 : 0;
    const durationMs = lastMs + frameDurationNs / 1e6;

    const info = master(ID.Info, [
      uintEl(ID.TimecodeScale, TIMECODE_SCALE),
      strEl(ID.MuxingApp, 'Motion Lab'),
      strEl(ID.WritingApp, 'Motion Lab'),
      floatEl(ID.Duration, durationMs)
    ]);

    const tracks = master(ID.Tracks, [
      master(ID.TrackEntry, [
        uintEl(ID.TrackNumber, 1),
        uintEl(ID.TrackUID, 1),
        uintEl(ID.FlagLacing, 0),
        strEl(ID.Language, 'und'),
        strEl(ID.CodecID, codec),
        uintEl(ID.TrackType, 1),
        uintEl(ID.DefaultDuration, Math.round(frameDurationNs)),
        master(ID.Video, [
          uintEl(ID.PixelWidth, width),
          uintEl(ID.PixelHeight, height),
          uintEl(ID.DisplayWidth, width),
          uintEl(ID.DisplayHeight, height)
        ])
      ])
    ]);

    const clusters = [];
    const cuePoints = [];
    let cluster = null;
    let clusterStartMs = 0;
    let clusterBlocks = [];

    const closeCluster = () => {
      if (!clusterBlocks.length) return;
      clusters.push(master(ID.Cluster, [uintEl(ID.Timecode, clusterStartMs), ...clusterBlocks]));
      clusterBlocks = [];
    };

    for (const chunk of chunks) {
      const ms = Math.round(chunk.timestamp / 1000);
      const relative = ms - clusterStartMs;
      const needsNew = !clusterBlocks.length || (chunk.key && relative > 0) || relative > 30000 || relative < -32000;

      if (needsNew) {
        closeCluster();
        clusterStartMs = ms;
        // Cue position is the byte offset of this cluster from the start of
        // the Segment payload — known because Info and Tracks come first and
        // every earlier cluster is already assembled.
        if (chunk.key) {
          let offset = info.length + tracks.length;
          for (const c of clusters) offset += c.length;
          cuePoints.push({ time: ms, offset });
        }
      }

      const rel = ms - clusterStartMs;
      const head = new Uint8Array(4);
      head[0] = 0x81;                       // track number 1 as a vint
      head[1] = (rel >> 8) & 0xff;
      head[2] = rel & 0xff;
      head[3] = chunk.key ? 0x80 : 0x00;    // keyframe flag
      clusterBlocks.push(elem(ID.SimpleBlock, concat([head, chunk.data])));
    }
    closeCluster();

    const cues = cuePoints.length ? master(ID.Cues, cuePoints.map(c => master(ID.CuePoint, [
      uintEl(ID.CueTime, c.time),
      master(ID.CueTrackPositions, [uintEl(ID.CueTrack, 1), uintEl(ID.CueClusterPosition, c.offset)])
    ]))) : new Uint8Array(0);

    const segment = master(ID.Segment, [info, tracks, ...clusters, cues]);
    return new Blob([header, segment], { type: 'video/webm' });
  }

  /* Picks a codec the machine will actually encode. Ordered by what plays
   * back and uploads most reliably, not by what compresses best. */
  async function pickCodec(width, height, fps) {
    if (typeof VideoEncoder === 'undefined') return null;
    const level = height >= 1400 ? '50' : height >= 1000 ? '40' : '31';
    const candidates = [
      { codec: `vp09.00.${level}.08`, container: 'V_VP9' },
      { codec: 'vp8', container: 'V_VP8' }
    ];
    for (const c of candidates) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: c.codec, width, height, framerate: fps,
          bitrate: bitrateFor(width, height, fps)
        });
        if (support && support.supported) return c;
      } catch (e) { /* try the next one */ }
    }
    return null;
  }

  /* Bitrate by pixel rate. Deliberately generous: YouTube re-encodes whatever
   * it is given, so the upload is the last generation that can still hold
   * detail, and flat colour fields with hard type are exactly what a stingy
   * bitrate turns to mush. */
  function bitrateFor(width, height, fps) {
    const pixels = width * height;
    const perPixel = 0.11; // bits per pixel per frame
    return Math.round(ML.clamp(pixels * fps * perPixel, 2_000_000, 26_000_000));
  }

  return { mux, pickCodec, bitrateFor };
})();
