# Combat authority — attended live combat outcomes (the root fix)

**Status:** Part 1 (bounty completion reliability) BUILT + tested on branch
`fix/combat-authority-root`. Part 2 (combat XP credit) DESIGNED, not built —
it is an Edge + `hr_apply` change on a rankable surface and is gated on the
security review. Nothing here is applied to production.

**Authority:** `CLAUDE.md` → "Server authority (locked 2026-08-10)" and
`docs/design/server-authority.md`. Where anything here conflicts, those win.

**Origin:** two live reports (Paione, 2026-08-26) that are ONE root:
1. "Attack level reverts to 4 a few seconds after I hit 5."
2. "Bounty still isn't finishing."

---

## 0. The one root

Live combat is **client-predicted**, and **nothing credits attended combat
outcomes to the server during play.** The only server writer for combat XP and
the bounty kill-counter is the away/span-sim in
`supabase/functions/hr-accrue/accrual.js`, which re-simulates the elapsed window
as an **UNATTENDED** character (auto-eat-only survival) and realises 60–99% fewer
kills and far less XP than the attended player actually earned. So:

- **XP revert.** `addXp` (`src/legacy.js:3937`) under the arm does not write
  `G.skills`; it records a *prediction* (`hrPredictXp` → `src/net/predict.js`),
  so the client shows level 5. On settle, `applyRecord` stamps the server's
  *undercounted* skills, and `retirePredictions` (`src/net/predict.js:388`)
  retires the window's prediction by **time coverage**, dropping the display to
  the undercounted server value → level 4. `predict.js` is **not** the bug: its
  coverage-retire is correct *given equal client/server rates* (it says so, and
  `AWAY-1` asserts parity) — but attended combat is the one place the rates are
  NOT equal, because the server priced the window as unattended. Fix the server's
  number and the reconcile is correct by construction.
- **Bounty hang.** The server bounty counter (`player_progress`
  `stat/ev:kill_monster:<target>`) is written by the same undercounting sim.
  b484's `hr_credit_kills` let the client top it up — but only from
  `completeBounty` (`src/legacy.js:4371`), i.e. the single instant the LOCAL bar
  reaches `required`. The credit is clamped to
  `floor(1.3 × elapsed_since_accept / min_time_to_kill)`, so a burst of fast
  kills reaches the bar while the server cap is still below it → turn-in refused →
  player **stops** → the retry was gated on "the next kill" → hang. Verifying
  b484 by calling the RPCs directly with the QA token hid this: direct calls have
  arbitrary elapsed, real play does not.

---

## 1. The architecture decision

**Attended live combat outcomes are submitted by the client and credited by the
server, CLAMPED to physical-max, reconciled UP.** Not: make the settle simulate
the attended window (it structurally cannot know the player was present and
fighting rather than idle, and it prices as unattended). The client already owns
the per-tick truth — it runs the one combat loop — so it is the only component
that knows the attended outcome. The server's job is not to reproduce it but to
**bound** it: no more than a god-geared character of this player's server-known
level could physically have produced in the server's own elapsed clock. The cap
+ the journal are the anti-cheat; the client mints nothing.

This generalises b484's proven `hr_credit_kills` discipline:
server clock + server gear/level + catalogue; `min(claimed, physical_max)`;
progress-only (no gold/XP/drops from the credit path for kills); idempotent;
journalled; three disjoint writers so nothing double-pays.

### Why submit-and-cap beats settle-attests

| Option | Verdict |
|---|---|
| Client periodic submit, server caps, reconcile UP | **Chosen.** The client is the only holder of attended truth; the server bounds it with its own clock/level. Matches b484 exactly. |
| Make the settle credit the attended window | **Rejected.** The settle is a lagging window that says nothing about the seconds since `accrued_to`, and it cannot distinguish "fought" from "idle" — it prices unattended. It would still undercount. |
| Trust the client's XP/kills | **Rejected, permanently.** Rankable + money surface. A forged submit must mint nothing beyond the physical cap. |

---

## 2. Part 1 — bounty completion (BUILT)

Client-only. Reuses the already-reviewed, capped, idempotent, journalled
`hr_credit_kills`; **no schema change**. Two additions to `src/legacy.js`:

1. **Cadence during the fight.** `handleBountyKill` now calls
   `hrBountyCadenceCredit(b)` on every cull kill **below** target, throttled to
   one credit per `HR_BOUNTY_CREDIT_MS` (15 s — the cap is time-based, so a
   burst buys nothing) and backstopped by the RPC's 60/min gate. The server
   counter climbs continuously instead of depending on the local bar reaching
   target unaided.
