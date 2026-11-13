# Mind and ears

No on-device models. Speech is the system recognizer; everything after it is rules.

## Now

- Ears (`lib/ears.ts`): `expo-speech-recognition`, `vi-VN`, interim results, continuous until the button is released. On-device when Vietnamese is installed (`getSupportedLocales().installedLocales`), else the system's server recognizer. Volume events drive the wave. Every exit (stop, early release, error, app to background, launch after a reload) aborts and deactivates the audio session, so the iOS mic dot clears.
- Mind (`lib/nlu/commands.ts`): `think(text, now, tasks)`.
  - Commands first, on the accent-folded line: `xong …` / `… xong rồi` (done), `xoá|huỷ|bỏ …` (delete), `dời|chuyển … sang <when>` (edit; a bare day keeps the task's own clock), `ghi chú: …` (note).
  - The target is the task whose title words the phrase covers best (at least half). A command that names no known task returns `[]` and the home screen says it didn't understand, never creating "xong lau nhà".
  - Anything else goes to the rule reader (`nlu/reader`); nothing read means a plain task with the words as title.
- Rules (Nhịp): `readRule` only (`lib/rules.ts`).
- Similarity (`lib/nlu/vec.ts`): `titleVec` hashes accent-folded words and character trigrams into 256 dims, L2-normalised. It feeds the planner's `similar` feature (LinUCB x[15], from `neighbors()`) and the effort guess from similar past tasks. User tasks get it in `apply`, campus tasks in `materialize`.

## Later

1. `contextualStrings`: pass course names and task titles to the recognizer so "CTDL" or a teacher's name comes back spelled right.
2. More command shapes as they show up in real use ("hoãn", "lùi … một tiếng", relative moves).
3. A clarification chip when two tasks tie as the target, instead of picking the earliest.
