# Guilty Paws — Brand Bible

The single source of truth for what a Guilty Paws video *is*. Every concept,
prompt, title, and reply must be consistent with this document. When we
deliberately evolve the brand, update this file in the same session.

## The premise (one sentence)

**A small dog commits spectacular household crimes and feels absolutely no
shame.** The comedy is the gap between the scale of the disaster and the dog's
total innocence.

## The star

- **Species/breed:** Chihuahua (established across all 5 launch videos — keep it.
  One recurring star beats random dogs; recurring characters are how Shorts
  channels convert casual viewers into subscribers).
- **Personality:** Chaotic mastermind energy in the act; wide-eyed "who, me?"
  innocence when caught. Never sad, never scared, never in real danger.
- **Name:** ⚠️ UNDECIDED — needs a user decision. A named character enables
  series titles ("Peanut's Crimes, Ep. 12"), pinned-comment lore, and fan
  attachment. Candidates that fit the brand: **Peanut, Bandit, Nacho, Biscuit,
  Diablo**. Once chosen, the name goes into titles, descriptions, pinned
  comments, and the channel description below.

## Format spec

| Element | Spec |
|---|---|
| Length | **12–25 seconds.** Long enough to build the gag, short enough to loop. Avoid ≤5s (the 2026-07-14 bubbles video was 5s — too short to register the story or count strong watch-time). |
| Aspect | 9:16 vertical, 1080×1920 |
| Structure | **Beat 1 (0–1s):** chaos already visible or clearly imminent — never a slow establishing shot. **Beat 2:** escalation (the disaster gets absurdly worse). **Beat 3:** the guilty/innocent look, held ~1.5s. **Loop:** final frame should flow back into the first frame so rewatches feel seamless. |
| Audio | Comedic sound design (crashes, squeaks, timpani) or trending-safe upbeat track. Optional deadpan narrator line (see "Voice" below). No copyrighted music. |
| Text on screen | 0–1 short caption max, top-third of frame (bottom is covered by UI). Never subtitle the whole video. |
| Visual quality bar | Consistent chihuahua appearance across the whole video (same coat color, size, collar). No warped anatomy, no melted objects in hero frames. If the AI generation has visible artifacts in the first 2 seconds or the final guilty-look shot, regenerate — those are the two frames everyone sees. |

## Voice & tone

- **Narrator (optional but recommended):** deadpan, mock-serious documentary or
  news-report tone. One or two lines max ("Day 3. The kitchen has stopped
  negotiating."). This adds originality on top of raw AI footage — which
  matters for YouTube monetization review (see growth playbook, compliance).
- **Written voice (titles, descriptions, replies):** dry, understated, treats
  the dog like a legally liable adult. We describe crimes, incidents, and
  insurance claims. We never write "cute puppy 🥺" energy — the humor is
  deadpan, not saccharine.

## Title grammar

The launch videos established a strong pattern. Codified and cleaned up:

```
[Dog/NAME] [absurd act in active voice]. [Deadpan consequence] 😂
```

Examples in-grammar:
- `Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂`
- `Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂`
- `He Discovered Bubbles. The Bathroom Didn't Survive 😂`

**Rules:**
1. Two sentences max: setup, punchline. The punchline personifies the victim
   (the kitchen, the bathroom, the vacuum) or states a legal/administrative
   consequence (files for divorce, presses charges, demands compensation).
2. Exactly one 😂 at the end. No other emoji in titles.
3. **No trailing period after hashtags, and no stray quotes** — three of the
   five launch titles end in `.` after the hashtags and one contains a stray
   `"`. This looks broken in search results. Corrected titles are logged in
   `channel/logs/upload-log.md`.
4. Hashtags: at most 2–3, and prefer putting them in the **description**, not
   the title. If kept in the title: `#shorts #funnydog #chihuahua` and nothing
   else. Once the dog is named, add a branded hashtag (e.g. `#peanutthechi`).
5. Target ≤ 70 characters before hashtags so nothing truncates on mobile.
6. Always score candidate titles with `vidiq_score_title` and keep the winner.

## Description template

```
{One deadpan sentence extending the joke — new information, not a title repeat.}

New crimes daily. Subscribe to follow the investigation. 🐾

#shorts #funnydog #chihuahua
{This video contains AI-generated content.}
```

## Channel description (DRAFT — paste into YouTube Studio; currently empty)

> Daily reports on one small dog's very large crimes. 🐾
> AI-generated comedy shorts about a chihuahua who destroys everything and
> regrets nothing. New crimes posted daily at 7:00 & 17:00 UTC.
> Subscribe to follow the investigation.

Also in Studio: set the channel **country**, add channel keywords
(`funny dog, chihuahua, dog shorts, ai animation, pet comedy`), and create a
"All Crimes" playlist once there are 10+ videos.

## Do / Don't

**Do**
- Keep one consistent chihuahua "actor" across every video.
- Escalate absurdity: the disaster should be *bigger than physically possible*.
- Household settings (kitchen, bathroom, living room, garden) — relatable rooms
  make the destruction funnier.
- End on the guilty face. It is the brand. It is in the name.
- Vary the crime category between consecutive uploads (see content pillars).

**Don't**
- No real harm, injury, or distress — dog is always delighted, victims are
  always objects/rooms.
- No shock/gross-out content, no other pets being victimized.
- No engagement-bait text ("wait for it", "99% will miss this").
- No claiming footage is real; no hiding that it's AI.
- Never post a video where the dog looks *different* from the last video
  without a story reason.
