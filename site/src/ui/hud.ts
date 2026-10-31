import type { BuildSnapshot } from "../scene/build";
import type { TapeEvent } from "../scene/bricks";

/** Mission-control readout for chapter 03. Every figure is read off the
 * replayed event tape at the current frame; nothing is decorative. */
export class Hud {
  private el: HTMLElement;
  private f: Record<string, HTMLElement> = {};
  private bar: HTMLElement;
  private waves: HTMLElement[] = [];
  private log: HTMLElement;
  private last = "";
  private on = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="hud__head"><span class="hud__live">Replay</span><span>Car model · 61 jobs</span></div>
      <dl>
        <dt>Placed and verified</dt><dd data-f="complete"></dd>
        <dt>Dependency wave</dt><dd data-f="wave"></dd>
        <dt>Active claims</dt><dd data-f="claims"></dd>
        <dt>Robots online</dt><dd data-f="online"></dd>
        <dt>Messages on the wire</dt><dd data-f="wire"></dd>
      </dl>
      <div class="hud__bar"><span></span></div>
      <div class="hud__waves"></div>
      <ol class="hud__log"></ol>`;
    parent.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>("[data-f]").forEach((d) => (this.f[d.dataset.f!] = d));
    this.bar = this.el.querySelector(".hud__bar span")!;
    const w = this.el.querySelector(".hud__waves")!;
    for (let i = 0; i < 8; i++) {
      const c = document.createElement("i");
      w.appendChild(c);
      this.waves.push(c);
    }
    this.log = this.el.querySelector(".hud__log")!;
  }

  update(s: BuildSnapshot, visible: number): void {
    const on = visible > 0.5;
    if (on !== this.on) {
      this.el.toggleAttribute("data-on", on);
      this.on = on;
    }
    if (!on) return;
    const key = `${s.complete}|${s.wave}|${s.activeClaims}|${s.online}|${s.wire}|${s.log[0]?.lamport}`;
    if (key === this.last) return;
    this.last = key;
    this.f.complete!.textContent = `${String(s.complete).padStart(2, "0")} / ${s.total}`;
    this.f.wave!.textContent = `${s.wave + 1} / ${s.waveCount}`;
    this.f.claims!.textContent = String(s.activeClaims);
    this.f.online!.textContent = `${s.online} / ${s.workers}`;
    this.f.wire!.textContent = String(s.wire);
    this.bar.style.transform = `scaleX(${s.complete / s.total})`;
    s.waves.forEach((k, i) => this.waves[i]?.style.setProperty("--fill", `${Math.round(k * 100)}%`));
    this.log.innerHTML = s.log.map((e) => `<li>${fmt(e)}</li>`).join("");
  }
}

function fmt(e: TapeEvent): string {
  const t = `t+${e.t.toFixed(1).padStart(4, "0")}`;
  const w = e.worker !== undefined ? `w${e.worker + 1}` : "";
  switch (e.type) {
    case "job_claimed":
      return `${t}  claimed  ${e.node}  ${w}`;
    case "placement_complete":
      return `${t}  verified ${e.node}  ${w}`;
    case "worker_offline":
      return `${t}  ${w} silent, lease running`;
    case "lease_expired":
      return `${t}  lease expired, ${e.node} reopens`;
  }
}
