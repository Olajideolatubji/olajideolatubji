"""Synthesize the music bed loop and the impact hit for The Red Ledger.

Outputs 44.1kHz WAVs into public/. The music bed is a seamless 16s loop:
low drone (A1 55Hz + fifth), slow amplitude pulse, dark filtered noise air.
The impact is a deep sub boom with a fast attack, used on counter slams and
ledger opens.
"""
import numpy as np
import wave
import os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public")


def write_wav(path, x, sr=SR):
    x = np.clip(x, -1.0, 1.0)
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())
    print(path, len(x) / sr, "s")


def lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def music_bed(dur=16.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    # Integer number of cycles over the loop so it's seamless.
    def cyc(freq):
        cycles = round(freq * dur)
        return cycles / dur

    drone = (
        0.50 * np.sin(2 * np.pi * cyc(55.0) * t)
        + 0.28 * np.sin(2 * np.pi * cyc(82.4) * t)
        + 0.18 * np.sin(2 * np.pi * cyc(110.0) * t)
        + 0.10 * np.sin(2 * np.pi * cyc(164.8) * t)
    )
    # Slow pulse: 4 swells over the 16s loop (0.25 Hz), never fully silent.
    pulse = 0.55 + 0.45 * (0.5 - 0.5 * np.cos(2 * np.pi * (4 / dur) * t))
    # Dark air: heavily low-passed noise, loop-faded.
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n)
    noise = lowpass(noise, 0.02) * 3.0
    bed = drone * pulse + 0.12 * noise
    # Gentle saturation for body.
    bed = np.tanh(bed * 1.2) * 0.8
    # Crossfade the loop seam.
    fade = int(SR * 0.05)
    ramp = np.linspace(0, 1, fade)
    bed[:fade] = bed[:fade] * ramp + bed[-fade:] * (1 - ramp)
    return bed * 0.9


def impact(dur=2.5):
    n = int(SR * dur)
    t = np.arange(n) / SR
    # Pitch drop 85 -> 30 Hz.
    f = 30 + 55 * np.exp(-t * 6.0)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 2.2)
    sub = np.sin(2 * np.pi * 36 * t) * np.exp(-t * 1.6) * 0.7
    click = np.exp(-t * 90.0) * 0.5
    rng = np.random.default_rng(3)
    thud = lowpass(rng.standard_normal(n), 0.08) * np.exp(-t * 10.0) * 1.2
    x = body + sub + click + thud
    x = np.tanh(x * 1.5)
    # Fast attack envelope to avoid pop at t=0.
    a = int(SR * 0.003)
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.95


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_wav(os.path.join(OUT, "music.wav"), music_bed())
    write_wav(os.path.join(OUT, "impact.wav"), impact())
