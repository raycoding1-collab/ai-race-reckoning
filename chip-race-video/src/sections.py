import sys, numpy as np, soundfile as sf
sys.path.insert(0, 'src'); import song
from music import lufs
x, sr = sf.read(sys.argv[1]); x = x.T
for name, a, b in song.SECTIONS:
    print(f"{name}:{lufs(x[:, int(a*song.BAR*sr):int(b*song.BAR*sr)]):.1f}", end="  ")
print()
