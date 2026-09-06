/* The renderer.
 *
 * One entry point: frame(ctx, timeline, t). It draws the complete picture at
 * time t and depends on nothing else — no animation loop state, no elapsed
 * clock, no randomness that is not seeded off the scene. That is what makes
 * the preview and the export the same video, and what makes a three-hour
 * timeline seekable without rendering the two hours before the point you want.
 *
 * Everything is sized in `u`, one thousandth of the frame height, so a layout
 * written once is correct at 720p, 1080p, 1440p and in every aspect ratio. */

ML.render = (() => {

  /* Backgrounds ------------------------------------------------------- */

  const backgrounds = {

    meshDrift(ctx, c) {
      const { w, h, p, t, u } = c;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, p.bg);
      g.addColorStop(1, p.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Three slow blobs on different periods, so the field never visibly
      // repeats inside a watch.
      const blobs = [
        { c: p.accent, r: 0.55, sx: 0.031, sy: 0.019, a: 0.16 },
        { c: p.accent2, r: 0.45, sx: -0.023, sy: 0.027, a: 0.14 },
        { c: p.accent2, r: 0.3, sx: 0.017, sy: -0.013, a: 0.08 }
      ];
      ctx.globalCompositeOperation = 'lighter';
      blobs.forEach((b, i) => {
        const x = w * (0.5 + 0.36 * Math.sin(t * b.sx + i * 2.1));
        const y = h * (0.5 + 0.3 * Math.cos(t * b.sy + i * 1.3));
        const r = h * b.r;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, ML.rgba(b.c, b.a));
        rg.addColorStop(1, ML.rgba(b.c, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
    },

    gradientPulse(ctx, c) {
      const { w, h, p, t, scene } = c;
      // Each scene gets its own hue rotation off its seed: consecutive cards
      // never share a background, which is half of what reads as "edited".
      const k = (scene.seed % 360) / 360;
      const g = ctx.createLinearGradient(0, h, w, 0);
      g.addColorStop(0, p.bg);
      g.addColorStop(0.55, ML.mix(p.bg2, p.accent2, 0.18 + 0.12 * Math.sin(t * 0.4 + k * 6.28)));
      g.addColorStop(1, p.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const cx = w * (0.5 + 0.12 * Math.sin(t * 0.5 + k * 9));
      const cy = h * (0.42 + 0.08 * Math.cos(t * 0.37));
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.7);
      rg.addColorStop(0, ML.rgba(p.accent, 0.2));
      rg.addColorStop(1, ML.rgba(p.accent, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    },

    gridPlot(ctx, c) {
      const { w, h, p, t, u } = c;
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, ML.rgba(p.bg2, 1));
      g.addColorStop(1, ML.rgba(p.bg, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const step = 64 * u;
      const drift = (t * 6 * u) % step;
      ctx.lineWidth = Math.max(1, 1.1 * u);
      ctx.strokeStyle = ML.rgba(p.accent2, 0.09);
      ctx.beginPath();
      for (let x = -step + drift; x < w + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = -step + drift; y < h + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      // A baseline glow along the bottom so charts feel seated on something.
      const bg2 = ctx.createLinearGradient(0, h, 0, h - 220 * u);
      bg2.addColorStop(0, ML.rgba(p.accent, 0.1));
      bg2.addColorStop(1, ML.rgba(p.accent, 0));
      ctx.fillStyle = bg2;
      ctx.fillRect(0, h - 220 * u, w, 220 * u);
    },

    paper(ctx, c) {
      const { w, h, p, u, scene } = c;
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
      vg.addColorStop(0, ML.rgba(p.bg, 0));
      vg.addColorStop(1, ML.rgba(p.bg2, 0.9));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // Fibre speckle, seeded per scene so it holds still within a shot.
      const rnd = ML.rng(scene.seed);
      ctx.fillStyle = ML.rgba(p.muted, 0.055);
      for (let i = 0; i < 500; i++) {
        const x = rnd() * w, y = rnd() * h, s = (0.6 + rnd() * 1.6) * u;
        ctx.fillRect(x, y, s * 2.6, s);
      }
      // Ruled margin, the cue that says "notebook" in one glance.
      ctx.strokeStyle = ML.rgba(p.accent, 0.22);
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(96 * u, 0); ctx.lineTo(96 * u, h);
      ctx.stroke();
    },

    speedLines(ctx, c) {
      const { w, h, p, t, u, scene, phase } = c;
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.9);
      g.addColorStop(0, ML.rgba(p.bg2, 0.95));
      g.addColorStop(1, ML.rgba(p.bg, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Radial lines rushing outward, strongest on the scene's first beat.
      const rnd = ML.rng(scene.seed);
      const energy = 0.35 + 0.65 * Math.pow(1 - phase, 2);
      const cx = w / 2, cy = h * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.5 * energy;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2;
        const inner = h * (0.28 + rnd() * 0.2) * (1 + 0.3 * Math.sin(t * 2 + i));
        const outer = h * (0.8 + rnd() * 0.5);
        const wdt = (0.6 + rnd() * 3.2) * u;
        ctx.strokeStyle = rnd() > 0.82 ? ML.rgba(p.accent, 0.5) : ML.rgba(p.ink, 0.16);
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }
      ctx.restore();
    },

    filmDrift(ctx, c) {
      const { w, h, p, t, u, scene } = c;
      const g = ctx.createLinearGradient(0, 0, w * 0.6, h);
      g.addColorStop(0, p.bg2);
      g.addColorStop(1, p.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // A slow lit plane, as if a light were tracking across a set.
      const x = w * (0.3 + 0.4 * Math.sin(t * 0.045 + (scene.seed % 100) / 30));
      const rg = ctx.createRadialGradient(x, h * 0.35, 0, x, h * 0.35, h * 0.95);
      rg.addColorStop(0, ML.rgba(p.accent, 0.13));
      rg.addColorStop(1, ML.rgba(p.accent, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // Grain: one seeded field, offset per frame so it shimmers like film.
      const rnd = ML.rng(scene.seed + Math.floor(t * 24));
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = p.ink;
      for (let i = 0; i < 340; i++) ctx.fillRect(rnd() * w, rnd() * h, 1.4 * u, 1.4 * u);
      ctx.globalAlpha = 1;
    },

    auroraField(ctx, c) {
      const { w, h, p, t, u } = c;
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);

      // Stacked sine ribbons on incommensurable periods: the field never
      // returns to the same arrangement, which is the point over three hours.
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 5; b++) {
        const col = b % 2 ? p.accent2 : p.accent;
        const amp = h * (0.05 + b * 0.022);
        const yBase = h * (0.3 + b * 0.11);
        const sp = 0.013 + b * 0.0037;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12 * u) {
          const n = Math.sin(x / (w * 0.31) + t * sp + b) * 0.6
                  + Math.sin(x / (w * 0.13) - t * sp * 1.7 + b * 2) * 0.4;
          ctx.lineTo(x, yBase + n * amp);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - amp, 0, h);
        g.addColorStop(0, ML.rgba(col, 0.16));
        g.addColorStop(1, ML.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Fixed starfield, seeded once — stars that swim are distracting.
      const rnd = ML.rng(9001);
      ctx.fillStyle = ML.rgba(p.ink, 0.5);
      for (let i = 0; i < 150; i++) {
        const x = rnd() * w, y = rnd() * h * 0.7;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.6 + i));
        ctx.globalAlpha = 0.18 * tw;
        ctx.fillRect(x, y, 2 * u, 2 * u);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* Layout helpers ---------------------------------------------------- */

  /* The safe box every layout writes inside. Portrait leaves more room at the
   * bottom because that is where the platform puts its own controls and
   * caption furniture. */
  function safeBox(c) {
    const { w, h } = c;
    const portrait = h > w;
    const mx = w * (portrait ? 0.085 : 0.09);
    const top = h * (portrait ? 0.16 : 0.13);
    const bottom = h * (portrait ? 0.26 : 0.16);
    return { x: mx, y: top, w: w - mx * 2, h: h - top - bottom };
  }

  /* Entry animation. Returns the alpha and the offsets a layout applies to
   * whatever it draws, so every style animates in consistently. */
  function entry(c, delay) {
    const d = delay || 0;
    // The hook animates in roughly twice as fast. It has about three seconds
    // to do its whole job, and half a second of that spent fading up is half a
    // second the viewer spends looking at an empty frame.
    const window = c.scene.hook ? 0.24 : 0.52;
    const local = ML.clamp((c.t - c.scene.start - d) / window, 0, 1);
    const kind = c.tl.style.motion.entry;
    const out = { a: local, dx: 0, dy: 0, s: 1, rot: 0 };

    if (kind === 'riseIn') { out.dy = (1 - ML.ease.outQuint(local)) * 48 * c.u; out.a = ML.ease.out(local); }
    else if (kind === 'popIn') { out.s = 0.86 + 0.14 * ML.ease.spring(local); out.a = ML.clamp(local * 2.4, 0, 1); }
    else if (kind === 'slamIn') {
      out.s = 1 + (1 - ML.ease.outQuint(local)) * 0.4;
      out.a = ML.clamp(local * 3.2, 0, 1);
      out.rot = (1 - ML.ease.outQuint(local)) * 0.035;
    }
    else if (kind === 'slideIn') { out.dx = (1 - ML.ease.outQuint(local)) * -70 * c.u; out.a = ML.ease.out(local); }
    else if (kind === 'fadeUp') { out.dy = (1 - ML.ease.inOut(local)) * 22 * c.u; out.a = ML.ease.inOut(local); }
    else if (kind === 'drawOn') { out.a = 1; out.draw = ML.ease.inOut(local); }

    // The hook never starts from nothing. Frame zero is the frame that decides
    // the click, and an empty one reads as a video that has not loaded.
    if (c.scene.hook) out.a = 0.45 + 0.55 * out.a;

    // Every layout fades on the way out too, so a cut is never a hard pop
    // unless the style asked for one.
    const outPhase = ML.clamp((c.scene.end - c.t) / 0.3, 0, 1);
    out.a *= outPhase;
    return out;
  }

  function applyEntry(ctx, e, cx, cy) {
    ctx.globalAlpha *= ML.clamp(e.a, 0, 1);
    ctx.translate(cx + e.dx, cy + e.dy);
    if (e.rot) ctx.rotate(e.rot);
    if (e.s !== 1) ctx.scale(e.s, e.s);
    ctx.translate(-cx, -cy);
  }

  /* Layouts ------------------------------------------------------------ */

  const layouts = {

    bigType(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, box.x, box.y + box.h / 2);

      const fit = ML.fitText(ctx, scene.display, {
        size: 116 * u, minSize: 40 * u, weight: 800,
        maxWidth: box.w, maxHeight: box.h * 0.7, maxLines: 4
      });

      // Accent rule above the line — a fixed anchor the eye lands on first.
      const ruleY = box.y + box.h / 2 - fit.height / 2 - 46 * u;
      ctx.fillStyle = p.accent;
      ctx.fillRect(box.x, ruleY, ML.lerp(0, 130 * u, ML.ease.outQuint(ML.clamp((c.t - scene.start) / 0.6, 0, 1))), 8 * u);

      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, box.x, box.y + box.h / 2 - fit.height / 2, fit.size, 1.12, 'left');
      ctx.restore();
    },

    splitStat(ctx, c) {
      const { p, u, scene, w } = c;
      const box = safeBox(c);
      const e = entry(c);
      const portrait = c.h > c.w;
      ctx.save();
      applyEntry(ctx, e, box.x, box.y + box.h / 2);

      const gap = 40 * u;
      const leftW = portrait ? box.w : box.w * 0.46;
      const stat = scene.stat;

      // Left: the number, or the scene index when there is no number to show.
      const big = stat ? formatCount(stat, c) : String(scene.i + 1).padStart(2, '0');
      const bigFit = ML.fitText(ctx, big, {
        size: portrait ? 190 * u : 220 * u, minSize: 60 * u, weight: 800,
        maxWidth: leftW, maxHeight: box.h * (portrait ? 0.3 : 0.6), maxLines: 1
      });
      ctx.fillStyle = p.accent;
      ctx.font = bigFit.font;
      const topY = portrait ? box.y + box.h * 0.1 : box.y + box.h / 2 - bigFit.size * 0.66;
      ctx.textAlign = 'left';
      ctx.fillText(bigFit.lines[0], box.x, topY + bigFit.size);

      // Right: the sentence the number belongs to.
      const rx = portrait ? box.x : box.x + leftW + gap;
      const ry = portrait ? topY + bigFit.size * 1.4 : box.y + box.h / 2 - box.h * 0.24;
      const rw = portrait ? box.w : box.w - leftW - gap;
      const fit = ML.fitText(ctx, scene.display, {
        size: portrait ? 74 * u : 62 * u, minSize: 26 * u, weight: 700,
        maxWidth: rw, maxHeight: box.h * 0.45, maxLines: 5
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, rx, ry, fit.size, 1.16, 'left');
      ctx.restore();
    },

    counterCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

      const stat = scene.stat || { value: scene.i + 1, suffix: '', label: '', decimals: 0 };
      // The count runs over the first 60% of the shot, then rests on the value
      // — resting matters, an animation still moving at the cut reads as a bug.
      const prog = ML.ease.outQuint(ML.clamp((c.t - scene.start) / (scene.dur * 0.6), 0, 1));
      const shown = { ...stat, value: stat.value * prog };

      const label = stat.label || scene.display;
      const bigFit = ML.fitText(ctx, formatCount({ ...stat, value: stat.value }, c), {
        size: 300 * u, minSize: 90 * u, weight: 800,
        maxWidth: box.w, maxHeight: box.h * 0.5, maxLines: 1
      });

      ctx.textAlign = 'center';
      ctx.fillStyle = p.accent;
      ctx.font = bigFit.font;
      const cy = box.y + box.h * 0.42;
      ctx.fillText(formatCount(shown, c), c.w / 2, cy);

      // Underline that fills with the count, so the number has a progress cue.
      ctx.fillStyle = ML.rgba(p.accent2, 0.35);
      const uw = box.w * 0.5;
      ctx.fillRect(c.w / 2 - uw / 2, cy + 34 * u, uw, 6 * u);
      ctx.fillStyle = p.accent2;
      ctx.fillRect(c.w / 2 - uw / 2, cy + 34 * u, uw * prog, 6 * u);

      const fit = ML.fitText(ctx, label, {
        size: 62 * u, minSize: 26 * u, weight: 600,
        maxWidth: box.w * 0.86, maxHeight: box.h * 0.3, maxLines: 3
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, cy + 84 * u, fit.size, 1.15, 'center');
      ctx.restore();
    },

    barChart(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, box.x, box.y + box.h / 2);

      const items = (scene.items.length ? scene.items : [scene.display]).slice(0, 5);
      // Values come from any number in the item; otherwise a descending ramp,
      // which still reads as a ranking rather than as fake data.
      const values = items.map((s, i) => {
        const m = s.match(/(\d[\d,]*(?:\.\d+)?)/);
        return m ? parseFloat(m[1].replace(/,/g, '')) : (items.length - i) * 20;
      });
      const max = Math.max(...values, 1);

      ctx.font = `700 ${44 * u}px ${ML.FONT}`;
      const titleFit = ML.fitText(ctx, scene.chapterTitle || scene.display, {
        size: 58 * u, minSize: 26 * u, weight: 800, maxWidth: box.w, maxHeight: 130 * u, maxLines: 2
      });
      ctx.fillStyle = p.ink;
      ctx.font = titleFit.font;
      ML.drawLines(ctx, titleFit.lines, box.x, box.y, titleFit.size, 1.1, 'left');

      const top = box.y + titleFit.height + 40 * u;
      const rowH = Math.min(96 * u, (box.h - titleFit.height - 40 * u) / items.length);
      items.forEach((label, i) => {
        const g = ML.ease.outQuint(ML.clamp((c.t - scene.start - 0.18 * i) / 0.7, 0, 1));
        const y = top + i * rowH;
        const barH = rowH * 0.44;
        const full = box.w * 0.98;
        ctx.fillStyle = ML.rgba(p.ink, 0.08);
        ML.roundRect(ctx, box.x, y + rowH * 0.32, full, barH, barH / 2);
        ctx.fill();
        ctx.fillStyle = i === 0 ? p.accent : ML.mix(p.accent, p.accent2, i / items.length);
        ML.roundRect(ctx, box.x, y + rowH * 0.32, Math.max(barH, full * (values[i] / max) * g), barH, barH / 2);
        ctx.fill();

        const lf = ML.fitText(ctx, label, {
          size: barH * 0.62, minSize: 18 * u, weight: 700, maxWidth: full * 0.9, maxHeight: barH, maxLines: 1
        });
        ctx.fillStyle = p.bg;
        ctx.font = lf.font;
        ctx.textAlign = 'left';
        ctx.globalAlpha *= g;
        ctx.fillText(lf.lines[0], box.x + 22 * u, y + rowH * 0.32 + barH * 0.72);
        ctx.globalAlpha /= g || 1;
      });
      c.painted = { x: box.x, y: box.y, w: box.w, h: top + items.length * rowH - box.y };
      ctx.restore();
    },

    bulletStack(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, box.x, box.y + box.h / 2);

      const items = scene.items.length ? scene.items.slice(0, 5) : [scene.display];
      const titleText = scene.items.length ? (scene.chapterTitle || scene.display) : '';
      let y = box.y;

      if (titleText) {
        const tf = ML.fitText(ctx, titleText, {
          size: 62 * u, minSize: 28 * u, weight: 800, maxWidth: box.w, maxHeight: 150 * u, maxLines: 2
        });
        ctx.fillStyle = p.accent;
        ctx.font = tf.font;
        ML.drawLines(ctx, tf.lines, box.x, y, tf.size, 1.1, 'left');
        y += tf.height + 34 * u;
      }

      const avail = box.h - (y - box.y);
      const rowH = avail / items.length;
      items.forEach((item, i) => {
        // Each line arrives on its own, staggered — the stack builds while the
        // narrator reads down it rather than appearing all at once.
        const g = ML.ease.outQuint(ML.clamp((c.t - scene.start - (scene.dur / items.length) * i * 0.75) / 0.5, 0, 1));
        const f = ML.fitText(ctx, item, {
          size: 54 * u, minSize: 22 * u, weight: 600,
          maxWidth: box.w - 62 * u, maxHeight: rowH * 0.82, maxLines: 2
        });
        ctx.save();
        ctx.globalAlpha *= g;
        ctx.translate((1 - g) * 30 * u, 0);
        ctx.fillStyle = p.accent2;
        ctx.beginPath();
        ctx.arc(box.x + 13 * u, y + i * rowH + f.size * 0.62, 11 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.ink;
        ctx.font = f.font;
        ML.drawLines(ctx, f.lines, box.x + 48 * u, y + i * rowH, f.size, 1.12, 'left');
        ctx.restore();
      });
      c.painted = { x: box.x, y: box.y, w: box.w, h: y + items.length * rowH - box.y };
      ctx.restore();
    },

    quoteCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

      const text = scene.display.replace(/^["“'']|["”'']$/g, '');
      const fit = ML.fitText(ctx, text, {
        size: 92 * u, minSize: 34 * u, weight: 500, family: ML.FONT_SERIF,
        maxWidth: box.w * 0.84, maxHeight: box.h * 0.6, maxLines: 5
      });

      ctx.textAlign = 'center';
      ctx.fillStyle = ML.rgba(p.accent, 0.5);
      ctx.font = `800 ${190 * u}px ${ML.FONT_SERIF}`;
      ctx.fillText('“', c.w / 2, box.y + box.h / 2 - fit.height / 2 - 6 * u);

      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, box.y + box.h / 2 - fit.height / 2 + 40 * u, fit.size, 1.24, 'center');
      ctx.restore();
    },

    kineticLine(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const words = scene.words || [];
      if (!words.length) return layouts.bigType(ctx, c);

      // Words are laid out into a fixed block once and then revealed on their
      // own timings, so the line never reflows mid-shot.
      const size = ML.fitText(ctx, words.map(x => x.w).join(' '), {
        size: 118 * u, minSize: 42 * u, weight: 800,
        maxWidth: box.w, maxHeight: box.h * 0.8, maxLines: 6
      });
      ctx.font = size.font;

      const lines = [];
      let line = [];
      let lw = 0;
      const spaceW = ctx.measureText(' ').width;
      for (const item of words) {
        const ww = ctx.measureText(item.w).width;
        if (lw + ww > box.w && line.length) { lines.push({ items: line, w: lw }); line = []; lw = 0; }
        line.push({ ...item, ww });
        lw += ww + spaceW;
      }
      if (line.length) lines.push({ items: line, w: lw });

      const lineH = size.size * 1.14;
      const top = box.y + box.h / 2 - (lines.length * lineH) / 2;
      const outPhase = ML.clamp((scene.end - c.t) / 0.3, 0, 1);

      ctx.save();
      ctx.globalAlpha *= outPhase;
      ctx.textAlign = 'left';
      lines.forEach((ln, li) => {
        let x = c.w / 2 - (ln.w - spaceW) / 2;
        const y = top + li * lineH + size.size;
        for (const item of ln.items) {
          const g = ML.clamp((c.t - item.start + 0.12) / 0.2, 0, 1);
          const pop = ML.ease.spring(g);
          // The word being spoken right now is the accent one. That single
          // rule is what makes kinetic type readable with the sound off.
          const live = c.t >= item.start && c.t < item.end;
          ctx.save();
          ctx.globalAlpha *= ML.clamp(g * 1.6, 0, 1) * (c.t < item.start ? 0 : 1);
          ctx.translate(x + item.ww / 2, y - size.size * 0.34);
          ctx.scale(0.82 + 0.18 * pop, 0.82 + 0.18 * pop);
          ctx.translate(-(x + item.ww / 2), -(y - size.size * 0.34));
          ctx.fillStyle = live ? p.accent : p.ink;
          ctx.font = size.font;
          ctx.fillText(item.w, x, y);
          ctx.restore();
          x += item.ww + spaceW;
        }
      });
      ctx.restore();
      c.painted = { x: box.x, y: top, w: box.w, h: lines.length * lineH };
    },

    impactCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

      const fit = ML.fitText(ctx, scene.display.toUpperCase(), {
        size: 150 * u, minSize: 48 * u, weight: 800,
        maxWidth: box.w * 0.94, maxHeight: box.h * 0.6, maxLines: 4
      });

      // Slanted plate behind the type: the comic-panel read.
      const bh = fit.height + 56 * u;
      const by = box.y + box.h / 2 - bh / 2;
      ctx.save();
      ctx.translate(c.w / 2, by + bh / 2);
      ctx.rotate(-0.028);
      ctx.fillStyle = ML.rgba(p.bg, 0.82);
      ctx.fillRect(-box.w / 2 - 20 * u, -bh / 2, box.w + 40 * u, bh);
      ctx.fillStyle = p.accent;
      ctx.fillRect(-box.w / 2 - 20 * u, bh / 2 - 9 * u, box.w + 40 * u, 9 * u);
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      ctx.strokeStyle = ML.rgba(p.bg, 0.9);
      ctx.lineWidth = 10 * u;
      ctx.lineJoin = 'round';
      fit.lines.forEach((ln, i) => {
        const y = by + 28 * u + fit.size + i * fit.size * 1.12;
        ctx.strokeText(ln, c.w / 2, y);
        ctx.fillText(ln, c.w / 2, y);
      });
      c.painted = { x: box.x, y: by, w: box.w, h: bh };
      ctx.restore();
    },

    rankCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, box.x, box.y + box.h / 2);

      const rank = scene.rank != null ? scene.rank : scene.i + 1;
      const numFit = ML.fitText(ctx, '#' + rank, {
        size: 250 * u, minSize: 80 * u, weight: 800,
        maxWidth: box.w * 0.4, maxHeight: box.h * 0.4, maxLines: 1
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = p.accent;
      ctx.font = numFit.font;
      ctx.fillText(numFit.lines[0], box.x, box.y + numFit.size * 0.86);

      const fit = ML.fitText(ctx, scene.display, {
        size: 84 * u, minSize: 30 * u, weight: 800,
        maxWidth: box.w, maxHeight: box.h * 0.45, maxLines: 4
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, box.x, box.y + numFit.size * 1.02, fit.size, 1.12, 'left');
      ctx.restore();
    },

    sketchCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      const draw = e.draw != null ? e.draw : 1;
      ctx.save();
      ctx.globalAlpha *= ML.clamp((scene.end - c.t) / 0.3, 0, 1);

      const fit = ML.fitText(ctx, scene.display, {
        size: 96 * u, minSize: 34 * u, weight: 700,
        maxWidth: box.w * 0.62, maxHeight: box.h * 0.6, maxLines: 4
      });

      // Underline drawn as a wobbling hand stroke that lands with the words.
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      const painted = ML.drawLines(ctx, fit.lines, box.x + 60 * u, box.y + box.h * 0.18, fit.size, 1.18, 'left');

      const rnd = ML.rng(scene.seed);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 7 * u;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const uy = painted.y + painted.h + 26 * u;
      const uw = painted.w * draw;
      for (let x = 0; x <= uw; x += 14 * u) {
        const y = uy + Math.sin(x / (44 * u)) * 4 * u + (rnd() - 0.5) * 3 * u;
        if (x === 0) ctx.moveTo(box.x + 60 * u, y); else ctx.lineTo(box.x + 60 * u + x, y);
      }
      ctx.stroke();

      // A simple seeded glyph on the right: circles and connectors that read as
      // a diagram being sketched out beside the point.
      const gx = box.x + box.w * 0.76, gy = box.y + box.h * 0.55, gr = Math.min(box.w * 0.2, box.h * 0.3);
      ctx.strokeStyle = ML.rgba(p.ink, 0.75);
      ctx.lineWidth = 5 * u;
      const nodes = 3 + (scene.seed % 3);
      for (let i = 0; i < nodes; i++) {
        const a = (i / nodes) * Math.PI * 2 + (scene.seed % 10) / 10;
        const nx = gx + Math.cos(a) * gr * 0.7, ny = gy + Math.sin(a) * gr * 0.7;
        const seg = ML.clamp(draw * nodes - i, 0, 1);
        if (seg <= 0) continue;
        ctx.beginPath();
        ctx.arc(nx, ny, gr * 0.22, 0, Math.PI * 2 * seg);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + (nx - gx) * seg, gy + (ny - gy) * seg);
        ctx.stroke();
      }
      c.painted = painted;
      ctx.restore();
    },

    slateCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

      const isChapter = scene.kind === 'chapter';
      const label = isChapter ? `Chapter ${scene.chapter + 1}` : (scene.chapterTitle || '');
      if (label) {
        ctx.textAlign = 'center';
        ctx.fillStyle = p.accent;
        ctx.font = `700 ${34 * u}px ${ML.FONT_MONO}`;
        ctx.fillText(label.toUpperCase(), c.w / 2, box.y + box.h * 0.36);
      }

      const fit = ML.fitText(ctx, scene.display, {
        size: isChapter ? 130 * u : 86 * u, minSize: 32 * u, weight: isChapter ? 800 : 500,
        family: isChapter ? ML.FONT : ML.FONT_SERIF,
        maxWidth: box.w * 0.82, maxHeight: box.h * 0.5, maxLines: 4
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, box.y + box.h * 0.42, fit.size, 1.18, 'center');

      // Hairline rules top and bottom: the slate framing.
      const g = ML.ease.outQuint(ML.clamp((c.t - scene.start) / 0.8, 0, 1));
      ctx.strokeStyle = ML.rgba(p.accent, 0.5);
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(c.w / 2 - box.w * 0.3 * g, box.y + box.h * 0.28);
      ctx.lineTo(c.w / 2 + box.w * 0.3 * g, box.y + box.h * 0.28);
      ctx.stroke();
      ctx.restore();
    },

    lowerThird(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      ctx.globalAlpha *= ML.clamp(e.a, 0, 1);

      const y = box.y + box.h * 0.66;
      const g = ML.ease.outQuint(ML.clamp((c.t - scene.start) / 0.55, 0, 1));
      const fit = ML.fitText(ctx, scene.display, {
        size: 66 * u, minSize: 26 * u, weight: 700,
        maxWidth: box.w * 0.66, maxHeight: box.h * 0.24, maxLines: 3
      });

      const padX = 34 * u, padY = 26 * u;
      const bw = (fit.lines.reduce((m, l) => { ctx.font = fit.font; return Math.max(m, ctx.measureText(l).width); }, 0)) + padX * 2;
      ctx.fillStyle = ML.rgba(p.bg, 0.72);
      ctx.fillRect(box.x, y, bw * g, fit.height + padY * 2);
      ctx.fillStyle = p.accent;
      ctx.fillRect(box.x, y, 8 * u, (fit.height + padY * 2) * g);

      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, y, bw * g, fit.height + padY * 2);
      ctx.clip();
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, box.x + padX, y + padY, fit.size, 1.14, 'left');
      ctx.restore();
      ctx.restore();
    },

    markerCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      const e = entry(c);
      ctx.save();
      applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

      const g = ML.ease.outQuint(ML.clamp((c.t - scene.start) / 0.6, 0, 1));
      ctx.fillStyle = p.accent;
      ctx.fillRect(c.w / 2 - box.w * 0.5 * g, box.y + box.h * 0.44, box.w * g, 10 * u);

      ctx.textAlign = 'center';
      ctx.fillStyle = p.muted;
      ctx.font = `700 ${32 * u}px ${ML.FONT_MONO}`;
      ctx.fillText(`PART ${String(scene.chapter + 1).padStart(2, '0')}`, c.w / 2, box.y + box.h * 0.38);

      const fit = ML.fitText(ctx, scene.display, {
        size: 124 * u, minSize: 40 * u, weight: 800,
        maxWidth: box.w * 0.9, maxHeight: box.h * 0.34, maxLines: 3
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, box.y + box.h * 0.5, fit.size, 1.1, 'center');
      ctx.restore();
    },

    ambientCard(ctx, c) {
      const { p, u, scene } = c;
      const box = safeBox(c);
      // Ambient text breathes in and out and rests dark for most of the shot,
      // because the video is meant to be beside the work, not in front of it.
      const ph = ML.phase(c.t, scene.start, scene.dur);
      const a = Math.min(ML.clamp(ph / 0.12, 0, 1), ML.clamp((1 - ph) / 0.12, 0, 1)) * 0.85;
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= a;
      const fit = ML.fitText(ctx, scene.display, {
        size: 74 * u, minSize: 28 * u, weight: 300,
        maxWidth: box.w * 0.7, maxHeight: box.h * 0.4, maxLines: 4
      });
      ctx.fillStyle = p.ink;
      ctx.font = fit.font;
      ctx.textAlign = 'center';
      c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, box.y + box.h * 0.42, fit.size, 1.4, 'center');
      ctx.restore();
    }
  };

  /* Device cards. The retention furniture gets its own look so it is legible
   * as furniture — the viewer learns what an open loop card means. */

  function deviceCard(ctx, c) {
    const { p, u, scene } = c;
    const box = safeBox(c);
    const e = entry(c);
    const open = scene.device === 'open-loop';
    ctx.save();
    applyEntry(ctx, e, c.w / 2, box.y + box.h / 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = p.accent;
    ctx.font = `800 ${34 * u}px ${ML.FONT_MONO}`;
    ctx.fillText(open ? 'STAY FOR' : 'BACK TO THE START', c.w / 2, box.y + box.h * 0.36);

    const fit = ML.fitText(ctx, scene.display, {
      size: 108 * u, minSize: 34 * u, weight: 800,
      maxWidth: box.w * 0.86, maxHeight: box.h * 0.4, maxLines: 4
    });
    ctx.fillStyle = p.ink;
    ctx.font = fit.font;
    c.painted = ML.drawLines(ctx, fit.lines, c.w / 2, box.y + box.h * 0.42, fit.size, 1.12, 'center');

    if (!open) {
      ctx.fillStyle = p.muted;
      ctx.font = `600 ${36 * u}px ${ML.FONT}`;
      ctx.fillText('Watch it again with the answer.', c.w / 2, box.y + box.h * 0.42 + fit.height + 58 * u);
    }
    ctx.restore();
  }

  /* Overlays ----------------------------------------------------------- */

  function progressRail(ctx, c) {
    const { w, h, p, u, tl } = c;
    const done = ML.clamp(c.t / tl.duration, 0, 1);
    const railH = 8 * u;
    ctx.fillStyle = ML.rgba(p.ink, 0.12);
    ctx.fillRect(0, h - railH, w, railH);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, h - railH, w * done, railH);
    // Chapter ticks, so the length is legible at a glance rather than a guess.
    ctx.fillStyle = ML.rgba(p.ink, 0.45);
    for (const ch of tl.chapters) {
      if (ch.start <= 0) continue;
      ctx.fillRect((ch.start / tl.duration) * w - u, h - railH - 5 * u, 2 * u, railH + 5 * u);
    }
  }

  function chapterChip(ctx, c) {
    const { p, u, tl, h } = c;
    if (!tl.chapters.length) return;
    // Not over the hook: the badge already sits there, and a section label is
    // noise in the one window that decides whether anybody stays.
    if (c.scene.hook) return;
    let cur = tl.chapters[0];
    for (const ch of tl.chapters) if (ch.start <= c.t) cur = ch;
    if (!cur.title) return;
    const label = cur.title;
    ctx.save();
    ctx.font = `700 ${28 * u}px ${ML.FONT}`;
    const tw = ctx.measureText(label).width;
    const pad = 20 * u;
    const x = 44 * u, y = 44 * u;
    ctx.fillStyle = ML.rgba(p.bg, 0.55);
    ML.roundRect(ctx, x, y, tw + pad * 2, 52 * u, 26 * u);
    ctx.fill();
    ctx.fillStyle = ML.rgba(p.ink, 0.82);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + pad, y + 27 * u);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function captionBand(ctx, c) {
    const { w, h, p, u, tl } = c;
    if (tl.style.captions === 'none') return;
    // Linear scan is fine here: captions are looked up once per frame and the
    // search starts from the scene, not the top of the timeline.
    const cap = tl.captions.find(x => c.t >= x.start && c.t < x.end);
    if (!cap) return;
    // A caption that repeats the card word for word is the same line twice on
    // one frame. Happens on short hooks, where the headline is the whole line.
    const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (c.scene.display && norm(c.scene.display).includes(norm(cap.text))) return;

    const portrait = h > w;
    const size = (portrait ? 62 : 46) * u;
    ctx.save();
    ctx.font = `800 ${size}px ${ML.FONT}`;
    const lines = ML.wrap(ctx, cap.text, ctx.font, w * 0.82);
    const lineH = size * 1.16;
    const blockH = lines.length * lineH;
    const y = h * (portrait ? 0.78 : 0.845) - blockH / 2;

    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      const ly = y + size + i * lineH;
      const tw = ctx.measureText(line).width;
      ctx.fillStyle = ML.rgba(p.bg, 0.66);
      ML.roundRect(ctx, w / 2 - tw / 2 - 22 * u, ly - size * 0.84, tw + 44 * u, size * 1.18, 12 * u);
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.fillText(line, w / 2, ly);
    });
    ctx.restore();
  }

  function hookBadge(ctx, c) {
    const { w, h, p, u, scene } = c;
    if (!scene.hook) return;
    const g = ML.ease.spring(ML.clamp((c.t - scene.start) / 0.5, 0, 1));
    ctx.save();
    ctx.globalAlpha *= ML.clamp((scene.end - c.t) / 0.4, 0, 1);
    ctx.translate(w * 0.5, h * (h > w ? 0.115 : 0.09));
    ctx.scale(g, g);
    ctx.font = `800 ${30 * u}px ${ML.FONT_MONO}`;
    const label = 'THE QUESTION';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = p.accent;
    ML.roundRect(ctx, -tw / 2 - 22 * u, -22 * u, tw + 44 * u, 46 * u, 23 * u);
    ctx.fill();
    ctx.fillStyle = p.bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1 * u);
    ctx.restore();
  }

  function letterbox(ctx, c) {
    const { w, h, u } = c;
    const bar = h * 0.055;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
  }

  function interruptFlash(ctx, c) {
    const { w, h, p, scene } = c;
    if (!scene.interrupt) return;
    // Two frames of light on the cut. Short enough to feel like an edit rather
    // than a transition, which is exactly the arousal spike it is there for.
    const a = ML.clamp(1 - (c.t - scene.start) / 0.12, 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * 0.3;
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* Camera ------------------------------------------------------------- */

  function camera(ctx, c) {
    const { w, h, scene, tl } = c;
    const kind = tl.style.motion.camera;
    const ph = ML.phase(c.t, scene.start, scene.dur);
    let s = 1, dx = 0, dy = 0;

    if (kind === 'punch') {
      // A slow push across the shot, plus a snap on the interrupt frames.
      s = 1 + 0.028 * ph + (scene.interrupt ? scene.punch * (1 - ML.ease.outQuint(ML.clamp((c.t - scene.start) / 0.45, 0, 1))) : 0);
    } else if (kind === 'kenBurns') {
      const dir = scene.seed % 2 ? 1 : -1;
      s = 1.04 + 0.05 * ph;
      dx = dir * (ph - 0.5) * w * 0.03;
      dy = (scene.seed % 3 ? 1 : -1) * (ph - 0.5) * h * 0.02;
    } else if (kind === 'drift') {
      s = 1 + 0.014 * Math.sin(ph * Math.PI);
    } else if (kind === 'shake') {
      const k = ML.clamp(1 - (c.t - scene.start) / 0.35, 0, 1);
      const r = ML.rng(scene.seed + Math.floor(c.t * 30));
      s = 1 + 0.02 * ph;
      dx = (r() - 0.5) * 26 * c.u * k;
      dy = (r() - 0.5) * 26 * c.u * k;
    }

    ctx.translate(w / 2 + dx, h / 2 + dy);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
  }

  /* Number formatting shared by the stat layouts. */
  function formatCount(stat, c) {
    // Keep the precision the script wrote. "45.7%" rounded to "46%" is a
    // different claim, and on a card it is the claim.
    const dec = stat.decimals && stat.value < 1000 ? Math.min(stat.decimals, 2) : 0;
    const n = stat.value.toFixed(dec);
    const withCommas = Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return withCommas + (stat.suffix || '');
  }

  /* Frame -------------------------------------------------------------- */

  function frame(ctx, tl, t) {
    const scene = ML.timeline.sceneAt(tl, t);
    const { w, h } = tl;
    // The caller's transform is left alone deliberately: the preview, the
    // storyboard thumbnails and the preflight geometry check all draw the full
    // frame scaled down, and resetting it here would draw the top-left corner
    // of a 1080p frame into a 320px box.
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tl.palette.bg;
    ctx.fillRect(0, 0, w, h);

    if (!scene) { ctx.restore(); return; }

    const c = {
      w, h, t, tl, scene,
      p: tl.palette,
      u: h / 1000,
      phase: ML.phase(t, scene.start, scene.dur),
      painted: null
    };

    ctx.save();
    camera(ctx, c);
    (backgrounds[tl.style.background] || backgrounds.meshDrift)(ctx, c);

    if (tl.style.id === 'documentary') letterbox(ctx, c);

    const layout = scene.device ? deviceCard : (layouts[scene.layout] || layouts.bigType);
    ctx.save();
    layout(ctx, c);
    ctx.restore();
    ctx.restore();

    // Overlays sit outside the camera transform: furniture must not drift.
    interruptFlash(ctx, c);
    captionBand(ctx, c);
    hookBadge(ctx, c);
    if (tl.chapters.length > 1) chapterChip(ctx, c);
    if (tl.style.progressRail) progressRail(ctx, c);

    ctx.restore();
    return c;
  }

  /* Renders one scene into an offscreen canvas at its midpoint — used for the
   * storyboard strip and for the preflight geometry checks. */
  function still(tl, scene, width) {
    const cv = document.createElement('canvas');
    const scale = width / tl.w;
    cv.width = width;
    cv.height = Math.round(tl.h * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    // A hair past the entry animation so the card is drawn settled.
    const at = Math.min(scene.start + Math.max(0.7, scene.dur * 0.55), scene.end - 0.05);
    frame(ctx, tl, at);
    return cv;
  }

  return { frame, still, layouts, backgrounds, safeBox, formatCount };
})();
