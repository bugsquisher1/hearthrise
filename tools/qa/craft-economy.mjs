#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/craft-economy.mjs — WHAT A SKILL PAYS, MEASURED: REAL SETTLE, REAL SALE, ON THE LOCAL WORLD.
//
//   node tools/qa/craft-economy.mjs --out FILE [--max-req 60] [--samples 2] [--hours 2] [--only REGEX | --no-rows] [--hunts] [--careers] [--away] [--chains] [--walk] [--rooms] [--market]
//
// On tools/qa/local-world.mjs (the replayed chain, the real hr-accrue, nothing leaves the machine). Two accounts play each
// row through the verbs a player's client sends: set_activity starts it, town time passes (world.wait), set_activity idle
// collects it (the engine's own stop), vendor_sell_many sells what it made. Every count below is what the server wrote.
//   gather   every node to --max-req, one hero at the node's level: items/h, XP/h, gold/h sold raw
//   bench    every recipe to --max-req, `--hours` of stock: jobs/h, outputs/h, XP/h, burn, the gold the outputs sold for
//   --away   one 8 h window against the same hours in 10 min windows: is a closed browser the same rate?
//   --careers  a hero from 1 by the best row it can reach, an hour at a time: hours to 15, 30, 45, 60, 75, 99, gold sold
//   --hunts  in-band grounds, 2 h each, the Level's kit: coin, loot sold, store bill, gold/h
//   --chains   one hero, both halves, whole cycles played: gold over every hour it took
//   --walk     a fresh hero's first forged weapon, no fixture: what it holds at each step
//   --rooms    the deeds and the first bench rooms: refused one gold short, sold at the price
//   --market   the Weighhouse's floor played: one under it refused, one at it listed, bought by the other account, the seller paid
// Levels, stock and kit are LOCAL fixtures, written straight to this in-memory database (party-soak's way); production has none of it.
// mutant-anchors: none — a manual tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TREES, ROCKS, FISH_SPOTS } from '../../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../../src/data/recipes.js';
import { ITEMS } from '../../src/data/items.js';
import { SHOP_OFFERS } from '../../src/data/shops.js';
import { recipeInputs } from '../../src/core/artisan.js';
import { pacedActionMs } from '../../src/core/pacing.js';
import { charXpForLevel, skillXpForLevel, skillLevelFromXp } from '../../src/core/xp.js';
import { vendorPriceOf } from '../../supabase/functions/hr-accrue/catalogue.js';
import { openWorld } from './local-world.mjs';

const PASSWORD = 'local-world-password';   // local-world's own throwaway: these accounts die with the process
const idem = () => randomUUID();
const has = (n) => process.argv.includes(n);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const MAX_REQ = Number(arg('--max-req', 60));
const SAMPLES = Number(arg('--samples', 2));
const HOURS = Number(arg('--hours', 2));
const OUT = arg('--out', null);
const log = (s) => console.log(s);

const world = await openWorld({ tickMs: false });
const q = async (sql, p) => (await world.db.query(sql, p)).rows;
const post = async (path, body, token, again = true) => {
  try {
    const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    if (!again) throw e;   // a kept-alive socket the local server just timed out; every verb carries its key, so a repeat is a replay
    return post(path, body, token, false);
  }
};

async function account(name) {
  const email = name + '@local-world.test';
  await post('/auth/v1/signup', { email, password: PASSWORD });
  const login = async () => (await post('/auth/v1/token?grant_type=password', { email, password: PASSWORD })).body;
  const first = await login();
  const a = { name, email, uid: first.user.id, token: first.access_token, login };
  const made = await rpcOf(a)('hr_create_hero', { p_slot: 0, p_name: 'Sm' + name.replace(/[^a-z]/g, '').slice(0, 8), p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: idem() });
  if (!made || made.ok !== true) throw new Error('hero: ' + JSON.stringify(made));
  return a;
}
const rpcOf = (a) => async (fn, args) => (await post('/rest/v1/rpc/' + fn, args, a.token)).body;
const fresh = (a) => q('delete from public.hr_rate_counters where user_id = $1', [a.uid]);
/* A new day for the character: rows measured back to back would otherwise fill one hero's daily budgets (25M gold, 1M units a
   day, hr_day_budget_check) and every later sale would be refused. The ledger leaves this in-memory database, and only this one. */
