# Systems intelligence: the plan

Tyler's brief of 2026-11-21, "Project-Wide Systems Intelligence and Game Design Architecture", asks for nine deliverables before any code or gameplay change. This page is those nine. Nothing here changes the game. Nothing here is built yet.

Read on `set/v0.2.144` at `10aaf639e`. Every finding below is marked one of two ways.

- **CONFIRMED** means I opened the file or ran the tool on this branch and saw it. The file and line follow.
- **HYPOTHESIS** means I believe it and say what would prove it.

Today's code is studied here only to learn what is true now. It is never used as a yardstick for the game we are designing.

## The short version

**Why audits keep missing things.** There is no machine-made list of what the game contains at the level where the numbers live. Every audit so far started from what an agent chose to read. The one coverage check we have works at the level of files, runs only on Tyler's PC, and counts a file as covered when a pattern matches its name. The formula registers were typed by agents who read the code once. They name 59 of the 424 exported functions in `src/core` and 2 of the 192 in the server engine. Nothing notices when the code under a register row changes. Rulings live outside the repo with no ids, so no tool can tell whether code follows them. The simulator has three front doors and its labels are typed by hand.

**What I propose.** One small tool, `tools/registry.mjs`, and one small folder of hand-written intent, `registry/`. The tool reads the code, the data and the replayed database and lists every symbol, constant, table and server function. The hand-written part says what each one means and which ruling it serves. Each hand-written fact is bound to the code it describes by a fingerprint, so a change to the code marks the fact stale and names everything downstream. The existing balance-program tools stay where they are and plug in.

**The first three steps** are cheap and independent: put the rulings in the repo with ids, build the symbol census in report mode, and finish closing the simulator's known faults. Section 9 has the full order.

**What I need from you.** A yes or no on the shape in section 3, and on the four agent rules in section 7.

---

## 1. Current-state assessment: why the audits miss major factors

### 1.1 The root causes

Eleven causes. The first four do most of the damage.

| # | Root cause | Evidence | Status |
|---|---|---|---|
| RC1 | **No list of the game exists at the level where numbers live.** The inventory lists files, tables and function names. It does not list the functions inside a file or the numbers inside a function | `tools/balance-program/collect.mjs` lines 61 to 73 make one anchor a file. Only `src/data` files carry their export names, and only as search text | CONFIRMED |
| RC2 | **The formula registers cover a small share of the code and nothing measures the share.** They name 59 of 424 exported functions in `src/core`, 36 of 253 in `src/data`, 2 of 192 in `supabase/functions/hr-accrue`, and 59 server function names out of 799 | Counted on this branch by matching every export name against the five register files. 18 core files are never cited at all, among them `hunt/conditions.js` (753 lines, the conditional automation), `hunt/movement.js`, `hunt-spawn.js`, `skill-sim.js`, `artisan-sim.js` and `farm.js`. 29 of 41 engine files are never cited, among them `tick.js`, `accrual.js`, `eat.js`, `vendor-sell.js` and `unlock-buy.js` | CONFIRMED as a count. A register can describe a rule without naming its function, so the true share is somewhat higher. That gap is itself the finding: nobody can say what the share is |
| RC3 | **A covered file is not a read file.** A system claims its anchors with a search pattern. A new file or server function that matches an old pattern is claimed without anyone looking at it | `tools/balance-program/systems.mjs` line 48: the `hunts` row is one pattern about 1,500 characters long. `fn:hr_hearth_(?!chest)` on line 66 claims every hearth function that will ever be written | CONFIRMED |
| RC4 | **The registers are typed, and they are checked against themselves.** `combat-register.mjs --check` compares the JSON file to the rows typed in the same tool. It never opens the game. Two of the three registers have no tool at all | `combat-register.mjs` header: "A row is evidence a person read (file:line at set/v0.2.144 e6ea19170), so a line number can go stale". No file under `tools`, `tests` or `.github` writes `formulas-progression.json` or `formulas-economy.json` | CONFIRMED |
| RC5 | **The one completeness check cannot gate anything.** It needs Tyler's memory folder and the local lane list, so it is barred from CI. It is red on the set right now | `inventory.mjs` header: "A LOCAL run, on the PC that holds Tyler's memory folder and the lane refs: never a CI step". Run here: `RED inventory: 2 orphan(s)`. 885 of its 3,940 anchors come from outside the repo | CONFIRMED |
| RC6 | **Design intent has no ids and no home in the repo.** Rulings are dated prose in Claude's memory. "Newest wins" is worked out again by every reader. No code line can point at a ruling and no tool can test one | `collect.mjs` line 39 reads `~/.claude/projects/.../memory`. The rulings file is 516 lines with superseded text mixed in. Two more partial copies exist in the repo: `30-decisions.json` (113 rows) and the `ruled` list of `62-decision-book.json` (49 rows) | CONFIRMED |
| RC7 | **Nothing links a change to what it invalidates.** A changed function does not mark a register row, a band, a simulator cell or a design statement as needing another look | `tools/lib/guard-deps.mjs` maps changed files to guards only. No tool maps a symbol to formulas or cells | CONFIRMED by search |
| RC8 | **The simulator has three front doors and its heroes are written in the tools.** Three builders feed the engine. The hero's bar, skills and later gear are authored under `tools/`, which is a second copy of "how a hero is set up" | `tools/balance-sim/cell.mjs`, `progression-grid.mjs` `buildCell`, and `tools/balance-lab/lab-core.mjs` line 17 calling `accrueHunt` directly. `played.mjs` (bars), `skill-lines.mjs` (skills), `grid-kit.mjs` lines 70 to 71 importing `tools/balance-sim/staged/weapon-line.js` and `armor-line.js` | CONFIRMED |
| RC9 | **Labels are typed by the writer.** MEASURED, COMPUTED and HYPOTHESIS are words an agent puts beside a number. No tool derives the label from how the number was made | `61-review-audit.md` line 39 (C2): a death claim built from an assumed count was labelled MEASURED. Line 57 (H10) is the same fault | CONFIRMED in the audit. The fix in section 6 makes the label a computed field |
| RC10 | **Reports do not say what they read.** A report carries no list of sources read in full, no registry version and no list of what was left out. So scope cannot be checked before the report is used | The itemization plan is a source of record. Counted on this branch: it is cited 0 times in five of the eight phase-B reviews and once in the other three | CONFIRMED |
| RC11 | **Design documents pile up in layers.** Documents 00 to 62 each correct the ones before. Nothing marks the older sentence dead, so stale numbers stay quotable | `30-plan.md` line 29 still says "Krell at about month 4". `27-retention.md` line 134 says "month 4 to 6". Both were ruled stale on 11-21 | CONFIRMED |

