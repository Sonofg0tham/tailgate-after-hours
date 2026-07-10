import { describe, expect, it } from 'vitest';
import { stepMission, restartAtCheckpoint, type StepMissionContext } from './stepMission';
import { createMissionState, type MissionState } from './MissionState';
import { MISSION } from '../config/mission';
import { parseLevel, type LevelData } from '../world/level';
import { createGuardState, type GuardsData, type GuardState } from '../entities/GuardState';
import { createStaffState, type StaffData, type StaffState } from '../entities/StaffState';
import { createDoorState } from '../systems/DoorState';
import type { HuntState } from './stepHunt';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import type { GuardEvent } from '../entities/GuardStateMachine';
import floor12 from '../data/floor12.json';
import guardsData from '../data/guards.json';
import staffData from '../data/staff.json';

const level = parseLevel(floor12 as LevelData);
const STEP_MS = 1000 / 60;
const IDLE: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
const WALKING: MovementIntent = { directionX: 1, directionZ: 0, speed: 'walk', crouched: false, device: 'keyboard' };

// A floor cell within interact range (1.0m) of the plant point (32.5, 2.5).
const AT_PLANT: PlayerState = { x: 32.5, z: 3.5, facingYaw: 0 };

function ctx(over: Partial<StepMissionContext> = {}): StepMissionContext {
  return {
    level,
    doorOverrides: new Map(),
    guards: [],
    staff: [],
    alertLevel: 0,
    simTimeMs: 1000,
    dtMs: STEP_MS,
    interactHeld: true,
    boltThrownThisTick: false,
    events: [],
    ...over,
  };
}

/** Drive `ticks` ticks of stepMission at a fixed player/intent/context. */
function drive(mission: MissionState, player: PlayerState, intent: MovementIntent, over: Partial<StepMissionContext>, ticks: number): MissionState {
  let m = mission;
  let t = 1000;
  for (let i = 0; i < ticks; i++) {
    t += STEP_MS;
    m = stepMission(m, player, intent, ctx({ ...over, simTimeMs: t }));
  }
  return m;
}

describe('the plant hold', () => {
  it('completes after 3 seconds of uninterrupted holding at the plant point', () => {
    const ticks = Math.ceil(MISSION.plantHoldMs / STEP_MS) + 1;
    const after = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, ticks);
    expect(after.plantedAtMs).not.toBeNull();
    expect(after.phase).toBe('infiltrating'); // plant point is far from exfil
    expect(after.checkpoint).toEqual({ x: AT_PLANT.x, z: AT_PLANT.z }); // second checkpoint, at the plant
  });

  it('does not complete before the full 3 seconds', () => {
    const ticks = Math.floor(MISSION.plantHoldMs / STEP_MS) - 2;
    const after = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, ticks);
    expect(after.plantedAtMs).toBeNull();
    expect(after.holdProgressMs).toBeGreaterThan(0);
  });

  it('does not progress out of interact range', () => {
    const farAway: PlayerState = { x: 20.5, z: 3.5, facingYaw: 0 };
    const after = drive(createMissionState(), farAway, IDLE, { interactHeld: true }, 60);
    expect(after.holdProgressMs).toBe(0);
    expect(after.plantedAtMs).toBeNull();
  });
});

