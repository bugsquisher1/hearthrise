#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/lore-notes.mjs — ONE LORE LINE PER COMPANION, RANK AND TROPHY STAGE
//
//   node tests/lore-notes.mjs             gate
//   node tests/lore-notes.mjs --selftest  mutation proof (clean arm + 10 plants)
//
// src/data/lore-notes.js is client-only display text. The Stable card, the
// renown ladder, the rank-up card and the Trophy Room render it as RAW HTML,
// so LORE-4's charset whitelist (no < > & or double quote) IS the innerHTML
// injection guard for those lines, not a style rule — keep it. LORE-6 keeps
// the lines lore rather than stats: no word from the UI's own bonus labels.
// LORE-7 keeps the file off the hr-accrue edge payload (class A).
// LORE-10/11: src/data/lucky-rumours.js keys every {lucky:true} drop, and no
// rumour names its monster's own weakness (any element, for a hiddenElement).
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
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

/* The FIELDNOTES-1 element synonyms (smoke/quests-chronicle-and-bonus.js). */
const SYN = {
  ember: /\b(ember\w*|fire\w*|flame\w*|burn\w*|blaz\w*|scorch\w*|smoulder\w*|heat|torch\w*|kindl\w*|candle\w*|lantern\w*)\b/i,
  frost: /\b(frost\w*|ice|icy|cold\w*|freez\w*|snow\w*|chill\w*|winter\w*|rime)\b/i,
  poison: /\b(poison\w*|venom\w*|toxi\w*|blight\w*)\b/i,
};

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
  keysEq('LORE-1', 'COMPANION_NOTES', Object.keys(d.companionNotes), d.companionIds);
  keysEq('LORE-2', 'RANK_LORE', Object.keys(d.rankLore), d.rankIds);
  keysEq('LORE-3', 'TROPHY_LORE', Object.keys(d.trophyLore), d.stageIds);
  keysEq('LORE-10', 'LUCKY_RUMOURS', Object.keys(d.luckyRumours), d.luckyDrops.map((r) => r.id));
  for (const r of d.luckyDrops) {
    const s = String(d.luckyRumours[r.id] || '');
    const els = r.hiddenElement ? Object.keys(SYN) : (SYN[r.elementWeak] ? [r.elementWeak] : []);
    for (const el of els) if (SYN[el].test(s)) add('LORE-11', `rumour ${r.id} names the ${el} element of ${r.mid}`);
  }

  const lines = [
    ...Object.entries(d.companionNotes).map(([k, v]) => [`companion ${k}`, v]),
    ...Object.entries(d.rankLore).map(([k, v]) => [`rank ${k}`, v]),
    ...Object.entries(d.trophyLore).map(([k, v]) => [`trophy ${k}`, v]),
    ...Object.entries(d.luckyRumours).map(([k, v]) => [`rumour ${k}`, v]),
  ];
  const vocab = d.vocab.map((w) => [w, new RegExp(`(^|[^A-Za-z])${reEsc(w)}($|[^A-Za-z])`, 'i')]);
  const seen = new Map();
  const foreign = new Set(d.foreignLines);
  for (const [where, line] of lines) {
    const s = typeof line === 'string' ? line : '';
    if (s.length < 100 || s.length > 140) add('LORE-4', `${where} is ${s.length} chars (want 100-140)`);
    if (!CHARSET.test(s)) add('LORE-4', `${where} has a character outside the charset: ${JSON.stringify(s)}`);
    if (/[0-9]/.test(s)) add('LORE-4', `${where} contains a digit`);
    if (s.endsWith('.')) add('LORE-4', `${where} ends in a full stop`);
    if (seen.has(s)) add('LORE-5', `${where} duplicates ${seen.get(s)}`);
    else seen.set(s, where);
    if (foreign.has(s)) add('LORE-5', `${where} copies a MONSTER_NOTES / ITEM_DESC line`);
    for (const [w, re] of vocab) if (re.test(s)) add('LORE-6', `${where} uses the stat word "${w}"`);
  }
  for (const f of d.packedFiles) {
    if (/lore-notes|lucky-rumours/.test(String(f.origin || '')) || /lore-notes|lucky-rumours/.test(String(f.content || ''))) {
      add('LORE-7', `hr-accrue packs ${f.origin || f.name}, which names lore-notes or lucky-rumours — client-only`);
    }
  }
  return problems;
}

