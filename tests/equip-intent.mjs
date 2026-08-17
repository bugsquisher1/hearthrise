// ════════════════════════════════════════════════════════════════════════
// tests/equip-intent.mjs — THE EQUIP INTENT, GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/equip-intent.mjs            # the guard
//   node tests/equip-intent.mjs --mutate   # plant real defects, prove RED
//
// Spec: docs/design/live-settlement.md §10 PHASE 2 and §12(1).
// Ships with: supabase/functions/hr-accrue/equip.js,
//             supabase/migrations/2026-08-18-equip-release-codes.sql.
//
// ── THE DEFECT CLASS THIS EXISTS FOR ────────────────────────────────────
// Until b366 NOTHING told the server about a client equip. There was no verb
// in the Edge Function and no call site in src/net/*, so hr_apply's equip block
// — complete and correct since 2026-08-11-apply-engine.sql — was UNREACHABLE
// through a player gesture. The consequence was reported live (b362):
//
//     "every time I am using the corresponding weapon type it gets duplicated
//      when I equip it."
//
// Both sides hold gear DISJOINTLY (an equipped copy is not also in the bag), so
// a client equip moved a unit out of the client's bag while the server's
// `player_inventory` row went on counting it, and the b359 max-merge handed the
// stale figure back into the bag while the same copy sat in the slot. One item
// created from nothing per equip round trip, on tradeable gear.
//
// The verb closes it STRUCTURALLY rather than by arithmetic correction: an
// equip is a TRANSFER — one unit out of player_inventory, one unit of whatever
// was in the slot back in — so the total the player owns is CONSERVED, and a
// dupe is arithmetically impossible rather than merely unimplemented. E4 is the
// assertion that says so, and it counts inventory + equipment together because
// counting either alone would miss exactly the bug.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────
// The REAL `runEquip` bytes, behind the same one-statement `exec` seam index.ts
// gives it, against the REAL migration chain in PGlite (real PostgreSQL, in
// process). What it cannot exercise: the pooler, `set local role hr_engine` as
// a connection property, the JWT, and TRUE concurrency (PGlite is one backend).
// Those are named rather than implied.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import { runEquip, validateOps, equipDelta, VERB } from '../supabase/functions/hr-accrue/equip.js';
import { readEquip, MAX_EQUIP_OPS, INTENT_KEYS } from '../supabase/functions/hr-accrue/request.js';
import {
  INTENT_REGISTRY, guardStampKeys, collectsFirst, rateBucketFor, STATELESS_REFUSALS,
} from '../supabase/functions/hr-accrue/intents.js';
import { EQUIP_SLOT_INDEX, ITEM_EQUIP_SLOTS } from '../supabase/functions/hr-accrue/catalogue.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './schema-replay.mjs';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const UID = '000000ee-0000-4000-a000-0000000000ee';
const uuid = () => crypto.randomUUID();

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module,
 *  wrapped in `set role hr_engine`, which is not cosmetic: that role holds ZERO
 *  table privileges in every schema and EXECUTE on exactly the functions the
 *  engine needs, so a verb that tried to touch a table directly is refused here
 *  exactly as it would be in production. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
}

/* An ADMIN grant, applied the server's own way. The test must not INSERT into
   player_inventory directly — that would be the harness taking a privilege the
   engine does not have, and every ownership assertion below would then be
   measuring a row this file wrote rather than one hr_apply agreed to. */
async function asEngine(db, sql, params) {
  await db.exec('set role hr_engine');
  /* ⚠ try/FINALLY, ALWAYS. A throw between `set role` and `reset role` leaves
     the SESSION as hr_engine — which holds zero table privileges — and every
     later plain query in this file then fails `42501 permission denied for
     table player_state`. That reads as "the schema is broken" and sent the
     first run of this guard chasing a grant bug that did not exist. */
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}

async function grant(db, version, items) {
  const rows = await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r', [
    UID, version, uuid(),
    JSON.stringify({ items, journal: { kind: 'admin', intent: 'equip_probe_grant' } }),
  ]);
  return rows[0].r;
}

const versionOf = async (db) => Number((await db.query(
  'select version::text v from player_state where user_id=$1 and slot=0', [UID])).rows[0].v);
const invOf = async (db, id) => Number((await db.query(
  'select qty::text q from player_inventory where user_id=$1 and slot=0 and item_id=$2',
  [UID, id])).rows[0]?.q ?? 0);
