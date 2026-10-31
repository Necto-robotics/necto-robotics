/**
 * Converts the raw chapter captures (written by the dev route
 * `?capture=stills` into public/media/stills/*.jpg) into the shipped pair per
 * still: a 1920-wide AVIF and a JPEG fallback. Also crops the social card
 * (images/og-cover.jpg, 1200 x 630) from the opening still.
 *
 *   node tools/build-stills.mjs
 */
import { readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(site, "public", "media", "stills");

for (const f of readdirSync(dir).filter((f) => f.endsWith(".jpg"))) {
  const src = join(dir, f);
  const raw = join(dir, `${f}.raw`);
  renameSync(src, raw);
  const img = sharp(raw).resize({ width: 1920, withoutEnlargement: true });
  await img.clone().jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(src);
  await img.clone().avif({ quality: 52, effort: 6 }).toFile(src.replace(/\.jpg$/, ".avif"));
  const { unlinkSync } = await import("node:fs");
  unlinkSync(raw);
  console.log(`stills: ${f}`);
}

await sharp(join(dir, "ch-together.jpg"))
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(dirname(site), "images", "og-cover.jpg"));
console.log("og-cover.jpg written");
