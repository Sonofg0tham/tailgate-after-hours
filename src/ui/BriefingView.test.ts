import { describe, expect, it } from 'vitest';
import {
  BRIEFING_GUIDANCE,
  filterBriefingInteraction,
  isBriefingDismissKey,
  isGamepadAPress,
} from './BriefingView';

describe('briefing guidance', () => {
  it('contains the four non-spoiler field conditions', () => {
    expect(BRIEFING_GUIDANCE).toEqual([
      'Darkness conceals the operator.',
      'Noise carries and can draw guards.',
      'Following authorised staff can get the operator through controlled doors.',
      'Planting and photographs require an uninterrupted hold with E or gamepad A.',
    ]);
  });
});

describe('briefing dismissal input', () => {
  it.each(['Enter', 'Space', 'KeyE'])('accepts %s', (code) => {
    expect(isBriefingDismissKey({ code, repeat: false })).toBe(true);
  });

  it('rejects repeats and unrelated keys', () => {
    expect(isBriefingDismissKey({ code: 'KeyE', repeat: true })).toBe(false);
    expect(isBriefingDismissKey({ code: 'Escape', repeat: false })).toBe(false);
  });

  it('treats only a released-to-held gamepad A transition as a press', () => {
    expect(isGamepadAPress(false, true)).toBe(true);
    expect(isGamepadAPress(true, true)).toBe(false);
    expect(isGamepadAPress(true, false)).toBe(false);
    expect(isGamepadAPress(false, false)).toBe(false);
  });

  it('suppresses a dismissal hold until E or gamepad A is physically released', () => {
    expect(filterBriefingInteraction(true, true)).toEqual({ suppressUntilRelease: true, interactHeld: false });
    expect(filterBriefingInteraction(true, false)).toEqual({ suppressUntilRelease: false, interactHeld: false });
    expect(filterBriefingInteraction(false, true)).toEqual({ suppressUntilRelease: false, interactHeld: true });
  });
});
