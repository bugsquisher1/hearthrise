# Content pack 4: 4. The Almanac: flavour lines for the 119 items that have none, including the Hearthfinds and the dungeon uniques

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class A

## PLAYER VALUE
The rarest things in the game stop reading as blanks. Today the four Hearthfind trophies, every dungeon unique, the Dungeon Scrip, the Reed & Tide catch and both armour lines (84 pieces) have no 'what is it' line, while the 419 other items do.

## THE CORRECTED LANE BRIEF (execute this)
LANE: lane/almanac-item-flavour (class A, client-only, no Security needed; security-engineer verified 2026-09-26)
BASE: cut from set/b554 @ 9c70fa98 (== origin/next). Before reporting, merge origin/next into the branch yourself. Never use git stash.

GOAL: add a flavour line for the 119 ITEMS ids that have none. Coverage goes from 419/538 to 538/538, and a guard keeps it there.

FILES (only these four)
1. src/data/item-descriptions.js: add 119 entries to the base ITEM_DESC literal, after the three spreads, in roughly alphabetical position. Do not touch WAVE3_DESC, SLOT_DESC or LIB2_DESC; they live in edge-bundled files. Do not change the '?v=553' imports. No build numbers in comments.
2. NEW tests/item-flavour-coverage.mjs.
3. .github/workflows/smoke.yml: add a step to the client-guards job (NOT db-replay), directly after the 'Quest reward parity' step (~line 2489). Name it 'Item flavour coverage - every item has a line'. Run block: `node tests/item-flavour-coverage.mjs` then `node tests/item-flavour-coverage.mjs --selftest`. Give it a short comment block in the style of its neighbours.
4. tests/ci-shape.baseline.json: regenerate only with `node tests/ci-shape.mjs --write`, never by hand.
5. In-page test: add one tryRun in src/features/smoke/bounty-and-artisan.js immediately after the item-index test ('items explain themselves', ~line 1958). It asserts that window.itemDesc('dungeon_scrip'), window.itemDesc('emberheart') and window.itemDesc('voidweave_body') each return a non-empty string. Keep it to about three lines of code. No build number in the title or in comments.

THE 119 IDS
- Hearthfind (4): emberheart, worldroot_seed, deepvein_lodestar, tidecallers_pearl.
- Dungeon (11): wartusk_cleaver, warboss_standard, whispering_codex, lexarch_seal, ashcrown_greatsword, voidmaw_scepter, voidwoven_sigil, riftmaw_husk, dungeon_scrip, dragonfang_pike, elderscale_heart.
- Kitchen / Reed & Tide (11): turnip_mash, pikeperch, cooked_pikeperch, copper_crab, cooked_copper_crab, silverfin, cooked_silverfin, goldgill, cooked_goldgill, river_chowder, fishers_pie.
- Jewellery (2): gold_ring, gold_amulet.
- Tools (9): bronze/steel/rune_hammer, bone/steel/rune_needle, bronze/steel/rune_knife.
- Leather (40): {leather,studded,boarhide,snakeskin,wyvernhide,dragonhide,voidhide}_{helmet,body,pants,belt}, plus {studded,boarhide,snakeskin,wyvernhide,dragonhide,voidhide}_{boots,gloves}.
- Cloth (42): {apprentice,adept,scholar,warlock,sorcerer,archmage,voidweave}_{helmet,body,pants,boots,gloves,belt}.
To confirm the list is correct, check that every ITEMS id without an ITEM_DESC entry is on it.

VOICE (measured on the existing 419 lines)
- One sentence, 40-132 characters (median 65).
- No trailing full stop, no digits, no emoji, no < > &.
- Original IP, warm medieval register.
- Write about the DISPLAY name, ITEMS[id].n, not the id. For example: leather_helmet is 'Leather Coif', apprentice_helmet is 'Apprentice Hat', the cloth belts are 'Sash', apprentice_body is 'Apprentice Robe Top', lexarch_seal is 'Archivist Seal'.
- Each tier must read as a step up from the one below.
- A hint about use is allowed ONLY if it is true on the server.

