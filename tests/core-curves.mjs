#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/core-curves.mjs — THE CORE MODEL'S CURVES AGREE IN JS AND POSTGRES.
//
// docs/design/CORE_MODEL.md: Level (kills only, endless), the combat skills'
// uncapped curve, the capped 99 curve of every other skill, max HP / max mana
// from Level and armour weight, Inner Flame's regen rate and the monsters' levels
// are computed in TWO places: src/core/xp.js + src/core/vitals.js (the edge
// engine and the browser's display) and the SQL twins of
// 2026-10-27-core-bodies.sql (hr_char_xp_for_level, hr_char_level,
// hr_skill_xp_for_level, hr_skill_level, hr_max_hp, hr_max_mana,
// hr_regen_permille, hr_monster_level). The server re-validates every hunt
// settle with the SQL half, so one integer of drift refuses a legitimate
// settle (or worse, admits a forged one). This guard replays the chain
// (PGlite) and compares every boundary value, exactly.
//
//   node tests/core-curves.mjs              compare; exit 1 on any mismatch
//   node tests/core-curves.mjs --selftest   each planted JS drift must be named
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import * as XP from '../src/core/xp.js';
import * as VIT from '../src/core/vitals.js';
import { SKILLS_DEF } from '../src/data/skills.js';
import { MONSTERS, monsterLevelOf } from '../src/data/monsters.js';

const LEVELS = [...Array.from({ length: 120 }, (_, i) => i + 1), 150, 199, 200, 201, 250, 300, 400];
const COMBAT = Object.keys(SKILLS_DEF).filter((k) => SKILLS_DEF[k].cat === 'combat');
const CAPPED = Object.keys(SKILLS_DEF).filter((k) => SKILLS_DEF[k].cat !== 'combat').slice(0, 2);

/* The JS half, as one object, so --selftest can hand a drifted copy to the same comparison. */
const JS = Object.freeze({
  charXp: XP.charXpForLevel, charLevel: XP.charLevelFromXp,
  skillXp: XP.skillXpForLevel, skillLevel: XP.skillLevelFromXp,
  maxHp: VIT.maxHpFor, maxMana: VIT.maxManaFor, regen: VIT.regenPermille,
  monster: (id) => monsterLevelOf(MONSTERS[id]),
});

/** Read every SQL value once (one round trip per family). */
async function readSql(db) {
  const one = async (sql, args) => (await db.query(sql, args)).rows;
  const lv = LEVELS;
  const out = {};
  out.charXp = await one('select l, public.hr_char_xp_for_level(l)::text as v from unnest($1::int[]) l', [lv]);
  const xs = [];
  for (const l of lv) { const x = XP.charXpForLevel(l); xs.push(x - 1, x, x + 1); }
  out.charLevel = await one('select x::text as x, public.hr_char_level(x) as v from unnest($1::bigint[]) x', [xs.filter((x) => x >= 0).map(String)]);
  out.skill = [];
  for (const s of [...COMBAT, ...CAPPED]) {
    const ls = lv.filter((l) => XP.isCapped(s) ? l <= XP.MAX_LEVEL : true);
    const r = await one('select l, public.hr_skill_xp_for_level($2, l)::text as v from unnest($1::int[]) l', [ls, s]);
    out.skill.push(...r.map((x) => ({ s, l: x.l, v: x.v })));
    const sx = [];
    for (const l of ls) { const x = XP.skillXpForLevel(s, l); sx.push(x - 1, x); }
    const rl = await one('select x::text as x, public.hr_skill_level($2, x) as v from unnest($1::bigint[]) x', [sx.filter((x) => x >= 0).map(String), s]);
    out.skill.push(...rl.map((x) => ({ s, x: x.x, lv: x.v })));
  }
  out.vit = await one(`select l, a, public.hr_max_hp(l, a) as hp, public.hr_max_mana(l, a) as mana
                         from unnest($1::int[]) l, generate_series(0, 6) a`, [lv]);
  out.regen = await one('select p, public.hr_regen_permille(p) as v from generate_series(0, 400) p');
  const ids = Object.keys(MONSTERS);
  out.monster = await one('select m, public.hr_monster_level(m) as v from unnest($1::text[]) m', [ids]);
  return out;
}

