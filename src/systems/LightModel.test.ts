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
