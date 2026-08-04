# Upload Log

One row per published Short. The agent updates 24h/7d views via
`vidiq_get_videos_by_ids` (batch the IDs) during `/weekly-review`.

Hook types: `mid-chaos` (disaster already happening at 0s), `imminent` (about
to happen), `aftermath` (reveal of the damage), `case-file` (Investigation framing).

> **2026-08-04 full resync** — the log had stalled at 5 rows while the channel
> kept publishing 2/day. All 42 live Shorts are now listed; view counts are a
> single snapshot from `vidiq_channel_videos` on 2026-08-04. Pillar/hook for
> videos produced outside this repo are unknown (`—`) — backfill if the user
> can supply the concepts.

## Published (snapshot 2026-08-04)

| Video ID | Published (UTC) | Title (live) | Views | Likes | Notes |
|---|---|---|---|---|---|
| oQzKSn_ctJw | 2026-07-13 17:30 | Dog Fills Entire Kitchen With Popcorn And Feels No Shame 😂 — #shorts #funnydog #chihuahua. | 119 | 4 | ⚠️ stray `—` and trailing `.` — correction below |
| CDZUoTjqMpA | 2026-07-14 07:00 | He Discovered Bubbles. The Bathroom Didn't Survive 😂 #shorts #funnydog #chihuahua. | 110 | 2 | ⚠️ trailing `.`; 5s runtime, below 12s floor |
| 2GY67ZWaJuA | 2026-07-14 16:58 | Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂 #shorts #funnydog #chihuahua. | 107 | 2 | ⚠️ trailing `.`; sequel S1 queued |
| XFMBla9eC74 | 2026-07-15 07:00 | Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂 #shorts #funnydog #chihuahua. | 66 | 2 | ⚠️ trailing `.` (stray `"` appears fixed) |
| f5UzZLMxj1c | 2026-07-13 07:13 | Dog Turns Living Room Into An Aquarium And Acts Innocent 😂 #shorts #funnydog #chihuahua. | n/a | n/a | ⚠️ trailing `.`; not returned in 2026-08-04 snapshot — verify still live |
| fGspQdHPCXE | 2026-07-16 23:53 | Dog Heard My Keys Mid Coverup 😂 #shorts #funnydog #chihuahua | **22,251** | 110 | 🏆 BREAKOUT — caught-mid-coverup premise |
| NSvNi_Qq8Zw | 2026-07-17 20:07 | He Was Putting The Feathers Back In 😂 #shorts #funnydog #chihuahua | 66 | 0 | |
| 0TE4b_z8EVQ | 2026-07-18 00:00 | He Sat In Front Of It Like We Wouldn't Notice 😂 #shorts #funnydog #chihuahua | 53 | 0 | |
| QLRTJIph5EM | 2026-07-18 12:00 | He Tried To Blend In 😂 #shorts #funnydog #chihuahua | 64 | 2 | |
| 569KTwkYUnk | 2026-07-19 00:00 | He Signed His Own Crime Scene 😂 #shorts #funnydog #chihuahua | 52 | 0 | double-posted same slot as below |
| ik8pneEXi0I | 2026-07-19 00:00 | The Evidence Led Straight To Him 😂 #shorts #funnydog #chihuahua | 58 | 0 | double-posted same slot as above |
| 1p3Ox0Aj7WE | 2026-07-19 12:00 | He Framed The Big One 😂 #shorts #funnydog #chihuahua | 42 | 0 | |
| 0fnBPvf_yVc | 2026-07-20 00:00 | He Hid It In The Most Obvious Place Possible 😂 #shorts #funnydog #chihuahua | 45 | 0 | |
| keu1mstiJjw | 2026-07-20 12:00 | He Framed Him While He Slept 😂 #shorts #funnydog #chihuahua | 60 | 1 | |
| KtbDln_g1Yo | 2026-07-21 12:00 | He Buried The Remote So Nobody Could Change The Channel 😂 | 74 | 0 | ⚠️ hashtag suffix missing; 00:00 slot skipped this day |
| _-IXlGDbrTA | 2026-07-22 00:00 | He Found The Paw Prints Too 😂 #shorts #funnydog #chihuahua | 69 | 0 | |
| k8MwiYn5O5A | 2026-07-22 12:00 | sock pile stays identical across cuts, the owner's single lonely sock reads clearly. | 56 | 0 | 🚨 title is a Kling prompt fragment — fix urgently |
| 1LtqTOFlKXA | 2026-07-23 00:00 | fort construction stays consistent across cuts, stripped sofa visible in background throughout. | 1,771 | 10 | 🚨 title is a Kling prompt fragment AND it's mid-breakout — fix urgently |
| FkJExMouVus | 2026-07-23 12:00 | He Was Inside The Bag When I Got Home 😂 #shorts #funnydog #chihuahua | 69 | 2 | |
| GaTYv3w36-U | 2026-07-24 00:00 | He Redecorated Before The Party Started 🎈😂 #shorts #funnydog #chihuahua | 85 | 2 | ⚠️ two emojis (rule: exactly one) |
| 75bzDYFYm8o | 2026-07-24 12:00 | He Fought The Bin And Lost 😂 | 48 | 1 | ⚠️ hashtag suffix missing |
| _Cjn29WORC0 | 2026-07-25 00:00 | One Letter Survived 😂 | 61 | 0 | ⚠️ hashtag suffix missing |
| WWqucmDSRM4 | 2026-07-25 12:00 | Caught Mid Climb. Chose Stillness 😂 | **33,489** | 152 | 🏆 BIGGEST — caught-mid-act freeze premise; 4 comments; ⚠️ no hashtags |
| TBCu_h7bXmw | 2026-07-26 00:00 | Bandit Tried To Become A Stuffed Animal 😂 | 70 | 0 | first "Bandit" name usage; ⚠️ no hashtags |
| yEV1BZKXZBo | 2026-07-26 12:00 | The Laundry Fought Bandit Back 😂 | 42 | 0 | ⚠️ no hashtags |
| an7ynsDQCoY | 2026-07-27 00:00 | Minty Fresh And Zero Regrets 😂 | 63 | 3 | ⚠️ no hashtags |
| AXZtxVTFGcg | 2026-07-27 12:00 | Bandit Found The Ice Button 🧊😂 | 49 | 0 | ⚠️ two emojis, no hashtags |
| XwqdDedmEdI | 2026-07-28 00:00 | Bandit Decided It's December 😂 | 56 | 1 | impossible-environment (indoor winter); ⚠️ no hashtags |
| KKB3EvpjbFE | 2026-07-28 12:00 | Bandit Dug Up His Entire Savings 😂 | 50 | 1 | ⚠️ no hashtags |
| g4bl4Os3pKE | 2026-07-29 00:00 | 3 Weeks Of Progress. 3 Seconds | 55 | 1 | ⚠️ no emoji, no hashtags |
| v79E31o1VOM | 2026-07-29 12:00 | Bandit Identifies As Fruit 😂 #shorts #funnydog #chihuahua | 45 | 1 | |
| u-MkIa7SuO0 | 2026-07-30 00:00 | The Paper Trail Led Upstairs 😂 | **19,085** | 84 | 🏆 BREAKOUT — evidence-trail/aftermath premise; ⚠️ no hashtags |
| OitNgxVft_s | 2026-07-30 12:00 | Bandit Hid In The Clean Washing 😂 | 180 | 4 | ⚠️ no hashtags |
| 8xZXg7_w2EE | 2026-07-31 00:00 | Bandit Identifies As Footwear 😂 | 62 | 2 | ⚠️ no hashtags |
| gAL5fW39j5c | 2026-07-31 12:00 | Bandit's Biggest Heist Yet 😂 #shorts #funnydog #chihuahua | **32,345** | 142 | 🏆 BREAKOUT — heist premise, 376 VPH at snapshot, still climbing |
| wnZA63hKzWE | 2026-08-01 00:00 | The TV Grew Ears 😂 | 10 | 1 | ⚠️ no hashtags |
| YhW3cOx8hfM | 2026-08-01 12:00 | Gary Snitched 😂 | 33 | 3 | first "Gary" (second character?); ⚠️ no hashtags |
| tL3lmFaFMpY | 2026-08-02 00:00 | The Burrito Did It 😂 | 10 | 1 | ⚠️ no hashtags |
| pTCy8rrH3C4 | 2026-08-02 12:00 | Bandit Blindfolded Gary First 😂 | 5 | 0 | ⚠️ no hashtags |
| JIEuT_zCnaY | 2026-08-03 00:00 | He Turned Gary Around First 😂 | 4 | 0 | ⚠️ no hashtags |
| 7Iba3oZdtYs | 2026-08-03 12:00 | He Joined The Family Photos | 3 | 0 | ⚠️ no emoji, no hashtags |
| qXti5qVGdfc | 2026-08-04 00:00 | He Became Knitwear 😂 | 3 | 0 | ⚠️ no hashtags |

