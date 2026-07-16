import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cellBrightness, extrudeLevel, wallBrightness } from './Extruder';
import { gridBrightness, RENDER_LIGHTING } from '../config/renderLighting';
import { buildLightGrid } from '../systems/LightModel';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';

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
