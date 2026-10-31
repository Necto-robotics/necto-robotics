import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelData, computeWaves, graphLayout, simulateTape } from "../tools/lib/journey-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, "..", "assets-src", "models", p), "utf8"));
const car = read("car.graph.json");
const pyramid = read("pyramid.graph.json");

describe("computeWaves", () => {
  it("matches the dev-log ground truth for the car (8 waves, 16 free)", () => {
    const { waveCount, freeCount } = computeWaves(car);
    expect(waveCount).toBe(8);
    expect(freeCount).toBe(16);
  });

  it("matches the dev-log ground truth for the pyramid (4 waves)", () => {
    const { waveCount } = computeWaves(pyramid);
    expect(waveCount).toBe(4);
  });
});

describe("simulateTape", () => {
  it("places every node exactly once and is deterministic", () => {
    const a = simulateTape(car, { workers: 4, seed: 7 });
    const b = simulateTape(car, { workers: 4, seed: 7 });
    expect(a.placeOrder.length).toBe(car.nodes.length);
    expect(new Set(a.placeOrder).size).toBe(car.nodes.length);
    expect(a).toEqual(b);
  });

  it("never places a node before its support sources", () => {
    const { placeOrder } = simulateTape(car, { workers: 4, seed: 7 });
    const rank = new Map(placeOrder.map((id, i) => [id, i]));
    for (const e of car.edges) {
      if (e.type !== "support") continue;
      for (const s of e.sources) {
        expect(rank.get(s)).toBeLessThan(rank.get(e.target));
      }
    }
  });

  it("puts two events per job on the wire, no polling", () => {
    const { tape } = simulateTape(car, { workers: 6, seed: 7 });
    expect(tape.length).toBe(car.nodes.length * 2);
    expect(tape.every((e) => e.type === "job_claimed" || e.type === "placement_complete")).toBe(true);
  });
});

describe("buildModelData", () => {
  it("bakes three.js-space poses and colors for every node", () => {
    const data = buildModelData(car, { workers: 4, seed: 7 });
    for (const n of data.nodes) {
      expect(n.pos).toHaveLength(3);
      expect(n.color).toBeTypeOf("number");
      expect(n.order).toBeGreaterThanOrEqual(0);
      expect(n.wave).toBeLessThan(data.waveCount);
    }
  });
});

describe("graphLayout", () => {
  it("gives every node a distinct position, one ring per wave", () => {
    const data = buildModelData(car, { workers: 6, seed: 7 });
    const layout = graphLayout(data.nodes, data.waveCount);
    expect(layout.size).toBe(car.nodes.length);
    const keys = new Set([...layout.values()].map((p) => p.join(",")));
    expect(keys.size).toBe(car.nodes.length);
    for (const n of data.nodes) {
      const y = layout.get(n.id)[1];
      expect(y).toBeCloseTo((n.wave - (data.waveCount - 1) / 2) * 0.28, 3);
    }
  });
});

describe("simulateTape with a failure", () => {
  const opts = { workers: 6, seed: 7, fail: { worker: 5, afterPlacements: 34, ttl: 3 } };
  it("still places every node exactly once", () => {
    const { placeOrder } = simulateTape(car, opts);
    expect(new Set(placeOrder).size).toBe(car.nodes.length);
  });
  it("the failed worker never acts again, and its job is reclaimed by a survivor", () => {
    const { tape } = simulateTape(car, opts);
    const off = tape.find((e) => e.type === "worker_offline");
    expect(off).toBeDefined();
    const after = tape.filter((e) => e.t > off.t && e.worker === 5 && !e.local);
    expect(after).toHaveLength(0);
    const exp = tape.find((e) => e.type === "lease_expired");
    if (exp) {
      const reclaim = tape.find((e) => e.type === "job_claimed" && e.node === exp.node && e.t >= exp.t);
      expect(reclaim?.worker).not.toBe(5);
    }
  });
  it("keeps local events off the wire count", () => {
    const { tape } = simulateTape(car, opts);
    const wire = tape.filter((e) => !e.local);
    const reclaims = tape.filter((e) => e.type === "lease_expired").length;
    expect(wire.length).toBe(car.nodes.length * 2 + reclaims);
  });
});
