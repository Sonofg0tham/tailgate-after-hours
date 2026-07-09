import * as THREE from 'three';

// Bundled web fonts (OFL, recorded in CREDITS.md). Vite emits the woff2
// files into the build, nothing is fetched from a CDN at runtime. Only the
// weights actually used are imported.
import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import { Room } from './world/Room';
import { loadCharacter } from './character/CharacterLoader';
import { AnimationController } from './character/AnimationController';
import { MovementController } from './input/MovementController';
import { resolveCollision } from './physics/CapsuleCollider';
import { FollowCamera } from './camera/FollowCamera';
import { FpsMeter } from './perf/FpsMeter';
import { applyPaletteToCss, PALETTE_HEX } from './config/palette';

const PLAYER_RADIUS = 0.35;

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

  const room = new Room();
  scene.add(room.group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(4, 8, 4);
  scene.add(keyLight);

  const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

  const { model, clips } = await loadCharacter();
  scene.add(model);
  const animation = new AnimationController(model, clips);

  const movement = new MovementController();
  const fps = new FpsMeter();
  const clock = new THREE.Clock();

  let playerX = 0;
  let playerZ = 0;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    followCamera.setAspect(window.innerWidth / window.innerHeight);
  });

  function frame(): void {
    // Clamp delta so a dropped frame (tab backgrounded, GC pause) never
    // teleports the player through a wall in one large step.
    const delta = Math.min(clock.getDelta(), 1 / 20);

    const intent = movement.update();
    const speedMps = MovementController.speedMetresPerSecond(intent.speed);

    const desiredX = playerX + intent.directionX * speedMps * delta;
    const desiredZ = playerZ + intent.directionZ * speedMps * delta;
    const resolved = resolveCollision({ x: desiredX, z: desiredZ }, PLAYER_RADIUS, room.wallBounds);
    playerX = resolved.x;
    playerZ = resolved.z;

    model.position.set(playerX, 0, playerZ);
    if (intent.speed !== 'idle' && (intent.directionX !== 0 || intent.directionZ !== 0)) {
      model.rotation.y = Math.atan2(intent.directionX, intent.directionZ);
    }

    animation.setSpeed(intent.speed);
    animation.update(delta);

    followCamera.follow(playerX, playerZ);

    const currentFps = fps.tick();
    hudEl.textContent = `fps ${currentFps.toFixed(0)}\nspeed ${intent.speed}\ndevice ${intent.device}`;

    renderer.render(scene, followCamera.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error('Failed to start the spike:', error);
  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
  }
});
