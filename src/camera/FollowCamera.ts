import * as THREE from 'three';
import { MOVEMENT } from '../config/movement';

/** Frame-rate independent exponential ease of a scalar toward a target. */
export function easeExponential(current: number, target: number, ratePerSecond: number, deltaSeconds: number): number {
  const t = 1 - Math.exp(-ratePerSecond * deltaSeconds);
  return current + (target - current) * t;
}

/**
 * The point the camera anchor should ease toward: `target` unchanged if it's
 * within `deadzoneRadius` of `anchor`, otherwise pulled just far enough that
 * it sits exactly on the deadzone's edge. This is what makes small player
 * jitter not nudge the camera at all, while real movement still gets caught.
 */
export function deadzoneTarget(
  anchor: { x: number; z: number },
  target: { x: number; z: number },
  deadzoneRadius: number,
): { x: number; z: number } {
  const dx = target.x - anchor.x;
  const dz = target.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= deadzoneRadius) {
    return { x: anchor.x, z: anchor.z };
  }
  const pull = (distance - deadzoneRadius) / distance;
  return { x: anchor.x + dx * pull, z: anchor.z + dz * pull };
}

/**
 * Fixed-tilt overhead follow camera: never rotates (out of scope for v1 per
 * CLAUDE.md), bounded zoom via the scroll wheel. Two-part feel ported from
 * Tailgate (see MOVEMENT.camera): a deadzone-gated base follow, plus a
 * separately and more slowly eased directional look-ahead layered on top,
 * so panning ahead of the player never fights the base follow's easing.
 *
 * "Never clips through walls" is true by construction, not by containment
 * logic: at minDistance the camera's height above the floor
 * (sin(tilt) * minDistance) stays comfortably above WALL_HEIGHT (3m, see
 * Extruder.ts), so the eye can never end up below a wall's top edge — see
 * cameraHeightAboveFloor() below, which is what Extruder-consuming code
 * should assert against if either number changes.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;

  private readonly tiltRadians = THREE.MathUtils.degToRad(MOVEMENT.camera.tiltDegrees);
  private distanceMetres: number = MOVEMENT.camera.defaultDistance;
  private readonly anchor = new THREE.Vector2();
  private readonly lookAheadOffset = new THREE.Vector2();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);

    window.addEventListener(
      'wheel',
      (event) => {
        this.setDistance(this.distanceMetres + event.deltaY * 0.01);
      },
      { passive: true },
    );
  }

  /** Current follow distance in metres. Mutations go through setDistance. */
  get distance(): number {
    return this.distanceMetres;
  }

  /** Applies a live camera-distance setting without changing any other feel value. */
  setDistance(distanceMetres: number): void {
    this.distanceMetres = Number.isFinite(distanceMetres)
      ? THREE.MathUtils.clamp(distanceMetres, MOVEMENT.camera.minDistance, MOVEMENT.camera.maxDistance)
      : MOVEMENT.camera.defaultDistance;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param playerX/playerZ current player position.
   * @param moveDirX/moveDirZ current unit movement direction, or (0, 0) when idle.
   */
  follow(playerX: number, playerZ: number, moveDirX: number, moveDirZ: number, deltaSeconds: number): void {
    if (!this.initialised) {
      this.anchor.set(playerX, playerZ);
      this.initialised = true;
    }

    const deadzoned = deadzoneTarget(
      { x: this.anchor.x, z: this.anchor.y },
      { x: playerX, z: playerZ },
      MOVEMENT.camera.deadzoneRadius,
    );
    this.anchor.set(
      easeExponential(this.anchor.x, deadzoned.x, MOVEMENT.camera.followRate, deltaSeconds),
      easeExponential(this.anchor.y, deadzoned.z, MOVEMENT.camera.followRate, deltaSeconds),
    );

    const lookAheadTargetX = moveDirX * MOVEMENT.camera.lookAheadDistance;
    const lookAheadTargetZ = moveDirZ * MOVEMENT.camera.lookAheadDistance;
    this.lookAheadOffset.set(
      easeExponential(this.lookAheadOffset.x, lookAheadTargetX, MOVEMENT.camera.lookAheadRate, deltaSeconds),
      easeExponential(this.lookAheadOffset.y, lookAheadTargetZ, MOVEMENT.camera.lookAheadRate, deltaSeconds),
    );

    const framingX = this.anchor.x + this.lookAheadOffset.x;
    const framingZ = this.anchor.y + this.lookAheadOffset.y;

    const offsetZ = Math.cos(this.tiltRadians) * this.distanceMetres;
    const offsetY = Math.sin(this.tiltRadians) * this.distanceMetres;
    this.camera.position.set(framingX, offsetY, framingZ + offsetZ);
    this.camera.lookAt(framingX, 1, framingZ);
  }
}

/** Camera eye height above the floor at a given distance and tilt — see the class doc above. */
export function cameraHeightAboveFloor(distance: number, tiltDegrees: number): number {
  return Math.sin(THREE.MathUtils.degToRad(tiltDegrees)) * distance;
}
