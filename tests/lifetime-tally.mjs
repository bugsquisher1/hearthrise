#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/lifetime-tally.mjs — THE HERO'S TALLY SHOWS ONLY THE REALM'S COUNTS
//
//   node tests/lifetime-tally.mjs             gate
//   node tests/lifetime-tally.mjs --selftest  mutation proof (clean arm + one plant per id)
//
// The Hero card, the Account grid, Lifetime Stats, the welcome card and the
// combat bar print lifetime counts from src/features/lifetime-tally.js, which
// folds the server's permanent `stat` rows (CLAUDE.md §6). This guard ties that
// list to the engine and keeps the client-kept figures from coming back.
//
//   TALLY-1  every LIFETIME_KEYS key has a server writer: a `stat('<key>'` in
//            hr-accrue accrual.js, a BENCH_COUNTERS stats key, a
//            SKILL_ACTION_STAT value, an ev:harvest/ev:planted
//            EVENT_COUNTER_PROJECTION row, or the bounty_turnins migration.
//   TALLY-2  every key the engine writes (accrual.js literals, BENCH_COUNTERS,
//            SKILL_ACTION_STAT) is in LIFETIME_KEYS or LIFETIME_SKIP.
//   TALLY-3  the three screens name no client-kept figure; the combat-bar chip
//            and the welcome row read HearthriseLifetime; no device play timer.
//   TALLY-4  the five lore lines: 100-140 chars, the LORE-4 charset (it is the
//            innerHTML guard), no digit, no full stop, no stat word, no copy.
//   TALLY-5  hr-accrue packs nothing that names lifetime-tally (class A).
//   TALLY-6  fold: a slot change resets, an older version is ignored, a
//            statement-free envelope returns the view by identity, a truncated
//            statement keeps a floor, and a present row never lowers.
//
// It imports NO tests/*.mjs: tests/lore-notes.mjs runs its own main and calls
// process.exit() when imported, which would end this process with ITS code.
// labelValues and the charset are copied here for that reason.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CHARSET = /^[A-Za-z ,.;:'’!?—-]+$/u;
const EXTRA_VOCAB = ['xp', 'percent', 'damage', 'chance', 'bonus', 'crit', 'drop rate',
  'gold find', 'yield', 'speed'];
const LORE_KEYS = ['fighting', 'kinds', 'gathering', 'bench', 'purse'];
const BAND = [100, 140];
const SCREENS = ['src/features/lifetime-tally.js', 'src/render/lifetime-stats.js', 'src/features/character-page.js'];
const FORBIDDEN = ['G.stats', 'stats.kills', 'stats?.kills', 'stats.deaths', 'totalGoldEarned', 'totalGoldSpent',
  'playMs', 'firstSeen', 'bestKillStreak', 'killStreak', 'forged', 'buriedBones', 'buffsConsumed',
  'killsByFamily', 'killsByTier', 'G.quests', 'bountyHunter.completed'];
const EV_ROWS = ['ev:harvest', 'ev:planted'];

