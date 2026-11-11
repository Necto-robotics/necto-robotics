/** Shared header: the mobile menu, the "where am I" readout, the reading
 * progress hairline, and page prefetch for instant transitions. */
let where: HTMLElement | null = null;
let progress: HTMLElement | null = null;
let lastWhere = "";
let lastK = -1;

export function initNav(): void {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  where = document.querySelector<HTMLElement>("[data-nav-where]");
  progress = document.querySelector<HTMLElement>(".site-nav__progress");
  if (!nav || !toggle) return;
  requestAnimationFrame(() => requestAnimationFrame(() => nav.toggleAttribute("data-ready", true)));
  const set = (open: boolean) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.toggleAttribute("data-open", open);
  };
  toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) set(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      set(false);
      toggle.focus();
    }
  });
  // Close when focus leaves the open menu (tabbing past its last link).
  nav.addEventListener("focusout", (e) => {
    if (!nav.hasAttribute("data-open")) return;
    const next = e.relatedTarget as Node | null;
    if (next && !nav.contains(next)) set(false);
  });
  prefetchPages(nav);
}

/** Fetch the other pages into the HTTP cache once the page is idle, and
 * again (hot) when a link is hovered or focused. Browsers that support
 * speculation rules (see partials/header.html) prerender them outright. */
function prefetchPages(nav: HTMLElement) {
  const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
  if (save || !("fetch" in window)) return;
  const done = new Set<string>();
  const warm = (href: string) => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || done.has(url.pathname)) return;
    if (url.pathname === location.pathname) return;
    done.add(url.pathname);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url.pathname;
    document.head.appendChild(link);
  };
  for (const a of nav.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const hot = () => warm(a.href);
    a.addEventListener("pointerenter", hot, { passive: true });
    a.addEventListener("focus", hot);
  }
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  const all = () => nav.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => warm(a.href));
  if (idle) idle(all, { timeout: 4000 });
  else setTimeout(all, 2500);
}

/** "03 / 06 · Building together" or "3.2 · Topological data flow". */
export function setNavWhere(index: string, title: string): void {
  if (!where) return;
  const key = `${index}|${title}`;
  if (key === lastWhere) return;
  lastWhere = key;
  if (!title) {
    where.removeAttribute("data-on");
    return;
  }
  where.replaceChildren();
  const b = document.createElement("b");
  b.textContent = index;
  where.append(b, ` ${title}`);
  where.setAttribute("data-on", "");
}

/** 0..1 along the page or the journey. */
export function setNavProgress(k: number): void {
  if (!progress) return;
  const q = Math.round(Math.min(1, Math.max(0, k)) * 400) / 400;
  if (q === lastK) return;
  lastK = q;
  progress.style.setProperty("--progress", String(q));
}