const eqOf = async (db, s) => (await db.query(
  'select item_id from player_equipment where user_id=$1 and slot=0 and equip_slot=$2',
  [UID, s])).rows[0]?.item_id ?? null;
/** EVERY copy the player owns, wherever it sits. The dupe this file exists for
    is invisible to either half alone. */
const ownedOf = async (db, id) => await invOf(db, id) + Number((await db.query(
  'select count(*) c from player_equipment where user_id=$1 and slot=0 and item_id=$2',
  [UID, id])).rows[0].c);

// ════════════════════════════════════════════════════════════════════════
// PART 1 — THE CONTRACT, read out of the modules. No database.
// ════════════════════════════════════════════════════════════════════════
export function contractGuard() {
  // ── E0. THE REGISTRY ROW, AND THE ONE COLUMN THAT MATTERS ──────────────
  const row = INTENT_REGISTRY[VERB];
  ok(!!row, 'E0: there is no INTENT_REGISTRY row for `equip` — index.ts would 500 on dispatch');
  ok(row && row.needsKey === true, 'E0: the equip verb does not require an idempotency key');
  /* THE LOAD-BEARING ONE. hr_apply stamps `accrued_to = now()` on a delta
     carrying `equip` (STAMPING_DELTA_KEYS), so an equip that did not collect
     first would silently discard every unpaid second since the last settle —
     up to 90 s of gold, XP and drops PER GESTURE, on every swap, with no error
     anywhere. And the ORDER additionally closes live-settlement.md §12(1):
     collecting AFTER would price the whole unpaid span at the NEW gear, which
     turns a residue into "fight naked all night, equip BiS, settle". */
  ok(collectsFirst(VERB) === true,
    'E0: `equip` does not collect first. hr_apply stamps accrued_to on an equip delta, so every '
    + 'gesture would confiscate the unpaid window — and collecting after the swap would price it '
    + 'at the new gear, which is the naked->BiS exploit live-settlement.md §12(1) names.');
  ok(rateBucketFor(VERB) === 'activity',
    `E0: the equip verb spends the '${rateBucketFor(VERB)}' bucket — hr_rate_gate's bucket list is `
    + 'a `case` in SQL and an unknown bucket FAILS CLOSED, i.e. 429 forever on the first call.');

  // ── E0b. THE STAMP GUARD IS REAL, PROVEN BOTH WAYS ─────────────────────
  const d = equipDelta({ weapon: 'iron_sword' });
  ok(guardStampKeys(VERB, d) === null,
    'E0b: guardStampKeys refuses the equip verb its own delta — the registry and the delta disagree');
  ok(guardStampKeys('shop_buy', d) !== null,
    'E0b-CONTROL: guardStampKeys ADMITS an equip delta on a non-collecting verb. The guard is '
    + 'decoration, and the day someone adds `equip` to a buy-and-wield shop delta every buyer '
    + 'silently loses their unpaid window.');

  // ── E0c. THE WIRE CARRIES NAMES, NEVER NUMBERS ─────────────────────────
  ok(INTENT_KEYS.includes('equip'), 'E0c: `equip` is not in INTENT_KEYS — parseIntent drops it');
  for (const bad of ['qty', 'price', 'stats', 'bonus', 'power', 'cost']) {
    ok(!JSON.stringify(d.equip).includes(`"${bad}"`),
      `E0c: the equip delta carries a '${bad}' field — no number may cross this boundary`);
  }
  ok(d.journal && d.journal.kind === 'equip',
    `E0c: the equip journal kind is '${d.journal && d.journal.kind}', not 'equip'`);

  // ── E0d. THE PARSER REFUSES HOSTILE SHAPES WHOLE ───────────────────────
  const HOSTILE = [
    ['a scalar', { equip: 7 }],
    ['an array', { equip: ['weapon'] }],
    ['an empty map', { equip: {} }],
    ['a numeric item', { equip: { weapon: 5 } }],
    ['an uppercase item id', { equip: { weapon: 'Iron_Sword' } }],
    ['a slot with punctuation', { equip: { 'wea pon': 'iron_sword' } }],
    ['an over-long item id', { equip: { weapon: 'a'.repeat(65) } }],
    ['an object value', { equip: { weapon: { id: 'iron_sword' } } }],
    ['more ops than slots', { equip: Object.fromEntries(
      Array.from({ length: MAX_EQUIP_OPS + 1 }, (_, i) => [`s${i}`, null])) }],
    /* ONE BAD PAIR POISONS THE WHOLE MAP, deliberately: half-applying a loadout
       because one slot name had a capital letter is exactly the partial write
       this contract exists to make impossible. */
    ['one bad pair among good ones', { equip: { weapon: 'iron_sword', shield: 'BAD' } }],
  ];
  for (const [what, body] of HOSTILE) {
    ok(readEquip(body) === null, `E0d: readEquip ACCEPTED ${what} (${JSON.stringify(body)})`);
  }
  /* CONTROLS. A parser that refused everything would pass every line above. */
  const good = readEquip({ equip: { weapon: 'iron_sword', shield: null } });
  ok(good && good.weapon === 'iron_sword' && good.shield === null,
    `E0d-CONTROL: readEquip refused an HONEST map — ${JSON.stringify(good)}`);
  ok(Object.getPrototypeOf(good) === null,
    'E0d: readEquip returned a map with a prototype — `__proto__` as an own key off the wire is '
    + 'then a live hazard for every downstream lookup');
  ok(readEquip({}) === null && readEquip({ equip: undefined }) === null,
    'E0d: an absent equip key did not read as null');

  // ── E0e. THE CATALOGUE INDEX AGREES WITH THE GENERATOR ─────────────────
  ok(Object.getPrototypeOf(EQUIP_SLOT_INDEX) === null
     && Object.getPrototypeOf(ITEM_EQUIP_SLOTS) === null,
  'E0e: the equip catalogues have a prototype — `constructor` is a legal slot/item id by the wire '
    + 'regex and is TRUTHY on a plain object, which is how the activity intent once issued three '
    + 'database statements for an id that does not exist');
  const rings = Object.keys(ITEM_EQUIP_SLOTS).filter((id) => ITEM_EQUIP_SLOTS[id].ring1);
  ok(rings.length > 0 && rings.every((id) => ITEM_EQUIP_SLOTS[id].ring2),
    'E0e: the ring1/ring2 expansion did not survive the move to src/data/gathering.js — an item '
    + 'that fits ring1 and not ring2 means the Edge Function and hr_item_slots disagree');

  // ── E0f. THE STATELESS ALLOWLIST ───────────────────────────────────────
  ok(STATELESS_REFUSALS.includes('bad_equip'),
    'E0f: bad_equip is not on STATELESS_REFUSALS — a shape refusal would read a full hr_state_of, '
    + 'which is the database work the shape check exists to avoid');
  for (const code of ['unknown_equip_slot', 'wrong_slot', 'requirement_not_met', 'insufficient_item']) {
    ok(!STATELESS_REFUSALS.includes(code),
      `E0f: '${code}' is on STATELESS_REFUSALS. It is answered AFTER a read (or by hr_apply under `
      + 'the lock), the caller has already paid for the envelope, and a refusal the client cannot '
      + 'reconcile from leaves it guessing.');
  }
}

