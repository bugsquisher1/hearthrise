# Content pack 1: 1. Lucky Finds: a very-rare named drop on 27 hunting spots, T1 to T6

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
Every hunting spot a player meets in week one now has a named chase item that drops about once every 4 to 23 hours of fighting there. When it lands, the player gets a VERY RARE line in the combat log and a toast that states the odds. Nothing like this exists today: the rarest regular drop is 1 in 200, and Hearthfinds take 100 to 400 hours.

## THE CORRECTED LANE BRIEF (execute this)
LANE lane-c/lucky-finds · class C (engine half, NO migration) · branch from set/b554 @ 9c70fa98 (not main — set/b554 rewrote smoke.yml + ci-shape baseline). Security review: GO-WITH-CHANGES — everything below IS the change list; re-review the final diff before the edge deploy.

1) DATA — src/data/monsters.js. Append {id, ch, lucky:true} as the LAST element of each drops array; never reorder existing rows. Document `lucky` in the file header's "HOW A ROW WORKS". 26 rows:
T1 mandrake bramble_blade .0006 · small_wolf wolfbone_torc .0008 · kobold banded_signet .0006 · witchs_apprentice adept_body .0006 (replaces oak_staff, which the equip shop sells for 650g, shops.js:331)
T2 gnoll willow_longbow .0005 · giant_bat fang_studs .0008 · wight willow_staff .0005 · hobgoblin rat_stick .0005
T3 venom_spider spidersilk_choker .0005 · zombie lazlos_maul .0005 · fire_devil maple_staff .0004 · deserter maple_bow .0004
T4 giant_spider wraithglass_drops .0004 (replaces widows_fang: tier 3 item, drop-gated wave-3 recipe) · mountain_troll trollhide_cape .0006 · goblin_warlord warlords_torc .0006 · void_mote void_censer .0005
T5 panther panthers_eye_pendant .0005 · grave_banshee wraithsilk_shroud .0005 · shadow_creeper shadowsilk_cape .0005 · chained_demon demoncaller_staff .0005 · drake yew_bow .0006
T6 vampire_bride archmage_gloves .001 (replaces rubyfire_studs, tier 5) · storm_elemental runewood_staff .0007 · draconia dragonrib_bow .0008 · elder_cinder emberfang_blade .0008 · broodmother chitinweave_cloak .0007
NO war_king row: crown_of_the_fallen_king is rarity 'unique', forged at Smithing 88 by design. The game-designer may substitute any of the swaps; any substitute must pass the guard below. Exclusions are unchanged: elk_king, grim_reaper, dragon; goblin, slime, rat, dark_wizard, wolf, the_silence, weak_skeleton.

2) GUARD — NEW tests/lucky-finds.mjs, plus --selftest.
Register it in .github/workflows/smoke.yml, economy-selftests job, beside hearthfind-boss-rate (~L2025). Regenerate tests/ci-shape.baseline.json with its own tool.
For every row with lucky:true, assert:
(a) Item: exists, effectsAreLive, type weapon/armor/jewelry, not bop, not hearthfind, not tier 8, rarity !== 'unique'. Not in QM_STOCK, any DUNGEONS loot, any shops.js grant, or bosses/raid-bosses loot. Not a drop of any other row or monster. Has art in item-art.js.
(b) Monster is not a HEARTHFIND_TABLE source and not in the fixture-exclusion list.
(c) ch x (m.dropBonus||1) x vendorPriceOf(ITEMS,id) <= 0.05 x gp midpoint. Import vendorPriceOf from supabase/functions/hr-accrue/catalogue.js; never retype it.
(d) Expected hours via simulateSpan: fixed seed 20260926, Controlled style, fed, loadouts T1 L8 bronze / T2 L20 iron / T3 L33 steel / T4 L48 mithril / T5 L63 rune / T6 L80 ember, dropBonus included.
   - Base hours must be in [4, 30].
   - Hours at the multiplier ceiling must be >= 1.5. Ceiling = dropBonus x MAX_MEMORY_DROP_MULT x (1 + max drop_rate buff magnitude in ITEMS /100) x WEEKLY_BONUS.dropMult or DAILY_BONUS.dropMult when the monster is in WEEKLY_POOL/DAILY_POOL. All constants imported.
   - Print the Vigour-dry hours (÷ VIGOUR_DRY_MULT) as a report line only.
