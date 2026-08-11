# HANDOFFS

_The primary agent-to-agent teaching mechanism. When your work affects another specialist, write a handoff here. Append newest at top._

### 2026-08-11 · FROM Systems Engineer → TO Game Designer / Coordinator · XARN'S AUTO-EAT: half bug, half contract

Branch `fix/auto-eat-threshold-b329`, commit `2f90ad8`. Suite 581/581, 0 runtime errors. No version bump (Coordinator integrates).

- **(a) the trigger ignored the configured threshold — REAL, fixed.** Settings › Gameplay wrote
  `G.settings.autoEatPct` + `G.autoEatPct`; the engine reads `G.autoActions.eat.threshold`.
  `ensureShape()` seeded the latter from the mirror exactly ONCE, at branch creation — so for every
  save that already had an `eat` branch the slider was an inert control and auto-eat kept firing at
  the 50% default. Two writers, one reader, and they never met. The slider now goes through
  `HearthriseAuto.setEat()` (one writer) and every surface prints `HearthriseAuto.eatThreshold()`
  (one reader). Also killed a `x || 0.5` falsy-coalesce that turned a deliberate 0% into 50%.
- **(b) "does not heal up to the threshold" — NOT a bug; it is the design.** `combat-sim.js` calls
  `fx.autoEat` once per tick, live and away identically (AWAY-1 parity rests on that). One Provision
  per swing, climbing back over several swings. The help text now states it instead of leaving it to
  be inferred.

**DESIGNER DECISION REQUESTED — I deliberately did not take it.** Should auto-eat eat repeatedly
within ONE swing until HP is back at the threshold (Melvor-style "eat to target")? For: a player
whose Provision heals less than the foe's max hit can die with a full bag — exactly what Xarn
expected not to happen. Against: the one-per-swing cap is what makes food a real cost, and it is a
load-bearing knob for away accrual. It is a balance change, so it is yours. If you want it, the seam
is `maybeAutoEat()` in `src/features/auto-actions.js` (loop it, bounded by food owned) and it must
stay inside the same single `fx.autoEat` call so live and away stay byte-identical.

**Save note:** new persisted field `G.autoActions.eat.pctSynced` (denylist snapshot, no version
bump). It marks the ONE-TIME adoption of the legacy `G.autoEatPct` mirror, so players holding a stuck
threshold get the value they actually chose — and the mirror cannot quietly become a second writer.

---
### 2026-08-11 · FROM Art Director → TO QA Engineer + Systems Engineer · a SYNCHRONOUS, real-geometry probe for any viewport, and three things I could not fix from CSS

**A test rig you should reuse.** `b327` in `smoke-test.js` measures the inventory at **exactly
922x423** while the suite itself runs at desktop size. Method: build a 922x423 `<iframe>`, feed it the
four inventory stylesheets' `cssText` inline plus the REAL rendered panel markup, and
`document.write` + `close()`. **Media queries inside an iframe evaluate against the iframe's viewport,
and inline `<style>` parses synchronously** — so this is a genuine device-geometry measurement with no
`await`, which is what `tryRun` needs. It reproduced the live device numbers to the pixel (panel
68..355 h287 broken, 68..415 h347 fixed). Every previous responsive guard in this file could only
read CSS rules; this one measures. Guards against vacuity with `sheetsSeen >= 4` and a CSS-length
floor. **Please use this shape for the other short-viewport screens** (combat clips ~313px at 880x420
— a known open item — and now has a way to be tested).

**Systems Engineer, three items in your files:**
1. `#panel-combat` on a short landscape phone is still the biggest unfixed offender in this family;
   `.main` just gave every panel back 68px, so re-measure before doing anything else there.
2. `renderInvFancy()` wipes `#inv-mob-tabs`; I fixed the symptom with a MutationObserver inside
   `inventory-mobile-tabs.js`, but the honest fix is for `renderInvFancy` to own a container
   (`#invc-root`) instead of `panel.innerHTML = …`, exactly as `market.js` was fixed in b230. That is
   your file, and it would also end the scroll-position save/restore dance at its top.
3. The doll's `.td-doll` declares `grid-template-rows: repeat(6, minmax(64px,90px))` for a layout
   (`LAYOUT` in `buildTibiaDoll`) that uses **four** rows — two empty 90px rows ship on every screen.
   I overrode it for short viewports only; the base rule is wrong everywhere.

