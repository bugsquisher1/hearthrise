# Systems intelligence: the plan (second issue)

Tyler's brief of 2026-11-21, "Project-Wide Systems Intelligence and Game Design Architecture", asks for nine deliverables before any code or gameplay change. This page is those nine. Nothing here changes the game. Nothing here is built yet.

**This is the second issue.** The first was reviewed cold in `01-review.md` (APPROVE WITH CHANGES, 19 changes, 6 blocking). All 19 are applied here. The last section lists what changed and the one place I do not accept the review's finding.

The code was read on `set/v0.2.144` at `10aaf639e` and again after merging the set at `2918fa07d` and later. Every finding is marked one of two ways.

- **CONFIRMED** means I opened the file or ran a command on this branch and saw it. The file and line follow.
- **HYPOTHESIS** means I believe it and say what would prove it.

Today's code is studied here only to learn what is true now. It is never used as a yardstick for the game we are designing.

## The short version

**Why audits keep missing things.** There is no machine-made list of what the game contains at the level where the numbers live. Every audit so far started from what an agent chose to read. The one coverage check we have works at the level of files and counts a file as covered when a pattern matches its name. The formula registers were typed by agents who read the code once, and nothing notices when the code under a row changes. Rulings have no ids, so no tool can tell whether code follows them. The labels on numbers are typed by whoever wrote the number.

**What I propose.** A census that reads the code and lists every function, typed number, table and server rule. Hand-written facts that are pinned to what the code actually outputs, so a change in behavior marks the fact stale and a cosmetic edit does not. A dependency map derived from the code. Labels and quote lines that the tool makes, so a number cannot be mislabelled or misquoted. Everything plugs into the balance-program tools that already exist.

**The first thing to approve is small.** One read-only script that stores nothing. It lists every top-level function in the rule code, says whether it holds a typed number and whether any register names it, and prints three numbers per folder. Its output sizes every later step. I ask for a yes on that slice first, and on the rest of the shape after its output is seen.

**One question for Tyler before the rulings step.** The Coordinator will put it to him. It is in section 3.4.

---

## 1. Current-state assessment: why the audits miss major factors

### 1.1 The root causes

The review confirmed all eleven.

| # | Root cause | Evidence | Status |
|---|---|---|---|
| RC1 | **No list of the game exists at the level where numbers live.** The inventory lists files, tables and function names. It does not list the functions inside a file or the numbers inside a function | `tools/balance-program/collect.mjs` lines 61 to 73 make one anchor a file. Only `src/data` files carry their export names, and only as search text | CONFIRMED |
| RC2 | **The formula registers cover a small share of the code and nothing measures the share.** By name match, they name 59 of 424 exported functions in `src/core`, 36 of 253 in `src/data`, 2 of 192 in `supabase/functions/hr-accrue` and 59 server function names out of 799 | Counted here and recounted by the review. 29 of 41 engine files are never cited, among them `tick.js`, `accrual.js`, `eat.js`, `vendor-sell.js` and `unlock-buy.js`. 18 to 20 core files are never cited, depending on the match rule, among them `hunt/conditions.js` (753 lines, the conditional automation), `hunt/movement.js`, `hunt-spawn.js`, `skill-sim.js`, `artisan-sim.js` and `farm.js` | CONFIRMED as a count. A register can describe a rule without naming its function, so the true share is somewhat higher. Nobody can say what it is, and that is the finding |
| RC3 | **A covered file is not a read file.** A system claims its anchors with a search pattern. A new file or server function that matches an old pattern is claimed without anyone looking at it | `systems.mjs` line 48: the `hunts` row is one pattern 1,313 characters long. Line 66: `fn:hr_hearth_(?!chest)` claims every hearth function that will ever be written | CONFIRMED |
| RC4 | **The registers are typed, and they are checked against themselves.** `combat-register.mjs --check` compares the JSON file to the rows typed in the same tool. It never opens the game. Two of the three registers have no tool at all | `combat-register.mjs` header: "a line number can go stale". No file under `tools`, `tests` or `.github` writes `formulas-progression.json` or `formulas-economy.json` | CONFIRMED |
| RC5 | **The one completeness check cannot gate anything.** It reads three inputs that are not part of a commit: the rulings and other memory files, and the list of unmerged lanes. So it is barred from CI. It is red on the set right now, and both reds are lanes | `inventory.mjs` lines 12 to 13. Run here: `RED inventory: 2 orphan(s)`. Of about 3,940 anchors, 886 come from memory and 816 are lane names. Its `--selftest` does run in CI, on planted data | CONFIRMED |
| RC6 | **Design intent has no ids.** Rulings are dated prose in Claude's memory. "Newest wins" is worked out again by every reader. No code line can point at a ruling and no tool can test one | `collect.mjs` line 39 reads the memory folder. Two partial copies exist in the repo: `30-decisions.json` (113 rows) and the `ruled` list of `62-decision-book.json` (49 rows) | CONFIRMED |
| RC7 | **Nothing links a change to what it invalidates.** A changed function does not mark a register row, a band, a simulator cell or a design statement as needing another look | `tools/lib/guard-deps.mjs` maps changed files to guards only | CONFIRMED by search |
| RC8 | **The simulator's heroes are written in the tools, and a cell can be described three ways.** The hero's bar, skills and later gear are authored under `tools/`, a second copy of "how a hero is set up" | Three describers: `progression-grid.mjs` `buildCell`, `measure.mjs` `refCell` and `tools/balance-sim/plans.mjs`. Two runners: `tools/balance-sim/cell.mjs` and `tools/balance-lab/lab-core.mjs`, held together by `parity.mjs`. Hero setup: `tools/balance-sim/played.mjs` (bars), `tools/balance-sim/skill-lines.mjs` (skills), `tools/balance-program/grid-kit.mjs` lines 70 to 71 importing the staged weapon and armor lines | CONFIRMED |
| RC9 | **Labels are typed by the writer.** No tool derives a label from how the number was made | `61-review-audit.md` line 39 (C2) and line 57 (H10) | CONFIRMED in the audit |
| RC10 | **Reports do not say what they read.** Scope cannot be checked before a report is used | The itemization plan is a source of record. It is cited 0 times in five of the eight phase-B reviews and once in the other three | CONFIRMED |
| RC11 | **Design documents pile up in layers.** Nothing marks an older sentence dead | `30-plan.md` line 29 and `27-retention.md` line 134 still carry a time frame that was ruled stale on 11-21. `44` section 6.1 and `51` section 3 disagree on which simulator faults are open | CONFIRMED |

### 1.2 The Coordinator's leads, checked

