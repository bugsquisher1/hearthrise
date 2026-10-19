# Farming — Optional Watering & Working Auto-Replant

**Backlog #13 · P2 · Owner: Game Designer (Systems) · Wave 2**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**
**Tyler's direction (binding):** watering becomes **optional** — it **speeds** growth — so auto-replant works unattended and being online is meaningfully better for farming.

---

## 1. What actually happens today (ground truth, read from source)

| Piece | Where | Behaviour |
|---|---|---|
| Crop table | `src/legacy.js:282-289` (`CROPS`) | 6 crops, `hours` = grow time, `yield` = [min,max], `xp` per produce item |
| Growth tick | `src/legacy.js:1429-1441` (`startFarmCheck`) | every 5s: `if (elapsed >= crop.hours && p.watered) → state='ready'` |
| Plant | `src/legacy.js:1452-1480` (`plantCrop`) | writes `{cropId, plantedAt, watered:false, state:'growing'}` |
| Water | `src/legacy.js:1481` (`waterPlot`) | sets `watered:true`, `+1 farming XP`. No cost, no cooldown, valid at any moment |
| Harvest | `src/legacy.js:1482-1500` (`harvestPlot`) | rolls yield + `getBonus('farmYield')`, regrow crops reset to `watered:false` |
| Auto-replant | `src/features/auto-actions.js:219-253` (`maybeReplant`) | calls `plantCrop()` → the new crop is **dry** |
| Offline catch-up | `src/legacy.js:6282-6297` (`calcRichCatchup`) | counts ready plots, also gated on `&& p.watered` |
| Plot cap | `src/features/homestead.js:26-56` | camp 2 · homestead 4 · farmstead 6 · manor 8 · keep 10 · castle 12 |

### The three bugs this creates

1. **Watering is a mandatory gate disguised as an activity.** An unwatered plot never becomes ready — not late, *never*. `elapsed >= hours && p.watered` has no timeout. Watering has no timing element either: watering at t=0 is identical to watering at t=hours−1s. It is a "did you remember to click this?" tax, not a decision.
2. **Auto-replant is a trap.** `maybeReplant` → `plantCrop` → `watered:false`. The player enables "auto-replant", it silently spends a seed, and the plot sits at "Tap to water" forever. The feature advertises unattended farming and delivers a permanently stalled plot. Regrow crops (**Tomato**) hit the same wall — `harvestPlot` resets `watered:false` on every regrow.
3. **A dry plot shows no progress at all.** `renderFarm` (`src/legacy.js:2046`) labels a growing plot `p.watered ? '${pct}%' : 'Tap to water'`, so an unwatered plot displays no percentage and no bar movement. A stalled plot and a fresh plot look identical. The player cannot tell the system is broken; it just feels dead.

### The "Harvest 25 crops" pain point (standing backlog item — fixed here)

`DAILY_TASK_POOL` (`src/legacy.js:1207-1217`) contains a flat `daily_harvest_big` at goal 25, and `updateDaily('harvest', qty)` counts **produce items**, not plots. At Wanderer's Camp the player has **2 plots**; turnips are 4h with yield 2-4 (avg 3) → **~6 items per 4h cycle**. Reaching 25 requires ~4½ perfectly-attended cycles ≈ **17 hours of babysitting**, for 700 gold. At Hearthrise Castle (12 plots) the same task takes one harvest pass. The goal is fixed while the farm it measures varies 6×. That is the bug, and it is a data-shape problem, not a balance problem — see §7.

---

## 2. The design: watering is a growth accelerator, on a window

**One sentence:** *A crop always grows. A watered crop grows twice as fast, for two hours.*

### 2.1 Rules

- Growth accrues in **growth-hours**. A crop is ready when accrued growth-hours ≥ `crop.hours`.
- **Dry rate = 1.0** growth-hours per real hour. **Watered rate = 2.0.**
- Watering a plot opens a **2-hour watered window** on that plot. When the window expires the plot returns to dry and can be watered again.
- A plot can only be watered when it has **no active window** — that is the whole anti-abuse mechanism, and it is also the affordance ("this plot is thirsty again").
- Watering is **free**: no item, no gold, no cooldown beyond the window. It costs *attention*, which is the resource this feature is designed to reward.
- Watering grants `ceil(crop.xp / 4)` farming XP (Turnip 2 → Pumpkin 15), replacing the current flat `+1`. Bounded to once per plot per 2h, so it cannot be farmed.

