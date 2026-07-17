import * as THREE from 'three';

export const CLEANER_UNIFORM_COLOUR = 0xb9c0c7;

const BELT_COLOUR = 0x171b20;
const PACK_COLOUR = 0x59636d;
const BOTTLE_COLOUR = 0xd4dce2;

interface MaterialAssignment {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
}

export interface CleanerAppearance {
  /** Procedural silhouette pieces attached to the character root. */
  readonly accessories: THREE.Group;
  /** Restores source materials, detaches accessories and frees owned GPU resources. */
  dispose(): void;
}

function tintUniformMaterial(material: THREE.Material): void {
  const colourMaterial = material as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
  };
  if (colourMaterial.color instanceof THREE.Color) {
    colourMaterial.color.setHex(CLEANER_UNIFORM_COLOUR);
  }
  if (colourMaterial.emissive instanceof THREE.Color) {
    colourMaterial.emissive.setHex(0x000000);
  }
}

function accessoryMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Makes the reused Rogue body read as cleaning staff without another asset.
 * Body materials are cloned per character, while the original GLTF materials
 * and geometry remain owned by the shared character asset cache.
 */
export function applyCleanerAppearance(model: THREE.Object3D): CleanerAppearance {
  const clonedMaterials = new Map<THREE.Material, THREE.Material>();
  const assignments: MaterialAssignment[] = [];

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = object.material;
    const cloneMaterial = (material: THREE.Material): THREE.Material => {
      const existing = clonedMaterials.get(material);
      if (existing) return existing;
      const clone = material.clone();
      tintUniformMaterial(clone);
      clonedMaterials.set(material, clone);
      return clone;
    };
    object.material = Array.isArray(original) ? original.map(cloneMaterial) : cloneMaterial(original);
    assignments.push({ mesh: object, original });
  });

  const accessories = new THREE.Group();
  accessories.name = 'cleaner-appearance';

  const beltMaterial = new THREE.MeshStandardMaterial({ color: BELT_COLOUR, roughness: 0.9 });
  const uniformMaterial = new THREE.MeshStandardMaterial({ color: CLEANER_UNIFORM_COLOUR, roughness: 0.88 });
  const packMaterial = new THREE.MeshStandardMaterial({ color: PACK_COLOUR, roughness: 0.85 });
  const bottleMaterial = new THREE.MeshStandardMaterial({ color: BOTTLE_COLOUR, roughness: 0.55 });

  const beltGeometry = new THREE.BoxGeometry(0.82, 0.08, 0.72);
  const uniformGeometry = new THREE.BoxGeometry(0.78, 0.58, 0.08);
  const packGeometry = new THREE.BoxGeometry(0.34, 0.45, 0.16);
  const bottleGeometry = new THREE.CylinderGeometry(0.055, 0.065, 0.24, 8);

  accessories.add(
    accessoryMesh('cleaner-uniform-apron', uniformGeometry, uniformMaterial, [0, 0.94, 0.43]),
    accessoryMesh('cleaner-utility-belt', beltGeometry, beltMaterial, [0, 0.64, 0]),
    accessoryMesh('cleaner-cleaning-pack', packGeometry, packMaterial, [0, 0.94, -0.46]),
    accessoryMesh('cleaner-bottle', bottleGeometry, bottleMaterial, [0.38, 0.7, -0.4]),
  );
  model.add(accessories);

  let disposed = false;
  return {
    accessories,
    dispose(): void {
      if (disposed) return;
      disposed = true;

      for (const assignment of assignments) assignment.mesh.material = assignment.original;
      accessories.removeFromParent();

      for (const material of clonedMaterials.values()) material.dispose();
      beltGeometry.dispose();
      uniformGeometry.dispose();
      packGeometry.dispose();
      bottleGeometry.dispose();
      beltMaterial.dispose();
      uniformMaterial.dispose();
      packMaterial.dispose();
      bottleMaterial.dispose();
    },
  };
}
