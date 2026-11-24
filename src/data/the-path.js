// ════════════════════════════════════════════════════════════════════════
// src/data/the-path.js — THE PATH: WHAT OPENS EVERY SYSTEM, AND WHEN THE GAME SAYS SO (GR-79; designer ruling D-1,
// docs/design/overhaul/review/05-designer-rulings.md section 1.1, built as written by FB-5, 2026-11-21).
//
// One frozen row a line. The Town menu, the coach, What next, the end card, the return card and the Book read this table
// and nothing else, so a new system costs one row. THE PATH ANNOUNCES, NEVER TAKES AWAY: a player who knows the game may open
// anything the server allows; the Path only decides when the game says it (rule 6).
//
//   id       stable, [a-z0-9_]
//   opener   { kind: 'level', from: REF }               the Level, read from the row's own system (rule 1: never typed here)
//            { kind: 'event', event, expectLevel }      a first event on the account; expectLevel is the Level by which the
//                                                       walked first hour meets it, so the guard can count it. It gates nothing
//            { kind: 'accounts', from: REF }            a count of active accounts on the server
//   opens    window ids of src/data/shell-windows.js, or a feature id (tests/the-path.mjs PATH_FEATURES names them)
//   flag     REF: the export in the row's own system that says it is live (truthy). Missing or false: the row is off. null: always on.
//            The lane that owns the system adds the export when it lands; no later lane edits this file
//   scope    'account' (its card shows once for the account), 'hero', or 'way' (read for the hero's weapon; never counts for the guard)
//   line     the words (Town menu, What next, end card, return card)
//   card     the coach card id, or null
//
// A REF names a file of src/data and an export: { file, export, id?, path? }. `id` picks a row of an array (by `id`) or a key of an
// object, `path` walks into it. A HUNTS row that is `staged` reads as missing: a staged ground is off. resolveRef (below) is the one
// reader; tests/the-path.mjs holds every row to it.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const ref = (file, exp, id, path) => Object.freeze({ file, export: exp, ...(id === undefined ? {} : { id }), ...(path ? { path: Object.freeze(path) } : {}) });
const level = (from) => Object.freeze({ kind: 'level', from });
const event = (name, expectLevel) => Object.freeze({ kind: 'event', event: name, expectLevel });
const row = (id, opener, opens, flag, scope, line, card = null) => Object.freeze({ id, opener, opens: Object.freeze(opens), flag, scope, line, card });

/* The systems later lanes of the first build own (13-build-plan.md section 2.6). Each adds its export when it lands. */
const FB6_PARTY = ref('src/data/company.js', 'COMPANY_RULES', undefined, ['live']);
const FB6_REST = ref('src/data/company.js', 'COMPANY_RULES', undefined, ['restPlan']);
const FB7_REPORT = ref('src/data/hunt-report.js', 'HUNT_REPORT', undefined, ['live']);
/* THE DANGER SCALE ON A GROUND (lane/first-hour-rewrite; 20-v030-the-roads.md 1.2: the tier path is removed, R10): a ground's row in
   DANGER_GROUNDS is its flag, so the depth and Risk rows turn on when R10 puts the Cellar and the Sewer on the scale, with no edit here. */
const ON_SCALE = (id) => ref('src/data/danger.js', 'DANGER_GROUNDS', undefined, [id]);
const FB9_MARKET = ref('src/data/market-open.js', 'MARKET_OPEN', undefined, ['live']);
const FB11_TALENTS = ref('src/data/talents.js', 'TALENT_RULES', undefined, ['live']);
const FB12_SOCIAL = ref('src/data/social-open.js', 'SOCIAL_OPEN', undefined, ['live']);
const FB13_BOSS = ref('src/data/world-boss.js', 'WORLD_BOSS', undefined, ['live']);
const FB14_ON_CALL = ref('src/data/on-call.js', 'ON_CALL_RULES', undefined, ['live']);
const HUNTS = (id) => ref('src/data/hunts.js', 'HUNTS', id, ['band', 0]);