| Lead | Verdict | Where |
|---|---|---|
| 1. Truth is split across many places | CONFIRMED for the memory file, the two decision files, the balance-program documents, `standards.mjs` and the hand-written `systems.mjs`. NOT CONFIRMED for the two outside databases | `systems.mjs` line 2 says "hand-authored". It has drifted: line 267 still names the old slot prices and line 283 says Premium is per character |
| 2. Registers were written by hand | CONFIRMED. The two tools that "regenerate" re-print their own typed rows. The knob file is the exception: its numbers are checked against the tree | `architecture-register.mjs` lines 313 to 320 read each knob's source line. The cross-category edges are typed rows at its line 130. `44-formula-architecture.md` line 886 says so itself |
| 3. Agents read only part of what they needed | CONFIRMED for the itemization plan and for rulings left out of calls (`61` H6 to H13). The rest NOT CONFIRMED from the repo | RC10 |
| 4. Stale frames and withdrawn numbers spread | CONFIRMED | `61-review-audit.md` lines 38 to 60. RC11 |
| 5. The simulator did not measure the game | CONFIRMED as recorded, and partly out of date. `51` and book chapter 09 record three of the four named faults as fixed. I ran no cell. CONFIRMED from the code: the subset cache is 223 cells at 1 seed for 1 hour, and the full matrix cache does not exist | `51-baseline.md` lines 136 to 142. `matrix-plan.mjs` line 68 |
| 6. Code contradicted rulings | CONFIRMED on four of five: `xp-share.js` line 78, `tower.js` lines 141 to 157, `combat.js` line 391 against `wiki-model.js` line 126, and the gear line that exists only under `tools/balance-sim/staged`. For the rested bank I saw `member.js` lines 220 and 230 pass a zero. I did not trace the accrual side | As listed |
| 7. One synthesis agent | CONFIRMED that the cold audit found 5 critical and 14 high faults. The count of re-issues NOT CONFIRMED | `61-review-audit.md` |
| 8. Comparisons to the existing game crept in | NOT CONFIRMED from the repo | none |
| 9. Tooling side effects | CONFIRMED | `guard-deps.mjs` lines 56 to 62 |
| 10. Too many parallel lanes | CONFIRMED in volume: about 70 lanes named in merges on the set since 11-20. "18 at once" NOT CONFIRMED | `git log` |
| 11. Assets to build on | CONFIRMED present | section 3.7 |

### 1.3 What the leads missed

RC1, RC2, RC3, RC5, RC7 and RC9, and these:

- **The scenarios have one bar per role.** `tools/balance-sim/played.mjs` fixes each role's spells and rules. CONFIRMED.
- **Whole systems never enter a fight in the simulator.** The cell builders never mention imbuements, Bestiary charms, companions, Premium, potions or stamina. This is a word count in four files and the review could not re-verify it. HYPOTHESIS until the coverage step answers it.
- **The largest file in the engine has no register row.** `src/core/hunt/conditions.js`. CONFIRMED.
- **One number lives in two files.** The tier damage scale is typed in `src/core/combat.js` (`monsterDamageScaleByTier`) and again in `src/data/balance-sheet.js` line 340 (`DAMAGE_SCALE_BY_TIER`). CONFIRMED, and both are read: `combat.js` line 475 and `balance-sheet.js` line 365. Nothing holds the two tables equal that I found.

### 1.4 The Part 1 checklist against the code

The last column says how I know. **Opened** means I read part of the file in this work. **Listed** means the file exists and the status is copied from `systems.mjs`, which section 1.2 shows has drifted. Formulas, inputs, outputs, dependencies and tests for each system are what the census and the binding step produce. They are not on this page.

| Checklist entry | State | Source | How known |
|---|---|---|---|
| Levels, XP needs, XP rewards | Implemented | `src/core/xp.js`, `src/core/hunt/xp-share.js`, `src/data/hunt-xp.js` | Opened (`xp-share.js`) |
| Melee, Ranged, Magic, Defense | Implemented | `src/data/skills.js`, `src/core/skill-sim.js` | Listed |
| Prayer | No such system. The nearest is Inner Flame, a regeneration skill fed by bones | `src/data/hearth.js` | Listed |
| HP and mana growth | Implemented | `src/core/vitals.js` | Listed |
| Character attributes | No attribute stats were found. A blow reads a skill level and worn gear bonuses | `src/core/combat.js` lines 380 to 391 | Opened. Other files were not searched for attributes |
| Equipment requirements, equipment classes | Implemented | `src/data/gear-tiers.js`, `src/data/armour-weights.js`, `src/data/item-authority.js` | Listed |
| Physical damage, melee, ranged | Implemented | `src/core/combat.js`, `src/core/hunt/damage.js` | Opened |
| Magical damage, spells, healing, shielding | Implemented. A cast lands a share of its caster's own largest blow | `src/core/hunt/abilities.js` lines 376 to 392, `src/data/abilities.js` | Opened |
| Fist combat | Built, switched off | `src/data/fists.js` | Listed |
| Armor and element resistance | Implemented | `src/core/mitigation.js`, `src/core/elements.js` | Opened (function lists) |
| Critical hits | Implemented | `src/core/combat.js` lines 488 to 494 | Opened |
| Life and mana leech | Partly. Leech exists on abilities. Leech on worn gear is designed, not built | `src/core/hunt/abilities.js`, `src/core/hunt/heal-cut.js` | Opened by search |
| Regeneration | Implemented | `src/core/vitals.js` | Listed |
| Attack frequency and cooldowns | Implemented. One 2.0 s basic interval | `src/core/combat.js` `tickMs` | Opened |
| Targeting and aggro | Implemented | `src/core/hunt/targeting.js`, `src/core/hunt/roles.js` | Listed |
| Conditional automation | Implemented, never registered | `src/core/hunt/conditions.js`, `src/core/action-rules.js` | Opened (size and citations only) |
| Area damage | Implemented | `src/core/hunt/shapes.js`, `src/core/hunt/monster-spells.js` | Listed |
| Monster damage and defense | Implemented. One stat formula plus hand rows and a tier scale | `src/data/balance-sheet.js` lines 117 and 359, `src/data/monsters.js` | Opened |
| Grounds, monster mixes, spawning | Implemented to Level 110. Further regions staged or an idea | `src/data/hunt-grounds.js`, `src/data/grounds/*/pack.js`, `src/core/hunt-spawn.js` | Listed |
| Combat encounter simulation | Implemented. One engine | `src/core/combat-sim.js`, `src/core/hunt/pull-cycle.js`, `src/core/hunt/world-step.js` | Listed |
| Solo and party behavior, party composition | Implemented | `src/core/party-split.js`, `src/data/party-class-xp.js`, `src/data/hunt-roles.js` | Opened (`xp-share.js` reads the class table) |
| XP an hour, gold an hour, hunting efficiency, survivability | Not rules. They are outcomes. The pace target is a formula. The outcomes are read by the matrix | `src/data/balance-sheet.js` line 92, `tools/balance-program/matrix-metrics.mjs` | Opened |
| Supply usage | Implemented | `src/core/hunt/consumables.js`, `src/data/supply-basics.js` | Listed |
| Loot, rare drops, item drop sources | Implemented | `src/core/drops.js`, `src/core/hunt-rewards.js`, `tools/balance-program/sources.mjs` | Opened (function lists) |
| Stamina and offline accrual | Implemented | `supabase/functions/hr-accrue/accrual.js` | Listed |
| Death, Blessings, penalties | Implemented | `src/data/blessings.js` | Listed |
| Weapon and armor progression | Implemented to tier 7 | `src/data/gear-tiers.js` | Listed |
| Imbuements | Drop rows only. The file says imbuing is not built | `src/data/imbuements.js` line 25 | Opened |
| Consumables | Implemented | `src/data/supplies.js` | Listed |
| Smithing | Implemented | `src/data/recipes.js`, `src/core/artisan.js` | Listed |
| Woodcrafting | No such system. Woodcutting gathers. Crafting makes planks, bows and wands | `src/data/gathering.js`, `src/data/recipes.js` | Listed |
| NPC buying and selling | Implemented | `src/data/shops.js`, `hr-accrue/vendor-sell.js` | Listed |
| Marketplace | Implemented | 13 migrations name it | Searched |
| Currency creation and destruction | Implemented and journalled | the ledger table | Listed |
| Housing and gold sinks | Implemented | `src/data/homestead-tiers.js` | Listed |
| Premium, training, Bestiary | Implemented | `src/data/premium.js`, `src/data/training.js`, `src/data/bestiary.js` | Listed |
| Collections | An old collection log on the server with no caller | `systems.mjs` | Listed |
| Others the checklist does not name | The Tower, the Catacombs, the Hearth Chest, bosses, Call out, scaled hunts, Tempering, jewelry, trophies, patterns, farming, clans and castles, factions, companions, Town Works, live events | `systems.mjs`, 115 rows | Listed |

