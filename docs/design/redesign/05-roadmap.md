# 05. Revised overhaul roadmap

Written 2026-11-21 on `lane/rd-vision`. Docs only. This is deliverable 7 of the reset request of 2026-11-21: the proper order of design, validation, approval and implementation. Read `01-identity.md` and `02-architecture.md` first.

**Labels.** EVIDENCE, MEASURED, JUDGMENT, SPECULATIVE and HISTORICAL, as in `01-identity.md`. The order and the gates are JUDGMENT unless a line says otherwise.

## Approval status, 2026-11-22

| Approval | Status |
|---|---|
| **A.** Identity, principles, hard lines | **Given.** The owner said go to the whole direction |
| **B.** The packages | **Given.** Go on all ten directions: the nine packages and the crafting design of `09-crafting.md`. His answers to the open questions are in `08-for-tyler.md` |
| **C.** Targets as experiences | Next. Written from the approved packages once V1 reads |
| **D.** The build plan | After stages 4 and 5. Waves start as soon as each one's probes read |

**The schedule answer** (RD-Q5 a, 2026-11-22). Pause the number lanes, keep what is true under any design, and run the climb test first. No new date until it reads. He also said "obviously I want to build this as quickly as we can", so nothing waits that does not have to: the old design is not shipped first, the climb probe V1 is running now (lane `lane/v1-climb`, started 2026-11-22), and the side seam, the first engine batch of wave 1, started beside it because it is true under any design. Build waves start the moment V1 reads.

## 1. The order on one screen

| Stage | What it produces | Who | The gate that ends it |
|---|---|---|---|
| **1. Define the game** | Identity, the audit of old assumptions, the comparison with the existing overhaul | Design lanes | **Approval A.** The owner approves the identity and the principles, or changes them |
| **2. Design the architecture** | The nine packages, the math strategy, the three shared parts | Design and math lanes | **Approval B.** The owner answers each package: go, change or drop. Packages, not rulings |
| **3. Set the balance targets** | A short list of outcomes for each approved package, each with a reader | Math lane with the designer | **Approval C.** The owner sees the targets as experiences ("a good four holds this much deeper"), not as coefficients |
| **4. Validate in simulation** | Each package's main mechanic played on the one shared engine, with the probes below | Matrix lane | A readout for each package: the mechanic works, needs a change, or fails. A failed package returns to stage 2 |
| **5. Calibrate globally** | One pass over all levers together, on the validated mechanics | Math and matrix lanes | Every target read green or named as open, with nothing fixed by a per-ground exception |
| **6. Implement** | Build waves, each ending in a played build | Build lanes | **Approval D** before the first wave: the owner approves the build plan. Then the usual release gates |

Two rules hold through all six. No detailed number is locked before the system that produces it is validated. A package that fails in simulation goes back to design, and is never patched with an exception. (JUDGMENT, from sections 6 and 7 of the reset request)

## 2. Stage by stage

### Stage 1. Define the game

Done on paper when these exist: this lane's `01-identity.md`, the assumption audit (deliverable 1), and the comparison with the existing overhaul (deliverable 4, which follows this lane as `04`).

**Approval A asks the owner three things.** Is the fantasy right: you lead a company and the plan is the play? Are the twelve principles the right test? Are the hard lines complete? A "no" here changes everything below it, so it comes first and alone.

### Stage 2. Design the architecture

The nine packages of `02-architecture.md` and the math strategy (deliverable 6). They are designed together because they share three parts: the power step, the rule table and the company plan.

**Approval B is by package.** For each one the owner says go, change or drop. Some packages lean on others, so they are best read in this order.

| Read first | Because |
|---|---|
| 3. Hunting and monsters | The Danger scale and the stance are the center. If this is a no, packages 1, 4 and 6 change shape |
| 1. Combat and skills | Jobs and the bar as the build depend on package 3's roles |
| 2. Equipment | The owner's confirmed requirement lives here. It depends on the rule table |
| 4. Party, then 5. Economy | Both follow from depth-scaled pay |
| 6, 7, 8, 9 | Each stands on the ones above |

Cuts and pauses in `02-architecture.md` section 10 are approved here too. Anything about real money is the owner's and is not in a package.

### Stage 3. Set the balance targets

Targets are written from the approved packages, not carried over. Each target names the experience, the number range as a hypothesis, the reader that measures it and the levers that move it.

