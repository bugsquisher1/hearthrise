#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/shared-farm.mjs — ONE FIELD PER ACCOUNT (Tyler 2026-10-23: "since the
// house is shared, the farm plot should be too").
//
//   node tests/shared-farm.mjs             the guard
//   node tests/shared-farm.mjs --list      the mutation catalogue
//   node tests/shared-farm.mjs --selftest  every mutation must be CAUGHT
//   node tests/shared-farm.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-12-14-shared-farm.sql
//
// Real heroes on a fully replayed PGlite chain (real PostgreSQL, in process,
// production untouched), every verb called as the signed-in player:
//   F1  ONE FIELD. Hero 0 plants; hero 1's farm_land and envelope `farm` are the
//       same field (by = 0, by_name = hero 0's name), the cap and tier the
//       account's; hero 1 planting on hero 0's crop is plot_occupied.
//   F2  PLANT ON A, HARVEST ON B. Hero 1 harvests hero 0's crop: the crop and the
//       Farming XP land on hero 1 only, hero 0's seed was the one spent, the plot
//       is gone from both views, and a second harvest is empty_plot. Every row
//       of the journal is on the acting hero.
//   F3  THE FOLD, ON A DATABASE THAT HAS PER-HERO FARMS. The chain is replayed to
//       the file BEFORE this one; two accounts plant, water and buy a plot tier
//       through the OLD verbs; the migration is applied; every crop is on its
//       account in (slot, plot) order with its clocks, the plots past the cap are
//       extra, the tier is the highest a hero bought, every plot is journalled,
//       player_farm and player_state.plot_level are gone.
//   F4  RE-APPLY IS A NO-OP: the whole schema fingerprint and the farm rows.
//   F5  ANOTHER ACCOUNT sees nothing (view, envelope, RLS) and touches nothing.
//   F6  THE LOCK DISCIPLINE (what PGlite, one backend, cannot race): in every
//       installed farm writer the hero row FOR UPDATE comes before the account
//       farm lock, which comes before the first read of the field; no verb moves
//       gold but through hr_farm_purse_pay; no body names player_farm.
//   F7  THE ROLL IS THE PLANT'S: a harvest by hero 1 of hero 0's plant rolls the
//       planter's seed, not the harvester's (picked so the two differ).
//   F8  THE TIER, THE PURSE, THE EXTRA PLOT: hero 1 buys tier 2 with its own gold,
//       hero 0's intent for tier 2 is stale; a seedless replant charges the acting
//       hero only; an extra plot harvests once (a regrowing crop too), is never
//       replanted and buys no seed.
//   F9  THE ACL: own-read only, no client write, helpers owner-only.
//   F10 THE ENGINE CANNOT WRITE THE FIELD: hr_apply carries no `farm` key.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend, so two transactions never overlap
// here. F6 pins the lock ORDER that makes the concurrent case correct (two heroes
// serialise on the account farm key; nothing takes a hero lock after it); the
// overlapping run itself is unverified locally.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, inventory } from './schema-replay.mjs';
import { goldOf, setGold as setGoldOf } from './_gold.mjs';

const MIG = '2026-12-14-shared-farm.sql';
const PREV = '2026-12-11-hunt-deploy-no-forfeit.sql';

/* Short-circuit the migration's own §0 pins, §3 fold probe + conservation check and
   §7 self-check, so a planted defect can only be seen by THIS guard's arms (the
   self-checks run once, at apply; the regression that matters is a later
   restatement that never runs them). */
const GATE_BLIND = [
  ['declare v_md5 text; v_sig text; v_pre text; v_own text;\nbegin\n',
   'declare v_md5 text; v_sig text; v_pre text; v_own text;\nbegin\n  if true then return; end if;   -- selftest: §0 pins short-circuited\n'],
  ['  lock table public.player_state in share row exclusive mode;\n',
   '  lock table public.player_state in share row exclusive mode;\n  if true then perform pg_temp.hr_farm_fold(null); return; end if;   -- selftest: §3 probe + conservation short-circuited\n'],
  ['  v_g bigint; v_price bigint; v_base0 bigint; v_base1 bigint; v_cap int; v_src text; v_n int;\nbegin\n',
   '  v_g bigint; v_price bigint; v_base0 bigint; v_base1 bigint; v_cap int; v_src text; v_n int;\nbegin\n  if true then return; end if;   -- selftest: §7 short-circuited\n'],
];

