"""Build src/timeline.json by anchoring every visual beat to word timestamps.

Reads scripts/words.json (faster-whisper word-level output) and locates anchor
phrases with a fuzzy in-order match, so every scene cut, stat card, ledger
open, counter slam, and the Enron crash chart land exactly on the words they
belong to.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")

with open(os.path.join(ROOT, "scripts", "words.json")) as f:
    data = json.load(f)

WORDS = data["words"]
VOICE_END = max(w["e"] for w in WORDS)

NUM_MAP = {
    "2017": "twenty seventeen", "2015": "twenty fifteen", "2018": "twenty eighteen",
    "2020": "twenty twenty", "2001": "two thousand one", "2000": "two thousand",
    "2014": "twenty fourteen",
}


def norm(w: str) -> str:
    w = w.lower().strip()
    w = re.sub(r"[^a-z0-9']", "", w)
    return w


TOKENS = [norm(w["w"]) for w in WORDS]


def find(phrase: str, after: float = 0.0, min_ratio: float = 0.7):
    """Locate phrase; returns (startSec of first matched word, endSec of last)."""
    want = [norm(t) for t in phrase.split() if norm(t)]
    n = len(want)
    best = None
    for i, tok in enumerate(TOKENS):
        if WORDS[i]["s"] < after - 0.05:
            continue
        if tok != want[0]:
            continue
        # greedy in-order match within window
        j = i
        matched = []
        for target in want:
            k = j
            found = -1
            while k < min(len(TOKENS), i + n * 2 + 4):
                if TOKENS[k] == target:
                    found = k
                    break
                k += 1
            if found >= 0:
                matched.append(found)
                j = found + 1
        ratio = len(matched) / n
        if ratio >= min_ratio:
            return WORDS[matched[0]]["s"], WORDS[matched[-1]]["e"]
    return None


def at(phrase: str, after: float = 0.0) -> float:
    r = find(phrase, after)
    if r is None:
        print(f"ANCHOR MISS: {phrase!r} after {after}", file=sys.stderr)
        sys.exit(1)
    return r[0]


def end_of(phrase: str, after: float = 0.0) -> float:
    r = find(phrase, after)
    if r is None:
        print(f"ANCHOR MISS: {phrase!r} after {after}", file=sys.stderr)
        sys.exit(1)
    return r[1]


LEAD = 0.12  # cut slightly before the word starts so visuals feel on-beat
RITUAL = 2.8  # ledger-open ritual length


def cut(t: float) -> float:
    return round(max(0.0, t - LEAD), 2)


# ---------------------------------------------------------------- anchors
t_fbi_pay = at("The FBI will pay you $5 million")
t_stat_5m = at("$5 million if you can find her")
t_five_companies = at("Five companies Five leaders")
t_title = at("This is the Red Ledger")

t_ch1 = at("Let's start with a question")
t_try_nine = at("Try nine days")
t_sam = at("Sam Bankman Fried was the good billionaire")
t_hiding = at("Here's what trust me was hiding")
t_stat_8b = at("$8 billion of other people's money")
t_nine_days_beat = at("Now the nine days")
t_day1 = at("Day one a leaked balance sheet")
t_day2 = at("Day two a rival CEO")
t_day3 = at("Day three customers panic")
t_day6 = at("Day six withdrawals freeze")
t_day9 = at("Day nine FTX files for bankruptcy")
t_fortune = at("Sam's personal fortune went with it")
t_quote = at("such a complete failure of corporate controls")
t_convicted = at("He was convicted on seven counts")
t_entry_one = at("Entry one logged")

t_ch2 = at("Every magic trick has three parts")
t_pledge = at("The pledge a machine called the Edison")
t_stat_700m = at("$700 million Walgreens installed", after=t_ch2)
t_holmes_part = at("And Holmes played the part completely")
t_question = at("does the box actually work")
t_not_work = at("It did not work And here's the prestige")
t_voided = at("had to be voided entirely")
t_2015 = at("In 2015 a Wall Street Journal reporter")
t_eleven = at("She got 11 years")
t_two_entries = at("Two entries 41 billion")

t_ch3 = at("This one has a detail the others don't")
t_miracle = at("Wirecard was Germany's tech miracle")
t_five_years = at("For five years reporters at the Financial Times")
t_state = at("Trust me enforced by the state")
t_june2020 = at("Then in June 2020 the auditors")
t_reply = at("we have never heard of this money")
t_stat_19 = at("1 .9 billion euros It didn't exist")
t_collapsed = at("Wirecard collapsed in a week")
t_route = at("traced his escape route east")
t_even_wirecard = at("But even Wirecard was lying about one number")

t_ch4 = at("Enron was the seventh largest company")
t_machine1 = at("Machine 1 Mark to market accounting")
t_machine2 = at("Machine 2 The maze")
t_culture = at("And the culture matched the accounting")
t_then2001 = at("Then in 2001 one executive resigned")
t_ninety = at("$90 became 80")
t_80 = end_of("$90 became 80")
t_40 = end_of("Then 40", after=t_ninety)
t_10 = end_of("Then 10", after=t_40 - 0.5)
t_026 = end_of("Then 26 cents", after=t_10 - 0.3)
t_stat_20k = at("20 ,000 people lost their jobs")
t_violent = at("The collapse was so violent")
t_now_every = at("Now every company in this ledger so far")
t_hers = at("and it's hers", after=t_now_every)

t_ch5 = at("Her name is Dr", after=t_now_every)
t_wembley = at("She filled Wembley Arena")
t_separates = at("Now the part that separates one coin")
t_typed = at("an employee typed a bigger number")
t_sell_coin = at("And here's how you sell a coin")
t_stat_4b = at("Four billion dollars Four rows in a spreadsheet", after=t_sell_coin)
t_oct2017 = at("By October 2017 US charges")
t_stopped = at("stopped existing")
t_no_sightings = at("No sightings No arrest No body")
t_claimed = at("There have been claimed sightings")
t_honest = at("The honest answer is nobody knows")

t_five_ceos = at("Five CEOs 172 billion dollars that never existed")
t_trust_final = at("the same two words doing all the work")
t_trust_words = at("trust me", after=t_trust_final)
t_question_close = at("So here's the question to take with you")
t_next_entry = at("Next entry the man who sold the same skyscraper")

DURATION = round(VOICE_END + 6.0, 2)  # logo tail

# ---------------------------------------------------------------- stats
STAT_HOLD = 3.2
stats = [
    {"at": cut(t_stat_5m), "hold": 3.0, "number": "$5,000,000", "caption": "FBI reward — still unclaimed"},
    {"at": cut(t_stat_8b), "hold": 3.4, "number": "$8,000,000,000", "caption": "of other people's money"},
    {"at": cut(t_stat_19), "hold": 3.4, "number": "€1,900,000,000", "caption": "it never existed"},
    {"at": cut(t_stat_20k), "hold": 3.0, "number": "20,000", "caption": "jobs gone overnight"},
    {"at": cut(t_stat_4b), "hold": 3.2, "number": "$4,000,000,000", "caption": "for rows in a spreadsheet"},
]

# ---------------------------------------------------------------- ledgers
ledgers = [
    {"at": cut(t_ch1), "entry": 1, "title": "FTX", "amount": "$32,000,000,000", "sub": "nine days to zero"},
    {"at": cut(t_ch2), "entry": 2, "title": "THERANOS", "amount": "$9,000,000,000", "sub": "the magic box"},
    {"at": cut(t_ch3), "entry": 3, "title": "WIRECARD", "amount": "€24,000,000,000", "sub": "the phantom billions"},
    {"at": cut(t_ch4), "entry": 4, "title": "ENRON", "amount": "$90 → $0.26", "sub": "the lie factory"},
    {"at": cut(t_ch5), "entry": 5, "title": "ONECOIN", "amount": "$4,000,000,000+", "sub": "the coin that never was"},
]

# ---------------------------------------------------------------- slams
slams = [
    {"at": cut(t_entry_one), "prevTotal": "$0B", "total": "$32B", "retease": "she's still missing"},
    {"at": cut(t_two_entries), "prevTotal": "$32B", "total": "$41B", "retease": "she's still missing"},
    {"at": cut(t_even_wirecard), "prevTotal": "$41B", "total": "$67B", "retease": "he's still missing too"},
    {"at": cut(t_now_every), "prevTotal": "$67B", "total": "$168B", "retease": "she's still missing"},
    {"at": cut(t_five_ceos), "prevTotal": "$168B", "total": "$172B", "retease": "she was never found"},
]

# ---------------------------------------------------------------- scenes
scenes = []


def scene(id_, type_, start, end, **props):
    if end - start < 0.4:
        print(f"WARN tiny scene {id_}: {start}..{end}", file=sys.stderr)
    scenes.append({
        "id": id_,
        "type": type_,
        "start": round(start, 2),
        "end": round(end, 2),
        "props": props or {},
    })


s5m_end = cut(t_stat_5m) + 3.0
s8b_end = cut(t_stat_8b) + 3.4
s19_end = cut(t_stat_19) + 3.4
s20k_end = cut(t_stat_20k) + 3.0
s4b_end = cut(t_stat_4b) + 3.2

# Cold open
scene("cold-flight", "night-flight", 0, cut(t_fbi_pay))
scene("cold-fbi", "missing-file", cut(t_fbi_pay), cut(t_five_companies))
scene("cold-ledger", "ledger-intro", cut(t_five_companies), cut(t_ch1), titleAtSec=cut(t_title))

# FTX
ch1_body = cut(t_ch1) + RITUAL
scene("ftx-9q", "nine-days-question", ch1_body, cut(t_sam), nineAtSec=cut(t_try_nine))
scene("ftx-good", "good-billionaire", cut(t_sam), cut(t_hiding))
scene("ftx-door", "back-door", cut(t_hiding), cut(t_stat_8b))
scene("ftx-door2", "back-door", s8b_end, cut(t_day1))
scene(
    "ftx-9days", "nine-days-timeline", cut(t_day1), cut(t_fortune),
    dayTimes=[
        {"day": 1, "t": cut(t_day1), "label": "a leaked balance sheet"},
        {"day": 2, "t": cut(t_day2), "label": "a rival CEO is selling"},
        {"day": 3, "t": cut(t_day3), "label": "$6B out in 72 hours"},
        {"day": 6, "t": cut(t_day6), "label": "withdrawals freeze"},
        {"day": 9, "t": cut(t_day9), "label": "bankruptcy — worth nothing"},
    ],
)
scene("ftx-wipe", "wealth-wipe", cut(t_fortune), cut(t_convicted), quoteAtSec=cut(t_quote))
scene("ftx-verdict", "verdict", cut(t_convicted), cut(t_entry_one), years="25 YEARS", counts="seven counts of fraud", epithet="an ordinary thief with world-class PR")
scene("ftx-bridge", "bridge", cut(t_entry_one), cut(t_ch2), line="FTX had a product that actually worked.", emphasis="The next company's technology… was theatre.")

# Theranos
ch2_body = cut(t_ch2) + RITUAL
scene("ther-trick", "magic-trick", ch2_body, cut(t_pledge))
scene("ther-edison", "edison-box", cut(t_pledge), cut(t_stat_700m))
stat700_end = cut(t_stat_700m) + 3.0
stats.insert(2, {"at": cut(t_stat_700m), "hold": 3.0, "number": "$700,000,000", "caption": "handed over — no working product"})
scene("ther-turn", "the-turn", stat700_end, cut(t_holmes_part), questionAtSec=cut(t_question))
scene("ther-neck", "turtleneck", cut(t_holmes_part), cut(t_not_work))
scene("ther-swap", "box-swap", cut(t_not_work), cut(t_2015), voidAtSec=cut(t_voided))
scene("ther-thread", "thread-pull", cut(t_2015), cut(t_two_entries), yearsAtSec=cut(t_eleven))
scene("ther-bridge", "bridge", cut(t_two_entries), cut(t_ch3), line="Theranos only faked a machine.", emphasis="The next company faked the money itself.")

# Wirecard
ch3_body = cut(t_ch3) + RITUAL
scene("wc-flip", "journalists-flip", ch3_body, cut(t_miracle))
scene("wc-dax", "dax-miracle", cut(t_miracle), cut(t_five_years))
scene("wc-ft", "ft-stack", cut(t_five_years), cut(t_state))
scene("wc-state", "state-enforced", cut(t_state), cut(t_june2020))
scene("wc-call", "phone-call", cut(t_june2020), cut(t_stat_19), replyAtSec=cut(t_reply))
scene("wc-escape", "marsalek-escape", s19_end, cut(t_even_wirecard), routeAtSec=cut(t_route))
scene("wc-bridge", "bridge", cut(t_even_wirecard), cut(t_ch4), line="Wirecard lied about one number in one account.", emphasis="The next company built an industrial machine for manufacturing lies.")

# Enron
ch4_body = cut(t_ch4) + RITUAL
scene("en-trophy", "trophies", ch4_body, cut(t_machine1))
scene("en-m1", "machine-one", cut(t_machine1), cut(t_machine2))
scene("en-m2", "machine-two", cut(t_machine2), cut(t_culture))
scene("en-black", "blackout", cut(t_culture), cut(t_then2001))
crash_start = cut(t_then2001)
scene(
    "en-crash", "crash-chart", crash_start, cut(t_stat_20k),
    points=[
        {"t": crash_start + 0.4, "v": 90, "label": ""},
        {"t": cut(t_ninety) + 0.2, "v": 90, "label": "$90"},
        {"t": t_80, "v": 80, "label": ""},
        {"t": t_40, "v": 40, "label": ""},
        {"t": t_10, "v": 10, "label": ""},
        {"t": t_026, "v": 0.26, "label": "26¢"},
    ],
)
scene("en-shred", "shredder", s20k_end, cut(t_now_every))
scene("en-bridge", "imaginary-bridge", cut(t_now_every), cut(t_ch5))

# OneCoin
ch5_body = cut(t_ch5) + RITUAL
scene("oc-stage", "stage-queen", ch5_body, cut(t_wembley))
scene("oc-wembley", "wembley", cut(t_wembley), cut(t_separates))
scene("oc-chain", "blockchain-vs-db", cut(t_separates), cut(t_sell_coin), typeAtSec=cut(t_typed))
scene("oc-pyramid", "pyramid", cut(t_sell_coin), cut(t_stat_4b))
scene("oc-airport", "airport-vanish", s4b_end, cut(t_no_sightings), vanishAtSec=cut(t_stopped))
scene("oc-hunt", "manhunt", cut(t_no_sightings), cut(t_claimed))
scene("oc-sight", "sightings", cut(t_claimed), cut(t_honest))
scene("oc-grave", "grave-or-ghost", cut(t_honest), cut(t_five_ceos))

# Close
scene("close-recap", "ledger-recap", cut(t_five_ceos), cut(t_question_close), trustAtSec=cut(t_trust_words))
scene("close-next", "next-one", cut(t_question_close), cut(t_next_entry))
scene("close-logo", "tease-logo", cut(t_next_entry), DURATION, logoAtSec=VOICE_END + 0.6)

# ---------------------------------------------------------------- speech intervals (for ducking)
speech = []
cur_s, cur_e = None, None
for w in WORDS:
    if cur_s is None:
        cur_s, cur_e = w["s"], w["e"]
    elif w["s"] - cur_e <= 0.35:
        cur_e = w["e"]
    else:
        speech.append([round(cur_s, 2), round(cur_e, 2)])
        cur_s, cur_e = w["s"], w["e"]
if cur_s is not None:
    speech.append([round(cur_s, 2), round(cur_e, 2)])

# ---------------------------------------------------------------- validation
scenes_sorted = sorted(scenes, key=lambda s: s["start"])
prev_end = 0.0
for s in scenes_sorted:
    if s["start"] > prev_end + 0.35 and not (s["id"].startswith("ftx-door2") or s["id"].startswith("wc-escape")):
        # gaps are covered by stat cards / ledger opens; just report
        print(f"gap before {s['id']}: {prev_end:.2f} -> {s['start']:.2f}")
    prev_end = max(prev_end, s["end"])

chapters = [
    {"title": "Cold Open", "at": 0.0},
    {"title": "Entry One: FTX", "at": cut(t_ch1)},
    {"title": "Entry Two: Theranos", "at": cut(t_ch2)},
    {"title": "Entry Three: Wirecard", "at": cut(t_ch3)},
    {"title": "Entry Four: Enron", "at": cut(t_ch4)},
    {"title": "Entry Five: OneCoin", "at": cut(t_ch5)},
    {"title": "The Close", "at": cut(t_five_ceos)},
]

timeline = {
    "fps": 30,
    "durationSec": DURATION,
    "voiceoverSec": round(VOICE_END, 2),
    "scenes": scenes_sorted,
    "ledgers": ledgers,
    "slams": slams,
    "stats": sorted(stats, key=lambda s: s["at"]),
    "enronChart": {"start": crash_start, "end": cut(t_stat_20k), "points": []},
    "chapters": chapters,
    "speech": speech,
}

with open(os.path.join(ROOT, "src", "timeline.json"), "w") as f:
    json.dump(timeline, f, indent=1)

print(f"OK duration={DURATION}s voice={VOICE_END:.2f}s scenes={len(scenes)} "
      f"stats={len(stats)} slams={len(slams)} ledgers={len(ledgers)}")
for c in chapters:
    m, s = divmod(int(c["at"]), 60)
    print(f"  {m}:{s:02d} {c['title']}")
