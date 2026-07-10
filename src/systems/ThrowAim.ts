import { THROW } from '../config/throw';

export interface AimInput {
  /** Gamepad right stick, each axis -1..1; null when no gamepad is aiming this frame (falls back to pointerWorld). */
  rightStick: { x: number; z: number } | null;
  /**
   * Mouse/pointer aim point already projected onto the ground plane (world
   * X/Z). Always required as the fallback — the caller (main.ts) is
   * responsible for having some last-known aim point, e.g. defaulting to a
   * point ahead of the player along facingYaw before the pointer has ever
   * moved.
   */
  pointerWorld: { x: number; z: number };
}

export interface AimResult {
  x: number;
  z: number;
}

/**
 * Resolves a throw's landing point from the player's position and this
 * frame's aim input, exactly matching Tailgate's ThrowController.computeAim:
 * gamepad right stick wins when pushed past the deadzone (aim always
 * projects to exactly maxRange in the stick's direction, not proportional
 * to push), otherwise the mouse's world point is used — clamped to maxRange
 * if it's further than that from the player, used unclamped if it's closer.
 */
export function resolveThrowAim(playerX: number, playerZ: number, input: AimInput): AimResult {
  if (input.rightStick) {
    const magnitude = Math.hypot(input.rightStick.x, input.rightStick.z);
    if (magnitude >= THROW.aimDeadzone) {
      const dirX = input.rightStick.x / magnitude;
      const dirZ = input.rightStick.z / magnitude;
      return { x: playerX + dirX * THROW.maxRangeMetres, z: playerZ + dirZ * THROW.maxRangeMetres };
    }
  }

  const dx = input.pointerWorld.x - playerX;
  const dz = input.pointerWorld.z - playerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > THROW.maxRangeMetres && dist > 0) {
    return { x: playerX + (dx / dist) * THROW.maxRangeMetres, z: playerZ + (dz / dist) * THROW.maxRangeMetres };
  }
  return { x: input.pointerWorld.x, z: input.pointerWorld.z };
}