const BODY = {
  view_per_hero: {
    why: 'PER-SLOT KEYING COMES BACK in farm_land: each hero sees only the plots it planted',
    find: "   where f.user_id = p_user;\n  return jsonb_build_object('cap', v_cap,",
    repl: "   where f.user_id = p_user and f.planted_by = p_slot;\n  return jsonb_build_object('cap', v_cap,",
  },
  envelope_per_hero: {
    why: 'PER-SLOT KEYING COMES BACK in hr_state_of `farm`: the envelope shows each hero its own plots',
    find: "                from public.account_farm_plots af where af.user_id = p_user) f), '[]'::jsonb),$a$];",
    repl: "                from public.account_farm_plots af where af.user_id = p_user and af.planted_by = v_st.slot) f), '[]'::jsonb),$a$];",
  },
  harvest_per_hero: {
    why: 'PER-SLOT KEYING COMES BACK in the harvest: a hero cannot harvest a crop another hero planted',
    find: "  select * into v_plot from public.account_farm_plots\n    where user_id = v_uid and plot_idx = p_plot_idx;\n  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest'",
    repl: "  select * into v_plot from public.account_farm_plots\n    where user_id = v_uid and plot_idx = p_plot_idx and planted_by = p_slot;\n  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest'",
  },
  occupied_per_hero: {
    why: 'PER-SLOT KEYING COMES BACK in the plant: a hero does not see another hero\'s crop as taking the plot',
    find: '  select planted_by into v_by from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;\n',
    repl: '  select planted_by into v_by from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx and planted_by = p_slot;\n',
  },
  crop_to_planter: {
    why: 'the harvest puts the crop in the PLANTER\'s bag, not the harvesting hero\'s',
    find: '    values (v_uid, p_slot, v_crop.prod_item, v_qty)\n',
    repl: '    values (v_uid, v_plot.planted_by, v_crop.prod_item, v_qty)\n',
  },
  roll_by_harvester: {
    why: 'the harvest roll is keyed on the HARVESTER: choosing which hero harvests re-rolls the crop',
    find: '  v_seed := public.hr_seed(v_uid, v_plot.planted_by,\n',
    repl: '  v_seed := public.hr_seed(v_uid, p_slot,\n',
  },
  harvest_unlocked: {
    why: 'hr_farm_harvest stops taking the account farm lock: two heroes harvesting one plot both read it ready',
    find: "  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  perform public.hr_farm_lock(v_uid);\n",
    repl: "  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n",
  },
  purse_wrong_hero: {
    why: 'the replant\'s seed purchase is charged to hero 0 whoever acts: gold moves off a hero that did nothing',
    find: '        v_purse := public.hr_farm_purse_pay(v_uid, p_slot, v_price);\n',
    repl: '        v_purse := public.hr_farm_purse_pay(v_uid, 0, v_price);\n',
  },
  extra_replanted: {
    why: 'an extra plot (past the cap) is replanted: a seed is bought for a plot the account never had room for',
    find: "  elsif coalesce(v_h ->> 'extra', '') = 'true' then\n    v_rep := jsonb_build_object('ok', false, 'error', 'extra_plot');  -- an extra plot is gone after its harvest\n",
    repl: '',
  },
  extra_kept: {
    why: 'an extra plot survives its harvest (a regrowing crop regrows): the fold\'s overflow becomes permanent land',
    find: '  if v_extra then\n    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;\n  elsif v_crop.regrows then\n',
    repl: '  if false then\n    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;\n  elsif v_crop.regrows then\n',
  },
  fold_drops_extras: {
    why: 'the fold keeps only what fits the cap: the heroes\' other crops are destroyed',
    find: "    select s.user_id, s.to_idx, s.crop_id, s.planted_at, coalesce(s.waterings, '{}'), s.regrow_count, s.slot from src s\n",
    repl: "    select s.user_id, s.to_idx, s.crop_id, s.planted_at, coalesce(s.waterings, '{}'), s.regrow_count, s.slot from src s\n     where s.to_idx < public.hr_farm_plot_cap(s.user_id)\n",
  },
  fold_tier_lowest: {
    why: 'the fold keeps the LOWEST tier a hero had: a bought tier is lost',
    find: '  select ps.user_id, max(ps.plot_level), now()\n',
    repl: '  select ps.user_id, min(ps.plot_level), now()\n',
  },
  fold_dries_crops: {
    why: 'the fold forgets the watering history: a watered crop grows back at the dry speed',
    find: "coalesce(s.waterings, '{}'), s.regrow_count, s.slot from src s\n",
    repl: "'{}'::timestamptz[], s.regrow_count, s.slot from src s\n",
  },
  fold_unjournalled: {
    why: 'the fold moves crops without a journal row: which hero held which plot is lost',
    find: "                            'extra', s.to_idx >= public.hr_farm_plot_cap(s.user_id), 'to', 'account')\n    from src s;\n",
    repl: "                            'extra', s.to_idx >= public.hr_farm_plot_cap(s.user_id), 'to', 'account')\n    from src s where false;\n",
  },
  client_write_grant: {
    why: 'authenticated is granted INSERT/UPDATE on the field: a client can plant its own crops',
    find: "    execute format('grant select on public.%I to authenticated', v_t);\n",
    repl: "    execute format('grant select, insert, update on public.%I to authenticated', v_t);\n",
  },
  engine_farm_kept: {
    why: 'hr_apply keeps its `farm` delta key: a second, per-hero writer of the field',
    find: "    -- written only by the hr_farm_* verbs. A delta naming it is refused unknown_delta_key.\n    'progress','progress_claim','journal',$a$,",
    repl: "    -- written only by the hr_farm_* verbs. A delta naming it is refused unknown_delta_key.\n    'farm','progress','progress_claim','journal',$a$,",
  },
};
const MUTATIONS = {};
for (const [id, m] of Object.entries(BODY)) MUTATIONS[id] = { ...m, also: GATE_BLIND };

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const notes = [];

