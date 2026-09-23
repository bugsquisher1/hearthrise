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
   set channels = array(select distinct unnest(channels || 'combat'::text))
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
select k.user_id, k.slot, max(k.created_at) as newest_credit, ps.accrued_to
  from public.hr_kill_credit_log k
  join public.player_state ps using (user_id, slot)
 where k.user_id = '<uuid>'
 group by 1, 2, ps.accrued_to;
-- Require newest_credit < accrued_to - ATTENDED_EDGE_SLACK_MS, else pick another character.
```

`hr_tick_config.enabled` stays **false** and `shadow` stays **true** throughout. Arming is an operator
UPDATE with its own Security GO; this document does not grant it.

### Parity queries, per field

> **SUPERSEDED 2026-09-23 by RE-VERIFY 3 step 10 below — and CORRECTED IN PLACE.**
> These three queries shipped with the S-10 spelling (`meta->'meta'`, which answers
> one NULL bucket), with `max(k.at)` (which raises `column k.at does not exist`),
> with an uncast `channels || 'combat'` in the arm UPDATE above (which raises
> `malformed array literal`), and with a `deaths` sum over a delta array that is
> never present. The spellings are fixed here so nothing in this file is a query
> that answers wrongly when pasted — `tests/world-tick-ledger-meta.mjs` L-8
> executes every statement in this document — but the **span-fenced** reads in
> step 10 are the ones to run: a naive 48 h sum is not comparable at all (see
> "The gather parity caveat").

```sql
-- (1) THE PARTITION. Compare ONLY the attended=false bucket (§16.6).
--     `meta ? 'att'`, at the TOP: corrected 2026-09-23 (S-10).
select date_trunc('hour', at) h, (meta ? 'att') attended,
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
         sum((meta->>'kills')::bigint)                 kills,
         sum((meta->>'ate')::bigint)                   ate
    from public.player_ledger
   where kind = 'combat' and intent = 'accrue'
     and at > now() - interval '48 hours'
     and not (meta ? 'att')
   group by 1),
-- DEATHS ARE THEIR OWN ROWS (corrected 2026-09-23, S-10). The old spelling
-- summed jsonb_array_length(meta->'delta'->'deaths'), a key hr_apply never
-- writes, so it answered 0 for every death — a zero that reads as a defect.
died as (
  select date_trunc('hour', at) h, count(*) deaths
    from public.player_ledger
   where kind = 'combat' and intent = 'death'
     and at > now() - interval '48 hours'
   group by 1)
select coalesce(t.h, p.h) h,
       t.gold, p.gold, round(100.0*(t.gold - p.gold)/nullif(p.gold,0), 2) gold_pct,
       t.kills, p.kills, t.ate, p.ate, t.deaths, d.deaths paid_deaths
  from tick t full join paid p using (h) left join died d on d.h = coalesce(t.h, p.h)
 order by 1;

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

---

# RE-VERIFY 2 — 2026-09-23

**Reviewer:** security-engineer (veto authority)
**Under review:** `lane/world-tick-m3` @ `16965c96` — the lane merged `lane/world-tick-m1f`
(`72f4df7`) and `next` (`efe3544`, b551), then landed `034db5f5` (S-7), `fcc764b9` (M1f F3)
and `16965c96` (M1f F4).
**Branch:** `sec/world-tick-m3-3`, cut from that head. `npm install --no-audit --no-fund`.
**Note on this file:** the `RE-VERIFY — 2026-09-23` section above was written on
`sec/world-tick-m3-2` and the lane never merged it, so it is carried here verbatim —
S-7 is defined in it and a reader of the lane's copy could not find it otherwise.

## Verdicts

```
S-7: CLOSED
M1f F3/F4: CLOSED
MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES
EDGE DEPLOY (combat inputs, from the SET after merge): GO
COMBAT SHADOW ARM: BLOCK
```

**S-7: CLOSED**

**M1f F3/F4: CLOSED**

**MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES** — the file is
**byte-identical** to the head I ruled on yesterday (`git diff 0ab94c17 16965c96` on the
path is empty, exit 0). The "changes" are unchanged and are conditions on the **apply**,
not on the file: the S-5 pre-flight `select` must be read first, and the tick must be
paused for the S-4 `ACCESS EXCLUSIVE` rewrite. A plain GO would say the file may be
applied with neither. It may not.

**EDGE DEPLOY (combat inputs, from the SET after merge): GO** — and the words "from the
SET after merge" are load-bearing, not a formality. `pack-edge --check` at the lane head
is exit **0**, 75 files, 45 vendored, payload
`43566438932b64b58140e2194099deb8bdacca960a98b8137271178fd17df91e`, and I packed it to a
scratch directory and listed it: **no file under `services/`**, so `combat.js` still is
not deployed by this and S-7's fix does not move the hash. But that hash **must not be
deployed** — see S-9. `origin/next` is **23 commits ahead** of this head and carries M7,
whose two migrations are already **APPLIED on production** (`2026-09-22-trophy-claim.sql`
at 00:41:24 UTC) and whose `trophy-claim.js` is in the **live** edge
(`0d11badd…`, deployed 01:29:50Z). The lane head's payload does not contain that file.
The GO is for the payload measured on the assembled set **after** the merge, verified
against its own freshly-measured hash.

**COMBAT SHADOW ARM: BLOCK** — no longer on S-7, which is closed and closed well. On
**S-8**: there is no combat driver, so the arm cannot produce a measurement, and on
**S-10**: the instrument that would read it does not resolve. The §16.6 attended fence
remains a separate hard blocker for `shadow = false`, unchanged and correctly so.

---

## S-7 — CLOSED, with the proof I ran myself

I did not take the lane's guards as the evidence. I wrote an independent probe
(level-61 fighter, armed, fed, auto-eat on, mid-fight, 6 deaths today / 60 lifetime,
enchanted weapon, chosen style, a real `recovering_until`) through **the repo's own
PGlite chain replay**, projected it with the real `hr_state_of`, and compared
`services/world-tick/combat.js`'s session against the accrue path's input key by key.
Exit **0**, every arm:

```
envelope: 26 top-level keys, state = 36 columns
  ok  tick combat session == accrue path input across all 25 engine inputs
  ok  the fighter arrives at attack xp 302288 (raw number, not {xp,level})
  ok  armed ({"weapon":"mithril_sword"}) and fed ({"bones":2,"cooked_trout":40})
  ok  auto-eat trio reaches the engine: true/cooked_trout/70
  ok  death anchors reach the engine: 6/60
  ok  and the two sessions price the same 10-minute window identically
  ok  the level gate does NOT stop the fighter: ticks=250 kills=173 stoppedBy=null
  ok  and no delta.activity = idle is proposed (null)
  ok  auto-eat FIRES and the debit is signed: meals=6, food delta=-6
  ok  every one of the 20 envelope-owned inputs LOSES its value when its source swaps level
  ok  and the four pointer keys come from the ROSTER ROW, not the envelope (the fence mark, §15c)
  ok  and no arm is vacuous (probe value == absent answer for: none)
  ·   S-7 restored -> attack=null ticks=14 kills=0 activity=null
```

| Claim | Ruling | The executing proof |
|---|---|---|
| No field list left in `combat.js` / `tick-shadow.js` | **CLOSED** | `combat.js` has one `...engineInputsFromEnvelope(env, …)` spread and names exactly two keys beyond it (`perks`, `bestiaryKills`) — declared as the **separate reads** `hr_perks_of` / `hr_bestiary_of` that no driver makes yet, taken **from the roster row**, not from an envelope that cannot carry them. That is the honest spelling of the under-pay; yesterday they read `st.perks` / `st.bestiary_kills` and *looked* sourced. `tick-shadow.js` forwards `...engineStateOf(char)`. Grep for a state-ish read in either file returns comments and the watermark only. |
| The tick's combat session **equals** the accrue path's for the same character, from a REAL envelope | **CLOSED** | Line 1 of the probe above: all **25** `ENGINE_INPUT_KEYS` equal, and the two sessions hand `computeAccrual` byte-identical `delta` and `summary` over the same 10-minute window. The lane's own `H5d` says the same thing from the other direction (session vs. envelope-derived expectations). |
| A level-swap mutation **per field** goes red | **CLOSED** | 20 of 24 readable inputs lose their value under a per-key swap in my probe, with a non-vacuity arm proving no probe value equals its absent answer. The other four are `accruedToMs` / `activeSinceMs` / `activeKind` / `activeId`, which are **deliberately the roster row's** (`ENGINE_POINTER_KEYS`; the tick's watermark is the fence's mark, §15c) — they *cannot* move on an envelope swap, and I assert them against the row instead rather than counting them as coverage. `world-tick-hydration --mutate` exit **0**: restoring `sessionFromRoster(row, env.state)` turns **11 arms** red, `H5b`/`H5d` among them, and prints the whole loss (`skills {}`, `equipment {}`, `autoEatEnabled false`, `deathsTodayBefore 0`, …). |
| C9's fixture no longer agrees with the defect | **CLOSED** | `world-tick-combat-parity.mjs:1417` now *requires* `sessionFromRoster(row, env.state)` to **throw**; the fixture is two-level with non-empty `skills`/`inventory`/`equipment`. Yesterday it was flat and the defect was invisible by construction. Exit **0**, and all **17** mutants RED-as-required (run one at a time; exit codes below). |

