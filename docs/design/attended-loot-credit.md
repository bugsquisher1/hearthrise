# Attended loot credit — the settle stops re-simulating an attended fight

**Status:** BUILT on `feat/attended-loot-credit-lootonly`. **LOOT ONLY.**
**Nothing applied. Nothing deployed.** The migration carries a REVIEW-ONLY header; it needs a
Security GO before the Coordinator applies it, and the Edge redeploy is gated on the same GO.

## 0a. What the Security review of 2026-09-04 changed — read this first

The first draft of this change had two halves. The **loot** half was reviewed
**GO-with-conditions**; the **food** half was reviewed **NO-GO** and has been **CUT**, not
patched. This branch is the loot half alone, plus the conditions, plus one hole the review did
not name and this document's own measurement found.

| | |
|---|---|
| **CUT — the food half** | The settle no longer proposed a food debit over a window it believed was attended, handing the debit to the client's `eat` intent. Its gate was `combat_xp_accrued_to`, which `hr_credit_combat_xp` — granted to `authenticated`, with no early return for an empty `p_xp` — advances to `now()` for **any** caller. One `POST /rpc/hr_credit_combat_xp {"p_slot":N,"p_xp":{},"p_idem":"<uuid>"}` before each settle armed the suppression across the **whole** credited window: **826 units of tradeable food preserved over a 10 h span, with no journal entry at all**, and reachable with `attended: null` — i.e. on a database without this migration and on every degraded ladder rung. §3.4 now records the finding and the successor design. **The settle remains the sole food debiter, exactly as production is today.** |
| **C5 — ops** | §9. The deployed bundle sha, the rollback, and two watch queries with thresholds. |
| **C6 — the upper edge** | The projection took no upper bound, and the engine calls it from a transaction that starts **after** the one whose `now()` the watermark advances to. Credit rows committed in that gap were paid *and* re-projected next settle. `p_upto` closes it; it is clamped so it can only ever shrink the window. §3.1. |
| **C8 — bounds honesty** | The "four bounds" claim oversold. Bounds 3 and 4 are **inert** — measured. §2 now says so. |
| **Operational** | The file must be applied in one transaction (`create or replace` grants EXECUTE to PUBLIC and §1b's revoke is the next statement). §1c **refuses the apply** if it finds itself in autocommit. |
| **NEW — found here, not in review** | The gear cap says nothing about **survival**. A maxed-skill character in a bronze sword pointed at `the_silence` simulates **0** kills and caps at **5,200** — the top-up paid the whole ceiling: **2,267,639 gold and 6,900 tradeable units a day**, against an honest production maximum of ~8 k gold/hour. `ATTENDED_MAX_FIDELITY` closes it. §2, guard A9. **This must go back to Security.** |

## 0b. The SECOND Security review of 2026-09-04 — BLOCKED on F1, five conditions

The re-review signed the projection, the Edge plumbing and the sim-relative ceiling (verified
catalogue-wide: ~100 monster×gear combinations, **0** rows where the honest sim is 0 and the
attacker is positive, max kill multiple exactly **3.00**) and **BLOCKED on F1 alone**.

| | |
|---|---|
| **F1 — THE BLOCKER, now fixed** | The top-up bound Boss-of-the-Day **once**, at `attWindow.toMs`, while `simulateSpan` rebinds it **per UTC-day segment** (`combat-sim.js:117` states the contract; `away.js utcDaySegments` is the segmenter). A settle whose attended window crossed UTC midnight therefore priced **every** top-up kill at the later instant's boss. **Measured on this engine before the fix** — 2 h window 23:00–01:00 UTC, maxed character, five seeds, top-up units/kill against the span's own: **1.23–1.28×** pointed at the later day's boss, **0.80–0.87×** pointed at the earlier one, 0.97–1.00× on a boss featured on neither. ×1.5 daily / ×2.0 weekly **on the drop half**, multiplicative with the 3× fidelity ceiling → up to **4.5× / 6.0×** the honest away unit rate; and the mirror case is the same confiscation this change exists to end. **FIXED:** §5a-BOTD segments the top-up with the existing `utcDaySegments` and rebinds `botd` per segment, allocating kills by cumulative floor so the parts sum exactly. Weekly needs no second pass — `utcWeekKey` is Monday-aligned, so every week boundary **is** a day boundary. **Guard: A10**, daily *and* weekly arms, both roles, **four parts**, proven RED by `--mutate=botd_single_instant` (the shipped defect, one token changed), `--mutate=botd_segment_end`, `--mutate=alloc_per_segment_floor` and — after Security escaped parts (a)–(c) — `--mutate=alloc_all_to_last` and `--mutate=alloc_all_to_first`. **Part (d) is what closes the ALLOCATION dimension; the follow-ups table below records why (a)–(c) do not.** |
| **F2 — pin the constant by value** | A2, A6 and A9 all derived the ceiling *from* `ATTENDED_MAX_FIDELITY`, so **raising it to 10 left every test green**; A9's honest pin only caught lowering. A6 now carries `ok(ATTENDED_MAX_FIDELITY <= 3)` with the 1.7×1.3 derivation in the message. |
| **F3 — make the pin DERIVED** | 3 is calibrated to the magnitude of a defect the team intends to fix; when span-sim fidelity lands, the honest ratio falls to ~1.0–1.3 and a static 3× becomes a standing faucet with nothing going red. A6 now also asserts `ATTENDED_MAX_FIDELITY <= ceil(measuredHonestGap × 1.3)` — **measured this run: 15/7 = 2.143, ceil(2.143 × 1.3) = 3**, so it is green today and goes red the moment the control sim reaches 10 kills on that fixture. A floor assertion is paired with it so the derivation cannot invert into a confiscation. **The sample is n = 1 — AND n = 1 IS THE ENTIRE DATASET.** Not a shortcut and not a sample of convenience: production holds **7** rows in `hr_kill_credit_log` across **2** users, and **exactly one** window carries both a sim result and an attended credit. There is no second observation to average with and there will not be one until this ships and journals its own. Both derivations (production 15/9 and the fixture's 15/7) rest on that one session. **Security's ruling, 2026-09-04: ship it, then RE-DERIVE from live `meta.att` after 7 days.** The cheap widening ships with this change — `meta.att` journals `{claimed, cap, sim, top}` on every attended settle, so week one re-derives the ratio from thousands of honest windows. That re-derivation is a **scheduled obligation**, not an aspiration: §9.5's first-week readings must carry it. |
| **F4 — one word, and the gate stays** | §1c said the autocommit window makes the function "callable by `anon`". **Measured on production in a rolled-back probe:** the apply path's `current_user` is `postgres`, `pg_default_acl` for functions in `public` created by postgres is `{postgres=X, service_role=X}`, and a fresh function reads `anon=false, authenticated=false, service_role=TRUE`. The word is **`service_role`**. The gate stays: `supabase_admin`-created functions in `public` *do* get `anon`+`authenticated`, and PGlite has no default-ACL row at all and falls back to the built-in `PUBLIC=X`. §1b's four-role enumeration is **load-bearing** — a bare `revoke ... from public` does not remove a default-ACL grant to a *named* role. |
| **F5 — the two apply-time documents** | The migration header and `tests/schema-apply-order.json` still described the four-bound list and the `min(attended,cap) − sim` formula the review rejected. Both restated to the shipped formula, C8's two-bounds framing, and the composite bound below. |

### The composite bound — measured here, and it disagrees with the review

The two live ceilings compose as a `min()`, so the real bound on a forger is

> `min(1.3 × this character's PHYSICAL-MAX kill rate, 3 × the AWAY-SIM rate)`

Measured on the shipping engine across **1,944 combinations** (every monster × {full
best-in-slot, bronze sword, bare-handed} × {maxed, fresh} × {60 s, 1 h, 12 h} settle cadence).
The **gear** cap binds in 802 of the 1,111 paying combinations, the fidelity ceiling in 306.

| worst case reached, per character-day | measured | of the LIVE budget | vs. the same character's honest away rate |
|---|---|---|---|
| gold — `grim_reaper`, maxed + full BIS, 12 h cadence | **4,301,068** | **17.20 %** of 25,000,000 | ×2.32 |
| item units — `wolf`, maxed + bronze sword, 60 s cadence | **133,920** | **0.19 %** of 70,000,000 | ×2.74 |

**Two disagreements were raised with the review's 1,533,780 gold/day (6.14 %) and 120,060
units/day (12.01 %). SECURITY RE-SWEPT AND UPHELD BOTH (2026-09-04, third pass).**

* **Gold: this sweep was 2.80× higher, and Security's re-sweep reads higher still.** 17.20 %
  against the original 6.14 %. The gap was gear; the first review's sweep did not include a full
  best-in-slot loadout on an apex boss, which is exactly the character who would run this.
  Security's own re-measurement lands at **4,591,752 gold/character-day worst MARGINAL** (the
  top-up's own contribution) and **7,205,376 gold/character-day worst ATTENDED TOTAL** — i.e.
  slightly **above** the 4,301,068 in the table, so the figure in this document is a floor on the
  worst case, not a ceiling. **This is still the number to attack.**
* **Units: the review's 12.01 % was computed against a superseded budget — upheld exactly.**
  `c_day_qty_budget` was raised 1,000,000 → **70,000,000** by `2026-08-16-day-budget-artisan.sql`
  (verified live, above), so the true figure is **0.19 %**. Security's re-derivation matched this
  document's to the digit.

> ### ⚠ 0.19 % IS NOT COMFORT AND MUST NOT BE QUOTED AS IF IT WERE
>
> `hr_day_budget_limits()`'s own body says it: unit-count bounding *"stopped being meaningful once
> one tick can mint a thousand units of a 1-gold item"*. The qty budget bounds **count**, not
> **value**, and this surface's whole point is that the counts are of *drop-table* items.
> **In catalogue VALUE the same sweep reads 34,819,200 gp-value per character-day attended, of
> which 23,932,800 is the top-up's own marginal contribution** — against a 25,000,000 gold/day
> budget the qty budget does not touch. So: **gold is the load-bearing dimension.** Price any
> future review of this surface in gold and in catalogue value; a units percentage is a statement
> about the fuse, not about the economy.

**And the gear model is the worst one, not merely a plausible one.** The first sweep scored
equipment on `atkB + strB` only, which ignores `defB` and `spdB` — both of which could in
principle *raise* the bound (defence lifts survival, so it lifts `sim` and therefore the 3×
ceiling; a faster weapon lowers `tickMs`, so it lifts the gear cap). Re-measured with four
loadout models across seven monsters and two cadences:

| loadout | worst gold/day (`grim_reaper`, 12 h) |
|---|---|
| **offence-only — the figure above** | **4,301,068** |
| armour by `defB`, weapon by offence | 4,236,828 |
| mixed score | 4,233,374 |
| armour by `defB`, weapon by `spdB` (`emberfang_blade`, tick 2328) | 2,955,044 |

Offence-only wins because every model already survives (`died = false` in all 56 runs, on a deep
food stack), so defence buys the forger nothing, and the heavier armour's slower tick costs more
cap than the survival is worth. **The figure above is a maximum, not a lower bound.**

Gold is therefore the dimension that matters, and the headroom below is quoted against
**Security's** re-sweep rather than this document's, because theirs is the higher one:

| against the 25,000,000 gold/day budget | measured | headroom |
|---|---|---|
| worst **MARGINAL** — the top-up's own contribution | 4,591,752 | **×5.44** |
| worst **ATTENDED TOTAL** for one character-day | 7,205,376 | **×3.47** |
| best **honest away-only** day, maxed + full BIS | 2,839,512 | ×8.80 |

The middle row is the one an operator should hold in mind: the budget bounds a character's WHOLE
day of gold, not the marginal slice this change adds. **×3.47 is the real clearance** — and it is
a long way from the "23.8×" `hr_day_budget_limits()`'s own header still claims. That stale
calibration is **S4** in the follow-ups below and belongs to a different lane; this change does
not move it. **A fuse should not be the thing that discovers the drift.**

### The third Security pass — two conditions LANDED, four findings RECORDED

Security signed off: *"Not blocked. The design is right, the containment is right, F2–F5 are
delivered, and the F1 defect I blocked on is genuinely fixed."* Two blocking conditions came with
it and both are landed on this branch; four further findings are **written down rather than
built**, so the next toucher inherits the measurement instead of re-finding it.

| | what it is | state |
|---|---|---|
| **C1** | **A10's payment reference was self-referential.** Part (b) blends `fracA·refA.rate + fracB·refB.rate` with `fracA`/`fracB` taken from `cross.segs[i].kills` — *the code under test* — so a defect in the ALLOCATION dimension moves the reference in lockstep and reads 1.000. Parts (a) and (c) check segment count, start instants, per-segment `dropMult`, the sum identity and `mults.size >= 2`, every one of which survives a mis-proportioned split while both segments hold a kill. Security proved it by running this harness with the allocation replaced by *"segment 0 gets one kill, the final segment gets the rest"*: **`all checks pass (A1-A10 engine, C1-C9 chain)`** while payment inflated ×1.197 (`zombie` 2,007 → 2,403 units), ×1.170 (`panther`), ×1.060 (`death_knight`) — F1's over-pay restored at ~99 % strength with A10 green. The mirror passed identically. | **LANDED — A10 part (d):** a deterministic integer identity, zero RNG, recomputed from `utcDaySegments` and the reported total alone, asserted on the symmetric *and* the asymmetric window. Plus two mutation arms that are exactly Security's two escape runs, planted: **`alloc_all_to_last`** and **`alloc_all_to_first`**, both RED. |
| **C2** | The settle envelope handed the client `attendedKills` / `attendedTopUp` / `attendedCap`. **`attendedCap` is the exact threshold Watch B's `rows_at_the_cap` line keys on** and `claimed`/`sim` is the ratio `median_claim_over_sim` keys on, so a forger reading its own receipt could sit one unit under every per-settle line forever. | **LANDED:** the three are stripped from the envelope; `attendedChannel` stays (a deployment fact — 'live'/'absent'/'degraded' — not a calibration, and it names no number). All four remain in `meta.att`, which is where the watches read them and which no client can `select`. Zero consumers in `src/`, grepped before and after. |
| **S2 — MEDIUM, OPEN** | **Boundary arbitrage.** `hr_attended_kills` has **no per-day split**: the `w` CTE is `group by l.target`, one count per target for the whole window, so the engine has no choice but to assume a **uniform kill rate** — and that rate is one the *player* controls. Farm tomorrow's boss just before 00:00 UTC and hold the settle window open across the midnight, and the uniform-rate allocation prices part of that burst at the wrong day's multiplier (either direction). **Bounded ≤ ×1.20 on a symmetric window** — the same magnitude F1 had, because it is the same lever reached from the data side instead of the code side. | **RECORDED. Real fix:** `group by l.target, public.hr_utc_day_key(l.created_at)` and allocate from **real per-day counts**, which deletes the estimator rather than tightening it. Not built here: it changes the projection's return shape and therefore re-opens the engine contract — a second review, not an amendment. **Security names "Watch C" as the interim control. ⚠ THERE IS NO WATCH C** — §9 of this document defines Watch A and Watch B only, and a repo-wide grep finds no third query. Either it lives in Security's review and must be transcribed into §9 **before** this deploys, or the interim control is Watch A/B alone and S2 is uncovered. **Flagged, not resolved, and deliberately not invented here.** |
| **S3** | — | **CLOSED — it became C2 above.** |
| **S4 — NOT THIS LANE** | `hr_day_budget_limits()`'s header claims 25,000,000 gold is **"23.8× the measured honest maximum"**. That derives from `2026-08-11-daily-budget.sql`'s honest max of 1,049,186 gold/day and predates the current gear tier. **Security measured honest away-only BIS at 2,839,512 gold/day and calls the real headroom ×3.47.** ⚠ The arithmetic needs settling **in that lane**: 25,000,000 / 2,839,512 = **×8.80**, while 25,000,000 / 7,205,376 (the worst *attended total* above) = **×3.47** — the two answer different questions and the header should say which it means. Either way "23.8×" is wrong by between 2.7× and 6.9×. | **RECORDED. Owner: whoever next touches the day-budget calibration.** This change does not move that header and must not be blocked on it. |
| **S5 — ACCEPTED** | The ±60 s edge slack when `attWindow` clamps the attended envelope into `[credit.fromMs, credit.toMs]`. | Accepted as-is. |
| **S6 — ACCEPTED** | Only the **pointer's** target is spent, so a non-pointer target's credits age out unpaid — **under-pay**, self-only, bounded by 60 s of attended play. Already stated as known limitation 4b. | Accepted as-is. |

### Accepted residuals — stated, not closed

* A forged claim still buys **up to the composite bound above** for the forger's **own**
  character. Self-only, journalled in `meta.att`, reversible, and it PAGEs on Watch A at the top
  of the range.
* **Sub-threshold forgery at ~2.4× evades both watches.** Not closed here.
* **The Watch A thresholds are provisional and must be re-derived after week one** — see §9.2,
  where this document's own measurement now says they are worse than provisional.
* §1c cannot see an applier that chunks the file between §1 and §1b.

---

**Authority:** `CLAUDE.md` → "Server authority (locked 2026-08-10)" and
[`server-authority.md`](./server-authority.md). Where anything here conflicts, those win.
This document is the fourth consumer of the root named in
[`combat-authority.md`](./combat-authority.md) §0 — after the bounty counter (Part 1), combat
XP (Part 2) and the daily kill goal (Part 3). **Loot and food are the fourth and fifth.**

---

## 0. The measurement — production, 2026-09-04, QA account slot 2

Not reconstructed. Read off `nezapsylztqbbwuwembx` with `execute_sql`, three tables.

**`player_ledger` id 13175** — the one `combat / accrue` row for the window:

```
gold 55  gold_in 55  xp_in 0  qty_in 16   at 16:10:02.395918+00
meta { ms: 168862, from: 16:07:12.983Z, to: 16:10:01.845Z,
       kills: 9, ticks: 70, ate: 8, capped: false,
       delta: { g: 55, i: { bones: 9, shrimp: -8, goblin_ear: 7 },
                k: [accrued_to, fight, hp, progress] } }
```

**`hr_kill_credit_log`** — the same window, the same character:

| created_at | target | claimed | credit | cap | applied | free |
|---|---|---|---|---|---|---|
| 16:07:21.769 | goblin | 1 | 1 | 19 | 1 | t |
| 16:08:22.708 | goblin | 5 | 5 | 132 | 5 | t |
| 16:09:22.770 | goblin | 6 | 6 | 130 | 6 | t |
| 16:10:23.729 | goblin | 3 | 3 | 45 | 0 | t |

**`player_state` slot 2:** `auto_eat_enabled = true`, **`auto_eat_food = NULL`**,
`auto_eat_pct = 25`, `hp = 1/10`.

### What that says, arithmetically

* **The server already knew the attended kill count. It is 15.** `sum(credit) = 15`,
  `sum(claimed) = 15`, and **not one row was throttled** — the plausibility caps (19, 132, 130,
  45) were never binding. The number is server-computed, server-clamped and journalled.
* **The settle simulated 9.** `meta.kills = 9` over `meta.ticks = 70`
  (168 862 / 70 = 2 412 ms — the correct gear-derived swing, so the tick budget was right; only
  the *fight* differed).
* **Loot paid = 16 units + 55 gold, for 9 kills.** Loot shown = 26 units, for 15.
  Units per kill: server 16/9 = 1.78, client 26/15 = 1.73. **The drop rate per kill matches.**
  The whole loot shortfall is the kill shortfall.

> **The quantified gap: 15 − 9 = 6 kills. 6 × 1.73 = 10.4 units. Observed gap 26 − 16 = 10.**
> **38 % of a three-minute session's drops evaporated on reload**, and the server had the
> evidence to pay them sitting in its own append-only log the whole time.

### And the food is worse than "not debited" — **recorded, NOT fixed here**

> This subsection describes the second half of the incident. **This branch does not address
> it** — see §3.4 for the measurement that killed the first attempt and for the ordered
> recommendation (backfill `auto_eat_food`, retire the max-ratchet, and only then consider a
> ledger-backed suppression). The settle debits food exactly as production does today.

`meta.ate = 8`, `delta.i.shrimp = -8`. **`shrimp` is RAW Shrimp** (`src/data/items.js:149`,
`heals: 3`) — the `first_cook` input. The client ate **`cooked_shrimp`** (`heals: 8`).

So the two sides ate **different stacks, different counts, at different instants**:

* the client's 7 `cooked_shrimp` were never debited anywhere → restocked on reload
  (`reconcileInventory`'s max-ratchet, `src/net/accrue.js:2601`, plus a `pending-consume` hold
  that expires unbacked);
* 8 `shrimp` the client still believes it owns were destroyed server-side → they will vanish
  from that player's bag the next time anything reads server truth.

The cause is one NULL: `auto_eat_food` is NULL, so `chooseFood` (`src/core/auto-eat.js:352`)
falls through to `cheapestSufficientFood` → `bestHealingFood` **over the server's own bag**,
which by then held no `cooked_shrimp`. Two independent choosers over two divergent bags.
It compounds the loot gap: the server healed 8 × 3 = 24 HP where the client healed 7 × 8 = 56,
which is a large part of why the server's 10-HP character finished the window on **1 HP** and
realised 60 % of the kills.

---

## 1. Root cause, in one sentence

**`computeAccrual` prices `[accrued_to, now]` by re-simulating it as an UNATTENDED span** —
`ctx.away = true`, server-seeded RNG, server auto-eat, `simulateSpan` truncating on death
(`supabase/functions/hr-accrue/accrual.js:1360-1410`) — **and it is the only writer of loot and
gold.** An attended window was fought by a different fight with a different RNG stream, so the
server's outcome is a *different, smaller* fight and the client's prediction is retired down to
it (`src/net/predict.js` coverage-retire; `src/net/accrue.js reconcileInventory`).

Kills, the bounty counter, the daily goal and combat XP do **not** show the symptom because each
already bought a cadence credit — `hr_credit_kills` (b484/b485/b501) and `hr_credit_combat_xp`
(b486). **Loot, gold and food never got one.** That is the whole defect.

---

## 2. The decision

> **The settle stays the single loot writer. It gains ONE new server-owned input — the attended
> kill count the server has already accepted and capped — and TOPS UP the loot for the kills its
> own simulation missed, through the same `resolveKill` the live tick runs.**
>
> **The client never names an item, a quantity, a price or a timestamp. It never names anything
> new at all: the input is read out of `hr_kill_credit_log`, a table the client cannot write.**

### Why this and not the alternatives

| Option | Verdict |
|---|---|
| **A. Top-up inside the settle, from the credit log** | **CHOSEN.** No new client-reachable verb. No new trusted client value. One loot writer, one delta, one `hr_apply` call, one ledger row. The double-pay guard is the one that already exists: `accrued_to` advances in the same transaction that pays, so a credit row is inside the window exactly once. |
| B. Roll the drop table inside `hr_credit_kills` (PL/pgSQL) | **Rejected.** The roll is not `m.drops` alone — it is `rollDropTable(m.drops, {dropMult: weakness(m), dropBuff: bonus('dropRate'), featuredMult: botd(id)}, rng)` plus `applyGoldFind(rng.int(m.gp[0], m.gp[1]), bonus)` (`src/core/combat-sim.js:103-160`). Re-expressing element weakness, the perk stack and the Boss-of-the-Day rotation in SQL is a **second copy of the game**, which is the `unifyObject` failure this codebase has already been burned by (`src/main.js:36-50`). A generated *catalogue* is fine; generated *logic* is not. |
| C. A new Edge verb `credit_loot` | **Rejected.** It would add a client-reachable money verb, a second cap to keep in step with the settle's, and a race between "the Edge read a cap" and "Postgres re-derived it". Option A gets the same payment with **zero** new client surface. |
| D. "Attended-window flag" from the client | **Rejected.** A client-asserted interval is a client-authored timestamp on a paying path (the rule is `now()`, always), and "I was attended" still does not tell the server the fight's outcome — the sim would keep guessing. |
| E. Span-sim fidelity (feed real buffs/gear so the sim stops under-realising) | **Rejected as the fix; ACCEPTED as a tracked debt, and it is bigger than it looks.** The sim's RNG stream is not the client's, so even a perfect-fidelity sim resolves a *different* fight — fidelity narrows the gap, it cannot close it. But the production row shows the gap is **systematic, not variance**: 70 ticks and 9 kills server-side (≈1.9 damage/swing) against 15 client-side (≈3.2) on the identical character, **~1.7×**. That number is what forces this change's cap to leave a 1.8–3.1× multiple over the away rate (see below), so E is the thing that closes the residual properly. Not built here; named, measured, and now visible on every ledger row as `meta.att.claimed / meta.att.sim`. |
| F. Make the live client tick deterministic from a server seed, then replay it | **Rejected.** It is the true end state and it deletes this whole class — but it hands the player their own future rolls, which re-opens review finding S20 (time a collect to land a rare drop). It is a program, not a fix. |

### What bounds it — and the honest statement about tradeability

Most combat mats **are** tradeable, so the cap is what protects the shared economy.

> **CORRECTION, Security condition C8.** An earlier draft of this section listed **four**
> bounds. That oversold it: **only two are real**. Bounds 3 and 4 were measured and are
> **inert** — they are fuses against a pathological input, not controls on this faucet, and
> listing them alongside the two that bind made the containment look four-deep when it is
> two-deep. The list below says which is which, with the measurement.

#### The bounds that BIND

1. **The engine's physical re-cap, from the player's OWN server-owned gear** —
   `attendedKillCap`. The `hr_credit_kills` SQL cap uses a 600 ms global swing floor and a
   *best-in-slot* max hit (`src/core/kill-time.js`, deliberately loose because it was gating a
   *counter*). That is **130 goblin kills/minute** and far too loose to be an economic bound.
   The engine re-caps with the numbers the SQL side does not have:
   `minKillMs = max(tickMs, ceil(monsterHp / playerRolls(m).maxHit) × tickMs)` where `tickMs` is
   `deriveTickMs(equipment, items, style)` — from `player_equipment` and
   `player_state.combat_style`. Measured: **22 kills over the 169 s window against the SQL cap's
   365 — 16.6× tighter** — and it scales with the player's real gear rather than the global best
   item.

2. **The SIM-RELATIVE ceiling — `ATTENDED_MAX_FIDELITY × sim`, and it is NEW on this branch.**
   Bound 1 is physics-from-gear and **says nothing about whether the character survives**, which
   is a hole with no floor. Measured on this engine, 2026-09-04: a maxed-skill character holding
   a bronze sword, pointed at **`the_silence`** (hp 364, atk 99, gp 292–614), over 24 h — the
   away simulation realises **0 kills** (it dies on the first exchange) while `attendedKillCap`
   reads **5,200**, because max hit is high and survival is not in the formula.
   `min(claimed, cap) − sim` then pays the whole 5,000-claim ceiling:

   > **2,267,639 gold and 6,900 tradeable units a day** — against an honest production maximum
   > of ~8,100 gold per paid hour (measured, `player_ledger`, 30 days). The non-additive
   > `− sim` subtraction protects nothing when `sim` is zero.

   Nothing gates which monster a character may point at — `set-activity.js` checks
   `catalogueHas(MONSTERS, id)` and nothing else, deliberately — so the fixture is reachable by
   anyone who can forge an `hr_credit_kills` claim, which **is exactly what this change
   monetises**: from a counter into gold. The ceiling `min(claimed, cap, sim × 3) − sim` closes
   it, and `sim = 0` pays zero by arithmetic rather than by a special case. **3** is
   `1.7 × 1.3` (measured systematic under-realisation × the ruled variance allowance) rounded
   up; the measured honest worst case on the guard's own fixture is **2.14×**, so an honest
   player keeps ~1.4× of headroom. Guard: **A9**, and `--mutate=unsurvivable_topup`.
   **This finding is not in the Security review and must go back to it.**

3. **`min(attended, cap) − simulated`, floored at 0.** The settle already paid its own kills, so
   the total for a window is `max(sim, min(attended, cap, sim × 3))` — never `sim + attended`. A
   forged count competes with the server's own simulation rather than adding to it.

#### The bounds that DO NOT bind — measured, and stated so nobody counts them

4. **`hr_apply`'s per-call clamps and the per-UTC-day budget** (1 M of any ONE item and 12 M XP
   per skill per call; **25 M gold, 70 M item units, 120 M XP and 5,000 gems per
   character-day**). ✓ **RE-VERIFIED 2026-09-04 against production** —
   `select public.hr_day_budget_limits()` returns
   `{gold 25000000, qty 70000000, xp 120000000, gems 5000}`, set by
   `2026-08-16-day-budget-artisan.sql`, which **supersedes** the 1 M qty / 40 M xp in
   `2026-08-11-daily-budget.sql`. This paragraph was right and two other documents were not: the
   migration header and the Security review both quoted the superseded 1 M and so understated the
   unit headroom by 70×. Both are corrected. **Inert**, confirmed — measured with the real engine
   at the maximum forged rate:

   | fixture (24 h, saturating claim) | one call: items | one call: gold | per day ×2: items | per day ×2: gold |
   |---|---|---|---|---|
   | fresh / bronze sword / goblin | 8,328 = **0.83 %** | 26,488 = **0.05 %** | **0.012 %** | **0.11 %** |
   | maxed / bronze sword / goblin | 39,124 = **3.91 %** | 125,861 = **0.25 %** | **0.056 %** | **0.50 %** |
   | maxed / `the_silence` (pre-fix) | 6,900 = **0.69 %** | 2,267,639 = **4.54 %** | **0.010 %** | **9.07 %** |

   The worst cell is 9 % of one budget. A fuse that trips at eleven times the worst reachable
   abuse is not a control, and the pre-fix `the_silence` row is the proof: the day budget would
   have let that faucet run all day. Security measured the same surface independently at 7 % and
   0.9 %; the conclusion is identical.

5. **The read function's own per-call ceilings** (`c_max_kills = 5000`, `c_max_targets = 8`).
   **Inert as an economic bound, and load-bearing as something else.** They fuse a pathological
   log, not a forger — but note that `ATTENDED_MAX_KILLS = 5000` also means that over a long
   span the settle's own simulation exceeds the claim ceiling outright (measured: 5,322 sim
   kills over 24 h on the fresh fixture, 25,074 on the maxed one, top-up **0** in both). **The
   top-up is only ever meaningful on short spans**, which is what it exists for.

