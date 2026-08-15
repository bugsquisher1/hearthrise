# CONFLICTS

_Open conflicts — code, design, asset, gameplay, architecture, integration. **Never silently resolve a meaningful conflict.** Log it, route it to the owners, resolve with evidence, then move it to Resolved._

## Conflict types to watch
- **Code:** two agents editing overlapping lines/files.
- **Semantic (the dangerous kind — no git conflict):** two agents holding incompatible models of how a system should behave. Example: Game Designer says "cooking should improve combat effectiveness"; Systems says "cooking currently only modifies XP." No merge conflict, but a real design/system conflict. Flag it.
- **Design:** competing player-experience goals.
- **Asset:** style/consistency disagreements.
- **Architecture:** competing structural approaches.
- **Integration:** a change that breaks another verified change on merge.

## Open

### 2026-08-15 · BLOCKER (code + semantic) — the away buff rule is landed in CORE only; the gather/artisan replay in `legacy.js` must land before this ships (Systems → whoever holds `src/legacy.js`)

Branch `agent-a06ecbcee310aa2c7`. `AWAY_SCOPE.buff` is now `true` (Tyler, 2026-08-14: personal buffs pay away, server-wide blessings do not). That flag is a property of the SCOPE TABLE, so it opens for every away caller at once — but only one of them can honour the other half of the rule.

- **away COMBAT** — `src/core/combat-sim.js simulateSpan` owns a timeline (it already segments by UTC day for the Boss of the Day). It drives the buff clock per tick, so a buff expires at the right instant. **Correct, measured, tested (AWAY-5 / AWAY-15).**
- **away GATHER / ARTISAN** — `legacy.js processOffline` computes `ticks = floor(spanMs / offlineIntervalMs())` and runs that many identical actions. A flat single-rate loop: the interval is derived ONCE before the first action and nothing advances a clock inside it. It therefore **pays a buff for the whole absence and drains none of it.**

**Measured exposure** (shipped food catalogue — magnitudes 1–5, durations 2–20 min): a `gather_speed` buff eaten immediately before logging off applies its speed term to the entire night (max **+4%**, via the one-shot `activityIntervalMs()` read); an `all_xp` buff applies to every action of the night (max **+5%**). Bounded, deliberate to trigger, and still the b326 exploit in miniature.

**Second, player-facing half of the same defect:** `legacy.js` line ~1399 computes `buffsPaused` for the non-combat branch as "did they hold a buff", and `src/features/home-dashboard.js:565` prints "your buffs were paused" off it. On a gather night that copy is now a lie in both directions — nothing was paused, and it paid all night.

**The fix is in `legacy.js`, not in core:** split the gather/artisan replay at the buff-expiry boundary — run `min(buffRemainingMs, spanMs)` of ticks with the buff live, call `advanceBuffClock` for that slice, re-derive `offlineIntervalMs()`, then run the remainder. Same shape `simulateSpan` uses, one level up. Then drop `buffsPaused` from the non-combat summary. **Do NOT "fix" it by closing `AWAY_SCOPE.buff` again** — that reverts a stated design rule to work around a loop that should have had a timeline all along. The full note is at the foot of `src/core/away.js`.

Also stale and now wrong in `legacy.js` (comments + one player-facing string, all untouched because another agent holds the file): the `getBuffBonuses` header (~14220), `advanceBuffClock`'s drain-rules comment (~14328), `buffFrozen()` and its copy *"freezes entirely while you are away"* (~14454–14490), and the `buffsPaused` doc block (~1390).

### 2026-08-15 · FINDING (no change made) — the offline cap does NOT stop the character; it caps the payout and shifts the window to the END of the absence (Systems → Coordinator / whoever owns the cap)

Tyler's rule: *"after that player's 'max offline time' is reached, their character stops all activity."* **Measured behaviour today is the other one.** Driving the real `processOffline()` with a stubbed cap and `document.hidden` forced false:

| scenario | absence | cap | PAID | `capped` | activity still running on return | sim window |
|---|---|---|---|---|---|---|
| gathering | 3h | 1h | 1h | true | **yes** (`activeSkill: woodcutting`) | n/a |
| combat | 3h | 1h | 1h | true | **yes** (`activeMonster: slime`) | now−1h → now |
| combat | 18h | 12h | 12h | true | **yes** | now−12h → now |

