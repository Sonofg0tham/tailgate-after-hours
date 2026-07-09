export type GuardStateName = 'patrol' | 'curious' | 'searching' | 'alert' | 'sweep';

export interface PatrolWaypoint {
  x: number;
  y: number;
  pauseMs: number;
  lookYaw?: number;
}

export interface GuardRoute {
  id: string;
  startWaypointIndex: number;
  route: PatrolWaypoint[];
}

/** The raw shape of src/data/guards.json. */
export interface GuardsData {
  guards: GuardRoute[];
}

export interface GridPoint {
  x: number;
  y: number;
}

/**
 * Everything about one guard the simulation needs to reproduce exactly —
 * the guard equivalent of sim/PlayerState.ts. Deliberately flat and plain-
 * data: no class instances, nothing that isn't JSON-serialisable, so it
 * threads through stepGuard/replay the same way PlayerState does.
 */
export interface GuardState {
  id: string;
  x: number;
  z: number;
  facingYaw: number;
  state: GuardStateName;
  suspicion: number;

  /** Index into this guard's route array; the waypoint currently being walked toward or paused at. */
  routeIndex: number;
  /** Counts down while paused at a waypoint. 0 means "not paused, walking." */
  pauseRemainingMs: number;

  /** Milliseconds spent in the current state — reset to 0 on every transition. */
  msInState: number;

  /** The last position worth investigating — set entering CURIOUS, refreshed on re-sighting, cleared back in PATROL/SWEEP. */
  investigateX: number | null;
  investigateZ: number | null;
  /** The facing the look-around oscillation is centred on. */
  lookBaseYaw: number;

  /** Current A* path in grid cells, walked point by point. Null when not pathing (e.g. mid-pause). */
  path: GridPoint[] | null;
  pathIndex: number;
  /** The grid cell the current path was computed toward, so we know when a repath is actually needed. */
  pathTargetX: number | null;
  pathTargetZ: number | null;
  msSinceRepath: number;

  /** ALERT-only: ms since the player was last actually seen (0 while seen). Past alertGiveUpMs, ALERT gives up. */
  msSinceSeen: number;
  /** ALERT-only: ms of UNBROKEN current sight, reset to 0 the instant sight breaks. Drives the radio call. */
  continuousSightMs: number;
  radioedThisAlert: boolean;

  /** SWEEP-only: how many of the covered waypoints remain before standing down to PATROL. */
  sweepWaypointsRemaining: number;
}

/**
 * Validates every waypoint in every route sits on a walkable cell — the
 * guard-route equivalent of level.ts's parseLevel throwing loudly on a
 * hand-edit mistake, rather than a guard silently getting stuck against a
 * wall it was authored to stand inside.
 */
export function validateGuardRoutes(data: GuardsData, isWalkable: (x: number, y: number) => boolean): void {
  for (const guardRoute of data.guards) {
    for (const waypoint of guardRoute.route) {
      if (!isWalkable(waypoint.x, waypoint.y)) {
        throw new Error(`Guard "${guardRoute.id}" has a waypoint at (${waypoint.x}, ${waypoint.y}) that isn't walkable`);
      }
    }
  }
}

export function createGuardState(routeDef: GuardRoute): GuardState {
  const first = routeDef.route[routeDef.startWaypointIndex];
  return {
    id: routeDef.id,
    x: first.x + 0.5,
    z: first.y + 0.5,
    facingYaw: 0,
    state: 'patrol',
    suspicion: 0,
    routeIndex: routeDef.startWaypointIndex,
    pauseRemainingMs: 0,
    msInState: 0,
    investigateX: null,
    investigateZ: null,
    lookBaseYaw: 0,
    path: null,
    pathIndex: 0,
    pathTargetX: null,
    pathTargetZ: null,
    msSinceRepath: 0,
    msSinceSeen: 0,
    continuousSightMs: 0,
    radioedThisAlert: false,
    sweepWaypointsRemaining: 0,
  };
}
