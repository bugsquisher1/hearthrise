#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/lore-notes.mjs — ONE LORE LINE PER COMPANION, RANK, TROPHY STAGE,
//                        ROOM RUNG, FARM PLOT TIER, CHARM CLASS AND CHARM RANK
//
//   node tests/lore-notes.mjs             gate
//   node tests/lore-notes.mjs --selftest  mutation proof (clean arm + 15 plants)
//
// src/data/lore-notes.js is client-only display text. The Stable card, the
// renown ladder, the rank-up card and the Trophy Room render it as RAW HTML,
// so LORE-4's charset whitelist (no < > & or double quote) IS the innerHTML
// injection guard for those lines, not a style rule — keep it. LORE-6 keeps
// the lines lore rather than stats: no word from the UI's own bonus labels.
// LORE-7 keeps the file off the hr-accrue edge payload (class A).
// src/data/homestead-lore.js joins all of the above. LORE-11..13 tie it to
// the engine (ROOM_PERKS rungs, PLOT_TIERS unlocks); LORE-14 is the census:
// one tier builder, reading the SERVER plot tier (CLAUDE.md §6).
// src/data/charm-lore.js joins too: LORE-8 keys the class lines by the bane
// taxonomy (extra_dimensional), LORE-9 the rank lines by CHARM_RANKS ids.
// Every lore map is one row of the SETS table: {id, name, tag, map, wantKeys,
// band}. A new lore file is a new row, and it joins LORE-4/5/6 by being one.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* LORE-4: the charset is the injection guard (see header). */
const CHARSET = /^[A-Za-z ,.;:'’!?—-]+$/u;
const EXTRA_VOCAB = ['xp', 'percent', 'damage', 'chance', 'bonus', 'crit', 'drop rate',
  'gold find', 'yield', 'speed'];

/** The string values of an object literal `<decl> {…};` in source text. */
export function labelValues(srcText, decl) {
  const at = srcText.indexOf(decl);
  if (at < 0) throw Object.assign(new Error(`${decl} not found`), { harness: true });
  const body = srcText.slice(at, srcText.indexOf('};', at));
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

/* LORE-7: a packed origin or content naming any lore file fails. */
const LORE_FILE = /lore-notes|homestead-lore|charm-lore/;
const BAND = [100, 140];

/**
 * THE SETS TABLE — one row per lore map. `id` is the key check's LORE id,
 * `tag` prefixes a line's name in a finding, `band` is LORE-4's length range.
 */
export function buildSets(m) {
  return [
    { id: 'LORE-1', name: 'COMPANION_NOTES', tag: 'companion', map: m.companionNotes, wantKeys: m.companionIds, band: BAND },
    { id: 'LORE-2', name: 'RANK_LORE', tag: 'rank', map: m.rankLore, wantKeys: m.rankIds, band: BAND },
    { id: 'LORE-3', name: 'TROPHY_LORE', tag: 'trophy', map: m.trophyLore, wantKeys: m.stageIds, band: BAND },
    { id: 'LORE-11', name: 'ROOM_RUNG_LORE', tag: 'room', map: m.roomRungLore, wantKeys: m.roomRungKeys, band: BAND },
    { id: 'LORE-12', name: 'PLOT_TIER_LORE', tag: 'plot', map: m.plotLore,
      wantKeys: Array.from({ length: m.maxPlot }, (_, i) => String(i + 1)), band: BAND },
    { id: 'LORE-8', name: 'CHARM_CLASS_LORE', tag: 'charm class', map: m.charmClassLore, wantKeys: m.charmClassKeys, band: BAND },
    { id: 'LORE-9', name: 'CHARM_RANK_LORE', tag: 'charm rank', map: m.charmRankLore, wantKeys: m.charmRankIds, band: BAND },
  ];
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const sameSet = (a, b) => a.length === b.length && a.every((k) => b.includes(k));

/** Pure. Returns [{id, msg}] — empty is green. */
export function check(d) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const keysEq = (id, name, got, want) => {
    if (sameSet(got, want)) return;
    const miss = want.filter((k) => !got.includes(k));
    const extra = got.filter((k) => !want.includes(k));
    add(id, `${name} keys differ — missing [${miss}] extra [${extra}]`);
  };
  for (const set of d.sets) keysEq(set.id, set.name, Object.keys(set.map), set.wantKeys);

  const lines = d.sets.flatMap((set) => Object.entries(set.map).map(([k, v]) => [`${set.tag} ${k}`, v, set.band]));
  const vocab = d.vocab.map((w) => [w, new RegExp(`(^|[^A-Za-z])${reEsc(w)}($|[^A-Za-z])`, 'i')]);
  const seen = new Map();
  const foreign = new Set(d.foreignLines);
  for (const [where, line, [lo, hi]] of lines) {
    const s = typeof line === 'string' ? line : '';
    if (s.length < lo || s.length > hi) add('LORE-4', `${where} is ${s.length} chars (want ${lo}-${hi})`);
    if (!CHARSET.test(s)) add('LORE-4', `${where} has a character outside the charset: ${JSON.stringify(s)}`);
    if (/[0-9]/.test(s)) add('LORE-4', `${where} contains a digit`);
    if (s.endsWith('.')) add('LORE-4', `${where} ends in a full stop`);
    if (seen.has(s)) add('LORE-5', `${where} duplicates ${seen.get(s)}`);
    else seen.set(s, where);
    if (foreign.has(s)) add('LORE-5', `${where} copies a MONSTER_NOTES / ITEM_DESC line`);
    for (const [w, re] of vocab) if (re.test(s)) add('LORE-6', `${where} uses the stat word "${w}"`);
  }
  for (const f of d.packedFiles) {
    if (LORE_FILE.test(String(f.origin || '')) || LORE_FILE.test(String(f.content || ''))) {
      add('LORE-7', `hr-accrue packs ${f.origin || f.name}, which names a lore file — it must stay client-only`);
    }
  }
  const tiers = Array.from({ length: d.maxPlot }, (_, i) => String(i + 1));
  keysEq('LORE-12', 'PLOT_TIER_NAMES', Object.keys(d.plotNames), tiers);
  const plotLore = (d.sets.find((set) => set.id === 'LORE-12') || { map: {} }).map;
  const taken = new Set([...d.rungNames, ...d.tierNames].map((s) => s.toLowerCase()));
  const names = new Set();
  for (const [n, name] of Object.entries(d.plotNames)) {
    const s = typeof name === 'string' ? name : '';
    if (s.length < 3 || s.length > 32 || !/^[A-Za-z '’-]+$/.test(s)) add('LORE-12', `plot tier ${n} name ${JSON.stringify(s)} is not 3-32 letters`);
    if (names.has(s.toLowerCase())) add('LORE-12', `plot tier ${n} name "${s}" is not unique`);
    if (taken.has(s.toLowerCase())) add('LORE-12', `plot tier ${n} name "${s}" collides with a room rung or property tier`);
    names.add(s.toLowerCase());
  }
  const firstAt = (id) => tiers.find((n) => (d.plotUnlocks[n] || []).includes(id));
  for (const n of tiers) {
    const line = String(plotLore[n] || '').toLowerCase();
    for (const id of Object.keys(d.cropNames)) {
      const at = firstAt(id), nm = d.cropNames[id].toLowerCase();
      if (at === n && !line.includes(nm)) add('LORE-13', `plot tier ${n} line never names ${nm}, which that tier unlocks`);
      if (at && Number(at) > Number(n) && line.includes(nm)) add('LORE-13', `plot tier ${n} line names ${nm}, which unlocks at tier ${at}`);
    }
  }
  const c = d.census;
  const stray = c.plotReaders.filter((f) => f !== 'src/features/farm-progression.js');
  if (stray.length) add('LORE-14', `HearthriseLore.plot is read outside the one builder: ${stray}`);
  if (!/tierHeadHtml\(\)/.test(c.farmScreen)) add('LORE-14', 'src/screens/farm.js does not call tierHeadHtml()');
  if (!/tierHeadHtml\(\)/.test(c.legacy)) add('LORE-14', 'src/legacy.js does not call tierHeadHtml()');
  if (c.farmScreen.includes('Farm Plot <b>Lv')) add('LORE-14', "src/screens/farm.js still prints 'Farm Plot <b>Lv'");
  if (c.legacy.includes('<b>Farm Plot · Lv')) add('LORE-14', "src/legacy.js still prints '<b>Farm Plot · Lv'");
  const body = fnBody(c.farmProgression, 'tierHeadHtml');
  if (!body.includes('getServerPlotLevel')) add('LORE-14', 'tierHeadHtml() does not read getServerPlotLevel');
  if (/getPlotLevel/.test(body)) add('LORE-14', 'tierHeadHtml() reads getPlotLevel — the fallback that invents tier 1');
  return problems;
}

/** The brace-balanced body of `function <name>(` in source text ('' if absent). */
export function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  for (let i = open, depth = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

const between = (src, from, to) => {
  const a = src.indexOf(from);
  if (a < 0) throw Object.assign(new Error(`${from} not found`), { harness: true });
  return src.slice(a, src.indexOf(to, a));
};

async function loadReal() {
  let lore;
  try { lore = await import('../src/data/lore-notes.js'); }
  catch (e) { lore = { COMPANION_NOTES: {}, RANK_LORE: {}, TROPHY_LORE: {} }; }
  let home;
  try { home = await import('../src/data/homestead-lore.js'); }
  catch (e) { home = { ROOM_RUNG_LORE: {}, PLOT_TIER_NAMES: {}, PLOT_TIER_LORE: {} }; }
  let charm;
  try { charm = await import('../src/data/charm-lore.js'); }
  catch (e) { charm = { CHARM_CLASS_LORE: {}, CHARM_RANK_LORE: {} }; }
  const { MONSTER_CLASSES } = await import('../src/core/bane.js');
  const { CHARM_RANKS } = await import('../src/data/bestiary-charms.js');
  const { ROOM_PERKS } = await import('../src/data/perks.js');
  const { PLOT_TIERS, MAX_PLOT_LEVEL } = await import('../src/core/farm.js');
  const { CROPS } = await import('../src/data/gathering.js');
  const { COMPANIONS } = await import('../src/data/companions.js');
  const { RENOWN_RANK_REWARDS } = await import('../src/data/renown-ranks.js');
  const { TROPHY_STAGES } = await import('../src/data/bestiary.js');
  const { MONSTER_NOTES } = await import('../src/data/monster-notes.js');
  const { ITEM_DESC } = await import('../src/data/item-descriptions.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const packed = await pack('hr-accrue');
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const vocab = [...new Set([
    ...labelValues(read('src/render/companion-lines.js'), 'export const COMPANION_LABELS = {'),
    ...labelValues(read('src/features/homestead.js'), 'var KEY_LABEL = {'),
    ...EXTRA_VOCAB,
  ].map((w) => w.toLowerCase()))];
  const homestead = read('src/features/homestead.js');
  const legacy = read('src/legacy.js');
  const names = (text) => [...text.matchAll(/nm:\s*(['"])(.*?)\1/g)].map((m) => m[2]);
  const srcFiles = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? srcFiles(p) : (p.endsWith('.js') ? [p] : []);
  });
  /* The smoke suite calls HearthriseLore.plot to assert the data; it is not a renderer. */
  const plotReaders = srcFiles('src')
    .filter((p) => !p.startsWith('src/features/smoke') && !p.endsWith('/smoke-test.js'))
    .filter((p) => /HearthriseLore\s*\.\s*plot\b/.test(read(p)));
  return {
    sets: buildSets({
      companionNotes: lore.COMPANION_NOTES, companionIds: Object.keys(COMPANIONS),
      rankLore: lore.RANK_LORE, rankIds: ['peasant', ...Object.keys(RENOWN_RANK_REWARDS)],
      trophyLore: lore.TROPHY_LORE, stageIds: TROPHY_STAGES.map((r) => r.id),
      roomRungLore: home.ROOM_RUNG_LORE,
      roomRungKeys: Object.entries(ROOM_PERKS).flatMap(([id, rungs]) => rungs.map((_, i) => `${id}.${i + 1}`)),
      plotLore: home.PLOT_TIER_LORE, maxPlot: MAX_PLOT_LEVEL,
      /* The bane taxonomy is an ARRAY; the counters key on it, not on monster-classes.js. */
      charmClassLore: charm.CHARM_CLASS_LORE, charmClassKeys: [...MONSTER_CLASSES],
      charmRankLore: charm.CHARM_RANK_LORE, charmRankIds: CHARM_RANKS.map((r) => r.id),
    }),
    plotNames: home.PLOT_TIER_NAMES,
    maxPlot: MAX_PLOT_LEVEL, plotUnlocks: Object.fromEntries(PLOT_TIERS.map((t, n) => [String(n), t ? t.unlocks : []])),
    cropNames: Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [id, c.name])),
    rungNames: names(between(legacy, 'const ROOMS={', 'window.ROOMS = ROOMS')),
    tierNames: names(between(homestead, 'var TIERS = [', '\n  ];').replace(/\bname:/g, 'nm:')),
    census: {
      plotReaders, farmScreen: read('src/screens/farm.js'), legacy,
      farmProgression: read('src/features/farm-progression.js'),
    },
    foreignLines: [...Object.values(MONSTER_NOTES), ...Object.values(ITEM_DESC),
      ...[...between(homestead, 'var ROOM_META = {', 'var KEY_LABEL').matchAll(/flavour:\s*'([^']*)'/g)].map((m) => m[1])],
    vocab, packedFiles: packed.files,
  };
}

async function run() {
  const d = await loadReal();
  const problems = check(d);
  const n = d.sets.reduce((t, set) => t + Object.keys(set.map).length, 0);
  if (problems.length) {
    console.error(`  ✗ lore-notes: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ lore-notes: ${n} lines — ${d.sets.length} sets (${d.sets.map((s) => s.tag).join(', ')}) covered, `
    + `${d.vocab.length} stat words absent, not in the ${d.packedFiles.length}-file edge payload`);
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4): a clean arm, then fifteen plants, each of
   which must be caught by its OWN LORE id. */
function fixture() {
  const L = (s) => s.padEnd(110, ' and the valley remembers it well');
  const m = {
    companionNotes: { fox: L('A fox keeps the camp'), owl: L('An owl keeps the late watch') },
    rankLore: { peasant: L('You own a bedroll'), serf: L('The steward knows your name') },
    trophyLore: { quarry: L('The first trophy goes up'), stalker: L('It knows you now') },
    companionIds: ['fox', 'owl'], rankIds: ['peasant', 'serf'], stageIds: ['quarry', 'stalker'],
    roomRungLore: { 'kitchen.1': L('A flat stone by the fire'), 'kitchen.2': L('Iron that holds its heat') },
    roomRungKeys: ['kitchen.1', 'kitchen.2'],
    plotLore: { 1: L('A patch fit for turnips'), 2: L('Furrows for carrots and wheat') }, maxPlot: 2,
    charmClassLore: { undead: L('The dead remember'), extra_dimensional: L('They step in where the maps end') },
    charmClassKeys: ['undead', 'extra_dimensional'],
    charmRankLore: { studied: L('Your notes fill a page'), marked: L('They know your scent') },
    charmRankIds: ['studied', 'marked'],
  };
  const sets = buildSets(m);
  const set = (id) => sets.find((s) => s.id === id).map;
  return {
    sets, set,
    foreignLines: ['A goblin measures a raid by what it carries home'],
    vocab: ['all xp', 'gather', 'speed', 'xp'],
    packedFiles: [{ name: 'index.ts', origin: 'supabase/functions/hr-accrue/index.ts', content: 'x' }],
    plotNames: { 1: 'The Turnip Patch', 2: 'The Furrowed Field' },
    maxPlot: 2, plotUnlocks: { 1: ['turnip'], 2: ['turnip', 'carrot', 'wheat'] },
    cropNames: { turnip: 'Turnip', carrot: 'Carrot', wheat: 'Wheat' },
    rungNames: ['Hearthstone', 'Iron Stove'], tierNames: ["Wanderer's Camp"],
    census: {
      plotReaders: ['src/features/farm-progression.js'],
      farmScreen: '${window.HearthriseFarm.tierHeadHtml()}',
      legacy: '${window.HearthriseFarm.tierHeadHtml()}',
      farmProgression: 'function tierHeadHtml(){ var lv = window.HearthriseFarm.getServerPlotLevel(); }',
    },
  };
}

function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.msg).join('; ') : ''}`);
  const arms = [
    ['drop a companion key', 'LORE-1', (f) => { delete f.set('LORE-1').owl; }],
    ['add an orphan rank', 'LORE-2', (f) => { const r = f.set('LORE-2'); r.emperor = r.serf.replace('steward', 'emperor'); }],
    ['drop a trophy stage', 'LORE-3', (f) => { delete f.set('LORE-3').stalker; }],
    ['add a digit', 'LORE-4', (f) => { const c = f.set('LORE-1'); c.fox = c.fox.replace('A fox', 'A fox 2'); }],
    ['duplicate a line', 'LORE-5', (f) => { const r = f.set('LORE-2'); r.serf = r.peasant; }],
    ['add a speed line', 'LORE-6', (f) => { const t = f.set('LORE-3'); t.quarry = t.quarry.replace('goes up', 'adds speed'); }],
    ['pack src/data/lore-notes.js', 'LORE-7', (f) => {
      f.packedFiles.push({ name: '_shared/lore-notes.js', origin: 'src/data/lore-notes.js', content: '' });
    }],
    ['drop a rung key', 'LORE-11', (f) => { delete f.set('LORE-11')['kitchen.2']; }],
    ['name a tier Hearthstone', 'LORE-12', (f) => { f.plotNames[2] = 'Hearthstone'; }],
    ['tier-2 line without wheat', 'LORE-13', (f) => { const p = f.set('LORE-12'); p[2] = p[2].replace('wheat', 'barley'); }],
    ['builder reads getPlotLevel', 'LORE-14', (f) => {
      f.census.farmProgression = 'function tierHeadHtml(){ var lv = window.HearthriseFarm.getPlotLevel(); }';
    }],
    ['pack src/data/homestead-lore.js', 'LORE-7', (f) => {
      f.packedFiles.push({ name: '_shared/homestead-lore.js', origin: 'src/data/homestead-lore.js', content: '' });
    }],
    ['respell extra_dimensional as extradimensional', 'LORE-8', (f) => {
      const c = f.set('LORE-8'); c.extradimensional = c.extra_dimensional; delete c.extra_dimensional;
    }],
    ['add an orphan charm rank legend', 'LORE-9', (f) => {
      const r = f.set('LORE-9'); r.legend = r.marked.replace('scent', 'legend');
    }],
    ['pack src/data/charm-lore.js', 'LORE-7', (f) => {
      f.packedFiles.push({ name: '_shared/charm-lore.js', origin: 'src/data/charm-lore.js', content: '' });
    }],
  ];
  for (const [label, want, mutate] of arms) {
    const f = fixture(); mutate(f);
    const ids = new Set(check(f).map((p) => p.id));
    say(ids.has(want), `${label} → ${want}${ids.has(want) ? '' : ' (got ' + [...ids] + ')'}`);
  }
  console.log(bad ? `✗ lore-notes --selftest: ${bad} arm(s) wrong` : `✓ lore-notes --selftest: clean arm green, ${arms.length}/${arms.length} plants caught`);
  return bad ? 1 : 0;
}

const main = process.argv.includes('--selftest') ? async () => selftest() : run;
main().then((code) => process.exit(code), (e) => {
  console.error(`  ✗ lore-notes harness error: ${e && e.stack || e}`);
  process.exit(2);
});
