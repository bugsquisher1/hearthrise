# Security review — world tick MILESTONE 1, the three staged migrations as a MONEY SURFACE

**Reviewer:** security-engineer (veto) · **Branch reviewed:** `lane/world-tick-m1` @ `f970f662` ·
**Review branch:** `sec/world-tick-m1` · **Date:** 2026-09-21 ·
**Prior verdict:** `docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md` (GO-WITH-CHANGES, S-1…S-8)

| migration | verdict |
|---|---|
| `2026-09-20-world-tick-roster.sql` | **GO-WITH-CHANGES** (M-3, M-4 — two documented controls that do not exist; the code is sound) |
| `2026-09-21-world-tick-settle-fence.sql` | **GO-WITH-CHANGES** (M-2 must land with it; M-5) |
| `2026-09-21-world-tick-cron.sql` | **BLOCK** (M-1 — the shadow run cannot produce the measurement it exists for) |

**SHADOW ON PRODUCTION: BLOCK**

The fence is the best work in this lane: S-1 and S-3 are genuinely closed, and I proved it by
execution and by mutation rather than by reading. What blocks the milestone is not the money
path — it is that the shadow parity run, the whole deliverable of M1 and the evidence arming
depends on, stalls after one window per character, and that applying the fence turns the house's
own daily grant-hygiene detector red. **No production writes and no production reads were made.**
Every arm below ran against a PGlite database rebuilt from `supabase/migrations` in
`tests/schema-apply-order.json` order, on synthetic uuids `gen_random_uuid()` cannot mint.

---

## 1. The prior verdict's required changes — finding → commit

| # | Required change (2026-09-19) | Landed? | Where | Verified by |
|---|---|---|---|---|
| **S-1** | The tick cannot reach `hr_apply`; either present `hr_engine` or splice the seam | **YES — by a third route, and it is better than either I offered** | `b1dc231` · fence `:302-500`; roster `:458-459` withdraws the grant | fence `e12` executes the `set local role hr_engine` → definer → `hr_apply` transition; my privilege matrix shows `hr_tick` holds **zero** value grants |
| **S-2** | Carry `channel` in the roster's `claim` projection and in the UPDATE's WHERE | **YES** | roster `:342`, `:384` | `world-tick-writer-authz.mjs` **exit 0** (was 1) |
| **S-3** | Put `version`/window END in the tick key; correct the three false "refused on arithmetic" comments | **YES, and exceeded** — replaced by a real watermark CAS under the row lock | fence `:392-412` | `world-tick-double-pay.mjs` **exit 0**; `--mutate` **exit 0** (every arm goes red with the fence bypassed) |
| **S-4** | Classify `hr_tick_ownership` in `restore-census.baseline.json` | **YES** | `restore-census.baseline.json:541`, `:1122` | `restore-census.mjs` **exit 0** (was 1); all four `hr_tick_*` tables classified |
| **S-5** | Classify the dry run's boundary with `settledWatermarkMs`, or delete the claim | **YES** | `replay.js`, `tools/world-tick-replay.mjs` | `writer-authz` S-5a/S-5b green. *Production re-run still owed — this lane has no DB.* |
| **S-6** | One intent per call, or an explicit re-hydrate contract | **YES** | `gather.js` (+108/−…) | `world-tick-parity.mjs` **exit 0**, P-G1…P-G9 |
| **S-7** | Informational; re-open if the RNG oracle becomes predict-and-choose | **NO — withdrawn, then replaced by a wrapper that was never written** | roster `:15`, `:92`, `:451` | **M-3 below** |
| **S-8** | None (accepted residual) | n/a | | |

Six of seven landed as specified or better. **S-7 is the one that did not, and the file says it
did, three times.**

---

## 2. Findings

| # | Sev | Title | Status | File:line |
|---|---|---|---|---|
| **M-1** | **P0 — BLOCKS the cron file and SHADOW** | The driver never sends the shadow watermark, so the shadow run journals ONE window per character and then refuses itself forever | **CONFIRMED by execution** | `2026-09-21-world-tick-cron.sql:276-281` |
| **M-2** | **P1 — BLOCKS the fence until paired** | Applying the fence makes `hr_assert_grant_hygiene` RAISE, and it runs on production nightly | **CONFIRMED by execution** | fence `:478` |
| **M-3** | P2 | `hr_tick_seeds` does not exist. S-7 is not narrowed; the roster claims it is, three times | **CONFIRMED (absence proved repo-wide)** | roster `:15`, `:92`, `:451-453` |
| **M-4** | P2 | The roster says the fence re-asserts `hr_tick`'s grant count "exactly three". It does not. No end-of-chain equality exists | **CONFIRMED (code read + execution)** | roster `:455-457` vs fence `:746-750` |
| **M-5** | P2 | `hr_tick_config.edge_url` carries no CHECK — the one column that aims two Vault secrets and every rostered character's full envelope | **CONFIRMED by execution** | fence `:204` |
| **M-6** | P2 | The 10× row-volume figure is understated: the tick alone consumes 100% of the SHARED daily ledger prune budget | **CONFIRMED (arithmetic on the live cron schedule)** | cron `:78-80` |
| I-1 | Info | `empty` is not coalesced in the fire log the way `disabled`/`locked` are | Accepted | cron `:217-222` |
| I-2 | Info | The fence is the only migration in the repo that does `set local role hr_engine`; never exercised on production | Pre-apply check below | fence `:673`, `:696` |
| I-3 | Info | The fence self-check reports PASS if it skips e5–e20 for want of a gather activity | Accepted (it does run; M1 mutation bit at e10) | fence `:579` |
| I-4 | Info | A roster shorter than `batch_limit` re-posts the same characters every fire; the CAS refuses ~8 of 9 | Correct, but it burns the invocation budget | cron `:303-310` |

### M-1 — the SHADOW parity run stalls after one window per character  **[P0, BLOCK]**

`f970f66` added `hr_tick_ownership.shadow_accrued_to` precisely because in SHADOW the tick pays
nothing, so `player_state.accrued_to` never moves and a tick chaining on it would propose
overlapping windows. The column landed and is correct: `hr_tick_roster` computes it
(`roster:399-401`), RETURNS it (`roster:273`) and seeds the per-window PRNG label from it
(`roster:414-419`); `hr_tick_settle` compares against it (`fence:406-408`).

**The driver never sends it.** `hr_tick_cron_run`'s payload projection lists ten keys and
`shadow_accrued_to` is not among them:

```sql
-- 2026-09-21-world-tick-cron.sql:276-281
select jsonb_agg(jsonb_build_object(
         'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
         'active_kind', r.active_kind, 'active_id', r.active_id,
         'active_since', r.active_since, 'accrued_to', r.accrued_to,
         'version', r.version, 'seed', r.seed, 'state', r.state)
```

`grep -c shadow_accrued_to 2026-09-21-world-tick-cron.sql` → **0**.

**Exploit scenario — it is not an attack, it is the rollout destroying its own evidence.** The
edge is the only thing that decides where a window starts, and it is handed the frozen
`accrued_to`. Fire 1 proposes `[T0, T0+90s]`; the fence accepts, writes the shadow row and stamps
`shadow_accrued_to = T0+90s`. Fire 2 proposes `[T0, T0+90s]` again — because nothing told the edge
the mark moved — and the fence *correctly* refuses it `window_already_settled`. So does every fire
after it, forever. Over 48 h at a 90 s flush that is **1 shadow row where 1,920 are expected**: the
tick reads as paying ~0.05% of what accrual pays. Read one way that blocks a correct rollout; read
the other way, somebody closes the "gap" by loosening the CAS — which is the double pay S-3 exists
to prevent. Meanwhile every fire still POSTs, so the full invocation ceiling is spent producing
refusals.

**Why no guard saw it.** `world-tick-double-pay.mjs` D4e–D4g call `hr_tick_settle` *directly* with
a hand-supplied `window_from` already chained on the shadow mark, so they prove the **fence**
chains and are blind to whether the **driver** ever delivers the mark. No test in the repo reads
`hr_tick_cron_run`'s payload. That is why the lane is green and wrong.

**Proof (added here, red on purpose):** `node tests/world-tick-shadow-chain.mjs` → **exit 1**

```
✗ SC-1 — hr_tick_cron_run's payload omits `shadow_accrued_to` … Keys sent: user_id, slot, shard,
         active_kind, active_id, active_since, accrued_to, version, seed, state
✗ SC-2 — 4 fires journalled only 1 shadow window(s); fires 2..4 were refused
         [window_already_settled]. The parity run stalls after the first window.
✓ SC-3 — chaining on the roster's shadow_accrued_to tiles all 4 windows — the column is correct
         and the defect is confined to the driver's payload projection
```

SC-3 is the control and it is green, which localises the fix exactly.

