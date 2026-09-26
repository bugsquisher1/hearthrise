# Content pack 6: Field Salvage: tier armour drops from hunting spots T1-T6

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
From the first fight onward, 48 hunting spots can drop a real armour piece for your tier. Odds run from 1 in 250 at a Wild Boar to 1 in 714 at a Revenant. A kill becomes a small lottery with a prize you can wear or sell, which fills the gap between common materials and batch 1's Lucky Finds (4-30 h).

## THE CORRECTED LANE BRIEF (execute this)
LANE lane-c/field-salvage · class C (engine half + client half, NO migration, NO DB apply) · branch from set/b555 @ 0b776c7a or later. That base already contains Lucky Finds (09a76e82), Ledger of Firsts and every b554 lane. Before dispatch, the game-designer rules on item 6(a) below. Security verdict: GO-WITH-CHANGES. This list IS the change list. Security re-reviews the final diff before the edge deploy.

1) DATA: src/data/monsters.js
Append {id, ch, salvage:true} as the LAST element of each drops array. Never reorder existing rows. Never on a monster that carries a lucky row. Document `salvage` under "HOW A ROW WORKS" in the header: the engine reads only id/ch, and the flag tells the client that only the server reveals the row. 46 rows:
T1: wild_boar leather_belt .004 · cutpurse apprentice_gloves .004 · imp apprentice_boots .004 · fire_elemental apprentice_belt .004 · scarecrow bronze_gauntlets .003 · hive_wasp leather_helmet .002
T2: stag studded_boots .004 · salamander studded_gloves .004 · locust_swarm studded_belt .004 · skeleton iron_belt .004 · ooze iron_boots .0036 · stone_golem iron_gauntlets .004 · nightmare adept_boots .004 · air_elemental adept_gloves .004 · water_elemental adept_belt .004 · shrieker studded_helmet .0038
T3: dire_wolf boarhide_boots .0035 · lynx boarhide_gloves .0035 · mountain_ram boarhide_belt .0035 · wyrmling boarhide_helmet .0033 · bog_vine steel_gauntlets .0033 (replaces goblin_brute) · clay_golem steel_boots .0028 · rock_troll steel_belt .0034 · warlock scholar_gloves .0035 · ghoul scholar_boots .0035 · earth_elemental scholar_belt .0035
T4: wyvern snakeskin_boots .003 · cave_wyrm snakeskin_gloves .003 · winter_wolf snakeskin_belt .003 · barrow_knight mithril_gauntlets .0028 · minotaur mithril_boots .0028 · ogre mithril_belt .0026 · adept warlock_gloves .003 · conjurer warlock_boots .003 · wraith warlock_belt .003
T5: mammoth wyvernhide_boots .0025 · giant_boar wyvernhide_belt .0025 · frost_giant wyvernhide_gloves .0025 · bandit_lord rune_gauntlets .0024 (replaces death_knight) · cyclops rune_boots .002 · gargoyle rune_belt .0018 · archmage sorcerer_gloves .0025 · astrologer sorcerer_boots .0025 · starhusk sorcerer_belt .0025
T6: revenant ember_gauntlets .0016 (instead of ember_boots .0014, which measured 9.92 h against the 10 h ceiling) · void_parasite archmage_boots .0017
DROPPED rows, because existing gear on these monsters already pays over 5% of the gp midpoint: goblin_brute (steel_sword 26.7%), death_knight (captains_ribblade 11.2%), ancient_bear (alpha_cloak 4.0% + 3.4%), war_king (chief_blade 2.8% + 4.0%). The designer may substitute any row, but every substitute must pass the guard.

