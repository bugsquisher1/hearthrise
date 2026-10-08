#!/usr/bin/env node
// ============================================================================
// tools/econ-sim.mjs — THE GOLD ECONOMY SIMULATION. Read-only; touches nothing.
//
//   node tools/econ-sim.mjs                       # baseline, 1/7/30/90 days
//   node tools/econ-sim.mjs --gear-rate=0.25      # what-if: crafted gear vendors at 25%
//   node tools/econ-sim.mjs --crafted-rate=0.2    # what-if: every bench output vendors at 20% (the raw rate)
//   node tools/econ-sim.mjs --day-budget=5000000  # what-if: a tighter daily gold budget
//   node tools/econ-sim.mjs --explain=grinder     # the top chains at an archetype's starting levels
//   node tools/econ-sim.mjs --upkeep-bp=50        # what-if: 0.5%/day of owned gold-ladder value
//   node tools/econ-sim.mjs --worker-mult=0.5     # what-if: crew pays half
//   node tools/econ-sim.mjs --json                # machine-readable
//   node tools/econ-sim.mjs --selftest            # plant a faucet, prove the sim sees it
//
// WHY IT EXISTS. A content audit claimed late-game gold outruns every sink
// (crafted gear vendors at 100% of book value; workers feed the inputs). That is
// a claim about RATES, and the rates live in the engines the server runs — so
// this tool owns NO rate. Every kill, drop, gather, craft and crew tick is priced
// by calling the code the hr-accrue Edge function vendors:
//   · computeAccrual  (supabase/functions/hr-accrue/accrual.js) — combat, gather
//     and artisan spans, through src/core/combat-sim / skill-sim / artisan-sim
//   · accrueWorkers   (same file) — the crew, through src/core/workers.js
//   · vendorPriceOf / GATHER_NODES / ARTISAN_RECIPES_PAYABLE (edge catalogue.js)
//   · bountyRewards / bountyCountRange / unlockedTier (src/core/bounty.js)
//   · priceDailyLogin (src/data/rewards.js)
// and every SERVER CAP is parsed out of the migration chain (latest top-level
// definition wins), never typed here: the daily gold budget, the offline cap,
// the market house tax, the daily task set and its payouts, the goal board, the
// onboarding quests. A parse that finds nothing throws, so a renamed constant
// turns this tool red instead of silently simulating a default.
//
// WHAT IS A MODEL (and therefore stated, not hidden): the PLAYER. Which activity
// an archetype picks, how many hours it plays, that it wears the best gear its
// levels allow and owns the tool tier its level reaches, that it buys sinks
// cheapest-first the moment it can. Those are the assumptions; the numbers they
// produce are the engines'. See KNOWN LIMITS at the foot of the file.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeAccrual, accrueWorkers } from '../supabase/functions/hr-accrue/accrual.js';
import {
  vendorPriceOf, GATHER_NODES, ARTISAN_RECIPES_PAYABLE,
} from '../supabase/functions/hr-accrue/catalogue.js';
import { UNLOCK_OFFERS } from '../supabase/functions/hr-accrue/unlock-catalogue.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { MATERIAL_TIERS } from '../src/data/gear-tiers.js';
import { EQUIP_SLOTS, expandItemSlot } from '../src/data/gathering.js';
import { GOLD_LADDER_OFFERS } from '../src/data/gold-ladders.js';
import { COMPANION_OFFERS } from '../src/data/companion-unlocks.js';
import {
  priceDailyLogin, DAILY_LOGIN_CYCLE, DAILY_LOGIN_MAX_WEEK_MULT,
} from '../src/data/rewards.js';
import { bountyRewards, bountyCountRange, unlockedTier } from '../src/core/bounty.js';
import { xpForLevel, levelFromXp, combatLevel } from '../src/core/xp.js';
import { workerAnchorMs, workerTickMs } from '../src/core/workers.js';
import { recipeInputs } from '../src/core/artisan.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const H = 3600000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 9, 5, 0, 0, 0);   // a fixed Monday; the sim holds no clock of its own
const HORIZONS = [1, 7, 30, 90];

// ── 1. SERVER CAPS, READ FROM THE MIGRATION CHAIN ──────────────────────────
/* The LATEST file that defines `fn` at top level. Self-check blocks re-create
   functions inside `execute $sql$ ... $sql$` (indented), so anchoring at column
   0 skips them — 2026-08-15-gem-daily-budget.sql's fail-closed probe would
   otherwise read as the live three-dimension body. */
function latestDefinition(fn) {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  const head = new RegExp(`^create or replace function public\\.${fn}\\(`, 'm');
  for (let i = files.length - 1; i >= 0; i--) {
    const src = readFileSync(join(MIG_DIR, files[i]), 'utf8');
    const m = head.exec(src);
    if (!m) continue;
    const end = src.indexOf('\n$$;', m.index);
    const endAlt = src.indexOf('end $$;', m.index);
    const stop = [end, endAlt].filter((x) => x > 0).sort((a, b) => a - b)[0] || src.length;
    return { file: files[i], body: src.slice(m.index, stop) };
  }
  throw new Error(`econ-sim: no top-level definition of public.${fn} in supabase/migrations`);
}
function must(re, text, what) {
  const m = re.exec(text);
  if (!m) throw new Error(`econ-sim: could not read ${what} — the source moved; re-point the parser`);
  return m;
}
function latestFileMatching(re) {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const src = readFileSync(join(MIG_DIR, files[i]), 'utf8');
    const m = re.exec(src);
    if (m) return { file: files[i], m };
  }
  throw new Error(`econ-sim: nothing in supabase/migrations matches ${re}`);
}