### 2.2 The maths, and why the ceiling is exactly 2×

Each watering converts 2 real hours into 4 growth-hours, i.e. it *gifts* 2 growth-hours. With `W` waterings, ready-time `T = crop.hours − 2W`. The windows must fit inside `T`, so `2W ≤ T`, which gives `W ≤ crop.hours / 4`.

**The mechanic caps itself at −50%.** No separate cap, no cooldown table, no charge counter.

| Crop | `hours` | Idle (dry) | 1 watering | Max waterings | Best case | Best-case speed-up |
|---|---|---|---|---|---|---|
| **Turnip** | 4h | 4h 00m | 2h 00m | 1 | **2h 00m** | −50% |
| **Carrot** | 6h | 6h 00m | 4h 00m | 1 | **4h 00m** | −33% |
| **Wheat** | 8h | 8h 00m | 6h 00m | 2 | **4h 00m** | −50% |
| **Tomato** (regrows) | 8h | 8h 00m | 6h 00m | 2 | **4h 00m** | −50% |
| **Potato** | 10h | 10h 00m | 8h 00m | 2 | **6h 00m** | −40% |
| **Pumpkin** | 14h | 14h 00m | 12h 00m | 3 | **8h 00m** | −43% |

Max waterings = `floor(hours / 4)`; best case = `hours − 2 × floor(hours/4)`.

### 2.3 What the active-play advantage is actually worth

The table above is the *theoretical* ceiling and requires a login every 2 hours, all day. Real players do not do that. Three honest player profiles, 12 plots of Wheat (8h base), measured as harvests per 24h:

| Profile | Logins/day | Waterings landed | Effective grow time | Harvests / plot / day | Throughput vs idle |
|---|---|---|---|---|---|
| **Pure idle** (1 login) | 1 | ~1 per plot per cycle at best | 8h → ~7h avg | 3.0 → 3.4 | **baseline** |
| **Normal active** (3-4 logins spread) | 4 | ~1.5 per cycle | ~6h | 4.0 | **+18-25%** |
| **Heavy active** (every 2h waking hours) | 8 | 2 per cycle | 4h (day) / 8h (night) | 5.0 | **+45-55%** |

**Design target met:** active farming is meaningfully faster (a fifth to a half more produce), idle farming remains fully respectable (it loses nothing it has today — in fact it *gains*, because unwatered crops currently never finish at all). Nobody is punished for sleeping. The ceiling is a hard 2×, which is inside the band already occupied by `farmYield` bonuses (Garden Lv3 is +4 yield on a 3-5 crop ≈ +100% produce; the Harvest Festival world event is +2 ≈ +67%).

### 2.4 Rejected alternatives (and why)

- **Watering as a consumable (buckets / water skin).** Adds an inventory chore and a shop trip to a skill whose appeal is that it runs itself. Rejected.
- **Fixed "−45 minutes per watering".** Reads worse ("twice as fast" is one sentence), and needs a hand-tuned number per crop to stay balanced.
- **Watering multiplies *yield* instead of speed.** Yield is already the `farmYield` lever (Garden, Harvest Festival). Doubling up on it makes both feel weaker. Speed is an unoccupied axis.
- **Auto-water as a homestead/worker perk.** Tempting (`src/features/workers.js` exists, castle grants 6 workers) but it would erase the exact active-play advantage this feature is built to create. **Explicitly out of scope. Do not add auto-water.** If it is ever wanted, it must cap at a *fraction* of a real watering (e.g. a worker keeps one plot watered), never the whole farm.

---

## 3. Data model & migration

### 3.1 New plot shape

```jsonc
// G.farmPlots[i]
{
  "cropId": "wheat",
  "plantedAt": 1754640000000,
  "state": "growing",            // 'growing' | 'ready'  (unchanged)
  "waterings": [1754640000000],  // NEW: ascending ms timestamps, one per watering
  "watered": true                // KEPT for one build — see §3.3
}
```

