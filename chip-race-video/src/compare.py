import sys, numpy as np, soundfile as sf
def ltas(path, a=None, b=None):
    x, sr = sf.read(path); x = x.mean(1) if x.ndim > 1 else x
    if a is not None: x = x[int(a*sr):int(b*sr)]
    n = 4096; fr = np.lib.stride_tricks.sliding_window_view(x, n)[::2048] * np.hanning(n)
    P = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(0); f = np.fft.rfftfreq(n, 1/sr)
    edges = [20, 40, 60, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000]
    bands = [10*np.log10(P[(f>=lo)&(f<hi)].sum()+1e-12) for lo, hi in zip(edges[:-1], edges[1:])]
    bands = np.array(bands); return edges, bands - bands.max()
e, r = ltas(sys.argv[1], 24, 59)   # reference chorus/verse section
_, m = ltas(sys.argv[2], 22.5, 37.5)  # my chorus
print("band(Hz)     ref   mine  diff")
for lo, hi, a, b in zip(e[:-1], e[1:], r, m):
    print(f"{lo:5d}-{hi:<6d} {a:6.1f} {b:6.1f} {b-a:+5.1f}")
