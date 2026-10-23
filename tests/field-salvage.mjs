// ════════════════════════════════════════════════════════════════════════
// tests/field-salvage.mjs — THE RULES A FIELD SALVAGE ROW MUST KEEP (pack 6).
//
// A salvage row is `{id, ch, salvage:true}` appended to a hunting spot's drop
// table: a small-slot armour piece of the monster's own tier that the SERVER
// mints into a tradeable inventory. A drop row is a faucet (there is no server
// drop allowlist: the hr-accrue bundle IS the drop catalogue), so every row is
// held to the Security review's GO-WITH-CHANGES list:
//
//   (a)  the item is generated tier gear (GEAR_ITEMS), armour, slot helmet/
//        boots/gloves/belt, item.tier === monster.tier, tradeable, not a
//        Hearthfind, not tier 8, not 'unique', live effects, has art; not a
//        lucky item, not QM stock, dungeon/shop/boss/raid loot, and no other
//        row of any monster drops it;
//   (b)  the monster has no lucky row, is not a seeded fixture, not a boss, not
//        a Hearthfind source;
//   (c)  ch <= the tier rate, and ch x dropBonus x vendorPriceOf <= 4% of the
//        gp midpoint;
//   (c2) the monster's TOTAL across every weapon/armor/jewelry row (salvage,
//        lucky and pre-existing) <= 5% of the gp midpoint;
//   (d)  hours MEASURED with the one engine on a training HUNT SESSION
//        (lucky-finds LOADOUT, seed 20260926, Controlled, fed from the bag, the
//        real respawn): base in [0.5, 10] h, and >= 0.25 h at the multiplier
//        ceiling (dropBonus x the best drop buff — the memory and BotD
//        multipliers and Vigour were deleted with the closed rebuild, lane C2);
//   (e)  the row is LAST, one per monster, items unique, never both salvage and
//        lucky — and a salvage-SHAPED row (own-tier small-slot generated armour)
//        never ships without the flag, because the flag is what stops the
//        client's own dice showing it (src/features/lucky-finds.js);
//
// BOTH PATHS (lane C2: a hunt is one engine whether a client watches or not):
// the hunt span credits the wild_boar piece through fx.addItem, and
// computeAccrual on a hunt session (the world tick's and the hunt verbs' one
// body) mints it with its ev:loot op and {type:'rare_drop'} event.
//
// Run GREEN:  node tests/field-salvage.mjs
// Prove RED:  node tests/field-salvage.mjs --selftest   (clean control arm too)
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { GEAR_ITEMS } from '../src/data/gear-tiers.js';
import { effectsAreLive } from '../src/data/item-effects.js';
import { pathFor } from '../src/data/item-art.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { BOSSES } from '../src/data/bosses.js';
import { HEARTHFIND_TABLE } from '../src/data/hearthfind.js';
import { effectiveDropChance } from '../src/core/drops.js';
import { lootKey } from '../src/core/goals.js';
import {
  playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats,
  DEFAULT_PROFILE,
} from '../src/core/combat.js';
import { xpForLevel, skillXpForLevel, charXpForLevel } from '../src/core/xp.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { huntSpan, huntAccrual } from './hunt-fixture.mjs';

let fails = [];
const ok = (cond, rule, msg) => { if (!cond) fails.push(`(${rule}) ${msg}`); };

