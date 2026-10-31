/** Builds public/media/journey-data.json from the real CAD→graph exports in
 * assets-src/models/. Deterministic (seeded); output is committed. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelData, graphLayout } from "./lib/journey-lib.mjs";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(site, "assets-src", "models", p), "utf8"));

// Six workers: the largest swarm in the simulation scaling runs.
// One worker drops out partway through, as in the fault-tolerance trials.
const car = buildModelData(read("car.graph.json"), {
  workers: 6,
  seed: 7,
  fail: { worker: 5, afterPlacements: 34, ttl: 3 },
});
const layout = graphLayout(car.nodes, car.waveCount);
for (const n of car.nodes) n.gpos = layout.get(n.id);

// Ground truth from the dev log: car = 61 bricks / 8 waves / 16 free.
const assert = (cond, msg) => { if (!cond) { console.error(`ASSERT FAILED: ${msg}`); process.exit(1); } };
assert(car.nodes.length === 61, `car nodes ${car.nodes.length} != 61`);
assert(car.waveCount === 8, `car waves ${car.waveCount} != 8`);
assert(car.freeCount === 16, `car free ${car.freeCount} != 16`);
const wire = car.tape.filter((e) => !e.local);
const reclaims = car.tape.filter((e) => e.type === "lease_expired").length;
assert(wire.length === 2 * car.nodes.length + reclaims, `car wire events ${wire.length} != 2 per job + reclaims`);

const out = { generated: "tools/build-journey-data.mjs", workers: 6, car };
mkdirSync(join(site, "public", "media"), { recursive: true });
writeFileSync(join(site, "public", "media", "journey-data.json"), JSON.stringify(out));
console.log(
  `journey-data: car ${car.nodes.length} nodes / ${car.waveCount} waves / ${car.freeCount} free / ${wire.length} wire events, ${reclaims} lease expiry`
);
