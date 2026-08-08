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

