#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/one-town-work-cut.mjs — THE BENCH CUT'S SERVER HALF, EXECUTED AT THE CHAIN END
//   (lane/bench-cut-server; supabase/migrations/1079-one-town-work-cut.sql; docs/design/redesign/09-crafting.md 4.12 and 4.17).
//
//   node tests/one-town-work-cut.mjs            the guard (the whole replayed chain)
//   node tests/one-town-work-cut.mjs --mutate   the proof: each planted defect turns its arm red
//
// mutant-anchors: none — a mutant is planted in a live body (pg_get_functiondef) or in 1079's own block text, in memory
//
// ci-step: db-replay-17 | Bench cut - the hearth's Storage take, nothing of a player's goods deleted, the old trades journalled, the switch lit last
// ci-run: node tests/one-town-work-cut.mjs
// ci-run: node tools/mutant-gate.mjs node tests/one-town-work-cut.mjs --mutate
//
//   OTW-TAKE      hr_apply's craft window (as hr_engine): a hearth run's fuel leaves the bag, then Storage; any other spent line, and a
//                 cut bench's input, leaves the bag only and is refused from Storage with nothing moved; `bench_tax` is no delta key
//   OTW-STRANDED  §0 refuses the apply, naming the table, for an unknown item in each of the seven places one is held, and deletes none
//   OTW-SKILLS    §6: the old trades' rows leave with one ledger row an account holding every XP; combat rows stay; a second run writes
//                 nothing; an hr_skills missing a combat skill refuses instead of reading as "every skill left"
//   OTW-POINTERS  a gather or bench pointer, errand and last activity are cleared; a hearth run's are kept
//   OTW-LIT       the chain end has trade_jobs lit, and lighting it is the file's last statement
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const FILE = '1079-one-town-work-cut.sql';
const TEXT = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r/g, '');
const js = (v) => String(JSON.stringify(v === undefined ? null : v)).slice(0, 260);
const U = '000000c0-0000-4000-a000-0000c0107955';
const OLD = ['mining', 'woodcutting', 'fishing', 'farming', 'cooking', 'crafting', 'smithing', 'runecrafting'];
/** The `do` block of a section, as the file writes it. */
const blockOf = (text, head) => {
  const s = text.indexOf('-- ── ' + head), a = text.indexOf('do $mig$', s), z = text.indexOf('end $mig$;', a);
  if (s < 0 || a < 0 || z < 0) throw Object.assign(new Error('no block ' + head + ' in ' + FILE), { harness: true });
  return text.slice(a, z + 'end $mig$;'.length);
};
const pointersOf = (text) => {
  const a = text.indexOf('-- THE POINTERS.'), z = text.indexOf('\n-- ── §7', a);
  if (a < 0 || z < a) throw Object.assign(new Error('no pointer sweep in ' + FILE), { harness: true });
  return text.slice(a, z);
};

