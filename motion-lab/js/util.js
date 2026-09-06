/* Shared helpers. Everything here is pure and deterministic — the renderer
 * depends on that: the same timeline and the same t must always draw the same
 * frame, or exporting cannot be frame-exact. */

const ML = {};

ML.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
ML.lerp = (a, b, t) => a + (b - a) * t;
ML.round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;

/* Progress of t through [start, start+dur], clamped to 0..1. */
ML.phase = (t, start, dur) => (dur <= 0 ? 1 : ML.clamp((t - start) / dur, 0, 1));

/* Easing. Named so the style table reads like a brief. */
ML.ease = {
  linear: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  in: t => t * t * t,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: t => {
    const c = 1.70158, c3 = c + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  spring: t => {
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -9 * t) * Math.cos(t * 14);
  }
};

/* Deterministic PRNG. A scene's look must not change between the preview and
 * the export, so nothing anywhere calls Math.random(). */
ML.hash = str => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

ML.rng = seed => {
  let s = (typeof seed === 'string' ? ML.hash(seed) : seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

/* Time formatting. mmss is for YouTube chapter stamps, which need h:mm:ss once
 * a video passes an hour. */
ML.mmss = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

ML.duration = sec => {
  // Rounded to whole seconds first: rounding the remainder separately is how
  // you end up printing "7m 60s".
  const whole = Math.round(sec);
  if (whole < 60) return `${whole}s`;
  const m = Math.floor(whole / 60);
  if (m < 60) return `${m}m ${whole % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/* Colour ------------------------------------------------------------- */

ML.hexToRgb = hex => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};

ML.rgba = (hex, a) => {
  const [r, g, b] = ML.hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

ML.mix = (a, b, t) => {
  const x = ML.hexToRgb(a), y = ML.hexToRgb(b);
  const c = i => Math.round(ML.lerp(x[i], y[i], t));
  return `rgb(${c(0)},${c(1)},${c(2)})`;
};

/* WCAG relative luminance and contrast ratio — the preflight check for text
 * legibility uses these, so a style can never ship unreadable captions. */
ML.luminance = hex => {
  const [r, g, b] = ML.hexToRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

ML.contrast = (a, b) => {
  const l1 = ML.luminance(a), l2 = ML.luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/* Text layout --------------------------------------------------------- */

/* Wraps text to a pixel width at a given font. Returns the lines. */
ML.wrap = (ctx, text, font, maxWidth) => {
  ctx.font = font;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

/* Finds the largest font size at or below `size` that fits `text` into a box
 * in at most `maxLines` lines. This is what makes overflow structurally
 * impossible rather than something to eyeball. */
ML.fitText = (ctx, text, opts) => {
  const { size, minSize = 12, weight = 800, family = ML.FONT, maxWidth, maxHeight, lineHeight = 1.12, maxLines = 6 } = opts;
  for (let s = Math.round(size); s >= minSize; s -= Math.max(1, Math.round(s * 0.04))) {
    const font = `${weight} ${s}px ${family}`;
    const lines = ML.wrap(ctx, text, font, maxWidth);
    if (lines.length <= maxLines && lines.length * s * lineHeight <= maxHeight) {
      return { size: s, lines, font, height: lines.length * s * lineHeight };
    }
  }
  const font = `${weight} ${minSize}px ${family}`;
  return { size: minSize, lines: ML.wrap(ctx, text, font, maxWidth), font, height: 0, overflow: true };
};

ML.FONT = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
ML.FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
ML.FONT_SERIF = 'Georgia, "Times New Roman", serif';

/* Canvas primitives ---------------------------------------------------- */

ML.roundRect = (ctx, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/* Draws wrapped lines, returns the bounding box actually painted so the
 * safe-area check can test real geometry instead of an estimate. */
ML.drawLines = (ctx, lines, x, y, size, lineHeight, align) => {
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  let widest = 0;
  lines.forEach((line, i) => {
    const ly = y + size + i * size * lineHeight;
    ctx.fillText(line, x, ly);
    widest = Math.max(widest, ctx.measureText(line).width);
  });
  const left = align === 'center' ? x - widest / 2 : align === 'right' ? x - widest : x;
  return { x: left, y, w: widest, h: lines.length * size * lineHeight };
};

ML.download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

ML.text = (s) => document.createTextNode(String(s));

/* Builds an element without innerHTML, so script text — which is user input —
 * can never become markup. */
ML.el = (tag, attrs, children) => {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  if (children) for (const c of [].concat(children)) {
    if (c) n.appendChild(typeof c === 'string' ? ML.text(c) : c);
  }
  return n;
};
