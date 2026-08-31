#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/companion-codes-severity.mjs — SECURITY RULING C6: THE TWO
//   COMPANION-GRANT REFUSAL CODES JOIN hr_record_rejection's TAXONOMY,
//   MEASURED AGAINST REAL POSTGRESQL.
//
//   node tests/companion-codes-severity.mjs             # the guard
//   node tests/companion-codes-severity.mjs --list      # the mutation catalogue
//   node tests/companion-codes-severity.mjs --selftest  # every planted defect
//                                                       # must be CAUGHT, BY NAME
//
// Ships with: supabase/migrations/2026-09-07-companion-codes-severity.sql
//
// ── THE RULING ──────────────────────────────────────────────────────────
//   unknown_unlock   -> c_incident   : alarm on the FIRST occurrence. It is
//     never player behaviour — hr_companion_grant emits it only when the
//     companion:<id> row is MISSING from public.hr_unlocks, i.e. the storage
//     catalogue has been destroyed again (the b453 wholesale-delete class,
//     which production sat in from 2026-08-23 to 2026-08-30). After the reseed
//     the row set is complete, so the steady state is zero and a
//     first-occurrence alarm is not a noisy detector here.
//   missing_req_item -> c_escalating : the existing 50/user/slot/day. Today
//     only forgeable, but it becomes honestly producible by client/server state
//     divergence the moment dragon_egg exists client-side first. Escalating is
//     safe in both worlds — one is a stale client, fifty in a day is a
//     signature an honest client cannot produce.
//
// ── WHY THIS EXISTS SEPARATELY FROM THE MIGRATION'S OWN §3 ──────────────
// The migration already proves its behaviour at APPLY time in a rolled-back
// subtransaction. That is the house rule and it is not sufficient, for three
// reasons this file is built around:
//
//   1. A gate that lives inside the thing it grades can be removed in the same
//      edit that removes the property. `misfile_*_ungated` below plants exactly
//      that — the classification reversed AND the migration's own assertions
//      for it neutralised — and requires ARM 1 to catch it anyway.
//   2. The migration's §3 speaks in LITERALS. It calls hr_record_rejection with
//      the string 'unknown_unlock' typed into the migration, so it cannot see
//      the code string the VERB emits drifting away from the code string the
//      classifier grades. ARM 2 drives the REAL hr_companion_grant RPC and
//      reads the code back OFF THE ROW the verb wrote (the fixture rule), which
//      is the only thing in the repo that can see that class.
//   3. The migration applies to ONE body shape. Production's copy of
//      hr_record_rejection is comment-stripped and the repo replay's is not
//      (one of the seven live/replay divergences in
//      tests/live-hash-drift.baseline.json, verified CODE-IDENTICAL). ARM 4
//      installs the comment-stripped shape and applies the migration ON TOP OF
//      IT, so "the anchors match on production too" is executed rather than
//      argued.
//
// ── THE FIXTURE RULE (TESTING.md), OBSERVED ─────────────────────────────
//   · ARM 2 reads the rejection CODE and the severity out of public.hr_rejections
//     as the RPC actually wrote them; nothing is assembled from a literal.
//   · Every "stays normal" assertion is paired with something in the SAME run
//     that DOES become an incident, and every "becomes incident" assertion is
//     paired with a control that does NOT. A one-sided classification test is
//     satisfied identically by a classifier that grades everything the same way.
//   · The control code is asserted ABSENT from both arrays before it is used, so
//     it cannot quietly become a member and turn the control vacuous.
//   · The escalation threshold is read from the body's own c_escalate_at rather
//     than hard-coded, so a deliberate retune of the threshold does not turn
//     this guard red with a message pointing at the wrong thing (the b497
//     hard-coded-goal-target lesson).
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · That production has been patched. This is a REVIEW-ONLY migration; the
//     Coordinator applies, and tests/live-hash-drift.mjs --live is what says
//     whether production agrees.
//   · TRUE CONCURRENCY. PGlite is one backend. Nothing here is concurrent: the
//     classification is a pure function of the code string and the row's own n,
//     and the row is upserted under the table's primary key.
//   · Anything about who READS the severity. It is an operator-facing column;
//     no dashboard exists yet, and that is a stated limitation, not a gap this
//     file papers over.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, manifest } from './schema-replay.mjs';

const FIX = '2026-09-07-companion-codes-severity.sql';
const AUTHOR = '2026-08-11-player-state.sql';
const PRED = '2026-09-03-intent-mismatch-escalates.sql';
const HARDEN = '2026-09-06-companion-grant-hardening.sql';

const SIG = 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';

/** A throwaway signed-in character. Distinct from the uuids the migrations use
 *  for their own rolled-back probes (…00c6c6, …c0a91a70, …c0a91a71, …09f5). */
const UID = '00000000-0000-4000-8000-0000c0de5e71';
/** The synthetic-classification probe. No RPC touches it. */
const PID = '00000000-0000-4000-8000-0000c0de5e72';

/** A REAL hr_companion_grant refusal code that is in NEITHER array. */
const CONTROL = 'not_grantable';

const mig = (f) => readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')
  .then((s) => s.replace(/\r\n/g, '\n'));

/* ⚠ ANY ARM THAT APPLIES A MIGRATION BY HAND MUST APPLY THE MUTATED TEXT.
   bootReplay patches only the sources it EXECUTES; two arms below stop or
   restart the chain and then run a file themselves, and reading that file
   straight off disk would hand the UNMUTATED migration to the very arm a defect
   is only visible in. The result is not a miss — it is worse: the disk file,
   applied to a mutated database, fails for a reason that has nothing to do with
   the planted defect, and the mutation reads as CAUGHT by an assertion that was
   measuring something else. Measured while building this file (the re-run arm
   "caught" all three mis-filing mutations this way). */
async function migPatched(file, extra = []) {
  let text = await mig(file);
  for (const [f, pairs] of extra) {
    if (f !== file) continue;
    for (const [find, repl] of pairs) {
      const n = text.split(find).length - 1;
      if (n !== 1) {
        const e = new Error(`patch anchor matched ${n} times in ${file} (need exactly 1)`);
        e.harness = true; throw e;
      }
      text = text.replace(find, () => repl);
    }
  }
  return text;
}

