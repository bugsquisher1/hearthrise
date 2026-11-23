// ════════════════════════════════════════════════════════════════════════
// src/data/talents.js — THE ROADS: EVERY TALENT NODE AS A DATA ROW (systems, lane/roads-sample, 2026-11-23; lane L8's sample).
//
// docs/design/redesign/17-talent-tree.md v3 (the Roads), 16-talent-branches.md (the options), 18-roads-review*.md (the approved fixes),
// 19-power-ledger.md (the build slice, cap 14, the ramp), 23-spell-audit.md (the moves pass), 24-content-pipeline.md section 4 (this
// module's contract: CC-5..CC-7 in tests/content-coherence.mjs read it).
//
// THE SAMPLE (17 section 12 step 2, 18 section 9 step 4): the Great Hearth (the free start: Mend's road and the Havora crossing),
// Shield, Restoration and their border. The rest of the map is rows added here, country by country, each through the library test.
//
// A NODE ROW: { id, kind, country, move?, after: [node ids it touches], n, tip?, options?, effects?, countries?, needs? }
//   kind      start | rank | crossroads | waystone | open | vow | border (a border town) | hybrid (a hybrid crossroads) | crossing (Havora)
//   after     a node is bought only when it touches one the hero owns (17 section 2): ANY id of `after` owned. Every id points at an
//             EARLIER row, so the map is a tree grown out of the start (validate holds it acyclic), and a set of owned nodes is a legal
//             path exactly when every node has an owned `after` (core/talents.js pathProblems; the server's hr_talent_spend reads the same)
//   options   a crossroads, hybrid, border or crossing: pick 1 of them ({ id, n, tip, suggested?, effects }). `suggested` is true, or the
//             plan it suits ('party' | 'solo'): "Spend as suggested" takes it (core/talents.js suggestedPick)
//   effects   what the node does (a waystone's, a vow's; an option's own `effects`), a list of:
//               { kind: 'step', raises: 'offense' | 'defense', steps, key, when? }   a POWER LEDGER ROW in the build slice (src/core/power-
//                    ledger.js: x ramp(L), the net clamped at buildStepsMax x ramp). `when` is the condition it holds on (core/talents.js
//                    WHEN, src/core/hunt/talent-rows.js holds: party, solo, near_fall, shielded, taunting, cast:<move>:<ms>)
//               { kind: 'mod', move, ...numbers }   a MOVE MODIFIER: the move's own row as this hero casts it (src/core/hunt/abilities.js
//                    rowFor). Numbers at full size, x ramp(L) (17 section 2: "every number grows with Level"); tile counts and `solo` are
//                    rules, whole from the start. move '*heal' is every heal move the hero casts. Numbers: cdMs, cdPm, mana, manaPm,
//                    outPm (permille of what it lands), statusMs (its status lasts longer), holdMs and tauntRadius (the Challenge's hold
//                    and reach), r and radius and maxHits (tiles, whole), overShieldPm (a heal past full stands as a shield, whole), solo
//               { kind: 'borrow', move }   a border town's or the crossing's pick: the move is the hero's with any weapon (17 section 3)
//               { kind: 'react', id, on, do, ... }   A REACTION (src/core/hunt/reactions.js; REACT_ON / REACT_DO below): on a hit, a crit,
//                    a kill, a hit taken, an ally hit, a fall near the line, a shell broken, a taunt or a taunt lost, the hero casts, resets
//                    a cooldown, gets mana, heals, shields, lays a status, lands a second hit or carries an overkill. pm x ramp(L)
//               { kind: 'heal_in', pm, when?, scope? }   HEALING RECEIVED: pm more of every heal the hero takes while `when` holds;
//                    scope 'warded': on an ally holding this hero's shell instead (src/core/hunt/heal-cut.js healIn). pm x ramp(L)
//               { kind: 'unit', ... }      A UNIT RULE (UNIT_FIELDS): Hold Fast's no-switch, Bodyguard's share, Still Mind's regen
//               { kind: 'rule', id }       A RULE THE ENGINE CANNOT PLAY (lane/talent-effects built the rest as the pieces above; one is
//                    left, `shield_duration`: a shell has no duration in the engine, so a longer one is a design call): held at 0 by the
//                    engine, listed by heldRules() and in the lane's report. "Every node fires on the dummy analyzer before it ships" (17 section 9): TALENT_RULES.live stays false
//                    while a sample node the suggested path takes is held
//   needs     a hybrid or a hybrid vow: { crossroadsIn: [country, country] } (17 section 6: "Requires a crossroads in both countries")
//
// SIZES (17 section 9, 19 section 1). Step rows in steps of DANGER.powerStep (0.35% power a step): a vow +18 on its condition and -8
// always (a vow's cost gets a key of its own so it always bites: the ledger counts one cost a key). A rank stone and an open road are
// ON THE CURVE: they add no row; an idle point (unspent, or a rank on a move the hero never casts) costs pointSharePm of a step on
// offense and defense (19 row 2: "An unspent point is -1/3"), never ramped. Every other number here is a STARTING VALUE for the Lab
// (in band is enough), shown at full size (Level 200).
//
// ALL BEHIND ONE SWITCH: TALENT_RULES.live (false). The server's catalogue (tools/gen-talents.mjs) carries it: while it is false
// hr_talents_view projects nothing (so no settle reads a node and no hero pays an idle point) and every Talents verb refuses
// talents_closed. Arming is this flag and a regenerated catalogue, one row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { POWER_LEDGER } from './power-ledger.js';
import { STATUSES } from './statuses.js';

const isStatus = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATUSES, id);