/** The string values of an object literal `<decl> {…};` in source text. */
function labelValues(srcText, decl) {
  const at = srcText.indexOf(decl);
  if (at < 0) throw Object.assign(new Error(`${decl} not found`), { harness: true });
  const body = srcText.slice(at, srcText.indexOf('};', at));
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/* The fold fixtures TALLY-6 runs against whatever `fold` it is handed. */
const stat = (key, value) => ({ kind: 'stat', key, value, period: '' });
const env = (version, truncated, rows, state) => ({ version, progress_truncated: truncated, progress: rows, state: state || {} });
const kills = (v) => JSON.stringify(v && v.counts && v.counts.kills);
function foldProblems(fold) {
  const out = [];
  const exact = { slot: 0, version: 5, counts: { kills: { n: 900, exact: true } }, quests: null };
  const other = fold(exact, env(6, true, [stat('crits', 1)], { slot: 1 }), []);
  if (other && other.counts && other.counts.kills) out.push(`a slot change kept the other character's kills ${kills(other)}`);
  if (fold(exact, env(4, false, [stat('kills', 1)]), []) !== exact) out.push('an older version moved the view');
  if (fold(exact, { state: { recovering_until: null } }, []) !== exact) out.push('{state:{recovering_until:null}} did not return prev by identity');
  const floor = fold(exact, env(6, true, [stat('crits', 1)]), []);
  if (kills(floor) !== '{"n":900,"exact":false}') out.push(`a key missing from a truncated statement is not a floor: ${kills(floor)}`);
  const lower = fold(exact, env(6, true, [stat('kills', 400)]), []);
  if (!lower || !lower.counts.kills || lower.counts.kills.n !== 900) out.push(`a present row in a truncated statement lowered kills: ${kills(lower)}`);
  return out;
}

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(d) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });

  const writers = new Set([...d.accrualKeys, ...d.benchKeys, ...d.skillStatKeys, ...d.migrationKeys,
    ...d.evProjectionKeys.filter((k) => EV_ROWS.includes(k))]);
  for (const k of d.keys) if (!writers.has(k)) add('TALLY-1', `LIFETIME_KEYS '${k}' has no server writer`);

  const listed = new Set([...d.keys, ...Object.keys(d.skip)]);
  for (const k of new Set([...d.accrualKeys, ...d.benchKeys, ...d.skillStatKeys])) {
    if (!listed.has(k)) add('TALLY-2', `the engine writes stat '${k}', which is neither in LIFETIME_KEYS nor LIFETIME_SKIP`);
  }
  for (const [k, why] of Object.entries(d.skip)) if (!String(why || '').trim()) add('TALLY-2', `LIFETIME_SKIP '${k}' has no reason`);

  for (const [path, text] of Object.entries(d.screens)) {
    for (const t of FORBIDDEN) if (text.includes(t)) add('TALLY-3', `${path} names the client-kept '${t}'`);
  }
  for (const [what, lines] of Object.entries(d.legacyLines)) {
    if (!lines.length) add('TALLY-3', `src/legacy.js has no line with '${what}'`);
    for (const l of lines) {
      if (!l.includes('HearthriseLifetime') || l.includes('stats')) add('TALLY-3', `the '${what}' line does not read HearthriseLifetime alone: ${l.trim()}`);
    }
  }
  for (const p of d.playTimeHits) add('TALLY-3', `${p} still names tickPlayMs / HearthrisePlayTime`);

  const got = Object.keys(d.lore);
  if (got.length !== LORE_KEYS.length || !LORE_KEYS.every((k) => got.includes(k))) {
    add('TALLY-4', `LIFETIME_LORE keys are [${got}], want [${LORE_KEYS}]`);
  }
  const vocab = d.vocab.map((w) => [w, new RegExp(`(^|[^A-Za-z])${reEsc(w)}($|[^A-Za-z])`, 'i')]);
  const foreign = new Set(d.foreignLines);
  const seen = new Set();
  for (const [k, line] of Object.entries(d.lore)) {
    const s = typeof line === 'string' ? line : '';
    if (s.length < BAND[0] || s.length > BAND[1]) add('TALLY-4', `lore ${k} is ${s.length} chars (want ${BAND[0]}-${BAND[1]})`);
    if (!CHARSET.test(s)) add('TALLY-4', `lore ${k} has a character outside the charset: ${JSON.stringify(s)}`);
    if (/[0-9]/.test(s)) add('TALLY-4', `lore ${k} contains a digit`);
    if (s.endsWith('.')) add('TALLY-4', `lore ${k} ends in a full stop`);
    if (foreign.has(s) || seen.has(s)) add('TALLY-4', `lore ${k} copies another line`);
    seen.add(s);
    for (const [w, re] of vocab) if (re.test(s)) add('TALLY-4', `lore ${k} uses the stat word "${w}"`);
  }

  for (const f of d.packedFiles) {
    if (/lifetime-tally/.test(String(f.origin || '')) || /lifetime-tally/.test(String(f.content || ''))) {
      add('TALLY-5', `hr-accrue packs ${f.origin || f.name}, which names lifetime-tally — it must stay client-only`);
    }
  }

  for (const msg of foldProblems(d.fold)) add('TALLY-6', msg);
  return problems;
}

function srcFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? srcFiles(p) : (p.endsWith('.js') ? [p] : []);
  });
}

async function loadReal() {
  const data = await import('../src/data/lifetime-tally.js');
  const { fold } = await import('../src/features/lifetime-tally.js');
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
  const accrual = read('supabase/functions/hr-accrue/accrual.js');
  const accrue = read('src/net/accrue.js');
  const projAt = accrue.indexOf('export const EVENT_COUNTER_PROJECTION');
  if (projAt < 0) throw Object.assign(new Error('EVENT_COUNTER_PROJECTION not found'), { harness: true });
  const projection = accrue.slice(projAt, accrue.indexOf(']);', projAt));
  const migration = read('supabase/migrations/2026-09-19-lifetime-facts-off-the-ledger.sql');
  const legacyText = read('src/legacy.js').split('\n');
  const lines = (needle) => legacyText.filter((l) => l.includes(needle));
  const vocab = [...new Set([
    ...labelValues(read('src/render/companion-lines.js'), 'export const COMPANION_LABELS = {'),
    ...labelValues(read('src/features/homestead.js'), 'var KEY_LABEL = {'),
    ...EXTRA_VOCAB,
  ].map((w) => w.toLowerCase()))];
  const maps = [lore.COMPANION_NOTES, lore.RANK_LORE, lore.TROPHY_LORE, home.ROOM_RUNG_LORE, home.PLOT_TIER_LORE,
    charm.CHARM_CLASS_LORE, charm.CHARM_RANK_LORE, LUCKY_RUMOURS, MONSTER_NOTES, ITEM_DESC];
  return {
    keys: [...data.LIFETIME_KEYS], skip: data.LIFETIME_SKIP, lore: data.LIFETIME_LORE, fold,
    accrualKeys: [...accrual.matchAll(/\bstat\('([a-z_:]+)'/g)].map((m) => m[1]),
    benchKeys: Object.values(BENCH_COUNTERS).flatMap((b) => Object.keys(b.stats || {})),
    skillStatKeys: Object.values(SKILL_ACTION_STAT),
    evProjectionKeys: [...projection.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]),
    migrationKeys: [...migration.matchAll(/'stat',\s*'([a-z_:]+)'/g)].map((m) => m[1]),
    screens: Object.fromEntries(SCREENS.map((p) => [p, read(p)])),
    legacyLines: { 'ab-tkills': lines('ab-tkills'), 'Monsters slain, all time': lines('Monsters slain, all time') },
    playTimeHits: srcFiles('src')
      .filter((p) => !p.startsWith('src/features/smoke/') && !p.endsWith('/smoke-test.js'))
      .filter((p) => /tickPlayMs|HearthrisePlayTime/.test(read(p))),
    vocab,
    foreignLines: maps.flatMap((m) => Object.values(m || {})),
    packedFiles: packed.files,
  };
}

