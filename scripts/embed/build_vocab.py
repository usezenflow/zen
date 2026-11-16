"""Step 2-3a: choose the vocabulary (Vietnamese words and syllables, English terms) and embed it with the teacher.

Output: scripts/embed/vocab/vocab.json (key, surface forms, rank, source) and scripts/embed/build/teacher.npy (384-dim row per key).
Sources: github.com/duyet/vietnamese-wordlist Viet74K.txt (no frequency column) and first20hours/google-10000-english.
"""
import json
import math
import re
import sys
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from fold import fold  # noqa: E402

BUILD = Path(__file__).parent / "build"
VOCAB = Path(__file__).parent / "vocab"  # the committed vocabulary
VIET_URL = "https://raw.githubusercontent.com/duyet/vietnamese-wordlist/master/Viet74K.txt"
# Vietnamese syllable frequencies (OpenSubtitles 2018, one syllable per line with its count): ranks the phrases.
FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/vi/vi_50k.txt"
EN_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
# Caps by syllable count, most common first (the list has no frequency column, see score below). All 1-syllable words
# are kept: they are the syllables the reader matches. English: the reader's own terms plus the top EN_CAP of the list.
CAP = {1: 10**6, 2: 9000, 3: 4000}
EN_CAP = 3000
TEACHER = "intfloat/multilingual-e5-small"
KEY = re.compile(r"^[a-z]+(?: [a-z]+)*$")


def fetch(url: str, name: str) -> Path:
    p = BUILD / "src" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        subprocess.run(["curl", "-sfL", "--max-time", "120", "-o", str(p), url], check=True)
    return p


def main() -> None:
    viet_lines = fetch(VIET_URL, "Viet74K.txt").read_text(encoding="utf-8").splitlines()
    en_lines = fetch(EN_URL, "english10k.txt").read_text(encoding="utf-8").split()
    terms = json.loads((BUILD / "en_terms.json").read_text(encoding="utf-8"))

    # Vietnamese: NFC, lowercase, letters and single spaces only, 1-3 syllables, dedupe by case.
    viet = set()
    for line in viet_lines:
        w = " ".join(line.strip().lower().split())
        if re.fullmatch(r"[^\W\d_]+(?: [^\W\d_]+){0,2}", w):
            viet.add(w)
    freq = {}
    for line in fetch(FREQ_URL, "vi_50k.txt").read_text(encoding="utf-8").splitlines():
        w, n = line.rsplit(" ", 1)
        freq[w] = int(n)
    # A phrase is common when its syllables are common: mean log count of its syllables, scaled to [0, 1].
    score = {}
    for w in viet:
        score[w] = sum(math.log1p(freq.get(s, 0)) for s in w.split()) / len(w.split())
    top = max(score.values())
    score = {w: v / top for w, v in score.items()}
    viet_sorted = []
    for n in (1, 2, 3):
        pool = sorted((w for w in viet if len(w.split()) == n), key=lambda w: (-score[w], w))
        viet_sorted += pool[: CAP[n]]

    # English: reader terms first (they must be in), then the frequency list by position.
    # Reader terms keep their list position when they have one; a term outside the list is mid-rare, not common.
    en_list = {w.lower(): (1 - i / len(en_lines)) ** 4 for i, w in enumerate(en_lines[:EN_CAP])}
    reader = sorted(set(terms["en"]) | set(terms["telex"]))
    en_all = {w: en_list.get(w, 0.2) for w in reader}
    for w, s in en_list.items():
        en_all[w] = max(s, en_all.get(w, 0.0))

    # Group by fold key; several surface forms of one key share a row (averaged below).
    groups = defaultdict(lambda: {"forms": [], "score": 0.0, "src": set()})
    for w in viet_sorted:
        g = groups[fold(w)]
        g["forms"].append(w)
        g["score"] = max(g["score"], score[w])
        g["src"].add("viet")
    for w, s in en_all.items():
        if not KEY.match(fold(w)):
            continue
        g = groups[fold(w)]
        if w not in g["forms"]:
            g["forms"].append(w)
        g["score"] = max(g["score"], s)
        g["src"].add("en")
    keys = [k for k in groups if KEY.match(k)]
    keys.sort(key=lambda k: (-groups[k]["score"], k))
    # Every syllable of the kept Vietnamese words is an entry too (so a 1-syllable typo still finds its word).
    for w in viet_sorted:
        for s in fold(w).split():
            if s not in groups:
                groups[s]["forms"].append(s)
                groups[s]["score"] = math.log1p(freq.get(s, 0)) / math.log1p(max(freq.values()))
                groups[s]["src"].add("syll")
                keys.append(s)
    # Surface forms as typed in the list; the syllable row is the lowercase form itself.
    entries = []
    for k in keys:
        g = groups[k]
        entries.append({"key": k, "forms": sorted(set(g["forms"])), "score": g["score"], "src": sorted(g["src"])})
    entries.sort(key=lambda e: (-e["score"], e["key"]))
    for rank, e in enumerate(entries):
        e["rank"] = rank

    texts = sorted({f for e in entries for f in e["forms"]})
    print(f"entries {len(entries)} surface forms {len(texts)}")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(TEACHER, device="cpu")
    vecs = model.encode(["query: " + t for t in texts], batch_size=256, normalize_embeddings=True, show_progress_bar=False)
    by_text = {t: vecs[i] for i, t in enumerate(texts)}
    teacher = np.stack([np.mean([by_text[f] for f in e["forms"]], axis=0) for e in entries]).astype(np.float32)
    np.save(BUILD / "teacher.npy", teacher)
    VOCAB.mkdir(exist_ok=True)
    (VOCAB / "vocab.json").write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    by_src = Counter(s for e in entries for s in e["src"])
    print("sources", dict(by_src), "multi-form keys", sum(len(e["forms"]) > 1 for e in entries))


if __name__ == "__main__":
    main()
