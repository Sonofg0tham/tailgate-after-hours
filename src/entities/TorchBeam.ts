import * as THREE from 'three';
import { raycastDistance } from '../systems/Vision';
import type { ParsedLevel } from '../world/level';

const SEGMENTS = 16;
const BEAM_HEIGHT = 1.3; // roughly guard hand/torch height, metres above the floor

/**
 * One object is both the threat and its telegraph: this fan mesh IS the
 * guard's rendered detection cone, not a separate cosmetic light. Built
 * fresh each update from real raycasts (src/systems/Vision.ts's
 * raycastDistance), so what the player sees lit is exactly what the guard
 * can see — clipped at the first wall or closed door along each sub-ray,
 * the same way Tailgate's original render-side fan worked.
 *
 * State-driven appearance is the "never colour alone" telegraph:
 *   patrol/sweep — steady, amber.
 *   curious/searching — flickers (opacity pulses) — a beam swinging around.
 *   alert — locked, red wash, full opacity.
 */
export type BeamAppearance = 'steady' | 'flicker' | 'locked';

export class TorchBeam {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffb000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 5;
  }

  update(
    level: ParsedLevel,
    originX: number,
    originZ: number,
    facingYaw: number,
    rangeCells: number,
    fovDegrees: number,
    appearance: BeamAppearance,
    animationPhase: number,
  ): void {
    const halfFov = (fovDegrees * Math.PI) / 180 / 2;

    const positions: number[] = [0, BEAM_HEIGHT, 0]; // fan origin, local space
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = facingYaw - halfFov + (i / SEGMENTS) * halfFov * 2;
      const dist = raycastDistance(level, originX, originZ, angle, rangeCells);
      const localX = Math.sin(angle) * dist;
      const localZ = Math.cos(angle) * dist;
      positions.push(localX, BEAM_HEIGHT, localZ);
    }

    const indices: number[] = [];
    for (let i = 1; i <= SEGMENTS; i++) {
      indices.push(0, i, i + 1);
    }

    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.mesh.position.set(originX, 0, originZ);

    this.material.color.setHex(appearance === 'locked' ? 0xff3b30 : 0xffb000);
    if (appearance === 'flicker') {
      this.material.opacity = 0.22 + Math.sin(animationPhase) * 0.13;
    } else if (appearance === 'locked') {
      this.material.opacity = 0.5;
    } else {
      this.material.opacity = 0.35;
    }
  }
}
