# Content pack 9: Provisioner's Counter: arrow bundles and mid-tier emergency food

VERDICT (security/systems pre-review): GO-WITH-CHANGES | class C

## PLAYER VALUE
Buying Iron Arrows in the equipment shop today costs 150 gold for ONE arrow, and iron arrows are used up at one per shot. That is a trap for new rangers. After this pack, 150 gold buys 100. The Supplies tab also gains Lobster and Swordfish packs so a knocked-out mid-level fighter with gold is never stuck without food (the b524 incident, one band higher).

## THE CORRECTED LANE BRIEF (execute this)
LANE: lane/provisioner-counter, branched from origin/set/b555. Class C: an edge-only price change on a money surface with no SQL. A Security GO is required before the Coordinator's edge deploy. Agents never deploy, never apply, never make live calls, and never edit tests/live-hash-drift.baseline.json.

GOAL: remove the 150 g single-arrow trap from the Equipment tab, and let a knocked-out mid-level fighter who has gold buy a meal one band above trout.

ROWS
1. src/legacy.js:553 SEED_SHOP: append {id:'cooked_lobster',qty:5,cost:2000}. Buyback is 5x240=1200, so the ratio is 1.67 and it heals 25.
2. src/legacy.js:554 EQUIP_SHOP: remove {id:'iron_arrows',cost:150}.
3. Do NOT add cooked_swordfish. It heals 22 for 940 g each against lobster's 25 for 400 g, and it cannot be priced below its 2800 buyback.
4. Do NOT add iron_arrows or barbed_arrows at 150/180. That is below the craft input cost (3.6 and 5.8 g/arrow), and barbed needs Ranged 15, which the Supplies row cannot show.
5. Optional arrow row, ONLY if the dispatch message carries a game-designer ruling: {id:'bronze_arrows',qty:<ruled>,cost:<ruled>}. Bronze arrows have ammoPerShot 0, so one stack lasts forever. The cost must be more than qty x vendorPrice and should be at least 1.5x the fletch input book (264 g per 50). Without a ruling, add no arrow row.

FILES
a) src/legacy.js, as above.
b) src/data/shops.js: regenerate with `node tools/gen-shops.mjs`, then run `--check`. Never hand-edit it. After merging set/b555, regenerate instead of hand-merging.
c) src/data/items.js:227-240: comment only. Rename the block to the rows the counter sells, and add the pin 'cooked_lobster.v must stay < 400 (price 2000/5)'. Change no values.
d) src/features/smoke/monsters-inventory-and-brand.js ~L6710-6722, test 'b526: an empty bag can be answered with gold': extend the strict price > buyback loop from [shrimp, trout] to [shrimp, trout, lobster]. Edit IN PLACE only; set/b555 appends at L8568.
e) src/features/smoke/rooms-items-and-economy.js: append two registered tests.
   - PROVISION-1 (pure, no live call): resolvePurchase('cooked_lobster',5,2000) deep-equals {offer:'seed.cooked_lobster',count:1}. resolvePurchase('cooked_lobster',5,1).error === 'price_mismatch'. No entry in shopOfferIndex() has offer 'equip.iron_arrows', and window.EQUIP_SHOP has no iron_arrows row.
   - PROVISION-2, the no-profit rule: for EVERY entry in HearthriseGold.shopOfferIndex(), gold >= grants x window.vendorPrice(id). Use >=, not >: seven shipped rows sit at exactly 1.00 (equip.steel_platebody and six seeds); name them in the assertion comment.
   - Mutation proofs, stated in the commit message: cooked_lobster cost 1199 turns PROVISION-2 red; cost 1200 turns b526 red. Revert both.
f) tests/gold-intents.mjs: new arm G-PROV, run against the local database copy.
   - runShopBuy seed.cooked_lobster qty 1 gives gold -2000 and cooked_lobster +5, with ledger meta {offer:'seed.cooked_lobster', unit_gold:2000}.
   - offer 'equip.iron_arrows' returns 409 unknown_offer, with gold and inventory unchanged.
   - resolveOffer('seed.cooked_lobster') returns gold 2000 and grant [{id:'cooked_lobster',amount:1*5}].
   - This file is NOT registered in CI (guards-unregistered.json:70). Run it by hand and paste its exit code.

GATES (quote each exit code you saw; never write 'green' without one)
- node tools/gen-shops.mjs --check
- node tests/shop-drift-guard.mjs
- node tools/gen-unlock-offers.mjs --check
- node tools/gen-catalogues.mjs --check
- node tests/recipe-yield-guard.mjs
- node tests/catalogue-literal-drift.mjs
- node tests/gold-intents.mjs
- Merge origin/set/b555 into the branch yourself and resolve any conflict there. Then run `node tools/lane-done.mjs` and paste its last line.
- No in-page suite run is required of the lane.

