#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-read.mjs — THE WORLD TICK'S NARROW TOWN READ GIVES THE ENGINE EXACTLY WHAT THE WHOLE HERO GIVES IT
//   (supabase/migrations/1043-narrow-town-read.sql; lane/c-settle-cost FB-4, build plan 13 section 2.6, study 48 section 9)
//
//   node tests/town-read.mjs            the guard (replays the chain)
//   node tests/town-read.mjs --mutate   each planted defect in the read turns its hero red
//
// mutant-anchors: none — --mutate replaces hr_tick_town_state's body in a rolled-back savepoint of the replay (from its own
//   pg_get_functiondef); no tracked file is patched
//
// tick.js reads a town hero through hr_tick_town_state, not hr_state_of. The town engine builds its session from that answer
// with envelope.js engineInputsFromEnvelope, and tick.js reads the pointer and the version off it. So for every shape a town
// hero can be in, the engine's inputs from the narrow read must be the engine's inputs from the whole hero, key for key:
//   BENCH   an artisan on a counted run ("make N": bench_run), the bag and the account's Storage (skill_inputs), a buff queue
//           with a perk scale, the tool carry, a death today and before, skills with a carried remainder, worn gear
//   GM      a gatherer on a Game Master account (gm: no Hearthfind), a fight carried on the row
//   CAPPED  an idle hero whose stored HP is over its vitals' maximum (both reads cap it)
// and every key tick.js reads (ok, version, state.active_kind / active_id / active_since / accrued_to) is the same.
// ════════════════════════════════════════════════════════════════════════
import { HARNESS } from './hunt-sessions-settle.mjs';
import { bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { engineInputsFromEnvelope } from '../supabase/functions/hr-accrue/envelope.js';

const { one, q } = HARNESS;
const FN = 'public.hr_tick_town_state(uuid,integer)';
const uid = (i) => `000000c0-0000-4000-a000-00000b0a${String(1043 + i).padStart(4, '0')}`;

/** Canonical JSON (keys sorted), so two answers equal in value compare equal as text. */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

const HEROES = {
  BENCH: async (db, u) => {
    await db.query(`update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_since = now() - interval '1 hour',
                      accrued_to = now() - interval '10 minutes', bank_cap = 400, tool_carry = '{"axe": 3}'::jsonb,
                      active_left = 40, active_count = 60, bench_tax_carry_mg = 734,
                      buffs = jsonb_build_array(jsonb_build_object('type', 'xp', 'magnitude', 0.1, 'until', (now() + interval '20 minutes')::text,
                                                                   'from', (now() - interval '5 minutes')::text, 'scale', 1.2))
                    where user_id = $1 and slot = 0`, [u]);
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'bones', 120), ($1, 0, 'logs', 7)
                      on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [u]);
    await db.query(`insert into public.account_bank (user_id, item_id, qty) values ($1, 'bones', 500)
                      on conflict (user_id, item_id) do update set qty = excluded.qty`, [u]);
    await db.query(`update public.player_skills set xp = xp + 1234, xp_frac = 0.375 where user_id = $1 and slot = 0`, [u]);
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, value, period_key)
                      values ($1, 0, 'stat', 'deaths', 2, ''), ($1, 0, 'stat', 'deaths', 1, public.hr_utc_day_key(now()))
                      on conflict do nothing`, [u]);
  },
  GM: async (db, u) => {
    /* the wall's own guard refuses a GM row for an account that has a hero, and a GM account may not create one: the row is
       placed under the hero in this rolled-back test transaction, the guard's trigger off for that one insert */
    await db.query('alter table public.hr_gm_accounts disable trigger user');
    await db.query(`insert into public.hr_gm_accounts (user_id, note) values ($1, 'town-read probe') on conflict do nothing`, [u]);
    await db.query('alter table public.hr_gm_accounts enable trigger user');
    await db.query(`update public.player_state set active_kind = 'gather', active_id = 'oak_tree', active_since = now() - interval '2 hours',
                      accrued_to = now() - interval '3 minutes', fight = '{"m": "rat", "hp": 3}'::jsonb
                    where user_id = $1 and slot = 0`, [u]);
  },
  CAPPED: async (db, u) => {
    await db.query(`update public.player_state set active_kind = 'idle', active_id = null, hp = 100000 where user_id = $1 and slot = 0`, [u]);
  },
};

/** Build every hero, then compare the two reads for each. Answers the red lines (empty = green). */
async function compareAll(db) {
  const red = [];
  let i = 0;
  for (const [name, setup] of Object.entries(HEROES)) {
    const u = uid(i++);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-read') on conflict (user_id) do nothing`, [u]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u]);
    const made = await one(db, 'select public.hr_create_character(0)');
    if (!made || !(made.ok === true || made.created === true)) { red.push(`${name}: the hero was not created (${JSON.stringify(made).slice(0, 200)})`); continue; }
    await setup(db, u);
    const r = (await q(db, `select public.hr_tick_town_state($1::uuid, 0) as a, public.hr_state_of($1::uuid, 0) as b,
                              floor(extract(epoch from now()) * 1000)::bigint as t`, [u]))[0];
    const a = r.a; const b = r.b; const t = Number(r.t);
    if (!a || a.ok !== true) { red.push(`${name}: the narrow read answered ${JSON.stringify(a).slice(0, 200)}`); continue; }
    for (const k of ['version']) if (canon(a[k]) !== canon(b[k])) red.push(`${name}: ${k} ${canon(a[k])} != ${canon(b[k])}`);
    for (const k of ['active_kind', 'active_id', 'active_since', 'accrued_to']) {
      if (canon(a.state && a.state[k]) !== canon(b.state && b.state[k])) red.push(`${name}: state.${k} ${canon(a.state && a.state[k])} != ${canon(b.state && b.state[k])}`);
    }
    const ia = engineInputsFromEnvelope(a, t); const ib = engineInputsFromEnvelope(b, t);
    for (const k of new Set([...Object.keys(ia), ...Object.keys(ib)])) {
      if (canon(ia[k]) !== canon(ib[k])) red.push(`${name}: the engine's ${k} is ${canon(ia[k]).slice(0, 120)} from the narrow read, ${canon(ib[k]).slice(0, 120)} from hr_state_of`);
    }
  }
  return red;
}

