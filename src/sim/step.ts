import { resolveCollision, type WallBounds } from '../physics/CapsuleCollider';
import { stepFacing } from '../character/FacingController';
import { MovementController } from '../input/MovementController';
import { MOVEMENT } from '../config/movement';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';

/**
 * One deterministic simulation tick: move, collide, turn to face. Pure
 * function of (state, intent, dt, walls) — no Date.now(), no Math.random(),
 * no reads of anything outside its arguments — which is exactly what makes
 * replay possible: the same inputs always produce the same next state.
 */
export function stepPlayer(
  state: PlayerState,
  intent: MovementIntent,
  deltaSeconds: number,
  walls: readonly WallBounds[],
): PlayerState {
  const speedMetresPerSecond = MovementController.speedMetresPerSecond(intent.speed);
  const desired = {
    x: state.x + intent.directionX * speedMetresPerSecond * deltaSeconds,
    z: state.z + intent.directionZ * speedMetresPerSecond * deltaSeconds,
  };
  const resolved = resolveCollision(desired, MOVEMENT.playerRadius, walls);

  const hasDirection = intent.directionX !== 0 || intent.directionZ !== 0;
  const targetYaw = hasDirection ? Math.atan2(intent.directionX, intent.directionZ) : null;
  const facingYaw = stepFacing(state.facingYaw, targetYaw, deltaSeconds);

  return { x: resolved.x, z: resolved.z, facingYaw };
}
