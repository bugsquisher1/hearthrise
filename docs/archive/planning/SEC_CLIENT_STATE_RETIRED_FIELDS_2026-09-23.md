# Security review — `2026-09-23-client-state-retired-fields.sql`

**Reviewer:** security-engineer (veto) · **Lane head reviewed:** `lane/client-state-retired-fields` @ `ca99e62c`, on b551 `372cf678`
**Review branch:** `sec/client-state-retired-fields` · **Date:** 2026-09-23 · **Production access:** none (replay + guards only)

**MIGRATION 2026-09-23-client-state-retired-fields.sql: GO-WITH-CHANGES**

The one change is **S1**, and it is not about the SQL: the branch as staged makes a registered CI guard
exit 1, and the file's own note schedules the fix for *after* the apply. Land the one-line
`live-hash-drift.baseline.json` edit **with the merge**, before the branch reaches `next`. Everything
else below is advisory; the migration's security property is intact and measured.

---

## 1. Findings

| # | P | Surface | Verdict | Trigger | Blast radius | Fix |
|---|---|---|---|---|---|---|
| **S1** | **P1** | `tests/live-hash-drift.baseline.json` · `touched_by` for `hr_put_client_state__ungated` | **CONFIRMED** | `node tests/apply-order-honesty.mjs` → **exit 1** on this branch. It is a registered CI command (`smoke.yml:461`, `ci-shape` → job `db-replay`). The deleted `2026-09-14-client-state-projection-denylist.sql` is still named in that `touched_by` list. | The whole five-job matrix goes red on `next`/`main` from the merge until the post-apply re-seed. Per CLAUDE.md §4 one red job makes the CI gate unreachable for *every later build* — the b512 class. | Coordinator deletes the one string `"2026-09-14-client-state-projection-denylist.sql"` from that `touched_by` array **in the merge commit**. **Measured:** with that single line removed the guard exits **0** ("30 file(s) carry a measured verdict … every note agrees"). The `why` text may keep naming the file; the guard does not read it. The full `--live --write` re-seed still happens after the apply, as the file says. |
| **S2** | P3 | `v_retired` spellings | CONFIRMED | `v_deny` carries every authority name in **both** its camelCase and snake_case spellings and says why ("a patch key is whatever the client sends"). `v_retired` carries camelCase only. Measured: `tool_carry`, `renown_high`, `auto_eat_pct`, `combat_style`, `streak_days`, `auto_eat_food` are all stored un-stripped and **un-journalled** — and the first four are live `state.*` projection keys. | **Self-only dead bytes, not a forge.** `hydrateInto` iterates `RESIDUE_FIELDS`, and `RESIDUE_FIELDS ∩ (v_deny ∪ v_retired) = ∅` (measured, and `arm-homing-guard` now enforces both halves). The cost is diagnostic: a tab sending the server spelling would be invisible to the `retired_field` breakdown this file exists to produce. | Either add the six server spellings that actually exist (`streak_days`, `auto_eat_pct`, `auto_eat_food`, `combat_style`, `tool_carry`, `renown_high`) to `v_retired` — and `hero_slots`/`gem_unlocks` if the two entitlement readers are to be covered symmetrically — or state in the body's comment that the list is camelCase-only **by measurement** (no shipped bundle ever sent the snake form — the deleted 2026-09-14 file used the same nine camelCase names) so the asymmetry reads as a decision. Not apply-blocking. |
| **S3** | P3 | `hr_record_rejection` `c_why_cap` vs `v_retired` | CONFIRMED | The entire diagnostic value of `retired_field` is the `whys` breakdown, and the cap that bounds it is `c_why_cap constant int := 12` in `2026-09-13-rejections-verb-map-2.sql` — a file that has never heard of `v_retired`, which holds **ten**. Two names of headroom. Measured: at 15 names the map folds to `{"(other)": 3, …}` and the diagnosis is gone. | Silent loss of the only fact ops needs, on the day the list passes twelve names. | `arm-homing-guard`'s new scan asserts `retired.size >= 10` but has no upper bound. My guard's **X3** arm closes the behavioural half (reads the installed list out of `pg_get_functiondef`, drives every name, fails on `(other)`). Recommend also adding `retired.size < c_why_cap` to `arm-homing-guard` so it fails at lint time, naming the cap. |
| **S4** | P4 | The deny-list's exact-match comparison | CONFIRMED, **pre-existing, unchanged by this file** | `p_patch ? v_key` is exact and case-sensitive. Measured stored verbatim: `Gold`, `GOLD`, `"gold "`, `" gold"`, the Cyrillic homoglyph `gоld`, and nested `{settings:{gold:1e12}}`. | **Bounded and inert.** Live since `2026-08-22-client-state-denylist.sql`; the binding control is the client-side allowlist (`hydrateInto` writes only `RESIDUE_FIELDS`, so a bag key that is not on it is dead bytes) plus the fact that no server body reads `client_state` for authority. Self-only, capped at 256 KiB. | None here — recording it so it is not re-found as new. `settings`/`stats` *are* residue, so a nested forgery hydrates to `G.settings.gold`, never `G.gold`; nothing gates or spends it. |
| **S5** | P4 | First cap check ordering | CONFIRMED | `octet_length(p_patch::text) > v_cap` is charged on the **raw** patch, before the strip. Measured: a 300 KB retired value is refused `patch_too_large` and stores nothing. | A stale tab whose retired value *alone* exceeds 256 KiB still loses the whole save. | Conservative direction and no honest tab is near it (`buffs` is a handful of segments). Left as-is deliberately; noted so the ordering is a choice on the record. |
| **S6** | P4 | `tests/patch-chain-guard.baseline.json` | CONFIRMED, not a loosening | The `--write` swept in nine unrelated migrations (09-17 … 09-22) and four chain records (`hr_apply` 0→3, `hr_credit_combat_xp__ungated` 7→11, `hr_claim_bounty__ungated` 0→1) that belong to other lanes' commits. | Bookkeeping noise in this commit. | **Measured at the lane base `372cf678`: `patch-chain-guard` already exits 0 and already reports the higher depths.** The baseline was a week stale; nothing was loosened to get green. This lane's own paydown — `hr_put_client_state__ungated` **3 → 0** — is real and is the point. |

