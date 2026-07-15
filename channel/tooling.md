# Guilty Paws — Tool Playbook & Budget

Which MCP tool to reach for at each stage, and how to spend credits.

## vidIQ credit budget

vidIQ tools draw from a small monthly pool: **150 credits/month** on the current
plan (balance was 46 → ~31 after channel setup research on 2026-07-15; resets
2026-08-01). Most research tools cost **5 credits/call**; media edits cost 1;
balance/jobs/polling are free.

**Rules:**
- Check `vidiq_balance` (free) before any research session.
- Budget guide: ~20 credits/week for research (weekly review + competitor scan +
  keyword refresh), keep ≥20 in reserve for the month's end.
- Batch: one `vidiq_get_videos_by_ids` with many IDs instead of many single calls.
- Prefer free alternatives when equivalent (e.g. web search for general questions;
  paid vidIQ calls only for data that needs vidIQ's index).

## Stage → tool map

### Research & ideation (trend-scout)
| Need | Tool |
|---|---|
| Viral outlier videos in the niche | `vidiq_outliers` |
| Keyword volume/competition (e.g. "funny dog shorts") | `vidiq_keyword_research` |
| What's trending now | `vidiq_trending_videos`, `vidiq_trend_categories` |
| TikTok/IG early signals | `vidiq_instagram_tiktok_outlier_search` |
| Find/track competitor channels | `vidiq_channel_search`, `vidiq_similar_channels`, `vidiq_list_competitors` / `vidiq_update_competitors` |
| Study a specific competitor video | `vidiq_video_stats`, `vidiq_video_transcript`, `vidiq_video_watch` |

### Production (producer)
| Need | Tool |
|---|---|
| Generate the AI video scenes | `mcp__harry__generate_video` (pick model via `models_explore(action:'recommend')` for animal realism + comedy timing) |
| Script/beat sheet | `vidiq_generate_script` (then rewrite in brand voice — never ship raw output) |
| Narrator VO | `vidiq_voiceover_generate` (pick a deadpan documentary voice from `vidiq_voiceover_list_voices`) |
| Music bed | `vidiq_generate_music` (quirky/comedic, license-safe) |
| Assemble scenes + VO + music + captions | `vidiq_compose` (9:16 `vertical`; music `duckTo` under VO) |
| Trim / normalize loudness / probe | `vidiq_edit_media` |
| Pre-publish virality/hook check | `mcp__harry__virality_predictor` |
| Async jobs | submit → `vidiq_job_poll` until done; list with `vidiq_jobs_list` |

### Optimization & publishing (seo-publisher)
| Need | Tool |
|---|---|
| Title candidates | `vidiq_generate_titles` → rewrite into brand grammar |
| Score titles | `vidiq_score_title` (pick best of ≥3) |
| Thumbnail (long-form only; Shorts use a chosen frame) | `vidiq_generate_thumbnail`, `vidiq_score_thumbnail` |

### Analytics (analytics-coach)
| Need | Tool |
|---|---|
| Owned-channel analytics (retention, traffic, subs) | `vidiq_channel_analytics` — **blocked until the user authorizes Guilty Paws in vidIQ** |
| Public per-video stats / VPH | `vidiq_video_stats`, `vidiq_channel_videos`, `vidiq_get_videos_by_ids` |
| Channel-level trajectory | `vidiq_channel_stats`, `vidiq_channel_performance_trends` (needs history to accumulate; channel is days old) |
| Comments | `vidiq_video_comments` |

### Other
- **Web research:** `firecrawl_search` / `firecrawl_scrape` (YouTube pages often
  403 on plain WebFetch; firecrawl handles them better).
- **Email** (`mcp__Gmail__*`): drafting outreach/brand-deal replies later —
  draft only, never send without explicit approval.

## Recurring automation (optional — needs user opt-in)

These can be created as scheduled Routines when the user says go:
- **Weekly review** — Mondays 08:00 UTC: run `/weekly-review`, deliver the report.
- **Daily trend pulse** — 06:00 UTC: cheap scan (1 outliers call), flag only
  actionable breakout premises, silent otherwise. (~35 credits/mo — only enable
  if the plan's credit pool grows.)