describe('the plant cancels (and retries freely)', () => {
  it('cancels when the player moves, resetting progress to zero, then completes on a fresh hold', () => {
    let m = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, 60); // ~1s of progress
    expect(m.holdProgressMs).toBeGreaterThan(0);

    m = stepMission(m, AT_PLANT, WALKING, ctx({ interactHeld: true })); // moving cancels
    expect(m.holdProgressMs).toBe(0);
    expect(m.holdObjectiveId).toBeNull();

    // Retry from scratch, uninterrupted, completes.
    m = drive(m, AT_PLANT, IDLE, { interactHeld: true }, Math.ceil(MISSION.plantHoldMs / STEP_MS) + 1);
    expect(m.plantedAtMs).not.toBeNull();
  });

  it('cancels when a guard sees the player', () => {
    const guard: GuardState = { ...createGuardState({ id: 'g', startWaypointIndex: 0, route: [{ x: 32, y: 5, pauseMs: 0 }] }), x: 32.5, z: 5.5, facingYaw: Math.PI };
    let m = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, 30);
    expect(m.holdProgressMs).toBeGreaterThan(0);
    m = stepMission(m, AT_PLANT, IDLE, ctx({ interactHeld: true, guards: [guard] }));
    expect(m.holdProgressMs).toBe(0);
  });

  it('cancels when a cleaner bumps the player', () => {
    const staff: StaffState = { ...createStaffState({ id: 's', badges: [], route: [{ x: 32, y: 3, pauseMs: 0 }] }), x: 32.5, z: 3.6 };
    let m = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, 30);
    expect(m.holdProgressMs).toBeGreaterThan(0);
    m = stepMission(m, AT_PLANT, IDLE, ctx({ interactHeld: true, staff: [staff] }));
    expect(m.holdProgressMs).toBe(0);
  });

  it('cancels when interact is released', () => {
    let m = drive(createMissionState(), AT_PLANT, IDLE, { interactHeld: true }, 30);
    m = stepMission(m, AT_PLANT, IDLE, ctx({ interactHeld: false }));
    expect(m.holdProgressMs).toBe(0);
  });
});

describe('the photo secondaries', () => {
  it('complete after the shorter 1-second hold', () => {
    const photo = MISSION.photos[0];
    const atPhoto: PlayerState = { x: photo.x, z: photo.z + 1, facingYaw: 0 };
    const ticks = Math.ceil(MISSION.photoHoldMs / STEP_MS) + 1;
    const after = drive(createMissionState(), atPhoto, IDLE, { interactHeld: true }, ticks);
    expect(after.photos[photo.id]).not.toBeNull();
    expect(after.plantedAtMs).toBeNull(); // photo is a secondary, not the plant
  });
});

describe('exfil and dawn', () => {
  it('exfils once the device is planted and the player reaches the lift lobby', () => {
    const planted: MissionState = { ...createMissionState(), plantedAtMs: 5000 };
    const atExfil: PlayerState = { x: MISSION.exfil.x, z: MISSION.exfil.z, facingYaw: 0 };
    const after = stepMission(planted, atExfil, IDLE, ctx({ interactHeld: false, simTimeMs: 60000 }));
    expect(after.phase).toBe('exfilled');
    expect(after.exfilledAtMs).toBe(60000);
  });

  it('does not exfil before the device is planted', () => {
    const atExfil: PlayerState = { x: MISSION.exfil.x, z: MISSION.exfil.z, facingYaw: 0 };
    const after = stepMission(createMissionState(), atExfil, IDLE, ctx({ interactHeld: false }));
    expect(after.phase).toBe('infiltrating');
  });

  it('falls to the dawn outcome at the deadline while still infiltrating', () => {
    const after = stepMission(createMissionState(), AT_PLANT, IDLE, ctx({ interactHeld: false, simTimeMs: MISSION.dawnDeadlineMs }));
    expect(after.phase).toBe('dawn');
  });

  it('an exfil at the wire beats dawn on the same tick', () => {
    const planted: MissionState = { ...createMissionState(), plantedAtMs: 5000 };
    const atExfil: PlayerState = { x: MISSION.exfil.x, z: MISSION.exfil.z, facingYaw: 0 };
    const after = stepMission(planted, atExfil, IDLE, ctx({ interactHeld: false, simTimeMs: MISSION.dawnDeadlineMs }));
    expect(after.phase).toBe('exfilled');
  });
});

