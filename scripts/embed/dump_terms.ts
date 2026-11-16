// Dumps the English terms the reader keeps as typed, plus fold() samples for the Python port's parity check.
// Run: node scripts/embed/run.mjs scripts/embed/dump_terms.ts   (writes build/; run.mjs is the loader, see there).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EN_WORDS } from "../../src/lib/nlu/reader/en.ts";
import { TELEX_TERMS } from "../../src/lib/nlu/reader/telex.ts";
import { fold } from "../../src/lib/nlu/reader/fold.ts";

const out = fileURLToPath(new URL("build", import.meta.url));
writeFileSync(join(out, "en_terms.json"), JSON.stringify({ en: [...EN_WORDS], telex: [...TELEX_TERMS] }, null, 1));

// Mixed-case, accented, NFD, emoji and punctuation inputs for the parity check.
const samples = [
  "Tập gym", "ĐỒNG TIỀN", "đi chợ", "Giải tích 2", "nộp thuế TNCN", "kubernetes", "b-tree", "é", "Ôn Giải tích",
  "😀 tập", "İstanbul", "ΣΊΣΥΦΟΣ", "ﬁle", "ｆｕｌｌｗｉｄｔｈ", "Đặng Thị Ánh", "x̉y", "Ǆ", "Ạ", "ð Ð",
];
const rnd = (n: number) => Math.floor(Math.random() * n);
const pool = "aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiìíỉĩịklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵAÀÁĐẞİΣ ß-ﬁ😀̣́ ".split("");
for (let i = 0; i < 180; i++) {
  let s = "";
  const len = 1 + rnd(14);
  for (let k = 0; k < len; k++) s += pool[rnd(pool.length)];
  samples.push(s);
}
writeFileSync(join(out, "fold_samples.json"), JSON.stringify(samples.map((s) => ({ s, f: fold(s).text }))));
console.log("en", EN_WORDS.size, "telex", TELEX_TERMS.size, "samples", samples.length);