### 1.2 The Coordinator's leads, checked

| Lead | Verdict | Where |
|---|---|---|
| 1. Truth is split across many places, some outside the repo | CONFIRMED for the memory file, the two decision files, the 20 balance-program documents, `standards.mjs` and the hand-written `systems.mjs`. NOT CONFIRMED for the Rulings page database and the Build Plan tracker database, which I cannot reach from the repo | RC6. `systems.mjs` line 2 says "hand-authored". It has also drifted: the `hero-slots` row is still named "(300k, 750k, 1.5M)" and the `premium` row says "per character" |
| 2. Registers were written by hand and can drift | CONFIRMED, and it is worse than the lead says. The two tools that "regenerate" only re-print their own typed rows. The knob file is the exception: its numbers are checked against the tree | RC4. `architecture-register.mjs` line 317 reads each knob's source line. `44-formula-architecture.md` section 9: "The cross-category edge list was written by hand" |
| 3. Agents read only part of what they needed | CONFIRMED for the itemization plan (counts in RC10) and for rulings left out of calls (`61` H6 to H13). NOT CONFIRMED from the repo: that the Game Director was blind to 22-4, and that one audit never read brief 45 | RC10 |
| 4. Stale frames and withdrawn numbers spread | CONFIRMED | `61-review-audit.md` lines 38, 39, 48, 50 and 53 to 60. RC11 for the month-four rows that are still in the tree |
| 5. The simulator did not measure the game | CONFIRMED as recorded in `44` section 6.1 (faults V1 to V4) and `51-baseline.md`. I did not re-run the harness. `44` section 9 says its author did not either. CONFIRMED by me from the code: the subset cache is 223 cells at 1 seed for 1 hour, and `balance-matrix.json` (the full run) does not exist on the set | `balance-matrix-subset.json` fields `seeds: 1`, `hours: 1`. `matrix-plan.mjs` line 68 |
| 6. Code contradicted rulings and only an audit caught it | CONFIRMED on four of five. The party cut: `src/core/hunt/xp-share.js` line 78 calls `underFloorSharePm`. Tower heat: `src/core/hunt/tower.js` lines 141 to 157. The typed numbers: `src/core/combat.js` line 391 (the lead says 384, which is the to-hit line), while `src/shell/wiki-model.js` line 126 reads the named constants. The gear line: only in `tools/balance-sim/staged`. The rested bank: `src/core/member.js` lines 220 and 230 pass `restedQuantum: 0` on the paths I read. I did not trace the accrual side, so "accrues" is NOT CONFIRMED by me | As listed |
| 7. Integration ran through one synthesis agent | CONFIRMED that a cold audit was needed and found 5 critical and 14 high faults. NOT CONFIRMED from the repo: the count of re-issues | `61-review-audit.md` |
| 8. Comparisons to the existing game kept creeping in | NOT CONFIRMED from the repo. It is a claim about briefs and chat | none |
| 9. The tooling has side effects | CONFIRMED | `guard-deps.mjs` lines 56 to 62 match on a file's stem. `44` section 9 records the rename that worked around it and the line-ending fix |
| 10. Too many parallel lanes for one integrator | CONFIRMED in volume: 68 distinct lanes are named in merges on the set since 11-20. NOT CONFIRMED: 18 at one moment | `git log` on the set |
| 11. Assets to build on | CONFIRMED present, all of them | section 3.6 |

### 1.3 What the leads missed

RC1, RC2, RC3, RC5, RC7 and RC9 are not in the Coordinator's list. Three more:

- **The scenarios have one bar per role.** `played.mjs` fixes each role's spells and rules. The brief asks for "different spell and conditional-rule configurations". That axis does not exist. CONFIRMED by reading the file header.
- **Whole systems never enter a fight in the simulator.** The cell builders never mention imbuements, Bestiary charms, companions, Premium, potions or stamina, and Blessings appear once. CONFIRMED as word counts in `cell.mjs`, `progression-grid.mjs`, `grid-kit.mjs` and `matrix-metrics.mjs`. Whether each one matters to a fight is a HYPOTHESIS until section 6's coverage run answers it.
- **The checklist item that matters most to an idle game is the least examined.** `src/core/hunt/conditions.js` is the largest file in the engine and no register cites it. CONFIRMED.

### 1.4 What exists against the brief's Part 1 checklist

This is the state of each checklist entry as the code shows it. Statuses are from `systems.mjs` where a row exists, checked against the tree where I name a file.

