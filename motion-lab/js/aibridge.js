/* The bridge to generative video.
 *
 * Motion Lab renders motion design — type, charts, diagrams, generative
 * fields — deterministically, which is why it can promise the output. It does
 * not draw people, places or footage, and pretending otherwise would be the
 * one thing that puts mistakes back into the pipeline.
 *
 * So when a script wants photographic or character footage, this module hands
 * the finished plan to a generator that does that: the same beats, the same
 * durations, the same chapter structure, written out as a shot list with a
 * visual prompt per scene and a cast block that keeps a character the same
 * person from shot to shot. The timing has already been decided here, which is
 * the part those tools are worst at. */

ML.aibridge = (() => {

  /* How each style should look when a model is drawing it rather than the
   * canvas. Written as a camera-and-light brief, because that is the register
   * image models respond to most consistently. */
  const LOOKS = {
    retention: 'high-contrast modern editorial, deep navy and near-black backgrounds, a single acid-green accent light, shallow depth of field, crisp studio key with hard falloff, 50mm',
    kinetic: 'saturated neon gradient studio, magenta and violet rim light against black, high-gloss surfaces, tight framing, 35mm, shallow focus',
    infographic: 'clean technical studio, cool blue and amber, soft even light, isometric objects on a seamless backdrop, product-photography clarity',
    whiteboard: 'warm off-white paper, hand-drawn ink line art, minimal flat colour fills, top-down light, no photographic texture',
    impact: 'high-contrast cel-shaded anime, hard black outlines, crimson and pale gold, dramatic low angles, motion blur and speed lines',
    documentary: 'muted filmic 16mm, desaturated with warm gold highlights, low natural light, archival grain, wide lens, patient static framing',
    ambient: 'soft atmospheric wide shots, deep teal and indigo, volumetric haze, no subject in focus, slow drifting light',
    listicle: 'bold poster graphics, purple to gold gradient, strong single-subject framing on a clean field, punchy studio light'
  };

  /* Motion instruction per style. Generators default to drifting the whole
   * frame; naming the movement is what keeps a shot from feeling like a
   * photograph someone panned across. */
  const MOTION = {
    retention: 'slow push in, cut on the beat',
    kinetic: 'quick handheld drift, snap zoom on the stressed word',
    infographic: 'locked-off camera, elements animate in place',
    whiteboard: 'static frame, the drawing builds on',
    impact: 'hard whip pan into a held impact frame',
    documentary: 'very slow dolly, almost imperceptible',
    ambient: 'continuous slow drift, no cuts',
    listicle: 'snap cut in, brief settle, hold'
  };

  /* A cast block. Character drift — the same person looking different in every
   * shot — is the most obvious failure in generated video, and the fix is a
   * fixed description repeated verbatim in every prompt that person appears
   * in. Names are lifted from the script, so the block describes whoever the
   * script actually keeps talking about. */
  function cast(doc) {
    const counts = new Map();
    for (const b of doc.beats) {
      const names = (b.text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || []);
      names.forEach(n => {
        // Sentence-initial words are usually not names.
        if (ML.script.STOP.has(n.toLowerCase())) return;
        counts.set(n, (counts.get(n) || 0) + 1);
      });
    }
    return [...counts.entries()]
      .filter(e => e[1] >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => ({
        label: name,
        description: `${name} — keep the same face, hair, build, age and wardrobe in every shot they appear in. Describe them identically each time; never re-invent them between scenes.`
      }));
  }

  /* One visual prompt per scene. Built from what the beat is about rather than
   * from its narration verbatim: a prompt that repeats a spoken sentence gets
   * you a picture of someone saying it. */
  function scenePrompt(scene, tl, doc, castList) {
    const look = LOOKS[tl.style.id] || LOOKS.retention;
    const motion = MOTION[tl.style.id] || MOTION.retention;
    const subject = subjectOf(scene, doc);
    const who = castList.filter(c => scene.text.includes(c.label)).map(c => c.label);

    const bits = [subject, look, motion];
    if (who.length) bits.splice(1, 0, `featuring ${who.join(' and ')} (same appearance as the cast block)`);
    if (scene.stat) bits.push(`the figure ${ML.render.formatCount(scene.stat, {})} is the point of the shot`);
    bits.push('no on-screen text, no captions, no watermarks, no logos');

    return {
      scene: scene.i + 1,
      start: ML.mmss(scene.start),
      seconds: ML.round(scene.dur, 2),
      narration: scene.text || '(no narration — card only)',
      onScreen: scene.display,
      prompt: bits.join('; '),
      interrupt: scene.interrupt
    };
  }

  /* Turns a beat into something a camera could point at. Concrete nouns from
   * the line, or a fallback that is at least honest about being abstract. */
  function subjectOf(scene, doc) {
    if (scene.kind === 'chapter') return `a title card moment: a wide establishing shot that opens the section "${scene.display}"`;
    if (scene.device === 'open-loop') return 'a held wide shot that implies something is still to come';
    if (scene.device === 'loop-back') return 'a closing wide shot that mirrors the opening frame';

    const words = (scene.text || scene.display).match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
    const nouns = words.filter(w => !ML.script.STOP.has(w.toLowerCase())).slice(0, 6);
    if (!nouns.length) return `an abstract visual for "${scene.display}"`;
    return `a literal shot illustrating ${nouns.slice(0, 4).join(', ')}`;
  }

  /* Calliope's create_video takes the narration and a per-video config; it
   * does its own scene splitting, so what it needs from us is the script, the
   * length and the pacing decisions, not our shot list. The shot list ships
   * alongside for the tools that do take one. */
  function calliopeSpec(tl, doc) {
    const long = tl.duration > 180;
    const freq = tl.style.sceneSeconds <= 3.5 ? 'high' : tl.style.sceneSeconds <= 5.5 ? 'balanced' : 'low';
    return {
      content_type: long ? 'video' : 'short',
      script_params: { script: doc.beats.filter(b => b.kind !== 'chapter').map(b => b.text).join('\n\n') },
      target_duration_sec: Math.round(tl.duration),
      visual_frequency: freq,
      animate: true,
      quality: 'high',
      captions: tl.style.captions !== 'none',
      _note: 'source is the exact script; target_duration_sec is advisory because real narration length wins. visual_frequency mirrors this style\'s ' + tl.style.sceneSeconds + 's scene length.'
    };
  }

  function storyboard(tl, doc) {
    const castList = cast(doc);
    const shots = tl.scenes.map(s => scenePrompt(s, tl, doc, castList));

    const lines = [];
    lines.push(`# ${tl.title} — shot list`);
    lines.push('');
    lines.push(`${ML.mmss(tl.duration)} · ${tl.scenes.length} shots · ${tl.style.name} · ${tl.aspect}`);
    lines.push('');
    lines.push('Style, to repeat in every prompt:');
    lines.push(`> ${LOOKS[tl.style.id] || LOOKS.retention}`);
    lines.push('');

    if (castList.length) {
      lines.push('## Cast — paste this into every shot the person appears in');
      lines.push('');
      castList.forEach(c => lines.push(`- **${c.label}**: ${c.description}`));
      lines.push('');
    }

    lines.push('## Shots');
    lines.push('');
    for (const shot of shots) {
      lines.push(`### ${shot.start} · shot ${shot.scene} · ${shot.seconds}s${shot.interrupt ? ' · pattern interrupt' : ''}`);
      lines.push(`**Narration:** ${shot.narration}`);
      lines.push(`**On screen:** ${shot.onScreen}`);
      lines.push(`**Prompt:** ${shot.prompt}`);
      lines.push('');
    }
    return { text: lines.join('\n'), shots, cast: castList };
  }

  function json(tl, doc) {
    const board = storyboard(tl, doc);
    return JSON.stringify({
      title: tl.title,
      duration_seconds: ML.round(tl.duration, 2),
      aspect: tl.aspect,
      fps: tl.fps,
      style: { id: tl.style.id, name: tl.style.name, look: LOOKS[tl.style.id], motion: MOTION[tl.style.id] },
      retention: {
        pattern_interrupt_seconds: tl.style.interruptEvery,
        interrupts: tl.meta.interrupts,
        devices: tl.meta.devices
      },
      chapters: tl.chapters.map(c => ({ title: c.title, start: ML.round(c.start, 2), stamp: ML.mmss(c.start) })),
      cast: board.cast,
      shots: board.shots,
      calliope: calliopeSpec(tl, doc)
    }, null, 2);
  }

  return { storyboard, json, calliopeSpec, cast, LOOKS, MOTION };
})();
