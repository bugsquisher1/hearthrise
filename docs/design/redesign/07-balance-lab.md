# 07. The unified Balance Lab

Written 2026-11-21 on `lane/bx-balance-lab`, from `set/v0.2.144` at b596f0398. Docs only. Nothing here is built and nothing here is a ruling. It answers the owner's request of 2026-11-21: investigate six repositories, then propose one Balance Lab that reuses Hearthrise's real simulation and can explore different formulas, spells, gear and mechanics as one complete game.

**Labels.** READ means I read the file or the code on this date. IN FLIGHT means a lane is writing it and I read its branch head. PROPOSED is this document's design. UNKNOWN is not measured or not verifiable today. Sizes follow `02-architecture.md`: S is a data or tool change, M is one lane, L is several lanes or an engine batch.

**What was read.** The two investigation files (the six-repo verdicts and the public survey). The tools on the set. `origin/lane/bl-baseline` at 311db8f61 and `origin/lane/bl-sensitivity` at 439e461a0. `00-assumption-audit.md`, `01-identity.md` and `02-architecture.md`. `origin/lane/rd-math` did not exist when this was written, so `04-math-strategy.md` is not an input. Section 6 says what that costs.

**Three confirmed requirements arrived while this was written** (the owner, 2026-11-21, relayed by the Coordinator). They are newer than `02-architecture.md` and win where they differ from it. (1) Arenas, heroes against heroes, and the full castle stay in the game. They may ship later, but balance must count them now. (2) Talents become spell evolutions: a hero spends an evolution point every Level on its moves, with branch picks at rank thresholds, and points can be banked. (3) The Lab must search builds across evolutions, gear Traits and the luck flame. Sections 3.1, 3.2, 3.3, 3.6 and 5 carry them.

## 1. One screen

**The best overall approach.** Do not add a tool. Finish the one we have and give it three things it lacks: a model of the game as data, variants, and one front door.

1. **One engine, always.** Every played number comes from `src/core/combat-sim.js` through the real settle, as `tools/balance-sim/cell.mjs` already does. The Lab never computes a fight.
2. **A candidate game is data.** A candidate is a small manifest: a base commit, formula families chosen for named rule slots, data overlays (gear schemes, spells, monster rows), and lever values. Today's game is candidate C0. The fresh design of `02-architecture.md` is another. They are played on the same scenarios, on the same dice, and read by the same outcomes.
3. **Targets judge, not the old game.** A report ranks candidates against the new-game targets. The pinned baseline tells us what moved. It never tells us what is right.
4. **Derive, verify, then search.** Solve what algebra can solve from the math model. Verify on the engine. Search only the remainder, over a few global levers, and show a Pareto front with no blended score.
5. **Ask before you change.** One command gives an agent the full affected picture of any lever, mechanic or target before it proposes anything.
6. **Count every source of power once.** One power budget lists every source, including evolutions, Traits, the luck flame, clan and castle buffs and arena gear, so PvE balance is not set without them and then redone.

**The highest-value components, in order.**

| # | Component | Why it is first | Size |
|---|---|---|---|
| 1 | The pinned baseline with noise, and the whole-game compare | Without it nothing else can be trusted. IN FLIGHT on `lane/bl-baseline` | landing |
| 2 | The model graph: every mechanic's typed reads and writes, joined to the 164 levers and 100 targets, with declared against measured movement | Fixes "no complete picture" and "fix here, break there" with data we mostly have | M |
| 3 | Variants: rule slots with contracts, file overlays, candidate manifests | The only part that makes "explore different designs" real | L |
| 4 | Missing readers and the sustain counters | 31 of 100 targets have no reader. A target nobody can read is a wish | M |
| 5 | The front door: `lab ask`, `lab propose`, `lab play`, `lab compare`, `lab record` | Turns five tools into one workflow | S to M |
| 6 | Coordinated search with hard constraints and a Pareto front | Replaces one-knob tuning. Worth little until 1 to 4 exist | M |
| 7 | The economy loop | Needed for the fresh design's package 5. The largest gap, and the last to pay | L |

**What we will not build.**

- A second implementation of any game mechanic. None of the six repositories is adopted, wrapped or imported.
- Formulas as strings with an expression evaluator. A formula is a named JavaScript function in the one engine.
- Runtime rule switches inside the live engine. A variant is a file overlay on a scratch copy, never an `if` the server carries.
- A blended 0 to 100 balance score. Outcomes stay a vector, and targets judge each one.
- Any parameter per hunting ground. The search space is the global lever class only.
- Python on our PCs, a web service that spawns the simulator, or a statistical stand-in model trained on engine results.
- A new dashboard. Balance Lab v3 is extended.
- A market simulation before the wage formula exists.

## 2. The six repositories

The verdicts are the investigation's (`repo-verdicts.md`), and I agree with all six. I checked two things against the clones and one against our own code. The clones were read, never run.

| Repo | Licence | Verdict | Key evidence |
|---|---|---|---|
| mechflow | MIT | **Study concepts.** The strongest source: six of the fourteen patterns | An economy modeller with its own YAML model and parser. Its formula ids resolve only to its own pools, so it cannot call our engine. Three commits on one day, one author. Its ideas are the right ones: typed reads and writes, ghost edges, second-order trace with polarity, boundary sweeps under a named budget, findings with stable ids, set synergy. READ: `packages/mcp/src` registers 16 tools in three groups (analysis, search, simulate), which is the shape our front door should copy |
| zzstat | MIT (one example folder looks like commercial data) | **Reject as a component. Study two ideas** | A Rust stat resolver with no simulation, a stub command line, a red build and no Node or Deno target. Keep the fixed phase order and the per-stat breakdown that lists every contributor |
| GameMechanicLab | none, all rights reserved | **Reject.** Ideas only | A Python one-against-one boss simulator. Its sweep uses different seeds per cell, so cells cannot be compared. Keep the experiment record and the paired formula comparison on the same seeds |
| game-systems-sandbox | MIT | **Reject** | About 590 lines of toy combat, unseeded by default. Its one lesson is about dice streams, below |
| game-balancing-difficulty-optimizer | MIT | **Reject** | One commit and no optimizer despite the name. Its sensitivity is not reproducible. Keep two habits it attempts: an interval on every number and an assumptions block on every report |
| rathena | GPL-3.0, code and data | **Study concepts.** Never code, never data rows | The best real-world evidence for the model layer: one recompute-from-zero stat pipeline shared by players and monsters, fixed damage stages, a closed bonus vocabulary, rolled options as two tables, an override layer as the unit of change. Also the best warnings: 1,340 hardcoded status checks, a compile-time rule fork at about 300 sites, item scripts in a full language, and level-indexed tables that cannot serve unlimited Levels |