**The measurement that matters, and it is mine:** with S-7 restored the same character
settles **14 ticks / 0 kills** where the fixed path settles **250 / 173**. The prior
review predicted `STOP_REASON.LEVEL` → `delta.activity = {kind:'idle'}`; against a
**goblin** (no level requirement) that specific consequence does not fire — the pointer
survives and the character merely fights at level 0 and kills nothing. The under-pay is
the same size either way; the idle proposal is monster-dependent and I am correcting my
own prior wording rather than letting it stand as general.

---

## M1f F3/F4 — CLOSED

| # | Ruling | The executing proof |
|---|---|---|
| **F3** pin the LEVEL of every non-gather field against a real `hr_state_of` envelope | **CLOSED** | `H5a` declares a source **and** a level for all 25 inputs and checks the declaration three ways: against `hr_state_of`'s own `c_top`/`c_state` lists, against a **real** envelope, and for name ambiguity across levels (none). I asked the one adversarial question that could make this a restatement — *is the contract list hand-typed?* — and it is not: `tests/no-client-copy-of-projection.baseline.json` is re-pinned by `--write --execute`, which replays the chain and reads a probe character's envelope, and `2026-09-14-hr-state-of-restatement.sql` §3(d) asserts by execution that the envelope carries **exactly** those 26 top + 36 state keys. My own probe measured 26/36 independently. The `ammo_carry` exemption is declared `notYetMigrated` with its reason, not skipped. |
| **F4** the nine combat inputs must be load-bearing in a guard | **CLOSED** | `C16` drops each of the nine (plus `buffs`) from a purpose-built `goblin_warlord` session and **requires the settled window to move**; a byte-identical answer names the blind key and goes red. The plain CI run carries this arm, so the sensitivity is gated and not only proved by hand. `hearthfindReady` is the one exemption — a 1-in-14,940..24,860 roll per kill cannot be drawn in ten minutes and a seed pinned for a lucky find would be a worse guard than none — and it is **not** a quiet weakening: its gate is pinned from `accrual.js` source (`delta.hearthfind` assigned behind `inp.hearthfindReady &&` at **every** emit site), and a staleness arm turns the exemption red the day a fixture *does* move it. `H5d` names the nine and proves `combat.js` carries all nine off a real envelope. F4's own by-product is worth recording: the guard's `accrueInput` was a **third** hand-written key list and had already drifted by two keys (`buffs`, `toolCarry`); it is `...engineStateOf(c)` now and a drift arm compares it to the tick's declared set. |

**Auto-eat fires; the level gate does not stop the fighter** — both measured in my probe
above (`meals=6`, signed debit `-6`; `ticks=250 kills=173 stoppedBy=null`, no idle).

---

## S-8 (NEW) — the arm has no driver, so it cannot produce a measurement

| # | Surface | Claim | Status | Trigger | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|---|
| **S-8** | `supabase/functions/hr-accrue/tick.js` + `hr_tick_roster` | **Nothing in the edge settles combat.** `tick.js` imports `CHANNEL` from `tick-gather.js` (`= 'gather'`) and passes it as `p_channel` to the fence; `settleCombatSession` has **no production caller** — its only callers are three test files, and `services/` is not in the edge payload. Adding `'combat'` to `hr_tick_config.channels` makes `hr_tick_roster(v_cfg.channels, …, v_holder, v_cfg.lease_ms, …)` hand out combat characters **under a stamped lease**; `probeWatermark` then fences them with `p_channel = 'gather'`, `hr_tick_settle` refuses at `v_st.active_kind is distinct from p_channel` (`channel_moved`, fence `:416`), and `tickOne` returns `skipped/channel_moved` at `tick.js:460`. | **CONFIRMED by source, both halves traced** | The arm UPDATE itself | **Zero `hr_tick_shadow` combat rows** — the 48 h per-field read is empty, i.e. unreadable for the third consecutive milestone — and each leased combat character consumes one of `batch_limit` slots per fire, which is taken **from the running gather cohort**. Nothing is paid (shadow) and no player value moves. | **P0 for the ARM** (harmless to players, fatal to the measurement) | Land the combat driver: dispatch on `st.active_kind` to `settleCombatSession`, ship `combat.js` in the payload (it is `services/`-resident today and `pack-edge` excludes it), and thread `mark_text: probe.markText` onto the roster row — `tick.js:490` still does **not** set it (verified), so `rosterWatermarkText` would refuse every displaced shadow window. Fail-closed, so it costs windows rather than correctness, but it reads as "combat settles nothing" and is indistinguishable from this finding. |

This is the honest state: **S-7 was the last defect in the combat settler; S-8 is that the
settler is not wired.** The two are not the same blocker and I am not re-using yesterday's
one.

## S-9 (NEW, P1 operational) — the lane head's edge payload would delete a live intent

| # | Surface | Claim | Status | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|
| **S-9** | the edge payload at `16965c96` | `origin/next` is **23 commits ahead** of this head. M7 landed `supabase/functions/hr-accrue/trophy-claim.js` and its two migrations are **APPLIED on production** (`2026-09-22-state-of-trophy-prefix.sql` 00:40:44 UTC, `2026-09-22-trophy-claim.sql` 00:41:24 UTC), with the live edge re-seeded at `0d11badd…`. The lane head's 75-file payload **does not contain `trophy-claim.js`**. | **CONFIRMED** (`git ls-tree`, the apply-order verdicts, the `9a3aaba` live-hash note) | Deploying `4356…` verbatim removes a live intent whose server RPC is already applied: every trophy claim from a live client fails, against a schema that says it should work | **P1** | Merge `origin/next` into the lane, re-measure, deploy **that** hash. The merge is clean on code: a trial merge auto-merges `smoke.yml`, `accrual.js`, `index.ts`, `tick-shadow.js` and `ci-shape.baseline.json`, and conflicts on exactly **two** files — `tests/schema-apply-order.json` and `tests/schema-drift.baseline.json` — which CLAUDE.md §5 says are regenerated by their own tools and never hand-merged. So this goes back to the lane per §3.3, and it is a regeneration, not a hand-resolve. |

## S-6b — §16.10 names a stale pack hash, for the third time

`WORLD_TICK_DESIGN.md:2011` still names `9f9ec411…` as the post-change hash; the lane head
is `4356…` and the set will be a fourth value. This is the same finding I filed as S-6 and
closed twice. **Kill the class, not the bug** (CLAUDE.md §3.2): §16.10 should stop naming a
literal and instead instruct the operator to run `pack-edge --hash` at the SHA being
deployed and verify `payload_sha256` against that. **P3, doc.**

## S-10 (NEW, P1) — the parity queries read a level of `player_ledger.meta` that does not exist

| # | Surface | Claim | Status | Trigger | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|---|
| **S-10** | `WORLD_TICK_DESIGN.md` §16.6, and the parity queries in **my own** 2026-09-22 runbook above | `hr_apply` writes the ledger row as `jsonb_build_object('delta', v_meta) \|\| coalesce(v_j->'meta','{}')` — the journal's meta keys are merged at the **TOP** of `player_ledger.meta`, **not** nested under `meta->'meta'`. Every query that spells the attended partition `(meta->'meta' ? 'att')` therefore evaluates to **NULL**, so `group by` collapses to one bucket and `where … and not (meta->'meta' ? 'att')` returns **NO ROWS AT ALL**. `meta->'meta'->>'kills'` and `->>'ate'` are NULL likewise, and `jsonb_array_length(meta->'delta'->'deaths')` is always 0 — `deaths` is not in the delta summary (`g`,`m`,`i`,`x`,`e`,`bs`,`k`); `hr_apply` writes one **separate** `intent = 'death'` ledger row per death. | **CONFIRMED by execution** | Every run of the parity read | The attended partition §16.6 calls the thing that keeps the read honest **silently does not partition**, and the read it guards returns either zero rows or one unpartitioned bucket. This is §16.3's own failure shape — a measurement that reads as a defect — planted in the instrument. | **P1** | The spellings are `meta ? 'att'`, `meta->>'kills'`, `meta->>'ate'`, `meta->>'capped'`, `meta->>'ms'`, `meta->'delta'->>'g'`, `meta->'delta'->'x'`, `meta->'delta'->'i'`; deaths are counted as `intent = 'death'` rows. §16.6's query needs the same correction. Step 10 below is written in the corrected spelling. |

