import * as THREE from 'three';

// Procedural low-poly greybox furniture, one builder per type. Every prop is
// built from primitives and centred on its 1m cell. Shapes are deliberately
// distinct by silhouette (height, footprint), not just colour — the same
// accessibility rule as everything else: colour is never the only signal.

const MATERIAL = new THREE.MeshStandardMaterial({ color: 0x565f6e, roughness: 0.8 });
const ACCENT_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x6b7688, roughness: 0.7 });

function box(w: number, h: number, d: number, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = y;
  return mesh;
}

function desk(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(box(0.75, 0.05, 0.45, MATERIAL, 0.7));
  group.add(box(0.7, 0.68, 0.05, ACCENT_MATERIAL, 0.34)); // modesty panel
  return group;
}

function deskExec(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(box(0.9, 0.06, 0.55, MATERIAL, 0.72));
  group.add(box(0.85, 0.72, 0.06, ACCENT_MATERIAL, 0.36));
  group.add(box(0.4, 0.5, 0.4, ACCENT_MATERIAL, 0.25)); // chair stand-in, set back
  return group;
}

function rack(): THREE.Object3D {
  // Tall and narrow — height alone should read as "server rack" at a glance.
  return box(0.55, 1.8, 0.65, MATERIAL, 0.9);
}

function counter(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(box(0.9, 0.9, 0.55, MATERIAL, 0.45)); // worktop cabinet
  group.add(box(0.9, 0.4, 0.08, ACCENT_MATERIAL, 1.1)); // backsplash
  return group;
}

function printer(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(box(0.5, 0.55, 0.45, MATERIAL, 0.6)); // stand
  group.add(box(0.55, 0.35, 0.5, ACCENT_MATERIAL, 1.05)); // print unit, wider than the stand
  return group;
}

function breaker(): THREE.Object3D {
  // A shallow panel mounted high, distinct from every other prop by depth.
  return box(0.5, 0.7, 0.12, ACCENT_MATERIAL, 1.3);
}

const BUILDERS: Record<string, () => THREE.Object3D> = {
  desk,
  'desk-exec': deskExec,
  rack,
  counter,
  printer,
  breaker,
};

export function buildFurniture(type: string): THREE.Object3D {
  const builder = BUILDERS[type];
  if (!builder) {
    throw new Error(`No furniture builder for type "${type}"`);
  }
  return builder();
}
