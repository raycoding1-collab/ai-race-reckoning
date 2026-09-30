#!/usr/bin/env python3
"""Build Where the Sun Rises (published at /japan/) from nihon/src.

    python3 nihon/build.py              # from the repo root
    python3 nihon/build.py --artifact   # also write a preview page for claude.ai

The page is assembled from src/parts/*.html in name order. The build
  - numbers citations written as {{fn:key}} or {{fn:a,b}} and writes the source list,
  - checks every quotation: those marked data-q="aozora:NAME" against the
    public-domain texts in src/text/aozora, those marked data-q="hi:N" against
    the Hyakunin Isshu, and those marked data-q="web:KEY" for a citation of KEY,
  - cross-checks three independent transcriptions of the Hyakunin Isshu,
  - generates the kana chart, the anthology reader, the karuta game and the
    era-name data,
  - subsets the Japanese fonts to the characters the page uses,
  - bundles and minifies CSS and JS with esbuild and fingerprints every asset.
Prints are rendered and exported separately (see README.md).
"""
import argparse
import datetime
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "nihon"
SRC = HERE / "src"
TEXT = SRC / "text"
OUT = ROOT / "japan"
NM = HERE / "node_modules"
ESBUILD = NM / ".bin" / "esbuild"
TITLE = "Where the Sun Rises"
SITE_URL = "https://raycoding1-collab.github.io/ai-race-reckoning/japan"
DESCRIPTION = ("A history of Japan in twelve woodblock prints, from the first potters to the present, "
               "with the hundred poems of the Hyakunin Isshu in a new translation, a karuta game and a "
               "key to Japan’s era names.")
WPM = 230

sys.path.insert(0, str(HERE / "art"))


