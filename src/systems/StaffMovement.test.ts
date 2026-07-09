import { describe, expect, it } from 'vitest';
import { stepStaff, staffAnimationState } from './StaffMovement';
import { createStaffState } from '../entities/StaffState';

const ROUTE = [
  { x: 2, y: 2, pauseMs: 500 },
  { x: 8, y: 2, pauseMs: 500 },
];

describe('stepStaff', () => {
  it('walks toward the current waypoint', () => {
    // Spawns exactly on waypoint 0; point it at waypoint 1 instead so there's
    // actual distance to close (mirrors GuardState's own spawn-at-waypoint shape).
    const staff = { ...createStaffState({ id: 's', badges: [], route: ROUTE }), routeIndex: 1 };
    const next = stepStaff(staff, { wallBounds: [], route: ROUTE, dtSeconds: 1 / 60 });
    expect(next.x).toBeGreaterThan(staff.x);
    expect(staffAnimationState(next)).toBe('walk');
  });

  it('pauses on arrival, then advances to the next waypoint once the pause elapses', () => {
    let staff = createStaffState({ id: 's', badges: [], route: ROUTE });
    // Force-arrive right at the first waypoint.
    staff = { ...staff, x: 2.5, z: 2.5 };
    staff = stepStaff(staff, { wallBounds: [], route: ROUTE, dtSeconds: 1 / 60 });
    expect(staff.pauseRemainingMs).toBeGreaterThan(0);
    expect(staffAnimationState(staff)).toBe('idle');
    expect(staff.routeIndex).toBe(0);

    // Advance time past the 500ms pause.
    staff = stepStaff(staff, { wallBounds: [], route: ROUTE, dtSeconds: 1 });
    expect(staff.pauseRemainingMs).toBe(0);
    expect(staff.routeIndex).toBe(1);
  });

  it('loops back to the first waypoint after the last', () => {
    let staff = createStaffState({ id: 's', badges: [], route: ROUTE });
    staff = { ...staff, x: 8.5, z: 2.5, routeIndex: 1 };
    staff = stepStaff(staff, { wallBounds: [], route: ROUTE, dtSeconds: 1 / 60 });
    staff = stepStaff(staff, { wallBounds: [], route: ROUTE, dtSeconds: 1 });
    expect(staff.routeIndex).toBe(0);
  });

  it('is blocked by wallBounds like the player and guards are', () => {
    const staff = { ...createStaffState({ id: 's', badges: [], route: ROUTE }), routeIndex: 1 };
    const wall = { minX: 2.7, maxX: 10, minZ: 0, maxZ: 5 };
    const next = stepStaff(staff, { wallBounds: [wall], route: ROUTE, dtSeconds: 1 });
    expect(next.x).toBeLessThan(wall.minX);
  });
});