No finding moves value, crosses to another player, or is reachable by a role other than the row's own owner.

## 2. The brief's five questions, answered by measurement

**(1) Can an authority value be smuggled under a retired name, a nested path, a case/whitespace variant, a duplicate key, or a key on both lists?**
No. The deny loop runs **first** and reads the **raw** `p_patch`, so nothing the strip does can carry a name out from under it — a patch carrying both `{gold:1e12}` and `{buffs:…}` is refused `forbidden_field/gold`, stores nothing and files **no** `retired_field` occurrence (R7, §4(c), and my X2 arm, which proves the property bites by hoisting the strip, pointing the deny loop at the stripped remainder and putting `gold` on both lists). Duplicate keys are canonicalised by `jsonb` before `?` ever runs (measured: `{"gold":1,…,"gold":2}` → refused; `{"buffs":1,…,"buffs":2}` → one strip). Case/whitespace/nested variants are **S4**: stored, pre-existing, inert.
**Completeness of the authority list vs `hr_state_of`:** diffed mechanically against `c_top` ∪ `c_state` of `2026-09-14-hr-state-of-restatement.sql`. 35 server-owned projection keys are on neither list (`traits`, `gem_unlocks`, `hero_slots`, `bounty`, `enchant`, `total_level`, `hp`, `max_hp`, `dungeon_scrip`, the `hearthfind_*` family, …). **That is not this file's debt and it is not a hole today**, because the boundary that binds is the client allowlist, and `RESIDUE_FIELDS ∩ (v_deny ∪ v_retired) = ∅` is now enforced in **both** directions by `arm-homing-guard`. The other half of that argument is now measured rather than assumed: grepping every migration and edge function for `client_state`, the **only** server-side reader is `hr_state_of` projecting the bag straight back into the envelope (`'client_state', coalesce(v_st.client_state, '{}'::jsonb)`). No server body reads a bag key for a gate, a price, a payout or a verdict, so a key that is on neither list buys nothing on either side of the wire. It is worth saying out loud that `traits` sits in exactly the latent shape `src/net/client-state.js` describes: server-owned, deliberately off `RESIDUE_FIELDS`, and on no server list — so the day anyone re-adds it to the residue, the bag becomes a second source for a paid entitlement. That is a standing note for the lane that touches `traits`, not a condition on this apply.

