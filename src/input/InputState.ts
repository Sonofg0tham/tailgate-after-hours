/** The three movement speeds, plus idle when the player is standing still. */
export type SpeedState = 'idle' | 'creep' | 'walk' | 'run';

/** Which control the player is currently using. */
export type InputDevice = 'gamepad' | 'keyboard' | 'none';

/**
 * A single frame's worth of movement instruction, produced by either input
 * reader and consumed by the MovementController. Both the gamepad and the
 * keyboard collapse down to this same shape, so the rest of the game never
 * has to care which one the player is holding. direction.x/y are ground-plane
 * (X/Z in world space), unit length, or zero when idle.
 */
export interface MovementIntent {
  directionX: number;
  directionZ: number;
  speed: SpeedState;
  device: InputDevice;
}
