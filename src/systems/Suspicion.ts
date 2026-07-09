import { DETECTION } from '../config/detection';
import { LIGHTING } from '../config/lighting';
import type { SpeedState } from '../input/InputState';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export interface SuspicionInputs {
  /** True this tick if the guard's cone currently has line-of-sight to the player. */
  seen: boolean;
  distanceCells: number;
  speed: SpeedState;
  /** 0-1, from the light grid at the player's cell. */
  lightLevel: number;
}

/**
 * One tick of suspicion fill or decay. Ported formula (see
 * src/config/detection.ts's header):
 *
 *   fill = baseFillPerSecond * proximity * speedFactor * darkness * dt
 *
 * applied when seen, otherwise a flat per-second decay. Clamped 0-100.
 */
export function stepSuspicion(current: number, inputs: SuspicionInputs, dtSeconds: number): number {
  const { suspicion } = DETECTION;

  if (!inputs.seen) {
    return Math.max(0, current - suspicion.decayPerSecond * dtSeconds);
  }

  const proximity = lerp(
    suspicion.proximityAtPointBlank,
    suspicion.proximityAtMaxRange,
    inputs.distanceCells / DETECTION.vision.rangeCells,
  );
  const speedFactor = suspicion.speedFactor[inputs.speed];
  const darkness = lerp(LIGHTING.concealmentFloor, 1, inputs.lightLevel);

  const fill = suspicion.baseFillPerSecond * proximity * speedFactor * darkness * dtSeconds;
  return Math.min(100, current + fill);
}