| Checklist entry | State | Authoritative source |
|---|---|---|
| Levels, XP needs, XP rewards | Implemented | `src/core/xp.js`, `src/core/hunt/xp-share.js`, `src/data/hunt-xp.js` |
| Melee, Ranged, Magic, Defense | Implemented | `src/data/skills.js`, `src/core/skill-sim.js` |
| Prayer | Does not exist under that name. Its nearest relative is Inner Flame, a regeneration skill fed by bones, implemented | `src/data/hearth.js` |
| HP and mana growth | Implemented | `src/core/vitals.js` |
| Equipment requirements | Implemented | `src/data/gear-tiers.js`, `src/data/item-authority.js` |
| Physical and magical damage, spells, healing, shielding | Implemented | `src/core/combat.js`, `src/core/hunt/damage.js`, `src/core/hunt/abilities.js`, `src/data/abilities.js` |
| Fist combat | Built, switched off | `src/data/fists.js` |
| Armor and element resistance | Implemented | `src/core/mitigation.js`, `src/core/elements.js` |
| Critical hits | Implemented | `src/core/combat.js` lines 488 to 494 |
| Life and mana leech | Partly. Leech exists as an ability and status effect. Leech on worn gear is designed (linings), not built | `src/core/hunt/abilities.js`, `src/core/hunt/heal-cut.js` |
| Regeneration | Implemented | `src/core/vitals.js` |
| Attack frequency and cooldowns | Implemented. One 2.0 s basic interval for everything | `src/core/combat.js` `tickMs` |
| Targeting and aggro | Implemented | `src/core/hunt/targeting.js`, `src/core/hunt/roles.js` |
| Conditional combat automation | Implemented, never registered | `src/core/hunt/conditions.js`, `src/core/action-rules.js` |
| Area damage | Implemented | `src/core/hunt/shapes.js`, `src/core/hunt/monster-spells.js` |
| Grounds, monster mixes, spawning | Implemented to Level 110. Levels 110 to 185 staged. 185 to 400 an idea | `src/data/hunt-grounds.js`, `src/data/grounds/*/pack.js`, `src/core/hunt-spawn.js` |
| Solo and party behavior | Implemented | `src/core/party-split.js`, `src/data/party-class-xp.js` |
| Loot and rare drops | Implemented | `src/core/drops.js`, `src/core/hunt-rewards.js` |
| Stamina and offline accrual | Implemented | `supabase/functions/hr-accrue/accrual.js`, `src/core/away.js` |
| Death, Blessings, penalties | Implemented | `src/data/blessings.js` |
| Weapon and armor progression | Implemented to tier 7. Nothing past Level 88 | `src/data/gear-tiers.js` |
| Imbuement slots and imbuements | Drop rows exist. The file's own header says "IMBUING IS NOT BUILT". Replaced in design by linings | `src/data/imbuements.js` |
| Consumables | Implemented | `src/data/supplies.js`, `src/core/hunt/consumables.js` |
| Smithing | Implemented | `src/data/recipes.js`, `src/core/artisan.js` |
| Woodcrafting | Does not exist under that name. Woodcutting is a gathering skill. Crafting makes planks, bows and wands | `src/data/gathering.js`, `src/data/recipes.js` |
| NPC buying and selling | Implemented | `src/data/shops.js`, `supabase/functions/hr-accrue/vendor-sell.js` |
| Marketplace | Implemented (the Weighhouse) | 13 migrations name it |
| Currency creation and destruction | Implemented and journalled | `player_ledger` |
| Housing and gold sinks | Implemented | `src/data/homestead-tiers.js` |
| Party rewards | Implemented | `src/core/hunt/xp-share.js` |
| Premium | Implemented | `src/data/premium.js` |
| Training | Implemented | `src/data/training.js`, `src/core/hunt/training.js` |
| Bestiary | Implemented | `src/data/bestiary.js` |
| Collections | An old collection log is on the server with no caller | `systems.mjs` row `old-server-leftovers` |
| Others the checklist does not name | The Tower, the Catacombs, the Hearth Chest, bosses and halls, Call out, scaled hunts, Tempering, jewelry, trophies, patterns, farming, clans and castles (built, switched off), factions (built, switched off), companions (built, switched off), Town Works, live events | `systems.mjs`, 115 rows |

This table is what one architect read in one sitting. It is exactly the kind of list this plan replaces with a generated one.

**Benefit of this assessment:** it names causes that a tool can remove. **Complexity:** none, it is done. **Risk:** RC2's count is a proxy, as said.

---

## 2. Repository discovery plan: how coverage is proven complete

### 2.1 The rule

Coverage is a number a tool prints, never a sentence an agent writes. Every surface where a game rule or a game number can live is listed by reading the repo. Every listed thing must be claimed. An unclaimed thing fails the check.

### 2.2 The surfaces, and how each is listed

| Surface | How it is listed | Count today |
|---|---|---|
| Rule code | Every exported function and constant in `src/core` and `supabase/functions/hr-accrue` | 424 and 192 functions, 129 and 163 constants |
| Content and tuning data | Every exported constant and function in `src/data`, with its row count where it is a table | 735 constants, 253 functions |
| Typed numbers | Every number written inside a rule function that is not 0, 1, an index or a unit like 1000 | not yet counted |
| Server rules | Every function, table, client call, scheduled job and switch in the replayed database | 799 functions, 286 tables, 148 client calls, 28 jobs |
| Server verbs | Every intent the engine accepts | 18 |
| Generated catalogues | Every `tools/gen-*.mjs` and the data file and table it joins | 37 generators |
| Tests | Every guard and the symbols it loads | 416 test files |

The first, second and fourth rows reuse what `collect.mjs` already does. It lists files and database objects today. The change is to go one level down, from the file to the symbol.

### 2.3 What "claimed" means

Each symbol gets exactly one of four kinds.

- **formula**: it computes a game number. It must be bound to a formula row (section 3).
- **content**: it is a table of game things. It appears in the content registry with its row count.
- **plumbing**: it moves data and holds no game number.
- **presentation**: text, art, layout.

The tool decides the default. A function whose body holds a number, or reads a numeric constant, defaults to "formula" and stays red until a formula row claims it or a person marks it plumbing with a reason. This is the step that turns "we read the files we thought of" into "every function with a number in it is accounted for".

### 2.4 The checks that fail

1. A symbol with no kind.
2. A formula symbol with no formula row.
3. A server function that holds arithmetic and belongs to no formula row.
4. A typed number in rule code that no row names. This starts as a count that may only go down, the same way `css-literal-ratchet` works today, because the first count will be large.
5. A formula row whose symbol no longer exists.

### 2.5 The evidence of coverage

Every registry print and every agent report carries three numbers per area: symbols found, symbols claimed, and symbols whose description is still current. "Complete" is not a word any report may use. It prints the three numbers.

**Benefit:** ends the class of miss where a whole system or rule was never opened. **Complexity:** low to medium. Listing exports is a short pattern match that `collect.mjs` already has. Finding typed numbers inside function bodies needs function boundaries. The repo has no JavaScript parser installed. Two options: a small development-only parser dependency, or the function ranges Node's built-in coverage already reports. I recommend the parser. It is a build-time tool only and never ships. **Risk:** the first run will show hundreds of unclaimed symbols. That is the true state, and it is the work list. It starts in report mode and turns red area by area as each area reaches zero.

