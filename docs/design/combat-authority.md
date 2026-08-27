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
