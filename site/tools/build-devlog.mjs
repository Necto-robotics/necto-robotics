/** Writes the generated dev-log cards into devlog.html from the vault's Dev Log.
 *
 *     node tools/build-devlog.mjs            (or: npm run devlog)
 *
 * Only `> [!card]` blocks are published; see tools/lib/devlog-lib.mjs. The
 * vault is not in this repository, so the output is committed and a normal
 * `npm run build` never needs it. Set NECTO_VAULT to point at another copy. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCards, renderCards, spliceGenerated } from "./lib/devlog-lib.mjs";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const vault = process.env.NECTO_VAULT ?? "D:/Robotics/LEGOSwarm/LEGOSwarm";
const logs = join(vault, "Engineering", "05 Plans & Logs");

if (!existsSync(logs)) {
  console.error(`dev log folder not found: ${logs}`);
  process.exit(1);
}

// The live log plus any rotated archives ("Dev Log 2026 H1.md").
const files = readdirSync(logs).filter((f) => /^Dev Log( .+)?\.md$/.test(f)).sort();
const cards = parseCards(files.map((f) => readFileSync(join(logs, f), "utf8")).join("\n"));

const page = join(site, "devlog.html");
const before = readFileSync(page, "utf8");
const after = spliceGenerated(before, renderCards(cards));
if (after !== before) writeFileSync(page, after);
console.log(`devlog: ${cards.length} card(s) from ${files.length} file(s)${after === before ? ", no change" : ""}`);
