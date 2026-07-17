import { describe, expect, it } from 'vitest';
import {
  applyStaffBadges,
  badgeDoor,
  closedDoorWallBounds,
  createDoorState,
  doorOpenLookup,
  isDoorOpen,
  type DoorRuntimeState,
} from './DoorState';
import { createStaffState } from '../entities/StaffState';
import { parseLevel, type LevelData } from '../world/level';

const LEVEL_DATA: LevelData = {
  cellSize: 1,
  width: 5,
  height: 3,
  legend: {
    '#': { kind: 'wall' },
    '.': { kind: 'floor', zone: 'room' },
    '+': { kind: 'door', zone: 'room', open: true },
  },
  zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
  layout: ['#####', '#.+.#', '#####'],
  furniture: [],
  lights: [],
  doors: [{ x: 2, y: 1, id: 'test-badge', kind: 'badge', displayName: 'TEST ACCESS' }],
  playerStart: { x: 1, y: 1 },
};
const LEVEL = parseLevel(LEVEL_DATA);

describe('createDoorState', () => {
  it('starts closed (badge doors never badged yet)', () => {
    const state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    expect(isDoorOpen(state, 0, false)).toBe(false);
  });
});

describe('badge doors — the tailgate window', () => {
  it('is through cleanly a bit before the 1.6s window closes', () => {
    let state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    state = badgeDoor(state, 0, false); // staff badges at t=0
    expect(isDoorOpen(state, 1500, false)).toBe(true); // 1.5s later, clean
  });

  it('is locked out a bit after the 1.6s window closes', () => {
    let state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    state = badgeDoor(state, 0, false);
    expect(isDoorOpen(state, 1700, false)).toBe(false); // 1.7s later, locked out
  });

  it('badging is a no-op during lockdown', () => {
    let state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    state = badgeDoor(state, 0, true);
    expect(state.tailgateCloseAt).toBe(0);
    expect(isDoorOpen(state, 100, true)).toBe(false);
  });

  it('a fresh badge refreshes the window past an old one', () => {
    let state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    state = badgeDoor(state, 0, false);
    state = badgeDoor(state, 1000, false); // re-badged before the first window closed
    expect(isDoorOpen(state, 2000, false)).toBe(true); // would have been closed under the first badge
  });
});

describe('smokers doors — the schedule', () => {
  const def = { x: 0, y: 0, id: 'test-smokers', kind: 'smokers' as const };

  it('starts closed, opens once the schedule reaches its window, closes again after 9s', () => {
    const state = createDoorState(def);
    // openForMs 9000, closedForMs 14000, phaseMs 9000 -> first window opens at
    // t=5000 (closedForMs - phaseMs) and runs for openForMs (9000ms), to t=14000.
    expect(isDoorOpen(state, 0, false)).toBe(false); // closed at t=0
    expect(isDoorOpen(state, 4999, false)).toBe(false); // still closed, just before the window
    expect(isDoorOpen(state, 5000, false)).toBe(true); // window opens
    expect(isDoorOpen(state, 13999, false)).toBe(true); // still within the 9s open window
    expect(isDoorOpen(state, 14000, false)).toBe(false); // window closed again
  });

  it('is forced shut during lockdown regardless of schedule', () => {
    const state = createDoorState(def);
    expect(isDoorOpen(state, 5000, true)).toBe(false);
  });
});

describe('lift doors — schedule, ignores lockdown', () => {
  const def = { x: 0, y: 0, id: 'test-lift', kind: 'lift' as const };

  it('follows its own open/closed schedule', () => {
    const state = createDoorState(def);
    // openForMs 6000, closedForMs 20000, phaseMs 0 -> closed first, opens at t=20000.
    expect(isDoorOpen(state, 0, false)).toBe(false); // closed at t=0
    expect(isDoorOpen(state, 19999, false)).toBe(false);
    expect(isDoorOpen(state, 20000, false)).toBe(true); // window opens
    expect(isDoorOpen(state, 25999, false)).toBe(true); // still within the 6s open window
    expect(isDoorOpen(state, 26000, false)).toBe(false); // window closed, cycle restarts
  });

  it('stays on schedule during lockdown', () => {
    const state = createDoorState(def);
    expect(isDoorOpen(state, 20000, true)).toBe(true);
  });
});

describe('doorOpenLookup / closedDoorWallBounds', () => {
  it('reports the badge door closed by default and produces a collision box for it', () => {
    const states: DoorRuntimeState[] = [createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' })];
    const lookup = doorOpenLookup(LEVEL, states, 0, false);
    expect(lookup.get('2,1')).toBe(false);

    const bounds = closedDoorWallBounds(LEVEL, states, 0, false);
    expect(bounds).toEqual([{ minX: 2, maxX: 3, minZ: 1, maxZ: 2 }]);
  });

  it('produces no collision box once the door is open', () => {
    let state = createDoorState({ x: 2, y: 1, id: 'test-badge', kind: 'badge' });
    state = badgeDoor(state, 0, false);
    const bounds = closedDoorWallBounds(LEVEL, [state], 500, false);
    expect(bounds).toEqual([]);
  });
});

describe('applyStaffBadges', () => {
  const doorDef = { x: 2, y: 1, id: 'test-badge', kind: 'badge' as const };
  const staffDef = { id: 'cleaner', badges: ['test-badge'], route: [{ x: 2, y: 1, pauseMs: 0 }] };

  it('refreshes the tailgate window when an authorised staff member is within range', () => {
    const doorState = createDoorState(doorDef);
    const staff = createStaffState(staffDef); // spawns at (2.5, 1.5) — right on the door
    const updated = applyStaffBadges(LEVEL, [doorState], [staff], [staffDef], 1000, false);
    expect(isDoorOpen(updated[0], 1000, false)).toBe(true);
  });

  it('does not badge when the staff member carries no badge for this door', () => {
    const doorState = createDoorState(doorDef);
    const staff = createStaffState({ ...staffDef, badges: [] });
    const updated = applyStaffBadges(LEVEL, [doorState], [staff], [{ ...staffDef, badges: [] }], 1000, false);
    expect(isDoorOpen(updated[0], 1000, false)).toBe(false);
  });

  it('does not badge when the staff member is out of range', () => {
    const doorState = createDoorState(doorDef);
    const staff = { ...createStaffState(staffDef), x: 999, z: 999 };
    const updated = applyStaffBadges(LEVEL, [doorState], [staff], [staffDef], 1000, false);
    expect(isDoorOpen(updated[0], 1000, false)).toBe(false);
  });
});
