/* The YouTube-facing layer.
 *
 * Two jobs. First, score the timeline on the things that actually move
 * retention, measured off the timeline rather than asserted — every subscore
 * below cites the number it came from, so a low score always names its cause.
 * Second, produce the text that ships alongside the file: chapter stamps that
 * match the render frame-for-frame, title candidates, a description, tags. */

ML.youtube = (() => {

  /* Scoring ------------------------------------------------------------ */

  function score(tl) {
    const parts = [];
    const push = (id, label, got, max, note) => parts.push({ id, label, score: Math.max(0, Math.min(max, got)), max, note });

    /* Hook — 25. The first card decides the swipe. It is the scene flagged as
     * the hook rather than scene zero, which on a chaptered script can be a
     * section title that says nothing. */
    const first = tl.scenes.find(s => s.hook) || tl.scenes[0];
    let hook = 0;
    const hookNotes = [];
    if (first) {
      if (first.dur <= 3.6) { hook += 9; hookNotes.push(`opens in ${ML.round(first.dur, 1)}s`); }
      else { hookNotes.push(`the opening card holds ${ML.round(first.dur, 1)}s, past the window where the decision is made`); }

      const words = ML.script.countWords(first.display);
      if (words <= 10) { hook += 8; hookNotes.push(`${words} words`); }
      else { hookNotes.push(`${words} words is more than a glance`); }

      if (first.kind === 'question' || first.kind === 'stat' || /\?/.test(first.text)) { hook += 8; hookNotes.push('opens on a question or a number'); }
      else hookNotes.push('opens on a statement rather than a question or a number');
    }
    push('hook', 'Hook', hook, 25, hookNotes.join('; ') + '.');

    /* Cadence — 20. How long the picture ever sits still. */
    const changes = [0, ...tl.scenes.map(s => s.start), tl.duration];
    let longest = 0, longestAt = 0;
    for (let i = 1; i < changes.length; i++) {
      if (changes[i] - changes[i - 1] > longest) { longest = changes[i] - changes[i - 1]; longestAt = changes[i - 1]; }
    }
    const avgScene = tl.duration / Math.max(1, tl.scenes.length);
    const ideal = tl.style.sceneSeconds;
    const ratio = avgScene / ideal;
    let cadence = 20 - Math.abs(1 - ratio) * 14 - Math.max(0, longest - ideal * 3) * 0.6;
    push('cadence', 'Cadence', cadence, 20,
      `The picture changes every ${ML.round(avgScene, 1)}s on average against the ${ideal}s this style is built on. Longest still frame is ${ML.round(longest, 1)}s at ${ML.mmss(longestAt)}.`);

    /* Variety — 15. Repetition is what makes generated video look generated. */
    const layouts = new Set(tl.scenes.map(s => s.layout));
    let repeats = 0;
    for (let i = 1; i < tl.scenes.length; i++) if (tl.scenes[i].layout === tl.scenes[i - 1].layout) repeats++;
    const repeatRate = tl.scenes.length > 1 ? repeats / (tl.scenes.length - 1) : 0;
    const variety = layouts.size / Math.max(1, tl.style.layoutPool.length) * 9 + (1 - repeatRate) * 6;
    push('variety', 'Visual variety', variety, 15,
      `${layouts.size} of ${tl.style.layoutPool.length} layouts in play; ${Math.round(repeatRate * 100)}% of cuts land on the same layout as the one before.`);

    /* Captions — 15. Most of the watch happens muted. */
    let caption = 0;
    let capNote;
    if (tl.style.captions === 'none') {
      // Kinetic and ambient carry the words in the layout itself, so the
      // absence of a caption track is not a gap in either.
      const carries = tl.style.layoutPool.includes('kineticLine');
      caption = carries ? 15 : 7;
      capNote = carries
        ? 'The words are the layout, so the video reads with the sound off by construction.'
        : 'No caption track, by design for this style — nothing on screen carries the narration for a muted viewer.';
    } else {
      const covered = tl.captions.reduce((s, c) => s + (c.end - c.start), 0);
      const spoken = tl.scenes.filter(s => s.text).reduce((s, x) => s + x.dur, 0) || 1;
      const cov = Math.min(1, covered / spoken);
      const fast = tl.captions.filter(c => c.text.length / Math.max(0.12, c.end - c.start) > 24).length;
      caption = cov * 13 - (fast / Math.max(1, tl.captions.length)) * 8 + 2;
      capNote = `Captions cover ${Math.round(cov * 100)}% of the narration; ${fast} run faster than 24 characters a second.`;
    }
    push('captions', 'Muted readability', caption, 15, capNote);

    /* Structure — 15. Chapters, and a reason to stay past the middle. */
    let structure = 0;
    const notes = [];
    const needsChapters = tl.duration > 480;
    if (needsChapters) {
      const marks = [0, ...tl.chapters.map(c => c.start), tl.duration];
      let gap = 0;
      for (let i = 1; i < marks.length; i++) gap = Math.max(gap, marks[i] - marks[i - 1]);
      if (tl.chapters.length >= 3 && gap <= 600) { structure += 8; notes.push(`${tl.chapters.length} chapters, longest gap ${ML.duration(gap)}`); }
      else notes.push(`${tl.chapters.length} chapters, longest unmarked stretch ${ML.duration(gap)}`);
    } else {
      structure += 8;
      notes.push('short enough not to need chapters');
    }
    const hasLoop = tl.scenes.some(s => s.device === 'open-loop');
    if (hasLoop) { structure += 7; notes.push('an open loop is planted near the top'); }
    else notes.push('no open loop — nothing promised early that only pays off later');
    push('structure', 'Structure', structure, 15, notes.join('; ') + '.');

    /* Ending — 10. The last ten seconds decide whether a session continues. */
    const last = tl.scenes[tl.scenes.length - 1];
    const loopBack = last && last.device === 'loop-back';
    push('ending', 'Ending', loopBack ? 10 : 3, 10,
      loopBack
        ? 'Ends on a loop back to the opening question, which is what turns the last seconds into a replay instead of an exit.'
        : 'Ends on the last line of the script with nothing pointing anywhere. That is where sessions end.');

    const total = Math.round(parts.reduce((s, p) => s + p.score, 0));
    const verdict =
      total >= 85 ? 'Structurally sound' :
      total >= 70 ? 'Will hold, with gaps' :
      total >= 55 ? 'Leaking in the obvious places' :
      'The structure is working against it';

    return { total, verdict, parts };
  }

  /* Chapters ----------------------------------------------------------- */

  /* YouTube's rules, which are not optional: the list has to start at 0:00,
   * carry at least three entries, and every chapter has to run 10s or longer,
   * or the whole list is silently ignored. */
  function chapterList(tl) {
    const raw = tl.chapters.slice().sort((a, b) => a.start - b.start);

    // The list has to open at 0:00. A heading that already lands in the first
    // few seconds is pulled back to zero rather than being shadowed by an
    // "Intro" too short to be legal — dropping that entry is what silently
    // invalidates the whole list.
    if (!raw.length || raw[0].start > 10) raw.unshift({ title: 'Intro', start: 0 });
    else raw[0] = { ...raw[0], start: 0 };

    const lines = [];
    let lastStart = -Infinity;
    raw.forEach((ch, i) => {
      if (ch.start - lastStart < 10 && lines.length) return;
      lines.push({ time: Math.floor(ch.start), label: ch.title || `Part ${i + 1}` });
      lastStart = ch.start;
    });
    // Every chapter must run ten seconds, including the last one.
    while (lines.length > 1 && tl.duration - lines[lines.length - 1].time < 10) lines.pop();

    const valid = lines.length >= 3 && lines[0] && lines[0].time === 0;
    return {
      valid,
      lines,
      text: lines.map(l => `${ML.mmss(l.time)} ${l.label}`).join('\n'),
      note: valid
        ? 'Meets YouTube\'s rules: starts at 0:00, three or more entries, none under ten seconds.'
        : 'YouTube will ignore this list — it needs at least three chapters, the first at 0:00, each running ten seconds or more. Add "## Heading" lines to the script.'
    };
  }

  /* Packaging ----------------------------------------------------------- */

  function titles(tl, doc) {
    const kw = (doc.keywords || []).slice(0, 4);
    const topic = kw[0] ? kw[0][0].toUpperCase() + kw[0].slice(1) : (doc.title || 'This');
    const first = tl.scenes[0] ? tl.scenes[0].display.replace(/[…]+$/, '') : '';
    const statScene = tl.scenes.find(s => s.stat);
    const num = statScene ? ML.render.formatCount(statScene.stat, {}) : null;
    const listCount = tl.scenes.filter(s => s.rank != null).length;

    const out = [];
    const add = (text, why) => {
      const t = text.replace(/\s+/g, ' ').trim();
      if (t && t.length <= 100 && !out.some(o => o.text === t)) out.push({ text: t, why, length: t.length });
    };

    if (first) add(first.replace(/\?$/, '') + '?', 'The hook as written — the title and the first line agreeing is what stops a click from bouncing.');
    if (num) add(`${num} ${kw[0] || 'reasons'}: what it actually means`, 'Leads on the number in the script; specific figures outperform round claims.');
    if (listCount >= 3) add(`${listCount} ${topic} rules, ranked`, 'A count sets an expectation of length and an ending.');
    add(`The ${topic} problem nobody explains`, 'Names a gap, which is the cheapest curiosity gap that is not a lie.');
    if (kw[1]) add(`${topic} vs ${kw[1][0].toUpperCase() + kw[1].slice(1)}: the honest version`, 'Comparison titles pick up the search traffic for both terms.');
    add(`What ${topic} really costs`, 'Consequence framing; works when the script has stakes in it.');

    return out.slice(0, 6);
  }

  function description(tl, doc) {
    const ch = chapterList(tl);
    const hookLine = tl.scenes[0] ? tl.scenes[0].display.replace(/…$/, '') : '';
    const body = doc.beats.filter(b => b.kind !== 'chapter').slice(0, 3).map(b => b.text).join(' ');
    const summary = body.length > 320 ? body.slice(0, 317).replace(/\s\S*$/, '') + '…' : body;

    const parts = [hookLine, '', summary, ''];
    if (ch.valid) parts.push('Chapters', ch.text, '');
    parts.push('Made with Motion Lab.');
    return parts.join('\n');
  }

  function tags(doc) {
    return (doc.keywords || []).slice(0, 12);
  }

  /* Everything the upload page needs, in one object. */
  function pack(tl, doc) {
    return {
      score: score(tl),
      chapters: chapterList(tl),
      titles: titles(tl, doc),
      description: description(tl, doc),
      tags: tags(doc)
    };
  }

  return { score, chapterList, titles, description, tags, pack };
})();
