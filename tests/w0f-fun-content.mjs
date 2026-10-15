// ════════════════════════════════════════════════════════════════════════
// tests/w0f-fun-content.mjs — THE W0 "FUN LIST" CONTENT RULES (2026-10-10)
//
// Game-designer ruling, coherence audit 2026-10-09. One guard for the data
// half of lane w0f, so every new source and every new use is held to a rule:
//
//   (crop)   every CROPS row grants 42x its b226 base (14 x the W0 x3), and the
//            staged migration moves hr_crops.xp to EXACTLY those numbers.
//   (trophy) each boss trophy exists and its wall line is words, not numbers.
//            (The (forge) rule, the trophy's dungeon source and the champion's
//            "never on the bounty board" check left with crafted gear, the
//            dungeons and the bounty board in the 2026-10-14 demolition.)
//   (champ)  one champion per tier 1-5, flagged champion, never a boss, the
//            roster audit clean; its relic is the LAST row, flagged champion,
//            in the rare band, the relic's ONLY source anywhere (no shop, boss,
//            recipe or other monster); expected hours at the tier's
//            loadout are in [1, 4] with no death in the measured hour; the
//            relic adds <= 5% of the gp midpoint per kill in vendor value.
//   (sql)    the staged migration names every new item, slot pair, activity
//            and bounty-monster row with the values the data derives (the
//            literal-drift half; the executed half is the migration's own §2).
//
// Run GREEN:  node tests/w0f-fun-content.mjs
// Prove RED:  node tests/w0f-fun-content.mjs --selftest
// NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { CROPS } from '../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ITEM_DESC } from '../src/data/item-descriptions.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { BOSSES } from '../src/data/bosses.js';
import { BOSS_TROPHIES, bossTrophiesHeld } from '../src/data/boss-forge.js';
import { CHAMPION_ITEMS, CHAMPION_BY_TIER } from '../src/data/champions.js';
import { auditRoster, TIER_BANDS } from '../src/data/monster-classes.js';
import { DROP_BAND_MAX, effectiveDropChance } from '../src/core/drops.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { createRng } from '../src/core/rng.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import {
  playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats,
  swingIntervalMs, DEFAULT_PROFILE,
} from '../src/core/combat.js';
import { COMBAT_STYLES } from '../src/core/styles.js';
import { xpForLevel } from '../src/core/xp.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { huntOn } from './hunt-fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_FILE = join(ROOT, 'supabase', 'migrations', '2026-10-16-w0f-fun-content.sql');

let fails = [];
const ok = (cond, rule, msg) => { if (!cond) fails.push(`(${rule}) ${msg}`); };

/* ── the ruled constants ────────────────────────────────────────────────── */
const CROP_BASE = Object.freeze({ turnip: 8, carrot: 12, wheat: 18, potato: 25, tomato: 35, pumpkin: 60,
  goldenroot: 85, emberfruit: 120, moonbloom: 170 });
const CROP_MULT = 42;
const HOURS_MIN = 1;
const HOURS_MAX = 4;
const FAUCET_SHARE = 0.05;
const SEED = 20261010;
const LOADOUT = Object.freeze({
  1: { level: 8, metal: 'bronze' }, 2: { level: 20, metal: 'iron' }, 3: { level: 33, metal: 'steel' },
  4: { level: 48, metal: 'mithril' }, 5: { level: 63, metal: 'rune' },
});

const mentions = (v, id) => {
  if (v === id) return true;
  if (Array.isArray(v)) return v.some((x) => mentions(x, id));
  if (v && typeof v === 'object') return Object.keys(v).some((k) => k === id || mentions(v[k], id));
  return false;
};
const allRecipes = () => Object.values(ARTISAN_RECIPES).flat();

function equipmentFor(tier) {
  const m = LOADOUT[tier].metal;
  return { weapon: `${m}_sword`, helmet: `${m}_helm`, body: `${m}_platebody`, pants: `${m}_platelegs`,
    gloves: `${m}_gauntlets`, boots: `${m}_boots` };
}
/* One fed hour at the tier loadout, through the one engine: a training hunt
   (one foe, the real respawn), fed from the bag (lucky-finds.mjs's
   measurement, verbatim in shape; tests/hunt-fixture.mjs). */
