import * as THREE from "three";

/** Camera choreography as a function of story position u.
 *
 * Keys are authored per chapter; between keys the camera follows a
 * centripetal Catmull-Rom spline (position and look target separately), so
 * motion is continuous through every key. The page scrolls natively; a
 * critically damped spring sits between the scroll-derived pose and the
 * camera, which gives the film-like ease without ever holding the page. */
export interface CamKey {
  u: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

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
  private uAt: (s: number) => number;
  private sAt: (u: number) => number;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  fov = 32;
  private vel = new THREE.Vector3();
  private lookVel = new THREE.Vector3();
  private fovVel = 0;
  private primed = false;
  private tmp = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  /** Cut instead of fly (reduced motion): snap to the nearest chapter key. */
  cut = false;

  constructor(keys: CamKey[]) {
    this.keys = keys;
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
    this.lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, "centripetal");
    this.fovAt = curve(keys.map((k) => [k.u, k.fov]));
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

  /** Target pose for u (no damping). */
  target(u: number, outPos: THREE.Vector3, outLook: THREE.Vector3): number {
    if (this.cut) {
      // Hold the key nearest the middle of the current chapter.
      const ch = Math.floor(u);
      let best = this.keys[0]!;
      for (const k of this.keys) if (Math.abs(k.u - (ch + 0.5)) < Math.abs(best.u - (ch + 0.5))) best = k;
      outPos.set(...best.pos);
      outLook.set(...best.look);
      return best.fov;
    }
    const s = this.sAt(u);
    this.posCurve.getPoint(s, outPos);
    this.lookCurve.getPoint(s, outLook);
    return this.fovAt(u);
  }

  update(u: number, dt: number, camera: THREE.PerspectiveCamera, drift = 0): void {
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
    camera.position.copy(this.pos);
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
