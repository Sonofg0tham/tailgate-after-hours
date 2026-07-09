import { describe, expect, it } from 'vitest';
import { createGuardState, validateGuardRoutes, type GuardsData } from './GuardState';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';
import guardsData from '../data/guards.json';

describe('validateGuardRoutes', () => {
  const level = parseLevel(floor12 as LevelData);
  const isWalkable = (x: number, y: number) => {
    const cell = level.cells[y]?.[x];
    return cell !== undefined && (cell.kind === 'floor' || cell.kind === 'door');
  };

  it('every real guard waypoint sits on walkable floor', () => {
    expect(() => validateGuardRoutes(guardsData as GuardsData, isWalkable)).not.toThrow();
  });

  it('throws when a waypoint sits on an unwalkable cell', () => {
    const bad: GuardsData = { guards: [{ id: 'g', startWaypointIndex: 0, route: [{ x: 0, y: 0, pauseMs: 100 }] }] };
    expect(() => validateGuardRoutes(bad, isWalkable)).toThrow(/isn't walkable/);
  });
});

describe('createGuardState', () => {
  it('starts at the given startWaypointIndex, not always index 0', () => {
    const route = {
      id: 'g',
      startWaypointIndex: 1,
      route: [
        { x: 2, y: 2, pauseMs: 100 },
        { x: 5, y: 5, pauseMs: 100 },
      ],
    };
    const guard = createGuardState(route);
    expect(guard.x).toBeCloseTo(5.5, 5);
    expect(guard.z).toBeCloseTo(5.5, 5);
    expect(guard.routeIndex).toBe(1);
  });
});
