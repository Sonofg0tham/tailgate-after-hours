import * as THREE from 'three';

// Bundled web fonts (OFL, recorded in CREDITS.md). Vite emits the woff2
// files into the build, nothing is fetched from a CDN at runtime. Only the
// weights actually used are imported.
import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import { parseLevel, surfaceAt, type LevelData } from './world/level';
import { extrudeLevel } from './world/Extruder';
import { loadCharacter, loadGuardCharacter } from './character/CharacterLoader';
import { AnimationController } from './character/AnimationController';
import { GuardAnimationController } from './character/GuardAnimationController';
import { MovementController } from './input/MovementController';
import { FollowCamera } from './camera/FollowCamera';
import { FpsMeter } from './perf/FpsMeter';
import { applyPaletteToCss, PALETTE_HEX } from './config/palette';
import { DETECTION } from './config/detection';
import { FixedTimestepLoop } from './sim/FixedTimestepLoop';
import { InputRecorder, type InputLogEntry } from './sim/InputLog';
import { stepHunt, type HuntEnvironment, type HuntState } from './sim/stepHunt';
import type { MovementIntent } from './input/InputState';
import { noiseRadius } from './systems/Noise';
import { NoiseRingRenderer } from './systems/NoiseRingRenderer';
import { createDebugToggles } from './systems/DebugToggles';
import { nightClockLabel } from './systems/NightClock';
import { buildLightGrid, lightLevelAtWorld } from './systems/LightModel';
import { buildLightGridMesh } from './systems/LightGridRenderer';
import { createGuardState, validateGuardRoutes, type GuardsData } from './entities/GuardState';
import { beamAppearanceFor, guardAnimationState, type GuardEvent } from './entities/GuardStateMachine';
import { TorchBeam } from './entities/TorchBeam';
import { DebugVisionCone } from './entities/DebugVisionCone';
import { Telemetry } from './telemetry/Telemetry';
import floor12 from './data/floor12.json';
import guardsDataRaw from './data/guards.json';

const FIXED_STEP_SECONDS = 1 / 60;

