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

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.mesh = new THREE.LineLoop(this.geometry, material);
    this.mesh.visible = false;
  }

  update(originX: number, originZ: number, facingYaw: number, rangeCells: number, fovDegrees: number): void {
    const halfFov = (fovDegrees * Math.PI) / 180 / 2;
    const points: number[] = [0, 0.05, 0];
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = facingYaw - halfFov + (i / SEGMENTS) * halfFov * 2;
      points.push(Math.sin(angle) * rangeCells, 0.05, Math.cos(angle) * rangeCells);
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.mesh.position.set(originX, 0, originZ);
  }
}
