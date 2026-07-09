import { describe, expect, it } from 'vitest';
import { findPath } from './Pathfinding';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';

function levelFromLayout(layout: string[]): ReturnType<typeof parseLevel> {
  return parseLevel({
    cellSize: 1,
    width: layout[0].length,
    height: layout.length,
    legend: {
      '#': { kind: 'wall' },
      '.': { kind: 'floor', zone: 'room' },
    },
    zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
    layout,
    furniture: [],
    lights: [],
    doors: [],
    playerStart: { x: 1, y: 1 },
  } as LevelData);
}

describe('findPath', () => {
  it('finds a straight line when nothing is in the way', () => {
    const level = levelFromLayout(['#####', '#...#', '#####']);
    const path = findPath(level, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it('returns null when the goal is unreachable', () => {
    const level = levelFromLayout(['#####', '#.#.#', '#####']);
    expect(findPath(level, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeNull();
  });

  it('routes around an obstacle rather than failing', () => {
    const level = levelFromLayout(['#####', '#.#.#', '#...#', '#####']);
    const path = findPath(level, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 1 });
  });

  it('never cuts a diagonal through two solid corner cells', () => {
    // A single-cell gap at (2,2) between two walls diagonally adjacent —
    // legal 4-directionally but the diagonal shortcut through the corner
    // must be refused.
    const level = levelFromLayout(['####', '#.##', '##.#', '####']);
    const path = findPath(level, { x: 1, y: 1 }, { x: 2, y: 2 });
    // No orthogonal-only path exists either (walled off both ways), so this
    // specific tiny room is intentionally unreachable — the point is it must
    // NOT return a path that clips the diagonal corner.
    expect(path).toBeNull();
  });

  it('routes guard-to-player across the real Floor 12 data, through the corridor not through walls', () => {
    const level = parseLevel(floor12 as LevelData);
    // Reception (near playerStart) to an open floor cell inside the office.
    const path = findPath(level, { x: 6, y: 15 }, { x: 13, y: 2 });
    expect(path).not.toBeNull();
    // Every step of the path must be a walkable cell, and consecutive steps
    // must be adjacent (no teleporting across walls).
    for (let i = 0; i < path!.length; i++) {
      const cell = level.cells[path![i].y][path![i].x];
      expect(cell.kind === 'floor' || cell.kind === 'door').toBe(true);
      if (i > 0) {
        const dx = Math.abs(path![i].x - path![i - 1].x);
        const dy = Math.abs(path![i].y - path![i - 1].y);
        expect(dx).toBeLessThanOrEqual(1);
        expect(dy).toBeLessThanOrEqual(1);
      }
    }
  });
});
