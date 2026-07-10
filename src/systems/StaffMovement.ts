import { STAFF } from '../config/staff';
import { MOVEMENT } from '../config/movement';
import { stepFacing } from '../character/FacingController';
import { resolveCollision, type WallBounds } from '../physics/CapsuleCollider';
import type { StaffState, StaffWaypoint } from '../entities/StaffState';

export interface StepStaffContext {
  wallBounds: readonly WallBounds[];
  route: readonly StaffWaypoint[];
  dtSeconds: number;
}

/**
 * One deterministic tick of a cleaner's loop: walk to the next waypoint,
 * pause, move on. No suspicion, no vision, no state machine — just the same
 * direct steer-and-collide movement the player and guards use (src/sim/
 * step.ts, GuardStateMachine.ts's steerToward), against a shared collision
 * radius so a cleaner blocks/is blocked by the same walls and closed
 * dynamic doors everyone else is.
 */
export function stepStaff(staff: StaffState, ctx: StepStaffContext): StaffState {
  const waypoint = ctx.route[staff.routeIndex];

  if (staff.pauseRemainingMs > 0) {
    const remaining = Math.max(0, staff.pauseRemainingMs - ctx.dtSeconds * 1000);
    if (remaining === 0) {
      const nextIndex = (staff.routeIndex + 1) % ctx.route.length;
      return { ...staff, routeIndex: nextIndex, pauseRemainingMs: 0 };
    }
    return { ...staff, pauseRemainingMs: remaining };
  }

  const targetX = waypoint.x + 0.5;
  const targetZ = waypoint.y + 0.5;
  const dx = targetX - staff.x;
  const dz = targetZ - staff.z;
  const dist = Math.hypot(dx, dz);

  if (dist < STAFF.arrivalThreshold) {
    return { ...staff, pauseRemainingMs: Math.max(1, waypoint.pauseMs) };
  }

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const moveDist = Math.min(dist, STAFF.speedMetresPerSecond * ctx.dtSeconds);
  const desired = { x: staff.x + dirX * moveDist, z: staff.z + dirZ * moveDist };
  const resolved = resolveCollision(desired, MOVEMENT.playerRadius, ctx.wallBounds);
  const headingYaw = Math.atan2(dirX, dirZ);
  const facingYaw = stepFacing(staff.facingYaw, headingYaw, ctx.dtSeconds);

  return { ...staff, x: resolved.x, z: resolved.z, facingYaw };
}

/** Idle while paused at a waypoint, walking otherwise — no run/crouch, cleaners never hurry. */
export function staffAnimationState(staff: StaffState): 'idle' | 'walk' {
  return staff.pauseRemainingMs > 0 ? 'idle' : 'walk';
}
