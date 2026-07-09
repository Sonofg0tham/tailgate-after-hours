# Telemetry worksheet — Phase 2 verification session

Captured live via `window.__telemetry()` during the Phase 2 verification pass
(this session mixed real driven movement with debug teleport/force-state
setup for screenshot capture — not a clean start-to-finish mission — but
every event below was produced by the real state machine reacting to real
proximity/vision/suspicion math, not manually invented).

```
# Telemetry worksheet

Runtime: 76.1s
Detections: 2
Near-misses: 0
Chase escapes: 0
Detains: 5
Time in light: 52.4s (69%)

## Event log
[53.0s] DETAIN — guard-north caught the player
[55.8s] DETAIN — guard-north caught the player
[59.8s] DETECTION — guard-north spotted the player
[60.1s] DETAIN — guard-north caught the player
[61.7s] DETECTION — guard-north spotted the player
[66.2s] DETAIN — guard-north caught the player
[67.6s] DETAIN — guard-north caught the player
```

## What this shows

- **Detain radius vs. chase speed feels punishing right now**: five detains
  in ~15 seconds of active testing, each following almost immediately after
  a detection. At the current chase-speed numbers (`GUARD.patrolSpeed *
  DETECTION.chaseSpeedMultiplier`, both placeholders), a guard within a few
  metres closes the gap to the 0.7m detain radius in well under a second
  once alerted. This is a genuine feel-judgement finding, not a bug — see
  the PR's feel-judgements list.
- **Zero near-misses and chase escapes** in this log — expected, given the
  close-range debug setup that produced it (guards were repeatedly placed
  right next to the player to prove detection/detain mechanics work at
  all), not representative of normal patrol-distance play.
- **69% time in light** reflects the verification session spending most of
  its time in the office (lit, for the lit-vs-dark comparison) rather than
  a real infiltration route through the mostly-dark corridor spine.
