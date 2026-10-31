/**
 * Regenerates the scripted 3D assets: runs the Blender builders headless,
 * then optimizes each GLB (dedup, prune, weld, quantize, meshopt) into
 * public/media/. Outputs are committed, so CI never needs Blender.
 *
 *   node tools/build-assets.mjs [worker|hall|lunar ...] [--fast]
 *
 * BLENDER env var overrides the executable path. --fast bakes at low
 * resolution for iteration; ship assets are built without it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = join(site, "assets-src", "blender");
const raw = join(site, "assets-src", "build");
const media = join(site, "public", "media");
const BLENDER =
  process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe";

const args = process.argv.slice(2);
const fast = args.includes("--fast");
const wanted = args.filter((a) => !a.startsWith("--"));

const JOBS = {
  worker: [
    { script: "build_worker.py", out: "worker.glb", args: ["high"] },
    { script: "build_worker.py", out: "worker-lod.glb", args: ["low"] },
  ],
  hall: [{ script: "build_hall.py", out: "hall.glb", args: fast ? ["1024", "64"] : ["4096", "512"] }],
  lunar: [{ script: "build_lunar.py", out: "lunar.glb", args: [] }],
};

mkdirSync(raw, { recursive: true });
mkdirSync(media, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
});

for (const [name, jobs] of Object.entries(JOBS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  for (const job of jobs) {
    const rawPath = join(raw, job.out);
    console.log(`blender ${job.script} -> ${job.out}`);
    execFileSync(BLENDER, ["-b", "--factory-startup", "-P", join(scripts, job.script), "--", rawPath, ...job.args], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (!existsSync(rawPath)) throw new Error(`${job.script} produced no ${rawPath}`);
    const doc = await io.read(rawPath);
    await doc.transform(
      dedup(),
      prune({ keepExtras: true, keepLeaves: true }),
      weld(),
      quantize({ quantizePosition: 14, quantizeNormal: 10 }),
      meshopt({ encoder: MeshoptEncoder, level: "medium" })
    );
    const outPath = join(media, job.out);
    await io.write(outPath, doc);
    console.log(`  ${job.out}: ${(statSync(outPath).size / 1024).toFixed(0)} KB`);
  }
}