function patchList(mutate) {
  if (!mutate) return [];
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return [[m.find, m.repl], ...(m.also || [])];
}

async function migrationText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  for (const [find, repl] of patchList(mutate)) {
    if (sql.split(find).length - 1 !== 1) { const e = new Error(`patch anchor matched != 1 time in ${MIG}: ${find.slice(0, 70)}`); e.harness = true; throw e; }
    sql = sql.replace(find, () => repl);
  }
  return sql;
}

let NAMES = 0;
const HERO_NAMES = ['Alda', 'Bren', 'Cora', 'Dain', 'Edda', 'Finn', 'Gale', 'Hild'];

function drivers(db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = async (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');
  const newAccount = async (heroes) => {
    const uid = (await one('select gen_random_uuid() as i')).i;
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'shared-farm test') on conflict (user_id) do nothing", [uid]);
    await as(uid);
    const names = [];
    for (let slot = 0; slot < heroes; slot++) {
      await gate();
      const r = (await one('select public.hr_create_character($1) as v', [slot])).v;
      if (!r || r.ok !== true) { const e = new Error(`hr_create_character(${slot}) refused: ${JSON.stringify(r)}`); e.harness = true; throw e; }
      const name = HERO_NAMES[NAMES++ % HERO_NAMES.length] + String.fromCharCode(97 + Math.floor(NAMES / HERO_NAMES.length) % 26);
      await q('insert into public.character_names (user_id, slot, name, canonical) values ($1,$2,$3,lower($3)) on conflict do nothing', [uid, slot, name]);
      names.push(name);
    }
    return { uid, names };
  };
  /* Every verb as the signed-in player; a database ERROR is a finding, not a harness crash. */
  const verb = async (uid, sql, params, label) => {
    await as(uid); await gate();
    try { return (await one(`select ${sql} as v`, params)).v; }
    catch (e) { problems.push(`${label}: raised ${String(e.message).split('\n')[0]}`); return { ok: false, error: 'raised' }; }
  };
  const plant = (u, s, i, crop) => verb(u, 'public.hr_farm_plant($1,$2,$3,gen_random_uuid())', [s, i, crop], `plant ${s}/${i}`);
  const water = (u, s, i) => verb(u, 'public.hr_farm_water($1,$2,gen_random_uuid())', [s, i], `water ${s}/${i}`);
  const harvest = (u, s, i) => verb(u, 'public.hr_farm_harvest($1,$2,gen_random_uuid())', [s, i], `harvest ${s}/${i}`);
  const replant = (u, s, i) => verb(u, 'public.hr_farm_harvest_replant($1,$2,gen_random_uuid())', [s, i], `replant ${s}/${i}`);
  const upgrade = (u, s, lv) => verb(u, 'public.hr_farm_upgrade_plot($1,gen_random_uuid(),$2)', [s, lv], `upgrade ${s}->${lv}`);
  const land = async (u, s) => (await one('select public.hr_farm_land_view($1,$2) as v', [u, s])).v;
  const env = async (u, s) => (await one('select public.hr_state_of($1,$2) as v', [u, s])).v;
  const bag = async (u, s, item) => Number((await one('select coalesce(sum(qty),0)::text q from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3', [u, s, item])).q);
  const setBag = (u, s, item, n) => n > 0
    ? q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,$2,$3,$4) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [u, s, item, n])
    : q('delete from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3', [u, s, item]);
  const xp = async (u, s) => Number((await one("select coalesce(sum(xp),0)::text x from public.player_skills where user_id=$1 and slot=$2 and skill_id='farming'", [u, s])).x);
  /* The gold a hero spends: its ACCOUNT's purse once 2026-12-15-account-gold.sql runs (one per account, the
     slot names the acting hero only), its own player_state.gold before it. */
  const gold = (u, s) => goldOf(q, u, s);
  const setGold = (u, s, g) => setGoldOf(q, u, s, g);
  const ripen = (u, i) => q("update public.account_farm_plots set planted_at = now() - interval '30 hours' where user_id=$1 and plot_idx=$2", [u, i]);
  const farmXp = async (lv) => Number((await one('select xp::text x from public.hr_xp_table where level=$1', [lv])).x);
  return { q, one, as, gate, newAccount, plant, water, harvest, replant, upgrade, land, env, bag, setBag, xp, gold, setGold, ripen, farmXp };
}

