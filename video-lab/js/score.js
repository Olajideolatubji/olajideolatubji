/* Scoring model. Every subscore comes from a measured quantity compared with a
   stated target, and every issue carries the fix that would recover the points. */
window.VL = window.VL || {};

VL.score = (function () {
  var U = VL.util;

  var PRESETS = {
    shorts: {
      key: 'shorts',
      label: 'TikTok / Reels / Shorts',
      aspect: 9 / 16,
      aspectName: '9:16',
      hookWindow: 2.0,
      sweetMin: 15,
      sweetMax: 45,
      hardMax: 90,
      cutsMin: 20,
      cutsGood: 30,
      cutsMax: 90,
      loudness: -14,
      minShortSide: 1080,
      centerSafe: 0.42
    },
    feed: {
      key: 'feed',
      label: 'Instagram feed / LinkedIn (4:5)',
      aspect: 4 / 5,
      aspectName: '4:5',
      hookWindow: 3.0,
      sweetMin: 15,
      sweetMax: 60,
      hardMax: 120,
      cutsMin: 14,
      cutsGood: 24,
      cutsMax: 70,
      loudness: -14,
      minShortSide: 1080,
      centerSafe: 0.38
    },
    youtube: {
      key: 'youtube',
      label: 'YouTube (16:9 long-form)',
      aspect: 16 / 9,
      aspectName: '16:9',
      hookWindow: 8.0,
      sweetMin: 120,
      sweetMax: 1200,
      hardMax: 3600,
      cutsMin: 8,
      cutsGood: 16,
      cutsMax: 50,
      loudness: -14,
      minShortSide: 720,
      centerSafe: 0.3
    }
  };

  function framesIn(frames, t0, t1) {
    return frames.filter(function (f) { return f.t >= t0 && f.t <= t1; });
  }

  function audioEnergyBetween(audio, t0, t1) {
    if (!audio || !audio.available || !audio.envelope.length) return null;
    var step = audio.envelopeStep || 0.05;
    var a = U.clamp(Math.floor(t0 / step), 0, audio.envelope.length - 1);
    var b = U.clamp(Math.ceil(t1 / step), 0, audio.envelope.length - 1);
    if (b <= a) b = a + 1;
    var slice = audio.envelope.slice(a, b).filter(function (d) { return d > -90; });
    return slice.length ? U.mean(slice) : null;
  }

  function scoreHook(a, preset) {
    var frames = a.base.frames;
    var d = a.derived;
    var win = Math.min(preset.hookWindow, a.base.meta.duration * 0.5);
    var hookFrames = framesIn(frames, 0, win);
    if (!hookFrames.length) hookFrames = frames.slice(0, 3);

    var idxEnd = hookFrames.length;
    var hookMotion = U.mean(d.motion.slice(1, Math.max(2, idxEnd)));
    var refMotion = Math.max(0.008, d.medianMotion);
    var motionScore = U.band(hookMotion / refMotion, 0.15, 0.9, 2.4, 6);

    var hookCuts = d.cuts.filter(function (c) { return c <= win; }).length;
    var cutScore = U.band(hookCuts, -0.4, 1, 4, 14);

    var sharpRef = U.percentile(frames.map(function (f) { return f.sharpness; }), 0.75) || 1;
    var hookSharp = U.mean(hookFrames.map(function (f) { return f.sharpness; }));
    var sharpScore = U.band(hookSharp / sharpRef, 0.15, 0.7, 3, null);

    var hookLuma = U.mean(hookFrames.map(function (f) { return f.luma; }));
    var exposureScore = U.band(hookLuma, 0.06, 0.32, 0.66, 0.95);

    var hookColor = U.mean(hookFrames.map(function (f) { return f.colorfulness; }));
    var colorScore = U.band(hookColor, 4, 26, 80, 150);

    var subs = [
      { w: 0.3, s: motionScore },
      { w: 0.24, s: cutScore },
      { w: 0.18, s: sharpScore },
      { w: 0.16, s: exposureScore },
      { w: 0.12, s: colorScore }
    ];

    var early = audioEnergyBetween(a.audio, 0, Math.min(1.0, win));
    var rest = audioEnergyBetween(a.audio, win, a.base.meta.duration);
    var audioHookScore = null;
    if (early !== null && rest !== null) {
      audioHookScore = U.band(early - rest, -22, -4, 6, null);
      subs.push({ w: 0.2, s: audioHookScore });
    }

    var totalW = subs.reduce(function (acc, x) { return acc + x.w; }, 0);
    var score = subs.reduce(function (acc, x) { return acc + x.w * x.s; }, 0) / totalW;

    var issues = [];
    if (motionScore < 60) {
      issues.push({
        id: 'hook-static',
        title: 'The first ' + win.toFixed(1) + 's barely moves',
        why: 'Movement in the opening is only ' + (hookMotion / refMotion).toFixed(2) +
             '× what the rest of the video does. A still opening is where most viewers leave.',
        how: 'Start on the most active frame instead of the first one, and let the motion begin before the first word.',
        gain: 0, severity: 'high',
        action: { type: 'hookFix' }
      });
    }
    if (cutScore < 60) {
      issues.push({
        id: 'hook-nocut',
        title: hookCuts === 0
          ? 'Nothing changes on screen in the first ' + win.toFixed(1) + 's'
          : 'The opening is cut too frantically to read',
        why: hookCuts === 0
          ? 'There are no cuts inside the hook window, so the opening shot is one unbroken frame — the viewer gets no reason to keep watching.'
          : 'There are ' + hookCuts + ' cuts inside the first ' + win.toFixed(1) + 's, which reads as noise before the idea lands.',
        how: hookCuts === 0
          ? 'Add a punch-in or a second angle inside the first second.'
          : 'Hold the opening shot long enough to register before the first cut.',
        gain: 0, severity: 'high',
        action: hookCuts === 0 ? { type: 'punchIns' } : null
      });
    }
    if (exposureScore < 55) {
      issues.push({
        id: 'hook-dark',
        title: 'The opening frame is ' + (hookLuma < 0.32 ? 'too dark' : 'blown out'),
        why: 'Average brightness in the hook is ' + Math.round(hookLuma * 100) + '% (a readable opening sits between 32% and 66%).',
        how: 'Lift exposure on the opening so the subject reads instantly at thumbnail size.',
        gain: 0, severity: 'medium',
        action: { type: 'exposure' }
      });
    }
    if (audioHookScore !== null && audioHookScore < 50) {
      issues.push({
        id: 'hook-quiet',
        title: 'The audio does not start with any punch',
        why: 'The first second is ' + (rest - early).toFixed(1) + ' dB quieter than the rest of the video.',
        how: 'Open on the loudest line or a sound effect. Trim any lead-in silence before the first word.',
        gain: 0, severity: 'medium',
        action: { type: 'trimSilentStart' }
      });
    }

    return {
      key: 'hook',
      label: 'Hook (first ' + win.toFixed(1) + 's)',
      score: score,
      metrics: [
        { label: 'Movement vs rest of video', value: (hookMotion / refMotion).toFixed(2) + '×', good: motionScore >= 60 },
        { label: 'Cuts in the hook', value: String(hookCuts), good: cutScore >= 60 },
        { label: 'Opening brightness', value: Math.round(hookLuma * 100) + '%', good: exposureScore >= 55 },
        { label: 'Opening sharpness vs best', value: Math.round((hookSharp / sharpRef) * 100) + '%', good: sharpScore >= 55 }
      ],
      issues: issues
    };
  }

  function scorePacing(a, preset) {
    var d = a.derived;
    var meta = a.base.meta;
    var cpm = d.cutsPerMin;
    var cutScore = U.band(cpm, 0, preset.cutsMin, preset.cutsGood * 2, preset.cutsMax * 1.6);
    var staticScore = U.band(-d.longestStatic, -Math.max(6, meta.duration * 0.5), -3.5, -0.5, null);
    var deadTotal = a.deadZones.reduce(function (acc, z) { return acc + (z.end - z.start); }, 0);
    var deadRatio = meta.duration > 0 ? deadTotal / meta.duration : 0;
    var deadScore = U.band(-deadRatio, -0.45, -0.08, 0, null);

    var score = 0.45 * cutScore + 0.3 * staticScore + 0.25 * deadScore;

    var issues = [];
    if (cutScore < 65) {
      issues.push({
        id: 'pacing-cuts',
        title: cpm < preset.cutsMin ? 'Not enough cuts to hold attention' : 'Cutting so fast it is hard to follow',
        why: 'This video changes shot ' + cpm.toFixed(1) + ' times per minute. For ' + preset.label +
             ', ' + preset.cutsMin + '–' + preset.cutsGood * 2 + ' per minute is the range that holds attention.',
        how: cpm < preset.cutsMin
          ? 'Add a visual change roughly every ' + (60 / preset.cutsGood).toFixed(1) + 's — a punch-in, a b-roll insert, or a reframe.'
          : 'Let the strongest shots breathe for a beat longer.',
        gain: 0, severity: cpm < preset.cutsMin ? 'high' : 'medium',
        action: cpm < preset.cutsMin ? { type: 'punchIns' } : null
      });
    }
    if (a.deadZones.length) {
      var stillCount = a.deadZones.filter(function (z) { return z.kind === 'dead'; }).length;
      var longest = a.deadZones.slice().sort(function (x, y) {
        return (y.end - y.start) - (x.end - x.start);
      })[0];
      issues.push({
        id: 'pacing-dead',
        title: a.deadZones.length + ' dead zone' + (a.deadZones.length === 1 ? '' : 's') +
               ' totalling ' + deadTotal.toFixed(1) + 's',
        why: 'That is ' + Math.round(deadRatio * 100) + '% of the runtime with ' +
             (stillCount === a.deadZones.length ? 'no movement and no sound'
               : stillCount ? 'nothing happening or no sound' : 'gaps in the audio') +
             '. The longest runs ' + (longest.end - longest.start).toFixed(1) + 's from ' +
             U.fmtTime(longest.start) + '.',
        how: 'Cut these stretches out, or speed through them so the video never sits still.',
        gain: 0, severity: deadRatio > 0.12 ? 'high' : 'medium',
        action: { type: 'speedDeadZones' }
      });
    }

    return {
      key: 'pacing',
      label: 'Pacing',
      score: score,
      metrics: [
        { label: 'Cuts per minute', value: cpm.toFixed(1), good: cutScore >= 65 },
        { label: 'Longest shot without a change', value: d.longestStatic.toFixed(1) + 's', good: staticScore >= 60 },
        { label: 'Dead air', value: Math.round(deadRatio * 100) + '% of runtime', good: deadScore >= 70 }
      ],
      issues: issues
    };
  }

  function scoreRetention(a, preset) {
    var meta = a.base.meta;
    var dur = meta.duration;
    var durScore;
    if (dur < preset.sweetMin) durScore = U.band(dur, 0, preset.sweetMin * 0.6, preset.sweetMax, preset.hardMax * 1.5);
    else durScore = U.band(-dur, -preset.hardMax, -preset.sweetMax, -preset.sweetMin, null);

    var frames = a.base.frames;
    var third = Math.max(1, Math.floor(frames.length / 3));
    var motion = a.derived.motion;
    var firstEnergy = U.mean(motion.slice(0, third)) || 0.0001;
    var lastEnergy = U.mean(motion.slice(-third)) || 0;
    var trend = lastEnergy / firstEnergy;
    var trendScore = U.band(trend, 0.15, 0.75, 2.2, 6);

    var payoffFrames = frames.slice(-third);
    var payoffColor = U.mean(payoffFrames.map(function (f) { return f.colorfulness; }));
    var overallColor = U.mean(frames.map(function (f) { return f.colorfulness; })) || 1;
    var payoffScore = U.band(payoffColor / overallColor, 0.5, 0.9, 1.6, null);

    var score = 0.45 * durScore + 0.35 * trendScore + 0.2 * payoffScore;

    var issues = [];
    if (durScore < 65) {
      issues.push({
        id: 'retention-length',
        title: dur > preset.sweetMax ? 'Longer than the format rewards' : 'Too short to land',
        why: 'Runtime is ' + U.fmtTime(dur) + '. For ' + preset.label + ' the range that holds completion rate is ' +
             U.fmtTime(preset.sweetMin) + '–' + U.fmtTime(preset.sweetMax) + '.',
        how: dur > preset.sweetMax
          ? 'Cut to the strongest ' + U.fmtTime(preset.sweetMax) + ' — start later and end on the payoff.'
          : 'Add a beat of context before the payoff so the idea has room to land.',
        gain: 0, severity: 'medium',
        action: dur > preset.sweetMax ? { type: 'trimLength' } : null
      });
    }
    if (trendScore < 55) {
      issues.push({
        id: 'retention-fade',
        title: 'Energy drops off toward the end',
        why: 'The final third has ' + Math.round(trend * 100) + '% of the movement of the opening third. Videos that fade lose the rewatch and the follow.',
        how: 'Save a visual escalation — the best shot, the reveal, or a caption payoff — for the last quarter.',
        gain: 0, severity: 'medium',
        action: null
      });
    }

    return {
      key: 'retention',
      label: 'Retention shape',
      score: score,
      metrics: [
        { label: 'Runtime', value: U.fmtTime(dur), good: durScore >= 65 },
        { label: 'End vs start energy', value: Math.round(trend * 100) + '%', good: trendScore >= 55 }
      ],
      issues: issues
    };
  }

  function scoreVisual(a) {
    var frames = a.base.frames;
    var sharp = U.percentile(frames.map(function (f) { return f.sharpness; }), 0.75);
    var sharpScore = U.band(sharp, 0.0004, 0.0035, 0.05, null);
    var meanLuma = U.mean(frames.map(function (f) { return f.luma; }));
    var expScore = U.band(meanLuma, 0.08, 0.34, 0.62, 0.92);
    var contrast = U.percentile(frames.map(function (f) { return f.contrast; }), 0.5);
    var contrastScore = U.band(contrast, 0.03, 0.15, 0.32, 0.5);
    var crushed = U.mean(frames.map(function (f) { return f.crushed; }));
    var blown = U.mean(frames.map(function (f) { return f.blown; }));
    var clipScore = U.band(-(crushed + blown), -0.22, -0.05, 0, null);

    var score = 0.34 * sharpScore + 0.26 * expScore + 0.24 * contrastScore + 0.16 * clipScore;

    var issues = [];
    if (sharpScore < 55) {
      issues.push({
        id: 'visual-soft',
        title: 'The footage reads soft',
        why: 'Measured focus energy is well below what a crisp frame produces. Soft footage looks cheap in the feed even when the idea is good.',
        how: 'Shoot at 1080p or higher with the subject locked in focus, clean the lens, and avoid digital zoom while recording.',
        gain: 0, severity: 'medium', action: null
      });
    }
    if (expScore < 60) {
      issues.push({
        id: 'visual-exposure',
        title: meanLuma < 0.34 ? 'Underexposed throughout' : 'Overexposed throughout',
        why: 'Average brightness is ' + Math.round(meanLuma * 100) + '%; the readable band is 34–62%.',
        how: 'Lift exposure and let the highlights carry — bright, clean footage outperforms moody footage on small screens.',
        gain: 0, severity: 'high', action: { type: 'exposure' }
      });
    }
    if (contrastScore < 60) {
      issues.push({
        id: 'visual-flat',
        title: 'The image is flat',
        why: 'Tonal spread measures ' + contrast.toFixed(3) + ' (0.15+ reads as punchy).',
        how: 'Add contrast so the subject separates from the background.',
        gain: 0, severity: 'medium', action: { type: 'contrast' }
      });
    }

    return {
      key: 'visual',
      label: 'Image quality',
      score: score,
      metrics: [
        { label: 'Focus / sharpness', value: sharpScore >= 55 ? 'crisp' : 'soft', good: sharpScore >= 55 },
        { label: 'Average brightness', value: Math.round(meanLuma * 100) + '%', good: expScore >= 60 },
        { label: 'Contrast', value: contrast.toFixed(3), good: contrastScore >= 60 },
        { label: 'Crushed / blown pixels', value: Math.round((crushed + blown) * 100) + '%', good: clipScore >= 70 }
      ],
      issues: issues
    };
  }

  function scoreColor(a) {
    var frames = a.base.frames;
    var colorfulness = U.percentile(frames.map(function (f) { return f.colorfulness; }), 0.5);
    var colorScore = U.band(colorfulness, 4, 30, 85, 160);
    var sat = U.mean(frames.map(function (f) { return f.saturation; }));
    var satScore = U.band(sat, 0.04, 0.24, 0.6, 0.9);
    var variety = U.std(frames.map(function (f) {
      return f.dominant.r * 0.6 + f.dominant.g * 0.3 + f.dominant.b * 0.1;
    }));
    var varietyScore = U.band(variety, 2, 18, 90, null);

    var score = 0.45 * colorScore + 0.35 * satScore + 0.2 * varietyScore;

    var issues = [];
    var oversaturated = sat > 0.62 || colorfulness > 92;
    if (colorScore < 60 || satScore < 60) {
      issues.push(oversaturated ? {
        id: 'color-loud',
        title: 'Colour is pushed past natural',
        why: 'Saturation measures ' + Math.round(sat * 100) + '% and colourfulness ' + colorfulness.toFixed(0) +
             '. Over-cooked colour clips skin tones and reads as a filter rather than as production value.',
        how: 'Pull saturation back toward natural and let contrast carry the punch instead.',
        gain: 0, severity: 'medium', action: { type: 'colorBoost' }
      } : {
        id: 'color-dull',
        title: 'Colour is muted',
        why: 'Colourfulness measures ' + colorfulness.toFixed(0) + ' (30+ pops in a feed) and saturation is ' +
             Math.round(sat * 100) + '%.',
        how: 'Push saturation and warmth. Colour is the cheapest way to stop a scrolling thumb.',
        gain: 0, severity: 'medium', action: { type: 'colorBoost' }
      });
    }
    if (varietyScore < 45) {
      issues.push({
        id: 'color-same',
        title: 'Every shot looks the same',
        why: 'The dominant colour barely changes across the video, so there is no visual reset for the eye.',
        how: 'Change location, background, or framing at least once so the video does not read as one long take.',
        gain: 0, severity: 'low', action: null
      });
    }

    return {
      key: 'color',
      label: 'Colour & vibrance',
      score: score,
      metrics: [
        { label: 'Colourfulness', value: colorfulness.toFixed(0), good: colorScore >= 60 },
        { label: 'Saturation', value: Math.round(sat * 100) + '%', good: satScore >= 60 },
        { label: 'Visual variety', value: varietyScore >= 45 ? 'varied' : 'repetitive', good: varietyScore >= 45 }
      ],
      issues: issues
    };
  }

  function scoreAudio(a, preset) {
    var au = a.audio;
    if (!au || !au.available) {
      return {
        key: 'audio',
        label: 'Audio',
        score: null,
        unavailable: true,
        metrics: [{ label: 'Status', value: au && au.reason ? au.reason : 'No audio track found', good: false }],
        issues: [{
          id: 'audio-none',
          title: 'No usable audio track',
          why: au && au.reason ? au.reason : 'This file has no audio the browser could read.',
          how: 'Silent video is capped on every platform. Add a voiceover, or at minimum a music bed with the beat cut to your edits.',
          gain: 0, severity: 'high', action: null
        }]
      };
    }

    var loudGap = au.loudnessDb - preset.loudness;
    var loudScore = U.band(-Math.abs(loudGap), -14, -3, 0, null);
    var silenceScore = U.band(-au.silenceRatio, -0.5, -0.12, 0, null);
    var clipScore = U.band(-au.clipRatio, -0.01, -0.0005, 0, null);
    var dynScore = U.band(au.dynamicRange, 1, 8, 24, 45);
    var subs = [
      { w: 0.34, s: loudScore },
      { w: 0.26, s: silenceScore },
      { w: 0.2, s: clipScore },
      { w: 0.2, s: dynScore }
    ];
    if (au.speechRatio !== null && au.speechRatio !== undefined) {
      subs.push({ w: 0.18, s: U.band(au.speechRatio, 0.1, 0.35, 0.85, null) });
    }
    var totalW = subs.reduce(function (acc, s) { return acc + s.w; }, 0);
    var score = subs.reduce(function (acc, s) { return acc + s.w * s.s; }, 0) / totalW;

    var issues = [];
    if (loudScore < 70) {
      issues.push({
        id: 'audio-loudness',
        title: au.loudnessDb < preset.loudness ? 'Audio is too quiet' : 'Audio is hotter than platform target',
        why: 'Average level is ' + au.loudnessDb.toFixed(1) + ' dBFS against a ' + preset.loudness + ' dBFS target — a ' +
             Math.abs(loudGap).toFixed(1) + ' dB gap. Quiet audio gets scrolled past on phone speakers.',
        how: 'Normalise the mix toward the platform target before you upload.',
        gain: 0, severity: 'high', action: { type: 'normalizeAudio' }
      });
    }
    if (silenceScore < 65) {
      issues.push({
        id: 'audio-silence',
        title: Math.round(au.silenceRatio * 100) + '% of the audio is silence',
        why: 'Gaps between words are dead time, and dead time is where viewers swipe.',
        how: 'Cut the pauses tight, or run the dead stretches faster.',
        gain: 0, severity: 'medium', action: { type: 'speedDeadZones' }
      });
    }
    if (clipScore < 60) {
      issues.push({
        id: 'audio-clip',
        title: 'Audio is clipping',
        why: Math.round(au.clipRatio * 10000) / 100 + '% of samples hit the ceiling (peak ' + au.peakDb.toFixed(1) + ' dBFS). Clipped audio sounds harsh and cheap.',
        how: 'Pull the recording level down and re-normalise instead of pushing into the limit.',
        gain: 0, severity: 'medium', action: { type: 'reduceGain' }
      });
    }

    return {
      key: 'audio',
      label: 'Audio',
      score: score,
      metrics: [
        { label: 'Average level', value: au.loudnessDb.toFixed(1) + ' dBFS', good: loudScore >= 70 },
        { label: 'Peak', value: au.peakDb.toFixed(1) + ' dBFS', good: clipScore >= 60 },
        { label: 'Silence', value: Math.round(au.silenceRatio * 100) + '%', good: silenceScore >= 65 },
        { label: 'Dynamic range', value: au.dynamicRange.toFixed(1) + ' dB', good: dynScore >= 60 },
        au.speechRatio !== null && au.speechRatio !== undefined
          ? { label: 'Voice-band energy', value: Math.round(au.speechRatio * 100) + '%', good: au.speechRatio > 0.3 }
          : null
      ].filter(Boolean),
      issues: issues
    };
  }

  function scoreFormat(a, preset) {
    var meta = a.base.meta;
    var ratioGap = Math.abs(Math.log(meta.aspect / preset.aspect));
    var aspectScore = U.band(-ratioGap, -0.85, -0.08, 0, null);
    var shortSide = Math.min(meta.width, meta.height);
    var resScore = U.band(shortSide, preset.minShortSide * 0.35, preset.minShortSide, preset.minShortSide * 2.2, null);
    var centerBias = U.mean(a.base.frames.map(function (f) { return f.centerBias; }));
    var safeScore = U.band(centerBias, preset.centerSafe * 0.4, preset.centerSafe, 0.85, null);

    var score = 0.5 * aspectScore + 0.3 * resScore + 0.2 * safeScore;

    var issues = [];
    if (aspectScore < 75) {
      issues.push({
        id: 'format-aspect',
        title: 'Wrong shape for ' + preset.label,
        why: 'This video is ' + meta.aspectLabel + '; the format wants ' + preset.aspectName +
             '. Off-format video gets letterboxed and loses screen area against everything else in the feed.',
        how: 'Reframe to ' + preset.aspectName + ' and keep the subject inside the crop.',
        gain: 0, severity: 'high', action: { type: 'reframe' }
      });
    }
    if (resScore < 60) {
      issues.push({
        id: 'format-res',
        title: 'Resolution is below what the platform re-encodes well',
        why: 'Short side is ' + shortSide + 'px; ' + preset.minShortSide + 'px or more survives compression.',
        how: 'Export at ' + preset.minShortSide + 'p or higher — platform re-encoding punishes low-resolution uploads twice.',
        gain: 0, severity: 'medium', action: null
      });
    }
    if (safeScore < 55) {
      issues.push({
        id: 'format-safe',
        title: 'The subject sits outside the safe area',
        why: 'Only ' + Math.round(centerBias * 100) + '% of the detail is in the middle of the frame, where platform UI does not cover it.',
        how: 'Recentre the subject — captions, buttons and usernames eat the top and bottom of the screen.',
        gain: 0, severity: 'medium', action: { type: 'reframe' }
      });
    }

    return {
      key: 'format',
      label: 'Format fit',
      score: score,
      metrics: [
        { label: 'Aspect ratio', value: meta.aspectLabel + ' (want ' + preset.aspectName + ')', good: aspectScore >= 75 },
        { label: 'Resolution', value: meta.width + '×' + meta.height, good: resScore >= 60 },
        { label: 'Subject in safe area', value: Math.round(centerBias * 100) + '%', good: safeScore >= 55 }
      ],
      issues: issues
    };
  }

  var WEIGHTS = {
    shorts: { hook: 0.28, pacing: 0.18, retention: 0.11, visual: 0.13, color: 0.08, audio: 0.14, format: 0.08 },
    feed: { hook: 0.25, pacing: 0.17, retention: 0.12, visual: 0.15, color: 0.09, audio: 0.14, format: 0.08 },
    youtube: { hook: 0.24, pacing: 0.16, retention: 0.14, visual: 0.15, color: 0.07, audio: 0.17, format: 0.07 }
  };

  /* Concrete parameters for the one-click fixes, computed from the measurements. */
  function buildFixes(a, preset) {
    var frames = a.base.frames;
    var meta = a.base.meta;
    var meanLuma = U.mean(frames.map(function (f) { return f.luma; }));
    var contrast = U.percentile(frames.map(function (f) { return f.contrast; }), 0.5);
    var colorfulness = U.percentile(frames.map(function (f) { return f.colorfulness; }), 0.5);

    var meanSat = U.mean(frames.map(function (f) { return f.saturation; }));
    var brightness = U.clamp(0.48 / Math.max(0.06, meanLuma), 0.7, 1.55);
    var contrastF = U.clamp(0.19 / Math.max(0.03, contrast), 0.95, 1.45);
    // Whichever signal is closer to target wins, so already-vivid footage is
    // never pushed further and over-cooked footage gets pulled back.
    var saturate = U.clamp(
      Math.min(38 / Math.max(6, colorfulness), 0.4 / Math.max(0.05, meanSat)),
      0.7, 1.75
    );

    // Best point to start: the earliest strong, moving frame inside the opening.
    var limit = Math.min(2.5, meta.duration * 0.15);
    var sharpRef = U.percentile(frames.map(function (f) { return f.sharpness; }), 0.6);
    var motionRef = Math.max(0.006, a.derived.medianMotion);
    var suggestedStart = 0;
    for (var i = 1; i < frames.length; i++) {
      if (frames[i].t > limit) break;
      if (frames[i].sharpness >= sharpRef && a.derived.motion[i] >= motionRef) {
        suggestedStart = frames[i].t;
        break;
      }
    }
    if (suggestedStart < meta.sampleInterval * 1.5) suggestedStart = 0;

    var audioGain = 0;
    if (a.audio && a.audio.available) {
      var wanted = preset.loudness - a.audio.loudnessDb;
      var headroom = -1 - a.audio.peakDb;
      audioGain = U.clamp(Math.min(wanted, Math.max(headroom, -3)), -12, 18);
    }

    var trimOut = meta.duration;
    if (meta.duration > preset.sweetMax) trimOut = suggestedStart + preset.sweetMax;

    return {
      brightness: brightness,
      contrast: contrastF,
      saturate: saturate,
      suggestedStart: suggestedStart,
      suggestedEnd: Math.min(meta.duration, trimOut),
      audioGain: audioGain,
      aspect: preset.aspect,
      aspectName: preset.aspectName
    };
  }

  var HOOK_TEMPLATES = [
    'Stop scrolling if you {outcome}.',
    'Nobody tells you this about {topic}.',
    'I tried {topic} for 30 days. Here is what happened.',
    'This is the {topic} mistake costing you {cost}.',
    'Watch this before you {action}.'
  ];

  function evaluate(a, presetKey) {
    var preset = PRESETS[presetKey] || PRESETS.shorts;
    var categories = [
      scoreHook(a, preset),
      scorePacing(a, preset),
      scoreRetention(a, preset),
      scoreVisual(a),
      scoreColor(a),
      scoreAudio(a, preset),
      scoreFormat(a, preset)
    ];

    var weights = WEIGHTS[preset.key];
    var available = categories.filter(function (c) { return c.score !== null; });
    var totalW = available.reduce(function (acc, c) { return acc + weights[c.key]; }, 0);
    var overall = available.reduce(function (acc, c) {
      return acc + weights[c.key] * c.score;
    }, 0) / (totalW || 1);

    // A missing audio track is a real cap, not a neutral omission.
    var audioCat = categories.filter(function (c) { return c.key === 'audio'; })[0];
    if (audioCat && audioCat.unavailable) overall = Math.min(overall, 62);

    categories.forEach(function (c) {
      c.weight = weights[c.key];
      var deficit = (100 - (c.score === null ? 40 : c.score)) * c.weight;
      var n = c.issues.length || 1;
      c.issues.forEach(function (issue) {
        var share = issue.severity === 'high' ? 0.55 : issue.severity === 'medium' ? 0.32 : 0.16;
        issue.gain = Math.max(0.5, deficit * share * (2 / (n + 1)));
        issue.category = c.label;
      });
    });

    var recs = categories.reduce(function (acc, c) { return acc.concat(c.issues); }, []);
    recs.sort(function (x, y) { return y.gain - x.gain; });

    return {
      preset: preset,
      overall: U.clamp(overall, 0, 100),
      categories: categories,
      recs: recs,
      fixes: buildFixes(a, preset),
      hookTemplates: HOOK_TEMPLATES,
      ceiling: U.clamp(overall + recs.reduce(function (acc, r) { return acc + r.gain; }, 0), 0, 99)
    };
  }

  return { evaluate: evaluate, PRESETS: PRESETS };
})();
