# Decisions: the MMO layer, social, and the player's day

Area `mmo-experience`. Decided 2026-11-21 by the game designer on `lane/d-decide-mmo`. The rows live in `mmo-experience.json` and this file mirrors them. Design only. No game code, data or migration is touched.

## The one-screen summary

**50 calls.** 40 take the recommendation, 9 are a better third option, 1 takes the alternative.

**What the layer is now.**

- Everything shared works while both players are asleep (MM-1). Presence is one system in three places (MM-20 with GR-70).
- A world boss is one server pool fought in your own scaled room. Points are boss bars broken times the tier, not minutes alive. The chest is by your own points. The buff and a bonus roll are paid only when the server fells it (MM-2 to MM-6). A death there is the normal death, once a send (MM-7).
- A clan pays buffs you hold by giving each week. Four rooms: damage, protection, town work speed and rations. No XP room, so "clans give no XP" stands (MM-8, MM-9).
- Buff caps: damage +5% standing and +10% timed, damage taken 5% and 5%, Level XP +25% timed only, drop chance +10% timed and never sold, town work +10%, no coin buff ever (MM-25). The most the layer adds is about 32% kill speed and 65% Level pace, and a player who buys nothing averages about 1.3 (MM-26).
- Four weekends: the Hearthrise XP weekend sized by the server's fire, a world boss, one ground's gear weekend, arena season end. No dailies (MM-11, MM-42, GR-82).
- Two arenas against saved setups, paid by rating tier, after one engine check (MM-12 to MM-16, MM-38 to MM-41).
- No hired or on-call heroes (MM-18). One visible two thirds line for mixed Levels (MM-19). Faction stays one side for the account (GR-71).
- The first hour is one hero to Level 5, then three more, then the Sewer as a four. The world boss opens at Level 13, the Even Arena at 20, the Open Arena at 30 (GR-79). One Start, one plan, one return card (GR-80). No hunt starts by itself, still (GR-81).

## Reversals you may veto

| # | Your ruling | What changes | Call |
|---|---|---|---|
| 1 | 25-1 and the on-call board in 25-3 (2026-11-20) | No hired, lent or on-call heroes. | MM-18 |
| 2 | 25-4 and the ten-account castle gate in 25-3 (2026-11-20) | The castle is priced per member with a floor of five, one project at a time, open at any size. The weekly time floor and the six month pace are kept. | MM-9 |
| 3 | 27-5, second half (2026-11-20) | The in-between ground weekend features named gear in place of XP. | MM-42 |
| 4 | The Hearthrise lights when the fire fills (2026-10-25) | It lights on the calendar's weekend, sized by the fire from +10% to +25%. | GR-82 |
| 5 | Criers speak in Local chat (2026-11-11) and the party finder (2026-10-15/16) | No Local tab and no live finder. Criers speak in the town and the System tab. | GR-69 |
| 6 | The hidden Level cut on party XP (the 2026-11-08 party XP rulings as chapter 06 reads them) | One visible two thirds line. | MM-19 |
| 7 | 25-11, second half (2026-11-20) | A clan hunt is two rooms on one clan pool, not eight heroes in one hall. | MM-48 |

**Rulings I was asked to change and kept.**

| Ruling | Outcome |
|---|---|
| 25-2, clans give no Level XP | Kept. Clan rooms pay damage, protection, town work speed and rations. The library is cut (MM-9, MM-25). |
| 25-10, faction for the whole account | Kept. The per-hero re-open is refused (GR-71). |
| 27-1, no hunt ever starts by itself | Kept. Next ground when outgrown is refused (GR-81). |
| 24-10, a town project a month | Kept inside the Great Hearth (GR-82). |

## Money and grants: Tyler confirms

| Call | What I recommend |
|---|---|
| MM-21 | MONEY, TYLER CONFIRMS. Decided part: everything in the layer is open to every account. Recommended to you for Premium: arena tickets bank to 30. Not recommended: timed buffs lasting a quarter longer. |
| MM-43 | THIS IS A GRANT. TYLER CONFIRMS. I do not decide it. Recommended: yes, for the wiped Discord playtest only, the same amount for every account, one server switch that is off by default and removed before Early Access, every grant journalled. |

MM-28 to MM-37 are the content-economy decider's.

## Handed to other deciders

| To | What |
|---|---|
| Core and progression decider | MM-7 stands only with GR-7 yes. GR-79 step 13 stands on check C3, with the Thicket as the fallback first party hunt. GR-24 input. Bulwark and Reap sized for a whole account on one side (GR-71). Damage taken buffs inside the 60% cap. MM-5 needs bars broken an hour flat across Levels. |
| Progression decider | MM-26: ceiling 1.65 Level pace, earned-only average about 1.3. Size the region lead R1 on the paid seat only if an always-on XP boost is sold. |
| Economy decider | MM-29 to MM-31: timed Level XP is earned only on the Hearthrise weekend, so the XP boost is the store's. The drop chance row is never sold. MM-31 and MM-26 should be one ceiling. Sizes for clanWeeklyShare, castleStagePerMember with the floor of five, the MM-43 amount, and Premium's list (MM-21). |
| Items decider | Boss and arena lines are uniques at the band's best budget as sidegrades (MM-6, MM-14). The featured term for ground weekends (MM-42). Path rows for Levels 17 to 29. |
| Home decider | The Great Hearth with weekend 1 as the Hearthrise (GR-82). The Workshop row inside the 40% Speed pool. Crier lines in the town. "Party member" leaves the visit rule. |
| World decider | An old ground at your Level takes the leader's Level, as ruled (MM-19). The world boss reuses the boss room and formula (MM-2, MM-5). |
| Platform and Security | Presence cost (MM-20, GR-70) inside $0.15. The engine check (MM-41). The standing gift, boss chest, arena results and the test Crowns switch in the one Security review. |

## The first hour, re-checked against real data (GR-79)

The sequence is chapter 08 section 2.1. I re-checked the rows it stands on in `src/data` on this branch. "Holds" is what the player has from the steps before it and the real starting kit.