/* THE MEASUREMENT, stated as data (the lucky-finds LOADOUT, same seed). */
const SEED = 20260926;
const HOURS_MIN = 0.5;
const HOURS_MAX = 10;
const CEILING_HOURS_MIN = 0.25;
const ROW_SHARE = 0.04;
const MONSTER_GEAR_SHARE = 0.05;
const TIER_RATE = Object.freeze({ 1: .004, 2: .004, 3: .0035, 4: .003, 5: .0025, 6: .002 });
const SLOTS = Object.freeze(['helmet', 'boots', 'gloves', 'belt']);
const LOADOUT = Object.freeze({
  1: { level: 8, metal: 'bronze' }, 2: { level: 20, metal: 'iron' }, 3: { level: 33, metal: 'steel' },
  4: { level: 48, metal: 'mithril' }, 5: { level: 63, metal: 'rune' }, 6: { level: 80, metal: 'ember' },
});
const FIXTURE_EXCLUDED = Object.freeze(['goblin', 'slime', 'rat', 'dark_wizard', 'wolf', 'the_silence', 'weak_skeleton']);
const GEAR_TYPES = Object.freeze(['weapon', 'armor', 'jewelry', 'offhand']);  // + offhand: the spellbook (2026-10-19)
const MAX_DROP_BUFF_PCT = Math.max(0, ...Object.values(ITEMS)
  .map((it) => (it && it.buff && it.buff.type === 'drop_rate') ? Number(it.buff.magnitude) || 0 : 0));

function equipmentFor(tier) {
  const m = LOADOUT[tier].metal;
  return { weapon: `${m}_sword`, helmet: `${m}_helm`, body: `${m}_platebody`, pants: `${m}_platelegs`,
    gloves: `${m}_gauntlets`, boots: `${m}_boots` };
}
function mentions(v, id) {
  if (v === id) return true;
  if (Array.isArray(v)) return v.some((x) => mentions(x, id));
  if (v && typeof v === 'object') return Object.keys(v).some((k) => k === id || mentions(v[k], id));
  return false;
}
const shopGranted = (id) => SHOP_OFFERS.some((o) => (o.grant || []).some((g) => g.kind === 'item' && g.id === id));
const gpMidOf = (m) => ((m.gp || [0, 0])[0] + (m.gp || [0, 0])[1]) / 2;

/* One simulated span at the monster's tier loadout, through the one engine:
   a training hunt (one foe, the real respawn), fed from the bag. */
const FIGHT_FOOD = 'cooked_moonfish';   // the best heal in the catalogue
/* THE MEASUREMENT HOUR, SEEDS SEARCHED NOT PINNED (the artisan-progress A10
   precedent). The hour must be fall-free to measure a kill RATE; a pinned seed
   that started falling when the hunt seed labels took a domain (architecture
   contracts S2) would make the rule measure luck. The search is a fixed,
   ordered list, so it is deterministic; exhausting it is still a red. */
function measureFight(monsters, monsterId) {
  let got = null;
  for (let k = 0; k < 8; k++) {
    got = fight(monsters, monsterId, { seed: SEED + k });
    if (got.deaths === 0) return got;
  }
  return got;
}

function fight(monsters, monsterId, { seed = SEED, hours = 1, fx = {} } = {}) {
  const m = monsters[monsterId];
  const tier = Math.min(6, Math.max(1, m.tier));
  const L = LOADOUT[tier].level;
  const EQ = equipmentFor(tier);
  /* The tier's Level with Melee and Defense at it (core rebuild: max HP from Level, the one 2 s swing). */
  const skills = { melee: skillXpForLevel('melee', L), defense: skillXpForLevel('defense', L) };
  const eq = equipmentStats(EQ, ITEMS);
  const state = { activeMonster: monsterId, monsterHp: m.hp, monsterMaxHp: m.hp,
    playerHp: 1e9, gold: 0, skills, levelXp: charXpForLevel(L), stats: {}, inventory: {} };
  const ctx = {
    fromMs: 0, toMs: hours * 3600000, 
    monsters, items: ITEMS, eq, bonus: () => 0, family: 'sword', activeBuffCount: 0,
    playerRolls: (mm) => playerCombatRolls(mm, { eq, equipment: EQ, items: ITEMS, skills, bonus: () => 0,
      profile: DEFAULT_PROFILE }),
    monsterRolls: (mm) => monsterCombatRolls(mm, { eq, skills, bonus: () => 0 }),
    weakness: (mm) => weaknessInfo(mm, eq),
    fx: { ...fx },
  };
  const out = huntSpan(state, ctx, { seed, fromMs: 0, food: FIGHT_FOOD, foodQty: 100000 });
  return { kills: out.kills, deaths: out.deaths };
}

