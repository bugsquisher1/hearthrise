# The four-hero first hour, played by hand

**PLAYED** 2026-11-21 on `lane/d-critical-review-main`. This is step 3 of the critical review (`00-critical-review.md`, section 8). Docs only.

**The build.** Client and engine of v0.2.143 as they stand on `set/v0.2.144` at 730ff5ac1, served by `tools/qa/local-world.mjs` (the real `play.html`, the real engine, the replayed migration chain, in memory). A brand-new account made from the sign-in screen. Nothing touched production or a real account.

**The one change made to play it.** Four heroes from the start is not built. In the local replay database only, one statement made the three priced hero slots free starter slots (`update hr_hero_slots set starter = true, cost_gold = 0`). The account then showed four empty slots on its first screen.

**How it was played.** I drove a real browser and learned only from the screen: page text, hover labels, and screenshots where layout mattered. Waiting was skipped with the tool's time skip, which fakes no result. The clock below is the game clock for hunts plus my estimate of a new player's time in menus. It is one play, one account, one company. Every reading below is thin.

**Things that were not the target game.** A +25% Level XP weekend was running. Every hero had the 12 hour stamina bar. There is no weapon pick at creation, no one Start, no company plan, no rest plan and no pre-filled company. Those are what this play is for.

## 1. Timeline

| Minute | What I did | What the screen did | Note |
|---|---|---|---|
| 0 | Signed in | "Characters. Heroes at once: up to 4." Four empty slots, four "Create hero" buttons | Clear. Nothing says why four, or that one is enough to start |
| 0 to 1 | Created Brenna | Name, four color rows, and "No classes, nothing to pick. Every weapon below is yours" | No way to choose how the hero fights. Every hero starts as sword and shield |
| 1 | Landed in town | A tip: "Open Tamsin's tally. Take Giant Rats" | **Tamsin's board was hidden under the Chat window.** No icon is named Tamsin or tally. I closed Chat and found her by luck |
| 2 | Took Giant Rats. Pressed the Mill Cellar link, then Enter | Hunting | Good. Hunting inside about two minutes, as the design wants |
| 5 | Pressed "Character list" to make hero two | Back to the first screen. Brenna shows "Level 2, hunting in Mill Cellar" | Good. The hunt keeps going |
| 6 | Created Odo | Landed in town. **The same Tamsin tip started again** | Every hero repeats the tutorial from its first line |
| 6 to 9 | Tried to make Odo a healer | Opened Inventory. A row of small weapon icons with no names printed on them. I clicked icons until one said "Practice Staff. Equip". I did not confirm whether a hover shows a name | The slowest moment of the hour. The bar then re-fitted itself for a staff, which is good |
| 9 | Tried to put Odo in a party with Brenna | Social is a menu, not a window. Party asks me to "Type a name". I typed my own hero's name. "Member still hunting" | A player has to type the name of their own hero. A hunting hero cannot be invited |
| 10 | Sent Odo to the Mill Cellar alone | Hunting | The Hunts page says nothing about my other heroes |
| 11 to 16 | Created Wren (bow) and Mab (wand), equipped each, sent each to the Cellar | Four heroes hunting in four separate hunts | About 12 presses a hero. Mab kept the starting shield in her off hand beside the wand. Nothing equipped the spellbook |
| 17 | Brenna reached Level 5 | "Brenna's hunt in Mill Cellar has ended. Start again" | "Start again" is offered on a ground she has outgrown |
| 28 | The other three reached Level 5 | Three more notices stacked on the left, each with "Start again". Tamsin paid Brenna a Bronze Helm | Mab's summary: Level 1 to 5 in 16 minutes, and **gold −105**. 146 in coins, 251 on runes and drinks |
| 29 | Read "Parties. Invite: right-click a player or a character tab" on the All characters screen | Right-clicked each hero's tab, pressed "Invite to party" three times | Each joined at once with no accept. Good. Finding the right-click took reading a small line on one screen |
| 30 | Opened the Sewer's card | "Low risk". Further down: "The Rat King: Level 25 vs your lowest Level 5 (expect to lose)" | Two opposite signals on one card. The card also offers Normal, Dangerous and Deadly with no word on which a new party should take |
| 31 | Pressed "Enter with party" | All four in the Sewer. Mab, the mage, is the leader because she was on screen when I invited | Nothing said a leader matters or who should lead |
| 31 to 51 | Watched | Level 6 after 20 minutes. 109 kills. No deaths. About 36,000 Level XP an hour a hero | The party works. The party panel is readable. This is the best 20 minutes of the hour |
| 55 | Closed the page | No "safe to close" line, no time to come back | The idle promise is not said |
| 8 hours later | Came back | "While you were away. Away 8 h 1 min." One block for each hero, four in a column, each with "See the hunt" | All four Level 5 to 13. 3,132 kills. About 58,000 gold. No deaths. Still hunting with 3.5 hours of stamina left |
| After | Opened Brenna's bag | "Upgrade: Bronze Helm, Bronze Platebody and 1 more piece. Equip upgrades. Leave the hunt to put these on." | **The tank fought nine hours wearing no armor at all.** Her reward helm from minute 17 was never put on. The return card did not mention gear |

