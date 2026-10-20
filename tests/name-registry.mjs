#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/name-registry.mjs — ONE NAME, ONE ACCOUNT: DISPLAY AND CHARACTER NAMES
//                           SHARE ONE NAMESPACE, CHECKED BOTH WAYS.
//
//   node tests/name-registry.mjs            the guard (every arm)
//   node tests/name-registry.mjs --mutate   every planted defect must be CAUGHT by its arm
//
// mutant-anchors: supabase/migrations/2026-10-30-name-registry.sql
// mutant-writes-tree: no — each mutant is the migration text patched in memory and applied inside a rolled-back transaction
//
// Ships with supabase/migrations/2026-10-30-name-registry.sql (Security
// pre-reopen MED). The finding: claim_display_name never checked
// character_names, so Mallory could claim the display name "Bob" while Bob's
// character wore it — two "Bob"s in party, chat and inspect, and invites by name
// routed to Bob. Its §4 runs once, at apply; this re-runs both directions on each
// push AS `authenticated` (the real grants):
//   NR-DISPLAY    a display name another account's CHARACTER wears is refused
//                 `taken` (any case/separator spelling), leaves nothing behind,
//                 and the availability probe does not offer it
//   NR-CHARACTER  a character name another account's DISPLAY name wears is
//                 refused `name_taken`, and the database refuses the row on any
//                 path (a definer-side insert), not only through the RPC
//   NR-OWN        one account may wear its own name as display + character name
//   NR-RELEASE    a rename frees a name only when neither table wears it
//   NR-CANON      a row whose canonical is not its name's is refused (one
//                 normalisation in both namespaces)
//   NR-IDEM       a second apply is byte-identical
//   NR-GRANT      the registry and its trigger functions are nobody's
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const FILE = '2026-10-30-name-registry.sql';
const SRC = () => readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
const [BOB, CARA, MAL] = ['000000c0-0000-4000-8000-0000000e2001', '000000c0-0000-4000-8000-0000000e2002', '000000c0-0000-4000-8000-0000000e2003'];
const idem = () => crypto.randomUUID();

/* As PostgREST calls it: the JWT subject set, `set role authenticated`. The first column of the first row. */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const err = (r) => (r && r.ok === true ? 'ok' : r && r.error);
/* A verb that RAISES instead of refusing breaks its contract: answered as {error: 'RAISED:<sqlstate>'}, never a harness skip. */
async function verb(db, uid, sql, params) {
  await db.query('savepoint nr_verb');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  let r;
  try { r = (await db.query(sql, params)).rows[0]; }
  catch (e) { await db.query('rollback to savepoint nr_verb'); await db.exec('reset role'); return { ok: false, error: 'RAISED:' + (e.code || e.message) }; }
  await db.exec('reset role');
  await db.query('release savepoint nr_verb');
  return r ? Object.values(r)[0] : undefined;
}
const claim = (db, uid, name) => verb(db, uid, 'select public.claim_display_name($1)', [name]);
const nameChar = (db, uid, name, slot = 0) => verb(db, uid, 'select public.hr_character_name_set($1, $2, $3::uuid)', [slot, name, idem()]);
/* A definer-side write (no RPC, no pre-check): what the database alone allows. */
async function direct(db, sql, params) {
  await db.query('savepoint nr_direct');
  try { await db.query(sql, params); await db.query('release savepoint nr_direct'); return 'ok'; }
  catch (e) { await db.query('rollback to savepoint nr_direct'); return e.code || String(e.message); }
}

/* Three signed-in accounts, no names yet, one character each. */
async function world(db) {
  for (const uid of [BOB, CARA, MAL]) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into public.profiles (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'name-registry') on conflict (user_id) do nothing", [uid]);
    const c = await as(db, uid, 'select public.hr_create_character(0)');
    if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
  }
  await db.query('delete from public.hr_rate_counters');
}

