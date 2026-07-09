/**
 * Movement tuning for the spike. Distances in metres, speeds in metres per
 * second — this is the 3D equivalent of Tailgate's src/config/movement.ts,
 * reusing the same three-speed shape (creep/walk/run) and gamepad thresholds.
 *
 * These numbers are placeholders sized by eye against the greybox room, not
 * a tuned feel. Real tuning is a later telemetry-driven pass per CLAUDE.md.
 */
export const MOVEMENT = {
  speeds: {
    creep: 0.9,
    walk: 2.2,
    run: 4.5,
  },

  /**
   * Gamepad left-stick tuning. Values are how far the stick is pushed, from
   * 0 (centred) to 1 (pushed fully to the edge).
   */
  gamepad: {
    deadzone: 0.18,
    creepThreshold: 0.45,
    walkThreshold: 0.8,
  },

  /** Follow camera smoothing. 1 snaps instantly to the player, lower eases. */
  camera: {
    lerp: 0.12,
  },
} as const;
