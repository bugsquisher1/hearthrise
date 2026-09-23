# Security review — the derived per-request token (T-5.3), the condition on the tick ever PAYING

**Reviewer:** security-engineer (veto) · **Date:** 2026-09-23 ·
**Branch reviewed:** `lane/world-tick-token` @ `69429071` (three commits on `next` @ `7b762924`) ·
**Review branch:** `sec/world-tick-token`, cut from that head, `origin/next` @ `b5e9ff4` merged in here ·
**Reviewing against:** my own requirement — `docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md` §T-5.3,
*"REQUIRED-BEFORE-PAYING … a hard condition on the GO that review will need, not a suggestion."*

**MIGRATION 2026-09-22-world-tick-derived-token.sql: GO-WITH-CHANGES**
**EDGE DEPLOY (token gate): GO**
**T-5.3 SATISFIED (may precede shadow=false): YES**

| # | Sev | Finding | Status |
|---|---|---|---|
| **T-1** | **P1 — lands first** | Applying with pgcrypto unreachable succeeds **green** and silently turns the world tick into a permanent no-op. The only warning is a `raise notice`. | **CONFIRMED by execution** (X-8) |
| **T-2** | P2 — lands first | R-T1's residual is **zero**, not merely "bounded", at the shipped `flush_seconds = 90` — but that is a tunable the CHECK lets an operator take to 10 s, and neither file says the property depends on it. | **CONFIRMED by execution** (X-5) |
| **T-3** | P2 — lands first | pgcrypto is resolved by string equality against `pg_get_function_identity_arguments`, which **renders argument names**. Correct for pgcrypto as shipped; the failure mode is T-1's silent `no_hmac`. | **CONFIRMED by execution** (X-8a/b) |
| **T-4** | P2 — runbook | §6 and §17.11 say rollback is "re-deploy the previous hr-accrue payload", and nothing records what that payload's hash **is** before step 3 overwrites it. | CONFIRMED (read) |
| T-5 | P3 — runbook | Skipping step 1 makes the file's own d3/d7 pass **vacuously**: the probe fire loses `pg_try_advisory_xact_lock` to a live pg_cron fire and answers `locked`. | CONFIRMED (code read) |
| T-6 | P3 — defence in depth | When pgcrypto is *not* in `extensions`, the schema is chosen by name order, without requiring the function to belong to the pgcrypto extension. | PLAUSIBLE (unreachable today) |
| I-1 | Info | `d6d`, `d7b` and `d8` are **vacuous on the credential-free replay** and had never been red anywhere. They have mutation proofs now (MX1, MX3, MX2). | CONFIRMED by execution |
| I-2 | Info | `net._http_response` carries no token — pg_net's `headers` there are *response* headers. The exposure narrowed from two PUBLIC tables to one, for the drain latency only. | read from pg_net's schema |
| I-3 | Info | R-T2 (up to 4 MiB buffered pre-auth) is new but is not a new class: the player path already buffers an unauthenticated body under the same ceiling. | accepted |

