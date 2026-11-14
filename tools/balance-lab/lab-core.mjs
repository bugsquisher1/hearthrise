// tools/balance-lab/lab-core.mjs — THE BALANCE LAB'S RUNNER: one cell played on the REAL settle, measured.
//
// The browser twin of tools/balance-sim (cell.mjs runCell over tests/hunt-core/fixtures/play-ground.mjs run): the same
// settle the world tick runs (supabase/functions/hr-accrue/accrual.js accrueHunt -> src/core/combat-sim.js), the
// same heroes (every combat skill at the hero's Level, the worn set gear.mjs picks), the same bar and bag, the same
// measurement. Nothing here computes a combat number: every value is read off the events, members and deltas the
// engine answers. tools/balance-lab/build.mjs bundles this file with its whole import graph (src/core, src/data, the
// edge's settle) into dist/engine.js and dist/worker.js; tools/balance-lab/parity.mjs proves a cell played here
// answers what tools/balance-sim answers for the same cell, digit for digit.
//
// THE CELL (the balance-sim shape, the subset the lab plays):
//   { ground, party: [style], level: L | [L per seat], density (a pull; null = as built), gear: {} | [{} per seat]
//     (gear.mjs kitOf opts: tierOffset/only, starter, armourSlots, also), supply: 'store' | 'own', bar: { eatPct, drinkPct },
//     startBar, options: { tier } | [per seat], skillsBySeat, hours, seeds, seedBase, segmentH, windowMs }
// THE SPLIT (so a pool of workers can share one cell): playCell(cell, seeds) answers raw totals (plain JSON),
// mergeTotals joins any number of them, summarise reads them. runCell = all three in order, the balance-sim answer.
import { accrueHunt } from '../../supabase/functions/hr-accrue/accrual.js';
import { vendorPriceOf } from '../../supabase/functions/hr-accrue/catalogue.js';
import { heroSetup } from '../../src/core/hunt-spawn.js';
import { wornRoleKey } from '../../src/data/hunt-roles.js';
import { skillXpForLevel, charXpForLevel, charLevelFromXp } from '../../src/core/xp.js';
import { BASIC_SUPPLIES, BASIC_INDEX } from '../../src/data/supply-basics.js';
import { HUNT_GROUNDS, OPEN_GROUNDS } from '../../src/data/hunt-grounds.js';
import { MONSTERS } from '../../src/data/monsters.js';
import { ITEMS } from '../../src/data/items.js';
import { gridOfMap } from '../../src/core/hunt-ground.js';
import { BAG_GUIDE_BY_HUNT } from '../../src/data/supplies.js';
import { START_BAR, STARTER_SETS, START_EQUIPMENT } from '../../src/data/start-kit.js';
import { mitigationFor } from '../../src/core/mitigation.js';
import { vitalsOf } from '../../src/core/vitals.js';
import { HUNT_INDEX } from '../../src/data/hunts.js';
import { GEAR_LADDERS } from '../../src/data/gear-tiers.js';
import { SHIELD_ITEMS } from '../../src/data/shields.js';
import { reachableSources } from '../../src/data/catalogue-coherence.js';
import { BUILD } from '../../src/build-info.js';
import { STYLES } from '../balance-sim/gear.mjs';
import { rateCI, quantile, round, gini } from '../balance-sim/stats.mjs';

export { STYLES };
export const ENGINE_VERSION = BUILD.version;

/* the fixture's constants (play-ground.mjs, cell.mjs): the same clock, instance and cuts */
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000000c5f01';
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
const BURST_MS = 4000;
const CLOSE_PCT = 25;
const DIP_PCT = 40;
const windowOf = (cell) => cell.windowMs || (cell.party.length > 1 ? 30000 : 10000);

/* One deterministic hunt secret per (seed, segment): the same dice for the same seed in every cell (paired A/B). */
export function secretOf(seed, seg) {
  let h = 2166136261 >>> 0;
  for (const c of 'bal:' + seed + ':' + seg) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
}

/* ── WHAT A HERO WEARS (gear.mjs kitOf, the same rules on the same data) ─────────────────────────────────────── */
const ARMOUR_SLOT_KEYS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
let gearCache = null;
function gearData() {
  if (gearCache) return gearCache;
  const reach = reachableSources();
  const ladder = Object.fromEntries(GEAR_LADDERS.map((l) => [l.key, l.ids]));
  const starters = new Set([...Object.values(STARTER_SETS).flat(), ...Object.values(START_EQUIPMENT)]);
  gearCache = { reach, ladder, starters };
  return gearCache;
}
const tierOfItem = (id) => (ITEMS[id] && Number(ITEMS[id].tier)) || 1;
const lvOfItem = (id) => (ITEMS[id] && Number(ITEMS[id].reqLv)) || 1;

