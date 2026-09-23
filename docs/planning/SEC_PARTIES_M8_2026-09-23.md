# Security review — M8 slice 1, party MEMBERSHIP (not a money surface, and proved so)

**Reviewer:** security-engineer (veto) · **Branch reviewed:** `lane/m8-parties-s1` @ `b46b1d0d`
(carried on `set/b551`) · **Review branch:** `sec/m8-s1-review` · **Date:** 2026-09-23
**Design authority:** `docs/planning/WORLD_TICK_DESIGN.md` §18, §18-SEC, and §18-SEC-2 (JOB A, appended today)

| artefact | verdict |
|---|---|
| `2026-09-23-m8-parties-s1-1-tables.sql` | **GO-WITH-CHANGES** — B6(i), B11; the tables, the policies, the indexes and the frozen read are sound |
| `2026-09-23-m8-parties-s1-2-verbs.sql` | **GO-WITH-CHANGES** — B1, B2, B3, B4, B5; four of the five are permanent, silent and on one path |
| `2026-09-23-m8-parties-s1-3-client-surface.sql` | **GO-WITH-CHANGES** — B6(iii), B11; the S-14 handling is the best in the batch |
| `tests/party-membership.mjs` (+ `--mutate`) | **GO** — a real standing guard; it re-applies the chain on every push, and the `--mutate` is two honest stages |
| the four baselines + the `smoke.yml` step | **GO** — every count delta is accounted for; nothing hides |
| **the batch, as an APPLY** | **GO-WITH-CHANGES — and every change is LANDED on `sec/m8-s1-review` and re-proved.** See §5. |

**No production reads and no production writes were made.** No database credential was
sought or used. Every measurement below ran against the repo's own PGlite chain replay
in this container.

Three conclusions up front. **The security shape of this slice is right and I could not
break it**: there is no client write grant anywhere, no policy but SELECT, no
cross-user read but one frozen function, no predicate a client can call, and the two
invariants are partial unique indexes that the verbs treat as the authority rather than
as a second opinion. **The lane's finding back to me is correct and I accept it in
full** — S-7's fix as I wrote it cannot be built, and removing the read beats relocating
it. **And the defects that are left are not security defects, they are correctness
defects on the one path §18-SEC.1 S-6 already told everybody to look at**: leave →
re-invite → accept was broken in three independent ways, all permanent, all silent, and
none reachable from any arm in the batch because the arm that walks that path is refused
one step earlier by a stubbed predicate.

---

## 1. Findings

Graded against `CLAUDE.md` §1's target property and against the scope §18-SEC.0 set for
S1: *membership only, no money surface, carrying S-7, S-11, S-12, S-13, S-14*.
**LANDED** means the change is on this branch and re-proved; **RECORDED** means it is a
note for a later brief and blocks nothing.

| # | Sev | Finding | Status |
|---|---|---|---|
| **B1** | P1 | `hr_party_accept` answers a `members` count the server does not hold | **LANDED** |
| **B2** | P1 | a party a character LEFT can never be rejoined, and the refusal names the wrong reason | **LANDED** |
| **B3** | P2 | `hr_party_create` mints a free orphan `party` row on every lost race | **LANDED** |
| **B4** | P2 | an EXPIRED invite holds the door shut permanently | **LANDED** |
| **B5** | P2 | S-13's single string has three different amounts of work behind it | **LANDED** |
| **B6** | P2 | three claims in the batch are false in the direction of "the fence is there" | **LANDED** |
| **B11** | P3 | only the absence of a *non-SELECT* privilege is asserted; `service_role` is BYPASSRLS | **LANDED** |
| **B7** | I | `hr_party_view` is STABLE and transitively writes; PostgREST runs STABLE on GET read-only | **RECORDED** |
| **B8** | I | the panel READ and the five write verbs share one 12/min bucket | **RECORDED** |
| **B9** | I | `hr_party_hunt_live` is replaced mid-apply by the §8 gate | **RECORDED** |
| **B10** | I | `hr_party_kick`'s `if v_left = 0` branch is unreachable | **RECORDED** |

### B1 — `hr_party_accept` answers a `members` count the server does not hold **[P1, LANDED]**

`v_n` is the party's live member count, read under the party row lock at the T-6
re-count. Twenty-eight lines later the acceptor's day clamp reads into **the same
variable**, and the answer is then built as `'members', v_n + 1`.

The day-clamp read is `select coalesce(value, 0) into v_n from public.player_progress
where …`, and `coalesce` applies to the COLUMN, not to "no rows" — so on the first
accept of a UTC day there is no row, `v_n` is **NULL**, and the verb answers
`{"ok": true, "party_id": …, "role": "member", "members": null}`. On every later accept
that day it answers the acceptor's daily accept count plus one. It is never the party's
size.

This is `CLAUDE.md` §6's standing P1 class — *the browser never says one thing while the
server says another* — reached not by a residue field but by a variable shared between a
count and a clamp. Nothing in the batch reads `members`: the migration's §8(e) asserts
`ok` and the membership row, and the node guard's J4 asserts `ok`, `party_id` and `role`.

**Landed:** the size lives in its own `v_size`, and §8(e1) plus the node guard's `B1` arm
assert the answered `members` equals the live count. Mutation-proved — restoring
`v_n + 1` makes the apply fail with `GATE(e1): accept answered members=<NULL> and the
party holds 2 live member(s).`

### B2 — a party a character LEFT can never be rejoined **[P1, LANDED]**

`party_member`'s PRIMARY KEY is `(party_id, user_id, slot)` and a departure is a
`left_at` stamp, not a delete. So the second tenure's plain `insert` raises on the
**primary key** — and the handler, `exception when unique_violation`, cannot tell a PK
collision from an invariant-1 or invariant-2 one and answers **`already_in_party`**.

Two things are wrong and both are permanent. The player is told they are in a party they
demonstrably left, and the state that produces it never clears. It is also exactly the
path §18-SEC.1 S-6 priced — *"leave → re-invite → accept is the same lever with 20/day of
headroom per member"* — so the lane has, by accident, closed S-6's lever by making the
lever impossible. S2 must not inherit that as a designed property.

**The batch cannot see it.** §8(f) walks this precise sequence — B leaves, A re-invites,
B accepts — but that accept is refused one step earlier by the stubbed
`hr_party_hunt_live`, and §8(g) then offers the same card to a spread refusal. No arm
ever completes a rejoin.

**Landed:** the insert is an upsert on the PK that REVIVES the dead row as a new tenure
(`joined_at = now()`, `left_at = null`, `removed_by = null`) only `where pm.left_at is
not null`; a live row does not match, so the upsert touches nothing, `found` is false and
the raced refusal below is reached; a row live in ANOTHER party still raises
`party_member_one_live`, which is the fence invariant 1 IS. §8(e3) and the node guard's
`B2` arm assert the rejoin succeeds and leaves **one** row, not two. Mutation-proved —
the plain insert makes the apply fail with `GATE(e3): B2 — rejoining a party this
character LEFT answered {"ok": false, "error": "already_in_party"}`.

One cost, stated rather than discovered: reviving the row overwrites the previous
tenure's `left_at` and `removed_by`, so the removal audit keeps only the latest. That is
acceptable while `removed_by` exists to count a per-party daily kick clamp; the day the
audit has to be a history, `party_member` gains a surrogate key and the two partial
unique indexes stay exactly as they are. **That is S4's call, recorded here.**

### B3 — `hr_party_create` mints a free orphan `party` row on every lost race **[P2, LANDED]**

The `insert into public.party` sat ABOVE the `begin … exception when unique_violation`
that wraps the `party_member` insert. A plpgsql sub-block rollback undoes only what the
sub-block contains, so the loser of an invariant-1 race kept its `party` row — leaderless
in fact, memberless, and readable by nobody, because the SELECT policy requires a live
member. The handler then **released the idempotency key and never incremented
`ev:party_creates`**.

So the row is free. Two concurrent `hr_party_create` calls on one character mint one
permanent junk row and spend nothing from the ten-a-day clamp that was supposed to price
it; the only ceiling left is the 12/min bucket, about **17,000 rows a day per account**.
It discloses nothing and moves no value — it is a storage-growth lever, and it is the
kind that is cheap to fix now and awkward after the table has rows in it.

**Landed:** both inserts are inside the sub-block. A race cannot be staged on a single
replay connection, so the property is asserted where it IS visible — §8(y2) reads
`hr_party_create`'s comment-stripped `prosrc` and requires that the span from the party
insert to the handler contains no `begin`. Mutation-proved — moving the insert back out
makes the apply fail with `GATE(y2): hr_party_create inserts its party row OUTSIDE the
sub-block whose rollback is supposed to take it back.`

### B4 — an EXPIRED invite holds the door shut permanently **[P2, LANDED]**

`party_invite_live` is unique on `(party_id, user_id, slot) where accepted_at is null and
revoked_at is null`. **Expiry is neither of those.** A card that timed out fifteen
minutes ago therefore still occupies the slot, so the leader's next invite to the same
character from the same party raises `unique_violation` and answers
`invite_target_unavailable` — for ever, with no way for the leader to see it or clear it,
and no verb anywhere that revokes an expired card.

It also makes the index and the receiver clamp disagree about the word "live": the
5-live count reads `expires_at > now()` and the index does not, so a character can hold
five index slots and count zero.

**Landed:** `hr_party_invite` writes expiry down as a revocation for that
`(party, target, slot)` immediately before the insert, which is what it always meant.
§8(e3) and the node guard's `B4` arm age a card and require the next invite to succeed
with exactly one live card left. Mutation-proved — removing the revocation makes the
apply fail with `GATE(e3): B4 — an EXPIRED card blocked the next invite`.

### B5 — S-13's single string has three different amounts of work behind it **[P2, LANDED]**

S-13's ruling was one refusal string for every unavailable target. The lane implemented
it correctly on the payload — `c_one` is declared `constant` so no branch can return a
second string, and the header is honest that name EXISTENCE is already public
(`display_names` is `for select using (true)`, `hr_display_name_available` is granted to
`anon`) so the fence is only over the fact S-13 actually named: **whether a given player
is currently in a party.**

