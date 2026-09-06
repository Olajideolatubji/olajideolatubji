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

## Publishing it on Firebase Hosting

Firebase is Google's static hosting. The free Spark plan covers this site.

Deploying needs a Google account login, so these commands have to be run by you —
they cannot be run from a CI job or an agent session without your credentials.

**One time:**

1. Create a project at https://console.firebase.google.com — the project ID you pick
   becomes the URL, so `video-lab` gives you `https://video-lab.web.app`.
2. Log the CLI in: `npx firebase-tools login`

**Every deploy:**

```bash
# SITE_URL must match the live origin — it writes the canonical tag and sitemap
SITE_URL=https://video-lab.web.app node video-lab/build-site.js
npx firebase-tools deploy --only hosting --project video-lab
```

`firebase.json` at the repository root points hosting at `video-lab/_site`, which
`build-site.js` generates. Deploying without running the build first would ship a stale
directory, so keep the two commands together.

### Getting it into Google search

Hosting makes the page reachable; it does not make it appear in Google. After the first
deploy:

1. Add the site at https://search.google.com/search-console and verify ownership —
   the easiest method is the DNS or HTML-file option it offers.
2. Submit `https://your-site.web.app/sitemap.xml` under **Sitemaps**.
3. Use **URL inspection → Request indexing** on the homepage to skip the queue.

Indexing usually takes a few days to a couple of weeks. `build-site.js` already emits
the parts Google looks for: a descriptive title and meta description, a canonical URL,
`WebApplication` structured data, Open Graph and Twitter card tags, `robots.txt` and
`sitemap.xml`. Ranking for anything competitive then depends on people linking to it,
which no amount of markup substitutes for.

## Publishing it on GitHub Pages instead

`.github/workflows/pages.yml` is an alternative that needs no Google account. It runs on
pushes to `main` that touch `video-lab/`, and `actions/configure-pages` is set to
`enablement: true`, so the workflow switches Pages on itself rather than waiting for
anyone to change repository settings.

This repository is the profile repository, so it publishes the app at the root:
`https://olajideolatubji.github.io/`. To take the site down again, turn Pages off under
**Settings → Pages**, and remove or disable this workflow so the next push does not
switch it back on.
