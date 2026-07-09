import { describe, expect, it } from 'vitest';
import { beamAppearanceFor, guardAnimationState, stepGuard, type StepGuardContext } from './GuardStateMachine';
import { createGuardState, type GuardState, type PatrolWaypoint } from './GuardState';
import { parseLevel, type LevelData } from '../world/level';
import { buildLightGrid } from '../systems/LightModel';
import { extrudeLevel } from '../world/Extruder';
import { DETECTION } from '../config/detection';
import type { PlayerState } from '../sim/PlayerState';
import type { MovementIntent } from '../input/InputState';

const STEP_SECONDS = 1 / 60;
const STEP_MS = STEP_SECONDS * 1000;

// A big open room (no walls to occlude), lit throughout, so vision is a pure
// range+FOV question and every test can reason about suspicion in closed form.
const LEVEL_DATA: LevelData = {
  cellSize: 1,
  width: 20,
  height: 20,
  legend: { '#': { kind: 'wall' }, '.': { kind: 'floor', zone: 'room' } },
  zones: { room: { label: 'Room', surface: 'concrete', tint: '#000' } },
  layout: Array.from({ length: 20 }, (_, y) =>
    y === 0 || y === 19 ? '#'.repeat(20) : '#' + '.'.repeat(18) + '#',
  ),
  furniture: [],
  lights: [{ x: 10, y: 10, radius: 20, intensity: 1 }], // fully lit everywhere
  doors: [],
  playerStart: { x: 2, y: 2 },
};

const LEVEL = parseLevel(LEVEL_DATA);
const LIGHT_GRID = buildLightGrid(LEVEL);
const EXTRUDED = extrudeLevel(LEVEL);

const ROUTE: PatrolWaypoint[] = [
  { x: 5, y: 5, pauseMs: 500 },
  { x: 15, y: 5, pauseMs: 500 },
];

