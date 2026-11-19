#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/faction-ground-balance.mjs — EVERY GROUND AFTER KRELL PAYS ONE SIDE, AND EACH REGION OPENS AS MANY FOR ONE AS THE OTHER
//   (Tyler 2026-11-14: "each faction should get a benefit of killing their opposite hunting ground. So we need to make sure after krell
//   is killed, each new zone has equal amounts"; the board's "2026-11-14 The Morrow Hills" §6; src/data/factions.js factionGroundProblems).
//
//   node tests/faction-ground-balance.mjs           the guard
//   node tests/faction-ground-balance.mjs --mutate  every planted defect must turn it red, the clean arm green
//
// mutant-anchors: src/data/factions.js src/data/grounds/shape.js
//
//   FG-LIVE   the data holds the rule: every hunt row names a region, no ground before Krell pays a side, the rule's own rows are sound
//   FG-PLANT  the rule on a planted region after Krell (no such region is built yet, so the live arm alone could never fail on the count):
//             two grounds open, one a side, holds; one FLIPPED, a ground with no side, a pre-Krell ground that pays, a hall that pays a side
//             its ground doesn't, a region the kit disagrees with, and a join monster that is no boss are each refused by name; a staged
//             ground alone is no imbalance (a region opens its grounds in pairs, it may draft them one at a time)
//   FG-SHAPE  a pack's hunt row with no region, or a side that isn't one, is refused at load (shape.js definePack)
//   FG-EDGE   src/data/factions.js stays out of the hr-accrue bundle and the page's module list: the engine never reads a faction
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = sourceQuery(ROOT);
const DATA = pathToFileURL(join(ROOT, 'src/data') + '/').href;

/* A module of src/data, its text edited, loaded beside the real ones (its relative imports made absolute, the same instances the data
   uses). With no edit, the module itself. */
async function load(rel, edits = []) {
  if (!edits.length) return import(DATA + rel + V);
  let t = readFileSync(join(ROOT, 'src/data', rel), 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of edits) {
    if (!t.includes(a)) throw Object.assign(new Error(`mutant anchor not found in ${rel}: ${a.slice(0, 80)}`), { harness: true });
    t = t.replace(a, b);
  }
  const base = DATA + dirname(rel).replace(/^\.$/, '') + (dirname(rel) === '.' ? '' : '/');
  t = t.replace(/from '\.\/([^']+)'/g, (m, p) => `from '${base}${p}'`).replace(/from '\.\.\/([^']+)'/g, (m, p) => `from '${DATA}${p}'`);
  return import('data:text/javascript;base64,' + Buffer.from(t).toString('base64'));
}

/* THE PLANTED REGION: the road's next region after Krell, two grounds copied from a built one, one paying each side, both open. */
const NEXT = 'zz_next_region';
function planted(H, S, over = {}) {
  const like = H.HUNTS.find((h) => h.id === 'mosslight_glade');
  const sides = S.STANDING_SIDES;
  const g = (id, side, extra = {}) => ({ ...like, id, region: NEXT, standingFor: side, ...extra });
  const grounds = [...H.HUNTS, g('zz_ground_a', sides[0]), g('zz_ground_b', sides[1]), ...(over.grounds || [])];
  const rooms = [...H.CALLED_HUNTS, ...H.HALL_HUNTS, ...H.TRAINING_HUNTS, ...(over.rooms || [])];
  return { grounds: over.edit ? over.edit(grounds) : grounds, rooms, regions: [...S.REGIONS, NEXT], ...(over.ctx || {}) };
}

