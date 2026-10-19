# Security review — migration self-check scope, and the companion-XP writer (b550, 2026-09-20)

**Reviewer:** security-engineer · **Branch:** `sec/b550-selfchecks-and-pet-xp`, cut from `set/b550` at `f2f8d7ab`
**Subjects:** `f96ce922` *fix(migrations): a self-check may not delete a row it did not create* ·
`7ce3b274` *fix(companions): arm the server writer*

| | Verdict |
|---|---|
| **1 — self-check scope (blocks the production re-apply)** | **GO-WITH-CHANGES** |
| **2 — companion XP credit surface (blocks the client ship + edge deploy)** | **GO-WITH-CHANGES** |

No production or database access in this session, and none was used: every claim below is either
read from the tree or **measured by executing the real migration chain** against PGlite
(`tests/schema-replay.mjs bootReplay`). Where a claim is measured it says so and names the run.
Two proof files were added — `tests/lifetime-facts-reapply.mjs` (green) and
`tests/selfcheck-no-global-dml.bypass.mjs` (**expected red**, 10/10). No lane code was changed.

> The brief names `docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md` as the naming model. That
> file does not exist in the repo or anywhere in its history — the only prior verdict doc is
> `SEC_FIGHT_CARRY_2026-09-16.md`, whose `SEC_<TOPIC>_<DATE>.md` shape this follows.

---

# VERDICT 1 — `f96ce922` · **GO-WITH-CHANGES**

The central claim of the commit is **true and now proved**: neither rewritten self-check can
delete, prune or roll up a `player_ledger` row belonging to anyone but its own probe characters,
on any branch, on a production journal with real aged rows and the immutability trigger armed.
The 2026-09-20 defect is closed at the statement level and the replay can now see the class.

Three things must land before this is a GO, and only one of them touches the apply:

* **S-LF-1** — 2026-09-19's own §6 still calls a **globally-writing function** twice inside its
  gates. No player value moves and it all rolls back, but it is the same rule one level down, and
  it is invisible to the new guard. *(Fix before the apply, or acknowledge it in writing.)*
* **S-SC-1** — the new standing guard sees **one** shape. Ten others slip, including the one
  already in the tree. *(Fix before the class is called closed; not an apply blocker.)*
* **S-LF-3** — `2026-09-19-lifetime-facts-off-the-ledger.sql` is **one-shot on production**. The
  apply-order note must say so. *(Measured; §"Apply order" below.)*

---

## (a) Can the rewritten self-checks touch a row that is not a probe row?

### Deletes, prunes and roll-ups — **no. CONFIRMED closed.**

| Statement | File:line | Owner-bound? | Backstop |
|---|---|---|---|
| `delete … where user_id = v_uid and slot = v_slot and intent = 'probe_in_window'` | `2026-09-19-lifetime-facts-off-the-ledger.sql:700` | yes — `v_uid` | fail-closed, below |
| `delete … where user_id in (v_uid, v_uid2) and at < v_cut` | `2026-09-19-…:725` | yes — `v_uid`, `v_uid2` | `GATE(a5)` bystander canary :731 |
| `perform public.hr_ledger_prune(20000)` ×3 | `2026-09-18-ledger-rollup-currencies.sql:313,355,369` | **no — global by construction** | `(b0)` widening :276 + `(e0)` refusal :281-286 + `(e10b)` canary :343-348 |

`hr_ledger_prune`'s own predicate is `at < now() - retain_days` with no owner column
(`2026-08-11-player-state.sql:504-527`), so 2026-09-18 cannot avoid calling something global — the
function *is* the subject. Its answer is the right one: widen `hr_ledger_config.retain_days` to the
table's own `check` ceiling of 3650, **refuse the apply** if any real row predates that window, date
the probe rows beyond it, then call the prune unmodified. The reach is narrowed; the code under
test is not.

**The exception paths hold.** Both blocks are `begin … exception when others` subtransactions
closed by a sentinel raise (`HR_ROLLBACK_SENTINEL` at `2026-09-19-…:840`, `HR918_ROLLBACK_OK` at
`2026-09-18-…:386`), so PL/pgSQL rolls back every statement in them on success *and* on failure.
The two narrower handlers are fail-closed in the safe direction:

* `(a-pre)` `2026-09-19-…:700-707` catches only `check_violation`. A trigger that raised anything
  else, was dropped, or matched zero rows all leave `v_armed` false and **refuse the apply** — the
  gate cannot be silently satisfied.
* `GATE(c2)` `2026-09-19-…:803-811` re-raises its own `GATE(c2)%` and demands the literal
  `REFUSING`, so a constraint violation cannot masquerade as the intended refusal.

**Measured.** `node tests/schema-drift.mjs` is green with the new `BYSTANDERS` seed
(`tests/schema-drift.mjs:391-398`) — two rows for a user no migration knows about, one inside the
retention window and one outside it — and its three new mutation arms (`selfcheck_global_prune`,
`selfcheck_silent_prune`, `selfcheck_global_prune_fn`) restore the 2026-09-19 statement and are
caught. I re-measured independently with a richer production-like bystander (a character with
aged combat, hearthfind and bounty ledger rows): every seeded row survives the chain.

### Updates and re-dates — **yes, one, and the guard cannot see it.**

> ### S-LF-1 · a self-check calls a globally-writing function · CONFIRMED · MEDIUM
> `2026-09-19-lifetime-facts-off-the-ledger.sql:654` and `:661`
>
> `hr_backfill_lifetime_facts()` (`:247-334`) is global by construction, exactly like
> `hr_ledger_prune`, but it writes rather than deletes:
>
> * step **(2)** `insert into public.hearthfind_ordinal … select item_id, max(nth_ever) from
>   public.hearthfind_log group by item_id on conflict (item_id) do update set found_total =
>   greatest(…), updated_at = now()` — **every trophy row in the global counter table**;
> * step **(3)** `insert into public.player_progress … select l.user_id, l.slot, 'stat',
>   'bounty_turnins', count(*) … on conflict … do update set value = greatest(…), updated_at =
>   now()` — **every real character that has ever turned in a bounty**. `player_progress` is a
>   `player_value_tables` member (`tests/restore-census.baseline.json`).
>
> §2 runs it once as the file's legitimate WORK (`:342`) and that commits. §6 then runs it **twice
> more inside the gates** — once for `GATE(backfill)` and once for `GATE(c)`'s idempotency proof.
>
> **What does NOT happen:** no player's value moves. Step (1) is `on conflict … do nothing`, steps
> (2) and (3) are `greatest()`, and the whole block rolls back at `HR_ROLLBACK_SENTINEL`. I could
> not construct a committed change and do not claim one.
>
> **What does happen:** every one of those rows is UPDATEd and `updated_at`-re-dated inside the
> transaction, which is precisely what this commit's own rule forbids — *"a self-check must not
> touch a row it did not create, **rolled back or not**"* (`2026-09-19-…:135`,
> `tests/selfcheck-no-global-dml.mjs:32`). It also extends the transaction that already holds §2's
> row locks on `hearthfind_ordinal` — the hot global counter `hr_apply` upserts on every find — by
> two further full-table passes, which is live-traffic hold time on an apply that is not scheduled
> for a quiet window.
>
> **Required change (either is sufficient):**
> 1. give `hr_backfill_lifetime_facts()` an optional `p_user uuid default null` scope and pass
>    `v_uid` from §6, leaving §2's call unscoped; **or**
> 2. do for it exactly what (b0)/(e0)/(e10b) did for the prune — take a bystander canary over
>    `player_progress … key='bounty_turnins'` and `hearthfind_ordinal` before the first call and
>    re-read it after the second, assert `updated_at` did not move for `user_id <> v_uid/v_uid2`,
>    and add a `scoped-by-proof` entry to `ACKNOWLEDGED` in `tests/selfcheck-no-global-dml.mjs`
>    carrying those `proof` strings — so the waiver cannot rot.
>
> Option 2 is the cheaper one and matches the pattern the lane has already established.