async function newDay(a) {
  await q('alter table public.player_ledger disable trigger user');
  await q('delete from public.player_ledger where user_id = $1', [a.uid]);
  await q('alter table public.player_ledger enable trigger user');
}
async function edge(a, verb, fields) {
  await fresh(a);
  const r = await post('/functions/v1/hr-accrue', { slot: 0, verb, intentId: idem(), ...fields }, a.token);
  return r;
}
const purse = async (a) => Number((await q('select gold from public.account_wallet where user_id = $1', [a.uid]))[0].gold);
const bag = async (a) => Object.fromEntries((await q('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [a.uid])).map((r) => [r.item_id, Number(r.qty)]));
const xpOf = async (a, skill) => Number((await q('select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = $2', [a.uid, skill]))[0]?.xp || 0);
const setSkill = (a, skill, level) => q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, $3) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [a.uid, skill, skillXpForLevel(skill, level)]);
const emptyBag = (a) => q('delete from public.player_inventory where user_id = $1 and slot = 0', [a.uid]);
const stock = (a, id, n) => q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3) on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [a.uid, id, n]);
const lvl = (skill, xp) => skillLevelFromXp(skill, xp);

/* Sell every stack in `ids` (or the whole bag): the real verb, the real price; what the purse moved is the answer. */
async function sell(a, ids) {
  const now = await bag(a);
  const before = await purse(a);
  const refused = [];
  for (const [item, stack] of Object.entries(now)) {
    if (!(stack > 0) || (ids && !ids.includes(item))) continue;
    /* A line is at most 1,000 units (the Shop's press); an unpriced stack is refused by name and stays in the bag. */
    for (let left = stack; left > 0; left -= 1000) {
      const one = await edge(a, 'vendor_sell_many', { lines: [{ item, qty: Math.min(left, 1000) }] });
      if (one.status !== 200 || (one.body && one.body.ok === false)) { refused.push(item); break; }
    }
  }
  return { gold: (await purse(a)) - before, refused };
}

/* One row for `hours`: start, let town time pass in `steps` windows, stop (the stop collects). */
async function run(a, kind, id, hours, steps = 1, count) {
  const started = await edge(a, 'set_activity', { activity: { kind, id, ...(count ? { count } : {}) } });
  if (started.status !== 200 || (started.body && started.body.ok === false)) return { refused: started.body };
  for (let s = 0; s < steps; s++) {
    await world.wait((hours * 60) / steps);
    /* an open browser polls; a closed one does not. A step's `accrue` is the poll. */
    if (steps > 1) await edge(a, 'accrue', {});
  }
  const stop = await edge(a, 'set_activity', { activity: { kind: 'idle' } });
  if (stop.status !== 200 || (stop.body && stop.body.ok === false)) return { refused: stop.body };
  return { ok: true };
}

/* --only REGEX: the gather and bench rows whose id matches (the rest are not played); --no-rows: none of them. */
const ONLY = arg('--only', null) ? new RegExp(arg('--only', null)) : null;
const rowOn = (id) => !has('--no-rows') && (!ONLY || ONLY.test(id));
/* THE BENCH TAX (v0.2.81) leaves the purse while a job runs, not at the sale, so a wage is the whole purse's move. A rich purse so
   the fee never stops the job: the row's rate is the question here, not the fresh hero's purse. */
const rich = (a) => q(`insert into public.account_wallet (user_id, gold) values ($1, 1000000) on conflict (user_id) do update set gold = 1000000`, [a.uid]);
const nodes = [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]];
const heroes = [];
for (let i = 0; i < SAMPLES; i++) heroes.push(await account('smith' + 'abcdefgh'[i]));
const report = { commit: process.env.HR_COMMIT || null, samples: SAMPLES, hours: HOURS, gather: [], bench: [], away: [], careers: [], hunts: [] };