**What the baseline work feeds.** The inventory of candidate targets is the raw material. (EVIDENCE: `docs/design/balance-baseline/03-targets.md` and `tools/balance-program/targets.json`. 100 candidates, all marked as hypotheses, 22 tensions, 5 hard constraints.)

| From the baseline | What stage 3 does with it |
|---|---|
| The 5 hard constraints (HC-1 to HC-5) | Kept as they are. They are mission lines and limits of the tool |
| The 100 candidate targets | Each is sorted against the packages: kept, restated in steps, or retired with its reason. None is carried over by default |
| The 22 tensions | Each is answered by a package or stays open. The table below has the structural ones |
| The 31 targets with no reader | A reader is built or the target is dropped. A target nobody can read is not a target |
| The calibration files (`calibration/c1.json`, `c2.json`, `c4.json`) | Kept as the check that the simulator tells the truth about real hunts and real town hours |

**The structural tensions, and which package answers each.** (EVIDENCE for each tension: `03-targets.md` section 5. JUDGMENT that the package answers it, to be shown in stage 4.)

| Tension | What fights | Answered by |
|---|---|---|
| K-1, K-2, K-3 | A flat death count against an engine that gives a cliff | Package 3. Small steps and a fall back make a slope. A death rate belongs to a stance, not a tier |
| K-8 | A four beats its heroes apart in XP but not in gold | Packages 3 and 4. Coin scales with depth like XP, and loot is personal |
| K-9 | A fixed percent gear step against a fixed Level gap | Package 6. One power step for Levels, gear and monsters |
| K-10 | Best gear's gain against a four held by the respawn | Package 3. Pulls come on readiness, so pace follows power |
| K-13, K-20 | A wipe is four deaths. The top tier is safe and best by a band's top | Package 3. The party climbs to its edge and falls back before a wipe |
| K-4, K-5 | Armor and jewelry steps that do not match their shipped rows | Packages 1 and 2. Ratio defenses, and jewelry's value moves into Traits |
| K-6, K-11 | Upgrade prices and chest limits against band length | Package 5. Prices read from the wage on the step scale |
| K-22 | The hall ship bar against a room that a good bar always wins | Packages 1 and 3. A hall is a bar check with wind-ups |

**Budgets set aside in stage 3.** A fixed slice of the power step for castle buffs and for arena rewards, and a share of the sink budget and of town hours for the castle. Every target is read with the slice on and with it off. This is what "accounted for now" means in numbers. (`02-architecture.md` section 7b)

**New readers stage 3 must ask for.** Healing against incoming damage, by source. Why a hunt ended. The step a company holds, by stance. No lineup wins every ground. No Trait is top pick everywhere. Gold a head for a four against the same heroes apart. Progress past Level 400. Rare drop timing. Halls. Most of these are today's largest gaps. (EVIDENCE: `03-targets.md` section 0)

### Stage 4. Validate in simulation

One engine decides everything, so every probe runs on it (HC-3). The order goes from the mechanic most others depend on to the ones that depend on it. Each probe is small: one ground, a few seats, a few seeds. **V1 comes first and alone, and it is running** (lane `lane/v1-climb`, started 2026-11-22). Packages 1, 2, 4 and 6 lean on the climb, so nothing else is detailed until V1 has a result. If the climb does not settle at a step, the existing tier table is the fallback and those packages are re-thought. (Taken from `06-comparison.md` section 0)

| Probe | The question | Passes when |
|---|---|---|
| V1. The climb | Do steps and a fall back turn the cliff into a slope? | A four settles at a step. A small change in power moves that step. A fall back comes before a wipe on Careful and Steady |
| V2. The stance | Is the stance a real choice? | Bold does not beat Steady when left alone for a full day. Careful and Steady have no deaths (RD-Q3 a) |
| V3. Reach | Do monster roles spread damage? | The front hero's share falls to a target range, and back-row armor moves the step held |
| V4. Jobs | Does each style earn a seat? | No lineup is best on every ground mix. Four of one style loses to a mixed four |
| V5. Sustain | Can healing and mana be read and tuned? | The new counters explain every fall back in the sample |
| V6. Pay | Does depth-scaled coin fix party gold? | A four earns more a head than its heroes apart in XP and in gold |
| V7. Five Traits | Does a rule Trait make a choice? | No one Trait is top on every seat and ground in the sample |
| V8. The step curve | Does one unit hold to very high Levels? | A tier is worth the same share of depth at Level 20, 400 and well past it |
| V9. A bar check | Can a boss be lost to a bad bar and not to the clock? | A good bar wins most fights, a lazy bar loses most, at the same damage |
| V10. The mirrored fight | Can heroes fight heroes on the one engine? | A company against a copy of itself wins about half the time, and a hunt replay is unchanged |
| V11. Evolutions | Does a point every Level make a felt choice with no best path? | On the sample moves, each branch is best on some ground and none on all. The best allocation found beats the suggested path by a small, set margin at the edge |