2) GUARD: NEW tests/field-salvage.mjs, plus --selftest with a CLEAN control arm (guard-hygiene R3). Register it in .github/workflows/smoke.yml, economy-selftests job, beside the "Lucky finds" step (~L2063). Regenerate tests/ci-shape.baseline.json with its own tool. For every row with salvage:true, assert:
(a) The item is in GEAR_ITEMS (src/data/gear-tiers.js), type armor, slot in {helmet, boots, gloves, belt}, item.tier === monster.tier, not bop, not hearthfind, not tier 8, rarity !== 'unique', effectsAreLive, pathFor has art. It is not a lucky item, not in QM_STOCK, DUNGEONS loot, a shops.js grant or bosses/raid-bosses loot, and not a drop of any other row or monster.
(b) The monster has no lucky row, is not in FIXTURE_EXCLUDED (goblin, slime, rat, dark_wizard, wolf, the_silence, weak_skeleton), is not boss:true, and is not a HEARTHFIND_TABLE source.
(c) ch <= the tier rate (T1 .004, T2 .004, T3 .0035, T4 .003, T5 .0025, T6 .002), and ch x (dropBonus||1) x vendorPriceOf(ITEMS,id) <= 0.04 x gp midpoint. Import vendorPriceOf from supabase/functions/hr-accrue/catalogue.js; never retype it.
(c2) The monster's TOTAL across every weapon/armor/jewelry row (salvage, lucky and existing) is <= 0.05 x gp midpoint.
(d) Expected hours are measured via simulateSpan at the lucky-finds LOADOUT (seed 20260926, Controlled style, fed). Base hours must be in [0.5, 10]. Hours at the multiplier ceiling must be >= 0.25, where ceiling = dropBonus x MAX_MEMORY_DROP_MULT x (1 + max drop_rate buff / 100) x the BotD WEEKLY/DAILY dropMult when the monster is in that pool. Print hours with Vigour dry (divided by VIGOUR_DRY_MULT) as a report line only.
(e) The salvage row is LAST, there is at most one salvage row per monster, salvage item ids are unique, and a row is never both salvage and lucky.
(f) pickProofItem(mid) is unchanged against the same table with the salvage rows stripped.
--selftest: each of these mutations must fail the guard: ch x10; a row on goblin; a row on elk_king (boss); a row on small_wolf (lucky monster); item -> wolfbone_torc (lucky item); item -> bronze_platebody (wrong slot); iron_belt on wild_boar (tier); steel_gauntlets back on goblin_brute (c2); the row moved to the front of its array; the salvage flag removed.
BOTH PATHS, in the same file: AWAY, deterministically search for a seed where the wild_boar row fires inside an away:true computeAccrual span. Assert leather_belt is credited via fx.addItem, appears as ev:loot:leather_belt, and appears as {type:'rare_drop', item:'leather_belt'}. ATTENDED: the same seed on the live tick (away:false) credits the same item.

3) GUARD FIX: tests/collection-renown-claim-drift.mjs
The selftest arms at :308 ('collect125 = 141') and :320 ('9 lucky ids flagged bop') hard-code the 133-id pool. With these rows they are MISSED and the selftest exits 1. Derive both from the live pool of distinct drop ids that are not bind-on-pickup: unreachable threshold = pool+1, and flag pool-125+1 ids as BoP. Prove both arms are caught with and without the salvage rows. Do not loosen anything else.

4) CLIENT HALF: the server announces, the client never does (CLAUDE.md §6; the no-new-prediction ruling)
In src/features/lucky-finds.js, generalise the index to "server-revealed rows" (d.lucky || d.salvage):
(i) Silence the client's dice for salvage rows exactly as for lucky rows. On both the live tick and the local away replay: no bag credit (fx.addItem), no __hrCombatCredits, no G.collection, no drop log (recordKill), no combat-log line, no toast, and take back stats.rareDrops. Keep the RNG draw so AWAY-1 parity holds.
(ii) Reveal: when a settle's away.events holds {type:'rare_drop', item} for a salvage item, push '<span class="rare">RARE: <name></span>' and notify('Rare find: <name>! (base odds <formatDropOdds(base)>)', 'levelup'), once per item per envelope version. VERY RARE stays lucky-only.
The net change to src/legacy.js must be <= 0 lines (MONO-1). Do not change src/core.

