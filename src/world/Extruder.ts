import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isWall, type ParsedLevel, type SurfaceType } from './level';
import type { WallBounds } from '../physics/CapsuleCollider';

import { buildFurniture } from './Furniture';

/** Also referenced by FollowCamera.ts to guarantee the camera never dips below wall height. */
export const WALL_HEIGHT = 3;
const WALL_COLOR = 0x454c58;

// Default (non-debug) floor shading: distinguishable by surface type alone,
// each a different luminance so the greyscale check still reads. Debug
// "surface tints" mode swaps to the per-zone `tint` from the level data.
const SURFACE_COLOR: Record<SurfaceType, number> = {
  carpet: 0x2f333c,
  tile: 0x4a5162,
  concrete: 0x3a3f48,
};

export interface ExtrudedLevel {
  group: THREE.Group;
  wallBounds: WallBounds[];
  /** Toggle between surface-type shading (default) and per-zone debug tints. */
  setSurfaceTintDebug(enabled: boolean): void;
  /** Toggle a wireframe cell-grid overlay across the floor, for alignment checks. */
  setGridOverlay(enabled: boolean): void;
}

export function extrudeLevel(level: ParsedLevel): ExtrudedLevel {
  const { cellSize } = level;
  const group = new THREE.Group();
  const wallBounds: WallBounds[] = [];

  // --- Walls: one merged mesh, one draw call, regardless of grid size. ---
  const wallGeometries: THREE.BufferGeometry[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].kind !== 'wall') continue;

      const centerX = (x + 0.5) * cellSize;
      const centerZ = (y + 0.5) * cellSize;
      const box = new THREE.BoxGeometry(cellSize, WALL_HEIGHT, cellSize);
      box.translate(centerX, WALL_HEIGHT / 2, centerZ);
      wallGeometries.push(box);

      wallBounds.push({
        minX: centerX - cellSize / 2,
        maxX: centerX + cellSize / 2,
        minZ: centerZ - cellSize / 2,
        maxZ: centerZ + cellSize / 2,
      });
    }
  }
  if (wallGeometries.length > 0) {
    const merged = mergeGeometries(wallGeometries);
    const wallMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85 }));
    group.add(wallMesh);
  }

  // --- Floor: two parallel merged-mesh sets (by surface, by zone), toggled by visibility. ---
  const bySurface = new Map<SurfaceType, THREE.BufferGeometry[]>();
  const byZone = new Map<string, THREE.BufferGeometry[]>();

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = level.cells[y][x];
      if (cell.kind === 'wall' || !cell.surface || !cell.zone) continue;

      const plane = new THREE.PlaneGeometry(cellSize, cellSize);
      plane.rotateX(-Math.PI / 2);
      plane.translate((x + 0.5) * cellSize, 0, (y + 0.5) * cellSize);

      const surfaceList = bySurface.get(cell.surface) ?? [];
      surfaceList.push(plane.clone());
      bySurface.set(cell.surface, surfaceList);

      const zoneList = byZone.get(cell.zone) ?? [];
      zoneList.push(plane);
      byZone.set(cell.zone, zoneList);
    }
  }

  const surfaceFloorGroup = new THREE.Group();
  for (const [surface, geometries] of bySurface) {
    const mesh = new THREE.Mesh(
      mergeGeometries(geometries),
      new THREE.MeshStandardMaterial({ color: SURFACE_COLOR[surface], roughness: 0.95 }),
    );
    surfaceFloorGroup.add(mesh);
  }

  const zoneFloorGroup = new THREE.Group();
  zoneFloorGroup.visible = false;
  for (const [zone, geometries] of byZone) {
    const tint = level.zones[zone]?.tint ?? '#888888';
    const mesh = new THREE.Mesh(
      mergeGeometries(geometries),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.95 }),
    );
    zoneFloorGroup.add(mesh);
  }

  group.add(surfaceFloorGroup, zoneFloorGroup);

  // --- Door frames: decorative posts either side of the opening, non-colliding. ---
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6272, roughness: 0.7 });
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].kind !== 'door') continue;

      const centerX = (x + 0.5) * cellSize;
      const centerZ = (y + 0.5) * cellSize;
      // A door with walls to its north/south is a gap in an east-west wall
      // run (posts sit on the east/west edges); otherwise it's a gap in a
      // north-south run (posts sit on the north/south edges).
      const opensEastWest = isWall(level, x, y - 1) && isWall(level, x, y + 1);
      const postHeight = WALL_HEIGHT * 0.8;
      const postThickness = cellSize * 0.08;

      const offsets = opensEastWest
        ? [
            [-cellSize / 2 + postThickness / 2, 0],
            [cellSize / 2 - postThickness / 2, 0],
          ]
        : [
            [0, -cellSize / 2 + postThickness / 2],
            [0, cellSize / 2 - postThickness / 2],
          ];

      for (const [dx, dz] of offsets) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postThickness, postHeight, postThickness), frameMaterial);
        post.position.set(centerX + dx, postHeight / 2, centerZ + dz);
        group.add(post);
      }
    }
  }

  // --- Furniture: procedural low-poly props, each blocks its cell. ---
  for (const placement of level.furniture) {
    const centerX = (placement.x + 0.5) * cellSize;
    const centerZ = (placement.y + 0.5) * cellSize;
    const prop = buildFurniture(placement.type);
    prop.position.set(centerX, 0, centerZ);
    group.add(prop);

    wallBounds.push({
      minX: centerX - cellSize / 2,
      maxX: centerX + cellSize / 2,
      minZ: centerZ - cellSize / 2,
      maxZ: centerZ + cellSize / 2,
    });
  }

  // --- Grid overlay: thin wireframe lines over every floor cell boundary. ---
  const gridOverlay = buildGridOverlay(level);
  gridOverlay.visible = false;
  group.add(gridOverlay);

  return {
    group,
    wallBounds,
    setSurfaceTintDebug(enabled: boolean) {
      surfaceFloorGroup.visible = !enabled;
      zoneFloorGroup.visible = enabled;
    },
    setGridOverlay(enabled: boolean) {
      gridOverlay.visible = enabled;
    },
  };
}

function buildGridOverlay(level: ParsedLevel): THREE.LineSegments {
  const { cellSize, width, height } = level;
  const points: number[] = [];
  const y = 0.01; // just above the floor, avoids z-fighting

  for (let x = 0; x <= width; x++) {
    points.push(x * cellSize, y, 0, x * cellSize, y, height * cellSize);
  }
  for (let z = 0; z <= height; z++) {
    points.push(0, y, z * cellSize, width * cellSize, y, z * cellSize);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.4 }));
}