---

## 3. The proposed systems registry

### 3.1 Shape in one picture

```
registry/                     hand-written, small, version-controlled
  rulings.jsonl               every ruling, one per line, with an id
  intent.mjs                  design statements that can be tested, each with its check
tools/registry.mjs            the one tool: build, check, impact, brief, accept
tools/balance-program/        stays where it is and plugs in
  systems.mjs                 the system inventory (exists)
  formulas/*                  the formula and exception rows (exist, to be bound to symbols)
  standards.mjs               the balance targets (exists)
  matrix-plan.mjs             the scenarios (exists)
```

Nothing generated is committed. The generated half is a pure function of the commit, so it is version-controlled by construction and can never be out of date or cause a merge conflict. Anyone, and any agent, gets it by running `node tools/registry.mjs build`. CI runs `check`. The one exception is simulator results, which are costly, and those are cached with a fingerprint of their inputs as `progression-grid.mjs` already does.

### 3.2 The nine parts the brief asks for

| Brief part | Where it lives | Generated or hand-written |
|---|---|---|
| 1. System inventory | `systems.mjs`, 115 rows today | Hand-written rows. Status is checked by the tool: a row marked live must have a door a player can reach, which `inventory.mjs` already tests |
| 2. Formula registry | `formulas/*` rows | The meaning, the class and the ruling are hand-written. The location, the constants and their values, the callers and three sample inputs and outputs are generated by calling the real function |
| 3. Dependency graph | built by the tool | Generated (section 5) |
| 4. Content registry | built by the tool from `src/data` | Generated. `sources.mjs` and its atlas already do this for items and their sources. The same pattern covers spells, monsters, grounds, consumables and recipes |
| 5. Gameplay lifecycle | built by the tool | Generated. One hunt is played with Node's coverage on, and the tool prints the ordered list of rule functions that ran, from the start intent to the reward write |
| 6. Design decisions | `registry/rulings.jsonl` and `registry/intent.mjs` | Hand-written. Their status against the code is generated |
| 7. Balance targets | `standards.mjs`, 108 bands | Hand-written. Each band names the formulas it judges, and that link is checked |
| 8. Known exceptions | the exception rows in `formulas/*`, 129 today | Hand-written class and reason. An exception of class 3 must name a ruling id or it prints as "no approval on record" |
| 9. Uncertainties | built by the tool | Generated: every unclaimed symbol, every stale fact, every statement with no check, every scenario factor not exercised |

### 3.3 How every fact links to its source

A hand-written fact names a symbol, not a line. For example `src/core/combat.js#playerCombatRolls`. The tool stores a fingerprint of that function's text beside the fact.

- When the function's text changes, the fact prints as **STALE** until someone re-reads it and re-pins it. The lane that changed the function does that, in the same commit, because it is the one that knows what changed.
- A constant's value is never typed into a fact. The tool reads it from the code every time, the way `knobs.json` is checked today. So a number in the registry cannot disagree with the game.
- A fact whose symbol is gone fails the check.

This is the whole upkeep cost: when you change a rule function, you re-read one sentence about it.

### 3.4 Design intent beside implementation

**The rulings get a home in the repo.** `registry/rulings.jsonl`, one ruling per line:

```
{ "id": "R-2026-11-08-03", "date": "2026-11-08", "said": "XP share rule applies regardless",
  "reading": "Every seat gets the same party share whatever its Level",
  "replaces": [], "systems": ["parties", "level"], "checks": ["no-level-keyed-party-cut"] }
```

- It is append-only. A new ruling that replaces an old one names it in `replaces`. "Current" is computed, so nobody works out "newest wins" by hand again and a superseded ruling cannot be quoted by accident.
- Tyler's words are kept verbatim in `said`. The Coordinator's reading is a separate field, so the two are never blurred.
- The memory file, the Rulings page and the decision book become views of this file. The Coordinator writes a new ruling here first, as a docs-only commit, which the rules already allow.
- The first import takes the memory file and both decision files, and prints every line it could not place so nothing is dropped silently.

**The design book connects by ids.** The book under `docs/design/overhaul/` is design intent. The registry is implementation truth. They meet in `registry/intent.mjs`:

- Each statement in the book that describes a rule carries a short id in the text, for example `[B03-12]`, next to its RULED, RECOMMENDED or OPEN mark.
- `intent.mjs` has one row per id: the systems it touches, the ruling or call id behind it, and where possible a **check**. A check is a small test against the registry, such as "this symbol has no caller", "this constant equals this value" or "this data table has no row with a price".
- The tool then gives every statement one of four states.

| State | Meaning |
|---|---|
| BUILT | the check passes on this commit |
| NOT BUILT | the check fails and a build-plan step is named for it |
| CONTRADICTED | the code does the opposite and no step is named |
| UNCHECKED | the statement has no check. It is prose only |

- A book id with no intent row fails the check. An intent row whose book id is gone fails the check. So the book and the registry cannot drift apart without a red.
- The list of NOT BUILT statements is the build plan's to-do list, generated. The list of CONTRADICTED statements is what tonight needed an audit to find. The count of UNCHECKED statements is always printed, never hidden.

Documentation never overrides the code. Where they disagree the registry shows both, side by side, with the state above.

The book was not on the set at the commit I read, so I have not read it. The id convention is a request to the book's lanes, and it costs them one tag per rule statement.

### 3.5 What an agent actually reads

`node tools/registry.mjs brief <system>` prints one pack for a system: its formulas with live constants, its callers and dependents, the current rulings that touch it, the book statements and their states, the bands that judge it, the scenarios that exercise it, and its uncertainties. It also prints the list of source files the agent must read in full. Every agent gets this pack, from the same commit, instead of a hand-written brief that lists what the Coordinator remembered.

### 3.6 Built on, not beside

