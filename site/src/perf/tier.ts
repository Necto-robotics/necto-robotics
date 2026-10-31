/** Device capability tiering. A static estimate picks the starting tier;
 * the frame-time governor in journey/governor.ts corrects it at runtime.
 * `?tier=high|mid|low|none` overrides the estimate for testing. */

export type Tier = "high" | "mid" | "low";

export interface TierReport {
  tier: Tier;
  webgl: boolean;
  renderer: string | null;
  reasons: string[];
  reducedMotion: boolean;
  phone: boolean;
}

function probeWebGL(): { ok: boolean; renderer: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return { ok: false, renderer: null };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: null };
  }
}

export function detectTier(): TierReport {
  const reasons: string[] = [];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = matchMedia("(max-width: 47.99rem)").matches;
  const override = new URLSearchParams(location.search).get("tier");
  if (override === "none") {
    return { tier: "low", webgl: false, renderer: null, reasons: ["?tier=none"], reducedMotion, phone };
  }
  const { ok, renderer } = probeWebGL();
  if (!ok) {
    return { tier: "low", webgl: false, renderer: null, reasons: ["no WebGL context"], reducedMotion, phone };
  }
  const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData) {
    return { tier: "low", webgl: false, renderer, reasons: ["save-data"], reducedMotion, phone };
  }

  let score = 0;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined) {
    score += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
    reasons.push(`deviceMemory=${mem}`);
  } else {
    score += 1; // Safari/Firefox hide it; don't punish
    reasons.push("deviceMemory unavailable");
  }

  const cores = navigator.hardwareConcurrency ?? 4;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  reasons.push(`cores=${cores}`);

  const coarse = matchMedia("(pointer: coarse)").matches;
  if (coarse) {
    score -= 1;
    reasons.push("coarse pointer (mobile-class)");
  }

  if (renderer) {
    reasons.push(`renderer=${renderer}`);
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      score = 0;
      reasons.push("software rasterizer");
    }
  }

  let tier: Tier = score >= 4 ? "high" : score >= 2 ? "mid" : "low";
  if (override === "high" || override === "mid" || override === "low") tier = override;
  return { tier, webgl: true, renderer, reasons, reducedMotion, phone };
}
