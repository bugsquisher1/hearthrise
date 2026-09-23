# Security review — the Bestiary trophy ladder (lane/m7-bestiary-backend @ d7285045)

**Reviewer:** security-engineer (veto authority, `CLAUDE.md` §2). **Date:** 2026-09-22.
**Reviewed as a money-adjacent surface:** the ladder feeds a DROP multiplier (the
economy) and a dormant DAMAGE multiplier (ranked kills), and the claim writes a
`collection` row that a future "trophies claimed" board would rank.
**Scope:** `38c05017..d7285045` (3 commits on the design lane, on main b550).
No production or DB access was used; every measurement below is a guard exit
code or a real PostgreSQL replay of the repo chain (`@electric-sql/pglite`).

---

## 0. Verdicts

| Item | Verdict |
|---|---|
| `supabase/migrations/2026-09-22-state-of-trophy-prefix.sql` | **GO** |
| `supabase/migrations/2026-09-22-trophy-claim.sql` | **GO-WITH-CHANGES** (F1; F2 as a written condition) |
| **CLIENT SHIP (b551): BLOCK** | F3 and F4 land first, and only in the release AFTER both applies |

The feature's central security claim is sound and it is the strongest kind:
**the claim mints nothing, and the power is derived rather than stored.** A
forged, replayed or reordered claim cannot move a value that crosses into
another player's economy or ranking, because it moves no value at all. That is
`CLAUDE.md` §1's target property satisfied by construction, not by a clamp. The
five findings below are a read-path robustness gap, an unreserved key namespace,
and three client-half divergences sharing one root cause — **none of them is a
way to mint, and none crosses to another player.**

---

## 1. Findings

