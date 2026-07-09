import * as THREE from 'three';
import { WALL_HEIGHT } from '../world/Extruder';
import type { DoorKindDef } from '../world/level';

/**
 * A dynamic door's visible state, per kind — closed-fill colours match
 * Tailgate's Door.ts exactly (badge grey, smokers brown); `lift` has no
 * Tailgate precedent (see src/config/doors.ts's header) so it gets a new
 * colour in the same low-saturation family.
 */
const PANEL_COLOR: Record<DoorKindDef['kind'], number> = {
  badge: 0x9098a0,
  smokers: 0x8a6d43,
  lift: 0x5a7a92,
};

const PANEL_HEIGHT = WALL_HEIGHT * 0.8;
const PANEL_THICKNESS = 0.12;

/**
 * A closed dynamic door is a solid barrier filling its cell's gap — the
 * PRIMARY legibility cue (per CLAUDE.md: never state by colour alone) is
 * the panel's presence/absence, matching exactly what closedDoorWallBounds
 * makes solid; the per-kind tint is a secondary cue only.
 */
export class DoorPanel {
  readonly mesh: THREE.Mesh;

  constructor(def: DoorKindDef, opensEastWest: boolean, cellSize: number) {
    const width = opensEastWest ? PANEL_THICKNESS : cellSize * 0.92;
    const depth = opensEastWest ? cellSize * 0.92 : PANEL_THICKNESS;
    const geometry = new THREE.BoxGeometry(width, PANEL_HEIGHT, depth);
    const material = new THREE.MeshStandardMaterial({ color: PANEL_COLOR[def.kind], roughness: 0.7 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set((def.x + 0.5) * cellSize, PANEL_HEIGHT / 2, (def.y + 0.5) * cellSize);
  }

  update(open: boolean): void {
    this.mesh.visible = !open;
  }
}
