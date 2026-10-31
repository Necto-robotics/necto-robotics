import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/paper.css";
import { initNav } from "./ui/nav";

/** Reading pages (white paper, dev log): navigation, a scroll-spy for the
 * contents column, and the architecture explorer booted only when it is
 * about to scroll into view (its graph library is ~370 KB). */
initNav();

const toc = document.querySelector<HTMLElement>(".paper-toc");
if (toc) {
  const items = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
    .map((a) => ({ a, el: document.getElementById(a.hash.slice(1)) }))
    .filter((i): i is { a: HTMLAnchorElement; el: HTMLElement } => !!i.el);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const trigger = 140;
  let current: HTMLAnchorElement | null = null;
  const setActive = (link: HTMLAnchorElement) => {
    if (link === current) return;
    current = link;
    toc.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
    link.classList.add("active");
    // Light the ancestor entries so the trail stays visible.
    let li = link.closest("li")?.parentElement?.closest("li");
    while (li) {
      li.querySelector(":scope > a")?.classList.add("active");
      li = li.parentElement?.closest("li");
    }
  };
  const update = () => {
    let cur = items[0]?.a;
    for (const i of items) if (i.el.getBoundingClientRect().top - trigger <= 0) cur = i.a;
    if (cur) setActive(cur);
  };
  for (const i of items) {
    i.a.addEventListener("click", (e) => {
      e.preventDefault();
      i.el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", i.a.hash);
    });
  }
  addEventListener("scroll", update, { passive: true });
  update();
}

const mount = document.getElementById("arch-explorer");
if (mount) {
  const base = `${import.meta.env.BASE_URL}explorer/`;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${base}explorer.css`;
  document.head.appendChild(css);
  const sources = ["graph.data.js", "cytoscape.min.js", "explorer.js"];
  let started = false;
  const boot = () => {
    if (started) return;
    started = true;
    const next = (i: number) => {
      if (i >= sources.length) return;
      const s = document.createElement("script");
      s.src = base + sources[i];
      s.async = false;
      s.onload = () => next(i + 1);
      s.onerror = () => {
        mount.innerHTML = '<p class="arch-boot-error">The interactive graph could not load.</p>';
      };
      document.body.appendChild(s);
    };
    next(0);
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      boot();
    },
    { rootMargin: "400px 0px" }
  );
  io.observe(mount);
}