(e) At least 4 lucky rows per tier T1-T6. Lucky item ids unique. The lucky row is the last element of its array.
(f) item.tier ∈ {m.tier, m.tier+1}.
(g) pickProofItem(mid) is unchanged against the same table with lucky rows stripped.
--selftest: each of these mutations must go RED — ch x10; lucky row on elk_king; item -> wartusk_cleaver; item -> emberheart; T1 row -> a v13600 item; item -> oak_staff; item -> crown_of_the_fallen_king; widows_fang on giant_spider; lucky row moved to the front of its array.
BOTH-PATH tests, same file:
- AWAY: deterministically search for a seed where the small_wolf row fires inside a 3 h away:true simulateSpan. Assert wolfbone_torc is credited via fx.addItem, appears in collection ops as ev:loot:wolfbone_torc, and appears in events[] as {type:'rare_drop', item:'wolfbone_torc'}.
- ATTENDED: the same seed on the live path (away:false) credits the same item.

3) CLIENT HALF — the server announces; the client never does (CLAUDE.md §6; Tyler's 2026-09-16 no-new-prediction ruling). The client's live RNG is seeded from Math.random (src/core-bridge.js:112) and can never match the server's roll.
(i) A lucky row rolled by client dice — live tick or local away replay — is never shown or credited: not in the combat log, not a toast, not in G.inventory (COMBAT_FX.addItem legacy.js:6202), not in window.__hrCombatCredits, not in G.collection (the collection-log.js addItem wrapper ~L612). Keep the RNG draw so AWAY-1 parity holds; suppress only the presentation and the client-side credit. The existing 'RARE:' branch stays as it is for every non-lucky row.
(ii) Reveal: when a settle response's away.events (hr-accrue/index.ts:1698) contains {type:'rare_drop', item} and item is a lucky row:
   - push `<span class="rare vrare">VERY RARE: <name></span>` to G.combatLog;
   - call notify(`Very rare find: <name>! (base odds about 1 in <N>)`, 'levelup');
   - do both ONCE per item per response, deduped on the envelope version.
   N = round(1 / effectiveDropChance(row, {dropMult: m.dropBonus||1})); for small_wolf that is 1,087. No events on a settle (world-tick frames) means say nothing.
(iii) Put (i) and (ii) in a NEW module, src/features/lucky-finds.js, loaded after legacy.js and collection-log.js. src/legacy.js is AT its MONO-1 ceiling of 19,178 lines, so the net legacy.js line delta must be <= 0.
(iv) Add ONE shared odds formatter that renders ch < 0.001 as '1 in N'. Use it in src/features/combat-render.js:363, src/features/boss-of-the-day.js pct() ~L122, and legacy.js lootRowHtml ~L12096 (replace in place). Today .0004 renders '0.0%'. Any CSS must use tokens only; the glint and chime go to the Art Director.

4) IN-PAGE tests — src/features/smoke/monsters-inventory-and-brand.js:
LUCKY-1 a client-dice drop of the small_wolf lucky row leaves the bag, rail, G.collection and log untouched, with no toast.
LUCKY-2 a response whose away.events holds rare_drop wolfbone_torc writes 'VERY RARE: Wolfbone Torc' once, with one toast containing 'about 1 in 1,087'. Replaying the same response adds nothing.
LUCKY-3 an ordinary 5% row still reads 'RARE:', never 'VERY RARE'.
LUCKY-4 the collection-log detail for small_wolf shows Wolfbone Torc at '<1%'. The fight-screen drop table, BotD card and monster panel show '1 in 1,250' (the base row) for it, and maple_staff on fire_devil never shows '0.0%'.

5) DOCS
- docs/SYSTEMS_MAP.md §5: a drop row is a server faucet — Security GO, then the hr-accrue edge deploy, then the client. Lucky rows are announced by the server only.
- Designer rulings, recorded in .claude/coordination/DECISIONS.md:
  (a) the three swaps and the dropped war_king row;
  (b) the collection pool grows 113 -> 140, so collect100 (15,000g + 15 gems) becomes reachable without T6 and the renown ceiling rises by 81 — accept it, or change the threshold (that is a separate lane-C migration);
  (c) the lucky reveal is exempt from 'attended settles narrate nothing'.

