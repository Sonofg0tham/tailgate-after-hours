import { MISSION } from '../config/mission';

/**
 * The night engagement runs 01:00 to 05:00 (GAME_DESIGN.md); dawn is the
 * deadline. Elapsed real sim time maps proportionally across the 4 fictional
 * hours: a run `MISSION.dawnDeadlineMs` long spans exactly 01:00 to 05:00.
 * This is new to the 3D game — Tailgate has no clock at all (its report
 * timestamps used a fixed daytime start, purely cosmetic); here the clock is
 * a real deadline, so the same mapping labels both the live HUD and the
 * report's finding timestamps.
 */

/** The fictional clock label ("HH:MM", 24h) for a given elapsed sim time, clamped to the 01:00-05:00 window. */
function clockLabel(elapsedMs: number): string {
  const clamped = Math.max(0, Math.min(elapsedMs, MISSION.dawnDeadlineMs));
  const fictionalMinutes = Math.floor((clamped / MISSION.dawnDeadlineMs) * MISSION.clock.spanFictionalMinutes);
  const totalMinutes = MISSION.clock.startHour * 60 + MISSION.clock.startMinute + fictionalMinutes;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** The current night-clock label for the HUD, from the sim clock. */
export function nightClockLabel(simTimeMs: number): string {
  return clockLabel(simTimeMs);
}

/** True once the sim clock has reached (or passed) dawn — the mission's hard deadline. */
export function isDawn(simTimeMs: number): boolean {
  return simTimeMs >= MISSION.dawnDeadlineMs;
}

/** The night-clock stamp for a recorded event, used to date report findings ("... at 03:12"). */
export function stampClock(elapsedMs: number): string {
  return clockLabel(elapsedMs);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
