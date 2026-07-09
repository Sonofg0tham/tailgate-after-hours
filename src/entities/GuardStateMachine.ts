import { DETECTION } from '../config/detection';
import { GUARD } from '../config/guard';
import { MOVEMENT } from '../config/movement';
import { canSeePoint } from '../systems/Vision';
import { stepSuspicion } from '../systems/Suspicion';
import { lightLevelAtWorld } from '../systems/LightModel';
import { findPath, type GridPoint } from '../systems/Pathfinding';
import { stepFacing } from '../character/FacingController';
import { resolveCollision, type WallBounds } from '../physics/CapsuleCollider';
import type { ParsedLevel } from '../world/level';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from '../sim/PlayerState';
import type { GuardState, GuardStateName, PatrolWaypoint } from './GuardState';

/**
 * The five-state guard AI. Tailgate only ever built three states (patrol/
 * curious/alert — verified against its actual source, not the design doc's
 * "unchanged" paraphrase) with no SEARCHING and no real SWEEP; "sweep" there
 * meant permanent extra patrol nodes at raised alert level, not a state a
 * guard passes through. GAME_DESIGN.md's five states for the 3D version are
 * new design work built on Tailgate's real numbers and real "curious"
 * behaviour, mapped like this:
 *
 *   PATROL    — normal route, steady beam. Ported directly.
 *   CURIOUS   — NEW: a first-notice pause-and-look at the current spot
 *               (curiousThreshold reached). Doesn't move yet — low
 *               commitment. This is what Tailgate never had: a "hang on"
 *               beat before committing to search.
 *   SEARCHING — this IS Tailgate's actual "curious" behaviour (move to the
 *               suspicious point, look around there), renamed and given its
 *               own state because CURIOUS now exists as something lighter.
 *               Capped at maxSearchMs (Tailgate's maxCuriousMs, 9000ms).
 *   ALERT     — direct sight, hard chase. Ported: radio-after-3s-unbroken-
 *               sight, 4s give-up-on-losing-sight, detain radius.
 *   SWEEP     — NEW: after losing a search or a chase, walk the guard's own
 *               next few real route waypoints at a brisker pace before
 *               formally standing down to PATROL — a widened last check,
 *               reusing the existing route data rather than inventing a
 *               second waypoint system.
 *
 * Transitions: PATROL→CURIOUS (suspicion≥45) →SEARCHING (pause completes,
 * suspicion>0) or →PATROL (decayed to 0). SEARCHING→ALERT (suspicion≥100,
 * i.e. direct sight) or →SWEEP (maxSearchMs elapsed). ALERT→SEARCHING
 * (sight lost ≥4s) or detains on contact. SWEEP→ALERT (spotted again) or
 * →PATROL (sweep complete). Every number after "NEW:" above is a feel
 * judgement, not a physics fact — see the Phase 2 PR for the full list.
 */

export interface StepGuardContext {
  level: ParsedLevel;
  lightGrid: number[][];
  wallBounds: readonly WallBounds[];
  route: PatrolWaypoint[];
  player: PlayerState;
  playerIntent: MovementIntent;
  alertLevel: 0 | 1 | 2;
  dtSeconds: number;
  dtMs: number;
}

export type GuardEvent =
  | { type: 'stateChanged'; guardId: string; from: GuardStateName; to: GuardStateName }
  | { type: 'radioCall'; guardId: string }
  | { type: 'detain'; guardId: string };

interface Sight {
  canSee: boolean;
  distanceMetres: number;
  playerLightLevel: number;
}

export function stepGuard(guard: GuardState, ctx: StepGuardContext): { guard: GuardState; events: GuardEvent[] } {
  const distanceMetres = Math.hypot(ctx.player.x - guard.x, ctx.player.z - guard.z);
  const canSee = canSeePoint(
    ctx.level,
    guard.x,
    guard.z,
    guard.facingYaw,
    ctx.player.x,
    ctx.player.z,
    DETECTION.vision.rangeCells,
    DETECTION.vision.fovDegrees,
  );
  const playerLightLevel = lightLevelAtWorld(ctx.lightGrid, ctx.level.cellSize, ctx.player.x, ctx.player.z);
  const newSuspicion = stepSuspicion(
    guard.suspicion,
    { seen: canSee, distanceCells: distanceMetres, speed: ctx.playerIntent.speed, lightLevel: playerLightLevel },
    ctx.dtSeconds,
  );
  const sight: Sight = { canSee, distanceMetres, playerLightLevel };

  const events: GuardEvent[] = [];
  if (distanceMetres <= DETECTION.detainRadiusMetres) {
    events.push({ type: 'detain', guardId: guard.id });
  }

  const result = dispatch(guard, ctx, newSuspicion, sight);
  return { guard: result.guard, events: [...events, ...result.events] };
}

