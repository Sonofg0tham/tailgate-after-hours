/**
 * The night engagement runs 01:00 to 05:00 per GAME_DESIGN.md. This is a
 * stub: it always reads 01:00. Real elapsed-time tracking, the 05:00
 * deadline, and whatever happens at it are Phase 4 (the job) territory —
 * this just reserves the HUD real estate and the format now.
 */
export function nightClockLabel(): string {
  return '01:00';
}
