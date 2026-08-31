#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/companion-grant-hardening.mjs — THE THREE SECURITY CONDITIONS ON
//   public.hr_companion_grant, MEASURED THROUGH THE REAL RPC.
//
//   node tests/companion-grant-hardening.mjs             # the guard
//   node tests/companion-grant-hardening.mjs --selftest  # every planted defect
//                                                        # must be CAUGHT, BY NAME
//
// ── WHY THIS EXISTS SEPARATELY FROM THE MIGRATION'S OWN §4 ──────────────
// supabase/migrations/2026-09-06-companion-grant-hardening.sql already proves
// its behaviour at APPLY time, in a rolled-back subtransaction. That is the
// house rule and it is not enough on its own for two reasons:
//
//   1. A gate that lives inside the thing it grades can be removed in the same
//      edit that removes the property. `fake_control_unguarded` below plants
//      exactly that — C2 reverted AND the migration's own C2 assertions
//      neutralised — and requires THIS file to catch it anyway.
//   2. The migration's §4 cannot exercise C1's SECOND layer. Layer A (the
//      pre-check on hr_unlocks) always answers first in a single backend, so
//      the handler that closes the TOCTOU race is dead code from §4's point of
//      view. Arm 2 here replays the chain with Layer A NEUTRALISED and requires
//      Layer B alone to still answer the machine code — and, critically, to
//      still hand the player's dragon_egg back.
//
//      Removing Layer A also puts the migration's OWN §4 on Layer B's path,
//      which turns out to be the sharpest instrument here: the
//      `consume_outside_subtransaction` mutation (the consume moved out of the
//      block the handler wraps, so a raced refusal spends the egg and grants
//      nothing) applies to the base chain WITHOUT A SINGLE COMPLAINT and is
//      caught only by §4(f) running under this arm's patch. That is why arm 2
//      boots a whole chain instead of poking the function directly.
//
// ── THE FIXTURE RULE (TESTING.md), OBSERVED ─────────────────────────────
// Every value below is read from the producer's real output: the envelope the
// RPC actually returns, the row public.player_ledger actually holds, the qty
// public.player_inventory actually carries. Nothing is assembled from a base
// object. Two specific applications:
//   · the ledger probe passes a claimed source that CONTRADICTS the catalogue
//     ('boss:i_said_so' against badger's 'drop'), so `claimed_source` and
//     `catalogue_source` cannot be confused for one another — if they carried
//     the same string the C3 assertion would pass on either field;
//   · every refusal arm is paired with the SAME call succeeding once its
//     precondition is met. A refusal on its own is satisfied identically by
//     "the control works" and "the verb is broken".
//
// ── AND IT WRITES DOWN THE DERIVATION CHAIN ─────────────────────────────
// supabase/migrations/2026-08-22-companion-grant.sql is GENERATED from
// src/data/companions.js and its §3 still carries the PRE-hardening body.
// Re-applying it alone reverts all three conditions SILENTLY — its own §5/§6
// self-checks were written for the unhardened body and pass on it. That is the
// b453 catalogue incident in function form. Arm 3 derives the writer list from
// tests/schema-apply-order.json and requires the hardening file to be LAST;
// arm 4 performs the revert, measures it, and proves the declared repair
// (re-apply the hardening file) restores the behaviour.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · That production has been hardened. This is a REVIEW-ONLY migration; the
//     Coordinator applies. tests/schema-drift.mjs --live / a live
//     pg_get_functiondef is what says whether production agrees.
//   · TRUE CONCURRENCY. PGlite is one backend, so the TOCTOU race Layer B
//     exists for cannot be run as a race. Arm 2 reproduces its EFFECT (the
//     catalogue row absent at insert time with Layer A out of the way), which
//     is the closest a single backend gets.
//   · Anything about the client. Nothing yet SHOWS a player a refused hatch;
//     that is the Systems Engineer's surface.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, manifest } from './schema-replay.mjs';

const FIX = '2026-09-06-companion-grant-hardening.sql';
const AUTHOR = '2026-08-22-companion-grant.sql';

/** A throwaway signed-in character per arm. Distinct from the uuids the two
 *  migrations use for their own rolled-back probes (…0c6a17, …c0a91a70). */
const UID = '00000000-0000-4000-8000-0000c0a91a71';

const mig = (f) => readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')
  .then((s) => s.replace(/\r\n/g, '\n'));

