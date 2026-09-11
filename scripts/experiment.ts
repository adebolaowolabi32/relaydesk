import { writeFile } from "node:fs/promises";
import { comparison } from "../src/simulation";
const report = {
  scenario:
    "Frankfurt offline at second 15; 1000 seeded arrivals; four workers per cache; 240 simulation seconds",
  seed: 42,
  units: {
    latency: "simulation seconds, including queueing, successful requests only",
    credits: "fictional compute/transfer model units, not cloud prices",
  },
  results: comparison().map((r) => ({
    ...r,
    p95: Number(r.p95.toFixed(1)),
    credits: Number(r.credits.toFixed(3)),
  })),
};
await writeFile(
  new URL("../docs/EXPERIMENT.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