**Asset Director:** `inventory-mobile-tabs.js` no longer emits emoji. The remaining known emoji-as-art
violations are unchanged (Stable `.sc-icon`, collection log, dungeons, `market.js` rows, the
`settings-modal` title's gear, `global-quests-strip`).
### 2026-08-11 · FROM Game Designer → TO Systems Engineer + Art Director · b329 STYLE SPEED (Xarn)

WHAT I CHANGED:
- `src/core/styles.js` — every style row gains `speedMod` (a swing-interval MULTIPLIER, i.e. a cost)
  and a player-facing `desc`. Ranged: Rapid 1.00 / Precise 1.05 / Longrange 1.10. Everything else
  1.00, so no existing build moved.
- `src/core/combat.js` — new `swingIntervalMs(eq, style)`. **This is now the only swing formula.**
- `src/legacy.js` — `combatTickMs()` delegates to it; new `retimeCombat()` re-times a RUNNING fight
  when the player picks a style; the picker renders each style's real swing time.
- `supabase/functions/hr-accrue/accrual.js` — `deriveTickMs(equipment, items, style)` delegates too.

WHAT SYSTEMS NEEDS TO KNOW:
- The client's `combatTickMs()` and the server's `deriveTickMs()` were **two hand-written copies** of
  the same expression, the second annotated "byte-for-byte the same expression as the client's".
  They are one function now. Please do not re-open-code an interval anywhere.
- `swingIntervalMs` clamps `speedMod` to **[1.00, 2.00]**. That is a security property as much as a
  design one: `tickMs` is a divisor of elapsed time on the accrual path, so a sub-1 style row would
  be an away-grant inflation lever. `tests/accrual-engine.mjs` pins it.
- **Not inside the +52% `allXP` fuse.** Style speed is not XP and not gear: it is a free,
  mutually-exclusive toggle that BUYS speed with accuracy/damage, so it cannot stack or be acquired,
  and every family's default stays at 1.00. The pacing anchor is untouched; the best-case deviation
  is Precise at +2.9% combat XP/hr against non-accuracy-capped foes.
- The `spdB` power-fuse question is **not** pre-empted by this. Nothing here behaves like a speed-gear
  ladder — that call is still open and still yours.

WHAT ART DIRECTOR NEEDS TO KNOW:
- The style buttons now carry a second data point in the existing `<small>`: `RANGED · 2.11S`. The
  sheet uppercases that element, so the seconds unit renders as a capital **S** ("2.11S"). It reads
  fine and nothing overflows (verified at 1440×900 and by the 820×360 landscape guard), but it is
  yours if you want it cased properly. I did not touch CSS.

DESIGNER BACKLOG RAISED (mine, not yours):
- `style.defenseMod` is authored on 13 rows and read by **nothing** — see DISCOVERIES. Four styles
  silently promise 5% mitigation. Guarded against being written into copy until it is wired.
- Magic `focus` strictly dominates `cast`.

WHAT MUST NOT BE CHANGED:
- A style's `speedMod` must never go below 1.00, and every weapon family must keep exactly one
  1.00-speed style. Both are asserted in `tests/core-purity.mjs`.
- No style `desc` may claim "slower" unless its `speedMod > 1`, or claim defence as a stat. The
  reported bug in reverse is a worse bug than the reported bug.

### 2026-08-11 · FROM QA Engineer → TO Systems Engineer / Security · CONSERVATION FUZZ + a reusable server-tier test rig

WHAT I BUILT:
- `tests/conservation-fuzz.mjs` — seeded, randomised, interleaved ops across M characters against the
  FOUR REAL server-authority migrations, asserting per-item and gold conservation against modelled
  mint/burn counters. `--selftest` plants ten known conservation violations and demands each is caught
  (10/10). Wired into `.github/workflows/smoke.yml` at 400 ops (~22s).
- `tests/sql/pglite-fixture.sql` — the Supabase-shaped scaffolding (auth.uid/auth.users/profiles +
  a pg_cron shim + the pre-market-v2 world) that lets those migrations apply to an in-process
  PostgreSQL 18. No Docker, no psql, no credentials, no branch, nothing left behind.

WHAT YOU CAN USE IT FOR (this is the real handoff):
- `tests/sql/server-authority.test.sql` currently runs only by being emitted and pasted at a live
  database (215 KB, via an HTTP-fetch trick, against production, inside a rolled-back transaction).
  With this fixture it can run **on every push**. I did not migrate it myself — it is your suite and
  it asserts RLS/grant semantics this harness deliberately does not model.
- Any future RPC that moves value gets a row in the fuzz's op table. That is the maintenance contract;
  without it the fuzz stops being a proof and becomes a habit.

WHAT I COULD NOT EXERCISE (needs a BRANCH, not this rig):
- **True concurrency.** PGlite is one backend. The advisory locks, `for update`, the canonical lock
  order and the market_buy deadlock scenario are exercised but never RACED. Two simultaneous buyers on
  one listing, and two players buying from each other at the same instant, remain unproven.
- **RLS and EXECUTE grants** — the harness runs as owner. Still owned by `run-sql-tests.mjs` and the
  behavioural suite.
- **pg_cron itself.** The shim records jobs; it does not run them. `market_expire` is called directly.
- **The degrade ladder's driver.** The ladder lives in `hr-accrue/index.ts` (TypeScript, not importable
  by node), so the loop is re-driven in the harness with `MAX_DEGRADE`/`DEGRADABLE` read out of that
  file rather than retyped. The APPLIES are real; the DRIVER is a port. If the ladder ever moves to a
  `.js` module, delete the port and import the real one.

WHAT MUST NOT BE CHANGED:
- The injection anchors are exact substrings of the migration text. If you edit `hr_apply`,
  `market_list/cancel/buy/expire` or `hr_record_rejection`, re-run `--selftest`: a stale anchor exits
  **2 with a loud message**, never silently. Do not "fix" that by loosening an anchor to a regex.
- The harness must never derive an expectation by reading the database after an op. Every expected
  delta comes from the op's own parameters × the verdict returned. That is the only reason it can fail.

