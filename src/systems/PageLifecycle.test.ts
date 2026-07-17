import { describe, expect, it, vi } from 'vitest';
import { disposeOnFinalPageHide } from './PageLifecycle';

describe('final page teardown', () => {
  it('keeps live resources for BFCache and disposes on a real page exit', () => {
    let listener: ((event: PageTransitionEvent) => void) | null = null;
    const target = {
      addEventListener: vi.fn((_type: 'pagehide', next: (event: PageTransitionEvent) => void) => {
        listener = next;
      }),
    } as unknown as Window;
    const dispose = vi.fn();

    disposeOnFinalPageHide(target, dispose);
    expect(listener).not.toBeNull();
    (listener as unknown as (event: Pick<PageTransitionEvent, 'persisted'>) => void)({ persisted: true });
    expect(dispose).not.toHaveBeenCalled();
    (listener as unknown as (event: Pick<PageTransitionEvent, 'persisted'>) => void)({ persisted: false });
    expect(dispose).toHaveBeenCalledOnce();
    (listener as unknown as (event: Pick<PageTransitionEvent, 'persisted'>) => void)({ persisted: false });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
