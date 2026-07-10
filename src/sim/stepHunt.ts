import { DETECTION } from '../config/detection';
import { THROW } from '../config/throw';
import { noiseRadius } from '../systems/Noise';
import { stepPlayer } from './step';
import { stepGuard, type GuardEvent, type StepGuardContext } from '../entities/GuardStateMachine';
import { stepStaff } from '../systems/StaffMovement';
import { stepBolt } from '../systems/BoltFlight';
import { createBolt, type BoltState } from '../entities/BoltState';
import { applyStaffBadges, closedDoorWallBounds, doorOpenLookup, type DoorRuntimeState } from '../systems/DoorState';
import { stepMission, restartAtCheckpoint } from './stepMission';
import type { GuardRoute, GuardState, PatrolWaypoint } from '../entities/GuardState';
import type { StaffRoute, StaffState } from '../entities/StaffState';
import type { MissionState } from './MissionState';
import type { PlayerState } from './PlayerState';
import type { MovementIntent } from '../input/InputState';
import { surfaceAt, type ParsedLevel } from '../world/level';
import type { WallBounds } from '../physics/CapsuleCollider';

export interface AlertLevelState {
  level: 0 | 1 | 2;
  msSinceIncident: number;
}

export interface HuntState {
  player: PlayerState;
  guards: GuardState[];
  alertLevel: AlertLevelState;
  /** Absolute sim clock, ms since the run started — what door schedules (src/systems/DoorState.ts) run against. */
  simTimeMs: number;
  doors: DoorRuntimeState[];
  staff: StaffState[];
  /** Every bolt ever thrown this run, landed ones kept as spent markers. Length also doubles as "bolts thrown so far" against THROW.boltCount. */
  bolts: BoltState[];
  /** Objective/checkpoint/exfil/dawn progress — see src/sim/MissionState.ts. Lives here so replay reproduces the whole mission. */
  mission: MissionState;
}

export interface HuntEnvironment {
  level: ParsedLevel;
  lightGrid: number[][];
  wallBounds: readonly WallBounds[];
  /** Each guard's route, indexed the same as `state.guards`. */
  routes: PatrolWaypoint[][];
  /** Each guard's full route def (id + start index), for resetting guards on a checkpoint restart. Indexed the same as `state.guards`. */
  guardRoutes: GuardRoute[];
  /** Each cleaner's def (route + badges), indexed the same as `state.staff`. */
  staffRoutes: StaffRoute[];
}

/** alertLevel at which badge/smokers doors stop honouring badges/schedule and lock shut — ported from Tailgate's Door.ts lockdown check. */
const LOCKDOWN_ALERT_LEVEL = 2;

/**
 * One deterministic tick of the whole hunt: doors first (this tick's
 * open/closed snapshot), then player, staff, guards and bolts against that
 * snapshot, then staff badge doors for NEXT tick from their new positions.
 * Same "pure function of state+input+dt" discipline as Phase 2 — replaying
 * the same recorded log through this function reproduces every door,
 * cleaner, guard and bolt trajectory exactly. See determinism.test.ts.
 */