describe('passive trackers', () => {
  it('marks everSpotted when a guard reaches alert, and tracks the max alert level', () => {
    const events: GuardEvent[] = [{ type: 'stateChanged', guardId: 'g', from: 'searching', to: 'alert' }];
    const after = stepMission(createMissionState(), AT_PLANT, IDLE, ctx({ interactHeld: false, events, alertLevel: 2 }));
    expect(after.everSpotted).toBe(true);
    expect(after.maxAlertLevel).toBe(2);
  });

  it('counts a bolt thrown this tick', () => {
    const after = stepMission(createMissionState(), AT_PLANT, IDLE, ctx({ interactHeld: false, boltThrownThisTick: true }));
    expect(after.boltsThrown).toBe(1);
  });

  it('records the ingress route once, the first time the player stands in an open ingress door', () => {
    const atLift: PlayerState = { x: 9.5, z: 11.5, facingYaw: 0 };
    const overrides = new Map([['9,11', true]]);
    let m = stepMission(createMissionState(), atLift, IDLE, ctx({ interactHeld: false, doorOverrides: overrides, simTimeMs: 21000 }));
    expect(m.ingressRoute).toBe('lift');
    expect(m.ingressAtMs).toBe(21000);
    // A later different door does not overwrite it.
    m = stepMission(m, { x: 6.5, z: 11.5, facingYaw: 0 }, IDLE, ctx({ interactHeld: false, doorOverrides: new Map([['6,11', true]]), simTimeMs: 25000 }));
    expect(m.ingressRoute).toBe('lift');
  });

  it('sets the entry checkpoint the first time the player crosses onto the floor proper', () => {
    const onFloor: PlayerState = { x: 20.5, z: 9.5, facingYaw: 0 }; // corridor spine, y=9 <= 10
    const after = stepMission(createMissionState(), onFloor, IDLE, ctx({ interactHeld: false, simTimeMs: 3000 }));
    expect(after.enteredFloorAtMs).toBe(3000);
    expect(after.checkpoint).toEqual({ x: 20.5, z: 9.5 });
  });

  it('is a no-op once the mission is over', () => {
    const done: MissionState = { ...createMissionState(), phase: 'exfilled' };
    const after = stepMission(done, AT_PLANT, IDLE, ctx({ interactHeld: true, boltThrownThisTick: true }));
    expect(after).toBe(done); // same reference, unchanged
  });
});

describe('restartAtCheckpoint', () => {
  const guardRoutes = (guardsData as GuardsData).guards;
  const staffRoutes = (staffData as StaffData).staff;
  const env = { level, guardRoutes, staffRoutes };

  function huntStateWith(mission: MissionState): HuntState {
    return {
      player: { x: 25, z: 5, facingYaw: 1 },
      guards: guardRoutes.map(createGuardState).map((g) => ({ ...g, x: 99, z: 99, state: 'alert' as const })),
      alertLevel: { level: 2, msSinceIncident: 0 },
      simTimeMs: 45000,
      doors: level.doors.map(createDoorState),
      staff: staffRoutes.map(createStaffState),
      bolts: [],
      mission,
    };
  }

  it('returns the player to the checkpoint, preserving alert, clock, and mission facts, and increments detains', () => {
    const mission: MissionState = { ...createMissionState(), plantedAtMs: 8000, checkpoint: { x: 32.5, z: 3.5 }, detains: 0, maxAlertLevel: 2 };
    const restarted = restartAtCheckpoint(huntStateWith(mission), env);

    expect(restarted.player).toEqual({ x: 32.5, z: 3.5, facingYaw: 0 });
    expect(restarted.alertLevel).toEqual({ level: 2, msSinceIncident: 0 }); // preserved
    expect(restarted.simTimeMs).toBe(45000); // clock keeps running
    expect(restarted.mission.plantedAtMs).toBe(8000); // plant preserved
    expect(restarted.mission.detains).toBe(1); // incremented
    expect(restarted.bolts).toEqual([]);
    // Guards reset to their patrol start (not the alert positions we forced).
    expect(restarted.guards[0].state).toBe('patrol');
    expect(restarted.guards[0].x).not.toBe(99);
  });

  it('restarts at the lift-lobby spawn when no checkpoint has been reached yet', () => {
    const mission: MissionState = { ...createMissionState(), checkpoint: null };
    const restarted = restartAtCheckpoint(huntStateWith(mission), env);
    expect(restarted.player.x).toBeCloseTo((level.playerStart.x + 0.5) * level.cellSize, 5);
    expect(restarted.player.z).toBeCloseTo((level.playerStart.y + 0.5) * level.cellSize, 5);
  });
});
