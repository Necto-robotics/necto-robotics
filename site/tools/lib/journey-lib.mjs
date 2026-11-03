/**
 * Pure build-plan math shared by the build scripts and Vitest.
 *
 * Source graphs are verbatim copies (assets-src/models/) of
 * D:\Robotics\LEGOSwarm\necto-datasets\models\{car,pyramid}.{graph,assembly}.json
 * produced by the necto-data-builder CAD→graph pipeline. Poses are ROS-frame
 * meters (z-up); we bake the three.js mapping (y-up) at build time:
 * three = (x, z, -y), yawY = -yaw.
 */

/** LDraw color code → display color. Trans colors carry alpha. */
export const LDRAW_COLORS = {
  0: { hex: 0x1b2a34 },            // black (lifted for visibility on charcoal)
  1: { hex: 0x1e5aa8 },            // blue
  4: { hex: 0xc91a09 },            // red
  14: { hex: 0xf2cd37 },           // yellow
  15: { hex: 0xf4f4f4 },           // white
  7: { hex: 0x9ba19d },            // light gray
  36: { hex: 0xc91a09, alpha: 0.6 },  // trans-red
  39: { hex: 0xc1dff0, alpha: 0.55 }, // trans-very-light-blue
  46: { hex: 0xf5cd2f, alpha: 0.6 },  // trans-yellow
  43: { hex: 0xaee9ef, alpha: 0.55 }, // trans-light-blue
  64: { hex: 0x184632 },           // dark green (LDraw 64 unused fallback)
  71: { hex: 0xa0a5a9 },           // light bluish gray
  72: { hex: 0x6c6e68 },           // dark bluish gray
};
export const FALLBACK_COLOR = { hex: 0x5b7a99 };

export function resolveColor(ldrawCode) {
  const c = LDRAW_COLORS[Number(ldrawCode)];
  if (!c) console.warn(`journey-lib: unmapped LDraw color ${ldrawCode} — using steel fallback`);
  return c ?? FALLBACK_COLOR;
}

/** Wave = topological depth over `support` edges (0 = buildable immediately). */
export function computeWaves(graph) {
  const deps = new Map(); // node id → [source ids]
  for (const n of graph.nodes) deps.set(n.id, []);
  for (const e of graph.edges) {
    if (e.type !== "support") continue;
    deps.get(e.target)?.push(...e.sources);
  }
  const wave = new Map();
  const visit = (id, stack = new Set()) => {
    if (wave.has(id)) return wave.get(id);
    if (stack.has(id)) throw new Error(`cycle at ${id}`);
    stack.add(id);
    const ds = deps.get(id) ?? [];
    const w = ds.length === 0 ? 0 : 1 + Math.max(...ds.map((d) => visit(d, stack)));
    stack.delete(id);
    wave.set(id, w);
    return w;
  };
  for (const n of graph.nodes) visit(n.id);
  const waveCount = Math.max(...wave.values()) + 1;
  const freeCount = [...wave.values()].filter((w) => w === 0).length;
  return { wave, waveCount, freeCount, deps };
}

/** Tiny deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic N-worker simulation over the real dependency graph honoring
 * WEAVE semantics: a node becomes available when its support sources
 * complete. Availability is derived locally by every peer, so it never goes
 * on the wire. Idle workers claim the lowest (lamport_ts, worker_id). The
 * tape is the wire traffic: job_claimed + placement_complete, two events per
 * job, no polling. Returns a pace-compressed tape plus a total order of
 * placements for the timelapse.
 *
 * `fail: { worker, afterPlacements, ttl }` takes one worker offline once that
 * many placements are complete. Its job is not finished; the silent lease
 * expires locally on every peer after `ttl` (a `lease_expired` entry, never
 * sent on the wire) and the job is claimed again by a survivor.
 */
