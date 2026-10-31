import type { Stage } from "./stage";

/** Frame-time governor: steps the pixel ratio down when frames run long and
 * back up when there is headroom, so a slow GPU degrades resolution before
 * it degrades motion. */
export class Governor {
  private avg = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private dpr: number;
  private readonly min = 0.75;

  constructor(private stage: Stage) {
    this.dpr = stage.maxDpr;
  }

  sample(dt: number): void {
    if (dt <= 0 || dt > 0.25) return;
    this.avg += (dt - this.avg) * 0.05;
    if (this.avg > 1 / 40) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.avg < 1 / 58) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    if (this.slowFor > 1.5 && this.dpr > this.min) {
      this.set(Math.max(this.min, this.dpr - 0.25));
    } else if (this.fastFor > 6 && this.dpr < this.stage.maxDpr) {
      this.set(Math.min(this.stage.maxDpr, this.dpr + 0.25));
    }
  }

  private set(dpr: number) {
    this.dpr = dpr;
    this.slowFor = this.fastFor = 0;
    this.stage.setDpr(dpr);
  }

  get frameMs(): number {
    return this.avg * 1000;
  }

  get pixelRatio(): number {
    return this.dpr;
  }
}