def esc(s):
    return html.escape(s, quote=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()[:10]


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


# ------------------------------------------------------------ Hyakunin Isshu
# Three independent transcriptions. A (ogura-hyakunin-isshu) is the base text;
# B (hyakunin-isshu) must agree with A word for word and kana for kana; C
# (kimariji_karuta) spells words differently, so only the poets are compared.
# The few slips in A are corrected here, each against B or C and the standard
# editions.
HI_FIX = {
    33: {"ruby": {3: "しづごころなく"}},          # しづ心: shizugokoro (B agrees with the standard reading)
    76: {"text": {3: "雲ゐにまがふ"}},             # 雲ゐ, as in A's own kana and in C (雲居)
    18: {"author": "藤原敏行朝臣"},                # the name as given in the anthology (B, C)
    66: {"author": "大僧正行尊"},                  # not 前大僧正 (C)
    70: {"author": "良暹法師"},                    # 暹, not 選 (C)
}
POET_ALIAS = {"柿本人麿": "柿本人麻呂", "曾禰好忠": "曽禰好忠", "大貮三位": "大弐三位", "前大僧正慈圓": "前大僧正慈円",
              "権中納言匡房": "前権中納言匡房", "大僧正行尊": "大僧正行尊"}


def load_hyakunin():
    A = json.loads((TEXT / "data" / "ogura-hyakunin-isshu.json").read_text(encoding="utf-8"))
    B = json.loads((TEXT / "data" / "hyakunin-isshu.json").read_text(encoding="utf-8"))
    C = json.loads((TEXT / "data" / "kimariji-karuta.json").read_text(encoding="utf-8"))
    poems = []
    for i, a in enumerate(A):
        n = i + 1
        text = list(a["text"])
        ruby = list(a["ruby"])
        author = a["author"]["name"]
        fx = HI_FIX.get(n, {})
        for k, v in fx.get("text", {}).items():
            text[k] = v
        for k, v in fx.get("ruby", {}).items():
            ruby[k] = v
        author = fx.get("author", author)
        poems.append({"n": n, "text": text, "ruby": ruby, "author": author, "author_ruby": a["author"]["ruby"]})
    errors = []
    nospace = lambda s: re.sub(r"\s", "", s)
    for p, b, c in zip(poems, B, C):
        n = p["n"]
        if nospace("".join(p["text"])) != nospace(b["bodyKanji"]) and n != 76:
            errors.append(f"poem {n}: text differs from B")
        if nospace("".join(p["ruby"])) != nospace(b["bodyKana"]) and n != 33:
            errors.append(f"poem {n}: kana differ from B")
        names = {POET_ALIAS.get(x, x) for x in (p["author"], b["nameKanji"], c["poet"])}
        if len(names) > 1 and n not in HI_FIX:
            errors.append(f"poem {n}: poets differ {names}")
    if errors:
        raise SystemExit("Hyakunin Isshu transcriptions disagree:\n" + "\n".join(errors))
    # kimariji: the shortest opening that, as it is heard, identifies the poem
    # among all hundred. The poems are read aloud in modern pronunciation, so
    # を sounds as お, and は ひ ふ へ ほ inside a word as わ い う え お.
    def heard(s):
        out = []
        for i, ch in enumerate(s):
            ch = {"を": "お", "ゐ": "い", "ゑ": "え", "ぢ": "じ", "づ": "ず"}.get(ch, ch)
            if i > 0:
                ch = {"は": "わ", "ひ": "い", "ふ": "う", "へ": "え", "ほ": "お"}.get(ch, ch)
            out.append(ch)
        return "".join(out)
    kana = [nospace("".join(p["ruby"])) for p in poems]
    sound = [heard(k) for k in kana]
    for p, k, h in zip(poems, kana, sound):
        L = 1
        while any(o != h and o.startswith(h[:L]) for o in sound):
            L += 1
        p["kimariji"] = k[:L]
    agree = sum(1 for p, b in zip(poems, B) if p["kimariji"] == nospace(b["kimariji"]))
    # English
    en = {}
    cur = None
    for raw in (TEXT / "hyakunin.en.txt").read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("§"):
            num, _, poet = line[1:].partition("|")
            cur = int(num)
            en[cur] = {"poet": poet.strip(), "lines": [], "note": ""}
            continue
        if line.startswith("note:"):
            en[cur]["note"] = line[5:].strip()
        else:
            en[cur]["lines"].append(line.strip())
    assert sorted(en) == list(range(1, 101)), "100 translations expected"
    for p in poems:
        p.update(en[p["n"]])
    return poems, agree


HI, KIMARIJI_AGREE = load_hyakunin()


# ------------------------------------------------------------------ era names
def load_eras():
    """Era names with the Western year each began, from the Harumi open data,
    plus the two short eras it lacks (朱鳥 686, 天平感宝 749). During the
    division of the court, 1331 to 1392, eras are marked N or S."""
    rows = json.loads((TEXT / "data" / "harumi-years.json").read_text(encoding="utf-8"))
    first = {}
    conds = {}
    for r in rows:
        name = re.sub(r"[0-9]+$", "", r["nengo"])
        y = int(r["year"])
        if name not in first or y < first[name]:
            first[name] = y
        conds.setdefault(name, set()).add(r.get("condition", ""))
    first["朱鳥"] = 686
    first["天平感宝"] = 749
    south = {"元弘", "延元", "興国", "正平", "建徳", "文中", "天授", "弘和", "元中"}
    north = {"正慶", "暦応", "康永", "貞和", "観応", "文和", "延文", "康安", "貞治", "応安", "永和", "康暦", "永徳",
             "至徳", "嘉慶", "康応", "明徳"}
    for n in south:
        assert conds.get(n, set()) & {"南朝", "大覚寺統"}, n
    order = sorted(first.items(), key=lambda kv: (kv[1], kv[0] != "天平感宝"))
    eras = []
    for name, y in order:
        court = "S" if name in south else "N" if name in north else ""
        eras.append([name, y, court])
    # 天平感宝 began in 749 before 天平勝宝, which also began that year
    names = [e[0] for e in eras]
    i, j = names.index("天平感宝"), names.index("天平勝宝")
    if i > j:
        eras[i], eras[j] = eras[j], eras[i]
    readings = {x["names"][0]: x["names"][2] for x in json.loads((TEXT / "data" / "nengo-full-periods.json").read_text(encoding="utf-8"))}
    readings.update({"慶応": "Keiō", "大正": "Taishō", "昭和": "Shōwa", "令和": "Reiwa",
                     "大化": "Taika", "白雉": "Hakuchi", "朱鳥": "Shuchō", "大宝": "Taihō", "和銅": "Wadō",
                     "天平": "Tenpyō", "延暦": "Enryaku", "建武": "Kenmu", "応仁": "Ōnin", "天正": "Tenshō",
                     "慶長": "Keichō", "元弘": "Genkō", "明徳": "Meitoku"})
    for e in eras:
        e.append(readings.get(e[0], ""))
    return eras


ERAS = load_eras()


# ---------------------------------------------------------------- quotations
QUOTE_ERRORS = []
AOZORA = {
    "hojoki": "hojoki.txt", "tosa": "tosa-nikki.txt", "wajinden": "gishi-wajinden.txt",
    "constitution": "nihonkoku-kenpo.txt", "meiji-constitution": "dainippon-teikoku-kenpo.txt",
    "gakumon": "gakumon-no-susume.txt", "kojiki": "kojiki.txt",
}
JA_PUNCT = re.compile(r"[、。，．「」『』（）・：；！？\s　…―]")


def aozora_clean(t):
    t = re.sub(r"([一二三四五六七八九〇]+)［＃「\1」は行右小書き］", "", t)
    t = re.sub(r"《[^》]*》", "", t)
    t = re.sub(r"［＃[^］]*］", "", t)
    return t.replace("｜", "")


def ja_norm(s):
    return JA_PUNCT.sub("", s)


_AOZ_CACHE = {}


def check_quote(src, ja, figure_html, where):
    kind, _, ref = src.partition(":")
    if kind == "aozora":
        if ref not in AOZORA:
            QUOTE_ERRORS.append(f"{where}: unknown Aozora text {ref}")
            return
        if ref not in _AOZ_CACHE:
            _AOZ_CACHE[ref] = ja_norm(aozora_clean((TEXT / "aozora" / AOZORA[ref]).read_text(encoding="utf-8")))
        for seg in re.split(r"……", ja):
            s = ja_norm(seg)
            if s and s not in _AOZ_CACHE[ref]:
                QUOTE_ERRORS.append(f"{where}: not found in Aozora text {ref}: {seg}")
    elif kind == "hi":
        p = HI[int(ref) - 1]
        if ja_norm(ja) != ja_norm("".join(p["text"])):
            QUOTE_ERRORS.append(f"{where}: poem {ref} does not match: {ja}")
    elif kind == "web":
        if "{{fn:" not in figure_html or not re.search(r"\{\{fn:[^}]*\b" + re.escape(ref) + r"\b", figure_html):
            QUOTE_ERRORS.append(f"{where}: web quotation {ref} does not cite source {ref}")
    else:
        QUOTE_ERRORS.append(f"{where}: unknown quotation kind {src}")


def verify_quotes(page):
    n = 0
    for m in re.finditer(r'<figure class="q[^"]*" data-q="([^"]+)">(.*?)</figure>', page, re.S):
        src, body = m.group(1), m.group(2)
        ja = re.search(r'<p class="ja"[^>]*>(.*?)</p>', body, re.S)
        check_quote(src, strip_tags(ja.group(1)) if ja else "", body, f"figure {src}")
        n += 1
    return n


# ------------------------------------------------------------------ kana chart
# Each hiragana and the man'yōgana character it was written from, in the order
# of the Iroha poem (47 kana) followed by ん.
IROHA = "いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす"
KANA_SOURCE = {
    "あ": "安", "い": "以", "う": "宇", "え": "衣", "お": "於", "か": "加", "き": "幾", "く": "久", "け": "計", "こ": "己",
    "さ": "左", "し": "之", "す": "寸", "せ": "世", "そ": "曽", "た": "太", "ち": "知", "つ": "川", "て": "天", "と": "止",
    "な": "奈", "に": "仁", "ぬ": "奴", "ね": "祢", "の": "乃", "は": "波", "ひ": "比", "ふ": "不", "へ": "部", "ほ": "保",
    "ま": "末", "み": "美", "む": "武", "め": "女", "も": "毛", "や": "也", "ゆ": "由", "よ": "与", "ら": "良", "り": "利",
    "る": "留", "れ": "礼", "ろ": "呂", "わ": "和", "ゐ": "為", "ゑ": "恵", "を": "遠", "ん": "无",
}
ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o", "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so", "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no", "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo", "や": "ya", "ゆ": "yu", "よ": "yo", "ら": "ra", "り": "ri",
    "る": "ru", "れ": "re", "ろ": "ro", "わ": "wa", "ゐ": "wi", "ゑ": "we", "を": "wo", "ん": "n",
}
IROHA_LINES = [("いろはにほへと", "色は匂へど"), ("ちりぬるを", "散りぬるを"), ("わかよたれそ", "我が世誰ぞ"),
               ("つねならむ", "常ならむ"), ("うゐのおくやま", "有為の奥山"), ("けふこえて", "今日越えて"),
               ("あさきゆめみし", "浅き夢見じ"), ("ゑひもせす", "酔ひもせず")]
