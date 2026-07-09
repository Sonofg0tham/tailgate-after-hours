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
 * Turns the current keyboard state into a movement intent. Default pace is
 * walk; hold Shift to creep, hold C to run.
 */
export const KeyboardInput = {
  read(keys: KeyboardState): MovementIntent | null {
    const upHeld = keys.isDown('KeyW') || keys.isDown('ArrowUp');
    const downHeld = keys.isDown('KeyS') || keys.isDown('ArrowDown');
    const leftHeld = keys.isDown('KeyA') || keys.isDown('ArrowLeft');
    const rightHeld = keys.isDown('KeyD') || keys.isDown('ArrowRight');

    const x = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
    // Forward (up/W) moves toward -Z in Three.js's default right-handed world.
    const z = (downHeld ? 1 : 0) - (upHeld ? 1 : 0);

    if (x === 0 && z === 0) {
      return null;
    }

    // Normalise so diagonals are not roughly 40 percent faster than a straight line.
    const magnitude = Math.hypot(x, z);

    // C (run) wins if both speed keys are held, otherwise Shift creeps.
    let speed: SpeedState = 'walk';
    if (keys.isDown('KeyC')) {
      speed = 'run';
    } else if (keys.isDown('ShiftLeft') || keys.isDown('ShiftRight')) {
      speed = 'creep';
    }

    return { directionX: x / magnitude, directionZ: z / magnitude, speed, device: 'keyboard' };
  },
};