// ── Assertion ledger. Every assertion carries a NAME, because a mutation proof
//    that only counts failures passes when the WRONG assertion fires.
let problems = [];
const ok = (name, cond, msg) => { if (!cond) problems.push({ name, msg }); };
const fired = (name) => problems.some((p) => p.name === name);

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

/** The classification arrays and the threshold, read from the INSTALLED body.
 *  Comments stripped, for the reason the migration gives: the migration injects
 *  comments that NAME both codes, so a raw-text read would let the explanation
 *  stand in for the array element it explains. */
async function classification(db) {
  const r = await one(db,
    `select regexp_replace(replace(pg_get_functiondef('${SIG}'::regprocedure), chr(13), ''),
              '--[^' || chr(10) || ']*', '', 'g') as code`);
  const code = r?.code ?? '';
  const arr = (decl) => {
    const after = code.split(`${decl} constant text[] := array[`)[1];
    if (after === undefined) return null;
    return after.split(']')[0].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter((s) => s !== '');
  };
  const at = /c_escalate_at constant bigint := (\d+);/.exec(code);
  return { incident: arr('c_incident'), escalating: arr('c_escalating'), at: at ? Number(at[1]) : null };
}

/** Record `n` occurrences of `code` in ONE weighted call — the shape the rate
 *  sampler uses (p_count is "how many real events this call represents"). */
const record = (db, uid, code, count) => db.query(
  `select public.hr_record_rejection($1::uuid, 0, 'companion_grant', $2::text, '{}'::jsonb, $3::bigint)`,
  [uid, code, String(count)]);

const rowFor = (db, uid, code) => one(db,
  `select severity, n::text as n from public.hr_rejections
    where user_id = $1::uuid and slot = 0 and day = current_date and code = $2::text`, [uid, code]);

// ════════════════════════════════════════════════════════════════════════
// ARM 1 — the classification itself, driven through the REAL function, with
//   BOTH controls. Independent of the migration's own §3, which can be removed
//   in the same edit that removes the property.
// ════════════════════════════════════════════════════════════════════════
async function armClassification(db) {
  const c = await classification(db);
  ok('shape/arrays-readable', Array.isArray(c.incident) && Array.isArray(c.escalating),
    `could not read the classification arrays out of the installed hr_record_rejection body `
    + `(incident=${JSON.stringify(c.incident)}, escalating=${JSON.stringify(c.escalating)}). Every `
    + 'assertion below would then be measuring nothing.');
  ok('shape/threshold-readable', Number.isFinite(c.at) && c.at > 1,
    `could not read c_escalate_at out of the body (got ${c.at}). The threshold is READ rather than `
    + 'hard-coded so a deliberate retune does not turn this guard red with a message pointing at '
    + 'the wrong thing.');
  if (!Array.isArray(c.incident) || !Array.isArray(c.escalating) || !Number.isFinite(c.at)) return;

  // The control must be in NEITHER array, or every "stays normal" below is
  // satisfied for the wrong reason.
  ok('control/is-in-neither-array',
    !c.incident.includes(CONTROL) && !c.escalating.includes(CONTROL),
    `the control code \`${CONTROL}\` is now IN a classification array `
    + `(incident=${c.incident.includes(CONTROL)}, escalating=${c.escalating.includes(CONTROL)}), so `
    + 'the discrimination controls below prove nothing. Pick a code that is in neither, or this arm '
    + 'is decoration.');

  await db.query('delete from public.hr_rejections where user_id = $1::uuid', [PID]);

  // ── unknown_unlock: THE FIRST OCCURRENCE IS AN INCIDENT ────────────────
  await record(db, PID, 'unknown_unlock', 1);
  const uu1 = await rowFor(db, PID, 'unknown_unlock');
  ok('incident/unknown-unlock-row-written', uu1 != null && Number(uu1.n) === 1,
    `one hr_record_rejection call for unknown_unlock produced ${JSON.stringify(uu1)} — expected a `
    + 'row at n=1. The function swallows every exception (`when others then null`), so a broken '
    + 'body is SILENT; this is read back rather than assumed.');
  ok('incident/unknown-unlock-first-occurrence-is-incident', uu1?.severity === 'incident',
    `the FIRST unknown_unlock was graded "${uu1?.severity}". It is never player behaviour: the verb `
    + 'emits it only when the companion:<id> row is missing from hr_unlocks, i.e. the storage '
    + 'catalogue has been destroyed again. The damage lands on call ONE — every later occurrence is '
    + 'another player who has ALREADY lost a companion — so a threshold would watch fifty of them '
    + 'before it spoke.');
  ok('incident/unknown-unlock-not-escalating',
    c.incident.includes('unknown_unlock') && !c.escalating.includes('unknown_unlock'),
    `unknown_unlock must be in c_incident and NOT in c_escalating; the installed body has `
    + `incident=${c.incident.includes('unknown_unlock')}, `
    + `escalating=${c.escalating.includes('unknown_unlock')}. c_escalate_at counts per (user, slot, `
    + 'day), so a catalogue destroyed on a quiet day would never reach the threshold and the alarm '
    + 'would arrive only if the bug happened to be popular.');

  // ── missing_req_item: ONE IS NOT AN INCIDENT, THE FIFTIETH IS ──────────
  await record(db, PID, 'missing_req_item', 1);
  const mr1 = await rowFor(db, PID, 'missing_req_item');
  ok('escalating/one-occurrence-stays-normal', mr1?.severity === 'normal',
    `ONE missing_req_item was graded "${mr1?.severity}" (n=${mr1?.n}). A single occurrence is a `
    + 'stale client holding an item the server cannot see — state divergence, our content gap, not '
    + 'abuse. THIS IS THE ASSERTION THAT DISTINGUISHES THE TWO RULINGS: a test that only checked '
    + 'the flip at fifty passes identically if the code had been mis-filed into c_incident, where '
    + 'n=1 is already an incident.');

  // …still normal one short of the threshold, and an incident AT it. The
  // threshold comes from the body, not from this file.
  await record(db, PID, 'missing_req_item', c.at - 2);
  const mrEdge = await rowFor(db, PID, 'missing_req_item');
  ok('escalating/below-threshold-stays-normal',
    Number(mrEdge?.n) === c.at - 1 && mrEdge?.severity === 'normal',
    `at n=${mrEdge?.n} (one short of c_escalate_at=${c.at}) missing_req_item is already `
    + `"${mrEdge?.severity}" — the threshold is not where the body says it is.`);

  await record(db, PID, 'missing_req_item', 1);
  const mrHit = await rowFor(db, PID, 'missing_req_item');
  ok('escalating/threshold-is-incident',
    Number(mrHit?.n) === c.at && mrHit?.severity === 'incident',
    `at n=${mrHit?.n} (c_escalate_at=${c.at}) missing_req_item is "${mrHit?.severity}" — the `
    + 'escalation is not wired. Fifty in one day is a signature an honest client cannot produce, '
    + 'and that is the whole reason the row was worth writing.');
  ok('escalating/missing-req-item-not-incident-array',
    c.escalating.includes('missing_req_item') && !c.incident.includes('missing_req_item'),
    `missing_req_item must be in c_escalating and NOT in c_incident; the installed body has `
    + `escalating=${c.escalating.includes('missing_req_item')}, `
    + `incident=${c.incident.includes('missing_req_item')}. First-occurrence 'incident' would file `
    + 'an abuse record against a player for a content gap of ours.');

  // ── THE DISCRIMINATION CONTROL — a code in NEITHER array, at ANY n ─────
  await record(db, PID, CONTROL, 1);
  const ct1 = await rowFor(db, PID, CONTROL);
  ok('control/unclassified-stays-normal-at-one', ct1?.severity === 'normal',
    `the unclassified control code \`${CONTROL}\` was graded "${ct1?.severity}" at n=1. The `
    + 'classifier is not discriminating — every "is an incident" assertion above would pass on a '
    + 'body that graded EVERYTHING an incident.');
  await record(db, PID, CONTROL, c.at * 4);
  const ctN = await rowFor(db, PID, CONTROL);
  ok('control/unclassified-stays-normal-at-any-n',
    Number(ctN?.n) > c.at && ctN?.severity === 'normal',
    `the unclassified control code \`${CONTROL}\` reached n=${ctN?.n} (threshold ${c.at}) and was `
    + `graded "${ctN?.severity}". It is in NEITHER array, so it must never be promoted — if it can `
    + 'be, the escalation assertions above are satisfied by the wrong mechanism.');

  // ── THE RATCHET only goes up (unchanged behaviour, re-proved here because
  //    this file changes which codes reach it).
  await record(db, PID, 'unknown_unlock', 1);
  const uu2 = await rowFor(db, PID, 'unknown_unlock');
  ok('ratchet/never-downgrades', uu2?.severity === 'incident',
    `a second unknown_unlock DOWNGRADED the row to "${uu2?.severity}". Severity ratchets up and is `
    + 'never lowered by a later hit.');

  // ── THE INCUMBENTS. A classification patch that ate a sibling leaves a body
  //    that compiles, installs cleanly, and simply stops alarming.
  for (const code of ['rate_limited', 'own_listing', 'intent_mismatch']) {
    ok(`incumbent/${code}-still-escalating`, c.escalating.includes(code),
      `c_escalating no longer carries \`${code}\` (it holds [${c.escalating.join(', ')}]). Nothing `
      + 'downstream reports an alarm that quietly stopped firing.');
  }
  for (const code of ['gold_clamp', 'seller_unavailable', 'forbidden_impersonation']) {
    ok(`incumbent/${code}-still-incident`, c.incident.includes(code),
      `c_incident no longer carries \`${code}\` (it holds ${c.incident.length} codes) — the patch `
      + 'overwrote more than the closing element.');
  }
}

