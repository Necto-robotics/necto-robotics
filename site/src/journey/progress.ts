/** Story position from the page's own scroll. The copy's sections are the
 * timeline: chapter i spans u in [i, i+1). Nothing here moves the page.
 *
 * Each boundary u = i is pinned to the stretch of scroll where no copy is in
 * view: the previous chapter's text has left the top and the next one's has
 * not yet entered. The window u in [i - TURN, i + TURN] spans exactly that
 * gap, so a light/dark change keyed inside it never happens behind text. */

export const TURN = 0.08;

export interface Chapter {
  id: string;
  el: HTMLElement;
  scheme: "light" | "dark";
  /** Document offsets of the chapter's visible copy. */
  copyTop: number;
  copyBottom: number;
}

export class Progress {
  readonly chapters: Chapter[];
  u = 0;
  /** Piecewise-linear map, scrollY -> u, as [scrollY, u] knots. */
  private knots: [number, number][] = [[0, 0], [1, 1]];

  constructor(root: ParentNode = document) {
    this.chapters = [...root.querySelectorAll<HTMLElement>("[data-chapter]")].map((el) => ({
      id: el.id,
      el,
      scheme: el.dataset.scheme === "dark" ? "dark" : "light",
      copyTop: 0,
      copyBottom: 0,
    }));
    this.measure();
    new ResizeObserver(() => this.measure()).observe(document.body);
  }

  measure(): void {
    const vh = innerHeight;
    // On phones the stage is a top band; copy is only readable below it.
    const viewTop = matchMedia("(max-width: 47.99rem)").matches ? 0.56 * vh : 0;
    for (const c of this.chapters) {
      let top = Infinity;
      let bottom = -Infinity;
      for (const child of c.el.children) {
        const r = child.getBoundingClientRect();
        if (r.height === 0) continue;
        top = Math.min(top, r.top + scrollY);
        bottom = Math.max(bottom, r.bottom + scrollY);
      }
      c.copyTop = top;
      c.copyBottom = bottom;
    }
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const knots: [number, number][] = [[0, 0]];
    const minGap = 0.12 * vh;
    for (let i = 1; i < this.chapters.length; i++) {
      // Text-free while prev.copyBottom <= scrollY + viewTop and
      // next.copyTop >= scrollY + vh.
      let a = this.chapters[i - 1]!.copyBottom - viewTop;
      let b = this.chapters[i]!.copyTop - vh;
      if (b - a < minGap) {
        // No clean gap (phone, short screens): centre a short window anyway.
        const mid = (a + b) / 2;
        a = mid - minGap / 2;
        b = mid + minGap / 2;
      }
      const floor = knots[knots.length - 1]![0] + 1;
      a = Math.max(a, floor);
      b = Math.max(b, a + 1);
      knots.push([a, i - TURN], [b, i + TURN]);
    }
    const last = knots[knots.length - 1]![0];
    knots.push([Math.max(maxScroll, last + 1), this.chapters.length - 0.001]);
    this.knots = knots;
  }

  /** u for a document scroll offset. */
  uAt(y: number): number {
    const k = this.knots;
    if (y <= k[0]![0]) return k[0]![1];
    for (let i = 1; i < k.length; i++) {
      const [y1, u1] = k[i]!;
      if (y <= y1) {
        const [y0, u0] = k[i - 1]!;
        return u0 + ((y - y0) / (y1 - y0)) * (u1 - u0);
      }
    }
    return k[k.length - 1]![1];
  }

  update(): number {
    this.u = this.uAt(scrollY);
    return this.u;
  }

  /** Document scroll offset for chapter-local t (inverse of uAt). */
  scrollFor(index: number, t: number): number {
    const u = index + t;
    const k = this.knots;
    for (let i = 1; i < k.length; i++) {
      const [y1, u1] = k[i]!;
      if (u <= u1) {
        const [y0, u0] = k[i - 1]!;
        return y0 + ((u - u0) / (u1 - u0)) * (y1 - y0);
      }
    }
    return k[k.length - 1]![0];
  }
}
