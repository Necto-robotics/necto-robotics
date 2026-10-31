import * as THREE from "three";
import type { Build } from "./build";

/** Chapter 04: the Assembly Graph, made spatial.
 *
 * The finished model's own bricks lift out and become the graph's nodes
 * (one ring per dependency wave, real support edges between them), around a
 * core that stands for the current revision. Human intent enters from
 * above. Then the graph does two things only, replaying the real build
 * tape: a ring marks each job while a robot holds its claim, and a pulse
 * marks the moment the placement is verified.
 *
 * Every element maps to a concept in the chapter's list, and focusing a
 * concept dims everything that is not part of it. */
export type Concept = "intent" | "graph" | "execution" | "log" | "verify";

const CENTER = new THREE.Vector3(0, 1.08, 0);
const LAYOUT_SCALE = 0.8;
const NODE_SCALE = 5;
/** Seconds of wall time per replay of the tape. */
const REPLAY = 40;
/** Seconds of wall time a verification pulse lasts. */
const PULSE = 1.4;

interface Claim {
  node: string;
  from: number;
  /** Tape time the claim ended: placement complete, or the lease lapsed. */
  to: number;
  verified: boolean;
}

export class GraphRealm {
  readonly group = new THREE.Group();
  readonly anchors: Record<Concept, THREE.Object3D>;
  /** Which concept labels have something to point at right now. */
  readonly labelled: Record<Concept, boolean> = { intent: true, graph: true, execution: false, log: true, verify: false };
  private build: Build;
  private k = 0;
  private edgeMat: THREE.LineBasicMaterial;
  private core: THREE.Group;
  private rings: THREE.Mesh[] = [];
  private intent: THREE.Group;
  private claimRings: THREE.InstancedMesh;
  private pulseRings: THREE.InstancedMesh;
  private claims: Claim[] = [];
  private nodeIndex = new Map<string, number>();
  private tracked: Claim | null = null;
  private light: THREE.HemisphereLight;
  private focus: Concept | null = null;
  private focusK: Record<Concept, number> = { intent: 1, graph: 1, execution: 1, log: 1, verify: 1 };
  private hits: { mesh: THREE.Mesh; concept: Concept; r: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpC = new THREE.Color();
  /** Rings turn to face this camera, so they read as circles from any angle. */
  view: THREE.Camera | null = null;
  private face = new THREE.Quaternion();
  private gpos = new Map<string, THREE.Vector3>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(opts: { build: Build; plinthTop: number; tier: "high" | "mid" | "low" }) {
    this.build = opts.build;
    this.group.visible = false;
    const nodes = opts.build.model.nodes;
    nodes.forEach((n, i) => {
      this.gpos.set(n.id, new THREE.Vector3(...n.gpos).multiplyScalar(LAYOUT_SCALE).add(CENTER));
      this.nodeIndex.set(n.id, i);
    });

    // Edges: every support relation, source -> target.
    const pts: number[] = [];
    for (const e of opts.build.model.edges) {
      if (e.type !== "support") continue;
      const t = this.gpos.get(e.t);
      if (!t) continue;
      for (const s of e.s) {
        const a = this.gpos.get(s);
        if (a) pts.push(a.x, a.y, a.z, t.x, t.y, t.z);
      }
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    this.group.add(new THREE.LineSegments(eg, this.edgeMat));

    // Core: the current revision, the event log replayed.
    this.core = new THREE.Group();
    this.core.position.copy(CENTER);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x060606,
      roughness: 0.12,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    this.core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 5), coreMat));
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (const [r, tilt] of [
      [0.12, 0.35],
      [0.155, -0.6],
      [0.19, 1.2],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0011, 6, 160), ringMat.clone());
      ring.rotation.set(Math.PI / 2 + tilt, tilt * 0.5, 0);
      this.core.add(ring);
      this.rings.push(ring);
    }
    this.group.add(this.core);

    // Human intent: a frame above the top wave, wired down to the core.
    this.intent = new THREE.Group();
    const top = CENTER.y + 0.95;
    this.intent.position.set(0, top + 0.28, 0);
    this.intent.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.16, 0.16)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true })
      )
    );
    this.intent.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })));
    const wire = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.08, 0), new THREE.Vector3(0, CENTER.y - (top + 0.28) + 0.2, 0)]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.02, transparent: true })
    );
    wire.computeLineDistances();
    this.intent.add(wire);
    this.group.add(this.intent);

    // Claims and verifications, from the same tape the build replays.
    const open = new Map<string, Claim>();
    for (const e of opts.build.model.tape) {
      if (!e.node && e.type !== "worker_offline") continue;
      if (e.type === "job_claimed") {
        const c: Claim = { node: e.node!, from: e.t, to: Infinity, verified: false };
        open.set(e.node!, c);
        this.claims.push(c);
      } else if (e.type === "placement_complete" || e.type === "lease_expired") {
        const c = open.get(e.node!);
        if (c) {
          c.to = e.t;
          c.verified = e.type === "placement_complete";
          open.delete(e.node!);
        }
      }
    }

    // Rings are additive, so an instance colour of black hides one.
    const ringGeo = new THREE.RingGeometry(0.06, 0.066, 64);
    const additive = () =>
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.claimRings = new THREE.InstancedMesh(ringGeo, additive(), nodes.length);
    this.pulseRings = new THREE.InstancedMesh(ringGeo, additive(), nodes.length);
    for (const m of [this.claimRings, this.pulseRings]) {
      m.frustumCulled = false;
      m.setColorAt(0, this.tmpC.set(0));
      this.group.add(m);
    }

    // The void has no daylight; a soft sky light keeps the brick nodes legible.
    this.light = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0);
    this.group.add(this.light);

    // Anchors for labels, and invisible hit targets for picking.
    const anchor = (p: THREE.Vector3, parent: THREE.Object3D = this.group) => {
      const o = new THREE.Object3D();
      o.position.copy(p);
      parent.add(o);
      return o;
    };
    this.anchors = {
      intent: anchor(new THREE.Vector3(0.1, 0.1, 0), this.intent),
      graph: anchor(new THREE.Vector3(0.62, CENTER.y + 0.28, 0.2)),
      execution: anchor(new THREE.Vector3()),
      log: anchor(new THREE.Vector3(0.2, 0.02, 0), this.core),
      verify: anchor(new THREE.Vector3()),
    };
    const hit = (r: number, concept: Concept, parent: THREE.Object3D, p = new THREE.Vector3()) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.copy(p);
      parent.add(m);
      this.hits.push({ mesh: m, concept, r });
    };
    hit(0.14, "intent", this.intent);
    hit(0.62, "graph", this.group, CENTER.clone());
    hit(0.2, "log", this.core);
    hit(0.09, "execution", this.anchors.execution);
    hit(0.09, "verify", this.anchors.verify);
    // Smallest target first, so the core and the rings win over the cloud.
    this.hits.sort((a, b) => a.r - b.r);

    // Bricks lift into the layout through the build's override hook.
    this.build.brickOverride = (ref, out) => {
      if (this.k <= 0.0001) return false;
      const g = this.gpos.get(ref.node.id);
      if (!g) return false;
      const stagger = 0.35 * (ref.node.wave / Math.max(1, this.build.model.waveCount - 1));
      const t = Math.min(1, Math.max(0, (this.k * (1 + 0.35) - stagger) / 1));
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      this.tmpV.lerpVectors(ref.pos, g, e);
      // An arc: rise first, then settle sideways into the ring.
      this.tmpV.y += Math.sin(e * Math.PI) * 0.15;
      const s = this.build.brickScale + (NODE_SCALE - this.build.brickScale) * e;
      out.compose(this.tmpV, ref.quat, this.tmpS.set(s, s, s));
      return true;
    };
  }

  setFocus(c: Concept | null): void {
    this.focus = c;
  }

  pick(ray: THREE.Raycaster): Concept | null {
    if (!this.group.visible) return null;
    for (const h of this.hits) {
      if (h.concept === "execution" && !this.labelled.execution) continue;
      if (h.concept === "verify" && !this.labelled.verify) continue;
      if (ray.intersectObject(h.mesh, false).length) return h.concept;
    }
    return null;
  }

  update(_u: number, time: number, k: number): void {
    this.k = k;
    const show = k > 0.001;
    this.group.visible = show;
    if (!show) return;
    // Reduced motion and stills hold one representative moment mid-build.
    const t = this.reduced ? 0 : time;
    const appear = Math.min(1, Math.max(0, (k - 0.55) / 0.45));

    for (const c of Object.keys(this.focusK) as Concept[]) {
      const target = this.focus === null || this.focus === c ? 1 : 0.18;
      this.focusK[c] += (target - this.focusK[c]) * 0.12;
    }
    const F = this.focusK;

    this.light.intensity = 2.2 * k;
    this.edgeMat.opacity = 0.13 * appear * F.graph;
    this.core.scale.setScalar(0.4 + 0.6 * appear);
    this.core.visible = appear > 0.01;
    this.rings.forEach((r, i) => {
      r.rotation.z = t * (0.12 + i * 0.05) * (i % 2 ? -1 : 1);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.8 * appear * F.log;
    });

    this.intent.visible = appear > 0.01;
    this.intent.rotation.y = t * 0.2;
    this.intent.traverse((o) => {
      const m = (o as THREE.Mesh).material as (THREE.Material & { opacity: number }) | undefined;
      if (m && "opacity" in m) m.opacity = appear * F.intent;
    });

    // Replay: wall time -> tape time, with a beat of rest at the end.
    const span = this.build.makespan * 1.12;
    const phase = (t / REPLAY + 0.55) % 1;
    const tau = phase * span;
    const tapeRate = span / REPLAY;
    const pulseTape = PULSE * tapeRate;

    if (this.view) this.face.copy(this.view.quaternion);
    const n = this.claimRings.count;
    for (let i = 0; i < n; i++) {
      this.claimRings.setColorAt(i, this.tmpC.set(0));
      this.pulseRings.setColorAt(i, this.tmpC.set(0));
    }
    const claimK = 0.75 * appear * F.execution;
    const pulseK = appear * F.verify;
    for (const c of this.claims) {
      const i = this.nodeIndex.get(c.node);
      const p = this.gpos.get(c.node);
      if (i === undefined || !p) continue;
      if (tau >= c.from && tau < c.to) {
        this.tmpM.compose(p, this.face, this.tmpS.set(1, 1, 1));
        this.claimRings.setMatrixAt(i, this.tmpM);
        this.claimRings.setColorAt(i, this.tmpC.setScalar(claimK));
      } else if (c.verified && tau >= c.to && tau < c.to + pulseTape) {
        const q = (tau - c.to) / pulseTape;
        const s = 1 + q * 1.8;
        this.tmpM.compose(p, this.face, this.tmpS.set(s, s, s));
        this.pulseRings.setMatrixAt(i, this.tmpM);
        this.pulseRings.setColorAt(i, this.tmpC.setScalar(pulseK * (1 - q)));
      }
    }
    for (const m of [this.claimRings, this.pulseRings]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Labels follow one job at a time: through its claim, then its pulse,
    // then on to the newest claim.
    const tr = this.tracked;
    const trDone = !tr || tau < tr.from || tau >= tr.to + (tr.verified ? pulseTape : 0);
    if (trDone) {
      let next: Claim | null = null;
      for (const c of this.claims) if (tau >= c.from && tau < c.to && c.verified && (!next || c.from > next.from)) next = c;
      this.tracked = next;
    }
    const cur = this.tracked;
    this.labelled.execution = !!cur && tau < cur.to;
    this.labelled.verify = !!cur && tau >= cur.to;
    if (cur) {
      const p = this.gpos.get(cur.node)!;
      this.anchors.execution.position.copy(p).add(this.tmpV.set(0.06, 0.03, 0));
      this.anchors.verify.position.copy(p).add(this.tmpV.set(0.09, -0.02, 0));
    }
  }
}