Proved against the real `hr_apply` through the chain replay, both directions:

```
unattended:      meta = {"ms":10800000,"ate":8,"delta":{"g":500,"i":{...},"k":["accrued_to"],
                         "x":{...}},"kills":31,"ticks":300,"capped":false}
  meta ? 'att'            -> false        <- the TOP spelling, correct
  (meta->'meta' ? 'att')  -> null         <- the RUNBOOK's spelling
  meta->>'kills' -> 31    meta->'meta'->>'kills' -> null
attended+capped: meta ? 'att' -> true ;  (meta->'meta' ? 'att') -> null
```

This is mine to own: I wrote those queries yesterday and signed them. They were never
executed against a real ledger row, which is exactly the standard I hold other people's
claims to. Two further spelling errors in the same block, found the same way and corrected
in step 10: `hr_tick_config` has **`flush_seconds`**, not `flush_ms`, and
`hr_kill_credit_log` has **`created_at`**, not `at` — the §16.6 arm-fence query as written
would have failed with `column k.at does not exist`.

**One consequence worth stating for the band, not just for the spelling:** `meta->>'ms'` is
the engine's own `grantMs`, which on an uncapped row makes the paid span exactly
`[at - ms, at)`. That is a better span fence than anything derived from `accrued_to`, which
the ledger's delta summary does not carry at all (`k` lists the key, never its value).

## S-11 (NEW, P2, process) — `lane-done` is RED at this head, and it is not this lane's

| # | Surface | Claim | Status | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|
| **S-11** | `tools/lane-done.mjs` at `16965c96` | Exit **1**: `comment-ratio-ratchet` (6 counts rose — `src/net/accrue.js` 3490 vs 3452, `src/net/gold.js` 729 vs 697, three smoke files) and `test-file-ratchet` (`TF-1  CODE lines per registered test ROSE 33.32 → 33.70`, ceiling 33.65). CLAUDE.md §4 makes that "not done". | **CONFIRMED**, and **attributed by execution** | A lane that cannot land under the rule as written, for debt it did not write | **P2** | Paid down on the set, by the lanes that wrote it — not by M3 |

Attribution, measured rather than assumed: the three M3 commits touch only
`services/world-tick/combat.js`, its fixture and two `tests/*.mjs`, and **no file either
ratchet names**. Both ratchets are exit **0** at `72f4df7` (m1f merged) and exit **1** at
`6e544c9` — the b551 set tip that `efe3544` merged — with **byte-identical numbers** to
the lane head, and both baseline files are byte-identical at all four SHAs. So this is
**inherited from the set, not emergent at the merge and not M3's**: it is already red on
b551, which shipped. §4's "paydown happens where the code is written, once — never by a
second lane after the merge" points at `src/net/accrue.js` (last touched by
`lane/hr-flags-token`, `4f50dce`) and `src/net/gold.js`, neither of which is M3's or M1f's.
**I am not accepting a re-pin of either baseline as the fix** — that is loosening a guard to
get green (CLAUDE.md §2) — and I am equally not holding S-7's fix behind someone else's
comment lines. The Coordinator's call; my verdicts above are made on the guards that
measure *this* change, and this one is named so it cannot be read as green.

---

## Guards run — real exit codes

Every number is an exit code I observed in this worktree, not an expectation.

