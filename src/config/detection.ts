/**
 * Detection numbers, ported from Tailgate's actual `src/config/detection.ts`
 * and `Guard.perceive()` — checked against the source, not the design doc's
 * paraphrase. Every number below is dimensionless or already per-second, so
 * nothing needed unit conversion crossing from Tailgate's pixel scale into
 * this project's metres (unlike the noise radii in src/config/noise.ts).
 * "Same numbers as starting values" per GAME_DESIGN.md's top line — this is
 * the one system where that promise was cheap to keep exactly.
 */
export const DETECTION = {
  vision: {
    /** Cells (== metres, cellSize is 1). Tailgate's 7 tiles, ported 1:1. */
    rangeCells: 7,
    /** Total field of view, degrees. */
    fovDegrees: 70,
  },

  suspicion: {
    baseFillPerSecond: 100,
    /** Proximity multiplier at point-blank range. */
    proximityAtPointBlank: 3.0,
    /** Proximity multiplier at the cone's maximum range. */
    proximityAtMaxRange: 0.32,
    /** Per-speed-state multiplier — idle counts too (standing in a lit cone still fills, slowly). */
    speedFactor: { idle: 0.7, creep: 1.0, walk: 2.2, run: 5.0 },
    decayPerSecond: 22,
    curiousThreshold: 45,
    alertAt: 100,
  },

  /** New for the 3D real-time version — see src/entities/GuardStateMachine.ts's header for the full 5-state design. */
  timing: {
    /** How long a CURIOUS pause-and-look lasts before deciding whether to escalate or stand down. */
    curiousPauseMs: 2000,
    /** Hard cap on SEARCHING before giving up and moving to SWEEP. Tailgate's original `maxCuriousMs`. */
    maxSearchMs: 9000,
    /** How long ALERT holds after losing sight before dropping state. Tailgate's `alertGiveUpMs`. */
    alertGiveUpMs: 4000,
    /** How long a SWEEP pass takes before returning to normal PATROL. */
    sweepDurationMs: 6000,
    detainedFlashMs: 1200,
  },

  radio: {
    /** Continuous unbroken sight required before a guard calls it in. Tailgate's `radioAfterMs`. */
    radioAfterMs: 3000,
    level1SpeedMultiplier: 1.3,
    level2SpeedMultiplier: 1.6,
    level1DecayMs: 60000,
  },

  /** World units (metres). Tailgate's 22px detain radius, proportionally converted like the noise radii (px:speed ratio carried over, not a literal port). */
  detainRadiusMetres: 0.7,

  chaseSpeedMultiplier: 1.5,
} as const;
