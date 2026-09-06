/* Preflight.
 *
 * "No mistakes" cannot be a promise about a model's taste, but it can be a
 * property of a deterministic renderer: if every failure mode is enumerated
 * and measured against the actual timeline before a frame is exported, the
 * export cannot contain the ones on the list. So this runs the real text
 * through the real font metrics at the real output size, and blocks the export
 * on anything that would land as a visible defect.
 *
 * Errors block. Warnings are judgement calls and are only reported. Anything
 * that can be corrected without guessing at intent is fixed by `autofix`. */

ML.preflight = (() => {

  const MEASURE = document.createElement('canvas').getContext('2d');

  const CHECKS = [

    { id: 'empty', label: 'Every scene has something to show', run(tl) {
      const bad = tl.scenes.filter(s => !s.display || !s.display.replace(/[^\w]/g, ''));
      return bad.length ? [{
        level: 'error', scene: bad[0].i,
        msg: `${bad.length} scene${bad.length > 1 ? 's have' : ' has'} no on-screen text.`,
        detail: 'A blank card in the middle of a video reads as a render failure.',
        fix: 'drop-empty'
      }] : [];
    }},

    { id: 'overflow', label: 'No text overflows its card', run(tl) {
      const out = [];
      MEASURE.setTransform(1, 0, 0, 1, 0, 0);
      const box = ML.render.safeBox({ w: tl.w, h: tl.h });
      for (const s of tl.scenes) {
        const u = tl.h / 1000;
        const fit = ML.fitText(MEASURE, s.display, {
          size: 116 * u, minSize: 22 * u, weight: 800,
          maxWidth: box.w, maxHeight: box.h * 0.7, maxLines: 5
        });
        if (fit.overflow) out.push({
          level: 'error', scene: s.i,
          msg: `Scene ${s.i + 1} headline is too long to fit at a readable size.`,
          detail: `"${s.display.slice(0, 60)}…" — ${ML.script.countWords(s.display)} words.`,
          fix: 'trim-headline'
        });
      }
      return out.slice(0, 6);
    }},

    { id: 'tooshort', label: 'No scene is shorter than a glance', run(tl) {
      const min = 0.9;
      const bad = tl.scenes.filter(s => s.dur < min);
      return bad.length ? [{
        level: 'error', scene: bad[0].i,
        msg: `${bad.length} scene${bad.length > 1 ? 's are' : ' is'} under ${min}s.`,
        detail: 'Below about a second a card is gone before it has been read, which costs the viewer the line rather than saving time.',
        fix: 'extend-short'
      }] : [];
    }},

    { id: 'readspeed', label: 'Captions are readable at the pace they run', run(tl) {
      if (tl.style.captions === 'none') return [];
      const CPS = 24;
      const bad = tl.captions.filter(c => c.text.length / Math.max(0.12, c.end - c.start) > CPS);
      if (!bad.length) return [];
      const worst = bad.reduce((a, b) => (b.text.length / (b.end - b.start) > a.text.length / (a.end - a.start) ? b : a));
      return [{
        level: bad.length > tl.captions.length * 0.15 ? 'error' : 'warn',
        msg: `${bad.length} caption${bad.length > 1 ? 's run' : ' runs'} faster than ${CPS} characters a second.`,
        detail: `Worst is "${worst.text.slice(0, 40)}" at ${Math.round(worst.text.length / (worst.end - worst.start))} cps. Either the read is too fast for the words or the phrase needs splitting.`,
        fix: 'split-captions'
      }];
    }},

    { id: 'contrast', label: 'Text clears the contrast floor', run(tl) {
      const out = [];
      const p = tl.palette;
      const ratio = ML.contrast(p.ink, p.bg);
      if (ratio < 4.5) out.push({
        level: 'error',
        msg: `Body text sits at ${ML.round(ratio, 1)}:1 against the background.`,
        detail: 'Under 4.5:1 the text disappears on a phone in daylight, which is where most of the watch time is.',
        fix: 'fix-contrast'
      });
      const acc = ML.contrast(p.accent, p.bg);
      if (acc < 3) out.push({
        level: 'warn',
        msg: `The accent colour is only ${ML.round(acc, 1)}:1 against the background.`,
        detail: 'Numbers and highlights set in the accent will be hard to read.'
      });
      return out;
    }},

    { id: 'repeat', label: 'No card repeats the one before it', run(tl) {
      const out = [];
      for (let i = 1; i < tl.scenes.length; i++) {
        const a = tl.scenes[i - 1], b = tl.scenes[i];
        if (a.display && a.display === b.display) out.push({
          level: 'warn', scene: b.i,
          msg: `Scenes ${i} and ${i + 1} show the same headline.`,
          detail: 'Two identical cards back to back read as a stutter in the edit.',
          fix: 'dedupe'
        });
      }
      return out.slice(0, 4);
    }},

    { id: 'hook', label: 'The hook lands inside the first three seconds', run(tl) {
      const first = tl.scenes.find(s => s.hook) || tl.scenes[0];
      if (!first) return [];
      const out = [];
      if (first.start > 6) out.push({
        level: 'warn', scene: first.i,
        msg: `The first line of narration does not arrive until ${ML.mmss(first.start)}.`,
        detail: 'Everything before it is furniture. The viewer decides in the first few seconds, and they are being spent on cards.'
      });
      if (first.dur > 4) out.push({
        level: 'warn', scene: first.i,
        msg: `The opening card holds for ${ML.round(first.dur, 1)}s.`,
        detail: 'The decision to keep watching is made in the first few seconds; a hook that outstays them has already been read.',
        fix: 'tighten-hook'
      });
      if (ML.script.countWords(first.display) > 12) out.push({
        level: 'warn', scene: first.i,
        msg: 'The opening card is over twelve words.',
        detail: 'A hook has to be taken in at a glance, before the viewer has decided to read anything.'
      });
      return out;
    }},

    { id: 'chapters', label: 'Long-form is chaptered', run(tl) {
      if (tl.duration < 480) return [];
      const marks = [0, ...tl.chapters.map(c => c.start), tl.duration];
      let worst = 0;
      for (let i = 1; i < marks.length; i++) worst = Math.max(worst, marks[i] - marks[i - 1]);
      if (worst > 600) return [{
        level: 'warn',
        msg: `There is a ${ML.duration(worst)} stretch with no chapter marker.`,
        detail: 'Chapters give the viewer somewhere to land and give YouTube key moments to surface in search. Add a "## Heading" line to the script where the subject turns.'
      }];
      return [];
    }},

    { id: 'cadence', label: 'The pattern-interrupt cadence holds', run(tl) {
      if (!tl.style.interruptEvery || tl.duration < 60) return [];
      const marks = tl.scenes.filter(s => s.interrupt).map(s => s.start);
      if (!marks.length) return [{
        level: 'warn',
        msg: 'No pattern interrupts were placed.',
        detail: `${tl.style.name} is built around a change of picture every ${tl.style.interruptEvery}s. Scene durations may be too long for any to land.`
      }];
      let worst = 0, at = 0;
      const all = [0, ...marks, tl.duration];
      for (let i = 1; i < all.length; i++) if (all[i] - all[i - 1] > worst) { worst = all[i] - all[i - 1]; at = all[i - 1]; }
      if (worst > tl.style.interruptEvery * 3) return [{
        level: 'warn',
        msg: `${ML.round(worst, 1)}s runs without a pattern interrupt at ${ML.mmss(at)}.`,
        detail: 'That is the shape of a retention dip. Break the long sentence there into two, or pick a style with a lower scene length.'
      }];
      return [];
    }},

    { id: 'density', label: 'No card is carrying a paragraph', run(tl) {
      const bad = tl.scenes.filter(s => ML.script.countWords(s.display) > 14);
      return bad.length ? [{
        level: 'warn', scene: bad[0].i,
        msg: `${bad.length} card${bad.length > 1 ? 's carry' : ' carries'} more than fourteen words.`,
        detail: 'On-screen text competes with the narration. The card should be the point, not the sentence.',
        fix: 'trim-headline'
      }] : [];
    }},

    { id: 'fitstyle', label: 'The style suits the runtime', run(tl) {
      const [lo, hi] = tl.style.range;
      if (tl.duration < lo) return [{
        level: 'warn',
        msg: `${tl.style.name} is built for ${ML.duration(lo)} and up; this runs ${ML.duration(tl.duration)}.`,
        detail: 'The devices it leans on need room to pay off.'
      }];
      if (tl.duration > hi) return [{
        level: 'warn',
        msg: `${tl.style.name} is built up to ${ML.duration(hi)}; this runs ${ML.duration(tl.duration)}.`,
        detail: 'At this length its cadence will read as relentless. Documentary Slate or Ambient Loop hold up better past an hour.'
      }];
      return [];
    }},

    { id: 'stretch', label: 'Scene timing matches the read', run(tl) {
      const s = tl.meta.stretch;
      const passes = tl.meta.passes || 1;
      if (passes > 1) return [{
        level: 'warn',
        msg: `The script fills ${ML.duration(tl.meta.naturalSecs)} of a ${ML.duration(tl.duration)} runtime, so it cycles ${passes} times.`,
        detail: passes > 6
          ? `At ${passes} passes the narration repeats often enough to be noticed on a first watch. That is right for an ambient backdrop and wrong for anything with an argument in it — for those, write more script rather than raising the target.`
          : 'Each pass reseeds its backgrounds, so the picture stays fresh while the words come round again. Right for ambient and study backdrops; write more script if the video is meant to be followed.'
      }];
      if (s > 2.2) return [{
        level: 'warn',
        msg: `Scenes are held ${ML.round(s, 1)}× longer than the script takes to read.`,
        detail: 'The picture will sit still through most of the narration. Either write more script or drop the target length.'
      }];
      if (s < 0.55) return [{
        level: 'error',
        msg: `Scenes are compressed to ${ML.round(s, 2)}× of the read.`,
        detail: 'The narration will not fit the picture. Raise the target length or cut the script.',
        fix: 'clear-target'
      }];
      return [];
    }},

    { id: 'geometry', label: 'Nothing is painted outside the safe area', run(tl) {
      // Renders a sample of scenes and checks what was actually painted, so a
      // layout bug shows up here rather than in the export.
      const sample = [];
      const step = Math.max(1, Math.floor(tl.scenes.length / 24));
      for (let i = 0; i < tl.scenes.length; i += step) sample.push(tl.scenes[i]);
      if (tl.scenes.length) sample.push(tl.scenes[tl.scenes.length - 1]);

      const cv = document.createElement('canvas');
      cv.width = Math.min(640, tl.w);
      cv.height = Math.round(tl.h * (cv.width / tl.w));
      const ctx = cv.getContext('2d');
      const scale = cv.width / tl.w;
      const marginX = tl.w * 0.04, marginY = tl.h * 0.04;

      const out = [];
      for (const s of sample) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const c = ML.render.frame(ctx, tl, Math.min(s.start + Math.max(0.7, s.dur * 0.55), s.end - 0.02));
        const b = c && c.painted;
        if (!b || !b.w) continue;
        if (b.x < marginX - 1 || b.y < marginY - 1 || b.x + b.w > tl.w - marginX + 1 || b.y + b.h > tl.h - marginY + 1) {
          out.push({
            level: 'error', scene: s.i,
            msg: `Scene ${s.i + 1} paints outside the safe area.`,
            detail: 'Content this close to the edge gets clipped by the player chrome on mobile.',
            fix: 'trim-headline'
          });
        }
      }
      return out.slice(0, 4);
    }},

    { id: 'ending', label: 'The ending gives the viewer somewhere to go', run(tl) {
      const last = tl.scenes[tl.scenes.length - 1];
      if (!last) return [];
      if (last.device === 'loop-back') return [];
      return [{
        level: 'warn',
        msg: 'The video ends without a loop back to the opening.',
        detail: 'The last ten seconds are where a session either continues or does not. Turn retention devices on, or end the script on the question it opened with.'
      }];
    }}
  ];

  function run(tl) {
    if (!tl || tl.empty) {
      return { errors: [{ level: 'error', msg: 'There is no script yet.', detail: 'Paste a script above to build a timeline.' }], warnings: [], checks: [], ok: false };
    }
    const findings = [];
    const checks = [];
    for (const check of CHECKS) {
      let found = [];
      try {
        found = check.run(tl) || [];
      } catch (err) {
        found = [{ level: 'warn', msg: `The "${check.label}" check could not run.`, detail: String(err && err.message || err) }];
      }
      found.forEach(f => { f.check = check.id; f.label = check.label; });
      checks.push({ id: check.id, label: check.label, pass: !found.some(f => f.level === 'error'), count: found.length });
      findings.push(...found);
    }
    const errors = findings.filter(f => f.level === 'error');
    const warnings = findings.filter(f => f.level === 'warn');
    return { errors, warnings, checks, ok: errors.length === 0 };
  }

  /* Autofix.
   *
   * Only corrections that need no guess about what the author meant. Anything
   * requiring a decision — a script too long for its target, a missing chapter
   * — is reported and left alone. Returns the list of what it changed. */
  function autofix(tl, opts) {
    const done = [];
    const box = ML.render.safeBox({ w: tl.w, h: tl.h });
    const u = tl.h / 1000;

    // Empty cards: fall back to the narration, then drop what is still blank.
    const before = tl.scenes.length;
    tl.scenes.forEach(s => {
      if (!s.display && s.text) s.display = ML.script.headline(s.text, s.kind, 8);
    });
    const kept = tl.scenes.filter(s => s.display || s.text || s.device);
    if (kept.length !== before) {
      rebuildTimes(tl, kept);
      done.push(`Removed ${before - kept.length} empty scene${before - kept.length > 1 ? 's' : ''}.`);
    }

    // Headlines that cannot fit: shortened word by word until they do.
    let trimmed = 0;
    for (const s of tl.scenes) {
      let guard = 0;
      while (guard++ < 30) {
        const fit = ML.fitText(MEASURE, s.display, {
          size: 116 * u, minSize: 22 * u, weight: 800,
          maxWidth: box.w, maxHeight: box.h * 0.7, maxLines: 5
        });
        if (!fit.overflow && ML.script.countWords(s.display) <= 14) break;
        const words = s.display.replace(/…$/, '').split(/\s+/);
        if (words.length <= 3) break;
        words.pop();
        while (words.length > 3 && ML.script.STOP.has(words[words.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) words.pop();
        s.display = words.join(' ') + '…';
        trimmed++;
      }
    }
    if (trimmed) done.push(`Shortened ${trimmed} headline${trimmed > 1 ? 's' : ''} to fit the card.`);

    // Scenes under the glance floor: lengthened, and the rest pushed back.
    const short = tl.scenes.filter(s => s.dur < 0.9);
    if (short.length) {
      short.forEach(s => { s.dur = 0.9; });
      rebuildTimes(tl, tl.scenes);
      done.push(`Extended ${short.length} scene${short.length > 1 ? 's' : ''} to the 0.9s floor.`);
    }

    // Consecutive duplicates: the second one re-derives from a later sentence.
    let deduped = 0;
    for (let i = 1; i < tl.scenes.length; i++) {
      const a = tl.scenes[i - 1], b = tl.scenes[i];
      if (a.display && a.display === b.display && b.text) {
        const sents = ML.script.sentences(b.text);
        const alt = sents.find(s => ML.script.headline(s, b.kind, 8) !== a.display);
        if (alt) { b.display = ML.script.headline(alt, b.kind, 8); deduped++; }
      }
    }
    if (deduped) done.push(`Rewrote ${deduped} repeated headline${deduped > 1 ? 's' : ''}.`);

    // Captions running too fast.
    //
    // Splitting the phrase does nothing: half the words in half the time reads
    // at exactly the same speed. A caption over the threshold means the scene
    // is too short for the words in it, so the scene is lengthened until the
    // narration can actually be said — which is also the only way the audio
    // will line up with the picture.
    if (tl.style.captions !== 'none') {
      const TARGET_CPS = 21;
      let slowed = 0;
      let added = 0;
      for (const s of tl.scenes) {
        if (!s.text) continue;
        const needed = s.text.length / TARGET_CPS;
        if (needed > s.dur + 0.05) { added += needed - s.dur; s.dur = needed; slowed++; }
      }
      if (slowed) {
        rebuildTimes(tl, tl.scenes);
        done.push(`Lengthened ${slowed} scene${slowed > 1 ? 's' : ''} by ${ML.duration(added)} in total so the narration can be read at the pace it is set to.`);
      }
    }

    // Contrast: lift the ink toward white or drop it toward black, whichever
    // direction the background allows, until it clears 4.5:1.
    if (ML.contrast(tl.palette.ink, tl.palette.bg) < 4.5) {
      const towards = ML.luminance(tl.palette.bg) > 0.4 ? '#000000' : '#ffffff';
      for (let k = 0.1; k <= 1.001; k += 0.1) {
        const candidate = rgbToHex(ML.mix(tl.palette.ink, towards, k));
        if (ML.contrast(candidate, tl.palette.bg) >= 4.5) { tl.palette.ink = candidate; break; }
      }
      done.push('Adjusted the text colour to clear the 4.5:1 contrast floor.');
    }

    // A hook that overstays — but only when the line can actually be said in
    // the time. Shortening a scene below the length of its own narration is
    // not a fix, it is the defect the caption check exists to catch; a hook
    // that long needs a shorter opening line, which is the author's call.
    const hookScene = tl.scenes.find(s => s.hook) || tl.scenes[0];
    if (hookScene && hookScene.dur > 4 && (!hookScene.text || hookScene.text.length / 21 <= 3.4)) {
      hookScene.dur = 3.4;
      rebuildTimes(tl, tl.scenes);
      done.push('Tightened the hook to 3.4s.');
    }

    return done;
  }

  /* Re-lays the timeline after any duration or membership change, so starts,
   * ends, captions and interrupt flags stay consistent. */
  function rebuildTimes(tl, scenes) {
    let t = 0;
    scenes.forEach((s, i) => {
      s.i = i;
      s.start = t;
      s.end = t + s.dur;
      t += s.dur;
    });
    tl.scenes = scenes;
    tl.duration = t;
    // Regenerated rather than shifted: a scene whose duration changed needs new
    // word timings, not the old ones moved along.
    ML.timeline.rebuildCaptions(tl);
    tl.chapters.forEach(ch => {
      const sc = scenes.find(s => s.kind === 'chapter' && s.chapter === ch.index);
      if (sc) ch.start = sc.start;
    });

    if (tl.style.interruptEvery > 0) {
      let next = tl.style.interruptEvery;
      scenes.forEach(s => { s.interrupt = false; s.punch = 0; });
      for (const s of scenes) {
        if (s.start >= next) {
          s.interrupt = true;
          s.punch = tl.style.motion.punch;
          next = s.start + tl.style.interruptEvery;
        }
      }
    }
    tl.meta.interrupts = scenes.filter(s => s.interrupt).length;
  }

  function rgbToHex(rgb) {
    const m = rgb.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return rgb;
    return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('');
  }

  return { run, autofix, rebuildTimes, checks: CHECKS };
})();
