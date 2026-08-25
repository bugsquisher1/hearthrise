// ════════════════════════════════════════════════════════════════════════
// tests/eat-intent.mjs — THE MANUAL-EAT INTENT, GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/eat-intent.mjs
//
// Ships with: supabase/functions/hr-accrue/eat.js, src/net/eat.js.
// Spec: eat.js's header. The P0 (Paione, 2026-08-25, QA slot 0): manual eat
// debited G.inventory CLIENT-ONLY and sent no intent, so the absolute inventory
// reconcile RESTORED the eaten OWNABLE food on the next envelope/reload — a free
// heal AND a dupe.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────────
// The REAL `runEat` bytes, behind the same one-statement `exec` seam index.ts
// gives it, against the REAL migration chain in PGlite (real PostgreSQL, in
// process). What it cannot exercise: the pooler, `set local role` as a
// connection property, the JWT, and TRUE concurrency (PGlite is one backend).
//
// THE CENTRAL ASSERTION (E3): after an eat, player_inventory holds ONE FEWER
// unit — the food is really gone server-side, so the absolute reconcile that
// used to restore it now reflects the debit. That is the dupe, closed.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import { runEat, resolveFood, eatDelta, VERB } from '../supabase/functions/hr-accrue/eat.js';
import {
  INTENT_REGISTRY, guardStampKeys, collectsFirst, requiresKey, STATELESS_REFUSALS,
  refusalCarriesState, INTENT_ERRORS,
} from '../supabase/functions/hr-accrue/intents.js';
import { VERBS } from '../supabase/functions/hr-accrue/request.js';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const UID = '000000ea-0000-4000-a000-0000000000ea';
const uuid = () => crypto.randomUUID();

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module,
 *  wrapped in `set role hr_engine` (zero table privileges, EXECUTE on the
 *  engine's allowlist), so a verb that tried to touch a table directly is
 *  refused here exactly as in production. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
}
async function asEngine(db, sql, params) {
  await db.exec('set role hr_engine');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
const versionOf = async (db) => Number((await db.query(
  'select version::text v from player_state where user_id=$1 and slot=0', [UID])).rows[0].v);
const invOf = async (db, id) => Number((await db.query(
  'select qty::text q from player_inventory where user_id=$1 and slot=0 and item_id=$2', [UID, id])).rows[0]?.q ?? 0);
const hpOf = async (db) => Number((await db.query(
  'select hp::text h from player_state where user_id=$1 and slot=0', [UID])).rows[0].h);
const maxHpOf = async (db) => Number((await db.query(
  'select max_hp::text m from player_state where user_id=$1 and slot=0', [UID])).rows[0].m);

/** An admin apply — grant items / set hp the server's own way, never a raw
    INSERT (the harness must not take a privilege the engine lacks). */
async function admin(db, delta) {
  const rows = await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r',
    [UID, await versionOf(db), uuid(), JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 'eat_probe' } })]);
  return rows[0].r;
}