// ════════════════════════════════════════════════════════════════════════
// ARM 2 — END TO END through the REAL hr_companion_grant RPC.
//   The migration's §3 speaks in literals typed into the migration. This is the
//   only thing in the repo that can see the code string the VERB emits drift
//   away from the code string the CLASSIFIER grades — a rename at either end
//   silently returns both codes to 'normal' forever, under a green suite.
// ════════════════════════════════════════════════════════════════════════
async function armEndToEnd(db) {
  const c = await classification(db);
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub','${UID}',false);`);
  await db.exec('select public.hr_create_character(0);');
  await db.query('delete from public.hr_rejections where user_id = $1::uuid', [UID]);

  // ── (a) unknown_unlock, produced the way the b453 incident produced it:
  //        the catalogue row is gone.
  await db.exec("delete from public.hr_unlocks where unlock_id = 'companion:hawk';");
  const env = (await one(db,
    "select public.hr_companion_grant(0, 'hawk', 'drop:cliffside', gen_random_uuid()) as r"))?.r;
  await db.exec(`insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
                 values ('companion:hawk','companion','max','unlock',1,array[1]::int[])
                 on conflict (unlock_id) do nothing;`);
  ok('e2e/verb-refuses-with-the-machine-code',
    env && env.ok === false && env.error === 'unknown_unlock:companion:hawk',
    `with companion:hawk absent from hr_unlocks the RPC answered ${JSON.stringify(env)}. This arm `
    + 'cannot grade a severity for a refusal that did not happen — fix the hardening first.');

  // READ THE CODE OFF THE ROW THE VERB WROTE. Never a literal: a literal here
  // would make this arm a second copy of the migration's own §3.
  const emitted = await one(db,
    `select code, severity, n::text as n from public.hr_rejections
      where user_id = $1::uuid and intent = 'companion_grant'
      order by last_at desc, code limit 1`, [UID]);
  ok('e2e/refusal-is-journalled', emitted != null,
    'the refused grant wrote no hr_rejections row at all. An unjournalled refusal has no severity '
    + 'to grade and the whole ruling is moot.');
  ok('e2e/unknown-unlock-row-is-incident',
    emitted != null && emitted.severity === 'incident',
    `hr_companion_grant recorded code "${emitted?.code}" at n=${emitted?.n} and it was graded `
    + `"${emitted?.severity}", not "incident". Either the classification is wrong, or the code `
    + 'STRING the verb emits has drifted from the string the classifier grades — which every text '
    + 'anchor in the migration and every literal-driven probe is structurally blind to, and which '
    + 'silently returns a destroyed catalogue to looking like ordinary refusal traffic. The '
    + `classifier holds [${(c.incident || []).join(', ')}].`);

  // ── (b) missing_req_item, produced by the real verb: whelp with no egg.
  await db.exec(`delete from public.player_inventory
                  where user_id = '${UID}' and item_id = 'dragon_egg';`);
  const env2 = (await one(db,
    "select public.hr_companion_grant(0, 'whelp', 'hatch:dragon_egg', gen_random_uuid()) as r"))?.r;
  ok('e2e/req-item-refusal-happens',
    env2 && env2.ok === false && env2.error === 'missing_req_item',
    `whelp without its dragon_egg answered ${JSON.stringify(env2)} — expected missing_req_item.`);
  const mr = await one(db,
    `select code, severity, n::text as n from public.hr_rejections
      where user_id = $1::uuid and intent = 'companion_grant' and code <> $2::text
      order by last_at desc, code limit 1`, [UID, emitted?.code ?? 'unknown_unlock']);
  ok('e2e/req-item-row-starts-normal', mr != null && mr.severity === 'normal',
    `the FIRST real missing_req_item refusal was graded "${mr?.severity}" (code "${mr?.code}"). One `
    + 'is a stale client; grading it an incident files an abuse record against a player for a '
    + 'content gap of ours.');

  // …and the SAME code, sustained, escalates. The code is the one the verb
  // wrote, not one this file typed, so a drifted emit is caught here too.
  if (mr?.code && Number.isFinite(c.at)) {
    await record(db, UID, mr.code, c.at - 1);
    const mrN = await one(db,
      `select severity, n::text as n from public.hr_rejections
        where user_id = $1::uuid and slot = 0 and day = current_date and code = $2::text`,
      [UID, mr.code]);
    ok('e2e/req-item-row-escalates-when-sustained',
      Number(mrN?.n) >= c.at && mrN?.severity === 'incident',
      `sustaining the code the verb ACTUALLY emitted ("${mr.code}") to n=${mrN?.n} left it `
      + `"${mrN?.severity}". The verb emits a code the classifier does not grade — a rename at `
      + 'either end returns this refusal to being invisible forever.');
  }
}

