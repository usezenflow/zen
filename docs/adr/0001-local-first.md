# ADR-0001: Zen, a local-first app

**Status:** accepted
**Date:** 2026-11-13

## Context
- Zenflow has login, onboarding and many screens; users churn on the friction.
- The placer is greedy and timid (Zenflow ADR-0063, greedy replan).
- The target phone is an iPhone 12 Pro with no Apple Intelligence.

## Decision
- New Expo app in `zen/`: one card, hold to speak, swipe right for done and left for later. No login and no backend.
- On device: expo-sqlite store, whisper.rn (PhoWhisper base, base.en), llama.rn with Qwen3 1.7B Q4_K_M under a JSON schema, and multilingual-e5-small embeddings.
- Planner in `zen/src/planner`: LinUCB with 24 hour arms and a 16-dim context (`weekend`, `busy`, `due`, `kind`, `after`, `energy`, `similar`), α 0.15, a 21 day half-life. Tasks more than 24 h out are fully replanned.
- Pairwise: each placement solves with LinUCB and with the heuristic, picks one by coin and logs both. LinUCB learns from every outcome.
- DLU portal and LMS sync run on the phone through `expo-background-task`. Credentials stay in `expo-secure-store`.
- The only server is `zen/sink` at `zen-sink.alphazero25811.workers.dev`, a Cloudflare Worker with D1 that stores anonymous rows (`install, at, policy, arm, x, reward, kind, zeroEdit`) and serves a dashboard.

## Consequences
- Simulator over 30 days, mean of 5 seeds:

| Variant | Kept rate | Drag |
| --- | --- | --- |
| Full model | 0.58 | 0.26 |
| LinUCB, hour only | 0.43 | 0.43 |
| Greedy | 0.27 | 0.71 |

- `mobile/` and `backend/` are not used by zen.
- Model latency on the 12 Pro and the Vietnamese word error rate still need device runs.
