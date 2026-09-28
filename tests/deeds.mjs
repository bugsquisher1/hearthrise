#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/deeds.mjs — DEEDS OF THE REALM ARE GRADED ON THE REALM'S COUNTS
//
//   node tests/deeds.mjs             gate
//   node tests/deeds.mjs --selftest  mutation proof (clean arm + one plant per id)
//
// src/data/deeds.js is the thirty-row catalogue the Achievements sheet grades
// through src/features/deeds.js (CLAUDE.md §6: every figure from its server
// owner, unknown is the pending dash). This guard ties the rows to the engine
// and keeps the client-kept unlock record from coming back.
//
//   DEED-1  30 unique ids; every group in DEED_GROUPS; every glyph an HR_GLYPHS
//           key (glyphs.js + glyphs-extra.js); every tally key in LIFETIME_KEYS;
//           every other source skill:highest | skill:minMelee | rooms:house |
//           monster:<a MONSTERS id>.
//   DEED-2  every tally key has a server writer: a `stat('<k>'` in hr-accrue
//           accrual.js, a BENCH_COUNTERS stats key, a SKILL_ACTION_STAT value,
//           or a `'stat', '<k>'` row in supabase/migrations/*.sql.
//   DEED-3  the retired ids (gold, food, streak) are absent; no source is 'streak'.
//   DEED-4  a target above 1 means {n} in the desc; a monster row says {monster};
//           house_all has a null target and {n}; no digit in any desc or lore
//           (names are exempt: '99 Club').
//   DEED-5  the lore: 100-140 chars, the LORE-4 charset (the innerHTML guard), no
//           digit, no trailing full stop, unique, no LORE-6 stat word, and no copy
//           of another lore, note or item line.
//   DEED-6  hr-accrue packs no deeds file and names none (class A).
//   DEED-7  legacy.js defines none of ACHIEVEMENTS, readPath, checkAchievements;
//           'achievements' is not in RESIDUE_FIELDS; no `G.achievements` in src
//           outside the smoke files; the deeds files read no residue counter and
//           no display (predicted) level.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';
import { labelValues } from './lore-notes.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CHARSET = /^[A-Za-z ,.;:'’!?—-]+$/u;
const EXTRA_VOCAB = ['xp', 'percent', 'damage', 'chance', 'bonus', 'crit', 'drop rate',
  'gold find', 'yield', 'speed'];
