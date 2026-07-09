import * as THREE from 'three';
import type { ParsedLevel } from '../world/level';

/**
 * Debug-only visualisation of the precomputed light grid: one merged plane
 * per non-wall cell, vertex-coloured from black (0) to white (1) by that
 * cell's light level. This is what makes "light-level-per-cell as grid
 * data" checkable at a glance rather than trusted on faith — Phase 5 makes
 * the light itself beautiful, this just needs to be honest.
 */
export function buildLightGridMesh(level: ParsedLevel, lightGrid: number[][]): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x].kind === 'wall') continue;

      const level0 = lightGrid[y][x];
      const x0 = x * level.cellSize;
      const x1 = (x + 1) * level.cellSize;
      const z0 = y * level.cellSize;
      const z1 = (y + 1) * level.cellSize;
      const yHeight = 0.03; // just above the floor and its surface tint, below furniture

      positions.push(x0, yHeight, z0, x1, yHeight, z0, x1, yHeight, z1, x0, yHeight, z1);
      for (let i = 0; i < 4; i++) colors.push(level0, level0, level0);
      indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
      vertexCount += 4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}
