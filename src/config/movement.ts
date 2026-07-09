/**
 * Movement tuning for the spike. Distances in metres, speeds in metres per
 * second — this is the 3D equivalent of Tailgate's src/config/movement.ts,
 * reusing the same three-speed shape (creep/walk/run) and gamepad thresholds.
 *
 * These numbers are placeholders sized by eye against the greybox room, not
 * a tuned feel. Real tuning is a later telemetry-driven pass per CLAUDE.md.
 */
export const MOVEMENT = {
  /** Capsule (collapsed to a circle on the XZ plane) radius, in metres. */
  playerRadius: 0.35,

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

  /**
   * Follow camera feel. Ported from Tailgate's proven two-part camera (base
   * lerp-follow with a deadzone, plus a separately-eased, slower directional
   * look-ahead) — see src/camera/FollowCamera.ts for why the deadzone/
   * look-ahead pixel values became metres by the same room-scale ratio as
   * the noise radii, not a literal port. followRate/lookAheadRate are
   * per-second exponential decay rates (frame-rate independent), replacing
   * Tailgate's flat per-frame lerp — the whole project uses this approach
   * consistently now (see FacingController).
   */
  camera: {
    followRate: 6,
    deadzoneRadius: 1.1,
    lookAheadDistance: 1.5,
    lookAheadRate: 3,
    minDistance: 5,
    maxDistance: 12,
    tiltDegrees: 55,
  },

  /**
   * How fast the character's facing turns to match its movement direction.
   * Framerate-independent exponential decay: higher snaps faster, lower
   * feels heavier/eased. ~12 reaches ~95% of the way to target in a fifth of
   * a second; this is a placeholder, snappy-vs-eased is Craig's feel knob.
   */
  rotation: {
    smoothingRate: 12,
  },
} as const;