// ════════════════════════════════════════════════════════════════════════
// ARM 2b — "SAFE TO RE-RUN", verified rather than claimed.
//   The Coordinator applies this file BY HAND, so a retry — an apply that timed
//   out, a re-run to confirm — is a real operation. It is also the ONLY thing
//   that exercises §1's already-patched branch, because a fresh chain always
//   meets the pending branch. A file that refuses its own output turns a retry
//   into an incident.
// ════════════════════════════════════════════════════════════════════════
async function armRerun(db, extra = []) {
  const before = await classification(db);
  let err = null;
  try { await db.exec(`begin;\n${await migPatched(FIX, extra)}\ncommit;`); }
  catch (e) { await db.exec('rollback').catch(() => {}); err = String(e.message || e).split('\n')[0]; }
  ok('rerun/idempotent', err === null,
    `applying ${FIX} a SECOND time failed: ${err}. The header says the patch is idempotent and the `
    + 'Coordinator applies by hand; a file that refuses its own output turns a retry into an '
    + 'incident, and this is the only path that reaches §1\'s already-patched branch at all.');
  if (err === null) {
    const after = await classification(db);
    ok('rerun/arrays-unchanged',
      JSON.stringify(after.incident) === JSON.stringify(before.incident)
      && JSON.stringify(after.escalating) === JSON.stringify(before.escalating),
      `the re-run CHANGED the classification: incident ${JSON.stringify(before.incident)} -> `
      + `${JSON.stringify(after.incident)}, escalating ${JSON.stringify(before.escalating)} -> `
      + `${JSON.stringify(after.escalating)}. An idempotent patch must add each code once, not once `
      + 'per apply.');
  }
}

// ════════════════════════════════════════════════════════════════════════
// ARM 3 — the ACL, across a SECURITY DEFINER body replace.
//   `create or replace` PRESERVES proacl, so a patch that re-executed the body
//   under a different definition would carry whatever ACL was there. This
//   function writes hr_rejections for an ARBITRARY user id: a client grant is a
//   way to forge another player's abuse record.
// ════════════════════════════════════════════════════════════════════════
async function armAcl(db) {
  const r = await one(db, `select
      has_function_privilege('anon','${SIG}','execute')          as anon,
      has_function_privilege('authenticated','${SIG}','execute') as auth,
      has_function_privilege('service_role','${SIG}','execute')  as svc,
      (select p.proacl is null from pg_proc p where p.oid='${SIG}'::regprocedure) as default_acl,
      (select p.prosecdef from pg_proc p where p.oid='${SIG}'::regprocedure)      as secdef,
      (select 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
         from pg_proc p where p.oid='${SIG}'::regprocedure)                       as pinned_path,
      exists (select 1 from pg_proc p, aclexplode(p.proacl) a
               where p.oid='${SIG}'::regprocedure and a.grantee = 0)              as public_exec`);
  ok('acl/no-client-role', r && r.anon === false && r.auth === false && r.svc === false,
    `hr_record_rejection is executable by a client role (${JSON.stringify(r)}). It takes a uuid `
    + 'ARGUMENT and writes hr_rejections for it, so a grant is "file an abuse record against any '
    + 'player".');
  ok('acl/not-default', r && r.default_acl === false && r.public_exec === false,
    `hr_record_rejection carries the DEFAULT acl or a PUBLIC execute grant (${JSON.stringify(r)}). `
    + 'A NULL proacl grants EXECUTE to PUBLIC — "no acl" is the failure, not the absence of one.');
  ok('acl/definer-with-pinned-path', r && r.secdef === true && r.pinned_path === true,
    `hr_record_rejection lost SECURITY DEFINER or its pinned search_path (${JSON.stringify(r)}). A `
    + "definer function without one resolves through the caller's search_path.");
}

