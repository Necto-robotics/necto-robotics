/**
 * Assembles the final GitHub Pages artifact in site/dist from the Vite build
 * (site/dist-vite: the journey, the white paper and the dev log) plus the
 * few root-level statics the pages reference (favicon, social card, mark,
 * CNAME).
 *
 * JOURNEY_AT_ROOT=1 (production) serves the site at / and keeps /next/ as a
 * redirect for old links. Unset, the whole site is staged under /next/ and
 * / redirects there.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(site);
const viteOut = join(site, "dist-vite");
const out = join(site, "dist");
const atRoot = !!process.env.JOURNEY_AT_ROOT;

if (!existsSync(viteOut)) {
  console.error("assemble-dist: missing dist-vite — run `vite build` first");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(join(repo, "CNAME"), join(out, "CNAME"));
mkdirSync(join(out, "images"), { recursive: true });
for (const f of ["favicon.svg", "og-cover.jpg", "necto-mark.svg"]) {
  cpSync(join(repo, "images", f), join(out, "images", f));
}

const redirect = (to) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Necto Robotics</title>
    <link rel="canonical" href="https://nectorobotics.com${to}" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${to}" />
  </head>
  <body>
    <p><a href="${to}">Continue to Necto Robotics</a>.</p>
  </body>
</html>
`;

if (atRoot) {
  cpSync(viteOut, out, { recursive: true });
  mkdirSync(join(out, "next"), { recursive: true });
  writeFileSync(join(out, "next", "index.html"), redirect("/"));
} else {
  cpSync(viteOut, join(out, "next"), { recursive: true });
  writeFileSync(join(out, "index.html"), redirect("/next/"));
}

// Pages must not run Jekyll over the artifact.
writeFileSync(join(out, ".nojekyll"), "");

console.log(`assemble-dist: site at ${atRoot ? "/" : "/next/ (staging)"}`);
