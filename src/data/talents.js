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
//               { kind: 'rule', id }       A RULE THE ENGINE CANNOT PLAY: held at 0 by the engine, listed by heldRules() and in the lane's
//                    report. The map names none (the designer, lane/roads-countries: a shell stands until a blow spends it, so the two
//                    "longer shell" nodes became bigger ones). "Every node fires on the dummy analyzer before it ships" (17 section 9):
//                    TALENT_RULES.live stays false while a node the suggested path takes is held
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
  /* towns of the full map (lane/roads-countries) whose move is owed its V0: never offered until the Lab measures it */
  power_strike: null,
  flame_strike: null,
  turning_cut: null,
  rend: null,
  raking_shot: null,
  circle_of_renewal: null,
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
  /* the full map (lane/roads-countries). Parry (Sword) and Gash (Dual Axe) join in wave 3 with their rows. Stagger replaces Quarry Blow
     then, so until it does the club's one road of its own is Turning Cut (17 section 5) */
  sword: Object.freeze(['power_strike', 'flame_strike']),
  club: Object.freeze(['turning_cut']),
  dual_axe: Object.freeze(['rend']),
  ranged: Object.freeze(['precision_shot', 'hunters_mark', 'raking_shot', 'flame_volley']),
  destruction: Object.freeze(['frost_lance', 'fireball', 'hoarfrost', 'arcane_barrier']),
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
  power_strike: 'Power Strike', flame_strike: 'Flame Strike', turning_cut: 'Turning Cut', rend: 'Rend', precision_shot: 'Precision Shot',
  hunters_mark: 'Hunter\'s Mark', raking_shot: 'Raking Shot', flame_volley: 'Flame Volley', frost_lance: 'Frost Lance', fireball: 'Fireball',
  hoarfrost: 'Hoarfrost', arcane_barrier: 'Arcane Barrier',
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
      /* (lane/roads-countries: Frost Slam lands no blow, so a "−20% damage" cost never bit; the cost is now its Chill's strength) */
      opt('quick_slam', 'Quick Slam', '−3 s cooldown · −25% Chill', [mod('frost_slam', { cdMs: -3000, statusPm: -250 })]),
      opt('wide_slam', 'Wide Slam', '+1 tile radius · −20% Chill', [mod('frost_slam', { r: 1, statusPm: -200 })])],
    way('Wide Ice', 'Frost Slam radius +1 tile', [mod('frost_slam', { r: 1 })])),
  ...road(S, 'shelter', 'frost_slam.x1',
    [opt('steady_shelter', 'Steady Shelter', '−40% shield · −15 s cooldown', [mod('shelter', { outPm: -400, cdMs: -15000 })], true),
      opt('deep_shelter', 'Deep Shelter', '2 lowest-health allies only · +80% shield', [mod('shelter', { limit: 2, pick: 'lowest', outPm: 800 })]),
      opt('stone_wall', 'Stone Wall', '+100% shield on you · −30% on allies', [mod('shelter', { selfPm: 1000, othersPm: -300 })])],
    way('Quick Stone', 'Shelter −5 s cooldown', [mod('shelter', { cdMs: -5000 })]),
    [opt('ready_shelter', 'Ready Shelter', 'Casts when an ally is near fall-back · +10 s cooldown',
      [react('shelter_on_near_fall', 'near_fall', 'cast', { move: 'shelter' }), mod('shelter', { cdMs: 10000 })]),
      /* (the designer, lane/roads-countries: a shell stands until a blow spends it, shields.js, so Long Shelter's "+4 s" had nothing to
         lengthen. Its job, a shell that lasts through more blows, is now a bigger one on a slower clock) */
      opt('firm_shelter', 'Firm Shelter', '+25% shield · +5 s cooldown', [mod('shelter', { outPm: 250, cdMs: 5000 })], true),
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
    /* (the designer, lane/roads-countries: a ward stands until spent, so "+1 s" became a bigger ward) */
    way('Thick Ward', 'Ward +5% shield', [mod('protective_ward', { outPm: 50 })]),
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

/* ── THE FULL MAP (game-designer, lane/roads-countries, 2026-11-23). Every option plays through a piece the engine has (a mod field its
   move's row reads, a reaction, a step row on a condition it reads, healing received). Where 16 or 17 wrote an option the engine cannot
   play (a monster type, a health line on the target, Bleed's tick speed or cap, a mark's own numbers, a lane past 75% full), it is
   re-written to one it can, keeping its job. Every number is a starting value at full size (Level 200) for the Lab. ── */

/* ── SWORD (17 section 5: Power Strike and Flame Strike live here; Parry joins in wave 3). The sword lane runs full: no cooldown cuts ── */
const SW = 'sword';
const SWORD_NODES = [
  ...road(SW, 'power_strike', 'hearth',
    [opt('heavy_strike', 'Heavy Strike', '+30% damage · +2 s cooldown', [mod('power_strike', { outPm: 300, cdMs: 2000 })], true),
      opt('cheap_strike', 'Cheap Strike', '−40% mana · −20% damage', [mod('power_strike', { manaPm: -400, outPm: -200 })]),
      opt('guard_strike', 'Guard Strike', '−20% damage · −4% damage taken for 3 s',
        [mod('power_strike', { outPm: -200 }), step('defense', 11, 'guard_strike', 'cast:power_strike:3000')], 'solo')],
    way('Keen Edge', 'Power Strike +5% damage', [mod('power_strike', { outPm: 50 })]),
    [opt('driving_strike', 'Driving Strike', 'Hits again for 25% 2 s later', [react('power_strike_echo', 'hit', 'echo', { of: 'power_strike', pm: 250, ms: 2000 })], true),
      opt('breaking_strike', 'Breaking Strike', 'Armor Break 6 s · −10% damage',
        [react('power_strike_break', 'hit', 'status', { of: 'power_strike', status: 'armor_break' }), mod('power_strike', { outPm: -100 })], 'party'),
      opt('rallying_strike', 'Rallying Strike', 'After Power Strike: +2% damage for 4 s', [step('offense', 6, 'rallying_strike', 'cast:power_strike:4000')])],
    way('Light Grip', 'Power Strike −2 mana', [mod('power_strike', { mana: -2 })])),
  /* Finishing and Opening Strike read the target's health line, which has no seam: Flame Strike's picks are what the burn leaves behind */
  ...road(SW, 'flame_strike', 'power_strike.x1',
    [opt('searing_strike', 'Searing Strike', 'Sick 6 s · −15% damage',
      [react('flame_sicken', 'hit', 'status', { of: 'flame_strike', status: 'sickness' }), mod('flame_strike', { outPm: -150 })], 'party'),
      opt('smoldering_strike', 'Smoldering Strike', 'Hits again for 30% 3 s later · −10% damage',
        [react('flame_echo', 'hit', 'echo', { of: 'flame_strike', pm: 300, ms: 3000 }), mod('flame_strike', { outPm: -100 })], true),
      opt('cowing_flame', 'Cowing Flame', 'Weakened 8 s · −15% damage',
        [react('flame_weaken', 'hit', 'status', { of: 'flame_strike', status: 'weakened' }), mod('flame_strike', { outPm: -150 })], 'solo')],
    way('Hot Iron', 'Flame Strike +5% damage', [mod('flame_strike', { outPm: 50 })]),
    [opt('bright_flame', 'Bright Flame', '+20% damage · +3 mana', [mod('flame_strike', { outPm: 200, mana: 3 })], true),
      opt('cheap_flame', 'Cheap Flame', '−40% mana · −20% damage', [mod('flame_strike', { manaPm: -400, outPm: -200 })]),
      opt('mana_flame', 'Mana Flame', 'Hits: +2% mana', [react('flame_mana', 'hit', 'mana', { of: 'flame_strike', pm: 20 })])],
    way('Kindling', 'Flame Strike −2 mana', [mod('flame_strike', { mana: -2 })])),
  /* THE VOWS (17 section 7): Single Combat's "Brutes and bosses" and Flowing Cuts' last move have no seam. Single Combat is the lone
     duelist now, and Parrying Stance takes Flowing Cuts' place */
  node({ id: 'vow.single_combat', kind: 'vow', country: SW, after: ['power_strike.x1'], n: 'Single Combat', tip: 'Alone: +6.5% damage · −3% damage dealt',
    effects: [step('offense', 18, 'single_combat', 'solo'), step('offense', -8, 'vow.single_combat')] }),
  node({ id: 'vow.duelists_guard', kind: 'vow', country: SW, after: ['power_strike.x1'], n: 'Duelist\'s Guard', tip: 'After Power Strike: −6% damage taken for 4 s · +3% damage taken',
    effects: [step('defense', 18, 'duelists_guard', 'cast:power_strike:4000'), step('defense', -8, 'vow.duelists_guard')] }),
  node({ id: 'vow.pressing_attack', kind: 'vow', country: SW, after: ['power_strike.x1'], n: 'Pressing Attack', tip: 'Power Strike and Flame Strike hit again for 15% 2 s later · +3% damage taken',
    effects: [react('press_power', 'hit', 'echo', { of: 'power_strike', pm: 150, ms: 2000 }), react('press_flame', 'hit', 'echo', { of: 'flame_strike', pm: 150, ms: 2000 }),
      step('defense', -8, 'vow.pressing_attack')] }),
  node({ id: 'vow.parrying_stance', kind: 'vow', country: SW, after: ['power_strike.x1'], n: 'Parrying Stance', tip: 'Hit in melee: attacker Weakened 4 s · −3% damage dealt',
    effects: [react('parry_weaken', 'hit_taken', 'status', { status: 'weakened', ms: 4000, melee: true }), step('offense', -8, 'vow.parrying_stance')] }),
];

/* ── CLUB (17 section 5: Turning Cut lives here; Stagger joins in wave 3). The club lane runs full: no cooldown cuts ── */
const CL = 'club';
const CLUB_NODES = [
  ...road(CL, 'turning_cut', 'hearth',
    [opt('wide_turn', 'Wide Turn', 'Hits up to 2 tiles away · −25% damage', [mod('turning_cut', { r: 1, outPm: -250 })], true),
      opt('close_turn', 'Close Turn', '+40% damage · 3 targets max', [mod('turning_cut', { outPm: 400, maxHits: -5 })]),
      opt('heavy_turn', 'Heavy Turn', '+30% damage · +2 s cooldown', [mod('turning_cut', { outPm: 300, cdMs: 2000 })])],
    way('Long Arm', 'Turning Cut +1 max target', [mod('turning_cut', { maxHits: 1 })]),
    [opt('mending_turn', 'Mending Turn', 'Hits: heal yourself 1% max health', [react('turning_cut_mend', 'hit', 'heal', { of: 'turning_cut', pm: 10, to: 'self' })], 'solo'),
      /* Reaping Turn's "below 30% health" has no seam: its job (finishing a pack) is now the overkill carried */
      opt('reaping_turn', 'Reaping Turn', 'Kills carry 50% of the overkill to the nearest enemy',
        [react('turning_cut_reap', 'kill', 'carry', { of: 'turning_cut', pm: 500, r: 2, capPm: 200 })], 'party'),
      opt('guarded_turn', 'Guarded Turn', 'After Turning Cut: −3% damage taken for 4 s', [step('defense', 8, 'guarded_turn', 'cast:turning_cut:4000')])],
    way('Loose Grip', 'Turning Cut −2 mana', [mod('turning_cut', { mana: -2 })])),
  /* THE VOWS (17 section 7): Crushing Blows' "Brutes", Aftershock's Stagger and Braced's "all on cooldown" have no seam. Crushing Blows breaks
     armor on any hit now, Quake takes Aftershock's place on Turning Cut, Braced is the lone club, Heavy Hand takes Lingering Blows' place */
  node({ id: 'vow.crushing_blows', kind: 'vow', country: CL, after: ['turning_cut.x1'], n: 'Crushing Blows', tip: 'Hits: Armor Break 6 s · once per 6 s a target · −3% damage dealt',
    effects: [react('crush_break', 'hit', 'status', { status: 'armor_break', clockMs: 6000, per: 'target' }), step('offense', -8, 'vow.crushing_blows')] }),
  node({ id: 'vow.quake', kind: 'vow', country: CL, after: ['turning_cut.x1'], n: 'Quake', tip: 'Turning Cut: Chill 2 s · −3% damage dealt',
    effects: [react('quake_chill', 'hit', 'status', { of: 'turning_cut', status: 'chill', ms: 2000 }), step('offense', -8, 'vow.quake')] }),
  node({ id: 'vow.braced', kind: 'vow', country: CL, after: ['turning_cut.x1'], n: 'Braced', tip: 'Alone: −6% damage taken · −3% damage dealt',
    effects: [step('defense', 17, 'braced', 'solo'), step('offense', -8, 'vow.braced')] }),
  node({ id: 'vow.heavy_hand', kind: 'vow', country: CL, after: ['turning_cut.x1'], n: 'Heavy Hand', tip: 'Turning Cut +20% damage · +3% damage taken',
    effects: [mod('turning_cut', { outPm: 200 }), step('defense', -8, 'vow.heavy_hand')] }),
];

/* ── DUAL AXE (17 section 5: Rend, 4 waystones; Gash joins in wave 3). Bleed's cap and tick speed have no seam: its waystones and picks
   move Bleed's length and strength instead ── */
const DA = 'dual_axe';
const AXE_NODES = [
  ...road(DA, 'rend', 'hearth',
    [opt('deep_cuts', 'Deep Cuts', 'Bleed lasts 50% longer', [mod('rend', { statusMs: 3000 })], true),
      /* Spread's jump on a death has no seam: its job (a pack shares the axe's pain) is now a Sickness the whole party hits through */
      opt('jagged_rend', 'Jagged Rend', 'Target Sick 6 s · −20% Bleed damage', [mod('rend', { also: 'sickness', statusPm: -200 })], 'party'),
      opt('quick_rend', 'Quick Rend', '−30% cooldown · −20% Bleed damage', [mod('rend', { cdPm: -300, statusPm: -200 })])],
    way('Long Cut', 'Bleed +1 s', [mod('rend', { statusMs: 1000 })]),
    [opt('deep_wounds', 'Deep Wounds', 'Bleed +20% damage', [mod('rend', { statusPm: 200 })], true),
      opt('crippling_cuts', 'Crippling Cuts', 'Target Weakened 8 s · −10% damage',
        [react('rend_weaken', 'hit', 'status', { of: 'rend', status: 'weakened' }), mod('rend', { outPm: -100 })], 'party'),
      opt('bloodletting', 'Bloodletting', 'Rend hits: heal yourself 1% max health', [react('rend_mend', 'hit', 'heal', { of: 'rend', pm: 10, to: 'self' })], 'solo')],
    way('Light Hatchet', 'Rend −2 mana', [mod('rend', { mana: -2 })])),
  /* the axe's two extra waystones (17 section 4), off its crossroads like the road's own */
  node({ id: 'rend.w3', kind: 'waystone', country: DA, move: 'rend', after: ['rend.x1'], n: 'Whetstone', tip: 'Bleed +10% damage', effects: [mod('rend', { statusPm: 100 })] }),
  node({ id: 'rend.w4', kind: 'waystone', country: DA, move: 'rend', after: ['rend.x2'], n: 'Red Hands', tip: 'Kills: heal yourself 2% max health',
    effects: [react('axe_kill_mend', 'kill', 'heal', { pm: 20, to: 'self' })] }),
  /* THE VOWS (17 section 7): Bleed's cap (Open Wounds), its cooldowns per bleeding enemy (Frenzy), an execute line (Bleed Out) and Bleed
     landing at once (Clean Cuts) have no seam. Each keeps its job and its best and worst cell through a piece the engine has */
  node({ id: 'vow.open_wounds', kind: 'vow', country: DA, after: ['rend.x1'], n: 'Open Wounds', tip: 'Crits: 2 Bleed stacks · −3% damage dealt',
    effects: [react('crit_bleed_one', 'crit', 'status', { status: 'bleed' }), react('crit_bleed_two', 'crit', 'status', { status: 'bleed' }), step('offense', -8, 'vow.open_wounds')] }),
  node({ id: 'vow.frenzy', kind: 'vow', country: DA, after: ['rend.x1'], n: 'Frenzy', tip: 'Kills: Rend ready 2 s sooner · +3% damage taken',
    effects: [react('frenzy_reset', 'kill', 'reset', { move: 'rend', ms: 2000, capMs: 4000 }), step('defense', -8, 'vow.frenzy')] }),
  node({ id: 'vow.bleed_out', kind: 'vow', country: DA, after: ['rend.x1'], n: 'Bleed Out', tip: 'Bleed +40% damage · −3% damage dealt',
    effects: [mod('rend', { statusPm: 400 }), step('offense', -8, 'vow.bleed_out')] }),
  node({ id: 'vow.clean_cuts', kind: 'vow', country: DA, after: ['rend.x1'], n: 'Clean Cuts', tip: 'Kills carry 50% of the overkill to the nearest enemy · −3% damage dealt',
    effects: [react('clean_carry', 'kill', 'carry', { pm: 500, r: 2, capPm: 200 }), step('offense', -8, 'vow.clean_cuts')] }),
];

/* ── RANGED (17 section 5: four moves; Precision Shot is the bow's first road). The bow's offense lane runs 78% full: no cooldown cuts
   on its shots ── */
const RA = 'ranged';
const RANGED_NODES = [
  ...road(RA, 'precision_shot', 'hearth',
    [opt('aimed_shot', 'Aimed Shot', '+25% damage · +3 mana', [mod('precision_shot', { outPm: 250, mana: 3 })], true),
      opt('barbed_shot', 'Barbed Shot', '1 Bleed stack · −10% damage',
        [react('precision_bleed', 'hit', 'status', { of: 'precision_shot', status: 'bleed' }), mod('precision_shot', { outPm: -100 })]),
      opt('piercing_shot', 'Piercing Shot', 'Kills carry 60% of the overkill to the nearest enemy',
        [react('precision_pierce', 'kill', 'carry', { of: 'precision_shot', pm: 600, r: 3, capPm: 250 })], 'party')],
    way('Fletching', 'Precision Shot +5% damage', [mod('precision_shot', { outPm: 50 })]),
    [opt('double_shot', 'Double Shot', 'Hits again for 30% 2 s later · +2 mana',
      [react('precision_echo', 'hit', 'echo', { of: 'precision_shot', pm: 300, ms: 2000 }), mod('precision_shot', { mana: 2 })], true),
      opt('pinning_shot', 'Pinning Shot', 'Chill 2 s', [react('precision_chill', 'hit', 'status', { of: 'precision_shot', status: 'chill', ms: 2000 })], 'solo'),
      opt('mana_shot', 'Mana Shot', 'Hits: +1% mana', [react('precision_mana', 'hit', 'mana', { of: 'precision_shot', pm: 10 })])],
    way('Steady Draw', 'Precision Shot −2 mana', [mod('precision_shot', { mana: -2 })])),
  /* The mark's own numbers (its 20% and 8 s) have no seam: Hunter's Mark's picks are what marking does for the archer. It sits on the
     support lane, so its cooldown may be cut */
  ...road(RA, 'hunters_mark', 'precision_shot.x1',
    [opt('hunters_focus', 'Hunter\'s Focus', 'After Mark: +2% damage for 8 s', [step('offense', 6, 'hunters_focus', 'cast:hunters_mark:8000')], true),
      opt('quick_mark', 'Quick Mark', '−3 s cooldown', [mod('hunters_mark', { cdMs: -3000 })]),
      opt('calm_mark', 'Calm Mark', 'Mark: +3% mana', [mod('hunters_mark', { manaOnCastPm: 30 })])],
    way('Light Mark', 'Hunter\'s Mark −2 mana', [mod('hunters_mark', { mana: -2 })]),
    [opt('stalking_mark', 'Stalking Mark', 'After Mark: −3% damage taken for 8 s', [step('defense', 8, 'stalking_mark', 'cast:hunters_mark:8000')], 'solo'),
      opt('ready_mark', 'Ready Mark', 'Kills: Mark ready 2 s sooner', [react('mark_reset', 'kill', 'reset', { move: 'hunters_mark', ms: 2000, capMs: 4000 })], 'party'),
      opt('sharp_mark', 'Sharp Mark', 'After Mark: +4% damage for 4 s', [step('offense', 11, 'sharp_mark', 'cast:hunters_mark:4000')])],
    way('Quick Hand', 'Hunter\'s Mark −1 s cooldown', [mod('hunters_mark', { cdMs: -1000 })])),
  /* Clean Sweep reads the target's health line and Close Rake the line's length, which have no seam */
  ...road(RA, 'raking_shot', 'hunters_mark.x1',
    [opt('twice_raked', 'Twice Raked', 'Hits again for 60% 2 s later · −30% damage',
      [react('rake_echo', 'hit', 'echo', { of: 'raking_shot', pm: 600, ms: 2000 }), mod('raking_shot', { outPm: -300 })], true),
      opt('pinning_rake', 'Pinning Rake', 'Target only · +50% damage', [mod('raking_shot', { pick: 'target', outPm: 500 })]),
      opt('bleeding_rake', 'Bleeding Rake', '1 Bleed stack · −10% damage',
        [react('rake_bleed', 'hit', 'status', { of: 'raking_shot', status: 'bleed' }), mod('raking_shot', { outPm: -100 })], 'party')],
    way('Barbed Tips', 'Raking Shot +5% damage', [mod('raking_shot', { outPm: 50 })]),
    [opt('crippling_rake', 'Crippling Rake', 'Chill 2 s · −15% damage',
      [react('rake_chill', 'hit', 'status', { of: 'raking_shot', status: 'chill', ms: 2000 }), mod('raking_shot', { outPm: -150 })], 'solo'),
      opt('thrifty_rake', 'Thrifty Rake', '−40% mana · −15% damage', [mod('raking_shot', { manaPm: -400, outPm: -150 })], true),
      opt('wounding_rake', 'Wounding Rake', 'Sapped 6 s · −15% damage',
        [react('rake_sap', 'hit', 'status', { of: 'raking_shot', status: 'sapped' }), mod('raking_shot', { outPm: -150 })], 'party')],
    way('Loose String', 'Raking Shot −2 mana', [mod('raking_shot', { mana: -2 })])),
  /* Full Volley reads a hit count and Spare Arrows the ammo, which have no seam */
  ...road(RA, 'flame_volley', 'raking_shot.x1',
    [opt('wide_volley', 'Wide Volley', '5×5 area · −25% damage', [mod('flame_volley', { side: 2, outPm: -250 })], true),
      opt('searing_volley', 'Searing Volley', 'Sick 6 s · −25% damage',
        [react('volley_sicken', 'hit', 'status', { of: 'flame_volley', status: 'sickness' }), mod('flame_volley', { outPm: -250 })], 'party'),
      opt('burning_volley', 'Burning Volley', 'Burning ground 4 s · −20% damage', [mod('flame_volley', { ground: 'burning_ground', outPm: -200 })])],
    way('Light Quiver', 'Flame Volley −3 mana', [mod('flame_volley', { mana: -3 })]),
    [opt('heavy_volley', 'Heavy Volley', '+25% damage · +3 mana', [mod('flame_volley', { outPm: 250, mana: 3 })], true),
      opt('echoing_volley', 'Echoing Volley', 'Hits again for 30% 2 s later · −10% damage',
        [react('volley_echo', 'hit', 'echo', { of: 'flame_volley', pm: 300, ms: 2000 }), mod('flame_volley', { outPm: -100 })]),
      opt('focused_volley', 'Focused Volley', 'Target only · +60% damage', [mod('flame_volley', { pick: 'target', outPm: 600 })], 'solo')],
    way('Hot Pitch', 'Flame Volley +5% damage', [mod('flame_volley', { outPm: 50 })])),
  /* THE VOWS (17 section 7): the bow's reach, a mark's length, enemies within 2 tiles and an extra target have no seam. Long Range and Point
     Blank are the bow's party and lone stances, Marked Prey rides the mark's cast, Hail of Arrows its two pack shots */
  node({ id: 'vow.long_range', kind: 'vow', country: RA, after: ['precision_shot.x1'], n: 'Long Range', tip: 'In a party: +6.5% damage · +3% damage taken',
    effects: [step('offense', 18, 'long_range', 'party'), step('defense', -8, 'vow.long_range')] }),
  node({ id: 'vow.point_blank', kind: 'vow', country: RA, after: ['precision_shot.x1'], n: 'Point Blank', tip: 'Alone: +6.5% damage · +3% damage taken',
    effects: [step('offense', 18, 'point_blank', 'solo'), step('defense', -8, 'vow.point_blank')] }),
  node({ id: 'vow.marked_prey', kind: 'vow', country: RA, after: ['precision_shot.x1'], n: 'Marked Prey', tip: 'After Hunter\'s Mark: +6.5% damage for 8 s · −3% damage dealt',
    effects: [step('offense', 18, 'marked_prey', 'cast:hunters_mark:8000'), step('offense', -8, 'vow.marked_prey')] }),
  node({ id: 'vow.hail_of_arrows', kind: 'vow', country: RA, after: ['precision_shot.x1'], n: 'Hail of Arrows', tip: 'Raking Shot and Flame Volley +20% damage · −3% damage dealt',
    effects: [mod('raking_shot', { outPm: 200 }), mod('flame_volley', { outPm: 200 }), step('offense', -8, 'vow.hail_of_arrows')] }),
];

/* ── DESTRUCTION (17 section 5: four moves; Frost Lance is the wand's first road, 17 section 13). The wand's offense lane runs 78% full:
   no cooldown cuts on its strikes ── */
const DE = 'destruction';
const DESTRUCTION_NODES = [
  ...road(DE, 'frost_lance', 'hearth',
    [opt('chilling_lance', 'Chilling Lance', 'Chill 4 s · −20% damage',
      [react('lance_chill', 'hit', 'status', { of: 'frost_lance', status: 'chill' }), mod('frost_lance', { outPm: -200 })], true),
      opt('splintering_lance', 'Splintering Lance', 'Hits again for 35% 2 s later · −15% damage',
        [react('lance_echo', 'hit', 'echo', { of: 'frost_lance', pm: 350, ms: 2000 }), mod('frost_lance', { outPm: -150 })]),
      opt('sapping_lance', 'Sapping Lance', 'Sapped 6 s · −10% damage',
        [react('lance_sap', 'hit', 'status', { of: 'frost_lance', status: 'sapped' }), mod('frost_lance', { outPm: -100 })], 'party')],
    way('Cold Edge', 'Frost Lance +5% damage', [mod('frost_lance', { outPm: 50 })]),
    [opt('deep_lance', 'Deep Lance', '+20% damage · +4 mana', [mod('frost_lance', { outPm: 200, mana: 4 })], true),
      opt('mana_lance', 'Mana Lance', 'Hits: +1.5% mana', [react('lance_mana', 'hit', 'mana', { of: 'frost_lance', pm: 15 })]),
      opt('through_lance', 'Through Lance', 'Kills carry 60% of the overkill to the nearest enemy',
        [react('lance_carry', 'kill', 'carry', { of: 'frost_lance', pm: 600, r: 3, capPm: 250 })])],
    way('Thin Lance', 'Frost Lance −2 mana', [mod('frost_lance', { mana: -2 })])),
  ...road(DE, 'fireball', 'frost_lance.x1',
    [opt('wide_fireball', 'Wide Fireball', '5×5 area · −30% damage', [mod('fireball', { side: 2, outPm: -300 })], true),
      opt('slow_burn', 'Slow Burn', 'Hits again for 60% 3 s later · −40% damage',
        [react('fireball_echo', 'hit', 'echo', { of: 'fireball', pm: 600, ms: 3000 }), mod('fireball', { outPm: -400 })]),
      opt('small_fireball', 'Small Fireball', '−40% mana · −25% damage', [mod('fireball', { manaPm: -400, outPm: -250 })], 'solo')],
    way('Spare Spark', 'Fireball −3 mana', [mod('fireball', { mana: -3 })]),
    [opt('heavy_fireball', 'Heavy Fireball', '+20% damage · +5 mana', [mod('fireball', { outPm: 200, mana: 5 })], true),
      opt('scorching_fireball', 'Scorching Fireball', 'Burning ground 4 s · −20% damage', [mod('fireball', { ground: 'burning_ground', outPm: -200 })], 'party'),
      opt('focused_fireball', 'Focused Fireball', 'Target only · +60% damage', [mod('fireball', { pick: 'target', outPm: 600 })], 'solo')],
    way('Dry Tinder', 'Fireball +5% damage', [mod('fireball', { outPm: 50 })])),
  ...road(DE, 'hoarfrost', 'fireball.x1',
    [opt('deep_hoarfrost', 'Deep Hoarfrost', 'Chill 6 s (from 4 s) · −20% damage', [mod('hoarfrost', { statusMs: 2000, outPm: -200 })], true),
      opt('hard_freeze', 'Hard Freeze', '+50% Chill · −60% damage', [mod('hoarfrost', { statusPm: 500, outPm: -600 })]),
      opt('numbing_frost', 'Numbing Frost', 'Weakened · −20% damage', [mod('hoarfrost', { also: 'weakened', outPm: -200 })], 'party')],
    way('Thin Frost', 'Hoarfrost −2 mana', [mod('hoarfrost', { mana: -2 })]),
    [opt('frozen_field', 'Frozen Field', 'Frozen ground 4 s', [mod('hoarfrost', { ground: 'frozen_ground' })], true),
      opt('wide_hoarfrost', 'Wide Hoarfrost', '5×5 area · −25% damage', [mod('hoarfrost', { side: 2, outPm: -250 })]),
      opt('brittle_frost', 'Brittle Frost', 'Armor Break 6 s · −15% damage',
        [react('hoarfrost_break', 'hit', 'status', { of: 'hoarfrost', status: 'armor_break' }), mod('hoarfrost', { outPm: -150 })], 'party')],
    way('Long Rime', 'Hoarfrost Chill +1 s', [mod('hoarfrost', { statusMs: 1000 })])),
  /* Shared Barrier shields another, which a self shell has no seam for: the barrier's picks are what holding it does for the mage */
  ...road(DE, 'arcane_barrier', 'hoarfrost.x1',
    [opt('thick_barrier', 'Thick Barrier', '+50% shield · +10 s cooldown', [mod('arcane_barrier', { outPm: 500, cdMs: 10000 })], true),
      opt('charged_barrier', 'Charged Barrier', '+3% damage while shielded', [step('offense', 8, 'charged_barrier', 'shielded')], 'party'),
      opt('quick_barrier', 'Quick Barrier', '−6 s cooldown · −30% shield', [mod('arcane_barrier', { cdMs: -6000, outPm: -300 })], 'solo')],
    way('Thin Ward', 'Arcane Barrier −5 mana', [mod('arcane_barrier', { mana: -5 })]),
    [opt('warding_barrier', 'Warding Barrier', '−3% damage taken while shielded', [step('defense', 8, 'warding_barrier', 'shielded')], true),
      opt('mana_barrier', 'Mana Barrier', 'Breaks: +4% mana', [react('barrier_mana', 'shield_break', 'mana', { pm: 40 })]),
      opt('reforming_barrier', 'Reforming Barrier', 'Breaks: ready 5 s sooner',
        [react('barrier_reform', 'shield_break', 'reset', { move: 'arcane_barrier', ms: 5000, capMs: 5000 })], 'solo')],
    way('Deep Ward', 'Arcane Barrier +10% shield', [mod('arcane_barrier', { outPm: 100 })])),
  /* THE VOWS (17 section 7): "can't cast" has no seam, so each Focus pays in the other element's damage. Held together their damage
     cancels and two vow slots buy only a tile and 2 s of Chill: a poor trade, never a free one */
  node({ id: 'vow.cold_focus', kind: 'vow', country: DE, after: ['frost_lance.x1'], n: 'Cold Focus', tip: 'Frost spells +20% damage · Chill +2 s · Fireball −20% damage',
    effects: [mod('frost_lance', { outPm: 200 }), mod('hoarfrost', { outPm: 200, statusMs: 2000 }), mod('fireball', { outPm: -200 })] }),
  node({ id: 'vow.fire_focus', kind: 'vow', country: DE, after: ['frost_lance.x1'], n: 'Fire Focus', tip: 'Fireball +20% damage · +1 tile radius · Frost spells −20% damage',
    effects: [mod('fireball', { outPm: 200, side: 2 }), mod('frost_lance', { outPm: -200 }), mod('hoarfrost', { outPm: -200 })] }),
  node({ id: 'vow.barrier_mage', kind: 'vow', country: DE, after: ['frost_lance.x1'], n: 'Barrier Mage', tip: 'Arcane Barrier breaks: cast it again · once per 20 s · −3% damage dealt',
    effects: [react('barrier_recast', 'shield_break', 'cast', { move: 'arcane_barrier', clockMs: 20000 }), step('offense', -8, 'vow.barrier_mage')] }),
  node({ id: 'vow.heavy_casting', kind: 'vow', country: DE, after: ['frost_lance.x1'], n: 'Heavy Casting', tip: '+20% spell damage · +50% cooldowns',
    effects: [mod('*spell', { outPm: 200, cdPm: 500 })] }),
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

/* ── THE OTHER EIGHT BORDERS (17 section 6; game-designer, lane/roads-countries). A border's road leaves both countries' first move road
   at crossroads I: its town, then its hybrid crossroads, then its hybrid vow. A town's move with no measured V0 (BORROW_VALUES null) is
   shown and never lent until the Lab measures it; its other move works. Where 17 wrote a hybrid the engine cannot play, or one that
   repeats a country's own option at no cost, it is re-written to one that joins the two countries ── */
const useMove = (m) => opt('use_' + m, 'Use ' + MOVE_NAMES[m], 'Use ' + MOVE_NAMES[m] + ' with any weapon', [borrow(m)]);
function border(a, b, moves, hybrid, vow) {
  const id = 'border.' + a + '_' + b, C = [a, b];
  return [
    node({ id: id + '.town', kind: 'border', countries: C, after: [COUNTRY_ROADS[a][0] + '.x1', COUNTRY_ROADS[b][0] + '.x1'], n: 'Border town', options: moves.map(useMove) }),
    node({ id: id + '.x', kind: 'hybrid', countries: C, after: [id + '.town'], n: 'Hybrid crossroads', needs: { crossroadsIn: C }, options: hybrid }),
    node({ id: id + '.vow', kind: 'vow', countries: C, after: [id + '.x'], needs: { crossroadsIn: C }, n: vow.n, tip: vow.tip, effects: vow.effects }),
  ];
}
const MORE_BORDERS = [
  ...border('club', 'dual_axe', ['rend', 'turning_cut'],
    [opt('wide_wounds', 'Wide Wounds', 'Turning Cut: 1 Bleed stack', [react('turn_bleed', 'hit', 'status', { of: 'turning_cut', status: 'bleed' })], true),
      opt('crushing_cuts', 'Crushing Cuts', 'Rend: Armor Break 6 s', [react('rend_break', 'hit', 'status', { of: 'rend', status: 'armor_break' })]),
      opt('heavy_bleed', 'Heavy Bleed', 'Bleed +15% damage', [mod('rend', { statusPm: 150 })])],
    { n: 'Butcher', tip: 'Crits: Armor Break 6 s · +10% Rend mana cost',
      effects: [react('butcher_break', 'crit', 'status', { status: 'armor_break' }), mod('rend', { manaPm: 100 })] }),
  ...border('dual_axe', 'ranged', ['rend', 'raking_shot'],
    [opt('barbed_arrows', 'Barbed Arrows', 'Hits: 1 Bleed stack · once per 4 s a target',
      [react('barbed_bleed', 'hit', 'status', { status: 'bleed', clockMs: 4000, per: 'target' })], true),
      opt('hamstring', 'Hamstring', 'Rend: Chill 2 s', [react('rend_chill', 'hit', 'status', { of: 'rend', status: 'chill', ms: 2000 })], 'solo'),
      opt('skinners_draw', 'Skinner\'s Draw', 'Kills: +3% mana', [react('skinner_mana', 'kill', 'mana', { pm: 30 })])],
    { n: 'Blood Trail', tip: 'Hits: 1 Bleed stack · once per 2 s a target · −3% damage dealt',
      effects: [react('trail_bleed', 'hit', 'status', { status: 'bleed', clockMs: 2000, per: 'target' }), step('offense', -8, 'border.dual_axe_ranged.vow')] }),
  ...border('ranged', 'destruction', ['hunters_mark', 'frost_lance'],
    [opt('mana_arrows', 'Mana Arrows', 'Precision Shot +20% damage · +6 mana', [mod('precision_shot', { outPm: 200, mana: 6 })], true),
      opt('frost_arrows', 'Frost Arrows', 'Flame Volley: Chill 2 s · −15% damage',
        [react('volley_chill', 'hit', 'status', { of: 'flame_volley', status: 'chill', ms: 2000 }), mod('flame_volley', { outPm: -150 })]),
      opt('hexed_arrows', 'Hexed Arrows', 'Precision Shot: Sapped 6 s · −10% damage',
        [react('precision_sap', 'hit', 'status', { of: 'precision_shot', status: 'sapped' }), mod('precision_shot', { outPm: -100 })], 'party')],
    { n: 'Spellbow', tip: 'Hits: Chill 2 s · once per 4 s a target · −3% damage dealt',
      effects: [react('spellbow_chill', 'hit', 'status', { status: 'chill', ms: 2000, clockMs: 4000, per: 'target' }), step('offense', -8, 'border.ranged_destruction.vow')] }),
  ...border('destruction', 'shield', ['hoarfrost', 'challenge'],
    [opt('cold_shoulder', 'Cold Shoulder', 'Frost Slam: Weakened', [mod('frost_slam', { also: 'weakened' })], true),
      opt('rime_plate', 'Rime Plate', 'Hit in melee: attacker Chilled 2 s · once per 6 s',
        [react('rime_chill', 'hit_taken', 'status', { status: 'chill', ms: 2000, melee: true, clockMs: 6000 })], 'solo'),
      opt('frozen_guard', 'Frozen Guard', 'After Hoarfrost: −3% damage taken for 4 s', [step('defense', 8, 'frozen_guard', 'cast:hoarfrost:4000')])],
    { n: 'Winter Guard', tip: 'Hits: Sapped 4 s · once per 6 s a target · −3% damage dealt',
      effects: [react('winter_sap', 'hit', 'status', { status: 'sapped', ms: 4000, clockMs: 6000, per: 'target' }), step('offense', -8, 'border.destruction_shield.vow')] }),
  ...border('restoration', 'sword', ['circle_of_renewal', 'flame_strike'],
    [opt('mending_strike', 'Mending Strike', 'Flame Strike heals the lowest-health ally for 25% of damage dealt',
      [react('flame_mend', 'hit', 'heal', { of: 'flame_strike', pm: 250, to: 'lowest' })], true),
      opt('mana_strike', 'Mana Strike', 'Power Strike hits: +2% mana', [react('power_mana', 'hit', 'mana', { of: 'power_strike', pm: 20 })]),
      opt('second_strike', 'Second Strike', 'After Mend: +4% damage for 4 s', [step('offense', 11, 'second_strike', 'cast:mend:4000')], 'solo')],
    { n: 'Mending Blade', tip: 'Hits: 8% of damage heals the lowest-health ally · −3% healing',
      effects: [react('blade_mend', 'hit', 'heal', { pm: 80, to: 'lowest' }), mod('*heal', { outPm: -30 })] }),
  ...border('sword', 'club', ['flame_strike', 'power_strike'],
    [opt('tempered_strikes', 'Tempered Strikes', 'After Turning Cut: +3% damage for 3 s', [step('offense', 8, 'tempered_strikes', 'cast:turning_cut:3000')], true),
      opt('cutting_weight', 'Cutting Weight', 'Turning Cut +15% damage · +2 mana', [mod('turning_cut', { outPm: 150, mana: 2 })]),
      opt('iron_rhythm', 'Iron Rhythm', 'Turning Cut hits: +0.5% mana', [react('turn_mana', 'hit', 'mana', { of: 'turning_cut', pm: 5 })])],
    { n: 'Smith\'s Arm', tip: 'After Turning Cut: +6.5% damage for 4 s · Power Strike +2 s cooldown',
      effects: [step('offense', 18, 'smiths_arm', 'cast:turning_cut:4000'), mod('power_strike', { cdMs: 2000 })] }),
  ...border('destruction', 'restoration', ['frost_lance', 'greater_mend'],
    [opt('cold_mercy', 'Cold Mercy', 'Frost Lance heals the lowest-health ally for 20% of damage dealt',
      [react('lance_mend', 'hit', 'heal', { of: 'frost_lance', pm: 200, to: 'lowest' })], true),
      opt('sick_fire', 'Sick Fire', 'Fireball: Sick 6 s · −15% damage',
        [react('fireball_sicken', 'hit', 'status', { of: 'fireball', status: 'sickness' }), mod('fireball', { outPm: -150 })], 'party'),
      opt('still_water', 'Still Water', 'After Hoarfrost: +6% healing received for 4 s', [healIn(60, 'cast:hoarfrost:4000')])],
    { n: 'Hedge Healer', tip: 'Mend +40% healing · also heals the lowest-health ally for 40% · −3% damage dealt',
      effects: [mod('mend', { outPm: 400, alsoPm: 400, alsoPick: 'lowest' }), step('offense', -8, 'border.destruction_restoration.vow')] }),
  ...border('sword', 'shield', ['turning_cut', 'challenge'],
    [opt('pressing_guard', 'Pressing Guard', 'After Challenge: +4% damage for 4 s', [step('offense', 11, 'pressing_guard', 'cast:challenge:4000')], true),
      opt('shield_wall', 'Shield Wall', 'While you hold a taunt: +3% damage', [step('offense', 8, 'shield_wall', 'taunting')]),
      opt('covering_strike', 'Covering Strike', 'After Flame Strike: −3% damage taken for 4 s', [step('defense', 8, 'covering_strike', 'cast:flame_strike:4000')], 'solo')],
    { n: 'Off Tank', tip: 'While you hold a taunt: −6% damage taken · −3% damage dealt',
      effects: [step('defense', 17, 'off_tank', 'taunting'), step('offense', -8, 'border.sword_shield.vow')] }),
];

/** EVERY NODE, in map order (a node's `after` always names an earlier row). */
export const TALENT_NODES = Object.freeze([...HEARTH_NODES, ...SHIELD_NODES, ...RESTORATION_NODES, ...SWORD_NODES, ...CLUB_NODES, ...AXE_NODES,
  ...RANGED_NODES, ...DESTRUCTION_NODES, ...BORDER_NODES, ...MORE_BORDERS]);

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
