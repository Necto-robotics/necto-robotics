import * as THREE from "three";
import { Robot, POSES, lerpPose, type ArmPose } from "./robot";
import type { JModel, JNode, TapeEvent } from "./bricks";

/** The collaborative build, driven entirely by the event tape: the real
 * 61-brick car graph, six workers, one of which drops out mid-build. Every
 * pose is a pure function of tape time `tau`, so scrolling backwards
 * un-builds exactly and any frame can be re-rendered for a still.
 *
 * Bricks are drawn in ABS greyscale (each real colour mapped to its
 * luminance) so the model belongs to the monochrome world. */

export interface BuildSnapshot {
  tau: number;
  complete: number;
  total: number;
  wave: number;
  waves: number[];
  waveCount: number;
  activeClaims: number;
  wire: number;
  online: number;
  workers: number;
  log: TapeEvent[];
}

interface Job {
  node: JNode;
  worker: number;
  claim: number;
  done: number | null; // null = abandoned (worker went offline)
  end: number; // when the worker stops acting on it
}

const PHASE = { pickStart: 0.36, pickEnd: 0.48, placeStart: 0.8, placeEnd: 0.9 } as const;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const seg = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));

/** Monochrome ABS: map a real LEGO colour to one of four greys by luminance. */
function absGrey(hex: number): number {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (l > 0.72) return 0.9;
  if (l > 0.42) return 0.62;
  if (l > 0.16) return 0.3;
  return 0.055;
}

