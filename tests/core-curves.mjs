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
// AND THE ENVELOPE'S OWN LEVEL (lane/c-level-from-server): the client draws the
// Level from hr_state_of's `level` block { xp, level, into, need } and works
// none of it out, so that block is held to hr_char_level / hr_char_xp_for_level
// at 0, one XP under and on every boundary, and deep into the curve, with the
// Level the vitals are worked from beside it (readEnvelopeLevels).
//
//   node tests/core-curves.mjs              compare; exit 1 on any mismatch
//   node tests/core-curves.mjs --selftest   each planted drift must be named (JS drifts, then
//                                           drifts planted in the database's envelope)
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import * as XP from '../src/core/xp.js';
import * as VIT from '../src/core/vitals.js';
import { SKILLS_DEF } from '../src/data/skills.js';
import { MONSTERS, monsterLevelOf } from '../src/data/monsters.js';

const LEVELS = [...Array.from({ length: 120 }, (_, i) => i + 1), 150, 199, 200, 201, 250, 300, 400];
/* the character's Level curve also past them: its late brackets' edges and deep into the last one (it runs forever) */
const CHAR_LEVELS = [...LEVELS, 299, 301, 500, 750, 1000, 2500, 10000];
const COMBAT = Object.keys(SKILLS_DEF).filter((k) => SKILLS_DEF[k].cat === 'combat');
const CAPPED = Object.keys(SKILLS_DEF).filter((k) => SKILLS_DEF[k].cat !== 'combat').slice(0, 2);

/* A CALLED ROW HAS NO SERVER LEVEL (src/data/boss-calls.js): tools/catalogue-rows.mjs gives it no hr_activities row, so no
   combat pointer, fight clamp or renown `is_boss` join names it (live-settlement SETTLE-1c), and hr_monster_level reads 0. The
   one server reader, the settle's Defense bound, is then 0 in a called room, which pays nothing on any route (hunt-rewards.js
   calledSwing). The engine's own level for him (mitigation) never crosses to the server. */
const serverLevelOf = (id) => (MONSTERS[id].called === true ? 0 : monsterLevelOf(MONSTERS[id]));

/* The JS half, as one object, so --selftest can hand a drifted copy to the same comparison. */
const JS = Object.freeze({
  charXp: XP.charXpForLevel, charLevel: XP.charLevelFromXp,
  skillXp: XP.skillXpForLevel, skillLevel: XP.skillLevelFromXp,
  maxHp: VIT.maxHpFor, maxMana: VIT.maxManaFor, regen: VIT.regenPermille,
  monster: serverLevelOf,
});

/** Read every SQL value once (one round trip per family). */
async function readSql(db) {
  const one = async (sql, args) => (await db.query(sql, args)).rows;
  const lv = LEVELS;
  const out = {};
  out.charXp = await one('select l, public.hr_char_xp_for_level(l)::text as v from unnest($1::int[]) l', [CHAR_LEVELS]);
  const xs = [];
  for (const l of CHAR_LEVELS) { const x = XP.charXpForLevel(l); xs.push(x - 1, x, x + 1); }
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
  out.env = await readEnvelopeLevels(db);
  return out;
}

/* ── THE ENVELOPE'S OWN LEVEL (lane/c-level-from-server) ───────────────────────────────────────────────────
   The client draws the Level, the XP ring and every Level gate from hr_state_of's `level` block and works none of it out
   (src/session/character-sections.js levelOf; on 2026-11-10 its own copy of the curve said Level 20 for a hero the server
   fought as 19). So the block IS the contract, and it is held here against the server's own curve functions: one probe
   hero is set to each XP in ENV_XP and its whole envelope read back. */
