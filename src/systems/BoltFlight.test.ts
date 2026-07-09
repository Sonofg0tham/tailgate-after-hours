import { describe, expect, it } from 'vitest';
import { stepBolt } from './BoltFlight';
import { createBolt } from '../entities/BoltState';
import { THROW } from '../config/throw';

describe('stepBolt', () => {
  it('moves toward the target at boltSpeedMetresPerSecond', () => {
    const bolt = createBolt(1, 0, 0, 10, 0);
    const next = stepBolt(bolt, 1 / 60);
    expect(next.x).toBeCloseTo(THROW.boltSpeedMetresPerSecond / 60, 5);
    expect(next.landed).toBe(false);
  });

  it('lands exactly on the target once close enough, without overshooting', () => {
    const bolt = createBolt(1, 0, 0, 1, 0); // 1m to travel, plenty covered in one big tick
    const next = stepBolt(bolt, 1);
    expect(next.x).toBeCloseTo(1, 5);
    expect(next.z).toBeCloseTo(0, 5);
    expect(next.landed).toBe(true);
  });

  it('is a no-op once landed', () => {
    const bolt = createBolt(1, 0, 0, 1, 0);
    const landed = stepBolt(bolt, 1);
    const again = stepBolt(landed, 1);
    expect(again).toEqual(landed);
  });
});