export function readServerCaps() {
  const budget = latestDefinition('hr_day_budget_limits');
  const cap = latestDefinition('hr_offline_cap_ms');
  const taskSet = latestDefinition('hr_daily_task_set');
  const daily = latestDefinition('hr_claim_daily__ungated');
  const quest = latestDefinition('hr_claim_quest__ungated');
  const tax = latestFileMatching(/house_tax_bp\s+int\s+not null default (\d+)/);
  const goals = latestFileMatching(/insert into public\.hr_goal_rewards[\s\S]*?;\n/);

  const dailyGold = {};
  for (const m of daily.body.matchAll(/when '(\w+)'\s+then v_type := '\w+';\s*v_goal := \d+;\s*v_gold := (\d+);/g)) {
    dailyGold[m[1]] = Number(m[2]);
  }
  const questGold = {};
  for (const m of quest.body.matchAll(/when '(\w+)'\s+then v_key := '[^']*';\s*v_goal := \d+;\s*v_gold := (\d+);/g)) {
    questGold[m[1]] = Number(m[2]);
  }
  const goalRows = [];
  for (const m of goals.m[0].matchAll(/\('(\w+)',\s*(true|false),\s*'\w+',\s*'[^']*',\s*(\d+),\s*(\d+),/g)) {
    goalRows.push({ id: m[1], weekly: m[2] === 'true', gold: Number(m[4]) });
  }
  const dailyPool = must(/c_pool constant text\[\] := array\[([^\]]+)\]/, taskSet.body, 'the daily task pool')[1]
    .split(',').map((s) => s.trim().replace(/'/g, ''));
  const caps = {
    dayGoldBudget: Number(must(/c_day_gold_budget\s+constant bigint := (\d+)/, budget.body, 'c_day_gold_budget')[1]),
    offlineBaseH: Number(must(/c_base_h\s+constant int := (\d+)/, cap.body, 'c_base_h')[1]),
    offlineCeilingMs: Number(must(/c_ceiling_ms\s+constant bigint := (\d+) \* 3600000/, cap.body, 'c_ceiling_ms')[1]) * H,
    marketTaxBp: Number(tax.m[1]),
    dailyTasksOffered: Number(must(/for k in 1\.\.(\d+) loop/, taskSet.body, 'the daily task count')[1]),
    dailyPool, dailyGold, questGold, goalRows,
    sources: {
      dayGoldBudget: budget.file, offlineCap: cap.file, marketTax: tax.file,
      dailyTasks: daily.file, taskSet: taskSet.file, quests: quest.file, goalBoard: goals.file,
    },
  };
  if (!Object.keys(dailyGold).length || !Object.keys(questGold).length || !goalRows.length) {
    throw new Error('econ-sim: a reward catalogue parsed EMPTY — the CASE shape moved');
  }
  return caps;
}

// ── 2. KNOBS (the what-if surface) ─────────────────────────────────────────
/* Every knob defaults to TODAY. A knob is a parameter of the SIMULATION, never
   a write to data: changing a money surface is its own lane with a Security GO. */
export const DEFAULT_KNOBS = Object.freeze({
  gearRate: 1,          // vendor bid on CRAFTED EQUIPPABLES, as a share of book value
  craftedRate: 1,       // vendor bid on EVERY bench output (bars, blocks, gear...), as a share of book value
  dayBudget: 0,         // override of the server's daily gold budget (0 = the migration's value)
  upkeepBp: 0,          // recurring sink: bp/day of the gold already sunk into rooms+property+workers
  workerMult: 1,        // crew output multiplier (anchor tightening)
  loginMaxMult: 3,      // the backend lane's x3 login cap ...
  loginGemGrowth: false, // ... with no gem growth
  marketShare: 0,       // share of crafted output sold player-to-player (taxed) instead of vendored
  craftAnchor: 0,       // >0: a bench output vendors at min(book, this x its inputs' vendor value)
});

// ── 3. PRICES ──────────────────────────────────────────────────────────────
const CRAFTED = new Set();
for (const id in ARTISAN_RECIPES_PAYABLE) CRAFTED.add(ARTISAN_RECIPES_PAYABLE[id].recipe.output);
const isGear = (it) => it && (it.slot || it.type === 'weapon' || it.type === 'armor' || it.type === 'tool');
const RECIPES_BY_OUTPUT = {};
for (const id in ARTISAN_RECIPES_PAYABLE) {
  const r = ARTISAN_RECIPES_PAYABLE[id].recipe;
  (RECIPES_BY_OUTPUT[r.output] ||= []).push(r);
}
function makePricer(knobs) {
  const cache = new Map();
  const price = (id, seen) => {
    if (cache.has(id)) return cache.get(id);
    let p = vendorPriceOf(ITEMS, id);
    if (knobs.gearRate !== 1 && CRAFTED.has(id) && isGear(ITEMS[id])) p = Math.floor(p * knobs.gearRate);
    if (knobs.craftedRate !== 1 && CRAFTED.has(id)) p = Math.max(p > 0 ? 1 : 0, Math.floor(p * knobs.craftedRate));
    if (knobs.craftAnchor > 0 && CRAFTED.has(id) && !(seen && seen.has(id))) {
      /* INPUT-ANCHORED BID: what the cheapest recipe's inputs fetch at the
         vendor, times the markup, per unit out — never above book. A
         no-input recipe (quarrying) is a gather and keeps its book bid. */
      const stack = new Set(seen || []); stack.add(id);
      let anchor = Infinity;
      for (const r of RECIPES_BY_OUTPUT[id] || []) {
        const ins = recipeInputs(r);
        const keys = Object.keys(ins);
        if (!keys.length) { anchor = Infinity; break; }
        let v = 0;
        for (const k of keys) v += ins[k] * price(k, stack);
        anchor = Math.min(anchor, knobs.craftAnchor * v / (r.outputQty || 1));
      }
      if (Number.isFinite(anchor)) p = Math.min(p, Math.max(p > 0 ? 1 : 0, Math.floor(anchor)));
    }
    if (!seen) cache.set(id, p);
    return p;
  };
  return (id) => price(id, null);
}

// ── 4. RATES, MEASURED THROUGH THE REAL ENGINES ─────────────────────────────
const UID = '00000000-0000-4000-8000-0000000ec051';
const SPAN = H;                                  // one measured hour, scaled linearly
const lv = (skills, s) => levelFromXp(skills[s] || 0);
const bucket = (l) => Math.max(1, Math.floor(l / 5) * 5);   // measure at the bucket floor: never over-pays

function bestGear(skills) {
  /* Best-in-slot by summed bonuses the character can WEAR (reqSkill/reqLv),
     melee only so no ammo is needed. Ownership is assumed — gear acquisition is
     not priced (KNOWN LIMITS). */
  const eq = {};
  const score = {};
  for (const id in ITEMS) {
    const it = ITEMS[id];
    if (!it || !it.slot || (it.type !== 'weapon' && it.type !== 'armor')) continue;
    if (it.weaponType && /bow|staff|wand|crossbow|sling/.test(it.weaponType)) continue;
    if (it.reqSkill && it.reqLv && lv(skills, it.reqSkill) < it.reqLv) continue;
    const s = (it.atkB || 0) + (it.strB || 0) + (it.defB || 0);
    for (const slot of expandItemSlot(it.slot)) {
      if (!EQUIP_SLOTS.includes(slot) || slot === 'ammo' || slot === 'companion') continue;
      if (!(slot in score) || s > score[slot]) { score[slot] = s; eq[slot] = id; }
    }
  }
  return eq;
}
function bestToolsInv(skills) {
  /* The tool ladder is gated by the material tier's smithing level
     (src/data/gear-tiers.js MATERIAL_TIERS) applied to the GATHER skill — an
     ownership assumption, stated; the speed it buys is the engine's. */
  const inv = {};
  for (const id in ITEMS) {
    const it = ITEMS[id];
    if (!it || it.type !== 'tool' || !it.toolSkill) continue;
    const tier = MATERIAL_TIERS[(it.toolTier || 1) - 1];
    if (tier && lv(skills, it.toolSkill) >= tier.smith) inv[id] = 1;
  }
  return inv;
}
function skillsAt(levels) {
  const s = {};
  for (const k in levels) s[k] = xpForLevel(levels[k]);
  return s;
}

const rateCache = new Map();
function accrue(kind, id, skills, extraInv) {
  const inv = Object.assign(bestToolsInv(skills), extraInv || {});
  return computeAccrual({
    userId: UID, slot: 0, nowMs: T0 + SPAN, accruedToMs: T0, activeSinceMs: T0,
    activeKind: kind, activeId: id, capMs: SPAN, seed: 0xec051,
    hp: lv(skills, 'hitpoints'), maxHp: lv(skills, 'hitpoints'), gold: 0,
    skills, equipment: bestGear(skills), inventory: inv,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_PAYABLE,
  });
}
const COMBAT_SKILLS = ['attack', 'strength', 'defense', 'hitpoints'];
function combatRate(monId, skills) {
  const key = `c|${monId}|${COMBAT_SKILLS.map((s) => bucket(lv(skills, s))).join(',')}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const lvls = {}; for (const s of COMBAT_SKILLS) lvls[s] = bucket(lv(skills, s));
  const r = accrue('combat', monId, skillsAt(lvls));
  const out = r.accrued
    ? { gold: r.delta.gold || 0, items: posItems(r.delta.items), xp: r.delta.xp || {},
        kills: r.summary.kills || 0, deaths: r.summary.deaths || 0 }
    : null;
  rateCache.set(key, out);
  return out;
}
function gatherRate(nodeId, skills) {
  const e = GATHER_NODES[nodeId];
  const l = bucket(lv(skills, e.skill));
  if (l < (e.node.req || 1)) return null;
  const key = `g|${nodeId}|${l}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const r = accrue('gather', nodeId, skillsAt({ [e.skill]: l, hitpoints: 10 }));
  const out = r.accrued ? { items: posItems(r.delta.items), xp: r.delta.xp || {} } : null;
  rateCache.set(key, out);
  return out;
}
function craftRate(recipeId, skills) {
  const e = ARTISAN_RECIPES_PAYABLE[recipeId];
  const l = bucket(lv(skills, e.skill));
  if (l < (e.recipe.req || 1) || e.recipe.gated) return null;
  const key = `a|${recipeId}|${l}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const need = recipeInputs(e.recipe);
  const stock = {}; for (const k in need) stock[k] = 1e7;
  const r = accrue('artisan', recipeId, skillsAt({ [e.skill]: l, hitpoints: 10 }), stock);
  let out = null;
  if (r.accrued && r.delta.items) {
    const outQty = Math.max(0, r.delta.items[e.recipe.output] || 0);
    if (outQty > 0) {
      const used = {}; for (const k in r.delta.items) if (r.delta.items[k] < 0) used[k] = -r.delta.items[k];
      out = { out: e.recipe.output, outQty, used, xp: r.delta.xp || {} };
    }
  }
  rateCache.set(key, out);
  return out;
}
const workerCache = new Map();
function workerDay(nodeId, workerXp, knobs) {
  /* ONE crew member, ONE full settle window (the engine's own 24h cap), hired
     before the window so the hired_at floor does not bite. */
  const wl = levelFromXp(0) && Math.floor(Math.sqrt((workerXp || 0) / 2000));
  const key = `${nodeId}|${wl}`;
  let r = workerCache.get(key);
  if (!r) {
    const out = accrueWorkers({
      nowMs: T0 + DAY, workersAccruedToMs: T0,
      crew: [{ uid: 'w1', skill: GATHER_NODES[nodeId].skill, target_id: nodeId, xp: workerXp, hired_at: new Date(T0 - H).toISOString() }],
      nodes: GATHER_NODES, items: ITEMS,
    });
    r = out.accrued ? { items: posItems(out.items), xp: (out.workers.w1 && out.workers.w1.xp) || 0 } : { items: {}, xp: 0 };
    workerCache.set(key, r);
  }
  const items = {}; for (const k in r.items) items[k] = r.items[k] * knobs.workerMult;
  return { items, xp: r.xp };
}
function posItems(d) { const o = {}; for (const k in (d || {})) if (d[k] > 0) o[k] = d[k]; return o; }

// ── 5. PRODUCTION CHAINS ───────────────────────────────────────────────────
/* For a character's CURRENT levels, the cheapest way (in player-ms) to obtain
   one unit of every item: gather it, kill for it, or craft it from inputs that
   are themselves obtained the cheapest way. Each unit carries its bill: player
   ms, the gather ms per node (which a crew can cover), and the skill XP earned
   on the way. Then any craftable equippable/consumable's GOLD PER PLAYER-HOUR is
   price(out) / ms — the number the audit was estimating by hand. */
function buildSources(skills, safeMonsters) {
  const src = {};   // item -> [{ kind, id, msPerUnit, xpPerUnit, node? }]
  const add = (item, s) => { (src[item] ||= []).push(s); };
  for (const nodeId of Object.keys(GATHER_NODES)) {
    const r = gatherRate(nodeId, skills);
    if (!r) continue;
    for (const it in r.items) add(it, { kind: 'gather', id: nodeId, msPerUnit: SPAN / r.items[it], xpPerH: r.xp, node: nodeId, unitsPerH: r.items[it] });
  }
  for (const monId of safeMonsters) {
    const r = combatRate(monId, skills);
    if (!r || r.deaths) continue;
    for (const it in r.items) add(it, { kind: 'drop', id: monId, msPerUnit: SPAN / r.items[it], xpPerH: r.xp });
  }
  return src;
}
function solveChains(skills, price, safeMonsters) {
  const src = buildSources(skills, safeMonsters);
  const memo = new Map();
  const craftable = {};   // output item -> [{recipeId, rate}]
  for (const id in ARTISAN_RECIPES_PAYABLE) {
    const r = craftRate(id, skills);
    if (r) (craftable[r.out] ||= []).push({ id, r });
  }
  const scale = (o, k) => { const x = {}; for (const a in o) x[a] = o[a] * k; return x; };
  const addInto = (a, b, k) => { for (const x in b) a[x] = (a[x] || 0) + b[x] * k; };
  function cost(item, stack) {
    if (memo.has(item)) return memo.get(item);
    if (stack.has(item)) return null;
    stack.add(item);
    let best = null;
    for (const s of (src[item] || [])) {
      const c = { ms: s.msPerUnit, nodeUnits: {}, xp: scale(s.xpPerH, s.msPerUnit / SPAN) };
      if (s.kind === 'gather') c.nodeUnits[s.node] = { item, units: 1, msPerUnit: s.msPerUnit };
      if (!best || c.ms < best.ms) best = c;
    }
    for (const { id, r } of (craftable[item] || [])) {
      const crafts = r.outQty;                          // crafts in one measured hour
      const c = { ms: SPAN / crafts, nodeUnits: {}, xp: scale(r.xp, 1 / crafts), recipe: id };
      let ok = true;
      for (const inp in r.used) {
        const per = r.used[inp] / crafts;
        const sub = cost(inp, stack);
        if (!sub) { ok = false; break; }
        c.ms += sub.ms * per;
        addInto(c.xp, sub.xp, per);
        for (const n in sub.nodeUnits) {
          const u = sub.nodeUnits[n];
          const cur = c.nodeUnits[n] || (c.nodeUnits[n] = { item: u.item, units: 0, msPerUnit: u.msPerUnit });
          cur.units += u.units * per;
        }
      }
      if (ok && (!best || c.ms < best.ms)) best = c;
    }
    stack.delete(item);
    memo.set(item, best);
    return best;
  }
  const chains = [];
  for (const out in craftable) {
    const c = cost(out, new Set());
    if (!c || !c.recipe) continue;
    const p = price(out);
    if (p > 0) chains.push({ out, recipe: c.recipe, ms: c.ms, price: p, nodeUnits: c.nodeUnits, xp: c.xp, gph: p / c.ms * H });
  }
  chains.sort((a, b) => b.gph - a.gph);
  const sells = [];
  for (const it in src) {
    for (const s of src[it]) if (s.kind === 'gather') sells.push({ node: s.node, item: it, gph: price(it) * s.unitsPerH, xpPerH: s.xpPerH, unitsPerH: s.unitsPerH });
  }
  sells.sort((a, b) => b.gph - a.gph);
  return { chains, sells };
}

/* Run `hours` of one chain, with the crew stockpile covering gather steps. The
   per-unit cost is piecewise-linear in the stock: a unit whose node inputs are
   stocked costs only its non-gather ms. Returns units made and stock consumed. */
function runChain(chain, hours, stock) {
  let msLeft = hours * H;
  let units = 0;
  const xp = {};
  const nodes = Object.keys(chain.nodeUnits);
  while (msLeft > 1) {
    let unitMs = chain.ms;
    let limit = Infinity;
    for (const n of nodes) {
      const u = chain.nodeUnits[n];
      const have = stock[u.item] || 0;
      if (have >= u.units - 1e-9) { unitMs -= u.units * u.msPerUnit; limit = Math.min(limit, have / u.units); }
    }
    unitMs = Math.max(unitMs, 1);
    let n = Math.min(msLeft / unitMs, limit);
    if (!(n > 0)) { n = msLeft / chain.ms; unitMs = chain.ms; }   // stock gone: full cost
    for (const nn of nodes) {
      const u = chain.nodeUnits[nn];
      if ((stock[u.item] || 0) >= u.units * n - 1e-9 && unitMs < chain.ms) stock[u.item] = (stock[u.item] || 0) - u.units * n;
    }
    for (const s in chain.xp) xp[s] = (xp[s] || 0) + chain.xp[s] * n * (unitMs / chain.ms);
    units += n;
    msLeft -= n * unitMs;
    if (unitMs === chain.ms) break;
  }
  return { units, xp };
}

// ── 6. SINKS ───────────────────────────────────────────────────────────────
function sinkCatalogue() {
  /* Every ONE-TIME gold purchase the server sells: the unlock catalogue
     (rooms, property — castle included), the gold ladders (crew, farm land,
     bank), the companions. Item costs on these rows are not modelled. */
  const rows = [];
  for (const o of Object.values(UNLOCK_OFFERS)) {
    rows.push({ id: o.id, cat: o.table === 'property' ? 'property' : 'rooms', ladder: o.unlockId, rung: o.value, gold: o.gold, reqTier: 0 });
  }
  for (const o of GOLD_LADDER_OFFERS) {
    const cat = { worker: 'workers', bank: 'bank', plot: 'plots' }[o.table_name];
    rows.push({ id: o.offer_id, cat, ladder: o.unlock_id, rung: o.value, gold: o.gold, reqTier: o.req_property_tier || 0 });
  }
  for (const o of COMPANION_OFFERS) {
    rows.push({ id: o.offer_id, cat: 'companions', ladder: o.unlock_id, rung: o.value, gold: o.gold, reqTier: o.req_property_tier || 0 });
  }
  return rows;
}
const UPKEEP_CATS = new Set(['rooms', 'property', 'workers']);

// ── 7. ARCHETYPES ──────────────────────────────────────────────────────────
/* absences: the hours between sessions. Each is credited up to the server's
   offline cap (read in §1), so the cap is what bounds the away day. */
export const ARCHETYPES = Object.freeze([
  { id: 'casual', label: 'casual (1h + overnight)', activeH: 1, absences: [23], start: 'fresh' },
  { id: 'engaged', label: 'engaged (4h/day)', activeH: 4, absences: [8, 12], start: 'fresh' },
  { id: 'grinder', label: 'maxed grinder', activeH: 8, absences: [8, 8], start: 'maxed' },
]);
const ALL_SKILLS = ['attack', 'strength', 'defense', 'hitpoints', 'woodcutting', 'mining', 'fishing',
  'smithing', 'crafting', 'cooking', 'fletching', 'runecrafting', 'stonemason', 'prayer', 'farming', 'jewelcrafting', 'tailoring'];

function startSkills(kind) {
  const s = {};
  if (kind === 'maxed') { for (const k of ALL_SKILLS) s[k] = xpForLevel(99); return s; }
  s.hitpoints = xpForLevel(10);
  return s;
}

// ── 8. THE DAY LOOP ────────────────────────────────────────────────────────
export function simulate(arch, days, caps, knobsIn) {
  const knobs = Object.assign({}, DEFAULT_KNOBS, knobsIn || {});
  const price = makePricer(knobs);
  const skills = startSkills(arch.start);
  const inn = { kills: 0, bounties: 0, vendor: 0, login: 0, quests: 0, market: 0 };
  const out = { rooms: 0, property: 0, workers: 0, companions: 0, bank: 0, plots: 0, tax: 0, upkeep: 0 };
  const sinks = sinkCatalogue();
  const owned = new Set();
  const crew = [];
  const stock = {};
  let gold = 0;
  let deferred = 0;          // vendor value held back by the daily gold budget
  let cappedDays = 0;
  let exhaustedDay = null;
  const daily = [];
  const awayH = arch.absences.reduce((s, a) => s + Math.min(a, caps.offlineBaseH), 0);
  const tasksGold = (() => {
    const g = caps.dailyPool.map((t) => caps.dailyGold[t]).filter((x) => x > 0);
    return g.reduce((s, x) => s + x, 0) / g.length * caps.dailyTasksOffered;   // expected over the seeded draw
  })();
  const boardDaily = caps.goalRows.filter((r) => !r.weekly).reduce((s, r) => s + r.gold, 0);
  const boardWeekly = caps.goalRows.filter((r) => r.weekly).reduce((s, r) => s + r.gold, 0);
  const questOnce = Object.values(caps.questGold).reduce((s, x) => s + x, 0);
  const monsterIds = Object.keys(MONSTERS);

  for (let d = 0; d < days; d++) {
    const dayIn = { kills: 0, bounties: 0, vendor: deferred, login: 0, quests: 0, market: 0 };
    deferred = 0;
    // (a) claims — login (capped per knobs), daily tasks, goal board, onboarding once
    const lp = priceDailyLogin(d + 1);
    const base = DAILY_LOGIN_CYCLE[lp.cycleDay - 1];
    const mult = Math.min(lp.mult, knobs.loginMaxMult, DAILY_LOGIN_MAX_WEEK_MULT);
    dayIn.login += Math.round((base.gold || 0) * mult);
    dayIn.quests += tasksGold + boardDaily + (d % 7 === 6 ? boardWeekly : 0) + (d === 0 ? questOnce : 0);

    // (b) the crew's day, through accrueWorkers
    for (const w of crew) {
      if (!w.node) continue;
      const r = workerDay(w.node, w.xp, knobs);
      for (const it in r.items) stock[it] = (stock[it] || 0) + r.items[it];
      w.xp += r.xp;
    }

    // (c) choose: what pays best at today's levels
    const cl = combatLevel(skills);
    let bestCombat = null;
    for (const m of monsterIds) {
      const r = combatRate(m, skills);
      if (!r || !r.kills) continue;   // a knockout is priced by the engine's recovery ladder
      const v = r.gold + sumValue(r.items, price);
      const tier = MONSTERS[m].tier || 1;
      let bph = 0;
      if (tier <= unlockedTier(cl)) {
        const rng = bountyCountRange('cull', tier, 10, 'hard');
        bph = bountyRewards(tier, 'cull', 'hard').gold * r.kills / ((rng[0] + rng[1]) / 2);
      }
      if (!bestCombat || v + bph > bestCombat.v + bestCombat.bph) bestCombat = { m, r, v, bph };
    }
    const safe = monsterIds.filter((m) => { const r = combatRate(m, skills); return r && !r.deaths && r.kills; });
    const { chains, sells } = solveChains(skills, price, safe);
    const chain = chains[0] || null;
    const sell = sells[0] || null;

    // (d) assign the crew to the chain's gather inputs, biggest ms share first
    if (chain) {
      const need = Object.entries(chain.nodeUnits).sort((a, b) => b[1].units * b[1].msPerUnit - a[1].units * a[1].msPerUnit);
      crew.forEach((w, i) => { w.node = need.length ? need[i % need.length][0] : (sell && sell.node); });
    } else crew.forEach((w) => { w.node = sell && sell.node; });

    // (e) spend the day's hours
    const spend = (hours, mode) => {
      const opts = [];
      if (mode !== 'produce' && bestCombat) opts.push({ k: 'combat', gph: mode === 'fight' ? Infinity : bestCombat.v + bestCombat.bph });
      if (chain) opts.push({ k: 'chain', gph: chain.gph });
      if (sell) opts.push({ k: 'sell', gph: sell.gph });
      opts.sort((a, b) => b.gph - a.gph);
      const pick = opts[0];
      if (!pick) return;
      if (pick.k === 'combat') {
        const r = bestCombat.r;
        dayIn.kills += r.gold * hours;
        dayIn.vendor += sumValue(r.items, price) * hours;
        dayIn.bounties += bestCombat.bph * hours;
        addXp(skills, r.xp, hours);
      } else if (pick.k === 'chain') {
        const res = runChain(chain, hours, stock);
        const gross = res.units * chain.price;
        const toMarket = gross * knobs.marketShare;
        dayIn.vendor += gross - toMarket;
        dayIn.market += toMarket;
        out.tax += toMarket * caps.marketTaxBp / 10000;
        addXp(skills, res.xp, 1);
      } else {
        dayIn.vendor += sell.gph * hours;
        addXp(skills, sell.xpPerH, hours);
      }
    };
    /* Leveling characters fight while present (bounties need a live turn-in)
       and produce while away; the maxed grinder takes the best-paying option
       for every hour. */
    const maxed = arch.start === 'maxed';
    spend(arch.activeH, maxed ? 'best' : 'fight');
    spend(awayH, maxed ? 'best' : 'produce');

    // (f) stock the chain cannot use is sold raw
    const keep = new Set(chain ? Object.values(chain.nodeUnits).map((u) => u.item) : []);
    for (const it in stock) if (!keep.has(it) && stock[it] > 0) { dayIn.vendor += stock[it] * price(it); stock[it] = 0; }

    // (g) the daily gold budget: kills, vendor sales and claims are gold_in;
    //     bounties are explicitly outside it (2026-08-23-bounty.sql header).
    const budgeted = dayIn.kills + dayIn.vendor + dayIn.login + dayIn.quests;
    const dayCap = knobs.dayBudget > 0 ? knobs.dayBudget : caps.dayGoldBudget;
    if (budgeted > dayCap) { deferred = budgeted - dayCap; dayIn.vendor -= deferred; cappedDays++; }
    for (const k in dayIn) { dayIn[k] = Math.floor(dayIn[k]); inn[k] += dayIn[k]; gold += dayIn[k]; }
    gold -= Math.floor(out.tax) - (daily.length ? daily[daily.length - 1].taxSoFar : 0);

    // (h) recurring sink (what-if), then buy cheapest-first
    if (knobs.upkeepBp > 0) {
      const base2 = out.rooms + out.property + out.workers;
      const u = Math.floor(base2 * knobs.upkeepBp / 10000);
      const paid = Math.min(u, Math.max(0, gold));
      out.upkeep += paid; gold -= paid;
    }
    const tier = () => { let t = 0; for (const s of sinks) if (s.cat === 'property' && owned.has(s.id)) t = Math.max(t, s.rung); return t; };
    for (;;) {
      const t = tier();
      const avail = sinks.filter((s) => !owned.has(s.id) && s.reqTier <= t
        && sinks.every((p) => p.ladder !== s.ladder || p.rung >= s.rung || owned.has(p.id)))
        .sort((a, b) => a.gold - b.gold);
      const s = avail[0];
      if (!s || s.gold > gold) break;
      gold -= s.gold; out[s.cat] += s.gold; owned.add(s.id);
      if (s.cat === 'workers') crew.push({ xp: 0, node: chain ? Object.keys(chain.nodeUnits)[0] : (sell && sell.node) });
    }
    if (exhaustedDay === null && owned.size === sinks.length) exhaustedDay = d + 1;
    daily.push({ day: d + 1, gold, taxSoFar: Math.floor(out.tax), chain: chain && chain.out, cl });
  }
  const totIn = Object.values(inn).reduce((s, x) => s + x, 0);
  const totOut = Object.values(out).reduce((s, x) => s + Math.floor(x), 0);
  const last = daily[daily.length - 1];
  return {
    archetype: arch.id, days, in: inn, out: mapFloor(out), totIn, totOut, net: totIn - totOut, gold,
    goldPerDayLast: days > 1 ? last.gold - daily[daily.length - 2].gold + 0 : last.gold,
    exhaustedDay, sinksOwned: owned.size, sinksTotal: sinks.length, cappedDays,
    combatLevel: last.cl, chain: last.chain, crew: crew.length,
  };
}
function mapFloor(o) { const x = {}; for (const k in o) x[k] = Math.floor(o[k]); return x; }
function sumValue(items, price) { let v = 0; for (const k in items) v += items[k] * price(k); return v; }
function addXp(skills, xp, k) { for (const s in (xp || {})) skills[s] = (skills[s] || 0) + xp[s] * k; }

// ── 9. REPORTING ───────────────────────────────────────────────────────────
const fmt = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(0) + 'k';
  return String(Math.round(n));
};
export function runAll(caps, knobs, horizons = HORIZONS) {
  /* One 90-day run per archetype; shorter horizons are prefixes of it, which is
     exactly true because the loop is deterministic and holds no lookahead. */
  const res = [];
  for (const a of ARCHETYPES) for (const h of horizons) res.push(simulate(a, h, caps, knobs));
  return res;
}
function printTable(res, title) {
  console.log(`\n${title}`);
  console.log('archetype  days |   kills  bounty  vendor   login  quests  market |  sunk(rooms/prop/crew/comp/bank/plot/tax/upkeep)  |      net  balance  nothing-left-day  chain');
  for (const r of res) {
    const i = r.in; const o = r.out;
    console.log(`${r.archetype.padEnd(9)} ${String(r.days).padStart(5)} | ${[i.kills, i.bounties, i.vendor, i.login, i.quests, i.market].map((x) => fmt(x).padStart(7)).join(' ')} | `
      + `${[o.rooms, o.property, o.workers, o.companions, o.bank, o.plots, o.tax, o.upkeep].map(fmt).join('/').padEnd(48)} | ${fmt(r.net).padStart(8)} ${fmt(r.gold).padStart(8)} ${String(r.exhaustedDay ?? '—').padStart(8)} (${r.sinksOwned}/${r.sinksTotal})  ${r.chain || '-'}${r.cappedDays ? ` [budget-capped ${r.cappedDays}d]` : ''}`);
  }
}

// ── 10. SELFTEST ───────────────────────────────────────────────────────────
/* PLANT A FAUCET AND PROVE THE SIM SEES IT. A synthetic gather product worth
   `plantFaucet` gold is added to the item catalogue and to an L1 node for the
   duration of the run, through the SAME catalogue objects the engines read; a
   casual player must then show at least the planted amount over one day in
   `vendor`, and the baseline must not. Then the knobs must move what they claim
   to move. A sim that cannot see a planted faucet cannot be trusted to find a
   real one. */
function selftest(caps) {
  const problems = [];
  const ok = (c, m) => { if (!c) problems.push(m); };
  ok(caps.dayGoldBudget > 0 && caps.offlineBaseH > 0 && caps.marketTaxBp > 0, 'caps parsed as zero');
  ok(workerAnchorMs(3000) > 3000 && workerTickMs(3000, 0) > workerAnchorMs(3000), 'worker anchor is not the paced interval');
  const base = simulate(ARCHETYPES[0], 1, caps, {});
  const PLANT = 'econ_selftest_ingot';
  const nodeId = Object.keys(GATHER_NODES).find((n) => (GATHER_NODES[n].node.req || 1) === 1);
  const node = GATHER_NODES[nodeId].node;
  const saved = { prod: node.prod, ms: node.ms };
  ITEMS[PLANT] = { n: 'Selftest Ingot', v: 1000 };   // not raw: vendors at 100%
  node.prod = PLANT; node.ms = 1000;
  rateCache.clear(); workerCache.clear();
  let planted;
  try { planted = simulate(ARCHETYPES[0], 1, caps, {}); } finally {
    delete ITEMS[PLANT]; node.prod = saved.prod; node.ms = saved.ms; rateCache.clear(); workerCache.clear();
  }
  /* 12 away hours at <=1 unit per paced second x 1000 g: the engine paces the
     node, so the floor is the conservative 1 unit / 3 s. */
  const floor = caps.offlineBaseH * 1200 * 1000;
  ok(planted.in.vendor - base.in.vendor >= floor,
    `planted faucet INVISIBLE: vendor ${base.in.vendor} -> ${planted.in.vendor}, expected +${floor}`);
  const after = simulate(ARCHETYPES[0], 1, caps, {});
  ok(after.in.vendor === base.in.vendor, 'the plant leaked into a later run (catalogue not restored)');
  // the knobs move what they say they move (grinder, 7 days)
  /* Measured at the PRICE, not the grinder's income: since the craft anchor
     (src/core/vendor.js) a crafted sword fetches at most 1.5x its inputs, so a
     maxed grinder now vendors raw Dawnstone (92k/h) over any bench chain and
     gearRate rightly no longer moves its income. The knob must still move the
     bid it names. */
  const p0 = makePricer(Object.assign({}, DEFAULT_KNOBS)), p1 = makePricer(Object.assign({}, DEFAULT_KNOBS, { gearRate: 0.25 }));
  ok(p0('dawn_sword') > 0 && p1('dawn_sword') < p0('dawn_sword'),
    `gearRate=0.25 did not lower the dawn_sword bid (${p0('dawn_sword')} -> ${p1('dawn_sword')})`);
  const u1 = simulate(ARCHETYPES[2], 7, caps, { upkeepBp: 100 });
  ok(u1.out.upkeep > 0, 'upkeepBp=100 produced no upkeep sink');
  ok(base.in.login === DAILY_LOGIN_CYCLE[0].gold, `day-1 login paid ${base.in.login}, cycle says ${DAILY_LOGIN_CYCLE[0].gold}`);
  if (problems.length) { console.error('econ-sim --selftest RED:\n  ' + problems.join('\n  ')); return 1; }
  console.log(`econ-sim --selftest green: planted faucet seen (+${fmt(planted.in.vendor - base.in.vendor)}), knobs bite, caps from ${caps.sources.dayGoldBudget}`);
  return 0;
}

// ── 11. CLI ────────────────────────────────────────────────────────────────
function parseKnobs(argv) {
  const k = {};
  for (const a of argv) {
    const m = /^--(gear-rate|crafted-rate|craft-anchor|day-budget|upkeep-bp|worker-mult|login-max-mult|market-share)=([\d.]+)$/.exec(a);
    if (m) {
      k[{ 'gear-rate': 'gearRate', 'crafted-rate': 'craftedRate', 'craft-anchor': 'craftAnchor', 'day-budget': 'dayBudget', 'upkeep-bp': 'upkeepBp',
        'worker-mult': 'workerMult', 'login-max-mult': 'loginMaxMult', 'market-share': 'marketShare' }[m[1]]] = Number(m[2]);
    } else if (/^--(?!selftest$|json$|sweep$|explain=)/.test(a)) throw new Error(`econ-sim: unknown flag ${a}`);
  }
  return k;
}
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('econ-sim.mjs')) {
  const argv = process.argv.slice(2);
  const caps = readServerCaps();
  if (argv.includes('--selftest')) process.exit(selftest(caps));
  const knobs = parseKnobs(argv);
  const ex = argv.map((a) => /^--explain=(\w+)$/.exec(a)).find(Boolean);
  if (ex) {
    /* Show the work: the top chains at the archetype's STARTING levels, each
       with its bill, so a surprising number can be traced to an engine rate. */
    const arch = ARCHETYPES.find((a) => a.id === ex[1]);
    const skills = startSkills(arch.start);
    const price = makePricer(Object.assign({}, DEFAULT_KNOBS, knobs));
    const safe = Object.keys(MONSTERS).filter((m) => { const r = combatRate(m, skills); return r && !r.deaths && r.kills; });
    const { chains, sells } = solveChains(skills, price, safe);
    for (const c of chains.slice(0, 8)) {
      console.log(`${c.out.padEnd(24)} ${fmt(c.gph).padStart(7)}/h  ${(c.ms / 1000).toFixed(2)}s/unit @${c.price}g via ${c.recipe}  gather ${JSON.stringify(Object.fromEntries(Object.entries(c.nodeUnits).map(([n, u]) => [n, +u.units.toFixed(2)])))}`);
    }
    for (const s of sells.slice(0, 3)) console.log(`sell ${s.item} @${s.node}: ${fmt(s.gph)}/h`);
    const fights = Object.keys(MONSTERS).map((m) => { const r = combatRate(m, skills); return r && r.kills ? { m, v: r.gold + sumValue(r.items, price), r } : null; })
      .filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 3);
    for (const f of fights) console.log(`fight ${f.m}: ${fmt(f.v)}/h (${f.r.kills} kills, ${f.r.deaths} deaths, ${fmt(f.r.gold)} coin)`);
    console.log(`safe monsters: ${safe.length}`);
    process.exit(0);
  }
  if (argv.includes('--sweep')) {
    /* The recommendation's evidence: each candidate change, re-simulated, read
       at 30 and 90 days. Balance at the horizon and the day the last sink is
       bought are the two numbers "is gold still meaningful" turns on. */
    const CANDIDATES = [
      ['today', {}],
      ['gear vendors at 25%', { gearRate: 0.25 }],
      ['all bench output at 20% (raw rate)', { craftedRate: 0.2 }],
      ['all bench output at 35%', { craftedRate: 0.35 }],
      ['crew output x0.5', { workerMult: 0.5 }],
      ['upkeep 1%/day of rooms+property+crew', { upkeepBp: 100 }],
      ['daily gold budget 5M', { dayBudget: 5000000 }],
      ['bench 35% + budget 5M', { craftedRate: 0.35, dayBudget: 5000000 }],
      ['bench bid = 1.5x inputs (cap book)', { craftAnchor: 1.5 }],
      ['bench bid = 2x inputs (cap book)', { craftAnchor: 2 }],
      ['bench bid = 3x inputs (cap book)', { craftAnchor: 3 }],
      ['bench 2x inputs + budget 5M', { craftAnchor: 2, dayBudget: 5000000 }],
    ];
    console.log('candidate                                 | ' + ARCHETYPES.map((a) => `${a.id} d30 bal/last-sink-day  d90 bal`).join(' | '));
    for (const [label, k] of CANDIDATES) {
      const cells = ARCHETYPES.map((a) => {
        const r30 = simulate(a, 30, caps, Object.assign({}, knobs, k));
        const r90 = simulate(a, 90, caps, Object.assign({}, knobs, k));
        return `${fmt(r30.gold).padStart(8)}/${String(r90.exhaustedDay ?? '>90').padStart(3)}  ${fmt(r90.gold).padStart(8)}`;
      });
      console.log(`${label.padEnd(41)} | ${cells.join(' | ')}`);
    }
    process.exit(0);
  }
  const t0 = Date.now();
  const res = runAll(caps, knobs);
  if (argv.includes('--json')) { console.log(JSON.stringify({ caps, knobs, res }, null, 1)); process.exit(0); }
  console.log(`caps: day gold budget ${fmt(caps.dayGoldBudget)} (${caps.sources.dayGoldBudget}); offline cap ${caps.offlineBaseH}h (fuse ${caps.offlineCeilingMs / H}h); `
    + `market tax ${caps.marketTaxBp}bp; ${caps.dailyTasksOffered} daily tasks/day; login x${Math.min(DEFAULT_KNOBS.loginMaxMult, knobs.loginMaxMult || 99)} cap (repo constant x${DAILY_LOGIN_MAX_WEEK_MULT})`);
  printTable(res, `knobs: ${JSON.stringify(Object.assign({}, DEFAULT_KNOBS, knobs))}`);
  console.log(`\n(${Date.now() - t0} ms)`);
}

// ── KNOWN LIMITS ───────────────────────────────────────────────────────────
// · Gear and tools are assumed owned at the best tier the levels allow; their
//   acquisition cost (and the item costs on room/property rows) is not priced.
// · Rooms, companions and property perks do not feed back into rates.
// · Rates are measured over one hour at the 5-level bucket floor and scaled.
// · Bounties pay at 'hard' (elite is refused server-side) on the fought monster.
// · The market is a transfer: `market` in is another player's gold out; only the
//   house tax leaves the economy. Default share 0.
// · Raid/dungeon signature drops (e.g. slagheart_core) are not obtainable here,
//   so recipes that need them are excluded — an under-estimate of the top end.
