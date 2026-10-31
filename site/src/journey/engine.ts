import * as THREE from "three";
import type { TierReport } from "../perf/tier";
import { createStage, type Stage } from "./stage";
import { createEnvironments } from "./env";
import { Progress } from "./progress";
import { Director, curve } from "./director";
import { CAMERA_KEYS, HERO } from "./choreography";
import { Governor } from "./governor";
import { loadGLB } from "../scene/assets";
import { loadBrickAssets } from "../scene/bricks";
import { createHall } from "../scene/hall";
import { Build } from "../scene/build";
import { Robot, POSES, partOf } from "../scene/robot";
import { GraphRealm } from "../scene/graph";
import { initChapterIndex } from "../ui/chapter-index";
import { Hud } from "../ui/hud";
import { PartTags } from "../ui/part-tags";
import { ConceptTags } from "../ui/concept-tags";

/** Story timeline: every visual parameter is a function of u.
 * Light/dark turns sit inside u in [i - 0.08, i + 0.08] (progress.TURN),
 * the stretch of scroll at a chapter boundary with no copy in view. */
const T = {
  daylight: curve([[0, 1], [0.92, 1], [1.08, 0], [2.92, 0], [3.08, 1], [3.92, 1], [4.08, 0], [5.985, 0], [6, 1]]),
  studio: curve([[0.92, 0], [1.08, 1], [2.92, 1], [3.08, 0]]),
  explode: curve([[2.1, 0], [2.44, 1], [2.68, 1], [2.9, 0]]),
  dusk: curve([[6, 0], [6.1, 0.5], [6.8, 0.85]]),
  lines: curve([[3, 0], [3.14, 1], [3.86, 1], [3.94, 0]]),
  graph: curve([[3.9, 0], [4.36, 1], [4.86, 1], [4.95, 0]]),
  blackout: curve([[4.84, 0], [4.95, 1], [5.05, 0], [5.92, 0], [5.97, 1], [6.01, 1], [6.08, 0]]),
  hud: (u: number) => (u > 3.1 && u < 3.9 ? 1 : 0),
  drift: curve([[0, 1], [0.6, 0.4], [1.4, 0.6], [2.0, 0], [3.0, 0], [6.2, 0.6]]),
};

