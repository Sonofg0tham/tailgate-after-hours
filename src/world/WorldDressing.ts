import * as THREE from 'three';
import { PALETTE_HEX } from '../config/palette';
import {
  ZONE_VISUAL_PROFILES,
  type ParsedLevel,
  type ZoneVisualProfile,
} from './level';

export interface WorldDressing {
  group: THREE.Group;
  /** Applies the static accessibility contrast treatment to owned materials. */
  setHighContrast(enabled: boolean): void;
  /** Releases every shared geometry and material owned by this dressing. */
  dispose(): void;
}

interface ZoneFootprint {
  id: string;
  profile: ZoneVisualProfile;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centreX: number;
  centreZ: number;
  width: number;
  depth: number;
}

type GeometryKey = 'box' | 'plane' | 'hex-cylinder';
type MaterialKey =
  | 'structure'
  | 'raised'
  | 'polished'
  | 'amber'
  | 'amber-glow'
  | 'cool-glow'
  | 'screen'
  | 'shadow'
  | 'glass'
  | 'skyline'
  | 'paper';

/** Lazily created primitives keep the whole dressing to three shared geometries. */
class DressingResources {
  private readonly geometries = new Map<GeometryKey, THREE.BufferGeometry>();
  private readonly materials = new Map<MaterialKey, THREE.Material>();

  geometry(key: GeometryKey): THREE.BufferGeometry {
    const existing = this.geometries.get(key);
    if (existing) return existing;

    let geometry: THREE.BufferGeometry;
    if (key === 'box') {
      geometry = new THREE.BoxGeometry(1, 1, 1);
    } else if (key === 'plane') {
      geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
    } else {
      geometry = new THREE.CylinderGeometry(1, 1, 1, 6);
    }
    this.geometries.set(key, geometry);
    return geometry;
  }

