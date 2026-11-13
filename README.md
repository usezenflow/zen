# Zen

A local-first planner for students: day, week and month views and one hold-to-speak button. Speech, understanding and planning run on the phone; the phone calendar is the calendar. Decision: [ADR-0001](docs/adr/0001-local-first.md).

## Run

```bash
npm install
npx expo run:ios      # dev build; whisper.rn and llama.rn need native code
npm test              # planner, store, mind, DLU parsers
npm run typecheck
```

Models download on first use (see `src/lib/models.ts`).

## Layout

| Path | What |
| --- | --- |
| `src/app` | the card screen and settings |
| `src/lib` | store (SQLite), ears (whisper), mind (llama), embed, apply, calendar, stats, sync |
| `src/lib/dlu` | campus portal and LMS client, parsers, materialize, background sync |
| `src/planner` | LinUCB, features, habits, placement, policy, simulator |
| `sink` | Cloudflare Worker and D1 stats sink with a dashboard |
| `mockups` | static HTML screens |

## Stats sink

```bash
cd sink
npx wrangler d1 create zen-sink   # put the id in wrangler.toml
npx wrangler d1 execute zen-sink --file schema.sql
npm run deploy
```
