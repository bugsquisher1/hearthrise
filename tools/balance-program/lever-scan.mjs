// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/lever-scan.mjs — EVERY LEVER THE DATA CARRIES, READ FROM src/data (balance guard line G14, lane L14).
//
// 30-plan section E, G14: "The lever list is closed: every XP, damage, drop, gold and time lever in the data is in model.mjs with a
// class". Two readers, so a lever cannot hide in a shape nobody listed:
//
//   CARRIERS  the known homes of a lever (a food's buff, a room rung, a jewel perk, a tier row, a session mode, a charm rank ...). Each
//             answers [key, row] pairs: the key is what model.mjs LEVER_KEYS classes, the row is the data row that carries it. A key with
//             no LEVER_KEYS entry and no NOT_LEVERS reason is a STRANGER.
//   SWEEP     every field in every src/data/*.js export whose NAME reads like a lever (xp, drop, gold, coin, luck, damage ... ending
//             Pm, Pct, Mult, Bonus, Boost, Permille, Rate, Factor, Scale, Fit), at its path with row tables collapsed to `*`. A path no
//             carrier claims and no SWEEP_NOT_LEVERS entry explains is a STRANGER too: the lever that arrived in a new file or field.
//
// `cut` and `dark` levers (model.mjs LEVER_CLASSES) are counted by row: the guard pins each count in tests/balance-guard.baseline.json
// and a count over its pin is red (a new XP food row), so a lever on its way out cannot grow on the way.
//
// PURE but for the module loads. `scanLevers(load)` takes the loader so --selftest can plant a row in a module's copy.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEVERS, LEVER_CLASSES, LEVER_KEYS } from './model.mjs';

const rowsOf = (t) => Object.entries(t || {}).filter(([, r]) => r && typeof r === 'object');
/* A sweep path pattern: dots are literal, `*` is one segment (a key, or a row table's collapsed `*`), a (a|b) group is kept. */
const pat = (s) => new RegExp('^' + s.replace(/\./g, '\\.').replace(/\*/g, '[\\w*]+') + '$');

/* THE CARRIERS. file: the src/data module; read(m): [[key, row id]]; claims: the SWEEP paths (regex on "<export>.<path>") this carrier
   accounts for, so its lever-named fields are not strangers. */
