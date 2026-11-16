# Offline title embedding and class heads

Build-time only. Nothing here runs in the app. The output is two files the app imports:

- `src/lib/nlu/model/embed.json`: the static embedding (vocabulary, int8 PCA rows, weights, trigram table). 2.85 MB.
- `src/lib/nlu/model/heads.json`: the logistic-regression heads over `embed()` (31 task classes plus `none`), the threshold and the domain of each class. 34 KB.

Runtime: `src/lib/nlu/embed.ts` (`embed`, `cos`) and `src/lib/nlu/classify.ts` (`classify`). Pure TS, no dependencies.

## Rebuild

Needs Python 3.13 and Node 24 (type stripping). Raw sources are fetched into `build/src/` by `build_vocab.py`.

```bash
python3 -m venv <venv> && <venv>/bin/pip install -r scripts/embed/requirements.txt
node scripts/embed/run.mjs scripts/embed/dump_terms.ts     # English terms from the reader + fold() samples
<venv>/bin/python -I scripts/embed/check_fold.py           # fold.py == fold.ts on 199 samples
<venv>/bin/python -I scripts/embed/build_vocab.py          # vocab/vocab.json, build/teacher.npy (e5 teacher)
<venv>/bin/python -I scripts/embed/build_model.py          # embed.json, D=96 (argument: another D)
STUB_CLASSIFY=1 node scripts/embed/run.mjs scripts/embed/none_eval.ts   # NONE titles: reader titles the rules leave class-less
node scripts/embed/run.mjs scripts/embed/gen.ts            # build/train.jsonl (training phrasings + variants + NONE)
node scripts/embed/run.mjs scripts/embed/features.ts       # build/features.json, via the runtime embed()
<venv>/bin/python -I scripts/embed/train_heads.py          # heads.json, threshold
pnpm exec vitest run src/lib/nlu/embed.test.ts src/lib/nlu/classify.eval.test.ts
```

`run.mjs` loads a `.ts` file with Vite's SSR loader (the app's imports are extensionless, which Node cannot load). Vite is a transitive dependency in the pnpm store; no `tsx` is needed.

## What is in it

- **Teacher**: `intfloat/multilingual-e5-small`, with the `query: ` prefix, 384 dims.
- **Vocabulary** (`vocab/vocab.json`, 18,439 keys from 23,929 surface forms):
  - Vietnamese from `duyet/vietnamese-wordlist` (Viet74K): all 1-syllable words, the top 9,000 2-syllable and top 4,000 3-syllable words. The list has no frequency column, so they are ranked by the mean log count of their syllables in `hermitdave/FrequencyWords` (OpenSubtitles, `vi_50k`).
  - English: `EN_WORDS` and `TELEX_TERMS` from the reader, plus the top 3,000 of `first20hours/google-10000-english`.
  - Keys are `fold()` forms. Surface forms that share a key are averaged in the teacher space.
- **Distillation**: PCA to D=96 (58% of the teacher variance). Each row is weighted by a rank-based SIF weight, `a / (a + p)` with `a = 1e-3` and Zipf `p(rank)`, stored as a log2 code. Rows are int8 with one scale per dimension.
- **OOV**: 2048 FNV-1a trigram buckets (the same hash as `vec.ts`), fitted by ridge regression so a word's trigram mean matches its distilled vector. On held-out words the mean cosine to the true vector is 0.68.
- **Runtime**: fold, then greedy longest match over 3, 2 and 1 words; a word with no entry goes to the trigram table; SIF-weighted sum; L2 norm. Digits and punctuation are not embedded (they split words).

## NONE

`none` is a class for titles that name no task class: generic tasks ("xem phim"), bare course names ("giải tích"), chit chat, gibberish, single words. `classify()` never answers `none`. Its training rows are hand-written (128 bases with variants) plus the titles the reader hands `frameOf()` that the rule pass leaves class-less, taken from the reader's eval inputs and generic subjects with date and number spans. Classes the rules already give are not labelled, so they never reach the head. The NONE rows come from the rule pass as it stood when they were built; if the rules gain a class, rerun `none_eval.ts`.

## Metrics

Held-out set: `heldout.jsonl`, 186 hand-written titles, 31 classes, never in `gen.ts`. Thresholds and C were chosen without it.

Held-out now also has 60 NONE titles (never in training). Coverage is over the 186 task titles; NONE titles answered count against precision.

| | task coverage | precision of answers | NONE abstention | task accuracy |
|---|---|---|---|---|
| clean | 106 / 186 = 0.570 | 0.972 (108 answers, 2 NONE) | 0.967 | 0.801 |
| no diacritics + 1 typo | 89 / 186 = 0.478 | 0.978 (90 answers, 1 NONE) | 0.983 | 0.710 |

These numbers are with NONE. Before NONE the clean task coverage was 0.753 at precision 0.971; the NONE class costs coverage, and clean coverage misses the 0.6 gate.

- Threshold 0.84 on the grouped 5-fold out-of-fold probabilities, over answers that are a task class (grouping by base phrasing, so augmentations never cross folds): precision 0.902, coverage 0.350.
- Grouped CV accuracy at C=0.3: 0.681.
- Timing (1000 titles, this machine): embed p95 0.015 ms, classify p95 0.02 to 0.05 ms. First call decodes the tables in about 96 ms.

## Choices and caveats

- **D=96 over D=64.** At the same vocabulary, D=64 gave grouped CV accuracy 0.65 and held-out coverage 0.56 (below the 0.6 target). D=96 needs a 2.85 MB file only with the vocabulary cut to 18k entries; at 25k entries it was 3.8 MB. The D comparison looked at the held-out set, so that set is no longer untouched for that one choice.
- **Training data is small**: 666 base phrasings over 31 classes (about 21 each, not 30 to 80), 3,996 rows with variants. Some classes are thin. Held-out coverage is the weakest number here.
- **Class mapping for objects the rules don't list** (a judgement call, since `TaskClass` has no devops or design class): "kubernetes", "redis", "terraform" and "figma prototype" are `code`. "IELTS speaking" and "luyện speaking" are `language`. "hồ bơi" is `workout_swim`. "thuế TNCN" is `tax`. "sổ hộ khẩu" is `paperwork`. "bảo hiểm xe" is `bill`.
- **Known weak spot**: the teacher is weak on bare English-Vietnamese mixes ("luyện speaking" vs "học nói tiếng anh" has cosine near 0). The head can still classify them through training data.
- **Domain** comes from the `DOMAIN` table in `frame.ts`, which `train_heads.py` parses from the source (the table is not exported). If `frame.ts` changes its classes, rerun the build: the script asserts that the training classes cover `TaskClass`.
- `node.d.ts` declares the few Node functions these scripts use, since the project has no `@types/node`.
- `build/` holds the raw lists, teacher embeddings and features. It is git-ignored and regenerated by the steps above.
