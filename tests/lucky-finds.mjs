// ════════════════════════════════════════════════════════════════════════
// tests/lucky-finds.mjs — THE RULES A LUCKY FIND MUST KEEP (content pack 1).
//
// A lucky find is a `{id, ch, lucky:true}` row appended to a hunting spot's
// drop table: a very-rare named gear drop the SERVER mints into a tradeable
// inventory. A drop row is a faucet, so every row is held here to the rules the
// Security review (GO-WITH-CHANGES) made the price of shipping them:
//
//   (a) the item is live gear (weapon/armor/jewelry), tradeable, not a
//       Hearthfind, not tier 8, not rarity 'unique', has art, and has NO other
//       source a drop would shortcut: not QM stock, not dungeon loot, not a shop
//       grant, not boss/raid loot, not any other monster's drop;
//   (b) the monster is not a Hearthfind source and not a seeded fixture;
//   (c) FAUCET CAP: ch x dropBonus x vendorPriceOf <= 5% of the gp midpoint;
//   (d) HOURS, measured with the one engine: base in [4, 30] h, and >= 1.5 h at
//       the multiplier ceiling (dropBonus x MAX_MEMORY_DROP_MULT x best drop
//       buff x Boss-of-the-Day). Vigour-dry hours are reported, not gated;
//   (e) >= 4 lucky rows per tier T1-T6, unique items, lucky row LAST;
//   (f) item.tier is the monster's tier or one above it;
//   (g) pickProofItem (bounty proof) is unchanged by the lucky row.
//
// BOTH PATHS: the AWAY half runs the real server engine (computeAccrual) and a
// raw away simulateSpan; the ATTENDED half runs the live tick (away:false) on
// the same seed. Both must credit the item through fx.addItem.
//
// Run GREEN:  node tests/lucky-finds.mjs
// Prove RED:  node tests/lucky-finds.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { effectsAreLive } from '../src/data/item-effects.js';
import { pathFor } from '../src/data/item-art.js';
import { DUNGEONS, QM_STOCK } from '../src/data/dungeons.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { BOSSES } from '../src/data/bosses.js';
import { RAID_BOSSES } from '../src/data/raid-bosses.js';
import { HEARTHFIND_TABLE } from '../src/data/hearthfind.js';
import { MAX_MEMORY_DROP_MULT } from '../src/data/bestiary.js';
import { DAILY_POOL, WEEKLY_POOL, DAILY_BONUS, WEEKLY_BONUS } from '../src/core/botd.js';
import { VIGOUR_DRY_MULT } from '../src/core/hunt.js';
import { effectiveDropChance } from '../src/core/drops.js';
import { pickProofItem } from '../src/core/bounty.js';
import { lootKey } from '../src/core/goals.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { createRng } from '../src/core/rng.js';
import {
  playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats,
  swingIntervalMs, DEFAULT_PROFILE,
} from '../src/core/combat.js';
import { COMBAT_STYLES } from '../src/core/styles.js';
import { xpForLevel } from '../src/core/xp.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';

let fails = [];
const ok = (cond, rule, msg) => { if (!cond) fails.push(`(${rule}) ${msg}`); };

/* THE MEASUREMENT, stated as data so anyone who disagrees can reproduce it. */
const SEED = 20260926;
const HOURS_MIN = 4;
const HOURS_MAX = 30;
const CEILING_HOURS_MIN = 1.5;
const FAUCET_SHARE = 0.05;
const MIN_ROWS_PER_TIER = 4;
const LOADOUT = Object.freeze({
  1: { level: 8, metal: 'bronze' }, 2: { level: 20, metal: 'iron' }, 3: { level: 33, metal: 'steel' },
  4: { level: 48, metal: 'mithril' }, 5: { level: 63, metal: 'rune' }, 6: { level: 80, metal: 'ember' },
});
/* The seeded-fixture monsters (designer's exclusion list): fixtures across the
   suite pin their exact streams, and an extra draw would move them. */
const FIXTURE_EXCLUDED = Object.freeze(['goblin', 'slime', 'rat', 'dark_wizard', 'wolf', 'the_silence', 'weak_skeleton']);
const GEAR_TYPES = Object.freeze(['weapon', 'armor', 'jewelry']);
/* The best drop_rate buff anything in the catalogue can put on a player. */
const MAX_DROP_BUFF_PCT = Math.max(0, ...Object.values(ITEMS)
  .map((it) => (it && it.buff && it.buff.type === 'drop_rate') ? Number(it.buff.magnitude) || 0 : 0));

