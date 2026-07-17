import { describe, expect, it } from 'vitest';

interface ProductionBundleValidatorModule {
  assertProductionBundleClean?: (files: ReadonlyArray<{ path: string; source: string }>) => void;
}

async function loadValidator(): Promise<ProductionBundleValidatorModule | null> {
  const modulePath = './validateProductionBundle';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<ProductionBundleValidatorModule | null>;
}

describe('assertProductionBundleClean', () => {
  it('rejects emitted JavaScript containing a forbidden automation hook', async () => {
    const validator = await loadValidator();
    expect(typeof validator?.assertProductionBundleClean).toBe('function');
    if (!validator?.assertProductionBundleClean) return;

    expect(() =>
      validator.assertProductionBundleClean?.([
        { path: 'dist/assets/index-fixture.js', source: 'Object.assign(window,{__teleportTo(){}});' },
      ]),
    ).toThrow(/index-fixture\.js.*__teleportTo/);

    expect(() =>
      validator.assertProductionBundleClean?.([
        { path: 'dist/assets/index-renderer-fixture.js', source: 'window.__rendererInfo=()=>({});' },
      ]),
    ).toThrow(/index-renderer-fixture\.js.*__rendererInfo/);
  });

  it('accepts emitted JavaScript without forbidden hooks', async () => {
    const validator = await loadValidator();
    expect(typeof validator?.assertProductionBundleClean).toBe('function');
    if (!validator?.assertProductionBundleClean) return;

    expect(() =>
      validator.assertProductionBundleClean?.([
        { path: 'dist/assets/index-clean.js', source: 'const playerHud={objective:"RETURN TO SERVICE LIFT"};' },
      ]),
    ).not.toThrow();
  });
});
