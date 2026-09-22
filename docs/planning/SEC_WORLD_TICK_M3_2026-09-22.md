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