**(2) Is the strip applied before size accounting and before the merge?**
Yes, measured both ways. 50 KB of retired `buffs` beside one honest key: `bytes` comes back as the octet length of what was **actually stored** (24), the bag does not contain `buffs`, and a bag already 200 KB full still accepts a put whose only over-cap key is retired. Both halves are mutation-proven by my X1 arms (`merge_reads_the_raw_patch`, `bag_cap_charged_on_the_raw_patch`) — the first is the dangerous one, because it makes the answer lie without changing a word of it: `stripped` still names the key while the value lands and eats the cap.

**(3) Write amplification / can a hostile client flood the journal?**
No. Measured by executing: one put naming all ten retired names → ten `hr_record_rejection` calls, **one** `hr_rejections` row (`on conflict (user_id, slot, day, code) do update`), `n` +10, ten distinct `whys` keys, `severity = normal`. `retired_field` is on neither `c_incident` nor `c_escalating`, so it never promotes and `hr_rejections_incident_idx` stays answerable — correct, and asserted by §4(b). The ceiling is `hr_rpc_gate('client_state_put') = 60/min` (measured: 75 puts → 38 ok, 37 `rate_limited`), so the worst case is ~600 same-row UPDATEs a minute on one self-owned row — row churn, never row growth, never another player's. The real case is one name per put on one tab. The only bound that is not obvious from this file is **S3**.

**(4) Is the restatement derived from the live body, is the pin the right granularity, and what does the deletion cost?**
The pins are **verified by replay, exactly**:

| Claim | File / header says | Measured (PGlite, real ordered chain) |
|---|---|---|
| `c_prev` (chain **without** this file, code-only) | `8a017097316005e76b8af6227b090827` / 2375 | **identical** — `8a017097316005e76b8af6227b090827` / 2375 |
| chain-without-this-file, normalised | `48de8fb3bb5155176f0e43de927de5c9` / 3795 | **identical** — `48de8fb3bb5155176f0e43de927de5c9` / 3795 |
| `c_new` (the body §1 installs, code-only) | `fc32832287bfa6a73df4c37330c05cb8` / 3056 | **identical** — `fc32832287bfa6a73df4c37330c05cb8` / 3056 |

**CODE-not-raw is the right granularity, and it is now arithmetic rather than argument.** The predecessor body's *code* contains **zero** non-ASCII characters, so a mojibake'd production copy has the **same** code md5 as the replay — the pin is immune to the exact fault the baseline records. Its *comments* carry 78 non-ASCII characters / 233 bytes, which predicts a mojibake'd `norm_len` of **3950** against the baseline's measured live **3947**: a 3-character residue in comment bytes that the code pin cannot see and does not need to. And the claim "live == replay in code" is **not taken on trust anywhere** — §0 is the measurement, taken on production at apply time, and a mismatch aborts with both hashes in the message. Refusing is the right failure mode: a restatement over an unrecognised body discards the difference in silence, which is the one failure unique to this shape.
**The deletion is the right disposition.** The nine names are carried forward **verbatim** from the deleted file (`streak, autoEatPct, foodSlot, combatStyle, toolCarry, renownHigh, heroSlotsUnlocked, ownedThemes, ownedCosmetics`) with nothing dropped and nothing added to `v_deny`; §0's `c_cols` precondition list is the same one that file required. Applying it as written would put those nine on the **authority** list and reproduce today's outage nine names at a time on every unreloaded tab — its own header says so, under a timing condition (≥24 h after the client half) that the measurement disproves: nine days after b547 a tab is still sending `buffs`. Remaining references to the deleted file are all comments (`src/net/client-state.js:454`, `src/features/smoke/companions-claims-and-renown.js:1867`, `2026-09-13-client-state-buffs-denylist.sql:173`, the two 09-14 apply-order notes) plus **the one structural reference that is S1**.

**(5) The guards.**

