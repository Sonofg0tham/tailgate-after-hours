import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cellBrightness, extrudeLevel, wallBrightness } from './Extruder';
import { gridBrightness, RENDER_LIGHTING } from '../config/renderLighting';
import { buildLightGrid } from '../systems/LightModel';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';
import { DOOR_LABEL_LAYOUT, doorLabelFaceTransforms } from '../entities/DoorPanel';

interface DoorFrameModule {
  DOOR_FRAME_LAYOUT?: {
    slabWidthCells: number;
    postThicknessCells: number;
  };
  doorFramePostOffsets?: (opensEastWest: boolean, cellSize: number) => readonly (readonly [number, number])[];
}

async function loadDoorFrameModule(): Promise<DoorFrameModule> {
  const modulePath = './Extruder';
  return import(/* @vite-ignore */ modulePath) as Promise<DoorFrameModule>;
}

// The render-agrees-with-grid invariant, as tests: floor and wall vertex
// colours must be exactly the sim's light grid through the (monotone)
// render curve — sampled back from the REAL merged geometry, so this
// proves what the GPU is given.

const level = parseLevel(floor12 as LevelData);
const grid = buildLightGrid(level);

describe('the grid-to-brightness curve', () => {
  it('is monotone: a cell the sim calls darker never renders brighter', () => {
    let previous = -Infinity;
    for (let v = 0; v <= 1.001; v += 0.05) {
      const b = gridBrightness(v);
      expect(b).toBeGreaterThanOrEqual(previous);
      previous = b;
    }
  });

  it('keeps pitch dark at the readability floor, and full light at max', () => {
    expect(gridBrightness(0)).toBeCloseTo(RENDER_LIGHTING.grid.min, 5);
    expect(gridBrightness(1)).toBeCloseTo(RENDER_LIGHTING.grid.max, 5);
  });
});

describe('floor vertex colours agree with the light grid', () => {
  const extruded = extrudeLevel(level, grid);

  it('a lit cell (under the reception light) renders at its curve value', () => {
    const rendered = extruded.sampleFloorBrightness(6, 15);
    expect(rendered).not.toBeNull();
    expect(rendered).toBeCloseTo(cellBrightness(grid, 6, 15), 5);
    expect(rendered!).toBeGreaterThan(gridBrightness(0.5)); // genuinely lit
  });

  it('a dark corridor cell renders at the darkness floor', () => {
    const rendered = extruded.sampleFloorBrightness(20, 9);
    expect(rendered).toBeCloseTo(gridBrightness(grid[9][20]), 5);
    expect(rendered!).toBeLessThan(gridBrightness(0.2)); // genuinely dark
  });

  it('every walkable cell on Floor 12 agrees exactly', () => {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const rendered = extruded.sampleFloorBrightness(x, y);
        if (rendered !== null) {
          expect(rendered).toBeCloseTo(cellBrightness(grid, x, y), 5);
        }
      }
    }
  });

  it('walls take exactly the brightest adjacent walkable cell, never inventing light', () => {
    // The wall west of the reception pool: its only walkable neighbour is
    // (2,15), so its brightness must be that cell's grid value through the
    // curve — no more, no less.
    expect(wallBrightness(level, grid, 1, 15)).toBeCloseTo(gridBrightness(grid[15][2]), 5);
    // A corner wall with no walkable neighbour at all sits at the darkness floor.
    expect(wallBrightness(level, grid, 0, 0)).toBeCloseTo(gridBrightness(0), 5);
  });

  it('samples return null off-floor (walls, out of bounds)', () => {
    expect(extruded.sampleFloorBrightness(0, 0)).toBeNull();
    expect(extruded.sampleFloorBrightness(-3, 99)).toBeNull();
  });
});

describe('extruded level resource ownership', () => {
  it('does not share disposable materials between replaceable levels', () => {
    const first = extrudeLevel(level, grid);
    const second = extrudeLevel(level, grid);
    const materialsOf = (root: THREE.Object3D): Set<THREE.Material> => {
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        if (material) {
          for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry);
        }
      });
      return materials;
    };

    const firstMaterials = materialsOf(first.group);
    const secondMaterials = materialsOf(second.group);
    expect([...firstMaterials].filter((material) => secondMaterials.has(material))).toEqual([]);
  });

  it('disposes each unique geometry and material once, even if dispose is repeated', () => {
    const owned = extrudeLevel(level, grid);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    owned.group.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) {
        const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        for (const material of list) materials.add(material);
      }
    });

    let geometryDisposals = 0;
    let materialDisposals = 0;
    for (const geometry of geometries) geometry.dispose = () => { geometryDisposals += 1; };
    for (const material of materials) material.dispose = () => { materialDisposals += 1; };

    owned.dispose();
    owned.dispose();

    expect(geometryDisposals).toBe(geometries.size);
    expect(materialDisposals).toBe(materials.size);
  });
});