> ### S-LR-2 · the bystander canaries are blind to a NULL owner · PLAUSIBLE · LOW
> `2026-09-19-…:641`, `:728` (`user_id not in (v_uid, v_uid2)`) and `2026-09-18-…:272-274`, `:343-345`
> (`user_id <> v_u`).
>
> Both are three-valued: a `player_ledger` row with `user_id is null` makes the predicate NULL and
> is excluded from **both** the before and the after count, so such a row could be deleted with the
> canary reporting no change. In 2026-09-19 the scoped delete itself would not take it
> (`user_id in (…)` is equally NULL-blind, in the safe direction), so only the canary is blind. In
> 2026-09-18 `hr_ledger_prune` has **no owner predicate at all** and would take it, while `(e0)`'s
> `user_id <> v_u` would not have counted it.
>
> `player_ledger.user_id` is `not null` on the repo chain, so this is unreachable today and I am not
> claiming otherwise. It is one column-default away from being real, and the fix is free:
> `user_id is distinct from v_u` / `coalesce(user_id, '00000000-…'::uuid) not in (…)`.

---

## (b) `hr_ledger_config`: is the change restored on every path, and can a concurrent job see it?

**Only 2026-09-18 changes it.** `2026-09-19-…:631` reads `retain_days` and writes nothing.

**Restored on every path — CONFIRMED, structurally and by measurement.**
`update public.hr_ledger_config set retain_days = 3650 where only_row;` (`2026-09-18-…:276`) sits
inside the `begin … exception when others` block at `:204`. PL/pgSQL wraps such a block in an
implicit subtransaction:

* **failure** — any gate raises, the handler at `:388-389` re-raises anything that is not the sentinel,
  and the subtransaction (including the config update) is rolled back before the error leaves the
  file. The apply is atomic on top of that.
