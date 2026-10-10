#!/usr/bin/env python3
"""LAION-CLAP (630k+fusion) zero-shot text<->audio scoring on CPU with onnxruntime only (no torch).

ONNX weights: https://storage.googleapis.com/ailia-models/clap/  (ailia-models export)  tokenizer: vocab.json+merges.txt
usage: clap_score.py <clap_dir> <wav> [--db10|--db20] [--win 10 --hop 5] [--sanity]
Prints per-group softmax(100*cos) over prompt sets, plus raw cosines. Reports CPU/wall time.
"""
import sys, time
import numpy as np
import librosa
import onnxruntime as ort
import json
from tokenizers import Tokenizer, models, pre_tokenizers   # plain `tokenizers` (transformers 5.x changed RobertaTokenizer args)

d, wav = sys.argv[1], sys.argv[2]
DB = 20.0 if "--db20" in sys.argv else 10.0          # 10 = original laion_clap (torchaudio power->dB); 20 = what ailia's librosa path does
WIN = float(sys.argv[sys.argv.index("--win") + 1]) if "--win" in sys.argv else 10.0
HOP = float(sys.argv[sys.argv.index("--hop") + 1]) if "--hop" in sys.argv else 5.0
SANITY = "--sanity" in sys.argv

so = ort.SessionOptions(); so.intra_op_num_threads = 4
c0, w0 = time.process_time(), time.perf_counter()
a_sess = ort.InferenceSession(f"{d}/CLAP_audio_LAION-Audio-630K_with_fusion.onnx", so, providers=["CPUExecutionProvider"])
t_sess = ort.InferenceSession(f"{d}/CLAP_text_text_branch_RobertaModel_roberta-base.onnx", so, providers=["CPUExecutionProvider"])
p_sess = ort.InferenceSession(f"{d}/CLAP_text_projection_LAION-Audio-630K_with_fusion.onnx", so, providers=["CPUExecutionProvider"])
_v = json.load(open(f"{d}/vocab.json"))
assert (_v["<s>"], _v["<pad>"], _v["</s>"], _v["<unk>"]) == (0, 1, 2, 3)
_m = [tuple(l.split()) for l in open(f"{d}/merges.txt", encoding="utf8").read().split("\n")[1:] if l.strip()]
tok = Tokenizer(models.BPE(_v, _m))
tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
print(f"load cpu={time.process_time()-c0:.1f}s wall={time.perf_counter()-w0:.1f}s | inputs audio={[i.name for i in a_sess.get_inputs()]} "
      f"text={[i.name for i in t_sess.get_inputs()]} proj={[i.name for i in p_sess.get_inputs()]}")


def mel_feat(y):                                      # y: 480000 samples @48k -> (1001, 64) log-mel
    m = librosa.feature.melspectrogram(y=y, sr=48000, n_fft=1024, hop_length=480, win_length=1024, center=True,
                                       pad_mode="reflect", power=2.0, n_mels=64, norm=None, htk=True, fmin=50, fmax=14000)
    return (DB * np.log10(np.maximum(m, 1e-10))).T.astype(np.float32)


def audio_embed(y):
    y = (np.clip(y, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32767.0
    m = mel_feat(y)
    mf = np.stack([m, m, m, m], 0)[None]
    e = a_sess.run(None, {"longer": np.array([[True]]), "mel_fusion": mf})[0][0]
    return e / np.linalg.norm(e)


def text_embed(txts):
    enc = [[0] + tok.encode(t).ids[:75] + [2] for t in txts]            # <s> ... </s>
    ids = np.array([e + [1] * (77 - len(e)) for e in enc], dtype=np.int64)
    am = (ids != 1).astype(np.int64)
    out = t_sess.run(None, {"input_ids": ids, "attention_mask": am})
    e = p_sess.run(None, {"x": out[1]})[0]
    return e / np.linalg.norm(e, axis=1, keepdims=True)


GROUPS = {
    "genre/mood": ["dark minor-key electropop with female vocals and driving synths", "upbeat happy bubblegum pop",
                   "heavy metal with distorted guitars", "orchestral classical music", "acoustic folk guitar and voice",
                   "ambient drone with no beat"],
    "vocal": ["a clear female singer singing a catchy melody", "a robotic text-to-speech voice reading words",
              "an instrumental track with no vocals", "a crowd shouting", "a person talking"],
    "production": ["professionally mixed and mastered studio pop production", "a low-quality amateur home recording",
                   "harsh distorted noisy audio", "muddy boomy bass-heavy mix with buried vocals",
                   "cheap sounding midi synthesizer music"],
    "energy": ["a powerful catchy chorus with a big drop", "a quiet sparse verse", "a build-up riser before the drop"],
}
if SANITY:
    GROUPS = {"sanity": ["a cat meowing", "a dog barking", "a pig oinking", "water trickling", "someone whistling",
                         "a cappella singing", "finger snapping", "a person talking"]}

y, _ = librosa.load(wav, sr=48000, mono=True)
n = int(WIN * 48000); h = int(HOP * 48000)
starts = list(range(0, max(1, len(y) - n + 1), h)) or [0]
c0, w0 = time.process_time(), time.perf_counter()
A = []
for s in starts:
    seg = y[s:s + n]
    if len(seg) < n:                                  # laion_clap 'repeatpad'
        seg = np.pad(np.tile(seg, int(n / len(seg))), (0, n - len(seg) * int(n / len(seg))))
    A.append(audio_embed(seg))
A = np.array(A)
ac, aw = time.process_time() - c0, time.perf_counter() - w0
print(f"audio: {len(starts)} windows x {WIN:.0f}s (dB={DB:.0f}) cpu={ac:.1f}s wall={aw:.1f}s  ({ac/len(starts):.2f}s cpu/window)")
c0, w0 = time.process_time(), time.perf_counter()
allp = [p for g in GROUPS.values() for p in g]
T = text_embed(allp)
print(f"text: {len(allp)} prompts cpu={time.process_time()-c0:.1f}s wall={time.perf_counter()-w0:.1f}s")
if "--series" in sys.argv:
    import json as _j
    _j.dump({"starts_s": [st / 48000 for st in starts], "win_s": WIN, "prompts": allp, "cos": (A @ T.T).round(4).tolist(),
             "audio_cpu_s": ac}, open(sys.argv[sys.argv.index("--series") + 1], "w"))
mean_a = A.mean(0); mean_a /= np.linalg.norm(mean_a)
k = 0
for g, ps in GROUPS.items():
    Tg = T[k:k + len(ps)]; k += len(ps)
    cos = Tg @ mean_a
    sm = np.exp(100 * (cos - cos.max())); sm /= sm.sum()
    print(f"[{g}]")
    for p, c, s in sorted(zip(ps, cos, sm), key=lambda z: -z[1]):
        print(f"   p={s:.2f} cos={c:+.3f}  {p}")
if len(starts) > 1 and not SANITY:
    g0 = list(GROUPS)[0]
    ps = GROUPS[g0]; Tg = T[:len(ps)]
    print(f"per-window cos for '{ps[0]}':", " ".join(f"{float(Tg[0] @ a):+.3f}" for a in A))
