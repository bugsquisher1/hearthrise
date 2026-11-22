# 11. Build audit, 2026-11-22

Tyler asked on 2026-11-22: "let's audit what's built so far - and have the lane check the total plan so the next account is ready to rumble." This is a read-only audit of `set/v0.2.144` at c195941cc. It checks what is built against `05-roadmap.md`, `02-architecture.md` and `07-balance-lab.md`, and ends in a lane plan for the next session.

**Evidence.** GitHub run 45011704650 on c195941cc is green except two known reds: T-02 "Level hours" and T-03 "Party class XP". Every test named below was read for what it asserts. The sidecars 1009-1056 were read. No proofs were run locally. Mutant counts and measured numbers come from the lane reports and are **assumed**, not re-verified.

## 1. Built against the plan

### Roadmap waves (05, stage 6)
| Wave | Status | Evidence and gaps |
|---|---|---|
| 1 | Partly | **Side seam: done.** baa50a181, `src/core/hunt/sides.js`, `tests/hunt-core/side-seam.mjs`. **Danger scale: server and engine, on Muster Barrows only.** fe2853cd0 and c195941cc, `src/core/hunt/danger.js`, `src/data/danger.js`, migrations 1054-1056. Tested by `tests/hunt-core/danger.mjs` and `tests/danger-db.mjs` (DZ-1 to DZ-5, viewed and closed). **Not built:** any client caller of `hr_hunt_risk_set`. The power step for Levels and gear (today the step scales only the monster pull). Readiness off the scale (on the scale it reads HP only). Roles, rows and absolute bands (a per-ground `refStep` is the bridge). The cause line. Stored sustain counters. A kills-an-hour ceiling. The tier path still runs on every other ground |
| 2 | Partly | **Company plan (FB-6):** 1049-1051, with carry-on, needs-you, setup-slots, party-flow and preset-names. Copying a plan works between your own heroes only. **Depth pay:** Muster's scale only. **Not started:** roles, rows, personal loot |
| 3 | Not started | Staged old-design work that wave 3 will rewrite: the to-hit ratio (1020-1023) and the spell rule (1027-1031) |
| 4-5 | Not started | FB-10 has not started. 1026-job-counts waits to be re-cut |
| 6 | Not started | Precursor staged: FB-12's cheap social layer (1040-1045) |
| 7 | Not started | Only the side-seam prerequisite. `team` is not persisted |

### Design packages (02)
| # | Status | Notes |
|---|---|---|
| 1 Combat | Not started | Sustain counters are read only on request (9ce754be4) |
| 1b Talents | Not started | FB-11 is paused |
| 2 Equipment | Not started | Only the server pick and wear of plain upgrades (`src/core/upgrade-pick.js`) |
| 2b Flame | Not started | |
| 3 Hunting | Partly | As wave 1 |
| 4 Party | Partly | Own heroes party with no invite. Rows, personal loot, catch-up and hiring are not built |
| 5 Economy | Not started | **There is no `wage(L)` in `src/`.** Every bought-time price depends on it |
| 6 Long game | Not started | |
| 7 Social | Partly | Only the staged layer 1040-1045 |
| 8 First hour | Partly | Slots, kits and tutorial state are staged (1036-1039). Recruits at Level 5 are built (1052, 1053; `tests/recruits.mjs`). The first party ground does not run on Steady |
| 9 Away and return | Mostly | Plan, one Start, Needs you, regear, the report's risk and rules blocks, the flush, and the HUD prediction. **Missing:** the cause line (`CAUSE_SLOT = null`), the deepest step, plan copying, the 10 h day, bought time, a stance in the plan |
| 10 Crafting | Not started | |

### Lab phases (07)
| Phase | Status | Evidence |
|---|---|---|
| 0 Trust | Done | BL-1 1ef1262f5 (1,353 cells x 8 seeds, reproduced exactly); BL-4 82c2fe7f9 |
| 1 Picture | Done | 105b07aa2 (`graph.json`, 98% sign match, `lab ask` and `lab propose`) |
| 2 Readers | Done | 9ce754be4 (17 targets still carry an `until`) |
| 3 Variants | Done | d3100221e (3 slots cut, 8 on git refs) |
| 4 New design | Not started | V1 and V2 ran on the real engine, outside the phase-4 harness |
| 5 Search | Not started | |
| 6 Economy | Not started | |
| 6b Arena | Partly | Engine seam only |
| 7 Gate | Not started | `balance-diff.yml` is a measurement, not a gate |

