"""End-to-end: tinysoundfont (real SF2/SF3 instruments) + CC0 drum one-shots (Sonic Pi) -> pedalboard mix/master
-> pyloudnorm.  8 bars, F minor, 128 BPM.  Reports wall + CPU time per stage.  Outputs under scratchpad/hands/test/mix."""
import sys, time, resource, os
import numpy as np, soundfile as sf, librosa
import tinysoundfont, pedalboard as pb, pyloudnorm as pyln

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
OUT = f"{S}/test/mix"; os.makedirs(OUT, exist_ok=True)
BANK = sys.argv[1] if len(sys.argv) > 1 else "gu"
BANKS = {"gu": f"{S}/dl/sf/GeneralUser-GS.sf2",
         "msg": f"{S}/dl/debx/msg/usr/share/sounds/sf3/MuseScore_General_Full.sf3",
         "fluid": f"{S}/dl/debx/fluidgm/usr/share/sounds/sf2/FluidR3_GM.sf2"}
SF = BANKS[BANK]
SR, BPM, BARS = 44100, 128, 8
SPB = SR * 60 / BPM                       # samples per beat (non-integer, keep float)
TOTAL = int(round(BARS * 4 * SPB)) + 3 * SR  # + 3 s tail for reverb/delay
rng = np.random.default_rng(7)
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import resample_poly

def lookahead_limiter(x, ceiling_db=-1.0, lookahead_ms=3.0, release_ms=80.0):
    """True lookahead brickwall: min-filter of required gain over the lookahead window, moving-average smoothed
    (guarantees |y| <= ceiling), then one-pole release. x: (n, ch)."""
    ceil = 10 ** (ceiling_db / 20); L = max(1, int(SR * lookahead_ms / 1000))
    pk = np.abs(x).max(axis=1)
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    g = minimum_filter1d(g, size=2 * L + 1, mode="nearest")
    g = uniform_filter1d(g, size=L + 1, mode="nearest")                 # attack smoothing
    # release: forward one-pole that only rises slowly
    a = np.exp(-1.0 / (SR * release_ms / 1000)); out = np.empty_like(g); cur = 1.0
    for i in range(len(g)):                                              # python loop is fine for tests (<1 s/15 s)
        cur = g[i] if g[i] < cur else a * cur + (1 - a) * g[i]
        out[i] = cur
    out = np.minimum(out, g)
    d = L                                                                # delay audio by lookahead
    xd = np.vstack([np.zeros((d, x.shape[1])), x])[: len(x)]
    return xd * out[:, None], 20 * np.log10(out.min() + 1e-12)

def tp_limiter(x, ceiling_db=-1.0, os_=4, **kw):
    """4x-oversampled lookahead limiter -> decimate; keeps true peak under the ceiling (approx.)."""
    up = resample_poly(x, os_, 1, axis=0)
    global SR
    sr0 = SR; SR = sr0 * os_
    try: y, gr = lookahead_limiter(up, ceiling_db - 0.1, **kw)
    finally: SR = sr0
    return resample_poly(y, 1, os_, axis=0), gr

def true_peak_db(x):
    up = resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)

def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF); return r.ru_utime + r.ru_stime
T = {}
class Stage:
    def __init__(self, name): self.name = name
    def __enter__(self): self.w, self.c = time.perf_counter(), cpu(); return self
    def __exit__(self, *a):
        T[self.name] = (time.perf_counter() - self.w, cpu() - self.c)
        print(f"  {self.name:34s} wall {T[self.name][0]:6.2f}s  cpu {T[self.name][1]:6.2f}s")

# ------------------------------------------------------------------ musical content (F minor: Fm | Db | Ab | Eb)
prog = [  # (chord tones for pad/choir, bass root, arp tones)
    ([53, 56, 60, 65], 29, [65, 68, 72, 77]),
    ([49, 53, 56, 61], 37, [61, 65, 68, 73]),
    ([51, 56, 60, 63], 32, [63, 68, 72, 75]),
    ([51, 55, 58, 63], 39, [63, 67, 70, 75]),
]
def beat(b): return int(round(b * SPB))
notes = {"pad": [], "choir": [], "strings": [], "bass": [], "arp": [], "drums_sf": []}
for bar in range(BARS):
    chord, root, arp = prog[bar % 4]
    b0 = bar * 4
    for k in chord:
        notes["pad"].append((beat(b0), beat(b0 + 3.9), k, 78))
        notes["strings"].append((beat(b0), beat(b0 + 3.95), k + 12 if k < 60 else k, 70))
    for k in chord[1:]:
        notes["choir"].append((beat(b0), beat(b0 + 3.8), k + 12, 62))
    for i in range(8):  # 8th-note bass with octave pump
        k = root + (12 if i % 4 == 3 else 0)
        notes["bass"].append((beat(b0 + i * 0.5), beat(b0 + i * 0.5 + 0.42), k, 100 if i % 2 == 0 else 80))
    for i in range(16):  # 16th arp
        k = arp[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]]
        notes["arp"].append((beat(b0 + i * 0.25), beat(b0 + i * 0.25 + 0.2), k, 70 + (i % 4 == 0) * 25))
    for i in range(4):  # SF2 drum kit (kick 36, clap 39, closed hat 42, open hat 46)
        notes["drums_sf"].append((beat(b0 + i), beat(b0 + i + 0.3), 36, 115))
        if i in (1, 3): notes["drums_sf"].append((beat(b0 + i), beat(b0 + i + 0.3), 39, 105))
    for i in range(8):
        notes["drums_sf"].append((beat(b0 + i * 0.5), beat(b0 + i * 0.5 + 0.2), 46 if i % 2 else 42, 80 if i % 2 else 70))