| Existing piece | Its role in the registry |
|---|---|
| `collect.mjs`, `inventory.mjs`, `systems.mjs` | The system inventory and its claim check. Extended one level down to symbols. The memory read is replaced by the rulings file, which lets the check run in CI |
| `formulas/*.json`, `combat-register.mjs`, `architecture-register.mjs` | The formula and exception rows. Ids are kept. The typed `impl` strings become symbol bindings |
| `formulas/knobs.json` | Already bound to source lines and checked. It is the model for every constant |
| `formulas/*-probe.mjs` | Already call real functions for sample values. They become the generator of each formula's samples |
| `sources.mjs`, `paths.mjs`, the atlas | The content registry for items. The pattern is widened |
| `standards.mjs`, `tests/balance-guard.mjs` | The balance targets and their guard |
| `balance-matrix.mjs`, `progression-grid.mjs` | The simulator (section 6) |
| `tests/layering.mjs` | Its import reader is reused for the dependency graph |
| `tests/schema-replay.mjs`, `schema-drift`, `live-hash-drift` | The replayed database is how server rules are listed. Live drift stays the Coordinator's check |
| `tools/lib/guard-deps.mjs` | Stays the guard picker. The registry's `impact` answers the different question of which facts and cells a change touches |

**Benefit:** one model every agent and audit reads, which is always current because half of it is generated on demand and the other half goes stale loudly. **Complexity:** medium. One tool of about the size of `inventory.mjs` plus its generators, and a one-time binding of the 107 formulas and 129 exceptions. **Risks:** first, fingerprints will flag cosmetic edits such as a reworded comment. The fingerprint is taken on the code with comments and spacing removed, which removes most of that. Second, `registry/` holds Tyler's words on money and design. The site build must not publish it. The repo already holds his briefs under `docs/`, so the same rule applies, and I have not checked what the site build leaves out. Third, the temptation to write checks for everything. Checks are written only for statements that are rules. The rest stay UNCHECKED and counted.

---

## 4. Formula architecture assessment

This builds on `44-formula-architecture.md` and its registers. Where I verified a claim in the code I say so. Where I only read it in 44, I say that.

### 4.1 What is sound

One engine runs every fight, seen or unseen. Imports point one way and a guard holds it (`tests/layering.mjs`). Content is authored once in `src/data` and the server tables are generated from it by 37 generators with drift guards. No hunting ground has its own combat code. These are from 44's summary and the layout of the tree, and I saw nothing against them.

### 4.2 Inconsistencies

| # | Inconsistency | Status |
|---|---|---|
| F1 | The hit formula uses numbers typed in place. The named constants with the same values are read only by the in-game wiki, so the wiki can show a formula the engine does not run | CONFIRMED. `combat.js` line 391 against `wiki-model.js` line 126 |
| F2 | A monster's damage scale depends on its tier through a hand table of four values | CONFIRMED. `combat.js` `monsterDamageScaleByTier`, values 4.0, 4.0, 3.0, 2.2 |
| F3 | A Level-keyed party share cut is in the split after it was ruled out | CONFIRMED. `xp-share.js` line 78 |
| F4 | The Tower multiplies blows per floor after that was dropped by ruling | CONFIRMED. `tower.js` lines 141 to 157 |
| F5 | Gear has no rule past tier 7. The only gear curve is in a simulator folder | CONFIRMED that the lines live in `tools/balance-sim/staged` and are imported by `grid-kit.mjs`. The effect on pace is 44's measurement, not mine |
| F6 | Kill reward has no term for how fast a ground's monsters die, so each ground carries a hand multiplier | From 44, item 2. Not re-verified |
| F7 | A tier's difficulty dial is applied three times | From 44, item 3. Not re-verified |
| F8 | Spells cannot miss, cannot crit and take no weapon bonus, and no ruling says so | Partly CONFIRMED. A comment at `combat.js` line 387 states "a spell never misses". The rest is from 44, item 9 |
| F9 | 118 of 190 monsters are typed by hand and the rest come from one formula | From 44, item 7. Not re-verified |
| F10 | Gold income is a formula and every sink is a list that ends | From 44, item 4. Not re-verified |
| F11 | The conditional automation has no formula rows at all, so its thresholds and priorities are outside every audit so far | CONFIRMED (RC2) |
| F12 | The server has rules written twice, once in JavaScript and once in SQL, for example maximum health. Some have a test that holds them together (`tests/core-curves.mjs`, `tests/vitals-armed-parity.mjs`). No list says which twins exist, so no one can say all are guarded | The examples are CONFIRMED. "Some twin has no guard" is a HYPOTHESIS. The census in section 2 proves or kills it |

### 4.3 Opportunities

44 proposes one framework per category: a gear curve, a kill reward that follows the pace line, one tier table and one wage curve for prices, removing 56 of 57 accidental exceptions in 28 steps. I did not re-derive that model and I do not restate it. Three points about how it should proceed:

1. **Bind before you change.** Each of 44's steps should start only after the formulas it touches are bound to symbols and their dependents are generated. Otherwise the clean-up is planned on a hand-drawn map.
2. **F1, F3 and F4 are the cheapest proof of the system.** Each is a ruling the code does not follow. Written as three checks in `intent.mjs`, they show as CONTRADICTED on day one and turn BUILT when fixed. They are not fixed under this plan. Fixing them is a gameplay change that waits for approval.
3. **Classify the unregistered code before judging the architecture.** 44's verdict of "one formula system with a pile of exceptions" rests on the share of the code that was read. Until the census is done, the true count of special cases is unknown. HYPOTHESIS: the conditional automation and the server tick hold more of them.

**Benefit:** the clean-up 44 planned gets a verified base and a way to prove each step. **Complexity:** none added here. **Risk:** delay to the clean-up. I judge it small, because the binding step is the same reading the clean-up needs anyway.

---

## 5. Dependency mapping strategy

The map is derived from the code in five layers. No edge is drawn by hand.