function fight(monsters, monsterId) {
  const m = monsters[monsterId];
  const L = LOADOUT[m.tier].level;
  const EQ = equipmentFor(m.tier);
  const skills = { attack: xpForLevel(L), strength: xpForLevel(L), defense: xpForLevel(L),
    hitpoints: xpForLevel(Math.max(10, L)) };
  const maxHp = Math.max(10, L);
  const eq = equipmentStats(EQ, ITEMS);
  const style = COMBAT_STYLES.controlled || Object.values(COMBAT_STYLES)[0];
  const state = { activeMonster: monsterId, monsterHp: m.hp, monsterMaxHp: m.hp,
    playerHp: maxHp, playerMaxHp: maxHp, gold: 0, skills, stats: {}, inventory: {} };
  const ctx = {
    fromMs: 0, toMs: 3600000, tickMs: swingIntervalMs(eq, style),
    monsters, items: ITEMS, bonus: () => 0, style, activeBuffCount: 0,
    playerRolls: (mm) => playerCombatRolls(mm, { eq, equipment: EQ, items: ITEMS, skills, bonus: () => 0,
      profile: DEFAULT_PROFILE, style }),
    monsterRolls: (mm) => monsterCombatRolls(mm, { eq, skills, bonus: () => 0 }),
    weakness: (mm) => weaknessInfo(mm, eq),
  };
  huntOn(state, ctx, { seed: SEED, fromMs: 0, food: 'cooked_shark', foodQty: 100000 });
  const out = simulateSpan(state, ctx);
  return { kills: out.kills, deaths: out.deaths };
}

/* ── the checks ─────────────────────────────────────────────────────────── */
function checkCrops(crops, sql) {
  for (const [id, base] of Object.entries(CROP_BASE)) {
    const c = crops[id];
    ok(!!c, 'crop', `${id}: missing from CROPS`);
    if (!c) continue;
    ok(c.xp === base * CROP_MULT, 'crop', `${id}: xp ${c.xp}, the ruling is ${base} x ${CROP_MULT} = ${base * CROP_MULT}`);
    ok(new RegExp(`\\('${id}',\\s*${c.xp}\\)`).test(sql), 'sql', `${id}: the migration does not move hr_crops.xp to ${c.xp}`);
  }
  ok(Object.keys(crops).length === Object.keys(CROP_BASE).length, 'crop',
    `CROPS has ${Object.keys(crops).length} rows, the ruling covers ${Object.keys(CROP_BASE).length} — a new crop needs a ruled base`);
}

function checkTrophies(items, trophies = BOSS_TROPHIES) {
  ok(trophies.length === 4, 'trophy', `the wall names ${trophies.length} boss trophies, the ruling names 4`);
  for (const t of trophies) {
    ok(!!items[t.item], 'trophy', `${t.item}: not an item`);
    ok(typeof t.line === 'string' && t.line.length > 10 && !/\d/.test(t.line), 'trophy', `${t.item}: the wall line must be words, no numbers`);
  }
  const held = bossTrophiesHeld({ warboss_standard: 1, dragon_relic: 0 }, { dragon_relic: 2, gold: 9 });
  ok(held.length === 2 && held.includes('warboss_standard') && held.includes('dragon_relic'), 'trophy',
    `bossTrophiesHeld must count bag + depot and ignore a zero stack, got ${JSON.stringify(held)}`);
}