IROHA_EN = ("The colours are bright, but the blossoms fall. In this world of ours, who lasts forever? "
            "Today we cross the far mountains of change, and will dream no shallow dreams, nor be drunk.")


def kana_html():
    assert len(IROHA) == 47 and len(set(IROHA)) == 47, "the Iroha uses each of 47 kana once"
    cells = []
    for k in IROHA + "ん":
        cells.append(f'<li><button type="button" class="kana-cell" data-kana="{k}" data-src="{KANA_SOURCE[k]}" '
                     f'aria-label="{k}, {ROMAJI[k]}, from {KANA_SOURCE[k]}">'
                     f'<span class="kc-src" lang="ja">{KANA_SOURCE[k]}</span><span class="kc-kana" lang="ja">{k}</span>'
                     f'<span class="kc-rom">{ROMAJI[k]}</span></button></li>')
    lines = "".join(f'<span class="ir-line"><span class="ir-kana" lang="ja">{a}</span><span class="ir-kanji" lang="ja">{b}</span></span>'
                    for a, b in IROHA_LINES)
    return ('<figure class="kana" aria-labelledby="kana-cap">'
            '<div class="kana-head"><p class="kana-kicker">From character to kana</p>'
            '<div class="kana-stage" aria-live="polite"><span class="ks-src" lang="ja" data-ks-src>安</span>'
            '<span class="ks-arrow" aria-hidden="true">→</span><span class="ks-kana" lang="ja" data-ks-kana>あ</span>'
            '<span class="ks-rom" data-ks-rom>a</span></div></div>'
            f'<ol class="kana-grid">{"".join(cells)}</ol>'
            f'<div class="iroha"><p class="iroha-lines">{lines}</p><p class="iroha-en">{esc(IROHA_EN)}</p></div>'
            '<figcaption id="kana-cap">The forty-seven kana of the Iroha poem, in its order, and ん. Each hiragana is shown with the '
            'character it was written from; choose one to see the two side by side. ゐ and ゑ dropped out of use in 1946.'
            '{{fn:hiragana,iroha}}</figcaption></figure>')


