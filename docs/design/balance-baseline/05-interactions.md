# Balance baseline 05: the Interaction Analysis

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 5 of Tyler's directive of 2026-11-21, Phase 5. It stands on `04-sensitivity.md`: the same 68 cells, the same four seeds, the same engine, the same reading of an effect. Read section 1 of that page first.

**The baseline.** `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`). No gameplay number was changed. Every point is a patch on a scratch copy.

**What this is for.** Evidence of how today's formulas couple, for the lane that picks the new math. Nothing here is graded against an old ruling.

**Labels.** MEASURED (run, seeds, hours), COMPUTED, JUDGMENT, UNKNOWN.

<<FILL:SUMMARY>>

---

## 1. How an interaction is read

An experiment is a full grid over two or three levers, each at two or three levels, large ones included. Every point plays the 68 cells on the base's dice.

For a point that moves several levers, the one-at-a-time reading is what you would predict from the points that move each lever alone: for a rate, the product of the single ratios. The GAP is the measured joint ratio over that product, less one. A gap of zero means the levers can be tuned one at a time. A resolved gap means they cannot: the single readings mislead by that much. The gap is computed seed by seed, so it carries its own error, and it is called resolved by the same rule as an effect (3.18 standard errors at four seeds, and more than 1%).

<<FILL:EXPERIMENTS>>

<<FILL:LOOPS>>
