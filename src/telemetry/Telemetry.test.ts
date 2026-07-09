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
    t.recordEvents([{ type: 'detain', guardId: 'g1' }]);
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
});
