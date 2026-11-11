import type { TapeEvent } from "../scene/bricks";

/** Slide-out drawers: native <dialog> elements opened by
 * [data-drawer-open="id"] buttons. The dialog gives the focus trap, Escape
 * and the inert page for free; this only adds the backdrop click, the
 * return of focus and the page-level open flag. */
export function initDrawers(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-drawer-open]")) {
    const dialog = document.getElementById(`drawer-${btn.dataset.drawerOpen}`) as HTMLDialogElement | null;
    if (!dialog || typeof dialog.showModal !== "function") continue;
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-controls", dialog.id);
    let isOpen = false;
    btn.addEventListener("click", () => {
      isOpen = true;
      dialog.showModal();
      document.documentElement.setAttribute("data-drawer", dialog.id);
      dialog.dispatchEvent(new CustomEvent("drawer:open"));
      document.dispatchEvent(new CustomEvent("drawer:toggle", { detail: true }));
    });
    // The slide-out transition delays the native `close` event by its
    // length, so the page is released here, at once, from every close path;
    // the `close` listener only catches closes this code did not start.
    const release = () => {
      if (!isOpen) return;
      isOpen = false;
      document.documentElement.removeAttribute("data-drawer");
      document.dispatchEvent(new CustomEvent("drawer:toggle", { detail: false }));
      btn.focus({ preventScroll: true });
    };
    const close = () => {
      release();
      dialog.close();
    };
    dialog.querySelector("[data-drawer-close]")?.addEventListener("click", close);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });
    dialog.addEventListener("cancel", release);
    dialog.addEventListener("close", release);
  }
}

let log: LogDrawer | null = null;
/** One shared replay-log drawer for the page (static path and engine). */
export function getLogDrawer(): LogDrawer {
  return (log ??= new LogDrawer());
}

interface JourneyData {
  car: { tape: TapeEvent[] };
}

/** The replay-log drawer: the real event tape, one row per event, loaded on
 * first open. `mark(tau)` points at the row the stage is currently playing. */
export class LogDrawer {
  private dialog: HTMLDialogElement | null;
  private rows: HTMLTableRowElement[] = [];
  private times: number[] = [];
  private current = -1;
  private loaded: Promise<void> | null = null;

  constructor() {
    this.dialog = document.getElementById("drawer-log") as HTMLDialogElement | null;
    this.dialog?.addEventListener("drawer:open", () => {
      void this.load().then(() => this.scrollToCurrent());
    });
  }

  private load(): Promise<void> {
    if (this.loaded) return this.loaded;
    this.loaded = fetch(`${import.meta.env.BASE_URL}media/journey-data.json`)
      .then((r) => (r.ok ? (r.json() as Promise<JourneyData>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => this.render(data.car.tape))
      .catch(() => {
        const body = this.dialog?.querySelector("[data-log]");
        if (body) body.innerHTML = `<tr><td colspan="5">The tape could not be loaded.</td></tr>`;
      });
    return this.loaded;
  }

  private render(tape: TapeEvent[]) {
    const body = this.dialog?.querySelector<HTMLElement>("[data-log]");
    if (!body) return;
    body.replaceChildren();
    let wire = 0;
    for (const e of tape) {
      const tr = document.createElement("tr");
      const local = (e as { local?: boolean }).local;
      if (!local) wire++;
      if (e.type === "worker_offline" || e.type === "lease_expired") tr.dataset.kind = "fault";
      const cells = [
        `t+${e.t.toFixed(2)}`,
        LABEL[e.type] ?? e.type,
        e.node ?? "",
        e.worker !== undefined ? `w${e.worker + 1}` : "",
        local ? "local" : String(e.lamport),
      ];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
      body.appendChild(tr);
      this.rows.push(tr);
      this.times.push(e.t);
    }
    const count = this.dialog?.querySelector("[data-log-count]");
    if (count) count.textContent = String(wire);
  }

  /** Tape time currently on the stage. Cheap when nothing changed. */
  mark(tau: number): void {
    if (!this.rows.length) return;
    let i = -1;
    for (let k = 0; k < this.times.length && this.times[k]! <= tau; k++) i = k;
    if (i === this.current) return;
    this.rows[this.current]?.removeAttribute("data-now");
    this.rows[i]?.setAttribute("data-now", "");
    this.current = i;
  }

  private scrollToCurrent() {
    const row = this.rows[this.current];
    row?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  }
}

const LABEL: Record<string, string> = {
  job_claimed: "claimed",
  placement_complete: "verified",
  worker_offline: "went silent",
  lease_expired: "lease expired, reopens",
};
