import * as THREE from "three";
import type { Robot } from "../scene/robot";

/** Chapter 02: labels on the exploded hero, wired both ways to the parts
 * list in the copy. Pressing a list button (or hovering a part in 3D)
 * isolates that assembly. The list is the accessible source of truth; the
 * 3D labels only mirror it. */
const ANCHORS: Record<string, string> = {
  drive: "hotspot_drive",
  compute: "hotspot_compute",
  camera: "hotspot_camera",
  arm: "hotspot_arm",
  gripper: "hotspot_gripper",
  power: "hotspot_power",
  status: "hotspot_ring",
  chassis: "asm_chassis",
};
const NAMES: Record<string, string> = {
  drive: "Drive",
  compute: "AI compute",
  camera: "RGB-D camera",
  arm: "Arm",
  gripper: "Gripper",
  power: "Power",
  status: "Status lights",
  chassis: "Chassis",
};

export class PartTags {
  private tags = new Map<string, HTMLElement>();
  private buttons = new Map<string, HTMLButtonElement>();
  private pinned: string | null = null;
  private listHover: string | null = null;
  private sceneHover: string | null = null;
  private lastActive: string | null = null;
  private on = false;
  private iso = 0;
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, private hero: Robot, private camera: THREE.Camera) {
    for (const [part, name] of Object.entries(NAMES)) {
      const t = document.createElement("div");
      t.className = "tag";
      t.textContent = name;
      parent.appendChild(t);
      this.tags.set(part, t);
    }
    document.querySelectorAll<HTMLButtonElement>("[data-parts] button[data-part]").forEach((b) => {
      const part = b.dataset.part!;
      this.buttons.set(part, b);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        this.pinned = this.pinned === part ? null : part;
        this.sync();
      });
      const set = (p: string | null) => {
        this.listHover = p;
        this.sync();
      };
      b.addEventListener("mouseenter", () => set(part));
      b.addEventListener("mouseleave", () => set(null));
      b.addEventListener("focus", () => set(part));
      b.addEventListener("blur", () => set(null));
    });
  }

  /** Part under the pointer in 3D (null when none). */
  hover(part: string | null): void {
    if (part === this.sceneHover) return;
    this.sceneHover = part;
    this.sync();
  }

  private active(): string | null {
    return this.pinned ?? this.listHover ?? this.sceneHover;
  }

  private sync() {
    const active = this.active();
    for (const [p, b] of this.buttons) {
      b.setAttribute("aria-pressed", String(p === this.pinned));
      b.closest("li")?.toggleAttribute("data-hot", p === active);
    }
    for (const [p, t] of this.tags) t.toggleAttribute("data-hot", p === active);
  }

  update(visible: boolean): void {
    if (visible !== this.on) {
      this.on = visible;
      for (const t of this.tags.values()) t.toggleAttribute("data-on", visible);
      if (!visible) {
        this.sceneHover = null;
        this.sync();
      }
    }
    const active = visible ? this.active() : null;
    if (active) this.lastActive = active;
    this.iso += ((active ? 1 : 0) - this.iso) * 0.15;
    this.hero.isolate(this.iso > 0.01 ? this.lastActive : null, this.iso);
    if (!visible) return;
    const stage = document.querySelector<HTMLElement>(".stage")!;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (const [part, t] of this.tags) {
      const a = this.hero.anchor(ANCHORS[part]!);
      if (!a) continue;
      a.getWorldPosition(this.v);
      this.v.project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const left = x < w * 0.6;
      t.dataset.side = left ? "left" : "right";
      t.style.transform = left
        ? `translate(${x - 10}px, ${y}px) translate(-100%, -50%)`
        : `translate(${x + 10}px, ${y}px) translate(0, -50%)`;
    }
  }
}
