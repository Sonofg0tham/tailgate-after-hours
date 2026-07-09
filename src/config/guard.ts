/**
 * Guard movement/behaviour tuning that has no Tailgate equivalent to port —
 * new work for the real-time hunt. Placeholder numbers, Craig's feel-knob
 * pass per the usual pattern.
 */
export const GUARD = {
  /** Metres/second while on a normal patrol route. */
  patrolSpeed: 2.2,
  /** Sweep is patrol with urgency — same beam behaviour, brisker pace. */
  sweepSpeedMultiplier: 1.2,
  /** How close (metres) counts as "arrived" at a waypoint or investigate point. */
  arrivalThreshold: 0.2,
  /** Look-around oscillation period (ms) and amplitude (radians), ported from Tailgate's curious sweep exactly. */
  lookAround: {
    periodMs: 350,
    amplitudeRadians: 0.7,
  },
  /** How many of the guard's own upcoming route waypoints a SWEEP pass covers before standing down to PATROL. */
  sweepWaypointCount: 3,
  /** How often (ms) an active chase/search path is recomputed against the player's current position. */
  repathIntervalMs: 250,
} as const;