**The residual, stated.** Bounds 1 and 2 leave an honest-rate multiple, and it is not zero:

| fixture | span | SQL cap (`hr_bounty_kill_cap`) | **engine cap** | server's own away sim | honest attended (prod) |
|---|---|---|---|---|---|
| fresh char, bronze sword, goblin | 169 s | **365** | **22** | 7 | 15 |
| maxed skills, goblin | 90 s | 195 | **48** | 27 | — |

* Against the cap that let the row into the log the engine cap is **16.6×** tighter (fresh) and
  **4.1×** (maxed).
* Against the *honest* attended rate it leaves **1.47×** headroom — thin, deliberately.
* Against the server's **own away simulation** of the same character it is **3.1×** (fresh) and
  **1.8×** (maxed), and bound 2 now caps that at **3.0× by construction** rather than by
  fixture. **That multiple is the residual exposure and it should be the review's focus.**

The multiple exists because the away sim under-realises damage relative to the live client. That
is not variance — it is systematic and *measurable in the production row*: 70 ticks, 9 sim kills
(≈1.9 damage/swing) against the client's 15 (≈3.2) on the identical character. **~1.7×, and it
is option E above** (span-sim fidelity). Closing E shrinks the multiple toward 1.3 by
construction, because the cap and the sim are then measuring the same fight; that is the right
way to close the residual, and it is separate, tracked work rather than something this change
should fake by tightening the cap until honest players are throttled.