// ── GATHER ───────────────────────────────────────────────────────────────
for (const [skill, list] of nodes) for (const n of list) {
  if (n.req > MAX_REQ || !rowOn(n.id)) continue;
  const rows = [];
  for (const a of heroes) {
    await newDay(a);
    await emptyBag(a);
    await setSkill(a, skill, n.req);
    const xp0 = await xpOf(a, skill);
    const r = await run(a, 'gather', n.id, HOURS);
    if (r.refused) { rows.push({ refused: r.refused }); continue; }
    const b = await bag(a);
    const made = b[n.prod] || 0;
    const xp1 = await xpOf(a, skill);
    const sold = await sell(a, [n.prod]);
    rows.push({ made, xp: xp1 - xp0, gold: sold.gold, from: n.req, to: lvl(skill, xp1), refused: sold.refused });
  }
  const ok = rows.filter((x) => !x.refused || Array.isArray(x.refused));
  const mean = (k) => ok.reduce((s, x) => s + x[k], 0) / Math.max(1, ok.length) / HOURS;
  const row = { skill, id: n.id, req: n.req, item: n.prod, itemsPerH: Math.round(mean('made')), xpPerH: Math.round(mean('xp')), goldPerH: Math.round(mean('gold')),
    bid: vendorPriceOf(ITEMS, n.prod), samples: ok.map((x) => x.made), toLevel: ok.map((x) => x.to), raw: rows.find((x) => x.refused && !Array.isArray(x.refused))?.refused || null };
  report.gather.push(row);
  log(`gather ${skill} ${n.id} L${n.req}: ${row.itemsPerH}/h, ${row.goldPerH} g/h raw, ${row.xpPerH} XP/h, samples ${row.samples.join('/')}`);
}

// ── BENCH ────────────────────────────────────────────────────────────────
const SKIP_BENCH = /^(bind_(chalked|scored|etched|carved|graven)_(water|fire|ice|poison|rupture)|fuel_)/;
for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const rec of list) {
  if (rec.req > MAX_REQ || !rec.output || rec.gated || SKIP_BENCH.test(rec.id) || !rowOn(rec.id)) continue;
  const ins = recipeInputs(rec);
  const jobs = Math.ceil((HOURS * 3600000) / pacedActionMs(rec.ms)) + 50;   // enough stock that the stock never ends the window
  const rows = [];
  for (const a of heroes) {
    await newDay(a);
    await emptyBag(a);
    await setSkill(a, skill, rec.req);
    for (const [id, n] of Object.entries(ins)) await stock(a, id, jobs * n);
    const xp0 = await xpOf(a, skill);
    await rich(a);
    const purse0 = await purse(a);
    const r = await run(a, 'artisan', rec.id, HOURS);
    if (r.refused) { rows.push({ refused: r.refused }); continue; }
    const tax = purse0 - await purse(a);
    const b = await bag(a);
    const firstIn = Object.keys(ins)[0];
    const used = (jobs * ins[firstIn] - (b[firstIn] || 0)) / ins[firstIn];
    const made = b[rec.output] || 0;
    const xp1 = await xpOf(a, skill);
    const sold = await sell(a, [rec.output]);
    rows.push({ jobs: used, made, xp: xp1 - xp0, gold: sold.gold, tax, to: lvl(skill, xp1), unsold: sold.refused.length > 0 });
  }
  const ok = rows.filter((x) => !x.refused);
  if (!ok.length) { report.bench.push({ skill, id: rec.id, req: rec.req, refused: rows[0].refused }); log(`bench ${rec.id}: REFUSED ${JSON.stringify(rows[0].refused).slice(0, 160)}`); continue; }
  const mean = (k) => ok.reduce((s, x) => s + x[k], 0) / ok.length / HOURS;
  const inBid = Object.entries(ins).reduce((s, [id, n]) => s + n * vendorPriceOf(ITEMS, id), 0);
  const jobsPerH = mean('jobs');
  const outUnit = ok[0].made ? Math.round((ok[0].gold / ok[0].made) * 100) / 100 : 0;
  const row = { skill, id: rec.id, req: rec.req, inputs: ins, output: rec.output, jobsPerH: Math.round(jobsPerH), outPerH: Math.round(mean('made')), secEach: Math.round(36000 / jobsPerH) / 10,
    xpPerH: Math.round(mean('xp')), soldPerH: Math.round(mean('gold')), taxPerH: Math.round(mean('tax')), inBidPerJob: inBid, netFromStockPerH: Math.round(mean('gold') - mean('tax') - inBid * jobsPerH), outUnit, unsold: ok.some((x) => x.unsold), samples: ok.map((x) => x.made) };
  report.bench.push(row);
  log(`bench ${skill} ${rec.id} L${rec.req}: ${row.jobsPerH} jobs/h (${row.secEach} s), ${row.outPerH} out/h @${outUnit}, sold ${row.soldPerH} g/h, tax ${row.taxPerH} g/h, net from stock after tax ${row.netFromStockPerH} g/h, ${row.xpPerH} XP/h${row.unsold ? ', NO SHOP PRICE' : ''}`);
}

