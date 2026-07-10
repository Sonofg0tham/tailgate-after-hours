/**
 * Audio tuning — every gain, cadence, range and cutoff as plain numbers,
 * following Tailgate's config/audio.ts split (mixing numbers here, synthesis
 * in src/audio/synth.ts, the graph in src/audio/AudioEngine.ts). All values
 * are feel knobs for Craig's pad pass; nothing here touches the sim.
 */
export const AUDIO = {
  /** Bus volumes, each multiplied under the user master volume (Phase 6 setting). */
  volumes: {
    master: 0.8,
    sting: 0.85,
    footsteps: 0.7,
    guard: 0.8,
    radio: 0.75,
    ambience: 0.45,
    ui: 0.6,
  },

  /**
   * Positional voices (PannerNode — NEW for this project; neither
   * predecessor had one, see the Phase 5 PR): linear falloff to inaudible
   * at maxDistance, plus Tailgate's proven occlusion trick — a lowpass that
   * closes when the straight line to the source crosses a wall, so guards
   * stay locatable through walls but muffled.
   */
  spatial: {
    refDistanceMetres: 1,
    maxDistanceMetres: 14,
    rolloff: 1,
    clearCutoffHz: 4200,
    occludedCutoffHz: 500,
    /** setTargetAtTime constant for occlusion changes — short enough to track a guard rounding a corner. */
    occlusionSmoothing: 0.08,
  },

  /** Player footstep cadence (ms between steps) and per-speed loudness. Creep is meant to be nearly nothing. */
  playerFootsteps: {
    intervalMs: { creep: 640, walk: 430, run: 300 },
    gain: { creep: 0.25, walk: 0.75, run: 1.1 },
  },

  /** Guard footstep cadence by animation state; the walk of someone paid by the hour. */
  guardFootsteps: {
    intervalMs: { walk: 520, run: 330 },
    gain: 1,
  },

  /** The searching mutter: a low syllabic grumble looping at the searching guard. */
  mutter: {
    gain: 0.4,
    lfoHz: 2.3,
  },

  /** Dawn birdsong: sparse chirps, quiet and awful. Starts at 05:00, keeps going under the report. */
  birdsong: {
    chirpEveryMsMin: 1200,
    chirpEveryMsMax: 3800,
    gain: 0.5,
  },

  /** Night ambience: one global HVAC bed plus placed spatial emitters. Positions are world metres on Floor 12. */
  ambience: {
    hvacBedGain: 0.35,
    /** Per-zone multiplier on the HVAC bed — rooms breathe differently. */
    zoneBedGain: {
      'server-room': 0.5,
      kitchen: 0.8,
      corridor: 1,
      reception: 0.9,
      office: 1,
      'print-room': 1,
      'corner-office': 0.8,
      maintenance: 1.2,
      ledge: 0.6,
    } as Record<string, number>,
    emitters: {
      serverFans: { x: 32.5, z: 4.5, gain: 0.9 },
      kitchenFridge: { x: 19.5, z: 2.5, gain: 0.5 },
      distantCity: { x: 38.5, z: 3.0, gain: 0.55 },
    },
  },

  /** Master duck on the detain dead-line: everything drops, the tone stays. */
  detainDuck: {
    amount: 0.3,
    holdMs: 900,
  },
} as const;
