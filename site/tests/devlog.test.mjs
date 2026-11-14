import { describe, expect, it } from "vitest";
import { END, START, formatDate, parseCards, renderCards, spliceGenerated, toHtml } from "../tools/lib/devlog-lib.mjs";

const LOG = `---
name: "[[Dev Log]]"
---
## 2026-11-06 · Internal title with a part number
*Worker hardware · internal subtitle*
Internal text with a 10 s lease timeout that must never be published.

> [!card] The board passes its checks
> Ten bring-up checks pass on the robot's
> real board.
>
> Next, the motors get power.

## 2026-11-05 · An entry with no card
Internal only.

## 2026-10-04 · Older entry
> [!card] One board, two brains
> The worker gets a **new** computer & a \`real-time\` core.
`;

describe("parseCards", () => {
  const cards = parseCards(LOG);

  it("publishes only entries that carry a card block", () => {
    expect(cards.map((c) => c.date)).toEqual(["2026-11-06", "2026-10-04"]);
  });

  it("uses the card's own title and joins wrapped lines into paragraphs", () => {
    expect(cards[0].title).toBe("The board passes its checks");
    expect(cards[0].paragraphs).toEqual([
      "Ten bring-up checks pass on the robot's real board.",
      "Next, the motors get power.",
    ]);
  });

  it("never reads internal text into a card", () => {
    expect(JSON.stringify(cards)).not.toMatch(/lease|Internal/);
  });

  it("sorts newest first whatever the file order", () => {
    const reversed = parseCards("## 2026-01-01 · a\n> [!card] Old\n> x\n\n## 2026-02-01 · b\n> [!card] New\n> y\n");
    expect(reversed.map((c) => c.title)).toEqual(["New", "Old"]);
  });
});

describe("renderCards", () => {
  it("escapes HTML and drops markdown emphasis", () => {
    expect(toHtml("a **new** computer & a `real-time` <core>")).toBe("a new computer &amp; a real-time &lt;core&gt;");
    expect(toHtml("the robot's eye")).toBe("the robot&rsquo;s eye");
  });

  it("writes the site's log-entry markup", () => {
    const html = renderCards(parseCards(LOG), "");
    expect(html).toContain('<article class="log-entry">');
    expect(html).toContain('<time datetime="2026-11-06">November 6, 2026</time>');
    expect(html).toContain("<h2>The board passes its checks</h2>");
  });

  it("formats dates without a leading zero", () => {
    expect(formatDate("2026-07-08")).toBe("July 8, 2026");
  });
});

describe("spliceGenerated", () => {
  const page = `<div class="log">\n  ${START}\n  stale\n  ${END}\n  <article>legacy</article>\n</div>`;

  it("replaces only what sits between the markers", () => {
    const out = spliceGenerated(page, "  <article>new</article>");
    expect(out).toContain("<article>new</article>");
    expect(out).not.toContain("stale");
    expect(out).toContain("<article>legacy</article>");
  });

  it("is stable when run twice", () => {
    const once = spliceGenerated(page, "  <article>new</article>");
    expect(spliceGenerated(once, "  <article>new</article>")).toBe(once);
  });

  it("refuses a page without markers", () => {
    expect(() => spliceGenerated("<div></div>", "")).toThrow(/markers/);
  });
});
