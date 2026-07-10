# Phase 3 verification notes

## The honest bit first

The browser-automation visibility throttle from the Phase 2 PR recurred,
confirmed again this session across the same tool set: a fresh tab reports
`document.visibilityState: "hidden"` and `document.hasFocus(): false` even
as the active tab, `requestAnimationFrame` never fires on it, and the
`screenshot` tool itself times out regardless (tried after driving 100+ real
simulation ticks by hand, so it isn't "nothing has rendered yet" — the tool
just doesn't return in this environment). No proof screenshots this phase.

What that didn't stop: the whole sim runs identically whether or not a frame
ever gets painted, so every checklist item below was proven by driving real
ticks through the actual `stepHunt` loop in a live browser session (via two
new debug hooks, `__forceFrame` and `__driveIntent` — see main.ts) and
reading back the resulting state as JSON. This isn't a substitute measure
invented for the gap: it's the same deterministic step function the renderer
calls every frame, just queried directly instead of screenshotted. The
automated test suite (143 tests, including three new determinism tests that
replay a run using a door, a throw, and an ingress window) is the other half
of the evidence, per CLAUDE.md's instrument-don't-tune discipline.

## 1. All three ingress routes, each gated by its own timing

**Fire-stairs (smokers), door id `fire-stairs` at (3,11).** Teleported the
player to (3.5, 12.5), one cell south, and drove it north for 1.5s at
`simTimeMs=0` (door closed): blocked exactly at `z=12.35` — the door's south
face (z=12) plus the player's collision radius (0.35), never closer. Jumped
`simTimeMs` to 6000 (inside the schedule's 5000–14000ms open window) and
drove north again: reached `z=9.35`, clean through into the corridor.

**Goods lift (lift), door id `lift` at (9,11).** Same test at `simTimeMs=19000`
(before its 20000ms open threshold): still blocked at `z=12.35` after 0.5s of
attempted movement. Jumped to `simTimeMs=20500` (inside its 20000–26000ms
window): reached `z=10.15`, through.

**Lobby tailgate (badge), door id `lobby` at (6,11).** Covered under item 2
below, since its ingress mechanic IS the tailgate window.

## 2. The tailgate window: 1.5s clean, 1.7s locked out, witnessed → CURIOUS

Moved the lobby cleaner out of badge range so the door's state was under
direct control, then called `__badgeDoor('lobby')` at `simTimeMs=0`
(`tailgateCloseAt` becomes 1600, i.e. `DOORS.tailgateWindowMs` exactly).

- `simTimeMs=1500` → HUD reads `lobby: open`. Through clean.
- `simTimeMs=1700` → HUD reads `lobby: shut`. Locked out.

This also has direct unit coverage (`src/systems/DoorState.test.ts`,
"badge doors — the tailgate window") at the same two instants, so the exact
1.6s boundary is asserted twice: once against the pure function, once
against the live running sim.

**Witnessed:** re-badged the door open, placed `guard-south` at (6.5, 13.5)
facing north (clear line of sight to the door two cells away), teleported
the player into the door cell (6.5, 11.5), and forced one tick. Guard state
flipped `patrol → curious` in that single tick, suspicion floored to exactly
50 (`curiousThreshold` 45 + 5, ported from Tailgate's `investigatePoint()`),
and `investigateX/Z` landed exactly on the player's position — the guard is
now heading to where it saw the tailgate happen, not just generically
alarmed.

## 3. A bolt pulls a guard off patrol and it recovers through the full loop

Put `guard-north` on patrol, suspicion 0, well out of sight of the (idle,
distant) player. Threw a bolt landing at (6, 2.5), close to the guard's
(5.5, 2.5) position — within `THROW.noiseRadiusMetres` (4.09m).

Traced tick-by-tick: the bolt travelled for 14 ticks (~0.23s at
22.5m/s over ~5.9m) before landing; on the exact landing tick the guard
jumped `patrol (suspicion 0) → curious (suspicion 50)`, matching the
"floor to curiousThreshold+5" rule precisely, with no gradual ramp — a heard
noise is a discrete event, not a slow fill.

Continued driving ticks (up to 30s) and recorded every state transition:

```
tick 0    curious    (suspicion 50)
tick 119  searching  (suspicion 6, decaying)
tick 659  sweep      (suspicion 0)
tick 929  patrol     (suspicion 0)
```

Full recovery through every intermediate state (curious → searching → sweep
→ patrol) with no state ever getting stuck, matching
`GuardStateMachine.ts`'s documented recovery path exactly.

## 4. Determinism + CI

`npm test` is green: 143 tests across 21 files. The new
`replay determinism with a door, a throw, and an ingress window (Phase 3)`
block in `src/sim/determinism.test.ts` scripts a run through the goods lift
door (closed, then open once its schedule crosses 20000ms) with one bolt
thrown partway through, and asserts:

- two replays of the identical log produce byte-identical `HuntState`
  (doors, staff and bolts included, not just player/guards)
- the run actually makes it through the door once the schedule opens
- the thrown bolt is present and landed in the replayed state
- a run that throws diverges from an otherwise-identical run that doesn't

`npm run typecheck`, `npm run lint` and `npm test` all pass locally on every
commit this phase (checked before each one, not just at the end). CI status
is on the PR itself.

## Timing knobs, for Craig's pad pass

| Knob | Value | File |
| --- | --- | --- |
| Tailgate window | 1600ms | `src/config/doors.ts` (`DOORS.tailgateWindowMs`) |
| Fire-stairs (smokers) break cycle | open 9000ms / closed 14000ms / phase 9000ms | `src/config/doors.ts` (`DOORS.smokers`) |
| Goods lift schedule | open 6000ms / closed 20000ms / phase 0ms | `src/config/doors.ts` (`DOORS.lift`) — **not ported, no Tailgate precedent**, sized by eye |
| Staff badge range | 2.35m | `src/config/doors.ts` (`DOORS.staffBadgeDistanceMetres`) |
| Bolt count / range / speed | 3 / 10.625m / 22.5m/s | `src/config/throw.ts` |
| Bolt landing noise radius | 4.09m | `src/config/throw.ts` — ratio-preserved against the existing run-noise radius, not a literal px:m conversion (see the file's header) |
| Staff walk speed | 1.44 m/s | `src/config/staff.ts` |

## Known simplifications, flagged honestly

- **Cleaners share the player's body mesh.** No distinct civilian model was
  sourced this phase — same KayKit pack, same licence, just not pulled yet.
  A cleaner currently looks like the player at a glance.
- **The lift and fire-stairs sit as new gaps in the existing reception wall**,
  not separate alcove rooms — kept the floor plan changes minimal so the
  phase stayed about the mechanism (schedules, badges, blocking) rather than
  new geometry.
- **The goods lift has no Tailgate precedent at all** — grepped Tailgate's
  full source for "lift" and found nothing. Its timings are new, not ported,
  and are exactly the kind of number this phase's pad pass should look at
  first.
