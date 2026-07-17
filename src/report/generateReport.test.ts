import { describe, expect, it } from 'vitest';
import { generateReport } from './generateReport';
import { decideRating } from './rating';
import { abandonMission, createMissionState, type MissionState } from '../sim/MissionState';
import { MISSION } from '../config/mission';

function exfilled(over: Partial<MissionState> = {}): MissionState {
  return {
    ...createMissionState(),
    phase: 'exfilled',
    plantedAtMs: 90_000,
    exfilledAtMs: 180_000,
    ingressRoute: 'lift',
    ingressAtMs: 20_000,
    ...over,
  };
}

describe('decideRating — ported ladder plus dawn', () => {
  it('GHOST when never spotted, no alarm, no detain', () => {
    expect(decideRating(exfilled()).rating).toBe('GHOST');
  });

  it('PROFESSIONAL when spotted but no alarm and no detain', () => {
    expect(decideRating(exfilled({ everSpotted: true })).rating).toBe('PROFESSIONAL');
  });

  it('NOISY when the alert was raised, even if also spotted', () => {
    expect(decideRating(exfilled({ everSpotted: true, maxAlertLevel: 1 })).rating).toBe('NOISY');
  });

  it('DETAINED outranks NOISY and PROFESSIONAL', () => {
    expect(decideRating(exfilled({ everSpotted: true, maxAlertLevel: 2, detains: 1 })).rating).toBe('DETAINED');
  });

  it('DAWN outranks everything, including a detain', () => {
    expect(decideRating({ ...exfilled({ detains: 1 }), phase: 'dawn' }).rating).toBe('DAWN');
  });

  it('every rating carries a non-empty remark', () => {
    for (const m of [
      exfilled(),
      exfilled({ everSpotted: true }),
      exfilled({ maxAlertLevel: 1 }),
      exfilled({ detains: 1 }),
      { ...exfilled(), phase: 'dawn' as const },
    ]) {
      expect(decideRating(m).remark.length).toBeGreaterThan(0);
    }
  });
});

