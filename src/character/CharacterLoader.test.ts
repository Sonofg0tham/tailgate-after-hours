import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GltfAssetCache, type GltfAsset } from './CharacterLoader';

function riggedAsset(): GltfAsset {
  const scene = new THREE.Group();
  const rootBone = new THREE.Bone();
  rootBone.name = 'Rig_Medium';
  const handBone = new THREE.Bone();
  handBone.name = 'Hand';
  rootBone.add(handBone);

  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = 'Body';
  mesh.add(rootBone);
  mesh.bind(new THREE.Skeleton([rootBone, handBone]));
  scene.add(mesh);

  return { scene, animations: [new THREE.AnimationClip('Idle_A', 1, [])] };
}

function skinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) found = object as THREE.SkinnedMesh;
  });
  if (!found) throw new Error('Test rig has no skinned mesh.');
  return found;
}

describe('GltfAssetCache', () => {
  it('parses each URL once and gives every character an independent skeleton and mixer', async () => {
    let loadCount = 0;
    const source = riggedAsset();
    const cache = new GltfAssetCache(async () => {
      loadCount += 1;
      return source;
    });

    const [loadedA, loadedB] = await Promise.all([cache.load('/shared.glb'), cache.load('/shared.glb')]);
    expect(loadCount).toBe(1);
    expect(loadedA).toBe(loadedB);

    const [instanceA, instanceB] = await Promise.all([
      cache.instantiate('/shared.glb'),
      cache.instantiate('/shared.glb'),
    ]);
    const meshA = skinnedMesh(instanceA.scene);
    const meshB = skinnedMesh(instanceB.scene);
    const mixerA = new THREE.AnimationMixer(instanceA.scene);
    const mixerB = new THREE.AnimationMixer(instanceB.scene);

    expect(loadCount).toBe(1);
    expect(instanceA.scene).not.toBe(source.scene);
    expect(instanceB.scene).not.toBe(source.scene);
    expect(instanceA.scene).not.toBe(instanceB.scene);
    expect(meshA.skeleton).not.toBe(meshB.skeleton);
    expect(meshA.skeleton.bones[0]).not.toBe(meshB.skeleton.bones[0]);
    expect(mixerA).not.toBe(mixerB);
    expect(instanceA.animations).toBe(source.animations);
  });

  it('evicts a rejected load so the same URL can be retried', async () => {
    let attempts = 0;
    const source = riggedAsset();
    const cache = new GltfAssetCache(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network interrupted');
      return source;
    });

    await expect(cache.load('/retry.glb')).rejects.toThrow('network interrupted');
    await expect(cache.load('/retry.glb')).resolves.toBe(source);
    expect(attempts).toBe(2);
  });
});
