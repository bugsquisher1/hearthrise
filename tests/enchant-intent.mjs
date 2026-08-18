// ════════════════════════════════════════════════════════════════════════
// tests/enchant-intent.mjs — THE ENCHANT INTENT (ELEMENTS v1), GRADED AGAINST
// REAL POSTGRESQL.
//
//   node tests/enchant-intent.mjs
//
// Ships with: supabase/functions/hr-accrue/enchant.js,
//             supabase/migrations/2026-08-18-enchant.sql,
//             tools/gen-catalogues.mjs (hr_runes), tools/derive-enchant.mjs.
//
// ── WHAT IT DRIVES, AND THE ONE COUPLING IT CANNOT CLOSE ─────────────────
// PART 1 drives the pure contract (registry, delta, wire, catalogues) out of
// the real modules. PART 2 drives the AUTHORITY — hr_apply's enchant block —
// directly through the `hr_engine` seam, against the REAL migration chain in
// PGlite (real PostgreSQL, in process), with a SYNTHETIC rune seeded into
// hr_runes.
//
// The rune `element` data now lives in src/data/items.js (`tag:'rune'`), so
// hr_runes is seeded by the catalogue and RUNE_ELEMENT is populated. PART 2
// drives BOTH halves:
//   · N1–N7 exercise the AUTHORITY (hr_apply's enchant block) directly through
//     the `hr_engine` seam: resolve, debit-once, idempotency, the weapon gate,
//     unknown_item and the §S5 window stamp — the invariants a compromised Edge
//     Function cannot lie to.
//   · N8–N9 exercise the REAL runEnchant bytes end-to-end (early answer ->
//     collect -> apply): an honest enchant states the server's enchant, and
//     collectsFirst settles the pre-enchant window BEFORE the rune lands.
//
// What PART 2 cannot exercise: the pooler, `set local role hr_engine` as a
// connection property, the JWT, and TRUE concurrency (PGlite is one backend).
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import {
  runEnchant, validateOp, enchantDelta, VERB,
} from '../supabase/functions/hr-accrue/enchant.js';
import { readEnchant, INTENT_KEYS } from '../supabase/functions/hr-accrue/request.js';
import {
  INTENT_REGISTRY, guardStampKeys, collectsFirst, rateBucketFor, STATELESS_REFUSALS,
  STAMP_KEYS, STAMPING_DELTA_KEYS,
} from '../supabase/functions/hr-accrue/intents.js';
import { RUNE_ELEMENT, ENCHANT_SLOTS } from '../supabase/functions/hr-accrue/catalogue.js';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const UID = '000000ec-0000-4000-a000-0000000000ec';
const uuid = () => crypto.randomUUID();

// The rune data now lives in src/data/items.js (tag:'rune'), so hr_runes is
// seeded by the catalogue and RUNE_ELEMENT is populated. ember_rune is a real
// item AND a real rune, so the admin grant (validated against hr_items) and the
// enchant (resolved against hr_runes) both accept it end-to-end.
const RUNE = 'ember_rune';
const EL = 'ember';

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

/** An admin grant of items, applied the server's own way (never a raw INSERT —
    that would be the harness taking a privilege the engine does not have). */
async function grant(db, version, items) {
  const rows = await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r', [
    UID, version, uuid(),
    JSON.stringify({ items, journal: { kind: 'admin', intent: 'enchant_probe_grant' } }),
  ]);
  return rows[0].r;
}

/** Apply an ENCHANT delta directly through hr_apply — the authority the Edge
    verb proposes to. `intentId` is passed so idempotency can be exercised. */
async function applyEnchant(db, version, rune, { slot = 'weapon', intentId = uuid() } = {}) {
  const delta = enchantDelta(slot, rune);
  const rows = await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r',
    [UID, version, intentId, JSON.stringify(delta)]);
  return { res: rows[0].r, intentId };
}

const versionOf = async (db) => Number((await db.query(
  'select version::text v from player_state where user_id=$1 and slot=0', [UID])).rows[0].v);
