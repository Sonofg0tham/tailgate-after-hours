import type { KeyboardState } from './KeyboardInput';

/**
 * Whether the interact control is currently held — the hold-to-plant /
 * hold-to-photograph input. Keyboard `E` (checked against the shared
 * KeyboardState) or the gamepad `A` button (index 0), the same bindings
 * Tailgate's ObjectiveSystem used. Returns a plain boolean; the mission step
 * turns a sustained hold into progress, an interruption into a cancel.
 */
export const InteractInput = {
  read(keys: KeyboardState): boolean {
    if (keys.isDown('KeyE')) {
      return true;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null);
    return (pad?.buttons[0]?.value ?? 0) > 0.5;
  },
};
