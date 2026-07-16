import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelData } from '../world/level';
import { extrudeLevel } from '../world/Extruder';
import { buildLightGrid } from '../systems/LightModel';
import { createDoorState, doorOpenLookup } from '../systems/DoorState';
import { findPath } from '../systems/Pathfinding';
import { EngagementInputSession, InputRecorder, replay, replayHunt, type InputLog } from './InputLog';
import { stepHunt, type HuntEnvironment, type HuntState } from './stepHunt';
import { createGuardState, type GuardsData, type GuardState } from '../entities/GuardState';
import { createStaffState, type StaffData } from '../entities/StaffState';
import { createMissionState } from './MissionState';
import { decideRating } from '../report/rating';
import { MISSION } from '../config/mission';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import floor12 from '../data/floor12.json';
import guardsData from '../data/guards.json';
import staffData from '../data/staff.json';

const STEP_SECONDS = 1 / 60;

const level = parseLevel(floor12 as LevelData);
const extruded = extrudeLevel(level);
const startState: PlayerState = {
  x: (level.playerStart.x + 0.5) * level.cellSize,
  z: (level.playerStart.y + 0.5) * level.cellSize,
  facingYaw: 0,
};

function intent(directionX: number, directionZ: number, speed: MovementIntent['speed'] = 'walk'): MovementIntent {
  return { directionX, directionZ, speed, crouched: speed === 'creep', device: 'keyboard' };
}

/** A scripted (not random) sequence: walk north out of reception, then east along the corridor, then stop and turn. */
function scriptedRun(): InputLog {
  const recorder = new InputRecorder('REPLAY-TEST-SEED', STEP_SECONDS, startState);
  let tick = 0;
  for (let i = 0; i < 90; i++) recorder.record(tick++, intent(0, -1, 'run')); // north, run
  for (let i = 0; i < 60; i++) recorder.record(tick++, intent(1, 0, 'walk')); // east, walk
  for (let i = 0; i < 30; i++) recorder.record(tick++, intent(0, 1, 'creep')); // south, creep
  for (let i = 0; i < 20; i++) recorder.record(tick++, intent(0, 0, 'idle'));
  return recorder.toLog();
}

describe('engagement input session lifecycle', () => {
  it('produces independent, replayable logs for consecutive engagements', () => {
    const session = new EngagementInputSession('SESSION-TEST', STEP_SECONDS, startState);
    session.intentFrozen = true;
    session.drivenIntent = intent(1, 0, 'run');
    session.drivenInteract = true;
    session.startReplay(scriptedRun());
    session.record(intent(0, -1));
    const firstLog = session.toLog();

    const nextStart = { ...startState, x: startState.x + 1 };
    session.reset(nextStart);
    session.record(intent(0, 1, 'creep'));
    const secondLog = session.toLog();

    expect(firstLog).toMatchObject({
      startState,
      entries: [{ tick: 0, intent: intent(0, -1), throwAction: null, interactHeld: false }],
    });
    expect(secondLog).toMatchObject({
      startState: nextStart,
      entries: [{ tick: 0, intent: intent(0, 1, 'creep'), throwAction: null, interactHeld: false }],
    });
    expect(firstLog.entries).not.toBe(secondLog.entries);
    expect(replay(firstLog, extruded.wallBounds)).toEqual(replay(firstLog, extruded.wallBounds));
    expect(replay(secondLog, extruded.wallBounds)).toEqual(replay(secondLog, extruded.wallBounds));
    expect(replay(firstLog, extruded.wallBounds)).not.toEqual(replay(secondLog, extruded.wallBounds));
    expect(session.takeReplayEntry()).toBeNull();
    expect(session.intentFrozen).toBe(false);
    expect(session.drivenIntent).toBeNull();
    expect(session.drivenInteract).toBeNull();
  });
});

describe('replay determinism (seed + input log)', () => {
  it('two replays of the same log are byte-identical', () => {
    const log = scriptedRun();
    const resultA = replay(log, extruded.wallBounds);
    const resultB = replay(log, extruded.wallBounds);
    expect(resultA).toEqual(resultB);
  });

  it('a different input sequence diverges', () => {
    const log = scriptedRun();
    const divergent: InputLog = {
      ...log,
      entries: [{ tick: 0, intent: intent(1, 0, 'run'), throwAction: null, interactHeld: false }, ...log.entries],
    };
    const baseline = replay(log, extruded.wallBounds);
    const divergedResult = replay(divergent, extruded.wallBounds);
    expect(divergedResult).not.toEqual(baseline);
  });

  it('the scripted run actually moves and stays inside the level bounds', () => {
    const result = replay(scriptedRun(), extruded.wallBounds);
    expect(result).not.toEqual(startState);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(level.width * level.cellSize);
    expect(result.z).toBeGreaterThanOrEqual(0);
    expect(result.z).toBeLessThanOrEqual(level.height * level.cellSize);
  });
});