/* THE RULES (17 section 2). `opensAt` and `pointLevels` are the Path's (src/data/the-path.js FB11_TALENTS). */
export const TALENT_RULES = Object.freeze({
  /* THE SWITCH: off until the sample plays on the dummy with every suggested node live (17 section 12) and Security reviews the verbs */
  live: false,
  /* 1 point every Level, from Level 2 (17 section 2): points(L) = max(0, L - pointFrom + 1) */
  pointFrom: 2,
  opensAt: 2,
  pointLevels: Object.freeze(Array.from({ length: POWER_LEDGER.rampLevel - 1 }, (_, i) => i + 2)),
  /* vow slots open at these Levels (17 section 2, R8: 1 at 30, 2 at 50, 3 at 200); every vow reads "Requires Level 30" */
  vowSlots: Object.freeze([30, 50, 200]),
  /* at most this many borrowed moves, the crossing counted (17 section 3) */
  maxBorrowed: 2,
  /* an idle point's cost, permille of a step (19 row 2: a third of a Level's step) */
  pointSharePm: 333,
  /* a crossroads offers this many options (17 section 1) */
  options: 3,
  /* saved builds a hero may keep, one a ground (17 section 14; a blast radius, not a balance number) */
  savedBuildsMax: 32,
  /* the healing a hero receives, every source added, held to this permille either way (15 "Healing done: add"; PROVISIONAL, the Lab's) */
  healInCapPm: 300,
});

/* THE BORROW BANDS (17 section 3, priced by value): V0 at full power (held steps), the penalty in permille at a border town and at the
   Havora crossing (null: not offered there). A move whose V0 is past the last band is re-driven and measured again, never offered. */
export const BORROW_BANDS = Object.freeze([
  Object.freeze({ upTo: 4, borderPm: 0, havoraPm: 300 }),
  Object.freeze({ upTo: 10, borderPm: 300, havoraPm: 500 }),
  Object.freeze({ upTo: 20, borderPm: 500, havoraPm: null }),
]);
/* A borrow opens at max(openFloor, openLevel x V / buildStepsMax), rounded up to openRound (17 section 3: "a borrow is never bigger than
   the build slice allows at that Level"; V after the penalty) */
export const BORROW_OPEN = Object.freeze({ openFloor: 20, openLevel: POWER_LEDGER.rampLevel, openRound: 10 });

/* THE MEASURED VALUES (17 section 3's table, 18-roads-review-measured.md, 23-spell-audit.md): V0 in held steps at full power, or null
   when it is owed a measurement (never offered until it has one). Greater Mend waits on V4, the heal rule (19 bottom line (3)). */
export const BORROW_VALUES = Object.freeze({
  challenge: 0,
  hunters_mark: 2,
  frost_lance: 4,
  fireball: 8,
  shelter: 8.5,
  hoarfrost: 15.8,
  protective_ward: 16.1,
  greater_mend: null,
});

/* THE COUNTRIES: a weapon's DISCIPLINES id (src/data/abilities.js), or 'hearth' (the Great Hearth: every hero's) */
export const HEARTH = 'hearth';

/* THE BORDERS, a DATA LIST (17 section 6, R5): a new country adds rows and never cuts one. Each joins two countries; a row whose nodes
   are written below has them in TALENT_NODES (kind border / hybrid / vow with `countries`). The sample writes Shield · Restoration. */
export const BORDERS = Object.freeze([
  ['club', 'dual_axe'], ['dual_axe', 'ranged'], ['ranged', 'destruction'], ['destruction', 'shield'], ['shield', 'restoration'],
  ['restoration', 'sword'], ['sword', 'club'], ['destruction', 'restoration'], ['sword', 'shield'],
].map((c) => Object.freeze(c)));

/* THE ROADS OF A COUNTRY, in the order the country's map lays them (17 section 5): the first leaves the Great Hearth, each next one
   leaves the one before at its crossroads I. "Spend as suggested" walks them in this order. */
export const COUNTRY_ROADS = Object.freeze({
  hearth: Object.freeze(['mend']),
  shield: Object.freeze(['challenge', 'frost_slam', 'shelter']),
  restoration: Object.freeze(['greater_mend', 'circle_of_renewal', 'spring_tide', 'green_sickness', 'protective_ward']),
});

/* ── builders ── */
const fz = (o) => Object.freeze(o);
const step = (raises, steps, key, when) => fz({ kind: 'step', raises, steps, key, ...(when ? { when } : {}) });
const mod = (move, o) => fz({ kind: 'mod', move, ...o });
const rule = (id) => fz({ kind: 'rule', id });
const borrow = (move) => fz({ kind: 'borrow', move });
const react = (id, on, act, o) => fz({ kind: 'react', id, on, do: act, ...(o || {}) });
const healIn = (pm, when, scope) => fz({ kind: 'heal_in', pm, ...(when ? { when } : {}), ...(scope ? { scope } : {}) });
const unitRule = (o) => fz({ kind: 'unit', ...o });
const opt = (id, n, tip, effects, suggested) => fz({ id, n, tip, effects: fz(effects), ...(suggested ? { suggested } : {}) });
const node = (o) => fz({ ...o, after: fz(o.after), ...(o.options ? { options: fz(o.options) } : {}), ...(o.effects ? { effects: fz(o.effects) } : {}) });

/* A MOVE'S ROAD (17 section 2): 3 rank stones, crossroads I, 2 rank stones, crossroads II, then the open road; a waystone off the road
   after each crossroads. `from` is the node it leaves (the start, or the road before's crossroads I). */
function road(country, move, from, x1, w1, x2, w2) {
  const id = (s) => move + '.' + s;
  const rank = (k, after) => node({ id: id('r' + k), kind: 'rank', country, move, after: [after], n: 'Rank stone', tip: '+1 ' + MOVE_NAMES[move] + ' rank' });
  return [
    rank(1, from), rank(2, id('r1')), rank(3, id('r2')),
    node({ id: id('x1'), kind: 'crossroads', country, move, after: [id('r3')], n: 'Crossroads I', options: x1 }),
    node({ id: id('w1'), kind: 'waystone', country, move, after: [id('x1')], n: w1.n, tip: w1.tip, effects: w1.effects }),
    rank(4, id('x1')), rank(5, id('r4')),
    node({ id: id('x2'), kind: 'crossroads', country, move, after: [id('r5')], n: 'Crossroads II', options: x2 }),
    node({ id: id('w2'), kind: 'waystone', country, move, after: [id('x2')], n: w2.n, tip: w2.tip, effects: w2.effects }),
    node({ id: id('open'), kind: 'open', country, move, after: [id('x2')], n: 'Open road', tip: '+1 ' + MOVE_NAMES[move] + ' rank a point' }),
  ];
}
const way = (n, tip, effects) => ({ n, tip, effects });

