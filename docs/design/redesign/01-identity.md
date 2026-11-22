# 01. Core identity

Written 2026-11-21 on `lane/rd-vision`. Docs only. This is deliverable 2 of the reset request of 2026-11-21. It is a proposal for review. Nothing here is final and nothing here is a ruling.

**Labels.** Every claim ends with one. EVIDENCE is something seen in play or in the code, with its source. MEASURED is a run on the engine, with its run. JUDGMENT is a design opinion. SPECULATIVE is a guess worth testing. HISTORICAL is an older decision, kept as a record and not as a rule.

**Hard lines.** Only the mission lines bind this design. The game is multiplayer and online. The server decides every outcome and the client only sends intents and draws what comes back. Hunts keep running on the server after the browser closes. Steam and phones run one web core. There is no solo or offline tier of progression. (EVIDENCE: `CLAUDE.md` section 1)

## 1. Hearthrise in one paragraph

You lead a small company of heroes in a shared pixel world. You do not swing the sword. You decide who is in the company, how each hero fights, what they carry and wear, where they go and how much risk they take. Then the server plays the hunt whether you watch or sleep, and it comes back with a clear answer: how deep your plan held, what broke first, and what dropped. You fix the weak point, push further, and now and then a drop lands that changes how a hero plays. Around you a town full of other players does the same, and you trade, hire, group and compete with them. (JUDGMENT)

## 2. The player fantasy

"I built this company. It is out there right now, holding a place most players cannot hold, because of choices I made." (JUDGMENT)

Three things make that fantasy ours and not another game's.

1. **The plan is the play.** Combat is automatic for everyone, so skill is preparation. The action bar with its "when" conditions is where a player shows skill. (EVIDENCE: the bar and its conditions are built, `src/data/abilities.js` and `src/data/condition-metrics.js`. JUDGMENT that it is the center.)
2. **The world runs without you.** Closing the game is a normal move, not quitting. The best 20 minutes of the played first hour was watching a party of four work. The return after 8 hours was the second best. (EVIDENCE: `docs/design/overhaul/review/02-four-hero-hour.md`, timeline)
3. **It is a place, not a spreadsheet.** A visible town with other players in it, a gritty medieval tone, heroes you can see on a map. (HISTORICAL: owner direction of 2026-10-12 and 2026-10-14, kept here as core vision)

## 3. The core loop

| Scale | What the player does | What pulls them to the next step |
|---|---|---|
| **Minutes** | Reads the last hunt's report. Changes one thing: a bar line, a piece of gear, a supply, the ground, the stance. Presses one Start for the whole company. Watches a little if they like | The report names the weak point, so there is always one clear thing to try |
| **A day** | Two or three returns. Each one is a return card with at most three decisions. The company hunts its day, then works its trades in town. The player sorts the drops that matter, sells or lists the rest by rule, restocks by rule | A new best depth, a Level, a trade Level, a drop with a Trait worth a look, a price that moved |
| **Weeks** | Moves to a new ground. Rebuilds a hero around a drop. Completes a bestiary page. Grows the company's hall. Joins a clan and a world boss. Hires a hero, or puts one out for hire | New grounds ask new questions, so the same company needs a new answer |
| **Months** | Chases Signature items. Holds records on old and new grounds. Climbs the Tower. Runs halls with other players. Takes trades to 99. Levels without end | Depth has no top, records are public, and the rarest drops are stories |

(JUDGMENT. "Core loop" is judged over the first 20 hours and on, not the first hour. HISTORICAL: owner direction of 2026-10-31, kept.)

## 4. What is automated, and what the player decides

The first principle, kept from 2026-10-18 as core vision: players spend their time on interesting decisions, not on repeating decisions they already made. Every choice is remembered, reusable and copyable. (HISTORICAL, confirmed as core)

| The server does it | The player decides it, once |
|---|---|
| Every swing, spell, heal, dodge and death | Who is in the company and each hero's fighting style |
| Walking, pulling, looting, eating, drinking | Each hero's action bar: which moves, in what order, on what conditions |
| Finding the deepest step the company can hold inside its stance | The stance: Careful, Steady or Bold |
| Falling back a step when the plan is failing | Where to hunt, and what the hunt is for: Levels, gold or a drop |
| Selling, banking and restocking by the player's rules | The rules: what to keep, sell, list and buy |
| Wearing a plain upgrade that is better in every way | Any piece that is a real trade: a Trait, a Signature, a different role |
| Town work after the hunting day | Which trades the company works and what it makes |
| Starting again tomorrow, on one press | Whether the plan still fits, or needs changing |