# ------------------------------------------------------------ poems and karuta
def poems_html():
    def grid(a, b):
        return "".join(f'<li><a class="pg" href="#poem-{n}" data-n="{n}">{n}</a></li>' for n in range(a, b + 1))
    arts = []
    for p in HI:
        n = p["n"]
        ja = "".join(f'<span class="pl">{esc(t)}</span>' for t in p["text"])
        kana = " ".join(esc(r) for r in p["ruby"])
        en = "<br>".join(esc(l) for l in p["lines"])
        note = f'<p class="poem-note">{esc(p["note"])}</p>' if p["note"] else ""
        cur = " current" if n == 1 else ""
        arts.append(
            f'<article class="poem{cur}" id="poem-{n}" data-n="{n}" aria-labelledby="poem-{n}-h">'
            f'<header class="poem-head"><h3 id="poem-{n}-h" class="poem-h"><span class="poem-n">{n}</span>'
            f'<span class="poem-poet">{esc(p["poet"])}</span></h3>'
            f'<p class="poem-poet-ja" lang="ja">{esc(p["author"])}</p></header>'
            f'<div class="poem-body"><p class="poem-ja" lang="ja">{ja}</p>'
            f'<div class="poem-side"><p class="poem-en">{en}</p><p class="poem-kana" lang="ja">{kana}</p>{note}</div></div></article>')
    nav = ('<nav class="anth-nav" aria-label="The hundred poems">'
           f'<ol class="anth-grid">{grid(1, 100)}</ol>'
           '<div class="anth-tools">'
           '<button type="button" class="btn btn-quiet" data-anth="prev" aria-label="Previous poem">Previous</button>'
           '<button type="button" class="btn" data-anth="random">Draw a poem</button>'
           '<button type="button" class="btn btn-quiet" data-anth="next" aria-label="Next poem">Next</button>'
           '</div></nav>')
    return f'<div class="anthology" id="anthology">{nav}<div class="anth-pages" aria-live="polite">{"".join(arts)}</div></div>'


def karuta_data():
    return [{"n": p["n"], "k": p["kimariji"], "u": " ".join(p["ruby"][:3]), "l": " ".join(p["ruby"][3:]),
             "p": p["poet"]} for p in HI]


def karuta_html():
    return ('<figure class="karuta" id="karuta" aria-labelledby="karuta-cap">'
            '<div class="karuta-head">'
            '<p class="karuta-reader" aria-live="polite"><span class="kr-label">The reader chants</span>'
            '<span class="kr-upper" lang="ja" data-kr-upper>Press Start to play</span></p>'
            '<div class="karuta-score"><span data-kr-score>0</span> / <span data-kr-round>0</span>'
            '<span class="kr-time" data-kr-time></span></div>'
            '<div class="karuta-tools"><button type="button" class="btn" data-kr-start>Start</button>'
            '<label class="kr-mode"><input type="checkbox" id="kr-hard"> Stop the reader at the deciding syllables</label></div>'
            '</div>'
            '<ol class="karuta-cards" data-kr-cards></ol>'
            '<figcaption id="karuta-cap">Eight cards are laid out, each with the second half of a poem in kana, as on a real '
            '<i>torifuda</i>. The reader chants the first half of one of them, one syllable at a time: take the matching card as '
            'fast as you can. The highlighted syllables are the poem’s <i>kimariji</i>, the point at which it can no longer be '
            'confused with any other.{{fn:karuta}}</figcaption></figure>')