## Template
```
### <DATE> · FROM <agent> → TO <agent(s)>
WHAT I LEARNED:
WHAT I CHANGED:
WHAT YOU NEED TO KNOW:
WHAT I NEED FROM YOU:
WHAT MUST NOT BE CHANGED:
WHAT SHOULD BE TESTED:
```

---

### 2026-08-11 · FROM Art Director (b326, the away-honesty surfaces) → TO Systems Engineer, Game Designer, QA

WHAT I LEARNED:
- The welcome-back payload was ALMOST sufficient. Two things it could not tell a renderer, both of which
  would have forced the renderer to guess — which is the exact failure the ruling exists to end:
  1. **which multiplier featured time actually paid.** `featuredMs` says the boss applied; it does not say
     whether it was the daily (x1.5, "+50% drops") or the weekly (x2.0, "+100%"). A renderer defaulting to
     "daily" halves a weekly night in copy.
  2. **the exact span.** `hrs` is `toFixed(1)` — 6-minute granularity — so the Designer's copy "8h 12m away"
     could not be printed truthfully from it.
- `#active-effects-card` is `display:none` on Home (see DISCOVERIES). The ruling's clause 3 had literally
  nowhere to render until I built the ladder into Home's Upkeep block.

WHAT I CHANGED (outside my usual region — please review these two):
- `src/core/combat-sim.js`: `simulateSpan` now also returns **`featuredDropMult`** (the max drop multiplier
  any featured segment paid; 1 when none). Three lines, purely additive, next to `featuredMs` in the
  honesty payload. Guarded by `b326-2`.
- `src/legacy.js` `processOffline`: the summary carries `featuredDropMult` and **`awayMs`** (the exact span).
  Both are additive; every renderer falls back gracefully on a pre-b326 summary (no field -> no percentage,
  and the duration falls back to `hrs`). Also: the offline TOAST now reports crits.
- `src/legacy.js` `actionRate(skillId, action, opts)` takes **`opts.away`** and evaluates the same
  calculator inside `withOfflineReplay`. No second rate function — that was the point.
- **PERF (you flagged this):** `renderProfile` and the quest strip now early-return inside the replay latch,
  `processOffline` repaints each exactly once when the latch opens, and the buff-queue's
  `renderProfile` wrapper no longer schedules a 30ms `setTimeout` **per call** (an away replay was queueing
  thousands of timers before the first paint — that was probably the bigger half of the 10%). Guarded by
  `b326-6`. `window.renderQuestStrip` is newly published for the single post-replay repaint.

WHAT YOU NEED TO KNOW:
- `window.buffsFrozen()` is now the ONE oracle for "is the buff clock running?" (away OR nothing running —
  the same two conditions `src/core/buffs.js tickBuffs` refuses to drain on). Home and the buff panel both
  ask it. Do not let a third renderer invent its own answer.
- `window.BUFF_GLYPH` maps buff type -> atlas key. `BUFFS_DEF[].icon` is still a literal emoji in the data
  row; nothing renders it any more, but it is a trap for the next renderer.

WHAT I NEED FROM YOU:
- Systems: confirm `featuredDropMult` is also computed by the **accrual Edge Function** when it lands, or the
  server-side welcome-back line will silently lose its percentage.
- Designer: the paused-buff copy reads "Food buffs paused — their time was kept, not spent." and the ladder
  note reads "Time kept, not spent — buff clocks only run while an activity is running, and freeze entirely
  while you are away." Ratify or reword.

WHAT MUST NOT BE CHANGED:
- The band prints a percentage ONLY when `featuredDropMult` is present. Do not add a default.
- `buffsPaused` is false when no buff was held; the paused line must stay conditional on it.

WHAT SHOULD BE TESTED:
- `b326-1` … `b326-6` in `smoke-test.js`. Each was proved red by re-introducing its bug.

### 2026-08-11 · FROM Systems (the away unification) → TO Art Director, Game Designer, QA, whoever builds the accrual Edge Function

WHAT I LEARNED:
- Two loops for one behaviour is not a maintenance smell, it is a slow data-loss bug. The away
  loop had drifted from the live one in ELEVEN ways and every single one cost the player. Nine
  were the same copy-paste gap. Nobody decided any of them.
- A parity test is worth more than the rule it guards. Within a minute of first running, the
  seeded away-vs-live diff found two bare `Math.random()` calls in the kill path (dungeon keys,
  companion drops) that made a kill only partially replayable — nothing to do with away time.
- Measure before optimising, always. I assumed the new cost was the wrapper chain. The CPU
  profiler said 46% of it was `observability.js` writing a 500-entry JSON array to localStorage
  once per engine event.

WHAT I CHANGED:
- NEW `src/core/{away,botd,buffs,combat-sim}.js`. DELETED `processOfflineCombat`.
- `killMonster` and `combatTick` are now one-line hand-offs into `combat-sim`.
- Buffs are FROZEN away (no pay, no drain, no food) — closes a live exploit.
- `G._toolCarry` → `G.toolCarry` (save migration v12 → v13) so it reaches the cloud.
- Perf: analytics buffer debounced; two per-kill table rebuilds memoised.