export const LEVER_CARRIERS = Object.freeze([
  { file: 'items.js', what: 'a meal\'s buff (ITEMS.*.buff.type)', claims: [],
    read: (m) => rowsOf(m.ITEMS).filter(([, r]) => r.buff && r.buff.type).map(([id, r]) => ['buff:' + r.buff.type, id]) },
  { file: 'perks.js', what: 'a room rung\'s perk (ROOM_PERK_KEYS)', claims: [],
    read: (m) => m.ROOM_PERK_KEYS.map((k) => ['room-perk:' + k, k]) },
  { file: 'jewelry.js', what: 'a jewel perk (JEWEL_PERKS)', claims: [],
    read: (m) => Object.keys(m.JEWEL_PERKS).map((k) => ['jewel-perk:' + k, k]) },
  { file: 'bestiary-charms.js', what: 'a charm rank\'s drop or damage multiplier (CHARM_RANKS)', claims: [],
    read: (m) => m.CHARM_RANKS.flatMap((r) => [...(r.drop > 1 ? [['charm:drop', r.id]] : []), ...(r.dmg > 1 ? [['charm:damage', r.id]] : [])]) },
  { file: 'bestiary.js', what: 'a trophy\'s or the memory\'s multiplier (MAX_TROPHY_*, MAX_MEMORY_DROP_MULT)', claims: [],
    read: (m) => [...(m.MAX_TROPHY_DROP_MULT > 1 ? [['trophy:drop', 'MAX_TROPHY_DROP_MULT']] : []), ...(m.MAX_TROPHY_DAMAGE_MULT > 1 ? [['trophy:damage', 'MAX_TROPHY_DAMAGE_MULT']] : []),
      ...(m.MAX_MEMORY_DROP_MULT > 1 ? [['memory:drop', 'MAX_MEMORY_DROP_MULT']] : [])] },
  { file: 'loot-bands.js', what: 'a band\'s studied boost (BAND_TARGETS.*.boostMax)', claims: [pat('BAND_TARGETS.*.boostMax')],
    read: (m) => rowsOf(m.BAND_TARGETS).filter(([, r]) => r.boostMax > 1).map(([b]) => ['band-boost:' + b, b]) },
  { file: 'monsters.js', what: 'a monster row\'s drop bonus (MONSTERS.*.dropBonus)', claims: [pat('MONSTERS.*.dropBonus')],
    read: (m) => rowsOf(m.MONSTERS).filter(([, r]) => Number(r.dropBonus) > 0 && Number(r.dropBonus) !== 1).map(([id]) => ['monster:dropBonus', id]) },
  { file: 'companions.js', what: 'a companion\'s bonus or proc (COMPANIONS.*.bonus, .proc)', claims: [],
    read: (m) => rowsOf(m.COMPANIONS).flatMap(([id, r]) => [...Object.keys(r.bonus || {}).map((k) => ['companion:bonus', id + '.' + k]), ...(r.proc ? [['companion:proc', id + '.' + r.proc.effect]] : [])]) },
  { file: 'balance-sheet.js', what: 'a tier\'s dials (TIER_DIALS)', claims: [pat('TIER_DIALS.*.(xpPm|dmgPm|hpPm)')],
    read: (m) => Object.keys(m.TIER_DIALS).filter((t) => t !== 'normal').map((t) => ['tier:' + t, t]) },
  { file: 'hunt-tiers.js', what: 'a ground\'s tier row (GROUND_TIERS)', claims: [pat('GROUND_TIERS.*.*.(xpPm|dmgPm|hpPm)')],
    read: (m) => rowsOf(m.GROUND_TIERS).flatMap(([g, byTier]) => Object.keys(byTier).map((t) => ['tier:' + t, g])) },
  { file: 'party-class-xp.js', what: 'the party XP by size and the solo boost (PARTY_SIZE_XP, SOLO_XP_PM; by size alone since S-10 c)', claims: [],
    read: (m) => [['party:class-xp', 'PARTY_SIZE_XP'], ...(m.SOLO_XP_PM !== 1000 ? [['party:solo', 'SOLO_XP_PM']] : [])] },
  { file: 'session-modes.js', what: 'a session mode\'s Level XP share (SESSION_MODES.*.xpPm)', claims: [pat('SESSION_MODES.*.xpPm')],
    read: (m) => rowsOf(m.SESSION_MODES).filter(([, r]) => r.xpPm !== 1000).map(([id]) => ['session-mode:' + id, id]) },
  { file: 'scaled-hunts.js', what: 'a scaled hunt\'s dials (SCALED_HUNTS)', claims: [pat('SCALED_HUNTS.(xpPm|coinPm|dropsPm|lootPm)')],
    read: (m) => (m.SCALED_HUNTS ? [['scaled-hunt', 'SCALED_HUNTS']] : []) },
  { file: 'live-events.js', what: 'a live event type (LIVE_EVENT_TYPES)', claims: [pat('LIVE_EVENT_TYPES.*'), pat('LIVE_EVENT_TYPES.*.*')],
    read: (m) => Object.keys(m.LIVE_EVENT_TYPES).map((k) => ['event:' + k, k]) },
  { file: 'abilities.js', what: 'an ability\'s skill XP multiplier (ABILITIES.*.magicXpMult)', claims: [pat('ABILITIES.*.magicXpMult')],
    read: (m) => rowsOf(m.ABILITIES).filter(([, r]) => Number.isFinite(r.magicXpMult)).map(([id]) => ['skill-xp:ability', id]) },
  { file: 'hunt-roles.js', what: 'a role\'s basic attack skill XP multiplier (HUNT_ROLES.*.basic.magicXpMult)', claims: [pat('HUNT_ROLES.*.basic.magicXpMult')],
    read: (m) => rowsOf(m.HUNT_ROLES).filter(([, r]) => r.basic && Number.isFinite(r.basic.magicXpMult)).map(([id]) => ['skill-xp:basic', id]) },
  { file: 'temper.js', what: 'a Tempering track (TEMPER_TRACKS)', claims: [],
    read: (m) => m.TEMPER_TRACKS.map((t) => ['temper:' + t, t]) },
  { file: 'training.js', what: 'a training item (TRAINING_GEAR)', claims: [],
    read: (m) => Object.keys(m.TRAINING_GEAR.gold || {}).map((h) => ['training-item', h + 'h']) },
  { file: 'blessings.js', what: 'a Blessing (BLESSING_TIERS)', claims: [pat('BLESSING_TIERS.*.xpLossReductionPermille')],
    read: (m) => m.BLESSING_TIERS.map((b) => ['blessing', 'tier ' + b.tier]) },
  { file: 'hunt-sessions.js', what: 'the stamina bar (STAMINA_MAX_MS)', claims: [],
    read: (m) => Object.keys(m.STAMINA_MAX_MS).map((k) => ['stamina:' + k, k]) },
  { file: 'premium.js', what: 'a Premium perk (PREMIUM_PERKS)', claims: [],
    read: (m) => Object.keys(m.PREMIUM_PERKS).map((k) => ['premium:' + k, k]) },
  { file: 'stamina-refill.js', what: 'the stamina refill (STAMINA_REFILL)', claims: [],
    read: (m) => (m.STAMINA_REFILL ? [['refill', 'STAMINA_REFILL']] : []) },
  { file: 'shops.js', what: 'a hero slot on sale (SHOP_OFFERS character_slot.N)', claims: [],
    read: (m) => { const out = []; const walk = (o) => { if (!o || typeof o !== 'object') return; if (typeof o.id === 'string' && /^character_slot\.\d+$/.test(o.id) && Array.isArray(o.cost)) out.push(['hero-slot', o.id]); for (const v of Object.values(o)) walk(v); }; walk(m.SHOP_OFFERS); return out; } },
]);

