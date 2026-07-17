import { LIGHTING } from '../config/lighting';
import type { LightSource, ParsedLevel } from '../world/level';

const SAMPLES_PER_CELL = 4;

/**
 * True for a cell that blocks PLACED LIGHT: walls, and doors that are
 * statically closed in the level legend. Deliberately narrower than
 * Vision's blocksSight — furniture does not block light (light passes over
 * a desk even though a guard cannot see through one), and dynamic ingress
 * doors use their static legend state because the grid is built once at
 * load (a Phase 5 call, approved by Craig: light gains wall occlusion so
 * the render can agree with the grid without casting through walls).
 */
function blocksLight(level: ParsedLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true;
  }
  const cell = level.cells[y][x];
  return cell.kind === 'wall' || (cell.kind === 'door' && cell.doorOpen === false);
}

/**
 * True if nothing light-blocking sits between the two cell centres — the
 * same quarter-cell march as Vision.hasLineOfSight, endpoints excluded so
 * a source lights its own cell and a target cell is judged by the path to
 * it, not by itself.
 */
function lightReaches(level: ParsedLevel, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return true;
  }
  const steps = Math.max(1, Math.ceil(distance * SAMPLES_PER_CELL));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocksLight(level, Math.floor(fromX + dx * t), Math.floor(fromY + dy * t))) {
      return false;
    }
  }
  return true;
}

/** Light level (0-1) at a cell centre from one source: linear falloff, zero beyond radius. */
function contributionFrom(source: LightSource, cellX: number, cellY: number): number {
  const dist = Math.hypot(cellX + 0.5 - (source.x + 0.5), cellY + 0.5 - (source.y + 0.5));
  if (dist >= source.radius) {
    return 0;
  }
  return source.intensity * (1 - dist / source.radius);
}

/**
 * Light level (0-1) at one cell: the brightest contributor wins, same as
 * Tailgate's `computeLightAt`. Pass `level` to occlude — a source with no
 * clear line to the cell contributes nothing (Phase 5; before this, light
 * passed through walls, a Phase 2 simplification now retired).
 */
export function lightLevelAt(lights: readonly LightSource[], cellX: number, cellY: number, level?: ParsedLevel): number {
  let value: number = LIGHTING.ambientLevel;
  for (const light of lights) {
    if (level && !lightReaches(level, light.x + 0.5, light.y + 0.5, cellX + 0.5, cellY + 0.5)) {
      continue;
    }
    value = Math.max(value, contributionFrom(light, cellX, cellY));
  }
  return Math.min(1, value);
}

/**
 * Precomputes the whole level's light grid once at load — this is the
 * "light-level-per-cell as grid data" GAME_DESIGN.md asks for, not a
 * per-query recomputation. [y][x], matching ParsedLevel.cells. Occluded:
 * walls and statically-closed doors stop placed light.
 */
export function buildLightGrid(level: ParsedLevel): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < level.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < level.width; x++) {
      row.push(lightLevelAt(level.lights, x, y, level));
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