| # | Step | Holds before it | Data I checked | Doable |
|---|---|---|---|---|
| 1 | Make the first hero and pick a way to fight | Nothing | `start-kit.js` STARTER_SETS has six rows: tank, dual_axes, club, mage, ranger, healer | Yes |
| 2 | Enter the Mill Cellar alone | Level 1, the kit's food, a full stamina bar | `hunt-grounds.js` mill_cellar, groupFit both | Yes |
| 3 | Giant Rats task taken on entry | Nothing needed | `tally-tasks.js` cellar_giant_rats, 25 kills, 25 gold | Yes, once GR-78 is built |
| 4 | Level 5, the Cellar ends itself | About 17 minutes of kills (PLAYED) | `hunt-grounds.js` mill_cellar endsAtLevel 5, the only ground with one | Yes |
| 5 | Make three more heroes | One hero, three free slots | RULED 2026-11-21, four from the start. `party.js` maxSize 4 | Yes |
| 6 | Keep my company blessed | Heroes under Level 30 | `blessings.js` freeUntilLevel 30 | Yes |
| 7 | Three recruits run the Cellar while the first hunts Meadowbrook Thicket | Three Level 1 heroes with kits, one Level 5 hero | mill_cellar groupFit both. `tally-tasks.js` thicket_gray_wolves, 200 kills, 480 gold | Yes. Pace is check C2 |
| 8 | All four enter the Millrace Sewer on Normal | Four heroes at Level 5 to 7, practice gear, a helm | `hunt-grounds.js` millrace_sewer, groupFit both, the Rat King room forParty 2 (a warning, never a gate) | NOT PROVEN. Check C3, the core decider's. Fallback: the four hunt Meadowbrook Thicket together and the Sewer card moves to the Level where C3 passes |
| 9 | The rest plan and the first home | Ore and logs from the first night | `shops.js` property.homestead | Yes, once the job queue of GR-80 is built |

Steps 3 and 9 need features decided here and not built. Step 8 needs a measurement. A sequence with an unproven step is not done, so GR-79 is decided with its fallback and is final only when C3 reads green.

## The rows

### MM-1. Rule 0: every shared feature works while both players are asleep.

- **Decision (recommended).** Yes, as a standing rule. Heroes meet and owners check in. A feature that needs two people at the screen in the same minute is not in the game, and every later social idea is tested against this first.
- **Reason.** This is an idle game and people are almost never on at the same minute. If the social stuff needs both of us awake it is dead on a small server. If it works while we sleep it works at 10 accounts and at 10,000.
- **Evidence.** EVIDENCE, thin. Four testers over 33 days: two people pressed in the same ten minutes in 5 of 675 windows, and their heroes hunted in the same hour in 46 of 452 (chapter 06 section 1, study 49). Only the direction is used.
- **Replaces.** Nothing.
- **Depends.** Everything in this file reads it. GR-69 (the live finder goes), MM-12 (no live opponents), GR-82 (the Hearth passes it).

### MM-2. A world boss is one health pool the whole server shares, fought by each account in its own room.

- **Decision (recommended).** Yes. One pool for the server. Each account sends its own four into its own room, scaled to that party, and what the party does comes off the shared pool. This is the redesign of live world events the 2026-10-22 ruling asked for.
- **Reason.** It puts "the server is killing this together" on my screen without a second combat engine and without anyone being online together. My four fight like any hunt and the bar everybody shares goes down.
- **Evidence.** COMPUTED for cost (one fold a minute, about 4,300 runs a weekend, chapter 06 section 2.3). HYPOTHESIS for fun. Playtest A (a posted server-wide kill goal for one weekend) and check D (1,000 synthetic rooms under 0.1 database-seconds an account-day) overturn it.
- **Replaces.** Builds the 2026-10-22 ruling (world events get a deliberate redesign). Changes none.
- **Depends.** GR-28 and GR-30 (the boss door and the boss formula, world decider). GR-9 (scaling to a party Level). Chapter 09 owns the measured cost.

### MM-3. A world boss stands for a window of about 72 hours and never at a set hour.

- **Decision (recommended).** Yes. Friday to Monday, about 72 hours, fought on stamina with the browser closed.
- **Reason.** A boss at 8 pm is a schedule and half the world is asleep for it. A weekend window lets everybody get their hits in on their normal two visits.
- **Evidence.** Follows from MM-1. HYPOTHESIS on the length. The playtest read "hours for the boss to fall, 36 to 60" overturns it.
- **Replaces.** Nothing.
- **Depends.** MM-4 sizes the pool to this window.

### MM-4. A world boss is sized by weekly active accounts, with a floor one account can fell.

- **Decision (third).** Take the recommended formula and add the rule chapter 06 said was missing. pool = max(bossPoolFloor, bossPoolPerAccount x weekly active accounts). When the window ends the boss leaves whether it fell or not. After each boss the server re-sizes bossPoolPerAccount from what that weekend really earned, aimed at a fall at hour 48, moved at most a quarter each time.
- **Reason.** A boss that never falls or falls in three hours with nobody watching is a dead feature. The pool should fix itself from the last weekend, by formula, so nobody has to babysit it.
- **Evidence.** COMPUTED start sizes: about 6 Normal party-hours an account, floor about 24 (chapter 06 section 2.3). The self-sizing step is mine and is a HYPOTHESIS. Two boss weekends in the Discord playtest overturn it if the second fall is not nearer hour 48 than the first.
- **Replaces.** Nothing.
- **Depends.** MM-6 (the fall is what pays the buff). Reliability engineer for the alarm when a pool misses twice. Two new knob rows for the balance tools lane.

### MM-5. Your share of a world boss is counted against your own Level in a room scaled to your party.

- **Decision (third).** Scaled room, yes. But points are not minutes survived. Points = boss bars broken in your room x the tier multiplier from the one tier table. A bar is the scaled boss health for your party Level. When the bar empties it refills and the phases run again (adds at half, enrage at a quarter). A Level 20 four and a Level 300 four earn the same points for the same quality of fight.
- **Reason.** If points are just minutes alive then four shield tanks who never swing are the best boss party in the game and my damage means nothing in the one fight the server shares. Counting bars broken makes damage and survival both matter and it lets the boss phases actually play.
- **Evidence.** COMPUTED from the formula rule that a mid-geared party breaks a scaled boss in the same time at every Level. HYPOTHESIS until measured. Matrix check: a mid-geared four at Levels 20, 60 and 110 breaks bars an hour within 10% of each other on Normal. If not, the fault is in the boss formula and is fixed there.
- **Replaces.** Nothing.
- **Depends.** GR-27 (the one tier table), GR-30 (boss formula), GR-3 (Deadly sizing). All core and world deciders. Best gear earns about 15% more points, which is the ruled gear size and is intended.

### MM-6. A world boss pays a chest by your own points: its own named gear line at your band, its own upgrade material, a 7 day buff, a trophy. No coin.

- **Decision (third).** Take the recommended pay with one change so the shared pool matters. The chest is by your own points at three marks (about 2, 8 and 20 Normal party-hours). The boss line is four unique pieces, one a style, dropped at the earner's band, on the same budget as the band's best piece with part of it spent on one property. So it is a sidegrade to the band's best, never a tier above it. The material trades. Level XP is about a Normal hunt. No coin. NEW: the 7 day buff (+5% damage dealt) and one extra roll on the boss line are paid only if the server fells the boss, to everyone past the first mark.
- **Reason.** People want gear and buffs, so that is what it pays. But if my chest and my buff only read my own points then the shared health bar is decoration. Tying the buff and a bonus roll to the fall is what makes me care that other people showed up.
- **Evidence.** RULED direction (2026-11-21, buffs and gear). RULED 2026-11-18 that a unique is a sidegrade with a place where it is best. Sizes are TARGET and a HYPOTHESIS. Check E (chest value and XP per stamina hour beside a Normal hunt at Levels 20, 60, 110) and the playtest read "over half of accounts hit the boss on both weekends" overturn them.
- **Replaces.** Nothing.
- **Depends.** Items decider: the line must sit in the item plan as uniques under 31-4 and must not outclass a hall prize (GR-29, GR-40, GR-4). Drop rate target handed on: generous through Krell, rare after, per the 2026-11-20 ruling. MM-25 (the buff sits in the timed damage cap). Weekly chest limits stay as ruled.