/* KEYS a carrier answers that are not a lever, each with its reason. */
export const NOT_LEVERS = Object.freeze({
  'room-perk:trophyMounts': 'how many trophies the room hangs: display, no power, gold or time',
  'premium:analyzer': 'the hunt analyzer: a screen, no power',
  'premium:outfits': 'outfits: cosmetic',
});

/* SWEEP PATHS that read like a lever and are not one, each with its reason (file -> [regex on "<export>.<path>", why]). */
export const SWEEP_NOT_LEVERS = Object.freeze({
  'balance-sheet.js': [[/^TIER_PULL_OVERRIDES\./, 'a ground\'s own tier dials: the ground\'s fit, read by the tier row the carrier counts (GROUND_TIERS)'],
    [/^STAT_FORMULA\./, 'the monster stat formula: what a ground is written to, not a player lever']],
  'core-model.js': [[/^(ARMOUR_MITIGATION|COMBAT_XP|FLAME_REGEN)\./, 'engine constants: the shape of a rule, the same for every hero']],
  'catalogue-coherence.js': [[/^(ITEMS|MONSTERS)\./, 'a re-export of items.js and monsters.js, read there']],
  'supplies.js': [[/^SUPPLIES\./, 'the supply view of items.js rows, read there']],
});

/* Modules a node scan cannot load, each with its reason. */
export const SCAN_SKIP = Object.freeze({
  'glyphs.js': 'browser-only glyph art (reads window); carries no number a fight, a purse or a clock reads',
  'glyphs-extra.js': 'browser-only glyph art (reads window); carries no number a fight, a purse or a clock reads',
});

const KEY_WORD = /(xp|drop|loot|gold|coin|luck|find|dmg|damage|stamina|rare)/i;
const KEY_TAIL = /(pm|pct|mult|mul|bonus|boost|permille|percent|rate|factor|scale|fit)$/i;
/* a row table: an array, or an object of 4+ entries whose values are all objects; its keys are collapsed to `*` */
const isTable = (o) => Array.isArray(o) || (Object.keys(o).length >= 4 && Object.values(o).every((v) => v && typeof v === 'object'));

