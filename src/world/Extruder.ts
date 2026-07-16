import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isWall, type ParsedLevel, type SurfaceType } from './level';
import type { WallBounds } from '../physics/CapsuleCollider';
import { gridBrightness } from '../config/renderLighting';

import { buildFurniture, createFurnitureMaterials } from './Furniture';

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
  /** Releases every GPU geometry and material owned by this visual level. */
  dispose(): void;
  /** Toggle between surface-type shading (default) and per-zone debug tints. */
  setSurfaceTintDebug(enabled: boolean): void;
  /** Toggle a wireframe cell-grid overlay across the floor, for alignment checks. */
  setGridOverlay(enabled: boolean): void;
  /**
   * Reads the brightness actually written into the merged floor geometry's
   * colour attribute for a cell — the render half of the grid-agreement
   * invariant, sampled from the real vertex data so the test proves what
   * the GPU is given, not what we intended to give it. Null off-floor.
   */
  sampleFloorBrightness(x: number, y: number): number | null;
}

export interface ExtrudeLevelOptions {
  /** DEV-only grid and zone-tint geometry. Production omits both allocations. */
  debugVisuals?: boolean;
}

/** The rendered brightness of a floor cell — the light grid through the monotone render curve. */
export function cellBrightness(lightGrid: readonly number[][], x: number, y: number): number {
  return gridBrightness(lightGrid[y]?.[x] ?? 0);
}

/**
 * The rendered brightness of a wall cell: the brightest ADJACENT walkable
 * cell's grid value (a wall face reads as lit as the room it bounds). Walls
 * with no walkable neighbour render at the darkness floor.
 */
export function wallBrightness(level: ParsedLevel, lightGrid: readonly number[][], x: number, y: number): number {
  let best = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const cell = level.cells[y + dy]?.[x + dx];
    if (cell && cell.kind !== 'wall') {
      best = Math.max(best, lightGrid[y + dy]?.[x + dx] ?? 0);
    }
  }
  return gridBrightness(best);
}

