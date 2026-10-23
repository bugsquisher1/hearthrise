// tests/hunt-core/ranger-bar.mjs — FREMULON'S BAR, BROWSER CLOSED (Andy 2026-10-23: "the ranger abilities are not
// firing"). Run by run-all.mjs.
//
//   fremulon-hour   live v0.2.35, 43 min watched: a Level 46 Ranger (Shortbow, NO ammo worn) with an L41 sword
//                   tank in Mosslight Glade. His bar: Hunter's Mark, Flame Volley (store Fire Rune), Precision
//                   Shot, then attack slots Copper Whetstone, Barbed Arrows, Bronze Arrows, Iron Bolts, three Melee
//                   spells and three foods. The server's tally: 4,334 damage, all `basic`; 1,012 Copper Whetstones
//                   spent (a bow loosed them, one a shot, from slot 6); his 2,600 Bronze Arrows never touched.
//                   One hour of that exact setup on the real settle (play-ground.mjs: the hr-accrue accrueHunt the
//                   world tick runs, ten-minute windows, nobody watching): no whetstone is ever shot, his arrows are,
//                   and Precision Shot, Hunter's Mark and Flame Volley all cast on their lane.
//   client-words    the bar and Configure action say why such a slot never fires (the engine's rule, in words).
//
// The viewed half (the browser's engine predicts the same casts and shots, every commit matching):
// tests/hunt-live.mjs LV-RANGER.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* The live rows (production read, Coordinator 2026-10-23 ~19:35 UTC), as the server stored them. */
const atk = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and' });
const ab = (id, store) => ({ action: { type: 'ability', id, ...(store ? { store } : {}) }, conditions: [], join: 'and' });
const eat = (id, below) => ({ action: { type: 'consume', id }, conditions: [{ op: 'lt', value: below, metric: 'self_hp_pct' }], join: 'and' });
const FREMULON = Object.freeze({
  equipment: { belt: 'bronze_belt', weapon: 'shortbow', cape: 'traveler_cape', ring1: 'copper_ring', gloves: 'leather_gloves', earrings: 'copper_studs',
    necklace: 'hunter_necklace', boots: 'boarhide_boots', body: 'leather_body', pants: 'studded_pants', helmet: 'leather_helmet', ring2: 'copper_ring' },
  bag: { bronze_arrows: { loaded: 2600 }, cooked_shrimp: { loaded: 25 }, copper_whetstone: { loaded: 2350 }, steel_whetstone: { loaded: 1340 } },
  bar: [ab('hunters_mark'), ab('flame_volley', 'plain_fire_rune'), ab('precision_shot'), null, null, atk('copper_whetstone'), atk('barbed_arrows'),
    atk('bronze_arrows'), null, atk('iron_bolts'), null, null, ab('cleave'), ab('power_strike'), ab('flame_strike', 'plain_fire_rune'),
    eat('salted_shark', 30), eat('salted_swordfish', 40), eat('salted_lobster', 50), null, null],
  options: { chase: true, stance: 'offensive', distance: 3, target_mode: 'follow' },
});
const HANK = Object.freeze({ equipment: { weapon: 'steel_sword', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
  bag: { cooked_shrimp: { loaded: 200 } }, bar: [ab('challenge'), ab('power_strike'), eat('salted_shrimp', 60)] });

/** One hour of Fremulon + Hank on `P` (a play runner): what the Ranger cast, shot, spent and dealt. */
function fremulonHour(P) {
  const casts = {}, shots = {}, dmg = {}, uses = {}, buys = {};
  let unit = null;
  const x = P.run('mosslight_glade', [46, 41], ['ranger', 'tank'], {
    spanMs: 3600000,
    equipment: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).equipment)),
    bag: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).bag)),
    bar: (role) => JSON.parse(JSON.stringify((role === 'ranger' ? FREMULON : HANK).bar)),
    options: (role) => (role === 'ranger' ? { ...FREMULON.options } : {}),
    onWindow: (out) => {
      const r = out.members.find((p) => p.key === 'ranger0');
      if (!r) return;
      if (Number.isInteger(r.hunt.unit_id)) unit = r.hunt.unit_id;
      for (const e of out.events || []) {
        if (e.u !== unit) continue;
        if (e.type === 'cast') casts[e.ability] = (casts[e.ability] || 0) + 1;
        if (e.type === 'shot') shots[e.item] = (shots[e.item] || 0) + 1;
        if (e.type === 'dmg') dmg[e.ability] = (dmg[e.ability] || 0) + e.amount;
      }
      for (const [id, n] of Object.entries(r.hunt.uses || {})) uses[id] = (uses[id] || 0) + n;
      for (const [id, n] of Object.entries(r.hunt.buys || {})) buys[id] = (buys[id] || 0) + n;
    },
  });
  return { x, casts, shots, dmg, uses, buys };
}

