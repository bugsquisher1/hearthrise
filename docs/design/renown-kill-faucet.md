# R5 — the renown kill faucet (LIVE, pre-existing, P1)

**Status:** BUILT on `fix/renown-kill-faucet` — migration
`supabase/migrations/2026-09-02-renown-kill-faucet.sql`, **not applied**. Security's
five pre-build conditions are folded in (§8).
**Raised by:** Security, during the review of `2026-09-01-kill-daily-credit.sql`.
**Not introduced by that file** — this is the *deployed* `2026-08-30-bounty-kill-credit.sql`
behaviour and has been live since it was applied.
**Requires its own security pass when built.**

---

## 1. The defect

`hr_credit_kills` (bounty branch) writes three lifetime rows:

```
stat / ev:kill_monster:<target> / ''   -- topped up to baseline + credit
stat / ev:kill_any               / ''   -- += v_applied
stat / kills                     / ''   -- += v_applied
```

`hr_renown_of` **scores two of them**:

```
ev:kill_any                         × 0.05 renown per kill
ev:kill_monster:<id> where is_boss  × 5    renown per kill
```

So a client-reachable verb feeds a score the client is not supposed to author.

### Why the row is doing double duty (the structural root)

`hr_bounty_kills` — the bounty turn-in's progress source — reads
**`stat/ev:kill_monster:<target>`**, i.e. *the same row* the bestiary displays and
renown scores. `hr_credit_kills` has to move it to make a bounty completable, so
moving renown is a side effect of making the bounty work. One row, three
consumers, one of which is a score.

## 2. Rate, measured

`cap = floor(1.3 × elapsed_since_accept / min_time_to_kill(hp, dmg_level))`.

All 108 monsters are bounty-eligible (`hr_bounty_monsters` is generated from every
`MONSTERS` key); the 14 bosses are tier 6, gated only by combat level. For a
tier-6 boss at damage level 99 the kill-time model gives `max_hit_ceil` 319, so
`dragon` (hp 520) needs 2 swings → `min_kill_ms` 1200 →

| | rate | renown |
|---|---|---|
| forged (cap-limited) | **65 boss kills/min** | **325/min · 19,500/hr** |
| honest (~8 s/kill) | ~7.5 boss kills/min | ~37/min |

≈ **8.5× honest**, requiring no gear, no risk, no deaths and no combat at all.

**Re-accepting is not needed.** `v_applied = max(0, baseline + credit - current)`
and `credit` grows with `elapsed_since_accept`, so a *single* bounty held
indefinitely yields a sustained 65/min. (Re-accepting is in fact *worse* for the
attacker — it resets `accepted_at`, so `elapsed` and therefore `cap` restart at 0.)

## 3. What the score buys — and this is bigger than "a ranked score"

The brief called this a renown-score faucet. The board itself is **not** the
exposure: `renown` was removed from `leaderboard_ranked` in
`2026-08-18-leaderboard-server-source.sql` and declared `no_server_source`. The
exposure is the two things that *do* read `hr_renown_of`:

**(a) `hr_claim_rank` — a gold + gem ladder, once per rank per character:**

| | gold | gems |
|---|---|---|
| serf → highking (11 ranks) | **1,603,000** | **925** |
| × 6 slots | **9,618,000** | **5,550** |

Gold feeds the **`wealth` board** (server-sourced and live) and is market
purchasing power. 1.6M gold ≈ 1.5 character-days of the measured honest maximum
income (~1.05M/character-day) — obtained in ~6 hours of scripted calls with zero
gameplay. The **925 gems per character** is the sharper half: that is premium
currency.

**(b) `hr_perks_of` → `renownAllXp`** — +0.01 all-skill XP at each of squire
(900) / baron (4,500) / duke (32,000) / highking (120,000), **+0.04 total**,
clamped by `PERMANENT_CAP`. All-skill XP feeds `total_level` and `combat_level`,
which **are** server-sourced live boards. Bounded, permanent, and reached ~8.5×
early.