/** Fills a geometry's `color` attribute with one flat brightness (grey — albedo comes from the material colour). */
function paintGeometry(geometry: THREE.BufferGeometry, brightness: number): void {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  colors.fill(brightness);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

export function extrudeLevel(
  level: ParsedLevel,
  lightGrid?: readonly number[][],
  options: ExtrudeLevelOptions = {},
): ExtrudedLevel {
  const { cellSize } = level;
  const debugVisuals = options.debugVisuals ?? true;
  const group = new THREE.Group();
  const wallBounds: WallBounds[] = [];
  // Without a grid (unit tests that only want wallBounds), everything paints
  // at full brightness — visually flat, geometrically identical.
  const grid = lightGrid ?? null;

  // --- Walls: one merged mesh, one draw call, regardless of grid size. ---
  const wallGeometries: THREE.BufferGeometry[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].kind !== 'wall') continue;

      const centerX = (x + 0.5) * cellSize;
      const centerZ = (y + 0.5) * cellSize;
      const box = new THREE.BoxGeometry(cellSize, WALL_HEIGHT, cellSize);
      box.translate(centerX, WALL_HEIGHT / 2, centerZ);
      paintGeometry(box, grid ? wallBrightness(level, grid, x, y) : 1);
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
    // Grid-lit, not scene-lit: the wall's brightness IS its vertex colour, so
    // the render cannot disagree with the sim's light grid. Torch spotlights
    // light characters, not this mesh — but it still CASTS their shadows.
    const wallMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: WALL_COLOR, vertexColors: true }));
    wallMesh.castShadow = true;
    group.add(wallMesh);
  }

  // --- Floor: two parallel merged-mesh sets (by surface, by zone), toggled by visibility. ---
  const bySurface = new Map<SurfaceType, THREE.BufferGeometry[]>();
  const byZone = debugVisuals ? new Map<string, THREE.BufferGeometry[]>() : null;
  // Where each cell's four vertices land in its surface's merged geometry,
  // so sampleFloorBrightness can read the real attribute back.
  const vertexOffsetBySurface = new Map<SurfaceType, number>();
  const cellVertexIndex = new Map<string, { surface: SurfaceType; vertexIndex: number }>();

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = level.cells[y][x];
      if (cell.kind === 'wall' || !cell.surface || !cell.zone) continue;

      const plane = new THREE.PlaneGeometry(cellSize, cellSize);
      plane.rotateX(-Math.PI / 2);
      plane.translate((x + 0.5) * cellSize, 0, (y + 0.5) * cellSize);

      const lit = debugVisuals ? plane.clone() : plane;
      paintGeometry(lit, grid ? cellBrightness(grid, x, y) : 1);
      const surfaceList = bySurface.get(cell.surface) ?? [];
      surfaceList.push(lit);
      bySurface.set(cell.surface, surfaceList);

      const offset = vertexOffsetBySurface.get(cell.surface) ?? 0;
      cellVertexIndex.set(`${x},${y}`, { surface: cell.surface, vertexIndex: offset });
      vertexOffsetBySurface.set(cell.surface, offset + lit.getAttribute('position').count);

      if (byZone) {
        const zoneList = byZone.get(cell.zone) ?? [];
        zoneList.push(plane);
        byZone.set(cell.zone, zoneList);
      }
    }
  }

  const surfaceFloorGroup = new THREE.Group();
  const mergedBySurface = new Map<SurfaceType, THREE.BufferGeometry>();
  for (const [surface, geometries] of bySurface) {
    const merged = mergeGeometries(geometries);
    mergedBySurface.set(surface, merged);
    // Grid-lit like the walls: floor brightness IS the sim's light grid
    // through the render curve, self-lit so no scene light can contradict it.
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: SURFACE_COLOR[surface], vertexColors: true }));
    surfaceFloorGroup.add(mesh);
  }

  let zoneFloorGroup: THREE.Group | null = null;
  if (byZone) {
    zoneFloorGroup = new THREE.Group();
    zoneFloorGroup.visible = false;
    for (const [zone, geometries] of byZone) {
      const tint = level.zones[zone]?.tint ?? '#888888';
      const mesh = new THREE.Mesh(
        mergeGeometries(geometries),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.95 }),
      );
      zoneFloorGroup.add(mesh);
    }
  }

  group.add(surfaceFloorGroup);
  if (zoneFloorGroup) group.add(zoneFloorGroup);

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
  const furnitureMaterials = createFurnitureMaterials();
  for (const placement of level.furniture) {
    const centerX = (placement.x + 0.5) * cellSize;
    const centerZ = (placement.y + 0.5) * cellSize;
    const prop = buildFurniture(placement.type, furnitureMaterials);
    prop.position.set(centerX, 0, centerZ);
    prop.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    group.add(prop);

    wallBounds.push({
      minX: centerX - cellSize / 2,
      maxX: centerX + cellSize / 2,
      minZ: centerZ - cellSize / 2,
      maxZ: centerZ + cellSize / 2,
    });
  }

  // --- Grid overlay: thin wireframe lines over every floor cell boundary. ---
  const gridOverlay = debugVisuals ? buildGridOverlay(level) : null;
  if (gridOverlay) {
    gridOverlay.visible = false;
    group.add(gridOverlay);
  }

  let disposed = false;

  return {
    group,
    wallBounds,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      group.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (renderable.geometry) {
          geometries.add(renderable.geometry);
        }
        if (renderable.material) {
          const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
          for (const material of list) {
            materials.add(material);
          }
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
    setSurfaceTintDebug(enabled: boolean) {
      if (!zoneFloorGroup) return;
      surfaceFloorGroup.visible = !enabled;
      zoneFloorGroup.visible = enabled;
    },
    setGridOverlay(enabled: boolean) {
      if (gridOverlay) gridOverlay.visible = enabled;
    },
    sampleFloorBrightness(x: number, y: number): number | null {
      const entry = cellVertexIndex.get(`${x},${y}`);
      if (!entry) {
        return null;
      }
      const colors = mergedBySurface.get(entry.surface)?.getAttribute('color');
      return colors ? colors.getX(entry.vertexIndex) : null;
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
