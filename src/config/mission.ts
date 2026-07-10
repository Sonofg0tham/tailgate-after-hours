/**
 * Mission tuning for Phase 4, "the job". The interaction numbers are ported
 * from Tailgate's actual `src/config/objectives.ts` (verified against source,
 * not the design doc): plant hold 3000ms, photo hold 1000ms, interact range
 * 48px and exfil range 90px converted by the project's usual ÷32 (Tailgate's
 * TILE_SIZE=32px = this project's cellSize=1m — see src/config/noise.ts's
 * header for why that is a straight conversion, not a feel re-tune).
 *
 * The night clock and its dawn deadline are NEW — Tailgate has no timer at
 * all (confirmed by reading its source). The full 01:00-05:00 night runs
 * `dawnDeadlineMs` in real time (Craig's call: ~12 minutes as a starting
 * value, a feel knob for his pad pass), and the report timestamps map elapsed
 * real ms proportionally across the 4 fictional hours.
 *
 * Objective/exfil points are world coordinates (cell centre = grid + 0.5),
 * placed against src/data/floor12.json: the plant on the north server rack
 * bank, the two photo secondaries on the exec desk and an office desk (the
 * password sticky note), exfil back at the lift-lobby spawn. A player reaches
 * an objective by holding interact within `interactRangeMetres` of its point.
 */
export const MISSION = {
  /** Primary objective: hold interact this long, uninterrupted, to plant the device. */
  plantHoldMs: 3000,
  /** Each photo secondary: a shorter hold. */
  photoHoldMs: 1000,

  /** How close (metres) the player must be to an objective point to hold interact against it. Tailgate's 48px. */
  interactRangeMetres: 1.5,
  /** How close (metres) to the exfil point counts as leaving the building. Tailgate's 90px. */
  exfilRangeMetres: 2.8125,

  /**
   * A cleaner walking this close (metres) to the player mid-hold counts as a
   * bump and cancels the plant/photo. Guards this close already detain (the
   * detain radius is 0.7m), so in practice this is the staff-bump case: a
   * cleaner wanders into you while you're working.
   */
  bumpDistanceMetres: 0.7,

  /** Real-time length of the whole 01:00-05:00 night. Reaching it unfinished is the dawn outcome. */
  dawnDeadlineMs: 720_000,

  /** The primary. On the north rack bank (32,2); the player stands on the open floor at (32,3) to reach it. */
  plant: { id: 'device', x: 32.5, z: 2.5, label: 'Rogue device on the server rack' },

  /** The two photo secondaries. Each completed photo is a bonus finding in the report. */
  photos: [
    { id: 'corner-office', x: 27.5, z: 17.5, label: 'Executive corner-office workstation' },
    { id: 'sticky-note', x: 11.5, z: 3.5, label: 'Password sticky note in the open-plan office' },
  ],

  /** Exfil back to the lift lobby (the reception spawn cell). Only valid once the device is planted. */
  exfil: { x: 6.5, z: 15.5 },

  /**
   * Crossing north of this grid row (the corridor spine is rows 9-10, the
   * ingress doors sit on row 11) is "entered the floor proper" — the first
   * checkpoint. The second checkpoint lands immediately after planting.
   */
  checkpointEntryRow: 10,

  /**
   * Report/HUD clock. The night opens at 01:00 and dawn is 05:00, so the
   * span is 4 fictional hours = 240 minutes, mapped proportionally across
   * `dawnDeadlineMs`. See src/systems/NightClock.ts.
   */
  clock: {
    startHour: 1,
    startMinute: 0,
    spanFictionalMinutes: 240,
  },
} as const;