**Required change.** Add `'shadow_accrued_to', r.shadow_accrued_to` to the projection at
`cron:276-281`, and have the `op:'tick'` entry chain on it when present (it is NULL for an armed
channel, which is the signal to use `accrued_to` — the roster's own contract at `roster:271-274`).
The keyset cursor and `max(r.accrued_to)` may stay on `accrued_to`; they are a pass-ordering
device, not a payment watermark. `tests/world-tick-shadow-chain.mjs` is the exit code: SC-1 and
SC-2 must go green, and the file's entry in `tests/guards-unregistered.json` is deleted and the
guard registered in `smoke.yml` when they do. **This cannot be fixed on `lane/world-tick-m1b`** —
the edge cannot invent a field the payload does not carry.

### M-2 — applying the fence turns the nightly grant-hygiene detector red  **[P1]**

CLAUDE.md §6 names `hr_assert_grant_hygiene` as *the* detector for the client RPC surface. On the
assembled chain it raises:

```
GRANT HYGIENE FAILED: {… "engine_execute_outside_allowlist":
  ["hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb)"] …}
```

`fence:478` grants `hr_engine` EXECUTE on `hr_tick_settle`, and `hr_engine`'s EXECUTE allowlist is
an explicit list maintained by restating the detector. It was not updated.

**Exploit scenario.** `cron.job` carries `hr-grant-hygiene [50 4 * * *] select
public.hr_assert_grant_hygiene(true)`. From 04:50 UTC the morning after the apply the job raises
every night. The real cost is not the noise: it is that once the grant-hygiene job is *expected*
red, a genuine grant regression — an RPC handed to `authenticated`, the class this detector exists
to catch and the class the original audit missed — is invisible. A detector that is always red is
not a detector. This is the same shape as S-1's "our own infrastructure generates the alarm".

**Required change.** A fourth migration restating `hr_assert_grant_hygiene` to admit
`hr_tick_settle`, on the precedent of `2026-08-16-engine-allowlist-claim-perks.sql` and
`2026-09-10-dungeon-settle.sql`. Its chain position: **after `2026-09-11-quartermaster-buy.sql`**,
the current last toucher. It restates a live body, so it MOVES A LIVE HASH — which means the
milestone's "MOVES NO LIVE HASH" claim is true of each of the three files and **false of the
milestone**, and `live-hash-drift --live --write` plus an apply-order note are owed for it. It gets
its own §4 self-check asserting the allowlist admits exactly the one new verb, and
`select public.hr_assert_grant_hygiene()` must return without raising on the replay before apply.

### M-3 — `hr_tick_seeds` does not exist; S-7 is not narrowed  **[P2]**

The roster's amended header states three times that the withdrawn `hr_seed` grant is replaced by a
lease-checked wrapper:

> `:451-453` — "Both are replaced by narrow SECURITY DEFINER wrappers … `hr_tick_settle` and
> `hr_tick_seeds` … The tick never holds raw `hr_apply` or raw `hr_seed` again."

`grep -rn hr_tick_seeds` over the whole repo returns **three hits, all of them these comments**. The
function is never created, never granted, never called.

**What is actually true.** The M1 tick *is* the edge, and the edge calls raw `hr_seed` directly and
unscoped for arbitrary `(user, slot, label)` — `supabase/functions/hr-accrue/index.ts:725-742`. So
the RNG oracle S-7 described is exactly where it was: open, held by `hr_engine`, and covered by the
standing 2026-08-11 acceptance. **The residual is unchanged and acceptable. The claimed control is
fiction, and that is the finding** — a header that asserts a narrowing nobody built is how the
prior "audit" told the owner the save system was safe.

**Required change.** Delete the `hr_tick_seeds` claims at `roster:15`, `:92`, `:451-453` and
restate S-7 honestly ("the M1 tick reaches `hr_seed` as the edge always has; unchanged residual"),
**or** build the wrapper. Do not ship the sentence.

### M-4 — the end-of-chain grant equality does not exist  **[P2]**

`roster:455-457`: *"THE INVARIANT AT THIS POINT IN THE CHAIN IS THEREFORE 'EXACTLY ONE ROUTINE
GRANT' (e6 below). The fence file re-asserts 'exactly three, and hr_apply/hr_seed are not among
them' at its own point in the chain."*

The fence's only `role_routine_grants` count is `e18` (`fence:746-750`), which counts grants **on
`hr_tick_settle`** (expected 1), not `hr_tick`'s grants. There is no "exactly three" assertion, and
three would be wrong under either reading — the matrix I executed shows `hr_tick` holding exactly
one EXECUTE (`hr_tick_roster`). Roster `e6` asserts "exactly 1" at *its* point in the chain, which
is before the fence applies.

**Blast radius today: none** — the fence grants `hr_tick` nothing, so the invariant holds in fact.
What is missing is the *detector*: the prior review leaned on that equality ("so a fourth arriving
later is a review failure"), and after the fence nothing re-asserts it. **Required change:** correct
the sentence, and add to the fence's self-check `select count(*) … where grantee = 'hr_tick'` = 1
as an equality, so the milestone ends with the control the roster says it ends with.

### M-5 — `edge_url` is the only unconstrained column on the config row  **[P2, defence in depth]**

Every tunable on `hr_tick_config` carries a CHECK — `cadence_seconds between 5 and 300`,
`flush_seconds between 10 and 900`, `batch_limit between 1 and 500`, `lease_ms between 5000 and
300000`, `flush_seconds >= cadence_seconds`. `edge_url` (`fence:204`) is bare `text`. Executed:

```
ACCEPTED: "http://attacker.example/collect"
ACCEPTED: "http://169.254.169.254/latest/meta-data/"
ACCEPTED: "file:///etc/passwd"     ACCEPTED: "ftp://x/"     ACCEPTED: ""
```

**Exploit scenario.** One UPDATE to that column re-aims `net.http_post` — carrying
`Authorization: Bearer <hr_tick_gateway_key>`, `X-HR-Tick-Auth: <hr_tick_shared_secret>` and the
**full `hr_state_of` envelope of every rostered character** — at an arbitrary host, in plaintext if
the scheme says so. Both Vault secrets and a batch of player data, exfiltrated by a config change
with no schema change and no deploy.

**Reachability, stated honestly and not inflated.** No client or engine role can write that row. I
executed it:

```
anon → refused   authenticated → refused   service_role → refused   hr_engine → refused   hr_tick → refused
(permission denied for table hr_tick_config; RLS enabled AND forced, zero policies, all grants revoked)
```

So the trigger is **operator error or post-compromise**, not a reachable client exploit — the
Coordinator types this URL by hand at step 4 of the runbook, and a typo that resolves is a secret
leak. The file's own self-check (`cron:521`) sets `https://example.invalid/...` and demonstrates the
column takes anything.

**Required change.** A CHECK pinning the scheme and host, e.g.
`constraint hr_tick_config_edge_url_ck check (edge_url is null or edge_url like
'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/%')`, with the self-check asserting a
plaintext and a foreign-host URL are both refused. One line; it turns a full secret exfiltration
into a constraint violation.

### M-6 — the 10× row-volume figure is understated  **[P2]**

`cron:78-80` prices 500 active characters at "480,000 rows/day — at the ceiling". The ceiling is
`hr_ledger_prune`, which runs `[7 * * * *] select public.hr_ledger_prune(20000)` — 20,000/hour ×
24 = **480,000 rows/day, shared by every ledger writer in the game**. So at 10× the tick alone
consumes **100%** of it, leaving zero for combat, buys, claims, market and the rest; `player_ledger`
then grows monotonically, and it is the money journal every dispute is read from. It is not "at the
ceiling", it is the ceiling. (1× is genuinely comfortable: 48,000/day = 10%. 100× is 10× over and
the file says so.) `hr_tick_shadow` has the same shape — 48,000/day against a 480,000/day prune at
1×, at parity at 10×.

**Required change.** Restate the 10× row as OVER rather than AT, and make any change to
`flush_seconds` or `batch_limit` at arming time carry Reliability's sign-off with this arithmetic
attached.

---

## 3. What I checked and found CLOSED

**The fence, as a money surface, is sound.** Verified by execution, not by reading:

- **Who can execute it** — privilege matrix over the whole chain:

  | function | public | anon | authenticated | service_role | hr_engine | hr_tick |
  |---|---|---|---|---|---|---|
  | `hr_tick_settle` | · | · | · | · | **YES** | · |
  | `hr_tick_roster` | · | · | · | · | · | **YES** |
  | `hr_tick_cron_run` | · | · | · | · | · | · |
  | `hr_tick_shadow_prune` / `hr_tick_cron_log_prune` / `hr_tick_cron_note` | · | · | · | · | · | · |
  | `hr_apply` / `hr_seed` | · | · | · | · | YES | · |

  `SECURITY DEFINER set search_path = public` on every new function; `revoke … from public` before
  the grant; a secondary GUC identity seam (`fence:312-315`) refusing `anon`/`authenticated`/
  `service_role`/`hr_tick` even in an owner context; `e20` performs the exact `SET LOCAL ROLE
  authenticated` transition PostgREST performs and requires `insufficient_privilege`. **No
  `hr_tick_*` routine appears in `hr_client_rpc_baseline` (80 rows).** The one grant-hygiene
  complaint is M-2, and it is about `hr_engine`, not about a client.
- **"Choose whose world ticks" is closed, and one level deeper than the grant.** The selector and
  the settler are different roles and neither can become the other: `hr_tick_roster` (which stamps
  the lease) is executable by `hr_tick` alone; `hr_tick_settle` (which pays) by `hr_engine` alone.
  The fence refuses any character the roster has not leased **to that holder, inside the lease
  window** (`fence:373-381`), refuses `owned = false`, and refuses a character whose `active_kind`
  has moved (`fence:386-390`). `--mutate` proves each of those bites: D6a/D6b/D6c all went red with
  the fence bypassed.
- **It never calls raw `hr_apply` outside the fence.** One call site, `fence:453`, after every
  check. `hr_tick` holds no `hr_apply` grant at all (`e19b`). *For `hr_seed` the answer is
  different and it is M-3.*
- **Double pay: the lock-then-CAS is real, in SQL, in ONE transaction.** `select … for update` on
  `player_state` is taken *before* any comparison (`fence:361-365`); the watermark CAS
  (`fence:409-419`), the version check (`fence:421-425`) and `hr_apply`'s own re-entrant lock and
  CAS all run inside it. `world-tick-double-pay.mjs` **exit 0**, and `--mutate` **exit 0** — every
  arm goes red against raw `hr_apply`, so every arm measures the fence and not something the money
  function already did. `p_delta->>'accrued_to' = p_window_to` (`fence:351-356`) binds the declared
  window to the paid one, so a caller cannot name ten seconds and hand over an hour.
- **The SHADOW watermark cannot cause a double pay, in either direction.** I attacked it as the
  brief asked. It is monotonic (the CAS at `fence:398-402` forces `p_window_to > v_mark` before the
  stamp at `fence:443-446`); `greatest(accrued_to, shadow_accrued_to)` means a client accrue landing
  mid-shadow drags it forward rather than being replayed over; armed mode ignores it entirely and
  compares `accrued_to`, which is exactly what was paid; an armed payment clears it (`fence:459-462`).
  The worst case I could construct — a stale mark *ahead* of `accrued_to` after a failed armed
  apply — makes the **tick skip** time, never pay it twice, and the client accrue pays that gap on
  return from `accrued_to` regardless. **No mint. M-1 is the shadow mark's defect, and it is a
  measurement failure, not a value failure.**
- **SHADOW truly pays nothing — enumerated, not asserted.** I diffed row counts across **all 111
  public base tables** around one shadow settle:

  | table | change |
  |---|---|
  | `hr_tick_shadow` | 0 → 1 (INSERT, the measurement row) |
  | `hr_tick_ownership.shadow_accrued_to` | in-place UPDATE (no row-count delta) |
  | **every other table, all 109 of them** | **no change** |

  `player_state`: gold 0 → 0, version 1 → 1, `accrued_to` **UNMOVED**. No `player_ledger`, no
  `player_skills`, no `player_progress`. The shadow branch returns at `fence:447-449`, before
  `hr_apply`, and there is no second call site.
- **The driver's overlap protection, batch cap and kill switch.** `pg_try_advisory_xact_lock` is
  taken **first** (`cron:253`) — `_xact_` so a pooled connection cannot strand it, `pg_try_` so a
  slow tick **skips** the next fire rather than queueing behind it. Then the kill switch, failing
  closed on a missing row (`cron:260-263`). Batch cap `batch_limit ≤ 500` plus a keyset cursor on
  `(accrued_to, user_id, slot)` with an explicit fail-safe sentinel for the NULL slot, so a roster
  larger than the cap is walked to its end instead of re-serving its head. Self-check `c7` proves
  the lock is re-entrant within a transaction.
- **Secrets.** Both bearers are read from `vault.decrypted_secrets` at call time via dynamic
  EXECUTE, used once, and never returned, raised or journalled — including the error path, which
  logs `sqlstate` **only** (`cron:375-384`). Nothing bearer-shaped reaches `hr_tick_cron_log`.
  Splitting the gateway key from the tick bearer is correct and the file is right that they must
  not be conflated: the anon key satisfies the gateway and is public, so it is not authorisation.
- **RLS and the census.** `hr_tick_config`, `hr_tick_shadow`, `hr_tick_cron_log` and
  `hr_tick_ownership` all have RLS **enabled and forced**, **zero policies**, and every grant
  revoked from `public`/`anon`/`authenticated`/`service_role`/`hr_engine`/`hr_tick` (sequences
  included). `node tests/restore-census.mjs` **exit 0**; classes: `hr_tick_config` operational,
  `hr_tick_shadow` operational + `player_value_exempt` (14-day prune), `hr_tick_cron_log`
  operational (7-day prune), `hr_tick_ownership` operational + `player_value_exempt`.
- **The self-checks touch PROBE ROWS ONLY, and they really execute.** `node
  tests/selfcheck-no-global-dml.mjs` **exit 0** (205 migrations, 9 global statements, all 9
  acknowledged — **no acknowledgement was added by this lane**), and its bypass proof
  `selfcheck-no-global-dml.bypass.mjs` is registered and green via `guard-hygiene` **exit 0**.
  The probe character lives under `…f1ce`/`…f1c5`, and the blocks roll back through the
  `HR921_ROLLBACK_OK` / subtransaction sentinel. **I did not take "it rolled back" on faith:** I
  mutated the fence's watermark CAS to `if false then` and required red —
  `schema-drift` **exit 1**, `e10: a window behind the settled watermark was accepted`. The gates
  execute.
- **`schema-drift` replays the chain against a database with REAL rows.** Its bystander seed
  (`schema-drift.mjs:407-427`) plants a live and an aged `player_ledger` row for a user no
  migration knows about, *before* the world-tick files, and asserts both survive to the end — the
  standing control for the 2026-09-20 class. `node tests/schema-drift.mjs` **exit 0** and
  `node tests/apply-order-honesty.mjs` **exit 0** (30 files carry a measured verdict).

---

## 4. Executed evidence

| Command | Exit | What it showed |
|---|---|---|
| `node tests/world-tick-writer-authz.mjs` | **0** | was 1 — S-1, S-2, S-3, S-4, S-5 all closed |
| `node tests/world-tick-double-pay.mjs` | **0** | one window paid once; kill switch; SHADOW pays nothing; the lease decides |
| `node tests/world-tick-double-pay.mjs --mutate` | **0** | every arm red with the fence bypassed — the arms measure the fence |
| `node tests/world-tick-parity.mjs` | **0** | P1–P4, P-G1–P-G9; the same 90 s windows pay identically as tick and as accrue |
| `node tests/schema-drift.mjs` | **0** | chain replays, byte-identical second apply, bystander ledger rows intact |
| `node tests/apply-order-honesty.mjs` | **0** | 30 files evidenced-live, every note agrees with the live-hash baseline |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 9 global statements, all pre-existing and acknowledged |
| `node tests/restore-census.mjs` | **0** | was 1 — all four `hr_tick_*` tables classified |
| `node tests/guard-hygiene.mjs` | **0** | no orphans, no ghosts, no vacuous proofs (13 declared entries) |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green.` |
| **`node tests/world-tick-shadow-chain.mjs`** | **1** | **M-1 — added here; SC-1 and SC-2 red, SC-3 green** |
| `select public.hr_assert_grant_hygiene()` | **RAISED** | **M-2 — `engine_execute_outside_allowlist: [hr_tick_settle(…)]`** |
| mutation: fence CAS → `if false then`, `schema-drift` | **1** | `e10` bit — the self-check gates genuinely execute |

`@electric-sql/pglite` is a declared devDependency but was absent from this container; it was
installed with `--no-save`, so `package.json` and `package-lock.json` are untouched. **Three of the
six required guards abort with exit 2 (harness, not red) without it — a "green" read before
installing it would have been meaningless.**

---

## 5. The exact apply order

The milestone is **four** files, not three.

```
1. node tools/apply-migration.mjs supabase/migrations/2026-09-20-world-tick-roster.sql
2. node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-settle-fence.sql
3. node tools/apply-migration.mjs supabase/migrations/<NEW>-engine-allowlist-tick-settle.sql   # M-2
4. node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-cron.sql           # after M-1 is fixed
```

One file per call, never inside `begin/commit`, never 00:00–00:10 UTC, Coordinator only.
Step 3 is **not optional and must not trail step 4 overnight**: between 2 and 3 the nightly
grant-hygiene job raises. Step 3 restates a live body, so afterwards:
`node tests/live-hash-drift.mjs --live --write` (expect a move on `hr_assert_grant_hygiene` and
**no move on `hr_apply`**), write the whys from `--codediff`, flip all four apply-order notes to
APPLIED, and re-run `node tests/restore-census.mjs`.

**Steps 1–3 may proceed once M-2 exists and M-3/M-4's sentences are corrected. Step 4 is BLOCKED
until `tests/world-tick-shadow-chain.mjs` exits 0.** Applying 1–3 without 4 is safe and inert: it
installs a disarmed config row, two unreachable tables and one function granted to one role, with
no scheduled job.

---

## 6. Pre-apply read-only SQL, with expected results

Run as the applying role. Every statement is read-only.

```sql
-- (1) I-2: can the applying role SET ROLE hr_engine? The fence's e12/e14/e15 do exactly this and
--     NO migration in this repo has ever done it on production. FALSE ⇒ the apply aborts at e12.
select pg_has_role(current_user, 'hr_engine', 'SET') as can_set_hr_engine;
--     EXPECT: t

-- (2) The roles the preflight requires already exist, and hr_tick does not yet.
select rolname, rolcanlogin, rolbypassrls from pg_roles
 where rolname in ('hr_engine','hr_tick','authenticator') order by 1;
--     EXPECT: hr_engine + authenticator present; hr_tick ABSENT before step 1.
--     hr_engine.rolbypassrls is not required; the definer is the OWNER.

-- (3) The owner bypasses RLS, which is what lets a definer read a FORCE-RLS table with no policies.
select rolname, rolbypassrls from pg_roles where rolname = current_user;
--     EXPECT: rolbypassrls = t. If f, hr_tick_settle reads ZERO config rows and fails CLOSED
--     ('tick_disabled') — safe, but the tick will never run and e1 will fail during the apply.

-- (4) M-2: the detector's CURRENT state, so the post-apply red is attributable.
select public.hr_assert_grant_hygiene();
--     EXPECT: returns a row WITHOUT raising. If it already raises, an unrelated regression is live
--     and must be resolved BEFORE these applies, or M-2 will be indistinguishable from it.

-- (5) The four objects the files create must not already exist (re-apply safety).
select to_regclass('public.hr_tick_ownership')  as ownership,
       to_regclass('public.hr_tick_config')     as config,
       to_regclass('public.hr_tick_shadow')     as shadow,
       to_regclass('public.hr_tick_cron_log')   as cron_log;
--     EXPECT: all NULL.

-- (6) The anchors the preflights fail closed on.
select to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)')   as hr_apply,
       to_regprocedure('public.hr_cron_ensure(text,text,text)')             as cron_ensure,
       to_regclass('public.player_state')                                   as player_state;