### MM-7. A death in the boss room costs the normal death.

- **Decision (recommended).** Yes, the normal death and nothing else, decided together with GR-7. Four conditions go with it. One death a send at most, because a death ends the fight and nothing restarts by itself. Carry on never sends a hero into a boss room. Keep me blessed covers boss sends. The boss card shows deaths per 100 hours for the tier and what one death costs this hero before the send, and the first send defaults to Normal.
- **Reason.** Risk is what makes picking Deadly on the boss a real choice. A soft boss death would be a special case and everybody would just send on Deadly. Normal is as safe as a Normal hunt, so nobody loses a Level by accident over a weekend away.
- **Evidence.** RULED parts: 6% flat with no cap (2026-11-21), a death ends the hunt (2026-11-09), no hunt starts by itself (27-1). Chapters 05 and 06 both recommend it. HYPOTHESIS that the harder boss tiers stay used past Level 100. That needs the GR-7 Blessing ladder. Playtest 8 (returns after a costly death) overturns it.
- **Replaces.** Nothing.
- **Depends.** CORE AND PROGRESSION DECIDER: this stands only if GR-7 (the Blessing ladder past the third) is decided yes. If GR-7 is refused, bring MM-7 back, because a Level 300 hero would risk about 26 hours for a chest roll. GR-66 (the risk reading on the card).

### MM-8. A clan is a shared work, a team and a room that pays members in buffs, held by giving that week's share.

- **Decision (recommended).** Yes. A member holds the clan's room buffs in any week their account gave the week's share. Roster size pays nothing. Ranks are leader, officer, member, with no votes. A leader away 14 days passes it on. When the clan finishes its weekly goal every member who gave gets +5% drop chance for 7 days. A clan never fills a party seat.
- **Reason.** A clan has to give my heroes something or nobody joins one. Holding the buff by giving each week means a second account padding the roster gets nothing, and the clan is a gold sink that never ends.
- **Evidence.** RULED direction (2026-11-21, clans pay buffs). RULED 25-5, 25-6, 25-7 carried. HYPOTHESIS on take-up. Playtest reads: over a third of accounts in a clan by day 7 and half of clans with gifts from three or more members.
- **Replaces.** None. See MM-9 for how 25-2 is kept.
- **Depends.** MM-9, MM-25, MM-44 (the standing gift). Economy decider sizes clanWeeklyShare on the wage curve (GR-51). Security scope: gifts and the share are shared writes.

### MM-9. The castle is one project at a time on the town project engine. Each room carries one standing buff up to the standing caps.

- **Decision (third).** One project at a time on the town project engine, and four rooms of five levels. War room: damage dealt up to +5%. Ward: damage taken up to 5% less. Workshop: town work speed up to +10%. Kitchen: raises the clan's weekly ration cap. There is NO library and no Level XP room. A stage is priced per member, as castleStagePerMember x max(5, members), so a small clan can build and a clan of one pays for five. A stage can never finish in under a week. Twenty stages is about six months, the pace you kept on 11-20. The castle is open at any roster size. No labor, no upkeep, no treasury balance. Castle goods keep their prices (31-3).
- **Reason.** You said keep the castle a slow climb with gold and time, and I kept both. What I changed is the fixed price, because a fixed price means a clan of 3 never finishes and a clan of 60 finishes in a day. I also cut the XP room. A damage buff already makes me level faster, so an XP room is the same thing twice and it is the one room that broke your "clans give no XP" ruling.
- **Evidence.** COMPUTED: 4 rooms x 5 levels at one stage a week or slower is 20 to 26 weeks. Per-member pricing is flat by construction at 5 members and up. Sizes are TARGET with no measurement (chapter 04 section 2.6 says so). HYPOTHESIS that small clans build. Playtest read: clans with gifts from three or more members.
- **Replaces.** REVERSAL. 25-4 (2026-11-20): the built fixed prices and "one work order a week for each slot" become a per-member price and one project at a time. The weekly time floor and the six month pace are kept. Also the ten-account castle gate inside 25-3. KEPT, not reversed: 25-2 (clans give no Level XP) and the bound rations.
- **Depends.** Economy decider: sizes castleStagePerMember and clanWeeklyShare (GR-8, GR-51, MM-22). Home decider: the Workshop row enters the one Speed pool under its 40% cap (chapter 07). Core decider: the Ward row counts inside the 60% mitigation cap, as chapter 01 recommends. Chapter 07 town project engine.

### MM-10. A weekly clan board. The top clans carry a small timed buff the next week.

- **Decision (third).** A weekly board with three lines (boss points, arena standing, best Tower floor), scored as the average of the clan's top members, reset weekly with all-time records kept. But the buff is paid by mark, not by rank. Any clan whose week reaches a set score mark earns up to 5% less damage taken for the next 7 days, in three steps. The top three clans get the banner and the plaque on top. Under five clans the board shows a clan against its own last week and the marks still pay.
- **Reason.** If only the top clans get the buff then the strongest clan gets stronger every week and everyone else stops trying. The boss chest and the arenas already pay by your own score and not by rank, so the board should work the same way.
- **Evidence.** Consistent with MM-6 and MM-14 (pay by own score, never rank). HYPOTHESIS that marks keep mid clans trying. Playtest read: the share of clans that reach the first mark in week two against week one. If the board is not used by 14 days the board is not built further (chapter 06 section 6).
- **Replaces.** Nothing.
- **Depends.** MM-25 (it fills the timed damage-taken cap). Number of top members and the mark sizes go to the balance matrix. Chapter 09 (one weekly fold).

### MM-11. Events are a four-weekend rotation written a year ahead, with no dailies, login calendar or season pass.

- **Decision (recommended).** Yes. Weekend 1 the Hearthrise (the world Level XP weekend). Weekend 2 a world boss. Weekend 3 one ground's weekend. Weekend 4 the arena season end and clan board honors. Written as data rows a year ahead and run by the server. No daily quests, no login calendar and no season pass, ever. GR-83 is decided here.
- **Reason.** With four heroes a daily quest is four chores, and my visit is two to four minutes. I want one thing each weekend the whole server shares, and nothing that punishes me for missing a day.
- **Evidence.** RULED parts: +25% ceiling and never two at once (27-5). Daily goals were cut 2026-10-22. HYPOTHESIS that a weekend beat is enough pull. Playtest read: ten-minute windows with two or more people pressing, weekend against weekdays.
- **Replaces.** None by itself. See MM-42 and GR-82 for the two changes inside it.
- **Depends.** MM-42, GR-82 (weekend 1 is the Hearthrise), MM-3. Chapter 08 Week card and return card show the next weekend.