6) GATES — every "green" is an exit code you saw.
- node tests/lucky-finds.mjs, and --selftest
- accrual-engine, attended-loot-credit, settle-carry-loss, hearthfind-boss-rate, hearthfind-roll, dungeon-key-drops, inventory-mint-census
- world-tick-combat-parity (its fixtures fight small_wolf and goblin_warlord), world-tick-parity, bestiary-trophy, bounty-drift, conservation-fuzz, party-split, party-settle
- collection-renown-claim-drift, no-new-prediction, monolith-ratchet
- catalogue-literal-drift and restore-census: must be zero-diff
- node tools/pack-edge.mjs hr-accrue --hash: report the new hash (the in-page payload guard stays red until the deploy)
- node tools/lane-done.mjs, green
Never edit tests/live-hash-drift.baseline.json. Merge set/b554 into the branch yourself before reporting.

7) DEPLOY ORDER
Security re-review of the diff -> Coordinator deploys the hr-accrue edge function and verifies live payload_sha256 == pack-edge --hash -> the client half rides the next 20:00 UTC cut (visual gate: combat, inventory, BotD card; desktop and 922x423). No DB apply. Estimate 3-4 h.

## THE DESIGNER'S ORIGINAL SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
WHAT CHANGES: 27 drop rows appended to the END of the named monsters' drops arrays in src/data/monsters.js. Each row is {id, ch, lucky:true}; the engine reads only id and ch. Every item already exists, is live (effectsAreLive), is tradeable and has a crafting source. Every one is also a first-ever combat drop, so it adds a collection-log entry. Rates are specified in HOURS AT THE SOURCE, following the Hearthfind ruling, and the odds are derived from that.

HOW THE HOURS WERE MEASURED: kills per hour were measured with the one engine (simulateSpan, 1 h, seed 20260926, Controlled style, fed, 0 deaths). Loadouts by tier: T1 = level 8 in bronze, T2 = 20 in iron, T3 = 33 in steel, T4 = 48 in mithril, T5 = 63 in rune, T6 = 80 in ember. 'gold+' below is the added vendor value per kill as a share of that monster's coins plus existing loot.

The 27 rows, as monster -> item (wield gate, book value), odds, kills per hour, expected hours, gold+:
T1
- mandrake -> bramble_blade (Attack 15, bane Plant x1.4, v130): ch .0006 (1 in 1,667), 340 kills/h, 4.9 h, +0.2%
- small_wolf -> wolfbone_torc (Defence 16, v260): ch .0008, 200/h, 6.3 h, +2.0%
- kobold -> banded_signet (Defence 18, v260): ch .0006, 312/h, 5.3 h, +1.2%
- witchs_apprentice -> oak_staff (Magic 15, v300): ch .0006, 299/h, 5.6 h, +2.2%
T2
- gnoll -> willow_longbow (Ranged 30, v525): ch .0005, 303/h, 6.6 h, +1.7%
- giant_bat -> fang_studs (Defence 18, v130): ch .0008, 289/h, 4.3 h, +0.9%
- wight -> willow_staff (Magic 30, v500): ch .0005, 228/h, 8.8 h, +1.1%
- hobgoblin -> rat_stick (Attack 30, bane Vermin, v550): ch .0005, 266/h, 7.5 h, +1.3%
T3
- venom_spider -> spidersilk_choker (Defence 34, v1000): ch .0005, 245/h, 8.2 h, +1.1%
- zombie -> lazlos_maul (Attack 45, bane Undead, v1650): ch .0005, 161/h, 12.4 h, +1.7%
- fire_devil -> maple_staff (Magic 45, v1500): ch .0004, 231/h, 10.8 h, +1.0%
- deserter -> maple_bow (Ranged 45, v1575): ch .0004, 221/h, 11.3 h, +0.3%
T4
- giant_spider -> widows_fang (Attack 38, v7600): ch .0004, 160/h, 15.6 h, +2.9%
- mountain_troll -> trollhide_cape (Defence 50, v3600): ch .0006, 137/h, 12.2 h, +2.0%
- goblin_warlord -> warlords_torc (Defence 52, v3000): ch .0006, 179/h, 9.3 h, +1.2%
- void_mote -> void_censer (Magic 60, bane Extra-Dimensional, v4500): ch .0005, 207/h, 9.7 h, +1.5%
T5
- panther -> panthers_eye_pendant (Attack 68, v13600): ch .0005, 126/h, 15.9 h, +2.7%
- grave_banshee -> wraithsilk_shroud (Defence 52, v10400): ch .0005, 132/h, 15.2 h, +1.3%
- shadow_creeper -> shadowsilk_cape (Defence 63, v10800): ch .0005, 158/h, 12.7 h, +3.1%
- chained_demon -> demoncaller_staff (Magic 68, v13600): ch .0005, 105/h, 19.0 h, +1.3%
- drake -> yew_bow (Ranged 60, v4725): ch .0006, 108/h, 15.4 h, +0.9%
T6
- war_king -> crown_of_the_fallen_king (Defence 85, v17000): ch .0005, 88/h, 22.7 h, +1.0%
- vampire_bride -> rubyfire_studs (Defence 66, v4500): ch .0010, 89/h, 11.2 h, +0.6%
- storm_elemental -> runewood_staff (Magic 75, v13000): ch .0007, 85/h, 16.8 h, +1.2%
- draconia -> dragonrib_bow (Ranged 75, bane Dragon, v13650): ch .0008, 61/h, 20.5 h, +1.1%
- elder_cinder -> emberfang_blade (Attack 72, v14400): ch .0008, 72/h, 17.4 h, +0.5%
- broodmother -> chitinweave_cloak (Defence 76, v15200): ch .0007, 80/h, 17.9 h, +1.8%