// ════════════════════════════════════════════════════════════════════════
// ARM 4 — THE DUAL SHAPE. Production's copy of hr_record_rejection is
//   comment-stripped; the repo replay's is not (a recorded live/replay
//   divergence, verified CODE-IDENTICAL by live-hash-drift --codediff). The
//   migration's anchors are pure code on one line precisely so they match both,
//   and that claim is EXECUTED here rather than argued: boot the chain up to the
//   migration's predecessor, install the comment-stripped body production
//   actually runs, then apply the migration file on top of it.
// ════════════════════════════════════════════════════════════════════════
/** Strip `--` comments the way an apply path that stripped them would: outside
 *  string literals and outside dollar-quotes. Same algorithm as
 *  tests/live-hash-drift.mjs stripSqlComments, minus the whitespace collapse —
 *  the body has to remain a compilable function definition. */
function stripLineComments(src) {
  const out = [];
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    let s = raw; let inStr = false; let dq = null; let cut = -1;
    for (let i = 0; i < s.length; i += 1) {
      if (dq) { if (s.startsWith(dq, i)) { i += dq.length - 1; dq = null; } continue; }
      if (inStr) { if (s[i] === "'") inStr = false; continue; }
      if (s[i] === "'") { inStr = true; continue; }
      const m = /^\$[a-zA-Z_0-9]*\$/.exec(s.slice(i));
      if (m) { dq = m[0]; i += m[0].length - 1; continue; }
      if (s[i] === '-' && s[i + 1] === '-') { cut = i; break; }
    }
    if (cut >= 0) s = s.slice(0, cut);
    out.push(s);
  }
  return out.join('\n');
}

async function armDualShape(extra = []) {
  let db;
  try {
    ({ db } = await bootReplay({
      upTo: HARDEN,
      patches: extra.length ? new Map(extra) : undefined,
    }));
  } catch (e) {
    if (e.harness) throw e;
    ok('dual-shape/arm-can-run', false,
      `the chain would not build up to ${HARDEN}, so the production body shape could not be `
      + `measured at all: ${String(e.message || e).split('\n').slice(0, 3).join(' ')}`);
    return;
  }

  const pre = (await one(db,
    `select replace(pg_get_functiondef('${SIG}'::regprocedure), chr(13), '') as d`))?.d ?? '';
  const stripped = stripLineComments(pre);
  ok('dual-shape/strip-changed-something', stripped.length < pre.length,
    'stripping comments from the pre-patch body changed nothing, so this arm is comparing a body '
    + 'with itself and proves nothing about production, whose copy IS comment-stripped.');

  // Both anchors must be present exactly once in BOTH shapes. This is the whole
  // dual-shape claim, stated as a measurement.
  const ANCHORS = {
    'c_incident-closing-line': "    'seller_unavailable','forbidden_impersonation'];",
    'c_escalating-declaration':
      "  c_escalating constant text[] := array['rate_limited','own_listing','intent_mismatch'];",
  };
  for (const [name, a] of Object.entries(ANCHORS)) {
    ok(`dual-shape/${name}-in-replay-shape`, pre.split(a).length - 1 === 1,
      `the ${name} anchor matches ${pre.split(a).length - 1} time(s) in the REPO REPLAY's body `
      + '(expected exactly 1). The migration would refuse to apply here.');
    ok(`dual-shape/${name}-in-live-shape`, stripped.split(a).length - 1 === 1,
      `the ${name} anchor matches ${stripped.split(a).length - 1} time(s) in the COMMENT-STRIPPED `
      + 'body — which is the shape production actually runs (a recorded live/replay divergence, '
      + 'comments only). An anchor that included a comment line would match on exactly one of the '
      + 'two databases this migration has to apply to, and nothing else in the repo would say so.');
  }

  // …and now actually apply the migration ON TOP OF the production-shaped body.
  let err = null;
  try {
    await db.exec(`create or replace ${stripped.replace(/^CREATE OR REPLACE /i, '')}`.replace(/^create or replace CREATE OR REPLACE /i, 'create or replace '));
  } catch (e) { err = String(e.message || e).split('\n')[0]; }
  ok('dual-shape/stripped-body-installs', err === null,
    `the comment-stripped body would not install: ${err}. If a comment strip breaks this function, `
    + 'the divergence recorded in live-hash-drift.baseline.json is not what it says it is.');

  if (err === null) {
    // The migration text must carry the mutation too — see migPatched().
    const text = await migPatched(FIX, extra);
    let applyErr = null;
    try { await db.exec(`begin;\n${text}\ncommit;`); }
    catch (e) { await db.exec('rollback').catch(() => {}); applyErr = String(e.message || e).split('\n')[0]; }
    ok('dual-shape/migration-applies-to-the-live-shape', applyErr === null,
      `${FIX} would NOT apply to a comment-stripped hr_record_rejection: ${applyErr}. That is the `
      + 'shape PRODUCTION runs. Every green result on the repo replay would then be a false '
      + 'positive, and the apply would fail on the real database.');
    if (applyErr === null) {
      const c = await classification(db);
      ok('dual-shape/classification-lands-on-the-live-shape',
        (c.incident || []).includes('unknown_unlock')
        && (c.escalating || []).includes('missing_req_item'),
        `applied to the production-shaped body the arrays came out incident=`
        + `${JSON.stringify(c.incident)} escalating=${JSON.stringify(c.escalating)}.`);
    }
  }
  await db.close?.();
}