2. **Hold-retry on a timer.** When the two-phase turn-in is refused,
   `hrScheduleBountyRetry(b)` re-enters `completeBounty` every
   `HR_BOUNTY_RETRY_MS` (12 s). The plausibility cap grows with
   `elapsed_since_accept`, so a bounty the player **stopped** at target locks in
   on its own as the cap catches up to the observed count — killing the
   "stops fighting → hangs forever" class. Cleared on finalize/abandon.

**Anti-cheat unchanged from b484:** only the target id and the client's observed
count cross the wire; the cap, damage level and clock are the server's; a
throttled claim is journalled `kill_credit_throttled:<target>`; the counter is
top-up-to-`(baseline+credit)`, so replays and the settle never double-count.

**Test:** `src/features/smoke-test.js` — "bug #5 ROOT: cull kills below target
credit the server counter on a cadence" (a below-target kill credits once per
window and does NOT complete the bounty; a later kill credits again).

---

## 3. Part 2 — combat XP credit (DESIGNED, security-gated)

The XP revert cannot be fixed the same trivial way, because **XP is a value the
settle also grants** — a top-up-max like the kill counter would double-mint
(counter overcount is harmless; XP overcount is levels + leaderboard).

### The contract

A new writer, `hr_credit_combat_xp(p_slot, p_xp jsonb, p_elapsed_hint, p_idem)`
(or the same RPC generalised from `hr_credit_kills` to carry both kills and XP),
`SECURITY DEFINER`, `authenticated`-only via `hr_rpc_gate`, inner `__ungated`
revoked from all client roles — the b484 wrapper shape exactly.

- **Cap.** For each combat skill, `credit = min(claimed, floor(elapsed_ms ×
  max_xp_per_ms(dmg_level)))`, where `max_xp_per_ms` is derived from
  `src/core/kill-time.js`'s physical-max kill rate × the max XP any single kill
  yields at best-in-slot — an over-estimate on purpose (never throttle honest
  play), drift-guarded like `hr_bounty_kill_cap`.
- **No double-pay — the load-bearing invariant.** The credit advances a
  **separate combat-XP watermark** `combat_xp_accrued_to` (distinct from the
  loot/gold `accrued_to`). The settle credits combat XP only for
  `[combat_xp_accrued_to, now]` and continues to credit **loot/gold/drops** for
  `[accrued_to, now]` (the single existing loot writer — unchanged). Attended
  play advances `combat_xp_accrued_to` via the credit; genuinely-away time (no
  attestation) lets the settle pay combat XP from the watermark as today. This
  keeps three disjoint concerns: XP (credit), kill-counter (credit, top-up),
  loot/gold (settle) — none overlaps.
- **Reconcile UP.** Because the credited XP ≈ the client's predicted XP, the
  settle's coverage-retire in `predict.js` becomes correct with no change to
  that module: display = server truth (now including the credit) + surviving
  predictions, and a level gained live stays.

### Why this needs the Edge + `hr_apply` and a security review

The settle (`accrual.js` / `hr_apply`) must read the new watermark and skip
combat XP it has already paid; `hr_apply` grows a combat-XP watermark column and
its own re-validation of the cap. That is a rankable surface (XP → levels →
leaderboard) and a new client-reachable XP writer — exactly the class the
program requires the Security Engineer to sign off before authority moves.

### Interim state (until Part 2 ships)

The XP revert persists for combat skills under the arm. Part 1 does not change
it and does not make it worse. Part 2 is the fix; it is specified above so it can
be built and reviewed as one migration.

---

## 4. Exploit surface delta

- **Part 1:** none beyond b484 — same RPC, same cap, same journal; only the
  *cadence* of legitimate calls changed (more frequent, still 60/min-gated,
  still self-only and capped). A forger online T seconds still cannot credit more
  than `floor(1.3 × T·1000 / min_kill_ms)` toward their OWN bounty.
- **Part 2 (when built):** a new client-reachable XP writer. Bounded by the
  per-skill physical-max cap, the daily XP budget (`daily_budget`), the journal,
  and the watermark (which makes the credit non-replayable and non-double-paid).
  Requires security review.

---

## 5. Part 3 — the DAILY GOAL kill counter (2026-09-01)

**Status:** BUILT on branch `fix/kill-daily-server-credit`, migration
`supabase/migrations/2026-09-01-kill-daily-credit.sql`, **not applied**. Gated on
security review: **GO-WITH-CONDITIONS (2026-08-29) — C1/C3/C4/C5 folded in**, see below.

### The third consumer of the same root

Parts 1 and 2 fixed the bounty counter and combat XP. The third consumer of the
attended undercount is the **daily/weekly kill goal**, graded on

```
player_progress(kind='daily', key='ev:kill_any', period_key=hr_utc_day_key(now()))
```

