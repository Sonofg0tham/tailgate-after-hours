# Audio trigger map — Phase 5

Every sound in the game, what fires it, and where it lives. All synthesised
(no audio files ship); any cue can be file-swapped later via
`AudioEngine.registerSample(name, buffer)` without touching a call site.
Mixing numbers live in `src/config/audio.ts`; synthesis in
`src/audio/AudioEngine.ts` (cue recipes) over `src/audio/synth.ts`
(primitives). Audio reads sim events and state, never writes — the
determinism suite is the tripwire.

## One-shots (events → cues)

| Trigger (sim truth) | Cue | Spatial? | Fired from | Sound |
| --- | --- | --- | --- | --- |
| Guard `stateChanged` → `alert` | `sting` | No (global alarm moment) | main.ts fixed-loop event pass | Falling dissonant minor-second cluster + sub thump — the signature, deliberately unlike anyone else's rising alert |
| Guard `stateChanged` → `curious` | `curiousTick` | At the guard | same | One soft woody tick — "hm?" |
| Guard `radioCall` event | `radioSquelch` | At the guard | same | Keyed static, clipped acknowledge beep |
| Guard `detain` event | `detainLine` + master duck | No | same | Flat dead-phone-line tone, held then cut; everything else drops (`AUDIO.detainDuck`) |
| Bolt `landed` edge | `boltLand` | At the landing cell | main.ts bolt pass | Hard click + skitter — the noise ping the guards hear, audible to you too |
| Player step timer (speed cadence) | `footstepCarpet` / `footstepTile` / `footstepConcrete` | No (it's you) | main.ts fixed loop | Surface from the same grid data the noise sim reads; gain by speed (creep near-silent) |
| Guard step timer (pace cadence) | `guardFootstep` | At each guard | same | Heavier boots; walk/run cadence from the guard's animation state |
| Engagement Report raised | `reportPrint` | No | main.ts mission-end block | Six-tick dot-matrix line feed |
| [ NEW ENGAGEMENT ] pressed | `uiClick` | No | ReportView callback | Small confirm click |
| Dawn birdsong scheduler | `dawnChirp` | No | `AudioEngine.update` while `mission.phase === 'dawn'` | One bird, far too cheerful; sparse random intervals, keeps going under the report |

## Continuous voices (state → loops)

| State | Voice | Spatial? | Behaviour |
| --- | --- | --- | --- |
| Always (post-unlock) | HVAC bed | No | Filtered noise floor + 53 Hz drone; per-zone gain (`AUDIO.ambience.zoneBedGain`) — the building breathes differently per room |
| Always | Server fan wall | At (32.5, 4.5) | Bandpass whoosh + electrical saw hum |
| Always | Kitchen fridge | At (19.5, 2.5) | Tired compressor: triangle 98 Hz + sine 49 Hz |
| Always | Distant city | At (38.5, 3.0), the east windows | Low filtered wash |
| Any guard `searching` | The mutter | At the nearest searching guard | Syllabic band-passed grumble (2.3 Hz LFO); fades in/out with the state |

## Spatialisation

Positional voices route synth → occlusion lowpass → HRTF `PannerNode` → bus.
Linear falloff to inaudible at `AUDIO.spatial.maxDistanceMetres` (14 m). The
occlusion lowpass is Tailgate's proven trick: when the straight line from
listener to source crosses something sight-blocking (the grid's own
`hasLineOfSight`), the filter closes from 4200 Hz to 500 Hz — guards behind
walls stay locatable, muffled. The listener rides the player and faces where
the camera faces.

**Honesty note:** the `PannerNode` itself is NEW in this project. Neither
Tailgate nor Patch Tuesday contains one (both repos grepped) — CLAUDE.md's
"spatialised with PannerNode" described an intention. What DID port:
Tailgate's occlusion-lowpass and category-bus mixer, Patch Tuesday's
keyed-cue registry, file-swap escape hatch, and gesture-gated unlock.

## Plumbing

- **Unlock**: first `keydown` or `pointerdown` calls `unlock()` (idempotent;
  also resumes a suspended context). Every API is a silent no-op before it —
  no console errors on a cold load, tested in `AudioEngine.test.ts`.
- **Master volume**: `setMasterVolume(0..1)` over the tuned base
  (`AUDIO.volumes.master`), click-free ramp — the Phase 6 settings knob,
  already reachable via the `__setVolume` debug hook.
- **Buses**: sting / footsteps / guard / radio / ambience / ui, each a gain
  under master (`AUDIO.volumes`).