| # | Surface | Where | Status | Trigger / exploit scenario | Blast radius | Sev | Required change |
|---|---|---|---|---|---|---|---|
| **F1** | `hr_trophy_of` key parse | `2026-09-22-trophy-claim.sql:181-186` | **CONFIRMED** (proof `S-1`) | A `player_progress` row `trophy:<id>:99999999999` passes the stage regex `^[1-9][0-9]*$` and then overflows the `::int` in the target list → **SQLSTATE 22003**. The read runs on **every accrual** (`index.ts:615-623`) and that savepoint degrades on `42883` **only**, so a 22003 rethrows and kills the whole accrual read for that character, permanently. The file's own comment defends the sibling `22P02` case and misses the range half. | one character, total loss of progression reads (self) | **MED** (fail-closed, not currently reachable from a client) | Bound the regex to the ladder: `split_part(pp.key, ':', 3) ~ '^[1-9][0-9]{0,2}$'`. Keep the 4-segment and non-empty-id checks. |
| **F2** | the `trophy:` namespace | `2026-09-14-hr-apply-restatement.sql:1246-1258` vs `BESTIARY_LADDER.md` §5 | **CONFIRMED (code), NOT client-reachable** | `hr_apply` admits `kind='collection'` with any 1..64-char key, and `progress_claim` flips a `done` row to `claimed`. So `{kind:'collection', key:'trophy:goblin:4', state:'done'}` + a `progress_claim` writes a trophy row `hr_trophy_of` returns — with **no `player_ledger` row**. The design and the migration both say the row is written "only by `hr_trophy_claim`"; the database does not enforce that. **NOT reachable from a browser:** `parseIntent`/`INTENT_KEYS` (`request.js:229-233`) carry no progress or delta field, verified — this needs a compromised Edge. | one character's badge, and a future ranking count (self) | **LOW** | Write the rule down in this file now, since the design promises the board: **any "trophies claimed" ranking counts `player_ledger` rows (`intent='trophy_claim'`), never `player_progress` rows.** File the real reservation (`hr_apply` refuses `key like 'trophy:%'`) as its own lane-C follow-up — it is another restatement of the highest-traffic writer and does not belong in this lane. |
| **F3** | Edge → client trophy block | `supabase/functions/hr-accrue/index.ts:700-710` | **CONFIRMED (code read)** | The comment says "the key is OMITTED entirely on a database without `hr_trophy_of`". The code always emits `trophies: claimed`, built from `trophyRows ?? []` — so on the `42883` degradation path (and on this file's own documented rollback, `drop function public.hr_trophy_of`) the key is **present and empty**. `noteEnvelope` (`bestiary-trophies.js:92-141`) then sets `hasTrophyKey: true`, `claimed` empty → `isClaimed` false for every trophy the server holds → `claimButtonHtml` re-offers **Claim** on a claimed trophy and the badge reads "trophy not claimed yet". Server answers `already_owned`. | every player's Bestiary panel, display only | **MED** — this is the `CLAUDE.md` §6 "browser says one thing, server says another" class on the surface this lane built | Omit the key: `...(trophyRows ? { trophies: claimed } : {})`, so absence stays absence. `trophy-claim.js` `PROJECTION_SQL`'s path already does this correctly — match it. |
| **F4** | client drop prediction | `src/legacy.js:2780`, `supabase/functions/hr-accrue/accrual.js` `playerRolls(m)`, `src/core-bridge.js` `combatCtx` | **CONFIRMED** (proof `S-2`) | `weaknessInfo` resolves the trophy off `monsterId`; `combatCtx` deliberately omits it (correctly — it is per-loadout) and **nothing puts it back at the call**. Measured: 0 of 108 roster rows carry `.id`, so `getPlayerCombatRolls(m).weak.dropMult` = **1.15** while `getWeaknessInfo(m).dropMult` = **1.1845** at stage 4 on the same monster. The server pays the preview's number (`combat-sim.js:405` / `resolveKill` passes the id), so the **Fight screen under-states the drop rate**. `src/features/smoke/hunt-raids-and-screens.js:2049` asserts these two equal to `1e-9` — so this is a **latent in-page RED that arms itself the first time any player reaches Stalker** (`CLAUDE.md` §4: a red in-page test is a P1 and makes the GitHub `smoke` gate unreachable). | every player holding stage ≥2, display; the in-page gate | **MED** | Pass the id at the call, both runtimes: `playerCombatRolls(m, { ...C.combatCtx(eq, _set), monsterId: C.monsterId(m) })` at `legacy.js:2780`, and `monsterId: id` in `accrual.js`'s `playerRolls(m)`. This also closes F5. |
| **F5** | the damage arm | `src/core/trophies.js:79`, `BESTIARY_LADDER.md` §3.1 | **CONFIRMED** (proof `S-3`) | Same root cause as F4: `maxHit` is rolled from `ctx.playerRolls(m)` (`combat-sim.js:405`), and that path resolves trophy stage 0. So flipping `TROPHY_DAMAGE_ARM_ENABLED` **states an effect that pays nothing** — what `tests/arm-flag-honesty.mjs` exists to prevent. `tests/bestiary-trophy.mjs` T5 cannot see it: it calls `weaknessInfo` directly **with** the id. AWAY-1 parity HOLDS today (both sides are exactly 1), so this is not a b551 blocker. | the future arming lane | **LOW** | Not a change to this lane. Correct §3.1: arming is **not** a one-line flip — it needs F4's plumbing first. Carry F4 and this arm is closed with it. |
| **N1** | `§0` preconditions | `2026-09-22-trophy-claim.sql:113-116` | note | The rate-limited arm calls `hr_rate_sample_weight` / `hr_rate_over`, which `§0` does not assert. Both ship in `2026-08-11-player-state.sql` alongside the asserted `hr_rate_ok`, so unreachable in practice. | — | INFO | Optional: add them to the `to_regprocedure` list. |
| **N2** | rejection attribution | `2026-09-22-trophy-claim.sql:294` | note | `v_intent := 'trophy_claim:' || p_monster || ':' || p_stage` → `hr_rejection_verb` takes the first two segments → up to **108** distinct verb keys against `c_verb_cap = 24`, so the per-verb breakdown collapses into `(other)`. `n`, `code` and `severity` stay exact. This is the house pattern (`unlock_buy:<offer>`, `recipe_learn:<item>`), but the trophy roster is the largest id space of any verb, so `vitals --refusals` will read trophy refusals as many low-count keys plus `(other)`. | — | INFO | Accept, or drop the monster from the label. Do **not** widen the cap. |
| **N3** | the `×` figure | `src/render/bestiary.js` (`var shown = tKills > 0 ? tKills : entry.kills`) | note | Falls back to the `G.bestiary` residue count when the server has none, so the row can show a kill count with no ladder line beside it. The **gate** is server-only and fails safe, which is the part that matters; the comment names the trade. | — | INFO | Accept. |

**No finding was found against the rule the brief put explicitly on:**

- **(1) a claim for a stage not reached** — closed. The threshold is judged against
  `c_at[p_stage]` and a count the function reads itself from `player_progress`
  under the same advisory lock `hr_apply` takes (`:307-321`). There is **no count
  parameter** on the signature, none on the wire (`readTrophy`, `request.js:330-349`,
  admits `{monster, stage}` only), and none in the Edge commit statement (five
  scalars, `trophy-claim.js:69-70`). A forged count is unrepresentable, not refused.
  Mutation `S2` in `tests/bestiary-trophy.mjs --selftest` removes the check and is
  caught by its named assertion.
- **(2) twice, or on another player's row** — closed. `p_user` is the Edge's
  verified JWT subject and never a body field (`index.ts:478`). Idempotency is
  two facts kept apart: same `p_idem` → the stored answer with `replayed:true`;
  a new key on a held trophy → `already_owned` from the `on conflict do nothing`
  row count, read **before** the journal. `player_progress` carries no non-SELECT
  client grant and no non-SELECT policy (asserted `§5(c)`). `§5(f)` proves a
  second character reads zero trophies and gets `not_yet`, not `already_owned`.
  Mutation `S5` covers the once-guard.
- **(3) mints nothing / journals** — closed, and **measured**, not asserted:
  `§5(e)` compares gold, gems, total inventory qty, total skill xp **and
  `accrued_to`** across a real claim, and `§5(d3)/(d4)/(d5)` count exactly one
  `player_progress` row and exactly one `player_ledger` row per trophy across a
  second claim and a replay.
- **(4) the ceilings at the point of use** — closed. `memoryDropMult`
  (`src/core/trophies.js:226-231`) is the one place the charm × trophy product is
  formed and the one place `MAX_MEMORY_DROP_MULT` is applied, and `weaknessInfo`
  calls it inside the engine expression, not in a test. AWAY-1 holds by
  construction: `computeAccrual` derives `trophies` **once** and hands the same
  index to the away span and the attended top-up. A forged `trophy:*` progress
  row is unreachable from a client — `hr_put_client_state` writes only
  `player_state.client_state` (a residue JSONB column), never `player_progress`,
  so no denylist entry is needed; see F2 for the Edge-side gap.
- **(5) the anchor patch** — closed, see §2.
- **(6) the two engine grants** — closed, see §3.
- **(7) probe rows only** — closed, see §4.
- **(8) the client half** — F3, F4 and F5. Otherwise clean: the mirror reads the
  server block and nothing else, validates ids against the roster by own-property,
  coerces values, replaces the whole scratch object rather than merging, lives on
  a `_`-prefixed key that is never persisted, and `RESIDUE_FIELDS` is untouched
  (empty diff). Every question fails safe to "no kills, no stage, not claimed,
  not claimable". Counters are monotonic and claimed rows are never deleted, so a
  stale mirror can only **under**-offer the button.

---

## 2. `2026-09-22-state-of-trophy-prefix.sql` — GO

Measured on a real PostgreSQL rebuilt from the repo chain, with the two
2026-09-22 files neutered for the "before" side so the diff isolates this lane:

**Nothing else in the projection moves.** The installed body differs in exactly
two places — one SQL line inside the `progress` array subquery and one inside the
`progress_truncated` count subquery, each preceded by its comment block. Nothing
else. Every top-level envelope key is **identical** before and after:

```
ok version now buffs place dungeon_cooldowns state skills inventory bank
equipment enchant workers farm progress progress_truncated client_state
total_level unlocked_recipes gem_unlocks renown_high bounty hero_slots
traits companions inventory_complete
```
(26 keys, both sides, byte-identical sets.)

- **Anchors are unique.** Each is newline-prefixed, which is load-bearing and the
  file says so: the 11-space form is otherwise a substring of the 17-space line.
  Both `exactly once` assertions are correct as written.
- **Patched, not restated** — the right call on the one function every client read
  passes through, and it takes over no last-toucher role.
- **Re-apply is byte-identical** — measured: re-applying the file on the patched
  chain leaves `pg_get_functiondef` unchanged (`REAPPLY BYTE-IDENTICAL: true`).
  `strpos(v_def, 'trophy:%') > 0 → notice, return` is the whole mechanism.
- **Fail-closed preconditions** (both earlier exclusions present, both anchors
  once, the cap and the flag still there) and a self-check that proves the
  predicate landed in **both** subqueries, that neither earlier exclusion was
  eaten, that a `collection` row which is **not** a trophy still rides (the
  discriminating control — a `kind <> 'collection'` predicate would pass a weaker
  check and take the whole collection log out), that an ordinary stat still
  rides, and that the flag agrees with the array.
- **No grant moves**; the revoke/grant is restated and asserted.
- **Byte-identical envelope on the day it applies**, because zero `trophy:%` rows
  exist — verify that read-only first (§5, query 3).

**Live-hash:** `hr_state_of` is tracked (`chain`,`floor`,`pin`). Expect on
`--live --write` (see §6 for the exact numbers).

---

## 3. The two engine grants (rule 6)

| Function | Grantee | Why the engine needs it |
|---|---|---|
| `hr_trophy_of(uuid,integer)` | `hr_engine` only | `2026-09-22-state-of-trophy-prefix.sql` removed the trophy population from `hr_state_of`'s generic envelope, so this is the **only** door to it — the position `hr_bestiary_of` and `hr_collection_of` are already in. `STABLE`, writes nothing, bounded structurally by the key prefix and by `(user, slot)`; no parameter widens it. No new target: `p_user` is what the engine already passes to `hr_apply` and `hr_state_of`. |
| `hr_trophy_claim(uuid,integer,text,integer,text)` | `hr_engine` only | The commit point for the claim intent. Not read-only; the claim rests on **self-validating**: the whole caller-supplied surface is a slot, a monster id validated against `hr_activities` (generated, client-unwritable), a stage bounded `1..4` against the server's own ladder, and an idempotency uuid. No kill count exists on the signature. It mints nothing. No new target: `p_user` again. |

Measured on the replayed chain: both are `SECURITY DEFINER` with
`search_path=public, pg_temp`; `hr_engine` = true, `authenticated` / `anon` /
`service_role` = false for both; both **absent** from `hr_client_rpc_baseline`
(count 0), which is correct and is asserted by `§5(b)` — registering an
engine-only function there would declare a client grant nobody granted, and the
next "restore the baseline" would grant it.

`hr_assert_grant_hygiene(true)` at chain end returns an **all-empty report** and
does not raise in strict mode:

```
ungated_client_rpcs [] · client_truncate_grants [] · unapproved_client_rpcs []
engine_table_privileges [] · public_execute_functions [] · baseline_rows_no_longer_live []
platform_schema_defacls_open [] · engine_execute_outside_allowlist []
owners_without_failclosed_defacl []
```

`node tools/derive-grant-hygiene.mjs --check` → **exit 0**, "in sync (10 links,
11 patches)". `c_engine_allow` goes **20 → 22 entries**, insertion-only at the
head, each with a written justification — the correct answer to the
`engine_execute_outside_allowlist` finding the in-page suite raised on this
branch. Recording the reviewed intent rather than widening the check is right.

