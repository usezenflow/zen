// Dumps all rows as NDJSON for offline replay tuning: npm run export > rows.ndjson
import { execFileSync } from "node:child_process";

const out = execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "zen-sink", "--remote", "--json", "--command", "SELECT * FROM rows ORDER BY at"],
  { encoding: "utf8", maxBuffer: 1 << 30 },
);
for (const r of JSON.parse(out)[0].results)
  console.log(JSON.stringify({
    install: r.install, at: r.at, policy: r.policy, arm: r.arm, x: JSON.parse(r.x),
    theta: r.theta ? JSON.parse(r.theta) : undefined, reward: r.reward, kind: r.kind, zeroEdit: !!r.zero_edit,
  }));
