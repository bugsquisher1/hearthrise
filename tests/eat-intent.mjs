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
import { isMain } from './_is-main.mjs';
/* The player-facing half of this verb's refusals — pure, so it is graded here
   rather than only in a browser. */

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
  /* Derived from Level and armour since the core rebuild (no stored column). */
  "select (public.hr_vitals_of($1::uuid, 0)->>'max_hp') m", [UID])).rows[0].m);

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
  /* SETTLE BEFORE THE EAT (Security F1, 2026-09-28): a buff eaten at return was
     paid over the whole absence, so eat settles the open window first. Its delta
     still carries no stamping key — eat is not a switch — and guardStampKeys
     must AGREE against the delta the verb actually builds.
     tests/absence-priced-at-return.mjs R2 measures the settle itself. */
  ok(collectsFirst(VERB) === true, 'C0: eat does not settle first — a feast eaten at return is paid over the whole absence');
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
  /* Food heals moved x12 with monster damage (CORE_NUMBERS Q3): a turnip heals 24. */
  ok(resolveFood('turnip').ok === true && resolveFood('turnip').heals === 24,
    'C2: turnip does not resolve as food heals:24');
  ok(resolveFood('').error === INTENT_ERRORS.BAD_ITEM, 'C2: empty id is not bad_item');
  ok(resolveFood('not_a_real_item_zzz').error === INTENT_ERRORS.UNKNOWN_ITEM, 'C2: junk id is not unknown_item');
  /* A real, non-food item (bronze bar) must be item_not_food, not unknown_item. */
  ok(resolveFood('bronze_bar').error === INTENT_ERRORS.ITEM_NOT_FOOD,
    'C2: bronze_bar is not classified item_not_food');
  /* constructor/__proto__ must be UNKNOWN, never read as a truthy food. */
  ok(resolveFood('constructor').error === INTENT_ERRORS.UNKNOWN_ITEM,
    'C2: `constructor` was not refused unknown_item (catalogueGet defence)');

  ok(STATELESS_REFUSALS.includes(INTENT_ERRORS.ITEM_NOT_FOOD), 'C3: item_not_food must be stateless (pre-DB)');
  /* A FULL-HP EAT IS REFUSED, AND SAYS WHY (2026-10-31). The gate was once absent on purpose: a client-predicted
     fight read stale-full on the server (Paione's P0). Fights are the engine's now and a manual eat in a hunt is
     hunt_open (E9), so the server's hp is the hero's. It is decided after the read, so it carries the envelope. */
  ok(INTENT_ERRORS.ALREADY_FULL === 'already_full' && refusalCarriesState('already_full') === true,
    'C3: there is no already_full code carrying the envelope — a full-HP eat in town spends the food for nothing');
  ok(refusalCarriesState('insufficient_item') === true,
    'C3: insufficient_item must carry state so the client reconciles a refused over-eat');
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
  // Grant 3 turnips and set hp to 5 so a +24 heal is observable and unclamped (max HP 150 at Level 1).
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
    ok(await hpOf(db) === 29, `E3: hp is ${await hpOf(db)}, expected 29 (5 + turnip heals 24)`);
    ok(r.body.receipt && r.body.receipt.item === 'turnip' && r.body.receipt.heals === 24,
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
  // lost. (No already_full gate to work around any more — drain and probe.)
  {
    let guard = 0;
    while (await invOf(db, 'turnip') > 0 && guard++ < 10) { await call({ item: 'turnip' }); }
    ok(await invOf(db, 'turnip') === 0, 'E5-SETUP: could not drain the stack');
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
    const r = await call({ item: 'turnip' });    // heals 24, but only 1 below max
    ok(r.body.ok === true, `E6: eat refused — ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await hpOf(db) === maxHp, `E6: hp is ${await hpOf(db)}, must clamp to max_hp ${maxHp}`);
  }

  // E7. AT FULL HP IN TOWN THE EAT IS REFUSED AND THE FOOD STAYS (2026-10-31: "eating at full HP wastes food in
  // town"; say-why). A plain food: already_full, nothing leaves the bag, HP unmoved, the envelope carried. A food
  // that carries a buff still eats at full HP (the buff is the point): it is debited once.
  {
    ok((await admin(db, { items: { turnip: 1, roasted_carrot: 1 }, hp: maxHp })).ok === true, 'E7-SETUP: admin refused');
    const before = await invOf(db, 'turnip');
    const r = await call({ item: 'turnip' });
    ok(r.status === 409 && r.body.error === 'already_full' && r.body.state,
      `E7: an eat at full HP in town returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)} (want 409 already_full with the envelope)`);
    ok(await invOf(db, 'turnip') === before,
      `E7: the food was spent at full HP (turnip ${await invOf(db, 'turnip')}, expected ${before}): eaten for nothing`);
    ok(await hpOf(db) === maxHp, `E7: a refused full-HP eat moved hp (${await hpOf(db)} vs ${maxHp})`);
    const b = await call({ item: 'roasted_carrot' });
    ok(b.status === 200 && b.body.ok === true && await invOf(db, 'roasted_carrot') === 0,
      `E7: a food with a buff at full HP did not eat (${b.status} ${JSON.stringify(b.body).slice(0, 200)}): its buff is the point`);
  }

  // E8. INTENT_MISMATCH — one key reused for a DIFFERENT food is refused loudly.
  {
    ok((await admin(db, { items: { turnip: 1, shrimp: 1 } })).ok === true, 'E8-SETUP: admin refused');
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

  // E9. ON A HUNT THE MANUAL EAT IS REFUSED (Security, reopen review 2026-10-19): in a hunt HP lives on the
  // instance's unit and the next settle writes it back, so a manual eat would be lost and paid for. The
  // bar's food slots eat in a hunt; nothing leaves the bag and HP does not move.
  {
    await db.query(`insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at)
                    values ($1, 0, 'mill_cellar', now(), now(), now())`, [UID]);
    const before = await invOf(db, 'turnip'), hp0 = await hpOf(db);
    const r = await call({ item: 'turnip' });
    ok(r.status === 409 && r.body.error === 'hunt_open',
      `E9: a manual eat during an open hunt returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)} (want 409 hunt_open)`);
    ok(await invOf(db, 'turnip') === before && await hpOf(db) === hp0, 'E9: the refused hunt eat still moved the bag or HP');
    await db.query('delete from public.hunt_sessions where user_id = $1', [UID]);
  }
}

/* (The refusal-copy table lived in the client's src/net/eat.js and retired with it on
   2026-10-17; the refusal CODES are still pinned by the contract and behaviour guards.) */

export async function runAll() {
  contractGuard();
  await behaviourGuard();
  return problems;
}

if (isMain(import.meta.url)) {
  const fails = await runAll();
  if (fails.length) { console.error('EAT-INTENT RED:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('eat-intent: all guards green');
}
