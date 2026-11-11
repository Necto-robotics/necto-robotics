/** The viewport readout: chapter, projection, lens and frame time, written
 * at most a few times a second. Purely informational; the chapter index and
 * nav carry the same position for assistive tech. */
export interface TelemetrySample {
  index: number;
  total: number;
  title: string;
  fov: number;
  /** 0 = perspective, 1 = the near-orthographic schematic view. */
  ortho: number;
  frameMs: number;
  /** 0..1 along the journey. */
  k: number;
  on: boolean;
}

export class Telemetry {
  private root: HTMLElement | null;
  private f: Record<string, HTMLElement> = {};
  private mark: HTMLElement | null;
  private last = 0;
  private on = false;

  constructor(parent: HTMLElement) {
    this.root = parent.querySelector<HTMLElement>(".reticle");
    this.root?.querySelectorAll<HTMLElement>("[data-tele]").forEach((el) => (this.f[el.dataset.tele!] = el));
    this.mark = this.f.mark ?? null;
  }

  update(s: TelemetrySample, now: number): void {
    if (!this.root) return;
    if (s.on !== this.on) {
      this.on = s.on;
      this.root.toggleAttribute("data-on", s.on);
    }
    this.mark?.style.setProperty("--k", s.k.toFixed(4));
    if (now - this.last < 180) return;
    this.last = now;
    set(this.f.chapter, `${String(s.index).padStart(2, "0")} · ${s.title}`);
    set(this.f.proj, s.ortho > 0.5 ? "Orthographic" : "Perspective");
    set(this.f.fov, `FOV ${s.fov.toFixed(0)}°`);
    set(this.f.frame, s.frameMs > 0 ? `${s.frameMs.toFixed(1)} ms` : "");
  }
}

function set(el: HTMLElement | undefined, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}
