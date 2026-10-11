#!/usr/bin/env node
// ============================================================================
// tests/daily-harvest-eligibility.mjs — "HARVEST 6 CROPS" IS DEALT ONLY TO A
//                                       CHARACTER WHO CAN DO IT.
//
//   node tests/daily-harvest-eligibility.mjs            the guard (one replay)
//   node tests/daily-harvest-eligibility.mjs --mutate   every mutant must turn red
//
// game-designer, 2026-10-10: daily_harvest may be offered only when the
// character holds plantable seeds AND has a plot. The server decides it
// (supabase/migrations/2026-10-16-daily-harvest-eligibility.sql,
// hr_daily_harvest_ready over server rows); src/data/goal-catalogue.js
// harvestReady is the client's twin for the slate it shows before the tally.
//
// THE ARMS
//   H1  JS: no plot or no seeds -> never dealt, over 400 day keys, and never a
//       short slate; seeds + a plot -> dealt on the days the draw deals it,
//       and exactly the unfiltered slate for a fully unlocked farmer.
//   H2  RULE PARITY: hr_daily_harvest_rule equals the JS rule over every input.
//   H3  THE SERVER, PLAYED ON A REAL CHARACTER: on a day the draw deals
//       harvest, no seeds -> hr_daily_task_set_for leaves it out; plantable
//       seeds -> deals it; a seed above the farming level does not count; and
//       the JS slate built from the same rows equals the server's every time.
//
// THE MUTANTS (--mutate)
//   JS  the plot check is dropped -> H1 · seeds are not required -> H1
//   SQL the shuffle ignores the gate · the plot check is dropped · the level
//       gate on seeds is dropped · set_for always says ready -> the migration's
//       own §4 refuses (each names its arm)
//
// Exit: 0 green (or every mutant caught) · 1 red · 2 harness.
// NO ?v= on the imports (tests/**, b332).
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const OWN_SQL = '2026-10-16-daily-harvest-eligibility.sql';
const UID = '00000000-0000-4000-c000-0000010a1d78';
const H = 'daily_harvest';

const JS_MUTANTS = [
  { name: 'the plot check is dropped', arm: 'H1',
    from: '  if (!((Number(f.plots) || 0) > 0)) return false;\n', to: '' },
  { name: 'seeds are not required', arm: 'H1',
    from: '  return f.plantable === true || (Number(f.growing) || 0) > 0 || (Number(f.today) || 0) > 0;',
    to: '  return true;' },
];

const SQL_MUTANTS = [
  { name: 'the shuffle ignores the harvest gate (pass 1)', expect: /self-check \(b\)/,
    from: "       and (v_id <> 'daily_harvest' or coalesce(p_harvest, false)) then\n      v_out := v_out || v_id;",
    to: ' then\n      v_out := v_out || v_id;' },
  { name: 'the plot check is dropped', expect: /self-check \(b2\)/,
    from: '  select coalesce(p_plots, 0) > 0\n     and (', to: '  select (' },
  { name: 'a seed above the farming level counts', expect: /self-check \(c\)/,
    from: '       and c.req_lv <= v_farm_lv and t.plot_tier <= s.plot_level)',
    to: '       and t.plot_tier <= s.plot_level)' },
  { name: 'set_for always says ready', expect: /self-check \(c\)/,
    from: '    public.hr_daily_harvest_ready(p_day_key, p_user, p_slot));', to: '    true);' },
];

const daySweep = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 0, 1, 12) + i * 86400000);
    out.push(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
  }
  return out;
};

async function load(base) {
  return import(pathToFileURL(join(base, 'src', 'data', 'goal-catalogue.js')).href + `?t=${Date.now()}${Math.random()}`);
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-harvest-'));
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, 'src', 'data', 'goal-catalogue.js');
  const src = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  if (src.split(m.from).length !== 2) {
    console.error(`--mutate ${m.name}: marker not exactly once — "${m.from.slice(0, 80)}"`); process.exit(2);
  }
  await writeFile(path, src.replace(m.from, () => m.to), 'utf8');
  return base;
}