// ── The patch anchors. Each must match EXACTLY ONCE (bootReplay enforces it),
//    so a moved anchor fails loudly instead of planting nothing.
const A_LAYER_A = `  if not exists (select 1 from public.hr_unlocks where unlock_id = v_key) then
    perform public.hr_record_rejection(v_uid, p_slot, 'companion_grant', 'unknown_unlock',
      jsonb_build_object('companion', p_companion, 'unlock_id', v_key,
                         'claimed_source', p_source, 'catalogue_source', v_cat.source_kind,
                         'raced', false));
    return jsonb_build_object('ok', false, 'error', 'unknown_unlock:' || v_key,
      'detail', jsonb_build_object('companion', p_companion, 'unlock_id', v_key, 'raced', false));
  end if;`;
const A_LAYER_A_OFF = `  if false then
    null;
  end if;`;
// §4(f) asserts that in the ORDINARY case it is Layer A that answers (raced =
// false). Arm 2 removes Layer A on purpose, so that expectation inverts and the
// migration's own gate has to be told. Patched EXPLICITLY rather than by
// loosening the assertion in the shipped file: `raced` is how the ledger tells a
// stale deploy from an active `delete`, and an arm that had to weaken it would
// be evidence the flag is not carrying information.
const A_RACED = `      if coalesce((v_r->'detail'->>'raced')::boolean, true) <> false then`;
const A_RACED_OFF = `      if false then`;

const A_C2 = `    if coalesce(v_have, 0) < 1 then
      perform public.hr_record_rejection(v_uid, p_slot, 'companion_grant', 'missing_req_item',
        jsonb_build_object('companion', p_companion, 'item', v_cat.req_item,
                           'held', coalesce(v_have, 0), 'claimed_source', p_source,
                           'catalogue_source', v_cat.source_kind));
      return jsonb_build_object('ok', false, 'error', 'missing_req_item',
        'item', v_cat.req_item, 'companion', p_companion);
    end if;`;
// The ORIGINAL defect, restored verbatim: measure, record, fall through, grant.
const A_C2_FAKE = `    if coalesce(v_have, 0) < 1 then
      v_egg := false;
    end if;`;

const A_RERAISE = `    if sqlerrm not like 'unknown_unlock:%' then raise; end if;`;

// The req_item consume, moved OUT of the subtransaction that wraps the grant.
// Behaviourally identical on the success path and on every refusal Layer A
// reaches first — which is why NOTHING in the migration's own §4 can see it. It
// only bites on the raced path, where the egg is spent and nothing is granted.
const A_ATOMIC = `  begin
    if v_cat.req_item is not null then
      if v_have = 1 then
        delete from public.player_inventory
         where user_id = v_uid and slot = p_slot and item_id = v_cat.req_item;
      else
        update public.player_inventory set qty = v_have - 1
         where user_id = v_uid and slot = p_slot and item_id = v_cat.req_item;
      end if;
      v_egg := true;
    end if;
`;
const A_ATOMIC_OFF = `  if v_cat.req_item is not null then
    if v_have = 1 then
      delete from public.player_inventory
       where user_id = v_uid and slot = p_slot and item_id = v_cat.req_item;
    else
      update public.player_inventory set qty = v_have - 1
       where user_id = v_uid and slot = p_slot and item_id = v_cat.req_item;
    end if;
    v_egg := true;
  end if;
  begin
`;

const A_RACED_FLAG = `'unlock_id', v_key, 'raced', true));`;
const A_RACED_FLAG_OFF = `'unlock_id', v_key, 'raced', false));`;
const A_LEDGER  = `              jsonb_build_object('companion', p_companion, 'claimed_source', p_source,`;
const A_LEDGER_OLD = `              jsonb_build_object('companion', p_companion, 'source', p_source,`;

// The migration's own self-checks, so a mutation can be asked to get past them.
const A_S3_C2A = `  if v_src not like '%missing_req_item%' then`;
const A_S3_C2B = `  if v_src like '%v_egg := false;%' then`;
const A_S4_HEAD = `  if to_regprocedure('public.hr_create_character(int)') is null then`;
const A_S4_SKIP = `  if to_regprocedure('public.hr_create_character(int)') is not null then return; end if;
  if to_regprocedure('public.hr_create_character(int)') is null then`;
const A_OFF = `  if false then`;

// ── Assertion ledger. Every assertion carries a NAME, because a mutation proof
//    that only counts failures passes when the WRONG assertion fires.
let problems = [];
const ok = (name, cond, msg) => { if (!cond) problems.push({ name, msg }); };
const fired = (name, re = null) =>
  problems.some((p) => p.name === name && (re === null || re.test(p.msg)));

