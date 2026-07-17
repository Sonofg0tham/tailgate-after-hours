import { describe, expect, it } from 'vitest';
import { Telemetry } from './Telemetry';
import { LIGHTING } from '../config/lighting';
import { createMissionState, type MissionState } from '../sim/MissionState';

const NO_OBSERVATION = { anyGuardCanSeePlayer: false, closedDoorWaitTarget: null } as const;

function exfilledMission(overrides: Partial<MissionState> = {}): MissionState {
  return {
    ...createMissionState(),
    phase: 'exfilled',
    ingressRoute: 'lift',
    ingressAtMs: 20_000,
    exfilledAtMs: 80_000,
    ...overrides,
  };
}

describe('Telemetry', () => {
  it('counts a detection when a guard reaches alert', () => {
    const t = new Telemetry();
    t.recordEvents([{ type: 'stateChanged', guardId: 'g1', from: 'curious', to: 'alert' }]);
    expect(t.summary().detections).toBe(1);
  });

  it('counts a near-miss on curious -> patrol, not on searching -> patrol', () => {
    const t = new Telemetry();
    t.recordEvents([{ type: 'stateChanged', guardId: 'g1', from: 'curious', to: 'patrol' }]);
    t.recordEvents([{ type: 'stateChanged', guardId: 'g1', from: 'sweep', to: 'patrol' }]);
    expect(t.summary().nearMisses).toBe(1);
  });

  it('counts a chase escape on alert -> searching', () => {
    const t = new Telemetry();
    t.recordEvents([{ type: 'stateChanged', guardId: 'g1', from: 'alert', to: 'searching' }]);
    expect(t.summary().chaseEscapes).toBe(1);
  });

  it('counts detains separately from chase escapes', () => {
    const t = new Telemetry();
    t.recordEvents([{ type: 'detain', guardId: 'g1', cause: 'guard-contact' }]);
    expect(t.summary().detains).toBe(1);
    expect(t.summary().chaseEscapes).toBe(0);
  });

  it('accumulates time-in-light only above the ambient floor', () => {
    const t = new Telemetry();
    t.recordTick(1, LIGHTING.ambientLevel); // pure ambient, not "lit"
    t.recordTick(1, 0.8); // clearly lit
    expect(t.summary().timeInLightSeconds).toBeCloseTo(1, 5);
    expect(t.summary().runtimeSeconds).toBeCloseTo(2, 5);
  });

  it('accumulates cone exposure once per observed tick and not when no guard sees the player', () => {
    const t = new Telemetry();
    t.recordTick(0.5, LIGHTING.ambientLevel, { ...NO_OBSERVATION, anyGuardCanSeePlayer: true });
    t.recordTick(0.5, LIGHTING.ambientLevel, NO_OBSERVATION);

    expect(t.summary().coneExposureSeconds).toBeCloseTo(0.5, 5);
  });

  it('groups closed-door wait seconds by door ID', () => {
    const t = new Telemetry();
    const lift = { doorId: 'lift', displayName: 'SERVICE LIFT' };
    const lobby = { doorId: 'lobby', displayName: 'STAFF ACCESS' };
    t.recordTick(0.25, LIGHTING.ambientLevel, { ...NO_OBSERVATION, closedDoorWaitTarget: lift });
    t.recordTick(0.25, LIGHTING.ambientLevel, { ...NO_OBSERVATION, closedDoorWaitTarget: lift });
    t.recordTick(0.25, LIGHTING.ambientLevel, { ...NO_OBSERVATION, closedDoorWaitTarget: lobby });
    t.recordTick(0.25, LIGHTING.ambientLevel, NO_OBSERVATION);

    expect(t.summary().doorWaitSecondsByDoorId).toEqual({ lift: 0.5, lobby: 0.25 });
  });

  it('lists every named dynamic door with zero wait before any wait occurs', () => {
    const t = new Telemetry([
      { id: 'lift', displayName: 'SERVICE LIFT' },
      { id: 'lobby', displayName: 'STAFF ACCESS' },
    ]);

    expect(t.summary().doorWaitSecondsByDoorId).toEqual({ lift: 0, lobby: 0 });
    expect(t.toWorksheet()).toContain('SERVICE LIFT [lift]: 0.0s');
    expect(t.toWorksheet()).toContain('STAFF ACCESS [lobby]: 0.0s');
  });

  it('produces a readable worksheet with the event log', () => {
    const t = new Telemetry();
    t.recordTick(5, 0.9);
    t.recordEvents([{ type: 'stateChanged', guardId: 'g1', from: 'curious', to: 'alert' }]);
    const worksheet = t.toWorksheet();
    expect(worksheet).toContain('Detections: 1');
    expect(worksheet).toContain('DETECTION');
  });

  it('records each ingress route once, no matter how many times it is called', () => {
    const t = new Telemetry();
    t.recordIngressRoute('lobby');
    t.recordIngressRoute('lobby');
    t.recordIngressRoute('fire-stairs');
    expect(t.summary().ingressRoutesUsed).toEqual(['lobby', 'fire-stairs']);
  });

  it('splits tailgate attempts into clean and seen', () => {
    const t = new Telemetry();
    t.recordTailgateAttempt(false);
    t.recordTailgateAttempt(true);
    t.recordTailgateAttempt(false);
    const s = t.summary();
    expect(s.tailgatesAttempted).toBe(3);
    expect(s.tailgatesClean).toBe(2);
    expect(s.tailgatesSeen).toBe(1);
  });

  it('counts bolts thrown', () => {
    const t = new Telemetry();
    t.recordBoltThrown();
    t.recordBoltThrown();
    expect(t.summary().boltsThrown).toBe(2);
  });

  it('includes the new Phase 3 fields in the worksheet', () => {
    const t = new Telemetry();
    t.recordIngressRoute('lift');
    t.recordTailgateAttempt(true);
    t.recordBoltThrown();
    const worksheet = t.toWorksheet();
    expect(worksheet).toContain('Ingress routes used: lift');
    expect(worksheet).toContain('Tailgates: 1 attempted (0 clean, 1 seen)');
    expect(worksheet).toContain('Bolts thrown: 1');
  });

  it('records ingress-to-exfil clean-run time only for a successful GHOST outcome', () => {
    const clean = new Telemetry();
    clean.recordMissionEnd(exfilledMission(), 'GHOST', 80_000);
    expect(clean.summary().cleanRunTimeSeconds).toBe(60);

    const seen = new Telemetry();
    seen.recordMissionEnd(exfilledMission({ everSpotted: true }), 'PROFESSIONAL', 80_000);
    expect(seen.summary().cleanRunTimeSeconds).toBeNull();

    const incomplete = new Telemetry();
    incomplete.recordMissionEnd(
      { ...createMissionState(), phase: 'dawn', ingressRoute: 'lift', ingressAtMs: 20_000 },
      'GHOST',
      80_000,
    );
    expect(incomplete.summary().cleanRunTimeSeconds).toBeNull();
  });

  it('records the actual first ingress route and completed secondary IDs at mission end', () => {
    const t = new Telemetry();
    t.recordMissionEnd(
      exfilledMission({
        ingressRoute: 'fire-stairs',
        photos: { 'corner-office': 50_000, 'sticky-note': null },
      }),
      'GHOST',
      80_000,
    );

    expect(t.summary().ingressRoute).toBe('fire-stairs');
    expect(t.summary().completedSecondaryIds).toEqual(['corner-office']);
  });

  it('measures time on site from first ingress instead of including pre-ingress time', () => {
    const t = new Telemetry();
    t.recordMissionEnd(exfilledMission(), 'GHOST', 80_000);
    expect(t.summary().timeOnSiteSeconds).toBe(60);

    const noIngress = new Telemetry();
    noIngress.recordMissionEnd({ ...createMissionState(), phase: 'abandoned', abandonedAtMs: 30_000 }, 'ABANDONED', 30_000);
    expect(noIngress.summary().timeOnSiteSeconds).toBe(30);
  });

  it('includes the detention cause and comparison metrics in the worksheet', () => {
    const t = new Telemetry();
    t.recordTick(1, LIGHTING.ambientLevel, {
      anyGuardCanSeePlayer: true,
      closedDoorWaitTarget: { doorId: 'lift', displayName: 'SERVICE LIFT' },
    });
    t.recordEvents([{ type: 'detain', guardId: 'g1', cause: 'seen-contact' }]);
    t.recordMissionEnd(
      exfilledMission({ photos: { 'corner-office': null, 'sticky-note': 60_000 } }),
      'GHOST',
      80_000,
    );

    const worksheet = t.toWorksheet();
    expect(worksheet).toContain('Clean-run time: 60.0s');
    expect(worksheet).toContain('Actual ingress route: lift');
    expect(worksheet).toContain('Cone exposure: 1.0s (100%)');
    expect(worksheet).toContain('SERVICE LIFT [lift]: 1.0s');
    expect(worksheet).toContain('Completed secondaries: sticky-note');
    expect(worksheet).toContain('cause: seen-contact');
  });
});
