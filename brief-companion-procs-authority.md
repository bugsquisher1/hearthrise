# LANE BRIEF — lane/companion-procs-authority

**Branch:** `lane/companion-procs-authority`  **Base:** origin/main at the SHA the Coordinator names in the routine prompt (b557 and b558 ship before this lane; do NOT branch from 3879e05a). **Lane class:** B (client-only, several rendered surfaces). **Priority:** P1 (§6: the browser says one thing, the server another, on a money-adjacent surface). **Proof branch:** `qa/companion-procs-authority` (PNG only).

Line numbers below are from `origin/set/b558` (7b1b4965), which is b557 + the content packs. Re-grep every anchor on your base before editing; b558 shifts companions.js by +1..+3 and legacy.js by −98 against b556.

Hard rules for this routine: never deploy, never touch the DB, never edit `tests/live-hash-drift.baseline.json`, never commit `docs/reports/visual-qa/findings.json`, never run `bump-version.sh`, no `git stash`, commits ≤ 8 lines ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, commit + push early and often. Every new import under `src/**` carries `?v=NNN` where NNN = `BUILD.cache` in `src/build-info.js` on your base (557 on b558; read it, do not assume). No `?v=` under `tests/**`.

---

## 0. CONFIRM THE MECHANISM FIRST (stop if any line fails)

Run this pure-module probe from the repo root on the base, before any edit. It is the one the diagnosis was checked with; it must print exactly these shapes or you stop and report.

```js
// scratch/probe.mjs (do not commit)
import { playerCombatRolls, monsterCombatRolls, equipmentStats } from '../src/core/combat.js';
import { COMPANIONS } from '../src/data/companions.js';
import { COMPANION_KEYS } from '../src/core/companion-perk.js';
const items = { bronze_sword: { type:'weapon', atkB:2, strB:3, weaponType:'sword' } };
const m = { id:'goblin', hp:20, def:1, atk:2, str:2, level:3 };
const ctx = (extra, bonus={}) => ({ equipment:{weapon:'bronze_sword'}, items,
  skills:{attack:{level:10},strength:{level:10},defense:{level:10}},
  eq: Object.assign(equipmentStats({weapon:'bronze_sword'}, items), extra), bonus:(k)=>bonus[k]||0 });
const a = playerCombatRolls(m, ctx({})), b = playerCombatRolls(m, ctx({strB:9, atkB:4}));
console.log('STR/ATK ignored:', a.maxHit===b.maxHit && a.accuracy===b.accuracy);          // must be true
console.log('crit stacks:', playerCombatRolls(m, ctx({critB:.10},{crit:.05})).critChance); // must be 0.15
console.log('defB read:', monsterCombatRolls(m, ctx({})).accuracy > monsterCombatRolls(m, ctx({defB:20})).accuracy); // true
for (const [id,d] of Object.entries(COMPANIONS)) console.log(id, 'unpaid:', Object.keys(d.bonus).filter(k=>!COMPANION_KEYS.includes(k)).join(','), 'proc:', d.proc?`${d.proc.trigger}/${d.proc.effect}`:'-');
```

Expected: `STR/ATK ignored: true`, `crit stacks: 0.15`, `defB read: true`; unpaid keys = fox strB; wolf_pup strB,atkB; badger strB,defB; hawk rareDrop; whelp strB,crit; scorpion atkB,crit; tortoise defB,hpRegen; dragonling rareDrop,strB; every other pet has no unpaid key.

Then confirm by grep on the base:
- `rollProc` defined in `src/features/companions.js` (b558 :644-702) and called at :736 (`rollProc('kill', {})`), :796 (`rollProc('cook', { inputs: {} })`), :799 (`rollProc('gather', { lastDrop: { id, qty } })`); `wireCombatTickProc` :778-786 booted at :1044.
- TWO `getEquipmentStats` wrappers: `src/legacy.js` :16878-16891 (IIFE) and `src/features/companions.js` :1059-1070. A getBonus wrapper at companions.js :1050-1058 adding EVERY `getCompanionBonus()` key (crit included).
- No engine payer: `grep -rn "doubleDrop\|doubleYield\|refundIngredients\|fireDot\|guaranteedRare\|extraGold" src/core supabase/functions supabase/migrations` returns comments only (`supabase/functions/hr-accrue/accrual.js` :2188-2193 names killMonster wrappers as deliberately absent; `supabase/migrations/2026-08-20-companion-model.sql` :48-52 says procs are client-display flavour, deferred).
- The engine's only companion layer is `companionBonus` (accrual.js :144, :821-846) → `src/core/companion-perk.js` `COMPANION_KEYS` :55-58 (`allXP goldFind gatherSpeed cookSpeed smithSpeed craftSpeed prayerSpeed farmYield`); combat stats, crit, rareDrop, hpRegen are OMITTED by design (:31-38).
- `node tools/pack-edge.mjs hr-accrue --hash` — RECORD THIS HASH. It must be byte-identical at the end of the lane.