// ════════════════════════════════════════════════════════════════════════
// PART 2 — BEHAVIOUR, against the real chain.
// ════════════════════════════════════════════════════════════════════════
export async function behaviourGuard() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    problems.push(`EQUIP-SQL: the migration chain would not apply — ${e.message}`);
    return;
  }
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [UID, 'EquipProbe']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [UID]);

  const exec = makeExec(db);
  const call = (o) => runEquip({ exec, user: UID, slot: 0, intentId: uuid(), ...o });
  try { await body(db, call, exec); } catch (e) {
    /* A THROW IS A FAILING GUARD, NOT A CRASHING HARNESS. An uncaught error
       here exits before the summary and reads as "the runner is broken", which
       is how a real red gets triaged as flake. */
    problems.push(`EQUIP-SQL: the behaviour guard threw — ${e && e.message}`);
  }
}

async function body(db, call, exec) {

  // ── E1. NO CHARACTER — before anything exists ──────────────────────────
  {
    const r = await call({ equip: { weapon: 'iron_sword' } });
    ok(r.status === 409 && r.body.error === 'no_character',
      `E1: an empty slot returned ${r.status} ${JSON.stringify(r.body)}`);
  }

  const cr = (await db.query('select hr_create_character(0) r')).rows[0].r;
  if (cr.ok !== true) { problems.push(`EQUIP-SQL: hr_create_character failed — ${JSON.stringify(cr)}`); return; }

  // ── E2. THE CONTROL — AN HONEST EQUIP MOVES THE ITEM SERVER-SIDE ───────
  // Everything below asserts a REFUSAL. A probe that cannot make an honest call
  // succeed would report a clean bill for a completely broken verb.
  {
    const g = await grant(db, await versionOf(db), { iron_sword: 1 });
    ok(g.ok === true, `E2-SETUP: the admin grant was refused — ${JSON.stringify(g)}`);
    ok(await invOf(db, 'iron_sword') === 1, 'E2-SETUP: the grant did not land');

    const r = await call({ equip: { weapon: 'iron_sword' } });
    ok(r.status === 200 && r.body.ok === true,
      `E2: an HONEST equip was refused — ${r.status} ${JSON.stringify(r.body).slice(0, 300)}. `
      + 'Every refusal asserted below would then pass for the wrong reason.');
    ok(await eqOf(db, 'weapon') === 'iron_sword',
      `E2: the weapon slot holds '${await eqOf(db, 'weapon')}' after an accepted equip`);
    ok(await invOf(db, 'iron_sword') === 0,
      'E2: the equipped copy is STILL IN THE BAG. The op is a transfer; leaving the bag row is '
      + 'exactly the b362 duplication, now server-side.');
    /* THE DISPLACED ITEM CAME BACK. bronze_sword was the start kit's weapon. */
    ok(await invOf(db, 'bronze_sword') === 1,
      'E2: the displaced bronze_sword did not return to the bag — an equip that swallows the item '
      + 'it replaced is a DELETION, which is the same defect with the sign flipped');
    /* THE ENVELOPE STATES THE SERVER'S LOADOUT, not the request's. */
    ok(r.body.equipment && r.body.equipment.weapon === 'iron_sword',
      `E2: the response envelope's equipment is ${JSON.stringify(r.body.equipment)}`);
    const j = (await db.query("select intent, kind from player_ledger where user_id=$1 and "
      + "intent like 'equip:%' order by at desc limit 1", [UID])).rows[0];
    ok(j && j.kind === 'equip' && j.intent === 'equip:weapon',
      `E2: the equip was journalled as ${JSON.stringify(j)} — a value transfer between two `
      + 'server-owned containers must be reconstructible');
  }

  // ── E3. THE DUPE ATTEMPT — EQUIP WHAT YOU DO NOT OWN ───────────────────
  {
    const before = await ownedOf(db, 'iron_sword');
    const r = await call({ equip: { shield: 'iron_sword' } });
    /* iron_sword does not fit `shield`, so the SHAPE layer answers first and
       the delta never reaches the database — which is itself the assertion. */
    ok(r.status === 409 && r.body.error === 'wrong_slot',
      `E3: equipping a weapon into the shield slot returned ${JSON.stringify(r.body)}`);
    ok(await ownedOf(db, 'iron_sword') === before,
      'E3: a refused equip changed the number of copies owned');
  }
  {
    /* THE REAL ONE: a second copy of something already worn, which the player
       does not have. The debit IS the ownership check and there is nothing else
       to check — so this is the assertion that says a dupe is arithmetically
       impossible rather than merely unimplemented. */
    const before = await ownedOf(db, 'iron_sword');
    ok(before === 1, `E4-SETUP: the probe owns ${before} iron_sword, expected exactly 1`);
    const r = await call({ equip: { weapon: 'bronze_sword', shield: 'iron_sword' } });
    ok(r.status === 409,
      `E4: a loadout naming a copy the player does not own returned ${r.status} `
      + JSON.stringify(r.body).slice(0, 200));
    ok(await ownedOf(db, 'iron_sword') === before,
      `E4: THE DUPE LANDED — iron_sword went ${before} -> ${await ownedOf(db, 'iron_sword')}. `
      + 'Equipping must CONSERVE: one unit out of the bag, one unit of the displaced item back in.');
    ok(await eqOf(db, 'weapon') === 'iron_sword',
      'E4: a refused multi-slot equip applied HALF of itself — the whole delta must roll back');
  }

  // ── E5. UNEQUIP RETURNS THE UNIT, AND THE ROUND TRIP CONSERVES ─────────
  {
    const before = await ownedOf(db, 'iron_sword');
    let r = await call({ equip: { weapon: null } });
    ok(r.status === 200 && r.body.ok === true, `E5: unequip was refused — ${JSON.stringify(r.body)}`);
    ok(await eqOf(db, 'weapon') === null, 'E5: the slot is still occupied after an unequip');
    ok(await invOf(db, 'iron_sword') === 1, 'E5: the unequipped unit did not return to the bag');
    r = await call({ equip: { weapon: 'iron_sword' } });
    ok(r.status === 200, `E5: re-equip was refused — ${JSON.stringify(r.body)}`);
    ok(await ownedOf(db, 'iron_sword') === before,
      `E5: an equip/unequip/equip cycle changed the copy count (${before} -> `
      + `${await ownedOf(db, 'iron_sword')}). This is the b362 dupe, measured.`);
  }

  // ── E6. THE CATALOGUE REFUSALS, AND WHICH LAYER GAVE THEM ──────────────
  for (const [what, ops, code] of [
    ['an item that does not exist', { weapon: 'ancient_wyrm_blade' }, 'unknown_item'],
    ['a slot that does not exist', { third_arm: 'iron_sword' }, 'unknown_equip_slot'],
    ['a non-equipment item', { weapon: 'shrimp' }, 'unknown_item'],
  ]) {
    const r = await call({ equip: ops });
    ok(r.status === 409 && r.body.error === code,
      `E6: ${what} returned ${JSON.stringify(r.body)}, expected '${code}'`);
  }
  {
    /* THE REQUIREMENT GATE IS THE DATABASE'S, DELIBERATELY. equip.js does not
       answer it early — that would need a second copy of the level-from-xp
       curve in the payload. So this arm proves hr_apply is reached AND refuses,
       which is the "caller checked" != "control" property. */
    const gated = (await db.query("select s.item_id from hr_item_slots s join hr_items i "
      + "using(item_id) where i.req_lv >= 40 and i.req_skill is not null limit 1")).rows[0];
    ok(!!gated, 'E6-CONTROL: no gated item exists in the catalogue — the requirement arm is vacuous');
    if (gated) {
      const slot = (await db.query('select equip_slot from hr_item_slots where item_id=$1 limit 1',
        [gated.item_id])).rows[0].equip_slot;
      const g = await grant(db, await versionOf(db), { [gated.item_id]: 1 });
      ok(g.ok === true, `E6-SETUP: granting ${gated.item_id} failed — ${JSON.stringify(g)}`);
      const r = await call({ equip: { [slot]: gated.item_id } });
      ok(r.status === 409 && r.body.error === 'requirement_not_met',
        `E6: a level-1 character equipping ${gated.item_id} returned ${JSON.stringify(r.body)} — `
        + 'the reqSkill/reqLv gate is hr_apply\'s, checked against SERVER skills under the lock');
      ok(await invOf(db, gated.item_id) === 1, 'E6: a refused gated equip still debited the bag');
    }
  }

  // ── E7. THE RELEASE CLASS — a catalogue refusal must not brick the key ──
  // The b361 `unknown_skill` incident, in its equip shape: a deploy-order slip
  // makes an honest equip `unknown_item`, and without the release the SAME key
  // replays the stored refusal for up to 25 hours even after the catalogue is
  // fixed. Driven through hr_apply directly, because the point is the key.
  {
    const key = uuid();
    const v = await versionOf(db);
    const bad = { equip: { weapon: 'no_such_item_at_all' },
      journal: { kind: 'equip', intent: 'equip:weapon' } };
    const first = (await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r',
      [UID, v, key, JSON.stringify(bad)]))[0].r;
    ok(first.ok === false && first.error === 'unknown_item',
      `E7: hr_apply accepted an unknown item — ${JSON.stringify(first)}`);
    const claimed = Number((await db.query(
      'select count(*) c from player_intents where intent_id = $1', [key])).rows[0].c);
    ok(claimed === 0,
      'E7: the intent key is STILL CLAIMED after a catalogue refusal. That is the b361 brick: the '
      + 'client retries with the same key, gets the STORED refusal, and stays broken after the '
      + 'catalogue is fixed — because a replay never re-evaluates. `unknown_item` must be in '
      + 'c_release_codes (2026-08-18-equip-release-codes.sql).');
    /* AND THE NEGATIVE, which is the load-bearing half: the OWNERSHIP refusal
       must KEEP its key. Releasing it would hand a client unlimited free
       re-attempts on one key against a moving inventory. */
    const key2 = uuid();
    const own = { equip: { shield: 'copper_ring' },
      journal: { kind: 'equip', intent: 'equip:shield' } };
    const second = (await asEngine(db, 'select hr_apply($1,0,$2,$3,$4::jsonb) r',
      [UID, await versionOf(db), key2, JSON.stringify(own)]))[0].r;
    ok(second.ok === false,
      `E7-CONTROL: equipping a ring into the shield slot succeeded — ${JSON.stringify(second)}`);
    if (second.error === 'insufficient_item') {
      const held = Number((await db.query(
        'select count(*) c from player_intents where intent_id = $1', [key2])).rows[0].c);
      ok(held === 1,
        'E7: `insufficient_item` RELEASED its key. That is the equip block\'s ownership check — '
        + 'the debit that makes equipping a conserving transfer — and releasing it gives a client '
        + 'unlimited free re-attempts on one key against a moving inventory.');
    }
  }

  // ── E8. THE COLLECT RAN, AND IT RAN FIRST ──────────────────────────────
  // §12(1): the window must be priced against the gear the player was WEARING
  // while it elapsed. Measured on the watermark: hr_apply stamps
  // `accrued_to = now()` on an equip delta, so an accepted equip must leave the
  // watermark at the instant of the swap and not before it.
  {
    await db.query("update player_state set accrued_to = now() - interval '10 minutes', "
      + "active_kind='combat', active_id='goblin', active_since = now() - interval '20 minutes' "
      + 'where user_id=$1 and slot=0', [UID]);
    const before = (await db.query(
      'select accrued_to from player_state where user_id=$1 and slot=0', [UID])).rows[0].accrued_to;
    const r = await call({ equip: { weapon: null } });
    ok(r.status === 200, `E8: the equip was refused — ${JSON.stringify(r.body).slice(0, 200)}`);
    const after = (await db.query(
      'select accrued_to from player_state where user_id=$1 and slot=0', [UID])).rows[0].accrued_to;
    ok(new Date(after).getTime() > new Date(before).getTime(),
      'E8: an accepted equip did not move accrued_to — hr_apply stamps it on an equip delta, so '
      + 'either the delta lost its equip key or the watermark is not being stamped');
    ok(r.body.collected !== undefined,
      'E8: the response carries no `collected` field. The collect ran or it did not, and a client '
      + 'that cannot tell reports a paid window as nothing (the b349 defect).');
  }
}