# ------------------------------------------------------------------ stage
def stage_html():
    import scenes as scene_defs
    out = []
    for name, spec in scene_defs.SCENES.items():
        focus = f'{spec.get("focus", 0.5) * 100:.0f}%'
        pics = []
        for theme in ("day", "night"):
            base = f"img/{name}-{theme}"
            land = ", ".join(f"{base}-{w}.avif {w}w" for w in (1600, 2560, 3840))
            flat = (f'<picture class="flat"><source type="image/avif" media="(orientation: portrait)" data-srcset="{base}-p.avif">'
                    f'<source type="image/webp" media="(orientation: portrait)" data-srcset="{base}-p.webp">'
                    f'<source type="image/avif" data-srcset="{land}" sizes="100vw"><img alt="" data-src="{base}-2560.webp" decoding="async"></picture>')
            if spec.get("layered"):
                layers = []
                for i in range(3):
                    lb = f"{base}-L{i}"
                    layers.append(
                        f'<picture class="layer layer-{i}"><source type="image/avif" data-srcset="{lb}-2560.avif 2560w, {lb}-3840.avif 3840w" sizes="108vw">'
                        f'<img alt="" data-src="{lb}-2560.webp" decoding="async"></picture>')
                pics.append(f'<div class="scene-theme {theme}">{flat}<div class="layers">{"".join(layers)}</div></div>')
            else:
                pics.append(f'<div class="scene-theme {theme}">{flat}</div>')
        out.append(f'<div class="scene" data-scene="{name}" style="--focus:{focus}">{"".join(pics)}</div>')
    return ('<div class="stage" aria-hidden="true">' + "".join(out) +
            '<div class="grain day"></div><div class="grain night"></div></div>')


# ------------------------------------------------------------- footnotes
def number_citations(page, sources):
    order, index = [], {}

    def repl(m):
        keys = [k.strip() for k in m.group(1).split(",")]
        nums = []
        for k in keys:
            if k not in sources:
                raise SystemExit(f"unknown source key: {k}")
            if k not in index:
                order.append(k)
                index[k] = len(order)
            nums.append(index[k])
        links = ",".join(f'<a href="#src-{n}" data-fn="{n}">{n}</a>' for n in nums)
        return f'<sup class="fn">{links}</sup>'

    page = re.sub(r"\{\{fn:([^}]+)\}\}", repl, page)
    items = []
    for n, k in enumerate(order, 1):
        s = sources[k]
        date = f' <span class="src-date">{esc(s["date"])}</span>' if s.get("date") else ""
        items.append(f'<li id="src-{n}"><span class="src-org">{esc(s["org"])}</span> '
                     f'<a href="{esc(s["url"])}" rel="noopener" target="_blank">{esc(s["t"])}</a>{date}</li>')
    unused = sorted(set(sources) - set(order))
    if unused:
        print("  note: sources never cited:", ", ".join(unused))
    return page, f'<ol class="src-list">{"".join(items)}</ol>', len(order)


# ------------------------------------------------------------- stroke data
def stroke_data(page):
    """KanjiVG stroke centre lines for every character written by brush."""
    chars = []
    for m in re.finditer(r'data-write="([^"]+)"', page):
        for c in m.group(1):
            if c not in chars:
                chars.append(c)
    data = {}
    for c in chars:
        p = SRC / "kanjivg" / f"{ord(c):05x}.svg"
        if not p.exists():
            raise SystemExit(f"no KanjiVG data for {c} ({p.name})")
        svg = p.read_text(encoding="utf-8")
        strokes = re.findall(r'<path id="kvg:[0-9a-f]+-s(\d+)"[^>]*\sd="([^"]+)"', svg)
        strokes.sort(key=lambda t: int(t[0]))
        data[c] = [re.sub(r"\s+", " ", d.strip()) for _, d in strokes]
    return data