| Command | Real exit code | Note |
|---|---|---|
| `node tests/client-state-retired-fields.mjs` | **0** | shipped guard |
| `node tests/client-state-retired-fields.mjs --selftest` | **0** | 20 arms, all bite |
| `node tests/client-state-retired-fields-adversarial.mjs` | **0** | new, mine |
| `node tests/client-state-retired-fields-adversarial.mjs --selftest` | **0** | 8 arms + negative control, all behave |
| `node tests/arm-homing-guard.mjs` | **0** | 78 G fields homed; both collision directions now scanned |
| `node tests/schema-drift.mjs` | **0** | repo rebuilds to the committed fingerprint |
| `node tests/selfcheck-no-global-dml.mjs` | **0** | 207 migrations, 9 acknowledged globals |
| `node tests/apply-order-honesty.mjs` | **1** | **S1** |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green` in this worktree |

Byte-identical second apply is covered twice: R10 re-applies the file on the assembled chain and asserts `pg_get_functiondef` is unchanged, and §0's `c_new` branch makes the re-apply a notice rather than a refusal.

## 3. What I added

`tests/client-state-retired-fields-adversarial.mjs` — the three properties the strip **introduced** that its own guard does not measure. It deliberately repeats nothing from `tests/client-state-retired-fields.mjs`.

- **X1 size accounting.** The strip moved the merge from `p_patch` to `v_patch`. A later restatement that merges the raw patch while still reporting `stripped` keeps the answer saying the right thing while the forged value lands and eats the cap.
- **X2 ordering is the whole fail-safe.** Nothing in the body says a name cannot be on both lists; what makes the authority key win is that the deny loop runs first and reads the raw patch.
- **X3 the journal is bounded by a cap in another file.** Reads `v_retired` out of the **installed** body, so the arm grows with the list instead of going stale.

Eight mutation arms (each gate and gate-blind) plus a comment-only negative control: **all behave.** Registered in `.github/workflows/smoke.yml` under `db-replay-2` — on the budget rationale that split the family, since this is one replay plus eight mutation boots and `db-replay` already took the lane's own guard — and in `tests/ci-shape.baseline.json` via `node tests/ci-shape.mjs --write` (two lines, mine only). `node tests/ci-shape.mjs` → **0**.

## 4. Coordinator runbook

**Before anything else — the S1 change.** In the commit that merges this lane onto the set branch, delete the single line
`    "2026-09-14-client-state-projection-denylist.sql"`
from the `touched_by` array of the `hr_put_client_state__ungated` entry in `tests/live-hash-drift.baseline.json` (leave the `why` text alone), then confirm `node tests/apply-order-honesty.mjs` exits **0**. Agents do not touch that file (CLAUDE.md §2); this is the Coordinator's and it must land **before `next`**, not after the apply.

### 4a. Pre-apply, read-only, with the answers to expect

Every statement below was **executed against the replayed chain in this review** — the shapes and the
expected values are measured, not drafted. (2) run on the applied chain returns
`fc32832287bfa6a73df4c37330c05cb8` / 3056, which is also post-apply read (5).

```sql
-- (1) THE BEFORE-NUMBER for the affected player. Expect ~900-960 and climbing.
-- Prefix-matched so it is runnable without looking the full uuid up first;
-- vitals --refusals prints the same eight characters.
select day, code, n, severity, intent, whys, last_at
  from public.hr_rejections
 where left(user_id::text, 8) = 'b94fa8c0'
   and code in ('forbidden_field','retired_field')
 order by day desc;
-- EXPECT: one forbidden_field row for today, n in the 900s, whys {"buffs": n},
--         severity normal, intent hr_put_client_state. NO retired_field row yet.

-- (2) THE PREDECESSOR PIN, measured on production. This is §0's own arithmetic,
--     run by hand first so the apply cannot be the first time anyone looks.
select md5(c) as code_md5, length(c) as code_len from (
  select btrim(regexp_replace(regexp_replace(
           replace(pg_get_functiondef(
             'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), ''),
           '--[^' || chr(10) || ']*', '', 'g'), '[[:space:]]+', ' ', 'g')) as c) q;
-- EXPECT EXACTLY: 8a017097316005e76b8af6227b090827 / 2375
--   Anything else: STOP. Do not apply, do not edit the constant. Re-derive from
--   the chain (tests/schema-replay.mjs) and review the diff — something else has
--   patched this body since 2026-09-22.

-- (3) THE §0 PRECONDITIONS, so a fail-closed raise is not a surprise mid-apply.
select (select count(*) from information_schema.columns
         where table_schema='public' and table_name='player_state'
           and column_name in ('buffs','streak_days','auto_eat_pct','auto_eat_food',
                               'combat_style','tool_carry','renown_high'))            as cols_expect_7,
       to_regprocedure('public.hr_hero_slots_of(uuid)')                    is not null as hero_slots_expect_t,
       to_regprocedure('public.hr_gem_unlocks_of(uuid,int)')               is not null as gem_unlocks_expect_t,
       to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)')
                                                                           is not null as recorder_expect_t,
       to_regprocedure('public.hr_rejection_why(jsonb)')                   is not null as why_expect_t,
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='hr_rejections'
           and column_name='whys')                                                     as whys_expect_1;