// ════════════════════════════════════════════════════════════════════════
// PART 1 — THE CONTRACT, read out of the modules. No database.
// ════════════════════════════════════════════════════════════════════════
export function contractGuard() {
  ok(VERBS.includes('eat'), 'C0: `eat` is not in request.js VERBS — index.ts would answer unknown_verb');
  const row = INTENT_REGISTRY[VERB];
  ok(!!row, 'C0: there is no INTENT_REGISTRY row for `eat` — intentSpec would throw and index.ts 500');
  ok(row && row.needsKey === true, 'C0: eat does not require an idempotency key — a replayed debit could double');
  ok(requiresKey(VERB) === true, 'C0: requiresKey(eat) is not true');
  /* DERIVED, not preferred: an eat delta carries items+hp, neither a stamping
     key, so it must NOT collect first (that would cost a round trip for nothing)
     — and guardStampKeys must AGREE against the delta the verb actually builds. */
  ok(collectsFirst(VERB) === false, 'C0: eat collectsFirst is not false');
  const d = eatDelta({ item: 'turnip', name: 'Turnip', heals: 2, hasBuff: false }, 7);
  ok(d.items && d.items.turnip === -1, 'C1: eatDelta does not debit exactly one unit');
  ok(d.hp === 7, 'C1: eatDelta did not carry the server-computed hp');
  ok(d.journal && d.journal.kind === 'combat' && d.journal.intent === 'eat:turnip',
    'C1: eatDelta journal is not {kind:combat, intent:eat:turnip}');
  ok(guardStampKeys(VERB, d) === null, 'C1: guardStampKeys refused a plain eat delta — it must not stamp');
  /* A buff-only food (heals 0) debits the item but writes no hp key. */
  const db2 = eatDelta({ item: 'x', name: 'X', heals: 0, hasBuff: true }, 5);
  ok(!('hp' in db2), 'C1: a heals:0 food must not carry an hp key');
  ok(db2.items.x === -1, 'C1: a buff-only food must still debit the item');

  // resolveFood classifications — pure, catalogue-driven.
  ok(resolveFood('turnip').ok === true && resolveFood('turnip').heals === 2,
    'C2: turnip does not resolve as food heals:2');
  ok(resolveFood('').error === INTENT_ERRORS.BAD_ITEM, 'C2: empty id is not bad_item');
  ok(resolveFood('not_a_real_item_zzz').error === INTENT_ERRORS.UNKNOWN_ITEM, 'C2: junk id is not unknown_item');
  /* A real, non-food item (bronze bar) must be item_not_food, not unknown_item. */
  ok(resolveFood('bronze_bar').error === INTENT_ERRORS.ITEM_NOT_FOOD,
    'C2: bronze_bar is not classified item_not_food');
  /* constructor/__proto__ must be UNKNOWN, never read as a truthy food. */
  ok(resolveFood('constructor').error === INTENT_ERRORS.UNKNOWN_ITEM,
    'C2: `constructor` was not refused unknown_item (catalogueGet defence)');

  ok(STATELESS_REFUSALS.includes(INTENT_ERRORS.ITEM_NOT_FOOD), 'C3: item_not_food must be stateless (pre-DB)');
  ok(refusalCarriesState(INTENT_ERRORS.ALREADY_FULL) === true,
    'C3: already_full must carry state — it is decided after the server hp read');
}

// ════════════════════════════════════════════════════════════════════════
// PART 2 — BEHAVIOUR, against the real chain.
// ════════════════════════════════════════════════════════════════════════
export async function behaviourGuard() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    problems.push(`EAT-SQL: the migration chain would not apply — ${e.message}`);
    return;
  }
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [UID, 'EatProbe']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [UID]);

  const exec = makeExec(db);
  const call = (o) => runEat({ exec, user: UID, slot: 0, intentId: uuid(), ...o });
  try { await body(db, call); } catch (e) {
    problems.push(`EAT-SQL: the behaviour guard threw — ${e && e.stack || e}`);
  }
}