Two things make the residual **detectable** rather than merely bounded, and both ship here:

* **`meta.att = {claimed, cap, sim, top}` on every accrue row.** `claimed / sim` is the forgery
  signal: honest play clusters near the ~1.7 fidelity ratio, a forger runs the claim to the cap.
  One aggregate on a row that already exists — never a row per kill (§6). **§9 turns it into two
  watch queries with thresholds**, because "bounded and journalled" is "bounded and unread"
  without them (Security condition C5).
* Every throttled claim is **already** journalled by `hr_credit_kills` as
  `kill_credit_throttled:<target>`, unchanged by this file.

A6 and A9 in `tests/attended-loot-credit.mjs` assert the multiples **by value** on three
fixtures, so a change that loosens either cap re-opens this review by name rather than by
judgement.

---

## 3. The contract

### 3.1 New RPC — `hr_attended_kills(p_user uuid, p_slot int, p_upto timestamptz) → jsonb`

```
select public.hr_attended_kills($user, $slot, $upto)
→ { ok: true,
    from:   "<iso>",           -- min(created_at) of the rows in the window
    to:     "<iso>",           -- max(created_at)
    total:  <int>,
    kills:  { "<monster_id>": <int>, … } }     -- at most c_max_targets keys
→ { ok: false, error: 'no_character' }
```

