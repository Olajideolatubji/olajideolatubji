/* Beats + style → a timeline the renderer can seek into.
 *
 * This is where the YouTube-facing decisions get made and, importantly, get
 * recorded as data. The hook window, the pattern-interrupt cadence, the open
 * loop, the chapter cards and the loop-back ending are not baked into the
 * drawing code — they are entries on the timeline, so they can be counted,
 * scored, moved and argued with before a single frame is rendered. */

ML.timeline = (() => {

  /* Pulls the headline number out of a stat line so the counter can animate to
   * it. Returns null when there is nothing worth counting. */
  function extractStat(text) {
    const m = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(%|percent|x|×|k|m|bn|b|million|billion|trillion|thousand)?/i);
    if (!m) return null;
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(value)) return null;
    let suffix = (m[2] || '').toLowerCase();
    const map = { percent: '%', thousand: 'K', million: 'M', billion: 'B', trillion: 'T', k: 'K', m: 'M', b: 'B', bn: 'B', '×': 'x' };
    suffix = map[suffix] || suffix.toUpperCase().replace('X', 'x');
    if (suffix === '%') suffix = '%';
    // The label is what the number is *of* — the rest of the clause.
    const label = text.slice(m.index + m[0].length)
      .replace(/^[\s,.:;-]+/, '')
      .split(/[.,;]/)[0]
      .split(/\s+/).slice(0, 6).join(' ');
    return { value, suffix, label: label || '', decimals: (m[1].split('.')[1] || '').length };
  }

  function extractRank(text) {
    const m = text.match(/^\s*(?:number|no\.?|#)\s*(\d+)|^\s*(\d+)[.)]\s+/i);
    if (m) return parseInt(m[1] || m[2], 10);
    return null;
  }

  /* Word timings inside a beat, distributed by length so long words hold
   * longer. Deterministic, and the only thing the caption renderer needs. */
  function wordTimings(text, start, dur) {
    const words = text.match(/\S+/g) || [];
    if (!words.length) return [];
    const weights = words.map(w => Math.max(1.4, w.replace(/[^\w]/g, '').length) + (/[.,;:!?]$/.test(w) ? 2.4 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = start;
    return words.map((w, i) => {
      const d = (weights[i] / total) * dur;
      const item = { w, start: t, end: t + d };
      t += d;
      return item;
    });
  }

  /* Groups a beat's words into caption phrases of a readable size. Three to
   * five words is the band that reads without a saccade at Shorts speed. */
  function phrases(timed, perPhrase) {
    const out = [];
    for (let i = 0; i < timed.length; i += perPhrase) {
      const chunk = timed.slice(i, i + perPhrase);
      out.push({
        text: chunk.map(c => c.w).join(' '),
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        words: chunk
      });
    }
    return out;
  }

  /* Chooses a layout for a beat from the style's pool. Kind wins where the
   * pool offers a match; otherwise it rotates, because two identical layouts
   * back to back is the single most common way an auto-generated video starts
   * to look auto-generated. */
  function pickLayout(beat, style, index, lastLayout) {
    const pool = style.layoutPool;
    const has = l => pool.includes(l);

    if (beat.kind === 'chapter' && has('markerCard')) return 'markerCard';
    if (beat.kind === 'chapter') return 'slateCard';
    if (beat.rank != null && has('rankCard')) return 'rankCard';
    if (beat.stat && has('counterCard')) return 'counterCard';
    if (beat.stat && has('splitStat')) return 'splitStat';
    if (beat.items.length >= 2 && has('bulletStack')) return 'bulletStack';
    if (beat.items.length >= 2 && has('barChart')) return 'barChart';
    if (beat.kind === 'quote' && has('quoteCard')) return 'quoteCard';
    if (beat.kind === 'question' && has('impactCard')) return 'impactCard';

    const rotating = pool.filter(l => !['markerCard', 'rankCard', 'counterCard', 'quoteCard'].includes(l));
    const usable = rotating.length ? rotating : pool;
    let choice = usable[index % usable.length];
    if (choice === lastLayout && usable.length > 1) choice = usable[(index + 1) % usable.length];
    return choice;
  }

  /* Build ------------------------------------------------------------- */

  function build(doc, opts) {
    const style = ML.styles.byId(opts.styleId);
    const aspect = ML.styles.aspects[opts.aspect || style.aspect];
    const fps = opts.fps || 30;
    const scale = ML.styles.qualities[opts.quality || '1080'] || 1;
    const w = Math.round(aspect.w * scale / 2) * 2;
    const h = Math.round(aspect.h * scale / 2) * 2;

    // Working copy: the timeline owns its beats and may add to them.
    const beats = doc.beats.map(b => ({
      ...b,
      stat: b.kind === 'stat' ? extractStat(b.text) : null,
      rank: extractRank(b.text)
    }));

    if (!beats.length) {
      return { empty: true, w, h, fps, duration: 0, scenes: [], captions: [], chapters: [], style, palette: style.palette, markers: {}, meta: {} };
    }

    /* Retention devices, inserted as real beats -------------------------- */

    const spoken = beats.filter(b => b.kind !== 'chapter');
    const naturalSecs = spoken.reduce((s, b) => s + b.dur, 0);
    const wantsDevices = opts.retention !== false;
    const longForm = naturalSecs > 150;

    // 1. The hook. The first spoken beat is promoted: it gets its own card and
    // is held short, because a hook that outstays three seconds stops being one.
    // Only clamped when the line is short enough to be a hook in the first
    // place. Forcing a forty-word opening into three seconds would not make it
    // a hook — it would run the narration at a speed nobody can read or say,
    // and every caption under it would be wrong for the rest of the scene.
    // A line that long is left at its real length and flagged by preflight.
    const hookBeat = spoken[0];
    if (hookBeat) {
      hookBeat.hook = true;
      if (hookBeat.dur <= 6) hookBeat.dur = Math.min(hookBeat.dur, 3.6);
    }

    // 2. The open loop. On anything long enough to lose people, a card near the
    // top naming the payoff at the end. Only when the script actually has one
    // to promise — the last quarter is scanned for a resolution line.
    let loopBeat = null;
    if (wantsDevices && longForm && spoken.length > 6) {
      const tail = spoken.slice(Math.floor(spoken.length * 0.75));
      const payoff = tail.find(b => b.kind === 'stat' || b.kind === 'quote') || tail[tail.length - 1];
      if (payoff) {
        loopBeat = {
          id: 'loop-open', kind: 'openloop', chapter: spoken[0].chapter,
          text: '', display: opts.openLoopText || ML.script.headline(payoff.display || payoff.text, 'body', 8),
          items: [], dur: 2.2, words: 0, device: 'open-loop'
        };
      }
    }

    // 3. The ending. A loop-back to the opening line plus the ask. Returning to
    // the hook is what turns the last seconds into a replay instead of an exit.
    let endBeat = null;
    if (wantsDevices && spoken.length > 3) {
      endBeat = {
        id: 'loop-close', kind: 'loopback', chapter: beats[beats.length - 1].chapter,
        text: '', display: hookBeat ? hookBeat.display : '',
        items: [], dur: 3.0, words: 0, device: 'loop-back'
      };
    }

    // Splice the devices in.
    let assembled = beats.slice();

    // A script that opens on a "## Heading" would otherwise start the video on
    // a chapter card, which spends the one window that decides whether anyone
    // stays on a section title. The hook leads; the chapter card follows it.
    if (wantsDevices && assembled[0] && assembled[0].kind === 'chapter' && hookBeat) {
      const chapterCard = assembled.shift();
      const hookAt = assembled.indexOf(hookBeat);
      assembled.splice(hookAt + 1, 0, chapterCard);
    }
    if (loopBeat) {
      const at = assembled.findIndex(b => b === spoken[Math.min(2, spoken.length - 1)]);
      assembled.splice(at + 1, 0, loopBeat);
    }
    if (endBeat) assembled.push(endBeat);

    /* Duration fitting ---------------------------------------------------
     *
     * Reaching a target longer than the script has two honest mechanisms, and
     * they are not interchangeable.
     *
     * Holding scenes longer works up to a point — a documentary card can sit
     * for twenty seconds, an ambient one for a minute. Past that it stops
     * being a video: asking a hundred-word script to fill three hours by
     * stretching gives twelve cards held for fifteen minutes each, which is a
     * slideshow with a very long dissolve.
     *
     * So stretch is capped at what the style can actually carry, and the rest
     * of the runtime is filled by cycling back through the material — which is
     * what a three-hour ambient or study video genuinely is. Each pass reseeds
     * its backgrounds so the picture never repeats even though the words do.
     *
     * The hook and the device cards are exempt from stretching entirely. A
     * three-second hook is three seconds because that is the window; scaling
     * it with the runtime would defeat the only thing it is for. */

    const isFixed = b => b.hook || b.device;
    const baseDur = b => (b.kind === 'chapter' ? style.sceneSeconds * 0.5 : b.dur);
    const flexOf = list => list.filter(b => !isFixed(b)).reduce((s, b) => s + baseDur(b), 0);

    // The loop-back belongs at the very end of the runtime, not at the end of
    // the first pass, so it is held back and appended after the cycling.
    const tail = assembled.filter(b => b.device === 'loop-back');
    assembled = assembled.filter(b => b.device !== 'loop-back');

    // A repeat pass carries the content only: headings and the open loop are
    // first-pass furniture, and counting them into the cycle length is what
    // makes a cycled timeline fall short of its target.
    const repeatPass = assembled.filter(b => b.kind !== 'chapter' && !b.device);

    const fixedSecs = assembled.concat(tail).filter(isFixed).reduce((s, b) => s + baseDur(b), 0);
    const flexSecs = flexOf(assembled);
    const flexRepeat = flexOf(repeatPass);
    const rawSecs = fixedSecs + flexSecs;

    // How far a style can hold a single card before it reads as a stall.
    const MAX_STRETCH = { ambient: 6, documentary: 3.2, whiteboard: 2.6 }[style.id] || 2.2;

    let stretch = 1;
    let passes = 1;
    let fitNote = '';
    let hardStop = 0;

    if (opts.fit === 'target' && opts.targetSeconds > 0 && flexSecs > 0) {
      const wanted = Math.max(1, opts.targetSeconds - fixedSecs);
      const needed = wanted / flexSecs;

      if (needed > MAX_STRETCH && flexRepeat > 0) {
        stretch = MAX_STRETCH;
        // Solve for the number of passes against the length a repeat pass
        // actually contributes, then round up — the hard stop trims the
        // overshoot so the runtime lands exactly on the target.
        passes = 1 + Math.ceil((wanted / stretch - flexSecs) / flexRepeat);
        passes = Math.max(1, passes);
        hardStop = opts.targetSeconds;
        fitNote = `The script runs ${ML.duration(rawSecs)}. Scenes are held ${ML.round(stretch, 1)}× longer and the sequence cycles ${passes} times to reach ${ML.duration(opts.targetSeconds)}, reseeded each pass so the picture never repeats.`;
      } else {
        stretch = needed;
        hardStop = opts.targetSeconds;
        fitNote = needed >= 1.02
          ? `Scenes held ${ML.round(stretch, 2)}× longer than the read to reach ${ML.duration(opts.targetSeconds)}.`
          : needed <= 0.98
            ? `Scenes compressed to ${ML.round(stretch, 2)}× of the read to fit ${ML.duration(opts.targetSeconds)}.`
            : '';
      }
    }

    /* The beat sequence actually laid down. Later passes drop the device cards
     * — an open loop promised twice is not a loop — but keep the chapter
     * markers, which are what gives a long runtime any structure at all. The
     * loop-back ending is held for the final pass. */
    const sequence = assembled.slice();
    for (let pass = 1; pass < passes; pass++) {
      for (const beat of repeatPass) sequence.push({ ...beat, pass, id: `${beat.id}#${pass}` });
    }
    sequence.push(...tail);

    /* Listicle numbering happens before layouts are chosen, because the rank
     * is what makes a beat a rank card. A script that already numbers its
     * items keeps its own numbers; one that does not is counted down to one,
     * so the best entry lands last. */
    if (style.id === 'listicle') {
      const rankable = assembled.filter(b => !['chapter', 'openloop', 'loopback'].includes(b.kind) && !b.hook);
      if (!rankable.some(b => b.rank != null)) rankable.forEach((b, i) => { b.rank = rankable.length - i; });
      const top = Math.max(...rankable.map(b => b.rank || 0), 0);
      rankable.forEach(b => { b.rankTotal = top; });
    }

    /* Scenes -------------------------------------------------------------- */

    const scenes = [];
    const captions = [];
    const chapters = [];
    let t = 0;
    let lastLayout = null;
    let chapterIndex = -1;

    // Room kept at the end for the loop-back card, so filling to a target
    // never eats the ending.
    const tailSecs = tail.reduce((s, b) => s + baseDur(b), 0);
    const bodyStop = hardStop ? hardStop - tailSecs : 0;

    for (const beat of sequence) {
      const isTail = beat.device === 'loop-back';
      // Skip rather than break: once the body has filled the runtime there may
      // still be a tail card to lay down after it.
      if (hardStop && !isTail && t >= bodyStop - 0.05) continue;

      const isChapter = beat.kind === 'chapter';
      let dur = isFixed(beat)
        ? Math.max(0.6, baseDur(beat))
        : Math.max(0.6, baseDur(beat) * stretch);

      // Land exactly on the target rather than overshooting into a part-second.
      const ceiling = isTail ? hardStop : bodyStop;
      if (hardStop && t + dur > ceiling) dur = ceiling - t;
      if (dur < 0.25) continue;

      if (isChapter) {
        chapterIndex++;
        chapters.push({ title: beat.display, start: t, index: chapterIndex });
      }

      const layout = pickLayout(beat, style, scenes.length, lastLayout);
      lastLayout = layout;

      const scene = {
        i: scenes.length,
        start: t,
        dur,
        end: t + dur,
        layout,
        kind: beat.kind,
        display: beat.display,
        text: beat.text,
        items: beat.items,
        stat: beat.stat,
        rank: beat.rank,
        rankTotal: beat.rankTotal,
        hook: !!beat.hook,
        device: beat.device || null,
        chapter: Math.max(0, chapterIndex),
        chapterTitle: chapters[Math.max(0, chapterIndex)] ? chapters[Math.max(0, chapterIndex)].title : '',
        // The pass is part of the seed, so a cycled sequence draws a different
        // background and a different sketch every time it comes round.
        seed: ML.hash(`${style.id}|${beat.id}|${beat.display}|${beat.pass || 0}`),
        pass: beat.pass || 0,
        interrupt: false,
        punch: 0
      };
      scenes.push(scene);

      // Captions ride the spoken text only. Device cards and chapter cards say
      // their piece in the layout itself.
      if (style.captions !== 'none' && beat.text) {
        const timed = wordTimings(beat.text, t, dur);
        if (style.captions === 'word') {
          timed.forEach(x => captions.push({ text: x.w, start: x.start, end: x.end, words: [x] }));
        } else {
          phrases(timed, 4).forEach(p => captions.push(p));
        }
      }
      // Kinetic type has no separate caption track: the words are the layout.
      if (style.layoutPool.includes('kineticLine') && beat.text) {
        scene.words = wordTimings(beat.text, t, dur);
      }

      t += dur;
    }

    const duration = t;

    /* Time-based markers for a cycled runtime.
     *
     * Every heading the script carries lands inside the first pass, so an hour
     * in there would be nothing to navigate by — no chip, no ticks on the
     * rail, no timestamps worth pasting into a description. These fill the
     * gap on a round interval, which is what a long backdrop video actually
     * ships with. */
    if (passes > 1 && duration > 900) {
      const interval = duration > 5400 ? 1800 : duration > 2400 ? 900 : 600;
      const firstPassEnd = scenes.find(s => s.pass === 1);
      const from = firstPassEnd ? firstPassEnd.start : 0;
      let part = chapters.length + 1;
      for (let mark = Math.ceil(from / interval) * interval; mark < duration - interval * 0.4; mark += interval) {
        // Snap to the start of the scene running at that time, so the marker
        // lands on a cut rather than mid-card.
        let snapped = mark;
        for (const s of scenes) {
          if (s.start <= mark && s.end > mark) { snapped = s.start; break; }
        }
        if (chapters.some(c => Math.abs(c.start - snapped) < 30)) continue;
        chapters.push({ title: `Part ${part++}`, start: snapped, index: chapters.length, synthetic: true });
      }
      chapters.sort((a, b) => a.start - b.start);
      chapters.forEach((c, i) => { c.index = i; });
    }

    /* 4. Pattern interrupts. Flagged on the first scene at or after each
     * cadence mark, so the change lands on a cut rather than mid-sentence.
     * The renderer reads these to swap the background and punch the camera. */
    if (wantsDevices && style.interruptEvery > 0) {
      let next = style.interruptEvery;
      for (const s of scenes) {
        if (s.start >= next) {
          s.interrupt = true;
          s.punch = style.motion.punch;
          next = s.start + style.interruptEvery;
        }
      }
    }

    return {
      w, h, fps, duration,
      style,
      palette: Object.assign({}, style.palette, opts.palette || {}),
      aspect: opts.aspect || style.aspect,
      scenes,
      captions,
      chapters,
      title: doc.title || (scenes[0] && scenes[0].display) || 'Untitled',
      meta: {
        words: doc.words,
        naturalSecs,
        stretch,
        passes,
        fitNote,
        wpm: opts.wpm,
        interrupts: scenes.filter(s => s.interrupt).length,
        devices: scenes.filter(s => s.device).map(s => s.device),
        keywords: doc.keywords
      }
    };
  }

  /* Binary search for the scene containing t. Called once per frame during
   * export, where a linear scan over a three-hour timeline would show. */
  function sceneAt(tl, t) {
    const s = tl.scenes;
    let lo = 0, hi = s.length - 1;
    if (!s.length) return null;
    if (t <= s[0].start) return s[0];
    if (t >= s[hi].start) return s[hi];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < s[mid].start) hi = mid - 1;
      else if (t >= s[mid].end) lo = mid + 1;
      else return s[mid];
    }
    return s[ML.clamp(lo, 0, s.length - 1)];
  }

  /* Rebuilds the caption track from the scenes as they now stand. Anything
   * that changes a scene's duration has to call this: captions carry absolute
   * times, so shifting scenes without regenerating them leaves the words
   * running against a picture that has moved. */
  function rebuildCaptions(tl) {
    const style = tl.style;
    tl.captions = [];
    for (const s of tl.scenes) {
      if (!s.text) { delete s.words; continue; }
      const timed = wordTimings(s.text, s.start, s.dur);
      if (style.layoutPool.includes('kineticLine')) s.words = timed;
      if (style.captions === 'none') continue;
      if (style.captions === 'word') {
        timed.forEach(x => tl.captions.push({ text: x.w, start: x.start, end: x.end, words: [x] }));
      } else {
        phrases(timed, 4).forEach(p => tl.captions.push(p));
      }
    }
  }

  return { build, sceneAt, extractStat, wordTimings, phrases, rebuildCaptions };
})();
