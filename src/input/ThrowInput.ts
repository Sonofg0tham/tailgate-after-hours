export interface ThrowInputState {
  /** Raw right-stick axes, -1..1 each; null when no gamepad is connected. Deadzone is applied by resolveThrowAim. */
  rightStick: { x: number; z: number } | null;
  /** Right trigger (R2/RT) past the standard "pressed" threshold, or the left mouse button — combined by the caller. */
  held: boolean;
}

/**
 * A thin poll of the first connected gamepad's right stick and R2 trigger,
 * mirroring GamepadInput.ts's read-only-what-you-need shape. Standard
 * Gamepad API mapping: axes[2]/axes[3] are the right stick, buttons[7] is
 * R2/RT (same mapping Tailgate's ThrowController relies on).
 */
export const ThrowInput = {
  read(): ThrowInputState {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null);
    if (!pad || pad.axes.length < 4) {
      return { rightStick: null, held: false };
    }
    return {
      rightStick: { x: pad.axes[2], z: pad.axes[3] },
      held: (pad.buttons[7]?.value ?? 0) > 0.5,
    };
  },
};
