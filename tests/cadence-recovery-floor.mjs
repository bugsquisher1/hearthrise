#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/cadence-recovery-floor.mjs — SECURITY F1: THE ATTENDED CADENCE RPCs
// MUST FLOOR THEIR CREDIT WINDOW AT `recovering_until` AND CAP ITS END AT THE
// MOMENT THE SERVER SAYS THE CHARACTER LEFT COMBAT.
//
//   node tests/cadence-recovery-floor.mjs            the guard (static, no credentials)
//   node tests/cadence-recovery-floor.mjs --selftest green first, then every mutation must go RED
//   node tests/cadence-recovery-floor.mjs --mutate <name>   plant ONE defect and show the result
//   node tests/cadence-recovery-floor.mjs --list     the checks and the mutations
//   node tests/cadence-recovery-floor.mjs --replay   ALSO rebuild the chain in pglite and read
//                                                    the property off the LIVE function bodies
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// 2026-09-06-recovering-until.sql shipped the Recovery Rule and named this hole
// in its own header, as a TODO for "next build":
//
//   "the cadence RPCs hr_credit_kills__ungated and hr_credit_combat_xp__ungated
//    do NOT floor their credit window at recovering_until, so a MODIFIED client
//    can keep reporting attended kills and XP straight through a knockout and be
//    paid at the physical cap."
//
// The away path was already correct — hr-accrue pays nothing inside the window
// and set-activity.js refuses to start a fight. The ATTENDED path is a SECOND
// DOOR into the same counters, and it is the door the RANKED surfaces read:
// combat XP is written straight to player_skills (the server-sourced leaderboard
// number since 2026-08-18), and the kill counters are graded by hr_renown_of and
// PAID by hr_claim_daily. A forged value that crosses into another player's
// ranking is the one outcome CLAUDE.md's server-authority section forbids.
//
// ── THE SECOND FAILURE, MEASURED LIVE (2026-09-06 11:43 UTC, stock client) ──
// A read-only sweep of `player_ledger` on the QA character found:
//
//   11:41:38  kind=combat  intent=xp_credit  credit 40  elapsed_ms 52742
//             meta.active_kind "idle"   meta.kind_mismatch true
//
// Fifty-two seconds of combat XP paid while the SERVER's own activity pointer
// said `idle`. `kind_mismatch` was already journalled — 2026-08-31 wrote "a
// single post-fight flush is plausible; a RUN of them is a forgery tell" — and
// the window was PAID anyway. The fix CAPS THE WINDOW END at the switch instant
// (`player_state.active_since` while the pointer is not 'combat'), which is the
// opposite operation to the recovery floor and deliberately so: a knockout says
// "nothing BEFORE this is payable", a switch says "nothing AFTER it is". A final
// post-fight flush is entirely pre-switch and still pays in full; a window
// entirely after the switch credits ZERO with `reason:'not_in_combat'`.
//
// ── WHY A GUARD AT ALL, GIVEN THE MIGRATION SELF-CHECKS ITSELF ──────────────
// 2026-09-06-cadence-recovery-floor.sql's §4 proves every one of these
// properties BY EXECUTION when it is applied. That is the stronger check and it
// is not duplicated here. But it only fires on APPLY — and this repo's whole
// class of "one of the two bodies quietly stopped carrying the control" defects
// is committed weeks before anybody applies anything. This guard runs on every
// push, in milliseconds, with no database and no credential, and it fails the
// day the floor is DELETED FROM THE FILE rather than the day somebody tries to
// rebuild. `--replay` is the bridge between the two: it rebuilds the real
// ordered chain in pglite and reads the property off the LIVE function bodies,
// including the one property text cannot see — that the knocked-out return
// happens BEFORE every write.
//
// ── THE ASYMMETRY THAT MOTIVATES "BOTH BODIES, SEPARATELY" ──────────────────
// There are TWO functions and THREE windows (the kills verb owns a bounty-free
// window and a bounty window; the XP verb owns the combat_xp_accrued_to
// watermark). A fix that lands in one and no-ops in the other leaves the exploit
// fully open through the other door AND reports success. Every check below is
// therefore scoped to a NAMED SECTION of the migration, never to the file as a
// whole, and the mutation catalogue strips the floor from each body in turn.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// Exit: 0 green · 1 a violation · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FILE = '2026-09-06-cadence-recovery-floor.sql';
const MIG = join(ROOT, 'supabase', 'migrations', FILE);
const ORDER_FILE = join(ROOT, 'tests', 'schema-apply-order.json');

const argv = process.argv.slice(2);
const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/* ── THE SECTIONS ─────────────────────────────────────────────────────────
   A check that searched the WHOLE file would be satisfied by a floor that
   exists only in the kills patch, or only in a comment in the header — which is
   exactly the vacuous-guard shape this file is written to avoid. Slice first,
   assert second. */
const MARKS = {
  pre:   ['-- ── 0. PRECONDITIONS', '-- ── 1. hr_credit_kills__ungated'],
  kills: ['-- ── 1. hr_credit_kills__ungated — THE RECOVERY FLOOR',
          '-- ── 2. hr_credit_combat_xp__ungated — THE RECOVERY FLOOR'],
  xp:    ['-- ── 2. hr_credit_combat_xp__ungated — THE RECOVERY FLOOR',
          '-- ── 3. GRANTS'],
  /* §3b is the DEPENDENCY of arm 2, not a decoration: the end-cap reads
     player_state.active_since, and until this section shipped hr_apply stamped
     that column on the client's `restart` flag ALONE — so a SERVER auto-stop
     (accrual.js emits {kind:'idle', id:null} with no flag at three sites) left
     it at the start of the fight, and the cap would have zeroed every attended
     credit on the 12-of-36 live characters already in that state. */
  apply: ['-- ── 3b. hr_apply', '-- ── 3c. hr_apply'],
  /* §3c is the THIRD arm and it is the one that makes the other two mean
     anything. Arms 1 and 2 are built on player_state.recovering_until; until
     this section shipped, hr_apply validated an incoming line against a CEILING
     only, so a settle carrying `recovering_until: null` while 60 minutes
     remained ZEROED the column both arms read. The no-shortening invariant
     lived only in the edge (src/core/combat-sim.js:632/694 preserve-or-clear),
     which is to say it lived where a forged caller does. */
  floor: ['-- ── 3c. hr_apply', '-- ── 4. SELF-CHECK'],
  check: ['-- ── 4. SELF-CHECK', '-- ── 4b. THE NO-SHORTENING FLOOR, EXECUTED'],
  /* The EXECUTED half. Text can prove the floor is spelled; only a call can
     prove it fires, that a refusal rolls back, and — the property that would
     otherwise make this fix worse than the hole — that hr_rest still cures. */
  exec:  ['-- ── 4b. THE NO-SHORTENING FLOOR, EXECUTED', null],
};

function sections(text) {
  const out = {};
  for (const [name, [from, to]] of Object.entries(MARKS)) {
    const a = text.indexOf(from);
    if (a < 0) throw harness(`the ${name} section marker is missing from ${FILE} — the guard cannot scope its checks and refuses to pass vacuously`);
    const b = to === null ? text.length : text.indexOf(to, a + from.length);
    if (b < 0) throw harness(`the ${name} section has no terminator in ${FILE}`);
    out[name] = text.slice(a, b);
  }
  return out;
}

