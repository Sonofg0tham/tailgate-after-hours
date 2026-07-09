import { describe, expect, it } from 'vitest';
import { canSeePoint, hasLineOfSight, raycastDistance } from './Vision';
import { parseLevel, type LevelData } from '../world/level';

// Room:      Wall row at y=1 with a gap (open floor) at x=2 and a closed
// door at x=4, so we can test "wall blocks" vs "gap doesn't" vs "closed
// door blocks" in one fixture.
const LEVEL = parseLevel({
  cellSize: 1,
  width: 7,
  height: 3,
  legend: {
    '#': { kind: 'wall' },
    '.': { kind: 'floor', zone: 'room' },
    '=': { kind: 'door', zone: 'room', open: false },
  },
  zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
  layout: ['.......', '##.#=.#', '.......'],
  furniture: [],
  lights: [],
  playerStart: { x: 0, y: 0 },
} as LevelData);

describe('hasLineOfSight', () => {
  it('is blocked by a wall', () => {
    expect(hasLineOfSight(LEVEL, 0.5, 0.5, 0.5, 2.5)).toBe(false); // straight through x=0 wall cell
  });

  it('passes through an open gap in a wall row', () => {
    expect(hasLineOfSight(LEVEL, 2.5, 0.5, 2.5, 2.5)).toBe(true);
  });

  it('is blocked by a closed door', () => {
    expect(hasLineOfSight(LEVEL, 4.5, 0.5, 4.5, 2.5)).toBe(false);
  });

  it('is clear along an unobstructed row', () => {
    expect(hasLineOfSight(LEVEL, 0.5, 0.5, 6.5, 0.5)).toBe(true);
  });
});

describe('raycastDistance', () => {
  it('returns maxDistance when nothing blocks the ray', () => {
    expect(raycastDistance(LEVEL, 2.5, 0.5, 0, 1.4)).toBeCloseTo(1.4, 1);
  });

  it('stops short at a wall', () => {
    // Facing "south" (yaw 0, +Y) from x=0.5 hits the wall row at y=1 almost immediately.
    const dist = raycastDistance(LEVEL, 0.5, 0.5, 0, 5);
    expect(dist).toBeLessThan(1);
  });

  it('stops short at a closed door', () => {
    const dist = raycastDistance(LEVEL, 4.5, 0.5, 0, 5);
    expect(dist).toBeLessThan(1);
  });
});

describe('canSeePoint', () => {
  it('is false beyond range', () => {
    expect(canSeePoint(LEVEL, 0.5, 0.5, 0, 0.5, 20.5, 7, 70)).toBe(false);
  });

  it('is false outside the field of view', () => {
    // Facing north (yaw 0 = +Z per this project's convention... actually
    // facing "south"/+Z is yaw 0); target directly behind (north) is outside a 70 degree cone.
    expect(canSeePoint(LEVEL, 3.5, 1.5, 0, 3.5, -3.5, 7, 70)).toBe(false);
  });

  it('is true when in range, in FOV, and unobstructed', () => {
    // facingYaw 0 = +Z ("south"), and the target sits south of the guard.
    expect(canSeePoint(LEVEL, 2.5, 0.5, 0, 2.5, 2.5, 7, 70)).toBe(true);
  });

  it('is false when in range and FOV but occluded by a closed door', () => {
    expect(canSeePoint(LEVEL, 4.5, 0.5, 0, 4.5, 2.5, 7, 70)).toBe(false);
  });
});
