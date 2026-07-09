import { describe, expect, it } from 'vitest';
import { AnimationController } from './AnimationController';

describe('AnimationController.clipFor', () => {
  it('idle and not crouched plays idle', () => {
    expect(AnimationController.clipFor('idle', false)).toBe('idle');
  });

  it('idle and crouched plays crouchIdle', () => {
    expect(AnimationController.clipFor('idle', true)).toBe('crouchIdle');
  });

  it('creep always plays crouchWalk, regardless of the crouched flag', () => {
    expect(AnimationController.clipFor('creep', true)).toBe('crouchWalk');
    expect(AnimationController.clipFor('creep', false)).toBe('crouchWalk');
  });

  it('walk and run ignore the crouched flag — there is no crouch-run clip', () => {
    expect(AnimationController.clipFor('walk', true)).toBe('walk');
    expect(AnimationController.clipFor('run', true)).toBe('run');
  });
});
