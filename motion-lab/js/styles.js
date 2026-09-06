/* The animation style library.
 *
 * A style is not a colour scheme. It is a full production decision: how often
 * the picture changes, how the text arrives, what the background does under
 * it, whether captions burn in, and which retention device the style leans on.
 * Each one names the mechanic it is built around, because "which style" is
 * really the question "what is keeping this viewer past the next 30 seconds".
 *
 * `sceneSeconds` drives how the script is cut into beats. `interruptEvery` is
 * the pattern-interrupt cadence — the beat where the picture changes hard
 * enough to reset attention. Those two numbers do most of the work. */

ML.styles = (() => {

  const S = [

    {
      id: 'retention',
      name: 'Retention Engine',
      blurb: 'Hard cuts, punch-ins and a running progress rail. Built to survive the 30-second drop-off.',
      mechanic: 'Pattern interrupt every 4 seconds plus a visible progress rail, so the viewer always sees how much is left and never sits on a static frame long enough to reach for the back button.',
      bestFor: '3–20 minute talking-head, essay and explainer scripts',
      range: [60, 3600],
      aspect: '16:9',
      sceneSeconds: 4.5,
      interruptEvery: 4,
      captions: 'phrase',
      progressRail: true,
      background: 'meshDrift',
      layoutPool: ['bigType', 'splitStat', 'bulletStack', 'quoteCard', 'markerCard'],
      motion: { entry: 'riseIn', camera: 'punch', punch: 0.06 },
      palette: { bg: '#0a0d14', bg2: '#141c2e', ink: '#ffffff', muted: '#93a3c0', accent: '#4ade80', accent2: '#60a5fa' }
    },

    {
      id: 'kinetic',
      name: 'Kinetic Type',
      blurb: 'Word-by-word typography snapped to the read. Nothing on screen but the line being spoken.',
      mechanic: 'Every word lands on its own beat, so the frame is never still and the eye is pulled through the sentence at reading speed. The format that reads fastest with the sound off.',
      bestFor: 'Shorts, hooks, 30 second to 3 minute scripts',
      range: [15, 300],
      aspect: '9:16',
      sceneSeconds: 3,
      interruptEvery: 3,
      captions: 'none',
      progressRail: false,
      background: 'gradientPulse',
      layoutPool: ['kineticLine'],
      motion: { entry: 'popIn', camera: 'drift', punch: 0.03 },
      palette: { bg: '#08070c', bg2: '#251536', ink: '#ffffff', muted: '#a89ec0', accent: '#f472b6', accent2: '#a78bfa' }
    },

    {
      id: 'infographic',
      name: 'Motion Infographic',
      blurb: 'Counters that count, bars that grow, cards that stack. Every number gets a shape.',
      mechanic: 'A number animating toward its value is an unfinished action, and an unfinished action is very hard to click away from. Stat-heavy scripts hold retention on the arithmetic itself.',
      bestFor: 'Finance, science, business and data explainers',
      range: [60, 3600],
      aspect: '16:9',
      sceneSeconds: 5.5,
      interruptEvery: 6,
      captions: 'phrase',
      progressRail: true,
      background: 'gridPlot',
      layoutPool: ['counterCard', 'barChart', 'bigType', 'bulletStack', 'splitStat'],
      motion: { entry: 'riseIn', camera: 'still', punch: 0.02 },
      palette: { bg: '#0b1020', bg2: '#13203c', ink: '#f4f7ff', muted: '#8ea0c4', accent: '#38bdf8', accent2: '#fbbf24' }
    },

    {
      id: 'whiteboard',
      name: 'Whiteboard Sketch',
      blurb: 'Ink drawing itself onto paper, one stroke at a time, in step with the narration.',
      mechanic: 'A drawing in progress is an open loop: the viewer stays to see what the line becomes. The oldest trick in educational video and still the highest completion rate in the category.',
      bestFor: 'Teaching, how-to and concept breakdowns',
      range: [60, 3600],
      aspect: '16:9',
      sceneSeconds: 6,
      interruptEvery: 8,
      captions: 'phrase',
      progressRail: false,
      background: 'paper',
      layoutPool: ['sketchCard', 'bulletStack', 'bigType', 'counterCard'],
      motion: { entry: 'drawOn', camera: 'still', punch: 0 },
      palette: { bg: '#f7f4ec', bg2: '#ebe5d6', ink: '#1c1a17', muted: '#6b6459', accent: '#e0452c', accent2: '#2563eb' }
    },

    {
      id: 'impact',
      name: 'Comic Impact',
      blurb: 'Speed lines, panel slams and impact frames on the emphasis words.',
      mechanic: 'Borrowed from anime editing: a one-frame flash on the stressed word spikes arousal and resets attention without a cut. Built for story and drama retellings.',
      bestFor: 'Story, drama, reaction and retelling channels',
      range: [30, 1800],
      aspect: '9:16',
      sceneSeconds: 3.4,
      interruptEvery: 3,
      captions: 'word',
      progressRail: false,
      background: 'speedLines',
      layoutPool: ['impactCard', 'kineticLine', 'quoteCard'],
      motion: { entry: 'slamIn', camera: 'shake', punch: 0.09 },
      palette: { bg: '#0d0b0f', bg2: '#3b0d1e', ink: '#fffdf5', muted: '#c9b8b8', accent: '#ff3b3b', accent2: '#ffe14e' }
    },

    {
      id: 'documentary',
      name: 'Documentary Slate',
      blurb: 'Slow drift, letterbox bars, lower thirds. The look that makes a script feel researched.',
      mechanic: 'Low visual frequency and long holds signal authority, which lifts average view duration on long-form even though less happens per second. Chapters carry the structure instead of cuts.',
      bestFor: 'History, deep dives, 10 minute to 3 hour documentaries',
      range: [180, 21600],
      aspect: '16:9',
      sceneSeconds: 8,
      interruptEvery: 14,
      captions: 'phrase',
      progressRail: true,
      background: 'filmDrift',
      layoutPool: ['slateCard', 'lowerThird', 'quoteCard', 'bigType', 'splitStat'],
      motion: { entry: 'fadeUp', camera: 'kenBurns', punch: 0 },
      palette: { bg: '#0c0c0d', bg2: '#1d1b18', ink: '#f2ede2', muted: '#9a9287', accent: '#d4a24c', accent2: '#7f9bb5' }
    },

    {
      id: 'ambient',
      name: 'Ambient Loop',
      blurb: 'Calm generative motion that never repeats, with chapter cards on the hour.',
      mechanic: 'Built for the multi-hour session watch: nothing demands attention, nothing loops visibly, so the video stays on in the background and banks watch time by the hour.',
      bestFor: '1–3 hour study, focus, sleep and podcast backdrops',
      range: [600, 21600],
      aspect: '16:9',
      sceneSeconds: 22,
      interruptEvery: 120,
      captions: 'none',
      progressRail: true,
      background: 'auroraField',
      layoutPool: ['ambientCard', 'slateCard'],
      motion: { entry: 'fadeUp', camera: 'kenBurns', punch: 0 },
      palette: { bg: '#070a10', bg2: '#101a2c', ink: '#dfe7f5', muted: '#7d8ba6', accent: '#6ee7d7', accent2: '#8b93f8' }
    },

    {
      id: 'listicle',
      name: 'Listicle Countdown',
      blurb: 'A numbered rail down the side that fills as the list counts down.',
      mechanic: 'A visible countdown is a promise of an ending, and a list the viewer is halfway through is the strongest open loop on the platform. Number 1 lands last, on purpose.',
      bestFor: 'Top 10s, ranked lists, tier lists',
      range: [60, 2400],
      aspect: '16:9',
      sceneSeconds: 5,
      interruptEvery: 5,
      captions: 'phrase',
      progressRail: false,
      background: 'gradientPulse',
      layoutPool: ['rankCard', 'bigType', 'splitStat', 'bulletStack'],
      motion: { entry: 'slideIn', camera: 'punch', punch: 0.05 },
      palette: { bg: '#0a0a12', bg2: '#20143a', ink: '#ffffff', muted: '#a099bd', accent: '#fbbf24', accent2: '#f472b6' }
    }
  ];

  const byId = id => S.find(s => s.id === id) || S[0];

  /* Given a script's estimated length, which styles actually suit it. Used to
   * flag a 3-hour script pointed at a Shorts style before anything renders. */
  const fits = seconds => S.filter(s => seconds >= s.range[0] && seconds <= s.range[1]);

  const aspects = {
    '16:9': { w: 1920, h: 1080, label: 'YouTube long-form' },
    '9:16': { w: 1080, h: 1920, label: 'Shorts / Reels / TikTok' },
    '1:1': { w: 1080, h: 1080, label: 'Square feed' },
    '4:5': { w: 1080, h: 1350, label: 'Feed portrait' }
  };

  /* Render scales. 1080p is the export default because it is the lowest
   * resolution YouTube still gives the better codec to. */
  const qualities = {
    preview: 0.5,
    '720': 720 / 1080,
    '1080': 1,
    '1440': 1440 / 1080
  };

  return { list: S, byId, fits, aspects, qualities };
})();