5) IN-PAGE TESTS: src/features/smoke/monsters-inventory-and-brand.js, appended after LUCKY-4
SALVAGE-1: the wild_boar monster panel lists Leather Belt at '0.4%' (formatDropOdds(.004); the formatter's '1 in N' form only applies below .001). An envelope naming leather_belt:1 with a rare_drop event puts it in the bag and writes 'RARE: Leather Belt' once, with one toast. Replaying the envelope adds nothing.
SALVAGE-2: a client-dice roll of the wild_boar salvage row, attended AND away, leaves the bag, rail, G.collection, drop log, combat log and stats.rareDrops untouched, with no toast. It must be RED with the hook removed.
REGRESSION: the goblin drop-panel snapshot is byte-identical, and LUCKY-1..4 stay green.

6) DOCS AND RULINGS
(a) The designer rules in .claude/coordination/DECISIONS.md BEFORE dispatch. The pool of distinct drops that are not bind-on-pickup grows 133 -> 181: up to T3 68 -> 94 (collect75 at T3), up to T4 92 -> 127 (collect100, 15,000g + 15 gems, at T4), up to T5 113 -> 157 (collect125, 30,000g, needs no Lucky Find, against pack-3's 'Lucky Finds long chase'), and renown rises by up to +144. Accept it, or raise collect125 in a separate lane-C hr_claim_milestone migration with its own Security GO.
(b) Record the 4 dropped rows, the 2 re-homes and the revenant swap.
(c) Record the reveal wording (RARE, not VERY RARE).
docs/SYSTEMS_MAP.md §5: add salvage rows to the "server faucet, server-revealed" paragraph.

7) GATES: every "green" is an exit code you saw
- node tests/field-salvage.mjs, and --selftest
- lucky-finds (+ --selftest), collection-renown-claim-drift (+ --selftest)
- accrual-engine, attended-loot-credit (its content-derived picker draws archmage), settle-carry-loss, hearthfind-roll, hearthfind-boss-rate, dungeon-key-drops, inventory-mint-census, perk-channel, away-receipt-journal, recipe-yield-guard, artisan-progress-model
- world-tick-combat-parity (its fixtures fight no salvage monster: do not edit it unless it goes red), world-tick-parity, bestiary-trophy, bounty-drift, conservation-fuzz, party-split, party-settle
- no-new-prediction, monolith-ratchet
- catalogue-literal-drift and restore-census: must be zero-diff
- node tools/pack-edge.mjs hr-accrue --hash: report the new hash
- node tools/lane-done.mjs, green
Fixture sweep: if a seeded fixture pins a stream on a salvage monster, move that row to a sibling monster that passes the guard. Never edit the fixture. Never touch tests/live-hash-drift.baseline.json. Merge the set/b555 tip into the branch yourself and re-run the gates before reporting.

8) DEPLOY ORDER
Security re-reviews the diff -> the Coordinator deploys the hr-accrue edge function and verifies the live payload_sha256 == pack-edge --hash (the world tick rides the same function) -> the client half rides the next 20:00 UTC cut. Visual gate: combat, inventory and the monster panel, desktop and 922x423. No DB apply. Estimate about 3.5 h, not 2.

## THE DESIGNER SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
48 appended drop rows {id, ch} on existing monsters and existing items. There are no new items, no SQL and no plain `lucky` flag. Every row is the LAST entry in its array.

Rate rule: ch = min(tier rate, 4% x gp midpoint / (vendorPriceOf x dropBonus)), floored to 4 decimal places. Tier rates are T1 .004, T2 .004, T3 .0035, T4 .003, T5 .0025, T6 .002.

Items are generated small-slot pieces (helm, boots, gloves, belt) whose tier equals the monster's tier. Plate goes to armoured monsters, leather to beasts and dragons, cloth to casters. Monsters excluded: all 26 Lucky Find monsters, the fixture set (goblin, slime, rat, dark_wizard, wolf, the_silence, weak_skeleton), bosses and Hearthfind sources. Lucky Find items are also excluded.

