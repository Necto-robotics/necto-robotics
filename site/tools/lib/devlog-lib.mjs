/** Dev-log cards: parse the public card blocks out of the vault's Dev Log and
 * render them as the site's log entries. Pure functions; the CLI is
 * tools/build-devlog.mjs.
 *
 * A Dev Log entry is public only if it carries a card block:
 *
 *   ## 2026-11-06 · Internal title
 *   ...internal text, never published...
 *   > [!card] Public title
 *   > Public paragraph, written for the site.
 *   >
 *   > A second paragraph.
 *
 * Internal entries name methods, parts and thresholds the site must not show,
 * so nothing outside the card block is ever read into the page. */

export const START = "<!-- devlog:generated:start -->";
export const END = "<!-- devlog:generated:end -->";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const ENTRY = /^## (\d{4})-(\d{2})-(\d{2})\b/;
const CARD = /^> \[!card\]\s+(.+?)\s*$/i;

export function parseCards(markdown) {
  const cards = [];
  let date = null;
  let card = null;
  const close = () => {
    if (card && card.paragraphs.length) cards.push(card);
    card = null;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const entry = raw.match(ENTRY);
    if (entry) {
      close();
      date = `${entry[1]}-${entry[2]}-${entry[3]}`;
      continue;
    }
    const head = raw.match(CARD);
    if (head && date) {
      close();
      card = { date, title: head[1], paragraphs: [""] };
      continue;
    }
    if (!card) continue;
    if (!raw.startsWith(">")) {
      close();
      continue;
    }
    const text = raw.replace(/^>\s?/, "").trim();
    if (text === "") card.paragraphs.push("");
    else {
      const i = card.paragraphs.length - 1;
      card.paragraphs[i] = card.paragraphs[i] ? `${card.paragraphs[i]} ${text}` : text;
    }
  }
  close();
  for (const c of cards) c.paragraphs = c.paragraphs.filter(Boolean);
  // Newest first; entries on one day keep the Dev Log's own order.
  return cards
    .filter((c) => c.paragraphs.length)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date === b.c.date ? a.i - b.i : a.c.date < b.c.date ? 1 : -1))
    .map(({ c }) => c);
}

export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function toHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(.+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&rsquo;");
}

export function renderCards(cards, indent = "        ") {
  return cards
    .map((c) => [
      `${indent}<article class="log-entry">`,
      `${indent}  <p class="label"><time datetime="${c.date}">${formatDate(c.date)}</time></p>`,
      `${indent}  <h2>${toHtml(c.title)}</h2>`,
      ...c.paragraphs.map((p) => `${indent}  <p>${toHtml(p)}</p>`),
      `${indent}</article>`,
    ].join("\n"))
    .join("\n");
}

export function spliceGenerated(html, block) {
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error("devlog.html is missing the devlog:generated markers");
  const lineStart = html.lastIndexOf("\n", a) + 1;
  const indent = html.slice(lineStart, a);
  const inner = block ? `\n${block}\n${indent}` : `\n${indent}`;
  return html.slice(0, a + START.length) + inner + html.slice(b);
}
