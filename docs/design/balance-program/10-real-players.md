# Balance program, phase 1: the real-player baseline

Read 2026-11-20 from production, read-only (`node tools/balance-program/real-players.local.mjs`, SELECT only inside a READ ONLY transaction; `--selftest` proves the gate and the token handling). Raw rows stay in the lane's `.scratch/`. Everything below is aggregated: heroes are H1..H16, people P1..P4, time is a day count.

**Labels.** REAL = counted from the journal (`player_ledger`, 492,583 rows from 2026-10-19) and the live tables. SIM = `docs/design/whole-game-audit-2026-11-20.md`, `tools/balance-sim/level-pace.json` and `skill-lines.json`. THIN = the cell rests on one person or under 20 hero-hours and is a direction, never a number to tune to.

## 0. What these numbers rest on

| | People | Accounts | Heroes | Heroes that hunted | Hunted hero-hours |
|---|---|---|---|---|---|
| Real players | 4 | 5 | 16 | 15 | 1,334 |
| Test accounts (left out of every table unless named) | 2 | 2 | 6 | 6 | 240 |

- **How real and test were told apart.** By the access allowlist's note for the account, nothing else: a note that opens with "QA", or a game master account, is test; every other account with a hero is real. Two accounts whose notes open with the same name are one person (one tester has two accounts, P1a and P1b). 58 more profiles exist with no hero; the game is closed behind the allowlist, so that is not a funnel number.
- **The concentration.** P1 (two accounts, 8 heroes) is 967 of the 1,334 hours (72%). P2 (4 heroes) is 349 (26%). P3 and P4 together are 18 hours (1.4%). Every figure past Level 46 is one person. Every figure past Level 15 is two people.
- **What the journal cannot say.** Only 339 hunt sessions are kept (older ones are pruned), so the tier is recorded on 29% of real hunt hours. Drop tables, XP per kill and monster stats changed many times in the window (v0.2.139 to 142), so a real rate is an average over several rule sets and the simulator is the newest one. Bonus XP events paid 3.29M Level XP in total (under 1% of the XP earned), so they do not explain any gap below.

## 1. The ten largest gaps between the simulator and real players

| # | The simulator assumes | Real players | Size | Trust |
|---|---|---|---|---|
| 1 | The reference player hunts alone on Normal; a party is other people | 91% of hunt hours are in a party and 76% are a four. Every one of those parties is one person's own four heroes. Hours with two people in one hunt: 0 | The reference player is 9% of real hours, nearly all under Level 16 | 2 people, 1,214 party hours |
| 2 | Lone pace table: Level 30 at 52 h, 40 at 103 h, 50 at 165 h | Median 32 h, 59 h, 72 h (12, 12 and 8 heroes) | 0.61x, 0.57x, 0.43x the table's hours, and widening with Level | 2 people past Level 10 |
| 3 | A Deadly four earns 1.7 to 2.3x a lone hero a head (the lone hero is 0.9 to 1.1 of the pace contract) | A four earns 2.98x the pace contract at Levels 45-64 (266 h) and 2.86x at 65-84 (183 h) | 1.3 to 1.7x the simulator's band for the same party | 45-64 two people, 65-84 THIN (one person) |
| 4 | The heavy account reaches Level 110 in 285 hunted hours a hero (about 176 h to 75 on the same curve, projected) | The one heavy four reached Level 75 in 100 to 119 hunted hours a hero | 0.64x the simulator's heavy player, 0.31x the lone table | THIN (one person, 4 heroes) |
| 5 | Hours a day: the table's player hunts 12; the heavy one up to 24 | 3.1 to 3.5 hunted hours a hero a calendar day without refills; 8.4 with them (81 refills, one person) | 0.26 to 0.70x | 3 accounts with 300+ hours |
| 6 | `refSkill`: the career hero has Melee 60 and Defense 45 at Level 60 | At 60 (4 heroes): main skill 50 to 53. Defense 50 on the front hero, 13 to 24 on the other three | Main -7 to -10. Defense +5 for one seat, -21 to -32 for three | THIN at 60; holds at 30 and 45 on 12 heroes (section 3) |
| 7 | Deaths: 0 in every simulated career (930 to 980 h) and 0 for a Deadly four | 22 deaths in 1,334 h. Alone: 8 in 120 h, 6.7 per 100 h. In a party: 14 in 1,214 h, 1.2 per 100 h. 17 of 22 are under Level 31 | The simulator has no early deaths at all | 2 people died; alone cell 120 h |
| 8 | A Deadly four buying at the store is 0.12M down by Level 70 | The four that reached 79 nets +9,078 gold a hero-hour from hunting (coin 11,372 + sold loot 4,061 - store 6,355), about +4.6M over 503 h | Sign flips. A third of the supplies used are home-made, which the simulator does not model | THIN (one person) |
| 9 | Only hunting is modelled; town skills are "hours you can't hunt" | Gathering 1,582 hero-hours and benches 516 against 1,334 hunted | Town work is 1.57x hunting, and 59% of every hero's life is idle | 4 people |
| 10 | The Tower: a Level 60 four tops out 66 to 70 floors past its Level, a Level 165 four at floor 169 | The only real climb: four heroes at Level 72 to 74 reached floor 182 and were stopped by the server, not by a death | At least 108 floors past its Level, above the simulator's Level 165 party | THIN (one climb) |

