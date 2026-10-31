import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

/** The assembly hall: baked architecture (one lightmap atlas, shown unlit so
 * the bake is exactly what you see), plus the real-time parts that make it
 * live: the sun that lights robots and bricks, shadow catchers on the
 * plinth and floor, light shafts under the skylights and drifting dust.
 *
 * `setDaylight(k)` takes the hall from full daylight (1) to black (0); the
 * dark chapters use it to turn the same room into a studio and a void. */
export interface Hall {
  group: THREE.Group;
  plinthTop: number;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  setDaylight(k: number): void;
  /** Warm-to-cool, high-to-low: 0 = noon, 1 = dusk (closing chapter). */
  setDusk(k: number): void;
  update(time: number): void;
}

const SHAFT_VERT = /* glsl */ `
  attribute float aAcross;
  varying float vAcross;
  varying vec3 vWorld;
  void main() {
    vAcross = aAcross;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SHAFT_FRAG = /* glsl */ `
  uniform float uK;
  uniform float uTime;
  uniform float uHeight;
  varying float vAcross;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float h = clamp(vWorld.y / uHeight, 0.0, 1.0);
    // Brightest just under the slot, fading toward the floor.
    float fall = smoothstep(0.0, 0.35, h) * (0.35 + 0.65 * h);
    float n = 0.65 + 0.35 * noise(vWorld.xz * 1.3 + vec2(uTime * 0.03, 0.0));
    float edge = 1.0 - pow(abs(vAcross) * 2.0, 6.0);
    float a = uK * fall * n * max(edge, 0.0);
    gl_FragColor = vec4(vec3(1.0), a);
  }