function dispatch(
  guard: GuardState,
  ctx: StepGuardContext,
  newSuspicion: number,
  sight: Sight,
): { guard: GuardState; events: GuardEvent[] } {
  switch (guard.state) {
    case 'patrol':
      return handlePatrol(guard, ctx, newSuspicion);
    case 'curious':
      return handleCurious(guard, ctx, newSuspicion, sight);
    case 'searching':
      return handleSearching(guard, ctx, newSuspicion);
    case 'alert':
      return handleAlert(guard, ctx, newSuspicion, sight);
    case 'sweep':
      return handleSweep(guard, ctx, newSuspicion);
  }
}

// --- Per-state handlers -----------------------------------------------

function handlePatrol(guard: GuardState, ctx: StepGuardContext, newSuspicion: number) {
  if (newSuspicion >= DETECTION.suspicion.curiousThreshold) {
    return enterState(guard, 'curious', ctx, { suspicion: newSuspicion });
  }

  const msInState = guard.msInState + ctx.dtMs;
  const waypoint = ctx.route[guard.routeIndex];

  if (guard.pauseRemainingMs > 0) {
    const remaining = Math.max(0, guard.pauseRemainingMs - ctx.dtMs);
    const facingYaw = waypoint.lookYaw ?? guard.facingYaw;
    if (remaining === 0) {
      const nextIndex = (guard.routeIndex + 1) % ctx.route.length;
      return {
        guard: { ...guard, routeIndex: nextIndex, pauseRemainingMs: 0, facingYaw, suspicion: newSuspicion, msInState },
        events: [],
      };
    }
    return { guard: { ...guard, pauseRemainingMs: remaining, facingYaw, suspicion: newSuspicion, msInState }, events: [] };
  }

  const steer = steerToward(guard.x, guard.z, waypoint.x + 0.5, waypoint.y + 0.5, GUARD.patrolSpeed, ctx);
  const facingYaw = stepFacing(guard.facingYaw, steer.arrived ? null : steer.headingYaw, ctx.dtSeconds);

  if (steer.arrived) {
    return {
      guard: {
        ...guard,
        x: steer.x,
        z: steer.z,
        facingYaw,
        pauseRemainingMs: Math.max(1, waypoint.pauseMs),
        suspicion: newSuspicion,
        msInState,
      },
      events: [],
    };
  }
  return { guard: { ...guard, x: steer.x, z: steer.z, facingYaw, suspicion: newSuspicion, msInState }, events: [] };
}

function handleCurious(guard: GuardState, ctx: StepGuardContext, newSuspicion: number, sight: Sight) {
  if (newSuspicion >= DETECTION.suspicion.alertAt) {
    return enterState(guard, 'alert', ctx, { suspicion: newSuspicion });
  }

  const msInState = guard.msInState + ctx.dtMs;
  const investigateX = sight.canSee ? ctx.player.x : guard.investigateX;
  const investigateZ = sight.canSee ? ctx.player.z : guard.investigateZ;
  const facingYaw = lookAroundYaw(guard.lookBaseYaw, msInState);

  if (msInState >= DETECTION.timing.curiousPauseMs) {
    if (newSuspicion > 0) {
      return enterState(guard, 'searching', ctx, { suspicion: newSuspicion, investigateX, investigateZ });
    }
    return enterState(guard, 'patrol', ctx, { suspicion: newSuspicion });
  }

  return { guard: { ...guard, facingYaw, suspicion: newSuspicion, msInState, investigateX, investigateZ }, events: [] };
}

function handleSearching(guard: GuardState, ctx: StepGuardContext, newSuspicion: number) {
  if (newSuspicion >= DETECTION.suspicion.alertAt) {
    return enterState(guard, 'alert', ctx, { suspicion: newSuspicion });
  }

  const msInState = guard.msInState + ctx.dtMs;
  if (msInState >= DETECTION.timing.maxSearchMs) {
    return enterState(guard, 'sweep', ctx, { suspicion: newSuspicion });
  }

  const targetX = guard.investigateX ?? guard.x;
  const targetZ = guard.investigateZ ?? guard.z;
  const distToTarget = Math.hypot(targetX - guard.x, targetZ - guard.z);

  if (distToTarget < GUARD.arrivalThreshold) {
    const facingYaw = lookAroundYaw(guard.lookBaseYaw, msInState);
    return { guard: { ...guard, facingYaw, path: null, suspicion: newSuspicion, msInState }, events: [] };
  }

  const pathed = followPath(guard, ctx, targetX, targetZ, GUARD.patrolSpeed);
  return { guard: { ...pathed, suspicion: newSuspicion, msInState }, events: [] };
}