Smaller gaps, in section order below: coin a hero-hour is about 1.8 to 2x the simulator's lone wage under Level 30 (section 4); store supplies are 33% of gold out against the audit's 43%, and runes 55% of that against 72%; one account sits on 2.09M having spent 17% of what it earned.

Where the simulator and reality AGREE: sold loot is 16 to 34% of income by account (audit: 16-38%); a Rare-band drop comes every 0.5 to 2 hero-hours (audit: 0.5-1 h); rare rows land at the same share of their odds as common rows (section 5); the party skill lines for bow, mage and healer match real main skills within 1 to 4 levels at Levels 45 to 79.

## 2. Level pace

### Hunted hours to each Level (real heroes)

| Level | Heroes | Fastest | Median | Slowest | Lone table | Real / table |
|---|---|---|---|---|---|---|
| 5 | 15 | 0.1 | 0.3 | 0.5 | 0.32 | 0.94 |
| 10 | 12 | 2.5 | 5.6 | 14.4 | 6.3 | 0.89 |
| 15 | 12 | 4.7 | 12.6 | 20.7 | 17.9 | 0.70 |
| 20 | 12 | 7.2 | 16.9 | 29.0 | 26.6 | 0.64 |
| 25 | 12 | 11.0 | 23.7 | 41.7 | 37.0 | 0.64 |
| 30 | 12 | 16.3 | 32.1 | 57.2 | 52.5 | 0.61 |
| 40 | 12 | 30.7 | 58.9 | 81.2 | 103.1 | 0.57 |
| 50 | 8 | 42.7 | 71.7 | 117.4 | 165.4 | 0.43 |
| 60 | 4 | 58.1 | 68.9 | 74.5 | not in the table | THIN |
| 70 | 4 | 84.6 | 96.0 | 101.7 | not in the table | THIN |
| 75 | 4 | 99.8 | 113.0 | 118.8 | about 360 projected | 0.31, THIN |

The first five Levels match the table (15 heroes, 4 people). The split opens at Level 10, where players start partying their own heroes. The second account of the same person was faster at every Level than the first (Level 50 in 43 to 60 h against 83 to 117 h): a player who has done it once does it in half the time.

### Level XP and coin a hero-hour by Level band and party size

| Level band | Party | Heroes | People | Hero-hours | XP an hour | vs pace contract | Coin an hour | Deaths | Deaths per 100 h |
|---|---|---|---|---|---|---|---|---|---|
| 1-15 | alone | 14 | 4 | 78 | 27,807 | 1.39 | 1,894 | 7 | 8.9 |
| 1-15 | 2 | 9 | 2 | 59 | 43,047 | 1.50 | 2,516 | 3 | 5.1 |
| 1-15 | 3 | 5 | 1 | 22 | 105,901 | 3.45 | 5,353 | 3 | 13.9 |
| 1-15 | 4 | 6 | 2 | 29 | 77,643 | 2.34 | 4,135 | 0 | 0 |
| 16-30 | alone | 5 | 2 | 32 | 68,637 | 0.90 | 5,788 | 1 | 3.2 |
| 16-30 | 2 | 5 | 2 | 40 | 80,057 | 1.25 | 4,306 | 3 | 7.5 |
| 16-30 | 3 | 6 | 1 | 50 | 211,151 | 2.57 | 6,374 | 0 | 0 |
| 16-30 | 4 | 9 | 2 | 160 | 134,050 | 1.65 | 4,694 | 0 | 0 |
| 31-44 | alone | 3 | 1 | 3 | too thin | | | 0 | |
| 31-44 | 2 | 4 | 1 | 30 | 87,816 | 0.64 | 4,567 | 0 | 0 |
| 31-44 | 4 | 12 | 2 | 371 | 257,120 | 1.79 | 7,250 | 4 | 1.1 |
| 45-64 | alone | 5 | 1 | 7 | too thin | | | 0 | |
| 45-64 | 4 | 12 | 2 | 266 | 638,057 | 2.98 | 11,291 | 1 | 0.4 |
| 65-84 | 4 | 4 | 1 | 183 | 921,964 | 2.86 | 13,211 | 0 | 0 |