`;

export function createHall(gltf: GLTF, tier: "high" | "mid" | "low"): Hall {
  const group = new THREE.Group();
  const root = gltf.scene.getObjectByName("hall_root") ?? gltf.scene;
  const extras = root.userData as {
    plinth_h: number;
    lightmap_scale: number;
    sun_dir: number[];
    interior: number[];
  };
  const scale = extras.lightmap_scale ?? 3;
  const [W, H, D] = (extras.interior ?? [16, 5.2, 11]) as [number, number, number];
  const plinthTop = extras.plinth_h ?? 0.14;

  const baked: THREE.MeshBasicMaterial[] = [];
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.material as THREE.MeshStandardMaterial;
    const map = src.map;
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(scale, scale, scale) });
    o.material = m;
    baked.push(m);
  });
  group.add(gltf.scene);

  // Sun: the same direction the bake used, so real-time shadows agree with
  // the baked shafts.
  const sunDir = new THREE.Vector3(...((extras.sun_dir ?? [0.16, 0.85, 0.5]) as [number, number, number])).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.copy(sunDir).multiplyScalar(6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = tier !== "low";
  sun.shadow.mapSize.set(tier === "high" ? 2048 : 1024, tier === "high" ? 2048 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -2.2;
  sc.right = 2.2;
  sc.top = 2.2;
  sc.bottom = -2.2;
  sc.near = 1;
  sc.far = 12;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 3;
  group.add(sun, sun.target);
  const sky = new THREE.HemisphereLight(0xf4f5f6, 0x6a6a6a, 0.9);
  group.add(sky);

  // Shadow catchers: real-time contact with the baked surfaces.
  const catchers: THREE.ShadowMaterial[] = [];
  const addCatcher = (w: number, d: number, y: number, opacity: number) => {
    const m = new THREE.ShadowMaterial({ opacity, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
    catchers.push(m);
  };
  addCatcher(3.4, 2.4, plinthTop + 0.0005, 0.34);

  // Light shafts: one slanted volume per skylight slot.
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0.05 }, uTime: { value: 0 }, uHeight: { value: H } },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const slots = 6;
  const beamW = (W / slots) * 0.62;
  const slotW = W / slots - beamW;
  if (tier !== "low") {
    for (let i = 0; i < slots; i++) {
      const xc = -W / 2 + (i + 0.5) * (W / slots);
      // A unit box sheared along -sunDir so its top sits in the slot and its
      // foot lands where the baked light patch is.
      const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const across = new Float32Array(pos.count);
      for (let v = 0; v < pos.count; v++) {
        const lx = pos.getX(v);
        across[v] = lx;
        const ly = pos.getY(v) + 0.5; // 0 bottom, 1 top
        const lz = pos.getZ(v);
        const y = ly * H;
        const back = (H - y) / sunDir.y;
        pos.setXYZ(v, lx * slotW * 0.98 - sunDir.x * back, y, lz * (D - 1.2) - sunDir.z * back);
      }
      g.setAttribute("aAcross", new THREE.BufferAttribute(across, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, shaftMat);
      mesh.position.x = xc;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
  }

  // Dust: drifting motes, brighter inside the shafts.
  const DUST = tier === "high" ? 2200 : tier === "mid" ? 1100 : 0;
  let dust: THREE.Points | null = null;
  let dustMat: THREE.ShaderMaterial | null = null;
  if (DUST) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(DUST * 3);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < DUST; i++) {
      p[i * 3] = (rnd() - 0.5) * 9;
      p[i * 3 + 1] = rnd() * 3.6;
      p[i * 3 + 2] = (rnd() - 0.5) * 7;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uK: { value: 1 },
        uSun: { value: sunDir },
        uSlotPitch: { value: W / slots },
        uSlotW: { value: slotW },
        uW: { value: W },
        uH: { value: H },
        uDpr: { value: Math.min(devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uSlotPitch, uSlotW, uW, uH, uDpr;
        uniform vec3 uSun;
        varying float vLit;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.05 + position.y * 3.1) * 0.12;
          p.y = mod(position.y + uTime * 0.012, 3.6);
          p.z += cos(uTime * 0.04 + position.x * 2.3) * 0.12;
          // Trace back up to the ceiling along the sun: inside a slot = lit.
          float back = (uH - p.y) / uSun.y;
          float xs = p.x + uSun.x * back + uW * 0.5;
          float cell = mod(xs, uSlotPitch) - uSlotPitch * 0.5;
          vLit = smoothstep(uSlotW * 0.5, uSlotW * 0.35, abs(cell));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uDpr * 2.2 * (1.0 / -mv.z) * 2.0;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uK;
        varying float vLit;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(vec3(1.0), a * uK * (0.06 + 0.5 * vLit));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    dust = new THREE.Points(g, dustMat);
    dust.renderOrder = 4;
    dust.frustumCulled = false;
    group.add(dust);
  }

  let daylight = 1;
  let dusk = 0;
  const apply = () => {
    const k = daylight;
    // Dusk dims and cools the bake slightly and drops the sun toward the
    // horizon tone; never a hue shift strong enough to break monochrome.
    const lm = scale * k * (1 - 0.42 * dusk);
    for (const m of baked) m.color.setRGB(lm, lm, lm * (1 + 0.04 * dusk));
    sun.intensity = 3.2 * k * (1 - 0.55 * dusk);
    sky.intensity = 0.9 * k * (1 - 0.35 * dusk);
    for (const c of catchers) c.opacity = 0.34 * k;
    shaftMat.uniforms.uK!.value = 0.05 * k * (1 - 0.7 * dusk);
    if (dustMat) dustMat.uniforms.uK!.value = k * (1 - 0.5 * dusk);
    group.visible = k > 0.002;
  };

  return {
    group,
    plinthTop,
    sun,
    sunDir,
    setDaylight(k) {
      daylight = k;
      apply();
    },
    setDusk(k) {
      dusk = k;
      apply();
    },
    update(time) {
      shaftMat.uniforms.uTime!.value = time;
      if (dustMat) dustMat.uniforms.uTime!.value = time;
    },
  };
}
