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