describe('generateReport', () => {
  it('orders findings by severity (CRITICAL first) and numbers them F-01…', () => {
    const mission = exfilled({
      photos: { 'corner-office': 120_000, 'sticky-note': null },
      boltsThrown: 2,
    });
    const report = generateReport(mission);
    expect(report.findings.map((f) => f.ref)).toEqual(['F-01', 'F-02', 'F-03', 'F-04']);
    expect(report.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
    // CRITICAL is the plant; 90000ms of a 720000ms night = 30 fictional minutes -> 01:30.
    expect(report.findings[0].text).toContain('Rogue device planted');
    expect(report.findings[0].text).toContain('at 01:30');
  });

  it('stamps finding times on the 01:00-05:00 night clock', () => {
    const report = generateReport(exfilled({ plantedAtMs: MISSION.dawnDeadlineMs / 2 }));
    const plant = report.findings.find((f) => f.text.includes('planted'));
    expect(plant?.text).toContain('at 03:00'); // half the night
  });

  it('reports a clean run as no client detections', () => {
    const report = generateReport(exfilled());
    expect(report.clientDetections).toEqual(['None. Client security did not detect the assessment.']);
    expect(report.rating).toBe('GHOST');
  });

  it('reports a detain as consultant-detained, with the count', () => {
    const report = generateReport(exfilled({ detains: 2, everSpotted: true, maxAlertLevel: 2 }));
    expect(report.clientDetections.some((l) => l.includes('detained by client staff on 2 occasions'))).toBe(true);
    expect(report.clientDetections.some((l) => l.includes('lockdown'))).toBe(true);
    expect(report.rating).toBe('DETAINED');
  });

  it('counts completed secondaries in the summary', () => {
    const report = generateReport(exfilled({ photos: { 'corner-office': 100_000, 'sticky-note': 130_000 } }));
    expect(report.summary.secondaries).toBe('2 of 2 photographed');
  });

  it('frames the dawn outcome with its own banner and rating', () => {
    const mission: MissionState = { ...createMissionState(), phase: 'dawn', ingressRoute: 'fire-stairs', ingressAtMs: 9000 };
    const report = generateReport(mission);
    expect(report.dawn).toBe(true);
    expect(report.rating).toBe('DAWN');
    expect(report.header.outcomeLine).toContain('PRIMARY OBJECTIVE INCOMPLETE');
    // On site from ingress (01:03) to dawn (05:00) = 03:57 on the fictional
    // clock — NOT the ~12 real minutes of the night ("12:00" was the bug).
    expect(report.summary.timeOnSite).toBe('03:57');
  });

  it('never reports a time on site longer than the whole night (04:00), for any outcome', () => {
    const missions: MissionState[] = [
      exfilled(), // GHOST
      exfilled({ everSpotted: true }), // PROFESSIONAL
      exfilled({ maxAlertLevel: 1 }), // NOISY
      exfilled({ detains: 1 }), // DETAINED
      { ...createMissionState(), phase: 'dawn', ingressRoute: 'lift', ingressAtMs: 0 }, // DAWN, entered at 01:00
    ];
    for (const m of missions) {
      const [hh, mm] = generateReport(m).summary.timeOnSite.split(':').map(Number);
      expect(hh * 60 + mm).toBeLessThanOrEqual(240); // 04:00 = 240 fictional minutes
    }
  });

  it('reports time on site on the same fictional clock as the finding timestamps', () => {
    // Entered at 01:06 (ingress 18000 -> stampClock 01:06), exfil at 02:00
    // (180000). On site 00:54, consistent with those two finding stamps.
    const mission = exfilled({ ingressAtMs: 18_000, exfilledAtMs: 180_000 });
    expect(mission.ingressAtMs).toBe(18_000);
    const report = generateReport(mission);
    expect(report.findings.find((f) => f.text.includes('entry') || f.text.includes('lift') || f.text.includes('lobby'))?.text).toContain('01:06');
    expect(report.summary.timeOnSite).toBe('00:54');
  });

  it('dawn after a plant notes the consultant did not clear the site', () => {
    const mission: MissionState = { ...createMissionState(), phase: 'dawn', plantedAtMs: 600_000 };
    const report = generateReport(mission);
    expect(report.header.outcomeLine).toContain('DEVICE PLANTED');
    const plant = report.findings.find((f) => f.text.includes('planted'));
    expect(plant?.text).toContain('did not clear the site before dawn');
  });
});

describe('the ABANDONED outcome (Phase 6)', () => {
  it('outranks everything, files the run so far, and stamps the abandon time', () => {
    const mission: MissionState = {
      ...createMissionState(),
      phase: 'abandoned',
      abandonedAtMs: 180_000, // 02:00 on the night clock
      ingressRoute: 'lift',
      ingressAtMs: 24_000, // 01:08
      detains: 1,
      everSpotted: true,
      maxAlertLevel: 2,
    };
    const report = generateReport(mission);
    expect(report.rating).toBe('ABANDONED');
    expect(report.abandoned).toBe(true);
    expect(report.header.outcomeLine).toBe('ENGAGEMENT ABANDONED BY THE CONSULTANT AT 02:00');
    // Time on site: ingress 01:08 to abandon 02:00 = 00:52 fictional.
    expect(report.summary.timeOnSite).toBe('00:52');
    // The findings that DID happen still file.
    expect(report.clientDetections.some((l) => l.includes('detained'))).toBe(true);
  });

  it('a planted-then-abandoned run marks the device disposition unconfirmed', () => {
    const mission: MissionState = { ...createMissionState(), phase: 'abandoned', abandonedAtMs: 400_000, plantedAtMs: 300_000 };
    const plant = generateReport(mission).findings.find((f) => f.text.includes('planted'));
    expect(plant?.text).toContain('device disposition unconfirmed');
  });

  it('abandonMission is a pure one-way door from infiltrating only', () => {
    const live = createMissionState();
    const gone = abandonMission(live, 5000);
    expect(gone.phase).toBe('abandoned');
    expect(gone.abandonedAtMs).toBe(5000);
    expect(live.phase).toBe('infiltrating'); // pure
    const exfilledRun: MissionState = { ...createMissionState(), phase: 'exfilled' };
    expect(abandonMission(exfilledRun, 9000)).toBe(exfilledRun); // no-op after the end
  });
});
