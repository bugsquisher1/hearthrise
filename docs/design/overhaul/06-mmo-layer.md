# Chapter 06: the MMO layer and social play

Part of "Hearthrise: the game we are building". This chapter is the whole design for everything one account shares with another: world bosses, clans, events, the two arenas, presence, mixed Levels, chat, friends and factions. It stands on its own. The Crowns engine is chapter 04 and is only linked here.

**Status words.** RULED is Tyler's ruling, with its date or id. DECIDED carries the call id and "Fable 2026-11-21": the game designer decided the call and an adversarial check corrected it, and its row is in `decisions/all.json` (the five calls this chapter raised are MM-44 to MM-48). DECIDED (reversal, Tyler may veto) changes one of Tyler's rulings, names it at the first tag, and stands unless he vetoes it. TYLER CONFIRMS is a money call or a grant with the one recommendation. CUT (Tyler approves) is a removal that waits for his yes. OPEN has no decision yet.

**Number labels.** TARGET is a number the design aims at. COMPUTED is arithmetic on targets or evidence, with the method beside it. ESTIMATED leans on a number nobody has measured for this design. EVIDENCE is a measured fact used only to support a proposed rule. HYPOTHESIS is a belief about fun that only a playtest settles.

---

**The status words, re-issued 2026-11-21.** Tyler adopted the critical review (`review/00-critical-review.md`), and the book now uses three honest words. They replace the list above. **DECIDED** means evidence and rulings support it. Where Tyler also said yes on the page, the tag says so. **PROVISIONAL** means a reasonable plan that has not been tested, and the first tag in a chapter names what it waits on. **OPEN** means it waits on Tyler. **RULED** is kept only for what Tyler ruled knowing what it was: his typed words, his own executive decisions, and a pick where he wrote a note, and his answers at the sitting of 2026-11-21, where he saw every option's cost. A quick pick on the page is a real yes and reads "Tyler said yes on the page", never RULED. **PROPOSAL** marks a design made in the fold of 2026-11-21 that Tyler has not seen. CUT and KEPT record his picks on the cut list. The record is `decisions/all.json` and `00-the-game.md`.

## 1. The experience

**The fact the layer stands on.** In an idle game players are almost never at the screen together, and their heroes are almost always in the world together. EVIDENCE: among four testers over 33 days, two people pressed in the same ten minutes in 5 of 675 windows, and two people's heroes hunted in the same hour in 46 of 452. The sample is thin and only the direction matters. So other players do not matter minute to minute. They matter at the check-in.

**The promise.** TARGET: every visit of 2 to 5 minutes shows at least one thing another person did since the last visit.

**Minute 5.** A new player has four heroes and a town with other heroes working in it, whether or not their owners are awake. Global chat is open and people are talking. The first ground's card says "3 other parties are hunting here" with names and clan tags. Nobody has to be asked for anything, and nothing is locked behind finding a group.

**Hour 20.** The player is in a clan they joined from the browser in a minute. A visit opens on clan chat, the castle's progress and who gave. Their standing gift went out on Monday, so the four hunt with the war room's bonus all week. On Friday a banner said a world boss stands. They picked a tier, saved a boss kit and sent the four. On the next visit the server's health bar has dropped from 61% to 38%, the page names the parties in the fight, and their clan's share is on it. When it falls a chest is waiting, with a chance at a named piece nobody can get anywhere else, and a 7-day buff either way. They have spent a few arena tickets in the Even Arena and seen their bars beat a named person's bars.

**Hour 2,000.** The player's hero sheet reads "Buffs: damage +13% of 15, Level XP +30% of 30", and each point of it was chased: clan rooms raised over months, last weekend's boss, a season tier in each arena. Their four wear two boss pieces reforged up three bands and an Open Arena piece. Other boss pieces went to the market, where players who sold Crowns for gold bought them. Their clan sits third on the weekly board. They know a dozen names from the ladder, the plaques and the presence strip, and have never needed any of them online at the same minute.

---

## 2. The design

### 2.1 Rule 0

**Every shared feature works while both players are asleep.** Heroes meet. Owners check in. A feature that needs two people at the screen in the same minute is not in the game. PROVISIONAL (MM-1, waits on a playtest that shows whether players ask for what was removed, Tyler said yes on the page, decide first).

It is the test every system below passed, and the test any later social feature must pass. Two more standing rules follow from it and from the build rule that balance lives at the formula layer (RULED 2026-11-21).

| Rule | Status |
|---|---|
| Nothing in the layer grows with players times players. A shared thing is one row the server folds, never a fight between many accounts | PROVISIONAL (MM-1, MM-2, Tyler said yes on the page), cost sized in chapter 09 |
| No reward has code of its own. A buff is a row in the modifier table. A piece of gear sits on the gear curve | PROVISIONAL (MM-24, waits on one buff played in a cell). The formula-layer rule itself is RULED 2026-11-21 |
| The layer pays buffs and gear. Never honors alone | RULED 2026-11-21 |
| Every shared write is server-owned, clamped and journalled, and the whole layer is in the one Security review before Early Access | RULED (CLAUDE.md sections 1 and 2) |

### 2.2 The modifier table and the buff caps

**The rule.** Every buff in the game is a row in one modifier table (formula step R20 of the formula architecture): the knob it moves, its size, its clock, and how rows combine. Rows on one knob sum, then a cap applies. Each knob has two caps, one for standing buffs and one for timed buffs. PROVISIONAL (MM-24).

**Standing** buffs come from clan rooms and last as long as the member keeps giving. **Timed** buffs come from the world boss, the clan's weekly goal, the clan board, the arena seasons, events, and the two boosts the store sells for gold (chapter 04, section 2.8). A bought boost and an earned buff are the same row and fill the same timed cap, so earning one saves gold and buying one never stacks above it (PROVISIONAL, MM-30, Tyler said yes on the page, owned by chapter 04).

**The caps.** All TARGET. PROVISIONAL (MM-25).

| What it moves | Knob (`knobs.json`) | Standing cap | Timed cap | Fully buffed |
|---|---|---|---|---|
| Damage dealt | `playerAttack` | +5% | +10% | +15% |
| Protection | Defense rating rows, each sized on the matrix so a mid-geared four takes this much less damage an hour (CORE-4) | about 5% less | about 5% less | about 10% less |
| Level XP | `xpPerKill` | +5%, the Library (PROVISIONAL (CH11-2, `11-on-call-and-clan-xp.md`)) | +25% | +30% |
| Material find | the material term of the drop formula. No knob in `knobs.json` yet | none | +10% | +10% |
| Coin from kills | `coinPerKill` | none | none | none, ever |
| Town work speed | no knob in `knobs.json` yet | +10% | none | +10% |

- **The +25% timed Level XP cap is the ruled event ceiling.** RULED 2026-11-20 (27-5): never above +25% and never two at once. Only the Hearthrise weekend fills it, from +10% to +25% by the size of the fire (CE-8). No Level XP boost is sold (MM-29-XP). A clan room pays a standing Level XP bonus (RULED, Tyler 2026-11-21, the sitting, S-4), which reverses 25-2. Its size is PROVISIONAL (CH11-2, `11-on-call-and-clan-xp.md`): +0.5% a Library level and +5% at level ten, a new standing cap on Level XP.
- **Protection is written on the Defense rating.** Anything that takes a share off a blow stops at the 60% mitigation cap, and plate of its Level sits at that cap from Level 110 on. So a defensive buff makes monsters land less often, which a capped tank still feels. One check is owed before these rows are final: the to-hit formula needs its own floor, so rating rows cannot stack into a second way past the cap. MEASURED in `12-balance-pass.md` (R1 and R2): the built damage cut does nothing for a capped hero, median 0.0% in 24 cells. So the rating row is owed before any protection buff is sold or earned. PROVISIONAL (CORE-4).
- **No coin buff, ever.** Gold enters the world from kills and leaves through sinks. A buff that mints gold for the buffed raises prices for everyone else and would let money mint gold. PROVISIONAL (MM-25).
- **Material find is not Luck.** Luck has two feeds and no more (RULED 2026-11-20). The row adds 10% to rows tagged as materials: monster parts, lining parts, hides, ore, gem chips and gems below Rare. It never touches a Rare, Very Rare or Trophy row, a gear row of any rarity, a key or a seed. It is earned only and never sold, and the rivet allowance is computed without it. PROVISIONAL (CE-2).
- **Caps are sizes inside the gear framework.** A weapon step is worth 5% to 8%, best gear is about 15% faster and takes about 15% less damage than mid gear (RULED 2026-11-21), and a gear band is about 17% (TARGET, GR-4).

**The power budget.** PROVISIONAL (MM-26, decide first with GR-6).

| Step | Kill speed | Level pace | Label |
|---|---|---|---|
| A plain four in mid gear on suggested talent builds, with no buffs | 1.00 | 1.00 | the reference, which is the clock of the Level table (RULED 2026-11-21) |
| Best in slot for the band, which a boss or arena piece is one way to reach | 1.15 | 1.15 | RULED size, 2026-11-21 |
| Plus both damage caps, +15% | 1.32 | 1.32 | COMPUTED, 1.15 x 1.15 |
| Plus the timed Level XP cap, +25%, on a Hearthrise weekend | 1.32 | 1.65 | COMPUTED, 1.32 x 1.25 |
| Paying alone: best gear sooner and a +6% damage boost | 1.22 | 1.22 | COMPUTED, 1.15 x 1.06 |
| The fastest talent build over the suggested one, on top of every cap | 1.34 | about 1.67 | COMPUTED, 1.65 x 1.012. PROVISIONAL (TAL-1, `10-level-choices.md`) |

