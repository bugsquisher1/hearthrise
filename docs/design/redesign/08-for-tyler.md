# 08. Read this first

2026-11-21, `lane/rd-vision`. This is the cover for the redesign folder. Nothing in it is final, and nothing has been built. You asked what we would design if we started today. This is the short answer, and what we need from you.

## The game in one paragraph

You lead a small company of heroes in a shared pixel world. You don't swing the sword. You decide who is in the company, how each hero fights, what they wear and carry, where they go and how much risk they take. The server plays the hunt whether you watch or sleep, and it comes back with a clear answer: how deep your plan held, what broke first, and what dropped. You fix the weak spot and push deeper. Now and then a drop lands that changes how a hero plays. Around you a town full of players does the same, and you trade, hire, group and compete with them.

## What stays, what changes, what goes

| Stays | Changes | Goes |
|---|---|---|
| Hunts that run on the server while you're away | Three tiers become one Danger scale. The party climbs it by itself and falls back before it dies | Small percent bonuses from ten places that nobody can feel |
| A company of up to four heroes | Monsters reach the whole party, so every seat matters | A party that is really one health bar |
| No classes. Skills train by use. Level never ends | Gear rolls rules, not just bigger numbers | Bosses decided by a clock |
| The action bar with conditions | Gold and loot grow with depth the way XP does | The separate roll to hit |
| Drops with a home, and rare drops that are rare | Talents become move evolutions, a point every Level | Talent stat lines |
| Towns, chat, trade, clans, arenas, the castle | Luck becomes the Inner Flame, fed with what you kill | Luck as a bar that fills with hours |

## The nine directions

Each one needs a go, a change or a no. `02-architecture.md` has the full case for each.

| # | Direction | The biggest departure |
|---|---|---|
| 1 | Combat. Each weapon has a job, the bar is the build, moves evolve | No roll to hit. Monster wind-ups become the main test of a bar |
| 2 | Gear. Plain is the floor, a Rare rolls a rule, a Signature changes a move | Rolled gear, and single pieces on the market |
| 3 | Hunting. One Danger scale, climbed by the party inside a risk setting | You pick a risk, not a difficulty. This is the center, and it is untested |
| 4 | Party. Two rows, personal loot, one pay rule, hired heroes | No party XP table. A four earns more because it holds deeper |
| 5 | Economy and crafting. Professions make what hunting burns | The store sells only the basics. The full crafting redesign is in progress in `09-crafting.md` |
| 6 | Long game. A Level is one unit of power forever. Depth has no top | One unit for Levels, gear, monsters and prices |
| 7 | Social and endgame. Hire board, clans, halls, world boss, Tower, arenas, castle | Arenas and the castle stay in and ship later. The engine is made ready for them first |
| 8 | First hour. One hero, hunting in two minutes, the party at Level 5 in one press | The three empty slots are not on the first screen |
| 9 | Away and return. One plan, one Start, one return card, a report that says why | Saving a setup is free |

## Your calls today, and where each landed

| Your call | Where it is |
|---|---|
| Randomness on gear, and rare drops that are a moment | Package 2. Traits are rolled rules. Signatures change a move |
| Luck as the Inner Flame, fed by burning remains | Section 2b. Recommended, with one question for you below |
| Talents as spell evolutions, and something to choose every Level | Section 1b. A point every Level, branch picks at rank marks, a final form at Level 200 |
| Keep the arenas and the full castle | Section 7b. In the design, budgets set aside now, built in the last wave |
| The best of Tibia, Path of Exile and Diablo | Section 2c. Mechanics only. Sets, rerolls and a passive web are cut, with reasons |
| A skilling and crafting model in the spirit of OSRS, made our own | Package 5, as the direction. Formulas follow from the study |
| Your set of six professions | Package 5, with what burns each one. Two renames are proposed |
| The full crafting redesign | In progress, its own lane, `09-crafting.md` |

## Seven questions that are yours

No lane has settled these. The lean is the designer's, and you can ignore it.

| # | The question | Options and what each costs | Lean |
|---|---|---|---|
| 1 | Can gold buy luck? | **a.** Only remains from your own hunts burn. Luck is hunted. **b.** Bought remains burn too. A bigger sink, and Crowns sold for gold reach drop luck | a |
| 2 | A cap on hunted hours a day? | **a.** Keep a hunting day. Professions get their time, and it is tied to what Premium sells. **b.** No cap. Purer idle, hunting crowds out crafting, every time number changes | Yours |
| 3 | Should most players almost never die? | **a.** The two safer risk settings fall back and don't die. The cliff goes, and so does some bite and Blessing gold. **b.** Death on every setting. The tone holds, the cliff is harder to remove | a |
| 4 | Is this what "every Level" meant? | **a.** A point every Level that deepens a move, a big branch pick every few Levels. Runs forever. **b.** A big pick every Level. Can't be written for hundreds of Levels. **c.** Bigger picks every five | a |
| 5 | The build aimed at the end of December? | **a.** Pause the number lanes, keep what is true under any design, run the climb test first. No new date until it reads. **b.** Ship it, then redesign. Numbers get built twice. **c.** Ship only the first hour, the plan, the report and chat in December | a or c |
| 6 | Four heroes on the first screen, or at Level 5? | **a.** One hero, then three recruits in one press at Level 5, near the first hero's Level. That is a grant. **b.** Four slots on the first screen, as you ruled this morning. The played hour showed it turns into work | a |
| 7 | Does a lone hero need its own target? | **a.** Slower and fair, no number set. **b.** A floor, a share of what a seat in a four earns. One more thing to balance | a |

## What is proven, measured and unplayed

- **Measured on the real engine.** The problems this redesign answers. A four's pace is capped by the respawn. The harder tiers are a cliff. One front hero takes nearly all the damage. Armor did nothing past Level 30. A health-only boss is a clock. Stat-line Talents moved pace about 2%.
- **Seen in play.** One first hour played by hand, and reports from a handful of playtesters. Real heroes spent more hours in town than hunting.
- **Not measured, not played.** Everything new. The climb, the risk setting, Traits, evolutions, the flame, the pay rule and every number in these files. No one has played a minute of this design.
- **The one test everything hangs on.** Does a party settle at a Danger step and fall back before it wipes? If not, four of the nine directions get re-thought and the existing tier table is the fallback.

## After you approve

1. You answer the nine directions and the seven questions.
2. The climb test runs in the simulator, first and alone.
3. Targets are written from what you approved, as experiences you can read, and you see them.
4. The rest is tested and tuned together on the one engine, in the Balance Lab (`07-balance-lab.md`).
5. You see the results and a build plan with dates before anything is built.
