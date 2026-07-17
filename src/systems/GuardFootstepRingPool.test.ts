import { describe, expect, it } from 'vitest';

interface RingSlot {
  active: boolean;
  x: number;
  z: number;
  ageMs: number;
  mode: 'expanding' | 'static';
  scale: number;
  opacity: number;
}

interface RingPool {
  readonly rings: readonly RingSlot[];
  trigger(x: number, z: number, distanceMetres: number, reducedMotion: boolean): boolean;
  update(dtMs: number): void;
  clear(): void;
}

interface RingPoolModule {
  GuardFootstepRingPool?: new (options: {
    capacity: number;
    maxDistanceMetres: number;
    lifetimeMs: number;
  }) => RingPool;
}

async function loadPool(): Promise<RingPoolModule | null> {
  const modulePath = './GuardFootstepRingPool';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<RingPoolModule | null>;
}

describe('GuardFootstepRingPool', () => {
  it('preallocates a fixed set of slots and reuses them in ring order', async () => {
    const module = await loadPool();
    expect(typeof module?.GuardFootstepRingPool).toBe('function');
    if (!module?.GuardFootstepRingPool) return;

    const pool = new module.GuardFootstepRingPool({ capacity: 2, maxDistanceMetres: 14, lifetimeMs: 600 });
    const originalSlots = [...pool.rings];

    pool.trigger(1, 1, 2, false);
    pool.trigger(2, 2, 3, false);
    pool.trigger(3, 3, 4, false);

    expect(pool.rings).toHaveLength(2);
    expect(pool.rings[0]).toBe(originalSlots[0]);
    expect(pool.rings[1]).toBe(originalSlots[1]);
    expect(pool.rings.map((ring) => [ring.x, ring.z])).toEqual([
      [3, 3],
      [2, 2],
    ]);
  });

  it('does not activate a ring beyond the existing spatial-audio range', async () => {
    const module = await loadPool();
    expect(typeof module?.GuardFootstepRingPool).toBe('function');
    if (!module?.GuardFootstepRingPool) return;

    const pool = new module.GuardFootstepRingPool({ capacity: 2, maxDistanceMetres: 14, lifetimeMs: 600 });

    expect(pool.trigger(1, 1, 14.01, false)).toBe(false);
    expect(pool.rings.every((ring) => !ring.active)).toBe(true);
    expect(pool.trigger(1, 1, 14, false)).toBe(true);
  });

  it('fades and expires a ring at its fixed lifetime', async () => {
    const module = await loadPool();
    expect(typeof module?.GuardFootstepRingPool).toBe('function');
    if (!module?.GuardFootstepRingPool) return;

    const pool = new module.GuardFootstepRingPool({ capacity: 1, maxDistanceMetres: 14, lifetimeMs: 600 });
    pool.trigger(1, 1, 2, false);
    const initialOpacity = pool.rings[0].opacity;

    pool.update(300);
    expect(pool.rings[0]).toMatchObject({ active: true, ageMs: 300 });
    expect(pool.rings[0].opacity).toBeLessThan(initialOpacity);

    pool.update(300);
    expect(pool.rings[0]).toMatchObject({ active: false, ageMs: 600, opacity: 0 });
  });

  it('uses a static non-expanding ring in reduced motion while retaining the short fade', async () => {
    const module = await loadPool();
    expect(typeof module?.GuardFootstepRingPool).toBe('function');
    if (!module?.GuardFootstepRingPool) return;

    const pool = new module.GuardFootstepRingPool({ capacity: 1, maxDistanceMetres: 14, lifetimeMs: 600 });
    pool.trigger(1, 1, 2, true);
    const initialScale = pool.rings[0].scale;
    const initialOpacity = pool.rings[0].opacity;

    pool.update(300);

    expect(pool.rings[0].mode).toBe('static');
    expect(pool.rings[0].scale).toBe(initialScale);
    expect(pool.rings[0].opacity).toBeLessThan(initialOpacity);
  });

  it('expands only in full motion and clears every active slot for a fresh engagement', async () => {
    const module = await loadPool();
    expect(typeof module?.GuardFootstepRingPool).toBe('function');
    if (!module?.GuardFootstepRingPool) return;

    const pool = new module.GuardFootstepRingPool({ capacity: 2, maxDistanceMetres: 14, lifetimeMs: 600 });
    pool.trigger(1, 1, 2, false);
    const initialScale = pool.rings[0].scale;
    pool.update(300);
    expect(pool.rings[0].scale).toBeGreaterThan(initialScale);

    pool.trigger(2, 2, 2, false);
    pool.clear();
    expect(pool.rings.every((ring) => !ring.active && ring.opacity === 0)).toBe(true);
  });
});