// ── AWAY ─────────────────────────────────────────────────────────────────
if (has('--away')) for (const [skill, id, prod, level] of [['mining', 'iron_rock', 'iron_ore', 26], ['woodcutting', 'oak_tree', 'oak_log', 15]]) {
  const a = heroes[0];
  for (const [label, hours, steps] of [['away, one 8 h window', 8, 1], ['active, 8 h in 10 min windows', 8, 48], ['away, 24 h', 24, 1]]) {
    await newDay(a);
    await emptyBag(a);
    await setSkill(a, skill, level);
    const x0 = await xpOf(a, skill);
    await run(a, 'gather', id, hours, steps);
    const b = await bag(a);
    const x1 = await xpOf(a, skill);
    report.away.push({ id, label, hours, made: b[prod] || 0, perH: Math.round((b[prod] || 0) / hours), from: level, to: lvl(skill, x1), xpPerH: Math.round((x1 - x0) / hours) });
    log(`away ${id} ${label}: ${b[prod] || 0} (${Math.round((b[prod] || 0) / hours)}/h), ${skill} ${level} -> ${lvl(skill, x1)}`);
  }
}

// ── CAREERS ──────────────────────────────────────────────────────────────
if (has('--careers')) for (const [skill, list] of nodes) {
  const a = heroes[0];
  await emptyBag(a);
  await setSkill(a, skill, 1);
  let hours = 0, gold = 0, xp = await xpOf(a, skill);
  const at = {};
  while (hours < 130) {
    const L = lvl(skill, xp);
    for (const m of [15, 30, 45, 60, 75, 90, 99]) if (L >= m && at[m] === undefined) at[m] = { hours, gold };
    if (L >= 99) break;
    const usable = list.filter((n) => n.req <= L);
    const node = usable[usable.length - 1];
    await newDay(a);
    await run(a, 'gather', node.id, 1);
    const s = await sell(a, [node.prod]);
    gold += s.gold;
    hours += 1;
    xp = await xpOf(a, skill);
    a.token = (await a.login()).access_token;
    await emptyBag(a);
  }
  report.careers.push({ skill, at, hours, gold });
  log(`career ${skill}: ${Object.entries(at).map(([m, v]) => 'L' + m + ' ' + v.hours + ' h (' + v.gold + ' g)').join(', ')}`);
}