Time to the top rank from the faucet alone: 120,000 / 5 = 24,000 boss kills at
65/min ≈ **6.2 hours**, against ~53 hours of honest nonstop boss killing.

## 4. Options considered

| | closes it | blast radius | verdict |
|---|---|---|---|
| **A.** Decouple: give the bounty its own progress column on `active_bounty`; stop `hr_credit_kills` writing the bestiary row | fully | restates `hr_claim_bounty` (a money verb) **and** regresses the bestiary display to settle-only | root-cause but the widest change, and it breaks the attended bestiary |
| **B.** Per-UTC-day ceiling on client-credited bestiary/lifetime kills | caps it | small | still leaves a daily allowance on a *score*; a ceiling two orders above the honest rate is a fuse, not a control — the same argument this program already rejected for the daily row |
| **C. RECOMMENDED.** Discount the client-credited portion inside `hr_renown_of` | fully | one pure read-only function + two additive counter keys | see below |

## 5. Recommended design (C)

**Principle:** the bounty needs the counter; renown does not need the *credited
part* of it. Score only what the server itself simulated.

1. `hr_credit_kills` (bounty branch) additionally increments, by the **same
   `v_applied`** it already applies:
   ```
   stat / ev:kill_credited:<target> / ''
   stat / ev:kill_credited_any      / ''
   ```
2. `hr_renown_of` subtracts them:
   ```
   kill term  greatest(0, ev:kill_any - ev:kill_credited_any)        × 0.05
   boss term  sum over boss ids of
              greatest(0, bestiary(id) - ev:kill_credited:<id>)      × 5
   ```

Nothing else changes: `hr_bounty_kills` still reads the bestiary row, so the
turn-in, the reviewed clamps, the idempotency and the journal are all untouched,
and the bestiary/collection **display** stays attended-accurate.

**Why this body is the safe one to restate.** `hr_renown_of` is `stable`,
`security definer`, **writes nothing**, and is ~60 lines of pure arithmetic. It
is granted only to `hr_engine`. Restating it cannot revert a hotfix in a write
path, and the migration can fingerprint the live body first (the C3 idiom now
established in `2026-09-01-kill-daily-credit.sql` §0b — with `[[:space:]]+`, not
`'\s+'`).

**Stated cost, honestly.** Renown will no longer score attended kills that the
client credited. That is a deliberate **under-count**, and it returns renown to
exactly its pre-2026-08-30 position — no regression against the reviewed
baseline, in exchange for removing a faucet that is live now.

**Op-count check:** one extra progress op per crediting call, on a key bounded by
the monster catalogue (108). Well under `hr_apply`'s `c_max_progress_ops` (64) —
and these are written by the RPC directly, not through a delta.

## 6. Tests the build must ship

- a PGlite guard that drives `hr_credit_kills` on a **boss** target and asserts
  `hr_renown_of` is **unchanged** by the credit, while `hr_bounty_kills` and the
  turn-in still work exactly as reviewed;
- the honest control: a **settle** that writes the same rows *does* move renown
  (otherwise the fix is "renown is always 0", which passes the same assertion);
- mutation proofs: drop the discount → guard red; discount the wrong key → red;
- a drift guard binding the rank ladder in the migration to
  `src/data/renown-ranks.js` (it is currently a second copy in two places).

## 7. Related surfaces, named not fixed

- **`hr_credit_combat_xp` is a second renown path.** Renown scores
  `total_level × 2`, `combat_level × 2` and `skill99 × 100`, and that verb mints
  up to 5,000,000 combat XP/day. That was reviewed and accepted on its own terms;
  it is *not* re-opened here, but the two together are the reason renown should
  stop reading anything a client verb can move.
- **`ev:loot:%` (collection × 3) is safe today** — those rows are written only by
  the settle (`collectionProgressOps`); no client verb touches them.
- **The rank ladder is a second copy of `src/data/renown-ranks.js`.** Not this
  fix's to correct, but a drift guard belongs with it.


---