--     EXPECT: all NON-NULL.

-- (7) hr_apply's seam is still the LITERAL test the whole design rests on (S-1).
select position('if v_role = ''hr_engine'' then' in pg_get_functiondef(
         'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure)) > 0 as seam_literal;
--     EXPECT: t. If f, the seam moved and the fence's hr_engine route needs re-reviewing.

-- (8) M-6: the real headroom in the SHARED ledger prune budget, measured rather than assumed.
select count(*) filter (where at > now() - interval '1 day') as ledger_rows_yesterday,
       480000 - count(*) filter (where at > now() - interval '1 day') as headroom_for_the_tick
  from public.player_ledger;
--     EXPECT: headroom comfortably above 48,000 (the 1x tick budget) before ARMING.
--     This is a read for the ARM decision, not for the apply.

-- (9) pg_cron version — sub-minute schedules need >= 1.5 (the file falls back to 60s with a NOTICE).
select extname, extversion from pg_extension where extname in ('pg_cron','pg_net');
--     EXPECT: pg_cron >= 1.5; pg_net ABSENT is fine (the driver returns 'pg_net_absent').

-- (10) No hr_tick_* routine may ever appear on the client RPC surface.
select count(*) as tick_rpcs_on_client_surface
  from public.hr_client_rpc_baseline where proname like 'hr_tick%';
--     EXPECT: 0, before and after.
```

**After step 4 (once unblocked), and before arming shadow:**

```sql
select public.hr_assert_grant_hygiene();                      -- EXPECT: no raise (M-2 landed)
select enabled, shadow, edge_url from public.hr_tick_config;  -- EXPECT: f, t, NULL
select count(*) from public.hr_tick_ownership where owned;    -- EXPECT: 0
select jobname, schedule from cron.job where jobname like 'hr-tick%' order by 1;
--     EXPECT: hr-tick-run, hr-tick-shadow-prune, hr-tick-cron-log-prune
```

---

## 7. What the `lane/world-tick-m1b` review of the `op:'tick'` entry must attack

That entry is the **one place in the system where a request reaches the engine without a player
behind it**, and it sits *before* `verifyJwt` — a deliberate bypass of the gate
`tests/edge-jwt-gate.mjs` exists to defend. Its review must not inherit this one's GO. It must
attack, at minimum:

1. **The comparison itself.** Constant-time over the full length; equal-length inputs; no early
   return on length mismatch that turns the endpoint into a length oracle; the same `401
   not_signed_in` on every failure so it is not a discriminating oracle; and a missing/empty
   `HR_TICK_SHARED_SECRET` env must fail CLOSED, never match an absent header.
2. **Nothing happens before the comparison succeeds.** No body parse, no database round trip, no
   logging of any header, no error that differs by cause. Prove it by ordering, in code.
3. **It must not read a user id from the body.** The roster is the authority for whose world ticks.
   A `user_id` the request supplies that is not in the leased batch must be impossible to act on —
   and the fence's lease check is the backstop, not the control.
4. **It must never call `hr_apply` directly.** One settle path, `hr_tick_settle`, per flush window.
   A guard should assert the absence of an `hr_apply` call on the tick branch by execution.
5. **M-1's fix, on the receiving side.** The entry must chain windows on `shadow_accrued_to` when
   the payload carries it and fall back to `accrued_to` when it is NULL, and re-derive the
   per-window seed from the *same* effective watermark the roster used — seeding every shadow
   window from one constant instant is the `fixedSeed` mutant (+48% gold, three rare drops at rate
   zero). `tests/world-tick-shadow-chain.mjs` should be extended to drive the entry end to end.
6. **`verify_jwt = true` stays on**, and `tests/edge-jwt-gate.mjs --strict` must still pass with the
   new branch in place. If the branch weakens that gate for player requests, it is a BLOCK.
7. **Replay and reordering.** A replayed POST, a POST with a stale roster, and two POSTs racing the
   same batch must all be safe — the fence handles the last of these, so the question for m1b is
   whether the entry can turn one refused settle into an aborted batch (it must not: a refused
   character must not abort the other 199).
8. **Rate limiting and body size.** A batch is `batch_limit ≤ 500` characters of full `hr_state_of`
   envelope. An unbounded body on a pre-auth path is a cheap denial-of-service against the function
   that writes all player value; cap it and reject early.
9. **Rotation.** Rotating `hr_tick_shared_secret` means Vault and `supabase secrets set` must move
   together; the review should state what happens during the window where they disagree (expected:
   refusals, never a bypass).

---

## 8. Residual risk accepted

1. **PGlite is not production.** Single-connection, PG18 against production's PG17. Every
   concurrency claim here is a proof about the **mechanism** — lock before read, CAS against the
   locked row, UPDATE in the same transaction — with the interleaving simulated by ordering. The
   `--mutate` arm makes that mechanism measurable, but the concurrency claim is re-confirmed
   read-only on production before arming (design §15c item 5).
2. **A compromised tick host can propose any legal delta for any character the roster leased it**,
   bounded by `hr_apply`'s per-call and per-day clamps and journalled in `player_ledger`. Strictly
   narrower than before the fence, because the lease is written by a role the settler cannot
   become. Detectable and reversible, not prevented. The per-day ledger budget is the binding
   bound and it should be the thing that alerts.
3. **S-7's RNG oracle stands, unchanged and unnarrowed** (M-3). `hr_engine` has held it since
   2026-08-11 and the edge uses it. Re-open if it is ever used for something a player can
   predict-and-choose.
4. **The 15 "overlapping" windows are still unmeasured on production.** The classification is fixed
   and `writer-authz` S-5a/S-5b are green, but `tools/world-tick-replay.mjs --gather` has not been
   re-run against the real database. That is the Coordinator's, and the count must be 0.
5. **M-2's fix is a restatement of a live security body.** I have not reviewed a body I have not
   seen. The allowlist migration gets its own read before it applies — it is short, but it is the
   detector.

---
---

# RE-VERIFY 2026-09-21

**Reviewer:** security-engineer (veto) · **Branch reviewed:** `lane/world-tick-m1c` @ `f6af3762` ·
**Review branch:** `sec/world-tick-m1-reverify` · **Range read:** `425c4f53..f6af3762`, hunk by hunk ·
**Prior verdict:** the section above (BLOCK; M-1 P0, M-2 P1, M-3…M-6 P2; SHADOW ON PRODUCTION: BLOCK)

**No production writes and no production reads were made.** Every arm below ran against a PGlite
database rebuilt from `supabase/migrations` in `tests/schema-apply-order.json` order.
`@electric-sql/pglite` is a declared devDependency and was absent from this container; it was
installed with `--no-save`, so `package.json` and `package-lock.json` are untouched (`git status`
clean before the branch was cut). **Six of the eighteen guards abort with exit 2 — harness, not
red — without it, so the first sweep's "reds" were meaningless and are not reported as findings.**

## A.1 M-1 … M-6, finding → commit

| # | Required change | Landed? | Where | Verified by |
|---|---|---|---|---|
| **M-1** | Send `shadow_accrued_to` in the driver's projection; have the entry chain on it | **YES, and exceeded** | `ea5ede9d` · cron `:311-331`; roster `:294-299`, `:400-421`, `:455`, `:463-490`; tick.js `probeWatermark` | `tests/world-tick-shadow-chain.mjs` **exit 0** — SC-1 (11 payload keys), SC-2 (4 fires → 4 windows, was 1), SC-3 control still green |
| **M-2** | A fourth migration restating `hr_assert_grant_hygiene` to admit `hr_tick_settle` | **YES** | `b8dd811d` · `2026-09-21-engine-allowlist-tick-settle.sql` (735 lines), chained at `tools/derive-grant-hygiene.mjs` link 10 | `hr_assert_grant_hygiene(true)` **returns without raising** at the end of the assembled chain (executed, below). `derive-grant-hygiene --check` **exit 0** — 10 links, 11 patches, in sync |
| **M-3** | Delete the `hr_tick_seeds` claims or build the wrapper | **YES — deleted, and S-7 restated honestly** | roster `:14-31`, `:104-125`, `:537-546` | `grep -rn hr_tick_seeds` → **0 hits repo-wide** |
| **M-4** | Correct the "exactly three" sentence; add the end-of-chain equality | **YES** | fence `e21`/`e21b` (`:820-846`) | executed: `hr_tick` holds **exactly one** routine grant, `hr_tick_roster`, by `information_schema` **and** by `aclexplode(proacl)` |
| **M-5** | A CHECK pinning `edge_url`'s scheme and host | **YES** | fence `:232-243` + `e22`/`e22b`/`e22c` | executed against the REAL table: `http://attacker.example/c` **REFUSED**, `…supabase.co.attacker.example/…` **REFUSED**, the real URL **ACCEPTED** |
| **M-6** | Restate 10× as OVER rather than AT; gate `flush_seconds`/`batch_limit` on Reliability | **YES, and better** | `25d06054` · cron `:72-118` | the corrected table says 500 active = **100% OF IT. OVER.**, states shadow costs the ledger **zero**, and attaches the measured pre-arm read |

**All six landed as specified or better. No proof test and no guard was weakened.**
`tests/world-tick-shadow-chain.mjs` is **byte-identical** to the file I wrote on `sec/world-tick-m1`
— `git log 425c4f53..f6af3762 -- tests/world-tick-shadow-chain.mjs` returns **zero commits** — so
SC-1 and SC-2 went green **by code change alone**, which is the only way that mattered.

## A.2 Executed evidence (real exit codes, `$?` read, not a pipeline's)

| Command | Exit | What it showed |
|---|---|---|
| `node tests/world-tick-shadow-chain.mjs` | **0** | was **1**. M-1 closed; the chain tiles |
| `node tests/world-tick-writer-authz.mjs` | **0** | S-1…S-5 still closed |
| `node tests/world-tick-double-pay.mjs` | **0** | one window paid once; kill switch; SHADOW pays nothing; the lease decides |
| `node tests/world-tick-double-pay.mjs --mutate` | **0** | every arm red with the fence bypassed — the arms measure the fence |
| `node tests/world-tick-parity.mjs` | **0** | P1–P4, P-G1…P-G9 |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 9 global statements, all pre-existing; **the lane added no acknowledgement** although it added `e21`, `e22`, `e22b`, `e22c` and the whole allowlist file |
| `node tests/selfcheck-no-global-dml.mjs --selftest` | **0** | |
| `node tests/selfcheck-no-global-dml.bypass.mjs` | **0** | the bypass proof still bites |
| `node tests/schema-drift.mjs` | **0** | the four-file chain replays, byte-identical second apply, bystander ledger rows intact |
| `node tests/apply-order-honesty.mjs` | **0** | |
| `node tests/restore-census.mjs` | **0** | |
| `node tests/guard-hygiene.mjs` | **0** | |
| `node tools/derive-grant-hygiene.mjs --check` | **0** | `derivation in sync (10 links, 11 patches)` |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green.` |
| `node tools/pack-edge.mjs hr-accrue --check` | **0** | 75 files (45 vendored), 1708.7 KB |
| `node tools/pack-edge.mjs hr-accrue --hash` | **0** | `253215e48d3e2b3ccd3d1ebec1f52e529d3e8cf50147429ef80915c680ab14d8` |
| `node tests/edge-tick-gate.mjs` | **0** | 60+ arms (see B.2) |
| `node tests/edge-tick-gate.mjs --selftest` | **0** | |
| `node tests/edge-jwt-gate.mjs --selftest` | **0** | |
| `node tests/edge-jwt-gate.mjs --strict` | **2 — NOT RUN** | `CONTROL FAILED … Host not in allowlist: nezapsylztqbbwuwembx.supabase.co`. This container's egress policy blocks the project, so the guard aborted on its own control rather than testing anything. **It is the Coordinator's to run.** Item B(2) is answered below from the code and from the offline arms instead, and that is stated as the weaker evidence it is |
| **`node tests/world-tick-edge-contract.mjs`** | **1** | **NEW — T-1 and T-2 below. EC-1b, EC-2a, EC-3a/b/c red; EC-1c, EC-2b, EC-2c, EC-3d green** |

Executed directly on the assembled chain (not through a guard):

```
hr_assert_grant_hygiene()      -> {"ungated_client_rpcs":[], … "engine_execute_outside_allowlist":[], …}
hr_assert_grant_hygiene(true)  -> returns, does NOT raise            ← M-2 CLOSED
hr_tick routine grants          -> ["hr_tick_roster"]  (information_schema AND aclexplode)   ← M-4 CLOSED
edge_url: http://attacker.example/c                                  -> REFUSED (check_violation)
edge_url: https://nezapsylztqbbwuwembx.supabase.co.attacker.example/ -> REFUSED (check_violation)
edge_url: https://nezapsylztqbbwuwembx.supabase.co/functions/v1/…    -> ACCEPTED               ← M-5 CLOSED
```

## A.3 Will the three — now four — self-checks pass on a PRODUCTION database?

The 2026-09-20 class is "a self-check that touches real rows". Re-checked against the new blocks:

- **`e22` writes to a TEMP table, not to `hr_tick_config`.** `create temp table hr921_cfg_probe (like
  public.hr_tick_config including defaults including constraints) on commit drop`, and the seven
  hostile URLs are INSERTed there. `including defaults` is load-bearing and the file says so — without
  it the probe INSERTs would fail on `enabled` being null and `e22` would "pass" without reaching the
  CHECK. `selfcheck-no-global-dml` **exit 0** with no new acknowledgement, which is the strong form.
- **`e22c` reads `pg_class`, `pg_policies` and `has_table_privilege` only.** It names `anon`,
  `authenticated`, `service_role`, `hr_engine`, `hr_tick`; all five exist on production by the time
  the fence applies (`hr_tick` is created by step 1).
- **`e21` is the one I am not willing to call green on production from here.**
  `information_schema.role_routine_grants` is filtered to rows whose **grantor or grantee is a
  currently enabled role**. PGlite replays the whole chain as one superuser, so the filter is
  invisible there. On production the applying role is the grantor of every grant this chain makes, so
  `e21` will see them — but a grant made to `hr_tick` by a **different** grantor would be invisible to
  it, and `e21` would report "exactly 1" while a second grant existed. It bites for the case it was
  written for and is blind to the one that would matter most. **T-8**, below; the unfiltered spelling
  is `aclexplode(p.proacl)`, which I ran here and which agreed.
- **`I-2` (the `set local role hr_engine` transition at `e12`/`e14`/`e15`) is unchanged and still
  unexercised on production.** Pre-apply read (1) in §6 above is still the gate, and is repeated in
  the runbook below.
- **The new allowlist file's own self-check is the strongest in the lane**: it asserts the entry was
  recorded, that **no** entry an earlier link recorded was dropped, that `hr_assert_grant_hygiene(true)`
  **passes**, and it carries a **mutation arm** that grants `hr_engine` EXECUTE on an unlisted
  function and requires the detector to both name it and be fatal. That is the §4 shape, executed.

## A.4 Did anything risky ride along?

Read hunk by hunk. Nothing in the range weakens a control. Two things changed that the commit
messages do not name:

1. **`hr_tick_roster`'s `accrued_to` column changed meaning** — it was `player_state.accrued_to`
   (the paid mark) and is now the **effective watermark** (`greatest(…)` while shadowed). That is
   the right fix and it is documented at `roster:294-299`, but it is a **contract change on a column
   another consumer could already be reading**. `tools/world-tick-replay.mjs` and
   `services/world-tick/**` are the only other readers and neither calls the RPC. Recorded, not a
   finding.
2. **`services/world-tick/{contract,gather,shadow}.js` lost 802 lines** and the same code now lives
   at `supabase/functions/hr-accrue/tick-{contract,gather,shadow}.js`. This is the move `7f80680`
   made and `2556d917` fenced. **`tools/pack-edge.mjs`'s `tickCallerProblems` was rewritten, and it
   bites HARDER than the rule it replaced**, not softer: `caller: 'tick'` is now confined to four
   named modules, a payload carrying any tick module must also carry `HR_TICK_SHARED_SECRET` **and**
   a `tickGate(` call, and nothing but `tick.js` and the entrypoint may import a tick module —
   mutation-proved by `T-F1a…T-F1g`. A "never" rule was restated rather than deleted. Good.

---

# OP:TICK REVIEW 2026-09-21

**Subject:** `2556d917` and everything later touching `supabase/functions/hr-accrue/**`
(`ea5ede9d` adds `probeWatermark`/`planSeedLabels`). **First review.** It does not inherit the
verdict above.

**Pack hash reviewed:** `253215e48d3e2b3ccd3d1ebec1f52e529d3e8cf50147429ef80915c680ab14d8`
(`node tools/pack-edge.mjs hr-accrue --check` exit 0, `--hash` exit 0).

## B.1 Findings

| # | Sev | Title | Status | File:line |
|---|---|---|---|---|
| **T-1** | **P0 — BLOCKS the edge entry and SHADOW** | The entry hands Postgres a timestamp spelling Postgres refuses. `probeWatermark` throws for every character of every fire; the 48 h parity run journals **zero** rows | **CONFIRMED by execution** | `tick.js:408` (and `:427`) |
| **T-2** | **P0 — BLOCKS SHADOW** | The tick and the accrue path label the same window differently, so `hr_seed` draws a **different stream**. The parity number would measure the PRNG, not the tick | **CONFIRMED by execution** | `tick.js:380`, roster `:507` vs `index.ts:785` |
| **T-3** | **P1** | `edge-tick-gate.mjs`'s `exec` stub is more forgiving than the transport — it answers `select now()` with an ISO **string** — which is why 60 green arms cannot see T-1 | **CONFIRMED** | `tests/edge-tick-gate.mjs:118` |
| **T-4** | P2 | The driver POSTs every rostered character's full `hr_state_of` envelope; the entry reads `user_id` and `slot` and **nothing else**. Multi-MB bodies through `net.http_request_queue` for nothing | **CONFIRMED (code read)** | cron `:311-331` vs `tick.js` `parseSelectors` |
| **T-5** | P2 | The tick bearer transits `net.http_request_queue.headers` in plaintext. Nothing in the repo establishes who can read that table | **PLAUSIBLE — unverifiable without production** | cron `:417-423` |
| **T-6** | P2 | `below_flush` is decided **after** the `hr_state_of` projection, so 8 of every 9 fires burn a full envelope per character — twice per character per fire counting the roster's own | **CONFIRMED (code read + shipped config)** | `tick.js:415-432` |
| **T-7** | P2 | `net.http_post` is asynchronous, so the driver's advisory xact lock does **not** bound EDGE concurrency. **This corrects my own claim of 2026-09-21** | **CONFIRMED (code read)** | cron `:291` vs `:417` |
| **T-8** | P2 | `e21`'s `information_schema.role_routine_grants` is filtered by enabled roles; a grant from another grantor is invisible to it | **CONFIRMED** | fence `e21` (`:835`) |
| I-5 | Info | The watermark probe's write-safety rests **entirely** on step (7)'s null-version refusal — load-bearing, undocumented as such, and until now untested. `EC-2c` pins it | Accepted, guard owed | fence `:(6)/(7)`, `tick.js:340-357` |
| I-6 | Info | There is no nonce and no timestamp in a tick request, so a captured bearer is a full tick invocation until rotation. Bounded by the lease and the CAS | Accepted residual | `tick.js` `tickGate` |

### T-1 — the entry speaks a timestamp dialect Postgres refuses  **[P0, BLOCK]**

`tickOne`'s first two statements:

```js
// supabase/functions/hr-accrue/tick.js:407-408
const read0 = await exec('select now()::timestamptz as now', []);
const nowIso = String(read0[0].now);
```

`nowIso` is then bound as `$7::timestamptz` (`p_window_to`) **and** written into
`delta.accrued_to`, which the fence compares with `= p_window_to` at step (2).

The `postgres` driver parses OID 1184 into a JS **`Date`** — it is given no `types` override
(`index.ts:140-147`) — so `String(read0[0].now)` is not an ISO string. It is
`"Mon Sep 21 2026 17:58:04 GMT+0000 (Coordinated Universal Time)"`, and Postgres answers
`22P02 invalid input syntax for type timestamp with time zone`.

`probeWatermark` is the **first engine statement of every character of every fire** — the entry
reads the watermark from the fence precisely so the body cannot choose it — so it throws before
anything else runs. `runTick` catches per character and records `refused: error:invalid input
syntax for typ…`, and the fire returns **HTTP 200** with `{ok:true, processed:0, refused:N}`.

**Blast radius.** No value moves, no forgery, no exfiltration: it is a **total, silent failure of
the measurement the milestone exists to take** — the same shape as M-1, which blocked this lane
this morning, and worse in one respect: M-1 journalled one row per character, T-1 journals **zero**,
and `hr_tick_cron_log` reads `posted` on every fire because `net.http_post` is asynchronous. The
operator's own runbook step 6 ("read `hr_tick_shadow`") would show an empty table after 48 hours
with every dashboard green.

**Proof (added here, red on purpose):**

```
node tests/world-tick-edge-contract.mjs → exit 1
  ✓ EC-1a — the driver parses timestamptz into a JS Date, as `postgres` does in the edge
  ✗ EC-1b — `String(now)` is NOT a timestamptz Postgres accepts
            value : Mon Sep 21 2026 17:58:04 GMT+0000 (Coordinated Universal Time)
            error : invalid input syntax for type timestamp with time zone
  ✓ EC-1c (control) — the ISO spelling of the SAME instant round-trips
  ✗ EC-2a — the probe THREW instead of returning a refusal code
  ✓ EC-2b (control) — the ISO spelling is answered `window_already_settled` carrying the mark
  ✓ EC-2c (control) — the probe wrote nothing
```

EC-1c and EC-2b are the controls and they are green, which localises the fix to **one expression**.

**Required change.** `tick.js:408` → `const nowIso = new Date(read0[0].now).toISOString();` and
`:427` likewise (`new Date(row.now).getTime()`; `String()` happens to survive there because JS can
parse what Postgres cannot, which is exactly how this hid). This is the spelling `index.ts:775`
already uses on the accrue path and calls out in a comment — *"`nowMs` is `new Date(read.now).getTime()`"*.
`tests/world-tick-edge-contract.mjs` is the exit code.

### T-2 — one instant, two seed labels, two RNG streams  **[P0, BLOCK on SHADOW]**

`hr_seed(user, slot, label)` hashes the **label**. Three places spell one window's label:

| | expression | result |
|---|---|---|
| accrue path | `'accrue:' + String(st.accrued_to)`, `st` = the `hr_state_of` **JSONB** envelope (`index.ts:699`, `:785`) | `accrue:2026-09-21T17:55:55.739123+00:00` |
| tick | `'accrue:' + new Date(ms).toISOString()` (`tick.js:380`) | `accrue:2026-09-21T17:55:55.739Z` |
| roster | `'accrue:' \|\| to_char(l.mark …,'…MS"Z"')` (roster `:507`) | `accrue:2026-09-21T17:55:55.739Z` |

The tick and the roster agree with each other and **neither agrees with the accrue path**:
`+00:00` vs `Z`, and microseconds vs milliseconds. Executed, `hr_seed` over the two labels:
**`-1921344458354348381` vs `7953584315518101330`.**

The roster's own header (`:501-506`) states it derives the label *"EXACTLY as hr-accrue/index.ts
derives it"*, and warns in the same comment that getting this wrong *"would report a parity number
that says more about the PRNG than about the tick."* That is precisely what it does.

**Blast radius.** In SHADOW, **no value moves** — this is not a mint and not player-choosable, since
both streams are server-held. It destroys the **comparison**: every RNG-driven outcome (drops, rare
drops, crits) in `hr_tick_shadow` diverges from what accrual actually paid, by construction, and the
natural reading of a 48 h mismatch is "the tick is wrong" — or, worse, "loosen something". Armed, it
would mean the tick pays a different stream than the accrue path would have for the same window;
still not a mint, still not player-facing, but no longer the *one engine* AWAY-12 asks for in the
sense that matters.

**Proof:** `EC-3a`, `EC-3b`, `EC-3c` red; `EC-3d` (green) pins the difference to the spelling.

**Why no guard saw it.** `tests/world-tick-parity.mjs` feeds the JS helper `seedFor(user, slot, ms)`
to **both** sides of every comparison (`:227`, `:710`, `:808`), so it is structurally blind to how
production spells the label. Nothing in the repo compares the accrue path's label to the tick's.

**Required change.** One spelling, in two files that must move together: `tick.js:380`'s label and
roster `:507`'s `to_char`. The accrue path is the incumbent and has 200 days of live seeds behind
it, so **it is the one that must not move**; derive the other two from the `hr_state_of` JSONB
rendering (`to_jsonb(ts) #>> '{}'` in SQL; the envelope's own `accrued_to` string in JS — which the
entry already holds, since `probeWatermark` returns the fence's `accrued_to` verbatim before it is
parsed to `markMs`). **The roster is unapplied, so this costs one line now and a migration later.**

### T-3 — the stub is more forgiving than the transport  **[P1]**

```js
// tests/edge-tick-gate.mjs:118
if (/^select now\(\)/.test(text)) return [{ now: NOW_ISO }];
```

`NOW_ISO` is a **string**; the driver returns a **Date**. The stub's `hr_state_of` answers
`now: NOW_ISO` too. Sixty-plus arms exercise the entry end to end and every one of them is green
while the deployed bytes refuse every settle.

`supabase/functions/hr-accrue/cors.js` already carries this lesson in its header — *"a check that
does not use the transport the player uses is checking a different system"* — written after the
function shipped correct, deployed and unreachable with every guard green. The same file, the same
mistake, four months apart.

**Required change.** The stub returns `new Date(NOW_MS)` for `select now()` and for `hr_state_of`'s
`now`, and the `hr_tick_settle` arm `Date.parse()`es its `wFrom`/`wTo` parameters and **fails the
arm** on `NaN` rather than silently comparing `NaN`. `tests/world-tick-edge-contract.mjs` stays as
the transport-level backstop either way; a stub that models the driver is not a substitute for a
guard that uses it.

### T-4 — the driver ships 200 full player envelopes the entry never reads  **[P2]**

`hr_tick_cron_run` projects eleven keys per character including `state` — the whole `hr_state_of`
envelope (inventory, fifteen skills, farm, progress) — and `version`, `seed`, `active_kind`,
`active_id`, `active_since`, `shard`. `parseSelectors` (`tick.js:258-280`) reads **`user_id` and
`slot`**, drops everything else, and the entry re-derives each of them from the database inside the
request. That is the correct design — it is what makes "the server picks whose world ticks" true —
but the payload was never trimmed to match it.

At the shipped `batch_limit = 200` that is a multi-megabyte POST every 10 seconds, carrying 200
players' complete state through `net.http_request_queue.body`, to be discarded. It is also why the
entry needs a 4 MiB body ceiling at all.

**Required change.** Project `user_id` and `slot` only (keep `accrued_to` if the keyset wants it).
The body drops to a few KB, `MAX_BODY_BYTES` becomes generous instead of load-bearing, the roster
stops computing 200 envelopes per fire (T-6), and no player state enters pg_net's tables at all.
Not a blocker; it is the single highest-value line in this review after the two P0s.

### T-5 — the tick bearer transits a pg_net table in plaintext  **[P2, PLAUSIBLE]**

The migration's handling of both secrets is **correct and I verified it**: read from
`vault.decrypted_secrets` at call time via dynamic EXECUTE, used once, never returned, raised or
journalled; the error path logs `sqlstate` **only** (`cron:425-432`); `hr_tick_cron_note`'s `detail`
carries `shadow`/`holder`/`cursor_wrapped` or `sqlstate`/`hint` and nothing bearer-shaped;
`cron.job_run_details.return_message` gets `hr_tick_cron_run`'s jsonb, which has no secret in it.

What the migration does not control is what `net.http_post` does with the header jsonb it is handed:
pg_net **inserts it into `net.http_request_queue`** (method, url, **headers**, body, timeout) and the
background worker deletes the row after it drains. So `X-HR-Tick-Auth` and the gateway key sit in a
table row for the queue latency — and **indefinitely if the worker is stopped or backed up**, which
is exactly when somebody will be looking at that table. `net._http_response` does not carry request
headers, but it does retain the tick's response body for its TTL (counts and reason strings only —
no player data, which I checked).

`grep -rn 'http_request_queue'` over the repo returns **nothing**. The only mention of pg_net's
tables anywhere is the rotation note telling the operator to *read* `net._http_response`.

**I cannot verify the grants from here.** Making this closed is one read-only query, in the runbook
below, and it must be run **before** the Vault secret is minted, not after.

### T-6 — 8 of every 9 fires buy a full envelope to discover "below_flush"  **[P2]**

Shipped config, executed: `cadence_seconds = 10`, `flush_seconds = 90`, `batch_limit = 200`,
`shadow = true`, `enabled = false`. So `hr-tick-run` fires **8,640×/day**, and a character settles
once per **9** fires.

`tickOne`'s order is: (1) `select now()`, (2) `probeWatermark`, (3) **`hr_state_of` +
`hr_offline_cap_ms`**, and only then (4) `if (toMs - markMs < body.flushMs) return below_flush`.
Both operands of that test — `nowMs` and `markMs` — are already in hand after step (2). The
projection at step (3) is bought and thrown away on 8 fires out of 9.

And the roster has **already** computed the same envelope for the same character in the same fire
(roster `:512`), so at ≤ `batch_limit` active characters — the realistic beta size — `hr_state_of`
runs **twice per character per fire**:

| active characters | `hr_state_of` calls/day | at 3.23 ms | wasted |
|---|---|---|---|
| 50 | 864,000 | ~46 min/day | ~87% |
| 200 | 3,456,000 | **~3.1 h/day** | ~87% |

**Required change.** Move the `below_flush` test above the state read (three lines). Combined with
T-4 it removes both copies. Reliability's, not mine, but it lands on the database that is the only
copy of every player's progress.

### T-7 — the advisory lock does not bound the edge, and my last verdict said it did  **[P2]**

My 2026-09-21 verdict wrote: *"`pg_try_advisory_xact_lock` is taken first … so a slow tick **skips**
the next fire rather than queueing behind it."* That is true of the **driver** and false of the
**edge**. `net.http_post` returns a request id, not a response, so `hr_tick_cron_run` commits —
releasing the `_xact_` lock — while the edge invocation it started is still working. At a 10 s
cadence and a fire that does ~3 round trips per character over 200 characters, **overlapping edge
invocations on one roster are the normal case, not the edge case.**

It is **safe**: the lease is re-stamped to the same holder, the fence's lock-then-CAS makes the
second invocation's settle `window_already_settled`, and step (6) precedes the shadow INSERT at
step (8), so no duplicate shadow row is written either. It is **not free**: everything in T-6
happens twice over. Recorded so the next reader does not inherit my sentence.

### T-8 — `e21` cannot see a grant it did not make  **[P2]**

`information_schema.role_routine_grants` is filtered to rows whose grantor **or** grantee is a
currently enabled role. PGlite replays as one superuser so the filter never shows. On production the
applying role grants everything this chain grants, so `e21` will see those — but a grant handed to
`hr_tick` by another grantor (`supabase_admin`, a future operator) is **invisible**, and `e21` would
assert "exactly 1" over an incomplete set. The equality M-4 asked for is there; it is narrower than
it reads. `aclexplode(p.proacl)` is the unfiltered spelling and I ran both here; they agreed.
Not a blocker — it is a detector that should say what it measures.

## B.2 What I attacked and found CLOSED

Each of these is the brief's own list, answered.

**(1) Can a request without the exact bearer reach tick code — constant time — fail closed.**
**Closed.** `tickGate(headers, secret)` (`tick.js:222-231`) returns `null` when the header is absent,
so the request is *not a tick request* and falls through to the player path byte for byte —
including a body that says `op:'tick'`, which `parseIntent` has no reader for. The comparison
(`tickBearerOk`, `:196-205`) hashes **both** sides to a fixed 32 bytes with SHA-256 **before**
`timingSafeEqual`, so it is length-independent and cannot be turned into a length oracle by catching
`timingSafeEqual`'s throw — the trap I named in §7.1. A mismatch answers the **same**
`401 not_signed_in` the player path answers for a bad token. `tickSecretUsable` requires
**≥ 32 characters** (`MIN_SECRET_LEN`), so an unset, empty or truncated `HR_TICK_SHARED_SECRET`
**refuses every tick request** rather than matching an absent header. Arms `T-A2a…d`, `T-A3a/b`,
`T-A4a/b`. The only pre-hash early return is `presented.length === 0`, which distinguishes "empty"
from "wrong" and is not a secret.

**(2) Does the branch weaken or reorder the JWT gate for any non-tick op.** **Closed on the
evidence I have, which is not the evidence I wanted.** `supabase/config.toml:36` still pins
`verify_jwt = true`. `T-P1b` asserts against the **packed bytes** that `tickGate(` precedes
`await verifyJwt(`; `T-P1d/e` that `runTick` has exactly one call site and is reached only after
`if (!tick.ok)`; `T-P1f` that `index.ts` never discriminates on a body field; `T-W1a` that
`tickGate → verifyJwt → parseIntent → isKnownVerb → runSetActivity → computeAccrual` still appear in
that order; `T-W1b` that the player 401 is untouched. Reading the hunk: the branch adds no statement
before `req.method !== 'POST'`, and `let user: string; try { … verifyJwt … }` follows it unchanged.
**`node tests/edge-jwt-gate.mjs --strict` did not run here** — the container's egress policy blocks
the project host and the guard aborted on its own control (exit 2). It is in the runbook.

**(3) Can the body choose a user, slot, channel, timestamp, amount, window or the shadow flag.**
**Closed, and this is the best part of the entry.** `parseTickBody`/`parseSelectors` build
null-prototype objects field by field and read **four** things: `op` (must be the literal `tick`),
`roster[].user_id` (UUID-shaped, lower-cased), `roster[].slot` (integer 0–99), and `cadence_ms` /
`flush_ms`, both clamped to the ranges `hr_tick_config`'s CHECKs allow with `flush >= cadence`
re-imposed. **`holder`, `shadow`, `state`, `version`, `seed`, `accrued_to`, `active_*` and `shard`
are read by nothing.** Each is re-derived server-side: the holder from
`left('cron:'||current_database(),64)`; the watermark from **the fence's own refusal**, which is the
only way this role can read a table `hr_engine` is revoked from; state and version from
`hr_state_of`; the seed from `hr_seed`; `now` from Postgres; the mode from `hr_tick_config` inside
the fence. Naming a character can only **narrow** the set the server would have ticked anyway,
because the fence refuses anything the roster did not lease to this holder inside the lease window —
and `hr_tick_roster` is executable by `hr_tick`, a role this function cannot become. Arms
`T-B1a…T-B1k`, `T-G1a…c`. A malformed row is **dropped**, never coerced, and never aborts the batch.

**(4) CORS and methods.** **Closed.** `withCors` answers `OPTIONS` itself and never reaches the
handler; `GET` is the health probe; everything else is `405` **before** the tick branch.
`ALLOWED_ORIGINS` is a three-host allowlist plus localhost, and an unknown origin simply gets **no**
`Access-Control-Allow-Origin`, so a browser cannot read a tick response from a foreign page.
`allowedHeadersFor` echoes requested headers, so a browser can be granted permission to *send*
`x-hr-tick-auth` — which buys nothing without the secret, and "permission to send" is not
"permission to read". There is no `Access-Control-Allow-Credentials`. Nothing about CORS is an
authorization boundary here and the file says so.

**(5) What is logged and returned.** **Closed.** `grep -n 'console\.'` over `tick.js`,
`tick-gather.js`, `tick-shadow.js`, `tick-contract.js` → **nothing**. The tick branch in `index.ts`
logs nothing, and its catch returns `engine_unconfigured` (503) or a flat `tick_failed` (500),
**never the exception text** — deliberately, because that is the only string on this path that could
carry a fragment of a connection string. The response body is counts plus a `reasons` histogram; the
only caller-influenced string in it is `error:<pg message>.slice(0,64)`, and it contains no player
data and no secret. **No other player's envelope is ever returned** — the entry returns no envelope
at all.

**(6) Replay of a captured tick request.** **Safe, and stated honestly.** A replay presents the same
bearer and the same selectors; it settles at most what the next honest fire would have settled,
because the fence's watermark CAS under the row lock refuses an already-settled window whatever its
key, and an expired lease refuses outright (`D6b`). There is **no nonce and no timestamp** in a tick
request, so possession of the bearer is a full tick invocation until rotation — **I-6**, accepted:
capturing it means compromising the database or the function's env, and the fence bounds what the
holder can do to "what the roster leased it". That is narrower than a compromised edge deploy.

**(7) Resource abuse.** **Bounded, with T-6 and T-7 open.** `MAX_ROSTER = 500` truncates rather than
refuses (a forged oversize body must not be able to stop the world tick). `MAX_BODY_BYTES = 4 MiB`
is checked **twice** — by `Content-Length` and by counting bytes as they arrive, so a chunked sender
that omits the header is metered too — and the refusal is a flat `bad_request` that does not say
which reason (`T-BB1a…f`). `MAX_POLLS = 64` bounds the engine per character. **There is no overall
deadline in `runTick`**: a 500-character batch is ~1,500 round trips plus two full engine
simulations per settling character, and nothing stops at a wall clock. When the fence refuses, the
character is counted and the batch continues (`T-R1a/b/c`); the kill switch is read **through the
fence** before any work and an unrecognised answer **fails closed** (`T-K1a…f`).

**(8) One accrual engine (AWAY-12).** **Closed.** Every number comes out of
`settleGatherSession → gatherTick → shadowTick → computeAccrual`; there is no second gather path.
`pack-edge`'s rewritten fence now enforces this **structurally at pack time** (B.A.4 above).
One good detail: when a seed is missing the walk **breaks** (`tick-gather.js:208`) rather than
falling back to `seedFor`'s visible-values hash, so a diverged chain leaves the tail **owed** rather
than paying it on a predictable stream. That is the `fixedSeed` mutant closed at its root — which
makes T-2 the more frustrating, because the mechanism is right and only the spelling is wrong.

**(9) Rotation.** **Correct, and `f6af3762` makes it honest.** Vault first, then
`supabase secrets set`; in the gap the driver posts the new bearer, the edge holds the old one,
`tickGate` answers `401` — **refusals, never a bypass**, because an unset or short env fails closed.
No value is lost: the watermark does not move for a window nobody settled. The commit's real
contribution is deleting a sentence that said the driver "reports `error`" in that window: it does
not, because `net.http_post` is asynchronous, so the fire log says `posted` and the 401 never
reaches it. Verify a rotation from `net._http_response` or the function logs, never the fire log.
**A runbook that names the wrong symptom is worse than one that says nothing**, and this one now
names the right one.

**(10) The pg_net side.** **Vault handling closed; the queue is T-5.** See T-5 above.

## B.3 Residual risk accepted (additions to §8)

6. **PGlite is still not production**, and T-1 is the proof that this matters in a direction §8 did
   not name: the *driver* differs too, not only the server. Every claim in B.2 that rests on a stub
   rather than on a real connection is weaker than it reads, and T-3 is the standing fix.
7. **`node tests/edge-jwt-gate.mjs --strict` was not run.** The Coordinator's, before the deploy.
8. **A compromised tick host can still propose any legal delta for any character the roster leased
   it**, bounded by `hr_apply`'s clamps and journalled in `player_ledger`. Unchanged by this lane.
9. **T-5's grants are unread.** Until that query runs, "the bearer is never stored in a table" is a
   statement about the migration, not about the system.

---

## VERDICT

**`2026-09-20-world-tick-roster.sql`: BLOCK**
**`2026-09-21-world-tick-settle-fence.sql`: GO**
**`2026-09-21-engine-allowlist-tick-settle.sql`: GO**
**`2026-09-21-world-tick-cron.sql`: GO**
**OP:TICK EDGE ENTRY at pack hash 253215e48d3e2b3ccd3d1ebec1f52e529d3e8cf50147429ef80915c680ab14d8: BLOCK**
**SHADOW ON PRODUCTION: BLOCK**

M-1 through M-6 are all closed, and closed well — the fence, the allowlist and the driver are
finished work. The roster is blocked on **one line**: `to_char(l.mark …,'…MS"Z"')` at `:507` is not
the spelling the accrue path has used for 200 days, and the file is unapplied, so fixing it now
costs a line and fixing it later costs a migration that restates a live body. The edge entry is
blocked on **two expressions**: `tick.js:408` speaks a timestamp dialect Postgres refuses, and
`tick.js:380` spells the seed label the roster's way rather than the accrue path's. Nothing here is
a value defect, a forgery or an exfiltration — all three are ways the 48-hour measurement the
milestone exists to take would come back empty or meaningless while every dashboard read green.

### The three changes that clear every verdict above

1. `tick.js:408` → `new Date(read0[0].now).toISOString()`; `:427` → `new Date(row.now).getTime()`.
2. `tick.js:380` and roster `:507` → derive the label from the `hr_state_of` JSONB rendering, which
   is what `index.ts:785` uses. **The accrue path does not move.**
3. `tests/edge-tick-gate.mjs:118` and its `hr_state_of` arm → return `new Date(NOW_MS)`, and fail the
   `hr_tick_settle` arm on an unparseable window bound.

**`node tests/world-tick-edge-contract.mjs` is the exit code.** EC-1b, EC-2a and EC-3a/b/c must go
green; EC-1c, EC-2b, EC-2c and EC-3d must **stay** green. When they do, delete the file's entry from
`tests/guards-unregistered.json` and register it in `smoke.yml` next to the other
`db-replay-2` guards — and **keep EC-2c**, which pins a property nothing else asserts (I-5).

I have reviewed the fix I am asking for and it is three expressions; this does not need a new
Security pass on the money path. Re-run the five guards, re-pack, and the verdict above becomes
**GO / GO / GO / GO, OP:TICK GO at the new hash, SHADOW ON PRODUCTION GO** on the strength of
`world-tick-edge-contract` exiting 0 — **plus runbook step 0 below, which is owed whatever the
edge does.**

---

## THE COORDINATOR RUNBOOK — on re-verify, once the three changes land

Written out in full now so the apply is not blocked on me a third time. **Do not start it until
`node tests/world-tick-edge-contract.mjs` exits 0.** One file per `apply-migration` call, never
inside `begin/commit`, never 00:00–00:10 UTC, Coordinator only.

### Step 0 — PRE-APPLY, READ-ONLY. Every statement is a read.

Run as the applying role. The ten checks in §6 above stand unchanged and are still owed; these
three are **new** and one of them is T-5.

```sql
-- (0a) ★ T-5. WHO CAN READ pg_net's QUEUE — the table the tick bearer transits.
--      Run this BEFORE minting the Vault secret, not after.
select c.relname,
       has_table_privilege('anon',         'net.'||c.relname, 'SELECT') as anon,
       has_table_privilege('authenticated','net.'||c.relname, 'SELECT') as authed,
       has_table_privilege('service_role', 'net.'||c.relname, 'SELECT') as service_role,
       has_table_privilege('hr_engine',    'net.'||c.relname, 'SELECT') as hr_engine
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'net' and c.relkind = 'r';
--   EXPECT: every column FALSE for every row. A TRUE on http_request_queue means the tick
--   bearer is readable by that role and the milestone does not arm until it is revoked.
--   If `net` does not exist yet, run this again after `create extension pg_net`.

-- (0b) Queue depth, so "the worker is draining" is measured rather than assumed. A backed-up
--      queue is how a transient row becomes a stored secret.
select count(*) as queued, min(id) as oldest from net.http_request_queue;
--   EXPECT: 0 (or a handful). Anything growing = do not arm.

-- (0c) ★ T-8. The end-of-chain grant equality, in the UNFILTERED spelling, so the answer does
--      not depend on who granted what. Run before step 1 and again after step 4.
select p.proname
  from pg_proc p, aclexplode(p.proacl) a
 where a.grantee = 'hr_tick'::regrole and a.privilege_type = 'EXECUTE'
   and p.pronamespace = 'public'::regnamespace
 order by 1;
--   EXPECT: zero rows BEFORE step 1 (hr_tick does not exist — the query errors, which is the
--   expected answer); exactly ["hr_tick_roster"] AFTER step 4.
```

Then the ten checks of §6, unchanged. **(4) is the one that must not be skipped**:
`select public.hr_assert_grant_hygiene();` must return **without raising** before any of this, or
M-2's post-apply state is indistinguishable from a pre-existing regression.

### Steps 1–4 — the applies, in this order

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-20-world-tick-roster.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-settle-fence.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-engine-allowlist-tick-settle.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-cron.sql
```

**Step 3 must not trail step 2 overnight** — between them the 04:50 UTC `hr-grant-hygiene` job
raises, and a detector that is expected red hides the next real regression. Step 3 restates a live
body, so afterwards: `node tests/live-hash-drift.mjs --live --write` (**expect a move on
`hr_assert_grant_hygiene` and NO move on `hr_apply`**), whys from `--codediff`, all four apply-order
notes flipped to APPLIED, `node tests/restore-census.mjs`.

Steps 1–4 are **inert**: a disarmed config singleton, two unreachable tables, one function granted
to one role, and a cron job that fires every 10 s, reads `enabled = false` and returns
`tick_disabled`.

### Step 5 — pg_net, then the secrets

```sql
create extension if not exists pg_net;          -- if (0a) showed `net` absent
```
Re-run **(0a)**. Then, in a psql session — never in argv, never into a file the repo can see:

```sql
select vault.create_secret(encode(gen_random_bytes(32),'hex'), 'hr_tick_shared_secret',
  'X-HR-Tick-Auth: pg_net -> hr-accrue op:tick. Rotate by create_secret again.');
select vault.create_secret('<the project anon key>', 'hr_tick_gateway_key',
  'Authorization: Bearer — satisfies verify_jwt at the gateway. NOT the tick''s authorisation.');
select decrypted_secret from vault.decrypted_secrets where name = 'hr_tick_shared_secret';
```
```bash
npx supabase secrets set HR_TICK_SHARED_SECRET=<that value> --project-ref nezapsylztqbbwuwembx
```

### Step 6 — the edge deploy, and the hash check

```bash
node tools/pack-edge.mjs hr-accrue --check
node tools/pack-edge.mjs hr-accrue --hash          # record it
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> \
  --project-ref nezapsylztqbbwuwembx
curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue   # GET health probe
#   the returned payload_sha256 MUST equal --hash. The in-page payload guard is red until it does.
node tests/edge-jwt-gate.mjs --strict     # ← did NOT run in my container. Must be exit 0.
```

### Step 7 — point the driver, and arm in SHADOW

```sql
update public.hr_tick_config
   set edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';
--   Any other value is now a check_violation (M-5). If this UPDATE succeeds, the URL is on-origin.

-- THE ROLLOUT COHORT. The tick ticks NOBODY until a row says otherwise: hr_tick_ownership is
-- empty and the fence refuses `not_tick_owned`. Start with the QA account alone.
insert into public.hr_tick_ownership (user_id, slot, channel, owned)
values ('<the QA account uuid>', 0, 'gather', true)
on conflict (user_id, slot, channel) do update set owned = true;

select enabled, shadow, channels, cadence_seconds, flush_seconds, batch_limit, edge_url
  from public.hr_tick_config;
--   EXPECT: f, t, {gather}, 10, 90, 200, the on-origin url.

update public.hr_tick_config set enabled = true, shadow = true;   -- ← the 48 h window starts
```

Widen the cohort only after the first hour's parity reads clean, and **only by INSERTing more
`hr_tick_ownership` rows** — never by raising `batch_limit`, which needs Reliability's sign-off with
M-6's arithmetic attached, as does any change to `flush_seconds`.

### The kill switch

```sql
update public.hr_tick_config set enabled = false;    -- stops settling; the job still fires, cheaply
select public.hr_cron_drop('hr-tick-run');           -- stops the driver entirely
```
Both are reversible and neither needs a migration or a deploy. **Use the first one at any surprise.**

### Step 8 — the parity queries, and what number means "parity holds"

Run at T+1 h, T+24 h and T+48 h.

```sql
-- (8a) IS IT RUNNING AT ALL — the T-1 question. This is the first thing to read, because
--      hr_tick_cron_log will say `posted` every fire even if the edge refuses every character.
select count(*) as shadow_rows, min(window_from) as first, max(window_to) as last
  from public.hr_tick_shadow where window_to > now() - interval '1 hour';
--   EXPECT at 1 character, 90 s flush: ~40 rows/hour. ZERO ROWS = T-1 is back. Stop.

-- (8b) DO THE WINDOWS TILE — the M-1 question. Overlaps or gaps mean the parity sum counts
--      minutes twice or not at all.
select count(*) as windows, count(*) filter (where prev is not null and window_from <> prev) as breaks
  from (select window_from, window_to,
               lag(window_to) over (partition by user_id, slot order by window_from) as prev
          from public.hr_tick_shadow) t;
--   EXPECT: breaks = 0 (the first window of each character is excluded by `prev is not null`).

-- (8c) THE PARITY SUM. What the tick WOULD have paid, against what accrual DID pay, over the
--      same characters and the same span.
with tick as (
  select user_id, slot, sum(would_gold) as gold, sum(would_qty) as qty, sum(would_ticks) as ticks,
         min(window_from) as f, max(window_to) as t
    from public.hr_tick_shadow
   where window_to > now() - interval '48 hours'
   group by 1,2),
acc as (
  select l.user_id, l.slot, sum(l.gold_in) as gold, sum(l.qty_in) as qty
    from public.player_ledger l join tick on tick.user_id = l.user_id and tick.slot = l.slot
   where l.at >= tick.f and l.at < tick.t and l.kind = 'gather' and l.intent = 'accrue'
   group by 1,2)
select t.user_id, t.slot, t.gold as tick_gold, a.gold as accrue_gold,
       round(100.0 * (t.gold - a.gold) / nullif(a.gold,0), 2) as gold_pct,
       t.qty as tick_qty, a.qty as accrue_qty,
       round(100.0 * (t.qty - a.qty) / nullif(a.qty,0), 2) as qty_pct
  from tick t left join acc a on a.user_id = t.user_id and a.slot = t.slot;

-- (8d) THE REFUSAL HISTOGRAM. Any non-zero `error:` count is a T-1-shaped defect.
select outcome, count(*), sum(rostered) from public.hr_tick_cron_log
 where at > now() - interval '48 hours' group by 1 order by 2 desc;
--   EXPECT: `posted` dominant, `empty` when the roster is idle, ZERO `error` and ZERO `no_secret`.
```

**"Parity holds" after 48 h means all four of:**

1. **(8a) ≥ 95% of the expected shadow rows exist** — `48 × 3600 / flush_seconds` per rostered
   character, so **1,920 per character** at a 90 s flush. Anything under 90% is a stall, not noise,
   and it is read as a defect before it is read as a number.
2. **(8b) `breaks = 0`.** Exactly zero. One overlap invalidates the sum in (8c); one gap means the
   tick is skipping time. There is no acceptable non-zero here.
3. **(8c) `gold_pct` and `qty_pct` both within ±2%, per character, not in aggregate** — an aggregate
   hides one character paying double against another paying nothing. The engine is the same code on
   both sides (AWAY-12) and, once T-2 is fixed, the same seed for the same window, so the only
   honest source of a residual is window-boundary rounding. **±2% is the ceiling, not the target;
   the expected answer is < 0.5%.** Anything above ±2%, or any single character outside it, is a
   BLOCK on arming and comes back to Security with the per-character rows attached.
4. **(8d) zero `error` and zero `no_secret` fires, and `player_ledger` and `player_state` unmoved
   for every rostered character across the whole window** — shadow pays nothing, and that is
   measured, not assumed:
   ```sql
   select count(*) from public.player_ledger l join public.hr_tick_ownership o using (user_id, slot)
    where l.at > now() - interval '48 hours' and l.meta->>'src' = 'tick';
   --   EXPECT: 0. A single row here means something settled armed while the config said shadow.
   ```

Only with all four green does `update public.hr_tick_config set shadow = false;` come back to
Security for its own GO. **That is a separate review and this document does not grant it.**
