import { describe, expect, it } from 'vitest';
import { resolveGamepadIntent } from './GamepadInput';

describe('resolveGamepadIntent', () => {
  it('returns null inside the deadzone', () => {
    expect(resolveGamepadIntent(0.05, 0.05)).toBeNull();
  });

  it('creeps at low stick magnitude', () => {
    const intent = resolveGamepadIntent(0.3, 0);
    expect(intent?.speed).toBe('creep');
    expect(intent?.device).toBe('gamepad');
  });

  it('walks at medium stick magnitude', () => {
    const intent = resolveGamepadIntent(0.6, 0);
    expect(intent?.speed).toBe('walk');
  });

  it('runs at full stick magnitude', () => {
    const intent = resolveGamepadIntent(1, 0);
    expect(intent?.speed).toBe('run');
  });

  it('normalises direction to unit length', () => {
    const intent = resolveGamepadIntent(1, 1);
    const magnitude = Math.hypot(intent!.directionX, intent!.directionZ);
    expect(magnitude).toBeCloseTo(1, 5);
  });
});
