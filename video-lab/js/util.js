/* Shared helpers. Loaded as a classic script so the site works over file:// too. */
window.VL = window.VL || {};

VL.util = (function () {
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / (arr.length - 1));
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var idx = clamp((a.length - 1) * p, 0, a.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return lerp(a[lo], a[hi], idx - lo);
  }

  /* Maps a value onto 0..100 with a plateau: full marks between `good` and `great`,
     tapering to 0 at `floor` and (optionally) at `ceiling`. */
  function band(value, floor, good, great, ceiling) {
    if (value <= floor) return 0;
    if (value < good) return 100 * ((value - floor) / (good - floor));
    if (value <= great) return 100;
    if (ceiling === undefined || ceiling === null) return 100;
    if (value >= ceiling) return 0;
    return 100 * (1 - (value - great) / (ceiling - great));
  }

  function fmtTime(t) {
    if (!isFinite(t)) return '0:00';
    var neg = t < 0;
    t = Math.abs(t);
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    var str = m + ':' + (s < 10 ? '0' : '') + s.toFixed(s < 10 ? 1 : 1);
    return (neg ? '-' : '') + str;
  }

  function fmtBytes(b) {
    if (!b) return '—';
    var units = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return b.toFixed(b < 10 && i > 0 ? 1 : 0) + ' ' + units[i];
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  function aspectLabel(w, h) {
    if (!w || !h) return '—';
    var g = gcd(w, h);
    var rw = w / g, rh = h / g;
    if (rw > 40 || rh > 40) return (w / h).toFixed(2) + ':1';
    return rw + ':' + rh;
  }

  function dbfs(rms) {
    if (rms <= 1e-7) return -100;
    return 20 * Math.log10(rms);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function once(target, event) {
    return new Promise(function (resolve, reject) {
      function ok(e) { cleanup(); resolve(e); }
      function bad(e) { cleanup(); reject(e); }
      function cleanup() {
        target.removeEventListener(event, ok);
        target.removeEventListener('error', bad);
      }
      target.addEventListener(event, ok);
      target.addEventListener('error', bad);
    });
  }

  function raf() {
    return new Promise(function (r) { requestAnimationFrame(r); });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  return {
    clamp: clamp, lerp: lerp, mean: mean, std: std, percentile: percentile,
    band: band, fmtTime: fmtTime, fmtBytes: fmtBytes, aspectLabel: aspectLabel,
    dbfs: dbfs, $: $, $$: $$, el: el, download: download, once: once,
    raf: raf, sleep: sleep
  };
})();