export function stepHunt(
  state: HuntState,
  intent: MovementIntent,
  throwAction: { x: number; z: number } | null,
  interactHeld: boolean,
  env: HuntEnvironment,
  dtSeconds: number,
  dtMs: number,
): { state: HuntState; events: GuardEvent[] } {
  const lockdown = state.alertLevel.level >= LOCKDOWN_ALERT_LEVEL;
  const doorOverrides = doorOpenLookup(env.level, state.doors, state.simTimeMs, lockdown);
  const wallBounds = [...env.wallBounds, ...closedDoorWallBounds(env.level, state.doors, state.simTimeMs, lockdown)];

  const player = stepPlayer(state.player, intent, dtSeconds, wallBounds);

  const staff = state.staff.map((s, i) => stepStaff(s, { wallBounds, route: env.staffRoutes[i].route, dtSeconds }));

  const steppedBolts = state.bolts.map((b) => stepBolt(b, dtSeconds));
  const newlyLanded = steppedBolts.filter((b, i) => b.landed && !state.bolts[i].landed);
  const bolts =
    throwAction && steppedBolts.length < THROW.boltCount
      ? [...steppedBolts, createBolt(steppedBolts.length, player.x, player.z, throwAction.x, throwAction.z)]
      : steppedBolts;

  const footstepRadius = noiseRadius(intent.speed, surfaceAt(env.level, player.x, player.z));

  const allEvents: GuardEvent[] = [];
  const guards = state.guards.map((guard, i) => {
    const ctx: StepGuardContext = {
      level: env.level,
      lightGrid: env.lightGrid,
      wallBounds,
      route: env.routes[i],
      player,
      playerIntent: intent,
      alertLevel: state.alertLevel.level,
      dtSeconds,
      dtMs,
      doorOverrides,
      investigateOverride: computeInvestigateOverride(guard, player, footstepRadius, newlyLanded),
    };
    const result = stepGuard(guard, ctx);
    allEvents.push(...result.events);
    return result.guard;
  });

  const alertLevel = stepAlertLevel(state.alertLevel, allEvents, dtMs);
  const simTimeMs = state.simTimeMs + dtMs;
  const doors = applyStaffBadges(env.level, state.doors, staff, env.staffRoutes, simTimeMs, lockdown);

  const mission = stepMission(state.mission, player, intent, {
    level: env.level,
    doorOverrides,
    guards,
    staff,
    alertLevel: alertLevel.level,
    simTimeMs,
    dtMs,
    interactHeld,
    boltThrownThisTick: bolts.length > state.bolts.length,
    events: allEvents,
  });

  const stepped: HuntState = { player, guards, alertLevel, simTimeMs, doors, staff, bolts, mission };

  // A detain restarts at the last checkpoint — but only while the mission is
  // still live (an exfil/dawn on the same tick wins). The restart preserves
  // alert, clock and every mission fact, incrementing the detain tally, so
  // the whole checkpoint loop stays inside the deterministic fold.
  if (mission.phase === 'infiltrating' && allEvents.some((e) => e.type === 'detain')) {
    return {
      state: restartAtCheckpoint(stepped, {
        level: env.level,
        guardRoutes: env.guardRoutes,
        staffRoutes: env.staffRoutes,
      }),
      events: allEvents,
    };
  }

  return { state: stepped, events: allEvents };
}

/**
 * What this guard should investigate this tick, if anything: a bolt that
 * just landed within earshot takes priority, then the player's own
 * footsteps if the guard is within their current noise radius. Tailgate-
 * witnessing is NOT handled here — stepGuard checks that itself (it only
 * needs this guard's own line of sight, computed inside stepGuard already).
 */
function computeInvestigateOverride(
  guard: GuardState,
  player: PlayerState,
  footstepRadius: number,
  newlyLandedBolts: readonly BoltState[],
): { x: number; z: number } | null {
  for (const bolt of newlyLandedBolts) {
    if (Math.hypot(bolt.x - guard.x, bolt.z - guard.z) <= THROW.noiseRadiusMetres) {
      return { x: bolt.x, z: bolt.z };
    }
  }
  if (footstepRadius > 0 && Math.hypot(player.x - guard.x, player.z - guard.z) <= footstepRadius) {
    return { x: player.x, z: player.z };
  }
  return null;
}

/** Radio calls raise the level by one (capped at 2); level 1 decays after a minute of quiet, level 2 never decays. */
function stepAlertLevel(current: AlertLevelState, events: GuardEvent[], dtMs: number): AlertLevelState {
  const radioed = events.some((e) => e.type === 'radioCall');
  if (radioed) {
    return { level: Math.min(2, current.level + 1) as 0 | 1 | 2, msSinceIncident: 0 };
  }

  const msSinceIncident = current.msSinceIncident + dtMs;
  if (current.level === 1 && msSinceIncident >= DETECTION.radio.level1DecayMs) {
    return { level: 0, msSinceIncident: 0 };
  }
  return { level: current.level, msSinceIncident };
}
