// Task class from a title: a softmax (logistic regression) over embed(), weights in ./model/heads.json (built by
// scripts/embed/train_heads.py). cls is set only when the top class is a task class (not NONE) and its probability clears
// the threshold tuned for >= 90% precision.
import type { Domain, TaskClass } from "./frame";
import { embed } from "./embed";
import heads from "./model/heads.json";

const NONE = "none";

export interface Classified {
  cls?: TaskClass;
  p: number;
  domain?: Domain;
}

export function classify(title: string): Classified {
  const x = embed(title);
  if (!x.some((v) => v !== 0)) return { p: 0 }; // no letters: the bias alone must not decide
  const z = heads.W.map((row, c) => heads.b[c] + row.reduce((s, w, j) => s + w * x[j], 0));
  let top = 0;
  for (let c = 1; c < z.length; c++) if (z[c] > z[top]) top = c;
  let sum = 0;
  for (let c = 0; c < z.length; c++) sum += Math.exp(z[c] - z[top]);
  const p = 1 / sum;
  const name = heads.classes[top];
  // NONE: the title names no task class. A class the domain table lacks (heads.json built from another frame.ts) is no answer either.
  if (name === NONE || p < heads.threshold || !(name in heads.domain)) return { p };
  const cls = name as TaskClass;
  return { cls, p, domain: heads.domain[cls as keyof typeof heads.domain] as Domain };
}