**Where I differ from the investigation and the survey.**

1. **Pattern 13, sub-streamed dice, is mostly already true here.** READ: `src/core/combat-sim.js` lines 470 and 478 draw a fresh stream for every swing and for each of two domains, `s` for the step and `r` for rewards, from `ctx.seed(domain, index)`. `tools/balance-sim/cell.mjs` hashes the hunt secret from the seed and segment only, so every cell and every tree plays the same dice. What remains: inside one swing all units share one stream in id order (`src/core/hunt/world-step.js` line 16), and the engine has no separate domain for gear rolls. Section 3.3 handles both. This is a small gap, not a rebuild.
2. **SALib and pymoo are ranked lower than the survey ranks them.** Our cost is engine time, not algorithm code. Morris screening, Sobol indices and a non-dominated sort are a few hundred lines of plain JavaScript with known test answers. Section 3.6 gives the full argument.
3. **CoffeeMud's formula strings are rejected for the engine.** A string evaluator on the server is a second interpreter at 36,000 combat steps an hour, and a string cannot declare what it reads. The useful half of the idea is kept: which formula family a slot uses is data.
4. **Antimatter Dimensions' capped-tick catch-up is rejected for combat.** CLAUDE.md section 6 rules one engine with no away mode. Town work is already closed form.
5. **mechflow's "strategies within X percent of best" needs care.** For us it becomes the "one viable build" reader, but counted over cells of the real engine, never over a model of it.

## 3. The architecture

Eight layers. Each names the tool it extends, what is new, and the problem it solves. The problems are numbered as in section 4.

### 3.1 The game model as data

**Solves:** 1 (no complete picture), 3 (inconsistent formulas), 5 (missed dependencies).

**What exists.** `formulas/formulas-architecture.json` holds 107 formulas, 129 exceptions and 197 edges. `levers.json` holds 164 levers with file and line, range, outcomes and reach. `targets.json` holds 100 candidate targets, 22 tensions and 16 lever rules. `census.mjs` counts every function with a typed number that no register names. These are four files that do not know each other well, and the edges are untyped: an edge says "feeds", not what quantity moves or in which direction.

**What to add (PROPOSED).** One generated file, `tools/balance-lab/model/graph.json`, built by a new `model.mjs` from the registers above. No second copy of any fact.

- **Typed reads and writes.** Each formula row in the architecture register gains `reads` and `writes`: lists of named quantities from one closed list (hero power, hit chance, damage taken, kill time, Level XP, coin, supplies used, and so on) with a sign. This is mechflow's idea, on our register.
- **Ghost edges.** Two mechanics that touch the same quantity with no declared edge are a finding. So is a declared edge with no shared quantity. A pair can be cleared only by a written "no interaction, because" record.
- **Second-order trace.** From any lever, walk the graph two steps and print each reached outcome with its polarity. This is what `lab ask` prints first.
- **The stat pipeline, as a fixed order.** One list of layers for a unit's stats: base by Level, skills, evolutions, gear base, Temper, rolled options, Traits, imbuements, timed buffs, party effects, clan and castle buffs, caps. Heroes and monsters use the same order. Today `src/core/member.js`, `src/core/perks.js` and `src/core/vitals.js` hold this in code. The model first records the order as it is, then the census shows every place that breaks it. The idea is rAthena's recompute-from-zero pipeline and zzstat's phase order.
- **A closed bonus vocabulary.** Every item, set, Trait, imbuement and buff emits rows of one shape: key, size, combine rule, cap, and an optional condition from `src/data/condition-metrics.js`. This is the rule table of `02-architecture.md` section 0, and the modifier table of `44-formula-architecture.md` section 5.1. Because the rows are data and never scripts, the dependency graph is derived by reading them.
- **Rolled gear as two tables.** Option definitions (a bonus row with a value range) and option groups (guaranteed weighted slots plus a capped random pool, by item tag and Level gate). Rolls live on the item instance and enter the pipeline as one layer. Each group's expected value and range are computed exactly, by listing its outcomes. The shape is rAthena's, and the tag and weight fields follow Path of Building's schema. No data from either.
- **A probe mode.** For one hero or monster, print each stat with every contributor in layer order. For one blow, print each damage stage. This is a reader on the engine's own functions, used by the Lab and by tests.
- **The power budget.** One generated table, `tools/balance-lab/model/power-budget.json`: every source of hero power as a row, with its layer, its size in power steps at each spine Level, and whether it is live, planned or held for later. Rows today would include Level, skills, gear base, Temper, rolled options, Traits, evolutions, imbuements, supplies, the luck flame, Blessings, clan and castle buffs, and arena gear. A planned source with no numbers yet still gets a row and a reserved share. The check fails when the rows sum past the budget of the math model, or when a bonus row in the data has no budget row. This is how the castle and the arenas are counted before they are built.
- **Levers joined to the graph.** Each lever row already names its formulas. The join adds the declared outcome list, which layer 3.5 checks against measurement.

**Guards.** `model.mjs --check` fails on a mechanic with no reads or writes, on a ghost edge with no record, and on a bonus row outside the vocabulary. It extends `architecture-register.mjs --check` and `levers.mjs --check`.

### 3.2 Variants

**Solves:** 2 (old numbers treated as binding), 4 (one parameter in place of coordinated change). This is the core of "explore combinations, do not tune the existing design".