If any of these does not hold on your base, stop, commit nothing, report what differed.

## 1. ROOT CAUSE (verified, with the skeptics' corrections applied)

1. **No server pays any proc.** `rollProc` (companions.js :644-702) is the only implementation, run from three client monkey-patches (killMonster :723-763, combatTick :778-786, addItem :788-804). What each effect does in production, by reading the code with the ctx each live site passes:
   - `doubleDrop` (wolf_pup): the kill site passes `{}` (:736), so :678 never writes. Toast + pet-panel "Extra drops +1".
   - `guaranteedRare` (hawk): sets `G._companionRareNext` (:690); zero readers anywhere in src/supabase (grep).
   - `instant` (sparrow, beaver, rock_golem, heron): `G.skillProgress = 1` (:685) after `doSkillAction` reset it (legacy.js :6807); the 100 ms ticker (:6625) clamps at 1, so the bar sits full for a whole interval and nothing arrives sooner.
   - `fireDot` (whelp, dragonling): `G.activeMonster` is a STRING id (legacy.js :5967) and companions.js is an ES module (strict), so :692 throws `TypeError: Cannot create property 'hp' on string`. It also hits `startCombat`'s inline first swing (legacy.js :5971), which aborts before `renderCombat()` (:5972) and `declareActivity('combat')` (:5979); the swing-stamp wrapper in `src/features/combat-screens.js` :352-356 is outside it (main.js boots companions :521, combat-screens :527) so `lastTickAt` is skipped. Only Dragonling can reach this in production (Whelp's egg is server-enforced since `2026-09-06-companion-grant-hardening.sql` C2 :437-452 and dragon_egg has no ITEMS row).
   - `gold`/`extraGold` (fox, raccoon, lichling): deferred by :672-673 (gold is armed) → never fires.
   - `doubleYield` (bunny, squirrel): nothing calls `rollProc('harvest')`.
   - `refundIngredients` (honeybee, phoenix_chick): gated on `G.activeArtisanRecipe`, which nothing in `src/**` writes (grep; `activities-grid.js` :231; PRIORITY_BOARD.md :237 already records zero writers).
   - The Stable (:971), the paper-doll (`src/render/equipment-doll.js` :190) and the pet panel (`src/features/pet-session.js` :92-121, :165-171, :175-182, :188 "nothing here is estimated") render all of it as paid.
