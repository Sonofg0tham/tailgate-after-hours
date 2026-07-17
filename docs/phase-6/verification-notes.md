# Phase 6 verification notes

All checks below ran against the PRODUCTION build (`npm run build`, served
by `vite preview`), not the dev server, in a browser profile whose
localStorage was cleared first. DOM overlays (kiosk, settings, pause, the
report) cannot be canvas-captured in this environment, so their evidence is
verbatim text dumps and live state read-backs; the 3D scene is a real
captured frame (01-production-build-ingame.jpg).

## 1. Cold-cache production check

- **Empty localStorage handled**: first boot lands on the kiosk, the
  consultant record shows "No engagements on file", best rating and fastest
  clear show NONE. No errors.
- **Console**: zero errors, zero warnings across boot, engagement, pause,
  abandon, report and sign-out.
- **Network**: every request is same-origin (the page, one JS bundle, one
  CSS file, woff2 fonts from our /assets, five GLBs from /models, plus the
  GLTF loader's internal blob: URLs). No CDN, no external host, no
  analytics, nothing third-party at runtime.
- **Favicon**: `./favicon.svg` serves 200 `image/svg+xml`; title and meta
  description present in the head.
- **Relative base**: built with `base: './'`; the preview serves the same
  dist/ that the CI artefact zips for itch.io.

## 2. The full cold loop, keyboard path

One continuous session, real input events (no sim hooks driving movement):

1. Cold boot → kiosk. Clicked **[ BEGIN ENGAGEMENT ]** → appState
   `running`, kiosk hidden, HUD live ("01:00 OBJECTIVE: plant the device").
2. Held a real `KeyW` keydown → the operator walked north out of reception,
   and the run recorded a genuine F-01 lobby tailgate finding on the way.
3. Pressed **Escape** → appState `paused`, the lanyard shows
   [ RESUME ] / [ SETTINGS ] / [ ABANDON ENGAGEMENT ].
4. Clicked resume → `running` again. Escape → `paused` again.
5. Clicked abandon → the Engagement Report arrives with the banner
   `ENGAGEMENT ABANDONED BY THE CONSULTANT AT 01:00`, rating **ABANDONED**
   in alarm red, the terminated-by-consultant remark, the real F-01
   finding, `Time on site 00:00`, `Alert reached CALM`.
6. Clicked **[ SIGN OUT ]** → back to the kiosk. The consultant record now
   reads: Engagements 1, recent engagements
   `2026-07-10   ABANDONED   00:00 on site`, and best rating stays
   **NONE** — an abandoned run is never a best (the Patch Tuesday rule).
7. Reload → the history line persists from
   `tailgate-after-hours.progress` (v2 schema).

A completed GHOST run filed through this same end-screen exists too, from
the balance pass (see balance-worksheet.md section 2): report, history
entry and best rating all recorded correctly in localStorage.

## 3. Settings persist and apply

- The settings panel (from the kiosk and from the pause lanyard) exposes:
  master volume, HUD text scale, screen shake (default **0**), visibility
  floor, high contrast, full motion (off by default), assist mode.
- Changed HUD scale to 1.3 and shake to 0.5, ticked assist: `--hud-scale`
  updated to 1.3 **live**, and `tailgate-after-hours.settings` v1 stored
  `{hudScale: 1.3, shakeIntensity: 0.5, assistMode: true, ...}`.
- Reload: `--hud-scale` re-applied at boot from storage, values retained.
- **Reduced motion is the fresh-visitor default**: on a clean profile,
  `body.reduced-motion` is present without touching any setting; the
  media query is honoured on top. Full motion is opt-in.
- The visibility-floor slider re-paints the extruded geometry live; the
  grid-agreement invariant held at every tested value (verified in the
  Phase 5/6 build sessions with `sampleFloorBrightness`).
- Assist is labelled "applies from the next engagement" and threads
  `guardSpeedScale` through the sim environment; a determinism test replays
  a run at 0.9 identically.

## 4. Gates

- `npm run typecheck`, `npm run lint`, `npm test` (229 tests) all green,
  including the full-mission determinism suite — lighting, audio, and all
  Phase 6 UI never write into the sim.
- Production build green; chunk is ~690kB minified / ~185kB gzipped
  (documented bar in vite.config.ts).

## 5. Honest limitations

- The embedded preview pane throttles requestAnimationFrame and reports a
  hidden visibility state, so live fps and feel are unverifiable here.
  Phase 5's frame-time measurements and the honest-throttle note stand;
  the real 60fps check is Craig's rig.
- The pad path (stick pace, RT throw, A interact, Start pause) is
  implemented to the standard mapping and unit-tested where pure, but only
  keyboard was exercised end-to-end here. The pad session is Craig's.
- Audio triggers are wired and unit-tested (see phase-5/audio-trigger-map.md)
  but how it *sounds* is a pad-session verdict.
