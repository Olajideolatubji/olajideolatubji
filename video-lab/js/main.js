/* Controller: wires the upload, the analysis run, the report, and the studio. */
(function () {
  var U = VL.util;
  var $ = U.$;

  var app = {
    file: null,
    analysis: null,
    evaluation: null,
    state: null,
    stage: null,
    stageReady: false,
    playing: false,
    lastBlob: null
  };

  /* ---------------------------------------------------------------- flow */

  function show(id, visible) {
    var node = $(id);
    if (node) node.hidden = !visible;
  }

  function fail(message) {
    var box = $('#error');
    box.textContent = message;
    box.hidden = false;
    show('#progress-section', false);
  }

  function setProgress(pct, note) {
    $('#progress-bar').style.width = Math.round(pct * 100) + '%';
    if (note) $('#progress-note').textContent = note;
  }

  function handleFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('video') !== 0 && !/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name)) {
      fail('That does not look like a video file.');
      return;
    }
    app.file = file;
    $('#error').hidden = true;
    show('#upload-section', false);
    show('#report-section', false);
    show('#studio-section', false);
    show('#progress-section', true);
    $('#restart').hidden = false;
    $('#progress-title').textContent = 'Analysing ' + file.name;
    setProgress(0.02, 'Decoding frames…');

    var presetKey = $('#preset').value;
    var base;

    VL.analyze.run(file, function (p) {
      setProgress(0.05 + p * 0.6, 'Measuring frames…');
    }).then(function (result) {
      base = result;
      setProgress(0.7, 'Reading the audio track…');
      return VL.audio.analyze(file, base.video, base.meta.duration);
    }).then(function (audio) {
      setProgress(0.9, 'Scoring…');
      var derived = VL.analyze.derive(base);
      var analysis = {
        base: base,
        derived: derived,
        audio: audio,
        deadZones: VL.analyze.findDeadZones(base, derived, audio),
        thumbnails: VL.analyze.pickThumbnails(base)
      };
      app.analysis = analysis;
      // Exposed so the raw measurements can be inspected from the console.
      window.videoLabAnalysis = analysis;
      app.evaluation = VL.score.evaluate(analysis, presetKey);
      app.state = VL.editor.defaultState(analysis, app.evaluation);
      setProgress(1, 'Done.');
      return U.sleep(120);
    }).then(function () {
      show('#progress-section', false);
      renderReport();
      setupStudio();
      show('#report-section', true);
      show('#studio-section', true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) {
      console.error(err);
      fail(err && err.message ? err.message : 'Something went wrong reading that file.');
    });
  }

  /* -------------------------------------------------------------- report */

  function scoreColor(score) {
    if (score >= 75) return 'var(--accent)';
    if (score >= 50) return 'var(--warn)';
    return 'var(--bad)';
  }

  function verdictFor(score) {
    if (score >= 85) return 'This is already strong.';
    if (score >= 70) return 'Solid — a few fixes away from standing out.';
    if (score >= 55) return 'Watchable, but it will get scrolled past.';
    if (score >= 40) return 'The idea may be fine; the execution is losing people.';
    return 'This is fighting itself. Start with the fixes below.';
  }

  function renderReport() {
    var ev = app.evaluation;
    var a = app.analysis;
    var meta = a.base.meta;
    var score = Math.round(ev.overall);

    var circumference = 2 * Math.PI * 86;
    var ring = $('#ring-value');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - score / 100);
    ring.style.stroke = scoreColor(score);
    $('#score-number').textContent = score;
    $('#verdict').textContent = verdictFor(score);
    $('#verdict-note').textContent = 'Scored for ' + ev.preset.label + ' from ' + meta.sampleCount +
      ' sampled frames' + (a.audio.available ? ' and the decoded audio track' : ' (no readable audio track)') + '.';

    var ceilingGain = Math.max(0, Math.round(ev.ceiling) - score);
    $('#ceiling-now').style.width = score + '%';
    $('#ceiling-gain').style.width = ceilingGain + '%';
    $('#ceiling-text').textContent = ceilingGain > 0
      ? 'Applying everything below puts this at roughly ' + Math.round(ev.ceiling) + '/100 (+' + ceilingGain + ').'
      : 'There is little left on the table for this format.';

    var facts = [
      ['Runtime', U.fmtTime(meta.duration)],
      ['Resolution', meta.width + '×' + meta.height],
      ['Aspect', meta.aspectLabel],
      ['Cuts', a.derived.cuts.length + ' (' + a.derived.cutsPerMin.toFixed(1) + '/min)'],
      ['Dead zones', a.deadZones.length ? a.deadZones.length + ' · ' +
        a.deadZones.reduce(function (s, z) { return s + (z.end - z.start); }, 0).toFixed(1) + 's' : 'none'],
      ['Audio level', a.audio.available ? a.audio.loudnessDb.toFixed(1) + ' dBFS' : '—'],
      ['File size', U.fmtBytes(meta.size)]
    ];
    var dl = $('#facts');
    dl.innerHTML = '';
    facts.forEach(function (f) {
      dl.appendChild(U.el('div', null, [
        U.el('dt', { text: f[0] }),
        U.el('dd', { text: f[1] })
      ]));
    });

    renderRecs();
    renderCategories();
    renderThumbs();
    drawTimeline();
  }

  function renderRecs() {
    var list = $('#recs');
    list.innerHTML = '';
    var ev = app.evaluation;
    if (!ev.recs.length) {
      list.appendChild(U.el('li', { class: 'rec low' }, [
        U.el('div', { class: 'rec-body' }, [
          U.el('h3', { text: 'Nothing measurable is holding this back.' }),
          U.el('p', { text: 'Every category scored inside its target band for this format.' })
        ])
      ]));
      return;
    }
    ev.recs.forEach(function (rec) {
      var body = U.el('div', { class: 'rec-body' }, [
        U.el('h3', { text: rec.title }),
        U.el('p', { text: rec.why }),
        U.el('p', { class: 'how', text: rec.how }),
        U.el('div', { class: 'rec-meta' }, [
          U.el('span', { class: 'pill gain', text: '+' + rec.gain.toFixed(1) + ' pts' }),
          U.el('span', { class: 'pill', text: rec.category })
        ])
      ]);
      var item = U.el('li', { class: 'rec ' + rec.severity, 'data-rec': rec.id }, [body]);
      if (rec.action) {
        var btn = U.el('button', {
          class: 'ghost small',
          text: 'Apply',
          onclick: function () {
            applyAction(rec.action);
            item.classList.add('applied');
            btn.textContent = 'Applied';
            btn.disabled = true;
            $('#studio-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        item.appendChild(btn);
      }
      list.appendChild(item);
    });
  }

  function renderCategories() {
    var wrap = $('#categories');
    wrap.innerHTML = '';
    app.evaluation.categories.forEach(function (c) {
      var value = c.score === null ? '—' : Math.round(c.score);
      var card = U.el('div', { class: 'card' }, [
        U.el('div', { class: 'card-head' }, [
          U.el('h3', { text: c.label }),
          U.el('span', { class: 'card-score', text: String(value) })
        ]),
        (function () {
          var bar = U.el('div', { class: 'bar' }, [U.el('div', { class: 'bar-fill' })]);
          var fill = bar.firstChild;
          fill.style.width = (c.score === null ? 0 : c.score) + '%';
          fill.style.background = scoreColor(c.score === null ? 0 : c.score);
          return bar;
        })()
      ]);
      card.querySelector('.card-score').style.color = scoreColor(c.score === null ? 0 : c.score);
      c.metrics.forEach(function (m) {
        card.appendChild(U.el('div', { class: 'metric' }, [
          U.el('span', { text: m.label }),
          U.el('span', { class: m.good ? 'good' : 'bad', text: String(m.value) })
        ]));
      });
      card.appendChild(U.el('div', { class: 'metric' }, [
        U.el('span', { text: 'Weight in the score' }),
        U.el('span', { text: Math.round(c.weight * 100) + '%' })
      ]));
      wrap.appendChild(card);
    });
  }

  function renderThumbs() {
    var wrap = $('#thumbs');
    wrap.innerHTML = '';
    app.analysis.thumbnails.forEach(function (t, i) {
      var fig = U.el('figure', { class: 'thumb' }, [
        U.el('img', { src: t.url, alt: 'Frame at ' + U.fmtTime(t.t) }),
        U.el('figcaption', null, [
          U.el('span', { text: U.fmtTime(t.t) }),
          U.el('span', { text: i === 0 ? 'best' : '#' + (i + 1) })
        ])
      ]);
      fig.addEventListener('click', function () {
        seekStage(t.t);
        $('#studio-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      wrap.appendChild(fig);
    });
  }

  function drawTimeline() {
    var canvas = $('#timeline');
    var a = app.analysis;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 900;
    var cssH = 180;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var duration = a.base.meta.duration;
    var x = function (t) { return (t / duration) * cssW; };
    var padTop = 22, padBottom = 22;
    var h = cssH - padTop - padBottom;

    // Hook window
    var hookEnd = Math.min(app.evaluation.preset.hookWindow, duration);
    ctx.fillStyle = 'rgba(43,58,92,0.55)';
    ctx.fillRect(0, padTop, x(hookEnd), h);

    // Dead zones
    ctx.fillStyle = 'rgba(122,36,70,0.42)';
    a.deadZones.forEach(function (z) {
      ctx.fillRect(x(z.start), padTop, Math.max(1.5, x(z.end) - x(z.start)), h);
    });

    // Audio envelope
    if (a.audio.available && a.audio.envelope.length) {
      var step = a.audio.envelopeStep || 0.05;
      ctx.beginPath();
      ctx.moveTo(0, padTop + h);
      for (var i = 0; i < a.audio.envelope.length; i++) {
        var t = i * step;
        if (t > duration) break;
        var db = Math.max(-60, Math.min(0, a.audio.envelope[i]));
        var v = (db + 60) / 60;
        ctx.lineTo(x(t), padTop + h - v * h * 0.92);
      }
      ctx.strokeStyle = 'rgba(122,162,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Movement
    var motion = a.derived.motion;
    var maxMotion = Math.max.apply(null, motion) || 1;
    ctx.beginPath();
    ctx.moveTo(0, padTop + h);
    a.base.frames.forEach(function (f, i) {
      var v = motion[i] / maxMotion;
      ctx.lineTo(x(f.t), padTop + h - v * h * 0.9);
    });
    ctx.lineTo(cssW, padTop + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(92,242,176,0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(92,242,176,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Cuts
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    a.derived.cuts.forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(x(c), padTop - 6);
      ctx.lineTo(x(c), padTop + 8);
      ctx.stroke();
    });

    // Time labels
    ctx.fillStyle = 'rgba(153,161,181,0.9)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    var marks = 6;
    for (var m = 0; m <= marks; m++) {
      var tt = (duration / marks) * m;
      var tx = Math.min(cssW - 26, Math.max(2, x(tt) - 12));
      ctx.fillText(U.fmtTime(tt), tx, cssH - 16);
    }

    canvas.onclick = function (e) {
      var rect = canvas.getBoundingClientRect();
      var t = ((e.clientX - rect.left) / rect.width) * duration;
      seekStage(t);
      $('#studio-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  /* -------------------------------------------------------------- studio */

  function setupStudio() {
    var meta = app.analysis.base.meta;

    if (app.stage && app.stage.parentNode) app.stage.parentNode.removeChild(app.stage);
    var v = document.createElement('video');
    v.src = app.analysis.base.url;
    v.playsInline = true;
    v.muted = true;
    v.preload = 'auto';
    v.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none');
    document.body.appendChild(v);
    app.stage = v;
    app.stageReady = false;

    U.once(v, 'loadeddata').then(function () {
      app.stageReady = true;
      v.currentTime = app.state.trimIn;
      resizePreview();
      requestAnimationFrame(previewLoop);
    }).catch(function () {});

    bindControls();
    syncControls();
    updateOutputNote();
  }

  function resizePreview() {
    var meta = app.analysis.base.meta;
    var out = VL.editor.outputSize(meta, app.state);
    var canvas = $('#preview');
    if (canvas.width !== out.w || canvas.height !== out.h) {
      canvas.width = out.w;
      canvas.height = out.h;
    }
    return out;
  }

  function previewLoop() {
    if (!app.stage) return;
    var v = app.stage;
    var meta = app.analysis.base.meta;
    var state = app.state;
    var out = { w: $('#preview').width, h: $('#preview').height };
    var ctx = $('#preview').getContext('2d');

    if (app.playing) {
      if (v.currentTime >= state.trimOut - 0.03) {
        v.pause();
        app.playing = false;
        $('#play').textContent = '▶';
        v.currentTime = state.trimIn;
      } else {
        var wanted = (state.speedDeadZones && VL.editor.inDeadZone(app.analysis.deadZones, v.currentTime))
          ? state.deadSpeed : 1;
        if (Math.abs(v.playbackRate - wanted) > 0.01) v.playbackRate = wanted;
      }
    }

    VL.editor.drawFrame(ctx, v, meta, state, app.analysis.derived.cuts, v.currentTime, out);

    var span = Math.max(0.001, state.trimOut - state.trimIn);
    var p = U.clamp((v.currentTime - state.trimIn) / span, 0, 1);
    var scrub = $('#scrub');
    if (document.activeElement !== scrub) scrub.value = Math.round(p * 1000);
    $('#time-label').textContent = U.fmtTime(v.currentTime) + ' / ' + U.fmtTime(meta.duration);

    requestAnimationFrame(previewLoop);
  }

  function seekStage(t) {
    if (!app.stage) return;
    app.stage.currentTime = U.clamp(t, 0, app.analysis.base.meta.duration - 0.03);
  }

  var ASPECT_NAMES = [
    [0.5625, '9:16'], [0.8, '4:5'], [1, '1:1'], [1.7778, '16:9']
  ];

  function aspectName(state, meta) {
    if (state.aspect === 'source') return meta.aspectLabel;
    for (var i = 0; i < ASPECT_NAMES.length; i++) {
      if (Math.abs(ASPECT_NAMES[i][0] - state.aspect) < 0.02) return ASPECT_NAMES[i][1];
    }
    return state.aspect.toFixed(2) + ':1';
  }

  function updateOutputNote() {
    var meta = app.analysis.base.meta;
    var out = VL.editor.outputSize(meta, app.state);
    var dur = VL.editor.outputDuration(app.state, app.analysis.deadZones);
    $('#output-note').textContent = 'Output: ' + out.w + '×' + out.h + ' · ' + U.fmtTime(dur) +
      ' · ' + aspectName(app.state, meta);
  }

  function onStateChange() {
    resizePreview();
    updateOutputNote();
  }

  /* Slider plumbing: raw slider value -> state value -> label. */
  function bindRange(id, key, toState, format, after) {
    var input = $('#' + id);
    var out = $('#' + id + '-val');
    input.addEventListener('input', function () {
      app.state[key] = toState(Number(input.value));
      if (out) out.textContent = format(app.state[key]);
      if (after) after();
      onStateChange();
    });
  }

  function bindControls() {
    var meta = app.analysis.base.meta;
    var d = meta.duration;

    U.$$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        U.$$('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        U.$$('.tab-body').forEach(function (body) {
          body.hidden = body.getAttribute('data-panel') !== tab.getAttribute('data-tab');
        });
      });
    });

    $('#play').onclick = function () {
      var v = app.stage;
      if (!v) return;
      if (app.playing) {
        v.pause();
        app.playing = false;
        this.textContent = '▶';
      } else {
        if (v.currentTime < app.state.trimIn || v.currentTime >= app.state.trimOut - 0.05) {
          v.currentTime = app.state.trimIn;
        }
        v.muted = false;
        VL.exporter.audioChain(v);
        if (v._vlAudio) {
          v._vlAudio.ctx.resume().catch(function () {});
          v._vlAudio.gain.gain.value = Math.pow(10, (app.state.audioGain || 0) / 20);
        }
        var self = this;
        v.play().then(function () {
          app.playing = true;
          self.textContent = '❚❚';
        }).catch(function () {});
      }
    };

    $('#scrub').addEventListener('input', function () {
      var p = Number(this.value) / 1000;
      seekStage(app.state.trimIn + p * (app.state.trimOut - app.state.trimIn));
    });

    $('#trim-in').addEventListener('input', function () {
      var t = (Number(this.value) / 1000) * d;
      app.state.trimIn = Math.min(t, app.state.trimOut - 0.4);
      $('#trim-in-val').textContent = U.fmtTime(app.state.trimIn);
      seekStage(app.state.trimIn);
      onStateChange();
    });
    $('#trim-out').addEventListener('input', function () {
      var t = (Number(this.value) / 1000) * d;
      app.state.trimOut = Math.max(t, app.state.trimIn + 0.4);
      $('#trim-out-val').textContent = U.fmtTime(app.state.trimOut);
      onStateChange();
    });
    $('#trim-suggest').onclick = function () {
      applyAction({ type: 'hookFix' });
    };

    U.$$('#aspect-chips .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        U.$$('#aspect-chips .chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        var val = chip.getAttribute('data-aspect');
        app.state.aspect = val === 'source' ? 'source' : Number(val);
        onStateChange();
      });
    });

    bindRange('zoom', 'zoom', function (v) { return v / 100; }, function (v) { return v.toFixed(2) + '×'; });
    bindRange('panx', 'panX', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('pany', 'panY', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('brightness', 'brightness', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('contrast', 'contrast', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('saturate', 'saturate', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('warmth', 'warmth', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('vignette', 'vignette', function (v) { return v / 100; }, function (v) { return v.toFixed(2); });
    bindRange('punch-strength', 'punchStrength', function (v) { return v / 100; },
      function (v) { return Math.round(v * 100) + '%'; });
    bindRange('speed', 'deadSpeed', function (v) { return v / 100; }, function (v) { return v.toFixed(1) + '×'; });
    bindRange('gain', 'audioGain', function (v) { return v / 10; }, function (v) {
      return (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB';
    }, function () {
      var v = app.stage;
      if (v && v._vlAudio) v._vlAudio.gain.gain.value = Math.pow(10, app.state.audioGain / 20);
    });

    $('#look-auto').onclick = function () {
      applyAction({ type: 'exposure' });
      applyAction({ type: 'contrast' });
      applyAction({ type: 'colorBoost' });
    };

    $('#punch').addEventListener('change', function () {
      app.state.punchIns = this.checked;
      onStateChange();
    });
    $('#speedup').addEventListener('change', function () {
      app.state.speedDeadZones = this.checked;
      onStateChange();
    });
    $('#progressbar').addEventListener('change', function () {
      app.state.progressBar = this.checked;
      onStateChange();
    });

    $('#hook-text').addEventListener('input', function () {
      app.state.hookText = this.value;
    });

    $('#add-caption').onclick = function () {
      var t = app.stage ? app.stage.currentTime : app.state.trimIn;
      app.state.captions.push({
        t0: t,
        t1: Math.min(app.state.trimOut, t + 2.5),
        text: ''
      });
      renderCaptions();
    };

    $('#apply-all').onclick = function () {
      var seen = {};
      app.evaluation.recs.forEach(function (r) {
        if (r.action && !seen[r.action.type]) {
          seen[r.action.type] = true;
          applyAction(r.action);
        }
      });
      U.$$('.rec').forEach(function (el) { el.classList.add('applied'); });
      U.$$('.rec button').forEach(function (b) { b.textContent = 'Applied'; b.disabled = true; });
      $('#studio-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    $('#normalize').onclick = function () { applyAction({ type: 'normalizeAudio' }); };

    $('#export-video').onclick = runExport;
    $('#export-cover').onclick = exportCover;
    $('#export-report').onclick = exportReport;
    $('#restart').onclick = function () { window.location.reload(); };

    renderHookTemplates();
    renderCaptions();

    var au = app.analysis.audio;
    $('#audio-note').textContent = au.available
      ? 'Measured at ' + au.loudnessDb.toFixed(1) + ' dBFS with peaks at ' + au.peakDb.toFixed(1) +
        ' dBFS. Target for ' + app.evaluation.preset.label + ' is ' + app.evaluation.preset.loudness + ' dBFS.'
      : 'No audio track could be read' + (au.reason ? ': ' + au.reason : '.') + ' Gain will have no effect.';

    $('#pace-note').textContent = app.analysis.deadZones.length
      ? app.analysis.deadZones.length + ' dead zone(s) detected. Speeding through them cuts ' +
        (app.state.trimOut - app.state.trimIn - VL.editor.outputDuration(
          Object.assign({}, app.state, { speedDeadZones: true }), app.analysis.deadZones)).toFixed(1) + 's.'
      : 'No dead zones detected — nothing to speed through.';
  }

  function renderHookTemplates() {
    var wrap = $('#hook-templates');
    wrap.innerHTML = '';
    app.evaluation.hookTemplates.forEach(function (tpl) {
      wrap.appendChild(U.el('button', {
        class: 'chip',
        text: tpl,
        onclick: function () {
          $('#hook-text').value = tpl;
          app.state.hookText = tpl;
        }
      }));
    });
  }

  function renderCaptions() {
    var wrap = $('#captions');
    wrap.innerHTML = '';
    app.state.captions.forEach(function (cap, i) {
      var text = U.el('input', { type: 'text', value: cap.text, placeholder: 'Caption text' });
      text.addEventListener('input', function () { cap.text = text.value; });
      var del = U.el('button', {
        class: 'ghost small', text: '✕', onclick: function () {
          app.state.captions.splice(i, 1);
          renderCaptions();
        }
      });
      var times = U.el('div', { class: 'times' }, [
        U.el('span', { text: U.fmtTime(cap.t0) + ' → ' + U.fmtTime(cap.t1) })
      ]);
      wrap.appendChild(U.el('div', { class: 'caption-row' }, [text, del, times]));
    });
  }

  /* One-click fixes. Every branch writes real numbers derived from the analysis. */
  function applyAction(action) {
    if (!action) return;
    var f = app.evaluation.fixes;
    var s = app.state;
    var a = app.analysis;

    switch (action.type) {
      case 'hookFix':
        s.trimIn = Math.min(f.suggestedStart, s.trimOut - 0.5);
        s.punchIns = true;
        break;
      case 'exposure':
        s.brightness = f.brightness;
        break;
      case 'contrast':
        s.contrast = f.contrast;
        break;
      case 'colorBoost':
        s.saturate = f.saturate;
        if (f.saturate > 1) s.warmth = Math.max(s.warmth, 0.1);
        break;
      case 'reframe':
        s.aspect = f.aspect;
        break;
      case 'punchIns':
        s.punchIns = true;
        break;
      case 'speedDeadZones':
        s.speedDeadZones = true;
        break;
      case 'trimLength':
        s.trimIn = Math.min(f.suggestedStart, s.trimOut - 0.5);
        s.trimOut = Math.min(a.base.meta.duration, s.trimIn + (f.suggestedEnd - f.suggestedStart));
        break;
      case 'trimSilentStart':
        s.trimIn = firstLoudMoment();
        break;
      case 'normalizeAudio':
        s.audioGain = f.audioGain;
        break;
      case 'reduceGain':
        s.audioGain = Math.min(0, -1 - (a.audio.peakDb || 0));
        break;
    }
    syncControls();
    onStateChange();
    if (app.stage && (action.type === 'hookFix' || action.type === 'trimLength' || action.type === 'trimSilentStart')) {
      seekStage(s.trimIn);
    }
  }

  function firstLoudMoment() {
    var au = app.analysis.audio;
    if (!au.available || !au.envelope.length) return 0;
    var threshold = au.loudnessDb - 10;
    var step = au.envelopeStep || 0.05;
    for (var i = 0; i < au.envelope.length; i++) {
      if (au.envelope[i] > threshold) return Math.max(0, i * step - 0.15);
    }
    return 0;
  }

  /* Pushes state back into every control so applied fixes are visible. */
  function syncControls() {
    var s = app.state;
    var d = app.analysis.base.meta.duration;

    $('#trim-in').value = Math.round((s.trimIn / d) * 1000);
    $('#trim-out').value = Math.round((s.trimOut / d) * 1000);
    $('#trim-in-val').textContent = U.fmtTime(s.trimIn);
    $('#trim-out-val').textContent = U.fmtTime(s.trimOut);

    U.$$('#aspect-chips .chip').forEach(function (chip) {
      var val = chip.getAttribute('data-aspect');
      var match = (val === 'source' && s.aspect === 'source') ||
        (val !== 'source' && s.aspect !== 'source' && Math.abs(Number(val) - s.aspect) < 0.02);
      chip.classList.toggle('active', match);
    });

    function set(id, value, label, fmt) {
      $('#' + id).value = value;
      if ($('#' + label)) $('#' + label).textContent = fmt;
    }
    set('zoom', Math.round(s.zoom * 100), 'zoom-val', s.zoom.toFixed(2) + '×');
    set('panx', Math.round(s.panX * 100), 'panx-val', s.panX.toFixed(2));
    set('pany', Math.round(s.panY * 100), 'pany-val', s.panY.toFixed(2));
    set('brightness', Math.round(s.brightness * 100), 'brightness-val', s.brightness.toFixed(2));
    set('contrast', Math.round(s.contrast * 100), 'contrast-val', s.contrast.toFixed(2));
    set('saturate', Math.round(s.saturate * 100), 'saturate-val', s.saturate.toFixed(2));
    set('warmth', Math.round(s.warmth * 100), 'warmth-val', s.warmth.toFixed(2));
    set('vignette', Math.round(s.vignette * 100), 'vignette-val', s.vignette.toFixed(2));
    set('punch-strength', Math.round(s.punchStrength * 100), 'punch-val', Math.round(s.punchStrength * 100) + '%');
    set('speed', Math.round(s.deadSpeed * 100), 'speed-val', s.deadSpeed.toFixed(1) + '×');
    set('gain', Math.round(s.audioGain * 10), 'gain-val', (s.audioGain >= 0 ? '+' : '') + s.audioGain.toFixed(1) + ' dB');

    $('#punch').checked = s.punchIns;
    $('#speedup').checked = s.speedDeadZones;
    $('#progressbar').checked = s.progressBar;
    $('#hook-text').value = s.hookText;

    var v = app.stage;
    if (v && v._vlAudio) v._vlAudio.gain.gain.value = Math.pow(10, s.audioGain / 20);
  }

  /* -------------------------------------------------------------- export */

  function setExporting(busy) {
    ['export-video', 'export-cover', 'export-report'].forEach(function (id) {
      $('#' + id).disabled = busy;
    });
    $('#export-bar-wrap').hidden = !busy;
  }

  function runExport() {
    if (!app.stage) return;
    if (app.playing) {
      app.stage.pause();
      app.playing = false;
      $('#play').textContent = '▶';
    }
    setExporting(true);
    $('#export-result').hidden = true;
    var dur = VL.editor.outputDuration(app.state, app.analysis.deadZones);
    $('#export-note').textContent = 'Recording in real time — about ' + Math.ceil(dur) + 's. Leave this tab in front.';

    VL.exporter.render({
      video: app.stage,
      meta: app.analysis.base.meta,
      state: app.state,
      cuts: app.analysis.derived.cuts,
      deadZones: app.analysis.deadZones,
      onProgress: function (p) { $('#export-bar').style.width = Math.round(p * 100) + '%'; }
    }).then(function (result) {
      setExporting(false);
      app.lastBlob = result.blob;
      var name = app.analysis.base.meta.name.replace(/\.[^.]+$/, '') + '-videolab.webm';
      var link = $('#download-link');
      link.textContent = 'Download the new cut (' + U.fmtBytes(result.blob.size) + ')';
      link.onclick = function () { U.download(result.blob, name); };
      $('#export-result').hidden = false;
      $('#export-note').textContent = 'Exported at ' + result.width + '×' + result.height + '. WebM plays on every ' +
        'platform upload form; convert to MP4 if you need it for offline editing.';
      $('#rescore').onclick = function () {
        var f = new File([result.blob], name, { type: result.blob.type });
        handleFile(f);
      };
    }).catch(function (err) {
      console.error(err);
      setExporting(false);
      fail(err && err.message ? err.message : 'Export failed.');
    });
  }

  function exportCover() {
    if (!app.stage) return;
    var best = app.analysis.thumbnails[0];
    var t = app.stage.currentTime > app.state.trimIn ? app.stage.currentTime : (best ? best.t : 0);
    setExporting(true);
    VL.exporter.stillFrame({
      video: app.stage,
      meta: app.analysis.base.meta,
      state: app.state,
      time: t,
      text: app.state.hookText
    }).then(function (blob) {
      setExporting(false);
      if (blob) U.download(blob, app.analysis.base.meta.name.replace(/\.[^.]+$/, '') + '-cover.png');
    }).catch(function () { setExporting(false); });
  }

  function exportReport() {
    var md = VL.exporter.reportMarkdown(app.analysis, app.evaluation, app.state);
    U.download(new Blob([md], { type: 'text/markdown' }),
      app.analysis.base.meta.name.replace(/\.[^.]+$/, '') + '-report.md');
  }

  /* --------------------------------------------------------------- init */

  function init() {
    var drop = $('#dropzone');
    var input = $('#file-input');

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) handleFile(input.files[0]);
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    $('#preset').addEventListener('change', function () {
      if (!app.analysis) return;
      app.evaluation = VL.score.evaluate(app.analysis, this.value);
      renderReport();
      renderHookTemplates();
    });

    window.addEventListener('resize', function () {
      if (app.analysis) drawTimeline();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
