/* Export.
 *
 * Renders the timeline to video. Two paths:
 *
 *   WebCodecs — every frame is drawn, encoded and handed to the muxer with an
 *   exact timestamp. Runs as fast as the machine can draw, which is what makes
 *   an hour-long render finish in minutes rather than an hour.
 *
 *   MediaRecorder — the fallback where WebCodecs is missing. It records in
 *   real time, so it is only offered for short pieces and says so.
 *
 * Long videos are written in segments. This is not a nicety: a three-hour
 * 1080p render is tens of gigabytes of encoded chunks, and holding that in one
 * Blob is how a browser tab dies. Segments cap memory at one segment's worth
 * and are joined losslessly by ffmpeg afterwards. */

ML.export = (() => {

  /* Video --------------------------------------------------------------- */

  async function renderVideo(tl, opts) {
    const fps = tl.fps;
    const onProgress = opts.onProgress || (() => {});
    const shouldStop = opts.shouldStop || (() => false);
    const segmentSeconds = opts.segmentSeconds || 300;
    const segmented = tl.duration > segmentSeconds * 1.5;

    const picked = await ML.webm.pickCodec(tl.w, tl.h, fps);
    if (!picked) return recordRealtime(tl, opts);

    const canvas = document.createElement('canvas');
    canvas.width = tl.w;
    canvas.height = tl.h;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    const bounds = [];
    if (segmented) {
      for (let s = 0; s < tl.duration; s += segmentSeconds) {
        bounds.push([s, Math.min(tl.duration, s + segmentSeconds)]);
      }
    } else {
      bounds.push([0, tl.duration]);
    }

    const totalFrames = Math.round(tl.duration * fps);
    let framesDone = 0;
    const files = [];

    for (let si = 0; si < bounds.length; si++) {
      const [from, to] = bounds[si];
      const chunks = [];
      let encoderError = null;

      const encoder = new VideoEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
        },
        error: (e) => { encoderError = e; }
      });

      encoder.configure({
        codec: picked.codec,
        width: tl.w,
        height: tl.h,
        framerate: fps,
        bitrate: ML.webm.bitrateFor(tl.w, tl.h, fps),
        latencyMode: 'quality'
      });

      const firstFrame = Math.round(from * fps);
      const lastFrame = Math.round(to * fps);
      const keyEvery = Math.round(fps * 2);

      for (let f = firstFrame; f < lastFrame; f++) {
        if (shouldStop()) { try { encoder.close(); } catch (e) {} return { cancelled: true, files }; }
        if (encoderError) throw encoderError;

        const t = f / fps;
        ML.render.frame(ctx, tl, t);

        // Timestamps restart at zero in each segment so every file is a valid,
        // independently playable video rather than one that only makes sense
        // in sequence.
        const localIndex = f - firstFrame;
        const frame = new VideoFrame(canvas, {
          timestamp: Math.round((localIndex / fps) * 1e6),
          duration: Math.round(1e6 / fps)
        });
        encoder.encode(frame, { keyFrame: localIndex % keyEvery === 0 });
        frame.close();

        framesDone++;

        // Yield on a cadence rather than every frame: awaiting each one costs
        // more than the encode does, but never yielding locks the tab and the
        // encoder queue grows without bound.
        if (localIndex % 6 === 0) {
          if (encoder.encodeQueueSize > 24) {
            while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 4));
          } else {
            await new Promise(r => setTimeout(r, 0));
          }
          onProgress({
            phase: 'encoding',
            done: framesDone,
            total: totalFrames,
            ratio: framesDone / totalFrames,
            segment: si + 1,
            segments: bounds.length,
            time: t
          });
        }
      }

      await encoder.flush();
      encoder.close();
      if (encoderError) throw encoderError;

      chunks.sort((a, b) => a.timestamp - b.timestamp);
      const blob = ML.webm.mux({
        width: tl.w, height: tl.h,
        codec: picked.container,
        frameDurationNs: 1e9 / fps,
        chunks
      });

      files.push({
        blob,
        name: segmented ? `${safeName(tl.title)}-part${String(si + 1).padStart(2, '0')}.webm` : `${safeName(tl.title)}.webm`,
        from, to,
        seconds: to - from
      });
    }

    return { files, segmented, codec: picked.codec, realtime: false };
  }

  /* Real-time fallback. Only ever offered for short pieces, because the wall
   * clock is the encoder here. */
  function recordRealtime(tl, opts) {
    const onProgress = opts.onProgress || (() => {});
    const shouldStop = opts.shouldStop || (() => false);

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = tl.w;
      canvas.height = tl.h;
      const ctx = canvas.getContext('2d', { alpha: false });

      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!mime) return reject(new Error('This browser cannot record video from a canvas.'));

      const stream = canvas.captureStream(tl.fps);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: ML.webm.bitrateFor(tl.w, tl.h, tl.fps) });
      const parts = [];
      rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      rec.onerror = e => reject(e.error || new Error('Recording failed.'));
      rec.onstop = () => resolve({
        files: [{ blob: new Blob(parts, { type: mime }), name: `${safeName(tl.title)}.webm`, from: 0, to: tl.duration, seconds: tl.duration }],
        segmented: false, realtime: true, codec: mime
      });

      const started = performance.now();
      rec.start(1000);

      const tick = () => {
        const t = (performance.now() - started) / 1000;
        if (shouldStop() || t >= tl.duration) {
          try { rec.stop(); } catch (e) {}
          stream.getTracks().forEach(tr => tr.stop());
          return;
        }
        ML.render.frame(ctx, tl, t);
        onProgress({ phase: 'recording', done: t, total: tl.duration, ratio: t / tl.duration, time: t, segment: 1, segments: 1 });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* Audio ---------------------------------------------------------------- */

  /* A music bed rendered offline. It is not trying to be a soundtrack — it is
   * a floor under the narration, keyed to the style, with a lift on every
   * chapter so the structure is audible as well as visible. Rendered through
   * OfflineAudioContext, so a three-hour bed takes seconds rather than three
   * hours.
   *
   * Long beds are capped: past ten minutes the bed is written as a loopable
   * two-minute piece instead, because a full-length float buffer at 44.1kHz is
   * gigabytes of memory for something that repeats anyway. */
  async function renderMusic(tl, opts) {
    const rate = 44100;
    const loopable = tl.duration > 600;
    const seconds = loopable ? 120 : Math.max(2, tl.duration);
    const ctxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!ctxClass) throw new Error('This browser cannot render audio offline.');

    const ac = new ctxClass(2, Math.ceil(seconds * rate), rate);
    const style = tl.style.id;

    // Each style gets a root, a mode and a density. Minor and slow for the
    // long-form styles, brighter and busier for the short ones.
    const beds = {
      retention:   { root: 55.00, scale: [0, 3, 5, 7, 10], bpm: 96,  pad: 0.18, pulse: 0.12 },
      kinetic:     { root: 65.41, scale: [0, 2, 5, 7, 9],  bpm: 120, pad: 0.12, pulse: 0.2 },
      infographic: { root: 58.27, scale: [0, 2, 4, 7, 9],  bpm: 100, pad: 0.16, pulse: 0.1 },
      whiteboard:  { root: 65.41, scale: [0, 2, 4, 7, 11], bpm: 84,  pad: 0.14, pulse: 0.06 },
      impact:      { root: 49.00, scale: [0, 1, 5, 7, 8],  bpm: 128, pad: 0.2,  pulse: 0.22 },
      documentary: { root: 43.65, scale: [0, 3, 7, 10],    bpm: 68,  pad: 0.22, pulse: 0.04 },
      ambient:     { root: 48.99, scale: [0, 5, 7, 12],    bpm: 52,  pad: 0.26, pulse: 0.02 },
      listicle:    { root: 61.74, scale: [0, 2, 5, 7, 10], bpm: 110, pad: 0.15, pulse: 0.16 }
    };
    const bed = beds[style] || beds.retention;
    const gain = (opts && opts.gain != null) ? opts.gain : 0.5;

    const master = ac.createGain();
    master.gain.value = gain;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ac.destination);

    const semitone = n => Math.pow(2, n / 12);
    const rnd = ML.rng(ML.hash(tl.style.id + tl.title));

    // Pad: long overlapping tones on the chord tones, detuned in pairs so the
    // bed moves without anything in it being noticeable.
    const chordLen = 8;
    for (let start = 0; start < seconds; start += chordLen) {
      const degree = bed.scale[Math.floor(rnd() * bed.scale.length)];
      [0, 7, 12, 19].forEach((interval, i) => {
        [-4, 4].forEach(cents => {
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = i > 2 ? 'triangle' : 'sine';
          osc.frequency.value = bed.root * semitone(degree + interval) * Math.pow(2, cents / 1200);
          const peak = bed.pad / (i + 1.6);
          const end = Math.min(seconds, start + chordLen + 2);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 2.4);
          g.gain.exponentialRampToValueAtTime(0.0001, end);
          osc.connect(g).connect(master);
          osc.start(start);
          osc.stop(end + 0.05);
        });
      });
    }

    // Pulse: a soft filtered blip on the beat, quiet enough to sit under a
    // voice and loud enough to give the edit a grid.
    if (bed.pulse > 0.03) {
      const beat = 60 / bed.bpm;
      for (let t = 0; t < seconds; t += beat) {
        const strong = Math.round(t / beat) % 4 === 0;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        const filt = ac.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = strong ? 900 : 500;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(bed.root * (strong ? 2 : 3), t);
        g.gain.setValueAtTime(bed.pulse * (strong ? 1 : 0.45), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 0.42 : 0.2));
        osc.connect(filt).connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.5);
      }
    }

    // Chapter lifts, on the non-loopable beds where they can land in the right
    // place. A rising fifth on the marker, so the structure is audible.
    if (!loopable) {
      for (const ch of tl.chapters) {
        if (ch.start <= 0.1 || ch.start > seconds - 2) continue;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(bed.root * 4, ch.start);
        osc.frequency.exponentialRampToValueAtTime(bed.root * 6, ch.start + 0.5);
        g.gain.setValueAtTime(0.0001, ch.start);
        g.gain.exponentialRampToValueAtTime(0.16, ch.start + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, ch.start + 1.6);
        osc.connect(g).connect(master);
        osc.start(ch.start);
        osc.stop(ch.start + 1.7);
      }
    }

    const buffer = await ac.startRendering();
    return { blob: toWav(buffer), seconds, loopable };
  }

  /* 16-bit PCM WAV. Every editor and ffmpeg build reads it, which matters more
   * here than the file size does. */
  function toWav(buffer) {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytesPerSample = 2;
    const dataLength = frames * channels * bytesPerSample;
    const out = new ArrayBuffer(44 + dataLength);
    const view = new DataView(out);

    const str = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, dataLength, true);

    const data = [];
    for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const s = ML.clamp(data[c][i], -1, 1);
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  /* Deliverables --------------------------------------------------------- */

  /* The command that turns what the browser can produce into the file that
   * gets uploaded. Written out rather than hidden, because the person running
   * it should be able to read what it does to their footage. */
  function ffmpegCommand(result, tl, hasMusic) {
    const lines = [];
    const base = safeName(tl.title);

    if (result.segmented) {
      lines.push('# 1. Join the parts (no re-encode, so nothing is lost):');
      lines.push(`#    Save this as parts.txt:`);
      result.files.forEach(f => lines.push(`file '${f.name}'`));
      lines.push('');
      lines.push(`ffmpeg -f concat -safe 0 -i parts.txt -c copy ${base}-full.webm`);
      lines.push('');
    }

    const video = result.segmented ? `${base}-full.webm` : result.files[0].name;
    lines.push('# 2. Add narration, and the music bed under it:');
    if (hasMusic) {
      lines.push(`ffmpeg -i ${video} -i narration.wav -i ${base}-music.wav \\`);
      lines.push('  -filter_complex "[2:a]volume=0.18[bed];[1:a][bed]amix=inputs=2:duration=first[a]" \\');
      lines.push(`  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k ${base}-final.mp4`);
    } else {
      lines.push(`ffmpeg -i ${video} -i narration.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k ${base}-final.mp4`);
    }
    lines.push('');
    lines.push('# The video stream is copied, not re-encoded, so this is lossless and fast.');
    lines.push('# Drop the narration input if the video is meant to run without it.');
    return lines.join('\n');
  }

  /* A narration sheet: every line with the timecode it has to land on. This is
   * what a voice actor or a TTS run needs, and what makes the audio line up
   * with a render that was timed from the same numbers. */
  function narrationSheet(tl) {
    const lines = [`# ${tl.title}`, '', `Total runtime ${ML.mmss(tl.duration)} · ${tl.scenes.length} scenes · read at ${tl.meta.wpm} words per minute`, ''];
    let chapter = -1;
    for (const s of tl.scenes) {
      if (s.kind === 'chapter') {
        chapter = s.chapter;
        lines.push('', `## ${ML.mmss(s.start)} — ${s.display}`, '');
        continue;
      }
      if (!s.text) {
        lines.push(`[${ML.mmss(s.start)}] (${s.device === 'open-loop' ? 'open loop card' : 'loop-back card'}: "${s.display}") — ${ML.round(s.dur, 1)}s, no narration`);
        continue;
      }
      lines.push(`[${ML.mmss(s.start)}] ${s.text}`);
      lines.push(`   ↳ on screen: "${s.display}" · ${ML.round(s.dur, 1)}s · ${s.layout}${s.interrupt ? ' · pattern interrupt' : ''}`);
    }
    return lines.join('\n');
  }

  function safeName(s) {
    return String(s || 'motion-lab')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 48) || 'motion-lab';
  }

  /* A rough throughput estimate so the export panel can say how long this will
   * take before it starts, rather than after. Measured, not assumed: it draws
   * a handful of real frames and times them. */
  async function benchmark(tl) {
    const canvas = document.createElement('canvas');
    canvas.width = tl.w;
    canvas.height = tl.h;
    const ctx = canvas.getContext('2d', { alpha: false });
    const samples = 8;
    const started = performance.now();
    for (let i = 0; i < samples; i++) ML.render.frame(ctx, tl, (tl.duration * i) / samples);
    const perFrame = (performance.now() - started) / samples;
    // Encoding runs alongside the draw and roughly doubles the per-frame cost
    // in practice; this is a floor, not a promise.
    const frames = tl.duration * tl.fps;
    return { perFrameMs: perFrame, estimateSeconds: (perFrame * 2.1 * frames) / 1000 };
  }

  return { renderVideo, renderMusic, ffmpegCommand, narrationSheet, benchmark, safeName, toWav };
})();