| Layer | How it is derived | Catches |
|---|---|---|
| 1. Imports | Read every import, by name. `tests/layering.mjs` already reads them by folder | Which rule reads which data table or helper |
| 2. Constants | For each constant, every function that reads it. `knobs.json` already locates 33 of them | What moves when a number moves |
| 3. Server | From the replayed database, each function's text is searched for other function and table names. Names all share the `hr_` prefix and are unique, so a text match is reliable. Reads and writes are told apart by the SQL verb | Which server rule writes which table, and which client call reaches it |
| 4. Twins | A formula row with one home in JavaScript and one in SQL is a twin. The tool fails a twin that names no parity test. Generated catalogues are twins by construction, joined by their generator | Rules written twice |
| 5. Runtime | Play scenarios with Node's built-in coverage on. It records which functions ran, with no change to game code | Edges that static reading cannot see, and factors a scenario never exercised |

### How the map is verified

- **Static against runtime.** A function that ran in a scenario but has no path in the static map is a hole in the map. It is printed.
- **Map against measurement.** The matrix already sweeps each knob (`--sweep`). If the map says a band depends on a knob and the sweep shows the band never moves, or a band moves that the map says is unrelated, the tool lists it. That is how indirect effects are found without anyone guessing them.
- **Against the hand-drawn map.** 44's 198 edges are compared once with the derived ones. The differences are listed in both directions. After that the hand list is retired.

### The question it answers

`node tools/registry.mjs impact <symbol or file>` prints: the formulas that read it, the systems they belong to, the bands that judge them, the scenario cells that exercised them, the rulings and book statements attached, and the twins. This is the "consequences before recommending" the brief asks for, as one command.

**Benefit:** indirect effects stop depending on an agent's memory. **Complexity:** layers 1 to 4 are low to medium. Layer 5 is low if coverage works through the simulator's worker processes. That is a HYPOTHESIS. Node passes the coverage setting to child processes, so I expect it to. **Risk:** the name-level graph is coarser than a call graph. It can show a dependency that is not real, such as an import that is never used. It errs toward more to check, never less, which is the safe side.

---

## 6. Simulation architecture

### 6.1 One rules engine

The rule stays what it is: every number comes from the real settle and the real engine, and no tool computes a combat value. What changes is the number of ways in. Three builders become one. `tools/balance-sim/cell.mjs` is the cell. The grid, the matrix, the Balance Lab and the guard all go through it. 44's fault V2 names this, and its lane has it in progress.

The hero's setup moves toward the game. Bars, skill lines and later gear are authored under `tools/` today. Where the game has its own default, such as the role rules in `src/data/rule-subjects.js`, the simulator reads that. Where a setup is a proposal, such as the staged gear line, it is a named patch that prints on every result. A result never hides that it ran on gear the game does not have.

### 6.2 Faults to close first

Nothing about survival, gold, a lone hero or a party seat is quotable until these are closed. The first four are 44's.

| # | Fault | Source |
|---|---|---|
| V1 | Skills run on a straight line past the measured career | 44 section 6.1 |
| V2 | Two builders disagree. One plays harder tiers without the tier's pull | 44 section 6.1 |
| V3 | A dead hero hunts on, so deaths on a failing cell count retries | 44 section 6.1. `cell.mjs` header says a death starts a new hunt on a new seed |
| V4 | Seats take the wrong shares of damage | 44 section 6.1. Cause unknown, a HYPOTHESIS list only |
| V5 | The store bill reads about twice real | 44 section 6.1 |
| V6 | Health between settles is rebuilt by the harness with a constant regeneration rate, so low-health events are an estimate | CONFIRMED. `cell.mjs` header |
| V7 | The subset is 1 seed for 1 hour. The full matrix has never been run | CONFIRMED |
| V8 | No axis for spell and rule choices. No pair cells | CONFIRMED for the bar. Pair cells from the Coordinator's lead |

I did not run the harness. Each row needs its own proof when it is closed, and that proof is a calibration cell against real play.

### 6.3 What each scenario models

The brief's Part 4 list, as the harness stands. This is from reading the builders, and section 5's coverage run replaces it with a measured table per scenario.

| Factor | State | Note |
|---|---|---|
| Level | modeled | |
| Skills | approximated | career lines, straight past the measured range, no training hours |
| Weapon and equipment | modeled to tier 7, then a proposal | staged lines past that |
| Imbuements | missing | not built in the game either |
| Spells and rule priorities | approximated | one fixed bar per role |
| Mana and health regeneration | modeled by the engine | the harness's health trace between settles is approximate |
| Consumables | approximated | bill too high (V5) |
| Cooldowns | modeled | |
| Enemy stats and resistances | modeled | |
| Spawns and encounters | modeled | tier pull missing in one builder (V2) |
| Target selection | modeled, not calibrated | V4 |
| Damage dealt and taken, kill rate, XP | measured | |
| Loot and rare drops | not verified by me | |
| Gold profit | approximated | V5 |
| Stamina | missing | |
| Death risk | approximated | V3. A change to the death cost does not show |
| Party interactions | modeled for a four | no pairs |
| Long-term progression | derived | arithmetic on measured rates, never played end to end |
| Blessings, Bestiary charms, companions, Premium, food buffs, House perks, live events | missing or unverified | word counts only |

### 6.4 The matrix and its gate

The matrix is `matrix-plan.mjs`: Levels, gear states, ways to fight, party, tier and ground. It gains two axes from the brief, bar configuration and hunt length, and it gains nothing else until the faults are closed.

**Seeds.** A before-and-after diff plays the same cells on the same dice, as `--diff` already does. A risk measure such as deaths or low-health events needs at least 4 seeds and reports the spread, not one number.

**The label is computed.** Every result carries a label the tool assigns from how the number was made. No agent types it.

| Label | Assigned when |
|---|---|
| MEASURED | real engine, the cell's class has a calibration cell within tolerance of real play, enough seeds for the metric |
| SIMULATED | real engine, but the class is not calibrated or the seeds are too few |
| DERIVED | arithmetic on measured numbers. The inputs are listed |
| ASSUMED | any input was typed by a person |

A number with an ASSUMED input can never print as MEASURED. That closes the fault behind `61` C2 by construction.

**The gate.** A result is usable in a report only with its cell id, the fingerprint of the code it ran on, its seeds and hours, its label and its factor table. `registry.mjs accept` (section 7) refuses a number that lacks them.

**Before and after.** `--diff` already flags IMPROVED, REGRESSED and UNINTENDED against the bands. It stays the way a change is judged, and its default view is the proposal against the bands.