/** Returns {raised:bool, r?:envelope, sqlstate?, message?} — the distinction
 *  that IS condition C1. A raise is the PostgREST 500; a return is the machine
 *  code. Reading them as the same thing is the defect. */
const TRY = `create or replace function pg_temp.cg_try(p_uid uuid, p_comp text, p_src text)
returns jsonb language plpgsql as $fn$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_companion_grant(0, p_comp, p_src, gen_random_uuid());
  return jsonb_build_object('raised', false, 'r', v);
exception when others then
  return jsonb_build_object('raised', true, 'sqlstate', sqlstate, 'message', sqlerrm);
end $fn$;`;

async function signIn(db, uid) {
  await db.exec(`insert into auth.users (id) values ('${uid}');`);
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);`);
  await db.exec(`select public.hr_create_character(0);`);
  await db.exec(TRY);
}

const one = async (db, sql) => (await db.query(sql)).rows[0];
const grant = async (db, comp, src) =>
  (await one(db, `select pg_temp.cg_try('${UID}','${comp}','${src}') as v`)).v;

// ════════════════════════════════════════════════════════════════════════
// ARM 1 — the three conditions, measured independently of the migration's §4.
// ════════════════════════════════════════════════════════════════════════
async function armConditions(db, tag = '') {
  const p = (s) => `${tag}${s}`;

  // ── C3. The claim CONTRADICTS the catalogue on purpose (see the fixture rule
  //    note in the header): badger's catalogue source_kind is 'drop'.
  let g = await grant(db, 'badger', 'boss:i_said_so');
  ok(p('control/ordinary-grant'), g.raised === false && g.r?.ok === true,
    `an ordinary badger grant did not succeed: ${JSON.stringify(g)}. Everything below would then `
    + 'be measuring a broken verb rather than the hardening.');

  const led = await one(db,
    `select meta from public.player_ledger where user_id='${UID}' and intent='companion_grant'
      order by id desc limit 1`);
  const meta = led?.meta ?? null;
  ok(p('C3/ledger-row-exists'), meta !== null, 'the grant wrote no companion_grant ledger row');
  ok(p('C3/claimed-source-present'), meta !== null && 'claimed_source' in meta,
    `the ledger meta carries no claimed_source: ${JSON.stringify(meta)}`);
  ok(p('C3/bare-source-gone'), meta !== null && !('source' in meta),
    `the ledger meta STILL carries the bare client key \`source\` beside the server-derived `
    + `catalogue_source, with equal standing: ${JSON.stringify(meta)}`);
  ok(p('C3/claim-is-verbatim'), meta?.claimed_source === 'boss:i_said_so',
    `claimed_source is ${JSON.stringify(meta?.claimed_source)} — it must be the CLIENT's string, `
    + 'verbatim, or the ledger is not recording what was claimed');
  ok(p('C3/catalogue-source-is-server-truth'), meta?.catalogue_source === 'drop',
    `catalogue_source is ${JSON.stringify(meta?.catalogue_source)} — badger's allowlist row says `
    + "'drop'. The client claimed 'boss:i_said_so' and must not have moved it.");

  // The same rename on the OTHER surface this verb writes. Nothing in §4 of the
  // migration checks this one.
  g = await grant(db, 'any_op_companion', 'drop:forged');
  ok(p('gate/unknown-id-refused'), g.raised === false && g.r?.error === 'not_grantable',
    `an unknown id answered ${JSON.stringify(g)} (expected not_grantable)`);
  g = await grant(db, 'sparrow', 'shop');
  ok(p('gate/shop-id-refused'), g.raised === false && g.r?.error === 'not_grantable',
    `the SHOP companion sparrow answered ${JSON.stringify(g)} — a free shop pet is exactly the `
    + 'mint the allowlist refuses');
  const rej = await one(db,
    `select last_detail from public.hr_rejections
      where user_id='${UID}' and intent='companion_grant' and code='not_grantable'`);
  ok(p('C3/rejection-detail-renamed'),
    rej != null && 'claimed_source' in rej.last_detail && !('source' in rej.last_detail),
    `the not_grantable rejection detail still names the client's value \`source\`: `
    + `${JSON.stringify(rej?.last_detail)}. One value must not have two names across rows written `
    + 'by the same RPC.');

  // ── C2. Refusal, then the SAME call succeeding once the precondition is met.
  const ver0 = (await one(db, `select version from public.player_state where user_id='${UID}' and slot=0`)).version;
  const led0 = Number((await one(db,
    `select count(*)::int n from public.player_ledger where user_id='${UID}' and intent='companion_grant'`)).n);
  g = await grant(db, 'whelp', 'hatch:dragon_egg');
  ok(p('C2/no-grant-without-req-item'),
    g.raised === false && g.r?.ok === false && g.r?.error === 'missing_req_item'
      && g.r?.item === 'dragon_egg',
    `whelp was granted WITHOUT its dragon_egg: ${JSON.stringify(g)}. The req_item control measures `
    + 'and does not decide — it is still the fake control Security refused to leave in place.');
  const wrote = await one(db,
    `select count(*)::int n from public.player_progress
      where user_id='${UID}' and kind='unlock' and key='companion:whelp'`);
  const ver1 = (await one(db, `select version from public.player_state where user_id='${UID}' and slot=0`)).version;
  const led1 = Number((await one(db,
    `select count(*)::int n from public.player_ledger where user_id='${UID}' and intent='companion_grant'`)).n);
  ok(p('C2/refusal-writes-nothing'),
    Number(wrote.n) === 0 && String(ver1) === String(ver0) && led1 === led0,
    `the refused whelp grant still wrote state: ownership rows=${wrote.n}, version ${ver0}->${ver1}, `
    + `ledger ${led0}->${led1}`);
  ok(p('C2/refusal-journalled'),
    (await one(db, `select count(*)::int n from public.hr_rejections
       where user_id='${UID}' and intent='companion_grant' and code='missing_req_item'`)).n > 0,
    'the missing_req_item refusal was not journalled. An unjournalled refusal is an invisible one, '
    + "and \"journalled the way the verb's other refusals are\" is the condition.");

  // ── C1. The missing catalogue row: a machine code, not a 500 — and it must
  //    not eat the egg on its way out. Run on the ONE req_item companion so a
  //    single probe proves both.
  await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                 values ('${UID}', 0, 'dragon_egg', 2)
                 on conflict (user_id, slot, item_id) do update set qty = excluded.qty;`);
  await db.exec(`delete from public.hr_unlocks where unlock_id='companion:whelp';`);
  g = await grant(db, 'whelp', 'hatch:dragon_egg');
  ok(p('C1/missing-row-returns-not-raises'), g.raised === false,
    `with companion:whelp absent from hr_unlocks the RPC RAISED (${g.sqlstate} / ${g.message}) `
    + 'instead of returning a machine code. That raise is the PostgREST 500 a client cannot tell '
    + 'from the server being down — the whole of condition C1.');
  ok(p('C1/machine-code-names-the-key'),
    g.raised === false && g.r?.error === 'unknown_unlock:companion:whelp' && g.r?.ok === false,
    `expected error unknown_unlock:companion:whelp, got ${JSON.stringify(g)}`);
  const egg = await one(db,
    `select qty from public.player_inventory where user_id='${UID}' and slot=0 and item_id='dragon_egg'`);
  ok(p('C1/refusal-does-not-consume'), Number(egg?.qty) === 2,
    `the unknown_unlock refusal CONSUMED the req_item (qty is now ${egg?.qty}, was 2). A refusal `
    + 'that eats the egg and grants nothing is worse than the 500 it replaced.');
  ok(p('C1/refusal-journalled'),
    (await one(db, `select count(*)::int n from public.hr_rejections
       where user_id='${UID}' and intent='companion_grant' and code='unknown_unlock'`)).n > 0,
    'the unknown_unlock refusal was not journalled');

  await db.exec(`insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
                 values ('companion:whelp','companion','max','unlock',1,array[1]::int[])
                 on conflict (unlock_id) do nothing;`);

  // THE POSITIVE CONTROL for both C1 and C2 at once: with the catalogue row back
  // AND the egg held, the same call succeeds and consumes exactly one.
  g = await grant(db, 'whelp', 'hatch:dragon_egg');
  ok(p('C2/grants-when-req-item-held'),
    g.raised === false && g.r?.ok === true && g.r?.egg_consumed === true,
    `CONTROL FAILED: whelp refused with the egg held and the catalogue row present: `
    + `${JSON.stringify(g)}. C2 would then be refusing everything rather than enforcing anything, `
    + 'and the two refusal arms above would prove nothing.');
  const egg2 = await one(db,
    `select qty from public.player_inventory where user_id='${UID}' and slot=0 and item_id='dragon_egg'`);
  ok(p('C2/consumes-exactly-one'), Number(egg2?.qty) === 1,
    `the successful hatch left qty ${egg2?.qty}, expected exactly one consumed (2 -> 1)`);

  // ── NARROWNESS. The storage guard raises 23514 for SIX distinct messages and
  //    C1 owns exactly one of them. A flag-shaped catalogue row must still blow
  //    up, loudly, rather than be reported as a tidy unknown_unlock.
  await db.exec(`update public.hr_unlocks set progress_kind='flag' where unlock_id='companion:heron';`);
  g = await grant(db, 'heron', 'skill:fishing');
  ok(p('C1/narrow-catch-reraises'),
    g.raised === true && g.sqlstate === '23514' && /^unlock_wrong_kind/.test(g.message || ''),
    `a flag-shaped catalogue row did not propagate the storage guard's unlock_wrong_kind — the RPC `
    + `answered ${JSON.stringify(g)}. Catching 23514 without testing the message turns every model `
    + 'violation into a false refusal and silently disarms the trigger this translation sits on.');
  await db.exec(`update public.hr_unlocks set progress_kind='unlock' where unlock_id='companion:heron';`);
}