The resolution short-circuited, and the clock reads the branch the payload hides.
`already_in_party` returned after one `hr_party_of`; an honest target ran two more count
queries and then two writes. One string with three costs behind it is still an oracle.

**The sender's clamp does not bound the sampling, and the file's own reasoning about
that is backwards.** `ev:party_invites` is incremented only on a SUCCESSFUL invite, so a
refused probe is free; the header argues that reading the day clamp *before* resolution
stops a sender learning the cause from their own budget, which is true and which also
means there is no budget. The only ceiling is the 12/min bucket — about **17,000 probes a
day**, against the "twenty times a day per account" S-13 measured.

**Landed:** once a target user resolves, all three post-resolution predicates
(`hr_party_of`, the 5-live count, the 20-today count) are evaluated **unconditionally**
and the reason is chosen afterwards, so partied and not-partied cost the same three
reads. With the payload constant and the work constant there is nothing left for an
unlimited probe budget to buy, which is why I did **not** also add a probe clamp: it
would cost honest mistyped invites their real budget to close a channel that is already
closed. `S13a`, `S13b` and `S13c` cover the payload half and stay green; the `--mutate`
stages are untouched.

### B6 — three claims in the batch are false in the direction of "the fence is there" **[P2, LANDED]**

`CLAUDE.md` §4: a claim is gated on what the code does. All three read as reassurance and
none of them is true.

1. **File 1 §7's closing `raise notice`** — *"party_member's policy resolves through
   hr_party_of and does NOT recurse (a member reads their roster…)"*. The policy is
   `(select auth.uid()) = user_id`; §7(b) **refuses** a policy that reaches `hr_party_of`;
   and a member reads their own row, never the roster. The one sentence an operator sees
   at apply time described a design the file exists to reject.
2. **The apply-order note for file 1** calls `hr_party_of`/`hr_party_role` *"the fix for
   S-7's recursive policy"* — the fix the lane measured unbuildable.
3. **File 3's `hr_party_view` baseline entry** says *"Read-only: writes nothing, calls
   nothing that writes"*. It calls `hr_rpc_gate`, which upserts a rate counter. That
   entry is the approved-client-surface **claim**, read by a reviewer who is trusting it.

**Landed:** all three rewritten to what the code does, with (3) also carrying B7 and B8
so the next reader of the allowlist gets the two facts that matter about calling it.

### B11 — the assertion is one privilege wider than the grant **[P3, LANDED]**

File 3's §5(d) required no client role to hold a **non-SELECT** privilege on the three
tables. File 1 grants SELECT to `authenticated` only — but a stray SELECT left on `anon`
or `service_role` would have passed. It matters most for `service_role`, which is
BYPASSRLS: file 1's own comment says *"for it the revoke is the ONLY fence"*, and nothing
asserted the fence. A `service_role` SELECT reads every party in the game past every
policy.

**Landed:** §5(d) also asserts `anon`, `PUBLIC` and `service_role` hold **no** privilege
of any kind on any of the three.

### Recorded, not owed

- **B7 — `hr_party_view` is declared `stable` and transitively writes.** `hr_rpc_gate` is
  `volatile` and `hr_rate_ok` upserts. It replays green, because plpgsql's non-volatile
  restriction is checked per function body and the nested volatile call has its own.
  But **PostgREST runs a STABLE function in a READ ONLY transaction when it is invoked
  with GET**, and there the counter upsert raises 25006 and the panel's only read surface
  fails hard. `supabase-js` `.rpc()` POSTs by default, so this is a landmine rather than a
  bug: **the client half must never call it with `{ get: true }`**, and S2 should decide
  whether the honest declaration is `volatile`. Recorded in the allowlist note.
- **B8 — the panel READ shares the write verbs' bucket.** `hr_party_view` spends the same
  `party` bucket as `hr_party_create/invite/accept/leave/kick`, at 12/min. A panel polling
  at 10 s spends half of it, so an open party panel halves a player's own membership-verb
  budget. Not a security hole — a self-inflicted refusal. The client half should poll the
  panel off the envelope rather than off this RPC, or S2 gives the read its own bucket at
  the 120/min read band where `clan_seat_read` sits.
- **B9 — §8(f) does `create or replace function public.hr_party_hunt_live` inside the
  apply's own transaction** to prove S-11 against a predicate that answers TRUE, then puts
  it back. DDL rollback is real and the subtransaction restores it regardless, and at
  apply time the party tables are empty so no caller exists. It is fine here and it must
  not be carried into S2, where the predicate is load-bearing and the tables are not empty.
- **B10 — `hr_party_kick`'s `if v_left = 0` branch is unreachable.** A leader cannot kick
  themselves, so at least the leader remains live. Dead code, no defect.

---

## 2. What I attacked and could not break

Each of these is the attack §18-SEC.3 and the review brief named, and each failed.

- **Forge a second live membership.** `party_member_one_live` is a partial unique index on
  `(user_id, slot) where left_at is null`, and it is the fence rather than the verb's own
  read. Both `hr_party_create` and `hr_party_accept` read first and then treat the index
  as the authority, catching `unique_violation` and releasing the idempotency key. Two
  concurrent accepts into two DIFFERENT parties take two different party row locks and are
  therefore NOT serialised by the lock — the index is the only thing standing, and it
  stands: the second inserter blocks on the index until the first commits and then raises.
  A concurrent `party_create` + `party_accept` on one character resolves the same way.
  §7(d) provokes both duplicates and requires the unique violation, which is the
  difference between an invariant and an index nobody has ever seen bite.
- **Read another party's roster.** There is no path. `party_member`'s policy is
  `auth.uid() = user_id`, so a member reads their own row and an outsider reads zero — not
  an error, zero, which §7(b) asserts behaviourally in both directions because 42P17
  (recursion) and 42501 (a predicate the caller cannot execute) both land as an error and
  neither would be visible to a row-count test. `party`'s policy reads `party_member`, a
  different table whose own policy reads nothing, so the chain terminates in one step
  however it is entered. **No policy anywhere in the batch reads `player_state`.**
  `hr_party_view` is the only cross-user read and its membership fence consults only rows
  whose `user_id` is `auth.uid()`, so a caller cannot name someone else's slot to borrow
  their membership. Its key set is asserted as an EQUALITY against the eight frozen keys,
  and the three settle fields are asserted NULL — a number there in S1 would be fabricated.
  The refusal carries no `members` array, which §7(e) checks separately.
- **Enumerate names.** The five causes answer one constant, and after B5 they cost the
  same. "Does this name exist" was already public before M8 and the file says so instead
  of claiming a fence it does not have. `hr_party_kick` resolves by name **within this
  party's live members only**, so it can match nothing the caller's own panel did not
  already show them. `hr_party_accept`'s invite lookup pins `user_id = v_uid and slot =
  v_slot` in the WHERE clause, so naming someone else's invite id answers the same
  `invite_gone` as naming a uuid that never existed (§8(e2)).
- **Bypass the bucket.** Every one of the six functions calls `hr_rpc_gate('party')`
  before touching a table, §8(y) asserts that by reading all five bodies, and the node
  guard's `GATE` arm proves the thirteenth call in a minute is refused — on a call the
  gate is actually REACHED by, not one refused earlier. An unknown bucket fails closed, so
  the file-2 precondition that refuses to install if file 1 did not patch the bucket in is
  the right direction of failure.
- **Accept into a party mid-hunt once S2 lands.** The seam is already right. `hr_party_hunt_live`
  exists, is called on every accept **under the party row lock**, and S2 changes one body
  and inherits a tested refusal. Proved both ways: stubbed TRUE the accept is refused
  `party_hunt_running` and writes no row; back to FALSE the SAME card is accepted, so the
  arm measured a refusal and not a card that was never usable.
- **Make the self-check pass while leaving a row.** Both §7(z) and §8(z) check twice: the
  named probe ids are absent from eight tables including `auth.users`, AND the three party
  tables hold **zero rows in total** — the second form catches a row planted under some
  other id, which the first cannot. The rollback is the method; the count is the proof.
- **Fabricate player state.** Nothing in the batch seeds, heals, grants or resets. The
  probe characters are made with `hr_create_character` inside a subtransaction that ends
  at `HR823`/`HR824`.

**And on scope.** §8(y) reads all five verb bodies at apply time and refuses to install if
any names `hr_apply`, `player_ledger`, `player_inventory`, `player_equipment`,
`player_bank`, an `hr_tick_` table, `party_hunt`, `party_tick_lease`, or gold / gems /
Hearth Tokens / xp / dungeon scrip / marks. §7(f) refuses if an S2 table exists. That is a
scope claim executed rather than asserted, and it is the right way to write one.

---

## 3. The `hr_rpc_gate` patch — a body change every money verb passes through

This is the one thing in the batch that touches an existing, load-bearing function, so it
gets its own section.

**The idiom is byte-for-byte the one `2026-09-22-vigour-refill.sql` §5 used**, which
applied on a Security GO at 06:26 UTC today: read the LIVE body with
`pg_get_functiondef`, strip CRs, skip if the bucket literal is already present, refuse to
patch unless the case terminator `else return false;\n  end case;` matches **exactly
once**, insert one `when` clause before it, `execute`. M8 adds a PRECONDITION that
`hr_rpc_gate` exists at all, which vigour-refill did not have.

**Does any existing bucket or refusal path move? No, and the idiom is why.** Everything
except the inserted clause is carried verbatim from the live body, so no bucket name, no
limit, and no ordering can change — that is the whole difference between this and a
restatement, and a restatement here would silently drop whatever bucket a parallel lane
added. The `else return false` fail-closed terminator is preserved and remains the anchor
for the next patcher. The only behavioural delta is that the string `'party'` now yields
`v_limit := 12` where it previously fell through to `false`. `create or replace function`
preserves the ACL, and the file re-states the revokes anyway.

Two smaller readings, both clean. The skip sentinel `position('''party''' in v_src)` is a
short token, but a false positive needs a literal spelled exactly `'party'` and no bucket
in the chain is — the exactly-once anchor count is the real fence regardless. And the
replacement re-indents the `else` by four spaces, which is cosmetic and is what
vigour-refill already did.

**`live-hash-drift` WILL flag `hr_rpc_gate`, and that is correct.** Its current entry is
`tracked_by: [chain, floor, pin]`, live md5 `dffb74a4…`, `norm_len` 2921, agreeing with
replay, `touched_by` 24 files. After the apply the Coordinator must:

1. run `node tests/live-hash-drift.mjs --codediff` **first** and read the diff. It must be
   **exactly one added line**, `when 'party' then v_limit := 12;`, plus the four-space
   re-indent of `else return false;`. Anything else means something other than this patch
   moved the body, and the apply is not done until that is explained.
2. re-measure with `--live --write`, add `2026-09-23-m8-parties-s1-1-tables.sql` to
   `touched_by`, and write the why as: *"one `when 'party' then v_limit := 12;` clause
   inserted at the case terminator by the same additive `pg_get_functiondef` + exactly-once
   anchor patch `2026-09-22-vigour-refill.sql` §5 used; no existing bucket, no limit and
   not the `else return false` fail-closed terminator moved; verified by `--codediff`
   before the re-measure."* `norm_len` should grow by that clause and nothing else.

Agents never edit that baseline (`CLAUDE.md` §2) and this lane has not.

---

## 4. Guards — real exit codes

Run in this container on `sec/m8-s1-review` after `npm install --no-audit --no-fund`,
with the changes of §1 landed. Every number below is `$?`, branched on, never
`( cmd || echo )`.

| command | exit | last line |
|---|---|---|
| `node tests/schema-drift.mjs` | **0** | `OK — repo rebuilds to the committed fingerprint (8b35cbcef088…)` — the three §4 blocks, including my five new arms, execute in the replay |
| `node tests/party-membership.mjs` | **0** | `party-membership: green — …` |
| `node tests/party-membership.mjs --mutate` | **0** | `--mutate: green — S-13 was flipped …; the APPLY refused it (stage 1) … S13a went RED on its own (stage 2)` |
| `node tests/apply-order-honesty.mjs` | **0** | `35 file(s) carry a measured verdict (35 evidenced-live, 0 evidenced-absent)` |
| `node tests/restore-census.mjs` | **0** | `DURABILITY (measured 2026-08-30): Pro — …` |
| `node tests/world-tick-ledger-meta.mjs` | **0** | `green — the design's parity queries execute …` — re-run AFTER §18-SEC-2 was appended |
| `node tests/guard-hygiene.mjs` | **0** | `PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs` |
| `node tests/ci-shape.mjs` | **0** | `ok — every guard command runs in exactly one job …` (223 commands, 7 jobs) |
| `node tools/lane-done.mjs` | **0** | `lane-done: all green.` |