⚠ **But §4b RESTATES `hr_assert_grant_hygiene` wholesale** from
`2026-09-11-quartermaster-buy.sql`'s committed body, where file 1 correctly
patches. The derivation tool plus `--check` is the control, but it grades the
**repo**, not production. If anything touched the installed detector after
quartermaster-buy, this apply silently reverts it — the b484–b487 class. §5
query 8 is the read that closes it, and it is not optional.

---

## 4. Self-checks: probe rows only, and production-safe (rule 7)

- `node tests/selfcheck-no-global-dml.mjs` → **exit 0** (204 migrations, 9 global
  statements, all 9 acknowledged). Neither new file adds an acknowledgement,
  which means **every DML in both self-checks is owner-scoped**.
- **Bypass proof:** `--selftest` → **exit 0**, all **16** planted defects caught
  (families A–D: `EXECUTE` string literals, `format()`, nested dollar-quotes,
  fake binds, CTE deletes, `UPDATE … FROM` joins, unscoped backfill calls, a
  `pg_temp` function) and all **5** controls silent. The guard bites.
- Every statement in both probes names `v_uid` (or `v_other`), including the
  `on conflict` arms. Teardown is a sentinel raise (HR845 / HR846) discarding the
  subtransaction — the only clean teardown available, because `player_ledger`'s
  retention trigger refuses to DELETE a fresh row. A leak check follows (3 tables
  for file 1, 5 for file 2, `auth.users` included), so a probe row that survives
  **fails the apply** rather than being left behind.
- **The three probe uuids are unique across all 204 migrations** —
  `…770f180a0000`, `…1111`, `…2222`, one occurrence each.
- **Will pass on production with real rows and armed triggers:** the probes read
  and write only under uuids nothing else holds; no assertion is global (`§5(e)`
  compares **snapshot sums** across the claim rather than asserting an empty bag,
  which is the honest property for a character `hr_create_character` gave a
  starting kit); `hr_activities`'s monster is **selected from the catalogue**, not
  hardcoded, so a roster rename cannot turn the apply red for the wrong reason.
  The `hr_create_character` + `set_config('request.jwt.claim.sub', …)` pattern is
  production-proven — `2026-09-14-recipe-learn.sql` applied on production with it
  on 2026-09-14. If it ever did refuse, the next assertion fails loudly and the
  apply aborts; there is no quiet direction.

---

## 5. Apply order and pre-apply read-only SQL

**Order, and it is not interchangeable:**