WHAT THE BALANCE RESTS ON:
- Every item is at or one tier above the monster's tier.
- Wield gates sit at most about 15 levels above the tier's combat band, so a find is either usable now or a reason to level.
- Four bane weapons are routed to their own family (bramble to Plant, lazlos to Undead, void_censer to Extra-Dimensional, dragonrib to Dragon), so a lucky find changes what the player hunts next.
- The hour band (4 to 23 h) sits between the rare band (under 1 h, the existing 1-5% rows) and Hearthfind (100 to 400 h).

EXCLUSIONS, and why:
- The three Hearthfind sources (elk_king, grim_reaper, dragon): tests/hearthfind-boss-rate.mjs pins their exact kills/h under a fixed seed, and an extra RNG draw would move it.
- The seeded-fixture monsters (goblin, slime, rat, dark_wizard, wolf, the_silence, weak_skeleton).
- Every BoP, dungeon/QM unique, tier-8 unique, Hearthfind item and dormant item.

CLIENT HALF (display only): in src/legacy.js onDrop(ev, m, ctx), look up the monster's row for ev.id. If row.ch <= 0.01, push `<span class="rare vrare">VERY RARE: <name></span>` to the combat log and call notify(`Very rare find: <name>! (about 1 in <round(1/ch)>)`, 'levelup'), then noteLiveSettleEvent('rare-drop'). This also lifts the 11 existing sub-1% rows. Everything else stays in the existing rare branch. No new UI; the glint and chime go to the Art Director.