describe('replay determinism with guards (Phase 2)', () => {
  const guardRoutes = (guardsData as GuardsData).guards;
  const lightGrid = buildLightGrid(level);
  const env: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: guardRoutes.map((g) => g.route),
    guardRoutes,
    staffRoutes: (staffData as StaffData).staff,
  };
  const huntStart: HuntState = {
    player: startState,
    guards: guardRoutes.map(createGuardState),
    alertLevel: { level: 0, msSinceIncident: 0 },
    simTimeMs: 0,
    doors: level.doors.map(createDoorState),
    staff: (staffData as StaffData).staff.map(createStaffState),
    bolts: [],
    mission: createMissionState(),
  };

  it('guards have no input of their own, yet replaying the same log reproduces them byte-identically', () => {
    const log = scriptedRun();
    const resultA = replayHunt(log, huntStart, env);
    const resultB = replayHunt(log, huntStart, env);
    expect(resultA).toEqual(resultB);
  });

  it('a different input sequence diverges the guards too, not just the player', () => {
    const log = scriptedRun();
    const divergent: InputLog = {
      ...log,
      entries: [{ tick: 0, intent: intent(1, 0, 'run'), throwAction: null, interactHeld: false }, ...log.entries],
    };
    const baseline = replayHunt(log, huntStart, env);
    const diverged = replayHunt(divergent, huntStart, env);
    expect(diverged.guards).not.toEqual(baseline.guards);
  });

  it('guards actually patrol (move from their start position) over the scripted run', () => {
    const result = replayHunt(scriptedRun(), huntStart, env);
    for (let i = 0; i < result.guards.length; i++) {
      const moved = result.guards[i].x !== huntStart.guards[i].x || result.guards[i].z !== huntStart.guards[i].z;
      expect(moved).toBe(true);
    }
  });
});

describe('replay determinism with a door, a throw, and an ingress window (Phase 3)', () => {
  const guardRoutes = (guardsData as GuardsData).guards;
  const lightGrid = buildLightGrid(level);
  const env: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: guardRoutes.map((g) => g.route),
    guardRoutes,
    staffRoutes: (staffData as StaffData).staff,
  };

  // The goods lift door: closed until its schedule opens at simTimeMs 20000
  // (openForMs 6000, closedForMs 20000, phaseMs 0 — src/config/doors.ts).
  const LIFT_DOOR_CELL = { x: 9, y: 11 };

  function doorRunStart(): HuntState {
    return {
      player: { x: LIFT_DOOR_CELL.x + 0.5, z: LIFT_DOOR_CELL.y + 1.5, facingYaw: 0 }, // one cell south of the lift door
      guards: guardRoutes.map(createGuardState),
      alertLevel: { level: 0, msSinceIncident: 0 },
      simTimeMs: 19900, // just before the lift's ingress window opens
      doors: level.doors.map(createDoorState),
      staff: (staffData as StaffData).staff.map(createStaffState),
      bolts: [],
      mission: createMissionState(),
    };
  }

  /** Walks north through the (initially closed, then scheduled-open) lift door, throwing one bolt partway through. */
  function doorThrowRun(): InputLog {
    const start = doorRunStart();
    const recorder = new InputRecorder('PHASE3-DOOR-THROW-SEED', STEP_SECONDS, start.player);
    for (let i = 0; i < 120; i++) {
      const throwAction = i === 30 ? { x: LIFT_DOOR_CELL.x + 0.5, z: LIFT_DOOR_CELL.y - 3.5 } : null;
      recorder.record(i, intent(0, -1, 'walk'), throwAction);
    }
    return recorder.toLog();
  }

  it('two replays of a run using the lift door, its ingress window, and a thrown bolt are byte-identical', () => {
    const log = doorThrowRun();
    const start = doorRunStart();
    const resultA = replayHunt(log, start, env);
    const resultB = replayHunt(log, start, env);
    expect(resultA).toEqual(resultB);
  });

  it('the run actually passes through the lift door once its schedule opens', () => {
    const result = replayHunt(doorThrowRun(), doorRunStart(), env);
    expect(result.player.z).toBeLessThan(LIFT_DOOR_CELL.y); // north of the door row: made it through
  });

  it('the thrown bolt is recorded and lands deterministically', () => {
    const result = replayHunt(doorThrowRun(), doorRunStart(), env);
    expect(result.bolts.length).toBe(1);
    expect(result.bolts[0].landed).toBe(true);
  });

  it('a run that throws diverges from an otherwise identical run that does not', () => {
    const start = doorRunStart();
    const withThrow = replayHunt(doorThrowRun(), start, env);

    const recorder = new InputRecorder('PHASE3-NO-THROW-SEED', STEP_SECONDS, start.player);
    for (let i = 0; i < 120; i++) recorder.record(i, intent(0, -1, 'walk'), null);
    const withoutThrow = replayHunt(recorder.toLog(), start, env);

    expect(withThrow.bolts).not.toEqual(withoutThrow.bolts);
  });
});

