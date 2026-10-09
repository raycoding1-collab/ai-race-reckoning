"""Render each lyric line with Festival (HTS voice) and parse phone/syllable timings."""
import os, subprocess, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import song

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMPL = open(os.path.join(ROOT, "src", "festdump.scm")).read()
VOWELS = set("aa ae ah ao aw ax axr ay eh er ey ih ix iy ow oy uh uw".split())


def render(idx, text):
    out = os.path.join(ROOT, "build", "tts", f"line{idx:02d}")
    scm = TMPL.replace("LINE_TEXT", json.dumps(text)).replace("OUT_PATH", json.dumps(out))
    path = out + ".scm"
    open(path, "w").write(scm)
    subprocess.run(["festival", "-b", path], check=True)
    return out


def parse(out):
    """-> list of words; word = list of syllables; syllable = list of (phone, start, end)."""
    rows = [l.split() for l in open(out + ".txt")]
    words, prev_end, cur_word, cur_syl = [], 0.0, None, None
    for ph, end, w, pos in rows:
        end = float(end)
        if ph == "pau":
            prev_end = end
            cur_word = None
            continue
        pos = int(pos)
        if cur_word is None or pos < cur_syl or (pos == 0 and cur_syl != 0) or w != cur_word_name:
            words.append([[]]); cur_word = words[-1]; cur_word_name = w; cur_syl = pos
        elif pos != cur_syl:
            cur_word.append([]); cur_syl = pos
        cur_word[-1].append((ph, prev_end, end))
        prev_end = end
    return words


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build", "tts"), exist_ok=True)
    ok = True
    for i, line in enumerate(song.LINES):
        out = render(i, song.line_text(line))
        words = parse(out)
        if len(words) != len(line["words"]):
            print(f"line {i}: word count {len(words)} != {len(line['words'])}"); ok = False
        for (disp, tts, notes), syls in zip(line["words"], words):
            n = len(song.parse_notes(notes))
            flag = "" if n == len(syls) else "   <-- MISMATCH"
            if flag: ok = False
            print(f"{i:2d} {disp:12s} notes={n} syls={len(syls)} {['-'.join(p[0] for p in s) for s in syls]}{flag}")
    print("ALL OK" if ok else "FIX NEEDED")
