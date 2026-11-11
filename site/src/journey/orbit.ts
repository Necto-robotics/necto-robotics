/** Reader-controlled orbit and zoom on top of the authored camera.
 *
 * Dragging on the stage turns the camera about its look target with
 * inertia: the pointer sets a velocity, release lets it coast and damp.
 * Where the story needs the authored framing (`allow` near 0) the offset
 * relaxes back to nothing. Buttons give the same control from the keyboard. */
export interface OrbitOffset {
  yaw: number;
  pitch: number;
  /** Distance multiplier: 1 = authored. */
  zoom: number;
}

const PITCH_LIMIT = 0.55;
const ZOOM = { min: 0.55, max: 1.7 };
/** Coast damping per second (higher stops sooner). */
const DAMP = 4.2;
/** Return-to-rest stiffness when the story takes the camera back. */
const RETURN = 6;

export class Orbit {
  readonly offset: OrbitOffset = { yaw: 0, pitch: 0, zoom: 1 };
  private vel = { yaw: 0, pitch: 0, zoom: 0 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private pinch = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private nudge = { yaw: 0, zoom: 0 };
  /** 0..1, how much of the offset applies right now. */
  allow = 0;
  /** True while the reader is turning the scene (hides hover picking). */
  get active(): boolean {
    return this.dragging || Math.abs(this.vel.yaw) + Math.abs(this.vel.pitch) > 0.05;
  }

  constructor(surface: HTMLElement, controls: HTMLElement | null) {
    surface.style.touchAction = "pan-y";
    surface.addEventListener("pointerdown", (e) => {
      if (this.allow < 0.5 || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a, button, .chapter__copy")) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.lastT = e.timeStamp;
        this.vel.yaw = this.vel.pitch = 0;
        surface.setPointerCapture(e.pointerId);
        surface.setAttribute("data-dragging", "");
      } else if (this.pointers.size === 2) {
        this.pinch = this.span();
      }
    });
    surface.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.pinch > 0) {
        const s = this.span();
        this.offset.zoom = clamp(this.offset.zoom * (this.pinch / Math.max(1, s)), ZOOM.min, ZOOM.max);
        this.pinch = s;
        return;
      }
      if (!this.dragging) return;
      const dt = Math.max(1, e.timeStamp - this.lastT) / 1000;
      const dx = (e.clientX - this.lastX) / innerWidth;
      const dy = (e.clientY - this.lastY) / innerHeight;
      // Mouse drags orbit both axes; a touch drag keeps to yaw so a vertical
      // swipe stays a scroll.
      const yawD = -dx * 4.2;
      const pitchD = e.pointerType === "touch" ? 0 : dy * 2.6;
      this.offset.yaw += yawD;
      this.offset.pitch = clamp(this.offset.pitch + pitchD, -PITCH_LIMIT, PITCH_LIMIT);
      this.vel.yaw = lerp(this.vel.yaw, yawD / dt, 0.5);
      this.vel.pitch = lerp(this.vel.pitch, pitchD / dt, 0.5);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastT = e.timeStamp;
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (this.pointers.size === 0 && this.dragging) {
        this.dragging = false;
        surface.removeAttribute("data-dragging");
        // A pointer that stopped before lifting does not coast.
        if (e.timeStamp - this.lastT > 80) this.vel.yaw = this.vel.pitch = 0;
      }
    };
    surface.addEventListener("pointerup", up);
    surface.addEventListener("pointercancel", up);

    if (controls) {
      controls.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-orbit]");
        if (!btn) return;
        switch (btn.dataset.orbit) {
          case "left":
            this.vel.yaw = -2.4;
            break;
          case "right":
            this.vel.yaw = 2.4;
            break;
          case "in":
            this.vel.zoom = -1.4;
            break;
          case "out":
            this.vel.zoom = 1.4;
            break;
          case "reset":
            this.reset();
            break;
        }
      });
      // Holding an arrow keeps turning; the step is small and repeats.
      controls.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") this.nudge.yaw = -1;
        else if (e.key === "ArrowRight") this.nudge.yaw = 1;
        else if (e.key === "+" || e.key === "=") this.nudge.zoom = -1;
        else if (e.key === "-" || e.key === "_") this.nudge.zoom = 1;
        else return;
        e.preventDefault();
      });
      controls.addEventListener("keyup", () => (this.nudge.yaw = this.nudge.zoom = 0));
    }
  }

  private span(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  reset(): void {
    this.vel.yaw = this.vel.pitch = this.vel.zoom = 0;
    this.nudge.yaw = this.nudge.zoom = 0;
    this.returning = true;
  }
  private returning = false;

  /** Advance inertia and relaxation by dt seconds. */
  update(dt: number, allow: number): void {
    this.allow = allow;
    const o = this.offset;
    if (this.nudge.yaw) this.vel.yaw = this.nudge.yaw * 1.6;
    if (this.nudge.zoom) this.vel.zoom = this.nudge.zoom * 1.1;
    if (!this.dragging) {
      o.yaw += this.vel.yaw * dt;
      o.pitch = clamp(o.pitch + this.vel.pitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
      o.zoom = clamp(o.zoom * Math.exp(this.vel.zoom * dt), ZOOM.min, ZOOM.max);
      const d = Math.exp(-DAMP * dt);
      this.vel.yaw *= d;
      this.vel.pitch *= d;
      this.vel.zoom *= d;
    }
    // Relax toward the authored framing when the story asks (allow falling)
    // or after a reset, with a critically damped approach.
    const back = this.returning || allow < 0.999;
    if (back && !this.dragging) {
      const k = 1 - Math.exp(-RETURN * dt);
      o.yaw = wrap(o.yaw) * (1 - k);
      o.pitch *= 1 - k;
      o.zoom = 1 + (o.zoom - 1) * (1 - k);
      if (Math.abs(o.yaw) < 1e-3 && Math.abs(o.pitch) < 1e-3 && Math.abs(o.zoom - 1) < 1e-3) {
        o.yaw = o.pitch = 0;
        o.zoom = 1;
        this.returning = false;
      }
    }
  }

  get idle(): boolean {
    const o = this.offset;
    return !this.dragging && Math.abs(o.yaw) < 1e-3 && Math.abs(o.pitch) < 1e-3 && Math.abs(o.zoom - 1) < 1e-3;
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Shortest way home for an angle that may have gone round more than once. */
function wrap(a: number): number {
  const two = Math.PI * 2;
  a = ((a % two) + two) % two;
  return a > Math.PI ? a - two : a;
}