**What exists.** A patch (`matrix-scratch.mjs`, schema `hearthrise.balance-patch/1`) scales knobs or replaces one exact line of text, on a scratch copy of the tree that is never the real tree. `baseline.mjs --materialize <ref>` plays any game commit with today's harness laid over it. 41 patches exist. `patches/talents-hook.json` shows the limit: it plants a whole mechanic as eight text edits against exact source lines. That works once and breaks on the next refactor.

**The design (PROPOSED).** A variant is a named delta at one of four depths. A candidate is a set of them.

| Depth | What changes | How the Lab plays it | Engine seam needed |
|---|---|---|---|
| 1. Numbers | A lever's value | A knob in a patch, as today | None |
| 2. Rows | A whole data table: a gear scheme, a spell list, monster rows, an option table | A file overlay. The patch names a replacement file for a data module | None. The scratch copy already replaces files |
| 3. Formulas | The family a rule uses: a ratio armor against a capped one, a geometric power step against a linear one | A file overlay on a **rule slot** | Each slot must be one module with a contract. Sized below |
| 4. Mechanics | A new behavior: wind-ups, back-row targeting, climb and fall back, pulls on readiness | A git ref. The candidate names an engine branch | The mechanic must be written once, on a branch. No shortcut |

- **A rule slot** is a module in `src/core` with a narrow, written contract: its exports, its inputs, the quantities it reads and writes, and its properties (finite, whole numbers where the ledger needs them, monotonic where the design says so, no table indexed by Level, same result for the same input). `tools/balance-lab/model/slots.json` lists the slots. `tests/rule-slots.mjs` runs every registered variant of a slot against the contract.
- **A formula variant** is a replacement file for a slot, kept in `tools/balance-lab/variants/<slot>/<family>.js`. It is engine code that the one engine runs. It is not a model of the engine. The winner moves into `src/core` and the losers are deleted. A variant shelf entry carries an expiry date.
- **No runtime switch.** I considered passing a rule set through the engine's `ctx`. I reject it. It would put a selector on the server's hot path, ship dead rule sets in the edge bundle, and repeat rAthena's rule fork. The overlay needs nothing from the live engine, and `tools/pack-edge.mjs` can refuse a bundle that contains a variant path.
- **A candidate manifest**, `tools/balance-lab/candidates/<id>.json`: an id, a base ref, the slot overlays, the data overlays, the lever values, a scenario binding (section 3.3), and its assumptions. `C0` is today's tree with nothing overlaid. Candidates compose, and two that overlay the same slot are refused.
- **The identity proof.** An overlay that copies the shipped module must play byte-identical results. The patch kind `identity` already enforces this in `balance-matrix.mjs --diff`.

**The seams, sized.** READ from the file sizes and imports on the set. All sizes are my judgment.

| Slot | Today's home | Seam work | Size |
|---|---|---|---|
| Hero power | `src/core/combat.js` `playerCombatRolls`, with the literals 0.35, 0.6 and 2 typed inline (exception X-POWER-LITERALS) | Read named constants, export one function | S |
| Hit chance | `src/data/to-hit.js`, `src/core/combat.js` | Already close to one function | S |
| Mitigation: armor and ward | `src/core/mitigation.js` | One function for each defense | S |
| Level curve and death cost | `src/core/xp.js`, `src/core/action-rules.js` `deathXpLoss` | Already functions | S |
| Monster formula | `src/data/balance-sheet.js` `formulaStats`, written to rows by `tools/gen-ground-stats.mjs` | Already a formula with a regeneration step that the scratch copy runs | S |
| Kill reward: XP, coin, drops | `src/core/hunt-rewards.js` (286 lines), `src/core/hunt/xp-share.js`, `src/core/drops.js` | Split pay from the roll | M |
| The amount pipeline | `src/core/hunt/damage.js` (373 lines) | Fixed named stages with a trace | M |
| The stat build | `src/core/member.js` (551 lines), `src/core/perks.js` (292), `src/core/vitals.js` | The recompute-from-zero pipeline and the bonus layer for rolled options | L |
| The difficulty scale | `src/data/hunt-tiers.js`, `src/data/scaled-hunts.js`, `src/core/hunt/pull-cycle.js` (381 lines) | The Danger scale itself. This is depth 4, an engine batch | L |
| The move definition, by hero | `src/data/abilities.js` `ABILITIES`, read directly by four core modules (`hunt/abilities.js`, `hunt/conditions.js`, `hunt-rewards.js`, `member.js`) | One resolver, `moveOf(hero, id)`, that returns the row with the hero's evolution applied. Detail below | M |
| The two sides | `'hero'` against `'mon'` fixed in 93 places in 22 modules (`tools/balance-program/engine-checks.mjs --mm41`) | A side becomes a property of a unit with one enemy test. Heroes can stand on either side and run their bars. Detail in 3.3 | L |

Six S, three M and three L. The S and M seams are the same refactor that `44-formula-architecture.md` section 7 already asks for, so the Lab adds a contract file and a test to work that is wanted anyway. Every seam is a combat-engine change and ships under the batching rule of CLAUDE.md section 3.3b, as an identity change first.

**Evolutions: a move swapped by a per-hero choice.** READ: every move is a frozen row of `ABILITIES`, imported directly by the engine. A bar slot already carries one per-hero choice, the rune version, which `versionOf(row, n)` turns into a mana cost and an output step (`src/data/abilities.js` line 429, read at `src/core/hunt/abilities.js` line 341). An evolution is the same seam made general.

- **The seam.** The hero's state carries its allocation: points on each move and the branch picked at each threshold. `moveOf(hero, id)` builds the effective row once, when the member is built, and the engine reads that row everywhere it reads `ABILITIES` today. The combat step does no extra work. Size M: the resolver and the four call sites are small, and the state, its validation and the projection are the rest.
- **Evolutions are rows, not code.** A branch is a set of rows in the rule table keyed by move, branch and rank: a changed share, a changed shape or target count, an added condition, an added effect from the closed vocabulary. A branch that needs a behavior the engine lacks is depth 4 and names an engine branch, like any mechanic.
- **Rank is a formula.** A point every Level with no Level cap means ranks without end. A rank's size is a closed-form function of points, never a table by rank, and the slot contract and the headroom reader of 3.3 check it.
- **In the Lab** each branch is a depth 2 variant: a different move definition on the same bar, played against its sibling branches on the same dice. No scratch copy is needed for a build, because the allocation is part of the cell, as a kit is.

