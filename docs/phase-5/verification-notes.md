# Phase 5 verification notes — the night shift

## The screenshot curse is broken (mostly)

The visibility throttle recurred as in every phase (`visibilityState:
"hidden"`, rAF stalled, the screenshot tool times out). But this phase found
a way round it for stills: `__forceFrame` renders synchronously, and copying
the WebGL canvas to a 2D canvas **in the same task** captures real pixels,
which the page POSTs to a local capture sink. Every image in this folder is
a genuine render of the shipped build. What is STILL impossible here: video
(the 30-second "done when" clip is Craig's capture), sustained real-time
play, and anything requiring vsync — and audio cannot be heard at all, only
proven not to error.

## 1. Grid agreement — the render cannot lie about concealment

Three independent proofs:

- **By construction**: floors and walls are painted with per-cell vertex
  colours computed FROM the sim's light grid through one monotone curve, on
  self-lit materials that ignore every scene light (`Extruder.ts`). There is
  no second lighting model to drift.
- **By unit test**: `Extruder.test.ts` samples the real merged geometry's
  colour attribute for **every walkable cell on Floor 12** and asserts it
  equals `gridBrightness(grid value)` exactly, plus monotonicity of the
  curve and the walls-take-brightest-neighbour rule.
- **Live**: the F5 debug view overlays the grid tiles and the HUD prints the
  agreement line for the player's cell. Captured on the lit reception cell:
  `grid @(6,15) sim 1.00 | rendered 2.30 | curve 2.30`, and earlier on the
  dark corridor: `grid @(20,9) sim 0.08 | rendered 0.43 | curve 0.43`.
  Screenshot: [02-grid-agreement-overlay.jpg](02-grid-agreement-overlay.jpg).

The one deliberate divergence: the torch beam lights the floor it crosses
(additive cone + spotlight) without entering the grid. That is not a
concealment lie — the beam IS the guard's vision cone made visible; standing
in it is being seen, which the sim fully accounts for through vision, and
Phase 2 established the torch never feeds concealment.

## 2. Guard states on light behaviour (and the greyscale check)

The torch is one object: the raycast fan (clipped at walls since Phase 2)
plus a real SpotLight with a PCF shadow map, updated together.

- Patrol/sweep: steady amber wedge — [01-litpool-steady-beam.jpg](01-litpool-steady-beam.jpg)
- Curious/searching: the beam flickers (opacity and light intensity pulse) —
  [03-dark-corridor-searching.jpg](03-dark-corridor-searching.jpg), which also
  shows the wedge squeezed to a sliver by the corridor walls (occlusion working)
- Alert: hard lock, full opacity, red wash — [04-alert-locked-redwash.jpg](04-alert-locked-redwash.jpg)

**Colour-stripped**: [05-greyscale-alert.jpg](05-greyscale-alert.jpg) vs
[06-greyscale-patrol.jpg](06-greyscale-patrol.jpg) (F6 toggle). The alert
lock still reads without red: brighter, wider, pinned on the player. The
non-colour channels per state: beam BEHAVIOUR (steady/flicker/lock),
opacity, guard animation (walk/idle/run), and for doors physical panel
presence. Found and fixed in this pass: the beam originally used normal
alpha blending, which went near-invisible over the dark floor — it is now
additive (a light glows; it does not tint).

## 3. Hidden information

- **Torch light cannot cross walls**: the fan is raycast-clipped (Phase 2)
  and the SpotLight casts shadows with walls, furniture and characters as
  casters — shot 03 shows the corridor pinching the beam.
- **Static light cannot cross walls**: the grid itself is now occluded
  (walls + statically-closed doors, the Craig-approved sim change), and the
  render IS the grid. `LightModel.test.ts` covers wall/closed-door/open-door/
  furniture cases.
- The visibility floor (curve minimum + player fill light) raises READABILITY
  of geometry and the operator, never reveals sim state: no guard, door
  state or light pool is shown that the sim doesn't already assert.

## 4. Frame cost (production build, honest numbers)

Measured on the built bundle (`vite preview`) with the busiest staging I
could make — both guards visible, one in alert chase with shadow-casting
torch, audio unlocked — timing 600 synchronous `renderOnce` calls CPU-side:

| avg | median | p99 | worst |
| --- | --- | --- | --- |
| 0.67 ms | 0.60 ms | 1.90 ms | 4.30 ms |

Even the single worst frame implies ~233 fps against the 16.6 ms budget.
**Caveats, honestly**: this is CPU-side time (includes GPU submission, not
GPU completion), no vsync, on this machine, in a throttled tab. It cannot
PROVE 60 fps on Craig's rig — it strongly suggests enormous headroom.
`FpsMeter` (with worst-frame) stays on the HUD for the real measurement.
Console is clean on the production build.

## 5. Audio

The trigger map is [audio-trigger-map.md](audio-trigger-map.md). What this
environment can verify: the whole API is a no-op before the unlock gesture
(tested), cues fire through real event paths without console errors, and
determinism stays green (audio reads, never writes). What it cannot verify:
how any of it SOUNDS. Every gain/cadence/cutoff is in `src/config/audio.ts`
for the pad pass.

## 6. Determinism

The full suite (219 tests) is green after all lighting and audio work,
including every replay fold — Phase 2 guards, Phase 3 door/throw/ingress,
Phase 4 full mission and checkpoint restart. Lighting and audio never
touched the sim; the one sim change this phase (grid occlusion) was
Craig-approved before a line was written.
