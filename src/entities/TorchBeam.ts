import * as THREE from 'three';
import { raycastDistance } from '../systems/Vision';
import { RENDER_LIGHTING } from '../config/renderLighting';
import type { MotionLevel } from '../systems/Motion';
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
 * Phase 5: the torch is also a real THREE.SpotLight with a shadow map,
 * living inside this same object and driven by the same update — the
 * one-object rule holds, the beam and the light can never disagree. The
 * spotlight shades characters and furniture (floors/walls are grid-lit and
 * ignore it) and its shadow map stops it reaching through walls.
 *
 * State-driven appearance is the "never colour alone" telegraph:
 *   patrol/sweep — steady, amber.
 *   curious/searching — flickers (opacity and light intensity pulse) — a beam swinging around.
 *   alert — locked, red wash, full opacity, hard light.
 */
export type BeamAppearance = 'steady' | 'flicker' | 'locked';

export class TorchBeam {
  /** Add this to the scene: fan mesh + spotlight + its target, one unit. */
  readonly group: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly light: THREE.SpotLight;
  private readonly lightTarget: THREE.Object3D;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffb000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Additive: the beam GLOWS over the dark floor instead of muddying it
      // — a cone of light, not a tinted decal. Found in visual QA: normal
      // alpha over the night floor made the locked red wash near-invisible.
      blending: THREE.AdditiveBlending,
    });
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((SEGMENTS + 2) * 3);
    const indices = new Uint16Array(SEGMENTS * 3);
    for (let i = 0; i < SEGMENTS; i++) {
      const offset = i * 3;
      indices[offset] = 0;
      indices[offset + 1] = i + 1;
      indices[offset + 2] = i + 2;
    }
    this.positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 5;

    const torch = RENDER_LIGHTING.torch;
    this.light = new THREE.SpotLight(torch.color, torch.intensity);
    this.light.penumbra = torch.penumbra;
    this.light.decay = torch.decay;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(torch.shadowMapSize, torch.shadowMapSize);
    this.light.shadow.bias = torch.shadowBias;
    this.light.shadow.camera.near = 0.3;
    this.lightTarget = new THREE.Object3D();
    this.light.target = this.lightTarget;

    this.group = new THREE.Group();
    this.group.add(this.mesh, this.light, this.lightTarget);
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
    motionLevel: MotionLevel = 'full',
  ): void {
    const halfFov = (fovDegrees * Math.PI) / 180 / 2;

    const positions = this.positionAttribute.array as Float32Array;
    positions[0] = 0;
    positions[1] = BEAM_HEIGHT;
    positions[2] = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = facingYaw - halfFov + (i / SEGMENTS) * halfFov * 2;
      const dist = raycastDistance(level, originX, originZ, angle, rangeCells);
      const localX = Math.sin(angle) * dist;
      const localZ = Math.cos(angle) * dist;
      const offset = (i + 1) * 3;
      positions[offset] = localX;
      positions[offset + 1] = BEAM_HEIGHT;
      positions[offset + 2] = localZ;
    }
    this.positionAttribute.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.position.set(originX, 0, originZ);

    // The spotlight rides the same origin and facing as the fan.
    const torch = RENDER_LIGHTING.torch;
    const dirX = Math.sin(facingYaw);
    const dirZ = Math.cos(facingYaw);
    this.light.position.set(originX, torch.heightMetres, originZ);
    this.lightTarget.position.set(originX + dirX * rangeCells, 0.4, originZ + dirZ * rangeCells);
    this.light.angle = halfFov;
    this.light.distance = rangeCells + torch.overreachMetres;

    this.material.color.setHex(appearance === 'locked' ? 0xff3b30 : 0xffb000);
    this.light.color.setHex(appearance === 'locked' ? torch.lockedColor : torch.color);
    if (appearance === 'flicker' && motionLevel === 'reduced') {
      // Keep searching visibly distinct without a pulsing light when the
      // player has asked for calm motion.
      this.material.opacity = 0.29;
      this.light.intensity = torch.intensity * (1 - torch.flickerDepth * 0.5);
    } else if (appearance === 'flicker') {
      this.material.opacity = 0.22 + Math.sin(animationPhase) * 0.13;
      this.light.intensity = torch.intensity * (1 - torch.flickerDepth * (0.5 + 0.5 * Math.sin(animationPhase)));
    } else if (appearance === 'locked') {
      this.material.opacity = 0.5;
      this.light.intensity = torch.intensity * 1.25;
    } else {
      this.material.opacity = 0.35;
      this.light.intensity = torch.intensity;
    }
  }
}
