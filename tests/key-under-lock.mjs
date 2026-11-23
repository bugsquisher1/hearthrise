#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/key-under-lock.mjs — A SECOND PRESS OF ONE KEY ANSWERS THE FIRST, EVEN WHEN IT WAITED ON THE HERO'S LOCK
//   (supabase/migrations/2027-04-19-key-under-lock.sql; lane/c-audit-db-fixes, 2026-11-13: the whole-game audit's P1).
//
//   node tests/key-under-lock.mjs            the guard
//   node tests/key-under-lock.mjs --mutate   every planted defect must turn its arm red
//
// THE HOLE. A verb that reads its key (hr_intent_replay) only BEFORE it takes the hero's lock, pays through hr_apply on that key, and
// writes its effect itself after hr_apply. Two presses of one key: the second's read runs while the first still holds the lock (no row),
// it waits, then re-quotes under the lock and calls hr_apply with the now-decided key; hr_apply answers { ok, replayed } and charges
// nothing, and the verb writes its effect again. Measured on the replayed chain before the fix: hr_scaled_hunt_buy banked 12 h with no
// gold and no ledger row.
// HOW A ONE-BACKEND DATABASE PLAYS IT. PGlite has no second connection, so the second press is played as what it RUNS after the lock it
// waited on: the live body with its key read before the lock cut out (that read ran before the first press committed and saw nothing),
// installed as a throwaway function inside the arm's rolled-back transaction, called on the same key after the first press.
//
// ARMS (the real replayed chain, PGlite)
//   KL-SCALED   hr_scaled_hunt_buy: press A buys the slider's least hours on the first ground a Level 20 hero scales; the second press
//               after the lock answers ok and moves nothing (purse, bank, ledger); a plain replay of the key still answers and moves nothing
//   KL-HEARTH   hr_hearth_burn: press A burns a named fuel (two in the bag); the second press after the lock lights no flame, writes no
//               square line, keeps the second fuel and pays no Inner Flame XP
//   KL-TIME     hr_time_buy (1058-hunting-blocks.sql, the money verb that replaced the stamina refill and copies its house pattern) on a
//               FLAT table (growth_num = growth_den, a row hr_time_blocks accepts; the x1.5 price would hide the hole): the second press
//               after the lock adds no stamina and charges nothing. (KL-STAMINA, the refill's own arm, retired with the refill's client
//               grant in 1058: its body stays owner-only for 1009's self-check, and KL-CLASS still reads its shape while it exists.)
//   KL-CLASS    every SECURITY DEFINER function on the chain that reads its key before its first lock and pays through hr_apply after it
//               reads the key again between that lock and hr_apply, or is on SAFE_BY_STATE with the check, after the lock, that refuses
//               a second press before hr_apply (that check still in its body); a SAFE_BY_STATE entry that no longer has the shape is stale.
//               A verb with no lock before hr_apply must end on hr_apply's `replayed` answer instead.
//   KL-AGAIN    a second apply of the file AT ITS OWN PLACE in the chain (a boot up to it: 1058-hunting-blocks.sql later revokes the
//               refill this file grants, so a chain-end re-apply re-grants a retired door) is byte-identical (schema, the three bodies
//               and grants, hr_companion_grant's ACL, the client baseline), and its §0 pins refuse a body another file moved
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { one, q, inTx, UIDS } = H;
const UID = UIDS[0];
const HOUR = 3600000;
const FILE = '2027-04-19-key-under-lock.sql';
const ARMS = ['KL-SCALED', 'KL-HEARTH', 'KL-TIME', 'KL-CLASS', 'KL-AGAIN'];
const SIG = Object.freeze({
  scaled: 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)',
  hearth: 'public.hr_hearth_burn(integer,text,uuid)',
  time: 'public.hr_time_buy(text,integer,bigint,uuid)',
});
/* The three bodies FILE restates, read by KL-AGAIN at its own place in the chain. */
const FILE_SIGS = Object.freeze([SIG.scaled, SIG.hearth, 'public.hr_stamina_refill(integer,bigint,uuid)']);
const READ = 'v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);';
const LOCK = 'perform public.hr_hunt_lock(v_uid, p_slot);';

/* THE VERBS WITH THE SHAPE THAT ARE SAFE WITHOUT A SECOND READ: the first press's own committed row (or open hunt) refuses the second
   under the lock, before hr_apply. `check` must stay in the body after the lock; drop the entry the day the verb reads under its lock. */
