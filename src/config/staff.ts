/**
 * Staff (cleaner) movement tuning. Ported from Tailgate's actual `Staff.ts`:
 * `STAFF_SPEED = 85` (px/s) converts via this project's speed-ratio method
 * (Tailgate's own player walk speed, 130px/s, to this project's 2.2m/s
 * MOVEMENT.speeds.walk — see src/config/noise.ts's header for why raw px:m
 * is never a literal port), giving 85/130 * 2.2 ≈ 1.44 m/s. `arrivalThreshold`
 * has no Tailgate equivalent to port (Tailgate used a pixel epsilon against
 * its own scale) — reuses the guard arrival feel (src/config/guard.ts).
 */
export const STAFF = {
  speedMetresPerSecond: 1.44,
  arrivalThreshold: 0.2,
} as const;
