import { MOVEMENT } from '../config/movement';
import type { MovementIntent, SpeedState } from './InputState';

/**
 * Turns a raw left-stick vector into a movement intent. Pulled out as a pure
 * function (no Gamepad object involved) so the speed thresholding can be unit
 * tested without a browser. How far the stick is pushed sets the speed, so
 * one input gives both direction and pace.
 *
 * @param stickX raw stick X axis, -1 to 1.
 * @param stickZ raw stick Y axis (mapped to world Z), -1 to 1.
 * @returns an intent, or null when the stick is resting inside the deadzone,
 *   so the caller can fall back to the keyboard.
 */
export function resolveGamepadIntent(stickX: number, stickZ: number): MovementIntent | null {
  const magnitude = Math.hypot(stickX, stickZ);

  // Inside the deadzone the stick is treated as centred. This also kills the
  // slow drift a worn controller produces when nobody is touching it.
  if (magnitude < MOVEMENT.gamepad.deadzone) {
    return null;
  }

  // Speed comes from how hard the stick is pushed. Read the magnitude BEFORE
  // normalising, otherwise every push would look like a full run.
  let speed: SpeedState;
  if (magnitude <= MOVEMENT.gamepad.creepThreshold) {
    speed = 'creep';
  } else if (magnitude <= MOVEMENT.gamepad.walkThreshold) {
    speed = 'walk';
  } else {
    speed = 'run';
  }

  return {
    directionX: stickX / magnitude,
    directionZ: stickZ / magnitude,
    speed,
    device: 'gamepad',
  };
}

/**
 * Reads the first connected gamepad's left stick each frame. A thin wrapper
 * around the browser Gamepad API (polled, no events) over resolveGamepadIntent.
 */
export const GamepadInput = {
  read(): MovementIntent | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null);
    if (!pad || pad.axes.length < 2) {
      return null;
    }

    return resolveGamepadIntent(pad.axes[0], pad.axes[1]);
  },
};