/** Every disagreement between `js` and the SQL rows, as strings. */
function compare(js, sql) {
  const bad = [];
  const push = (s) => { if (bad.length < 40) bad.push(s); };
  for (const r of sql.charXp) if (String(js.charXp(r.l)) !== r.v) push(`Level ${r.l}: JS needs ${js.charXp(r.l)} XP, SQL ${r.v}`);
  for (const r of sql.charLevel) if (js.charLevel(Number(r.x)) !== r.v) push(`${r.x} Level XP: JS Level ${js.charLevel(Number(r.x))}, SQL ${r.v}`);
  for (const r of sql.skill) {
    if (r.l !== undefined && String(js.skillXp(r.s, r.l)) !== r.v) push(`${r.s} ${r.l}: JS needs ${js.skillXp(r.s, r.l)} XP, SQL ${r.v}`);
    if (r.x !== undefined && js.skillLevel(r.s, Number(r.x)) !== r.lv) push(`${r.s} at ${r.x} XP: JS level ${js.skillLevel(r.s, Number(r.x))}, SQL ${r.lv}`);
  }
  for (const r of sql.vit) {
    if (js.maxHp(r.l, r.a) !== r.hp) push(`max HP at Level ${r.l}, ${r.a} heavy: JS ${js.maxHp(r.l, r.a)}, SQL ${r.hp}`);
    if (js.maxMana(r.l, r.a) !== r.mana) push(`max mana at Level ${r.l}, ${r.a} light: JS ${js.maxMana(r.l, r.a)}, SQL ${r.mana}`);
  }
  for (const r of sql.regen) if (js.regen(r.p) !== r.v) push(`regen at Inner Flame ${r.p}: JS ${js.regen(r.p)}, SQL ${r.v}`);
  for (const r of sql.monster) {
    const j = js.monster(r.m);
    if ((j ?? null) !== (r.v ?? null)) push(`monster ${r.m}: JS level ${j}, SQL ${r.v}`);
  }
  return bad;
}

/* Planted drifts: each must be named by compare(). */
const MUTANTS = [
  ['the Level curve\'s cubic term is 21', { charXp: (l) => XP.charXpForLevel(l) + (l - 1) ** 3 }],
  ['the Level is read one low at its boundary', { charLevel: (x) => XP.charLevelFromXp(Math.max(0, x - 1)) }],
  ['the skill curve grows 4.1% a level', { skillXp: (s, l) => (XP.isCapped(s) ? XP.skillXpForLevel(s, l) : Math.floor(XP.skillXpForLevel(s, l) * 1.001 ** l)) }],
  ['a capped skill walks the combat curve', { skillLevel: (s, x) => XP.skillLevelFromXp('melee', x) }],
  ['max HP adds 11 a Level', { maxHp: (l, a) => VIT.maxHpFor(l, a) + Math.max(0, l - 1) }],
  ['light armour adds nothing to mana', { maxMana: (l) => VIT.maxManaFor(l, 0) }],
  ['Inner Flame\'s regen k is 51', { regen: (p) => { const P = Math.max(1, p); return 1000 + Math.floor((1000 * P) / (P + 51)); } }],
  ['an unplaced monster reads its tier one higher', { monster: (m) => monsterLevelOf(MONSTERS[m]) + (Number.isInteger(MONSTERS[m].level) ? 0 : 1) }],
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    console.error('core-curves: HARNESS — the chain did not replay: ' + e.message);
    process.exit(2);
  }
  const sql = await readSql(db);
  if (process.argv.includes('--selftest')) {
    let missed = 0;
    if (compare(JS, sql).length) { console.error('core-curves --selftest: the clean JS already disagrees'); process.exit(1); }
    for (const [name, over] of MUTANTS) {
      const caught = compare({ ...JS, ...over }, sql).length > 0;
      console.log(`  ${caught ? 'ok  ' : 'MISS'} ${name}`);
      if (!caught) missed++;
    }
    console.log(missed ? `core-curves --selftest: ${missed} drift(s) not caught` : `core-curves --selftest: all ${MUTANTS.length} drifts caught`);
    process.exit(missed ? 1 : 0);
  }
  const bad = compare(JS, sql);
  for (const b of bad) console.error('  ✗ ' + b);
  const n = sql.charXp.length + sql.charLevel.length + sql.skill.length + sql.vit.length * 2 + sql.regen.length + sql.monster.length;
  console.log(bad.length ? `core-curves: ${bad.length} disagreement(s)` : `core-curves: JS and SQL agree on ${n} values`);
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