T1:
- wild_boar -> leather_belt .004
- cutpurse -> apprentice_gloves .004
- imp -> apprentice_boots .004
- fire_elemental -> apprentice_belt .004
- scarecrow -> bronze_gauntlets .003
- hive_wasp -> leather_helmet .002

T2:
- stag -> studded_boots .004
- salamander -> studded_gloves .004
- locust_swarm -> studded_belt .004
- skeleton -> iron_belt .004
- ooze -> iron_boots .0036
- stone_golem -> iron_gauntlets .004
- nightmare -> adept_boots .004
- air_elemental -> adept_gloves .004
- water_elemental -> adept_belt .004
- shrieker -> studded_helmet .0038

T3:
- dire_wolf -> boarhide_boots .0035
- lynx -> boarhide_gloves .0035
- mountain_ram -> boarhide_belt .0035
- wyrmling -> boarhide_helmet .0033
- goblin_brute -> steel_gauntlets .0034
- clay_golem -> steel_boots .0028
- rock_troll -> steel_belt .0034
- warlock -> scholar_gloves .0035
- ghoul -> scholar_boots .0035
- earth_elemental -> scholar_belt .0035

T4:
- wyvern -> snakeskin_boots .003
- cave_wyrm -> snakeskin_gloves .003
- winter_wolf -> snakeskin_belt .003
- barrow_knight -> mithril_gauntlets .0028
- minotaur -> mithril_boots .0028
- ogre -> mithril_belt .0026
- adept -> warlock_gloves .003
- conjurer -> warlock_boots .003
- wraith -> warlock_belt .003

T5:
- mammoth -> wyvernhide_boots .0025
- giant_boar -> wyvernhide_belt .0025
- frost_giant -> wyvernhide_gloves .0025
- death_knight -> rune_gauntlets .0024
- cyclops -> rune_boots .002
- gargoyle -> rune_belt .0018
- archmage -> sorcerer_gloves .0025
- astrologer -> sorcerer_boots .0025
- starhusk -> sorcerer_belt .0025

T6:
- ancient_bear -> dragonhide_gloves .002
- war_king -> ember_gauntlets .0017
- revenant -> ember_boots .0014
- void_parasite -> archmage_boots .0017

Measured (node, read-only): every row's faucet share is 1.9-4.0% of the monster's gp midpoint. At rough kill rates (T1 400/h down to T6 80/h) the time to one piece is about 0.6 h at T1, 1 h at T2, 1.6 h at T3, 2.7 h at T4, 4-5.6 h at T5 and 6.3-8.9 h at T6. All 48 items have art and none has another monster source.

Balanced against the existing gear drops and against Lucky Finds:
- Existing gear drops: goblin bronze_sword .03, hobgoblin iron_sword .012, goblin_warlord steel_helm .015, watchknight steel_helm .02, warband_captain rune_sword .006, war_king chief_blade .012. Salvage is rarer than these b215 weapon drops.
- Lucky Finds: .0004-.001 with a 5% gp cap. Salvage is 3-10x more common and capped tighter at 4%. Salvage and Lucky rows sit on disjoint monsters, so no monster pays more than 5% of its gp in gear.
### files
- src/data/monsters.js: 48 appended rows plus a FIELD SALVAGE header block.
- tests/field-salvage.mjs: new standing guard with --selftest.
- .github/workflows/smoke.yml: register the guard.
- tests/ci-shape.baseline.json: regenerate with its own tool.
- src/features/smoke/monsters-inventory-and-brand.js: SALVAGE-1, appended at the end of the module.
- tests/world-tick-combat-parity.mjs: only if its C6 starvation arm counts rows, as happened for Lucky Finds.
- docs/SYSTEMS_MAP.md §5: the rows table.
- Edge redeploy, because monsters.js is bundled.
### tests
Guard tests/field-salvage.mjs (mutation-proven with --selftest) checks:
- (a) The item is a generated tier gear piece in helm, boots, gloves or belt, its tier equals the monster's tier, it is tradeable, has art (pathFor), and is not lucky, Hearthfind, unique or tier 8.
- (b) The monster is not lucky, a fixture, a boss or a Hearthfind source.
- (c) ch x dropBonus x vendorPriceOf <= 4% of the gp midpoint.
- (d) Hours per piece, measured with the one engine at the lucky-finds LOADOUT, fall in [0.5, 10] h at base and stay >= 0.25 h at the multiplier ceiling.
- (e) The row is last in its array.
- (f) pickProofItem is unchanged for every monster.
- Both paths: a forced-roll kill credits the piece through fx.addItem on the attended live tick (away:false) AND through computeAccrual away, on the same seed.

