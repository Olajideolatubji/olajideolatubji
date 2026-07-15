# Upload Log

One row per published Short. The agent updates 24h/7d views via
`vidiq_get_videos_by_ids` (batch the IDs) during `/weekly-review`.

Hook types: `mid-chaos` (disaster already happening at 0s), `imminent` (about
to happen), `aftermath` (reveal of the damage), `case-file` (Investigation framing).

## Published

| Video ID | Published (UTC) | Pillar | Hook | Len | Title (live) | 24h views | 7d views | Notes |
|---|---|---|---|---|---|---|---|---|
| f5UzZLMxj1c | 2026-07-13 07:13 | Renovation | ? | 16s | Dog Turns Living Room Into An Aquarium And Acts Innocent 😂 #shorts #funnydog #chihuahua. | — | 10* | ⚠️ trailing `.` after hashtags |
| oQzKSn_ctJw | 2026-07-13 17:30 | Kitchen | ? | 16s | Dog Fills Entire Kitchen With Popcorn And Feels No Shame 😂 — #shorts #funnydog #chihuahua. | — | 15* | ⚠️ stray `—` and trailing `.` |
| CDZUoTjqMpA | 2026-07-14 07:00 | Renovation | ? | **5s** | He Discovered Bubbles. The Bathroom Didn't Survive 😂 #shorts #funnydog #chihuahua. | — | 4* | ⚠️ trailing `.`; 5s is below the 12s floor — too short to build the gag |
| 2GY67ZWaJuA | 2026-07-14 16:58 | Shopping | ? | 16s | Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂 #shorts #funnydog #chihuahua. | — | 3* | ⚠️ trailing `.`; best premise of the launch set — sequel queued (S1) |
| XFMBla9eC74 | 2026-07-15 07:00 | Kitchen | ? | 16s | Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂" #shorts #funnydog #chihuahua. | — | 0* | ⚠️ stray `"` after 😂 and trailing `.` |

\* view counts captured at setup on 2026-07-15, not true 7d numbers.

## Title corrections to apply in YouTube Studio

Same joke, broken punctuation removed, hashtags kept (move to description if preferred):

1. `Dog Turns Living Room Into An Aquarium And Acts Innocent 😂 #shorts #funnydog #chihuahua`
2. `Dog Fills Entire Kitchen With Popcorn And Feels No Shame 😂 #shorts #funnydog #chihuahua`
3. `He Discovered Bubbles. The Bathroom Didn't Survive 😂 #shorts #funnydog #chihuahua`
4. `Dog Orders 10,000 Ball Pit Balls While Owner Was Out 😂 #shorts #funnydog #chihuahua`
5. `Dog Attempts Italian Cooking. Kitchen Files For Divorce 😂 #shorts #funnydog #chihuahua`

Also while in Studio for each: confirm the **Altered content** disclosure is
ticked, and add the description template from `brand-bible.md`.
