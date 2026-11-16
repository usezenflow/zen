"""Python port of src/lib/nlu/reader/fold.ts: NFKC, lowercase, NFD, drop marks, d-stroke to d, per character."""
import unicodedata


def fold(s: str) -> str:
    out = []
    for ch in s:
        f = unicodedata.normalize("NFKC", ch).lower()
        f = unicodedata.normalize("NFD", f)
        f = "".join(c for c in f if not unicodedata.category(c).startswith("M"))
        out.append(f.replace("đ", "d").replace("ð", "d"))
    return "".join(out)