// ── HUNTS ────────────────────────────────────────────────────────────────
/* The set a measured hero at Level L wears (party-soak's, tests/hunt-core/fixtures/play-ground.mjs's ladder). */
function kitOf(L, role) {
  const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
  const m = ['bronze', 'iron', 'steel', 'mithril'][t];
  const cloth = (x) => ({ helmet: x[t] + '_helmet', body: x[t] + '_body', pants: x[t] + '_pants', boots: x[t] + '_boots' });
  return {
    tank: { weapon: ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword'][t], shield: ['bronze_rimmed_shield', 'ironbound_shield', 'coppercap_shield', 'coppercap_shield'][t],
      helmet: m + '_helm', body: m + '_platebody', pants: m + '_platelegs', boots: m + '_boots' },
    mage: { weapon: ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand'][t], shield: ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook'][t], ...cloth(['apprentice', 'adept', 'scholar', 'warlock']) },
  }[role];
}
if (has('--hunts')) for (const [ground, L, role] of [['mill_cellar', 4, 'tank'], ['meadowbrook_thicket', 10, 'tank'], ['wickstead', 13, 'tank'], ['mosslight_glade', 24, 'tank'], ['mosslight_glade', 24, 'mage']]) {
  const rows = [];
  for (const a of heroes) {
    a.token = (await a.login()).access_token;
    await newDay(a);
    await emptyBag(a);
    await q('update public.player_state set level_xp = $2, hp = 1000000, stamina_ms = 43200000, stamina_at = now() where user_id = $1 and slot = 0', [a.uid, charXpForLevel(L)]);
    for (const k of ['melee', 'ranged', 'magic', 'defense']) await setSkill(a, k, L);
    await q('delete from public.player_equipment where user_id = $1 and slot = 0', [a.uid]);
    for (const [eq, id] of Object.entries(kitOf(L, role))) await q('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3)', [a.uid, eq, id]);
    await fresh(a);
    const rpc = rpcOf(a);
    await q(`insert into public.account_wallet (user_id, gold) values ($1, 1000000) on conflict (user_id) do update set gold = 1000000`, [a.uid]);
    const entered = await rpc('hr_hunt_enter', { p_slot: 0, p_hunt: ground, p_bag: [], p_preset: 0, p_hours: null, p_idem: idem() });
    if (!entered || entered.ok !== true) { rows.push({ refused: entered }); continue; }
    const coin0 = await purse(a);
    for (let m = 0; m < HOURS * 6; m++) {
      await q(`insert into public.social_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id) do update set seen_at = now()`, [a.uid]);
      await fresh(a);
      await world.skip(10);
    }
    await fresh(a);
    await rpc('hr_hunt_leave', { p_slot: 0, p_idem: idem() });
    await world.skip(1);
    const coin = (await purse(a)) - coin0;
    const stillOn = await q('select end_reason from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1', [a.uid]);
    const lootSold = await sell(a);
    rows.push({ coin, loot: lootSold.gold, net: coin + lootSold.gold, end: stillOn[0]?.end_reason });
  }
  const ok = rows.filter((x) => !x.refused);
  const row = { ground, level: L, role, coinPerH: Math.round(ok.reduce((s, x) => s + x.coin, 0) / ok.length / HOURS), lootPerH: Math.round(ok.reduce((s, x) => s + x.loot, 0) / ok.length / HOURS),
    netPerH: Math.round(ok.reduce((s, x) => s + x.net, 0) / ok.length / HOURS), samples: ok.map((x) => Math.round(x.net / HOURS)), ends: ok.map((x) => x.end), refused: rows.find((x) => x.refused)?.refused || null };
  report.hunts.push(row);
  log(`hunt ${ground} L${L} ${role}: coin after bill ${row.coinPerH} + loot sold ${row.lootPerH} = ${row.netPerH} g/h (samples ${row.samples.join('/')}, ends ${row.ends.join('/')})${row.refused ? ' REFUSED ' + JSON.stringify(row.refused).slice(0, 200) : ''}`);
}

