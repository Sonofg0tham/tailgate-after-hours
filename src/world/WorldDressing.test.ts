import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import floor12 from '../data/floor12.json';
import { PALETTE_HEX } from '../config/palette';
import { parseLevel, type LevelData, type ParsedLevel } from './level';

interface WorldDressing {
  group: THREE.Group;
  setHighContrast(enabled: boolean): void;
  dispose(): void;
}

interface WorldDressingModule {
  buildWorldDressing?: (level: ParsedLevel) => WorldDressing;
}

async function loadWorldDressing(): Promise<WorldDressingModule> {
  const modulePath = './WorldDressing';
  return import(/* @vite-ignore */ modulePath) as Promise<WorldDressingModule>;
}

const level = parseLevel(floor12 as LevelData);

function namedObjects(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  return matches;
}

function renderResources(root: THREE.Object3D): {
  meshes: THREE.Mesh[];
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
} {
  const meshes: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) materials.add(material);
  });
  return { meshes, geometries, materials };
}

describe('buildWorldDressing', () => {
  it('emits a named, silhouette-led prop signature for all five visual profiles', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const dressing = module.buildWorldDressing(level);
    const signatures = {
      lobby: ['lobby:polished-inset', 'lobby:access-gate', 'lobby:amber-pool'],
      office: ['office:partition', 'office:monitor-screen', 'office:desk-clutter'],
      service: ['service:pipe-run', 'service:utility-marking', 'service:cleaning-trolley'],
      server: ['server:raised-floor-seam', 'server:cable-run', 'server:rack-accent'],
      edge: ['edge:window-pane', 'edge:skyline-building'],
    } as const;

    for (const [profile, props] of Object.entries(signatures)) {
      expect(dressing.group.getObjectByName(`dressing:profile:${profile}`), profile).toBeInstanceOf(THREE.Group);
      for (const prop of props) {
        expect(namedObjects(dressing.group, prop).length, prop).toBeGreaterThan(0);
      }
    }
    expect(namedObjects(dressing.group, 'dressing:contact-darkness').length).toBeGreaterThan(0);
  });

  it('derives office screens and server accents from the authored furniture cells', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const dressing = module.buildWorldDressing(level);
    const placementsForProfile = (profile: 'office' | 'server', types: readonly string[]): number =>
      level.furniture.filter((placement) => {
        const zoneId = level.cells[placement.y]?.[placement.x]?.zone;
        return zoneId !== null && level.zones[zoneId]?.visualProfile === profile && types.includes(placement.type);
      }).length;

    expect(namedObjects(dressing.group, 'office:monitor-screen')).toHaveLength(
      placementsForProfile('office', ['desk', 'desk-exec']),
    );
    expect(namedObjects(dressing.group, 'server:rack-accent')).toHaveLength(
      placementsForProfile('server', ['rack']),
    );
  });

  it('keeps skyline geometry wholly outside the playable grid and adds no collision or lights', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const snapshot = JSON.stringify(level);
    const dressing = module.buildWorldDressing(level);
    dressing.group.updateMatrixWorld(true);
    const skyline = namedObjects(dressing.group, 'edge:skyline-building');
    expect(skyline.length).toBeGreaterThan(0);
    for (const building of skyline) {
      const bounds = new THREE.Box3().setFromObject(building);
      const outside =
        bounds.max.x <= 0 ||
        bounds.min.x >= level.width * level.cellSize ||
        bounds.max.z <= 0 ||
        bounds.min.z >= level.height * level.cellSize;
      expect(outside, `skyline bounds ${bounds.min.toArray()} to ${bounds.max.toArray()}`).toBe(true);
    }

    let lightCount = 0;
    dressing.group.traverse((object) => {
      if (object instanceof THREE.Light) lightCount += 1;
    });
    expect(lightCount).toBe(0);
    expect('wallBounds' in dressing).toBe(false);
    expect(JSON.stringify(level)).toBe(snapshot);
  });

  it('never uses alarm red and shares its low-poly geometries and materials', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const dressing = module.buildWorldDressing(level);
    const resources = renderResources(dressing.group);
    expect(resources.meshes.length).toBeGreaterThan(resources.geometries.size);
    expect(resources.meshes.length).toBeGreaterThan(resources.materials.size);
    for (const material of resources.materials) {
      const coloured = material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
      expect(coloured.color?.getHex()).not.toBe(PALETTE_HEX.alarm);
      expect(coloured.emissive?.getHex()).not.toBe(PALETTE_HEX.alarm);
    }
  });

  it('statically strengthens glow cues and contact readability in high contrast', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const dressing = module.buildWorldDressing(level);
    expect(typeof dressing.setHighContrast).toBe('function');
    if (typeof dressing.setHighContrast !== 'function') return;
    const amber = namedObjects(dressing.group, 'lobby:amber-pool')[0] as THREE.Mesh;
    const contact = namedObjects(dressing.group, 'dressing:contact-darkness')[0] as THREE.Mesh;
    const coolRack = namedObjects(dressing.group, 'server:cool-led')[0] as THREE.Mesh;
    const amberMaterial = amber.material as THREE.MeshBasicMaterial;
    const contactMaterial = contact.material as THREE.MeshBasicMaterial;
    const coolMaterial = coolRack.material as THREE.MeshBasicMaterial;
    const defaultAmberOpacity = amberMaterial.opacity;
    const defaultContactOpacity = contactMaterial.opacity;
    const defaultCoolLuminance = coolMaterial.color.getHSL({ h: 0, s: 0, l: 0 }).l;

    dressing.setHighContrast(true);

    expect(amberMaterial.opacity).toBeGreaterThan(defaultAmberOpacity);
    expect(contactMaterial.opacity).toBeGreaterThan(defaultContactOpacity);
    expect(coolMaterial.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThanOrEqual(defaultCoolLuminance);
    expect(coolMaterial.color.getHex()).not.toBe(PALETTE_HEX.alarm);

    dressing.setHighContrast(false);
    expect(amberMaterial.opacity).toBe(defaultAmberOpacity);
    expect(contactMaterial.opacity).toBe(defaultContactOpacity);
  });

  it('disposes every unique owned resource exactly once', async () => {
    const module = await loadWorldDressing();
    expect(typeof module?.buildWorldDressing).toBe('function');
    if (!module?.buildWorldDressing) return;

    const dressing = module.buildWorldDressing(level);
    const { geometries, materials } = renderResources(dressing.group);
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    dressing.dispose();
    dressing.dispose();

    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
