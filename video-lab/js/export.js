/* Export. Records the same draw pipeline the preview uses, in real time, with
   the audio routed through a gain stage so loudness fixes land in the file. */
window.VL = window.VL || {};

VL.exporter = (function () {
  var U = VL.util;

  function pickMime() {
    var candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    if (typeof MediaRecorder === 'undefined') return null;
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  /* One AudioContext per media element — the browser will not let us make a
     second MediaElementSource for the same element. */
  function audioChain(video) {
    if (video._vlAudio) return video._vlAudio;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      var ctx = new Ctx();
      var source = ctx.createMediaElementSource(video);
      var gain = ctx.createGain();
      var dest = ctx.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(dest);
      gain.connect(ctx.destination);
      video._vlAudio = { ctx: ctx, source: source, gain: gain, dest: dest };
      return video._vlAudio;
    } catch (e) {
      return null;
    }
  }

  function render(opts) {
    var video = opts.video;
    var meta = opts.meta;
    var state = opts.state;
    var cuts = opts.cuts || [];
    var zones = opts.deadZones || [];
    var onProgress = opts.onProgress || function () {};

    var mime = pickMime();
    if (mime === null) {
      return Promise.reject(new Error('This browser cannot record video. Chrome, Edge or Firefox will work.'));
    }

    var out = VL.editor.outputSize(meta, state);
    var canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    var ctx = canvas.getContext('2d');
    if (!canvas.captureStream) {
      return Promise.reject(new Error('This browser cannot capture a canvas stream.'));
    }

    var stream = canvas.captureStream(30);
    var chain = audioChain(video);
    if (chain) {
      chain.gain.gain.value = Math.pow(10, (state.audioGain || 0) / 20);
      chain.dest.stream.getAudioTracks().forEach(function (track) {
        stream.addTrack(track);
      });
    }

    var chunks = [];
    var recorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
    } catch (e) {
      return Promise.reject(new Error('Recording failed to start: ' + e.message));
    }
    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    var span = Math.max(0.05, state.trimOut - state.trimIn);
    var finished = false;

    return (chain ? chain.ctx.resume().catch(function () {}) : Promise.resolve())
      .then(function () {
        video.pause();
        video.currentTime = state.trimIn;
        return U.once(video, 'seeked');
      })
      .then(function () {
        video.playbackRate = 1;
        video.muted = false;
        return video.play();
      })
      .then(function () {
        recorder.start(250);
        return new Promise(function (resolve, reject) {
          recorder.onerror = function (e) { reject(e.error || new Error('Recording error')); };

          function stop() {
            if (finished) return;
            finished = true;
            video.pause();
            video.playbackRate = 1;
            try { recorder.stop(); } catch (e) {}
          }

          recorder.onstop = function () {
            resolve(new Blob(chunks, { type: mime || 'video/webm' }));
          };

          function tick() {
            if (finished) return;
            var t = video.currentTime;
            if (t >= state.trimOut - 0.02 || video.ended) {
              // Hold the last frame briefly so the final frame is not dropped.
              VL.editor.drawFrame(ctx, video, meta, state, cuts, Math.min(t, state.trimOut), out);
              setTimeout(stop, 180);
              return;
            }
            var wanted = (state.speedDeadZones && VL.editor.inDeadZone(zones, t)) ? state.deadSpeed : 1;
            if (Math.abs(video.playbackRate - wanted) > 0.01) video.playbackRate = wanted;

            VL.editor.drawFrame(ctx, video, meta, state, cuts, t, out);
            onProgress(U.clamp((t - state.trimIn) / span, 0, 1));
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      })
      .then(function (blob) {
        video.muted = true;
        return { blob: blob, mime: mime || 'video/webm', width: out.w, height: out.h };
      });
  }

  function stillFrame(opts) {
    var video = opts.video;
    var meta = opts.meta;
    var state = opts.state;
    var out = VL.editor.outputSize(meta, state);
    var canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    var ctx = canvas.getContext('2d');

    var wasPaused = video.paused;
    video.pause();
    return new Promise(function (resolve) {
      function draw() {
        // Punch-ins and captions are skipped so the still is a clean cover frame.
        var stillState = Object.assign({}, state, {
          punchIns: false, progressBar: false, captions: [], hookText: opts.text || ''
        });
        VL.editor.drawFrame(ctx, video, meta, stillState, [], video.currentTime, out);
        canvas.toBlob(function (blob) {
          if (!wasPaused) video.play();
          resolve(blob);
        }, 'image/png');
      }
      if (Math.abs(video.currentTime - opts.time) < 0.05) {
        requestAnimationFrame(draw);
      } else {
        U.once(video, 'seeked').then(function () { requestAnimationFrame(draw); });
        video.currentTime = opts.time;
      }
    });
  }

  function reportMarkdown(analysis, evaluation, state) {
    var meta = analysis.base.meta;
    var lines = [];
    lines.push('# Video Lab report — ' + meta.name);
    lines.push('');
    lines.push('- Preset: ' + evaluation.preset.label);
    lines.push('- Score: **' + Math.round(evaluation.overall) + '/100** (ceiling with the fixes below: ~' +
               Math.round(evaluation.ceiling) + ')');
    lines.push('- Source: ' + meta.width + '×' + meta.height + ' (' + meta.aspectLabel + '), ' +
               U.fmtTime(meta.duration) + ', ' + U.fmtBytes(meta.size));
    lines.push('- Measured from ' + meta.sampleCount + ' sampled frames and ' +
               (analysis.audio && analysis.audio.available ? 'the decoded audio track' : 'no readable audio'));
    lines.push('');
    lines.push('## Scores');
    lines.push('');
    lines.push('| Category | Score | Weight |');
    lines.push('| --- | --- | --- |');
    evaluation.categories.forEach(function (c) {
      lines.push('| ' + c.label + ' | ' + (c.score === null ? 'n/a' : Math.round(c.score)) + ' | ' +
                 Math.round(c.weight * 100) + '% |');
    });
    lines.push('');
    lines.push('## What to change, in order of impact');
    lines.push('');
    evaluation.recs.forEach(function (r, i) {
      lines.push((i + 1) + '. **' + r.title + '** (+' + r.gain.toFixed(1) + ' pts)');
      lines.push('   - Why: ' + r.why);
      lines.push('   - Fix: ' + r.how);
    });
    if (analysis.deadZones.length) {
      lines.push('');
      lines.push('## Dead zones');
      lines.push('');
      analysis.deadZones.forEach(function (z) {
        lines.push('- ' + U.fmtTime(z.start) + ' → ' + U.fmtTime(z.end) +
                   ' (' + (z.end - z.start).toFixed(1) + 's, ' + z.reason + ')');
      });
    }
    if (state) {
      lines.push('');
      lines.push('## Edit applied');
      lines.push('');
      lines.push('- Trim: ' + U.fmtTime(state.trimIn) + ' → ' + U.fmtTime(state.trimOut));
      lines.push('- Framing: ' + (state.aspect === 'source' ? 'source aspect' : evaluation.preset.aspectName) +
                 ', zoom ' + state.zoom.toFixed(2) + '×');
      lines.push('- Colour: brightness ' + state.brightness.toFixed(2) + ', contrast ' + state.contrast.toFixed(2) +
                 ', saturation ' + state.saturate.toFixed(2));
      lines.push('- Audio gain: ' + (state.audioGain >= 0 ? '+' : '') + state.audioGain.toFixed(1) + ' dB');
      lines.push('- Punch-ins: ' + (state.punchIns ? 'on' : 'off') +
                 ', dead-zone speed-up: ' + (state.speedDeadZones ? state.deadSpeed + '×' : 'off'));
    }
    lines.push('');
    return lines.join('\n');
  }

  return { render: render, stillFrame: stillFrame, reportMarkdown: reportMarkdown, audioChain: audioChain };
})();