// ── ONE HERO, BOTH HALVES ────────────────────────────────────────────────
/* A row's rate is one thing; the whole cycle a player plays is the proof: gather, bench it all, sell it, gold over every hour it took. */
const BENCH_MS = (id) => pacedActionMs(Object.values(ARTISAN_RECIPES).flat().find((r) => r.id === id).ms);
async function benchAll(a, id, jobs) {
  /* a job's time, one extra window so the stock (not the clock) ends the run; only the jobs' time is counted */
  await run(a, 'artisan', id, ((jobs + 2) * BENCH_MS(id)) / 3600000);
  return (jobs * BENCH_MS(id)) / 3600000;
}
if (has('--chains')) {
  report.chains = [];
  const cycles = [
    { name: 'Copper Bar', skills: { mining: 1, smithing: 1 }, node: 'copper_rock', ore: 'copper_ore', bench: 'smelt_copper', out: 'copper_bar' },
    { name: 'Iron Bar', skills: { mining: 15, smithing: 15 }, node: 'iron_rock', ore: 'iron_ore', bench: 'smelt_iron', out: 'iron_bar' },
    { name: 'Oak Plank', skills: { woodcutting: 15, crafting: 15 }, node: 'oak_tree', ore: 'oak_log', bench: 'saw_oak', out: 'oak_plank' },
    { name: 'Willow Plank', skills: { woodcutting: 30, crafting: 30 }, node: 'willow_tree', ore: 'willow_log', bench: 'saw_willow', out: 'willow_plank' },
    { name: 'Cooked Herring', skills: { fishing: 10, cooking: 8 }, node: 'herring_s', ore: 'herring', bench: 'cook_herring', out: 'cooked_herring' },
    { name: 'Cooked Trout', skills: { fishing: 20, cooking: 15 }, node: 'trout_s', ore: 'trout', bench: 'cook_trout', out: 'cooked_trout' },
  ];
  for (const c of cycles) {
    const rows = [];
    for (const a of heroes) {
      await newDay(a); await emptyBag(a);
      for (const [s, l] of Object.entries(c.skills)) await setSkill(a, s, l);
      await rich(a);
      const purse0 = await purse(a);
      await run(a, 'gather', c.node, 1);
      const got = (await bag(a))[c.ore] || 0;
      const t = await benchAll(a, c.bench, got);
      const sold = await sell(a, [c.out]);
      const net = (await purse(a)) - purse0;
      rows.push({ ore: got, made: (await bag(a))[c.ore] || 0, gold: sold.gold, tax: sold.gold - net, net, hours: 1 + t, perH: Math.round(sold.gold / (1 + t)), afterTaxPerH: Math.round(net / (1 + t)) });
    }
    report.chains.push({ name: c.name, samples: rows });
    log(`chain ${c.name}: ${rows.map((r) => r.gold + ' g, tax ' + r.tax + ' in ' + r.hours.toFixed(2) + ' h = ' + r.perH + ' g/h, after tax ' + r.afterTaxPerH).join(' / ')}`);
  }
  /* The whole forge: rock, bars, tree, planks, hatchets, shop. Iron Hatchets at Smithing 15. */
  const rows = [];
  for (const a of heroes) {
    await newDay(a); await emptyBag(a);
    for (const s of ['mining', 'smithing', 'woodcutting', 'crafting']) await setSkill(a, s, 15);
    const forge = Object.values(ARTISAN_RECIPES).flat().find((r) => r.id === 'forge_iron_hatchets');
    const ins = recipeInputs(forge);
    await rich(a);
    const purse0 = await purse(a);
    await run(a, 'gather', 'iron_rock', 1);
    const ore = (await bag(a)).iron_ore || 0;
    let hours = 1 + await benchAll(a, 'smelt_iron', ore);
    const jobs = Math.floor(ore / ins.iron_bar);
    const planks = jobs * ins.normal_plank;
    await run(a, 'gather', 'normal_tree', (planks * pacedActionMs(TREES[0].ms)) / 3600000 + 0.01);
    hours += (planks * pacedActionMs(TREES[0].ms)) / 3600000;
    hours += await benchAll(a, 'saw_normal', planks);
    hours += await benchAll(a, 'forge_iron_hatchets', jobs);
    const made = (await bag(a)).iron_hatchets || 0;
    const sold = await sell(a, ['iron_hatchets']);
    const net = (await purse(a)) - purse0;
    rows.push({ ore, jobs, made, gold: sold.gold, tax: sold.gold - net, net, hours, perH: Math.round(sold.gold / hours), afterTaxPerH: Math.round(net / hours) });
  }
  report.chains.push({ name: 'Iron Hatchets', samples: rows });
  log(`chain Iron Hatchets: ${rows.map((r) => r.made + ' made, ' + r.gold + ' g, tax ' + r.tax + ' in ' + r.hours.toFixed(2) + ' h = ' + r.perH + ' g/h, after tax ' + r.afterTaxPerH).join(' / ')}`);
  /* The same Iron Bar with the Forge's first rung owned: the tax comes off and the room's speed goes on, the whole of what the 75,000 g buys. */
  const owned = heroes[0];
  const offer = SHOP_OFFERS.find((o) => o.id === 'room.forge.1');
  for (const o of [SHOP_OFFERS.find((x) => x.id === 'property.homestead'), SHOP_OFFERS.find((x) => x.id === 'property.farmstead'), offer]) {
    await rich(owned);
    for (const c of o.cost) if (c.kind === 'item') await stock(owned, c.id, c.amount);
    const b = await edge(owned, 'unlock_buy', { offer: o.id });
    log(`bought ${o.id}: ${b.status} ${JSON.stringify(b.body && b.body.ok === false ? b.body : 'ok')}`);
  }
  await newDay(owned); await emptyBag(owned);
  await setSkill(owned, 'mining', 15); await setSkill(owned, 'smithing', 15);
  await rich(owned);
  const p0 = await purse(owned);
  await run(owned, 'gather', 'iron_rock', 1);
  const ore = (await bag(owned)).iron_ore || 0;
  const t = await benchAll(owned, 'smelt_iron', ore);
  const sold = await sell(owned, ['iron_bar']);
  const net = (await purse(owned)) - p0;
  report.chains.push({ name: 'Iron Bar, Forge owned', samples: [{ ore, gold: sold.gold, tax: sold.gold - net, net, hours: 1 + t, afterTaxPerH: Math.round(net / (1 + t)) }] });
  log(`chain Iron Bar, Forge owned: ${sold.gold} g, tax ${sold.gold - net} in ${(1 + t).toFixed(2)} h, after tax ${Math.round(net / (1 + t))} g/h`);
}