/* the names the tooltips read (src/data/abilities.js `n`; kept here so this module imports no row table and stays pure data) */
const MOVE_NAMES = fz({
  mend: 'Mend', challenge: 'Challenge', frost_slam: 'Frost Slam', shelter: 'Shelter', greater_mend: 'Greater Mend',
  circle_of_renewal: 'Circle of Renewal', spring_tide: 'Spring Tide', green_sickness: 'Green Sickness', protective_ward: 'Protective Ward',
});

const H = HEARTH;

/* ── THE GREAT HEARTH (17 section 1: every hero owns it; Mend's road and the Havora crossing) ── */
const HEARTH_NODES = [
  node({ id: 'hearth', kind: 'start', country: H, after: [], n: 'The Great Hearth', tip: 'Where every road starts' }),
  ...road(H, 'mend', 'hearth',
    [opt('second_wind', 'Second Wind', 'Mend +60% healing near fall-back · −20% otherwise', [mod('mend', { nearFallPm: 600, notNearFallPm: -200 })]),
      opt('steady_mend', 'Steady Mend', 'Mend heals over 6 s · +25% healing', [mod('mend', { outPm: 250, hotMs: 6000, hotAll: true })], true),
      opt('shared_mend', 'Shared Mend', 'Mend also heals the nearest ally for 50%', [mod('mend', { alsoPm: 500, alsoPick: 'nearest' })])],
    way('Light Hands', 'Mend −2 mana', [mod('mend', { mana: -2 })]),
    /* crossroads II: 16 writes only one Mend crossroads; these three are this lane's, for the designer to rule (17 section 4 counts two) */
    [opt('deep_mend', 'Deep Mend', 'Mend +20% healing · +3 mana', [mod('mend', { outPm: 200, mana: 3 })]),
      opt('light_mend', 'Light Mend', 'Mend −40% mana · −20% healing', [mod('mend', { manaPm: -400, outPm: -200 })], true),
      opt('bright_mend', 'Bright Mend', '+6% healing received near fall-back', [healIn(60, 'near_fall')])],
    way('Warm Hands', 'Mend +5% healing', [mod('mend', { outPm: 50 })])),
  /* THE HAVORA CROSSING (17 section 3): any measured move from any country, one price band harsher; its options are BORROW_VALUES' rows
     that have a Havora band (core/talents.js crossingOptions) */
  node({ id: 'havora', kind: 'crossing', country: H, after: ['hearth'], n: 'The Havora crossing', tip: 'Use one move from any country with any weapon' }),
];

/* ── SHIELD (17 section 5) ── */
const S = 'shield';
const SHIELD_NODES = [
  ...road(S, 'challenge', 'hearth',
    [opt('long_hold', 'Long Hold', 'Taunt holds 12 s (from 8 s) · +4 s cooldown', [mod('challenge', { holdMs: 4000, cdMs: 4000 })], 'party'),
      opt('hard_challenge', 'Hard Challenge', 'Taunted enemy: −6% damage to you · Casts when solo',
        /* "taunted enemy" read as "while you hold a taunt": the blows a holding tank takes are its held monsters' (the ledger is per hero) */
        [step('defense', 17, 'taunted_less', 'taunting'), mod('challenge', { solo: true })], 'solo'),
      opt('guarding_challenge', 'Guarding Challenge', 'Casts when an enemy attacks a back-row ally · Party only',
        [react('challenge_guard_back_row', 'ally_hit', 'cast', { move: 'challenge', row: 'back' })])],
    way('Reaching Call', 'Challenge range +1 tile', [mod('challenge', { tauntRadius: 1 })]),
    [opt('drawing_challenge', 'Drawing Challenge', 'Taunted Stalkers stay for the full taunt', [mod('challenge', { holdAll: true })]),
      opt('mended', 'Mended', '+6% healing received while you hold a taunt', [healIn(60, 'taunting')], true),
      /* "recasts": its cooldown is ready again (capped at one cooldown a cycle), and the bar casts it at once while a monster is off the tank */
      opt('echoing_challenge', 'Echoing Challenge', 'Recasts when a taunt ends early · +4 s cooldown',
        [react('challenge_echo', 'taunt_lost', 'reset', { move: 'challenge', ms: 60000, capMs: 60000 }), mod('challenge', { cdMs: 4000 })])],
    way('Braced Call', 'Challenge: −2% damage taken for 4 s', [step('defense', 6, 'taunt_brace', 'cast:challenge:4000')])),
  ...road(S, 'frost_slam', 'challenge.x1',
    [opt('long_frost', 'Long Frost', 'Chill 6 s (from 4 s) · +2 s cooldown', [mod('frost_slam', { statusMs: 2000, cdMs: 2000 })], true),
      opt('pinning_frost', 'Pinning Frost', 'Target only · +50% Chill', [mod('frost_slam', { pick: 'target', statusPm: 500 })]),
      opt('slowing_frost', 'Slowing Frost', 'Chill slows wind-ups 2× · −50% Chill on attacks', [mod('frost_slam', { statusPm: -500, windupSlowPm: 2000 })])],
    way('Cold Footing', 'Frost Slam usable solo · −30% Chill', [mod('frost_slam', { solo: true, statusPm: -300 })]),
    [opt('cold_ground', 'Cold Ground', 'Frozen ground 4 s · Chills enemies on it', [mod('frost_slam', { ground: 'frozen_ground' })], true),
      opt('quick_slam', 'Quick Slam', '−3 s cooldown · −20% damage', [mod('frost_slam', { cdMs: -3000, outPm: -200 })]),
      opt('wide_slam', 'Wide Slam', '+1 tile radius · −15% damage', [mod('frost_slam', { r: 1, outPm: -150 })])],
    way('Wide Ice', 'Frost Slam radius +1 tile', [mod('frost_slam', { r: 1 })])),
  ...road(S, 'shelter', 'frost_slam.x1',
    [opt('steady_shelter', 'Steady Shelter', '−40% shield · −15 s cooldown', [mod('shelter', { outPm: -400, cdMs: -15000 })], true),
      opt('deep_shelter', 'Deep Shelter', '2 lowest-health allies only · +80% shield', [mod('shelter', { limit: 2, pick: 'lowest', outPm: 800 })]),
      opt('stone_wall', 'Stone Wall', '+100% shield on you · −30% on allies', [mod('shelter', { selfPm: 1000, othersPm: -300 })])],
    way('Quick Stone', 'Shelter −5 s cooldown', [mod('shelter', { cdMs: -5000 })]),
    [opt('ready_shelter', 'Ready Shelter', 'Casts when an ally is near fall-back · +10 s cooldown',
      [react('shelter_on_near_fall', 'near_fall', 'cast', { move: 'shelter' }), mod('shelter', { cdMs: 10000 })]),
      /* HELD: a shell has no duration in the engine (it stands until spent, shields.js), so a longer one is nothing: the designer's call */
      opt('long_shelter', 'Long Shelter', '+4 s shield duration', [rule('shield_duration')], true),
      opt('bright_shelter', 'Bright Shelter', '+6% healing received while shielded', [healIn(60, 'shielded')])],
    way('Guarding Stone', 'Shelter: +10% shield on allies near fall-back', [mod('shelter', { nearFallPm: 100 })])),
  /* THE VOWS (17 section 7): beside the country's first crossroads; +18 on the condition, −8 always; never a max-health cost */
  node({ id: 'vow.hold_fast', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Hold Fast', tip: 'Enemies on you can\'t switch targets · −3% damage dealt',
    effects: [unitRule({ noSwitch: true }), step('offense', -8, 'vow.hold_fast')] }),
  node({ id: 'vow.bodyguard', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Bodyguard', tip: 'Take 30% of damage dealt to back-row allies within 2 tiles · −3% damage dealt · Party only',
    effects: [unitRule({ guardPm: 300, guardR: 2 }), step('offense', -8, 'vow.bodyguard')] }),
  node({ id: 'vow.cold_iron', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Cold Iron', tip: 'Hit in melee: Chill the attacker 2 s · −3% damage dealt',
    effects: [react('chill_on_hit_taken', 'hit_taken', 'status', { status: 'chill', ms: 2000, melee: true }), step('offense', -8, 'vow.cold_iron')] }),
  node({ id: 'vow.last_stand', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Last Stand', tip: 'Near fall-back: −20% damage taken · −3% damage dealt',
    effects: [step('defense', 18, 'last_stand', 'near_fall'), step('offense', -8, 'vow.last_stand')] }),
];

