/** Enter-the-viewport effects, all opt-in through data attributes:
 *   [data-reveal]  gets [data-in] once, when it scrolls into view
 *   [data-draw]    an SVG stroke (pathLength="1") that draws in with it
 *   [data-count]   a number that counts up to its value, tabular
 * Reduced motion gets the final state at once. Nothing here is needed to
 * read the page: every element starts fully written in the HTML. */
export function initReveal(): void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = document.querySelectorAll<HTMLElement>("[data-reveal], [data-draw]");
  if (!targets.length) return;
  const counters = new WeakMap<Element, HTMLElement[]>();
  for (const t of targets) counters.set(t, [...t.querySelectorAll<HTMLElement>("[data-count]")]);

  const show = (el: HTMLElement) => {
    el.setAttribute("data-in", "");
    for (const c of counters.get(el) ?? []) countUp(c, reduce);
  };
  if (!("IntersectionObserver" in window)) {
    targets.forEach(show);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        show(e.target as HTMLElement);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.2 }
  );
  targets.forEach((t) => io.observe(t));
}

function countUp(el: HTMLElement, reduce: boolean) {
  const end = Number(el.dataset.count);
  if (!Number.isFinite(end)) return;
  const text = (n: number) => String(Math.round(n)).padStart(String(end).length, "0");
  if (reduce) {
    el.textContent = text(end);
    return;
  }
  const t0 = performance.now();
  const dur = 1100 + Math.min(600, end * 8);
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = text(end * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  el.textContent = text(0);
  requestAnimationFrame(tick);
}