### MM-42. Events pay buffs and gear: a Level XP weekend, a ground weekend that features its named pieces, boss and arena weekends.

- **Decision (recommended).** Yes. The between-months ground weekend features that ground's named pieces and does not pay XP. It fills the timed drop chance cap (+10%) for everyone hunting that ground, on its named pieces only. The world Level XP weekend stays once in four weekends, as ruled. If the playtest shows a ground weekend does not move people, it goes back to the ruled ground XP weekend.
- **Reason.** One XP weekend a month is plenty and a second one just makes everyone level faster than we can build regions. A gear weekend sends the whole server to one ground, so the presence strip is full and new players see veterans there. Named pieces stay worth chasing because they reforge up a band.
- **Evidence.** HYPOTHESIS. +10% on a rare is a small pull by itself. The draw is the shared place. Playtest read: hunted hours on the featured ground at least double against the week before. If not, revert to 27-5 as ruled.
- **Replaces.** REVERSAL. The second half of 27-5 (2026-11-20, "in between, one party ground gets its own XP weekend"). The first half, the +25% ceiling and "never two at once" all stand.
- **Depends.** Items decider: the featured term of the drop formula and which pieces are named (GR-40). GR-9 lets any Level hunt the featured ground. Progression decider: this keeps the timed Level XP cap full only 3 days in 28 for a player who buys nothing.

### GR-82. Town Works, the Hearthrise event and flame powders become one Great Hearth.

- **Decision (recommended).** Yes, one landmark and one window with three parts: the Fire (fuel), the Works (gold) and the Colors (powders and named fuels). Fuel only ever moves the Fire and gold never does. The monthly project and its sizing stay exactly as ruled. And one rule for the calendar: weekend 1 IS the Hearthrise. The calendar says when it lights. The server's fire says how big it burns, from +10% Level XP on an empty fire up to +25% on a full one. A full fire is a fixed amount of fuel for each weekly active account.
- **Reason.** Three little systems standing around the same fireplace should be one place. And we had two different server XP events, one on a date and one when the fire fills, which could land on top of each other. Making them one thing means feeding the fire all month actually matters for the weekend.
- **Evidence.** HYPOTHESIS that one Hearth is more fun than its parts, and that a fire-sized weekend makes people burn fuel. Playtest read: fuel burned in the week before weekend 1 against the week after. The +10% floor is so a quiet server still gets a weekend.
- **Replaces.** REVERSAL, small. The 2026-10-25 Hearthrise ruling said the bonus starts when the fire fills. It now lights on the calendar's weekend at the size the fire earned. Fuel only, no gold, and the +25% ceiling stand. 24-10 is NOT reversed: a project a month, sized to the server, with the plaque.
- **Depends.** Home decider owns the window and the staged-gift engine (chapter 07 section 2.12). Progression decider: Inner Flame stays a hero skill (GR-61 Kindlings). MM-9 castle rides the same engine. MM-25 timed Level XP cap.

### MM-24. Every buff is a row in one modifier table, and every MMO layer piece sits on the gear curve at the earner's band.

- **Decision (recommended).** Yes. One table (formula step R20). Rows on one knob sum, then the cap applies. No reward has code of its own. The hero sheet shows one line, for example "Buffs: damage +11% of 15, Level XP +25% of 25". A buff from the same source refreshes and never stacks with itself.
- **Reason.** This is the formula-driven game you asked for. If every buff is a row I can read on my sheet, I always know what I have filled and what is left to chase, and nobody has to write special math for a boss or a clan.
- **Evidence.** RULED 2026-11-21 (balance at the formula layer, rewards are buffs and gear). COMPUTED cost: read at the settle with no new statement (chapter 09).
- **Replaces.** Nothing.
- **Depends.** Core decider (GR-85, R20). Economy decider (MM-30, bought boosts are the same rows). Balance tools lane: drop chance and town work speed knobs are missing from knobs.json.

### MM-25. The buff caps: damage +5% standing and +10% timed, damage taken 5% and 5% less, Level XP +5% and +25%, drop chance +10% timed, town work +10%, no coin buff.

- **Decision (third).** The table as recommended with one cut: there is no standing Level XP cap, because no clan room gives XP (MM-9). Damage dealt: +5% standing, +10% timed. Damage taken: 5% less standing, 5% less timed. Level XP: none standing, +25% timed. Drop chance: none standing, +10% timed and earned only, never sold. Town work speed: +10% standing. Coin: no buff, ever. Who fills what: war room, ward and workshop fill the standing caps. Timed damage comes from the boss (+5%) and the Open Arena season (up to +5%). Timed damage taken comes from the clan board marks. Timed drop chance comes from the clan weekly goal (+5%) and the Even Arena season (up to +5%). Timed Level XP comes only from the Hearthrise weekend and whatever the store sells.
- **Reason.** I want every cap to have a clear way to earn it and no cap that exists for one row. Earned buffs make me kill faster, live longer and find more. Level XP is the weekend for everyone and the thing Crowns buy, which is the engine you described. A coin buff would let money print gold, so never.
- **Evidence.** COMPUTED inside the ruled gear sizes (a weapon step is 5% to 8%, best gear about 15%). RULED: +25% event ceiling (27-5), Luck has two feeds only (2026-11-20), so the drop row multiplies after Luck and is never sold. Sizes are TARGET. Check G on the matrix overturns them.
- **Replaces.** None. It is what lets 25-2 stand.
- **Depends.** Economy decider: MM-29 and MM-30 decide whether a Level XP boost is sold. If it is not, the timed XP cap is full only on the Hearthrise weekend. Core decider: damage taken buffs count inside the 60% mitigation cap. Home decider: the workshop row and the 40% Speed cap.

### MM-26. The power budget: a fully buffed, boss-geared four gains at most about 32% kill speed and about 72% Level pace over a plain four in mid gear.

- **Decision (third).** The ceiling is about 32% more kills an hour and about 65% more Levels an hour, not 72%, because the standing XP cap is gone. The Level table stays the clock of the plain four and never reads a buff. And the number chapter 05 asked for: a player who earns every buff and buys nothing averages about 1.3 times the plain pace over a month. Only a player with a bought XP boost running every hour sits at the 1.65 ceiling.
- **Reason.** Buffs have to feel like time gained, so the table is timed on the plain four that everybody has. But the fastest players set when the next region has to be ready, so I want that number honest and as small as it can be while buffs still matter.
- **Evidence.** COMPUTED. Ceiling: 1.15 gear x 1.15 damage x 1.25 XP = 1.65. Earned-only average: 1.15 x 1.11 (5% standing, boss 5% for 7 days in 28, arena 5%) x 1.03 (25% for 3 days in 28) = 1.31. Check G overturns it: kill speed 1.25 to 1.40, Level pace 1.5 to 1.7, and no cell where the buffed four holds a tier the plain four cannot enter.
- **Replaces.** Nothing.
- **Depends.** PROGRESSION DECIDER (GR-6): size R1, the region lead, on 1.65 only if the store sells an always-on XP boost, else on about 1.3 to 1.4. ECONOMY DECIDER (MM-31): the paid pace ceiling of 1.60 now sits just under this ceiling and the two should be one number. Art and asset directors for the region schedule.