| Guard | Exit |
|---|---|
| `tests/sec-world-tick-m3-seed-label.mjs` | **0** — green, 2 arms |
| `tests/sec-world-tick-m3-seed-label.mjs --mutate` | **0** — 2 of 2 arms RED with the defect back |
| `tests/world-tick-combat-parity.mjs` | **0** |
| `tests/world-tick-combat-parity.mjs --mutate --<name>` × **17** | **0** each — `noAutoEat`, `noDeathCounters`, `noEnchant`, `noCombatStyle`, `noBuffs`, `noCombatXpMark`, `shiftWindow`, `wallclock`, `freeHeal`, `skipFoodDebit`, `relabelSeed`, `nofight`, `progressNoFold`, `hearthfindArray`, `restedNow`, `attendedThrough`, `fixedSeed` — every one "RED, as required" |
| `tests/world-tick-hydration.mjs` | **0** — H5a/H5b/H5c/H5d all green |
| `tests/world-tick-hydration.mjs --mutate` | **0** — 11 arms red, H5b and H5d among them |
| `tests/world-tick-parity.mjs` | **0** |
| `tests/world-tick-parity.mjs --mutate` | **0** |
| `tests/world-tick-double-pay.mjs` | **0** |
| `tests/world-tick-shadow-chain.mjs` | **0** |
| `tests/world-tick-writer-authz.mjs` | **0** |
| `tests/world-tick-edge-contract.mjs` | **0** |
| `tests/world-tick-edge-contract.mjs --selftest` | **0** — 6 planted cases behaved as named |
| `tests/edge-tick-gate.mjs` | **0** |
| `tests/delta-transport.mjs` | **0** |
| `tests/accrual-engine.mjs` | **0** |
| `tests/schema-drift.mjs` | **0** |
| `tests/apply-order-honesty.mjs` | **0** — 28 files carry a measured verdict, all evidenced-live |
| `tests/guard-hygiene.mjs` | **0** — no orphans, no ghosts, no stale entries, no vacuous proofs |
| `tools/pack-edge.mjs hr-accrue --check` | **0** — 75 files (45 vendored), 1716.1 KB |
| `tools/pack-edge.mjs hr-accrue --hash` | **0** → `43566438932b64b58140e2194099deb8bdacca960a98b8137271178fd17df91e` (the LANE head's; not the one to deploy — S-9) |
| `tools/lane-done.mjs` | **1 — RED**, `2 guard(s) red — the lane is not done.` (S-11: inherited, not this lane's) |
| Security's own PGlite probe (above) | **0** |

All three world-tick guards are registered in `.github/workflows/smoke.yml`
(`:984`, `:1004`, `:1096`) and `tests/guards-unregistered.json` carries no M3 entry —
`guard-hygiene` green with it gone is the exit code for that.

**One residual on the battery itself, named rather than left silent:** CI registers
`world-tick-combat-parity --mutate` with **no arm**, so it runs the default (`noAutoEat`)
and the other sixteen are proved by hand — today, by me. `C16`'s differential arm is in
the plain run and covers the ten inputs those arms depend on, so the exposure is bounded
to an arm going vacuous for some other reason between reviews. Worth a `--mutate --all`
driver; not a blocker.

---

## Coordinator runbook — the combat shadow, end to end

Steps 1–6 are ready now. Step 7 is where the **BLOCK** sits, and 8–10 are written so they
are ready the day S-8 is closed, not so they may be run today.

### 1. Pre-flight, read-only (S-5)

```sql
select channels,
       array_position(channels, null) as has_null_element,   -- must be NULL
       enabled, shadow, batch_limit, lease_ms, cadence_seconds, flush_seconds
  from public.hr_tick_config where id;
-- Expect: channels = {gather}, has_null_element NULL, enabled true, shadow true.

select pg_size_pretty(pg_total_relation_size('public.hr_tick_shadow')) as size,
       count(*) as rows
  from public.hr_tick_shadow;   -- sizes the S-4 rewrite window
```

If `has_null_element` is **not** NULL, **STOP** and clean the array before applying — the
CHECK validates a NULL element (the predicate is NULL, which passes) and the tick cannot
settle it.

### 2. Pause the tick for the apply (S-4)

The eight `GENERATED ALWAYS … STORED` columns rewrite `hr_tick_shadow` under
`ACCESS EXCLUSIVE` while the gather shadow inserts every 90 s. Drain the lease **first**;
do not race it.

```sql
update public.hr_tick_config set enabled = false where id;   -- stop new fires
-- then WAIT for the in-flight lease to drain:
select user_id, slot, channel, owned, lease_until,
       lease_until <= now() as drained
  from public.hr_tick_ownership order by lease_until desc;
-- proceed only when every row reads drained = true
```

### 3. Apply — one file, Coordinator only

Never inside `begin/commit`, never 00:00–00:10 UTC (CLAUDE.md §2).

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-combat-channel.sql
```

Expect `world-tick-combat-channel self-check PASSED (c1-c8); probe rows rolled back`.

### 4. Resume

```sql
update public.hr_tick_config set enabled = true where id;
```

The migration **arms nothing** (`c3`): `channels` is still `{gather}` and the gather cohort
resumes untouched.

### 5. Post-apply

Read-only verification agent → `live-hash-drift --live --write` + whys → the apply-order
note flipped to **APPLIED** → `restore-census` (no new tables; the columns are new).

### 6. Edge deploy — from the SET, after the merge, and before any push

```bash
node tools/pack-edge.mjs hr-accrue --hash          # measure HERE; it is NOT 4356…
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
  --project-ref nezapsylztqbbwuwembx
```

Verify the live `payload_sha256` equals the hash from the **first** line. Do not verify
against `9f9ec411…` (§16.10, stale — S-6b), against `4356…` (the lane head — S-9), or
against `0d11badd…` (what is live now). Confirm the packed directory contains
`trophy-claim.js`; if it does not, the merge did not happen and the deploy would remove a
live intent.

### 7. ⛔ DO NOT ARM. The BLOCK is here.

`hr_tick_config.channels` stays `{gather}` and `shadow` stays **true** until S-8 is closed.
Everything below is written for that day and is not authorised by this document.

### 8. Choose the cohort — ONE character, read-only

A single character with a **non-attended** combat pointer, behind the flush, and **not** the
gather cohort. Read-only; it writes nothing.

```sql
-- CANDIDATES for the combat shadow cohort. Read-only.
with cfg as (select flush_seconds, lease_ms from public.hr_tick_config where id)
select ps.user_id, ps.slot, ps.active_id,
       ps.accrued_to,
       floor(extract(epoch from (now() - ps.accrued_to)) * 1000)::bigint as behind_ms,
       (select max(k.created_at) from public.hr_kill_credit_log k
         where k.user_id = ps.user_id and k.slot = ps.slot) as newest_kill_credit,
       exists (select 1 from public.hr_tick_ownership o
                where o.user_id = ps.user_id and o.slot = ps.slot) as already_rostered
  from public.player_state ps, cfg
 where ps.active_kind = 'combat'
   and ps.active_since is not null
   -- behind the flush line, or tickOne returns `below_flush` and never settles
   and ps.accrued_to < now() - (cfg.flush_seconds || ' seconds')::interval
 order by behind_ms desc;
```

Pick a row where `already_rostered = false` (never the gather cohort — one channel per
character, or the parity read cannot attribute a window) and where the **§16.6 arm fence**
holds:

```sql
-- THE ARM FENCE. Never arm a character with live kill credit near its watermark:
-- the accrue path's attended top-up is priced against the SPAN and would pollute
-- the read by exactly that amount.
select k.user_id, k.slot, max(k.created_at) as newest_credit, ps.accrued_to
  from public.hr_kill_credit_log k
  join public.player_state ps using (user_id, slot)
 where k.user_id = '<uuid>' and k.slot = <slot>
 group by 1, 2, ps.accrued_to;
-- REQUIRE newest_credit < accrued_to - ATTENDED_EDGE_SLACK_MS, else pick another.
```

### 9. The arm, in this order — ownership first, then the channel

Ownership **before** the channel, and `owned = false` on the insert: the roster must hand
the character out under its own lease rather than the row shipping pre-owned (the `c1b`
property). Reversing the two lets the roster see the channel with no cohort behind it.

```sql
-- (a) THE COHORT. owned = false, so the roster stamps the lease.
insert into public.hr_tick_ownership (user_id, slot, channel, owned)
values ('<uuid>', <slot>, 'combat', false)
on conflict (user_id, slot, channel) do update set owned = excluded.owned;

-- (b) THE CHANNEL. One row, id = true. Idempotent and order-stable.
update public.hr_tick_config
   set channels = array(select distinct unnest(channels || 'combat'::text))
 where id
   and not ('combat' = any (channels));

-- (c) READ IT BACK before walking away.
select channels, enabled, shadow from public.hr_tick_config where id;
-- Expect: channels = {combat,gather}, enabled true, shadow TRUE.
```

`shadow` stays **true** throughout. Setting it false is a separate operator action with its
own Security GO, which §16.6 blocks independently and this document does not grant.

### 10. The parity reads — 8a–8d, adapted to combat

Run at **T+1 h**, **T+24 h** and **T+48 h**. Read **8a first**: if it is zero, S-8 is back
and everything below is measuring nothing.

```sql
-- (8a) IS IT RUNNING AT ALL. hr_tick_cron_log says `posted` every fire even if
--      the edge refuses every character, so this is the first read, not the cron log.
select count(*) as shadow_rows, min(window_from) as first, max(window_to) as last
  from public.hr_tick_shadow
 where channel = 'combat' and window_to > now() - interval '1 hour';
--   EXPECT ~40 rows/hour at one character and a 90 s flush. ZERO = S-8. STOP.

-- (8b) DO THE WINDOWS TILE. An overlap double-counts in 8c; a gap means skipped time.
select count(*) as windows,
       count(*) filter (where prev is not null and window_from <> prev) as breaks
  from (select window_from, window_to,
               lag(window_to) over (partition by user_id, slot order by window_from) as prev
          from public.hr_tick_shadow where channel = 'combat') t;
--   EXPECT: breaks = 0. Also: rows per hour per character must not exceed 3600/90 = 40.

-- (8c) THE PER-FIELD PARITY SUM, SPAN-FENCED. A naive 48 h sum is NOT
--      comparable (see the caveat below). Each accrue row is paired with the
--      span it ACTUALLY paid — `meta->>'ms'` is the engine's own grantMs, and on
--      an UNCAPPED row that span is exactly [at - ms, at). Only uncapped,
--      unattended, fully-covered spans count.
--      NOTE THE SPELLING: the journal's meta is merged at the TOP of
--      player_ledger.meta, NOT under meta->'meta' (S-10, proved by execution).
with paid as (
  select l.user_id, l.slot, l.at,
         l.at - ((l.meta->>'ms')::bigint || ' milliseconds')::interval as span_from,
         l.at                                               as span_to,
         (l.meta->>'capped')::boolean                       as capped,
         (l.meta ? 'att')                                   as attended,
         (l.meta->'delta'->>'g')::bigint                    as gold,
         (l.meta->>'kills')::bigint                         as kills,
         (l.meta->>'ate')::bigint                           as ate,
         l.meta->'delta'->'x'                               as xp,
         l.meta->'delta'->'i'                               as items,
         (l.meta->'delta' ? 'i_n')                          as items_elided
    from public.player_ledger l
   where l.kind = 'combat' and l.intent = 'accrue'
     and l.at > now() - interval '48 hours'
     and l.meta ? 'ms'),
usable as (            -- THE FENCE: uncapped, unattended, itemisable
  select * from paid
   where capped is not true and attended = false and items_elided = false),
tick as (
  select u.user_id, u.slot, u.span_from, u.span_to,
         sum(s.would_gold)   as gold,   sum(s.would_kills)  as kills,
         sum(s.would_ate)    as ate,    sum(s.would_deaths) as deaths,
         sum(extract(epoch from (s.window_to - s.window_from))) as covered_s
    from usable u
    join public.hr_tick_shadow s
      on s.user_id = u.user_id and s.slot = u.slot and s.channel = 'combat'
     and s.window_from >= u.span_from and s.window_to <= u.span_to
   group by 1,2,3,4),
died as (              -- deaths are their OWN ledger rows, not a delta array
  select u.user_id, u.slot, u.span_from, u.span_to, count(d.id) as deaths
    from usable u
    left join public.player_ledger d
      on d.user_id = u.user_id and d.slot = u.slot
     and d.kind = 'combat' and d.intent = 'death'
     and d.at >= u.span_from and d.at < u.span_to
   group by 1,2,3,4)
select t.user_id, t.slot, t.span_from, t.span_to,
       round(100.0 * t.covered_s
             / nullif(extract(epoch from (t.span_to - t.span_from)),0), 1) as coverage_pct,
       t.gold as tick_gold, u.gold as paid_gold,
       round(100.0*(t.gold - u.gold) / nullif(u.gold,0), 2) as gold_pct,
       t.kills as tick_kills, u.kills as paid_kills,
       t.ate   as tick_ate,   u.ate   as paid_ate,
       t.deaths as tick_deaths, d.deaths as paid_deaths
  from tick t
  join usable u using (user_id, slot, span_from, span_to)
  join died   d using (user_id, slot, span_from, span_to)
 order by t.span_from;
--   DISCARD every row with coverage_pct < 99 — the tick did not settle that
--   whole span and the sum would price the gap, not the decomposition.

-- (8c-ii) LOOT VALUE AND XP, which is the whole question on a channel that mints.
with tick as (
  select key as k, sum(value::bigint) as qty
    from public.hr_tick_shadow s, jsonb_each_text(s.would_items)
   where s.channel = 'combat' and s.window_to > now() - interval '48 hours'
   group by 1),
paid as (
  select key as k, sum(value::bigint) as qty
    from public.player_ledger l, jsonb_each_text(l.meta->'delta'->'i')
   where l.kind = 'combat' and l.intent = 'accrue'
     and l.at > now() - interval '48 hours'
     and (l.meta->>'capped')::boolean is not true and not (l.meta ? 'att')
   group by 1)
select coalesce(t.k, p.k) as item, t.qty as tick_qty, p.qty as paid_qty
  from tick t full join paid p using (k) order by 1;
-- Same shape over would_xp vs meta->'delta'->'x' for the per-skill XP.
-- A rare item present in one set and ABSENT from the other is a DEFECT,
-- not variance, whatever the totals say. Rows where meta->'delta' carries
-- `i_n` instead of `i` had >24 item keys and were elided by hr_apply — they
-- are excluded above and must not be silently counted as zero.

-- (8d) THE REFUSAL HISTOGRAM, and the proof that shadow paid nothing.
select outcome, count(*), sum(rostered) from public.hr_tick_cron_log
 where at > now() - interval '48 hours' group by 1 order by 2 desc;
--   EXPECT `posted` dominant, ZERO `error`, ZERO `no_secret`. A wall of
--   `channel_moved` in the per-character outcomes is S-8.
select count(*) from public.player_ledger l
  join public.hr_tick_ownership o using (user_id, slot)
 where o.channel = 'combat' and l.meta->>'src' = 'tick';
--   EXPECT 0. Shadow pays nothing, and that is measured, not assumed.
```

**What number means parity holds, after 48 h — all five:**

1. **(8a)** ≥ 95 % of the expected shadow rows exist (`48 × 3600 / flush_seconds` per
   character — `flush_seconds`, not a remembered number; **1,920** at a 90 s flush). Under 90 % is a stall read as a defect, not noise.
2. **(8b)** `breaks = 0`, exactly. And ≤ 40 rows/hour/character.
3. **(8c) `ate`, `kills`, `deaths`, `hp`, `consec_falls`: EXACT.** These are not perturbed
   by a re-seed at the aggregate; anything other than 0 is an input or fold defect.
   `would_ate = 0` beside a non-zero `meta.ate` is the §16.4 auto-eat gap and means the nine
   inputs did not reach the engine.
4. **(8c) `gold`, `xp`, `items`: BAND, not equality — ±10 % per usable span, with no
   monotone drift.** A decomposition resamples the stream (§16.8), so digit-equality is
   gather's property and not this one. A consistent one-directional gap, or any rare-drop
   item in one set and not the other, is a defect. `would_recovering_until` must be a
   parseable ISO instant on every row where `would_deaths > 0`.
5. **(8d)** zero `error`, zero `no_secret`, and **zero** tick-sourced `player_ledger` rows
   for the cohort.

A field at **zero for two days is a P1 by definition** (CLAUDE.md §3.4).

### 11. The kill switch

Cheapest first; each is a single statement and none needs a deploy.

```sql
-- (1) STOP EVERYTHING, instantly. The cron still fires and logs; nothing settles.
update public.hr_tick_config set enabled = false where id;

-- (2) OR drop combat only, leaving the gather shadow running.
update public.hr_tick_config
   set channels = array_remove(channels, 'combat') where id;

-- (3) OR drop the one character, leaving both channels armed.
delete from public.hr_tick_ownership
 where user_id = '<uuid>' and slot = <slot> and channel = 'combat';

-- (4) BELT AND BRACES, if anything ever suggests value moved.
update public.hr_tick_config set shadow = true where id;
```

Pull (1) on **any** of: a non-zero `error` or `no_secret` in 8d, `breaks <> 0` in 8b, a
single tick-sourced `player_ledger` row, or `player_state.gold`/`version` moving for the
cohort. None of those is a number to think about; they are all stop conditions.

---

## The gather parity caveat, and the comparison I will accept for M2

The Coordinator is right, and 8c is doubly invalid as written — once for the spelling
(S-10) and once for the cap. On the cap: the
accrue path pays only on the player's **return** and clamps that payment to
`hr_offline_cap_ms` (~12 h), and `accrual.js` makes a capped absence **forfeit its excess**
while still stamping `accrued_to = now()` — so a character away 48 h and returning once
produces one ledger row worth ≤ 12 h beside ~1,920 shadow rows worth 48 h, and the naive
ratio reads as a ~4× tick over-pay that is entirely an artefact of the cap. **I will not
accept a wall-clock-bucketed sum, in either direction.** What I will accept, and what 8c
above implements, is a **span-fenced pairing**: for each `player_ledger` accrue row derive
the interval it actually settled (`[lag(delta.accrued_to), delta.accrued_to)`), keep only
intervals where `meta.capped` is not true and `meta.att` is absent, sum **only** the
`hr_tick_shadow` rows lying wholly inside that interval, discard any interval the shadow
covers less than 99 % of (the tick lagged, and the residue would price the gap rather than
the decomposition), and read the band per interval and per character — never in aggregate,
which hides one character paying double against another paying nothing. The operational
half is the one the Coordinator proposed and it is the right one: have the QA character
**return every ≤ 11 h** so cap-free intervals exist in quantity, and require at least
**six** usable intervals totalling **≥ 24 h** of paid time before reading the verdict at
all — fewer than that is a sample, not a measurement, and CLAUDE.md §4's "one sample is not
a verdict" applies to a production read exactly as it applies to a fixture. A third method
would also satisfy me if someone prefers it: set the QA character's `hr_offline_cap_ms`
above the observation window so no return can be capped, which removes the fence rather
than working around it — but it changes a live economy constant for one account and is
therefore itself a money-surface change needing its own GO, so the sub-cap-returns
procedure is the cheaper and the one I recommend.

---

## Residual risks I am accepting with the two GOs

S-4 is an operational hazard mitigated by a runbook and not by code, so it closes only when
the apply is performed that way. S-5 remains unverifiable without production and is covered
by one `select`. The §16.6 attended top-up is still unpriced and is still a hard blocker for
`shadow = false`. `perks` and `bestiaryKills` remain **under**-paying inputs — now honestly
named as the separate `hr_perks_of` / `hr_bestiary_of` reads no driver makes, which is a
strict improvement on looking sourced — and they are an ARM condition, not a shadow one. The
microsecond re-render residual on an armed window (`hr_apply` clamps to `least(now(), …)`
where the shadow fence does not) is scoped to the armed path, which is blocked. C6's drift
band is now declared N/A on the two fixtures that actually spend the nine combat inputs,
with a measured reason in the JSON; the economic claim on those two rests on C2's
per-window byte-identity, which is the stronger claim, but it means the ±10 % band in step
10 has no in-repo calibration for a death-heavy span and should be treated as a ceiling to
argue with, not a target.

**What satisfies the ARM block:** (1) **S-8** — a combat driver in the edge payload that
dispatches on `active_kind`, ships `combat.js` (it is `services/`-resident and `pack-edge`
excludes it today), and threads `mark_text: probe.markText`; (2) **S-10** — §16.6's
partition query and the parity reads corrected to the top-level spelling, and each one
executed against a real ledger row before it is signed, not after; (3) **S-9** — the
`origin/next` merge and a re-measured pack hash; (4) this battery re-run green at the
merged set head; (5) the §16.6 attended fence, still open and still correctly a hard
blocker for paying. **S-11 is not on this list** — it is the set's debt and I will not
make S-7's fix wait behind it.

---

# RE-VERIFY 3 — 2026-09-23

**Reviewer:** security-engineer (veto authority)
**Under review:** `lane/world-tick-m3` @ `76c5df8b` — `2384b0b1` merged `next` (b551 + M7 +
retired-fields), then `f0d45087` (S-8), `55a0471d` (S-10) and `76c5df8b` (S-6b).
**Branch:** `sec/world-tick-m3-4`, cut from that head. `npm install --no-audit --no-fund`.

## Verdicts

```
S-8: CLOSED
S-9: CLOSED
S-10: CLOSED
S-6b: CLOSED
MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES
EDGE DEPLOY (from the SET after merge): GO
COMBAT SHADOW ARM: GO
```

**S-8: CLOSED**

**S-9: CLOSED**

**S-10: CLOSED**

**MIGRATION 2026-09-22-world-tick-combat-channel.sql: GO-WITH-CHANGES** — the file is
**byte-identical** to both heads I have ruled on (`git diff 16965c96 HEAD` and
`git diff 0ab94c17 HEAD` on the path are empty, exit 0). The changes are unchanged and are
conditions on the **apply**, not on the file: the S-5 pre-flight `select` is read FIRST, and
the tick is paused with the lease **drained** for the S-4 `ACCESS EXCLUSIVE` rewrite. A
plain GO would say it may be applied with neither. It may not.

**EDGE DEPLOY (from the SET after merge): GO** — and "from the SET" is still load-bearing.
`origin/next` is **22 commits ahead** of this head (M5's frame gate, `467bd799`), and a
trial merge conflicts on exactly two files — `tests/schema-apply-order.json` and
`tests/schema-drift.baseline.json` — which CLAUDE.md §5 regenerates by their own tools and
never hand-merges. So the merge chore comes first, per §3.3. What I can say about the
payload: `next` touches **no** file under `supabase/functions/**`, `src/core/**`,
`src/data/**` or `supabase/config.toml` since the merge base (`66579258`), so the set's
payload should be this head's — but it is still **measured at the set SHA and never quoted**
(S-6b). At this head `--check` is exit **0**, 79 files, 47 vendored, payload `3cab1cbe…`,
and I packed it to a scratch directory and listed it: `tick-combat.js` **and**
`trophy-claim.js` are both in the 79.

**COMBAT SHADOW ARM: GO** — first GO this milestone. S-8 is closed with the driver I drove
myself, S-10's instrument executes against a real `hr_apply` row, S-9's payload carries the
live intent, and the arm statement that did not execute at all (S-12, below, mine) is fixed
in this commit and now under a guard. The GO is for the runbook at the end of this section
**in that order**, and its conditions are part of it: the migration applied, the set's edge
deployed and its `payload_sha256` verified, **one** character, the §16.6 attended fence, and
the perks/bestiary cohort fence (residual R-1). §16.6's attended fence remains a separate
hard blocker for `shadow = false`, which nothing here grants.

---

## S-8 — CLOSED, with the driver driven end to end

I did not take EC-4 as the evidence. I wrote my own probe over the repo's PGlite chain
replay (the full chain, so the staged `2026-09-22-world-tick-combat-channel.sql` is applied),
seeded a level-61 fighter — armed, fed, auto-eat on, mid-fight, enchanted, a chosen style —
leased it to the cron holder, armed `channels = {combat,gather,artisan}` on the replay only,
and called the **shipped** `runTick`. Nine arms, exit **0**:

```
ok A1  fire={"shadowed":1,"skipped":0,"refused":0,"reasons":{}}
       hr_tick_shadow: channel=combat would_kills=25
       would_xp={"strength":1225,"hitpoints":345} would_gold=148 would_ate=0
ok A2  exactly ONE shadow channel for the character — [combat] — and one ownership row,
       whose shadow_accrued_to moved
ok A3  the fence's own rendering of the mark is "2026-09-23T03:43:08.251+00:00" —
       T-separated, +00:00, microseconds kept: the spelling rosterWatermarkText accepts
ok A4  the DISPLACED second window settles: 1 -> 2 shadow rows, fire2 shadowed=1
ok A5  a gather character still reaches settleGatherSession: 1 gather shadow row
ok A6  a THIRD kind (artisan) is skipped BY NAME — reasons {"channel_not_driven":1},
       0 shadow rows, ownership mark still NULL: fail-closed, nothing journalled
ok A7  hr_tick_roster DID lease [artisan,combat,gather]; admitted by
       hr_tick_config_channels_ck [artisan,combat,gather] == driven [combat,gather]
       + declared undriven [artisan], unaccounted none
ok A8  the combat character probed as 'gather' is refused `not_tick_owned`, while its own
       channel reads the watermark back (`window_already_settled`)
ok A9  and shadow paid NOTHING: 0 player_ledger rows, version still 7, gold still 1234,
       accrued_to unmoved, after two settles
```

**The two mutations, planted in the real source and then restored** (exit codes observed):

| Mutation | My probe | The lane's guard |
|---|---|---|
| `tickOne` fences on the constant again (`CHANNELS[GATHER_CHANNEL]`, pointer must equal gather) | exit **1** — A1/A2/A3/A4/A6 RED with `reasons {"channel_moved":1}` and **no shadow row**: S-8's own signature. A5/A7/A8 stayed green, so the arms are specific | `world-tick-edge-contract` exit **1**, **EC-4a** RED with the same `channel_moved` and `NO ROW` |
| the `mark_text: probe.markText` line deleted from the session build | exit **1** — **A4 alone** RED, `error:rosterWatermarkText: no server rendering of the watermark`, 1 → 1 rows, while **A1 stayed green** | EC-4e is the arm that carries this |

The second mutation is the one worth reading twice: without `mark_text` a combat character
settles **once** and then refuses every window after it. That reads as "the tick stalled",
not as a missing field, and it is the shape a 48 h parity read cannot distinguish from S-8.

| Claim from the brief | Ruling | The executing proof |
|---|---|---|
| `tickOne` dispatches on `st.active_kind` | **CLOSED** | `CHANNELS` is a frozen table keyed by kind; the `hr_state_of` read MOVED ahead of the probe because the fence looks a lease up by `(user, slot, channel)`. A1/A5/A6 exercise all three outcomes |
| a combat roster row reaches `settleCombatSession` under `p_channel='combat'` and produces a SHADOW row with `would_kills`/`would_xp` > 0 for a level-61 fighter | **CLOSED** | A1: 25 kills, 1225 + 345 xp, 148 gold. Not S-7's zeros |
| a gather row still takes the gather path | **CLOSED** | A5 |
| `mark_text` threaded | **CLOSED** | A3 + A4, and the deletion mutation above |
| a character of a third kind is skipped, never fenced under the wrong channel | **CLOSED** | A6: `channel_not_driven`, by name, nothing written, no watermark moved |
| the mutation that fences combat as 'gather' is RED | **CLOSED** | the table above, both my probe and EC-4a |
| the roster can never lease a channel the edge cannot settle | **CLOSED, with the honest wording** | A7 proves the roster **does** lease `artisan` if an operator puts it in `channels` — the CHECK is the only bound, and `hr_tick_roster` refuses only non-payable kinds. What is closed is the consequence: `UNDRIVEN_CHANNELS` declares it, the edge skips it **by name**, nothing is paid or journalled, and **EC-4d** reads `hr_tick_config_channels_ck` out of the catalogue and goes red if a fourth value is admitted without a driver or a declaration. Residual: one `batch_limit` slot per fire per wrongly-armed character, reachable only by an operator UPDATE that needs its own GO |
| the combat settler is in the packed payload, bound to its `services/` source | **CLOSED** | `tick-combat.js` is in the 79-file payload, and `services/world-tick/combat.js` is a **re-export** (`export * from '../../supabase/functions/hr-accrue/tick-combat.js'`), not a copy — so there is no drift surface at all, which is stronger than a drift guard. `pack-edge`'s `TICK_MODULES` learned the file and `edge-tick-gate` **T-F1g** now pins that allowlist by NAME (five files), with T-F1h/i/j fencing the new entry exactly as `tick-gather.js` is fenced: registering a file is not a way to exempt it |

## S-9 — CLOSED

`git ls-tree -r HEAD supabase/functions/hr-accrue/` lists `trophy-claim.js` beside
`tick.js`, `tick-gather.js`, `tick-combat.js`, `tick-shadow.js`, and the packed directory
contains it. The payload no longer removes a live intent whose RPC is already applied.

## S-10 — CLOSED

`tests/world-tick-ledger-meta.mjs` is the right shape: it **lifts §16.6's sql block out of
the design file and executes it** against two rows written by the real `hr_apply`, so the
document an operator runs is the thing under test. Exit **0** plain, **0** `--mutate`
(the old `meta->'meta'` spelling planted back into that same query, L-1 red, one NULL
bucket). L-2 pins the control by execution (`meta ? 'att'` true and `meta->>'kills'` 4,
against NULL/NULL for the nested spelling; the old unattended filter returns **0** rows
where the correct one returns 1); L-3 reads all eight corrected keys off the row; L-4 proves
a delta carrying one death produces a separate `intent = 'death'` **row** and zero accrue
rows with a `meta->'delta'->'deaths'` array; L-5 reads `flush_seconds` and `created_at` off
the catalogue. I re-ran §16.6's block myself and it partitions two buckets.

## S-6b — CLOSED

§16.10 names no hash. It names the measurement (`pack-edge --hash` at the SHA being
deployed) and says never to verify against a value quoted in a file, a review or a
changelog. **L-7** requires the design to carry no 64-hex literal at all, while allowing the
truncated history — so the finding cannot return a fourth time. My own verdict above quotes
`3cab1cbe…` in the truncated form for the same reason.

## S-12 (NEW, P1 operational) — the arm statement did not execute, and it is mine

| # | Surface | Claim | Status | Trigger | Blast radius | Sev | Fix |
|---|---|---|---|---|---|---|---|
| **S-12** | this document's own runbook | `set channels = array(select distinct unnest(channels || 'combat'))` raises **`malformed array literal: "combat"`**. `text[] || unknown` resolves to `anyarray \|\| anyarray`, so Postgres parses the literal as an ARRAY, not as an element. The single statement that arms the channel **did not run at all** — in both the 2026-09-22 block and RE-VERIFY 2 step 9. Two more in the same file: `max(k.at)` (the column is `created_at`) and the 2026-09-22 parity block still spelling `meta->'meta'`, which answers one NULL bucket. | **CONFIRMED by execution**, PostgreSQL 18 | the arm itself | The operator pastes the arm, gets an error, and improvises a spelling under time pressure on the one statement that decides which kinds the tick settles. The other two return an error or nothing where a measurement was expected — §16.3's failure shape, in the instrument again | **P1 for the ARM** | `channels \|\| 'combat'::text` (verified: `array_append` and `array['combat']::text[]` also work; the bare literal does not). All three are corrected in place in this commit, dated, with the superseded block marked as superseded |

This is mine twice over: I wrote those statements and I signed them, having executed neither
— the same standard I held S-10's author to, failed the same way, one field over. So the
class is killed rather than the bug: **L-8** now lifts **every** sql block out of this
runbook, executes all 33 statements against the chain replay in owner context and rolls them
back, and requires zero failures. It found exactly these three before the fix, and
`--mutate` (the cast removed) turns it red. An unrunnable runbook statement cannot ship
again.

Two notes on L-8's shape, because both were wrong on my first attempt and would have made it
grade nothing: comments are stripped **before** the `;` split (a `;` inside a `--` comment is
not a statement boundary), and the statements run in **owner** context — a runbook is run by
the Coordinator through the management endpoint, not by the edge's `hr_engine` seam, which
holds no grant on `hr_tick_config` and answered `permission denied` to twenty correct
statements.

## S-11 — CLEARED at this head

`tools/lane-done.mjs` was exit 1 at `16965c96` on two inherited ratchets. At `76c5df8b`
`comment-ratio-ratchet` and `test-file-ratchet` are both **ok** — the set's paydown landed
and the M3 commits' own comment weight carried the rest. Nothing was re-pinned to get there;
both baselines are byte-identical to the previous head.

## Residual risks I am accepting with the ARM GO

| # | Risk | Why it is acceptable, and what fences it |
|---|---|---|
| **R-1** | `perks` and `bestiaryKills` are `undefined` in the tick session — `hr_perks_of` / `hr_bestiary_of` are two separate reads no tick driver makes. The tick therefore prices bestiary, charm and perk bonuses at **zero** where the accrue path does not, so a parity read on a character that HAS either shows a one-directional under-pay that is **not** a defect | In shadow nothing is paid, so this is a measurement confound, not a loss. It is fenced in **cohort selection**: the candidate must read empty on both, and the runbook makes that a stop condition rather than a footnote. `sessionFromRoster` names both keys from the caller instead of reading names that never existed, so the day a driver makes those reads it threads them in |
| **R-2** | an operator can arm `artisan`, which the CHECK admits and no settler drives | Fail-closed and journal-silent (A6), one roster slot per fire, EC-4d red the day the CHECK widens without a driver or a declaration. Arming needs its own GO |
| **R-3** | one leased combat character takes one of `batch_limit` slots from the running gather cohort | ONE character in the cohort, and 8d reads the refusal histogram so a slot famine is visible rather than inferred |
| **R-4** | CI registers `world-tick-combat-parity --mutate` with no arm, so it runs the default and the other sixteen are proved by hand — today, by me, 17/17 exit 0 | `C16`'s differential arm is in the plain run. Worth a `--mutate --all` driver; not a blocker. Carried from RE-VERIFY 2, unchanged |
| **R-5** | PGlite is one backend: every lease and advisory lock in this chain is contended by nothing | Unchanged and unchangeable here. The lease's real contention is two cron fires, which only production can show |

---

## Guards run — real exit codes

Every number is an exit code I observed in this worktree, on a clean tree, not an
expectation. (`guard-hygiene` was red on my first pass for one reason: my own untracked
probe file in `tests/`. It is in the scratchpad now, and the guard was right.)

| Guard | Exit |
|---|---|
| `tests/sec-world-tick-m3-seed-label.mjs` | **0** |
| `tests/sec-world-tick-m3-seed-label.mjs --mutate` | **0** |
| `tests/world-tick-combat-parity.mjs` | **0** |
| `tests/world-tick-combat-parity.mjs --mutate --<name>` × **17** | **0** each — `noAutoEat`, `noDeathCounters`, `noEnchant`, `noCombatStyle`, `noBuffs`, `noCombatXpMark`, `shiftWindow`, `wallclock`, `freeHeal`, `skipFoodDebit`, `relabelSeed`, `nofight`, `progressNoFold`, `hearthfindArray`, `restedNow`, `attendedThrough`, `fixedSeed` |
| `tests/world-tick-hydration.mjs` | **0** |
| `tests/world-tick-hydration.mjs --mutate` | **0** |
| `tests/world-tick-parity.mjs` | **0** |
| `tests/world-tick-parity.mjs --mutate` | **0** |
| `tests/world-tick-double-pay.mjs` | **0** |
| `tests/world-tick-shadow-chain.mjs` | **0** |
| `tests/world-tick-writer-authz.mjs` | **0** |
| `tests/world-tick-edge-contract.mjs` | **0** (and **1** with either S-8 mutation planted) |
| `tests/world-tick-edge-contract.mjs --selftest` | **0** |
| `tests/world-tick-ledger-meta.mjs` | **0** — L-0…L-8, L-8 added here |
| `tests/world-tick-ledger-meta.mjs --mutate` | **0** — L-1 and L-8 both red as required |
| `tests/edge-tick-gate.mjs` | **0** |
| `tests/delta-transport.mjs` | **0** |
| `tests/accrual-engine.mjs` | **0** |
| `tests/schema-drift.mjs` | **0** |
| `tests/apply-order-honesty.mjs` | **0** |
| `tests/guard-hygiene.mjs` | **0** |
| `tests/ci-shape.mjs` | **0** |
| `tools/pack-edge.mjs hr-accrue --check` | **0** — 79 files, 47 vendored, payload `3cab1cbe…` |
| `tools/pack-edge.mjs hr-accrue --hash` | **0** — same value; measure again at the SET SHA |
| `tools/lane-done.mjs` | **0** at the lane head, and **0** again on this branch with my two
edits in the tree: `lane-done: all green.` S-11 is cleared (see above) and my edits do not
move a ratchet. |
| Security's own probe (A1–A9) | **0**; **1** under each of the two S-8 mutations |
| Security's own runbook executor (33 statements) | **1** before the S-12 fix, **0** after |

---

## Coordinator runbook — the combat shadow, end to end, final

Steps 1–6 are unchanged from RE-VERIFY 2 except where marked. **Step 7's BLOCK is lifted**;
7–11 are now authorised in this order and only in this order.

### 1. Pre-flight, read-only (S-5)

```sql
select channels,
       array_position(channels, null) as has_null_element,   -- must be NULL
       enabled, shadow, batch_limit, lease_ms, cadence_seconds, flush_seconds
  from public.hr_tick_config where id;
-- Expect: channels = {gather}, has_null_element NULL, enabled true, shadow true.

select pg_size_pretty(pg_total_relation_size('public.hr_tick_shadow')) as size,
       count(*) as rows
  from public.hr_tick_shadow;   -- sizes the S-4 rewrite window
```

`has_null_element` not NULL → **STOP** and clean the array first: the CHECK's predicate is
NULL for a NULL element, which passes, and the tick cannot settle it.

### 2. Pause the tick, and DRAIN the lease (S-4)

```sql
update public.hr_tick_config set enabled = false where id;
select user_id, slot, channel, owned, lease_until,
       lease_until <= now() as drained
  from public.hr_tick_ownership order by lease_until desc;
-- proceed ONLY when every row reads drained = true
```

### 3. Apply — one file, Coordinator only, never in `begin/commit`, never 00:00–00:10 UTC

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-combat-channel.sql
```

Expect `world-tick-combat-channel self-check PASSED (c1-c8); probe rows rolled back`.

### 4. Resume

```sql
update public.hr_tick_config set enabled = true where id;
```

The migration arms nothing (`c3`): `channels` is still `{gather}`.

### 5. Post-apply

Read-only verification agent → `live-hash-drift --live --write` + whys → apply-order note
flipped to **APPLIED** → `restore-census` (no new tables; eight new columns).

### 6. Deploy the SET's edge, and verify by measurement

```bash
node tools/pack-edge.mjs hr-accrue --hash           # MEASURE HERE, at the set SHA
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
  --project-ref nezapsylztqbbwuwembx
```

Verify the live `payload_sha256` equals the **first line's** output — never a hash quoted in
this file, in §16.10 or in a changelog (S-6b). Confirm the packed directory contains
**`trophy-claim.js`** (S-9: without it the deploy removes a live intent) **and
`tick-combat.js`** (S-8: without it every leased combat character is skipped
`channel_not_driven` and the arm measures nothing).

### 7. The arm is authorised from here. It was not before.

`shadow` stays **true** throughout. `shadow = false` for combat is a separate action with
its own GO, which §16.6's attended fence blocks independently and this document does not
grant.

### 8. Choose the cohort — ONE character, read-only

```sql
-- CANDIDATES. Read-only; writes nothing.
with cfg as (select flush_seconds from public.hr_tick_config where id)
select ps.user_id, ps.slot, ps.active_id, ps.accrued_to,
       floor(extract(epoch from (now() - ps.accrued_to)) * 1000)::bigint as behind_ms,
       (select max(k.created_at) from public.hr_kill_credit_log k
         where k.user_id = ps.user_id and k.slot = ps.slot) as newest_kill_credit,
       exists (select 1 from public.hr_tick_ownership o
                where o.user_id = ps.user_id and o.slot = ps.slot) as already_rostered
  from public.player_state ps, cfg
 where ps.active_kind = 'combat'
   and ps.active_since is not null
   and ps.accrued_to < now() - (cfg.flush_seconds || ' seconds')::interval
 order by behind_ms desc;
```

Take a row with `already_rostered = false` (never the gather cohort — one channel per
character, or the parity read cannot attribute a window), then **two stop conditions on that
candidate**:

```sql
-- (i) THE §16.6 ATTENDED FENCE. Live kill credit near the watermark pollutes the read.
select max(k.created_at) as newest_credit, ps.accrued_to
  from public.player_state ps
  left join public.hr_kill_credit_log k
    on k.user_id = ps.user_id and k.slot = ps.slot
 where ps.user_id = '<uuid>' and ps.slot = <slot>
 group by ps.accrued_to;
-- Require newest_credit < accrued_to - ATTENDED_EDGE_SLACK_MS, else pick another.

-- (ii) THE R-1 FENCE, NEW. The tick prices perks and bestiary at ZERO (both are
--      separate reads no driver makes), so a candidate holding either shows a
--      one-directional under-pay that is NOT a defect and is not distinguishable
--      from one. Require BOTH to be empty.
with p as (select public.hr_perks_of('<uuid>'::uuid, <slot>) as j)
select j as perks,
       (j->>'ok')::boolean                      as readable,
       j->'rooms' = '{}'::jsonb
         and j->'plots' = '{}'::jsonb
         and (j->>'propertyTier')::int = 0      as prices_nothing,
       (select count(*) from public.hr_bestiary_of('<uuid>'::uuid, <slot>)) as bestiary_rows
  from p;
-- Require: readable = true, prices_nothing = true, bestiary_rows = 0.
-- `rooms`, `plots` and `propertyTier` are the only three hr_perks_of actually
-- sources today (`renown`, `clan`, `castle`, `companions` are declared blocked
-- or contributes-zero in its own `sources` field), so those three empty is the
-- whole condition. ok = false means no character, not an empty stack.
```

### 9. The arm — ownership first, then the channel

Ownership **before** the channel, `owned = false` on the insert so the roster stamps the
lease itself (the `c1b` property). Reversing the two lets the roster see the channel with no
cohort behind it.

```sql
-- (a) THE COHORT. owned = false, so the roster stamps the lease.
insert into public.hr_tick_ownership (user_id, slot, channel, owned)
values ('<uuid>', <slot>, 'combat', false)
on conflict (user_id, slot, channel) do update set owned = excluded.owned;

-- (b) THE CHANNEL. One row, id = true. Idempotent and order-stable.
--     `'combat'::text` IS LOAD-BEARING (S-12): text[] || unknown resolves to
--     anyarray || anyarray, so the bare literal raises `malformed array literal`.
update public.hr_tick_config
   set channels = array(select distinct unnest(channels || 'combat'::text))
 where id
   and not ('combat' = any (channels));

-- (c) READ IT BACK before walking away.
select channels, enabled, shadow from public.hr_tick_config where id;
-- Expect: channels = {combat,gather}, enabled true, shadow TRUE.
```

### 10. The parity reads — at T+1 h, T+24 h and T+48 h

Read **8a first**: zero means the settler is not running and everything below measures
nothing. Every spelling here is the corrected one, and all of it is executed by
`tests/world-tick-ledger-meta.mjs` **L-8** — see RE-VERIFY 2 step 10 for the full 8a–8d
block, which stands as written, plus this one addition:

```sql
-- (8e) NEW. The per-character outcome histogram is the S-8 detector, and
--      `channel_not_driven` is its new spelling: it means the edge running in
--      production does not carry tick-combat.js, i.e. step 6 did not happen or
--      did not take. `channel_moved` means the pointer left combat, which is a
--      player action and not a defect. The two must not be read as one.
select outcome, count(*), sum(rostered) from public.hr_tick_cron_log
 where at > now() - interval '1 hour' group by 1 order by 2 desc;
```

**What number means parity holds, after 48 h — all five, unchanged from RE-VERIFY 2**:
(8a) ≥ 95 % of `48 × 3600 / flush_seconds` rows per character; (8b) `breaks = 0` exactly and
≤ 40 rows/hour/character; (8c) `ate`, `kills`, `deaths`, `hp`, `consec_falls` **EXACT**;
(8c) `gold`, `xp`, `items` within **±10 % per usable span** with no monotone drift, and no
rare item present in one set and absent from the other; (8d) zero `error`, zero `no_secret`,
**zero** tick-sourced `player_ledger` rows for the cohort. Discard every span with
`coverage_pct < 99`. A field at **zero for two days is a P1 by definition** (CLAUDE.md §3.4).

### 11. The kill switch — cheapest first, none needs a deploy

```sql
-- (1) STOP EVERYTHING. The gather cohort stops too; this is the blunt one.
update public.hr_tick_config set enabled = false where id;

-- (2) DROP COMBAT ONLY, leaving gather running. The preferred switch.
update public.hr_tick_config set channels = array_remove(channels, 'combat') where id;

-- (3) DE-COHORT THE ONE CHARACTER, leaving the channel armed.
delete from public.hr_tick_ownership
 where user_id = '<uuid>' and slot = <slot> and channel = 'combat';

-- (4) AND IF SHADOW WAS EVER FLIPPED, PUT IT BACK FIRST, before anything else.
update public.hr_tick_config set shadow = true where id;
```

None of the four needs an edge deploy, and (2) is reversible by step 9(b).
