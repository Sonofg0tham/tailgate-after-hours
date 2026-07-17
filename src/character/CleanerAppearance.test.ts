import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE_HEX } from '../config/palette';
import { CLEANER_UNIFORM_COLOUR, applyCleanerAppearance } from './CleanerAppearance';

function renderMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry);
  });
  return materials;
}

function cleanerWith(material: THREE.Material): { model: THREE.Group; body: THREE.Mesh } {
  const model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.35), material);
  body.name = 'body';
  model.add(body);
  return { model, body };
}

function materialColour(material: THREE.Material): THREE.Color | null {
  const candidate = material as THREE.Material & { color?: THREE.Color };
  return candidate.color instanceof THREE.Color ? candidate.color : null;
}

describe('cleaner appearance', () => {
  it('gives each cleaner independent grey materials without changing the shared player source', () => {
    const shared = new THREE.MeshStandardMaterial({ color: PALETTE_HEX.alarm });
    const player = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const first = cleanerWith(shared);
    const second = cleanerWith(shared);

    applyCleanerAppearance(first.model);
    applyCleanerAppearance(second.model);

    const firstMaterial = first.body.material as THREE.MeshStandardMaterial;
    const secondMaterial = second.body.material as THREE.MeshStandardMaterial;
    expect(player.material).toBe(shared);
    expect(shared.color.getHex()).toBe(PALETTE_HEX.alarm);
    expect(firstMaterial).not.toBe(shared);
    expect(secondMaterial).not.toBe(shared);
    expect(firstMaterial).not.toBe(secondMaterial);
    expect(firstMaterial.color.getHex()).toBe(CLEANER_UNIFORM_COLOUR);
    expect(secondMaterial.color.getHex()).toBe(CLEANER_UNIFORM_COLOUR);

    firstMaterial.color.setHex(0x111111);
    expect(secondMaterial.color.getHex()).toBe(CLEANER_UNIFORM_COLOUR);
    expect(shared.color.getHex()).toBe(PALETTE_HEX.alarm);
  });

  it('adds a utility-belt and cleaning-pack silhouette without using alarm red', () => {
    const cleaner = cleanerWith(new THREE.MeshStandardMaterial({ color: 0x342f2b }));
    applyCleanerAppearance(cleaner.model);

    expect(cleaner.model.getObjectByName('cleaner-appearance')).toBeInstanceOf(THREE.Group);
    const apron = cleaner.model.getObjectByName('cleaner-uniform-apron');
    const pack = cleaner.model.getObjectByName('cleaner-cleaning-pack');
    expect(apron).toBeInstanceOf(THREE.Mesh);
    expect((apron as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters.depth).toBeGreaterThanOrEqual(0.4);
    expect(cleaner.model.getObjectByName('cleaner-utility-belt')).toBeInstanceOf(THREE.Mesh);
    expect(pack).toBeInstanceOf(THREE.Mesh);
    expect(pack!.position.z).toBeGreaterThan(0);
    expect(cleaner.model.getObjectByName('cleaner-bottle')).toBeInstanceOf(THREE.Mesh);

    for (const material of renderMaterials(cleaner.model)) {
      expect(materialColour(material)?.getHex()).not.toBe(PALETTE_HEX.alarm);
    }
  });

  it('restores source materials and disposes only its resources once', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x425064 });
    const cleaner = cleanerWith(shared);
    let bodyGeometryDisposals = 0;
    cleaner.body.geometry.dispose = () => {
      bodyGeometryDisposals += 1;
    };
    const appearance = applyCleanerAppearance(cleaner.model);
    const clonedBodyMaterial = cleaner.body.material as THREE.Material;
    const accessoryGeometries = new Set<THREE.BufferGeometry>();
    const accessoryMaterials = new Set<THREE.Material>();
    appearance.accessories.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) accessoryGeometries.add(mesh.geometry);
      if (mesh.material) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          accessoryMaterials.add(material);
        }
      }
    });

    let geometryDisposals = 0;
    let materialDisposals = 0;
    for (const geometry of accessoryGeometries) {
      geometry.dispose = () => {
        geometryDisposals += 1;
      };
    }
    for (const material of new Set([clonedBodyMaterial, ...accessoryMaterials])) {
      material.dispose = () => {
        materialDisposals += 1;
      };
    }

    appearance.dispose();
    appearance.dispose();

    expect(cleaner.body.material).toBe(shared);
    expect(cleaner.model.getObjectByName('cleaner-appearance')).toBeUndefined();
    expect(geometryDisposals).toBe(accessoryGeometries.size);
    expect(materialDisposals).toBe(accessoryMaterials.size + 1);
    expect(bodyGeometryDisposals).toBe(0);
  });
});