/** Every lever-named field in one module's exports: Set of "<export>.<path>". */
export function sweepModule(mod) {
  const out = new Set();
  const seen = new Set();
  const walk = (o, path, depth) => {
    if (!o || typeof o !== 'object' || seen.has(o) || depth > 8) return;
    seen.add(o);
    const table = isTable(o);
    for (const [k, v] of Object.entries(o)) {
      const p = path + '.' + (table ? '*' : k);
      if (KEY_WORD.test(k) && KEY_TAIL.test(k) && (typeof v === 'number' || (v && typeof v === 'object'))) out.add(p);
      walk(v, p, depth + 1);
    }
  };
  for (const [name, v] of Object.entries(mod)) walk(v, name, 0);
  return out;
}

/** The default loader: the module as Node imports it. */
export const loadData = (root) => (file) => import(pathToFileURL(join(root, 'src', 'data', file)).href);

/**
 * The scan. Answers { levers: Map(key -> [rows]), classOf(key), strangers: [{ key|path, file, why }], byLever: Map(lever id -> rows),
 * pinned: { lever id: row count } for every cut or dark lever, skipped: [[file, why]] }.
 */
export async function scanLevers(root, load = loadData(root)) {
  const levers = new Map(), strangers = [];
  const add = (key, row) => { if (!levers.has(key)) levers.set(key, []); levers.get(key).push(row); };
  const leverRow = new Map(LEVERS.map((l) => [l.id, l]));
  /* the model itself must be whole: every LEVER_KEYS target is a LEVERS row whose class LEVER_CLASSES knows */
  for (const [key, id] of Object.entries(LEVER_KEYS)) {
    const l = leverRow.get(id);
    if (!l) strangers.push({ key, file: 'model.mjs', why: 'LEVER_KEYS names no LEVERS row ' + id });
    else if (!LEVER_CLASSES.includes(l.cls)) strangers.push({ key, file: 'model.mjs', why: 'LEVERS ' + id + ' has no known class (' + l.cls + ')' });
  }
  const claims = {};
  for (const c of LEVER_CARRIERS) {
    const m = await load(c.file);
    let pairs;
    try { pairs = c.read(m); } catch (e) { strangers.push({ key: c.file, file: c.file, why: 'the carrier could not read it (' + e.message + '): the data moved, update LEVER_CARRIERS' }); continue; }
    for (const [key, row] of pairs) add(key, c.file + ':' + row);
    (claims[c.file] = claims[c.file] || []).push(...c.claims);
  }
  for (const key of levers.keys()) {
    if (Object.prototype.hasOwnProperty.call(NOT_LEVERS, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(LEVER_KEYS, key)) strangers.push({ key, file: levers.get(key)[0].split(':')[0], why: 'a lever with no class: add it to model.mjs LEVER_KEYS (and LEVERS)' });
  }
  /* THE SWEEP */
  const skipped = [];
  const files = readdirSync(join(root, 'src', 'data')).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) {
    if (Object.prototype.hasOwnProperty.call(SCAN_SKIP, f)) { skipped.push([f, SCAN_SKIP[f]]); continue; }
    let m;
    try { m = await load(f); } catch (e) { strangers.push({ path: f, file: f, why: 'the scan cannot load it (' + e.message.split('\n')[0] + '): fix it or name it in SCAN_SKIP with a reason' }); continue; }
    for (const p of sweepModule(m)) {
      const claimed = (claims[f] || []).some((re) => re.test(p)) || (SWEEP_NOT_LEVERS[f] || []).some(([re]) => re.test(p));
      if (!claimed) strangers.push({ path: p, file: f, why: 'a lever-named field no carrier reads: add a carrier (and its LEVER_KEYS row), or a SWEEP_NOT_LEVERS reason' });
    }
  }
  const byLever = new Map();
  for (const [key, rows] of levers) {
    const id = LEVER_KEYS[key];
    if (!id) continue;
    if (!byLever.has(id)) byLever.set(id, []);
    byLever.get(id).push(...rows);
  }
  const pinned = {};
  for (const [id, rows] of byLever) { const l = leverRow.get(id); if (l && (l.cls === 'cut' || l.cls === 'dark')) pinned[id] = rows.length; }
  return { levers, strangers, byLever, pinned, skipped, classOf: (key) => (leverRow.get(LEVER_KEYS[key]) || {}).cls || null };
}
