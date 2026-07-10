import type { MissionState } from '../sim/MissionState';

/**
 * The engagement rating. GHOST / PROFESSIONAL / NOISY / DETAINED are ported
 * from Tailgate's actual `decideRating` (first match wins, same thresholds).
 * DAWN is new to the night engagement: reaching 05:00 without planting-and-
 * exfilling is a distinct outcome, not one of the four success grades.
 */
export type Rating = 'GHOST' | 'PROFESSIONAL' | 'NOISY' | 'DETAINED' | 'DAWN';

/**
 * Decides the rating and its deadpan remark, purely from the mission facts.
 * The order is load-bearing: dawn first (an incomplete engagement outranks
 * everything), then Tailgate's ladder — a detain beats an alarm beats a
 * sighting beats a clean run. Remarks are reworded from Tailgate's in the
 * project's own voice (UK English, no em-dashes).
 */
export function decideRating(mission: MissionState): { rating: Rating; remark: string } {
  if (mission.phase === 'dawn') {
    return {
      rating: 'DAWN',
      remark: 'Dawn arrived before the consultant cleared the site. The night shift clocked off. The job did not.',
    };
  }
  if (mission.detains >= 1) {
    return {
      rating: 'DETAINED',
      remark: 'Objective met, dignity less so. The trouser repair is itemised separately on the invoice.',
    };
  }
  if (mission.maxAlertLevel >= 1) {
    return {
      rating: 'NOISY',
      remark: 'The site knew someone was in. A covert assessment is meant to stay covert.',
    };
  }
  if (mission.everSpotted) {
    return {
      rating: 'PROFESSIONAL',
      remark: 'Observed but never reported. Acceptable tradecraft for a night shift.',
    };
  }
  return {
    rating: 'GHOST',
    remark: "No detections logged. On this evidence the client's CCTV budget is not money well spent.",
  };
}
