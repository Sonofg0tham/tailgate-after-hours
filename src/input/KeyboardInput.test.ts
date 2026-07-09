import { describe, expect, it } from 'vitest';
import { resolveKeyboardIntent } from './KeyboardInput';

function isDownFrom(codes: string[]): (code: string) => boolean {
  const held = new Set(codes);
  return (code) => held.has(code);
}

describe('resolveKeyboardIntent', () => {
  it('returns null when nothing is held', () => {
    expect(resolveKeyboardIntent(isDownFrom([]))).toBeNull();
  });

  it('walks by default when a direction is held', () => {
    const intent = resolveKeyboardIntent(isDownFrom(['KeyW']));
    expect(intent?.speed).toBe('walk');
    expect(intent?.crouched).toBe(false);
  });

  it('creeps and reports crouched when moving with Shift held', () => {
    const intent = resolveKeyboardIntent(isDownFrom(['KeyW', 'ShiftLeft']));
    expect(intent?.speed).toBe('creep');
    expect(intent?.crouched).toBe(true);
  });

  it('runs when C is held, even if Shift is also held', () => {
    const intent = resolveKeyboardIntent(isDownFrom(['KeyW', 'ShiftLeft', 'KeyC']));
    expect(intent?.speed).toBe('run');
  });

  it('reports a stationary crouch-idle intent when only Shift is held', () => {
    const intent = resolveKeyboardIntent(isDownFrom(['ShiftLeft']));
    expect(intent).toEqual({ directionX: 0, directionZ: 0, speed: 'idle', crouched: true, device: 'keyboard' });
  });

  it('normalises diagonal movement to unit length', () => {
    const intent = resolveKeyboardIntent(isDownFrom(['KeyW', 'KeyD']));
    const magnitude = Math.hypot(intent!.directionX, intent!.directionZ);
    expect(magnitude).toBeCloseTo(1, 5);
  });
});
