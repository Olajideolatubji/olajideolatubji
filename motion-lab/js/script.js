/* Script → structured document.
 *
 * The whole app hangs off this: a plain script is turned into chapters and
 * beats, where a beat is one thing said and therefore one thing shown. Every
 * beat carries its narration text, a short on-screen headline pulled out of
 * that text, and a measured duration. Nothing downstream ever re-reads the raw
 * script, so all the guessing happens once, here, where it can be inspected. */

ML.script = (() => {

  /* Words that carry no meaning on a title card. Stripping them is what turns
   * a spoken sentence into something readable in a 2-second glance. */
  const STOP = new Set(('a an the and or but so then that this these those there here it its of to in on at for with from as by is are was were be been being do does did has have had will would can could should i you we they he she them us our your my me if not no yes very just really actually basically literally about into over under out up down what when where why how which who whom than because while also more most some any each every own same too s t don now ' +
    // Pronoun-shaped and filler nouns. Without these a keyword pass on ordinary
    // prose returns "nobody", "thing" and "people", and every generated title
    // is built on a word the video is not about.
    'nobody anybody somebody everybody everyone anyone someone none nothing something anything everything ' +
    'people person thing things stuff lot lots kind sort way ways time times day days ' +
    'know knows think thinks want wants make makes made get gets got take takes took give gives ' +
    'come comes came look looks looked said says say tell tells told going gone went ' +
    'like even still back much many other another around only ever never always often ' +
    'first last next new old good bad big small long short well better best').split(/\s+/));

  /* Sentence split that survives the abbreviations and decimals a real script
   * is full of: "3.5 million", "Dr. Chen", "U.S." must not become cuts. */
  const ABBR = /\b(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|approx|fig|no|vol|dept|est|ph|d|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.$/i;

  function sentences(text) {
    const out = [];
    let buf = '';
    const parts = text.split(/(?<=[.!?…])\s+/);
    for (const p of parts) {
      buf = buf ? buf + ' ' + p : p;
      const trimmed = buf.trim();
      // Keep accumulating when the break was a decimal point or a known
      // abbreviation rather than a real sentence end.
      if (/\d\.$/.test(trimmed) || ABBR.test(trimmed)) continue;
      if (/[.!?…]["')\]]?$/.test(trimmed) || trimmed.length > 300) {
        out.push(trimmed);
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(s => s.replace(/[^A-Za-z0-9]/g, '').length > 0);
  }

  const countWords = s => (s.match(/[A-Za-z0-9''’-]+/g) || []).length;

  /* Narration duration. Word count at the chosen pace, plus real breathing
   * room for punctuation — that pause is why word-count-alone estimates always
   * come out short against a recorded read. */
  function speakSeconds(text, wpm) {
    const words = countWords(text);
    const base = (words / wpm) * 60;
    const commas = (text.match(/[,;:—–-]/g) || []).length;
    const stops = (text.match(/[.!?…]/g) || []).length;
    return base + commas * 0.16 + stops * 0.34;
  }

  /* Classifies a line so the renderer can pick a layout that suits it. The
   * order matters: a question that also holds a number is still a question. */
  function classify(text, index, total) {
    const t = text.trim();
    if (/\?\s*$/.test(t)) return 'question';
    // A quotation counts whether it is the whole line or sits inside one, as
    // long as it is long enough to stand on a card by itself.
    const quoted = t.match(/["“]([^"”]{16,})["”]/);
    if (quoted && countWords(quoted[1]) >= 4) return 'quote';
    if (/\b\d+([.,]\d+)?\s*(%|percent|x|×|million|billion|trillion|thousand|k\b|bn\b|hours?|minutes?|seconds?|days?|weeks?|months?|years?|dollars?|pounds?|euros?)/i.test(t)) return 'stat';
    if (/^\s*(step|rule|tip|number|no\.?|reason|way|lesson|point|part)\s*#?\s*\d+/i.test(t)) return 'numbered';
    if (/\b(subscribe|comment below|hit the like|smash the like|follow me|link in the description|check the description)\b/i.test(t)) return 'cta';
    if (index === total - 1) return 'close';
    return 'body';
  }

  /* Pulls the on-screen headline out of a spoken line.
   *
   * A card that repeats the full sentence is unreadable at speed and competes
   * with the narration. What survives here is the load-bearing fragment: the
   * clause holding the number or the proper noun, stripped of filler, capped
   * to a glanceable length. */
  function headline(text, kind, maxWords) {
    let t = text.trim();

    // On a quote card the card is the quotation, not the sentence carrying it.
    if (kind === 'quote') {
      const quoted = t.match(/["“]([^"”]{16,})["”]/);
      if (quoted) t = quoted[1];
    }
    t = t.replace(/^["“''\s]+|["”''\s]+$/g, '');

    // Prefer the clause carrying the number on a stat card.
    if (kind === 'stat') {
      const clauses = t.split(/[,;:—–]|\s+(?:and|but|because|which|that)\s+/i);
      const withNum = clauses.find(c => /\d/.test(c));
      if (withNum && countWords(withNum) >= 2) t = withNum.trim();
    } else {
      // Drop a leading discourse marker: "So, here's the thing — X" → "X".
      t = t.replace(/^(so|now|ok|okay|right|look|listen|and|but|well|see|alright|anyway|basically|honestly|obviously|the thing is|here'?s the thing|what i mean is)\b[\s,—–-]*/i, '');
      const clauses = t.split(/\s+(?:because|which means|so that|and then)\s+/i);
      if (clauses.length > 1 && countWords(clauses[0]) >= 3) t = clauses[0];
    }

    t = t.replace(/[.]+$/, '').trim();

    const words = t.split(/\s+/);
    // A quotation is allowed to run longer: it is set at a smaller size and
    // cutting someone off mid-sentence reads worse than a fuller card.
    if (kind === 'quote') maxWords = Math.round(maxWords * 2.2);
    if (words.length > maxWords) {
      // Trim from the end, then back off any trailing connective so the card
      // does not end on a dangling "of" or "and".
      let cut = words.slice(0, maxWords);
      while (cut.length > 2 && STOP.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) cut.pop();
      t = cut.join(' ') + '…';
    }
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* Keywords for titles, tags and the AI visual prompts. Frequency over the
   * whole script, proper nouns weighted up because they are what a viewer
   * searches for. */
  function keywords(text, limit) {
    const freq = new Map();
    const tokens = text.match(/[A-Za-z][A-Za-z'-]+/g) || [];
    tokens.forEach((raw, i) => {
      const w = raw.toLowerCase();
      if (w.length < 4 || STOP.has(w)) return;
      const proper = /^[A-Z]/.test(raw) && i > 0 && !/[.!?]\s*$/.test(tokens[i - 1] || '');
      freq.set(w, (freq.get(w) || 0) + (proper ? 2.2 : 1));
    });
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(e => e[0]);
  }

  /* Parse ------------------------------------------------------------ */

  function parse(raw, opts) {
    const wpm = opts.wpm || 150;
    const maxWords = opts.headlineWords || 7;
    const targetScene = opts.sceneSeconds || 5;

    const lines = String(raw).replace(/\r/g, '').split('\n');
    let title = '';
    const chapters = [];
    let current = null;
    let pendingBullets = [];

    const pushChapter = name => {
      current = { title: name, blocks: [] };
      chapters.push(current);
    };

    const flushBullets = () => {
      if (pendingBullets.length && current) {
        current.blocks.push({ type: 'list', items: pendingBullets.slice() });
      }
      pendingBullets = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) { flushBullets(); continue; }

      // Production notes are direction for a human, never narration.
      if (/^[\[(](?:note|b-?roll|sfx|music|visual|cut to|on screen)\b/i.test(line)) continue;
      if (/^(narrator|host|voiceover|vo)\s*:/i.test(line)) {
        const spoken = line.replace(/^[^:]*:\s*/, '');
        if (spoken) { flushBullets(); (current || (pushChapter(''), current)).blocks.push({ type: 'prose', text: spoken }); }
        continue;
      }

      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^#{2,4}\s+(.+)/);
      if (h1) { flushBullets(); title = h1[1].trim(); continue; }
      if (h2) { flushBullets(); pushChapter(h2[1].trim()); continue; }

      // A short ALL-CAPS or Title Case line on its own reads as a section
      // header in plenty of scripts that never touch markdown.
      if (!/[.!?]$/.test(line) && line.length < 60 && /^[A-Z0-9]/.test(line) &&
          (line === line.toUpperCase() && /[A-Z]{3}/.test(line))) {
        flushBullets();
        pushChapter(line.replace(/^[-–—\s]+|[-–—:\s]+$/g, ''));
        continue;
      }

      const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)/);
      if (bullet) { pendingBullets.push(bullet[1].trim()); continue; }

      flushBullets();
      if (!current) pushChapter('');
      current.blocks.push({ type: 'prose', text: line });
    }
    flushBullets();

    if (!chapters.length) return { title, chapters: [], beats: [], words: 0, estSeconds: 0, keywords: [] };

    /* Blocks → beats. Short sentences are merged up to the style's target
     * scene length so a rapid-fire script does not turn into a strobe of
     * half-second cards, and long ones stand alone. */
    const beats = [];
    let id = 0;

    chapters.forEach((ch, ci) => {
      if (ch.title) {
        beats.push({
          id: id++, kind: 'chapter', chapter: ci, text: '', display: ch.title,
          items: [], dur: 0, words: 0, chapterTitle: ch.title
        });
      }

      for (const block of ch.blocks) {
        if (block.type === 'list') {
          // A list is one beat holding every item: the stack builds on screen
          // while the narrator reads through it.
          const text = block.items.join('. ');
          beats.push({
            id: id++, kind: 'list', chapter: ci, text,
            display: ch.title || headline(block.items[0], 'body', maxWords),
            items: block.items.slice(0, 6), words: countWords(text), dur: 0
          });
          continue;
        }

        const sents = sentences(block.text);
        let group = [];
        let groupSecs = 0;

        const flush = () => {
          if (!group.length) return;
          const text = group.join(' ');
          const kind = classify(group[0], beats.length, Infinity);
          beats.push({
            id: id++, kind, chapter: ci, text,
            display: headline(group[0], kind, maxWords),
            items: [], words: countWords(text), dur: 0
          });
          group = []; groupSecs = 0;
        };

        for (let i = 0; i < sents.length; i++) {
          const s = sents[i];
          const secs = speakSeconds(s, wpm);
          const kind = classify(s, i, sents.length);
          // Stats, quotes and questions always get their own card — they are
          // the moments a viewer screenshots, and sharing one is reach.
          const standalone = kind === 'stat' || kind === 'quote' || kind === 'question' || kind === 'numbered';

          if (standalone) { flush(); group = [s]; groupSecs = secs; flush(); continue; }
          if (groupSecs + secs > targetScene * 1.6 && group.length) flush();
          group.push(s);
          groupSecs += secs;
          if (groupSecs >= targetScene) flush();
        }
        flush();
      }
    });

    // Durations, measured off the real text.
    for (const b of beats) {
      if (b.kind === 'chapter') { b.dur = 0; continue; }
      b.dur = Math.max(1.1, speakSeconds(b.text, wpm));
    }

    const allText = beats.map(b => b.text).join(' ');
    return {
      title,
      chapters: chapters.map(c => c.title),
      beats,
      words: countWords(allText),
      estSeconds: beats.reduce((s, b) => s + b.dur, 0),
      keywords: keywords((title + ' ') + allText, 14)
    };
  }

  return { parse, sentences, speakSeconds, countWords, headline, keywords, STOP };
})();