WHAT YOU NEED TO KNOW:
- **Art Director — the welcome-back renderer.** `G.lastOfflineSummary` now carries
  `{blessed:false, buffsPaused, crits, featuredMs, capped, rateMult, hrs, gainedXp, gainedGold,
  gainedItems, combat:{kills, foodEaten, died, crits, ticks, segments[]}}`. Every one of those is
  stated by the SIMULATION, so no renderer has to infer a bonus. `buffsPaused` is FALSE when the
  player held no buffs — do not print "your buffs were paused" beside an empty buff list.
  `featuredMs > 0` is what licenses "· 8h on the Boss of the Day (+50% drops)". I did NOT write
  any copy; that is yours. A paused buff should render as paused with its time preserved.
- **Game Designer.** Away combat is measurably richer now: on a level-appropriate foe, kill XP
  alone is +58%, +65% with a typical 7.5% gear crit. The ruling's ~+30% is a portfolio average.
  Away also now grants companion/pet/dungeon-key drops, deeds, dailies, quests and collection-log
  entries that it never did. The 0.95 drop cap IS applied after `dropMult × featuredMult` and
  guaranteed drops are unscaled — re-asserted under the new path (test AWAY-10).
- **Whoever builds the accrual Edge Function.** Import `src/core/combat-sim.js` and supply
  `{away:true, fromMs: server_last_seen, toMs: now(), tickMs, rng: createRng(hashSeed(user,slot,
  accrued_to)), monsters, bonus, style, playerRolls, monsterRolls, weakness, botdFor, fx}`. `fx`
  is the only thing you write from scratch: ledger writes instead of client side effects.

WHAT I NEED FROM YOU:
- QA: `CLAUDE.md`'s save-invariant list still names `processOfflineCombat` as a guarded function.
  It no longer exists — the Coordinator should update that line to `simulateAwayCombat`.
- Art Director: `renderProfile` and `renderStrip` still fire during an away replay (~10% of it),
  reached from `addItem`/companion paths in files I do not own. They repaint a screen nobody can
  see, during `loadLocal()`. Worth a suppression pass.

WHAT MUST NOT BE CHANGED:
- Do NOT add away-only behaviour anywhere. Add it to `simulateTick` and gate it through
  `src/core/away.js`'s channel table. A guard (AWAY-12) fails if `processOfflineCombat` returns
  or if `combatTick` re-grows its own rolls.
- Do NOT special-case the `damage_crit` food buff. It is excluded away because it is a BUFF; the
  moment someone writes an `if` for it, the table stops being the rule.
- `AWAY_RATE_MULT` is 1.00. Changing it requires a fresh day-model recompute, not feel.
- `botd.js`'s hash, key formats and pool ORDER are load-bearing. Append to a pool; never reorder.

WHAT SHOULD BE TESTED:
- AWAY-1 is the contract: same seed, blessings and consumables off, `away:false` vs `away:true`
  must produce byte-identical XP, gold, kills and drops. If you add anything to the kill path,
  that test tells you within seconds whether you made it unreplayable.

### 2026-08-09 · FROM Systems (b228, `agent-rebase`) → TO Game Designer, QA, every future feature author
**WHAT I LEARNED:** three things, and the first is the one that matters to everyone.
1. **A bonus source can be correct on its own and still be wrong.** The companion bonus was added to `getBonus` by *two* wrappers — one in `legacy.js`, one in `features/companions.js` — and every pet paid **twice** for ~26 builds. Read either file and it looks right. Only a behavioural delta test (`getBonus(k)` with the pet equipped minus without) can catch that class, and there was no such test. Same shape as the "data double-copy" trap already in Standing Knowledge; this was its bonus-layer twin.
2. **A ghost can hide inside a live table.** Five companions carried `xpB` / `goldBonus` / `prayerXp` — misspellings of `allXP` / `goldFind` / `prayerSpeed` — and paid nothing since launch. `farmYield` had the reverse problem: real producers, but `harvestPlot` **floored** the total, so every fractional grant (Scarecrow, Bunny, Squirrel, Carrot Stew, Roasted Pumpkin) paid exactly zero. Neither shows up as an error anywhere; both look like a working feature.
3. **A cap that a later wrapper can escape is worse than no cap**, because it is a false assurance you will then reason from. The b223 fuse sat at layer 4 of a seven-layer chain and clamped only its own layer.
**WHAT I CHANGED:** the whole boost economy to the 2% grammar; `src/features/power-budget.js` as the FINAL `getBonus` wrapper (`permanent ≤ 0.20 · temporary ≤ 0.15 · total ≤ 0.30`, per key); Rested XP from a percentage potency to a flat XP quantum; renown Count/King from percentages to a market slot and a daily-task slot; renown weights retuned for pace + a live "How renown is earned" explainer; and the four bugs above. Full detail in my agent log.
**WHAT YOU NEED TO KNOW — the rule, for anything you build from here:**
- **Every percentage a source grants is a whole number of percent. The step is 2%; wide keys (`allXP`, `combatXP`, `goldFind`) use a 1% half-step.** A grammar test walks `ROOMS`, `RANKS`, the castle rungs, the feast ladder, both blessing pools, `COMPANIONS` and every `ITEMS` buff and fails on a fraction of a percent. It is the single test that stops this re-drifting; do not add an exemption to it without adding the *reason* beside the key.
- **If your rung is expensive, do not pay in percentages.** Duration, capacity, reliability and access are outside the grammar and outside the budget, and they are the preferred payload for anything costing a Keystone. That is not a loophole — it is the answer to "how do I justify 300,000 gold at +2%".
- **`window.HearthrisePowerBudget` must stay outermost.** If you wrap `getBonus`, your contribution lands *outside* the clamp until the 1s watchdog re-wraps. Call `ensureOutermost()` yourself right after you install, as `main.js` does.
- **Temporary power must be readable from its owner.** The budget asks `feastBonus` / `liveBonusFor` / `muster.liveAura` / `getBuffBonuses` directly. A new temporary source that only ever does `t += …` inside a wrapper will be counted as **permanent** (the strict direction, so it fails safe) — export a "what am I paying right now" function and add it to `temporaryFor()`.
**WHAT I NEED FROM YOU (Designer):** (a) the **batch size** for the three Keystone L5 benches — I deliberately did not pick it, see CONFLICTS · NEW 2, because it is a ~5× artisan pacing move; (b) the amendment notes on `homestead-deepening.md`, `clan-overhaul.md` and `pacing-overhaul.md` A.4, whose ceilings and boost columns no longer describe anything; (c) ratify the renown weight table (CONFLICTS · NEW 1) — it supersedes `bonus-rebase.md` §4.3's "unchanged".
**WHAT MUST NOT BE CHANGED:** the twelve renown **thresholds** (`RANKS[].min`) — they are compared against the `renownHigh` ratchet, so a weight may move in any direction but a threshold moving up demotes every player at once. Pinned by a test. Also: the feast **hours**, `noBurn`, `buffDuration` and the tool ladder are all outside the grammar on purpose.
**WHAT SHOULD BE TESTED (QA):** a clanned player with a maxed homestead during a Last Call feast on a Grand Fair week with a Moonbloom Elixir — the activity note must read *"the realm's blessing is at its limit"* and no key may exceed +30%. Also: a returning player's first XP grant after a long absence (the Rested quantum, up to 1,600/charge — it should be visibly larger than an ordinary grant, and exactly one charge should leave the bank).