### MM-13. Two arenas: an even arena that normalizes every stat, and an open arena that reads real gear, upgrades and buffs.

- **Decision (recommended).** Yes. Even Arena: every hero at one reference Level with a reference kit of its own weapon type and armor weight, kit rows tuned for the arena alone, and no gear, buff or boost read. Open Arena: heroes as they stand, with damage and damage-taken buffs under the same caps. XP and drop buffs do nothing in either.
- **Reason.** You ruled two arenas. One is where my party choice and my bar rules win, and money does nothing. The other is where the gear I chased and paid for shows. Both use the same fight engine as a hunt.
- **Evidence.** RULED 2026-11-21 (two arenas). What each reads is a design choice. HYPOTHESIS on balance between styles. Playtest read: every style pairing wins 40% to 60%, and check C comes first.
- **Replaces.** Nothing.
- **Depends.** MM-41 (the engine check gates both). Economy decider MM-37 (paying gives nothing in the Even Arena). Core decider: whether faction skills are read in the Even Arena. My call is no, the reference kit carries no faction skill.

### MM-12. Arena opponents are saved setups and house teams, never live players.

- **Decision (recommended).** Yes. The opponent is another account's four as they stood at its last attack, saved by the server. A handful of house teams written as data fill a new or thin server. A fight is about 90 seconds, watched or skipped. The client sends one intent, fight offered opponent 1, 2 or 3, and the server builds both sides and runs it.
- **Reason.** Nobody is online when I am, so I fight their setup and not them. It also means there is nothing a browser can forge, because the server builds both teams from its own tables.
- **Evidence.** Follows from MM-1 and CLAUDE.md section 1. COMPUTED cost estimate 0.13 to 0.2 database-seconds a fight, and edge time is unmeasured until check C.
- **Replaces.** Nothing.
- **Depends.** MM-41. Security review scope before Early Access.

### MM-14. Arena rewards by rating tier: a season buff and title in the even arena, and the arena's own gear line in the open arena.

- **Decision (recommended).** Yes, by rating tier with a minimum number of fights, never by rank. Even Arena: up to +5% drop chance for the next season, a title and a banner. Open Arena: a piece of the arena line at the hero's band (a sidegrade to the band's best, like a boss piece), its material, up to +5% damage dealt for the next season, and a title. Seasons are four weeks with a soft reset. No stamina, death, XP or coin in either.
- **Reason.** A top-ten prize puts the gear in the same hands every month. A tier anyone can reach with enough good fights means the gear is a goal for everybody in their own band, and the Even Arena gives a builder with bad gear a buff to chase too.
- **Evidence.** RULED direction (buffs and gear). HYPOTHESIS that the Open Arena stays fair when it pays gear to the geared. The band matching of MM-38 is what protects it. Playtest reads: accounts with 10 or more fights over a third, and Open Arena fights against real setups over half by week two.
- **Replaces.** Nothing.
- **Depends.** Items decider: the arena gear line fits the item plan the same way as the boss line (MM-6). MM-25 for both buffs. MM-38.

### MM-15. Arena fights use tickets that bank, 5 a day up to 20.

- **Decision (recommended).** Yes. 5 a day, banking to 20.
- **Reason.** A missed day loses nothing, so it is not a daily. Four days of tickets wait for me.
- **Evidence.** TARGET numbers. HYPOTHESIS. Playtest read: 2 or more fights an account a day.
- **Replaces.** Nothing.
- **Depends.** MM-40, MM-45, MM-21.

### MM-40. Each arena has its own tickets.

- **Decision (recommended).** Yes, two pools.
- **Reason.** With one pool everyone would spend every ticket in the arena that pays gear and the Even Arena would be empty.
- **Evidence.** Design reasoning. HYPOTHESIS. Playtest read: fights in each arena are within a factor of three of each other.
- **Replaces.** Nothing.
- **Depends.** MM-15.

### MM-16. The server offers three opponents, being attacked costs nothing, and your defense is your last attack party.

- **Decision (recommended).** Yes to all three. Nobody chooses an account to fight. Two accounts on one network are never offered each other.
- **Reason.** I never lose rating while I am asleep and I never have to set a defense. Nobody can feed wins from a second account because nobody picks who they fight.
- **Evidence.** Design reasoning against the named cheats (chapter 06 section 2.6). Verified only by the Security review.
- **Replaces.** Nothing.
- **Depends.** Security review. MM-12.

### MM-17. No PvP on the hunting grounds, ever.

- **Decision (recommended).** Yes, never.
- **Reason.** The idle hunt is the game. Nobody should come back to a dead hero because another player found them asleep.
- **Evidence.** Follows from MM-1 and the idle identity in your design brief.
- **Replaces.** Nothing.
- **Depends.** MM-20.

### MM-38. The open arena matches by gear band, then rating, and thin bands borrow from the next band and from house teams.

- **Decision (recommended).** Yes. Band first, then rating, three offered. A thin band borrows from the next band up and from that band's house teams.
- **Reason.** Gear decides the Open Arena, so I should only meet people in gear like mine. On a small server I would rather fight a house team than wait.
- **Evidence.** HYPOTHESIS that it feels fair on a small server. Playtest read: Open Arena fights against real setups over half by week two in the busiest band, and no band where one account wins over 80%.
- **Replaces.** Nothing.
- **Depends.** Items decider (gear bands, GR-4). MM-14.

### MM-39. The even arena is one ladder for everyone, with three opponents offered near your rating.

- **Decision (recommended).** Yes.
- **Reason.** Nothing bought or found is read, so one ladder is fair and it is full even at 10 accounts.
- **Evidence.** Follows from MM-13.
- **Replaces.** Nothing.
- **Depends.** MM-13.

### MM-41. Measure once whether the engine can run heroes on both sides of a fight, before either arena is planned.

- **Decision (recommended).** Yes, and it is the first arena work of any kind. A four against a four on the replay harness: does it run, how long a 90 second fight of eight takes in the edge, and does one style always win. If it fails, both arenas become their own program after the beta and stay hidden.
- **Reason.** Both arenas are just a nice idea until we know the engine can put heroes on the enemy side. It is a measurement, so it does not break the no build lanes rule.
- **Evidence.** None yet. This row IS the missing evidence (check C).
- **Replaces.** Nothing.
- **Depends.** Systems engineer runs it. MM-12, MM-13, MM-14 wait on it.