interface BrickRef {
  node: JNode;
  mesh: THREE.InstancedMesh;
  index: number;
  target: THREE.Matrix4;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export class Build {
  readonly group = new THREE.Group();
  /** Robots and trays: hidden in the graph chapter, where only bricks stay. */
  readonly machines = new THREE.Group();
  readonly robots: Robot[] = [];
  readonly model: JModel;
  readonly origin: THREE.Vector3;
  private bricks = new Map<string, BrickRef>();
  private jobs: Job[] = [];
  private jobsByWorker: Job[][] = [];
  private parks: { pos: THREE.Vector3; heading: number }[] = [];
  private offline: { worker: number; t: number } | null = null;
  private expiry: { node: string; t: number } | null = null;
  private stations: THREE.Vector3[] = [];
  private lines: THREE.LineSegments;
  private linePos: Float32Array;
  private ghosts: THREE.LineSegments[] = [];
  private edgeGeo = new Map<string, THREE.EdgesGeometry>();
  private rings: THREE.Mesh[] = [];
  private prevPos: THREE.Vector3[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private pose: ArmPose = { ...POSES.travel };
  readonly makespan: number;

  constructor(opts: {
    model: JModel;
    geometries: Map<string, THREE.BufferGeometry>;
    robotTemplate: THREE.Object3D;
    workers: number;
    plinthTop: number;
    shadows: boolean;
  }) {
    this.model = opts.model;
    this.makespan = opts.model.makespan;
    this.origin = new THREE.Vector3(0, opts.plinthTop, 0);

    // ---- bricks, instanced per part
    let minY = Infinity;
    for (const n of opts.model.nodes) {
      const geo = opts.geometries.get(n.part);
      if (!geo) continue;
      geo.computeBoundingBox();
      minY = Math.min(minY, n.pos[1] + geo.boundingBox!.min.y);
    }
    const lift = -minY;
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.9,
    });
    const byPart = new Map<string, JNode[]>();
    for (const n of opts.model.nodes) {
      if (!opts.geometries.has(n.part)) continue;
      if (!byPart.has(n.part)) byPart.set(n.part, []);
      byPart.get(n.part)!.push(n);
    }
    const col = new THREE.Color();
    for (const [part, nodes] of byPart) {
      const mesh = new THREE.InstancedMesh(opts.geometries.get(part)!, material, nodes.length);
      mesh.castShadow = opts.shadows;
      mesh.receiveShadow = opts.shadows;
      mesh.frustumCulled = false;
      nodes.forEach((n, i) => {
        const pos = new THREE.Vector3(n.pos[0], n.pos[1] + lift, n.pos[2]).add(this.origin);
        const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.yawY);
        const target = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
        const g = absGrey(n.color);
        mesh.setColorAt(i, col.setRGB(g, g, g));
        this.bricks.set(n.id, { node: n, mesh, index: i, target, pos, quat });
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }

    // ---- schedule from the tape
    const byNode = new Map(opts.model.nodes.map((n) => [n.id, n]));
    const tape = opts.model.tape;
    const open = new Map<string, Job>();
    for (const e of tape) {
      if (e.type === "job_claimed" && e.worker !== undefined) {
        const job: Job = { node: byNode.get(e.node!)!, worker: e.worker, claim: e.t, done: null, end: Infinity };
        open.set(e.node!, job);
        this.jobs.push(job);
      } else if (e.type === "placement_complete") {
        const job = open.get(e.node!);
        if (job) {
          job.done = e.t;
          job.end = e.t;
          open.delete(e.node!);
        }
      } else if (e.type === "worker_offline") {
        this.offline = { worker: e.worker!, t: e.t };
        for (const job of open.values()) if (job.worker === e.worker) job.end = e.t;
      } else if (e.type === "lease_expired") {
        this.expiry = { node: e.node!, t: e.t };
        open.delete(e.node!);
      }
    }
    for (let w = 0; w < opts.workers; w++) this.jobsByWorker.push(this.jobs.filter((j) => j.worker === w));

    // ---- stations (part supply) and parking ring
    // Each worker owns a sector: its own supply tray and its own side of the
    // model, so paths never cross and robots never stack up.
    for (let w = 0; w < opts.workers; w++) {
      const a = this.sectorAngle(w, opts.workers);
      this.stations.push(new THREE.Vector3(Math.cos(a) * 1.0, opts.plinthTop, Math.sin(a) * 0.82));
    }
    this.addTrays(opts.geometries, material, opts.shadows);
    for (let w = 0; w < opts.workers; w++) {
      const a = this.sectorAngle(w, opts.workers) + 0.35;
      const pos = new THREE.Vector3(Math.cos(a) * 0.68, opts.plinthTop, Math.sin(a) * 0.58);
      this.parks.push({ pos, heading: Math.atan2(pos.z, -pos.x) });
    }

    // ---- robots
    for (let w = 0; w < opts.workers; w++) {
      const r = new Robot(opts.robotTemplate, { shadows: opts.shadows });
      r.setPose(POSES.travel);
      r.setGrip(1);
      this.robots.push(r);
      this.machines.add(r.root);
      this.prevPos.push(new THREE.Vector3());
    }

    this.group.add(this.machines);

    // ---- claim lines, ghosts, verification rings
    this.linePos = new Float32Array(opts.workers * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: 0x1a1c1e, transparent: true, opacity: 0.55, depthWrite: false })
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.group.add(this.lines);
    const ghostMat = new THREE.LineBasicMaterial({ color: 0x1a1c1e, transparent: true, opacity: 0.7, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x111213,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringGeo = new THREE.RingGeometry(0.028, 0.0305, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let w = 0; w < opts.workers + 1; w++) {
      const g = new THREE.LineSegments(new THREE.BufferGeometry(), ghostMat);
      g.visible = false;
      g.renderOrder = 5;
      this.ghosts.push(g);
      this.group.add(g);
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.visible = false;
      ring.renderOrder = 5;
      this.rings.push(ring);
      this.group.add(ring);
    }
  }

  private addTrays(geos: Map<string, THREE.BufferGeometry>, mat: THREE.Material, shadows: boolean) {
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.6 });
    const trayGeo = new THREE.BoxGeometry(0.14, 0.018, 0.2);
    const brick = geos.get("3001") ?? geos.values().next().value;
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const s of this.stations) {
      const tray = new THREE.Mesh(trayGeo, trayMat);
      tray.position.copy(s).setY(s.y + 0.009);
      tray.lookAt(this.origin.x, tray.position.y, this.origin.z);
      tray.castShadow = shadows;
      tray.receiveShadow = shadows;
      this.machines.add(tray);
      if (!brick) continue;
      const pile = new THREE.InstancedMesh(brick, mat, 9);
      const c = new THREE.Color();
      for (let i = 0; i < 9; i++) {
        const p = new THREE.Vector3((rnd() - 0.5) * 0.15, 0.018 + Math.floor(i / 5) * 0.0115, (rnd() - 0.5) * 0.09);
        p.applyQuaternion(tray.quaternion).add(tray.position).setY(s.y + 0.0185 + Math.floor(i / 5) * 0.0115);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
        this.tmpM.compose(p, q, new THREE.Vector3(1, 1, 1));
        pile.setMatrixAt(i, this.tmpM);
        const g = [0.9, 0.62, 0.3, 0.055][i % 4]!;
        pile.setColorAt(i, c.setRGB(g, g, g));
      }
      pile.castShadow = shadows;
      this.machines.add(pile);
    }
  }

  private sectorAngle(w: number, n = this.robots.length || 6): number {
    return -Math.PI / 2 + ((w + 0.5) / n) * Math.PI * 2;
  }

  /** Where worker w stands to place `node`: out from the model along the
   * brick's bearing, fanned per worker so neighbours don't overlap. */
  private approach(node: JNode, w: number): { pos: THREE.Vector3; heading: number } {
    // A small offset along the sector so successive jobs look different.
    const a = this.sectorAngle(w) + ((node.order % 3) - 1) * 0.12;
    const pos = new THREE.Vector3(Math.cos(a) * 0.4, this.origin.y, Math.sin(a) * 0.4).add(
      new THREE.Vector3(this.origin.x, 0, this.origin.z)
    );
    return { pos, heading: Math.atan2(pos.z - this.origin.z, this.origin.x - pos.x) };
  }

  private pickSpot(node: JNode, w: number): { pos: THREE.Vector3; heading: number } {
    void node;
    const s = this.stations[w]!;
    const toModel = new THREE.Vector3().subVectors(this.origin, s).setY(0).normalize();
    const pos = s.clone().addScaledVector(toModel, 0.24);
    // Face the tray: forward (+X local) points from pos to the station.
    const d = new THREE.Vector3().subVectors(s, pos);
    return { pos, heading: Math.atan2(-d.z, d.x) };
  }

  /** Robot heading convention: forward = (cos h, 0, -sin h) = rotation.y h. */
  private place(r: Robot, pos: THREE.Vector3, heading: number) {
    r.root.position.copy(pos);
    r.root.rotation.y = heading;
  }

  private drive(r: Robot, a: { pos: THREE.Vector3; heading: number }, b: { pos: THREE.Vector3; heading: number }, t: number) {
    // Cubic Hermite in the floor plane, tangents along each end's heading.
    const e = smooth(t);
    const dist = a.pos.distanceTo(b.pos);
    const k = dist * 0.9;
    const ta = new THREE.Vector3(Math.cos(a.heading), 0, -Math.sin(a.heading)).multiplyScalar(k);
    const tb = new THREE.Vector3(Math.cos(b.heading), 0, -Math.sin(b.heading)).multiplyScalar(k);
    const e2 = e * e;
    const e3 = e2 * e;
    const h00 = 2 * e3 - 3 * e2 + 1;
    const h10 = e3 - 2 * e2 + e;
    const h01 = -2 * e3 + 3 * e2;
    const h11 = e3 - e2;
    const p = new THREE.Vector3()
      .addScaledVector(a.pos, h00)
      .addScaledVector(ta, h10)
      .addScaledVector(b.pos, h01)
      .addScaledVector(tb, h11);
    // Tangent for heading
    const d00 = 6 * e2 - 6 * e;
    const d10 = 3 * e2 - 4 * e + 1;
    const d01 = -6 * e2 + 6 * e;
    const d11 = 3 * e2 - 2 * e;
    const d = new THREE.Vector3().addScaledVector(a.pos, d00).addScaledVector(ta, d10).addScaledVector(b.pos, d01).addScaledVector(tb, d11);
    const heading = d.lengthSq() > 1e-8 ? Math.atan2(-d.z, d.x) : b.heading;
    this.place(r, p, heading);
  }

  private setBrick(ref: BrickRef, m: THREE.Matrix4 | null) {
    if (m) ref.mesh.setMatrixAt(ref.index, m);
    else ref.mesh.setMatrixAt(ref.index, this.tmpM.makeScale(0, 0, 0));
    ref.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Optional hook for chapter 04: return a matrix to override a placed
   * brick's resting transform (used to lift bricks into the graph). */
  brickOverride: ((ref: { node: JNode; pos: THREE.Vector3; quat: THREE.Quaternion }, out: THREE.Matrix4) => boolean) | null = null;

  update(tau: number, opts: { lines: number } = { lines: 1 }): BuildSnapshot {
    const lp = this.linePos;
    lp.fill(0);
    for (const g of this.ghosts) g.visible = false;
    for (const r of this.rings) r.visible = false;
    let ghostI = 0;
    let ringI = 0;

    // Bricks: placed ones rest at target; carried ones follow their robot.
    const carried = new Set<string>();
    for (let w = 0; w < this.robots.length; w++) {
      const r = this.robots[w]!;
      const jobs = this.jobsByWorker[w]!;
      const off = this.offline && this.offline.worker === w && tau >= this.offline.t;
      // The latest job this worker has claimed by tau, and the one before it.
      let idx = -1;
      for (let k = 0; k < jobs.length; k++) if (jobs[k]!.claim <= tau) idx = k;
      let job: Job | undefined = idx >= 0 ? jobs[idx] : undefined;
      let prev: Job | undefined = idx > 0 ? jobs[idx - 1] : undefined;
      if (job && job.done !== null && tau >= job.done) {
        prev = job;
        job = undefined;
      }
      const from = prev ? this.approach(prev.node, w) : this.parks[w]!;
      const status = off ? 0 : 3.5;
      r.setStatus(status);

      if (!job) {
        this.place(r, from.pos, from.heading);
        lerpPose(POSES.travel, POSES.travel, 0, this.pose);
        r.setPose(this.pose);
        r.setGrip(1);
        continue;
      }

      const dur = (job.done ?? job.claim + 2.2) - job.claim;
      const tNow = Math.min(tau, job.end);
      const f = clamp01((tNow - job.claim) / dur);
      const pick = this.pickSpot(job.node, w);
      const app = this.approach(job.node, w);
      const ref = this.bricks.get(job.node.id)!;

      if (f < PHASE.pickStart) this.drive(r, from, pick, f / PHASE.pickStart);
      else if (f < PHASE.pickEnd) this.place(r, pick.pos, pick.heading);
      else if (f < PHASE.placeStart) this.drive(r, pick, app, seg(f, PHASE.pickEnd, PHASE.placeStart));
      else this.place(r, app.pos, app.heading);

      // Arm
      let reach = 0;
      if (f >= PHASE.pickStart && f < PHASE.pickEnd) reach = Math.sin(seg(f, PHASE.pickStart, PHASE.pickEnd) * Math.PI);
      if (f >= PHASE.placeStart && f < 1) reach = Math.sin(seg(f, PHASE.placeStart, 0.97) * Math.PI);
      lerpPose(POSES.travel, POSES.reach, smooth(reach), this.pose);
      r.setPose(this.pose);
      const holding = f >= (PHASE.pickStart + PHASE.pickEnd) / 2 && f < PHASE.placeStart + (PHASE.placeEnd - PHASE.placeStart) * 0.6;
      r.setGrip(holding ? 0 : 1);

      // The brick rides in the gripper, then settles onto its target.
      if (holding || (f >= PHASE.placeStart && f < PHASE.placeEnd)) {
        r.root.updateMatrixWorld(true);
        const grip = r.anchor("gripper");
        if (grip) {
          grip.getWorldPosition(this.tmpV);
          this.tmpV.y -= 0.045;
          const k = smooth(seg(f, PHASE.placeStart + 0.03, PHASE.placeEnd));
          this.tmpV.lerp(ref.pos, k);
          this.tmpQ.copy(ref.quat);
          this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS.set(1, 1, 1));
          if (!off || f < PHASE.placeStart) {
            this.setBrick(ref, this.tmpM);
            carried.add(job.node.id);
          }
        }
      }

      // Claim line: robot to the job's target, fading if the robot is gone.
      if (opts.lines > 0) {
        r.root.updateMatrixWorld(true);
        const ring = r.anchor("led_ring");
        if (ring) ring.getWorldPosition(this.tmpV);
        else this.tmpV.copy(r.root.position);
        const i = w * 6;
        lp[i] = this.tmpV.x;
        lp[i + 1] = this.tmpV.y + 0.005;
        lp[i + 2] = this.tmpV.z;
        lp[i + 3] = ref.pos.x;
        lp[i + 4] = ref.pos.y + 0.012;
        lp[i + 5] = ref.pos.z;
        if (off) {
          // A silent lease: shrink the line toward the robot as it expires.
          const ttl = this.expiry ? clamp01((tau - this.offline!.t) / (this.expiry.t - this.offline!.t)) : 1;
          lp[i + 3] = this.tmpV.x + (ref.pos.x - this.tmpV.x) * (1 - ttl);
          lp[i + 4] = this.tmpV.y + (ref.pos.y - this.tmpV.y) * (1 - ttl);
          lp[i + 5] = this.tmpV.z + (ref.pos.z - this.tmpV.z) * (1 - ttl);
        }
        // Ghost outline of the claimed slot until the brick lands.
        if (f < PHASE.placeEnd && ghostI < this.ghosts.length) {
          const g = this.ghosts[ghostI++]!;
          g.geometry = this.edges(job.node.part, ref);
          g.position.copy(ref.pos);
          g.quaternion.copy(ref.quat);
          g.visible = !(off && this.expiry && tau >= this.expiry.t);
        }
      }

      // Verification pulse.
      if (job.done !== null && f >= PHASE.placeEnd && ringI < this.rings.length) {
        const ring = this.rings[ringI++]!;
        const k = seg(f, PHASE.placeEnd, 1);
        ring.visible = opts.lines > 0;
        ring.position.copy(ref.pos).setY(ref.pos.y + 0.002);
        ring.scale.setScalar(1 + k * 1.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - k);
      }
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
    (this.lines.material as THREE.LineBasicMaterial).opacity = 0.55 * opts.lines;

    // Expired-lease slot: outline waits for a survivor to claim it.
    if (this.expiry && tau >= this.expiry.t && opts.lines > 0) {
      const reclaimed = this.jobs.some((j) => j.node.id === this.expiry!.node && j.claim >= this.expiry!.t && j.claim <= tau);
      if (!reclaimed && ghostI < this.ghosts.length) {
        const ref = this.bricks.get(this.expiry.node)!;
        const g = this.ghosts[ghostI++]!;
        g.geometry = this.edges(ref.node.part, ref);
        g.position.copy(ref.pos);
        g.quaternion.copy(ref.quat);
        g.visible = true;
      }
    }

    let complete = 0;
    const waveDone = new Array<number>(this.model.waveCount).fill(0);
    const waveTotal = new Array<number>(this.model.waveCount).fill(0);
    for (const job of this.jobs) {
      if (job.done === null) continue;
      const ref = this.bricks.get(job.node.id)!;
      waveTotal[job.node.wave]!++;
      const placed = tau >= job.done;
      if (placed) {
        complete++;
        waveDone[job.node.wave]!++;
      }
      if (carried.has(job.node.id)) continue;
      if (placed) {
        if (this.brickOverride && this.brickOverride(ref, this.tmpM)) this.setBrick(ref, this.tmpM);
        else this.setBrick(ref, ref.target);
      } else {
        this.setBrick(ref, null);
      }
    }

    let wire = 0;
    let activeClaims = 0;
    const log: TapeEvent[] = [];
    for (const e of this.model.tape) {
      if (e.t > tau) break;
      if (!e.local) wire++;
      log.push(e);
    }
    for (const j of this.jobs) if (j.claim <= tau && tau < (j.done ?? (this.expiry?.t ?? Infinity))) activeClaims++;
    let wave = 0;
    for (let i = 0; i < waveDone.length; i++) if (waveDone[i]! > 0) wave = i;
    return {
      tau,
      complete,
      total: this.model.nodes.length,
      wave,
      waves: waveDone.map((d, i) => (waveTotal[i] ? d / waveTotal[i]! : 0)),
      waveCount: this.model.waveCount,
      activeClaims,
      wire,
      online: this.robots.length - (this.offline && tau >= this.offline.t ? 1 : 0),
      workers: this.robots.length,
      log: log.slice(-3).reverse(),
    };
  }

  private edges(part: string, ref: BrickRef): THREE.EdgesGeometry {
    let g = this.edgeGeo.get(part);
    if (!g) {
      g = new THREE.EdgesGeometry(ref.mesh.geometry, 30);
      this.edgeGeo.set(part, g);
    }
    return g;
  }

  /** Wheels turn with distance actually travelled. */
  rollWheels(): void {
    this.robots.forEach((r, i) => {
      const prev = this.prevPos[i]!;
      const d = prev.distanceTo(r.root.position);
      if (d > 0 && d < 0.5) r.roll(d);
      prev.copy(r.root.position);
    });
  }

  brick(id: string): BrickRef | undefined {
    return this.bricks.get(id);
  }

  allBricks(): IterableIterator<BrickRef> {
    return this.bricks.values();
  }
}