async function loadReal() {
  let lore;
  try { lore = await import('../src/data/lore-notes.js'); }
  catch (e) { lore = { COMPANION_NOTES: {}, RANK_LORE: {}, TROPHY_LORE: {} }; }
  const { COMPANIONS } = await import('../src/data/companions.js');
  const { RENOWN_RANK_REWARDS } = await import('../src/data/renown-ranks.js');
  const { TROPHY_STAGES } = await import('../src/data/bestiary.js');
  const { MONSTER_NOTES } = await import('../src/data/monster-notes.js');
  const { LUCKY_RUMOURS } = await import('../src/data/lucky-rumours.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const luckyDrops = Object.entries(MONSTERS).flatMap(([mid, m]) => (m.drops || [])
    .filter((r) => r && r.lucky).map((r) => ({ id: r.id, mid, elementWeak: m.elementWeak, hiddenElement: !!m.hiddenElement })));
  const { ITEM_DESC } = await import('../src/data/item-descriptions.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  const packed = await pack('hr-accrue');
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const vocab = [...new Set([
    ...labelValues(read('src/render/companion-lines.js'), 'export const COMPANION_LABELS = {'),
    ...labelValues(read('src/features/homestead.js'), 'var KEY_LABEL = {'),
    ...EXTRA_VOCAB,
  ].map((w) => w.toLowerCase()))];
  return {
    companionNotes: lore.COMPANION_NOTES, rankLore: lore.RANK_LORE, trophyLore: lore.TROPHY_LORE,
    companionIds: Object.keys(COMPANIONS),
    rankIds: ['peasant', ...Object.keys(RENOWN_RANK_REWARDS)],
    stageIds: TROPHY_STAGES.map((r) => r.id),
    luckyRumours: LUCKY_RUMOURS, luckyDrops,
    foreignLines: [...Object.values(MONSTER_NOTES), ...Object.values(ITEM_DESC)],
    vocab, packedFiles: packed.files,
  };
}

async function run() {
  const d = await loadReal();
  const problems = check(d);
  const n = Object.keys(d.companionNotes).length + Object.keys(d.rankLore).length
    + Object.keys(d.trophyLore).length + Object.keys(d.luckyRumours).length;
  if (problems.length) {
    console.error(`  ✗ lore-notes: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  console.log(`✓ lore-notes: ${n} lines — companions, ranks, trophy stages and lucky finds covered, `
    + `${d.vocab.length} stat words absent, not in the ${d.packedFiles.length}-file edge payload`);
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4): a clean arm, then ten plants, each of
   which must be caught by its OWN LORE id. */
function fixture() {
  const L = (s) => s.padEnd(110, ' and the valley remembers it well');
  return {
    companionNotes: { fox: L('A fox keeps the camp'), owl: L('An owl keeps the late watch') },
    rankLore: { peasant: L('You own a bedroll'), serf: L('The steward knows your name') },
    trophyLore: { quarry: L('The first trophy goes up'), stalker: L('It knows you now') },
    companionIds: ['fox', 'owl'], rankIds: ['peasant', 'serf'], stageIds: ['quarry', 'stalker'],
    luckyRumours: { yew_bow: L('Drakes nest in the old groves'), fang_studs: L('Bats roost where trackers camped') },
    luckyDrops: [{ id: 'yew_bow', mid: 'drake', elementWeak: 'poison', hiddenElement: false },
      { id: 'fang_studs', mid: 'giant_bat', elementWeak: 'frost', hiddenElement: false }],
    foreignLines: ['A goblin measures a raid by what it carries home'],
    vocab: ['all xp', 'gather', 'speed', 'xp'],
    packedFiles: [{ name: 'index.ts', origin: 'supabase/functions/hr-accrue/index.ts', content: 'x' }],
  };
}

function selftest() {
  let bad = 0;
  const say = (ok, label) => { if (!ok) bad++; console.log(`  ${ok ? 'ok   ' : 'WRONG'}  ${label}`); };
  const clean = check(fixture());
  say(clean.length === 0, `clean arm: 0 problems${clean.length ? ' → ' + clean.map((p) => p.msg).join('; ') : ''}`);
  const arms = [
    ['drop a companion key', 'LORE-1', (f) => { delete f.companionNotes.owl; }],
    ['add an orphan rank', 'LORE-2', (f) => { f.rankLore.emperor = f.rankLore.serf.replace('steward', 'emperor'); }],
    ['drop a trophy stage', 'LORE-3', (f) => { delete f.trophyLore.stalker; }],
    ['add a digit', 'LORE-4', (f) => { f.companionNotes.fox = f.companionNotes.fox.replace('A fox', 'A fox 2'); }],
    ['duplicate a line', 'LORE-5', (f) => { f.rankLore.serf = f.rankLore.peasant; }],
    ['add a speed line', 'LORE-6', (f) => { f.trophyLore.quarry = f.trophyLore.quarry.replace('goes up', 'adds speed'); }],
    ['pack src/data/lore-notes.js', 'LORE-7', (f) => {
      f.packedFiles.push({ name: '_shared/lore-notes.js', origin: 'src/data/lore-notes.js', content: '' });
    }],
    ['drop the yew_bow rumour', 'LORE-10', (f) => { delete f.luckyRumours.yew_bow; }],
    ['put frost into giant_bat\'s rumour', 'LORE-11', (f) => {
      f.luckyRumours.fang_studs = f.luckyRumours.fang_studs.replace('Bats roost', 'Bats roost in frost');
    }],
    ['pack src/data/lucky-rumours.js', 'LORE-7', (f) => {
      f.packedFiles.push({ name: '_shared/lucky-rumours.js', origin: 'src/data/lucky-rumours.js', content: '' });
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
