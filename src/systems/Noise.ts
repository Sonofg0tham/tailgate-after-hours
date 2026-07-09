import { NOISE } from '../config/noise';
import type { SpeedState } from '../input/InputState';
import type { SurfaceType } from '../world/level';

/**
 * The noise radius for a given speed and the surface underfoot. Pure
 * function so it's trivially testable; surface defaults to concrete's
 * multiplier (neutral) when the player is standing somewhere with no zone
 * (shouldn't happen on the real level, but keeps this safe to call).
 */
export function noiseRadius(speed: SpeedState, surface: SurfaceType | null): number {
  const base = NOISE.baseRadii[speed];
  const multiplier = NOISE.surfaceMultiplier[surface ?? 'concrete'];
  return base * multiplier;
}
