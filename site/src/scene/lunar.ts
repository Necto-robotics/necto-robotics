import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { loadGLB } from "./assets";
import { Robot, POSES, lerpPose } from "./robot";

/** Chapter 05 (concept): the same robots, scaled up, assembling a low
 * modular ring on a lunar plain. Built procedurally at runtime: terrain
 * from layered noise and craters, a hard low sun, a crescent Earth, and a
 * structure laid in a running bond so it still reads as bricks.
 *
 * Loaded only when the reader approaches chapter 05. */
export interface LunarRealm {
  scene: THREE.Scene;
  update(u: number, time: number, dt: number, camera: THREE.Camera, reduced: boolean): void;
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x, y);
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s;
}

const CRATERS: [number, number, number][] = [
  [-22, -18, 7],
  [30, -26, 10],
  [14, 22, 4.5],
  [-34, 16, 6],
  [44, 10, 5],
  [-8, -40, 9],
  [24, -6, 2.8],
  [-18, 30, 3.2],
  [6, -18, 2.2],
];

function height(x: number, z: number): number {
  let h = (fbm(x * 0.035, z * 0.035) - 0.5) * 2.6 + (fbm(x * 0.4, z * 0.4) - 0.5) * 0.12;
  for (const [cx, cz, r] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d < 1.6) {
      const bowl = d < 1 ? -(1 - d * d) * r * 0.22 : 0;
      const rim = Math.exp(-((d - 1) * (d - 1)) / 0.04) * r * 0.06;
      h += bowl + rim;
    }
  }
  // The construction pad: graded flat around the structure.
  const pad = Math.hypot(x, z);
  const flat = Math.min(1, Math.max(0, (pad - 9) / 8));
  return h * flat - 0.05 * (1 - flat);
}

