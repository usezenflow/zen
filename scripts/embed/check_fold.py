"""Checks fold.py against the TS fold() on the samples that dump_terms.ts wrote. Exit 1 on any mismatch."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fold import fold  # noqa: E402

samples = json.loads((Path(__file__).parent / "build" / "fold_samples.json").read_text(encoding="utf-8"))
bad = [(x["s"], x["f"], fold(x["s"])) for x in samples if fold(x["s"]) != x["f"]]
for b in bad[:10]:
    print("MISMATCH", repr(b[0]), repr(b[1]), repr(b[2]))
print(f"fold parity: {len(samples) - len(bad)}/{len(samples)} identical")
sys.exit(1 if bad else 0)