**Benefit:** names causes a tool can remove. **Complexity:** none, it is done. **Risk:** most statuses are Listed, not Opened. This table is the kind of list the plan replaces with a generated one.

---

## 2. Repository discovery plan: how coverage is proven complete

### 2.1 The rule

Coverage is a number a tool prints, never a sentence an agent writes.

### 2.2 The surfaces

The repo already has TypeScript and esbuild as development dependencies. TypeScript's parser reads plain JavaScript, so the census uses it and adds nothing.

I ran a scratch count with that parser to size the work. It stored nothing and is not the tool. A "typed number" here is any number in a function body other than 0, 1, 2, 100 and 1000. The rule for what counts is a choice, and the first slice settles it. All counts in this table are CONFIRMED by a command on this branch.

| Surface | Top-level functions | Not exported | Hold a typed number | Of those, named in a register |
|---|---|---|---|---|
| `src/core` | 681 | 234 | 45 | 8 |
| `src/data` | 519 | 221 | 51 | 13 |
| `supabase/functions/hr-accrue` | 254 | 62 | 53 | 3 |
| `supabase/functions/bug-report-bridge` | 12 | 7 | 2 | 0 |
| `src/session` | 638 | 346 | 107 | report only |
| `src/shell` | 1,811 | 878 | 134 | report only |
| `src/hunt-view` | 111 | 45 | 14 | report only |

The census lists **every top-level function, exported or not**. The Tower heat rule is `heatOpts` at `tower.js` line 144, which is not exported, and a census of exports would never see it. The review counted 143 private functions in core with a simpler match and 37 with a number under a wider rule. The two counts differ because of what each calls a function and a typed number. Both say the same thing: private functions hold rules.

The other surfaces:

| Surface | How it is listed | Count today |
|---|---|---|
| Content and tuning data | Every exported table in `src/data`, with its row count and, per field, how many rows set it (section 2.4) | 735 exported constants |
| Server rules | From the replayed database: functions, tables, client calls, triggers, views, row policies, scheduled jobs with their schedules, switches | 799 functions, 286 tables, 148 client calls, 28 jobs. Triggers, views and policies not yet counted |
| Server verbs | Every intent the engine accepts | 18 |
| Client to server | Every server function name that appears as text in `src/session` and the engine | the review counted 188 names in `src/session` |
| Generated catalogues | Every `tools/gen-*.mjs` and the data file and table it joins | 37 |

The three client folders are listed in **report mode only**, with their typed-number counts. The game's rules belong on the server and in `src/core`. A rule or number in the client is either display math or a leak, and the report is how a leak is seen. `wiki-model.js` showing a formula the engine does not run is the known example.

### 2.3 What "claimed" means, and what it costs

A function is one of four kinds: **formula** (computes a game number), **content**, **plumbing** or **presentation**.

The tool decides the default. Only a function that holds a typed number defaults to formula and needs a person. By the scratch count that is about 150 functions in the rule code (45 + 51 + 53 + 2), of which 24 are already named. A function that only reads a named constant is linked to that constant by the map in section 5 and needs no hand decision. So the hand work is on the order of 130 decisions, not a thousand. That number is from a scratch count with one rule for "typed number". The first slice prints the real one per folder, and the claim step is sized and approved from that print.

### 2.4 Special cases that are data rows

A census of functions cannot see an exception that is a row. A per-ground multiplier and a hand-typed monster are data. `src/data/balance-sheet.js` line 309 is a table of XP multipliers by ground, line 319 one of gold multipliers by ground, line 322 a table named `FORMULA_EXCEPTIONS` and line 487 one of tier overrides by ground. CONFIRMED.

So the content registry prints, for each table, each field and how many rows set it. A field set on a minority of rows is listed as an **override**. An override needs an exception row or a one-line reason. This is generated and needs no upkeep.

### 2.5 The checks that fail

1. A top-level function in the rule code that holds a typed number and has no kind.
2. A formula function with no formula row.
3. A server function that holds arithmetic and belongs to no formula row.
4. The count of typed numbers in rule code. It may only go down, the way `css-literal-ratchet` works.
5. A formula row whose function no longer exists.
6. An override field with no exception row or reason.

The inventory check is **split**. The code kinds (files, tables, functions, verbs, jobs) gate in CI, because they are a function of the commit. The lane and memory kinds stay a local report on the PC that has them. Moving the rulings into the repo removes one of the three outside inputs. It does not by itself make the old check run in CI.

### 2.6 The evidence of coverage

Every print and every report carries three numbers per folder: functions found, functions claimed, and facts whose pin is current. "Complete" is not a word a report may use.

**Benefit:** ends the class of miss where a rule was never opened. **Complexity:** low for the function census, since the parser is installed and the scratch version is under 40 lines. Medium for the server side and the field census. **Risk:** the rule for "typed number" is a judgement. Too wide and it is noise. Too narrow and it misses `+ 2`. It starts as a report so the rule can be tuned before anything turns red.

---

## 3. The proposed systems registry

### 3.1 Shape

No new top-level folder. Everything sits beside the files the plan already treats as registry parts.

```
tools/balance-program/
  systems.mjs            the system inventory (exists)
  standards.mjs          the balance targets (exists)
  formulas/*             the formula and exception rows (exist)
  matrix-plan.mjs        the scenarios (exists)
  rulings.jsonl          NEW, hand-written. Only if Tyler says yes (3.4)
  pins.jsonl             NEW, generated and committed. One line per pinned fact, sorted by id
  registry.mjs           NEW, the tool. Built in slices
```

**What is committed and what is not.** The census, the dependency map, the content registry and the lifecycle are never committed. They are a function of the commit and anyone gets them by running the tool. Two generated things are committed, because each is evidence a change has to answer for: the pins (3.3) and the simulator caches, which carry a fingerprint of their inputs as `progression-grid.mjs` already does. The first issue said "nothing generated is committed" and then stored fingerprints. That was a contradiction and this replaces it.

### 3.2 The nine parts the brief asks for