PROGRAMS = {"pad": (0, 89), "choir": (0, 52), "strings": (0, 49), "bass": (0, 38), "arp": (0, 4), "drums_sf": (128, 25)}

_SYN = {}
def get_synth():
    if "syn" not in _SYN:
        syn = tinysoundfont.Synth(samplerate=SR); _SYN["sfid"] = syn.sfload(SF); _SYN["syn"] = syn
    return _SYN["syn"], _SYN["sfid"]

def render_stem(name):
    syn, sfid = get_synth()                      # SF2/SF3 loaded ONCE per bank, program changed per stem
    bank, prog_ = PROGRAMS[name]
    drums = name.startswith("drums")
    ch = 9 if drums else 0
    if drums: syn.program_select(9, sfid, bank, prog_, is_drums=True)
    else: syn.program_select(0, sfid, bank, prog_)
    tl = []
    for (s_, e, k, v) in notes[name]:
        tl.append((s_, 1, k, v)); tl.append((e, 0, k, 0))
    tl.sort(key=lambda x: (x[0], x[1]))
    out = np.zeros((TOTAL, 2), np.float32); pos = 0
    for p, on, k, v in tl:
        if p > pos:
            out[pos:p] = np.frombuffer(syn.generate(p - pos), dtype=np.float32).reshape(-1, 2); pos = p
        syn.noteon(ch, k, v) if on else syn.noteoff(ch, k)
    if pos < TOTAL: out[pos:] = np.frombuffer(syn.generate(TOTAL - pos), dtype=np.float32).reshape(-1, 2)
    syn.notes_off(ch)
    return out

print(f"== bank {BANK}: {os.path.basename(SF)}  ({os.path.getsize(SF)/1e6:.0f} MB)")
stems = {}
with Stage("sf2 load+render, 6 stems (15 s)"):
    for n in notes: stems[n] = render_stem(n)

# ------------------------------------------------------------------ CC0 drum one-shots (Sonic Pi samples, CC0)
def load(name):
    y, sr = sf.read(f"{S}/dl/sp/{name}.flac", dtype="float32", always_2d=True)
    if sr != SR: y = librosa.resample(y.T, orig_sr=sr, target_sr=SR).T
    if y.shape[1] == 1: y = np.repeat(y, 2, axis=1)
    return y
def place(buf, smp, pos, gain=1.0):
    n = min(len(smp), len(buf) - pos)
    if n > 0: buf[pos:pos + n] += smp[:n] * gain
kick, snare, snap = load("bd_haus"), load("sn_dub"), load("perc_snap")
hat_c, hat_o, crash, boom = load("hat_gem"), load("hat_zild"), load("drum_cymbal_open"), load("misc_cineboom")
drums_cc0 = np.zeros((TOTAL, 2), np.float32); kick_env = np.zeros(TOTAL, np.float32)
with Stage("CC0 drum programming (numpy)"):
    for bar in range(BARS):
        b0 = bar * 4
        for i in range(4):
            p = beat(b0 + i); place(drums_cc0, kick, p, 1.0)
            tail = np.exp(-np.arange(int(0.22 * SR)) / (0.07 * SR)).astype(np.float32)
            n = min(len(tail), TOTAL - p); kick_env[p:p + n] = np.maximum(kick_env[p:p + n], tail[:n])
            if i in (1, 3):
                jit = int(rng.integers(-60, 60))
                place(drums_cc0, snare, p + jit, 0.8); place(drums_cc0, snap, p + jit, 0.7)
        for i in range(16):
            v = (0.55 if i % 4 == 2 else 0.30) * (0.85 + 0.3 * rng.random())
            place(drums_cc0, hat_o if i % 4 == 2 else hat_c, beat(b0 + i * 0.25) + int(rng.integers(-30, 30)), v)
    place(drums_cc0, crash, 0, 0.5); place(drums_cc0, boom, beat(4 * 4), 0.7)

# ------------------------------------------------------------------ mix: A = naive sum, B = pedalboard chain
def tochan(x): return np.ascontiguousarray(x.T.astype(np.float32))      # (ch, n)
def fromchan(x): return x.T

gains = {"pad": 0.45, "choir": 0.35, "strings": 0.45, "bass": 0.9, "arp": 0.5, "drums_sf": 0.0}
raw = sum(stems[n] * g for n, g in gains.items()) + drums_cc0 * 0.9
raw = raw / max(1e-9, np.abs(raw).max()) * 0.89
sf.write(f"{OUT}/A_raw_{BANK}.wav", raw, SR, subtype="PCM_24")