/* Own-tier, small-slot, generated armour: the shape of a salvage row. */
const salvageShaped = (m, d) => {
  const g = GEAR_ITEMS[d.id];
  return !!(g && g.type === 'armor' && SLOTS.includes(g.slot) && g.tier === m.tier);
};

function check(monsters) {
  fails = [];
  const lines = [];
  const hfSources = new Set(HEARTHFIND_TABLE.filter((r) => r.kind === 'monster').map((r) => r.id));
  const luckyItems = new Set();
  for (const m of Object.values(monsters)) for (const d of (m.drops || [])) if (d && d.lucky) luckyItems.add(d.id);
  const seenItems = new Map();
  let count = 0;

  for (const [mid, m] of Object.entries(monsters)) {
    const drops = m.drops || [];
    /* (e) an unflagged salvage-shaped row: the client's dice would show it. A walked ground's LOOT-BAND row (`band`,
       src/data/loot-bands.js) is its own rule set: tests/hunt-core/drop-tables.mjs holds it (the pace, the faucet, the reveal). */
    drops.forEach((d) => {
      if (d && !d.salvage && !d.lucky && !d.band && salvageShaped(m, d)) {
        ok(false, 'e', `${mid} -> ${d.id}: a salvage-shaped row without salvage:true (the client would mint it)`);
      }
    });
    const rows = drops.map((d, i) => ({ d, i })).filter(({ d }) => d && d.salvage);
    if (!rows.length) continue;
    ok(rows.length === 1, 'e', `${mid}: ${rows.length} salvage rows, at most one per monster`);
    const db = m.dropBonus || 1;
    const gpMid = gpMidOf(m);
    for (const { d, i } of rows) {
      count++;
      const tag = `${mid} -> ${d.id}`;
      const it = ITEMS[d.id];
      const g = GEAR_ITEMS[d.id];
      /* (a) the item */
      ok(!!it, 'a', `${tag}: item does not exist in ITEMS`);
      if (!it) continue;
      ok(!!g, 'a', `${tag}: item is not generated tier gear (GEAR_ITEMS)`);
      ok(it.type === 'armor', 'a', `${tag}: type '${it.type}' is not armor`);
      ok(SLOTS.includes(it.slot), 'a', `${tag}: slot '${it.slot}' is not one of ${SLOTS.join('/')}`);
      ok(it.tier === m.tier, 'a', `${tag}: item tier ${it.tier} is not the monster's tier ${m.tier}`);
      ok(!it.bop, 'a', `${tag}: item is bind-on-pickup`);
      ok(!it.hearthfind, 'a', `${tag}: item is a Hearthfind`);
      ok(it.tier !== 8, 'a', `${tag}: item is tier 8`);
      ok(it.rarity !== 'unique', 'a', `${tag}: item is rarity 'unique'`);
      ok(effectsAreLive(it), 'a', `${tag}: item declares a dormant effect`);
      ok(!!pathFor(d.id), 'a', `${tag}: item has no art in item-art.js`);
      ok(!luckyItems.has(d.id), 'a', `${tag}: item is a lucky find`);
      ok(!shopGranted(d.id), 'a', `${tag}: item is granted by a shop offer (shops.js)`);
      ok(!mentions(BOSSES, d.id), 'a', `${tag}: item is boss loot`);
      for (const [oid, om] of Object.entries(monsters)) {
        (om.drops || []).forEach((od, oi) => {
          /* a loot-band row may share the item: its faucet is drop-tables.mjs' (pace + value cap) */
          if (od && od.id === d.id && !(oid === mid && oi === i) && !od.band) ok(false, 'a', `${tag}: item is also a drop of ${oid}[${oi}]`);
        });
      }
      /* (b) the monster */
      ok(!drops.some((x) => x && x.lucky), 'b', `${tag}: monster carries a lucky row`);
      ok(!FIXTURE_EXCLUDED.includes(mid), 'b', `${tag}: monster is a seeded-fixture exclusion`);
      ok(!m.boss, 'b', `${tag}: monster is a boss`);
      ok(!hfSources.has(mid), 'b', `${tag}: monster is a HEARTHFIND_TABLE source`);
      /* (c) the rate and the per-row faucet cap */
      const rate = TIER_RATE[m.tier];
      ok(rate != null && d.ch <= rate, 'c', `${tag}: ch ${d.ch} above the T${m.tier} rate ${rate}`);
      const perKill = d.ch * db * vendorPriceOf(ITEMS, d.id);
      ok(perKill <= ROW_SHARE * gpMid, 'c',
        `${tag}: ${perKill.toFixed(3)}g/kill of vendor value, above ${ROW_SHARE * 100}% of the gp midpoint (${gpMid})`);
      /* (e) placement and identity */
      ok(i === drops.length - 1, 'e', `${tag}: the salvage row is not the LAST element of its drops array`);
      ok(!d.lucky, 'e', `${tag}: a row is both salvage and lucky`);
      ok(!seenItems.has(d.id), 'e', `${tag}: item already used by the salvage row on ${seenItems.get(d.id)}`);
      seenItems.set(d.id, mid);
      /* (d) the hours, measured */
      if (m.tier < 1 || m.tier > 6) { ok(false, 'd', `${tag}: no measurement loadout for tier ${m.tier}`); continue; }
      const got = measureFight(monsters, mid);
      ok(got.deaths === 0, 'd', `${tag}: the measurement hour contained ${got.deaths} death(s)`);
      const base = effectiveDropChance(d, { dropMult: db });
      const hrs = got.kills > 0 ? 1 / (got.kills * base) : Infinity;
      const ceil = effectiveDropChance(d, { dropMult: db, dropBuff: MAX_DROP_BUFF_PCT / 100 });
      const ceilHrs = got.kills > 0 ? 1 / (got.kills * ceil) : Infinity;
      ok(hrs >= HOURS_MIN && hrs <= HOURS_MAX, 'd', `${tag}: ${hrs.toFixed(2)} expected hours, outside [${HOURS_MIN}, ${HOURS_MAX}]`);
      ok(ceilHrs >= CEILING_HOURS_MIN, 'd', `${tag}: ${ceilHrs.toFixed(2)} h at the multiplier ceiling, below ${CEILING_HOURS_MIN}`);
      lines.push(`  T${m.tier} ${mid.padEnd(16)} ${d.id.padEnd(18)} ${String(d.ch).padEnd(6)} `
        + `${(perKill / gpMid * 100).toFixed(2).padStart(5)}%  ${String(got.kills).padStart(4)}/h  ${hrs.toFixed(2).padStart(5)} h  `
        + `ceiling ${ceilHrs.toFixed(2).padStart(5)} h`);
    }
    /* (c2) the monster's whole gear faucet */
    const gearTotal = drops.reduce((s, x) => {
      const xi = x && ITEMS[x.id];
      return (xi && GEAR_TYPES.includes(xi.type)) ? s + x.ch * db * vendorPriceOf(ITEMS, x.id) : s;
    }, 0);
    ok(gearTotal <= MONSTER_GEAR_SHARE * gpMid, 'c2',
      `${mid}: all gear rows pay ${gearTotal.toFixed(3)}g/kill, above ${MONSTER_GEAR_SHARE * 100}% of the gp midpoint (${gpMid})`);
  }
  return { lines, fails: fails.slice(), count };
}

