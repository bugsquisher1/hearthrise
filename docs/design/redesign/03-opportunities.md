# 03. Missing design opportunities

Written 2026-11-21 on `lane/rd-vision`. Docs only. This is deliverable 5 of the reset request of 2026-11-21: mechanics and possibilities that neither the game nor the existing overhaul has explored enough. Read `01-identity.md` and `02-architecture.md` first. Nothing here is final.

**Labels.** EVIDENCE, MEASURED, JUDGMENT, SPECULATIVE and HISTORICAL, as in `01-identity.md`. Value and cost are JUDGMENT unless a line says otherwise. Cost sizes are S, M, L and XL as in `02-architecture.md`.

**How it is ranked.** By player value against cost. Value is judged over the first 20 hours and on, not the first hour. An idea that removes a measured problem ranks above one that adds something new.

## 1. The ranking

| # | Opportunity | Value | Cost | Where it lives | Explored before? |
|---|---|---|---|---|---|
| 1 | The report as coach | Very high | S to M | Package 9 | Partly. The overhaul has a report with a risk reading (GR-66). It does not say why a hunt ended |
| 2 | The party climbs by itself inside a stance | Very high | L | Package 3 | No. Every older design has the player pick a tier |
| 3 | Traits as rules, with carry-over | Very high | XL | Package 2 | Partly. Special attributes were one extra stat on some pieces, and crafted jewelry already rolls from a pool of 23 perks |
| 4 | Plans and bars you can copy and share | High | S to M | Packages 7 and 9 | No |
| 5 | Monsters that wind up, and bars that answer | High | L | Packages 1 and 3 | Partly. 18 monster spell rows wind up and one bar condition sees it. Not yet the main test of a bar, and not on bosses |
| 6 | Trades owned by the company | High | L | Package 5 | No |
| 7 | The drop moment | High | M | Package 2 | Partly. A starter alert was planned |
| 7b | The flame as Luck (the owner's idea, under evaluation) | High | M | Section 2b | No. Luck was a bar that filled with hours, and the hearth skill set regeneration |
| 8 | The hire board as the party finder | High | L | Packages 4 and 7 | Yes. On-call heroes are designed (chapter 11). The board as the social front door is new |
| 9 | Levels or gold as a standing choice | High | S | Package 5 | No. Profit was left for players to find |
| 10 | Events as ground rules | Medium | S to M | Package 7 | Partly. XP weekends only |
| 11 | Buy orders on the market | Medium | M | Package 5 | Yes, as standing orders that wait |
| 12 | Rows and who stands where | Medium | M | Package 4 | Named in the overhaul's first line, never designed |
| 13 | Mentor hunts | Medium | M | Package 4 | Yes, as scaled early hunts |
| 14 | Game modes | Medium to high | M to L, after launch | Package 6 | Yes, planned since 2026-08-18 |
| 15 | Long expeditions | Medium | M | Package 3 | No |
| 16 | Company against company by bar: the two arenas | High | L for the engine seam, L for the arenas | Package 7, section 7b | Yes, as two arenas. They stay in the design. The automated duel against a saved plan is the new part |
| 17 | A world that remembers | Medium | L | Package 7 | No |

## 2. Each one, in short

**1. The report as coach.** Every hunt ends with why it ended and the one change most likely to help. "Fell back at Danger 23. Your healer ran out of mana four times. A better drink or one more heal on the bar would hold it." This is the cheapest thing on the list and it turns every hunt into a lesson. It also fills the largest gap in what can be measured: nothing reads healing against incoming damage, healing by source, or why a hunt ended (EVIDENCE: `docs/design/balance-baseline/03-targets.md` section 0, SUST-1 to SUST-4). The same counters serve the player and the simulator. Risk: advice that is wrong is worse than none, so it must read real counters and say less when unsure.

**2. The party climbs by itself inside a stance.** The player picks how much risk to take, not a difficulty. The party finds the deepest step it can hold. This removes a decision players repeat every few Levels, makes every bit of power show, and turns the cliff into a slope. It is the center of package 3. (MEASURED problem: a planted +100% damage moved a four's easy-tier pace 0.8 to 8.7%, `review/10-designer-d9-halls.md` row FB-3.) Risk: if Bold is always best when left alone, the stance is a fake choice. The simulator can check that before anything is built.

**3. Traits as rules, with carry-over.** The owner's confirmed requirement of 2026-11-21. A rare drop carries a rule that changes what a hero is good at, and a crafter can move that rule to a new piece by burning the old one. Package 2 has the design and the five shapes weighed. What makes it an opportunity beyond gear: it gives the market single pieces worth arguing over, gives a profession a job that never ends, and gives old grounds a reason to be hunted for their Trait pool. Risk: text load and one dominant Trait. Start with five on one ground.

**4. Plans and bars you can copy and share.** The first principle says every choice is copyable. Take it past the account. A plan or a bar exports as a short code. A ladder entry shows the bars that set it. A clan mate can hand a new player a working healer bar. New players get a way in, experts get an audience, and the community does our teaching for us. (JUDGMENT. EVIDENCE for the need: in the played hour the slowest moments were setting up each hero by hand, `02-four-hero-hour.md`.) Risk: everyone runs the same bar. Gear with Traits is what keeps two companies different.

**5. Monsters that wind up, and bars that answer.** A dangerous blow shows for a moment before it lands, and a bar condition can see it. Guard it, stagger it, or hold a heal for it. This is how an automated fight can have skill in it, and it is what makes a boss a test of the bar and not of the clock. (EVIDENCE for the problem: GR-30's verdict that a health-only hall rewards the party it should punish.) Risk: engine cost at the 100 ms step, and conditions that get too hard to write. Three wind-up kinds are enough to start.

**6. Trades owned by the company.** Real heroes spent more hours in town than hunting (EVIDENCE: 1.57 to 1, `calibration/c4.json`). With four heroes that is every trade leveled four times. One Level in each trade for the company keeps the hours and removes the copies. It also makes "which trades do we work this week" a company choice, which is a real one. Risk: it shortens the grind by up to four times, so the 99 curve must be re-set on purpose.

**7. The drop moment.** Low rates are only half of a rare drop. The other half is being seen. A reveal on the return card, a line in the town, a mark on the hall wall, a card to share outside the game. The square's fire already changes color for a named fuel (EVIDENCE: `docs/SYSTEMS_MAP.md`, the Great Hearth), and that could mark a Signature drop for everyone in town. (HISTORICAL: asked for on 2026-08-18. Never built past an alert.)

**7b. The flame as Luck.** The owner's idea of 2026-11-21, under evaluation. Inner Flame becomes Luck. The company feeds one flame with bones and other remains, and a taller flame raises the chance and rank of rare drops. It ranks beside the drop moment because it is the same job seen from the other side: the moment is what a drop looks like, and the flame is what the player did to earn it. Most of it is built, since fuels, the burn call and the colored fire exist. It gives remains a use, the hearth a system and a drop chaser a lever. Risk: a flame that is always worth keeping full is upkeep, not a choice. `02-architecture.md` section 2b has the eight fields.

**8. The hire board as the party finder.** In an idle game few players are free at the same minute, so live grouping fails. Hiring a resting hero is grouping across time. A board in town that lists heroes for hire by job and Level is the social front door: it is how a new player meets a clan, and how a strong player helps without being online. The on-call design exists. What is missing is treating it as the main way players play together. Risk: second accounts farming hire cuts. The cut and the daily limit are the levers.

**9. Levels or gold as a standing choice.** If the best gold per hour and the best XP per hour sit at different depths and with different supplies, the player has a real choice every night with no new system. It only needs prices set that way on purpose. (EVIDENCE that it is missing: best runes paid for themselves, so there was no choice, playtest of 2026-11-16.)

**10. Events as ground rules.** A weekly row in the rule table on one ground: more Shooters this week, Casters hit wider, a Trait pool visits from another region. Old grounds become new for a week, at the cost of one data row. Risk: an event that makes one ground the only right answer for a week.

**11. Buy orders on the market.** "I pay this much for 200 of that." A crafter can post what they need and go to sleep. It fits a game where nobody is online together, and it gives monster parts a visible price that tells hunters where to go.

**12. Rows and who stands where.** Front and back as a set choice gives armor on a back-row hero a reason and gives Stalkers and Shooters something to threaten. It is small, and it makes the party-wide damage in package 3 readable.

**13. Mentor hunts.** A high hero joins a low friend's hunt and fights at the friend's step. The friend learns, the mentor earns something that is not combat power. It is a social glue and a new-player aid. Risk: it becomes a carry service. Scaling the mentor down is the guard.

**14. Game modes.** Ironman and Hardcore are server flags on an account, and a server-owned economy is what makes them real. They give experts a reason to start again and give the game a second audience. After launch, as planned.

**15. Long expeditions.** A multi-day hunt with one load of supplies and no restock. The puzzle is what to carry. It is a new use of the same grounds for players who can only check in every few days. (SPECULATIVE. It needs the hunting-day rule to bend, so it waits on package 9's numbers.)

**16. Company against company by bar: the two arenas.** The owner confirmed on 2026-11-21 that the arenas stay in the design. Two plans fight with no hands on either, against another company's saved plan, so nobody has to be online. It is a pure test of builds, and little else in the genre has it. Heroes cannot fight heroes in the engine yet: sides are fixed in 93 places across 22 modules (MEASURED: `tools/balance-program/engine-checks.mjs --mm41`). So the seam goes into the first engine batch and the arenas ship on it later. It ranks low only because it ships late, not because it is in doubt. Open: whether moves built to beat monsters make a good fight between heroes. `02-architecture.md` section 7b has the plan.

**17. A world that remembers.** Shared goals that change the town: a bridge the shard builds, a region that opens when enough companies have held its door. It makes "shared live world" literal. (SPECULATIVE. It is large, and it should wait until towns are seen to hold players.)

## 3. What is not on the list, and why

- **More systems.** No new currency, no new skill, no pets in combat, no tree of stat lines. The redesign removes layers, and none of these passes the purpose test in `01-identity.md` section 7. (JUDGMENT)
- **Reroll and gamble benches.** They are a strong gold sink and they make every Trait a slot machine with one answer. Carry-over is the sink that keeps the decision. (JUDGMENT)
- **Paid speed or power.** Real-money calls are the owner's and are not designed here.

## 4. What to try first

Three cheap probes would tell us the most. Each is a simulator run or a paper sample, not a build. (JUDGMENT)

1. **The climb on one ground.** Steps in place of three tiers on one ground in the simulator, with three stances. Does a four settle at a step? Does +10% damage move the step? Does Bold beat Steady when left alone?
2. **Five Traits on one ground.** Written as rule rows, run on four seats. Is any one the top pick everywhere?
3. **One report, by hand.** Take one real hunt's counters and write the report a player would see. Is the cause clear from what the server already knows?
