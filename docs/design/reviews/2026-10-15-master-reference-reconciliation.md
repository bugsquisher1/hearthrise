# Master Design Reference v1.1: reconciliation review (game-designer, 2026-10-15, read-only)
Sources: MDR on origin/main b6db45be. Built or building: `origin/lane/demo-shell` 4f9bebdf (it contains demo-data 595b566a), C2 67d686dd, WORLD_SHELL.md (merged on main), combat-review.md, gather-review/review.md, ruling-D, ruling-S, demolition-plan/rulings. Precedence: Tyler's conversation answers (memory steam-launch-decisions, 10-14/10-15), then the MDR, then the Bible. MDR §12.4 (account survival) is void because the wipe is done. "UNV" means unmeasured.

## 1. Inventory (system → verdict). ⚑ = the demolition retired something the MDR confirms
| System | Verdict | Why / evidence | Depends on |
|---|---|---|---|
| Auth, hr_state_of, world tick, one engine (combat-sim) | KEEP | MDR §1: server-authoritative | — |
| Hunt sessions (private instance, falls 3, 2% death XP, end card, analyzer) | KEEP + ADAPT | MDR §1/§8. 29 `hr_hunt_*` RPCs in C2. Needs the §3 fixes | C2 Security GO and apply |
| Stamina 12 h, 1:1 (`STAMINA_MAX_MS`) | KEEP | Matches MDR §8 and Tyler's 10-14 ruling. The gold refill (≤6/day, +4 h, never Crowns) is a separate lane C | C2 |
| Vigour | RETIRE after C2 (the HOLD stands) | Not in the MDR. C2 already says "Vigour ends no hunt" | C2 follow-on |
| Shop basics paid per use (`supply-basics.js`), crafted supplies packed | KEEP + ADAPT | MDR §4 "Store Supplies". There is no My/Store mode and ammo falls back automatically (§3 C2-1) | C2 |
| Sell-to-cover (`coverSellable`, ledger intent `vendor_cover`) | ADAPT | Not in the MDR. It sells bones (`bones` has no rarity, so it qualifies), which conflicts with "auto-sell is opt-in" (§3 C2-2) | C2 |
| Auto-Eat | RETIRE (done in D1; engine part in the C2 follow-on) | Replaced by the action bar | — |
| Skills attack/strength/hitpoints, Prayer capped at 99 with a ward | REPLACE | MDR §2: Melee/Ranged/Magic/Defense/Prayer uncapped, no Health skill (`skills.js:4-7` still has hitpoints) | U lane after the slice |
| Weapon speed (`WEAPON_SPEED_MOD` combat.js:96, spdB, style speedMod) | RETIRE | MDR §2: one interval, no speed stat. Interval = 2.0 s (Tyler 10-15); today `tickMs: 2400` | U2 |
| Runes: air→blood staff ammo, Enchant v1 ember/frost/poison | REPLACE (Enchant v1 already deleted in D2) | MDR §4 families; Tyler: the current system is replaced | rune lane R |
| `elements.js` + `monster.elementWeak` (35 rows) | KEEP + ADAPT | The weakness hook survives the demolition. Tyler wants weakness and resistance from day one. Re-key ember/frost/poison to the families and add resistances | R / D0 |
| Whetstones (ammo per swing, moved to Smithing by ruling §1) | REPLACE → Honing Stones | MDR §7: a 1–50 h hunting-time preparation, not per hit. Keep the 7 ids and the Smithing recipes | prep lane |
| Gear: fixed stats, no durability | KEEP | No random stats exists; the only durability is a comment | — |
| Gear `reqLv`/`reqSkill` (35 rows in items.js, plus slot-ladders 28, stonecraft 14, wave3 14 …) | ADAPT: strip | MDR §6: no requirements to equip | roster / U4 |
| Crafted gear recipes and scrolls | RETIRE (done) | MDR §6 confirms gear comes from drops | — |
| Bound boss weapons (`bop`) | RETIRE | MDR §6: freely tradable, no bind-on-equip | roster |
| Imbuements | FUTURE (none in code) | Ruling D is superseded on slots, clock and trade (see §2 rows 14–16) | after the slice |
| Charms: Hunter's Ledger and bestiary charms | RETIRE (correct). ⚑ in name only | MDR §7 charms are a NEW Woodcrafting preparation item, a different system. Nothing to restore. `core/charms.js` and `data/bestiary-charms.js` still feed combat through C2-owned files; the absence guard only bans `HearthriseCharms`, so a new charm system is not blocked | C2 follow-on |
| Bestiary (kill-derived stages) | KEEP + ADAPT | Tyler: a relic boost per stage. MDR §8 lists "bestiary upgrades" as a gold sink, and no such sink exists (decision 4) | B1 tracker |
| Trophies (`trophy-claim.js`) | KEEP | MDR §9: trophies score housing | — |
| Property ladder homestead→farmstead→manor→keep→castle (`shops.js:196-220`) | REPLACE | MDR §9: a free starter cottage plus 15 instanced, non-exclusive properties that buy only looks | housing lane |
| Room rungs: speed/noBurn/craftSave | KEEP as workbench upgrades | MDR §8/§9 "workbench upgrades"; Tyler: home benches give better recipes | — |
| Room perks allXP and combatXP (`data/perks.js:69-87`), watchtower combatXP, capstone allXP | RETIRE | MDR §9: no XP from a home. D3 pinned `makeBonus` byte-identical, so they survive the demolition | homestead lane |
| Plots by property tier (`farm.js PLOT_TIERS`), hired-hand slots by house (ruling S) | ADAPT | MDR §9: property buys no resource advantage. Move them to bench/yard upgrades open to any home | homestead lane |
| House themes (HOUSE_THEMES, deleted) | ⚑ FUTURE, rebuild clean | MDR §8/§9: cosmetics sold for gold and Crowns, tradable. The old themes were a gem-IAP shop; do not restore them | cosmetics lane |
| Gems, Hearth Token, earned gems | RETIRE (correct) | Crowns = FUTURE, bought only. `account_wallet` stays as the base (`shops.js:621`). `start-kit gems: 0` should go | monetization |
| Clans, castle seat, feasts, raids | RETIRE. ⚑ guild halls | MDR §1: "shared cities and **guild halls**". Rebuild clean as FUTURE (a guild plus a hall instance); restoring would bring back castle and raid code | decision 5 |
| Parties (m8 tables, tick-party) | RETIRE. ⚑ party instances | MDR §1 and Tyler: party hunting is the MMO layer, with party loot and the rare roll ruled 10-14. Rebuild as one shared hunt session (C2 reserves `follow`) | M7 |
| Dungeons, scrip, keys, QM, blueprints, farm_deed | RETIRE | Tyler: dungeons paused, no blueprints. ⚑ Class-4 "endgame boss" gear now has no source. Boss hunts are FUTURE (WORLD_SHELL Adventures → Bosses); restore the key ids from git then | boss hunts |
| Companions and pets | RETIRE | Not in the MDR. Tyler: pets come back as relic-slot drops (FUTURE) | roster |
| Renown, dailies, login, streaks, deeds, BotD, blessings, events, muster, bounty, marks, traits, Set the Night | RETIRE (correct) | Nothing in the MDR supports them | — |
| Stonemason | RETIRE (correct) | Whetstones → Smithing (ruling §1) | — |
| Tools (axe/pick ladder, optional boost) | KEEP | No durability. Gathering inside hunts | gathering slice |
| Gathering inside hunts; coal at Town Edge | FUTURE (NEXT, per the scope deal) | gather-review §2: Gather None/<node>, default None | after C2 |
| Crafting → "Woodcrafting" | ADAPT (designer) | MDR §7 names Woodcrafting for shafts, furniture and charms. Today Crafting makes planks, arrows and timber_beam. Rename when charms or furniture land | — |
| Prayer (bury as an artisan action) | REPLACE | MDR §5: uncapped, passive HP+mana regen with diminishing returns, bones offered at hunt end | U2 / S3 |
| Market + Depot (gold) | KEEP | Crown listings and direct trade are FUTURE | — |
| Chat, World/Common | KEEP | City instances of about 40 are FUTURE; one instance for now | — |
| Farming/Cooking (food = HP, drinks = mana) | KEEP | Drinks are staged (`MANA_SUPPLY_ROWS`) | mana engine |
| Combat training (dummy, gold training weapons) | FUTURE | MDR §8 gold sink; C2 reserves `training` in `RESUMABLE_KINDS` | after U |
| Forging, arena | DEFERRED | none in code | — |
| World shell (windows, HUD widgets, ×2) | KEEP | Approved (1760c2fd) | — |