/* ── BOTH PATHS ──────────────────────────────────────────────────────────── */
const PROBE_MONSTER = 'wild_boar';
const PROBE_ITEM = 'leather_belt';
function bothPaths() {
  fails = [];
  const notes = [];
  const seen = (seed) => {
    const credited = {};
    const events = [];
    fight(MONSTERS, PROBE_MONSTER, { seed, hours: 1, fx: {
      addItem(id, n) { credited[id] = (credited[id] || 0) + n; },
      /* the server's onDrop, verbatim (hr-accrue/accrual.js) */
      onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },
    } });
    return { credited, events };
  };
  /* Deterministic search: the first seed from a fixed start. */
  let seed = null;
  for (let s = SEED; s < SEED + 400; s++) { if (seen(s).credited[PROBE_ITEM]) { seed = s; break; } }
  ok(seed !== null, 'hunt', `no seed in [${SEED}, ${SEED + 400}) drops ${PROBE_ITEM} in a 1 h hunt`);
  if (seed !== null) {
    const hunt = seen(seed);
    ok(hunt.events.some((e) => e.type === 'rare_drop' && e.item === PROBE_ITEM), 'hunt',
      `seed ${seed}: the hunt span credited ${PROBE_ITEM} but emitted no {type:'rare_drop'} event`);
    notes.push(`  simulateSpan (hunt) seed ${seed}: credits ${hunt.credited[PROBE_ITEM]}`);
  }
  const L = LOADOUT[1].level;
  const run = (s) => huntAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: 1760000000000 + 2 * 3600000, accruedToMs: 1760000000000, activeSinceMs: 1760000000000,
    activeKind: 'combat', activeId: PROBE_MONSTER, capMs: 12 * 3600000, seed: s,
    hp: 1e9, levelXp: charXpForLevel(L), gold: 0,
    skills: { melee: skillXpForLevel('melee', L), defense: skillXpForLevel('defense', L) },
    equipment: equipmentFor(1), inventory: {},
    items: ITEMS, monsters: MONSTERS,
  }, { seed: s, food: FIGHT_FOOD, foodQty: 5000 });
  let hit = null;
  for (let s = SEED; s < SEED + 400 && !hit; s++) {
    const out = run(s);
    if (out && out.accrued && out.delta && out.delta.items && out.delta.items[PROBE_ITEM] > 0) hit = { s, out };
  }
  ok(!!hit, 'hunt', `computeAccrual: no seed in [${SEED}, ${SEED + 400}) mints ${PROBE_ITEM} over a 2 h night`);
  if (hit) {
    const { out } = hit;
    const ops = (out.delta.progress || []);
    ok(ops.some((o) => o.key === lootKey(PROBE_ITEM) && o.add >= 1), 'hunt',
      `computeAccrual seed ${hit.s}: minted ${PROBE_ITEM} but wrote no ${lootKey(PROBE_ITEM)} collection op`);
    ok((out.events || []).some((e) => e.type === 'rare_drop' && e.item === PROBE_ITEM), 'hunt',
      `computeAccrual seed ${hit.s}: minted ${PROBE_ITEM} but events[] carries no {type:'rare_drop'}`);
    notes.push(`  computeAccrual seed ${hit.s}: delta.items.${PROBE_ITEM}=${out.delta.items[PROBE_ITEM]}, `
      + `${lootKey(PROBE_ITEM)} op present, rare_drop event present`);
  }
  return { notes, fails: fails.slice() };
}

