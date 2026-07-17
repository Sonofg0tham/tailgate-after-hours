import { describe, expect, it } from 'vitest';
import { blocksSight, findUnreachableZones, isSolid, isWall, parseLevel, type LevelData } from './level';
import floor12 from '../data/floor12.json';

const MINIMAL = {
  cellSize: 1,
  width: 5,
  height: 3,
  legend: {
    '#': { kind: 'wall' },
    '.': { kind: 'floor', zone: 'room' },
    d: { kind: 'furniture', zone: 'room', furnitureType: 'desk' },
    '+': { kind: 'door', zone: 'room', open: true },
    '=': { kind: 'door', zone: 'room', open: false },
  },
  zones: {
    room: { label: 'Room', surface: 'concrete', tint: '#000000', visualProfile: 'service' },
  },
  layout: ['#####', '#d+=#', '#####'],
  furniture: [{ x: 1, y: 1, type: 'desk' }],
  lights: [],
  doors: [{ x: 2, y: 1, id: 'test-door', kind: 'badge', displayName: 'TEST ACCESS' }],
  playerStart: { x: 2, y: 1 },
} as LevelData;

describe('parseLevel', () => {
  it('parses a valid minimal level', () => {
    const level = parseLevel(MINIMAL);
    expect(level.cells[1][1]).toEqual({
      kind: 'furniture',
      zone: 'room',
      surface: 'concrete',
      furnitureType: 'desk',
      doorOpen: null,
    });
    expect(level.cells[0][0]).toEqual({
      kind: 'wall',
      zone: null,
      surface: null,
      furnitureType: null,
      doorOpen: null,
    });
    expect(level.cells[1][2].doorOpen).toBe(true);
    expect(level.cells[1][3].doorOpen).toBe(false);
  });

  it('throws when a row count does not match height', () => {
    expect(() => parseLevel({ ...MINIMAL, height: 5 })).toThrow(/rows/);
  });

  it('throws when a row length does not match width', () => {
    expect(() => parseLevel({ ...MINIMAL, layout: ['##', '#d+=#', '#####'] })).toThrow(/length/);
  });

  it('throws on a character with no legend entry', () => {
    expect(() => parseLevel({ ...MINIMAL, layout: ['#####', '#x+=#', '#####'] })).toThrow(/no legend entry/);
  });

  it('throws when a furniture entry does not match its layout cell', () => {
    expect(() => parseLevel({ ...MINIMAL, furniture: [{ x: 0, y: 0, type: 'desk' }] })).toThrow(/doesn't match/);
  });

  it('throws when a door entry does not sit on a door cell', () => {
    expect(() =>
      parseLevel({
        ...MINIMAL,
        doors: [{ x: 0, y: 0, id: 'bad', kind: 'badge', displayName: 'BAD ACCESS' }],
      } as LevelData),
    ).toThrow(/doesn't sit on a door cell/);
  });

  it('parses a valid door entry onto the matching layout cell', () => {
    const level = parseLevel(MINIMAL);
    expect(level.doors).toEqual([
      { x: 2, y: 1, id: 'test-door', kind: 'badge', displayName: 'TEST ACCESS' },
    ]);
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
  ])('rejects a dynamic door with a %s display name', (_case, displayName) => {
    const invalid = {
      ...MINIMAL,
      doors: [{ ...MINIMAL.doors[0], displayName }],
    } as unknown as LevelData;

    expect(() => parseLevel(invalid)).toThrow(/display name/i);
  });

  it.each([
    ['missing', undefined],
    ['blank', ''],
    ['unknown', 'warehouse'],
  ])('rejects a zone with a %s visual profile', (_case, visualProfile) => {
    const invalid = {
      ...MINIMAL,
      zones: {
        room: { ...MINIMAL.zones.room, visualProfile },
      },
    } as unknown as LevelData;

    expect(() => parseLevel(invalid)).toThrow(/visual profile/i);
  });
});

describe('isWall / isSolid', () => {
  const level = parseLevel(MINIMAL);

  it('treats out-of-bounds as solid', () => {
    expect(isWall(level, -1, 0)).toBe(true);
    expect(isSolid(level, 99, 99)).toBe(true);
  });

  it('furniture is solid but not a wall', () => {
    expect(isWall(level, 1, 1)).toBe(false);
    expect(isSolid(level, 1, 1)).toBe(true);
  });
});

describe('blocksSight', () => {
  const level = parseLevel(MINIMAL);

  it('walls and furniture block sight', () => {
    expect(blocksSight(level, 0, 1)).toBe(true);
    expect(blocksSight(level, 1, 1)).toBe(true);
  });

  it('an open door does not block sight', () => {
    expect(blocksSight(level, 2, 1)).toBe(false);
  });

  it('a closed door blocks sight', () => {
    expect(blocksSight(level, 3, 1)).toBe(true);
  });

  it('out of bounds blocks sight', () => {
    expect(blocksSight(level, -1, 1)).toBe(true);
  });
});

describe('Floor 12 data', () => {
  const level = parseLevel(floor12 as LevelData);

  it('assigns the intended render-only profile to every authored zone', () => {
    expect(
      Object.fromEntries(Object.entries(level.zones).map(([id, zone]) => [id, zone.visualProfile])),
    ).toEqual({
      corridor: 'service',
      reception: 'lobby',
      office: 'office',
      kitchen: 'service',
      'print-room': 'service',
      'server-room': 'server',
      'corner-office': 'office',
      maintenance: 'service',
      ledge: 'edge',
    });
  });

  it('every zone is reachable from playerStart', () => {
    expect(findUnreachableZones(level)).toEqual([]);
  });

  it('playerStart sits on a floor cell, not a wall or furniture', () => {
    const cell = level.cells[level.playerStart.y][level.playerStart.x];
    expect(cell.kind).toBe('floor');
  });
});
