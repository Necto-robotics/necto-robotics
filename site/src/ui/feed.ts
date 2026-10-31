/** Draws the detector's real output (feed.json: part number, confidence and
 * a normalized top-left box per detection) over the prototype camera frame
 * in chapter 02. Plain DOM, so it works on the static path too. */
interface Detection {
  part: string;
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function initFeed(): Promise<void> {
  const fig = document.querySelector<HTMLElement>(".feed");
  const img = fig?.querySelector("img");
  if (!fig || !img) return;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}media/feed.json`);
    if (!r.ok) return;
    const data = (await r.json()) as { detections: Detection[] };
    const frame = document.createElement("div");
    frame.className = "feed__frame";
    img.replaceWith(frame);
    frame.appendChild(img);
    for (const d of data.detections) {
      const b = document.createElement("span");
      b.className = "feed__box";
      b.style.left = `${d.x * 100}%`;
      b.style.top = `${d.y * 100}%`;
      b.style.width = `${d.w * 100}%`;
      b.style.height = `${d.h * 100}%`;
      b.dataset.label = `${d.part} · ${d.score.toFixed(2)}`;
      b.setAttribute("aria-hidden", "true");
      frame.appendChild(b);
    }
  } catch {
    // The frame still reads without its boxes.
  }
}
