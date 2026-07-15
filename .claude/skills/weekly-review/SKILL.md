---
name: weekly-review
description: Run the Guilty Paws weekly performance review — fresh stats, winners/losers diagnosis, experiment verdict, KPI check, and 1–2 concrete decisions for next week. Use on Mondays or whenever the user asks how the channel is doing.
---

Delegate to the **analytics-coach** subagent and deliver its report.

Requirements on the result before presenting it:
- Real numbers were used: **ask the user for their YouTube Studio stats
  first** (user rule); fall back to one batched `vidiq_get_videos_by_ids`
  call if they're unavailable. The upload log's 24h/7d columns were actually
  updated and the report saved to `channel/logs/weekly-reviews/YYYY-MM-DD.md`.
- The patience protocol was applied: under 15 uploads → patience, no format
  changes; after 15 uploads with nothing over 50 views → the format-change
  proposal (e.g. second recurring pet character) is raised.
- It states absolute numbers honestly (a 12-view week is reported as a 12-view
  week) and separates *signal* from *noise* given the sample size.
- It ends with 1–2 decisions and exactly one named experiment for next week —
  if it ends with only observations, send it back.
- While vidIQ channel authorization is still missing, the report's header
  carries the standing reminder that retention analytics are blocked until the
  user connects Guilty Paws in vidIQ.

Then apply the decisions: update `channel/content-strategy.md` /
`channel/ideas-backlog.md` where the decisions change them, and tell the user
what changed.
