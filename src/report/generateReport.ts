import { MISSION } from '../config/mission';
import { stampClock } from '../systems/NightClock';
import { decideRating, type Rating } from './rating';
import type { MissionState } from '../sim/MissionState';

/**
 * The Engagement Report model, built purely from the mission facts. Ported
 * structurally from Tailgate's `generateReport.ts` (findings drawn from real
 * events, severity-sorted and numbered F-01…, a client-detections block, a
 * summary, a rating with a remark) and restamped for the night engagement:
 * finding times read on the 01:00-05:00 clock, and the dawn outcome reframes
 * the header. Because it consumes only `MissionState`, it is a pure function
 * — the same run always yields the same report, which is what lets the
 * report "match the event log exactly".
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type { Rating };

export interface Finding {
  ref: string;
  severity: Severity;
  text: string;
}

export interface ReportHeader {
  client: string;
  site: string;
  consultant: string;
  ref: string;
  window: string;
  date: string;
  /** Present only on the dawn outcome — the aborted-engagement banner. */
  outcomeLine: string | null;
}

export interface ReportSummary {
  timeOnSite: string;
  alertReached: string;
  secondaries: string;
}

export interface ReportModel {
  header: ReportHeader;
  findings: Finding[];
  clientDetections: string[];
  summary: ReportSummary;
  rating: Rating;
  ratingRemark: string;
  dawn: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const INGRESS_TEXT: Record<string, string> = {
  'fire-stairs': 'Fire-stairs door propped open during the cleaning crew smoke break. Consultant entered unchallenged',
  lift: 'Goods lift boarded on its published delivery schedule. Consultant reached the floor',
  lobby: 'Tailgated a staff member through the lobby badge gate. Door dwell time (1.6s) permits unauthorised entry',
};

export function generateReport(mission: MissionState): ReportModel {
  const dawn = mission.phase === 'dawn';
  const endMs = mission.exfilledAtMs ?? MISSION.dawnDeadlineMs;
  const { rating, remark } = decideRating(mission);

  const findings = buildFindings(mission, dawn);
  const clientDetections = buildClientDetections(mission);

  const photosDone = MISSION.photos.filter((p) => mission.photos[p.id] !== null).length;

  return {
    header: {
      client: 'MERIDIAN MUTUAL',
      site: 'MERIDIAN MUTUAL HQ — FLOOR 12',
      consultant: 'SONOFG0THAM CONSULTING',
      ref: 'ENG-2026-0710/NIGHT',
      window: '01:00-05:00',
      date: '10 JULY 2026',
      outcomeLine: dawn ? dawnBanner(mission) : null,
    },
    findings,
    clientDetections,
    summary: {
      timeOnSite: formatDuration(endMs),
      alertReached: alertLabel(mission.maxAlertLevel),
      secondaries: `${photosDone} of ${MISSION.photos.length} photographed`,
    },
    rating,
    ratingRemark: remark,
    dawn,
  };
}

function buildFindings(mission: MissionState, dawn: boolean): Finding[] {
  const raw: Array<{ severity: Severity; text: string }> = [];

  if (mission.ingressRoute !== null) {
    const base = INGRESS_TEXT[mission.ingressRoute] ?? `Unauthorised entry via ${mission.ingressRoute}`;
    raw.push({ severity: 'HIGH', text: `${base} at ${stampClock(mission.ingressAtMs ?? 0)}.` });
  }

  if (mission.plantedAtMs !== null) {
    const tail = dawn
      ? 'Consultant did not clear the site before dawn; device recovery by the client is likely.'
      : 'Device remained in place at exfil.';
    raw.push({ severity: 'CRITICAL', text: `Rogue device planted on the server rack at ${stampClock(mission.plantedAtMs)}. ${tail}` });
  }

  for (const photo of MISSION.photos) {
    const at = mission.photos[photo.id];
    if (at !== null) {
      raw.push({ severity: 'MEDIUM', text: `${photo.label} photographed at ${stampClock(at)}. Sensitive material left in the open.` });
    }
  }

  if (mission.boltsThrown > 0) {
    const plural = mission.boltsThrown === 1 ? 'device' : 'devices';
    raw.push({ severity: 'LOW', text: `${mission.boltsThrown} distraction ${plural} deployed to misdirect patrolling staff.` });
  }

  return raw
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((f, i) => ({ ref: `F-${pad2(i + 1)}`, severity: f.severity, text: f.text }));
}

function buildClientDetections(mission: MissionState): string[] {
  const lines: string[] = [];
  if (mission.everSpotted) {
    lines.push('Consultant was observed by site staff during the engagement.');
  }
  if (mission.detains >= 1) {
    const plural = mission.detains === 1 ? 'occasion' : 'occasions';
    lines.push(`Consultant detained by client staff on ${mission.detains} ${plural}. Letter of authorisation presented.`);
  }
  if (mission.maxAlertLevel >= 2) {
    lines.push('Full site lockdown initiated. Badge access suspended building-wide.');
  } else if (mission.maxAlertLevel >= 1) {
    lines.push('Site alert level raised to CAUTIOUS.');
  }
  if (lines.length === 0) {
    lines.push('None. Client security did not detect the assessment.');
  }
  return lines;
}

function dawnBanner(mission: MissionState): string {
  return mission.plantedAtMs !== null
    ? 'ENGAGEMENT EXPIRED AT DAWN — DEVICE PLANTED, CONSULTANT DID NOT CLEAR THE SITE'
    : 'ENGAGEMENT EXPIRED AT DAWN — PRIMARY OBJECTIVE INCOMPLETE';
}

function alertLabel(level: 0 | 1 | 2): string {
  if (level >= 2) return 'LOCKDOWN';
  if (level >= 1) return 'CAUTIOUS';
  return 'CALM';
}

/** mm:ss for a millisecond duration. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
