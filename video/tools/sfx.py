"""Synthesizes a tiny SFX bed (whooshes, pops, taps, one thump) aligned to the voice-over timeline -> ../public/sfx.wav"""
import json, wave
import numpy as np

SR = 44100
vo = json.load(open('../public/vo/vo.json'))
words = {s['id']: s['words'] for s in vo['sections']}
starts = {s['id']: s['start'] for s in vo['sections']}
def w(sec, text, n=0):
    hits = [x for x in words[sec] if x['w'].lower().strip('.,?!:;') == text.lower()]
    return hits[n]['s']

total = vo['sections'][-1]['end'] + 2.5
buf = np.zeros(int(total * SR) + SR)
rng = np.random.default_rng(7)

def add(t, sig, gain):
    i = int(t * SR)
    buf[i:i + len(sig)] += sig[: len(buf) - i] * gain

def whoosh(dur=0.45, up=True):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    # band-pass sweep via moving filtered noise: cumulative one-pole filters with a swept cutoff
    out = np.zeros(n); lp = 0.0; lp2 = 0.0
    for i in range(n):
        p = i / n
        fc = (300 + 3500 * (p if up else 1 - p)) / SR
        a = min(0.95, 2 * np.pi * fc)
        lp += a * (x[i] - lp); lp2 += a * (lp - lp2)
        out[i] = lp - lp2
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    out = out / (np.abs(out).max() + 1e-9)
    return out * env

def pop(f0=620, dur=0.14):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (1 + 1.2 * np.exp(-t * 30))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 26)

def tick(f0=1400, dur=0.07):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f0 * t) * np.exp(-t * 60)

def thump(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 120 * np.exp(-t * 6) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)

def sparkle(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for k, f0 in enumerate([1568, 2093, 2637, 3136]):
        d = int(k * 0.05 * SR)
        out[d:] += (np.sin(2 * np.pi * f0 * t[: n - d]) * np.exp(-t[: n - d] * 9))
    return out / 2

# whooshes on scene changes (slightly before the cut)
for sec, off in [('problem', 0.0), ('palace', 0.0), ('bizarre', 0.0), ('turn', 0.0), ('studio', 0.0), ('enter', 0.0), ('review', 0.0), ('spaced', 0.0), ('done', 0.0)]:
    add(starts[sec] - 0.3 + off, whoosh(0.45), 0.22)
add(w('close', 'Stop') - 0.55, whoosh(0.5, up=True), 0.25)
add(starts['place'] + 0.0 + 0.0, whoosh(0.3), 0.0)
# pops on chips
add(w('problem', 'forgetting') - 0.05, pop(520), 0.35)
for x in ['lamp', 'wall', 'sofa']:
    add(w('palace', x) - 0.03, pop(700), 0.35)
add(w('palace', 'memory') - 0.03, pop(520), 0.25)
add(w('bizarre', 'purple') - 0.03, pop(380, 0.22), 0.45)
add(w('bizarre', 'bizarreness') - 0.03, pop(560), 0.3)
add(w('turn', 'hard') - 0.03, pop(300), 0.3)
add(w('turn', 'LOCI') - 0.02, thump(), 0.6)
add(w('review', 'Got') - 0.03, pop(820), 0.35)
add(w('review', 'Missed') - 0.03, pop(330), 0.3)
for i in range(3):
    add(w('place', 'tap', i) - 0.02, tick(), 0.45)
for sec, x, n in [('studio', 'PDF', 0), ('studio', 'generate', 0), ('studio', 'upload', 0), ('studio', 'key', 0), ('studio', 'type', 0), ('studio', 'Pick', 0)]:
    add(w(sec, x, n) - 0.03, pop(640), 0.28)
add(w('studio', 'build') - 0.03, pop(900), 0.35)
add(w('close', 'Stop') - 0.02, sparkle(), 0.3)
add(w('close', 'Start') - 0.02, sparkle(), 0.25)

buf = np.clip(buf, -1, 1)
pcm = (buf * 32767 * 0.9).astype(np.int16)
with wave.open('../public/sfx.wav', 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
print('ok', total)
