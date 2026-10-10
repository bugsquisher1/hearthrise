// ════════════════════════════════════════════════════════════════════════
// tests/w0f-fun-content.mjs — THE W0 "FUN LIST" CONTENT RULES (2026-10-10)
//
// Game-designer ruling, coherence audit 2026-10-09. One guard for the data
// half of lane w0f, so every new source and every new use is held to a rule:
//
//   (crop)   every CROPS row grants 42x its b226 base (14 x the W0 x3), and the
//            staged migration moves hr_crops.xp to EXACTLY those numbers.
//   (forge)  each of the three boss materials (Void Essence, Riftmaw Husk,
//            Elderscale Heart) is consumed by a recipe; each recipe output is
//            bind-on-pickup body armour of its line that BEATS its Dawnsteel
//            twin on defence and on the line's own stat, gates above it, and is
//            valued at no more than the twin x 1.1 (no new vendor route); every
//            input exists; the material really drops from the named dungeon.
//   (trophy) each boss trophy exists and drops from the dungeon its wall row
//            names (so "where from" can never lie).
//   (champ)  one champion per tier 1-5, flagged champion, never a boss, the
//            roster audit clean; its relic is the LAST row, flagged champion,
//            in the rare band, the relic's ONLY source anywhere (no dungeon,
//            shop, QM, boss or other monster); expected hours at the tier's
//            loadout are in [1, 4] with no death in the measured hour; the
//            relic adds <= 5% of the gp midpoint per kill in vendor value; the
//            bounty board never picks a champion over 2,000 seeded boards.
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
import { DUNGEONS, QM_STOCK } from '../src/data/dungeons.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { BOSSES } from '../src/data/bosses.js';
import { RAID_BOSSES } from '../src/data/raid-bosses.js';
import { BOSS_FORGE_ITEMS, BOSS_FORGE_RECIPES, BOSS_TROPHIES, bossTrophiesHeld } from '../src/data/boss-forge.js';
import { CHAMPION_ITEMS, CHAMPION_BY_TIER } from '../src/data/champions.js';
import { auditRoster, TIER_BANDS } from '../src/data/monster-classes.js';
import { DROP_BAND_MAX, effectiveDropChance } from '../src/core/drops.js';
import { pickBountyMonster } from '../src/core/bounty.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { createRng } from '../src/core/rng.js';
import {
  playerCombatRolls, monsterCombatRolls, weaknessInfo, equipmentStats,
  swingIntervalMs, DEFAULT_PROFILE,
} from '../src/core/combat.js';
import { COMBAT_STYLES } from '../src/core/styles.js';
import { xpForLevel } from '../src/core/xp.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_FILE = join(ROOT, 'supabase', 'migrations', '2026-10-16-w0f-fun-content.sql');

let fails = [];
const ok = (cond, rule, msg) => { if (!cond) fails.push(`(${rule}) ${msg}`); };

/* ── the ruled constants ────────────────────────────────────────────────── */
const CROP_BASE = Object.freeze({ turnip: 8, carrot: 12, wheat: 18, potato: 25, tomato: 35, pumpkin: 60,
  goldenroot: 85, emberfruit: 120, moonbloom: 170 });
const CROP_MULT = 42;
const FORGE = Object.freeze({
  elderscale_heart: { output: 'elderscale_platebody', twin: 'dawn_platebody', line: 'defB', dungeon: 'ancient_wyrm' },
  riftmaw_husk:     { output: 'riftmaw_carapace',     twin: 'voidhide_body',  line: 'rangeAtkB', dungeon: 'voidbringer' },
  void_essence:     { output: 'voidheart_robe',       twin: 'voidweave_body', line: 'magicAtkB', dungeon: 'voidbringer' },
});
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
const inputsOf = (r) => (r.inputs ? Object.keys(r.inputs) : [r.input].concat(Object.keys(r.secondary || {}))).filter(Boolean);

