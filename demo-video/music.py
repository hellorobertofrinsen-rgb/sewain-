"""An original, royalty-free background loop: 100 BPM, warm pads, soft kick, light hats,
plucked arpeggio. Written from scratch with numpy, so there are no licensing questions."""
import sys, wave
import numpy as np

SR = 44100
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
out = sys.argv[2] if len(sys.argv) > 2 else 'music.wav'
BPM = 100
beat = 60 / BPM
n = int(SR * dur)
t = np.arange(n) / SR
mix = np.zeros(n)

def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)

# I – V – vi – IV in C (Cmaj7, G6, Am7, Fmaj7), one bar each.
CHORDS = [[48, 55, 64, 67, 71], [43, 55, 62, 64, 71], [45, 57, 60, 64, 67], [41, 57, 60, 64, 69]]
bar = beat * 4

def env(length, a, r):
    e = np.ones(length)
    ai, ri = min(int(a * SR), length // 2), min(int(r * SR), length // 2)
    e[:ai] = np.linspace(0, 1, ai)
    e[-ri:] *= np.linspace(1, 0, ri)
    return e

# pads
k = 0
while k * bar < dur:
    start = int(k * bar * SR)
    L = min(int(bar * SR), n - start)
    tt = np.arange(L) / SR
    chord = CHORDS[k % 4]
    pad = np.zeros(L)
    for m in chord:
        f = note(m)
        pad += 0.5 * np.sin(2 * np.pi * f * tt) + 0.18 * np.sin(2 * np.pi * f * 2.003 * tt) + 0.08 * np.sin(2 * np.pi * f * 0.5 * tt)
    pad *= env(L, 0.35, 0.45) * 0.045
    mix[start:start + L] += pad
    # bass on beats 1 and 3
    for b in (0, 2):
        s = start + int(b * beat * SR)
        if s >= n: break
        l = min(int(beat * 1.6 * SR), n - s)
        tb = np.arange(l) / SR
        mix[s:s + l] += 0.16 * np.sin(2 * np.pi * note(chord[0] - 12 + 12) * tb) * np.exp(-tb * 2.2)
    # plucked arpeggio, eighth notes
    arp = [chord[2], chord[3], chord[4], chord[3]] * 2
    for j, m in enumerate(arp):
        s = start + int(j * beat / 2 * SR)
        if s >= n: break
        l = min(int(0.45 * SR), n - s)
        tp = np.arange(l) / SR
        f = note(m + 12)
        mix[s:s + l] += 0.05 * (np.sin(2 * np.pi * f * tp) + 0.3 * np.sin(4 * np.pi * f * tp)) * np.exp(-tp * 7)
    k += 1

# drums: soft kick on 1 and 3, clap-ish snare on 2 and 4, hats on offbeats
rng = np.random.default_rng(7)
i = 0
while i * beat < dur:
    s = int(i * beat * SR)
    l = min(int(0.3 * SR), n - s)
    tk = np.arange(l) / SR
    if i % 2 == 0:
        mix[s:s + l] += 0.35 * np.sin(2 * np.pi * (48 + 70 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 9)
    else:
        noise = rng.standard_normal(l) * np.exp(-tk * 22)
        mix[s:s + l] += 0.06 * noise
    hs = s + int(beat / 2 * SR)
    if hs < n:
        hl = min(int(0.06 * SR), n - hs)
        hn = rng.standard_normal(hl)
        hn = np.diff(hn, prepend=0)  # brighter
        mix[hs:hs + hl] += 0.035 * hn * np.exp(-np.arange(hl) / SR * 60)
    i += 1

# gentle master: fade in/out, soft clip, normalise
fade = int(1.5 * SR)
mix[:fade] *= np.linspace(0, 1, fade)
mix[-int(2.5 * SR):] *= np.linspace(1, 0, int(2.5 * SR))
mix = np.tanh(mix * 1.4)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.8
stereo = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)  # a little width
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print('wrote', out, dur)