`waterings` is bounded by `floor(hours/4)` ≤ 3 entries plus slack; cap the array at 8 defensively.

### 3.2 The single derivation function (put it in `src/features/farm-progression.js`)

```js
// WATER_WINDOW_H = 2, WATER_RATE = 2.0 (so each window gifts 1.0 extra growth-hour per real hour)
function growthHours(plot, now) {
  var elapsed = (now - plot.plantedAt) / 3600000;
  if (elapsed <= 0) return 0;                       // guard: future plantedAt
  var bonus = 0;
  (plot.waterings || []).forEach(function (ts) {
    if (ts > now) return;                           // guard: future timestamp — ignore
    var start = Math.max(ts, plot.plantedAt);
    var end   = Math.min(ts + WATER_WINDOW_H * 3600000, now);
    if (end > start) bonus += (end - start) / 3600000 * (WATER_RATE - 1);
  });
  return elapsed + Math.min(bonus, elapsed);        // HARD INVARIANT: never faster than 2×
}
```

`Math.min(bonus, elapsed)` is the load-bearing line: whatever garbage or tampering lands in `waterings`, effective growth can never exceed `2 × elapsed`. Everything else (progress %, ready check, offline catch-up, UI) reads this one function. **No new tick loop, no stored counters, no state to desync** — growth stays purely derived from timestamps, which is what makes it offline-correct and, later, server-verifiable.

Companion helpers on `window.HearthriseFarm`:

- `growthHours(plot, now)` — above
- `progressPct(plot)` → `min(100, growthHours / crop.hours * 100)`
- `isReady(plot)` → `growthHours >= crop.hours`
- `isWaterable(plot)` → `!isReady(plot) && now >= lastWatering + WATER_WINDOW_H*3600000`
- `waterWindowRemainingMs(plot)` / `nextWaterableInMs(plot)` — for the UI
- `readyAtMs(plot)` → projected ready time assuming the current window then dry (for "Ready in 3h 40m")

### 3.3 Migration (existing planted crops must not break)

Run in `src/save-migrations.js` as a new version step, and defensively inside `farm-progression.js` on first read:

| Existing plot | Migration | Effect on the player |
|---|---|---|
| `watered: true` | `waterings = [plantedAt]` | Retro-credits one window. The crop matures **2h earlier** than they expected. Strictly better, never worse. |
| `watered: false` | `waterings = []` | The stalled crop **starts finishing**. If `elapsed ≥ hours` it is ready on the next tick. This un-sticks every plot broken by auto-replant. |
| `waterings` already present | leave alone | idempotent |
| `plantedAt` missing/NaN | set `plantedAt = now`, `waterings = []` | never crash on a corrupt plot |

**Dual-write `watered` for exactly one build.** `watered` keeps being written as "has an active window" so that a rollback to b218 does not brick saves (b218 reads `watered` as the ready-gate; a plot with an active window would simply be treated as watered, which is correct-ish). Remove `watered` in the build *after* the one that ships this.

**Cloud saves:** `farmPlots` is already in the uploaded snapshot (`src/net/events.js:61`) and the shape change is internal to the array — **no allowlist change needed**. Systems should confirm the `snapshotG` 24-field list is untouched.

---

## 4. Call sites that must change (exhaustive)

| File:line | Today | Change |
|---|---|---|
| `legacy.js:1436` (`startFarmCheck`) | `elapsed>=crop.hours && p.watered` | `HearthriseFarm.isReady(p)` |
| `legacy.js:1477` (`plantCrop`) | `watered:false` | `waterings: []` (+ `watered:false` for one build) |
| `legacy.js:1481` (`waterPlot`) | unconditional set | reject if `!isWaterable`; push `now` to `waterings`; XP `ceil(crop.xp/4)`; re-render |
| `legacy.js:1492` (`harvestPlot` regrow) | `watered:false` | `waterings: []`, `plantedAt: Date.now()` |
| `legacy.js:2044-2048` (`renderFarm` tile) | `elapsed/crop.hours`, `'Tap to water'` | `progressPct(p)`; new labels (§5) |
| `legacy.js:1778-1782` (House → Plot mini-render) | same dry/watered label pattern | same treatment — **do not miss this second render site** |
| `legacy.js:6289` (`calcRichCatchup`) | `elapsed >= crop.hours && p.watered` | `HearthriseFarm.isReady(p)` |
| `legacy.js:5633` (ready-badge check) | `p.state==='ready'` | unchanged (state still flips), but the flip now happens for dry crops too |
| `auto-actions.js:219-253` (`maybeReplant`) | plants dry | **no change** — planting dry is now correct and intentional (§6) |

