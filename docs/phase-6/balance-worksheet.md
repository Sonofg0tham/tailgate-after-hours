# Balance worksheet, final edition

Instrument, don't tune: everything below is measurement. No feel numbers
were changed as a result of this pass — the one question that could have
forced a code change (is the mission completable?) resolved as **yes,
comfortably, by reactive play**, so under the fix-only-objective-breaks
rule nothing was fixed because nothing is broken. Every observation ends
in a knob for Craig's pad.

## 1. Scripted full missions (`npm run` -> `npx vite-node scripts/balance-run.ts`)

Six full missions through the real sim, both guards and both cleaners
active. The driver is a pathfinding bot in three grades of caution (none /
facing-aware hold-and-dodge / room-hiding). It plants reliably; it cannot
finish the return leg:

| run | outcome | rating | ingress | planted +min | detections | detains | max alert |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cautious walk, immediate start | dawn | DAWN | lobby | 7 | 2 | 1 | 0 |
| cautious walk, +5s start | dawn | DAWN | lobby | 8 | 2 | 1 | 0 |
| cautious walk, +12s start | dawn | DAWN | lobby | 15 | 4 | 2 | 0 |
| cautious creep throughout | dawn | DAWN | lobby | never | 59 | 30 | 0 |
| cautious walk, assist (90%) | dawn | DAWN | lobby | 7 | 4 | 1 | 1 |
| reckless walk, no caution | dawn | DAWN | lobby | 7 | 114 | 114 | 0 |

## 2. The manual playthrough (the completability verdict)

Because a scripted bot has no reactive intelligence, the deciding test was
played by hand through the live sim (input driven in read-decide-move
bursts, full information): plant at the rack, then the return leg played
properly — waiting for guard-south to pass beneath the server-room door,
tailing his back down the corridor, ducking into the print room when
guard-north's cone caught me (he went CURIOUS then SEARCHING outside the
door; I sidestepped his sightline and waited out the 9s search), then west
behind the recovered patrol and out through the open lobby door.

**Result: planted 01:01, exfilled ~01:23 fictional (~69s of the 720s
night), zero detains, alert level CALM throughout — a GHOST run, filed
through the real end-screen into localStorage history.** The mission is
not broken; it demands actual stealth (side rooms, patrol timing, the
search/sweep recovery loop), which is the game working as designed.
(Worksheet honesty: the manual run teleported to the rack to isolate the
return leg, so its report logged the exit crossing as ingress and a
near-zero time on site — an artefact of the test setup, not of the game.)

## 3. Observations, each with its knob

1. **The return leg IS the game.** Both guards beat the single east-west
   corridor artery; naive play fails it 6/6 while reactive play clears it
   clean in under two fictional minutes. Whether that difficulty spread is
   right is the pad's biggest verdict. Knobs: guard corridor waypoints
   (`src/data/guards.json`), chase speed (`DETECTION.chaseSpeedMultiplier`,
   `src/config/detection.ts`), vision range/FOV (`DETECTION.vision`).
2. **The post-plant checkpoint can gauntlet-loop.** A detain after
   planting restarts you at the rack, the far side of both patrol beats;
   the reckless bot ate 114 detains without the night ending any other
   way. Consider whether the post-plant checkpoint should sit nearer the
   corridor door. Knob: checkpoint placement is `stepMission.ts` (set at
   the plant completion); the detain restart itself is `restartAtCheckpoint`.
3. **Detains never raise the alert.** Only the radio does (3s unbroken
   ALERT sight), so a detain-loop leaves the building at CALM — 114
   detains, alert 0. Faithful to the ported rules; worth a deliberate
   verdict. Knob: `DETECTION.radio` (`src/config/detection.ts`).
4. **Dawn is generous for clean play, harsh for loops.** A clean return
   took 69s of 720s; every failed bot consumed the full night. Knob:
   `MISSION.dawnDeadlineMs` (`src/config/mission.ts`).
5. **Assist (90%) did not rescue naive play** — the bot's failures aren't
   speed-bound. It should mostly help reaction-time-bound humans, which is
   the intent. Knob: the 0.9 in `beginEngagement` (`src/main.ts`).
6. **Ingress is a non-choice for a westward start**: all six runs entered
   by the lobby tailgate because the cleaner keeps its window open more
   often than the timed doors. Knobs: `DOORS.smokers`/`DOORS.lift`
   schedules and the cleaner's route (`src/data/staff.json`).
7. **Secondaries went untouched** by every bot (they beeline the primary).
   No data on photo-route risk; pad territory.

## 4. Full-mission timing reference (clean reactive run)

| beat | fictional clock |
| --- | --- |
| begin | 01:00 |
| plant complete | 01:01 (teleport-assisted; walking there takes ~+7 min per the bot table) |
| print-room hide during search | ~01:10 |
| out via lobby door | 01:22 |
| exfilled | ~01:23 |

A realistic clean mission (walking both legs, one hide) projects to roughly
**15-25 fictional minutes** of the 4-hour night — dawn should never touch a
run that isn't looping failures.
