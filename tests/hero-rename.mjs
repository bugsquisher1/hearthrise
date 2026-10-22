#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-rename.mjs — THE FIRST NAME IS FREE, A NEW NAME COSTS A LOT OF GOLD
// (Tyler 2026-10-22).
//
//   node tests/hero-rename.mjs             the guard
//   node tests/hero-rename.mjs --list      the mutation catalogue
//   node tests/hero-rename.mjs --selftest  every mutation must be CAUGHT
//   node tests/hero-rename.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-12-04-hero-rename.sql and
// src/data/hero-rename.js (HERO_RENAME, renamePrice).
//
// Real RPCs on a fully replayed PGlite chain (production untouched):
//   N1  THE DATA IS THE SERVER'S. hr_hero_rename_rule and the migration's
//       ⟦hero-rename-rule⟧ row equal src/data/hero-rename.js HERO_RENAME.
//   N2  THE FIRST NAME IS FREE. hr_create_hero names a hero and takes no gold;
//       hr_character_name_set names an unnamed hero free and refuses a named one
//       (already_named); hr_hero_rename on an unnamed hero is not_named.
//   N3  THE QUOTE. The `rename` section prices base + perLevel x the hero's own
//       Level (renamePrice), checked on a hero above Level 1.
//   N4  THE REFUSALS move nothing (gold, name, ledger): short of gold, a wrong
//       price, the same name, too short / too long / reserved / bad characters,
//       another hero's name in any case, another ACCOUNT's display name, in a
//       hunt (hunt_open), another user's slot.
//   N5  THE RENAME charges exactly the price once, one ledger row (shop,
//       hero_rename:<canonical>, meta from/to), the envelope reads the new name,
//       and the old name is claimable by another account at once.
//   N6  A REPLAYED KEY charges nothing; a second rename the same UTC day is
//       renamed_today (the quote says so before the press).
//   N7  THE ACL: the rule and readers are server-only; the verb authenticated-only.
// TRUE CONCURRENCY (two heroes claiming one name at once) is unverified locally
// (PGlite is one backend): the charge and the name update share one
// subtransaction and the unique canonical index decides, so the loser pays nothing.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { HERO_RENAME, renamePrice } from '../src/data/hero-rename.js';

const MIG = '2026-12-04-hero-rename.sql';

/* §6 is blinded so the arms below, not the migration's own self-check, judge each mutant. */
const SELFCHECK_BLIND = ['  v jsonb; q jsonb; v_n1 text; v_n2 text; v_n3 text; v_price bigint; v_role text; v_i int;\nbegin\n',
  '  v jsonb; q jsonb; v_n1 text; v_n2 text; v_n3 text; v_price bigint; v_role text; v_i int;\nbegin\n  if true then return; end if;   -- selftest: §6 short-circuited\n'];
const MUTANTS = {
  free_rename: {
    why: 'hr_character_name_set renames a named hero again: the paid rename has a free twin',
    find: '  if exists (select 1 from public.character_names where user_id = v_uid and slot = p_slot) then',
    repl: '  if false then',
  },
  price_unchecked: {
    why: 'the client price is not compared with the quote: a stale or forged price renames anyway',
    find: '  if v_price <> p_price then',
    repl: '  if false then',
  },
  price_flat: {
    why: 'the quote drops the Level term: a high-Level hero renames for the base price',
    find: "  return jsonb_build_object('price', r.base + r.per_level * v_lv,",
    repl: "  return jsonb_build_object('price', r.base,",
  },
  hunt_ignored: {
    why: 'a hero in a hunt is renamed mid-hunt (the party and the hunt card change name under it)',
    find: '  v_hunt := exists (select 1 from public.hunt_sessions h',
    repl: '  v_hunt := false and exists (select 1 from public.hunt_sessions h',
  },
  day_cap_ignored: {
    why: 'the per-day clamp is not read: a hero renames again and again the same day',
    find: "    'available', not v_hunt and v_n < r.per_day,",
    repl: "    'available', not v_hunt,",
  },
  display_name_ignored: {
    why: 'another ACCOUNT\'s display name is not checked: a hero takes a name that already means another player',
    find: '  select exists (select 1 from public.character_names n\n                  where n.canonical = p_canon and not (n.user_id = p_user and n.slot = p_slot))\n      or exists',
    repl: '  select exists (select 1 from public.character_names n\n                  where n.canonical = p_canon and not (n.user_id = p_user and n.slot = p_slot))\n      or false and exists',
  },
  same_name_charged: {
    why: 'renaming to the name the hero already has is charged',
    find: '  if v_old.name = v_name then',
    repl: '  if false then',
  },
  anon_grant: {
    why: 'anon may call the money verb',
    find: 'revoke execute on function public.hr_hero_rename(int, text, bigint, uuid) from anon, service_role;',
    repl: 'revoke execute on function public.hr_hero_rename(int, text, bigint, uuid) from service_role;\ngrant execute on function public.hr_hero_rename(int, text, bigint, uuid) to anon;',
  },
};

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

