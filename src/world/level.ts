// The level format: a 2D grid in JSON, hand-editable per CLAUDE.md. Every
// meaningful thing — walls, doors, zones, surfaces, furniture — is a single
// character in `layout`, looked up in `legend`. This is deliberately NOT
// Tailgate's Tiled-rect format: extrusion wants one clear cell-per-metre
// truth, and a plain character grid is the easiest thing for Craig to look
// at and hand-edit directly.

export type CellKind = 'wall' | 'floor' | 'door' | 'furniture';
export type SurfaceType = 'carpet' | 'tile' | 'concrete';

export interface LegendEntry {
  kind: CellKind;
  /** Present for floor/door/furniture cells; looked up in `zones`. */
  zone?: string;
  /** Present for furniture cells only. */
  furnitureType?: string;
}

export interface ZoneDef {
  label: string;
  surface: SurfaceType;
  /** Debug-only "surface tints" overlay colour. Never the only way a zone reads. */
  tint: string;
}

export interface FurniturePlacement {
  x: number;
  y: number;
  type: string;
}

/** The raw shape of src/data/floor12.json. */
export interface LevelData {
  cellSize: number;
  width: number;
  height: number;
  legend: Record<string, LegendEntry>;
  zones: Record<string, ZoneDef>;
  layout: string[];
  furniture: FurniturePlacement[];
  playerStart: { x: number; y: number };
}

export interface ParsedCell {
  kind: CellKind;
  zone: string | null;
  surface: SurfaceType | null;
  furnitureType: string | null;
}

export interface ParsedLevel {
  cellSize: number;
  width: number;
  height: number;
  /** [y][x], row-major to match `layout`. */
  cells: ParsedCell[][];
  furniture: FurniturePlacement[];
  playerStart: { x: number; y: number };
  zones: Record<string, ZoneDef>;
}

/**
 * Validates and parses raw level JSON into a lookup-friendly grid. Throws on
 * any structural mismatch (wrong row count, wrong row length, an unmapped
 * character, a furniture placement with no matching legend entry) — a typo
 * in a hand-edited grid should fail loudly at load, not draw a silent gap.
 */
export function parseLevel(data: LevelData): ParsedLevel {
  if (data.layout.length !== data.height) {
    throw new Error(`Level layout has ${data.layout.length} rows, expected height ${data.height}`);
  }

  const cells: ParsedCell[][] = data.layout.map((row, y) => {
    if (row.length !== data.width) {
      throw new Error(`Level layout row ${y} has length ${row.length}, expected width ${data.width}`);
    }

    return Array.from(row, (char) => {
      const entry = data.legend[char];
      if (!entry) {
        throw new Error(`Level layout uses character "${char}" with no legend entry`);
      }

      const zoneDef = entry.zone ? data.zones[entry.zone] : undefined;
      if (entry.zone && !zoneDef) {
        throw new Error(`Legend entry for "${char}" references unknown zone "${entry.zone}"`);
      }

      return {
        kind: entry.kind,
        zone: entry.zone ?? null,
        surface: zoneDef?.surface ?? null,
        furnitureType: entry.furnitureType ?? null,
      };
    });
  });

  for (const f of data.furniture) {
    const cell = cells[f.y]?.[f.x];
    if (!cell || cell.kind !== 'furniture' || cell.furnitureType !== f.type) {
      throw new Error(`Furniture entry ${JSON.stringify(f)} doesn't match the layout cell at (${f.x}, ${f.y})`);
    }
  }

  return {
    cellSize: data.cellSize,
    width: data.width,
    height: data.height,
    cells,
    furniture: data.furniture,
    playerStart: data.playerStart,
    zones: data.zones,
  };
}

/** The surface underfoot at a world position, or null if it's off the grid. */
export function surfaceAt(level: ParsedLevel, worldX: number, worldZ: number): SurfaceType | null {
  const x = Math.floor(worldX / level.cellSize);
  const y = Math.floor(worldZ / level.cellSize);
  return level.cells[y]?.[x]?.surface ?? null;
}

/** Bounds-safe wall check, used by extrusion and collision alike. */
export function isWall(level: ParsedLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true; // out of bounds reads as solid, so nothing extrudes past the edge
  }
  return level.cells[y][x].kind === 'wall';
}

/** True for any cell a capsule should collide with: walls and furniture. */
export function isSolid(level: ParsedLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true;
  }
  const kind = level.cells[y][x].kind;
  return kind === 'wall' || kind === 'furniture';
}

/**
 * Flood-fills from playerStart over walkable (floor/door) cells — furniture
 * blocks movement, so it's excluded, same as real collision — and returns
 * the name of any zone with no reachable floor cell. Empty array means every
 * zone is reachable. This is what stands between a hand-edit that seals off
 * a room and that mistake shipping unnoticed.
 */
export function findUnreachableZones(level: ParsedLevel): string[] {
  const { width, height, cells, playerStart } = level;
  const seen = new Set<string>();
  const stack: [number, number][] = [[playerStart.x, playerStart.y]];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [x, y] = next;
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }
    const kind = cells[y][x].kind;
    if (kind !== 'floor' && kind !== 'door') {
      continue;
    }
    seen.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const reachedZones = new Set<string>();
  for (const key of seen) {
    const [xStr, yStr] = key.split(',');
    const zone = cells[Number(yStr)][Number(xStr)].zone;
    if (zone) {
      reachedZones.add(zone);
    }
  }

  return Object.keys(level.zones).filter((zone) => !reachedZones.has(zone));
}