tests/lucky-finds.mjs must stay green. Its no-other-source rule proves the two packs do not overlap.

In-page SALVAGE-1 (happy path):
- The monster panel for wild_boar lists 'Leather Belt 1 in 250' through formatDropOdds.
- A kill settled through the envelope puts leather_belt in the inventory, and the client never mints it.

Regression: a drop-panel snapshot for an untouched monster (goblin) is byte-identical.

Fixture sweep: run the full node test set. If any fixture pins a seeded stream on a salvage monster (companion sources ancient_bear and bear matter most), move that row to a sibling monster rather than editing the fixture.
### depends on
Lucky Finds (sec/lucky-finds) must be merged into set/b555 first. Both packs edit src/data/monsters.js and this pack relies on the lucky-row-last and no-other-source rules. Branch from set/b555 after that merge. Security GO comes before the edge deploy, and there is no DB apply.
### reviewer problems fixed by the brief
- P1 HIGH, CONFIRMED by code path. The client's own dice would show the new drops. Every salvage row is rare-band: dropBand(.004) returns 'rare' (src/core/drops.js:12). The attended tick still rolls with the client's Math.random (src/legacy.js:6478 simulateTick). The roll reaches the bag through COMBAT_FX.addItem (legacy.js:6202), raises the RARE toast and log line (legacy.js:6351) and bumps stats.rareDrops (src/core/combat-sim.js:189). The bag fold is still MERGE (src/data/item-authority.js:255 INVENTORY_ARM_STAGE='off'; src/net/accrue.js:4872 Math.max), so a phantom piece of gear the player can equip stays in the bag until reload, and the server refuses to equip, sell or list it. This is the §6 'client shows X, server refuses' P1 class (the Goblin Seal root). It would spread to 38 monsters that have no rare-band row today (wild_boar has none). It also creates phantom wk_rare progress and phantom collection entries. Only the player's own screen is affected: server possession checks stop any value crossing to another player. The pack's own SALVAGE-1 claim that 'the client never mints it' is false as written. Fix: tag each row salvage:true and extend the silence-and-reveal in src/features/lucky-finds.js to these rows. Add SALVAGE-2, which must fail without the hook.
- P2 HIGH, CONFIRMED by execution. I injected the 48 rows in memory into a scratch copy of the guard. `node tests/collection-renown-claim-drift.mjs --selftest` then exits 1 with 2 mutations MISSED: ':308 collect125 = 141' and ':320 9 lucky ids flagged bop'. Both arms hard-code the 133-id pool. The control run (no rows) exits 0 with 10/10 caught, and the plain guard stays green. The guard is registered in CI (smoke.yml:1096) and the pack does not list this file. Fix: derive both arms from the live pool size (threshold = pool+1; flag pool-125+1 ids as BoP), with a mutation proof that they catch with and without salvage.
- P3 MEDIUM, CONFIRMED by count. The collection faucet moves forward by about a tier. The pool of distinct drop ids that are not bind-on-pickup grows from 133 to 181. Up to T3 it goes 68 to 94, so collect75 (10,000g) becomes reachable at T3. Up to T4 it goes 92 to 127, so collect100 (15,000g + 15 gems) becomes reachable at T4. Up to T5 it goes 113 to 157, so collect125 (30,000g) no longer needs a single Lucky Find. Pack-3 designed collect125 explicitly as 'the Lucky Finds long chase' (lane-briefs-b555 pack-3.md:140). Renown rises by up to +144 (3 per entry). Each claim is one-time per character and journalled. The designer must rule in DECISIONS.md before dispatch: accept, or raise collect125 via a separate lane-C hr_claim_milestone migration with its own Security GO.
- P4 MEDIUM, CONFIRMED. The pack says no monster pays more than 5% of its gold midpoint in gear. That is false for 4 rows once existing gear drops are counted (ch x dropBonus x vendorPriceOf / gp midpoint): goblin_brute already pays 26.7% from steel_sword .01 (30.7% with salvage), death_knight 11.2% from captains_ribblade (15.1%), ancient_bear 4.0% from alpha_cloak (7.4%), war_king 2.8% from chief_blade (6.8%). Fix: add a per-monster total gear cap of 5% as a guard rule and drop those 4 rows. Re-home steel_gauntlets to bog_vine (.0033, 3.92%) and rune_gauntlets to bandit_lord (.0024, 3.90%). T6 keeps 2 rows because no eligible unused T6 monster exists.
- P5 LOW, CONFIRMED. The in-page assertion 'Leather Belt 1 in 250' is wrong: formatDropOdds(.004) returns '0.4%' because ODDS_ONE_IN_BELOW = .001 (drops.js:22-31). Assert '0.4%'. Raising the threshold would be a src/core change that moves the edge payload and LUCKY-4.
- P6 LOW, CONFIRMED with the engine (simulateSpan, lucky LOADOUT, seed 20260926). wild_boar kills 245 per hour, not 400, so a piece takes 1.02 h, not 0.6 h. revenant -> ember_boots .0014 measures 9.92 h against the 10 h band ceiling, and its ch already sits at the 4% cap, so any stream change flips rule (d) red. Fix: revenant -> ember_gauntlets .0016 (freed by dropping war_king; 3.81%, about 8.7 h). Hours with Vigour dry reach 39.7 h; report them, do not gate on them.
- CLASS: B is wrong, it is C. There is no server-side drop allowlist: hr_apply credits any hr_items id with only a per-call clamp (2026-09-14-hr-apply-restatement.sql ~L926-960). The hr-accrue bundle (tick-combat.js:74, accrual.js) therefore IS the drop catalogue, a faucet into tradeable inventories. SYSTEMS_MAP §5 already requires lane-C order: Security GO, then edge deploy, then client. Pack 1 (the same row kind) was class C.
- Things not owed or not affected, all verified. catalogue-literal-drift: no items or activities change, and catalogue-rows has no drops. restore-census: no new table. Art: pathFor is fine for all 48 items and none is on the rejected-art list. pickProofItem is unchanged for all 48. None of the rows sits on a Lucky, fixture, boss or Hearthfind-source monster, and no item has another source. world-tick-combat-parity C6: its fixtures fight goblin, goblin_warlord, lesser_demon, rat and small_wolf, none of them salvage monsters, so leave that file alone unless it goes red. wk_rare: goblin already has .06 of rare-band rows, so its weekly 4-gem faucet barely moves. The world tick uses the same edge bundle (pg_cron -> hr-accrue), so one deploy covers both.
- Conflicts with set/b554: none. Every b554 lane (vigour-bar, vigour-integrated, vigour-price-by-level, party-view-readonly/volatile, phone-tap-targets, m8-party-panel, party-split) and Lucky Finds (09a76e82) plus Ledger of Firsts are already ancestors of set/b555 @ 0b776c7a. Vigour scales the drop chance (accrual.js ~L2296): report dry hours only. The party tick has no drop multiplier. Tap targets change CSS only.
- Risks left as they are. The faucet stays bounded by the server kill rate x ch and is journalled through ev:loot and hr_apply. Alt-account muling through the market is no worse than gold. Seed grinding is blocked by the server secret, as already reviewed for Lucky Finds. The existing non-salvage rare rows keep the client-dice phantom class until a separate class-kill or the inventory-absolute arm. World-tick frames carry no away.events, so a tick-settled salvage piece lands in the bag without a reveal line. This was a read-only review: no branch or diff, so lane-done was not run.