TRUE FACTS YOU MAY HINT AT (all checked against data)
- Hearthfinds: mythic trophies, bound to the finder, cosmetic only. Each unlocks a title: emberheart = Emberborn (from the Elk King, Grim Reaper and Dragon); worldroot_seed = Rootwarden (trees); deepvein_lodestar = Deepdelver (copper, mithril, dawnstone); tidecallers_pearl = Tidesworn (fishing waters). Do NOT claim any power, rate, access or trade.
- Dungeon drops:
  - Goblin Warcamp, boss Grimtusk: wartusk_cleaver (Attack 35 sword), warboss_standard (cosmetic trophy).
  - Haunted Archive, boss the Pale Archivist: whispering_codex (Magic 45), lexarch_seal (cosmetic).
  - Obsidian Keep, boss the Ashen King: ashcrown_greatsword (Attack 65).
  - The Voidbringer, boss the Riftmaw: voidmaw_scepter (Magic 80), voidwoven_sigil (cosmetic), riftmaw_husk.
  - Ancient Wyrm, boss Elderscale: dragonfang_pike (Attack 95), elderscale_heart.
  - All five weapons are ALSO sold by the Quartermaster for scrip, so never write 'only won from'.
  - riftmaw_husk and elderscale_heart feed NO recipe, so never promise a craft.
  - dungeon_scrip: paid in proportion to how much of a run you clear, and spent at the Quartermaster. Use: 'Stamped chits the Quartermaster honours, paid out for every stretch of dark a delver clears'.
- Kitchen (each buff is honoured server-side):
  - turnip_mash: Cooking 1, plain heal, no buff.
  - pikeperch: Reed Pike Pool, Fishing 24. Grilled Pikeperch buffs gather speed. Use: 'Reed pike grilled on a green stick, firm and sweet, a river supper that quickens the gathering hand'.
  - copper_crab: Tidepool Crabs. Steamed Copper Crab buffs all XP.
  - silverfin: Silverfin Shoal. Silverfin Fillet buffs damage.
  - goldgill: Goldgill Eddy. Goldgill Steak buffs drop rate.
  - river_chowder: silverfin, potato, carrot; buffs defence.
  - fishers_pie: goldgill, wheat, potato; buffs damage.
  - Match the neighbours' style: cooked_trout 'sharpens your learning', cooked_lobster 'draws luck to your hunts'.
- Tools: the hammer speeds Smithing, the needle speeds Crafting, the knife speeds Cooking. Tiers climb bronze/bone, then steel, then rune. Model the ladder on the axe, pickaxe and rod lines (bronze_axe '...a woodcutter's first honest tool' up to rune_axe '...the master woodcutter's prized felling tool').
- Jewellery: gold_ring is crafted from a gold bar, needs Defence 30 to wear, and gives attack and strength. gold_amulet is crafted from gold bars and a ruby, needs Defence 30, and gives attack and defence.
- Leather is ranger's armour (ranged attack and crit, a small magic penalty). Cloth is caster's robes (magic attack and strength, melee and ranged penalty). Both ladders step through Defence requirements 1, 15, 30, 45, 60, 75, 88. Both are crafted from planks and silk thread (cloth also uses magic essence), NEVER hides, so do not name a hide as an input. The existing leather_boots and leather_gloves lines are the tier-1 anchors.
- Keep emberheart: 'A coal that has burned since before the first hearth was laid, and will outlast the last'.

GUARD: tests/item-flavour-coverage.mjs
- Import ITEMS from '../src/data/items.js' and ITEM_DESC from '../src/data/item-descriptions.js', with NO '?v='.
- Write a pure check(items, desc, srcText) that returns [{id: 'FLV-n', msg}].
- Named assertions:
  - FLV-1: every ITEMS id has a non-empty line. The failure message must say: 'add it to the base ITEM_DESC in src/data/item-descriptions.js; never a *_DESC in an edge-bundled file'.
  - FLV-2: every ITEM_DESC key is a real ITEMS id.
  - FLV-3: every line is 40-132 characters.
  - FLV-4: no \p{Extended_Pictographic}.
  - FLV-5: no digits.
  - FLV-6: no < > &.
  - FLV-7: no two lines are identical.
  - FLV-8: no line ends in '.' unless its id is in the allowlist of exactly 14 WAVE3 ids (dragonrend_greatblade, crown_of_the_fallen_king, emberfang_blade, demoncaller_staff, panthers_eye_pendant, wraithsilk_shroud, widows_fang, plaguewarden_greaves, hollow_sigil_ring, fangdart_recurve, alphaheart_longbow, nightstalker_pelt, warband_bulwark, chitinweave_cloak). An allowlisted id whose line no longer ends in '.' is also RED (stale entry).
  - FLV-9: no key appears twice in the base literal, and no base key shadows a key from a spread map (parse srcText).
- --selftest runs a CLEAN arm that must be green, then these in-memory mutations, each of which must be caught by its named FLV id: delete emberheart; append an emoji; add a digit; add '<b>'; duplicate a line; pad a line to 140 characters; add an orphan key; end a new line with '.'; add a duplicate base key.
- Exit codes: 0 green, 1 red, 2 harness error.