* **success** — the block ends by raising `HR918_ROLLBACK_OK` (`:386`) *itself*, which is caught and
  swallowed. The rollback is the same one. There is no path that reaches `commit` with 3650 set,
  and no explicit restore is needed (`v_keep0` is captured for the canary's cut, not to restore).

Measured after a full chain replay: `hr_ledger_config.retain_days = 90`. `node
tests/ledger-rollup.mjs` and `node tests/ledger-rollup.mjs --mutate` are green (exit 0, run in this
worktree with `@electric-sql/pglite` installed).

**No concurrent retention job can see the widened value.** The update is never committed, so under
`read committed` no other transaction's snapshot contains it. `hr_ledger_prune` reads `retain_days`
with a plain `select` (`2026-08-11-player-state.sql:505`) and takes its rows `for update skip
locked` (`:518`), so it neither sees the change nor blocks on the rows the self-check holds. The
file's own comment (`2026-09-18-…:271-275`) is correct as written.

> ### S-LR-4 · the config row is write-locked for the length of the migration · CONFIRMED · LOW
> The `update … where only_row` takes a row lock on the single `hr_ledger_config` row and holds it
> until the migration transaction ends. Any *writer* of that row blocks for that whole time.
> Nothing writes it today (there is no `last_pruned_at` stamp; readers are unaffected), so the
> blast radius is an operator changing retention during the apply. Worth one line in the apply
> note rather than a code change; if `hr_ledger_prune` ever gains a config write, this becomes a
> real stall and the widening must move to a `set local` GUC instead.

---

## (c) Residue

`GATE(z)` (`2026-09-19-…:847-869`) now checks six surfaces, the `player_progress` one added by this
commit:

| Surface | Checked | Predicate |
|---|---|---|
| `hearthfind_log` | ✅ | `user_id in (v_uid, v_uid2)` |
| `hearthfind_ordinal` | ✅ | `item_id like 'probe_%'` — covers `probe_trophy_a`/`_b`/`_race` |
| `player_ledger` | ✅ | `user_id in (v_uid, v_uid2)` |
| `player_progress` | ✅ **(new — correct, and it was a real gap)** | `user_id in (v_uid, v_uid2)` |
| `player_state` | ✅ | `user_id in (v_uid, v_uid2)` |
| `auth.users` | ✅ | `id in (v_uid, v_uid2)` |

**Measured after a full chain replay:** zero rows for `000001f0-…01f0` / `…01f1` in
`player_ledger`, `player_progress`, `hearthfind_log`, `player_state` and `auth.users`; zero
`probe_%` rows in `hearthfind_ordinal`; zero rows for 2026-09-18's `v_u`
(`00000000-0000-4000-c000-00000000f18a`) in `player_ledger` **or `player_ledger_rollup`**.
First-contract facts leave nothing: `hr_bounty_first_contract` is a pure reader (`2026-09-19-…:471-489`).

One asymmetry worth naming rather than a finding: **2026-09-18 has no `GATE(z)` at all.** Its
probe writes `player_ledger` *and* `player_ledger_rollup` rows for `v_u` and relies entirely on the
sentinel rollback, with nothing asserting afterwards that the rollback happened. 2026-09-19 proves
its own rollback; 2026-09-18 believes it. Measured clean today; a six-line leak check would make
it asserted. Recommended, not required.

---

## (d) Did the scoping make any GATE vacuous? — **No.** One control does the work.

`GATE(a4)` (`2026-09-19-…:752-765`) is the answer and it is the right design: after the scoped
delete it re-reads the **ledger-derived** answers and **requires them to have moved** to
`0 / 0 / true`, failing with *"the prune did not bite … gates (a1)-(a3) are vacuous"* otherwise. So
`(a1)`-`(a3)` — trophy set, global ordinal and first-contract unchanged across the prune — still
prove the thing the file exists for. The probe rows are dated `v_cut - 20/30/40 days` against a
`v_cut` derived from the policy in force, so they are outside the window on every date this is
ever applied; the old hard-coded `200 days` would have silently moved *inside* the window the day
retention was raised past 200.

What the scoping genuinely **gave up**, stated plainly: `(a)` no longer exercises
`hr_ledger_prune`, so 2026-09-19 no longer proves that the real retention prune (with its rollup
write and its batch limit) leaves the lifetime facts standing — only that a delete does. That is
an acceptable trade because 2026-09-18 proves the function's own conservation properties against
the same trigger, and the file says so at `:715-720`. It is a trade, not a free win, and the two
files are now load-bearing for each other.

In 2026-09-18 the widening weakens `(e)`/`e13` — "a row one day old is untouched" is a weaker
statement against a 3650-day window than against a 90-day one — but `e14` still proves
`hr_ledger_immutable` refuses that row's deletion, and `e11`/`e12` still prove a second prune is a
no-op over the probe. Nothing became vacuous.

One soft spot: `GATE(c)`'s idempotency proof measures `count(*) from public.hearthfind_log`
**globally** (`:660`, `:662`). On production that count is dominated by real rows, so the equality
still holds and the gate is sound — but it would also be satisfied by a backfill that added and
removed the same number of rows. Scoping it to `where user_id in (v_uid, v_uid2)` costs nothing
and is worth doing alongside S-LF-1.

---

## (e) `tests/selfcheck-no-global-dml.mjs` — **ten shapes slip**

The guard is green (`exit 0`, 202 migrations, 7 acknowledged findings) and its own `--selftest` is
honest: 6 planted defects caught, 3 controls silent. But it reads exactly **one** shape — a literal
`delete`/`update`/`truncate` token, in a top-level `do $tag$` block, whose `where` clause has no
owner column within 90 characters of a declared local. I wrote ten real migration statements that
reach every player's rows and asked it: **all ten come back clean.**

Proof: `node tests/selfcheck-no-global-dml.bypass.mjs` → `10 of 10 global-DML shapes are INVISIBLE`,
exit 1.

> ### S-SC-1 · the standing guard has four bypass families · CONFIRMED · HIGH
>
> | Family | Shape | Why it slips |
> |---|---|---|
> | **A** dynamic SQL | `execute 'delete from public.player_ledger where at < now()'` | `blankLiterals()` (`:108-130`) blanks the inside of every `'…'`. `execute` is the one verb whose literal **is** executed code, and it is the only text the guard is guaranteed not to read. |
> | **A** | `execute format('delete from %I where at < now()', 'player_ledger')` | same, and the table name never appears as a token at all. |
> | **A** | `execute $q$ delete from public.player_ledger $q$` | `blankNested()` (`:134-153`) blanks every nested dollar-quote wholesale. |
> | **B** fake binding | `delete from public.player_ledger where id is not null and at < v_cut` | `isScoped()` (`:186-197`) asks only whether *some* declared name occurs within `BIND_WINDOW`=90 chars **after** *some* owner column. `id` is an owner column (`:99`) and `v_cut` is a declared local, so a blanket prune reads as "scoped to a row I created". |
> | **B** | `delete … where id in (select id from public.player_ledger where at < v_cut)` | the owner column is bound to a subselect over the whole table. |
> | **B** | `hr_ledger_prune`'s own CTE shape inlined: `with doomed as (select id, at … where at < v_cut …) delete … using doomed d where l.id = d.id and l.at < v_cut` | same fake bind; this is the exact statement the acknowledged function runs. |
> | **B** | `update public.player_state s set gold = 0 from public.player_progress p where s.user_id = p.user_id and s.slot = v_slot` | `UPDATE … FROM` across every character; the join column supplies the owner token, `v_slot` supplies the "bind". |
> | **C** wrong verb | `perform public.hr_backfill_lifetime_facts()` — **already in the tree** | pass 1 (`:222`) does `if (verb === 'update') continue;` and never scans `INSERT` at all, so a function that globally UPDATEs — or `INSERT … ON CONFLICT DO UPDATE`s — a player-value table is never added to `globalFns`. This is S-LF-1, and the guard written for this incident cannot see the instance sitting in the file the incident was about. |
> | **C** | a chain function whose body is `update public.player_state set gold = 0`, called from a gate | same line. |
> | **D** wrong container | the same blanket prune inside `create function pg_temp.sc() … ; select pg_temp.sc();` | pass 2 (`:240`) iterates `doBlocks()` only. A self-check that is not a `do $tag$` block is never scanned. |
>
> **Required change**, in the order that buys the most:
> * **C** — class a function global on `UPDATE` and on `INSERT … ON CONFLICT DO UPDATE` over a
>   player-value table, not only on `DELETE`. One line, and it closes the instance in the tree.
> * **B** — require the owner column to be bound by `=` or `in ( … )` **to a local**, and require
>   that no other conjunct widens the reach. `id is not null` is not a binding, and "a local is
>   mentioned somewhere nearby" is not one either.
> * **A** — refuse any `execute` of a non-constant or unreadable statement inside a DO block, or
>   lex the literal as code instead of blanking it. Refusing is the cheaper and safer half.
> * **D** — read every executable body the file installs-and-calls, not only top-level DO blocks.
>
> `tests/selfcheck-no-global-dml.bypass.mjs` is the regression for all four. It is **deliberately
> not registered** in `.github/workflows/smoke.yml` — a red step makes the CI gate unreachable for
> every later build (CLAUDE.md §4, the b512 lesson). Register it in the same commit that turns it
> green, and re-pin `tests/ci-shape.baseline.json` then. It is listed in
> `tests/guards-unregistered.json` with that reason; `node tests/guard-hygiene.mjs` is green.

> ### S-SC-2 · the guard module runs `main()` on import · CONFIRMED · LOW
> `tests/selfcheck-no-global-dml.mjs:547` calls `main()` unconditionally at module scope, with no
> `import.meta.main`-style check, and `main()` ends in `process.exit(1)` when anything is open. Any
> consumer of its exported `scan()`/`verdicts()` therefore runs the whole guard on import and is
> **killed mid-run** if the repo is red. Visible today as the stray
> `selfcheck-no-global-dml: OK — …` line at the top of the bypass proof's output. The guard's own
> `--selftest` lives in the same module, so it never noticed. One-line fix.

> ### S-UM-1 · `utc-midnight-replay.mjs` edits a checked-in migration on disk · CONFIRMED · MEDIUM
> Found by execution, not by reading. `tests/utc-midnight-replay.mjs:182` does
> `writeFileSync(MIGRATION, original.slice(0, at) + PROBE_SQL + original.slice(at))` — planting
> `raise exception 'HRPROBE now=%', now();` **into
> `supabase/migrations/2026-09-01-kill-daily-credit.sql` in the working tree** — spawns a child
> replay, and restores it in a `finally` (`:186-189`, verified byte-for-byte). `:246` does the same
> for its mutation arms.
>
> I observed the window from a second process: a concurrent chain replay read the patched file and
> died with `2026-09-01-kill-daily-credit.sql failed to apply: HRPROBE now=2026-09-20 17:50:40+00`.
> A `finally` does not survive `SIGKILL`, an OOM, or a cancelled CI job, and this commit's sibling
> `7b509de` is actively moving this guard between jobs. The failure mode is a `raise exception`
> left inside a checked-in migration — on the one machine that also runs
> `node tools/apply-migration.mjs`.
>
> **Required change:** plant the probe in a copy (a temp directory the child is pointed at), never
> in the tracked file. Failing that, take an exclusive lockfile for the duration and re-verify the
> restore on `SIGINT`/`SIGTERM`/`exit`. CLAUDE.md §3.3's "one suite at a time on a quiet machine"
> is currently load-bearing for **correctness** here, not just for flake avoidance, and nothing
> says so.

---

## (f) `2026-09-18-retired-iap-catalogue-removal.sql` — **not the same class.** No change needed.

| Test | Answer |
|---|---|
| Does a self-check write? | **No.** §2 (`:192-238`) is `select`-only: eight counting gates, zero DML. |
| What do the deletes touch? | `hr_unlock_offers` and `hr_unlocks` (`:170-177`) — **catalogue** tables, `seeded` class, rebuilt by the repo. Neither is in `player_value_tables`. |
| Scoped? | By explicit natural key — `offer_id in ('iap.remove_ads','iap.offline_boost','iap.starter_bundle')`, `unlock_id in ('entitlement:noAds','entitlement:offlinePlus')`. Five named rows, not a predicate over a range. |
| Self-check or work? | The file's **work**, like the three acknowledged backfills. |
| Cascade into a player table? | No FK anywhere in the database points at either table (measured read-only 2026-09-18, `:165-168`), and no player table stores an `unlock_id` — grepped: zero hits. A player's entitlement grant lives as `player_progress kind='unlock'`, which this file does not touch. |
| Money surface? | §0 (`:149-159`) **refuses the apply** if any of the three offers is priced-and-not-refused. Correct direction. |
| Neighbour damage | `e3`/`e4`/`e5`/`e6` pin the four surviving catalogue counts, `e7` proves no offer is orphaned, `e8` proves `theme:forest` survived. |

The guard reports no finding on this file and that is the correct answer, not a miss.

---

## Apply order, and the pre-apply read-only SQL

> ### S-LF-3 · the 2026-09-19 file is ONE-SHOT on production · CONFIRMED · MEDIUM (process)
> Proved by execution — `node tests/lifetime-facts-reapply.mjs`, green, four properties:
> a second apply is clean while no find is live, and **one** `hearthfind_log` row with
> `src_ledger_id is null` (i.e. one trophy `hr_apply` allocated after the arm) makes every
> subsequent apply fail with
> `hr_backfill_lifetime_facts: REFUSING - hearthfind_log already holds 1 live find row(s)`.
>
> That is the correct, fail-closed direction — finding S-LF-1 from the 2026-09-19 review working as
> designed. But the refusal comes from §2 (`:339-345`), the file's **work**, in a bare
> `do $$ … $$` with **no exception handler and no rollback sentinel**, so it aborts the whole apply
> rather than reading as a gate message. `tests/schema-drift.mjs` replays a chain with no live
> finds and therefore can never state this. **Nothing in the repo says the file is one-shot.**
> Write it into the apply-order note, in the file header, or both.

**Order.** Both files are independent of each other *except* through `hr_ledger_config`, and
2026-09-19's `v_cut` reads whatever retention is committed — so either order works, but apply the
narrower change first so a failure is attributable:

```
1. 2026-09-18-ledger-rollup-currencies.sql        # rollup currencies + the narrowed prune proof
2. 2026-09-19-lifetime-facts-off-the-ledger.sql   # the durable homes + the re-scoped prune proof
```

`2026-09-18-retired-iap-catalogue-removal.sql` is independent of both and may go before, between or
after. `2026-09-19` must still land after `2026-09-08-hearthfind.sql`,
`2026-08-29-bounty-first-contract.sql`, `2026-09-11-bounty-hunter-xp.sql` and
`2026-09-14-hr-apply-restatement.sql`; its §0 fails closed on each.

Per CLAUDE.md §2: one file per `node tools/apply-migration.mjs` call, never inside `begin/commit`,
never during 00:00–00:10 UTC. Given S-LR-4 and S-LF-1 hold write locks on
`hr_ledger_config`, `hearthfind_ordinal` and `player_progress` for the length of the transaction,
prefer a low-traffic window for step 2 even though nothing formally requires one.

**Pre-apply read-only SQL.** All five are cheap and all five answer a gate that would otherwise
fail the apply for a reason that is not a defect:

```sql
-- 1. S-LF-3: is the 2026-09-19 file still appliable at all? Must be 0 rows / relation absent.
--    ANY row here means a trophy has already been allocated live and §2 will refuse the apply.
select to_regclass('public.hearthfind_log') as hearthfind_log_exists,
       (select count(*) from public.hearthfind_log where src_ledger_id is null) as live_finds;

-- 2. 2026-09-18 (e0): does ANY real ledger row predate the widened 3650-day window?
--    Non-zero REFUSES the apply. Run it first so that is a decision, not a surprise.
select count(*) as rows_past_3650d
  from public.player_ledger
 where at < now() - interval '3650 days'
   and user_id is distinct from '00000000-0000-4000-c000-00000000f18a'::uuid;

-- 3. The retention policy both files derive their cut from, and the canary's size.
select c.retain_days,
       (select count(*) from public.player_ledger
         where at < now() - make_interval(days => coalesce(c.retain_days, 90))) as prunable_tail
  from public.hr_ledger_config c;

-- 4. S-LR-2 / the canaries' blind spot: must be 0, and must be 0 for the NOT NULL reason.
select count(*) as null_owner_ledger_rows from public.player_ledger where user_id is null;
select is_nullable from information_schema.columns
 where table_schema='public' and table_name='player_ledger' and column_name='user_id';

-- 5. S-LF-1's blast radius, so the hold time on the apply is a known number rather than a guess.
select (select count(*) from public.player_progress
         where kind='stat' and key='bounty_turnins' and period_key='') as progress_rows_touched,
       (select count(*) from public.player_ledger
         where kind='hearthfind' and item_id is not null)                as finds_to_backfill;
```

Expected: (1) `null` / 0 · (2) `0` · (3) `90`, and a `prunable_tail` of 0 until ~2026-11-21 ·
(4) `0` and `NO` · (5) informational. **A non-zero (1) or (2) is a stop, not a warning.**

---

# VERDICT 2 — `7ce3b274` · **GO-WITH-CHANGES**

**The credit surface is closed. I found no path by which a client influences companion XP.** Every
input to the grant is read server-side inside the accrual transaction, the op is emitted by the
engine and applied by an RPC no client role can execute, and the client's own writer is gated off
twice over. The required changes are a comment sweep and an observability line — neither changes
behaviour, and I am not claiming either is an exploit.

## The chain, input by input

| Question | Answer |
|---|---|
| **Where does the equipped companion id come from?** | `player_state.companion_equipped`, read by `hr_perks_of` (`2026-08-20-companion-model.sql:201`) and handed to the engine as `inp.perks.companion.id` (`hr-accrue/accrual.js:853-865`). Written **only** by `hr_companion_equip`, behind `auth.uid()`, a 30/hour rate gate, a `pg_advisory_xact_lock` on the same key `hr_apply` takes, a `for update` row lock, and an **ownership gate** — `player_progress kind='unlock' key='companion:<id>' value > 0`, or the grammar-owned starter `fox` (`:311-321`). A forged id with no unlock row is refused **by name** and journalled to `hr_rejections`. |
| **Where does the activity come from?** | `st.active_kind` / `st.active_id` on the state row, never the request body (`index.ts:975-989`, `set-activity.js:925-940`). |
| **Where do the action counts come from?** | The engine's own finished summary — `summary.kills` (`accrual.js:2581`) and the gather/artisan `companionActions` counters (`:3394`, `:3825`). |
| **Where does `currentXp` come from?** | `coalesce(sum(pp.value), 0)` over `player_progress kind='stat' key='companion_xp:<id>' period_key=''`, in the same transaction (`2026-08-20-companion-model.sql:203-207`). |
| **Can the client reach `hr_perks_of`?** | No. `revoke … from public, anon, authenticated, service_role`, `grant … to hr_engine`, asserted by that file's own §4(a). |
| **Can the client reach `hr_apply`?** | No — `postgres`/`hr_engine` only (confirmed live in `SEC_FIGHT_CARRY_2026-09-16.md` §1). `p_delta.progress` is not a client-reachable surface. |
| **Per-call clamps** | `c_max_progress_ops = 64` ops per delta and `0 <= add <= c_max_progress_add` (1,000,000), refused not clamped (`2026-09-14-hr-apply-restatement.sql:316-317, 1240-1262`). `kind` is allowlisted; `key` is 1–64 chars; `state` cannot be `claimed`. |
| **The XP cap** | `companionSpanXp` clamps to `COMPANION_XP_CAP - currentXp` (`src/core/companion-xp.js:145-149`), = `companionXpToReach(30)` = 792,783. `companionLevelFromXp` iterates down from `COMPANION_MAX_LEVEL`, so level is bounded at 30 whatever the row says — an overshoot is **worth nothing**. Floored to integer, deliberately under-paying <1 XP per settle for a 0.5/action utility pet, because `player_progress.value` is `bigint` and a fractional `add` would raise `invalid_text_representation` and cost the player the night. |
| **Per-day clamp** | **None, and none is needed.** Unlike combat XP (`hr_combat_xp_credit_log`) and kill credit (`hr_kill_credit_log`), companion XP has no daily ledger — its only bound is the lifetime cap. That is adequate: the worst case is reaching level 30 sooner, and level 30 is the ceiling on every magnitude. Recorded as an accepted residual, not a finding. |
| **Idempotency on settle replay** | Inherited, and sound. `hr_apply` requires `p_intent_id` (`:716`), keys `player_intents` on `(user_id, intent_id)` and **returns the cached result on a replay** (`:813-814`), takes `pg_advisory_xact_lock` per character (`:764`), refuses a stale caller with `version_conflict` (`:889`), and clamps the span with `v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued))` (`:2288`). A replay with the same key grants nothing; a fresh key over an already-accrued span sees `actionCount = 0` and `companionXpOps` returns `[]`. Same posture as gold and skill XP — companion XP adds no new replay surface. |
| **Attended vs away parity** | Identical by construction: one emitter (`companionXpOps`) called from the three shared builders, `companionSpanXp` is pure arithmetic over the finished summary and **draws no rng**, so appending it moves no seeded roll (AWAY-1). The arm is threaded field-for-field into both inputs — `index.ts:979` (away) and `set-activity.js:936` (attended collect) — which is the A14 mirror rule that already caught two of these. Measured: `node tests/companion-xp.mjs` green, *"both-path totals identical (combat 14854, gather 9090, artisan 11365 xp attended == away)"*, with the disarmed negative control emitting nothing. |
| **A `companion_xp` op for a pet the player does not own / has not equipped** | Cannot be constructed. The key is `'companion_xp:' + inp.perks.companion.id`, and `companionSpanXp` returns 0 for any id not an own-property of the `COMPANIONS` catalogue (`companion-xp.js:135`), so a junk id yields no op even if `companion_equipped` somehow held one. `hr_apply` itself does **not** cross-check the key against `player_state.companion_equipped` — it validates `kind`, key length, `state` and `add` only. That is acceptable because the only caller is the engine, but it means the whole defence is "`hr_apply` is not client-executable". Named as a residual below. |
| **Journal row per grant** | **No dedicated row, by existing design.** `hr_apply` writes one `player_ledger` row per apply and records `progress` as a **key name only** in `meta.k`, with the authoritative record left in `player_progress` (`:2495-2542`, and the rationale at `:2469-2492` — the `game_events` lesson, 1.6M rows / 229 MB from six players in four days). Companion XP is not a new exception; it is the same treatment as every bestiary, collection and goal counter, and it is not a tradeable or directly-rankable value. See S-PX-2 for what this does cost. |
| **Does pet level feed a ranked or tradeable surface?** | **Not directly.** `hr_lb_boards()` is `renown, total_level, combat_level, wealth, bosses, clan_power` + 17 skills (`2026-08-08-leaderboards.sql:125`); none reads `companion_xp` or `companion_equipped`. `hr_renown_of` is derived from skills, bestiary bosses, aggregate kills and collections — grep for `companion` in `2026-08-20-renown.sql` returns one hit, a documentation string. **Indirectly, yes:** a levelled pet's passive raises combat magnitudes → kills → skill XP → `combat_level` / `renown` / the skill boards. That is ordinary progression and it crosses no forged value: the pet level is server-computed from server-owned inputs end to end, and the combat sim is server-authoritative. It is a balance question for the game-designer, not a security one. |

## Required changes

> ### S-PX-1 · fifteen comments now assert the opposite of the shipped truth · CONFIRMED · LOW severity, required before the edge deploy
> This bug's root cause was a stale comment. `src/features/companions.js` told every reader *"while
> false the client awards companion XP locally exactly as before"* long after `blobRetired()`
> became the literal `true`, so the arm switch looked like a safe no-op when it was in fact the
> only remaining writer — and every pet in the game sat at level 1 until Paione reported it
> **twice**. The commit fixes that comment and the header in `src/core/companion-xp.js`, and leaves
> fifteen more saying the same false thing, **eleven of them in the bundle being deployed**:
>
> | File | Lines |
> |---|---|
> | `supabase/functions/hr-accrue/index.ts` | `75`, `77` (*"False → the engine emits no companion_xp op; the client keeps awarding"* — the exact false claim), `976`, `977` |
> | `supabase/functions/hr-accrue/accrual.js` | `140`, `833`, `842`, `1277`, `2579`, `3223`, `3392`, `3583`, `3822` |
> | `supabase/functions/hr-accrue/set-activity.js` | `44`, `933` |
> | `src/net/accrue.js` | `2431`–`2434` (*"G.companions is CLIENT-authored today (dormant) — the client awards XP, equips, and unlocks locally"*), `2440` (*"the XP writer, b434, is still dormant"*) |
>
> A text edit in files the lane is already touching, with no behavioural risk. It is required
> because this is the root-cause class, in the same subsystem, in the same week — not because
> comments are normally a security gate. **If the Coordinator lands it as an immediate follow-up
> instead, the security verdict does not change.**

> ### S-PX-2 · companion XP is invisible to `vitals.mjs` · CONFIRMED · MEDIUM (observability)
> CLAUDE.md §3.4: *"A feature at zero for two days is a P1 by definition."* Companion XP has been
> at zero **since it shipped**, and the only reason anyone knows is that a player said so twice.
> Nothing in `tools/vitals.mjs` counts it, and because progress ops are journalled as a key name
> only (above), the `player_ledger` cannot answer it either.
>
> This is cheap to close without a new ledger row — `player_progress` carries `updated_at`:
>
> ```sql
> select date_trunc('day', updated_at)::date as day,
>        count(*) as pets_credited, sum(value) as xp_total
>   from public.player_progress
>  where kind = 'stat' and key like 'companion_xp:%' and period_key = ''
>    and updated_at > now() - interval '7 days'
>  group by 1 order by 1 desc;
> ```
>
> **Required before the release note**, not before the deploy: shipping the arm without a way to
> see it working repeats the exact failure the arm is fixing.

> ### S-PX-3 · a revoked companion keeps earning and keeps paying · PLAUSIBLE · LOW
> `hr_perks_of` reads `player_state.companion_equipped` and does **not** re-check the
> `companion:<id>` unlock row (`2026-08-20-companion-model.sql:201-207`). Ownership is verified at
> equip time only. No revoke path exists today — nothing deletes a `player_progress kind='unlock'`
> row, and `2026-09-18-retired-iap-catalogue-removal.sql` removes catalogue rows, not grants — so
> this is unreachable and I am not claiming otherwise. It becomes real the day a refund, a
> chargeback or a purchase-rollback lands. The fix, when that day comes, is one `exists` in
> `hr_perks_of` with a fail-safe of "not equipped".

---

# Findings

| # | Surface | File:line | Status | Severity | Blast radius | Required change | Would a test have caught it? |
|---|---|---|---|---|---|---|---|
| **S-SC-1** | the new standing guard | `tests/selfcheck-no-global-dml.mjs:108,134,186,222,240` | CONFIRMED | **HIGH** | every future migration — the class is closed for two files and open for the rest | close families A–D; register `selfcheck-no-global-dml.bypass.mjs` in the same commit | no — added: `tests/selfcheck-no-global-dml.bypass.mjs` (red, 10/10) |
| **S-LF-1** | 2026-09-19 §6 | `…lifetime-facts-off-the-ledger.sql:654,661` | CONFIRMED | MEDIUM | every real character's `player_progress` + every `hearthfind_ordinal` row, updated and re-dated in-transaction; rolled back, no value moves | scope the backfill to `v_uid`, **or** add the bystander canary + an `ACKNOWLEDGED` entry with `proof` | no — S-SC-1 family C is exactly why |
| **S-UM-1** | the replay harness | `tests/utc-midnight-replay.mjs:182,246` | CONFIRMED | MEDIUM | a `raise exception` left inside a tracked migration on the machine that applies to production | plant the probe in a copy, not the tracked file; lock + restore on signals | no — observed by running two replays at once |
| **S-LF-3** | 2026-09-19 apply process | `…lifetime-facts-off-the-ledger.sql:339-345` | CONFIRMED | MEDIUM | a re-apply aborts once any trophy is live; nothing in the repo says so | write the one-shot fact into the apply-order note and the file header | no — added: `tests/lifetime-facts-reapply.mjs` (green) |
| **S-PX-2** | companion XP observability | `tools/vitals.mjs` | CONFIRMED | MEDIUM | a dead feature stays invisible until a player reports it twice | add the `player_progress` companion-XP line to vitals | no |
| **S-PX-1** | stale arm comments | `index.ts:75,77,976,977` · `accrual.js:140,833,842,1277,2579,3223,3392,3583,3822` · `set-activity.js:44,933` · `accrue.js:2431-2434,2440` | CONFIRMED | LOW | the documented root-cause class of this very bug | update them with the arm | n/a |
| **S-LR-4** | `hr_ledger_config` row lock | `2026-09-18-…:276` | CONFIRMED | LOW | an operator changing retention blocks for the apply | one line in the apply note | n/a |
| **S-SC-2** | guard module side effect | `tests/selfcheck-no-global-dml.mjs:547` | CONFIRMED | LOW | a consumer of `scan()` is killed mid-run when the repo is red | guard `main()` behind an entry-point check | no |
| **S-LR-2** | canary NULL-blindness | `2026-09-19-…:641,728` · `2026-09-18-…:272-274,343-345` | PLAUSIBLE | LOW | unreachable today (`user_id` is `NOT NULL`) | `is distinct from` / `coalesce` in the four predicates | pre-apply SQL #4 |
| **S-PX-3** | revoked companion | `2026-08-20-companion-model.sql:201-207` | PLAUSIBLE | LOW | unreachable today (no revoke path exists) | re-check ownership in `hr_perks_of` if a revoke path ever lands | n/a |

# Residual risks accepted

1. **`hr_apply` does not cross-check a `companion_xp:<id>` op against the equipped companion.** The
   whole defence is that `hr_apply` is executable by `postgres`/`hr_engine` only. That is the same
   line `fight` carry rests on and it is asserted by `tests/live-settlement.mjs`'s sqlGuard; it is
   named here so it is a decision, not an assumption.
2. **Companion XP has no per-day ceiling.** Bounded only by the 792,783 lifetime cap, above which
   level is pinned at 30 and every magnitude stops moving. Accepted.
3. **Pet level reaches the boards indirectly**, through combat strength → kills → skill XP →
   `combat_level`/`renown`. Server-computed end to end; a pacing question, not an integrity one.
4. **2026-09-19 no longer exercises `hr_ledger_prune`.** The two files are now load-bearing for
   each other; if 2026-09-18's gates are ever weakened, 2026-09-19's `(a1)`-`(a3)` lose their
   connection to the real retention prune.
5. **2026-09-18 has no `GATE(z)`.** Its rollback is believed rather than asserted. Measured clean;
   a leak check would make it proved.
6. **Nothing here was verified against production.** No session access, by design. Everything
   marked "measured" was measured against the repo's own chain replay, which is the schema — not
   the live row population. The pre-apply SQL above is what closes that gap.

---
---

# RE-VERIFY 2026-09-20

**Reviewer:** security-engineer · **Branch under review:** `lane/b550-sec-changes` @ `edf6d5cd` (= `next`)
**Diff read:** `git diff f2f8d7ab..edf6d5cd` — 19 files, +1770/−130, every hunk read.
**Claimed commits:** `9d1ec0a9`, `3c14c8d4`, `56ef7e72`, `c38d177a`, `2be3cda3`, `edf6d5cd`.

| | FINAL verdict |
|---|---|
| **1 — self-check scope (the production apply)** | **GO** |
| **2 — companion XP credit surface (the edge deploy + the client ship)** | **GO** |

**EDGE DEPLOY hr-accrue at pack hash 16fdcd2e1a6ab3ac5da14c03b40b789adc9d7a7215aa66538271fdc2aa9b89f7: GO**
Verified in this worktree: `node tools/pack-edge.mjs hr-accrue --hash` → `hr-accrue 16fdcd2e1a6ab3ac5da14c03b40b789adc9d7a7215aa66538271fdc2aa9b89f7`, byte-for-byte the hash named in the brief. Deploy, then confirm the live `payload_sha256` equals it before the push (CLAUDE.md §3.3).

Every required change landed as specified. Two landed *better* than specified, and one
recommendation I did not require (residual 5) was taken as well. **No proof test and no guard was
weakened to get green, and I verified that rather than assuming it** — see "Was anything softened"
below. Nothing behavioural rode along in the edge bundle: the diff on `accrual.js`, `index.ts`,
`set-activity.js` and `src/net/accrue.js` is **comments only**, confirmed hunk by hunk.

## Guards run here, on real exit codes

| Command | Exit | What it said |
|---|---|---|
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 202 migrations, all findings acknowledged with a written reason |
| `node tests/selfcheck-no-global-dml.mjs --selftest` | **0** | 16 planted defects caught, 5 negative controls silent |
| `node tests/selfcheck-no-global-dml.bypass.mjs` | **0** | `all 10 shapes are seen` — A×3, B×4, C×2, D×1 |
| `node tests/companion-xp.mjs` | **0** | `ARMED — both-path totals identical (combat 14854, gather 9090, artisan 11365 xp attended == away)`; clamps at the L30 cap 792,783; disarmed control emits nothing |
| `node tests/schema-drift.mjs` | **0** | repo rebuilds to the committed fingerprint `f6dab0d81414…` |
| `node tests/ledger-rollup.mjs --mutate` | **0** | all 5 planted defects caught |
| `node tests/lifetime-facts-reapply.mjs` | **0** | first apply green; one live find closes the file for good (S-LF-3 still true) |
| `node tools/pack-edge.mjs hr-accrue --hash` | **0** | hash matches the brief |

`@electric-sql/pglite` was not present in this container; `npm install` (devDependencies, no paid
spend) installed it before the three chain-replay guards ran, so those three are measured, not assumed.

## Verdict 1 — each required change, re-read in the diff

| Required change | Landed | Where, and what makes it stick |
|---|---|---|
| **S-LF-1** scope the §6 backfill calls | **yes — both options, not one** | `hr_backfill_lifetime_facts(p_user uuid default null)` `:261`, with the scope applied at all three writing steps (`:318`, `:329`, `:347`) and **not** to `src`, so `row_number()` still numbers a find among every finder — a scoped call cannot renumber a cross-player ordinal. Both §6 calls pass `v_uid` (`:694`, `:721`). *And* the option-2 waiver: `ACKNOWLEDGED` gains a `scoped-by-proof` entry with three `proof` strings, pinned `sites: 2` (`:841-842`). |
| …and it is **measured**, not asserted | **yes, and this is the part I did not ask for** | New `GATE(a6)` (`:700-708`) reads the function's own reported counts against a **second probe character seeded with a turn-in** (`v_uid2`, `:688`) — so "the scope held" is a statement that can be FALSE on a fresh replay, not only on a production journal. Backed by a new `schema-drift` mutation arm `selfcheck_backfill_scope_dropped`. Without `:688` the gate would have been unfalsifiable; they saw that and said so at `:684-686`. |
| **GATE(c)** global `count(*)` scoped | **yes** | `:720`, `:723` — both counts now `where user_id in (v_uid, v_uid2)`. |
| **S-LR-2** NULL-blind canaries | **yes, all four sites** | `2026-09-19:671`, `:793`; `2026-09-18:274`, `:345` — `is distinct from`, and `schema-drift`'s `DROP_CANARY` mutation text re-synced to match. |
| **S-SC-1** families A–D | **yes** | `if (verb === 'update') continue;` is **gone**; `upserts()` classes `insert … select … on conflict do update` over a player-value table (C). `isScoped()` (`:542`) is rebuilt on `ownerBinds()` (`:498`) + `argIsOwned()`: the owner column must be bound by `=`/`in(…)` to a term composed only of declared locals and bind vocabulary — a subselect refuses, an alien qualified column refuses, a top-level `OR` refuses (B). `executePayloads()` (`:211`) reads the literal `execute` runs instead of blanking it (A). Pass 2 iterates every body the file **installs and calls**, not only top-level `do $tag$` blocks (D). |
| registered **only** once green | **yes, correctly sequenced** | `56ef7e72` adds `node tests/selfcheck-no-global-dml.bypass.mjs` to `.github/workflows/smoke.yml` and `tests/ci-shape.baseline.json` in the same commit that turned it green — the b512 rule honoured, not skirted. |
| **S-SC-2** `main()` on import | **yes** | `IS_ENTRY` entry-point check (`:1211`); the stray `selfcheck-no-global-dml: OK —` line is gone from the bypass proof's output. |
| **S-UM-1** probe in a copy | **yes, with a standing regression** | `schema-replay.mjs:72` honours `HR_MIGRATIONS_DIR`; `utc-midnight-replay.mjs withPlantedChain()` builds a temp chain of **symlinks** with the one mutated file real, and `assertChainIntact()` re-reads the tracked migration after the probe and after every mutation arm. The tracked file is never opened for writing, so there is no `finally` for a SIGKILL to skip. Measured live in this run: the probe reported `the §4 block takes its transaction timestamp 13.97 s after process start`, i.e. the child genuinely read the planted **copy**, so the plumbing is not decorative. |
| **S-LF-3** one-shot written down | **yes, in both places I offered** | File header `2026-09-19-…:13-23` (`⚠ ONE-SHOT. APPLY IT ONCE.`) **and** the `tests/schema-apply-order.json` note. |
| **S-LR-4** hold time in the apply note | **yes** | `schema-apply-order.json`, 2026-09-18 entry, closing paragraph — including the `set local` GUC instruction if `hr_ledger_prune` ever gains a config write. |
| *(residual 5 — recommended, not required)* | **taken** | `2026-09-18-…:395-413` adds `GATE(z)`: probe `player_ledger` rows, probe `player_ledger_rollup` rows and `hr_ledger_config.retain_days` are all re-read **outside** the subtransaction, so the rollback that file used to believe is now asserted. New mutation arm `selfcheck_rollback_not_asserted` drops the sentinel and is caught. |

### `hr_backfill_lifetime_facts` gaining `p_user` — the question asked directly

**Who can call it: nobody a client can be.** `revoke execute … from public, anon, authenticated,
service_role` on the **new** signature (`:360`, correctly re-spelled `(uuid)`); `GATE(a)`
(`:550-551`) asserts `has_function_privilege` is false for `authenticated` and `anon` on
`hr_backfill_lifetime_facts(uuid)`; `grep -rn "grant .*hr_backfill" supabase/` returns **nothing**,
so no role is granted it at all; it is not in `hr_client_rpc_baseline`; and no caller exists in
`src/**` or `supabase/functions/**` — every call site in the repo is SQL inside the migration itself
or test text.

**Can a client pass another user's id? No, on two independent grounds.** It cannot reach the
function. And if it could, `p_user` only ever **narrows** a write: every branch is
`p_user is null or <owner> = p_user`, the unscoped behaviour is the pre-existing one, and all three
writes derive their values from *that user's own* ledger rows through `on conflict … do nothing`
(step 1) or `greatest()` (steps 2 and 3). There is no argument that raises another player's counter
or inserts a row from forged input — the worst a forged `p_user` could do is re-derive a victim's
own true facts. `hearthfind_ordinal` is the one cross-player surface it writes, and it is raise-only
by `greatest()`, so a scoped call cannot lower a global ordinal.

> ### S-RV-1 · the signature move is an overload hazard on a database that already has the old one · CONFIRMED · LOW · process, not code
> `create or replace function public.hr_backfill_lifetime_facts(p_user uuid default null)` (`:261`)
> does not replace a pre-existing zero-argument `hr_backfill_lifetime_facts()` — it creates a second
> function. **Measured by execution** (PGlite, this session): creating the overload is *allowed*,
> and the subsequent `select public.f()` then fails with `function public.f() is not unique`. On
> production that would abort §2's own call (`:366`) — and therefore the whole file, atomically.
>
> This is **fail-closed and not a blocker**: nothing half-lands, no player value moves, and the
> file is staged-not-applied so the expected path has no old overload. Pre-apply check #1 already
> catches the ordinary version of this (the table would exist). I am adding a direct check as
> **#0** below because it is one line and it names the fix, rather than leaving the Coordinator to
> diagnose `is not unique` mid-apply.

*Nit, not a finding:* `tests/restore-census.baseline.json:1112` still spells the function
`hr_backfill_lifetime_facts()` in prose. It is a note string, asserted by nothing. Fix it when that
file is next re-pinned.

## Verdict 2 — each required change, re-read in the diff

| Required change | Landed | Where |
|---|---|---|
| **S-PX-1** the fifteen stale comments | **yes, all of them** | `index.ts:75-80, 979-981`; `accrual.js:140, 833, 842, 1279, 2581, 3225, 3394, 3585, 3824`; `set-activity.js:44-46, 934`; `accrue.js:2430-2443`. Re-grepped the four files for `dormant` / `client keeps awarding` / `client awards` / `CLIENT-authored`: **every surviving hit is about a different, genuinely dormant arm** (the absolute-replace inventory flip, the ammo-carry column, the gold-proc path) or is an explicit correction. `src/core/companion-xp.js:37-57` now carries the whole story — that the client writer was already dead, that this switch kept the server writer dead too, and that the result was every pet frozen at level 1. That is the root-cause class closed, which is why I required it. |
| **S-PX-2** companion XP visible in vitals | **yes, exceeded** | `tools/vitals.mjs` gains the `pet` CTE over `player_progress kind='stat' key like 'companion_xp:%' period_key=''` on `updated_at`, and `pets_xp` / `pet_xp` columns — *and* `pets_xp` is added to the **zero-for-two-days P1 watch**, which I did not ask for and which is the half that actually makes the feature un-ignorable. `pet_xp` is correctly left out of the watch (a running total does not return to zero). |
| no behaviour change in the bundle | **confirmed** | The entire diff on the four files is comment text. The arm itself (`COMPANION_XP_SERVER_BACKED`) was already `true` at `f2f8d7ab`; this lane changed no logic on the credit path. |

The Verdict-2 chain itself is unchanged since the original review and I re-read the table's
load-bearing rows rather than re-deriving them: the equipped id still comes from
`player_state.companion_equipped` behind `hr_companion_equip`'s ownership gate, `currentXp` still
from `player_progress` in the same transaction, `hr_perks_of` and `hr_apply` are still not
client-executable, and `companionSpanXp` still draws no rng. Residual risks 1–3 stand as accepted.

## Was anything softened to get green? — No. Here is how I know.

* **`tests/selfcheck-no-global-dml.bypass.mjs` is byte-identical to the file I wrote when it was
  red 10/10.** `git diff 76c11d87..edf6d5cd -- tests/selfcheck-no-global-dml.bypass.mjs` is
  **empty**. The same ten shapes, the same assertion, the same exit contract — it went from "10 of
  10 INVISIBLE, exit 1" to "all 10 seen, exit 0" because **the guard moved, not the proof**. This is
  the single strongest fact in this re-verify.
* **Every line removed from the guard is replaced by something strictly stronger.** I read the
  removals specifically for this: `if (verb === 'update') continue;`, the `BIND_WINDOW = 90`
  proximity heuristic, the "any mention of `user_id|clan_id|owner_id` in the predicate counts as
  scoped" shortcut, and the DO-blocks-only container loop are all **deleted**, not relaxed.
* **No acknowledgement was widened.** `ACKNOWLEDGED` went from 5 entries to 6; the five originals
  are unchanged, and the sixth is the `scoped-by-proof` waiver for the two unscoped calls I read,
  pinned at `sites: 2` with a `countDrift` check so a third call is reported rather than absorbed.
  `--selftest` carries an arm for exactly that (`family C — a THIRD unscoped call`) and a negative
  control asserting a *scoped* call is **not** counted as a site.
* **No mutation arm was deleted.** `schema-drift.mjs` gained two arms and lost none;
  `ledger-rollup.mjs --mutate` still catches all five.
* **`schema-drift.baseline.json` was re-pinned minimally.** Only the digest, the date and the one
  function signature line changed; `relations: 121` and `functions: 296` are **unmoved**, so the
  re-pin carries no smuggled schema change.
* **No test was disabled or skipped**, and `tests/guards-unregistered.json` gained an entry
  (`lifetime-facts-reapply.mjs`) while the bypass proof's entry was removed on registration — the
  ledger of unregistered guards moved in the honest direction.

## Apply order, and the pre-apply read-only SQL

The order below is the chain's own recorded order (`tests/schema-apply-order.json` positions
196/197/198) and it matches the original verdict's "narrower change first". **Note it is not the
order named in the re-verify brief** — `2026-09-19` is LAST in the chain and must stay last; it is
also the one-shot. One file per `node tools/apply-migration.mjs` call, never inside `begin/commit`,
never during 00:00–00:10 UTC, Coordinator only (CLAUDE.md §2).

