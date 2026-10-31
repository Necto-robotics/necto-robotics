/** Marks the current chapter in the side index. The index stays out of the
 * opening screen, which keeps to its three kinds of text. */
export function initChapterIndex(onChange: ((id: string) => void) | null): (id: string) => void {
  const links = new Map<string, HTMLAnchorElement>();
  document.querySelectorAll<HTMLAnchorElement>(".chapter-index a").forEach((a) => {
    links.set(a.hash.slice(1), a);
  });
  const nav = document.querySelector<HTMLElement>(".chapter-index");
  let current = "";
  const set = (id: string) => {
    if (id === current) return;
    links.get(current)?.removeAttribute("aria-current");
    links.get(id)?.setAttribute("aria-current", "true");
    current = id;
    nav?.toggleAttribute("data-away", id === "open");
    onChange?.(id);
  };
  return set;
}
