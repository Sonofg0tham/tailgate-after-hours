import { DETECTION } from '../config/detection';
import { stepPlayer } from './step';
import { stepGuard, type GuardEvent, type StepGuardContext } from '../entities/GuardStateMachine';
import type { GuardState, PatrolWaypoint } from '../entities/GuardState';
import type { PlayerState } from './PlayerState';
import type { MovementIntent } from '../input/InputState';
import type { ParsedLevel } from '../world/level';
import type { WallBounds } from '../physics/CapsuleCollider';

export interface AlertLevelState {
  level: 0 | 1 | 2;
  msSinceIncident: number;
}

export interface HuntState {
  player: PlayerState;
  guards: GuardState[];
  alertLevel: AlertLevelState;
}

export interface HuntEnvironment {
  level: ParsedLevel;
  lightGrid: number[][];
  wallBounds: readonly WallBounds[];
  /** Each guard's route, indexed the same as `state.guards`. */
  routes: PatrolWaypoint[][];
}

/**
 * One deterministic tick of the whole hunt: player, then every guard, then
 * the shared alert level. Guards have no input of their own — they're a
 * pure function of the player's position and dt, so replaying the same
 * recorded player-input log through this same function reproduces the
 * exact same guard trajectories as a side effect, with no change needed to
 * the InputLog format from Phase 1. See determinism.test.ts.
 */
export function stepHunt(
  state: HuntState,
  intent: MovementIntent,
  env: HuntEnvironment,
  dtSeconds: number,
  dtMs: number,
): { state: HuntState; events: GuardEvent[] } {
  const player = stepPlayer(state.player, intent, dtSeconds, env.wallBounds);

  const allEvents: GuardEvent[] = [];
  const guards = state.guards.map((guard, i) => {
    const ctx: StepGuardContext = {
      level: env.level,
      lightGrid: env.lightGrid,
      wallBounds: env.wallBounds,
      route: env.routes[i],
      player,
      playerIntent: intent,
      alertLevel: state.alertLevel.level,
      dtSeconds,
      dtMs,
      // TODO(Phase 3): doors/staff/bolts wiring lands together — see stepHunt's
      // upcoming doorOverrides/investigateOverride threading.
      investigateOverride: null,
    };
    const result = stepGuard(guard, ctx);
    allEvents.push(...result.events);
    return result.guard;
  });

  const alertLevel = stepAlertLevel(state.alertLevel, allEvents, dtMs);

  return { state: { player, guards, alertLevel }, events: allEvents };
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