function checkChampions(monsters, items, sql, { measure = true } = {}) {
  const lines = [];
  const roster = auditRoster(monsters);
  ok(roster.length === 0, 'champ', `auditRoster: ${roster.join(' | ')}`);
  const champs = Object.entries(monsters).filter(([, m]) => m.champion === true);
  ok(champs.length === 5, 'champ', `${champs.length} champions in the roster, the ruling names 5`);
  for (let t = 1; t <= 5; t++) {
    const mid = CHAMPION_BY_TIER[t];
    const m = monsters[mid];
    ok(!!m && m.champion === true && m.tier === t, 'champ', `tier ${t}: ${mid} is not a tier-${t} champion`);
    if (!m) continue;
    ok(!m.boss, 'champ', `${mid}: a champion is never a boss`);
    ok(m.hp > TIER_BANDS[t].hp[1], 'champ', `${mid}: hp ${m.hp} is not above the tier-${t} ceiling`);
    const last = m.drops[m.drops.length - 1];
    ok(!!last && last.champion === true, 'champ', `${mid}: the relic row must be LAST and flagged champion`);
    ok(m.drops.filter((d) => d.champion || d.lucky || d.salvage).length === 1, 'champ', `${mid}: exactly one server-revealed row`);
    if (!last) continue;
    const it = items[last.id];
    ok(!!it && !!CHAMPION_ITEMS[last.id], 'champ', `${mid}: relic ${last.id} is not a champion item`);
    if (!it) continue;
    ok(last.ch > 0 && last.ch <= DROP_BAND_MAX.rare, 'champ', `${mid}: relic ch ${last.ch} is not in the rare band`);
    ok(it.tier === t, 'champ', `${mid}: relic tier ${it.tier} is not ${t}`);
    ok(!it.bop, 'champ', `${mid}: a field relic is tradeable like every field drop`);
    ok(!!ITEM_DESC[last.id], 'champ', `${last.id}: no flavour line`);
    /* ONE SOURCE. */
    for (const [oid, om] of Object.entries(monsters)) {
      (om.drops || []).forEach((od) => { if (od.id === last.id && oid !== mid) ok(false, 'champ', `${last.id}: also drops from ${oid}`); });
    }
    ok(!SHOP_OFFERS.some((o) => (o.grant || []).some((g) => g.id === last.id)), 'champ', `${last.id}: is a shop grant`);
    ok(!mentions(BOSSES, last.id), 'champ', `${last.id}: is boss loot`);
    ok(!allRecipes().some((r) => r.output === last.id), 'champ', `${last.id}: is also crafted`);
    /* FAUCET. */
    const gpMid = (m.gp[0] + m.gp[1]) / 2;
    const perKill = last.ch * (m.dropBonus || 1) * vendorPriceOf(items, last.id);
    ok(perKill <= FAUCET_SHARE * gpMid, 'champ', `${mid}: relic adds ${perKill.toFixed(3)} g/kill, above 5% of gp mid ${gpMid}`);
    /* SQL rows. */
    ok(new RegExp(`\\["combat",\\s*"${mid}",\\s*${m.hp}\\]`).test(sql), 'sql', `${mid}: the migration has no combat row with max_hp ${m.hp}`);
    ok(new RegExp(`\\["${mid}",\\s*${t},\\s*${m.hp}\\]`).test(sql), 'sql', `${mid}: the migration has no hr_bounty_monsters row (${t}, ${m.hp})`);
    ok(new RegExp(`\\["${last.id}",\\s*"[^"]+",\\s*"${it.type}",\\s*${it.v},\\s*"${it.reqSkill}",\\s*${it.reqLv},\\s*true\\]`).test(sql),
      'sql', `${last.id}: the migration's hr_items row does not match the data`);
    /* HOURS, measured. */
    if (measure) {
      const got = fight(monsters, mid);
      ok(got.deaths === 0, 'champ', `${mid}: the measured hour at the tier loadout had ${got.deaths} death(s)`);
      const base = effectiveDropChance(last, { dropMult: m.dropBonus || 1 });
      const hrs = got.kills > 0 ? 1 / (got.kills * base) : Infinity;
      ok(hrs >= HOURS_MIN && hrs <= HOURS_MAX, 'champ', `${mid}: ${hrs.toFixed(2)} expected hours, outside [${HOURS_MIN}, ${HOURS_MAX}]`);
      lines.push(`  T${t} ${mid.padEnd(16)} ${last.id.padEnd(18)} 1 in ${String(Math.round(1 / base)).padStart(5)}  `
        + `${String(got.kills).padStart(4)} kills/h  ${hrs.toFixed(1)} h`);
    }
  }
  return lines;
}