---

## 5. UI implications (hand-off to Art Director)

### 5.1 Plot states — five, not three

| State | Label | Bar | Primary tap |
|---|---|---|---|
| **Locked** (over property cap) | `Locked` | — | → House |
| **Empty** | `Plant` / `Empty plot` | — | seed picker |
| **Growing · dry** | `42% · dry` + `Ready in 4h 38m` | gold fill | **Water** |
| **Growing · watered** | `42% · watered 1:12` | gold fill + damp-soil treatment | (no action; shows window countdown) |
| **Ready** | `Ready` | full | **Harvest** |

**The critical fix:** a dry plot now shows its percentage and a moving bar. Today it shows neither, which is why a stalled plot is invisible. A growing plot must *always* look like it is growing.

### 5.2 Affordances

- **"Water all" button** beside the existing **"Plant all"** in the farm header (`legacy.js:2018-2030`), labelled with the count: `Water all (4)`. Disabled with a reason when nothing is waterable: `All plots watered · next in 47m`.
- A **"next waterable in mm:ss"** line in the farm header. This is the retention hook — it is the only thing on the screen that tells a farmer when to come back.
- Watering must be a **one-tap, no-confirm, no-modal** action. Any friction here kills the loop.
- **Art note (no emoji, "Forge & Stone"):** watered soil should read visually — darker, damp furrows on the `.farm-tile` — so the state is legible without reading the label. A droplet emoji is not acceptable; the tile art carries it.
- The window countdown must not tick a full re-render. Update the text nodes only, or re-render the farm panel at 1Hz *only while it is the active tab* (the existing 5s `startFarmCheck` already re-renders on change; add a light 1s text-only updater guarded on `activeTab==='farming'`).

---

## 6. Auto-replant & offline behaviour

- **Auto-replant plants dry, deliberately.** The replanted crop grows at 1.0× and matures on its own. This is the entire point: unattended farming *works*, attended farming is *better*. `maybeReplant` needs no change beyond the fact that `plantCrop` no longer creates a dead plot.
- **Farm growth is wall-clock and is NOT subject to the 12h offline cap.** `processOffline` (`legacy.js:515-533`) caps *replayed activity*; crops mature off `plantedAt` regardless of how long you were away. Farming is the one genuinely uncapped idle skill — that is a feature and should stay. State it in the UI copy ("crops grow even while you're away").
- **Water windows elapse while offline.** Watering everything right before you log off buys you a real 2h of accelerated growth while away. This creates a small, genuinely good ritual — *tuck the farm in before bed* — and is a second reason to open the game beyond "collect". Keep it; do not "pause" windows offline.
- **Return summary** (`calcRichCatchup`) must count ready plots via `isReady()` and should additionally report *near-ready* plots ("3 ready · 2 ready within the hour") so the player has a reason to stay a minute longer.

---

## 7. Fixing "Harvest 25 crops" (standing backlog item)

The daily pool entries are **factories evaluated at generation time** (`legacy.js:1233-1239` calls `DAILY_TASK_POOL[i]()`), and the code comment already anticipates this: *"so we can adjust goals per level/character later if we want."* No structural change is needed.

**Replace both harvest entries with one plot-scaled entry:**

```js
() => { const n = (typeof farmPlotCap === 'function' ? farmPlotCap() : 8);
        const goal = Math.max(10, n * 3);
        return { id:'daily_harvest', type:'harvest', label:`Harvest ${goal} crops`,
                 goal, progress:0, reward: goal * 30, done:false }; }
```

