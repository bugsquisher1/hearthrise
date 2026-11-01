#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/craft-economy.mjs — WHAT A SKILL PAYS, MEASURED: REAL SETTLE, REAL SALE, ON THE LOCAL WORLD.
//
//   node tools/qa/craft-economy.mjs --out FILE [--max-req 60] [--samples 2] [--hours 2] [--hunts] [--careers] [--away]
//
// On tools/qa/local-world.mjs (the replayed chain, the real hr-accrue, nothing leaves the machine). Two accounts play each
// row through the verbs a player's client sends: set_activity starts it, town time passes (world.wait), set_activity idle
// collects it (the engine's own stop), vendor_sell_many sells what it made. Every count below is what the server wrote.
//   gather   every node to --max-req, one hero at the node's level: items/h, XP/h, gold/h sold raw
//   bench    every recipe to --max-req, `--hours` of stock: jobs/h, outputs/h, XP/h, burn, the gold the outputs sold for
//   --away   one 8 h window against the same hours in 10 min windows: is a closed browser the same rate?
//   --careers  a hero from 1 by the best row it can reach, an hour at a time: hours to 15, 30, 45, 60, 75, 99, gold sold
//   --hunts  in-band grounds, 2 h each, the Level's kit: coin, loot sold, store bill, gold/h
// Levels, stock and kit are LOCAL fixtures, written straight to this in-memory database (party-soak's way); production has none of it.
// mutant-anchors: none — a manual tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { TREES, ROCKS, FISH_SPOTS } from '../../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../../src/data/recipes.js';
import { ITEMS } from '../../src/data/items.js';
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

const nodes = [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]];
const heroes = [];
for (let i = 0; i < SAMPLES; i++) heroes.push(await account('smith' + 'abcdefgh'[i]));
const report = { commit: process.env.HR_COMMIT || null, samples: SAMPLES, hours: HOURS, gather: [], bench: [], away: [], careers: [], hunts: [] };

// ── GATHER ───────────────────────────────────────────────────────────────
for (const [skill, list] of nodes) for (const n of list) {
  if (n.req > MAX_REQ) continue;
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
  if (rec.req > MAX_REQ || !rec.output || rec.gated || SKIP_BENCH.test(rec.id)) continue;
  const ins = recipeInputs(rec);
  const jobs = Math.ceil((HOURS * 3600000) / pacedActionMs(rec.ms)) + 50;   // enough stock that the stock never ends the window
  const rows = [];
  for (const a of heroes) {
    await newDay(a);
    await emptyBag(a);
    await setSkill(a, skill, rec.req);
    for (const [id, n] of Object.entries(ins)) await stock(a, id, jobs * n);
    const xp0 = await xpOf(a, skill);
    const r = await run(a, 'artisan', rec.id, HOURS);
    if (r.refused) { rows.push({ refused: r.refused }); continue; }
    const b = await bag(a);
    const firstIn = Object.keys(ins)[0];
    const used = (jobs * ins[firstIn] - (b[firstIn] || 0)) / ins[firstIn];
    const made = b[rec.output] || 0;
    const xp1 = await xpOf(a, skill);
    const sold = await sell(a, [rec.output]);
    rows.push({ jobs: used, made, xp: xp1 - xp0, gold: sold.gold, to: lvl(skill, xp1), unsold: sold.refused.length > 0 });
  }
  const ok = rows.filter((x) => !x.refused);
  if (!ok.length) { report.bench.push({ skill, id: rec.id, req: rec.req, refused: rows[0].refused }); log(`bench ${rec.id}: REFUSED ${JSON.stringify(rows[0].refused).slice(0, 160)}`); continue; }
  const mean = (k) => ok.reduce((s, x) => s + x[k], 0) / ok.length / HOURS;
  const inBid = Object.entries(ins).reduce((s, [id, n]) => s + n * vendorPriceOf(ITEMS, id), 0);
  const jobsPerH = mean('jobs');
  const outUnit = ok[0].made ? Math.round((ok[0].gold / ok[0].made) * 100) / 100 : 0;
  const row = { skill, id: rec.id, req: rec.req, inputs: ins, output: rec.output, jobsPerH: Math.round(jobsPerH), outPerH: Math.round(mean('made')), secEach: Math.round(36000 / jobsPerH) / 10,
    xpPerH: Math.round(mean('xp')), soldPerH: Math.round(mean('gold')), inBidPerJob: inBid, netFromStockPerH: Math.round(mean('gold') - inBid * jobsPerH), outUnit, unsold: ok.some((x) => x.unsold), samples: ok.map((x) => x.made) };
  report.bench.push(row);
  log(`bench ${skill} ${rec.id} L${rec.req}: ${row.jobsPerH} jobs/h (${row.secEach} s), ${row.outPerH} out/h @${outUnit}, sold ${row.soldPerH} g/h, net from stock ${row.netFromStockPerH} g/h, ${row.xpPerH} XP/h${row.unsold ? ', NO SHOP PRICE' : ''}`);
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

if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
await world.close();
log('craft-economy: done');
process.exit(0);