## 8. Security pre-build conditions, as built

**1 — the two-migration coupling is pinned, not described.** Two migrations one
commit apart touch `hr_credit_kills__ungated`, which is the b484–b487 class
living inside one worktree. `§0a` pins **two** hashes: `c_expect` (the body
2026-09-01 installs — literally that file's own `c_self`, so the two files cannot
drift apart about what "the kill-daily body" means) and `c_applied` (this file's
own output, so a re-apply is a no-op). Anything else raises. The file sits
strictly after 2026-09-01 in `schema-apply-order.json`, and applying it first
**fails closed by name with the remedy** — verified by booting the chain without
kill-daily and executing this file.

> A substring probe is not enough, and that is measured rather than assumed: the
> identical idiom in 2026-09-01 §0b waved through a hotfix applied *on top*
> (which still contains the substrings). Both files now pin hashes.

**2 — retroactivity, stated.** Forward-only. Credited kills since 2026-08-30
keep scoring **forever**; there is **no backfill source** (the only record of
which kills were client-credited is `hr_kill_credit_log`, retained two days); and
**already-claimed ranks are unrecoverable** (`hr_claim_rank` consumes a
once-per-rank guard and holds a `greatest()` high-water, so up to 1,603,000 gold
+ 925 gems per character may already be banked). The `renownAllXp` perk reads the
live score and *does* self-correct, but only for future credits.
**The answer is the beta wipe** (CLAUDE.md, Tyler 2026-08-10) — and that is
written down as the whole justification, with the explicit trigger: *if the wipe
is ever cancelled or deferred past this fix, this is the paragraph that must be
re-opened*, because the correct action then becomes a renown recompute plus a
rank-claim audit, and neither exists.

**3 — the ordering invariant `ev:kill_credited:<id> ≤ bestiary(<id>)`** is
asserted (the bestiary is written *absolutely* via `greatest`, the counter
*additively*, so the two must be kept ordered), with mutation
`credited_exceeds_bestiary`.

> ⚠ The invariant alone turned out to be **too weak to catch its own mutation**:
> honest kills sit in the bestiary row and absorb the overshoot, so no inversion
> appears. The property that actually holds the line is a **signed equality — a
> *throttled* credit must move renown by exactly 0**. Above 0 the faucet is open;
> **below 0 the discount is eating renown the player earned honestly**, and every
> "did not rise" check passes straight over that. Both layers now assert it
> (`GATE(c5b)` and `R8`), and the mutation reads −550.

**4 — the credited keys can never be pruned.** They carry `period_key = ''` (the
permanent population) and `hr_progress_prune` deletes only `period_key <> ''` —
proven by **running the prune at `interval '0 seconds'`** and requiring the rows
to survive, with `ev:kill_any` as the control. If a credited row could be swept
while the row it discounts survives, the discount fails **OPEN**: the faucet
re-opens on a timer with nothing looking broken. Mutation `credited_is_periodic`.

**5 — read cost, measured.** `hr_renown_of` is on `hr_perks_of`'s path, which the
accrual engine calls every settle. Both added lookups supply `player_progress`'
complete **primary key**, so the added work is one index probe for the kill term
plus one per bestiary row (≤108) for the boss term — no new scan, no new sort.
Measured against a **full 108-row bestiary**: **6.0 ms/call on PGlite**, against a
deliberately generous 60 ms ceiling sized to catch a plan that degraded to a scan.
The guard reports the number on every run, pass or fail, so a creeping regression
is visible rather than merely under threshold.

### Test inventory

`tests/renown-kill-faucet.mjs` — R1 honest control (a settle scores exactly 505),
R2 faucet closed with a fixture-degenerate guard, R3 sustained spam, R4 the
discount subtracts rather than latches, R5 the bounty turn-in still pays, R6 the
discount is per-monster, R7 read cost, R8 throttled-credit signed equality +
the ordering invariant, R9 unprunable. **10 mutations, all caught**, three of
them with the migration's own gate short-circuited so the guard alone must see
them.
