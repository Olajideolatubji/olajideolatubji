/* Wiring. Holds the current document and timeline, and keeps the panels in
 * step with them. Every panel reads from `state` — nothing derives anything a
 * second time, so what the preview shows, what preflight measured and what the
 * renderer writes are the same object. */

(() => {

  const $ = id => document.getElementById(id);

  const state = {
    doc: null,
    tl: null,
    pack: null,
    playing: false,
    t: 0,
    rendering: false,
    cancel: false,
    styleId: 'retention',
    lastResult: null
  };

  const SAMPLE = `# Why your first thirty seconds decide everything

## The drop
Where does everybody go?

Every video you have ever uploaded lost most of its audience before the thirty second mark. That is not a failure of your content. It is the shape of the platform.

The average viewer gives a new video about four seconds before deciding whether to stay. 73% of the people who click will be gone before the first minute is out, and almost all of that loss happens in one narrow window near the start.

So the question is not how to make a better video. It is what has to happen in those four seconds.

## What actually holds them
Three things do the work, and none of them are production value.

- A question the viewer wants answered
- A picture that changes before they get bored of it
- A promise that the answer is coming, but not yet

The first one is a hook. The second one is pacing. The third one is an open loop, and it is the one almost nobody plants on purpose.

An open loop is a promise made early and paid off late. Say the thing you are building toward in the first minute, then do not deliver it until the end. The viewer is now holding a question they want closed, and closing it is worth more to them than whatever the next thumbnail is offering.

## The part nobody does
Watch the last ten seconds of your own videos.

Most of them end. The narration stops, the music fades, and the viewer is handed back to the feed with nothing to do. That is the single most expensive moment in the whole runtime, and it is usually the least edited.

End on the question you opened with, answered. The video becomes a loop instead of a line, and the session continues instead of ending.

So: what has to happen in your first four seconds?`;

  /* Panels -------------------------------------------------------------- */

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* Style picker. Each card renders one real frame from that style so the
   * choice is made on what it looks like rather than on the name. */
  function buildStylePicker() {
    const host = $('styles');
    host.textContent = '';

    ML.styles.list.forEach(style => {
      const card = ML.el('button', { class: 'style-card' + (style.id === state.styleId ? ' active' : ''), type: 'button' }, [
        ML.el('canvas'),
        ML.el('div', { class: 'sc-body' }, [
          ML.el('h4', { text: style.name }),
          ML.el('p', { class: 'sc-blurb', text: style.blurb }),
          ML.el('p', { class: 'sc-mech', text: style.mechanic }),
          ML.el('p', { class: 'sc-meta', text: `${style.bestFor} · a cut every ${style.sceneSeconds}s` })
        ])
      ]);
      card.addEventListener('click', () => {
        state.styleId = style.id;
        [...host.children].forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        syncAspectDefault(style);
      });
      host.appendChild(card);

      // A one-scene sample timeline, so the thumbnail is the real renderer.
      const sampleDoc = ML.script.parse(
        `${style.name}\nThis is what ${style.name} looks like when your script lands on the screen.`,
        { wpm: 150, sceneSeconds: style.sceneSeconds }
      );
      const sampleTl = ML.timeline.build(sampleDoc, {
        styleId: style.id, aspect: '16:9', quality: 'preview', fps: 30, retention: false, fit: 'natural'
      });
      const cv = card.querySelector('canvas');
      const w = 420, h = Math.round(w * 9 / 16);
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.scale(w / sampleTl.w, h / sampleTl.h);
      if (sampleTl.scenes.length) {
        ML.render.frame(ctx, sampleTl, sampleTl.scenes[0].start + Math.min(1.2, sampleTl.scenes[0].dur * 0.7));
      }
    });
  }

  function syncAspectDefault(style) {
    const sel = $('aspect');
    // Only follow the style's own frame when the user has not overridden it.
    if (!sel.dataset.touched) sel.value = style.aspect;
  }

  function buildAspectSelect() {
    const sel = $('aspect');
    sel.textContent = '';
    for (const key in ML.styles.aspects) {
      const a = ML.styles.aspects[key];
      sel.appendChild(ML.el('option', { value: key, text: `${key} — ${a.label}` }));
    }
    sel.value = ML.styles.byId(state.styleId).aspect;
    sel.addEventListener('change', () => { sel.dataset.touched = '1'; });
  }

  /* Build ---------------------------------------------------------------- */

  function currentOptions() {
    const style = ML.styles.byId(state.styleId);
    return {
      styleId: state.styleId,
      aspect: $('aspect').value,
      quality: $('quality').value,
      fps: parseInt($('fps').value, 10),
      wpm: parseInt($('wpm').value, 10),
      sceneSeconds: style.sceneSeconds,
      headlineWords: style.id === 'kinetic' || style.id === 'impact' ? 6 : 8,
      retention: $('retention-devices').checked,
      fit: $('fit').value,
      targetSeconds: parseInt($('target').value, 10)
    };
  }

  function build() {
    showError('');
    const raw = $('script').value.trim();
    if (!raw) return showError('Paste a script first — there is nothing to build from yet.');

    const opts = currentOptions();
    state.doc = ML.script.parse(raw, opts);
    if (!state.doc.beats.length) return showError('That script parsed to nothing. It needs at least one sentence outside a heading.');

    state.tl = ML.timeline.build(state.doc, opts);
    // Park the playhead a beat in rather than on frame zero, so the first
    // thing shown is a card that has finished arriving.
    state.t = Math.min(0.5, state.tl.duration * 0.5);
    state.playing = false;
    state.lastResult = null;

    $('preview-section').hidden = false;
    $('restart').hidden = false;
    $('downloads').hidden = true;
    $('downloads').textContent = '';
    $('ffmpeg-details').hidden = true;

    refreshAll();
    $('preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function refreshAll() {
    sizePreview();
    drawPreview();
    renderSceneList();
    renderBoard();
    runPreflight();
    renderScore();
    renderPackaging();
    renderExportNote();
    renderBridge();

    const tl = state.tl;
    const parts = [
      `${ML.duration(tl.duration)}`,
      `${tl.scenes.length} scenes`,
      `${tl.w}×${tl.h} at ${tl.fps}fps`,
      `${tl.meta.interrupts} pattern interrupts`
    ];
    if (tl.meta.fitNote) parts.push(tl.meta.fitNote);
    $('build-note').textContent = parts.join(' · ');
  }

  /* Preview -------------------------------------------------------------- */

  function sizePreview() {
    const cv = $('preview');
    const tl = state.tl;
    const cssW = cv.parentElement.clientWidth || 640;
    const scale = Math.min(1, cssW / tl.w);
    cv.width = Math.round(tl.w * Math.max(scale, 0.25));
    cv.height = Math.round(tl.h * Math.max(scale, 0.25));
    cv.style.aspectRatio = `${tl.w} / ${tl.h}`;
  }

  function drawPreview() {
    const cv = $('preview');
    const ctx = cv.getContext('2d');
    ctx.setTransform(cv.width / state.tl.w, 0, 0, cv.height / state.tl.h, 0, 0);
    ML.render.frame(ctx, state.tl, state.t);

    $('scrub').value = Math.round((state.t / Math.max(0.001, state.tl.duration)) * 10000);
    $('time-label').textContent = `${ML.mmss(state.t)} / ${ML.mmss(state.tl.duration)}`;
    markActiveScene();
  }

  let rafId = null;
  let lastTick = 0;

  function loop(now) {
    if (!state.playing) return;
    const dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    state.t += dt;
    if (state.t >= state.tl.duration) { state.t = 0; }
    drawPreview();
    rafId = requestAnimationFrame(loop);
  }

  function setPlaying(on) {
    state.playing = on;
    $('play').textContent = on ? '❚❚' : '▶';
    if (on) { lastTick = 0; rafId = requestAnimationFrame(loop); }
    else if (rafId) cancelAnimationFrame(rafId);
  }

  function markActiveScene() {
    const scene = ML.timeline.sceneAt(state.tl, state.t);
    const rows = $('scene-list').children;
    for (const row of rows) {
      row.classList.toggle('active', scene && row.dataset.i === String(scene.i));
    }
  }

  /* A very long timeline has more scenes than a list can usefully hold. The
   * cap keeps the DOM sane and says so rather than silently truncating. */
  const LIST_CAP = 300;
  const BOARD_CAP = 48;

  function renderSceneList() {
    const host = $('scene-list');
    host.textContent = '';
    const scenes = state.tl.scenes;
    const shown = scenes.slice(0, LIST_CAP);

    shown.forEach(s => {
      const flags = [];
      if (s.hook) flags.push('hook');
      if (s.interrupt) flags.push('interrupt');
      if (s.device) flags.push(s.device);
      const row = ML.el('div', { class: 'scene-row', 'data-i': s.i }, [
        ML.el('div', { class: 'sr-time', text: ML.mmss(s.start) }),
        ML.el('div', { class: 'sr-text' }, [
          ML.el('div', { text: s.display || '—' }),
          ML.el('div', { class: 'sr-meta' }, [
            ML.text(`${s.layout} · ${ML.round(s.dur, 1)}s`),
            flags.length ? ML.el('span', { class: 'sr-flag', text: ' · ' + flags.join(' · ') }) : null
          ])
        ])
      ]);
      row.addEventListener('click', () => {
        state.t = s.start + Math.min(0.8, s.dur * 0.4);
        drawPreview();
      });
      host.appendChild(row);
    });

    if (scenes.length > LIST_CAP) {
      host.appendChild(ML.el('div', { class: 'scene-row' }, [
        ML.el('div', { class: 'sr-time', text: '…' }),
        ML.el('div', { class: 'sr-text muted small', text: `${scenes.length - LIST_CAP} more scenes not listed. The full list is in the narration sheet.` })
      ]));
    }
  }

  function renderBoard() {
    const host = $('board');
    host.textContent = '';
    const scenes = state.tl.scenes;
    const step = Math.max(1, Math.ceil(scenes.length / BOARD_CAP));
    const picked = scenes.filter((s, i) => i % step === 0).slice(0, BOARD_CAP);

    $('board-note').textContent = step > 1
      ? `Every ${step}${step === 2 ? 'nd' : step === 3 ? 'rd' : 'th'} scene, ${picked.length} of ${scenes.length}`
      : `${picked.length} scene${picked.length === 1 ? '' : 's'}`;

    for (const s of picked) {
      const cv = ML.render.still(state.tl, s, 320);
      cv.addEventListener('click', () => { state.t = s.start + Math.min(0.8, s.dur * 0.4); drawPreview(); });
      host.appendChild(ML.el('figure', null, [cv, ML.el('figcaption', { text: `${ML.mmss(s.start)} · ${s.layout}` })]));
    }
  }

  /* Preflight ------------------------------------------------------------ */

  function runPreflight() {
    const result = ML.preflight.run(state.tl);
    state.preflight = result;

    const summary = $('preflight-summary');
    summary.textContent = '';
    summary.className = 'verdict ' + (result.ok ? 'pass' : 'fail');
    summary.appendChild(ML.el('strong', {
      text: result.ok
        ? 'Clear to render.'
        : `${result.errors.length} blocking ${result.errors.length === 1 ? 'problem' : 'problems'}.`
    }));
    summary.appendChild(ML.text(result.ok
      ? `${result.warnings.length} thing${result.warnings.length === 1 ? '' : 's'} worth a look, none of which would land as a defect in the file.`
      : 'These would be visible in the output, so the render is held until they are dealt with.'));

    const list = $('findings');
    list.textContent = '';
    [...result.errors, ...result.warnings].slice(0, 20).forEach(f => {
      list.appendChild(ML.el('li', { class: f.level }, [
        ML.el('div', { class: 'f-tag', text: f.level === 'error' ? 'Blocking' : 'Worth a look' }),
        ML.el('div', { class: 'f-msg', text: f.msg }),
        f.detail ? ML.el('div', { class: 'f-detail', text: f.detail }) : null
      ]));
    });
    if (!result.errors.length && !result.warnings.length) {
      list.appendChild(ML.el('li', null, [ML.el('div', { class: 'f-msg', text: 'Nothing flagged.' })]));
    }

    const checks = $('checks');
    checks.textContent = '';
    result.checks.forEach(c => {
      checks.appendChild(ML.el('li', null, [
        ML.el('span', { class: c.pass ? 'ok' : 'no', text: c.pass ? '✓ ' : '✗ ' }),
        ML.text(c.label)
      ]));
    });

    $('render').disabled = !result.ok;
    $('render').textContent = result.ok ? 'Render the video' : 'Fix the blocking problems first';
  }

  /* Score ---------------------------------------------------------------- */

  function renderScore() {
    const s = ML.youtube.score(state.tl);
    state.score = s;

    $('score-number').textContent = s.total;
    $('verdict').textContent = s.verdict;
    const circumference = 2 * Math.PI * 86;
    const ring = $('ring-value');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - s.total / 100);
    ring.style.stroke = s.total >= 80 ? 'var(--accent)' : s.total >= 60 ? 'var(--warn)' : 'var(--bad)';

    const host = $('score-parts');
    host.textContent = '';
    s.parts.forEach(p => {
      host.appendChild(ML.el('div', { class: 'score-part' }, [
        ML.el('div', { class: 'sp-head' }, [
          ML.el('span', { text: p.label }),
          ML.el('span', { class: 'mono', text: `${Math.round(p.score)} / ${p.max}` })
        ]),
        ML.el('div', { class: 'sp-bar' }, [
          ML.el('div', { class: 'sp-fill', style: `width:${(p.score / p.max) * 100}%` })
        ]),
        ML.el('div', { class: 'sp-note', text: p.note })
      ]));
    });
  }

  /* Packaging ------------------------------------------------------------ */

  function renderPackaging() {
    const pack = ML.youtube.pack(state.tl, state.doc);
    state.pack = pack;

    $('chapters-out').textContent = pack.chapters.text || '(no chapters — add "## Heading" lines to the script)';
    $('chapters-note').textContent = pack.chapters.note;
    $('desc-out').textContent = pack.description;
    $('tags-out').textContent = pack.tags.join(', ');

    const titles = $('titles-out');
    titles.textContent = '';
    pack.titles.forEach(t => {
      titles.appendChild(ML.el('li', null, [
        ML.el('div', { class: 't-text', text: t.text }),
        ML.el('div', { class: 't-why', text: t.why }),
        ML.el('div', { class: 't-len', text: `${t.length} characters${t.length > 60 ? ' — will truncate on mobile' : ''}` })
      ]));
    });
  }

  function renderBridge() {
    $('spec-out').textContent = ML.aibridge.json(state.tl, state.doc).slice(0, 4000);
  }

  /* Render --------------------------------------------------------------- */

  async function renderExportNote() {
    const tl = state.tl;
    const hasCodec = typeof VideoEncoder !== 'undefined';
    const bench = await ML.export.benchmark(tl);
    const note = [];

    if (hasCodec) {
      note.push(`Frames are drawn and encoded directly, so this runs as fast as the machine can draw — roughly ${ML.duration(Math.max(2, bench.estimateSeconds))} for a ${ML.duration(tl.duration)} video on this hardware.`);
    } else {
      note.push(`This browser has no WebCodecs support, so the render falls back to recording in real time: a ${ML.duration(tl.duration)} video takes ${ML.duration(tl.duration)}. Chrome or Edge will do it far faster.`);
    }
    note.push(`Output is WebM at ${tl.w}×${tl.h}, ${tl.fps}fps, around ${Math.round(ML.webm.bitrateFor(tl.w, tl.h, tl.fps) / 1e6)} Mbps.`);
    $('render-note').textContent = note.join(' ');
  }

  async function doRender() {
    if (state.rendering) return;
    showError('');
    state.rendering = true;
    state.cancel = false;
    setPlaying(false);

    $('render').hidden = true;
    $('cancel').hidden = false;
    $('render-bar-wrap').hidden = false;
    $('downloads').hidden = true;
    $('downloads').textContent = '';

    const started = performance.now();

    try {
      const result = await ML.export.renderVideo(state.tl, {
        segmentSeconds: parseInt($('segment').value, 10),
        shouldStop: () => state.cancel,
        onProgress: p => {
          $('render-bar').style.width = `${(p.ratio * 100).toFixed(1)}%`;
          const elapsed = (performance.now() - started) / 1000;
          const eta = p.ratio > 0.01 ? (elapsed / p.ratio) - elapsed : null;
          $('render-progress').textContent =
            `${Math.round(p.ratio * 100)}% · ${ML.mmss(p.time)} of ${ML.mmss(state.tl.duration)}` +
            (p.segments > 1 ? ` · part ${p.segment} of ${p.segments}` : '') +
            (eta ? ` · about ${ML.duration(eta)} left` : '');
        }
      });

      if (result.cancelled) {
        $('render-progress').textContent = 'Stopped.';
        return;
      }

      state.lastResult = result;
      const rows = [];
      result.files.forEach(f => rows.push({
        blob: f.blob,
        name: f.name,
        meta: `${ML.mmss(f.from)}–${ML.mmss(f.to)} · ${(f.blob.size / 1e6).toFixed(1)} MB`
      }));

      if ($('want-music').checked) {
        $('render-progress').textContent = 'Rendering the music bed…';
        try {
          const music = await ML.export.renderMusic(state.tl, {});
          rows.push({
            blob: music.blob,
            name: `${ML.export.safeName(state.tl.title)}-music.wav`,
            meta: music.loopable
              ? `${ML.duration(music.seconds)} loop · ${(music.blob.size / 1e6).toFixed(1)} MB · loop it to fill the runtime`
              : `${ML.duration(music.seconds)} · ${(music.blob.size / 1e6).toFixed(1)} MB`
          });
        } catch (err) {
          showError('The video rendered, but the music bed did not: ' + err.message);
        }
      }

      rows.push({
        blob: new Blob([ML.export.narrationSheet(state.tl)], { type: 'text/markdown' }),
        name: `${ML.export.safeName(state.tl.title)}-narration.md`,
        meta: 'every line with the timecode it lands on'
      });

      showDownloads(rows);

      $('ffmpeg-out').textContent = ML.export.ffmpegCommand(result, state.tl, $('want-music').checked);
      $('ffmpeg-details').hidden = false;

      const took = (performance.now() - started) / 1000;
      $('render-progress').textContent =
        `Done in ${ML.duration(took)} — ${ML.round(state.tl.duration / took, 1)}× real time.` +
        (result.realtime ? ' Recorded in real time; WebCodecs was not available.' : '');

    } catch (err) {
      showError('The render failed: ' + (err && err.message ? err.message : String(err)));
      $('render-progress').textContent = '';
    } finally {
      state.rendering = false;
      $('render').hidden = false;
      $('cancel').hidden = true;
    }
  }

  function showDownloads(rows) {
    const host = $('downloads');
    host.textContent = '';
    rows.forEach(r => {
      const btn = ML.el('button', { class: 'primary small', text: 'Download' });
      btn.addEventListener('click', () => ML.download(r.blob, r.name));
      host.appendChild(ML.el('div', { class: 'dl-row' }, [
        ML.el('div', null, [
          ML.el('div', { class: 'dl-name', text: r.name }),
          ML.el('div', { class: 'dl-meta', text: r.meta })
        ]),
        btn
      ]));
    });
    host.hidden = false;
  }

  /* Events --------------------------------------------------------------- */

  function bindRange(id, format) {
    const input = $(id);
    const out = $(id + '-val');
    const sync = () => { out.textContent = format(input.value); };
    input.addEventListener('input', sync);
    sync();
  }

  function init() {
    buildAspectSelect();
    buildStylePicker();

    bindRange('wpm', v => `${v} wpm`);
    bindRange('target', v => ML.duration(parseInt(v, 10)));
    bindRange('segment', v => ML.duration(parseInt(v, 10)));

    $('fit').addEventListener('change', e => {
      $('target-wrap').hidden = e.target.value !== 'target';
    });

    const stats = () => {
      const raw = $('script').value;
      const words = ML.script.countWords(raw);
      const wpm = parseInt($('wpm').value, 10);
      $('script-stats').textContent = words
        ? `${words.toLocaleString()} words · about ${ML.duration((words / wpm) * 60)} read`
        : '0 words';
    };
    $('script').addEventListener('input', stats);
    $('wpm').addEventListener('input', stats);
    stats();

    $('load-sample').addEventListener('click', () => {
      $('script').value = SAMPLE;
      stats();
      $('script').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('build').addEventListener('click', build);

    $('restart').addEventListener('click', () => {
      setPlaying(false);
      $('preview-section').hidden = true;
      $('restart').hidden = true;
      showError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('play').addEventListener('click', () => setPlaying(!state.playing));

    $('scrub').addEventListener('input', e => {
      if (!state.tl) return;
      state.t = (e.target.value / 10000) * state.tl.duration;
      drawPreview();
    });

    $('autofix').addEventListener('click', () => {
      if (!state.tl) return;
      const changed = ML.preflight.autofix(state.tl, currentOptions());
      refreshAll();
      const summary = $('preflight-summary');
      if (changed.length) {
        summary.appendChild(ML.el('div', { class: 'small muted', style: 'margin-top:8px' }, [
          ML.text('Changed: ' + changed.join(' '))
        ]));
      } else {
        summary.appendChild(ML.el('div', { class: 'small muted', style: 'margin-top:8px' }, [
          ML.text('Nothing left that can be fixed without a decision about the script.')
        ]));
      }
    });

    $('render').addEventListener('click', doRender);
    $('cancel').addEventListener('click', () => { state.cancel = true; });

    $('dl-storyboard').addEventListener('click', () => {
      if (!state.tl) return;
      const board = ML.aibridge.storyboard(state.tl, state.doc);
      ML.download(new Blob([board.text], { type: 'text/markdown' }), `${ML.export.safeName(state.tl.title)}-shotlist.md`);
    });
    $('dl-json').addEventListener('click', () => {
      if (!state.tl) return;
      ML.download(new Blob([ML.aibridge.json(state.tl, state.doc)], { type: 'application/json' }), `${ML.export.safeName(state.tl.title)}-plan.json`);
    });
    $('dl-narration').addEventListener('click', () => {
      if (!state.tl) return;
      ML.download(new Blob([ML.export.narrationSheet(state.tl)], { type: 'text/markdown' }), `${ML.export.safeName(state.tl.title)}-narration.md`);
    });

    // Tabs.
    document.querySelectorAll('.tabs').forEach(group => {
      group.addEventListener('click', e => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        const panelHost = group.parentElement;
        group.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        panelHost.querySelectorAll('.tab-body').forEach(b => { b.hidden = b.dataset.panel !== tab.dataset.tab; });
      });
    });

    // Copy buttons.
    document.addEventListener('click', async e => {
      const btn = e.target.closest('.copy');
      if (!btn) return;
      const src = $(btn.dataset.copy);
      if (!src) return;
      try {
        await navigator.clipboard.writeText(src.textContent);
        const was = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = was; }, 1400);
      } catch (err) {
        showError('The clipboard is not available here — select the text and copy it manually.');
      }
    });

    window.addEventListener('resize', () => {
      if (!state.tl) return;
      sizePreview();
      drawPreview();
    });
  }

  init();
})();
