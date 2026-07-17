import * as THREE from 'three';

const SEGMENTS = 16;

/**
 * The RAW range+FOV wedge, unclipped by walls — deliberately different from
 * TorchBeam's occluded fan. Overlaying both is exactly how you prove "the
 * cone cannot see through walls": the wireframe shows where the cone
 * mathematically reaches, the filled beam shows where it actually stops.
 */
export class DebugVisionCone {
  readonly mesh: THREE.LineLoop;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positionAttribute: THREE.BufferAttribute;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(new Float32Array((SEGMENTS + 2) * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.geometry.setAttribute('position', this.positionAttribute);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.mesh = new THREE.LineLoop(this.geometry, material);
    this.mesh.visible = false;
  }

  update(originX: number, originZ: number, facingYaw: number, rangeCells: number, fovDegrees: number): void {
    if (!this.mesh.visible) {
      return;
    }
    const halfFov = (fovDegrees * Math.PI) / 180 / 2;
    const points = this.positionAttribute.array as Float32Array;
    points[0] = 0;
    points[1] = 0.05;
    points[2] = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = facingYaw - halfFov + (i / SEGMENTS) * halfFov * 2;
      const offset = (i + 1) * 3;
      points[offset] = Math.sin(angle) * rangeCells;
      points[offset + 1] = 0.05;
      points[offset + 2] = Math.cos(angle) * rangeCells;
    }
    this.positionAttribute.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.position.set(originX, 0, originZ);
  }
}