2. **Companion combat stats: client 2-3x, server 0x — but the mechanism is crit and defB, NOT STR.** Both `getEquipmentStats` wrappers add strB/atkB/defB and critB (legacy.js :16878-16891 with the b228 tombstone at :16861-16876 saying "this copy is deleted" directly above it; companions.js :1059-1070). The companions getBonus wrapper (:1050-1058) adds `cb.crit` a third time, which `src/core/combat.js` :518-520 reads through `src/core-bridge.js` :275-278. Core `playerCombatRolls` sums strB/atkB from ITEM ROWS (:462-468) and never reads `eq.strB`/`eq.atkB`, so companion STR/ATK are a display-only lie (fight totals combat-screens.js :1149-1150, Combat Stats Breakdown legacy.js :13946-13952, loadout :7560, both `getEquipmentBonusFor` copies legacy.js :17086-17111 and `src/features/character-page.js` :100-122 feeding the style cards :311-313). What DOES reach the engine: `eq.critB` (:520) and `eq.defB` (:533). Whelp declares 3% crit and gets 9% on the client; Scorpion 5% → 15%; Tortoise defB 10 → 20 (monster accuracy 0.506 → 0.386 on the probe). The server sims attended kill-credit caps and every away night with none of it (accrual.js :500-509 uses server gear). This does not raise any forgery ceiling (a devtools forger reaches the same `hr_credit_kills` cap with no pet), but an honest client over-claims inside a known self-only bound, and attended play and away play disagree about the same character. Fox (the starter, strB:1) puts the display half in front of nearly every player.
3. **Ghost keys:** `rareDrop` (hawk .10, dragonling .15) and `hpRegen` (tortoise 2) have no reader on either side (grep: only label maps at companions.js :938, equipment-doll.js :177, legacy.js :16847). `src/features/power-budget.js` :77-81 wrongly lists `crit` and `damage` as ghost keys; combat.js :515/:518 read both.
4. **farmYield parity gap:** `companionKeyBonus('farmYield')` scales by level (companion-perk.js :112-117, x2.45 at L30) but the only payer, `hr_farm_harvest` (`2026-08-22-server-farming-complete.sql` :396-410), adds the flat `hr_farm_yield_perk` row (`2026-08-22-farm-catalogues.generated.sql` :113-114: `companion:bunny 1`, `companion:squirrel 1`); the edge engine references farmYield nowhere. The doll (:174-181) renders the scaled figure.
5. **Stale premises that kept this alive:** `src/data/item-authority.js` :41-50 and PRIORITY_BOARD.md :284 ("procs mint INVENTORY"), `src/net/gold-sites.js` :575-584 (two deferred rollProc rows), :877-880 (pet-session#recordProc), :320-323 and :754-755 prose, `tests/inventory-mint-census.mjs` :165-172 ("~2-3% ACCEPTED RESIDUAL"), legacy.js :2773-2776 and :6438-6440 (comments naming companions.js as a getEquipmentStats wrapper), accrual.js :777-779 and `src/core/perks.js` :437-440 ("no server model at all" — false since companion-perk.js; DO NOT edit those two, they are in the edge payload; report them for the Coordinator).
6. **Not class members (leave alone):** the consumable-buff getBonus layer (server pays it as layer 2, accrual.js :824-846), tools and charms (server-paid), the four client-only getBonus layers (clan-seat-ui :406-408, clans, muster, world-events :233-240 — a §6 display lie inside the Security-accepted combat-XP cap, a separate sweep), and companion ACQUISITION rolls (companions.js :742-757, pets.js :98-137, bunny quest :806-820) → they feed `hr_companion_grant`, which is Security-owned LANE C (see §6). The b558 codex/primer copy ("lends you its bonus") promises only paid effects; the hawk/dragonling lore lines (`src/data/lore-notes.js` :14, :29) are flavour — leave them, flag for the Designer.

## 2. THE CLASS LIST (all fixed in this one build)

| # | Site (b558) | Symptom |
|---|---|---|
| 1 | companions.js :644-702 rollProc + :624-642 showProc + :778-786 wireCombatTickProc + calls :736, :796, :799 + boot :1044 | 15 proc pets advertise effects that pay nothing; fireDot throws on ~2% of ticks and on fight start |
| 2 | companions.js :609-622 awardXpForRole | dead: `awardCompanionXp` returns at :208 (`COMPANION_XP_SERVER_BACKED` is `true`, core/companion-xp.js :89) |
| 3 | companions.js :1059-1070 + legacy.js :16878-16891 | double equipment layer; critB 2x, defB 2x, strB/atkB display 2x |
| 4 | companions.js :1050-1058 | getBonus wrapper adds every key incl. crit (3rd application), strB, rareDrop, hpRegen |
| 5 | legacy.js :16840-16859 classic `window.getCompanionBonus` | second owner of the same map (overridden at companions.js :1012 after boot; the b228/b342 two-owner shape) |
| 6 | legacy.js :17102-17109 and character-page.js :114-122 | 3rd/4th application on the character style cards |
| 7 | companions.js :951-954 (bonus row renders raw `def.bonus`, UNSCALED) and :971 (proc line); equipment-doll.js :174-190 (scaled `getCompanionBonus`, proc line) | Stable and doll disagree with each other and with the server about the same pet |
| 8 | pet-session.js :32-39, :92-121, :165-171, :175-182, :188, :300 | "Extra drops", "Procs fired", "Gold contributed", "Doubled by", "nothing here is estimated" |
| 9 | power-budget.js :77-81 comment | says crit/damage have no reader |
| 10 | gold-sites.js :575-584, :877-880 rows; :320-323, :754-755 prose | census rows for sites this lane deletes (gold-site-census `stale_ledger_row` :560 goes RED otherwise) |
| 11 | tests/inventory-mint-census.mjs :84, :165-172 | pins the three rollProc inventory tokens; `mint site GONE` :309-310 goes RED otherwise |
| 12 | item-authority.js :41-50 comment; PRIORITY_BOARD.md :284 residual; monsters-inventory-and-brand.js :3003 reason string; legacy.js :2773-2776, :6438-6440 comments | stale premises |
| 13 | tests pinning the old machinery: quests-chronicle-and-bonus.js :1791-1940 (b342), property-and-unlocks.js :2342-2377 (b420), cooking-core-and-save.js :4658-4685 (b345 SITE 1 layer 2), away-time-and-offline.js :1771-1810 (b269 recordProc lines) | must be REWRITTEN to the new contract in the same commit, never disabled |

## 3. FIX DESIGN — one seam, client-only

**Principle:** `src/core/companion-perk.js` is the only definition of what a companion does (the edge already imports it, accrual.js :144). The client applies and renders exactly `COMPANION_KEYS` via `companionKeyBonus`, and nothing else. Do NOT edit `src/core/**` or `src/data/companions.js` (both are in the hr-accrue payload graph: `vendor/core/companion-perk.js`, `vendor/data/companions.js`); the `--hash` gate in §5 proves it. `src/data/item-authority.js` and `src/data/lore-notes.js` are NOT in the graph (verified by listing the pack).

### 3.1 New pure helper `src/render/companion-lines.js` (ESM, importable in Node)
```js
import { COMPANIONS } from '../data/companions.js?v=NNN';
import { COMPANION_KEYS, companionKeyBonus } from '../core/companion-perk.js?v=NNN';
export const COMPANION_LABELS = { strB:'STR', atkB:'ATK', defB:'DEF', crit:'Crit', allXP:'All XP', gatherSpeed:'Gather', farmYield:'Farm yield', cookSpeed:'Cook speed', smithSpeed:'Smith speed', craftSpeed:'Craft speed', prayerSpeed:'Prayer speed', rareDrop:'Rare drop', goldFind:'Gold find', hpRegen:'HP/sec' }; // keep ALL 14: tests/lore-notes.mjs :94 reads this map as the stat vocabulary — move that read to this file in the same commit
export function companionPaidBonus(id, xp)  // { key: value } for COMPANION_KEYS only, nonzero only; farmYield = the FLAT catalogue base (COMPANIONS[id].bonus.farmYield), never level-scaled, because hr_farm_yield_perk pays flat (see §1.4); comment cites the SQL row
export function companionPaidLines(id, xp)  // [{ key, label, text }] — text '+N%' for percent keys, '+N crop' for farmYield; [] when nothing is paid
```
Publish it from companions.js: `window.HearthriseCompanions.paidLines / paidBonus` (the classic IIFEs — equipment-doll.js, pet-session.js — cannot import). `tests/window-globals-exist.mjs` is satisfied by the existing `HearthriseCompanions` assignment (:1025).

### 3.2 `src/features/companions.js`
- `getCompanionBonus()` (:179-197) returns `companionPaidBonus(equippedId, xp)` (empty object when no pet). This alone narrows every downstream reader; the deletions below remove the dead layers anyway.
- DELETE: awardXpForRole :609-622, showProc :624-642, rollProc :644-702 (with its stale "reachable from the AWAY replay" comment :649-661 — processOffline only asks the server, legacy.js :2380), wireCombatTickProc :778-786 and its boot call :1044, the three rollProc calls, the `if (G?.activeArtisanRecipe)` branch of wireAddItemForGather (:794-796, it only did dead work), the getEquipmentStats wrapper :1059-1070, the `proc-fade` keyframe :1104. KEEP: `emit('kill')`, `emit('gather')`, the drop index and drop roll (:742-757, honest acquisition), wireBunnyQuest, wireDragonEggHatch, `__parkGrants`.
- getBonus wrapper (:1050-1058): keep its position (the b228 FUSE test :1538 needs power-budget outermost) but add only `companionKeyBonus(key, { id, xp })` for `COMPANION_KEYS` (farmYield via companionPaidBonus). Nothing else.
- renderStable: bonus row = `companionPaidLines(id, xp)`; delete the proc line :971 and its inline style; when the list is empty render one line in the same `.sc-bonuses` span: **"No stat bonus yet"** (Designer default; neutral and true — combat-only pets Wolf Pup, Badger, Scorpion, Tortoise, Whelp, Dragonling and Hawk now show it). Keep the `.sc-lore` line (LORE-1 in b558 asserts it per card). No new colours, no new @media.
- No build-number archaeology in new comments (CR-2/CR-3 count `bNNN` comment lines; delete without tombstones).

### 3.3 `src/legacy.js` (net must be ≤ 0 lines; this is about −60)
Delete :16840-16859 (classic getCompanionBonus), :16861-16876 (b228 tombstone), :16878-16891 (the IIFE), :17102-17109 (companion block in getEquipmentBonusFor; keep the item loop). Fix the two comments :2773-2776 and :6438-6440 to say only the clan seat wraps getArmorSetBonus. Every remaining `getCompanionBonus` reader is `typeof`-guarded (17103 becomes gone; 16615 is the post-boot classic smoke test, still valid since the ESM copy owns the name). Run `node tests/monolith-ratchet.mjs` and `node tests/comment-ratio-ratchet.mjs` after (both must be green; legacy.js is pinned at ratio 0.6985 / bnum 858 and both fall).

### 3.4 Other surfaces
- `src/render/equipment-doll.js` :174-190 → render `window.HearthriseCompanions.paidLines(eq, xp)` (guard for absence); delete LBL/PCT maps and the `.td-comp-proc` line.
- `src/features/character-page.js` :114-122 → delete the companion block.
- `src/features/pet-session.js` → delete recordProc, the proc accumulator fields (:32-39 except xp), rows :165-171 except "Bonus XP granted", the "Doubled by" note :175-182, the `recordProc` publish :300; keep recordXp/get/_reset/injectChip/openModal; reword :188 to describe XP only. Grep the file for every deleted field before finishing.
- `src/features/power-budget.js` :77-81 → comment: crit/damage are read by core combat via `bonus()` and are not governed; rareDrop/hpRegen/storage/dropRate/monsterRespawn are ghosts.
- `src/net/gold-sites.js` → delete the three rows and rewrite the two prose mentions. `node tests/gold-site-census.mjs` and `--selftest` green.
- `tests/inventory-mint-census.mjs` → remove companions.js from FILES (:84) and BASELINE (:165-172); grep the file for any other `companions` mention (BLOB_RETIRE_UNSAFE_LANES). Confirm with `node tests/inventory-mint-census.mjs --update` (prints the observed set; it must show no companions.js tokens), then the plain run and `--selftest`.
- `src/data/item-authority.js` :41-50 → rewrite the comment: procs no longer exist on the client; nothing mints. `src/features/smoke/monsters-inventory-and-brand.js` :3003 → reason string "crop product (CROPS.carrot.prod)". `docs/planning/PRIORITY_BOARD.md` :284 → replace the "companion non-gold procs … mint INVENTORY ungated" residual with "companion procs deleted from the client (b<next>); engine-paid procs are LANE C". `tests/companion-xp.mjs` comments :8, :29, :118-130 → name `companionActionXp` as the definition (awardXpForRole is gone). `tests/lore-notes.mjs` :94 → read the label map from `src/render/companion-lines.js`.

## 4. TESTS (RED on the base, GREEN after; both in the fix commit)

### 4.1 In-page regression `COMP-PAYS-1` in `src/features/smoke/companions-claims-and-renown.js` (default-export array; add after the LORE tests)
Name: `COMP-PAYS-1: a companion does on the client exactly what the engine pays — no proc, no combat stat, no error, no promise`.
Setup (all restored in `finally`): `snapshotG()`; `window.HearthriseCompanions.__parkGrants(true)`; stub `window.HearthriseGoalClaim = Object.assign({}, saved, { isSignedIn: () => false })` so `hrKillCreditReady` (legacy.js :4537-4543) returns null and no `hr_credit_kills` can be queued (§2: never fabricate player state; the in-game Ctrl+Shift+T run is signed in); `E._force({ daily: E.QUIET, weekly: E.QUIET })`, `G.buffs = []` (the b228 pattern :1724-1726 — the getBonus delta equals the companion term only away from the clamp); deep-copy every `COMPANIONS[id].proc` and set `chance = 1`; `G._killCreditPending = {}` restored after.
Drive, for EVERY id with a proc, twice — pet ON (`G.companions = {ownedIds:[id], xp:{[id]:0}, equipped:id}`) and pet OFF (`equipped:null`) — with `C.reseed(0xC0A11)` before each drive, `G.activeMonster='goblin'`, `G.monsterHp=G.monsterMaxHp=999999`, `G.playerHp=G.playerMaxHp=999999`, and a `window.notify` spy:
- kill/combatHit: `try { window.combatTick() } catch (e) { threw++ }` then `window.killMonster(window.MONSTERS.goblin)`;
- gather: `G.activeMonster=null; G.activeArtisanRecipe=null; G.activeSkill='mining'; window.addItem('copper_ore', 1)`;
- cook: `G.activeSkill=null; G.activeArtisanRecipe='wheat_bread'; window.addItem('wheat_bread', 1)`;
- harvest: no live trigger exists; assert that and move on.
Assert ON === OFF for: notify calls carrying `def.proc.label` (must be 0 on both), `threw` and `errorLog.length` delta (harness export :25; 0 on both), `G.skillProgress`, `G._companionRareNext` (undefined), `G.gold` delta, `JSON.stringify(G.inventory)` delta, `G.monsterHp`, and `C.rng.next()` after the drive (the stream position: the client draws NOTHING for a proc). `HearthrisePetSession.get()` has no `procs` key.
Stats, for `['fox','wolf_pup','badger','whelp','scorpion','tortoise','dragonling']`: `getEquipmentStats()` ON vs OFF equal on every key; `getPlayerCombatRolls(MONSTERS.goblin)` `.critChance` and `.maxHit` equal; `getMonsterCombatRolls(MONSTERS.goblin).accuracy` equal; `getBonus('crit')` delta 0.
getBonus, for EVERY id and EVERY key of `def.bonus` (not only COMPANION_KEYS): at xp 0 the delta equals `def.bonus[k]` when `k` is in `COMPANION_KEYS` and 0 otherwise; at `xp = companionXpToReach(30)` the delta equals `def.bonus[k] * 2.45` for the percent keys, and `farmYield` stays exactly `1` (the flat SQL row). Pin the literals, not the helper.
Render: `window.renderStable()` → no card contains a proc label or the text `% on`; each owned card's `.sc-bonuses` text equals the joined `paidLines`; a card with none shows "No stat bonus yet". Rebuild the doll's companion pane through its existing entry (`window.renderInvFancy()`; the pane is `.td-companion-info`) → no `.td-comp-proc`; every `.td-comp-bonus` label is a paid label. `PS.openModal()` text contains none of "Procs fired", "Extra drops", "Gold contributed", "Doubled by"; close it.
On the base this is RED on at least: fireDot throws (errorLog grows, `threw` 1) for whelp/dragonling; `skillProgress` 1 vs 0 for the four `instant` pets; toasts for wolf_pup/hawk/instant pets; `critChance` delta 0.06 (whelp) / 0.10 (scorpion); monster accuracy delta for tortoise; rng position differs by one draw; the proc lines render.

### 4.2 Rewrites (same commit)
- b342 (quests-chronicle-and-bonus.js :1791-1940): DELETE; "exactly once" is superseded by COMP-PAYS-1's "exactly zero" (say so in the commit message). Keep :1942-1990 (acquisition once).
- b420 (property-and-unlocks.js :2342-2377): DELETE; the arm-gate it protected no longer exists and COMP-PAYS-1 pins gold delta ON === OFF.
- b345 (cooking-core-and-save.js :4514-4693): keep LAYER 1 and 3 and SITES 2/3; replace the SITE 1 LAYER 2 block (:4658-4685) with a positive assertion: reseed, one kill with a proc pet equipped, read `C.rng.next()`; reseed, the same kill with no pet, read again; the two must be equal (no client proc draw). Update the header prose (:4482-4483) that names rollProc.
- b269 (away-time-and-offline.js :1771-1810): drop the two `recordProc` calls and their asserts; keep recordXp/chip/modal; add the "no proc rows" text assertion.

### 4.3 AWAY node guard `tests/companion-pays-parity.mjs` (+ `--selftest`)
Model on `tests/companion-xp.mjs` (:36-60 BASE fixture, `computeAccrual` from `supabase/functions/hr-accrue/accrual.js`). Run the 12h goblin combat fixture and the gather fixture with `perks.companion = { id, xp: 0 }` and again at `xp = companionXpToReach(30)` for each of `wolf_pup badger scorpion tortoise whelp dragonling hawk`, against `companion: null`: the resulting ops/state must be byte-identical except the `stat companion_xp:<id>` op (the engine pays no combat stat, no proc, no rareDrop). For `fox raccoon sparrow lichling`: `kills` identical to null (no combat effect); the passive difference is left to `tests/perk-channel.mjs`. `--selftest` proves the identity assertion can go red by giving the companion arm a strictly better weapon than the null arm (the fixture picker's next-best item) and requiring a failure. Register both lines in `.github/workflows/smoke.yml` under the `client-guards` job next to `node tests/lore-notes.mjs` (:2560-2561), then `node tests/ci-shape.mjs --write` and commit the regenerated `tests/ci-shape.baseline.json` (its own tool, never hand-edited); `node tests/guard-hygiene.mjs` must be green.

### 4.4 Standing node guard `tests/companion-promise-parity.mjs` (+ `--selftest`)
Imports `src/render/companion-lines.js` directly. For every COMPANIONS id at xp 0 and xp(30): `paidLines` keys ⊆ `COMPANION_KEYS`; percent values equal `companionKeyBonus`; `farmYield` equals the `companion:<id>` row parsed from `supabase/migrations/2026-08-22-farm-catalogues.generated.sql`; no line text contains any `def.proc.label`. Static: `src/features/companions.js`, `src/render/equipment-doll.js`, `src/features/pet-session.js` contain no `.proc` read; `window.getEquipmentStats = function` appears nowhere in `src/**` except legacy.js's own definition (:2800). `--selftest` plants, in memory: (c1) `'strB'` added to the rendered set; (c2) a `def.proc.label` read re-added to companions.js; (c3) a getEquipmentStats wrapper re-added to legacy.js — each must be caught by its named assertion. Register the same way as 4.3.

### 4.5 Mutation proof (run each, record RED, revert; write the results in the commit message)
(a) re-add `if (G.activeSkill) G.skillProgress = 1;` in the addItem wrapper → COMP-PAYS-1 RED (skillProgress). (b) restore the legacy.js getEquipmentStats IIFE → COMP-PAYS-1 RED on `critChance` (whelp +0.03) — do not measure strB, the engine never reads it. (c) restore `v += cb.crit` in the getBonus wrapper → RED on `getBonus('crit')`. (d) re-add the Stable proc line → COMP-PAYS-1 RED and companion-promise-parity RED. (e) `--selftest` of both node guards green.

## 5. GATES (real exit codes; `( cmd || echo RED )` returns 0 — branch on `$?`)
1. `node tools/pack-edge.mjs hr-accrue --hash` equals the base hash recorded in §0 (no edge redeploy needed; if it moved you edited the payload graph — revert).
2. `node tests/companion-pays-parity.mjs && node tests/companion-pays-parity.mjs --selftest && node tests/companion-promise-parity.mjs && node tests/companion-promise-parity.mjs --selftest`.
3. `node tests/gold-site-census.mjs && node tests/gold-site-census.mjs --selftest && node tests/inventory-mint-census.mjs && node tests/inventory-mint-census.mjs --selftest && node tests/lore-notes.mjs && node tests/codex-claims.mjs && node tests/perk-channel.mjs && node tests/companion-xp.mjs && node tests/dead-exports.mjs && node tests/window-globals-exist.mjs && node tests/ci-shape.mjs && node tests/guard-hygiene.mjs`.
4. `node tools/lane-done.mjs` — all green (monolith-ratchet, comment-ratio-ratchet CR-1..4, test-file-ratchet, css-literal-ratchet, breakpoint-guard, modal-primitive-census, no-new-prediction, bump-version --check…).
5. In-page suite, TWICE: `HR_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/run-smoke.mjs` on the BASE first (record every red by name: these are the environmental reds — tests that call live Supabase or wait for Google Fonts), then on the branch. The set difference must be exactly: COMP-PAYS-1 green, b342/b420 gone, b345/b269 rewritten green, no new red. Name the environmental reds in the report; never call them flakes. Run it alone on a quiet machine.
6. Visual proof (rendered surfaces changed): `node tests/visual-qa.mjs` with `window.__HR_TEST_HARNESS__=true`; it writes PNGs + findings.json to `docs/reports/visual-qa/`. Copy ONLY the PNGs for Stable, the inventory/character doll (Companion pane), the Fight rail (totals line), and the pet chip modal, at 1280x800 and 922x423, to branch `qa/companion-procs-authority` and push it; never commit findings.json, never commit PNGs to the lane branch. State that fonts rendered in the OS fallback (Google Fonts is unreachable there).

Constraints that bite: legacy.js net ≤ 0 lines (it is −60 here); new code only in `src/render/*` / `src/features/*`; no new `@media` spelling; colours only as theme tokens (the deleted toast had hardcoded ones — good); no `bNNN` in new comments (CR-2/CR-3); keep `companionXpToReach`/`companionLevelFromXp` in companions.js untouched (tests/perk-channel.mjs pins them); keep every `emit()`; keep `__parkGrants`; keep the `.sc-lore` line.

## 6. LANE C — explicitly NOT this lane (Security GO before the Coordinator applies; Designer rulings first)
C1 (Security-owned, must land FIRST): `hr_companion_grant` (`2026-09-06-companion-grant-hardening.sql` :352-521) still grants on allowlist membership alone (:394-401); its own §4(a) self-check grants badger on `'boss:i_said_so'` (:688-706). Verify acquisition against server evidence (bestiary `kill_monster:<id>` counts for drop:/boss:, server skill XP/action counters for skill:, the hr_farm_harvest count for quest:harvest100) and move the drop rolls (companions.js :742-757, pets.js :98-137) into `resolveKill`. Blast radius today: server-paid allXP/gatherSpeed/cookSpeed/farmYield pets by one console call, journalled and bounded.
C2: engine-paid combat stats: `COMPANION_EQUIP_KEYS` + `companionEquipStats(companion)` in core, folded into the four server `equipmentStats` sites (accrual.js :917, :1546, :3488, :3837) and the client's `getEquipmentStats` from the same function. Only critB/defB have engine readers (combat.js :520, :533); paying STR/ATK needs a Designer change to the damage formula (:462-468 reads item rows only), and THEN the kill-time.js ceilings (:25-45) and the vendored SQL constants (`2026-08-30-bounty-kill-credit.sql` :141, `2026-08-31-combat-xp-credit.sql` :33-40) are re-derived for max L30 companion stats. C1 before C2, or a console grant becomes server-paid combat power (the migration says so itself, `2026-08-22-companion-grant.sql` :44-49).
C3: engine-paid procs from a server catalogue `src/core/companion-procs.js`, drawn inside the one engine (resolveKill for kill, simulateTick for combatHit writing `state.monsterHp`, skill-sim for gather, artisan for cook, hr_farm_harvest SQL for harvest); attended top-up prices them from the same function; each payout under its own ledger reason; caps re-derived with proc EV; AWAY-1 fixtures re-pinned deliberately; edge redeploy; `live-hash-drift --live --write` by the Coordinator; the client renders only the envelope's receipt. `guaranteed_rare` reuses the `src/data/item-effects.js` :163 live:false hatch (server daily ledger). Never "fix" fireDot by writing `G.monsterHp` on the client: hr_credit_kills would pay for it.
C4: farmYield: scale the `hr_farm_yield_perk` companion row by level in `hr_farm_harvest`, or drop the scale in core for farmYield — Designer + Security.
Comments to correct in the payload graph when C2 lands (not now): accrual.js :777-779, `src/core/perks.js` :437-440.

## 7. Designer defaults (ship with these unless the Coordinator overrides)
- Pets with no paid line show "No stat bonus yet". Lore lines stay.
- The attended nerf is real for Whelp/Scorpion (crit) and Tortoise/Badger (def): the client now fights at server truth; it goes in the CHANGELOG as such. Suggested player-facing lines for the Coordinator's entry: **"Companions now show only what they really do."** Every pet's card lists the bonus the realm actually pays at its current level, and the proc lines ("Double drop!", "Fire breath!", "Instant!") are gone: none of them was ever paid, and the dragon's fire breath was throwing an error every few swings instead. **"Combat pets no longer double up on screen."** Crit and defence from a companion were being counted twice or three times in the fight preview and once in the realm's ledger; the screen now matches the ledger. Fewer attended kills for Whelp and Scorpion holders is the number that was always being paid.

## 8. Commit and report
Commits: fix + tests in ONE commit (message ≤ 8 lines: what, the mutation results (a)-(e) with RED/GREEN words gated on exit codes, the superseded tests, the Co-Authored-By line); baseline regenerations (`ci-shape --write`) may be their own commit. Push the lane branch early; push `qa/companion-procs-authority` separately.
Report (one table + ≤ 3 sentences): rows = payload hash equal / COMP-PAYS-1 (RED on base → GREEN) / node guards + selftests / lane-done / in-page suite base vs branch (environmental reds named) / visual proof branch + which PNGs / stale-premise edits / Designer + Security items open. State **"pushed, unplayed"**. List the LANE C items verbatim from §6 for the Coordinator to dispatch. If §0 failed, the report is that failure and nothing else.