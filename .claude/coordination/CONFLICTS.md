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

