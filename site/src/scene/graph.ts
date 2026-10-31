import * as THREE from "three";
import type { Build } from "./build";

/** Chapter 04: the Assembly Graph, made spatial.
 *
 * The finished model's own bricks lift out and become the graph's nodes
 * (one ring per dependency wave, real support edges between them), around a
 * core that stands for the current revision. Human intent enters from
 * above. Six robot replicas orbit, each holding a small copy of the same
 * graph; events travel between them and the core; an append-only log
 * scrolls beside it; one node shows a local verification pulse.
 *
 * Every element maps to a concept in the chapter's list, and focusing a
 * concept dims everything that is not part of it. */
export type Concept = "intent" | "graph" | "execution" | "log" | "verify";

const CENTER = new THREE.Vector3(0, 1.08, 0);
const LAYOUT_SCALE = 0.8;
const NODE_SCALE = 5;

export class GraphRealm {
  readonly group = new THREE.Group();
  readonly anchors: Record<Concept, THREE.Object3D>;
  private build: Build;
  private k = 0;
  private edges: THREE.LineSegments;
  private edgeMat: THREE.LineBasicMaterial;
  private core: THREE.Group;
  private rings: THREE.Mesh[] = [];
  private intent: THREE.Group;
  private sats: THREE.Group[] = [];
  private satOrbit = new THREE.Group();
  private pulses: THREE.InstancedMesh;
  private log: THREE.InstancedMesh;
  private logMat: THREE.MeshBasicMaterial;
  private leaseLines: THREE.LineSegments;
  private verifyRing: THREE.Mesh;
  private verifyNode: string;
  private light: THREE.HemisphereLight;
  private focus: Concept | null = null;
  private focusK: Record<Concept, number> = { intent: 1, graph: 1, execution: 1, log: 1, verify: 1 };
  private hits: { mesh: THREE.Mesh; concept: Concept }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private gpos = new Map<string, THREE.Vector3>();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(opts: { build: Build; plinthTop: number; tier: "high" | "mid" | "low" }) {
    this.build = opts.build;
    this.group.visible = false;
    const nodes = opts.build.model.nodes;
    for (const n of nodes) {
      this.gpos.set(n.id, new THREE.Vector3(...n.gpos).multiplyScalar(LAYOUT_SCALE).add(CENTER));
    }

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
    this.edges = new THREE.LineSegments(eg, this.edgeMat);
    this.group.add(this.edges);

    // Core: the current revision.
    this.core = new THREE.Group();
    this.core.position.copy(CENTER);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x060606,
      roughness: 0.12,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 5), coreMat);
    this.core.add(sphere);
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
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.16, 0.16)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true })
    );
    this.intent.add(frame);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    this.intent.add(inner);
    const wire = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.08, 0), new THREE.Vector3(0, CENTER.y - (top + 0.28) + 0.2, 0)]);
    this.intent.add(
      new THREE.Line(wire, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.02, transparent: true }))
    );
    (this.intent.children[2] as THREE.Line).computeLineDistances();
    this.group.add(this.intent);

    // Replicas: six robots, each holding the same graph in miniature.
    const miniPts: number[] = [];
    for (const n of nodes) miniPts.push(n.gpos[0] * 0.09, n.gpos[1] * 0.09, n.gpos[2] * 0.09);
    const miniGeo = new THREE.BufferGeometry();
    miniGeo.setAttribute("position", new THREE.Float32BufferAttribute(miniPts, 3));
    const miniMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true });
    const satRingGeo = new THREE.TorusGeometry(0.07, 0.0009, 6, 96);
    this.satOrbit.position.copy(CENTER);
    this.satOrbit.rotation.x = 0.28;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Group();
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.3, Math.sin(a * 2) * 0.12, Math.sin(a) * 1.3);
      s.add(new THREE.Points(miniGeo, miniMat.clone()));
      const ring = new THREE.Mesh(satRingGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      ring.rotation.x = Math.PI / 2;
      s.add(ring);
      this.sats.push(s);
      this.satOrbit.add(s);
    }
    this.group.add(this.satOrbit);

    // Leases: three replicas hold claims on graph nodes.
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 6), 3));
    this.leaseLines = new THREE.LineSegments(
      lg,
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.03, gapSize: 0.025, transparent: true, opacity: 0 })
    );
    this.leaseLines.frustumCulled = false;
    this.group.add(this.leaseLines);

    // Event pulses travelling replica -> core -> replicas.
    const pulseGeo = new THREE.SphereGeometry(0.009, 10, 8);
    this.pulses = new THREE.InstancedMesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), 24);
    this.pulses.frustumCulled = false;
    this.group.add(this.pulses);

    // Event log: an append-only column, newest at the bottom, scrolling up.
    this.logMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    this.log = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.008), this.logMat, 34);
    this.log.position.set(-1.75, CENTER.y - 0.55, -0.9);
    this.log.rotation.y = 0.35;
    this.log.frustumCulled = false;
    this.group.add(this.log);

    // Local verification: a pulse ring on one node of the top wave.
    const topWave = Math.max(...nodes.map((n) => n.wave));
    this.verifyNode = nodes.find((n) => n.wave === topWave)!.id;
    this.verifyRing = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.053, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    this.group.add(this.verifyRing);
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
      execution: anchor(new THREE.Vector3(0, 0.1, 0), this.sats[1]!),
      log: anchor(new THREE.Vector3(-1.75, CENTER.y + 0.62, -0.9)),
      verify: anchor(this.gpos.get(this.verifyNode)!.clone().add(new THREE.Vector3(0, 0.07, 0))),
    };
    const hit = (r: number, concept: Concept, parent: THREE.Object3D, p = new THREE.Vector3()) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.copy(p);
      parent.add(m);
      this.hits.push({ mesh: m, concept });
    };
    hit(0.14, "intent", this.intent);
    hit(0.62, "graph", this.group, CENTER.clone());
    for (const s of this.sats) hit(0.12, "execution", s);
    hit(0.45, "log", this.group, new THREE.Vector3(-1.5, CENTER.y, -0.9));
    hit(0.1, "verify", this.group, this.gpos.get(this.verifyNode)!.clone());

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
    let best: { d: number; c: Concept } | null = null;
    for (const h of this.hits) {
      const hit = ray.intersectObject(h.mesh, false)[0];
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, c: h.concept };
    }
    return best?.c ?? null;
  }

  update(u: number, time: number, k: number): void {
    this.k = k;
    const show = k > 0.001;
    this.group.visible = show;
    if (!show) return;
    const t = this.reduced ? 0 : time;
    const appear = Math.min(1, Math.max(0, (k - 0.55) / 0.45));

    // Focus easing
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
      (r.material as THREE.MeshBasicMaterial).opacity = 0.8 * appear * F.graph;
    });

    this.intent.visible = appear > 0.01;
    this.intent.rotation.y = t * 0.2;
    this.intent.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number } | undefined;
      if (m && "opacity" in m) m.opacity = appear * F.intent;
    });

    this.satOrbit.rotation.y = t * 0.05 + u * 0.4;
    this.satOrbit.visible = appear > 0.01;
    for (const s of this.sats) {
      s.rotation.y = -t * 0.3;
      s.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number } | undefined;
        if (m && "opacity" in m) m.opacity = appear * F.execution * (o instanceof THREE.Points ? 0.9 : 0.6);
      });
    }

    // Leases: replicas 0, 2, 4 each hold a claim on a node in the top waves.
    const lp = this.leaseLines.geometry.attributes.position as THREE.BufferAttribute;
    const claimIds = this.build.model.nodes.filter((n) => n.wave >= this.build.model.waveCount - 3).map((n) => n.id);
    this.satOrbit.updateMatrixWorld(true);
    [0, 2, 4].forEach((si, i) => {
      this.sats[si]!.getWorldPosition(this.tmpV);
      const target = this.gpos.get(claimIds[(i * 3 + Math.floor(t / 4)) % claimIds.length] ?? "");
      if (!target) return;
      lp.setXYZ(i * 2, this.tmpV.x, this.tmpV.y, this.tmpV.z);
      lp.setXYZ(i * 2 + 1, target.x, target.y, target.z);
    });
    lp.needsUpdate = true;
    this.leaseLines.computeLineDistances();
    (this.leaseLines.material as THREE.LineDashedMaterial).opacity = 0.45 * appear * F.execution;

    // Pulses: each event leaves a replica, reaches the core, fans out.
    const corePos = CENTER;
    for (let i = 0; i < 24; i++) {
      const lane = i % 6;
      const phase = (t * 0.35 + i * 0.137) % 1;
      this.sats[lane]!.getWorldPosition(this.tmpV);
      const inbound = i < 12;
      const p = inbound ? this.tmpV.clone().lerp(corePos, phase) : corePos.clone().lerp(this.tmpV, phase);
      const s = (this.reduced ? 0 : 1) * appear * Math.sin(phase * Math.PI) * F.log;
      this.tmpM.compose(p, new THREE.Quaternion(), this.tmpS.set(s, s, s));
      this.pulses.setMatrixAt(i, this.tmpM);
    }
    this.pulses.instanceMatrix.needsUpdate = true;

    // Log column: bars of varied length scroll upward, oldest fading out.
    const rowH = 0.034;
    const scroll = (t * 0.6) % 1;
    for (let i = 0; i < 34; i++) {
      const row = i + scroll;
      const y = row * rowH;
      const len = 0.18 + 0.32 * fract(Math.sin((i + Math.floor(t * 0.6)) * 91.7) * 43758.5);
      const fade = Math.min(1, row / 4) * Math.min(1, (34 - row) / 6);
      this.tmpM.compose(this.tmpV.set(len / 2, y, 0), new THREE.Quaternion(), this.tmpS.set(len, fade > 0 ? 1 : 0, 1));
      this.log.setMatrixAt(i, this.tmpM);
    }
    this.log.instanceMatrix.needsUpdate = true;
    this.logMat.opacity = 0.55 * appear * F.log;

    // Verification pulse on its node.
    const vp = this.gpos.get(this.verifyNode)!;
    const vk = (t * 0.5) % 1;
    this.verifyRing.position.copy(vp);
    this.verifyRing.rotation.x = -Math.PI / 2;
    this.verifyRing.scale.setScalar(1 + vk * 1.4);
    (this.verifyRing.material as THREE.MeshBasicMaterial).opacity = appear * (1 - vk) * F.verify;
  }
}

function fract(x: number): number {
  return x - Math.floor(x);
}