/* ── RESTORATION (17 section 5; Undertow's road cut with the move) ── */
const R = 'restoration';
const RESTORATION_NODES = [
  ...road(R, 'greater_mend', 'hearth',
    [opt('light_mending', 'Light Mending', '−40% mana · −25% healing', [mod('greater_mend', { manaPm: -400, outPm: -250 })]),
      opt('deep_mending', 'Deep Mending', '+40% healing on allies near fall-back', [mod('greater_mend', { nearFallPm: 400 })]),
      opt('split_mending', 'Split Mending', '30% of the heal also lands on the next lowest-health ally', [mod('greater_mend', { alsoPm: 300, alsoPick: 'lowest' })], true)],
    way('Long Reach', 'Greater Mend range +1 tile', [mod('greater_mend', { range: 1 })]),
    [opt('thrifty_mending', 'Thrifty Mending', '50% mana back on allies near fall-back', [mod('greater_mend', { manaBackNearPm: 500 })], true),
      opt('lingering_mending', 'Lingering Mending', '25% of the heal again over 4 s', [mod('greater_mend', { hotMs: 4000, hotPm: 250 })]),
      opt('reaching_mending', 'Reaching Mending', '+3 tiles range', [mod('greater_mend', { range: 3 })])],
    way('Spare Water', 'Greater Mend −2 mana', [mod('greater_mend', { mana: -2 })])),
  ...road(R, 'circle_of_renewal', 'greater_mend.x1',
    [opt('lasting_circle', 'Lasting Circle', 'Heals over 6 s · +30% healing', [mod('circle_of_renewal', { outPm: 300, hotMs: 6000, hotAll: true })], true),
      opt('tight_circle', 'Tight Circle', 'Allies within 3 tiles only · +40% healing', [mod('circle_of_renewal', { radius: -5, outPm: 400 })]),
      opt('light_circle', 'Light Circle', '−40% mana · −25% healing', [mod('circle_of_renewal', { manaPm: -400, outPm: -250 })])],
    way('Thin Ring', 'Circle −5 mana', [mod('circle_of_renewal', { mana: -5 })]),
    [opt('rallying_circle', 'Rallying Circle', '+30% healing on allies near fall-back', [mod('circle_of_renewal', { nearFallPm: 300 })]),
      opt('mana_circle', 'Mana Circle', '+2% mana to each ally healed', [mod('circle_of_renewal', { manaToHealedPm: 20 })], true),
      opt('front_circle', 'Front Circle', '+15% healing on the front row · −15% on the back row', [mod('circle_of_renewal', { frontPm: 150, backPm: -150 })])],
    way('Front Ring', 'Circle: +5% healing on the front row', [mod('circle_of_renewal', { frontPm: 50 })])),
  ...road(R, 'spring_tide', 'circle_of_renewal.x1',
    [opt('ebb_tide', 'Ebb Tide', '−50% healing, cooldown and mana', [mod('spring_tide', { outPm: -500, cdPm: -500, manaPm: -500 })]),
      opt('high_tide', 'High Tide', 'Healing past full health stays as a shield', [mod('spring_tide', { overShieldPm: 1000 })], true),
      opt('turning_tide', 'Turning Tide', '+50% healing on allies near fall-back · −25% on the rest', [mod('spring_tide', { nearFallPm: 500, notNearFallPm: -250 })])],
    way('Full Spring', 'Spring Tide: +2% mana to you', [mod('spring_tide', { manaOnCastPm: 20 })]),
    [opt('rising_tide', 'Rising Tide', '−15 s cooldown', [mod('spring_tide', { cdMs: -15000 })], true),
      opt('clearing_tide', 'Clearing Tide', 'Removes 1 harmful effect from each ally healed', [mod('spring_tide', { cleanse: 1 })]),
      opt('deep_tide', 'Deep Tide', '+30% healing · +20 s cooldown', [mod('spring_tide', { outPm: 300, cdMs: 20000 })])],
    way('Quick Spring', 'Spring Tide −10 s cooldown', [mod('spring_tide', { cdMs: -10000 })])),
  ...road(R, 'green_sickness', 'spring_tide.x1',
    [opt('lingering_sickness', 'Lingering Sickness', 'Sickness 10 s (from 6 s) · −30% damage', [mod('green_sickness', { statusMs: 4000, outPm: -300 })], true),
      opt('single_dose', 'Single Dose', 'Target only · Sickness 20% (from 10%)', [mod('green_sickness', { pick: 'target', statusPm: 1000 })]),
      opt('draining_sickness', 'Draining Sickness', 'Heals the lowest-health ally for 20% of damage dealt',
        [react('damage_to_heal', 'hit', 'heal', { of: 'green_sickness', pm: 200, to: 'lowest' })])],
    way('Long Fever', 'Sickness +1 s', [mod('green_sickness', { statusMs: 1000 })]),
    [opt('weakening_sickness', 'Weakening Sickness', 'Sick enemies: −6% damage dealt', [mod('green_sickness', { also: 'sapped' })], true),
      /* "next to the target": the area one tile wider each way (its 3x3 a 5x5) */
      opt('wide_sickness', 'Wide Sickness', 'Also hits enemies next to the target · −20% damage', [mod('green_sickness', { side: 2, outPm: -200 })]),
      opt('fast_sickness', 'Fast Sickness', '−3 s cooldown · −20% damage', [mod('green_sickness', { cdMs: -3000, outPm: -200 })])],
    way('Thin Dose', 'Green Sickness −2 mana', [mod('green_sickness', { mana: -2 })])),
  ...road(R, 'protective_ward', 'green_sickness.x1',
    [opt('tank_ward', 'Tank Ward', '+40% shield · Ally with the most enemies on them only', [mod('protective_ward', { outPm: 400, pick: 'most_held' })], true),
      opt('twin_ward', 'Twin Ward', 'Shields 2 allies · −40% shield each', [mod('protective_ward', { extra: 1, outPm: -400 })]),
      /* "on recast": the ward may be cast again on an ally holding this healer's own chipped ward, the part left coming back as mana */
      opt('lasting_ward', 'Lasting Ward', 'Unused shield returns as mana on recast · −20% shield', [mod('protective_ward', { refund: true, outPm: -200 })])],
    /* HELD: a shell has no duration in the engine (shields.js), so a longer one is nothing: the designer's call */
    way('Long Ward', 'Ward +1 s', [rule('shield_duration')]),
    [opt('quick_ward', 'Quick Ward', '−30% cooldown · −20% shield', [mod('protective_ward', { cdPm: -300, outPm: -200 })], true),
      opt('mending_ward', 'Mending Ward', '+6% healing received while the ward holds', [healIn(60, null, 'warded')]),
      opt('deep_ward', 'Deep Ward', '+30% shield · +6 s cooldown', [mod('protective_ward', { outPm: 300, cdMs: 6000 })])],
    way('Tank\'s Ward', 'Ward: +10% shield on your tank', [mod('protective_ward', { tankPm: 100 })])),
  node({ id: 'vow.watchful_healing', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Watchful Healing', tip: 'Enemy winding up: +20% healing · −3% healing',
    effects: [mod('*heal', { onWindupPm: 200, outPm: -30 })] }),
  node({ id: 'vow.still_mind', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Still Mind', tip: '3 s without casting: +50% mana regen · +10% spell mana cost',
    effects: [unitRule({ stillMs: 3000, stillRegenPm: 500 }), mod('*spell', { manaPm: 100 })] }),
  node({ id: 'vow.battle_healer', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Battle Healer', tip: 'Green Sickness +20% damage · −3% healing',
    effects: [mod('green_sickness', { outPm: 200 }), mod('*heal', { outPm: -30 })] }),
  node({ id: 'vow.lifeline', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Lifeline', tip: 'Ally near fall-back: next heal instant, no mana · 10 s per ally · −3% healing',
    effects: [react('free_heal_near_fall', 'near_fall', 'cast', { move: '*heal', free: true, clockMs: 10000, per: 'target' }), mod('*heal', { outPm: -30 })] }),
];