**What to rerun.** Each cached cell records which functions it exercised. When a symbol changes, only the cells that exercised it are stale. The full matrix runs nightly on GitHub, split across jobs as `balance-sweeps.yml` already does for sweeps, and only stale cells are replayed.

**Benefit:** numbers that mean what their label says, and a full-game diff that is affordable every night. **Complexity:** medium to high. The fault fixes are the hard part and two are already in flight. **Risk:** calibration needs real play, and no real lone, pair or three hours exist on the current rules (44 section 6.1). Those classes stay SIMULATED until someone plays them. The label says so, which is the point.

---

## 7. Agent coordination

### 7.1 The roles

The brief lists six kinds of agent. Two of them, discovery and dependency tracing, become a tool. That leaves four roles, and all of them read the same brief pack from the same commit.

| Role | Who | What it does |
|---|---|---|
| Registry keeper | systems engineer | Keeps the tool green. Closes unclaimed symbols and stale facts. The only writer of formula rows |
| Measurer | one balance lane | Runs the matrix, owns calibration, answers "what does this change do". The only source of numbers |
| Designer | game designer | Proposes additions, removals and redesigns from brief packs and the measurer's results |
| Adversary | a cold reviewer | Reads a finished report with the registry beside it and tries to break it. Never the author, never shown the author's reasoning |

Integration is the Coordinator, and it becomes a join instead of a rewrite. Findings arrive as rows with ids, so combining them is sorting and deduping by id, not one agent re-telling eleven documents.

### 7.2 How a report is checked before it is accepted

Every report ends with a short structured header. `node tools/registry.mjs accept <report>` checks it. The Coordinator does not pass a report to Tyler until it is accepted.

| The header states | The tool checks |
|---|---|
| The commit the registry was read at | It is the current tip, or the tool lists every ruling and symbol that changed since and touches the report's systems |
| The systems in scope | It lists every system that depends on them and is not in scope. Those must appear under "not analyzed" |
| Sources read in full | It compares against the brief pack's required list and names the missing ones |
| Every number, with its cell id or symbol | The cell exists, the value matches, and the label is the cell's own. A number with no reference prints as UNSOURCED |
| Every ruling relied on, by id | It is current. The tool lists newer rulings on the same systems that the report did not cite |
| For each recommendation, what it would change | It prints the dependents from the map. Each must show a matrix diff or be listed as not verified |

This is how critical dependencies are verified: the tool names them from the map, and the report must show evidence for each or say it has none.

### 7.3 How the final review names what was not analyzed

The "not analyzed" section is generated first and edited second. It is the union of: systems out of scope that depend on in-scope ones, required sources not read, factors the cited scenarios did not exercise, numbers labelled below MEASURED, and statements with no check. An agent may add to the list. It may not remove from it without a reason on the line.

### 7.4 Lessons from tonight, as four rules

1. **At most four finding lanes at once, and one adversary per two.** Tonight's volume outran checking. The existing rule is already three to four lanes. This plan keeps it and ties it to review capacity.
2. **No number reaches Tyler before it is accepted.** A number in a status line carries its label, or it is not sent. The Coordinator's own summaries go through `accept` too.
3. **No synthesis by re-telling.** If eleven sources must be combined, they are combined by id in a table. A sentence that merges two findings names both ids.
4. **A new ruling or brief re-pins running lanes.** It lands in `rulings.jsonl`. Every running report that reads an older commit is flagged with the new rulings that touch its systems, so a brief that lands mid-lane cannot be missed.

**Benefit:** scope, sources and labels are checked by a tool before a person relies on them. **Complexity:** low for the tool, since it is lookups against the registry. The cost is discipline in the report header. **Risks:** an agent can still write a false header, for example claiming a file was read. The adversary samples those. And the header must stay short, or it becomes the bureaucracy the brief warns against. It is six fields.

The agent definitions under `.claude/agents/` are the Coordinator's to change. This plan does not touch them.

---

## 8. Design review framework

Every addition, removal, merge or redesign is judged on one card with Tyler's eight criteria. Five of the eight are filled by a tool, so the designer's time goes to the three that need judgement.

| Criterion | Filled by | Evidence |
|---|---|---|
| 1. Player experience and strategic depth | designer, and a playtest when fun is the question | a blind play session, read from the screen only. A tool cannot answer this and the card says so |
| 2. Interaction with existing mechanics | `impact` | the generated list of dependents |
| 3. Mathematical and balance consequences | the matrix | a `--diff` over the cells the change touches, with labels |
| 4. Economy implications | the sources and sinks model (`sources.mjs`, `gold-model.mjs`) | gold in and out, before and after |
| 5. Long-term progression impact | the grid's pace tables | hours to each checkpoint, labelled DERIVED |
| 6. Development and upkeep cost | the registry's own diff | how many formulas, exceptions and constants the change adds or removes. A change that adds a special case shows it as a number |
| 7. Unintended consequences | the UNINTENDED flags of `--diff`, and the adversary | bands that moved and were not the target |
| 8. Evidence | the labels | counts of MEASURED, SIMULATED, DERIVED and ASSUMED behind the recommendation |

Rules for the card:

- **One recommendation, with the reason.** No menus.
- **Removal is judged on the same card.** The map shows who reads the thing. A thing nobody reads and no plan uses is a removal candidate. A thing planned for later is not, by the ruling of 11-21.
- **A criterion with no evidence says "no evidence".** It is never filled with reasoning dressed as a finding.
- **The proposal is judged against the bands and the rulings.** Not against the game as it stands.
- **Nothing on a card is built until Tyler says yes.**

The whole-game review the brief's Part 6 asks for (spells, weapons, equipment, consumables, crafting, monsters, grounds, features, party roles, long-term goals) runs through these cards. It starts only after sections 2, 5 and 6 can print their coverage numbers, because the brief itself says "once the systems registry and dependency model have been sufficiently verified". "Sufficiently" is defined here as: no unclaimed formula symbol in the systems under review, and the calibration faults closed for the metrics the card relies on.