const strip = (s) => String(s || '').replace(/--[^\n]*/g, '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** F1, F2, F4–F10 on the whole chain. */
async function fullChainArms(mutate) {
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: MIG });
  const d = drivers(db);
  const A = await d.newAccount(2);
  const u = A.uid;
  await d.setBag(u, 0, 'turnip_seed', 5); await d.setBag(u, 1, 'turnip_seed', 7);

  // F1 ONE FIELD.
  let v = await d.plant(u, 0, 0, 'turnip');
  ok(v && v.ok === true, `F1: hero 0's plant refused: ${JSON.stringify(v)}`);
  v = await d.plant(u, 0, 1, 'turnip');
  ok(v && v.ok === true, `F1: hero 0's second plant refused: ${JSON.stringify(v)}`);
  const l0 = await d.land(u, 0), l1 = await d.land(u, 1);
  ok(l1 && Array.isArray(l1.plots) && l1.plots.length === 2, `F1: hero 1's field holds ${JSON.stringify(l1 && l1.plots)} after hero 0 planted two`);
  ok(l0 && l1 && same(l0.plots, l1.plots) && l0.cap === l1.cap && l0.plot_level === l1.plot_level, `F1: the two heroes read different fields: ${JSON.stringify(l0)} vs ${JSON.stringify(l1)}`);
  const p0 = l1 && l1.plots && l1.plots[0];
  ok(p0 && p0.i === 0 && p0.crop === 'turnip' && p0.by === 0 && p0.by_name === A.names[0] && p0.extra === false,
    `F1: plot 0 on hero 1's field reads ${JSON.stringify(p0)}, expected turnip by 0 (${A.names[0]}), not extra`);
  ok(l1 && l1.cap === 2 && l1.plot_level === 1, `F1: a fresh account's field is cap ${l1 && l1.cap}, tier ${l1 && l1.plot_level} (want 2, 1)`);
  const e0 = await d.env(u, 0), e1 = await d.env(u, 1);
  ok(Array.isArray(e1.farm) && e1.farm.length === 2 && same(e0.farm, e1.farm), `F1: the envelopes carry different farms: ${JSON.stringify(e0.farm)} vs ${JSON.stringify(e1.farm)}`);
  ok(e1.state && e1.state.plot_level === 1, `F1: hero 1's envelope state.plot_level is ${e1.state && e1.state.plot_level}`);
  v = await d.plant(u, 1, 0, 'turnip');
  ok(v && v.error === 'plot_occupied' && v.by === 0, `F1: hero 1 planting on hero 0's crop answered ${JSON.stringify(v)}`);

  // F2 PLANT ON A, HARVEST ON B.
  await d.ripen(u, 0);
  const xp0 = await d.xp(u, 0), xp1 = await d.xp(u, 1), c0 = await d.bag(u, 0, 'turnip'), c1 = await d.bag(u, 1, 'turnip');
  v = await d.harvest(u, 1, 0);
  ok(v && v.ok === true && v.planted_by === 0, `F2: hero 1's harvest of hero 0's crop answered ${JSON.stringify(v)}`);
  if (v && v.ok) {
    ok(await d.bag(u, 1, 'turnip') === c1 + v.qty && await d.bag(u, 0, 'turnip') === c0, `F2: the crop did not land on hero 1 only (hero 1 ${c1} -> ${await d.bag(u, 1, 'turnip')}, hero 0 ${c0} -> ${await d.bag(u, 0, 'turnip')}, qty ${v.qty})`);
    ok(await d.xp(u, 1) === xp1 + v.xp && await d.xp(u, 0) === xp0, `F2: the Farming XP did not land on hero 1 only (hero 1 ${xp1} -> ${await d.xp(u, 1)}, hero 0 ${xp0} -> ${await d.xp(u, 0)}, xp ${v.xp})`);
  }
  ok(await d.bag(u, 0, 'turnip_seed') === 3 && await d.bag(u, 1, 'turnip_seed') === 7, `F2: seeds hero 0 ${await d.bag(u, 0, 'turnip_seed')} (want 3), hero 1 ${await d.bag(u, 1, 'turnip_seed')} (want 7)`);
  ok(!(await d.land(u, 0)).plots.some((p) => p.i === 0) && !(await d.land(u, 1)).plots.some((p) => p.i === 0), 'F2: the harvested plot is still on a hero\'s field');
  v = await d.harvest(u, 0, 0);
  ok(v && v.error === 'empty_plot', `F2: a second harvest of the same plot answered ${JSON.stringify(v)}`);
  const jr = await d.q("select slot, intent, meta from public.player_ledger where user_id=$1 and kind='farm' and intent in ('farm_plant','farm_harvest') order by id", [u]);
  ok(jr.filter((r) => r.intent === 'farm_plant').every((r) => r.slot === 0) && jr.filter((r) => r.intent === 'farm_plant').length === 2
    && jr.filter((r) => r.intent === 'farm_harvest').length === 1 && jr.find((r) => r.intent === 'farm_harvest').slot === 1
    && jr.find((r) => r.intent === 'farm_harvest').meta.planted_by === 0, `F2: the journal is ${JSON.stringify(jr.map((r) => [r.slot, r.intent, r.meta && r.meta.planted_by]))}`);

  // F7 THE ROLL IS THE PLANT'S (plot 1, planted by hero 0, harvested by hero 1).
  const crop = await d.one("select yield_min, yield_max from public.hr_crops where crop_id='turnip'");
  const span = Math.max(1, crop.yield_max - crop.yield_min + 1);
  let rollOk = false, want = null;
  for (let k = 0; k < 12 && !rollOk; k++) {
    await d.q(`update public.account_farm_plots set planted_at = date_trunc('second', now()) - interval '30 hours' - make_interval(secs => $2) where user_id=$1 and plot_idx=1`, [u, k]);
    const r = await d.one(`select (select yield_min from public.hr_crops where crop_id='turnip')
        + ((public.hr_seed($1, 0, 'farm_harvest:1:' || extract(epoch from f.planted_at)::bigint::text) % $2) + $2) % $2 as by_planter,
        (select yield_min from public.hr_crops where crop_id='turnip')
        + ((public.hr_seed($1, 1, 'farm_harvest:1:' || extract(epoch from f.planted_at)::bigint::text) % $2) + $2) % $2 as by_harvester
        from public.account_farm_plots f where f.user_id=$1 and f.plot_idx=1`, [u, span]);
    if (r && Number(r.by_planter) !== Number(r.by_harvester)) { rollOk = true; want = Number(r.by_planter); }
  }
  ok(rollOk || span === 1, 'F7: no plant instant made the planter\'s and the harvester\'s roll differ — the arm measured nothing');
  if (rollOk) {
    v = await d.harvest(u, 1, 1);
    ok(v && v.ok === true && v.base === want, `F7: hero 1's harvest of hero 0's plant rolled ${v && v.base}, the plant's roll is ${want}`);
  }

  // F8 THE TIER, THE PURSE, THE EXTRA PLOT.
  const t2 = await d.one('select gold_cost::text g, req_farm_level lv from public.hr_plot_tier where plot_level = 2');
  await d.setGold(u, 1, Number(t2.g) + 11); await d.setGold(u, 0, 4321);
  await d.q("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 1, 'farming', $2) on conflict (user_id, slot, skill_id) do update set xp = greatest(public.player_skills.xp, excluded.xp)", [u, await d.farmXp(t2.lv)]);
  v = await d.upgrade(u, 1, 2);
  ok(v && v.ok === true && v.paid_with === 'gold' && v.gold === 11, `F8: hero 1's tier-2 purchase answered ${JSON.stringify(v)}`);
  ok(await d.gold(u, 1) === 11 && await d.gold(u, 0) === 4321, `F8: the tier was paid by hero 1 ${await d.gold(u, 1)} / hero 0 ${await d.gold(u, 0)} (want 11 / 4321)`);
  ok((await d.land(u, 0)).plot_level === 2 && (await d.env(u, 0)).state.plot_level === 2, 'F8: hero 0 does not read the account\'s tier 2');
  v = await d.upgrade(u, 0, 2);
  ok(v && v.error === 'stale_level' && v.plot_level === 2, `F8: hero 0's tier-2 intent after hero 1 bought it answered ${JSON.stringify(v)}`);
  ok((await d.q("select 1 from public.player_ledger where user_id=$1 and slot=1 and intent='farm_upgrade_plot' and gold=$2 and meta->>'purse'='hero'", [u, -Number(t2.g)])).length === 1, 'F8: the upgrade is not one journal row on hero 1 naming the purse');
  // a seedless replant is paid by the ACTING hero (hero 1) only
  v = await d.plant(u, 1, 0, 'turnip');
  ok(v && v.ok === true, `F8: hero 1's plant refused: ${JSON.stringify(v)}`);
  await d.setBag(u, 1, 'turnip_seed', 0); await d.ripen(u, 0);
  const seedPrice = Number((await d.one("select price::text p from public.hr_shop_supply_offers where kind='seed' and item_id='turnip_seed' order by price limit 1")).p);
  await d.setGold(u, 1, seedPrice + 3);
  v = await d.replant(u, 1, 0);
  ok(v && v.ok === true && v.replant && v.replant.ok === true && v.replant.bought === seedPrice, `F8: hero 1's seedless replant answered ${JSON.stringify(v)}`);
  ok(await d.gold(u, 1) === 3 && await d.gold(u, 0) === 4321, `F8: the seed was paid by hero 1 ${await d.gold(u, 1)} / hero 0 ${await d.gold(u, 0)} (want 3 / 4321)`);
  // an extra plot of a REGROWING crop harvests once, is gone, buys no seed
  const cap = (await d.land(u, 0)).cap;
  await d.q("insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by) values ($1, $2, 'tomato', now() - interval '40 hours', '{}', 0, 0)", [u, cap + 2]);
  const xl = (await d.land(u, 1)).plots.find((p) => p.i === cap + 2);
  ok(xl && xl.extra === true && xl.ready === true, `F8: the extra plot reads ${JSON.stringify(xl)}`);
  await d.setGold(u, 1, 1000); await d.setBag(u, 1, 'tomato_seed', 0);
  v = await d.replant(u, 1, cap + 2);
  ok(v && v.ok === true && v.extra === true && v.replant && v.replant.error === 'extra_plot', `F8: the extra plot's replant answered ${JSON.stringify(v)}`);
  ok(!(await d.land(u, 0)).plots.some((p) => p.i === cap + 2), 'F8: the extra plot survived its harvest');
  ok(await d.gold(u, 1) === 1000, `F8: a seed was bought for the extra plot (hero 1 gold ${await d.gold(u, 1)}, want 1000)`);

  // F5 ANOTHER ACCOUNT.
  const B = await d.newAccount(1);
  const before = await d.q('select plot_idx, crop_id, planted_at from public.account_farm_plots where user_id=$1 order by plot_idx', [u]);
  ok(before.length >= 1, 'F5: the account holds no plot for the other account to reach');
  ok(same((await d.land(B.uid, 0)).plots, []) && same((await d.env(B.uid, 0)).farm, []), 'F5: another account reads this account\'s field');
  v = await d.harvest(B.uid, 0, before[0] ? before[0].plot_idx : 0);
  ok(v && v.error === 'empty_plot', `F5: another account's harvest answered ${JSON.stringify(v)}`);
  v = await d.water(B.uid, 0, before[0] ? before[0].plot_idx : 0);
  ok(v && v.error === 'empty_plot', `F5: another account's watering answered ${JSON.stringify(v)}`);
  ok(same(await d.q('select plot_idx, crop_id, planted_at from public.account_farm_plots where user_id=$1 order by plot_idx', [u]), before), 'F5: another account moved this account\'s field');
  const rls = async (uid) => { await d.as(uid); await d.q('set role authenticated'); try { return Number((await d.one('select count(*)::text n from public.account_farm_plots')).n) + Number((await d.one('select count(*)::text n from public.account_farm')).n); } finally { await d.q('reset role'); } };
  ok(await rls(B.uid) === 0, 'F5: RLS lets another account read this account\'s field');
  ok(await rls(u) === before.length + 1, `F5: RLS hides the account's own field from it (${await rls(u)} rows, want ${before.length + 1})`);

  // F6 THE LOCK DISCIPLINE.
  const src = async (sig) => strip((await d.one('select prosrc from pg_proc where oid = to_regprocedure($1)', [sig])).prosrc);
  for (const [sig, name] of [['public.hr_farm_plant(integer,integer,text,uuid)', 'plant'], ['public.hr_farm_water(integer,integer,uuid)', 'water'],
    ['public.hr_farm_harvest(integer,integer,uuid)', 'harvest'], ['public.hr_farm_upgrade_plot(integer,uuid,integer)', 'upgrade']]) {
    const s = await src(sig);
    const iHero = s.search(/from public\.player_state\s+where user_id = v_uid and slot = p_slot for update/);
    const iLock = s.indexOf('perform public.hr_farm_lock(v_uid);');
    const iField = s.search(/\b(from|update|into)\s+public\.account_farm|hr_farm_plot_level\(|hr_farm_plot_cap\(/);
    ok(iHero > 0 && iLock > iHero && iField > iLock, `F6: ${name}: hero lock ${iHero} -> farm lock ${iLock} -> field ${iField} (need increasing)`);
    ok(!/\bgold\s*=\s*gold\b/.test(s) && !/update public\.player_state set gold/.test(s), `F6: ${name} moves gold itself instead of through hr_farm_purse_pay`);
  }
  const rp = await src('public.hr_farm_harvest_replant(integer,integer,uuid)');
  ok(!/(update|insert into|delete from)\s+public\.account_farm/.test(rp) && !/\bgold\s*=\s*gold\b/.test(rp) && /hr_farm_purse_pay\(v_uid, p_slot, v_price\)/.test(rp),
    'F6: the replant writes the field itself, moves gold itself, or pays from another purse than the acting hero\'s');
  ok(/gold = gold - p_gold/.test(await src('public.hr_farm_purse_pay(uuid,integer,bigint)')), 'F6: hr_farm_purse_pay does not debit the price');
  const named = await d.q("select oid::regprocedure::text s from pg_proc where pronamespace='public'::regnamespace and regexp_replace(prosrc, '--[^\\n]*', '', 'g') ~ 'player_farm\\M'");
  ok(named.length === 0, `F6: bodies still name player_farm: ${named.map((r) => r.s).join(', ')}`);

  // F9 THE ACL.
  for (const t of ['account_farm', 'account_farm_plots']) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      ok(!(await d.one(`select has_table_privilege('${role}','public.${t}','insert,update,delete,truncate') w`)).w, `F9: ${role} can write ${t}`);
    }
    ok(!(await d.one(`select has_table_privilege('anon','public.${t}','select') s`)).s, `F9: anon reads ${t}`);
    const pol = await d.q("select cmd from pg_policies where schemaname='public' and tablename=$1", [t]);
    ok(pol.length === 1 && pol[0].cmd === 'SELECT', `F9: ${t} policies ${JSON.stringify(pol)}`);
  }
  for (const f of ['hr_farm_lock(uuid)', 'hr_farm_plot_cap(uuid)', 'hr_farm_plot_level(uuid)', 'hr_farm_purse_pay(uuid,integer,bigint)', 'hr_farm_land_view(uuid,integer)']) {
    for (const role of ['anon', 'authenticated', 'service_role']) ok(!(await d.one(`select has_function_privilege('${role}','public.${f}','execute') e`)).e, `F9: ${role} reaches ${f}`);
  }
  for (const f of ['hr_farm_plant(integer,integer,text,uuid)', 'hr_farm_water(integer,integer,uuid)', 'hr_farm_harvest(integer,integer,uuid)',
    'hr_farm_harvest_replant(integer,integer,uuid)', 'hr_farm_upgrade_plot(integer,uuid,integer)']) {
    ok((await d.one(`select has_function_privilege('authenticated','public.${f}','execute') e`)).e, `F9: authenticated lost ${f}`);
    ok(!(await d.one(`select has_function_privilege('anon','public.${f}','execute') e`)).e, `F9: anon reaches ${f}`);
  }

  // F10 THE ENGINE CANNOT WRITE THE FIELD.
  const ap = await src('public.hr_apply(uuid,integer,bigint,uuid,jsonb)');
  const keys = (ap.match(/c_delta_keys constant text\[\] := array\[([\s\S]*?)\];/) || [])[1] || '';
  ok(keys.length > 0 && !/'farm'/.test(keys) && !/p_delta \? 'farm'/.test(ap), 'F10: hr_apply still accepts a `farm` delta');

  // F4 RE-APPLY IS A NO-OP.
  const fp = await inventory(db);
  const rows = JSON.stringify(await d.q('select * from public.account_farm_plots order by user_id, plot_idx')) + JSON.stringify(await d.q('select user_id, plot_level from public.account_farm order by user_id'));
  await d.as('');
  await db.exec(await migrationText(mutate));
  ok(same(await inventory(db), fp), 'F4: a second apply changed the schema fingerprint');
  ok(JSON.stringify(await d.q('select * from public.account_farm_plots order by user_id, plot_idx')) + JSON.stringify(await d.q('select user_id, plot_level from public.account_farm order by user_id')) === rows,
    'F4: a second apply changed the farm rows');
  await db.close?.();
}