export const THE_PATH = Object.freeze([
  row('start', event('start', 1), ['hunts', 'inventory', 'character', 'wiki', 'shop', 'tally', 'chat'], null, 'account',
    'Open Hunts and pick the Mill Cellar.'),
  row('first_kill', event('first_kill', 1), ['action_bar'], null, 'account',
    'Your hero fights by itself. Open a slot on the bar to change how.'),
  /* the first hunt on the scale: the HUD's "Depth 1 of 20" (20 section 3.1), its coach card hunt-tutorial.js depth */
  row('depth', level(HUNTS('mill_cellar')), ['hunts'], ON_SCALE('mill_cellar'), 'account',
    'Depth 1 of 20. The deeper your hero goes, the more each kill pays.', 'depth'),
  /* the first Roads point (17 section 13: a point from Level 2), its coach card hunt-tutorial.js talent_point */
  row('talents', level(ref('src/data/talents.js', 'TALENT_RULES', undefined, ['opensAt'])), ['talents'], FB11_TALENTS, 'account',
    'Level 2. A Talent point. Spend it as suggested.', 'talent_point'),
  row('first_leave', event('first_leave', 4), ['end_card', 'hunt-summary', 'blessings', 'loot_plan'], null, 'account',
    'Rats done. Tamsin has gear for you.'),
  /* the recruit press (Tyler RD-Q6 a, 2026-11-22; src/data/recruits.js, 1053-recruits.sql): the company comes in one press at Level 5 */
  row('first_level_5', event('first_level_5', 5), ['characters', 'hero_strip', 'party_plan', 'storage'],
    ref('src/data/recruits.js', 'RECRUITS', undefined, ['live']), 'account',
    '{Name} has outgrown the Mill Cellar. Three recruits are ready to join, and the Sewer wants a full party.'),
  row('thicket', level(HUNTS('meadowbrook_thicket')), ['hunts'], null, 'hero', 'Level 5. Meadowbrook Thicket'),
  row('sewer', level(HUNTS('millrace_sewer')), ['hunts'], null, 'hero', 'Level 5. The Sewer, for a party'),
  /* the Risk pick at the first party ground on the scale (20 sections 1.2 and 3.1), its coach card hunt-tutorial.js risk_pick */
  row('risk', level(HUNTS('millrace_sewer')), ['hunts'], ON_SCALE('millrace_sewer'), 'account',
    'Level 5. Pick a Risk for the Sewer. Steady is set, and only Bold can die.', 'risk_pick'),
  row('party_ready', event('party_ready', 5), ['hunt-party'], FB6_PARTY, 'account', 'Your party is ready for the Sewer.'),
  row('rest_plan', event('party_hunt_10min', 6), ['skills-trade', 'rest_plan', 'farm', 'house'], FB6_REST, 'account',
    'When stamina runs out your heroes go to work. Here is their plan.'),
  row('safe_to_close', event('party_hunt_15min', 6), ['safe_to_close'], null, 'account',
    'It is safe to close the game. Your party hunts for about {hours} more hours, then goes to work. Come back in about {back} hours.'),
  row('wickstead', level(HUNTS('wickstead')), ['hunts'], null, 'hero', 'Level 8. Wickstead'),
  row('graypelt_cloak', level(ref('src/data/slot-ladders.js', 'SLOT_ITEMS', 'graypelt_cloak', ['reqLv'])), ['skills-trade'], null, 'hero',
    'Level 8. Graypelt Cloak. Stitch it from 6 Wolf Pelts.'),
  row('first_stamina_end', event('first_stamina_end', 10), ['return_card', 'house', 'weighhouse', 'clan_roster', 'calendar'], null, 'account',
    'Your heroes are back in town.'),
  row('tower', level(ref('src/data/tower.js', 'TOWER_RULES', undefined, ['minLevel'])), ['tower'], null, 'hero', 'Level 10. The Burning Tower'),
  row('hearth_chest', level(ref('src/data/tower.js', 'TOWER_RULES', undefined, ['minLevel'])), ['hearth_chest'], null, 'hero', 'Level 10. The Hearth Chest'),
  row('training_yard', level(ref('src/data/training.js', 'TRAINING_RULES', undefined, ['minLevel'])), ['training'], null, 'hero', 'Level 10. Training Yard'),
  row('grayjaws_ruff', level(ref('src/data/items.js', 'ITEMS', 'grayjaws_ruff', ['reqLv'])), ['hunts'], null, 'hero',
    'Level 12. Grayjaw\'s Ruff. Old Grayjaw drops it in the Thicket.'),
  row('world_boss', level(ref('src/data/world-boss.js', 'WORLD_BOSS', undefined, ['minLevel'])), ['world_boss'], FB13_BOSS, 'hero', 'Level 13. {Boss name}'),
  row('iron_gear', level(ref('src/data/gear-tiers.js', 'MATERIAL_TIERS', 'iron', ['level'])), ['iron_gear'], null, 'hero', 'Level 10. Iron gear'),
  row('mosslight', level(HUNTS('mosslight_glade')), ['hunts', 'honor'], null, 'hero', 'Level 16. Mosslight Glade'),
  row('talent_points', level(ref('src/data/talents.js', 'TALENT_RULES', undefined, ['pointLevels'])), ['talent_point'], FB11_TALENTS, 'hero',
    'Level {N}. A Talent point'),
  row('houndskin_cloak', level(ref('src/data/slot-ladders.js', 'SLOT_ITEMS', 'houndskin_cloak', ['reqLv'])), ['skills-trade'], null, 'hero',
    'Level 22. Houndskin Cloak'),
  row('steel_gear', level(ref('src/data/gear-tiers.js', 'MATERIAL_TIERS', 'steel', ['level'])), ['steel_gear', 'shop'], null, 'hero', 'Level 30. Steel gear'),
  row('coppercap', level(HUNTS('coppercap_warrens')), ['hunts'], null, 'hero', 'Level 32. Coppercap Warrens'),
  row('way_moves', level(ref('src/data/abilities.js', 'ABILITIES', undefined, ['*', 'unlock'])), ['way_move'], null, 'way', 'Level {N}. {Move}'),
  row('on_call', level(ref('src/data/on-call.js', 'ON_CALL_RULES', undefined, ['opensAt'])), ['on_call'], FB14_ON_CALL, 'account', 'On call'),
  row('town_crier', Object.freeze({ kind: 'accounts', from: ref('src/data/social-open.js', 'SOCIAL_OPEN', undefined, ['crierAccounts']) }),
    ['town_crier'], FB12_SOCIAL, 'account', 'The Town Crier'),
  row('weapon_tags', event('weapon_tags', null), ['weapon_tags'], null, 'account', 'Good alone, or best in a party'),
  row('weighhouse', event('first_stamina_end', 10), ['market'], FB9_MARKET, 'account', 'The Weighhouse'),
  row('hunt_report', event('first_leave', 4), ['hunt-summary'], FB7_REPORT, 'account', 'Rats done. Tamsin has gear for you.'),
]);

