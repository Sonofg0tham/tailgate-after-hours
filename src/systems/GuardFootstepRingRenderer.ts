import * as THREE from 'three';
import { PALETTE_HEX } from '../config/palette';
import type { GuardFootstepRingSlot } from './GuardFootstepRingPool';

const INNER_RADIUS = 0.3;
const OUTER_RADIUS = 0.36;
const SEGMENTS = 32;
const FLOOR_OFFSET = 0.025;

/** Preallocated Three.js view over the WebGL-independent ring-pool state. */
export class GuardFootstepRingRenderer {
  readonly group = new THREE.Group();
  private readonly geometry: THREE.RingGeometry;
  private readonly materials: THREE.MeshBasicMaterial[];
  private readonly meshes: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  private disposed = false;

  constructor(capacity: number) {
    const size = Math.max(0, Math.floor(capacity));
    this.geometry = new THREE.RingGeometry(INNER_RADIUS, OUTER_RADIUS, SEGMENTS);
    this.geometry.rotateX(-Math.PI / 2);
    this.materials = Array.from(
      { length: size },
      () =>
        new THREE.MeshBasicMaterial({
          color: PALETTE_HEX.text,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    );
    this.meshes = this.materials.map((material) => {
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      return mesh;
    });
  }

  render(rings: readonly GuardFootstepRingSlot[]): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const ring = rings[i];
      const visible = ring?.active === true;
      mesh.visible = visible;
      if (!visible || !ring) {
        continue;
      }
      mesh.position.set(ring.x, FLOOR_OFFSET, ring.z);
      mesh.scale.setScalar(ring.scale);
      mesh.material.opacity = ring.opacity;
    }
  }

  /** Releases the shared geometry and each independently faded material. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.geometry.dispose();
    for (const material of this.materials) {
      material.dispose();
    }
    this.group.clear();
  }
}
