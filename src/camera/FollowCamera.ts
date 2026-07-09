import * as THREE from 'three';
import { MOVEMENT } from '../config/movement';

/**
 * Fixed-tilt overhead follow camera: it never rotates (out of scope for v1
 * per CLAUDE.md), eases toward the player with a lerp, and allows bounded
 * zoom via the scroll wheel. The tilt angle and distance are picked by eye
 * for the greybox room, not tuned.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;

  private readonly tiltRadians = THREE.MathUtils.degToRad(55);
  private distance = 7;
  private readonly minDistance = 4;
  private readonly maxDistance = 12;
  private readonly target = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);

    window.addEventListener(
      'wheel',
      (event) => {
        this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.01, this.minDistance, this.maxDistance);
      },
      { passive: true },
    );
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Eases the camera toward a framing centred on the given world position. */
  follow(targetX: number, targetZ: number): void {
    this.target.set(targetX, 0, targetZ);

    const offsetZ = Math.cos(this.tiltRadians) * this.distance;
    const offsetY = Math.sin(this.tiltRadians) * this.distance;
    const desired = new THREE.Vector3(targetX, offsetY, targetZ + offsetZ);

    if (!this.initialised) {
      this.camera.position.copy(desired);
      this.initialised = true;
    } else {
      this.camera.position.lerp(desired, MOVEMENT.camera.lerp);
    }

    this.camera.lookAt(this.target.x, 1, this.target.z);
  }
}