// ════════════════════════════════════════════════════════════════════════
// ARM 2 — Layer B alone. The chain is replayed with C1's pre-check NEUTRALISED,
//   so the only thing that can answer a missing catalogue row is the handler
//   around the mutation block. This is the arm the migration's own §4 cannot
//   run, because in a single backend Layer A always answers first.
// ════════════════════════════════════════════════════════════════════════
async function armLayerB(extra = []) {
  let db;
  try {
    ({ db } = await bootReplay({
      patches: new Map([[FIX, [[A_LAYER_A, A_LAYER_A_OFF], [A_RACED, A_RACED_OFF], ...extra]]]),
    }));
  } catch (e) {
    if (e.harness) throw e;               // a moved anchor is not a result
    ok('C1/layer-b-arm-can-run', false,
      'the chain would not apply with C1 Layer A neutralised, so Layer B could not be measured '
      + `at all: ${String(e.message || e).split('\n').slice(0, 3).join(' ')}`);
    return;
  }
  await signIn(db, UID);
  await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                 values ('${UID}', 0, 'dragon_egg', 2)
                 on conflict (user_id, slot, item_id) do update set qty = excluded.qty;`);
  await db.exec(`delete from public.hr_unlocks where unlock_id='companion:whelp';`);

  const g = await grant(db, 'whelp', 'hatch:dragon_egg');
  ok('C1/layer-b-answers-alone', g.raised === false
      && g.r?.error === 'unknown_unlock:companion:whelp',
    `with the pre-check removed the handler did not answer: ${JSON.stringify(g)}. Layer A closes `
    + 'the ordinary case; Layer B is the ONLY thing standing between a concurrent wholesale '
    + '`delete from public.hr_unlocks` and a 500 mid-transaction.');
  ok('C1/layer-b-flags-the-race', g.raised === false && g.r?.detail?.raced === true,
    `the handler did not mark the refusal \`raced\`: ${JSON.stringify(g?.r)}. The ledger has to be `
    + 'able to tell "the row was already gone" from "it vanished while we held the lock" — a stale '
    + 'deploy from an active delete.');
  const egg = await one(db,
    `select qty from public.player_inventory where user_id='${UID}' and slot=0 and item_id='dragon_egg'`);
  /* ⚠ HONEST NOTE ON THIS ONE. It is a SECOND statement of a property the
     migration's own §4(f) already proves once Layer A is out of the way — the
     `consume_outside_subtransaction` mutation is refused by §4(f) under this
     arm's patch and never reaches here, so this line has no mutation proof of
     its own. It is kept deliberately: if §4(f)'s consume check were ever
     relaxed, this is what would still be standing, and the property (a refusal
     must not spend the player's egg) is worth two independent statements. */
  ok('C1/layer-b-rolls-the-consume-back', Number(egg?.qty) === 2,
    `the raced refusal left qty ${egg?.qty}, expected 2. This is the reason the consume, the grant, `
    + 'the version bump and the journal are ONE subtransaction: an exception block around the '
    + 'insert alone would leave the egg spent and the companion ungranted.');

  await db.close?.();
}