HANDOFF TO THE COORDINATOR
- Security GO, then the edge deploy from the assembled set, only after every staged migration whose edge half is already in the set is applied (ledger-of-firsts). Verify the live payload_sha256 equals pack-edge --hash.
- The client half rides the 20:00 UTC cut, with a visual gate on Shop, Supplies and Equipment, at desktop and 922x423.
- Designer follow-ups: the seven zero-margin offers, and the bronze-arrow row.

## THE DESIGNER SPEC (rows, rates, tests; the brief above wins where they differ)
### contents
SEED_SHOP (the Supplies tab; bundle pricing via `qty`), 4 appended rows:
- {id:'cooked_lobster', qty:5, cost:2000}
- {id:'cooked_swordfish', qty:5, cost:4700}
- {id:'iron_arrows', qty:100, cost:150}
- {id:'barbed_arrows', qty:100, cost:180}

EQUIP_SHOP: remove {id:'iron_arrows', cost:150}. The equip table is one unit per purchase, so equip.iron_arrows grants 1 arrow.

Price / buyback check, keeping to the b525 rule that price > buyback at about 1.5-1.8x:
- existing cooked_shrimp: 150 / 90 = 1.67x
- existing cooked_trout: 450 / 275 = 1.64x
- cooked_lobster: 2000 / 1200 = 1.67x
- cooked_swordfish: 4700 / 2800 = 1.68x
- iron_arrows: 150 / 100 = 1.5x (value 1, not raw)
- barbed_arrows: 180 / 100 = 1.8x

Buying stays worse than cooking or crafting, because you forgo the XP. These are repeatable gold sinks with no gate, which is the only shape shop_buy sells.
### files
- src/legacy.js: SEED_SHOP +4 rows, EQUIP_SHOP -1 row.
- src/data/shops.js: regenerate with node tools/gen-shops.mjs.
- src/features/smoke/rooms-items-and-economy.js: PROVISION-1, plus the generalised b525 rule, appended.
- tests/gold-intents.mjs: only if it pins the offer count.
- Edge redeploy, because shops.js is bundled and the edge authors the price.
### tests
In-page PROVISION-1 (happy path): shop_buy 'seed.iron_arrows' through the edge intent grants +100 iron_arrows and -150 gold in the envelope. 'seed.cooked_lobster' grants +5 and -2000. 'equip.iron_arrows' is refused as unknown or retired, never silently defaulted.

Regression: generalise the b525 check to 'every item-granting gold offer costs more than qty x vendorPriceOf'. Mutation proof: iron_arrows qty 100 at 99 gold goes red.