```
1. 2026-09-18-ledger-rollup-currencies.sql        # rollup currencies + the narrowed prune proof
2. 2026-09-18-retired-iap-catalogue-removal.sql   # independent of both; may go before, between or after
3. 2026-09-19-lifetime-facts-off-the-ledger.sql   # ONE-SHOT. LAST. apply it once, ever.
```

Prefer a low-traffic window for step 3: S-LF-1's scoping removed the two extra full-table passes
from the gates, but §2's legitimate unscoped backfill still holds `hearthfind_ordinal` and
`player_progress` write locks for the length of the transaction, and S-LR-4's `hr_ledger_config`
row lock applies to step 1.

After step 1 and after step 3: `node tests/live-hash-drift.mjs --live --write` plus the whys, flip
the apply-order note to APPLIED, and `node tools/restore-census.mjs` to classify `hearthfind_log`
and `hearthfind_ordinal` (CLAUDE.md §3.3 lane C).

**Pre-apply read-only SQL.** Six now — #0 is new from this re-verify, #1–#5 are unchanged and still
correct.

```sql
-- 0. S-RV-1 (NEW, re-verify 2026-09-20): is there a LEFTOVER zero-argument overload?
--    Must return 1 row, 'hr_backfill_lifetime_facts()' absent. If both signatures come back,
--    the new file's §2 call aborts with "function ... is not unique" — drop the old one first:
--      drop function public.hr_backfill_lifetime_facts();
select p.oid::regprocedure::text as signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'hr_backfill_lifetime_facts';

-- 1. S-LF-3: is the 2026-09-19 file still appliable at all? Must be 0 rows / relation absent.
--    ANY row here means a trophy has already been allocated live and §2 will refuse the apply.
select to_regclass('public.hearthfind_log') as hearthfind_log_exists,
       (select count(*) from public.hearthfind_log where src_ledger_id is null) as live_finds;

-- 2. 2026-09-18 (e0): does ANY real ledger row predate the widened 3650-day window?
--    Non-zero REFUSES the apply. Run it first so that is a decision, not a surprise.
select count(*) as rows_past_3650d
  from public.player_ledger
 where at < now() - interval '3650 days'
   and user_id is distinct from '00000000-0000-4000-c000-00000000f18a'::uuid;

-- 3. The retention policy both files derive their cut from, and the canary's size.
select c.retain_days,
       (select count(*) from public.player_ledger
         where at < now() - make_interval(days => coalesce(c.retain_days, 90))) as prunable_tail
  from public.hr_ledger_config c;

-- 4. S-LR-2 / the canaries' blind spot: must be 0, and must be 0 for the NOT NULL reason.
select count(*) as null_owner_ledger_rows from public.player_ledger where user_id is null;
select is_nullable from information_schema.columns
 where table_schema='public' and table_name='player_ledger' and column_name='user_id';

-- 5. §2's blast radius, so the hold time on the apply is a known number rather than a guess.
select (select count(*) from public.player_progress
         where kind='stat' and key='bounty_turnins' and period_key='') as progress_rows_touched,
       (select count(*) from public.player_ledger
         where kind='hearthfind' and item_id is not null)                as finds_to_backfill;
```

