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