**A build is a policy, not a list.** A build is a long sequence of point allocations, plus branch picks, plus Traits, plus the luck flame. It cannot be enumerated: three branches at five thresholds on six moves is already 3^30 before points or Traits. So a build is written as a rule that answers "where does the next point go" at any Level, which also makes it defined at Level 5,000.

- **Archetype policies**, a fixed small set for each job: all points in one move, an even spread, the suggested build, bank until the next threshold and then spend, and greedy by measured stat weight.
- **Sampled policies.** A low-discrepancy sample of point shares across a job's moves, crossed with random branch picks, a few dozen for each job. The sample is seeded and pinned in the scenario spec so the same builds are replayed for every candidate.
- **Readers.** The spread between the best, the suggested and the empty build. The number of sampled builds within 5% of the best. Each branch's pick share among the top tenth of builds. Whether banking is ever the best policy. Today's measured spread is the warning these readers exist for: the fastest Talent build was at most 2.2% faster than the suggested one (`12-balance-pass.md`).
- **Search over combinations** follows 3.6 in a discrete form: screen each branch against its siblings, then read pair synergy between the top branches, the Traits and the luck flame, then run a small evolutionary search on policies for each job, with the budget printed. The output is a front of builds and what each gives up, never one best build.

**Exploring combinations without a combinatorial bill.** With five slots of three families each there are 243 candidates before any lever moves. The Lab does not play that grid. It screens: each family against the reference one at a time, then pairs for the slots that mattered, under a named evaluation budget that prints what it skipped. That reporting rule is mechflow's.

### 3.3 Scenarios and the real engine

**Solves:** 5 (missed mechanics), 6 (helps one scenario, breaks others), 7 (no game-wide baseline).

**What exists.** `cell.mjs` plays one cell through the real settle in 10 or 30 second windows for hours a seed, with the real death rule, stamina, the purse and Blessings. `baseline/scenarios.mjs` (IN FLIGHT) defines 1,281 cells at eight seeds in eleven blocks: every way alone, the four, pairs and threes, eight lineups, gear steps, every open ground at both band ends, real calibration rows, and a `beyond` block at Levels 145, 185, 300 and 400 on staged and projected grounds. `matrix-plan.mjs` reaches Level 5,000 on placeholders. `calibrate.mjs` reads production (aggregates only) and compares the harness with real heroes.

**What to add (PROPOSED).**

- **Abstract scenarios with a binding per candidate.** Today a cell is a ground, a tier and a gear state, which are words of today's design. The fresh design has no tiers. So the scenario list becomes abstract: a company (size, jobs, rows), a point on the power scale, a gear state by percentile, a bar policy, a risk policy, and "content that fits". Each candidate ships a small binding that turns an abstract scenario into its own cell. C0's binding is today's `buildCell`. A candidate with a Danger scale binds "Steady" where C0 binds a tier. The scenario spec stays pinned and shared, so candidates are compared on the same questions.
- **Bar policies.** "Explore spells" needs more than one bar. Three policies for every job: the suggested bar, a lazy bar (basic moves, no conditions), and the best bar a small search finds. The gap between lazy and best is itself an outcome. `tools/balance-sim/played.mjs` holds today's played bars.
- **Long hunts.** Keep the real settle and the real windows. Hours by Level as the baseline has them. Add a "full day" block: one stamina bar from full to empty, with the stop reason read.
- **Four-hero parties.** The lineup block exists. Add every single-job four and the mixed four at each spine Level, because "four of one style clearly loses" is a target of package 4.
- **Unlimited Levels.** Three readers, cheapest first. A closed-form probe that evaluates each formula family at Levels 10 to 100,000 and checks the invariants: one Level is one step, nothing drifts apart, nothing is indexed by a table. A **number headroom** reader: a fixed ratio per step grows without bound, 5% a step passes 9 x 10^15 (the largest safe JavaScript integer, and close to a Postgres `bigint`) near step 750. The math lane must choose a scale that the ledger can hold, and this reader fails any family that cannot. Then engine cells at log-spaced Levels on projected grounds, extending `grid-project.mjs`.
- **Rolled gear.** Two stages. First an acquisition model, which is arithmetic on drop and option tables: the kit a company holds after N hunted hours, at the 10th, 50th and 90th percentile of luck. Then engine cells at those three kits, plus the exact minimum and maximum roll of each group. One Trait at a time is played against the same kit without it, on the same dice, on a ground that suits it and one that does not.
- **Heroes against heroes.** The engine cannot play it today. Once the sides seam of 3.2 exists, an arena cell is two companies in one instance, each a normal scenario company with its own bars, builds and kits. Nothing else in the Lab changes: candidates, dice and builds are shared with PvE. Its outcomes are a win rate with an interval for each matchup, the matchup table across jobs and lineups, fight length, and the same dominance reader (no job or build wins every matchup). Until the seam exists the only reading is the proxy in `engine-checks.mjs --mm41`, which is labelled as a proxy.
- **Standing power as a scenario axis.** Each gear state is also played at three levels of standing power: none, typical, and full (every castle buff at its cap and arena gear worn). The gap between none and full is an outcome with a target, so a lone company's PvE is never balanced on a number that a full clan then breaks.
- **Dice sub-streams.** Keep the per-swing streams. Add a third seed domain for gear and Trait rolls in `src/core/hunt-rewards.js`, so that adding rolled gear does not move one combat die. If measurement shows pairing is weak inside parties, split the step stream per unit. That second change moves live dice and so waits for a combat batch. Measure first: the sensitivity lane already reads effects as pairs by seed.
- **Mechanics the engine cannot play yet.** Climb and fall back, pulls on readiness, wind-ups and back-row targeting do not exist. A candidate that needs them must name an engine branch. For an early look only, the harness may emulate a Danger step between settle windows with the engine's own `src/data/scaled-hunts.js` scaling. Such a run is labelled SKETCH, may rank designs, may never set a number, and is deleted when the engine batch lands. It is the one place this design risks a second implementation, so it gets that fence.
- **The economy loop.** Today the simulator plays hunts only. Gold is an upper bound (hard constraint HC-5), the store bill reads 1.7 to 2.2 times real (`51-baseline.md`), and no market exists in the tool. Three steps, in order.
  1. **The account day.** Stitch what is real: engine cells for the hunting day, then the game's own closed-form town work (`src/core/artisan-sim.js`, `src/core/skill-sim.js`, `src/core/farm.js`), then the player's rules (sell, bank, restock). The output is a ledger for the day: every faucet and sink by source. `paths.mjs`, `gold-model.mjs` and the atlas already compose rates across weeks. They are re-pointed at this ledger so that no rate is typed.
  2. **A played check.** `tools/qa/local-world.mjs` runs the real page, engine and SQL chain with a time skip. One account's day played there must agree with the composed day. This is the economy's calibration, as `calibrate.mjs` is combat's.
  3. **The castle and the clan.** The castle is a set of sinks, a use for labor, and a source of buffs (`docs/design/overhaul/06-mmo-layer.md`: a stage priced for each member with a floor of five, rested town hours given as labor, building levels that set buff sizes up to a cap). In the account day it is three ledger lines: gold and goods given, labor hours given out of the town day, and the buff held. A clan is modelled as a count of account days of a few reference kinds, which is arithmetic on step 1, not a new simulator. The readers are weeks a stage for a clan of 3 and of 60, the share of a member's income and town hours the castle takes, and the buff's size in power steps from the power budget. Arena entry costs and arena gear prices join the same ledger when they are designed.
  4. **A market model, last and optional.** Agents with price beliefs anchored on the wage formula, the idea from bazaarBot. It models other players, not game rules, and every output is labelled MODEL. It answers stability questions only: does a price run away, does a sink starve. It is built only if such a question is open when steps 1 to 3 are done.