/** F3 THE FOLD on a database replayed to the file before this one, seeded through the OLD verbs. */
async function foldArm(mutate) {
  const { db } = await bootReplay({ upTo: PREV });
  const d = drivers(db);
  const old = async (uid, sql, params, label) => { await d.as(uid); await d.gate(); const r = (await d.one(`select ${sql} as v`, params)).v;
    if (!r || r.ok !== true) { const e = new Error(`fold seed ${label} refused: ${JSON.stringify(r)}`); e.harness = true; throw e; } return r; };
  // Account P: two heroes and a Garden rung (the account's field holds 3); hero 0 plants 2
  // (one watered), hero 1 plants 3 and buys plot tier 2. Account Q: one hero, one crop.
  const P = await d.newAccount(2), Q = await d.newAccount(1);
  const garden = (await d.one("select progress_kind k from public.hr_unlocks where unlock_id = 'room:garden'")).k;
  await d.q("insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at) values ($1, 1, $2, 'room:garden', 1, '', null, now())", [P.uid, garden]);
  for (const [uid, slot] of [[P.uid, 0], [P.uid, 1], [Q.uid, 0]]) await d.setBag(uid, slot, 'turnip_seed', 9);
  await old(P.uid, 'public.hr_farm_plant(0,0,$1,gen_random_uuid())', ['turnip'], 'P0 plant 0');
  await old(P.uid, 'public.hr_farm_plant(0,1,$1,gen_random_uuid())', ['turnip'], 'P0 plant 1');
  await old(P.uid, 'public.hr_farm_water(0,0,gen_random_uuid())', [], 'P0 water 0');
  for (const i of [0, 1, 2]) await old(P.uid, `public.hr_farm_plant(1,${i},$1,gen_random_uuid())`, ['turnip'], `P1 plant ${i}`);
  const t2 = await d.one('select gold_cost::text g, req_farm_level lv from public.hr_plot_tier where plot_level = 2');
  await d.setGold(P.uid, 1, Number(t2.g) + 1);
  await d.q("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 1, 'farming', $2) on conflict (user_id, slot, skill_id) do update set xp = greatest(public.player_skills.xp, excluded.xp)", [P.uid, await d.farmXp(t2.lv)]);
  await old(P.uid, 'public.hr_farm_upgrade_plot(1,gen_random_uuid(),2)', [], 'P1 tier 2');
  await old(Q.uid, 'public.hr_farm_plant(0,1,$1,gen_random_uuid())', ['turnip'], 'Q0 plant 1');
  const src = await d.q('select user_id, slot, plot_idx, crop_id, planted_at, waterings, regrow_count from public.player_farm where crop_id is not null order by user_id, slot, plot_idx');
  const tiers = await d.q('select user_id, slot, plot_level from public.player_state order by user_id, slot');
  await d.as('');
  await db.exec(await migrationText(mutate));

  const plots = async (uid) => d.q('select plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by from public.account_farm_plots where user_id=$1 order by plot_idx', [uid]);
  const pp = await plots(P.uid), qq = await plots(Q.uid);
  const fromP = src.filter((r) => r.user_id === P.uid), fromQ = src.filter((r) => r.user_id === Q.uid);
  ok(fromP.length === 5 && fromQ.length === 1, `F3: the seed planted ${fromP.length} + ${fromQ.length} crops (want 5 + 1) — the arm measured little`);
  ok(pp.length === fromP.length && pp.every((r, i) => r.plot_idx === i && r.planted_by === fromP[i].slot && r.crop_id === fromP[i].crop_id
      && +new Date(r.planted_at) === +new Date(fromP[i].planted_at) && same(r.waterings, fromP[i].waterings) && r.regrow_count === fromP[i].regrow_count),
    `F3: account P's heroes {0: plots 0,1 (0 watered); 1: plots 0,1,2} folded to ${JSON.stringify(pp.map((r) => [r.plot_idx, r.crop_id, r.planted_by, (r.waterings || []).length]))}`);
  ok(qq.length === 1 && qq[0].plot_idx === 0 && qq[0].planted_by === 0 && +new Date(qq[0].planted_at) === +new Date(fromQ[0] && fromQ[0].planted_at),
    `F3: account Q's one crop (hero 0, plot 1) folded to ${JSON.stringify(qq)}`);
  ok((pp[0] && (pp[0].waterings || []).length) === 1, 'F3: the watered crop lost its watering history');
  const lp = await d.land(P.uid, 0);
  const extras = lp ? lp.plots.filter((p) => p.extra).map((p) => p.i) : null;
  ok(lp && lp.cap === 3 && same(extras, [3, 4]), `F3: account P's field reads cap ${lp && lp.cap}, extra plots ${JSON.stringify(extras)} (want 3, [3,4])`);
  const topP = Math.max(...tiers.filter((r) => r.user_id === P.uid).map((r) => r.plot_level));
  ok(topP === 2 && lp && lp.plot_level === 2 && (await d.land(P.uid, 1)).plot_level === 2, `F3: account P's tier is ${lp && lp.plot_level}, the highest a hero bought ${topP}`);
  ok((await d.land(Q.uid, 0)).plot_level === 1 && (await d.q('select 1 from public.account_farm where user_id=$1', [Q.uid])).length === 0, 'F3: account Q (no tier bought) got a tier row');
  const j = await d.q("select user_id, slot, intent, qty::text q, meta from public.player_ledger where intent in ('farm_fold','farm_fold_tier') order by id");
  ok(j.filter((r) => r.intent === 'farm_fold').length === 6 && j.filter((r) => r.intent === 'farm_fold').every((r) => r.q === '0')
      && j.filter((r) => r.intent === 'farm_fold' && r.meta.extra === true).length === 2
      && j.filter((r) => r.intent === 'farm_fold_tier').length === 1 && j.find((r) => r.intent === 'farm_fold_tier').slot === 1,
    `F3: the fold journal is ${JSON.stringify(j.map((r) => [r.slot, r.intent, r.meta && r.meta.to_plot, r.meta && r.meta.extra]))}`);
  ok((await d.one("select to_regclass('public.player_farm') t")).t === null, 'F3: player_farm survived the fold');
  ok((await d.q("select 1 from information_schema.columns where table_schema='public' and table_name='player_state' and column_name='plot_level'")).length === 0, 'F3: player_state.plot_level survived the fold');
  notes.push(`fold: 2 accounts, ${src.length} planted per-hero plots -> ${pp.length + qq.length} account plots (${(extras || []).length} extra past the cap), tier ${lp && lp.plot_level} kept`);
  await db.close?.();
}

async function run(mutate) {
  problems.length = 0;
  await fullChainArms(mutate);
  await foldArm(mutate);
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`);
    process.exit(0);
  }
  const one = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || one) {
    const ids = one ? [one.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${String(caught).slice(0, 220)}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `shared-farm --selftest: ${slipped} mutation(s) SLIPPED` : `shared-farm --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('shared-farm: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('shared-farm: one field per account (F1-F10 green): both heroes read it, one plants and another harvests for its own crop and XP, '
    + 'the roll is the plant\'s, the fold kept every crop (' + notes.join('; ') + '), re-apply a no-op, another account sees nothing, lock order pinned, ACL closed');
  process.exit(0);
} catch (e) {
  console.error(`shared-farm: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