async function run() {
  const d = await loadReal();
  const problems = check(d);
  if (problems.length) {
    console.error(`  ✗ lifetime-tally: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ lifetime-tally: ${d.keys.length} keys each written by the server, ${Object.keys(d.lore).length} lore lines clean, `
    + `3 screens free of client-kept figures, not in the ${d.packedFiles.length}-file edge payload, fold fixtures green`);
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4): a clean arm, then one plant per TALLY id,
   each of which must be caught by its OWN id. */
async function fixture() {
  const { fold } = await import('../src/features/lifetime-tally.js');
  const L = (s) => s.padEnd(110, ' and the valley remembers it well');
  return {
    keys: ['kills', 'chopped', 'cooked', 'ev:planted', 'bounty_turnins'], skip: { refined: 'smithed + crafted' },
    lore: { fighting: L('The slate by the door'), kinds: L('A slate for every kind'), gathering: L('The woodpile counts'),
      bench: L('The bench remembers'), purse: L('Only what sits in the purse') },
    fold,
    accrualKeys: ['kills'], benchKeys: ['cooked', 'refined'], skillStatKeys: ['chopped'],
    evProjectionKeys: ['ev:harvest', 'ev:planted', 'ev:kill_any'], migrationKeys: ['bounty_turnins'],
    screens: { 'src/render/lifetime-stats.js': "row('Monsters slain', n('kills'))" },
    legacyLines: { 'ab-tkills': ["'<span class=\"ab-tkills\">'+window.HearthriseLifetime.markup('kills')"] },
    playTimeHits: [],
    vocab: ['speed', 'xp'], foreignLines: ['A goblin measures a raid by what it carries home'],
    packedFiles: [{ name: 'index.ts', origin: 'supabase/functions/hr-accrue/index.ts', content: 'x' }],
  };
}

async function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(await fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.msg).join('; ') : ''}`);
  const arms = [
    ['list a key nothing writes', 'TALLY-1', (f) => { f.keys.push('forged'); }],
    ['the engine writes an unlisted stat', 'TALLY-2', (f) => { f.accrualKeys.push('buried_bones'); }],
    ['the sheet reads G.stats.kills', 'TALLY-3', (f) => { f.screens['src/render/lifetime-stats.js'] += ' (G.stats.kills||0)'; }],
    ['the combat chip reads G.stats', 'TALLY-3', (f) => { f.legacyLines['ab-tkills'] = ["'<span class=\"ab-tkills\">'+(G.stats?.kills||0)"]; }],
    ['a device play timer comes back', 'TALLY-3', (f) => { f.playTimeHits.push('src/legacy.js'); }],
    ['a lore line gains a digit', 'TALLY-4', (f) => { f.lore.bench = f.lore.bench.replace('The bench', 'The 2 benches'); }],
    ['a lore line says speed', 'TALLY-4', (f) => { f.lore.purse = f.lore.purse.replace('sits in', 'speeds up the speed of'); }],
    ['hr-accrue packs the data file', 'TALLY-5', (f) => {
      f.packedFiles.push({ name: '_shared/lifetime-tally.js', origin: 'src/data/lifetime-tally.js', content: '' });
    }],
    ['fold keeps counts across a slot change', 'TALLY-6', (f) => {
      const real = f.fold;
      f.fold = (prev, res, ids) => real(prev, Object.assign({}, res, { state: Object.assign({}, res.state, { slot: undefined }) }), ids);
    }],
    ['fold lowers on a truncated row', 'TALLY-6', (f) => {
      const real = f.fold;
      f.fold = (prev, res, ids) => real(prev, Object.assign({}, res, { progress_truncated: res.progress_truncated === true ? false : res.progress_truncated }), ids);
    }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = await fixture(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  console.log(bad ? `✗ lifetime-tally --selftest: ${bad} arm(s) wrong` : `✓ lifetime-tally --selftest: clean arm green, ${arms.length}/${arms.length} plants caught`);
  return bad ? 1 : 0;
}

const main = process.argv.includes('--selftest') ? selftest : run;
main().then((code) => process.exit(code), (e) => {
  console.error(`  ✗ lifetime-tally harness error: ${e && e.stack || e}`);
  process.exit(2);
});