const invOf = async (db, id) => Number((await db.query(
  'select qty::text q from player_inventory where user_id=$1 and slot=0 and item_id=$2',
  [UID, id])).rows[0]?.q ?? 0);
const enchOf = async (db, s) => (await db.query(
  "select enchant->>$2 e from player_state where user_id=$1 and slot=0", [UID, s])).rows[0]?.e ?? null;
const eqOf = async (db, s) => (await db.query(
  'select item_id from player_equipment where user_id=$1 and slot=0 and equip_slot=$2',
  [UID, s])).rows[0]?.item_id ?? null;

// ════════════════════════════════════════════════════════════════════════
// PART 1 — THE CONTRACT, out of the modules. No database.
// ════════════════════════════════════════════════════════════════════════
export function contractGuard() {
  // ── N0. THE REGISTRY ROW ────────────────────────────────────────────────
  const row = INTENT_REGISTRY[VERB];
  ok(!!row, 'N0: no INTENT_REGISTRY row for `enchant` — index.ts would 500 on dispatch');
  ok(row && row.needsKey === true, 'N0: the enchant verb does not require an idempotency key');
  ok(collectsFirst(VERB) === true,
    'N0: `enchant` does not collect first. hr_apply stamps accrued_to on an enchant delta, so every '
    + 'gesture would confiscate the unpaid window — and applying after the collect would price the '
    + 'window at the OLD element, which is the "fight cheap, enchant, settle" exploit.');
  ok(rateBucketFor(VERB) === 'activity',
    `N0: the enchant verb spends the '${rateBucketFor(VERB)}' bucket — an unknown bucket fails closed`);

  // ── N0b. THE STAMP GUARD, PROVEN BOTH WAYS ──────────────────────────────
  ok(STAMP_KEYS.includes('enchant') && STAMPING_DELTA_KEYS.includes('enchant'),
    'N0b: `enchant` is not in STAMP_KEYS/STAMPING_DELTA_KEYS — hr_apply stamps accrued_to on it, so '
    + 'the guard that enforces collect-before-enchant is blind to the very key it must watch');
  const d = enchantDelta('weapon', RUNE);
  ok(guardStampKeys(VERB, d) === null,
    'N0b: guardStampKeys refuses the enchant verb its own delta — registry and delta disagree');
  ok(guardStampKeys('shop_buy', d) !== null,
    'N0b-CONTROL: guardStampKeys ADMITS an enchant delta on a non-collecting verb — the guard is '
    + 'decoration, and a buy-and-enchant delta would silently confiscate every buyer\'s window');

  // ── N0c. THE WIRE CARRIES NAMES, NEVER NUMBERS ──────────────────────────
  ok(INTENT_KEYS.includes('enchant'), 'N0c: `enchant` is not in INTENT_KEYS — parseIntent drops it');
  for (const bad of ['element', 'power', 'magnitude', 'success', 'qty', 'stats']) {
    ok(!JSON.stringify(d).includes(`"${bad}"`),
      `N0c: the enchant delta carries a '${bad}' field — no computed value may cross this boundary`);
  }
  ok(d.enchant && d.enchant.weapon === RUNE,
    'N0c: the enchant delta carries the RUNE id (hr_apply resolves the element), not an element');
  ok(d.journal && d.journal.kind === 'enchant' && d.journal.intent === 'enchant:weapon',
    `N0c: the enchant journal is ${JSON.stringify(d.journal)} — kind must be 'enchant', intent 'enchant:weapon'`);

  // ── N0d. THE PARSER REFUSES HOSTILE SHAPES ──────────────────────────────
  const HOSTILE = [
    ['a scalar', { enchant: 7 }],
    ['an array', { enchant: ['weapon'] }],
    ['a numeric rune', { enchant: { slot: 'weapon', rune: 5 } }],
    ['an uppercase rune id', { enchant: { slot: 'weapon', rune: 'Ember_Rune' } }],
    ['a slot with punctuation', { enchant: { slot: 'wea pon', rune: 'ember_rune' } }],
    ['an over-long rune id', { enchant: { slot: 'weapon', rune: 'a'.repeat(65) } }],
  ];
  for (const [what, body] of HOSTILE) {
    const p = readEnchant(body);
    /* A non-object `enchant` reads as whole-null; a readable object with a bad
       slot or rune nulls that field. Either way the gesture is not complete. */
    ok(p === null || p.slot === null || p.rune === null,
      `N0d: readEnchant accepted ${what} as complete (${JSON.stringify(p)})`);
  }
  const good = readEnchant({ enchant: { slot: 'weapon', rune: 'ember_rune' } });
  ok(good && good.slot === 'weapon' && good.rune === 'ember_rune',
    `N0d-CONTROL: readEnchant refused an HONEST {slot,rune} — ${JSON.stringify(good)}`);
  ok(Object.getPrototypeOf(good) === null,
    'N0d: readEnchant returned a map with a prototype — a `__proto__` own key off the wire is then a '
    + 'live hazard for every downstream lookup');
  ok(readEnchant({}) === null && readEnchant({ enchant: undefined }) === null,
    'N0d: an absent enchant key did not read as null');

  // ── N0e. validateOp — THE EARLY ANSWER ──────────────────────────────────
  ok(validateOp(null).error === 'bad_enchant', 'N0e: validateOp(null) is not bad_enchant');
  ok(validateOp({ slot: null, rune: 'ember_rune' }).error === 'bad_enchant',
    'N0e: a null slot is not bad_enchant');
  ok(validateOp({ slot: 'shield', rune: 'ember_rune' }).error === 'wrong_slot',
    'N0e: a non-weapon slot must be wrong_slot (v1 enchants the weapon only)');
  /* A REAL rune resolves (the data has landed); an id absent from RUNE_ELEMENT
     is unknown_item — the fail-closed answer. */
  ok(validateOp({ slot: 'weapon', rune: RUNE }).ok === true,
    `N0e: a real rune (${RUNE}) was not accepted — ${JSON.stringify(validateOp({ slot: 'weapon', rune: RUNE }))}`);
  ok(validateOp({ slot: 'weapon', rune: 'not_a_real_rune_xyz' }).error === 'unknown_item',
    'N0e: a rune absent from RUNE_ELEMENT must be unknown_item');

  // ── N0f. THE CATALOGUES ARE null-PROTOTYPE ──────────────────────────────
  ok(Object.getPrototypeOf(RUNE_ELEMENT) === null && Object.getPrototypeOf(ENCHANT_SLOTS) === null,
    'N0f: a rune/slot catalogue has a prototype — `constructor` is a legal id by the wire regex and '
    + 'is TRUTHY on a plain object');
  ok(ENCHANT_SLOTS.weapon === true && ENCHANT_SLOTS.shield !== true,
    'N0f: ENCHANT_SLOTS must allow exactly the weapon slot in v1');

  // ── N0g. THE STATELESS ALLOWLIST ────────────────────────────────────────
  ok(STATELESS_REFUSALS.includes('bad_enchant'),
    'N0g: bad_enchant is not on STATELESS_REFUSALS — a shape refusal would read a full hr_state_of');
  /* wrong_slot and insufficient_item are hr_apply's answers under the lock (the
     empty-weapon and ownership checks), so they must carry an envelope. NOTE
     `unknown_item` is DELIBERATELY NOT here: it is answered from the in-process
     catalogue before any DB (shared with the gold verbs), so it is legitimately
     stateless — the same two-producer tolerance `bad_enchant`/`bad_equip` have. */
  for (const code of ['wrong_slot', 'insufficient_item']) {
    ok(!STATELESS_REFUSALS.includes(code),
      `N0g: '${code}' is on STATELESS_REFUSALS — it is answered by hr_apply under the lock, and a `
      + 'refusal the client cannot reconcile from leaves it guessing');
  }
}