**Probes.** V1 passes. V2 passes in 3 of 4 cells. V3 to V11 have not started. **Approval C (the targets) and the date estimate are owed** (05: "the day V1 reads").

## 2. True but risky
- **First-pass numbers.** Stance pay is Steady 0.72x, Bold 0.88x and Careful 0.28x the hours table, from 2 seeds x 6 h at Level 60 with the opening climb included. Careful's gap comes from depth: pay is 1.007^gap with no floor under `refStep`. Under RD-Q3 a, paying Careful about a third of Steady is a design call. 120 reference kills a head and step 590 are measured at one Level: a Level 70 four holds 613.6 and earns 1.18x. `refStep` is a per-ground dial until the bands are absolute. `powerStep` 0.35% and `pullStep` 0.175% are stated values. The hours table is fitted on lone heroes, but the reference is a four.
- **Open calls the lanes made, not rulings:** a broken-off pack's killed stay dead; readiness reads HP only; after a death the stance settles one notch safer; Danger, Careful, Steady and Bold are working names (the game already has fight stances).
- **Later waves rewrite:** the staged to-hit ratio and spell rule, 1016's Level curve, 1009's refill steps (4 h, 6 a day) against the 11-22 rule (2 h blocks, x1.5, cap 2), and the tier table off Muster.
- **Contradictions:**
  - `src/data/hunt-sessions.js:175` has `STAMINA_MAX_MS` at 8 h; Tyler ruled 10 h, or 12 h with Premium.
  - T-02 waits on FB-8 (now Replaced) and T-03 enforces the 10-31 "different classes" rule the redesign drops: neither red has an exit.
  - CLAUDE.md section 3.3 says the Coordinator never resolves a conflict by hand; Tyler ruled the opposite on 2026-11-21.
  - 1056's sidecar carries no Security flag.
- **Release hazards:**
  - 49 sidecars from 1009 to 1056 read STAGED, and 33 of them have no place in the handoff's apply order. Those with no decided fate: 1020, 1023, 1031 ("retire once FB-8's catalogues hold") and 1026 ("re-cut by FB-10").
  - The edge timing rules collide: 1016 is edge-first; 1052-settle-flush and 1053-hunt-report must be before the edge, 1055 and 1056 after it; 1026 is apply-then-deploy.
  - There is no point-in-time restore, the release is about 75 files, and no restore drill has run on this chain.
  - The flush kill switch is untested.
  - Four visual passes are owed: the away card, the recruit screens, the summary and return card, and the HUD.
  - The pre-EA Security list has no single home (6 surfaces in the handoff, 18 flagged sidecars, the live `hr_stamina_refill`).

## 3. Tyler's rulings with no wave yet
The 10 h / 12 h day (the code says 8 h). Bought hunting and work blocks (they need `wage(L)` and must replace the live refill). Premium contents and FB-15. The $15 box with 30 days of Premium (no entitlement surface). The Crowns book and store, and never-breaking tools. Mounts and riding. Talent resets and saved builds (the Premium half). The Inner Flame with bought remains (tied to the remains market and Security). A naming pass, which blocks the first stance words players see. Approval C and dates. The fate of the old staged files. Companions out of combat, and the training yard into town work.

## 4. The next lanes (at most 4 at once; each from origin/set/v0.2.144 in its own worktree)

**Batch A: now, in parallel, no shared files**
- **R1 · Danger scale client half (Systems).** Send `hr_hunt_risk_set` before Start and render `danger {risk, held, playing:{hunt, from, risk, start, step, cool}}` (contract in `.claude/coordination/HANDOFFS.md`).
  - Files: new `src/session/danger-intents.js` and `danger-sections.js`; `character-session.js`, `src/shell/windows/company-pane.js` (the stance pick), `src/shell/windows/hunts.js` (the stance and held step replace the tier row on scale grounds), `src/shell/hud.js`, text, `refusal-words.js`.
  - Tests: new `tests/danger-client.mjs`, plus client-intent-surface, refusal-words, text-home, session-core, envelope-contract, no-client-copy-of-projection, module-preload, layering, dead-exports, boot path.
  - Done when: Steady, then Start on Muster, shows the HUD step rising, the same after a reload, and no tier picker on Muster.
