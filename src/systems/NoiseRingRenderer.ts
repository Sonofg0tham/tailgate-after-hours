import * as THREE from 'three';

const SEGMENTS = 48;
const RING_THICKNESS = 0.04;

/**
 * A flat ring on the floor showing the player's current noise radius. Debug
 * visualisation only (see the "noise ring" toggle) — there's no torch cone
 * or guard to react to it yet, so this is how the mechanic gets verified
 * before Phase 2 gives it a real consumer.
 */
export class NoiseRingRenderer {
  readonly mesh: THREE.Mesh;
  private radius = 0;

  constructor() {
    const geometry = new THREE.RingGeometry(0.01, 0.01 + RING_THICKNESS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb000,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  update(x: number, z: number, newRadius: number): void {
    this.mesh.position.set(x, 0.02, z);
    if (newRadius === this.radius) {
      return;
    }
    this.radius = newRadius;
    // Rebuilding geometry per change is cheap (a 48-segment ring) and the
    // radius only changes on speed-state transitions, not every frame.
    this.mesh.geometry.dispose();
    const inner = Math.max(0.01, newRadius - RING_THICKNESS);
    this.mesh.geometry = new THREE.RingGeometry(inner, Math.max(inner + 0.001, newRadius), SEGMENTS).rotateX(
      -Math.PI / 2,
    );
  }
}
