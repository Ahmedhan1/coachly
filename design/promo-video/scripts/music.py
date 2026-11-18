"""Original synthesized track for the promo (no samples, no third-party audio).
120 BPM, A minor, Am-F-C-G. Structure is given in bars (2 s each) so video cuts land on the beat.
usage: python3 music.py out.wav TOTAL_BARS "section spec json"
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

out_path = sys.argv[1]
TOTAL_BARS = int(sys.argv[2])
# sections: list of [startBar, endBar, kind]; kinds: intro, build, drop, groove, break, outro
SECTIONS = json.loads(sys.argv[3])
N = int((TOTAL_BARS * BAR + 3) * SR)
L = np.zeros(N)
R = np.zeros(N)


def kind_at(bar):
    for s, e, k in SECTIONS:
        if s <= bar < e:
            return k
    return 'outro'


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, a):
    """one-pole low-pass, a in (0,1): higher = brighter"""
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    # FFT brick-ish low-pass with soft knee (fast, fine for pads/bass)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def hp_fast(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (f / cutoff) ** 2 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def add(buf, start_s, sig, gain=1.0):
    i = int(start_s * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def saw(freq, dur, detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    ph = (t * freq * (1 + detune) + rng.random()) % 1.0
    return 2 * ph - 1


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.1):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.ones(n) * s
    e[t < a] = t[t < a] / a
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / d
    rel = t > dur - r
    e[rel] *= np.clip((dur - t[rel]) / r, 0, 1)
    return e


# ---------- instruments ----------
def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = rng.standard_normal(n) * np.exp(-t * 300) * 0.25
    return np.tanh((body + click) * 1.6)


KICK = kick()


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = hp_fast(rng.standard_normal(n), 900)
    e = np.exp(-t * 18) + 0.6 * np.exp(-((t - 0.012) % 0.011) * 400) * (t < 0.035)
    return noise * e * 0.5


CLAP = clap()


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    noise = hp_fast(rng.standard_normal(n), 7000)
    return noise * np.exp(-t * (14 if open_ else 70)) * 0.35


HAT, OHAT = hat(), hat(True)


def bass_note(note, dur):
    f = midi(note)
    s = saw(f, dur) * 0.6 + np.sign(np.sin(2 * np.pi * f / 2 * np.arange(int(dur * SR)) / SR)) * 0.35
    s = lp_fast(s, 520)
    return np.tanh(s * 1.8) * env_adsr(len(s), 0.004, 0.08, 0.75, 0.04)


def pad_chord(notes, dur, cutoff):
    n = int(dur * SR)
    l = np.zeros(n)
    r = np.zeros(n)
    for nt in notes:
        for d in (-0.011, -0.004, 0.0, 0.005, 0.012):
            s = saw(midi(nt), dur, d)
            if d <= 0:
                l += s
            if d >= 0:
                r += s
    e = env_adsr(n, 0.25, 0.3, 0.85, 0.35)
    return lp_fast(l, cutoff) * e * 0.07, lp_fast(r, cutoff) * e * 0.07


def pluck(note, dur=0.22, bright=4200):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    s = saw(f, dur) * 0.5 + saw(f, dur, 0.006) * 0.5
    s = lp_fast(s, bright) * np.exp(-t * 14)
    return s * 0.22


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.05 * SR)
    for i in range(0, n, seg):
        c = 300 + 9000 * (i / n) ** 2
        out[i:i + seg] = hp_fast(noise[i:i + seg], c)
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / dur) ** 2) / SR) * 0.15
    return (out * 0.25 + tone) * (t / dur) ** 2


def impact():
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 1.6)
    noise = lp_fast(rng.standard_normal(n), 2500) * np.exp(-t * 5) * 0.4
    return np.tanh((boom + noise) * 1.4) * 0.9


def whoosh(dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.03 * SR)
    for i in range(0, n, seg):
        x = i / n
        out[i:i + seg] = lp_fast(noise[i:i + seg], 400 + 5000 * np.sin(np.pi * x))
    return out * np.sin(np.pi * t / dur) ** 2 * 0.35


# ---------- arrangement ----------
CHORDS = [  # Am F C G  (pad voicing, bass root)
    ([57, 60, 64, 69], 45),
    ([53, 57, 60, 65], 41),
    ([55, 60, 64, 67], 48),
    ([55, 59, 62, 67], 43),
]
ARP = [0, 2, 1, 3, 2, 1, 3, 2]
duck = np.ones(N)


def sidechain(at_s, depth=0.6, length=0.32):
    i = int(at_s * SR)
    n = int(length * SR)
    t = np.arange(n) / SR
    shape = 1 - depth * np.exp(-t * 11)
    j = min(N, i + n)
    duck[i:j] = np.minimum(duck[i:j], shape[: j - i])


padL = np.zeros(N)
padR = np.zeros(N)
bass = np.zeros(N)
lead = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)

for bar in range(TOTAL_BARS):
    k = kind_at(bar)
    t0 = bar * BAR
    notes, root = CHORDS[bar % 4]
    cutoff = {'intro': 900, 'build': 1400 + 400 * (bar % 2), 'drop': 4200, 'groove': 2600, 'break': 1100, 'outro': 1500}[k]
    pl, pr = pad_chord(notes, BAR + 0.3, cutoff)
    pad_gain = {'intro': 1.0, 'build': 1.0, 'drop': 0.85, 'groove': 0.7, 'break': 1.1, 'outro': 0.9}[k]
    add(padL, t0, pl, pad_gain)
    add(padR, t0, pr, pad_gain)

    four = k in ('drop', 'groove')
    if four or (k == 'outro' and bar < TOTAL_BARS - 2):
        for b in range(4):
            add(drums, t0 + b * BEAT, KICK, 0.95)
            sidechain(t0 + b * BEAT)
        for b in (1, 3):
            add(drums, t0 + b * BEAT, CLAP, 0.8 if k == 'drop' else 0.6)
        for e in range(8):
            if e % 2 == 1:
                add(drums, t0 + e * BEAT / 2, OHAT if k == 'drop' else HAT, 0.6)
            elif k == 'drop':
                add(drums, t0 + e * BEAT / 2, HAT, 0.35)
        # offbeat pumping bass
        for e in range(8):
            if e % 2 == 1:
                add(bass, t0 + e * BEAT / 2, bass_note(root - 12 + 12 * (e == 7 and bar % 4 == 3), BEAT / 2 * 0.95), 0.55)
            elif e == 0:
                add(bass, t0, bass_note(root - 12, BEAT / 2 * 0.9), 0.45)
    if k == 'intro' and bar % 2 == 0:
        add(drums, t0, KICK, 0.5)
    if k == 'break':
        add(bass, t0, bass_note(root - 12, BAR * 0.95), 0.35)

    # arp lead
    if k in ('drop', 'intro', 'break', 'build') or (k == 'groove' and bar % 8 >= 4):
        bright = {'intro': 1300, 'build': 2200, 'drop': 5200, 'groove': 3000, 'break': 1800}[k]
        gain = {'intro': 0.7, 'build': 0.85, 'drop': 1.0, 'groove': 0.6, 'break': 0.75}[k]
        for s16 in range(16):
            nt = notes[ARP[s16 % 8]] + 12 + (12 if k == 'drop' and s16 % 8 == 7 else 0)
            add(lead, t0 + s16 * BEAT / 4, pluck(nt, 0.2, bright), gain)

    if k == 'build':
        # snare roll accelerating
        nxt = kind_at(bar + 1)
        div = 4 if (bar + 1 < TOTAL_BARS and nxt == 'build') else 8
        for s in range(div):
            add(drums, t0 + s * BAR / div, CLAP, 0.25 + 0.5 * s / div)
        if nxt != 'build':
            pass
    # riser + impact into drops
    if kind_at(bar + 1) == 'drop' and k != 'drop':
        add(fx, t0 + BAR - 4 * BAR / 2 if k == 'build' else t0, riser(2 * BAR if k == 'build' else BAR), 0.8)
    if k == 'drop' and kind_at(bar - 1) != 'drop':
        add(fx, t0, impact(), 0.9)

# section-change whooshes
for s, e, k in SECTIONS:
    if s > 0:
        add(fx, s * BAR - 0.45, whoosh(0.6), 0.6)

mixL = padL * duck + bass * duck * 0.9 + lead * 0.9 + drums + fx
mixR = padR * duck + bass * duck * 0.9 + lead * 0.9 + drums + fx
# simple stereo delay on lead for width
d = int(0.18 * SR)
mixR[d:] += lead[:-d] * 0.25
mixL[2 * d:] += lead[:-2 * d] * 0.12

# master: fade out the last 2 bars, soft clip, normalise
end = TOTAL_BARS * BAR
t = np.arange(N) / SR
fade = np.clip((end + 1.5 - t) / (2 * BAR + 1.5), 0, 1)
fade = np.where(t < end - 2 * BAR, 1, fade)
mixL *= fade
mixR *= fade
peak = max(np.abs(mixL).max(), np.abs(mixR).max())
mixL = np.tanh(mixL / peak * 1.3) * 0.89
mixR = np.tanh(mixR / peak * 1.3) * 0.89
cut = int((end + 1.0) * SR)
stereo = np.stack([mixL[:cut], mixR[:cut]], axis=1)
pcm = (stereo * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', out_path, round(cut / SR, 1), 's')