function equipmentFor(tier) {
  const m = LOADOUT[tier].metal;
  return { weapon: `${m}_sword`, helmet: `${m}_helm`, body: `${m}_platebody`, pants: `${m}_platelegs`,
    gloves: `${m}_gauntlets`, boots: `${m}_boots` };
}

/* Any string equal to `id` anywhere inside `v` (dungeon loot, boss signatures,
   raid rewards keyed by id). */
function mentions(v, id) {
  if (v === id) return true;
  if (Array.isArray(v)) return v.some((x) => mentions(x, id));
  if (v && typeof v === 'object') return Object.keys(v).some((k) => k === id || mentions(v[k], id));
  return false;
}
const shopGranted = (id) => SHOP_OFFERS.some((o) => (o.grant || []).some((g) => g.kind === 'item' && g.id === id));

/* One simulated hour at the monster's tier loadout, through the one engine.
   `awayFlag` and `span` are only varied by the both-path tests below. */
function fight(monsters, monsterId, { seed = SEED, hours = 1, away = true, fx = {} } = {}) {
  const m = monsters[monsterId];
  const tier = Math.min(6, Math.max(1, m.tier));
  const L = LOADOUT[tier].level;
  const EQ = equipmentFor(tier);
  const skills = { attack: xpForLevel(L), strength: xpForLevel(L), defense: xpForLevel(L),
    hitpoints: xpForLevel(Math.max(10, L)) };
  const maxHp = Math.max(10, L);
  const eq = equipmentStats(EQ, ITEMS);
  const style = COMBAT_STYLES.controlled || Object.values(COMBAT_STYLES)[0];
  const state = { activeMonster: monsterId, monsterHp: m.hp, monsterMaxHp: m.hp,
    playerHp: maxHp, playerMaxHp: maxHp, gold: 0, skills, stats: {}, inventory: {} };
  const ctx = {
    away, fromMs: 0, toMs: hours * 3600000, tickMs: swingIntervalMs(eq, style),
    rng: createRng(seed), monsters, items: ITEMS, bonus: () => 0, style, activeBuffCount: 0,
    playerRolls: (mm) => playerCombatRolls(mm, { eq, equipment: EQ, items: ITEMS, skills, bonus: () => 0,
      profile: DEFAULT_PROFILE, style }),
    monsterRolls: (mm) => monsterCombatRolls(mm, { eq, skills, bonus: () => 0 }),
    weakness: (mm) => weaknessInfo(mm, eq),
    botdFor: () => ({ killBonuses: () => ({ dropMult: 1, xpMult: 1 }) }),
    fx: {
      /* FED: heal to full below half, so the hour measures the fight. */
      autoEat() { if (state.playerHp < state.playerMaxHp * 0.5) { state.playerHp = state.playerMaxHp; return true; } return false; },
      ...fx,
    },
  };
  const out = simulateSpan(state, ctx);
  return { kills: out.kills, deaths: out.deaths };
}

function luckyRows(monsters) {
  const rows = [];
  for (const [mid, m] of Object.entries(monsters)) {
    (m.drops || []).forEach((d, i) => { if (d && d.lucky) rows.push({ mid, m, d, i }); });
  }
  return rows;
}