/** The worn set of `style` at Level `L` (gear.mjs kitOf). opts: { tierOffset, only, heavyShield, line, armourSlots, noArmour, ammo, starter, also }. */
export function kitOf(style, L, opts = {}) {
  const S = STYLES[style];
  if (!S) throw new Error('balance-lab: unknown style ' + style);
  const { reach, ladder, starters } = gearData();
  const can = (id) => !!id && !!ITEMS[id] && reach.has(id) && lvOfItem(id) <= L;
  const practiceFor = (key) => {
    const ids = ladder[key] || [];
    const ref = ITEMS[ids.find((x) => x && ITEMS[x])];
    if (!ref) return null;
    return [...starters].find((id) => {
      const it = ITEMS[id];
      return it && it.slot === ref.slot && it.weaponType === ref.weaponType && (it.discipline || null) === (ref.discipline || null)
        && (it.offhand || null) === (ref.offhand || null) && !!it.twoHanded === !!ref.twoHanded;
    }) || null;
  };
  const pick = (ids, off, fallback) => {
    const ok = ids.filter((id) => can(id)).sort((a, b) => tierOfItem(a) - tierOfItem(b));
    if (fallback && can(fallback) && !ok.some((id) => tierOfItem(id) === tierOfItem(fallback))) ok.unshift(fallback);
    if (!ok.length) return null;
    return ok[Math.max(0, ok.length - 1 + (off || 0))];
  };
  const shieldIds = (heavy) => Object.keys(SHIELD_ITEMS).filter((id) => ITEMS[id] && !!heavy === Object.keys(ITEMS[id]).some((k) => /AtkB$/.test(k) && ITEMS[id][k] < 0));
  if (opts.starter === true) {
    const set = { weapon: practiceFor(S.weapon) };
    if (S.offhand === 'shield') set.shield = ITEMS.practice_shield ? 'practice_shield' : null;
    else if (S.offhand === 'spellbook') set.shield = practiceFor('spellbook');
    if (S.role === 'ranger') set.ammo = opts.ammo || 'bronze_arrows';
    for (const k of Object.keys(set)) if (!set[k] || (k !== 'ammo' && !starters.has(set[k]))) delete set[k];
    return set;
  }
  const off = (group) => (opts.only === group || opts.only === 'all' ? (opts.tierOffset || 0) : 0);
  const set = {};
  set.weapon = pick(ladder[S.weapon] || [], off('weapon'), practiceFor(S.weapon));
  if (S.offhand === 'shield') set.shield = pick(shieldIds(opts.heavyShield === true), off('shield'), ITEMS.practice_shield ? 'practice_shield' : null);
  else if (S.offhand === 'spellbook') set.shield = pick(ladder.spellbook || [], off('weapon'), practiceFor('spellbook'));
  if (opts.noArmour !== true) {
    const line = opts.line || S.line;
    for (const slot of opts.armourSlots || ARMOUR_SLOT_KEYS) {
      const id = pick(ladder[line + ':' + slot] || [], off(slot) || off('armour'), null);
      if (id) set[slot] = id;
    }
  }
  if (S.role === 'ranger') set.ammo = opts.ammo || 'bronze_arrows';
  else if (opts.ammo) set.ammo = opts.ammo;
  Object.assign(set, opts.also || {});
  for (const k of Object.keys(set)) if (!set[k]) delete set[k];
  return set;
}

