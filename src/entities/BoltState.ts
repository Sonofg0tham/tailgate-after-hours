/**
 * A single thrown bolt in flight (or landed). Deliberately flat, plain-data
 * sim state, same shape discipline as PlayerState/GuardState — it has to
 * thread through stepHunt/replay the same way, so a thrown bolt in a
 * recorded run always lands on exactly the same cell.
 */
export interface BoltState {
  id: number;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  landed: boolean;
}

export function createBolt(id: number, startX: number, startZ: number, targetX: number, targetZ: number): BoltState {
  return { id, x: startX, z: startZ, targetX, targetZ, landed: false };
}
