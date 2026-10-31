import * as THREE from "three";
import type { Concept, GraphRealm } from "../scene/graph";

/** Chapter 04: labels on the graph's concepts, synced with the concept list
 * in the copy. Pressing a concept focuses it in 3D; hovering an element in
 * 3D highlights its list entry. */
const NAMES: Record<Concept, string> = {
  intent: "Human intent",
  graph: "Assembly Graph",
  execution: "Claimed job",
  log: "Event log · current revision",
  verify: "Local verification",
};

export class ConceptTags {
  private tags = new Map<Concept, HTMLElement>();
  private buttons = new Map<Concept, HTMLButtonElement>();
  private pinned: Concept | null = null;
  private listHover: Concept | null = null;
  private sceneHover: Concept | null = null;
  private on = false;
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, private graph: GraphRealm, private camera: THREE.Camera) {
    for (const [c, name] of Object.entries(NAMES) as [Concept, string][]) {
      const t = document.createElement("div");
      t.className = "tag";
      t.textContent = name;
      parent.appendChild(t);
      this.tags.set(c, t);
    }
    document.querySelectorAll<HTMLButtonElement>("[data-concepts] button[data-concept]").forEach((b) => {
      const c = b.dataset.concept as Concept;
      this.buttons.set(c, b);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        this.pinned = this.pinned === c ? null : c;
        this.sync();
      });
      const set = (x: Concept | null) => {
        this.listHover = x;
        this.sync();
      };
      b.addEventListener("mouseenter", () => set(c));
      b.addEventListener("mouseleave", () => set(null));
      b.addEventListener("focus", () => set(c));
      b.addEventListener("blur", () => set(null));
    });
  }

  hover(c: Concept | null): void {
    if (c === this.sceneHover) return;
    this.sceneHover = c;
    this.sync();
  }

  private sync() {
    const active = this.pinned ?? this.listHover ?? this.sceneHover;
    for (const [c, b] of this.buttons) {
      b.setAttribute("aria-pressed", String(c === this.pinned));
      b.closest("li")?.toggleAttribute("data-hot", c === active);
    }
    for (const [c, t] of this.tags) t.toggleAttribute("data-hot", c === active);
    this.graph.setFocus(active);
  }

  update(visible: boolean): void {
    if (visible !== this.on) {
      this.on = visible;
      if (!visible) {
        this.sceneHover = null;
        this.sync();
      }
    }
    for (const [c, t] of this.tags) t.toggleAttribute("data-on", visible && this.graph.labelled[c]);
    if (!visible) return;
    const stage = document.querySelector<HTMLElement>(".stage")!;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (const [c, t] of this.tags) {
      this.graph.anchors[c].getWorldPosition(this.v);
      this.v.project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      t.style.transform = `translate(${x + 10}px, ${y}px) translate(0, -50%)`;
    }
  }
}