- **R2 · Fall-back causes and report columns on the server (Backend).** Store `falls[]` `{from, to, hero, pm, monster}`, the deepest step, and `risk_end` / `danger_end` in the hunt view and past hunts.
  - Files: `danger.js` (pullEnds), `tally.js`, migration 1057, hr-accrue.
  - Tests: tally, danger, hunt-sessions-settle REPORT viewed and closed, hunt-report, per-player-cost, settle-budget, engine-parity, schema-drift, edge-bundle, live-hash.
  - Done when: a viewed and a closed hunt store the same `falls[]`.
- **R3 · Design packet (game designer, docs).** `docs/design/redesign/12-targets.md` (Approval C, from V1 and V2), plus a recommendation on:
  - the stance pay gap (a pay floor for Careful?);
  - whether readiness reads mana;
  - the broken-off pack;
  - the settle after a death;
  - `refStep` by Level;
  - re-aiming T-02 and turning T-03 into V4;
  - the fate of the 33 unlisted staged files;
  - the naming pass.
  Only real-money and grant calls go to Tyler.
- **R4 · Lab phase 4 slice (matrix lane, tools).** The power step as a variant (`weightGear` and `weightSkill`) against C0 at Levels 20 to 400, and re-measure stance pay from a held start with 4 or more seeds. Files: `tools/balance-program/variants/hero-power/*`, `monster-formula/*`, `rule-slots.json`, `redesign/v1-climb.mjs`.

**Batch B: after A merges**
- **R5 · Report depth pieces and the cause line** (depends on R1 and R2). "Held 606 on Steady; fell back: hero at 23% to a Brute", from server counters only.
- **R6 · Release readiness (QA)** (after R3). A read-only `tools/release-plan.mjs` with its test, walking all 49 sidecars in order with the edge point and refusing an order that cannot be met. Re-aim or retire T-02 and T-03. One pre-EA Security file. A restore-drill rehearsal on a copy of production.
- **R7 · The owed visual passes** (art director, browser pane, QA account, desktop first; after R1).
- **R8 · The ruled day and bought hunting blocks** (after R1). 10 h free, 2 h blocks x1.5, cap 2, priced on today's base and marked as a lever until `wage(L)` exists. Migration 1058 with a journalled `hr_time_buy(kind, slot, idem)`. Done when a hero hunts 10 h, buys two blocks, and a third is refused.

**Batch C**
- **R9 · The power step in the engine, on scale grounds** (after R3 and R4). Done when one gear tier moves the held step by about 20.
- **R10 · Open the scale beyond Muster** (after R9). 3 or more grounds.
- **R11 · Finish FB-12: remove the party finder** (with Batch B, not beside R1 or R8, because it shares `src/data/text/hunts.js`).
- **R12 · FB-10 slice 1:** company-owned trade Levels and a per-hero daily work cap (after R8).

**Overlaps:** R1 runs before R8 and R11; R2 runs before R9. Any two lanes in `src/core` re-raise the edge-bundle ceiling with its tool.

## 5. Top five risks
1. **A big-bang release with no restore** (about 75 files, edge constraints). Fix: R6's generated order plus one restore-drill rehearsal on a copy of production.
2. **Wave 1's power step is really a combat rewrite** that overlaps wave 3. Fix: prove it as a Lab variant (R4) before the engine lane (R9).
3. **The stance numbers rest on 2 seeds,** and Careful at 0.28x may push everyone to Bold. Fix: R4's re-measure and R3's pay-floor call before players see a stance.
4. **Permanent reds normalise "green except known."** Fix: R6 re-aims T-02 and T-03, or retires them with proof.
5. **Money surfaces are growing faster than the review list** (refill, blocks, Crowns, the $15 box, recruits, wear moves, bought remains). Fix: one pre-EA Security file in R6, with every sidecar's flag folded in.
