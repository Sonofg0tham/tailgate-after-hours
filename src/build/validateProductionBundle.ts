export interface EmittedJavaScript {
  path: string;
  source: string;
}

export const FORBIDDEN_PRODUCTION_HOOKS = [
  '__inputLog',
  '__huntState',
  '__wallBounds',
  '__telemetry',
  '__startReplay',
  '__teleportTo',
  '__teleportGuard',
  '__setGuardState',
  '__setDebug',
  '__forceIntent',
  '__unfreezeIntent',
  '__setSimTime',
  '__badgeDoor',
  '__teleportStaff',
  '__driveIntent',
  '__clearDrivenIntent',
  '__throwBolt',
  '__missionState',
  '__driveInteract',
  '__setVolume',
  '__rendererInfo',
  '__forceFrame',
  '__begin',
  '__pause',
  '__abandon',
  '__appState',
  '__applySettings',
] as const;

/** Fails when a production JavaScript asset still contains a known development hook. */
export function assertProductionBundleClean(files: ReadonlyArray<EmittedJavaScript>): void {
  for (const file of files) {
    for (const hook of FORBIDDEN_PRODUCTION_HOOKS) {
      if (file.source.includes(hook)) {
        throw new Error(`Production bundle validation failed: ${file.path} contains forbidden hook ${hook}.`);
      }
    }
  }
}
