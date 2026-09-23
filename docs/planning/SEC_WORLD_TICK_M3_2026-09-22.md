# Security review — M3, the COMBAT channel on the world tick (SHADOW)

**Reviewer:** security-engineer (veto authority)
**Date:** 2026-09-22
**Under review:** `lane/world-tick-m3` @ `59b748e5` (merged onto `next` `bdfb5cd3`, which carries the T-1/T-2/T-3 fixes)
**Prior verdicts:** `SEC_WORLD_TICK_M1_2026-09-21.md` (M1 gather: all GO; T-5: SHADOW GO, derived token REQUIRED-BEFORE-PAYING)
**Design:** `WORLD_TICK_DESIGN.md` §16
**Reviewed as a money surface.**

---

## Verdicts

```
MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES
EDGE DEPLOY hr-accrue at pack hash e76ae11c147137e3ada5c6bf97f127ee71e72775d54242d5f2a44997555a4b42: GO
COMBAT SHADOW ON PRODUCTION: BLOCK
```

The three are deliberately separable, and the separation is load-bearing: the defect that blocks the
shadow run lives in `services/world-tick/combat.js`, which **is not in the edge payload** (verified:
`pack-edge --check` lists 75 files and none under `services/`). The migration and the edge deploy can
proceed today; arming the combat channel cannot.

---

## Findings

| # | Surface | Claim | Status | Trigger | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|---|
| **S-1** | `services/world-tick/combat.js` `settleCombatSession` | The seed label is the `hr_state_of` spelling **for the first window of a session only**. Every later window is re-chained from `res.delta.accrued_to`, which `accrual.js` emits as `new Date(settledTo).toISOString()` — the `…Z` spelling T-2 names. **Measured 10 of 12 windows.** | **CONFIRMED** (`tests/sec-world-tick-m3-seed-label.mjs` S-M3-1) | Any session longer than one cadence window | Every drop / crit / gold roll after window 1 draws a stream the accrue path never would. **Not player-predictable** (`hr_seed` still mixes the 256-bit secret), so not a mint — but it makes the 48 h per-field parity read divergent *by construction* on the one channel that mints loot | **P0 for the shadow run's purpose** | Re-render the watermark in the envelope's spelling instead of chaining the engine's ISO string; make C9 assert **every** window |
| **S-2** | `combat.js` `pgTimestamptzText` / guard C9 | The helper pads the fraction to six digits. **PostgreSQL trims trailing zeros and omits the fraction entirely on an exact second** (checked against a real server via pglite, not against a restatement). C9's `/\.\d{6}\+/` arm therefore *enforces* a spelling production cannot emit for a ms-precision watermark. A 10 s cadence lands on exact seconds constantly. | **CONFIRMED** (S-M3-2) | Every ms-precision or exact-second watermark | The guard that is the exit code for T-2 is calibrated to an unreachable string, so it cannot certify the label it exists to certify | **P1** | Derive the expected spelling from the server (or from the envelope), never from a padded helper |
| **S-3** | `combat.js` `sessionFromRoster` | `accruedToText: row.accrued_to` reads the **roster's `timestamptz` column**, not the `hr_state_of` envelope's JSONB rendering that `index.ts` labels with (`'accrue:' + String(st.accrued_to)`). A `timestamptz` crossing a PG driver is a `Date` (→ `seedLabelFor` throws, fail-closed) or the driver's own text (`2026-09-18 12:00:09.6+00` — space separator, `+00`), neither of which is the envelope spelling. | **CONFIRMED by inspection**; production driver behaviour unverified (no production access) | First window of every session, once wired | Window 1's label is driver-dependent: fail-closed if a `Date`, silently wrong if a string | **P1** | Label from the envelope (`state->>'accrued_to'`), or have the roster return the watermark **as text** |
| **S-4** | `hr_tick_shadow` ALTER | Eight **`STORED` generated** columns force a full table **rewrite** under `ACCESS EXCLUSIVE` while the gather shadow is inserting every 90 s. Not named in the migration or the runbook. | **CONFIRMED by inspection** (PG always rewrites for a stored generated column) | Apply while gather shadow runs | The apply blocks on, and blocks, the running tick writer; duration scales with `hr_tick_shadow` size | **P1 (operational)** | Drain the lease and pause the tick for the apply; pre-size the table (runbook below) |
| **S-5** | `hr_tick_config.channels` CHECK | Validated against the existing row on apply. A **NULL element** in the live array makes the predicate NULL, which *passes* validation — `c2c` only probes a temp table, never the live row. | **PLAUSIBLE** (unverifiable without production) | A pre-existing NULL element | Would let an unsettleable channel survive the constraint | **P3** | One pre-flight `select` (runbook below) |
| **S-6** | `WORLD_TICK_DESIGN.md` §16.10 | Names the post-change pack hash as `df215d58…`. That is the hash at `ea889df` — **before** the lane merged `next`. The lane head is `e76ae11c…`. | **CONFIRMED** (hashes computed at each commit) | An operator verifying `payload_sha256` after deploy | Operator chases a deploy that in fact succeeded | **P3 (doc)** | Correct §16.10 to `e76ae11c…` |

Nit (not a finding): `sessionFromRoster` still sets `goals: st.goals`, now dead — `tick-shadow.js` no longer reads it and `accrual.js` never did.

---

## The ten questions, answered