const NOT_READY = [
  { plots: 0, plantable: true, growing: 1, today: 1 },       // no plot, whatever else
  { plots: 2, plantable: false, growing: 0, today: 0 },      // a plot, nothing to plant
  {},                                                         // unknown = not ready
];
const READY = { plots: 2, plantable: true, growing: 0, today: 0 };

function jsArms(gc) {
  const fails = [];
  const fail = (arm, msg) => fails.push(`${arm}: ${msg}`);
  const caps = (farm) => ({ rooms: { workshop: 1, forge: 1 }, skillXp: {}, farm });
  let dealt = 0;
  for (const k of daySweep(400)) {
    for (const farm of NOT_READY) {
      const set = gc.dailyTaskSet(k, caps(farm));
      if (set.includes(H)) { fail('H1', `${k}: harvest dealt to ${JSON.stringify(farm)}: ${set}`); return fails; }
      if (set.length !== gc.DAILY_TASK_BASE_COUNT) { fail('H1', `${k}: short slate ${set}`); return fails; }
    }
    const on = gc.dailyTaskSet(k, caps(READY));
    const raw = gc.dailyTaskIndexes(k).slice(0, gc.DAILY_TASK_BASE_COUNT).map((i) => gc.DAILY_TASK_POOL_ORDER[i]);
    if (on.join(',') !== raw.join(',')) { fail('H1', `${k}: a fully unlocked farmer is dealt ${on}, the draw says ${raw}`); return fails; }
    if (on.includes(H)) dealt++;
  }
  if (dealt === 0) fail('H1', 'harvest was never dealt to a farmer with seeds and a plot in 400 days');
  return fails;
}

async function sqlArms(db, gc) {
  const fails = [];
  const fail = (arm, msg) => fails.push(`${arm}: ${msg}`);
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];

  // H2 — the pure rule, both languages, every input.
  for (const plots of [0, 1, 2]) for (const plantable of [false, true])
    for (const growing of [0, 1, 3]) for (const today of [0, 1, 5]) {
      const sq = (await one('select public.hr_daily_harvest_rule($1::int, $2::boolean, $3::int, $4::bigint) as r',
        [plots, plantable, growing, today])).r;
      const js = gc.dailyTaskEligible(H, { farm: { plots, plantable, growing, today } });
      if (sq !== js) { fail('H2', `${JSON.stringify({ plots, plantable, growing, today })}: SQL ${sq}, JS ${js}`); return fails; }
    }

  // H3 — a real character on the replayed chain.
  let day = null;
  for (const k of daySweep(60)) {
    if ((await one('select public.hr_daily_task_set_caps($1, 0, 0, 0, 0, true) as s', [k])).s.includes(H)) { day = k; break; }
  }
  if (!day) { fail('H3', 'no day in 60 deals harvest — the arm proves nothing'); return fails; }
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [UID]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [UID]);
  await db.query('select public.hr_create_character(0)');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  const clearSeeds = () => db.query(`delete from public.player_inventory i using public.hr_crops c
     where i.user_id = $1 and i.slot = 0 and i.item_id = c.seed_item`, [UID]);
  await clearSeeds();
  await db.query('delete from public.player_farm where user_id = $1', [UID]);
  await db.query(`delete from public.player_progress where user_id = $1 and kind = 'daily'`, [UID]);
  /* The JS slate from the SAME rows the server reads — no client value. */
  const jsFromRows = async () => {
    const r = await one(`select
        (select coalesce(max(level) filter (where unlock_id like 'property:%'), 0) from public.hr_unlock_levels($1, 0)) as tier,
        exists (select 1 from public.player_inventory i join public.hr_crops c on c.seed_item = i.item_id
                  join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
                  join public.player_state s on s.user_id = i.user_id and s.slot = i.slot
                 where i.user_id = $1 and i.slot = 0 and i.qty > 0 and t.plot_tier <= s.plot_level
                   and c.req_lv <= public.hr_level_from_xp(coalesce((select xp from public.player_skills
                        where user_id = $1 and slot = 0 and skill_id = 'farming'), 0))) as plantable,
        (select count(*) from public.player_farm where user_id = $1 and slot = 0 and crop_id is not null)::int as growing`, [UID]);
    return gc.dailyTaskSet(day, { rooms: {}, skillXp: {},
      farm: { plots: (Number(r.tier) + 1) * 2, plantable: r.plantable, growing: r.growing, today: 0 } });
  };
  const server = async () => (await one('select public.hr_daily_task_set_for($1, $2::uuid, 0) as s', [day, UID])).s;
  const check = async (label, want) => {
    const s = await server(); const j = await jsFromRows();
    if (s.includes(H) !== want) fail('H3', `${label}: the server ${want ? 'left out' : 'dealt'} harvest on ${day}: ${s}`);
    if (s.join(',') !== j.join(',')) fail('H3', `${label}: the client slate ${j} disagrees with the server's ${s}`);
  };
  await check('no seeds, nothing growing', false);
  /* Top plot tier, so the farming LEVEL is the only gate on this seed. */
  await db.query('update public.player_state set plot_level = 5 where user_id = $1 and slot = 0', [UID]);
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty)
    select $1, 0, seed_item, 5 from public.hr_crops order by req_lv desc limit 1`, [UID]);
  await check('only a seed above the farming level', false);
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty)
    select $1, 0, c.seed_item, 5 from public.hr_crops c join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
     where c.req_lv <= 1 and t.plot_tier <= 1 order by c.crop_id limit 1`, [UID]);
  await check('plantable seeds and the camp plots', true);
  await clearSeeds();
  await check('seeds sold again', false);
  return fails;
}

