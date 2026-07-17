export type GuardFootstepRingMode = 'expanding' | 'static';

export interface GuardFootstepRingSlot {
  active: boolean;
  x: number;
  z: number;
  ageMs: number;
  mode: GuardFootstepRingMode;
  scale: number;
  opacity: number;
}

export interface GuardFootstepRingPoolOptions {
  capacity: number;
  maxDistanceMetres: number;
  lifetimeMs: number;
}

const START_SCALE = 0.75;
const STATIC_SCALE = 1;
const EXPANSION = 0.9;
const START_OPACITY = 0.24;

/**
 * Fixed-capacity, allocation-free runtime state for guard footstep rings.
 * It has no Three.js dependency, so range, expiry and reduced motion remain
 * unit-testable without a WebGL context.
 */
export class GuardFootstepRingPool {
  readonly rings: GuardFootstepRingSlot[];
  private readonly maxDistanceMetres: number;
  private readonly lifetimeMs: number;
  private nextIndex = 0;

  constructor(options: GuardFootstepRingPoolOptions) {
    this.maxDistanceMetres = options.maxDistanceMetres;
    this.lifetimeMs = options.lifetimeMs;
    this.rings = Array.from({ length: Math.max(0, Math.floor(options.capacity)) }, () => ({
      active: false,
      x: 0,
      z: 0,
      ageMs: 0,
      mode: 'static' as const,
      scale: STATIC_SCALE,
      opacity: 0,
    }));
  }

  trigger(x: number, z: number, distanceMetres: number, reducedMotion: boolean): boolean {
    if (
      this.rings.length === 0 ||
      !Number.isFinite(distanceMetres) ||
      distanceMetres < 0 ||
      distanceMetres > this.maxDistanceMetres
    ) {
      return false;
    }

    const ring = this.rings[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % this.rings.length;
    ring.active = true;
    ring.x = x;
    ring.z = z;
    ring.ageMs = 0;
    ring.mode = reducedMotion ? 'static' : 'expanding';
    ring.scale = reducedMotion ? STATIC_SCALE : START_SCALE;
    ring.opacity = START_OPACITY;
    return true;
  }

  update(dtMs: number): void {
    const elapsedMs = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    for (const ring of this.rings) {
      if (!ring.active) {
        continue;
      }
      ring.ageMs = Math.min(this.lifetimeMs, ring.ageMs + elapsedMs);
      if (ring.ageMs >= this.lifetimeMs) {
        ring.active = false;
        ring.opacity = 0;
        continue;
      }

      const progress = ring.ageMs / this.lifetimeMs;
      ring.opacity = START_OPACITY * (1 - progress);
      ring.scale = ring.mode === 'static' ? STATIC_SCALE : START_SCALE + EXPANSION * progress;
    }
  }

  clear(): void {
    this.nextIndex = 0;
    for (const ring of this.rings) {
      ring.active = false;
      ring.ageMs = 0;
      ring.opacity = 0;
      ring.scale = ring.mode === 'static' ? STATIC_SCALE : START_SCALE;
    }
  }
}
