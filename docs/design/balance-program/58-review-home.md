# Balance program 58: design review, Home

Review of `lane/d-review-home` (game-designer, 2026-11-21), phase A. Reading and analysis only. Nothing in the game was changed and no grid, matrix or browser run was made. One cheap read was run: `node tools/balance-program/home.mjs all` (it reads data rows and writes nothing).

Briefs: `45-design-brief.md` (main) and `40-formula-brief.md`. Base: `set/v0.2.144`. Older dive: `26-home.md`. Labels: EVIDENCE (with its source), COMPUTED (arithmetic on the game's data rows, not played), HYPOTHESIS (to be measured in phase B or by players), RULED (Tyler, dated).

What already landed on this set and is not re-argued: the deed prices (400 / 25,000 / 150,000 / 600,000 / 2,500,000), the Shrine and the Trophy room off sale (`HELD_HOME_ROOMS`), the bag ladder stopped at 10 rungs, and "Tend the field" (migration 1017). Still to come from the plan: L19 the yard fee, L33 the Cellar as the curing room, L38 room rungs keep materials, L45 home maps, chests and visiting, L51 the Trophy room.

## 1. Summary for Tyler

**Verdict.** Home belongs in Hearthrise. A hero hunts 12 hours and rests 12, and Home is where the resting half of the day turns into things the hunting half uses. But today Home is a price list and not a place. It has one cottage picture for six deeds, and 21 of the 30 room rungs still on sale give something no player can feel. If we designed it from scratch we would not build 8 rooms with 5 rungs each. We would build three things. A place that makes supplies for the hunt. A place that keeps what the account owns. A place that shows what the account has won. Everything in Home should be one of those three, and most of what fails today is none of them.

**The five changes that matter most.**

| # | Change | Why |
|---|---|---|
| 1 | **The Trophy room becomes the Hall of Firsts.** Room on the wall comes from the deed, not from 5 mount rungs. Each piece you hang costs a mounting fee. The Castle's reward is the Great Hall | Rare drops and firsts are the long chase, and Home is the only place they can live. Two to six mounts is far too few for a collection game. A fee per piece is a gold sink that grows with every boss and every rare we ever add |
| 2 | **Take the Cellar off sale now. Curing is built last, as a standing order** (phase B: the "do not build" call is withdrawn) | The Cellar sells longer food effects for 787,200 gold and the plan cuts those effects. Curing adds a timer, a slot ladder, a fee and a screen to do what one bench press already does. Real heroes are idle 59% of their lives |
| 3 | **Remove the soil tiers from the farm.** A crop opens at its Farming level and nothing else | A crop has four gates today: the deed, the Garden, the soil tier and the Farming level. The soil tier's own comment says it is "never the gate". It is the gate that left farming at zero for ten days |
| 4 | **Bring the room rung swap forward (kept materials instead of speed), and be honest about who it is for** | 16 speed rungs worth 5.25M gold are on sale today and never pay back. Kept materials pays back in about 120 bench hours on the best recipes and never on planks and bars. That is fine for a rich player's sink if the row says so |
| 5 | **Three home looks, not five maps. Visiting opens at the Homestead, not the Castle** | Ground art is the critical path. Two new maps (a manor and a castle) give every big deed a look. A wall nobody can visit until they spend 2.5M is a wall nobody sees |

**Actively harming the game today.**

- The Cellar's five rungs are on sale and buy nothing a player will notice. It is the same fault that took the Trophy room off sale.
- Sixteen bench speed rungs are on sale and never pay back. The player who buys everything loses 5.25M to them, and the careful player learns that the House is a trap.
- The server banks "rested XP" charges for every player beside its accrual, and nothing in the game can spend them. It is dead code on the accrual path.
- An account that buys the 150,000 gold dummy still cannot pick it in "When the hunt ends". The only training choice there is the paid yard.

**What I would add.** One thing now: the Hall of Firsts above. One thing later, with the next region: seeds that drop from monsters and grow that region's best drink, so the hunt feeds the field and farmers have something to trade. Nothing else. Home needs fewer and better parts, not more of them.

**Phase B update.** Measured and re-read against the other reviews in section 10. Three things changed: I withdraw the curing call (you ruled it twice, it is built last), the dummy should halve the yard fee, and the yard's rate should follow the skill curve. The current calls are in section 10.8.

**Where I think you are wrong.** Two places still. Visiting behind the Castle hides the best reason to buy a deed. And the plan's "a home map for each deed" spends four maps of art where two would do the job.

## 2. Systems review

### 2.1 Does Home belong, and what should it do for the hunting loop

Yes, on three conditions. Brief 45 names "crafting, housing, collections and long goals" in the identity, and an idle game with a 12 hour hunt and a 12 hour rest needs a place where rest becomes preparation.

| What Home should do | The link to the hunt | Today |
|---|---|---|
| **Make.** Turn rested hours and visits into supplies | Farm crops become mana drinks. Fee-free benches make food, runes, bars. Later the yard and dummy make skill | Works for the heavy players: a third of supplies used are home-made (EVIDENCE, `10-real-players.md` gap 8). A full field of emberfruit is about 7,000 gold of store drinks a day against a four's 7,500 a day drink bill (EVIDENCE, `26-home.md` §6). No screen says so |
| **Keep.** Hold what the account owns and move it between heroes | Storage is the only item path between your own heroes (RULED 10-23). Benches read Storage (RULED 10-25). L07 makes the refill take own stock first | Works. 1,713 deposits and 812 hand withdraws (EVIDENCE) |
| **Show.** Give the things you won a place | Rare drops, boss firsts, Level 200, a 99 skill | Missing. One cottage for six deeds. The wall hangs nothing. Nobody can visit |

And the link runs back the other way: deeds and rungs ask for hunt drops (Wolf Pelt, Bear Pelt, Gatekeeper's Chain, War Crown, Hask's Coin, Barrow Nail in `homestead-tiers.js`). That is the right idea and it stays.

What Home must never do: grant combat power or XP (the designer's 10-22 rule, held), and ask for a decision the player already made (the first principle).

**From scratch, would we build it this way?** No. We would not build a 6 x 8 x 5 grid of deeds, rooms and rungs and then look for forty things to sell. We would list the things a home can honestly sell and build only those. There are four: capacity (beds, stacks, a dummy seat), a fee that ends (the bench fee, the yard fee), kept materials for the serious crafter, and things to show. Speed is not on the list because a resting hero is not short of time at one bench, it is short of materials: 418 fishing hours fed 133 cooking hours and 737 mining hours fed 117 at the forge (EVIDENCE, `26-home.md` §2).

### 2.2 System by system

| System | What it is for | How it plugs in | Earns its place |
|---|---|---|---|
| **The property ladder** (6 deeds) | The account's long gold sink and the gate for rooms, beds and chests | Gold and hunt drops in. Beds, rooms, chests out | Yes. The re-spaced prices (landed) make each deed a choice. It still shows one cottage at every tier and the Castle opens no room of its own |
| **Bench rooms** (Kitchen, Workshop, Forge, Library) | Rung 1 ends the 15% public bench fee. Rungs 2 to 5 sell 2% speed each | Bench fee sink ends. Speed feeds nothing scarce | Rung 1 yes: payback 20 to 52 bench hours (EVIDENCE, `home.mjs rooms`). Rungs 2 to 5 no: 283 to 4,899 bench hours |
| **The Garden** | +1 bed a rung | Farm capacity | Yes for rungs 1 to 3 (5 to 30 days). Rungs 4 and 5 are capacity for the Farming chase and an honest sink |
| **The Cellar** | Hand-eaten food effects last longer | Extends a buff queue the plan is cutting (30-plan.md line 98: food XP buffs cut) | No. On sale today |
| **The Shrine** | Faster fuelling of the Great Hearth | A skill with 16 recorded hours | No. Cut and held (landed) |
| **The Trophy room** | Mounts for bestiary trophies that do not exist | Nothing | Not as built. Held (landed). The idea is the best one in Home |
| **The rung engine** (`perks.js`, `hr_room_perks`) | Turns a bought rung into a number the server pays | One channel, server-owned magnitudes | Yes. Sound engineering. It is at the right layer already: a rung is a content row over one formula |
| **The bench fee** | 15% of output at the public bench, waived at home | The House's one honest first buy | Yes |
| **Storage** | Account shelf, 100 to 300 stacks, four chests | The only path between own heroes | Yes |
| **Bag rungs** | +20 stacks a hero, 10 rungs | Per hero | Yes at 10 |
| **Farming** | Wall-clock crops on shared land, nine crops, Farming to 99 | Crops to drinks to the action bar. Seeds from the Shop | Yes. The one town system all four real people use (EVIDENCE) |
| **Tend the field** | One press for harvest, replant and water | First principle | Yes. Landed. Needs a played check with 12+ beds |
| **Soil (plot) tiers** | A gold fee before a crop can be planted | Duplicates the Farming level gate | No |
| **Watering** | Doubles growth for 2 hours, 8 a planting | Rewards visits | Only as part of Tend. As its own press it was 1,361 presses for almost nothing |
| **Curing** (ruled, not built) | Linings and salts made in House slots for a fee | Would give the Cellar a purpose | Not shown. See §5 trace T2 |
| **The yard** | 30,000 skill XP an hour for gold, no stamina | Rested hours and gold to skill. Catch-up for a changed weapon or a back row's Defense | Yes, once the fee means something (L19, ruled) |
| **The House dummy** | Ends the yard fee, a skill a rung, one seat | A 1.4M sink | Yes after L19. It is a tool for new heroes and changed weapons, not a "long term" benefit: the flat rate gives 0.2 levels a night at skill 80 (COMPUTED, `home.mjs training`) |
| **Training items** | +30,000 an hour for 12 or 24 hours | Gold or Crowns | Tyler's money call, ruled. Not re-argued here |
| **The rested bank** (`src/core/rested.js`, `accrue-rested.js`) | Banks a charge every 6 minutes to pay flat bonus XP | The Library's quantum is empty (`ROOM_RUNG_EXTRAS` is `{}`) and both accrual callers pass `restedQuantum: 0` | No. It accrues and can never pay |

### 2.3 The room rungs, one by one

Prices and paybacks are EVIDENCE from `home.mjs rooms`. "Felt" is my judgement of whether a player notices the rung in play.

| Room | Rung | Gold | Gives today | Payback | Felt | Verdict |
|---|---|---|---|---|---|---|
| Kitchen | 1 | 40,000 | No cooking fee, +2% speed, 13% less burnt | 20 bench h | yes | KEEP |
| | 2 | 70,000 | +2% speed, burn relief to 19% | 288 | burn only | REDESIGN (L38) |
| | 3 | 110,000 | +2% speed, burn relief to 25% | 452 | burn only | REDESIGN |
| | 4 | 180,000 | +2% speed | 740 | no | REDESIGN |
| | 5 | 800,000 | +2% speed | 3,290 | no | REDESIGN |
| Garden | 1 | 600 | +1 bed | 5 days | yes | KEEP |
| | 2 | 2,500 | +1 bed | 8 to 19 days | yes | KEEP |
| | 3 | 9,000 | +1 bed | 30 days | yes | KEEP |
| | 4 | 60,000 | +1 bed | 146 to 199 days | yes | KEEP as capacity |
| | 5 | 600,000 | +1 bed | 1,456 days | yes | KEEP as capacity |
| Workshop | 1 | 75,000 | No crafting fee, +2% speed, 1% kept | 52 bench h | yes | KEEP |
| | 2 to 5 | 110,000 to 900,000 | +2% speed, kept to 8% | 599 to 4,899 | no | REDESIGN |
| Forge | 1 | 75,000 | No smithing fee, +2% speed | 23 bench h | yes | KEEP |
| | 2 to 5 | 110,000 to 900,000 | +2% speed | 283 to 2,314 | no | REDESIGN |
| Library | 1 | 60,000 | No rune fee, +2% speed | 37 bench h | yes | KEEP |
| | 2 to 5 | 90,000 to 850,000 | +2% speed | 467 to 4,407 | no | REDESIGN |
| Cellar | 1 to 5 | 1,200 to 700,000 | Hand-eaten food effects +20% a rung | never | no | REMOVE from sale |
| Shrine | 1 to 5 | 900 to 600,000 | Hearth fuelling +2% | never | no | REMOVE (held) |
| Trophy | 1 to 5 | 2,000 to 600,000 | 2 to 6 mounts that hang nothing | never | no | REDESIGN (held) |

On sale today: 30 rungs in six rooms. Paying back in a time a player will reach: 4 first rungs and Garden 1 to 3. Garden 4 and 5 are honest capacity. Not paying back or not felt: 16 speed rungs (5,250,000 gold) and the Cellar's 5 (787,200). So the old "31 of 40" is "21 of 30" on this set (COMPUTED from the same table).

**What L38's swap really buys.** The ruled change (26-1) makes rungs 2 to 5 of a bench room keep 2, 4, 6, 8% of a job's materials. Kept materials is worth 2% of the job's INPUTS, which is less gold than 2% of its output. COMPUTED from `home.mjs benches` (inputs an hour = output minus value added):

| Bench | Recipe | Inputs an hour | 8% kept is worth, an hour | Rungs 2 to 5 cost | Payback, bench hours |
|---|---|---|---|---|---|
| Forge | smelt_mithril (what real smiths run) | 6,300 | 504 | 1,410,000 | 2,800 |
| Forge | grind_dawn_whetstone (Smithing 90) | 145,312 | 11,625 | 1,410,000 | 121 |
| Kitchen | cook_moon_elixir (Cooking 92) | 121,993 | 9,759 | 1,160,000 | 119 |
| Library | bind_graven_earth_runes (60) | 20,250 | 1,620 | 1,270,000 | 784 |

So the swap does not make the rungs pay back for a plank sawyer. It makes them pay back in about 120 bench hours for a player running the best recipes, and it scales with recipe value forever because it is a percent of inputs. That is the right shape for a sink above a band's gold (RULED 11-18). It is still the right change. The House row has to say it: "Keeps 8% of materials. Worth it on costly recipes."

## 3. Content rationalization

One row a thing. The 8 criteria for the significant ones are in §3.2.

### 3.1 The table

| # | Thing | Verdict | One line |
|---|---|---|---|
| 1 | Home as a system | KEEP | Make, Keep, Show. Everything else goes |
| 2 | Wanderer's Camp (tier 0) | KEEP | The deed says "Camp" and the scene is a walled cottage. Fix the words or the picture |
| 3 | Hearthside Homestead | KEEP | 400 gold in the first session is a good moment |
| 4 | Fieldworth Farmstead | KEEP | Opens three work rooms |
| 5 | Stonecross Manor | KEEP | Gets the manor look |
| 6 | Ironvale Keep | KEEP | Opens the Hall of Firsts |
| 7 | Hearthrise Castle | REDESIGN | 2.5M for two beds and the same cottage. It gets the castle look and the Great Hall |
| 8 | Deed and rung materials from hunt drops | KEEP | The hunt-to-home link |
| 9 | A home map for each deed (L45) | REDESIGN | Three looks: cottage, manor, castle. Two new maps, not four |
| 10 | Visiting (L45, 26-11) | DEFER | Build after the Hall. When built, open it at the Homestead |
| 11 | Kitchen rung 1 | KEEP | |
| 12 | Kitchen rungs 2 to 5, cook speed | REDESIGN | L38: kept materials. Pull forward |
| 13 | Kitchen burn relief | KEEP | A felt effect at low Cooking. Stays on rungs 1 to 3 |
| 14 | Workshop rung 1 | KEEP | |
| 15 | Workshop rungs 2 to 5 | REDESIGN | L38 |
| 16 | Forge rung 1 | KEEP | |
| 17 | Forge rungs 2 to 5 | REDESIGN | L38 |
| 18 | Library rung 1 | KEEP | |
| 19 | Library rungs 2 to 5 | REDESIGN | L38 |
| 20 | Garden rungs 1 to 5 | KEEP | Capacity, honest |
| 21 | Cellar rungs (food effects last longer) | REMOVE | Off sale now. Its consumer is being cut |
| 22 | Shrine rungs and the `flameSpeed` key | REMOVE | Held already. Drop the dead key when L38 regenerates the perk rows |
| 23 | Trophy room: 5 mount rungs | REDESIGN | The Hall of Firsts |
| 24 | The rung engine | KEEP | Right layer already |
| 25 | One Speed pool and one Yield pool a bench (26-2, L38) | KEEP | Ruled. One written stacking rule |
| 26 | The public bench fee | KEEP | |
| 27 | A furniture piece a rung | KEEP | The one part of a rung a player can see |
| 28 | The rested bank and the Library quantum seam | REMOVE | Accrues, never pays |
| 29 | Storage (the account's shelf) | KEEP | Foundational |
| 30 | The four chests | KEEP | Rename them: "depot" is another game's word (plan audit row 17) |
| 31 | Chests 5 to 8 (L45, 26-9) | ADD | Ruled. Capacity for hoarders |
| 32 | Bag rungs, 10 a hero | KEEP | Landed |
| 33 | Farming, the skill | KEEP | |
| 34 | Tend the field | KEEP | Landed. Play it at 12 and 17 beds |
| 35 | Watering as its own press | MERGE | Into Tend. The rule stays, the button goes from the bed row |
| 36 | Soil (plot) tiers 2 to 5 | REMOVE | Merge into the Farming level gate |
| 37 | Beds from deeds (2 a tier) and the Garden | KEEP | Two sources is one too many in theory. In play both read as "more beds" |
| 38 | Regrowing crops | KEEP | RULED 10-26 |
| 39 | Turnip | KEEP | The first drink |
| 40 | Carrot | KEEP | Drink |
| 41 | Wheat | KEEP | Six recipes, and rungs ask for bread and rations |
| 42 | Potato | REDESIGN | 38 gold a bed a day. It feeds only meals real players made once. It needs a hunt consumer or it merges into wheat's recipes |
| 43 | Tomato | KEEP | The first regrowing drink crop |
| 44 | Pumpkin | KEEP | Drink |
| 45 | Goldenroot | KEEP | Drink |
| 46 | Emberfruit | KEEP | The top drink (648 mana) |
| 47 | Moonbloom | REDESIGN | Farming 88, no drink, loses 545 gold a bed a day as a crop. Its elixir is worth 2,600 a job at the Shop, a pricing outlier to check |
| 48 | The `farm_yield` food buff and the zero Garden yield rows | REMOVE | Read by nothing (`26-home.md`, for 23) |
| 49 | Seeds that drop from monsters | ADD | With the next region. Sample of 2 first |
| 50 | Curing slots | DEFER | Behind a measurement. My lean is not to build it |
| 51 | The training yard | KEEP | With L19's fee |
| 52 | One flat rate, 30,000 an hour | REDESIGN (phase B, was KEEP) | The rate follows the skill curve, at most half of hunting. Tyler's call, 44 call 15 |
| 53 | The House dummy | REDESIGN (phase B, was KEEP) | It halves the yard fee. 55 call 4 |
| 54 | "Train at home" in "When the hunt ends" | ADD | One row in `AFTER_CHOICES`. The dummy has no row today |
| 55 | Training items for gold | KEEP | |
| 56 | Training paid by the combat engine | REDESIGN | Closed form (L19, ruled) |
| 57 | The 12 hour session limit | KEEP | It equals one rest |
| 58 | The Hall's mounting fee | ADD | A coefficient on the piece's reference value |

Counts in phase A: KEEP 36, REDESIGN 10, REMOVE 5, MERGE 1, ADD 4, DEFER 2. Total 58. After phase B rows 52 and 53 move to REDESIGN (section 10.7): KEEP 34, REDESIGN 12.

### 3.2 The 8 criteria for the significant ones

**A. The Hall of Firsts (rows 7, 23, 58). REDESIGN.**

| Criterion | |
|---|---|
| Player value | A place for the Rat King's Crown, a Tower weapon, the first Krell kill, Level 200, a 99 skill. Today four of the six Trophies ever dropped were sold to the Shop for about 4,000 gold (EVIDENCE, `26-home.md` §4) |
| Strategic depth | Keep or sell a rare. Which pieces go on the wall while room is short. No combat choice, on purpose |
| Uniqueness | Nothing else in the game displays what an account has done. The Chronicle records it, the Hall shows it |
| System interaction | Drops gain a third use (wear, sell, mount). Gold gains a sink per rare. Deeds gain a reason. Visiting gains something to see |
| Balance impact | No power, so no formula in combat moves. One coefficient: the fee. One content flag on rare rows and first-kill rows |
| Complexity cost | M. A mounts table, the projection, a mount and unmount verb (a mount never duplicates an item: the plan's own test), wall tiles on two or three maps |
| Long-term value | High. Every boss, unique and milestone ever added becomes a mount. It never runs out the way a 5 rung ladder does |
| Recommendation | REDESIGN L51. Wall room comes from the deed (Keep: a wall, Castle: the Great Hall, numbers sized in phase B from the count of mountable rows). The five mount rungs are not sold. Each piece pays a mounting fee when hung and comes back to the bag when taken down, fee not returned |

**B. Curing (row 50) and the Cellar (row 21). DEFER and REMOVE from sale.**

| Criterion | |
|---|---|
| Player value | Low as designed. A lining is one bench press. Curing replaces it with a slot, a 4 hour timer, a fee and a second visit to collect |
| Strategic depth | "How many slots" is asked three times and then never again |
| Uniqueness | It duplicates the bench. Its only distinct property is that no hero has to be in town |
| System interaction | Linings (not built), the Crafting skill (cured items give no XP, so XP stays at the bench), the Cellar, gold |
| Balance impact | No power. A fee coefficient and three prices |
| Complexity cost | M to L. A table, a timer, cancel rules (materials back, never the fee), a standing order so it is not a weekly chore of about 16 cures (plan audit row 15), a screen |
| Long-term value | Depends wholly on whether rested hours are scarce. Real heroes are idle 59% of their lives (EVIDENCE). The model assumes all 12 rested hours are worked (RULED call 13). If the model is right, a slot is worth real gold. If real play is right, a slot is worth nothing |
| Recommendation | Do not build it in this program. Measure in phase B and in the playtest how many rested hours the best path wants a day (standard T7). Build curing only if that number passes 12. Until then the lining's own gold price is the sink. Take the Cellar off sale today either way |

**C. Soil tiers (row 36). REMOVE.**

| Criterion | |
|---|---|
| Player value | Removing it takes away a press that reads "Improve the soil" and explains nothing. It eats a new player's whole 500 gold (EVIDENCE, `26-home.md` walk-through step 4) |
| Strategic depth | None lost. The tier is bought "slightly before" the crop opens, by design (`src/core/farm.js` comment). No player chooses not to |
| Uniqueness | A duplicate of the crop's own Farming level |
| System interaction | Farming only. 130,500 gold of one-time sink leaves (1.2% of the House's 10.9M) |
| Balance impact | Removes an exception: a second gate table (`hr_plot_tier`, `hr_crop_plot_tier`) over the one curve that already paces crops |
| Complexity cost | S to M. One RPC, two catalogues, a parity test and a button go away |
| Long-term value | Fewer rules for the same pacing, forever |
| Recommendation | REMOVE. Farming went to zero plants a day for ten days because of this gate (EVIDENCE, `farm.js` b510 note, 2026-09-06). A gate whose own rule is "never be the gate" should not exist. Real players did pay it (14 buys, 293,000 gold), so move its gold onto Garden rungs 4 and 5 only if the economy review wants it back |

**D. Bench rungs sell kept materials (rows 12, 15, 17, 19). REDESIGN, sooner.**

| Criterion | |
|---|---|
| Player value | A serious crafter keeps 8% of costly inputs. A casual one is told plainly the rung is not for them |
| Strategic depth | Which bench room first, by what the account crafts. Real, small |
| Uniqueness | The Workshop already has the perk. This makes four rooms one rule |
| System interaction | More crafted goods from the same drops: 8% more rolled jewelry, salts and whetstones for an account with all rungs. Needs the Yield cap of 15% (26-2) |
| Balance impact | Formula layer already exists (`craftSave`). The change is content rows plus reading the key at four benches |
| Complexity cost | M (L38) |
| Long-term value | High. A percent of inputs grows with recipe value at every future tier |
| Recommendation | Keep 26-1 as ruled. Move L38's row swap ahead of the lining work, because the 16 speed rungs are on sale and misleading now. If L38 cannot move, hold rungs 2 to 5 of the four rooms the way the Trophy room is held |

**E. Three looks and open visiting (rows 9, 10). REDESIGN and DEFER.**

| Criterion | |
|---|---|
| Player value | A Manor that looks like a manor. A Castle that reads as a castle in a screenshot (CLAUDE.md §10) |
| Strategic depth | None. It is the reward for a deed |
| Uniqueness | The only art that belongs to the account |
| System interaction | Deeds, the Hall, visiting. Competes with ground art, which the inventory calls the critical path |
| Balance impact | None |
| Complexity cost | Two maps (a row each in `HOUSE_TEMPLATES`) against four. Visiting is M: one read of another account's `home` section, read-only |
| Long-term value | High for the Castle, low for a fourth and fifth variation of a farmhouse |
| Recommendation | Cottage for Camp to Farmstead, a manor for Manor and Keep, a castle for the Castle. Visiting waits for the Hall and then opens from the Homestead for friends and party members |

**F. Seeds that drop (row 49). ADD, with the next region.**

| Criterion | |
|---|---|
| Player value | A Rare line in the loot that is a seed. The field grows that region's best drink |
| Strategic depth | Plant the rare seed or sell it. Beds for gold drinks or for the rare crop |
| Uniqueness | Today every seed is bought at the Shop and no crop is wanted by another player (crop bids are 4 to 170 gold). Nothing a hunt drops reaches the field |
| System interaction | Loot rows, farming, cooking, the action bar, the market. Mana drinks are 20% of the store bill, so a better home drink lowers a store sink |
| Balance impact | Content rows only: a seed, a crop, a drink recipe, a drop row. No new formula. The drink's mana sits on the existing drink ladder |
| Complexity cost | S a seed. Three icons |
| Long-term value | Each new region can carry one. It gives Farming past 75 a reason: the drink ladder ends at Farming 75 today and Moonbloom at 88 makes no drink |
| Recommendation | ADD as a sample of 2 with the Morrow Hills grounds, not before. Moonbloom is the first candidate: make it the drop-only seed with the top drink |

**G. The rested bank (row 28). REMOVE.**

Player value: none, it pays nothing. Complexity cost of keeping it: a module in `src/core`, an accrual in the edge engine, a watermark column (`rested_at`) written beside the accrual (`hr-accrue/index.ts` line 1017). Recommendation: REMOVE the module, the edge accrual and the column in one server lane. The plan already cut the rested grant (30-plan.md line 98).

**H. "Train at home" after a hunt (row 54). ADD.**

Player value: an account that paid 150,000 to 1.4M for the dummy can set it once and forget it. Today `AFTER_CHOICES` has one training row and its place is the yard, which will cost 3,000 to 11,000 gold an hour after L19. Complexity: one content row, the file's own comment says "a new place to go is a row here". Recommendation: ADD inside L19.

## 4. Missing opportunities

Checked against brief 45 §5. Home touches four of its twelve lines.

| Brief line | Opportunity in Home | Verdict |
|---|---|---|
| Rare and aspirational items | The Hall of Firsts gives every rare a use that is not "sell" | §3.2 A. High |
| Meaningful milestones between major upgrades | Firsts as mounts: first boss kill, each 99, Level 100 and 200, a Tower floor. A deed with a new look | §3.2 A and E |
| Crafting and economic interdependencies | Dropped seeds. Kept materials on costly recipes | §3.2 F and D |
| Endgame goals beyond gaining levels | Filling the Great Hall. It takes as long as the drops do: 60 to 140 hours a Very Rare | §3.2 A |
| Player cooperation and social progression | Visiting, after the Hall | §3.2 E |
| Features that make hunting more engaging without attention | The Tend result and the seed row say what the harvest is worth to the hunt ("41 Tomato Juice: about 3 hunted hours of your mage's mana"). Words only | Low cost, do with the next farm text pass |

Considered and rejected, so nobody proposes them again without new evidence:

| Idea | Why not |
|---|---|
| House slots that run ANY bench job with no hero (curing made general) | It would be the right design only if rested hours are scarce. Real heroes are idle 59%. It also empties the benches of heroes and so of skill XP |
| Home buffs for the hunt (a "well rested" bonus, a hearth blessing) | A home never grants XP or power. The rested bank was this idea and is being removed |
| Furniture crafting and free placement | A decorating game inside an idle game. Large art and UI cost, no link to the hunt. A piece a rung is enough |
| Farm animals, weather, seasons, crop quality | Each adds a daily chore. Tend exists to remove chores |
| A second home or home trading | One home an account (RULED 10-15) |
| Hired workers at home | The account already has up to four heroes resting 12 hours each |

## 5. Interaction traces

Each is a HYPOTHESIS until phase B measures it. "Measure" names the read.

**T1. The Hall of Firsts with a mounting fee.**

| Area | Knock-on |
|---|---|
| Combat | None. No power |
| Progression | Firsts become visible goals. The Castle gains a reason beyond two beds |
| Economy | A new repeating sink that scales with drops. Rares mounted leave circulation, so market supply of Trophies and uniques falls a little and their price rises. A Trophy's Shop price stops being its floor |
| Crafting | None, unless crafted masterworks are mountable (they should not be: firsts and drops only) |
| Gear | A unique you have outgrown has a home that is not the Shop. Salvage and the wall compete for the same piece |
| Parties | A first kill by a four gives each account its own first. No contention |
| Risk | A mount must not be a second Storage. Rule: only rows flagged mountable, one of each. UNINTENDED to watch: players mounting best-in-slot pieces to hide them from a death rule (there is no item loss on death, so no) |
| Measure | Count mountable rows from `atlas.json`. Size the fee so the Great Hall, filled, costs about as much as the Castle. Playtest: do players mount or sell the first Trophy they find |

**T2. Cellar off sale, curing behind a measurement.**

| Area | Knock-on |
|---|---|
| Economy | 787,200 gold of shelf leaves now. If curing is never built, the plan loses 3.0M of one-time sink and 55,000 to 144,000 gold a week of fee per account (`26-home.md` §7). The plan's "gold has somewhere to go at every Level" (line 46) lists curing. The lining's own gold cost is 2,500 a hero-hour against curing's 300 (line 105), so curing is about an eighth of the lining sink |
| Crafting | Linings stay a bench job. The Crafting hero keeps the XP. "Keep these linings up" becomes a line in Carry on (plan audit row 15) with no slot system under it |
| Progression | None |
| Parties | None |
| Monetization | A buyer of gold loses one place to turn gold into time. The dummy, deeds, kept materials and the Hall remain |
| Measure | Standard T7: rested hours the best path wants a day, from the town model. If over 12 at any checkpoint, curing has a case and L33 goes ahead as ruled |

**T3. Soil tiers removed.**

| Area | Knock-on |
|---|---|
| Progression | Carrot opens at Farming 10 with no purchase. A new player keeps its 500 gold for the Homestead (400) |
| Economy | 130,500 gold of one-time sink leaves an account. 293,000 was really paid across all players |
| Farming pace | Unchanged: the crop's level already paces it |
| Server | `hr_farm_upgrade_plot`, `hr_plot_tier`, `hr_crop_plot_tier`, `plot-tier-parity` test retire. Fewer refusals (`farm_*`) |
| Risk | The §3.4 vital for farming loses one cause of going to zero |
| Measure | Nothing to simulate. Check the first-hour walk: 500 starting gold now reaches the Homestead |

**T4. Room rungs keep materials, pulled forward.**

| Area | Knock-on |
|---|---|
| Economy | 8% fewer materials bought or gathered by an account with every rung. Materials are drops and gathered goods, so it is 8% less demand on the market for parts, and 8% more output from the same hunt hours |
| Gear | If linings, salts and rolled jewelry count, a rich account gets 8% more rolls at best-in-slot. With Good batch it stops at the 15% Yield cap. Standard T4 (25 to 45% of the mid-to-best gap passes through a bench) moves up a little |
| Combat | Runes: the Library at 8% makes rune binding 8% cheaper in essence. Runes are 55% of store supply spending for real players, so home-bound runes get more attractive and the store sink falls |
| Crafting | Bench hours do not change. Skill XP an hour does not change |
| Parties | None |
| Measure | `progression-grid --diff` with `craftSave` 0.08 on four benches: the four's gold line and supplies home-made share (standard T3 must stay under 80% on Deadly) |

**T5. Three looks, visiting from the Homestead.**

| Area | Knock-on |
|---|---|
| Economy | None by itself. HYPOTHESIS: seeing a friend's Manor raises deed purchases. Only players can tell |
| Art | Two maps not four. Frees two map slots for grounds |
| Server | A visit is one read of another account's `home` section. No poll. A visited home accepts no intent |
| Social | The first use of the friends list that is not a party invite |
| Measure | Playtest only: deed purchases by accounts that visited against those that did not |

**T6. Dropped seeds.**

| Area | Knock-on |
|---|---|
| Combat | A better mana drink lengthens a mage's or healer's hunt per bar slot. Must sit on the drink ladder's existing step size |
| Economy | Store drink spending falls for accounts that farm. A seed is a tradable Rare, so the market gets a consumable-chain good, which it lacks: no real player has bought anything on it (EVIDENCE) |
| Farming | Beds become contested between gold crops and the rare crop. Farming 76 to 99 gets a purpose |
| Loot | One more Rare row a region. It must not dilute gear rows: the Luck plan's rarity bands hold |
| Measure | `progression-grid --diff` with the new drink on the mage and healer seats at the staged bands. Supplies home-made share |

**T7. The yard at 100 gold x skill level (ruled, L19), seen from Home.**

| Area | Knock-on |
|---|---|
| Economy | A 12 hour rest at the yard costs 36,000 gold at skill 30 and 72,000 at 60. The dummy's first skill pays back in 25 to 50 hours |
| Progression | In the 12 and 12 frame the yard competes with benches, nodes and the farm for the same rested hours. A hero that trains every rest makes no supplies |
| Combat | +10 skills is worth 0 to +3% XP after to-hit (30-plan.md line 90) |
| First principle | Without row 54 a dummy owner re-opens Training by hand each night |
| Measure | Already G11 and G12 in the plan |

## 6. Priority list

| Pri | Change | Complexity | Risk | Expected benefit | Depends on | Evidence or hypothesis |
|---|---|---|---|---|---|---|
| **Critical** | none | | | | | Home has no fault that threatens the game. Its faults waste gold and trust |
| **High** | Cellar off sale now (row 21) | S, one data row | none | Stops a spend on nothing | none | EVIDENCE: `perks.js` `buffDuration`, plan line 98 |
| **High** | Hall of Firsts replaces L51's mount rungs (A) | M | low | The long chase gets a home. A sink that grows with content | L20 Luck, L29 | HYPOTHESIS on use. EVIDENCE that Trophies are sold today |
| **High** | Bench rungs: kept materials pulled forward, or rungs 2 to 5 held until then (D) | M, or S to hold | low | 5.25M of misleading shelf fixed | L38 | COMPUTED paybacks above |
| **Medium** | Soil tiers removed (C) | S to M, server | low | One gate a crop. Removes a P1 cause | none | EVIDENCE: the b510 note |
| **Medium** | "Train at home" row (H) | S | none | Dummy owners set it once | L19 | EVIDENCE: `hunt-after.js` |
| **Medium** | Three looks (E) | 2 maps of art | low | Deeds are visible | L45, art queue | HYPOTHESIS |
| **Medium** | Farm words: each seed and each Tend result says what it is worth to the hunt | S | none | The home-to-hunt link is finally said | none | EVIDENCE: `26-home.md` §6 dead moment |
| **Low** | Camp's name or picture | S | none | First screen is honest | none | EVIDENCE: played in 26 |
| **Low** | Potato and Moonbloom get a hunt consumer | S, rows | low | Two dead-end crops | items review | COMPUTED: 38 and -545 gold a bed a day |
| **Remove or simplify** | The rested bank (G) | S to M, server and edge | low, an edge deploy | Dead writes and a dead module gone | platform review | EVIDENCE: `restedQuantum: 0` at both callers |
| **Remove or simplify** | Watering leaves the bed row, stays in Tend | S | none | One button fewer | L09 landed | EVIDENCE: 1,361 presses |
| **Remove or simplify** | Dead perk keys (`flameSpeed`, `buffDuration`, the speed keys after L38), `ROOM_RUNG_EXTRAS`, the `farm_yield` buff | S | none | The rung engine carries only what pays | L38 | EVIDENCE |
| **Defer** | Curing (B) | M to L | medium: a chore if built without a standing order | Unknown until T7 is measured | L32 linings, phase B | HYPOTHESIS both ways |
| **Defer** | Visiting | M | low | Needs the Hall first | the Hall | HYPOTHESIS |
| **Defer** | Dropped seeds (F) | S a seed | low | Needs the staged grounds | Morrow Hills | HYPOTHESIS |

**Where only real players can tell.**

| Question | The playtest that tells |
|---|---|
| Do resting heroes really work all 12 hours once Carry on and job counts exist | Idle share of hero life in the Discord playtest. 59% today. Under 25% means the town model holds and curing has a case |
| Is Tend a pleasure or a non-event | Farm visits a day and beds planted over beds owned, before and after 1017 |
| Do players mount or sell | First Trophy drop after the Hall ships |
| Does anyone buy a rung that says "worth it on costly recipes" | Rung 2 buys among rung 1 owners, by the recipes they run |
| Does a look sell a deed | Manor and Castle purchases in the two weeks after the maps |

## 7. Tyler decides (phase A. Section 10.8 replaces this list)

Each is one recommendation, its reason, and the strongest alternative in one line.

1. **Curing.** Recommend: do not build it in this program, and take the Cellar off sale today. Reason: it is a timer and a second visit wrapped around one bench press, real heroes are idle 59% of the time, and the lining's own gold price is already about eight times the sink curing would be. Build it later only if phase B shows the best path wants more than 12 rested hours a day. Alternative: build L33 as you ruled on 11-18, with "keep these linings up" as a standing order so it is never a chore.
2. **The Trophy room.** Recommend: the Hall of Firsts. Wall room comes with the Keep and the Castle, the five mount rungs are not sold, and each piece pays a mounting fee. Reason: a wall with 2 to 6 places is not a collection, and a fee a piece is a sink that grows with every rare we add. Alternative: L51 as planned, mounts bought as five rungs for 695,000.
3. **Visiting.** Recommend: open it from the Homestead when it is built, after the Hall. Reason: a new player who walks into a friend's Manor wants one, and a wall gated behind 2.5M is seen by nobody. Alternative: the Castle opens it, as ruled in 26-11, so the Castle has a reward of its own.
4. **Soil tiers.** Recommend: remove them. Reason: the crop's Farming level already paces it, the tier's own rule is "never the gate", and it is the gate that zeroed farming for ten days. Alternative: keep them as a 130,500 gold sink.
5. **Home looks.** Recommend: three looks (cottage, manor, castle), two new maps. Reason: ground art is the critical path and two maps give both big deeds a face. Alternative: a map for each deed, four new maps, as L45 says.
6. **The 16 speed rungs.** Recommend: move the kept-materials swap ahead of the lining work, and if it cannot move, hold rungs 2 to 5 of the four bench rooms now. Reason: they are on sale today and never pay back. Alternative: leave them on sale until L38 lands in its wave.
7. **Dropped seeds.** Recommend: a sample of two with the Morrow Hills, Moonbloom first. Reason: nothing a hunt drops reaches the field today, and nothing a farmer grows is worth trading. Alternative: all seeds stay Shop goods and Farming past 75 stays an XP chase.

Not a call, because it is yours and ruled: training items for Crowns and Premium's daily item. Not a call, because it is plain cleanup: the rested bank, the dead perk keys, the "train at home" row.

## 8. For other areas

| To | What |
|---|---|
| Economy | If curing is deferred, the plan's sink list (30-plan.md lines 46 and 105) loses 3.0M one-time and about 0.3k a hero-hour. The Hall's mounting fee is offered in its place. The soil tiers' 130,500 leaves. Size the fee coefficient with me in phase B |
| Economy | `cook_moon_elixir` makes 914,063 gold an hour at the Shop bid from 2 Moonbloom and 1 Magic Essence (`home.mjs benches`). The field caps it at about 12 a day an account, about 31,000 gold a day (COMPUTED). Check it against the shop-as-a-floor rule |
| Items and crafting | Kept materials at 8% on rolled jewelry, salts, linings and whetstones: confirm the 15% Yield cap covers every rolled row. Potato and Moonbloom need a hunt consumer. Meals were made once each by real players: if meals are cut, wheat and potato lose most of their recipes and two rungs that ask for Wheat Bread and Field Rations need new costs |
| Items and loot | The Hall needs a "mountable" flag on Trophy rows, uniques, Tower weapons and Catacomb pieces, and a first-kill record a boss. Dropped seeds need one Rare row a staged region |
| Combat | The yard's value rests on to-hit (L15). Nothing new from this review |
| Retention | The away card should list "the field is ready" and, after the Hall, "a first is waiting to be hung". Tend's result line should name hunted hours of mana |
| Social | Visiting from the Homestead for friends and party members. It is the first non-party use of the friends list |
| Platform | The rested bank accrues on its own watermark beside the accrual and can never pay. Remove the column and the edge accrual. Training on the combat engine is already L19's |
| Game Director lane | Home's answer to the from-scratch question: three jobs (Make, Keep, Show), 6 rooms not 8, a wall that grows with content, no speed, no curing timer |
| Art | Two home maps (manor, castle) with wall tiles for the Hall. The Camp's picture or name |

## 9. Evidence and hypotheses

| Label | What | Source |
|---|---|---|
| EVIDENCE | Every price, rung, perk, crop, payback, fee and training row | `node tools/balance-program/home.mjs all` on `set/v0.2.144`, reading `src/data/homestead-tiers.js`, `perks.js`, `shops.js`, `gold-ladders.js`, `gold-sinks.js`, `training.js`, `gathering.js`, `recipes.js`, `src/core/farm.js` |
| EVIDENCE | What is landed: deed prices, held rooms, bag rungs at 10, Tend | `home.mjs ladder` and `storage`, `HELD_HOME_ROOMS`, `src/data/text/farm.js` line 84 |
| EVIDENCE | Idle 59%, a third of supplies home-made, farming used by all four people, 1,361 waters, 812 withdraws, House rooms at rung 4 on two accounts, yard never paid, dummy bought once, meals made once | `10-real-players.md` §1, §6, §7. Past Level 46 it is one person |
| EVIDENCE | Farming at zero for ten days, caused by the plot tier gate | `src/core/farm.js` b510 note, CLAUDE.md §3.4 |
| EVIDENCE | The rested bank cannot pay | `ROOM_RUNG_EXTRAS` is empty in `perks.js`. `restedQuantum: 0` in `accrue-artisan.js` line 184, `accrue-gather.js` line 135, `src/core/member.js` lines 220 and 230 |
| EVIDENCE | No "train at home" choice | `src/data/hunt-after.js` `AFTER_CHOICES`: one training row, place `yard` |
| EVIDENCE | One cottage for every deed. The wall passes no trophies | `src/data/world/house-layouts.js` `HOUSE_TEMPLATES`. `26-home.md` §4 |
| COMPUTED | Kept-materials paybacks (2,800, 121, 119, 784 bench hours). 21 of 30 rungs on sale. 5,250,000 in speed rungs. Moonbloom elixir gold a day | Arithmetic here on the `home.mjs` tables. Not played |
| RULED | 26-1 to 26-11 approved (11-20). Curing as a gold sink (11-18). The yard and dummy (11-08, 11-14). 12 hunted hours a day (11-21). Town hours 12 (call 13). One home an account (10-15). Shared farm (10-23). Regrowing crops (10-26) | rulings of record |
| HYPOTHESIS | Players will mount rares instead of selling them. A look sells a deed. Visiting raises deed purchases. Dropped seeds make the field part of trade. Rested hours are not scarce in real play once Carry on exists | §6 "only real players can tell" |
| HYPOTHESIS | Every row of the traces in §5 | To be measured in phase B with `progression-grid --diff` and the town model |
| NOT DONE in phase A | No play, no grid, no browser. `51-baseline.md` had not landed and was not read. The Hall's fee and wall sizes are unpriced until `atlas.json` is read for mountable rows | |

## 10. Phase B: layers, the other reviews, and what the matrix can see

Phase B of `lane/d-review-home` (2026-11-21). Merged `set/v0.2.144` at f5a42fdc5. Read: 44 (sections 5, 7, 8), 46, 47 (rows 5d, C11, C19), the home lines of 52 to 57 and 59, `docs/design/itemization-plan.md` section 5 (House curing) and its section 13 answers. Time is on the 12 hour frame: where a number is in "days" it is a calendar day of a hero that hunts 12 hours and rests 12, read from `paths.json` (T7, `townGold`) or 50-standards section 2.7.

### 10.1 Where 44, 46 and 47 already decided, and whether I agree

| Who | What they decided in Home | Do I agree | What it changes here |
|---|---|---|---|
| 47, C11 | Do not ask about curing a third time. Build L33 last, outside the beta gate, sized on the T7 reading. Take the Cellar's food rungs off sale now | **Yes. I withdraw the call.** Tyler ruled it on 11-18 and again with prices in 26-7 | Call 1 of section 7 is now only "the Cellar off sale today". Row 50 stays DEFER, meaning "last in the lining work", not "maybe never" |
| 47, C19 | The find list pays a line on Honors and a mount in the Hall of Firsts | Yes | The Hall has a second review behind it |
| 44, `P-X26` and the progression review's patch `progression-3-rested-off.json` | The rested bank fills and pays nothing. Removing it moved no number in 207 cells | Yes. It is my row 28 measured | EVIDENCE now, not a reading of the code. Removal is free |
| 44, `P-X30`, roadmap R5 | The yard fee in the code (50 + 6 a level) is not the ruled fee (100 a level). Build it | Yes | Row 51. No call |
| 44, call 15, `P-X28` | The yard's one flat rate makes it worthless near skill 100. Let the rate follow a share of the skill level's cost. Tyler's call, it changes the 11-14 ruling | **Yes, and it changes my verdict.** Section 10.7 | Row 52 moves from KEEP to REDESIGN |
| 44, judged mechanic "sinks as a share of band gold" | Tempering, Hallmarks and linings ride the gear curve. "The House stays typed content. Its rooms are things, not a curve. It is still judged by the same band" (`E43`) | Yes | Deeds, rungs and chests stay content rows. The one new Home price that is NOT a thing is the Hall's mounting fee, and that belongs on the wage curve (R15) |
| 55, change 4 and call 4 | The House dummy halves the yard fee and does not end it. At the ruled fee a 150,000 dummy pays back in 2.8 days and deletes the one sink that never ends | **Yes. I change sides.** Phase A kept the dummy as "no fee" | Row 53 moves from KEEP to REDESIGN. Section 10.7 |
| 54, for the home review | Curing slots are for linings. Belts and cloak perks give the Workshop's speed a worn product | Yes | Speed lives on tools, food and worn pieces (the one Speed pool of 26-2). Rooms sell kept materials. The two do not overlap |
| 56, section 4.2 | Honors is the content of the Hall of Firsts | Yes | The Hall reads Honors rows. It needs no second record of firsts |
| 59, change 1 | One kill ladder with Tamsin as its face. Its top stage hangs a mount in the rebuilt Trophy room | Yes | A third source of mounts: drops, firsts, and a creature's top stage |
| 57, for the home review | The House and the clan castle want the same goods and the same fantasy. They could share art stages | Yes for art. The clan castle is not mine | The manor and castle maps should be drawn so a clan hall can reuse the tiles |

### 10.2 Where the Game Director (46) and I reached the same place independently

Neither lane read the other in phase A. Agreement is evidence.

| 46 says | 58 phase A said |
|---|---|
| "House rooms: eight ladders of plus 10% speed ... Simplify. A room should open something and not sell speed" (line 123) | Speed is not something a home can honestly sell. Rungs 2 to 5 become kept materials or are held |
| "Farming. Keep, fix the pressing" (line 127) | KEEP. Tend landed. Watering leaves the bed row |
| "Worn in, chest reforging, linings, curing: six ways to add a few percent ... Build linings and fold the rest" (lines 143, 251) | Curing is the weakest planned system in Home |
| "The House property ladder and Storage chests. Keep" (line 102) | KEEP |
| "Training: four forms of one thing. Simplify to the yard and the dummy as play" (line 124) | The yard and the dummy stay. Items are Tyler's money call |
| Seam 9, dead ends: the Trophy room, meals | The Trophy room is rebuilt as the Hall. Potato and wheat feed meals nobody makes |
| The home and the Hearth are one of the seven things the game is (line 77) | Home belongs |

One difference. 46 lists "the Cellar cures" as what that room should open, and in the same file folds curing away. 47 settled it: curing is ruled, built last. I follow 47.

### 10.3 Where I conflict with another review

| Conflict | Side A | Side B | I recommend |
|---|---|---|---|
| The House dummy | 58 phase A: keep it as ruled on 11-08, no hourly fee | 55: it halves the fee | **55.** The fee is the only sink that grows forever. A 2.8 day payback is not "wildly expensive" |
| The yard's rate | 58 phase A and 56 row 22: keep the flat 30,000 | 44 call 15: the rate follows a share of the skill level's cost | **44**, with one condition from Tyler's own 11-14 words: the yard never passes about half of what hunting pays the same skill at the same level |
| Curing | 58 phase A and 46: do not build | 47, 54, 56: ruled, build it, last | **47** |
| War Crown | The itemization plan keeps War Crown out of the gem cuts "because the House uses it" (plan line 296). Its only House use is Trophy room rungs 4 and 5, which the Hall removes | | The War Crown becomes a mountable piece. Items review to confirm it needs no other use |

### 10.4 Every top proposal at its layer

Formula ids and roadmap steps are 44's. "None" in the formula column means the proposal adds or removes content and touches no shared formula, so its success is a HYPOTHESIS about content and only players can settle it.

| # | Proposal | Layer | 44 formula | Roadmap step | Matrix can see it |
|---|---|---|---|---|---|
| 1 | Hall of Firsts: wall room by deed, a mountable flag, firsts read from Honors | Content rows | none (`E43` typed House content) | L51 | No. HYPOTHESIS |
| 1b | The mounting fee | Coefficient on the wage curve: hours of the piece's band wage | `E43` today, R15's wage curve when it lands | R15 | No. Computed when R15's curve exists |
| 2 | Cellar off sale | Content row (`HELD_HOME_ROOMS`) | none | L06 follow-up | Yes as an identity. Patch `home-1` |
| 3 | Soil tiers removed | Removes an exception: a second gate table over the crop's level. 44's register does not list it. I file it as a class 4 row (accidental complexity) for the register | proposed `X-PLOT-TIER` | R1 | No. A played first hour |
| 4 | Room rungs sell kept materials | Content rows (`ROOM_PERKS`) over one existing formula (`craftSave`), plus the one stacking rule | R20's one modifier table: the Speed pool and the Yield pool are two rows of it | L38, R20 | Yes as an identity. Patch `home-1` |
| 5 | Three home looks. Visiting from the Homestead | Content rows (`HOUSE_TEMPLATES`), art | none | L45 | No. HYPOTHESIS |
| 6 | Rested bank removed | Removes a dead formula | `P30`, `P-X26` | R1 | Yes. Measured by the progression review: 207 cells, nothing moved |
| 7 | "Train at home" after a hunt | Content row (`AFTER_CHOICES`) | none | L19 | No |
| 8 | The yard: ruled fee, a rate that follows the skill curve, the dummy at half fee | Coefficients on the skill curve `P03` and the wage curve | `E42`, `P-X28`, `P-X30` | R5 (fee), R15 (rate and price in hours) | Partly. The worth of +10 skills is measured below. The fee is computed by 55 |
| 9 | Seeds that drop | Content rows (a seed, a crop, a drink, a drop row) | `C-CAST-POWER` reads the drink | with the Morrow Hills | Its ceiling, yes. Patch `home-2` |
| 10 | Bench fee, deeds, chests, Garden beds | Unchanged. `E33` is a formula, `E43` is typed content | `E33`, `E43` | none | No |

### 10.5 Measured

The matrix plays hunts. It has no home axis: no cell holds a room, a bed, a bench or a rested hour. So it can answer two things about Home. Does a Home change reach a hunt when it should not (an identity run). And what are home-made supplies worth to a hunt (the one place Home is meant to reach it). Both runs: `balance-matrix.mjs --diff <patch> --subset --workers 2`, 207 cells, 1 seed x 1 h, the same dice before and after. The calibration caveats printed on each run apply: the harness four kills 11% more than the real one, its tank takes 96% of the damage against 69%, and its store bill is 1.87 times the real one. So party gold and store numbers below are upper bounds, and cells from Level 185 are PROVISIONAL.

**M1. Patch `home-1` (identity): rungs 2 to 5 of the four bench rooms give kept materials in place of speed, and the Cellar's food rungs pay nothing.**

| | |
|---|---|
| Patch | `tools/balance-program/patches/home-1.json`, 25 row edits in `src/data/perks.js` |
| Layer | Content rows over `craftSave`. Proposals 2 and 4 of section 10.4 |
| Before and after | 207 cells identical on every metric. Calibration row for row identical |
| Flags | IMPROVED 0, REGRESSED 0, UNINTENDED 0 |
| Gate | PASS, "the diff is empty" (44 section 6.2, kind identity) |
| What it proves | No room perk reaches a hunt in the harness. The swap and the Cellar hold are free for combat, pace, survival and hunt gold. "A home never grants a hunt anything" holds for these keys |
| What it does not prove | Anything about the town. The harness heroes own no rooms, so this run cannot see a bench. The payback numbers of section 2.3 stay COMPUTED |

**M2. Patch `home-2` (a measurement, not a proposal): every store supply works like its home-made partner.**

`storeSupplyShare` (formula `C-CAST-POWER`, `BASIC_EFFECT_SHARE` 0.75 to 1.0). The harness buys from the store. Raising the store's share to 1 plays every cell as if the hero were fully supplied from home: the farm's drinks, the Kitchen's food, the Library's runes, fletched arrows. It is the value of Home to a hunt today, and the ceiling for any better home drink.

| Median change | Level XP an hour | Damage taken | Net gold an hour | Store bill | Kills |
|---|---|---|---|---|---|
| Lone, all ways | +3.6% | -1.8% | +3.5% | -0.1% | +3.4% |
| A four | +5.8% | -15.7% | +22.6% (upper bound) | -9.3% | +5.9% |
| Normal | +3.9% | -4.6% | +5.5% | -2.8% | +3.9% |
| Deadly | +9.6% | -13.9% | +14.9% | -8.9% | +9.3% |
| Mage, lone | +7.8% | -4.7% | +16.9% | -3.6% | +7.7% |
| Healer, lone | +4.9% | -17.1% | +18.2% | -4.8% | +4.9% |
| Bow, lone | +6.2% | -2.6% | +15.3% | -2.1% | +6.2% |
| Hammer, lone | 0 | 0 | 0 | 0 | 0 |
| Early, mid, late, high Levels | +3.3, +3.6, +4.1, +4.7% | | | | |

| | |
|---|---|
| Flags | IMPROVED 98, REGRESSED 223, UNINTENDED 0 (every band was targeted, because this run measures and proposes nothing) |
| REGRESSED, traced | Almost all are pace bands that were already fast and got faster (P1, P2, P6.4, P9.deadly: a four on Deadly was 1.5 to 3.6 of the lone hero and moved up 3 to 13%), and survival bands that were already too safe (S1, S4, S5). A stronger supply makes a fast, safe cell faster and safer |
| IMPROVED, traced | Gold bands: G-2 on most lone cells, G-9 and G-1 at Level 60, G-3 on LOW fours |
| What it says | A hero fully supplied from home levels 3.6% faster alone and 5.8% faster in a four, 9.6% on Deadly, and a four takes a sixth less damage. That is about the size of one gear step. Home already gives the hunt real power, through supplies, and it is ruled (the store's 0.75) |
| What it changes | Dropped seeds (proposal 9) must not raise the 1 / 0.75 edge. A seed drink sits on the existing drink ladder at the next Level's size. A drink above the ladder would stack on a +6 to +10% party edge |
| The hammer reads zero | The harness hammer's bar holds no supply with an effect. Its food is bought by hit points. So Home's worth to a lone hammer is gold only, and the matrix cannot see it |
| Not proved | What it costs to be fully home-supplied. `paths.json` T7 says the best path uses 2.1 to 4.4 of 12 rested hours in a party, so the hours exist. Whether a real four makes all of its supplies is REAL at a third (`10-real-players.md`) |

**M3. The yard, +10 main skill and Defense, re-measured on today's to-hit** (`measure.mjs what --at <point> --seat <seat> --patch '{"skillBump":10}'`, 2 seeds x 1 h, paired dice. The matrix patch format cannot move a hero's skill line, which lives in tools, so this is the program's older harness).

| Cell | Level XP | Damage taken | 26-home.md before to-hit |
|---|---|---|---|
| Glade 30, lone | x1.049 | x0.848 | x1.042, x0.640 |
| Glade 30, four on Deadly | x1.039 | x0.757 | x1.069, x0.416 |
| Slake 60, lone | x1.038 | x0.861 | x1.035, x0.761 |
| Slake 60, four on Deadly | x1.073 | x0.694 | x1.076, x0.592 |
| Hold 105, lone | x1.030 | x0.918 | x1.022, x0.998 |
| Hold 105, four on Deadly | x1.018 | x0.877 | x1.033, x0.945 |

| | |
|---|---|
| IMPROVED | The worst case is gone: +10 Defense cut a Glade four's damage by 58% and now cuts it by 24%. RULED 11-18 called 30 to 59% "definitely NOT" intended |
| Still outside the plan | 30-plan.md line 90 expects "14% less taken at Level 10 falling to 3% at 105". Measured: 15% at 30, 14% at 60 and 8% at 105 alone, and 24%, 31% and 12% in a four. The Slake four at 31% is still at the edge of what Tyler ruled out. For the combat review |
| UNINTENDED | In the Glade four the store bill rose from 6,054 to 11,691 gold an hour with +10 skills, and net gold went from +4,902 to -401. HYPOTHESIS: ten more skill levels open the next rune tier, and the harness buys the dearer rune. If so, training a mage's Magic at the yard raises its rune bill. For the economy and combat reviews |
| What it says for Home | +10 skills is worth +2 to +7% Level XP. At the ruled fee, +10 at skill 30 is about 80,000 gold (`26-home.md` section 8), so the yard buys XP at about the price of Tempering's cheap end. The fee is right. The value is real at 30 to 60 and thin at 105 |

**Measured by others, used here.**

| What | Who | Result |
|---|---|---|
| The rested bank removed | 56, `progression-3-rested-off.json` | 207 cells, no number moved. Removal is free |
| The yard fee as a share of gold | 55 section 10.4 | A lone hero that trains all 12 rested hours pays 36 to 39% of its gold in, inside G-9. With the dummy at half fee it pays back in days, not hours |
| Rested hours the best path wants | `paths.json` bands T7 | A party hero 2.1 to 4.4 of 12. A lone hero 6.9 for best in slot and 12 for MID. Rested hours are NOT scarce for a party and ARE at the limit for a lone MID hero |
| What a rested hour earns | `paths.json` `townGold` | 1,654 gold at Level 10, 2,904 at 30, 4,900 at 60, 8,431 from 88 on. That is 19 to 37% of a hunted hour (band T2 is 15 to 35%) |

### 10.6 The fixtures that would measure Home

The matrix cannot judge a room, a bed or a deed. These five fixtures would. None needs a new formula. Each is named so the baseline lane can build it.

| Fixture | What it plays or computes | What it would settle |
|---|---|---|
| **H1. A supplies axis on the matrix cell**: `supplies: store / home / mixed` | The same cell with home-made supplies, charged at the rested hours they cost times `townGold` | M2 without the "at store prices" caveat. The true net gold of a home-supplied four. Standard T3 |
| **H2. The rested day**, closed form, an extension of `home.mjs`: `home.mjs payback --frame 12` | 12 rested hours a hero split by the solver's T7 plan across bench, node, farm and yard, with each room rung switched on and off | Payback of every rung in DAYS on the 12 hour frame, by recipe. Whether kept materials pays for the recipes a path really runs |
| **H3. The field against the bar** | Beds x crop x two visits a day, against drinks a hero-hour by way read from the matrix cells | The share of each way's drink bill a field covers at each Level. The right number of beds. Whether Garden rungs 4 and 5 are worth their price |
| **H4. A yard step on the matrix**: a `step:yard+10` cell beside the gear steps | The same cell with the main skill and Defense 10 over the line | M3 inside the matrix, with bands and flags. Guard lines G11 and G12 |
| **H5. The first hour with 500 gold** | A played new account: turnips, the Homestead at 400, with and without the soil tier | Proposal 3. Only a played run can tell |

The Hall of Firsts, the looks and visiting have no fixture. They are telemetry and playtest questions, listed in section 6.

### 10.7 Verdicts that changed since phase A, and why

| Row | Phase A | Phase B | Why |
|---|---|---|---|
| 50 Curing | DEFER, with a call "do not build it" | DEFER, the call withdrawn | 47 C11: ruled twice. And T7 answered my own test both ways: a party hero has 8 spare rested hours, so a slot is not capacity for the players who can afford one. When L33 is built it must be a standing order ("keep these linings up"), or it is a chore |
| 52 The flat yard rate | KEEP | REDESIGN (Tyler's call, 44 call 15) | 44 measured 51 to 243 yard hours a skill level from 75 to 100. I had called that "it caps itself". On a game with no skill cap it means the yard and the dummy stop mattering for most of the game |
| 53 The House dummy | KEEP as "no fee" | REDESIGN: half the fee | 55 computed a 2.8 day payback at the ruled fee. A thing that pays for itself in three days is not a sink |
| 28 The rested bank | REMOVE, read from code | REMOVE, measured | 207 cells, nothing moved |
| 12, 15, 17, 19 Bench rungs | REDESIGN, computed | REDESIGN, and free for the hunt | M1: identity |
| 49 Dropped seeds | ADD | ADD, with a limit | M2: home supplies are already worth +6 to +10% to a party. The seed drink stays on the ladder |
| 23 The Hall of Firsts | REDESIGN | REDESIGN, three reviews behind it | 47 C19, 56 and 59 each feed it |

Counts after phase B: KEEP 34, REDESIGN 12, REMOVE 5, MERGE 1, ADD 4, DEFER 2.

### 10.8 Tyler decides, after phase B

This list replaces section 7. One recommendation each.

1. **The Cellar.** Recommend: off sale today. Curing is built as you ruled, last in the lining work, as a standing order. Reason: its five rungs sell an effect the plan cuts. Alternative: leave it on sale until L33.
2. **The Trophy room.** Recommend: the Hall of Firsts. Wall room from the Keep and the Castle, no mount rungs, a mounting fee priced in hours of the piece's band wage. Reason: three other reviews feed it and a fee a piece never runs out. Alternative: L51 as planned, five mount rungs for 695,000.
3. **The House dummy.** Recommend: it halves the yard fee, forever. Reason: at the ruled fee "no fee" pays back in 2.8 days and ends the one sink that grows. This changes your 11-08 words. Alternative: keep "no fee" and price a skill in the tens of millions.
4. **The yard's rate.** Recommend: the rate follows a share of the skill level's cost and never passes half of what hunting pays that skill. Reason: at one flat rate a level takes 51 to 243 yard hours from skill 75. This changes your 11-14 ruling. Alternative: keep the flat 30,000 and accept that the yard is a tool for new heroes only.
5. **Soil tiers.** Recommend: remove them. Reason: one gate a crop, and it is the gate that zeroed farming. Alternative: keep them as a 130,500 gold sink.
6. **Home looks and visiting.** Recommend: three looks, two new maps, and visiting from the Homestead once the Hall exists. Reason: ground art comes first, and a wall behind 2.5M is seen by nobody. Alternative: a map for each deed and visiting at the Castle, as L45 and 26-11 say.
7. **The 16 speed rungs.** Recommend: swap them for kept materials ahead of the lining work, or hold them now. Reason: on sale today, never pay back, and M1 shows the swap costs the hunt nothing. Alternative: wait for L38's wave.
8. **Dropped seeds.** Recommend: a sample of two with the Morrow Hills, each drink on the existing ladder. Reason: nothing a hunt drops reaches the field. Alternative: Shop seeds only.

Handed on, not calls: +10 Defense still cuts a Slake four's damage by 31% (combat). A trained mage's rune bill may double (economy, combat). The War Crown loses its House use (items).