function equipmentFor(tier) {
  const m = LOADOUT[tier].metal;
  return { weapon: `${m}_sword`, helmet: `${m}_helm`, body: `${m}_platebody`, pants: `${m}_platelegs`,
    gloves: `${m}_gauntlets`, boots: `${m}_boots` };
}
/* One fed hour at the tier loadout, through the one engine (lucky-finds.mjs's
   measurement, verbatim in shape). */
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
    away: true, fromMs: 0, toMs: 3600000, tickMs: swingIntervalMs(eq, style),
    rng: createRng(SEED), monsters, items: ITEMS, bonus: () => 0, style, activeBuffCount: 0,
    playerRolls: (mm) => playerCombatRolls(mm, { eq, equipment: EQ, items: ITEMS, skills, bonus: () => 0,
      profile: DEFAULT_PROFILE, style }),
    monsterRolls: (mm) => monsterCombatRolls(mm, { eq, skills, bonus: () => 0 }),
    weakness: (mm) => weaknessInfo(mm, eq),
    botdFor: () => ({ killBonuses: () => ({ dropMult: 1, xpMult: 1 }) }),
    fx: { autoEat() { if (state.playerHp < state.playerMaxHp * 0.5) { state.playerHp = state.playerMaxHp; return true; } return false; } },
  };
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

function checkForge(items, recipes, dungeons, sql) {
  for (const [mat, f] of Object.entries(FORGE)) {
    const consumers = recipes.filter((r) => inputsOf(r).includes(mat));
    ok(consumers.length >= 1, 'forge', `${mat}: no recipe consumes it — a boss material that crafts nothing`);
    const r = recipes.find((x) => x.output === f.output);
    ok(!!r && inputsOf(r).includes(mat), 'forge', `${f.output}: no recipe forges it from ${mat}`);
    const it = items[f.output];
    const tw = items[f.twin];
    ok(!!it && !!tw, 'forge', `${f.output} or its twin ${f.twin} is missing from ITEMS`);
    if (!it || !tw || !r) continue;
    ok(it.bop === true, 'forge', `${f.output}: boss gear must be bind-on-pickup`);
    ok(it.slot === tw.slot && it.armourClass === tw.armourClass, 'forge', `${f.output}: not the same slot/line as ${f.twin}`);
    ok((it.defB || 0) > (tw.defB || 0), 'forge', `${f.output}: defB ${it.defB} does not beat ${f.twin}'s ${tw.defB}`);
    ok((it[f.line] || 0) >= (tw[f.line] || 0), 'forge', `${f.output}: ${f.line} ${it[f.line]} is below ${f.twin}'s ${tw[f.line]}`);
    ok(it.reqSkill === 'defense' && it.reqLv > tw.reqLv, 'forge', `${f.output}: gate ${it.reqSkill} ${it.reqLv} is not above ${f.twin}'s ${tw.reqLv}`);
    ok(it.v <= Math.round(tw.v * 1.1), 'forge', `${f.output}: value ${it.v} is above ${f.twin} x 1.1 (${Math.round(tw.v * 1.1)})`);
    ok(!!ITEM_DESC[f.output], 'forge', `${f.output}: no flavour line`);
    for (const inp of inputsOf(r)) ok(!!items[inp], 'forge', `${r.id}: input ${inp} is not an item`);
    ok(r.req >= 1 && r.req <= 99, 'forge', `${r.id}: bench level ${r.req} outside 1..99`);
    const dg = dungeons[f.dungeon];
    ok(!!dg && mentions(dg.loot, mat), 'forge', `${mat}: does not drop from ${f.dungeon}`);
    ok(new RegExp(`\\["${f.output}",\\s*"[^"]+",\\s*"armor",\\s*${it.v},\\s*"defense",\\s*${it.reqLv},\\s*false\\]`).test(sql),
      'sql', `${f.output}: the migration's hr_items row does not match the data (armor/${it.v}/defense ${it.reqLv}/untradeable)`);
    ok(new RegExp(`\\["artisan",\\s*"${r.id}",\\s*"[a-z]+",\\s*${r.req}\\]`).test(sql), 'sql', `${r.id}: the migration has no artisan row at ${r.req}`);
  }
}