"vs pace contract" is the XP earned over what the pace table's player would earn at the same Levels for the same hours. Alone, real players sit at 0.9 to 1.4 of it, which is the simulator's own lone band. The gap is all in the four.

### By ground (grounds with 20+ real hero-hours; the tier where it was recorded)

| Ground | Tier | Mode | Levels | People | Hero-hours | XP an hour | vs contract | Coin an hour | Deaths |
|---|---|---|---|---|---|---|---|---|---|
| Mill Cellar | any | alone | 1-61 | 3 | 42 | 12,500 | 0.23 | 1,050 | 0 |
| Meadowbrook Thicket | any | alone | 3-31 | 2+ | 26 | 30,100 | 1.4 | 2,030 | 3 |
| Millrace Sewer | not recorded | alone | 6-31 | 2 | 48 | 64,741 | 1.06 | 5,061 | 5 |
| Millrace Sewer | not recorded | party | 4-41 | 2 | 126 | 71,892 | 1.10 | 4,931 | 4 |
| Wickstead | not recorded | party | 7-42 | 1 | 39 | 50,809 | 0.63 | 3,747 | 0 |
| Mosslight Glade | not recorded | party | 7-46 | 2 | 201 | 144,301 | 1.51 | 5,637 | 2 |
| Mosslight Glade | Deadly | party | 32-46 | 1 | 144 | 228,766 | 1.54 | 8,233 | 0 |
| Coppercap Warrens | not recorded | party | 10-55 | 2 | 415 | 340,163 | 2.24 | 6,577 | 5 |
| The Slake | not recorded | party | 47-63 | 1 | 52 | 1,162,554 | 4.89 | 18,259 | 0 |
| Pyre Field | Deadly | party | 60-72 | 1 | 100 | 871,741 | 2.96 | 14,289 | 0 |
| Krell's Hold | Deadly | party | 69-79 | 1 | 90 | 1,048,407 | 3.09 | 13,623 | 0 |

- **Coppercap Warrens is where real players live**: 423 of 1,334 hours (32%), entered from Level 10, at 2.24x the contract. Mosslight Glade is second with 347 hours. Wickstead, Hask's Ford and Muster Barrows together are 45 hours: the simulator's recommended path through them is not the path played.
- **The Slake at 4.89x the contract** (52 h, one person, Levels 47 to 63) is the single largest outlier. The simulator's Deadly four at Level 60 there is 2.32 x 255k = 592k a head; reality is 1.16M on unrecorded tiers and 870k on recorded Deadly. Treat as THIN, and as the first cell phase 2 should rerun.
- **Mill Cellar is hunted far over its Levels** (to Level 61, 0.23 of the contract): 42 hours that read as heroes parked there, not as play.
- Of the tier-recorded party hunts kept, 79 of 99 are Deadly; the 20 Normal ones are 4 hero-hours. Real players pick Deadly and stay there, as the audit said.

### By account size and by way

| Heroes on the account | Heroes | People | Hero-hours | XP an hour | vs contract | Coin an hour | Deaths per 100 h |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 12 | 15,704 | 0.87 | 1,014 | 0 (THIN) |
| 2 | 2 | 1 | 6 | 15,716 | 1.10 | 1,143 | 0 (THIN) |
| 4 | 12 | 2 | 1,316 | 368,432 | 2.39 | 7,784 | 1.7 |

No real account has three heroes. Nobody with one or two heroes has passed Level 9, so "account size" and "how far they got" cannot be separated yet.

| Way (the attack skill that earned the most that hour) | Mode | Heroes | Hero-hours | XP an hour | vs contract | Skill XP an hour | Defense XP an hour | Deaths per 100 h |
|---|---|---|---|---|---|---|---|---|
| Melee | alone | 13 | 99 | 39,089 | 0.94 | 13,531 | 11,219 | 8.1 |
| Magic | alone | 7 | 16 | too thin | | | | 0 |
| Ranged | alone | 3 | 5 | too thin | | | | 0 |
| Melee | party | 7 | 450 | 311,428 | 2.19 | 39,434 | 28,353 | 2.9 |
| Ranged | party | 3 | 265 | 441,573 | 2.45 | 46,531 | 98 | 0.4 |
| Magic | party | 6 | 499 | 447,000 | 2.62 | 45,139 | 962 | 0 |

