import { describe, expect, it } from 'vitest';
import { isDawn, nightClockLabel, stampClock } from './NightClock';
import { MISSION } from '../config/mission';

describe('nightClockLabel', () => {
  it('reads 01:00 at the start of the night', () => {
    expect(nightClockLabel(0)).toBe('01:00');
  });

  it('reads 03:00 at the halfway point', () => {
    expect(nightClockLabel(MISSION.dawnDeadlineMs / 2)).toBe('03:00');
  });

  it('reads 05:00 exactly at the dawn deadline', () => {
    expect(nightClockLabel(MISSION.dawnDeadlineMs)).toBe('05:00');
  });

  it('clamps at 05:00 past the deadline (never rolls over)', () => {
    expect(nightClockLabel(MISSION.dawnDeadlineMs * 2)).toBe('05:00');
  });

  it('advances a quarter of the night to 02:00', () => {
    expect(nightClockLabel(MISSION.dawnDeadlineMs / 4)).toBe('02:00');
  });
});

describe('isDawn', () => {
  it('is false before the deadline', () => {
    expect(isDawn(MISSION.dawnDeadlineMs - 1)).toBe(false);
  });

  it('is true at and past the deadline', () => {
    expect(isDawn(MISSION.dawnDeadlineMs)).toBe(true);
    expect(isDawn(MISSION.dawnDeadlineMs + 1)).toBe(true);
  });
});

describe('stampClock', () => {
  it('stamps an event at the start as 01:00', () => {
    expect(stampClock(0)).toBe('01:00');
  });

  it('stamps a three-quarter-night event as 04:00', () => {
    expect(stampClock((MISSION.dawnDeadlineMs * 3) / 4)).toBe('04:00');
  });
});