async function run(mutate) {
  problems.length = 0;
  let patches;
  if (mutate) {
    const m = MUTANTS[mutate];
    if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
    patches = new Map([[MIG, [[m.find, m.repl], SELFCHECK_BLIND]]]);
  }
  const { db } = await bootReplay({ patches, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const call = async (uid, sql, p) => { await as(uid); await q('delete from public.hr_rate_counters'); return (await one(sql, p)).v; };

  // N1 THE DATA IS THE SERVER'S.
  const rule = await one('select base::text b, per_level::text l, per_day d from public.hr_hero_rename_rule');
  ok(rule && Number(rule.b) === HERO_RENAME.base && Number(rule.l) === HERO_RENAME.perLevel && rule.d === HERO_RENAME.perDay,
    `N1: hr_hero_rename_rule ${JSON.stringify(rule)} != HERO_RENAME ${JSON.stringify(HERO_RENAME)}`);
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r/g, '');
  const want = `-- ⟦hero-rename-rule⟧ HERO_RENAME = { base: ${HERO_RENAME.base}, perLevel: ${HERO_RENAME.perLevel}, perDay: ${HERO_RENAME.perDay} }\n`
    + `insert into public.hr_hero_rename_rule (id, base, per_level, per_day) values (true, ${HERO_RENAME.base}, ${HERO_RENAME.perLevel}, ${HERO_RENAME.perDay})`;
  ok(sql.includes(want), 'N1: the migration\'s ⟦hero-rename-rule⟧ row is not src/data/hero-rename.js HERO_RENAME');

  // Two accounts. A: slot 0 made by hr_create_hero, slot 1 unnamed (the old door). B: one named hero.
  const mk = async () => {
    const u = (await one('select gen_random_uuid() as i')).i;
    await q('insert into auth.users (id) values ($1)', [u]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'hero-rename test')", [u]);
    return u;
  };
  const A = await mk(), B = await mk();
  const COLORS = { head: 1, body: 2, legs: 3, feet: 4 };
  const goldOf = async (u, s) => Number((await one('select gold::text g from public.player_state where user_id=$1 and slot=$2', [u, s])).g);
  const setGold = (u, s, g) => q('update public.player_state set gold=$3 where user_id=$1 and slot=$2', [u, s, g]);
  const nameOf = async (u, s) => (await one('select name from public.character_names where user_id=$1 and slot=$2', [u, s]))?.name ?? null;
  const ledger = (u) => q("select slot, intent, gold::text g, meta from public.player_ledger where user_id=$1 and kind='shop' and intent like 'hero\\_rename:%'", [u]);
  const rename = (u, s, name, price, key) => call(u, `select public.hr_hero_rename($1,$2,$3,${key ? "'" + key + "'::uuid" : 'gen_random_uuid()'}) v`, [s, name, price]);

  // N2 THE FIRST NAME IS FREE.
  let v = await call(A, 'select public.hr_create_hero(0,$1,$2::jsonb,gen_random_uuid()) v', ['Wren Ashby', JSON.stringify(COLORS)]);
  ok(v && v.ok === true, `N2: hr_create_hero answered ${JSON.stringify(v)}`);
  const startGold = await goldOf(A, 0);
  ok((await ledger(A)).length === 0, 'N2: creating a hero wrote a rename ledger row');
  v = await call(A, 'select public.hr_character_name_set(0,$1,gen_random_uuid()) v', ['Wren Other']);
  ok(v && v.error === 'already_named' && await nameOf(A, 0) === 'Wren Ashby', `N2: hr_character_name_set on a named hero answered ${JSON.stringify(v)}`);
  await call(A, 'select public.hr_create_character(1) v');
  v = await rename(A, 1, 'Unnamed Try', 1);
  ok(v && v.error === 'not_named', `N2: renaming an unnamed hero answered ${JSON.stringify(v)}`);
  await setGold(A, 1, 0);
  v = await call(A, 'select public.hr_character_name_set(1,$1,gen_random_uuid()) v', ['Moss Hollow']);
  ok(v && v.ok === true && await nameOf(A, 1) === 'Moss Hollow' && await goldOf(A, 1) === 0, `N2: the free first name answered ${JSON.stringify(v)}`);
  await call(B, 'select public.hr_create_hero(0,$1,$2::jsonb,gen_random_uuid()) v', ['Briar Kettle', JSON.stringify(COLORS)]);

  // N3 THE QUOTE (a hero above Level 1).
  await q('update public.player_state set level_xp = 50000 where user_id=$1 and slot=0', [A]);
  const lv = Number((await one('select public.hr_level_of($1,0) l', [A])).l);
  const quote = async (u, s) => (await one("select public.hr_state_of($1,$2)->'rename' r", [u, s])).r;
  const qa = await quote(A, 0);
  const price = renamePrice(lv);
  ok(lv > 1 && qa && Number(qa.price) === price && qa.level === lv && qa.available === true && qa.why === null && qa.per_day === HERO_RENAME.perDay,
    `N3: at Level ${lv} the rename section reads ${JSON.stringify(qa)} (want price ${price})`);

  // N4 THE REFUSALS move nothing.
  const still = async (tag) => {
    ok(await nameOf(A, 0) === 'Wren Ashby', `N4 ${tag}: the name moved to ${await nameOf(A, 0)}`);
    ok((await ledger(A)).length === 0, `N4 ${tag}: a refusal wrote a ledger row`);
  };
  await setGold(A, 0, price - 1);
  v = await rename(A, 0, 'Wren Tallow', price);
  ok(v && v.error === 'insufficient_gold' && await goldOf(A, 0) === price - 1, `N4: a short purse answered ${JSON.stringify(v)}`); await still('short');
  await setGold(A, 0, price + 7);
  v = await rename(A, 0, 'Wren Tallow', price - 1);
  ok(v && v.error === 'quote_changed' && v.rename && Number(v.rename.price) === price, `N4: a wrong price answered ${JSON.stringify(v)}`); await still('price');
  v = await rename(A, 0, 'Wren Ashby', price);
  ok(v && v.error === 'same_name', `N4: the same name answered ${JSON.stringify(v)}`); await still('same');
  for (const [bad, why] of [['Wb', 'short'], ['W'.repeat(21), 'long'], ['Admin', 'reserved'], ['Wren<3', 'charset']]) {
    v = await rename(A, 0, bad, price);
    ok(v && v.error === 'bad_name' && v.reason === why, `N4: the name ${JSON.stringify(bad)} answered ${JSON.stringify(v)} (want bad_name ${why})`);
  }
  await still('rules');
  v = await rename(A, 0, 'BRIAR KETTLE', price);
  ok(v && v.error === 'name_taken', `N4: another hero's name answered ${JSON.stringify(v)}`); await still('taken');
  v = await rename(A, 0, 'moss hollow', price);
  ok(v && v.error === 'name_taken', `N4: the account's own other hero's name answered ${JSON.stringify(v)}`); await still('own-taken');
  await q("update public.profiles set display_name = 'Quill Tamsin' where id = $1", [B]);
  if (!(await one('select count(*)::int n from public.profiles where id=$1', [B])).n) await q("insert into public.profiles (id, display_name) values ($1, 'Quill Tamsin')", [B]);
  v = await rename(A, 0, 'quill tamsin', price);
  ok(v && v.error === 'name_taken', `N4: another account's display name answered ${JSON.stringify(v)}`); await still('display');
  await q(`insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at) values ($1, 0, 'mill_cellar', now(), now(), now())`, [A]);
  const qh = await quote(A, 0);
  ok(qh && qh.available === false && qh.why === 'hunt_open', `N4: in a hunt the section reads ${JSON.stringify(qh)}`);
  v = await rename(A, 0, 'Wren Tallow', price);
  ok(v && v.error === 'hunt_open' && await goldOf(A, 0) === price + 7, `N4: a rename in a hunt answered ${JSON.stringify(v)}`); await still('hunt');
  await q('delete from public.hunt_sessions where user_id=$1', [A]);
  await setGold(B, 0, 10_000_000);
  v = await rename(B, 1, 'Wren Tallow', price);
  ok(v && v.error === 'no_character' && await goldOf(B, 0) === 10_000_000, `N4: B on a slot it does not hold answered ${JSON.stringify(v)}`); await still('other-user');

  // N5 THE RENAME.
  const KEY = '000000c0-0000-4000-b000-0000e1a5aaaa';
  v = await rename(A, 0, 'Wren Tallow', price, KEY);
  ok(v && v.ok === true && v.name === 'Wren Tallow' && v.from === 'Wren Ashby' && Number(v.gold) === -price, `N5: the rename answered ${JSON.stringify(v)}`);
  ok(await goldOf(A, 0) === 7, `N5: the hero holds ${await goldOf(A, 0)} gold, expected 7`);
  const led = await ledger(A);
  ok(led.length === 1 && led[0].slot === 0 && Number(led[0].g) === -price && led[0].meta && led[0].meta.from === 'Wren Ashby' && led[0].meta.to === 'Wren Tallow',
    `N5: the journal holds ${JSON.stringify(led)}`);
  ok((await one("select public.hr_state_of($1,0)->>'name' n", [A])).n === 'Wren Tallow', 'N5: the envelope does not read the new name');
  ok(startGold >= 0 && await goldOf(A, 1) === 0, 'N5: the rename touched another hero\'s gold');
  v = await call(B, 'select public.hr_create_character(1) v');
  v = await call(B, 'select public.hr_character_name_set(1,$1,gen_random_uuid()) v', ['wren ashby']);
  ok(v && v.ok === true, `N5: the old name is not free for another account: ${JSON.stringify(v)}`);

  // N6 A REPLAY CHARGES NOTHING; ONE A DAY.
  await setGold(A, 0, price * 3);
  v = await rename(A, 0, 'Wren Tallow', price, KEY);
  ok(await goldOf(A, 0) === price * 3 && (await ledger(A)).length === 1, `N6: a replayed key charged again: ${JSON.stringify(v)}`);
  const qd = await quote(A, 0);
  ok(qd && qd.available === false && qd.why === 'renamed_today' && qd.today === 1, `N6: after a rename the section reads ${JSON.stringify(qd)}`);
  v = await rename(A, 0, 'Wren Second', price);
  ok(v && v.error === 'renamed_today' && await goldOf(A, 0) === price * 3 && await nameOf(A, 0) === 'Wren Tallow', `N6: a second rename today answered ${JSON.stringify(v)}`);

  // N7 THE ACL.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    ok(!(await one(`select has_table_privilege('${role}','public.hr_hero_rename_rule','select,insert,update,delete') w`)).w, `N7: ${role} reaches hr_hero_rename_rule`);
  }
  for (const f of ['hr_hero_rename_quote(uuid,integer)', 'hr_name_held_by_other(uuid,integer,text)']) {
    ok(!(await one(`select has_function_privilege('authenticated','public.${f}','execute') e`)).e, `N7: authenticated reaches ${f}`);
  }
  ok(!(await one("select has_function_privilege('anon','public.hr_hero_rename(integer,text,bigint,uuid)','execute') e")).e, 'N7: anon reaches hr_hero_rename');
  ok((await one("select has_function_privilege('authenticated','public.hr_hero_rename(integer,text,bigint,uuid)','execute') e")).e, 'N7: authenticated cannot call hr_hero_rename');
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const pick = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || pick) {
    const ids = pick ? [pick.slice('--mutate='.length)] : Object.keys(MUTANTS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTANTS[id].why}`); }
    }
    console.log(slipped ? `hero-rename --selftest: ${slipped} mutation(s) SLIPPED` : `hero-rename --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('hero-rename: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('hero-rename: the first name is free, a rename costs the server\'s Level price once (N1-N7 green): data = row, refusals move nothing, replay free, one a day, ACL closed');
  process.exit(0);
} catch (e) {
  console.error('hero-rename: HARNESS ERROR', e && e.stack || e);
  process.exit(2);
}