const RETIRED = ['gold_1k', 'gold_10k', 'gold_100k', 'gold_1m', 'food_100', 'streak_7', 'streak_30'];
const FIXED_SOURCES = ['skill:highest', 'skill:minMelee', 'rooms:house'];
const FORBIDDEN = ['G.stats', 'G.bountyHunter', 'G.bestiary', 'G.achievements', '_bestiary', 'getLevel(', 'ForDisplay('];
const NEW_FILES = ['src/data/deeds.js', 'src/features/deeds.js', 'src/render/achievements.js'];
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function check(d) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const ids = d.deeds.map((r) => r.id);
  const groups = new Set(d.groups.map((g) => g[0]));
  const lifetime = new Set(d.lifetimeKeys);
  const tallyKeys = [];

  if (ids.length !== 30) add('DEED-1', `${ids.length} deeds (want 30)`);
  if (new Set(ids).size !== ids.length) add('DEED-1', 'a deed id repeats');
  for (const r of d.deeds) {
    if (!groups.has(r.group)) add('DEED-1', `${r.id} is in group '${r.group}', which DEED_GROUPS does not list`);
    if (!d.glyphs.has(r.glyph)) add('DEED-1', `${r.id} glyph '${r.glyph}' is not an HR_GLYPHS key`);
    const src = String(r.source || '');
    if (src.startsWith('tally:')) {
      const k = src.slice(6);
      tallyKeys.push(k);
      if (!lifetime.has(k)) add('DEED-1', `${r.id} tallies '${k}', which is not in LIFETIME_KEYS`);
    } else if (src.startsWith('monster:')) {
      if (!d.monsterIds.includes(src.slice(8))) add('DEED-1', `${r.id} names monster '${src.slice(8)}', which MONSTERS does not list`);
    } else if (!FIXED_SOURCES.includes(src)) add('DEED-1', `${r.id} source '${src}' has no server owner`);

    const desc = String(r.desc || ''), lore = String(r.lore || '');
    if (r.target !== null && r.target > 1 && !desc.includes('{n}')) add('DEED-4', `${r.id} targets ${r.target} but its desc has no {n}`);
    if (src.startsWith('monster:') && !desc.includes('{monster}')) add('DEED-4', `${r.id} is a monster deed without {monster}`);
    if (/[0-9]/.test(desc)) add('DEED-4', `${r.id} desc contains a digit`);
    if (/[0-9]/.test(lore)) add('DEED-4', `${r.id} lore contains a digit`);
  }

  const writers = new Set([...d.accrualKeys, ...d.benchKeys, ...d.skillStatKeys, ...d.migrationKeys]);
  for (const k of new Set(tallyKeys)) if (!writers.has(k)) add('DEED-2', `tally '${k}' has no server writer`);

  for (const id of RETIRED) if (ids.includes(id)) add('DEED-3', `retired deed '${id}' is back`);
  for (const r of d.deeds) if (/streak/.test(String(r.source))) add('DEED-3', `${r.id} grades on a streak, which resets`);

  const house = d.deeds.find((r) => r.id === 'house_all');
  if (!house || house.target !== null || !String(house.desc).includes('{n}')) add('DEED-4', 'house_all must have a null target and {n} in its desc');

  const vocab = d.vocab.map((w) => [w, new RegExp(`(^|[^A-Za-z])${reEsc(w)}($|[^A-Za-z])`, 'i')]);
  const seen = new Map();
  const foreign = new Set(d.foreignLines);
  for (const r of d.deeds) {
    const s = typeof r.lore === 'string' ? r.lore : '';
    if (s.length < 100 || s.length > 140) add('DEED-5', `${r.id} lore is ${s.length} chars (want 100-140)`);
    if (!CHARSET.test(s)) add('DEED-5', `${r.id} lore has a character outside the charset`);
    if (/[0-9]/.test(s)) add('DEED-5', `${r.id} lore contains a digit`);
    if (s.endsWith('.')) add('DEED-5', `${r.id} lore ends in a full stop`);
    if (seen.has(s)) add('DEED-5', `${r.id} lore duplicates ${seen.get(s)}`);
    else seen.set(s, r.id);
    if (foreign.has(s)) add('DEED-5', `${r.id} lore copies another lore, note or item line`);
    for (const [w, re] of vocab) if (re.test(s)) add('DEED-5', `${r.id} lore uses the stat word "${w}"`);
  }

  for (const f of d.packedFiles) {
    if (/deeds/.test(String(f.origin || '')) || /deeds/.test(String(f.name || '')) || /data\/deeds|features\/deeds/.test(String(f.content || ''))) {
      add('DEED-6', `hr-accrue packs ${f.origin || f.name}, which names a deeds file — it must stay client-only`);
    }
  }

  for (const name of ['ACHIEVEMENTS', 'readPath', 'checkAchievements']) {
    const re = new RegExp(`(^|[^.\\w])(var|let|const|function)\\s+${name}\\b|window\\.${name}\\s*=[^=]`, 'm');
    if (re.test(d.legacy)) add('DEED-7', `src/legacy.js still defines ${name}`);
  }
  if (d.residueFields.includes('achievements')) add('DEED-7', "'achievements' is still in RESIDUE_FIELDS");
  for (const [p, text] of Object.entries(d.srcFiles)) {
    if (/\bG\.achievements\b/.test(text)) add('DEED-7', `${p} names G.achievements`);
  }
  for (const [p, text] of Object.entries(d.newFiles)) {
    for (const t of FORBIDDEN) if (text.includes(t)) add('DEED-7', `${p} reads ${t}`);
  }
  return problems;
}