export async function mountJourney(report: TierReport): Promise<void> {
  const stageEl = document.querySelector<HTMLElement>(".stage")!;
  const canvas = stageEl.querySelector<HTMLCanvasElement>(".stage__canvas")!;
  const ui = stageEl.querySelector<HTMLElement>(".stage__ui")!;
  const params = new URLSearchParams(location.search);
  const tier = report.tier;

  const [workerGltf, fleetGltf, hallGltf, bricks] = await Promise.all([
    loadGLB("worker.glb"),
    tier === "low" ? loadGLB("worker-lod.glb") : Promise.resolve(null),
    loadGLB("hall.glb"),
    loadBrickAssets(),
  ]);

  const stage = createStage(canvas, tier);
  const { scene, camera, renderer } = stage;
  scene.background = new THREE.Color(0x000000);
  const envs = createEnvironments(renderer);
  scene.environment = envs.hall;

  const hall = createHall(hallGltf, tier);
  scene.add(hall.group);

  const shadows = tier !== "low";
  const build = new Build({
    model: bricks.data.car,
    geometries: bricks.geometries,
    robotTemplate: (fleetGltf ?? workerGltf).scene,
    workers: bricks.data.workers,
    plinthTop: hall.plinthTop,
    shadows,
  });
  scene.add(build.group);

  // The hero: one robot parked at the front of the plinth, presented in the
  // studio chapters and taken apart in chapter 02.
  const hero = new Robot(workerGltf.scene, { unique: true, shadows });
  hero.root.position.set(HERO.pos[0], hall.plinthTop, HERO.pos[2]);
  hero.root.rotation.y = HERO.heading;
  hero.setPose(POSES.display);
  hero.setGrip(1);
  hero.setStatus(3.5);
  scene.add(hero.root);

  // Studio rig: a key softbox, a rim and a glossy black floor under the hero.
  const key = new THREE.SpotLight(0xffffff, 0, 6, Math.PI / 11, 0.9, 1.4);
  key.position.set(HERO.pos[0] + 1.1, 1.5, HERO.pos[2] + 1.3);
  key.target = hero.root;
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xffffff, 0);
  rim.position.set(HERO.pos[0] - 1.6, 1.1, HERO.pos[2] - 1.4);
  rim.target = hero.root;
  const fill = new THREE.PointLight(0xffffff, 0, 3, 2);
  fill.position.set(HERO.pos[0] - 0.4, 0.5, HERO.pos[2] + 1.2);
  scene.add(key, rim, fill);
  // A soft pool of floor that fades to black at its edge: no horizon line.
  const pool = document.createElement("canvas");
  pool.width = pool.height = 256;
  const pg = pool.getContext("2d")!;
  const grad = pg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.45, "#888");
  grad.addColorStop(1, "#000");
  pg.fillStyle = grad;
  pg.fillRect(0, 0, 256, 256);
  const studioFloor = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 96),
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.68,
      metalness: 0,
      transparent: true,
      opacity: 0,
      alphaMap: new THREE.CanvasTexture(pool),
      depthWrite: false,
    })
  );
  studioFloor.rotation.x = -Math.PI / 2;
  studioFloor.position.set(HERO.pos[0], hall.plinthTop + 0.0008, HERO.pos[2]);
  studioFloor.receiveShadow = shadows;
  scene.add(studioFloor);

  const graph = new GraphRealm({ build, plinthTop: hall.plinthTop, tier });
  scene.add(graph.group);
  graph.view = camera;

  // Lunar concept: loaded lazily when the reader nears chapter 05.
  let lunar: import("../scene/lunar").LunarRealm | null = null;
  let lunarLoading = false;
  const ensureLunar = () => {
    if (lunar || lunarLoading) return;
    lunarLoading = true;
    import("../scene/lunar")
      .then(async (m) => {
        lunar = await m.createLunar({ robotTemplate: (fleetGltf ?? workerGltf).scene, tier, renderer });
      })
      .catch((e) => console.warn("[loom] lunar realm unavailable", e));
  };

  const progress = new Progress();
  const director = new Director(CAMERA_KEYS);
  director.cut = report.reducedMotion;
  const setChapter = initChapterIndex(null);
  const hud = new Hud(ui);
  const tags = new PartTags(ui, hero, camera);
  const concepts = new ConceptTags(ui, graph, camera);
  const governor = new Governor(stage);

  // Desktop leaves the left third for copy; phones split screen instead.
  const applyLayout = () => {
    stage.lensShift = matchMedia("(min-width: 48rem)").matches ? 0.3 : 0;
    stage.resize();
    progress.measure();
  };
  applyLayout();
  addEventListener("resize", applyLayout);

  // Pointer picking on the hero (chapter 02) and graph (chapter 04).
  const pointer = new THREE.Vector2(9, 9);
  canvas.parentElement!.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  document.addEventListener("pointermove", (e) => {
    if (!(e.target as HTMLElement).closest?.(".stage")) {
      const r = canvas.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }
  });
  const raycaster = new THREE.Raycaster();

  // Ambient build clock: chapter 00 plays the tape slowly on its own; later
  // chapters take over from wherever it stopped.
  const T0 = build.makespan * 0.14;
  let ambientTau = T0;
  let paused = false;
  let uOverride: number | null = null;
  let last = performance.now();
  let time = 0;
  let fixedTime: number | null = null;
  let lastChapter = -1;

  const footer = document.querySelector(".site-footer");
  if (footer) {
    new IntersectionObserver(
      ([e]) => {
        paused = !!e && e.intersectionRatio > 0.98;
      },
      { threshold: [0, 0.98, 1] }
    ).observe(footer);
  }

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused || document.hidden) return;
    // Reduced motion: no ambient animation at all, only what the reader scrolls.
    time = fixedTime ?? (report.reducedMotion ? 0 : time + dt);
    const u = uOverride ?? progress.update();
    if (report.reducedMotion && uOverride === null) {
      // Camera cuts between chapters get a short fade instead of a flight.
      const ch = Math.floor(u);
      if (ch !== lastChapter) {
        lastChapter = ch;
        stageEl.removeAttribute("data-live");
        requestAnimationFrame(() => stageEl.setAttribute("data-live", ""));
      }
    }
    renderFrame(u, report.reducedMotion ? 0 : dt);
    governor.sample(dt);
  };

  const renderFrame = (u: number, dt: number) => {
    const day = T.daylight(u);
    const studio = T.studio(u);
    const explode = T.explode(u);
    const graphK = T.graph(u);
    const blackout = T.blackout(u);

    // Scheme follows what the reader actually sees.
    const scheme = day > 0.5 ? "light" : "dark";
    if (document.documentElement.dataset.scheme !== scheme) document.documentElement.dataset.scheme = scheme;
    setChapter(progress.chapters[Math.min(progress.chapters.length - 1, Math.floor(u))]?.id ?? "open");

    // Build clock
    let tau: number;
    if (u < 1) {
      if (dt > 0 && !report.reducedMotion) ambientTau = Math.min(build.makespan * 0.42, ambientTau + dt * 0.22);
      tau = ambientTau;
    } else if (u < 3.08) {
      tau = ambientTau;
    } else {
      const k = Math.min(1, Math.max(0, (u - 3.08) / (3.86 - 3.08)));
      tau = ambientTau + (build.makespan - ambientTau) * k;
    }

    hall.setDaylight(day);
    hall.setDusk(T.dusk(u));
    hall.update(time);

    const snap = build.update(tau, { lines: u < 1 ? 1 : T.lines(u) });
    build.rollWheels();
    build.group.visible = u < 4.95 || u > 5.97;
    build.machines.visible = graphK < 0.05 && studio < 0.5;

    // Hero
    hero.root.visible = studio > 0.02;
    hero.setExplode(explode);
    const display = POSES.display;
    hero.root.rotation.y = HERO.heading + studio * Math.sin(time * 0.12) * 0.06;
    hero.setPose(display);
    key.intensity = 9 * studio;
    rim.intensity = 3.5 * studio;
    fill.intensity = 0.35 * studio;
    (studioFloor.material as THREE.MeshStandardMaterial).opacity = studio;
    studioFloor.visible = studio > 0.01;

    // Graph realm
    graph.update(u, time, graphK);

    // Environment and look
    scene.environment = day > 0.4 || graphK > 0.5 ? envs.hall : envs.studio;
    scene.environmentIntensity = day > 0.4 ? 0.85 : graphK > 0.5 ? 0.35 : 0.9 * studio + 0.1;
    stage.setLook({ bloom: 0.18 + 0.55 * (1 - day), vignette: 0.28 + 0.25 * (1 - day), exposure: 1 });

    // Camera
    // Snap through the blackouts: the realm changes while the screen is dark.
    director.update(u, blackout > 0.85 ? 0 : dt, camera, T.drift(u));

    // Lunar realm swaps the whole scene while it is on screen.
    if (u > 4.4) ensureLunar();
    let target: THREE.Scene = scene;
    if (lunar && u > 4.95 && u < 5.97) {
      lunar.update(u, time, dt, camera, director.cut);
      target = lunar.scene;
    }

    stage.render(target);
    canvas.style.filter = blackout > 0.001 ? `brightness(${1 - blackout})` : "";

    // Overlays
    hud.update(snap, T.hud(u));
    tags.update(explode > 0.85 && u > 2.3 && u < 2.8);
    concepts.update(graphK > 0.9 && u < 4.9);
    if (explode > 0.85 && dt > 0) {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(hero.root, true)[0];
      let asm: THREE.Object3D | null = hit?.object ?? null;
      while (asm && !asm.name.startsWith("asm_")) asm = asm.parent;
      tags.hover(asm ? partOf(asm.name.slice(4)) : null);
    }
    if (graphK > 0.9 && dt > 0) {
      raycaster.setFromCamera(pointer, camera);
      concepts.hover(graph.pick(raycaster));
    }
  };

  // First frame matches the poster; then fade the canvas in over it.
  renderFrame(progress.update(), 0);
  stageEl.toggleAttribute("data-live", true);
  renderer.setAnimationLoop(frame);

  if (import.meta.env.DEV) {
    const { captureCanvas } = await import("../dev/capture");
    const loom = {
      stage,
      progress,
      director,
      build,
      hero,
      graph,
      /** Render u with the camera settled, for captures. */
      async shot(u: number, name: string, t = 0) {
        uOverride = u;
        fixedTime = t;
        time = t;
        director.cut = true;
        renderFrame(u, 0);
        director.cut = report.reducedMotion;
        renderFrame(u, 0);
        const out = await captureCanvas(name, canvas);
        return out;
      },
      release() {
        uOverride = null;
        fixedTime = null;
      },
      async stills() {
        const keys: [string, number][] = [
          ["ch-open", 0],
          ["ch-worker", 1.62],
          ["ch-inside", 2.56],
          ["ch-together", 3.62],
          ["ch-plan", 4.5],
          ["ch-beyond", 5.5],
          ["ch-status", 6.3],
        ];
        ensureLunar();
        while (!lunar) await new Promise((r) => setTimeout(r, 100));
        const shoot = async (name: string, u: number) => {
          uOverride = u;
          fixedTime = 0;
          time = 0;
          // dt = 0 snaps the camera to exactly u (no spring, no chapter cut).
          director.cut = false;
          renderFrame(u, 0);
          renderFrame(u, 0);
          await captureCanvas(name, canvas, { dir: "public/media/stills", quality: 0.92 });
        };
        // The poster is the live first frame, composition and all.
        await shoot("poster", 0);
        // Chapter stills sit beside their copy, so they are centred.
        const shift = stage.lensShift;
        stage.lensShift = 0;
        stage.resize();
        for (const [name, u] of keys) await shoot(name, u);
        stage.lensShift = shift;
        stage.resize();
        director.cut = report.reducedMotion;
        uOverride = null;
        fixedTime = null;
        return "stills written";
      },
    };
    (window as unknown as { __loom: typeof loom }).__loom = loom;
    if (params.get("capture") === "stills") void loom.stills();
  }
}

export type { Stage };