function check(monsters) {
  fails = [];
  const lines = [];
  const rows = luckyRows(monsters);
  const hfSources = new Set(HEARTHFIND_TABLE.filter((r) => r.kind === 'monster').map((r) => r.id));
  const seenItems = new Map();
  const perTier = {};

  for (const { mid, m, d, i } of rows) {
    const it = ITEMS[d.id];
    const tag = `${mid} -> ${d.id}`;
    /* (a) the item */
    ok(!!it, 'a', `${tag}: item does not exist in ITEMS`);
    if (!it) continue;
    ok(effectsAreLive(it), 'a', `${tag}: item declares a dormant effect`);
    ok(GEAR_TYPES.includes(it.type), 'a', `${tag}: type '${it.type}' is not weapon/armor/jewelry`);
    ok(!it.bop, 'a', `${tag}: item is bind-on-pickup`);
    ok(!it.hearthfind, 'a', `${tag}: item is a Hearthfind`);
    ok(it.tier !== 8, 'a', `${tag}: item is tier 8`);
    ok(it.rarity !== 'unique', 'a', `${tag}: item is rarity 'unique' (its sink is the forge, not a drop)`);
    ok(!QM_STOCK.some((q) => q.id === d.id), 'a', `${tag}: item is Quartermaster stock`);
    ok(!Object.values(DUNGEONS).some((dg) => mentions(dg.loot, d.id)), 'a', `${tag}: item is dungeon loot`);
    ok(!shopGranted(d.id), 'a', `${tag}: item is granted by a shop offer (shops.js)`);
    ok(!mentions(BOSSES, d.id) && !mentions(RAID_BOSSES, d.id), 'a', `${tag}: item is boss/raid loot`);
    ok(!!pathFor(d.id), 'a', `${tag}: item has no art in item-art.js`);
    for (const [oid, om] of Object.entries(monsters)) {
      (om.drops || []).forEach((od, oi) => {
        if (od && od.id === d.id && !(oid === mid && oi === i)) {
          ok(false, 'a', `${tag}: item is also a drop of ${oid}[${oi}]`);
        }
      });
    }
    /* (b) the monster */
    ok(!hfSources.has(mid), 'b', `${tag}: monster is a HEARTHFIND_TABLE source`);
    ok(!FIXTURE_EXCLUDED.includes(mid), 'b', `${tag}: monster is a seeded-fixture exclusion`);
    /* (c) the faucet cap */
    const db = m.dropBonus || 1;
    const gpMid = ((m.gp || [0, 0])[0] + (m.gp || [0, 0])[1]) / 2;
    const perKill = d.ch * db * vendorPriceOf(ITEMS, d.id);
    ok(perKill <= FAUCET_SHARE * gpMid, 'c',
      `${tag}: adds ${perKill.toFixed(3)}g/kill of vendor value, above ${FAUCET_SHARE * 100}% of the gp midpoint (${gpMid})`);
    /* (e) placement */
    ok(i === m.drops.length - 1, 'e', `${tag}: the lucky row is not the LAST element of its drops array`);
    ok(!seenItems.has(d.id), 'e', `${tag}: item already used by lucky row on ${seenItems.get(d.id)}`);
    seenItems.set(d.id, mid);
    perTier[m.tier] = (perTier[m.tier] || 0) + 1;
    /* (f) the tier rule */
    ok(it.tier === m.tier || it.tier === m.tier + 1, 'f', `${tag}: item tier ${it.tier} is not T${m.tier} or T${m.tier + 1}`);
    /* (g) the bounty proof item */
    const stripped = { ...monsters, [mid]: { ...m, drops: m.drops.filter((x) => !x.lucky) } };
    ok(pickProofItem(mid, monsters, ITEMS) === pickProofItem(mid, stripped, ITEMS), 'g',
      `${tag}: the lucky row changes the bounty proof item`);
    /* (d) the hours, measured */
    if (m.tier < 1 || m.tier > 6) { ok(false, 'd', `${tag}: no measurement loadout for tier ${m.tier}`); continue; }
    const got = fight(monsters, mid);
    ok(got.deaths === 0, 'd', `${tag}: the measurement hour contained ${got.deaths} death(s)`);
    const base = effectiveDropChance(d, { dropMult: db });
    const hrs = got.kills > 0 ? 1 / (got.kills * base) : Infinity;
    const botd = Math.max(1, WEEKLY_POOL.includes(mid) ? WEEKLY_BONUS.dropMult : 1,
      DAILY_POOL.includes(mid) ? DAILY_BONUS.dropMult : 1);
    const ceil = effectiveDropChance(d, { dropMult: db * MAX_MEMORY_DROP_MULT, dropBuff: MAX_DROP_BUFF_PCT / 100, featuredMult: botd });
    const ceilHrs = got.kills > 0 ? 1 / (got.kills * ceil) : Infinity;
    const dryHrs = hrs / VIGOUR_DRY_MULT;
    ok(hrs >= HOURS_MIN && hrs <= HOURS_MAX, 'd', `${tag}: ${hrs.toFixed(1)} expected hours, outside [${HOURS_MIN}, ${HOURS_MAX}]`);
    ok(ceilHrs >= CEILING_HOURS_MIN, 'd', `${tag}: ${ceilHrs.toFixed(2)} h at the multiplier ceiling, below ${CEILING_HOURS_MIN}`);
    lines.push(`  T${m.tier} ${mid.padEnd(18)} ${d.id.padEnd(22)} 1 in ${String(Math.round(1 / base)).padStart(5)}  `
      + `${String(got.kills).padStart(4)}/h  ${hrs.toFixed(1).padStart(5)} h  ceiling ${ceilHrs.toFixed(1).padStart(4)} h  `
      + `vigour-dry ${dryHrs.toFixed(0).padStart(3)} h`);
  }
  for (let t = 1; t <= 6; t++) {
    ok((perTier[t] || 0) >= MIN_ROWS_PER_TIER, 'e', `tier ${t} has ${perTier[t] || 0} lucky rows, needs ${MIN_ROWS_PER_TIER}`);
  }
  return { lines, fails: fails.slice(), count: rows.length };
}

