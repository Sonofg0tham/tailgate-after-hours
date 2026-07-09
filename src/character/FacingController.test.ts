import { describe, expect, it } from 'vitest';
import { FacingController, shortestAngleDelta } from './FacingController';

describe('shortestAngleDelta', () => {
  it('takes the short way round across the wrap boundary', () => {
    // From just past +PI to just past -PI is a tiny step, not almost a full turn.
    const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1);
    expect(Math.abs(delta)).toBeCloseTo(0.2, 5);
  });

  it('is zero for the same angle', () => {
    expect(shortestAngleDelta(1, 1)).toBeCloseTo(0, 10);
  });
});

describe('FacingController', () => {
  it('converges toward the target over time', () => {
    const facing = new FacingController();
    let yaw = 0;
    for (let i = 0; i < 60; i++) {
      yaw = facing.update(Math.PI / 2, 1 / 60);
    }
    expect(yaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it('holds its current facing when the target is null', () => {
    const facing = new FacingController();
    facing.update(Math.PI / 2, 10); // long step, converges close enough
    const beforeHold = facing.update(Math.PI / 2, 10);
    const held = facing.update(null, 5);
    expect(held).toBe(beforeHold);
  });
});