const ARMS = {
  async 'OTW-TAKE'(db, text, t) {
    const p = [];
    let n = 0;
    const put = async (item, bag, sto) => {
      await db.query('delete from public.player_inventory where user_id = $1 and item_id = $2', [U, item]);
      await db.query('delete from public.account_bank where user_id = $1 and item_id = $2', [U, item]);
      if (bag) await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [U, item, bag]);
      if (sto) await db.query('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, $3)', [U, item, sto]);
    };
    const held = async (item) => [Number(await t.one('select coalesce(sum(qty), 0)::text from public.player_inventory where user_id = $1 and item_id = $2', [U, item])),
      Number(await t.one('select coalesce(sum(qty), 0)::text from public.account_bank where user_id = $1 and item_id = $2', [U, item]))];
    const craft = async (id, items, extra = {}) => {
      await db.query("update public.player_state set active_kind = 'artisan', active_id = $2, active_since = now() - interval '10 minutes', accrued_to = now() - interval '10 minutes', work_day = null, work_ms = 0 where user_id = $1 and slot = 0", [U, id]);
      await db.query('delete from public.hr_rate_counters');
      const v = await t.one('select version::text from public.player_state where user_id = $1 and slot = 0', [U]);
      const key = '000000c0-0000-4000-a000-' + String(107950000000 + (++n)).padStart(12, '0');
      await db.exec('set role hr_engine');
      try {
        return await t.one('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::jsonb)', [U, v, key,
          JSON.stringify({ accrued_to: new Date().toISOString(), items, journal: { kind: 'craft', intent: 'accrue' }, ...extra })]);
      } finally { await db.exec('reset role'); }
    };
    await put('pithwood', 2, 3);
    const a = await craft('fuel_pithwood', { pithwood: -5 });
    if (!a || a.ok !== true || js(await held('pithwood')) !== '[0,0]') p.push('a hearth run of 5 over 2 in the bag and 3 in Storage answered ' + js(a) + ', held ' + js(await held('pithwood')));
    const st = await t.one("select meta #>> '{delta,st,pithwood}' from public.player_ledger where user_id = $1 and kind = 'craft' order by id desc limit 1", [U]);
    if (st !== '3') p.push('the journal says Storage paid ' + js(st) + ', not 3');
    await put('pithwood', 5, 5); await put('shrimp', 0, 4);
    const b = await craft('fuel_pithwood', { pithwood: -1, shrimp: -2 });
    if (!b || b.error !== 'insufficient_item' || js(await held('shrimp')) !== '[0,4]' || js(await held('pithwood')) !== '[5,5]') p.push('a line that is not the fuel answered ' + js(b) + ', shrimp ' + js(await held('shrimp')) + ', fuel ' + js(await held('pithwood')));
    const c = await craft('cook_shrimp', { shrimp: -2 });
    if (!c || c.error !== 'insufficient_item' || js(await held('shrimp')) !== '[0,4]') p.push('a cut bench took its input from Storage: ' + js(c) + ', shrimp ' + js(await held('shrimp')));
    const d = await craft('fuel_pithwood', { pithwood: -1 }, { bench_tax: { crafts: 1 } });
    if (!d || d.error !== 'unknown_delta_key') p.push('a bench_tax key answered ' + js(d));
    return p;
  },

  async 'OTW-STRANDED'(db, text, t) {
    const p = [];
    const run = async () => { await db.query('savepoint s'); try { await db.exec(blockOf(text, '§0')); await db.query('release savepoint s'); return null; } catch (e) { await db.query('rollback to savepoint s'); return String(e.message); } };
    const clean = await run();
    if (clean) return ['CONTROL: §0 refuses a clean chain: ' + clean.slice(0, 200)];
    for (const tab of ['player_inventory', 'account_bank', 'player_equipment', 'hunt_bag', 'company_stock', 'market_listings', 'clan_stores']) {
      await db.query('savepoint place');
      await db.exec('set session_replication_role = replica');
      const cols = (await db.query(`select column_name c, data_type d, is_nullable n, column_default f from information_schema.columns where table_schema = 'public' and table_name = $1`, [tab])).rows;
      const need = cols.filter((x) => x.c === 'item_id' || (x.n === 'NO' && x.f === null));
      const val = (x) => (x.c === 'item_id' ? "'otw_gone'" : x.d === 'uuid' ? `'${U}'` : /timestamp/.test(x.d) ? 'now()' : x.c === 'source' ? "'bag'" : x.d === 'boolean' ? 'false' : /char|text/.test(x.d) ? "'weapon'" : '1');
      await db.exec(`alter table public.${tab} disable trigger user; insert into public.${tab} (${need.map((x) => x.c).join(', ')}) values (${need.map(val).join(', ')})`);
      const got = await run();
      const left = await t.one(`select count(*)::int from public.${tab} where item_id = 'otw_gone'`);
      if (!got || !got.includes('STRANDED') || !got.includes('public.' + tab + ' ') || !got.includes('otw_gone')) p.push(tab + ': §0 answered ' + js(got));
      if (left !== 1) p.push(tab + ': the stranded row was touched');
      await db.query('rollback to savepoint place');
    }
    /* and nothing in the file's work deletes a held good (the §8 probe's own rows aside) */
    const work = text.slice(0, text.indexOf('-- ── §8')).replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g, '');
    const del = /delete from public\.(player_inventory|account_bank|player_equipment|hunt_bag|company_stock|market_listings|clan_stores)\b/.exec(work);
    if (del) p.push('1079 deletes a held good: ' + del[0]);
    return p;
  },

  async 'OTW-SKILLS'(db, text, t) {
    const p = [];
    await db.exec(`delete from public.hr_skills where skill_id in (${OLD.map((x) => `'${x}'`).join(', ')})`);
    for (const [i, k] of [...OLD, 'melee'].entries()) {
      await db.query('insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, $3) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp', [U, k, 100 + i]);
    }
    const rows = () => t.one("select count(*)::int from public.player_ledger where user_id = $1 and intent = 'one_town_work_cut'", [U]);
    await db.exec(blockOf(text, '§6'));
    const left = await t.one('select count(*)::int from public.player_skills where user_id = $1 and skill_id = any ($2)', [U, OLD]);
    const melee = await t.one("select xp::int from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'melee'", [U]);
    const meta = await t.one("select meta from public.player_ledger where user_id = $1 and intent = 'one_town_work_cut'", [U]);
    if (left !== 0 || melee !== 108) p.push('old rows left ' + left + ', melee ' + melee + ' (want 0 and 108)');
    if (await rows() !== 1 || !meta || OLD.some((k, i) => Number(meta.skills['0:' + k]) !== 100 + i)) p.push('the journal is ' + js(meta) + ' in ' + await rows() + ' row(s)');
    await db.exec(blockOf(text, '§6'));
    if (await rows() !== 1) p.push('a second run journalled again');
    await db.exec("delete from public.hr_skills where skill_id = 'melee'");
    await db.query('savepoint s');
    let threw = null; try { await db.exec(blockOf(text, '§6')); } catch (e) { threw = String(e.message); }
    await db.query('rollback to savepoint s');
    if (!threw || !threw.includes('PRECONDITION')) p.push('an hr_skills with no Melee answered ' + js(threw));
    return p;
  },

  async 'OTW-POINTERS'(db, text, t) {
    const p = [];
    const run = async (kind, id) => {
      await db.exec('alter table public.player_state disable trigger user');
      await db.query(`update public.player_state set active_kind = $2, active_id = $3, errand_kind = $2, errand_id = $3, last_activity_kind = $2, last_activity_id = $3 where user_id = $1 and slot = 0`, [U, kind, id]);
      await db.exec(pointersOf(text));
      return js(Object.values((await db.query('select active_kind, active_id, errand_kind, last_activity_kind from public.player_state where user_id = $1 and slot = 0', [U])).rows[0]));
    };
    const gone = '["idle",null,null,null]', kept = '["artisan","fuel_pithwood","artisan","artisan"]';
    const node = await t.one("select activity_id from public.hr_activities where kind = 'gather' order by 1 limit 1") || 'mine_copper';
    for (const [kind, id, want] of [['gather', node, gone], ['artisan', 'cook_shrimp', gone], ['artisan', 'fuel_pithwood', kept]]) {
      await db.query('savepoint s');
      const got = await run(kind, id);
      if (got !== want) p.push(kind + ':' + id + ' reads ' + got + ', want ' + want);
      await db.query('rollback to savepoint s');
    }
    return p;
  },

  async 'OTW-LIT'(db, text, t) {
    const p = [];
    if (await t.one("select enabled from public.hr_flags where key = 'trade_jobs'") !== true) p.push('the chain end leaves trade_jobs dark');
    const last = text.replace(/^--.*$/gm, '').trim().split('\n').pop().trim();
    if (last !== "update public.hr_flags set enabled = true where key = 'trade_jobs';") p.push('the last statement is ' + js(last));
    return p;
  },
};