// ════════════════════════════════════════════════════════════════════════
// ARM 5 — the derivation chain, DERIVED from the manifest rather than
//   remembered. Whoever authors hr_record_rejection LAST wins; re-applying
//   2026-08-11-player-state.sql alone reverts THIS file AND
//   2026-09-03-intent-mismatch-escalates.sql, silently, because that file's own
//   self-checks were written for its own body and pass on it.
// ════════════════════════════════════════════════════════════════════════
async function armLastToucher() {
  const m = await manifest();
  const authors = [];
  const patchers = [];
  for (const f of m.order) {
    let src = '';
    try { src = await mig(f); } catch { continue; }
    if (/create\s+or\s+replace\s+function\s+public\.hr_record_rejection\b/i.test(src)) authors.push(f);
    // A programmatic patcher: it reads the body back and re-executes it.
    if (/pg_get_functiondef\(\s*c_sig::regprocedure\s*\)|hr_record_rejection\(uuid,int,text,text,jsonb,bigint\)/i
      .test(src) && /\bexecute\s+v_new\b/.test(src)) patchers.push(f);
  }
  ok('chain/function-has-an-author', authors.length > 0,
    'no migration in the manifest creates public.hr_record_rejection');
  ok('chain/author-is-the-expected-one', authors[authors.length - 1] === AUTHOR,
    `the last migration to CREATE hr_record_rejection is ${authors[authors.length - 1]}, not `
    + `${AUTHOR}. Authors in manifest order: [${authors.join(', ')}]. A new author would have to `
    + 'carry both classification rulings forward, and this guard has to be re-pointed at it '
    + 'deliberately.');
  ok('chain/this-file-is-the-last-patcher', patchers[patchers.length - 1] === FIX,
    `the LAST migration to patch hr_record_rejection is ${patchers[patchers.length - 1]}, not `
    + `${FIX}. Patchers in manifest order: [${patchers.join(', ')}]. Whatever runs last decides, in `
    + 'silence.');
  ok('chain/predecessor-runs-first',
    m.order.indexOf(PRED) >= 0 && m.order.indexOf(PRED) < m.order.indexOf(FIX),
    `${PRED} must run BEFORE ${FIX} — the c_escalating anchor is that file's output.`);
  ok('chain/hardening-runs-first',
    m.order.indexOf(HARDEN) >= 0 && m.order.indexOf(HARDEN) < m.order.indexOf(FIX),
    `${HARDEN} must run BEFORE ${FIX} — it is what makes the two codes emittable at all, and `
    + `${FIX}'s §0 fails closed by name without it.`);

  const src = await mig(FIX);
  ok('chain/repair-is-written-down',
    src.includes(AUTHOR) && src.includes(PRED) && /REPAIR/.test(src),
    `${FIX} does not name the revert hazard and its repair. Re-applying ${AUTHOR} alone reverts `
    + 'this file AND the intent_mismatch escalation without an error; the repair (re-apply '
    + `${PRED}, then ${FIX}) has to be written where the mistake is made.`);
}

// ════════════════════════════════════════════════════════════════════════
// THE PLANTED DEFECTS. Each names WHAT must catch it — a mutation that trips
// some other assertion is a false green, so `expect` is checked, not just
// "something fired".
// ════════════════════════════════════════════════════════════════════════
const A_DO_INC = "  v_do_inc := position('''unknown_unlock''' in v_code_old) = 0;";
const A_DO_ESC = "  v_do_esc := position('''missing_req_item''' in v_code_old) = 0;";
const A_SIZE = '  if not v_size_ok then';
const A_S2_INC_IN = "  if position('''unknown_unlock''' in v_inc) = 0 then";
const A_S2_INC_OUT = "  if position('''unknown_unlock''' in v_esc) > 0 then";
const A_S2_ESC_IN = "  if position('''missing_req_item''' in v_esc) = 0 then";
const A_S2_ESC_OUT = "  if position('''missing_req_item''' in v_inc) > 0 then";
const A_S3_A = "    if v_sev_a is distinct from 'incident' then";
const A_S3_B1 = "    if v_sev_b1 is distinct from 'normal' then";
const A_S3_B49 = "    if v_sev_b49 is distinct from 'normal' then";
const A_S3_D1 = "    if v_sev_d1 is distinct from 'normal' then";
const A_S3_DN = "    if v_sev_dn is distinct from 'normal' then";
const A_S3_E = "    if v_sev_e is distinct from 'incident' then";
const A_S2_ACL = `  if has_function_privilege('anon', c_sig, 'execute')
     or has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then`;
const A_OFF = '  if false then';
const A_OFF4 = '    if false then';

const A_REPL_INC_TAIL = "    '    ''unknown_unlock''];';";
const A_REPL_ESC_TAIL =
  "    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch'',''missing_req_item''];';";

// The emit sites in the hardening file. Layer A's is distinguished from Layer
// B's by its `raced` flag, so the anchor is the whole call.
const A_EMIT_UNKNOWN = `    perform public.hr_record_rejection(v_uid, p_slot, 'companion_grant', 'unknown_unlock',
      jsonb_build_object('companion', p_companion, 'unlock_id', v_key,
                         'claimed_source', p_source, 'catalogue_source', v_cat.source_kind,
                         'raced', false));`;
const A_EMIT_REQITEM = "      perform public.hr_record_rejection(v_uid, p_slot, 'companion_grant', 'missing_req_item',";
/* The hardening file's OWN §4 gates on the journalled code, so a rename there is
   refused by that file before this guard ever runs. Those two assertions are
   neutralised alongside the rename in the drift mutations below — i.e. the
   mutation is "the property and the gate that grades it, removed in the same
   edit", which is precisely the case an independent guard exists for. */
const A_HARDEN_J_UNKNOWN = `      if not exists (select 1 from public.hr_rejections where user_id = v_uid
                      and intent = 'companion_grant' and code = 'unknown_unlock') then`;
const A_HARDEN_J_REQITEM = `    if not exists (select 1 from public.hr_rejections where user_id = v_uid
                    and intent = 'companion_grant' and code = 'missing_req_item') then`;

// The classifier's INSERT-branch severity arm, in the authoring file.
const A_INSERT_CASE = "          case when p_code = any (c_incident) then 'incident' else 'normal' end,";
// The predecessor's own behavioural gate, so a mutation can be asked past it.
const A_PRED_GATE = "    if v_sev_one is distinct from 'normal' then";

