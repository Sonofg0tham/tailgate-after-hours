import { describe, expect, it } from 'vitest';
import type { DetainCause } from '../entities/GuardStateMachine';

interface DetentionFeedbackModule {
  DETENTION_MESSAGES?: Readonly<Record<DetainCause, string>>;
  detentionMessageFor?: (cause: DetainCause) => string;
}

async function loadFeedback(): Promise<DetentionFeedbackModule | null> {
  const modulePath = './DetentionFeedback';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<DetentionFeedbackModule | null>;
}

describe('detentionMessageFor', () => {
  it.each([
    ['chase', 'Caught during an active chase.'],
    ['seen-contact', 'Seen at close range.'],
    ['guard-contact', 'Moved into a guard at close range.'],
  ] as const)('maps %s to plain-English feedback', async (cause, message) => {
    const module = await loadFeedback();
    expect(typeof module?.detentionMessageFor).toBe('function');
    if (!module?.detentionMessageFor) return;

    expect(module.detentionMessageFor(cause)).toBe(message);
  });

  it('exposes exactly one message for every detention cause', async () => {
    const module = await loadFeedback();
    expect(module?.DETENTION_MESSAGES).toBeDefined();
    if (!module?.DETENTION_MESSAGES) return;

    expect(Object.keys(module.DETENTION_MESSAGES).sort()).toEqual(['chase', 'guard-contact', 'seen-contact']);
    expect(Object.values(module.DETENTION_MESSAGES).every((message) => message.trim().length > 0)).toBe(true);
  });
});
