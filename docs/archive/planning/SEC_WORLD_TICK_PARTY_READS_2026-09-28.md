# Security review: lane/world-tick-party-reads (N4b), 2026-09-28

**VERDICT: GO.** Edge-only change. There are no DB writes, and nothing pays: the party channel stays SHADOW. There are no required changes. Two hardening arms are listed below as non-blocking. They are a parallel branch (§3.1) and do not gate this deploy.

Reviewed head: `72b94c1a` (lane/world-tick-party-reads), merge-base `0f17b398`. Current `origin/set/b560` is `8fda2d4d`. The merge onto it is clean (zero hunks), and pack-edge on the merge commit gives the same payload.
Packed payload at the reviewed head, and on the merge onto 8fda2d4d: **`e545713b53e41320d7dbc18c03b79688e3ad6e633fa7c79609163a650523e07f`** (base 0f17b398 was `3ca79452…76463`).

## Evidence

| property | evidence | exit |
|---|---|---|
| binding, solo roster, two users | `node tests/edge-tick-gate.mjs`: T-X1h | 0 |
| binding, two-member party | T-X1i (Proxy spies: each answer is touched only while its own member is current) | 0 |
| mutants bite | `edge-tick-gate --selftest`: M13 (drop bestiary), M14 (drop perks), M15 (bind to roster[0]), M16 (swap answers, args intact), each red on T-X1h and T-X1i | 0 |
| binding by (user, **slot**) and party fail-closed | reviewer probe (below): P1 same user on slots 0/1, P2 member-2 read error 42501/57014/codeless, P3 42883, P4 `ok:false`/array | 0 |
| probe bites | the same probe with an exec that ignores the slot: P1 goes red | 1 (expected) |
| authority, engine-only RPC | T-X1c: `hr_bestiary_of` granted to hr_engine only, revoked from client roles, no migration grants it wider | 0 |
| statement bytes | T-X1b: bestiary SQL is `set-activity.js` BESTIARY_SQL. `PERKS_SQL` is byte-identical to the removed inline tick.js string (grep count 1/1). Both are `$1::uuid, $2::int` parameters with no interpolation | 0 |
| parity (AWAY-1) | `node tests/party-settle.mjs`: N1 byte-identical (journal.meta.party aside); N2 control, the reads move the delta; N3 control, the pre-N4b driver is red | 0 |
| parity mutants | `party-settle --mutate` | 0 |
| world-tick parity | `world-tick-parity`, `world-tick-combat-parity` | 0 / 0 |
| bestiary parity | `world-tick-bestiary-parity` and `--mutate` | 0 / 0 |
| perks parity | `world-tick-perks-parity` and `--mutate` | 0 / 0 |
| settle-first | `node tests/settle-before-mutate.mjs` | 0 |
| edge job | `run-ci-local --job edge`: 7/8. The only red is `edge-jwt-gate --strict`, the allowed one (egress 403, host not in allowlist) | 1 (allowed) |
| pack | `pack-edge hr-accrue --check` / `--hash` → e545713b… | 0 / 0 |
| packed-tree diff, base vs head | `diff -rq`: only `tick.js`, `tick-party.js`, `payload-hash.js` (the hash constant alone) and the new `tick-reads.js` | n/a |
| lane-done | `node tools/lane-done.mjs`: "all green" on the re-run with a 1800 s budget (the first run was killed at the 600 s timeout, see note) | 0 (124 at 600 s) |

## The six questions

1. **Binding.** Each member's reads take that member's `m.userId, m.slot`, are awaited inside the loop, and go straight into that member's `sessionOf` row. There is no memo or cache, and no object is shared across iterations: each `exec` returns a fresh row. The seed ladder and watermark path are unchanged: `seedsFor(exec, m, …)` and `probe.markText` are per member. The lane's fakeDb keys answers by user only, so no lane arm would catch confusion between two slots of the same user. My probe covers that case, and a slot-dropping mutant turns it red.
2. **Authority.** Reads go only through `hr_perks_of` and `hr_bestiary_of`, with the (user, slot) taken from the parsed roster unit: UUID regex, integer slot 0..99, deduplicated. Each member's state is re-read from `hr_state_of`, and the fence re-counts membership under the lock. No value comes from the body. `PERKS_SQL` repeats the old statement byte for byte, and the bestiary statement is imported from the collect path. There is no new SQL shape and no interpolation.
3. **Parity.** N1 is a real byte comparison of the JSON delta, with only `journal.meta.party` deleted. N2 shows that the +10% allXP stack and the 20,000-kill bestiary move the solo window, so the test is not vacuous. On a failed read, the party path prices the same way solo does, because it runs the same functions. 42883 gives `null`, which means zero perks or no charm: the under-paying side. Any other error propagates. `runTick` catches it and records a `party_error:` refusal for that party. Member 2 is never priced, and no settle statement is issued (probe P2). `ok:false` perks and array or non-object kills become `null`; no default is ever forwarded (P4).
4. **Shadow stays.** The diff touches `party-fence.js`, the cron, the settle-first wrappers and `hr_apply` nowhere. A grep of the diff for PAYS, hr_apply, settle_first, cron, fence(, armed and paid finds nothing. `PARTY_CHANNEL_PAYS = false` is unchanged at party-fence.js:104. The packed tree changes only by the files listed above.
5. **Resource.** The change adds 2 statements per member per priced party window, the same per-character cost the solo tick already carries. Bounds: `PARTY_MAX = 4` (src/core/party-split.js:137, enforced in `parsePartyUnit`), `MAX_PARTIES = 128` per body, and the DB-side `batch_limit` (≤500 live members per fire, `hr_party_roster` I-3). The worst case adds 2×batch_limit statements per fire, bounded exactly like the solo roster. The reads sit after the flush-line early return. A party refused mid-loop (e.g. `member_channel_moved`) wastes at most 3 reads per earlier member. The body is gated by the per-fire derived JWT (edge-tick-gate), so a hostile roster requires the engine token.
6. **Runs.** See the table. lane-done is green (see the note below).

**lane-done note:** at the requested 600 s timeout, lane-done was killed (124) inside `tests/utc-midnight-replay.mjs`. That step is a 14-arm PGlite chain replay, about 3 min on a normal runner and slower in this sandbox. Every step before it printed `ok`. The re-run with an 1800 s budget finished `lane-done: all green.` with exit 0. This is a sandbox budget issue, not a guard failure.

## Non-blocking hardening (a parallel branch, §3.1)

- H1: extend `fakeDb` in edge-tick-gate to key `perksBy`/`bestiaryBy` by `user:slot`, and add a T-X1i variant with one user on two slots, plus a mutant that drops the slot.
- H2: add a party arm to T-X1e: a member-2 bestiary or perks error of 42501, 57014 or codeless means the party is refused and no `hr_party_tick_settle` is issued.
Both are covered today only by the reviewer probe, which was run above and is not committed. Committing it as a new test file would move the test-file ratchet.

## Deploy note (paste after merging into set/b560)

> edge deploy #5 from set/b560 <merge sha of lane/world-tick-party-reads>, expected payload e545713b53e41320d7dbc18c03b79688e3ad6e633fa7c79609163a650523e07f

Verify with `node tools/pack-edge.mjs hr-accrue --hash` on that merge sha before deploying. If anything else that moves the engine has landed on set/b560 in the meantime, the hash will differ and needs re-measuring.
