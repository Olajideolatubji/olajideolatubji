"""Caption timing. Burn-in happens locally in ffmpeg, so the SRT is ours to build."""

from __future__ import annotations

from typing import Any, Iterable

MAX_WORDS_PER_CARD = 7


def _timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis == 1000:  # rounding up a hair
        millis, secs = 0, secs + 1
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def split_cards(text: str, max_words: int = MAX_WORDS_PER_CARD) -> list[str]:
    words = text.split()
    return [" ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)] or []


def beats_to_srt(beats: Iterable[dict[str, Any]], max_words: int = MAX_WORDS_PER_CARD) -> str:
    """Split each beat's narration into cards, timed by word share of the beat."""
    blocks: list[str] = []
    index = 1
    for beat in beats:
        narration = (beat.get("narration") or "").strip()
        if not narration:
            continue
        start = float(beat.get("start_seconds") or 0.0)
        duration = float(beat.get("duration_seconds") or 0.0)
        cards = split_cards(narration, max_words)
        if not cards or duration <= 0:
            continue
        total_words = sum(len(c.split()) for c in cards) or 1
        cursor = start
        for card in cards:
            share = len(card.split()) / total_words
            card_duration = max(0.6, duration * share)
            end = min(start + duration, cursor + card_duration)
            blocks.append(f"{index}\n{_timestamp(cursor)} --> {_timestamp(end)}\n{card}\n")
            index += 1
            cursor = end
    return "\n".join(blocks)


def write_srt(path: str, content: str) -> str:
    import os

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return path