/* ── THE SHIELD · RESTORATION BORDER (17 section 6): its road leaves either country's first move road at crossroads I ── */
const SR = ['shield', 'restoration'];
const BORDER_NODES = [
  node({ id: 'border.shield_restoration.town', kind: 'border', countries: SR, after: ['challenge.x1', 'greater_mend.x1'], n: 'Border town',
    options: [opt('use_greater_mend', 'Use Greater Mend', 'Use Greater Mend with any weapon', [borrow('greater_mend')]),
      opt('use_shelter', 'Use Shelter', 'Use Shelter with any weapon', [borrow('shelter')])] }),
  node({ id: 'border.shield_restoration.x', kind: 'hybrid', countries: SR, after: ['border.shield_restoration.town'], n: 'Hybrid crossroads',
    needs: { crossroadsIn: SR },
    options: [opt('healing_shelter', 'Healing Shelter', 'Shelter heals 50% of the shield', [mod('shelter', { healOfShieldPm: 500 })], true),
      opt('guarded_mend', 'Guarded Mend', '+20% Greater Mend on taunting allies', [mod('greater_mend', { tauntingPm: 200 })]),
      opt('taunting_guard', 'Taunting Guard', 'Challenge: shield of 2% max health per enemy taunted', [react('challenge_shields', 'taunt', 'shield', { pm: 20 })])] }),
  node({ id: 'border.shield_restoration.vow', kind: 'vow', countries: SR, after: ['border.shield_restoration.x'], n: 'Shield Priest',
    needs: { crossroadsIn: SR }, tip: 'Challenge cast: heal yourself 3% max health · −3% healing on others',
    effects: [react('challenge_self_heal', 'taunt', 'heal', { pm: 30, to: 'self' }), mod('*heal', { outPm: -30 })] }),
];