GATES (every one is an exit code you saw, not an expectation)
- node tests/item-flavour-coverage.mjs -> 0, reporting 538/538.
- node tests/item-flavour-coverage.mjs --selftest -> 0, with every mutation caught.
- node tests/ci-shape.mjs --write, then node tests/ci-shape.mjs -> 0.
- node tests/guard-hygiene.mjs -> 0.
- node tests/test-file-ratchet.mjs -> 0.
- node tests/comment-ratio-ratchet.mjs -> 0.
- node tools/pack-edge.mjs hr-accrue --hash must print c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad, unchanged. This proves class A.
- node tools/lane-done.mjs -> paste its last line.
- Do NOT run the in-page suite; it runs at the daily cut.

OUT OF SCOPE (report these, do not fix): studded_boots v75 < leather_boots v90 (a price, so lane C); riftmaw_husk and elderscale_heart as dead-end materials (Designer); dragonfang_pike weaponType 'sword'.

REPORT: one table plus at most three sentences.

## THE DESIGNER'S ORIGINAL SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
WHAT CHANGES: 119 entries in the base ITEM_DESC map of src/data/item-descriptions.js. That file is client-only: it is not in the 19-file edge bundle, so this is class A. Do NOT write into LIB2_DESC, SLOT_DESC or WAVE3_DESC; those live in edge-bundled files.

THE EXACT IDS:
- Hearthfind (4): emberheart, worldroot_seed, deepvein_lodestar, tidecallers_pearl
- Dungeon (11): wartusk_cleaver, warboss_standard, whispering_codex, lexarch_seal, ashcrown_greatsword, voidmaw_scepter, voidwoven_sigil, riftmaw_husk, dungeon_scrip, dragonfang_pike, elderscale_heart
- Kitchen and Reed & Tide (11): turnip_mash, pikeperch, cooked_pikeperch, copper_crab, cooked_copper_crab, silverfin, cooked_silverfin, goldgill, cooked_goldgill, river_chowder, fishers_pie
- Jewellery (2): gold_ring, gold_amulet
- Artisan tools (9): bronze/steel/rune _hammer, bone/steel/rune _needle, bronze/steel/rune _knife
- Leather line (40): the helmet, body, pants and belt of leather, studded, boarhide, snakeskin, wyvernhide, dragonhide and voidhide; boots and gloves of studded through voidhide
- Cloth line (42): helmet, body, pants, boots, gloves and belt of apprentice, adept, scholar, warlock, sorcerer, archmage and voidweave

VOICE (measured on the 419 existing lines): one sentence, 43-132 characters (median 65), no trailing full stop, no emoji, no numbers, original IP, the warm medieval register of the existing lines. A line says what the thing is, and hints what it is for when that is true in data. Each tier of a line must read as a step up from the tier below it.