**Recovery plan for the ⚑ rows:** none needs a `git revert`. All four (guild halls, parties, cosmetics, boss gear) are rebuilt clean as FUTURE on the new session and shell models, because the old code was built on deleted systems (castle, m8 party fence, gem IAP, dungeon keys). One action now: keep the absence guard's ban list to OLD identifiers only. Today it bans `HearthriseParty`, a `party` door (DA-3) and `HOUSE_THEMES`, so the lane that brings each concept back must edit the guard on purpose. Note that in the guard header.

## 2. Reconciliation per confirmed rule
| # | Rule (MDR § / Tyler) | State | Note |
|---|---|---|---|
| 1 | Private hunt instance; towns, chat, market and parties are shared (§1, Tyler 10-15) | works (solo) / missing (party, city instance) | C2 sessions are private |
| 2 | Server-authoritative hunting, loot and supplies (§1, §12.6) | works in C2 | settle re-prices every buy (`hr_hunt_apply` §5b) |
| 3 | Uncapped Melee/Magic/Ranged/Defense/Prayer, no Health (§2) | conflicts | U lane |
| 4 | Level raises HP and mana; armour weight shifts HP%/mana% (§2) | missing | HP = Hitpoints level; no mana |
| 5 | One Magic skill, Destruction and Restoration (§2) | missing | no ability rows |
| 6 | Magic XP from mana spent; staff basics cost mana and train Magic (Tyler 10-15) | conflicts | damage-based today (`styles.js`) |
| 7 | One interval for all basic attacks = 2.0 s, no speed bonuses (§2, Tyler) | conflicts | 2400 ms × weapon/style mods |
| 8 | No stuns or cast times; offense, heal and consumable lanes; food and drink share one lane (§2) | conflicts | C2 groups heal/mana/buff (`rule-subjects.js` COOLDOWN_GROUPS) |
| 9 | Automation: priorities, HP/mana thresholds, safe fallback (§2) | works (items only) | 20 slots, `self_mana_pct`; no ability slots |
| 10 | 3 abilities per discipline plus a universal self-heal (Tyler, §2) | missing | S1/S2 |
| 11 | Elemental rune families, the tier scales only the number; weaknesses with an auto-picked rune (§4, Tyler) | missing / partial | hook exists (`elementMultFor`, clamp 1.90) |
| 12 | Use My Supplies (carried) vs Store Supplies; End or Switch on empty (§4) | conflicts | no mode; ammo falls back automatically; carried = bag ✓ |
| 13 | Out of gold for store supplies ends the hunt (Tyler; §4 OPEN) | works | `gold_out`, never debt ✓ |
| 14 | Gear class 1/2/3/4 → 0/1/2/3 slots; one-hand and shield at half power and half cost (§6) | missing | ruling D's slot table differs: supersede it |
| 15 | Imbues, honing and charms use 1–50 h of hunting time, linear top-up (§7) | conflicts | D: a fixed 20 h. Whetstones are per hit |
| 16 | An active imbuement blocks trade; removal costs a gold fee (§6) | conflicts | D: "imbues travel with a traded item" |
| 17 | No random stats, no equip requirements, no durability, no bind (§6) | partial | fixed ✓, no durability ✓; reqLv and bop remain |
| 18 | Smith NPC sells cheap low-tier gear (§6) | missing | the shop window returns after the cutover (WORLD_SHELL §6 item 2) |
| 19 | Smithing makes arrowheads and Honing Stones, never gear (§7) | partial | whetstones moved ✓; arrowheads not split from Crafting |
| 20 | Prayer passive regen, diminishing returns; bones tradable and offered at hunt end (§5) | conflicts / partial | bones tradable ✓ (`items.js:82`, no bop) |
| 21 | Junk auto-sold after a hunt; gear and imbue materials kept (§8, Tyler: opt-in) | missing | not in C2; it is the M4 loot-rules lane |
| 22 | Rare drop in about 10–20 h, extra-rare in about 100–150 h (§8, Tyler) | missing | the simple drop-table roster (Tyler 10-14) |
| 23 | Track NPC gold issuance separately from P2P volume (§8) | partial | ledger intent `vendor_cover` ✓; vitals has no issuance split |
| 24 | Stamina 12 h, 1:1, refill ≤6/day for gold (§8, Tyler) | works (pool) / missing (refill) | refill is lane C |
| 25 | Gold sinks: store supplies ✓, benches ✓, imbue fees, training weapons, bestiary, cosmetics (§8) | partial | 2 of 6 exist |
| 26 | Free starter cottage + 15 properties, looks only (§9) | conflicts | 5-step ladder; XP perks |
| 27 | Home = depot, benches, dummies, decor (§9) | partial | depot and benches ✓; no dummies or decor scoring |
| 28 | Weekly showcase, per-property boards, city instances of 40 (§10) | missing | post-EA (see §6) |
| 29 | Crowns: bought only, tradable; market in gold or Crowns (§8, Tyler) | missing | gems removed ✓ |