There is one ceiling. It is a reading held by a test and never a new limit, and chapter 04 quotes the same numbers (MM-31). With Talents in, the reference is a plain four on suggested builds and the ceiling reads about 1.67, because the fastest build is at most 1.2% faster than the suggested one. MEASURED in `12-balance-pass.md` (R1 and R2): every cap full reads 1.29 to 1.48 times a plain four, median 1.33, and paying alone about 1.06 to 1.08, because a four's kills are set by how fast monsters come and not by how hard it hits. Tyler's yes on the page to 1.65 and about 1.22 stands as written, and the measured readings are item 4 of chapter 12 section 7 for him. The edge is a step to the next tier, worth 20 to 29%. As computed before the measurement, with the Library full the readings are about 1.74 on a Hearthrise weekend and about 1.44 held all the time (COMPUTED in `11-on-call-and-clan-xp.md` section 2.4, PROVISIONAL). The table sums rows on one knob, which is why the weekend reads 1.74 and not the 1.73 the sitting quoted. With every cap full a four reads 1.65 times a plain mid-geared four in Levels an hour and 1.32 in kills an hour, with about 10% less damage taken an hour and 10% more materials. Nobody holds 1.65 outside a Hearthrise weekend. Paying alone reads about 1.22. A player who earns every buff and buys nothing averages about 1.3 times the plain pace over a month. The kill speed is less than two gear bands (COMPUTED, 1.17 squared is 1.37). Most of the gain is timed and lapses when the player stops earning or buying it. Nothing in it lets a hero wear a higher band, enter a ground sooner or skip a Level.

**What the player sees.** One line on the hero sheet: "Buffs: damage +11% of 15, Level XP +25% of 25." A player always knows what is filled and what is left to chase. PROVISIONAL (MM-24).

**Where buffs are read.** Buffs are read with the hero's other modifiers at the settle, so they add no server statement. In the Even Arena no buff is read. The Open Arena reads standing buffs and bought boosts under the same caps, and never reads a timed buff that an arena paid. Level XP and material find do nothing in either arena. PROVISIONAL (MM-13, waits on the engine test of heroes against heroes). HYPOTHESIS.

### 2.3 World bosses

**The form.** A world boss is one health pool for the whole server. An account sends its own four into its own boss room, where the boss is scaled to that party. What the party does comes off the shared pool. When the pool is empty the boss falls for everyone. PROVISIONAL (MM-2, waits on the hall check at three Levels and one boss stood, decide first). This is the deliberate redesign of live world events that the 2026-10-22 ruling asked for.

**The sample boss is Mossback.** RULED by the designer 2026-11-21 (D-6), `review/06-designer-rulings-w1.md` section 2. He is a huge old brook bear from Mosslight Glade who comes down the Meadowbrook for the honey under the mill. He is fought at the Mill Pond, in each party's own room, on the one monster formula. Rook's poachers come out of the trees at half his health. He never dies in the room. Both names are new and not in the game's data yet. The points rule gains `bossTierPm`, read from the one tier table.

Why a pool and not one big fight: the one combat engine runs a party of up to four in its own instance (RULED, CLAUDE.md section 6). A shared pool puts "the server is killing this together" on the screen without a second engine.

**The window.** A boss stands for about 72 hours over a weekend, and never appears at a set hour. PROVISIONAL (MM-3). Heroes fight with the browser closed, on stamina, exactly like a hunt.

**The room.** The boss is written by the one monster formula as the boss role times a hall number (GR-30), at the party's Level by the same scaling rule that lets an old ground be hunted at a hero's own Level (GR-9). It has the ruled boss phases: adds at half health, an enrage at a quarter, a real boss bar (RULED 2026-11-05). The player picks a tier from the one tier table (GR-27). The room's boss does not die. It is fought for as long as the party stands and has stamina. The hall number acts on the boss's health only, never on his blows, and the room takes no win-rate target. PROVISIONAL (MM-5). HYPOTHESIS until the hall grader plays it at Levels 25, 52 and 75.

**Contribution.** PROVISIONAL (MM-5).

- `points = boss bars broken in the room x the tier's multiplier`. A bar is the scaled boss health for the party's Level. When it empties it refills and the phases run again. The multiplier reads the one tier table (`tierXp`), so Deadly pays more than Normal and no new table exists.
- Points are counted against the party's own Level, because the room is scaled to it. A Level 20 four and a Level 300 four take the same share of the pool for the same quality of fight. A new account matters on its first weekend. A veteran matters by daring a harder tier and living.
- The pool is measured in points, since raw damage in scaled rooms cannot be compared.

**Size.** PROVISIONAL (MM-4).

- `pool = max(bossPoolFloor, bossPoolPerAccount x weekly active accounts)`, counted by the server when the boss stands. Both knobs are new rows.
- TARGET: the boss falls in 36 to 60 hours on a server of 10 and on a server of 10,000. After each boss the server re-sizes `bossPoolPerAccount` from what that weekend really earned, aimed at a fall at hour 48 and moved at most a quarter each time.
- The room stays open to the end of the window. A boss that falls on day one still pays an account whose visits come later, and when the window ends the boss leaves whether it fell or not. HYPOTHESIS.
- TARGET sizes, COMPUTED from the playtest targets of section 6 and a HYPOTHESIS until a boss has stood: `bossPoolPerAccount` is the points of about 6 Normal party-hours (an account spending a quarter of the 36 stamina hours a 72-hour window holds at 12 hunted hours a day, with the fall at two thirds of the window). `bossPoolFloor` is the points of about 24 Normal party-hours, which one account fighting through the weekend reaches inside the window.

**Pay.** DECIDED (MM-6, MM-27, Fable 2026-11-21, with MM-6 PROVISIONAL). The direction, buffs and gear, is RULED 2026-11-21.

| Reward | Rule | Status |
|---|---|---|
| A chest at point thresholds | Paid by the account's own points, never by rank. Three thresholds. The marks are 2, 6 and 12 Normal party-hours (D-6. They were 2, 8 and 20). Mark 1 pays +5% damage for 7 days and, the first time, the trophy. Mark 2 pays one Mossback Cloak cut for the hero's way to fight. Mark 3 runs the buff 14 days. An account earns at most one line piece a boss weekend (CE-1). One chest for each boss weekend, so the ruled weekly limits on chest opens hold (RULED 2026-11-21). An account's own marks still pay after the boss falls | PROVISIONAL (MM-6, CE-1). The threshold sizes are checked by playtest E |
| The boss's own gear line | Each boss has a named line of unique pieces, one for each of the four styles. A piece drops at the band of the hero who earned it. It spends the same budget as the best piece of that band (gear exchange rates, R11) and spends part of it on one property no other piece has. Past tier 7 that property is a kind that changes a decision (GR-41) | PROVISIONAL (MM-6, CE-1). Its fit to the item plan is the ten rules of `03-items-and-crafting.md` section 2.16 |
| It reforges | A boss piece reforges up a band and keeps its property | RULED 2026-11-21 (31-4) |
| It trades | A boss piece sells on the market like any gear | No bound gear is RULED 2026-10-23. DECIDED for this line (MM-27, Fable 2026-11-21) |
| The boss's upgrade material | A material only this boss drops. It feeds only the layer's own pieces and is never a required input for plain Tempering, Hallmarks or linings. It trades | PROVISIONAL (CE-1, MM-6) |
| The fall bonus | It waits, as the build plan says. In the first build the fall adds one mark to the Hearthrise's fire (D-6, D-7). The design: paid only if the server fells the boss, at the window's end, to every account past the first threshold, whenever it got there. It is +5% damage dealt for 7 days inside the timed cap, and a re-roll of which line piece the account receives, toward its own heroes' styles. It never adds a second piece | PROVISIONAL (MM-6). HYPOTHESIS |
| A trophy and the plaque | One account trophy for each boss. The plaque names the first blow, the last blow and the top clan | PROVISIONAL (MM-6) |
| Level XP | About what the same stamina earns on a Normal hunt. Never a loss and never the best XP in the game | PROVISIONAL (MM-6), checked by playtest E |
| Coin | None. Gold comes from selling what the boss dropped, to a player | PROVISIONAL (MM-6) |