**(1) AWAY-1 / AWAY-12 — one engine, same inputs. VERIFIED, independently.**
I did not take C1's word for it: I parsed both object literals out of source and diffed the key sets
mechanically. `index.ts` passes **42** keys; `tick-shadow.js` passes **39**. The three that differ are
`actionBudget`, `recipes`, `unlockedRecipes`, and each is on C1's exemption list with a written reason.
I checked all three against `accrual.js` rather than against the reason:

- `actionBudget` — read only at `:3677-3680`, inside `accrueArtisan`; `null` and `undefined` both take the
  `=== null || === undefined` branch, so passing it and omitting it are the same call.
- `recipes` — read at `:1348` behind `inp.activeKind === 'artisan'`, and at `:3516` inside `accrueArtisan`.
- `unlockedRecipes` — read only at `:3567`, inside `accrueArtisan`.

All three are unreachable from a combat pointer, and if the tick were ever pointed at `artisan` the
absence fails **closed** (`catalogueHas({}, id)` → `SKIP.NO_RECIPE` → refuse, not pay). The eleven combat
inputs are all present. **The key-set half of AWAY-1 holds.** C1's structural derivation from `index.ts`'s
own source is the right shape of guard and is the reason this class stops recurring.

**(2) The seed label for combat, every window, including after a death or a retreat. FAILS — see S-1.**
After a death the chain is intact in *structure* (a death window still accrues, so `delta.accrued_to`
still advances the label) and a retreat **ends** the session (`stoppedBy='activity'`, batch closed), so
neither is a special case. The defect is not about deaths or retreats — it is that **every** window after
the first is spelled from the engine's `toISOString()` instead of the envelope's rendering. Windows 2..N
therefore label `hr_seed` with `accrue:2026-09-18T12:00:09.600Z` where the accrue path for that same
instant uses `accrue:2026-09-18T12:00:09.6+00:00`. `hr_seed` hashes the **label**, so those are two
streams. C9 is green because it asserts `tick.windows[0]` and takes the chain on induction — the same
blindness §16.3 attributes to `world-tick-parity.mjs`, moved one level up.

**(3) Deaths / Recovery rev.2. HOLDS.** `recovering_until` is `ABSOLUTE`, `deaths` is `APPEND`,
`delta.fight` is voided on a death window, and the death counters now reach the engine (that was the
milestone). C7's `freeHeal` mutant is filed against the boundary and asserts the **input of the next
window**, which is where a decomposition would reintroduce b509. An entirely-recovery window still
settles (16.1), which closes recovery exploit R1 through the tick.

**(4) Food / auto-eat. HOLDS.** `items` is signed and `ADDITIVE_MAP`, so the debit folds with the drops;
`advance()` carries the bag, so a mid-window exhaustion lands on the same tick both ways. The one honest
divergence — `food_in_bag`, a window-OPEN snapshot — is an audit field on the death ledger that no gate,
price or grant reads; it is pinned by C8 and named in §16.8 rather than papered over. Correct call.

**(5) Drops — the rare roll and the drop table draw the same stream. FAILS, via S-1**, for every window
after the first. This is the question S-1 answers "no" to.

**(6) The progress fold cannot lose or double. VERIFIED, independently.** `foldProgressOps` keys on
`(kind, key, period, state)` and sums `add`, which is arithmetically identical to `hr_apply`'s own
`progress = progress + add` against a row keyed on the same tuple. I checked the one way a `{...op}` fold
can silently lose data — a non-key field differing between two ops that share a fold key — by running all
three fixtures and inspecting every op: **1,947 ops, every one exactly `{kind, key, period, state, add}`,
zero lossy collisions.** There is no field for the fold to drop. It fails loud above the cap rather than
truncating, which is the right side to fail on.

**(7) The shadow table records what a per-field parity read needs, and pays nothing. HOLDS.** The shadow
branch of `hr_tick_settle` inserts and returns — there is no `hr_apply` call on it. The eight new columns
are `GENERATED ALWAYS … STORED`, so they cannot disagree with the delta they derive from and cannot be
written (`c6` proves the UPDATE is refused). `would_items` keeps the **signed** food debit (`c4h`) and
`would_xp` keeps the per-skill map, which is what a combat parity read actually asks. Malformed deltas
degrade to `0` / `{}` / `NULL` rather than erroring (`c5`). No grants, RLS enabled **and forced**, no
policies (`c7`/`c7b`/`c7c`).

**(8) The self-check, and the CHECK against the running gather shadow. HOLDS, with S-4/S-5.**
The self-check is probe-rows-only inside a sub-block that raises `HR922_ROLLBACK_OK` to roll back to the
block's implicit savepoint; the DDL above it is deliberately outside and persists. `selfcheck-no-global-dml`
is green. It is production-applicable: neither `hr_tick_ownership` nor `hr_tick_shadow` carries an FK
(so the synthetic probe uuid inserts cleanly) or a trigger, and the `on conflict (user_id, slot, intent_id)`
in `c8` has its unique index (fence `:290`). The `channels` CHECK **cannot strand the running gather
shadow**: `channels` is `not null default array['gather']`, `array['gather'] <@ array['combat','gather','artisan']`
is true and the length is 1, so the live row validates. The literal equals `accrual.js` `PAYABLE_KINDS`
exactly (verified). `c3` proves the file **arms nothing** — combat is not added to `channels` — which is
the right call: a migration that widened the default would arm a channel by applying a file.
The residue is S-4 (the rewrite lock) and S-5 (a NULL element would pass validation).

