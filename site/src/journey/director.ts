import * as THREE from "three";
import type { OrbitOffset } from "./orbit";

/** Camera choreography as a function of story position u.
 *
 * Keys are authored per chapter; between keys the camera follows a
 * centripetal Catmull-Rom spline (position and look target separately), so
 * motion is continuous through every key. The page scrolls natively; a
 * critically damped spring sits between the scroll-derived pose and the
 * camera, which gives the film-like ease without ever holding the page.
 *
 * A key may ask for `ortho`: the lens narrows toward a long, schematic
 * projection while the camera dollies back along its own axis so the
 * subject keeps its size on screen. Perspective drains out of the picture
 * (the Vertigo move), which is how the exploded robot and the graph read as
 * drawings rather than photographs. */
export interface CamKey {
  u: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  /** 0 = authored perspective, 1 = near-orthographic (ORTHO_FOV). */
  ortho?: number;
}

/** The long lens that stands in for an orthographic projection. */
export const ORTHO_FOV = 9;
const D2R = Math.PI / 180;

/** Piecewise smooth scalar keyed on u: [[u, value], ...]. */
export function curve(keys: [number, number][]): (u: number) => number {
  return (u) => {
    if (u <= keys[0]![0]) return keys[0]![1];
    for (let i = 1; i < keys.length; i++) {
      const [u1, v1] = keys[i]!;
      if (u <= u1) {
        const [u0, v0] = keys[i - 1]!;
        const t = (u - u0) / (u1 - u0);
        return v0 + (v1 - v0) * t * t * (3 - 2 * t);
      }
    }
    return keys[keys.length - 1]![1];
  };
}

export class Director {
  private keys: CamKey[];
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  private fovAt: (u: number) => number;
  private orthoAt: (u: number) => number;
  private uAt: (s: number) => number;
  private sAt: (u: number) => number;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  fov = 32;
  /** How orthographic the current target is (for the readout). */
  ortho = 0;
  private vel = new THREE.Vector3();
  private lookVel = new THREE.Vector3();
  private fovVel = 0;
  private primed = false;
  private tmp = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  private off = new THREE.Vector3();
  private right = new THREE.Vector3();
  private q = new THREE.Quaternion();
  /** Cut instead of fly (reduced motion): snap to the nearest chapter key. */
  cut = false;

  constructor(keys: CamKey[]) {
    this.keys = keys;
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
    this.lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, "centripetal");
    this.fovAt = curve(keys.map((k) => [k.u, k.fov]));
    this.orthoAt = curve(keys.map((k) => [k.u, k.ortho ?? 0]));
    // Spline parameter s (0..1, uniform per key) <-> story position u.
    const n = keys.length - 1;
    this.sAt = (u) => {
      if (u <= keys[0]!.u) return 0;
      for (let i = 1; i < keys.length; i++) {
        if (u <= keys[i]!.u) {
          const t = (u - keys[i - 1]!.u) / (keys[i]!.u - keys[i - 1]!.u);
          return (i - 1 + t) / n;
        }
      }
      return 1;
    };
    this.uAt = (s) => {
      const f = s * n;
      const i = Math.min(n - 1, Math.floor(f));
      return keys[i]!.u + (keys[i + 1]!.u - keys[i]!.u) * (f - i);
    };
  }

  /** Target pose for u (no damping). Returns the effective fov. */
  target(u: number, outPos: THREE.Vector3, outLook: THREE.Vector3): number {
    let fov: number;
    let ortho: number;
    if (this.cut) {
      // Hold the key nearest the middle of the current chapter.
      const ch = Math.floor(u);
      let best = this.keys[0]!;
      for (const k of this.keys) if (Math.abs(k.u - (ch + 0.5)) < Math.abs(best.u - (ch + 0.5))) best = k;
      outPos.set(...best.pos);
      outLook.set(...best.look);
      fov = best.fov;
      ortho = best.ortho ?? 0;
    } else {
      const s = this.sAt(u);
      this.posCurve.getPoint(s, outPos);
      this.lookCurve.getPoint(s, outLook);
      fov = this.fovAt(u);
      ortho = this.orthoAt(u);
    }
    this.ortho = ortho;
    if (ortho > 0.001) {
      const narrow = fov + (ORTHO_FOV - fov) * ortho;
      const scale = Math.tan((fov * D2R) / 2) / Math.tan((narrow * D2R) / 2);
      outPos.sub(outLook).multiplyScalar(scale).add(outLook);
      fov = narrow;
    }
    return fov;
  }

  update(u: number, dt: number, camera: THREE.PerspectiveCamera, drift = 0, orbit: OrbitOffset | null = null, orbitK = 0): void {
    const fov = this.target(u, this.tmp, this.tmpL);
    if (!this.primed || this.cut || dt <= 0) {
      this.pos.copy(this.tmp);
      this.look.copy(this.tmpL);
      this.fov = fov;
      this.primed = true;
    } else {
      // Critically damped spring, ~0.35 s settle.
      const omega = 9;
      const k = Math.min(dt, 0.05);
      spring(this.pos, this.vel, this.tmp, omega, k);
      spring(this.look, this.lookVel, this.tmpL, omega, k);
      const x = this.fov - fov;
      const a = -omega * omega * x - 2 * omega * this.fovVel;
      this.fovVel += a * k;
      this.fov += this.fovVel * k;
    }
    // Reader orbit: turn the settled pose about its look target.
    this.off.subVectors(this.pos, this.look);
    if (orbit && orbitK > 0.001) {
      const yaw = orbit.yaw * orbitK;
      const pitch = orbit.pitch * orbitK;
      const zoom = 1 + (orbit.zoom - 1) * orbitK;
      this.right.set(this.off.z, 0, -this.off.x).normalize();
      this.q.setFromAxisAngle(this.right, -pitch);
      this.off.applyQuaternion(this.q);
      this.q.setFromAxisAngle(UP, yaw);
      this.off.applyQuaternion(this.q);
      this.off.multiplyScalar(zoom);
      // Never dip under the floor the subject stands on.
      const minY = this.look.y - 0.02;
      if (this.look.y + this.off.y < minY) this.off.y = minY - this.look.y;
    }
    camera.position.addVectors(this.look, this.off);
    if (drift) {
      // Hand-held breath: a few millimetres, only where nothing else moves.
      const t = performance.now() / 1000;
      camera.position.x += Math.sin(t * 0.31) * 0.004 * drift;
      camera.position.y += Math.sin(t * 0.23 + 1.3) * 0.003 * drift;
    }
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - this.fov) > 1e-3) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  get span(): [number, number] {
    return [this.keys[0]!.u, this.keys[this.keys.length - 1]!.u];
  }

  /** For tests/debug: u at spline parameter s. */
  uOf(s: number): number {
    return this.uAt(s);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function spring(x: THREE.Vector3, v: THREE.Vector3, target: THREE.Vector3, omega: number, dt: number) {
  const ax = -omega * omega * (x.x - target.x) - 2 * omega * v.x;
  const ay = -omega * omega * (x.y - target.y) - 2 * omega * v.y;
  const az = -omega * omega * (x.z - target.z) - 2 * omega * v.z;
  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;
  x.x += v.x * dt;
  x.y += v.y * dt;
  x.z += v.z * dt;
}
