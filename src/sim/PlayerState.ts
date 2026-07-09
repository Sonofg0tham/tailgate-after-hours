/**
 * Everything about the player the simulation needs to reproduce exactly.
 * Deliberately minimal for Phase 1: position and facing are the whole of it,
 * since there's no health, inventory, or anything else stateful yet.
 */
export interface PlayerState {
  x: number;
  z: number;
  facingYaw: number;
}
