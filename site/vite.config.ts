import { defineConfig, type Plugin } from "vite";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

// Production builds with JOURNEY_AT_ROOT=1 serve the site at /; without it the
// build is staged under /next/. tools/assemble-dist.mjs adds CNAME and the few
// root images to the Vite output.
const atRoot = !!process.env.JOURNEY_AT_ROOT;

const repoRoot = resolve(import.meta.dirname, "..");

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".ico": "image/x-icon",
};

// Dev-only: serve the repo-root /images/* (favicon, mark, social card) so
// root-absolute references resolve in `vite dev` exactly as they will in the
// assembled dist.
function serveLegacyAssets(): Plugin {
  return {
    name: "necto-serve-legacy-assets",
    apply: "serve",
    configureServer(server) {
      // Dev-only verification endpoint: the page POSTs base64 frames here so
      // captures land on disk without huge strings crossing tool boundaries.
      // Whitelist, not a path: `dir` arrives from the page, and this writes files.
      const CAPTURE_DIRS = new Set(["captures", "public/media/stills"]);
      server.middlewares.use("/__capture", (req, res) => {
        const params = new URL(req.url ?? "/", "http://x").searchParams;
        const name = (params.get("name") ?? "capture").replace(/[^a-z0-9_-]/gi, "");
        const target = params.get("dir") ?? "captures";
        if (!CAPTURE_DIRS.has(target)) {
          res.statusCode = 400;
          return res.end(`unknown capture dir: ${target}`);
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          const { mkdirSync, writeFileSync } = await import("node:fs");
          const dir = resolve(import.meta.dirname, target);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.jpg`), Buffer.from(body, "base64"));
          res.end("ok");
        });
      });
      // Dev-only: the capture tool needs the webfonts as data URIs, but the
      // page can't fetch fonts.googleapis.com cross-origin. Node fetches and
      // inlines them here so captures show the real typography.
      let fontCssCache: string | null = null;
      server.middlewares.use("/__fontcss", async (req, res) => {
        res.setHeader("Content-Type", "text/css");
        if (fontCssCache !== null) return res.end(fontCssCache);
        const href = new URL(req.url ?? "/", "http://x").searchParams.get("href");
        if (!href) return res.end("");
        try {
          const full = await (await fetch(href)).text();
          // Latin subsets only: the cyrillic/greek/vietnamese faces would
          // triple the payload for glyphs the site never sets.
          const css = full
            .split("@font-face")
            .filter((block) => block.includes("U+0000-00FF"))
            .map((block) => `@font-face${block}`)
            .join("\n");
          const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]!))];
          let out = css;
          for (const url of urls) {
            const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
            out = out.split(url).join(`data:font/woff2;base64,${buf.toString("base64")}`);
          }
          fontCssCache = out;
        } catch (err) {
          console.warn("[necto] font proxy failed", err);
          fontCssCache = "";
        }
        res.end(fontCssCache);
      });

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith("/images/")) return next();
        const file = join(repoRoot, decodeURIComponent(url));
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Shared chrome: <!--#include header --> / <!--#include footer --> are
// replaced at build (and dev) time with partials/*.html, so every page gets
// the same navigation and footer with no runtime JS. The link for the
// current page gets aria-current="page".
function includePartials(): Plugin {
  const dir = resolve(import.meta.dirname, "partials");
  return {
    name: "necto-include-partials",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const page = (ctx.filename.split(/[\\/]/).pop() ?? "index.html").replace(".html", "");
        return html.replace(/<!--#include (\w+) -->/g, (_, name: string) => {
          const partial = readFileSync(join(dir, `${name}.html`), "utf8");
          return partial.replace(`data-page="${page}"`, `data-page="${page}" aria-current="page"`);
        });
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  // Dev always serves at the root so root-absolute links behave as in production.
  base: atRoot || command === "serve" ? "/" : "/next/",
  plugins: [includePartials(), serveLegacyAssets()],
  build: {
    outDir: "dist-vite",
    assetsDir: "app",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        technical: resolve(import.meta.dirname, "technical.html"),
        devlog: resolve(import.meta.dirname, "devlog.html"),
      },
    },
  },
}));