const ENV_HERO = '1e0e1000-0000-4000-8000-0000000c0de5';
/* 0; every Level's boundary up to 60 and each curve bracket's first Level, one XP under it and on it; deep Levels; a huge one. */
const ENV_XP = (() => {
  const at = new Set([0, 1]);
  const edges = [...Array.from({ length: 59 }, (_, i) => i + 2), ...XP.levelCurveRows().map((r) => r.from), 120, 150, 299, 300, 301, 1000];
  for (const l of edges) { const x = XP.charXpForLevel(l); if (x > 0) at.add(x - 1); at.add(x); }
  at.add(XP.charXpForLevel(1000) + 123456789);
  at.add(XP.charXpForLevel(10000) + 987654321);   // about 1.6e14: deep in the last bracket, whole numbers still exact
  return [...at].sort((a, b) => a - b);
})();

/** One row per ENV_XP: what hr_state_of projected for a hero holding that Level XP, beside the server's curve functions' own answers. */
async function readEnvelopeLevels(db) {
  await db.exec(`insert into auth.users (id) values ('${ENV_HERO}') on conflict do nothing;
    insert into public.player_state (user_id, slot, version) values ('${ENV_HERO}', 0, 1) on conflict (user_id, slot) do nothing;
    create temp table if not exists hr_env_level_probe (x bigint primary key, env jsonb);
    truncate hr_env_level_probe;
    do $probe$
    declare v_x bigint;
    begin
      foreach v_x in array array[${ENV_XP.join(', ')}]::bigint[] loop
        update public.player_state set level_xp = v_x where user_id = '${ENV_HERO}' and slot = 0;
        insert into hr_env_level_probe values (v_x, public.hr_state_of('${ENV_HERO}', 0));
      end loop;
    end $probe$;`);
  return (await db.query(`select p.x::text as x, p.env->'level' as block, p.env->'vitals'->'level' as vitals, p.env->'state'->'level_xp' as state_xp,
           f.lv as fn, public.hr_char_xp_for_level(f.lv)::text as lo, public.hr_char_xp_for_level(f.lv + 1)::text as hi
      from hr_env_level_probe p cross join lateral (select public.hr_char_level(p.x) as lv) f order by p.x`)).rows;
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
  bad.push(...compareEnvelope(js, sql.env || []).slice(0, 12));
  return bad;
}

