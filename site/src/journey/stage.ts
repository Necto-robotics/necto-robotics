import * as THREE from "three";
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import type { Tier } from "../perf/tier";

/** Renderer, camera and the post stack. The rest of the journey only sees
 * `render()`, `resize()` and a few look parameters, so the renderer can be
 * swapped (e.g. for WebGPU) without touching any scene code. */
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  tier: Tier;
  /** 0..1 how far the composition is shifted right to leave room for copy. */
  lensShift: number;
  setDpr(dpr: number): void;
  maxDpr: number;
  setLook(look: { bloom: number; vignette: number; exposure: number }): void;
  resize(): void;
  render(scene?: THREE.Scene): void;
}

const DPR_CAP: Record<Tier, number> = { high: 2, mid: 1.5, low: 1.25 };

export function createStage(canvas: HTMLCanvasElement, tier: Tier): Stage {
  const usePost = tier !== "low";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !usePost,
    alpha: false,
    powerPreference: "high-performance",
    // Dev-only: the capture tool reads the canvas back after rendering.
    preserveDrawingBuffer: import.meta.env.DEV,
  });
  const maxDpr = Math.min(devicePixelRatio, DPR_CAP[tier]);
  renderer.setPixelRatio(maxDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = usePost ? THREE.NoToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = tier !== "low";
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.03, 400);

  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloom: BloomEffect | null = null;
  let vignette: VignetteEffect | null = null;
  let tone: ToneMappingEffect | null = null;
  if (usePost) {
    composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: tier === "high" ? 4 : 2,
    });
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloom = new BloomEffect({
      luminanceThreshold: 0.92,
      luminanceSmoothing: 0.2,
      intensity: 0.3,
      mipmapBlur: true,
      radius: 0.7,
    });
    vignette = new VignetteEffect({ offset: 0.32, darkness: 0.35 });
    tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
    noise.blendMode.opacity.value = 0.05;
    composer.addPass(new EffectPass(camera, bloom, tone, vignette, noise));
  }

  let exposure = 1;
  const stage: Stage = {
    renderer,
    scene,
    camera,
    canvas,
    tier,
    lensShift: 0,
    maxDpr,
    setDpr(dpr) {
      renderer.setPixelRatio(dpr);
      stage.resize();
    },
    setLook({ bloom: b, vignette: v, exposure: e }) {
      exposure = e;
      if (bloom) bloom.intensity = b;
      if (vignette) vignette.darkness = v;
      renderer.toneMappingExposure = e;
    },
    resize() {
      const w = canvas.clientWidth || innerWidth;
      const h = canvas.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      composer?.setSize(w, h, false);
      camera.aspect = w / h;
      const s = stage.lensShift;
      if (s > 0.001) {
        // Widen the frustum to the right and show its left part, so the look
        // target sits right of centre without re-authoring any camera keys.
        camera.setViewOffset(w * (1 + s), h, 0, 0, w, h);
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
    },
    render(target = scene) {
      if (composer && renderPass) {
        renderPass.mainScene = target;
        // Exposure goes in front of the tone mapper on the post path.
        if (tone) (tone as unknown as { exposure?: number }).exposure = exposure;
        composer.render();
      } else {
        renderer.render(target, camera);
      }
    },
  };
  stage.resize();
  return stage;
}
