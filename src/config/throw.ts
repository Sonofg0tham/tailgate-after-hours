/**
 * Bolt-throw numbers, ported from Tailgate's actual `src/config/throw.ts` —
 * checked against the source, not the design doc's paraphrase. `boltCount`
 * and `aimDeadzone` are dimensionless, ported unconverted. `maxRangeMetres`
 * and `boltSpeedMetresPerSecond` are the project's usual pixel:metre
 * conversion (Tailgate's TILE_SIZE=32px = this project's cellSize=1m — see
 * src/config/noise.ts's header for why this is a straight ÷32, not a feel
 * re-tune). `noiseRadiusMetres` instead preserves Tailgate's OWN internal
 * ratio between bolt-noise and footstep-noise (230px bolt : 180px run-noise
 * in Tailgate, ≈1.28×) applied to this project's already-shipped run noise
 * radius (3.2m, src/config/noise.ts) rather than a raw ÷32 — a raw
 * conversion would give ~7.2m, nearly a fifth of Floor 12's width, badly out
 * of proportion with the noise system already live.
 */
export const THROW = {
  /** Bolts available per run. Refills to this on every restart. */
  boltCount: 3,

  /** How far a bolt can be thrown. Aim beyond this is clamped. */
  maxRangeMetres: 10.625,

  /** How fast a thrown bolt travels to its landing spot. */
  boltSpeedMetresPerSecond: 22.5,

  /** How far the landing noise carries to guards — a guard within this radius of the landing spot is pulled to investigate it. */
  noiseRadiusMetres: 4.09,

  /** Gamepad right-stick push below this is ignored when aiming. */
  aimDeadzone: 0.25,
} as const;