/* ── THE CHECKS. Each is (section, predicate, why). ───────────────────────── */
const CHECKS = [
  // ── THE FLOOR, in all THREE windows ─────────────────────────────────────
  ['kills', (s) => s.includes('v_anchor := greatest(v_anchor, least(coalesce(v_recovering, v_anchor), now()));'),
    'the BOUNTY-FREE window anchor is not floored at recovering_until — the log anchor is stale by the whole '
    + 'knockout (the short-circuit writes no row), so the entire window becomes creditable the instant the player stands up'],
  ['kills', (s) => s.includes('greatest(v_ab.accepted_at, least(coalesce(v_recovering, v_ab.accepted_at), now()))'),
    'the BOUNTY window (accepted_at) is not floored at recovering_until — a bounty accepted before a knockout '
    + 'pays its physical cap for time the character spent face-down'],
  ['xp', (s) => s.includes('v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));'),
    'the combat-XP watermark is not floored at recovering_until — this is the exact formula the predecessor '
    + "migration's TODO specified, and combat XP is the SERVER-SOURCED leaderboard number"],

  // ── ARM 3: A RUNNING KNOCKOUT MAY NOT BE SHORTENED (§3c) ────────────────
  ['floor', (s) => s.includes('SECURITY F1 - THE NO-SHORTENING FLOOR'),
    'the §3c patch does not carry its own marker — without it the migration cannot tell a patched body from an '
    + 'unpatched one and a re-apply double-inserts the refusal'],
  ['floor', (s) => s.includes('if v_st.recovering_until is not null')
                && s.includes('and v_st.recovering_until > now()'),
    'hr_apply does not refuse a delta against the STORED, STILL-RUNNING line — a settle carrying an earlier '
    + 'recovering_until shortens the knockout, and the Recovery Rule (the answer to "death is a free full heal, '
    + 'so farm with zero food") is client-cancellable again'],
  ['floor', (s) => s.includes('and (v_recover is null or v_recover < v_st.recovering_until) then'),
    'the floor does not refuse a NULL proposal while the line runs — this is the single most valuable forgery '
    + '(the outright CANCEL), and a predicate that tests only `v_recover < stored` answers NULL for it and falls '
    + 'straight through to "accept"'],
  ['floor', (s) => s.includes("'why', 'would shorten an active knockout'"),
    'the refusal is not NAMED — hr-accrue/index.ts\'s degrade ladder reads the `why` off a bad_recovering 409, '
    + 'and an unnamed refusal is indistinguishable from a garbage timestamp'],
  ['floor', (s) => !/v_recover := (greatest|least)\(/.test(s),
    'the floor CLAMPS the proposal instead of REFUSING it — every other control on this line refuses '
    + '(the ceiling included), and a clamp answers a forged delta with 200 while quietly writing a value the '
    + 'caller chose the shape of'],
  ['floor', (s) => s.includes("if strpos(v_def, 'SECURITY F1 - THE NO-SHORTENING FLOOR') > 0 then"),
    'the §3c patch lost its own-marker guard, so a re-apply double-inserts the refusal and the migration stops '
    + 'being idempotent'],
  ['floor', (s) => s.includes('v_st is the row this function already holds under "for update"'),
    'the §3c comment no longer states that the comparison is against the LOCKED row — the next editor has no '
    + 'way to know that re-reading player_state here would be a read-modify-write across the lock'],
  ['pre', (s) => s.includes("to_regprocedure('public.hr_rest(int,uuid)') is null"),
    '§0 does not require hr_rest — §4b(d) could then "pass" by never proving the sanctioned cure survives, and a '
    + 'floor that also blocks the cure makes every knockout PERMANENT, which is worse than the hole it closes'],
  ['pre', (s) => s.includes("if strpos(v_a, 'SECURITY F1 - THE NO-SHORTENING FLOOR') > 0 then")
              && s.includes("raise exception 'hr_apply: the (4a-v) ceiling tail is missing or ambiguous"),
    'the §3c anchor is not asserted EXACTLY ONCE in §0 — a replace() whose anchor has moved is a SILENT no-op, '
    + 'so the migration would report success with the floor unshipped'],

  // ── ARM 3, EXECUTED (§4b) ───────────────────────────────────────────────
  ['exec', (s) => s.includes('insert into auth.users (id) values (v_uid);')
                && s.includes("errcode = 'HR34C'"),
    '§4b no longer runs a real probe inside a rolled-back subtransaction — the floor would be proven by TEXT '
    + 'only, and an anchored insert can land in a branch that never runs'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b(a): hr_apply ACCEPTED an EARLIER recovering_until"),
    '§4b stopped RAISING when hr_apply accepts an earlier line — the probe would run, observe the exploit and '
    + 'let the migration report success'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b(a2): hr_apply ACCEPTED a NULL recovering_until"),
    '§4b stopped proving the NULL CANCEL is refused — the null case is the one a naive predicate lets through, '
    + 'so it must be executed separately from the earlier-instant case'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b(b1): hr_apply REFUSED an unchanged recovering_until")
                && s.includes("raise exception 'F1 §4b(b2): hr_apply REFUSED a LATER recovering_until"),
    '§4b does not prove that an EQUAL (the ordinary settle re-stating the line) and a LATER (a new death) '
    + 'proposal are still ACCEPTED — a floor that refuses those 409s every knocked-out accrual in the game'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b(c): hr_apply refused to CLEAR an EXPIRED line"),
    '§4b does not prove an EXPIRED line is still freely clearable — this is why the predicate is `stored > '
    + 'now()` and not `stored is not null`; without it a served knockout never ends'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b(d): hr_rest FAILED after the floor shipped"),
    '§4b does not EXECUTE hr_rest after the floor — "the cure writes player_state directly so it never meets '
    + 'the floor" is true until someone reroutes it, and the failure mode is a permanent knockout'],
  ['exec', (s) => s.includes("raise exception 'F1 §4b LEAKED a player_state row'")
                && s.includes("raise exception 'F1 §4b LEAKED a ledger row'"),
    '§4b lost its LEAK assertions — a self-check that commits its probe character writes a body into production '
    + 'as a side effect of verifying itself, and the ledger is append-only'],

  ['check', (s) => s.includes("F1 self-check (q): hr_apply does not refuse to shorten a running knockout"),
    'the self-check does not assert the no-shortening floor ON APPLY — the property would be true only for as '
    + 'long as nobody restated hr_apply'],
  ['check', (s) => s.includes("F1 self-check (q): the floor runs AFTER the SET clause"),
    'the self-check does not assert the floor is sited BEFORE the write — a refusal that runs after the SET '
    + 'clause is a comment on a write that already happened'],
  ['check', (s) => s.includes("F1 self-check (q): hr_rest no longer clears recovering_until"),
    'the self-check does not assert that hr_rest still clears the line — the floor would be free to make a '
    + 'knockout permanent and still report PASSED'],

  // ── THE LINE IS THE SERVER'S ────────────────────────────────────────────
  ['kills', (s) => s.includes('select recovering_until, active_kind, active_since')
                && s.includes('into v_recovering, v_active_kind, v_active_since')
                && s.includes('from public.player_state where user_id = v_uid and slot = v_slot'),
    'the kills floor does not read player_state.recovering_until off the server row'],
  ['xp', (s) => s.includes('select combat_xp_accrued_to, accrued_to, active_kind, recovering_until'),
    'the combat-XP floor does not read recovering_until inside the `for update` row lock the function already '
    + 'takes — either the column is not read at all, or it is read outside the lock'],
  ['kills', (s) => !/v_recovering\s*:?=\s*\(?\s*p_/.test(s), 'the kills floor assigns v_recovering from a PARAMETER — the client would choose its own knockout'],
  ['xp',    (s) => !/v_recovering\s*:?=\s*\(?\s*p_/.test(s), 'the combat-XP floor assigns v_recovering from a PARAMETER'],
  ['kills', (s) => s.includes('now() < v_recovering'), 'the kills knockout test does not use the SERVER clock'],
  ['xp',    (s) => s.includes('now() < v_recovering'), 'the combat-XP knockout test does not use the SERVER clock'],

  // ── ZERO IS CREDITED, AND THE REFUSAL IS NAMED ──────────────────────────
  ['kills', (s) => s.includes('if v_recovering is not null and now() < v_recovering then'),
    'hr_credit_kills__ungated has no knocked-out short-circuit'],
  ['xp', (s) => s.includes('if v_recovering is not null and now() < v_recovering then'),
    'hr_credit_combat_xp__ungated has no knocked-out short-circuit'],
  /* COUNTED, not merely present: BOTH refusal arms (recovering and
     not_in_combat) spell the zeroed receipt identically, so `includes` alone
     would still pass with one of the two forged to return the CLAIMED figure. */
  ['kills', (s) => (s.match(/'credited', 0,/g) || []).length >= 2
                && (s.match(/'credit', 0, 'claimed', v_claimed, 'cap', 0/g) || []).length >= 2,
    'a kills refusal receipt does not zero EVERY credited quantity (credited / credit / cap) in BOTH arms — a '
    + 'refusal that reports a payment it did not make is believed by every reader of the receipt'],
  ['xp', (s) => (s.match(/'credited', '\{\}'::jsonb, 'credit', 0,/g) || []).length >= 2,
    'a combat-XP refusal receipt does not zero credited / credit in BOTH arms'],
  ['kills', (s) => s.includes("'reason', 'recovering'"),
    "the kills refusal is not NAMED — a silent zero is indistinguishable from a throttle"],
  ['xp', (s) => s.includes("'reason', 'recovering'"),
    'the combat-XP refusal is not NAMED'],

  // ── THE WATERMARK PROPERTY (the subtle one) ─────────────────────────────
  // Ordering inside the PATCHED body cannot be read out of this file — the
  // writes live in the predecessor bodies. What CAN be asserted here is that
  // the migration still SHIPS the position assertions that prove it on apply,
  // and `--replay` then reads the real ordering off the live bodies.
  ['check', (s) => s.includes("v_write := strpos(v_x, 'set combat_xp_accrued_to = now()');")
                /* FIVE writes are guarded by position — the XP watermark stamp, the skill
                   credit, the XP idempotency append, the kill credit-log append and the kill
                   progress writes. Counted, not merely "present somewhere": the comparison
                   is spelled identically in all of them, so a `s.includes` would still pass
                   with all but one deleted. TEN, not five: the not-in-combat arm gets the
                   same five position proofs as the recovering arm, because it is the same
                   hazard (a refusal that retires a window nobody paid for). */
                && (s.match(/v_ret >= v_write/g) || []).length >= 10   /* five per ARM, two arms */
                && s.includes('the combat-XP short-circuit does not return BEFORE the watermark stamp'),
    'the migration no longer proves that the combat-XP short-circuit returns BEFORE `combat_xp_accrued_to = now()` — '
    + 'a refused knockout would RETIRE an unpaid window, so the floor would cost the player the very time it declined to pay for'],
  ['check', (s) => s.includes("v_write := strpos(v_k, 'insert into public.hr_kill_credit_log');")
                && s.includes('the bounty-free anchor would advance across an unpaid knockout'),
    'the migration no longer proves that the kills short-circuit returns BEFORE the credit-log append — the '
    + "bounty-free anchor is max(created_at) over that log, so an appended row would advance it across the knockout"],
  ['check', (s) => s.includes("strpos(v_x, 'insert into public.hr_combat_xp_credit_log')"),
    'the migration no longer proves the combat-XP short-circuit returns before the idempotency append — a refused key would be burned'],

  // ── THE SELF-CHECK COVERS *BOTH* BODIES, SEPARATELY ─────────────────────
  ['check', (s) => s.includes("if strpos(v_k, 'SECURITY F1 - THE RECOVERY FLOOR') = 0 then")
                && s.includes("if strpos(v_x, 'SECURITY F1 - THE RECOVERY FLOOR') = 0 then"),
    'the self-check does not assert the marker in BOTH bodies — a patch that no-oped on one of the two would '
    + 'leave the exploit fully open through the other door and report success'],
  ['check', (s) => s.includes('public.hr_bounty_kill_cap(500, 99, 0)') && s.includes('public.hr_combat_xp_cap(99, 0)'),
    'the self-check no longer EVALUATES that both caps pay exactly 0 at elapsed 0 — that evaluation is what makes '
    + 'the floor sufficient on its own, independent of the short-circuit'],
  ['check', (s) => s.includes("has_function_privilege(v_role, 'public.hr_credit_kills__ungated(int,text,bigint,text)', 'execute')")
                && s.includes("has_function_privilege(v_role, 'public.hr_credit_combat_xp__ungated(int,jsonb,text)', 'execute')"),
    'the self-check no longer asserts that the __ungated bodies are callable by no client role — a grant that '
    + 'drifts is invisible until it is exploited, and it would make both the rate gate and this floor decoration'],
  ['check', (s) => s.includes("strpos(v_k, 'kill_credited') = 0"),
    'the self-check no longer asserts that 2026-09-02-renown-kill-faucet.sql\'s credited counters survived — this '
    + 'file patches a body two other migrations already patched, and silently erasing one of them is the most '
    + 'destructive thing available in this tree'],

  // ── JOURNAL RULE 6 ──────────────────────────────────────────────────────
  ['kills', (s) => s.includes("intent = 'kill_credit_while_recovering'") && s.includes('at >= public.hr_utc_day_start(now())'),
    'the kills recovering audit row is not bounded to one per character per UTC day — a 64-minute knockout at the '
    + '60 s client cadence would file ~64 rows per fall, which is the game_events mistake (1.6M rows / 229 MB from '
    + 'six players in four days) reproduced at ledger scale'],
  ['xp', (s) => s.includes("intent = 'xp_credit_while_recovering'") && s.includes('at >= public.hr_utc_day_start(now())'),
    'the combat-XP recovering audit row is not bounded to one per character per UTC day'],
  ['kills', (s) => s.includes("'bounty', 'kill_credit_while_recovering', 0, 0, 0, 0, 0,"),
    'the kills recovering audit row carries a VALUE stamp — a refusal moves nothing and must not enter the daily '
    + 'progression budget or any conservation sum'],
  ['xp', (s) => s.includes("'combat', 'xp_credit_while_recovering', 0, 0, 0, 0,"),
    'the combat-XP recovering audit row carries a VALUE stamp'],

  // ── THE FILE IS STILL THE ANCHORED PATCH IT CLAIMS TO BE ────────────────
  ['kills', (s) => s.includes('pg_get_functiondef') && !/\bcreate\s+or\s+replace\s+function\s+public\.hr_credit_kills__ungated/i.test(s),
    'the kills patch has become a `create or replace` restatement — it would compile, self-check green and '
    + "SILENTLY DELETE 2026-09-02-renown-kill-faucet.sql's anchored patch"],
  ['xp', (s) => s.includes('pg_get_functiondef') && !/\bcreate\s+or\s+replace\s+function\s+public\.hr_credit_combat_xp__ungated/i.test(s),
    'the combat-XP patch has become a `create or replace` restatement'],
  ['kills', (s) => s.includes("strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0"),
    'the kills patch is not guarded by its own marker — it would double-insert on a re-apply'],
  ['xp', (s) => s.includes("strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0"),
    'the combat-XP patch is not guarded by its own marker — it would double-insert on a re-apply'],

  // ══ ARM 2 — THE NOT-IN-COMBAT END-CAP ═══════════════════════════════════
  // Live evidence: 2026-09-06 11:41:38 UTC, 40 combat XP over elapsed 52742 ms
  // with active_kind 'idle' and kind_mismatch true. Journalled, and paid.

  // ── THE END IS THE SERVER'S SWITCH INSTANT, IN BOTH BODIES ──────────────
  ['kills', (s) => s.includes("v_combat_end := case when v_active_kind is distinct from 'combat'")
                && s.includes("then least(now(), coalesce(v_active_since, 'epoch'::timestamptz))"),
    'hr_credit_kills__ungated does not compute the not-in-combat window END from the server activity pointer'],
  ['xp', (s) => s.includes("v_combat_end := case when v_active_kind is distinct from 'combat'")
             && s.includes("then least(now(), coalesce(v_active_since, 'epoch'::timestamptz))"),
    'hr_credit_combat_xp__ungated does not compute the not-in-combat window END — this is the exact 52742 ms '
    + 'idle credit measured live on 2026-09-06'],
  ['kills', (s) => s.includes("coalesce(v_active_since, 'epoch'::timestamptz)"),
    'the kills end-cap does not FAIL CLOSED on a NULL active_since — a row that cannot say when the character '
    + 'stopped fighting would get to bill for the ambiguity, against accrual.js SKIP.NO_ACTIVE_SINCE'],
  ['xp', (s) => s.includes("coalesce(v_active_since, 'epoch'::timestamptz)"),
    'the combat-XP end-cap does not FAIL CLOSED on a NULL active_since'],
  ['kills', (s) => s.includes('least(now(), coalesce(v_active_since'),
    'the kills end-cap is not clamped to now() — a FUTURE active_since would LENGTHEN the window and the cap '
    + 'would be a faucet'],
  ['xp', (s) => s.includes('least(now(), coalesce(v_active_since'),
    'the combat-XP end-cap is not clamped to now() — a future active_since would lengthen the window'],

  // ── ALL THREE WINDOWS ACTUALLY END AT IT ────────────────────────────────
  ['kills', (s) => s.includes('greatest(0, floor(extract(epoch from (v_combat_end - v_anchor)) * 1000)::bigint)'),
    'the BOUNTY-FREE window still ends at now() — a modified client that keeps reporting kills after it leaves '
    + 'combat is still paid at the physical cap'],
  ['kills', (s) => s.includes('v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end -'),
    'the BOUNTY window still ends at now() — a bounty accepted before the switch keeps billing wall time'],
  ['xp', (s) => s.includes('v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end - v_wm)) * 1000)::bigint);'),
    'the combat-XP window still ends at now() — the RANKED leaderboard number keeps being paid for time the '
    + 'server says the character was not fighting'],

  // ── ZERO, NAMED, AND THE SWITCH IS NOT A CLIENT VALUE ───────────────────
  ['kills', (s) => s.includes("if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then")
                && s.includes("'reason', 'not_in_combat'"),
    'hr_credit_kills__ungated has no not-in-combat short-circuit, or the refusal is not NAMED'],
  ['xp', (s) => s.includes("if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then")
             && s.includes("'reason', 'not_in_combat'"),
    'hr_credit_combat_xp__ungated has no not-in-combat short-circuit, or the refusal is not NAMED'],
  ['kills', (s) => s.includes('select recovering_until, active_kind, active_since'),
    'the kills body does not read active_kind AND active_since off the server row — the cap would have nothing '
    + 'server-known to cap against'],
  ['xp', (s) => s.includes('select combat_xp_accrued_to, accrued_to, active_kind, recovering_until, active_since'),
    'the combat-XP body does not read active_since inside the `for update` row lock it already takes'],
  ['kills', (s) => !/v_active_since\s*:?=\s*\(?\s*p_/.test(s) && !/v_combat_end\s*:?=\s*\(?\s*p_/.test(s),
    'the kills end-cap takes the switch instant from a PARAMETER — the client would choose when it stopped fighting'],
  ['xp', (s) => !/v_active_since\s*:?=\s*\(?\s*p_/.test(s) && !/v_combat_end\s*:?=\s*\(?\s*p_/.test(s),
    'the combat-XP end-cap takes the switch instant from a PARAMETER'],

  // ── THE TELL SURVIVES, AND THE NEW SIGNAL OBEYS JOURNAL RULE 6 ──────────
  ['kills', (s) => s.includes("'kind_mismatch', true"),
    'the kills not-in-combat audit row dropped `kind_mismatch` — it was the ONLY signal the live 2026-09-06 '
    + '11:41:38 row left behind, and every existing query over that field must keep finding these calls'],
  ['xp', (s) => s.includes("'kind_mismatch', true"),
    'the combat-XP not-in-combat audit row dropped `kind_mismatch`'],
  ['kills', (s) => s.includes("intent = 'kill_credit_not_in_combat'") && s.includes('at >= public.hr_utc_day_start(now())'),
    'the kills not-in-combat audit row is not bounded to one per character per UTC day — an idle client polling '
    + 'the 60 s cadence would file a ledger row per poll, which is the game_events mistake at ledger scale'],
  ['xp', (s) => s.includes("intent = 'xp_credit_not_in_combat'") && s.includes('at >= public.hr_utc_day_start(now())'),
    'the combat-XP not-in-combat audit row is not bounded to one per character per UTC day'],
  ['kills', (s) => s.includes("'bounty', 'kill_credit_not_in_combat', 0, 0, 0, 0, 0,"),
    'the kills not-in-combat audit row carries a VALUE stamp — a refusal moves nothing and must not enter the '
    + 'daily progression budget or any conservation sum'],
  ['xp', (s) => s.includes("'combat', 'xp_credit_not_in_combat', 0, 0, 0, 0,"),
    'the combat-XP not-in-combat audit row carries a VALUE stamp'],

  // ── THE SELF-CHECK STILL PROVES ARM 2 ───────────────────────────────────
  ['check', (s) => s.includes("if strpos(v_k, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then")
                && s.includes("if strpos(v_x, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then"),
    'the self-check does not assert the not-in-combat marker in BOTH bodies — a patch that no-oped on one of the '
    + 'two would leave that door open and report success'],
  ['check', (s) => s.includes('F1 self-check (o1)') && s.includes('F1 self-check (o2)')
                && s.includes('F1 self-check (o3)') && s.includes('F1 self-check (o4)'),
    'the self-check no longer EVALUATES the end-cap (a window entirely after the switch prices 0 and both caps '
    + 'pay 0; a straddling window is shortened to exactly its pre-switch part; a NULL active_since fails closed; '
    + 'an IN-COMBAT window is untouched). Text checks cannot prove arithmetic, and o4 is the one that would catch '
    + 'this arm becoming a tax on honest attended play'],
  ['check', (s) => s.includes("v_ret := strpos(v_x, $q$'reason', 'not_in_combat', 'active_kind', v_active_kind);$q$);")
                && s.includes("v_ret := strpos(v_k, $q$'reason', 'not_in_combat', 'active_kind', v_active_kind);$q$);"),
    'the self-check no longer proves the not-in-combat arm returns BEFORE the writes in both bodies'],

  // ══ ARM 2's DEPENDENCY — hr_apply MUST STAMP active_since ON A SWITCH ═══
  // Live 2026-09-06: 12 of 36 characters carry active_since < accrued_to,
  // because hr_apply stamped it on `restart` alone and the SERVER's own
  // auto-stops (accrual.js ~L2257 / ~L2763 / ~L3186) do not send that flag.
  // Against the end-cap that is a REGRESSION ENGINE pointing the wrong way.
  ['apply', (s) => s.includes("or coalesce(v_act->>'kind', active_kind) is distinct from active_kind"),
    'hr_apply does not stamp active_since when the activity KIND changes — a server auto-stop leaves the column '
    + 'at the start of the FIGHT, so the not-in-combat end-cap reads that as the moment the character stopped '
    + 'fighting and ZEROES every attended kill and XP credit until the next client declare'],
  ['apply', (s) => s.includes('is distinct from active_id'),
    'hr_apply does not stamp active_since when the activity ID changes (same kind, new target) — the window end '
    + 'would be the previous target\'s start instant'],
  ['apply', (s) => !/\bis not distinct from active_(kind|id)\b/.test(s)
                && !/(active_kind|active_id)\s*<>\s*/.test(s),
    'the switch test uses <> (or a negated distinct) instead of `is distinct from` — active_id is NULLABLE and '
    + 'combat->idle is precisely a transition TO null, where <> answers NULL and the CASE falls through to '
    + '"do not stamp". That is the bug, restored'],
  /* THE WHOLE PREDICATE HEAD, not just the restart term: the UNPATCHED anchor
     this section feeds to `replace()` also contains the restart term, so an
     `includes` of that alone would still pass with the disjunct deleted from the
     REPLACEMENT — the guard would be reading the bug it is meant to remove. */
  ['apply', (s) => s.includes("active_since = case when coalesce((v_act->>'restart')::boolean, false)\n"
                            + "                                 or coalesce(v_act->>'kind', active_kind)"),
    'the restart disjunct was dropped from hr_apply — a SAME-activity restart (chop the same tree again) is a '
    + 'switch no difference test can see, and it would stop re-stamping'],
  ['apply', (s) => s.includes('then now() else active_since end,') && !/active_since = case[^;]*p_delta/.test(s),
    'hr_apply no longer stamps active_since from the SERVER CLOCK, or it reads p_delta directly in that arm — '
    + 'the caller would choose when it stopped fighting'],
  ['apply', (s) => s.includes('pg_get_functiondef') && !/\bcreate\s+or\s+replace\s+function\s+public\.hr_apply/i.test(s),
    'the hr_apply patch has become a `create or replace` restatement — hr_apply is built by TEN files and this '
    + "one would silently take over the derivation chain's last-toucher role and erase whatever it did not copy"],
  ['apply', (s) => s.includes("strpos(v_def, 'SECURITY F1 - THE ACTIVITY SWITCH STAMP') > 0"),
    'the hr_apply patch is not guarded by its own marker — it would double-insert on a re-apply and the migration '
    + 'would stop being idempotent'],
  ['pre', (s) => s.includes("to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null")
              && s.includes('hr_apply: the active_since arm is missing or ambiguous'),
    'the preconditions do not assert hr_apply and its exactly-once anchor before writing — a replace() whose '
    + 'anchor is absent is a SILENT no-op that leaves the migration reporting success with the stamp unshipped'],
  ['check', (s) => s.includes("if strpos(v_a, 'SECURITY F1 - THE ACTIVITY SWITCH STAMP') = 0 then")
                && s.includes('F1 self-check (p2)'),
    'the self-check no longer proves on APPLY that hr_apply carries the stamp, or no longer EVALUATES the '
    + 'predicate\'s five cases — the combat->idle case in particular is a property text-matching cannot prove'],

  // ── THE HALF-STATE GUARD (§0) ───────────────────────────────────────────
  ['pre', (s) => s.includes("strpos(v_k, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then")
              && s.includes("strpos(v_x, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then"),
    'the preconditions no longer FAIL CLOSED on a body that carries arm 1 but not arm 2 — an earlier revision of '
    + 'this file rewrote the anchors arm 2 needs, so a blind re-run would half-patch and report success'],
  ['pre', (s) => s.includes("column_name='active_since'"),
    'the preconditions no longer require player_state.active_since — without it the end-cap is decoration'],
];

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   Each plants a REAL defect. --selftest demands every one turns the run RED; a
   guard that cannot be made to fail is not a guard. The first two are THE named
   mutation the brief asks for: strip the floor from one body at a time. */
const MUTATIONS = {
  strip_floor_kills_free: {
    why: 'the BOUNTY-FREE window floor is stripped out of hr_credit_kills__ungated — a modified client that keeps '
       + 'polling through a knockout is paid the whole window the moment the short-circuit stops firing',
    find: '    v_anchor := greatest(v_anchor, least(coalesce(v_recovering, v_anchor), now()));',
    repl: '    v_anchor := greatest(v_anchor, v_anchor);',
  },
  strip_floor_kills_bounty: {
    why: 'the BOUNTY window floor is stripped — a bounty accepted before the fall is capped against accepted_at, '
       + 'so the knockout is paid at the physical cap',
    find: 'greatest(v_ab.accepted_at, least(coalesce(v_recovering, v_ab.accepted_at), now()))',
    repl: 'v_ab.accepted_at',
  },
  strip_floor_xp: {
    why: 'the combat-XP watermark floor is stripped — the RANKED leaderboard number is paid for time the '
       + 'character spent face-down. This is the exact defect Security F1 names.',
    find: '  v_wm := greatest(v_wm, least(coalesce(v_recovering, v_wm), now()));',
    repl: '  v_wm := greatest(v_wm, v_wm);',
  },
  kills_short_circuit_off: {
    why: 'the kills knocked-out short-circuit is disarmed — the call runs on, appends to hr_kill_credit_log and '
       + 'advances the bounty-free anchor across a window nobody paid for',
    find: '  if v_recovering is not null and now() < v_recovering then\n    -- CREDIT ZERO',
    repl: '  if false then\n    -- CREDIT ZERO',
  },
  xp_short_circuit_off: {
    why: 'the combat-XP short-circuit is disarmed — the body reaches `combat_xp_accrued_to = now()` and RETIRES '
       + 'the whole knockout window unpaid, so the player is charged for the time the floor refused to credit',
    find: '  if v_recovering is not null and now() < v_recovering then\n    -- ONE LEDGER ROW',
    repl: '  if false then\n    -- ONE LEDGER ROW',
  },
  kills_credits_claim: {
    why: 'the kills recovering receipt returns the CLAIMED figure as credited — the refusal reports a payment it '
       + 'did not make, and any reader of the receipt (the client bar, a support answer) believes it',
    find: "    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,\n      'credit', 0, 'claimed', v_claimed, 'cap', 0",
    repl: "    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', v_claimed,\n      'credit', v_claimed, 'claimed', v_claimed, 'cap', v_claimed",
  },
  xp_reason_dropped: {
    why: 'the combat-XP refusal stops naming itself — a zero credit while knocked out becomes indistinguishable '
       + 'from an ordinary throttle, and the one signal a client or a support answer could key on is gone',
    find: "      'reason', 'recovering', 'recovering_until', v_recovering);\n  end if;",
    repl: '      \'recovering_until\', v_recovering);\n  end if;',
  },
  floor_reads_parameter: {
    why: 'the kills floor takes its recovery line from a PARAMETER instead of the server column — the client '
       + 'would choose the length of its own punishment, which is the whole failure class server authority exists for',
    find: '  select recovering_until, active_kind, active_since\n'
        + '    into v_recovering, v_active_kind, v_active_since\n'
        + '    from public.player_state where user_id = v_uid and slot = v_slot;',
    repl: '  v_recovering := (p_target)::text::timestamptz;',
  },
  position_check_removed: {
    why: 'the self-check stops proving that the combat-XP short-circuit returns BEFORE the watermark stamp — the '
       + 'one property no amount of text-matching can recover once it is gone',
    find: "  v_write := strpos(v_x, 'set combat_xp_accrued_to = now()');\n  if v_ret = 0 or v_write = 0 or v_ret >= v_write then",
    repl: "  v_write := strpos(v_x, 'set combat_xp_accrued_to = now()');\n  if false then",
  },
  self_check_one_body_only: {
    why: 'the self-check stops asserting the marker in the combat-XP body, so a patch that no-oped on that body '
       + 'would apply, self-check GREEN, and leave the ranked surface wide open',
    find: "  if strpos(v_x, 'SECURITY F1 - THE RECOVERY FLOOR') = 0 then\n    raise exception 'F1 self-check (a): hr_credit_combat_xp__ungated does not carry the recovery floor';\n  end if;",
    repl: '',
  },
  audit_row_unbounded: {
    why: 'the kills recovering audit row loses its one-per-UTC-day bound — a 64-minute knockout at the 60 s '
       + 'cadence files a ledger row per poll, per player, which is journal rule 6 broken at ledger scale',
    find: "    if not exists (select 1 from public.player_ledger\n                    where user_id = v_uid and slot = v_slot\n                      and intent = 'kill_credit_while_recovering'\n                      and at >= public.hr_utc_day_start(now())) then",
    repl: '    if true then',
  },
  audit_row_moves_value: {
    why: 'the combat-XP recovering audit row starts stamping xp_in — a refusal that moves NO value would enter '
       + 'hr_day_budget_used and every conservation sum, and would eat the player\'s real daily budget',
    find: "        (v_uid, v_slot, 'combat', 'xp_credit_while_recovering', 0, 0, 0, 0,",
    repl: "        (v_uid, v_slot, 'combat', 'xp_credit_while_recovering', 0, 0, v_cap, 0,",
  },
  restated_body: {
    why: 'the kills patch is rewritten as a `create or replace` restatement — it would compile, self-check green '
       + "and SILENTLY DELETE 2026-09-02-renown-kill-faucet.sql's credited counters, the single most destructive "
       + 'statement available in this tree',
    find: '  v_def := pg_get_functiondef(\'public.hr_credit_kills__ungated(int,text,bigint,text)\'::regprocedure);',
    repl: '  v_def := \'create or replace function public.hr_credit_kills__ungated(p_slot int, p_target text, p_claimed bigint, p_idem text) returns jsonb language plpgsql as $x$ begin return null; end $x$;\';',
  },
  marker_guard_removed: {
    why: 'the combat-XP patch loses its own-marker guard, so a re-apply double-inserts the block and the '
       + 'migration stops being idempotent',
    find: "    if strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then\n    raise notice 'hr_credit_combat_xp__ungated already carries the recovery floor",
    repl: "    if false then\n    raise notice 'hr_credit_combat_xp__ungated already carries the recovery floor",
  },
};
/* ── ARM 2 MUTATIONS. The brief's two named shapes, in both bodies: strip the
   arm from one body, and make it PAY after the switch. ────────────────────── */
Object.assign(MUTATIONS, {
  strip_endcap_xp: {
    why: 'the combat-XP window END goes back to now() — the arm PAYS AFTER THE SWITCH again, which is exactly '
       + 'the live 2026-09-06 11:41:38 row (40 XP over 52742 ms with active_kind idle) and it is the RANKED '
       + 'leaderboard number',
    find: 'v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end - v_wm)) * 1000)::bigint);',
    repl: 'v_elapsed := greatest(0, floor(extract(epoch from (now() - v_wm)) * 1000)::bigint);',
  },
  strip_endcap_kills_free: {
    why: 'the BOUNTY-FREE window END goes back to now() — a client that keeps reporting kills after it leaves '
       + 'combat is paid at the physical cap into the daily ev:kill_any row hr_claim_daily PAYS against',
    find: '    v_elapsed := least(c_free_window_ms,\n'
        + '                       greatest(0, floor(extract(epoch from (v_combat_end - v_anchor)) * 1000)::bigint));',
    repl: '    v_elapsed := least(c_free_window_ms,\n'
        + '                       greatest(0, floor(extract(epoch from (now() - v_anchor)) * 1000)::bigint));',
  },
  strip_endcap_kills_bounty: {
    why: 'the BOUNTY window END goes back to now() — a bounty accepted before the player stopped fighting keeps '
       + 'billing wall time into a RANKED counter (hr_renown_of grades ev:kill_monster:*)',
    find: 'v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end -',
    repl: 'v_elapsed := greatest(0, floor(extract(epoch from (now() -',
  },
  strip_arm2_from_xp_body: {
    why: 'the ENTIRE not-in-combat arm is stripped out of the combat-XP body while the kills body keeps it — the '
       + 'exact half-patch shape the self-check has to catch per body, and it would leave the ranked surface open',
    find: "  v_combat_end := case when v_active_kind is distinct from 'combat'\n"
        + "                       then least(now(), coalesce(v_active_since, 'epoch'::timestamptz))\n"
        + '                       else now() end;$anc$);',
    repl: '  v_combat_end := now();$anc$);',
  },
  xp_nic_short_circuit_off: {
    why: 'the combat-XP not-in-combat short-circuit is disarmed — a zero-length post-switch window stops being '
       + 'NAMED, so the one signal a support answer or an abuse query could key on disappears',
    find: "  if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then\n    -- ONE VALUE-FREE LEDGER ROW",
    repl: '  if false then\n    -- ONE VALUE-FREE LEDGER ROW',
  },
  kills_nic_short_circuit_off: {
    why: 'the kills not-in-combat short-circuit is disarmed — the call runs on and APPENDS to hr_kill_credit_log, '
       + 'advancing the bounty-free anchor across a window nobody paid for',
    find: "  if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then\n    if v_free then",
    repl: '  if false then\n    if v_free then',
  },
  endcap_fails_open_on_null: {
    why: 'a NULL active_since stops failing closed — a row that cannot say when the character stopped fighting '
       + 'gets to bill the whole window, against accrual.js SKIP.NO_ACTIVE_SINCE, which is the house rule',
    find: "coalesce(v_active_since, 'epoch'::timestamptz)",
    repl: 'coalesce(v_active_since, now())',
  },
  endcap_reads_parameter: {
    why: 'the combat-XP end-cap overwrites the server-read switch instant with a PARAMETER — the client would '
       + 'choose when it stopped fighting, which is the whole failure class server authority exists for',
    find: "  v_combat_end := case when v_active_kind is distinct from 'combat'",
    repl: "  v_active_since := (p_xp->>'since')::timestamptz;\n"
        + "  v_combat_end := case when v_active_kind is distinct from 'combat'",
  },
  endcap_evaluation_removed: {
    why: 'the self-check stops EVALUATING the end-cap arithmetic — the straddle case (pay only the pre-switch '
       + 'part) and the in-combat no-op are properties no amount of text-matching can recover once the '
       + 'evaluation is gone',
    find: "    raise exception 'F1 self-check (o1)",
    repl: "    raise exception 'F1 self-check (disabled o1)",
  },
  half_state_guard_removed: {
    why: 'the §0 half-state guard is removed, so a database patched by the EARLIER revision of this file (arm 1 '
       + 'only) would be re-run against anchors that no longer exist and end up half-patched, GREEN',
    find: "  if strpos(v_k, 'SECURITY F1 - THE RECOVERY FLOOR') > 0\n"
        + "     and strpos(v_k, 'SECURITY F1 - THE NOT-IN-COMBAT CAP') = 0 then",
    repl: '  if false then',
  },
  kills_nic_credits_claim: {
    why: 'the kills not-in-combat receipt returns the CLAIMED figure as credited — the refusal reports a payment '
       + 'it did not make, and the client bar, a support answer and any log reader all believe it',
    find: "    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', 0,\n"
        + "      'credit', 0, 'claimed', v_claimed, 'cap', 0, 'throttled', false,\n"
        + "      'bounty', not v_free, 'day', v_day, 'slot', v_slot,\n"
        + "      'reason', 'not_in_combat'",
    repl: "    v_out := jsonb_build_object('ok', true, 'target', p_target, 'credited', v_claimed,\n"
        + "      'credit', v_claimed, 'claimed', v_claimed, 'cap', v_claimed, 'throttled', false,\n"
        + "      'bounty', not v_free, 'day', v_day, 'slot', v_slot,\n"
        + "      'reason', 'not_in_combat'",
  },
  nic_audit_row_moves_value: {
    why: 'the combat-XP not-in-combat audit row starts stamping xp_in — a refusal that moves NO value would '
       + "enter hr_day_budget_used and every conservation sum, and would eat the player's real daily budget",
    find: "        (v_uid, v_slot, 'combat', 'xp_credit_not_in_combat', 0, 0, 0, 0,",
    repl: "        (v_uid, v_slot, 'combat', 'xp_credit_not_in_combat', 0, 0, v_cap, 0,",
  },
  nic_audit_row_unbounded: {
    why: 'the kills not-in-combat audit row loses its one-per-UTC-day bound — an idle client on the 60 s cadence '
       + 'files a ledger row per poll, per player, which is journal rule 6 broken at ledger scale',
    find: "                      and intent = 'kill_credit_not_in_combat'\n"
        + '                      and at >= public.hr_utc_day_start(now())) then',
    repl: '                      and false) then',
  },
});

/* ── ARM 2's DEPENDENCY: the active_since stamp. THE BRIEF'S NAMED MUTATION —
   "an activity write that CHANGES KIND leaves active_since behind" → RED. ─── */
Object.assign(MUTATIONS, {
  stale_active_since_on_kind_change: {
    why: 'an activity write that CHANGES KIND leaves active_since behind — hr_apply goes back to stamping on the '
       + "client's `restart` flag alone, so a SERVER auto-stop (accrual.js emits {kind:'idle', id:null} with no "
       + 'flag) leaves the column at the start of the FIGHT. The end-cap then reads that as the moment the '
       + 'character stopped fighting and ZEROES every attended credit until the next client declare — measured '
       + 'live on 12 of 36 characters',
    find: "                                 or coalesce(v_act->>'kind', active_kind) is distinct from active_kind\n",
    repl: '',
  },
  stale_active_since_on_id_change: {
    why: 'a same-kind TARGET change (goblin -> rat) stops stamping active_since, so the window end is the '
       + "previous target's start instant and a long first fight silently caps every credit on the second",
    find: '                                 or (case when v_act ? \'kind\'\n'
        + '                                          then nullif(v_act->>\'id\',\'\') else active_id end)\n'
        + '                                    is distinct from active_id\n',
    repl: '',
  },
  switch_test_uses_not_equal: {
    why: 'the switch test becomes `<>` instead of `is distinct from` — active_id is NULLABLE and combat->idle is '
       + 'a transition TO null, where <> answers NULL and the CASE falls through to "do not stamp". The most '
       + 'plausible way this fix dies while still looking present',
    find: "or coalesce(v_act->>'kind', active_kind) is distinct from active_kind",
    repl: "or coalesce(v_act->>'kind', active_kind) <> active_kind",
  },
  apply_restart_disjunct_dropped: {
    why: 'the `restart` disjunct is dropped from hr_apply — a SAME-activity restart is a switch no difference '
       + 'test can see, so chopping the same tree again would keep the old active_since forever',
    find: "           active_since = case when coalesce((v_act->>'restart')::boolean, false)\n"
        + "                                 or coalesce(v_act->>'kind', active_kind)",
    repl: "           active_since = case when coalesce(v_act->>'kind', active_kind)",
  },
  apply_marker_guard_removed: {
    why: 'the hr_apply patch loses its own-marker guard, so a re-apply double-inserts the disjuncts and the '
       + 'migration stops being idempotent',
    find: "  if strpos(v_def, 'SECURITY F1 - THE ACTIVITY SWITCH STAMP') > 0 then",
    repl: '  if false then',
  },
  apply_predicate_evaluation_removed: {
    why: 'the self-check stops EVALUATING the stamp predicate, so the combat->idle case (the only one that '
       + 'distinguishes `is distinct from` from `<>`) is no longer proven by arithmetic on apply',
    find: "    raise exception 'F1 self-check (p2)",
    repl: "    raise exception 'F1 self-check (disabled p2)",
  },
  apply_precondition_anchor_removed: {
    why: 'the §0 exactly-once anchor assertion for hr_apply is removed — a replace() whose anchor has moved is a '
       + 'SILENT no-op, and the migration would report success with the stamp unshipped and the end-cap live',
    find: "    if v_n <> 1 then raise exception 'hr_apply: the active_since arm is missing or ambiguous (%) — apply 2026-08-25-workers.sql first', v_n; end if;",
    repl: '',
  },
});

/* ── ARM 3's MUTATIONS. The brief's two named shapes first: STRIP THE FLOOR,
   and ALLOW NULL WHILE THE LINE IS ACTIVE. Both must go RED. ─────────────── */
Object.assign(MUTATIONS, {
  shortening_floor_stripped: {
    why: 'the no-shortening floor is stripped out of hr_apply — a settle carrying an EARLIER recovering_until '
       + 'rewrites a 60-minute knockout to nothing, the column arms 1 and 2 are built on goes stale, and the '
       + 'Recovery Rule becomes advisory. This is the gap exactly as the read-only review found it',
    find: '      if v_st.recovering_until is not null\n'
        + '         and v_st.recovering_until > now()\n'
        + '         and (v_recover is null or v_recover < v_st.recovering_until) then\n',
    repl: '      if false then\n',
  },
  null_cancel_allowed_while_active: {
    why: 'the floor stops refusing a NULL proposal while the line is still running — the outright CANCEL, which '
       + 'is the most valuable forgery of the three and the one a predicate written as `v_recover < stored` '
       + 'lets through by answering NULL',
    find: '         and (v_recover is null or v_recover < v_st.recovering_until) then',
    repl: '         and (v_recover < v_st.recovering_until) then',
  },
  floor_blocks_expired_clear: {
    why: 'the floor drops its `stored > now()` arm and judges ANY non-null stored line — an EXPIRED knockout '
       + 'could then never be cleared by a settle, so a character who served their time stays face-down '
       + 'forever. The most plausible way this fix becomes worse than the hole',
    find: '         and v_st.recovering_until > now()\n',
    repl: '',
  },
  floor_blocks_raise_forward: {
    why: 'the floor refuses any DIFFERENT instant instead of an EARLIER one — a second death inside the window '
       + 'could not extend the knockout, so dying again would be strictly better than not, and every honest '
       + 'settle that re-states a raised line would 409',
    find: 'or v_recover < v_st.recovering_until) then',
    repl: 'or v_recover is distinct from v_st.recovering_until) then',
  },
  floor_clamps_instead_of_refusing: {
    why: 'the floor silently CLAMPS the proposal up to the stored line instead of refusing it — a compromised '
       + 'engine gets a 200 for a forged delta, nothing reaches the rejection journal, and the abuse signal '
       + 'that makes this detectable disappears',
    find: '        perform public.hr_reject(\'bad_recovering\',\n'
        + '          jsonb_build_object(\'why\', \'would shorten an active knockout\',',
    repl: '        v_recover := greatest(v_recover, v_st.recovering_until);\n'
        + '        perform public.hr_noop(\'bad_recovering\',\n'
        + '          jsonb_build_object(\'why\', \'clamped an active knockout\',',
  },
  floor_marker_guard_removed: {
    why: 'the §3c patch loses its own-marker guard, so a re-apply double-inserts the refusal into hr_apply and '
       + 'the migration stops being idempotent — the property an operator relies on when a run half-fails',
    find: "  if strpos(v_def, 'SECURITY F1 - THE NO-SHORTENING FLOOR') > 0 then",
    repl: '  if false then',
  },
  floor_precondition_anchor_removed: {
    why: 'the §0 exactly-once anchor assertion for the §3c insert is removed — a replace() whose anchor has '
       + 'moved is a SILENT no-op, and the migration would report success with the floor unshipped while arms 1 '
       + 'and 2 go live on a column anyone can zero',
    find: "    if v_n <> 1 then raise exception 'hr_apply: the (4a-v) ceiling tail is missing or ambiguous (%) — apply 2026-09-06-recovering-until.sql first', v_n; end if;",
    repl: '',
  },
  hr_rest_precondition_removed: {
    why: '§0 stops requiring hr_rest, so on a chain where the cure is absent §4b(d) cannot distinguish "the '
       + 'floor blocks the cure" from "there was no cure to run" — and the migration would pass',
    find: "  if to_regprocedure('public.hr_rest(int,uuid)') is null then",
    repl: '  if false then',
  },
  executed_probe_downgraded_to_notice: {
    why: 'the §4b probe observes hr_apply accepting an EARLIER line and merely NOTICES it — the harness runs, '
       + 'the exploit is measured, and the migration reports success anyway. A self-check that cannot fail is '
       + 'the most expensive kind of green',
    find: "      raise exception 'F1 §4b(a): hr_apply ACCEPTED an EARLIER recovering_until",
    repl: "      raise notice 'F1 §4b(a): hr_apply ACCEPTED an EARLIER recovering_until",
  },
  executed_probe_rest_arm_removed: {
    why: '§4b stops EXECUTING hr_rest after the floor ships — the claim "the sanctioned cure writes '
       + 'player_state directly and never meets the floor" goes back to being an argument, and the failure it '
       + 'guards against is a knockout nobody can end',
    find: "      raise exception 'F1 §4b(d): hr_rest FAILED after the floor shipped",
    repl: "      raise notice 'F1 §4b(d): hr_rest FAILED after the floor shipped",
  },
  executed_probe_leak_check_removed: {
    why: '§4b loses the rollback proof, so a probe that COMMITTED would write a throwaway character and its '
       + 'ledger rows into production as a side effect of verifying the migration',
    find: "    raise exception 'F1 §4b LEAKED a player_state row';",
    repl: '    null;',
  },
  selfcheck_q_removed: {
    why: 'the apply-time self-check stops asserting the floor, so a later restatement of hr_apply that drops it '
       + 'would apply clean and green — this is exactly how the 2026-09-06 ceiling-only gap survived',
    find: "    raise exception 'F1 self-check (q): hr_apply does not refuse to shorten a running knockout",
    repl: "    raise exception 'F1 self-check (disabled q): hr_apply does not refuse to shorten a running knockout",
  },
});

/* `marker_guard_removed`'s find must match the file's real indentation. */
MUTATIONS.marker_guard_removed.find =
  "  if strpos(v_def, 'SECURITY F1 - THE RECOVERY FLOOR') > 0 then\n"
  + "    raise notice 'hr_credit_combat_xp__ungated already carries the recovery floor";
MUTATIONS.marker_guard_removed.repl =
  '  if false then\n'
  + "    raise notice 'hr_credit_combat_xp__ungated already carries the recovery floor";

// ── THE RUN ────────────────────────────────────────────────────────────────
function load(mutate) {
  let text;
  try { text = readFileSync(MIG, 'utf8'); }
  catch { throw harness(`${FILE} is missing — Security F1 is not fixed at all`); }
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) throw harness(`unknown mutation '${mutate}' (see --list)`);
    /* A mutation whose anchor no longer matches would "pass" by planting
       nothing, and the guard would look non-vacuous while proving nothing. */
    if (!text.includes(m.find)) {
      throw harness(`mutation '${mutate}' did not match — its anchor has moved in ${FILE}. `
        + 'Repair the mutation; do NOT drop it.');
    }
    text = text.replace(m.find, m.repl);
  }
  return text;
}

function runStatic(text) {
  const sec = sections(text);
  for (const [name, pred, why] of CHECKS) ok(pred(sec[name]), `[${name}] ${why}`);

  // The apply order must ACCOUNT for the file, or a rebuilt database — the
  // disaster-recovery contract — silently omits the fix.
  let order;
  try { order = JSON.parse(readFileSync(ORDER_FILE, 'utf8')); }
  catch { throw harness('tests/schema-apply-order.json is unreadable'); }
  const idx = order.order.indexOf(FILE);
  ok(idx >= 0, `${FILE} is not in tests/schema-apply-order.json 'order' — a rebuilt database would not carry the floor`);
  const prev = order.order.indexOf('2026-09-06-recovering-until.sql');
  ok(prev >= 0 && idx > prev,
    'the floor is ordered BEFORE 2026-09-06-recovering-until.sql — player_state.recovering_until would not exist yet '
    + 'and the migration fails closed');
  const note = (order._order_notes || {})[FILE] || '';
  ok(/STAGED, NOT APPLIED|APPLIED/.test(note),
    `${FILE} has no deployment claim in _order_notes — the record an operator reads to decide what still has to be run is silent about it`);
}

async function runReplay() {
  /* The half text cannot see: the ORDERING of the return against the writes,
     read off the bodies the real ordered chain actually builds. */
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay({});
  const def = async (sig) =>
    (await db.query(`select pg_get_functiondef('${sig}'::regprocedure) d`)).rows[0].d;

  const k = await def('public.hr_credit_kills__ungated(int,text,bigint,text)');
  const x = await def('public.hr_credit_combat_xp__ungated(int,jsonb,text)');

  ok(k.includes('SECURITY F1 - THE RECOVERY FLOOR'), 'replay: the LIVE kills body does not carry the floor');
  ok(x.includes('SECURITY F1 - THE RECOVERY FLOOR'), 'replay: the LIVE combat-XP body does not carry the floor');
  ok(k.includes('SECURITY F1 - THE NOT-IN-COMBAT CAP'), 'replay: the LIVE kills body does not carry the not-in-combat cap');
  ok(x.includes('SECURITY F1 - THE NOT-IN-COMBAT CAP'), 'replay: the LIVE combat-XP body does not carry the not-in-combat cap');
  /* The three windows, read off the bodies the ORDERED CHAIN actually builds —
     which is the only place a patch that no-oped against a moved anchor shows
     up, because a no-oped `replace()` leaves the file looking perfect. */
  ok(k.includes('(v_combat_end - v_anchor)'), 'replay: the LIVE bounty-free window does not end at v_combat_end');
  ok(k.includes('v_elapsed := greatest(0, floor(extract(epoch from (v_combat_end -'),
    'replay: the LIVE bounty window does not end at v_combat_end');
  ok(x.includes('(v_combat_end - v_wm)'), 'replay: the LIVE combat-XP window does not end at v_combat_end');
  for (const [name, body] of [['kills', k], ['combat-XP', x]]) {
    ok(body.includes("v_combat_end := case when v_active_kind is distinct from 'combat'")
       && body.includes("coalesce(v_active_since, 'epoch'::timestamptz)"),
      `replay: the LIVE ${name} body does not derive the window end from the server activity pointer, fail-closed`);
    ok(body.includes("if v_elapsed <= 0 and v_active_kind is distinct from 'combat' then"),
      `replay: the LIVE ${name} body has no not-in-combat short-circuit`);
  }
  /* ARM 2's DEPENDENCY, read off the body the ORDERED CHAIN builds. A patch
     that no-oped against a moved anchor leaves this FILE looking perfect. */
  const a = await def('public.hr_apply(uuid,int,bigint,uuid,jsonb)');
  ok(a.includes('SECURITY F1 - THE ACTIVITY SWITCH STAMP'),
    'replay: the LIVE hr_apply does not stamp active_since on a pointer change — the end-cap would read the '
    + 'start of the FIGHT as the moment the character stopped fighting');
  ok(a.includes("or coalesce(v_act->>'kind', active_kind) is distinct from active_kind")
     && a.includes('is distinct from active_id'),
    'replay: the LIVE hr_apply stamp does not test BOTH pointer fields');
  ok(a.includes('workers_accrued_to') && a.includes('streak_day_key') && a.includes('tool_carry'),
    'replay: a predecessor control was ERASED from hr_apply — the patch was not additive');
  /* EVALUATED on the replay database: the predicate itself, including the one
     case only `is distinct from` can see (combat -> idle, an id going NULL). */
  const stamps = async (act, kind, id) => (await db.query(
    `select (coalesce(($1::jsonb->>'restart')::boolean, false)
             or coalesce($1::jsonb->>'kind', $2::text) is distinct from $2::text
             or (case when $1::jsonb ? 'kind' then nullif($1::jsonb->>'id','') else $3::text end)
                is distinct from $3::text) s`,
    [JSON.stringify(act), kind, id])).rows[0].s;
  ok(await stamps({ kind: 'idle', id: null }, 'combat', 'goblin') === true,
    'replay: a server auto-stop (combat -> idle) does NOT stamp active_since — this is the measured live bug '
    + '(12 of 36 characters carry active_since < accrued_to)');
  ok(await stamps({ kind: 'combat', id: 'rat' }, 'combat', 'goblin') === true,
    'replay: a same-kind target change does not stamp active_since');
  ok(await stamps({ kind: 'combat', id: 'goblin' }, 'combat', 'goblin') === false,
    'replay: an UNCHANGED pointer stamps active_since — the column would restart on every settle and the '
    + 'end-cap would shorten every honest window');
  ok(await stamps({ kind: 'combat', id: 'goblin', restart: true }, 'combat', 'goblin') === true,
    'replay: `restart` lost its meaning — a SAME-activity restart is a switch no difference test can see');
  ok(await stamps({}, 'combat', 'goblin') === false,
    'replay: a delta with no activity object stamps active_since');

  /* ARM 3, read off the LIVE body the ordered chain builds. A §3c insert that
     no-oped against a moved anchor leaves the FILE looking perfect — this is
     the only place that shows up. */
  ok(a.includes('SECURITY F1 - THE NO-SHORTENING FLOOR'),
    'replay: the LIVE hr_apply does not refuse to shorten a running knockout — the §3c insert no-oped against a '
    + 'moved anchor and the migration still reported success');
  ok(a.includes('if v_st.recovering_until is not null')
     && a.includes('and v_st.recovering_until > now()')
     && a.includes('and (v_recover is null or v_recover < v_st.recovering_until) then'),
    'replay: the LIVE floor predicate is not the three-clause one — it must refuse NULL as well as an earlier '
    + 'instant, and only while the STORED line is still in the future');
  /* The floor is a GATE, so its position relative to the write is the property.
     Read off the live body, not the file. */
  {
    const g = a.indexOf('SECURITY F1 - THE NO-SHORTENING FLOOR');
    const w = a.indexOf("recovering_until = case when p_delta ? 'recovering_until'");
    ok(g > 0 && w > 0 && g < w,
      `replay: the LIVE floor is sited AFTER the SET clause (floor ${g}, write ${w}) — it would be a comment on a write that already happened`);
    const c = a.indexOf("'why', 'too far ahead'");
    ok(c > 0 && g > c,
      'replay: the LIVE floor is sited BEFORE the ceiling — a garbage instant must be refused as garbage first');
  }
  /* EVALUATED on the replay database: the predicate's five cases as the same
     boolean arithmetic hr_apply runs. (stored, proposed) -> refuse? */
  const refuses = async (stored, proposed) => (await db.query(
    `select ($1::timestamptz is not null and $1::timestamptz > now()
             and ($2::timestamptz is null or $2::timestamptz < $1::timestamptz)) r`,
    [stored, proposed])).rows[0].r;
  const A = (min) => new Date(Date.now() + min * 60000).toISOString();
  ok(await refuses(A(30), A(5)) === true,
    'replay: an EARLIER proposal against a running line is not refused — the knockout is forgeable down to nothing');
  ok(await refuses(A(30), null) === true,
    'replay: a NULL proposal against a running line is not refused — the outright CANCEL is the whole exploit');
  ok(await refuses(A(30), A(30)) === false,
    'replay: an EQUAL proposal is refused — every honest settle during a knockout would 409');
  ok(await refuses(A(30), A(40)) === false,
    'replay: a LATER proposal is refused — a second death could not extend the window');
  ok(await refuses(A(-1), null) === false,
    'replay: clearing an EXPIRED line is refused — a served knockout would never end');
  ok(await refuses(null, A(30)) === false,
    'replay: a healthy character (stored NULL) cannot be knocked out at all — the floor must not judge a first death');
  /* THE SANCTIONED CURE SURVIVES, read off the chain's own hr_rest. */
  const rest = await def('public.hr_rest(int,uuid)');
  ok(rest.includes('recovering_until = null'),
    'replay: hr_rest no longer clears recovering_until — with the floor in place a knockout would be permanent');
  ok(!/hr_apply\s*\(/.test(rest),
    'replay: hr_rest now routes its cure THROUGH hr_apply — it would meet the no-shortening floor and be refused, '
    + 'and the paid cure would stop working');

  ok(k.includes('kill_credited'), 'replay: the renown credited counters were ERASED from the kills body');
  ok(k.includes('kills_stat') && k.includes('daily_kill_settle_absorbed'),
    'replay: a kill-daily-credit control was erased from the kills body');

  const before = (body, ret, write, what) => {
    const a = body.indexOf(ret), b = body.indexOf(write);
    ok(a > 0 && b > 0 && a < b,
      `replay: the short-circuit does not return BEFORE ${what} (ret ${a}, write ${b}) — a refused knockout would `
      + 'be retired unpaid');
  };
  const RET = "'reason', 'recovering', 'recovering_until', v_recovering);";
  before(x, RET, 'set combat_xp_accrued_to = now()', 'the combat-XP watermark stamp');
  before(x, RET, 'update public.player_skills set xp = xp + v_credit', 'the skill credit');
  before(x, RET, 'insert into public.hr_combat_xp_credit_log', 'the combat-XP idempotency append');
  before(k, RET, 'insert into public.hr_kill_credit_log', 'the kill credit-log append');
  before(k, RET, 'insert into public.player_progress as p', 'the kill progress writes');

  /* The SAME five proofs for the not-in-combat arm. It is the same hazard: a
     refusal that reached a write would retire a window nobody paid for. */
  const RET2 = "'reason', 'not_in_combat', 'active_kind', v_active_kind);";
  before(x, RET2, 'set combat_xp_accrued_to = now()', 'the combat-XP watermark stamp (not-in-combat arm)');
  before(x, RET2, 'update public.player_skills set xp = xp + v_credit', 'the skill credit (not-in-combat arm)');
  before(x, RET2, 'insert into public.hr_combat_xp_credit_log', 'the combat-XP idempotency append (not-in-combat arm)');
  before(k, RET2, 'insert into public.hr_kill_credit_log', 'the kill credit-log append (not-in-combat arm)');
  before(k, RET2, 'insert into public.player_progress as p', 'the kill progress writes (not-in-combat arm)');

  /* EVALUATED on the replay database: the end-cap arithmetic itself, against the
     REAL caps. o1 is the live 2026-09-06 row (a window wholly after the switch);
     o2 is the honest post-fight flush (a window straddling it); o4 is the
     property that keeps this arm from taxing ordinary attended play. */
  const cap = `least(now(), coalesce($1::timestamptz, 'epoch'::timestamptz))`;
  const ms = `greatest(0, floor(extract(epoch from (${cap} - $2::timestamptz)) * 1000)::bigint)`;
  const price = async (sw, t0) =>
    Number((await db.query(`select ${ms} m, public.hr_combat_xp_cap(99, ${ms}) c`, [sw, t0])).rows[0].m);
  const capOf = async (sw, t0) =>
    Number((await db.query(`select public.hr_combat_xp_cap(99, ${ms}) c`, [sw, t0])).rows[0].c);
  const T = (min) => new Date(Date.now() - min * 60000).toISOString();
  ok(await price(T(5), T(2)) === 0 && await capOf(T(5), T(2)) === 0,
    'replay(o1): a window ENTIRELY AFTER the switch out of combat still prices time — the live 2026-09-06 '
    + '11:41:38 credit (40 XP over 52742 ms with active_kind idle) would still be paid');
  const straddle = await price(T(5), T(8));
  ok(straddle >= 179000 && straddle <= 181000,
    `replay(o2): a window STRADDLING the switch priced ${straddle} ms; only its pre-switch 180000 ms is payable`);
  ok(await price(null, T(8)) === 0,
    'replay(o3): a pointer with NO active_since still priced time — it must fail closed (accrual.js SKIP.NO_ACTIVE_SINCE)');
  const inCombat = Number((await db.query(
    "select greatest(0, floor(extract(epoch from (now() - $1::timestamptz)) * 1000)::bigint) m", [T(8)])).rows[0].m);
  ok(inCombat >= 479000 && inCombat <= 481000,
    `replay(o4): an IN-COMBAT window priced ${inCombat} ms — the cap must be a byte-for-byte no-op while the pointer says combat`);

  // The caps must pay nothing for a floored window — evaluated, not asserted.
  const z = await db.query('select public.hr_bounty_kill_cap(500, 99, 0) a, public.hr_combat_xp_cap(99, 0) b');
  ok(Number(z.rows[0].a) === 0 && Number(z.rows[0].b) === 0,
    `replay: a zero-length window still pays (kill ${z.rows[0].a}, xp ${z.rows[0].b}) — flooring would not close the exploit`);

  // No client role may reach either ungated body.
  for (const sig of ['public.hr_credit_kills__ungated(int,text,bigint,text)',
                     'public.hr_credit_combat_xp__ungated(int,jsonb,text)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = await db.query(`select has_function_privilege('${role}', '${sig}', 'execute') p`);
      ok(r.rows[0].p === false, `replay: ${role} can execute ${sig} — the gate and the floor are both decoration`);
    }
  }
}

async function run(mutate, { replay = false } = {}) {
  failed = 0;
  try { runStatic(load(mutate)); }
  catch (e) { if (e.harness) throw e; failed++; console.error(`  FAIL  ${e.message}`); }
  if (replay) await runReplay();
  return failed;
}

// ── CLI ────────────────────────────────────────────────────────────────────
try {
  if (argv.includes('--list')) {
    console.log(`checks (${CHECKS.length}):`);
    for (const [s, , why] of CHECKS) console.log(`  [${s}] ${why.split(' — ')[0]}`);
    console.log(`\nmutations (${Object.keys(MUTATIONS).length}):`);
    for (const [n, m] of Object.entries(MUTATIONS)) console.log(`  ${n}: ${m.why.split(' — ')[0]}`);
    process.exit(0);
  }

  const mIdx = argv.indexOf('--mutate');
  if (mIdx >= 0) {
    const name = argv[mIdx + 1];
    if (!name) throw harness('--mutate needs a mutation name (see --list)');
    const n = await run(name);
    if (n > 0) {
      console.log(`\ncadence-recovery-floor --mutate ${name}: RED, as required — ${MUTATIONS[name].why}`);
      process.exit(0);
    }
    console.error(`\nx --mutate ${name}: STAYED GREEN. The guard does not catch: ${MUTATIONS[name].why}`);
    process.exit(1);
  }

  if (argv.includes('--selftest')) {
    console.log('cadence-recovery-floor --selftest: green first, then every mutation must turn the guard RED');
    if (await run(null) > 0) {
      console.error('  x the UNMUTATED migration is already red — fix that before reading the mutation results');
      process.exit(1);
    }
    let missed = 0;
    for (const name of Object.keys(MUTATIONS)) {
      const n = await run(name);
      if (n > 0) console.log(`  ${name}: RED — ${MUTATIONS[name].why.split(' — ')[0]}`);
      else { missed++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
    if (missed) {
      console.error(`\n${missed} mutation(s) not caught — the guard is not proving what it claims.`);
      process.exit(1);
    }
    console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught across ${CHECKS.length} checks. The guard is non-vacuous.`);
    process.exit(0);
  }

  const replay = argv.includes('--replay');
  const n = await run(null, { replay });
  if (n) { console.error(`\ncadence-recovery-floor: ${n} violation(s).`); process.exit(1); }
  console.log('cadence-recovery-floor: Security F1 is closed — BOTH attended cadence bodies FLOOR their credit '
    + 'window at player_state.recovering_until (the bounty-free anchor, the bounty accepted_at window and the '
    + 'combat-XP watermark) and CAP its END at the moment player_state says the character left combat (so a '
    + 'post-fight flush still pays for pre-switch time and nothing pays for time after it), '
    + 'credit ZERO with a named reason (recovering / not_in_combat), return before every write so no '
    + 'watermark is retired unpaid, patch by anchored insert rather than restatement so no predecessor patch is '
    + 'erased, and file at most one value-free audit row per character per UTC day — and hr_apply STAMPS '
    + 'player_state.active_since on ANY pointer change (not only on the client restart flag), so the column '
    + 'the end-cap reads means what it says even when the SERVER auto-stops the activity, and it REFUSES a '
    + 'delta that would shorten or cancel a RUNNING knockout (null or earlier while the stored line is still '
    + 'in the future) while leaving raise-forward, equality and the clearing of an EXPIRED line legal — with '
    + 'hr_rest, which writes player_state directly and never through hr_apply, still the sanctioned paid cure'
    + (replay ? ' — VERIFIED ON A REBUILT CHAIN, including the return-before-write ordering and the ungated ACL.'
              : '. (Run with --replay to read the same properties off a rebuilt chain.)'));
  process.exit(0);
} catch (e) {
  if (e.harness) { console.error(`cadence-recovery-floor: HARNESS — ${e.message}`); process.exit(2); }
  throw e;
}