### MM-18. No hero is hired, lent or put on call. A party is your own heroes.

- **Decision (recommended).** Yes. No hire, no lending, no on-call board. Nobody else ever sends your hero. Two friends can still form a party by hand through an invite, both on purpose, with the shared supply bill of 25-8. It comes back to you only if playtest friends ask to lend heroes without being prompted.
- **Reason.** On-call heroes were to fill empty party seats. Now every account has four heroes from the first hour and all four hunt 12 hours a day, so there is no empty seat and no spare hero-hour. What is left is a market in carried leveling and one more thing Security has to lock down.
- **Evidence.** COMPUTED: among four real players with top Levels 79, 46, 9 and 8, one pair in six could share XP under the two thirds line (chapter 06 section 2.10). RULED 2026-11-21 (four heroes from the start) is newer than 25-1.
- **Replaces.** REVERSAL. 25-1 (2026-11-20, on-call heroes at 2 hours a day, 4 at most) and the on-call board inside 25-3. The rest of 25-3 stands: roster, clan chat, clan browser.
- **Depends.** Home decider: "party member" drops out of who may visit a house (GR-75). Chapter 09: no hero-lending trade surface in the Security scope. GR-10a is closed.

### MM-19. Mixed Levels in one fight follow one visible two thirds line.

- **Decision (recommended).** Yes. A hero keeps its full share of Level XP if its Level is at least two thirds of the highest Level in the party. Below that it keeps hero Level / (2/3 x top Level). One knob, levelShareLine. The party window says it before the hunt starts. One rule for every party, the boss room included. And the open question from chapter 02: an old ground hunted at your Level takes the LEADER's Level, as ruled, and the party picks its leader.
- **Reason.** With no rule a Level 5 hero behind my Level 37 party levels six times faster than it should, which is a boosting market. A hidden cut is worse. One line I can read before I press Start is honest, and carried is a bit better than alone and never several times better.
- **Evidence.** MEASURED cells of the proposed rule: a Level 5 behind a Level 37 party earns about 1.2 times its own pace and a Level 10 about 1.6. With no rule, 6.1 and 4.1 (chapter 06 section 2.8). Survival in those cells is provisional. Check F re-runs the eight carried cells once the engine sends real damage to the back row.
- **Replaces.** REVERSAL, technical. It replaces the hidden ground-keyed Level cut on party XP that chapter 06 traces to the 2026-11-08 party XP rulings. The 11-08 rulings on one difficulty for all group sizes and the same monsters for everyone are untouched.
- **Depends.** Core decider (the party XP step, R8, GR-85). World decider: whose Level a scaled old ground takes is decided here as the leader's (GR-9). Economy decider: the wage of a mixed four follows the same line. GR-10b is closed.

### MM-20. Other players on a hunting ground are seen through a presence strip and never fought beside.

- **Decision (recommended).** Yes, and it is ONE system with GR-70. Presence counts heroes and not browsers. One read shows it in three places: the town (heroes at work), a ground's card and hunt view ("3 other parties are hunting here", by leader, clan tag and size), and the world boss page. Each list is short and capped, clan mates and friends first, then nearest Level. Quiet presence leaves you off every list. No shared combat grounds and no 8-person areas.
- **Reason.** I want to see that other people exist the minute I open a hunt, without them being able to touch my monsters. A shared spawn with both owners asleep is just a tax. A strip costs almost nothing and it is the first MMO thing a new player sees.
- **Evidence.** COMPUTED estimate about 0.5 database-seconds an account-day or zero if it rides the hunt update (chapter 06). HYPOTHESIS that being seen is enough. Playtest read: four of five players can name something another player did.
- **Replaces.** None. 8-person open areas were an option you asked about on 2026-11-21, not a ruling.
- **Depends.** GR-70 (same system). Chapter 09 and study 48 own the measured cost. It is first in the planning order (MM-23).

### GR-70. The town shows heroes at work whether or not their owner is online.

- **Decision (recommended).** Yes, as the town view of the one presence system in MM-20. One row for each working hero, changed only when its job changes. Friends and clan mates are seated first and the bodies drawn in one view are capped (TARGET 40). It ships only inside the cost budget. If study 48 says it does not fit, the town draws your own heroes and your friends and clan mates only.
- **Reason.** Heroes work in town for all 12 rested hours, so the town is full while everyone sleeps. A town that only draws live browsers is empty at 10 accounts, and the town is our screenshot. It also gives outfits and titles an audience.
- **Evidence.** RULED 2026-11-18 (the online count is by heroes). HYPOTHESIS that working heroes read as alive and not as statues. Playtest: the first week with it on, asked aloud. Cost is PENDING study 48.
- **Replaces.** Nothing.
- **Depends.** MM-20. Home decider (chapter 07 section 2.9 draw rules). Chapter 09 cost budget of $0.15 an account.

### GR-69. Remove the Local chat tab and the live party finder, and strike the fifth seat.

- **Decision (recommended).** Yes to all three. No Local tab. Town crier and NPC tip lines show as speech in the town itself and in the System tab, never in Global, because Global is for people. No live party finder: a party is your own four and friends invite by the right-click menu. The cap is four and "maybe 5 later" comes off the books.
- **Reason.** Hunts are instanced so "local" is my party, which has its own tab. A live finder needs two strangers online at the same minute, which almost never happens here. Dead tabs and empty finders make a small game look abandoned.
- **Evidence.** EVIDENCE: 5 of 675 ten-minute windows held two people pressing (study 49). The review found none of the three in use (60 section 8.7). RULED 25-11 already caps a party at four.
- **Replaces.** REVERSAL, small. 2026-11-11 (criers call out in local chat): they speak in the town and the System tab. 2026-10-15/16 (a party finder that filters by weapon type) is removed.
- **Depends.** MM-1, MM-18. Home decider: crier lines in the town (chapter 07). Chat tabs kept: Global, Clan, Party, Whispers, System, Combat.

### GR-71. A faction side is chosen for each hero.

- **Decision (third).** No. Keep your ruling 25-10 as it stands. The account picks one side and one press joins every hero that has killed Krell. All four carry that side's skill, Bulwark or Reap. An account can swap sides and keeps earned sets, as ruled on 11-14.
- **Reason.** Per hero sounds like more choice but it is not one. Everybody would put Bulwark on the tank and Reap on the rest, which is a solved answer. One side for the account is a real trade between a tougher four and a deadlier four. It also keeps my four earning standing on the same grounds, and it keeps the two sides meaning something for a side against side tally later.
- **Evidence.** Design reasoning, HYPOTHESIS. Matrix cell G4 overturns it: if one skill is better for every lineup once the skills are sized, the skills are re-sized at the formula layer. If players in the playtest ask to split their four, bring it back.
- **Replaces.** None. 25-10 stands. The re-open asked by the social review is refused.
- **Depends.** Core decider sizes Bulwark and Reap (31-8) knowing all four heroes carry the same one. Side against side stays hidden until both sides can be filled and it passes rule 0.

