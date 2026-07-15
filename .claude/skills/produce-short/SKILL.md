---
name: produce-short
description: Produce one finished Guilty Paws Short end-to-end from a backlog concept — video, audio, assembly, QC, and full upload package. Use when the user wants a video made or the ready-buffer falls below 3.
---

Run the full production line for one Short. Argument (optional): a backlog
concept ID (e.g. `K2`) or a fresh premise; default is the highest-scored 🟢
concept in the pillar due next.

1. **Produce:** delegate to the **producer** subagent with the chosen concept.
   It returns the video URL, beat sheet, duration, section-A checklist, and
   virality-predictor notes. Generation is async — poll jobs to completion
   within this session; do not hand back half-finished work.
2. **Package:** delegate to the **seo-publisher** subagent with the finished
   video and beat sheet. It returns the scored title, description, tags,
   pinned comment, schedule slot, and the B/C/D checklist.
3. **Gate:** confirm every section of `channel/publishing-checklist.md` passed.
   Any failure → send it back to the responsible subagent to fix; if unfixable,
   kill the video and say why rather than shipping a compromise.
4. **Deliver** in one message: video link, the complete copy-pasteable metadata
   block, schedule slot, the full ticked checklist, and the reminder to tick
   **"Altered content"** in YouTube Studio. Confirm the backlog row moved to
   🔵/produced and the upload-log row exists.

Budget note: generation happens on the harry/Higgsfield side; vidIQ credits go
to compose/edit/scoring (~5–10 per video). Check `vidiq_balance` first and
state what was spent.