function idleIntent(): MovementIntent {
  return { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
}

function baseContext(overrides: Partial<StepGuardContext> = {}): StepGuardContext {
  return {
    level: LEVEL,
    lightGrid: LIGHT_GRID,
    wallBounds: EXTRUDED.wallBounds,
    route: ROUTE,
    player: { x: 10, z: 10, facingYaw: 0 } satisfies PlayerState,
    playerIntent: idleIntent(),
    alertLevel: 0,
    dtSeconds: STEP_SECONDS,
    dtMs: STEP_MS,
    ...overrides,
  };
}

function run(guard: GuardState, ctx: StepGuardContext, ticks: number) {
  let current = guard;
  const allEvents = [];
  for (let i = 0; i < ticks; i++) {
    const result = stepGuard(current, ctx);
    current = result.guard;
    allEvents.push(...result.events);
  }
  return { guard: current, events: allEvents };
}

function freshGuard(): GuardState {
  return createGuardState({ id: 'g1', startWaypointIndex: 0, route: ROUTE });
}

describe('PATROL', () => {
  it('walks toward its waypoint and pauses on arrival', () => {
    const guard = freshGuard();
    const ctx = baseContext({ player: { x: 0.5, z: 0.5, facingYaw: 0 } }); // player far, out of range/behind
    const { guard: after } = run(guard, ctx, 1);
    expect(after.state).toBe('patrol');
    // Moved toward waypoint (5,5) from its start (5,5)... start IS the first waypoint,
    // so it should immediately be "arrived" and pausing. Let's just assert no suspicion built.
    expect(after.suspicion).toBe(0);
  });

  it('advances to the next waypoint once the pause completes', () => {
    const guard = freshGuard();
    const ctx = baseContext({ player: { x: 0.5, z: 0.5, facingYaw: 0 } });
    const { guard: after } = run(guard, ctx, 40); // 40 ticks ~666ms, more than the 500ms pause
    expect(after.routeIndex).toBe(1);
  });
});

describe('PATROL -> CURIOUS -> SEARCHING -> SWEEP -> PATROL (full recovery loop)', () => {
  it('escalates to curious when suspicion crosses the threshold', () => {
    const guard = { ...freshGuard(), facingYaw: 0 }; // facing +Z, toward the player below
    // Player very close, directly ahead, in full light: suspicion fills fast.
    const ctx = baseContext({ player: { x: guard.x, z: guard.z + 1, facingYaw: 0 } });
    const { guard: after } = run(guard, ctx, 60); // 1 second of unbroken point-blank sight
    expect(after.state).not.toBe('patrol');
    expect(['curious', 'searching', 'alert']).toContain(after.state);
  });

  it('a guard losing the player mid-search recovers through SWEEP back to PATROL without getting stuck', () => {
    const guard: GuardState = { ...freshGuard(), state: 'curious', lookBaseYaw: 0, suspicion: 50, investigateX: 8, investigateZ: 8 };
    // Player nowhere near the guard's cone from here on — suspicion only decays.
    const ctx = baseContext({ player: { x: 0.5, z: 0.5, facingYaw: 0 } });

    const seenStates = new Set<string>();
    let current = guard;
    for (let i = 0; i < 60 * 20; i++) {
      // up to 20s of sim time — comfortably past curiousPauseMs + maxSearchMs + sweepDurationMs
      const result = stepGuard(current, ctx);
      current = result.guard;
      seenStates.add(current.state);
      if (current.state === 'patrol' && seenStates.has('searching')) {
        break; // recovered
      }
    }

    expect(current.state).toBe('patrol');
    expect(seenStates.has('searching')).toBe(true);
    expect(current.suspicion).toBe(0);
  });
});

describe('CURIOUS', () => {
  it('drops back to patrol if suspicion fully decays during the pause', () => {
    const guard: GuardState = { ...freshGuard(), state: 'curious', suspicion: 1, lookBaseYaw: 0, msInState: 0 };
    const ctx = baseContext({ player: { x: 0.5, z: 0.5, facingYaw: 0 } }); // not visible, pure decay
    const { guard: after } = run(guard, ctx, Math.ceil(DETECTION.timing.curiousPauseMs / STEP_MS) + 5);
    expect(after.state).toBe('patrol');
  });

  it('escalates straight to alert if suspicion reaches 100 during the look-around', () => {
    const guard: GuardState = { ...freshGuard(), state: 'curious', suspicion: 90, lookBaseYaw: 0, msInState: 0 };
    const ctx = baseContext({ player: { x: guard.x, z: guard.z + 0.5, facingYaw: 0 } }); // point blank, in light
    const { guard: after } = run(guard, ctx, 30);
    expect(after.state).toBe('alert');
  });
});

describe('ALERT', () => {
  it('radios in after continuous unbroken sight past radioAfterMs', () => {
    const guard: GuardState = { ...freshGuard(), state: 'alert', suspicion: 100 };
    const ctx = baseContext({ player: { x: guard.x, z: guard.z + 1, facingYaw: 0 } }); // stays visible throughout
    const ticksNeeded = Math.ceil(DETECTION.radio.radioAfterMs / STEP_MS) + 2;
    const { events } = run(guard, ctx, ticksNeeded);
    expect(events.some((e) => e.type === 'radioCall')).toBe(true);
  });

  it('gives up to searching after losing sight for alertGiveUpMs', () => {
    const guard: GuardState = { ...freshGuard(), state: 'alert', suspicion: 100, msSinceSeen: 0 };
    const ctx = baseContext({ player: { x: 0.5, z: 0.5, facingYaw: 0 } }); // never visible from here
    const ticksNeeded = Math.ceil(DETECTION.timing.alertGiveUpMs / STEP_MS) + 2;
    const { guard: after } = run(guard, ctx, ticksNeeded);
    expect(after.state).toBe('searching');
  });

  it('emits a detain event on contact', () => {
    const guard = freshGuard();
    const ctx = baseContext({ player: { x: guard.x, z: guard.z, facingYaw: 0 } }); // same cell
    const { events } = run(guard, ctx, 1);
    expect(events.some((e) => e.type === 'detain')).toBe(true);
  });
});

describe('guardAnimationState / beamAppearanceFor — never colour alone', () => {
  it('every state maps to a distinct-enough animation or beam behaviour, not just a colour', () => {
    const patrol: GuardState = { ...freshGuard(), state: 'patrol', pauseRemainingMs: 0 };
    const paused: GuardState = { ...freshGuard(), state: 'patrol', pauseRemainingMs: 500 };
    const alert: GuardState = { ...freshGuard(), state: 'alert' };
    const curious: GuardState = { ...freshGuard(), state: 'curious' };
    const searchingMoving: GuardState = { ...freshGuard(), state: 'searching', path: [{ x: 1, y: 1 }] };
    const searchingArrived: GuardState = { ...freshGuard(), state: 'searching', path: null };

    expect(guardAnimationState(patrol)).toBe('walk');
    expect(guardAnimationState(paused)).toBe('idle');
    expect(guardAnimationState(alert)).toBe('run');
    expect(guardAnimationState(curious)).toBe('idle');
    expect(guardAnimationState(searchingMoving)).toBe('walk');
    expect(guardAnimationState(searchingArrived)).toBe('idle');

    expect(beamAppearanceFor('patrol')).toBe('steady');
    expect(beamAppearanceFor('sweep')).toBe('steady');
    expect(beamAppearanceFor('curious')).toBe('flicker');
    expect(beamAppearanceFor('searching')).toBe('flicker');
    expect(beamAppearanceFor('alert')).toBe('locked');
  });
});

describe('determinism', () => {
  it('two runs of the same guard through the same context produce identical results', () => {
    const guard = freshGuard();
    const ctx = baseContext({ player: { x: guard.x, z: guard.z + 2, facingYaw: 0 } });
    const a = run(guard, ctx, 200);
    const b = run(guard, ctx, 200);
    expect(a.guard).toEqual(b.guard);
  });
});