Manual steering stays optional fun in town and at home, with the same result as not steering. (HISTORICAL: owner direction of 2026-10-14, kept)

## 5. The ten questions

**1. What makes Hearthrise compelling for thousands of hours?** Power always buys something you can see. Every Level, skill point and gear upgrade lets the company hold a deeper step of a ground, and depth has no top. So the game never runs out of "one more". Around that sit four slower chases that do not end quickly: rare drops that change a build, the bestiary, trades to 99, and public records. (JUDGMENT. EVIDENCE for the problem it fixes: a four's pace is held by the respawn, so on the easy tier nothing a hero owns is worth more than a few percent. `12-balance-pass.md` section 4.2, and `review/10-designer-d9-halls.md` row FB-3.)

**2. What makes automated hunting strategically interesting?** A hunt is a test of a plan, and the test has to be able to tell good plans from bad ones on a slope. Three things do that. Monsters ask different questions, so one bar does not answer every ground. The party pushes as deep as it can hold, so every bit of power shows. The report says why it stopped, so the player learns. (JUDGMENT. EVIDENCE: today's harder tiers are a cliff, safe or wiped, `12-balance-pass.md` section 4.1. Nothing reads healing against incoming damage or says why a hunt ended, `docs/design/balance-baseline/03-targets.md` section 0.)

**3. What makes combat styles distinct?** Their job, not their damage number. Each style is best at one kind of problem: one tough target, a crowd, something in the back row, a party in trouble, a blow that must be stopped. Grounds are built from those problems, so a style is strong where its problem is common. (JUDGMENT. EVIDENCE for the problem: one style led the damage charts on every ground a playtester reported, and best supplies were never a real choice. Playtest reports of 2026-11-16.)

**4. What makes progression rewarding across unlimited Levels?** One Level is one fixed unit of power at Level 20 and at Level 2,000, and that unit is felt as depth held. Grounds, gear and prices grow on the same scale, so nothing drifts apart at high Levels. Levels also open things on a steady beat: a ground, a bar slot, a move. (JUDGMENT. EVIDENCE: on a straight-line gear curve a fixed percent step and a fixed Level gap cannot both hold past about Level 150, tension K-9 in `03-targets.md`.)

**5. What makes equipment acquisition exciting?** A drop can change what a hero does, not only how hard they hit. Plain gear is the floor. Rare gear carries a Trait, a rule written in the same words as the action bar. The rarest gear has a Signature that changes one move. Every drop has a home the player can learn, so chasing is a plan and not only luck. (JUDGMENT, built on the owner's confirmed requirement of 2026-11-21: gear may carry randomness where it adds decisions, and a rare drop must be a moment, not a bigger number.)

**6. What creates a sustainable economy?** Gold and goods must leave as steadily as they arrive. Hunting burns supplies every hour, and players make those supplies. Old gear is burned to improve new gear. Monster parts from one ground power hunting on another. Big purchases scale with wealth. The server owns every piece of it and journals every move. (JUDGMENT. EVIDENCE: real heroes spent 1.57 town hours for each hunted hour, so making things is already half of play. `tools/balance-program/calibration/c4.json`.)

**7. What makes solo play worthwhile?** "Solo" means one player with their own company, and that is the whole game, never a lesser mode. One hero hunting alone is also worth doing: for a target drop, for a hero at a different Level, for a cheap gold run. The reward rules are the same for one hero and for four. (JUDGMENT)

**8. What makes party play compelling?** Heroes cover for each other, because monsters reach the whole party and each style solves a different problem. A good four holds far deeper than its four heroes apart, in gold as well as XP. With other players it goes further: hire a hero you lack, fill a room that needs eight, bring down a world boss as a shard. (JUDGMENT. EVIDENCE for the problem: a four out-earns its heroes apart in XP by 1.4 to 2.6 times but earns only 0.53 to 0.77 a head in gold, tension K-8. One front hero takes 92 to 100% of a four's damage on nine of fourteen grounds, `12-balance-pass.md` section 4.1.)

**9. What creates meaningful long-term decisions?** Choices with a cost to undo, and choices between good things. Which style a hero trains for hundreds of hours. Which four roles the company holds. Whether to burn a rare piece to carry its Trait forward. Levels or gold tonight. Which drop to chase for a month. Where the company's gold goes: gear, hall or safety. (JUDGMENT)

**10. What adds complexity without enough value?** Stacks of small percent bonuses from many places. A percent that cannot be felt is a cost with no benefit. Today's game has more than ten such layers. Also: skills repeated on every hero, difficulty picked by hand from three tiers, content that needs its own rules, and any screen that asks for the same choice twice. (EVIDENCE: `src/data/` holds separate tables for temper, imbuements, special attributes, glyphs, jewelry perks, bestiary trophies, charms, room perks, companions, blessings, premium perks and buffs. MEASURED: the fastest Talent build is at most 2.2% faster than the suggested one and an empty build costs under 3%, `12-balance-pass.md` sections 0 and 4.2. JUDGMENT that this is the main source of waste.)

## 6. The design principles

Every system must serve these. They are the test for the packages in `02-architecture.md`.

1. **Decide once.** Every choice is remembered, reusable and copyable. A repeated choice is a bug.
2. **Power is felt as depth.** If a stat cannot change how deep a company holds, it does not exist.
3. **Slopes, not cliffs.** A slightly worse plan gets a slightly worse result. Failure costs time first and a death only when the player chose the risk.
4. **Questions, not numbers.** Grounds, monsters and bosses differ by what they ask of a plan. Styles and gear differ by what they answer.
5. **One rule table.** Moves, Traits, imbuements and monster rules are rows in one shared table of "what, how much, when". No content gets its own math.
6. **The report teaches.** Every hunt ends with why it ended and what would help. The player never has to guess.
7. **A drop is a story.** Rare things are truly rare, change play, have a known home, and are seen by others.
8. **Everything made is used up.** Each item has a source and a use, and each trade has a buyer who keeps needing it.
9. **Server truth.** The server rolls it, owns it and journals it. The client draws it.
10. **Fewer, deeper systems.** A new system must replace or absorb an old one, or pass the purpose test alone.
11. **Clear at a glance.** A player who has never seen a screen knows where to go, what they need and what it does.
12. **A place worth being in.** The town, the hall and other players are visible and matter.

(JUDGMENT. Principles 1, 9, 11 and 12 restate standing core vision. Principles 2 to 8 and 10 are new.)

## 7. The purpose test

A system ships only if it gives a clear yes to all six.

1. **Problem.** Which player problem does it solve? Say it in one line.
2. **Decision.** What interesting choice does it add, and is that choice made once?
3. **Depth.** Can its effect be felt in how deep a company holds, in what the company earns, or in what the player is seen to have?
4. **Plugs.** What feeds it and what does it feed? A system with no source or no use fails.
5. **Shared.** Does it use the one rule table and the one engine, with no special case?
6. **Cost.** Is the value worth its screens, its text, its server load and the time it takes to learn?

If it fails, merge it, simplify it or cut it. Having code or a design chapter is not a reason to keep it. (JUDGMENT, extending the purpose test of `docs/DESIGN_STANDARDS.md`)

## 8. What this identity keeps, changes and drops

| Keep as core | Change | Drop |
|---|---|---|
| Server-run hunts that continue while away | Three hand-picked tiers become one Danger scale the party climbs by itself inside a stance | Percent layers that cannot be felt |
| A company of up to four heroes on one account | The four arrives inside the first hour as one step, not as four creations | Talent trees of stat lines |
| Classless heroes, skills trained by use, a Level with no cap | Trades belong to the company, not to each hero | Skills repeated on every hero |
| The action bar with conditions | Gear gains Traits and Signatures | Gear that is only a bigger number |
| Drops with a known home, rare drops that are rare | Monsters gain roles and reach the back row | A party that is one health bar |
| Shared towns, chat, trade, clans | Coin and loot scale with depth the same way XP does | Bosses decided by the clock |
| Death that costs something | Failure is a fall back first, death second | Prices on remembering a choice |

(JUDGMENT. Each row is argued in `02-architecture.md`.)