/* ── BOTH PATHS ──────────────────────────────────────────────────────────── */
const PROBE_MONSTER = 'small_wolf';
const PROBE_ITEM = 'wolfbone_torc';
function bothPaths() {
  fails = [];
  const notes = [];
  /* A lucky row is rare by design, so the seed is SEARCHED deterministically
     (first hit from a fixed start) instead of hand-picked. */
  const seen = (seed, away) => {
    const credited = {};
    const events = [];
    fight(MONSTERS, PROBE_MONSTER, { seed, hours: 3, away, fx: {
      addItem(id, n) { credited[id] = (credited[id] || 0) + n; },
      /* the server's onDrop, verbatim (hr-accrue/accrual.js) */
      onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },
    } });
    return { credited, events };
  };
  let seed = null;
  for (let s = SEED; s < SEED + 400; s++) { if (seen(s, true).credited[PROBE_ITEM]) { seed = s; break; } }
  ok(seed !== null, 'away', `no seed in [${SEED}, ${SEED + 400}) drops ${PROBE_ITEM} in a 3 h away span`);
  if (seed !== null) {
    const away = seen(seed, true);
    ok(away.events.some((e) => e.type === 'rare_drop' && e.item === PROBE_ITEM), 'away',
      `seed ${seed}: the away span credited ${PROBE_ITEM} but emitted no {type:'rare_drop'} event`);
    const live = seen(seed, false);
    ok(!!live.credited[PROBE_ITEM], 'attended',
      `seed ${seed}: the live tick (away:false) did not credit ${PROBE_ITEM} where the away span did`);
    notes.push(`  simulateSpan seed ${seed}: away credits ${away.credited[PROBE_ITEM]}, attended credits ${live.credited[PROBE_ITEM] || 0}`);
  }
  /* THE REAL SERVER ENGINE: delta.items, the ev:loot collection op, events[]. */
  const L = LOADOUT[1].level;
  const run = (s) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: 1760000000000 + 3 * 3600000, accruedToMs: 1760000000000, activeSinceMs: 1760000000000,
    activeKind: 'combat', activeId: PROBE_MONSTER, capMs: 12 * 3600000, seed: s,
    hp: 20, maxHp: 20, gold: 0,
    skills: { attack: xpForLevel(L), strength: xpForLevel(L), defense: xpForLevel(L), hitpoints: xpForLevel(20) },
    equipment: equipmentFor(1), inventory: { shrimp: 5000 },
    autoEatEnabled: true, autoEatFood: 'shrimp', autoEatPct: 25,
    items: ITEMS, monsters: MONSTERS,
  });
  let hit = null;
  for (let s = SEED; s < SEED + 400 && !hit; s++) {
    const out = run(s);
    if (out && out.accrued && out.delta && out.delta.items && out.delta.items[PROBE_ITEM] > 0) hit = { s, out };
  }
  ok(!!hit, 'away', `computeAccrual: no seed in [${SEED}, ${SEED + 400}) mints ${PROBE_ITEM} over a 3 h night`);
  if (hit) {
    const { out } = hit;
    const ops = (out.delta.progress || []);
    ok(ops.some((o) => o.key === lootKey(PROBE_ITEM) && o.add >= 1), 'away',
      `computeAccrual seed ${hit.s}: minted ${PROBE_ITEM} but wrote no ${lootKey(PROBE_ITEM)} collection op`);
    ok((out.events || []).some((e) => e.type === 'rare_drop' && e.item === PROBE_ITEM), 'away',
      `computeAccrual seed ${hit.s}: minted ${PROBE_ITEM} but events[] carries no {type:'rare_drop'}`);
    notes.push(`  computeAccrual seed ${hit.s}: delta.items.${PROBE_ITEM}=${out.delta.items[PROBE_ITEM]}, `
      + `${lootKey(PROBE_ITEM)} op present, rare_drop event present`);
  }
  return { notes, fails: fails.slice() };
}