Expected: (0) one row, `hr_backfill_lifetime_facts(p_user uuid)` only — or **no** rows on a first
apply · (1) `null` / 0 · (2) `0` · (3) `90`, and a `prunable_tail` of 0 until ~2026-11-21 · (4) `0`
and `NO` · (5) informational. **A non-zero (1) or (2), or a zero-arg overload in (0), is a stop, not
a warning.**

## After the edge deploy

S-PX-2 is closed in code, so use it: run `node tools/vitals.mjs` the day after the deploy and
confirm `pets_xp` is non-zero. A zero there on two consecutive days is now a P1 the table states by
itself — which is the whole point of the column, and the thing that was missing when every pet in
the game sat at level 1 and only Paione noticed.

## Residual risks accepted (additions to the original six)

7. **`p_user uuid default null` defaults to the GLOBAL call.** A forgotten argument is the wide
   behaviour, not the narrow one — the less safe default. It has to be, because §2's legitimate
   backfill is the unscoped call. The compensating control is real and mechanical: the
   `ACKNOWLEDGED` entry is pinned at `sites: 2`, a third unscoped call anywhere in that file is
   reported as open, and `--selftest` has an arm proving it.
8. **S-RV-1's overload hazard is mitigated by a pre-apply check, not by the file.** The file could
   `drop function if exists public.hr_backfill_lifetime_facts();` before the create and close it
   in code. It does not, and I am not requiring it: the failure is atomic and fail-closed, and
   editing a staged migration to guard a state that pre-apply SQL #0 rules out would add risk
   rather than remove it.