-- EXPECT: 7, t, t, t, t, 1.

-- (4) THE GRANT POSTURE, so §4(f)'s claim has a before-picture.
select has_function_privilege('authenticated','public.hr_put_client_state(int,jsonb,uuid)','execute')          as wrapper_expect_t,
       has_function_privilege('authenticated','public.hr_put_client_state__ungated(int,jsonb,uuid)','execute') as ungated_auth_expect_f,
       has_function_privilege('anon','public.hr_put_client_state__ungated(int,jsonb,uuid)','execute')          as ungated_anon_expect_f;
-- EXPECT: t, f, f.
```

Also capture `node tools/vitals.mjs --refusals` output before the apply — the new per-(user, slot) table is the before/after picture, and it prints no `retired_field` rows until this applies (the honest answer, not an error).

### 4b. The apply

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-23-client-state-retired-fields.sql
```
One file, one call, no `begin/commit`, **never during 00:00–00:10 UTC**. Expect §0's `go`, §3 silent, and §4's `PASSED:` notice. Any raise aborts the whole file and changes nothing — §4's probe rows live inside an HR823 sentinel rollback with a four-table leak assertion, so a failure is net zero.

There is **no client half and no `?v=` bump**. An old tab and a new tab both behave correctly the moment this lands, and no edge deploy is involved.

### 4c. Post-apply reads

```sql
-- (5) THE INSTALLED BODY IS THE BODY THE FILE NAMES.
--     Same expression as (2). EXPECT: fc32832287bfa6a73df4c37330c05cb8 / 3056

-- (6) THE STALE TAB'S NEXT AUTOSAVE MUST LAND. Run ~2-3 minutes after the apply
--     (the tab saves every 60-90 s).
select slot, updated_at, octet_length(client_state::text) as bytes,
       client_state ? 'buffs' as bag_has_buffs_expect_f,
       (select count(*) from jsonb_object_keys(client_state)) as keys
  from public.player_state
 where left(user_id::text, 8) = 'b94fa8c0';
-- EXPECT: updated_at MOVES past the apply time — that is the whole point of the
--         file — and bag_has_buffs stays false.

-- (7) THE JOURNAL SWITCHES CODES.
select day, code, n, severity, intent, whys, last_at
  from public.hr_rejections
 where left(user_id::text, 8) = 'b94fa8c0' and day >= current_date - 1
 order by day desc, code;
-- EXPECT: a NEW retired_field row, severity normal, whys {"buffs": n}, n rising
--         ~1 per autosave; and forbidden_field STOPS climbing (its last_at
--         freezes at the apply minute). Both together are the fix; either alone
--         is not.

-- (8) NOBODY ELSE STARTED STRIPPING. A second character appearing here is a
--     bundle nobody knew was still out there — good news, but read it.
select left(user_id::text,8) as who, slot, code, n, whys
  from public.hr_rejections
 where day = current_date and code in ('forbidden_field','retired_field')
 order by n desc;
```

`node tools/vitals.mjs --refusals` is the same picture with less typing, and its new per-(user, slot) block is the one to read.

### 4d. Re-measure and re-record

1. `node tests/live-hash-drift.mjs --live --write`, then write the `why` for `hr_put_client_state__ungated` from `--codediff`. After this apply the body is written whole, so live and replay should agree **exactly** and the entry stops being DELIBERATELY DIVERGENT. If they do not agree, that is a finding, not a formatting note.
2. The same re-seed drops the deleted file from `touched_by` — already done under S1, so confirm it is still absent rather than re-added by the `--write`.
3. Flip `2026-09-23-client-state-retired-fields.sql` in `tests/schema-apply-order.json` from `STAGED, NOT APPLIED` to the APPLIED note (timestamp, worktree, sha, the §0 predecessor it accepted and the body it installed).
4. `node tests/restore-census.mjs` — no new table, so expect no new classification; run it to say so.
5. `node tests/apply-order-honesty.mjs` → 0, and `node tests/live-hash-drift.mjs` → 0.

### 4e. Rollback

