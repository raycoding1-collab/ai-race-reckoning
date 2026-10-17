"""CPU cost of mastering tools on the real 142 s song (READ-ONLY use of the repo mp3) + matchering with a stand-in reference."""
import time, resource, os, subprocess, logging
import numpy as np, soundfile as sf, pyloudnorm as pyln, pedalboard as pb
import matchering as mg

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
SONG = "/home/user/ai-race-reckoning/chip-race-video/audio/silicon_shield.mp3"
W = f"{S}/test/full"; os.makedirs(W, exist_ok=True)

def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF); return r.ru_utime + r.ru_stime
def timed(label, fn):
    w, c = time.perf_counter(), cpu(); r = fn(); w, c = time.perf_counter() - w, cpu() - c
    print(f"  {label:46s} wall {w:6.2f}s cpu {c:6.2f}s"); return r

# 1) decode (ffmpeg -> wav, 24-bit/44.1k) ; also libsndfile mp3 direct
timed("ffmpeg mp3 -> wav", lambda: subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SONG, "-c:a", "pcm_s24le", f"{W}/song.wav"], check=True))
x, sr = timed("soundfile read mp3 directly", lambda: sf.read(SONG, dtype="float32", always_2d=True))
print(f"  song {len(x)/sr:.1f}s {sr} Hz {x.shape[1]} ch")
meter = pyln.Meter(sr)
l = timed("pyloudnorm integrated LUFS (142 s)", lambda: meter.integrated_loudness(x))
print(f"    song integrated loudness {l:.1f} LUFS, sample peak {20*np.log10(np.abs(x).max()):.1f} dBFS")

# 2) pedalboard master chain on the full song
master = pb.Pedalboard([pb.HighpassFilter(28), pb.LowShelfFilter(90, 1.0, 0.7), pb.PeakFilter(320, -1.0, 1.0),
                        pb.HighShelfFilter(9500, 1.5, 0.7), pb.Compressor(-16, 2.0, 30, 150), pb.Reverb(0.3, 0.5, 0.05, 0.95)])
y = timed("pedalboard 6-plugin master chain (142 s)", lambda: master(np.ascontiguousarray(x.T), sr)).T

# 3) stand-in reference: our mastered 15 s test (B_pro_gu) tiled to ~60 s (a real run uses a commercial track the user supplies)
ref, rsr = sf.read(f"{S}/test/mix/B_pro_gu.wav", dtype="float32")
ref = np.tile(ref, (4, 1))
sf.write(f"{W}/ref.wav", ref, rsr, subtype="PCM_24")
print(f"  stand-in reference {len(ref)/rsr:.0f}s at {meter.integrated_loudness(ref):.1f} LUFS")
logging.disable(logging.CRITICAL)
timed("matchering.process (142 s target, 60 s ref)", lambda: mg.process(
    target=f"{W}/song.wav", reference=f"{W}/ref.wav",
    results=[mg.pcm24(f"{W}/song_matchered.wav")]))
z, zsr = sf.read(f"{W}/song_matchered.wav", dtype="float32")
print(f"    matchering out: {meter.integrated_loudness(z):.1f} LUFS, sample peak {20*np.log10(np.abs(z).max()):.2f} dBFS")
print("RSS peak %.0f MB" % (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024))
