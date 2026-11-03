/** Builds public/media/bricks.glb from the LDraw-derived OBJs in
 * assets-src/bricks/ (verbatim copies of necto-datasets mesh_cache).
 *
 * The OBJs are z-up meters with the origin at the top of the brick body
 * (LDraw convention); we bake the three.js y-up mapping (x, z, -y) and emit
 * one mesh per part, flat-shaded, quantized. Output is committed.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { quantize } from "@gltf-transform/functions";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(site, "assets-src", "bricks");

/** Parse OBJ positions + triangulated faces (fan), ignoring vt/vn indices. */
function parseObj(text) {
  const verts = [];
  const tris = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      // z-up → y-up
      verts.push([x, z, -y]);
    } else if (line.startsWith("f ")) {
      const idx = line.slice(2).trim().split(/\s+/).map((t) => parseInt(t.split("/")[0], 10) - 1);
      for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    }
  }
  return { verts, tris };
}

/** Indexed geometry, no normals — the runtime material uses flatShading,
 * which derives face normals in-shader, keeping the GLB small. */
function toArrays({ verts, tris }) {
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => pos.set(v, i * 3));
  const idx = new Uint16Array(tris.length * 3);
  tris.forEach((t, i) => idx.set(t, i * 3));
  return { pos, idx };
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("bricks");
const material = doc.createMaterial("brick").setRoughnessFactor(0.6).setMetallicFactor(0.0);

let count = 0;
const boxes = {};
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".obj"))) {
  const part = basename(file, ".obj");
  const parsed = parseObj(readFileSync(join(srcDir, file), "utf8"));
  const { pos, idx } = toArrays(parsed);
  const position = doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer);
  const indices = doc.createAccessor().setType("SCALAR").setArray(idx).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices).setMaterial(material);
  const mesh = doc.createMesh(`part_${part}`).addPrimitive(prim);
  const node = doc.createNode(`part_${part}`).setMesh(mesh);
  scene.addChild(node);
  // bbox for calibration asserts
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of parsed.verts) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]); }
  boxes[part] = max.map((m, i) => +(m - min[i]).toFixed(4));
  count++;
}

// Calibration guard: 3001 = 2×4 brick ⇒ x 0.032, y 0.0112 (body+studs), z 0.016
const b = boxes["3001"];
const ok = b && Math.abs(b[0] - 0.032) < 5e-4 && Math.abs(b[1] - 0.0112) < 5e-4 && Math.abs(b[2] - 0.016) < 5e-4;
if (!ok) {
  console.error(`ASSERT FAILED: 3001 bbox ${JSON.stringify(b)} != ~[0.032, 0.0112, 0.016]`);
  process.exit(1);
}

await doc.transform(quantize());
const io = new NodeIO();
mkdirSync(join(site, "public", "media"), { recursive: true });
const glb = await io.writeBinary(doc);
writeFileSync(join(site, "public", "media", "bricks.glb"), glb);
console.log(`bricks.glb: ${count} parts, ${(glb.byteLength / 1024).toFixed(0)} KB`);
