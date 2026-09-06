# Motion Lab

Paste a script, get an animated video — thirty seconds to three hours — plus the
chapters, titles and description to upload it with. It runs entirely in the
browser. No account, no API key, no credits, and the script never leaves the
machine.

Open `index.html`, or serve the folder:

```
npx http-server motion-lab -p 8099
```

## What it actually does

A script goes in. It comes out as a finished `.webm`, a music bed, a narration
sheet timed to the frame, YouTube chapter stamps that match the render, title
candidates, a description and tags.

The video is drawn, not generated. Every frame is a pure function of the
timeline and the timestamp — `ML.render.frame(ctx, timeline, t)` — with no
randomness that is not seeded off the scene. That is the whole design premise:
because the renderer is deterministic, the preview and the export are the same
video, any point in a three-hour timeline can be drawn without drawing the two
hours before it, and the failure modes are a finite list that can be checked
before rendering rather than spotted afterwards.

The trade is honest and worth stating plainly: it draws type, charts, diagrams,
sketch figures and generative fields. It does not draw people, places or
footage. When a script needs those, the **shot list** export hands the finished
plan — same beats, same durations, same chapters, with a visual prompt per shot
and a cast block — to a model that does.

## The eight styles

Each is built around a specific retention mechanic, not a colour scheme. The
`sceneSeconds` figure drives how the script is cut into beats; `interruptEvery`
is the cadence at which the picture changes hard enough to reset attention.

| Style | Built around | Suits |
|---|---|---|
| Retention Engine | Pattern interrupt every 4s plus a progress rail | 3–20 min essays and explainers |
| Kinetic Type | Word-by-word type; reads fastest with the sound off | Shorts, 30s–3 min |
| Motion Infographic | A counting number is an unfinished action | Finance, science, data |
| Whiteboard Sketch | A drawing in progress is an open loop | Teaching, how-to |
| Comic Impact | One-frame flash on the stressed word | Story, drama, retellings |
| Documentary Slate | Long holds signal authority | History, deep dives, 10 min–3 h |
| Ambient Loop | Nothing demands attention, so it stays on | 1–3 h study, focus, sleep |
| Listicle Countdown | A countdown is a promise of an ending | Top 10s, ranked lists |

## The retention layer

The devices are entries on the timeline, not effects baked into the drawing
code, so they can be counted, moved and scored before anything renders:

- **Hook window.** The first spoken line leads, held to 3.6s — but only if it
  can be said in 3.6s. A forty-word opening keeps its real length and gets
  flagged instead, because clamping it would run the narration out of sync with
  the picture for the whole opening.
- **Pattern interrupts.** Flagged on the first scene at or after each cadence
  mark, so the change lands on a cut rather than mid-sentence.
- **Open loop.** A card near the top naming a payoff from the last quarter of
  the script — only when the script actually has one.
- **Chapters.** From `##` headings, rendered as marker cards and exported as
  YouTube stamps that obey the rules that matter: first entry at 0:00, three or
  more entries, none under ten seconds. Break any of those and YouTube silently
  ignores the whole list.
- **Loop-back ending.** Returns to the opening question, which is what turns the
  last seconds into a replay rather than an exit.

The score out of 100 is measured off the timeline — hook, cadence, visual
variety, muted readability, structure, ending — and every line cites the number
it came from.

## Preflight

Thirteen checks run against the real timeline at the real output size, with
actual font metrics, actual contrast ratios and actual painted geometry.
Errors block the render; warnings are reported.

Text fit · minimum scene length · caption reading speed · WCAG contrast ·
repeated cards · hook timing · chapter coverage · interrupt cadence · words per
card · style/runtime fit · stretch sanity · safe-area geometry · ending.

`Fix everything fixable` corrects only what needs no guess about intent —
shrinking headlines to fit, lengthening scenes whose narration cannot be read in
the time, raising contrast, removing empty cards. Anything needing a decision
about the script is reported and left alone.

## Long-form

Two mechanisms reach a target longer than the script, and they are not
interchangeable. Holding scenes works up to a cap the style can carry (6× for
Ambient, 3.2× for Documentary, 2.2× elsewhere). Past that the sequence cycles,
reseeding its backgrounds each pass so the picture stays fresh while the words
come round — which is what a three-hour ambient video genuinely is. Every pass
is reported, and a runtime that needs 25 passes says so.

Rendering long-form is possible at all because of `js/webm.js`. `MediaRecorder`
timestamps frames off the wall clock, so it can only record as fast as the video
plays; three hours would take three hours. `VideoEncoder` has no such tie but
returns raw chunks with no container, so Motion Lab writes the WebM itself —
about 200 lines of EBML, with cues for seeking and clusters cut before the
16-bit relative timecode in a SimpleBlock can overflow. Measured here: roughly
1.4–2.5 ms per 1080p frame, so a three-hour video renders in about fifteen
minutes. Output is split into parts so the tab never holds the whole file in
memory; the export panel prints the `ffmpeg` line that joins them without
re-encoding and lays the narration and music under.

Where WebCodecs is missing the app falls back to real-time recording and says
so.

## Layout

```
index.html          panels: script → style → preview → preflight → score → packaging → render
css/app.css
js/util.js          maths, seeded rng, colour, contrast, text fitting
js/script.js        script → chapters and beats, with measured durations
js/styles.js        the eight styles
js/timeline.js      beats + style → seekable timeline, retention devices, long-form fill
js/render.js        frame(ctx, timeline, t) — backgrounds, layouts, overlays, camera
js/preflight.js     the thirteen checks, and the autofix
js/youtube.js       score, chapter stamps, titles, description, tags
js/webm.js          the EBML muxer
js/export.js        frame-exact render, segmenting, music bed, ffmpeg command
js/aibridge.js      shot list, cast block and job spec for a generative model
js/main.js          wiring
build-site.js       assembles motion-lab/_site for deployment
```

## Deploying

```
SITE_URL=https://example.github.io/motion-lab node motion-lab/build-site.js
```

`SITE_URL` is the public origin, optionally with a base path. Set it and the
build writes the canonical, `og:url` and sitemap; leave it unset and those tags
are omitted, because a canonical pointing at the wrong origin is worse than none
at all. `.github/workflows/pages.yml` publishes Video Lab at the site root and
Motion Lab under `/motion-lab/`.