### 3.4 Measurement

**Solves:** 5, 7.

**What exists.** `baseline/outcomes.mjs` (IN FLIGHT) keeps every outcome one value a seed in eight categories, so each cell carries its own noise. `baseline/compare.mjs` holds a noise rule (two standard errors and at least 1%), Poisson rates for deaths, and verdicts. `standards.mjs` and `matrix-metrics.mjs` hold the older bands and readers. `targets.json` says 31 targets have no reader.

**What to add (PROPOSED).**

- **A reader for every target, or a written reason.** The largest gaps, from `03-targets.md`: healing against incoming damage, healing by source, mana, the reason a hunt ended, lineup dominance, a four's gold against its heroes apart, anything past Level 400, rare drop timing, halls. Most need **counters the engine emits**, not arithmetic in the tool: `src/core/hunt/tally.js` is their home. The fresh design asks for the same counters for the player's report (package 9), so the Lab and the game read one source.
- **Design-neutral outcomes.** The common yardstick across candidates: hunted hours a Level, deaths in 1,000 hero-hours, net gold a hero-hour over the wage, supplies as a share of income, front share of damage taken, best over worst job, a four over its heroes apart in XP and in gold, lazy bar over best bar, and what share of a result each of Level, skill, gear and bar explains.
- **An interval on every number.** Already true for cell outcomes. Extend it to every view and every reader that today prints a bare value.
- **An assumptions block on every report.** The candidate, the scenario spec and its hash, seeds and hours, the death rule, the bar and supply policies, the gear states, what is not modelled, and the harness's measured distance from real play. Known distances today: Level XP on Krell's Hold reads 5.5% under real, the party store bill 1.7 to 2.2 times real, and zero deaths on Normal in 1,120 pooled hours where real new heroes died 7 times in 78 (`51-baseline.md`).
- **Findings with stable ids.** A finding is a check id plus its scope key, hashed. Every report can then say new, gone or unchanged against the pin. Checks include the ghost edges of 3.1, the tool reds of `matrix-metrics.mjs`, and the dominance readers of 3.5.
- **Experiment records.** `tools/balance-lab/experiments/<id>.json`: the question, the hypothesis, the candidate, the scenario and budget, the result file's hash, the conclusion, and who reviewed it. An experiment with no hypothesis written before the run is refused.

### 3.5 Analysis

**Solves:** 4, 5, 6.

**What exists (IN FLIGHT).** `sensitivity/sensitivity.mjs` moves 44 levers one at a time over wide ladders (x0.5 to x2) on 68 baseline cells, with eight interaction experiments. `sensitivity/analyze.mjs` reads paired effects by seed, elasticities at three points of the ladder, and interactions, and calls an effect resolved only beyond Student's t.

**What to add (PROPOSED), in this order.**

1. **Declared against measured.** Each lever declares the outcomes it should move (`levers.json` `outcomes`, and `intends` in the sensitivity lane). The matrix shows what it did move. An undeclared resolved movement is a finding. A declared movement that did not happen is a finding too: the lever is dead. This is the cheapest and most useful check in the whole Lab, and the data for it is nearly on disk. The idea is rAthena's dirty flags.
2. **Morris screening.** One-at-a-time ladders from a single base point cannot see a lever that only matters when another has moved. Morris runs short one-at-a-time walks from 10 to 20 random base points. For 44 levers that is 450 to 900 points. It ranks levers by mean effect and by how much the effect depends on the others, and it cuts the list to the dozen that matter.
3. **Sobol indices, on the survivors only.** At 12 levers and 256 base samples it is about 3,600 points. It gives each lever's share of an outcome's variance alone and with the others. It is run once per adopted candidate, not per change.
4. **Dominance and "one viable build".** Over the lineup, job and Trait cells: how many choices sit within 5% of the best, how often one choice is the top pick, and whether any choice is best everywhere. The fresh design states these as targets (no Trait on top in more than a set share of cells, no lineup that wins every ground).
5. **Synergy.** The gain of a set over the sum of its members' single gains, read from paired cells. A large positive value marks a combination that will dominate. A negative one marks stacking that wastes a slot.
6. **Stat weights.** The finite-difference worth of one point of each stat in power steps, by job and Level. It is the direct test of design principle 2: a stat that cannot move depth does not exist.

