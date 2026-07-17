import { MISSION } from '../config/mission';
import { DETECTION } from '../config/detection';
import { canSeePoint } from '../systems/Vision';
import { createGuardState, type GuardRoute, type GuardState } from '../entities/GuardState';
import { createStaffState, type StaffRoute, type StaffState } from '../entities/StaffState';
import { createDoorState } from '../systems/DoorState';
import { selectMissionInteractionTarget } from './MissionInteraction';
import type { GuardEvent } from '../entities/GuardStateMachine';
import type { MissionState } from './MissionState';
import type { PlayerState } from './PlayerState';
import type { MovementIntent } from '../input/InputState';
import type { DoorOpenLookup, ParsedLevel } from '../world/level';
import type { AlertLevelState, HuntState } from './stepHunt';

export interface StepMissionContext {
  level: ParsedLevel;
  /** This tick's door open/closed snapshot, keyed "x,y" — the same one movement/sight used, for ingress detection. */
  doorOverrides: DoorOpenLookup;
  /** Guards AFTER this tick's step, for the "seen while holding" cancel and the sight check. */
  guards: readonly GuardState[];
  /** Staff AFTER this tick's step, for the bump cancel. */
  staff: readonly StaffState[];
  alertLevel: 0 | 1 | 2;
  /** The sim clock AFTER this tick's increment. */
  simTimeMs: number;
  dtMs: number;
  interactHeld: boolean;
  /** True if a bolt was appended this tick (for the bolts-thrown finding). */
  boltThrownThisTick: boolean;
  events: readonly GuardEvent[];
}

/**
 * One deterministic tick of mission progress. Pure function of the mission
 * state plus this tick's world — no clocks, no I/O — so it folds through
 * replay exactly like every other piece of HuntState. A no-op once the
 * mission is over (exfilled or dawn): the caller freezes the sim then.
 */
export function stepMission(mission: MissionState, player: PlayerState, intent: MovementIntent, ctx: StepMissionContext): MissionState {
  if (mission.phase !== 'infiltrating') {
    return mission;
  }

  let next: MissionState = { ...mission };

  // --- Passive trackers (drive the rating and the report) ---------------
  if (ctx.events.some((e) => e.type === 'stateChanged' && e.to === 'alert')) {
    next.everSpotted = true;
  }
  if (ctx.alertLevel > next.maxAlertLevel) {
    next.maxAlertLevel = ctx.alertLevel;
  }
  if (ctx.boltThrownThisTick) {
    next.boltsThrown = next.boltsThrown + 1;
  }

  // --- Ingress route (first open dynamic door the player stands in) ------
  if (next.ingressRoute === null) {
    const cellX = Math.floor(player.x);
    const cellY = Math.floor(player.z);
    const door = ctx.level.doors.find((d) => d.x === cellX && d.y === cellY);
    if (door && ctx.doorOverrides.get(`${cellX},${cellY}`) === true) {
      next.ingressRoute = door.id;
      next.ingressAtMs = ctx.simTimeMs;
    }
  }

  // --- First checkpoint: crossing onto the floor proper -----------------
  if (next.enteredFloorAtMs === null && Math.floor(player.z) <= MISSION.checkpointEntryRow) {
    next.enteredFloorAtMs = ctx.simTimeMs;
    next.checkpoint = { x: player.x, z: player.z };
  }

  // --- The interact hold (plant / photo) --------------------------------
  next = stepInteractHold(next, player, intent, ctx);

  // --- Exfil (only once the device is planted) --------------------------
  if (next.plantedAtMs !== null) {
    const distToExfil = Math.hypot(player.x - MISSION.exfil.x, player.z - MISSION.exfil.z);
    if (distToExfil <= MISSION.exfilRangeMetres) {
      next.phase = 'exfilled';
      next.exfilledAtMs = ctx.simTimeMs;
      return next;
    }
  }

  // --- Dawn (checked after exfil, so a plant-and-exfil at the wire wins) -
  if (ctx.simTimeMs >= MISSION.dawnDeadlineMs) {
    next.phase = 'dawn';
  }

  return next;
}