function handleAlert(guard: GuardState, ctx: StepGuardContext, newSuspicion: number, sight: Sight) {
  const events: GuardEvent[] = [];
  const msInState = guard.msInState + ctx.dtMs;
  const msSinceSeen = sight.canSee ? 0 : guard.msSinceSeen + ctx.dtMs;
  const continuousSightMs = sight.canSee ? guard.continuousSightMs + ctx.dtMs : 0;
  let radioedThisAlert = guard.radioedThisAlert;

  if (sight.canSee && continuousSightMs >= DETECTION.radio.radioAfterMs && !radioedThisAlert) {
    radioedThisAlert = true;
    events.push({ type: 'radioCall', guardId: guard.id });
  }

  if (msSinceSeen >= DETECTION.timing.alertGiveUpMs) {
    const result = enterState(
      { ...guard, msSinceSeen, continuousSightMs, radioedThisAlert },
      'searching',
      ctx,
      { suspicion: newSuspicion, investigateX: ctx.player.x, investigateZ: ctx.player.z },
    );
    return { guard: result.guard, events: [...events, ...result.events] };
  }

  const speed = GUARD.patrolSpeed * DETECTION.chaseSpeedMultiplier * alertSpeedMultiplier(ctx.alertLevel);
  const pathed = followPath(guard, ctx, ctx.player.x, ctx.player.z, speed);

  return {
    guard: { ...pathed, suspicion: newSuspicion, msInState, msSinceSeen, continuousSightMs, radioedThisAlert },
    events,
  };
}

function handleSweep(guard: GuardState, ctx: StepGuardContext, newSuspicion: number) {
  if (newSuspicion >= DETECTION.suspicion.alertAt) {
    return enterState(guard, 'alert', ctx, { suspicion: newSuspicion });
  }

  const msInState = guard.msInState + ctx.dtMs;
  if (guard.sweepWaypointsRemaining <= 0 || msInState >= DETECTION.timing.sweepDurationMs) {
    return enterState(guard, 'patrol', ctx, { suspicion: newSuspicion });
  }

  const waypoint = ctx.route[guard.routeIndex];
  const speed = GUARD.patrolSpeed * GUARD.sweepSpeedMultiplier;
  const steer = steerToward(guard.x, guard.z, waypoint.x + 0.5, waypoint.y + 0.5, speed, ctx);
  const facingYaw = stepFacing(guard.facingYaw, steer.arrived ? null : steer.headingYaw, ctx.dtSeconds);

  if (steer.arrived) {
    const nextIndex = (guard.routeIndex + 1) % ctx.route.length;
    return {
      guard: {
        ...guard,
        x: steer.x,
        z: steer.z,
        facingYaw,
        routeIndex: nextIndex,
        sweepWaypointsRemaining: guard.sweepWaypointsRemaining - 1,
        suspicion: newSuspicion,
        msInState,
      },
      events: [],
    };
  }
  return { guard: { ...guard, x: steer.x, z: steer.z, facingYaw, suspicion: newSuspicion, msInState }, events: [] };
}

/**
 * Which of the guard's three clips (no crouch — guards never creep) should
 * be playing right now. Purely derived from state, no extra fields needed:
 * PATROL/SWEEP walk unless paused at a waypoint; SEARCHING walks while
 * pathing and idles once arrived (path is cleared on arrival, see
 * handleSearching); CURIOUS always idles (it's a look-around in place);
 * ALERT always runs.
 */
export function guardAnimationState(guard: GuardState): 'idle' | 'walk' | 'run' {
  switch (guard.state) {
    case 'alert':
      return 'run';
    case 'curious':
      return 'idle';
    case 'searching':
      return guard.path === null ? 'idle' : 'walk';
    case 'sweep':
      return 'walk';
    case 'patrol':
      return guard.pauseRemainingMs > 0 ? 'idle' : 'walk';
  }
}

/** Steady beam for patrol/sweep, flicker for the two investigate states, locked+red for alert. */
export function beamAppearanceFor(state: GuardStateName): 'steady' | 'flicker' | 'locked' {
  if (state === 'alert') return 'locked';
  if (state === 'curious' || state === 'searching') return 'flicker';
  return 'steady';
}

// --- Shared helpers ------------------------------------------------------

function enterState(
  guard: GuardState,
  newState: GuardStateName,
  ctx: StepGuardContext,
  overrides: Partial<GuardState>,
): { guard: GuardState; events: GuardEvent[] } {
  const events: GuardEvent[] = [{ type: 'stateChanged', guardId: guard.id, from: guard.state, to: newState }];

  let extra: Partial<GuardState> = {};
  if (newState === 'sweep') {
    extra = {
      routeIndex: findNearestWaypointIndex(ctx.route, guard.x, guard.z),
      sweepWaypointsRemaining: GUARD.sweepWaypointCount,
      path: null,
    };
  } else if (newState === 'curious') {
    extra = { lookBaseYaw: guard.facingYaw };
  } else if (newState === 'searching') {
    extra = { path: null, msSinceRepath: Infinity };
  } else if (newState === 'alert') {
    extra = { msSinceSeen: 0, continuousSightMs: 0, radioedThisAlert: false, path: null, msSinceRepath: Infinity };
  } else if (newState === 'patrol') {
    extra = {
      path: null,
      pathIndex: 0,
      pathTargetX: null,
      pathTargetZ: null,
      investigateX: null,
      investigateZ: null,
      pauseRemainingMs: 0,
    };
  }

  return {
    guard: { ...guard, ...overrides, ...extra, state: newState, msInState: 0 },
    events,
  };
}