Some things only players can answer, and they wait for a played build: whether a first hour with one hero and a recruit step feels right, whether the report reads clearly, whether Traits are fun to read, what people charge on the market. (JUDGMENT. HISTORICAL and kept: anything the engine decides is sized in the simulator, and only a player's choice is read live, 2026-11-21.)

### Stage 5. Calibrate globally

Once the mechanics hold, all levers are tuned together in one pass: the step ratio, pay per step, fall back triggers, move costs and cooldowns, role mixes, Trait budgets, supply prices, and the prices of bought hunting and town work. The hunting day itself is no longer a lever: the owner set it at 10 hours, 12 with Premium (2026-11-22). Sensitivity runs say which levers matter. The rule from the baseline stands: content data first, then a coefficient, then a curve, and never a dial for one ground (LR-1). Calibration ends with a table of every target, read from the engine, and a list of what is still a hypothesis.

### Stage 6. Implement

Build waves in dependency order, each ending in a build someone plays. They start the moment V1 reads, and wave 1's first batch, the side seam, is already under way beside V1 (RD-Q5, 2026-11-22). The plan:

| Wave | What | Why first |
|---|---|---|
| 1 | First, as its own engine batch: a side on every unit, proven by an unchanged hunt replay. Then the power step, the Danger scale, pulls on readiness, the climb and fall back, the sustain counters and the report with its cause line | Everything else is measured through them |
| 2 | Monster roles, rows, depth-scaled pay, personal loot, the company plan with free copying | The party and the economy's faucet |
| 3 | Jobs and the wider move list, wind-ups, ratio defenses, Talents as move evolutions, Inner Flame as Luck | Combat with something to answer |
| 4 | Trait pieces, carry-over, single listings on the market, the drop moment. With its security review | The largest new server surface |
| 5 | Professions as designed in `09-crafting.md`, the store cut to basics, prices from the wage, the hall without combat perks | The other half of the day |
| 6 | The hire board, halls as bar checks, ladders, events as rules, clans with the castle's first building | The shared world on top of a game that holds |
| 7 | The two arenas, then the rest of the castle a building at a time. May ship after launch | They need the side seam from wave 1, settled builds from waves 3 and 4, and clans that are seen to form. Their share of power and sinks is set aside in stages 3 and 5, so they arrive with no rebalance |

Every wave keeps the standing rules for how work is done: the server authors everything, migrations carry their self-checks, money surfaces get their review, and a blind play follows each big patch. **Approval D** is the owner's go on this plan before wave 1.

**Dates.** None until V1 reads, by the owner's answer (RD-Q5 a). The existing first build was aimed at the end of December with about 15 lanes, and it is not shipped first. The packages are approved, so the estimate needs only V1's result, and it is owed the day V1 reads.

## 3. What happens to the existing first build

The existing plan is `docs/design/overhaul/13-build-plan.md`, lanes FB-1 to FB-15, with `14-the-rest.md` behind it. It stays in the repo as a record and as a candidate. Each lane is sorted by one test: is the work true under any design, or does it build numbers and systems the redesign may replace? (JUDGMENT. Lane names and scopes are EVIDENCE from `13-build-plan.md` sections 2.1 and 2.6.)

| Lane | What it is | Verdict | Why |
|---|---|---|---|
| FB-1 | Two engine stall fixes | Done, keep | A bug fix is a bug fix |
| FB-3 | The matrix lane and the replay on the fixed engine | **Continue**, re-aimed | It is the tool stages 3 to 5 run on. It stops grading old bands and starts building the missing readers and probes V1 to V9 |
| FB-4 | Settle cost, read once, the save | **Continue** | Server cost is true under any design |
| FB-10 | Town work in closed form | **Continue**, with one check | The cost saving holds. Check that it does not hard-wire trades to a hero before package 5 is answered |
| FB-5 | Four heroes and the first hour | **Continue the fixes, re-aim the shape** | The hidden first tip, the tutorial repeating, the weapon pick and gear that is never worn are bugs under any design. The shape is answered: one hero, then three recruits in one press at Level 5 (RD-Q6 a) |
| FB-6 | The company: one plan, one Start, one return card | **Continue** | It is package 9's base. Package 9 is approved, so plans are free and priced Setup slots stay out |
| FB-7 | The hunt report | **Continue**, extend later | It is package 9's report. The cause line is added once the sustain counters exist |
| FB-12 | The cheap social layer | **Continue** | Chat, roster, presence and the calendar fit package 7 as they are |
| FB-2 | Formula steps that move no number | **Pause** | The modifier table (R20) is worth keeping as the seed of the rule table. The rest reshapes formulas the math strategy may replace |
| FB-8 | The gear curve, kill reward, tier table, Level law, Blessing ladder | **Replace** | These are the numbers of three tiers, a +17% band and a fitted Level table. Packages 2, 3 and 6 change what is being sized |
| FB-9 | The wage and prices | **Pause** | The wage formula is right and is kept as the anchor. Prices wait for depth-scaled pay |
| FB-11 | Talents | **Pause, then redesign** | The build choice is kept, as move evolutions with a point every Level (`02-architecture.md` section 1b, the owner's confirmed requirements of 2026-11-21). Stat tracks go. Plans, the suggested path and reset are worth keeping |
| FB-13 | One world boss as a sample | **Pause** | Its "bars broken" shape may fit. It waits on package 3's bosses |
| FB-14 | On-call heroes | **Pause**, likely keep | The design fits package 4. It waits on party pay and the hire board |
| FB-15 | Premium for the account | The owner's call, one part made | A money surface. He ruled that Premium lengthens each hero's town-work day (CR-Q3 b, `09-crafting.md` section 5.3). The rest of what Premium sells is still his |
| Chapter 14, FR-1 to FR-18 | Everything planned for later | **Pause as a whole, keep in the design** | Each is re-sorted after Approval B. The arenas (FR-10) and the full castle (FR-11) stay in the design by the owner's confirmed requirement of 2026-11-21. They are accounted for from stage 2 and built in wave 7 |

**What the measuring work already running keeps doing.** The baseline lanes keep measuring the engine as it is, because that is evidence about what the architecture does and where it fights itself. They do not grade it against old bands as if those were the goal. Three jobs matter most for this roadmap: keep the simulator true against real hunts (the calibration files), build the readers that are missing, and run V1, which package 3's approval started on 2026-11-22.

## 4. What the owner is asked, and when

| Approval | When | What is on the page |
|---|---|---|
| A | Given, 2026-11-22 | The identity, the principles, the hard lines |
| B | Given, 2026-11-22 | Nine packages and the crafting design, all go. The cuts and pauses. His answers are in `08-for-tyler.md` |
| C | After the math lane writes targets from the approved packages | Targets as experiences, each with a range and a reader |
| D | After stages 4 and 5 | The validation readout, what is still a hypothesis, and the build plan |
| Any time | As they come up | Real-money calls, grants and cuts. These are never decided by a lane |

Between approvals no ruling is created. A lane's pick is a recommendation until the owner has seen the package it belongs to.

## 5. Risks and what is not known

- **The climb may not settle.** If a party swings between steps and never holds one, package 3 needs a different rule. V1 answers it first, which is why it is first. (SPECULATIVE)
- **Traits may cost more text and review than they return.** A sample of five decides before a pool is written. (JUDGMENT)
- **The redesign is larger than the first build it pauses.** Waves 1 and 2 are mostly engine work on one batch at a time, so calendar time is the cost. The lanes marked Continue keep the game moving while stages 2 to 5 run. (JUDGMENT)
- **Almost all real-player evidence is thin.** A handful of accounts have played. Every reading from play in these four files is a direction, not a proof. (EVIDENCE: 15 to 16 real heroes in the calibration files)
- **This lane did not play the game today.** It leaned on one played first hour, the playtest reports and the measured runs named in each file. A blind play of the redesigned first hour is owed as soon as there is one to play. (EVIDENCE: `docs/design/overhaul/review/02-four-hero-hour.md` is the play used)
- **The assumption audit and the math strategy were written beside this lane, not before it.** Where they disagree with a package, the package is the thing to change, and that is settled before Approval B. (JUDGMENT)