export async function createLunar(opts: {
  robotTemplate: THREE.Object3D;
  tier: "high" | "mid" | "low";
  renderer: THREE.WebGLRenderer;
}): Promise<LunarRealm> {
  const lod = await loadGLB("worker-lod.glb").catch(() => null);
  const template = lod?.scene ?? opts.robotTemplate;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const shadows = opts.tier !== "low";

  // Terrain
  const seg = opts.tier === "high" ? 320 : opts.tier === "mid" ? 220 : 140;
  const g = new THREE.PlaneGeometry(160, 160, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color: 0x8b8b8a, roughness: 0.97, metalness: 0 })
  );
  ground.receiveShadow = shadows;
  scene.add(ground);

  // Low, hard sun from the left; faint earthshine fill.
  const sun = new THREE.DirectionalLight(0xffffff, 4.2);
  sun.position.set(-40, 9, 14);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 100 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x9aa0a8, 0x000000, 0.12));

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) {
    const th = hash(i, 1) * Math.PI * 2;
    const ph = Math.acos(hash(i, 2) * 0.9 + 0.1 - 0.05);
    sp[i * 3] = Math.sin(ph) * Math.cos(th) * 300;
    sp[i * 3 + 1] = Math.cos(ph) * 300;
    sp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 300;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(
    new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 }))
  );

  // Crescent Earth, monochrome.
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(9, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(-1, 0.2, 0.35).normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vP;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vN; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){
          float l = max(dot(vN, uSun), 0.0);
          float cloud = smoothstep(0.45, 0.8, n(vP*0.35) * 0.6 + n(vP*0.9) * 0.4);
          float land = smoothstep(0.5, 0.56, n(vP*0.18 + 3.0));
          float albedo = 0.18 + 0.22 * land + 0.55 * cloud;
          float rim = pow(1.0 - abs(vN.z), 3.0) * 0.25 * l;
          gl_FragColor = vec4(vec3(albedo * l + rim), 1.0);
        }`,
    })
  );
  earth.position.set(70, 34, -190);
  scene.add(earth);

  // The structure: a ring of modules in running bond, partly complete.
  const RING_R = 6;
  const MOD = { w: 1.5, h: 0.62, d: 0.7 };
  const modGeo = new RoundedBoxGeometry(MOD.w, MOD.h, MOD.d, 2, 0.05);
  const modMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d6, roughness: 0.55, metalness: 0.05 });
  const courses = 5;
  const perCourse = Math.floor((Math.PI * 2 * RING_R) / (MOD.w + 0.04));
  const total = courses * perCourse;
  const mods = new THREE.InstancedMesh(modGeo, modMat, total);
  mods.castShadow = shadows;
  mods.receiveShadow = shadows;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const slots: { pos: THREE.Vector3; quat: THREE.Quaternion; built: boolean }[] = [];
  for (let c = 0; c < courses; c++) {
    for (let i = 0; i < perCourse; i++) {
      const a = ((i + (c % 2) * 0.5) / perCourse) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * RING_R, MOD.h / 2 + c * (MOD.h + 0.02), Math.sin(a) * RING_R);
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      // Lower courses complete; upper courses fill one arc, like a build in progress.
      const arc = (a / (Math.PI * 2) + 0.15) % 1;
      const built = c < 2 || (c === 2 && arc < 0.78) || (c === 3 && arc < 0.42) || (c === 4 && arc < 0.12);
      slots.push({ pos, quat, built });
    }
  }
  slots.forEach((s, i) => mods.setMatrixAt(i, m4.compose(s.pos, s.quat, s.built ? one : zero)));
  scene.add(mods);
  // Ghost outlines on the next few open slots: the plan ahead of the build.
  const ghostMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(MOD.w, MOD.h, MOD.d));
  slots
    .filter((s) => !s.built)
    .slice(0, 10)
    .forEach((s) => {
      const l = new THREE.LineSegments(edges, ghostMat);
      l.position.copy(s.pos);
      l.quaternion.copy(s.quat);
      scene.add(l);
    });

  // Robots, scaled up: each carries a module around the ring toward the arc.
  const SCALE = 4.4;
  const N = opts.tier === "low" ? 8 : 14;
  const robots: { r: Robot; carry: THREE.Mesh | null; phase: number; lane: number }[] = [];
  for (let i = 0; i < N; i++) {
    const r = new Robot(template, { shadows });
    r.root.scale.setScalar(SCALE);
    r.setPose(POSES.travel);
    r.setStatus(3);
    scene.add(r.root);
    let carry: THREE.Mesh | null = null;
    if (i % 2 === 0) {
      carry = new THREE.Mesh(modGeo, modMat);
      carry.scale.setScalar(0.62);
      carry.castShadow = shadows;
      scene.add(carry);
    }
    robots.push({ r, carry, phase: i / N, lane: i % 3 });
  }
  q.identity();
  void zero;

  const pose = { ...POSES.travel };
  return {
    scene,
    update(_u, time, _dt, _camera, reduced) {
      const t = reduced ? 0 : time;
      robots.forEach((b, i) => {
        const radius = RING_R + 2.6 + b.lane * 1.6;
        const a = b.phase * Math.PI * 2 + t * (0.025 + b.lane * 0.006) * (i % 2 ? 1 : -1);
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        b.r.root.position.set(x, height(x, z), z);
        const dir = i % 2 ? 1 : -1;
        // Tangent heading in the robot convention.
        const tx = -Math.sin(a) * dir;
        const tz = Math.cos(a) * dir;
        b.r.root.rotation.y = Math.atan2(-tz, tx);
        b.r.roll(reduced ? 0 : 0.004);
        lerpPose(POSES.travel, POSES.reach, b.carry ? 0.18 : 0.5 + 0.5 * Math.sin(t * 0.6 + i), pose);
        b.r.setPose(pose);
        if (b.carry) {
          b.carry.position.set(x, height(x, z) + 0.62 * SCALE * 0.2 + 1.05, z);
          b.carry.rotation.y = b.r.root.rotation.y;
        }
      });
    },
  };
}
