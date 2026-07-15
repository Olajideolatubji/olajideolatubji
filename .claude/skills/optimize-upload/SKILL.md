---
name: optimize-upload
description: Build and score the complete metadata package (title, description, tags, pinned comment, schedule) for a finished Guilty Paws Short, or audit/fix the metadata of an already-published video. Use when a video exists but its packaging doesn't.
---

Argument: a video file/URL, a YouTube video ID, or "audit" to review all
published videos' metadata.

**For a new video:** delegate to the **seo-publisher** subagent. Deliverable is
its copy-pasteable package plus the ticked B/C/D checklist from
`channel/publishing-checklist.md`.

**For `audit`:** pull current titles/descriptions via `vidiq_channel_videos`
(one 5-credit call), check every live video against the brand-bible title
grammar and description template, and produce a Studio fix-list: exact current
title → exact corrected title, missing description elements, missing AI
disclosure. Update `channel/logs/upload-log.md` with any corrections. (The
five launch videos' known punctuation bugs and corrected titles are already
logged there — verify whether they've been fixed and clear the ⚠️ flags that have.)

Always finish with the "Altered content" disclosure reminder.