One-at-a-time results are never printed as tuning advice. They are printed as slopes, with the warning that a slope at the base point does not hold far from it.

### 3.6 Search

**Solves:** 4, 6.

**In-house JavaScript. No Python.** The reasons:

- Our PCs have no Python, and every tool here is Node. A second language means a second seeding scheme and a file bridge to maintain.
- The cost is engine time. One point is a scratch copy plus tens of cells. The search algorithm is under 1% of the runtime in either language.
- The algorithms are small and have exact test answers. Morris and Sobol indices are checked against the Ishigami function. The non-dominated sort is checked against a planted front.
- A file contract keeps the door open. Points go out as JSON and results come back as JSON, so a GitHub runner could drive the same loop from Python later (pymoo or Optuna) with no change to the Lab. I would open that door only for a problem with more than about 15 free levers after screening, which the "few global levers" rule is meant to prevent.

**The method (PROPOSED), simplest first.**

1. **Derive.** Where a target is algebra on a formula family, solve it. The math lane's model gives the starting values.
2. **Constrain by construction.** The free variables are levers of class `global` in `levers.json` plus the candidate's family choices. Per-ground numbers are not in the space, so lever rule LR-1 cannot be broken by a search.
3. **Sample.** A low-discrepancy sample over the levers that screening kept, played on the screening cells.
4. **Reject.** A point that breaks a hard constraint or lands a target in its red zone is dropped and counted, never scored.
5. **Sort.** Objectives are the distances to target bands, grouped by area: pace, survival, gold, gear value, party, sustain. They stay separate. The output is the non-dominated set and, for each point, what it gives up.
6. **Refine.** A coordinate pattern search around each front point.
7. **Promote.** At most five front points go to the full baseline. NSGA-II is added only if steps 3 to 6 leave a ragged front.

**Fidelity tiers.** Search is only affordable on small runs, so the tiers are named and their agreement is measured.

| Tier | What | Where | Use |
|---|---|---|---|
| 0 | Graph checks and closed-form probes | Any PC, seconds | Every proposal |
| 1 | Screening cells (the sensitivity slice, 68 cells) | A PC slice or one GitHub job | Search, Morris |
| 2 | The subset matrix | GitHub | Candidates worth a look |
| 3 | The full baseline, 1,281 cells at eight seeds, 24 shards | GitHub | Finalists and every merge |

The Lab reports the rank agreement between tiers 1 and 3 every time both exist. If it falls, tier 1 results stop being trusted.

### 3.7 Regression and the gate

**Solves:** 6, 7.

**What exists (IN FLIGHT).** `baseline.mjs --compare` puts a candidate beside the pin and prints verdicts in the owner's eight groups: IMPROVEMENT, REGRESSION, TRADEOFF, MOVED, MOVED INSIDE ITS TARGETS, WITHIN NOISE and UNEXPECTED. Only the new-game targets judge. The old bands of `standards.mjs` judge nothing there. A determinism check plays the same cells twice in fresh workers in opposite orders and requires identical bytes. `balance-baseline.yml`, `balance-diff.yml`, `balance-matrix-full.yml` and `balance-sweeps.yml` run on GitHub.

**What to add (PROPOSED).**

- **The pin is a reference, not a goal.** The pin is whichever candidate is adopted. Today that is `baseline/overhaul-start` at 861ae52e3. When a new-design candidate is adopted, the pin moves to it in one commit. A report never says "worse than today" unless a target says so.
- **Candidates side by side.** `--compare` takes more than one candidate and prints one column each against the targets, with C0 as one column among them.
- **Adversarial review.** A second agent, never the author, gets the candidate and a budget and tries to break it: all levers at their range ends, pairs at maximum, the degenerate companies (four of one job, no gear, all maximum rolls, the riskiest stance left alone for a day). It reports only problems that are absent in the reference. The budget report lists what was skipped.
- **The gate.** A change to a balance file in `src/core` or `src/data` merges with an experiment record and a tier 3 compare, or it does not merge. A tool red, a determinism difference, a new unexplained finding, or an UNEXPECTED verdict with no written answer is red. This is one new workflow, registered in `smoke.yml` as CLAUDE.md section 5 requires.

### 3.8 The agent workflow

**Solves:** 1, 2, 4.

One command, `node tools/balance-lab/lab.mjs`, with `--json` on every verb. It wraps the tools above and adds no logic of its own.

| Verb | What comes back |
|---|---|
| `ask <lever, mechanic, target or outcome>` | The affected picture on one screen: typed reads and writes, the two-step trace with polarity, measured slopes with intervals, every target touched and its status, open tensions, known findings, and the tests that pin it |
| `propose <candidate>` | Tier 0 only, in seconds. Contract and vocabulary checks, lever rules, ghost edges, and a **predicted** effect vector from the measured sensitivities, marked as a prediction. It lists the outcomes the proposal will probably move that it did not declare |
| `play <candidate> --tier 1, 2 or 3` | Runs or dispatches the run. Prints the cost before it starts |
| `compare <result> [<result> ...]` | Section 3.7's report |
| `search <space>` | Section 3.6, with its budget |
| `record <experiment>` | Writes or closes an experiment record |

**How a question flows.** An agent is asked why casters fall behind past Level 60. It runs `ask` on the outcome and gets the levers that move it, ranked by measured effect. It writes a hypothesis into a record. It writes a candidate that moves three levers together, or swaps a family, and runs `propose`. The prediction shows two outcomes it did not intend. It adjusts, plays tier 1, then tier 3, and attaches the compare. A second agent runs the adversarial pass. Nothing has touched the game tree until that record is reviewed.

