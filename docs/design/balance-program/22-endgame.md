# Balance program 22: Endgame modes

Dive of `lane/d-balance-endgame` (game-designer, 2026-11-20), cut from `set/v0.2.143`. Eight systems: tower, catacombs, hearth-chest, chest-reforge, bosses-halls, boss-calls, scaled-hunts, old-dungeons. No game code, data or migration was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED, and FORMULA past Level 175.

The measuring tool is `tools/balance-program/endgame.mjs` (new, this lane): `rows`, `chest`, `account`, `climb`, `scaled`, `scaledplay`. Every climb below is the real settle through `tools/balance-sim/cell.mjs`, the played profile, own stock.

**Two marks used throughout.** "Re-measure after 21": the number rests on today's to-hit, which the combat dive is changing. "Re-price after 24": priced on the economy dive's gold model as pushed at `d9554e87f` (question 1 only), to be re-read when that file is finished.

**Inventory corrections (the registry must change).**
- `scaled-hunts` is listed live. Its switch is seeded `off` (`2027-03-21-scaled-hunts.sql`) and the 11-19 complete look says it is switched off. Zero real uses is the switch, not the players. Treat as dark until the Coordinator reads `hr_feature_switches`.
- `scaled-hunts` "stops at Level 50" is stale. `topLevel` is derived from the top open ground and reads 110 today (MEASURED, `endgame.mjs scaled`).
- "The Tower pays 50% XP and the Catacombs 37.5%" is one number said two ways. Both modes pay 375 permille of a kill (`session-modes.js`). 50% was the target for an hour, alone. The window says "Kill XP 37.5% of hunting" on both tabs (PLAYED).
- The itemization plan's section 6 says Tower weapon power was "raised in lane/d-defense-tower". It is not on this set: every Tower weapon is its own tier's twin plus the skill (`endgame.mjs rows`).
- A system the list may lack: the **Key Ring** (25,000 gold a hero, a placeholder price, `gold-ladders.js`). If the economy dive's gold-sinks card does not hold it, it needs a row.

## One screen

| Verdict | Count | Systems |
|---|---|---|
| FIX | 4 | tower, hearth-chest, boss-calls, scaled-hunts |
| BUILD | 1 | chest-reforge |
| HOLD | 1 | catacombs (not before it is a different decision from the Tower) |
| KEEP | 1 | bosses-halls |
| CUT | 1 | old-dungeons |

**What the dive found, in five lines.**
1. **The Tower is thirty minutes a week, not a progression.** One climb from floor 1 fills a hero's six opens for the week; every climb after it pays a quarter to a third of hunting XP, no gold, and keys that cannot be opened. The first climb of a week is worth about 4 REF hours of gold for half an hour; the second is worth nothing.
2. **The key ladder is finished by Level 50 and the floor ladder by Level 80.** A four climbs 60 to 70 floors past its Level, so it holds Platinum keys (Level 88 weapons) at Level 50. Past Level 80 the heat patch walls everyone: a Level 80 four tops out at floor 149, a Level 240 four at 179 (FORMULA).
3. **The chest's gear does not matter.** A Platinum weapon is +1.0 to +1.7% Level XP (ruled "pretty major upgrades"; a tier is +3 to +7%). The whole Platinum set, weapon, helmet and boots, is +2.6% for a hammer and +0.9% for a Mage. It takes an own four 20 weeks median to finish.
4. **Bronze, Silver and Gold pieces arrive after the hero has outgrown them.** A band lasts the real player 6 to 8 days; the own piece of a band takes 1.3 to 3.8 weeks.
5. **The Catacombs are the Tower again.** Same engine, same curve (within 10 floors), same XP (within 10%), same six opens. As built it doubles the weekly errand and adds no decision.

**The five changes that matter most.**

| # | Change | Why | Size |
|---|---|---|---|
| 1 | **The Tower's curve is one row, "Levels a floor", and the heat patch goes.** Two Levels a floor measured today: a four tops out 3 to 18 floors past its Level from 10 to 105, and reaches the Silver, Gold and Platinum landings at about Levels 25, 58 and 100, near where their weapons are worn (45, 75, 88) | Keys become a path tied to Level again, the board moves with every Level, and nothing is patched per region | M, engine and one generated table. Re-measure after 21 |
| 2 | **Build chest reforging before anything else in this domain, and give chest weapons the next tier's numbers.** A piece becomes a line a hero carries up with keys, and it is worth +4 to +8% when worn | It is the only thing that turns keys into months of progress, and it is the ruled answer to "pretty major" | L |
| 3 | **A weekly run on a standing order.** "Climb the Tower" joins the after-the-hunt plan; a hero with opens left and keys held uses them with its remembered stoke | The real player has two visits a day of four minutes for four heroes. Today a week costs it about 14 presses that never change | S to M |
| 4 | **Hold the Catacombs until the descent asks a different question.** Recommended: you fight on what you carried down (no store below), so depth is a packing decision and the kitchen has a consumer | Two copies of one mode is one mode with twice the chores | M |
| 5 | **Small repairs.** Scaled XP by ground fit (the scaled Warrens is the best lone XP at 80 and 105); Call out without the gold fee (the paid-roll flag goes away); the old dungeons cut | Each is a named rule broken or a legal flag for one data row | S each |

### The ten questions

**1. The Tower and the Catacombs as progressions.** MEASURED, `endgame.mjs climb --levels 10,30,50,60,80,105,118,175 --who four,hammer,mage,healer --seeds 3 --minutes 120` (heat on, from floor 1). Past 175 FORMULA.

| Level | A four: top floor | Past its Level | Minutes | Keys a hero, one climb | Lone hammer: top | Lone Mage: top | Lone Healer: top (minutes) |
|---|---|---|---|---|---|---|---|
| 10 | 38 to 39 | +29 | 8 | 3 Bronze | 19 to 20 | 15 to 23 | 26 to 46 (13 to 35) |
| 30 | 89 to 94 | +62 | 20 | 3 Bronze, 3 Silver, 2 to 3 Gold | 35 to 41 | 44 to 51 | 54 to 68 (26 to 39) |
| 50 | 110 to 120 | +66 | 26 | the nine, 2 to 3 Platinum | 44 to 52 | 63 to 65 | 84 to 109 (47 to 82) |
| 60 | 129 | +69 | 28 | the nine, 3 Platinum | 54 to 56 | 69 to 89 | 109 (69) |
| 80 | 149 to 150 | +69 | 32 | the nine, 5 to 6 Platinum | 64 to 68 | 89 to 99 | 112 to 128 (66 to 83) |
| 105 | 159 to 163 | +55 | 33 | the nine, 6 to 7 Platinum | 79 to 83 | 102 to 109 | 112 to 124 (59 to 74) |
| 118 | 159 | +41 | 33 | the nine, 6 Platinum | 79 to 89 | 107 to 109 | 129 to 136 (76 to 88) |
| 175 | 169 to 178 | -1 | 35 | the nine, 7 to 8 Platinum | 99 | 109 to 115 | 144 to 147 (95) |
| 240 FORMULA | 179 | -61 | 35 | 8 Platinum | | 128 | |
| 400 FORMULA | 203 to 208 | -195 | 39 | 11 Platinum | | 168 | |

Nearly every climb ends one floor short of a landing: the Keeper is the wall, so progress comes ten floors at a time.

*The chase, by player.* Weeks at the real pace (Level 50 in 72 hunted hours, 75 in about 110).