async function arms(F, S, H) {
  const bad = [];
  const sides = S.STANDING_SIDES;
  /* FG-LIVE */
  const live = F.factionGroundProblems();
  for (const p of live) bad.push('FG-LIVE ' + p);
  const rows = [...H.HUNTS, ...H.CALLED_HUNTS, ...H.HALL_HUNTS, ...H.TRAINING_HUNTS];
  if (rows.length < 12) bad.push(`FG-LIVE the data reads as ${rows.length} hunt rows: the read broke, not the rule`);
  const named = new Set(rows.map((h) => h.region));
  if (!S.REGIONS.every((r) => named.has(r))) bad.push('FG-LIVE a region names no hunt row: ' + S.REGIONS.filter((r) => !named.has(r)).join(', '));
  /* FG-PLANT: the clean plant holds */
  const clean = F.factionGroundProblems(planted(H, S));
  if (clean.length) bad.push('FG-PLANT the balanced region is refused: ' + clean.join('; '));
  const refused = (name, clause, over) => {
    const got = F.factionGroundProblems(planted(H, S, over));
    if (!got.some((p) => p.startsWith(clause))) bad.push(`FG-PLANT ${name} is not refused ${clause}: ${JSON.stringify(got).slice(0, 200)}`);
  };
  const flip = (id, side) => (gs) => gs.map((h) => (h.id === id ? { ...h, standingFor: side } : h));
  refused('one flipped ground', 'FG-EVEN', { edit: flip('zz_ground_b', sides[0]) });
  refused('a third ground for one side', 'FG-EVEN', { grounds: [{ ...H.HUNTS[0], id: 'zz_ground_c', region: NEXT, standingFor: sides[0] }] });
  refused('a post-Krell ground that pays no side', 'FG-FIELD', { edit: (gs) => gs.map((h) => (h.id === 'zz_ground_a' ? (({ standingFor, ...r }) => r)(h) : h)) });
  refused('a pre-Krell ground that pays a side', 'FG-FIELD', { edit: flip('mosslight_glade', sides[1]) });
  refused('a staged Barrow March ground that pays a side', 'FG-FIELD', { edit: flip('hasks_ford', sides[0]) });
  refused('a side that is no side', 'FG-SIDE', { edit: flip('zz_ground_a', 'the_crown') });
  refused('a hunt row with no region', 'FG-REGION', { edit: (gs) => gs.map((h) => (h.id === 'wickstead' ? { ...h, region: undefined } : h)) });
  refused('a training room with no region', 'FG-REGION', { rooms: [{ ...H.TRAINING_HUNTS[0], id: 'zz_yard', region: 'nowhere' }] });
  refused('a hall that pays a side its ground doesn\'t', 'FG-ROOM', { rooms: [{ ...H.HALL_HUNTS[0], id: 'zz_ground_a_hall', region: NEXT, standingFor: sides[1] }] });
  refused('a called room that pays a side', 'FG-ROOM', { rooms: [{ ...H.CALLED_HUNTS[0], id: 'zz_called', standingFor: sides[0] }] });
  refused('a ground the kit paints in another region', 'FG-KIT', { edit: (gs) => gs.map((h) => (h.id === 'the_slake' ? { ...h, region: 'greenhaven' } : h)) });
  refused('a join monster that is no boss', 'FG-JOIN', { ctx: { rules: { ...F.FACTION_RULES, joinAfter: 'rat' } } });
  refused('a join monster that does not exist', 'FG-JOIN', { ctx: { rules: { ...F.FACTION_RULES, joinAfter: 'zz_nobody' } } });
  refused('a piece that spells a hero\'s name', 'FG-RULES', { ctx: { outfits: { ...F.FACTION_OUTFITS, hollys_light: { side: sides[0], hours: 300 } } } });
  /* a staged ground alone is no imbalance */
  const staged = F.factionGroundProblems(planted(H, S, { grounds: [{ ...H.HUNTS[0], id: 'zz_ground_d', region: NEXT, standingFor: sides[0], staged: true }] }));
  if (staged.length) bad.push('FG-PLANT a staged third ground is refused: ' + staged.join('; '));
  /* FG-SHAPE */
  const pack = { id: 'zz_shape', status: 'staged', hunt: { region: S.REGIONS[0], name: 'x' }, ground: { map: 'm' }, map: { id: 'm' } };
  const throws = (p) => { try { S.definePack(p); return null; } catch (e) { return String(e.message); } };
  if (throws(pack)) bad.push('FG-SHAPE a sound pack is refused: ' + throws(pack));
  if (!/hunt\.region/.test(throws({ ...pack, hunt: { name: 'x' } }) || '')) bad.push('FG-SHAPE a pack with no region loads');
  if (!/hunt\.standingFor/.test(throws({ ...pack, hunt: { ...pack.hunt, standingFor: 'the_crown' } }) || '')) bad.push('FG-SHAPE a pack paying no side loads');
  if (throws({ ...pack, hunt: { ...pack.hunt, standingFor: sides[1] } })) bad.push('FG-SHAPE a pack paying a side is refused');
  return bad;
}

