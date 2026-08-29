# R5 — the renown kill faucet (LIVE, pre-existing, P1)

**Status:** DESIGNED, not built. Branch `fix/renown-kill-faucet`.
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
