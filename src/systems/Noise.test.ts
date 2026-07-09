import { describe, expect, it } from 'vitest';
import { noiseRadius } from './Noise';

describe('noiseRadius', () => {
  it('is zero when idle or creeping, regardless of surface', () => {
    expect(noiseRadius('idle', 'tile')).toBe(0);
    expect(noiseRadius('creep', 'tile')).toBe(0);
  });

  it('carpet dampens relative to concrete', () => {
    expect(noiseRadius('walk', 'carpet')).toBeLessThan(noiseRadius('walk', 'concrete'));
  });

  it('tile carries relative to concrete', () => {
    expect(noiseRadius('run', 'tile')).toBeGreaterThan(noiseRadius('run', 'concrete'));
  });

  it('defaults to concrete (neutral) when surface is null', () => {
    expect(noiseRadius('walk', null)).toBe(noiseRadius('walk', 'concrete'));
  });
});