/** EVERY NODE, in map order (a node's `after` always names an earlier row). */
export const TALENT_NODES = Object.freeze([...HEARTH_NODES, ...SHIELD_NODES, ...RESTORATION_NODES, ...BORDER_NODES]);

/** The rows by id. */
export const NODE_INDEX = Object.freeze(Object.fromEntries(TALENT_NODES.map((n) => [n.id, n])));

/* the kinds a node may be, and the ones a player picks an option of */
export const NODE_KINDS = Object.freeze(['start', 'rank', 'crossroads', 'waystone', 'open', 'vow', 'border', 'hybrid', 'crossing', 'final', 'milepost']);
export const PICK_KINDS = Object.freeze(['crossroads', 'border', 'hybrid', 'crossing', 'final', 'milepost']);
/* the step channels a node may raise (the engine reads offense and defense on the Danger scale: src/core/hunt/danger.js powerPm) */
const RAISES = ['offense', 'defense'];
/* the conditions a step row may hold on (src/core/hunt/talent-rows.js reads each) */
export const WHEN = Object.freeze(['party', 'solo', 'near_fall', 'shielded', 'taunting']);
const WHEN_RE = /^cast:[a-z_]{1,32}:\d{3,6}$/;
/* the numbers a mod may carry, and which of them are whole-from-the-start rules (tiles, flags) rather than ramped numbers */
/* THE ENGINE PIECES' NUMBERS (lane/talent-effects; src/core/hunt/heal-rules.js and abilities.js read them off the row's `fx`):
     hotMs, hotPm      a heal laid over hotMs (whole ticks of a second): hotPm of it again over time (Lingering Mending)
     alsoPm            alsoPm of the heal lands on a second ally too (alsoPick: lowest | nearest)
     extra             more targets for a one-target row (Twin Ward); limit: at most this many for a party row, by `pick`
     range, side       more reach for an ally row (tiles); a wider square area (its side, tiles)
     nearFallPm .. onWindupPm   permille more (or less) on a target near fall-back, not near it, in the front row, the back row, the
                       caster itself, every other, a tank, a hero holding a taunt; or while a monster winds up a spell
     statusPm          permille more (or less) of what the row's status does; windupSlowPm its slow on a wind-up, permille of the
                       row's own (whole: Slowing Frost's 2x)
     healOfShieldPm    a shell also heals that share of itself; manaBackNearPm, manaToHealedPm, manaOnCastPm  mana returns: a share of
                       the cast's mana back when a target healed was near fall-back, a share of each healed ally's max mana, of the caster's
     cleanse           harmful stacks taken off each ally healed (whole) */
export const MOD_NUMBERS = Object.freeze(['cdMs', 'cdPm', 'mana', 'manaPm', 'outPm', 'statusMs', 'holdMs', 'tauntRadius', 'r', 'radius', 'maxHits', 'overShieldPm',
  'hotMs', 'hotPm', 'alsoPm', 'extra', 'limit', 'range', 'side', 'nearFallPm', 'notNearFallPm', 'frontPm', 'backPm', 'selfPm', 'othersPm', 'tankPm',
  'tauntingPm', 'onWindupPm', 'statusPm', 'windupSlowPm', 'healOfShieldPm', 'manaBackNearPm', 'manaToHealedPm', 'manaOnCastPm', 'cleanse']);
export const MOD_WHOLE = Object.freeze(['tauntRadius', 'r', 'radius', 'maxHits', 'overShieldPm', 'solo', 'hotMs', 'extra', 'limit', 'range', 'side', 'windupSlowPm', 'cleanse']);
/* a mod's flags (true or absent: hotAll the whole heal over time, refund a recast ward's rest as mana, holdAll the Challenge holds a
   Stalker for its whole time) and its words (pick: whom a row takes; alsoPick: whom alsoPm lands on; also: a second status the cast
   lays; ground: the patch it leaves) */
export const MOD_FLAGS = Object.freeze(['solo', 'hotAll', 'refund', 'holdAll']);
export const MOD_WORDS = Object.freeze({ pick: Object.freeze(['lowest', 'most_held', 'target']), alsoPick: Object.freeze(['lowest', 'nearest']), also: 'status', ground: 'status' });
/* the pieces a modded row carries as `fx` (src/core/hunt/talent-rows.js moddedRow): every field but the ones moddedRow folds into the
   row itself */
const FOLDED = ['cdMs', 'cdPm', 'mana', 'manaPm', 'outPm', 'statusMs', 'holdMs', 'tauntRadius', 'r', 'radius', 'maxHits', 'overShieldPm', 'solo'];
export const MOD_FX = Object.freeze([...MOD_NUMBERS, ...MOD_FLAGS, ...Object.keys(MOD_WORDS)].filter((k) => !FOLDED.includes(k)));
/* the wildcard moves a mod may name */
export const MOD_GROUPS = Object.freeze(['*heal', '*spell']);

/* THE REACTIONS (src/core/hunt/reactions.js): what sets one off, and what it does. A reaction never sets off another (15: "a free cast or
   reset can't set off another one"). Its fields: move (a live move or '*heal': what a cast or a reset acts on), of (the moment's move it reads), pm (ramped), ms, capMs, clockMs (whole), per ('target':
   its clock is per target), row ('front' | 'back': ally_hit only on that row), melee (hit_taken only from beside), free (cast: no mana,
   no lane), to ('self' | 'lowest'), status (a status id), r and capPm (carry: its reach and its cap, whole) */
