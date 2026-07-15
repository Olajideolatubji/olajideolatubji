---
name: weekly-review
description: Run the Guilty Paws weekly performance review — fresh stats, winners/losers diagnosis, experiment verdict, KPI check, and 1–2 concrete decisions for next week. Use on Mondays or whenever the user asks how the channel is doing.
---

Delegate to the **analytics-coach** subagent and deliver its report.

Requirements on the result before presenting it:
- The upload log's 24h/7d columns were actually updated (batch
  `vidiq_get_videos_by_ids`, one call), and the report was saved to
  `channel/logs/weekly-reviews/YYYY-MM-DD.md`.
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