**(9) Does the combat input change move the GATHER shadow? NO — proved by differential, not by assertion.**
`gather-parity` being green is weaker evidence than it looks; §16.4's own lesson is that that guard was
*blind*, not wrong. So I ran the deployed code against the lane code directly: I built a worktree at
`bdfb5cd` (whose pack hash is `b5eb7ad4…` — **exactly what production is deployed at**, confirming the
live edge is the T-fix build) and ran both versions of `tick-shadow.js` over every fixture.

- **All three gather sessions, through the full `settleGatherSession` loop — byte-identical.**
  7 intents / 60 settled each, identical intents, watermark, poll count and end character.
- The only difference anywhere is on a **combat** fixture, and it is `summary.autoEat.enabled: false → true`
  — a reporting flag. Gold, XP, items, kills, ticks and deaths are identical, because that fixture's
  handler never fires (`foodEaten: 0`, `hadFood: false`). §16.4's claim about that fixture is accurate.
- `attended: null` vs absent: `normaliseAttended` returns `null` for both (`:427`). Confirmed in source.
- `goals` removal: `accrual.js` **never reads `inp.goals`** — grep returns nothing. Inert.

The payload delta against what is deployed is **one file, +67/−1** (`tick-shadow.js`). Blast radius is
as tight as it can be. **New pack hash: `e76ae11c147137e3ada5c6bf97f127ee71e72775d54242d5f2a44997555a4b42`.**

**(10) The attended split. PROVED, and the mid-window answer is stated.** `settleCombatSession` throws on
`o.attended` *or* `session0.attended` before any other work, and `foldCombatMeta` throws on a meta
carrying `att` — two independent refusals, fail-closed, executable (C10).

*A character that goes attended mid-window:* the tick does not notice and does not need to. It never reads
`hr_attended_kills`, so it proposes the simulation alone. **In SHADOW this costs nothing** — the branch
pays nothing — it only pollutes the parity read by exactly the top-up, which is why the read must
partition on `meta.att` (query below). If the player's client settles during the window, `hr_apply` moves
`accrued_to`, the fence's `greatest(accrued_to, shadow_accrued_to)` CAS sees `window_from < v_mark` and
returns `window_already_settled` — so there is **no double pay**, in either mode. If the pointer itself
changes, `channel_moved` refuses first. **Armed**, the same silence becomes a real under-pay of the
top-up, which is why §16.6 makes the attended fence a hard ARM blocker. That ordering is correct.

---

## Guards run — real exit codes

Every number below is an exit code I observed, not an expectation. The five pglite-backed guards failed
first with `@electric-sql/pglite is not installed`; it is a **declared devDependency** and `node_modules`
was simply empty in this container. After `npm ci` they were re-run — the exit codes below are the re-runs.

| Guard | Exit |
|---|---|
| `tests/world-tick-combat-parity.mjs` | **0** |
| `tests/world-tick-combat-parity.mjs --mutate` | **0** |
| `tests/world-tick-parity.mjs` | **0** |
| `tests/world-tick-double-pay.mjs` | **0** |
| `tests/world-tick-double-pay.mjs --mutate` | **0** |
| `tests/world-tick-shadow-chain.mjs` | **0** |
| `tests/world-tick-writer-authz.mjs` | **0** |
| `tests/world-tick-edge-contract.mjs` | **0** |
| `tests/edge-tick-gate.mjs` | **0** |
| `tests/edge-tick-gate.mjs --selftest` | **0** |
| `tests/accrual-engine.mjs` | **0** |
| `tests/schema-drift.mjs` | **0** |
| `tests/apply-order-honesty.mjs` | **0** |
| `tests/selfcheck-no-global-dml.mjs` | **0** |
| `tools/pack-edge.mjs hr-accrue --check` | **0** |
| `tools/pack-edge.mjs hr-accrue --hash` | **0** → `e76ae11c1471…` |
| `tools/lane-done.mjs` | **0** — `lane-done: all green.` |
| **`tests/sec-world-tick-m3-seed-label.mjs`** (filed by this review) | **1 — RED, 2 arms** |
| **`tests/sec-world-tick-m3-seed-label.mjs --mutate`** | **0** (mutation proof: each arm green under its mutant) |

The proof file is **deliberately not registered in `smoke.yml`** — it is red against lane code, and
CLAUDE.md §4 makes one standing red guard the thing that puts the CI gate out of reach for every later
build. It is declared in `tests/guards-unregistered.json` as owned debt with the disposition
`failing-proof-pending-fix`: the M3 lane deletes that entry and registers the file in `smoke.yml` **in the
same commit that fixes S-1**, at which point the arms are green and become the standing guard against T-2
recurring on the *chain* rather than on the helper. `guard-hygiene` is green with the entry present.

---

## Runbook

### Order, relative to the running gather shadow

1. **Pre-flight (read-only), before anything.**
   ```sql
   select channels,
          array_position(channels, null) as has_null_element,   -- must be NULL (S-5)
          enabled, shadow
     from public.hr_tick_config where id;
   -- Expect: channels = {gather}, has_null_element NULL, enabled false, shadow true.

   select pg_size_pretty(pg_total_relation_size('public.hr_tick_shadow')) as size,
          count(*) as rows
     from public.hr_tick_shadow;   -- sizes the S-4 rewrite window
   ```
   If `has_null_element` is not NULL, **stop**: clean the array before applying, or the CHECK validates
   a value the tick cannot settle.