chains = {
  "drums": pb.Pedalboard([pb.HighpassFilter(30), pb.Compressor(-16, 3.0, 8, 90), pb.Clipping(-6), pb.Gain(1.0)]),
  "bass":  pb.Pedalboard([pb.HighpassFilter(32), pb.Distortion(5), pb.LowpassFilter(3500), pb.Compressor(-18, 4.0, 10, 120)]),
  "pad":   pb.Pedalboard([pb.HighpassFilter(170), pb.Chorus(0.35, 0.3, 8, 0.0, 0.35), pb.LowpassFilter(9000), pb.Reverb(0.85, 0.45, 0.38, 0.62, 1.0)]),
  "strings": pb.Pedalboard([pb.HighpassFilter(200), pb.Reverb(0.8, 0.5, 0.33, 0.67, 1.0), pb.HighShelfFilter(7000, -2.0)]),
  "choir": pb.Pedalboard([pb.HighpassFilter(250), pb.Reverb(0.9, 0.4, 0.45, 0.55, 1.0), pb.HighShelfFilter(8000, 1.5)]),
  "arp":   pb.Pedalboard([pb.HighpassFilter(220), pb.Delay(0.75 * 60 / BPM, 0.38, 0.28), pb.Reverb(0.6, 0.5, 0.2, 0.8, 1.0)]),
}
master = pb.Pedalboard([
  pb.HighpassFilter(28), pb.LowShelfFilter(90, 1.5, 0.7), pb.PeakFilter(320, -1.5, 1.0), pb.HighShelfFilter(9500, 2.0, 0.7),
  pb.Compressor(-14, 2.0, 30, 150)])

def duck(x, depth, env=kick_env): return x * (1 - depth * env)[:, None]

with Stage("pedalboard stems (6 chains)"):
    proc = {}
    proc["drums"] = fromchan(chains["drums"](tochan(drums_cc0), SR))
    proc["bass"] = fromchan(chains["bass"](tochan(duck(stems["bass"], 0.5)), SR))
    for n in ("pad", "strings", "choir", "arp"):
        src = duck(stems[n], 0.6) if n != "arp" else stems[n]
        proc[n] = fromchan(chains[n](tochan(src), SR))
with Stage("sum + master chain + LUFS match"):
    bus = proc["drums"] * 0.95 + proc["bass"] * 0.8 + proc["pad"] * 0.42 + proc["strings"] * 0.4 + proc["choir"] * 0.3 + proc["arp"] * 0.45
    m = fromchan(master(tochan(bus), SR))
    meter = pyln.Meter(SR)
    l0 = meter.integrated_loudness(m)
    TARGET = -11.0                                           # LUFS target (loud pop master)
    for _ in range(3):                                       # iterate: limiter removes level, re-trim gain
        m_g = m * 10 ** ((TARGET - meter.integrated_loudness(m)) / 20)
        m_l, gr = tp_limiter(m_g, -1.0)
        l1 = meter.integrated_loudness(m_l)
        m = m * 10 ** ((TARGET - l1) / 20) if abs(l1 - TARGET) > 0.2 else m
        if abs(l1 - TARGET) <= 0.2: break
    m = m_l
    print(f"   pre-master LUFS {l0:.1f} -> final {l1:.1f} (target {TARGET}), max gain reduction {gr:.1f} dB")
sf.write(f"{OUT}/B_pro_{BANK}.wav", m, SR, subtype="PCM_24")
for n, a in [("drums_cc0", proc["drums"]), ("bass", proc["bass"]), ("pad", proc["pad"])]:
    sf.write(f"{OUT}/stem_{n}_{BANK}.wav", a, SR, subtype="PCM_24")
sf.write(f"{OUT}/drums_sf2_kit_{BANK}.wav", stems["drums_sf"], SR, subtype="PCM_24")

# ------------------------------------------------------------------ stats
def stats(label, x):
    meter = pyln.Meter(SR)
    lufs = meter.integrated_loudness(x)
    pk = 20 * np.log10(np.abs(x).max() + 1e-12); rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    width = 20 * np.log10((np.sqrt(np.mean(side ** 2)) + 1e-12) / (np.sqrt(np.mean(mid ** 2)) + 1e-12))
    sc = librosa.feature.spectral_centroid(y=mid, sr=SR).mean()
    print(f"  {label:10s} LUFS {lufs:6.1f} | sample-peak {pk:5.1f} dBFS | true-peak {true_peak_db(x):5.1f} | crest {pk-rms:4.1f} dB | S/M {width:6.1f} dB | centroid {sc:5.0f} Hz")
print("stats:"); stats("A_raw", raw); stats("B_pro", m)
tw = sum(v[0] for v in T.values()); tc = sum(v[1] for v in T.values())
dur = BARS * 4 * 60 / BPM
print(f"TOTAL wall {tw:.2f}s cpu {tc:.2f}s for {dur:.1f}s of music -> scaled to 142 s: wall ~{tw*142/dur:.0f}s cpu ~{tc*142/dur:.0f}s")
print("RSS peak %.0f MB" % (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))
