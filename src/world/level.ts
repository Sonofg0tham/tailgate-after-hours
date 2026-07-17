// The level format: a 2D grid in JSON, hand-editable per CLAUDE.md. Every
// meaningful thing — walls, doors, zones, surfaces, furniture — is a single
// character in `layout`, looked up in `legend`. This is deliberately NOT
// Tailgate's Tiled-rect format: extrusion wants one clear cell-per-metre
// truth, and a plain character grid is the easiest thing for Craig to look
// at and hand-edit directly.

export type CellKind = 'wall' | 'floor' | 'door' | 'furniture';
export type SurfaceType = 'carpet' | 'tile' | 'concrete';
export const ZONE_VISUAL_PROFILES = ['lobby', 'office', 'service', 'server', 'edge'] as const;
export type ZoneVisualProfile = (typeof ZONE_VISUAL_PROFILES)[number];

export interface LegendEntry {
  kind: CellKind;
  /** Present for floor/door/furniture cells; looked up in `zones`. */
  zone?: string;
  /** Present for furniture cells only. */
  furnitureType?: string;
  /**
   * Present for door cells only. Closed doors block vision (guard cones and
   * the player's own line-of-sight checks) but NOT movement — access control
   * is Phase 3's badge-door work, this is a vision-occlusion concern only.
   */
  open?: boolean;
}

export interface LightSource {
  x: number;
  y: number;
  /** Cells from the source at which its contribution reaches zero. */
  radius: number;
  /** 0-1, the light level directly at the source. */
  intensity: number;
}

export interface ZoneDef {
  label: string;
  surface: SurfaceType;
  /** Debug-only "surface tints" overlay colour. Never the only way a zone reads. */
  tint: string;
  /** Render-only dressing family. Simulation continues to read the grid cells above. */
  visualProfile: ZoneVisualProfile;
}

export interface FurniturePlacement {
  x: number;
  y: number;
  type: string;
}

/**
 * A door singled out for Phase 3 behaviour beyond the static open/closed the
 * legend already gives every door cell. `kind` picks which schedule/access
 * system in src/config/doors.ts drives it at runtime:
 *   - 'badge'   — the lobby tailgate: opens for a staff badge, stays open for
 *                 the tailgate window, a second person through counts as a
 *                 witnessed tailgate.
 *   - 'smokers' — the fire-stairs door: propped open on a repeating schedule
 *                 (the cleaners' smoke breaks), otherwise closed.
 *   - 'lift'    — the goods lift: open on a repeating schedule, otherwise
 *                 closed, no badge or staff involvement.
 * Doors NOT listed here keep Phase 1/2's plain static open/closed behaviour.
 */
export interface DoorKindDef {
  x: number;
  y: number;
  id: string;
  kind: 'badge' | 'smokers' | 'lift';
  /** Short access-control name rendered on the in-world door panel. */
  displayName: string;
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
  lights: LightSource[];
  doors: DoorKindDef[];
  playerStart: { x: number; y: number };
}

export interface ParsedCell {
  kind: CellKind;
  zone: string | null;
  surface: SurfaceType | null;
  furnitureType: string | null;
  /** Only meaningful when kind === 'door'. */
  doorOpen: boolean | null;
}

export interface ParsedLevel {
  cellSize: number;
  width: number;
  height: number;
  /** [y][x], row-major to match `layout`. */
  cells: ParsedCell[][];
  furniture: FurniturePlacement[];
  lights: LightSource[];
  doors: DoorKindDef[];
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

  for (const [zoneId, zone] of Object.entries(data.zones)) {
    if (!ZONE_VISUAL_PROFILES.includes(zone.visualProfile as ZoneVisualProfile)) {
      throw new Error(`Zone "${zoneId}" requires a valid visual profile`);
    }
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
        doorOpen: entry.kind === 'door' ? (entry.open ?? true) : null,
      };
    });
  });

  for (const f of data.furniture) {
    const cell = cells[f.y]?.[f.x];
    if (!cell || cell.kind !== 'furniture' || cell.furnitureType !== f.type) {
      throw new Error(`Furniture entry ${JSON.stringify(f)} doesn't match the layout cell at (${f.x}, ${f.y})`);
    }
  }

  for (const d of data.doors) {
    if (typeof d.displayName !== 'string' || d.displayName.trim().length === 0) {
      throw new Error(`Door "${d.id}" requires a valid display name`);
    }
    const cell = cells[d.y]?.[d.x];
    if (!cell || cell.kind !== 'door') {
      throw new Error(`Door entry ${JSON.stringify(d)} doesn't sit on a door cell at (${d.x}, ${d.y})`);
    }
  }

  return {
    cellSize: data.cellSize,
    width: data.width,
    height: data.height,
    cells,
    furniture: data.furniture,
    lights: data.lights,
    doors: data.doors,
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

/**
 * A per-tick lookup of the CURRENT open state of dynamic (badge/smokers/
 * lift) doors, keyed "x,y". These are the only doors whose open state
 * changes at runtime — every other door cell's `doorOpen` is fixed at load
 * (Phase 1/2's plain static behaviour). Passed through from src/systems/
 * DoorState.ts; omitted entirely by any caller that doesn't care (static
 * levels in tests, Phase 1/2 call sites), which keeps this addition fully
 * backward compatible with every existing signature below.
 */
export type DoorOpenLookup = ReadonlyMap<string, boolean>;

/**
 * True for any cell a capsule should collide with: walls and furniture,
 * plus a dynamic door currently reading closed in `doorOverrides`. Static
 * (non-dynamic) doors are never solid to movement — unchanged from Phase 1/2.
 */
export function isSolid(level: ParsedLevel, x: number, y: number, doorOverrides?: DoorOpenLookup): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true;
  }
  const cell = level.cells[y][x];
  if (cell.kind === 'wall' || cell.kind === 'furniture') {
    return true;
  }
  if (cell.kind === 'door' && doorOverrides) {
    const open = doorOverrides.get(`${x},${y}`);
    if (open !== undefined) {
      return !open;
    }
  }
  return false;
}

/**
 * True for any cell that blocks line-of-sight: walls, closed doors, and
 * furniture (a desk or rack occludes just as much as a wall does). Movement
 * solidity and sight-blocking are deliberately separate checks — an open
 * door is walkable AND see-through; a closed one is walkable but opaque
 * (unless it's also a dynamic door, in which case closed blocks movement
 * too — see `isSolid`). `doorOverrides` takes priority over the door's
 * static `doorOpen` when the cell has a current entry.
 */
export function blocksSight(level: ParsedLevel, x: number, y: number, doorOverrides?: DoorOpenLookup): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true;
  }
  const cell = level.cells[y][x];
  if (cell.kind === 'wall' || cell.kind === 'furniture') {
    return true;
  }
  if (cell.kind !== 'door') {
    return false;
  }
  const open = doorOverrides?.get(`${x},${y}`) ?? cell.doorOpen;
  return open === false;
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
