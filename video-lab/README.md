# Video Lab

Drop in a video, get a score out of 100, see exactly what is holding it back, then fix
it and export the new cut. Everything runs in the browser — the video is never uploaded
anywhere.

## Running it

It is a static site with no build step and no dependencies.

```bash
# from the repository root
npx http-server -p 8123 .
# then open http://127.0.0.1:8123/video-lab/
```

Opening `video-lab/index.html` straight from disk works too (the scripts are plain
classic scripts, not ES modules, precisely so `file://` works).

## What it actually measures

Nothing here is guessed from the filename or the metadata. The video is decoded and
sampled — up to 420 frames, at least one every 0.18s — and each sampled frame is
measured at 256px wide:

| Signal | How |
| --- | --- |
| Movement | Mean absolute luma difference between consecutive samples |
| Cuts | Pixel difference plus 32-bin luma histogram distance, against an adaptive threshold |
| Focus | Variance of the Laplacian (the standard cheap focus measure) |
| Exposure | Mean luma, plus the share of crushed and blown pixels |
| Contrast | Standard deviation of luma |
| Colour | Hasler–Süsstrunk colourfulness, plus mean saturation |
| Subject framing | Share of total edge energy falling inside the middle 50% of the frame |
| Person on screen | Coarse skin-tone pixel ratio |

The audio track is decoded with `decodeAudioData` and measured for average level
(dBFS RMS over voiced windows), true peak, clipping, silence share, dynamic range,
and voice-band energy (a 300–3400 Hz bandpass rendered offline, compared with the
raw signal). If the browser will not decode the container, it falls back to playing
the file silently at up to 6× through an analyser node.

Dead zones are stretches where the sound drops out — or, when there is no audio track,
where the picture stops moving. The audio gap is the signal that matters when audio
exists, because a locked-off talking head has very little pixel motion and is not dead air.

## How the score works

Seven categories, each scored 0–100 against stated targets, then weighted. The weights
shift with the platform preset (Shorts, 4:5 feed, or YouTube long-form):

- **Hook** — movement, cuts, sharpness, exposure and audio punch inside the opening window
- **Pacing** — cuts per minute, longest unchanged shot, share of runtime that is dead
- **Retention shape** — runtime against the format's range, and whether energy holds to the end
- **Image quality** — focus, exposure, contrast, clipping
- **Colour & vibrance** — colourfulness, saturation, variety between shots
- **Audio** — level against target, silence, clipping, dynamics, voice presence
- **Format fit** — aspect ratio, resolution, whether the subject survives the platform's UI

A video with no usable audio track is capped at 62, because silent video is capped on
every platform.

Each failing check produces a recommendation carrying the measured numbers, the fix,
and an estimate of the points it is costing. The estimate is a share of that category's
weighted deficit, so the recommendations always sum to the gap between the current score
and the ceiling shown on the report.

## The studio

Every recommendation with a mechanical fix has an **Apply** button that loads real
parameters into the editor — the exposure fix sets brightness from the measured mean
luma, the audio fix sets gain from the measured level against the platform target, the
hook fix trims to the first sharp moving frame it found.

Manual controls cover trimming, reframing to 9:16 / 4:5 / 1:1 / 16:9 with zoom and pan,
colour, punch-ins on every detected cut, speeding through dead zones, burnt-in hook text
and captions, a progress bar, and audio gain.

Export records the same draw pipeline the preview uses, in real time, so a 30s clip takes
about 30s. Output is WebM (VP9 or VP8 with Opus). You also get a cover PNG and a Markdown
report. **Score this new version** feeds the exported file straight back through the
analyser, so you can see whether the edit actually moved the number.

## Inspecting the raw data

After an analysis, `window.videoLabAnalysis` in the console holds every measurement —
per-frame metrics, detected cuts, the audio envelope, and the dead zones.

## Browser support

Chrome, Edge and Firefox are fully supported. Safari analyses and previews fine, but its
`MediaRecorder` support for WebM is limited, so export may be unavailable there.

## Publishing it

`.github/workflows/pages.yml` deploys this directory to GitHub Pages on pushes to `main`.
It stays inert until two deliberate steps: merging to `main`, and setting
**Settings → Pages → Source** to **GitHub Actions**. Note that this repository is the
profile repository, so enabling Pages publishes at `https://olajideolatubji.github.io/`,
with the app at `/video-lab/`.