## 3. Urgent: change BEFORE C2 and the shell cutover finish
**C2 (S0 from combat-review, re-aimed by Tyler's 10-15 answers; about 4 h):**
1. Action set gets `supply_mode: mine|store` and `on_dry: end|store`, default `mine`+`end`. `spendFromQuiver`'s shop-shot fallback and the shop-heal path fire only under `store`, or `mine`+`on_dry=store`. Mutant: drop the gate → a test goes red.
2. `coverSellable` sells only rows flagged junk (`item.junk === true`, none today), so cover is inert until loot rules land. Today it would sell bones (Prayer) and every common creature product (future imbue materials), which conflicts with Tyler's "auto-sell is opt-in" and his "imbue items never NPC-sold".
3. Cooldown groups become lanes: `consumable` (food, drink and buff together; MDR §2 "food and drinks share the consumable lane"), with `heal_spell` and `offense` reserved in the settle's SQL key CHECK (`settle.sql:626` admits only heal/buff).
4. Delete the 6 `plain_*_rune` basic rows from `supply-basics.js` and the catalogue: staff basics will cost mana, and runes become families. Shop arrows stay, priced per shot at 0.75 of their partner's bonus (K9).
5. Keep the swing interval a single constant read by the settle. Verified: the settle has no literal 2400 outside its fixtures, so U2 can flip it to 2.0 s; re-measure the `supply-basics` prices at that flip.

**Shell cutover:**
6. The `vitals` widget is "HP over MP" with no stamina (WORLD_SHELL §2). Add stamina with time left; the slice spends it, so it has to show.
7. The hunt-ground card carries the MDR §4 "Hunt Supplies" choice, copy verbatim: Use My Supplies / Use Store Supplies; when they run out, End my hunt / Switch to Store Supplies. Shop slots show their price.
8. The end card shows the reason (`END_REASON_COPY`), stamina used, "Store Supplies −X g" and "Your Supplies: N used".

## 4. Minimum working slice (MDR §12.5) on C2 → shell → B1
| Step | What the player has from steps before plus the kit (`start-kit.js`: 500 g, 20 cooked_shrimp, 50 bronze_arrows, 10 coarse_whetstone) | Built by | Status |
|---|---|---|---|
| 1 Log in, the character persists | an account; the wipe gives a fresh hero | auth + `hr_state_of` | works |
| 2 Walk the town | the Common, ×2 density | shell cutover + lane/a-world-move | in flight |
| 3 Start a private hunt (Mill Cellar) | the kit; the hunt-ground card names the ground | `hr_hunt_enter` + card (§3-7) | C2 staged; card in the cutover |
| 4 Server-run attacks, rewards, stamina and supply spend | the shrimp; or store heals at 90 g per 6 HP (`salted_shrimp`) | `hr_hunt_settle_session` / `hr_hunt_apply` | C2 staged. **Gap:** a fresh hero falls 36.6 times/h at Mill Cellar (gather-review finding 5), so 3 falls end the first hunt in minutes, and 500 g buys only 5 store heals |
| 5 Stop or claim | the end card plus the reason | `hr_hunt_leave` / `hr_hunt_close` + end card | C2 + cutover |
| 6 Inventory and gold persist | the loot, minus supplies | envelope + `player_ledger` | C2 |
| 7 Back in town | auto-return, then the last activity (`DEFAULT_RESUME` shrimp_s) | C2 + B1 walk | C2 / B1 |
| 8 Smoke on desktop and 922×423 | — | visual gate | after B1 |
Missing from the order: (a) §3 items 1–8; (b) the **Mill Cellar fresh-hero fix** must land before step 4 can pass (it is in the scope deal; give it an owner now); (c) C2's four migrations need a Security GO and must be applied before the shell client ships; demolition M1/M2 chain after C2; (d) the slice runs on today's combat engine (2.4 s, attack/strength). The 2.0 s interval, mana and abilities are S2, after Tyler plays (decision 1).

## 5. Decisions only Tyler can make (max 6)
1. **What the first playable proves** (MDR §14 last bullet). Recommendation: stabilization only. The slice uses today's engine; the new combat (2.0 s, mana, 3 abilities per discipline, Fire runes; about 66 h UNV) comes straight after his play.
2. **Housing for EA, and one active home per account or per character** (§14). Recommendation: EA = starter cottage + benches + depot + a trophy shelf + 3 of the 15 properties as gold-only, looks-only purchases. Post-EA: the other 12, displays and mannequins, scoring, Friday snapshots, city instances. One home per account.
3. **Imbuement scope and trade lock** (§7 OPEN). Recommendation: per gear piece. An imbued piece can't be listed or traded until it expires or the paid removal runs (fee = 10% of the remaining hours' price, UNV). A kind stacks at most once per character, so a one-hand + shield setup gets breadth, not a doubled bonus.
4. **The "bestiary upgrades" gold sink.** Recommendation: kills reach a stage; a small gold fee scaled to creature level activates that stage's relic boost (≤+25%). Gold never skips kills.
5. **Guild halls and parties at EA.** Recommendation: party hunt instances at EA (the reason to be online); guilds and halls post-EA, with a guild chat channel at EA.
6. **Crowns and the tradable-power path** (§8 + §6 no equip requirements). Crowns→gold→market rares lets real money buy Class-3/4 gear at level 1. Recommendation: allow it, but cap the weekly Crown↔gold exchange and get a Steam/legal review before Crowns ship.