# ------------------------------------------------------------------ fonts
def subset_fonts(page_text, js_text, fonts_out):
    from fontTools import subset
    from fontTools.ttLib import TTFont

    def cjk(t):
        return {c for c in t if ord(c) > 0x2E7F}
    punct = set("、。「」『』（）・…―〜　")
    lazy = re.sub(r'<div class="anth-pages".*?</article></div>', "", page_text, flags=re.S)
    first = re.search(r'<article class="poem current".*?</article>', page_text, re.S).group(0)
    core = sorted(cjk(lazy) | cjk(first) | punct)
    rest = sorted(cjk(page_text + js_text) - set(core))
    files = {"core_chars": core, "rest_chars": rest}
    kana = "".join(chr(c) for c in range(0x3041, 0x3097)) + "ー"
    mincho = NM / "@expo-google-fonts/shippori-mincho/500Medium/ShipporiMincho_500Medium.ttf"
    jobs = [
        ("mincho", mincho, "".join(core)),
        ("mincho-more", mincho, "".join(rest)),
        ("brush", NM / "@expo-google-fonts/yuji-syuku/400Regular/YujiSyuku_400Regular.ttf", kana + "日本"),
    ]
    for name, path, text in jobs:
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
        opts.notdef_outline = True
        f = TTFont(str(path), recalcTimestamp=False)
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(f)
        tmp = fonts_out / f"{name}.woff2"
        f.flavor = "woff2"
        f.save(str(tmp))
        data = tmp.read_bytes()
        final = fonts_out / f"{name}.{digest(data)}.woff2"
        tmp.rename(final)
        files[name] = final.name
        print(f"  font {final.name}: {len(data) // 1024} KB, {len(text)} chars")
    files["brush_chars"] = kana + "日本"
    latin = {
        "literata": "@fontsource-variable/literata/files/literata-{s}-wght-normal.woff2",
        "literata-italic": "@fontsource-variable/literata/files/literata-{s}-wght-italic.woff2",
        "bodoni": "@fontsource-variable/bodoni-moda/files/bodoni-moda-{s}-opsz-normal.woff2",
        "bodoni-italic": "@fontsource-variable/bodoni-moda/files/bodoni-moda-{s}-opsz-italic.woff2",
    }
    for name, pat in latin.items():
        for s in ("latin", "latin-ext"):
            data = (NM / pat.format(s=s)).read_bytes()
            fn = f"{name}-{s}.{digest(data)}.woff2"
            (fonts_out / fn).write_bytes(data)
            files[f"{name}-{s}"] = fn
    return files


FONT_RANGES = {
    "latin": "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
}


def font_css(files):
    css = []
    for fam, key, style, wght in (("Literata", "literata", "normal", "200 900"),
                                  ("Literata", "literata-italic", "italic", "200 900"),
                                  ("Bodoni Moda", "bodoni", "normal", "400 900"),
                                  ("Bodoni Moda", "bodoni-italic", "italic", "400 900")):
        for s in ("latin", "latin-ext"):
            css.append(f"@font-face{{font-family:'{fam}';font-style:{style};font-display:swap;font-weight:{wght};"
                       f"src:url(../fonts/{files[f'{key}-{s}']}) format('woff2');unicode-range:{FONT_RANGES[s]}}}")

    def ranges(chars):
        return ",".join(f"U+{ord(c):04X}" for c in chars)
    css.append(f"@font-face{{font-family:'Mincho';font-style:normal;font-weight:400 700;font-display:swap;"
               f"src:url(../fonts/{files['mincho']}) format('woff2');unicode-range:{ranges(files['core_chars'])}}}")
    css.append(f"@font-face{{font-family:'Mincho';font-style:normal;font-weight:400 700;font-display:swap;"
               f"src:url(../fonts/{files['mincho-more']}) format('woff2');unicode-range:{ranges(files['rest_chars'])}}}")
    css.append(f"@font-face{{font-family:'Brush';font-style:normal;font-weight:400;font-display:swap;"
               f"src:url(../fonts/{files['brush']}) format('woff2');unicode-range:{ranges(files['brush_chars'])}}}")
    return "\n".join(css) + "\n"


# -------------------------------------------------------------------- icons
def write_icons():
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
           '<rect width="64" height="64" rx="10" fill="#1F4A73"/>'
           '<rect x="0" y="0" width="64" height="14" rx="10" fill="#15314D"/>'
           '<circle cx="32" cy="34" r="15" fill="#D2452C"/>'
           '<path d="M6 50c6-5 12-5 18 0s12 5 18 0 12-5 16 0v14H6z" fill="#F2EBDD" opacity=".92"/></svg>')
    (OUT / "favicon.svg").write_text(svg, encoding="utf-8")
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (180, 180), (31, 74, 115))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 180, 40), fill=(21, 49, 77))
    d.ellipse((48, 52, 132, 136), fill=(210, 69, 44))
    d.polygon([(0, 150), (40, 136), (80, 150), (120, 136), (180, 150), (180, 180), (0, 180)], fill=(242, 235, 221))
    img.save(OUT / "apple-touch-icon.png", optimize=True)


def write_og():
    from PIL import Image, ImageDraw, ImageFont
    src = HERE / ".cache" / "art" / "hero-day.png"
    if not src.exists():
        print("  og: no hero render, skipped")
        return
    im = Image.open(src).convert("RGB").resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652))
    d = ImageDraw.Draw(im)
    tmp = HERE / ".cache" / "bodoni.ttf"
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
        f = TTFont(str(NM / "@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-normal.woff2"))
        f.flavor = None
        inst = instantiateVariableFont(f, {"wght": 500, "opsz": 72})
        inst.save(str(tmp))
        title = ImageFont.truetype(str(tmp), 92)
        small = ImageFont.truetype(str(tmp), 34)
    except Exception as e:  # pragma: no cover
        print("  og font:", e)
        title = small = ImageFont.load_default()
    ja = ImageFont.truetype(str(NM / "@expo-google-fonts/shippori-mincho/800ExtraBold/ShipporiMincho_800ExtraBold.ttf"), 132)
    ink = (26, 32, 44)
    d.text((72, 120), "日本", font=ja, fill=ink)
    d.text((76, 300), "Where the Sun Rises", font=title, fill=ink)
    d.text((80, 420), "A history of Japan in twelve prints", font=small, fill=(52, 60, 74))
    im.save(OUT / "og.jpg", quality=88, optimize=True, progressive=True)