**Death.** One rule for the whole game: a death in the boss room is a death anywhere. PROVISIONAL (MM-7, waits on a real death rate, and Tyler's answer on the hunting hours a death costs an idle party, ruled together with GR-7 in chapter 05).

- It costs 6% of the hero's Level XP, flat, with no cap (RULED 2026-11-21), cut by Blessings, and by the Blessing ladder of GR-7 past the third.
- A death ends that hero's fight and sends the hero back to town, and no hunt starts by itself (RULED, 27-1). So a 72-hour window while away is never 72 hours of deaths. Exposure is one death for each hero for each send, the same as any hunt. Carry on never sends a hero into a boss room.
- The first send defaults to Normal. Blessings, the ladder and "keep me blessed" apply. The boss card shows the risk reading (deaths per 100 hours for the tier) and what a death would cost this hero before the send.
- It is one row on the mode table, never a rule for one room. Deaths in the room stay inside the death band of the tier chosen, because the hall number acts on health and the clock and never on blows (GR-30).
- The tier is the player's choice. The room uses the one tier table, so the ruled flat death count applies: a mid-geared party on Deadly dies 50 to 100 times in 1,000 hours (RULED 2026-11-21), and a Normal room is as safe as a Normal hunt.
- The "leave if anyone leaves or dies" choice is remembered for the boss kit like any saved kit.
- Why no softer boss rule: risk is what makes the tier choice real, and a second death rule would be a special case, which the formula-layer ruling forbids. Chapter 05 owns the death rule. This chapter only reads it.

**What repeats, and what is remembered.** A boss kit (who stands where, bars, tier, supplies budget) is saved for each boss and offered again the next time that boss stands, by the saved kit rule of GR-48. Sending the four is one press per stamina bar, the same as a hunt.

**Server cost.** ESTIMATED. A boss fight is an ordinary four in an ordinary instance and spends stamina, so it takes the place of hunted hours. New points are folded into the pool by one statement a minute while a boss stands, about 4,300 runs a weekend. Nothing is added to the settle path: points are counted in the row the settle writes. Chapter 09 owns the measured number.

**Content.** A boss returns every fourth weekend, so a year holds 13 boss weekends. The roster, the names, the lines and the properties are not written (section 5). The first boss is a sample of one, played and reviewed before a second is drawn (DESIGN_STANDARDS, no mass generation).

### 2.4 Clans

**What a clan is.** A shared work, a team and a room, and its work pays its members in buffs. A member holds a buff by giving, never by the size of the roster. A clan never fills a party seat. A clan mate's on-call hero may (S-1, chapter 11). PROVISIONAL (MM-8, waits on clans existing with people in them). The direction, that clans pay buffs, is RULED 2026-11-21. "Clans give no Level XP" (25-2) is reversed for one room: the Library pays a standing Level XP bonus (RULED, the sitting, S-4).

| Piece | Rule | Status |
|---|---|---|
| Membership | One clan for each account. All four heroes carry its tag and its buffs | RULED 2026-11-20 (25-7) |
| Founding | 100,000 gold | RULED 2026-11-20 (25-6) |
| Ranks | Leader, officer, member. A leader away 14 days passes it on. Members vote on the next project with one standing vote an account, and the leader breaks a tie | PROVISIONAL (MM-8) |
| Finding one | A clan browser, with search | RULED 2026-11-20 (25-3) |
| Chat | One clan tab | RULED 2026-11-20 (25-3) |
| The tag | Beside a name on plaques, the System tab, the presence strip and the ladders | PROVISIONAL (MM-8) |
| Nothing comes back out | Gifts are one-way. Rations cannot be sold or traded | RULED 2026-11-20 (25-5) |

**The castle.** RULED in direction (MM-9, Tyler 2026-11-21, the sitting, with every size PROVISIONAL, reversal of 25-4, the castle gate of 25-3 and 31-3, let stand on the page): the castle is priced for each member with a floor of five, one project at a time, open at any size. Tyler also KEPT the castle's labor, votes, upkeep, treasury, Clan Standing and five buildings of ten levels (cut list 5). How they fit the price for each member is RULED in direction (MM-9, Tyler 2026-11-21, the sitting, with every size PROVISIONAL) and is written below.

- One project at a time, on the same engine as the server's town project (chapter 07). One engine to build and one to secure.
- Members give gold and castle goods. Ruling 31-3 kept the built prices of castle goods, and the price for each member changes that. It is part of the reversal above.
- Each stage changes how the castle looks and builds or raises one building by one level. There are five buildings of ten levels, so fifty stages, and a full castle is about a year at 1 to 1.3 weeks a stage. HYPOTHESIS.
- **Labor.** A member's heroes can give rested town hours to the open project. It follows the town day rule of `11-on-call-and-clan-xp.md` section 3: the week's labor runs after a hero's job queue, up to a cap in hours a week, and labor covers the weekly share before gold does (PROVISIONAL (CH11-3, `11-on-call-and-clan-xp.md`)). It is a town job paid in closed form and valued on the wage curve, so a stage's price is paid in gold, castle goods or labor.
- **The treasury.** Shares and gifts go into it and nothing ever comes back out (25-5). It pays in a fixed order: upkeep first, then the open project. Every movement is journalled.
- **Upkeep.** A weekly bill for each member, with the same floor of five. The member's weekly share is what pays it, so a member makes one payment and not two. If upkeep is unpaid the rooms' buffs switch off until it is paid. Nothing is lost and nothing decays.
- **Votes.** Each account sets its vote for the next project once, as a standing choice. The leader breaks a tie and picks when nobody has voted.
- **Clan Standing.** A lifetime tally of what each account gave in gold, goods and labor. It shows on the roster and the plaque and pays no power.
- A stage costs a fixed amount for each member, with a floor of five members, so a small clan can build and a clan of one pays for five. TARGET: a stage takes 1 to 1.3 weeks at the weekly share and never under a week, for a clan of 3 and for a clan of 60. Four rooms of five levels is twenty stages, so 20 to 26 weeks. Knob: `castleStagePerMember`, a new row sized in chapter 04 as a share of band gold (R16).
- The castle is open to a clan of any size, because the price follows the roster. This drops the ten-account gate of 25-3.
- A dead clan is one where no member hunted in 30 days.

**Buildings are standing buffs.** PROVISIONAL (MM-9, MM-25, reversal, let stand on the page, with MM-9 PROPOSAL, made in the fold 2026-11-21, not yet seen by Tyler).

| Room | Knob | At its top level |
|---|---|---|
| War room | Damage dealt | +5% |
| Ward | Protection, as a Defense rating row | about 5% less damage an hour for a mid-geared four |
| Workshop | Town work speed | +10% |
| Kitchen | The clan's weekly ration cap | raised |

Each building has ten levels and reaches its cap at level ten. The fifth building is the library. RULED (Tyler 2026-11-21, the sitting, S-4): it pays a standing Level XP bonus, which reverses ruling 25-2. Its step is PROVISIONAL (CH11-2, `11-on-call-and-clan-xp.md`): each level pays +0.5% Level XP and level ten pays +5%. A clan that votes for nothing else reaches +5% in 10 to 13 weeks.


A building's level sets the size of its buff, up to the standing cap. A clan that has finished the four buff buildings has filled every standing cap, and what remains of the castle is looks, the plaque and the weekly goal.

**Held by giving each week.** PROVISIONAL (MM-8).

- A member holds every room's buff in any week in which that account gave at least the week's share.
- The share is a fixed amount by the band of the account's highest hero, priced in hours of the wage curve (GR-51) so it costs about the same play at Level 20 and Level 300. Knob: `clanWeeklyShare`, a new row sized in chapter 04.
- A member who stops giving loses the buffs the next week. A second account padding the roster earns its owner nothing.
- **A standing gift, set once.** A member sets "give my share each Monday" one time, and the server takes it from the purse each week until the member turns it off or the purse cannot pay, in which case the return card says so. Giving by hand every week would be a decision repeated for nothing. PROVISIONAL (MM-44).

**The clan's weekly goal.** When the clan finishes its week's goal on the project, every member who gave carries +5% material find for 7 days, inside the timed cap. PROVISIONAL (MM-8).

**Rations.** The clan's cooks make bound meals for the clan store. Members draw them under a weekly cap. Rations go into the Catacombs under their own weekly cap (RULED, 30-8). Bound rations in place of an XP feast is RULED 2026-11-20 (25-2). It is the one place a member directly helps a member, and a second use for Cooking.

**The board.** PROVISIONAL (MM-10).

- Weekly, three lines: world boss points, arena standing, best Tower floor.
- Scored as the average of the clan's top members, so a small clan can win.
- Resets every week, with all-time records kept.
- The buff is paid by mark, not by rank. Any clan whose week reaches a set score mark earns a Defense rating buff for the next 7 days, in three steps, sized so a mid-geared four takes up to about 5% less damage an hour. The top three clans get the banner and the plaque on top.
- On a server with fewer than five clans the board shows a clan's week against its own last week, and the marks still pay.

**By population.**

| Accounts | What a clan is |
|---|---|
| 10 | One or two clans. Chat, castle, rations and the boss line all work |
| 100 | Five to fifteen clans. The board is a real contest |
| 1,000 and up | A hundred or more. The browser's search matters. The weekly reset keeps the top from freezing |

**The gold sink.** With four heroes free from the first day (RULED 2026-11-21), the gold that hero slots would have taken follows the order of CE-4 in the first weeks: supplies, the yard, the House ladder re-read for four, bag rungs, Tempering, Hallmarks, Blessings and linings. A new account cannot reach the castle. The castle is the long home for that gold once an account is in a clan, and boss and arena materials are a small home. Sizing is chapter 04's. PROVISIONAL (MM-22, waits on the store-bill fault fixed and a wage formula that exists, with GR-8).

### 2.5 Events

**The rule.** The calendar is written as rows a year ahead and runs itself. An event may move a share of something the server already computes, never over +25%, never two at once (RULED 2026-11-20, 27-5), and never puts gold into a purse. PROVISIONAL (MM-11, MM-42, waits on the playtest or measurement its own row names, reversal of the second half of 27-5, let stand on the page).

| Weekend | Event | What it pays |
|---|---|---|
| 1 | The Hearthrise | A buff: Level XP for everyone, from +10% on an empty fire to +25% on a full one. Once every four weeks, as ruled (27-5). The calendar says when it lights and the fire says how big it burns (PROVISIONAL, CE-8 and GR-82, Tyler said yes on the page, a reversal of 2026-10-25, approved) |
| 3 | A world boss stands | Gear and a buff: the boss's line, its material, its 7-day buff |
| 2 | One ground's weekend | Gear: that ground's named pieces are featured for the weekend on their own event row, for everyone hunting that ground. The row is outside the buff caps, is never sold and never stacks with a second event, and the rivet allowance is computed without it. If the playtest shows it does not move people, it goes back to the ruled ground XP weekend |
| 4 | Arena season end and clan honors | Buffs and gear: season buffs for both ladders, the Open Arena's gear line, the clan board's buff |

RULED by the designer 2026-11-21 (D-7), `review/06-designer-rulings-w1.md` section 1. The cycle is 28 days. In the first build weekends 2 and 4 are quiet, and the boss stands on weekend 3, two weeks after the Hearthrise. The fire lights at +10% on an empty fire, then +3% a mark to +25% at five marks. A full fire is a quarter of the fuel the server's weekly active accounts find, counted per account, so 7 accounts fill it as easily as 7,000. The weekly Open Halls row is retired, because Call out has cost no gold since 2026-11-20 and the event waives nothing.

- An event needs no code of its own. A buff is a row on a knob and a featured piece is a row on the drop formula.
- Every weekend has one thing the whole server shares, and no two in a row ask for the same thing.
- **No dailies, no login calendar, no season pass**, as a standing rule. With four heroes a daily is four chores, and a visit is 2 to 5 minutes. The beats of the game are the visit, the stamina bar, the weekend and the monthly project. PROVISIONAL (MM-11, which answers GR-83).
- The Premium claim is not a daily in this sense, because its streak never resets (RULED 2026-10-17) and it needs no press (GR-84).
- What the player sees: one line in the System tab and one banner in town on Friday.

### 2.6 PvP arenas

**What PvP is when combat runs itself.** A test of preparation. The player chooses the four, what they wear and what their bars do. The server then plays the fight on the same combat engine as a hunt, and the player watches what their rules did against a person's rules.

**Two arenas.** RULED 2026-11-21: one normalized, one on gear. What each reads is PROVISIONAL (MM-13, decide first).

| | The Even Arena | The Open Arena |
|---|---|---|
| What decides a fight | The four chosen and the bars written | Those, and real gear, upgrades, standing buffs and bought boosts |
| Stats | Every hero fights at one reference Level with reference skills and a reference kit of its own weapon type and armor weight. The kit is a set of rows tuned for the arena alone, so arena balance never touches a hunt | Heroes as they stand: Level, skills, gear, Tempering, Hallmarks, clan rooms and bought boosts under the caps. It never reads a timed buff that an arena paid, so last season's winners do not start the next one stronger |
| What paying does | Nothing. No gear, buff or boost is read (MM-37, chapter 04) | It shows. There is no gear ceiling (MM-32, ruled), and matching is by gear band |
| Matching | One ladder for everyone. Three opponents offered near the player's rating. PROVISIONAL (MM-39) | By gear band first, then rating. Three offered from the band. A thin band borrows from the next band and from that band's house teams. PROVISIONAL (MM-38) |
| At 10 accounts | Everyone can fight everyone | Thin. Mostly house teams of the band until it fills |
| Season rewards, by rating tier | Up to +5% material find for the next season, inside the timed cap. A title and a banner | A piece of the arena's own gear line at the hero's band, with its own property, sized like a boss piece, at most one a season for an account (CE-1). The line's upgrade material. Up to +5% damage dealt for the next season, which no arena reads. A title |
| Who it is for | The builder, the new account, the small server | The player who has invested in gear, and the player who buys an edge |

**What each arena reads of Talents.** PROVISIONAL (TAL-1, `10-level-choices.md`), and it waits on the engine check (MM-41) like the rest of this section. In the Even Arena every hero gets the same number of points, the count for the arena's reference Level, so the reference kit gains a points count. The player sets an arena build for each hero once. It is saved, free to change, and never costs gold. A hero's real allocation is not read there. The Open Arena reads the hero as it stands, with its real points and its real allocation.

**Rules both share.**

| Piece | Rule | Status |
|---|---|---|
| The opponent | A saved setup: another account's four as they stood when it last attacked. Never a live player | PROVISIONAL (MM-12) |
| House teams | A handful of fours written as data, so the first account on a server has someone to fight | PROVISIONAL (MM-12) |
| Who you fight | The server offers three. The player picks one. Nobody can choose an account | PROVISIONAL (MM-16) |
| Defense | The four the account last attacked with. Nobody can post a weak defense on purpose | PROVISIONAL (MM-16) |
| Rating | Attacks move the attacker's rating. Being attacked while away costs nothing | PROVISIONAL (MM-16) |
| Tickets | Each arena has its own. 5 a day, banking to 20. Premium banks to 30 | DECIDED (MM-15, MM-40, MM-21, Tyler said yes on the page 2026-11-21, with MM-15 and MM-40 PROVISIONAL) |
| Spending banked tickets | One press spends any number of banked tickets, using a remembered pick rule (closest rating, or highest rating offered). The player can still pick by hand. A week of banked tickets must not be twenty identical presses | PROVISIONAL (MM-45) |
| Seasons | Four weeks, ending on weekend 4, with a soft reset | PROVISIONAL (MM-14) |
| Rewards by tier, not rank | Anyone who reaches a rating tier with at least a set number of fights earns that tier's reward. A top-ten-only prize would put the gear in the same hands every season | PROVISIONAL (MM-14) |
| Arena gear trades | Like any gear | DECIDED (MM-27, Fable 2026-11-21) |
| Stamina, death, XP, coin | None. It cannot be farmed and it cannot hurt | PROVISIONAL (MM-14) |
| The fight | About 90 seconds, watched or skipped to the result. A replay is display only, from the server's seed and both saved setups | PROVISIONAL (MM-12) |
| Modes | One at first, the plain fight. Capture the flag is a later rule set on the same arenas, with no death and low XP as Tyler described it on 2026-11-14 | PROVISIONAL (MM-46). Nothing planned is cut (RULED 2026-11-21) |
| PvP on the hunting grounds | Never | DECIDED (MM-17, Fable 2026-11-21) |

**The engine check.** Before either arena is planned, one measurement: can heroes stand on the enemy side of the engine and run their bars there, how long does a 90-second fight of eight take in the edge, and does one style win every time. One check serves both arenas. The Even Arena then needs its reference kit as rows. The Open Arena needs nothing more. DECIDED (MM-41, Fable 2026-11-21). If the check fails, the arenas become their own program after the beta and stay hidden until they work.

**Anti-cheat.** PROVISIONAL (MM-12, MM-16), and all of it is inside the Security review.

| Threat | Answer |
|---|---|
| A forged result | The client sends one intent: fight offered opponent 1, 2 or 3. The server builds both sides from its own tables, picks the seed, runs the fight and writes the result |
| A forged setup | Setups are saved by the server from server tables. No stat crosses from a browser |
| Win trading and feeding from a second account | Nobody chooses an opponent, and defense does not move rating. A tier needs a minimum number of fights. Two accounts on one network are never offered each other |
| Flooding | Tickets, and a rate limit on the intent |

**Server cost.** ESTIMATED at 0.13 to 0.2 database-seconds a fight. Five fights a day in each arena is under 2 database-seconds an account-day. The simulation is edge time and must be timed by the engine check. Chapter 09 owns the measured number.

### 2.7 Presence: one system, three places

**The rule.** Presence counts heroes, not browsers. The server already knows where every hero is: in a hunt on a ground, in a boss room, or at a job in town. One presence read shows that to other players in three places. PROVISIONAL (MM-20 and GR-70, designed as one system and ruled together).

| Place | What the player sees | Status |
|---|---|---|
| The town | Heroes at work, drawn whether or not their owner is online. Heroes work in town for all 12 rested hours (RULED 2026-11-21), so the town is full while the server sleeps | PROVISIONAL (GR-70) |
| A hunting ground | A strip on the ground's card and in the hunt view: "3 other parties are hunting the Warrens", by leader, clan tag and party size | PROVISIONAL (MM-20) |
| A world boss | The parties in the fight now, and each clan's share | PROVISIONAL (MM-2, MM-20) |

- **Seen, never fought beside.** A ground is hunted by one party in its own instance. No account's monsters, kills or drops are touched by another's. PROVISIONAL (MM-20). Tyler named 8-person open areas as an option, and this says no to them.
- **One list, capped.** Each place shows a short capped list. Clan mates and friends sort first, then nearest Level.
- **Quiet presence.** A player who turns it on is left off every list.
- **The online count** is by heroes active, closed browsers included (RULED 2026-11-18).
- **Right-click or long-press any name** in a list: Trade, Inspect gear, Message, Add or remove friend, Invite to party, Block (RULED 2026-10-18).
- If the strip is liked, other parties can later be drawn in the hunt view as display only.
- **Cost.** ESTIMATED at about 0.5 database-seconds an account-day for the strip, or nothing if it rides the hunt's own update. The town's draw is not sized. Chapter 09 owns both.

### 2.8 Mixed Levels: the visible two-thirds rule

**The rule.** When heroes share a fight, each hero keeps its full share of the kill's Level XP if its Level is at least two thirds of the highest Level in the party. Below that:

`share kept = hero Level / (2/3 x top Level in the party), capped at 1`

PROVISIONAL (MM-19, waits on a matrix cell with mixed Levels, Tyler said yes on the page, reversal of the party XP rulings of 2026-11-08, let stand on the page, which answers GR-10b and re-opens the 2026-11-08 ruling). On-call heroes are kept (MM-18, ruled at the sitting), so a hero from another account can join a party again and this line has real cases. Formula home: the party XP step (`partyXp`), with one new knob, `levelShareLine`, at two thirds.

- **It is visible.** The party window shows it before the hunt starts: "Brenna is under the line and keeps 61% of her share." Nothing is hidden and nothing depends on the ground.
- **Carried is a little better than alone and never several times better.** COMPUTED from measured cells of the proposed rule: a Level 5 behind a Level 37 party earns about 1.2 times its own pace and a Level 10 about 1.6 times. With no rule the same seats would earn 6.1 and 4.1 times. The survival side of those cells is provisional until the engine sends real damage to the back row.
- **One rule for every party.** An account's own low hero, a friend's hero in a party formed by hand, and the boss room all read the same line for Level XP.
- **It is not a party-size target.** There are no solo or group balance targets (RULED 2026-11-21).
- **Where it is not read.** Boss points, because the room is scaled. Both arenas, because they pay no XP.

**Parties across accounts.** A party is up to four heroes and never more than four (RULED 2026-11-20, 25-11). Most parties are an account's own heroes. A hero from another account can join again: by an invite by hand, and in the guest seat as an on-call hero (RULED, S-1, Tyler 2026-11-21, the sitting). Asked what "full stamina" meant, he answered the same day: "I just mean the person hiring them can see how much stamina the hired hand has and the person hiring can use all of it, hired stamina and regular stamina should be two different sets of stamina I think". So a hero has two pools, its own stamina and hire stamina, and hunting on call spends only the second (RULED). The guest seat is PROVISIONAL (CH11-1, `11-on-call-and-clan-xp.md`): one guest a party, seated by a friend or clan mate inside the hero's 12 hour window. Two accounts may still form a party by hand through an invite. When a party holds two or more accounts it is offered a shared supply bill, agreed once and remembered (RULED 2026-11-20, 25-8). There is no live party finder (RULED, GR-69, Tyler 2026-11-21, the sitting: removed).

### 2.9 Chat, friends and factions

**Chat.**

| Tab | Rule | Status |
|---|---|---|
| Global | One room for the whole server. Lines are sent in small batches on the connection the game already has, with a slow mode when crowded | RULED 2026-11-21 (31-1) |
| Clan | One room for the clan | RULED 2026-11-20 (25-3) |
| Party | Inside a party | RULED (GR-69, Tyler 2026-11-21, the sitting: removed keeps it, Fable 2026-11-21) |
| Whispers | One to one | RULED (GR-69, Tyler 2026-11-21, the sitting: removed keeps it, Fable 2026-11-21) |
| System | The world's news: rare drops (3 a hero a day), boss stages and falls, clan castle stages, town project stages, server firsts, the weekend's event | PROVISIONAL (MM-11 for the event line) |
| Combat | The hunt's log, from server events, filterable | RULED 2026-10-16 |
| Local | Not in the game. Hunts are instanced, so "here" is a party, which has its tab. Town crier lines speak in Global and in the town itself | RULED (GR-69, Tyler 2026-11-21, the sitting: removed, re-opens 2026-11-11) |

Chat is open by default so a new player sees that other people exist (RULED 2026-10-22). Blocks, mutes, the word filter and name moderation are required. The paid Town Crier line stays as a small gold sink (RULED 2026-11-04).

**Friends.**

- A friend is an account, shown by its heroes' names. One request links both accounts, and all four heroes on each side see the friend. Asking four times for one friend would be a repeated decision. DECIDED (MM-47, Fable 2026-11-21).
- What a friend is for: sorted first on every presence list, a whisper, Inspect gear, a party invite by hand, and listing an item for a friend on the market (chapter 04).
- A friend link at sign-up, with no reward: a new player who arrives by a friend's link starts with that friend on the list. DECIDED (GR-72, Fable 2026-11-21).
- No hero is lent through the friends list (section 2.10).

**Factions.**

| Piece | Rule | Status |
|---|---|---|
| The sides | The First Flame and the Last Ember. Neither is evil. Havora is neutral. Villains are shared NPCs | RULED 2026-11-14 |
| When | A hero may join after its first Krell kill, which a plain four reaches around day 31 (GR-6b) | RULED 2026-11-14 |
| Who chooses | The account picks one side, as ruled (25-10). One press joins every hero that has killed Krell, and all four carry that side's skill. An account can swap sides and keeps earned sets | DECIDED (GR-71, Fable 2026-11-21): 25-10 is kept as it stands |
| Grounds | Both sides hunt everywhere and see each other. Each side gains standing on the grounds of its opposite. Every region past Krell holds equal grounds for each side | RULED 2026-11-14 |
| Standing and looks | Standing earns outfit pieces. A hero can swap sides and keeps earned sets | RULED 2026-11-14 |
| Faction skills | Bulwark for the First Flame, Reap for the Last Ember. Sized to matter (RULED 2026-11-21, 31-8). Each is a bar ability, not a buff row, so it sits outside the caps of section 2.2 and is sized in chapter 01 | RULED |
| Side against side | A weekly tally and any side event wait until both sides can be filled, and must pass rule 0 | OPEN, see section 5 |

### 2.10 What is not in the game

| Not in the game | Why | Status |
|---|---|---|
| Shared combat grounds, 8-person areas | A contested spawn with both owners asleep is a tax and not a meeting. A busy server would need channels, which is instancing again. One party, one instance is the engine | PROVISIONAL (MM-20) |
| A raid of many heroes in one fight | It needs people at the screen and a second engine. The world boss is the server's shared fight. A clan's own shared hunt, planned as two parties of four in one hall (25-11), takes the same form when it is built: each party in its own room on one clan pool | PROVISIONAL (MM-1, MM-2, MM-48, Tyler said yes on the page, reversal of the second half of 25-11, let stand on the page) |
| PvP on the hunting grounds | The idle hunt is never interrupted by another player | DECIDED (MM-17, Fable 2026-11-21) |
| A live party finder, a Local chat tab, a fifth seat | Rule 0. The cap of four is RULED (25-11). Global, Clan, Party and whispers stay, and criers speak in Global and in town | RULED (GR-69, Tyler 2026-11-21, the sitting, S-2) |
| Dailies, a login calendar, a season pass | Section 2.5 | PROVISIONAL (MM-11) |
| Gear, materials, gold, Levels or rating sold by the store | Chapter 04 | PROVISIONAL (MM-29, Tyler said yes on the page) |

---

### 2.11 What is in the first build, and what waits

Tyler adopted the critical review on 2026-11-21, and its step 4 narrows the first build. Of this chapter the first build holds the cheap social layer (presence, Global chat, the clan roster with its chat tab and browser, the calendar with the Hearthrise weekend), one world boss as a sample of one, and the one-day engine test that sizes the arenas. Everything else in the chapter is planned and waits. Nothing is cut.

Each waiting row below now names its later lane, FR-1 to FR-18 of `14-the-rest.md`. Anything the engine decides is sized in the simulator, and only a player's choice is read live (Tyler 2026-11-21).

| Id | The call | First build | Status |
|---|---|---|---|
| CE-1 | Collision: world boss and arena gear lines against the gear curve and the unique counts (MM-6, MM-14) | Planned, waits until the first boss has stood twice. The first boss keeps its chest. Lane FR-12 | PROVISIONAL |
| CE-8 | Chapter 07 flag: the Hearthrise fire and MM-11's dated +25% weekend are one reward under two rules | In the first build: the Hearthrise weekend | PROVISIONAL |
| GR-70 | The town shows heroes at work whether or not their owner is online. | In the first build: presence in town, inside the cost budget | PROVISIONAL |
| GR-71 | A faction side is chosen for each hero. | Planned, waits until the first build is played. D-21, then lane FR-14 | DECIDED |
| GR-72 | A friend link at sign-up, with no reward. | In the first build: the friend link | DECIDED |
| GR-82 | Town Works, the Hearthrise event and flame powders become one Great Hearth. | In the first build: the Hearthrise weekend | PROVISIONAL |
| MM-1 | Rule 0: every shared feature works while both players are asleep. | In the first build: the rule | PROVISIONAL |
| MM-2 | A world boss is one health pool the whole server shares, fought by each account in its own room. | In the first build: one sample boss | PROVISIONAL |
| MM-3 | A world boss stands for a window of about 72 hours and never at a set hour. | In the first build: one sample boss | PROVISIONAL |
| MM-4 | A world boss is sized by weekly active accounts, with a floor one account can fell. | In the first build: one sample boss | PROVISIONAL |
| MM-5 | Your share of a world boss is counted against your own Level in a room scaled to your party. | In the first build: one sample boss | PROVISIONAL |
| MM-6 | A world boss pays a chest by your own points: its own named gear line at your band, its own upgrade material,  | Planned, waits until the first boss has stood twice. The first boss keeps its chest. D-19, then lane FR-12, FR-10 | PROVISIONAL |
| MM-7 | Collision (c): a death in a world boss room. | In the first build: one sample boss | PROVISIONAL |
| MM-8 | A clan is a shared work, a team and a room that pays members in buffs, held by giving that week's share. | In the first build: the roster, the clan chat tab and the browser only | PROVISIONAL |
| MM-9 | The castle is one project at a time on the town project engine. Each room carries one standing buff up to the  | Planned, waits until clans exist and people are in them. Lane FR-11 | RULED in direction at the sitting. Sizes PROVISIONAL |
| MM-10 | A weekly clan board. The top clans carry a small timed buff the next week. | Planned, waits until clans exist and people are in them. Lane FR-11 | PROVISIONAL |
| MM-11 | Events are a four-weekend rotation written a year ahead, with no dailies, login calendar or season pass. | In the first build: the calendar, with the Hearthrise and the world boss two weeks apart | PROVISIONAL |
| MM-12 | Arena opponents are saved setups and house teams, never live players. | Planned, waits until the one-day engine test shows heroes can fight heroes. D-19, then lane FR-10, FR-12 | PROVISIONAL |
| MM-13 | Two arenas: an even arena that normalizes every stat, and an open arena that reads real gear, upgrades and buf | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-14 | Arena rewards by rating tier: a season buff and title in the even arena, and the arena's own gear line in the  | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-15 | Arena fights use tickets that bank, 5 a day up to 20. | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-16 | The server offers three opponents, being attacked costs nothing, and your defense is your last attack party. | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-20 | Other players on a hunting ground are seen through a presence strip and never fought beside. | In the first build: presence | PROVISIONAL |
| MM-22 | The gold that hero slots took goes to the castle and to boss and arena upgrade materials first. | Planned, waits until clans exist and people are in them. Nothing to build (chapter 14 section 3.4) | PROVISIONAL |
| MM-24 | Every buff is a row in one modifier table, and every MMO layer piece sits on the gear curve at the earner's ba | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-25 | The buff caps: damage +5% standing and +10% timed, damage taken 5% and 5% less, Level XP +5% and +25%, drop ch | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-26 | The power budget: a fully buffed, boss-geared four gains at most about 32% kill speed and about 72% Level pace | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-27 | Boss and arena gear trades like all gear. | Planned, waits until the first boss has stood twice. The first boss keeps its chest. Nothing to build (chapter 14 section 3.4) | DECIDED |
| MM-28 | The paid advantage | Planned, waits until test Crowns have run in a later playtest (S-17 a). Nothing to build (chapter 14 section 3.4) | RULED at the sitting |
| MM-29 | What the store sells for Crowns | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-30 | Bought boosts and earned buffs | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-31 | The pace ceiling | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-33 | The gold ceiling | Planned, waits until test Crowns have run in a later playtest (S-17 a). Lane FR-16 | PROVISIONAL |
| MM-34 | The path for players who do not pay | Planned, waits until test Crowns have run in a later playtest (S-17 a). Lane FR-16 | RULED |
| MM-35 | How Crowns trade | Planned, waits until test Crowns have run in a later playtest (S-17 a) | PROVISIONAL |
| MM-36 | The clamps | Planned, waits until test Crowns have run in a later playtest (S-17 a) | PROVISIONAL |
| MM-37 | Where paying gives no edge | Planned, waits until test Crowns have run in a later playtest (S-17 a). Nothing to build (chapter 14 section 3.4) | PROVISIONAL |
| MM-38 | The open arena matches by gear band, then rating, and thin bands borrow from the next band and from house team | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-39 | The even arena is one ladder for everyone, with three opponents offered near your rating. | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-40 | Each arena has its own tickets. | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-41 | Measure once whether the engine can run heroes on both sides of a fight, before either arena is planned. | In the first build: the one-day engine test | DECIDED |
| MM-42 | Events pay buffs and gear: a Level XP weekend, a ground weekend that features its named pieces, boss and arena | Planned, waits until Deadly is sized and one buff has been played in a cell. Lane FR-12 | PROVISIONAL |
| MM-43 | For the playtest only, every account gets the same weekly allowance of test Crowns through one server switch. | In the first build: the playtest | DECIDED |
| MM-44 | A standing clan gift. | Planned, waits until clans exist and people are in them. Lane FR-11 | PROVISIONAL |
| MM-45 | Spending banked arena tickets. | Planned, waits until the one-day engine test shows heroes can fight heroes. Lane FR-10 | PROVISIONAL |
| MM-46 | Capture the flag and the arenas. | Planned, waits until the one-day engine test shows heroes can fight heroes. D-20, then a later lane | PROVISIONAL |
| MM-47 | Friends. | In the first build: friends | DECIDED |
| MM-48 | The clan's own shared hunt. | Planned, waits until clans exist and people are in them. D-20, then a later lane | PROVISIONAL |

MM-18 (on-call heroes, kept) and GR-69 (the finder and Local chat, removed) were ruled at the sitting, and the full castle is ruled as the direction. The rows above with no cell or code behind them are PROVISIONAL however they read in section 2: the review counted one measurement in the 49 rows of this layer.

## 3. How it connects

| This chapter | Reads from | Feeds |
|---|---|---|
| The modifier table and caps | Chapter 01 (core and combat): the one amount pipeline, the modifier table R20, the knobs | Chapter 04: bought boosts fill the same timed caps. Chapter 05 (progression): the power budget moves the days of the Level law |
| World boss room | Chapter 01: the engine, boss phases, the tier table. Chapter 02 (world): the boss formula (GR-30), scaling to a hero's Level (GR-9), the boss door (GR-28) | Chapter 03 (items): boss gear lines and materials. Chapter 04: tradeable chase gear for the market and the Crowns book |
| World boss death | Chapter 05: the death rule, Blessings, the GR-7 ladder | Nothing. It adds no rule |
| Clan castle | Chapter 07 (home and town): the town project engine. Chapter 04: the wage curve (GR-51), band gold shares (R16), castle goods prices | Chapter 04: a standing gold sink. Chapter 07: Cooking gains rations as a consumer |
| Events | Chapter 03: the featured term of the drop formula, named ground pieces | Chapter 08 (player experience): the Week card and the return card |
| Arenas | Chapter 01: the engine with heroes on both sides. Chapter 03: gear bands for Open Arena matching | Chapter 03: the arena gear line. Chapter 04: where paying shows and where it never does |
| Presence | Chapter 07: town jobs. Chapter 09 (platform): the cost of the reads | Chapter 08: the first five minutes |
| The two-thirds rule | Chapter 01: the party XP step | Chapter 05: how fast a low hero levels behind a high one |
| Chat | Chapter 09: batched delivery and connection limits | Chapter 08 |
| Factions | Chapter 02: paired grounds. Chapter 01: faction skill sizing | Chapter 05: standing |
| Premium in the layer | Chapter 04: what one Premium gives and costs | Arena tickets bank to 30. Premium does not make timed buffs last longer (MM-21) |
| When each piece opens | Chapter 08: the Path (GR-79) | The Level doors of section 5, item 9 |

**The Crowns engine is chapter 04.** It owns MM-28 to MM-37 and MM-43: what the store sells, the Crowns book, the eight clamps, the pace, gear and gold ceilings, the non-payer's path and the playtest allowance. This chapter gives it three things: the caps every bought boost fills, the tradeable gear players want gold for, and one arena that reads nothing bought.

---

## 4. The calls in this chapter, as decided

In decision-book order. "First" marks a decide-first call.

| Id | The call | The decision | Status |
|---|---|---|---|
| MM-1 (first) | Rule 0 | Yes, as a standing rule | PROVISIONAL. Waits on a playtest that shows whether players ask for what was removed. Tyler said yes on the page 2026-11-21 |
| MM-2 (first) | World boss form | One shared pool, fought in each account's own room | PROVISIONAL. Waits on the hall check at three Levels and one boss stood |
| MM-24 (first) | How rewards are sized | Every buff a row in one modifier table. Every layer piece on the gear curve at the earner's band | PROVISIONAL. Waits on one buff played in a cell |
| MM-25 (first) | The buff caps | Damage +5% standing and +10% timed. Protection as Defense rating rows worth about 5% and 5% less damage an hour. Level XP +25% timed only, from the Hearthrise weekend. Material find +10% timed, earned only. Town work +10%. No coin buff | PROVISIONAL. Waits on one buff played in a cell |
| MM-26 (first) | The power budget | One ceiling as a reading held by a test: 1.65 times a plain mid-geared four in Levels an hour with every cap full, 1.32 in kills an hour, about 1.22 from paying alone | PROVISIONAL. Waits on one buff played in a cell |
| MM-13 (first) | What each arena reads | An Even Arena that normalizes every stat and an Open Arena that reads gear, upgrades, standing buffs and bought boosts. Neither reads a timed buff an arena paid | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-3 | Boss window | About 72 hours, never a set hour | PROVISIONAL. Waits on the hall check at three Levels and one boss stood |
| MM-4 | Boss size | Pool sized by weekly active accounts with a floor. The room stays open to the end of the window, so late visits still pay | PROVISIONAL. Waits on the hall check at three Levels and one boss stood |
| MM-5 | Boss contribution | Points are boss bars broken in your own scaled room times the tier multiplier. The hall number acts on health only and the room takes no win-rate target | PROVISIONAL. Waits on the hall check at three Levels and one boss stood |
| MM-6 | Boss pay | A chest by your own points at three marks. At most one line piece a boss weekend. The fall bonus is the 7 day buff and a re-roll of the piece, paid at the window's end. HYPOTHESIS | PROVISIONAL. Waits on the hall check at three Levels and one boss stood |
| MM-7 | Death in the boss room | The normal death, as one row on the mode table. One death a send, the first send on Normal, Blessings apply and the card shows the risk. Deaths stay inside the tier's death band. Built with GR-7 | PROVISIONAL. Waits on a real death rate, and Tyler's answer on the hunting hours a death costs an idle party |
| MM-8 | What a clan is | A shared work, a team and a room that pays buffs to members who gave the week's share. The weekly goal pays +5% material find for 7 days | PROVISIONAL. Waits on clans existing with people in them |
| MM-9 | The castle | The full castle: five buildings of ten levels, labor, upkeep, votes, a treasury, about a year. Priced for each member with a floor of five. The fifth building is the library and pays a standing Level XP bonus | RULED (Tyler, 2026-11-21, the sitting) in direction. Every size is PROVISIONAL |
| MM-10 | The clan board | A weekly board of three lines. A clan that reaches a score mark earns a Defense rating buff worth up to about 5% less damage an hour for 7 days | PROVISIONAL. Waits on clans existing with people in them |
| MM-11 | Events | The four-weekend rotation. No dailies, login calendar or season pass | PROVISIONAL. Waits on the playtest or measurement its own row names |
| MM-12 | Arena opponents | Saved setups and house teams, never live | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-14 | Arena rewards | By rating tier, never by rank. Even Arena: up to +5% material find, a title and a banner. Open Arena: a piece of the arena line, its material, up to +5% damage that no arena reads, and a title | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-15, MM-40 | Tickets | Each arena its own, 5 a day banking to 20 | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-16 | Arena matching | Three offered. Being attacked costs nothing. Defense is the last attack party | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-17 | PvP on the grounds | Never | DECIDED (Fable 2026-11-21) |
| MM-18 | On-call heroes | The removal this call decided is superseded by S-1: on-call heroes are kept. The design is chapter 11 | SUPERSEDED by Tyler's ruling at the sitting (S-1). The design is PROVISIONAL (CH11-1, `11-on-call-and-clan-xp.md`) |
| MM-19 | Mixed Levels | The visible two-thirds rule, one rule for every party | PROVISIONAL. Waits on a matrix cell with mixed Levels. Tyler said yes on the page 2026-11-21. It changes The party XP rulings of 2026-11-08, which he let stand on the page |
| MM-20 with GR-70 | Presence | One system in three places: the town, the ground strip, the boss page. Seen, never fought beside | PROVISIONAL. Waits on the playtest or measurement its own row names |
| MM-21 | Premium and the layer | Everything is open to all. Premium banks arena tickets to 30. It does not make timed buffs last longer | DECIDED. Tyler said yes on the page 2026-11-21 |
| MM-22 | The gold hero slots took | The slot gold follows the order of CE-4 in the first weeks. The castle is its long home. Boss and arena materials are a small home | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists |
| MM-23 | The order for planning | Calendar, clan roster and chat, the two-thirds rule, the modifier table, the engine check, world boss, castle, the Crowns book, Even Arena, Open Arena, clan board. The presence strip can move earlier | DECIDED (Fable 2026-11-21) |
| MM-27 | Boss and arena gear trades | Yes, like all gear | DECIDED (Fable 2026-11-21) |
| MM-38 | Open Arena matching | By gear band, then rating. Thin bands borrow | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-39 | Even Arena matching | One ladder, three offered near the rating | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-41 | The engine check | Measure heroes on both sides once, before either arena is planned | DECIDED (Fable 2026-11-21) |
| MM-42 | Events pay buffs and gear | The in-between ground weekend features that ground's named pieces on its own event row, outside the buff caps, never sold and never stacked | PROVISIONAL. Waits on one buff played in a cell. Tyler said yes on the page 2026-11-21. It changes The second half of 27-5, 2026-11-20, which he let stand on the page |
| GR-69 | Local chat, the live party finder, the fifth seat | Remove all three. Global, Clan, Party and whispers stay | RULED (Tyler, 2026-11-21, the sitting) |
| GR-71 | Faction side | Chosen for the whole account, as ruled in 25-10. One press joins every hero that has killed Krell | DECIDED (Fable 2026-11-21) |
| GR-72 | A friend link at sign-up | Yes, with no reward | DECIDED (Fable 2026-11-21) |
| MM-44 (new) | A standing clan gift | Set once, taken weekly, reported on the return card | PROVISIONAL. Waits on clans existing with people in them |
| MM-45 (new) | Spending banked tickets | One press with a remembered pick rule | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-46 (new) | Capture the flag and the arenas | One system. A later rule set on the same arenas | PROVISIONAL. Waits on the engine test of heroes against heroes |
| MM-47 (new) | Friends | Linked by account, shown by hero | DECIDED (Fable 2026-11-21) |
| MM-48 (new) | The clan's own shared hunt | When built, each party in its own room on one clan pool, never eight heroes in one fight | PROVISIONAL. Waits on clans existing with people in them. Tyler said yes on the page 2026-11-21. It changes The second half of 25-11, 2026-11-20, which he let stand on the page |

---

**Cuts in this chapter, after the sitting.** KEPT, RULED in direction at the sitting (S-7), cut list 5: the full castle. KEPT, RULED at the sitting (S-1), cut list 2: on-call heroes, with his design. KEPT, RULED at the sitting (S-4), cut list 6: the clan library, which pays a standing Level XP bonus. CUT, RULED at the sitting (S-2), cut lists 3 and 4: the live party finder and the Local chat tab.

## 5. Still missing

| # | What is missing | Who answers |
|---|---|---|
| 1 | **The boss roster.** How many bosses, their names, where they stand in the world and the story, their phase traits, and each line's four pieces and property. One sample boss comes first | Closed for the sample. D-6: Mossback at the Mill Pond is written. Bosses two and on are D-19 of chapter 14 |
| 2 | **How boss and arena gear lines fit the item plan and the gear curve.** A new tradeable line at the best in slot budget for every band changes what a hall prize (GR-29) and a ground's rare are worth | Closed. CE-1, the ten rules of `03-items-and-crafting.md` section 2.16 |
| 3 | **A bought drop chance boost against the Luck ruling.** Tyler bound Luck items on 2026-11-20 so that gold and Crowns could not buy Magic Find. A drop chance boost in the store (MM-29) is close to that. My recommendation: the drop chance row stays as an earned and event buff, and chapter 04 leaves it out of the store unless Tyler says otherwise | Closed. CE-2 and CE-3: the row is material find, earned only, and no drop or material boost is sold |
| 4 | **How the power budget moves the Level law and the content runway.** The Level table is the clock of a plain mid-geared four. A four at 1.72 pace walks 120 days of grounds in about 70 (COMPUTED, 120 over 1.72) | Closed. GR-6a and MM-26: the table is the plain four's clock, and the next region's door is near day 55 for the fastest seat |
| 5 | **What the layer may cost.** Every server number here is ESTIMATED. The budget and the cost of a town that draws working heroes come from the platform study | Chapter 09 |
| 6 | **The engine check** (MM-41). Until it runs, both arenas are a design and not a plan | The systems engineer |
| 7 | **Arena balance between styles.** The four styles are balanced against monsters. The reference kit, the reference Level, and whether faction skills are read in the Even Arena are not written | The game designer, after the engine check |
| 8 | **The numbers nobody has set.** `bossPoolPerAccount`, `bossPoolFloor`, the chest thresholds, room levels and their steps, `castleStagePerMember`, `clanWeeklyShare`, the clan roster cap (the design is checked at 60), the ration cap, the board's "top members" count and its buff size, rating tiers, the minimum fights for a tier, the house teams | The boss pool, the chest marks and the fire are set by D-6 and D-7. The castle, board and arena numbers are sized in the simulator, in lanes FR-10 and FR-11 |
| 9 | **When each piece opens on the Path.** Chat and presence at minute 5 and clans from the first day are the design. The Level door for the boss, the arenas and the clan board is not set | Closed. GR-79: the world boss at Level 13 for each hero sent, the Even Arena at Level 20, the Open Arena at Level 30, the clan board when the account is in a clan |
| 10 | **The Security review's scope for the layer.** The boss chest, clan gifts, the standing gift, rations, arena results and both gear lines are shared or reward surfaces | The security engineer |
| 11 | **Side against side.** The weekly faction tally and any side event have no design that passes rule 0 yet | The game designer |
| 12 | **Live ops when nobody is watching.** The calendar runs itself, but nothing says who notices a boss that never falls or a pool sized wrong. The pool needs a rule that settles it at the window's end either way | The pool rule is closed (MM-4): the boss leaves when the window ends and the server re-sizes the pool after each boss. Still owed: who notices a boss that never falls. The game designer, with the reliability engineer |
| 13 | **Knobs missing from `knobs.json`:** material find, town work speed, and every new knob named in this chapter | The balance tools lane |

---

## 6. How we will know it works

Every statement that players will enjoy a part of this layer is a HYPOTHESIS until these read green. With 30 accounts a measured share of 50% could really be 32% to 68%, so the reads are behaviors and counts with targets set in advance.

**Before any build.**

| # | Question | How | What it decides |
|---|---|---|---|
| A | Will players spend stamina on a shared target? | One weekend, a server-wide kill goal on one boss posted in Discord, the tally read from the journal. TARGET: fights at that boss, chat lines and shared press hours all rise | If nobody moves, the chest (MM-6) matters more than the form |
| B | Which part do committed players want first? | The two heaviest testers, ten minutes each | Direction only |
| C | Can heroes fight heroes in the engine? | A four against a four on the replay harness: does it run, how long in the edge, does one style always win | Whether the arenas are a large build or their own program (MM-41) |
| D | What does the boss pool cost? | 1,000 synthetic boss rooms. TARGET: under 0.1 database-seconds an account-day added | MM-2 |
| E | What must the chest pay? | The balance matrix: chest value and XP for each stamina hour beside a Normal hunt at Levels 20, 60 and 110. Neither a loss nor the best XP in the game | MM-6 |
| F | Does the two-thirds rule hold? | The matrix: the eight carried cells with the rule on, re-run once the engine sends real damage to the back row. A carried seat earns a little more than alone and never several times more | MM-19 |
| G | Does the power budget hold? | The matrix: a plain four against a best in slot four with every cap full, at Levels 20, 60 and 110. TARGET: kill speed 1.25 to 1.40, Level pace 1.6 to 1.8, and no cell where the buffed four holds a tier the plain four cannot enter (this last clause fails by design on a cliff, `12-balance-pass.md` section 3.8, and is for Tyler, 12 section 7 item 4) | MM-25, MM-26 |

**In the Discord playtest.** 20 to 30 strangers, 14 days, two weekends. Clans from day 1. A world boss on both weekends. The arenas in week two if check C passes.

| Read | TARGET | A bad sign |
|---|---|---|
| Active accounts that hit the boss at least once | Over half, on both weekends | Under a quarter, or a drop from the first weekend to the second |
| Share of weekend stamina spent on the boss | 10% to 35% | Near zero (skipped) or near all (a duty) |
| Hours for the boss to fall | 36 to 60 | Under 12, or never |
| Ten-minute windows with two or more people pressing, boss weekend against weekdays | Clearly higher on the weekend | The same |
| Accounts in a clan | Over a third by day 7 | Under a tenth |
| Clans with gifts from three or more members | Half of all clans | One giver a clan |
| Accounts holding at least one earned buff in a week | Over two thirds | Under a third |
| Boss pieces listed and sold | Sales in every band that has 5 or more accounts | Listed and never bought |
| Arena fights an account a day, and accounts with 10 or more fights | 2 or more a day. Over a third of accounts | Under a tenth of accounts |
| Arena win rate of each style pairing | Every pairing between 40% and 60% | One style above 65% |
| Open Arena fights against real setups | Over half by week two in the busiest band | Nearly all house teams |
| Level pace of the top tenth of accounts against the median, same hours | Under 1.6 | Over 1.7, which means a cap leaks |
| Five players asked "what did another player do that you noticed?" | Four of five can name something | Two or fewer |

The reads on bought boosts, the Crowns book and the test allowance (MM-43) are in chapter 04.

**What would change the design.**

- If check A and the first boss weekend both show almost nobody spends stamina on a shared target, the world boss moves down the order and the castle or the arenas move up.
- If check C shows heroes cannot stand on both sides without a rewrite, the arenas become their own program after the beta.
- If friends in the playtest ask to lend heroes without being prompted, hired heroes come back to Tyler as a call.
- If nobody joins a clan in 14 days among 30 strangers, the castle waits and the board is not built.
- If the top accounts run past the pace ceiling, a cap is leaking and no boost is sold until check G is green.

---

## 7. Superseded

| Dropped | Why |
|---|---|
| Honors-only and goods-only rewards: boss pay with nothing above the band's goods, clans with no hero power, a clan board for honors, arena titles and banners only (study 49, first issue) | Tyler 2026-11-21: "none of that is fun". Rewards are buffs and gear |
| One normalized arena (study 49, first issue) | Tyler 2026-11-21: two arenas |
| "Clans give no XP" (25-2) as a blanket rule | The 2026-11-21 reward ruling is newer. At the sitting Tyler reversed 25-2 for one room: the library pays a standing Level XP bonus. The bound rations of 25-2 stand |
| The castle at built prices with one work order a week for each slot, five buildings of ten levels, labor, votes, upkeep, a treasury balance and Clan Standing (25-4 and the social review's inventory) | Tyler let the price for each member stand (MM-9) and kept the buildings, labor, votes, upkeep, treasury and Clan Standing, which section 2.4 fits to that price |
| The castle hidden until a clan has ten accounts (25-3) | A price by member makes a castle of three work. Needs Tyler's yes at MM-9 |
| On-call heroes at 2 to 4 hours a day, standing parties, the on-call board, friends as an on-call roster (25-1, 25-3, the social review's first change) | Four heroes from day 1 at 12 hunted hours leave no seat to fill and no hour to lend. That reasoning was overruled. On-call heroes are back in Tyler's S-1 form, one 12 hour window every 24 hours (chapter 11), which replaces the 2 to 4 hours a day and the on-call board of 25-1 and 25-3 |
| The playtest "is finding your hero came back from a friend's hunt fun?" (game review 7.3, item 3) | It tests on-call heroes, which are kept (S-1). The playtest comes back |
| The hidden, ground-keyed Level cut on party XP, and removing it with nothing in its place | The two-thirds rule replaces both in one step (MM-19). A phase B measurement beat the phase A guess of "21 times" |
| Party size bands for pairs, threes and fours, and the size ladder work of the social review | Tyler 2026-11-21: no solo or group targets |
| A ground's own XP weekend between world weekends (27-5, second half) | MM-42 makes the ground weekend a featured-gear weekend. The +25% ceiling and "never two at once" of 27-5 stand |
| The world review's "a world boss is a schedule, the opposite of idle" | A 72-hour window with no set hour answers it |
| "The two-thirds rule is not needed in the boss room" (study 49, 5.6) | Boss points ignore Level, but the room also pays Level XP, and one rule for every party is simpler than an exception |
| The modifier table cited as steps R10 and R11 (study 49, sources) | R10 and R11 are the gear curve and exchange rates. The modifier table is R20 |
| A faction side chosen for each hero | GR-71 refuses it and keeps 25-10: the account picks one side |
| Faction skills capped at 2% (25-9), and cutting them (31-8 as first recommended) | Tyler 2026-11-21: make the skills matter |
| The clan hunt as eight heroes in one hall (25-11, second half) | One engine, one party of four. It takes the shared-pool form (MM-48). It is kept for later, not cut |
| The Local chat tab, the live party finder, the fifth seat | Rule 0 and GR-69 |
| MM-31's pace ceiling written into this chapter | It is a Crowns call and belongs to chapter 04, where it meets the 2026-11-21 ruling of no limit on how much sooner (50-11) |
| Comparable-game tables and web sources (study 49, sections 3 and 9) | Evidence for the study, not design. They stay in the source |

---

## 8. Source map

| Source | What this chapter replaces |
|---|---|
| `docs/design/balance-program/49-mmo-layer.md` (revised issue) | Sections 1, 2, 4, 5.1 to 5.8, 6 and 7, and calls MM-1 to MM-27 and MM-38 to MM-42. Section 5.9, section 3.1 and calls MM-28 to MM-37 and MM-43 go to chapter 04 |
| `docs/design/balance-program/57-review-social.md` | Sections 1, 2.2 (party systems across accounts), 2.3, 2.4, 2.5, 10 and 11.5 |
| `docs/design/balance-program/25-social.md` | All of it. Rulings 25-2, 25-5, 25-6, 25-7, 25-8 and 25-11 are carried. 25-1, 25-3, 25-4 and 25-10 are answered by MM-18, MM-9 and GR-71 |
| `docs/design/balance-program/60-game-review.md` | Section 1.6 (the social rows), 7.3 item 3, 8.7 (GR-69 to GR-72), 8.13, and 10.3 items 8 and 9 |
| `docs/design/balance-program/62-decision-book.json` and `.md` | The MMO layer area, the social area, and the waiting rows on the layer |
| `docs/design/balance-program/30-decisions.json` | 25-1 to 25-11, 27-5, 31-1, 31-3 (castle goods), 31-8 |
| Rulings of record | 2026-11-21: the MMO layer, buffs and gear, two arenas, four heroes, one Premium, no solo or group targets, one Global chat, faction skills. 2026-11-14: factions and capture the flag. 2026-10-23: no bound gear. 2026-10-22: world events get a redesign. 2026-10-18: the right-click menu |