// ── A FRESH HERO'S FIRST FORGED WEAPON ───────────────────────────────────
/* No fixture past the sign-up: what the hero holds at each step is what the steps before it made. Every press is one a player has. */
if (has('--walk')) {
  const a = await account('walkera');
  const walk = [];
  let hours = 0;
  const note = async (step) => {
    const b = await bag(a);
    const skills = {};
    for (const s of ['mining', 'smithing', 'woodcutting', 'crafting']) skills[s] = lvl(s, await xpOf(a, s));
    walk.push({ step, hours: Math.round(hours * 100) / 100, gold: await purse(a), ore: b.copper_ore || 0, ironOre: b.iron_ore || 0, copperBars: b.copper_bar || 0, ironBars: b.iron_bar || 0, logs: b.normal_log || 0, planks: b.normal_plank || 0, hatchets: b.iron_hatchets || 0, skills });
    log(`walk ${JSON.stringify(walk[walk.length - 1])}`);
  };
  const go = async (kind, id, h) => { const r = await run(a, kind, id, h); hours += h; return r; };
  await note('signed up');
  /* Mining to 15 on copper; every bar it makes takes Smithing up with it. */
  while (lvl('mining', await xpOf(a, 'mining')) < 15) await go('gather', 'copper_rock', 0.25);
  await note('Mining 15 on Copper Rock');
  while (lvl('smithing', await xpOf(a, 'smithing')) < 15) {
    const have = (await bag(a)).copper_ore || 0;
    if (have < 10) await go('gather', 'copper_rock', 0.25);
    await go('artisan', 'smelt_copper', 0.25);
  }
  await note('Smithing 15 on Copper Bars');
  await go('gather', 'iron_rock', 0.05);
  await note('Iron Rock: ore for six bars');
  await go('artisan', 'smelt_iron', 0.05);
  await note('smelted');
  await go('gather', 'normal_tree', 0.05);
  await note('Normal Tree: logs for two planks');
  await go('artisan', 'saw_normal', 0.05);
  await note('sawed');
  const forged = await edge(a, 'set_activity', { activity: { kind: 'artisan', id: 'forge_iron_hatchets', count: 1 } });
  await world.wait(1);
  await edge(a, 'set_activity', { activity: { kind: 'idle' } });
  hours += 1 / 60;
  await note('Forge Iron Hatchets, Make 1: ' + (forged.body && forged.body.ok === false ? JSON.stringify(forged.body) : 'accepted'));
  report.walk = walk;
}

