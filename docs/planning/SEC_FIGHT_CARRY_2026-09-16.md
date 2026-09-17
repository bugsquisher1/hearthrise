# Security review — `fight` checkpoint authorship (lane record, 2026-09-16)

**Reviewer:** security-engineer · **Branch:** `worktree-agent-a6bfcb4b913e60591` (merged `origin/set/b548`)
**Trigger:** reliability lane reported two SLIPPED mutants in `tests/live-settlement.mjs --mutate`
(`no-hp-ceiling`, `no-monster-lookup`).
**Verdict: GO on the current live surface. No migration. The detector gap was real and is closed.**
No production writes were made; every live query below was read-only (`pg_proc`, `pg_policy`,
`information_schema`).

---

## 1. The three questions

### (1) Can a client write a `fight` checkpoint the next accrual window trusts? — **No. CONFIRMED closed.**

The only writer of `player_state.fight` is `hr_apply`, and its grants on production are:

```
hr_apply  secdef=true  acl = postgres=X/postgres | hr_engine=X/postgres
```

`anon`, `authenticated` and `service_role` hold no EXECUTE. `player_state` itself is
`SELECT`-only for `authenticated` (column grants confirm SELECT on `fight`, no UPDATE anywhere),
RLS is on, and the table carries exactly one policy — `"player_state own read"`, `cmd = r`,
`(select auth.uid()) = user_id`. There is no `INSERT`/`UPDATE`/`DELETE`/`ALL` policy, so PostgREST
refuses every write regardless of payload.

Of the 81 functions executable by `anon`/`authenticated` on production, exactly one mentions
`fight`: `hr_create_character(p_slot integer)`, which takes no fight argument and seeds `'{}'`.
`hr_put_client_state` (the one client-callable writer into `player_state`) is rate-gated and routes
to `hr_put_client_state__ungated`, which is `postgres`-only and writes the `client_state` residue
column; it does not reach `fight`.

The engine half is identity-clean too: `supabase/functions/hr-accrue/index.ts:238` derives the user
from a verified JWT (`verifyJwt(bearerOf(...))`), and the fight input at `index.ts:875` is
`fight: st.fight ?? null` — `st` is the `hr_state_of` projection from the same transaction, never
the request body (the file states this at `:812`, `:959`, `:986`).

Validation that exists, in `hr_apply` under the row lock
(`supabase/migrations/2026-08-17-fight-carry.sql:1076-1132`, and re-installed verbatim by the live
last toucher `2026-09-14-hr-apply-restatement.sql:1454-1464`):

| Check | Code | Refusal |
|---|---|---|
| object shape / key allowlist | `fk not in ('monster','hp','kills')` | `bad_fight` |
| key **presence** before type (three-valued-logic hole, Security F2) | `v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills'` | `bad_fight` |
| monster id looked up against the generated catalogue | `select max_hp into v_fight_max from public.hr_activities where kind='combat' and activity_id = v_fight->>'monster'` | `unknown_monster` |
| hp integer, `>= 1`, `<= v_fight_max` | `(v_fight->>'hp')::numeric > v_fight_max` | `bad_fight_hp` |
| kills integer, `0 .. c_max_fight_kills` | — | `bad_fight_kills` |
| refused, never clamped; whole delta rolls back | `hr_reject` raises `HR000` | — |

Live body confirmed by read-only query: `hr_apply` on production contains `bad_fight_hp`,
`unknown_monster`, `if v_fight_max is null` and `> v_fight_max` (body md5
`1ad0e5936b5b2f9b6c5bd83037479a69`).

### (2) Economic effect if it were writable — **quantified, and it is why the clamp exists.**

`tests/live-settlement.mjs` measures it directly with the engine. A forged
`{monster:'dragon', hp:1, kills:0}` on a 520 HP dragon takes a fixture that pays **3 kills /
1265 gold per 60-minute window** to a kill on the first swing of *every* window. At the production
accrue rate gate (30 calls/minute) that is a per-day faucet bounded only by the ledger day budget,
plus the full dragon drop table and combat XP each time. Blast radius: **whole economy** —
minted drops are market-listable, so forged value crosses to other players. This is the mint the
migration's own header describes; it is closed today, not theoretical.

### (3) Reachable on production today? — **No.** Reachable only if a future change