  material(key: MaterialKey): THREE.Material {
    const existing = this.materials.get(key);
    if (existing) return existing;

    let material: THREE.Material;
    switch (key) {
      case 'structure':
        material = new THREE.MeshStandardMaterial({ color: 0x313945, roughness: 0.82, metalness: 0.08 });
        break;
      case 'raised':
        material = new THREE.MeshStandardMaterial({ color: 0x4b5564, roughness: 0.72, metalness: 0.1 });
        break;
      case 'polished':
        material = new THREE.MeshStandardMaterial({ color: 0x171c23, roughness: 0.22, metalness: 0.32 });
        break;
      case 'amber':
        material = new THREE.MeshBasicMaterial({ color: PALETTE_HEX.amber });
        break;
      case 'amber-glow':
        material = new THREE.MeshBasicMaterial({
          color: PALETTE_HEX.amber,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        break;
      case 'cool-glow':
        material = new THREE.MeshBasicMaterial({ color: 0xa8dcff });
        break;
      case 'screen':
        material = new THREE.MeshBasicMaterial({ color: 0x8fbac4 });
        break;
      case 'shadow':
        material = new THREE.MeshBasicMaterial({
          color: PALETTE_HEX.base,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        break;
      case 'glass':
        material = new THREE.MeshStandardMaterial({
          color: 0x101820,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
          roughness: 0.18,
          metalness: 0.42,
        });
        break;
      case 'skyline':
        material = new THREE.MeshBasicMaterial({ color: 0x080b10 });
        break;
      case 'paper':
        material = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, roughness: 0.95 });
        break;
    }
    this.materials.set(key, material);
    return material;
  }

  setHighContrast(enabled: boolean): void {
    const colour = (key: MaterialKey, normal: number, high: number): void => {
      const material = this.materials.get(key);
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.setHex(enabled ? high : normal);
      }
    };
    colour('amber', PALETTE_HEX.amber, 0xffc84a);
    colour('amber-glow', PALETTE_HEX.amber, 0xffc84a);
    colour('cool-glow', 0xa8dcff, 0xd9f3ff);
    colour('screen', 0x8fbac4, 0xc8f1ff);

    const amberGlow = this.materials.get('amber-glow');
    if (amberGlow instanceof THREE.MeshBasicMaterial) amberGlow.opacity = enabled ? 0.3 : 0.18;
    const shadow = this.materials.get('shadow');
    if (shadow instanceof THREE.MeshBasicMaterial) shadow.opacity = enabled ? 0.48 : 0.32;
    const glass = this.materials.get('glass');
    if (glass instanceof THREE.MeshStandardMaterial) glass.opacity = enabled ? 0.72 : 0.58;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
  }
}

function addBox(
  parent: THREE.Object3D,
  resources: DressingResources,
  name: string,
  material: MaterialKey,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(resources.geometry('box'), resources.material(material));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = material !== 'amber' && material !== 'cool-glow' && material !== 'screen';
  mesh.receiveShadow = mesh.castShadow;
  parent.add(mesh);
  return mesh;
}

function addPlane(
  parent: THREE.Object3D,
  resources: DressingResources,
  name: string,
  material: MaterialKey,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(resources.geometry('plane'), resources.material(material));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(width, 1, depth);
  parent.add(mesh);
  return mesh;
}

function addPipe(
  parent: THREE.Object3D,
  resources: DressingResources,
  x: number,
  y: number,
  z: number,
  length: number,
  alongX: boolean,
): THREE.Mesh {
  const mesh = new THREE.Mesh(resources.geometry('hex-cylinder'), resources.material('raised'));
  mesh.name = 'service:pipe-run';
  mesh.position.set(x, y, z);
  mesh.scale.set(0.055, length, 0.055);
  mesh.rotation[alongX ? 'z' : 'x'] = Math.PI / 2;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addContactDarkness(
  parent: THREE.Object3D,
  resources: DressingResources,
  x: number,
  z: number,
  width: number,
  depth: number,
): void {
  const contact = addPlane(parent, resources, 'dressing:contact-darkness', 'shadow', x, 0.012, z, width, depth);
  contact.renderOrder = 2;
}

function collectFootprints(level: ParsedLevel): ZoneFootprint[] {
  const footprints: ZoneFootprint[] = [];
  for (const [zoneId, zone] of Object.entries(level.zones)) {
    let minCellX = Infinity;
    let maxCellX = -Infinity;
    let minCellZ = Infinity;
    let maxCellZ = -Infinity;
    for (let z = 0; z < level.height; z++) {
      for (let x = 0; x < level.width; x++) {
        if (level.cells[z][x].zone !== zoneId) continue;
        minCellX = Math.min(minCellX, x);
        maxCellX = Math.max(maxCellX, x);
        minCellZ = Math.min(minCellZ, z);
        maxCellZ = Math.max(maxCellZ, z);
      }
    }
    if (!Number.isFinite(minCellX)) continue;

    const minX = minCellX * level.cellSize;
    const maxX = (maxCellX + 1) * level.cellSize;
    const minZ = minCellZ * level.cellSize;
    const maxZ = (maxCellZ + 1) * level.cellSize;
    footprints.push({
      id: zoneId,
      profile: zone.visualProfile,
      minX,
      maxX,
      minZ,
      maxZ,
      centreX: (minX + maxX) / 2,
      centreZ: (minZ + maxZ) / 2,
      width: maxX - minX,
      depth: maxZ - minZ,
    });
  }
  return footprints;
}

function zoneGroup(profileGroup: THREE.Group, footprint: ZoneFootprint): THREE.Group {
  const group = new THREE.Group();
  group.name = `dressing:zone:${footprint.id}`;
  profileGroup.add(group);
  return group;
}

function buildLobby(
  profileGroup: THREE.Group,
  resources: DressingResources,
  footprints: readonly ZoneFootprint[],
): void {
  for (const footprint of footprints) {
    const group = zoneGroup(profileGroup, footprint);
    const insetWidth = Math.max(0.5, footprint.width * 0.72);
    for (const offset of [-0.28, 0, 0.28]) {
      addPlane(
        group,
        resources,
        'lobby:polished-inset',
        'polished',
        footprint.centreX,
        0.008,
        footprint.centreZ + offset,
        insetWidth,
        0.12,
      );
    }

    const gate = new THREE.Group();
    gate.name = 'lobby:access-gate';
    gate.position.set(footprint.centreX, 0, footprint.centreZ);
    addBox(gate, resources, 'lobby:gate-post', 'structure', -0.58, 0.5, 0, 0.1, 1, 0.18);
    addBox(gate, resources, 'lobby:gate-post', 'structure', 0.58, 0.5, 0, 0.1, 1, 0.18);
    addBox(gate, resources, 'lobby:gate-bar', 'raised', 0, 0.94, 0, 1.06, 0.07, 0.12);
    addBox(gate, resources, 'lobby:clearance-strip', 'amber', 0, 0.98, -0.065, 0.72, 0.018, 0.018);
    group.add(gate);

    addContactDarkness(group, resources, footprint.centreX, footprint.centreZ, 1.45, 0.55);
    const pool = addPlane(
      group,
      resources,
      'lobby:amber-pool',
      'amber-glow',
      footprint.centreX,
      0.016,
      footprint.centreZ,
      1.75,
      0.9,
    );
    pool.renderOrder = 3;
  }
}

function buildOffice(
  level: ParsedLevel,
  profileGroup: THREE.Group,
  resources: DressingResources,
  footprints: readonly ZoneFootprint[],
): void {
  for (const footprint of footprints) {
    const group = zoneGroup(profileGroup, footprint);
    const placements = level.furniture.filter(
      (placement) =>
        level.cells[placement.y]?.[placement.x]?.zone === footprint.id &&
        (placement.type === 'desk' || placement.type === 'desk-exec'),
    );
    const anchors =
      placements.length > 0
        ? placements.map((placement) => ({
            x: (placement.x + 0.5) * level.cellSize,
            z: (placement.y + 0.5) * level.cellSize,
          }))
        : [{ x: footprint.centreX, z: footprint.centreZ }];

    for (const anchor of anchors) {
      addBox(group, resources, 'office:partition', 'structure', anchor.x, 0.62, anchor.z + 0.39, 0.92, 1.24, 0.035);
      addBox(group, resources, 'office:monitor-screen', 'screen', anchor.x, 0.9, anchor.z - 0.09, 0.34, 0.22, 0.025);
      addBox(group, resources, 'office:monitor-stand', 'raised', anchor.x, 0.77, anchor.z - 0.08, 0.045, 0.16, 0.045);
      addBox(group, resources, 'office:desk-clutter', 'paper', anchor.x + 0.25, 0.75, anchor.z + 0.05, 0.11, 0.025, 0.16);
      addContactDarkness(group, resources, anchor.x, anchor.z + 0.35, 0.98, 0.14);
    }
  }
}

function buildService(
  level: ParsedLevel,
  profileGroup: THREE.Group,
  resources: DressingResources,
  footprints: readonly ZoneFootprint[],
): void {
  for (const footprint of footprints) {
    const group = zoneGroup(profileGroup, footprint);
    const alongX = footprint.width >= footprint.depth;
    const length = Math.min(5.5, Math.max(1, (alongX ? footprint.width : footprint.depth) * 0.55));
    addPipe(
      group,
      resources,
      alongX ? footprint.centreX : footprint.minX + 0.22,
      2.32,
      alongX ? footprint.minZ + 0.22 : footprint.centreZ,
      length,
      alongX,
    );
    const marking = addPlane(
      group,
      resources,
      'service:utility-marking',
      'amber-glow',
      footprint.centreX,
      0.014,
      footprint.centreZ,
      Math.min(1.4, footprint.width * 0.7),
      Math.min(0.16, footprint.depth * 0.3),
    );
    marking.renderOrder = 3;
  }

  const breaker = level.furniture.find(
    (placement) =>
      placement.type === 'breaker' &&
      level.zones[level.cells[placement.y]?.[placement.x]?.zone ?? '']?.visualProfile === 'service',
  );
  const fallback = footprints[0];
  if (!breaker && !fallback) return;
  const trolleyX = breaker ? (breaker.x + 0.1) * level.cellSize : fallback.centreX;
  const trolleyZ = breaker ? (breaker.y + 0.5) * level.cellSize : fallback.centreZ;
  const trolley = new THREE.Group();
  trolley.name = 'service:cleaning-trolley';
  trolley.position.set(trolleyX, 0, trolleyZ);
  addBox(trolley, resources, 'service:trolley-base', 'raised', 0, 0.28, 0, 0.58, 0.18, 0.36);
  addBox(trolley, resources, 'service:trolley-bin', 'structure', -0.12, 0.52, 0, 0.28, 0.35, 0.3);
  addBox(trolley, resources, 'service:trolley-handle', 'structure', 0.27, 0.64, 0, 0.035, 0.72, 0.32);
  for (const x of [-0.21, 0.21]) {
    const wheel = addBox(trolley, resources, 'service:trolley-wheel', 'shadow', x, 0.12, 0.15, 0.11, 0.11, 0.045);
    wheel.rotation.x = Math.PI / 4;
  }
  profileGroup.add(trolley);
  addContactDarkness(profileGroup, resources, trolleyX, trolleyZ, 0.72, 0.5);
}

function buildServer(
  level: ParsedLevel,
  profileGroup: THREE.Group,
  resources: DressingResources,
  footprints: readonly ZoneFootprint[],
): void {
  for (const footprint of footprints) {
    const group = zoneGroup(profileGroup, footprint);
    for (const offset of [-0.28, 0.28]) {
      addPlane(
        group,
        resources,
        'server:raised-floor-seam',
        'shadow',
        footprint.centreX + offset,
        0.013,
        footprint.centreZ,
        0.025,
        Math.max(0.5, footprint.depth * 0.88),
      );
    }
    addBox(
      group,
      resources,
      'server:cable-run',
      'structure',
      footprint.centreX,
      0.035,
      footprint.centreZ,
      Math.max(0.8, footprint.width * 0.68),
      0.05,
      0.1,
    );

    const racks = level.furniture.filter(
      (placement) => placement.type === 'rack' && level.cells[placement.y]?.[placement.x]?.zone === footprint.id,
    );
    const anchors =
      racks.length > 0
        ? racks.map((placement) => ({
            x: (placement.x + 0.5) * level.cellSize,
            z: (placement.y + 0.5) * level.cellSize,
          }))
        : [{ x: footprint.centreX, z: footprint.centreZ }];
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      const accentMaterial: MaterialKey = index % 3 === 0 ? 'amber' : 'cool-glow';
      addBox(
        group,
        resources,
        'server:rack-accent',
        accentMaterial,
        anchor.x + 0.2,
        0.98,
        anchor.z - 0.335,
        0.025,
        1.35,
        0.018,
      );
      addBox(
        group,
        resources,
        index % 3 === 0 ? 'server:amber-led' : 'server:cool-led',
        accentMaterial,
        anchor.x - 0.16,
        1.3,
        anchor.z - 0.34,
        0.08,
        0.025,
        0.018,
      );
      addContactDarkness(group, resources, anchor.x, anchor.z, 0.7, 0.78);
    }
  }
}

type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

function nearestEdge(level: ParsedLevel, footprint: ZoneFootprint): EdgeSide {
  const distances: ReadonlyArray<readonly [EdgeSide, number]> = [
    ['left', footprint.minX],
    ['right', level.width * level.cellSize - footprint.maxX],
    ['top', footprint.minZ],
    ['bottom', level.height * level.cellSize - footprint.maxZ],
  ];
  return distances.reduce((nearest, candidate) => (candidate[1] < nearest[1] ? candidate : nearest))[0];
}

function buildEdge(
  level: ParsedLevel,
  profileGroup: THREE.Group,
  resources: DressingResources,
  footprints: readonly ZoneFootprint[],
): void {
  const worldWidth = level.width * level.cellSize;
  const worldDepth = level.height * level.cellSize;
  const skylineHeights = [3.2, 5.4, 4.1, 6.2, 3.7] as const;

  for (const footprint of footprints) {
    const group = zoneGroup(profileGroup, footprint);
    const edge = nearestEdge(level, footprint);
    const paneCount = 3;
    for (let index = 0; index < paneCount; index++) {
      const along = (index + 0.5) / paneCount - 0.5;
      if (edge === 'left' || edge === 'right') {
        addBox(
          group,
          resources,
          'edge:window-pane',
          'glass',
          edge === 'left' ? footprint.minX + 0.04 : footprint.maxX - 0.04,
          1.2,
          footprint.centreZ + along * footprint.depth,
          0.045,
          2.4,
          Math.max(0.2, footprint.depth / paneCount - 0.05),
        );
      } else {
        addBox(
          group,
          resources,
          'edge:window-pane',
          'glass',
          footprint.centreX + along * footprint.width,
          1.2,
          edge === 'top' ? footprint.minZ + 0.04 : footprint.maxZ - 0.04,
          Math.max(0.2, footprint.width / paneCount - 0.05),
          2.4,
          0.045,
        );
      }
    }

    for (let index = 0; index < skylineHeights.length; index++) {
      const height = skylineHeights[index];
      const crossOffset = (index - 2) * 0.72;
      const distance = 1 + index * 0.38;
      const width = 0.65 + (index % 2) * 0.22;
      const depth = 0.62 + ((index + 1) % 2) * 0.18;
      let x: number;
      let z: number;
      if (edge === 'left') {
        x = -distance - width / 2;
        z = footprint.centreZ + crossOffset;
      } else if (edge === 'right') {
        x = worldWidth + distance + width / 2;
        z = footprint.centreZ + crossOffset;
      } else if (edge === 'top') {
        x = footprint.centreX + crossOffset;
        z = -distance - depth / 2;
      } else {
        x = footprint.centreX + crossOffset;
        z = worldDepth + distance + depth / 2;
      }

      addBox(group, resources, 'edge:skyline-building', 'skyline', x, height / 2, z, width, height, depth);
      const windowX = edge === 'left' ? x + width / 2 + 0.008 : edge === 'right' ? x - width / 2 - 0.008 : x;
      const windowZ = edge === 'top' ? z + depth / 2 + 0.008 : edge === 'bottom' ? z - depth / 2 - 0.008 : z;
      addBox(
        group,
        resources,
        'edge:skyline-window',
        'amber-glow',
        windowX,
        Math.min(height - 0.5, 1.1 + (index % 3) * 0.75),
        windowZ,
        edge === 'left' || edge === 'right' ? 0.016 : Math.min(0.28, width * 0.45),
        0.08,
        edge === 'top' || edge === 'bottom' ? 0.016 : Math.min(0.28, depth * 0.45),
      );
    }
  }
}

/**
 * Builds decorative geometry from zone profiles and furniture anchors only.
 * It does not modify the level, add lights, or expose collision bounds, so
 * the Extruder's grid-lit floor and the deterministic simulation remain truth.
 */
export function buildWorldDressing(level: ParsedLevel): WorldDressing {
  const group = new THREE.Group();
  group.name = 'world-dressing';
  const resources = new DressingResources();
  const footprints = collectFootprints(level);

  for (const profile of ZONE_VISUAL_PROFILES) {
    const profileFootprints = footprints.filter((footprint) => footprint.profile === profile);
    if (profileFootprints.length === 0) continue;

    const profileGroup = new THREE.Group();
    profileGroup.name = `dressing:profile:${profile}`;
    group.add(profileGroup);
    if (profile === 'lobby') {
      buildLobby(profileGroup, resources, profileFootprints);
    } else if (profile === 'office') {
      buildOffice(level, profileGroup, resources, profileFootprints);
    } else if (profile === 'service') {
      buildService(level, profileGroup, resources, profileFootprints);
    } else if (profile === 'server') {
      buildServer(level, profileGroup, resources, profileFootprints);
    } else {
      buildEdge(level, profileGroup, resources, profileFootprints);
    }
  }

  let disposed = false;
  return {
    group,
    setHighContrast(enabled) {
      resources.setHighContrast(enabled);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.dispose();
      group.clear();
    },
  };
}
