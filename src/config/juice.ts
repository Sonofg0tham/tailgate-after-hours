/**
 * Juice tuning — calm defaults per the accessibility spec (CLAUDE.md's
 * rules are load-bearing: no twitch, calm motion, reduced-motion is the
 * fresh-visitor default). Screen shake SHIPS AT ZERO; the machinery exists
 * so the Phase 6 setting can raise it for players who want it. Everything
 * here is render-side only.
 */
export const JUICE = {
  /** Screen shake on detain. `intensity` is the master (the Phase 6 slider); 0 = off, shipped off. */
  shake: {
    intensity: 0,
    amplitudeMetres: 0.14,
    durationMs: 340,
    frequencyHz: 21,
  },

  /** The detain impact: a brief camera dip as the hand lands on the shoulder. Gated by motion level. */
  detainImpact: {
    dipMetres: 0.3,
    durationMs: 280,
  },

  /** The Engagement Report arriving as a document, not a div: paper settle + staggered section reveal. Reduced motion = instant. */
  report: {
    arriveMs: 380,
    sectionStaggerMs: 70,
  },
} as const;
