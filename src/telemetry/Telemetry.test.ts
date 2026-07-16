import { describe, expect, it } from 'vitest';
import { Telemetry } from './Telemetry';
import { LIGHTING } from '../config/lighting';

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
});
