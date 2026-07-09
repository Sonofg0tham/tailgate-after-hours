/** A rolling-average fps counter plus a worst-frame tracker, so both can be read directly off the deployed URL. */
export class FpsMeter {
  private readonly samples: number[] = [];
  private readonly maxSamples = 60;
  private lastTime = performance.now();
  private worstFps = Infinity;
  private framesSeen = 0;

  /** Call once per frame. Returns the current rolling-average fps. */
  tick(): number {
    const now = performance.now();
    const deltaMs = now - this.lastTime;
    this.lastTime = now;
    this.framesSeen++;

    if (deltaMs > 0) {
      const instantFps = 1000 / deltaMs;
      this.samples.push(instantFps);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
      // Skip the first handful of frames: shader/texture warm-up on the very
      // first frames after load is a one-off cost, not a representative
      // "worst frame" during normal play.
      if (this.framesSeen > 10) {
        this.worstFps = Math.min(this.worstFps, instantFps);
      }
    }

    const sum = this.samples.reduce((total, fps) => total + fps, 0);
    return this.samples.length > 0 ? sum / this.samples.length : 0;
  }

  /** Worst single-frame fps seen since construction (after the warm-up window). */
  getWorstFps(): number {
    return Number.isFinite(this.worstFps) ? this.worstFps : 0;
  }
}