1. `node tools/apply-migration.mjs supabase/migrations/2026-09-22-state-of-trophy-prefix.sql`
2. `node tools/apply-migration.mjs supabase/migrations/2026-09-22-trophy-claim.sql`

One file per call, never inside `begin/commit`, never during 00:00–00:10 UTC.
File 2's `§0` refuses to install without file 1 — correctly: with the writer
installed and the envelope still carrying `trophy:%`, a long-term character's
quest rows start falling off the 1000-row cap silently, and nothing in the repo
goes red. **The client half ships in the release AFTER both applies** (§7).

### Before file 1 — read-only

```sql
-- (1) the live body is the shape this file was derived against
select to_regprocedure('public.hr_state_of(uuid,int)') is not null as fn_exists,      -- t
       strpos(d, 'ev:kill_monster:%') > 0                          as excl_kills,     -- t
       strpos(d, 'ev:loot:%')         > 0                          as excl_loot,      -- t
       strpos(d, 'limit 1000')        > 0                          as cap_present,    -- t
       strpos(d, 'progress_truncated')> 0                          as flag_present,   -- t
       strpos(d, 'trophy:%')          = 0                          as not_yet_patched  -- t
  from (select replace(pg_get_functiondef(
          'public.hr_state_of(uuid,int)'::regprocedure), chr(13), '') d) q;

-- (2) each anchor exactly once (the file's own precondition, read BEFORE it runs)
select (length(d) - length(replace(d, a1, ''))) / length(a1) as progress_anchor,   -- 1
       (length(d) - length(replace(d, a2, ''))) / length(a2) as truncated_anchor   -- 1
  from (select replace(pg_get_functiondef(
                 'public.hr_state_of(uuid,int)'::regprocedure), chr(13), '') d,
               E'\n                 and key not like ''ev:loot:%''' a1,
               E'\n           and key not like ''ev:loot:%'''       a2) q;

-- (3) THE BYTE-IDENTICAL CLAIM. Zero rows ⇒ the envelope does not change at all
--     on the day this applies. A non-zero answer means someone wrote the
--     namespace already: STOP and find out who.
select count(*) as trophy_rows from public.player_progress where key like 'trophy:%';  -- 0

-- (4) grants, so §1's restated revoke/grant changes nothing
select has_function_privilege('hr_engine',     'public.hr_state_of(uuid,int)','execute') as engine, -- t
       has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)','execute') as auth,   -- f
       has_function_privilege('anon',          'public.hr_state_of(uuid,int)','execute') as anon,   -- f
       has_function_privilege('service_role',  'public.hr_state_of(uuid,int)','execute') as svc;    -- f

-- (5) the probe uuid is not already present (a leaked row fails the leak check
--     with a message that blames the wrong thing)
select count(*) as probe_users from auth.users
 where id = '00000000-0000-4000-c000-770f180a0000';                                    -- 0
```

### Between the applies — read-only

```sql
-- (6) the predicate landed in BOTH subqueries, and neither earlier exclusion
--     was eaten. This is file 2's §0 precondition, read directly.
--     RUN IT BEFORE FILE 1 TOO and keep the two answers side by side: the
--     absolute counts depend on production's own body (measured 4 and 3 on the
--     repo replay), so the property is that `trophy_predicates` goes 0 → 2 and
--     the other two DO NOT DROP.
select (length(d) - length(replace(d, p, ''))) / length(p)           as trophy_predicates, -- 0 → 2
       (length(d) - length(replace(d, 'ev:kill_monster:%',''))) / 17 as kill_exclusions,   -- unchanged
       (length(d) - length(replace(d, 'ev:loot:%','')))         / 9  as loot_exclusions    -- unchanged
  from (select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) d,
               'and key not like ''trophy:%''' p) q;
```

### Before file 2 — read-only

```sql
-- (7) the catalogue p_monster is validated against, present AND non-empty
select count(*) as combat_rows from public.hr_activities where kind = 'combat';        -- 108

-- (8) the ledger kind CHECK admits 'quest' (a claim that cannot journal is a
--     claim that raises inside its own protected block)
select pg_get_constraintdef(oid) like '%''quest''%' as admits_quest                    -- t
  from pg_constraint
 where conrelid = 'public.player_ledger'::regclass
   and conname  = 'player_ledger_kind_check';

-- (9) ⚠ THE RESTATEMENT CHECK — the one read that is not optional. §4b REPLACES
--     hr_assert_grant_hygiene WHOLESALE from 2026-09-11-quartermaster-buy.sql's
--     body (where file 1 correctly patches). If production's installed detector
--     is NOT that body, this apply silently reverts whatever touched it later —
--     the b484–b487 class, on the detector itself.
--
--     (9a) the behavioural read: nothing is unrecorded TODAY, so the only thing
--          §4b changes is admitting the two new grants.
select public.hr_assert_grant_hygiene(false);
--          expect every array empty, `engine_execute_outside_allowlist` in
--          particular. A non-empty one means production already carries an
--          engine grant this chain does not know about: STOP.
--
--     (9b) the identity read, and it is the authoritative one because it is the
--          tool that does the normalisation (no credential in the agent process):
--            node tests/live-hash-drift.mjs --live-sql > q.sql   (run it read-only)
--            node tests/live-hash-drift.mjs --live-compare result.json
--          `hr_assert_grant_hygiene(p_strict boolean)` must still measure the
--          baseline's recorded body: normalised md5
--          638425ee833c49065936d390a44c3484, length 26804. Any other value means
--          production's detector is not the body §4b was derived from.
--     A mismatch on (9a) or (9b) ⇒ STOP; do not apply file 2.

-- (10) additive install: neither function exists yet
select count(*) as already_there from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('hr_trophy_of','hr_trophy_claim');       -- 0

-- (11) probe uuids clean
select count(*) as probe_users from auth.users
 where id in ('00000000-0000-4000-c000-770f180a1111',
              '00000000-0000-4000-c000-770f180a2222');                                 -- 0
```

### After both applies — read-only verification

