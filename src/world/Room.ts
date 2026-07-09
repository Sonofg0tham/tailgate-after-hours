import * as THREE from 'three';

/**
 * One hardcoded greybox room: a floor plus four walls. This is deliberately
 * NOT the general grid-JSON extruder described in GAME_DESIGN.md (that's
 * Phase 1's job, once there's a floor plan worth authoring as data) — the
 * spike only needs one room to prove the animation and camera pipelines.
 */
export interface WallBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const ROOM = {
  width: 12,
  depth: 12,
  wallHeight: 3,
  wallThickness: 0.3,
} as const;

export class Room {
  readonly group = new THREE.Group();
  readonly wallBounds: WallBounds[] = [];

  constructor() {
    const { width, depth, wallHeight, wallThickness } = ROOM;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x454c58, roughness: 0.8 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // North/south walls run along X, east/west walls run along Z.
    this.addWall(wallMaterial, width + wallThickness * 2, wallHeight, wallThickness, 0, -halfDepth);
    this.addWall(wallMaterial, width + wallThickness * 2, wallHeight, wallThickness, 0, halfDepth);
    this.addWall(wallMaterial, wallThickness, wallHeight, depth, -halfWidth, 0);
    this.addWall(wallMaterial, wallThickness, wallHeight, depth, halfWidth, 0);
  }

  private addWall(
    material: THREE.Material,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    centerX: number,
    centerZ: number,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), material);
    mesh.position.set(centerX, sizeY / 2, centerZ);
    this.group.add(mesh);

    this.wallBounds.push({
      minX: centerX - sizeX / 2,
      maxX: centerX + sizeX / 2,
      minZ: centerZ - sizeZ / 2,
      maxZ: centerZ + sizeZ / 2,
    });
  }
}
