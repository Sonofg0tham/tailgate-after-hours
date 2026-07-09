import { MOVEMENT } from '../config/movement';
import { GamepadInput } from './GamepadInput';
import { KeyboardInput, KeyboardState } from './KeyboardInput';
import type { InputDevice, MovementIntent } from './InputState';

/**
 * Merges the two input readers into one result each frame. The gamepad is
 * asked first (it is the primary control); if it has nothing to say, the
 * keyboard is asked. Whichever last produced input is the "active device"
 * reported in the HUD.
 */
export class MovementController {
  private lastDevice: InputDevice = 'none';
  private readonly keys = new KeyboardState();

  /** Reads both inputs and returns the resolved intent for this frame. */
  update(): MovementIntent {
    let intent = GamepadInput.read();
    if (!intent) {
      intent = KeyboardInput.read(this.keys);
    }

    if (intent) {
      // Remember the active device so an idle frame does not flicker the HUD to "none".
      this.lastDevice = intent.device;
      return intent;
    }

    return { directionX: 0, directionZ: 0, speed: 'idle', device: this.lastDevice };
  }

  /** World-space speed in metres/second for a given speed state. */
  static speedMetresPerSecond(speed: MovementIntent['speed']): number {
    return speed === 'idle' ? 0 : MOVEMENT.speeds[speed];
  }
}