THREE EXAMPLE LINES setting the bar:
- emberheart: 'A coal that has burned since before the first hearth was laid, and will outlast the last'
- dungeon_scrip: 'Stamped chits the Quartermaster honours, earned only by those who walk back out of the dark'
- cooked_pikeperch: 'Reed pike grilled on a green stick, firm and sweet, a river cook's quiet pride'
### files
src/data/item-descriptions.js; NEW tests/item-flavour-coverage.mjs with --selftest; .github/workflows/smoke.yml (register beside catalogue-literal-drift, around line 417, well away from pack 1's hunk)
### tests
NODE tests/item-flavour-coverage.mjs asserts:
- every ITEMS id has an ITEM_DESC line (missing count is 0; this becomes the ratchet that makes every future item ship with a line);
- every line is 40-132 characters;
- no line contains \p{Extended_Pictographic};
- no two lines are identical;
- no NEW line ends in a full stop (the 14 legacy ones are allowlisted by id).
--selftest mutations that must each turn it RED: delete emberheart's line; append an emoji to one line; duplicate a line; pad a line to 140 characters.

IN-PAGE: an item-index check that window.itemDesc('dungeon_scrip') and window.itemDesc('emberheart') are non-empty strings.

Also run lane-done.
### reviewer problems fixed by the brief
- CLASS A IS CONFIRMED, so no Security review is needed. I checked this by running the packer, not by reading the brief. pack(hr-accrue) vendors 19 src/data files and src/data/item-descriptions.js is not one of them. Nothing in tools/, tests/ or supabase/ reads ITEM_DESC. The only readers are the render sinks: src/features/item-index.js:192, src/item-ux.js:256 and src/legacy.js:10287. No row goes into an inventory, drop table, price, XP, gold amount or ranking. The coverage counts in the brief are exact: 538 ITEMS, 419 with a line, 119 without, and the pack's id list matches the missing set one for one. Baseline edge payload hash to check against after the change: c799d1594e286d3b872d41a2d6970f4ac50e5f8eab61c98ff03586d55a517bad.
- WRONG CI JOB (confirmed). On set/b554 the step 'catalogue-literal-drift' (smoke.yml:414-418) belongs to the db-replay job, which boots PostgreSQL and has a 16-minute budget. A guard that needs no credentials and no database belongs in client-guards (starts at smoke.yml:2209, 9-minute budget). Put it directly after the 'Quest reward parity' step (smoke.yml ~2485-2489).
- MISSING FILE (confirmed): tests/ci-shape.baseline.json. Any new command in smoke.yml is red under CI-SHAPE-6 (UNREGISTERED) until you run `node tests/ci-shape.mjs --write`, and ci-shape runs inside lane-done. The in-page test also needs a named home: src/features/smoke/bounty-and-artisan.js, next to the item-index test at line ~1958.
- WRONG BASE (confirmed). Compared with main, set/b554 has rewritten 386 lines of smoke.yml and changed ci-shape.baseline.json. A branch cut from main will conflict. Cut it from set/b554 at 9c70fa98, which is currently the same commit as origin/next. No other remote branch touches the four files this lane edits.
- EXAMPLE LINE BELOW THE NEIGHBOURS' BAR (confirmed). 20 of the 24 buff foods that have a line hint at their buff (cooked_trout 'sharpens your learning', cooked_lobster 'draws luck to your hunts'). The server does grant these buffs: 2026-09-13-item-buffs-catalogue.generated.sql:62 gives cooked_pikeperch gather_speed. The cooked_pikeperch example leaves the buff out. Rewrite it along the lines of 'Reed pike grilled on a green stick, firm and sweet, a river supper that quickens the gathering hand'.
- EXAMPLE LINE OVERCLAIMS (confirmed). The dungeon_scrip example says scrip is 'earned ONLY by those who walk back out'. In fact scrip scales with the fraction of the dungeon cleared, so partial clears pay too (src/data/dungeons.js:204-210; docs/design/dungeon-settlement.md:114). Drop the word 'only'.
- LINES THAT WOULD BE FALSE (confirmed from data). (a) riftmaw_husk and elderscale_heart are tagged crafting-mat but no recipe uses them, so their lines must not promise a craft. (b) All five dungeon weapons are also sold by the Quartermaster for scrip (dungeons.js:245-249), so 'only won from' is false. (c) A Hearthfind grants only a cosmetic title ('pays a moment and nothing else', hearthfind.js:100-111), so its line must claim no power, rate, access or trade. (d) The leather and cloth recipes use planks, silk thread and (for cloth) magic essence, never hides; boarhide_body is willow_plank x5 + silk_thread x3. A line must not name a hide as an input.
- TEST GAPS (the fixes are cheap). (1) No test for digits. The voice rule says no numbers, and none of the 419 existing lines has one. (2) No ban on < > &. The line is inserted into innerHTML without escaping at item-ux.js:256 and legacy.js:10287. The text is written in the repo, so at worst this breaks only the player's own page, but the sink should stay inert. (3) Nothing catches an ITEM_DESC key that is not a real ITEMS id, i.e. a typo. (4) Nothing catches a duplicate key in the base object literal; JS silently keeps the last one, which is the shadowing problem described in stonecraft.js:462-477. (5) The full-stop allowlist must be exactly the 14 WAVE3 ids and must stay exact: an entry whose line no longer ends in '.' is stale and should fail. (6) guard-hygiene R3 requires --selftest to include a clean arm that stays green, and each mutation must trip a named assertion.
- RIPPLE EFFECT ON OTHER LANES. Once 'missing == 0' is a hard floor, any sibling pack that adds an ITEMS row goes red unless the same commit adds a line in the base ITEM_DESC. That applies to lane-C items too. Writing into WAVE3_DESC, SLOT_DESC or LIB2_DESC changes the edge payload hash and forces an edge deploy. The failure message must say so, and whichever lane merges second must be green against the one that merged first.
- OUT OF SCOPE, ROUTE ELSEWHERE, DO NOT FIX HERE. Neighbouring rows have data oddities this lane will expose. studded_boots (tier 2) has v 75, below leather_boots (tier 1) at v 90; v is a catalogued price, so the fix is lane C. riftmaw_husk and elderscale_heart are dead-end materials (Designer). dragonfang_pike has weaponType 'sword'. Also: comment-ratio CR-3 forbids build numbers in new comments, and the new test must import src/data without '?v=' (versionQueryGuard).
