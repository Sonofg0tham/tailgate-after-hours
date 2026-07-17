import { DOORS } from '../config/doors';
import type { WallBounds } from '../physics/CapsuleCollider';
import type { DoorKindDef, DoorOpenLookup, ParsedLevel } from '../world/level';
import type { StaffRoute, StaffState } from '../entities/StaffState';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from '../sim/PlayerState';

export interface DoorRuntimeState {
  id: string;
  kind: DoorKindDef['kind'];
  /** ms; only meaningful for 'badge' doors — the moment the tailgate window closes. 0 = never badged, reads closed. */
  tailgateCloseAt: number;
}

export interface ClosedDoorWaitTarget {
  doorId: string;
  displayName: string;
}

export function createDoorState<T extends Pick<DoorKindDef, 'id' | 'kind'>>(def: T): DoorRuntimeState {
  return { id: def.id, kind: def.kind, tailgateCloseAt: 0 };
}

/**
 * Ported exactly from Tailgate's `Door.ts` `scheduleOpen()`: a door starts
 * closed, opens for `openForMs`, closes for `closedForMs`, repeats — with
 * `phaseMs` shifting the whole cycle so the first window can land wherever a
 * level needs it, independent of when the clock started.
 */
function scheduleOpen(nowMs: number, cfg: { openForMs: number; closedForMs: number; phaseMs: number }): boolean {
  const period = cfg.openForMs + cfg.closedForMs;
  const t = (nowMs + cfg.phaseMs) % period;
  return t >= cfg.closedForMs;
}

/**
 * Whether a door currently reads open. Ported from Tailgate's per-kind
 * switch in `Door.ts`: `badge` and `smokers` are forced shut under lockdown,
 * `lift` stays on schedule regardless (this project's goods route, standing
 * in for Tailgate's `shutter` — see src/config/doors.ts's header for why).
 */
export function isDoorOpen(state: DoorRuntimeState, nowMs: number, lockdown: boolean): boolean {
  switch (state.kind) {
    case 'badge':
      return !lockdown && nowMs < state.tailgateCloseAt;
    case 'smokers':
      return !lockdown && scheduleOpen(nowMs, DOORS.smokers);
    case 'lift':
      return scheduleOpen(nowMs, DOORS.lift);
  }
}

/**
 * A staff member standing at a badge door refreshes its tailgate window.
 * Ported from Tailgate's `Door.badge()`: a no-op for any other kind, and a
 * no-op during lockdown (an alerted building stops honouring badges).
 */
export function badgeDoor(state: DoorRuntimeState, nowMs: number, lockdown: boolean): DoorRuntimeState {
  if (state.kind !== 'badge' || lockdown) {
    return state;
  }
  return { ...state, tailgateCloseAt: nowMs + DOORS.tailgateWindowMs };
}

/**
 * The per-tick open/closed snapshot for every dynamic door, keyed "x,y" to
 * match `DoorOpenLookup` — what isSolid/blocksSight/findPath/vision consult
 * so a closed badge/smokers/lift door actually blocks movement and sight,
 * unlike Phase 1/2's static doors.
 */
export function doorOpenLookup(
  level: ParsedLevel,
  states: readonly DoorRuntimeState[],
  nowMs: number,
  lockdown: boolean,
): DoorOpenLookup {
  const lookup = new Map<string, boolean>();
  for (const def of level.doors) {
    const state = states.find((s) => s.id === def.id);
    if (!state) continue;
    lookup.set(`${def.x},${def.y}`, isDoorOpen(state, nowMs, lockdown));
  }
  return lookup;
}

/**
 * Collision boxes for any dynamic door currently closed, in the same shape
 * Extruder.ts builds for wall cells — appended to the level's static
 * wallBounds each tick so the player's capsule actually stops at a closed
 * badge/smokers/lift door instead of walking through it.
 */
export function closedDoorWallBounds(
  level: ParsedLevel,
  states: readonly DoorRuntimeState[],
  nowMs: number,
  lockdown: boolean,
): WallBounds[] {
  const { cellSize } = level;
  const bounds: WallBounds[] = [];
  for (const def of level.doors) {
    const state = states.find((s) => s.id === def.id);
    if (!state || isDoorOpen(state, nowMs, lockdown)) continue;
    const centerX = (def.x + 0.5) * cellSize;
    const centerZ = (def.y + 0.5) * cellSize;
    bounds.push({
      minX: centerX - cellSize / 2,
      maxX: centerX + cellSize / 2,
      minZ: centerZ - cellSize / 2,
      maxZ: centerZ + cellSize / 2,
    });
  }
  return bounds;
}

/**
 * Selects the nearest closed dynamic door for wait telemetry. A tick is
 * eligible only while the player has a real movement intent and their
 * post-collision centre is within one level cell size of the door centre.
 * The radius is measurement-only and does not affect collision or schedules.
 */
export function selectClosedDoorWaitTarget(
  level: ParsedLevel,
  doorOverrides: DoorOpenLookup,
  player: Pick<PlayerState, 'x' | 'z'>,
  intent: MovementIntent,
): ClosedDoorWaitTarget | null {
  const isMoving = intent.speed !== 'idle' && (intent.directionX !== 0 || intent.directionZ !== 0);
  if (!isMoving) {
    return null;
  }

  let nearest: ClosedDoorWaitTarget | null = null;
  let nearestDistance = Infinity;
  for (const door of level.doors) {
    if (doorOverrides.get(`${door.x},${door.y}`) !== false) {
      continue;
    }
    const centreX = (door.x + 0.5) * level.cellSize;
    const centreZ = (door.y + 0.5) * level.cellSize;
    const distance = Math.hypot(player.x - centreX, player.z - centreZ);
    if (distance <= level.cellSize && distance < nearestDistance) {
      nearest = { doorId: door.id, displayName: door.displayName };
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Any authorised staff member standing within `DOORS.staffBadgeDistanceMetres`
 * of a badge door's cell refreshes its tailgate window — ported from
 * Tailgate's per-frame proximity check in `BuildingScene.updateDoorsAndStaff`
 * (`STAFF_BADGE_DISTANCE`). Non-badge doors and staff with no matching
 * `badges` entry are untouched.
 */
export function applyStaffBadges(
  level: ParsedLevel,
  doorStates: readonly DoorRuntimeState[],
  staffStates: readonly StaffState[],
  staffDefs: readonly StaffRoute[],
  nowMs: number,
  lockdown: boolean,
): DoorRuntimeState[] {
  return doorStates.map((doorState) => {
    if (doorState.kind !== 'badge') {
      return doorState;
    }
    const def = level.doors.find((d) => d.id === doorState.id);
    if (!def) {
      return doorState;
    }
    const doorCenterX = def.x + 0.5;
    const doorCenterZ = def.y + 0.5;
    const nearby = staffStates.some((staff) => {
      const staffDef = staffDefs.find((s) => s.id === staff.id);
      if (!staffDef?.badges.includes(doorState.id)) {
        return false;
      }
      const dist = Math.hypot(staff.x - doorCenterX, staff.z - doorCenterZ);
      return dist <= DOORS.staffBadgeDistanceMetres;
    });
    return nearby ? badgeDoor(doorState, nowMs, lockdown) : doorState;
  });
}