| Player | The floors | The keys | The chest | What ends it |
|---|---|---|---|---|
| New (1 hero, 2 h a day) | The door is Level 10, about its second week. Alone it tops out at floor 20: two Bronze keys a five-minute climb | Bronze only until about Level 30 | Three climbs fill a week. Any Bronze piece 0.7 weeks median, its own 1.3. PLAYED: one climb cost 742 gold of store food in 7 minutes, 6.4k an hour against 1.8k of free gold | It quits at Level 7 to 9 (REAL) and never meets the door |
| Own four (3.3 h a day) | Floor 39 at Level 10, 92 at 30 (about day 12), 118 at 50 (day 22), 149 at 80. Then 25 more floors in the next 95 Levels | Platinum by about week 4. On today's slot prices it is one hero until about Level 30 and a four near 50 (CITED 24), so the jump from Bronze to Platinum is the day the fourth slot is bought | Own Platinum weapon for all four: 12 weeks median, 22 at the 90th. With Catacomb armor 20 and 29 | The heat near floor 150 to 160. Then the wait |
| Heavy four (8.4 h a day) | Level 50 on day 9, 75 on day 13: floor about 145 by the end of week 2 | Platinum in week 2 | The same 12 and 20 weeks: opens are capped a week, so its hours buy nothing here | The same wall, four weeks sooner |
| Premium own four | As the Own four. Premium does nothing in this domain | | | |
| Ceiling (24 h a day) | As the Heavy four. Floors read power, not hours | | Six opens a hero a week whatever it plays | The cap |
| Buyer | As the Heavy four | Keys never trade | Buys the weapons and armor on the market: saves the 12 to 20 weeks, cannot buy a floor | Nothing it cannot earn. The line holds |
| Four friends | As a four. They start from the highest landing all four have reached | One six each | Pieces trade between them, so as the own four | The same wall |

So the honest length of the Tower today: **two to four weeks of floors, then 12 to 20 weeks of waiting on a 2% roll for +1 to +2.6%, played 30 minutes a week.** Titles are the only longer line: 100 opens is 17 weeks a hero, 500 is 83, 1,000 is 167 (READ FROM DATA).

**2. An hour in the Tower against an hour hunting.** Level XP an hour a head, Tower from floor 1 over REF (`01-model.md` section 5).

| Point | Lone hammer | Lone Mage | Four (REF on Deadly) | Keys an hour, a four | The week's six opens always hold (book value) | That in four-seat REF hours of gold |
|---|---|---|---|---|---|---|
| thicket 10 | 40.8k / 29.3k = **1.39** | 49.7k / 34.8k = **1.43** | 47.9k / 15.1k = **3.17** | 24 Bronze | 300 Cinders, 90 salts, 120 shrimp: 3.5k | 0.65 |
| glade 30 | 106.9k / 104.6k = **1.02** | 161.4k / 137.8k = **1.17** | 135k / 185k = 0.73 | 9 B, 9 S, 8 G | 3 Gold and 3 Silver: 1,350 Cinders, 25.4k | 3.8 |
| ford 50 | 0.59 | 0.75 | 178k / 530k = 0.34 | plus 5 Platinum | 3 Platinum and 3 Gold: 2,700 Cinders, 40.0k | 3.2 |
| slake 60 | 0.66 | 0.72 | 0.36 | plus 6 Platinum | 3 P and 3 G: 40.0k | 3.2 |
| pyre 80 | 0.52 | 0.56 | 262k / 688k = 0.38 | plus 10 Platinum | 5 P and 1 G: 3,300 Cinders, 43.7k | 3.7 |
| hold 105 | 0.52 | 0.52 | 296k / 938k = 0.32 | plus 12 Platinum | 6 P: 3,600 Cinders, 45.6k | 3.7 |
| rest 118 | 0.54 | 0.47 | 0.27 | plus 11 Platinum | 6 P: 45.6k | 4.4 |
| catacombs 175 | 0.41 | 0.38 | 0.24 | plus 13 Platinum | 6 P: 45.6k | re-price after 24 |

Book value is the items' `v` (the Shop's ceiling, CITED as a ceiling only; salts are also Tempering's input). The gold line is the economy model's own four (6.6k, 12.3k, 11.9k, 12.4k, 10.3k at 30, 50, 80, 105, 118). Re-price after 24.

- The real climb paid 0.26 of hunting at Level 73. The harness four reads 0.36 to 0.38 there against a REF four that is itself a floor (real fours run 1.3 to 1.6 times the harness). The two agree. The audit's "about 0.5" is the lone number, and no real player climbs alone.
- **It is neither a choice nor a chore: it is an errand.** Half an hour a hero a week is strictly better than hunting (about 4 REF hours of gold in guaranteed loot plus six rolls), and every minute after it is strictly worse. There is no hour at which a player weighs the Tower against a hunt.
- **At Levels 10 to 30 the Tower beats hunting for a hero alone**, with free deaths: 1.39 to 1.43 at Level 10 from floor 1, and 1.36 (hammer) to 1.61 (Mage) at Level 30 restarting on its own landing (`climb --from level`, attended: a press every 4 to 8 minutes). The design's own guard says no cell may pay more than hunting. The guard (`tools/balance-sim/tower-climb.mjs`) plays the ladder-kit hero, not the played one, so it cannot see this. Store food limits it for a new account (above); an alt fed by a main is not limited.

**3. Tower weapons sized.** MEASURED, `measure.mjs what --seat lone --hours 2 --seeds 3 --patch '{"gear":{"also":{"weapon":"<id>"}}}'`, x REF Level XP.

| Point (worn tier) | The Tower weapon of that Level | The NEXT tier's standard weapon | A key tier too low |
|---|---|---|---|
| glade 30 (tier 3) | | Mithril Warhammer x1.030 | Bronze Mallet x0.963 |
| ford 50 (tier 4) | Silver, Quarry Maul x1.010; Chandler's Wand x1.008 | Rune Warhammer x1.060 | |
| slake 60 (tier 5) | | Emberforged x1.045 | Silver Maul x0.950 |
| pyre 80 (tier 6) | Gold, Passing-Bell Hammer x1.010; Sexton's Wand x1.010 | Dawnsteel x1.071 | |
| hold 105 (tier 7) | Platinum, Hearth-Mason's Maul x1.015; Kindling Wand x1.011 | none exists | |
| rest 118 | Platinum x1.017; wand x1.005 | | |
| catacombs 175 (the weapon line) | Platinum x0.659 | | |

- A tier step is +3.0 to +7.1% here. A Tower weapon is +1.0 to +1.7%: a fifth of a tier. The skill is the weak lever: +10 main skill and Defense at ford is x1.035, +12 at hold x1.046 (`--patch '{"skillBump":N}'`), so no size of "+N skill" reaches a tier.
- **PROPOSED size:** a chest weapon carries the NEXT tier's numbers at its own wear Level, plus its skill. Measured from the columns above that is +4 to +8% when first worn, and +1% over the next tier's drop when the hero reaches it, which is exactly the ruled ceiling ("may be stronger than the NEXT tier's drop but that's probably about as far"). Platinum, with no tier above it, takes the weapon line's budget one band up (`tools/balance-sim/staged/weapon-line.js`), sized by the items dive.
- **Against the uniques:** Krell's two pieces measure x1.006 XP and x0.966 damage taken at hold (`--patch '{"gear":{"uniques":true}}'`). They are sidegrades today and stay so. Past 110 the weapon line leaves Platinum behind (x0.66 at 175), so every new region needs its key row in the same patch (the coherence pass's C6 already says so).
- The whole Platinum set at hold: hammer x1.026 XP, x0.980 damage taken; Mage x1.009 and x1.008. Two of the Mage's three attributes (fire and ice resistance) answer nothing Krell's Hold casts.

**4. The weekly gate.** RULED per hero and per family (11-14, 11-16), and built that way. It does not let a four-hero account roll four times at one piece: warmth is a hero's, and half of each hero's hits are its own family. `endgame.mjs account` (8,000 lives a row, no stoke, pieces shared inside the account), weeks median / 90th:

| Key | Own four: every hero's own weapon | Own four: every hero's own helmet and boots | Both | One hero: weapon | One hero: both |
|---|---|---|---|---|---|
| Bronze | 3 / 5 | 4 / 6 | 4 / 6 | 2 / 4 | 4 / 9 |
| Silver | 4 / 8 | 7 / 10 | 7 / 11 | 3 / 7 | 8 / 15 |
| Gold | 7 / 12 | 10 / 16 | 11 / 16 | 4 / 11 | 12 / 24 |
| Platinum | 12 / 22 | 18 / 28 | **20 / 29** | 7 / 20 | 21 / 43 |

The Heavy four finishes Platinum in 12 weeks (weapons) or 20 (with the Catacombs), the same as the Own four, because the gate is the week. Keep it per hero. The one hole is a hero that never climbed opening another hero's keys (the chest card, exploits).

**5. The curve to floor 400.** Today's engine. Re-measure after 21.

| A four at Level | Heat on (live) | Heat off | Two Levels a floor, heat off |
|---|---|---|---|
| 10 | 39 | 39 | 24 to 26 |
| 30 | 92 | 92 | 46 to 48 |
| 50 | 118 | 125 to 128 | 62 |
| 60 | 129 | 149 to 156 | 69 to 78 |
| 80 | 149 | 179 | 89 |
| 105 | 160 | 209 to 216 | 108 to 109 |
| 118 | 159 | 217 | 99 to 108 |
| 175 | 174 | 219 to 241 | 117 to 120 |
| 240 FORMULA | 179 | 259 | |
| 400 FORMULA | 205 | 299 (the table's last floor) | |

(`climb` in a scratch copy of the tree with `heat.perFloorPm` 0, and with `towerLevelOf` doubled; nothing committed.)

- Heat on, the board moves 56 floors between Level 80 and Level 400. A new region will not lift it: the patch compounds (x7.3 at floor 300) and heroes grow on a line.
- Heat off, the margin is +99 at 80 and 105, +55 at 175, +19 at 240, and under zero at 400. The ratio of top floor to Level falls from 3.9 at Level 10 to 1.3 at 175. That is the to-hit curve the combat dive owns, seen from the Tower: a hero's strength against a same-Level monster falls as Levels rise.
- **So the Tower needs no curve of its own.** If the combat dive holds that ratio steady, the Tower's top floor becomes a straight multiple of Level, and one row ("Levels a floor") places it. Today two Levels a floor already gives +3 to +18 over the Level from 10 to 105. The contract to hold after 21, PROPOSED: a set-up four tops out between its Level and its Level + 25 at every Level from 10 to 400, ten Levels of the party are worth about ten floors, and a lone hero's top is under the party's at every Level.

**6. The descent against the climb.** MEASURED, `climb --ground unmarked_bone_wing | unmarked_flooded_wing`.

| Level | Tower, a four | Bone Wing | Flooded Wing | XP an hour a head: Tower / Bone / Flooded |
|---|---|---|---|---|
| 30 | 92 | 99 | 99 | 135k / 150k / 158k |
| 60 | 129 | 139 to 141 | 129 | 211k / 236k / 237k |
| 80 | 149 | 152 to 158 | 149 | 262k / 291k / 297k |
| 105 | 160 | 159 to 166 | 149 to 159 | 296k / 324k / 323k |

Nothing makes it a different decision. The wing pick is a slot pick (which of two armor pieces the key leans to), made once. The one difference in play is that a lone Mage goes 20 to 40 rooms deeper in the Bone Wing than in the Tower (99 to 108 against 69 to 89 at Level 60). And the thing Tyler loves about catacombs, "the map/atmosphere/rooms", is not in the descent: each wing is one pocket, so a descent shows one room. The rooms live in the 165 to 185 ground, which no hero can reach while the top open ground ends at 110.

They are already one engine (`RUN_GROUNDS`, one row a door). So the merge the brief asks about is done in code; what is left is to stop calling it a second mode until it plays like one. Ruling asked for below (item 4).

**7. A Call, priced.** READ FROM DATA (`boss-calls.js`, the called rows' drops), stamina priced as the hunt it replaces, gold on the lone line.

| Call | A fight costs | In REF hours | Its call-only piece | A hundred-fight series | The Trophy |
|---|---|---|---|---|---|
| The Rat King (Level 25) | 2 min of stamina, 50 gold | 0.038 at glade 30 (the fee is 13% of it) | Kingstooth 1.0%: 3.8 REF hours | 3.3 h of stamina, 5,000 gold | 0.141%: 27 REF hours |
| Chief Coppercap (Level 52) | 2.5 min, 100 gold | 0.051 at ford 50 (the fee 18%) | Cauldron Lid 0.8%: 6.4 REF hours | 4.2 h, 10,000 gold | 0.143%: 35 REF hours |
| Captain Hask (75), Lord Krell (110) | no Call exists | | | | |

Divide by the win rate (Tyler's bar is 85% on a good bar). A four meets the Rat King every 2.6 stamina-minutes while it also earns XP and coin (CITED `boss-calls.js`), so a Call is for the hero alone.

*The legal read.* A Call takes gold and returns a random item, and gold is bought with Crowns through players. It is two steps from a paid roll, and Tyler flagged it himself (11-14). The fee is 13 to 18% of what a fight costs and 30,000 gold in the game's whole life (REAL, 0.3% of gold out). **Take the fee to zero.** A Call is then stamina for a boss's table, the same class as a hunt, and the flag is gone for the price of a sink nobody notices. If the fee stays, it goes on the pre-EA legal list with two more this dive found in the same class: scaled hours (gold for an hour whose drops fall faster, against the 11-04 avoid line "buying more rare drops") and stamina refills spent on a Call series.

**8. Scaled hunts at 110 and 175.** They do not reach 175: nothing scales past the top open ground (110), which is right. MEASURED on Normal, `endgame.mjs scaledplay`, x REF Level XP a head:

| Scaled ground | ford 50: lone / Mage / four | pyre 80 | hold 105 | Lone hammer's gold after the fee at 105 (REF 21.1k) |
|---|---|---|---|---|
| Meadowbrook Thicket | 0.93 / 1.06 / 0.23 | 0.87 / 0.91 / 0.31 | 0.88 / 0.94 / 0.31 | 11.7k |
| Mosslight Glade | 1.02 / **1.18** / 0.27 | 0.94 / 0.98 / 0.37 | 0.94 / 0.99 / 0.37 | 7.5k |
| Coppercap Warrens | | **1.08 / 1.17** / 0.58 | **1.12 / 1.13** / 0.55 | -38.7k |
| Hask's Ford | | 0.77 / 0.69 / 0.22 | 0.80 / 0.74 / 0.23 | 9.3k |
| The Slake | | 0.76 / 0.75 / 0.25 | 0.80 / 0.78 / 0.26 | 9.7k |
| Pyre Field | | | 0.91 / 0.94 / 0.31 | 12.0k |

- **Yes: the scaled Warrens is the best lone XP at 80 and 105** (+8 to +17%), and the scaled Glade is for a Mage at 50 (+18%). The rule is "never the best grind". The guard (`tests/scaled-hunts.mjs`) plays the Cellar, the Thicket and the Glade at 20 to 50 with the median way, so it never saw a party ground scaled or a Level past 50. A lone hammer pays for it (minus 39k gold an hour), which makes it gold for faster Levels, the thing ruled out on 11-04.
- **A four never buys one for XP** (0.22 to 0.58 of its Deadly hour, and Deadly is not offered scaled). For the real player a scaled hour is only ever for a drop: a lining part, a Bestiary line, a Trophy. That is its ruled job, and it is a fine one. The fee is nothing to it: 4,200 gold an hour for the party at 105, a third of one hero's hour.

**9. The old dungeons.** Cut. Card below.

**10. Content throughput.** For the Heavy four.

| | Month 1 (about Level 100 to 110) | Month 6 |
|---|---|---|
| Tower floors | Done. Floor about 160 since week 3 or 4 | The same floor, or 10 higher |
| Chest | Week 2 or 3 of 12 (weapons). Half an hour a week | Done since week 12 to 22. With the Catacombs, week 20 to 29 |
| Krell's Hall, daily | Sixteen prize rows at about 3% a hero a day: a named piece is 23 days median | Done |
| Call out | Two bosses at Levels 25 and 52. Nothing at its Level | The same |
| Scaled hunts | Nothing for a four but old drops | The same, plus linings if phase 6 ships |
| **Attended endgame a week** | **about 1 to 1.5 hours** (one climb, four heroes' opens, seven halls) | **the same errands with nothing left to win** |

Floors and rooms are formula content and cost nothing to extend, and the curve walls them anyway. A key tier is seven weapon rows, seven lines and seven icons (about a designer day and an art batch, ASSUMED from the 11-16 lanes). A boss is authored: Krell took a week of lanes (CITED, the board 11-10 to 11-17) and the Heavy four passes a boss's band in four or five days. So the repeatable ends carry the endgame, and today there are two of them: Krell's daily, and the weekly opens. With the changes above there are four: floors that move with every Level, a chest line that takes a step each key tier, a descent decided by packing, and the daily hall.

### Tyler rules on

1. **The Tower's curve.** Recommended: drop the heat patch and place the Tower with one row, Levels a floor, sized after the combat dive's to-hit change so a set-up four tops out between its Level and its Level + 25 at every Level (two Levels a floor does that from 10 to 105 today). Alternative: keep the heat and move its `from` up with each region, accepting that the board stops near floor 160 between regions and that keys are Platinum from Level 50.
2. **Chest weapon power.** Recommended: the next tier's numbers at the piece's own wear Level, plus its skill (+4 to +8% when worn, +1% over the next tier's drop; Platinum takes the next band's budget). Alternative: keep the twins and call Tower weapons a collection, not an upgrade, and reword "pretty major".
3. **Reforging first.** Recommended: build chest reforging (ruled yes, 11-18) before the Catacombs open and before any new key tier, as this domain's first build. Alternative: leave it in itemization phase 10 and accept that Bronze, Silver and Gold pieces are outgrown before they drop.
4. **What the descent is.** Recommended: in the Catacombs the store does not reach you. You fight on the food, drink, runes and arrows you carried down, and the run ends when they are gone. It needs your word because it is an exception to "running out of a supply never ends the hunt" (10-16, 10-23). Alternative: keep the descent as the Tower's twin and ship it as a second reward line of one mode ("Hearth runs": one tab, two doors), with no claim that it is its own mode.
5. **Six opens, and who may open.** Recommended: keep six a family a hero a week, and a hero may only open a key from a landing it has itself reached. Alternative: leave it open, as your 11-14 "alt keys are the shortcuts" can be read, and accept that three Level 1 heroes on bought slots turn one climber's spare keys into 18 more rolls a week.
6. **The Tower on a standing order.** Recommended: "Climb the Tower" becomes an after-the-hunt plan, and a hero's opens are used with its remembered stoke in one press for the whole account. Alternative: leave it by hand, about 14 presses a week for the own four.
7. **The Tower's XP early.** Recommended: re-fit the kill share on the played hero after the combat dive, so no hero from 10 to 30 earns more in the Tower than hunting, and the guard plays the played hero. Alternative: leave it as a quiet help for new heroes (free deaths, 1.4 times the XP, no gold) and say so on the card.
8. **Call out's fee.** Recommended: no gold fee, stamina only, and the paid-roll flag is gone. Alternative: keep 50 and 100 gold and carry it to the Steam and legal review.
9. **Scaled hunts.** Recommended: turn the switch on once the XP share is set by a ground's fit (a party ground pays about 620 permille, not 760) and the guard plays every scalable ground at 50, 80 and the top Level, alone and as a Mage. Alternative: open them as they are and accept the scaled Warrens as the best lone XP for gold.
10. **The old dungeons.** Recommended: cut all of it (six rows, five functions, four modules, the scrip). Alternative: keep the tables as a parked design for a later raid, hidden as now.

---

## The cards

### `tower` The Burning Tower (live): FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: nothing in the game asks "how strong is my party, exactly". Decision: where to start, when the week's keys are worth a half hour, and what bar gets ten floors higher. Plugs into the chest, the board, Inner Flame (Cinders) and Tempering (salts). At hour 100 it still asks the question. At hour 1,000 the answer has not moved since hour 150, because the floors stop (question 5). RULED 11-14, MEASURED |
| 2 First principle | Repeated by hand every week: open Havora, the Hearth tab, Burning Tower, Enter (4 presses a hero, or one party), then Chest, Use all (2 a hero), plus Climb again after every death. About 14 presses a week for four heroes with no decision in them (PLAYED, one hero). What the game already remembers: the start floor, the after-hunt plan, the default stoke. What should: the climb itself, as an after-the-hunt plan, and the opens |
| 3 Ledgers | Level XP source at 0.24 to 0.38 of a four's hunting hour, 0.4 to 0.75 of a lone hero's past Level 50, 1.0 to 1.4 at Levels 10 to 30 (MEASURED). Items source: keys, 9 to 17 a hero a climb. Gold sink: store supplies with no coin back (742 gold in 7 minutes at Level 11, PLAYED). Stamina and hunt hours: 1 to 1. Attention sink. Converter: hunt hours to keys, capped only by the 30 held |
| 4 Budget, 1 to 400 | Itself a Multiply lever on Level XP below 1, so inside the cap, except Levels 10 to 30 alone. The floor reward (key tier) is by floor, and floors run 60 to 70 past a four's Level, so the top reward is reached at Level 50. Past Level 80 the heat fixes the top at 150 to 180 to Level 240 and about 205 at 400 (FORMULA). A reward that stops growing at Level 80 in an uncapped game is the finding |
| 5 Seven players | Question 1's table. Costs: about 30 hero-minutes and 14 presses a week for the own four; store food for a hero with no stock. Real use: 1 climb, 1 person, 1 day ago (REAL). Nobody is priced out; a hero alone is kept off Platinum until about Level 105 as a Mage and never as a hammer, on purpose (the party's edge is its floors) |
| 6 Server cost | A climb settles as a hunt on the one engine. Extra: `tower_runs` and `tower_progress` rows a run, one key mint a landing, one board row a run end. Not in `tests/per-player-cost.baseline.json` (it has a lone hunt and a Sewer four only), so UNMEASURED: the platform dive should add a Tower fixture. The end card and the window read a Rank; if `hr_mode_board_rank` counts rows a read it grows with players |
| 7 Population | Works at 1 online. The board is the contended thing: one global list by best floor ever, raise-only. At 10 online the board is a list of the player's own heroes. At 10,000 the top is whoever was Level 80 first, for good (the wall) |
| 8 Server age | Day 1: nobody is Level 10. Month 1: the Heavy four holds the top at about 160. Month 6: a newcomer needs Level 80 to stand within ten floors of the top, about five weeks, and can then never pass it. No catch-up is needed today because nobody can get ahead; after change 1 the board follows Level and needs a season or a "this week" view |
| 9 Exploits | (a) A four-hero account climbing as one party mints four heroes' keys from one run: intended. (b) Die and retry on the top landing for XP: bounded by the kill share past Level 50, OPEN at 10 to 30 (question 2). (c) A hero carried by three stronger ones starts from the lowest seat's best landing: closed by the party start rule. (d) The 32 s seed horizon: a death costs nothing, so there is nothing to dodge. (e) A climb ended by the server with `value_over` refusals (the real climb, CITED the board's 11-19 handoff 2): unexplained, OPEN, Systems |
| 10 Teaching | First contact: none. At Level 10 nothing on the screen says a door opened (PLAYED, a new account to Level 11). The door is a text link, "Burning Tower", at the bottom of the Havora window's Hearth tab, under the powders, and a link on a hunt's end card once the hero qualifies. The window itself is clear: the chimney, the next key, "Kill XP 37.5% of hunting", "Death penalty None", food and gold before entering. The dead moment is before it: a player who never opens Havora never finds it |
| 11 Throughput | Floors are a formula: free. A key tier is 7 rows and 7 icons. The Heavy four uses up the floors in 3 to 4 weeks and nothing we add extends them while the heat stands |
| 12 Monetization | Nothing is sold here. Premium's longer bar does nothing (a week is one climb). Crowns reach it only as gold for supplies and for Tower weapons on the market. No paid roll |
| 13 Telemetry | Weekly: heroes with a climb / heroes past Level 10 (target over 50%, red under 20%); median top floor less Level by Level band (target +5 to +25 after change 1; red if any band is over +50 or under 0); climbs a hero a week (if the median is 1, it is an errand: today's expectation); `tower_key_withheld` count (red if not near zero: keys thrown away) |

Uniqueness and fun: yes, a player would describe it ("how high did your four get?"), and the end card is the best in the game: Best Floor 15 (+15), Rank, Spat out floor 16, Keys earned, Open chest, Climb again (PLAYED). What is looked forward to is the next landing. The dead moment is the second climb of any week.

Rulings: 11-14 core design COMPLIES. "The Level XP isn't all that great" BREAKS at Levels 10 to 30 alone. "Start 50% exp" COMPLIES as an hourly target alone, reads 0.24 to 0.38 for the party every real player is. 11-16 checkpoints COMPLIES. 11-18 minimum Level COMPLIES (10). 11-19 "struggle or pay" COMPLIES (a climb is all struggle and all pay). The 11-19 heat is the designer's, not a ruling.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| T1 One row "Levels a floor" replaces the heat; sized after 21 | tower, catacombs, hearth-chest | Items (keys by Level), Level XP | M | `hr_tower_floors` regenerated, edge moves | long chase | question 5 |
| T2 "Climb the Tower" as an after-the-hunt plan; opens in one press an account | tower, hearth-chest | Attention | S to M | one plan value, one RPC arm | first week and every week | card rows 2, 5 |
| T3 Re-fit the kill share on the played hero; the guard plays the played hero | tower | Level XP | S | one mode row | first week | question 2 |
| T4 A line at Level 10 that the Tower is open, and a launcher or map door | tower | none | S | none | first week | card row 10 |

### `catacombs` The Unmarked Catacombs descent (dark): HOLD

Not played as a player would meet it: the switch is off. The tab was opened on the local world with the switch flipped in that database only; the wings were climbed in the harness.

| # | Answer |
|---|---|
| 1 Purpose | As built it solves the Tower's problem a second time and gives one decision, the wing, which is a slot pick. It plugs into the same chest. If two systems give the same decision the Tower keeps it. At hour 1,000 it is the Tower's hour 1,000 |
| 2 First principle | Every press of the Tower's week again, for the second family. The wing and the start door are remembered |
| 3 Ledgers | The Tower's, within 10%: Level XP 150k to 324k an hour a head for a four at 30 to 105 (MEASURED), keys of the catacomb family, store supplies, stamina |
| 4 Budget | The Tower's curve within ten rooms at every Level (question 6), the same heat row. Its armor: +0.7 to +1.0% XP, minus 0.1 to 0.4% damage taken for both pieces (MEASURED at pyre and hold) |
| 5 Seven players | It doubles the errand: a second 30 minutes and about 14 more presses a week for the own four, for twelve more opens. Finishing a hero's own helmet and boots at Platinum is 18 weeks median for the own four, 20 for one hero. Real use: none, dark |
| 6 Server cost | The Tower's tables extended with `hunt_id`; no new path. As the Tower's: unmeasured, same fixture |
| 7 Population | As the Tower. Two more boards (solo and party) |
| 8 Server age | As the Tower |
| 9 Exploits | As the Tower. The held limit counts both families across the account (built) |
| 10 Teaching | A tab of the Tower window. Its words are clear (PLAYED): the two wings, the vault doors, the next key, the same numbers as the Tower. Nothing says why a player would go down as well as up |
| 11 Throughput | A wing is a roster row and a room. A third wing (gloves) is 12 item rows. Free to extend, and each one is another copy |
| 12 Monetization | None. As the Tower |
| 13 Telemetry | If opened as built: descents a hero a week against climbs. If they are equal and both are 1, it is the same errand twice |

Uniqueness and fun: the story is good (Dunn, the Wood Book, carried up because your name is not in it). The play is the Tower's. What Tyler asked for, a catacombs hunt loved for its rooms, is not what the descent shows.

Rulings: 11-16 "their OWN game mode like the Burning Tower" COMPLIES in name. 11-16 wings, key families, six opens, own board, 375 permille, the Tower's odds COMPLY. 11-14 "the map/atmosphere/rooms" OPEN: one pocket a wing. 11-18 gloves path in the Catacombs: designed, not built.

**What would make it its own decision (PROPOSED, ruling 4).** In the descent the store does not reach you: the hunt bag you carried down is all there is, and the run ends when it is empty. One flag on the mode row (`store: false`) and the supply path's own check. Then the Tower asks how strong the party is, and the Catacombs ask what you packed: more food and fewer runes, a Healer's drink against a Mage's, crafted food (better, lighter on gold) against store food. The pack is a preset, decided once and refilled in one tap, so it is a decision and not a chore. It gives home-made supplies, which are a third of everything real players use (REAL), their first consumer that gold cannot shortcut directly. A second, smaller step that needs no ruling: the descent moves through the map's chambers, a new room every ten doors, so it shows the place.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| C1 The descent fights on what it carried (ruling 4), then the switch | catacombs | Items (supplies), Town hours, Gold | M | one mode flag, the settle's store path | long chase | question 6 |
| C2 The descent walks the map's chambers | catacombs | none | M, art and client | none | first sight | card |
| C3 If ruling 4 is no: one tab "Runs", two doors, no second mode claimed | tower, catacombs | Attention | S | none | honesty | question 6 |

### `hearth-chest` The Hearth Chest (live): FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem: a climb pays no loot, so its reward needs a home and a ceremony. Decision: which six keys to use this week, and whether to burn Cinders for Inner Flame or stoke with them. Plugs into gear, Tempering (salts), Inner Flame, outfits, titles. The key choice is real for about two weeks, then it is always "the six best" |
| 2 First principle | Use all is one press a hero and the default stoke is remembered: good. Repeated: the walk to the tab for each of four heroes, and moving a wrong-family weapon to the hero that wants it through Storage |
| 3 Ledgers | Items source: six keys a family a hero a week. Always: Cinders 50 / 150 / 300 / 600, salts 15 / 25 / 30 / 40, food 20 / 15 / 20 / 25. Gear at 16 / 8 / 4.5 / 2% x warmth (to x3 at 50 dry) x stoke (x1.7 / 2.5 / 3.3 for 3 / 7 / 12 keys' worth of Cinders). An outfit at 0.2 to 0.5% a key. Converter: Cinders to Inner Flame XP (39 a Cinder paid, CITED `hearth.js`) or to odds. PLAYED: one Bronze key gave 15 Tempering Salts, 20 Cooked Shrimp, 50 Cinders |
| 4 Budget | Replace class. Weapon +1.0 to +1.7% XP at its Level, the set +0.9 to +2.6% (MEASURED, question 3), against a cap of "the next tier's drop". Far under. At 175 a Platinum weapon is x0.66 of what the hero wears. The sure contents are the real reward: about 45k book gold a hero a week at Platinum, 3 to 4 REF hours |
| 5 Seven players | Weeks in question 4. Stoking: a week of Platinum keys brings 3,600 Cinders and one x3.3 stoke costs 7,200, so the chest's own Cinders stoke one key in thirteen three times or one in four once (`endgame.mjs chest`). The Key Warden outfit: a four opening 24 Platinum keys a week sees it in about 6 weeks median; a lone hero on Bronze in about 58 (READ FROM DATA). Real: 49 opens, 1 weapon, 5 stokes, 1 person |
| 6 Server cost | An open is one `chest_opens` row and the ledger rows of its items, 20 keys a call at most. `chest_opens` is append-only and immutable: 12 rows a hero a week, about 2.5M a year at 4,000 heroes. Inside the allowance (`measure.mjs cost --add ledger=1,writes=1 --share 1` is the worst case of an opening hour) |
| 7 Population | Per hero; nothing contended. The weapons and armor trade, so at 1,000 online the market sets the real wait and the 2% is only the mint rate |
| 8 Server age | Items inflate: every Platinum weapon ever opened still exists (nothing binds, nothing wears out). At month 6 a newcomer buys last season's Bronze to Gold for the Shop's price. That is a fine catch-up and one more reason the low tiers must lead somewhere (reforging) |
| 9 Exploits | (a) **A hero that never climbed can open keys** passed through Storage: `2027-04-27-tower-chest.sql` reads no `tower_progress` in the open (READ FROM DATA). Three bought slots are 18 more opens a week on one climber's spare keys, each leaning to whatever starter weapon the mule holds. OPEN, ruling 5. (b) Warmth is kept a hero a family: no pooling. (c) The chance is worked out again server-side; the client sends none. (d) Keys never list or trade. (e) Salts and food from keys sell to the Shop: a gold source from a mode that "pays no coin", about 5.4k book a Gold key, reachable at Level 30. For the economy dive |
| 10 Teaching | The Chest tab says everything in labels: the chance beside each key, opens left 6 / 6, keys held 0 / 30, the stoke costs, the Warmth, when the week resets (PLAYED). It never says what a Tower weapon is good for, and the answer today is "one more skill level" |
| 11 Throughput | A key tier is 7 weapons or 6 armor rows with art. The Heavy four needs one a region |
| 12 Monetization | Keys are earned, never bought. Stokes cost Cinders only (RULED 11-14). The Key Ring is a 25,000 gold convenience a hero (2.4 lone REF hours at Level 30; re-price after 24). The Buyer buys finished pieces from players: 12 to 20 weeks saved, nothing made possible. No paid roll while stokes stay on Cinders |
| 13 Telemetry | Weekly: opens a hero (target 6 of 6 for climbers); share of opened pieces ever worn (red under 20%: today's design predicts about that); stokes a hundred opens; `chest_not_ready` refusals (red above 0) |

Uniqueness and fun: the chest on the ledge, the Warmth and "stoke the fire for good luck" are Hearthrise's own and read well. The dead moment is the hit: a weapon comes out and the compare line says +1.

Rulings: 11-14 one chest, reversed odds, own-family half, stoke on Cinders, Warmth COMPLY. 11-16 key families, six opened a family a hero, held limit about 30 COMPLY. 11-18 "pretty major upgrades" BREAKS. 11-18 "stronger than the NEXT tier's drop ... about as far as they should go" is the cap the fix aims at. 10-23 no bound gear COMPLIES.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| H1 Chest weapons carry the next tier's numbers at their own wear Level (a second column on the key row); Platinum the next band's budget | hearth-chest | Power | S | items catalogue regenerated | first month | question 3 |
| H2 A hero opens only keys of a landing it has reached | hearth-chest | Items | S | one read in `hr_chest_open` | integrity | card row 9 |
| H3 The cloth helmet and boots get an attribute that answers the Catacombs' own rooms and the grounds a Mage hunts | hearth-chest | Power | S | data | first month | question 3, last line |

### `chest-reforge` Chest reforging, fusing, two-attribute pieces, the glove wing (designed): BUILD, first

Not built, so judged against `docs/design/itemization-plan.md` section 6 and Finding 2.

| # | Answer |
|---|---|
| 1 Purpose | Problem: a band lasts a real player 6 to 8 days and its chest piece takes 1.3 to 3.8 weeks, so three of the four key tiers pay gear nobody can use. Decision: which line to carry, and whether this week's open goes to a roll or a sure step. Plugs keys, the weekly open, the tier's metal or hide, and gold together. It is the only design in this domain that still works at hour 1,000 |
| 2 First principle | One decision a step. Nothing repeats |
| 3 Ledgers | Sink: six keys of the next tier, one weekly open, the tier's material, gold. Converter: a piece to the next tier's piece, same attribute |
| 4 Budget | Replace class, the chest's cap. The plan's wait: from nothing, about 2 weeks for the Bronze piece and 3 weeks of steps to Platinum, against 7 median and 18 at the 90th by luck (CITED Finding 2). Fusing and two-attribute pieces start at Level 200: FORMULA only, hold until a region needs them |
| 5 Seven players | It needs change T1 beside it. Today a four holds six Platinum keys from one climb at Level 50, so three opens would carry a Bronze piece to a Level 88 weapon by week 5 at Level 50. With keys tied to Level (T1) each step waits for the hero to reach its landing, which is the progression. The gold: re-price after 24; hold it to the economy rule of 1 to 4 weeks of the own four's free gold a step, since a step is a one-time buy the player wants |
| 6 Server cost | One RPC, one ledger row, one `chest_opens` row a step. Inside the allowance |
| 7 Population | Per hero |
| 8 Server age | It is the item sink this domain lacks: six keys and a piece go in, one piece comes out |
| 9 Exploits | A reforge must use the hero's own weekly open (RULED) and keys the hero could open under H2. A reforged piece trades like any gear, so the Buyer buys it: allowed |
| 10 Teaching | Must make sense in the chest's own tab (RULED 11-18 for jewel reforging; the same bar here): the piece, "Carry up: 6 Silver Keys, 1 open, gold", and the result's card |
| 11 Throughput | No content of its own. It makes each key tier we already build worth four times as long |
| 12 Monetization | Gold is an input, so bought gold makes a step sooner; keys and opens cannot be bought. Inside the line |
| 13 Telemetry | Reforges a week against plain opens; pieces worn that were reforged (target: most worn chest pieces) |

Rulings: 11-18 "Chest pieces reforge up a key tier with keys (YES)", "chest reforge = 6 keys + one open" COMPLY as designed. Two-attribute from the Level 200 key, 1 in 4, half from 300: RULED, not needed until a region reaches there.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| R1 Reforge a chest piece up one key tier: 6 keys, 1 open, material, gold | chest-reforge, hearth-chest | Items sink, Gold sink, Power | L | one RPC, catalogue rows | long chase | questions 1, 4 |
| R2 Hold fusing, two-attribute pieces and the glove wing until the first region past 200 and ruling 4 | chest-reforge | none | none | none | none | card row 4 |

### `bosses-halls` Bosses and keyed halls (live): KEEP

Not played to a boss in this dive (a new account reached Level 11); judged from the data, the board's measured sections and the real record.

| # | Answer |
|---|---|
| 1 Purpose | Problem: a region needs an end a party prepares for. Decision: the bar and the party for one fight, whose key to spend, and whether today's roll is worth a key. Plugs into ground drops (the key), uniques, Trophies, gems for jewelry. Krell's daily keeps it alive after the first win |
| 2 First principle | One press to open a hall, any seat's key counts (built). Repeated: one fight a hero a day for the daily prize, each a press, forever |
| 3 Ledgers | Items source: Krell's prize, one roll a hero a server day over 14 Dawnsteel rows at 2.86% and two uniques at 3% (READ FROM DATA), a first win always a piece. Level XP and coin as a ground. Sink: a Hall Key (2.6% from the Gatekeeper), supplies |
| 4 Budget | Krell's uniques are sidegrades: x1.006 XP, x0.966 damage taken at hold (MEASURED). Dawnsteel rows are the tier. Nothing past Level 110 exists; every region after needs its hall |
| 5 Seven players | Krell is a four on purpose (RULED 11-17). A named piece is about 23 days of daily kills, median. Real: one keyed entry, four daily loots, one person, 1 day ago. The New player meets the Rat King near Level 20 if it gets there |
| 6 Server cost | A hall is a hunt of one room. `player_boss_loot_day` one row a hero a day. Inside the allowance |
| 7 Population | A hall needs a four: at 10 online that is the player's own four, which is the real player. At 1,000 the key trades (RULED), so a market for keys forms |
| 8 Server age | The daily keeps a veteran coming; a newcomer loses nothing by arriving late |
| 9 Exploits | Daily prize a hero: four heroes are four rolls a day from one key, intended. Help without loot is allowed. Key trade is the server's |
| 10 Teaching | The hall's page names the key, who drops it, the party it asks for and the prize table with its percentages (READ FROM DATA, `boss-halls.js` words). Strong |
| 11 Throughput | Authored: about a week of lanes a boss, used up as a first clear in 4 to 5 days by the Heavy four. The daily prize is the repeatable end and every later hall needs one |
| 12 Monetization | Open Halls (a weekly event) waives entry. Nothing sold. The Buyer buys keys and the prizes |
| 13 Telemetry | Halls opened a week by heroes past 85 (target: most days for an account past Krell; red: zero for a week) |

Rulings: 11-14 "Krell should be a daily kill" COMPLIES. 11-17 Krell is a four COMPLIES. 11-14 no Challenge advice COMPLIES. 11-18 uniques are sidegrades COMPLIES.

### `boss-calls` Call out and the series (live): FIX

| # | Answer |
|---|---|
| 1 Purpose | Problem (Tyler's): "people want the drops but don't want to burn stamina for them". Decision: how many fights to queue. Plugs into a boss's own table and one call-only piece. Past Level 52 it has nothing to say: there are two |
| 2 First principle | The slider queues up to 100 fights in one press. Nothing repeats. This is the pattern the Tower should copy |
| 3 Ledgers | Converter: stamina (2 or 2.5 minutes) and gold (50 or 100) to one roll at a boss's table, on a win. No XP, no coin. Rates in question 7 |
| 4 Budget | The call-only pieces are tier 2 and tier 3 sidegrades. No power past Level 30 |
| 5 Seven players | For the hero alone: a four meets the same boss every 2.6 stamina-minutes on the ground and earns XP and coin too. Gate: ten wins on the ground first (RULED 11-18). Real: 1 use, 11 days ago |
| 6 Server cost | A series is one hunt session charged a fight at a time by the settle. No new path |
| 7 Population | Works alone |
| 8 Server age | A veteran farms the Trophy; nothing a newcomer misses |
| 9 Exploits | Wins never pass fights paid (a table CHECK); a loss or the limit pays nothing; the fee is the server's quote at the press. Stamina refills bought with gold feed a series: allowed, and the reason the fee matters legally |
| 10 Teaching | The press sits on the ground's page after ten wins, with the price beside it and the warning's labels (READ FROM DATA) |
| 11 Throughput | A call is a `_called` monster row, a room and one call-only piece: a day or two. Two of four bosses have one |
| 12 Monetization | The one place in this domain where gold buys a random item directly. Question 7: take the fee to zero |
| 13 Telemetry | Fights a week; calls by boss (a boss at zero for two weeks: its call-only piece is not wanted) |

Rulings: 11-14 "definitely have a chance for an item drop", the slider, stamina, no daily cap COMPLY. 11-14 "plus a small gold fee" COMPLIES; the fix asks to change it (ruling 8). 11-18 ten wins first COMPLIES. 11-04 avoid "random gold spends": the fee is one, by a small margin.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| B1 The fee to zero | boss-calls | Gold (30,000 in the game's life) | S | two rows | legal | question 7 |
| B2 A Call for Captain Hask with one call-only belt or bow sidegrade | boss-calls | Items | S to M | data rows | month 1 | question 7 |

### `scaled-hunts` Scaled hunts (registry: live; switch seeded off): FIX

Not played: the door did not appear for a Level 11 hero on the local world (nothing is outgrown yet at 11 but the Cellar).

| # | Answer |
|---|---|
| 1 Purpose | Problem: an old ground's drops (a Trophy, a Bestiary line, soon a lining part) are out of reach once it is outgrown. Decision: is this drop worth paying to hunt at 0.8 of my XP. Plugs into the Bestiary, linings (RULED 11-18, from region 3) and every old ground's table. It grows more useful with every ground added |
| 2 First principle | Hours are banked up to 24 a ground and spend only while there; tier and ground are remembered. One buy a day at most |
| 3 Ledgers | Gold sink: 40 x Level a banked hour (2,000 at 50, 4,200 at 105; a 24 hour bank 100.8k at 105). Level XP source at 760 permille of the formula, a party keeping 700 permille of its cell. Items source: the ground's own rows at the card's "Drops x" |
| 4 Budget | Meant to be under the right-Level ground at every Level. MEASURED: the scaled Warrens is x1.08 to x1.17 for a hero alone at 80 and 105, the scaled Glade x1.18 for a Mage at 50 (question 8). A four reads 0.22 to 0.58 of its Deadly hour |
| 5 Seven players | The fee at 105 is 4,200 an hour for the whole party, a third of one hero's hour: no gate at all for the own four. For the New player nothing is outgrown. Real use: 0 |
| 6 Server cost | The scale rides the settle's context; `player_scaled_hours` one row a hero a ground. No new statement on the settle path (READ FROM DATA) |
| 7 Population | Works alone. It thins the low grounds no further: the scaled party is in its own instance |
| 8 Server age | Its whole job: at month 6 it is how a veteran still wants the Thicket |
| 9 Exploits | Buy clamp 48 hours a day, bank 24 a ground, the leader's purse, the server's clock. Gold for faster Levels through the Warrens: OPEN until the fit lands. Gold for an hour whose rare rows fall faster is close to the 11-04 avoid line "buying more rare drops": for the legal list |
| 10 Teaching | A slider on an outgrown ground's page. Unseen in this dive |
| 11 Throughput | No content: every ground we open becomes a scaled ground from the data |
| 12 Monetization | A gold sink the Buyer can pour into. It buys drops sooner and, until fixed, Levels 8 to 17% faster alone at 80 and 105 |
| 13 Telemetry | Scaled hours bought a week (a feature at zero for two days is a P1 once the switch is on); a scaled ground's Level XP a head against the right-Level ground's, weekly, red over 1.0 |

Rulings: 11-07 per hour slider, up to 24 hours, ticks only in the spawn COMPLY. 11-07 "loot scales" COMPLIES. 11-18 old grounds stay relevant through scaled hunts for linings: needs the switch on. 11-04 gold never buys Level XP: BREAKS on the Warrens and the Glade.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| S1 The XP share by the ground's fit (a party ground about 620 permille), as `coinPm` is already shaped; the guard plays every scalable ground at 50, 80 and the top Level, a hammer and a Mage | scaled-hunts | Level XP | S | one catalogue row | integrity | question 8 |
| S2 The switch on, after S1 | scaled-hunts | Gold sink, Items | S | Coordinator | month 1 | registry |
| S3 Re-measure after 21 | scaled-hunts | | | | | |

### `old-dungeons` Old dungeons, raids and the world boss (dark): CUT

| # | Answer |
|---|---|
| 1 Purpose | None today. The problem it answered (a party goal with a cooldown) is answered by the keyed hall, the daily prize and Call out |
| 2 First principle | No player can reach it |
| 3 Ledgers | None reachable. Its design minted a second currency (scrip), which the game has since refused everywhere else |
| 4 Budget | None |
| 5 Seven players | Nothing for any of them. Real use: none possible |
| 6 Server cost | Six `hr_dungeons` rows, `hr_dungeon_loot`, five functions carried by every replay; `bosses.js`, `boss-forge.js`, `champions.js`, `botd.js` still imported by `items.js`, `monsters.js`, `game-modules.js` and the edge's `accrual.js` (READ FROM DATA). Bytes in the edge bundle and the catalogue for nothing |
| 7 Population | None |
| 8 Server age | None |
| 9 Exploits | A settle function with no caller is a surface the pre-EA Security review would have to read. Cutting it is the cheapest review |
| 10 Teaching | None |
| 11 Throughput | None |
| 12 Monetization | None |
| 13 Telemetry | After the cut: zero rows, and the catalogue-coherence guard still green |

Its names fail the identity rule (the Voidbringer, the Ancient Wyrm, the Obsidian Keep, the Haunted Archive). Nothing of it should be kept by name. What it becomes is already built: a hall at each region's end with a daily prize.

Rulings: 10-22 cut every old-client reward table the rebuilt client cannot claim: this is the remainder. 10-22 "raid strikes / world events ... NOT yet ruled, ask before cutting": so it is ruling 10 above.

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| D1 Retire the six rows, five functions and four modules (`chain-retire`), and the items only they make | old-dungeons | Server cost | M | a retire file, catalogues regenerated | none to a player | card row 6 |

## For other dives

| To | System | What |
|---|---|---|
| 21 combat | to-hit | The Tower is the cleanest read of the curve: a four's top floor over its Level falls from 3.9 at Level 10 to 2.5 at 60, 2.0 at 105, 1.3 at 175 and 1.1 at 240 with the heat off. If that ratio is held steady the Tower needs one row. Send the new engine back through `endgame.mjs climb` |
| 21 combat | lone ways | Alone, the Healer outclimbs every other way by 20 to 50 floors at every Level and takes 60 to 95 minutes doing it; the hammer never reaches floor 100 before Level 175. Every climb dies on a Keeper, one floor short of a landing |
| 21 combat | the played profile | Guards fitted on the ladder-kit hero miss what the played hero does: the Tower's XP guard, the scaled fee guard |
| 23 items | uniques, weapon line | A Platinum Tower weapon is x0.66 at Level 175 against the weapon line. Every region needs its key row in the same patch, or chest weapons take the line's scaling |
| 23 items | Tempering salts | A week of Platinum keys is 240 Ember salts a hero with no bench work. Size that against the salts the benches are meant to supply |
| 23 items | old catalogue | `boss-forge.js` signature items sit in the item catalogue with no source once the dungeons are cut |
| 24 economy | income | Chest contents sell: salts and food from keys are a gold source from a mode that pays no coin, about 45k book a hero a week at Platinum and reachable at Level 50 (Gold keys at 30). Book it as a source and say what the Shop really pays |
| 24 economy | gold sinks | The Key Ring's 25,000 is a placeholder; the Call fee (30,000 gold ever) is proposed to go |
| 26 home, or whoever owns Inner Flame | Hearth fuel | 3,600 Cinders a hero a week at Platinum is about 140k Inner Flame XP in an hour of burning, "72 hours of a hunt's bones" at the rate the design sized Cinders on. Check it against the Inner Flame line |
| 27 retention | teaching | Nothing tells a Level 10 hero the Tower opened. The door is a link at the bottom of Havora's Hearth tab |
| 27 retention | the week | The game's only weekly beat is the chest's Monday reset, and it is shown as "Week resets: Sunday 6:00 PM" in local time. Worth using on purpose |
| 28 platform | cost | No Tower fixture in `tests/per-player-cost.baseline.json`. The board's Rank is read on every end card and window open |
| Systems | the real climb | It ended `server` with six `value_over` refusals (CITED the 11-19 board section). Still unexplained |

## Measured, cited, assumed

**MEASURED (this lane, set/v0.2.143 at `65edc5205` plus this branch's tool, real settle, played profile)**
- Tower climbs, questions 1, 2, 5: `node tools/balance-program/endgame.mjs climb --levels 10,30,50,60,80,105,118,175 --who four,hammer,mage,healer --seeds 3 --minutes 120`; the same with `--from level --minutes 60`; `--levels 240,400 --minutes 240` (FORMULA Levels).
- Heat off and two Levels a floor: the same command in two scratch copies of the tree (`heat.perFloorPm` 0; `towerLevelOf` x2), 2 seeds. Not committed; the edit is one line each and is named here.
- Catacomb wings, question 6: `endgame.mjs climb --ground unmarked_bone_wing --levels 30,60,80,105 --who four,hammer,mage --seeds 2`, and `unmarked_flooded_wing`.
- Tower weapons, Catacomb armor, tier steps, skill bumps, uniques, question 3: `node tools/balance-program/measure.mjs what --at <point> --seat lone|mage --hours 2 --seeds 3 --patch '{"gear":{"also":{...}}}'` and `'{"skillBump":N}'`.
- Scaled grounds, question 8: `endgame.mjs scaledplay` (1 hour, 2 seeds a cell, Normal).
- Chest waits: `endgame.mjs chest` (20,000 lives a row; its "pieces in 26 weeks" column stops counting when a life finishes the set, so read only the slow rows) and `endgame.mjs account` (8,000 lives).
- Seeds are few (2 or 3). Read every climb number as a band of about ten floors and every ratio to two figures.

**PLAYED (a private headless world, `openWorld()` and `world.play()` on its own port, a new account, the screen read as text and screenshots)**
A new hero through the Mill Cellar to Level 5 and the Thicket to Level 11 by time skips; no notice of the Tower at Level 10; Havora (X), the Hearth tab, "Burning Tower"; the Climb, Catacombs and Chest tabs read; one climb from floor 1 as a Level 11 tank in its starter kit (floor 15 in 7 minutes, 742 gold of Salted Shrimp, +1,902 Level XP, one Bronze Key); the end card; the key used (15 Tempering Salts, 20 Cooked Shrimp, 50 Hearth Cinders, no weapon). The three switches (`burning_tower`, `unmarked_catacombs`, `scaled_hunts`) were set to `everyone` in that in-memory database only. Not played: a party climb, a descent, a hall, a Call, a scaled hour.

**REAL** (`10-real-players.md`): one climb (four heroes, Level 72 to 74, floor 182, 0.26 of hunting, 72 keys, 49 opens, 19 of 23 kept rows Platinum, 1 weapon, 5 stokes); scaled 0; called 1; hall 1 with 4 daily loots; a band's length from the real pace.

**CITED**: the 11-19 Tower's curve section (his four, the heat's fit); the itemization plan section 6 and Finding 2 (reforging's waits); `boss-calls.js` (stamina a natural boss kill); the economy dive's gold model at `origin/lane/d-balance-economy` `d9554e87f` (free gold a hero-hour, slot timing).

**READ FROM DATA**: every key, chance, stoke, fee, drop row and mode row (`chests.js`, `tower.js`, `session-modes.js`, `boss-calls.js`, `scaled-hunts.js`, the called rows' drops, Krell's prize rows); that the chest's open reads no `tower_progress`; who imports the old dungeon modules.

**ASSUMED**: book value as the worth of a key's contents (the Shop pays less; Tempering wants the salts); a designer day and an art batch a key tier; the own four as a four from Level 10 (the economy dive says one hero to about 30 on today's slot prices); the Tower's server cost equal to a hunt's.

**PROPOSED**: every change row, the curve's contract, the chest weapon's size, the descent's rule, the scaled share by fit, the opener's rule.

**Not done, and why**: no number here is after the combat dive's to-hit change (not landed); nothing is priced against the finished economy file (question 1 only was pushed); no boss, Call or scaled hour was played by hand (a new account reaches Level 11 in the time this dive had); the server cost of a climb was not measured (no fixture).