**Brief rules that the Lab makes checkable.** A balance brief names an experiment record. A report quotes a number only with its interval and its record id. No report uses today's value as a target.

**MCP.** mechflow exposes its analysis as MCP tools so that a model can call them directly. The idea is right, and `ask`, `propose` and `compare` map to it one to one. I recommend the command line first: every agent here already has a shell in its worktree, and registering an MCP server is a settings change that is the owner's to make. A thin read-only MCP wrapper over the same verbs is an S once the verbs exist. Its value is letting the owner ask the Lab from a chat with no worktree.

## 4. The seven problems

| # | Problem | What solves it | Layers |
|---|---|---|---|
| 1 | Agents lack a complete picture | `graph.json` joins formulas, levers, targets and measured slopes. `lab ask` prints the affected picture before any change | 3.1, 3.8 |
| 2 | Old numbers are treated as binding | Today's game is candidate C0, one column among others. Only new-game targets judge. Targets are labelled hypotheses. The pin moves when a candidate is adopted | 3.2, 3.7, 3.8 |
| 3 | Mechanics use inconsistent formulas | One stat pipeline order, one bonus vocabulary, rule slots with contracts. The census and the contract test list every break | 3.1, 3.2 |
| 4 | One parameter is tuned in place of coordinated change | A candidate is a set. `propose` predicts the whole effect vector. Search moves global levers together and returns a front | 3.2, 3.5, 3.6, 3.8 |
| 5 | Simulations miss mechanics and dependencies | Ghost edges, declared against measured, a reader for every target, counters from the engine, an assumptions block that says what is not modelled | 3.1, 3.3, 3.4, 3.5 |
| 6 | A fix helps one scenario and breaks others | Every change is played on the whole pinned scenario list on the same dice. UNEXPECTED verdicts, the adversarial pass, the gate | 3.3, 3.7 |
| 7 | No trustworthy game-wide baseline | The pin with eight seeds, noise per outcome, determinism proof, calibration against production, and tier agreement | 3.3, 3.4, 3.7 |

## 5. The roadmap

Reuse first. Each phase has a first useful output and a proof on real simulation results. Effort is in lanes (one agent, one branch). Phases 1 and 2 run in parallel.

| Phase | What | Effort | Depends on | First useful output | Proves it works | Stops early if |
|---|---|---|---|---|---|---|
| **0. Trust** | Land `lane/bl-baseline` and `lane/bl-sensitivity`. Pin the results. Measure three unknowns: runner minutes for each tier, the noise floor for each outcome, and how much pairing by seed cuts variance | In flight, plus S | Nothing | The pinned baseline report and the 44-lever matrix | The same tree compared with itself reads WITHIN NOISE on every outcome. A planted x1.5 attack is seen in every cell. Two replays are byte-identical | The self-compare shows moves, or the noise floor on a main outcome is over 10%. Then more seeds or hours come before anything else |
| **1. Picture** | `model.mjs` and `graph.json`. Typed reads and writes on the 107 formulas. Ghost edges, the trace, declared against measured. `lab ask` and `lab propose` | M | 0 | `lab ask monsterHp` on one screen | On the 44 played levers: the count of undeclared and of dead movements, each a named finding. A planted wrong declaration is caught. The trace's predicted sign matches the measured sign, and the match rate is printed | Under two thirds of signs match. Then the register is wrong and gets fixed before anything is built on it |
| **2. Readers** | The 31 missing readers or written reasons. Sustain and end-reason counters in the engine (an identity engine change). Findings with stable ids. Experiment records. The assumptions block. The number headroom reader | M to L | 0 | Every target has a reader or a reason | A planted heal cut moves the sustain readers and nothing undeclared. A planted patch's report lists new, gone and unchanged findings correctly. The engine change is byte-identical on the subset | A counter cannot be added without a second statement in the settle. Then that reader is deferred and named |
| **3. Variants** | `slots.json`, `tests/rule-slots.mjs`, file overlays in the patch schema, candidate manifests, abstract scenarios with bindings. The six S seams and the two M seams. Two families for each of three slots, taken from `04-math-strategy.md` when it lands | L | 0, and `lane/rd-math` | The first report of two formula families on the same cells and dice | A copy overlay is byte-identical. A ratio armor and the shipped armor are played on the subset and the report shows where each wins, beyond noise. Two candidates on one slot are refused | A slot cannot be cut to a contract in one lane. The stat build is the risk. Then that slot uses git refs and the phase goes on without it |
| **4. New design** | The move resolver seam (M) with evolutions as rows. Build policies and the pinned build sample. The power budget table. Standing power as an axis. Bar policies. Lineup and single-job fours. Log-spaced Levels on projected grounds. Option tables and the acquisition model. The third seed domain. Dominance, synergy and stat weight readers. The SKETCH harness for the Danger scale, if an early look is wanted | L | 3, and the design lanes' choices | A first verdict on one rival pair, for example a ratio armor with a geometric step against today's curves, at Levels 20 to 5,000 | Adding a rolled-gear overlay with no options granted changes no combat die. The headroom reader fails a planted 5% a step family near step 750. One Trait played on a fitting and an unfitting ground reads differently beyond noise. A hero with no points allocated plays byte-identical to today. Two sibling branches of one move read differently beyond noise. A planted build that is 20% stronger is found by the build search and flagged by the dominance reader. The power budget check fails on a planted bonus row with no budget row | The engine batch for the Danger scale is not scheduled. Then the phase delivers gear and Levels only and says so |
| **5. Search** | Morris, Sobol on the survivors, the non-dominated sort, the pattern refine, the adversarial sweep, `lab search` | M | 1, 2 | The dozen levers that matter, ranked, with interaction strength | Index math matches the Ishigami answers. On the engine: move three levers off, ask the search to bring the targets back, and it returns within tolerance at tier 1 and holds at tier 3 | Tier 1 and tier 3 rank candidates differently (rank agreement under 0.7). Then search moves to tier 2 with a smaller budget |
| **6. Economy** | The account day and its ledger. The castle's sinks, labor and buffs, and the clan as a count of account days. Town work bound to the core's own functions. The wage formula as a slot. The played check on the local world. The market model only if a question needs it | L | 2, 3, and the wage formula | One account's day as a ledger of faucets and sinks | The composed day agrees with the same day played on `local-world.mjs` within a stated tolerance, and with the real ratio of 1.57 town hours a hunted hour (`calibration/c4.json`) | The composed day and the played day disagree by more than the tolerance. Then no gold target is graded and the gap is the next job |
| **6b. Arena** | The sides seam in the engine: side as a unit property, one enemy test, heroes running bars on either side, rewards off in an arena instance. Then arena cells, the matchup table and its readers | L for the engine batch (93 sites in 22 modules), then M in the Lab | 3, 4, and a combat batch slot | A matchup table for the eight ways at three Levels | Every PvE cell of the subset is byte-identical before and after the seam. A mirrored fight of two equal companies reads 50% inside its interval over the seeds. A planted x1.5 attack on one side wins beyond its interval | The seam cannot be made an identity change for PvE. Then it is redesigned before any arena number is read. The budget row for arena gear exists from phase 4 either way |
| **7. Gate** | The merge gate workflow, candidates side by side in `--compare`, v3 reading candidates, the optional MCP wrapper | S to M | 1, 2, 3 | A red check on a balance change with no record | A planted undeclared change to a balance file is refused by the gate. The same change with a record and a clean compare passes | Nothing. This is the cheap end |

