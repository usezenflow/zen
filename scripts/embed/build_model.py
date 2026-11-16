"""Step 3-4: PCA-distil the teacher vectors to D dims, add rank-based SIF weights, quantise to int8, and learn a
char-trigram table for words outside the vocabulary. Writes src/lib/nlu/model/embed.json.

Usage: python -I scripts/embed/build_model.py [D]   (default 96: the largest D that fits 3 MB at this vocabulary)
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge

ROOT = Path(__file__).resolve().parents[2]
BUILD = Path(__file__).parent / "build"
OUT = ROOT / "src/lib/nlu/model/embed.json"
D = int(sys.argv[1]) if len(sys.argv) > 1 else 96
B = 2048  # trigram buckets
SIF_A = 1e-3  # SIF smoothing constant: weight a / (a + p(rank))
TRI_ALPHA = 1.0  # ridge strength for the trigram table


def fnv_bucket(s: str) -> int:
    # Same hash as src/lib/nlu/vec.ts: FNV-1a over UTF-16 code units, folded into B buckets.
    h = 0x811C9DC5
    data = s.encode("utf-16-le")
    for i in range(0, len(data), 2):
        h = ((h ^ (data[i] | (data[i + 1] << 8))) * 0x01000193) & 0xFFFFFFFF
    return h % B


def trigrams(word: str) -> list[str]:
    p = f"^{word}$"
    return [p[i : i + 3] for i in range(len(p) - 2)]


def quant(x: np.ndarray):
    """Int8 with one scale per column (per dimension): the PCA dimensions differ in spread."""
    scale = np.abs(x).max(axis=0) / 127.0
    scale[scale == 0] = 1.0
    q = np.clip(np.round(x / scale), -127, 127).astype(np.int8)
    return q, scale.astype(np.float32)


def b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode("ascii")


def main() -> None:
    entries = json.loads((Path(__file__).parent / "vocab" / "vocab.json").read_text(encoding="utf-8"))
    teacher = np.load(BUILD / "teacher.npy")
    teacher = teacher / np.linalg.norm(teacher, axis=1, keepdims=True)

    pca = PCA(n_components=D, random_state=0).fit(teacher)
    Z = pca.transform(teacher).astype(np.float32)
    print(f"PCA {D} dims explains {pca.explained_variance_ratio_.sum():.3f} of the teacher variance")

    # Rank-based SIF weight: rank r stands in for frequency p = (1/(r+1)) / H (Zipf). Common words count less.
    ranks = np.array([e["rank"] for e in entries], dtype=np.float64)
    zipf = 1.0 / (ranks + 1.0)
    p = zipf / zipf.sum()
    w = SIF_A / (SIF_A + p)
    wcode = np.clip(np.round(-np.log2(w) * 16), 0, 255).astype(np.uint8)  # w = 2^(-code/16)

    q, scale = quant(Z)

    # Trigram table: learn B x D so the mean of a word's trigram rows approximates its (unquantised) vector.
    single = [(i, e["key"]) for i, e in enumerate(entries) if " " not in e["key"]]
    rng = np.random.default_rng(0)
    order = rng.permutation(len(single))
    holdout = {single[j][0] for j in order[: len(single) // 10]}
    rows, cols, vals, targets, idx = [], [], [], [], []
    r = 0
    for i, key in single:
        tg = trigrams(key)
        counts = np.bincount([fnv_bucket(t) for t in tg], minlength=B).astype(np.float32) / len(tg)
        if i in holdout:
            continue
        nz = np.nonzero(counts)[0]
        rows += [r] * len(nz)
        cols += list(nz)
        vals += list(counts[nz])
        targets.append(Z[i])
        idx.append(i)
        r += 1
    X = sparse.csr_matrix((vals, (rows, cols)), shape=(r, B), dtype=np.float32)
    Y = np.stack(targets)
    ridge = Ridge(alpha=TRI_ALPHA, fit_intercept=False).fit(X, Y)
    T = ridge.coef_.T.astype(np.float32)  # B x D (row b is bucket b)

    # Held-out check: how close the trigram vector is to the true vector for words it never saw.
    cs = []
    for i in holdout:
        key = entries[i]["key"]
        if " " in key:
            continue
        counts = np.bincount([fnv_bucket(t) for t in trigrams(key)], minlength=B).astype(np.float32)
        v = counts @ T / counts.sum()
        cs.append(np.dot(v / np.linalg.norm(v), Z[i] / np.linalg.norm(Z[i])))
    print(f"trigram fallback: held-out cosine to true vector, mean {np.mean(cs):.3f}, n={len(cs)}")

    tq, tscale = quant(T)
    model = {
        "v": 1,
        "D": D,
        "B": B,
        "keys": [e["key"] for e in entries],
        "w": b64(wcode),
        "q": b64(q),
        "s": b64(scale),
        "t": b64(tq),
        "ts": b64(tscale),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} {OUT.stat().st_size / 1e6:.2f} MB, entries {len(entries)}, D {D}")


if __name__ == "__main__":
    main()