2. **Drain the tick lease and pause the gather shadow for the apply (S-4).** The eight `STORED`
   generated columns rewrite `hr_tick_shadow` under `ACCESS EXCLUSIVE`; a live writer will block on it
   and it will block the writer. Let the current lease expire (`lease_until <= now()`) and hold the tick
   process off, or apply during a gap between flushes if the table is small enough that the rewrite is
   sub-second. **This is the "changes" in GO-WITH-CHANGES** — the migration is otherwise clean.

3. **Apply**, one file, per CLAUDE.md §2 — never inside `begin/commit`, never 00:00–00:10 UTC, Coordinator only:
   ```bash
   node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-combat-channel.sql
   ```
   Expect `world-tick-combat-channel self-check PASSED (c1-c8); probe rows rolled back`.

4. **Resume the gather shadow.** The migration arms nothing (`c3`); the gather cohort is untouched.

5. **Post-apply:** read-only verification agent → `live-hash-drift --live --write` + whys →
   apply-order note flipped to APPLIED → `restore-census` (no new tables; the columns are new).

6. **Edge deploy** (`supabase/functions/**` moved, so before any push):
   ```bash
   node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
   cp supabase/config.toml <dir>/supabase/config.toml
   npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> --project-ref nezapsylztqbbwuwembx
   ```
   Then verify the live `payload_sha256` equals
   **`e76ae11c147137e3ada5c6bf97f127ee71e72775d54242d5f2a44997555a4b42`** — **not** the
   `df215d58…` §16.10 names (S-6). Deployed-now is `b5eb7ad4…`.

7. **Do NOT arm combat.** See the block below.

### The arm SQL — for when the block is lifted, and not before

```sql
-- (a) the channel. One row, id = true.
update public.hr_tick_config
   set channels = array(select distinct unnest(channels || 'combat'))
 where id
   and not ('combat' = any (channels));

-- (b) the cohort. ONE character, chosen for a NON-attended combat pointer, and
--     owned=false first so the roster hands it out under a lease rather than
--     the row shipping owned (the c1b property).
insert into public.hr_tick_ownership (user_id, slot, channel, owned)
values ('<uuid>', 0, 'combat', false)
on conflict (user_id, slot, channel) do update set owned = excluded.owned;

-- (c) the ARM FENCE §16.6 requires: never arm a character with live kill credit
--     near its watermark, or the shadow read is polluted by the top-up.
select k.user_id, k.slot, max(k.at) as newest_credit, ps.accrued_to
  from public.hr_kill_credit_log k
  join public.player_state ps using (user_id, slot)
 where k.user_id = '<uuid>'
 group by 1, 2, ps.accrued_to;
-- Require newest_credit < accrued_to - ATTENDED_EDGE_SLACK_MS, else pick another character.
```

`hr_tick_config.enabled` stays **false** and `shadow` stays **true** throughout. Arming is an operator
UPDATE with its own Security GO; this document does not grant it.

### Parity queries, per field

```sql
-- (1) THE PARTITION. Compare ONLY the attended=false bucket (§16.6).
select date_trunc('hour', at) h, (meta->'meta' ? 'att') attended,
       count(*) rows, sum((meta->'delta'->>'g')::bigint) gold
  from public.player_ledger
 where kind = 'combat' and intent = 'accrue' and at > now() - interval '48 hours'
 group by 1, 2 order by 1, 2;

-- (2) PER FIELD, tick vs ledger, unattended windows only.
with tick as (
  select date_trunc('hour', window_to) h,
         sum(would_gold)   gold,  sum(would_kills)  kills,
         sum(would_ate)    ate,   sum(would_deaths) deaths
    from public.hr_tick_shadow
   where channel = 'combat' and window_to > now() - interval '48 hours'
   group by 1),
paid as (
  select date_trunc('hour', at) h,
         sum((meta->'delta'->>'g')::bigint)            gold,
         sum((meta->'meta'->>'kills')::bigint)         kills,
         sum((meta->'meta'->>'ate')::bigint)           ate,
         sum(jsonb_array_length(coalesce(meta->'delta'->'deaths','[]'::jsonb))) deaths
    from public.player_ledger
   where kind = 'combat' and intent = 'accrue'
     and at > now() - interval '48 hours'
     and not (meta->'meta' ? 'att')
   group by 1)
select coalesce(t.h, p.h) h,
       t.gold, p.gold, round(100.0*(t.gold - p.gold)/nullif(p.gold,0), 2) gold_pct,
       t.kills, p.kills, t.ate, p.ate, t.deaths, p.deaths
  from tick t full join paid p using (h) order by 1;

-- (3) ITEMS AND XP, which is the whole question on a channel that mints loot.
select key as item, sum(value::bigint) qty
  from public.hr_tick_shadow s, jsonb_each_text(s.would_items)
 where s.channel = 'combat' and s.window_to > now() - interval '48 hours'
 group by 1 order by 2 desc;
```

### What number means parity holds

- **`ate`, `kills`, `deaths`, `hp`, `consec_falls`: EXACT.** These are not drawn from the RNG stream in a
  way a re-seed perturbs at the aggregate — a divergence here is an input or a fold defect, not variance.
  Anything other than 0 is a defect. `would_ate = 0` beside a non-zero `meta.ate` is the §16.4 auto-eat
  input gap and means the eleven inputs did not reach the engine.