function findNearestWaypointIndex(route: readonly PatrolWaypoint[], x: number, z: number): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i++) {
    const dist = Math.hypot(route[i].x + 0.5 - x, route[i].y + 0.5 - z);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Ported exactly from Tailgate's curious look-around: base facing plus a sine sweep. */
function lookAroundYaw(baseYaw: number, msInState: number): number {
  return baseYaw + Math.sin(msInState / GUARD.lookAround.periodMs) * GUARD.lookAround.amplitudeRadians;
}

function alertSpeedMultiplier(alertLevel: 0 | 1 | 2): number {
  if (alertLevel === 2) return DETECTION.radio.level2SpeedMultiplier;
  if (alertLevel === 1) return DETECTION.radio.level1SpeedMultiplier;
  return 1;
}

interface SteerResult {
  x: number;
  z: number;
  arrived: boolean;
  headingYaw: number;
}

/** Direct steering toward a point, same collision path as the player (src/sim/step.ts). */
function steerToward(x: number, z: number, targetX: number, targetZ: number, speed: number, ctx: StepGuardContext): SteerResult {
  const dx = targetX - x;
  const dz = targetZ - z;
  const dist = Math.hypot(dx, dz);
  if (dist < GUARD.arrivalThreshold) {
    return { x, z, arrived: true, headingYaw: 0 };
  }

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const moveDist = Math.min(dist, speed * ctx.dtSeconds);
  const desired = { x: x + dirX * moveDist, z: z + dirZ * moveDist };
  const resolved = resolveCollision(desired, MOVEMENT.playerRadius, ctx.wallBounds);
  return { x: resolved.x, z: resolved.z, arrived: false, headingYaw: Math.atan2(dirX, dirZ) };
}

/**
 * Follows (and, when stale, recomputes) an A* path toward a world target.
 * Shared by SEARCHING (target = last-known point) and ALERT (target = the
 * player's live position) — the only difference is what target and speed
 * the caller passes in. Repaths on a timer (GUARD.repathIntervalMs) rather
 * than every tick: A* on this grid is cheap, but there's no need to pay for
 * it 60 times a second when the target moves continuously.
 */
function followPath(guard: GuardState, ctx: StepGuardContext, targetWorldX: number, targetWorldZ: number, speed: number): GuardState {
  const targetGridX = Math.floor(targetWorldX);
  const targetGridZ = Math.floor(targetWorldZ);
  const msSinceRepath = guard.msSinceRepath + ctx.dtMs;

  let path = guard.path;
  let pathIndex = guard.pathIndex;
  let pathTargetX = guard.pathTargetX;
  let pathTargetZ = guard.pathTargetZ;
  let nextMsSinceRepath = msSinceRepath;

  const targetMoved = pathTargetX !== targetGridX || pathTargetZ !== targetGridZ;
  if (!path || targetMoved || msSinceRepath >= GUARD.repathIntervalMs) {
    const newPath = findPath(ctx.level, { x: Math.floor(guard.x), y: Math.floor(guard.z) }, { x: targetGridX, y: targetGridZ });
    if (newPath && newPath.length > 0) {
      path = newPath;
      pathIndex = 0;
      pathTargetX = targetGridX;
      pathTargetZ = targetGridZ;
    }
    nextMsSinceRepath = 0;
  }

  if (!path || path.length === 0) {
    return { ...guard, path: null, pathTargetX, pathTargetZ, msSinceRepath: nextMsSinceRepath };
  }

  const waypoint: GridPoint = path[Math.min(pathIndex, path.length - 1)];
  const steer = steerToward(guard.x, guard.z, waypoint.x + 0.5, waypoint.y + 0.5, speed, ctx);
  const facingYaw = stepFacing(guard.facingYaw, steer.arrived ? null : steer.headingYaw, ctx.dtSeconds);

  const nextPathIndex = steer.arrived && pathIndex < path.length - 1 ? pathIndex + 1 : pathIndex;

  return {
    ...guard,
    x: steer.x,
    z: steer.z,
    facingYaw,
    path,
    pathIndex: nextPathIndex,
    pathTargetX,
    pathTargetZ,
    msSinceRepath: nextMsSinceRepath,
  };
}
