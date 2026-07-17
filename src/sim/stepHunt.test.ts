import { describe, expect, it } from 'vitest';
import { buildLightGrid } from '../systems/LightModel';
import { createGuardState, type GuardRoute } from '../entities/GuardState';
import { createMissionState } from './MissionState';
import { extrudeLevel } from '../world/Extruder';
import { parseLevel, type LevelData } from '../world/level';
import { stepHunt, type HuntEnvironment, type HuntState } from './stepHunt';
import type { MovementIntent } from '../input/InputState';

const LEVEL_DATA: LevelData = {
  cellSize: 1,
  width: 20,
  height: 20,
  legend: { '#': { kind: 'wall' }, '.': { kind: 'floor', zone: 'room' } },
  zones: { room: { label: 'Room', surface: 'concrete', tint: '#000', visualProfile: 'service' } },
  layout: Array.from({ length: 20 }, (_, y) =>
    y === 0 || y === 19 ? '#'.repeat(20) : '#' + '.'.repeat(18) + '#',
  ),
  furniture: [],
  lights: [{ x: 10, y: 10, radius: 20, intensity: 1 }],
  doors: [],
  playerStart: { x: 10, y: 10 },
};

const LEVEL = parseLevel(LEVEL_DATA);
const EXTRUDED = extrudeLevel(LEVEL);
const ROUTES: GuardRoute[] = [
  { id: 'g1', startWaypointIndex: 0, route: [{ x: 9, y: 8, pauseMs: 500 }] },
  { id: 'g2', startWaypointIndex: 0, route: [{ x: 10, y: 8, pauseMs: 500 }] },
];
const ENV: HuntEnvironment = {
  level: LEVEL,
  lightGrid: buildLightGrid(LEVEL),
  wallBounds: EXTRUDED.wallBounds,
  routes: ROUTES.map((route) => route.route),
  guardRoutes: ROUTES,
  staffRoutes: [],
};
const IDLE: MovementIntent = {
  directionX: 0,
  directionZ: 0,
  speed: 'idle',
  crouched: false,
  device: 'none',
};

function state(facingYaw = 0): HuntState {
  return {
    player: { x: 10, z: 10, facingYaw: 0 },
    guards: ROUTES.map((route) => ({ ...createGuardState(route), facingYaw })),
    alertLevel: { level: 0, msSinceIncident: 0 },
    simTimeMs: 0,
    doors: [],
    staff: [],
    bolts: [],
    mission: createMissionState(),
  };
}

describe('stepHunt observations', () => {
  it('aggregates direct sight to one tick-level boolean when multiple guards see the player', () => {
    const result = stepHunt(state(), IDLE, null, false, ENV, 1 / 60, 1000 / 60);

    expect(result.observation.anyGuardCanSeePlayer).toBe(true);
  });

  it('reports no direct sight when no guard can see the player', () => {
    const result = stepHunt(state(Math.PI), IDLE, null, false, ENV, 1 / 60, 1000 / 60);

    expect(result.observation.anyGuardCanSeePlayer).toBe(false);
  });
});