const srcTree = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`;
  return e.isDirectory() ? srcTree(p) : (p.endsWith('.js') ? [p] : []);
});

function between(text, from, to) {
  const at = text.indexOf(from);
  if (at < 0) throw Object.assign(new Error(`${from} not found`), { harness: true });
  return text.slice(at, text.indexOf(to, at));
}

async function loadReal() {
  const { DEEDS, DEED_GROUPS } = await import('../src/data/deeds.js');
  const { LIFETIME_KEYS, LIFETIME_LORE } = await import('../src/data/lifetime-tally.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const { BENCH_COUNTERS } = await import('../src/core/artisan.js');
  const { SKILL_ACTION_STAT } = await import('../src/core/skill-sim.js');
  const lore = await import('../src/data/lore-notes.js');
  const home = await import('../src/data/homestead-lore.js');
  const charm = await import('../src/data/charm-lore.js');
  const { LUCKY_RUMOURS } = await import('../src/data/lucky-rumours.js');
  const { MONSTER_NOTES } = await import('../src/data/monster-notes.js');
  const { ITEM_DESC } = await import('../src/data/item-descriptions.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const packed = await pack('hr-accrue');
  const atlas = JSON.parse(read('src/data/glyphs.js').match(/window\.HR_GLYPHS\s*=\s*(\{.*?\});/s)[1]);
  const extra = [...between(read('src/data/glyphs-extra.js'), 'var EXTRA = {', '\n  };').matchAll(/^\s{4}([A-Za-z_]\w*)\s*:/gm)].map((m) => m[1]);
  const migrations = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
    .map((f) => read(`supabase/migrations/${f}`)).join('\n');
  const residue = between(read('src/net/client-state.js'), 'export const RESIDUE_FIELDS', ']);')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const maps = [lore.COMPANION_NOTES, lore.RANK_LORE, lore.TROPHY_LORE, home.ROOM_RUNG_LORE, home.PLOT_TIER_LORE,
    charm.CHARM_CLASS_LORE, charm.CHARM_RANK_LORE, LUCKY_RUMOURS, MONSTER_NOTES, ITEM_DESC, LIFETIME_LORE];
  return {
    deeds: DEEDS, groups: DEED_GROUPS, lifetimeKeys: [...LIFETIME_KEYS],
    glyphs: new Set([...Object.keys(atlas), ...extra]), monsterIds: Object.keys(MONSTERS),
    accrualKeys: [...read('supabase/functions/hr-accrue/accrual.js').matchAll(/\bstat\('([a-z_:]+)'/g)].map((m) => m[1]),
    benchKeys: Object.values(BENCH_COUNTERS).flatMap((b) => Object.keys(b.stats || {})),
    skillStatKeys: Object.values(SKILL_ACTION_STAT),
    migrationKeys: [...migrations.matchAll(/'stat',\s*'([a-z_:]+)'/g)].map((m) => m[1]),
    vocab: [...new Set([
      ...labelValues(read('src/render/companion-lines.js'), 'export const COMPANION_LABELS = {'),
      ...labelValues(read('src/features/homestead.js'), 'var KEY_LABEL = {'),
      ...EXTRA_VOCAB,
    ].map((w) => w.toLowerCase()))],
    foreignLines: maps.flatMap((m) => Object.values(m || {})),
    packedFiles: packed.files,
    legacy: read('src/legacy.js'),
    residueFields: [...residue.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    srcFiles: Object.fromEntries(srcTree('src')
      .filter((p) => !p.startsWith('src/features/smoke/') && !p.endsWith('/smoke-test.js'))
      .map((p) => [p, read(p)])),
    newFiles: Object.fromEntries(NEW_FILES.map((p) => [p, read(p)])),
  };
}

async function run() {
  const d = await loadReal();
  const problems = check(d);
  if (problems.length) {
    console.error(`  ✗ deeds: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ deeds: ${d.deeds.length} deeds each graded on a server count, lore clean, `
    + `not in the ${d.packedFiles.length}-file edge payload, no client unlock record left`);
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4): a clean arm, then one plant per DEED id,
   each of which must be caught by its OWN id. */
async function fixture() {
  const d = await loadReal();
  return Object.assign(d, {
    deeds: d.deeds.map((r) => Object.assign({}, r)),
    srcFiles: Object.assign({}, d.srcFiles),
    newFiles: Object.assign({}, d.newFiles),
    packedFiles: d.packedFiles.slice(),
    residueFields: d.residueFields.slice(),
  });
}

async function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(await fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.msg).join('; ') : ''}`);
  const row = (f, id) => f.deeds.find((r) => r.id === id);
  const arms = [
    ['a glyph the atlas does not draw', 'DEED-1', (f) => { row(f, 'dragon_slayer').glyph = 'dragon'; }],
    ['a tally key Pack 2 does not fold', 'DEED-1', (f) => { row(f, 'cook_100').source = 'tally:meals'; }],
    ['a tally key nothing on the server writes', 'DEED-2', (f) => { f.lifetimeKeys.push('buried_bones'); row(f, 'wood_500').source = 'tally:buried_bones'; }],
    ['the streak deed comes back', 'DEED-3', (f) => { f.deeds.push({ ...row(f, 'kill_50'), id: 'streak_7', source: 'streak.count' }); }],
    ['a desc with a hard number', 'DEED-4', (f) => { row(f, 'kill_250').desc = 'Slay 250 monsters'; }],
    ['a lore line with a stat word', 'DEED-5', (f) => { const r = row(f, 'fish_500'); r.lore = r.lore.replace('patient cast', 'speed cast'); }],
    ['hr-accrue packs the catalogue', 'DEED-6', (f) => { f.packedFiles.push({ name: 'vendor/data/deeds.js', origin: 'src/data/deeds.js', content: '' }); }],
    ['legacy keeps the unlock record', 'DEED-7', (f) => { f.srcFiles['src/legacy.js'] += '\nG.achievements = G.achievements || {};'; }],
    ['the watcher reads the display level', 'DEED-7', (f) => { f.newFiles['src/features/deeds.js'] += '\nconst lv = getLevel(id);'; }],
    ['achievements back in the residue', 'DEED-7', (f) => { f.residueFields.push('achievements'); }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = await fixture(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  console.log(bad ? `✗ deeds --selftest: ${bad} arm(s) wrong` : `✓ deeds --selftest: clean arm green, ${arms.length}/${arms.length} plants caught`);
  return bad ? 1 : 0;
}

const main = process.argv.includes('--selftest') ? selftest : run;
main().then((code) => process.exit(code), (e) => {
  console.error(`  ✗ deeds harness error: ${e && e.stack || e}`);
  process.exit(2);
});
