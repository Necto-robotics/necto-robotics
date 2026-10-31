/** Marks the current chapter in the side index and, on the static path,
 * keeps the page scheme in step with the section being read. */
export function initChapterIndex(onChange: ((id: string) => void) | null): (id: string) => void {
  const links = new Map<string, HTMLAnchorElement>();
  document.querySelectorAll<HTMLAnchorElement>(".chapter-index a").forEach((a) => {
    links.set(a.hash.slice(1), a);
  });
  let current = "";
  const set = (id: string) => {
    if (id === current) return;
    links.get(current)?.removeAttribute("aria-current");
    links.get(id)?.setAttribute("aria-current", "true");
    current = id;
    onChange?.(id);
  };
  return set;
}
