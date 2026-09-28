# Security review — lane/world-tick-bestiary-read (3579ce03)

Reviewer: security-engineer. 2026-09-28. Read-only, no DB access (the sandbox cannot reach Supabase).
Base `origin/set/b560` @ c8b45ccc; one lane commit 3579ce03. Closes follow-up **N4** of SEC_WORLD_TICK_STALL_2026-09-28.md for the solo tick.

## Verdict

| Half | Verdict |
|---|---|
| EDGE DEPLOY hr-accrue (assembled set) | **GO** |
| Same deploy as lane C F2/F3 | **No — ship separately; this does not wait for F2/F3** |
| SHADOW ARM | **stays shadow** — this lane is not an arming decision; N4b (below) is still open for parties |

No changes required. The Coordinator merges `lane/world-tick-bestiary-read` itself; this branch adds only this doc.

## Hashes

- Lane alone: `6546fac9679c74ec403c983cd350463fa367d9e58473ff59a5c99ca92c6913b3` (matches the lane's report).
- **Assembled (lane merged with `origin/set/b560` @ 0e4abee, zero conflict hunks): `00eea7ba7b27995b9433fb1df0db8d6d1dd75ff19664023fe6d51a22172a20c8`.** After the deploy, check that the live `payload_sha256` equals this value.
- On the assembled tree these are green: bestiary-parity plus `--mutate`, edge-tick-gate `--selftest`, party-settle and perks-parity.

## Evidence

| Q | Finding | Evidence |
|---|---|---|
| 1 Grant | `hr_bestiary_of` is SECURITY DEFINER. It is revoked from public, anon, authenticated and service_role, and granted to `hr_engine` only. No later migration widens that grant (T-X1c scans every file). The tick's exec runs each statement in its own `sql.begin` under `set local role hr_engine`, so a 42883 cannot poison a later statement. | migrations/2026-08-20-bestiary.sql:63-83; index.ts:306-310; edge-tick-gate T-X1c |
| 1 Steering | Selectors are `sel.userId`/`sel.slot` from `parseSelectors`: UUID regex, integer slot 0–99, deduped, capped at MAX_ROSTER=500. They are the same selectors (1)/(1b) already bind. The body is HMAC-bound to the per-fire token before it is parsed. The read happens only after `probeWatermark` returns ok (the character is leased to this holder, on this channel) and past the flush line. No envelope or body field reaches the statement. | tick.js:512-533, 811, 824-828, 842; index.ts:292-304; T-X1a |
| 1 Byte identity | The tick imports `BESTIARY_SQL`, so the tick and the collect path send the same bytes (T-X1b asserts `text === BESTIARY_SQL`). Accrue (index.ts:700-703, 800-806) reads rows and drops `id==''` and `n<=0`. The SQL fold keeps those, but `hr_bestiary_of` already filters `value>0`, and an empty-string key names no monster. So the two folds give the same price. | set-activity.js:352-354, 882; tick.js:101, 842; bestiary.sql:70-79 |
| 2 Shadow | The tick pays nothing in shadow with the read in the path: no `hr_apply`, and the mark and version are unchanged (T-X1f). M4 is now bound to T-X1f as well. | edge-tick-gate green; `--selftest` M4/M12/M13 caught |
| 2 Armed parity / rungs | 12/12 windows equal at 20,000 kills, which is exactly the nemesis rung. **I re-ran the fixture with kills set to 1999 / 2000 (the banesworn charm rung), 10000 (slayer) and 19999: 12/12 equal each time, with the control moving 3–9/12 windows.** Both sides hand the same `{monster: kills}` map to the same `computeAccrual`, so rung comparisons (`>=`, charms.js:101) cannot diverge. | tests/world-tick-bestiary-parity.mjs; ad-hoc probes (scratch copies, not committed) |
| 3 Export | The only change to set-activity.js is `const` → `export const`. Its own read (:882) is byte-for-byte unchanged. The export adds nothing to the HTTP or RPC surface: the DB grant is unchanged, and only tick.js and tests import it. | diff set-activity.js:352 |
| 4 Cost | There is at most one extra read per **leased, priced** character per fire. That means ≤500 per fire at MAX_ROSTER, one indexed `player_progress` lookup each, ≤108 rows. At a 10 s cadence the ceiling is ≤50 reads/s, against roughly 6 statements per character the tick already makes (about +15%). A below-flush, unleased or wrong-channel character never reaches the read (T-X1g). The roster is deduped and capped, and forging one requires the tick secret, so a hostile roster cannot push past the fence or the cap. | tick.js:180, 517, 811-828; T-X1g |
| 5 Mutation proofs | `read-dropped` and `wrong-fold` each turn B3 red, and only B3. M12 (swallow every error) goes red on T-X1e, M13 (drop the read) on T-X1a. B2 is a control that requires the counters to move the accrue price in ≥1 window, so a broken read cannot pass just because both sides see zero kills. Gap (optional): T-X1a fires a one-row roster, so a read bound to roster[0] for every character would not be caught there. It would be caught by B3, which fires each character separately but always with a one-row roster. Worth a two-row arm in a later hardening lane; not a blocker. | `--mutate` output; `--selftest` output |
| 6 Scope | 8 files: smoke.yml, set-activity.js, tick-combat.js (comment + existing field), tick-shadow.js (comment), tick.js, ci-shape.baseline.json (+2 registrations), edge-tick-gate.mjs, world-tick-bestiary-parity.mjs. Nothing touches migrations, `src/**` or `live-hash-drift`. | `git diff origin/set/b560...3579ce03 --stat` |

Runs on the lane (all exit 0): bestiary-parity plus `--mutate`, perks-parity plus `--mutate`, edge-tick-gate plus `--selftest`, world-tick-parity, world-tick-combat-parity, world-tick-stall-after-repoint, party-settle, `tools/lane-done.mjs` ("all green").

## Why not bundle with F2/F3

The only files F2/F3 (`lane/settle-before-mutate-f2f3`) shares with this lane are smoke.yml and ci-shape.baseline.json; the code is disjoint. F2/F3, however, changes `src/core/buffs.js`, which is imported by the engine and moves the edge hash. It also carries two migrations that must apply first (lane C), and its Security review is still pending. Bundling would put a GO'd edge change behind an unreviewed one (§3.3 "never bundle"). **Deploy this now on its own.** F2/F3 gets its own deploy after its GO and apply, and the Coordinator re-measures the hash then.

## Follow-ups (not blocking this deploy)

- **N4b (ARM blocker for the party channel, S5):** `tick-party.js` makes neither the `hr_perks_of` read nor the `hr_bestiary_of` read, so party member windows still price at zero perks and zero bestiary. That is harmless while `PARTY_CHANNEL_PAYS=false` and shadow, but it must be closed the same way before S5 arms. (`grep -n "perks\|bestiary" tick-party.js` returns nothing.)
- **N6 (optional hardening):** add a two-row roster arm to T-X1a that asserts each read is bound to its own row.