/**
 * The value a REF names in `mods` ({ [file]: module namespace }), or undefined when its file, export, row or field is missing.
 * '*' in a path reads every row of an object or array and answers the list of their values (a way's moves). Pure.
 */
export function resolveRef(r, mods) {
  if (!r) return undefined;
  const m = mods && mods[r.file];
  if (!m || !(r.export in m)) return undefined;
  let v = m[r.export];
  if (r.id !== undefined) {
    v = Array.isArray(v) ? v.find((x) => x && x.id === r.id) : v && typeof v === 'object' ? v[r.id] : undefined;
    if (v && v.staged) return undefined;
  }
  for (const k of r.path || []) {
    if (v === undefined || v === null) return undefined;
    if (k === '*') { v = Object.values(v); continue; }
    v = Array.isArray(v) && typeof k === 'string' ? v.map((x) => (x ? x[k] : undefined)) : v[k];
  }
  return v;
}

/** The Levels a row opens at (a list: a rule may open at many), or [] when its source is not there. Pure. */
export function levelsOf(rowOf, mods) {
  const o = rowOf.opener;
  if (o.kind === 'event') return Number.isInteger(o.expectLevel) ? [o.expectLevel] : [];
  if (o.kind !== 'level') return [];
  const v = resolveRef(o.from, mods);
  const list = Array.isArray(v) ? v : [v];
  return list.filter((x) => Number.isInteger(x) && x > 0);
}