* `language sql`, **`stable`**, `security definer`, `set search_path = public, pg_catalog`.
  `stable sql` is the strongest read-only shape in this repo (link 6 of
  `HR_GRANT_HYGIENE_CHAIN` makes the same claim for `hr_bestiary_of`/`hr_collection_of`/
  `hr_renown_of`): there is no PL/pgSQL body through which a later edit could smuggle a write
  without the language keyword changing.
* **The window is `(player_state.accrued_to, least(p_upto, now())]`.** No new watermark:
  `accrued_to` already advances in the same transaction that pays (`server-authority.md` §3), so
  a credit row is inside the window **exactly once**, structurally, for the same reason
  double-collect is impossible. A settle that refuses (`too_soon`) advances nothing and the rows
  stay pending.
* **`p_upto` — Security condition C6, and it is the reason the two ends of that window name the
  same instant.** The engine advances `accrued_to` to the `now()` it read in the **state**
  transaction, and it calls this projection from the **seed** transaction, which starts strictly
  later. A window bounded only below therefore projects any credit row committed in the gap: the
  settle pays it, and the **next** settle projects it again, because it is still newer than the
  watermark. `(accrued_to, p_upto]` is the *only* double-pay guard this design has — there is
  deliberately no consumed flag — so the upper edge cannot be implicit.
  * The value is `new Date(nowMs).toISOString()` — **byte-identical to the string the engine
    writes as `accrued_to`** (`accrual.js`: the delta's `accrued_to`), not the raw `read.now`,
    which carries Postgres microseconds and would leave a sub-millisecond band above the
    watermark and below the bound. Both derive from the same server `now()`.
  * **It cannot increase a payment.** The body clamps: `least(p_upto, now())`. A forged future
    value gets `now()`; a past one gets a *smaller* window, i.e. an under-payment; `null` gets
    `now()` (`least` ignores NULLs). That property is what keeps "no client argument" true in
    substance despite a third parameter, and it is executed by the migration's **GATE(e6)** and
    by the guard's **C9** (with a `_gate_blind` arm, so C9 sees it independently of the gate).
  * Verified against production, read-only, 2026-09-04: `regprocedure::text` renders the
    identity as `hr_attended_kills(uuid,integer,timestamp with time zone)` — which is the
    `c_engine_allow` entry — and `least(null::timestamptz, now())` returns `now()`.
* **Grants:** `revoke ... from public, anon, authenticated, service_role;`
  `grant execute ... to hr_engine;` — and the entry is recorded in `c_engine_allow` as **link 7**
  of `HR_GRANT_HYGIENE_CHAIN`, derived by `tools/derive-grant-hygiene.mjs`, insertions only.
  Without that record the nightly detector raises `engine_execute_outside_allowlist` and the
  correct fix is to record the claim, never to widen check (7).

**The claim the allowlist entry makes**, re-derived as the list demands:
*READ-ONLY* — `stable sql`, three CTEs over `hr_kill_credit_log` and `player_state`, no branch
that writes and nothing called that writes. *SELF-VALIDATING* — a fixed-shape projection with
its own per-call ceilings; every value it returns was written by `hr_credit_kills`, which already
clamped it to a physical maximum and journalled every throttle. *NO NEW TARGET* — it takes
`(p_user, p_slot)`, the exact pair the engine already hands `hr_apply` and `hr_state_of`. The
holder of `hr_apply` can already **write** any character it names; this lets it **read** one
integer per monster for one of them.

### 3.2 Engine input — `computeAccrual({ …, attended })`

```
attended: { fromMs, toMs, kills: { <monsterId>: <int> } } | null
```

`null` (the column/function is absent, or a degraded ladder rung) → **byte-for-byte today's
behaviour**, the same self-configuring switch `tool_carry` / `fight` / `ammo_carry` use. There is
no flag to forget to flip.

`normaliseAttended` is the one reader: own-property only (never truthiness — `__proto__` and
`constructor` are truthy on a plain object, the measurement in `catalogueHas`), integers only,
each count clamped to `ATTENDED_MAX_KILLS`, at most `ATTENDED_MAX_TARGETS` keys, and the window
clamped into the credited window.

### 3.3 What the top-up pays — and what it deliberately does not

| | paid by the top-up | why |
|---|---|---|
| **items** (drops) | **yes** | the defect |
| **gold** | **yes** | `resolveKill`'s `applyGoldFind(rng.int(m.gp[0], m.gp[1]))`; same window, same shortfall, no other writer |
| rare-drop events | yes (receipt only) | so the welcome-back line can say what dropped |
| combat XP | **no** | already credited by `hr_credit_combat_xp` against `combat_xp_accrued_to`. Re-paying it is the double-mint that watermark exists to prevent. `grantXp` still runs so `state.skills` and max-HP stay right; only the *proposal* skips it. |
| `stat kills` / `ev:kill_any` / daily / bestiary / collection | **no** | every one of those is already written by `hr_credit_kills`, whose settle-delta subtraction (`2026-09-01-kill-daily-credit.sql` §3) is arithmetic against **exactly what the settle writes today**. Moving that number would silently re-open the double-count that file exists to close, on a **ranked** surface (`hr_renown_of` scores `ev:kill_monster:%` at 5/boss kill). |
| ammo / consumables | **no** — stated limitation | `spendForSwings` is per-swing and the top-up models kills, not swings. Under-charging is the safe direction; see §6. |

That table is the review surface. **The exploit-surface delta of this whole change is: items and
gold, on a path whose only client input is a number the client could already submit.**

### 3.4 The food contract — **CUT. The settle remains the sole food debiter.**

**Current behaviour on this branch: unchanged from production.** Every meal the settle's
simulation eats is debited, exactly as it is today. Nothing about food moves.

#### What was built, and what Security measured

The first draft's rule was *"during a window the server knows was attended, the CLIENT owns the
food debit"*. The gate was `attendedAt(curAtMs)`, and its arming signal was
`player_state.combat_xp_accrued_to` — the "attendance beacon". Security executed the attack on
2026-09-04 and it is not a theoretical one:

* `attendedAt` read **only** `inp.combatXpAccruedToMs`. It was **not** gated on `attended`, and
  its lower edge was `credit.fromMs` — the start of the whole credited window, not of
  demonstrated presence.
* `hr_credit_combat_xp` is granted to `authenticated`, **has no early return for an empty
  `p_xp`**, and unconditionally runs `update player_state set combat_xp_accrued_to = now()` at
  60 calls/minute. The beacon is therefore a **free, client-advanceable value**.
* One `POST /rpc/hr_credit_combat_xp {"p_slot":N,"p_xp":{},"p_idem":"<uuid>"}` before each settle
  armed the suppression for the entire window. Measured on the branch engine, 10 h span:

  ```
  A) fresh beacon : foodEaten=828  debit={}                    meta.att=null
  B) stale beacon : foodEaten=828  debit={cooked_shrimp:-826}  meta.att=null
  ```

  **826 units of tradeable food preserved**, and because `meta.att` was emitted only when
  `attended` was present, the pure-food abuse left **no journal entry whatsoever**.
* It is **honest-reachable too**: `requestAccrual` forces `hrCreditCombatXpFlush(true)` before
  every settle (`src/net/accrue.js`), so any settle whose window reaches back past actual
  presence freed that window's food.
* The bag is re-read from `player_inventory` each settle, so the same stack pays for unbounded
  settles. The draft's claim that it was "bounded by their own bag" was **false**.
* And it reproduced with `attended: null` — i.e. **on a database without this migration and on
  every degraded ladder rung**.

A one-cadence slack fix is **not** sufficient: at the ~90 s settle cadence it creates a **double**
debit (client sends *and* server debits) outside the slack, which is item **loss**.

#### The engineering ruling — and it goes further than "fix the gate"

**Recommendation: do not rebuild the suppression at all. Fix the divergence instead.**

The defect the food half was built for was never "the settle debits food". It was *"the two
sides ate **different stacks**"* — the settle destroyed 8 raw `shrimp` while the client had eaten
7 `cooked_shrimp`. That has exactly one cause and it is a **NULL**: `auto_eat_food` was NULL, so
`chooseFood` fell through to the best healer in the *server's* bag. Two independent choosers over
divergent bags.

* **The wrong-stack half is already closed.** `2026-09-04-auto-eat-at-creation.sql` plus b499's
  settings sync make `auto_eat_food` non-NULL going forward. The residue is characters created
  before it whose picker has never been opened — a **one-time backfill**, not an architecture.
* **The "client's seven came back" half is `reconcileInventory`'s max-ratchet**, documented in
  its own header as retiring "with the same commit that gives live play an intent verb". It is
  already scheduled for retirement by the Systems Engineer's inventory-absolute flip.
* **One debiter is strictly safer than two.** Any split needs both sides to agree on *which*
  meals, at millisecond resolution, across a network hop — and every failure mode is either free
  food (client never sends) or item loss (both send). Keeping the settle as the sole debiter has
  neither.

So the ordered recommendation is: **(1)** backfill `auto_eat_food` for pre-b499 characters and
make `chooseFood` refuse to substitute a *different item class* when the column is set; **(2)**
retire the max-ratchet; **(3)** only if a measured divergence survives both, build the projection
below. That is a smaller, testable change with no new suppression surface, and it addresses the
measured harm.

#### If a suppression is nevertheless required — the only shape that is sound

Security's C2 names it, and it is right: **`hr_attended_eats(p_user, p_slot, p_upto)`, a sibling
projection over the `eat` LEDGER ROWS** (`eat.js` already writes one per eat) since
`accrued_to`. Suppress `min(mealsEatenBySim, landedEats)` and **debit the remainder**.

That makes food symmetric with loot — driven by an unforgeable server ledger rather than a
self-asserted beacon — and forgery-proof *by construction*: **to suppress N you must have
destroyed N.** Plus, all of which are conditions, not options:

* **C1** — gate on `attended !== null`, so it cannot arm without the migration or on a degraded
  rung.
* **C3** — journal the suppression **unconditionally**, not only when `att` is present. The
  silence *was* the finding.
* **C4** — the client half needs a live play-gate before it ships:
  `EAT_SEND_GAP_MS = 3000` is 20 sends/min against the shared **30/min** `activity` bucket and
  has never been exercised, and a refused eat is *released*, not retried.
* And the `eat` ledger rows are per-eat, so §6's "aggregate, never per-tick" rule applies to the
  **projection** (one `sum` per settle), never to a new log.

> **A refinement on C2 that matters, and it is the reason the ordering above is not negotiable.**
> `min(mealsEatenBySim, landedEats)` must be a **count** across all foods, not a per-item
> minimum — and *both* shapes are wrong while the two choosers can diverge. Take the measured
> window: the sim ate 8 × `shrimp`, the client ate 7 × `cooked_shrimp`.
> *Per item*, `min(simDebits[id], landedEats[id]) = 0` for **both** ids, so nothing is suppressed
> and the window is charged **15 units for one set of meals** — double consumption, i.e. item
> loss, which is worse than today. *Per count*, `min(8, 7) = 7` is suppressed and the player
> loses one raw shrimp they never ate — better, but it is laundering one item class into another
> and it only *looks* right because the counts happened to be close.
> **Neither is well-defined until the choosers agree**, which is exactly why the backfill is step
> 1 and the projection is step 3. A suppression built on top of a divergence is a second bug
> wearing the first one's clothes.

**Not built here.** The successor branch owns it, and it does not block the loot half.

#### What the loot half must NOT do, and what holds it there

`tests/attended-loot-credit.mjs` **A5** is now the coherence guard for the removal: the settle
must still debit **every** meal it eats, the meal count must not move with the top-up, and
`summary.autoEat.attendedDebit` **must not exist** — a deployed client that observes that key
stops sending its own `eat` while the settle is still charging, which is item loss.
Mutation-proven by `--mutate=food_debit_dropped`. `tests/accrual-engine.mjs`
`attendedSettleAutoEatGuard` is **reverted to production's version, unmodified, and passes** —
which is the strongest available statement that this branch does not touch food.

### 3.5 The display side — decided, and it is not a client-side max

The client keeps predicting the drop for feel, and the settle keeps reconciling. **That is only
defensible because the top-up makes the totals agree**: same kill count, same drop table, same
multipliers — the residual is the RNG stream, so what a player sees is the same *number* of units
from a *sometimes different* row of the same table, not 38 % fewer things.

What is explicitly **not** done: no `Math.max` over the gap, no client-side floor, no "keep the
larger". The existing max-ratchet in `reconcileInventory` is a *migration artefact* documented in
its own header as retiring "with the same commit that gives live play an intent verb"; this change
does not remove it (that is the Systems Engineer's inventory-absolute flip) and does not lean on
it either — **A4 asserts the top-up is correct with the ratchet disabled.**

**What the settle envelope tells the client about the top-up, and it is one string.**
`away.attendedChannel` — `'live'` / `'absent'` / `'degraded'` — and nothing else.
`attendedKills`, `attendedTopUp` and `attendedCap` were on the envelope in the first draft and
are **removed** (Security condition C2): `cap` is the exact threshold Watch B's
`rows_at_the_cap` line keys on and `claimed`/`sim` is the ratio its `median_claim_over_sim`
line keys on, so a forger reading its own receipt could sit one unit under every per-settle line
forever. All four still exist — in `meta.att` on `player_ledger`, a table no client can
`select`, which is where §9's watches read them. `attendedChannel` stays because it is a
**deployment fact, not a calibration**: it names no number, and without it "the loot is still
snapping down" and "the migration is not applied yet" are indistinguishable from outside — the
exact ambiguity that let the bounty hang survive a verification pass.

> **Nothing in `src/` ever read the three** (grepped before and after the strip: zero
> consumers), so this costs the client nothing today. **Do not re-add them for the welcome-back
> card**: the card states what was **paid** — gold, items, kills — and the top-up is already
> inside those totals. That is the whole point of this section.

The end state remains F above: one seeded fight, both sides. Named, costed, not built.

---

## 4. Concurrency and idempotency

| Hazard | Answer |
|---|---|
| Two settles in flight | `hr_apply` takes the per-character advisory lock and refuses a stale `version`; the loser retries and reads an already-advanced `accrued_to`, so its window is empty. |
| A credit lands *between* the read and `hr_apply` | Its row's `created_at > accrued_to`, so the **next** settle pays it. Never lost, never doubled. |
| A settle refuses (`daily_budget`, `bank_full`) | Nothing applied, nothing advanced; the rows stay pending. |
| **The degrade ladder** | `degradeStep` now returns `attended: null` on **every** rung, so a degraded proposal is monotonically smaller. Without this the ladder is *inverted*: halving the span cuts `summary.kills`, which **increases** `attended − sim`. Asserted by A7. |
| Replay of an intent key | Unchanged — `hr_apply`'s `player_intents` claim, salted with `hr_seed('intent:accrue:<watermark>')`. |
| Two tabs crediting the same kills | `hr_credit_kills`'s own `p_idem` once-guard and top-up-to-target semantics, unchanged. |
| Clock | `now()`, always. The window bounds come from `created_at` and `accrued_to`, both server-stamped. |

**Determinism.** The top-up draws from `createRng(seed ^ ATTENDED_RNG_SALT)` — a *separate*
stream. It runs after `simulateSpan`, so it structurally cannot move a span draw; the separate
stream makes that provable rather than argued, and keeps the `AWAY-1` byte-identity property
(`attended: null` in every parity fixture) true by construction as well as by fixture. No
`Math.random()` anywhere.

---

## 5. Migration reversibility

Additive and idempotent. To revert:
`drop function public.hr_attended_kills(uuid,int,timestamptz)` and
re-apply `2026-08-20-live-progress-engine-allow.sql` (link 6's body, which is this file's base,
unmodified). No table, column, policy, row or existing grant is touched. The Edge degrades to
`attended: null` on `42883` exactly as it does for `hr_perks_of`, so **the SQL and the Edge are
safe in either order** — which is the property that makes the rollback one statement.

**Live-hash-tracked bodies this patch moves: exactly one — `hr_assert_grant_hygiene(boolean)`,**
via `tools/derive-grant-hygiene.mjs` link 7 (insertion at the head of `c_engine_allow`, zero
declared removals). `hr_credit_kills__ungated`, `hr_apply`, `hr_state_of`, `hr_rate_gate` and
`hr_perks_of` are **not** restated, and the migration's §0 asserts the live `hr_credit_kills`
fingerprint rather than replacing it.

---

## 6. Performance, cost, and known limitations

**Rows and bytes at 100× players.** Zero new rows. The top-up folds into the delta the settle
already sends and the ledger row it already writes (`meta.att = {k, cap, top}` — three integers,
~40 bytes on a row that is already ~300). The read is one extra statement inside the transaction
that already runs `hr_state_of` — no extra pooled connection, which is the constraint that
actually binds (§2a-ii: `max_connections = 60`). `hr_kill_credit_log` is unchanged and still
pruned at 2 days. **This is deliberately not the `game_events` mistake** (1.6 M rows / 229 MB
from six players in four days): nothing here is per kill.

**Known limitations, stated rather than discovered:**

1. **Ammo is not charged for a top-up kill.** A ranged player's top-up is free of arrows.
   Under-charge, safe direction, bounded by the top-up count. Closing it needs a swings-per-kill
   model the engine does not have; inventing one here would be a second copy of the tick loop.
2. **`hr_kill_credit_log` is pruned at 2 days.** A character whose `accrued_to` is older than
   that loses any attended rows already pruned. Reachable only by an absence longer than two days
   *that contains attended credits*, i.e. essentially never; under-pay if it happens.
3. **The credit log does not distinguish `free` from bounty rows for the loot window.** Both are
   real attended kills and both are capped, so both are counted. A bounty turn-in's *reward* is
   `hr_claim_bounty`'s and is untouched.
4. **A settle whose own sim out-produces the attended count pays the sim's number.** That is
   today's behaviour and the honest one — the server's own simulation is authoritative for time
   it was not told about.
4b. **Only the POINTER's target is topped up.** `hr_attended_kills` projects every target in the
   window, but the engine spends `attended.kills[activeId]` and nothing else — a combat pointer
   names one monster, and paying another target's drops against this pointer would be inventing a
   fight. In normal play nothing is lost, because `set_activity` **collects before it switches**
   (`set-activity.js`) and that collect runs with the old pointer still set. The gap is the
   sub-threshold switch: a player who changes monster **within `ACCRUE_MIN_MS` (60 s) of the last
   settle** gets `below_min_span`, which correctly writes nothing and advances nothing — but the
   next settle prices the new pointer, and the old target's credits then age out of the window
   unpaid. Bounded by 60 s of attended play against one monster, self-only, under-pay. Closing it
   means paying a non-pointer target's drops, which needs its own review.
5. **`chooseFood` divergence is NOT addressed here.** b499's settings sync and
   `2026-09-04-auto-eat-at-creation.sql` make `auto_eat_food` non-NULL going forward, but a
   character created before them (the measured one) still has NULL until the picker is opened,
   and the settle then eats a different stack from the one the client ate. That is the residue of
   the incident this change came from and it is **still open** — §3.4 has the ordered
   recommendation. It is a backfill, not an architecture.
6. **The sim-relative ceiling under-pays a genuinely heroic attended window.** A player who
   out-fights the server's own model of them by more than **3×** is throttled to 3× the sim.
   Measured honest worst case is 2.14×, so the throttle should not be reachable by honest play —
   but if the away sim's fidelity ever *worsens* (a new buff channel the span does not model),
   this ceiling bites before anyone notices the fidelity gap. A9 pins the measured honest window
   at full payment, so that regression fails a test rather than a player.
7. **A window whose away sim realises ZERO pays nothing**, by the same arithmetic. That is
   deliberate (§2 bound 2) and it is the difference between "bounded" and "2.27 M gold a day",
   but it does mean an attended fight against something the server's model of the character
   cannot beat is paid at the sim's number — i.e. today's behaviour, not a regression.
8. **A10 part (d) is an ORACLE, and an oracle can be edited to agree with the defect.** It
   re-implements the cumulative-floor allocation in the test file, deliberately, because the only
   reference that is *not* self-referential is one computed independently — but that means a
   future author who changes the engine's allocation could change (d) to match and lose the
   property. The enforcement is the pair of mutation arms (`alloc_all_to_last`,
   `alloc_all_to_first`) plus the assertion text, which says in the failure message not to relax
   it. Structural alternatives (deriving the expectation from a second implementation, or paying
   each segment through a separate engine call and differencing) were considered and are more
   machinery than the property is worth today. **Stated so the next reviewer knows it is a choice,
   not an oversight.**
9. **S2 — boundary arbitrage — is OPEN**, MEDIUM, bounded ≤ ×1.20. The projection has no per-day
   split, so the engine must assume a uniform kill rate the player controls. See the follow-ups
   table in §0b. ⚠ Its stated interim control, "Watch C", **does not exist in this document or
   this repo** — §9 has Watch A and Watch B only. Transcribe it or say the residual is uncovered;
   an operational control that is named but not written is the "bounded and unread" failure §9
   opens by warning about.
10. **Not verified on a Supabase branch.** See §7.

---

## 7. Verification status — read before trusting anything above

| Verified how | What |
|---|---|
| **Executed against production, read-only** | Every number in §0. `player_ledger` id 13175, the four `hr_kill_credit_log` rows, `player_state` slot 2's three auto-eat columns, `player_inventory`, and the live `hr_engine` EXECUTE set (17 entries). **Added on this branch:** the live `hr-accrue` bundle identity (§9); the 30-day economic baseline in §9's thresholds (227 `combat / accrue` rows: max 1,435 item units and 8,103 gold per PAID hour, p99 1,343 / p50 238); that `regprocedure::text` renders `timestamp with time zone` and `least(null::timestamptz, now()) = now()` (both load-bearing for C6); and that §1c's autocommit guard **fires** when its block runs alone. |
| **Executed locally — GREEN** | `node tests/attended-loot-credit.mjs` — **A1–A10 engine + C1–C9** against the whole real chain in PGlite. `--selftest`: **26/26 mutations CAUGHT**, including `alloc_all_to_last` and `alloc_all_to_first` — the two arms Security used to escape A10 before part (d) existed, each now producing 16 failures across all four A10 fixtures × both windows. `node tests/accrual-engine.mjs` — **with `attendedSettleAutoEatGuard` reverted to production's version, unmodified**, which is the coherence proof that this branch does not touch food. `node tests/run-sql-tests.mjs`, `node tools/derive-grant-hygiene.mjs --check` (7 links, 8 patches, in sync), `node tests/schema-replay.mjs`, `node tests/schema-drift.mjs` (re-baselined: **exactly one** function added), `node tools/pack-edge.mjs --check`. Plus, unchanged: `activity-intent`, `combat-xp-settle-split`, `live-settlement`, `accrue-envelope-away`, `goal-counters`, `auto-eat-authority`, `core-purity`, `intent-mismatch`, `delta-transport`. |
| **Executed locally — RED, and expected** | `node tests/live-hash-drift.mjs` reports `hr_assert_grant_hygiene` moved. That is this change (link 7), and it clears with `--live --write` **after** the migration is applied. Measured on the base commit for comparison: 2 pre-existing REDs (`hr_record_rejection`, `hr_state_of`, both carrying `--write` REVIEW placeholders); this change adds exactly one and removes none. |
| **NOT executed — must happen before merge** | **The migration has not been applied anywhere, including a Supabase branch.** `create_branch` requires `confirm_cost`, which is not exposed in this environment (the same blocker `server-authority.md` §0b records). The PGlite replay applies the *whole real chain from `tests/schema-apply-order.json` plus this file* and runs its §3 gate — including the new GATE(e6) — which is the strongest proof available here. But it is PGlite, not `nezapsylztqbbwuwembx`, and the two have already been measured to disagree once (`[[:space:]]+` vs `\s+` under `standard_conforming_strings`). **Treat the migration as unproven against production until a branch applies it.** |
| **NOT executed** | The Edge deploy. `node tests/run-smoke.mjs` (the Coordinator runs the assembled suite on `main`). Any live play-gate pass. |
| **RE-REVIEW REQUIRED** | The **unsurvivable-target** finding (§2 bound 2) is new since Security's verdict and changes the payment formula. Security's GO-with-conditions was taken against `min(claimed, cap) − sim`; this branch ships `min(claimed, cap, sim × 3) − sim`. **It must be re-taken.** |

### A separate finding, not caused by this change

`2026-09-01-kill-daily-credit.sql` **cannot be applied during the first five
minutes of any UTC day.** Boundary measured, not inferred: green at `23:5x`,
**RED at `00:00:28Z`, `00:01:26Z`, `00:02:35Z`, `00:03:13Z`, `00:04:25Z`, green
again at `00:05:34Z`** — the failure window is exactly `[00:00, 00:05)`, which is
the `interval '5 minutes'` below. **Reproduced on the base commit with none of
this change present.**

```
GATE(f5): the settle delta read 0 (expected 12) — the anti-double-count is blind
```

The mechanism, and it is exact. Line 1185 backdates the fixture row:

```sql
update public.hr_kill_credit_log set created_at = now() - interval '5 minutes'
```

`hr_credit_kills__ungated` then reads its watermark as
`max(kills_stat) … where created_at >= public.hr_utc_day_start(now())` — the UTC-day
scope that Security C1 part 2 deliberately added. Inside the first five minutes
of a day the backdated row is in *yesterday*, the read returns NULL,
`v_settle_delta` floors to 0, and the gate raises.

**The fix already exists one block above it.** GATE(f4) backdates with
`greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')`
(lines 1137 and 1142) — the author hit this trap on f4 and did not carry the
guard down to f5. It is a **failed apply**, never a wrong payment. It matters
here only because that file is still unapplied and sits in this one's apply
path: an operator running the bundle at 00:03 UTC gets a refusal that reads like
a real defect. Owner: whoever next touches that file.

## 8. Tests

* **`tests/attended-loot-credit.mjs`** — the guard, in two halves.
  * **A1–A10, the engine.** A1 is *the test that would have caught this*: it reproduces the
    production window (169 s, 15 attended kills, a 10-HP fresh character, `auto_eat_food` NULL)
    and asserts the delta credits the drops of **15** kills, not 9. **RED without the fix**
    (`--mutate=no_topup`, which is byte-for-byte today's engine — it reports 11 units credited
    where ~23.6 was expected, and gold that did not move). A2 the tightest of the two ceilings
    binds, **and names which one**; A3 the `max(sim, attended)` non-additivity; A4 the
    containment (no counter, no XP, no fight checkpoint moved) and the ratchet-independence;
    **A5 the CUT FOOD HALF — the settle still debits every meal it eats, the meal count does not
    move with the top-up, and `summary.autoEat.attendedDebit` must not exist**; A6 the gear cap's
    multiples by value; A7 the monotone ladder; A8 the hostile-input sweep (`__proto__`, floats,
    negatives, 1e18, arrays); **A9 the unsurvivable target** — a maxed character pointed at
    `the_silence` with a saturating claim must pay **0**, and the guard prints the 2,267,639 gold
    it would otherwise mint.
  * **A10, the UTC boundary (Security F1), in FOUR parts — and the fourth is the load-bearing
    one.** (a) the STRUCTURE: segment count against `utcDaySegments`, each segment's start
    instant, a segmenter-independent `fromMs % DAY_MS === 0`, the per-segment `dropMult` as
    observed at `resolveKill` call time, the sum identity, `mults.size >= 2`. (b) THE MONEY: the
    top-up's units/kill against a blend of two single-day reference runs, ±6 %. (c) the
    ALLOCATION IDENTITY on a deliberately asymmetric window, with its own non-vacuity proof.
    **(d) the ALLOCATION SHAPE:** a deterministic integer identity, zero RNG, recomputed from
    `utcDaySegments` and the reported total alone, on both windows.
    > **(d) exists because (b) is self-referential, and Security proved that by running it.**
    > (b) blends by `cross.segs[i].kills`, which is the code under test, so an allocation defect
    > moves the reference in lockstep and (b) reads 1.000; (a) and (c) survive any
    > mis-proportioned split in which both segments hold a kill. Measured, with the allocation
    > replaced by *"segment 0 gets one kill, the final segment gets the rest"*: the file reported
    > **`all checks pass`** while payment inflated **×1.197 / ×1.170 / ×1.060**. (d) is the only
    > arm that sees it. **Do not relax (d) to a tolerance** — it is integer arithmetic, and there
    > is no band in which an allocation is approximately right.
  * **C1–C9, PGlite.** The real chain from `tests/schema-apply-order.json`, then a real player
    created the server's own way and driven through the **real, rate-gated `hr_credit_kills` as
    `authenticated`** — the assertion is always "the projection the engine will actually read
    says N", never "a row exists". C1 not client-executable from `anon` / `authenticated` /
    `service_role`, engine-executable, and `hr_engine` holds no direct `SELECT` on the log;
    C2 recorded in `c_engine_allow`; C3 the projection equals what `hr_credit_kills` credited;
    C4 a forged `p_claimed` of 1 000 000 is **throttled** and the projection sums `credit`, never
    `claimed`; C5 a forged `p_target` never enters the log (`unknown_monster`); C6 the window
    closes when `accrued_to` advances — **the no-double-pay property, executed**; C7 the per-call
    ceilings bind; C8 another player's credit does not leak in; **C9 the upper edge and its
    clamp** — a row above `p_upto` is not projected, and a **future** `p_upto` cannot widen the
    window past `now()`.

    > C4 backdates the first credit row by 60 s, and that is load-bearing. The bounty-free branch
    > anchors its window at the last free credit, so a second call in the same second prices a
    > ~0 ms window, records `credit = 0`, and the projection's own `credit > 0` filter drops the
    > row **before** the sum — which makes a `sum(claimed)` mutant read identically to the correct
    > body. `sums_claimed_gate_blind` ESCAPED until the row was backdated.
* **`tests/accrual-engine.mjs` `attendedSettleAutoEatGuard` is REVERTED to production's version,
  byte-for-byte, and passes.** The b502 draft rewrote it to assert the food suppression as
  intended behaviour; that assertion was re-ruled by the Security review and the guard is back to
  what it was. It is the single strongest statement that this branch does not touch food: the
  test that would have caught a food change is unmodified and green.
* Mutation-proven: `node tests/attended-loot-credit.mjs --selftest` — **26 planted defects, 26
  CAUGHT**, including three `_gate_blind` arms that short-circuit the migration's own §3 block so
  only the C-series is left to see the defect. New arms on this branch: `unsurvivable_topup`
  (the sim-relative ceiling), `no_upper_bound` and `upto_unclamped` (C6), `no_upper_bound_gate_blind`
  (C9 without the gate), `food_debit_dropped` (the cut half, planted), `botd_single_instant` and
  `botd_segment_end` (F1 — the shipped defect and the off-by-one a later refactor would most
  likely reintroduce), `alloc_per_segment_floor` (the sum identity), and — from Security's own
  escape run — **`alloc_all_to_last`** and **`alloc_all_to_first`**, which keep the segments, the
  instants, the multipliers and the sum intact and move ONLY the proportion.

  > Those arms raise **`HR900`, the code the migration's own handler swallows.** A different code
  > propagates, the migration refuses to install, and the arm reports *"migration/harness rejected
  > it"* — a CAUGHT that proves the gate rather than the guard. Measured: with `HR901` every
  > gate-blind arm reported a false CAUGHT.

**Three defects this file's own tests found in this change, which review had not:**

1. **A4 was comparing two variables.** The control ran without the attendance beacon, so the
   combat-XP watermark split differed between the two runs and the containment assertion reported
   the top-up "proposing combat XP" when it had done nothing of the kind.
2. **`__proto__` survived `normaliseAttended`.** `JSON.parse` creates it as a *real own property*
   (an object literal does not) and `__proto__` / `constructor` / `prototype` all **match**
   `/^[a-z0-9_]{1,64}$/` — so `hasOwnProperty` passed them and the id pattern passed them. Inert
   on a null-prototype map, but they consume `ATTENDED_MAX_TARGETS` slots and can evict a real
   target. Now refused by name.
3. **The `fight` checkpoint assertion was vacuous** until the fixture passed `fight: {}`:
   `undefined` means "no such column", the engine then omits the key entirely, and the assertion
   compared `null` to `null` while a mutant destroyed the in-flight fight.

---

## 9. Operations — the deploy record and the watch (Security condition C5)

> **"Bounded and journalled" is "bounded and unread" without this section.** The residual
> exposure (§2) is detectable only because `meta.att` is on every row; a signal nobody queries is
> not a control. These two queries and their thresholds are the control.

### 9.1 The rollback target — RECORDED BEFORE ANY DEPLOY

Read from the Supabase Management API on **2026-09-04**, before anything was deployed:

| | |
|---|---|
| function | `hr-accrue` (`f6d44b64-2c05-41e6-ae7f-cb5802866804`) |
| **deployed version** | **69** |
| **deployed `ezbr_sha256`** | **`ddce9e15f93ac18184556762e1a7163e90d39dd78c39938fb6ac5b1e6aed71a6`** |
| deployed at | `2026-09-03T17:12:14.246Z` |
| `verify_jwt` | `true` |

**The candidate.** `node tools/pack-edge.mjs --check` on this branch packs
`hr-accrue: 64 files (41 vendored), 1334.0 KB, payload
c8d0b1630321c356e72a1c9b9d857afabf672259c57889a326d3c2cd791be6f3` — re-measured **after** the F1
segmentation fix and the condition-C2 envelope strip, superseding the `a92de4df…`/1327.5 KB
recorded when this section was first written. That digest is the repo-side identity of what would
be deployed; Supabase's `ezbr_sha256` is computed over its own bundle and will differ. Record the
NEW `ezbr_sha256` after the deploy by re-reading `list_edge_functions`, and put both in the
release note.

> ⚠ **This digest moves with `src/core` and `src/data`, not only with this function**, so it
> must be re-read immediately before the deploy rather than trusted from this page. The smoke
> suite's Edge payload guard is RED on this branch for exactly that reason and correctly so:
> `hr-accrue` is deployed at `ac7481dd…` and this repo packs `c8d0b163…`. It goes green with
> the deploy, not before.

**Rollback.** The Edge and the SQL are safe in either order, so a rollback is one action at a
time and neither strands the other:

1. **Edge first** — redeploy version 69's source (git: the tree at `main` before this merge).
   With the old payload the migration is inert: nothing calls `hr_attended_kills`.
2. **SQL, only if needed** — `drop function public.hr_attended_kills(uuid,int,timestamptz);`
   then re-apply `2026-08-20-live-progress-engine-allow.sql` (link 6's body) to take
   `hr_assert_grant_hygiene` back to its pre-link-7 form, then
   `node tests/live-hash-drift.mjs --live --write`.

Between the two, a deployed new payload against a dropped function degrades on `42883` to
`attended: null` — i.e. pays exactly what yesterday paid. That is why step 2 is optional.

### 9.2 WATCH A — rate of credit per character-hour

**What it is for:** the absolute faucet. It catches a forger regardless of *how* they are
forging, and it is the only one of the two that still works if `meta.att` is ever dropped.

```sql
-- Rate of credit from the combat settle, per character per UTC hour, normalised
-- by the time actually PAID (meta.ms) so that a legitimate 15 h offline claim
-- landing in one clock hour does not read as abuse.
with r as (
  select user_id, slot,
         date_trunc('hour', at)                        as hr,
         qty_in, gold_in,
         nullif((meta->>'ms')::bigint, 0) / 3600000.0  as paid_h,
         (meta->'att'->>'top')::bigint                 as att_top
    from public.player_ledger
   where kind = 'combat' and intent = 'accrue'
     and at > now() - interval '48 hours'
     and (meta->>'ms') is not null)
select user_id, slot, hr,
       round(sum(qty_in)  / nullif(sum(paid_h), 0))  as units_per_paid_hour,
       round(sum(gold_in) / nullif(sum(paid_h), 0))  as gold_per_paid_hour,
       sum(coalesce(att_top, 0))                     as topup_kills,
       count(*)                                      as settles
  from r
 group by 1, 2, 3
having sum(qty_in)  / nullif(sum(paid_h), 0) > 2500      -- ALERT
    or sum(gold_in) / nullif(sum(paid_h), 0) > 20000     -- ALERT
 order by units_per_paid_hour desc
 limit 50;
```

**The thresholds, derived rather than guessed.** Baseline measured on production 2026-09-04
over 30 days (227 `combat / accrue` rows with a `meta.ms`):

| | max | p99 | p95 | p50 |
|---|---|---|---|---|
| item units per **paid** hour | 1,435 | 1,343 | 1,141 | 238 |
| gold per **paid** hour | 8,103 | — | — | — |

* **2,500 units/paid-hour** ≈ the measured maximum × the ~1.7 fidelity ratio the top-up can
  legitimately restore. Above it, the character is being paid more than the best-observed honest
  player *plus* the whole honest top-up.
* **20,000 gold/paid-hour** ≈ 2.5× the measured maximum. Gold is looser because gold per kill
  varies ~150× across the monster table (goblin 5 vs `the_silence` 453) while units per kill does
  not, so a tighter gold line would fire on legitimate high-tier play.
* **PAGE, do not merely alert, above 5,000 units or 60,000 gold per paid hour.** That is above
  what the ceilings in §2 permit at all, so it means a *bound is broken*, not merely abused.

> ⚠ **THESE THRESHOLDS ARE MEASURED BROKEN, AND NOT ONLY "PROVISIONAL". 2026-09-04.**
> They are derived from the *observed* 30-day population, which is entirely pre-endgame. Against
> the **theoretical honest ceiling** the same engine produces they do not survive first contact:
>
> | maxed skills + full best-in-slot, 1 h paid window | gold / paid-hour | units / paid-hour |
> |---|---|---|
> | `lich`, away sim ONLY — no attendance, no top-up, no forgery | **61,586** | 254 |
> | `grim_reaper`, away sim ONLY | **79,675** | 404 |
> | `lich`, with an honest attended top-up at the gear ceiling | **172,700** | 733 |
> | `grim_reaper`, same | **177,954** | 922 |
> | `wolf`, away sim only / with top-up | 8,296 / 14,834 | **2,271 / 4,036** |
>
> So the **60,000 gold PAGE fires on a maxed best-in-slot player simply being away for an hour**,
> before this change exists, and the 2,500 units ALERT fires on honest maxed wolf-farming with
> the top-up. A watch that pages on honest endgame play is a watch that gets muted, and a muted
> watch is worse than none.
>
> **What this document recommends, and defers to Security to rule:** Watch A is the wrong SHAPE
> for gold. Honest gold per paid hour varies ~20× with gear and ~150× with target across the
> monster table, so no single global line can separate abuse from endgame play. **Watch B
> (`claimed / sim`) is the load-bearing detector** — it is a ratio, so it is gear-invariant and
> target-invariant by construction. Either re-derive Watch A **per player against their own
> trailing baseline**, or keep it only at the PAGE level with the gold line raised above the
> measured honest ceiling (≥ 200,000/paid-hour on today's roster) and treat the units line as
> the primary volume signal. **Re-derive from live rows after week one either way.**

### 9.3 WATCH B — the `meta.att` forgery signal

**What it is for:** the residual named in §2 — a claim run to the ceiling rather than to what was
actually fought. It fires long before Watch A, because it is a *shape*, not a volume.

```sql
-- claimed / sim is the forgery signal: honest play clusters near the ~1.7
-- span-sim fidelity ratio; a forger runs the claim to whichever ceiling binds.
with a as (
  select user_id, slot,
         (at at time zone 'utc')::date            as day,
         (meta->'att'->>'claimed')::bigint        as claimed,
         (meta->'att'->>'sim')::bigint            as sim,
         (meta->'att'->>'cap')::bigint            as cap,
         (meta->'att'->>'top')::bigint            as top
    from public.player_ledger
   where kind = 'combat' and intent = 'accrue'
     and meta ? 'att'
     and at > now() - interval '7 days')
select user_id, slot, day,
       count(*)                                                   as rows_with_att,
       count(*) filter (where top > 0)                            as rows_paid,
       count(*) filter (where claimed >= cap and cap > 0)         as rows_at_the_cap,
       count(*) filter (where sim = 0 and claimed > 0)            as rows_sim_zero,
       -- percentile_cont returns double precision even over a numeric input, and
       -- round(double, int) does not exist. Measured 2026-09-04: without the cast
       -- this query does not parse.
       round((percentile_cont(0.5) within group
             (order by claimed::numeric / nullif(sim, 0)))::numeric, 2)
                                                                  as median_claim_over_sim,
       sum(top)                                                   as topup_kills
  from a
 group by 1, 2, 3
having count(*) filter (where claimed >= cap and cap > 0) >= 5         -- ALERT
    or (percentile_cont(0.5) within group
       (order by claimed::numeric / nullif(sim, 0)))::numeric > 2.5    -- ALERT
    or count(*) filter (where sim = 0 and claimed > 0) >= 20           -- ALERT
 order by topup_kills desc
 limit 50;
```

**The thresholds, and what each one means.**

* **`rows_at_the_cap >= 5` in one UTC day.** The gear cap assumes **max hit on every swing and
  no misses**. Honest play does not touch it; touching it five times in a day is a signature.
* **`median_claim_over_sim > 2.5`.** Measured systematic under-realisation is **~1.7×** and the
  guard's own fresh fixture is **2.14×**. A *median* above 2.5 across a day is not variance.
  (The runtime ceiling is 3.0, so this fires *before* the bound does — which is the point: the
  bound silently protects, the watch tells you it had to.)
* **`rows_sim_zero >= 20`.** The sim realising zero is what the unsurvivable-target hole needed
  (§2 bound 2). It now pays nothing, so this is not a loss signal — it is the **probe detector**:
  twenty settles in a day where the character claims kills its own model cannot make means
  somebody is looking for that hole.
* Cross-check any hit against `hr_kill_credit_log` for the same character and window, and against
  the `kill_credit_throttled:<target>` rejections `hr_credit_kills` already journals.

> **Both queries were EXECUTED against `nezapsylztqbbwuwembx` on 2026-09-04, read-only, and both
> returned zero rows** — nothing on production is over either line today, and no row carries
> `meta.att` yet because nothing is deployed. Watch B needed a `::numeric` cast to run at all
> (`percentile_cont` returns double precision and `round(double, int)` does not exist); that was
> found by executing it, which is the reason to execute a query you intend somebody to rely on.

### 9.4 The advisor baseline — take this BEFORE the apply, re-take it after

`get_advisors(security)` on `nezapsylztqbbwuwembx`, **2026-09-04, before anything was applied**:

| level | name | count |
|---|---|---|
| ERROR | `security_definer_view` (`public.market_price_history`) | 1 |
| WARN | `authenticated_security_definer_function_executable` | 71 |
| WARN | `function_search_path_mutable` | 29 |
| WARN | `anon_security_definer_function_executable` (`beta_invite_check`, `hr_leaderboard`) | 2 |
| INFO | `rls_enabled_no_policy` | 21 |
| | **total** | **124** |

**Every one is pre-existing and none is this change's.** After applying the migration the count
must still read **124**: `hr_attended_kills` carries `set search_path = public, pg_catalog` (so
it cannot add to the 29) and is granted to `hr_engine` alone (so it cannot add to the 71 or the
2). **A 125th finding naming `hr_attended_kills` means §1b's revoke did not take** — which is the
same property GATE(a) and the guard's C1 assert, checked here from outside the migration.

### 9.5 Cadence

Both queries are cheap (`player_ledger` is indexed on `(user_id, slot, at)` and the windows are
48 h / 7 d). Run them **on the day of the deploy, then daily for the first week**, then fold into
whatever the nightly `hr_cron_health` slot becomes. Record the first week's readings in the
release note: an alert with no baseline is an alert nobody can act on.