const MUTATIONS = [
  {
    name: 'misfile_unknown_unlock_ungated',
    why: 'unknown_unlock filed into c_escalating instead of c_incident — the classification the '
       + 'ruling rejected — AND every assertion in the migration that grades it neutralised in the '
       + 'same edit. A destroyed unlock catalogue then reads as ordinary refusal traffic until '
       + 'FIFTY grants have failed for ONE player, which for a per-player counter may be never.',
    patches: new Map([[FIX, [
      [A_DO_INC, '  v_do_inc := false;'],
      [A_REPL_ESC_TAIL, A_REPL_ESC_TAIL.replace("''missing_req_item''];", "''missing_req_item'',''unknown_unlock''];")],
      [A_SIZE, A_OFF],
      [A_S2_INC_IN, A_OFF],
      [A_S2_INC_OUT, A_OFF],
      [A_S3_A, A_OFF4],
      [A_S3_E, A_OFF4],
    ]]]),
    expect: { kind: 'arm', assertion: 'incident/unknown-unlock-first-occurrence-is-incident' },
  },
  {
    name: 'misfile_missing_req_item_ungated',
    why: 'missing_req_item filed into c_incident — the classification the ruling rejected — with '
       + 'the migration\'s own "one stays normal" assertions removed. THE FLIP STILL PASSES: n=50 '
       + 'reads "incident" exactly as it should, because n=1 already did. Only an assertion that '
       + 'ONE stays normal can tell the two rulings apart, and this proves that assertion is '
       + 'load-bearing rather than decorative.',
    patches: new Map([[FIX, [
      [A_DO_ESC, '  v_do_esc := false;'],
      [A_REPL_INC_TAIL, A_REPL_INC_TAIL.replace("''unknown_unlock''];", "''unknown_unlock'',''missing_req_item''];")],
      [A_SIZE, A_OFF],
      [A_S2_ESC_IN, A_OFF],
      [A_S2_ESC_OUT, A_OFF],
      [A_S3_B1, A_OFF4],
      [A_S3_B49, A_OFF4],
    ]]]),
    expect: { kind: 'arm', assertion: 'escalating/one-occurrence-stays-normal' },
  },
  {
    name: 'everything_is_incident_ungated',
    why: 'the classifier grades EVERY code an incident (a broken CASE arm in the authoring file), '
       + 'with the predecessor\'s and this file\'s "stays normal" gates removed. Both '
       + '"is an incident" assertions still pass — that is the point. ONLY the control code, which '
       + 'is in neither array, can tell "unknown_unlock is classified" from "the classifier stopped '
       + 'discriminating".',
    patches: new Map([
      [AUTHOR, [[A_INSERT_CASE, "          case when p_code is not null then 'incident' else 'normal' end,"]]],
      [PRED, [[A_PRED_GATE, A_OFF4]]],
      [FIX, [[A_S3_B1, A_OFF4], [A_S3_B49, A_OFF4], [A_S3_D1, A_OFF4], [A_S3_DN, A_OFF4]]],
    ]),
    expect: { kind: 'arm', assertion: 'control/unclassified-stays-normal-at-one' },
  },
  {
    name: 'emitted_unknown_unlock_code_drifts',
    why: 'a later edit to the HARDENING file renames the code hr_companion_grant RECORDS at Layer A '
       + "(to 'unknown_unlock_a') while the returned envelope keeps saying unknown_unlock. Every "
       + "text anchor passes (§0 still finds Layer B's literal), the classifier is correct, the "
       + 'migration\'s literal-driven §3 passes — and a destroyed catalogue is graded "normal" '
       + 'forever. Only driving the REAL RPC and reading the code off the row it wrote can see it. '
       + "(The hardening file's own §4(f) journal assertion is removed in the same edit; a rename "
       + 'that kept it would be refused there, and the point of this guard is the edit that takes '
       + 'the gate out with the property.)',
    patches: new Map([[HARDEN, [
      [A_EMIT_UNKNOWN, A_EMIT_UNKNOWN.replace("'unknown_unlock',", "'unknown_unlock_a',")],
      [A_HARDEN_J_UNKNOWN, '      if false then'],
    ]]]),
    expect: { kind: 'arm', assertion: 'e2e/unknown-unlock-row-is-incident' },
  },
  {
    name: 'emitted_req_item_code_drifts',
    why: 'the same drift on the other code: the RECORD call says req_item_missing while the '
       + 'envelope still says missing_req_item, so §0\'s presence check passes on the envelope. The '
       + 'sustained-abuse signature then never escalates, silently. Caught only by weighting the '
       + "code the verb ACTUALLY wrote rather than a literal. (The hardening file's own §4(e) "
       + 'journal assertion is removed in the same edit, for the same reason as above.)',
    patches: new Map([[HARDEN, [
      [A_EMIT_REQITEM, A_EMIT_REQITEM.replace("'missing_req_item',", "'req_item_missing',")],
      [A_HARDEN_J_REQITEM, '    if false then'],
    ]]]),
    expect: { kind: 'arm', assertion: 'e2e/req-item-row-escalates-when-sustained' },
  },
  {
    name: 'threshold_collapsed_to_two',
    why: 'c_escalate_at is dropped to 2 in the authoring file, which COLLAPSES the escalating class '
       + 'into the incident class: the second missing_req_item is already an incident, i.e. the '
       + "classification this ruling rejected, reached by the back door. The predecessor's gate "
       + 'still passes (it only checks 1 -> normal and 50 -> incident, and the FIRST occurrence '
       + 'takes the insert branch, which never escalates whatever the threshold is), so nothing '
       + "before this file notices. This migration's own floor is what refuses. A threshold RAISE "
       + 'is deliberately NOT a failure — the constant is shared and this file does not own it.',
    patches: new Map([[AUTHOR, [['  c_escalate_at constant bigint := 50;', '  c_escalate_at constant bigint := 2;']]]]),
    expect: { kind: 'chain', match: /COLLAPSES the escalating class/ },
  },
  {
    name: 'idempotency_guard_removed',
    why: 'the two "is this code already classified?" reads are forced TRUE, so the patch always '
       + 'tries to run. The FIRST apply is completely normal and every gate in the migration and '
       + 'every arm of this guard passes — the defect is invisible until somebody applies the file '
       + 'a SECOND time, which is exactly what the Coordinator does after a timed-out apply or to '
       + 'confirm one, and which then dies on ANCHOR DRIFT because the anchors were consumed by '
       + 'the first run. Only the re-run arm can see it.',
    patches: new Map([[FIX, [
      [A_DO_INC, '  v_do_inc := true;'],
      [A_DO_ESC, '  v_do_esc := true;'],
    ]]]),
    expect: { kind: 'arm', assertion: 'rerun/idempotent' },
  },
  {
    name: 'acl_widened_ungated',
    why: 'the migration grants EXECUTE on hr_record_rejection to `authenticated` — which takes a '
       + 'uuid ARGUMENT and writes hr_rejections for it, i.e. "file an abuse record against any '
       + 'player, as any signed-in client" — with the migration\'s own §2(d) reachability assertion '
       + 'removed in the same edit. Nothing else in the repo reads the ACL of this function at '
       + 'runtime.',
    patches: new Map([[FIX, [
      [A_S2_ACL, '  if false then'],
      ['do $$\nbegin\n  raise notice \'companion-code severity (C6) INSTALLED',
        'grant execute on function public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)\n'
        + '  to authenticated;\n\ndo $$\nbegin\n  raise notice \'companion-code severity (C6) INSTALLED'],
    ]]]),
    expect: { kind: 'arm', assertion: 'acl/no-client-role' },
  },
  {
    name: 'anchor_comment_coupled',
    why: 'the c_escalating anchor is widened to include the comment line above it — the shape that '
       + 'looks tidier and matches on exactly ONE of the two databases this migration has to apply '
       + 'to. It still applies cleanly on the repo replay, so nothing else in the repo would say a '
       + 'word; ARM 4, which installs the comment-stripped body production actually runs, is what '
       + 'refuses.',
    patches: new Map([[FIX, [[
      "    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch''];';",
      "    '  -- alarm. The row was always written; now the severity is earned.' || chr(10) ||\n"
      + "    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch''];';",
    ]]]]),
    expect: { kind: 'armChain', match: /would NOT apply to a comment-stripped/ },
  },
];