// ═══════════════════════════════════════════════════════════════════════
const ARMS = {
  'NR-DISPLAY': async (db) => {
    const p = [];
    await world(db);
    if (err(await nameChar(db, BOB, 'Bob Stone')) !== 'ok') return ['HARNESS: Bob could not name his character'];
    for (const spelling of ['Bob Stone', 'bob_stone', 'BOB.STONE']) {
      const r = await claim(db, MAL, spelling);
      if (err(r) !== 'taken') p.push(`Mallory claimed "${spelling}", Bob's character name, as her display name: ` + JSON.stringify(r));
      await db.query('delete from public.hr_rate_counters');
    }
    if (await one(db, 'select count(*)::int from public.display_names where user_id = $1', [MAL])) p.push('a refused claim left a display_names row');
    if (await one(db, 'select display_name from public.profiles where id = $1', [MAL])) p.push('a refused claim left a profile display name');
    const a = await as(db, MAL, 'select public.hr_display_name_available($1)', ['Bob Stone']);
    if (!a || a.available !== false) p.push('the availability probe offers another account\'s character name: ' + JSON.stringify(a));
    const t = await one(db, "select row_to_json(x) from public.hr_character_by_name('bob stone') x");
    if (!t || t.user_id !== BOB) p.push('the name no longer resolves to Bob: ' + JSON.stringify(t));
    return p;
  },

  'NR-CHARACTER': async (db) => {
    const p = [];
    await world(db);
    if (err(await claim(db, CARA, 'Cara Vell')) !== 'ok') return ['HARNESS: Cara could not claim her display name'];
    for (const spelling of ['Cara Vell', 'cara-vell']) {
      const r = await nameChar(db, MAL, spelling);
      if (err(r) !== 'name_taken') p.push(`Mallory named her character "${spelling}", Cara's display name: ` + JSON.stringify(r));
    }
    const d = await direct(db, 'insert into public.character_names (user_id, slot, name, canonical) values ($1, 0, $2, $3)', [MAL, 'Cara Vell', 'cara vell']);
    if (d !== '23505') p.push('the database took a character row wearing another account\'s display name (answered ' + d + ')');
    if (await one(db, 'select count(*)::int from public.character_names where user_id = $1', [MAL])) p.push('a refused character name was written');
    return p;
  },

  'NR-OWN': async (db) => {
    const p = [];
    await world(db);
    if (err(await nameChar(db, BOB, 'Bob Stone')) !== 'ok') return ['HARNESS: Bob could not name his character'];
    const r = await claim(db, BOB, 'Bob Stone');
    if (err(r) !== 'ok') p.push('Bob could not wear his own character\'s name as his display name: ' + JSON.stringify(r));
    if (await one(db, "select count(*)::int from public.hr_name_registry where canonical = 'bob stone' and user_id = $1", [BOB]) !== 1) p.push('the shared name is not one registry row owned by Bob');
    return p;
  },

  'NR-RELEASE': async (db) => {
    const p = [];
    await world(db);
    await nameChar(db, BOB, 'Bob Stone');
    await claim(db, BOB, 'Bob Stone');
    if (err(await nameChar(db, BOB, 'Bob Flint')) !== 'ok') return ['HARNESS: Bob could not rename his character'];
    if (err(await claim(db, MAL, 'Bob Stone')) !== 'taken') p.push('a name still worn as a display name was released');
    await db.query('delete from public.hr_rate_counters');
    if (err(await claim(db, BOB, 'Bob Ash')) !== 'ok') return [...p, 'HARNESS: Bob could not rename his display name'];
    if (await one(db, "select count(*)::int from public.hr_name_registry where canonical = 'bob stone'")) p.push('a name nobody wears stayed registered');
    if (err(await claim(db, MAL, 'Bob Stone')) !== 'ok') p.push('a released name could not be claimed by another account');
    if (err(await nameChar(db, MAL, 'Bob Flint')) !== 'name_taken') p.push('Bob\'s new character name was not his');
    if (err(await nameChar(db, BOB, 'Bob Oak')) !== 'ok') return [...p, 'HARNESS: Bob could not rename his character again'];
    if (err(await nameChar(db, MAL, 'Bob Flint')) !== 'ok') p.push('a character name Bob let go could not be taken by another account');
    await db.query('delete from public.display_names where user_id = $1', [MAL]);   // an account's name row goes (account deletion)
    if (await one(db, "select count(*)::int from public.hr_name_registry where canonical = 'bob stone'")) p.push('a deleted display name stayed registered');
    return p;
  },

  'NR-CANON': async (db) => {
    const p = [];
    await world(db);
    const d = await direct(db, 'insert into public.character_names (user_id, slot, name, canonical) values ($1, 0, $2, $3)', [MAL, 'Mal Vane', 'malvane']);
    if (d !== '23514') p.push('a character row whose canonical is not its name\'s was written (answered ' + d + ')');
    const e = await direct(db, 'insert into public.character_names (user_id, slot, name, canonical) values ($1, 0, $2, $3)', [MAL, 'Mal Vane', 'mal vane']);
    if (e !== 'ok') p.push('HARNESS: a well-formed direct character row was refused (' + e + ')');
    return p;
  },

  'NR-IDEM': async (db) => {
    const snap = async () => JSON.stringify([await inventory(db),
      (await db.query(`select p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') a from pg_proc p
                       where p.pronamespace = 'public'::regnamespace order by 1`)).rows,
      (await db.query('select canonical, user_id::text from public.hr_name_registry order by 1')).rows]);
    const before = await snap();
    try { await db.exec(SRC()); } catch (e) { return ['the second apply RAISED: ' + String(e.message).split('\n')[0]]; }
    return before === await snap() ? [] : ['a second apply moved the schema, a body, an ACL or a registry row'];
  },

  'NR-GRANT': async (db) => {
    const p = [];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      if (await one(db, "select has_table_privilege($1, 'public.hr_name_registry', 'select,insert,update,delete,truncate,references')", [role])) p.push(role + ' reaches hr_name_registry');
      for (const fn of ['public.hr_name_registry_claim()', 'public.hr_name_registry_release()', 'public.hr_display_name_available__ungated(text)']) {
        if (await one(db, "select has_function_privilege($1, $2, 'execute')", [role, fn])) p.push(role + ' can execute ' + fn);
      }
    }
    return p;
  },
};