In a party every death but one is the melee hero (13 of 14). The back row earns almost no Defense XP (98 and 962 an hour against the front's 28,353), which is the whole Defense gap in section 3. Magic and Ranged in a party out-earn Melee by about 1.4x in XP, but the Level mix differs, so this does not test the audit's "Mage 1.2 to 1.7x a hammer alone".

## 3. Skills against Level (the `refSkill` career hero)

Main skill / Defense at the moment each hero reached the Level, rebuilt from the journal.

| Level | Heroes | Main skill, range (median) | Career hero, alone | Defense: front heroes | Defense: everyone else | Career Defense, alone | Party line Defense |
|---|---|---|---|---|---|---|---|
| 10 | 12 | 14-21 (19.5) | 21 | 2-16 | 1-19 | 11 | 5-6 |
| 20 | 12 | 18-33 (30) | 32 | 21-30 | 2-24 | 19 | 7-9 |
| 30 | 12 | 22-41 (37.5) | 40 | 29-41 | 2-36 | 26 | 8-10 |
| 45 | 12 | 40-51 (46) | 53 | 41-52 | 2-37 | 34 | 14-17 |
| 60 | 4 | 50-53 | 60 | 50 | 13-24 | 45 | 15-17 |
| 75 | 4 | 58-62 | 68 | 58 | 15-30 | 53 | 15-17 |

- **Main skill runs behind the career line from Level 30 and the gap grows**: -2.5 at 30, -7 at 45, -8.5 at 60, -9 at 75. Party heroes level 2 to 3 times faster than the table, and skill XP does not speed up with them. Any formula that reads `refSkill(Level)` from the lone career line will over-state a real party hero's to-hit.
- **Defense is two populations, not one.** The hero taking the blows keeps Defense within 1 to 2 levels of its main skill (58/58 at Level 75). Everyone else stops training it (2 to 37 at Level 45). The lone career value sits between the two and describes nobody. The simulator's own party lines already carry the back row (15 to 17), but its party hammer line gives the hammer 17 where the real hammers, who are the tanks, hold 41 to 60.
- Four of 12 heroes fought for a stretch with a different attack skill than the one their weapon uses now, so they carry levels in a skill they no longer train. The simulator has no hero that changes its way.
- Inner Flame sits at 17 to 24 on 9 of the 12 leveled heroes and at 3 to 4 on the other three (the fastest account), with 16 bench hours in total across everyone.

## 4. Gold

### Every source and sink (real accounts, per hunted hero-hour)

| Source | Gold | Share of gold in | Per hunted hour | People |
|---|---|---|---|---|
| Monster coin | 10,261,718 | 72% | 7,691 | 4 |
| Loot sold to the shop | 3,753,101 | 26% | 2,813 | 3 |
| Tamsin's tally | 249,155 | 2% | 187 | 4 |
| Starting gold | 8,000 | 0% | 6 | 4 |
| **Total in** | **14,271,974** | | **10,696** | |

| Sink | Gold | Share of gold out | Per hunted hour | Uses | People | Days since last use |
|---|---|---|---|---|---|---|
| Store supplies on the hunt | 3,782,502 | 33% | 2,835 | 71,660 | 4 | 0 |
| House rooms | 2,844,800 | 25% | 2,132 | 65 | 2 | 3 |
| Tempering | 2,503,000 | 22% | 1,876 | 59 | 1 | 1 |
| Stamina refills | 840,534 | 7% | 630 | 81 | 1 | 1 |
| Hero slots | 330,000 | 3% | 247 | 7 | 2 | 13 |
| Farm plots | 293,000 | 3% | 220 | 14 | 2 | 5 |
| Storage chests | 155,000 | 1% | 116 | 7 | 1 | 11 |
| House training dummy | 150,000 | 1% | 112 | 1 | 1 | 4 |
| Shop supplies, seeds, jewelry | 140,895 | 1% | 106 | 110 | 2 | 1 |
| House properties | 109,100 | 1% | 82 | 11 | 3 | 10 |
| Town Works | 57,000 | 0.5% | 43 | 6 | 1 | 0 |
| Storage rungs | 40,217 | 0.4% | 30 | 6 | 1 | 3 |
| Hearth powders | 38,000 | 0.3% | 28 | 8 | 1 | 0 |
| Boss calls | 30,000 | 0.3% | 22 | 1 | 1 | 11 |
| Replant seeds | 15,995 | 0.1% | 12 | 143 | 2 | 5 |
| Bench tax | 13,705 | 0.1% | 10 | 2,044 | 3 | 0 |
| Tavern rounds | 10,000 | 0.1% | 7 | 2 | 1 | 1 |
| Blessings | 6,345 | 0.1% | 5 | 30 | 2 | 3 |
| Market listing fees | 2,150 | 0% | 2 | 7 | 1 | 2 |
| **Total out** | **11,362,243** | | **8,516** | | | |

Net +2.91M, of which 2.09M sits in one purse. Store supplies by kind: runes 55%, drinks 20%, ammunition and whetstones 13%, food 12%. Real players also used 279,190 home-made supplies against 572,443 bought (33% of all units used).

- **Three sinks are 80% of gold out, and two of them rest on one or two people.** Tempering is one person. House rooms are two. Take those two people's one-time buys away and gold out is supplies and almost nothing else.
- **Blessings are 0.06% of gold out** while 18 of 22 deaths were Blessed. The audit's "too cheap" holds: the whole population spent 6,345 gold on them.
- **Refills: 81 uses, 840k gold, one person, 7% of gold out.** That one account hunted 8.4 hours a hero a day against 3.1 to 3.5 for the others, so the refill is doing what the audit said (about double the hours), for one player.

### By account

| Account | Heroes | Top Level | Hunted hero-hours | In per hour | Coin per hour | Sold per hour | Sold share of income | Store supplies per hour | Supplies / coin | Out per hour | Purse now |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1a | 4 | 55 | 464 | 8,234 | 5,251 | 2,792 | 34% | 739 | 14% | 6,941 | 600,249 |
| P1b | 4 | 79 | 503 | 15,724 | 11,372 | 4,061 | 26% | 6,355 | 56% | 15,331 | 212,207 |
| P2 | 4 | 46 | 349 | 7,220 | 5,978 | 1,186 | 16% | 690 | 12% | 1,220 | 2,091,371 |
| P3 | 1 | 9 | 12 | 1,098 | 1,014 | 0 | 0% | 5 | 0% | 5 | 13,124 |
| P4 | 2 | 8 | 6 | 1,458 | 1,143 | 37 | 3% | 233 | 20% | 335 | 7,180 |

- **Two opposite players at the same size.** P1b spends 97% of what it earns and holds 0.2M. P2 spends 17% and holds 2.1M with nothing it wants to buy. A sink plan sized on "players buy the sinks" describes one of the two.
- **Store supplies jump from 12-14% of coin to 56% of coin** between the accounts hunting at Levels 30 to 55 and the one on Deadly at 60 to 79. From the kept sessions: a Deadly party pays 5,730 gold a hero-hour at the store against 11,822 coin (48%) and takes 22,536 damage a hero-hour; an untiered party pays 427 against 5,626 (8%) and takes 2,535.
- **P3 sold nothing in 12 hours** and spent about 60 gold. The first-hours player has not found the shop's sell side or the store.

### Purse over account age (gold in minus gold out, by day)

| Account | Day 1 | Day 3 | Day 7 | Day 14 | Day 21 | Now |
|---|---|---|---|---|---|---|
| P1a | 7,640 | 111,930 | 183,107 | 1,245,819 | 600,249 | 600,249 |
| P1b | 73,668 | 184,995 | 12,027 | 65,168 | | 212,207 |
| P3 | 2,920 | 13,124 | | | | 13,124 |

P2 and P4 are older than the journal, so their curves start mid-life and are left out. Two curves from one person are not a purse curve. What they do show: a purse of 1.2M by day 14 on a first account, and a second account that started richer (73k on day 1, against 7.6k) and was spent down to 12k by day 7.

### Coin a hero-hour by Level band (real) against the simulator's lone wage

| Level band | Heroes | Hero-hours | Real coin an hour | Simulator, lone tank, coin an hour |
|---|---|---|---|---|
| 1-15 | 15 | 187 | 2,829 | 696 at Level 4, 1,416 at Level 10, 1,948 at Level 13 |
| 16-30 | 12 | 282 | 5,059 | 2,878 at Level 24 |
| 31-44 | 12 | 409 | 7,030 | |
| 45-64 | 12 | 273 | 11,033 | |
| 65-84 | 4 | 183 | 13,211 (THIN) | |

## 5. Items

### Drops against the odds of their rows

A party kill is journalled on every seat but drops once, so for accounts that partied, every band lands near a quarter of "kills x row odds". The common band is the control the rare band is read against.

| Band | Accounts that partied: dropped / expected | Ratio | Accounts always alone: dropped / expected | Ratio |
|---|---|---|---|---|
| Common | 458,822 / 1,647,327 | 0.28 | 6,298 / 6,927 | 0.91 |
| Uncommon | 35,067 / 136,513 | 0.26 | 530 / 609 | 0.87 |
| Scarce | 33,206 / 146,252 | 0.23 | 147 / 167 | 0.88 |
| Rare | 1,921 / 6,763 | 0.28 | 5 / 9.4 | THIN |
| Trophy | 6 / 14.7 | 0.41 | 0 / 0 | THIN |
| Key | 50 / 188 | 0.27 | | |

- **Rare rows drop at their designed odds**: 0.28 against the commons' 0.28. Nothing is over- or under-paying by band. Scarce runs a little low (0.23), which is the drop tables changing inside the window more than a bug.
- **Trophies: 6 dropped, 2 still held.** Against the control that is 1.5x the designed rate, on six drops. Too thin to call.
- **1,568 Rare reveal notices** went to real players. On Coppercap Warrens a hero sees a Rare-band drop every 0.5 hero-hours, so a four-hero account sees one about every 7 minutes. A reveal at that rate is not a moment (the audit's change 6).

### Gear pieces a hero-hour by ground

| Ground | Hero-hours | Gear pieces an hour | Tier | Rare-band drops an hour |
|---|---|---|---|---|
| Mill Cellar | 43 | 3.9 | 1 | 0.02 |
| Meadowbrook Thicket | 41 | 16.7 | 1 | 0.39 |
| Millrace Sewer | 174 | 14.8 | 1-2 | 0.49 |
| Wickstead | 40 | 26.0 | 1-2 | 1.40 |
| Mosslight Glade | 347 | 29.2 | 2 | 1.51 |
| Coppercap Warrens | 423 | 27.3 | 3 | 2.05 |
| The Slake | 67 | 49.1 | 4 | 1.94 |
| Pyre Field | 100 | 28.0 | 5 | 1.50 |
| Krell's Hold | 90 | 26.2 | 6 | 0.99 |

About 26 to 29 gear pieces a hero-hour from Level 10 on, which is over 100 an hour for a four. The Slake at 49 is the outlier again.

### What players do with gear

| | Pieces | Share of dropped |
|---|---|---|
| Dropped | 34,756 | |
| Sold to the shop | 29,949 | 86% |
| of those, sold by a loot rule (set once) | 15,157 | 44% |
| of those, sold by hand | 14,792 | 43% |
| Put in Storage | 1,132 | 3% |
| Taken back out | 894 | |
| Listed on the market | 1 | 0.003% |
| Salvaged | 0 | not built |
| Distinct pieces ever worn | 298 | 0.9% |
| Held now: bag / Storage / worn | 4,930 / 232 / 139 | |

- **Gear is shop gold. 86% is sold and 0.9% is ever worn.** That matches the audit and is the strongest real evidence for Salvage.
- **First principle, flagged:** 14,792 pieces were sold by hand, each one a decision already made. Loot rules exist (1,406 rows) but on 2 of 5 accounts; the other three have none. The rule is not being found, or not offered at the moment the player first sells.
- 4,930 gear pieces sit in bags against 139 worn: bags are full of gear waiting to be sold.

## 6. Use of every system

"Uses" are journal rows or table rows from real accounts. Days since last real use is the §3.4 vital: **zero for two days is a P1.**

### Never used by a real player

| System | Real uses | Test uses | Note |
|---|---|---|---|
| Clans, clan castles, clan stores, feasts, the castle board | 0 | 0 | No row from any account, test or real |
| Parties with another person | 0 hours | 0 | 65 parties were made; every one is one account's own heroes |
| Friends | 1 link in total | | 0 requests pending, 0 whispers |
| Party finder | 0 | 0 | |
| Market: buying | 0 | 3 | 7 real listings, 4 cancelled or expired; the only 3 sales ever went to a test account. No real player has bought anything |
| Crowns and anything bought with them | 0 | 0 | 0 Crowns in any purse |
| Town Crier | 0 | 0 | |
| Titles | 0 | 3 | |
| Hero dyes | 0 | 3 | |
| Hero renames | 0 | 0 | |
| Action bar setup slots (bought) | 0 | 0 | 18 free setups are saved across all 5 accounts, so the feature is used and the paid slot is not |
| Hallmark fees | 0 | 0 | |
| Scaled hunts | 0 | 1 | |
| Training items | 0 | 0 | |
| Factions | 0 | 0 | QA switch only |
| World finds, lucky finds, bounties, workers, cosmetics | 0 | 0 | |
| The Catacombs | dark | | |

### Used by one person only (THIN: a system one player uses is not yet a system players use)

| System | Uses | Days since last |
|---|---|---|
| Tempering | 59 | 1 |
| Stamina refills | 81 | 1 |
| The Burning Tower | 1 climb (4 heroes, floor 182, 3.5 hero-hours), 72 keys earned. It paid 275k Level XP an hour against about 1.05M on Krell's Hold the same week (0.26; the audit says about 0.5) | 1 |
| Hearth Chest | 49 opens journalled, 23 kept as rows: 19 Platinum, 2 Gold, 2 Bronze; 1 weapon, 5 stokes | 1 |
| Boss called out (paid) | 1 | 11 |
| Boss hall (key) | 1, with 4 daily boss loots | 1 |
| Training (House dummy) | 5 sessions, 13.6 hero-hours, 30,000 skill XP an hour | 1 |
| House training dummy bought | 1 | 4 |
| Storage rungs, Storage chests | 6, 7 | 3, 11 |
| Storage: withdraw | 812 | 1 |
| Loot plan dispatch after a hunt | 110 | 1 |
| Town Works gifts | 6 | 0 |
| Hearth powders, tavern rounds | 10 | 0 |
| Hearth: fuel burned, flames lit | 3 | **15** |
| Market: listing | 7 | 2 |

### Used by two or more people

| System | Uses | People | Days since last |
|---|---|---|---|
| Hunting (settles) | 152,027 | 4 | 0 |
| Store supplies on the hunt | 71,660 | 4 | 0 |
| Own supplies on the hunt | 47,507 | 4 | 0 |
| Gathering | 53,810 | 3 | 0 |
| Crafting, cooking, smithing, runecrafting | 21,164 | 3 | 0 |
| Farming: plant / water / harvest | 599 / 1,361 / 706 | 4 / 4 / 3 | 0 |
| Farm plot upgrades | 14 | 2 | 5 |
| Shop: loot sold | 12,935 | 3 | 1 |
| Storage: deposit | 1,713 | 2 | 0 |
| Equip | 463 | 4 | 1 |
| Tamsin's tally: taken / paid | 85 / 176 | 4 | 1 |
| Blessings bought / used | 99 / 18 | 4 / 2 | 3 |
| House rooms | 65 | 2 | 3 |
| House properties | 11 | 3 | **10** |
| Hero slots | 7 | 2 | **13** |
| Saved hunt presets | 9 | 2 | |
| Chat lines | 374 | 4 | 0 |

**House.** All eight rooms are at rung 4 on two accounts; the Kitchen and Garden are also bought on a third. Properties: Homestead on 4 accounts, Farmstead 3, Keep and Manor 2. Farm plots are at level 4 to 5 on three accounts with 8 to 14 crops planted now. Farming is the one town system all four people use.

**Tempering** (one person): blows and armor tracks at tier 3 to rung 5, tier 5 to rung 2-3, tier 6 to rung 3-5. The player re-buys the track at each gear tier, which the audit's "six systems sell the same thing" should read as a recurring sink that works for the one player who found it.

### Crafting and gathering by recipe (hero-hours, top rows; 123 recipes and 37 nodes were used at least once)

| Bench | Hero-hours | Top recipes (hero-hours) |
|---|---|---|
| Crafting | 187 | saw yew 83, saw maple 43, saw runewood 18, saw normal 17, fletch mithril arrows 7.5 |
| Cooking | 133 | frostfin 43, swordfish 36, shrimp 21, shark 15, lobster 6 |
| Smithing | 117 | smelt mithril 62, smelt iron 14, smelt ember 8, smelt steel 6, whetstones 14 in total |
| Runecrafting | 33 | cut rune blanks 18.5, then 20 rune recipes at 0.2 to 2.6 each |
| Prayer (bury bones) | 30 | last used 25 days ago |
| Inner Flame (fuels) | 16 | last used 1 to 15 days ago by fuel |

| Gathering | Hero-hours | Top nodes |
|---|---|---|
| Mining | 737 | rich coal 160, deep mithril vein 137, essence rock 121, mithril rock 65, coal 63 |
| Woodcutting | 427 | runewood 97, elder yew 93, normal tree 69, yew 55, maple grove 42 |
| Fishing | 418 | shrimp 124, swordfish deeps 64, frostfin reach 63, frostfin 52, shark 41 |

- **Bench time is intermediates and supplies, not gear.** Sawing planks, smelting bars, cooking fish and binding runes are over 95% of bench hours. Every gear recipe together (forged weapons, sewn armor, cloaks, strung bows) is under 2 hero-hours: about 440 pieces made against 34,756 dropped. Crafted gear does not compete with drops.
- **Tools are the gear players do craft**: 34 axes and 34 pickaxes forged across four tiers, on two accounts.
- **Jewelry**: 72 seam jasper bands, 17 banded signets made, 4 set. One account.
- **Meals** (pies, chowder, soup): 1 of each, made once, 19 to 27 days ago, never again. Plain cooked fish is what gets eaten.
- **Prayer has had no use in 25 days.** If bones still have a purpose it is not reaching players.

## 7. Time

| Account | Days with a press / days since first | Back on day 2 | Back on day 7+ | Days since last press | Visits | Visits a day played | Median visit, minutes | Median away, hours | Hunted hours a hero a calendar day | Hunt hours per hour at the screen |
|---|---|---|---|---|---|---|---|---|---|---|
| P1a | 20 / 33 | yes | yes | 12 | 128 | 6.4 | 5 | 1.7 | 3.5 | 10 |
| P1b | 15 / 15 | yes | yes | 0 | 99 | 6.6 | 4 | 1.8 | 8.4 | 14 |
| P2 | 16 / 28 | yes | yes | 0 | 30 | 1.9 | 3.5 | 11.1 | 3.1 | 116 |
| P3 | 2 / 6 | yes | too young | 4 | 2 | 1 | 3 | 6.3 | 2.0 | 120 |
| P4 | 5 / 13 | yes | yes | 5 | 8 | 1.6 | 2 | 14.1 | 0.2 | 1.3 |

A visit is a run of presses with no gap over 30 minutes; only presses the journal records are seen, so reading the screen without pressing is invisible and visit lengths are a floor.

- **Hero-hours, all real heroes:** hunting 1,334 (16% of hero life), gathering 1,582 (19%), benches 516 (6%), training 14, idle 4,930 (59%).
- **Two ways of playing the same game.** P1 checks in six times a day for about five minutes and is away under two hours. P2 checks in twice a day for under four minutes and is away eleven hours. Both are four-hero accounts; the second gets 116 hunted hero-hours for every hour at the screen.
- **A visit is 2 to 5 minutes at the median.** The away-and-return moment is the game for these players, and it has to fit in that.
- **Return:** all 5 accounts came back on day 2; 4 of 4 old enough came back on day 7 or later. Counts, not rates.
- **Kept hunts (249):** median 0.8 hours. Ended by: a party member leaving 99, the player leaving 56, stamina 42, the server 19, a party member dying 17, the hero dying 7, the boss felled 4, the hour limit 1. **No kept hunt ended on supplies or on gold.** After the hunt: nothing set 169, a job 71, wait 9.
- **First principle, flagged:** 99 of 249 hunts ended because another hero of the player's own party left. With four heroes on one account, starting, stopping and re-supplying the party risks being the same decision made four times, and 68% of hunts have no after-hunt choice set. Worth a played check of how many presses a four-hero restart takes.

### Where each lapsed account stopped

| Account | Top Level | Hunted hours | Last press, days ago | Its last presses | What it had not touched |
|---|---|---|---|---|---|
| P1a | 55 | 464 | 12 | sent heroes to gather and to a bench, a Town Works gift, a Hearth powder | Nothing: the player moved to a second account and is active there |
| P3 | 9 | 12 | 4 | six hunt packs in a row | Never sold an item, never gathered or crafted, spent about 60 gold, one hero |
| P4 | 8 and 7 | 6 | 5 | sent both heroes to gather and to a bench | Hunted on one day only; 101 hours gathering and 18 at benches |

P3 and P4 are the only two real players who are not the two heavy ones, and they stopped at Levels 7 to 9 in opposite ways: one only hunted and never met the town, one went to the town and never came back to the hunt. Neither reached Level 10, where the heavy players' pace takes off. Two people is not a pattern, but it is the whole first-week sample this game has.

## 8. Deaths

| | |
|---|---|
| Real deaths | 22, on 2 people and 3 accounts |
| Per 100 hunted hours | 1.65 overall; 6.7 alone (8 in 120 h); 1.2 in a party (14 in 1,214 h) |
| By Level band | 13 at 1-15, 4 at 16-30, 4 at 31-44, 1 at 45-64, 0 at 65-84 |
| By killer | cistern spider 5, Chief Coppercap 5 (one of them called out), culvert bat 3, hobgoblin foreman 2, gray wolf 2, six others 1 each |
| On recorded Deadly | 2 deaths in 359 hero-hours (both on Coppercap Warrens) |
| What a death cost | 21 of 22 lost 2% of Level XP, 1 lost 6%. 18 used a Blessing. 332,552 Level XP lost in total |

- The simulator reports 0 deaths everywhere and says no death rate can be read from it. Reality has one, and it is **early and alone**: 8.9 per 100 hours alone at Levels 1 to 15, in the Sewer and the Thicket. The Millrace Sewer alone is 10.4 per 100 hours for a lone hero.
- Late and in a party, death is nearly gone: 1 death in 449 hours past Level 45, and the total XP all real players have ever lost to death is about 20 minutes of one Level 75 hero's hunting. Death is not a stake for the players who are furthest in.

## 9. What phase 2 should take from this

1. **Model the real reference player**: one person running a four of their own heroes on Deadly from Level 10, a few hours a hero a day, with a third of supplies home-made. Keep the lone Normal hero for Levels 1 to 15, where real players are alone and where they die.
2. **Read skills from two lines, not one**: the party front (Defense about equal to the main skill) and the party back row (Defense 15 to 30), with main skill 7 to 10 under the lone career line by Level 60.
3. **Rerun the four on the Slake, Pyre Field and Krell's Hold** against the 2.9 to 4.9x measured, and the Tower against a Level 73 four at floor 182.
4. **Add the town to the model**: 1.57 town hours for every hunted hour, feeding a third of supply use.
5. **Treat social and market balance as unmeasured**: there is no trade, no clan and no two-person party to hold any number against. Phase 4 needs synthetic load or a larger playtest for those domains.
6. **Size sinks against both spenders**: the one who spends 97% and the one who spends 17%.