/* ── THE MUTATION PROOF ─────────────────────────────────────────────────── */
function withRow(mid, mutate) {
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) out[id] = { ...m, drops: (m.drops || []).map((d) => ({ ...d })) };
  mutate(out, mid);
  return out;
}
const lastOf = (ms, mid) => ms[mid].drops[ms[mid].drops.length - 1];
const moveLucky = (ms, from, to) => {
  const row = ms[from].drops.pop();
  ms[to].drops.push(row);
};
const MUTATIONS = {
  ch_x10:           { rule: 'd', mk: () => withRow('kobold', (ms) => { lastOf(ms, 'kobold').ch *= 10; }) },
  on_elk_king:      { rule: 'b', mk: () => withRow(null, (ms) => moveLucky(ms, 'broodmother', 'elk_king')) },
  wartusk_cleaver:  { rule: 'a', mk: () => withRow(null, (ms) => { lastOf(ms, 'goblin_warlord').id = 'wartusk_cleaver'; }) },
  emberheart:       { rule: 'a', mk: () => withRow(null, (ms) => { lastOf(ms, 'drake').id = 'emberheart'; }) },
  t1_v13600_item:   { rule: 'c', mk: () => withRow(null, (ms) => { lastOf(ms, 'mandrake').id = 'demoncaller_staff'; }) },
  oak_staff:        { rule: 'a', mk: () => withRow(null, (ms) => { lastOf(ms, 'witchs_apprentice').id = 'oak_staff'; }) },
  crown_fallen_king:{ rule: 'a', mk: () => withRow(null, (ms) => { lastOf(ms, 'draconia').id = 'crown_of_the_fallen_king'; }) },
  widows_fang:      { rule: 'f', mk: () => withRow(null, (ms) => { lastOf(ms, 'giant_spider').id = 'widows_fang'; }) },
  lucky_first:      { rule: 'e', mk: () => withRow(null, (ms) => { ms.zombie.drops.unshift(ms.zombie.drops.pop()); }) },
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('lucky-finds --selftest: each mutation must turn the guard RED on its own rule');
  let bad = 0;
  for (const [name, mu] of Object.entries(MUTATIONS)) {
    const r = check(mu.mk());
    const onRule = r.fails.filter((f) => f.startsWith(`(${mu.rule})`));
    if (onRule.length) console.log(`  ${name}: RED on (${mu.rule}) — ${onRule[0]}`);
    else { bad++; console.error(`  x ${name}: not RED on (${mu.rule}); fails were: ${r.fails.join(' | ') || 'none'}`); }
  }
  const clean = check(MONSTERS);
  if (clean.fails.length) { bad++; console.error(`  x clean tree: RED — ${clean.fails.join(' | ')}`); }
  else console.log('  clean tree: GREEN (negative control)');
  if (bad) { console.error(`\n${bad} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
}

const res = check(MONSTERS);
const both = bothPaths();
const all = [...res.fails, ...both.fails];
if (all.length) {
  for (const f of all) console.error(`  FAIL  ${f}`);
  console.error(`\nlucky-finds: ${all.length} assertion(s) FAILED.`);
  process.exit(1);
}
console.log(`lucky-finds: ${res.count} lucky rows keep every rule `
  + `(simulateSpan 1 h, seed ${SEED}, Controlled, fed; ceiling = dropBonus x ${MAX_MEMORY_DROP_MULT} x `
  + `${1 + MAX_DROP_BUFF_PCT / 100} x BotD)\n${res.lines.join('\n')}\nboth paths:\n${both.notes.join('\n')}`);
process.exit(0);
