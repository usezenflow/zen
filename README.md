# Zen

A local-first planner for students: day, week and month views and one hold-to-speak button. Speech goes through the system recognizer (on the phone when Vietnamese is installed); understanding and planning are rules and a small bandit on the phone. Decision: [ADR-0001](docs/adr/0001-local-first.md).

## Run

```bash
pnpm install
pnpm expo run:ios     # dev build; expo-speech-recognition needs native code
pnpm test             # planner, store, NLU, DLU parsers
pnpm typecheck
```

No models to download. See [docs/mind.md](docs/mind.md).

## Layout

| Path | What |
| --- | --- |
| `src/app` | the card screen and settings |
| `src/lib` | store (SQLite), ears (system speech recognizer), apply, rules, stats, sync |
| `src/lib/nlu` | rule reader, voice commands, title vectors |
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

## License

Source-available, all rights reserved: read and study it, no redistribution. See [LICENSE](LICENSE).