// ════════════════════════════════════════════════════════════════════════
// ARM 3 — the derivation chain, DERIVED from the manifest rather than
//   remembered. Whoever creates this function LAST wins; if that stops being
//   the hardening file, all three conditions are silently gone.
// ════════════════════════════════════════════════════════════════════════
async function armLastToucher() {
  const m = await manifest();
  const writers = [];
  for (const f of m.order) {
    let src = '';
    try { src = await mig(f); } catch { continue; }
    if (/create\s+or\s+replace\s+function\s+public\.hr_companion_grant\b/i.test(src)) writers.push(f);
  }
  ok('chain/function-has-a-writer', writers.length > 0,
    'no migration in the manifest creates public.hr_companion_grant');
  ok('chain/hardening-is-last-toucher', writers[writers.length - 1] === FIX,
    `the LAST migration to create public.hr_companion_grant is ${writers[writers.length - 1]}, not `
    + `${FIX}. Writers, in manifest order: [${writers.join(', ')}]. ${AUTHOR} is GENERATED from `
    + 'src/data/companions.js and still carries the PRE-hardening body, and its own §5/§6 '
    + 'self-checks pass on it — so whatever runs last decides, in silence. If a new file must own '
    + 'this body, it has to carry C1+C2+C3 forward and this guard has to be re-pointed at it '
    + 'deliberately.');
  ok('chain/generator-warns', /LAST TOUCHER/.test(await readFile(
    join(ROOT, 'tools', 'gen-companion-grants.mjs'), 'utf8')),
    'tools/gen-companion-grants.mjs no longer warns that regenerating + re-applying its output '
    + 'reverts the hardening. That warning sits at the exact keystroke where the mistake is made.');
}