// ════════════════════════════════════════════════════════════════════════
async function run({ mutation = null } = {}) {
  problems = [];
  const patches = mutation ? mutation.patches : null;
  const extra = mutation ? [...mutation.patches] : [];

  let db = null;
  let chainError = null;
  try {
    ({ db } = await bootReplay(patches ? { patches } : {}));
  } catch (e) {
    if (e.harness) throw e;                 // a broken anchor is not a result
    chainError = String(e.message || e);
  }

  if (chainError === null) {
    await armClassification(db);
    await armEndToEnd(db);
    await armRerun(db, extra);
    await armAcl(db);
    await db.close?.();
  }
  if (!mutation) {
    await armLastToucher();
    await armDualShape();
  } else if (mutation.expect.kind === 'armChain') {
    // ARM 4 boots its OWN chain, so a defect aimed at the dual-shape claim has
    // to be carried into that boot.
    await armDualShape(extra);
  }
  return { chainError };
}

export async function companionCodesSeverityGuard() {
  const { chainError } = await run();
  if (chainError) {
    return [`THE REPO CANNOT REBUILD THE DATABASE WITH ${FIX}: ${chainError.split('\n')[0]}`];
  }
  return problems.map((p) => `${p.name}: ${p.msg}`);
}

const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/companion-codes-severity.mjs');
if (RUN_DIRECTLY) {
  if (process.argv.includes('--list')) {
    for (const m of MUTATIONS) {
      console.log(`${m.name}\n  expect: ${m.expect.kind === 'arm'
        ? m.expect.assertion : `${m.expect.kind} /${m.expect.match.source}/`}\n  ${m.why}\n`);
    }
    process.exit(0);
  }

  if (process.argv.includes('--selftest')) {
    let missed = 0;
    for (const m of MUTATIONS) {
      const { chainError } = await run({ mutation: m });
      let caught = false; let how = '';
      if (m.expect.kind === 'chain') {
        caught = !!chainError && m.expect.match.test(chainError);
        how = chainError
          ? `the chain REFUSED to apply: ${chainError.split('\n').slice(0, 2).join(' ').slice(0, 200)}`
          : 'the chain applied cleanly';
      } else if (m.expect.kind === 'armChain') {
        caught = chainError === null
          && problems.some((p) => p.name === 'dual-shape/migration-applies-to-the-live-shape'
            && m.expect.match.test(p.msg));
        how = chainError
          ? `the BASE chain refused (${chainError.split('\n')[0].slice(0, 120)}) — this mutation is `
            + 'supposed to be invisible there'
          : (problems.length
            ? `the guard fired: ${problems.map((p) => p.name).join(', ')}`
            : 'nothing fired');
      } else {
        caught = chainError === null && fired(m.expect.assertion);
        how = chainError
          ? `the chain refused (${chainError.split('\n')[0].slice(0, 140)}) — but this mutation is `
            + 'supposed to get PAST the migration and be caught by the guard'
          : (problems.length
            ? `the guard fired: ${problems.map((p) => p.name).join(', ')}`
            : 'nothing fired');
      }
      if (caught) console.log(`CAUGHT  ${m.name}\n          ${how}`);
      else {
        console.error(`MISSED  ${m.name}  (expected ${m.expect.kind === 'arm'
          ? `assertion ${m.expect.assertion}`
          : `${m.expect.kind === 'chain' ? 'the chain' : "arm 4's boot"} to refuse with `
            + `/${m.expect.match.source}/`})\n          ${how}`);
        missed += 1;
      }
    }
    if (missed) {
      console.error(`\n${missed} of ${MUTATIONS.length} planted defects were NOT caught.`);
      process.exit(1);
    }
    console.log(`\nall ${MUTATIONS.length} planted defects caught, each by the named check that is `
      + "supposed to see it: the migration's own behavioural gate, this guard's independent "
      + 'classification measurement, its end-to-end drive of the real RPC, and its dual-shape arm.');
    process.exit(0);
  }

  const { chainError } = await run();
  if (chainError) {
    console.error(`companion-codes-severity: the chain would not apply\n  ${chainError}`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`companion-codes-severity: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  x ${p.name}\n      ${p.msg}`);
    process.exit(1);
  }
  console.log('companion-codes-severity: green — unknown_unlock is an INCIDENT on its first '
    + 'occurrence and missing_req_item stays NORMAL on its first and becomes an incident at '
    + 'c_escalate_at, measured through the real hr_record_rejection AND end-to-end through the real '
    + 'hr_companion_grant with the code read off the row the verb wrote; an unclassified control '
    + 'code stays normal at any n; the ratchet never downgrades; every incumbent code survived; the '
    + 'ACL is unchanged across the definer-body replace; both anchors match the COMMENT-STRIPPED '
    + 'body production runs and the migration applies to it; and this file is the manifest\'s last '
    + 'patcher of the body.');
}