export function simulateTape(graph, { workers = 4, seed = 7, fail = null } = {}) {
  const { wave, deps } = computeWaves(graph);
  const rand = rng(seed);
  const remaining = new Map(); // id → unmet dep count
  for (const n of graph.nodes) remaining.set(n.id, (deps.get(n.id) ?? []).length);

  const tape = [];
  let lamport = 0;
  let t = 0;
  const available = [];
  const announce = (id) => {
    available.push(id);
  };
  for (const n of graph.nodes) if (remaining.get(n.id) === 0) announce(n.id);

  const busy = new Map(); // worker → { node, done }
  const placeOrder = [];
  const idle = [...Array(workers).keys()];

  const expiries = []; // { node, at, worker }
  let failed = null;

  while (placeOrder.length < graph.nodes.length) {
    if (fail && failed === null && placeOrder.length >= fail.afterPlacements) {
      failed = fail.worker;
      const held = busy.get(failed);
      busy.delete(failed);
      const at = idle.indexOf(failed);
      if (at >= 0) idle.splice(at, 1);
      tape.push({ t: +t.toFixed(2), type: "worker_offline", worker: failed, lamport: lamport, local: true });
      if (held) expiries.push({ node: held.node, at: t + (fail.ttl ?? 3), worker: failed });
    }
    // claims: idle workers pull lowest-wave-then-id (deterministic tiebreak)
    available.sort((a, b) => (wave.get(a) - wave.get(b)) || a.localeCompare(b));
    while (idle.length && available.length) {
      const w = idle.shift();
      const node = available.shift();
      tape.push({ t: +t.toFixed(2), type: "job_claimed", node, worker: w, lamport: ++lamport });
      busy.set(w, { node, done: t + 1.2 + rand() * 1.6 });
    }
    // advance to the next completion or lease expiry
    const next = Math.min(...[...busy.values()].map((b) => b.done), ...expiries.map((e) => e.at));
    t = next;
    for (const e of [...expiries]) {
      if (e.at <= t + 1e-9) {
        expiries.splice(expiries.indexOf(e), 1);
        tape.push({ t: +t.toFixed(2), type: "lease_expired", node: e.node, worker: e.worker, lamport, local: true });
        available.push(e.node);
      }
    }
    for (const [w, b] of [...busy.entries()]) {
      if (b.done <= t + 1e-9) {
        busy.delete(w);
        idle.push(w);
        idle.sort((a, b2) => a - b2);
        tape.push({ t: +t.toFixed(2), type: "placement_complete", node: b.node, worker: w, lamport: ++lamport });
        placeOrder.push(b.node);
        // unlock dependents
        for (const e of graph.edges) {
          if (e.type !== "support" || !e.sources.includes(b.node)) continue;
          const r = remaining.get(e.target) - 1;
          remaining.set(e.target, r);
          if (r === 0) announce(e.target);
        }
      }
    }
  }
  return { tape, placeOrder, makespan: t };
}

export function toThree(pose) {
  return { pos: [pose.x, pose.z, -pose.y], yawY: -(pose.yaw ?? 0) };
}

/** Full per-model journey payload. */
export function buildModelData(graph, opts) {
  const { wave, waveCount, freeCount } = computeWaves(graph);
  const { tape, placeOrder, makespan } = simulateTape(graph, opts);
  const orderIndex = new Map(placeOrder.map((id, i) => [id, i]));
  const nodes = graph.nodes.map((n) => {
    const { pos, yawY } = toThree(n.target_pose);
    const color = resolveColor(n.color);
    return {
      id: n.id,
      part: n.part_num,
      name: n.catalog_name,
      color: color.hex,
      alpha: color.alpha ?? 1,
      pos: pos.map((v) => +v.toFixed(5)),
      yawY: +yawY.toFixed(5),
      wave: wave.get(n.id),
      order: orderIndex.get(n.id),
    };
  });
  const edges = graph.edges.map((e) => ({ s: e.sources, t: e.target, type: e.type }));
  return { nodes, edges, waveCount, freeCount, tape, makespan: +makespan.toFixed(2) };
}

/**
 * Spatial layout for the Assembly Graph chapter: each dependency wave is a
 * ring stacked along +Y, and a node keeps the bearing it has in the physical
 * model so bricks lift into the graph without crossing over each other.
 * Deterministic, in metres around the origin.
 */
export function graphLayout(nodes, waveCount) {
  const byWave = new Map();
  for (const n of nodes) {
    if (!byWave.has(n.wave)) byWave.set(n.wave, []);
    byWave.get(n.wave).push(n);
  }
  const out = new Map();
  for (const [w, list] of byWave) {
    const bearing = (n) => Math.atan2(n.pos[2], n.pos[0]);
    list.sort((a, b) => bearing(a) - bearing(b) || a.id.localeCompare(b.id));
    const radius = 0.22 + 0.035 * list.length;
    const y = (w - (waveCount - 1) / 2) * 0.28;
    list.forEach((n, i) => {
      const a = (i / list.length) * Math.PI * 2 + w * 0.37;
      out.set(n.id, [+(Math.cos(a) * radius).toFixed(4), +y.toFixed(4), +(Math.sin(a) * radius).toFixed(4)]);
    });
  }
  return out;
}