```sql
select public.hr_assert_grant_hygiene(true);                     -- every array empty
select count(*) from public.hr_client_rpc_baseline
 where proname like 'hr_trophy%';                                -- 0
select has_function_privilege('authenticated',
         'public.hr_trophy_claim(uuid,integer,text,integer,text)','execute');  -- f
select count(*) from public.player_progress where key like 'trophy:%';         -- 0 (nobody has claimed yet)
```

---

## 6. What the Coordinator must expect on `--live --write`

`node tests/live-hash-drift.mjs` on this branch, replay half, **measured**:

```
live-hash-drift: 52 tracked names, 50 baselined bodies
  RED  replay hr_assert_grant_hygiene(p_strict boolean)
       repo now rebuilds to 18004554782bf699655e39057a8ecca6 (normalised 29191);
       baseline records          638425ee833c49065936d390a44c3484 (26804)
  RED  replay hr_state_of(p_user uuid, p_slot integer)
       repo now rebuilds to 5527d069e857db9cb653445d12b239d7 (normalised 30524);
       baseline records          50913bae9c63bd8b7984fcdd30e5d1b4 (29802)
```

So after the two applies:

- **Exactly two baselined bodies move** — `hr_state_of` (patched by file 1) and
  `hr_assert_grant_hygiene` (restated by file 2 §4b). Any third moved body means
  something unreviewed came with the apply: **stop and read it**.
- **The baseline grows 50 → 52 bodies.** `52 tracked names` against `50
  baselined` today is the two new pinned functions. Confirm the two added names
  are exactly `hr_trophy_of` and `hr_trophy_claim` and nothing else.
- Whys written from `--codediff`, per `CLAUDE.md` §2. `tests/live-hash-drift.baseline.json`
  is untouched on this lane (empty diff) and on the review branch — correct, it is
  Coordinator-only.
- `tests/apply-order-honesty.mjs` → **exit 0**; flip both notes to APPLIED after
  the applies.
- `restore-census`: **no new table** (both populations are `player_progress`
  rows), so there is nothing to classify. Re-run it and confirm the count is
  unchanged rather than assuming it.

---

## 7. CLIENT SHIP (b551): BLOCK

Two reasons, and they are separable from the migrations:

1. **F3** — `index.ts` emits `trophies: []` where it documents omitting the key,
   so the degradation path and this file's own rollback both produce a panel that
   offers **Claim** on trophies the server holds. That is the `CLAUDE.md` §6 class
   Tyler called a P1 class-kill on 2026-09-14, on the surface this lane built.
2. **F4** — the Fight screen quotes a drop rate 3% below what the server pays at
   Nemesis, and `hunt-raids-and-screens.js:2049` already asserts those two equal:
   a latent in-page RED that arms itself at the first Stalker and, per
   `CLAUDE.md` §4, makes the GitHub `smoke` gate unreachable for every later build.

With F3 and F4 landed the client half is a **GO for the release after both
applies** — never the same release, and never before file 2, because before file 2
the Claim button's only commit point does not exist (`42883` → 500 →
`unavailable`).

---

## 8. Guards run, on real exit codes

| Command | Exit | Last line |
|---|---|---|
| `node tests/bestiary-ladder.mjs` | **0** | green — 108 monsters, 4 stages, every bonus inside the band |
| `node tests/bestiary-trophy.mjs` | **0** | green — the ladder derives its own multipliers inside the stated ceilings, attended and away quote one number, and the claim refuses, journals once and mints nothing |
| `node tests/bestiary-trophy.mjs --selftest` | **0** | every mutation caught by its named assertion, every negative control silent — non-vacuous (SQL arm: S1, S2, S5, S7 each caught by name) |
| `node tests/schema-drift.mjs` | **0** | repo rebuilds to the committed fingerprint (`24989e032a1d…`) |
| `node tests/apply-order-honesty.mjs` | **0** | 30 files carry a measured verdict, every note agrees with the live-hash baseline |
| `node tests/accrual-engine.mjs` | **0** | full fixture set green |
| `node tools/derive-grant-hygiene.mjs --check` | **0** | derivation in sync (10 links, 11 patches) |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 204 migrations, 9 global statements, all acknowledged |
| `node tests/selfcheck-no-global-dml.mjs --selftest` | **0** | 16/16 planted defects caught, 5 controls silent |
| `node tools/lane-done.mjs` | **0** | every ratchet `ok` (see §9 — the first run was red on this branch's own proof file until it was declared) |
| `node tests/guard-hygiene.mjs` | **0** | no orphans, no ghosts, no stale entries, no vacuous proofs |
| `node tests/sec-bestiary-trophy-proofs.mjs` | **1** | **RED by design** — the three proofs below |

`@electric-sql/pglite` was not installed in this worktree; `npm install` was run
(a registry install, not a purchase — the 2026-08-17 budget freeze is untouched).

---

## 9. The proofs

`tests/sec-bestiary-trophy-proofs.mjs`, on this review branch only. **It is
expected to be RED on the lane as reviewed** and is deliberately NOT registered
in `.github/workflows/smoke.yml` — it is the executable half of F1, F4 and F5,
not a ratchet. When the lane lands the required changes it goes green, and its
author should fold the assertions into `tests/bestiary-trophy.mjs` and delete it.
Per `CLAUDE.md` §2 and this role's boundaries, **no lane code was changed.**

- `S-1` lifts `hr_trophy_of`'s body **out of the migration** (so the proof cannot
  drift from the file), points it at a probe table, and inserts
  `trophy:goblin:99999999999` → `22003 value "99999999999" is out of range for
  type integer`.
- `S-2` builds a stage-4 index and shows `playerCombatRolls(...).weak.dropMult`
  = 1.15 against `weaknessInfo(..., id).dropMult` = 1.1845 for the same monster.
- `S-3` shows the same path resolves trophy stage 0, so the damage arm is
  unreachable where `maxHit` is rolled.

It is registered in `tests/guards-unregistered.json` as declared debt with a
reason, an owner and a disposition of `review-artifact-expected-red` — that file
is `tests/guard-hygiene.mjs`'s own exception channel, not a loosening of it. The
first `lane-done` run on this branch was **red for exactly that reason**
(`ORPHAN: tests/sec-bestiary-trophy-proofs.mjs is run by nothing`, exit 1), which
is the guard working; `node tests/guard-hygiene.mjs` → exit 0 after the entry
landed ("no orphans, no ghosts, no stale entries, no vacuous proofs").

