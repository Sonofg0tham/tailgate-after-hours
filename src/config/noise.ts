import type { SurfaceType } from '../world/level';

/**
 * Noise-ring tuning. The three base radii are a proportional conversion of
 * Tailgate's original pixel numbers (creep 0, walk 90px, run 180px, at
 * 60/130/240 px/s), not a literal port — Tailgate's radii were tuned against
 * its own 2D pixel scale, which has no direct meaning in a metre-scale 3D
 * world. The conversion keeps Tailgate's radius-to-speed ratio (~0.7) and
 * applies it to this project's metre-based speeds (src/config/movement.ts).
 * This is a placeholder like every other number here — Craig's feel-knob
 * pass decides the real values.
 *
 * The surface multiplier is NEW: Tailgate's design doc says "carpet quiet,
 * tile loud" but never actually implemented a multiplier (verified against
 * its source — see the Phase 1 PR description). These numbers are invented
 * from that stated intent, not ported from a proven system.
 */
export const NOISE = {
  baseRadii: {
    idle: 0,
    creep: 0,
    walk: 1.5,
    run: 3.2,
  },

  surfaceMultiplier: {
    carpet: 0.6,
    tile: 1.15,
    concrete: 1,
  } satisfies Record<SurfaceType, number>,
} as const;