(a) grants `hr_apply` to `authenticated`/`anon`/`service_role`, or (b) adds a write policy or write
grant on `player_state`, or (c) lands an `hr_apply` restatement that drops the ceiling or the
catalogue lookup. (a) and (b) are already asserted by `live-settlement.mjs` sqlGuard; (c) is the
gap this lane closes.

---

## 2. Why the two mutants slipped — the finding

**It is a detector gap, not an exploit.** Both mutants edit `supabase/migrations/2026-08-17-fight-carry.sql`,
which stopped being the last toucher of `hr_apply` on 2026-08-18. Six later links of
`HR_APPLY_CHAIN` re-install the entire body, so deleting the ceiling from the file that
*introduced* it changes nothing the database ever executes — a **behaviourally inert mutation**,
graded green, which reads as "no detector".

Worse, the three SQL mutants that *were* caught (`no-void`, `no-presence-test`, `narrow-release`)
were caught by the flat `sql.includes(term)` list in `derivationGuard` — a text check on that same
superseded file. So every textual catch was already one restatement away from being decorative,
and the two that slipped are simply the two terms nobody put on the list.

Proven, not reasoned: planting the same `or false then` mutation in the **live last toucher**
(`2026-09-14-hr-apply-restatement.sql`) makes the base guard exit 1 — and it is caught by that
file's own §4 self-check md5 (`code md5 2a78ffe… expected 820c455…`), i.e. the last toucher is
tamper-evident by construction. The behavioural half (SETTLE-1c, 19 hostile checkpoints incl.
`hp = MAX+1`, `hp = 0`, `ancient_wyrm_of_gold`, `normal_tree`) does run against the replayed final
body and does assert the property.

---

## 3. The fix

**No migration.** The server-side clamp of `fight.hp` to the catalogue max and the monster-id
lookup inside the engine-only writer both already exist, in the live body, with the correct posture
(refused, not clamped; catalogue re-derived under the row lock; not checked against a maximum the
caller supplied). Drafting a lane-C migration to add them would re-add what is there and would put a
57 KB restatement through an apply for no property gain. **Recommended action is the detector only.**

**Detector added** — `tests/live-settlement.mjs`, `SETTLE-1g`: the re-clamp must be present in
**every** file that restates `hr_apply` from fight-carry onward, not only in the file that
introduced it. Four code terms are asserted per link (the `hr_activities` lookup, the
`unknown_monster` refusal, the null-ceiling refusal, the `> v_fight_max` bound), over the existing
comment-stripped body so prose cannot satisfy it. Membership on `HR_APPLY_CHAIN` says a
restatement is *accounted for*; SETTLE-1g says what it must still *contain*; SETTLE-1c says it must
still *behave*. Neither replaces the others.

---

## 4. Evidence

| Command | Exit |
|---|---|
| `node tests/live-settlement.mjs` | **0** — `dragon (520 hp), 60 min: one window 3 kills / 1265g · 60s 3k · 90s 3k · 120s 3k · 300s 3k · no column 0k`; `ceiling parity: 108/108 combat ids match src/data/monsters.js` |
| `node tests/live-settlement.mjs --mutate` | **0** — 10/10 CAUGHT, incl. `no-hp-ceiling` (2) and `no-monster-lookup` (2); `mutation safety: 3 file(s) restored and hash-verified` |
| ceiling mutation planted in the live last toucher (restored) | guard exit **1** |

---

## 5. Residual risk accepted

1. `--mutate` is **not** registered in `.github/workflows/smoke.yml` (the base run is, via
   `tests/run-smoke.mjs:127`). CI therefore proves the property but not that the guard bites.
   Recommended: two steps in the `guards` job, as `schema-drift`/`restore-census` already have.
   Coordinator's file; not blocking.