/* Each defect replaces the read's body (its pg_get_functiondef, one anchored edit) inside the savepoint. */
const MUTANTS = [
  { name: 'the read leaves out the account\'s Storage (a bench draws on it)', hero: /BENCH: the engine's storage/,
    find: `    'bank', coalesce((`, repl: `    'bank_x', coalesce((` },
  { name: 'the read leaves out the counted run ("make N")', hero: /BENCH: the engine's (activeLeft|jobEnds)/,
    find: `    'bench_run', public.hr_bench_run_view(p_user, v_st.slot),`, repl: '' },
  { name: 'the read leaves out the tool carry', hero: /BENCH: the engine's toolCarry/,
    find: `'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight),`, repl: `'bank_cap', v_st.bank_cap, 'fight', v_st.fight),` },
  { name: 'the read leaves out the carried fight', hero: /GM: the engine's fight/,
    find: `'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight),`, repl: `'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry),` },
  { name: 'the read leaves out the Game Master wall (a GM hero rolls finds)', hero: /GM: the engine's hearthfindReady/,
    find: `  return v_m || jsonb_build_object(`, repl: `  return (v_m - 'gm') || jsonb_build_object(` },
  { name: 'the read takes the stored HP uncapped', hero: /CAPPED: the engine's hp/,
    find: `'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight),`,
    repl: `'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight, 'hp', v_st.hp),` },
  { name: 'the read names the pointer from another source (the watermark)', hero: /BENCH: state\.accrued_to/,
    find: `'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,`, repl: `'active_since', v_st.active_since, 'accrued_to', v_st.active_since,` },
];

async function main() {
  const { db } = await bootReplay();
  await db.query('begin');
  try {
    if (process.argv.includes('--mutate')) {
      let caught = 0;
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [FN])).replace(/\r/g, '');
      for (const m of MUTANTS) {
        await db.query('savepoint m');
        try {
          const n = def.split(m.find).length - 1;
          if (n !== 1) { console.log(`  STALE    ${m.name} (anchor matches ${n} times)`); continue; }
          await db.exec(def.replace(m.find, () => m.repl));
          const red = await compareAll(db);
          const hit = red.find((x) => m.hero.test(x));
          console.log(`  ${hit ? 'caught ' : 'ESCAPED'}  ${m.name}${hit ? `  <- ${hit.slice(0, 150)}` : `  (red: ${red.slice(0, 2).join(' | ') || 'none'})`}`);
          if (hit) caught++;
        } finally { await db.query('rollback to savepoint m'); }
      }
      console.log(`town-read --mutate: ${caught}/${MUTANTS.length} caught`);
      return caught === MUTANTS.length ? 0 : 1;
    }
    const red = await compareAll(db);
    if (red.length) {
      for (const r of red) console.error(`  RED  ${r}`);
      console.error('\ntown-read: the narrow town read and the whole hero give the town engine different inputs');
      return 1;
    }
    console.log(`town-read: green — ${Object.keys(HEROES).length} town heroes, the engine's inputs and the tick's keys identical from hr_tick_town_state and hr_state_of`);
    return 0;
  } finally { await db.query('rollback'); }
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
