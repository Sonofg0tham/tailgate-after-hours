import { describe, expect, it } from 'vitest';
import { resolveThrowAim } from './ThrowAim';
import { THROW } from '../config/throw';

describe('resolveThrowAim', () => {
  it('projects a gamepad stick past the deadzone to exactly maxRange, regardless of push magnitude', () => {
    const result = resolveThrowAim(0, 0, { rightStick: { x: 0.3, z: 0 }, pointerWorld: { x: 999, z: 999 } });
    expect(result.x).toBeCloseTo(THROW.maxRangeMetres, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it('falls back to the pointer when the stick is inside the deadzone', () => {
    const result = resolveThrowAim(0, 0, { rightStick: { x: 0.1, z: 0 }, pointerWorld: { x: 3, z: 4 } });
    expect(result).toEqual({ x: 3, z: 4 });
  });

  it('falls back to the pointer when there is no gamepad at all', () => {
    const result = resolveThrowAim(0, 0, { rightStick: null, pointerWorld: { x: 3, z: 4 } });
    expect(result).toEqual({ x: 3, z: 4 });
  });

  it('uses the pointer world point unclamped when within range', () => {
    const result = resolveThrowAim(5, 5, { rightStick: null, pointerWorld: { x: 6, z: 5 } });
    expect(result).toEqual({ x: 6, z: 5 });
  });

  it('clamps the pointer world point to maxRange when beyond it', () => {
    const result = resolveThrowAim(0, 0, { rightStick: null, pointerWorld: { x: THROW.maxRangeMetres * 3, z: 0 } });
    expect(result.x).toBeCloseTo(THROW.maxRangeMetres, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });
});