## Title fixes to apply in YouTube Studio (priority order)

1. 🚨 `1LtqTOFlKXA` (1,771 views and climbing) — replace prompt-fragment title
   with e.g.: `Bandit Built A Fort From The Couch's Insides 😂 #shorts #funnydog #chihuahua`
2. 🚨 `k8MwiYn5O5A` — replace prompt-fragment title with e.g.:
   `Every Sock In The House Reports To Bandit Now 😂 #shorts #funnydog #chihuahua`
3. Launch-set trailing `.` fixes (still unapplied as of 2026-08-04):
   - `Dog Turns Living Room Into An Aquarium And Acts Innocent 😂 #shorts #funnydog #chihuahua`
   - `Dog Fills Entire Kitchen With Popcorn And Feels No Shame 😂 #shorts #funnydog #chihuahua`
   - `He Discovered Bubbles. The Bathroom Didn't Survive 😂 #shorts #funnydog #chihuahua`
   - `Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂 #shorts #funnydog #chihuahua`
   - `Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂 #shorts #funnydog #chihuahua`
4. Two-emoji titles (`GaTYv3w36-U`, `AXZtxVTFGcg`) and missing-emoji titles
   (`g4bl4Os3pKE`, `7Iba3oZdtYs`) — bring in line with the one-emoji rule.

Note on the missing `#shorts #funnydog #chihuahua` suffix: it disappeared from
most titles after 2026-07-25. Evidence is mixed — one breakout has the suffix
(`gAL5fW39j5c`), two don't (`WWqucmDSRM4`, `u-MkIa7SuO0`) — so hashtags are not
what's driving the outliers. Decision needed: either restore the suffix as the
title rule says, or amend the rule and move hashtags to the description.

Also while in Studio for each: confirm the **Altered content** disclosure is
ticked, and add the description template from `brand-bible.md`.
