#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/start-kits.mjs — THE KIT ONCE AN ACCOUNT, ONCE A SLOT, THE PICK, AND THE TUTORIAL TAUGHT ONCE AN ACCOUNT, ON REAL POSTGRESQL.
//   (FB-5 lane/c-first-hour, 2026-11-21; CE-10, GR-24, chapter 08 sections 2.1 and 2.6; supabase/migrations/1038-start-kits.sql and
//   1039-account-coach.sql; the kit rows are src/data/start-kit.js through 1037-first-hour-kit-lines.generated.sql.)
//
// The REAL chain into PGlite with a LIVE-SHAPED account planted before 1038 (two heroes made the old way, each with coach reads in its
// residue), then real players through hr_create_hero and hr_create_character.
//   K-ONCE    a new account: the first hero gets the account kit (the kit's gold to the purse, ACCOUNT_KIT to its bag) and the hero kit;
//             the second gets the hero kit and no gold; one ledger row each saying which kits it paid
//   K-PICK    every STARTER_SETS row: the hero wears that set (its first item a slot), every other practice weapon is in its bag
//   K-REMADE  a hero made in a slot already paid gets the practice weapons and nothing else
//   K-SEED    L-02: the live account and each of its heroes is marked paid; its next hero in a new slot gets the hero kit, no account kit
//   K-COACH   L-03: the live account is taught every card any of its heroes read; the heroes' rows are not written
//
//   node tests/start-kits.mjs            the guard
//   node tests/start-kits.mjs --mutate   every planted defect must turn its own arm red
//
// mutant-anchors: supabase/migrations/1038-start-kits.sql supabase/migrations/1039-account-coach.sql
// ════════════════════════════════════════════════════════════════════════
import { bootReplay, closeReplays, chainFiles } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { ACCOUNT_KIT, HERO_KIT, STARTER_SETS, START_CURRENCY } from '../src/data/start-kit.js';
import { ITEMS } from '../src/data/items.js';

const KITS = '1038-start-kits.sql';
const COACH = '1039-account-coach.sql';
const LIVE = '00000000-0000-4000-8000-0000000fb501';
const NEW = '00000000-0000-4000-8000-0000000fb502';
const PRACTICE = new Set(Object.values(STARTER_SETS).flat());
/* The live heroes' rows as FB-5's last file (the coach, 1039) left them: a later lane's own change to player_state (1040-rested-bank-cut.sql
   drops columns) is never read as the coach seed writing a hero (the set after run 44959863591, 2026-11-21) */
const AFTER_COACH = `create temp table zz_sk_after as select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) as heroes from public.player_state ps where ps.user_id = '${LIVE}' and ps.slot < 2;`;
const PLANT = `
insert into auth.users (id) values ('${LIVE}') on conflict do nothing;
insert into public.profiles (id) values ('${LIVE}') on conflict do nothing;
insert into public.hr_access_allowlist (user_id, note) values ('${LIVE}', 'start-kits live') on conflict do nothing;
select set_config('request.jwt.claim.sub', '${LIVE}', false);
select public.hr_create_character(0);
select public.hr_create_character(1);
select set_config('request.jwt.claim.sub', '', false);
update public.player_state set client_state = '{"coach": {"read": ["bar_intro", "styles"], "min": true}}'::jsonb where user_id = '${LIVE}' and slot = 0;
update public.player_state set client_state = '{"coach": {"read": ["styles", "first_eat"]}}'::jsonb where user_id = '${LIVE}' and slot = 1;
create temp table zz_sk_live as select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) as heroes from public.player_state ps where ps.user_id = '${LIVE}';
`;

