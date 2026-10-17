#!/usr/bin/env python3
"""song_eval_ours.py - accuracy of song_perceive.py on OUR song, against the ground truth in src/song.py,
data/lyrics.json and data/events.json.

    python3 tools/perceive/song_eval_ours.py [--label ours]

Reads build/perceive/<label>/song.json (+ cache/chords.json for the raw chord labels), prints a compact table and writes
build/perceive/<label>/accuracy.json.
"""
import argparse
import collections
import json
import os
import re
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
import song as S  # noqa: E402

O = -12  # the voice sings an octave below the written (lead-synth) register (src/sing.py)
BAR = S.BAR


def norm(s):
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^\w\s']", " ", s)
    s = re.sub(r"'s\b", "s", s)
    s = s.replace("'", "")
    return re.sub(r"\s+", " ", s).strip()


def gt_syllables(lines):
    out = []
    for l in lines:
        for w in l["words"]:
            for (a, b), m in zip(w["syl"], w["midi"]):
                out.append((a, b, m, w["w"], l.get("style", "sung")))
    return sorted(out)


def match_notes(gt, det, octave=O, tol_t=0.1, tol_p=1.0, pc_only=False):
    used, hit = set(), 0
    for (a, b, m, w, st) in gt:
        best = None
        for j, d in enumerate(det):
            if j in used:
                continue
            dt = abs(d["t"] - a)
            if dt > tol_t:
                continue
            dp = abs(d["midi"] - (m + octave))
            if pc_only:
                dp = min(dp % 12, 12 - dp % 12)
            if dp > tol_p:
                continue
            c = dt + 0.05 * dp
            if best is None or c < best[0]:
                best = (c, j)
        if best:
            used.add(best[1])
            hit += 1
    return hit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="ours")
    a = ap.parse_args()
    d = os.path.join(ROOT, "build", "perceive", a.label)
    sj = json.load(open(os.path.join(d, "song.json")))
    lyr = json.load(open(os.path.join(ROOT, "data", "lyrics.json")))["lines"]
    ev = json.load(open(os.path.join(ROOT, "data", "events.json")))
    acc = {}

    # ---- tempo / beats
    t = sj["tempo"]
    bs = np.array(sj["beats"]["bar_starts"])
    gt_bar = np.round(bs / BAR) * BAR
    err = (bs[:-1] - gt_bar[:-1]) * 1000
    acc["tempo"] = dict(bpm=t["bpm"], gt=S.BPM, abs_err=abs(t["bpm"] - S.BPM), beats_per_bar=t["beats_per_bar"],
                        first_downbeat_s=t["first_downbeat"], bar_start_err_ms_median=float(np.median(np.abs(err))),
                        bar_start_err_ms_max=float(np.abs(err).max()), n_bars=t["n_bars"], gt_bars=S.TOTAL_BARS)

    # ---- key
    k = sj["key"]
    chg = [(c["key"], c["start_bar"]) for c in k.get("changes", [])]
    acc["key"] = dict(detected=k["name"], gt=S.KEY, relative=k["relative"], global_ok=(k["name"] == "F minor"),
                      changes=chg, lift_found=any(c[0] == "G minor" and abs(c[1] - 62) <= 1 for c in chg))

    # ---- chords
    gt = S.CHORDS
    chords = sj["chords"]["bars"]
    raw = json.load(open(os.path.join(d, "cache", "chords.json")))["bars"]

    def pcq(name):
        m = re.match(r"([A-G][b#]?)(m?)$", name)
        if not m:
            return None
        pc = {"C": 0, "Db": 1, "C#": 1, "D": 2, "Eb": 3, "D#": 3, "E": 4, "F": 5, "Gb": 6, "F#": 6, "G": 7, "Ab": 8, "G#": 8, "A": 9, "Bb": 10,
              "A#": 10, "B": 11}[m.group(1)]
        return pc, ("min" if m.group(2) else "maj")

    def gt_pcq(c):
        return S.NOTE_IDX[c[0]], ("min" if c[1] == "m" else "maj")

    def raw_pcq(label):
        if label in ("N", "X", ""):
            return None
        r, _, q = label.partition(":")
        x = pcq(r + ("m" if q.startswith("min") else ""))
        return x

    fin_ok = raw_ok = root_ok = 0
    sec_names = {b: S.section_at(b) for b in range(S.TOTAL_BARS)}
    skip_sections = {"intro", "build"}                       # the arrangement does not play the loop there (F drone; riser + gap)
    app = [b for b in range(S.TOTAL_BARS) if sec_names[b] not in skip_sections]
    fin_app = raw_app = 0
    for b in range(S.TOTAL_BARS):
        g = gt_pcq(gt[b])
        f = (chords[b]["root"], chords[b]["quality"]) if chords[b]["root"] is not None else None
        r_ = raw_pcq(raw[b]["label"])
        fin_ok += f == g
        raw_ok += r_ == g
        root_ok += (f is not None and f[0] == g[0])
        if b in app:
            fin_app += f == g
            raw_app += r_ == g
    acc["chords"] = dict(bars=S.TOTAL_BARS, final_exact=fin_ok / S.TOTAL_BARS, raw_exact=raw_ok / S.TOTAL_BARS, final_root=root_ok / S.TOTAL_BARS,
                         applicable_bars=len(app), final_exact_applicable=fin_app / len(app), raw_exact_applicable=raw_app / len(app),
                         n_corrected=int(sum(1 for c in chords if c.get("corrected"))))

    # ---- lyrics
    import jiwer
    ref = norm(" ".join(l["text"] for l in lyr))
    hyp = norm(" ".join(p["text"] for p in sj["lyrics"]["phrases"]))
    o = jiwer.process_words(ref, hyp)
    sung_ref = norm(" ".join(l["text"] for l in lyr if l.get("style") == "sung"))
    allw = [(w["start"], norm(w["w"])) for p in sj["lyrics"]["phrases"] for w in p["words"]]
    sung_hyp = []
    for l in lyr:
        if l.get("style") == "sung":
            sung_hyp += [x for t_, x in allw if l["start"] - 0.3 <= t_ < l["end"] + 0.1 and x]
    o2 = jiwer.process_words(sung_ref, " ".join(sung_hyp))
    # word start-time error (token level)
    rtok = [(tk, w["start"]) for l in lyr for w in l["words"] for tk in norm(w["w"]).split()]
    htok = [(tk, w["start"]) for p in sj["lyrics"]["phrases"] for w in p["words"] for tk in norm(w["w"]).split()]
    oo = jiwer.process_words(" ".join(t_ for t_, _ in rtok), " ".join(t_ for t_, _ in htok))
    errs = []
    for ch in oo.alignments[0]:
        if ch.type == "equal":
            for q in range(ch.ref_end_idx - ch.ref_start_idx):
                errs.append(htok[ch.hyp_start_idx + q][1] - rtok[ch.ref_start_idx + q][1])
    errs = np.array(errs)
    acc["lyrics"] = dict(wer=o.wer, ref_words=len(ref.split()), sub=o.substitutions, dele=o.deletions, ins=o.insertions, wer_sung_lines=o2.wer,
                         asr=sj["asr_model"], word_time_err_median_s=float(np.median(errs)), word_time_err_mean_abs_s=float(np.abs(errs).mean()),
                         word_time_within_150ms=float((np.abs(errs) < 0.15).mean()), word_time_within_300ms=float((np.abs(errs) < 0.3).mean()),
                         matched_words=len(errs))

    # ---- melody
    syl = gt_syllables(lyr)
    det = [n for n in sj["melody"]["notes"] if not n.get("outlier")]
    sung = [x for x in syl if x[4] != "whisper"]
    acc["melody"] = dict(
        gt_notes=len(syl), detected=len(det),
        match_1st_100ms=match_notes(syl, det) / len(syl),
        match_1st_100ms_pitched_lines=match_notes(sung, det) / len(sung),
        match_pitchclass_100ms=match_notes(syl, det, pc_only=True) / len(syl),
        match_1st_150ms=match_notes(syl, det, tol_t=0.15) / len(syl),
        match_1st_50ms=match_notes(syl, det, tol_t=0.05) / len(syl),
        match_octave0_100ms=match_notes(syl, det, octave=0) / len(syl),
        note_range=sj["melody"]["range"], vibrato=sj["melody"]["vibrato"])

    # ---- structure
    gt_cuts = sorted({a_ for _, a_, _ in S.SECTIONS} | {S.TOTAL_BARS})
    det_cuts = sorted({s["start_bar"] for s in sj["sections"]} | {sj["sections"][-1]["end_bar"]})
    inner_gt = [c for c in gt_cuts if 0 < c < S.TOTAL_BARS]
    inner_det = [c for c in det_cuts if 0 < c < S.TOTAL_BARS]

    def prf(tol):
        tp_p = sum(any(abs(x - y) <= tol for y in inner_gt) for x in inner_det)
        tp_r = sum(any(abs(x - y) <= tol for x in inner_det) for y in inner_gt)
        p = tp_p / max(1, len(inner_det))
        r = tp_r / max(1, len(inner_gt))
        return dict(precision=p, recall=r, f1=2 * p * r / max(1e-9, p + r))

    fam = {"intro": "intro", "verse": "verse", "pre": "pre-chorus", "chorus": "chorus", "post": "post-chorus", "bridge": "bridge", "build": "build",
           "outro": "outro"}

    def gt_family(b):
        n = S.section_at(b)
        return fam.get(re.sub(r"\d+$", "", n), n)

    det_label = {}
    for s_ in sj["sections"]:
        for b in range(s_["start_bar"], s_["end_bar"]):
            det_label[b] = s_["label"]
    lab_ok = sum(det_label.get(b) == gt_family(b) for b in range(S.TOTAL_BARS)) / S.TOTAL_BARS
    # letters: same GT family <-> same letter (pairwise agreement over sections)
    gt_secs = S.SECTIONS
    det_letter = {}
    for s_ in sj["sections"]:
        for b in range(s_["start_bar"], s_["end_bar"]):
            det_letter[b] = s_["letter"]
    pairs = agree = 0
    for i in range(len(gt_secs)):
        for j in range(i + 1, len(gt_secs)):
            fi, fj = gt_family(gt_secs[i][1]), gt_family(gt_secs[j][1])
            same_gt = fi == fj and fi in ("verse", "chorus", "post-chorus")
            li, lj = det_letter.get(gt_secs[i][1]), det_letter.get(gt_secs[j][1])
            pairs += 1
            agree += (same_gt == (li == lj))
    acc["structure"] = dict(gt_boundaries=inner_gt, detected_boundaries=inner_det, tol0=prf(0), tol1=prf(1), role_label_accuracy_per_bar=lab_ok,
                            letter_pair_agreement=agree / pairs, sections=[(s_["letter"], s_["name"], s_["start_bar"], s_["end_bar"]) for s_ in sj["sections"]])

    # ---- drums (step level, 16 steps per bar)
    st = BAR / 16
    gts = {k: set() for k in "KSH"}
    for key, name in (("K", "kick"), ("S", "snare"), ("H", "hat")):
        for t_ in ev[name]:
            kk = int(round(t_ / st))
            gts[key].add((kk // 16, kk % 16))
    det_s = {k: set() for k in "KSH"}
    for b in sj["drums"]["bars"]:
        if b["bar"] >= S.TOTAL_BARS:
            continue
        for key, part in zip("KSH", b["raw"].split(" | ")):
            for si, ch in enumerate(part):
                if ch != ".":
                    det_s[key].add((b["bar"], si))
    dr = {}
    for k in "KSH":
        tp = len(det_s[k] & gts[k])
        p = tp / max(1, len(det_s[k]))
        r = tp / max(1, len(gts[k]))
        dr[k] = dict(precision=p, recall=r, f1=2 * p * r / max(1e-9, p + r), detected=len(det_s[k]), gt=len(gts[k]))
    acc["drums"] = dr

    # ---- bass: pitch class of the per-beat note vs the chord root
    n_all = ok_all = n_tr = ok_tr = 0
    for p in sj["bass"]["per_beat"]:
        b = p["bar"]
        if b < 0 or b >= S.TOTAL_BARS or p["midi"] is None or sec_names[b] == "intro":
            continue
        root = S.NOTE_IDX[gt[b][0]]
        n_all += 1
        ok_all += (p["midi"] % 12 == root)
        if p.get("source") == "tracked":
            n_tr += 1
            ok_tr += (p["midi"] % 12 == root)
    acc["bass"] = dict(beats=n_all, root_match=ok_all / max(1, n_all), tracked_beats=n_tr, tracked_root_match=ok_tr / max(1, n_tr),
                       inferred_share=1 - n_tr / max(1, n_all))

    acc["runtime_s"] = sj.get("runtime_s")
    json.dump(acc, open(os.path.join(d, "accuracy.json"), "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))

    f = lambda x: f"{100 * x:.1f}%"
    print(f"tempo      {acc['tempo']['bpm']:.2f} BPM (gt {S.BPM}), bar-start err median {acc['tempo']['bar_start_err_ms_median']:.0f} ms, bars {acc['tempo']['n_bars']} (gt {S.TOTAL_BARS}+tail)")
    print(f"key        {acc['key']['detected']} (gt {S.KEY}); relative {acc['key']['relative']}; changes {acc['key']['changes']}; G-minor lift at bar 63: {acc['key']['lift_found']}")
    c = acc["chords"]
    print(f"chords     bar exact: final {f(c['final_exact'])}, raw madmom {f(c['raw_exact'])}, root-only {f(c['final_root'])}; "
          f"excluding intro+build ({c['applicable_bars']} bars): final {f(c['final_exact_applicable'])}, raw {f(c['raw_exact_applicable'])}; corrected {c['n_corrected']} bars")
    l = acc["lyrics"]
    print(f"lyrics     WER {f(l['wer'])} ({l['sub']}S {l['dele']}D {l['ins']}I / {l['ref_words']}), sung lines only {f(l['wer_sung_lines'])}; word start error median "
          f"{l['word_time_err_median_s'] * 1000:.0f} ms, {f(l['word_time_within_150ms'])} within 150 ms, {f(l['word_time_within_300ms'])} within 300 ms ({l['matched_words']} words)")
    m = acc["melody"]
    print(f"melody     notes matched (<=1 semitone, <=100 ms, O={O}): {f(m['match_1st_100ms'])} of {m['gt_notes']} ({f(m['match_1st_100ms_pitched_lines'])} on pitched lines; "
          f"pitch-class only {f(m['match_pitchclass_100ms'])}; 150 ms {f(m['match_1st_150ms'])}; 50 ms {f(m['match_1st_50ms'])}; wrong octave O=0: {f(m['match_octave0_100ms'])})")
    s = acc["structure"]
    print(f"structure  boundaries exact P/R/F1 {s['tol0']['precision']:.2f}/{s['tol0']['recall']:.2f}/{s['tol0']['f1']:.2f}, +-1 bar F1 {s['tol1']['f1']:.2f}; role label per bar {f(s['role_label_accuracy_per_bar'])}; "
          f"letter pair agreement {f(s['letter_pair_agreement'])}")
    d_ = acc["drums"]
    print("drums      step F1 (P/R): " + ", ".join(f"{k} {d_[k]['f1']:.2f} ({d_[k]['precision']:.2f}/{d_[k]['recall']:.2f})" for k in "KSH"))
    b_ = acc["bass"]
    print(f"bass       per-beat pitch class == chord root: {f(b_['root_match'])} ({b_['beats']} beats; {f(b_['inferred_share'])} inferred from the chord root); tracked only {f(b_['tracked_root_match'])}")


if __name__ == "__main__":
    main()