**Benefit:** design calls arrive with their consequences already traced, and disagreement with past decisions rests on evidence. **Complexity:** low once sections 3, 5 and 6 exist. The card is a print, not a system. **Risk:** criterion 1 has the weakest evidence in an idle game with few players. The card shows that plainly instead of hiding it.

---

## 9. Prioritized roadmap

Small steps. Each can be approved alone. None changes the game.

| Step | What | Benefit | Complexity | Risk |
|---|---|---|---|---|
| 1 | **Rulings into the repo.** Import the memory file and both decision files into `registry/rulings.jsonl` with ids and `replaces` links. Print what could not be placed | Ends "which ruling is current" and unblocks the inventory check for CI. Helps the book lanes at once | Low | A reading is copied wrong. Tyler's words are imported verbatim so any reading can be checked against them |
| 2 | **The symbol census, report mode.** `tools/registry.mjs build` lists every symbol in `src/core`, `src/data`, the engine and the replayed database, with the kind it guesses | The first true count of what is unclaimed. Proves or kills RC2 properly | Low to medium | The first number is large and looks alarming. It is the real state |
| 3 | **Close the simulator's faults V1 to V5, one builder, the game's death rule.** Coordinated with the lanes already on it | Numbers become quotable for survival and gold | Medium to high | Calibration needs real play that does not exist for some party sizes |
| 4 | **Bind the existing 107 formulas and 129 exceptions to symbols.** Fingerprints, live constant values, samples from the probes | Register rows can no longer drift silently. Stale facts name themselves | Medium | One-time reading cost. It is the same reading the clean-up needs |
| 5 | **Claim the unregistered rule code.** Conditions, movement, spawning, the tick, eating, selling, unlock buying. Area by area until each reads zero unclaimed | Closes the largest known blind spots | Medium | Finds more special cases than 44 counted. That is a result, not a failure |
| 6 | **The derived dependency map and `impact`.** Layers 1 to 4, then compare with 44's hand edges | Consequences of a change in one command | Medium | False edges from unused imports. Safe side |
| 7 | **Coverage on scenarios.** Layer 5. The factor table per scenario becomes measured, and cells record what they exercised | "What was modeled" stops being a guess. Enables rerunning only stale cells | Low if the HYPOTHESIS about worker coverage holds | It may need a small change to how workers are started |
| 8 | **Intent checks.** `intent.mjs` rows for the rulings the code contradicts today, then for the book's rule statements as chapters land | The mismatch list is generated. The build plan's to-do list is generated | Low per check | Writing checks for things that are not rules. Kept to rule statements |
| 9 | **Computed labels and `accept`.** The label field on every cell, the report header, the accept command, the generated "not analyzed" | No unlabelled or mislabelled number reaches Tyler | Low | Header creep. Six fields, no more |
| 10 | **CI.** Census and binding checks in `smoke.yml` as fast steps. The database part in the existing replay job. The full matrix nightly, stale cells only | The registry cannot rot. A change that leaves a fact stale fails its own lane | Low to medium | CI minutes. The fast checks are seconds. The nightly is sized by what changed |
| 11 | **The first whole-game design review** through section 8's cards | The Part 6 review, on verified ground | Depends on scope | Starting before steps 4 to 7 would repeat tonight |

**Order.** Steps 1 and 2 first and together. Step 3 runs alongside, in different files. Then 4, 5 and 6. Then 7, 8 and 9. Step 10 turns each check red as its area reaches zero. Step 11 last.

**What it replaces.** After step 10, these stop being hand-kept: the memory rulings file as the source, the typed `impl` lines, the hand edge list in 44, the hand factor caveats in the review documents, and typed evidence labels.

---

## How it stays current

The brief's Part 8, answered item by item. Nothing here is hand upkeep except re-reading a sentence about a function you just changed.

| When this changes | This happens by itself |
|---|---|
| A rule function | Its facts print STALE. The lane's own check is red until they are re-read. `impact` names the formulas, bands, cells and statements downstream |
| A constant | Nothing to update. The registry reads the value live. The cells that exercised it are marked stale |
| A content table | The content registry is regenerated on the next build. Row counts and sources update |
| A new function or table | The census shows it unclaimed. The check is red until it has a kind |
| A server function | The replay lists it. The same rules apply. Live drift stays under `live-hash-drift` |
| A ruling | One line appended to `rulings.jsonl`. Statements resting on a replaced ruling are flagged. Reports pinned to an older commit are flagged |
| A book statement | Its id must have an intent row, or the check is red |
| A document that quotes an old number | Not solved by this plan for old prose. From now on, reports reference cell ids, so a number in a new report can be re-checked by the tool. The old layered documents stay sources only, as the 11-21 ruling already says |
| The record of approved changes | The git history of `rulings.jsonl` and of the formula rows. No separate log |

Where it runs: the edit hook for one file in under a second, the lane's own tests, `smoke.yml` on every push, and the nightly for the matrix.

---

## Not analyzed

- **The design book.** `docs/design/overhaul/` was not on the set at the commit I read. Section 3.4's link to it is a proposal its lanes have not seen.
- **The simulator's faults.** I read them in 44 and 51 and read the harness source. I ran no cell.
- **44's unified model.** Not re-derived. Section 4 marks which of its findings I checked in code.
- **The server engine in depth.** I counted its exports and listed its files. I did not read `tick.js`, `accrual.js` or `intents.js` line by line.
- **The database.** I used the inventory's counts from the replay. I did not read function bodies, apart from locating two examples.
- **The client** (`src/session`, `src/shell`). Only one line of the wiki was read. Rules that leaked into the client would be found by step 2, not by me.
- **The economy tools** (`gold-model.mjs`, `sources.mjs`, `paths.mjs`, the atlas). Read by header only.
- **Production.** No live data was read.
- **The Rulings page and the tracker databases.** Outside the repo.
- **The full rulings file.** I read its first 106 lines in full and the headings of the rest.
- **Whether the site build publishes `registry/` or `docs/`.** Not checked. It must be, before step 1.
- **Cost in CI minutes and tokens.** Estimated as low, medium or high only. No measurement.
- **The count of unclaimed typed numbers.** Unknown until step 2 runs.
