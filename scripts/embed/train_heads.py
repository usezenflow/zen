"""Step 6: logistic-regression heads over embed(). Reads build/features.json (from features.ts), picks the confidence
threshold on out-of-fold predictions (grouped by base phrasing, so augmentations never leak across folds) for >= 0.9
precision, and writes src/lib/nlu/model/heads.json. Standardisation is folded into the weights: the app uses raw embed().
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[2]
BUILD = Path(__file__).parent / "build"
OUT = Path(__import__("os").environ.get("HEADS_OUT", ROOT / "src/lib/nlu/model/heads.json"))
TARGET_PRECISION = 0.90
NONE = "none"  # the class for titles that name no task class: the head answers nothing for them
CS = [0.003, 0.01, 0.03, 0.1, 0.3, 1.0]


def taskclasses_and_domains():
    src = (ROOT / "src/lib/nlu/frame.ts").read_text(encoding="utf-8")
    union = re.search(r"export type TaskClass =(.*?);", src, re.S).group(1)
    classes = re.findall(r'"(\w+)"', union)
    block = re.search(r"const DOMAIN: Record<TaskClass, Domain> = \{(.*?)\n\};", src, re.S).group(1)
    domain = dict(re.findall(r'(\w+): "(\w+)"', block))
    return classes, domain


def fit(X, y, C):
    mu, sd = X.mean(0), X.std(0) + 1e-6
    clf = LogisticRegression(C=C, max_iter=5000).fit((X - mu) / sd, y)
    W = clf.coef_ / sd  # fold the standardisation into the weights
    b = clf.intercept_ - (clf.coef_ * (mu / sd)).sum(1)
    return W, b, clf.classes_


def probs(W, b, X):
    z = X @ W.T + b
    z -= z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def pick_threshold(p, pred, y):
    """Lowest threshold whose precision is >= TARGET (max coverage), over answers that are a task class (not NONE).
    Falls back to the most precise cut."""
    best = None
    for t in np.unique(np.round(np.arange(0.2, 0.995, 0.005), 3)):
        m = (p >= t) & (pred != NONE)
        if m.sum() < 30:
            continue
        prec = (pred[m] == y[m]).mean()
        if prec >= TARGET_PRECISION:
            return float(t), float(prec), float(m.mean())
        best = (float(t), float(prec), float(m.mean()))
    return best


def main() -> None:
    feats = json.loads((BUILD / "features.json").read_text(encoding="utf-8"))
    tc, domain = taskclasses_and_domains()
    X = np.array([r["x"] for r in feats["train"]], dtype=np.float64)
    y = np.array([r["y"] for r in feats["train"]])
    groups = np.array([r["g"] for r in feats["train"]])
    assert set(y) <= set(tc) | {NONE}, set(y) - set(tc) - {NONE}
    print(f"TaskClass {len(tc)} + {NONE}; trained on {len(y)} rows ({int((y == NONE).sum())} NONE) of {len(set(y))} classes; missing from data: {sorted(set(tc) - set(y))}")

    # Pick (C, threshold) on grouped 5-fold out-of-fold probabilities: precision >= 0.95 on clean rows and >= 0.90 on
    # noised rows (no diacritics / typo), then the most clean task coverage.
    aug = np.array([r["aug"] for r in feats["train"]])
    clean_m = aug == "clean"
    noisy_m = np.isin(aug, ["nodiac", "typo", "nodiac_typo"])
    cv = GroupKFold(n_splits=5)
    best = None
    for C in CS:
        oof_p = np.zeros(len(y))
        oof_pred = np.empty(len(y), dtype=object)
        for tr, te in cv.split(X, y, groups):
            W, b, cls = fit(X[tr], y[tr], C)
            P = probs(W, b, X[te])
            oof_p[te] = P.max(1)
            oof_pred[te] = cls[P.argmax(1)]
        for t in np.round(np.arange(0.3, 0.995, 0.005), 3):
            ans = (oof_p >= t) & (oof_pred != NONE)
            st = []
            for m in (clean_m, noisy_m):
                a_ = ans & m
                st.append(((oof_pred[a_] == y[a_]).mean() if a_.sum() else 1.0, (a_ & (y != NONE)).sum() / (m & (y != NONE)).sum()))
            ok = st[0][0] >= 0.95 and st[1][0] >= 0.90
            if ok:
                print(f"C={C} t={t}: clean prec {st[0][0]:.3f} cov {st[0][1]:.3f}; noised prec {st[1][0]:.3f} cov {st[1][1]:.3f}")
                if best is None or st[0][1] > best[0]:
                    best = (st[0][1], C, float(t), st)
                break
    assert best, "no (C, threshold) meets the precision targets"
    _, best_c, thr, st = best
    print(f"chosen C={best_c}; threshold {thr}: OOF clean precision {st[0][0]:.3f} coverage {st[0][1]:.3f}; noised precision {st[1][0]:.3f} coverage {st[1][1]:.3f}")

    W, b, cls = fit(X, y, best_c)
    assert list(cls) == sorted(set(y))
    model = {
        "v": 1,
        "C": best_c,
        "threshold": thr,
        "classes": list(cls),
        "domain": {c: domain[c] for c in cls if c in domain},
        "W": np.round(W, 6).tolist(),
        "b": np.round(b, 6).tolist(),
    }
    OUT.write_text(json.dumps(model, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.1f} KB)")

    # Held-out (never trained on, never tuned on): clean and noised copies, scored the way classify() answers.
    H = np.array([r["x"] for r in feats["heldout"]])
    Hn = np.array([r["xn"] for r in feats["heldout"]])
    truth = np.array([r["y"] for r in feats["heldout"]])
    is_task = truth != NONE
    for name, M in (("clean", H), ("noised", Hn)):
        P = probs(W, b, M)
        p, pred = P.max(1), cls[P.argmax(1)]
        answered = (p >= thr) & (pred != NONE)
        ok = answered & (pred == truth)
        print(
            f"held-out {name}: task coverage {answered[is_task].mean():.3f} ({answered[is_task].sum()}/{is_task.sum()}), "
            f"precision {ok.sum() / answered.sum():.3f} over {answered.sum()} answers (NONE answered: {(answered & ~is_task).sum()}), "
            f"NONE abstention {1 - (answered & ~is_task).sum() / (~is_task).sum():.3f}, task accuracy {(pred[is_task] == truth[is_task]).mean():.3f}"
        )
    Pc = probs(W, b, H)
    wrong = [(feats["heldout"][i]["text"], truth[i], cls[Pc[i].argmax()], round(float(Pc[i].max()), 2)) for i in range(len(truth)) if cls[Pc[i].argmax()] != truth[i]]
    for w in wrong[:25]:
        print("  miss:", w)


if __name__ == "__main__":
    main()
