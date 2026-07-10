/**
 * Door timings, ported from Tailgate's actual `src/config/doors.ts` and
 * `Door.ts` — checked against the source, not the design doc's paraphrase.
 *
 * `badge` and `smokers` are Tailgate's exact numbers, unconverted: both are
 * already plain milliseconds, nothing here crosses Tailgate's pixel scale so
 * no unit conversion applies (same reasoning as src/config/detection.ts).
 *
 * `lift` has NO Tailgate precedent — grepped Tailgate's entire source for
 * "lift" and found nothing but unrelated English words ("visual uplift").
 * The goods lift is new to this 3D tower setting (Tailgate is a single-floor
 * office with no lift lobby). It reuses the same `scheduleOpen()` shape as
 * `smokers`, with new timings sized by eye for a "generous, not twitchy"
 * ingress window per the accessibility rules — a placeholder like every
 * other invented number here, Craig's feel-knob pass decides the real one.
 * Unlike `badge`/`smokers`, it stays on schedule through a lockdown: it's
 * the goods route, not a staff-controlled access point, closer in spirit to
 * Tailgate's `shutter` kind (which also ignores lockdown) than to `badge`.
 */
export const DOORS = {
  /** How long a badge door stays open after a staff member badges through. */
  tailgateWindowMs: 1600,

  /** How far a staff member must be from a badge door's cell to badge it open. World metres (Tailgate's 75px, proportional conversion — see src/config/noise.ts's header for why raw px:m is never a literal port). */
  staffBadgeDistanceMetres: 2.35,

  smokers: {
    openForMs: 9000,
    closedForMs: 14000,
    phaseMs: 9000,
  },

  lift: {
    openForMs: 6000,
    closedForMs: 20000,
    phaseMs: 0,
  },
} as const;