**Mutation proofs for the five arms I added — each run, each red, each restored.**
A guard that has never been red is not a guard, and four of these five defects were
invisible to a batch that already had two large §4 blocks.

| mutant | guard | exit | what it said |
|---|---|---|---|
| party insert moved back above the sub-block | `schema-drift` | **1** | `GATE(y2): hr_party_create inserts its party row OUTSIDE the sub-block whose rollback is supposed to take it back.` |
| rejoin upsert reverted to a plain insert | `schema-drift` | **1** | `GATE(e3): B2 — rejoining a party this character LEFT answered {"ok": false, "error": "already_in_party"}` |
| expired-card revocation deleted | `schema-drift` | **1** | `GATE(e3): B4 — an EXPIRED card blocked the next invite ({"ok": false, "error": "invite_target_unavailable"})` |
| `members` built from `v_n` again | `schema-drift` | **1** | `GATE(e1): accept answered members=<NULL> and the party holds 2 live member(s).` |
| (S-13's own two-stage mutant, the lane's) | `party-membership --mutate` | **0** | stage 1 refused the apply, stage 2 went red on its own |

**Baselines — are they honest?** Yes, checked by set comparison rather than by reading
the diff.

- `tests/schema-drift.baseline.json` — every delta is this batch's own objects and nothing
  else. relations +3, policies +3, rls +3 (the three tables); indexes +8 (three pkeys, the
  two invariant partial uniques, the roster index, `party_invite_live`, `party_invite_inbox`);
  constraints +15 (4 + 6 + 5); columns +23 (7 + 7 + 9); functions +10, which is exactly
  `hr_party_of/role/level/hunt_live/view/create/invite/accept/leave/kick` — `hr_rpc_gate`
  is replaced, not added. **Nothing hides in it.** The limitation the Coordinator should
  know rather than infer: this baseline records function **signatures**, not bodies, so the
  `hr_rpc_gate` patch is invisible to it. §3 above is the guard that sees it. My changes
  moved no object, and the fingerprint is unchanged at `8b35cbcef088…`.
- `tests/restore-census.baseline.json` — three new entries, all `restore_only`, all
  `wiped_at_cutover: false`, each with a real note AND an expiry: `party` and `party_member`
  both carry *"⚠ RE-CLASSIFY WITH S2 / THIS EXEMPTION EXPIRES WITH S1"*, which is the right
  shape, because a member row becomes what binds a character to a paid window the day
  `party_hunt` lands. `party_invite` argues it will never be value, which is also right —
  the card is an offer, the membership row is the fact. `hr_client_rpc_baseline` `replay`
  81 → 87, six rows, which matches the six grants exactly. **Edited by hand rather than by
  `--write`, deliberately and stated**, so no other table's row count is re-pinned by this
  lane. Correct.
- `tests/schema-apply-order.json` — the three files in the order the preconditions force,
  each carrying `STAGED, NOT APPLIED — REVIEW ONLY`, each naming the one-sitting rule and
  the S-14 window between file 1's grant and file 3's record. `apply-order-honesty` agrees
  with `live-hash-drift.baseline.json` about all 35 measured files. One claim in file 1's
  note was false and is fixed (B6(ii)).
- `tests/ci-shape.baseline.json` + `smoke.yml` — one step, both the base run and
  `--mutate`, which satisfies the proof-with-no-floor rule without a `proof_baseline`
  exemption. `guard-hygiene` and `ci-shape` both green on it.

---

## 5. VERDICT

### **GO-WITH-CHANGES — and the changes are LANDED, on `sec/m8-s1-review`.**

Nothing is waiting on the author. B1, B2, B3, B4, B5, B6 and B11 are on this branch, each
with an executing arm in the migration that carries it, four of them mutation-proved
against the real chain, and the whole gate list above green afterwards. **Merge
`sec/m8-s1-review` and apply the three files from it.** Applying `b46b1d0d` as staged
would ship a verb that tells a party of two it holds `null` members and a membership
model in which leaving a party is irreversible — neither of which any guard in that
commit can see.

B7 through B10 are recorded and block nothing. B-A1 through B-A6 in §18-SEC-2 belong to
the S2, S4 and S5 briefs and block nothing here.

**S1 remains a structural review, not a money one** (§18-SEC.3, Correction 1), and that
sentence must not be read across to S2 and S3, which each need their own GO.

### 5.1 Apply order — `CLAUDE.md` §2, one file per call, Coordinator only, never 00:00–00:10 UTC

