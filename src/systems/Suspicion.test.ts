import { describe, expect, it } from 'vitest';
import { stepSuspicion } from './Suspicion';

describe('stepSuspicion', () => {
  it('decays when not seen', () => {
    const next = stepSuspicion(50, { seen: false, distanceCells: 0, speed: 'idle', lightLevel: 1 }, 1);
    expect(next).toBeLessThan(50);
  });

  it('never decays below zero', () => {
    const next = stepSuspicion(5, { seen: false, distanceCells: 0, speed: 'idle', lightLevel: 1 }, 10);
    expect(next).toBe(0);
  });

  it('fills faster at point-blank range than at max range', () => {
    const close = stepSuspicion(0, { seen: true, distanceCells: 0, speed: 'walk', lightLevel: 1 }, 1 / 60);
    const far = stepSuspicion(0, { seen: true, distanceCells: 7, speed: 'walk', lightLevel: 1 }, 1 / 60);
    expect(close).toBeGreaterThan(far);
  });

  it('fills faster when running than when creeping', () => {
    const running = stepSuspicion(0, { seen: true, distanceCells: 3, speed: 'run', lightLevel: 1 }, 1 / 60);
    const creeping = stepSuspicion(0, { seen: true, distanceCells: 3, speed: 'creep', lightLevel: 1 }, 1 / 60);
    expect(running).toBeGreaterThan(creeping);
  });

  it('fills faster in a lit cell than a dark one, same distance and speed', () => {
    const lit = stepSuspicion(0, { seen: true, distanceCells: 3, speed: 'walk', lightLevel: 1 }, 1 / 60);
    const dark = stepSuspicion(0, { seen: true, distanceCells: 3, speed: 'walk', lightLevel: 0 }, 1 / 60);
    expect(lit).toBeGreaterThan(dark);
  });

  it('never exceeds 100', () => {
    const next = stepSuspicion(99, { seen: true, distanceCells: 0, speed: 'run', lightLevel: 1 }, 5);
    expect(next).toBe(100);
  });
});