export const REACT_ON = Object.freeze(['hit', 'crit', 'kill', 'hit_taken', 'ally_hit', 'near_fall', 'shield_break', 'taunt', 'taunt_lost']);
export const REACT_DO = Object.freeze(['cast', 'reset', 'mana', 'heal', 'shield', 'status', 'echo', 'carry']);
const REACT_FIELDS = new Set(['kind', 'id', 'on', 'do', 'move', 'of', 'pm', 'ms', 'capMs', 'clockMs', 'per', 'row', 'melee', 'free', 'to', 'status', 'r', 'capPm']);
/* the unit rules (Hold Fast's no-switch, Bodyguard's share, Still Mind's regen): pm fields ramp, the rest whole */
export const UNIT_FIELDS = Object.freeze({ noSwitch: 'flag', guardPm: 'pm', guardR: 'whole', stillMs: 'whole', stillRegenPm: 'pm' });

/** Every problem with the map (or `nodes`, a map of the same shape: a test plants a defective row), as strings. Empty = valid. */
/** @param {readonly object[]} [nodes] @param {{ moves?: string[] }} [opts] */
export function validate(nodes = TALENT_NODES, opts = {}) {
  const out = [];
  const moves = opts.moves || null;   // a test passes the live move ids; the data module imports no ability table
  const seen = new Set();
  const countries = new Set([HEARTH, ...Object.keys(COUNTRY_ROADS), ...BORDERS.flat()]);
  const optIds = new Set();
  let starts = 0;
  for (const n of nodes) {
    const at = 'node ' + (n && n.id) + ': ';
    if (!n || typeof n.id !== 'string' || !/^[a-z_][a-z_0-9.]{0,63}$/.test(n.id)) { out.push(at + 'an id of [a-z_0-9.]'); continue; }
    if (seen.has(n.id)) out.push(at + 'listed twice');
    if (!NODE_KINDS.includes(n.kind)) out.push(at + 'kind ' + n.kind + ' is not one of ' + NODE_KINDS.join(', '));
    if (n.kind === 'start') { starts++; if (n.after.length) out.push(at + 'the start touches nothing'); }
    else if (!Array.isArray(n.after) || !n.after.length) out.push(at + 'touches no node (after)');
    else for (const a of n.after) if (!seen.has(a)) out.push(at + 'after ' + a + ' is not an earlier node (the map grows out of the start)');
    seen.add(n.id);
    if (n.country !== undefined && !countries.has(n.country)) out.push(at + 'country ' + n.country + ' is not a country');
    if (n.countries !== undefined) {
      const c = n.countries;
      if (!Array.isArray(c) || c.length !== 2 || c[0] === c[1] || !BORDERS.some(([a, b]) => (a === c[0] && b === c[1]) || (a === c[1] && b === c[0]))) {
        out.push(at + 'countries ' + c + ' is not a row of BORDERS'); }
    }
    if (n.move !== undefined && moves && !moves.includes(n.move)) out.push(at + 'move ' + n.move + ' is not a live move');
    if (PICK_KINDS.includes(n.kind) && n.kind !== 'crossing') {
      const want = n.kind === 'border' ? 2 : TALENT_RULES.options;
      if (!Array.isArray(n.options) || n.options.length !== want) out.push(at + 'a ' + n.kind + ' offers ' + want + ' options');
    }
    if (!PICK_KINDS.includes(n.kind) && n.options) out.push(at + 'a ' + n.kind + ' is not picked: no options');
    if (n.kind === 'vow') {
      const fx = n.effects || [];
      if (!fx.some((e) => (e.kind === 'step' && e.steps < 0) || (e.kind === 'mod' && costOf(e)))) out.push(at + 'a vow carries a cost that always bites');
      for (const e of fx) if (e.kind === 'step' && e.steps > 18) out.push(at + 'a vow gains at most 18 steps on its condition');
      for (const e of fx) if (e.kind === 'step' && e.steps < 0 && (e.when || e.key !== n.id)) out.push(at + 'a vow\'s cost holds always, keyed by the vow');
    }
    if ((n.kind === 'hybrid' || (n.kind === 'vow' && n.countries)) && !(n.needs && Array.isArray(n.needs.crossroadsIn) && n.needs.crossroadsIn.length === 2)) {
      out.push(at + 'a hybrid needs a crossroads in both countries'); }
    const fxOf = (list, where) => {
      if (list !== undefined && !Array.isArray(list)) { out.push(where + 'effects must be a list'); return; }
      for (const e of list || []) {
        if (e.kind === 'step') {
          if (!RAISES.includes(e.raises)) out.push(where + 'a step raises offense or defense');
          if (!Number.isInteger(e.steps) || e.steps === 0 || Math.abs(e.steps) > 18) out.push(where + 'a step is a whole number of steps, 1 to 18');
          if (typeof e.key !== 'string' || !e.key) out.push(where + 'a step names its stacking key');
          if (e.when !== undefined && !WHEN.includes(e.when) && !WHEN_RE.test(e.when)) out.push(where + 'when ' + e.when + ' is not a condition the engine reads');
        } else if (e.kind === 'mod') {
          if (typeof e.move !== 'string' || (!MOD_GROUPS.includes(e.move) && moves && !moves.includes(e.move))) out.push(where + 'a mod names a live move or a group');
          const nums = Object.keys(e).filter((k) => k !== 'kind' && k !== 'move');
          if (!nums.length) out.push(where + 'a mod changes something');
          for (const k of nums) {
            if (MOD_FLAGS.includes(k)) { if (e[k] !== true) out.push(where + k + ' is true or absent'); continue; }
            if (Object.prototype.hasOwnProperty.call(MOD_WORDS, k)) {
              const w = MOD_WORDS[k];
              if (w === 'status' ? !isStatus(e[k]) : !w.includes(e[k])) out.push(where + 'mod ' + k + ' ' + e[k] + ' is not ' + (w === 'status' ? 'a status' : w.join(' | ')));
              continue;
            }
            if (!MOD_NUMBERS.includes(k)) out.push(where + 'mod field ' + k + ' is not one the engine reads');
            else if (!Number.isInteger(e[k])) out.push(where + 'mod ' + k + ' is a whole number');
            else if (/Pm$/.test(k) && k !== 'overShieldPm' && k !== 'windupSlowPm' && (e[k] <= -1000 || e[k] > 1000)) out.push(where + 'mod ' + k + ' is a permille over -1000');
            else if (k === 'hotMs' && (e[k] <= 0 || e[k] % 1000 !== 0)) out.push(where + 'hotMs is whole seconds (a heal over time ticks once a second)');
          }
          if (e.hotAll && !e.hotMs) out.push(where + 'hotAll lays the heal over hotMs: name it');
        } else if (e.kind === 'react') {
          for (const k of Object.keys(e)) if (!REACT_FIELDS.has(k)) out.push(where + 'react field ' + k + ' is not one the engine reads');
          if (typeof e.id !== 'string' || !/^[a-z_]{1,48}$/.test(e.id)) out.push(where + 'a reaction names its id');
          if (!REACT_ON.includes(e.on)) out.push(where + 'react on ' + e.on + ' is not one of ' + REACT_ON.join(', '));
          if (!REACT_DO.includes(e.do)) out.push(where + 'react do ' + e.do + ' is not one of ' + REACT_DO.join(', '));
          if ((e.do === 'cast' || e.do === 'reset') && (typeof e.move !== 'string' || (e.move !== '*heal' && moves && !moves.includes(e.move)))) out.push(where + 'a ' + e.do + ' names a live move or *heal');
          if (['mana', 'heal', 'shield', 'echo', 'carry'].includes(e.do) && !(Number.isInteger(e.pm) && e.pm > 0 && e.pm <= 1000)) out.push(where + 'a ' + e.do + ' reaction carries pm 1..1000');
          if (e.of !== undefined && (typeof e.of !== 'string' || (moves && !moves.includes(e.of)))) out.push(where + 'a reaction reads the moments of a live move (of)');
          if (e.to !== undefined && !['self', 'lowest'].includes(e.to)) out.push(where + 'a reaction lands to self or lowest');
          if (e.do === 'status' && !isStatus(e.status)) out.push(where + 'a status reaction names a status');
          for (const k of ['ms', 'capMs', 'clockMs']) if (e[k] !== undefined && !(Number.isInteger(e[k]) && e[k] > 0 && e[k] % 100 === 0)) out.push(where + k + ' is a whole number of 100 ms steps');
          if ((e.do === 'reset' || e.do === 'echo') && !e.ms) out.push(where + 'a ' + e.do + ' names its ms');
          if (e.do === 'carry' && !(Number.isInteger(e.r) && e.r >= 1 && e.r <= 8 && Number.isInteger(e.capPm) && e.capPm > 0 && e.capPm <= 1000)) out.push(where + 'a carry names its reach r and its cap capPm');
        } else if (e.kind === 'heal_in') {
          if (!Number.isInteger(e.pm) || e.pm === 0 || Math.abs(e.pm) > TALENT_RULES.healInCapPm) out.push(where + 'healing received is a permille within the cap');
          if (e.when !== undefined && !WHEN.includes(e.when) && !WHEN_RE.test(e.when)) out.push(where + 'when ' + e.when + ' is not a condition the engine reads');
          if (e.scope !== undefined && e.scope !== 'warded') out.push(where + 'a heal_in scope is warded or absent');
        } else if (e.kind === 'unit') {
          const ks = Object.keys(e).filter((k) => k !== 'kind');
          if (!ks.length) out.push(where + 'a unit rule changes something');
          for (const k of ks) {
            const t = UNIT_FIELDS[k];
            if (!t) out.push(where + 'unit field ' + k + ' is not one the engine reads');
            else if (t === 'flag' ? e[k] !== true : !(Number.isInteger(e[k]) && e[k] > 0 && (t !== 'pm' || e[k] <= 1000))) out.push(where + 'unit ' + k + ' is ' + (t === 'flag' ? 'true' : 'a positive whole number'));
          }
        } else if (e.kind === 'borrow') {
          if (!Object.prototype.hasOwnProperty.call(BORROW_VALUES, e.move)) out.push(where + 'borrow ' + e.move + ' has no row in BORROW_VALUES');
        } else if (e.kind === 'rule') {
          if (typeof e.id !== 'string' || !/^[a-z_]{1,48}$/.test(e.id)) out.push(where + 'a rule names its id');
        } else out.push(where + 'effect kind ' + e.kind + ' is not step, mod, react, heal_in, unit, borrow or rule');
      }
    };
    fxOf(n.effects, at);
    for (const o of n.options || []) {
      if (!o || typeof o.id !== 'string' || !/^[a-z_]{1,48}$/.test(o.id)) { out.push(at + 'an option id of [a-z_]'); continue; }
      if (optIds.has(n.id + ':' + o.id)) out.push(at + 'option ' + o.id + ' twice');
      optIds.add(n.id + ':' + o.id);
      if (o.suggested !== undefined && o.suggested !== true && o.suggested !== 'party' && o.suggested !== 'solo') out.push(at + 'suggested is true, party or solo');
      fxOf(o.effects, at + 'option ' + o.id + ': ');
    }
    if (n.kind === 'crossroads' || n.kind === 'hybrid') {
      const sug = (n.options || []).filter((o) => o.suggested);
      if (!sug.length) out.push(at + 'a crossroads names its suggested option');
    }
  }
  if (starts !== 1) out.push('the map has ' + starts + ' starts (one: the Great Hearth)');
  for (const [country, list] of Object.entries(COUNTRY_ROADS)) for (const m of list) {
    const mine = nodes.filter((n) => n.move === m);
    if (mine.filter((n) => n.kind === 'rank').length !== 5 || mine.filter((n) => n.kind === 'crossroads').length !== 2) out.push('road ' + country + '/' + m + ': 5 rank stones and 2 crossroads');
  }
  for (const b of BORROW_BANDS) if (!(b.upTo > 0) || !Number.isInteger(b.borderPm) || (b.havoraPm !== null && !(b.havoraPm >= b.borderPm))) out.push('a borrow band is harsher at Havora');
  return out;
}

/* a mod that is a cost (a number that takes something): more cooldown or mana, less output */
function costOf(e) {
  return (e.outPm < 0) || (e.cdMs > 0) || (e.cdPm > 0) || (e.mana > 0) || (e.manaPm > 0);
}
