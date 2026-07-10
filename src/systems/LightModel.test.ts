import { describe, expect, it } from 'vitest';
import { buildLightGrid, lightLevelAt, lightLevelAtWorld } from './LightModel';
import { LIGHTING } from '../config/lighting';
import { parseLevel, type LevelData } from '../world/level';

describe('lightLevelAt', () => {
  const lights = [{ x: 5, y: 5, radius: 4, intensity: 1 }];

  it('is brightest at the source', () => {
    expect(lightLevelAt(lights, 5, 5)).toBeCloseTo(1, 2);
  });

  it('falls off linearly with distance', () => {
    const atSource = lightLevelAt(lights, 5, 5);
    const halfway = lightLevelAt(lights, 7, 5);
    const atEdge = lightLevelAt(lights, 9, 5);
    expect(halfway).toBeLessThan(atSource);
    expect(atEdge).toBeLessThanOrEqual(LIGHTING.ambientLevel + 0.01);
  });

  it('never drops below the ambient baseline', () => {
    expect(lightLevelAt(lights, 100, 100)).toBeCloseTo(LIGHTING.ambientLevel, 5);
  });

  it('takes the brightest of several overlapping sources', () => {
    const twoLights = [
      { x: 5, y: 5, radius: 4, intensity: 0.3 },
      { x: 5, y: 5, radius: 4, intensity: 0.9 },
    ];
    expect(lightLevelAt(twoLights, 5, 5)).toBeCloseTo(0.9, 2);
  });
});

describe('buildLightGrid / lightLevelAtWorld', () => {
  const level = parseLevel({
    cellSize: 1,
    width: 4,
    height: 4,
    legend: { '.': { kind: 'floor', zone: 'room' } },
    zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
    layout: ['....', '....', '....', '....'],
    furniture: [],
    lights: [{ x: 1, y: 1, radius: 3, intensity: 1 }],
    doors: [],
    playerStart: { x: 0, y: 0 },
  } as LevelData);

  it('precomputes a grid matching per-cell queries', () => {
    const grid = buildLightGrid(level);
    expect(grid[1][1]).toBeCloseTo(lightLevelAt(level.lights, 1, 1), 5);
    expect(grid.length).toBe(4);
    expect(grid[0].length).toBe(4);
  });

  it('looks up by world position through the same grid', () => {
    const grid = buildLightGrid(level);
    expect(lightLevelAtWorld(grid, 1, 1.5, 1.5)).toBeCloseTo(grid[1][1], 5);
  });
});

describe('occlusion (Phase 5)', () => {
  // Four isolated corridors (wall rows between them so nothing leaks
  // diagonally across scenarios), each with its own light at x=1 and a
  // different obstacle at x=3: a wall, a closed door, an open door, a desk.
  // Radius 7 covers the whole row, so any darkness past x=3 is occlusion,
  // not falloff.
  const level = parseLevel({
    cellSize: 1,
    width: 9,
    height: 7,
    legend: {
      '.': { kind: 'floor', zone: 'room' },
      '#': { kind: 'wall' },
      '=': { kind: 'door', zone: 'room', open: false },
      '+': { kind: 'door', zone: 'room', open: true },
      d: { kind: 'furniture', zone: 'room', furnitureType: 'desk' },
    },
    zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
    layout: ['...#.....', '#########', '...=.....', '#########', '...+.....', '#########', '...d.....'],
    furniture: [{ x: 3, y: 6, type: 'desk' }],
    lights: [
      { x: 1, y: 0, radius: 7, intensity: 1 },
      { x: 1, y: 2, radius: 7, intensity: 1 },
      { x: 1, y: 4, radius: 7, intensity: 1 },
      { x: 1, y: 6, radius: 7, intensity: 1 },
    ],
    doors: [],
    playerStart: { x: 0, y: 0 },
  } as LevelData);

  it('a wall stops placed light dead', () => {
    expect(lightLevelAt(level.lights, 5, 0, level)).toBeCloseTo(LIGHTING.ambientLevel, 5);
  });

  it('a statically closed door stops placed light', () => {
    expect(lightLevelAt(level.lights, 5, 2, level)).toBeCloseTo(LIGHTING.ambientLevel, 5);
  });

  it('an open door lets light through', () => {
    expect(lightLevelAt(level.lights, 5, 4, level)).toBeGreaterThan(LIGHTING.ambientLevel + 0.1);
  });

  it('furniture does not block light (it passes over a desk)', () => {
    expect(lightLevelAt(level.lights, 5, 6, level)).toBeGreaterThan(LIGHTING.ambientLevel + 0.1);
  });

  it('without a level passed, behaviour is the old unoccluded falloff', () => {
    expect(lightLevelAt(level.lights, 5, 0)).toBeGreaterThan(LIGHTING.ambientLevel + 0.1);
  });

  it('buildLightGrid occludes: the grid itself is dark behind the wall', () => {
    const grid = buildLightGrid(level);
    expect(grid[0][5]).toBeCloseTo(LIGHTING.ambientLevel, 5);
    expect(grid[4][5]).toBeGreaterThan(LIGHTING.ambientLevel + 0.1);
  });
});