2. A compromised `hr_engine` (the edge function's role) can still propose any *legal* checkpoint —
   e.g. an honest-looking low HP on a boss it never fought. The clamp bounds it to the catalogue
   max and the void-on-activity-change rule bounds the banking exploit, but within those bounds the
   engine is trusted. Journalled via `player_ledger`; detectable, not prevented.
3. SETTLE-1g is textual per link. A restatement that keeps the four lines but reorders them so the
   ceiling is evaluated before the lookup would pass SETTLE-1g — it would fail SETTLE-1c, which is
   the behavioural authority and runs on the replayed chain.

---

## 6. Addendum, 2026-09-16 — the UTC-midnight §4 fixture change (GATE(f5)/GATE(f6)) — **GO-WITH-CHANGES**

**Is the gate as strong as before against C1/S1 ("settle absorbs the wrong delta") and C5
("zero-claim forgives")? Yes — stronger, and I have the exit codes.** `git diff -U0` confirms the
lane's claim itself: every hunk in `2026-09-01-kill-daily-credit.sql` is at line ≥ 916, the function
body ends at 884 and the `revoke`/`grant` block is 884–886, so no body, grant, policy or ledger shape
moved; the `2026-09-10-attended-loot-credit.sql` change is header prose only. Replaying the chain
with the S1 mutant planted (`v_consumed := v_settle_delta`, line 755) exits **1 at both 01:00:00 and
00:02:30** — `GATE(f6): round 2 applied 40 — expected 28` — and it now bites at ROUND 2 on an exact
per-round expectation instead of only at the final row sum, so a mutant that shrank the round for the
wrong reason can no longer pass as a smaller-but-consistent one. Both files restored byte-for-byte
(sha256 `31079fdf…`, `2e51130e…`, `git status` clean). The zero-claim assertion and the
`daily_kill_settle_absorbed` journal count (C5) are unchanged in substance. Taking the round size
from the server's reported `cap` does **not** weaken it: an *inflated* cap changes nothing (the
40-claim binds, `least(40, cap) = 40`, exactly as the literal did), and a *deflated or zero* cap is
caught one gate earlier and at every hour of the day by `GATE(c)` in
`2026-08-30-bounty-kill-credit.sql`, which pins the formula against literals — planted `cap→0` and
`cap→least(7,…)` mutants both exit **1** with `GATE(c): cap(15,10,60000)=0 expected 130` / `=7`. The
literal anchor was not lost, it moved to the gate that owns it. The `v_c = 0` skip path is reachable
only in `[00:00:00, 00:00:01)` UTC, where GATE(f6) asserts nothing; measured, a replay reaches f6
~6.5 s after start, so landing there needs the clock parked within a second of the boundary and
`GATE(f5)` (literal 40, unclamped `accrued_to`) still runs there. Fixtures cannot collide with a real
player: the uid is the fixed synthetic `000000c7-0000-0000-0000-0000000000c7` (not a v4 UUID, so
`gen_random_uuid` cannot mint it), every write is inside a subtransaction rolled back via `HR821`,
and the block then raises `GATE: §5 LEAKED a probe row` if anything survives in `player_state`,
`player_ledger`, `player_progress`, `player_skills`, `active_bounty`, `hr_kill_credit_log`,
`player_intents` or `auth.users`.

**The CHANGES, and they are the reliability half's claim, not the gate's.** The header now reading
"✅ RESOLVED" and the guard promising the chain "rebuilds at every hour of the day" are **false, and
I measured it on a clean tree**: `[00:00, 00:05)` is closed, but a ~8-second band straddling midnight
is not. Offsets −6 … −1 and 0 … +1 exit **1** on a correct function with `GATE(f5): the credit applied
0 … (expected 3)` — when midnight falls between f5's two credits the clamp pushes the log stamp
FORWARD onto the day start, the anchor collapses and the cap honestly refuses the 15-kill claim;
green again at −7 and +2. `tests/utc-midnight-replay.mjs` cannot see it, because its arms are timed
from process start rather than from when the fixture runs (its −8 "straddle" arm reaches f6 at
23:59:58, still yesterday), and its `+1` arm sits ON the band edge — I measured it GREEN in the full
guard run and RED at the same offset twenty minutes later, so the guard is itself a flake source at
the one hour it polices. I have recorded the measurement in both headers rather than patching another
lane's fixture; the unmet conditions are (a) day-anchor GATE(f5) the way GATE(f6) now is, (b) re-time
the guard's arms so the boundary lands INSIDE the fixture (probe f5's execution offset, then sweep at
1 s granularity), and (c) drop the "✅ RESOLVED"/"every hour of the day" wording from any release note
or DR document until (a) and (b) are green. Until then the operator rule is **do not apply in the last
10 or first 5 seconds of a UTC day**. This does not block the apply: the failure is fail-closed (the
fixture rolls back, the migration refuses), the function body is untouched, and the residual risk I am
accepting is a red CI run or a refused apply inside an 8-second band — never a player-value movement.