## 2. Quit points

Where a new player with four heroes is most likely to stop. JUDGMENT, from one play.

1. **Minute 1. The first tip points at something hidden.** The Chat window opens over Tamsin's board. A player who cannot find the first thing the game asks for may leave in the first minute. This is not a four-hero problem. It is the first screen.
2. **Minutes 6 to 9. Making the second hero something other than a sword and shield.** Unnamed icons, no weapon pick, no word that the bag is where a hero's role is set. This is where four heroes turns from a gift into work.
3. **Minutes 11 to 16. Doing it all again, twice.** Create, find the weapon, equip, open Hunts, pick, Enter. The same tips restart for each hero. It is the repeated decision the first principle forbids, three times in the first quarter hour.
4. **Minute 9 and minute 29. Forming a party of your own heroes.** Type your own hero's name, or find a right-click on a tab. A hunting hero cannot be invited, and the refusal does not say what to do next.
5. **The first return.** Nothing tells the player that a pile of gear is waiting, that the tank is unarmored, or what to do next for the company. The card is four copies of one hero's card.

## 3. What worked, and should be kept

- Hunting inside two minutes.
- A hero keeps hunting while the player makes the next one.
- The bar re-fits itself when the weapon changes.
- Own heroes join a party at once with no accept.
- The Sewer on Normal holds a new four of shield, staff, bow and wand. PLAYED: 0 deaths in about 9 hours, 36 hero-hours. This agrees with the simulator's reading in the book. It is one company on one seed of luck.
- "While you were away" exists, is clear for one hero, and shows coins and supplies apart.

## 4. What the designed first hour must fix

Checked against chapter 08 (GR-79, GR-80, GR-24).

| The design says | What I met | Verdict |
|---|---|---|
| The player picks how each hero fights at creation (GR-24) | No pick. Three minutes lost in the bag | Needed. Build it first |
| Heroes two to four come pre-filled as shield, staff and bow, one press | Three full creations, about 12 presses each | Needed |
| One Start begins the three recruits' lone Cellar hunts (GR-80) | Three separate trips through Hunts | Needed. The lone Cellar hunts themselves work today |
| Tamsin's task is taken on entry (GR-78) | The tip restarts for each hero and points at a hidden board | Needed. It also removes quit point 1 |
| The Cellar ends itself at Level 5 with "Raise your company" | It ends itself. The notice says "Start again" | The end works. The words are wrong for an outgrown ground |
| Own heroes form a party with no invite (GR-80) | Instant join works. Finding the invite does not | Half built. The join is there, the door is not |
| "Equip upgrades for all four" as one press, on the end card and the return card | The press exists in each hero's bag, one hero at a time, and only in town | Needed. Without it a tank hunts naked overnight |
| One return card for the account, with at most three things that need a decision | Four hero cards in a column, no totals, no "needs you" | Needed |
| "It is safe to close the game. Come back in about 8 hours" | Not said | Needed. One line |
| The first rest plan (fish, cook, mine, chop) | Heroes wait in town. The only offers are yard training | Not built. Not tested here |

**Three things the design does not yet cover.** Each came from the play.

1. **Who leads.** The party leader is whoever was on screen. In the design the plan names the leader. It should default to the shield, and the screen should say why.
2. **Wearing gear during a hunt.** "Leave the hunt to put these on" means an away company never improves. With four heroes on a 12 hour bar that is most of the day. Either "equip upgrades" runs at the next safe moment in a hunt, or the return card must make stopping to dress worth one press.
3. **The mage's first hunt loses gold.** Mab ended her first 16 minutes 105 gold down while the others were up. Chapter 08 gives the account 500 gold, so it is survivable. A new player who picked a wand first will read it as a mistake. The design's "Good first hero" mark on the hammer helps. The wand card should say what it costs.

## 5. Top five fixes, by first-hour value

1. **Never hide the first objective.** Chat must not open over Tamsin's board, and the first task takes itself on entry. Smallest fix, biggest risk removed.
2. **A weapon pick at creation, and a pre-filled company in one press.** It removes minutes 6 to 16 as work.
3. **One Start for the account, with own heroes partied by the plan.** It removes the typed name, the right-click and the "Member still hunting" dead end.
4. **Gear that gets worn.** One "Equip upgrades for all four" press on the end card and the return card, and a rule for upgrades found mid-hunt.
5. **One return card for the account.** Totals first, then what needs a decision, then Carry on. Say "safe to close" before the first leave.

## 6. What this play does not show

- It is one play by a reviewer who has read the design. A stranger will be slower and will miss more.
- Minutes are estimates. Hunt time is exact, menu time is not.
- The XP weekend and the 12 hour bar both made this hour kinder than the target free game.
- The rest plan, the farm, the first home and the market were not reached.
- No hero died, so the death popup and Blessings were not met.
- Screenshots were taken and are not committed.