// ════════════════════════════════════════════════════════════════════════
// ARM 4 — the revert, performed and measured, and the DECLARED repair proven.
//   This is the b453 incident in function form: re-apply the generated authoring
//   file alone and watch all three conditions vanish without a single error.
// ════════════════════════════════════════════════════════════════════════
/* ── ARM 3b — "SAFE TO RE-RUN", verified rather than claimed. §0 takes TWO
   pre-images: the reviewed pre-hardening body (by normalised hash) and an
   ALREADY-hardened one (by anchor), and refuses a third. The second branch is
   the one the Coordinator hits on a retry — an apply that half-succeeded, a
   timed-out connection, a re-run to confirm — and nothing else exercises it,
   because a fresh chain always meets the FIRST branch. */
async function armRerun(db) {
  let err = null;
  try { await db.exec(`begin;\n${await mig(FIX)}\ncommit;`); }
  catch (e) { await db.exec('rollback').catch(() => {}); err = String(e.message || e).split('\n')[0]; }
  ok('rerun/idempotent', err === null,
    `applying ${FIX} a SECOND time failed: ${err}. The header says SAFE TO RE-RUN and the `
    + 'Coordinator applies by hand; a file that refuses its own output turns a retry into an '
    + 'incident.');
  if (err === null) {
    const g = await grant(db, 'scorpion', 'drop:dunes');
    ok('rerun/behaviour-survives', g.raised === false && g.r?.ok === true,
      `after the re-run an ordinary grant answered ${JSON.stringify(g)}`);
    const g2 = await grant(db, 'whelp', 'hatch:dragon_egg');
    ok('rerun/C2-survives',
      g2.raised === false && (g2.r?.error === 'missing_req_item' || g2.r?.already_owned === true),
      `after the re-run C2 answered ${JSON.stringify(g2)}`);
  }
}

async function armRevertAndRepair(db) {
  await db.exec(`begin;\n${await mig(AUTHOR)}\ncommit;`).catch(async (e) => {
    await db.exec('rollback').catch(() => {});
    ok('revert/author-reapplies', false,
      `re-applying ${AUTHOR} alone failed: ${String(e.message || e).split('\n')[0]}. This guard `
      + 'cannot measure a hazard it cannot reproduce.');
  });

  // Measured, not assumed: the fake control is BACK and grants for free.
  await db.exec(`delete from public.player_progress
                  where user_id='${UID}' and key='companion:whelp';`);
  await db.exec(`delete from public.player_inventory
                  where user_id='${UID}' and item_id='dragon_egg';`);
  const g = await grant(db, 'whelp', 'hatch:dragon_egg');
  const reverted = g.raised === false && g.r?.ok === true;
  ok('revert/is-real', reverted,
    `re-applying ${AUTHOR} alone did NOT revert C2 (whelp answered ${JSON.stringify(g)}). Either `
    + 'the authoring file has been hardened too — in which case this arm and the header are stale '
    + '— or this guard is measuring nothing.');

  // …and the DECLARED repair is one file.
  await db.exec(`delete from public.player_progress
                  where user_id='${UID}' and key='companion:whelp';`);
  let repairFailed = null;
  try { await db.exec(`begin;\n${await mig(FIX)}\ncommit;`); }
  catch (e) { await db.exec('rollback').catch(() => {}); repairFailed = String(e.message || e).split('\n')[0]; }
  ok('repair/hardening-reapplies-onto-the-reverted-body', repairFailed === null,
    `the declared repair failed: ${repairFailed}. §0 pins the PRE-hardening body by normalised `
    + 'hash precisely so it can be re-applied on top of a revert; if it refuses there, the repair '
    + 'written into the manifest note does not work.');
  if (repairFailed === null) {
    const g2 = await grant(db, 'whelp', 'hatch:dragon_egg');
    ok('repair/restores-C2', g2.raised === false && g2.r?.error === 'missing_req_item',
      `after re-applying ${FIX} the fake control is still in place: ${JSON.stringify(g2)}`);
  }
  return reverted;
}

