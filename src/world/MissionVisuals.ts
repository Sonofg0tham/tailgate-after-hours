import * as THREE from 'three';
import { MISSION } from '../config/mission';
import { PALETTE_HEX } from '../config/palette';
import type { MissionState } from '../sim/MissionState';
import type { MotionLevel } from '../systems/Motion';

export interface MissionVisualPreferences {
  motionLevel: MotionLevel;
  highContrast: boolean;
}

interface OwnedMaterial {
  material: THREE.Material & { opacity: number };
  normalOpacity: number;
}

const FLOOR_OFFSET = 0.035;

function lineMaterial(colour: number, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
}

function cornerBracketGeometry(size: number, arm: number): THREE.BufferGeometry {
  const half = size / 2;
  const points = [
    -half, 0, -half, -half + arm, 0, -half,
    -half, 0, -half, -half, 0, -half + arm,
    half, 0, -half, half - arm, 0, -half,
    half, 0, -half, half, 0, -half + arm,
    -half, 0, half, -half + arm, 0, half,
    -half, 0, half, -half, 0, half - arm,
    half, 0, half, half - arm, 0, half,
    half, 0, half, half, 0, half - arm,
  ];
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function chevronGeometry(): THREE.BufferGeometry {
  const points: number[] = [];
  for (const offset of [-0.42, 0, 0.42]) {
    points.push(-0.32, 0, offset + 0.18, 0, 0, offset - 0.18, 0, 0, offset - 0.18, 0.32, 0, offset + 0.18);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

/**
 * Diegetic, floor-level mission signposting. These cues deliberately avoid
 * floating waypoints: the plant is framed like tagged equipment, evidence
 * uses camera-corner brackets, and exfil is marked by access-route chevrons.
 * The simulation remains the sole owner of mission state.
 */
export class MissionVisuals {
  readonly group = new THREE.Group();
  private readonly plant: THREE.Group;
  private readonly photos = new Map<string, THREE.Group>();
  private readonly exfil: THREE.Group;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials: OwnedMaterial[] = [];
  private disposed = false;

  constructor() {
    this.group.name = 'mission-visuals';
    this.plant = this.buildPlantHighlight();
    this.plant.name = 'mission:plant-highlight';
    this.plant.position.set(MISSION.plant.x, FLOOR_OFFSET, MISSION.plant.z);
    this.group.add(this.plant);

    for (const photo of MISSION.photos) {
      const marker = this.buildPhotoMarker();
      marker.name = `mission:photo:${photo.id}`;
      marker.position.set(photo.x, FLOOR_OFFSET, photo.z);
      this.photos.set(photo.id, marker);
      this.group.add(marker);
    }

    this.exfil = this.buildExfilChevrons();
    this.exfil.name = 'mission:exfil-chevrons';
    this.exfil.position.set(MISSION.exfil.x, FLOOR_OFFSET, MISSION.exfil.z);
    this.exfil.visible = false;
    this.group.add(this.exfil);
  }

  update(mission: MissionState, animationTimeMs: number, preferences: MissionVisualPreferences): void {
    const active = mission.phase === 'infiltrating' && mission.exfilledAtMs === null;
    this.plant.visible = active && mission.plantedAtMs === null;
    for (const [id, marker] of this.photos) {
      marker.visible = active && mission.photos[id] === null;
    }
    this.exfil.visible = active && mission.plantedAtMs !== null;

    const scale =
      preferences.motionLevel === 'full'
        ? 1.0125 + Math.sin((animationTimeMs / 2400) * Math.PI * 2) * 0.0125
        : 1;
    this.plant.scale.setScalar(scale);
    this.exfil.scale.setScalar(scale);
    for (const marker of this.photos.values()) marker.scale.setScalar(scale);

    for (const owned of this.materials) {
      owned.material.opacity = preferences.highContrast ? Math.min(1, owned.normalOpacity + 0.24) : owned.normalOpacity;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const { material } of this.materials) material.dispose();
    this.group.clear();
  }

  private ownMaterial<T extends THREE.Material & { opacity: number }>(material: T, normalOpacity: number): T {
    this.materials.push({ material, normalOpacity });
    return material;
  }

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private buildPlantHighlight(): THREE.Group {
    const group = new THREE.Group();
    const brackets = new THREE.LineSegments(
      this.ownGeometry(cornerBracketGeometry(1.3, 0.34)),
      this.ownMaterial(lineMaterial(PALETTE_HEX.amber, 0.72), 0.72),
    );
    brackets.renderOrder = 8;
    group.add(brackets);

    const device = new THREE.Mesh(
      this.ownGeometry(new THREE.BoxGeometry(0.32, 0.07, 0.16)),
      this.ownMaterial(
        new THREE.MeshBasicMaterial({
          color: PALETTE_HEX.amber,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        }),
        0.62,
      ),
    );
    device.position.y = 0.04;
    device.renderOrder = 8;
    group.add(device);
    return group;
  }

  private buildPhotoMarker(): THREE.Group {
    const group = new THREE.Group();
    const material = this.ownMaterial(lineMaterial(PALETTE_HEX.text, 0.52), 0.52);
    const brackets = new THREE.LineSegments(this.ownGeometry(cornerBracketGeometry(0.92, 0.24)), material);
    brackets.renderOrder = 8;
    group.add(brackets);

    const lensMaterial = this.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.text,
        transparent: true,
        opacity: 0.38,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      0.38,
    );
    const lens = new THREE.Mesh(this.ownGeometry(new THREE.RingGeometry(0.08, 0.115, 20)), lensMaterial);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = 0.001;
    lens.renderOrder = 8;
    group.add(lens);
    return group;
  }

  private buildExfilChevrons(): THREE.Group {
    const group = new THREE.Group();
    const chevrons = new THREE.LineSegments(
      this.ownGeometry(chevronGeometry()),
      this.ownMaterial(lineMaterial(PALETTE_HEX.amber, 0.68), 0.68),
    );
    chevrons.renderOrder = 8;
    group.add(chevrons);
    return group;
  }
}
