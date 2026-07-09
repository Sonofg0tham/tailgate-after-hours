import type { MovementIntent, SpeedState } from './InputState';

/**
 * Tracks which keys are currently held. Movement works on both WASD and the
 * arrow keys; Shift creeps and C runs. Ctrl and Alt are deliberately not used
 * (Ctrl+W closes the browser tab, Alt jumps to the browser menu).
 */
export class KeyboardState {
  private readonly held = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => this.held.add(e.code));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    // If focus leaves the window mid-press, don't leave a key stuck down.
    window.addEventListener('blur', () => this.held.clear());
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }
}

/**
 * Turns "is this key code down" into a movement intent. Pulled out as a pure
 * function (no KeyboardState/DOM involved) so it can be unit tested directly,
 * the same shape as GamepadInput's resolveGamepadIntent. Default pace is
 * walk; hold Shift to creep, hold C to run.
 */
export function resolveKeyboardIntent(isDown: (code: string) => boolean): MovementIntent | null {
  const upHeld = isDown('KeyW') || isDown('ArrowUp');
  const downHeld = isDown('KeyS') || isDown('ArrowDown');
  const leftHeld = isDown('KeyA') || isDown('ArrowLeft');
  const rightHeld = isDown('KeyD') || isDown('ArrowRight');

  const x = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
  // Forward (up/W) moves toward -Z in Three.js's default right-handed world.
  const z = (downHeld ? 1 : 0) - (upHeld ? 1 : 0);

  const crouched = isDown('ShiftLeft') || isDown('ShiftRight');

  if (x === 0 && z === 0) {
    // Nothing directional held. Still worth a real intent if Shift alone is
    // down, so a stationary crouch reads as crouch-idle rather than idle —
    // otherwise return null so the caller's idle fallback (or the gamepad)
    // takes over.
    return crouched ? { directionX: 0, directionZ: 0, speed: 'idle', crouched: true, device: 'keyboard' } : null;
  }

  // Normalise so diagonals are not roughly 40 percent faster than a straight line.
  const magnitude = Math.hypot(x, z);

  // C (run) wins if both speed keys are held, otherwise Shift creeps.
  let speed: SpeedState = 'walk';
  if (isDown('KeyC')) {
    speed = 'run';
  } else if (crouched) {
    speed = 'creep';
  }

  return { directionX: x / magnitude, directionZ: z / magnitude, speed, crouched: speed === 'creep', device: 'keyboard' };
}

export const KeyboardInput = {
  read(keys: KeyboardState): MovementIntent | null {
    return resolveKeyboardIntent((code) => keys.isDown(code));
  },
};
