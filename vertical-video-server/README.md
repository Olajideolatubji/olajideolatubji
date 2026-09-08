# Vertical Video Server

A self-hosted server for producing vertical video from 15 seconds to 3 hours.
Single operator, Docker on a Linux VPS. HeyGen renders the segments; this server
owns the structure, the queue and the assembly.

There is no website to visit until you start it: the dashboard exists on the
machine that runs it, and nowhere else. Install
[Docker Desktop](https://www.docker.com/products/docker-desktop) (free), then
paste this one line into a terminal — no git, no clone, nothing else to set up:

```bash
cd ~/Desktop && curl -sL -o vvs.zip https://github.com/Olajideolatubji/olajideolatubji/archive/refs/heads/claude/vertical-video-server-w1hj73.zip && unzip -oq vvs.zip && cd olajideolatubji-claude-vertical-video-server-w1hj73/vertical-video-server && bash deploy/local.sh
```

It prints your link — `http://localhost:8000` — and the password to get in.

If you already have the code:

```bash
cd vertical-video-server
bash deploy/local.sh      # generates a password, starts it, prints your link
```

Or by hand:

```bash
cp .env.example .env      # set OPERATOR_PASSWORD, SECRET_KEY, HEYGEN_API_KEY
docker compose up -d --build
```

`.env` is optional — the stack comes up on defaults without one and logs a
warning that it is using the shipped password — but you want it. (Needs Docker
Compose v2.24 or newer for the optional env file; older versions require the
`cp` above.)

That gets you `http://localhost:8000` on your own machine. For a link you can
open from anywhere, see **Putting it on your own URL** below.

---

## Running it for free

You do not have to rent anything. Pick whichever of these fits.

### 1. On the computer you already own — free, working in minutes

Install [Docker Desktop](https://www.docker.com/products/docker-desktop) (free),
then from this directory:

```bash
bash deploy/local.sh
```

It generates a password, starts everything and prints your link:
`http://localhost:8000`. That is your own server — nothing is hosted by anyone
else, no account, no card. `bash deploy/local.sh --stop` stops it; your projects
and videos are kept.

It runs while the computer is awake. If it sleeps mid-render, the build resumes
from the last finished chapter when it wakes — that is what the checkpointing is
for.

### 2. Free public link, for your phone or to show someone

```bash
bash deploy/local.sh --tunnel
```

Same thing, plus a Cloudflare quick tunnel: you also get a
`https://something.trycloudflare.com` address that works from anywhere, with no
account and no domain. The address is temporary and changes every restart, so
treat it as a way in rather than a home. Anyone with the link still needs your
password.

### 3. Free and always on — Oracle Cloud Always Free

Oracle's free tier gives 4 ARM cores, 24GB RAM and 200GB of disk, permanently,
which is more than this needs. Create an **Ampere (VM.Standard.A1.Flex)**
instance running Ubuntu, then run the bootstrap below on it. Worth knowing
before you start:

* Signup asks for a card to verify identity. Always Free resources are not
  charged — choose the "Always Free" shapes and stay on them.
* Ampere capacity is often unavailable in a region; try another, or retry later.
* You must open ports 80 and 443 in the **VCN security list** in Oracle's web
  console. The bootstrap opens the server's own firewall, but it cannot touch
  Oracle's — this is the usual reason a working server there looks dead.

---

## Putting it on a rented server

If you want it always on without Oracle's hoops, one command on a fresh Ubuntu
or Debian box — a £4/month VPS is plenty — gives you `https://your-address` with
a certificate that renews itself. SSH in as root and run:

```bash
# a domain you own: point its A record at the server first
curl -fsSL https://raw.githubusercontent.com/Olajideolatubji/olajideolatubji/claude/vertical-video-server-w1hj73/vertical-video-server/deploy/bootstrap.sh \
  | bash -s -- --domain video.example.com

# no domain, nothing to buy: served at https://<your-ip>.sslip.io
curl -fsSL https://raw.githubusercontent.com/Olajideolatubji/olajideolatubji/claude/vertical-video-server-w1hj73/vertical-video-server/deploy/bootstrap.sh \
  | bash -s -- --auto
```

It installs Docker if the box does not have it, fetches the code, generates a
real password and secret key, starts the stack behind Caddy and prints the link
and the password. Re-run it any time to update — it never overwrites your
`.env`, so your password and API keys survive.

`--auto` uses [sslip.io](https://sslip.io), which resolves `<ip>.sslip.io` to
that IP, so Let's Encrypt will issue a genuine certificate for a server with no
domain of its own. `--http` skips certificates entirely and serves plain HTTP on
the IP; your password crosses the network in the clear, so treat it as a
stop-gap.

What the deploy changes, relative to the local stack:

| | Local | Deployed |
| --- | --- | --- |
| Reachable on | `localhost:8000` | 80/443, Caddy only |
| API port | published | not published — the proxy is the only way in |
| Session cookie | plain | `Secure`, and uvicorn trusts `X-Forwarded-Proto` |
| Certificates | none | issued and renewed by Caddy |

Sizing: two vCPUs and 4GB handles the ffmpeg work for one operator; the joins
are the heavy part, not the renders, which happen on HeyGen's machines. Give it
disk for the intermediates — roughly 20MB per finished minute, several times
that mid-build before takes are pruned, so a 3-hour project wants ~40GB free.

Day two:

```bash
cd /opt/vertical-video-server/vertical-video-server
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml"
$COMPOSE logs -f                                  # what it is doing
$COMPOSE ps                                       # what is running
$COMPOSE exec postgres pg_dump -U vvs vvs > backup.sql   # the job history
docker run --rm -v vertical-video-server_media:/data -v "$PWD:/out" \
  alpine tar czf /out/media.tar.gz /data          # the finished videos
```

The database holds every job payload and the cost ledger; the `media` volume
holds the video. Those two are what to back up — everything else rebuilds.

`HEYGEN_TEST` defaults to `true`: renders come back watermarked and consume no
credits. Turn it off when you mean it.

---

## Architecture

FastAPI + Postgres + Redis + Celery. Nothing synchronous happens in the request
cycle — the API writes rows and returns; the workers spend the money.

```
              ┌───────────┐   plan/start/inspect   ┌──────────────┐
  operator ──▶│  FastAPI  │───────────────────────▶│  Postgres    │
              │ dashboard │                        │ jobs, plans, │
              └─────┬─────┘                        │ costs        │
                    │ enqueue                      └──────┬───────┘
                    ▼                                     │ read/write
              ┌───────────┐   submit / poll / stitch      │
              │  Celery   │◀──────────────────────────────┘
              │  workers  │──▶ HeyGen REST  ──▶ MP4 per segment
              └─────┬─────┘──▶ ComfyUI      ──▶ stills + image-to-video
                    │
                    ▼  ffmpeg: normalise, crossfade seams, grade once, burn captions
              /data/projects/<id>/{segments,chapters,takes,final}
```

Every generation of any kind is a **job row**: `id`, `parent_id`, project,
chapter, segment, step, provider, the full payload, status, cost, output path,
error, created. Jobs are never overwritten and the payload is never trimmed, so
a video that lands can be diffed against one that does not.

Layout:

| Path | What it is |
| --- | --- |
| `app/format/` | tiers, planner, script validation |
| `app/providers/` | provider abstraction, HeyGen, ComfyUI, TTS, failover registry |
| `app/providers/heygen_urls.py` | every HeyGen URL, in one module |
| `app/media/` | ffmpeg, captions, storage and pruning |
| `app/tasks.py` | the queue: driver, submit, poll, assemble, resume |
| `app/service.py` | planning to rows, progress for the dashboard |
| `app/cost.py` | preflight estimates, ledger, monthly cap |
| `app/static/` | the dashboard |

### Providers

Two kinds of backend behind one registry:

* `CompositionProvider` — hand over a spec for a whole segment, get one MP4 back
  (HeyGen).
* `ImageProvider` / `VideoProvider` — per-beat stills and image-to-video
  (ComfyUI).

`RENDER_MODE` picks the path (`composition` by default, `beats` for ComfyUI).
Each step has a chain: the first provider is primary, the rest are failover, and
a repeated failure walks down the chain rather than hammering the same backend.
Override with `PROVIDER_CHAINS`:

```
PROVIDER_CHAINS={"segment_render":["heygen","heygen_agent"],"tts":["elevenlabs"]}
```

---

## Renderer: HeyGen

REST, not the MCP connector. Auth is an `X-Api-Key` header. Async: submit, get a
`video_id`, poll for status — never faster than every 20 seconds
(`HEYGEN_POLL_SECONDS` is clamped to a floor of 20).

* **TEMPLATE mode** (primary): build a template once in the HeyGen dashboard
  with named placeholders, then fill it per segment via
  `POST /v2/template/{id}/generate`. The placeholder names are configurable
  (`HEYGEN_PLACEHOLDER_SCRIPT`, `_TITLE`, `_BACKGROUND`).
* **AGENT mode** (fallback): prompt in, video out, less control. Needs
  `HEYGEN_AVATAR_ID` and `HEYGEN_VOICE_ID`.

**Version note.** v2 is HeyGen's legacy Studio API, supported to 1 Oct 2026. v3
is current but does not yet cover templates, and templates are how this server
drives HeyGen — so segment rendering stays on v2. Every URL lives in
`app/providers/heygen_urls.py`, including a `V3_BASE` constant, so the migration
is a diff in one file.

### The duration limit

HeyGen renders fail when a video exceeds the plan's duration cap. That cap is a
config value — `HEYGEN_MAX_SEGMENT_SECONDS` — and the planner respects it
automatically. Ask for 90 minutes and the server plans the segments, renders
them separately and concatenates locally. At the default 300-second cap that is
18 segments; drop the cap to 180 and the same 90 minutes becomes 36. The
operator never has to think about it.

```
$ curl -s '.../api/shape?target_seconds=5400' | jq '{tier, segments, chapters}'
{ "tier": "long", "segments": 18, "chapters": 18 }
```

Segments never straddle a chapter, so a chapter is always a whole number of
segments and stays independently renderable.

---

## Length tiers

Target length is set at project creation and selects a tier. The tier changes
the structure, the cadence and the render strategy. One codebase.

### `short` — 15–90s

A fixed four-beat structure, no chapters. The windows scale proportionally above
15s; the roles never move.

| beat | window at 15s | role | |
| --- | --- | --- | --- |
| 0 | 0.0–2.5s | HOOK | pattern break inside 1.5s |
| 1 | 2.5–7.0s | SETUP | context |
| 2 | 7.0–12.0s | TURN | the reveal |
| 3 | 12.0–15.0s | PAYOFF | lands, reads as a lead-in to the hook |

One segment, one HeyGen render, no stitching. Script rules enforced in code:

* ~40 word cap at 15s, scaled by duration (80 at 30s, 160 at 60s)
* ~2.6 narration words per second per beat; a beat that overruns is flagged
  **with the number** it is over by
* a hook over 7 words fails validation
* audio is never sped up to fit a long script — an over-budget script is an
  error you have to rewrite, not a tempo problem

### `mid` — 3–20 min

Chaptered. Beats of 8–15s inside chapters, chapter markers roughly every 90s.
Each chapter renders as its own segment, or splits further if it exceeds the
HeyGen cap. Hook rules still apply to the opening 10 seconds.

### `long` — 20 min to 3 hours

Chapters first, beats second. Beat length 20–60s — scene level, not shot level.

* Every chapter is independently renderable and resumable.
* **Reuse is mandatory**: each chapter gets a pool of background plates
  (`PLATE_POOL_PER_CHAPTER`), recomposed with varied framing rather than
  regenerated per beat.
* Beats past `LOOPABLE_MIN_SECONDS` are marked loopable: rendered once, looped
  under long narration.
* Expensive treatment is reserved for chapter openers and beats marked
  `key_moment`, capped at `MAX_EXPENSIVE_BEATS_PER_CHAPTER`.

---

## Long-form behaviour

**Checkpointing.** `advance_project` is the only driver: it reads the database,
dispatches the next unit of work and returns; every unit calls it again when it
finishes. Chapters checkpoint on completion, so a crash loses at most one
in-flight segment. A Celery beat sweep (`RESUME_SWEEP_SECONDS`) pushes every
active project forward and re-arms stale polls, so a restarted stack resumes at
the last completed chapter, never at the beginning.

**Incremental assembly.** Each chapter is concatenated the moment it finishes,
then the chapters are joined. A join never feeds more than
`FFMPEG_MAX_JOIN_INPUTS` inputs to a single ffmpeg call — the list is folded a
level at a time — so three hours of intermediates never sit in one command.

**Segment seams.** Segments are rendered independently and will not match, so:
one consistent template for every segment of a project; an audio crossfade of
`SEAM_CROSSFADE_MS` (clamped to 200–400ms) at every seam, with a matching video
crossfade of the same length so audio and video shorten identically and stay in
sync; and the colour grade applied **once** over the joined output rather than
per segment.

**Cost preflight.** Before a long-tier render the dashboard shows an itemised
estimate — segments, credits, TTS, storage — and the render will not start
until it is explicitly confirmed. If the estimate plus month-to-date spend
exceeds `MONTHLY_COST_CAP_USD` it is refused outright.

**TTS chunking.** Narration is synthesised per beat, never per chapter. Long
single calls drift in pace and fail expensively.

**Storage.** Superseded takes are pruned automatically; the accepted output and
the full payload history in Postgres are what survive.

**Progress.** The dashboard shows chapter-by-chapter progress, with segment
boundaries drawn explicitly. A three-hour build runs for hours; there is no
single indeterminate spinner anywhere.

---

## Dashboard

One page, served by the API, one password from `OPERATOR_PASSWORD`.

* **Short tier** — four lanes, one per beat, widths proportional to real
  duration, colour-coded by role, live word count against each beat's budget
  turning red on overrun. Edit the script in the lanes and save to re-plan.
* **Mid and long** — a chapter list with per-chapter status and progress,
  expanding into beats; segment boundaries drawn as hatched seam marks so you
  can see where the joins are.
* **Jobs** — status, cost, and the real provider error text. Nothing is
  swallowed; the full payload and response are one click away.
* **Batches** — a grid of 20 shorts to review side by side.
* **Cost** — month-to-date against the cap, per video, per kind, plus the pause
  switch.
* **Export queue** — per-platform title, description, hashtags. Publishing is
  manual; nothing posts anywhere.

---

## Batch and iteration

* **Batch mode** — queue 20 shorts in one request, review them in a grid. At
  four beats each this is affordable, and volume is the strategy at that length.
* **Hook variants** — store 8 hooks per concept, render the opening for the top
  3, pick from real output rather than text. Rejects are kept, marked rejected.
* **Variant re-cut** — resubmit with a different hook, body unchanged; the new
  project records `source_project_id`.
* **Chapter isolation** — re-rendering one chapter requeues only that chapter's
  segments and rebuilds the final; the other chapter files are untouched.
* **Beat re-roll** (beats mode) — each beat keeps its own accepted take, so
  re-rolling one beat never re-renders the others.

---

## Ops

* **Cost** is recorded per job, per segment, per video and per month. Reaching
  `MONTHLY_COST_CAP_USD` pauses the queue; the dashboard shows why and refuses to
  resume until the cap is raised.
* **Retries** use exponential backoff (`RETRY_BACKOFF_SECONDS` doubling to
  `RETRY_BACKOFF_MAX_SECONDS`), and each retry moves one step down that step's
  provider chain.
* **Polls** stop after `HEYGEN_MAX_POLL_MINUTES` rather than waiting forever.
* **Media** is served with HTTP range support so takes can be scrubbed in the
  browser; paths outside `STORAGE_ROOT` are refused.

### API

Everything except `/api/login`, `/api/logout` and `/api/health` requires the
session cookie or an `X-Operator-Password` header.

```
POST   /api/login                       GET    /api/config
GET    /api/shape?target_seconds=       GET    /api/providers
GET    /api/projects                    POST   /api/projects
GET    /api/projects/{id}               PATCH  /api/projects/{id}
POST   /api/projects/{id}/replan        GET    /api/projects/{id}/preflight
POST   /api/projects/{id}/confirm       POST   /api/projects/{id}/start
POST   /api/projects/{id}/pause         POST   /api/projects/{id}/cancel
GET    /api/projects/{id}/progress      POST   /api/projects/{id}/recut
GET    /api/projects/{id}/hooks         POST   /api/projects/{id}/hooks
POST   /api/projects/{id}/hooks/render  POST   /api/hooks/{id}/choose
POST   /api/chapters/{id}/rerender      POST   /api/segments/{id}/rerender
POST   /api/beats/{id}/reroll           GET    /api/jobs  ·  /api/jobs/{id}
POST   /api/batches                     GET    /api/batches · /api/batches/{id}
GET    /api/cost                        POST   /api/queue/pause · /resume
GET    /api/exports                     POST   /api/exports · PATCH · DELETE
GET    /api/media?path=                 GET    /api/health
```

Example — a 90-minute build:

```bash
curl -sX POST localhost:8000/api/projects -H 'X-Operator-Password: ...' \
  -H 'Content-Type: application/json' \
  -d '{"name":"the long one","target_seconds":5400,"script":"..."}'
curl -sX POST localhost:8000/api/projects/$ID/confirm -H 'X-Operator-Password: ...'
curl -sX POST localhost:8000/api/projects/$ID/start   -H 'X-Operator-Password: ...'
```

---

## The second path: ComfyUI

`RENDER_MODE=beats` switches to a local ComfyUI: per-beat stills, image-to-video,
character reference sheets injected into every image call, per-beat accept files.
Not in use yet — switching is a config change.

Workflows are ordinary ComfyUI API-format JSON graphs with `{{token}}`
placeholders (`workflows/image.json`, `workflows/image_to_video.json` ship as
starting points). Recognised tokens:

```
{{prompt}} {{negative}} {{seed}} {{width}} {{height}} {{frames}} {{fps}}
{{input_image}} {{reference_image}} {{reference_images}} {{beat_id}}
```

Drop character reference sheets into `COMFYUI_REFERENCE_DIR/<project_id>/` (or
the directory root for a global sheet); they are passed into every image call.
Wire the reference `LoadImage` node into the IPAdapter or ControlNet stack you
actually run.

On this path nothing speaks the script for you, so a beats project with
narration refuses to start while `TTS_PROVIDER=heygen` — better a refusal at the
start than three hours of silent beats.

---

## Environment variables

Every variable, with its default. `.env.example` is the same list, ready to copy.

### Core

| Variable | Default | |
| --- | --- | --- |
| `OPERATOR_PASSWORD` | `change-me` | the one password |
| `SECRET_KEY` | `change-me-too` | signs the session cookie |
| `SESSION_HOURS` | `168` | cookie lifetime |
| `APP_NAME` | `vertical-video-server` | |
| `DATABASE_URL` | `postgresql+psycopg://vvs:vvs@postgres:5432/vvs` | |
| `REDIS_URL` | `redis://redis:6379/0` | broker, results, project locks |
| `STORAGE_ROOT` | `/data` | all media lives under here |
| `LOG_LEVEL` | `INFO` | |
| `RENDER_MODE` | `composition` | `composition` (HeyGen) or `beats` (ComfyUI) |
| `API_PORT` | `8000` | compose only |
| `WORKER_CONCURRENCY` | `4` | compose only |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | `vvs` | compose only |

### HeyGen

| Variable | Default | |
| --- | --- | --- |
| `HEYGEN_API_KEY` | — | sent as `X-Api-Key` |
| `HEYGEN_MODE` | `template` | `template` or `agent` |
| `HEYGEN_TEMPLATE_ID` | — | required in template mode |
| `HEYGEN_AVATAR_ID` | — | required in agent mode |
| `HEYGEN_VOICE_ID` | — | required in agent mode |
| `HEYGEN_BACKGROUND_COLOR` | `#000000` | agent mode background |
| `HEYGEN_TEST` | `true` | watermarked renders, no credits consumed |
| `HEYGEN_POLL_SECONDS` | `20` | floor of 20, never faster |
| `HEYGEN_REQUEST_TIMEOUT` | `60` | seconds per HTTP call |
| `HEYGEN_MAX_POLL_MINUTES` | `90` | give up on a stuck render |
| `HEYGEN_MAX_SEGMENT_SECONDS` | `300` | **the duration cap the planner respects** |
| `HEYGEN_DIMENSION_WIDTH` | `1080` | |
| `HEYGEN_DIMENSION_HEIGHT` | `1920` | |
| `HEYGEN_PLACEHOLDER_SCRIPT` | `script` | template placeholder name |
| `HEYGEN_PLACEHOLDER_TITLE` | `title` | template placeholder name |
| `HEYGEN_PLACEHOLDER_BACKGROUND` | `background` | template placeholder name |
| `PROVIDER_CHAINS` | — | JSON per-step provider chain override |

### ComfyUI (beats path)

| Variable | Default | |
| --- | --- | --- |
| `COMFYUI_URL` | `http://comfyui:8188` | |
| `COMFYUI_IMAGE_WORKFLOW` | `/srv/workflows/image.json` | |
| `COMFYUI_VIDEO_WORKFLOW` | `/srv/workflows/image_to_video.json` | |
| `COMFYUI_POLL_SECONDS` | `5` | |
| `COMFYUI_TIMEOUT_SECONDS` | `900` | per beat |
| `COMFYUI_REFERENCE_DIR` | `/data/references` | character reference sheets |

### TTS

| Variable | Default | |
| --- | --- | --- |
| `TTS_PROVIDER` | `heygen` | `heygen` (renderer speaks), `elevenlabs`, `none` |
| `ELEVENLABS_API_KEY` | — | |
| `ELEVENLABS_VOICE_ID` | — | |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | |
| `TTS_MAX_CHARS_PER_CALL` | `900` | per beat; longer is refused, not split silently |

### ffmpeg

| Variable | Default | |
| --- | --- | --- |
| `FFMPEG_BIN` / `FFPROBE_BIN` | `ffmpeg` / `ffprobe` | |
| `VIDEO_WIDTH` | `1080` | |
| `VIDEO_HEIGHT` | `1920` | |
| `VIDEO_FPS` | `30` | |
| `VIDEO_CRF` | `19` | |
| `VIDEO_PRESET` | `medium` | x264 preset |
| `AUDIO_BITRATE` | `192k` | |
| `SEAM_CROSSFADE_MS` | `300` | clamped to 200–400 |
| `FFMPEG_MAX_JOIN_INPUTS` | `8` | inputs per ffmpeg call when joining |
| `COLOR_GRADE_FILTER` | `eq=contrast=1.05:saturation=1.08:gamma=0.98` | applied once, at the end |
| `BURN_CAPTIONS` | `true` | |
| `CAPTION_STYLE` | ASS style string | see `.env.example` |
| `MUSIC_DUCK_THRESHOLD` | `0.05` | sidechain threshold |
| `MUSIC_DUCK_RATIO` | `8` | sidechain ratio |

### Cost

| Variable | Default | |
| --- | --- | --- |
| `COST_PER_RENDER_MINUTE_USD` | `0.30` | |
| `COST_PER_SEGMENT_USD` | `0.0` | flat per-render fee, if any |
| `COST_PER_TTS_1K_CHARS_USD` | `0.18` | |
| `STORAGE_COST_PER_GB_MONTH_USD` | `0.02` | |
| `ESTIMATED_MB_PER_MINUTE` | `18.0` | for the storage line of the estimate |
| `MONTHLY_COST_CAP_USD` | `200` | reaching it pauses the queue |
| `LONG_TIER_REQUIRES_CONFIRMATION` | `true` | long renders ask before spending |

### Queue and long form

| Variable | Default | |
| --- | --- | --- |
| `MAX_CONCURRENT_SEGMENT_JOBS` | `3` | in-flight renders per project |
| `MAX_RETRIES` | `4` | per segment |
| `RETRY_BACKOFF_SECONDS` | `20` | doubles per attempt |
| `RETRY_BACKOFF_MAX_SECONDS` | `900` | backoff ceiling |
| `RESUME_SWEEP_SECONDS` | `60` | crash-recovery sweep interval |
| `MAX_EXPENSIVE_BEATS_PER_CHAPTER` | `2` | |
| `PLATE_POOL_PER_CHAPTER` | `4` | plates recomposed instead of regenerated |
| `LOOPABLE_MIN_SECONDS` | `20` | beats at or over this are looped |
| `PRUNE_SUPERSEDED_TAKES` | `true` | |

---

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

The suite covers the planner (including 90 minutes splitting into segments under
the cap), the script rules, the HeyGen request and error handling, provider
failover, cost preflight and the real ffmpeg filter graphs. The integration
tests drive the whole task pipeline — plan, submit, poll, stitch, grade, caption,
resume, per-chapter re-render, and the ComfyUI beats path with its per-beat
re-roll — against faked providers and real ffmpeg. Tests that need ffmpeg skip
themselves when it is not installed.

The dashboard has its own check, which seeds a throwaway database with a
finished short, a long build mid-flight and a batch, serves it, and drives it in
a real browser:

```bash
pip install playwright && playwright install chromium
python scripts/ui_smoke.py                 # asserts + screenshots, fails on console errors
python scripts/ui_smoke.py --keep-serving  # leave it up and click around
```

Set `CHROMIUM_PATH` if the host already has a browser Playwright did not
download itself.