/** Every way the envelope's `level` block disagrees with the server's own curve functions (and the engine's), as strings. */
function compareEnvelope(js, rows) {
  const bad = [];
  if (rows.length !== ENV_XP.length) bad.push(`envelope: ${rows.length} of ${ENV_XP.length} probes read back`);
  for (const r of rows) {
    const x = Number(r.x), b = r.block, lo = Number(r.lo), hi = Number(r.hi);
    const at = `envelope at ${r.x} Level XP: `;
    if (!b || typeof b !== 'object') { bad.push(at + 'hr_state_of projects no `level` block (the client would draw no Level)'); continue; }
    if (b.level !== r.fn) bad.push(at + `the block says Level ${b.level}, hr_char_level ${r.fn}`);
    if (b.xp !== x || b.into !== x - lo || b.need !== hi - lo) bad.push(at + `the block is ${JSON.stringify(b)}, the curve functions give xp ${x}, into ${x - lo}, need ${hi - lo}`);
    if (!(b.need >= 1) || !(b.into >= 0) || !(b.into < b.need)) bad.push(at + `the block's marks do not hold the XP: into ${b.into} of ${b.need}`);
    if (r.vitals !== b.level) bad.push(at + `vitals (max HP and mana) are worked from Level ${r.vitals}, the block says ${b.level}`);
    if (r.state_xp !== x) bad.push(at + `state.level_xp is ${r.state_xp}`);
    if (js.charLevel(x) !== b.level) bad.push(at + `the engine's curve (src/core/xp.js) says Level ${js.charLevel(x)}, the block ${b.level}`);
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
  ['an unplaced monster reads its tier one higher', { monster: (m) => serverLevelOf(m) + (Number.isInteger(MONSTERS[m].level) ? 0 : 1) }],
  /* the called rows are compared exactly: one read at his engine level disagrees with the server's 0 (and an hr_activities row
     giving him one, the door SETTLE-1c forbids, disagrees the other way) */
  ['a called row is read at his engine level', { monster: (m) => monsterLevelOf(MONSTERS[m]) }],
];

/* hr_state_of's own text with one edit, re-created (the body is not restated here: whatever file last authored it is read from the catalogue). */
const patchStateOf = (from, to) => `do $plant$
declare v_def text := replace(pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure), chr(13), '');
begin
  if strpos(v_def, $a$${from}$a$) = 0 then raise exception 'core-curves --selftest: the hr_state_of anchor moved: ${from.replace(/'/g, "''")}'; end if;
  execute replace(v_def, $a$${from}$a$, $a$${to}$a$);
end $plant$;`;
/* Planted in the database, inside a transaction that is rolled back: [name, sql]. */
const ENV_MUTANTS = [
  ['the envelope reads the Level one XP late at each boundary', `create or replace function public.hr_level_block(p_xp bigint)
     returns jsonb language sql stable set search_path = public, pg_catalog as $f$
       select jsonb_build_object('xp', x, 'level', lv, 'into', x - public.hr_char_xp_for_level(lv),
                'need', public.hr_char_xp_for_level(lv + 1) - public.hr_char_xp_for_level(lv))
         from (select greatest(0, coalesce(p_xp, 0)) as x, public.hr_char_level(greatest(0, coalesce(p_xp, 0) - 1)) as lv) a $f$;`],
  ['the envelope\'s XP marks are the next Level\'s', `create or replace function public.hr_level_block(p_xp bigint)
     returns jsonb language sql stable set search_path = public, pg_catalog as $f$
       select jsonb_build_object('xp', x, 'level', lv, 'into', x - public.hr_char_xp_for_level(lv),
                'need', public.hr_char_xp_for_level(lv + 2) - public.hr_char_xp_for_level(lv + 1))
         from (select greatest(0, coalesce(p_xp, 0)) as x, public.hr_char_level(p_xp) as lv) a $f$;`],
  ['the envelope carries no level block', patchStateOf("'level', public.hr_level_block(v_st.level_xp),", '')],
  ['the envelope\'s Level is not the Level its vitals are worked from', patchStateOf("'level', public.hr_level_block(v_st.level_xp),", "'level', public.hr_level_block(v_st.level_xp + 100000),")],
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
    /* THE ENVELOPE ARM'S OWN DRIFTS, planted in the DATABASE (the block is the server's) and rolled back: each must be named. */
    for (const [name, plant] of ENV_MUTANTS) {
      await db.exec('begin');
      let said = [];
      try { await db.exec(plant); said = compareEnvelope(JS, await readEnvelopeLevels(db)); } finally { await db.exec('rollback'); }
      const caught = said.length > 0;
      console.log(`  ${caught ? 'ok  ' : 'MISS'} ${name}${caught ? ' (' + said.length + ' named: ' + said[0].slice(0, 110) + ')' : ' — nothing said'}`);
      if (!caught) missed++;
    }
    if (compareEnvelope(JS, await readEnvelopeLevels(db)).length) { console.error('core-curves --selftest: the envelope arm is red after its plants were rolled back'); missed++; }
    const total = MUTANTS.length + ENV_MUTANTS.length;
    console.log(missed ? `core-curves --selftest: ${missed} drift(s) not caught` : `core-curves --selftest: all ${total} drifts caught`);
    process.exit(missed ? 1 : 0);
  }
  const bad = compare(JS, sql);
  for (const b of bad) console.error('  ✗ ' + b);
  const n = sql.charXp.length + sql.charLevel.length + sql.skill.length + sql.vit.length * 2 + sql.regen.length + sql.monster.length + sql.env.length;
  console.log(bad.length ? `core-curves: ${bad.length} disagreement(s)` : `core-curves: JS and SQL agree on ${n} values`);
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
