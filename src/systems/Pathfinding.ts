import { isSolid, type DoorOpenLookup, type ParsedLevel } from '../world/level';

export interface GridPoint {
  x: number;
  y: number;
}

const ORTHOGONAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;

const NEIGHBOUR_OFFSETS: Array<{ dx: number; dy: number; cost: number; diagonal: boolean }> = [
  { dx: 1, dy: 0, cost: ORTHOGONAL_COST, diagonal: false },
  { dx: -1, dy: 0, cost: ORTHOGONAL_COST, diagonal: false },
  { dx: 0, dy: 1, cost: ORTHOGONAL_COST, diagonal: false },
  { dx: 0, dy: -1, cost: ORTHOGONAL_COST, diagonal: false },
  { dx: 1, dy: 1, cost: DIAGONAL_COST, diagonal: true },
  { dx: 1, dy: -1, cost: DIAGONAL_COST, diagonal: true },
  { dx: -1, dy: 1, cost: DIAGONAL_COST, diagonal: true },
  { dx: -1, dy: -1, cost: DIAGONAL_COST, diagonal: true },
];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function heuristic(a: GridPoint, b: GridPoint): number {
  // Octile distance: admissible for 8-directional movement with these costs.
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return ORTHOGONAL_COST * (dx + dy) + (DIAGONAL_COST - 2 * ORTHOGONAL_COST) * Math.min(dx, dy);
}

/**
 * Grid A* over walkable (non-wall, non-furniture) cells, 8-directional, with
 * corner-cutting disallowed — a diagonal move is only legal if both of the
 * orthogonal cells it passes between are also walkable, so a guard can never
 * clip through a solid corner. The grid is small enough (under 1000 cells)
 * that a plain array-scan open set is fast enough; no binary heap needed.
 *
 * Returns the path from start to goal INCLUSIVE, or null if no path exists
 * (goal is unreachable, or start/goal themselves are solid).
 */
export function findPath(
  level: ParsedLevel,
  start: GridPoint,
  goal: GridPoint,
  doorOverrides?: DoorOpenLookup,
): GridPoint[] | null {
  if (isSolid(level, start.x, start.y, doorOverrides) || isSolid(level, goal.x, goal.y, doorOverrides)) {
    return null;
  }
  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }

  const open: GridPoint[] = [start];
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>([[key(start.x, start.y), 0]]);
  const closed = new Set<string>();

  while (open.length > 0) {
    let bestIndex = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const node = open[i];
      const f = (gScore.get(key(node.x, node.y)) ?? Infinity) + heuristic(node, goal);
      if (f < bestF) {
        bestF = f;
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    const currentKey = key(current.x, current.y);
    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current);
    }
    closed.add(currentKey);

    for (const { dx, dy, cost, diagonal } of NEIGHBOUR_OFFSETS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (isSolid(level, nx, ny, doorOverrides)) {
        continue;
      }
      if (
        diagonal &&
        (isSolid(level, current.x + dx, current.y, doorOverrides) ||
          isSolid(level, current.x, current.y + dy, doorOverrides))
      ) {
        continue; // no cutting a solid corner
      }
      const nKey = key(nx, ny);
      if (closed.has(nKey)) {
        continue;
      }

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + cost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        if (!open.some((p) => p.x === nx && p.y === ny)) {
          open.push({ x: nx, y: ny });
        }
      }
    }
  }

  return null;
}

function reconstructPath(cameFrom: Map<string, GridPoint>, end: GridPoint): GridPoint[] {
  const path = [end];
  let currentKey = key(end.x, end.y);
  while (cameFrom.has(currentKey)) {
    const prev = cameFrom.get(currentKey)!;
    path.push(prev);
    currentKey = key(prev.x, prev.y);
  }
  return path.reverse();
}
