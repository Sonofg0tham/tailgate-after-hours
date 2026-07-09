import { describe, expect, it } from 'vitest';
import { createStaffState, validateStaffRoutes, type StaffData } from './StaffState';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';
import staffData from '../data/staff.json';

describe('validateStaffRoutes', () => {
  const level = parseLevel(floor12 as LevelData);
  const isWalkable = (x: number, y: number) => {
    const cell = level.cells[y]?.[x];
    return cell !== undefined && (cell.kind === 'floor' || cell.kind === 'door');
  };

  it('every real staff waypoint sits on walkable floor', () => {
    expect(() => validateStaffRoutes(staffData as StaffData, isWalkable)).not.toThrow();
  });

  it('throws when a waypoint sits on an unwalkable cell', () => {
    const bad: StaffData = { staff: [{ id: 's', badges: [], route: [{ x: 0, y: 0, pauseMs: 100 }] }] };
    expect(() => validateStaffRoutes(bad, isWalkable)).toThrow(/isn't walkable/);
  });
});

describe('createStaffState', () => {
  it('starts at the first route waypoint', () => {
    const route = {
      id: 's',
      badges: [],
      route: [
        { x: 2, y: 2, pauseMs: 100 },
        { x: 5, y: 5, pauseMs: 100 },
      ],
    };
    const staff = createStaffState(route);
    expect(staff.x).toBeCloseTo(2.5, 5);
    expect(staff.z).toBeCloseTo(2.5, 5);
    expect(staff.routeIndex).toBe(0);
  });
});