- **`gold`, `xp`, `items`: BAND, not equality.** A decomposition resamples the stream (§16.8 item 1), so
  digit-equality is the *wrong* expectation for combat — it is gather's property, not this one. The M1
  gather fixtures measured 1.1 / 5.6 / 4.5 % drift and the design treats that band as healthy.
  **Accept ±10 % per hour bucket over 48 h with no monotone drift**; a consistent one-directional gap, or
  any rare-drop item present in one set and absent in the other, is a defect and not variance.
- **`would_recovering_until`** must be a parseable ISO instant on every row where `would_deaths > 0`.
- **Row-count sanity:** `hr_tick_shadow` combat rows per hour must not exceed `3600/90 = 40` per character.
  More than that means windows are overlapping and the shadow watermark is not chaining.
- **A field at zero for two days is a P1 by definition** (CLAUDE.md §3.4), the same rule `vitals.mjs` lives under.

**None of these numbers can be trusted while S-1 stands**, because windows 2..N are drawn from a stream the
accrue path never used — the `gold` / `items` band above would be measuring the re-label, not the
decomposition. That is the block.

---

## COMBAT SHADOW ON PRODUCTION: BLOCK

**The unmet condition, stated precisely:** the seed label must be the `hr_state_of` rendering for
**every** window of a session, not only the first (S-1), and the guard that certifies it must assert
every window rather than `windows[0]` (S-2 makes the current arm's expected spelling unreachable anyway).

**Why this blocks rather than rides along.** The combat shadow run has exactly one purpose: produce a
per-field 48 h parity number on the channel that mints loot. S-1 makes `would_items`, `would_gold` and
the rare-drop rolls diverge from `player_ledger` **by construction** for every window after the first of
each session. §16.3 names this failure shape itself and names its consequence: *"the natural reading of a
48 h mismatch on a channel that mints loot is 'the tick is wrong' — or, worse, 'loosen something'."* A
shadow run that cannot be read is not a cheap measurement; it is a measurement that will be argued with.

**What satisfies it.**
1. Fix S-1 in `settleCombatSession` — re-render the watermark in the envelope's spelling rather than
   chaining `res.delta.accrued_to`.
2. Fix S-3 — label from the envelope's JSONB rendering, or have `hr_tick_roster` return the watermark as
   **text**. Note these interact: in SHADOW the roster's effective watermark is
   `greatest(accrued_to, shadow_accrued_to)`, an instant `player_state.accrued_to` may never have held, so
   the lane must state which string it labels with and why it is the one the accrue path would use.
3. Fix S-2 and widen C9 to every window; delete the `guards-unregistered.json` entry and register
   `tests/sec-world-tick-m3-seed-label.mjs` in `smoke.yml` in the same commit.
4. Re-run the battery above; the proof file must exit **0** without `--mutate`.

I will re-verify on request. **Residual risks I am accepting** with the two GOs: S-4 is an operational
hazard mitigated by the runbook, not by code; S-5 is unverifiable without production and is covered by
one pre-flight query; the attended top-up remains unpriced and is a hard ARM blocker, correctly, for
whenever arming is proposed.

---

# RE-VERIFY — 2026-09-23

**Reviewer:** security-engineer (veto authority)
**Under review:** `lane/world-tick-m3` @ `0ab94c17` — the lane merged `sec/world-tick-m3`
(`a63d7ea`) and `next` (`e1b2b6f1`), then landed `51e892e8` (S-1), `3ead5a96` (S-2),
`90b6bdee` (S-3), `b339a3cc` (S-5/S-6), `dabb0837` (S-4) and `fc090fd2` (guard registration).
**Branch:** `sec/world-tick-m3-2`, cut from that head. `npm install --no-audit --no-fund`.
**Known dependency ruled on below:** `lane/world-tick-m1f` @ `82606827`, not on `next`.

## Verdicts

```
MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES
EDGE DEPLOY (combat inputs): GO
COMBAT SHADOW ARM: BLOCK
ORDER vs M1f: apply-after-M1f
```

**MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES** — the SQL body has
not moved since the first review (`git diff 59b748e5..HEAD` on the file is header only); the
"changes" are the two operator conditions, now written where the operator will look (the
migration header and §16.10) but still conditions on the **apply**, not on the file: the S-5
pre-flight `select` must be read before the apply, and the tick must be paused for the S-4
rewrite. A GO would say the file may be applied with neither. It may not.

**EDGE DEPLOY (combat inputs): GO** — `pack-edge --check` exit **0**, 75 files, 45 vendored,
payload `9f9ec411bfefe428056df54b0cb9947fe683bfe5254096790f8d09ed997138f3`; I packed it to a
scratch directory and listed it: **no file under `services/`**, so S-1/S-2/S-3 do not move the
hash and `combat.js` is not deployed by this. Per the order ruling below the payload that
actually deploys is the post-rebase one, so **re-measure the hash after the M1f merge** — do not
verify `payload_sha256` against `9f9ec411…` on a rebased build.

**COMBAT SHADOW ARM: BLOCK** — on **S-7** below, which is new, CONFIRMED by execution, and is
the same class the known dependency fixes. The §16.6 attended fence remains a separate hard ARM
blocker, unchanged and correctly so.

**ORDER vs M1f: apply-after-M1f.** M3 must be **rebased onto `lane/world-tick-m1f` before the
edge deploy and before any arm.** One artefact is genuinely free and is named so it is not held
hostage: the **migration** is DDL on `hr_tick_shadow` / `hr_tick_config` only, touches no engine
input and arms nothing (C15, and §3 `c3`), so it may apply on its own schedule per CLAUDE.md
§3.3a. The **edge half and the arm are order-bound**, for three reasons: (1) S-7 — `combat.js`
hydrates from the wrong envelope level and there is no argument that makes it right on this head;
(2) M1f's `tick-shadow.js` change and M3's eleven-key block are the **same lines**, so the merge
is a conflict the Coordinator may not hand-resolve (CLAUDE.md §3.3) — it goes back to this lane;
(3) M1f fixes a **live** defect (the gather shadow measured `would_ticks: 0` on production
2026-09-22 22:37–22:42 UTC), and deploying M3's payload first buys nothing and costs a second
deploy cycle at a third hash.

---

## Findings ruled, one by one

| # | Ruling | The executing proof |
|---|---|---|
| **S-1** seed label on every window | **CLOSED** | `settleCombatSession` no longer chains `res.delta.accrued_to`; `combat.js:492` re-renders `pgTimestamptzText(settledTo)` and window 1 travels verbatim. `tests/sec-world-tick-m3-seed-label.mjs` exit **0**; `--mutate` exit **0** printing *"2 of 2 arm(s) went RED with the defect back"* — the file inverted from a failing proof to a standing guard and **both** arms bite. `--mutate --relabelSeed` on the parity guard exit **0** (RED, as required). |
| **S-2** `pgTimestamptzText` pads | **CLOSED** | The helper trims trailing zeros and omits the fraction entirely. Asked of a real server, not of a restatement: S-M3-2 renders four watermarks through pglite `to_jsonb($1::timestamptz) #>> '{}'` — the **exact second** `…T12:00:00+00:00`, the **trailing-zero ms** `…09.6+00:00`, the **three-digit ms** `…09.739+00:00`, and the cadence's next landing `…T12:00:10+00:00` — and all four match. Under `--mutate` all four diverge (`…00.000000+00:00` vs `…00+00:00`). C9's `/\.\d{6}\+/` arm is gone, replaced by PostgreSQL's own shape `^\d{4}-…(\.\d*[1-9])?\+00:00$` plus exact-second and millisecond arms on the helper. |
| **S-3** window 1 from the roster column | **CLOSED for the label** | `rosterWatermarkText(row, envelope)` (`combat.js:207`) never reads `row.accrued_to` as a string: the candidates are **`row.mark_text` first** — which is what `probeWatermark` carries out of the **fence** (`tick.js:357`, `markText: String(res.accrued_to)`), the only rendering that survives a microsecond mark — then the envelope's `state->>'accrued_to'`, and each must pass the `T…+00:00` shape **and** name the same instant as `row.accrued_to`, else the session is **refused**. Executed by C9: a `Date` and the driver's `2026-03-14 20:00:00.123456+00` both label from the envelope, both **throw** when the envelope carries none, a **displaced** shadow watermark throws, and `mark_text` is accepted. `world-tick-combat-parity.mjs` exit **0**, all 13 mutants RED-as-required. |
| **S-4** `STORED` columns rewrite `hr_tick_shadow` | **CLOSED as an operator condition** (no code to close) | The migration header now names the `ACCESS EXCLUSIVE` rewrite and the three-step pause, and §16.10 carries the same steps. It is documentation of a hazard, so it closes only when the apply is performed that way — see the runbook. |
| **S-5** NULL element passes the CHECK | **CLOSED as an operator condition** | The read-only pre-flight `array_position(channels, null)` is in the migration header and in §16.10's runbook. Still unverifiable without production; still one `select`. |
| **S-6** §16.10 names a stale pack hash | **CLOSED** | §16.10 now names `9f9ec411bfefe428056df54b0cb9947fe683bfe5254096790f8d09ed997138f3` and says how it was measured; I re-measured it at the head and got the same string. Both stale numbers (`df215d58…` at `ea889df`, `e76ae11c…` at `59b748e5`) are named as stale rather than deleted, which is the right call for an operator holding one of them. |

Nit from the first review, now fixed: `goals` is gone from both `tick-shadow.js` and the input
object. `sessionFromRoster` still sets `goals: st.goals`, and it is still dead — but it is now
dead **and** always `undefined`, which is S-7.

---

## S-7 (NEW) — `combat.js` hydrates the engine from the wrong level of the envelope

| # | Surface | Claim | Status | Trigger | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|---|
| **S-7** | `services/world-tick/combat.js` `sessionFromRoster` | `hr_state_of` is **two levels**: `state` holds the `player_state` columns and the **envelope top level** holds the projections built from other tables. `sessionFromRoster` reads **both** off one object — `st.hp` / `st.fight` / `st.auto_eat_enabled` / `st.deaths_today` (state level) beside `st.skills` / `st.inventory` / `st.equipment` / `st.enchant` / `st.buffs` (top level). There is **no argument that makes it right.** | **CONFIRMED by execution** | Every combat session, the moment a driver wires one | A level-61 fighter reaches `computeAccrual` at **level 0, unarmed, with an empty bag** — so auto-eat can never fire despite `autoEatEnabled: true`, and a level gate answers `STOP_REASON.LEVEL`, which `settleCombatSession` reads as *the pointer ended* and closes the batch. In SHADOW nothing is paid, so no player value moves; the 48 h per-field read is **all zeros**, i.e. unreadable for the second time. **Armed**, it is a catastrophic under-pay **and** a proposed `delta.activity = {kind:'idle'}` that would end a real player's fight. | **P0 for the ARM** | Rebase onto `lane/world-tick-m1f` and hydrate through `engineInputsFromEnvelope` / `engineStateOf` from `hr-accrue/envelope.js` |

The authority is the projection's own source, not a reading of it:
`2026-09-14-hr-state-of-restatement.sql:818` (`c_top`) lists `skills`, `inventory`,
`equipment`, `enchant`, `buffs`, `version`, `traits`, `unlocked_recipes` **beside** `state`;
`:819` (`c_state`) lists `accrued_to`, `hp`, `max_hp`, `gold`, `fight`, `consec_falls`,
`recovering_until`, `auto_eat_*`, `deaths_today`, `deaths_lifetime`, `combat_style`,
`hearthfind_ready`, `tool_carry` — and **none** of the five projections.

Executed against a realistic envelope of that shape:

```
(A) sessionFromRoster(row, env.state)   <- the only existing driver convention (tick.js:490)
      accruedToText : 2026-03-14T20:00:00.123456+00:00      <- the label is RIGHT
      skills        : {}          inventory : {}
      equipment     : {}          enchant   : {}      buffs : undefined
(B) sessionFromRoster(row, env)         <- the other level
      THREW: rosterWatermarkText: no server rendering of the watermark … the envelope
             renders "undefined"                            <- the label fails CLOSED
(C) what the engine actually wants (envelope.js engineInputsFromEnvelope)
      skills        : {"attack":500000,"hp":400000}         <- raw xp NUMBERS
```

So (A) is silently wrong and (B) is loudly wrong, and there is no third argument. (C) is the
third defect inside the first: even at the right level the projection is
`{skill_id: {xp, level}}` and the engine takes raw xp — `engineInputsFromEnvelope` unwraps
`.xp`, `sessionFromRoster` does not, so correcting the level alone would hand the engine
objects where it expects numbers.

Two inputs are wrong on **either** level and are part of the same class: `bestiaryKills`
(`st.bestiary_kills`) comes from `hr_bestiary_of`, a **separate read** `index.ts:637` makes and
this driver does not — it is `undefined` always, so bestiary and charm bonuses price at zero —
and `perks` likewise (`hr_perks_of`). M1f names both as owed-and-under-paying; this head
sources them from an envelope that cannot carry them and says nothing.

**Would an existing guard have caught it? No, and the reason is the guard's own fixture.**
`world-tick-combat-parity.mjs:1225` builds its `env` as a **flat** object with
`hp, max_hp, gold, skills: {}, inventory: {}, equipment: {}, …, enchant: {}` all at one level —
it bakes the two-level confusion in as the contract **and** pins the three projections to `{}`,
so the defect is invisible by construction. C1 is structural but it derives the key set of
`tick-shadow.js`'s input object from `index.ts`, which says nothing about where
`sessionFromRoster` **read** those keys from. The guard that does see it is M1f's
`tests/world-tick-hydration.mjs`, which boots the real chain.

**Recommended fix, and it is the dependency's:** merge `lane/world-tick-m1f` into this lane,
replace `sessionFromRoster`'s state block with `engineInputsFromEnvelope(env, nowMs)` +
`ENGINE_STATE_KEYS`, keep `rosterWatermarkText` (which is right and which M1f does not have),
and re-point C9's fixture at a **two-level** envelope so the guard stops agreeing with the
defect. Then re-run this battery and re-measure the pack hash.

**Carried forward as an ARM condition, not a finding:** `tick.js` builds its roster row itself
and does **not** set `mark_text` (`tick.js:490`, `accrued_to: new Date(markMs).toISOString()`).
A combat driver must thread `mark_text: probe.markText` onto the row, or every displaced shadow
window is refused by `rosterWatermarkText` — fail-closed, so it costs windows rather than
correctness, but it would read as "combat settles nothing".

**Residual on the re-render, for whenever the ARM is proposed.** `pgTimestamptzText` is
millisecond-precision and is exact **in shadow**: the fence writes
`shadow_accrued_to = p_window_to` verbatim, with no clamp
(`2026-09-21-world-tick-settle-fence.sql:474`). `hr_apply` is different — it clamps
`v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued))`
(`2026-09-14-hr-apply-restatement.sql:2288`) — so an **armed** window whose proposal races
`now()` would be stamped with microseconds a JS re-render cannot reproduce. Narrow, and exactly
the case window 1's verbatim-string rule exists for; the armed driver should take the label from
the fence's returned rendering rather than re-render it.

---

## Guards run — real exit codes

Every number is an exit code I observed in this worktree, not an expectation.

| Guard | Exit |
|---|---|
| `tests/sec-world-tick-m3-seed-label.mjs` | **0** — green, 2 arms |
| `tests/sec-world-tick-m3-seed-label.mjs --mutate` | **0** — 2 of 2 arms RED with the defect back |
| `tests/world-tick-combat-parity.mjs` | **0** |
| `tests/world-tick-combat-parity.mjs --mutate --<name>` × 13 | **0** each — `noAutoEat`, `noDeathCounters`, `shiftWindow`, `wallclock`, `freeHeal`, `skipFoodDebit`, `relabelSeed`, `nofight`, `progressNoFold`, `hearthfindArray`, `restedNow`, `attendedThrough`, `fixedSeed`, every one "RED, as required" |
| `tests/world-tick-parity.mjs` | **0** |
| `tests/world-tick-parity.mjs --mutate` | **0** |
| `tests/world-tick-double-pay.mjs` | **0** |
| `tests/world-tick-shadow-chain.mjs` | **0** |
| `tests/world-tick-writer-authz.mjs` | **0** |
| `tests/world-tick-edge-contract.mjs` | **0** |
| `tests/edge-tick-gate.mjs` | **0** |
| `tests/delta-transport.mjs` | **0** |
| `tests/schema-drift.mjs` | **0** — rebuilds to `5933a496b2a2…` |
| `tests/apply-order-honesty.mjs` | **0** — 30 files carry a measured verdict |
| `tests/guard-hygiene.mjs` | **0** — no orphans, no ghosts, no vacuous proofs |
| `tools/pack-edge.mjs hr-accrue --check` | **0** — 75 files, `9f9ec411…` |
| `tools/pack-edge.mjs hr-accrue --hash` | **0** — `9f9ec411bfefe428056df54b0cb9947fe683bfe5254096790f8d09ed997138f3` |
| `tools/lane-done.mjs` | **0** — `lane-done: all green.` |

`tests/guards-unregistered.json` no longer carries the M3 entry and
`tests/sec-world-tick-m3-seed-label.mjs` is registered in `.github/workflows/smoke.yml:1004-1005`
with both arms. `guard-hygiene` green with the entry **gone** is the exit code for that.

---

## Coordinator runbook

### Order

0. **`lane/world-tick-m1f` merges first**, and M3 merges it into itself and re-runs this
   battery (CLAUDE.md §3.3 — the Coordinator does not hand-resolve the `tick-shadow.js`
   conflict). The migration below does **not** wait for it.

### The apply — `2026-09-22-world-tick-combat-channel.sql`

1. **Pre-flight, read-only (S-5).**
   ```sql
   select channels,
          array_position(channels, null) as has_null_element,   -- must be NULL
          enabled, shadow
     from public.hr_tick_config where id;
   -- Expect: channels = {gather}, has_null_element NULL, enabled false, shadow true.

   select pg_size_pretty(pg_total_relation_size('public.hr_tick_shadow')) as size,
          count(*) as rows
     from public.hr_tick_shadow;   -- sizes the S-4 rewrite window
   ```
   If `has_null_element` is **not** NULL, STOP and clean the array first.

2. **Pause the tick for the apply (S-4).** The eight `GENERATED ALWAYS … STORED` columns
   rewrite `hr_tick_shadow` under `ACCESS EXCLUSIVE` while the gather shadow inserts every 90 s.
   ```sql
   -- wait for the lease to drain
   select user_id, slot, channel, owned, lease_until, lease_until <= now() as drained
     from public.hr_tick_ownership order by lease_until desc;
   update public.hr_tick_config set enabled = false where id;
   ```

3. **Apply**, one file, Coordinator only, never inside `begin/commit`, never 00:00–00:10 UTC:
   ```bash
   node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-combat-channel.sql
   ```
   Expect `world-tick-combat-channel self-check PASSED (c1-c8); probe rows rolled back`.

4. **Re-enable.**
   ```sql
   update public.hr_tick_config set enabled = true where id;
   ```

5. **Post-apply:** read-only verification agent → `live-hash-drift --live --write` + whys →
   apply-order note flipped to APPLIED → `restore-census` (no new tables; the columns are new).

### The edge deploy — AFTER the M1f rebase, and before any push

```bash
node tools/pack-edge.mjs hr-accrue --hash          # re-measure; it is NOT 9f9ec411 on a rebase
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
  --project-ref nezapsylztqbbwuwembx
```
Then verify the live `payload_sha256` equals the hash from the **first** line above.

### Do NOT arm combat

The arm SQL, the `hr_kill_credit_log` arm fence and the per-field parity queries from the
2026-09-22 runbook are unchanged and still stand — including the cohort of **one**, chosen for
a **non-attended** combat pointer, inserted `owned = false` so the roster hands it out under a
lease. They are not restated here because nothing about them moved and a second copy is a second
thing to drift. `hr_tick_config.enabled` stays governed by the apply runbook above and `shadow`
stays **true**; arming remains an operator UPDATE with its own Security GO, which this document
does not grant.

**What satisfies the ARM block:** (1) the M1f rebase, with `sessionFromRoster` hydrating through
`engineInputsFromEnvelope`; (2) C9's `env` fixture re-pointed at a **two-level** envelope with
non-empty `skills` / `inventory` / `equipment`, so the guard can go red on S-7; (3) the combat
driver threading `mark_text`; (4) this battery re-run green at the rebased head; (5) the §16.6
attended fence, still open and still correctly a hard ARM blocker.

**Residual risks I am accepting with the migration GO-WITH-CHANGES and the edge GO:** S-4 is an
operational hazard mitigated by a runbook and not by code; S-5 remains unverifiable without
production and is covered by one `select`; the attended top-up remains unpriced; `perks` and
`bestiaryKills` remain under-paying inputs that no driver reads yet; and the microsecond
re-render residual above is scoped to the armed path, which is blocked.