### GR-72. A friend link at sign-up, with no reward.

- **Decision (recommended).** Yes. A new player who arrives by a friend's link starts with that friend on the list. No reward of any kind for either side.
- **Reason.** My players arrive as friends from Discord and the game does nothing with that today. No reward means there is nothing to farm with fake accounts.
- **Evidence.** Design reasoning. Small and gives nothing away.
- **Replaces.** Nothing.
- **Depends.** MM-47 (friends are linked by account). Security: the link carries no value.

### MM-21. Every boss, clan, event and arena is open to all. Premium makes timed buffs last a quarter longer and banks arena tickets to 30.

- **Decision (third, TYLER CONFIRMS).** MONEY, TYLER CONFIRMS. Decided part: everything in the layer is open to every account. Recommended to you for Premium: arena tickets bank to 30. Not recommended: timed buffs lasting a quarter longer.
- **Reason.** Banking more tickets fits what Premium already is, which is fewer visits. Longer buffs is power on a subscription, it makes a 7 day buff last 8.75 days so the weekly beat stops lining up, and it makes the buff line on the hero sheet harder to read.
- **Evidence.** Design reasoning only. No evidence on what Premium buyers value in the layer. Your call.
- **Replaces.** Nothing.
- **Depends.** Economy decider owns Premium's full list and price (chapter 04 section 2.9). MM-15.

### MM-22. The gold that hero slots took goes to the castle and to boss and arena upgrade materials first.

- **Decision (recommended).** Yes as a direction. The castle share and stages, and the boss and arena materials bought from other players, are the first homes for that gold. The sizes are the economy decider's.
- **Reason.** About 5.5M of sink went away with the slot prices. The castle never ends and scales with the roster, and boss materials move gold between players, so those are the right first places.
- **Evidence.** COMPUTED from the old slot ladder (about 5.5M of 5.9M, 60 GR-2). No measurement behind the new sizes.
- **Replaces.** Nothing.
- **Depends.** ECONOMY DECIDER owns GR-8 and the six homes of chapter 04 section 2.6. MM-9.

### MM-23. Approve the order of study 49 section 6.1 as the order for planning.

- **Decision (recommended).** Yes, with the presence strip moved to the front. Order: the presence strip and chat, the calendar, clan roster with chat and browser, the two thirds line with the modifier table, the engine check, the world boss, the castle, the Crowns book, the Even Arena, the Open Arena, the clan board.
- **Reason.** The strip and chat are what make minute five feel like an MMO and they are the cheapest things on the list. The board is last because it needs bosses, arenas and clans to exist first.
- **Evidence.** An order only. Nothing builds until the build plan exists (RULED 2026-11-21).
- **Replaces.** Nothing.
- **Depends.** The build plan. MM-41 can run now as a measurement.

### MM-27. Boss and arena gear trades like all gear.

- **Decision (recommended).** Yes. Boss pieces, arena pieces and both materials trade on the market like any gear.
- **Reason.** No bound gear is already your rule. Tradeable chase gear is what gives the market something to price and gives people a reason to buy gold with Crowns.
- **Evidence.** RULED 2026-10-23 (no bound gear) and 2026-11-21 (buffs and gear drive Crowns).
- **Replaces.** Nothing.
- **Depends.** Economy decider (the market and the Crowns book). Items decider.

### MM-43. For the playtest only, every account gets the same weekly allowance of test Crowns through one server switch.

- **Decision (recommended, TYLER CONFIRMS).** THIS IS A GRANT. TYLER CONFIRMS. I do not decide it. Recommended: yes, for the wiped Discord playtest only, the same amount for every account, one server switch that is off by default and removed before Early Access, every grant journalled.
- **Reason.** Without it the whole Crowns for gold loop cannot be tried before real money exists. It is equal for everyone and it is wiped. It is still granting currency, which is your line and not mine.
- **Evidence.** No evidence either way. The Crowns rows of the playtest table cannot be read without it (chapter 09 item 12).
- **Replaces.** Touches CLAUDE.md section 2 (player state is never fabricated) and the rule that Crowns are never earned in play. Needs your explicit yes.
- **Depends.** Economy decider sizes the amount (I suggest about what one 7 day boost costs each week). Security review of the switch.

### MM-44. A standing clan gift (was N6-1).

- **Decision (recommended).** Yes. A member sets "give my share each Monday" once. The server takes it from the purse each week until it is turned off or the purse cannot pay, and the return card says so.
- **Reason.** Giving the same gift by hand every Monday is a decision I already made. The game should remember it.
- **Evidence.** The first principle (RULED 2026-10-18).
- **Replaces.** Nothing.
- **Depends.** MM-8. A recurring server-side spend is a money surface for the Security review. Chapter 08 return card.

### MM-45. Spending banked arena tickets (was N6-2).

- **Decision (recommended).** Yes. One press spends any number of banked tickets with a remembered pick rule, closest rating or highest rating offered. Picking by hand stays.
- **Reason.** Twenty banked tickets must not be twenty identical presses.
- **Evidence.** The first principle (RULED 2026-10-18).
- **Replaces.** Nothing.
- **Depends.** MM-15, MM-16.

### MM-46. Capture the flag and the arenas (was N6-3).

- **Decision (recommended).** One system. Capture the flag is a later rule set on the same two arenas, with no death and low XP as you described it on 2026-11-14. Hidden until both sides can be filled.
- **Reason.** It is the same engine question as the arenas, so it should not be a third thing to build.
- **Evidence.** RULED 2026-11-14 (backlog) and 2026-11-21 (nothing planned is cut).
- **Replaces.** Nothing.
- **Depends.** MM-41. GR-71 (sides).

### MM-47. Friends (was N6-4).

- **Decision (recommended).** A friend is an account, shown by its heroes' names. One request links both accounts and all four heroes on each side see the friend.
- **Reason.** Asking four times to add one person is the same decision four times.
- **Evidence.** The first principle. RULED 25-7 uses the same per-account shape for clans.
- **Replaces.** Nothing.
- **Depends.** GR-72, MM-20 (friends sort first).

### MM-48. The clan's own shared hunt (was N6-5).

- **Decision (recommended).** When it is built, each party of four fights in its own room and both come off one clan pool, the same form as the world boss. Never eight heroes in one fight. Kept for later and hidden.
- **Reason.** One engine runs a party of four. Two rooms on one pool gives a clan its shared hunt without a second engine.
- **Evidence.** RULED: one combat engine and one party of four (CLAUDE.md section 6, 25-11).
- **Replaces.** REVERSAL, small. The second half of 25-11 ("two parties of four in one hall") becomes two rooms on one clan pool.
- **Depends.** MM-2, MM-5.