/* ── THE MUTATION PROOF ─────────────────────────────────────────────────── */
function mutated(mutate) {
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) out[id] = { ...m, drops: (m.drops || []).map((d) => ({ ...d })) };
  mutate(out);
  return out;
}
const lastOf = (ms, mid) => ms[mid].drops[ms[mid].drops.length - 1];
const moveSalvage = (ms, from, to) => { ms[to].drops.push(ms[from].drops.pop()); };
const MUTATIONS = {
  ch_x10:               { rule: 'c', mk: () => mutated((ms) => { lastOf(ms, 'wild_boar').ch *= 10; }) },
  on_goblin:            { rule: 'b', mk: () => mutated((ms) => moveSalvage(ms, 'wild_boar', 'goblin')) },
  on_elk_king_boss:     { rule: 'b', mk: () => mutated((ms) => moveSalvage(ms, 'void_parasite', 'elk_king')) },
  on_small_wolf_lucky:  { rule: 'b', mk: () => mutated((ms) => moveSalvage(ms, 'wild_boar', 'small_wolf')) },
  lucky_item:           { rule: 'a', mk: () => mutated((ms) => { lastOf(ms, 'wild_boar').id = 'wolfbone_torc'; }) },
  wrong_slot:           { rule: 'a', mk: () => mutated((ms) => { lastOf(ms, 'scarecrow').id = 'bronze_platebody'; }) },
  wrong_tier:           { rule: 'a', mk: () => mutated((ms) => { lastOf(ms, 'wild_boar').id = 'iron_belt'; }) },
  /* worn tier-3 gear sells at 0.12 of book (loot-bands.js), so the brute's own sword is doubled to cross the 5% line */
  goblin_brute_total:   { rule: 'c2', mk: () => mutated((ms) => { moveSalvage(ms, 'bog_vine', 'goblin_brute'); ms.goblin_brute.drops.find((d) => d.id === 'steel_sword').ch = 0.02; }) },
  salvage_first:        { rule: 'e', mk: () => mutated((ms) => { ms.wild_boar.drops.unshift(ms.wild_boar.drops.pop()); }) },
  flag_removed:         { rule: 'e', mk: () => mutated((ms) => { delete lastOf(ms, 'wild_boar').salvage; }) },
  /* the band exemption stays narrow: a plain (unbanded) row sharing a salvage item is still a second source */
  plain_second_source:  { rule: 'a', mk: () => mutated((ms) => { ms.drain_rat.drops.push({ id: 'leather_belt', ch: 0.001 }); }) },
  /* a loot-band row that loses its band is a salvage-shaped row again (the exemption is the band, not the ground) */
  band_removed:         { rule: 'e', mk: () => mutated((ms) => { delete ms.gray_whelp.drops.find((d) => d.id === 'bronze_boots').band; }) },
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('field-salvage --selftest: each mutation must turn the guard RED on its own rule');
  let bad = 0;
  /* CLEAN control arm FIRST (guard-hygiene R3): a guard broken at rest would
     score every mutation as caught, so the unmutated tree must be GREEN. */
  const clean = check(MONSTERS);
  if (clean.fails.length || clean.count === 0) { bad++; console.error(`  x clean tree: RED or empty — ${clean.fails.join(' | ') || `${clean.count} rows`}`); }
  else console.log(`  clean tree: GREEN over ${clean.count} rows (negative control)`);
  for (const [name, mu] of Object.entries(MUTATIONS)) {
    const r = check(mu.mk());
    const onRule = r.fails.filter((f) => f.startsWith(`(${mu.rule})`));
    if (onRule.length) console.log(`  ${name}: RED on (${mu.rule}) — ${onRule[0]}`);
    else { bad++; console.error(`  x ${name}: not RED on (${mu.rule}); fails were: ${r.fails.join(' | ') || 'none'}`); }
  }
  if (bad) { console.error(`\n${bad} arm(s) failed.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
}

const res = check(MONSTERS);
const both = bothPaths();
const all = [...res.fails, ...both.fails];
if (!res.count) all.push('(e) no salvage rows found: the guard measured nothing');
if (all.length) {
  for (const f of all) console.error(`  FAIL  ${f}`);
  console.error(`\nfield-salvage: ${all.length} assertion(s) FAILED.`);
  process.exit(1);
}
console.log(`field-salvage: ${res.count} salvage rows keep every rule `
  + `(a 1 h training hunt, seed ${SEED}, Controlled, fed; ceiling = dropBonus x `
  + `${1 + MAX_DROP_BUFF_PCT / 100})\n${res.lines.join('\n')}\nboth paths:\n${both.notes.join('\n')}`);
process.exit(0);
