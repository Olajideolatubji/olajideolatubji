import pytest

from app.media.captions import beats_to_srt, split_cards
from app.media.ffmpeg import build_crossfade_filter


def test_crossfade_offsets_accumulate_correctly():
    f = build_crossfade_filter([10.0, 10.0, 10.0], 0.3)
    parts = f.split(";")
    assert "[0:v][1:v]xfade=transition=fade:duration=0.300:offset=9.700[v1]" in parts
    # second seam lands at 10 + 10 - 0.3 - 0.3
    assert "[v1][2:v]xfade=transition=fade:duration=0.300:offset=19.400[v2]" in parts
    # audio crossfades the same length, so audio and video stay in sync
    assert "[0:a][1:a]acrossfade=d=0.300:c1=tri:c2=tri[a1]" in parts
    assert parts[-2:] == ["[v2]null[vout]", "[a2]anull[aout]"]


def test_crossfade_needs_two_inputs():
    with pytest.raises(ValueError):
        build_crossfade_filter([5.0], 0.3)


def test_caption_cards_split_on_word_count():
    assert split_cards("one two three four five six seven eight", 7) == [
        "one two three four five six seven",
        "eight",
    ]


def test_srt_timings_stay_inside_the_beat():
    srt = beats_to_srt(
        [
            {"start_seconds": 0.0, "duration_seconds": 2.5, "narration": "Stop scrolling right now"},
            {"start_seconds": 2.5, "duration_seconds": 4.5, "narration": ""},
        ]
    )
    assert "00:00:00,000 --> 00:00:02,500" in srt
    assert srt.count("-->") == 1  # the silent beat gets no card