---

### 2026-08-08 · FROM Art Director → TO clan-seat agent, presence agent, quest-nav agent, stable agent, combat agent, Systems
**WHAT I LEARNED:** Tyler said "text is too small" for the **third** time, and the measurement finally explained why the first two answers failed. b218 multiplied the ramp; b225 set a 13.5px floor. A full computed-size sweep of 19 surfaces then showed **1,093 of 2,112 visible elements (51.8%) sitting at EXACTLY 13.5px** — when half the game stands on the floor, *the floor value IS the reading experience*, and a floor set to "minimum acceptable" reads as "everything is minimum acceptable". A floor is not a safety net once the whole game is resting on it; it has to be a comfortable size.
Second thing learned, the hard way: **`--ui-scale` declared in the shared `:root, body[data-theme=...]` block was completely inert.** The copy on `<body>` re-declared it one level under `<html>` and swallowed the dial's inline value. Measured: the first cut moved **0 of 1,694** rendered elements. Any variable a script sets on `documentElement` must be declared on `:root` ALONE.
Third: hundreds of rules carry `transition: all .15s`, so a computed font-size read immediately after a token changes returns the **old** value. Four elements read as "the dial doesn't reach them" until the probe waited 450ms.
**WHAT I CHANGED (b227):** floor 13.5 → **14.5**, every ramp step +1 (`--t-small` 15→16, `--t-body` 16→17, `--t-lead` 17.5→18.5, h-tiers +1), separations unchanged. **877 font-size declarations** rewritten across five sheets and 25 JS modules into the mandatory form `calc(<n>px * var(--ui-scale, 1))`, plus 4 `font:` shorthands expanded to longhands. Wired **Settings › Display › UI scale** for real (90–130%, 5% steps, live preview) — it was a 6-option select with no consumer anywhere (click-through audit finding #2). Guards 19a–19e in `smoke-test.js`; smoke **333/333**.
**WHAT YOU NEED TO KNOW — the rule that is now enforced:** a bare `font-size: 14px` anywhere in `legacy/art-direction/audit-overrides/theme-cozy/board-and-shop.css` **fails guard 19d**. Write `font-size: calc(14.5px * var(--ui-scale, 1))` or a `--t-*` token. The `, 1` fallback matters: injected `<style>` blocks and the account wall paint before `art-direction.css` is guaranteed applied, and an unresolved `var()` invalidates the whole declaration. Never use the `font:` shorthand for a size — its `<font-size>` slot cannot carry the calc, and it silently resets every `font-*` longhand around it. That shorthand has now cost two type passes their stragglers.
**WHAT I NEED FROM YOU — the sweep I could not run, because you are holding the file.** Rule: every px value gets **+1** (values above 32px keep their number), the result is floored at **14.5**, and it is wrapped in `calc(<n>px * var(--ui-scale, 1))`. Until these land, 58 rendered elements stay below the floor and are listed as exemptions in `TYPE_PENDING_HANDOFF` (smoke-test.js) — **delete your entry when you land yours.**

| File | Owner | Declarations | Sub-floor after b227 | Rendered elements still small |
|---|---|---|---|---|
| `src/features/home-dashboard.js` | presence / quest-nav | 25 (`13.5`×17, `15`×2, `15.5`×2, `17`, `22`, `23`, `31`) + 1 `font:700 13.5px/1` | 17 | **50** — the whole Home screen, the first thing Tyler sees |
| `src/styles/clan-seat.css` | clan-seat agent | 27 (`13.5`×23, `19`×2, `20`, `23`) | 23 | 2 (`.clan-empty`, `.soc-signpost-txt`) |
| `src/features/companions.js` | stable agent | 4 (`13.5`×3, `15`) | 3 | 2 |
| `src/features/world-events.js` | presence agent | 2 (`13.5`×2, inline `style=`) | 2 | 4 |
| `src/features/combat-render.js` | combat agent | 1 (`24px`) | 0 | 0 (dial reach only) |

**Home dashboard is the priority.** It is the landing screen and it accounts for 50 of the 58. Everything else is a handful of labels.
**WHAT MUST NOT BE CHANGED:** `--ui-scale` must stay in its own `:root { --ui-scale: 1 }` rule in `art-direction.css` — moving it back into the shared `:root, body[data-theme="hearthlight"]` block silently kills the dial with no test failure except 19e. The 130% ceiling is measured, not chosen: it is the largest value at which **zero** text is cut anywhere in the game. `--nav-w` scales with the dial (the rail holds nothing but text); the 64px icon rail deliberately does not.
**WHAT SHOULD BE TESTED:** re-run `node tests/run-smoke.mjs` after your sweep and confirm the pending count in 19c's message drops. Verify visually at 90% and 130%, not just 100% — that is where geometry fallout shows.

### 2026-08-09 · FROM Game Designer → TO Systems Engineer, homestead agent, QA
**WHAT I LEARNED:** `getBonus` is a base function **plus six additive monkey-patch wrappers** (rooms/renown/capstone → companions → food buffs → clan → castle → muster → blessings). **42 live bonus sources across 7 layers**, 4 more outside the chain, 6 ghost keys. The only fuse in the game sits at **layer 4** and reduces *only layer 4's own contribution* — companions, food buffs, the muster aura and the entire blessing calendar are added afterwards and **nothing clamps them**. Three sources no spec ever budgeted: a **level-30 companion is `smithSpeed` +24.5%** (base ×`1+0.05×(lv−1)` over 30 levels), food buffs reach **+50%** (Lich Soul Soup) and are indefinitely renewable, and `forge_fires` + `guild_works` is **+50% smith AND craft from the calendar alone**.
**WHAT I CHANGED:** New spec `docs/design/bonus-rebase.md`. No game code.
**WHAT YOU NEED TO KNOW — Systems (b228):** the grammar is **whole percents only, 2% step, 1% half-step for wide keys** (`allXP`/`combatXP`/`goldFind`). **Permanent ceiling +15% per key, fuse 0.20, temporary budget +15%, absolute peak +30%.** Full current→new table in §3; every one of the ~30 assertions to retune is listed with its line number in §4.3. **The fuse must move out of `clan-seat-ui.js` into a final `power-budget.js` wrapper installed last** — a fuse in the middle of a seven-layer chain cannot police it. Constants: `PERMANENT_ALLXP_CAP` 0.60→**0.20** (and per-key, not `allXP`-only), `CASTLE_KEY_CAP` 0.10→**0.05**, `CASTLE_TOTAL_CAP` 0.25→**0.12 and actually applied** (today it is declared and enforced against nothing). **Two migrations**, not none: the feast ladder (`clan-seat.sql:1104`) and rested potency (`:1151`/`:1170`) are server-mirrored; castle *building* perks are client-side only.
**WHAT YOU NEED TO KNOW — homestead agent:** your provisional is **ratified** (speeds +2/4/6/8/10, Library/Trophy +1/2/3/4/5, Garden flat, `noBurn` unchanged, procs 4/8) with **three amendments** in §5.1: (1) **P1 — Workshop and Shrine are still at +10/25/50/50/60**, six rooms retuned and two missed; (2) the **Cellar goes back UP to +20/40/60/80/100%** — duration is exempt from the grammar and was cut by mistake; (3) Library L4/L5's `restedXp` 4/8% is dead on arrival — ship the XP-quantum payload or ship it inert.
**WHAT I NEED FROM YOU:** Systems' ruling on the final-wrapper fuse (it needs permanent and temporary to be separately accumulable) **before b228 builds**; and a call on `smoke-test.js:8746`, which breaks *structurally* under a final clamp (it forces a synthetic 0.50 all-keys blessing and asserts 1.0) while guarding the load-bearing offline-replay latch.
**WHAT MUST NOT BE CHANGED:** the **gathering tool ladder** (.05→.35) is deliberately out of scope — it is gear, and the 57.2-day floor was derived *with* it applied, so touching it re-opens the anchor Tyler approved. `PACE.xp`/`PACE.actionMs` and the whole b226 pacing test block are untouched. Kitchen `noBurn` 13/19/25, Garden flat `farmYield`, Shrine bulk-bury, renown's six offline-hour ranks and Tavern leftovers 5% are all **unchanged on purpose** — duration/capacity/reliability/access are exempt from the grammar and are the preferred payload for expensive rungs.
**WHAT SHOULD BE TESTED:** four new tests in §4.4. The one that matters is **the grammar test** — walk every source table and assert every percentage is a whole number of percent. Nothing like it exists today, and it is what stops the whole thing re-drifting. Also: a **whole-chain per-key** fuse test (the suite has no aggregate ceiling test for any non-`allXP` key — that gap is how `smithSpeed` reached +90% unnoticed).
### 2026-08-08 · FROM Game Designer → TO Systems Engineer, castle-panel builder, Art Director, QA
**WHAT I LEARNED:** Three seams built in b222 are still inert and this wave should consume two of them — `registerBuffScaler` (SEAM 2, built explicitly for a second consumer; the homestead Cellar is it) and `G.restedXp` (SEAM 3, banks 80 charges of offline time but `getBonus('restedXp')` is 0, so the whole bank does nothing). Also: the Hunt-forged level gates were inverted against `gear-tiers.js`, and `farm-progression.js` never unlocks the three b215 crops.
**WHAT I CHANGED:** Six ratifications recorded in `clan-boss-events.md` (§3.1, §3.4a, §8.6), `clan-overhaul.md` (§4.5, §6.5) and `world-event-cadence.md` (§4.5). New spec `docs/design/homestead-deepening.md`. Narrow data edit (Task 1.2 authority only): four Hunt-forged `req` values in `src/data/recipes.js` + comment corrections in `src/data/items.js`, with a derived regression test in `smoke-test.js`. Smoke **270/270**.
**WHAT YOU NEED TO KNOW — castle-panel builder:** the room-modal descriptor is specced in `homestead-deepening.md` §5 as **pure data** — `{id, pillar, title, kicker, flavour, art, state, lockReason, now[], ladder[], actions[], footer}`. Two rules make it a seam rather than a shape: the renderer must **never branch on `pillar`** (it is a CSS data attribute), and the **full ladder always renders**, owned rungs included. Costs are `{id, need, have}` triples so b217's `fmtCostRow` checklist is reused verbatim. Build it once and the homestead consumes it with zero new machinery. **Systems:** three one-line seams for homestead Phase 1 — `getBonus('yield_'+skillId)` at `doArtisanAction`'s `addItem` (**only if `!ITEMS[out].type`**), a `restedXp ≤ 0.50` clamp, an artisan-speed `≤ 0.85` clamp. **Art:** 8 room illustrations in lit/ghosted/locked, same "Forge & Stone" language as the castle view — produce them with the castle art or the twins won't look like twins.
**WHAT I NEED FROM YOU:** (1) the P1 in `CONFLICTS.md` — `farm-progression.js TIERS` makes Goldenroot/Emberfruit/Moonbloom unplantable at MAX plot level, so farming's last 37 levels have nothing to plant; five-line data fix, ship it independently. (2) Systems' call on the craft-to-vendor gold margin (`invSellOne` pays full item `v`). (3) Whether a locally-earned signed-out save is trusted on first sync — one question behind both the muster solo band and the P3 solo-raid claim.
**WHAT MUST NOT BE CHANGED:** `allXP` is at **+52%** against a 0.60 fuse — **no system in either pillar may add a new `allXP` source or raise an existing one.** `clan-overhaul.md` §8.3 says +47%; it omits the homestead property capstone. The Hunt-forged kit has **no boots** on purpose. Phase-B spoil routes must never render as actionable.
**WHAT SHOULD BE TESTED:** the new derived assertion in the b223 Hunt-kit block pins each Hunt-forged recipe strictly above its Dawnsteel rung, read live from the recipe table rather than hardcoded — a `lvOff` change in `gear-tiers.js` moves both sides together.

### 2026-08-08 · FROM Game Designer → TO Art Director, Systems Engineer
**WHAT I LEARNED:** `clans.upgrades jsonb` + `castle_tier int` already exist in the Supabase schema, unused — the clan castle can build on them with no destructive migration. Current clan panel is "a bank account with a chat channel"; leaderboards never show a sub-top-15 player their own rank; ~135 recipes render as flat scrolls but categories can be **derived** from existing item fields (no hand-tagging).
**WHAT I CHANGED:** Wrote `docs/design/{clan-overhaul,leaderboards,crafting-cooking-taxonomy}.md` (commit `4d54eb3`). No game code.
**WHAT YOU NEED TO KNOW — Art:** three UI packages coming out of these specs: (1) clan castle silhouette with lit vs ghosted wings (a *place*, not a dashboard; no emoji); (2) leaderboard category+skill selector plus a pinned "you + rivals above/below" block; (3) artisan category strips / sub-tabs reusing the `data-lb`/`data-house` pattern. **Systems:** four items filed in `CONFLICTS.md` (perk-stacking cap, `raidPower` key, auto-eat foodClass filter, `snapshot.renown`).
**WHAT I NEED FROM YOU:** Systems' ruling on the perk soft-cap mechanism before Wave 3; Art's visual treatment for the castle panel.
**WHAT MUST NOT BE CHANGED:** Treasury stays gold-only in v1 (server-governed sink); rewards are cosmetic titles/gems — never Hearth Tokens.
**WHAT SHOULD BE TESTED:** n/a (docs only).

### 2026-08-08 · FROM Coordinator → TO all specialists
**WHAT I LEARNED:** The base is clean and green (`119a698`, smoke 175/175, remote in sync, auto-deploy live).
**WHAT I CHANGED:** Established the coordination system (`.claude/coordination/**`), five agent definitions (`.claude/agents/*.md`), and team commands (`.claude/commands/*`). Committed + pushed the asset/doc cleanup.
**WHAT YOU NEED TO KNOW:** Read `PROFESSIONAL_STANDARD.md` and your own `agents/<you>.md` log before starting. Ground truth is in `CURRENT_STATE.md` and `DISCOVERIES.md`. Claim shared surfaces in `ACTIVE_WORK.md` before touching them.
**WHAT I NEED FROM YOU:** When dispatched, work to the Change Contract and update your log + the relevant coordination files before declaring READY.
**WHAT MUST NOT BE CHANGED:** The regression tripwires in `DISCOVERIES.md` (data merge identity, theme scoping, no PvE token mint, XSS sanitization). Keep guard tests green.
**WHAT SHOULD BE TESTED:** `node tests/run-smoke.mjs` (175/175) after any change; plus your domain-specific verification.

---

_(New handoffs below, newest first.)_

### 2026-08-09 · FROM Systems Engineer → TO Game Designer, QA, Art Director  (b227, branch `agent-presence`)

WHAT I LEARNED:
- **Blessings DID apply to offline output, in full, on every catch-up.** `world-events.js` wraps
  `window.getBonus` additively and `processOffline()` replays through the same `addXp` /
  `doSkillAction` / `doArtisanAction` / `applyGoldFind` the live loop uses. This was true from b204.
- **`isPresent()` is TRUE during an offline catch-up.** `processOffline()` runs inside `loadLocal()`,
  on a visible tab, with the input timestamp freshly initialised and an activity set. A gate written
  as "blessings apply while `isPresent()`" reproduces the leak exactly. b226's own flat ×1.12 leaked
  into offline grants for this reason. **Anyone gating anything on presence must also check the
  replay latch.**
- **Speed bonuses were baked, not read.** `G.skillMs` was computed once at start and the offline
  replay divided elapsed time by it, so a blessed session carried blessed speed into the night.
- **`getBonus('rareDrop')` has no consumer.** `rareDrop` exists only as an equipment/pet ITEM stat.
- **The Home offline welcome-back line is invisible.** `#dash-active` is `display:none` since the
  b219 Home rewrite, so b225's burn count, b226's budget readout and b227's rate note all render
  into a hidden panel. The only surface a player sees is the `processOffline()` toast.

WHAT I CHANGED:
- Flat presence ×1.12 REMOVED (`addXp`, `actionRate`, `HearthrisePresence.MULT/.mult` all gone).
- `blessingsApply() = !inOfflineReplay() && isPresent()` — the detector stays, now as the gate.
- `withOfflineReplay()` latch wraps the whole of `processOffline()`.
- ONE `activityIntervalMs()` read by `startSkill` / `startArtisan` / a new per-action
  `retimeActivity()` / the offline replay. De-duplicated the artisan timer arming (it existed twice).
- Pools: 9 daily × 6 weekly, ten wired keys; new goldFind + noBurn families; Grand Fair 10% → 12%.
  Dead emoji `glyph:` field removed from the data; `EVENT_GLYPH` exported so Home and Events share it.
- Honesty copy on the activity note, Home "The realm", the Events blessing card, and the offline toast.
- `docs/design/pacing-overhaul.md` Appendix A rewritten + new A.8.

WHAT YOU NEED TO KNOW:
- **Designer:** the day model is now **14.5 eff-h/day** (was 14.8) and the unboosted first-99 floor
  moves **56.0 → 57.2 days**. Online value is now a *variable*: A.2b tables the range (14.5 → 16.2
  eff-h/day depending on the week). Whole-calendar expected value ≈ **+1.7% on the day**, so the
  blessing's real contribution SHRANK ~5.8× even at unchanged magnitudes — there is room here, and
  A.8.4 states the worst-case overlap (+27% allXP, 2.5h, one day in 54) against §8.4's budget.
- **QA:** the harness seam is `HearthriseWorldEvents._force({daily, weekly})` (+ `E.QUIET`, a
  grants-nothing control). Pin a blessing rather than asserting against the wall clock. Presence is
  driven with `HearthrisePresence._setLastInput()` and `_withOfflineReplay()`.
- **Art:** the blessing card and the Home "The realm" panel both carry a live/idle state now — the
  pills dim to .55 and the note changes wording when the gate closes.

WHAT I NEED FROM YOU:
- **Designer:** ratify the pool magnitudes in A.8.3/A.8.4 and the recomputed floor. If you want the
  online bonus to *feel* bigger than +1.7%/day, the lever is pool magnitudes, not a new multiplier.
- **QA:** an independent pass on the offline gate. My proof is two regression tests plus a runtime
  mutation (removing the latch in the browser turned a 3h absence from 11,250 XP into 36,000).

WHAT MUST NOT BE CHANGED:
- The replay latch, and the rule that EVERY new elapsed-time simulator runs inside
  `withOfflineReplay()`. This is the b214 double-pay class of bug wearing a different hat.
- `HearthriseWorldEvents` stays the load-bearing clock utility raids/rally read — extended, never
  renamed or restructured. Rally / join-gated live events: untouched by this change.
- Pool entries may only name a key with a proven consumer; a test asserts it.

WHAT SHOULD BE TESTED:
- A real overnight absence on a save whose activity was started under a speed blessing.
- Combat offline (`processOfflineCombat`) under a goldFind blessing — gold must not move.
- The daily UTC rollover with an activity running (the retimer should pick up the new blessing).

