/** A small rolling-average fps counter, so fps can be read directly off the deployed URL. */
export class FpsMeter {
  private readonly samples: number[] = [];
  private readonly maxSamples = 60;
  private lastTime = performance.now();

  /** Call once per frame. Returns the current rolling-average fps. */
  tick(): number {
    const now = performance.now();
    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    if (deltaMs > 0) {
      this.samples.push(1000 / deltaMs);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
    }

    const sum = this.samples.reduce((total, fps) => total + fps, 0);
    return this.samples.length > 0 ? sum / this.samples.length : 0;
  }
}