The reversal is **the chain replayed without this file**, which rebuilds code
`8a017097316005e76b8af6227b090827` / 2375 chars exactly. **Generate and keep that text BEFORE applying** —
this exact script was run in this review and its output hashes to that constant:

```bash
cat > /tmp/emit-rollback.mjs <<'EOF'
import { bootReplay } from './tests/schema-replay.mjs';
const { db } = await bootReplay({ upTo: '2026-09-22-pg-net-queue-lockdown.sql' });
const r = await db.query("select pg_get_functiondef("
  + "'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure) as d");
process.stdout.write(r.rows[0].d + ';\n');
process.exit(0);
EOF
cp /tmp/emit-rollback.mjs ./.emit-rollback.mjs
node .emit-rollback.mjs > ~/.hearthrise/rollback-hr_put_client_state__ungated-2026-09-23-pre-restatement.sql
rm -f .emit-rollback.mjs
# VERIFY before trusting it — must print 8a017097316005e76b8af6227b090827 / 2375:
node -e "const f=require('fs'),c=require('crypto');
  const d=f.readFileSync(process.env.HOME+'/.hearthrise/rollback-hr_put_client_state__ungated-2026-09-23-pre-restatement.sql','utf8');
  const x=d.replace(/;\s*\$/,'').replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
  console.log(c.createHash('md5').update(x).digest('hex'), x.length);"
```

`bootReplay` has no `--upTo` CLI flag; the option is programmatic, which is why this is a script and not a
one-liner. The emitted file is a single executable `create or replace`; append §2's two `revoke` lines to it
so the rollback restates the grant posture the way the migration does, then apply it with
`node tools/apply-migration.mjs <file>` like any other.

**Re-applying `2026-09-13-client-state-buffs-denylist.sql` does NOT reverse this** — its §0 anchor no longer
matches the restated body, so it refuses loudly rather than half-reverting. That is the correct behaviour and
it is stated in the file but asserted nowhere; do not reach for it.

Rolling back restores the outage: user b94fa8c0 stops saving residue again within one autosave. Weigh that
against whatever prompted the rollback.

## 5. Guard exit codes I saw

Every "green" below is an exit code read from an unpiped run in this worktree, not an expectation (CLAUDE.md §4).
**`lane-done` does not run `apply-order-honesty`** — its check list is the four debt ratchets, the census and
lint guards, `ci-shape`, `guard-hygiene` and `bump-version --check`. A green `lane-done` therefore does **not**
clear S1; S1 shows up only on the GitHub `db-replay` job, which is exactly why it would land as a red matrix
rather than as a red lane.

| Command | Exit |
|---|---|
| `node tests/client-state-retired-fields.mjs` | 0 |
| `node tests/client-state-retired-fields.mjs --selftest` | 0 — 20 arms, all bite |
| `node tests/client-state-retired-fields-adversarial.mjs` | 0 |
| `node tests/client-state-retired-fields-adversarial.mjs --selftest` | 0 |
| `node tests/arm-homing-guard.mjs` | 0 |
| `node tests/schema-drift.mjs` | 0 |
| `node tests/selfcheck-no-global-dml.mjs` | 0 |
| `node tests/ci-shape.mjs` | 0 |
| `node tests/apply-order-honesty.mjs` | **1** — S1 |
| `node tools/lane-done.mjs` | **0** — `lane-done: all green` |

## 6. Residual risk accepted

- The deny-list's exact-match comparison (**S4**) — bounded by the client allowlist and by nothing in this file; unchanged since 2026-08-22.
- 35 server-owned `hr_state_of` projection keys on neither server list — bounded the same way; `traits` is the one worth watching because it is deliberately homeless on both sides.
- `retired_field` is a **new code on a client-drivable path**. Measured bounded: one aggregate row per (user, slot, day, code), never escalating, ceiling 60 puts/min — but it is new surface, and the `whys` headroom of two (**S3**) is the part that is not obvious from either file.
- The `c_prev` pin is verified against the **replay**. Production is measured only by §0, at apply time. That is the correct design — but it means the apply is the first time anyone sees production's answer, so run pre-apply read (2) by hand first.

*The property this defends is unchanged and is the one that matters: the forgeable shadow copy still never lands in `client_state`. It is refused entry by name, exactly as before. Only the blast radius of that refusal changes — from "this player saves nothing" to "this key does not save, and the journal says which one."*
