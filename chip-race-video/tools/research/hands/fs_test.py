import sys, time, ctypes.util as cu, numpy as np, resource
L="/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands/dl/debx/fluid/usr/lib/x86_64-linux-gnu"
_orig = cu.find_library
cu.find_library = lambda n: f"{L}/libfluidsynth.so.3" if "fluidsynth" in n else _orig(n)
import fluidsynth
S="/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
for name, p in [("GeneralUser-GS.sf2", f"{S}/dl/sf/GeneralUser-GS.sf2"), ("MuseScore_General_Full.sf3", f"{S}/dl/debx/msg/usr/share/sounds/sf3/MuseScore_General_Full.sf3")]:
    t = time.perf_counter(); c = time.process_time()
    fs = fluidsynth.Synth(samplerate=44100.0)
    fs.setting("synth.reverb.active", 0); fs.setting("synth.chorus.active", 0)
    sfid = fs.sfload(p); fs.program_select(0, sfid, 0, 89)
    lw, lc = time.perf_counter() - t, time.process_time() - c
    for k in (53, 56, 60, 65, 41, 44, 49, 51): fs.noteon(0, k, 100)
    t = time.perf_counter(); c = time.process_time()
    a = fs.get_samples(44100 * 5)
    rw, rc = time.perf_counter() - t, time.process_time() - c
    x = np.asarray(a, dtype=np.float32).reshape(-1, 2) / 32768
    print(f"fluidsynth 2.3.4 (Ubuntu libs) {name:28s} load wall {lw:5.2f}s cpu {lc:5.2f}s | render 5 s x 8 voices wall {rw*1000:5.0f} ms ({5/rw:4.0f}x rt) | peak {np.abs(x).max():.2f}")
    fs.delete()
