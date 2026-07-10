import { blocksSight, type DoorOpenLookup, type ParsedLevel } from '../world/level';
import { shortestAngleDelta } from '../character/FacingController';

const SAMPLES_PER_CELL = 4;

/**
 * True if nothing solid (wall, closed door, furniture) sits between the two
 * points. This is the "vision occlusion is 2D raycast on the grid" GAME_
 * DESIGN.md calls for — a march along the line in quarter-cell steps
 * (comfortably finer than the 1-cell-thick walls, so no corner is skipped)
 * checking every sampled cell with blocksSight, rather than Tailgate's
 * original line-vs-rectangle analytic test. Same effect, grid-native
 * implementation, per the explicit Phase 2 design direction.
 */
export function hasLineOfSight(
  level: ParsedLevel,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  doorOverrides?: DoorOpenLookup,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return true;
  }

  const steps = Math.max(1, Math.ceil(distance * SAMPLES_PER_CELL));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    if (blocksSight(level, Math.floor(x), Math.floor(y), doorOverrides)) {
      return false;
    }
  }
  return true;
}

/**
 * Marches a ray from (originX, originY) at the given angle until it hits
 * something that blocks sight, or reaches maxDistance. Used only for
 * rendering the torch beam's visible fan — the detection check itself
 * (canSeePoint) tests a single line straight to the player, this is the
 * separate "what does the room look like lit up" concern.
 */
export function raycastDistance(
  level: ParsedLevel,
  originX: number,
  originY: number,
  angleRadians: number,
  maxDistance: number,
  doorOverrides?: DoorOpenLookup,
): number {
  const dirX = Math.sin(angleRadians);
  const dirY = Math.cos(angleRadians);
  const steps = Math.max(1, Math.ceil(maxDistance * SAMPLES_PER_CELL));

  for (let i = 1; i <= steps; i++) {
    const dist = (i / steps) * maxDistance;
    const x = originX + dirX * dist;
    const y = originY + dirY * dist;
    if (blocksSight(level, Math.floor(x), Math.floor(y), doorOverrides)) {
      return dist;
    }
  }
  return maxDistance;
}

/**
 * The full vision check: range, then field-of-view, then occlusion — cheapest
 * checks first, since occlusion (the raycast) is the most expensive.
 *
 * @param facingYaw radians, same convention as PlayerState.facingYaw
 *   (atan2(directionX, directionZ) — 0 faces +Z).
 */
export function canSeePoint(
  level: ParsedLevel,
  originX: number,
  originY: number,
  facingYaw: number,
  targetX: number,
  targetY: number,
  rangeCells: number,
  fovDegrees: number,
  doorOverrides?: DoorOpenLookup,
): boolean {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.hypot(dx, dy);
  if (distance > rangeCells) {
    return false;
  }

  if (distance > 0) {
    const angleToTarget = Math.atan2(dx, dy);
    const angleDelta = Math.abs(shortestAngleDelta(facingYaw, angleToTarget));
    if (angleDelta > (fovDegrees * Math.PI) / 180 / 2) {
      return false;
    }
  }

  return hasLineOfSight(level, originX, originY, targetX, targetY, doorOverrides);
}