async function body(db, call) {
  // E1. NO CHARACTER — before anything exists.
  {
    const r = await call({ item: 'turnip' });
    ok(r.status === 409 && r.body.error === 'no_character',
      `E1: an empty slot returned ${r.status} ${JSON.stringify(r.body)}`);
  }

  const cr = (await db.query('select hr_create_character(0) r')).rows[0].r;
  if (cr.ok !== true) { problems.push(`EAT-SQL: hr_create_character failed — ${JSON.stringify(cr)}`); return; }

  const maxHp = await maxHpOf(db);
  // Grant 3 turnips and set hp to 5 so a +2 heal is observable and unclamped.
  ok((await admin(db, { items: { turnip: 3 }, hp: 5 })).ok === true, 'E2-SETUP: grant/hp admin refused');
  ok(await invOf(db, 'turnip') === 3, 'E2-SETUP: turnips did not land');
  ok(await hpOf(db) === 5, 'E2-SETUP: hp was not set to 5');

  // E3. THE FIX — AN EAT DEBITS THE FOOD SERVER-SIDE AND CREDITS THE HEAL.
  {
    const r = await call({ item: 'turnip' });
    ok(r.status === 200 && r.body.ok === true,
      `E3: an honest eat was refused — ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(await invOf(db, 'turnip') === 2,
      `E3: the eaten turnip did not leave the bag server-side (qty=${await invOf(db, 'turnip')}). `
      + 'This is the P0: it is what the absolute reconcile reads, and a non-debit is the food "returning".');
    ok(await hpOf(db) === 7, `E3: hp is ${await hpOf(db)}, expected 7 (5 + turnip heals 2)`);
    ok(r.body.receipt && r.body.receipt.item === 'turnip' && r.body.receipt.heals === 2,
      'E3: the receipt did not describe the eat');
  }

  // E4. IDEMPOTENT ON REPLAY — the SAME key debits EXACTLY ONCE.
  {
    const key = uuid();
    const a = await runEat({ exec: makeExec(db), user: UID, slot: 0, intentId: key, item: 'turnip' });
    ok(a.status === 200 && a.body.ok === true, `E4: first eat failed — ${JSON.stringify(a.body).slice(0, 200)}`);
    ok(await invOf(db, 'turnip') === 1, `E4: after one eat turnip=${await invOf(db, 'turnip')}, expected 1`);
    const hpAfter = await hpOf(db);
    const b = await runEat({ exec: makeExec(db), user: UID, slot: 0, intentId: key, item: 'turnip' });
    ok(b.body.replayed === true || (b.body.ok === true),
      `E4: replay did not return ok — ${JSON.stringify(b.body).slice(0, 200)}`);
    ok(await invOf(db, 'turnip') === 1,
      `E4: A REPLAY DOUBLE-DEBITED (turnip=${await invOf(db, 'turnip')}, expected 1). Idempotency is broken.`);
    ok(await hpOf(db) === hpAfter, 'E4: a replay moved hp a second time');
    ok(b.body.receipt == null, 'E4: a replay must not report a receipt (this invocation moved nothing)');
  }

  // E5. OVER-EAT — a NEW key with no stock left is insufficient_item, nothing
  // lost. hp is dropped below max first so the no-stock eat reaches the DEBIT
  // (the already_full guard fires before it, and would mask insufficient_item).
  {
    ok((await admin(db, { hp: 3 })).ok === true, 'E5-SETUP: hp admin refused');
    let guard = 0;
    while (await invOf(db, 'turnip') > 0 && guard++ < 10) { await call({ item: 'turnip' }); }
    ok(await invOf(db, 'turnip') === 0, 'E5-SETUP: could not drain the stack');
    await admin(db, { hp: 3 });                  // eating may have topped hp up
    const r = await call({ item: 'turnip' });    // none left
    ok(r.status === 409 && r.body.error === 'insufficient_item',
      `E5: eating with no stock returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await invOf(db, 'turnip') === 0, 'E5: a refused eat changed the stack');
    ok(refusalCarriesState('insufficient_item') && r.body.state,
      'E5: the insufficient_item refusal did not carry the envelope for the client to reconcile to');
  }

  // E6. THE HP CLAMP — a heal never exceeds max_hp.
  {
    ok((await admin(db, { items: { turnip: 1 }, hp: maxHp - 1 })).ok === true, 'E6-SETUP: admin refused');
    const r = await call({ item: 'turnip' });    // heals 2, but only 1 below max
    ok(r.body.ok === true, `E6: eat refused — ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await hpOf(db) === maxHp, `E6: hp is ${await hpOf(db)}, must clamp to max_hp ${maxHp}`);
  }

  // E7. ALREADY-FULL — a pure heal at full HP is refused, food KEPT.
  {
    ok((await admin(db, { items: { turnip: 1 }, hp: maxHp })).ok === true, 'E7-SETUP: admin refused');
    const before = await invOf(db, 'turnip');
    const r = await call({ item: 'turnip' });
    ok(r.status === 409 && r.body.error === 'already_full',
      `E7: a pure heal at full HP returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await invOf(db, 'turnip') === before, 'E7: already_full still consumed the food');
    ok(r.body.state, 'E7: already_full did not carry the envelope');
  }

  // E8. INTENT_MISMATCH — one key reused for a DIFFERENT food is refused loudly.
  {
    ok((await admin(db, { items: { turnip: 1, shrimp: 1 } })).ok === true, 'E8-SETUP: admin refused');
    // put hp below max so neither eat is already_full
    await admin(db, { hp: 3 });
    const key = uuid();
    const a = await runEat({ exec: makeExec(db), user: UID, slot: 0, intentId: key, item: 'turnip' });
    ok(a.body.ok === true, `E8: first eat failed — ${JSON.stringify(a.body).slice(0, 200)}`);
    const shrimpBefore = await invOf(db, 'shrimp');
    const b = await runEat({ exec: makeExec(db), user: UID, slot: 0, intentId: key, item: 'shrimp' });
    ok(b.body.error === 'intent_mismatch',
      `E8: a key reused for a different food returned ${JSON.stringify(b.body).slice(0, 200)} (want intent_mismatch)`);
    ok(await invOf(db, 'shrimp') === shrimpBefore, 'E8: the mismatched eat still debited the other food');
  }
}

export async function runAll() {
  contractGuard();
  await behaviourGuard();
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('eat-intent.mjs')) {
  const fails = await runAll();
  if (fails.length) { console.error('EAT-INTENT RED:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('eat-intent: all guards green');
}