`node tools/lane-done.mjs` on the review branch → **exit 0**, last line `lane-done:
all green.`, 24 steps `ok`,
including `patch-chain-guard`, `no-client-xp-mint`, `property-gate-census`,
`no-client-copy-of-projection`, `no-new-prediction`, `ci-shape`, `guard-hygiene`
and `bump-version.sh --check`. **Nothing on this branch touches lane code, the
version, the CHANGELOG or `tests/live-hash-drift.baseline.json`** — it is a report,
a proof file and one debt entry.

---

## 10. Residual risks I am accepting

- **F2's namespace gap**, bounded to a compromised Edge, self-scoped, minting
  nothing, and closed for ranking purposes by the ledger rule this document
  makes binding. The real reservation in `hr_apply` is a follow-up lane.
- **The kill counters themselves are trusted as far as `hr_apply` is.** They
  already price a ranked surface (`2026-08-20-renown.sql:163` sums
  `ev:kill_monster:%` × 5 for boss kills), so this lane inherits that exposure
  rather than creating it, and it adds no client path to the counters: verified
  that `parseIntent`/`INTENT_KEYS` carry no progress or delta field, so a kill
  count can only come from the Edge's own `computeAccrual` over a server clock.
- **`hr_state_of` is now 22 anchored edits deep.** `patch-chain-guard` is green
  and this file's patch is correct, but the function's live body still exists in
  no single file. That is pre-existing debt this lane adds two lines to; it is
  not a reason to block, and a restatement is the wrong fix on the one function
  every client read passes through.

---

# RE-VERIFY — 2026-09-23, `lane/m7-bestiary-backend` @ `2b08a392`

**Reviewer:** security-engineer (veto). **Branch:** `sec/m7-bestiary-2`, cut from that
lane head. No production or DB access; every "green" below is an exit code I saw.
Scope: `d7285045..2b08a392` — the two merges (`sec/m7-bestiary`, `set/b551`) plus
one commit per finding. `2026-09-22-state-of-trophy-prefix.sql` is **byte-identical**
to the file I signed off (empty diff), so its GO carries unchanged. The net diff of
`2026-09-22-trophy-claim.sql` is F1 + F2 **plus one hunk from the `set/b551` merge**
that I read and that matters — see §R4.

## R0. Verdicts

**2026-09-22-state-of-trophy-prefix.sql: GO**
**2026-09-22-trophy-claim.sql: GO**
**CLIENT SHIP: GO**

All four conditions are met, and the client ship is a GO **for the release AFTER both
applies, never the same release and never before file 2** — before file 2 the Claim
button's only commit point does not exist (`42883` → 500 → `unavailable`), and before
file 1 the writer is live while the envelope still carries `trophy:%`, which silently
pushes a long-lived character's quest rows off the `limit 1000` cap. Order:
**file 1 → file 2 → (next daily cut) client half.** F5 closed with F4. No new finding.

## R1. Per-item ruling

