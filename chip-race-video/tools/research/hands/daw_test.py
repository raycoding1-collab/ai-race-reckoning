"""DawDreamer 0.9.0 + Faust: zita_rev1 reverb, lookahead limiter, polyphonic analog-modelled synth (MIDI)."""
import time, resource
import numpy as np, soundfile as sf
import dawdreamer as daw

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
SR, BS = 44100, 512

def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF); return r.ru_utime + r.ru_stime

def timed(label, fn):
    w, c = time.perf_counter(), cpu(); r = fn(); w, c = time.perf_counter() - w, cpu() - c
    print(f"  {label:44s} wall {w:6.2f}s cpu {c:6.2f}s"); return r, w

x, sr = sf.read(f"{S}/test/mix/A_raw_gu.wav", dtype="float32")          # 15 s stereo test mix
assert sr == SR
dur = len(x) / SR
print(f"input {dur:.1f}s")

# --- A. zita_rev1_stereo (Faust reverbs.lib) with wet/dry
engine = daw.RenderEngine(SR, BS)
pbk = engine.make_playback_processor("in", np.ascontiguousarray(x.T))
rev = engine.make_faust_processor("rev")
rev.set_dsp_string('''
import("stdfaust.lib");
wet = hslider("wet", 0.35, 0, 1, 0.01);
process = _,_ <: (*(1-wet),*(1-wet)), (re.zita_rev1_stereo(60, 200, 6000, 3.0, 2.0, 48000) : *(wet),*(wet)) :> _,_;
''')
engine.load_graph([(pbk, []), (rev, ["in"])])
_, w = timed("A zita_rev1_stereo wet=0.35 (compile+render)", lambda: engine.render(dur))
y = engine.get_audio().T
print(f"    out shape {y.shape}, peak {np.abs(y).max():.2f}; RTF {w/dur:.3f}")
sf.write(f"{S}/test/daw_zita_rev1.wav", y, SR, subtype="PCM_24")

# --- A2. other Faust reverbs: dattorro_rev_default, jpverb, greyhole (compile + render time)
for nm, expr in [("dattorro", "re.dattorro_rev_default"), ("jpverb", "re.jpverb(3.0, 0.2, 1.0, 0.8, 0.3, 0.4, 0.9, 0.8, 0.7, 500, 4000)"),
                 ("greyhole", "re.greyhole(0.2, 0.3, 1.0, 0.5, 0.6, 0.1, 0.5)")]:
    try:
        eng = daw.RenderEngine(SR, BS); p = eng.make_playback_processor("in", np.ascontiguousarray(x.T))
        f = eng.make_faust_processor(nm)
        f.set_dsp_string(f'import("stdfaust.lib");\nprocess = {expr};')
        eng.load_graph([(p, []), (f, ["in"])])
        _, w = timed(f"A2 {nm} (compile+render)", lambda: eng.render(dur))
    except Exception as e:
        print(f"  A2 {nm}: FAILED {type(e).__name__}: {str(e)[:150]}")

# --- B. lookahead limiter, ceiling 0.89 (-1 dBFS) on a +9 dB hot signal
hot = np.clip(x * 2.8, -4, 4)
eng = daw.RenderEngine(SR, BS); p = eng.make_playback_processor("in", np.ascontiguousarray(hot.T))
lim = eng.make_faust_processor("lim")
lim.set_dsp_string('import("stdfaust.lib");\nprocess = co.limiter_lad_stereo(0.02, 0.89, 0.003, 0.02, 0.12);')
eng.load_graph([(p, []), (lim, ["in"])])
_, w = timed("B limiter_lad_stereo (lookahead 20 ms)", lambda: eng.render(dur))
yl = eng.get_audio().T
print(f"    in peak {np.abs(hot).max():.2f} -> out peak {np.abs(yl).max():.3f} (ceiling 0.89)")

# --- C. polyphonic Faust synth (supersaw + Moog ladder + ADSR), driven by MIDI
eng = daw.RenderEngine(SR, BS)
syn = eng.make_faust_processor("syn")
syn.num_voices = 8
syn.set_dsp_string('''
declare options "[midi:on][nvoices:8]";
import("stdfaust.lib");
freq = hslider("freq", 440, 20, 20000, 0.01);
gain = hslider("gain", 0.5, 0, 1, 0.01);
gate = button("gate");
cutoff = hslider("cutoff", 1400, 100, 12000, 1);
res = hslider("res", 0.35, 0, 1, 0.01);
det = 0.007;
saws = os.sawtooth(freq*(1-det)) + os.sawtooth(freq) + os.sawtooth(freq*(1+det)) + os.sawtooth(freq*0.5);
envA = en.adsr(0.02, 0.35, 0.65, 0.5, gate);
envF = en.adsr(0.01, 0.5, 0.3, 0.4, gate);
voice = saws*0.22 : ve.moogLadder(min(0.9, cutoff*(1+3*envF)/(ma.SR/2)), 1.0+6.0*res) * envA * gain;
process = voice <: _,_;
effect = _,_;
''')
for i, n in enumerate([53, 56, 60, 65, 49, 53, 56, 61]):
    syn.add_midi_note(n, 100, i * 1.0, 1.4)
eng.load_graph([(syn, [])])
_, w = timed("C faust poly synth 8 notes, 9.4 s", lambda: eng.render(9.4))
ys = eng.get_audio().T
print(f"    synth out {ys.shape}, peak {np.abs(ys).max():.2f}, RTF {w/9.4:.3f}")
sf.write(f"{S}/test/daw_faust_synth.wav", ys / max(1e-9, np.abs(ys).max()) * 0.8, SR, subtype="PCM_24")
print("RSS peak %.0f MB" % (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))
