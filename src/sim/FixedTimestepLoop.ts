/**
 * Accumulator-pattern fixed timestep: decouples the simulation rate from the
 * render frame rate, so the sim always advances in identical dt slices
 * regardless of how fast frames actually arrive. This is what makes replay
 * exact — a variable-delta loop would take different-sized steps depending
 * on frame timing, and the collision/facing maths would diverge.
 */
export class FixedTimestepLoop {
  private accumulator = 0;

  constructor(
    private readonly stepSeconds: number,
    private readonly onStep: (deltaSeconds: number) => void,
  ) {}

  /**
   * Feed it real elapsed time since the last render frame; it calls onStep
   * zero or more times with exactly stepSeconds each. Accumulator is capped
   * at 8 steps so a tab-backgrounded stall doesn't fire hundreds of steps in
   * one burst trying to catch up (a "spiral of death").
   */
  advance(frameDeltaSeconds: number): void {
    this.accumulator = Math.min(this.accumulator + frameDeltaSeconds, this.stepSeconds * 8);
    while (this.accumulator >= this.stepSeconds) {
      this.onStep(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }
  }
}