describe('dynamic door frame geometry', () => {
  it('flanks both slab orientations without crossing either depth-tested label face', async () => {
    const module = await loadDoorFrameModule();
    expect(module.DOOR_FRAME_LAYOUT).toBeDefined();
    expect(typeof module.doorFramePostOffsets).toBe('function');
    if (!module.DOOR_FRAME_LAYOUT || !module.doorFramePostOffsets) return;

    const frame = module.DOOR_FRAME_LAYOUT;
    expect(frame.slabWidthCells).toBe(DOOR_LABEL_LAYOUT.slabWidthCells);
    expect(frame.postThicknessCells).toBeLessThanOrEqual(
      DOOR_LABEL_LAYOUT.slabWidthCells - DOOR_LABEL_LAYOUT.widthCells,
    );

    const edgeCentre = ((frame.slabWidthCells + frame.postThicknessCells) * level.cellSize) / 2;
    expect(module.doorFramePostOffsets(false, level.cellSize)).toEqual([
      [-edgeCentre, 0],
      [edgeCentre, 0],
    ]);
    expect(module.doorFramePostOffsets(true, level.cellSize)).toEqual([
      [0, -edgeCentre],
      [0, edgeCentre],
    ]);

    const rendered = extrudeLevel(level, grid);
    try {
      const postHalf = (frame.postThicknessCells * level.cellSize) / 2;
      const slabHalf = (frame.slabWidthCells * level.cellSize) / 2;
      const labelHalf = (DOOR_LABEL_LAYOUT.widthCells * level.cellSize) / 2;

      for (const door of level.doors) {
        const opensEastWest =
          level.cells[door.y - 1]?.[door.x]?.kind === 'wall' &&
          level.cells[door.y + 1]?.[door.x]?.kind === 'wall';
        const centreX = (door.x + 0.5) * level.cellSize;
        const centreZ = (door.y + 0.5) * level.cellSize;
        const posts: THREE.Mesh[] = [];
        rendered.group.traverse((object) => {
          if (object instanceof THREE.Mesh && object.name === `door-frame:${door.x},${door.y}`) {
            posts.push(object);
          }
        });
        expect(posts, door.displayName).toHaveLength(2);

        const expectedOffsets = module.doorFramePostOffsets(opensEastWest, level.cellSize);
        const actualOffsets = posts.map((post) => [post.position.x - centreX, post.position.z - centreZ] as const);
        for (const [index, [dx, dz]] of actualOffsets.entries()) {
          expect(dx).toBeCloseTo(expectedOffsets[index][0]);
          expect(dz).toBeCloseTo(expectedOffsets[index][1]);
        }

        for (const [dx, dz] of actualOffsets) {
          const edgeAxis = Math.abs(opensEastWest ? dz : dx);
          const normalAxis = Math.abs(opensEastWest ? dx : dz);
          expect(edgeAxis - postHalf).toBeCloseTo(slabHalf);
          expect(edgeAxis - postHalf).toBeGreaterThan(labelHalf);
          expect(normalAxis).toBeCloseTo(0);
        }

        for (const face of doorLabelFaceTransforms(opensEastWest)) {
          const faceNormal = Math.abs(opensEastWest ? face.x : face.z);
          expect(faceNormal).toBeGreaterThan(postHalf);
        }
      }

      const nonDoorCollisionBounds =
        level.cells.flat().filter((cell) => cell.kind === 'wall').length + level.furniture.length;
      expect(rendered.wallBounds).toHaveLength(nonDoorCollisionBounds);
    } finally {
      rendered.dispose();
    }
  });
});

describe('production debug boundary', () => {
  it('does not allocate or activate grid and surface debug visuals when disabled', () => {
    const production = extrudeLevel(level, grid, { debugVisuals: false });
    let lineSegments = 0;
    production.group.traverse((object) => {
      if (object instanceof THREE.LineSegments) lineSegments += 1;
    });
    const visibilityBefore = production.group.children.map((child) => child.visible);

    production.setGridOverlay(true);
    production.setSurfaceTintDebug(true);

    expect(lineSegments).toBe(0);
    expect(production.group.children.map((child) => child.visible)).toEqual(visibilityBefore);
  });
});