So today: **(a)** the payout is capped and the activity is still running when the player returns — not **(b)** the character stops at the cap and returns idle.

There is a second, less obvious half nobody has stated: `simulateAwayCombat` sets `fromMs = now − paidMs`, so the credited window is the **LAST** `cap` hours before returning, not the **FIRST** `cap` hours after leaving. An 18-hour absence is simulated as "idle for 6 hours, then fought for 12". Under Tyler's rule it should be "fought for 12, then stopped". The amount paid is identical either way; **which UTC day's Boss of the Day is credited is not** — a long absence is currently credited against the wrong day's boss. It also decides which instant a held buff's remaining time maps onto.

Reported, not changed — the cap is Tyler's call and it interacts with in-flight work elsewhere.

### 2026-08-14 · b342 · SEMANTIC — every proc pet just got HALVED to its declared rate (Systems → Game Designer)
Companion procs were applying **twice per trigger** — measured, in the real client: 2 applications, 2 toasts and 1.0 pet XP (a utility pet earns 0.5) on each of kill / combatHit / gather / cook. Two identical hook sets, one in `src/legacy.js` block 31 and one in `src/features/companions.js`, both wrapping `killMonster` / `combatTick` / `addItem`. The legacy copy is deleted (b228's fix, one layer up).

**This is a correctness fix that lands as a live NERF**, and Design should know the numbers rather than read them off a changelog:
- A Raccoon's advertised "20% on kill" was really **36%** (1 − 0.8²). Every proc pet was ~2× its declared rate. The power budget was never told, so the census figures for companions have been understating real pet value since the hooks were written.
- Companion **XP** was also double: every pet levelled at 2× the intended rate, so live beta pets are roughly twice the level their playtime earns.
- Companion **drop** rolls were double: Wolf Pup's 1% was really 1.99% per kill (2 independent rolls; the unlock itself was self-limiting).
- `G.stats.cropsHarvested` moved **+2 per harvest**, so the Bunny quest ("harvest 100 crops") completed at **50** and the weekly `wk_harvest` ("Harvest 120 crops") at **60**. Both now cost what they say.
- The pet-impact panel (`HearthrisePetSession`) only ever heard from the ESM copy, so it was reporting **exactly half** of what pets really paid. It is now accurate — which will read to players as pets "getting better at reporting" in the same build they get worse at paying.

**No balance VALUE was changed** — `src/data/companions.js` is untouched. If Design wants the effective rates restored, that is a data edit to `proc.chance` and it should be made deliberately, with the budget re-run. **→ Game Designer to rule on whether the declared rates are the intended rates.**

### 2026-08-11 · b330 · SERVER GAP — leadership has no read for its own outstanding invitations (Systems → whoever next owns the membership SQL)
`2026-08-11-clan-membership-authority.sql` shipped `clan_invites_list()` for the **invitee** only, and `clan_invites` deliberately has **no client SELECT policy**. So a leader can send an invitation and revoke one, but the server offers no way to ask *"who have we invited?"* — which the panel needs before it can draw a Withdraw button beside a name.

I did **not** invent a client-side list and I did **not** add a policy to `clan_invites` (a readable invite table is a readable list of who is being courted, and the migration is explicit that the RPCs are the only door). The panel derives the answer from **`clan_ledger`**, which is `for select using (true)` and which every membership RPC journals to (`invite` / `invite_revoke` / `join_invite` / `join` / `kick`): the newest row per user decides, and an `invite` row older than the server's 7-day TTL has lapsed. That is complete rather than a guess — but it is a **derivation of server state on the client**, which is the shape this project has decided against everywhere else.

**The honest fix is a `clan_invites_outstanding()` RPC** (leadership-only, `hr_clan_may_admit`, rate bucket `clan_invites_list`, returning `{user_id, display_name, invited_by, created_at, expires_at}`). When it lands, delete `outstandingInvites()` in `src/features/clans.js` and call it instead — the panel consumes an array of the same shape, so it is a one-function swap. A stale derived entry costs nothing today: revoking it answers `revoked: 0`, which the transport already reports as *"There was no invitation left to withdraw."*

**Also noted, not acted on:** the migration has no **decline** path. An invitee can accept or let it lapse. The inbox therefore draws Accept only and says what happens if you do nothing — a Decline button would be a control that cannot do what it says. If Design wants decline, it needs `clan_invite_decline(p_clan_id)` (sets `revoked_at`, journals `invite_decline`). **→ Game Designer to rule, Systems/SQL to build.**

### 2026-08-09 · b228 rebase applied — three of the batch below are RESOLVED, two new items open (Systems)
**Resolved by `agent-rebase` (b228):** items 1, 3, 4, 5 and most of 6 of the batch below. The fuse moved to `src/features/power-budget.js` as the final wrapper; `smoke-test.js`'s offline-latch test already asserted through `bonusFor` (pre-clamp) so it did NOT break structurally — it gained an explicit second assertion that the clamp is not what makes the two nights equal, so the latch keeps doing the latch's job; the `farmYield` flooring fix, the companion key-name fix and the ranged/magic `combatXP` fix all landed inside the rebase commit; `CASTLE_TOTAL_CAP` is deleted rather than enforced (a cap that a later wrapper escapes cannot be given a real job — the real job moved to power-budget.js). Item 7 was already shipped: Workshop and Shrine were at +2/4/6/8/10 when this branch read them.

**Still open from that batch, unchanged: item 2** (Designer must point `homestead-deepening.md` §H2/H3/H4, `clan-overhaul.md` §8.1/8.2/8.4 and `pacing-overhaul.md` A.4 at `bonus-rebase.md`), and the **`hearthScale()` inertness** half of item 6 — `registerBuffScaler` still has no live caller, so the Tavern's +40% duration / +10% magnitude has still never applied. It is rebased and correct; it is not wired. **→ Systems, next pass.**

**NEW · 1 · SUPERSEDED SPEC LINE (Designer ↔ Tyler).** `bonus-rebase.md` §4.3 lists the renown weights (`14 / 900 / 0.5`) as **unchanged — "pacing, not bonuses"**. Tyler's directive of the same day overrides it: *"It also seems to be going way too fast."* Every `W` weight came down (`totalLevel` 14→2, `kill` .5→.05, …); the twelve **thresholds are frozen** and now pinned by a test, because `min` is compared against the `renownHigh` ratchet — lowering a weight can never demote anyone, but raising a threshold demotes everybody at once. **→ Designer:** the pacing appendix and §4.3 need the amendment.

**NEW · 2 · DEFERRED BY SYSTEMS, DELIBERATELY — the L5 batch-capacity rungs.** §5.3 converts the three Keystone L5 benches to "one action produces five". Systems did **not** build it, and the reason is not effort: batching converts an artisan skill's bottleneck from TIME to MATERIALS, which is roughly a **5× move on artisan XP/hour** and directly reverses §5.2's own stated consequence ("the artisan block collapses onto its no-perks column, ≈18–19 months"). That is a pacing decision with the product owner's name on it, not a magnitude Systems may pick while applying a magnitude spec — and §5.5 already schedules it for b229. The rungs are not dead in the meantime (they pay +10% speed and an 8% proc, honestly stated), but the Keystone price is still thin. **→ Game Designer:** name the batch size, and say whether the Shrine's specced bulk-bury of 10 is the same mechanic or a different one. Systems builds it once that number exists.

### 2026-08-09 · Bonus-rebase batch (Game Designer — full detail in `docs/design/bonus-rebase.md` §6)
1. **ARCHITECTURE · the fuse cannot police a chain it sits in the middle of.** `getBonus` is a base function plus **six additive wrappers**; the fuse lives at layer 4 (`clan-seat-ui.js:297`) and reduces only the castle's own contribution, so companions, food buffs, the muster aura and the whole blessing calendar are unpoliced. **Ruling: move the budget to a final `src/features/power-budget.js` wrapper installed last**, applying `permanent ≤ 0.20` / `temporary ≤ 0.15` / `total ≤ 0.30` per key. Needs permanent and temporary to be separately accumulable. **→ Systems, ruling required before b228 builds.**
2. **SUPERSEDES · `homestead-deepening.md` §H2/§H3/§H4 and `clan-overhaul.md` §8.1/§8.2/§8.4 are replaced** by `bonus-rebase.md` §2.2/§3. The `allXP ≤ 0.60` fuse, the artisan `≤ 0.85` clamp, the `restedXp ≤ 0.50` clamp (item 2 of the homestead batch below) and the +52%/+25% ceilings are all retired. `pacing-overhaul.md` A.4's boost columns (+20/+33/+52%) no longer describe anything. **→ Designer, next touch of each doc.**
3. **TEST BREAKS STRUCTURALLY:** `smoke-test.js:8746` forces a synthetic all-keys blessing of 0.50 and asserts `bonusFor('allXP') === 1.0`. A final clamp caps that at 0.30. The offline-replay latch it guards is load-bearing and must keep being guarded — assert pre-clamp, or bring the synthetic magnitudes into legal range. **→ Systems + QA.**
4. **UNBUDGETED INCREASES that must land INSIDE the rebase commit, not after it:** (a) the `farmYield` flooring fix (`legacy.js:2390` floors the total, so Scarecrow 0.1, Bunny 0.10, Squirrel 0.15, Carrot Stew 0.15 and Roasted Pumpkin 0.05 have all paid **zero** since launch); (b) the companion key-name fix — `xpB`, `goldBonus`, `prayerXp` are misspellings of `allXP`, `goldFind`, `prayerSpeed`, so Fox, Lichling, Raccoon, Owl and Grave Wisp pay nothing. **→ Systems.**
5. **P1 · LIVE:** `combatXP` is applied only to attack/strength/defense/hitpoints (`legacy.js:1508`) — the Trophy Room, the Watchtower, War Drums and Hunter's Moon pay **nothing** to ranged and magic. Pre-existing, orthogonal to the rebase. **→ Systems.**
6. **INERT:** `hearthScale()` (`clan-seat.js:256`) advertises +40% buff duration / +20% magnitude at Tavern 10 but `registerBuffScaler` has no live caller — it has never applied. Also `CASTLE_TOTAL_CAP` (`clan-seat-ui.js:126`) is declared and enforced against nothing, and Frostfin Supper's `defense` buff is a silent no-op (`items.js:159` vs `BUFFS_DEF`). **→ Systems.**
7. **P1 · IN FLIGHT:** the `agent-homestead` provisional retuned six rooms and missed two — **Workshop and Shrine are still at +10/25/50/50/60** while the Forge is at +2/4/6/8/10. Must land in the same commit. **→ homestead agent.**

### 2026-08-08 · QA attack-pass routed findings (full repros in agents/qa-engineer.md — read them there)
- **P2 → Systems:** welcome-back modal reports HALF the offline yield actually granted (display recomputes a stale 0.5x model; render `G.lastOfflineSummary` instead).
- **P2 → Systems:** multi-tab = silent last-writer-wins save destruction (no lock, no storage listener).
- **P3 → Systems:** `processOffline()` not idempotent (latent); naive lastSeen fix blanks the welcome-back modal — see the rested-XP watermark pattern.
- **P3 → Systems:** one unknown `cropId` kills the whole Farm page (renderers unguarded; `isReady()` already defends it).
- **P3 → Designer:** renaming leaves open market listings under the old seller name (re-render from identity vs immutable-ledger — a ruling).

### 2026-08-08 · Homestead-deepening batch (Game Designer — details in `docs/design/homestead-deepening.md` §9)
1. **P1 · LIVE DEAD CONTENT (independent of any spec):** `farm-progression.js TIERS` stops unlocking crops at Pumpkin, *including at MAX plot level*, but b215 added **Goldenroot (farming 62), Emberfruit (75), Moonbloom (88)** to `CROPS`. `canPlantCrop()` is a hard gate in `plantCrop`, the seed picker and auto-replant → **three crops, three seed items and two cooking recipes (Goldenroot Roast, Moonbloom Elixir) are unreachable at every plot level.** Farming's last 37 levels have nothing to plant. Five-line data fix; blocks the Garden ladder but should ship regardless. **Owner: whoever holds `farm-progression.js` next.**
2. **SEMANTIC · `restedXp` is now claimed by BOTH pillars.** Homestead Library L4/L5 and castle Tavern Common Room both grant potency, and `getBonus` **sums**. Unclamped, a clanned player with a maxed Library reaches 100% potency = double XP on 80 banked charges. **Ruling: clamp `restedXp ≤ 0.50` aggregate — two roads, one ceiling.** Whichever pillar ships first lands the clamp.
3. **CORRECTION · `clan-overhaul.md` §8.3's allXP arithmetic is four points low.** Stated post-re-scope ceiling +47%; actual is **+52%** (it omits the homestead property capstone, `getBonus` `isCastle() → +0.05`). The `≤0.60` fuse still holds but the headroom is 8 points, not 13. **No system in either pillar may add a new `allXP` source.**
4. **DESIGN LAW (applies to the castle too):** extra-output perks (`yield_*`, `craftSave`) must fire only when `!ITEMS[recipe.output].type` — materials, never equipment. The vendor pays full item `v`, so a 20% extra-output roll on endgame armour prints six figures per craft.
5. **BROKEN PERK:** the Scarecrow plot-building grants `farmYield: 0.1` and `harvestPlot` **floors** the total — it has contributed nothing since launch whenever the Garden's bonus is an integer. Same class as the Cellar's dead storage perk.
6. **DEAD UI:** six ghost keys in the House bonus display (`legacy.js:5092`) — `noBurn`, `craftSave`, `kitDrop`, `farmYieldPct`, `hearthXP`, `storage`. The spec revives `craftSave` and deletes `storage`; the other four should be **removed from the display list**, not invented into mechanics.
7. **ASSET DEPENDENCY:** 8 room illustrations (lit / ghosted / locked) + 3 Phase-3 rooms, in the same "Forge & Stone" language as the castle view. The two pillars' art must be produced together or the twins will not look like twins.

### 2026-08-08 · Hunt ratification batch (Game Designer — rulings recorded in the specs)
1. **SYSTEMIC ECONOMY (flagged, not fixed):** vendoring pays the full item `v` (`invSellOne`), so every high-tier craft is a gold faucet — Dawnsteel Platebody turns 21,000g of bars into 108,000g; the Hunt-forged one turns 34,800g into 270,000g. The Hunt is not the marginal offender (weekly-rate-limited inputs), but the craft-to-vendor margin should be priced deliberately rather than inherited from `tier.value`'s 2.77× step. **Owner: Systems.**
2. **ECONOMY INTEGRITY (one question, not three patches):** a signed-out session derives its muster/raid windows from the **local clock**, so a clock-rolled guest can re-claim the solo floor band; the solo-raid claim flag has the same shape (P3). The real question is whether a locally-earned save is trusted when it first syncs on sign-in. **Owner: Systems.**
3. **CADENCE:** the Hunt week rolls **Thursday 00:00 UTC** (epoch weekday) while castle upkeep rolls **Sunday 00:00 UTC**. Two reset clocks in one clan pillar. Target state is one clan week boundary; changing it now truncates a live raid week, so it is a follow-up, not a Wave-3b reversal.

### 2026-08-08 · Clan-castle v2 batch (Game Designer, filed by Coordinator — details in clan-overhaul.md §15)
1. **SEMANTIC:** clan `level` cannot gate the castle — `clan_contribute` is `10000 × 4^(level−1)` → level 10 = 655,360,000 gold. Progression moved to **Standing**; `level` demoted to cosmetic. `clans.js` L17-19 comment documents a third, also-wrong ladder.
2. **SEMANTIC → taxonomy:** four new castle goods need a **"Castle Stores"** artisan lane (`ITEMS[out].tag === 'castle'`) or the uncategorized-is-empty regression test breaks on the commit that adds them. Land the lane WITH the items.
3. **DEPENDENCY:** `goldFind` getBonus key is declared but never read — Treasury perk is a broken promise until Systems wires it (Wave 3).
4. **DEPENDENCY:** Tavern Hearth needs a buff duration/magnitude multiplier seam in the engine.
5. **DEPENDENCY:** Rested XP is a new engine seam — touches `processOffline`, the XP grant path, and the fragile `snapshotG` allowlist. Handle with care (offline double-pay history).
6. **INTEGRATION:** Muster and castle Labour BOTH wrap `updateDaily` — each wrapper needs its own idempotency flag or double-count/double-wrap bugs follow.
7. **DESIGN (recorded, deliberate):** Tavern-10 Feast at Last Call ≈ +65% allXP for 4h — the ceremony peak, inside the stated power budget.
8. **LIMITATION (wording discipline):** `clan_deposit` cannot verify item possession. Castle economy is server-authoritative for currency/gates/rewards/rate, CLIENT-TRUSTED for possession (clamped + audited). Never describe it as fully server-authoritative.

### 2026-08-08 · SEQUENCING · #14/#15 and #16 must ship together (Game Designer)
`world-event-cadence.md` §7.2 moves the raid card out of `#panel-dungeons` into the new Events panel — if the Hunt (#16) lands in a different wave, its card sits in a panel with no nav entry (the exact bug #14 fixes). Wave planning constraint.

### 2026-08-08 · DEPENDENCY · perk-stacking re-scope must land WITH Hunt chests (Game Designer)
A simultaneous +57% allXP stack would invalidate Hunt reward tuning — land clan-perk re-scope + Hunt in the same wave.

### 2026-08-08 · DEPENDENCY · six new boss signature materials need recipes at ship (Game Designer)
Else they join the recipe-less vendor-trash list (items 26–31). Route into b215 armour tiers when #16 ships.

### 2026-08-08 · DEPENDENCY · `serverSkewMs` (server-time offset) needed for topbar countdown (Game Designer → Systems)
No current equivalent exists; without it a wrong device clock makes Join appear broken. Build with #15.

### 2026-08-08 · SEMANTIC · Perk stacking power budget (Game Designer → Systems Engineer)
Homestead + renown + clan-level + proposed clan-wings all funnel `getBonus`; `allXP` could stack to ~+57%. Designer recommends re-scoping clan auto-level `PERKS` to baseline-only + a per-key soft cap, landed **with** the wings (clan-overhaul §7). Systems must rule on the cap mechanism before Wave 3 builds the wings.

### 2026-08-08 · DEPENDENCY · `raidPower` getBonus key (Game Designer → Systems Engineer)
Clan-overhaul spec introduces a new `getBonus('raidPower')` that `src/features/raids.js simulateStrike` must consume (clan-overhaul §4.3). Wave 3.

### 2026-08-08 · DEPENDENCY · `snapshot.renown` for leaderboards (Game Designer → Systems Engineer)
Flagship Throne board needs `renown` written into the client save snapshot on save (leaderboards §3.2). Touches the fragile `snapshotG` allowlist — Systems change. Wave 3.

## Resolved

### 2026-08-08 · SEMANTIC · Auto-eat vs foodClass split — RESOLVED in b220 (Game Designer)
**Was:** cooking taxonomy adds `foodClass: 'healing' | 'buff'` and auto-eat must draw from `'healing'` only, but fish-line Provisions carry incidental combat buffs, so the line was unclear.
**Ruling (taxonomy §5.4):** the fish line KEEPS its buffs — `foodClass` governs what the *engine* may spend, not what stats an item has. Stripping +12% damage from Cooked Shark would be a combat-balance change smuggled in under a UI task, and it isn't needed: `maybeAutoEat()` heals and decrements, it never calls `applyBuff()`, so auto-eating a Provision grants no hidden power. Buffs are applied only by the deliberate Eat action.
**Evidence that settled it:** the real defect was auto-eat's *selection*, which preferred items with no `buff` field — and since every cooked food has one, that meant raw ingredients: it picked Raw Shrimp (3 HP) over Cooked Shark (42 HP), then fell through to a Void Banquet once raws ran out. Now the pool is exactly Provisions and the pick is the best heal. Verified in-browser: with only Feasts in the bag at 8/100 HP `maybeAutoEat()` returns false and consumes nothing; with Provisions present it eats Cooked Shark (HP 8→50) and leaves the Void Banquet stack at 3. Regression tests: `b168/b220: auto-eat draws from Provisions, preserves Feasts` and `b220: auto-eat never consumes buff food`.