| Brief part | Where it lives | Generated or hand-written |
|---|---|---|
| 1. System inventory | `systems.mjs`, 115 rows | Hand-written. A row marked live must have a door a player can reach, which `inventory.mjs` already tests |
| 2. Formula registry | `formulas/*` rows | Meaning, class and ruling are hand-written. Location, constants and their values, callers and sample outputs are generated by calling the real function |
| 3. Dependency graph | the tool | Generated (section 5) |
| 4. Content registry | the tool, from `src/data` | Generated, with the field census of 2.4. `sources.mjs` already does this for items |
| 5. Gameplay lifecycle | the tool | Generated as three joined lists (3.5) |
| 6. Design decisions | `rulings.jsonl`, the design book, and ordinary tests for contradictions (3.4) | Hand-written. Reference checks are generated |
| 7. Balance targets | `standards.mjs`, 108 bands | Hand-written. Each band names the formulas it judges |
| 8. Known exceptions | exception rows in `formulas/*`, plus the generated override list | Class and reason are hand-written. A class 3 exception with no ruling id prints as "no approval on record" |
| 9. Uncertainties | the tool | Generated: unclaimed functions, stale pins, overrides with no reason, statements with no check, factors no scenario exercised |

### 3.3 How a fact stays true

**A fact is pinned to what the function outputs, not to its text.** The probes under `formulas/` already call real functions for sample values. For each formula row the tool calls the function on a few fixed inputs and stores the outputs in `pins.jsonl`.

- If an edit leaves every sample output the same, the fact stays current. Nobody does anything. A reworded comment or a tidy-up costs nothing.
- If an output moves, the lane's check prints the before and after. The lane writes one line saying why, in the same commit. The re-pin carries evidence: the old and new values are in the diff.
- A change in a function that this one calls moves the outputs too, so it is caught. A text fingerprint would miss it.
- A function that cannot be sampled, because it needs a whole hunt in memory, falls back to a fingerprint of its code with comments and spacing removed. The tool prints how many facts are on the fallback. That number is unknown until the binding step starts. HYPOTHESIS: most formula functions in `src/core` are pure, because the folder's rule is no clock, no random source and no page.
- A constant's value is never typed into a fact. The tool reads it live.

**Who writes.** The lane that changed the function writes the re-pin and its reason. The registry keeper reviews re-pins and writes new formula rows. The first issue said both "the lane re-pins" and "the keeper is the only writer". The first is the rule.

**Conflicts.** `pins.jsonl` is one line per fact, sorted by id, so two lanes touch the same line only when they change the same rule. When they do, the file is regenerated by its tool, never merged by hand, as the rules already say for JSON baselines.

**The honest cost.** A lane that changes what a rule outputs writes one line. A lane that adds a function with a typed number gives it a kind. Nothing else is hand upkeep. How often that happens is sized from the first slice's print.

### 3.4 Design intent beside implementation

**The repo is public.** So the question is what may be written into it.

Design intent is already public in this repo: the rules file with its dated rulings, and design briefs kept verbatim under `docs/design/`. What is not public today is everything else the memory rulings file holds beside game rules. Those lines never enter the repo.

The rulings step therefore imports **only lines that state a game rule**. The import drops every line that names a person other than Tyler, that concerns real money or spending, that carries any account detail, or that holds a link. Dropped lines are printed on the local screen for the Coordinator to see and are never committed. `said` keeps Tyler's words only where they are about the game.

**The one question, before the step runs:** "Your game rulings will be readable by anyone on GitHub. Yes or no." If the answer is no, the file lives outside the repo, the rulings stay a local input, and no CI benefit is claimed for them.

If yes, the file is `tools/balance-program/rulings.jsonl`, one ruling per line:

```
{ "id": "R-2026-11-08-03", "date": "2026-11-08", "said": "XP share rule applies regardless",
  "reading": "Every seat gets the same party share whatever its Level",
  "replaces": [], "systems": ["parties", "level"] }
```

- Append-only. A ruling that replaces another names it. "Current" is computed, so a superseded ruling cannot be quoted by accident.
- `said` and `reading` are separate fields. A reading is the Coordinator's and is marked as such wherever it prints, with `said` first. A reading an adversary disputes is flagged on the row. One wrong reading would otherwise reach every lane with the registry's authority.

