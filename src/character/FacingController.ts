import { MOVEMENT } from '../config/movement';

const TAU = Math.PI * 2;

/** Wraps an angle difference into (-PI, PI], so smoothing always turns the short way round. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/**
 * One frame of yaw easing toward targetYaw (or unchanged if null — the
 * player is standing still). Framerate-independent exponential decay (see
 * MOVEMENT.rotation.smoothingRate) rather than a flat per-frame lerp, so the
 * feel doesn't change with fps. Pure function, shared by the live-rendering
 * FacingController below and by the deterministic sim step (src/sim/step.ts)
 * so both paths use exactly the same maths.
 */
export function stepFacing(currentYaw: number, targetYaw: number | null, deltaSeconds: number): number {
  if (targetYaw === null) {
    return currentYaw;
  }
  const delta = shortestAngleDelta(currentYaw, targetYaw);
  const t = 1 - Math.exp(-MOVEMENT.rotation.smoothingRate * deltaSeconds);
  return currentYaw + delta * t;
}

/** Stateful wrapper around stepFacing for the live render loop. */
export class FacingController {
  private yaw = 0;

  update(targetYaw: number | null, deltaSeconds: number): number {
    this.yaw = stepFacing(this.yaw, targetYaw, deltaSeconds);
    return this.yaw;
  }
}
