---
name: ideate
description: Generate and score 10 new Guilty Paws episode concepts and add the keepers to the ideas backlog. Use when the backlog drops below 15 ready concepts or the user asks for new video ideas.
---

Refill the Guilty Paws ideas backlog with concepts that fit the brand exactly.

1. Read `channel/brand-bible.md` (premise, format, title grammar),
   `channel/content-strategy.md` (pillars), `channel/ideas-backlog.md` (what
   exists — no near-duplicates), and `channel/logs/upload-log.md` (what has
   already shipped and how it did).
2. Optionally delegate a niche scan to the **trend-scout** subagent if the last
   scan is >1 week old and vidIQ credits allow (~10–15 credits); otherwise
   ideate from the brand docs alone — the premise engine ("small dog, enormous
   crime, zero remorse") does not require research to run.
3. Generate **10 concepts** spread across pillars, weighted toward the pillars
   currently winning per the upload log. Each concept must specify:
   - the three beats (setup → escalation → punchline/guilty-look),
   - a working title in the exact title grammar (`Setup. Deadpan consequence 😂`),
   - pillar, and a 1–5 score (hook strength + escalation ceiling + brand fit).
4. Quality bar: the escalation must be *bigger than physically possible*; the
   punchline personifies a victim object/room or states an administrative
   consequence. Kill any concept that is merely "dog does cute thing."
5. Append concepts scoring ≥3 to `channel/ideas-backlog.md` under their pillar
   as 🟢 (or 🟡 with a note on what's missing). Present all 10 to the user with
   scores, flagging your top 3 picks for production.
