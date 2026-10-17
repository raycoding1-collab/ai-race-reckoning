#!/usr/bin/env python3
"""compare.py A.json B.json -> markdown before/after table (B - A)."""
import json, sys
A, B = (json.load(open(p)) for p in sys.argv[1:3])


def fmt(v, p): return "-" if v is None else f"{v:.{p}f}"


def row(name, a, b, p, better=None):
    d = None if a is None or b is None else b - a
    mark = ""
    if d is not None and better and abs(d) > 10 ** -p:
        mark = " ok" if (d > 0) == (better == "up") else " WORSE"
    return f"| {name} | {fmt(a,p)} | {fmt(b,p)} | {'-' if d is None else f'{d:+.{p}f}'}{mark} |"


print(f"### {A['label']} -> {B['label']}\n\n| metric | {A['label']} | {B['label']} | delta |\n|---|---|---|---|")
wa, wb = A["whole"], B["whole"]
for k, n, p, bt in [("lufs", "LUFS", 1, None), ("true_peak_dbtp", "true peak dBTP", 1, "down"), ("crest_db", "crest dB", 1, None),
                    ("wer", "WER", 2, "down"), ("clap_gap", "CLAP singer-robotic", 3, "up"), ("clap_muddy", "CLAP muddy", 3, "down"),
                    ("ced_singing", "CED Singing", 2, "up"), ("ced_female_singing", "CED Female singing", 2, "up")]:
    print(row(n, wa.get(k), wb.get(k), p, bt))
for k in wa["bands"]: print(row(f"band {k} %", 100 * wa["bands"][k], 100 * wb["bands"][k], 1))
ka, kb = wa["kick"], wb["kick"]
print(row("kick matched %", ka["pct_matched"], kb["pct_matched"], 0, "up"))
print(row("kick median abs ms", ka["median_abs_ms"], kb["median_abs_ms"], 1, "down"))
print(row("kick max abs ms", ka["max_abs_ms"], kb["max_abs_ms"], 1, "down"))
if "pitch" in wa and "pitch" in wb: print(row("pitch median abs cents", wa["pitch"]["median_abs_cents"], wb["pitch"]["median_abs_cents"], 0, "down"))
print("\n| section | LUFS | WER | gap | muddy | Sing | FSing |\n|---|---|---|---|---|---|---|")
sb = {r["section"]: r for r in B["sections"]}
for ra in A["sections"]:
    rb = sb.get(ra["section"])
    if not rb: continue
    def c(k, p):
        a, b = ra[k], rb[k]
        return f"{fmt(a,p)}>{fmt(b,p)}" + ("" if a is None or b is None else f" ({b-a:+.{p}f})")
    print(f"| {ra['section']} | {c('lufs',1)} | {c('wer',2)} | {c('clap_gap',3)} | {c('clap_muddy',3)} | {c('ced_singing',2)} | {c('ced_female_singing',2)} |")