// ── THE HOUSE BENCH ──────────────────────────────────────────────────────
/* The real verb at the real price: the deeds in order, the room refused short of its gold, sold at it. Gold and materials are local fixtures. */
if (has('--rooms')) {
  const a = await account('roomera');
  report.rooms = [];
  const fund = async (gold, items) => {
    await q(`insert into public.account_wallet (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = $2`, [a.uid, gold]);
    for (const [id, n] of Object.entries(items)) await stock(a, id, n);
  };
  const costOf = (id) => {
    const o = SHOP_OFFERS.find((x) => x.id === id);
    return { gold: o.cost.find((c) => c.id === 'gold').amount, items: Object.fromEntries(o.cost.filter((c) => c.kind === 'item').map((c) => [c.id, c.amount])) };
  };
  for (const id of ['property.homestead', 'property.farmstead', 'room.kitchen.1', 'room.forge.1', 'room.workshop.1', 'room.garden.1']) {
    const c = costOf(id);
    await newDay(a);
    await fund(c.gold - 1, c.items);
    const short = await edge(a, 'unlock_buy', { offer: id });
    await fund(c.gold, c.items);
    const paid = await edge(a, 'unlock_buy', { offer: id });
    const row = { id, gold: c.gold, items: c.items, shortRefused: (short.body && short.body.error) || short.status, bought: paid.status === 200 && paid.body && paid.body.ok !== false, left: await purse(a), detail: paid.body && paid.body.ok === false ? paid.body : undefined };
    report.rooms.push(row);
    log(`room ${JSON.stringify(row)}`);
  }
}

// ── THE WEIGHHOUSE ───────────────────────────────────────────────────────
/* The real verbs against the real floor: one under it is refused, one at it lists, the other account buys it, the seller is paid.
   market-on.sql applies to this memory only; the Level gate is a config row, set low so the fixture hero can trade. */
if (has('--market')) {
  const on = readFileSync(new URL('../../supabase/migrations/2027-02-14-market-on.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  await world.db.exec('begin;\n' + on + '\ncommit;');
  await q('update public.hr_market_config set min_level = 1 where only_row');
  const [seller, buyer] = heroes;
  report.market = [];
  for (const id of ['copper_ore', 'iron_ore', 'iron_bar', 'oak_plank', 'steel_bar', 'cooked_herring', 'cooked_trout', 'iron_hatchets', 'bronze_axe', 'scored_earth_rune', 'bronze_arrows', 'chalked_earth_rune']) {
    const rule = (await q('select listable, why, floor_each::int as floor, ceiling_each::text as ceiling, book::int as book from public.hr_market_items where item_id = $1', [id]))[0];
    const row = { id, bid: vendorPriceOf(ITEMS, id), listable: rule.listable, why: rule.why, floor: rule.floor, ceiling: rule.ceiling, book: rule.book };
    if (rule.listable) {
      await newDay(seller); await newDay(buyer);
      await stock(seller, id, 10);
      const list = (ask) => edge(seller, 'market_list', { market: { source: 'bag', item: id, qty: 1, ask_each: ask } });
      const under = rule.floor > 1 ? await list(rule.floor - 1) : null;
      row.underRefused = under ? (under.body && under.body.error) || under.status : 'floor is 1';
      const listed = await list(rule.floor);
      row.listed = listed.status === 200 && listed.body && listed.body.ok !== false;
      const lid = row.listed ? (await q('select id from public.market_listings where user_id = $1 and item_id = $2 and qty > 0 order by expires_at desc limit 1', [seller.uid, id]))[0]?.id : null;
      if (lid) {
        await q(`insert into public.account_wallet (user_id, gold) values ($1, 100000) on conflict (user_id) do update set gold = 100000`, [buyer.uid]);
        const before = await purse(seller);
        const bought = await edge(buyer, 'market_buy', { market: { listing: lid, qty: 1, max_each: rule.floor, deliver: 'storage' } });
        row.bought = bought.status === 200 && bought.body && bought.body.ok !== false ? true : (bought.body && bought.body.error);
        row.sellerPaid = (await purse(seller)) - before;
      }
    }
    report.market.push(row);
    log(`market ${id}: ${JSON.stringify(row)}`);
  }
}

if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
await world.close();
log('craft-economy: done');
process.exit(0);