/* Each mutant: [find, replace] in the migration, the arm that must go red. Its §4 is made an uncalled function. */
const MUTANTS = [
  { arm: 'NR-DISPLAY', why: 'the display-name table claims no registry row (the finding: one direction unchecked)',
    find: 'create trigger hr_display_names_name_registry_claim\n  before insert or update of canonical, user_id, name on public.display_names\n  for each row execute function public.hr_name_registry_claim();', repl: '' },
  { arm: 'NR-DISPLAY', why: 'the claim registers but never compares owners',
    find: '  if v_owner <> new.user_id then', repl: '  if false then' },
  { arm: 'NR-DISPLAY', why: 'the availability probe reads display_names only',
    find: '  select user_id into v_owner from public.hr_name_registry where canonical = v_canon;',
    repl: '  select user_id into v_owner from public.display_names where canonical = v_canon;' },
  { arm: 'NR-CHARACTER', why: 'the character-name table claims no registry row',
    find: 'create trigger hr_character_names_name_registry_claim\n  before insert or update of canonical, user_id, name on public.character_names\n  for each row execute function public.hr_name_registry_claim();', repl: '' },
  { arm: 'NR-RELEASE', why: 'a rename never frees the old name',
    find: 'create trigger hr_display_names_name_registry_release\n  after update of canonical, user_id or delete on public.display_names\n  for each row execute function public.hr_name_registry_release();', repl: '' },
  { arm: 'NR-RELEASE', why: 'a character rename never frees the old name',
    find: 'create trigger hr_character_names_name_registry_release\n  after update of canonical, user_id or delete on public.character_names\n  for each row execute function public.hr_name_registry_release();', repl: '' },
  { arm: 'NR-CANON', why: 'the trigger trusts the writer\'s canonical',
    find: '  if new.canonical is distinct from public.hr_canon_display_name(new.name) then', repl: '  if false then' },
  { arm: 'NR-GRANT', why: 'the registry is readable by authenticated',
    find: 'revoke all on public.hr_name_registry from public, anon, authenticated, service_role;',
    repl: 'revoke all on public.hr_name_registry from public, anon, service_role;\ngrant select on public.hr_name_registry to authenticated;' },
];

function selfCheckOff(src) {
  const m = src.match(/\n(-- (?:── )?§\d+ SELF-CHECK[^\n]*(?:\n--[^\n]*)*)\n(do \$(\w*)\$)/);
  if (!m) throw new Error('no self-check heading in ' + FILE);
  /* (a function replacer: a replacement STRING would read $$ as one $) */
  return src.replace(m[1] + '\n' + m[2], () => m[1] + '\ncreate or replace function pg_temp.nr_selfcheck_off() returns void language plpgsql as $' + m[3] + '$');
}

async function runArm(db, name, prelude) {
  await db.query('begin');
  try {
    if (prelude) await db.exec(prelude);
    return await ARMS[name](db);
  } catch (e) { return ['HARNESS: ' + String(e.message).slice(0, 300)]; }
  finally { await db.query('rollback'); }
}

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(2); }
  if (!MUTATE) {
    let bad = 0;
    for (const name of Object.keys(ARMS)) {
      const p = await runArm(db, name);
      if (p.length) { bad++; for (const x of p) console.error(`✗ ${name}: ${x}`); } else console.log(`✓ ${name}`);
    }
    console.log(bad ? `name-registry: ${bad} of ${Object.keys(ARMS).length} arms red` : `name-registry: green — ${Object.keys(ARMS).length} arms`);
    await db.close().catch(() => {});
    process.exit(bad ? 1 : 0);
  }
  /* The control: the file re-applied, self-check off, nothing planted: every mutant's arm stays green. */
  const base = selfCheckOff(SRC());
  let missed = 0;
  for (const arm of new Set(MUTANTS.map((m) => m.arm))) {
    const p = await runArm(db, arm, base);
    if (p.length) { console.error(`✗ CONTROL ${arm} is red with nothing planted: ${p[0]}`); missed++; }
  }
  for (const mu of MUTANTS) {
    if (!base.includes(mu.find)) { console.error(`✗ ${mu.arm} (${mu.why}): anchor not found in ${FILE}`); missed++; continue; }
    const planted = base.replace(mu.find, () => mu.repl);
    const p = (await runArm(db, mu.arm, planted)).filter((x) => !x.startsWith('HARNESS'));
    if (p.length) console.log(`✓ ${mu.arm} catches: ${mu.why} — ${p[0].slice(0, 120)}`);
    else { console.error(`✗ ${mu.arm} MISSED: ${mu.why}`); missed++; }
  }
  await db.close().catch(() => {});
  console.log(missed ? `name-registry --mutate: ${missed} missed or red` : `name-registry --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