function checkAll(over = {}) {
  fails = [];
  const monsters = over.monsters || MONSTERS;
  const items = over.items || ITEMS;
  const crops = over.crops || CROPS;
  const sql = over.sql != null ? over.sql : readFileSync(SQL_FILE, 'utf8');
  checkCrops(crops, sql);
  checkTrophies(items, over.trophies);
  const lines = checkChampions(monsters, items, sql, { measure: over.measure !== false });
  return { fails: fails.slice(), lines };
}

/* ── THE MUTATION PROOF ─────────────────────────────────────────────────── */
const cloneMonsters = () => {
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) out[id] = { ...m, drops: (m.drops || []).map((d) => ({ ...d })) };
  return out;
};
const MUTATIONS = {
  crop_back_to_x14:   { rule: 'crop',  over: () => ({ crops: { ...CROPS, turnip: { ...CROPS.turnip, xp: 112 } }, measure: false }) },
  sql_crop_stale:     { rule: 'sql',   over: () => ({ sql: readFileSync(SQL_FILE, 'utf8').replace(/\('moonbloom',\s*7140\)/g, "('moonbloom', 2380)"), measure: false }) },
  trophy_line_number: { rule: 'trophy', over: () => ({ trophies: BOSS_TROPHIES.map((t, i) => (i ? t : { ...t, line: 'Hung over the door 3 times.' })), measure: false }) },
  champion_is_boss:   { rule: 'champ', over: () => { const ms = cloneMonsters(); ms.old_tusker.boss = true; return { monsters: ms, measure: false }; } },
  relic_ch_x20:       { rule: 'champ', over: () => { const ms = cloneMonsters(); const d = ms.mire_witch.drops; d[d.length - 1].ch *= 20; return { monsters: ms }; } },
  relic_second_source:{ rule: 'champ', over: () => { const ms = cloneMonsters(); ms.goblin.drops.push({ id: 'tusker_charm', ch: .0005 }); return { monsters: ms, measure: false }; } },
  relic_not_last:     { rule: 'champ', over: () => { const ms = cloneMonsters(); ms.barrow_king.drops.unshift(ms.barrow_king.drops.pop()); return { monsters: ms, measure: false }; } },
  champion_too_strong:{ rule: 'champ', over: () => { const ms = cloneMonsters(); ms.gnoll_packlord.atk = 40; return { monsters: ms, measure: false }; } },
  champion_not_a_step:{ rule: 'champ', over: () => { const ms = cloneMonsters(); ms.old_tusker.hp = 16; return { monsters: ms, measure: false }; } },
  sql_no_combat_row:  { rule: 'sql',   over: () => ({ sql: readFileSync(SQL_FILE, 'utf8').replace(/\["combat",\s*"frost_jarl",\s*360\]/, '["combat", "frost_jarl", 999]'), measure: false }) },
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('w0f-fun-content --selftest: each mutation must turn the guard RED on its own rule');
  let bad = 0;
  for (const [name, mu] of Object.entries(MUTATIONS)) {
    const r = checkAll(mu.over());
    const onRule = r.fails.filter((f) => f.startsWith(`(${mu.rule})`));
    if (onRule.length) console.log(`  ${name}: RED on (${mu.rule}) — ${onRule[0]}`);
    else { bad++; console.error(`  x ${name}: not RED on (${mu.rule}); fails were: ${r.fails.join(' | ') || 'none'}`); }
  }
  const clean = checkAll();
  if (clean.fails.length) { bad++; console.error(`  x clean tree: RED — ${clean.fails.join(' | ')}`); }
  else console.log('  clean tree: GREEN (negative control)');
  if (bad) { console.error(`\n${bad} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
}

const res = checkAll();
if (res.fails.length) {
  for (const f of res.fails) console.error(`  FAIL  ${f}`);
  console.error(`\nw0f-fun-content: ${res.fails.length} assertion(s) FAILED.`);
  if (res.lines.length) console.error(res.lines.join('\n'));
  process.exit(1);
}
console.log(`w0f-fun-content: crops x${CROP_MULT}, ${BOSS_TROPHIES.length} wall trophies, `
  + `5 champions — every rule holds (fed hour, seed ${SEED}, Controlled)\n${res.lines.join('\n')}`);
process.exit(0);
