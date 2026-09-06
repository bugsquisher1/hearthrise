#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/cadence-recovery-floor.mjs — SECURITY F1: THE ATTENDED CADENCE RPCs
// MUST FLOOR THEIR CREDIT WINDOW AT `recovering_until`.
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
  kills: ['-- ── 1. hr_credit_kills__ungated — THE RECOVERY FLOOR',
          '-- ── 2. hr_credit_combat_xp__ungated — THE RECOVERY FLOOR'],
  xp:    ['-- ── 2. hr_credit_combat_xp__ungated — THE RECOVERY FLOOR',
          '-- ── 3. GRANTS'],
  check: ['-- ── 4. SELF-CHECK', null],
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

  // ── THE LINE IS THE SERVER'S ────────────────────────────────────────────
  ['kills', (s) => /select\s+recovering_until\s+into\s+v_recovering/.test(s)
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
  ['kills', (s) => s.includes("'credited', 0,") && s.includes("'credit', 0, 'claimed', v_claimed, 'cap', 0"),
    'the kills recovering receipt does not zero EVERY credited quantity (credited / credit / cap)'],
  ['xp', (s) => s.includes("'credited', '{}'::jsonb, 'credit', 0,"),
    'the combat-XP recovering receipt does not zero credited / credit'],
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
                   is spelled identically in all five, so a `s.includes` would still pass
                   with four of them deleted. */
                && (s.match(/v_ret >= v_write/g) || []).length >= 5
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
    find: '  select recovering_until into v_recovering\n    from public.player_state where user_id = v_uid and slot = v_slot;',
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
  console.log('cadence-recovery-floor: Security F1 is closed — BOTH attended cadence bodies floor their credit '
    + 'window at player_state.recovering_until (the bounty-free anchor, the bounty accepted_at window and the '
    + 'combat-XP watermark), credit ZERO with a named reason while the line runs, return before every write so no '
    + 'watermark is retired unpaid, patch by anchored insert rather than restatement so no predecessor patch is '
    + 'erased, and file at most one value-free audit row per character per UTC day'
    + (replay ? ' — VERIFIED ON A REBUILT CHAIN, including the return-before-write ordering and the ungated ACL.'
              : '. (Run with --replay to read the same properties off a rebuilt chain.)'));
  process.exit(0);
} catch (e) {
  if (e.harness) { console.error(`cadence-recovery-floor: HARNESS — ${e.message}`); process.exit(2); }
  throw e;
}
