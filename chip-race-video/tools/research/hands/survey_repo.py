"""Survey one GitHub repo using a blobless, no-checkout clone: file-type counts, LFS use, licence header.
usage: survey_repo.py owner/repo  -> prints one summary block. Clones go under scratchpad/hands/dl/git/survey/ (untrusted data, never executed)."""
import subprocess, sys, os, re, collections, shutil

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
repo = sys.argv[1]
d = f"{S}/dl/git/survey/{repo.replace('/', '__')}"
os.makedirs(os.path.dirname(d), exist_ok=True)
if os.path.isdir(d):
    shutil.rmtree(d)

def run(args, cwd=None, t=120):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=t)

r = run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", f"https://github.com/{repo}.git", d])
if r.returncode != 0:
    print(f"## {repo}: CLONE FAIL {r.stderr.strip()[:120]}"); sys.exit()
names = run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=d).stdout.splitlines()
ext = collections.Counter(os.path.splitext(n)[1].lower() for n in names)
audio = {k: v for k, v in ext.items() if k in (".wav", ".flac", ".ogg", ".mp3", ".wv", ".sf2", ".sf3", ".sfz")}
lfs = False
if ".gitattributes" in names:
    ga = run(["git", "show", "HEAD:.gitattributes"], cwd=d).stdout
    lfs = "filter=lfs" in ga
lic_files = [n for n in names if re.search(r"(^|/)(licen[sc]e|copying|copyright|unlicense)[^/]*$", n, re.I) and n.count("/") <= 1][:3]
lic_txt = ""
for lf in lic_files[:1]:
    t = run(["git", "show", f"HEAD:{lf}"], cwd=d).stdout
    lic_txt = " ".join(t.split())[:150]
readme_lic = ""
rd = [n for n in names if re.search(r"(^|/)readme[^/]*$", n, re.I) and n.count("/") <= 1][:1]
if rd:
    t = run(["git", "show", f"HEAD:{rd[0]}"], cwd=d).stdout
    m = re.findall(r"[^\n]*(?:licen[sc]e|CC0|CC-BY|Creative Commons|public domain)[^\n]*", t, re.I)
    readme_lic = " | ".join(x.strip()[:110] for x in m[:3])
print(f"## {repo}: {len(names)} files, audio/sfz {dict(audio)}, LFS={lfs}")
print(f"   LICENSE files: {lic_files} -> {lic_txt}")
if readme_lic:
    print(f"   README mentions: {readme_lic}")