function checkTrophies(items, dungeons) {
  ok(BOSS_TROPHIES.length === 4, 'trophy', `the wall names ${BOSS_TROPHIES.length} boss trophies, the ruling names 4`);
  for (const t of BOSS_TROPHIES) {
    ok(!!items[t.item], 'trophy', `${t.item}: not an item`);
    ok(!!dungeons[t.dungeon] && mentions(dungeons[t.dungeon].loot, t.item), 'trophy', `${t.item}: does not drop from ${t.dungeon}`);
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
    ok(!Object.values(DUNGEONS).some((dg) => mentions(dg.loot, last.id)), 'champ', `${last.id}: is dungeon loot`);
    ok(!QM_STOCK.some((q) => q.id === last.id), 'champ', `${last.id}: is Quartermaster stock`);
    ok(!SHOP_OFFERS.some((o) => (o.grant || []).some((g) => g.id === last.id)), 'champ', `${last.id}: is a shop grant`);
    ok(!mentions(BOSSES, last.id) && !mentions(RAID_BOSSES, last.id), 'champ', `${last.id}: is boss/raid loot`);
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
  /* THE BOARD. */
  let picked = 0;
  for (let s = 0; s < 2000; s++) {
    const rng = createRng(SEED + s);
    const tier = 1 + (s % 5);
    const mode = ['normal', 'safe', 'interesting'][s % 3];
    const id = pickBountyMonster(tier, mode, [], monsters, rng);
    if (monsters[id] && monsters[id].champion) picked++;
  }
  ok(picked === 0, 'champ', `the bounty board picked a champion ${picked} time(s) in 2,000 boards`);
  return lines;
}

function checkAll(over = {}) {
  fails = [];
  const monsters = over.monsters || MONSTERS;
  const items = over.items || ITEMS;
  const crops = over.crops || CROPS;
  const recipes = over.recipes || allRecipes();
  const dungeons = over.dungeons || DUNGEONS;
  const sql = over.sql != null ? over.sql : readFileSync(SQL_FILE, 'utf8');
  checkCrops(crops, sql);
  checkForge(items, recipes, dungeons, sql);
  checkTrophies(items, dungeons);
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
  husk_crafts_nothing:{ rule: 'forge', over: () => ({ recipes: allRecipes().filter((r) => r.id !== 'craft_riftmaw_carapace'), measure: false }) },
  forge_not_bop:      { rule: 'forge', over: () => ({ items: { ...ITEMS, voidheart_robe: { ...ITEMS.voidheart_robe, bop: false } }, measure: false }) },
  forge_sidegrade:    { rule: 'forge', over: () => ({ items: { ...ITEMS, elderscale_platebody: { ...ITEMS.elderscale_platebody, defB: 90 } }, measure: false }) },
  forge_overvalued:   { rule: 'forge', over: () => ({ items: { ...ITEMS, riftmaw_carapace: { ...ITEMS.riftmaw_carapace, v: 200000 } }, measure: false }) },
  trophy_moved:       { rule: 'trophy', over: () => {
    const d = { ...DUNGEONS, goblin_warcamp: { ...DUNGEONS.goblin_warcamp, loot: (DUNGEONS.goblin_warcamp.loot || []).filter((x) => x.id !== 'warboss_standard') } };
    return { dungeons: d, measure: false };
  } },
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
console.log(`w0f-fun-content: crops x${CROP_MULT}, 3 boss-forge recipes, ${BOSS_TROPHIES.length} wall trophies, `
  + `5 champions — every rule holds (fed hour, seed ${SEED}, Controlled)\n${res.lines.join('\n')}`);
process.exit(0);
