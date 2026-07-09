import { LIGHTING } from '../config/lighting';
import type { LightSource, ParsedLevel } from '../world/level';

/** Light level (0-1) at a cell centre from one source: linear falloff, zero beyond radius. */
function contributionFrom(source: LightSource, cellX: number, cellY: number): number {
  const dist = Math.hypot(cellX + 0.5 - (source.x + 0.5), cellY + 0.5 - (source.y + 0.5));
  if (dist >= source.radius) {
    return 0;
  }
  return source.intensity * (1 - dist / source.radius);
}

/** Light level (0-1) at one cell: the brightest contributor wins, same as Tailgate's `computeLightAt`. */
export function lightLevelAt(lights: readonly LightSource[], cellX: number, cellY: number): number {
  let level: number = LIGHTING.ambientLevel;
  for (const light of lights) {
    level = Math.max(level, contributionFrom(light, cellX, cellY));
  }
  return Math.min(1, level);
}

/**
 * Precomputes the whole level's light grid once at load — this is the
 * "light-level-per-cell as grid data" GAME_DESIGN.md asks for, not a
 * per-query recomputation. [y][x], matching ParsedLevel.cells.
 */
export function buildLightGrid(level: ParsedLevel): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < level.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < level.width; x++) {
      row.push(lightLevelAt(level.lights, x, y));
    }
    grid.push(row);
  }
  return grid;
}

/** Light level at a world position, reading the precomputed grid. 0 (fully dark) off-grid. */
export function lightLevelAtWorld(lightGrid: number[][], cellSize: number, worldX: number, worldZ: number): number {
  const x = Math.floor(worldX / cellSize);
  const y = Math.floor(worldZ / cellSize);
  return lightGrid[y]?.[x] ?? 0;
}