/** Advance, complete, or cancel the current interact hold per Tailgate's rule (move/seen/bump interrupts, progress never banks). */
function stepInteractHold(mission: MissionState, player: PlayerState, intent: MovementIntent, ctx: StepMissionContext): MissionState {
  const target = selectMissionInteractionTarget(mission, player);

  const moving = intent.speed !== 'idle';
  const seen = anyGuardSees(ctx.guards, ctx.level, ctx.doorOverrides, player);
  const bumped = anyStaffBump(ctx.staff, player);
  const interrupted = moving || seen || bumped;

  if (!ctx.interactHeld || target === null || interrupted) {
    // Cancel: drop the hold, progress does not bank.
    if (mission.holdObjectiveId !== null || mission.holdProgressMs !== 0) {
      return { ...mission, holdObjectiveId: null, holdProgressMs: 0 };
    }
    return mission;
  }

  // Switching to a different objective restarts progress from zero.
  const progressMs = (mission.holdObjectiveId === target.id ? mission.holdProgressMs : 0) + ctx.dtMs;

  if (progressMs < target.holdMs) {
    return { ...mission, holdObjectiveId: target.id, holdProgressMs: progressMs };
  }

  // Completed this objective.
  const done: MissionState = { ...mission, holdObjectiveId: null, holdProgressMs: 0 };
  if (target.kind === 'plant') {
    done.plantedAtMs = ctx.simTimeMs;
    done.checkpoint = { ...MISSION.postPlantCheckpoint };
  } else {
    done.photos = { ...mission.photos, [target.id]: ctx.simTimeMs };
  }
  return done;
}

function anyGuardSees(guards: readonly GuardState[], level: ParsedLevel, doorOverrides: DoorOpenLookup, player: PlayerState): boolean {
  return guards.some((g) =>
    canSeePoint(level, g.x, g.z, g.facingYaw, player.x, player.z, DETECTION.vision.rangeCells, DETECTION.vision.fovDegrees, doorOverrides),
  );
}

function anyStaffBump(staff: readonly StaffState[], player: PlayerState): boolean {
  return staff.some((s) => Math.hypot(s.x - player.x, s.z - player.z) <= MISSION.bumpDistanceMetres);
}

export interface RestartEnvironment {
  level: ParsedLevel;
  guardRoutes: readonly GuardRoute[];
  staffRoutes: readonly StaffRoute[];
}

/**
 * Restart at the last checkpoint after a detain. The run continues: the
 * alert level, the sim clock, and every mission fact (plant, photos, ingress,
 * counters) are preserved, with the detain tally incremented; only the
 * player, guards, staff, doors and thrown bolts reset to a known state, so
 * the restart is deterministic and reproducible in replay. Player returns to
 * the checkpoint, or to the lift-lobby spawn if none has been reached yet.
 */
export function restartAtCheckpoint(state: HuntState, env: RestartEnvironment): HuntState {
  const spawn = state.mission.checkpoint ?? {
    x: (env.level.playerStart.x + 0.5) * env.level.cellSize,
    z: (env.level.playerStart.y + 0.5) * env.level.cellSize,
  };

  const alertLevel: AlertLevelState = state.alertLevel;

  return {
    player: { x: spawn.x, z: spawn.z, facingYaw: 0 },
    guards: env.guardRoutes.map(createGuardState),
    alertLevel,
    simTimeMs: state.simTimeMs,
    doors: env.level.doors.map(createDoorState),
    staff: env.staffRoutes.map(createStaffState),
    bolts: [],
    mission: {
      ...state.mission,
      detains: state.mission.detains + 1,
      holdObjectiveId: null,
      holdProgressMs: 0,
    },
  };
}
