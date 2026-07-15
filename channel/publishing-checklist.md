# Guilty Paws — Pre-Publish Quality Gate

**Every item must pass before a Short is recommended for upload. One failure =
fix or kill.** The agent runs this checklist explicitly (as a literal checklist
in its reply) at the end of `/produce-short` and `/optimize-upload`.

## A. Video

- [ ] 12–25 seconds, 9:16, 1080×1920, no watermark.
- [ ] **First 1 second:** chaos visible or unmistakably imminent. No logos, no
      fade-ins, no establishing shots.
- [ ] Three-beat structure present: act → escalation → guilty look (~1.5s hold).
- [ ] Last frame loops plausibly into the first frame.
- [ ] Chihuahua is on-model: same breed, coat color, size, collar as the
      established star. No anatomy warping in the first 2s or the final shot.
- [ ] No AI artifacts that read as "broken" at phone size (melted objects,
      extra limbs, garbled text in scene).
- [ ] Dog reads as delighted/mischievous — zero frames of apparent distress.
- [ ] Audio: levels normalized (target ≈ -14 LUFS), no clipping, no copyrighted
      music; sound effects land on the visual beats.
- [ ] On-screen text (if any): ≤1 caption, top-third, ≥1.5s on screen, no typos.
- [ ] Watched start-to-finish twice at phone scale before approving.

## B. Metadata

- [ ] Title follows the grammar in `brand-bible.md`: setup-sentence +
      punchline-sentence + single 😂. ≤70 chars before any hashtags.
- [ ] **No trailing period, no stray quotes** (the launch-week bug class).
- [ ] Title scored with `vidiq_score_title`; best of ≥3 candidates chosen.
- [ ] Description follows the template: one new joke line, CTA, ≤3 hashtags,
      AI-content line included.
- [ ] Tags/keywords chosen from current keyword research, not guessed.
- [ ] Pinned comment drafted (in-universe lore or a question).

## C. Compliance

- [ ] "Altered content" (AI) disclosure flagged for the uploader — stated
      explicitly in the delivery message.
- [ ] Nothing implies the footage is real.
- [ ] Music/SFX are generated or license-free, with source noted in the upload log.
- [ ] Made-for-kids setting: **No** (general audience comedy) — but content
      contains nothing age-restrictable.

## D. Strategy

- [ ] Pillar differs from the previous upload's pillar.
- [ ] Scheduled into the 07:00 or 17:00 UTC slot (state which).
- [ ] If this is an experiment video: the single variable being tested is named
      and logged.
- [ ] Upload-log row prepared in `channel/logs/upload-log.md`.

## Delivery format

When a Short passes, deliver to the user: file/URL, final title, description,
tags, pinned comment, schedule slot, the ticked checklist, and the one-line
reminder: *"Tick 'Altered content' in Studio when uploading."*