**The order in one line.** 0, then 1 and 2 together, then 3, then 4 and 5 together, then 6 and 6b, with the gate pieces of 7 landing as soon as 1 and 2 exist. The first three phases need no design decision and can start now. Phase 3 is the first that waits on another lane.

## 6. Risks, and what is unknown

**Risks.**

| Risk | Why it matters | What holds it |
|---|---|---|
| The SKETCH harness becomes a second engine | It would break the one-engine rule by drift | It may rank, never set a number. It is labelled on every row and deleted with the engine batch. If that fence does not hold, do not build it |
| Overlays break on text anchors | Line edits against source text fail on any refactor | Depth 2 and 3 replace whole files at a slot. Line edits stay for numbers only |
| Seams change live combat | Every seam touches the engine players run | Each seam ships as an identity change, proven byte-identical, inside the combat batching rule |
| The harness is not real play | A clean result can be wrong for real players | Calibration is printed on every report. The known gaps are named in the assumptions block. The economy gets its own played check |
| Fixed bars hide the design's center | The fresh design says the bar is the build. A simulator with one bar a job cannot see that | Three bar policies, and lazy against best as an outcome |
| Runs cost too much | The full baseline is 24 GitHub shards. A search needs hundreds of points | Fidelity tiers, measured tier agreement, a budget printed before every run |
| The Lab grows into a project of its own | The owner asked for a place to understand the game, not for more tools | Each phase has a stop rule. Nothing in section 1's "will not build" list is started without a new decision |
| The builder grades the Lab | CLAUDE.md section 10 forbids it | The proofs in section 5 are planted faults with known answers, and the adversarial pass is another agent's |

**Unknown.**

1. **The math model.** `lane/rd-math` had not pushed when this was written. The formula families in phases 3 and 4 are examples until `04-math-strategy.md` names the real ones.
2. **The baseline's numbers.** `lane/bl-baseline` holds the spec (1,281 cells) and the tools at 311db8f61, but no pinned results file and no noise table yet. `lane/bl-sensitivity` holds its tools at 439e461a0 and no played data. Every claim here about noise is about the method, not a result.
3. **What a run costs.** I did not find a measured runner time for the baseline's tiers. Phase 0 measures it. The search budgets in section 3.6 are counts of points, not hours.
4. **How well pairing works.** Trajectories diverge after the first changed outcome, so the same dice stop meaning the same fight. The paired variance cut is unmeasured, most of all for long party hunts.
5. **Whether the stat build can be one slot.** `member.js`, `perks.js` and `vitals.js` are about 1,400 lines together, and I read their size and imports, not every path. The L could be larger.
6. **Whether the engine can emit the new counters inside the settle's one statement.** `02-architecture.md` assumes it can. Nobody has measured it.
7. **The mechflow claim that no hook can call external code.** I took it from the investigation and did not re-read that line. The verdict does not depend on it, since we import nothing.
8. **Whether the fresh design's mechanics are playable at the 100 ms step.** A wind-up that conditions can read, and pulls on readiness, are open questions in `02-architecture.md`. The Lab can measure them only after a branch exists.
9. **The luck flame.** Its only text on the set is `06-comparison.md` section 2.10, which judges an idea as relayed: Luck becomes Inner Flame, fed by burning creature remains at the hearth, and it raises rare-drop and Trait chances. No rules or numbers are written. This document treats it as a per-hero state that changes drop and Trait rolls, with a sink in the economy ledger, a budget row and a place in the build search. Its real rules may change that.
10. **The evolution rules.** A point every Level, thresholds, branches and banking are stated as a requirement. Their numbers, and which moves have trees, are not written. `02-architecture.md` removed Talents and moved arenas and the full castle to later, and the newer requirements reverse both. That document needs the same update.
11. **The sides count.** The 93 sites in 22 modules are the reading of `engine-checks.mjs --mm41`, which I did not re-run. The L for that seam is a judgment on that count.
12. **Other players.** No simulator here can know market prices or how real players will build. The market model is a model, and the Lab says so on every row it prints.

## 7. Credits

Ideas only. No code or data from any of these is used. mechflow (typed reads and writes, ghost edges, trace, budgets, findings, synergy, MCP surface). rAthena (the stat pipeline, damage stages, bonus vocabulary, option tables, override layer). zzstat (phase order, per-stat breakdown). GameMechanicLab (experiment records, paired comparison). game-balancing-difficulty-optimizer (intervals, assumptions block). game-systems-sandbox (the dice stream lesson). Path of Building (affix schema fields). bazaarBot (price beliefs). SALib and pymoo (the methods we would write ourselves: Morris, Sobol, non-dominated sorting).