const ARROW = (id) => /_(arrows|bolts)$/.test(id);
function judge(r, quiet) {
  const shot = (pred) => Object.entries(r.shots).filter(([id]) => pred(id)).reduce((n, [, k]) => n + k, 0);
  const stones = Object.keys(r.uses).concat(Object.keys(r.shots)).filter((id) => /whetstone/.test(id));
  if (!quiet) {
    console.log('  fremulon-hour: Mosslight Glade, L46 Ranger + L41 sword tank, 1 h, browser closed: casts ' + JSON.stringify(r.casts)
      + '; shots ' + JSON.stringify(r.shots) + '; damage ' + JSON.stringify(r.dmg) + '; own spent ' + JSON.stringify(r.uses)
      + '; store ' + JSON.stringify(r.buys) + '; kills/h ' + r.x.kills + ', falls ' + r.x.falls);
  }
  if (r.x.falls || r.x.ended.length) return 'CONTROL: the hour did not run whole (' + r.x.ended.join(', ') + ', falls ' + r.x.falls + ')';
  if (!(r.x.kills >= 300)) return 'CONTROL: ' + r.x.kills + ' kills/h (no fight to measure)';
  if (stones.length) return 'a bow spent or shot a whetstone: own ' + JSON.stringify(r.uses) + ', shots ' + JSON.stringify(r.shots);
  if (shot(ARROW) < 300) return 'the Ranger shot ' + shot(ARROW) + ' arrows in an hour (want 300+)';
  for (const [id, min] of [['hunters_mark', 60], ['precision_shot', 60], ['flame_volley', 20]]) {
    if (!((r.casts[id] || 0) >= min)) return id + ' cast ' + (r.casts[id] || 0) + ' times in an hour (want ' + min + '+): ' + JSON.stringify(r.casts);
  }
  return (r.dmg.precision_shot || 0) > 0 ? null : 'Precision Shot dealt nothing: ' + JSON.stringify(r.dmg);
}

/* THE SCREEN SAYS WHY (Andy 2026-10-23: a whetstone attack slot looked ready on the bar). The bar's struck
   reason (action-facts.js reasonOf) and Configure action (weaponWarning, the Ammo run) read the engine's own rule
   (hunt-roles.js shootsItem): a Ranger's whetstone slot is struck in words, a rune slot names the weapons that
   shoot it, his arrows read ready; the Ammo run offers no whetstone and lists a rune LOCKED for a bow. */
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
async function clientWords(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const F = await imp('src/shell/action-facts.js'), T = await imp('src/shell/action-table.js');
  const set = { role: 'ranger', supplySource: 'mine', onEmpty: 'switch', store: [] };
  const slot = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and', usable: true, count: 5 });
  const stone = F.reasonOf(slot('copper_whetstone'), set, [{ id: 'copper_whetstone', qty: 5 }], null);
  if (!stone || !stone.strike || !/^A whetstone is not a shot/.test(stone.text)) return 'a bow\'s Copper Whetstone slot reads ' + JSON.stringify(stone);
  const rune = F.reasonOf(slot('fire_rune'), set, [{ id: 'fire_rune', qty: 5 }], null);
  if (!rune || !rune.strike || !/^Your weapon can’t shoot this\. .*Staff or Wand\.$/.test(rune.text)) return 'a bow\'s Fire Rune slot reads ' + JSON.stringify(rune);
  const arrows = F.reasonOf(slot('iron_arrows'), set, [{ id: 'iron_arrows', qty: 5 }], null);
  if (arrows) return 'a bow\'s Iron Arrows slot (5 carried) reads ' + JSON.stringify(arrows);
  if (!F.weaponWarning({ type: 'attack_with_item', id: 'copper_whetstone' }, 'ranger')) return 'Configure action says nothing about a whetstone attack slot';
  const run = T.tableOf('items', { role: 'ranger', bag: [], store: [] }).runs.find((r) => r.kind === 'ammo');
  const row = (id) => (run && run.rows.find((r) => r.action.id === id)) || null;
  const stones = (run ? run.rows : []).filter((r) => /whetstone/.test(r.action.id)).map((r) => r.action.id);
  if (stones.length) return 'the Ammo run offers a whetstone as a shot: ' + stones.join(', ');
  return row('iron_arrows') && !row('iron_arrows').locked && row('fire_rune') && row('fire_rune').locked ? null
    : 'the Ammo run for a bow: Iron Arrows ' + JSON.stringify(row('iron_arrows')) + ', Fire Rune ' + JSON.stringify(row('fire_rune'));
}

const R = makeReport('hunt-core/ranger-bar');
let why = null;
try { why = judge(fremulonHour(await loadPlay(ROOT)), false); } catch (e) { why = 'threw ' + (e && e.stack || e); }
R.ok(!why, 'fremulon-hour: ' + why);
let words = null;
try { words = await clientWords(ROOT); } catch (e) { words = 'threw ' + (e && e.stack || e); }
R.ok(!words, 'client-words: ' + words);
const CLIENT_MUTANTS = [
  { name: 'the bar shows a bow\'s whetstone slot as ready',
    edits: [['src/shell/action-facts.js', "  if (shot) return { code: 'weapon', text: shot, glyph: 'uiLock', strike: true };\n", '']] },
  { name: 'Configure action offers whetstones as shots',
    edits: [['src/shell/action-table.js', "r.kind === 'ammo' && roles.some((k) => shootsItem(k, ITEMS[r.id]))", "r.kind === 'ammo'"]] },
];
for (const mu of CLIENT_MUTANTS) {
  const p = plant(mu.edits, ['src']);
  try {
    let w = null;
    try { w = await clientWords(p.root); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by client-words (' + w + ')');
  } finally { p.done(); }
}

/* The rule's own proof: each half of the live bug, planted back, turns it red (live v0.2.35 is both at once). */
const MUTANTS = [
  { name: 'a bow shoots the whetstone an attack slot names (1,012 spent live)',
    edits: [['src/core/hunt/damage.js', '    if (!shootsItem(u.role, itemRow(h, id))) return null;\n', '']] },
  { name: 'a shot ability reads only the worn ammo (Precision Shot never cast live)',
    edits: [['src/core/hunt/abilities.js', "    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;", '    const id = h.ammo;']] },
];
for (const mu of MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let w = null;
    try { w = judge(fremulonHour(await loadPlay(p.root)), true); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('CONTROL') && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by fremulon-hour (' + w + ')');
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  2 cases, ' + (MUTANTS.length + CLIENT_MUTANTS.length) + ' mutants caught');
R.finish();