Guards: gen-shops --check (the drift preflight in run-smoke), gold-intents (the vendorPrice formula mirror), and an edge unit: resolveOffer('seed.cooked_swordfish') returns gold 4700 and grant 5.
### depends on
None; independent of Deep Waters, because prices key on item value, not heals. If a Vigour lane regenerates src/data/shops.js first, re-run gen-shops after the merge instead of hand-merging the generated file. Security GO comes before the edge deploy.
### reviewer problems fixed by the brief
- [P1 process | CONFIRMED] The class is wrong: it is C, not B. All four rows set a gold price and put items into inventories. The price authority is the edge bundle: supabase/functions/hr-accrue/catalogue.js offerIneligibility/GOLD_OFFERS (~L217-265) builds from src/data/shops.js, and hr_apply never re-prices (shop-buy.js buyDelta: gold = -(offer.gold*qty)). So the edge deploy is the 'apply', and it needs a Security GO first. No SQL body changes. No existing test covers this; it is a process gate.
- [P2 balance | CONFIRMED] seed.cooked_swordfish is a trap row, the same kind of trap this pack is meant to remove. It heals 22 for 940 g each, while lobster heals 25 for 400 g (heal per gold 0.023 vs 0.0625; the shrimp already sold is 0.267). The price cannot go lower because the buyback floor is 5x560=2800 (items.js:393). It would also become the dearest gold offer in the game (4700, above equip.steel_sword at 2000). Fix: drop the row. No test would catch it.
- [P2 balance | CONFIRMED] The arrow rows sell below the cost of crafting them. Iron would be 1.5 g/arrow against a craft input book of 3.6 g/arrow (recipes.js:331: iron_bar 90 + 5 normal_plank 18 makes 50). Barbed would be 1.8 g against 5.8 g (slot-ladders.js:195). The NPC counter would then cap the market price of every fletcher's arrows, so the brief's claim that 'buying stays worse than crafting' is false for arrows. It also does not fix the new-ranger problem. At 1 arrow per swing and a 2400 ms tick (combat.js:74) a ranger burns 1,500 arrows/h, which costs 2,250-2,700 g/h, more than the ~1,900 g/h a CL5 hunter earns (2026-09-25-vigour-price-by-level.sql:89). The game's actual answer for new rangers is Bronze Arrows: ammoPerShot 0, so they never run out (slot-ladders.js:70, ammo.js:203). Fix: needs a game-designer ruling. Default: retire equip.iron_arrows and sell neither iron nor barbed.
- [P3 UX | CONFIRMED] barbed_arrows needs Ranged 15 (slot-ladders.js:71). The Supplies row renderer (src/render/shop.js:274) never calls gearWieldReq; the b341 wield-gate chip only exists in the equip tab (shop.js:276-299). So a level-1 player can buy 100 arrows they cannot equip. The server still refuses the equip, so this is a UX trap, not a money problem. Fix: drop the row, or port the gate chip to the Supplies row.
- [P2 test | CONFIRMED] The generalised rule as written ('costs MORE than qty x vendorPriceOf') fails on 7 offers that are already live. Each costs exactly its buyback (ratio 1.00): equip.steel_platebody 1500/1500 and seed.carrot/potato/pumpkin/tomato/turnip/wheat. I measured this with the shipped vendorPriceOf. Fix: the rule for all offers must be the no-profit form (cost >= buyback). Keep the strict > margin only for the food rows. Pass the 7 zero-margin rows to the designer as a remaining risk.
- [P2 test | CONFIRMED] The brief points at the wrong test and file. The existing rule is 'b526: an empty bag can be answered with gold' at src/features/smoke/monsters-inventory-and-brand.js:6702 (the [shrimp, trout] loop at ~L6718), not a 'b525' test in rooms-items-and-economy.js. Extend that loop in place. Do not append to that file: set/b555 appends 172 lines at L8568, so an append would conflict.
- [P2 test | CONFIRMED] The planned in-page PROVISION-1 ('through the edge intent grants +100/-150 in the envelope') cannot work as written. It needs a live account with gold and a deployed edge, so it would either fabricate player state (§2) or stay red until the deploy. Fix: in-page tests use only the pure resolver (HearthriseGold.resolvePurchase / shopOfferIndex); the edge behaviour goes in tests/gold-intents.mjs, which runs against a local database copy. Note that gold-intents.mjs is NOT registered in CI (tests/guards-unregistered.json:70), so the lane must run it by hand and report the exit code it saw. The brief's guard list overstates it as a standing guard.
- [P2 deploy | PLAUSIBLE] The edge redeploy ships the whole bundle from the set, not just this change. set/b555 already carries edge changes from other lanes (ledger-of-firsts collection.found, with a STAGED migration; lucky-finds). If the Coordinator deploys this price change from set/b555 before those migrations are applied, the live edge would call SQL that does not exist yet. Fix: deploy only after those applies, then check that the live payload_sha256 equals pack-edge --hash.
- [P3 docs | CONFIRMED] The comment at src/data/items.js:227-240 ('THE TWO ROWS THE LOCAL SHOP SELLS') only records the faucet ceiling for shrimp and trout. Adding lobster pins cooked_lobster.v below 400. Update the comment; comment only, no value change.
- [P3 client | CONFIRMED] src/net/gold.js:193-207 offerByItem drops any item that two gold offers grant. If a lane ever keeps both equip.iron_arrows and a seed iron-arrow row, iron_arrows would resolve to no_offer and the purchase would never be sent. The removal and any addition must land in one commit.
- [CLOSED | CONFIRMED by computation against the shipped catalogue.js] (1) Buy-then-vendor gold loop: every proposed row costs more than it sells back (lobster 2000 vs 1200, swordfish 4700 vs 2800, iron 150 vs 100, barbed 180 vs 100), and there is no vendor sell multiplier anywhere. (2) All four rows pass offerIneligibility. (3) The per-call clamp has headroom: 4700 x MAX_QTY 1000 = 4.7M, under c_max_gold_delta 50M (G15). (4) The client price never crosses: the edge reads its own catalogue and resolvePurchase refuses price_mismatch. (5) No recipe uses these four items as input, so gold cannot buy XP through them. (6) The clan feast gains no cheaper path: lobster's heal per gold is below shrimp's, which is already sold. (7) BOUNDED: lobster's drop_rate +3% is multiplicative (drops.js:53), buffs do not stack (buffs.js:227), Hearthfind is unscaled, and gold cannot be bought with real money. (8) No conflict with the b554 lanes: Vigour, party-view and tap-targets are all merged to main and none touch shops.js or SEED_SHOP. set/b555's only legacy.js hunk is at L12092. (9) These guards are unaffected: catalogue-literal-drift (all four ids already in hr_items), restore-census (no new table), icons (item-art.js:140/201/206), bestiary counts. gen-shops --check is green today (129 offers, exit 0 seen).
- [process] lane-done was not run. This was a read-only review before dispatch: no branch, no edits.
