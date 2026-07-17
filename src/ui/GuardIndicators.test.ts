import { describe, expect, it } from 'vitest';
import type { GuardStateName } from '../entities/GuardState';

interface GuardIndicatorPresentation {
  id: string;
  state: Exclude<GuardStateName, 'patrol'>;
  label: string;
  tone: 'investigation' | 'alert';
  xPx: number;
  yPx: number;
  angleDegrees: number;
}

interface ProjectionInput {
  id: string;
  state: GuardStateName;
  ndcX: number;
  ndcY: number;
  behindCamera: boolean;
  viewportWidth: number;
  viewportHeight: number;
  safeInsetX: number;
  safeInsetY: number;
}

interface FakeElement {
  textContent: string;
  hidden: boolean;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  style: {
    values: Record<string, string>;
    setProperty(name: string, value: string): void;
  };
  setAttribute(name: string, value: string): void;
}

interface GuardIndicatorModule {
  projectGuardIndicator?: (input: ProjectionInput) => GuardIndicatorPresentation | null;
  GuardIndicatorPresenter?: new (
    elements: ReadonlyArray<{ root: FakeElement; label: FakeElement; chevron: FakeElement }>,
  ) => { render(models: readonly (GuardIndicatorPresentation | null)[]): void };
}

async function loadIndicators(): Promise<GuardIndicatorModule | null> {
  const modulePath = './GuardIndicators';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<GuardIndicatorModule | null>;
}

function projection(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    id: 'guard-north',
    state: 'curious',
    ndcX: 2,
    ndcY: 0,
    behindCamera: false,
    viewportWidth: 1000,
    viewportHeight: 600,
    safeInsetX: 80,
    safeInsetY: 50,
    ...overrides,
  };
}

function element(): FakeElement {
  const values: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    attributes,
    style: {
      values,
      setProperty(name, value) {
        values[name] = value;
      },
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
}

describe('projectGuardIndicator', () => {
  it('filters normal patrol guards and guards already inside the viewport', async () => {
    const module = await loadIndicators();
    expect(typeof module?.projectGuardIndicator).toBe('function');
    if (!module?.projectGuardIndicator) return;

    expect(module.projectGuardIndicator(projection({ state: 'patrol' }))).toBeNull();
    expect(module.projectGuardIndicator(projection({ state: 'alert', ndcX: 0.2, ndcY: -0.3 }))).toBeNull();
  });

  it.each(['curious', 'searching', 'sweep', 'alert'] as const)(
    'selects an off-screen %s guard with visible state copy',
    async (state) => {
      const module = await loadIndicators();
      expect(typeof module?.projectGuardIndicator).toBe('function');
      if (!module?.projectGuardIndicator) return;

      const model = module.projectGuardIndicator(projection({ state }));

      expect(model).toMatchObject({
        id: 'guard-north',
        state,
        label: `GUARD · ${state.toUpperCase()}`,
        tone: state === 'alert' ? 'alert' : 'investigation',
      });
    },
  );

  it.each([
    ['right', { ndcX: 2, ndcY: 0 }, { xPx: 920, yPx: 300, angleDegrees: 0 }],
    ['left', { ndcX: -2, ndcY: 0 }, { xPx: 80, yPx: 300, angleDegrees: 180 }],
    ['top', { ndcX: 0, ndcY: 2 }, { xPx: 500, yPx: 50, angleDegrees: -90 }],
    ['bottom', { ndcX: 0, ndcY: -2 }, { xPx: 500, yPx: 550, angleDegrees: 90 }],
  ] as const)('clamps to the %s safe edge', async (_edge, point, expected) => {
    const module = await loadIndicators();
    expect(typeof module?.projectGuardIndicator).toBe('function');
    if (!module?.projectGuardIndicator) return;

    expect(module.projectGuardIndicator(projection(point))).toMatchObject(expected);
  });

  it('reverses behind-camera direction instead of pointing at the mirrored projection', async () => {
    const module = await loadIndicators();
    expect(typeof module?.projectGuardIndicator).toBe('function');
    if (!module?.projectGuardIndicator) return;

    const model = module.projectGuardIndicator(projection({ ndcX: 0.5, behindCamera: true }));

    expect(model).toMatchObject({ xPx: 80, yPx: 300, angleDegrees: 180 });
  });

  it('uses a finite deterministic direction when a behind-camera projection has zero distance', async () => {
    const module = await loadIndicators();
    expect(typeof module?.projectGuardIndicator).toBe('function');
    if (!module?.projectGuardIndicator) return;

    const model = module.projectGuardIndicator(projection({ ndcX: 0, ndcY: 0, behindCamera: true }));

    expect(model).toMatchObject({ xPx: 500, yPx: 50, angleDegrees: -90 });
    expect(Number.isFinite(model?.xPx)).toBe(true);
    expect(Number.isFinite(model?.yPx)).toBe(true);
    expect(Number.isFinite(model?.angleDegrees)).toBe(true);
  });
});

describe('GuardIndicatorPresenter', () => {
  it('updates a marker slot and hides unused slots without removing their DOM', async () => {
    const module = await loadIndicators();
    expect(typeof module?.GuardIndicatorPresenter).toBe('function');
    if (!module?.GuardIndicatorPresenter) return;

    const first = { root: element(), label: element(), chevron: element() };
    const second = { root: element(), label: element(), chevron: element() };
    const presenter = new module.GuardIndicatorPresenter([first, second]);
    const model: GuardIndicatorPresentation = {
      id: 'guard-north',
      state: 'searching',
      label: 'GUARD · SEARCHING',
      tone: 'investigation',
      xPx: 920,
      yPx: 300,
      angleDegrees: 12.5,
    };

    presenter.render([model, null]);

    expect(first.root.hidden).toBe(false);
    expect(first.root.dataset.guardState).toBe('searching');
    expect(first.root.dataset.tone).toBe('investigation');
    expect(first.root.attributes['aria-hidden']).toBe('false');
    expect(first.root.style.values['--guard-x']).toBe('920px');
    expect(first.root.style.values['--guard-y']).toBe('300px');
    expect(first.label.textContent).toBe('GUARD · SEARCHING');
    expect(first.chevron.style.values['--guard-angle']).toBe('12.5deg');
    expect(second.root.hidden).toBe(true);
    expect(second.root.attributes['aria-hidden']).toBe('true');
  });
});
