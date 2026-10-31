import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { node } from "./assets";

/** A worker robot instance over the scripted GLB (see
 * assets-src/blender/build_worker.py for the node contract).
 *
 * Joint angles are authored in degrees in the robot's own sense:
 *   yaw      turret about vertical
 *   shoulder + leans the upper arm forward (toward +X)
 *   elbow    + folds the forearm forward/down
 *   wrist    + tips the gripper forward/down
 */
export interface ArmPose {
  yaw: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  roll: number;
}

export const POSES = {
  /** Compact travel pose: arm folded back over the turret. */
  travel: { yaw: 0, shoulder: -24, elbow: 132, wrist: 64, roll: 0 },
  /** Display pose for the hero: alert, slightly raised. */
  display: { yaw: -18, shoulder: -14, elbow: 112, wrist: 52, roll: 0 },
  /** Gripper down at the floor ahead of the base, for pick and place. */
  reach: { yaw: 0, shoulder: 42, elbow: 70, wrist: 66, roll: 0 },
  /** Straight up: the exported rest pose, used while exploded. */
  rest: { yaw: 0, shoulder: 0, elbow: 0, wrist: 0, roll: 0 },
} satisfies Record<string, ArmPose>;

export function lerpPose(a: ArmPose, b: ArmPose, k: number, out: ArmPose = { ...a }): ArmPose {
  out.yaw = a.yaw + (b.yaw - a.yaw) * k;
  out.shoulder = a.shoulder + (b.shoulder - a.shoulder) * k;
  out.elbow = a.elbow + (b.elbow - a.elbow) * k;
  out.wrist = a.wrist + (b.wrist - a.wrist) * k;
  out.roll = a.roll + (b.roll - a.roll) * k;
  return out;
}

const D2R = Math.PI / 180;

/** Which public part (the chapter 02 list) an exported assembly belongs to. */
export function partOf(assembly: string): string {
  if (assembly.startsWith("drive")) return "drive";
  if (assembly === "shell" || assembly.startsWith("caster")) return "chassis";
  return assembly;
}

export interface Assembly {
  name: string;
  label: string;
  obj: THREE.Object3D;
  rest: THREE.Vector3;
  offset: THREE.Vector3;
  order: number;
  materials: THREE.MeshStandardMaterial[];
}

export class Robot {
  readonly root: THREE.Group;
  readonly assemblies = new Map<string, Assembly>();
  private j1: THREE.Object3D;
  private j2: THREE.Object3D;
  private j3: THREE.Object3D;
  private j4: THREE.Object3D;
  private link1: THREE.Object3D;
  private wheels: THREE.Object3D[];
  private fingers: THREE.Object3D[];
  private fingerRest: number[];
  private ring: THREE.MeshStandardMaterial | null = null;
  private maxOrder = 0;

  /** `unique` gives the instance its own materials (needed for isolate
   * fades and its own status light); fleet robots share where they can. */
  constructor(template: THREE.Object3D, opts: { unique?: boolean; shadows?: boolean } = {}) {
    this.root = new THREE.Group();
    const model = cloneSkinned(template);
    this.root.add(model);
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = !!opts.shadows;
      o.receiveShadow = false;
      const m = o.material as THREE.MeshStandardMaterial;
      if (m.name === "status_emitter" || opts.unique) {
        o.material = m.clone();
      }
      if ((o.material as THREE.Material).name === "status_emitter") this.ring = o.material as THREE.MeshStandardMaterial;
    });
    this.j1 = node(model, "arm_j1");
    this.link1 = node(model, "arm_link1");
    this.j2 = node(model, "arm_j2");
    this.j3 = node(model, "arm_j3");
    this.j4 = node(model, "arm_j4");
    this.wheels = [node(model, "wheel_L"), node(model, "wheel_R")];
    this.fingers = [node(model, "finger_L"), node(model, "finger_R")];
    this.fingerRest = this.fingers.map((f) => f.position.z);
    model.traverse((o) => {
      if (!o.name.startsWith("asm_")) return;
      const ex = o.userData.explode as number[] | undefined;
      if (!ex) return;
      const materials: THREE.MeshStandardMaterial[] = [];
      o.traverse((m) => {
        if (m instanceof THREE.Mesh) materials.push(m.material as THREE.MeshStandardMaterial);
      });
      const order = Number(o.userData.order ?? 0);
      this.maxOrder = Math.max(this.maxOrder, order);
      this.assemblies.set(o.name.slice(4), {
        name: o.name.slice(4),
        label: String(o.userData.label ?? o.name),
        obj: o,
        rest: o.position.clone(),
        offset: new THREE.Vector3(ex[0], ex[1], ex[2]),
        order,
        materials,
      });
    });
  }

  setPose(p: ArmPose): void {
    // Blender pitch (about +Y) becomes rotation about three's -Z.
    this.j1.rotation.y = p.yaw * D2R;
    this.link1.rotation.z = -p.shoulder * D2R;
    this.j2.rotation.z = -p.elbow * D2R;
    this.j3.rotation.z = -p.wrist * D2R;
    this.j4.rotation.y = p.roll * D2R;
  }

  /** 0 = closed on a brick, 1 = open. */
  setGrip(open: number): void {
    const inward = (1 - open) * 0.0075;
    this.fingers[0]!.position.z = this.fingerRest[0]! + inward;
    this.fingers[1]!.position.z = this.fingerRest[1]! - inward;
  }

  /** Advance the wheels by a distance travelled (metres). */
  roll(distance: number): void {
    const a = distance / 0.046;
    for (const w of this.wheels) w.rotation.z -= a;
  }

  setStatus(intensity: number): void {
    if (this.ring) this.ring.emissiveIntensity = intensity;
  }

  /** k in 0..1. Assemblies leave in their `order`, staggered, and return in
   * reverse, each with an ease that starts and lands softly. */
  setExplode(k: number): void {
    const spread = 0.45;
    for (const a of this.assemblies.values()) {
      const start = (a.order / Math.max(1, this.maxOrder)) * spread;
      const t = Math.min(1, Math.max(0, (k * (1 + spread) - start) / 1));
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      a.obj.position.copy(a.rest).addScaledVector(a.offset, e);
    }
  }

  /** Fade every assembly but `name` (null restores). Needs `unique`. */
  isolate(name: string | null, k = 1): void {
    for (const a of this.assemblies.values()) {
      const dim = name !== null && partOf(a.name) !== name;
      const target = dim ? 1 - 0.82 * k : 1;
      for (const m of a.materials) {
        if (m.name === "status_emitter") continue;
        m.transparent = target < 0.999;
        m.opacity = target;
        m.depthWrite = target > 0.5;
      }
    }
  }

  anchor(name: string): THREE.Object3D | undefined {
    return this.root.getObjectByName(name) ?? undefined;
  }
}