// ════════════════════════════════════════════════════════════════════════
// THE PLANTED DEFECTS. Each names WHAT must catch it — a mutation that trips
// some other assertion is a false green, so `expect` is checked, not just
// "something fired".
// ════════════════════════════════════════════════════════════════════════
const MUTATIONS = [
  {
    name: 'restore_fake_control',
    why: 'C2 reverted to the original measure-then-grant-anyway body.',
    patches: [[A_C2, A_C2_FAKE]],
    expect: { kind: 'chain', match: /C2/ },
  },
  {
    name: 'keep_source_key',
    why: "C3 reverted — the client's claim goes back to being called `source`, "
       + 'beside catalogue_source with equal standing.',
    patches: [[A_LEDGER, A_LEDGER_OLD]],
    expect: { kind: 'chain', match: /C3/ },
  },
  {
    name: 'swallow_all',
    why: 'the handler stops testing the message, so every 23514 the storage guard raises — '
       + 'unlock_wrong_kind, over_ceiling, bad_rung, not_storable, regressed — is swallowed and '
       + 'reported as a tidy unknown_unlock.',
    patches: [[A_RERAISE, '    null;']],
    expect: { kind: 'chain', match: /RE-RAISE/ },
  },
  {
    name: 'drop_translation',
    why: 'both C1 layers neutralised: the pre-check removed and the handler always re-raises. '
       + 'Every text anchor in §3 still passes, so ONLY the behavioural gate can see it.',
    patches: [[A_LAYER_A, A_LAYER_A_OFF], [A_RERAISE, '    if true then raise; end if;']],
    expect: { kind: 'chain', match: /§4\(f\)/ },
  },
  {
    name: 'fake_control_unguarded',
    why: "C2 reverted AND the migration's own C2 assertions removed — the edit that takes the "
       + 'property out in the same breath as the gate that grades it. Only this guard is left.',
    patches: [[A_C2, A_C2_FAKE], [A_S3_C2A, A_OFF], [A_S3_C2B, A_OFF], [A_S4_HEAD, A_S4_SKIP]],
    expect: { kind: 'arm', arm: 'conditions', assertion: 'C2/no-grant-without-req-item' },
  },
  {
    name: 'consume_outside_subtransaction',
    why: 'the req_item consume moved OUT of the block the handler wraps, so a raced refusal spends '
       + "the player's egg and grants nothing. INVISIBLE to the base chain — Layer A returns "
       + 'before the consume in every case a single backend can construct, so the migration '
       + 'applies clean. It is caught by the migration\'s own §4(f) running UNDER ARM 2\'s patch, '
       + 'which is the whole reason arm 2 boots a full chain instead of poking the function: '
       + "removing Layer A puts the migration's own gate on Layer B's path.",
    patches: [[A_ATOMIC, A_ATOMIC_OFF]],
    expect: { kind: 'armChain', match: /CONSUMED the req_item/ },
  },
  {
    name: 'constant_raced',
    why: 'the handler stops flagging the refusal `raced`, so the ledger can no longer tell "the '
       + 'catalogue row was already gone" (a stale deploy) from "it vanished while we held the '
       + 'character lock" (a wholesale delete in flight).',
    patches: [[A_RACED_FLAG, A_RACED_FLAG_OFF]],
    expect: { kind: 'arm', arm: 'layerB', assertion: 'C1/layer-b-flags-the-race' },
  },
];