| Property tier | Plots | Goal | Reward | Realistic time (1 crop cycle) |
|---|---|---|---|---|
| Wanderer's Camp | 2 | 10 | 300g | 2 turnip cycles (~4-8h, or ~4h watered) |
| Fieldworth Farmstead | 6 | 18 | 540g | 1 cycle |
| Hearthrise Castle | 12 | 36 | 1,080g | 1 cycle |

Deleting `daily_harvest_big` drops the pool from 9 to 8 entries — still ample for a 3-of-N daily draw. The task now scales with the farm it measures, and the reward scales with the effort. Note the accepted limitation: dailies are generated once per day and persisted, so upgrading your property mid-day keeps the old goal until tomorrow.

**Flagged, not fixed here:** `daily_kill` (25/60) and `daily_gather` (50/120) have the same fixed-goal-vs-variable-capability problem across a level-1-to-99 range. Same factory fix applies; out of scope for #13, worth a follow-up ticket.

---

## 8. Exploit review

| Vector | Verdict |
|---|---|
| **Water-toggle spam** (water repeatedly for compounding boost) | Blocked twice: `isWaterable` requires the previous window to have expired, and `Math.min(bonus, elapsed)` makes 2× a hard invariant even if `waterings` is forged. |
| **Watering XP farming** | Once per plot per 2h, `ceil(crop.xp/4)`. At 12 castle plots of Pumpkin that is 12×15 = 180 XP per 2h = 2,160 XP/day. A single Pumpkin harvest is 60 XP × ~2 yield = 120 XP. Watering XP is ~10% of the skill's throughput — flavour, not a route. |
| **Backdating `waterings` / clock rollback** | Future timestamps are ignored; the `min(bonus, elapsed)` clamp bounds total gain. **Pre-existing, unchanged:** farm growth is already client-clocked, so setting the system clock forward already fast-forwards crops today. This spec does not make it worse and adds the first real bound. |
| **Server authority** | **Flag to Systems:** when farm state becomes server-validated, `growthHours` must be re-derived server-side from `plantedAt` + `waterings` against `now()`, rejecting any plot whose implied growth exceeds `2 × (server_now − plantedAt)`. The clamp above is the client mirror of that rule — same shape as `raid_strike`'s damage clamp. |
| **Plant-all + water-all mass action** | Bounded by `farmPlotCap()` (max 12) and by seed inventory. No exponent. |
| **Auto-replant + auto-water combo** | Impossible by design — auto-water is explicitly not built (§2.4). |

---

## 9. Test coverage required (per `CLAUDE.md`)

Add to `src/features/smoke-test.js`:

1. **Regression — dry crops mature.** Plant with `plantedAt = now − (hours+1)h`, `waterings: []` → `isReady()` is true. *(Fails on today's build.)*
2. **Regression — auto-replant produces a living plot.** Enable `farmReplant`, harvest a ready plot, assert the new plot's `waterings` is `[]` **and** that it reaches ready after `hours`. *(Fails on today's build.)*
3. **Watered is exactly 2×, never more.** One watering at `plantedAt`, advance 2h → `growthHours === 4`. Forge `waterings` with 20 duplicate timestamps → assert `growthHours <= 2 × elapsed`.
4. **`isWaterable` gate.** Water once → immediately `isWaterable === false`; after `WATER_WINDOW_H` → true.
5. **Migration.** Seed a save with `{watered:true}` and `{watered:false}` plots, run the migration, assert `waterings` shapes and that neither plot lost progress.
6. **Daily harvest goal scales.** Force plot cap 2 and 12, regenerate dailies, assert goals 10 and 36.

---

## 10. Hand-offs

- **Systems:** the 9 call sites in §4, the migration step in `src/save-migrations.js`, the server-side re-derivation rule in §8, and confirmation that `snapshotG`'s field list is unaffected.
- **Art Director:** the five plot states in §5.1, the damp-soil tile treatment, "Water all" placement in the farm header, and the "next waterable" line.
- **Game Designer (me):** owns `WATER_WINDOW_H = 2` and `WATER_RATE = 2.0`, and will re-tune both against live harvest telemetry once the feature ships. If active farming reads as *mandatory* rather than *rewarded*, the lever to pull is `WATER_RATE` down to 1.6, not the window up.