The order is forced by the PRECONDITIONS blocks: each file refuses to apply if its
predecessor has not. **All three in ONE sitting** — between file 1's grant of
`hr_party_view` to `authenticated` and file 3's record of it, the nightly
`hr-grant-hygiene` cron RAISES on `unapproved_client_rpcs`, and a detector expected to be
red hides the next real regression.

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s1-1-tables.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s1-2-verbs.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s1-3-client-surface.sql
```

Each file's own §7/§8/§5 block refuses the install if its properties do not hold, so a
clean return IS the post-condition for that file. Do not proceed past a file that raised.

### 5.2 What the read-only post-apply verification agent must read

Read-only. No write, no seed, no probe row — the apply-time blocks already planted and
rolled back everything that needed planting, and §7(z)/§8(z) proved they took it back.

1. **The three tables exist and are EMPTY.** `select count(*) from public.party`,
   `party_member`, `party_invite` — each **0**. A non-zero count means a §7(z) that did
   not hold on production, and that is a P0.
2. **RLS armed, SELECT-only, on all three.** `pg_class.relrowsecurity` true for each, and
   `select count(*) from pg_policies where schemaname='public' and tablename in
   ('party','party_member','party_invite') and cmd <> 'SELECT'` = **0**.
3. **The privilege matrix.** `information_schema.role_table_grants` for the three tables:
   `authenticated` holds **SELECT and nothing else**; `anon`, `PUBLIC` and `service_role`
   hold **nothing at all**. `service_role` is BYPASSRLS — for it this is the only fence.
4. **The function matrix, per role.** `has_function_privilege` false for `anon`,
   `authenticated` and `service_role` on `hr_party_of(uuid,integer)`,
   `hr_party_role(uuid,uuid,integer)`, `hr_party_level(uuid,integer)` and
   `hr_party_hunt_live(uuid)`; true for `authenticated` and false for `anon`/`service_role`
   on `hr_party_view(uuid)` and the five verbs. And **`hr_engine` holds none of the ten** —
   this batch grants the engine nothing, so a grant there means `c_engine_allow` is now
   wrong and tonight's detector raises.
5. **`hr_assert_grant_hygiene(true)` on production**, and read the REPORT, not just the
   absence of a raise: `unapproved_client_rpcs` empty, `ungated_client_rpcs` empty,
   `engine_execute_outside_allowlist` present as a key. Six `hr_party_*` rows in
   `hr_client_rpc_baseline` for `authenticated`, and **zero** rows for `hr_party_of`,
   `hr_party_role`, `hr_party_level`, `hr_party_hunt_live`.
6. **`hr_rpc_gate` admits `party` at 12 and nothing else moved.** Read
   `pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)` and confirm exactly one
   `when 'party' then v_limit := 12;`, the `else return false;` terminator still present
   and still appearing exactly once, and every pre-existing bucket name still there —
   including `hr_vigour_refill` at 6, which applied this morning and is the most recent
   thing the patch could have reverted.
7. **`hr_party_hunt_live(gen_random_uuid())` returns FALSE**, and
   `to_regclass('public.party_hunt')` and `to_regclass('public.party_tick_lease')` are both
   NULL. S1 is membership only; an S2 table on production means something applied out of
   band.
8. **`hr_party_view`'s frozen shape is a code read, not a call** — do not call it as a
   player. `pg_get_functiondef` must build exactly the eight keys `name, combat_level, hp,
   hp_max, recovering_until, share_bp, xp, gold`, and the last three must be NULL literals.

Then, before the client half rides a cut: `live-hash-drift --live --write` with the
`hr_rpc_gate` why of §3, the three apply-order notes flipped from STAGED to APPLIED with
their timestamps, and `restore-census` re-pinned so the three new tables carry measured
row counts (zero) rather than authored ones.

### 5.3 What must NOT happen next

- **No client half ships against `b46b1d0d`'s verb bodies.** The panel would render
  `members: null` and offer a Leave button whose party can never be rejoined.
- **The client must not call `hr_party_view` with `{ get: true }`** (B7), and should not
  poll it at the envelope's cadence (B8).
- **S2's brief must not read the roster predicate out of §18.2.2** (§18-SEC-2 B-A2). That
  paragraph describes a policy the S1 lane measured unbuildable, and §18 is a record, so
  it stays as written and this is where the correction lives.

---

## Coordinator record — applied 2026-09-23 18:33–18:34 UTC, verified read-only 18:36 UTC

Applied from `set/b551` @ 853a3f52 (Security's landed changes merged first), one file per call, one sitting: tables 18:33:03 (5 functions landed), verbs 18:34:20 (6 functions), client-surface 18:34:31 (no function; the baseline rows). Every call returned `apply result: []`.

| §5.2 read | Result |
|---|---|
| 1 tables empty | party 0 / party_member 0 / party_invite 0 |
| 2 RLS | `relrowsecurity` true on all three; 3 policies, 0 non-SELECT. (`relforcerowsecurity` false on all three — the owner is `postgres`, which the SECURITY DEFINER verbs run as; recorded, not a finding under §5.2.) |
| 3 table privileges | `authenticated`: SELECT only; `anon`, PUBLIC, `service_role`: none; owner `postgres` all |
| 4 function matrix | hr_party_of / hr_party_role / hr_party_level / hr_party_hunt_live: EXECUTE false for anon, authenticated, service_role, hr_engine; hr_party_view and the five verbs: true for authenticated only, hr_engine none |
| 5 grant hygiene | `hr_assert_grant_hygiene(true)`: unapproved_client_rpcs [], ungated_client_rpcs [], engine_execute_outside_allowlist [] (key present); hr_client_rpc_baseline carries exactly six `hr_party*` rows for authenticated (five verbs + hr_party_view), none for the four predicates |
| 6 hr_rpc_gate | exactly one `when 'party' then v_limit := 12;`, exactly one `else return false;`, `hr_vigour_refill` 6 intact, 14 buckets |
| 7 S2 absent | hr_party_hunt_live(random uuid) = false; party_hunt and party_tick_lease both NULL |
| 8 frozen shape | code read: name, combat_level, hp, hp_max, recovering_until, then S2's three as NULL literals |

Records: `live-hash-drift --live --write` re-measured — hr_rpc_gate live == replay e282db6e (the §3 body change, now the deploy record); the three apply-order notes flipped to APPLIED with timestamps; restore-census re-pinned (see commit). §5.3 stands: no client half yet; the panel is a later lane and must not call hr_party_view with `{get:true}` nor poll it at envelope cadence.

---

## S3 — the split (2026-09-23)

Reviewed on `sec/m8-s3-split` off `origin/set/b553` (which carries
`lane/m8-parties-s3-split` merged): `src/core/party-split.js`, its export in
`src/core/index.js`, `tests/party-split.mjs`, the `smoke.yml` step and the
`ci-shape` baseline line. Graded against §18.1 rev.2, §18.2 rev.2 (§18.2.1a,
§18.2.6), §18.5's S3 cell, and S-5, S-6, S-10, B-A5 and §18-SEC-2.3's S3 brief.

**The arithmetic is right.** I read the code rather than the test for the two
rulings that matter, and both hold literally: the XP floor never touches
`dmg_bp`, and `dmg_bp` is what gold, the lottery weight and the pre-multiplier
gold vector are all apportioned from. The three disjoint sets in `xpWeights`
(parked / lifted / above) are §18.1's three sentences, computed over a common
denominator `Q = 2nD` so nothing rounds until `apportion`, and both vectors sum
to 10,000 bp *structurally* — `apportion` conserves whatever its weights are,
so (P-b) does not depend on a proof in a comment. The lane's decision to route
all four integer vectors through that one function is what made half the
mutation proof possible.

**What I found was in the GUARD, not in the arithmetic — with one exception.**
All nine findings are landed on this branch and re-proved. Eight new mutants
(M11–M18) join the lane's ten; all eighteen are RED on their own named property.

| # | Finding | Sev | Status |
|---|---|---|---|
| C1 | A non-finite `damage` **aborts the whole party settle**: `BigInt(Infinity)` raises, and a raise is not one of §18.2.5a's three refusals, so the window neither pays nor refuses for any of the four members. NaN, a string, a negative and `undefined` all already floored to 0; a non-finite number was the one hole. | P1 | **LANDED** — module: `Number.isFinite(d) && d > 0 ? d : 0`, plus the hostile-damage corpus |
| C2 | **The payout remainder recipient was unguarded.** `partyPayout` could send every window's spare gold and xp to index 0 and the battery stayed green — because all 414 corpus windows listed members `U(1)…U(n)` ascending, so `lowest` was index 0 in every one and `apportion(…, 0)` and `apportion(…, lowest)` were the same call. S-REM pinned `split.lowest`; nothing pinned where the money landed. This is S-6's rule at the only place it moves money. | P1 | **LANDED** — user ids permuted in the generator, per-member oracle on both pre-multiplier vectors, the `0 ≤ rem < n` bound asserted, mutant M13 |
| C3 | **The fellowship line was asserted against itself**: `expectFellow = fellowshipBp(eligible)` read the module's own function on both sides of the equals sign, so any `FELLOWSHIP_STEP_BP` or `FELLOWSHIP_MAX_BP` was green. And the cap does no work at `PARTY_MAX = 4` — three steps of 500 *is* 1500 — so it was unreachable as well as unpinned. §18.4 T-8 ("four boxed alts strictly worse than four solo hunts") rests on this number. | P1 | **LANDED** — §18.1's literals `[0,0,500,1000,1500]` pinned in the test, the ceiling asserted at k = 4, 5, 9 where it actually binds, mutant M11 |
| C4 | **A float in the bp VECTORS was red on `<threw>`, not on S-INT.** `partyPayout` does `BigInt(m.dmg_bp)`, which raises on a float, so the battery died before its verdict — and the driver rightly refuses to score a throw as a named property. The one mutant S-INT exists to catch would have been recorded as a failure of the mutation proof. (M7 mutated only the *reported* floor line, which raises nothing.) | P1 | **LANDED** — S-INT short-circuits in the loop and before the worked example, mutant M16 |
| C5 | A **negative damage mints a >100% share** — `[-5000, +10000]` apportions to `[-10000, +20000]`, both vectors still summing to 10,000, so (P-b) does not see it. The clamp was present and correct; nothing proved it was load-bearing. | P1 | **LANDED** — `dmg_bp`, `xp_bp` and `lottery_bp` asserted inside `[0, BP]`, mutant M15 |
| C6 | **"Derived and not retyped" was unguarded.** §18.1 makes the derivation a design property ("Tyler may set it to 0.00 in one edit"), but `return 2500` and `Math.round(VIGOUR_DRY_MULT * BP)` are the same *number* today, so every value check accepts the retyping. A claim about the source needs an assertion about the source. | P2 | **LANDED** — the graded module's text is carried and the import + `dryMultBp` body are shape-checked, plus a value check against `VIGOUR_DRY_MULT` imported straight from `hunt.js`, mutant M12 |
| C7 | **The SLOT half of the `(user_id, slot)` tie-break was never exercised.** The corpus comment claimed it, but every case planted distinct users, so only the user half ran — and one player on two slots in one party is not hypothetical, it is exactly the boxed-alt party T-8 prices. M3 flipped both halves and was caught by the user half alone. | P2 | **LANDED** — two same-user corpus parties, slot-only mutant M14 |
| C8 | **The seed seam was unpinned.** S-JOURNAL compared the journalled roll to `split.roll` — both the module's — so the roll could be re-derived inside the split and stay deterministic, replayable and green, while §18.4 T-1's "the whole distribution is replayable" quietly became "replayable to a different bag". | P2 | **LANDED** — `split.roll` asserted equal to the caller's roll, mutant M17 |
| C9 | **The 1..4 roster refusal was unproven.** A five-member split conserves perfectly (`apportion` is structural), so nothing downstream would ever notice one. | P2 | **LANDED** — 0, 5 and 8 members asserted to raise `RangeError`, 1–4 to succeed, mutant M18 |

### Rulings the brief asked for, where no change was owed

- **The floor is XP-ONLY (S-5): CONFIRMED, from the code.** `dmgBp` is
  `apportion(BP, dmg, lowest)` and nothing else reads `xpWeights`;
  `lottery_bp` is `dmgBp[i]`; `preGold` is apportioned from `dmg_bp`; the
  fellowship bonus is added to XP only. M1, M2 and M15 hold the three doors,
  and C3's gold equality (`paid.gold === produced.gold − dryLost.gold`) is what
  refuses a fellowship bonus leaking onto gold.
- **(P-c): the code is right and my own brief's wording was wrong.** The brief
  said "the freed bp is redistributed … checkable as an equality". §18.2.6 and
  S-10(c) say the opposite and the module follows them: the dry reduction is
  **not** redistributed, the sum over members is strictly less than the party
  total, and that is exactly why (P-c) is an inequality with an exact equality
  underneath. `partyPayout` names `preMultiplier`, `fellowship`, `dryLost` and
  `paid` separately, so both statements are one line each in the guard. No
  change.
- **S-6's remainder, rev.2 — the lane's reading is CORRECT and my sentence was
  not.** S-6 and §18.1 both say "the LOWEST `(user_id, slot)` **among the
  tied-largest shares**". Read literally that clause is self-defeating: with one
  unique largest share — the ordinary case — it hands the remainder back to the
  biggest hitter, who in ordinary play is the same member choosing the settle
  boundaries, which is the rule S-6 replaced. The operative clause is the one
  next to it, *"nobody can position themselves to collect it"*, and
  unconditional-lowest is the only reading under which that is true, because a
  member chooses their damage and cannot choose their user id or slot. **The
  rule is the unconditional lowest `(user_id, slot)`**; the "tied-largest"
  filter is struck. The lane owed me this reading and stated it in the header
  rather than taking it quietly, which is how it should have arrived.
- **The journal object (B-A5): CONFIRMED** — exactly `{id, hunt, dmg_bp, xp_bp,
  floor, fellow_bp, roll}`, frozen, asserted as an equality both ways, with M5
  proving an eighth key red and the thirteenth-top-level-key check carried
  locally against a copy of `META_KEYS`. `floor` as the signed `xp_bp − dmg_bp`
  is the right call: Σ is exactly 0, so every basis point a floored member
  gained is named against the member it came from, which is what (P-c) has to
  read. The **twelve-key allowlist widening itself is still S2's** and its
  thirteenth-key mutant is still owed there.
- **Determinism and edge importability: CONFIRMED, and packed rather than
  asserted.** No `Date.now`, no `Math.random`, no browser global, no float in
  any output, the lottery roll an input, BigInt over exact common denominators
  throughout. `party-split.js` is not in today's bundle because nothing imports
  it yet, so I planted an import in `supabase/functions/hr-accrue/tick.js`,
  packed, and confirmed it vendors as `vendor/core/party-split.js` with
  `./hunt.js?v=552` correctly stripped to `./hunt.js` — 81 files, exit 0 — then
  restored the file. S2's import will work.
- **§18.5's read-back assertion: the lane's placement SATISFIES it; S2 need not
  carry a duplicate.** §18.5 asks for the vectors to read back out of
  `hr_tick_shadow.party`; that column is S2's and §18-SEC-2.3 rules S3 may run
  in parallel with S2, so an assertion S3 cannot execute without S2 would make
  the parallelism I granted impossible. §18.2.1a establishes the column as the
  *denormalisation* of `delta->'journal'->'meta'->'party'` and §18.2.5 step 7
  stores that delta verbatim — so the arm asserts against the **authoritative**
  copy, which is stronger, not weaker. The arm detects the column, grades both
  forms the day it exists and prints which it graded; I verified that branch by
  adding the column to the PGlite chain myself and watching it grade "via
  delta->'journal'->'meta'->'party' **and the party column**". Both vectors at
  10,000 bp on a planted four-member window, every row rolled back, table empty
  after.

### Recorded, not owed

- **The remainder lever is not fully closed, and its size is now guarded.**
  Lowest-`(user_id, slot)` is positionable, just expensively: v4 user ids are
  random, so an actor can mint accounts until one sorts low and then collect
  every remainder of every party they join. The quantum is bounded by
  `apportion` at **strictly less than n units per call** — ≤3 gold and ≤3 xp per
  settle — and that bound is now an assertion rather than an argument. Against
  the largest-share rule, which hands the same quantum to the member who also
  chooses the boundary, this is strictly better. No change; priced.
- `totalDamage` and `member.damage` narrow through `Number()` above 2^53. The
  bp arithmetic is BigInt end to end and the journal carries `dmg_bp`, not
  `damage`, so this is a reporting artefact, not a share.
- `FELLOWSHIP_MAX_BP` is non-binding at `PARTY_MAX = 4` (C3). It is kept, and
  now asserted where it binds, so raising the roster cap cannot silently raise
  the bonus.
- `assignDrop` returns index 0 rather than `lowest` on an all-zero weight
  vector. Unreachable — `dmg_bp` always sums to 10,000 — and left alone.

### Guards — real exit codes, on `sec/m8-s3-split`

| Command | Exit |
|---|---|
| `node tests/party-split.mjs` | **0** — 425 windows; S-SUM, S-FLOOR, S-RAW, S-PARK, S-DRY, S-JOURNAL, S-DET, S-REM, S-LOTTO, S-INT, S-SQL, S-SQL-ROLLBACK all ✓ |
| `node tests/party-split.mjs --mutate` | **0** — 18/18 mutants RED on their own named property |
| `bash ./bump-version.sh --check` | **0** — build-info 552, index.html and every ESM import agree; no `?v=` bumped |
| `node tests/dead-exports.mjs` | **0** — 1561 exported names, 0 unreachable |
| `node tools/pack-edge.mjs hr-accrue --hash` | **0** — `c8edbc99188fbaafb508a34d793ac7ae0f10847db969d22d64f33facbcd8f8c1` (unchanged; nothing imports the split yet) |
| `node tests/guard-hygiene.mjs` | **0** — no orphans, no ghosts, no vacuous proofs |
| `node tests/ci-shape.mjs` | **0** — 225 guard commands, 225 distinct, 7 jobs |
| `node tools/lane-done.mjs` | **0** — all 24 steps green |

## S3 VERDICT

### **GO-WITH-CHANGES — and the changes are LANDED, on `sec/m8-s3-split`.**

**S2 may import the split.** The arithmetic was sound on arrival; nine findings
were in what proved it, and one — C1 — was a raise that would have taken the
whole settle down. All nine are fixed and re-proved on this branch, and the
mutation proof is eighteen arms, each red on the property that owns it.

Two conditions carried forward, both S2's:

1. **When `hr_tick_shadow.party` lands, S2's guard must assert the column and
   `delta->'journal'->'meta'->'party'` carry the same object.** The column is a
   denormalisation; a denormalisation that can drift makes §18.2.6's 24 h parity
   read a report about itself. S3's arm starts grading both forms automatically
   the day the column exists — that is the detector, not the equality.
2. **B-A5's twelfth/thirteenth-key work is still S2's**, unchanged: widening
   `META_KEYS` by exactly one and proving a thirteenth still red. S3 carries a
   local copy of the allowlist on purpose; if the two ever disagree that is a
   finding for S2's guard.

This verdict covers the split only. S4 lands after it (§18-SEC.3, Correction 2),
and S5 remains NOT briefable on its own pre-arm bar.

---

## S2 — the roster unit in shadow (2026-09-23)

**Reviewer:** security-engineer (veto) · **Under review:** `lane/m8-parties-s2` @ `84ff4012`
("the party is a roster unit, in shadow") · **Review branch:** `sec/m8-s2-review`, with
`origin/set/b553` merged first (clean, no conflict hunks — the lane branched before S3's
merge landed). Graded against §18.2.1–§18.2.6, §18-SEC.3's S2 self-check list,
§18-SEC-2.3's S2 brief (B-A2, B-A3, B-A5), and `SEC_WORLD_TICK_M3_2026-09-22.md`
RE-VERIFY 5.

**This is a MONEY-SURFACE review** (§18-SEC.3, Correction 1). S1's "structural review"
sentence does not read across, and the lane did not try to make it: the armed branch is
written in full and I reviewed it in full, because the only thing between this file and
money moving is an operator `update hr_tick_config set shadow = false`.

**No production reads and no production writes were made. No database credential was
sought or used.** Every measurement below ran against the repo's own PGlite chain replay
in this container.

Three conclusions up front. **The fence is right and I could not break it** — every
attack the brief names is refused, executed, below in §4. **The three defects I found
are all in what PROVES the batch rather than in what it does**, which is the same
pattern as S3: the arm the whole of S-9 rests on had never been red, two of three
live-hash entries were unnamed, and a bound was declared in a place it did not hold.
**And one thing is not a defect but is the most important sentence in this document:
the split is journalled and never applied**, so the 48 h evidence S5's GO rests on does
not yet measure a party payout. That is shadow-safe, it is the right slice boundary, and
it is now a standing guard rather than a thing to be discovered.

---

## 1. Findings

**LANDED** means the change is on `sec/m8-s2-review` and re-proved. **RECORDED** means
it is a note for a later brief and blocks nothing.

| # | Sev | Finding | Status |
|---|---|---|---|
| **D1** | **P2** | The two carrier bounds **do not compose**: four members each UNDER the per-member ceiling assemble past the table CHECK, and the settle raises `23514` where the design requires a countable name | **LANDED** |
| **D2** | **P2** | `--mutate memberPaid` does not prove what it is named for. The ARMED fan-out's savepoint — the whole of S-9 — had **no mutant at all** | **LANDED** |
| **D3** | **P2** | `live-hash-drift` goes red on **three** entries; the lane named **one**, and two files claim "no tracked body moves in THIS file", measured FALSE | **LANDED** |
| **D4** | **P2** | The apply-order notes say nothing about the **edge** order, and reversed it is a **total play outage** — every `accrue`, `set_activity` and `equip` in the game refused, for every player | **LANDED** |
| **D5** | P3 | `(a)`'s DML probes drive `authenticated` only; a stray privilege on `anon`, `PUBLIC`, `service_role`, `hr_engine` or `hr_tick` passes untouched (S1's B11 at S2's tables) | **LANDED** |
| **D6** | **I** | **The split is journalled and NEVER APPLIED.** `partyPayout` is not wired, so the shadow measures four solo settles with attribution stapled on: nothing is apportioned, no fellowship bonus, no `VIGOUR_DRY_MULT` reduction — and §18.5's S2 cell asks for (P-c), which is therefore not assertable | **LANDED as a guard**; the ruling is in §2 |
| **D7** | I | `META_KEYS` is still **eleven** in `tests/accrual-engine.mjs` and **twelve** in `tests/party-split.mjs`. B-A5's flat half is unlanded and the two copies disagree — which S3's review named in advance as "a finding for S2's guard" | **RECORDED** |
| **D8** | I | `party_hunt` has `enable row level security`; `party_tick_lease` also has `force`. Asymmetric, and neither is a hole while every path is a `postgres`-owned definer function | **RECORDED** |
| **D9** | I | `hr_party_roster` counts `member_count` from `party_member` and builds `members` through a join to `player_state`; a member with no state row makes the two disagree. Fails safe — the settle's (6) refuses the short set | **RECORDED** |

### D1 — the per-member carrier bound and the table CHECK do not compose **[P2, LANDED]**

`hr_party_tick_settle` refuses a carrier over `c_state_max = 16384` octets **per member**,
by name, at (2b). `party_tick_lease_shadow_state_ck` bounded the **whole object** at
65 536 — "four times the ceiling", says the comment. It is not four times the ceiling,
because the object is not the concatenation of four member states: it is a jsonb object
that also carries four `"<uuid>:<slot>": ` keys and its own separators.

**Measured, not argued.** Four members each at 16 379 octets — every one of them
individually accepted by (2b):

```
per-member carrier octets: [ 16379, 16379, 16379, 16379 ] (bound 16384) — each is UNDER
RESULT: the settle RAISED rather than returning a named refusal:
  sqlstate : 23514
  message  : new row for relation "party_tick_lease" violates check constraint
             "party_tick_lease_shadow_state_ck"
