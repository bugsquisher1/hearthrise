# 08. Read this first

2026-11-21, `lane/rd-vision`, with your answers folded in on 2026-11-22. This is the cover for the redesign folder. You said go to all of it and answered every question. Nothing is built yet, and every number is still a starting value for the Balance Lab.

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
| Towns, chat, trade, clans, arenas, the castle | Luck becomes the Inner Flame, fed with remains | Luck as a bar that fills with hours |

## The ten directions: all Go

`02-architecture.md` has the full case for each, and `09-crafting.md` has the tenth.

| # | Direction | The biggest departure | Your answer |
|---|---|---|---|
| 1 | Combat. Each weapon has a job, the bar is the build, moves evolve | No roll to hit. Monster wind-ups become the main test of a bar | Go |
| 2 | Gear. Plain is the floor, a Rare rolls a rule, a Signature changes a move | Rolled gear, and single pieces on the market | Go |
| 3 | Hunting. One Danger scale, climbed by the party inside a risk setting | You pick a risk, not a difficulty. This is the center, and it is untested | Go |
| 4 | Party. Two rows, personal loot, one pay rule, hired heroes | No party XP table. A four earns more because it holds deeper | Go |
| 5 | Economy. Professions make what hunting burns | The store sells only the basics | Go |
| 6 | Long game. A Level is one unit of power forever. Depth has no top | One unit for Levels, gear, monsters and prices | Go |
| 7 | Social and endgame. Hire board, clans, halls, world boss, Tower, arenas, castle | Arenas and the castle stay in and ship later. The engine is made ready for them first | Go |
| 8 | First hour. One hero, hunting in two minutes, the party at Level 5 in one press | The three empty slots are not on the first screen | Go |
| 9 | Away and return. One plan, one Start, one return card, a report that says why | Saving a setup is free | Go |
| 10 | Crafting. Ten trades owned by the company, a kit of four lines, the store as the floor | Only food heals. Hunters no longer gather | Go |

## Your calls, and where each landed

| Your call | Where it is |
|---|---|
| Randomness on gear, and rare drops that are a moment | Package 2. Traits are rolled rules. Signatures change a move |
| Luck as the Inner Flame, fed by burning remains | Section 2b. Approved, and bought remains burn too |
| Talents as spell evolutions, and something to choose every Level | Section 1b. A point every Level, branch picks at rank marks, a final form at Level 200 |
| Keep the arenas and the full castle | Section 7b. In the design, budgets set aside now, built in the last wave |
| The best of Tibia, Path of Exile and Diablo | Section 2c. Mechanics only. Sets, rerolls and a passive web are cut, with reasons |
| A skilling and crafting model in the spirit of OSRS, made our own | `09-crafting.md` |
| Stamina stays at 10 hours, 12 with Premium. Hunting and labor can be bought, scaling and pricey, hunting at most 2 blocks a day | Package 9, with the price in `04-math-strategy.md` section 11 |
| What makes Premium and Crowns worth buying, tools that wear out, Talent resets and saved builds, mounts | `10-premium.md`, `09-crafting.md` section 3.7, section 1b |

## His answers

Page picks win over chat where they differ.

| # | The question | Answer | What it means in the design |
|---|---|---|---|
| RD-Q1 | Can gold buy luck? | **b** | Bought remains burn too. The flame's Level caps how tall it stands, and fuel burns only while the company hunts, so gold buys the top of the curve and never past it. Remains get a market, and the tax on it is a sink. Crowns sold for gold now reach drop luck, flagged for the pre-launch Security review |
| RD-Q2 | A cap on hunted hours a day? | **a**, plus new rules | The hunting day stays: 10 hours, 12 with Premium. More hunting and more town work can be bought in blocks, by one rule: hours of wage at the hero's Level, twice what the hours earn back, dearer with each block that day. Hunting is capped at 2 blocks a day, so 14 hours at most, 16 with Premium (his cap, 2026-11-22). Town work up to 4 blocks. One money surface for the Security review |
| RD-Q3 | Should most players almost never die? | **a** | Careful and Steady fall back and don't die. Only Bold can die |
| RD-Q4 | Is this what "every Level" meant? | **a** | A point every Level deepens a move. A branch pick every few Levels |
| RD-Q5 | The build aimed at the end of December? | **a** | Pause the number lanes, keep what is true under any design, run the climb test first. No new date until it reads. Built as fast as that allows |
| RD-Q6 | Four heroes on the first screen, or at Level 5? | **a** | One hero, then three recruits in one press at Level 5, near the first hero's Level |
| RD-Q7 | Does a lone hero need its own target? | **a** | Slower and fair. No number set |
| CR-Q1 | Trades on the company or on each hero? | **a** | On the company, with three Masteries |
| CR-Q2 | Can Alchemy heal? | **a** | No. Only food heals |
| CR-Q3 | A daily cap on town work? | **b** | Each hero's town work has a daily cap, and Premium makes it longer. With Premium's 2 hunting hours, a payer who uses every hour gets about a fifth more a day, and nothing more per hour |

## What is proven, measured and unplayed

- **Measured on the real engine.** The problems this redesign answers. A four's pace is capped by the respawn. The harder tiers are a cliff. One front hero takes nearly all the damage. Armor did nothing past Level 30. A health-only boss is a clock. Stat-line Talents moved pace about 2%.
- **Seen in play.** One first hour played by hand, and reports from a handful of playtesters. Real heroes spent more hours in town than hunting.
- **Not measured, not played.** Everything new. The climb, the risk setting, Traits, evolutions, the flame, the pay rule, the stamina price, the Premium hours and every number in these files. No one has played a minute of this design.
- **The one test everything hangs on.** Does a party settle at a Danger step and fall back before it wipes? If not, four of the ten directions get re-thought and the existing tier table is the fallback.

## What happens now

1. The climb test V1 is running (`lane/v1-climb`, started 2026-11-22), first and alone.
2. The side seam, wave 1's first engine batch, runs beside it because it holds under any design.
3. The number lanes stay paused. Lanes that hold under any design keep going (`05-roadmap.md` section 3).
4. The day V1 reads, targets are written as experiences you can read, and the build waves start.
5. The rest is tuned together on the one engine in the Balance Lab (`07-balance-lab.md`). You see the results and a build plan with dates.
