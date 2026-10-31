/** DEV-only: write the current WebGL frame to disk through the vite
 * `/__capture` endpoint. Used for visual checks while the Browser pane is not
 * compositing, and to export the chapter stills (the no-WebGL path and the
 * poster that the live canvas fades in over). */
export async function captureCanvas(
  name: string,
  canvas: HTMLCanvasElement,
  opts: { dir?: "captures" | "public/media/stills"; quality?: number } = {}
): Promise<string> {
  const base64 = canvas.toDataURL("image/jpeg", opts.quality ?? 0.9).split(",")[1]!;
  const dir = opts.dir ? `&dir=${encodeURIComponent(opts.dir)}` : "";
  await fetch(`/__capture?name=${encodeURIComponent(name)}${dir}`, { method: "POST", body: base64 });
  return `${name}.jpg (${canvas.width}x${canvas.height})`;
}