const one = async (db, sql, params = []) => { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; };
async function as(db, uid, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  try { return await one(db, sql, params); } finally { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const bagOf = async (db, uid, slot) => Object.fromEntries((await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = $2', [uid, slot])).rows.map((r) => [r.item_id, Number(r.qty)]));
const wornOf = async (db, uid, slot) => Object.fromEntries((await db.query('select equip_slot, item_id from public.player_equipment where user_id = $1 and slot = $2', [uid, slot])).rows.map((r) => [r.equip_slot, r.item_id]));
const purse = async (db, uid) => Number(await one(db, 'select coalesce(gold, 0) from public.account_wallet where user_id = $1', [uid]) || 0);
const same = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
/* what a set wears: its first item a slot (items.js slot), the same rule the generator writes */
const wearsOf = (set) => { const w = {}; for (const id of STARTER_SETS[set]) if (!w[ITEMS[id].slot]) w[ITEMS[id].slot] = id; return w; };
const practiceBag = (set) => { const worn = new Set(Object.values(wearsOf(set))); return Object.fromEntries([...PRACTICE].filter((id) => !worn.has(id)).map((id) => [id, 1])); };

export async function rules(db) {
  const fails = [];
  const arm = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };
  await db.query(`insert into auth.users (id) values ('${NEW}') on conflict do nothing`);
  await db.query(`insert into public.profiles (id) values ('${NEW}') on conflict do nothing`);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ('${NEW}', 'start-kits new') on conflict do nothing`);
  const make = (uid, slot, set, name) => as(db, uid, "select public.hr_create_hero($1, $2, '{\"head\":0,\"body\":0,\"legs\":0,\"feet\":0}'::jsonb, gen_random_uuid(), $3)", [slot, name, set]);
  /* K-ONCE */
  const sets = Object.keys(STARTER_SETS);
  const r0 = await make(NEW, 0, 'mage', 'Kitguard Mab');
  arm('K-ONCE', r0 && r0.ok === true, 'the first hero answered ' + JSON.stringify(r0));
  arm('K-ONCE', same(await bagOf(db, NEW, 0), { ...ACCOUNT_KIT, ...HERO_KIT, ...practiceBag('mage') }), 'the first hero\'s bag is ' + JSON.stringify(await bagOf(db, NEW, 0)));
  arm('K-ONCE', await purse(db, NEW) === START_CURRENCY.gold, 'the purse holds ' + await purse(db, NEW) + ', the kit pays ' + START_CURRENCY.gold);
  const r1 = await make(NEW, 1, 'tank', 'Kitguard Odo');
  arm('K-ONCE', r1 && r1.ok === true && same(await bagOf(db, NEW, 1), { ...HERO_KIT, ...practiceBag('tank') }), 'the second hero\'s bag is ' + JSON.stringify(await bagOf(db, NEW, 1)));
  arm('K-ONCE', await purse(db, NEW) === START_CURRENCY.gold, 'the second hero paid gold: the purse holds ' + await purse(db, NEW));
  const led = (await db.query("select slot, meta->>'account_kit' a, meta->>'hero_kit' h, gold from public.player_ledger where user_id = $1 and intent = 'create_character' order by slot", [NEW])).rows;
  arm('K-ONCE', JSON.stringify(led.map((r) => [r.slot, r.a, r.h, Number(r.gold)])) === JSON.stringify([[0, 'true', 'true', START_CURRENCY.gold], [1, 'false', 'true', 0]]), 'the journal reads ' + JSON.stringify(led));
  /* K-PICK: every set, each on its own account so every kit is a first */
  for (const set of sets) {
    const uid = '00000000-0000-4000-8000-0000000fb6' + String(sets.indexOf(set)).padStart(2, '0');
    await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
    await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'start-kits pick') on conflict do nothing", [uid]);
    const r = await make(uid, 0, set, 'Kitpick ' + set.replace('_', ' ').slice(0, 10));
    arm('K-PICK', r && r.ok === true && same(await wornOf(db, uid, 0), wearsOf(set)), set + ' wears ' + JSON.stringify(await wornOf(db, uid, 0)) + ' (' + JSON.stringify(r) + ')');
  }
  /* K-REMADE: slot 2's kit marked paid as a hero once made there was; the hero made there now gets the practice weapons alone */
  await db.query("insert into public.account_kits (user_id, grant_key, slot) values ($1, 'hero:2', 2)", [NEW]);
  await as(db, NEW, 'select public.hr_create_character(2)');
  const remade = await bagOf(db, NEW, 2);
  arm('K-REMADE', Object.keys(remade).length > 0 && Object.keys(remade).every((id) => PRACTICE.has(id)), 'a hero remade in a paid slot holds ' + JSON.stringify(remade));
  /* K-SEED (L-02) */
  const marks = (await db.query('select grant_key from public.account_kits where user_id = $1 order by grant_key', [LIVE])).rows.map((r) => r.grant_key).join();
  arm('K-SEED', marks === 'account,hero:0,hero:1', 'the live account is marked ' + JSON.stringify(marks));
  const goldBefore = await purse(db, LIVE);
  await as(db, LIVE, 'select public.hr_create_character(2)');
  const third = await bagOf(db, LIVE, 2);
  arm('K-SEED', await purse(db, LIVE) === goldBefore && Object.keys(ACCOUNT_KIT).every((id) => !third[id]) && Object.keys(HERO_KIT).every((id) => third[id] === HERO_KIT[id]),
    'the live account\'s next hero got ' + JSON.stringify(third) + ' and the purse moved ' + (await purse(db, LIVE) - goldBefore));
  /* K-COACH (L-03) */
  const coach = (await db.query('select read, taught from public.account_coach where user_id = $1', [LIVE])).rows[0];
  const want = ['bar_intro', 'first_eat', 'styles'];
  arm('K-COACH', coach && [...coach.read].sort().join() === want.join() && [...coach.taught].sort().join() === want.join(), 'the live account is taught ' + JSON.stringify(coach));
  arm('K-COACH', await one(db, 'select heroes from zz_sk_after') === await one(db, 'select heroes from zz_sk_live'), 'the seed wrote the live heroes\' rows');
  return fails;
}

const BLIND_KITS = ["    -- (a) the FIRST hero of a new account, made in slot 2 as a Mage: the account kit and the hero kit, the wand and the spellbook in\n", "    return;\n    -- (a) the FIRST hero of a new account, made in slot 2 as a Mage: the account kit and the hero kit, the wand and the spellbook in\n"];
const BLIND_COACH = ["    -- (a) an account with nothing reads empty at version 0 and writes nothing for it\n", "    return;\n"];
const MUTANTS = [
  ['the account kit pays every hero (K-ONCE)', KITS, [BLIND_KITS, ['  v_acct := v_n = 1;', '  v_acct := true;']], 'K-ONCE'],
  ['the hero kit pays a remade hero (K-REMADE)', KITS, [BLIND_KITS, ['  v_hero := v_n = 1;', '  v_hero := true;']], 'K-REMADE'],
  ['the pick is ignored, every hero wears the default set (K-PICK)', KITS, [BLIND_KITS, ["     where l.kit = 'practice' and l.set_id = v_set and l.worn;", "     where l.kit = 'practice' and l.default_set and l.worn;"]], 'K-PICK'],
  ['the live accounts are not marked paid (K-SEED)', KITS, [BLIND_KITS, [' group by ps.user_id\n', ' group by ps.user_id having false\n'],
    ['  if v_bad > 0 then\n    raise exception \'start-kits §2:', '  if false then\n    raise exception \'start-kits §2:']], 'K-SEED'],
  ['the coach seed reads one hero only (K-COACH)', COACH, [BLIND_COACH, ['               where p2.user_id = ps.user_id and r.id', '               where p2.user_id = ps.user_id and p2.slot = 0 and r.id'],
    ['  if v_bad > 0 then\n    raise exception \'account-coach §2:', '  if false then\n    raise exception \'account-coach §2:']], 'K-COACH'],
];

async function boot(file, patch) {
  const order = (await chainFiles()).map(([n]) => n);
  if (order.indexOf(COACH) < 0) throw Object.assign(new Error('start-kits: ' + COACH + ' is not in the chain'), { harness: true });
  const next = order[order.indexOf(COACH) + 1];
  const seeds = new Map([[KITS, PLANT]]);
  if (next) seeds.set(next, AFTER_COACH);
  const r = await bootReplay(Object.assign({ seedBefore: seeds },
    patch ? { patches: new Map([[file, patch]]), fullChain: 'the kits (1038) and the coach (1039) both read the planted live account; the guard reads the chain end' } : {}));
  const db = r.db || r;
  if (!next) await db.exec(AFTER_COACH);   // the coach is the chain's last file
  return db;
}

async function main() {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, file, patch, expect] of MUTANTS) {
      let fails;
      try { fails = await rules(await boot(file, patch)); } catch (e) { if (e && e.harness) throw e; fails = ['replay: ' + String(e && e.message).split('\n')[0]]; }
      await closeReplays();
      const caught = fails.some((f) => f.startsWith(expect));
      console.log((caught ? '  ✓ ' : '  ✗ MISSED ') + name + (caught ? '' : ' (' + fails.join(' | ') + ')'));
      if (!caught) missed++;
    }
    console.log(missed ? 'start-kits --mutate: ' + missed + ' MISSED' : 'start-kits --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught, each by its own arm');
    process.exit(missed ? 1 : 0);
  }
  const fails = await rules(await boot());
  await closeReplays();
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'start-kits: RED, ' + fails.length + ' finding(s)' : 'start-kits: the kit once an account and once a slot, the pick worn, live accounts marked and taught once');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) await main();
