/**
 * Light-as-cover tuning, ported from Tailgate's actual `computeLightAt`/
 * `concealmentFloor` (checked against its source, not the design doc's
 * paraphrase — see CREDITS.md-style honesty elsewhere in this project).
 * Static this phase: the grid is built once at load from placed light
 * sources (src/data/floor12.json's `lights`) and never changes at runtime.
 * Guard torches do NOT contribute — "the torch light is cosmetic this
 * phase" per GAME_DESIGN.md's Phase 2 spec. Phase 5 makes light dynamic and
 * beautiful; this phase only needs it true.
 */
export const LIGHTING = {
  /**
   * Minimum darkness multiplier applied to suspicion fill even in pitch
   * black — being seen in absolute darkness still fills some suspicion,
   * just slowly. Ported exactly from Tailgate's `concealmentFloor`.
   */
  concealmentFloor: 0.35,

  /**
   * Small global baseline so no cell is ever literally 0 (starlight/exit-
   * sign light, not a design statement — the nystagmus visibility FLOOR for
   * rendering readability is a separate, Phase 5 concern, not this number).
   */
  ambientLevel: 0.08,
} as const;
