# Upload Log

One row per published Short. The agent updates 24h/7d views via
`vidiq_get_videos_by_ids` (batch the IDs) during `/weekly-review`.

Hook types: `mid-chaos` (disaster already happening at 0s), `imminent` (about
to happen), `aftermath` (reveal of the damage), `case-file` (Investigation framing).

> Views column = snapshot from `vidiq_channel_videos` on **2026-08-07**.
> Pillar/hook for videos produced outside this repo are unknown — backfill if
> the user can supply the concepts. Posting slots have drifted over time:
> 07:00/17:00 → 00:00/12:00 → currently ~11:00/23:00 UTC.

## Published (snapshot 2026-08-07)

| Video ID | Published (UTC) | Title (live) | Views | Likes | Notes |
|---|---|---|---|---|---|
| f5UzZLMxj1c | 2026-07-13 07:13 | Dog Turns Living Room Into An Aquarium And Acts Innocent 😂 #shorts #funnydog #chihuahua | n/a | n/a | absent from both API snapshots (likely list truncation — it's the oldest); eyeball it in Studio once |
| oQzKSn_ctJw | 2026-07-13 17:30 | Dog Fills Entire Kitchen With Popcorn And Feels No Shame 😂 — #shorts #funnydog #chihuahua | 124 | 4 | ✅ trailing `.` fixed; ⚠️ stray `—` before hashtags still there |
| CDZUoTjqMpA | 2026-07-14 07:00 | He Discovered Bubbles. The Bathroom Didn't Survive 😂 #shorts #funnydog #chihuahua | 113 | 2 | ✅ fixed; 5s runtime (below 12s floor) |
| 2GY67ZWaJuA | 2026-07-14 16:58 | Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂 #shorts #funnydog #chihuahua | 122 | 2 | ✅ fixed; sequel S1 queued |
| XFMBla9eC74 | 2026-07-15 07:00 | Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂 #shorts #funnydog #chihuahua | 68 | 2 | ✅ fixed |
| fGspQdHPCXE | 2026-07-16 23:53 | Dog Heard My Keys Mid Coverup 😂 #shorts #funnydog #chihuahua | **22,251** | 110 | 🏆 breakout #1 — caught-mid-coverup; plateaued |
| NSvNi_Qq8Zw | 2026-07-17 20:07 | He Was Putting The Feathers Back In 😂 #shorts #funnydog #chihuahua | 72 | 0 | |
| 0TE4b_z8EVQ | 2026-07-18 00:00 | He Sat In Front Of It Like We Wouldn't Notice 😂 #shorts #funnydog #chihuahua | 54 | 0 | |
| QLRTJIph5EM | 2026-07-18 12:00 | He Tried To Blend In 😂 #shorts #funnydog #chihuahua | 68 | 2 | |
| 569KTwkYUnk | 2026-07-19 00:00 | He Signed His Own Crime Scene 😂 #shorts #funnydog #chihuahua | 54 | 0 | double-posted slot |
| ik8pneEXi0I | 2026-07-19 00:00 | The Evidence Led Straight To Him 😂 #shorts #funnydog #chihuahua | 58 | 0 | double-posted slot |
| 1p3Ox0Aj7WE | 2026-07-19 12:00 | He Framed The Big One 😂 #shorts #funnydog #chihuahua | 43 | 0 | |
| 0fnBPvf_yVc | 2026-07-20 00:00 | He Hid It In The Most Obvious Place Possible 😂 #shorts #funnydog #chihuahua | 46 | 0 | |
| keu1mstiJjw | 2026-07-20 12:00 | He Framed Him While He Slept 😂 #shorts #funnydog #chihuahua | 61 | 1 | |
| KtbDln_g1Yo | 2026-07-21 12:00 | He Buried The Remote So Nobody Could Change The Channel 😂 | 78 | 0 | no hashtags; 00:00 slot skipped |
| _-IXlGDbrTA | 2026-07-22 00:00 | He Found The Paw Prints Too 😂 #shorts #funnydog #chihuahua | 72 | 0 | |
| k8MwiYn5O5A | 2026-07-22 12:00 | Every Missing Sock. One Suspect 😂 | 61 | 0 | ✅ prompt-fragment title fixed 08-04 |
| 1LtqTOFlKXA | 2026-07-23 00:00 | Stole Every Pillow. Built A Kingdom 😂 | 1,777 | 10 | ✅ prompt-fragment title fixed 08-04; mini-breakout |
| FkJExMouVus | 2026-07-23 12:00 | He Was Inside The Bag When I Got Home 😂 #shorts #funnydog #chihuahua | 71 | 2 | |
| GaTYv3w36-U | 2026-07-24 00:00 | He Redecorated Before The Party Started 🎈😂 #shorts #funnydog #chihuahua | 94 | 3 | ⚠️ two emojis |
| 75bzDYFYm8o | 2026-07-24 12:00 | He Fought The Bin And Lost 😂 | 51 | 2 | no hashtags |
| _Cjn29WORC0 | 2026-07-25 00:00 | One Letter Survived 😂 | 64 | 0 | no hashtags |
| WWqucmDSRM4 | 2026-07-25 12:00 | Caught Mid Climb. Chose Stillness 😂 | **33,612** | 152 | 🏆 breakout #2 (biggest) — caught mid-act; plateaued |
| TBCu_h7bXmw | 2026-07-26 00:00 | Bandit Tried To Become A Stuffed Animal 😂 | 77 | 0 | disguise premise |
| yEV1BZKXZBo | 2026-07-26 12:00 | The Laundry Fought Bandit Back 😂 | 46 | 0 | |
| an7ynsDQCoY | 2026-07-27 00:00 | Minty Fresh And Zero Regrets 😂 | 72 | 4 | |
| AXZtxVTFGcg | 2026-07-27 12:00 | Bandit Found The Ice Button 🧊😂 | 58 | 0 | ⚠️ two emojis |
| XwqdDedmEdI | 2026-07-28 00:00 | Bandit Decided It's December 😂 | 61 | 1 | impossible-environment |
| KKB3EvpjbFE | 2026-07-28 12:00 | Bandit Dug Up His Entire Savings 😂 | 58 | 1 | |
| g4bl4Os3pKE | 2026-07-29 00:00 | 3 Weeks Of Progress. 3 Seconds | 66 | 1 | ⚠️ no emoji |
| v79E31o1VOM | 2026-07-29 12:00 | Bandit Identifies As Fruit 😂 #shorts #funnydog #chihuahua | 56 | 1 | disguise premise |
| u-MkIa7SuO0 | 2026-07-30 00:00 | The Paper Trail Led Upstairs 😂 | **19,133** | 84 | 🏆 breakout #3 — evidence trail; plateaued |
| OitNgxVft_s | 2026-07-30 12:00 | Bandit Hid In The Clean Washing 😂 | 197 | 4 | disguise premise; above median |
| 8xZXg7_w2EE | 2026-07-31 00:00 | Bandit Identifies As Footwear 😂 | 79 | 2 | disguise premise |
| gAL5fW39j5c | 2026-07-31 12:00 | Bandit's Biggest Heist Yet 😂 #shorts #funnydog #chihuahua | **32,377** | 143 | 🏆 breakout #4 — heist; plateaued |
| wnZA63hKzWE | 2026-08-01 00:00 | The TV Grew Ears 😂 | 25 | 1 | |
| YhW3cOx8hfM | 2026-08-01 12:00 | Gary Snitched 😂 | 52 | 4 | first Gary episode |
| tL3lmFaFMpY | 2026-08-02 00:00 | The Burrito Did It 😂 | 28 | 1 | |
| pTCy8rrH3C4 | 2026-08-02 12:00 | Bandit Blindfolded Gary First 😂 | 29 | 1 | Gary |
| JIEuT_zCnaY | 2026-08-03 00:00 | He Turned Gary Around First 😂 | 20 | 1 | Gary |
| 7Iba3oZdtYs | 2026-08-03 12:00 | He Joined The Family Photos | 17 | 2 | ⚠️ no emoji; disguise premise |
| qXti5qVGdfc | 2026-08-04 00:00 | He Became Knitwear 😂 | **18,332** | 122 | 🏆 breakout #5 — disguise premise; 255 VPH on 08-07, STILL CLIMBING |
| Ig7RGj4xcc0 | 2026-08-04 12:00 | Perfect Disguise. Traitor Tail 😂 | 40 | 1 | disguise premise; 15s |
| HoH7dMBzR_g | 2026-08-04 23:00 | Bandit Tries To Lick Away The Evidence 😂🍓 | 40 | 2 | ⚠️ two emojis |
| Ooc-zpsoydc | 2026-08-05 11:00 | Bandit Tries To Fix A Spill With The Entire Toilet Roll 😂 | 15 | 1 | |
| 0tgXJ8NWjII | 2026-08-05 23:00 | Bandit Hides The Keys So He Can't Get Caught 😂🔑 | 11 | 1 | ⚠️ two emojis |
| GFnJ5SKgE0E | 2026-08-06 11:00 | Bandit Frames The Teddy Bear 😂🧸 | 8 | 1 | ⚠️ two emojis; = backlog concept I3 |
| ypM7aN9qQ8k | 2026-08-06 23:00 | One Of These Gnomes Is Breathing😂 | 4 | 0 | disguise premise; ⚠️ missing space before emoji |