### GR-79. One table, the Path, says when every system opens, and the first hour teaches four heroes.

- **Decision (recommended).** Yes, the Path and chapter 08's first hour: one hero alone to Level 5 in the Mill Cellar (about minute 17), then three more heroes made in one flow, who run the Cellar together while the first hunts Meadowbrook Thicket, then all four enter the Millrace Sewer at about minute 36 on one Start. My additions. (1) The doors chapter 08 left open: chat and the presence strip from the start. Clans can be joined from the first day. The calendar banner shows after the first stamina end. The world boss opens at Level 13 for each hero sent. The Even Arena at Level 20. The Open Arena at Level 30. The clan board when you are in a clan. Factions at the first Krell kill as ruled. (2) If the core decider's check C3 fails, the four's first hunt together is Meadowbrook Thicket and the Sewer card moves to the Level where C3 passes. That is a data row, never tutorial math. (3) Chapter 06's minute 5 picture is corrected to one hero, with Global chat open and the strip on the Cellar card.
- **Reason.** Four name screens before a single kill would lose people, and four bars at once teaches nothing. One hero for 17 minutes teaches the loop, and then "you have three more" is the best surprise of the first hour. The MMO doors are spread out so every few Levels names a new thing and Level 10 is not a pile.
- **Evidence.** PLAYED twice for minutes 0 to 17 as a one-hero opening (chapter 08 section 2.1). From minute 17 it is designed and unplayed. My walk-through re-check against src/data on this branch is in the md mirror. HYPOTHESIS for the doors (TARGET Levels). Overturned by check C3, by the blind first hour (playtest 12) and by playtest 1.
- **Replaces.** Nothing.
- **Depends.** CORE DECIDER: step 13 stands on check C3 (a start-kit four holds the Sewer on Normal at Level 5, Rat King room included, no death in 4 seeds of 8 hours). Also C1 and C2. Items decider fills Path rows for Levels 17 to 29. Economy decider: the account's 500 gold granted once (GR-8). MM-4 and MM-14 numbers must exist before the boss and arena doors are final.

### GR-24. The player picks starting weapons at creation (shared with combat, my input).

- **Decision (recommended).** Input for the core decider: yes. The player picks how each hero fights when the hero is made, from the six starter set rows, with no card preselected on the first hero. Each card carries one honest measured tag, "Good alone" or "Best in a party. Slow alone." Heroes two to four mark the card the party lacks, shield first, then healer. The pick only sets what is in hand. Every hero still owns the whole practice kit.
- **Reason.** It is the first choice a player ever makes, so the screen should not make it for them. The first 17 minutes are alone, so a sword and shield hero has to be told it is slow alone before the pick and not after.
- **Evidence.** RULED: classless (2026-10-14), the practice kit (2026-10-20), the tank is slow alone (2026-11-19). Six STARTER_SETS rows checked in src/data/start-kit.js. The tags are unmeasured until check C1.
- **Replaces.** Nothing.
- **Depends.** CORE DECIDER owns GR-24. Check C1: each way reaches Level 5 in 15 to 20 minutes alone or carries the slow tag.

### GR-80. One Start, one plan and one return card for an account's four heroes, and a job queue.

- **Decision (recommended).** Yes, all of it. One plan for each hero shown as one card for the account, any line set once and applied to all four. Carry on is one press for the account. Own heroes form a party with no invite. One return card with at most three things that need a decision. A rest plan of up to three job steps that never loops and ends in "wait in town" or "hunt again, once". A starting loot plan and a starting rest plan so a new player edits and never builds. None of this is ever Premium.
- **Reason.** Starting and stopping four heroes one at a time is the same decision four times, twice a day, forever. This is the feature that makes four heroes a party and not four chores.
- **Evidence.** RULED 27-1 (Carry on) and the first principle. TARGET: a visit under 4 minutes and zero repeated-decision presses (standards X9, X10). Chapter 09 counts about 20 presses a day in place of 100, COMPUTED.
- **Replaces.** Nothing.
- **Depends.** Systems engineer: one Start is one intent the server expands through the same checks. GR-1 (town work in closed form). GR-48, GR-57, GR-58 in other areas.

### GR-78. Tamsin's task for a ground is taken when a hero enters it.

- **Decision (recommended).** Yes. Taken on entry with no press. The pay is collected on the end card or by Carry on.
- **Reason.** Nobody decides whether to take a free task, so making me press for it is a press with no decision in it.
- **Evidence.** EVIDENCE: 3,251 wolves were killed that she would have paid for (60 GR-78). Task rows checked in src/data/tally-tasks.js.
- **Replaces.** Nothing.
- **Depends.** GR-80.

### GR-81. A hero may move to the next ground when it outgrows this one, if you chose that.

- **Decision (alternative).** No. Keep 27-1 whole: no hunt ever starts by itself. When a ground is outgrown the hero goes to its rest plan and works in town. The return card puts "outgrown, go to the next ground" first under Needs you, as one press for the whole party.
- **Reason.** It is a small win that breaks a clean rule. Only one ground in the game ends itself at a Level today, and the first hour already walks me through that moment by hand. With the job queue an outgrown hero is working in town, not standing around. And a party starting a new ground by itself while I am away is when deaths are most likely.
- **Evidence.** EVIDENCE: endsAtLevel appears on one ground in src/data/hunt-grounds.js (the Mill Cellar, Level 5). RULED 27-1 (2026-11-20). HYPOTHESIS that the lost hours are small. Read from the journal: hunted hours lost between an outgrown end and the next Start, under Level 16. If it is over an hour a day for new accounts, bring it back.
- **Replaces.** None. 27-1 stands. The re-open is refused.
- **Depends.** GR-80 (the rest plan and the return card). Chapter 08 section 2.2 drops the "next ground when outgrown" line.

### GR-83. No dailies.

- **Decision (recommended).** Decided at MM-11: no daily quests, no login calendar, no season pass.
- **Reason.** Same reason as MM-11. Four heroes turn a daily into four chores.
- **Evidence.** See MM-11.
- **Replaces.** Nothing.
- **Depends.** MM-11.

### GR-84. The Premium claim needs no press, setups are one idea, and a Week card.

- **Decision (recommended).** Yes to all three. The Premium daily item lands in Storage on the first visit of the day with no press and the streak never resets. Setups, action sets and presets become one noun, Setup, remembered for each ground. A Week card on the first return after the weekly turn compares this week with your last and pays nothing, ever.
- **Reason.** A claim button is a press with no decision. Three names for one idea is just confusing. The Week card is a mirror that gives me a reason to look on Monday without turning into a chore.
- **Evidence.** RULED 2026-10-17 (streaks never reset). HYPOTHESIS on the Week card. Playtest read: accounts whose first press of a week falls within a day of the turn.
- **Replaces.** Nothing.
- **Depends.** How many Premium items a day (one an account or one a hero) is your money call with the economy decider and is not decided here. GR-48, GR-56a.