DEPLOY ORDER: Security GO, then hr-accrue edge deploy, then the client push in the same cut. The client must never show a drop the deployed engine cannot roll.
### files
src/data/monsters.js (27 appended rows; edge-bundled); src/legacy.js (onDrop very-rare branch); NEW tests/lucky-finds.mjs with --selftest; .github/workflows/smoke.yml (register beside the hearthfind guards, around line 2005, so the hunk stays away from pack 4's); src/features/smoke/monsters-inventory-and-brand.js (LUCKY-1..3); docs/SYSTEMS_MAP.md §5 (a drop row is class B: edge deploy plus Security review)
### tests
GUARD tests/lucky-finds.mjs. For every drop row with lucky:true it asserts:
(a) the item exists in ITEMS, effectsAreLive, is not bop, not hearthfind, not tier 8, and not in QM_STOCK or any DUNGEONS loot;
(b) the monster is not a HEARTHFIND_TABLE source;
(c) ch x vendorPrice(item) <= 0.05 x gp midpoint;
(d) expected hours, measured with simulateSpan on the tier-matched loadout above (fixed seed, deterministic), fall in [4, 30];
(e) at least 4 lucky rows per tier T1-T6, and each lucky item is unique across rows.
--selftest mutations that must each turn it RED: ch x10 (hours below 4); lucky row on elk_king; item swapped to wartusk_cleaver; item swapped to emberheart; a T1 row pointing at a v13600 item (faucet cap).

BOTH-PATH, same file:
- AWAY: search seeds deterministically for one where the small_wolf lucky row fires inside a 3 h away:true simulateSpan, and assert wolfbone_torc is credited through fx.addItem and appears in the collection ops as ev:loot:wolfbone_torc.
- ATTENDED: the same seed on the live tick path (away:false) credits the same item.

IN-PAGE:
- LUCKY-1: onDrop for a lucky row writes 'VERY RARE: Wolfbone Torc' to the combat log and fires one toast with 'about 1 in 1,250'.
- LUCKY-2: an ordinary 5% row still reads 'RARE:' and not 'VERY RARE'.
- LUCKY-3: the collection-log detail for small_wolf lists Wolfbone Torc at '<1%'.

ALSO RUN: accrual-engine, attended-loot-credit, settle-carry-loss, hearthfind-boss-rate, hearthfind-roll, dungeon-key-drops and inventory-mint-census (all must stay green untouched), plus lane-done.
### reviewer problems fixed by the brief
- P1 · CONFIRMED by reading the code · the client half would announce drops the server never rolled. The live tick's RNG is seeded from Math.random (src/core-bridge.js:112). The server rolls with hr_seed plus a server secret (supabase/functions/hr-accrue/accrual.js:1117) and a salted top-up stream (accrual.js:2443). So an onDrop 'VERY RARE' toast (src/legacy.js:6345) would fire on finds that disappear at the next envelope, while also landing in G.inventory and the fight rail (COMBAT_FX.addItem, legacy.js:6202). It would also be written permanently into the client collection log: G.collection is a RESIDUE field (src/net/client-state.js:147) and collection-log.js:612 shows a 'New discovery' toast. Meanwhile real server finds on attended settles arrive silently, because attended settles narrate nothing (src/net/accrue.js:5327). This is the CLAUDE.md §6 'browser says X, server says Y' class, and it breaks Tyler's 2026-09-16 no-new-prediction ruling (tests/no-new-prediction.mjs). Fix: never show or credit a lucky row from client dice. Trigger the reveal only from the server's away.events {type:'rare_drop'} (hr-accrue/index.ts:1698; emitted at accrual.js:2104 and :2425). Blast radius: the player's own view, plus equip/list/sell attempts the server refuses.
- The class is wrong: B, should be C. These rows change what the server engine mints into tradeable inventories — a drop table, which CLAUDE.md §2 puts behind Security. They ship as an hr-accrue edge deploy that must go out before the client half, which is lane C's order. No migration is needed. CONFIRMED on the live DB: all 27 ids are in hr_items, tradeable, with values equal to src/data. hr_apply can be executed by hr_engine only (anon/authenticated/service_role = false), so there is no client mint path.
- Balance · crown_of_the_fallen_king on war_king is rarity 'unique', tier 7. It is forged from a War Crown plus 2 Dawnsteel bars at Smithing 88, and the design says 'finding one before you can forge one is the intended unique-item story' (src/data/wave3-uniques.js). A direct drop skips the sink for the game's top helmet. Drop the row. Guard (a) must exclude rarity 'unique'.
- Balance · oak_staff on witchs_apprentice is sold repeatably in the equip shop for 650 gold (src/data/shops.js:331). That makes it a 5.6 h 'very rare' chase for something you can buy. Swap it (proposed: adept_body, tier 2, Defence 15, v275, live and tradeable). Guard (a) must exclude any item granted by a shop in shops.js.
- Balance · two rows break the pack's own rule 'item at or one tier above the monster', and no guard checks it. widows_fang is item tier 3 on T4 giant_spider; it is also worth v7600, 4.8x its T4 neighbours maple_bow (1575) and lazlos_maul (1650), and it is a drop-gated wave-3 recipe item. rubyfire_studs is tier 5 on T6 vampire_bride. Swap them (proposed: giant_spider -> wraithglass_drops, tier 4 v1500 with art; vampire_bride -> archmage_gloves, tier 6 v6370) and add guard (f) for the tier rule.
- Odds and hours are wrong in three places. (1) small_wolf has dropBonus 1.15 (monsters.js:90), so the real odds are 1 in 1,087 over 5.4 h. LUCKY-1 pins '1 in 1,250', which is wrong. (2) Running out of Vigour multiplies dropMult by 0.25 (accrual.js ~L2296), which quadruples the hours: the crown would take about 91 h, which is Hearthfind territory. (3) The weekly Boss of the Day (x2.0, botd.js:55) covers war_king, broodmother, draconia and elder_cinder. The toast must say 'base odds' and compute them through effectiveDropChance with the monster's dropBonus. Guard (d) must also check hours at the multiplier ceiling.
- Display · CONFIRMED: three surfaces round the percentage to one decimal, so the four .0004 rows read '0.0%' and the rest '0.1%'. The surfaces are src/features/combat-render.js:363, src/features/boss-of-the-day.js pct() ~L122, and src/legacy.js lootRowHtml ~L12096. The pack's 'no new UI' claim is false; a shared '1 in N' formatter is needed.
- Faucet shift that needs a designer ruling. The collectible combat-drop pool grows from 113 to 140 ids. Ids reachable through T5 go from 97 to 118, so collect100 (15,000 gold + 15 gems, src/data/collection-milestones.js) becomes reachable with no T6 content. Renown ceiling rises by 81 (3 per entry, 2026-08-20-renown.sql). The designer either accepts this, or changes the threshold, which needs a lane-C hr_claim_milestone migration plus collection-renown-claim-drift.
- Ratchet · CONFIRMED: node tests/monolith-ratchet.mjs exited 0 and reports src/legacy.js at 19,178 lines, exactly its MONO-1 ceiling. Any branch added to legacy.js onDrop turns the build red. The logic has to live in a new module, with net legacy.js lines <= 0.
- Conflicts · set/b554 rewrote 386 lines of .github/workflows/smoke.yml and tests/ci-shape.baseline.json. Branch from set/b554 @9c70fa98, not main, and regenerate ci-shape with its own tool. There is no file overlap with the Vigour, party-view or tap-target lanes. Vigour's effect is covered in the odds item above. Party kills route a lucky item through the dmg_bp lottery (src/core/party-split.js); the engine authors that and the client supplies nothing, so it is fine.
- The pack's guard list is missing some runs. world-tick-combat-parity: its fixtures fight small_wolf and goblin_warlord (services/world-tick/fixtures/combat-sessions.json), and the extra RNG draw moves those streams. Also missing: bestiary-trophy, bounty-drift (pickProofItem, core/bounty.js:414 — lucky gear is typed so it is filtered out, but assert that), conservation-fuzz, party-split/party-settle, collection-renown-claim-drift, no-new-prediction, monolith-ratchet and pack-edge --hash. catalogue-literal-drift and restore-census must be run as zero-diff proofs: drops are not in hr_items/hr_item_slots/hr_activities and no table is added. MONSTER_TOTAL is unchanged. All 26 kept or proposed items have art in item-art.js except chitin_helmet, which is why it was not proposed.
- Residuals accepted, not closed. (1) Forged attended kill claims can buy up to 3.0x the server's away-sim rate (docs/design/attended-loot-credit.md, 'residual'), and that now includes lucky rows. The items are tradeable, so the surplus can reach the market. It is bounded (lucky rows add at most +3% value per kill), journalled in meta.att and watched by Watch A. (2) PLAUSIBLE, pre-existing: at bank cap, a lucky new stack trips bank_full, the settle degrades (index.ts DEGRADABLE), and after MAX_DEGRADE the window is forfeited, find included. (3) World-tick combat settles send no events to the client, so the reveal is silent there. Seed grinding is closed: the roll uses a server-secret seed keyed on accrued_to.
- Not done here: this was a read-only review. Kills per hour were not re-measured; guard (d) is where they get proven. No branch was created, so lane-done does not apply to this review.