## Breakout board (2026-08-07)

| # | Video | Views | Premise family | Status |
|---|---|---|---|---|
| 1 | Caught Mid Climb. Chose Stillness | 33,612 | caught mid-act | plateaued |
| 2 | Bandit's Biggest Heist Yet | 32,377 | heist / caught | plateaued |
| 3 | Dog Heard My Keys Mid Coverup | 22,251 | caught mid-coverup | plateaued |
| 4 | The Paper Trail Led Upstairs | 19,133 | evidence trail | plateaued |
| 5 | **He Became Knitwear** | **18,332** | **disguise / hiding in plain sight** | **🔥 active — 255 VPH** |

Premise-family readout: winners cluster in **caught-in-the-act** (4) and now
**disguise/hiding-in-plain-sight** (1 breakout + a fat tail: Clean Washing 197,
Footwear 79, Stuffed Animal 77). Impossible environments: still no breakout.

## Title fixes in YouTube Studio

✅ **Verified live 2026-08-07**: both prompt-fragment titles replaced
(`Stole Every Pillow. Built A Kingdom`, `Every Missing Sock. One Suspect`) and
launch-set trailing periods removed.

Remaining nits (batch them next time you're in Studio, none urgent):
- `oQzKSn_ctJw` — stray `—` before the hashtags survived the fix.
- Two-emoji titles: `GaTYv3w36-U`, `AXZtxVTFGcg`, `HoH7dMBzR_g`, `0tgXJ8NWjII`,
  `GFnJ5SKgE0E` (⚠️ pattern is growing in new uploads).
- No-emoji titles: `g4bl4Os3pKE`, `7Iba3oZdtYs`.
- `ypM7aN9qQ8k` — missing space before 😂.
- Hashtag-suffix decision still pending (see CLAUDE.md); knitwear breakout had
  no hashtags — more evidence they're not what drives outliers.

Also while in Studio for each: confirm the **Altered content** disclosure is
ticked, and add the description template from `brand-bible.md`.
