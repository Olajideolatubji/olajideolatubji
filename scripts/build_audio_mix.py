"""Build the final audio mix (out/audio.wav) from timeline.json.

Replicates Main.tsx's per-frame audio logic exactly:
- voiceover.mp3 at unity gain
- music.wav looped, base -22dB, ducked to -28dB while speech is active,
  hard-silenced (with 0.1s pre-ramp) during the 1s window before each stat
  card, 2s fade-in, fade-out over the last 2.5s
- impact.wav at 0.5 gain on every ledger open and counter slam
"""
import json
import os
import subprocess
import wave

import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
SR = 44100
FPS = 30

t = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
DUR = t["durationSec"]
N = int(DUR * SR)


def read_wav(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR, path
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() == 2:
            data = data.reshape(-1, 2).mean(axis=1)
        return data.astype(np.float64) / 32768.0


def read_mp3(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0


def db(x):
    return 10 ** (x / 20)


voice = read_mp3(os.path.join(ROOT, "public", "voiceover.mp3"))
music = read_wav(os.path.join(ROOT, "public", "music.wav"))
impact = read_wav(os.path.join(ROOT, "public", "impact.wav"))

# ---- music envelope, evaluated per frame then interpolated per sample
frames = int(DUR * FPS) + 1
env = np.zeros(frames)
silences = [(s["at"] - 1.0, s["at"]) for s in t["stats"]]
speech = t["speech"]

for f in range(frames):
    tt = f / FPS
    g = None
    for a, b in silences:
        if a - 0.1 <= tt <= b:
            ramp = min(1.0, max(0.0, (a - tt) / 0.1)) if tt < a else 0.0
            g = db(-22) * ramp
            break
    if g is None:
        speaking = any(a <= tt <= b for a, b in speech)
        g = db(-28) if speaking else db(-22)
    g *= min(1.0, tt / 2.0)
    g *= min(1.0, max(0.0, (DUR - 0.2 - tt) / 2.3))
    env[f] = g

sample_env = np.interp(np.arange(N) / SR * FPS, np.arange(frames), env)

# ---- assemble
mix = np.zeros(N)
mix[: min(N, len(voice))] += voice[: min(N, len(voice))]

tiled = np.tile(music, int(np.ceil(N / len(music))))[:N]
mix += tiled * sample_env

for at in [l["at"] for l in t["ledgers"]] + [s["at"] for s in t["slams"]]:
    i0 = int(at * SR)
    seg = impact[: max(0, min(len(impact), N - i0))]
    mix[i0 : i0 + len(seg)] += seg * 0.5

peak = np.max(np.abs(mix))
print("peak before limit:", round(peak, 3))
if peak > 0.98:
    mix *= 0.98 / peak

out = os.path.join(ROOT, "out", "audio.wav")
data = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(out, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print(out, len(mix) / SR, "s")
