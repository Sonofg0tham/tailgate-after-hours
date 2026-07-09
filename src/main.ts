import * as THREE from 'three';

// Bundled web fonts (OFL, recorded in CREDITS.md). Vite emits the woff2
// files into the build, nothing is fetched from a CDN at runtime. Only the
// weights actually used are imported.
import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import { parseLevel, surfaceAt, type LevelData } from './world/level';
import { extrudeLevel } from './world/Extruder';
import { loadCharacter } from './character/CharacterLoader';
import { AnimationController } from './character/AnimationController';
import { MovementController } from './input/MovementController';
import { FollowCamera } from './camera/FollowCamera';
import { FpsMeter } from './perf/FpsMeter';
import { applyPaletteToCss, PALETTE_HEX } from './config/palette';
import { FixedTimestepLoop } from './sim/FixedTimestepLoop';
import { InputRecorder } from './sim/InputLog';
import { stepPlayer } from './sim/step';
import type { PlayerState } from './sim/PlayerState';
import type { MovementIntent } from './input/InputState';
import { noiseRadius } from './systems/Noise';
import { NoiseRingRenderer } from './systems/NoiseRingRenderer';
import { createDebugToggles } from './systems/DebugToggles';
import { nightClockLabel } from './systems/NightClock';
import floor12 from './data/floor12.json';

const FIXED_STEP_SECONDS = 1 / 60;

async function main(): Promise<void> {
  applyPaletteToCss();

  const appEl = document.getElementById('app');
  const hudElRaw = document.getElementById('hud');
  if (!appEl || !hudElRaw) {
    throw new Error('Expected #app and #hud elements in index.html');
  }
  // TS doesn't narrow a captured const across the frame() closure below, so
  // rebind to a name whose type is provably non-null.
  const hudEl: HTMLElement = hudElRaw;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE_HEX.base);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  appEl.appendChild(renderer.domElement);

  const level = parseLevel(floor12 as LevelData);
  const extruded = extrudeLevel(level);
  scene.add(extruded.group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(4, 8, 4);
  scene.add(keyLight);

  const noiseRing = new NoiseRingRenderer();
  scene.add(noiseRing.mesh);

  const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

  const { model, clips } = await loadCharacter();
  scene.add(model);
  const animation = new AnimationController(model, clips);

  const movement = new MovementController();
  const fps = new FpsMeter();
  const clock = new THREE.Clock();

  const debugState = createDebugToggles((state) => {
    extruded.setGridOverlay(state.gridOverlay);
    extruded.setSurfaceTintDebug(state.surfaceTints);
  });

  const startState: PlayerState = {
    x: (level.playerStart.x + 0.5) * level.cellSize,
    z: (level.playerStart.y + 0.5) * level.cellSize,
    facingYaw: 0,
  };
  let playerState = startState;
  let lastIntent: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
  let tick = 0;
  let replayQueue: { tick: number; intent: MovementIntent }[] | null = null;
  let intentFrozen = false;

  // Always recording: cheap (a few numbers per tick), and it's what proves
  // determinism — see src/sim/determinism.test.ts and CLAUDE.md's
  // measurement discipline. __inputLog/__startReplay are exposed on window
  // for manual replay verification during Phase 1's proof pass (record a
  // run, then __startReplay(__inputLog()) and watch it retrace live); a real
  // "save/load a run" UI is later scope.
  const recorder = new InputRecorder('phase-1-dev', FIXED_STEP_SECONDS, startState);
  Object.assign(window, {
    __inputLog: () => recorder.toLog(),
    __playerState: () => playerState,
    __wallBounds: () => extruded.wallBounds,
    __startReplay: (log: ReturnType<typeof recorder.toLog>) => {
      playerState = log.startState;
      replayQueue = [...log.entries];
    },
    // Dev-only positioning/debug hooks, for verification without needing to
    // simulate held input over real wall-clock time.
    __teleportTo: (x: number, z: number) => {
      playerState = { x, z, facingYaw: playerState.facingYaw };
    },
    __setDebug: (partial: Partial<typeof debugState>) => {
      Object.assign(debugState, partial);
      extruded.setGridOverlay(debugState.gridOverlay);
      extruded.setSurfaceTintDebug(debugState.surfaceTints);
    },
    // Freezes lastIntent (what drives animation/HUD/noise display) at the
    // given values, and stops feeding live input into the simulation, so a
    // screenshot can show a specific speed/surface combination without the
    // position drifting away from a __teleportTo call. __unfreezeIntent
    // hands control back to real input.
    __forceIntent: (partial: Partial<MovementIntent>) => {
      intentFrozen = true;
      lastIntent = { ...lastIntent, ...partial };
    },
    __unfreezeIntent: () => {
      intentFrozen = false;
    },
  });

  const fixedLoop = new FixedTimestepLoop(FIXED_STEP_SECONDS, (deltaSeconds) => {
    if (intentFrozen) {
      // Simulation stays idle (position doesn't drift); only the display
      // layer (frame(), below) shows the frozen lastIntent.
      playerState = stepPlayer(
        playerState,
        { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: lastIntent.device },
        deltaSeconds,
        extruded.wallBounds,
      );
      return;
    }

    let intent: MovementIntent;
    if (replayQueue && replayQueue.length > 0) {
      intent = replayQueue.shift()!.intent;
    } else {
      replayQueue = null;
      intent = movement.update();
      recorder.record(tick++, intent);
    }
    playerState = stepPlayer(playerState, intent, deltaSeconds, extruded.wallBounds);
    lastIntent = intent;
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    followCamera.setAspect(window.innerWidth / window.innerHeight);
  });

  function frame(): void {
    // Clamp delta so a dropped frame (tab backgrounded, GC pause) never
    // fires a burst of catch-up sim ticks in one go.
    const frameDelta = Math.min(clock.getDelta(), 1 / 20);
    fixedLoop.advance(frameDelta);

    model.position.set(playerState.x, 0, playerState.z);
    model.rotation.y = playerState.facingYaw;

    animation.setState(lastIntent.speed, lastIntent.crouched);
    animation.update(frameDelta);

    followCamera.follow(playerState.x, playerState.z, lastIntent.directionX, lastIntent.directionZ, frameDelta);

    const surface = surfaceAt(level, playerState.x, playerState.z);
    const radius = noiseRadius(lastIntent.speed, surface);
    noiseRing.setVisible(debugState.noiseRing);
    noiseRing.update(playerState.x, playerState.z, radius);

    const currentFps = fps.tick();
    hudEl.textContent = [
      `fps ${currentFps.toFixed(0)} (worst ${fps.getWorstFps().toFixed(0)})`,
      `speed ${lastIntent.speed}${lastIntent.crouched ? ' (crouched)' : ''}`,
      `noise ${radius.toFixed(1)}m`,
      `device ${lastIntent.device}`,
      nightClockLabel(),
    ].join('\n');

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
