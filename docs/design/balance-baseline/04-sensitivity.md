# Balance baseline 04: the Sensitivity Matrix

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 4 of Tyler's directive of 2026-11-21, "Establish a Global Balance Baseline Before the Overhaul", Phase 4. The interaction analysis is `05-interactions.md`.

**The baseline.** Every number here was played on the overhaul's starting build, `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`), not on the live game. No gameplay number was changed. Every perturbation lived on a scratch copy inside the simulator.

**What this is for.** The overhaul is being redesigned from first principles, the math included. So this page is EVIDENCE of how today's formulas behave: which levers dominate, which do nothing, where the cliffs and caps come from. It is not a tuning guide for today's numbers, and it does not grade anything against an old ruling. Where a target matters, it is a candidate from `03-targets.md`, and every one of those is a design hypothesis.

**Labels.** MEASURED means played on the real engine, with its run, seeds and hours. COMPUTED means arithmetic on named inputs. JUDGMENT marks a call of mine. UNKNOWN means not measured, with the reason.

<<FILL:SUMMARY>>

---

## 1. What was played

**The cells.** 68 scenarios, a slice of BL-1's baseline list (`tools/balance-program/baseline/scenarios.mjs`), with the same keys, the same hours and the same four seeds. So the unpatched column here is the baseline's own number for that cell.

| Block | Cells | What it holds |
|---|---|---|
| Every way alone | 32 | The eight weapon ways, MID gear, Normal, at Levels 10, 30, 60 and 110 |
| Gear axis, alone | 12 | The hammer and the Mage on LOW and BIS gear, Normal, at Levels 30, 60 and 110 |
| Tier axis, alone | 12 | The hammer and the Mage, MID, on Dangerous and Deadly, at Levels 30, 60 and 110 |
| The four | 12 | The standard four (hammer, bow, Mage, Healer). MID on all three tiers at Levels 30, 60 and 110. LOW and BIS on Normal at Level 60. MID on Normal at Level 10 |

Each cell is on the ground the game advises for its Level and party size. That is Wickstead and the Millrace Sewer at Level 10, Mosslight Glade at 30, the Slake (alone) and the Muster Barrows (the four) at 60, and Krell's Hold at 110. So Level and ground move together in this pass. Section 9 says what that hides.

**Hours and seeds.** Four seeds a cell. A seed plays one continuous hunt under the real death rule, for 2 hours at Level 10, 4 at Level 30 and 8 from Level 60. One point is 2,592 hero-hours. Seed k plays the same dice on every tree, so each lever step is read against the base as a pair, seed by seed.

**The levers.** 51 in all (`tools/balance-program/sensitivity/levers.mjs`).

- The 35 live knobs of `tools/balance-program/formulas/knobs.json`.
- 16 families of written numbers no knob covers: respawn time, spell mana cost, spell cooldown, spell damage share, heal size, shield size, spell leech, store food price, store drink price, weapon damage, weapon accuracy, armor points, store rune price, what dropped gear sells for, the wait between pulls, and the Blessings' cut of a death. A family scales every number of its kind by one multiplier. These are not new knobs for the game. They are how the simulator moves parameters that already exist.

**The steps.** Multipliers on today's value. The usual ladder is x0.5, x0.75, x0.9, x1.1, x1.25, x1.5 and x2. A chance, a cap or an exponent takes a narrower ladder (x0.8 to x1.2), because doubling it leaves the range its formula can read. The armor curve also plays x2.4, the value the last balance pass proposed.

**How an effect is read.**

- A rate (damage, kills, XP, gold in, supplies) is read as a relative change. For each seed, the change in each cell is divided by that cell's base mean, then averaged over the cells of a group. The estimate is the mean over the seeds. Its standard error is the seeds' spread over the root of the seed count.
- A share or a signed number (low health, hunted share, net gold) is read as an absolute change, the same way.
- Deaths are pooled over a group's cells and seeds and read as a rate in 1,000 hunted hero-hours, with a Poisson error.
- RESOLVED means the estimate is further from zero than 3.18 standard errors (Student's t for four seeds) and more than half a percent. Everything else is printed with a `~` or a `.` and is not called an effect.
- ELASTICITY is ln(outcome ratio) / ln(lever multiplier). 1 means the outcome moves in proportion to the lever, 0 not at all, a negative number the other way. LOCAL is read between x0.9 and x1.1. LOW and HIGH are read at the ends of the ladder. A lever whose three differ is nonlinear.

**The proofs.** `sensitivity.mjs --selftest` plants a patch and imports the planted tree's own data: every open ground's respawn, every ability's mana and cooldown, every store price and every gear table row must hold the scaled value. `analyze.mjs --selftest` plants effects, noise and interactions in memory and reads them back.

<<FILL:REST>>