/* ── THE BAR AND THE BAG (cell.mjs barFor / bagFor; play-ground.mjs refBar) ──────────────────────────────────── */
const storeOf = (kind, cooked) => (BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
const guideOf = (huntId) => BAG_GUIDE_BY_HUNT[huntId] || null;
const clone = (x) => JSON.parse(JSON.stringify(x));
/* the reference bar: the start bar's three slots naming the ground's guide food and drink (play-ground.mjs refBar) */
function refBar(huntId) {
  const g = guideOf(huntId);
  if (!g) return START_BAR.map(clone);
  const item = { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) };
  return START_BAR.map((x) => { const y = clone(x); if (item[y.id]) y.action.id = item[y.id]; return y; });
}
/* the reference bar with its HP / drink thresholds moved (cell.mjs barFor) */
function barFor(huntId, bar) {
  const g = guideOf(huntId);
  const item = g ? { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
  return START_BAR.map((x) => {
    const y = clone(x);
    if (item[y.id]) y.action.id = item[y.id];
    const c = y.conditions[0];
    if (c.metric === 'self_hp_pct' && Number.isInteger(bar.eatPct)) c.value = bar.eatPct;
    if (c.metric === 'self_mana_pct' && Number.isInteger(bar.drinkPct)) c.value = bar.drinkPct;
    return y;
  });
}
function bagFor(huntId, supply, kit, also) {
  const bag = {};
  if (kit.ammo === 'bronze_arrows') bag.bronze_arrows = { loaded: 1 };
  for (const [id, n] of Object.entries(also || {})) bag[id] = { loaded: n };
  if (supply === 'own') {
    const g = guideOf(huntId);
    if (g) { bag[g.melee.heal.id] = { loaded: 100000 }; if (g.magic.mana) bag[g.magic.mana.id] = { loaded: 100000 }; }
  }
  return bag;
}
function bandOf(huntId) {
  const m = {};
  for (const p of HUNT_GROUNDS[huntId].pockets) for (const s of (p.pack || []).concat(p.spawns)) {
    for (const d of (MONSTERS[s.monster] || {}).drops || []) if (!m[d.id]) m[d.id] = d.band || (d.ch >= 0.05 ? 'common' : 'rare');
  }
  return m;
}

/* ── ONE HUNT ON THE REAL SETTLE (play-ground.mjs run, the parts a cell reads) ───────────────────────────────── */
const SESSION_BASICS = Object.fromEntries(BASIC_SUPPLIES.map((b) => [b.id, { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner }]));
function heroOf(huntId, role, i, L, roles, o) {
  const st = (o.start && o.start(role, i, L)) || {};
  const skills = st.skills ? { ...st.skills } : Object.fromEntries(COMBAT.map((k) => [k, skillXpForLevel(k, L)]));
  const equipment = o.equipment(role, i, L);
  return {
    key: role + i, user: role + i, slot: 0, seat: i, unitId: null, sessionId: 's-' + role + i, version: 1, huntId,
    huntSession: { id: 's-' + role + i, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0,
      bag: o.bag(role, i, L), staminaMs: 12 * 3600000, staminaMaxMs: 12 * 3600000, basics: SESSION_BASICS, goldFloor: 0,
      supplySource: 'mine', onEmpty: 'switch', cover: {} },
    skills, levelXp: Number.isInteger(st.levelXp) ? st.levelXp : charXpForLevel(L), xpFrac: null, hp: 1e9, gold: 50000, equipment,
    inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
    hero: heroSetup({ weaponType: wornRoleKey(equipment, ITEMS), options: { ...(role === 'healer' ? { role: 'healer' } : {}), ...(o.options ? o.options(role, i, L) : {}) },
      bar: o.bar ? o.bar(role, i, L) : refBar(huntId), partyRoles: roles, leaveTogether: o.leaveTogether === true }),
  };
}
function playHunt(huntId, levels, roles, o) {
  const ground = o.ground || HUNT_GROUNDS[huntId], grid = gridOfMap(ground.map);
  const members = roles.map((r, i) => heroOf(huntId, r, i, levels[i], roles, o));
  if (Number.isInteger(o.density)) for (const m of members) m.hero = Object.assign({}, m.hero, { density: o.density });
  let world = null, next = T0, played = 0;
  const WIN = o.windowMs;
  for (let t = T0; t < T0 + o.spanMs; t += WIN) {
    if (o.shouldStop && o.shouldStop()) throw new Error('balance-lab: cancelled');
    const out = accrueHunt({ instance: { id: IID, nextSwingAtMs: next, world }, window: { fromMs: t, toMs: Math.min(T0 + o.spanMs, t + WIN) },
      secret: o.secret, ground, grid, items: ITEMS, monsters: MONSTERS, members });
    if (!out.accrued) continue;
    o.onWindow(out, members);
    world = out.world; next = out.settledTo; played = next - T0;
    for (const p of out.members) {
      const m = members.find((x) => x.key === p.key), h = p.hunt;
      m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), staminaMs: h.stamina,
        bag: Object.fromEntries(Object.entries(m.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
      m.unitId = h.unit_id; m.hp = p.delta.hp; m.gold += p.delta.gold || 0;
      for (const [k, v] of Object.entries(p.delta.xp || {})) m.skills = { ...m.skills, [k]: (m.skills[k] || 0) + v };
      m.levelXp += p.delta.level_xp || 0;
      if (h.ended) m.ended = h.ended;
    }
    if (o.onProgress) o.onProgress(played);
    if (members.every((m) => m.ended)) break;
  }
  return { playedMs: played };
}

/* ── THE CELL (cell.mjs runCell, split so seeds can run apart and be joined exactly) ──────────────────────────── */
function cellLevels(cell) {
  return cell.party.map((_, i) => (cell.startBySeat ? charLevelFromXp(cell.startBySeat[i].levelXp)
    : Array.isArray(cell.level) ? cell.level[i] : cell.level));
}
function cellKits(cell, levels) {
  return cell.party.map((s, i) => kitOf(s, levels[i], (cell.gearBySeat && cell.gearBySeat[i]) || cell.gear || {}));
}
const LOOT0 = () => ({ common: 0, uncommon: 0, scarce: 0, rare: 0, trophy: 0, other: 0 });
function heroTotals(key, style, level, kit) {
  return { key, style, level, kit, hours: 0, levelXp: 0, skillXp: {}, coin: 0, loot: LOOT0(), lootN: 0, rareItems: [], gear: {}, store: 0, buys: {}, uses: {},
    deaths: 0, killers: {}, xpLostLevel: 0, deathLevelXpLost: [], xpLostSkill: {}, dealt: 0, dealtBy: {}, taken: 0, takenBy: {}, spellsIn: {},
    healIn: { food: 0, self: 0, ally: 0 }, healOut: 0, shieldIn: 0, blowsLanded: 0, blowsMissed: 0, dodged: 0, eats: { own: 0, store: 0 },
    drinks: { own: 0, store: 0 }, casts: {}, castGold: 0, manaShots: 0, enc: [], close: 0, dips: 0, ttdClose: [], ended: {} };
}

/**
 * Play `cell` on the seeds listed (default 0..cell.seeds-1, each offset by cell.seedBase); answers the raw totals
 * { heroes: [...], party: {...}, seeds: [...] } (plain JSON). hooks: { onProgress(fractionOfThisCall), shouldStop() }.
 */
export function playCell(cell, seeds, hooks = {}) {
  const ground = HUNT_GROUNDS[cell.ground];
  if (!ground) throw new Error('balance-lab: no ground ' + cell.ground);
  const party = cell.party;
  const roles = party.map((s) => { if (!STYLES[s]) throw new Error('balance-lab: unknown style ' + s); return STYLES[s].role; });
  const levels = cellLevels(cell);
  const kits = cellKits(cell, levels);
  const keys = roles.map((r, i) => r + i);
  const band = bandOf(cell.ground);
  const list = Array.isArray(seeds) ? seeds : Array.from({ length: cell.seeds || 1 }, (_, i) => i);
  const startFor = (role, seat) => {
    if (cell.startBySeat) return { levelXp: cell.startBySeat[seat].levelXp, skills: { ...cell.startBySeat[seat].skills } };
    const sk = cell.skillsBySeat ? cell.skillsBySeat[seat] : null;
    if (!sk) return null;
    return { skills: Object.fromEntries(COMBAT.map((k) => [k, skillXpForLevel(k, sk[k] || 1)])) };
  };
  const H = keys.map((k, i) => heroTotals(k, party[i], levels[i], kits[i]));
  const P = { kills: 0, ttk: [], hours: 0, segments: 0, rareRolls: 0, rareWins: {}, pulls: 0 };
  const byKey = Object.fromEntries(H.map((h) => [h.key, h]));
  const totalMs = list.length * cell.hours * 3600000;
  let doneMs = 0;
  for (const seed of list) {
    let left = cell.hours * 3600000, seg = 0;
    while (left > 60000) {
      const span = Math.min(left, (cell.segmentH || 2) * 3600000);
      const live = {};
      for (const h of H) live[h.key] = { unit: null, cur: null, max: null, enc: null, recent: [], at: T0, rate: 0 };
      let winFrom = T0;
      const unitKey = {};
      const firstHit = {};
      const close = (h, x) => {
        if (!x.enc || x.max === null) return;
        const pct = (100 * x.enc.min) / x.max;
        h.enc.push(Math.round(pct * 10) / 10);
        if (pct < CLOSE_PCT) { h.close++; h.ttdClose.push(x.enc.ttd); }
        if (pct < DIP_PCT) h.dips++;
        x.enc = null;
      };
      const open = (x) => { x.enc = { min: x.cur, ttd: Infinity }; };
      const lower = (x, at) => {
        if (!x.enc) open(x);
        if (x.cur < x.enc.min) {
          x.enc.min = x.cur;
          const recent = x.recent.filter((r) => r[0] > at - BURST_MS).reduce((s, r) => s + r[1], 0);
          x.enc.ttd = recent > 0 ? Math.round((x.cur / (recent / BURST_MS)) / 100) / 10 : Infinity;
        }
      };
      const onWindow = (out) => {
        for (const p of out.members) {
          const x = live[p.key];
          const uid = p.summary && Number.isInteger(p.summary.unitIdEver) ? p.summary.unitIdEver : p.hunt && p.hunt.unit_id;
          if (Number.isInteger(uid)) { x.unit = uid; unitKey[uid] = p.key; }
          x.max = p.maxHp;
          if (x.cur === null) x.cur = p.maxHp;
        }
        const hp = [];
        for (const e of out.events || []) {
          if (e.type === 'pull') { P.pulls++; hp.push([e.atMs, null, 0]); continue; }
          const tk = unitKey[e.t], uk = unitKey[e.u];
          switch (e.type) {
            case 'dmg': {
              const n = e.amount || 0;
              if (tk) {
                const h = byKey[tk];
                h.taken += n;
                const kind = (out.units && out.units[e.u] && out.units[e.u][0]) || (e.dot ? 'status' : '?');
                h.takenBy[kind] = (h.takenBy[kind] || 0) + n;
                /* a monster's spell (monster-spells.js): its hit names the spell, where a swing names 'basic' (cell.mjs, the same line) */
                if (!e.dot && !uk && e.ability && e.ability !== 'basic') { const s = h.spellsIn[e.ability] || (h.spellsIn[e.ability] = { hits: 0, dmg: 0 }); s.hits++; s.dmg += n; }
                if (!e.dot && !uk) h.blowsLanded++;
                hp.push([e.atMs, tk, -n]);
              } else if (uk) {
                const h = byKey[uk];
                h.dealt += n; const a = e.ability || 'basic'; h.dealtBy[a] = (h.dealtBy[a] || 0) + n;
                if (firstHit[e.t] === undefined) firstHit[e.t] = e.atMs;
              }
              break;
            }
            case 'miss':
              if (tk && !uk) { const h = byKey[tk]; h.blowsMissed++; if (e.dodge) h.dodged++; }
              break;
            case 'heal':
              if (tk) {
                const h = byKey[tk], n = e.amount || 0;
                if (e.item) h.healIn.food += n; else if (e.u === e.t) h.healIn.self += n; else h.healIn.ally += n;
                hp.push([e.atMs, tk, n]);
              }
              if (uk && e.u !== e.t && !e.item) byKey[uk].healOut += e.amount || 0;
              break;
            case 'shield':
              if (tk) byKey[tk].shieldIn += e.amount || 0;
              break;
            case 'kill':
              if (!tk) { P.kills++; if (firstHit[e.t] !== undefined) { P.ttk.push(e.atMs - firstHit[e.t]); delete firstHit[e.t]; } }
              break;
            case 'eat': case 'drink':
              if (uk) { const h = byKey[uk]; (e.type === 'eat' ? h.eats : h.drinks)[e.source === 'store' ? 'store' : 'own']++; }
              break;
            case 'cast':
              if (uk) { const h = byKey[uk]; h.casts[e.ability] = (h.casts[e.ability] || 0) + 1; h.castGold += e.gold || 0; }
              break;
            case 'shot':
              if (uk && e.mana) byKey[uk].manaShots++;
              break;
            case 'rare_roll':
              P.rareRolls++; if (unitKey[e.u]) P.rareWins[unitKey[e.u]] = (P.rareWins[unitKey[e.u]] || 0) + 1;
              break;
            default: break;
          }
        }
        const winTo = Number.isInteger(out.settledTo) ? out.settledTo : winFrom + windowOf(cell);
        const endHp = {};
        for (const p of out.members) {
          const d = p.delta || {}, hu = p.hunt || {};
          for (const dl of (p.summary && p.summary.deathLog) || []) hp.push([dl.atMs || winTo, p.key, -Infinity]);
          if (Number.isInteger(d.hp) && !hu.ended) endHp[p.key] = d.hp;
        }
        hp.sort((a, b) => a[0] - b[0]);
        for (const h of H) {
          const x = live[h.key];
          x.rate = 0; x.at = winFrom;
          if (x.cur === null || x.max === null || endHp[h.key] === undefined) continue;
          let c = x.cur;
          for (const [, k, n] of hp) if (k === h.key) c = Math.min(x.max, c + n);
          const gap = endHp[h.key] - c;
          if (gap > 0 && winTo > winFrom) x.rate = gap / (winTo - winFrom);
        }
        const step = (x, at) => { if (x.rate > 0 && at > x.at) x.cur = Math.min(x.max, x.cur + x.rate * (at - x.at)); x.at = Math.max(x.at, at); };
        for (const [at, k, n] of hp) {
          if (k === null) {
            for (const h of H) { const x = live[h.key]; if (x.unit !== null && x.cur !== null) { step(x, at); close(h, x); open(x); } }
            continue;
          }
          const x = live[k];
          if (x.cur === null) continue;
          step(x, at);
          if (n === -Infinity) { x.cur = 0; lower(x, at); continue; }
          if (n < 0) { x.cur += n; x.recent.push([at, -n]); if (x.recent.length > 64) x.recent.splice(0, 32); lower(x, at); }
          else x.cur = Math.min(x.max, x.cur + n);
        }
        winFrom = winTo;
        for (const p of out.members) {
          const h = byKey[p.key], x = live[p.key], d = p.delta || {}, hu = p.hunt || {};
          h.hours += (hu.paid_ms || 0) / 3600000;
          h.levelXp += d.level_xp || 0;
          for (const [k, n] of Object.entries(d.xp || {})) h.skillXp[k] = (h.skillXp[k] || 0) + n;
          h.coin += d.gold || 0;
          for (const [id, n] of Object.entries(d.items || {})) {
            const b = band[id] || 'other';
            h.loot[b in h.loot ? b : 'other'] += n * vendorPriceOf(ITEMS, id); h.lootN += n;
            const it = ITEMS[id];
            if (it && it.type === 'armor' && it.armourClass) h.gear[it.slot + ':' + it.armourClass] = (h.gear[it.slot + ':' + it.armourClass] || 0) + n;
          }
          for (const rd of (hu.hints && hu.hints.rare_drop) || []) h.rareItems.push(rd.item);
          for (const [id, n] of Object.entries(hu.buys || {})) { h.buys[id] = (h.buys[id] || 0) + n; h.store += n * ((BASIC_INDEX[id] || {}).price || 0); }
          for (const [id, n] of Object.entries(hu.uses || {})) h.uses[id] = (h.uses[id] || 0) + n;
          for (const dl of (p.summary && p.summary.deathLog) || []) {
            h.deaths++; h.killers[dl.monster] = (h.killers[dl.monster] || 0) + 1;
            const lost = (dl.xpLost && dl.xpLost.level) || 0;
            h.xpLostLevel += lost; h.deathLevelXpLost.push(lost);
            for (const [k, n] of Object.entries(dl.xpLost || {})) if (k !== 'level') h.xpLostSkill[k] = (h.xpLostSkill[k] || 0) + n;
          }
          if (hu.ended) h.ended[hu.ended.reason] = (h.ended[hu.ended.reason] || 0) + 1;
          if (Number.isInteger(d.hp) && !hu.ended) { x.cur = d.hp; if (x.enc) x.enc.min = Math.min(x.enc.min, x.cur); }
        }
      };
      const o = {
        spanMs: span, secret: secretOf((cell.seedBase || 0) + seed, seg), windowMs: windowOf(cell), onWindow,
        equipment: (role, i) => kits[i],
        bar: cell.startBar ? () => START_BAR.map(clone) : cell.bar || cell.slotsByRole
          ? (role) => barFor(cell.ground, cell.bar || {}).concat(clone((cell.slotsByRole && cell.slotsByRole[role]) || [])) : null,
        bag: (role, i) => bagFor(cell.ground, cell.supply || 'store', kits[i], cell.bagByRole && cell.bagByRole[role]),
        start: cell.skillsBySeat || cell.startBySeat ? startFor : null,
        leaveTogether: party.length > 1 && cell.leaveTogether !== false,
        options: cell.options ? (role, i) => (Array.isArray(cell.options) ? cell.options[i] : cell.options) : null,
        density: Number.isInteger(cell.density) ? cell.density : null,
        ground: cell.groundPatch ? { ...ground, ...cell.groundPatch } : null,
        shouldStop: hooks.shouldStop,
        onProgress: hooks.onProgress ? (ms) => hooks.onProgress(Math.min(1, (doneMs + ms) / totalMs)) : null,
      };
      const res = playHunt(cell.ground, levels, roles, o);
      for (const h of H) close(h, live[h.key]);
      const played = Math.max(res.playedMs, 60000);
      P.hours += played / 3600000; P.segments++;
      left -= played; seg++;
      doneMs += played;
    }
    doneMs = Math.max(doneMs, (list.indexOf(seed) + 1) * cell.hours * 3600000);
  }
  return { heroes: H, party: P, seeds: list.slice() };
}

const addInto = (a, b) => { for (const [k, v] of Object.entries(b || {})) a[k] = (a[k] || 0) + v; return a; };
/** Join the raw totals of the same cell played on different seeds (exact: sums, and lists a quantile sorts anyway). */
export function mergeTotals(parts) {
  const [first, ...rest] = parts.map(clone);
  for (const t of rest) {
    first.seeds.push(...t.seeds);
    const P = first.party, Q = t.party;
    P.kills += Q.kills; P.ttk.push(...Q.ttk); P.hours += Q.hours; P.segments += Q.segments; P.rareRolls += Q.rareRolls; P.pulls += Q.pulls;
    addInto(P.rareWins, Q.rareWins);
    first.heroes.forEach((h, i) => {
      const g = t.heroes[i];
      for (const k of ['hours', 'levelXp', 'coin', 'lootN', 'store', 'deaths', 'xpLostLevel', 'dealt', 'taken', 'healOut', 'shieldIn', 'blowsLanded', 'blowsMissed', 'dodged', 'castGold', 'manaShots', 'close', 'dips']) h[k] += g[k];
      for (const k of ['skillXp', 'loot', 'gear', 'buys', 'uses', 'killers', 'xpLostSkill', 'dealtBy', 'takenBy', 'healIn', 'eats', 'drinks', 'casts', 'ended']) addInto(h[k], g[k]);
      for (const k of ['rareItems', 'deathLevelXpLost', 'enc', 'ttdClose']) h[k].push(...g[k]);
      for (const [id, s] of Object.entries(g.spellsIn || {})) { const t = h.spellsIn[id] || (h.spellsIn[id] = { hits: 0, dmg: 0 }); t.hits += s.hits; t.dmg += s.dmg; }
    });
  }
  return first;
}

/* THE RULING'S DIFFICULTY BANDS (§3), cell.mjs BANDS: a cell's band by its typical encounter minimum HP and its deaths per 1,000 h. */
export const BANDS = Object.freeze([
  Object.freeze({ id: 'easy', minHp: [80, 100], deaths: [0, 0.1] }),
  Object.freeze({ id: 'normal', minHp: [60, 80], deaths: [0, 1] }),
  Object.freeze({ id: 'hard', minHp: [35, 60], deaths: [10, 30] }),
  Object.freeze({ id: 'extreme', minHp: [15, 40], deaths: [50, 100] }),
]);
function bandOfCell(minHp, deathRate) {
  const byHp = minHp === null ? null : (BANDS.find((b) => minHp >= b.minHp[0]) || { id: 'lethal' }).id;
  const d = deathRate === null ? null : deathRate;
  const byDeath = d === null ? null : d <= 0.1 ? 'easy' : d <= 1 ? 'normal' : d <= 30 ? 'hard' : d <= 100 ? 'extreme' : 'lethal';
  return byHp === byDeath ? byHp : byHp + '|' + byDeath;
}
const msS = (ms) => (ms === null ? null : round(ms / 1000, 1));

/** THE CELL'S METRICS (cell.mjs summarise, field for field), plus the lab's own reads under `lab`. */
export function summarise(cell, totals) {
  const ground = HUNT_GROUNDS[cell.ground];
  const hunt = HUNT_INDEX[ground.hunt] || {};
  const { party: P } = totals;
  const heroes = totals.heroes.map((h) => {
    const mit = mitigationFor(h.kit, ITEMS, h.level);
    const vit = vitalsOf({ levelXp: charXpForLevel(h.level), skills: {}, equipment: h.kit, items: ITEMS });
    const hr = h.hours || 1e-9, per = (n) => round(n / hr, 0);
    const income = h.coin + h.loot.common + h.loot.uncommon + h.loot.scarce + h.loot.other;
    const rares = h.loot.rare + h.loot.trophy;
    const swings = h.blowsLanded + h.blowsMissed;
    const healTotal = h.healIn.food + h.healIn.self + h.healIn.ally;
    const lostMean = h.deaths ? h.xpLostLevel / h.deaths : null;
    const xph = h.levelXp / hr;
    const deaths = rateCI(h.deaths, h.hours, 1000);
    const closeCalls = rateCI(h.close, h.hours, 12);
    const minMed = quantile(h.enc, 0.5);
    const toNext = charXpForLevel(h.level + 1) - charXpForLevel(h.level);
    return {
      key: h.key, style: h.style, level: h.level, kit: h.kit, maxHp: vit.maxHp, maxMana: vit.maxMana, mit,
      hours: round(h.hours, 2),
      levelXpPerH: round(xph, 0), skillXpPerH: Object.fromEntries(Object.entries(h.skillXp).map(([k, n]) => [k, per(n)])),
      coinPerH: per(h.coin), lootPerH: Object.fromEntries(Object.entries(h.loot).map(([k, n]) => [k, per(n)])),
      incomePerH: per(income), raresPerH: per(rares), storePerH: per(h.store), profitPerH: per(income - h.store),
      netWithRaresPerH: per(income + rares - h.store), margin: h.store > 0 ? round(income / h.store - 1, 3) : null,
      buysPerH: Object.fromEntries(Object.entries(h.buys).map(([k, n]) => [k, round(n / hr, 1)])),
      gearPerH: Object.fromEntries(Object.entries(h.gear).map(([k, n]) => [k, round(n / hr, 2)])),
      rareItems: h.rareItems.length, rareEveryH: h.rareItems.length ? round(h.hours / h.rareItems.length, 1) : null,
      deaths: h.deaths, deathsPer1000h: deaths, killers: h.killers,
      levelXpLostPerDeath: round(lostMean, 0), deathCostHours: lostMean !== null && xph > 0 ? round(lostMean / xph, 2) : null,
      dealtPerH: per(h.dealt), dps: round(h.dealt / (hr * 3600), 2), dealtBy: h.dealtBy,
      takenPerH: per(h.taken), takenBy: Object.fromEntries(Object.entries(h.takenBy).sort((a, b) => b[1] - a[1]).slice(0, 6)),
      /* the monsters' spells that struck this hero: { spell id: { hits, dmg } } over the cell (cell.mjs since 2026-11-08) */
      spellsIn: h.spellsIn,
      monsterSwingsPerH: per(swings), landedPct: swings ? round((100 * h.blowsLanded) / swings, 1) : null,
      dodgedPct: swings ? round((100 * h.dodged) / swings, 1) : null, dmgPerMonsterSwing: swings ? round(h.taken / swings, 3) : null,
      healInPerH: { food: per(h.healIn.food), self: per(h.healIn.self), ally: per(h.healIn.ally), total: per(healTotal) },
      healOutPerH: per(h.healOut), shieldInPerH: per(h.shieldIn), sustainRatio: h.taken ? round(healTotal / h.taken, 3) : null,
      eatsPerH: { own: round(h.eats.own / hr, 1), store: round(h.eats.store / hr, 1) },
      drinksPerH: { own: round(h.drinks.own / hr, 1), store: round(h.drinks.store / hr, 1) },
      castsPerH: Object.fromEntries(Object.entries(h.casts).map(([k, n]) => [k, round(n / hr, 1)])), manaShotsPerH: round(h.manaShots / hr, 1),
      encounters: h.enc.length, encMinHpPct: { p50: minMed, p10: quantile(h.enc, 0.1), p01: quantile(h.enc, 0.01) },
      closeCallsPer12h: closeCalls, dipsUnder40Per12h: rateCI(h.dips, h.hours, 12),
      ttdAtCloseS: quantile(h.ttdClose.filter(Number.isFinite), 0.5),
      band: bandOfCell(minMed, deaths.rate), ended: h.ended,
      raw: { levelXp: h.levelXp, skillXp: h.skillXp, xpLostLevel: h.xpLostLevel, xpLostSkill: h.xpLostSkill, coin: h.coin,
        income, store: h.store, rares },
      /* the lab's own reads (not in cell.mjs): the lowest HP any pull left (0 at a death: the tracked HP runs past it), the next Level's distance and pace */
      lab: { lowestHpPct: h.enc.length ? Math.max(0, Math.min(...h.enc)) : null, xpToNextLevel: toNext, hoursToNextLevel: xph > 0 ? round(toNext / xph, 2) : null,
        lootValuePerH: per(h.loot.common + h.loot.uncommon + h.loot.scarce + h.loot.other + rares) },
    };
  });
  const hours = P.hours || 1e-9;
  const wins = heroes.map((h) => P.rareWins[h.key] || 0);
  return {
    id: cell.id, cell, ground: cell.ground, hunt: { band: hunt.band || null, groupFit: ground.groupFit || null },
    party: { size: heroes.length, hours: round(P.hours, 2), segments: P.segments, killsPerH: round(P.kills / hours, 0),
      pullsPerH: round(P.pulls / hours, 1), ttkS: { p50: msS(quantile(P.ttk, 0.5)), p90: msS(quantile(P.ttk, 0.9)) },
      rareRolls: P.rareRolls, rareWins: P.rareWins, rareGini: gini(wins),
      levelXpPerHeroPerH: round(heroes.reduce((s, h) => s + (h.levelXpPerH || 0), 0) / heroes.length, 0),
      createdPerH: round(heroes.reduce((s, h) => s + h.incomePerH + h.raresPerH, 0), 0),
      destroyedPerH: round(heroes.reduce((s, h) => s + h.storePerH, 0), 0) },
    heroes,
  };
}

/** One cell, every seed, measured: the tools/balance-sim answer (cell.mjs runCell). */
export function runCell(cell, hooks) {
  return summarise(cell, playCell(cell, null, hooks));
}

/* ── THE CATALOGUE THE PAGE READS (grounds, ways to fight, a hero's default kit) ────────────────────────────── */
/** Every ground a player can hunt today: id, name, Level band, who it is built for, the monsters it spawns. */
export function grounds() {
  return Object.values(OPEN_GROUNDS).map((g) => {
    const hunt = HUNT_INDEX[g.hunt] || {};
    const mons = new Set();
    for (const p of g.pockets) for (const s of (p.pack || []).concat(p.spawns)) mons.add(s.monster);
    return { id: g.id, name: hunt.name || g.name || g.id, band: (hunt.band || [1, 1]).slice(), groupFit: g.pockets.some((p) => p.forParty) ? 'party' : (g.groupFit || null),
      partyPull: Array.isArray(g.partyPull) ? g.partyPull.slice() : null, densityMax: Array.isArray(g.densityMax) ? g.densityMax.slice() : null,
      monsters: [...mons].filter((id) => MONSTERS[id]).map((id) => ({ id, name: MONSTERS[id].name || id })) };
  }).sort((a, b) => a.band[0] - b.band[0] || a.id.localeCompare(b.id));
}
/** The ways to fight (gear.mjs STYLES): id, label, the hunt role it plays. */
export function styles() {
  return Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label, role: s.role, line: s.line }));
}
/* THE GEAR A HERO ROW CAN PICK: gear.mjs kitOf options, named (the balance-sim plans' own variants) */
export const GEAR_PRESETS = Object.freeze({
  level: Object.freeze({ label: 'Best for its Level', opts: Object.freeze({}) }),
  behind: Object.freeze({ label: 'One tier behind', opts: Object.freeze({ tierOffset: -1, only: 'all' }) }),
  light: Object.freeze({ label: 'Weapon, helm and body', opts: Object.freeze({ armourSlots: Object.freeze(['helmet', 'body']) }) }),
  starter: Object.freeze({ label: 'Practice set (a fresh hero)', opts: Object.freeze({ starter: true }) }),
});
const gearOpts = (preset) => clone((GEAR_PRESETS[preset] || GEAR_PRESETS.level).opts);
export { gearOpts };

/** A hero's kit with each piece's name, for the page to show what a measured hero wears. */
export function heroCard(style, level, preset) {
  const kit = kitOf(style, level, gearOpts(preset));
  const vit = vitalsOf({ levelXp: charXpForLevel(level), skills: {}, equipment: kit, items: ITEMS });
  return { pieces: Object.entries(kit).map(([slot, id]) => ({ slot, id, name: (ITEMS[id] && (ITEMS[id].n || ITEMS[id].name)) || id, tier: (ITEMS[id] && ITEMS[id].tier) || null })),
    maxHp: vit.maxHp, maxMana: vit.maxMana };
}
/** A copy of a monster row as the engine reads it right now (dials and a scaled hunt included): parity.mjs reads it. */
export const liveMonster = (id) => (MONSTERS[id] ? clone(MONSTERS[id]) : null);

/** Level XP from Level `L` to `L + 1` (the curve the game reads). */
export const xpToNext = (L) => charXpForLevel(L + 1) - charXpForLevel(L);