/* FG-EDGE: the engine's bundle and the page's module list never name the faction module. */
async function edge() {
  const bad = [];
  const { pack } = await import(pathToFileURL(join(ROOT, 'tools/pack-edge.mjs')).href);
  const { files, problems } = await pack('hr-accrue');
  if (problems && problems.length) bad.push('FG-EDGE pack-edge says: ' + problems.join('; ').slice(0, 200));
  const names = [...(files instanceof Map ? files.keys() : (files || []).map((f) => f.name || f.path || String(f)))];
  if (names.length < 20) bad.push(`FG-EDGE the bundle reads as ${names.length} files: the search broke, not the rule`);
  if (names.some((n) => /factions\.js$/.test(n))) bad.push('FG-EDGE src/data/factions.js entered the edge bundle');
  const page = readFileSync(join(ROOT, 'src/app/game-modules.js'), 'utf8');
  if (!page.includes('src/data/hunts.js')) bad.push('FG-EDGE the page\'s module list reads as empty: the read broke');
  if (page.includes('src/data/factions.js')) bad.push('FG-EDGE src/data/factions.js is on the page\'s module list');
  return bad;
}

async function run(edits = {}) {
  const S = await load('grounds/shape.js', edits.shape);
  const H = await import(DATA + 'hunts.js' + V);
  const F = await load('factions.js', edits.factions);
  return arms(F, { ...S }, H);
}

/* ── THE PLANTED DEFECTS: an edit of the rule's own source, loaded beside the data. Each must turn the guard red. ── */
export const MUTANTS = {
  even_unchecked: { why: 'a region may open one side\'s grounds only', factions: [["if (new Set(n).size > 1) out.push(", "if (false) out.push("]] },
  even_counts_staged: { why: 'a staged ground counts toward the balance', factions: [["h.region === reg && h.staged !== true", "h.region === reg"]] },
  field_post_krell: { why: 'a post-Krell ground may pay nobody', factions: [["if (pays(h) && !h.standingFor) out.push(", "if (false) out.push("]] },
  field_pre_krell: { why: 'a ground before Krell may pay a side', factions: [["if (!pays(h) && h.standingFor) out.push(", "if (false) out.push("]] },
  after_off_by_one: { why: 'the Barrow March counts as after Krell', factions: [["regions.indexOf(h.region) > after", "regions.indexOf(h.region) >= after"]] },
  region_unchecked: { why: 'a row may name no region', factions: [["if (!regions.includes(h.region)) out.push(`FG-REGION", "if (false) out.push(`FG-REGION"]] },
  hall_free: { why: 'a hall may pay a side its ground doesn\'t', factions: [["if (r.standingFor !== want) out.push(", "if (false) out.push("]] },
  kit_ignored: { why: 'a region kit may paint a ground of another region', factions: [["&& h.region !== reg) out.push(", "&& false) out.push("]] },
  join_any: { why: 'any monster opens joining', factions: [["if (!krell || krell.boss !== true) out.push(", "if (!krell) out.push("]] },
  names_allowed: { why: 'a piece may spell a hero\'s name', factions: [["if (/holly|harry/i.test(id)) out.push(", "if (false) out.push("]] },
  shape_no_region: { why: 'a pack loads with no region', shape: [["if (!REGIONS.includes(p.hunt.region)) no(", "if (false) no("]] },
  shape_any_side: { why: 'a pack loads paying no side', shape: [["if ('standingFor' in p.hunt && !STANDING_SIDES.includes(p.hunt.standingFor)) no(", "if (false) no("]] },
};

async function main() {
  const mutate = process.argv.includes('--mutate');
  let bad;
  try { bad = [...await run(), ...await edge()]; } catch (e) { console.error('faction-ground-balance HARNESS: ' + (e.stack || e)); process.exit(2); }
  if (!mutate) {
    if (bad.length) { console.error('faction-ground-balance RED:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('faction-ground-balance: every hunt row names its region, no ground before Krell pays a side, and a planted region after him holds the even rule (FG-LIVE, FG-PLANT, FG-SHAPE, FG-EDGE green)');
    return;
  }
  if (bad.length) { console.error('faction-ground-balance --mutate: the CLEAN arm is red, so no mutant verdict means anything:\n  ' + bad.join('\n  ')); process.exit(1); }
  let missed = 0;
  for (const [id, m] of Object.entries(MUTANTS)) {
    let got;
    try { got = await run(m); } catch (e) { if (e.harness) { console.error(`  HARNESS ${id}: ${e.message}`); process.exit(2); } got = ['threw: ' + e.message]; }
    console.log(`  ${got.length ? 'CAUGHT' : 'MISSED'} ${id} (${m.why})${got.length ? ': ' + got[0].slice(0, 110) : ''}`);
    if (!got.length) missed++;
  }
  if (missed) { console.error(`faction-ground-balance --mutate: ${missed} mutant(s) MISSED`); process.exit(1); }
  console.log(`faction-ground-balance --mutate: clean arm green, all ${Object.keys(MUTANTS).length} mutants caught`);
}

if (isMain(import.meta.url)) main();
