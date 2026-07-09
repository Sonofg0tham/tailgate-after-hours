export interface StaffWaypoint {
  x: number;
  y: number;
  pauseMs: number;
}

export interface StaffRoute {
  id: string;
  /** Door ids (matching src/world/level.ts's DoorKindDef.id) this person is authorised to badge through. */
  badges: string[];
  route: StaffWaypoint[];
}

/** The raw shape of src/data/staff.json. */
export interface StaffData {
  staff: StaffRoute[];
}

/**
 * Everything about one cleaner the simulation needs to reproduce exactly —
 * the staff equivalent of GuardState.ts. No vision, no suspicion, no state
 * machine: a cleaner only ever walks its loop and badges doors it's
 * authorised for. Cover and door-opener, nothing more (per CLAUDE.md/
 * GAME_DESIGN.md — "not a guard").
 */
export interface StaffState {
  id: string;
  x: number;
  z: number;
  facingYaw: number;
  routeIndex: number;
  pauseRemainingMs: number;
}

/**
 * Validates every waypoint sits on a walkable cell — same discipline as
 * GuardState.ts's validateGuardRoutes, so a hand-edit mistake in staff.json
 * fails loudly at load instead of a cleaner silently getting stuck.
 */
export function validateStaffRoutes(data: StaffData, isWalkable: (x: number, y: number) => boolean): void {
  for (const staffRoute of data.staff) {
    for (const waypoint of staffRoute.route) {
      if (!isWalkable(waypoint.x, waypoint.y)) {
        throw new Error(`Staff "${staffRoute.id}" has a waypoint at (${waypoint.x}, ${waypoint.y}) that isn't walkable`);
      }
    }
  }
}

export function createStaffState(routeDef: StaffRoute): StaffState {
  const first = routeDef.route[0];
  return {
    id: routeDef.id,
    x: first.x + 0.5,
    z: first.y + 0.5,
    facingYaw: 0,
    routeIndex: 0,
    pauseRemainingMs: 0,
  };
}