Five paying claims read that one row: `hr_claim_goal`'s `kill_any` (10 → 200g),
`kill_more` (30 → 600g + 1 gem) and `wk_kills` (weekly 100 → 2500g + 3 gems, a
**SUM** of the week's seven daily rows — there is no `kind='weekly'`), plus
`hr_claim_daily`'s `daily_kill` (25 → 500g) and `daily_kill_big` (60 → 900g).
Its only writer was the span-sim, so an attended goal reached full on the client
and never became claimable: "30 / 30 · Confirming…".

### The two changes

1. **`hr_credit_kills` stamps the daily row on both branches**, from the same
   `v_applied` the lifetime aggregate already used.
2. **A credit no longer requires an active bounty.** The presence of the
   `active_bounty` row — a *server* fact — chooses the branch. The
   **bounty-free branch writes the daily row and nothing else**: not
   `stat/ev:kill_any`, not `stat/kills`, not the bestiary key, because
   `hr_claim_quest` pays on the first and `hr_renown_of` *scores* the first
   (0.05/kill) and the bestiary (5/boss kill) — renown is **ranked**.

### No double-advance — and the accrued_to floor is only half of it

Anchoring the bounty-free window at `greatest(last free credit, accrued_to)`
stops a credit paying for a window a settle already covered. It does **not** stop
the *next* settle covering a window the credit already paid: `hr_apply` /
`accrual.js` re-simulate `[accrued_to, now]` in full and have no kill watermark
to clamp against (unlike combat XP, which bought `combat_xp_accrued_to` **and** an
edge change). The closure is a **settle-delta subtraction**:

`src/core/goals.js` `goalProgressOps` writes daily `ev:kill_any` and lifetime
`stat ev:kill_any` from **one counter in one delta**, so the lifetime row's growth
since this character's previous bounty-free credit *is* the number the settle put
on the daily row. The branch records that value on the log row it already writes
for idempotency (`hr_kill_credit_log.kills_stat`) and applies

```
applied = max(0, credit - settle_delta)      ⟹  daily total = observed
```

giving the bounty-free branch the same arithmetic cancellation the bounty branch
already had against the bestiary counter. **No edge change**, so AWAY-1 parity is
untouched by construction.

### Client half

`src/legacy.js` `hrRecordKillForCredit` buffers **every** kill (skipping the
active bounty target, which has its own cumulative cadence) and flushes on a 60 s
cadence — plus a **bounded trailing drain**. That drain is not polish: b484
shipped the bounty credit gated on "the next kill" and that is exactly how a
bounty came to hang forever. A stopped player is the reported symptom, so the
credit must be *scheduled*, not kill-gated.

### Exploit surface delta (security-reviewed — GO-WITH-CONDITIONS, conditions folded in)

New client-reachable surface. The physical cap (`floor(1.3 × elapsed / 600 ms)` =
130 kills/min) and the 10,000/UTC-day ceiling are **fuses, not the control** — the
largest target any reader grades is 100. The control is the **once-per-period
claim guard** in `hr_claim_goal` / `hr_claim_daily`, which bounds a perfectly
forged counter to:

| scope | ceiling |
|---|---|
| character · UTC day | 2,800 gold + 2 gems + 5 bones |
| character · ISO week | 2,500 gold + 3 gems (`wk_kills`) |
| **account · day (6 slots)** | **16,800 gold + 12 gems + 30 bones** |

> **b497 (2026-09-04) — the day rows moved; the CONTROL did not.** The Game
> Designer's gold-per-effort-minute retune re-priced two of the four kill-graded
> terms: `daily_kill` 500 → 600 and `daily_kill_big` 900 → 1,400 (`kill_any` 200
> and `kill_more` 600 unchanged), so the character-day line went 2,200 → 2,800
> and the account-day line 13,200 → 16,800. What bounds a forged counter is
> unchanged — a once-per-period guard row plus an amount read from a catalogue no
> client role may write, which is what makes a fabricated counter a GATE and
> never a MULTIPLIER. Only the amount moved, by 0.06% of one character's measured
> honest ~1.05M gold/day from the live accrual path. Applied by
> `supabase/migrations/2026-09-04-goal-gold-retune.sql`; pinned BY VALUE in
> `tests/kill-daily-credit.mjs` K10(2), so the next re-tune re-opens this review
> by name.

Two corrections to the first draft's bound, both worth carrying forward because
they were *methodological*, not arithmetic:

- **`gold_500` is coupled** even though it is not a kill goal. It is a
  `ledger_gold` goal summing `player_ledger.gold`, and `hr_claim_goal` journals
  each payout with `gold = v_cat.gold` — so gold minted by a forged *kill*
  counter is itself countable toward "Earn 500 gold". A reader who greps for
  `ev:kill_any` misses it, the same trap that hid `hr_claim_daily` from the first
  reader set.
- **Everything is per character.** `player_state` and every counter and claim
  guard are keyed `(user_id, slot)`; an account holds six.

The **XP component** used to be zero, and this paragraph used to say so with the
trigger condition *"if anyone maps `combat` to a real skill … this verdict must
be re-taken."* **The trigger fired in b492/b493 and the verdict was re-taken.**
`hr_goal_rewards` priced every kill goal in `xp:{"combat":N}`; `combat` is not a
row in `hr_skills`, so `hr_claim_goal` routed the grant to `skipped_xp` — which
was a **defect**, not a control (players had never received the XP component of
any kill goal, while the modal quoted it as part of the price). Security **S7**,
owned by the Designer, fixed by `2026-09-01-kill-goal-xp-hitpoints.sql`: the
grant lands in **hitpoints**, 100 / 300 / 1,000.

So the forged-counter bound gains **400 hitpoints XP per character-UTC-day +
1,000 per ISO week**. `hitpoints` *is* ranked (combat level and the
`skill:hitpoints` board) — but the ×6-slot multiplier above does **not** apply to
the XP line, because `leaderboard_ranked` reads `player_skills` where `slot = 0`.

**Accepted (Security, b493)** on four grounds: (1) the *amount* is server-authored
— `hr_goal_rewards` has RLS on, no policy and every client grant revoked, and the
forgeable number `v_have` appears only in the journal and the receipt, never in an
arithmetic that scales a payout, so a forged counter is a **gate, never a
multiplier** (10,000 fabricated kills pay exactly what 30 honest ones pay);
(2) scale — `hr_credit_combat_xp` already accepts up to **5,000,000** client-
submitted combat XP per character-day into the same seven skills, hitpoints
included, so 400/day is 0.008% of an accepted surface; (3) `hitpoints` is in the
**ACCRUED** set of `src/data/skill-authority.js`, so the absolute envelope
re-asserts the server's value over the client's, downward included — it was the
safe destination, not merely a legal one; (4) journalled by name and reversible
(`goal_claim:<period>:<goal_id>`, `meta.xp`). **Residual, stated:** the grant is
deliberately outside the shared 40M/day inflow budget, so the catalogue and the
once-guard are its only bound — which is why `K10(3)` now pins all three
catalogue terms (skill, amount, cardinality) and re-opens the review by name if
any of them moves.

Gold reaches the `wealth` board of `leaderboard_ranked` and is market purchasing
power, so this is a ranked + tradeable surface. The accepted argument is
magnitude (the accrual path pays ~1.05M gold/character-day, ~80× even the
six-slot ceiling) plus by-name journalling on the payout side (`goal_claim:` /
`daily_claim:`) and on both forgery signals (`kill_credit_throttled:` and
`daily_kill_settle_absorbed`).

### The S1 finding — why the strong invariant needed a second pass

The first build of the settle-delta fix advanced the watermark to the *current*
lifetime value unconditionally. When `credit - settle_delta` floors at 0 the
surplus is never subtracted from anything — but marking the watermark declared it
consumed, permanently **forgiving** it. `credit(C) → settle → credit(0)` was
therefore a "clear the debt" button, and the daily row grew linearly past
observed truth (156 against 120 over three rounds). The header, `GATE(f5)` and
`K11` all asserted "exactly observed" while that was false — the invariant was
aspirational, and only an adversarial read found it.

Three changes make it actually true:

1. the watermark advances by `least(delta, credit)` — what the flooring actually
   consumed — so a call that credits nothing clears nothing;
2. it is **scoped to the UTC day**, because an un-consumed remainder must not
   cross midnight and swallow the next day's attended credits, which would
   re-create the original defect one day later and much harder to trace;
3. it is read as `max(kills_stat)`, not "the newest row's value" — a monotone
   watermark's current value *is* its maximum, and an ordered read broke its
   tiebreak on equal timestamps and made the credit *over*-subtract. `GATE(f6)`
   caught that on the first draft of the fix itself.

### Applying it

`§0b` pins an md5 of the live `hr_credit_kills__ungated` body this file restates
(`6d0eb3f8ff66efd0227dc94cfb194311`, normalised length 5563) — **measured on both
production and a full PGlite replay of this chain and found byte-identical**, so
the hash asserts "live == the reviewed 2026-08-30 baseline" rather than "live ==
whatever was there when I looked". It normalises with `[[:space:]]+` and not
`'\s+'`: the two runtimes disagree on backslash classes under
`standard_conforming_strings` (measured — the same expression normalised
whitespace on production and ate every letter `s` under PGlite), and a
fingerprint gate that fires differently in the harness than on production is
worse than no gate.
