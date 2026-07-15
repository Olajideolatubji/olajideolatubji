---
name: produce-short
description: Produce one Guilty Paws episode package end-to-end from a backlog concept — three-shot beat sheet, full Kling 3.0 generation prompts, and the complete upload metadata. Use when the user wants a new video or the ready-buffer falls below 3.
---

Run the production line for one episode. Argument (optional): a backlog
concept ID (e.g. `E2`) or a fresh premise; default is the highest-scored 🟢
concept, impossible-environments lane first.

1. **Produce:** delegate to the **producer** subagent. It returns the
   three-shot beat sheet, the three copy-pasteable **Kling 3.0 prompts**
   (pro mode, sound on), sound cues, and a regenerate-if list. The user does
   the actual rendering in Kling.
2. **Package:** delegate to the **seo-publisher** subagent. It returns the
   title (canon rules: plain text, no quotes, no trailing period, one emoji,
   ends with `#shorts #funnydog #chihuahua`), description, pinned comment,
   and schedule slot (next free 07:00/17:00 UTC).
3. **Gate:** run `channel/publishing-checklist.md`. Section A items that
   depend on the actual render become the user's post-render check — list
   them explicitly. Any promptable failure → fix before delivering.
4. **Deliver** one message: beat sheet, the three Kling prompts, metadata
   block, schedule slot, post-render checklist, and the reminder to tick
   **Altered content** in Studio. Update the backlog (🔵) and pre-fill the
   upload-log row.

If the user shares the rendered video back, review it against section A and
give a ship / regenerate verdict per shot.