const SAFE_BY_STATE = Object.freeze({
  hr_title_buy: { check: "'title_owned'", why: 'the title row the first press wrote refuses the second' },
  hr_house_dummy_unlock: { check: "'already_owned'", why: 'the account_house_dummy row the first press wrote refuses the second' },
  hr_hero_rename: { check: "'same_name'", why: 'the name the first press wrote is the name the second asks for' },
  hr_hero_colors_set: { check: "'colors_same'", why: 'the colours the first press wrote are the colours the second asks for' },
  hr_training_start: { check: 'public.hr_hunt_enter_for(', why: 'the session the first press opened refuses the second (busy / hunt_open)' },
  hr_boss_call: { check: "md5('boss_call:start:' || p_idem::text)", why: 'solo: the hunt the first press opened refuses the second; party: the start replays its own derived key' },
  hr_hunt_preset_apply: { check: "if v_delta <> '{}'::jsonb then", why: 'equips the hero\'s own items; the second press finds them worn and calls no hr_apply' },
});

const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const purseOf = async (db) => Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [UID]));
const rowsOf = async (db, like) => Number(await one(db, 'select count(*)::text from public.player_ledger where user_id = $1 and intent like $2', [UID, like]));
async function press(db, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  await asUser(db, UID);
  try { return await one(db, sql, params); } finally { await asUser(db, ''); }
}
async function hero(db, M, o) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'key-under-lock') on conflict (user_id) do nothing`, [UID]);
  await H.character(db, M, UID, o);
}

/* THE SECOND PRESS AFTER THE LOCK: the live body, its FIRST key read (the one before the lock) cut out, installed as public.<as>. */
async function afterLock(db, sig, as) {
  const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [sig])).replace(/\r/g, '');
  const head = 'FUNCTION public.' + sig.slice('public.'.length, sig.indexOf('(')) + '(';
  if (def.split(head).length !== 2) throw new Error('harness: the header of ' + sig + ' is not found once');
  const body = def.replace(head, () => 'FUNCTION public.' + as + '(');
  const at = body.indexOf(READ), lock = body.indexOf(LOCK);
  if (at < 0 || lock < 0 || at > lock) throw new Error('harness: ' + sig + ' has no key read before its lock');
  const end = body.indexOf('end if;', at) + 'end if;'.length;
  await db.exec(body.slice(0, at) + body.slice(end));
}

const DB_ARMS = {
  'KL-SCALED': async (db, M) => {
    const bad = [];
    await db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'scaled_hunts'");
    await hero(db, M, { level: 20, gold: 1000000, inv: {} });
    const view = await one(db, 'select public.hr_scaled_hunts_view($1::uuid, 0) as v', [UID]);
    const [g, row] = Object.entries((view && view.grounds) || {}).find(([, r]) => r.price != null) || [];
    if (!g) return ['harness: no ground scales for a Level 20 hero: ' + JSON.stringify(view)];
    const hours = view.min_hours, price = row.price * hours, k = crypto.randomUUID();
    const bank = async () => Number(await one(db, 'select coalesce((select banked_ms from public.player_scaled_hours where user_id = $1 and slot = 0 and hunt_id = $2), 0)::text', [UID, g]));
    const snap = async () => JSON.stringify({ purse: await purseOf(db), bank: await bank(), rows: await rowsOf(db, 'scaled\\_hunt\\_buy:%') });
    const a = await press(db, 'select public.hr_scaled_hunt_buy(0, $1, $2, $3, $4::uuid) as r', [g, hours, price, k]);
    const s1 = await snap();
    if (!a || a.ok !== true || s1 !== JSON.stringify({ purse: 1000000 - price, bank: hours * HOUR, rows: 1 })) return ['harness: press A answered ' + JSON.stringify(a) + ' to ' + s1];
    await afterLock(db, SIG.scaled, 'hr__kl_scaled');
    const b = await press(db, 'select public.hr__kl_scaled(0, $1, $2, $3, $4::uuid) as r', [g, hours, price, k]);
    const s2 = await snap();
    if (s2 !== s1) bad.push('the second press of one key, run after the lock it waited on, moved ' + s1 + ' to ' + s2 + ' (answered ' + JSON.stringify(b).slice(0, 120) + ')');
    else if (!b || b.ok !== true) bad.push('the second press after the lock answered ' + JSON.stringify(b).slice(0, 160) + ', want the first press\'s decision (ok)');
    const c = await press(db, 'select public.hr_scaled_hunt_buy(0, $1, $2, $3, $4::uuid) as r', [g, hours, price, k]);
    if ((await snap()) !== s1 || !c || c.ok !== true) bad.push('a plain replay of the key answered ' + JSON.stringify(c).slice(0, 120) + ' and left ' + (await snap()));
    return bad;
  },

  'KL-HEARTH': async (db, M) => {
    const bad = [];
    const [fuel] = await q(db, 'select item_id, req_lv from public.hr_hearth_named order by req_lv, item_id limit 1');
    if (!fuel) return ['harness: hr_hearth_named is empty'];
    await hero(db, M, { inv: { [fuel.item_id]: 2 } });
    await db.query(`update public.player_skills set xp = coalesce((select min(c.xp) from public.hr_skill_curve c where c.level = $2), 0)
                     where user_id = $1 and slot = 0 and skill_id = 'inner_flame'`, [UID, fuel.req_lv]);
    const k = crypto.randomUUID();
    const snap = async () => JSON.stringify((await q(db, `select
        (select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2)::int as fuel,
        (select count(*) from public.hearth_flames where user_id = $1)::int as flames,
        (select count(*) from public.chat_messages where from_id = $1 and channel = 'system')::int as lines,
        (select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'inner_flame')::text as xp,
        (select count(*) from public.player_ledger where user_id = $1 and intent like 'hearth\\_burn:%')::int as rows`, [UID, fuel.item_id]))[0]);
    const a = await press(db, 'select public.hr_hearth_burn(0, $1, $2::uuid) as r', [fuel.item_id, k]);
    const s1 = await snap(), o1 = JSON.parse(s1);
    if (!a || a.ok !== true || o1.fuel !== 1 || o1.flames !== 1 || o1.rows !== 1) return ['harness: press A answered ' + JSON.stringify(a).slice(0, 160) + ' to ' + s1];
    await afterLock(db, SIG.hearth, 'hr__kl_hearth');
    const b = await press(db, 'select public.hr__kl_hearth(0, $1, $2::uuid) as r', [fuel.item_id, k]);
    const s2 = await snap();
    if (s2 !== s1) bad.push('the second press of one key, run after the lock it waited on, moved ' + s1 + ' to ' + s2 + ' (a flame for the town with no fuel spent)');
    else if (!b || b.ok !== true) bad.push('the second press after the lock answered ' + JSON.stringify(b).slice(0, 160) + ', want the first press\'s decision (ok)');
    return bad;
  },

  'KL-TIME': async (db, M) => {
    const bad = [];
    await hero(db, M, { gold: 1000000, inv: {} });
    /* A FLAT TABLE (the server accepts growth_num = growth_den): the second press quotes the first's price, so only the key stops it. */
    await db.query("update public.hr_time_blocks set growth_num = growth_den where kind = 'hunt'");
    await db.query('update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = $1 and slot = 0', [UID]);
    const quote = await one(db, "select public.hr_time_quote($1::uuid, 0, 'hunt') as v", [UID]);
    if (!quote || quote.available !== true) return ['harness: no block on an empty pool: ' + JSON.stringify(quote)];
    const k = crypto.randomUUID();
    const snap = async () => JSON.stringify({ purse: await purseOf(db), ms: Number(await one(db, 'select stamina_ms::text from public.player_state where user_id = $1 and slot = 0', [UID])),
      rows: await rowsOf(db, 'time\\_buy:%') });
    const a = await press(db, "select public.hr_time_buy('hunt', 0, $1, $2::uuid) as r", [quote.price, k]);
    const s1 = await snap(), next = await one(db, "select public.hr_time_quote($1::uuid, 0, 'hunt') as v", [UID]);
    if (!a || a.ok !== true || JSON.parse(s1).rows !== 1 || !next || next.price !== quote.price) {
      return ['harness: press A answered ' + JSON.stringify(a).slice(0, 120) + ' to ' + s1 + '; the next quote ' + JSON.stringify(next)];
    }
    await afterLock(db, SIG.time, 'hr__kl_time');
    const b = await press(db, "select public.hr__kl_time('hunt', 0, $1, $2::uuid) as r", [quote.price, k]);
    const s2 = await snap();
    if (s2 !== s1) bad.push('the second press of one key, run after the lock it waited on, moved ' + s1 + ' to ' + s2 + ' (a block with no gold)');
    else if (!b || b.ok !== true) bad.push('the second press after the lock answered ' + JSON.stringify(b).slice(0, 160) + ', want the first press\'s decision (ok)');
    return bad;
  },

  'KL-CLASS': async (db) => {
    const bad = [];
    const rows = await q(db, `select p.proname as name, p.prosrc as src from pg_proc p
                               where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
                                 and p.prosrc ~ 'hr_intent_replay[(]' and p.prosrc ~ 'public[.]hr_apply[(]' order by 1`);
    const LOCKS = /public\.hr_hunt_lock\(|pg_advisory_xact_lock\(|\bfor\s+update\b/i;
    const shaped = new Map();
    for (const r of rows) {
      const src = r.src.replace(/\r/g, '').replace(/--[^\n]*/g, '');
      const m = LOCKS.exec(src);
      const lock = m ? m.index : -1, read = src.indexOf('hr_intent_replay('), apply = src.indexOf('public.hr_apply(');
      if (read < 0 || apply < read || (lock >= 0 && lock < read)) continue;   // the key is read only under a lock already held: right
      /* THE SHAPE: the key read before any lock. With a lock before hr_apply, the cure is a second read between them; with none, hr_apply
         itself is the only serialisation, so its `replayed` answer must end the call. */
      const locked = lock >= 0 && lock < apply;
      const under = locked && src.indexOf('hr_intent_replay(', lock) > 0 && src.indexOf('hr_intent_replay(', lock) < apply;
      const ends = !locked && /'replayed'/.test(src.slice(apply));
      shaped.set(r.name, { src, lock: locked ? lock : apply, ok: under || ends, cure: locked ? 'read it again right after the lock' : 'end the call on hr_apply\'s replayed answer' });
    }
    if (!shaped.size) return ['CONTROL: no function on the chain reads its key before its lock and pays through hr_apply: the census reads nothing'];
    for (const [name, s] of shaped) {
      const safe = SAFE_BY_STATE[name];
      if (s.ok && safe) bad.push(name + ' answers a second press itself now: drop it from SAFE_BY_STATE (a stale entry is a standing permission)');
      else if (!s.ok && !safe) bad.push(name + ' reads its key before its lock and pays through hr_apply: ' + s.cure + ' (2027-04-19-key-under-lock.sql), or name the check that refuses its second press in SAFE_BY_STATE');
      else if (!s.ok && s.src.indexOf(safe.check, s.lock) < 0) bad.push(name + ' is safe by state only through ' + safe.check + ' after its lock, and its body no longer has it');
    }
    for (const name of Object.keys(SAFE_BY_STATE)) if (!shaped.has(name)) bad.push('SAFE_BY_STATE names ' + name + ', which no longer has the shape (or is gone): drop the entry');
    for (const sig of Object.values(SIG)) if (!shaped.get(sig.slice('public.'.length, sig.indexOf('(')))) bad.push('CONTROL: ' + sig + ' is not in the census');
    return bad;
  },

  /* A SECOND APPLY of the file AT ITS OWN PLACE (`db` here is the boot up to FILE, againDb below): byte-identical (the schema, the
     three bodies and their grants, the companion grant's ACL, the client baseline), and its §0 pins still accept their own image. */
  'KL-AGAIN': async (db) => {
    const { inventory } = await import('./schema-replay.mjs');
    const read = async () => JSON.stringify({ inv: await inventory(db),
      fns: await q(db, `select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as m, p.proacl::text as acl from pg_proc p
                         where p.oid in (select to_regprocedure(s) from unnest($1::text[]) s) order by 1`,
                   [[...FILE_SIGS, 'public.hr_companion_grant(integer,text,text,uuid)']]),
      baseline: await q(db, 'select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3') });
    const before = await read();
    try { await db.exec(readFileSync(join(H.ROOT, 'supabase', 'migrations', FILE), 'utf8')); }
    catch (e) { return [FILE + ' refused a second apply: ' + String(e.message).split('\n')[0].slice(0, 200)]; }
    return (await read()) === before ? [] : ['a second apply of ' + FILE + ' moved something'];
  },
};

/* THE CHAIN UP TO FILE, booted once (KL-AGAIN's database; its mutant is planted there). */
let AGAIN = null;
async function againDb() {
  if (!AGAIN) AGAIN = (await (await import('./schema-replay.mjs')).bootReplay({ upTo: FILE })).db;
  return AGAIN;
}

async function runArms(db, M, only) {
  const out = {};
  for (const name of ARMS) {
    if (only && !only.includes(name)) continue;
    const at = name === 'KL-AGAIN' ? await againDb() : db;
    try { out[name] = await inTx(at, () => DB_ARMS[name](at, M)); } catch (e) { out[name] = ['threw: ' + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* DB mutants: anchored edits of a live body (each anchor found exactly once), and the arm that must go red. `old` is the image before
   2027-04-19-key-under-lock.sql: the read under the lock and the replayed line both gone. */
const REREAD = (verb) => `  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(${verb}, p_slot, v_r); end if;
`;
const REPLAYED = (indent) => `${indent}-- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
${indent}if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
`;
const old = (verb, indent) => [{ find: REREAD(verb), replace: '' }, { find: REPLAYED(indent), replace: '' }];
const DB_MUTANTS = [
  { arm: 'KL-SCALED', name: 'the scaled purchase as it was: the key read only before the lock', fn: SIG.scaled, edits: old('c_verb', '  ') },
  { arm: 'KL-HEARTH', name: 'the Hearth burn as it was: the key read only before the lock', fn: SIG.hearth, edits: old("'hearth_burn'", '    ') },
  { arm: 'KL-TIME', name: 'the hunting block with the key read only before the lock', fn: SIG.time, edits: old("'time_buy'", '  ') },
  { arm: 'KL-CLASS', name: 'the scaled purchase reads its key only before the lock (its replayed line kept)', fn: SIG.scaled, edits: [{ find: REREAD('c_verb'), replace: '' }] },
  /* lane/c-tower-paydown: the Burning Tower's door read its key only before its lock (the climb's staged image); the read under its own door
     lock is the fix, and its loss must read red here. */
  { arm: 'KL-CLASS', name: 'the Tower\'s door reads its key only before its lock (its replayed line kept)', fn: 'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)',
    edits: [{ find: "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n  v_party := public.hr_hunt_party_of(v_uid, p_slot);",
      replace: '  v_party := public.hr_hunt_party_of(v_uid, p_slot);' }] },
  { arm: 'KL-CLASS', name: 'a safe-by-state verb loses the row check that refuses its second press', fn: 'public.hr_title_buy(integer,text,bigint,uuid)',
    edits: [{ find: "  if exists (select 1 from public.player_titles h where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_owned', 'title', p_title)); end if;\n", replace: '' }] },
  { arm: 'KL-AGAIN', name: 'another file moved a restated body (the §0 pin must refuse to overwrite it)', fn: SIG.hearth,
    edits: [{ find: "  c_per_min constant int := 10;\n", replace: "  c_per_min constant int := 10;   -- moved by another lane\n" }] },
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  const M = await H.loadEdge(H.ROOT);
  if (MUTATE) {
    let bad = 0;
    const clean = await runArms(db, M);
    for (const [name, p] of Object.entries(clean)) if (p.length) { console.error('✗ harness: ' + name + ' is red on the clean chain, so no mutant can be judged: ' + p[0]); bad++; }
    for (const m of DB_MUTANTS) {
      /* planted where its arm runs: KL-AGAIN's at FILE's own place, every other at the chain's end */
      const at = m.arm === 'KL-AGAIN' ? await againDb() : db;
      const def = String(await one(at, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
      let next = def, miss = false;
      for (const e of m.edits) {
        if (next.split(e.find).length !== 2) { miss = true; break; }
        next = next.replace(e.find, () => e.replace);
      }
      if (miss) { console.error('✗ db mutant "' + m.name + '": an anchor is not found exactly once'); bad++; continue; }
      await at.exec(next);
      try {
        const p = ((await runArms(db, M, [m.arm]))[m.arm] || [])[0];
        if (!p) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(p)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + p.slice(0, 160) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + p.slice(0, 110) + ')');
      } finally { await at.exec(def); }
    }
    console.log(bad ? 'key-under-lock --mutate: ' + bad + ' failure(s)' : 'key-under-lock --mutate: all ' + DB_MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(db, M);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'key-under-lock: ' + red + ' arm(s) red' : 'key-under-lock: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
