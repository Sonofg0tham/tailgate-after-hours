/**
 * Plain capsule-vs-wall collision, no physics engine, per CLAUDE.md. The
 * player never moves vertically in v1, so the capsule collapses to a circle
 * on the XZ ground plane pushed out of each solid cell's axis-aligned box —
 * cheap, deterministic, and easy to reason about for a grid-extruded level.
 */
export interface WallBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CirclePosition {
  x: number;
  z: number;
}

/**
 * Resolves a desired position against a set of wall boxes by pushing the
 * circle out of any wall it now overlaps. Pure function so it can be unit
 * tested without a scene.
 */
export function resolveCollision(
  desired: CirclePosition,
  radius: number,
  walls: readonly WallBounds[],
): CirclePosition {
  let { x, z } = desired;

  for (const wall of walls) {
    const closestX = clamp(x, wall.minX, wall.maxX);
    const closestZ = clamp(z, wall.minZ, wall.maxZ);

    const dx = x - closestX;
    const dz = z - closestZ;
    const distanceSquared = dx * dx + dz * dz;

    if (distanceSquared >= radius * radius) {
      continue;
    }

    if (distanceSquared > 0) {
      // Push straight back along the vector to the nearest wall point.
      const distance = Math.sqrt(distanceSquared);
      const push = radius - distance;
      x += (dx / distance) * push;
      z += (dz / distance) * push;
    } else {
      // Centre landed inside the box (rare — a big step in one frame); push
      // out along the shallowest axis, snapping to that edge plus the full
      // radius rather than offsetting the original coordinate, so the
      // result is exactly radius clear regardless of where inside the box
      // the centre started.
      const penetrationX = Math.min(x - wall.minX, wall.maxX - x);
      const penetrationZ = Math.min(z - wall.minZ, wall.maxZ - z);
      if (penetrationX < penetrationZ) {
        x = x < (wall.minX + wall.maxX) / 2 ? wall.minX - radius : wall.maxX + radius;
      } else {
        z = z < (wall.minZ + wall.maxZ) / 2 ? wall.minZ - radius : wall.maxZ + radius;
      }
    }
  }

  return { x, z };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