# -------------------------------------------------------------------- head
def head_html(css_name, js_name, files, artifact=False):
    theme_boot = ("(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('nihon-theme');"
                  "if(t==='dark'||t==='light')d.setAttribute('data-theme',t)}catch(e){}})();")
    meta = [f'<title>{TITLE}</title>', f'<meta name="description" content="{esc(DESCRIPTION)}">']
    if not artifact:
        meta += [
            '<meta name="theme-color" content="#F2EBDD" media="(prefers-color-scheme: light)">',
            '<meta name="theme-color" content="#0E1A2B" media="(prefers-color-scheme: dark)">',
            '<meta name="color-scheme" content="light dark">',
            f'<link rel="canonical" href="{SITE_URL}/">',
            '<meta property="og:type" content="website">',
            f'<meta property="og:title" content="{TITLE}">',
            f'<meta property="og:description" content="{esc(DESCRIPTION)}">',
            f'<meta property="og:url" content="{SITE_URL}/">',
            f'<meta property="og:image" content="{SITE_URL}/og.jpg">',
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
            '<meta property="og:image:alt" content="A woodblock-style print of a red sun rising over the sea behind a breaking wave, with the characters 日本 and the title Where the Sun Rises">',
            '<meta name="twitter:card" content="summary_large_image">',
            '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
            '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        ]
    meta += [
        f'<link rel="preload" href="fonts/{files["literata-latin"]}" as="font" type="font/woff2" crossorigin>',
        f'<link rel="preload" href="fonts/{files["bodoni-latin"]}" as="font" type="font/woff2" crossorigin>',
        f'<script>{theme_boot}</script>',
        f'<link rel="stylesheet" href="assets/{css_name}">',
        f'<script type="module" src="assets/{js_name}"></script>',
    ]
    return "\n".join(meta)


def mast_html(toc_html, ribbon_html):
    return f'''<header class="mast" data-mast>
  <a class="mast-brand" href="#top" aria-label="Where the Sun Rises, back to the top"><span class="mast-sun" aria-hidden="true"></span><span class="mast-title">Where the Sun Rises</span></a>
  <p class="mast-chapter" aria-hidden="true"><span data-mast-num></span><span data-mast-title></span></p>
  <div class="mast-tools">
    <button class="tool" type="button" data-sound aria-pressed="false" aria-label="Play ambient sound">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="snd-off" d="M4 9h4l5-4v14l-5-4H4z"/><path class="snd-wave" d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M18.6 6c2 1.7 3 3.7 3 6s-1 4.3-3 6"/></svg>
    </button>
    <button class="tool tool-theme" type="button" data-theme-toggle aria-label="Switch between day and night prints">
      <svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><circle r="6" class="th-sun"/><path class="th-moon" d="M3 -9 A9 9 0 1 0 9 3 A7 7 0 1 1 3 -9Z"/></svg>
    </button>
    <button class="tool tool-toc" type="button" aria-expanded="false" aria-controls="toc" data-toc-open><span>Contents</span></button>
  </div>
  <div class="mast-ribbon" aria-hidden="true">{ribbon_html}</div>
</header>
<nav class="toc" id="toc" aria-label="Contents" hidden data-toc>
  <div class="toc-inner">
    <div class="toc-head"><p class="toc-kicker">Contents</p><button class="toc-close" type="button" data-toc-close>Close</button></div>
    <ol class="toc-list">{toc_html}</ol>
    <p class="toc-foot"><a href="#anthology">The hundred poems</a><a href="#karuta">Play karuta</a><a href="#eras">Find an era name</a><a href="#sources">Sources</a></p>
  </div>
</nav>'''


# ------------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", action="store_true")
    args = ap.parse_args()

    sources = json.loads((SRC / "sources.json").read_text(encoding="utf-8"))
    parts = sorted((SRC / "parts").glob("*.html"))
    page = "\n".join(p.read_text(encoding="utf-8") for p in parts)
    shortcodes = {"kana": kana_html, "poems": poems_html, "karuta": karuta_html}
    for k, fn in shortcodes.items():
        page = page.replace("{{" + k + "}}", fn())
    page = (page.replace("{{year}}", str(datetime.date.today().year))
                .replace("{{era_count}}", str(len(ERAS)))
                .replace("{{kimariji_agree}}", str(KIMARIJI_AGREE)))

    n_quotes = verify_quotes(page)
    if QUOTE_ERRORS:
        print("\n".join(QUOTE_ERRORS))
        raise SystemExit(f"{len(QUOTE_ERRORS)} quotation(s) do not match their sources")

    page, src_list, n_src = number_citations(page, sources)
    page = page.replace("{{sources}}", src_list)

    toc, ribbon = [], []
    for m in re.finditer(r'<section class="chapter[^"]*" id="([^"]+)" data-scene="[^"]+" data-num="([^"]+)" data-title="([^"]+)"(.*?)</section>', page, re.S):
        cid, num, title, body = m.groups()
        words = len(re.findall(r"[A-Za-z’']+", strip_tags(re.sub(r'<div class="anth-pages".*', "", body, flags=re.S))))
        han = re.search(r'data-write="([^"]+)"', body).group(1)
        dates = re.search(r'<span class="era-dates">(.*?)</span>', body)
        dates = strip_tags(dates.group(1)) if dates else ""
        toc.append((cid, num, title, han, dates, max(1, round(words / WPM))))
        ribbon.append(f'<a href="#{cid}" data-rb="{cid}" tabindex="-1"><span lang="ja">{han}</span></a>')
    toc_html = "".join(
        f'<li><a href="#{cid}"><span class="toc-n">{num}</span><span class="toc-h" lang="ja">{han}</span>'
        f'<span class="toc-t">{esc(title)}</span><span class="toc-d">{esc(dates)}</span><span class="toc-r">{mins} min</span></a></li>'
        for cid, num, title, han, dates, mins in toc)

    strokes = stroke_data(page)
    app_data = {"eras": ERAS, "karuta": karuta_data()}
    body_html = (
        '<a class="skip" href="#jomon">Skip to the first chapter</a>\n'
        + stage_html() + "\n"
        + mast_html(toc_html, "".join(ribbon)) + "\n"
        + '<main id="main">\n' + page.replace('<footer class="end"', '</main>\n<footer class="end"', 1) + "\n"
        + f'<script type="application/json" id="stroke-data">{json.dumps(strokes, separators=(",", ":"), ensure_ascii=False)}</script>\n'
        + f'<script type="application/json" id="app-data">{json.dumps(app_data, separators=(",", ":"), ensure_ascii=False)}</script>'
    )
    if "</main>" not in body_html:
        body_html += "</main>"

    if OUT.exists():
        for sub in ("assets", "fonts"):
            shutil.rmtree(OUT / sub, ignore_errors=True)
    (OUT / "assets").mkdir(parents=True, exist_ok=True)
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)

    js_src = "".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))
    files = subset_fonts(body_html, js_src, OUT / "fonts")
    css = font_css(files) + (SRC / "style.css").read_text(encoding="utf-8")
    cache = HERE / ".cache"
    cache.mkdir(exist_ok=True)
    (cache / "site.css").write_text(css, encoding="utf-8")
    subprocess.run([str(ESBUILD), str(cache / "site.css"), "--minify", "--loader:.css=css",
                    f"--outfile={cache / 'site.min.css'}"], check=True, capture_output=True)
    css_min = (cache / "site.min.css").read_bytes()
    css_name = f"site.{digest(css_min)}.css"
    (OUT / "assets" / css_name).write_bytes(css_min)
    subprocess.run([str(ESBUILD), str(SRC / "js" / "main.js"), "--bundle", "--minify", "--format=esm", "--target=es2020",
                    f"--outfile={cache / 'site.min.js'}"], check=True, capture_output=True)
    js_min = (cache / "site.min.js").read_bytes()
    js_name = f"site.{digest(js_min)}.js"
    (OUT / "assets" / js_name).write_bytes(js_min)

    head = head_html(css_name, js_name, files)
    doc = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
           "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
           + head + "\n</head>\n<body>\n" + body_html + "\n</body>\n</html>\n")
    (OUT / "index.html").write_text(doc, encoding="utf-8")
    write_icons()
    write_og()

    if args.artifact:
        art = cache / "artifact"
        art.mkdir(parents=True, exist_ok=True)
        ahead = head_html(css_name, js_name, files, artifact=True)
        (art / "index.html").write_text(ahead + "\n" + body_html.replace(' download>', '>') + "\n", encoding="utf-8")
        print("  artifact page:", art / "index.html")

    kb = (OUT / "index.html").stat().st_size // 1024
    print(f"built {OUT / 'index.html'}: {kb} KB html, css {len(css_min) // 1024} KB, js {len(js_min) // 1024} KB, "
          f"{n_src} sources, {n_quotes} quotations verified, {len(ERAS)} era names, "
          f"kimariji agree with transcription B for {KIMARIJI_AGREE} of 100 poems")


if __name__ == "__main__":
    main()