async function main(): Promise<void> {
  applyPaletteToCss();

  const appEl = document.getElementById('app');
  const hudElRaw = document.getElementById('hud');
  const suspicionFillRaw = document.getElementById('suspicion-fill');
  const detainedFlashRaw = document.getElementById('detained-flash');
  if (!appEl || !hudElRaw || !suspicionFillRaw || !detainedFlashRaw) {
    throw new Error('Expected #app, #hud, #suspicion-fill and #detained-flash elements in index.html');
  }
  // TS doesn't narrow captured consts across the frame() closure below, so
  // rebind to names whose type is provably non-null.
  const hudEl: HTMLElement = hudElRaw;
  const suspicionFillEl: HTMLElement = suspicionFillRaw;
  const detainedFlashEl: HTMLElement = detainedFlashRaw;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE_HEX.base);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  appEl.appendChild(renderer.domElement);

  const level = parseLevel(floor12 as LevelData);
  const extruded = extrudeLevel(level);
  scene.add(extruded.group);

  const lightGrid = buildLightGrid(level);
  const lightGridMesh = buildLightGridMesh(level, lightGrid);
  scene.add(lightGridMesh);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(4, 8, 4);
  scene.add(keyLight);

  const noiseRing = new NoiseRingRenderer();
  scene.add(noiseRing.mesh);

  const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

  const guardsData = guardsDataRaw as GuardsData;
  const isWalkable = (x: number, y: number): boolean => {
    const cell = level.cells[y]?.[x];
    return cell !== undefined && (cell.kind === 'floor' || cell.kind === 'door');
  };
  validateGuardRoutes(guardsData, isWalkable);

  const [player, ...guardCharacters] = await Promise.all([
    loadCharacter(),
    ...guardsData.guards.map(() => loadGuardCharacter()),
  ]);
  scene.add(player.model);
  const animation = new AnimationController(player.model, player.clips);

  const guards = guardsData.guards.map((routeDef, i) => {
    const character = guardCharacters[i];
    scene.add(character.model);
    const torch = new TorchBeam();
    scene.add(torch.mesh);
    const debugCone = new DebugVisionCone();
    scene.add(debugCone.mesh);
    return {
      routeDef,
      model: character.model,
      animation: new GuardAnimationController(character.model, character.clips),
      torch,
      debugCone,
    };
  });

  const huntEnv: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: guardsData.guards.map((g) => g.route),
  };

  function freshHuntState(): HuntState {
    return {
      player: {
        x: (level.playerStart.x + 0.5) * level.cellSize,
        z: (level.playerStart.y + 0.5) * level.cellSize,
        facingYaw: 0,
      },
      guards: guardsData.guards.map(createGuardState),
      alertLevel: { level: 0, msSinceIncident: 0 },
    };
  }

  let huntState = freshHuntState();
  let lastIntent: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
  let tick = 0;
  let replayQueue: InputLogEntry[] | null = null;
  let intentFrozen = false;
  let detainedFlashRemainingMs = 0;
  let animationPhaseMs = 0;

  const movement = new MovementController();
  const fps = new FpsMeter();
  const telemetry = new Telemetry();
  const clock = new THREE.Clock();

  const debugState = createDebugToggles((state) => {
    extruded.setGridOverlay(state.gridOverlay);
    extruded.setSurfaceTintDebug(state.surfaceTints);
    lightGridMesh.visible = state.lightGrid;
    for (const guard of guards) {
      guard.debugCone.mesh.visible = state.guardDebug;
    }
  });

  // Always recording: cheap (a few numbers per tick), and it's what proves
  // determinism — see src/sim/determinism.test.ts and CLAUDE.md's
  // measurement discipline. __inputLog/__startReplay are exposed on window
  // for manual replay verification during the Phase 2 proof pass (record a
  // run, then __startReplay(__inputLog()) and watch it retrace live,
  // guards included); a real "save/load a run" UI is later scope.
  const recorder = new InputRecorder('phase-2-dev', FIXED_STEP_SECONDS, huntState.player);
  Object.assign(window, {
    __inputLog: () => recorder.toLog(),
    __huntState: () => huntState,
    __wallBounds: () => extruded.wallBounds,
    __telemetry: () => telemetry.toWorksheet(),
    __startReplay: (log: ReturnType<typeof recorder.toLog>) => {
      huntState = { ...freshHuntState(), player: log.startState };
      replayQueue = [...log.entries];
    },
    // Dev-only positioning/debug hooks, for verification without needing to
    // simulate held input over real wall-clock time.
    __teleportTo: (x: number, z: number) => {
      huntState = { ...huntState, player: { x, z, facingYaw: huntState.player.facingYaw } };
    },
    __teleportGuard: (index: number, x: number, z: number, facingYaw = 0) => {
      const nextGuards = huntState.guards.slice();
      nextGuards[index] = { ...nextGuards[index], x, z, facingYaw };
      huntState = { ...huntState, guards: nextGuards };
    },
    __setGuardState: (index: number, partial: Record<string, unknown>) => {
      const nextGuards = huntState.guards.slice();
      nextGuards[index] = { ...nextGuards[index], ...partial };
      huntState = { ...huntState, guards: nextGuards };
    },
    __setDebug: (partial: Partial<typeof debugState>) => {
      Object.assign(debugState, partial);
      extruded.setGridOverlay(debugState.gridOverlay);
      extruded.setSurfaceTintDebug(debugState.surfaceTints);
      lightGridMesh.visible = debugState.lightGrid;
      for (const guard of guards) {
        guard.debugCone.mesh.visible = debugState.guardDebug;
      }
    },
    __forceIntent: (partial: Partial<MovementIntent>) => {
      intentFrozen = true;
      lastIntent = { ...lastIntent, ...partial };
    },
    __unfreezeIntent: () => {
      intentFrozen = false;
    },
  });

  const fixedLoop = new FixedTimestepLoop(FIXED_STEP_SECONDS, (deltaSeconds) => {
    const dtMs = deltaSeconds * 1000;

    if (detainedFlashRemainingMs > 0) {
      detainedFlashRemainingMs = Math.max(0, detainedFlashRemainingMs - dtMs);
      if (detainedFlashRemainingMs === 0) {
        huntState = freshHuntState();
      }
      return;
    }

    let intent: MovementIntent;
    if (intentFrozen) {
      intent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: lastIntent.device };
    } else if (replayQueue && replayQueue.length > 0) {
      intent = replayQueue.shift()!.intent;
    } else {
      replayQueue = null;
      intent = movement.update();
      recorder.record(tick++, intent);
    }

    const result = stepHunt(huntState, intent, huntEnv, deltaSeconds, dtMs);
    huntState = result.state;
    if (!intentFrozen) {
      lastIntent = intent;
    }

    const playerLight = lightLevelAtWorld(lightGrid, level.cellSize, huntState.player.x, huntState.player.z);
    telemetry.recordTick(deltaSeconds, playerLight);
    telemetry.recordEvents(result.events);

    if (detainedFlashRemainingMs === 0 && result.events.some((e: GuardEvent) => e.type === 'detain')) {
      detainedFlashRemainingMs = DETECTION.timing.detainedFlashMs;
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    followCamera.setAspect(window.innerWidth / window.innerHeight);
  });

  // Shader warm-up (Phase 1's finding): compile every material once, right
  // after the FIRST full update below has given every mesh (torch beams,
  // debug cones, the light grid) real geometry — compiling while any of
  // them still holds their constructor's empty placeholder BufferGeometry
  // is what caused the hang this is fixing, not just a missed optimisation.
  let warmedUp = false;

  function frame(): void {
    // Clamp delta so a dropped frame (tab backgrounded, GC pause) never
    // fires a burst of catch-up sim ticks in one go.
    const frameDelta = Math.min(clock.getDelta(), 1 / 20);
    animationPhaseMs += frameDelta * 1000;
    fixedLoop.advance(frameDelta);

    player.model.position.set(huntState.player.x, 0, huntState.player.z);
    player.model.rotation.y = huntState.player.facingYaw;
    animation.setState(lastIntent.speed, lastIntent.crouched);
    animation.update(frameDelta);

    for (let i = 0; i < guards.length; i++) {
      const guardState = huntState.guards[i];
      const guard = guards[i];
      guard.model.position.set(guardState.x, 0, guardState.z);
      guard.model.rotation.y = guardState.facingYaw;
      guard.animation.setState(guardAnimationState(guardState));
      guard.animation.update(frameDelta);
      guard.torch.update(
        level,
        guardState.x,
        guardState.z,
        guardState.facingYaw,
        DETECTION.vision.rangeCells,
        DETECTION.vision.fovDegrees,
        beamAppearanceFor(guardState.state),
        animationPhaseMs / 200,
      );
      guard.debugCone.update(guardState.x, guardState.z, guardState.facingYaw, DETECTION.vision.rangeCells, DETECTION.vision.fovDegrees);
    }

    followCamera.follow(huntState.player.x, huntState.player.z, lastIntent.directionX, lastIntent.directionZ, frameDelta);

    const surface = surfaceAt(level, huntState.player.x, huntState.player.z);
    const radius = noiseRadius(lastIntent.speed, surface);
    noiseRing.setVisible(debugState.noiseRing);
    noiseRing.update(huntState.player.x, huntState.player.z, radius);

    const maxSuspicion = Math.max(0, ...huntState.guards.map((g) => g.suspicion));
    suspicionFillEl.style.width = `${maxSuspicion}%`;
    suspicionFillEl.style.backgroundColor = maxSuspicion >= DETECTION.suspicion.curiousThreshold ? 'var(--alarm)' : 'var(--amber)';
    detainedFlashEl.style.opacity = detainedFlashRemainingMs > 0 ? '0.85' : '0';

    const currentFps = fps.tick();
    const hudLines = [
      `fps ${currentFps.toFixed(0)} (worst ${fps.getWorstFps().toFixed(0)})`,
      `speed ${lastIntent.speed}${lastIntent.crouched ? ' (crouched)' : ''}`,
      `noise ${radius.toFixed(1)}m`,
      `device ${lastIntent.device}`,
      `suspicion ${maxSuspicion.toFixed(0)}`,
      `alert level ${huntState.alertLevel.level}`,
      nightClockLabel(),
    ];
    if (debugState.guardDebug) {
      for (const guardState of huntState.guards) {
        hudLines.push(`${guardState.id}: ${guardState.state} (${guardState.suspicion.toFixed(0)})`);
      }
    }
    hudEl.textContent = hudLines.join('\n');

    if (!warmedUp) {
      warmedUp = true;
      renderer.compile(scene, followCamera.camera);
    }

    renderer.render(scene, followCamera.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error('Failed to start Tailgate: After Hours:', error);
  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
  }
});