// ════════════════════════════════════════════════════════════════════════
// PART 3 — THE WIRE. index.ts is Deno TS and cannot be imported by Node, so
// this is a source assertion and says so. It is narrow ON PURPOSE: it grades
// exactly the two things a regex CAN grade honestly — that the verb is
// dispatched at all, and that no numeric field crosses into it.
// ════════════════════════════════════════════════════════════════════════
export async function wireGuard() {
  const src = await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8');
  ok(/intent\.verb === 'equip'/.test(src), 'E9: index.ts does not dispatch the equip verb');
  const m = src.match(/if \(intent\.verb === 'equip'\) \{[\s\S]*?\n {4}\}/);
  ok(!!m, 'E9: the equip dispatch block could not be located — the scan is broken, not the code');
  if (m) {
    for (const bad of ['qty', 'ask', 'price', 'offer', 'listing', 'stats']) {
      ok(!new RegExp(`\\b${bad}:`).test(m[0]),
        `E9: the equip dispatch forwards '${bad}'. An equip moves exactly one unit and the server `
        + 'decides where it came from; every extra field is a number the server must disbelieve.');
    }
    ok(/user,/.test(m[0]) && !/user: intent/.test(m[0]),
      'E9: the equip dispatch does not forward the VERIFIED subject');
  }
}

export async function runAll() {
  problems.length = 0;
  contractGuard();
  await behaviourGuard();
  await wireGuard();
  return problems.slice();
}

const SELF = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const fails = await runAll();
  for (const f of fails) console.error('  ✗ ' + f);
  console.log(fails.length ? `equip-intent: ${fails.length} FAILED` : 'equip-intent: OK');
  process.exit(fails.length ? 1 : 0);
}
