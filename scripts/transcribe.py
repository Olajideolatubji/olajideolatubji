"""Transcribe public/voiceover.mp3 with word-level timestamps -> scripts/words.json"""
import json
import os

from faster_whisper import WhisperModel

ROOT = os.path.join(os.path.dirname(__file__), "..")

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    os.path.join(ROOT, "public", "voiceover.mp3"),
    word_timestamps=True,
    language="en",
    beam_size=5,
    vad_filter=False,
)

words = []
for seg in segments:
    for w in seg.words or []:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})

with open(os.path.join(ROOT, "scripts", "words.json"), "w") as f:
    json.dump({"duration": info.duration, "words": words}, f)

print("words:", len(words), "duration:", info.duration)