## 6. Pushback (DESIGN_STANDARDS §10)
- **Housing is the largest item and the least sure to pay off at ~2 players a week.** Fifteen layouts, weekly ranking, frozen snapshots, mannequins holding real items (a dupe surface, §9) and 40-player instancing are a season of work for leaderboards nobody fills. Ship decision 2's EA cut. Build city instancing as a capacity constant with one instance, and route only when load tests demand it.
- **Three preparation systems on one 1–50 h slider** (imbues, honing stones, charms) triple the UI and settle-clock work. Ship Honing Stones first: it reuses the whetstone ids and Smithing recipes, and proves the hunting-time clock. Imbues follow with 4 kinds. Woodcrafting charms are post-EA.
- **Every auto-sell is new gold.** Junk auto-sell, sell-to-cover and loot vendoring are NPC issuance. Add a vitals line for NPC gold minted per hunt-hour (ledger intents exist) before the roster's junk values are set, or inflation is invisible (§8 risk).
- **The property–advantage rule needs a sweep, not a note.** The allXP/combatXP perks, property-tier plots and property-tier hand slots all violate §9 and sit in KEEP files. Retire the perks and decouple the rest in the housing lane, guarded (`no-property-advantage`).
- **Ruling D needs a v2 before D0 data starts:** class slots (§6), 1–50 h top-up, the trade lock, Class 4 = boss-only (no source until boss hunts), and Tyler's simple drop tables in place of bands. That keeps the roster from being authored twice.