const MUTANTS = [
  { arm: 'OTW-TAKE', name: 'the take serves every spent line', fn: 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', find: 'and t.k = public.hr_hearth_fuel_of(v_st.active_id);', repl: 'and true;' },
  { arm: 'OTW-TAKE', name: 'the take serves no hearth run', fn: 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', find: 'and t.k = public.hr_hearth_fuel_of(v_st.active_id);', repl: 'and false;' },
  { arm: 'OTW-TAKE', name: 'bench_tax is a delta key again', fn: 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', find: "    'active_left',", repl: "    'active_left', 'bench_tax'," },
  ...['account_bank', 'market_listings', 'hunt_bag', 'clan_stores'].map((x) => ({ arm: 'OTW-STRANDED', name: 'no refusal for ' + x, text: [`'${x}'`, "'player_inventory'"] })),
  { arm: 'OTW-STRANDED', name: 'the file deletes a held stack', text: ['-- THE POINTERS.', 'delete from public.account_bank b where not exists (select 1 from public.hr_items t where t.item_id = b.item_id);\n-- THE POINTERS.'] },
  { arm: 'OTW-SKILLS', name: 'the removal is journalled under no name of its own', text: ["'admin', 'one_town_work_cut', jsonb_build_object", "'admin', 'one_town_work_x', jsonb_build_object"] },
  { arm: 'OTW-SKILLS', name: 'the journal loses a row of the removal', text: ["returning s.slot, s.skill_id, s.xp)", "returning s.slot, 'mining'::text as skill_id, s.xp)"] },
  { arm: 'OTW-SKILLS', name: 'a broken hr_skills reads as every skill left', text: ["'inner_flame')) <> 5 then", "'inner_flame')) < 0 then"] },
  { arm: 'OTW-SKILLS', name: 'the removal reaches a combat skill', text: ["and not exists (select 1 from public.hr_skills k where k.skill_id = s.skill_id)\n               returning", "or s.skill_id = 'melee'\n               returning"] },
  { arm: 'OTW-POINTERS', name: 'a bench pointer survives', text: ["where active_kind = 'gather' or (active_kind = 'artisan' and public.hr_hearth_fuel_of(active_id) is null)", "where active_kind = 'gather'"] },
  { arm: 'OTW-POINTERS', name: 'a hearth run is cleared too', text: ["(last_activity_kind = 'artisan' and public.hr_hearth_fuel_of(last_activity_id) is null)", "last_activity_kind = 'artisan'"] },
  { arm: 'OTW-LIT', name: 'the switch is not the last statement', text: ["update public.hr_flags set enabled = true where key = 'trade_jobs';", "update public.hr_flags set enabled = true where key = 'trade_jobs';\nselect 1;"] },
];

async function play(db, name, text) {
  const t = { one: async (sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; } };
  await db.query('begin');
  try {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [U]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'one-town-work-cut') on conflict (user_id) do nothing", [U]);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [U]);
    const c = await t.one('select public.hr_create_character(0)');
    if (!c || c.ok !== true) throw Object.assign(new Error('hr_create_character refused: ' + js(c)), { harness: true });
    return await ARMS[name](db, text, t);
  } catch (e) { if (e.harness) throw e; return ['threw: ' + String(e.message).split('\n')[0].slice(0, 300)]; }
  finally { await db.query('rollback'); }
}

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('one-town-work-cut: HARNESS ' + String(e.message).split('\n')[0]); process.exit(2); }
  try {
    if (!process.argv.includes('--mutate')) {
      let red = 0;
      for (const name of Object.keys(ARMS)) { const p = await play(db, name, TEXT); red += p.length ? 1 : 0; console.log((p.length ? '✗ ' : '✓ ') + name + (p.length ? ': ' + p.join(' | ') : '')); }
      console.log('one-town-work-cut: ' + (red ? red + ' arm(s) RED' : 'green'));
      process.exit(red ? 1 : 0);
    }
    let bad = 0;
    for (const m of MUTANTS) {
      /* the control: the arm is green before its mutant, so a red is the mutant's */
      const before = await play(db, m.arm, TEXT);
      if (before.length) { bad++; console.log('✗ ' + m.arm + ' is red with no mutant: ' + before[0]); continue; }
      let after;
      if (m.fn) {
        const def = (await db.query('select pg_get_functiondef($1::regprocedure) d', [m.fn])).rows[0].d;
        if (def.split(m.find).length !== 2) { bad++; console.log('✗ anchor not found once: ' + m.name); continue; }
        await db.exec(def.replace(m.find, () => m.repl));
        after = await play(db, m.arm, TEXT);
        await db.exec(def);
      } else {
        if (m.text[0] && TEXT.split(m.text[0]).length < 2) { bad++; console.log('✗ anchor not found: ' + m.name); continue; }
        after = await play(db, m.arm, TEXT.replace(m.text[0], () => m.text[1]));
      }
      if (after.some((x) => /^threw: .*(syntax error|does not exist)/.test(x))) { bad++; console.log('✗ BROKEN MUTANT ' + m.name + ': ' + after[0]); continue; }
      const caught = after.length > 0;
      bad += caught ? 0 : 1;
      console.log((caught ? '  caught  ' : '✗ SURVIVED ') + m.arm + ': ' + m.name + (caught ? ' (' + after[0].slice(0, 90) + ')' : ''));
    }
    console.log('one-town-work-cut --mutate: ' + (bad ? bad + ' failure(s)' : 'all ' + MUTANTS.length + ' caught'));
    process.exit(bad ? 1 : 0);
  } catch (e) { console.error('one-town-work-cut: HARNESS ' + String(e.message).slice(0, 300)); process.exit(2); }
}
if (isMain(import.meta.url)) await main();
