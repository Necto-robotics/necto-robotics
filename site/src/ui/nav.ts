/** Shared header: the mobile menu and page prefetch for instant transitions. */

export function initNav(): void {
  const nav = document.querySelector<HTMLElement>("[data-nav]");
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
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
