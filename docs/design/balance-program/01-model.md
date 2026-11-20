# Balance program 01: the one shared model

Phase 1 of the whole-game balance program (Tyler, 2026-11-20). Every phase-2 dive books its systems in this model and measures with the commands in section 6, so a number in one dive can be laid beside a number in another. The data half is `tools/balance-program/model.mjs`; the harness is `tools/balance-program/measure.mjs`; the system list is `tools/balance-program/systems.mjs` (115 systems, 8 domains).

Labels used in every program document, and never mixed: **MEASURED** (this harness or a guard, on the commit named), **CITED** (another lane's measurement, with its file), **RULED** (Tyler, with the date), **ASSUMED** (a guess, said so), **PROPOSED** (ours, not built).

## 1. The nine ledgers

A system is a **source** (makes the quantity from nothing), a **sink** (destroys it) or a **converter** (turns one into another, and a converter must name its rate). A system that touches no ledger fails the purpose test. A market sale, a party split and a Storage move are transfers, not sources or sinks.

| Ledger | Unit every dive uses | Sources today | Sinks today | Converters |
|---|---|---|---|---|
| **Power** | x REF Level XP an hour and x REF damage taken an hour at a reference point (section 4) | Level (HP, mana), combat skills, gear tier, accessories, Tempering, Tower and Catacomb pieces, uniques, spells on the bar, linings, training | None. Nothing in the game takes power away except a death's skill loss and Tempering's reset at a new tier | gold to power (Tempering, Hallmarks, the yard, the dummy); town hours to power (crafted gear and supplies) |
| **Level XP** | Level XP an hour a head; hours to a Level against `LEVEL_PACE` (`src/data/core-model.js`) | kills (hunts, the Tower at 50%, the Catacombs at 37.5%, scaled hunts at 80%), tiers, the solo boost, the Bonus XP weekend | death (6% of total Level XP, cut by Blessings) | none, and none may exist: gold and Crowns never buy Level XP (RULED 11-04) |
| **Skill XP** | skill XP an hour by skill; combat skills against the career line (`tools/balance-sim/skill-lines.json`), bench and gathering skills against hours to 99 | blows landed, mana spent, hits taken, bones and fuels, bench work, gathering, farming, the yard and the dummy, training items | death (6% of each combat skill's progress) | gold to combat skill XP (the yard by the hour; the dummy once) |
| **Gold** | gold an hour a head (in, store bill, net); a price in **REF hours** = price / REF net gold an hour at the buyer's Level | coin a kill, loot sold to the Shop, the tally, the Discord gift, GM grants (walled) | store supplies, the House and rooms, Tempering, Hallmark fees, hero slots, stamina refills, Blessings, the market's fee and cut, bench tax, Storage rungs, the small sinks, Town Works, scaled hours, Call out, curing, rename, clan castle and treasury (dark) | Crowns to gold between players (a transfer inside the game, new money outside it) |
| **Items** | pieces an hour by gear tier and loot band; hours a named row; stock made an hour at a bench | drops, gathering, farming, benches, chests, the Shop | use (supplies), the Shop's buy price, salvage, Tempering salts, recipes, the castle board (dark) | items to gold (Shop, market), items to Luck (salvage), items to power (worn) |
| **Hunt hours** | hero-hours hunted a day | the stamina bar (8 h free, 12 h Premium), rest 1:1, refills, hero slots | hunting 1:1 | gold to hunt hours (refills: up to 4 h, six a day) |
| **Town hours** | attended minutes a day: the human's own time | the player | bars, benches, selling, the market, farming visits, restocking | gold to town hours given back (curing slots, benches at home, room speed rungs) |
| **Stamina** | hours of bar | rest | hunting, Call out | see hunt hours |
| **Server cost** | statements, row writes and ledger rows a hero-hour; edge CPU ms a settle | every system that runs on the settle path, polls, journals or refreshes for everyone | pruning, batching, delta envelopes | none |

Two rules follow, and every dive checks them:

1. **Every converter has a published rate and a cap.** Gold to power is accepted (RULED 11-04, 11-18: "paying for power has to live somewhere") only through sinks, indirect and capped. A dive names the rate (REF hours of gold for +x% REF) so the economy dive can rank every gold-for-power offer on one line and see the cheapest. If a new one is cheaper than Tempering's last rung at the same Level, it is mispriced or Tempering is.
2. **A ledger with a source and no sink inflates with server age.** Power has no sink by design (so the reply is content that asks for more power). Items have a weak one (nothing binds, nothing wears out, RULED), so the items dive must show where a Level 30 piece goes on a 6-month server. Gold has many, and the economy dive totals them a reference player a week.

## 2. The stacking rule

Every lever belongs to exactly one class. `model.mjs` LEVERS lists the twenty known today with their class and size. A dive that finds a lever in no class, or one that changes class at some Level, has found a system change and reports it as one.

| Class | Rule | Cap the program holds | Today's members |
|---|---|---|---|
| **Replace** | One worn at a time. The better one replaces the other and never sums with its own kind. | The next tier's step: a weapon tier is +5 to +9% XP (MEASURED). A chest piece may beat the next tier's drop and go no further (RULED 11-18). | weapon tier, armor tier, shields, Tower weapons, Catacomb armor, uniques |
| **Add** | Small optional sources on the gear side. They add into ONE pool. | The whole pool is worth at most one weapon tier step of XP and one armor tier step of damage taken, at every Level. PROPOSED; today the pool measures +4 to +24% XP (CITED audit 3b). | accessories and perks, Tempering, worn in, linings (one shared 40% cap an element, CITED), +skill from items and the yard, Magic Find (one budget of 104 a hero, RULED) |
| **Multiply** | A choice of how to play. It multiplies with everything, so each is budgeted by name. | The product of every multiply lever is at most **2.0x REF a head**, lone or party. PROPOSED; today a Deadly four measures 1.8 to 2.6x the contract with 0 deaths (MEASURED, section 5). | the way you fight, tier, party, the solo boost, events, any ability ADDED to a bar, faction skills |
| **Time** | Hours, not rate. It multiplies an account's output and never a hero's rate. | 24 hunted hours a hero a day, four heroes an account (RULED). | stamina cap, refills, Premium's bar, hero slots |

Evidence that Add holds while it stays small (MEASURED, `measure.mjs what --at ford`, lone hammer, Level 50): Tempering 5 of 5 alone x1.030 XP, +10 skills alone x1.043, both x1.050; damage taken x0.986, x0.795, x0.777. XP adds within noise. **Damage taken does not**: the two together cut more than their sum, because Defense is a to-hit term (audit change 1). Until to-hit is fixed, every dive measures damage-side levers together, never one at a time.

What a dive may not do: add a multiply lever without naming which existing one it replaces or shrinks; put a gear-side source in the multiply class (a perk that adds a bar ability is a multiply lever, whatever slot it sits in); leave a lever's class to be found out by play.

## 3. Who pays: the reference players

Six accounts. Hunt hours are a hero's; attended minutes are the human's. All six are ASSUMED until `lane/d-balance-real-players` replaces them with measured rows in phase 4; until then every dive uses them unchanged so the dives agree with each other.

| Player | Heroes | Seat | Hunt h a hero a day | Attended min a day | Supplies | Who this is |
|---|---|---|---|---|---|---|
| **New** | 1 | lone hammer, Normal | 8 (one visit) | 45 | all from the store | First week, start kit, follows the game's advice |
| **Median** | 2 | lone, Normal or Dangerous | 12 (two visits) | 60 | half own | Cooks and crafts some of what it uses |
| **Premium** | 2 | lone | 12 (ONE visit) | 60 | half own | The Median with the 12 h bar, the full analyzer, a daily training weapon |
| **Heavy** | 4 | its own Deadly four | 24 (six refills) | 180 | own | The pace ceiling. Reaches Level 110 in about 12 days (CITED audit 3c) |
| **Buyer** | 4 | its own Deadly four | 24 | 120 | from the market | The Heavy who sells Crowns for gold. Gold is no limit, so every gold sink is bought the day it opens |
| **Four friends** | 1 each, 4 accounts | a four when all are on | 8 | 60 | half own | The party the game is sold on |

Every dive answers for each: what does this system give it in a week, what does it cost in REF hours of gold and in attended minutes, and does the Buyer get anything from it that the Heavy cannot earn. That last answer is the pay-to-win line: bought gold may make it sooner, never make it possible.

**Server age.** Day 1 (no market stock, nobody above Level 15, empty boards, no clans). Month 1 (the Heavy is past Krell, the Median near 50, tiers 1 to 5 on the market). Month 6 (a New player arrives beside veterans: old gear is cheap, low grounds have no parties to find, the top of every board is out of reach, clans are full).

**Population.** 10 online (today, and every quiet hour of a small server), 1,000 (the Early Access target, about 4,000 hunting heroes), 10,000 (the north star).

## 4. Where every dive measures: reference points and seats

Eight points, three seats. The played profile (`tools/balance-sim/played.mjs`: the bars, accessories and ammunition real heroes were recorded using), skills on the career line (`skill-lines.json`), supplies from the store. **The lone hammer on Normal is the unit: 1.00.**

| Point | Ground | Level | Gear tier | State |
|---|---|---|---|---|
| thicket | Meadowbrook Thicket | 10 | 1 | open |
| glade | Mosslight Glade | 30 | 3 | open |
| ford | Hask's Ford | 50 | 4 | open |
| slake | the Slake | 60 | 5 | open |
| pyre | Pyre Field | 80 | 6 | open |
| hold | Krell's Hold | 105 | 7 | open |
| rest | Carter's Rest | 118 | 7 | staged, played with its own drops opened |
| catacombs | the Unmarked Catacombs | 175 | 7 | staged |

Past 175 nothing can be played. Levels 240 and 400 are answered from the formulas only (`measure.mjs curves`), and a dive says FORMULA beside any number there.

Seats: `lone` (hammer, Normal), `mage` (lone Mage, Normal: the fastest lone way and the caster's supply bill), `four` (tank, Healer, bow, Mage on the hardest tier the ground has, a head).

## 5. The reference table (MEASURED, commit a5e092248, 2 seeds x 1 h, an hour a head)

`tools/balance-program/ref.json` holds these; `measure.mjs ref --write` re-measures them. One hour by two seeds is enough to compare dives with each other and too little to grade a ground: a rare row is not sampled, and a death rate under 1 in 2 hours reads 0.

| Point | Seat | Level XP | x contract | Main skill XP | Gold in | Store bill | Net gold | Damage taken | Deaths | Low HP p10 |
|---|---|---|---|---|---|---|---|---|---|---|
| thicket 10 | lone | 29,312 | 1.13 | 16,775 | 4,500 | 240 | 4,260 | 2,783 | 0 | 94% |
| | mage | 34,765 | 1.34 | 30,638 | 5,140 | 4,807 | 333 | 1,210 | 0 | 95% |
| | four, Deadly | 15,121 | 0.58 | 7,392 | 1,367 | 842 | 525 | 669 | 0 | 89% |
| glade 30 | lone | 104,610 | 0.99 | 35,616 | 10,512 | 0 | 10,512 | 14,976 | 0 | 83% |
| | mage | 137,805 | 1.31 | 50,229 | 13,466 | 9,070 | 4,396 | 8,567 | 0 | 86% |
| | four, Deadly | 185,301 | 1.76 | 47,062 | 10,819 | 5,918 | 4,902 | 4,103 | 0 | 86% |
| ford 50 | lone | 245,472 | 1.21 | 43,154 | 11,612 | 270 | 11,342 | 33,633 | 0 | 70% |
| | mage | 309,973 | 1.53 | 53,590 | 15,589 | 15,909 | -320 | 16,732 | 0 | 81% |
| | four, Deadly | 530,145 | 2.62 | 59,577 | 14,879 | 13,612 | 1,267 | 16,804 | 0 | 68% |
| slake 60 | lone | 264,803 | 1.04 | 49,530 | 12,594 | 90 | 12,504 | 40,254 | 0 | 73% |
| | mage | 402,803 | 1.58 | 73,186 | 19,480 | 29,624 | -10,144 | 18,717 | 0 | 85% |
| | four, Deadly | 593,257 | 2.33 | 72,611 | 16,539 | 15,221 | 1,318 | 28,698 | 0 | 70% |
| pyre 80 | lone | 432,580 | 1.18 | 72,663 | 23,965 | 540 | 23,425 | 66,186 | 0 | 61% |
| | mage | 603,985 | 1.64 | 86,827 | 32,860 | 34,237 | -1,377 | 33,338 | 0 | 78% |
| | four, Deadly | 687,998 | 1.87 | 78,057 | 19,451 | 24,009 | -4,559 | 34,647 | 0 | 64% |
| hold 105 | lone | 551,118 | 1.06 | 76,422 | 21,985 | 900 | 21,085 | 73,186 | 0 | 59% |
| | mage | 749,536 | 1.44 | 79,771 | 28,755 | 30,650 | -1,896 | 33,441 | 0 | 81% |
| | four, Deadly | 938,150 | 1.80 | 84,923 | 20,497 | 26,240 | -5,743 | 38,948 | 0 | 63% |
| rest 118 (staged) | lone | 530,075 | 0.88 | 69,699 | 17,171 | 20,160 | -2,989 | 112,792 | 0 | 40% |
| | mage | 839,472 | 1.39 | 77,746 | 26,978 | 28,446 | -1,468 | 49,695 | 0 | 71% |
| | four, Deadly | 1,108,041 | 1.84 | 99,671 | 19,421 | 30,482 | -11,061 | 57,663 | 0 | 54% |
| catacombs 175 (staged) | lone | 822,471 | 0.82 | 89,540 | 19,393 | 45,180 | -25,788 | 166,886 | 0 | 36% |
| | mage | 1,070,780 | 1.07 | 88,438 | 26,130 | 34,258 | -8,128 | 81,639 | 0 | 51% |
| | four, Deadly | 1,383,744 | 1.39 | 123,244 | 18,362 | 46,695 | -28,333 | 107,578 | 0 | 33% |

What the table already says, for the dives that own it (none of this is ruled on here):

- **Combat:** the Deadly four is 1.8 to 2.6 times the pace contract from Level 30 to 118 with no death in any cell. That is the multiply cap of section 2 broken, and "struggle or pay" (Tyler 11-19) unmet in the death half.
- **Economy:** gold in is nearly flat from Level 80 on (24.0k, 22.0k, 17.2k, 19.4k an hour for the lone hammer) while every price rises. A lone Mage that buys its supplies nets under zero from Level 50, and the Deadly four from Level 80. So what the store sells is the game's real gold dial, and "own stock" is worth 15k to 46k gold an hour a head: the items dive prices crafted supplies against that number.
- **Combat and items:** the lone hammer's damage taken grows 60 times from Level 10 to 175 while its HP grows about 7 times. Low HP falls to 36%. This is the to-hit curve of audit section 3d seen in play.
- **A price in REF hours:** a 150,000 Hallmark fee at Level 50 is 13 lone REF hours; the Castle's 2.5M at Level 105 is 119 lone REF hours, 15 days for the New player and 1.3 for the Heavy on own supplies; for a store-fed Mage or a store-fed four it is never. A price means nothing until a dive says whose.

## 6. The harness: exactly what a dive runs

All from the repo root, in the dive's own worktree. None of them writes under `src/`, and none touches production. A dive quotes the command beside every MEASURED number.

| Question | Command | Cost |
|---|---|---|
| What are the model's tables? | `node tools/balance-program/measure.mjs model` | instant |
| What does my domain own, and where is it in code? | `node tools/balance-program/domain.mjs <domain>` (add `--docs` for the rulings and lanes; `--system <id>` for one) | 4 s |
| What is REF at a point? | read `tools/balance-program/ref.json`, or `node tools/balance-program/measure.mjs ref --at ford` | 3 s a point |
| What is a lever worth? | `node tools/balance-program/measure.mjs what --at ford --seat lone --patch '{"temper":{"temper:blows:4":5}}' --label "blows 5 of 5"` | 3 s |
| Do several levers add or multiply? | `node tools/balance-program/measure.mjs what --at ford --patch-file steps.json` where the file is `[{"label","patch"}, ...]` and the LAST row wears all of them: it prints the single steps multiplied and added beside the measured whole | 3 s a row |
| What is a gold price worth, and to whom? | `node tools/balance-program/measure.mjs price 150000 --at ford` (or `--level 47`) | instant |
| What does my system cost the server? | `node tools/balance-program/measure.mjs cost --add statements=0,ledger=2,writes=1 --share 0.5` | instant |
| What happens past Level 175? | `node tools/balance-program/measure.mjs curves` (formulas at 10 to 400), `deep` (staged grounds and the Tower at floor = Level) | instant; `deep` takes minutes |
| A whole life, Level 1 up, on a tier | `node tools/balance-sim/life.mjs --party mage --policy dangerous --to 70` | minutes |

A `what` patch is any field of a `tools/balance-sim/cell.mjs` cell: `gear` (`accessories`, `tierOffset`, `only`, `also`, `uniques`, `openAlso`), `temper`, `skillsBySeat`, `options` (`tier`), `density`, `supply` (`own`), `party`, `level`; plus `skillBump: N` (main skill and Defense N over the career line). Use more hours and seeds for anything a ruling will rest on: `--hours 4 --seeds 4`.

What the harness cannot measure, and how a dive answers anyway:

- **Town systems** (benches, farming, the House, the market, clans): no engine plays them. The dive reads the rates from the data rows (`src/data/*`, the replayed tables listed by `domain.mjs`), converts with `price`, and labels the result READ FROM DATA.
- **Market prices:** there are no real ones (three sales ever, CITED). Use the Shop's buy price as the floor and the store's sell price as the ceiling, and say so.
- **Edge CPU:** `cost` covers statements, row writes and ledger rows. Edge CPU a settle comes from `node tests/settle-budget.mjs` when a dive changes what a settle computes.
- **Real players:** phase 4, from `lane/d-balance-real-players`.

## 7. Server cost: the line every system is held to

MEASURED today (`tests/per-player-cost.baseline.json`): a lone hunting hero costs 5 statements a settle (1,800 a hero-hour), 10,080 row writes and 48 ledger rows an hour; a hero in a four 720 statements, 9,270 row writes, 44 ledger rows. CITED (`tools/qa/audit-2026-11-19-server/findings.md`): about 110 to 130 accounts online before the database passes 70% CPU on today's plan; the ledger prune (480,000 rows a day) is outrun near 560 daily heroes.

So the allowance for a NEW or changed system, a hero that uses it: **no new statement on the settle path, at most 1 ledger row and 1 row write a hero-hour, no poll, and nothing that grows with players times players** (a board everyone refreshes, a town everyone repaints, a clan roster re-read per member). A system that needs more is not refused; its dive says how much with `measure.mjs cost`, and the platform dive owns the answer (batch it, journal it hourly, or pay for it).