async function boot(patches) {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  return bootReplay(patches ? { patches, upTo: LAST_PATCHED, tolerant: true } : {});
}

async function main() {
  if (!MUTATE) {
    const gc = await load(ROOT);
    const fails = jsArms(gc);
    const { db, failures } = await boot();
    if (failures && failures.length) {
      console.log(`  ✗ the chain does not replay: ${failures.map((f) => `${f.file}: ${String(f.error).split('\n')[0]}`).join('; ')}`);
      process.exit(1);
    }
    fails.push(...await sqlArms(db, gc));
    try { await db.close(); } catch { /* the replay owns its lifetime */ }
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `daily-harvest-eligibility: RED (${fails.length})`
      : 'daily-harvest-eligibility: green — no seeds or no plot is never dealt harvest, seeds + a plot is, '
        + 'the SQL and JS rules agree on every input, and the client slate equals the server\'s on a played character');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('daily-harvest-eligibility --mutate');
  let escaped = 0;
  if (jsArms(await load(ROOT)).length) { console.error('  the unmutated tree is RED — a mutant run proves nothing'); process.exit(1); }
  for (const m of JS_MUTANTS) {
    const fails = jsArms(await load(await mutantBase(m)));
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  JS  ${m.name} -> ${m.arm}${caught ? `   ${fails[0].slice(0, 120)}` : ' stayed green'}`);
    if (!caught) escaped++;
  }
  for (const m of SQL_MUTANTS) {
    let verdict = 'APPLIED';
    try {
      const { failures, db } = await boot(new Map([[OWN_SQL, [[m.from, m.to]]]]));
      const f = (failures || []).find((x) => x.file === OWN_SQL);
      if (f) verdict = f.error;
      try { await db.close(); } catch { /* */ }
    } catch (e) {
      if (e && e.harness) { console.error(`  harness — ${m.name}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
      verdict = String((e && e.message) || e);
    }
    const caught = verdict !== 'APPLIED' && m.expect.test(verdict);
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  SQL ${m.name}${caught ? '' : ` (${String(verdict).split('\n')[0].slice(0, 160)})`}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
