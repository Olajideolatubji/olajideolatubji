/* Audio analysis. Decodes the file's audio track and measures loudness,
   silence, clipping, dynamics and speech-band energy. Falls back to a
   sped-up realtime scan when the browser refuses to decode the container. */
window.VL = window.VL || {};

VL.audio = (function () {
  var U = VL.util;
  var WINDOW = 0.05;              // envelope resolution, seconds
  var MAX_DECODE_BYTES = 320 * 1024 * 1024;

  function ctxClass() {
    return window.AudioContext || window.webkitAudioContext;
  }

  function toMono(buffer) {
    var n = buffer.length;
    var out = new Float32Array(n);
    var ch = buffer.numberOfChannels;
    for (var c = 0; c < ch; c++) {
      var data = buffer.getChannelData(c);
      for (var i = 0; i < n; i++) out[i] += data[i] / ch;
    }
    return out;
  }

  function envelopeOf(mono, sampleRate) {
    var win = Math.max(1, Math.round(WINDOW * sampleRate));
    var count = Math.max(1, Math.floor(mono.length / win));
    var env = new Array(count);
    var peak = 0, clipped = 0;
    for (var w = 0; w < count; w++) {
      var s = 0;
      var start = w * win;
      for (var i = 0; i < win; i++) {
        var v = mono[start + i] || 0;
        s += v * v;
        var a = Math.abs(v);
        if (a > peak) peak = a;
        if (a > 0.988) clipped++;
      }
      env[w] = U.dbfs(Math.sqrt(s / win));
    }
    return { env: env, peak: peak, clipRatio: clipped / Math.max(1, mono.length) };
  }

  function speechBandRatio(mono, sampleRate) {
    // Decimate to 16 kHz mono so the offline render stays cheap.
    var target = 16000;
    if (sampleRate <= target) target = sampleRate;
    var ratio = sampleRate / target;
    var n = Math.floor(mono.length / ratio);
    if (n < target) return Promise.resolve(null);

    var OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) return Promise.resolve(null);

    var small = new Float32Array(n);
    var rawSum = 0;
    for (var i = 0; i < n; i++) {
      var v = mono[Math.floor(i * ratio)] || 0;
      small[i] = v;
      rawSum += v * v;
    }
    var rawRms = Math.sqrt(rawSum / n);
    if (rawRms < 1e-5) return Promise.resolve(null);

    var offline = new OfflineCtx(1, n, target);
    var buf = offline.createBuffer(1, n, target);
    buf.getChannelData(0).set(small);
    var src = offline.createBufferSource();
    src.buffer = buf;
    var hp = offline.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 300;
    var lp = offline.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3400;
    src.connect(hp); hp.connect(lp); lp.connect(offline.destination);
    src.start(0);

    return offline.startRendering().then(function (rendered) {
      var out = rendered.getChannelData(0);
      var s = 0;
      for (var j = 0; j < out.length; j++) s += out[j] * out[j];
      var bandRms = Math.sqrt(s / out.length);
      return U.clamp(bandRms / rawRms, 0, 1);
    }).catch(function () { return null; });
  }

  function summarize(env, peak, clipRatio, duration, speechRatio, partial) {
    var voiced = env.filter(function (d) { return d > -48; });
    var loudness = voiced.length ? U.dbfs(Math.sqrt(U.mean(voiced.map(function (d) {
      var lin = Math.pow(10, d / 20);
      return lin * lin;
    })))) : -100;

    var silence = env.filter(function (d) { return d <= -48; }).length / Math.max(1, env.length);
    var dynamic = voiced.length > 4 ? U.percentile(voiced, 0.95) - U.percentile(voiced, 0.15) : 0;

    // Rough onset count: a jump of 6 dB or more between neighbouring windows.
    var onsets = 0;
    for (var i = 1; i < env.length; i++) {
      if (env[i] - env[i - 1] > 6 && env[i] > -42) onsets++;
    }

    return {
      available: true,
      partial: !!partial,
      envelope: env,
      envelopeStep: WINDOW,
      loudnessDb: loudness,
      peakDb: U.dbfs(peak),
      clipRatio: clipRatio,
      silenceRatio: silence,
      dynamicRange: dynamic,
      speechRatio: speechRatio,
      onsetsPerMin: duration > 0 ? onsets / (duration / 60) : 0
    };
  }

  function unavailable(reason) {
    return {
      available: false,
      reason: reason,
      envelope: [],
      envelopeStep: WINDOW,
      loudnessDb: -100,
      peakDb: -100,
      clipRatio: 0,
      silenceRatio: 1,
      dynamicRange: 0,
      speechRatio: null,
      onsetsPerMin: 0
    };
  }

  function decodeFile(file) {
    var Ctx = ctxClass();
    if (!Ctx) return Promise.resolve(unavailable('This browser has no Web Audio support.'));
    if (file.size > MAX_DECODE_BYTES) {
      return Promise.resolve(unavailable('File is too large to decode audio in the browser.'));
    }
    var ctx = new Ctx();
    return file.arrayBuffer().then(function (buf) {
      return new Promise(function (resolve, reject) {
        // Callback form for Safari, which still lacks the promise overload.
        var p = ctx.decodeAudioData(buf, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
    }).then(function (audioBuffer) {
      var mono = toMono(audioBuffer);
      var e = envelopeOf(mono, audioBuffer.sampleRate);
      return speechBandRatio(mono, audioBuffer.sampleRate).then(function (sr) {
        try { ctx.close(); } catch (err) {}
        return summarize(e.env, e.peak, e.clipRatio, audioBuffer.duration, sr, false);
      });
    }).catch(function () {
      try { ctx.close(); } catch (err) {}
      return null; // signals "try the fallback"
    });
  }

  /* Plays the video silently at up to 6x through an analyser to sample loudness
     when decodeAudioData can't handle the container. */
  function scanElement(video, duration) {
    var Ctx = ctxClass();
    if (!Ctx) return Promise.resolve(unavailable('This browser has no Web Audio support.'));
    var ctx = new Ctx();
    var source;
    try {
      source = ctx.createMediaElementSource(video);
    } catch (e) {
      try { ctx.close(); } catch (err) {}
      return Promise.resolve(unavailable('The audio track could not be read.'));
    }
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    var mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(ctx.destination);

    var rate = duration > 90 ? 6 : 4;
    var budgetMs = 45000;
    var data = new Float32Array(analyser.fftSize);
    var env = [];
    var peak = 0, clipped = 0, total = 0;
    var covered = 0;

    video.muted = false;
    video.volume = 1;
    video.playbackRate = rate;
    video.currentTime = 0;

    return ctx.resume().catch(function () {}).then(function () {
      return video.play();
    }).then(function () {
      var startWall = performance.now();
      return new Promise(function (resolve) {
        function tick() {
          analyser.getFloatTimeDomainData(data);
          var s = 0;
          for (var i = 0; i < data.length; i++) {
            var v = data[i];
            s += v * v;
            var a = Math.abs(v);
            if (a > peak) peak = a;
            if (a > 0.988) clipped++;
            total++;
          }
          env.push(U.dbfs(Math.sqrt(s / data.length)));
          covered = video.currentTime;
          var timedOut = performance.now() - startWall > budgetMs;
          if (video.ended || video.currentTime >= duration - 0.1 || timedOut) {
            video.pause();
            video.playbackRate = 1;
            video.muted = true;
            resolve(timedOut && covered < duration - 0.5);
          } else {
            requestAnimationFrame(tick);
          }
        }
        requestAnimationFrame(tick);
      });
    }).then(function (partial) {
      try { ctx.close(); } catch (e) {}
      if (!env.length) return unavailable('No audio samples could be read.');
      var result = summarize(env, peak, clipped / Math.max(1, total), covered, null, partial);
      // Windows here are frame-paced at N× speed, so map them onto real time.
      result.envelopeStep = covered / Math.max(1, env.length);
      return result;
    }).catch(function () {
      try { ctx.close(); } catch (e) {}
      video.muted = true;
      video.playbackRate = 1;
      return unavailable('The audio track could not be played back for analysis.');
    });
  }

  function analyze(file, video, duration) {
    return decodeFile(file).then(function (result) {
      if (result) return result;
      return scanElement(video, duration);
    });
  }

  return { analyze: analyze };
})();
