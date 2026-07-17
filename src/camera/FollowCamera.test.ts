import { describe, expect, it } from 'vitest';
import { cameraHeightAboveFloor, deadzoneTarget, easeExponential, FollowCamera } from './FollowCamera';
import { MOVEMENT } from '../config/movement';
import { WALL_HEIGHT } from '../world/Extruder';

describe('easeExponential', () => {
  it('converges toward the target over enough time', () => {
    expect(easeExponential(0, 10, 6, 10)).toBeCloseTo(10, 1);
  });

  it('does not overshoot for a single small step', () => {
    const result = easeExponential(0, 10, 6, 1 / 60);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });
});

describe('deadzoneTarget', () => {
  const anchor = { x: 0, z: 0 };

  it('holds the anchor when the target is within the deadzone', () => {
    expect(deadzoneTarget(anchor, { x: 0.5, z: 0 }, 1.1)).toEqual(anchor);
  });

  it('pulls the anchor to the deadzone edge when the target exceeds it', () => {
    const result = deadzoneTarget(anchor, { x: 5, z: 0 }, 1.1);
    const distanceFromAnchor = Math.hypot(result.x - anchor.x, result.z - anchor.z);
    expect(distanceFromAnchor).toBeCloseTo(5 - 1.1, 5);
  });
});

describe('camera never clips through walls', () => {
  it('stays above wall height even at the closest allowed zoom', () => {
    const heightAtMinDistance = cameraHeightAboveFloor(MOVEMENT.camera.minDistance, MOVEMENT.camera.tiltDegrees);
    expect(heightAtMinDistance).toBeGreaterThan(WALL_HEIGHT);
  });
});

describe('camera distance', () => {
  it('defaults to exactly 8.5 m, clamps live settings, and keeps wheel zoom bounded', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const listeners: Record<string, (event: { deltaY: number }) => void> = {};
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: (type: string, listener: (event: { deltaY: number }) => void) => {
          listeners[type] = listener;
        },
      },
    });

    try {
      const wheelChanges: number[] = [];
      const camera = new FollowCamera(16 / 9, (distance) => wheelChanges.push(distance));
      expect(camera.distance).toBe(8.5);

      camera.setDistance(10);
      expect(camera.distance).toBe(10);
      camera.setDistance(99);
      expect(camera.distance).toBe(MOVEMENT.camera.maxDistance);
      camera.setDistance(-99);
      expect(camera.distance).toBe(MOVEMENT.camera.minDistance);

      camera.setDistance(8.5);
      listeners.wheel({ deltaY: 10_000 });
      expect(camera.distance).toBe(MOVEMENT.camera.maxDistance);
      listeners.wheel({ deltaY: -10_000 });
      expect(camera.distance).toBe(MOVEMENT.camera.minDistance);
      expect(wheelChanges).toEqual([MOVEMENT.camera.maxDistance, MOVEMENT.camera.minDistance]);
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
