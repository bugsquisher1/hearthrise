# Engine profile, 2026-11-11

Systems Engineer, lane `lane/r-engine-profile`, branched from `3554ebc67` (v0.2.118).
The one combat engine (`src/core/combat-sim.js` + `src/core/hunt/*.js`, run by `supabase/functions/hr-accrue/hunt-settle.js` and by the browser's `src/hunt-view/live-engine.js`), profiled for the first time, and made faster without changing a single outcome.
Nothing deployed, nothing written to production.

## Rerun it

```
node tools/qa/engine-profile.local.mjs                          # every scenario, 50 settles of 100 s, timed
node tools/qa/engine-profile.local.mjs --prof                   # + the V8 sampler: by stage, by file, by function
node tools/qa/engine-profile.local.mjs --prof --focus castAbilities
node tools/qa/engine-profile.local.mjs --base origin/main --reps 4   # A/B against any commit's engine
```

One process, no browser, no network. Each scenario is the world tick's settle (`accrual.js accrueHunt`) in 100 s windows, the world carried as its stored string, so the time is the edge's whole `engineMs`. Pinned seed, warm-up on another seed first. `--base` runs each side in its own process, alternating, one at a time: two engine copies in one process skewed each other's JIT (a lone Thicket tank read +10% in one process and -9% in two).

| Scenario | Ground, Level | Heroes | Density |
|---|---|---|---|
| warrens-4 | coppercap_warrens, 40, own-tier full set | tank, healer, ranger, mage | 8 |
| glade-4 | mosslight_glade, 24, own-tier full set | tank, healer, ranger, mage | 8 |
| glade-1 | mosslight_glade, 26 | ranger alone (kites) | as built |
| thicket-1 | meadowbrook_thicket, 10 | tank alone (the 11-10 baseline's hero) | as built |

## Before and after

`--base d86e0ac4f --reps 4`: 4 reps of 50 settles a side (200 settles, 20,000 simulated seconds a side), this PC with other lanes running.

| Scenario | ms per sim s, before (med / p95) | after (med / p95) | Median | Engine wall ms, total | Thread CPU ms, total |
|---|---|---|---|---|---|
| warrens-4 | 0.75 / 1.01 | 0.55 / 0.70 | -26.6% | 15,380 -> 11,228 (-27.0%) | 15,110 -> 11,093 (-26.6%) |
| glade-4 | 0.61 / 0.77 | 0.46 / 0.57 | -25.0% | 12,394 -> 9,246 (-25.4%) | 12,252 -> 9,079 (-25.9%) |
| glade-1 | 0.13 / 0.18 | 0.12 / 0.16 | -7.6% | 2,776 -> 2,490 (-10.3%) | 2,702 -> 2,486 (-8.0%) |
| thicket-1 | 0.08 / 0.11 | 0.08 / 0.11 | +0.6% | 1,738 -> 1,777 (+2.3%) | 1,764 -> 1,750 (-0.8%) |

A party settle of 100 s: about 75 ms -> 55 ms median at the Warrens, p95 101 -> 70. A lone hero gains little: the hot spots below are a party's.
Noise: the same tree read 0.72 to 0.99 ms/s across runs today. Each A/B side shares the PC's load, so read the change, not the absolute.

Live (DERIVED, not measured): the 11-10 baseline read a party's 100 s settle at 375 ms mean, 487 max on the edge, 4 to 5 times this PC. If the cut carries, that's about 275 mean and 360 max. Under `HUNT_ENGINE_BUDGET_MS` (800, no run starts at or past it) a tick body then fits three party settles instead of two.

## Where the time went

V8 sampler, 50 settles, ms sampled inside `accrueHunt` (the profiler slows the run; compare before with after).

| Stage | warrens-4 before | after | glade-4 before | after |
|---|---|---|---|---|
| whole settle | 3,784 | 2,582 (-32%) | 3,116 | 2,283 (-27%) |
| positionHeroes (roles) | 1,374 (36%) | 682 | 1,035 (33%) | 582 |
| . rangedPos | 1,078 (29%) | 460 | 801 (26%) | 404 |
| . . candidateTiles | 492 | 103 | 327 | 84 |
| . . spotTaken | 416 | 8 | 268 | 2 |
| castAbilities | 757 (20%) | 664 | 561 (18%) | 550 |
| . skillLevelFromXp | 121 | 18 | 75 | 9 |
| chooseTargets | 356 (9%) | 287 | 249 (8%) | 201 |
| runPhase (pull cycle) | 136 | 62 | 280 (9%) | 75 |
| A* (grid.js astar) | 110 | 44 | 231 (7%) | 66 |
| codec, deltas, analyzer, GC | under 2% each | | | |

A* calls in glade-4's 50 settles: 20,636. 259 answered null after flooding about 1,100 nodes each: 82% of every node expanded (Warrens: 112 of 12,328, 69%). A search that finds its way expands about 3.

## The top 3 hot spots

1. **The ranged spot search** (`roles.js rangedPos`, through `movement.js candidateTiles / standable / spotTaken`): 26-29% of a party's engine. Three of four heroes are ranged, and while a monster stands beside one it searches again every 100 ms sub-step. The search tests 289 tiles (a 17x17 square). For each tile, `spotTaken` read every unit, about 52, which is over 14,000 unit reads a search. Then `valid` read all 48 living monsters (six packs at density 8) for each candidate. **Fix:** the band test runs first (`candidateTiles(..., keep)`: the same list, filtered). The other heroes' spots are read once per search (`claimsOf`). The beside-a-monster test reads only monsters within searchRadius + 1 of the target (`besideNear`: Chebyshev is a metric). **Result:** rangedPos -57% Warrens, -50% Glade.
2. **The bar, every slot, every hero, every sub-step** (`abilities.js castAbilities -> firstUsable -> conditions.js pickSlot / testSlot / holds`): 18-20% before. It is now the biggest stage, 24-26% of a smaller total. The cost is spread out. Every slot's conditions are tested (`ally_hp_pct -> allyOf -> heroesOf`, a filter and sort, plus line of sight). `engaged()` filters all 52 units again in `targetFor` and `bestAim` (and in `chooseTargets`' `pickTargets`, 5-8%). `castOrder` sorts every unit. `skillLevelFromXp` made two BigInts for every Level it walked. **Fix shipped:** `growSkillTo` returns before making any BigInt once the table is grown (3.2% -> 0.7%). **Not fixed:** no single pure change is worth more than about 3%. The real fix is a per-sub-step index of engaged monsters and living heroes, rebuilt at every retarget, death, spawn and corpse clear. That's its own lane, with this harness and `engine-parity` as its proof.
3. **A* floods that find no way** (`grid.js astar`, mostly `pull-cycle.js travel`'s walled test through `movement.js reachable`): 7% of the Glade, with runPhase at 9%. A null meant flooding the whole reachable map. The open list was also scanned whole on every pop. **Fix:** a binary heap on the same (f, h, seq) key. The key is unique, so pops come out in the same order. After 64 expansions, one flood from the goal side checks whether the goal is sealed in a small pocket (`sealedOff`). Only that proof answers null early. **Result:** A* -71%, runPhase -73% at the Glade.

Also: `targeting.js basicTarget` takes the first target in range with `find`, so it stops tracing line of sight past it.

The brief's other candidates, checked:
- Event and timeline objects: `makeEvent` 1.0-1.5%, GC 1.4-1.9%. Not a hot spot.
- A* re-planning every step: a search that finds its way is cheap. The cost was the floods (item 3).
- O(n^2) targeting: the real one was `spotTaken` per tile (fixed). `engaged()` rescans remain (item 2).
- Maps rebuilt per step: `occupancy`'s two integer-keyed Maps, 3-4%, left as they are. `Map.clear()` reallocates its table, so reuse saves two object headers.
- 100 ms steps doing work when nothing moves: the ranged search every sub-step beside a monster is the rule (`nearMon` overrides `aiMs`). Skipping unchanged sub-steps needs a world-change fingerprint, which is not a small pure change. With the band filter that search costs about 5x less.

## Parity proof

- `tests/hunt-core/engine-parity.mjs` plays 4 pinned scenarios (warrens-4, glade-4, a lone kiting ranger, a melee + healer pair at the Sewer). Each is 12 settles of 100 s on the real settle, with every settle hashed three ways: **world** (the stored string, swing counters, settled_to), **timeline** (events, track, unit book) and **tally** (every member's delta, hunt and analyzer, plus the run's totals). The pin (`engine-parity.baseline.json`) was written on the unoptimized engine in commit `d86e0ac4f`. It held after every change. 7 mutants caught: one damage roll 5 points higher (the timeline moved at settle 1), then each optimization broken by a tile or a unit (besideNear, claimsOf, onBand, the heap's tie-break, sealedOff's budget, basicTarget's findLast). Re-pin with `--write` only for a change meant to move a hunt, and say why in the commit.
- `tests/hunt-core/grid.mjs astar-is-the-plain-search` runs 400 seeded grids against the old linear-scan A* (a test-only reference). It checks path for path and null for null, and needs at least 40 long sealed searches and 40 long paths. 3 mutants caught.
- `tests/hunt-sessions-settle.mjs`: 81 arms green (TICK-1, BOTH-PATH and PARITY cut invariance).

## Verified and assumed

Verified by running: every number in the tables, parity on the pinned scenarios, the property test, and the tests listed in the commit.
Derived: the live projection, assuming the edge (Deno) gains in proportion to Node here.
Assumed: the fixture heroes (ladder kits, the reference bar) are a fair stand-in for live parties. Live reads 4-5x this PC, and the 11-10 baseline flagged the same gap.

## Owed

- Coordinator: deploy hr-accrue with the next release. Part 1 shipped in v0.2.120 (hash c2355acdd61158af80cf05e6864c4411e86ad4d955db73dbbcf84e4e04f83efd); part 2's hash is below. Outputs are byte-identical, so a tick that mixes old and new isolates plays the same hunt.
- After the deploy, re-measure live engine ms per party settle with the 11-10 baseline's tick-answer read. Expected about 250 mean after both parts (375 less a third; DERIVED).
- `hunt-settle.js:174` still says "0.19 s a party settle". Stale, as the 11-10 baseline noted. Not touched here.

## Part 2: the sub-step's unit lists (same day, same branch)

The follow-up named under item 2. Before part 2, a party's sub-step filtered the whole unit list (four heroes, six packs at density 8, every corpse) about 17 times, plus about 20 id lookups: 37.5 scans, counted with a planted counter.

**What changed** (all pure):
- `src/core/hunt/unit-index.js` (new) builds the engaged monsters, the monsters whose target is set, the living monsters, the living heroes, every hero unit and the living heroes by id in one pass, then keeps them until something changes them. Only a swing indexes (`world-step.js` sets `inst.indexed` and drops the index at every sub-step); every other caller gets the plain scan. Every answer is a frozen array, so a caller that sorts one in place throws instead of corrupting the next reader (`pickTargets` and the party heal now copy first). The writers of a unit's `alive`, a monster's `target` and the unit list (placeRow, spawnAdds, fallen, startPull, clearCorpses, resetPack, retarget) call `staleIndex(inst)`. A list that is replaced or grows is also caught by its identity and length.
- `targeting.js engaged`, `abilities.js living / engaged`, `conditions.js engagedMons / heroesOf` and `roles.js rangedPos`'s living monsters read the index.
- `abilities.js castOrder` takes the living heroes by id (castAbilities skipped everything else) instead of sorting every unit each sub-step. `targeting.js turnTanks` filters the living heroes.
- `targeting.js basicTarget` picks the least monster in range without sorting the pack. pickTargets' order is a strict total order (the mode's key, then distance, then the unique id), so its first in-range monster is the least in-range one.
- The hero loops in `chooseTargets`, `positionHeroes`, `consume` and `checkStopRules` walk the hero lists, not every unit.
- `conditions.js rekey` leaves a hero's waits alone when every one is still on the bar, which is nearly every sub-step. The copy it made would have been equal key for key.
- Tried and dropped: an id map in the index for `unitById`. Building a Map every sub-step cost more than about 20 finds, because heroes sit at the front of the list.

**Numbers** (one process a side, alternating; ms per simulated second, median / p95):

| Scenario | Part 1 (4e4157184) | Part 2 | Part 2's change (6 reps) | Both parts against the original engine (d86e0ac4f) |
|---|---|---|---|---|
| warrens-4 | 0.49 / 0.65 | 0.43 / 0.54 | median -12.1%, CPU total -12.3% | 0.67 -> 0.43, **-35.9%** median, CPU -35.2% (6 reps) |
| glade-4 | 0.42 / 0.54 | 0.36 / 0.49 | median -13.8%, CPU total -12.3% | 0.53 -> 0.37, **-29.8%** median, CPU -30.5% (6 reps) |
| glade-1 | 0.11 / 0.13 | 0.10 / 0.13 | median -4.1%, CPU total -3.5% | -13.6% median, CPU -13.3% (200 settles, 4 reps) |
| thicket-1 | 0.08 / 0.10 | 0.07 / 0.08 | median -7.4%, CPU total -8.0% | -6.4% median, CPU -5.8% (200 settles, 4 reps) |

A lone hero's 50-settle run holds under 0.5 s of engine time, and repeated runs read anywhere from -9% to +10%. So the solo cumulative figures come from 200 settles.

**Parity** (`tests/hunt-core/engine-parity.mjs`):
- The same pins, unchanged (`engine-parity.baseline.json` is untouched).
- **index-audited**: an audit planted into the index checks every answer against a fresh scan for all four hunts. That was 856,599 answers, none stale, and the pins still held.
- **index-writers**: the 20 lines in src/core that write `alive`, a `target` or a unit list are pinned, each with the reason the index stays true.
- 10 mutants caught: the 7 from part 1 (the basicTarget one re-anchored on the selection), plus a death that leaves the index standing, a pull that leaves it standing past the sub-step, and a cast order by list rather than by id.
- The one writer these hunts never exercise (a retarget that drops a target) has its own case: `tests/hunt-core/targeting.mjs an-indexed-retarget-is-read-at-once`, with its mutant.
- The rekey shortcut has a mutant in `tests/hunt-core/conditions.mjs rekey`.
- `play.html`'s preload block gains the new module (`tests/module-preload.mjs --write`).

**What is left** (V8 sampler, share of a smaller total): the ranged spot search is about 18% (its scoring and line of sight, done per candidate). The bar's conditions are about 17-19% (`testSlot -> holds -> allyOf / bestAim`, per slot per hero per sub-step). Rebuilding `occupancy` 2-3 times a sub-step costs 5-6%. None of these has a single pure change I'd expect to clear 10%.

Edge: `pack-edge --hash` hr-accrue bce17306075bcb8d7e7e5ca872860aa796c6caae449a12d4e3415eccfd960df7 (not deployed).