| # | Condition I set | Ruling | The evidence, measured today |
|---|---|---|---|
| **F1** | stage class bounded; proven by executing SQL on probe rows only | **CLOSED** | I replayed the repo chain in PGlite twice myself and **materialised** `hr_trophy_of`'s rows (`select *`, not `count(*)`, so the `::int` cannot be planned away) for a character holding `trophy:slime:4` **and** `trophy:<mon>:99999999999`. As committed: **1 row, `{goblin,4}`, no 22003** — the 11-digit key is dropped. With `^[1-9][0-9]*$` restored the chain goes **RED inside the migration itself**: `trophy-claim (f2): an out-of-range stage overflowed hr_trophy_of's ::int (SQLSTATE 22003)`. So §5(f2) is a real execution, it is non-vacuous, and the count *does* force the cast. `node tests/schema-drift.mjs --mutate` → **exit 0**, `caught trophy_stage_unbounded via replay`, all 16 defects caught. `node tests/selfcheck-no-global-dml.mjs` → **exit 0** (209 migrations, 9 global statements, all 9 acknowledged; **neither new file adds one**, so every DML in §5(f2) is `v_uid`-scoped), `--selftest` → **exit 0**, 16/16 planted defects caught, 5 controls silent. |
| **F2** | the rule written where a ranking author reads it; reservation on the board | **CLOSED** | The binding rule is in **`docs/design/BESTIARY_LADDER.md` §4.3, immediately under the sentence that promises the board** — the paragraph a "trophies claimed" author is reading when they decide what to count — and restated in `2026-09-22-trophy-claim.sql`'s header ("RANK THE JOURNAL"). The lane-C follow-up (`hr_apply` refuses `key like 'trophy:%'`) is on `docs/planning/PRIORITY_BOARD.md:365` with the trigger, the blast radius and why it is not in this lane. That is more than I asked for. **Residual, accepted and unchanged:** the boards themselves dispatch inside `hr_leaderboard__ungated`, which carries no pointer to the rule — writing one there means restating the repo's ranking function, exactly the restatement this lane was right to refuse. |
| **F3** | key ABSENT on 42883, PRESENT otherwise, test red on the always-emit shape | **CLOSED** | `index.ts:787` is `...(trophyRows ? { trophies: claimed } : {})`, and `trophies?:` is now optional at the type level, so the emit site *cannot* silently re-acquire the key. The two savepoints are separate and `42883` **and only** `42883` degrades to `null`. I restored the always-emit shape in the shipped bytes and ran the guard: **exit 1**, `W1: 'trophies' is PRESENT on the 42883 path…` and `W4: after the 42883 path the mirror records hasTrophyKey TRUE`. The assertion ends at the player-visible question, not at a JSON key. `tests/trophy-wire-shape.mjs` → **exit 0**; `--selftest` → **exit 0**, 3 caught by name, control silent. Both emit sites (this one and `trophy-claim.js`'s `PROJECTION_SQL`) drop rather than fake. |
| **F4** | id reaches `playerCombatRolls` on BOTH runtimes; preview == engine at stage 4 (1.1845); in-page assertion stays; one-sided mutation red | **CLOSED** | Computed independently of the lane's guard on a monster carrying the 1.15 `NEUTRAL_DROP_BONUS`: `playerCombatRolls` **with** `monsterId` → `1.1844999999999999`, `weaknessInfo(…, id)` → `1.1844999999999999` (equal), **without** it → `1.15`. So 1.15 × 1.03 = **1.1845**, exactly the figure the first review recorded, and the fix is load-bearing rather than cosmetic. Both runtimes carry it: `src/legacy.js:2780` (client) and `hr-accrue/accrual.js` `playerRolls(m)` via `monsterIdIn(monsters, m)` — resolved by identity from the sealed catalogue, never from a row field or the request, so no new client-authored value. `combatCtx` still carries no id, correctly. **One-sided mutation, on the shipped bytes, each reverted after:** dropping it in `legacy.js` → **exit 1** (`C1` + `C2`); dropping it in `accrual.js` → **exit 1** (`C2` + `C3`, `C3` being the damage arm). The in-page assertion at `src/features/smoke/hunt-raids-and-screens.js:2049-2050` **stays, untouched** (the file is not in the lane's diff). `tests/trophy-call-sites.mjs` → **exit 0**; `--selftest` → **exit 0**, 3 caught by name, control silent. **F5 closes with it**: `maxHit` is rolled from this path and `C3` requires the stage to reach the roll, so `TROPHY_DAMAGE_ARM_ENABLED` now names an effect the plumbing can pay. |

**Nothing else moved.** `tests/live-hash-drift.baseline.json` and `RESIDUE_FIELDS`
(`src/net/client-state.js`) are untouched on the lane (empty diff) — correct, the
baseline is Coordinator-only. No test was weakened: the only change to
`tests/bestiary-trophy.mjs` is +8 lines of comment recording that its T6 arm passes
the id itself and is therefore structurally blind to a caller that does not. The
expected-red review artifact `tests/sec-bestiary-trophy-proofs.mjs` is **deleted**
and its `guards-unregistered.json` debt entry removed in the same commit, which is
what I asked for; `guard-hygiene` is green on that. No version bump, no CHANGELOG —
correct, the cut is the Coordinator's.

## R2. Guards, on real exit codes

| Command | Exit | Last line |
|---|---|---|
| `node tests/bestiary-ladder.mjs` | **0** | green — 108 monsters, 4 stages, every bonus inside the band |
| `node tests/bestiary-trophy.mjs` | **0** | green — the ladder derives its own multipliers inside the stated ceilings… |
| `node tests/bestiary-trophy.mjs --selftest` | **0** | every mutation caught by its named assertion, every negative control silent — non-vacuous |
| `node tests/trophy-wire-shape.mjs` | **0** | green — the trophies key is ABSENT when hr_trophy_of did not answer and PRESENT otherwise… |
| `node tests/trophy-wire-shape.mjs --selftest` | **0** | all 3 planted defects caught by name, the negative control silent |
| `node tests/trophy-call-sites.mjs` | **0** | green — both shipped seams pass the monster id… (×1.2200349999999998 at stage 4, charm × trophy) |
| `node tests/trophy-call-sites.mjs --selftest` | **0** | all 3 planted defects caught by name, the negative control silent |
| `node tests/schema-drift.mjs` | **0** | repo rebuilds to the committed fingerprint (`8a0ec72d37c8…`) |
| `node tests/schema-drift.mjs --mutate` | **0** | all 16 planted defects caught (incl. `trophy_stage_unbounded via replay`) |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 209 migrations, 9 global statement(s), all 9 acknowledged |
| `node tests/selfcheck-no-global-dml.mjs --selftest` | **0** | all 16 planted defects caught, 5 controls silent |
| `node tests/accrual-engine.mjs` | **0** | full fixture set green |
| `node tests/delta-transport.mjs` | **0** | delta-transport guard — GREEN |
| `node tests/apply-order-honesty.mjs` | **0** | 30 file(s) carry a measured verdict… every note agrees with the live-hash baseline |
| `node tests/world-tick-parity.mjs` | **0** | parity fixtures green |
| `node tests/guard-hygiene.mjs` | **0** | PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs |
| `node tests/ci-shape.mjs` | **0** | run-ci-local --list enumerates the whole matrix |
| `node tools/derive-grant-hygiene.mjs --check` | **0** | derivation in sync (**11 links, 12 patches**) |
| `node tools/pack-edge.mjs hr-accrue --check` | **0** | 78 files (47 vendored), 1767.7 KB |
| `node tools/lane-done.mjs` | **0** | **lane-done: all green.** |
| `node tests/live-hash-drift.mjs` (replay half) | **1** | **RED BY DESIGN — exactly two bodies move.** See §R3. |

`npm install --no-audit --no-fund` was run in this worktree (a registry install, not a
purchase; the 2026-08-17 budget freeze is untouched).

## R3. ⚠ THE §5 AND §6 FIGURES HAVE MOVED — USE THESE, NOT THE ONES ABOVE

`2026-09-21-engine-allowlist-tick-settle.sql` **applied to production on 2026-09-22
21:26 UTC**, after the first review was written. The detector's live body moved with
it, so **query (9b) as written in §5 above is now a false STOP.** The baseline
(`live_measured: 2026-09-22`) records what production actually holds:

| Function | Production holds today (normalised md5 / length) | Repo rebuilds to, after both applies |
|---|---|---|
| `hr_assert_grant_hygiene(p_strict boolean)` | `04bb41b05e0d05181c7e5bcab8522ad2` / **29451** | `5c39579b8ab9f609cfe863ca9ad3dbcb` / **31838** |
| `hr_state_of(p_user uuid, p_slot integer)` | `50913bae9c63bd8b7984fcdd30e5d1b4` / **29802** | `5527d069e857db9cb653445d12b239d7` / **30524** |

The old §6 figures (`638425ee…`/26804 and `18004554…`/29191) are **superseded**.

And the restatement itself is now **safer than when I first reviewed it**: §4b was
regenerated on the `set/b551` merge and the restated `c_engine_allow` carries
**23 entries**, head-insertion only — the two trophy functions **on top of**
`hr_tick_settle(text,uuid,integer,text,bigint,timestamptz,timestamptz,uuid,jsonb)`.
So the apply no longer reverts the 2026-09-21 allowlist that is live. That was the
b484–b487 risk I flagged in §3; it is closed for this apply, and query (9) below is
still the read that keeps it closed.

After both applies: **exactly two baselined bodies move** (the two above) and the
baseline grows **50 → 52** — the two added names must be exactly `hr_trophy_of` and
`hr_trophy_claim`. A third moved body means something unreviewed rode along: stop and
read it. `restore-census`: no new table; re-run and confirm the count is unchanged
rather than assuming it.

## R4. COORDINATOR RUNBOOK

**Pre-apply, read-only:** run §5's queries (1)–(5) before file 1, (6) before **and**
between, (7)–(11) before file 2 — **with (9b)'s expected value replaced by
`04bb41b05e0d05181c7e5bcab8522ad2` / 29451** per §R3. A mismatch on (9a) or (9b) is
still a STOP.

**Apply — one file per call, never inside `begin/commit`, never 00:00–00:10 UTC, and
the order is not interchangeable** (file 2's §0 refuses to install without file 1):

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-22-state-of-trophy-prefix.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-22-trophy-claim.sql
```