// ════════════════════════════════════════════════════════════════════════
async function run({ mutation = null } = {}) {
  problems = [];
  const patches = mutation ? new Map([[FIX, mutation.patches]]) : null;

  let db = null;
  let chainError = null;
  try {
    ({ db } = await bootReplay(patches ? { patches } : {}));
  } catch (e) {
    if (e.harness) throw e;                 // a broken anchor is not a result
    chainError = String(e.message || e);
  }

  if (chainError === null) {
    await signIn(db, UID);
    await armConditions(db);
    await armRerun(db);
    await armRevertAndRepair(db);
    await db.close?.();
  }
  if (!mutation) {
    await armLastToucher();
    await armLayerB();
  } else if (mutation.expect.kind === 'armChain'
             || (mutation.expect.kind === 'arm' && mutation.expect.arm === 'layerB')) {
    // Arm 2 boots its OWN chain, so a defect aimed at Layer B has to be carried
    // into that boot on top of arm 2's own patches.
    await armLayerB(mutation.patches);
  }
  return { chainError };
}

export async function companionGrantHardeningGuard() {
  const { chainError } = await run();
  if (chainError) {
    return [`THE REPO CANNOT REBUILD THE DATABASE WITH ${FIX}: ${chainError.split('\n')[0]}`];
  }
  return problems.map((p) => `${p.name}: ${p.msg}`);
}

const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/companion-grant-hardening.mjs');
if (RUN_DIRECTLY) {
  const selftest = process.argv.includes('--selftest');
  if (selftest) {
    let missed = 0;
    for (const m of MUTATIONS) {
      const { chainError } = await run({ mutation: m });
      let caught = false; let how = '';
      if (m.expect.kind === 'chain') {
        // The migration's OWN gate must refuse to install the defect.
        caught = !!chainError && m.expect.match.test(chainError);
        how = chainError
          ? `the chain REFUSED to apply: ${chainError.split('\n').slice(0, 2).join(' ').slice(0, 200)}`
          : 'the chain applied cleanly';
      } else if (m.expect.kind === 'armChain') {
        // The base chain applies; ARM 2's boot is what refuses, because removing
        // Layer A puts the migration's own gate on Layer B's path.
        caught = chainError === null && fired('C1/layer-b-arm-can-run', m.expect.match);
        how = chainError
          ? `the BASE chain refused (${chainError.split('\n')[0].slice(0, 120)}) — this mutation is `
            + 'supposed to be invisible there'
          : (problems.length
            ? `the guard fired: ${problems.map((p) => p.name).join(', ')}`
            : 'nothing fired');
      } else {
        caught = chainError === null && fired(m.expect.assertion);
        how = chainError
          ? `the chain refused (${chainError.split('\n')[0].slice(0, 120)}) — but this mutation is `
            + 'supposed to get PAST the migration and be caught by the guard'
          : (problems.length
            ? `the guard fired: ${problems.map((p) => p.name).join(', ')}`
            : 'nothing fired');
      }
      if (caught) console.log(`CAUGHT  ${m.name}\n          ${how}`);
      else {
        console.error(`MISSED  ${m.name}  (expected ${m.expect.kind === 'arm'
          ? `assertion ${m.expect.assertion}`
          : `${m.expect.kind === 'chain' ? 'the chain' : "arm 2's boot"} to refuse with `
            + `/${m.expect.match.source}/`})\n          ${how}`);
        missed += 1;
      }
    }
    if (missed) {
      console.error(`\n${missed} of ${MUTATIONS.length} planted defects were NOT caught.`);
      process.exit(1);
    }
    console.log(`\nall ${MUTATIONS.length} planted defects caught, each by the named check that is `
      + "supposed to see it: the migration's own text anchors, its behavioural gate, and this "
      + "guard's independent measurement.");
    process.exit(0);
  }

  const { chainError } = await run();
  if (chainError) {
    console.error(`companion-grant-hardening: the chain would not apply\n  ${chainError}`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`companion-grant-hardening: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  x ${p.name}\n      ${p.msg}`);
    process.exit(1);
  }
  console.log('companion-grant-hardening: green — C1 answers a missing companion:<id> catalogue row '
    + 'with unknown_unlock:<key> instead of raising 23514, on both layers, consuming nothing and '
    + 'still re-raising every other storage-guard violation; C2 refuses whelp without its '
    + 'dragon_egg and consumes exactly one when held; C3 records claimed_source separately from '
    + `catalogue_source on both surfaces the verb writes; ${FIX} is the manifest's last toucher, `
    + `and re-applying ${AUTHOR} alone reverts all three (measured) while re-applying the hardening `
    + 'file repairs it.');
}
