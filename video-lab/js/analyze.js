/* Frame-level analysis: samples the video, measures each frame, and derives
   motion, cuts, dead zones and thumbnail candidates. Everything here runs on
   real decoded pixels — nothing is estimated from metadata alone. */
window.VL = window.VL || {};

VL.analyze = (function () {
  var U = VL.util;

  var MAX_SAMPLES = 420;        // hard cap so long videos stay responsive
  var MIN_INTERVAL = 0.18;      // seconds between samples
  var ANALYSIS_WIDTH = 256;     // downscaled size used for pixel metrics
  var THUMB_WIDTH = 360;        // stored candidate frames
  var MAX_THUMBS = 56;

  function loadVideo(file) {
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.src = url;
    return U.once(v, 'loadedmetadata').then(function () {
      // Some containers report Infinity until a seek forces a duration read.
      if (!isFinite(v.duration) || v.duration === 0) {
        v.currentTime = 1e6;
        return U.once(v, 'seeked').then(function () {
          v.currentTime = 0;
          return U.once(v, 'seeked');
        }).then(function () { return { video: v, url: url }; });
      }
      return { video: v, url: url };
    });
  }

  function seekTo(video, t) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function ok() {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', ok);
        resolve();
      }
      video.addEventListener('seeked', ok);
      // Guard against browsers that swallow the seeked event near the tail.
      setTimeout(ok, 1200);
      try { video.currentTime = t; } catch (e) { reject(e); }
    });
  }

  /* Per-frame pixel measurements from one downscaled RGBA buffer. */
  function measureFrame(data, w, h) {
    var n = w * h;
    var luma = new Float32Array(n);
    var sumL = 0, sumSat = 0, sumRG = 0, sumYB = 0, sumRG2 = 0, sumYB2 = 0;
    var skin = 0, dark = 0, blown = 0;
    var hist = new Float32Array(32);
    var colorBins = {};

    for (var i = 0, p = 0; i < n; i++, p += 4) {
      var r = data[p], g = data[p + 1], b = data[p + 2];
      var l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      luma[i] = l;
      sumL += l;
      hist[Math.min(31, (l * 32) | 0)] += 1;
      if (l < 0.04) dark++;
      if (l > 0.97) blown++;

      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumSat += mx === 0 ? 0 : (mx - mn) / mx;

      var rg = r - g;
      var yb = 0.5 * (r + g) - b;
      sumRG += rg; sumYB += yb;
      sumRG2 += rg * rg; sumYB2 += yb * yb;

      // Coarse skin-tone test — a cheap stand-in for "is there a person on screen".
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - mn) > 15 && Math.abs(r - g) > 15) skin++;

      var key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      colorBins[key] = (colorBins[key] || 0) + 1;
    }

    var meanL = sumL / n;
    var varL = 0;
    for (var j = 0; j < n; j++) varL += (luma[j] - meanL) * (luma[j] - meanL);
    var contrast = Math.sqrt(varL / n);

    // Variance of the Laplacian: the standard cheap focus measure.
    var lapSum = 0, lapSum2 = 0, lapN = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = y * w + x;
        var lap = 4 * luma[idx] - luma[idx - 1] - luma[idx + 1] - luma[idx - w] - luma[idx + w];
        lapSum += lap; lapSum2 += lap * lap; lapN++;
      }
    }
    var lapMean = lapSum / Math.max(1, lapN);
    var sharpness = lapSum2 / Math.max(1, lapN) - lapMean * lapMean;

    // How much of the frame's detail sits in the middle — a framing proxy.
    var cx0 = (w * 0.25) | 0, cx1 = (w * 0.75) | 0, cy0 = (h * 0.25) | 0, cy1 = (h * 0.75) | 0;
    var centerE = 0, totalE = 0;
    for (var y2 = 1; y2 < h - 1; y2++) {
      for (var x2 = 1; x2 < w - 1; x2++) {
        var i2 = y2 * w + x2;
        var e = Math.abs(luma[i2] - luma[i2 - 1]) + Math.abs(luma[i2] - luma[i2 - w]);
        totalE += e;
        if (x2 >= cx0 && x2 < cx1 && y2 >= cy0 && y2 < cy1) centerE += e;
      }
    }

    var mrg = sumRG / n, myb = sumYB / n;
    var srg = Math.sqrt(Math.max(0, sumRG2 / n - mrg * mrg));
    var syb = Math.sqrt(Math.max(0, sumYB2 / n - myb * myb));
    var colorfulness = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);

    var bestKey = null, bestCount = -1;
    Object.keys(colorBins).forEach(function (k) {
      if (colorBins[k] > bestCount) { bestCount = colorBins[k]; bestKey = k; }
    });
    var bk = parseInt(bestKey, 10) || 0;
    var dominant = {
      r: ((bk >> 6) & 7) * 32 + 16,
      g: ((bk >> 3) & 7) * 32 + 16,
      b: (bk & 7) * 32 + 16
    };

    for (var hb = 0; hb < 32; hb++) hist[hb] /= n;

    return {
      luma: meanL,
      contrast: contrast,
      saturation: sumSat / n,
      colorfulness: colorfulness,
      sharpness: sharpness,
      skinRatio: skin / n,
      centerBias: totalE > 0 ? centerE / totalE : 0.25,
      crushed: dark / n,
      blown: blown / n,
      dominant: dominant,
      hist: hist,
      lumaMap: luma
    };
  }

  function frameDistance(a, b) {
    var n = a.lumaMap.length, diff = 0;
    for (var i = 0; i < n; i++) diff += Math.abs(a.lumaMap[i] - b.lumaMap[i]);
    diff /= n;
    var hd = 0;
    for (var h = 0; h < 32; h++) hd += Math.abs(a.hist[h] - b.hist[h]);
    return { pixel: diff, hist: hd / 2 };
  }

  function run(file, onProgress) {
    onProgress = onProgress || function () {};
    var handle, video, url;

    return loadVideo(file).then(function (h) {
      handle = h; video = h.video; url = h.url;

      var duration = isFinite(video.duration) ? video.duration : 0;
      if (!duration) throw new Error('This file has no readable video duration.');

      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) throw new Error('This file has no readable video track.');

      var aw = ANALYSIS_WIDTH;
      var ah = Math.max(2, Math.round(aw * vh / vw));
      var canvas = document.createElement('canvas');
      canvas.width = aw; canvas.height = ah;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });

      var thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = THUMB_WIDTH;
      thumbCanvas.height = Math.max(2, Math.round(THUMB_WIDTH * vh / vw));
      var thumbCtx = thumbCanvas.getContext('2d');

      var interval = Math.max(MIN_INTERVAL, duration / MAX_SAMPLES);
      var times = [];
      for (var t = 0; t < duration - 0.02; t += interval) times.push(t);
      if (times.length < 2) times = [0, Math.max(0.01, duration / 2)];
      var thumbEvery = Math.max(1, Math.ceil(times.length / MAX_THUMBS));

      var frames = [];
      var thumbs = [];
      var prev = null;
      var chain = Promise.resolve();

      times.forEach(function (time, i) {
        chain = chain.then(function () {
          return seekTo(video, time);
        }).then(function () {
          ctx.drawImage(video, 0, 0, aw, ah);
          var img = ctx.getImageData(0, 0, aw, ah);
          var m = measureFrame(img.data, aw, ah);
          m.t = video.currentTime;
          if (prev) {
            var d = frameDistance(prev, m);
            m.pixelDiff = d.pixel;
            m.histDiff = d.hist;
          } else {
            m.pixelDiff = 0;
            m.histDiff = 0;
          }
          if (i % thumbEvery === 0) {
            thumbCtx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
            thumbs.push({
              t: m.t,
              url: thumbCanvas.toDataURL('image/jpeg', 0.72),
              sharpness: m.sharpness,
              colorfulness: m.colorfulness,
              skinRatio: m.skinRatio,
              luma: m.luma,
              contrast: m.contrast
            });
          }
          prev = m;
          frames.push(m);
          onProgress(i / times.length);
        });
      });

      return chain.then(function () {
        frames.forEach(function (f) { delete f.lumaMap; delete f.hist; });
        return {
          meta: {
            name: file.name,
            size: file.size,
            type: file.type || 'unknown',
            duration: duration,
            width: vw,
            height: vh,
            aspect: vw / vh,
            aspectLabel: U.aspectLabel(vw, vh),
            sampleInterval: interval,
            sampleCount: frames.length
          },
          frames: frames,
          thumbs: thumbs,
          url: url,
          video: video
        };
      });
    });
  }

  /* Cuts, motion and dead zones, derived from the sampled frames. */
  function derive(base) {
    var frames = base.frames;
    var meta = base.meta;
    var diffs = frames.slice(1).map(function (f) { return f.pixelDiff; });
    var medianDiff = U.percentile(diffs, 0.5);
    var spread = U.percentile(diffs, 0.9) - medianDiff;
    var cutThreshold = Math.max(0.085, medianDiff + Math.max(0.05, spread * 1.6));

    var cuts = [];
    frames.forEach(function (f, i) {
      if (i === 0) return;
      var hard = f.pixelDiff > 0.26 && f.histDiff > 0.28;
      var soft = f.pixelDiff > cutThreshold && f.histDiff > 0.2;
      if (hard || soft) cuts.push(f.t);
    });
    // Collapse cuts that land in consecutive samples (one edit, not several).
    var merged = [];
    cuts.forEach(function (t) {
      if (!merged.length || t - merged[merged.length - 1] > meta.sampleInterval * 1.5) merged.push(t);
    });
    cuts = merged;

    var motion = frames.map(function (f, i) {
      if (i === 0) return 0;
      // Cut frames would otherwise read as huge "motion".
      var isCut = cuts.some(function (c) { return Math.abs(c - f.t) < meta.sampleInterval * 0.6; });
      return isCut ? null : f.pixelDiff;
    });
    var motionFilled = motion.map(function (m, i) {
      if (m !== null) return m;
      var before = null, after = null;
      for (var a = i - 1; a >= 0; a--) if (motion[a] !== null) { before = motion[a]; break; }
      for (var b = i + 1; b < motion.length; b++) if (motion[b] !== null) { after = motion[b]; break; }
      if (before === null && after === null) return 0;
      if (before === null) return after;
      if (after === null) return before;
      return (before + after) / 2;
    });

    var cutsPerMin = meta.duration > 0 ? cuts.length / (meta.duration / 60) : 0;
    var gaps = [];
    var last = 0;
    cuts.forEach(function (c) { gaps.push(c - last); last = c; });
    gaps.push(meta.duration - last);
    var longestStatic = gaps.length ? Math.max.apply(null, gaps) : meta.duration;

    return {
      cuts: cuts,
      cutsPerMin: cutsPerMin,
      cutGaps: gaps,
      longestStatic: longestStatic,
      motion: motionFilled,
      medianMotion: U.percentile(motionFilled.filter(function (m) { return m > 0; }), 0.5)
    };
  }

  /* Slack time: audio gaps, and stretches where nothing moves at all.
     When there is an audio track the gap in the sound is the reliable signal —
     a locked-off talking head has low pixel motion but is not dead air. */
  function findDeadZones(base, derived, audio) {
    var frames = base.frames;
    var meta = base.meta;
    var motion = derived.motion;
    var motionRef = Math.max(0.012, derived.medianMotion);
    var hasAudio = !!(audio && audio.available && audio.envelope.length);
    var quietCut = hasAudio ? Math.max(-45, audio.loudnessDb - 14) : null;

    function audioAt(t) {
      if (!hasAudio) return null;
      var idx = U.clamp(Math.round(t / audio.envelopeStep), 0, audio.envelope.length - 1);
      return audio.envelope[idx];
    }

    var zones = [];
    var run = null;

    for (var i = 0; i < frames.length; i++) {
      var t = frames[i].t;
      var lowMotion = motion[i] < motionRef * 0.45;
      var db = audioAt(t);
      var lowAudio = db === null ? true : db < quietCut;
      // The cut guard exists because motion reads high around an edit; it has
      // no bearing on whether the audio has gone quiet.
      var nearCut = derived.cuts.some(function (c) { return Math.abs(c - t) < 0.5; });
      var slack = hasAudio ? lowAudio : (lowMotion && !nearCut);

      if (slack) {
        if (!run) run = { start: t, end: t, still: 0, n: 0 };
        run.end = t;
        run.n++;
        if (lowMotion) run.still++;
      }
      if ((!slack || i === frames.length - 1) && run) {
        var mostlyStill = run.still / Math.max(1, run.n) > 0.6;
        var minLength = mostlyStill ? 1.5 : 1.2;
        if (run.end - run.start >= minLength) {
          zones.push({
            start: run.start,
            end: Math.min(meta.duration, run.end + meta.sampleInterval),
            kind: mostlyStill ? 'dead' : 'silence',
            reason: !hasAudio ? 'no movement on screen'
              : mostlyStill ? 'no movement and no sound' : 'a gap in the audio'
          });
        }
        run = null;
      }
    }
    return zones;
  }

  function pickThumbnails(base) {
    var thumbs = base.thumbs.filter(function (t) { return t.t > 0.25; });
    if (!thumbs.length) thumbs = base.thumbs.slice();
    var sharpMax = Math.max.apply(null, thumbs.map(function (t) { return t.sharpness; })) || 1;
    var colorMax = Math.max.apply(null, thumbs.map(function (t) { return t.colorfulness; })) || 1;
    var scored = thumbs.map(function (t) {
      var exposure = 1 - Math.min(1, Math.abs(t.luma - 0.5) / 0.5);
      var score = 0.34 * (t.sharpness / sharpMax) +
                  0.24 * (t.colorfulness / colorMax) +
                  0.24 * Math.min(1, t.skinRatio / 0.12) +
                  0.18 * exposure;
      return { t: t.t, url: t.url, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 6);
  }

  return {
    run: run,
    derive: derive,
    findDeadZones: findDeadZones,
    pickThumbnails: pickThumbnails
  };
})();