// ════════════════════════════════════════════════════════════════════════
// PART 2 — THE AUTHORITY (hr_apply's enchant block) against the real chain.
// ════════════════════════════════════════════════════════════════════════
export async function behaviourGuard() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    problems.push(`ENCHANT-SQL: the migration chain would not apply — ${e.message}`);
    return;
  }
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [UID, 'EnchantProbe']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [UID]);

  try { await body(db); } catch (e) {
    problems.push(`ENCHANT-SQL: the behaviour guard threw — ${e && e.message}`);
  }
}

async function body(db) {
  const cr = (await db.query('select hr_create_character(0) r')).rows[0].r;
  if (cr.ok !== true) { problems.push(`ENCHANT-SQL: hr_create_character failed — ${JSON.stringify(cr)}`); return; }

  // hr_runes is now seeded by the catalogue; this belt-and-braces upsert keeps
  // the test green even if it is ever run against a pre-rune-data chain.
  await db.query('insert into public.hr_runes(rune_id, element) values ($1,$2) '
    + 'on conflict (rune_id) do update set element = excluded.element', [RUNE, EL]);

  // The start kit equips bronze_sword in the weapon slot.
  ok(await eqOf(db, 'weapon') === 'bronze_sword',
    `ENCHANT-SETUP: the weapon slot holds '${await eqOf(db, 'weapon')}', expected bronze_sword`);

  // ── N1. THE CONTROL — AN HONEST ENCHANT DEBITS ONE RUNE AND SETS ELEMENT ─
  let firstKey;
  {
    const g = await grant(db, await versionOf(db), { [RUNE]: 1 });
    ok(g.ok === true, `N1-SETUP: the admin grant was refused — ${JSON.stringify(g)}`);
    ok(await invOf(db, RUNE) === 1, 'N1-SETUP: the grant did not land');

    const { res, intentId } = await applyEnchant(db, await versionOf(db), RUNE);
    firstKey = intentId;
    ok(res.ok === true, `N1: an HONEST enchant was refused — ${JSON.stringify(res).slice(0, 300)}`);
    ok(await enchOf(db, 'weapon') === EL,
      `N1: the weapon enchant is '${await enchOf(db, 'weapon')}', expected '${EL}' — the SERVER resolved `
      + 'the rune to its element');
    ok(await invOf(db, RUNE) === 0,
      'N1: the rune was not debited — the debit IS the consumption and the ownership check');
    const j = (await db.query("select intent, kind from player_ledger where user_id=$1 and "
      + "intent like 'enchant:%' order by at desc limit 1", [UID])).rows[0];
    ok(j && j.kind === 'enchant' && j.intent === 'enchant:weapon',
      `N1: the enchant was journalled as ${JSON.stringify(j)} — kind 'enchant', intent 'enchant:weapon'`);
  }

  // ── N2. IDEMPOTENT REPLAY — THE RUNE IS CONSUMED ONCE ───────────────────
  {
    // Re-grant one so a DOUBLE debit would be observable, then replay the SAME
    // key: a replay must apply NOTHING (return the stored decision), leaving the
    // freshly-granted rune untouched.
    await grant(db, await versionOf(db), { [RUNE]: 1 });
    ok(await invOf(db, RUNE) === 1, 'N2-SETUP: the re-grant did not land');
    const before = await invOf(db, RUNE);
    const { res } = await applyEnchant(db, await versionOf(db), RUNE, { intentId: firstKey });
    ok(res.replayed === true, `N2: replaying the enchant key did not report replayed — ${JSON.stringify(res).slice(0, 200)}`);
    ok(await invOf(db, RUNE) === before,
      `N2: a replayed enchant debited the rune AGAIN — ${before} -> ${await invOf(db, RUNE)}. A replay `
      + 'must consume the rune exactly once.');
  }

  // ── N3. INSUFFICIENT_ITEM — THE DEBIT IS THE OWNERSHIP CHECK ────────────
  {
    // Spend the rune we still hold on a real enchant, then try again owning none.
    const { res: spend } = await applyEnchant(db, await versionOf(db), RUNE);
    ok(spend.ok === true, `N3-SETUP: the setup enchant was refused — ${JSON.stringify(spend).slice(0, 200)}`);
    ok(await invOf(db, RUNE) === 0, 'N3-SETUP: the rune was not spent');
    const enchBefore = await enchOf(db, 'weapon');
    const { res } = await applyEnchant(db, await versionOf(db), RUNE);
    ok(res.ok !== true && res.error === 'insufficient_item',
      `N3: enchanting with no rune owned returned ${JSON.stringify(res).slice(0, 200)} — expected insufficient_item`);
    ok(await enchOf(db, 'weapon') === enchBefore,
      'N3: a refused enchant changed the enchant state — the whole delta must roll back');
  }

  // ── N4. WRONG_SLOT — THE SLOT MUST HOLD A WEAPON ────────────────────────
  {
    // Unequip the weapon (a transfer back to the bag), then try to enchant an
    // empty slot. The server reads its OWN equipment; a rune is owned but there
    // is nothing to enchant.
    await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r', [UID, await versionOf(db), uuid(),
      JSON.stringify({ equip: { weapon: null }, journal: { kind: 'equip', intent: 'equip:weapon' } })]);
    ok(await eqOf(db, 'weapon') === null, 'N4-SETUP: the weapon did not unequip');
    await grant(db, await versionOf(db), { [RUNE]: 1 });
    const owned = await invOf(db, RUNE);
    const { res } = await applyEnchant(db, await versionOf(db), RUNE);
    ok(res.ok !== true && res.error === 'wrong_slot',
      `N4: enchanting an empty weapon slot returned ${JSON.stringify(res).slice(0, 200)} — expected wrong_slot`);
    ok(await invOf(db, RUNE) === owned,
      'N4: a refused enchant debited the rune anyway — the whole delta must roll back');
    // Re-equip for the remaining cases.
    await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r', [UID, await versionOf(db), uuid(),
      JSON.stringify({ equip: { weapon: 'bronze_sword' }, journal: { kind: 'equip', intent: 'equip:weapon' } })]);
    ok(await eqOf(db, 'weapon') === 'bronze_sword', 'N4-CLEANUP: the weapon did not re-equip');
  }

  // ── N5. UNKNOWN_ITEM — A NON-RUNE DOES NOT RESOLVE ──────────────────────
  {
    const enchBefore = await enchOf(db, 'weapon');
    const { res } = await applyEnchant(db, await versionOf(db), 'normal_log');
    ok(res.ok !== true && res.error === 'unknown_item',
      `N5: enchanting with a non-rune returned ${JSON.stringify(res).slice(0, 200)} — expected unknown_item`);
    ok(await enchOf(db, 'weapon') === enchBefore, 'N5: a refused enchant changed the enchant state');
  }

  // ── N6. WRONG_SLOT (NON-WEAPON) — v1 IS THE WEAPON ONLY ─────────────────
  {
    await grant(db, await versionOf(db), { [RUNE]: 1 });
    const owned = await invOf(db, RUNE);
    const { res } = await applyEnchant(db, await versionOf(db), RUNE, { slot: 'shield' });
    ok(res.ok !== true && res.error === 'wrong_slot',
      `N6: enchanting a non-weapon slot returned ${JSON.stringify(res).slice(0, 200)} — expected wrong_slot`);
    ok(await invOf(db, RUNE) === owned, 'N6: a refused non-weapon enchant debited the rune');
  }

  // ── N7. THE WINDOW STAMP — enchant CLOSES THE ACCRUAL WINDOW (§S5) ──────
  {
    // Set accrued_to two hours into the past (as the owner), then apply an
    // enchant: hr_apply must stamp accrued_to = now(), so the collect-before-
    // enchant order the Edge verb runs cannot leave an unpaid window to be
    // priced at the new element.
    await db.query("update player_state set accrued_to = now() - interval '2 hours' "
      + 'where user_id=$1 and slot=0', [UID]);
    const before = new Date((await db.query(
      'select accrued_to from player_state where user_id=$1 and slot=0', [UID])).rows[0].accrued_to).getTime();
    const { res } = await applyEnchant(db, await versionOf(db), RUNE);
    ok(res.ok === true, `N7-SETUP: the enchant was refused — ${JSON.stringify(res).slice(0, 200)}`);
    const after = new Date((await db.query(
      'select accrued_to from player_state where user_id=$1 and slot=0', [UID])).rows[0].accrued_to).getTime();
    ok(after - before > 90 * 60 * 1000,
      `N7: an enchant did NOT stamp accrued_to (moved ${(after - before) / 1000}s, expected ~2h) — the `
      + 'window would not close and "fight cheap, enchant, settle" is open');
  }

  // ════════════════════════════════════════════════════════════════════════
  // END-TO-END — the REAL runEnchant bytes through the exec seam (early answer
  // -> collect -> apply), now that the rune data has landed.
  // ════════════════════════════════════════════════════════════════════════
  const exec = makeExec(db);
  const call = (o) => runEnchant({ exec, user: UID, slot: 0, intentId: uuid(), ...o });

  // ── N8. AN HONEST ENCHANT SUCCEEDS AND STATES THE SERVER'S ENCHANT ──────
  {
    // idle, no window -> collected is null; the enchant lands.
    await db.query("update player_state set active_kind='idle', active_id=null, active_since=null, "
      + 'accrued_to = now() where user_id=$1 and slot=0', [UID]);
    await grant(db, await versionOf(db), { [RUNE]: 1 });
    const owned = await invOf(db, RUNE);
    const r = await call({ enchant: { slot: 'weapon', rune: RUNE } });
    ok(r.status === 200 && r.body.ok === true,
      `N8: an HONEST end-to-end enchant was refused — ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(r.body.verb === 'enchant' && r.body.enchant && r.body.enchant.weapon === EL,
      `N8: the envelope's enchant is ${JSON.stringify(r.body.enchant)} — must be read from server state, weapon='${EL}'`);
    ok(r.body.collected === null,
      `N8: collected is ${JSON.stringify(r.body.collected)} on an idle character — expected null`);
    ok(await invOf(db, RUNE) === owned - 1, 'N8: the end-to-end enchant did not debit exactly one rune');
    ok(await enchOf(db, 'weapon') === EL, 'N8: the server enchant state was not set');
  }

  // ── N9. collectsFirst PAYS THE PRE-ENCHANT WINDOW ───────────────────────
  {
    // Put the character on a real combat activity with ~40 min elapsed, then
    // enchant: the verb must COLLECT that window (its own apply) BEFORE the
    // enchant, so `collected` is a non-null receipt and the window is paid at
    // the PRE-enchant element.
    await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r', [UID, await versionOf(db), uuid(),
      JSON.stringify({ activity: { kind: 'combat', id: 'goblin', restart: true },
        journal: { kind: 'admin', intent: 'set_activity:combat:goblin' } })]);
    await db.query("update player_state set accrued_to = now() - interval '40 minutes', "
      + "active_since = now() - interval '40 minutes' where user_id=$1 and slot=0", [UID]);
    await grant(db, await versionOf(db), { [RUNE]: 1 });
    const r = await call({ enchant: { slot: 'weapon', rune: RUNE } });
    ok(r.status === 200 && r.body.ok === true,
      `N9: the enchant-with-window was refused — ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(r.body.collected && Number(r.body.collected.ms) > 0,
      `N9: collectsFirst did NOT pay the pre-enchant window — collected=${JSON.stringify(r.body.collected)}. `
      + 'The 40-minute goblin window must be settled BEFORE the rune lands, or "fight cheap, enchant, '
      + 'settle" is open end-to-end.');
    ok(await enchOf(db, 'weapon') === EL, 'N9: the enchant did not land after the collect');
  }
}

// ── RUN ──────────────────────────────────────────────────────────────────
async function main() {
  contractGuard();
  await behaviourGuard();
  if (problems.length) {
    console.error(`enchant-intent: ${problems.length} FAILURE(S)`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log('enchant-intent: OK — contract + hr_apply authority (rune resolve, debit-once, '
    + 'idempotent, weapon gate, unknown_item, window stamp) + end-to-end runEnchant '
    + '(honest enchant, collectsFirst pays the pre-enchant window)');
}

main();
