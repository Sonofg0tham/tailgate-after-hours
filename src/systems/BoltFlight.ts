import { THROW } from '../config/throw';
import type { BoltState } from '../entities/BoltState';

/**
 * One deterministic tick of a bolt's straight-line flight toward its landing
 * point. Once `landed` it's a no-op — the caller (stepHunt) fires the
 * landing-noise investigate-override exactly once, on the tick `landed`
 * first flips true, then leaves the bolt in place as a spent marker.
 */
export function stepBolt(bolt: BoltState, dtSeconds: number): BoltState {
  if (bolt.landed) {
    return bolt;
  }

  const dx = bolt.targetX - bolt.x;
  const dz = bolt.targetZ - bolt.z;
  const dist = Math.hypot(dx, dz);
  const moveDist = THROW.boltSpeedMetresPerSecond * dtSeconds;

  if (moveDist >= dist) {
    return { ...bolt, x: bolt.targetX, z: bolt.targetZ, landed: true };
  }

  return { ...bolt, x: bolt.x + (dx / dist) * moveDist, z: bolt.z + (dz / dist) * moveDist };
}