```

That is **exactly the failure the named refusal exists to replace** — RE-VERIFY 5's
design 6, and this file's own header: *"so the refusal has a countable NAME rather than
aborting the batch on a check_violation."* Worse than the name: the raise lands **after
all four `hr_tick_shadow` rows are inserted**, so the whole statement aborts, and the
next fire re-proposes the same carrier and aborts again — that party's shadow chain
wedges silently and for ever, visible only as a `party_error:` reason count.

Reachable? Not on today's fixtures — `shadowStateOf` caps at 32 xp / 64 item / 16
bestiary keys, a few KiB in practice. It is P2 because **a bound that does not hold
where it says it holds is RE-VERIFY 5's own S-4 finding at party grain**, and because
the failure mode is silent.

**Landed three ways.** The CHECK is now `c_max_members * c_state_max + 1024` = **66 560**,
a derivation rather than a round number, with the 176 octets of structure named. File 2's
new **§5(f2)** re-derives all three numbers out of the INSTALLED catalogue — the settle's
own two constants out of its `prosrc`, the ceiling out of `pg_get_constraintdef` — and
**refuses the install** if they stop composing, so the day `PARTY_MAX` or either bound
moves the other must move with it. And `tests/party-settle.mjs` arm **C3** executes the
worst case: four members at exactly the per-member ceiling now assemble to **65 712
octets and the settle ANSWERS**. Mutation-proved — `--mutate carrierBoundsDontCompose`
reverts the CHECK to 65 536 and the apply fails with
`GATE(f2): the carrier bounds DO NOT COMPOSE. 4 members x 16384 octets = 65536, and
party_tick_lease_shadow_state_ck admits only 65536 …`.

### D2 — the arm the whole of S-9 rests on had never been red **[P2, LANDED]**

The brief asked for two mutants: `when others` RED, and **a member paid while another
failed** RED. The lane has the first. It named the second `memberPaid` — and that mutant
disables the **member-set re-count at (6)** and is caught by `GATE(d)` at apply time. It
is a real proof of a real property. It is not this one. **Nothing in the batch mutated
the armed fan-out's savepoint**, and nothing could: §5 never executes the armed branch,
so `GATE(k)` reads the handler's *text* — `HR826` present, `when others` absent,
`member_unpayable:` present, `hr_apply(` present — and a body read cannot tell you
whether plpgsql's sub-block rollback actually takes a member's `hr_apply` write back.

`U1..U4` asserted that it does and had been green every time they ran, which under
`CLAUDE.md` §4 means they were not guards.

**Landed.** `memberPaid` is renamed **`partialMemberSet`**, which is what it proves. A
new **stage 2** boots a second replay under **`fanOutNotRolledBack`** — it replaces the
`raise … HR826` with `continue`, leaving every static term `GATE(k)` reads in place, so
**the batch installs** and only an executing arm can catch it. It is caught:

```
✓ M2-installs — the mutant INSTALLS — every static term §5(k) reads is still there
✓ M2-fanOutNotRolledBack — U2 goes RED on it — the fan-out paid 6 ledger row(s) while
  one member could not be paid, and the party watermark ADVANCED over a window that
  member was never paid for. That is step 5's mint, and U2 is what refuses it
```

Six mutants now, five refused by the apply and one that has to be run to be found.

### D3 — live-hash goes red on three, and two files say it does not **[P2, LANDED]**

Measured credential-free on this branch, `node tests/live-hash-drift.mjs` exits **1**
with **three** problems. The lane's commit message and both apply-order notes report
one — and files 1 and 2's notes each say *"no tracked body moves in THIS file"*, which is
false in the same sentence that matters.

1. **`untracked hr_tick_roster`** — NEW, **and caused by this batch**. §5b patches the
   body with the `pg_get_functiondef` + exactly-once-anchor idiom, and a *programmatic
   patch* is one of the three disjuncts the sweep derives tracking from. RE-VERIFY 5
   item 11 says in as many words that `hr_tick_roster` is *"not touched and not
   tracked"*; this file touches it. **That is a good outcome** — file 1's own header
   argues at length that an untracked `hr_tick_roster` is a hazard — and the note should
   claim it rather than deny it.
2. **`untracked hr_party_hunt_live`** — NEW, also this batch: S1's three files plus §5a
   here is the third migration to restate it, which crosses the 3+ threshold.
3. **`replay hr_assert_grant_hygiene`** — file 3's chain link 14. The one the lane named.

This is RE-VERIFY 5's S-6 verbatim: *"a note that named ONE entry against a guard that
wants four is how a re-seed ends up with three unexplained rows."* Here it named one
against three, and two of the three are for bodies **nobody has ever written a belief
about**.

**Landed.** All three are named in all three apply-order notes with the exact why the
Coordinator records, and the two false sentences are explicitly superseded there; file
1's header carries the same block. `apply-order-honesty` green afterwards. I did not
touch `tests/live-hash-drift.baseline.json` (`CLAUDE.md` §2) and neither did the lane.

### D4 — the edge deployed first is a total PLAY outage **[P2, LANDED]**

`party-fence.js` runs `select public.hr_partied($1::uuid, $2::int)` at the intent door for
`accrue` and every `collectsFirst` verb, and **fails closed on its own error**. That is
the right direction — a false refusal costs a retry, a false pass re-prices a window three
other players are paid from — and it is precisely what makes the reversed order
expensive. Driven against the pre-S2 head, where `hr_partied` does not exist, the **real
fence bytes**:

```
hr_partied present in the pre-S2 database: NO
  accrue        -> 409 party_settle_required
  set_activity  -> 409 party_settle_required
  equip         -> 409 party_settle_required
  eat           -> allowed          (collectsFirst: false)
  shop_buy      -> allowed
  market_list   -> allowed
```

**Every player in the game**, including the ~90 s attended cadence and the
return-from-away claim. This is the **opposite direction** from RE-VERIFY 5's ordering
constraint, where the reversed order stalled the *measurement* — so it must not be
inherited by analogy, and nothing in the batch wrote it down.

Forward, the interim is inert: `hr_partied` exists, `party_hunt` is empty, the predicate
answers false, the fence passes; nothing posts `body.parties`, so `hr_party_roster`
returns no row and a fire behaves exactly as it does today.

**Landed** in file 1's header, in `party-fence.js`'s header, in all three apply-order
notes — and as arms **O1/O2**, which execute both readings rather than asserting them.
O2 is what stops O1 grading a fence that refuses always.

### D5 — the DML probe is one role wide **[P3, LANDED]**

§7(a) drives six INSERT/UPDATE/DELETE probes as `authenticated` and requires 42501 each,
which is the right shape and is the clan lesson executed. It is also the only role it
asks about. A stray SELECT left on `service_role` — BYPASSRLS, for which the revoke is
the only fence — would pass it, as would anything on `anon`, `PUBLIC`, `hr_engine` or
`hr_tick`. That is S1's B11 exactly, one slice later and on tables that gate a paid
window.

**Landed** as **§7(a3)**, which asserts the RESULT rather than the revoke list: every
`role_table_grants` row on the two tables other than `authenticated`'s SELECT on
`party_hunt` raises. A role nobody thought to name is caught too.

### D6 — the split is journalled and never applied **[INFORMATIONAL, and it is the sentence that matters]**

`settleParty` calls `splitParty` and `partyJournal`. It does **not** call `partyPayout`.
The delta the fence stores is `Object.assign({}, a.p_delta)` with only `journal` replaced —
so it is the member's **own solo settle output** with attribution stapled on. Executed,
with contributions deliberately 1×/2×/3×/4×:

```
✓ E8 — dmg_bp is 1000/2000/3000/4000 and every member's delta.gold is still 3
```

Nothing is apportioned by the vectors, no fellowship bonus is added, and no
`VIGOUR_DRY_MULT` reduction is taken. **This is not a defect and I am not asking for it
in S2.** It is the safe direction (shadow pays nothing, and paying nothing is the
strongest state available), it is the right slice boundary (apportioning is driver
arithmetic that lands with S3's damage counter and touches no migration), and the lane
had already named the *other* half of the same seam honestly — `memberContribution`
falls back to `survivedMs` because S3's per-member damage counter has not landed, and
arm E6 says so out loud.

**What it costs is the measurement, and that is what S5's GO is granted on.** §18.5's S2
Guards cell asks for **(P-c)** — *"paid ≤ produced + fellowship, and Σ pre-multiplier
member share = produced exactly"* — and (P-c) has no content until a payout exists.
(P-a) degenerate parity is likewise not asserted; arm S4 asserts its *precondition* (the
stored delta carries no party key at any level), not the byte comparison against a solo
run. So **two of the three properties §18.5 asks S2's guard for are not yet assertable,
and the third is true of the vectors alone.**

**Landed as a self-invalidating guard.** Arm **E8** pins the gap and goes RED the day the
payout is wired, with the failure message telling that reader that (P-c) is now
assertable, must be asserted, and that the evidence before that deploy measures a
different quantity and cannot be folded in. See §3 for the partition rule.

### Recorded, not owed

- **D7 — B-A5's flat half is unlanded and the two copies disagree.** `META_KEYS` is
  eleven in `tests/accrual-engine.mjs:3520` and does not contain `party`;
  `META_KEYS_12` in `tests/party-split.mjs:262` is twelve and does. S3's review said in
  advance: *"S3 carries a local copy of the allowlist on purpose; if the two ever
  disagree that is a finding for S2's guard."* They disagree and S2's guard does not see
  it. **It is not a hole today** — nothing grades a party `meta` with the eleven-key
  list, and the bound B-A5 actually cared about (the nested key set as an equality) IS
  landed, executed at (2d) and mutation-proved. I deliberately did **not** widen
  `META_KEYS`: widening an allowlist that nothing on this path consults is a loosening
  that buys nothing (`CLAUDE.md` §2). **The reconciliation is owed by whichever slice
  first grades a party delta through `metaProblems()`** — and the honest form is for
  `party-split.mjs` to derive its list from the real one plus `party`, not to retype it.
- **D8 — `party_tick_lease` is RLS `force`d and `party_hunt` is not.** Neither matters
  while every path is a `postgres`-owned `SECURITY DEFINER` function and `force` only
  binds the owner; the S1 Coordinator record already recorded the same asymmetry across
  the three S1 tables. Left alone, named so the next reader does not re-derive it.
- **D9 — `member_count` and `members` can disagree.** `member_count` counts
  `party_member`; `members` is a `jsonb_agg` over a join to `player_state`. A member with
  no state row is counted and not nested. Fails safe in both directions: all missing →
  `members` is NULL → `parsePartyUnit` drops the unit; some missing → the driver proposes
  a short set → (6) refuses `party_window_already_settled`. No mint, no silent loss.
- **Invariant 5 is not implemented in S2, and that is correct.** A leave or kick during a
  live hunt does not settle the open window — those verbs are S1's and S4 owns
  kick-before-split. The shape it degrades to is safe and is worth stating: the departing
  member becomes unpartied, `hr_partied` goes false, and the **per-character** roster
  serves them from their own `player_state.accrued_to` — which invariant 8 has kept equal
  to the party watermark — so the interval is paid once, by one path, and none is lost.
- **S-6's 8-boundary budget is not S2's and S2 does not open a door to it.**
  `party_settle_churn` appears nowhere in the repo; per B-A1 and §18.5 it is S4's, with
  the `party_hunt_start`/`party_hunt_stop` ruling B-A1 still owes. S2 adds no
  membership-forced settle boundary.
- **`tools/derive-grant-hygiene.mjs` — asked with suspicion, and the answer is no.** It
  does **not** derive an allowlist that should be argued. Link 14's two entries are
  hand-written literal text in `PATCHES[party_settle]`, each carrying its own argument,
  reproduced verbatim into the migration; what is *derived* is the rest of the detector
  body, out of link 13's committed base, which is the point (a `create or replace` on the
  detector typed from memory could silently delete check (5) and every self-check would
  still pass). File 3's §1 additionally fails CLOSED if the installed detector does not
  already carry link 13's ten-argument `hr_tick_settle` entry. `--check` green:
  *"derivation in sync (14 links, 15 patches)"*.
- **`ci-shape` is nondeterministic under load and fails CLOSED.** It exited 1 with 95
  false problems on the first run of the sweep and 0 on three consecutive re-runs on a
  quiet machine. That is RE-VERIFY 5's S-8, unchanged and still not this lane's:
  `run-ci-local.mjs --list` truncates its stdout on `process.exit(0)` through a pipe.
  A false RED, never a false green.

---

## 2. What I attacked, and could not break

Each of these is an attack the brief named. Every one was **executed** against the chain
replay, and every one was refused.

| attack | answer |
|---|---|
| **Read another party's hunt** as `authenticated` | a live member of party 1 sees **1** row; a member of party 2 sees **0** — zero, not an error, which is the only reading that distinguishes a working policy from 42P17 or 42501. `party_tick_lease` answers **42501** to `authenticated`: RLS armed, **no policy at all**, and the privilege revoked, so the read is refused by ABSENCE |
| **A second holder settles a leased party** | `no_lease`, naming the real holder and its expiry |
| **Forge a mark ahead of a member's** — a window starting 45 minutes before the watermark | `party_window_already_settled`, carrying the true mark. The CAS is the party's, computed once under the party lock from rows no caller can read |
| **Cross-party attribution** — `journal.meta.party.id` naming the other party | `bad_party_meta`, *"names a different party than the call does"* |
| **Settle a party with no lease row** | `not_tick_owned` |
| **Reach `hr_apply` from the shadow branch** | ledger **6 → 6** across an honest two-member shadow settle; and there is no `hr_apply` call site on that branch to reach |
| **Make a member settle twice** — `[A, A]` against a live `{A, B}` | refused. The counts match and the sets do not; the **DISTINCT match count** is the third term of (6)'s predicate and is what refuses it |
| **Pay a member whose `hr_apply` refused** | refused, **and now mutation-proved** (D2). U1–U4 execute it: the fan-out's savepoint rolls every member's write back, the watermark holds, the hunt ends `member_unpayable:<user>` |
| **Overflow the carrier** | three names per member (`bad_shadow_state`, `shadow_state_too_large`, `shadow_state_while_armed`), 16 KiB in OCTETS — and, after D1, the assembled object too |
| **Arm parties through a side door before M4** (ordering constraint 2) | nothing in the batch writes `hr_tick_config`. §5(z) asserts `shadow` is still TRUE after the apply rather than trusting the rollback — RE-VERIFY 5's S-5, honoured. `body.parties` is posted by nobody, and `hr_party_hunt_start` is S4's, so there is no live `party_hunt` for the roster to return |
| **Arm through the carrier** | a carrier on an armed settle is refused **before the lock, before the lease** and a very long way before `hr_apply`, and the armed branch clears the mark and the carrier in one statement |

**And on the things that are right, recorded so the next reviewer does not re-litigate
them.** The identity seam refuses `hr_tick` **by name** inside the settle, so the
selector cannot become the settler, and §5(a)/(b) assert that for all five roles **and**
call it as each forbidden one. The delta vocabulary is proved a **subset of `hr_apply`'s
own `c_delta_keys`, parsed out of its installed body** — which is the right way to write
S-1, because in shadow the settle returns before `hr_apply` ever sees the object and
nothing else would notice a payload the database cannot accept. B-A3 is honoured
properly: `HR826` and nothing else, so a deadlock or a bug in the split is loud instead
of naming an innocent player. The CAS refusal doubling as the driver's only probe is the
right call and the reason is stated rather than discovered — `party_tick_lease` is
readable by nobody and `hr_party_roster` is `hr_tick`'s, so the alternative is the
watermark travelling in a POST body. And `parsePartyUnit` **parses `accrued_to` only to
drop a malformed row and throws the value away**, which arm E3 proves by feeding it a lie.

---

## 3. The partition rule for the party shadow's parity read

RE-VERIFY 5 established the shape: a shadow clock restarts at the **deploy**, not the
apply, and the two halves of the table are partitioned. The party shadow needs the same
rule and needs it **twice more**, because of D6.

1. **The party clock starts at the hr-accrue deploy that carries `tick-party.js`**, not
   at the migration apply. Read §18.2.6's grouped query with
   `window_from >= <deploy instant>`; `party is not null` already partitions party rows
   from solo ones, so no second predicate is needed for that.
2. **Until `body.parties` is posted, the partition is empty and that is correct, not a
   failure.** `hr_tick_cron_run` builds its POST from `hr_tick_roster` alone and
   `hr_party_hunt_start` is S4's. A zero row count here means the cohort is not wired
   yet — it does not mean the shadow is refusing. Read the `party_error:` and
   `no_party_hunt` reason counts before concluding anything from a zero.
3. **RE-CUT THE PARTITION AT EACH OF THE TWO REMAINING SEAMS, and do not fold across
   them.** Rows written before each deploy measure a different quantity:
   - **the engine's per-member `damage` counter (S3's other half).** Until it lands,
     `memberContribution` weights by `survivedMs` — fight time, not damage — so `dmg_bp`
     and `xp_bp` are not the vectors an armed window would pay. (P-b) holds either way;
     the SPLIT half of the parity read does not. Arm E6 reports which branch was taken.
   - **`partyPayout` being applied (D6).** Until it lands, `delta.gold` and `delta.xp`
     are each member's SOLO settle, so `sum(would_gold)` over a party window is four solo
     streams, not a pot apportioned by `dmg_bp`, and neither the fellowship bonus nor the
     `VIGOUR_DRY_MULT` reduction exists to be measured. **(P-c) is not assertable before
     this**, and §18.5's S2 Guards cell asks for it. Arm E8 goes RED on that deploy.

   **S5's 48 h pre-arm clock therefore starts at the LATER of those two deploys, not at
   this one.** A 48 h window that straddles either seam is two measurements of two
   different things with one number on it, which is §16.3's recorded failure.
4. **(P-a) degenerate parity still has to be built.** Arm S4 asserts the stored delta
   carries no party key at any level — the *precondition* for the byte comparison, not
   the comparison. The one-member party §18.5's S5 bar requires is what makes it
   possible; the arm belongs with the payout, since before it the comparison is trivially
   true.

---

## 4. Guards — real exit codes

Run on `sec/m8-s2-review` after `npm install --no-audit --no-fund`, with every change of
§1 landed. Every number is `$?`, branched on, never `( cmd || echo )`.

| command | exit | last line |
|---|---|---|
| `node tests/schema-drift.mjs` | **0** | `OK — repo rebuilds to the committed fingerprint (a6e559b275a3…)` — the three §4 blocks, including my §7(a3) and §5(f2), EXECUTE in the replay |
| `node tests/apply-order-honesty.mjs` | **0** | 34 files carry a measured verdict, and every note agrees with the live-hash baseline |
| `node tests/party-settle.mjs` | **0** | 37 arms — P-IDEM, R1–R4, S1–S7, I1, P1–P2, C1–C3, F1–F4, A1–A6, U1–U4, O1–O2, E1–E8 |
| `node tests/party-settle.mjs --mutate` | **0** | 5 apply-time mutants RED + `M2-fanOutNotRolledBack` RED **by execution** |
| `node tests/party-membership.mjs` | **0** | green |
| `node tests/party-membership.mjs --mutate` | **0** | two honest stages, unchanged by this batch |
| `node tests/party-split.mjs` | **0** | 425 windows; S-SQL now grades **both** forms, the column included |
| `node tests/party-split.mjs --mutate` | **0** | 18/18 RED |
| `node tests/world-tick-shadow-chain.mjs` (+ `--mutate`) | **0** / **0** | RE-VERIFY 5's twelve arms and five mutants, unmoved |
| `node tests/world-tick-combat-parity.mjs` | **0** | `AWAY-1` unmoved — the party path adds no combat code |
| `node tests/world-tick-ledger-meta.mjs` | **0** | the design's parity queries execute against a real `hr_apply` row |
| `node tests/restore-census.mjs` | **0** | the two new tables classified; `party`/`party_member` moved onto `player_value_tables` as S1's own note required |
| `node tests/guard-hygiene.mjs` | **0** | no orphans, no ghosts, **no vacuous proofs** |
| `node tests/ci-shape.mjs` | **0** | on a quiet machine — see RE-VERIFY 5's S-8; it failed closed once under load and was green on three consecutive re-runs |
| `node tools/derive-grant-hygiene.mjs --check` | **0** | `derivation in sync (14 links, 15 patches)` |
| `node tools/pack-edge.mjs hr-accrue --hash` | **0** | packs; re-pack on the **assembled set**, not this branch (the S-9 precedent) |
| `node tools/lane-done.mjs` | **0** | all green |
| `node tests/live-hash-drift.mjs` | **1** | **the three entries of D3, deliberate.** Coordinator re-seeds |

**`?v=` sweep**, as the brief required: `grep -rn '?v=[0-9]' tests/ supabase/functions/`
returns 16 hits and **every one is prose inside a comment** — `cache-buster-guard.mjs`'s
own worked example, `predict-display.mjs`'s two-instances note, `party-split.mjs:120`'s
anchor note, `conservation-fuzz.mjs`'s aside. **No code specifier anywhere**, so nothing
was removed and no `?v=` was bumped.

**Mutation proofs — each run, each red, each restored.**

| mutant | caught by | exit | what it said |
|---|---|---|---|
| `thirteenthKey` — the nested key-set equality disabled | apply, `GATE(e)` | **1** | an EIGHTH key on `journal.meta.party` was accepted |
| `whenOthers` — the handler catches `when others` | apply, `GATE(k)` | **1** | B-A3's whole argument, executed |
| `partialMemberSet` — (6)'s predicate disabled | apply, `GATE(d)` | **1** | a SHORT member set (1 of 2 live) answered `ok: true` |
| `rostersOverlap` — invariant 7's clause removed | apply, `GATE(d)` | **1** | the per-character roster still offers a partied character |
| **`carrierBoundsDontCompose`** (mine) — CHECK back to 64 KiB | apply, `GATE(f2)` | **1** | `4 members x 16384 octets = 65536, and … admits only 65536` |
| **`fanOutNotRolledBack`** (mine) — the `HR826` raise becomes `continue` | **`U2`, by execution** | **RED** | the fan-out **paid 6 ledger rows** while one member could not be paid, and the party watermark ADVANCED |

**Baselines — honest?** Yes, checked by set comparison.
`tests/restore-census.baseline.json` moves `party` and `party_member` onto
`player_value_tables` — which is S1's own stated expiry, honoured in the batch that
triggered it — classifies `party_hunt` `restore_only` with a bounded, stated rebuild cost
(nobody loses credited time, because invariant 8 keeps each member's own `accrued_to`
equal to the party's) and `party_tick_lease` `operational` (the repo authors no row;
`hr_party_roster` re-seeds it, and empty is the fail-safe). `schema-apply-order.json`
carries all three files in precondition order with `STAGED, NOT APPLIED`. `ci-shape` +
`guard-hygiene` both green on the new `smoke.yml` step, which runs the base **and**
`--mutate`, so no `proof_baseline` exemption is needed. `schema-drift.baseline.json` and
`ci-shape.baseline.json` needed no edit from me and got none; `live-hash-drift.baseline.json`
is Coordinator-only and neither the lane nor I touched it.

---

## 5. VERDICT

### 5.1 The APPLY — **GO-WITH-CHANGES, and every change is LANDED on `sec/m8-s2-review` and re-proved.**

Nothing is waiting on the author. D1, D2, D3, D4 and D5 are on this branch, each with an
executing arm behind it, two of them mutation-proved against the real chain, and the
whole gate list above green afterwards. **Merge `sec/m8-s2-review` and apply the three
files from it.** Applying `84ff4012` as staged would ship a carrier bound that does not
hold where it says it holds, a `--mutate` whose headline arm proves a different property
from the one it names, and two apply-order notes that tell the Coordinator to expect one
live-hash entry when the guard produces three.

`CLAUDE.md` §2 — one file per call, Coordinator only, never 00:00–00:10 UTC, **all three
in ONE sitting** (between files 1/2's engine grants and file 3's record the nightly
`hr-grant-hygiene` cron raises on `engine_execute_outside_allowlist`, and a detector
expected to be red hides the next real regression):

```bash
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s2-1-hunt-tables.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s2-2-roster-settle.sql
node tools/apply-migration.mjs supabase/migrations/2026-09-23-m8-parties-s2-3-engine-allowlist.sql
```

Each file's own §7/§5/§3 block refuses the install if its properties do not hold, so a
clean return IS the post-condition for that file. Do not proceed past a file that raised.

### 5.2 The EDGE DEPLOY — **GO, strictly AFTER all three applies.**

Not "in the same sitting" — **after**, and the order is mandatory in a way the M3
precedent does not cover, because it fails in the opposite direction (D4): the edge in
front of the migrations refuses every `accrue`, `set_activity` and `equip` in the game,
for every player. After them it is inert. Re-pack on the **assembled set**, not on this
branch (the S-9 precedent), and verify the live `payload_sha256` equals
`pack-edge --hash` before the play gate.

The edge half is sound on its own terms: one call site for the fence rather than eight,
failing closed; the split imported from S3's file and never re-implemented; one
`hr_party_tick_settle` call per party window; the window key derived from
`(party, window)` and never supplied; and not one number the engine computes from coming
out of the request.

### 5.3 What the Coordinator reads AFTER the apply (read-only; no write, no seed, no probe row)

1. **Both tables EXIST and are EMPTY** — `party_hunt` 0, `party_tick_lease` 0. Non-zero
   is a P0: §7(z) did not hold on production.
2. **RLS + privileges.** `relrowsecurity` true on both; `party_hunt` carries exactly one
   SELECT policy and `party_tick_lease` **zero policies of any kind**;
   `role_table_grants` for the two tables shows `authenticated` SELECT on `party_hunt`
   and **nothing else for anybody** (`service_role` is BYPASSRLS — for it the revoke is
   the only fence).
3. **The function matrix, per role.** `has_function_privilege` false for `anon`,
   `authenticated` and `service_role` on `hr_partied` and `hr_party_hunt_live`;
   `hr_party_roster` **`hr_tick` only** with `hr_engine` explicitly absent;
   `hr_party_tick_settle` **`hr_engine` only** with `hr_tick` explicitly absent.
4. **`hr_tick_roster` carries the invariant-7 clause exactly ONCE**, and still carries
   its watermark LATERAL, its `for update of o skip locked`, its keyset sentinel and its
   seed rendering. `hr_party_hunt_live(gen_random_uuid())` is **false**.
5. **`hr_assert_grant_hygiene(true)`** — read the REPORT, not the absence of a raise:
   `unapproved_client_rpcs` empty, `ungated_client_rpcs` empty,
   `engine_execute_outside_allowlist` **empty and present as a key**, and both new
   entries at their exact regprocedure spellings with link 13's ten-argument
   `hr_tick_settle` still there.
6. **`hr_tick_config` is untouched** — `shadow` still **TRUE**, `enabled` and `channels`
   as found. Arming is S5's own GO and is not in this batch.
7. **`hr_tick_shadow`**: the `party` column is nullable jsonb with no default, the
   channel CHECK is still the three-value one, and `count(*) where party is not null` is
   **0**.
8. **`live-hash-drift --codediff` FIRST**, then `--live --write`. Expect **THREE**
   entries (D3), not one: `hr_tick_roster` and `hr_party_hunt_live` newly tracked, and
   `hr_assert_grant_hygiene` restated as chain link 14 — whose diff must be exactly the
   two inserted `c_engine_allow` lines and their argued comment block at the head of the
   array. The whys are written out in full in the apply-order notes. Then the three notes
   flip STAGED → APPLIED with timestamps, and `restore-census` re-pins.

### 5.4 What must NOT happen next

- **No edge deploy before the applies** (D4). This is the one that costs players their
  evening rather than costing a measurement.
- **No `update hr_tick_config set shadow = false`.** S5 is a separate GO and its own
  pre-arm bar is unmet by definition; ordering constraint 2 (M4) and 3 (M5 + §7a) both
  still stand.
- **No reading of a 48 h party parity number until §3's partition rule is satisfied.**
  Today the party shadow measures four solo settles weighted by fight time. Both seams
  have to close and the clock has to be re-cut at the later of them.
- **B-A1 is still owed by S4** (do `party_hunt_start`/`party_hunt_stop` count against
  S-6's 8 boundaries?), and B-A6's all-or-nothing `member_uncollectable` self-check with
  it.

This verdict covers S2 only.