describe('replay determinism over a full mission (Phase 4)', () => {
  const lightGrid = buildLightGrid(level);

  // A guard-free, staff-free floor: this test proves the MISSION fold is
  // deterministic (plant + exfil), not guard behaviour (already covered
  // above). A pathfinding follower drives the real sim from the reception
  // spawn, ingresses through whichever dynamic door opens first, walks to the
  // rack, holds the 3s plant, then walks back out to the lift lobby — waiting
  // deterministically whenever a door it needs is shut. We record every input,
  // then assert the recorded log replays byte-identically.
  const env: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: [],
    guardRoutes: [],
    staffRoutes: [],
  };

  const IDLE = intent(0, 0, 'idle');
  const PLANT_STAND = { x: 32, y: 3 }; // walkable floor next to the rack (the plant point itself is solid)
  const EXFIL_STAND = { x: 6, y: 15 };

  function missionStart(): HuntState {
    return {
      player: { x: 3.5, z: 12.5, facingYaw: 0 }, // reception, just south of the fire-stairs door
      guards: [],
      alertLevel: { level: 0, msSinceIncident: 0 },
      simTimeMs: 0,
      doors: level.doors.map(createDoorState),
      staff: [],
      bolts: [],
      mission: createMissionState(),
    };
  }

  function steer(state: HuntState, tx: number, tz: number): MovementIntent {
    const dx = tx - state.player.x;
    const dz = tz - state.player.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) {
      return IDLE;
    }
    return { directionX: dx / d, directionZ: dz / d, speed: 'walk', crouched: false, device: 'keyboard' };
  }

  /**
   * Path to a walkable stand cell, then close the last bit straight at the
   * point (which may itself be solid, like the rack). Idle when the route is
   * blocked — a shut door — rather than walking into a wall, so the follower
   * waits deterministically for the next open window.
   */
  function driveTo(state: HuntState, stand: { x: number; y: number }, px: number, pz: number): MovementIntent {
    const overrides = doorOpenLookup(level, state.doors, state.simTimeMs, false);
    const path = findPath(level, { x: Math.floor(state.player.x), y: Math.floor(state.player.z) }, stand, overrides);
    if (!path) {
      return IDLE;
    }
    if (path.length >= 2) {
      return steer(state, path[1].x + 0.5, path[1].y + 0.5);
    }
    return steer(state, px, pz);
  }

  /** Drive the whole mission, returning the recorded log, the start state, and the live final state. */
  function driveFullMission(): { log: InputLog; start: HuntState; finalState: HuntState } {
    const start = missionStart();
    let state = start;
    const recorder = new InputRecorder('FULL-MISSION-SEED', STEP_SECONDS, start.player);

    let tick = 0;
    for (let i = 0; i < 12000 && state.mission.phase === 'infiltrating'; i++) {
      let intentThisTick: MovementIntent;
      let interactHeld = false;

      if (state.mission.plantedAtMs === null) {
        const dPlant = Math.hypot(state.player.x - MISSION.plant.x, state.player.z - MISSION.plant.z);
        if (dPlant <= MISSION.interactRangeMetres) {
          intentThisTick = IDLE;
          interactHeld = true; // hold to plant
        } else {
          intentThisTick = driveTo(state, PLANT_STAND, MISSION.plant.x, MISSION.plant.z);
        }
      } else {
        intentThisTick = driveTo(state, EXFIL_STAND, MISSION.exfil.x, MISSION.exfil.z);
      }

      recorder.record(tick++, intentThisTick, null, interactHeld);
      state = stepHunt(state, intentThisTick, null, interactHeld, env, STEP_SECONDS, STEP_SECONDS * 1000).state;
    }

    return { log: recorder.toLog(), start, finalState: state };
  }

  it('drives ingress -> plant -> exfil to completion, and the recorded log replays byte-identically', () => {
    const { log, start, finalState } = driveFullMission();

    // The drive actually finished the job.
    expect(finalState.mission.phase).toBe('exfilled');
    expect(finalState.mission.plantedAtMs).not.toBeNull();
    expect(finalState.mission.ingressRoute).not.toBeNull();

    // Two replays of the recorded log are identical to each other and to the live drive.
    const replayA = replayHunt(log, start, env);
    const replayB = replayHunt(log, start, env);
    expect(replayA).toEqual(replayB);
    expect(replayA).toEqual(finalState);

    // A clean, guard-free run rates GHOST, and that is stable across replay.
    expect(decideRating(replayA.mission).rating).toBe('GHOST');
  });

  it('assist mode (guardSpeedScale 0.9) replays byte-identically and diverges from full speed', () => {
    // A guard-inclusive run so the scale actually matters.
    const guardRoutes = (guardsData as GuardsData).guards;
    const baseEnv: HuntEnvironment = {
      level,
      lightGrid,
      wallBounds: extruded.wallBounds,
      routes: guardRoutes.map((g) => g.route),
      guardRoutes,
      staffRoutes: [],
    };
    const assistEnv: HuntEnvironment = { ...baseEnv, guardSpeedScale: 0.9 };
    const start: HuntState = {
      ...missionStart(),
      guards: guardRoutes.map(createGuardState),
    };
    const log = (() => {
      const r = new InputRecorder('ASSIST-SEED', STEP_SECONDS, start.player);
      for (let i = 0; i < 240; i++) r.record(i, intent(0, -1, 'walk'), null, false);
      return r.toLog();
    })();

    const assistA = replayHunt(log, start, assistEnv);
    const assistB = replayHunt(log, start, assistEnv);
    expect(assistA).toEqual(assistB); // deterministic under assist
    const fullSpeed = replayHunt(log, start, baseEnv);
    expect(assistA.guards).not.toEqual(fullSpeed.guards); // and genuinely slower guards
  });

  it('a detain through the fold restarts at the checkpoint, preserving the plant and alert while incrementing detains', () => {
    // Player standing on the checkpoint with a guard already in contact range,
    // the device planted and the building in lockdown — one tick emits a detain
    // and the deterministic restart fires.
    const checkpoint = { x: 32.5, z: 3.5 };
    const guard: GuardState = { ...createGuardState((guardsData as GuardsData).guards[0]), x: checkpoint.x, z: checkpoint.z };
    const detainEnv: HuntEnvironment = {
      level,
      lightGrid,
      wallBounds: extruded.wallBounds,
      routes: [(guardsData as GuardsData).guards[0].route],
      guardRoutes: [(guardsData as GuardsData).guards[0]],
      staffRoutes: [],
    };
    const state: HuntState = {
      player: { x: checkpoint.x, z: checkpoint.z, facingYaw: 0 },
      guards: [guard],
      alertLevel: { level: 2, msSinceIncident: 0 },
      simTimeMs: 40_000,
      doors: level.doors.map(createDoorState),
      staff: [],
      bolts: [],
      mission: { ...createMissionState(), plantedAtMs: 8000, checkpoint, detains: 0, maxAlertLevel: 2 },
    };

    const after = stepHunt(state, intent(0, 0, 'idle'), null, false, detainEnv, STEP_SECONDS, STEP_SECONDS * 1000);
    expect(after.events.some((e) => e.type === 'detain')).toBe(true);
    expect(after.state.mission.detains).toBe(1); // incremented
    expect(after.state.mission.plantedAtMs).toBe(8000); // plant preserved
    expect(after.state.alertLevel.level).toBe(2); // alert preserved
    expect(after.state.player).toEqual({ x: checkpoint.x, z: checkpoint.z, facingYaw: 0 }); // back at the checkpoint
  });
});