**The design book connects through the ids it already has.** The nine chapters hold 958 lines that name a formula id, a knob or a call id (the review's count). The tool reads every chapter and fails on a name that does not exist: a formula id no register has, a knob that is gone, a call id the decision book does not hold. This is generated and asks nothing of the book's lanes. Whether every id in the book resolves today has not been tested.

**Contradictions are ordinary tests.** The first issue proposed a tag on every testable statement and a hand-kept row per tag. That is dropped as too heavy. A check is written only when an audit finds the code contradicting a ruling. It is a normal test under `tests/`, which the repo already knows how to run, prove and gate. The first three are the known ones: the hit formula's typed numbers, the Level-keyed party cut and the Tower heat. Each starts red in report mode and turns green when the build plan fixes it. Fixing them is a gameplay change and is not part of this plan.

The count of rule statements with no check is still printed. Documentation never overrides the code. Where they disagree the print shows both.

### 3.5 The lifecycle

The brief asks for a hunt "from character preparation to final rewards". Coverage of the simulator cannot give that alone, because the harness plays the settle with no database and Node's coverage records which functions ran, not their order. So the lifecycle is three joined lists, and the print says which part is static and which ran:

1. **The start path**, read from the server map: gear, bar and stock checks, the start intent, its stamina and gold checks.
2. **The fight**, from coverage: the set of rule functions that ran, grouped by the phase of the hunt the harness was in.
3. **The write path**, read from the server map: the reward write to the tables and the ledger.

### 3.6 What an agent reads

`brief <system>` prints one pack: the system's formulas with live constants and sample outputs, its dependents, the current rulings that touch it (`said` first), the bands that judge it, the scenarios that exercise it and its uncertainties. **The pack carries the text the agent must have, inline, sized to fit.** A pack too large to inline means the scope is too wide for one agent and is split. The pack never includes balance-program documents 00 to 62. Those are sources to be re-derived, not read as truth.

### 3.7 Built on, not beside

| Existing piece | Its role |
|---|---|
| `collect.mjs`, `inventory.mjs`, `systems.mjs` | The system inventory and its claim check. Split as in 2.5 |
| `formulas/*.json`, the two register tools | The formula and exception rows. Ids are kept. The typed `impl` strings become function bindings. The category files hold 131 formulas and 154 exceptions, and that is the size of the binding work |
| `formulas/knobs.json` | Already bound to source lines and checked. The model for every constant |
| `formulas/*-probe.mjs` | Already call real functions. They become the source of sample outputs |
| `sources.mjs`, `paths.mjs`, the atlas | The content registry for items |
| `standards.mjs`, `tests/balance-guard.mjs` | The targets and their guard |
| `balance-matrix.mjs`, `progression-grid.mjs` | The simulator |
| `tests/layering.mjs` | Its import reader is reused |
| `tests/schema-replay.mjs`, `schema-drift`, `live-hash-drift` | The replayed database is how server rules are listed |
| `tools/lib/guard-deps.mjs` | Stays the guard picker |

**Benefit:** one model every agent reads, current because most of it is generated and the rest is pinned to behavior. **Complexity:** high if built whole. The tool has a parser pass, an SQL reader, a sampler, a coverage reader, a label rule and a report reader. That is why it is built in slices and why the book tags and the hand-kept intent file were cut. **Risks:** sample inputs that miss the branch a change touched, so a pin stays green wrongly. The inputs are chosen per formula and an adversary can add one. And the public repo, which 3.4 answers.

---

## 4. Formula architecture assessment

### 4.1 The eight frameworks the brief names

"Seen here" means I opened the code. "From 44" means I read it in `44-formula-architecture.md` and did not check.

| Framework | One shared rule or several | Where | Basis |
|---|---|---|---|
| Physical damage | One. Every basic blow goes through one roll and one door for damage taken | `combat.js` `playerCombatRolls` line 391, `hunt/damage.js` `roll`, `blow`, `hurt`, `landHit` | Seen here |
| Magical damage | One. A cast lands a share of its caster's own largest blow, set per spell row. A spell does not read accuracy | `hunt/abilities.js` lines 376 to 392, `combat.js` line 387 | Seen here. That spells take no crit and no weapon bonus is from 44 |
| Healing | One, with one named exception. A heal or a shell is a share of the caster's blow. Mend is a share of max HP | `hunt/abilities.js` line 382, `hunt/heal-cut.js` | Seen here in comments and function names. The amount function in `src/data/abilities.js` was not read |
| Armor and resistance | One module each | `mitigation.js` `mitigate`, `elements.js` `elementPermille` | Seen here as function lists only. Bodies not read |
| Weapons | Expressed as data rows. Whether any weapon has its own code path | `src/data/gear-tiers.js` | Not verified. From 44 |
| Spells | Expressed as data rows with a share, a cost and effects | `src/data/abilities.js` | Seen here in part |
| Monster difficulty | Several. One stat formula, plus hand-typed rows, plus a tier damage scale typed in two files | `balance-sheet.js` lines 117, 340 and 359, `combat.js` `monsterDamageScaleByTier` | Seen here. The share of hand-typed monsters is from 44 |
| Ground rewards | Several. One reward generator, plus per-ground XP and gold multipliers, an exceptions table and tier overrides | `hunt-rewards.js` `rewardSwing`, `balance-sheet.js` lines 309, 319, 322 and 487 | Seen here |

### 4.2 Inconsistencies confirmed in code

| # | Inconsistency | Where |
|---|---|---|
| F1 | The hit formula uses numbers typed in place. The named constants with the same values are read only by the in-game wiki | `combat.js` line 391, `wiki-model.js` line 126 |
| F2 | A monster's damage scale depends on its tier through a hand table, and the table is typed twice | `combat.js`, `balance-sheet.js` line 340 |
| F3 | A Level-keyed party share cut is in the split after it was ruled out | `xp-share.js` line 78 |
| F4 | The Tower multiplies blows per floor after that was dropped by ruling | `tower.js` lines 141 to 157, in a function that is not exported |
| F5 | Gear has no rule past tier 7. The only gear curve is in a simulator folder | `tools/balance-sim/staged`, imported by `grid-kit.mjs` lines 70 to 71 |
| F6 | Each ground carries hand multipliers for XP and gold | `balance-sheet.js` lines 309 and 319 |
| F11 | The conditional automation has no formula rows | RC2 |

### 4.3 Hypotheses, taken from 44 and not verified here

- A tier's difficulty dial is applied three times.
- Spells cannot crit and take no weapon bonus, and no ruling says so.
- 118 of 190 monsters are typed by hand.
- Gold income is a formula and every sink is a list that ends.
- Kill reward has no term for how fast a ground's monsters die, which is why F6 exists.
- Some rule written once in JavaScript and once in SQL has no test holding the two together. `tests/core-curves.mjs` and `tests/vitals-armed-parity.mjs` hold some. No list says which twins exist.

### 4.4 Opportunities

44 proposes one framework per category and 28 ordered steps, and book chapter 09 carries that forward. I did not re-derive the model. Three points on how it should proceed:

1. **Bind before you change.** Each clean-up step starts after the formulas it touches are pinned and their dependents are generated.
2. **F1, F3 and F4 are the cheapest proof of the system.** Three tests, red in report mode on day one.
3. **Judge the architecture after the census.** 44's verdict rests on the share of code that was read. HYPOTHESIS: the conditional automation and the server tick hold more special cases than 44 counted.

**Benefit:** the clean-up gets a verified base. **Complexity:** none added. **Risk:** section 4.1 is thin where it says "not verified" or "function lists only". It is an honest map of what was read, not a finished assessment. The binding step finishes it.

---

## 5. Dependency mapping strategy

Six layers, derived from the code.

| Layer | How it is derived | Catches |
|---|---|---|
| 1. Imports | Every import, by name, with the installed parser | Which rule reads which table or helper |
| 2. Constants | First by name. Then by field, with alias tracking, because the knobs are fields of one object read through a local name (`combat.js` reads `b.monsterDamageScaleByTier`, the wiki reads `B.strengthLevelScale`) | What moves when a number moves. Without the field step, every reader looks dependent on all thirty fields |
| 3. Server | From the replayed database. Function names are matched as names. Table names are matched only after an SQL keyword that takes a table (`from`, `join`, `into`, `update`, `delete from`), because many table names carry no prefix and would match column names and comments. The unmatched remainder is printed | Which server rule reads or writes which table |
| 4. Twins | A formula row with one home in JavaScript and one in SQL. The tool fails a twin with no parity test | Rules written twice |
| 5. Runtime | Node's coverage while scenarios play | Functions that ran, and factors a scenario never exercised |
| 6. Client to server | Server function names found as text in `src/session` and the engine | Which screen or intent reaches a server rule |

### What the map cannot derive

`impact` prints this list with every answer, so it never reads as complete.

- Dependencies through data values: an item id in a drop row that is also a recipe input, a ground id in an unlock row. `sources.mjs` covers items only.
- Dependencies through stored state: one function writes a column and another reads it a day later.
- Dynamic SQL and trigger chains.
- Dependencies through the player: more gold changes what a player buys. Only the matrix shows those, and only for what its heroes do.
- Function overloads and whether every server function name is unique. Not checked.

### How the map is verified

- **Static against runtime.** A function that ran but has no path in the static map is a hole. It is printed.
- **Map against measurement.** The matrix sweeps each knob. A band the map says depends on a knob that never moves in the sweep, or a band that moves with no path in the map, is listed.
- **Against the hand-drawn map.** 44's 198 typed edges are compared once with the derived ones, then retired.

`impact <function or file>` prints the formulas that read it, their systems, the bands that judge them, the cells that exercised them, the rulings attached, the twins, and the list above.

**Benefit:** indirect effects stop depending on an agent's memory. **Complexity:** layers 1, 3 and 6 are low to medium and come first. Field-level constants are medium. Layer 5 is medium: the matrix plays many cells in each forked worker, and the environment setting writes coverage once per process, so coverage for one cell needs the inspector started and read inside `tools/balance-sim/worker.mjs` around each job. **Risk:** a name-level map shows dependencies that are not real. It errs toward more to check.

---

## 6. Simulation architecture

### 6.1 Who owns what

The design of the instrument is book chapter 09 section 2.4: the parts, the gate, the runs and the fault list with its order. Closing the simulator's open faults is that chapter's work and its owners' work. It is **not a step of this plan**. It is a dependency of the design review in section 8, because nothing about deaths, gold or total damage taken is quotable until the death rule, the store bill and the damage total are closed.

This plan adds four things to the instrument: labels the tool makes, quote lines, measured factor coverage, and a record of what each cell loaded.

The rule stays: every number comes from the real settle and the real engine, and no tool computes a combat value. One caution the review raised and I agree with: the harness rebuilds health between settles with its own constant regeneration rate (`cell.mjs` lines 10 to 12), and the staged gear lines are a second gear rule. Both are disclosed on results. Chapter 09's item for lowest health in the hunt tally closes the first at the source.

Faults this plan found that chapter 09 does not list:

| # | Fault | Status |
|---|---|---|
| S2 | The subset cache is 1 seed for 1 hour. The full matrix has never been run | CONFIRMED |
| S3 | Every role plays one fixed bar. No axis for spell and rule choices | CONFIRMED |
| S4 | No scenario records which rule functions it exercised | CONFIRMED by search |
| S5 | The Balance Lab runner's header describes a hero with every skill at its Level | CONFIRMED as text. Whether the code still does that is a HYPOTHESIS |
| S6 | The release guard and the older simulator describe cells their own way | CONFIRMED (RC8) |

### 6.2 The brief's Part 5 lists against the matrix

Most of this is good news the first issue did not report. "Present" means the id is in the `METRICS` list of `matrix-metrics.mjs` or an axis of `matrix-plan.mjs`. I read the lists, not the code behind each metric.

| Metric the brief asks for | State | Where |
|---|---|---|
| DPS | present | `dps`, `dpsHero` |
| Actual damage received | present. A four's total reads low per chapter 09 | `takenPerH` |
| Effective healing | present as healing an hour. Overheal is not separated, so "effective" is an estimate | `healPerH` |
| XP an hour | present | `levelXpPerH` |
| Gold an hour | present, an estimate while the store bill fault is open | `netPerH` |
| Supply consumption | present | `suppliesPerH`, `storePerH` |
| Kill rates | present | `killsPerH`, `ttkS` |
| Death frequency | present, an estimate while the death rule fault is open | `deathsPer1000h` |
| Dangerous HP events | present, rebuilt by the harness between settles | `lowHpTypical`, `lowHpP10`, `hpUnder30`, `hpUnder10` |
| Equipment upgrade efficiency | present as gear-step cells by slot class. No single metric | `matrix-plan.mjs` step blocks |
| Solo against party efficiency | cells present. No band, by the ruling of 11-21 | lone and four cells |
| Long-term progression pace | present, computed | `hoursPerLevel`, `xContract` |

| Axis the brief asks for | State |
|---|---|
| Low, mid and high Level characters | present: 31 checkpoints to 400, plus 1,000, 2,000 and 5,000 |
| Future milestones | present, labelled as projected past Level 185 |
| All combat styles | present: every key of the styles table |
| Solo hunting, four-character parties | present |
| Multiple equipment configurations | present: low, mid, best in slot, and steps by slot |
| Multiple monster archetypes | present as a summary axis (role, shape, class). Not verified beyond the name |
| Grounds of different difficulty | present: every ground at both ends of its band, three tiers |
| Spell and rule configurations | **absent** |
| Short and long hunts | present in the plan: 1 hour, 2 hours and chapter 09's death run of 8 hours. Only the 1 hour subset has been run |

### 6.3 What each scenario models

From reading the builders. The coverage step replaces it with a measured table.

| Factor | State | Note |
|---|---|---|
| Level | modeled | |
| Skills | approximated | career lines, then the skill the curve allows. No training hours |
| Weapon and equipment | modeled to tier 7, then a proposal | staged lines |
| Imbuements | missing | not built in the game |
| Spells and rule priorities | approximated | one fixed bar per role |
| Regeneration | modeled by the engine | the harness's health trace is approximate |
| Consumables, gold profit | approximated | store bill fault |
| Cooldowns, enemy stats, spawns, targets | modeled | seat shares calibrated on one real four, per `51` |
| Damage, kill rate, XP | read on the real engine | |
| Loot and rare drops | not verified by me | |
| Stamina | missing | no stamina metric |
| Death risk | approximated | death rule fault |
| Party interactions | modeled for a four | |
| Long-term progression | computed | never played end to end |
| Blessings, charms, companions, Premium, food buffs, House perks, events | missing or unverified | word counts only |

### 6.4 Labels, quotes and the gate

**Four labels, and the tool assigns them.** The book's MEASURED keeps the meaning the book gives it. The stricter state gets its own word, so no chapter has to be relabelled.

| Label | Assigned when |
|---|---|
| CALIBRATED | read on the real engine, and the cell's class has a calibration cell within tolerance of real play, with enough seeds for the metric |
| MEASURED | read on the real engine. This is the book's meaning |
| COMPUTED | arithmetic on other numbers or on data rows. The inputs are listed |
| ASSUMED | any input was typed by a person |

A number with an assumed input can never print above ASSUMED. Today almost nothing can be CALIBRATED, because real play exists for one kind of party. The label says so.

**The quote line.** `quote <cell> <metric>` prints one line: the number, its label, seeds, hours and commit. A number in a report or a status is a pasted quote line. A number worked out by hand from two cells lists the quote lines it came from and is always COMPUTED.

**Seeds.** A diff plays the same cells on the same dice before and after. A risk measure needs at least 4 seeds and reports the spread.

**Before and after.** `--diff` already flags IMPROVED, REGRESSED and UNINTENDED against the bands. Chapter 09 makes it the gate for a balance change.

**What to rerun.** Each cell records the rule functions it exercised and the content ids it loaded (ground, monsters, items, spells). A change to a leaf rule stales the cells that ran it. A change to a content row stales the cells that loaded that id. A change to a core combat function that every cell runs stales everything, and no saving is claimed there. No CI cost claim is made until this is measured.

**Benefit:** numbers that mean what their label says and cannot be misquoted. **Complexity:** low for labels and quotes, which need cell metadata only. Medium for per-cell coverage. **Risk:** calibration needs real play that does not exist for most party kinds.

---

## 7. Agent coordination

### 7.1 The roles

Discovery and dependency tracing become a tool. Four roles are left.

| Role | Who | What it does |
|---|---|---|
| Registry keeper | systems engineer | Keeps the tool green. Writes new formula rows. Reviews the re-pins lanes write |
| Measurer | one balance lane | Runs the matrix and owns calibration. The only source of numbers |
| Designer | game designer | Proposes additions, removals and redesigns from brief packs and quote lines |
| Adversary | a cold reviewer | Reads a finished report with the registry beside it and tries to break it. Never the author |

Integration is the Coordinator, and it is a join by id, not a re-telling.

**The lane cap is the existing rule: three to four agents at once, in total.** An adversary counts as one of them. So a round is at most three finding lanes and one adversary. The first issue's "one adversary per two" would have meant six, and the existing rule wins.

### 7.2 How a report is accepted

A report ends with four fields. `accept <report>` checks them.

| The report states | The tool checks |
|---|---|
| The commit its brief pack was made at | Current, or the tool lists every ruling and function changed since that touches the report's systems |
| The systems in scope | It lists every system that depends on them and is not in scope. Those go under "not analyzed" |
| Its numbers, as pasted quote lines | Each line matches the cache exactly. A number with no quote line is UNSOURCED. A citation of balance-program documents 00 to 62 is flagged as a source to re-derive |
| For each recommendation, what it would change, and the rulings it rests on by id | It prints the dependents from the map. Each must show a diff or be listed as not verified. It lists newer rulings on the same systems that the report did not cite |

There is no "sources read in full" field. A typed list checked against another typed list proves nothing. The brief pack carries the text inline instead (3.6).

### 7.3 What this stops and what it does not

Judged against the failures of 11-20 and 11-21.

| Failure | Stopped | How, and the limit |
|---|---|---|
| Partial reads | Mostly | The pack is the reading and it is inline. An agent can still skim it. The adversary is the check on that |
| Stale numbers | For new reports | Numbers are quote lines tied to a commit. The older layered documents stay in the tree and are flagged when cited, not fixed |
| Mislabelled evidence | Yes | The label is the cell's own. A hand-derived number is always COMPUTED |
| Circular agreement | Partly | Findings join by id, and two findings that share a source show the same id. A wrong reading of a ruling can still spread, which is why `said` prints first and a disputed reading is flagged |
| Numbers reaching Tyler unchecked | By discipline only | The Coordinator's messages are chat, not files a tool gates. The rule is that a number in a status is a quote line. No tool enforces it |

### 7.4 "Not analyzed" is generated first

The union of: dependent systems out of scope, factors the cited scenarios did not exercise, numbers below CALIBRATED, the map's known blind spots from section 5, and rule statements with no check. An agent may add lines. It may not remove one without a reason on the line.

### 7.5 Four rules

1. **At most four agents at once, one of them an adversary.**
2. **A number in a status to Tyler is a quote line.** This is discipline, not a gate.
3. **No synthesis by re-telling.** Sources are combined by id in a table.
4. **A new ruling re-pins running lanes.** Reports made at an older commit are flagged with the new rulings that touch their systems.

**Benefit:** scope and numbers are checked by a tool before a person relies on them. **Complexity:** low. **Risk:** the adversary is still the only check on reading and reasoning. The agent definitions are the Coordinator's to change. This plan does not touch them.

---

## 8. Design review framework

Every addition, removal, merge or redesign is judged on one card with Tyler's eight criteria.

| Criterion | Filled by | Evidence |
|---|---|---|
| 1. Player experience and strategic depth | designer, and a playtest when fun is the question | a blind play session. A tool cannot answer this and the card says so |
| 2. Interaction with existing mechanics | `impact` | the dependents, with the map's blind spots printed |
| 3. Mathematical and balance consequences | the matrix | a `--diff` as quote lines |
| 4. Economy implications | the sources and sinks tools (`sources.mjs`, `gold-model.mjs`) | gold in and out. I read those tools by header only, so whether they can fill this is a HYPOTHESIS |
| 5. Long-term progression impact | the grid's pace tables | hours to each checkpoint, COMPUTED |
| 6. Development and upkeep cost | the registry's own diff | formulas, exceptions, overrides and constants added or removed |
| 7. Unintended consequences | the UNINTENDED flags, and the adversary | bands that moved and were not the target |
| 8. Evidence | the labels | how many numbers behind the call are CALIBRATED, MEASURED, COMPUTED and ASSUMED |

Rules: one recommendation with its reason. Removal is judged on the same card, and a thing planned for later is not a removal candidate, by the ruling of 11-21. A criterion with no evidence says "no evidence". The proposal is judged against the bands and the rulings. Nothing on a card is built until Tyler says yes.

The whole-game review of the brief's Part 6 runs through these cards. It starts when the systems under review have no unclaimed formula function, and when chapter 09's open faults are closed for the metrics the card uses.

**Benefit:** design calls arrive with their consequences traced. **Complexity:** low once the earlier steps exist. **Risk:** criterion 1 has the weakest evidence in a game with few players. The card shows that.

---

## 9. Prioritized roadmap

The order is the review's. Sizes are my estimates and are ASSUMED until step A prints its counts. S is under a day for one lane. M is one to three days. L is more, and is split before it starts.

| Step | What | Size | Benefit | Risk |
|---|---|---|---|---|
| **A** | **The first slice.** One read-only script. No new folder, no hand-written file, nothing stored. It lists every top-level function in `src/core`, `src/data` and the engine, says whether it holds a typed number and whether a register names it, and prints three numbers per folder plus the unnamed list. The client folders print a typed-number count only | S | Proves or kills the sizing of everything after it. Cannot rot | The rule for "typed number" needs tuning. That is what the slice is for |
| A2 | The slice's count enters CI as a number that may only go down. The inventory check is split so its code kinds gate in CI | S | New rule code cannot land unlisted from this point on | A lane adds a number for a good reason and must raise the count with a why. That is the intended friction |
| B | Labels and the quote line on matrix cells | S | The direct answer to mislabelled and misquoted numbers. Needs cell metadata only | The calibration classes must be written down once |
| C | Rulings into the repo, game rules only. **After Tyler answers the question in 3.4** | S to M | Ends "which ruling is current" | A reading copied wrong. `said` is kept verbatim beside it |
| D | Bind the 131 formulas and 154 exceptions to functions, pinned on sample outputs | M to L, split by register | Rows cannot drift silently | How many functions cannot be sampled is unknown |
| E | The dependency map. Layers 1, 3 and 6 first, then field-level constants. Compare with 44's edges | M | Consequences of a change in one command | False edges. Blind spots are printed |
| F | Claim the unregistered rule code, one folder at a time, sized from step A. Includes the field census for overrides | M per folder | Closes the largest blind spots: the automation, the tick, eating, selling, unlock buying | Finds more special cases than 44 counted. That is a result |
| G | Per-cell coverage and loaded content ids | M | "What was modeled" is measured. Stale cells are known | Needs a change inside the simulator's worker |
| H | The book reference check, and the three contradiction tests under `tests/` | S | A dead id in the book is a red. Known contradictions are visible until fixed | None of note |
| I | `accept`, `brief` and `impact` as commands over the above | M | Reports are checked before use | Header creep. Four fields |
| J | The first whole-game design review through the cards | by scope | The Part 6 review on verified ground | Starting before D to G, or before chapter 09's faults close, would repeat 11-20 |

**Not on this roadmap:** closing the simulator's faults. Chapter 09 section 2.4.4 owns it and orders it. Step J depends on it.

**What I ask Tyler to approve now:** step A alone. The rest of the shape after its output is seen.

---

## Step A reading: the first census

Tyler approved step A alone on 2026-11-21. It is built as `tools/balance-program/census.mjs`. It is read-only and stores nothing: no registry file, no baseline, no cache. Its `--selftest` plants an uncited function and a typed number in memory and proves each shows up, and it runs in CI.

Every number in the two tables below is **MEASURED**: counted by `node tools/balance-program/census.mjs` on commit `d7c672a23` of `lane/d-systems-intelligence`, whose rule code is that of `set/v0.2.144` at `a1c7b7ab6`. Here MEASURED means counted by the tool on the tree. No hunt was played.

**The three numbers for each folder.**

| Folder | Functions found | Hold a typed number | Of those, named in a register |
|---|---|---|---|
| `src/core` | 681 | 45 | 8 |
| `src/data` | 519 | 51 | 13 |
| `supabase/functions/hr-accrue` | 254 | 53 | 3 |
| All rule code | 1,454 | 149 | 24 |

Behind them: 234, 221 and 62 of those functions are not exported. The registers name 120, 123 and 6 functions at all. The functions hold 75, 107 and 177 typed numbers.

**The client, typed numbers only.**

| Folder | Functions found | Hold a typed number | Typed numbers |
|---|---|---|---|
| `src/session` | 638 | 107 | 164 |
| `src/shell` | 1,811 | 134 | 260 |
| `src/hunt-view` | 111 | 14 | 30 |

**The gap.** 125 functions hold a typed number and no register names them. The files that hold the most such numbers are `hr-accrue/intents.js` (19), `hr-accrue/hunt-settle.js` (17), `hr-accrue/tick-gather.js` (17), `src/data/library2-items.js` (15) and `hr-accrue/set-activity.js` (15). `--list` prints all 125 with file, line and numbers.

**What the reading says.** These three points are my reading of the list, not counts by the tool. The sort into kinds was a scratch pass over the tool's output and is COMPUTED.

1. **About half of the 125 are not game numbers.** By kind: about 26 engine functions hold only web status codes, about 15 data functions are validators holding bounds, about 11 hold hash or id constants, about 8 hold only unit conversions such as milliseconds in an hour, and 2 hold only a rounding epsilon. That leaves about 63 to read: 22 in core, 20 in data and 21 in the engine. Many of the engine's 21 are string lengths and token sizes.
2. **The rule for a typed number needs one more exclusion list before it can be a ratchet.** Status codes, hash constants and unit conversions should not count. Validators need their own kind. This is the tuning step A was for. It is a small change and it waits for step A2's approval.
3. **Most tuning numbers are not inside functions at all.** Core holds only 75 typed numbers in 45 functions. The game's dials live in named constants and data tables, which a function census does not see. So the hand work on functions is small, around 60 decisions and not the 130 the plan estimated. The larger unknown moves to the constants and the fields of the data tables, which is the field census of section 2.4. Step F should be sized on that, and the field census should come before the function claims.

Real rule numbers the list did surface, as examples to read: the companion XP curve (`companion-perk.js` line 71, 50 and 1.18), tool bonuses (`tools.js` lines 38 and 43, 0.02), the action interval (`pacing.js` line 110 and two twins in `skill-sim.js` and `artisan-sim.js`, all 3000), tank positions (`hunt/roles.js` line 210) and a status tick (`hunt/status.js` line 73, 500). None of them is named in a register.

**Limits of this reading.** A name can match a register by accident, so the unnamed list is a floor. Functions nested in others count into their parent. Class and object methods are not listed. Server SQL is not read. The Tower heat function is listed (`tower.js` `heatOpts`, line 144, private, and a register does name it) but holds no typed number of its own, because its numbers come from a data row. That is point 3 again.

---

## How it stays current

| When this changes | This happens |
|---|---|
| A rule function, with no change in what it outputs | Nothing. The pin is still true |
| A rule function, with a change in output | The lane's check prints before and after. The lane writes one line why. `impact` names what is downstream |
| A constant | Nothing to update. The value is read live. Cells that ran its readers are stale |
| A content row | The content registry regenerates. Cells that loaded that id are stale. A new minority field shows as an override |
| A new function with a typed number | The ratchet count rises and the lane's check is red until it has a kind |
| A server function | The replay lists it. Live drift stays under `live-hash-drift` |
| A ruling | One line appended. Reports made at an older commit are flagged |
| A formula id, knob or call id named in the book | The reference check is red if it no longer exists |
| An old document that quotes an old number | Not fixed by this plan. It is flagged when a new report cites it |
| The record of approved changes | The git history of the rulings file, the formula rows and the pins |

Where it runs: the lane's own tests, `smoke.yml` on every push for the fast checks, the existing replay job for the server side, and the nightly for the matrix.

---

## What changed from the first issue

| Review change | What was done |
|---|---|
| 1. Privacy | The repo is public. The rulings step imports game rules only, drops and locally prints the rest, and waits for one yes or no from Tyler. Sections 3.4 and step C |
| 2. Split the inventory check | Code kinds gate in CI. Lane and memory kinds stay local. RC5 and 2.5 reworded |
| 3. Every top-level function | The census is no longer exports only. Counts in 2.2 |
| 4. Feasibility | The installed TypeScript parser is used. Coverage gives a set, not an order. Per-cell coverage is rated medium and needs worker changes. Table names are matched after SQL keywords |
| 5. Upkeep | Sized from a scratch count: about 150 functions hold a typed number. Pins are on sample outputs. Lanes re-pin, the keeper reviews. The three contradictions are resolved in 3.1 and 3.3 |
| 6. Labels | MEASURED keeps the book's meaning. The stricter state is CALIBRATED |
| 7. Data-row special cases | The field census and override list, 2.4 |
| 8. Missing surfaces | Client folders in report mode, the second edge function, triggers, views, policies, job schedules, and a client-to-server layer |
| 9. What the map cannot derive | Listed in section 5 and printed by `impact` |
| 10. Lifecycle | Three joined lists, 3.5 |
| 11. Eight frameworks | Table 4.1. The unverified items moved under a HYPOTHESIS heading |
| 12. Checklist | Ten rows added and a "how known" column, 1.4 |
| 13. Part 5 metrics and axes | Tables in 6.2 |
| 14. Rerun only stale cells | Limited to leaf rules and content rows. Cells record content ids. The CI cost claim is withdrawn |
| 15. Book link | Reference check only. Tags and the intent file are dropped. Contradictions are ordinary tests |
| 16. `accept` | Four fields. Inline packs replace the "read in full" field. Quote lines. `said` before `reading`. Old documents flagged. Rule 2 is named as discipline |
| 17. Roadmap | Reordered. The simulator faults are handed to chapter 09. Every step sized |
| 18. First slice | Step A |
| 19. Corrections | Tool size rated high. 131 and 154. 1,313 characters. Folder names. Chapter 08. The lane cap. No new top-level folder |

**One finding I do not accept.** The review marks as false my quote from `44` that its cross-category edge list was written by hand. The sentence is in that file at line 886, in section 9. The review's added pointer to `architecture-register.mjs` line 130 is right and is now cited beside it.

**One count the review and I differ on.** Private functions in core: 143 by the review's match, 234 by the parser, which also counts functions assigned to a constant. Functions holding a number: 37 against 14, because my rule ignores 0, 1, 2, 100 and 1000. Step A fixes one rule and one count.

---

## Not analyzed

- **The design book.** I read the label legend of chapter 01 and section 2.4 of chapter 09. Chapters 02 to 08 were not read. Chapter 00 is not on the set. Whether every id in the book resolves to a register row was not tested.
- **The simulator.** No cell was run, by me or by the review. Every statement about its faults and their fixes was read, not measured.
- **Function bodies in several frameworks.** Mitigation, elements, drops and the spell amount function were read as lists of function names or comments. Section 4.1 says where.
- **44's unified model.** Not re-derived.
- **The server engine.** Counted and listed. `tick.js`, `accrual.js` and `intents.js` were not read.
- **The database.** Inventory counts only. No function body was read. Triggers, views and policies were not counted. Function overloads and name uniqueness were not checked.
- **The client.** Counted by the scratch census. One line of the wiki was read.
- **The economy tools.** Read by header only. Whether they can fill criterion 4 is not judged.
- **How many formula functions can be sampled.** Unknown until the binding step.
- **The rulings file.** I read its first 106 lines and the headings of the rest. No line-by-line list of what must be withheld was made. The import prints that list locally when it runs.
- **Git history.** Not searched for sensitive lines already published.
- **Production, and the two outside databases.** Not read.
- **Cost in CI minutes and tokens.** Not measured. Step sizes are estimates.
- **The scratch census.** It counts top-level functions and typed numbers under one rule. It does not see functions nested in other functions as separate entries, numbers in data tables, or server SQL.
