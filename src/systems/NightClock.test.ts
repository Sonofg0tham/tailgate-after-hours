import { describe, expect, it } from 'vitest';
import { fictionalDurationLabel, isDawn, nightClockLabel, stampClock } from './NightClock';
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

describe('fictionalDurationLabel', () => {
  it('is 00:00 for a zero span', () => {
    expect(fictionalDurationLabel(0)).toBe('00:00');
  });

  it('maps half the real night to 02:00 of fictional time', () => {
    expect(fictionalDurationLabel(MISSION.dawnDeadlineMs / 2)).toBe('02:00');
  });

  it('maps the whole real night to exactly 04:00, never the raw real minutes', () => {
    expect(fictionalDurationLabel(MISSION.dawnDeadlineMs)).toBe('04:00');
  });

  it('clamps a span longer than the night to 04:00', () => {
    expect(fictionalDurationLabel(MISSION.dawnDeadlineMs * 5)).toBe('04:00');
  });

  it('clamps a negative span to 00:00', () => {
    expect(fictionalDurationLabel(-1000)).toBe('00:00');
  });
});
