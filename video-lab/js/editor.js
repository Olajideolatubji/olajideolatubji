/* The render pipeline. One draw function is used by both the live preview and
   the exporter, so what you see in the preview is what gets written to the file. */
window.VL = window.VL || {};

VL.editor = (function () {
  var U = VL.util;

  function defaultState(analysis, evaluation) {
    var f = evaluation.fixes;
    return {
      trimIn: 0,
      trimOut: analysis.base.meta.duration,
      aspect: 'source',
      zoom: 1,
      panX: 0,
      panY: 0,
      brightness: 1,
      contrast: 1,
      saturate: 1,
      warmth: 0,
      vignette: 0,
      punchIns: false,
      punchStrength: 0.14,
      speedDeadZones: false,
      deadSpeed: 1.8,
      progressBar: false,
      hookText: '',
      captions: [],
      audioGain: 0,
      suggested: f
    };
  }

  function even(n) {
    n = Math.max(2, Math.round(n));
    return n % 2 === 0 ? n : n + 1;
  }

  function targetAspect(meta, state) {
    return state.aspect === 'source' ? meta.aspect : state.aspect;
  }

  /* The region of the source frame that ends up on screen. */
  function cropRect(meta, state, zoomExtra) {
    var r = targetAspect(meta, state);
    var w = meta.width, h = meta.height;
    var cw, ch;
    if (w / h > r) { ch = h; cw = h * r; }
    else { cw = w; ch = w / r; }

    var z = Math.max(1, state.zoom * (zoomExtra || 1));
    cw /= z; ch /= z;

    var freeX = w - cw, freeY = h - ch;
    var x = freeX / 2 + (state.panX || 0) * freeX / 2;
    var y = freeY / 2 + (state.panY || 0) * freeY / 2;
    return {
      x: U.clamp(x, 0, Math.max(0, freeX)),
      y: U.clamp(y, 0, Math.max(0, freeY)),
      w: cw,
      h: ch
    };
  }

  function outputSize(meta, state) {
    // Deliberately measured at zoom 1 so the canvas does not resize while the
    // zoom slider moves — zoom crops within a fixed output frame.
    var base = cropRect(meta, { aspect: state.aspect, zoom: 1, panX: 0, panY: 0 }, 1);
    var w = base.w, h = base.h;
    var shortSide = Math.min(w, h);
    var scale = 1;
    // Scale up toward delivery size, but only mildly — past about 1.35× an
    // upscale just softens the image instead of adding anything.
    if (shortSide < 1080) scale = Math.min(1080 / shortSide, 1.35);
    var longSide = Math.max(w, h) * scale;
    if (longSide > 1920) scale *= 1920 / longSide;
    return { w: even(w * scale), h: even(h * scale) };
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* Punch-ins ride on top of the base zoom and settle within ~0.8s of each cut. */
  function punchZoom(state, cuts, t) {
    if (!state.punchIns || !cuts || !cuts.length) return 1;
    var idx = -1;
    for (var i = 0; i < cuts.length; i++) {
      if (cuts[i] <= t) idx = i; else break;
    }
    if (idx < 0) return 1;
    var since = t - cuts[idx];
    var dur = 0.8;
    if (since > dur) return 1;
    var p = easeOutCubic(U.clamp(since / dur, 0, 1));
    var s = state.punchStrength;
    // Alternate between settling out of a push-in and easing into one.
    if (idx % 2 === 0) return 1 + s * (1 - p);
    return 1 + s * p * 0.6;
  }

  function filterString(state) {
    var parts = [];
    if (state.brightness !== 1) parts.push('brightness(' + state.brightness.toFixed(3) + ')');
    if (state.contrast !== 1) parts.push('contrast(' + state.contrast.toFixed(3) + ')');
    if (state.saturate !== 1) parts.push('saturate(' + state.saturate.toFixed(3) + ')');
    return parts.length ? parts.join(' ') : 'none';
  }

  function wrapText(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [], line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawTextBlock(ctx, text, out, opts) {
    var size = Math.round(out.h * opts.size);
    ctx.save();
    ctx.font = '800 ' + size + 'px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var maxWidth = out.w * 0.86;
    var lines = wrapText(ctx, text.toUpperCase(), maxWidth);
    var lineHeight = size * 1.16;
    var blockHeight = lines.length * lineHeight;
    var startY = out.h * opts.y - blockHeight / 2 + lineHeight / 2;

    lines.forEach(function (line, i) {
      var y = startY + i * lineHeight;
      if (opts.box) {
        var wpx = ctx.measureText(line).width;
        ctx.fillStyle = opts.box;
        var padX = size * 0.34, padY = size * 0.22;
        var rx = out.w / 2 - wpx / 2 - padX;
        var ry = y - size / 2 - padY;
        var rw = wpx + padX * 2, rh = size + padY * 2;
        var rad = size * 0.22;
        ctx.beginPath();
        ctx.moveTo(rx + rad, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
        ctx.arcTo(rx, ry + rh, rx, ry, rad);
        ctx.arcTo(rx, ry, rx + rw, ry, rad);
        ctx.closePath();
        ctx.fill();
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(line, out.w / 2, y);
      ctx.fillStyle = opts.color || '#ffffff';
      ctx.fillText(line, out.w / 2, y);
    });
    ctx.restore();
  }

  function activeCaption(state, t) {
    for (var i = 0; i < state.captions.length; i++) {
      var c = state.captions[i];
      if (t >= c.t0 && t <= c.t1 && c.text) return c;
    }
    return null;
  }

  /* Draws one composited frame. `t` is a source timestamp. */
  function drawFrame(ctx, video, meta, state, cuts, t, out) {
    var zoomExtra = punchZoom(state, cuts, t);
    var crop = cropRect(meta, state, zoomExtra);

    ctx.save();
    ctx.clearRect(0, 0, out.w, out.h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, out.w, out.h);

    var filter = filterString(state);
    if (filter !== 'none' && 'filter' in ctx) ctx.filter = filter;
    try {
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, out.w, out.h);
    } catch (e) { /* frame not ready yet */ }
    if ('filter' in ctx) ctx.filter = 'none';

    if (state.warmth) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = Math.min(0.85, Math.abs(state.warmth));
      ctx.fillStyle = state.warmth > 0 ? '#ff9c3d' : '#4da6ff';
      ctx.fillRect(0, 0, out.w, out.h);
      ctx.restore();
    }

    if (state.vignette) {
      var g = ctx.createRadialGradient(
        out.w / 2, out.h / 2, Math.min(out.w, out.h) * 0.32,
        out.w / 2, out.h / 2, Math.max(out.w, out.h) * 0.72
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.8, state.vignette) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, out.w, out.h);
    }

    var rel = t - state.trimIn;
    if (state.hookText && rel >= 0 && rel <= 2.6) {
      drawTextBlock(ctx, state.hookText, out, {
        size: 0.062, y: 0.26, color: '#ffffff', box: 'rgba(10,10,14,0.55)'
      });
    }

    var cap = activeCaption(state, t);
    if (cap) {
      drawTextBlock(ctx, cap.text, out, {
        size: 0.05, y: 0.76, color: '#ffffff', box: 'rgba(10,10,14,0.5)'
      });
    }

    if (state.progressBar) {
      var span = Math.max(0.001, state.trimOut - state.trimIn);
      var p = U.clamp((t - state.trimIn) / span, 0, 1);
      var barH = Math.max(4, out.h * 0.006);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, out.h - barH, out.w, barH);
      ctx.fillStyle = '#5cf2b0';
      ctx.fillRect(0, out.h - barH, out.w * p, barH);
    }

    ctx.restore();
  }

  function inDeadZone(zones, t) {
    for (var i = 0; i < zones.length; i++) {
      if (t >= zones[i].start && t <= zones[i].end) return true;
    }
    return false;
  }

  /* Runtime after trimming and any dead-zone speed-up. */
  function outputDuration(state, zones) {
    var span = Math.max(0, state.trimOut - state.trimIn);
    if (!state.speedDeadZones || !zones.length) return span;
    var saved = 0;
    zones.forEach(function (z) {
      var s = Math.max(z.start, state.trimIn);
      var e = Math.min(z.end, state.trimOut);
      if (e > s) saved += (e - s) * (1 - 1 / state.deadSpeed);
    });
    return Math.max(0.1, span - saved);
  }

  return {
    defaultState: defaultState,
    cropRect: cropRect,
    outputSize: outputSize,
    drawFrame: drawFrame,
    inDeadZone: inDeadZone,
    outputDuration: outputDuration,
    targetAspect: targetAspect
  };
})();