**Expected self-check output.** File 1, in order:

```
NOTICE:  hr_state_of patched: the trophy population leaves the generic envelope
NOTICE:  state-of trophy prefix PASSED: trophy keys are excluded from BOTH the progress array and its truncation flag, the collection-log milestones and ordinary stats still ride, the bestiary and collection exclusions survived, and no grant moved
```

(`hr_state_of already excludes trophy:% — patch skipped` is the **re-apply** line and
is correct on a second run only. Seeing it on the FIRST apply means the namespace was
already patched by something else: stop.) File 2:

```
NOTICE:  trophy-claim PASSED: hr_engine-only and absent from the client baseline, an unknown monster and a below-threshold claim refused with the server's own count, one progress row and one ledger row per trophy, already_owned and replayed kept apart, no currency no item no xp and no accrued_to movement, an out-of-range stage dropped rather than cast, and the projection scoped to its owner
```

The **`an out-of-range stage dropped rather than cast`** clause is F1's proof landing
on production. If it is absent, an old copy of the file was applied: stop.

**Post-apply, read-only verification** (the read-only agent, not the applier):

```sql
select public.hr_assert_grant_hygiene(true);                                     -- every array empty, no raise
select count(*) from public.hr_client_rpc_baseline where proname like 'hr_trophy%';  -- 0
select has_function_privilege('hr_engine',     'public.hr_trophy_of(uuid,integer)','execute') as of_engine,   -- t
       has_function_privilege('authenticated','public.hr_trophy_of(uuid,integer)','execute') as of_auth,     -- f
       has_function_privilege('anon',         'public.hr_trophy_of(uuid,integer)','execute') as of_anon,     -- f
       has_function_privilege('service_role', 'public.hr_trophy_of(uuid,integer)','execute') as of_svc;      -- f
select has_function_privilege('hr_engine',     'public.hr_trophy_claim(uuid,integer,text,integer,text)','execute') as cl_engine, -- t
       has_function_privilege('authenticated','public.hr_trophy_claim(uuid,integer,text,integer,text)','execute') as cl_auth,   -- f
       has_function_privilege('anon',         'public.hr_trophy_claim(uuid,integer,text,integer,text)','execute') as cl_anon,   -- f
       has_function_privilege('service_role', 'public.hr_trophy_claim(uuid,integer,text,integer,text)','execute') as cl_svc;    -- f
select count(*) from public.player_progress where key like 'trophy:%';           -- 0 (nobody has claimed yet)
select count(*) from public.player_ledger   where intent = 'trophy_claim';       -- 0 (F2's ranking population)
-- the F1 class, read against the INSTALLED body rather than the file:
select pg_get_functiondef('public.hr_trophy_of(uuid,integer)'::regprocedure)
       like '%[1-9][0-9]{0,2}%' as stage_class_bounded;                          -- t
-- the tick-settle allowlist entry SURVIVED the §4b restatement (see §R3):
select pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure)
       like '%hr_tick_settle%' as tick_settle_still_allowed;                     -- t
```

Every query in this block was **executed against the replayed chain** before it was
written here — all eight return the documented answer, `hr_assert_grant_hygiene(true)`
included (all nine arrays empty, no raise). A runbook nobody ran is a runbook.

**Then:** `node tests/live-hash-drift.mjs --live --write` (expect **only** the two
moves in §R3's right-hand column, baseline 50 → 52), whys written from `--codediff`;
flip both `tests/schema-apply-order.json` notes to APPLIED; `restore-census` re-run and
confirmed unchanged. `node tests/apply-order-honesty.mjs` must stay exit 0 afterwards.

**Edge deploy** (`supabase/functions/**` moved — F3 is in `index.ts`, F4 in
`accrual.js`), and it belongs to the **client-half release**, not to the applies:

```
node tools/pack-edge.mjs hr-accrue --hash
→ df0db01bc12406451840bccb0809668b65e293adf5328ac5477359a362f71009
```

Verify the live `payload_sha256` equals that after deploy. `pack-edge` strips `?v=`
from vendored specifiers, so the daily cut's cache-buster bump does **not** move this
hash — but re-measure `--hash` on the exact commit deployed rather than trusting this
line, since any further code change to the 78 packed files will.

## R5. Residual risks I am accepting (unchanged, plus one)

Everything in §10 stands. Added: **the "trophies claimed" rule is written in the design
doc and the migration header, not enforced by the database** — the `hr_apply` key
reservation is the lane-C follow-up on the board, and until it lands a compromised Edge
could author a trophy row with no ledger row beside it. Self-scoped, mints nothing,
crosses to nobody, and closed for ranking purposes by the binding rule.
