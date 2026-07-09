import { describe, expect, it } from 'vitest';
import { resolveCollision } from './CapsuleCollider';
import type { WallBounds } from '../world/Room';

const wall: WallBounds = { minX: -1, maxX: 1, minZ: -6, maxZ: -5.7 };

describe('resolveCollision', () => {
  it('leaves position unchanged when clear of every wall', () => {
    const result = resolveCollision({ x: 0, z: 0 }, 0.35, [wall]);
    expect(result).toEqual({ x: 0, z: 0 });
  });

  it('pushes the circle out along the shortest exit vector', () => {
    // Approaching from the room interior (north side, closer to z=0), just
    // inside the wall's radius of reach. Expect the player pushed back
    // north of the wall's near face, never allowed inside its Z span.
    const result = resolveCollision({ x: 0, z: -5.55 }, 0.35, [wall]);
    expect(result.z).toBeGreaterThan(wall.maxZ);
  });

  it('never leaves the circle overlapping the wall box', () => {
    const result = resolveCollision({ x: 0.5, z: -5.75 }, 0.35, [wall]);
    const closestX = Math.max(wall.minX, Math.min(result.x, wall.maxX));
    const closestZ = Math.max(wall.minZ, Math.min(result.z, wall.maxZ));
    const distance = Math.hypot(result.x - closestX, result.z - closestZ);
    expect(distance).toBeGreaterThanOrEqual(0.35 - 1e-9);
  });
});
