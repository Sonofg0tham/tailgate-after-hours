import * as THREE from 'three';
import { RENDER_LIGHTING } from '../config/renderLighting';
import type { ParsedLevel } from '../world/level';

/**
 * The visible half of each placed light source: a small self-lit fixture
 * mesh (so the light has a believable origin) plus a modest no-shadow
 * PointLight that shades characters and furniture standing near it. The
 * floor and walls deliberately IGNORE these lights — their brightness comes
 * from the sim's light grid (see Extruder.ts), which is what keeps the
 * render honest. Fixture style is picked by the source's zone: ceiling
 * panels as the default, a desk lamp in the corner office, an LED wash in
 * the server room, the vending-machine glow in the kitchen.
 */
export interface FixtureVisuals {
  group: THREE.Group;
  dispose(): void;
}

export function buildFixtures(level: ParsedLevel): FixtureVisuals {
  const group = new THREE.Group();
  const { cellSize } = level;

  for (const source of level.lights) {
    const zone = level.cells[source.y]?.[source.x]?.zone ?? 'corridor';
    const centerX = (source.x + 0.5) * cellSize;
    const centerZ = (source.y + 0.5) * cellSize;

    const fixture = buildFixtureMesh(zone);
    fixture.position.set(centerX, 0, centerZ);
    group.add(fixture);

    const light = new THREE.PointLight(
      RENDER_LIGHTING.sourceLights.color,
      RENDER_LIGHTING.sourceLights.intensity * source.intensity,
      source.radius * RENDER_LIGHTING.sourceLights.distanceScale,
      1.6,
    );
    light.position.set(centerX, RENDER_LIGHTING.sourceLights.heightMetres, centerZ);
    light.castShadow = false; // static occlusion is the grid's job; only torches cast
    group.add(light);
  }

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of list) materials.add(material);
    }
  });
  let disposed = false;

  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}

function emissive(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

function buildFixtureMesh(zone: string): THREE.Group {
  const g = new THREE.Group();

  if (zone === 'server-room') {
    // An LED wash: thin cool strips at rack height either side of the aisle.
    for (const dz of [-0.9, 0.9]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), emissive(RENDER_LIGHTING.fixtures.serverLed));
      strip.position.set(0, 1.7, dz);
      g.add(strip);
    }
    return g;
  }

  if (zone === 'kitchen') {
    // The vending glow: an upright lit panel beside the counters.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.06), emissive(RENDER_LIGHTING.fixtures.vendingGlow));
    panel.position.set(0, 1.1, -0.42);
    g.add(panel);
    return g;
  }

  if (zone === 'corner-office') {
    // A desk lamp: a small warm shade low over the exec desk.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 10, 1, true), emissive(RENDER_LIGHTING.fixtures.deskLamp));
    shade.position.set(0, 0.95, 0);
    g.add(shade);
    return g;
  }

  // Default: a ceiling panel — office banks, reception, anywhere unlabelled.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.6), emissive(RENDER_LIGHTING.fixtures.ceilingPanel));
  panel.position.set(0, 2.85, 0);
  g.add(panel);
  return g;
}
