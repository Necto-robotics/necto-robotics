/** Story position from the page's own scroll. The copy's sections are the
 * timeline: chapter i spans u in [i, i+1), measured where a probe line in
 * the viewport crosses the section. Nothing here moves the page. */

export interface Chapter {
  id: string;
  el: HTMLElement;
  scheme: "light" | "dark";
  top: number;
  height: number;
}

export class Progress {
  readonly chapters: Chapter[];
  u = 0;
  private probe = 0.5;
  private vh = innerHeight;

  constructor(root: ParentNode = document) {
    this.chapters = [...root.querySelectorAll<HTMLElement>("[data-chapter]")].map((el) => ({
      id: el.id,
      el,
      scheme: el.dataset.scheme === "dark" ? "dark" : "light",
      top: 0,
      height: 1,
    }));
    this.measure();
    new ResizeObserver(() => this.measure()).observe(document.body);
  }

  measure(): void {
    this.vh = innerHeight;
    const phone = matchMedia("(max-width: 47.99rem)").matches;
    // On phones the stage is a top band; read just below it.
    this.probe = phone ? 0.72 : 0.5;
    for (const c of this.chapters) {
      const r = c.el.getBoundingClientRect();
      c.top = r.top + scrollY;
      c.height = Math.max(1, r.height);
    }
  }

  /** Raw u for the current scroll position. */
  read(): number {
    const y = scrollY + this.vh * this.probe;
    const list = this.chapters;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]!;
      if (y >= c.top || i === 0) {
        let t: number;
        if (i === 0) {
          // The open starts at u = 0 with the page at the top.
          const span = Math.max(1, c.height - this.vh * this.probe);
          t = scrollY / span;
        } else {
          t = (y - c.top) / c.height;
        }
        return Math.min(list.length - 0.001, i + Math.max(0, Math.min(0.999, t)));
      }
    }
    return 0;
  }

  update(): number {
    this.u = this.read();
    return this.u;
  }

  /** Document scroll offset that puts the probe at chapter-local t. */
  scrollFor(index: number, t: number): number {
    const c = this.chapters[index];
    if (!c) return 0;
    if (index === 0) return Math.max(0, t * (c.height - this.vh * this.probe));
    return c.top + t * c.height - this.vh * this.probe;
  }
}