**This is the best-argued file in the world-tick lane, and the thing it was asked to do, it does.**
The plaintext is no longer a plpgsql variable, it is not in the header, it is not in the fire log, it
is not in the queue row, and it is reachable from exactly one routine in `public`. I proved all of
that by executing the derivation — which is what the file's own self-check *cannot* do on the
credential-free replay, and the gap this review closes. **No production write and no production read
was made.** Every arm below ran against a PGlite database rebuilt from `supabase/migrations` in
`tests/schema-apply-order.json` order, on a synthetic uuid `gen_random_uuid()` cannot mint, with a
TEST secret (`'a'×32 || 'b'×32`, the file's own vector) that is never production's.

The three required changes are **T-1, T-2 and T-3, and none of them is about the cryptography.** They
are all one shape: *a resolution that returns NULL, a NULL that becomes a refusal, and a refusal
nobody is told about by an exit code.* The design is right to fail closed. It is wrong to fail closed
**quietly**, on the one file whose failure mode is "the world stops ticking and the log is the only
place that says so".

---

## 0. What I had to build before I could review anything

The file's §5 is careful, and it says out loud that two of its arms cannot run on the replay. I
re-measured that claim rather than taking it: `create extension pgcrypto` on
`@electric-sql/pglite` 0.5.5 (PostgreSQL 18.3, wasm32) answers **`extension "pgcrypto" is not
available`**, and `pg_available_extensions` lists none. The file is right.

But the consequence is larger than the file states. **With no pgcrypto, `d4`–`d7` skip — and `d6d`
(the header carries the key), `d7b` (the queued header binds the queued body) and `d8` (no credential
in the fire log) are inside or downstream of that skip.** So the three arms that assert the actual
target property had **never been red anywhere**, on any machine, ever. The lane discovered this for
`d8` and hand-wrote `d8b` as the structural half; it did not know the same was true of `d6d` and
`d7b`. The file's mutation record is honest — MD1–MD5 map to d9, d2, d3, d8b, d1, all of which *are*
reachable without pgcrypto — which is exactly why it did not catch this: **the mutations that could
run were the mutations that were written.**

So I gave the replay the three things Supabase has and PGlite does not, each a faithful stub of a
documented behaviour rather than a convenience, in `tests/world-tick-token-leak.mjs`:

1. **`extensions.hmac(text,text,text)` / `extensions.digest(bytea,text)`** — the RFC 2104
   construction over PostgreSQL's **core** `sha256(bytea)` (PG11+). Not a mock of the answer: a
   second implementation of the algorithm. It is pinned three ways before it is used for anything
   (X-1): against `node:crypto`, against the constant §5 pins, and against `tick.js`'s own
   `tickTokenMac` — so a shim that computed something else could not pass, and a *vector* that was
   wrong could not hide behind it.
2. **`vault.decrypted_secrets`** — two columns, holding the test secret.
3. **`net.http_post(...)` + `net.http_request_queue`** — doing exactly what pg_net's own SQL does:
   `convert_to(body::text,'UTF8')` into `.body`, headers verbatim into `.headers`.

⚠ **What (3) does and does not prove, said plainly.** The stub *encodes* the claim "pg_net stores
`convert_to(body::text,'UTF8')`", read from pg_net's source. So X-3/X-4 prove the **driver's** half —
that `hr_tick_body_sha256` hashes the same bytes the driver posts, i.e. that `jsonb::text` is spelled
once and not twice — and they **cannot** prove pg_net's half. Only `d7`, on production, at apply
time, can. That is a residual (R-3 below), not something this guard papers over.

`node tests/world-tick-token-leak.mjs` → **exit 0** (43 arms).
`--selftest` → **exit 0**, five defects planted in the file under review, **5/5 refused** — and three
of them were refused by the file's **own** self-check the moment the derivation could run:

```
✓ MX1 the helper posts the PLAINTEXT instead of a mac  -> d6d: the header carries the key itself
✓ MX2 the mac is journalled into the fire log          -> d8: a cron log row carries something shaped like a bearer or a mac
✓ MX3 the driver hashes a body it does not post        -> d7b: the queued header binds a body that is not the queued body
✓ MX4 the mac oracle is granted after every revoke     -> d1: hr_tick_auth_header carries 1 non-owner grant(s)
✓ MX5 the body hash is dropped from the mac message    -> X-2b: the mac no longer matches the pinned vector
```

That is the single most reassuring result in this review: **§5 is a real self-check, not a
decorative one. It was only ever unarmed.**

---

## 1. Does the mac bind nonce, timestamp AND body hash?

**There is no nonce, and the lane was right to refuse to add one.** My brief for this review
described `v2.<ts>.<nonce>.<mac>` with a per-isolate LRU. The lane implemented T-5.3's shape instead
— `v1 t=<bucket> b=<body_sha256> m=<hmac>` — and cited CLAUDE.md §0 (a dated ruling is not
overridden by an undated one) for doing so. **I am the author of both, and T-5.3 wins on its
merits, not only on its date.** The lane's argument is correct and I could not improve it: at a 10 s
cadence three fires land in each 30 s bucket, and when the roster has not moved between them the
driver's body is byte-identical — so `t`, `b` and `m` are identical too, and an LRU keyed on the
token would refuse the driver's own second and third legitimate fire of every bucket. A replay cache
that cannot tell a replay from a repeat is an outage with a security-shaped name. Per-isolate memory
would not be a control in any case: N isolates behind one URL, recycled, catching an unknown
fraction. **A residual that is bounded and stated beats a control that is unsound and believed.**

**What the mac does bind: the timestamp and the body hash.** `m = hmac(secret, t || '.' || b)`, and
the edge separately requires `sha256(the bytes that arrived) === b`. Both halves are load-bearing and
the file says so: `m` covers only `t` and `b`, so without the body-hash check a captured triple would
authenticate any body at all. Executed, against the real verifier, on the header and bytes a real
fire actually queued:

| arm | result |
|---|---|
| X-4a | the driver's own header + body are **accepted** — the mac binds real bytes, not a plausible string |
| X-4b | the same header with **one byte** of body changed → **refused** |
| X-4c | the same header with a body that flips **`shadow` to false** → **refused** |
| X-4d | a header **two buckets stale** → refused *before the body is read* |
| X-4e | a header **two buckets in the future** → refused just as firmly |
| X-4g | a mac valid for a **different bucket** → refused |
| X-4j | the **verbatim** pair, inside the window → **accepted.** This is R-T1 and it is real. |

So: a captured `net.http_request_queue` row **cannot be replayed with a different body** — not with a
different roster, not with a different holder, not with `shadow` flipped, not with `flush_ms`
lowered. The body binding closes the class the queue's PUBLIC grant opened.

### The residual, and the honest bound on it

**The token's post-mint validity is ≤60 s, not ≤90 s.** A token minted in bucket *n* is accepted
while the edge's bucket is in {*n*−1, *n*, *n*+1}, i.e. until the end of bucket *n*+1. Minted at the
very start of bucket *n* that is 60 s; minted at the end of it, 30 s. The "≤90 s" in T-5.3, in the
migration and in `tick.js` is the **width of the accepted set**, which is the right number for clock
skew and the wrong number for replay. **60 s is the replay number** (X-5a).

**And at the shipped configuration a verbatim replay settles nothing at all.** `tick.js:636`:

```js
const toMs = Math.min(nowMs, markMs + body.flushMs);
if (toMs - markMs < body.flushMs) { /* BELOW THE FLUSH LINE — the mark stays put */ }
```

A fire settles only when a **whole** flush period has elapsed since the watermark. With
`hr_tick_config.flush_seconds = 90` (the shipped default, Reliability's row-volume lever) and a
replay arriving at most 60 s after the fire that minted the token, `toMs − markMs ≤ 60 s < 90 s` —
so the replay walks the fence, is told "below the flush line", and writes nothing. **Executed:
X-5a/X-5b.** T-5.3 chose 90 s because it is the flush cadence; that turns out to buy more than the
skew tolerance it was chosen for.

**That is finding T-2, because it is a tunable and not an invariant.** `hr_tick_config_flush_ck`
permits `flush_seconds` down to **10**, and `FLUSH_MS_MIN` in `tick.js` is 10 000 (X-5c). At
`flush_seconds ≤ 60` a verbatim replay *can* settle — and even then the worst case is bounded and is
not a double pay:

- **It cannot pay twice for the same window.** The watermark CAS under the row lock
  (`fence:392-444`) refuses any window whose start is behind the locked row's mark, and the fence
  advances the mark to the window end in the same locked statement. `world-tick-double-pay.mjs`
  **exit 0**, `--mutate` **exit 0** (every arm goes red with the fence bypassed).
- **It cannot name a character the roster did not lease**, in the driver's own holder name.
- **It cannot move a watermark backwards.**
- **Windows are exactly flush-sized and non-overlapping**, so the *total* value paid over any span is
  a function of elapsed wall-clock time, not of how many times the tick fired. A replay shifts a
  window boundary earlier by ≤60 s; it does not mint one.

⚠ **On "prove idempotency via the fence's `intent_id`" — the `intent_id` is the wrong control for
this threat, and I would rather say so than accept a proof that does not hold.** `hr_apply`'s
idempotency key and `hr_tick_shadow`'s `unique (user_id, slot, intent_id)` protect against a **retry
of the same settle call** — the same `intent_id` presented twice. A replayed *request* is a fresh
Edge invocation that mints a **fresh** `intent_id`, so it sails straight past both. **What actually
stops it is the flush floor first and the watermark CAS second**, and neither is an idempotency key.
The file's own R-T1 paragraph is the one place in the lane that gets this right, including its
correction of T-5.3's sentence: my ruling said a replay "is refused `window_already_settled` by the
control that already exists (S-3)", and that is **not** what happens, because the entry re-derives
the window origin from the fence's watermark probe rather than taking it from the body. The lane
caught my error and wrote it down. That is the standard.

---

## 2. Is the shared secret ever rendered?

**No, on every surface I could reach, and the design is why — not luck.** The plaintext is never
assigned to a plpgsql variable. It is read inside **one** dynamic `EXECUTE` whose result is the mac,
with the secret referenced as a **column**, never as a literal and never as a bind parameter:

```sql
execute format('select encode(%I.hmac($1, s.decrypted_secret, %L), %L)
                  from vault.decrypted_secrets s where s.name = $2 …', v_schema, 'sha256', 'hex')
  into v_mac using p_bucket::text || '.' || p_body_sha, 'hr_tick_shared_secret';
```

That single decision is what closes the whole family at once, and it is worth naming each surface it
closes:

| surface | verdict | how |
|---|---|---|
| `hr_tick_cron_log.detail` | closed | **X-3d/X-3e executed**: after a real `posted` fire, no key, and **no 64-hex run at all** — stricter than the 2026-09-21 standard, so it catches the *mac* too, not just the bearer. `d8b` asserts the same structurally on the installed body, which is the half that bites where the fire never posts. |
| the driver's **return value** | closed | **X-3b/X-3c executed**: it names `auth: 'v1'` and the bucket — a version tag and a clock reading — and carries neither key nor mac. |
| **RAISE text** | closed | no `raise` in the chain interpolates the secret; `d4`'s failure message prints the computed and the pinned **mac**, which are not the key. The `no_secret` hint deliberately does not name the secret, which is what makes `d9c`'s "exactly one routine in `public` reads it" a checkable equality — **X-3g executed: 1.** |
| `net._http_response` | closed | pg_net's `headers` on that table are **response** headers; the request's `X-HR-Tick-Auth` never lands there. T-5 named both PUBLIC tables; after this change only **one** of them carries anything, and only for the drain latency. *(Read from pg_net's schema, not executed.)* |
| `net.http_request_queue` | **narrowed, by design** | **X-3h/X-3i executed**: the queue row carries no key — what it carries is `v1 t=… b=… m=…`, valid for one body for ≤60 s. This is the point of the file. |
| the §5 self-check's own output | closed, **and vacuously so on the replay** | see below |
| `pg_stat_statements` / the server log | closed | the query text is the `format()` result with `$1`/`$2` placeholders and a column reference; a normalised entry, a `log_statement = 'all'` line and a `log_min_error_statement` line all carry the same text. The secret is never a literal, so there is nothing for any of them to record. |
| `EXPLAIN` | closed | nothing plans the derivation; and a plan over a function call would not render its result. |
| every routine body in `public` | closed | **X-3f executed** across all 409 bodies. |

⚠ **The grep the brief asked for is VACUOUS on the replay, and I will not report it as evidence.**
Grepping the §5 block's output for `'a'×32||'b'×32` on PGlite passes because **`k_secret` is never
used there** — it appears only in `d4`, inside the `v_schema is not null` branch that cannot be
entered without pgcrypto. A grep that passes because the code did not run is the "always-null probe"
family, and reporting it would be the same failure as the audit this role exists because of. What I
did instead is the shimmed run above: the derivation **executes**, `k_secret` is **used**, and X-2c
and X-3b/d/f/h sweep the key across every surface a real `posted` fire touches. **That is the
measurement. The grep was the wrong instrument and it was my brief that named it.**

---

## 3. The edge gate, and the cutover

| requirement | verdict |
|---|---|
| **constant-time compare** | **Met.** `tickMacOk` hashes both sides to a fixed 32 bytes *before* `timingSafeEqual`, so a length mismatch cannot throw and the catch cannot become the length oracle. The one non-constant-time compare is `tickBodySha256(bytes) !== token.bodySha` — and `bodySha` is a value the caller already holds, so it leaks nothing. |
| **same non-oracle refusal for every failure** | **Met, and widened.** Every pre-auth refusal on the branch is the same `401 {ok:false,error:'not_signed_in'}` the player path returns — for an unusable secret, a malformed shape, a stale bucket, a body-hash mismatch, a bad mac, **and an unreadable body**. That last one is the good decision in the commit: answering "I could not read your body" differently from "I do not believe you" would hand an unauthenticated caller an oracle the static bearer never gave. **X-4h/X-4i executed.** |
| **timestamp window against the SERVER clock** | **Met.** `tickWindowOk` compares against `Date.now()` in the isolate; the bucket comes from Postgres's `now()`. Nothing client-supplied enters either. Three 30 s buckets = a 90 s accepted set, **≤60 s of post-mint validity** (§1). A token from the future is refused as firmly as a stale one — correct: a clock that far ahead is a broken driver, not a slow network. |
| **v1 static bearer REFUSED after cutover** | **Met. X-4f executed**: the 64-hex bearer and an arbitrary 64-hex string both fail `TOKEN_RE` and are refused. There is deliberately **no dual-accept path**, and I agree with rejecting one: "remove this by \<date\>" on a money gate is the line that gets forgotten, and a dual-accept build's payload hash is green while its behaviour is the thing Security blocked. |

### Both directions of a mismatch fail closed — executed, not assumed

This is the claim the whole cutover order rests on, so I lifted the **pre-cutover** verifier verbatim
out of `5852cb77^` and ran it:

```
OLD edge build + NEW derived header   -> false   (fails CLOSED)
OLD edge build + OLD static bearer    -> true    (the form it accepted)
```

and the other direction is X-4f. **Migration applied, edge not yet deployed → 401. Edge deployed,
migration not applied → 401.** Neither direction can pay, neither can bypass, and the seam in §17.11
(kill switch off between steps 1 and 4) means neither state exists for longer than the operator
takes to run step 3.

### Ruling on §17.11

**§17.11 is correct as far as it goes, and it goes further than most runbooks in this repo** — in
particular (b), which is the sentence that saves the cutover: `net.http_post` is asynchronous, so a
**rejected token still logs `posted`**, and `net._http_response.status_code` is the only honest read.
That is the most expensive misread available during this window and it is called out in bold in both
copies. The kill switch section is accurate and I verified `hr_cron_drop`/`hr_cron_ensure`'s grants
(revoked from `public, anon, authenticated, service_role`) as T-5.4 did.

Three corrections, then it is right:

- **T-1 (P1).** Step 2 says *"IF d4–d7 READ AS SKIPPED ON PRODUCTION, STOP"*. That instruction is
  carried by a `raise notice` and by nothing else: with pgcrypto unreachable the file **applies
  green**, and the tick then answers `no_hmac` on every fire for ever. **X-8c/X-8d/X-8e execute
  exactly that state.** The file's own §4 standard — *"a claim is gated on the guard's exit code,
  never on expectation"* — is the answer. See §4 below for the patch; `vault.decrypted_secrets` is
  the discriminator (present on Supabase, absent on the replay fixture, which is why the raise stays
  replay-safe).
- **T-4 (P2).** Rollback is "re-deploy the previous hr-accrue payload" and **nothing records what
  that payload is**. Step 3 overwrites it. A pre-flight `curl` of the live `payload_sha256`, written
  down, is the difference between a rollback and a guess.
- **T-5 (P3).** Add *why* step 1 matters for the apply, not just for the seam: `hr_tick_cron_run`
  takes `pg_try_advisory_xact_lock` first, so if a live pg_cron fire holds it the §5 probe answers
  `locked` and **d3/d7 skip — the arms pass vacuously.** Skipping step 1 does not just risk a
  debugging session; it silently unarms the apply-time proof.

---

## 4. Every earlier property still holds

Run in this worktree with `origin/next` @ `b5e9ff4` merged in. **Exit codes I read, not expectations.**

| command | exit |
|---|---|
| `node tests/world-tick-double-pay.mjs` / `--mutate` | **0** / **0** |
| `node tests/world-tick-shadow-chain.mjs` | **0** — M-1's fix survives the restatement: `shadow_accrued_to` is still in the payload projection |
| `node tests/world-tick-writer-authz.mjs` | **0** |
| `node tests/world-tick-parity.mjs` | **0** |
| `node tests/world-tick-edge-contract.mjs` / `--selftest` | **0** / **0** |
| `node tests/edge-tick-gate.mjs` / `--selftest` | **0** / **0** (eleven arms, M8–M11 bite) |
| `node tests/pg-net-queue-unreachable.mjs` / `--selftest` | **0** / **0** (18 caught, 8 controls silent) |
| `node tests/schema-drift.mjs` | **0** — rebuilds to the committed fingerprint `c8e4f78c31b4…`, byte-identical second apply |
| `node tests/apply-order-honesty.mjs` | **0** — 28 files carry a measured verdict |
| `node tests/selfcheck-no-global-dml.mjs` | **0** — 208 migrations, 9 global statements, all acknowledged |
| `node tests/guard-hygiene.mjs` | **0** — "no orphans, no ghosts, no stale entries, no vacuous proofs" |
| `node tests/ci-shape.mjs` | **0** — 189 commands across 7 jobs |
| `node tools/pack-edge.mjs hr-accrue --check` | **0** — payload `1b97422cd1542ec36224e37e930cc0df5370b76968f1fc2d60316f62c3bd24ec`, which is the value §17.11 documents. **The in-page payload guard stays honest.** |
| `node tools/lane-done.mjs` | **0** — `lane-done: all green.` |
| `node tests/world-tick-token-leak.mjs` / `--selftest` | **0** / **0** (43 arms; 5/5 planted defects refused) |

And the driver's own properties, read against the restated body: the advisory lock is still taken
**first**; the kill switch still fails closed on a missing row; the `no_edge_url` refusal is still
before the roster; the keyset cursor, the lease holder, the batch cap and the effective-cadence
arithmetic are unchanged; `posted` still means "queued", not "accepted" (which is why (b) exists);
`no_secret` still refuses rather than falling back; retention is untouched —
`hr_tick_cron_log_prune(20000)` is its own cron job and this file does not touch it, and the
`disabled`/`locked` five-minute coalescing is unchanged. **`no_hmac` is a new outcome and it is right
to be one**: `no_secret` is a Vault write and `no_hmac` is `create extension`, and an outcome that
conflates two fixes gets the wrong one applied at 03:00 on a Sunday.

### The required changes, as patches

**T-1 — make "pgcrypto is unreachable" an exit code, at the end of §5.** It must not fire on the
credential-free replay, and `vault.decrypted_secrets` is the discriminator: present on every Supabase
project, absent from `tests/sql/pglite-fixture.sql` (measured — the fixture defines neither `vault`
nor `net`, which is why the driver's own `to_regclass` guards exist).

```sql
-- The apply must REFUSE on a database where the derivation is expected to work
-- and cannot. A `raise notice` is not a gate (CLAUDE.md §4).
if to_regclass('vault.decrypted_secrets') is not null
   and public.hr_tick_crypto_schema() is null then
  raise exception 'pgcrypto is not reachable, but this is a Supabase project: the tick would '
                  'answer `no_hmac` on every fire. Run `create extension if not exists pgcrypto;` '
                  'and re-apply. (See §6 step 2.)';
end if;
```

**T-2 — state the dependency, and pin it.** `flush_seconds > 60` is what makes R-T1's residual
*zero* rather than *bounded*. Either raise the floor so it is an invariant (a CHECK of
`flush_seconds >= 61` plus `FLUSH_MS_MIN` to match, which costs Reliability a lever it has never
used) **or** — acceptable, and my preference, since the residual is bounded either way — say it in
both R-T1 paragraphs: *"at `flush_seconds > 60` a verbatim replay settles nothing, because the flush
floor refuses it; below that it can settle one window up to 60 s early, which is still not a double
pay."* Arms X-5a/X-5b/X-5c hold that sentence to its exit code, including the `< 61` case, so it
cannot rot quietly.

**T-3 — resolve pgcrypto by type, not by rendering.** `hr_tick_crypto_schema()` matches
`pg_get_function_identity_arguments(p.oid) = 'text, text, text'`, and that function **renders
argument names when they exist** (measured on PG 18.3: `hmac(a text, b text, c text)` identifies as
`'a text, b text, c text'`, while `oidvectortypes(proargtypes)` is `'text, text, text'` either way).
pgcrypto declares `hmac(text,text,text)` and `digest(bytea,text)` **unnamed**, so the equality is
correct today — and X-8 shows the same algorithm with named arguments is silently not found and the
tick dies. Use `oidvectortypes(p.proargtypes) = 'text, text, text'` (and `'bytea, text'`), which is
name-insensitive and one word shorter.

**T-4/T-5 — the runbook additions** are in §5 below.

**T-6, not required, offered.** When pgcrypto is *not* in `extensions` the schema falls through to
`order by n.nspname`, so the first schema alphabetically wins. No role we grant can create a schema
on production (CREATE on database is not PUBLIC's, and §2 makes `supabase/migrations` the only write
path), so this is not reachable — but requiring the function to belong to the pgcrypto **extension**
via `pg_depend` → `pg_extension` costs one join and removes the question.

**Withdrawn after execution.** Three things I suspected and checked:

- `d1` reads `information_schema.role_routine_grants`, whose documented visibility is grants
  involving *enabled* roles, so I expected it to miss a PUBLIC or third-party grant. **MX4 proves it
  bites** (`d1: hr_tick_auth_header carries 1 non-owner grant(s)`), and X-6b covers PUBLIC
  independently through `proacl` for all four functions. Not a finding.
- I expected the rollback to be blocked by its own data: re-applying `2026-09-21-world-tick-cron.sql`
  after a `no_hmac` row exists, with that file's narrower CHECK. It is not — the old file's
  `create table if not exists` never re-creates the constraint. **X-7 executes it**: the re-apply
  succeeds, the static form is restored, and the `no_hmac` rows survive. Not a finding.
- `hr_tick_config.edge_url` is no longer unconstrained: **M-5 is closed**
  (`hr_tick_config_edge_url_ck` pins the `https://…/functions/v1/` project prefix). I found it by
  having my own probe refused by it.

---

## 5. Does anything need superuser? — and the Coordinator runbook

**Nothing in this file needs superuser, and that is the difference from the T-5 lesson.** T-5.1's
wall was that `postgres` cannot revoke **`supabase_admin`'s** grants on `net.*`. Every object this
file touches is one `postgres` **owns**: `hr_tick_cron_log` (created by the 2026-09-21 migration, so
the `drop constraint` / `add constraint` pair is an owner operation), and four functions it creates
here — so the implicit PUBLIC EXECUTE grant on each has `postgres` as its grantor and `postgres` can
revoke it. **X-6b confirms on the replay that the ACL ends up granting EXECUTE to nobody but the
owner.** The file also does **not** `create extension`, which is right: a migration that silently
installs a crypto extension is a migration nobody reviewed for that.

**What the Coordinator must read FIRST — pre-flight, read-only, before `apply-migration`:**

```sql
-- (P1) ★ pgcrypto: PRESENT, in WHICH SCHEMA, and with arguments UNNAMED (T-3).
--      This is the read that decides whether the apply is safe at all.
select n.nspname as schema, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       oidvectortypes(p.proargtypes)            as arg_types
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname in ('hmac', 'digest') order by 1, 2;
--   EXPECT  extensions | digest | bytea, text        | bytea, text
--           extensions | hmac   | text, text, text   | text, text, text
--   ⚠ identity_args MUST read exactly 'text, text, text' / 'bytea, text'.
--     If it carries NAMES ('a text, b text, …'), hr_tick_crypto_schema() returns
--     NULL, the tick answers `no_hmac` for ever, and T-3 lands before the apply.
select extname, extnamespace::regnamespace as schema, extversion
  from pg_extension where extname = 'pgcrypto';
--   EXPECT one row. NO ROWS = DO NOT APPLY: run
--   `create extension if not exists pgcrypto with schema extensions;` first.

-- (P2) the Vault contract. The apply is harmless without it; the RE-ARM is not.
select name, length(decrypted_secret) as len
  from vault.decrypted_secrets
 where name in ('hr_tick_shared_secret', 'hr_tick_gateway_key') order by 1;
--   EXPECT hr_tick_shared_secret with len >= 32 (the edge's MIN_SECRET_LEN, and
--   the helper's own floor — a short secret refuses on BOTH sides, by design).
--   Absent/short => every fire after step 4 reads `no_secret`. Set it BEFORE step 2.

-- (P3) ★ THE ROLLBACK VALUE, and it is only readable BEFORE step 3 (T-4).
--      Write this hash down. "Re-deploy the previous payload" is a guess without it.
--   $ curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue
--      -> record `payload_sha256`  (the NEW one is
--         1b97422cd1542ec36224e37e930cc0df5370b76968f1fc2d60316f62c3bd24ec)

-- (P4) the state the apply lands in, incl. flush_seconds for T-2.
select enabled, shadow, cadence_seconds, flush_seconds, edge_url
  from public.hr_tick_config;
--   EXPECT shadow = true. THIS FILE DOES NOT FLIP IT — it is the condition ON
--   flipping it, and `shadow = false` is a separate decision needing its own read.
--   flush_seconds SHOULD be 90; anything <= 60 makes R-T1's residual non-zero (T-2).

-- (P5) what the §5 probe fire will touch. It rosters and LEASES every owned
--      character, then rolls all of it back — but this is the blast radius, and a
--      0 here means d7 proves nothing about a real batch.
select count(*) as owned from public.hr_tick_ownership where owned;
```

**Apply, deploy, re-arm** — §17.11's order, which is correct, with the two additions:

```bash
# 1. STOP THE FIRES. Not optional, and not only for the seam: a live fire holds the
#    advisory lock and makes the §5 probe answer `locked`, which SKIPS d3/d7 (T-5).
#      update public.hr_tick_config set enabled = false;
#      select at, outcome from public.hr_tick_cron_log order by id desc limit 5;  -- EXPECT: disabled, <=10 s

# 2. APPLY. One file, never inside begin/commit, never 00:00-00:10 UTC, Coordinator only.
node tools/apply-migration.mjs supabase/migrations/2026-09-22-world-tick-derived-token.sql
#    EXPECT the §5 notice: RAN [d1 d2 d9 d4 d5 d6 d7 d8 d8b], SKIPPED [].
#    ⚠ ANY of d4/d5/d6/d7 in SKIPPED on production = STOP. With T-1's patch this
#      is an exit code and the apply refuses by itself; until it lands, it is a
#      line of output you have to actually read.

# 3. DEPLOY THE EDGE HALF. (P3) is already written down.
node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue
cp supabase/config.toml <dir>/supabase/config.toml
npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> --project-ref nezapsylztqbbwuwembx
node tools/pack-edge.mjs hr-accrue --hash          # 1b97422cd1542ec3…
curl -s https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue   # payload_sha256 MUST equal it

# 4. RE-ARM.
#      update public.hr_tick_config set enabled = true;
```

**Verification reads, in order, and the first one that matters is not (a):**

```sql
-- (a) THE DRIVER TRIED, AND NAMES THE VERSION.
select at, outcome, rostered, effective_cadence_seconds,
       detail->>'auth' as auth, detail->>'bucket' as bucket
  from public.hr_tick_cron_log order by id desc limit 10;
--   EXPECT `posted` with auth = 'v1'.
--   no_hmac -> pgcrypto (T-1/T-3);  no_secret -> the Vault secret (P2);
--   error   -> read `sqlstate`.

-- (b) ★ AND THE EDGE ACCEPTED IT. `posted` only means QUEUED — net.http_post is
--     asynchronous, so a REJECTED TOKEN STILL READS `posted`. THIS IS THE GATE.
select id, status_code, created from net._http_response order by id desc limit 10;
--   EXPECT 200, and ZERO rows whose outcome is an `error:` / non-2xx.
--   401 = the two halves disagree: the driver is on the derived token and the live
--         build is not (step 3 did not land), or the Vault secret and the edge's
--         HR_TICK_SHARED_SECRET are different values. Both fail CLOSED — nothing
--         paid — but nothing ticks either.
--   404 = edge_url. 5xx = read the function logs.
--   ⚠ THE FIRST `posted` FIRE WITH A 200 AND NO `error:` OUTCOME IS THE ONLY
--     EVIDENCE THE CUTOVER LANDED. Until you have read it, the cutover is unproven.

-- (c) THE PLAINTEXT IS NOT ON THE WIRE. Measured, not assumed.
select count(*) as leaked
  from net.http_request_queue q, vault.decrypted_secrets s
 where s.name = 'hr_tick_shared_secret'
   and q.headers->>'X-HR-Tick-Auth' = s.decrypted_secret;      -- EXPECT 0
select left(q.headers->>'X-HR-Tick-Auth', 5) as tag
  from net.http_request_queue q order by q.id desc limit 3;     -- EXPECT 'v1 t='
--   Queue depth is normally 0 (the worker deletes the row after the send), so an
--   empty result is health. Run it in the same second as a fire, or accept 0 rows.

-- (d) THE SHADOW PARITY RUN DID NOT STOP. The cutover must not cost M1 its measurement.
select count(*) as windows, max(at) as latest
  from public.hr_tick_shadow where at > now() - interval '1 hour';
--   EXPECT a count still climbing at roughly active/flush_seconds. Frozen at the
--   cutover instant = step 3 or step 4 did not land, and (b) will say which.

-- (e) THE GRANT POSTURE DID NOT MOVE.
select public.hr_assert_grant_hygiene();     -- EXPECT: returns without raising
```

**Then, after the apply:** `live-hash-drift --live --write` plus a whys entry from `--codediff`
(`hr_tick_cron_run` is a restated live body, and the three new functions are new ones), the
apply-order note flipped to APPLIED, and `restore-census` re-run — **no new table, so it should be a
no-op, and if it is not, read why before moving on.**

**Rollback**, in order, behind the kill switch — and it re-blocks M2, which is the point:

```
1. update public.hr_tick_config set enabled = false;
2. re-deploy the PREVIOUS payload: the hash recorded at (P3), by packing that
   commit and deploying it, then curl the GET and confirm payload_sha256 == it.
3. node tools/apply-migration.mjs supabase/migrations/2026-09-21-world-tick-cron.sql
   (restates hr_tick_cron_run in its STATIC form; X-7 executes that this re-applies
   cleanly and that `no_hmac` log rows do not block it)
4. update public.hr_tick_config set enabled = true;
   -- and if the JOB itself was dropped rather than disabled:
   select public.hr_cron_ensure('hr-tick-run', '10 seconds', 'select public.hr_tick_cron_run()');
```

Order matters on the way back too, and for the same reason: the edge half must be the one that
accepts what the driver sends, so **the deploy goes before the migration on rollback** — the mirror
of step 2-then-3 going out. Both intermediate states refuse, so neither direction can pay.

---

## 6. The verdict, and the residuals I am accepting

**MIGRATION 2026-09-22-world-tick-derived-token.sql: GO-WITH-CHANGES** — T-1, T-2 and T-3 land
before the apply. T-1 is the only one I would hold the apply for on its own: a migration that
succeeds while disabling the feature it configures is a trap, and the fix is eight lines. T-2 and T-3
are small and belong in the same file rather than in a follow-up nobody writes.

**EDGE DEPLOY (token gate): GO** — unconditional. The verifier is correct, constant time where it
must be, non-oracular everywhere, ordered so that nothing is parsed and no connection is opened
before the mac verifies, and it refuses the static bearer. Deploy it after the migration, per §17.11.

**T-5.3 SATISFIED (may precede `shadow = false`): YES** — once T-1/T-2/T-3 land and the runbook's
(b) has been read with a 200. Nothing long-lived transits `net.http_request_queue` any more; what
transits it is bound to one body for ≤60 s, and at the shipped `flush_seconds` a verbatim replay of
it settles nothing. **`shadow = false` is a separate decision and this review does not grant it** —
it needs the 48-hour parity measurement M1 exists to take, and residual R-1 below.

**Residuals, with their triggers:**

1. **R-T1, bounded and now measured.** A verbatim replay inside ≤60 s is indistinguishable from an
   extra cron fire. At `flush_seconds = 90` it settles **nothing** (X-5b). At `flush_seconds ≤ 60` it
   can settle one window up to 60 s early — never twice, never for an unleased character, never
   backwards. **Trigger to re-open:** `flush_seconds` lowered below 61, or the flush floor removed
   from `tickOne`.
2. **R-T2, accepted.** A caller with the public anon key and a syntactically valid in-window header —
   which needs no secret — can make the function buffer up to `MAX_BODY_BYTES`. Strictly worse than
   the static form, which authenticated before reading. Not a new class: the player path already
   buffers an unauthenticated body under the same ceiling, and the ceiling is the control.
3. **R-3, owed at apply time.** That pg_net stores `convert_to(body::text,'UTF8')` is read from its
   source and **encoded** by my stub, not proved by it. `d7` on production is the only thing that
   proves it. **If d7 reads SKIPPED, the body binding is unproven on the real transport** — that is
   the second reason step 2's notice must become an exit code.
4. **R-4, unchanged from T-5.1.** The PUBLIC SELECT on `net.http_request_queue` /
   `net._http_response` is `supabase_admin`'s and is not ours to revoke. What changed is the value of
   reading it: **from a long-lived bearer to a 60-second single-body mac.** That is the whole of
   T-5.3 and it is done. `tests/pg-net-queue-unreachable.mjs` remains the standing measurement of the
   three reachability surfaces that *are* ours.
5. **R-5, unchanged.** `hr_tick_auth_header` is a mac oracle by construction. It is revoked from
   every role and its ACL grants EXECUTE to nobody but the owner (X-6). Anything that ever grants it
   hands over the tick; `d1` and X-6a/X-6b are the detectors, and MX4 proves they bite.
6. **R-6, unchanged.** S-7's RNG oracle: the M1 tick reaches `hr_seed` as the edge always has.
   Covered by the standing 2026-08-11 acceptance; `hr_tick_seeds` still does not exist and the roster
   no longer claims it does.

**What I am explicitly not saying.** Not that the secret is unreachable — it is in Vault, readable by
the roles that could always read it. Not that a replay is impossible — it is possible and I executed
it. What I am saying is narrower and is the property T-5.3 asked for: **a value captured from
`net.http_request_queue` can no longer be used to make the server do anything it was not about to do
anyway, and it stops working within a minute.**

---

## Appendix — the guard

`tests/world-tick-token-leak.mjs`, registered in `.github/workflows/smoke.yml` job `db-replay-2`
beside the other world-tick arms and pinned in `tests/ci-shape.baseline.json` (189 commands, 7 jobs).
4 s plain, 14 s with `--selftest`; both are registered, because the plain run is the only thing that
answers "is this green when it should be" and `--selftest` is the only thing that answers "would it
ever be red".

| arm | what it executes |
|---|---|
| X-1 a–f | the derivation is one function in SQL, in `node:crypto`, in the migration's pinned constant, and in `tick.js` — six ways, so nothing agrees by being wrong |
| X-2 a–d | `hr_tick_auth_header` derives the T-5.3 shape, the mac the edge will expect, no key, no CR/LF |
| X-3 a–i | after a real `posted` fire: no key in the return value, the fire log, any routine body in `public`, or the PUBLIC-readable queue row; no 64-hex run in the log at all; exactly one routine reads the plaintext |
| X-4 a–j | the captured queue row against the real verifier: accepted verbatim; refused for one byte, a flipped `shadow`, a stale bucket, a future bucket, a wrong-bucket mac, the static bearer; one 401 body for every refusal |
| X-5 a–c | the replay window is ≤60 s; the shipped `flush_seconds` exceeds it; the CHECK still permits less (T-2) |
| X-6 a–b | none of the four functions is executable by `anon`/`authenticated`/`service_role`/`hr_engine`/`hr_tick`, and the ACL grants EXECUTE to nobody but the owner |
| X-7 a–c | the documented rollback re-applies cleanly, restores the static form, and is not blocked by its own `no_hmac` rows |
| X-8 a–e | pgcrypto resolution is name-sensitive (T-3); the driver then fails **closed** with `no_hmac`, posts nothing — and the migration still applied green (T-1) |
| MX1–MX5 | five defects planted in the file under review; **5/5 refused**, three of them by the file's own `d6d`/`d7b`/`d8` — which had never been red anywhere before this guard existed |
