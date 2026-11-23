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
//               { kind: 'rule', id }       A RULE THE ENGINE CANNOT PLAY YET (a heal over time, a reaction to a hit, a target rule, a
//                    healing-received channel): written now so the map is whole, held at 0 by the engine, listed by heldRules() and in the
//                    lane's report. "Every node fires on the dummy analyzer before it ships" (17 section 9): TALENT_RULES.live stays false
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
    [opt('second_wind', 'Second Wind', 'Mend +60% healing near fall-back · −20% otherwise', [rule('mend_near_fall_split')]),
      opt('steady_mend', 'Steady Mend', 'Mend heals over 6 s · +25% healing', [rule('mend_over_time')], true),
      opt('shared_mend', 'Shared Mend', 'Mend also heals the nearest ally for 50%', [rule('mend_shared')])],
    way('Light Hands', 'Mend −2 mana', [mod('mend', { mana: -2 })]),
    /* crossroads II: 16 writes only one Mend crossroads; these three are this lane's, for the designer to rule (17 section 4 counts two) */
    [opt('deep_mend', 'Deep Mend', 'Mend +20% healing · +3 mana', [mod('mend', { outPm: 200, mana: 3 })]),
      opt('light_mend', 'Light Mend', 'Mend −40% mana · −20% healing', [mod('mend', { manaPm: -400, outPm: -200 })], true),
      opt('bright_mend', 'Bright Mend', '+6% healing received near fall-back', [rule('heal_in_near_fall')])],
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
      opt('guarding_challenge', 'Guarding Challenge', 'Casts when an enemy attacks a back-row ally · Party only', [rule('challenge_guard_back_row')])],
    way('Reaching Call', 'Challenge range +1 tile', [mod('challenge', { tauntRadius: 1 })]),
    [opt('drawing_challenge', 'Drawing Challenge', 'Taunted Stalkers stay for the full taunt', [rule('challenge_holds_stalkers')]),
      opt('mended', 'Mended', '+6% healing received while you hold a taunt', [rule('heal_in_taunting')], true),
      opt('echoing_challenge', 'Echoing Challenge', 'Recasts when a taunt ends early · +4 s cooldown', [rule('challenge_echo'), mod('challenge', { cdMs: 4000 })])],
    way('Braced Call', 'Challenge: −2% damage taken for 4 s', [step('defense', 6, 'taunt_brace', 'cast:challenge:4000')])),
  ...road(S, 'frost_slam', 'challenge.x1',
    [opt('long_frost', 'Long Frost', 'Chill 6 s (from 4 s) · +2 s cooldown', [mod('frost_slam', { statusMs: 2000, cdMs: 2000 })], true),
      opt('pinning_frost', 'Pinning Frost', 'Target only · +50% Chill', [rule('frost_slam_single_strong')]),
      opt('slowing_frost', 'Slowing Frost', 'Chill slows wind-ups 2× · −50% Chill on attacks', [rule('chill_windups')])],
    way('Cold Footing', 'Frost Slam usable solo · −30% Chill', [mod('frost_slam', { solo: true }), rule('chill_weaker')]),
    [opt('cold_ground', 'Cold Ground', 'Frozen ground 4 s · Chills enemies on it', [rule('frozen_ground')], true),
      opt('quick_slam', 'Quick Slam', '−3 s cooldown · −20% damage', [mod('frost_slam', { cdMs: -3000, outPm: -200 })]),
      opt('wide_slam', 'Wide Slam', '+1 tile radius · −15% damage', [mod('frost_slam', { r: 1, outPm: -150 })])],
    way('Wide Ice', 'Frost Slam radius +1 tile', [mod('frost_slam', { r: 1 })])),
  ...road(S, 'shelter', 'frost_slam.x1',
    [opt('steady_shelter', 'Steady Shelter', '−40% shield · −15 s cooldown', [mod('shelter', { outPm: -400, cdMs: -15000 })], true),
      opt('deep_shelter', 'Deep Shelter', '2 lowest-health allies only · +80% shield', [rule('shelter_two_lowest')]),
      opt('stone_wall', 'Stone Wall', '+100% shield on you · −30% on allies', [rule('shelter_self_heavy')])],
    way('Quick Stone', 'Shelter −5 s cooldown', [mod('shelter', { cdMs: -5000 })]),
    [opt('ready_shelter', 'Ready Shelter', 'Casts when an ally is near fall-back · +10 s cooldown', [rule('shelter_on_near_fall'), mod('shelter', { cdMs: 10000 })]),
      opt('long_shelter', 'Long Shelter', '+4 s shield duration', [rule('shield_duration')], true),
      opt('bright_shelter', 'Bright Shelter', '+6% healing received while shielded', [rule('heal_in_shielded')])],
    way('Guarding Stone', 'Shelter: +10% shield on allies near fall-back', [rule('shelter_near_fall_bonus')])),
  /* THE VOWS (17 section 7): beside the country's first crossroads; +18 on the condition, −8 always; never a max-health cost */
  node({ id: 'vow.hold_fast', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Hold Fast', tip: 'Enemies on you can\'t switch targets · −3% damage dealt',
    effects: [rule('no_switch_off_holder'), step('offense', -8, 'vow.hold_fast')] }),
  node({ id: 'vow.bodyguard', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Bodyguard', tip: 'Take 30% of damage dealt to back-row allies within 2 tiles · −3% damage dealt · Party only',
    effects: [rule('bodyguard_share'), step('offense', -8, 'vow.bodyguard')] }),
  node({ id: 'vow.cold_iron', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Cold Iron', tip: 'Hit in melee: Chill the attacker 2 s · −3% damage dealt',
    effects: [rule('chill_on_hit_taken'), step('offense', -8, 'vow.cold_iron')] }),
  node({ id: 'vow.last_stand', kind: 'vow', country: S, after: ['challenge.x1'], n: 'Last Stand', tip: 'Near fall-back: −20% damage taken · −3% damage dealt',
    effects: [step('defense', 18, 'last_stand', 'near_fall'), step('offense', -8, 'vow.last_stand')] }),
];

/* ── RESTORATION (17 section 5; Undertow's road cut with the move) ── */
const R = 'restoration';
const RESTORATION_NODES = [
  ...road(R, 'greater_mend', 'hearth',
    [opt('light_mending', 'Light Mending', '−40% mana · −25% healing', [mod('greater_mend', { manaPm: -400, outPm: -250 })]),
      opt('deep_mending', 'Deep Mending', '+40% healing on allies near fall-back', [rule('heal_more_near_fall')]),
      opt('split_mending', 'Split Mending', '30% of the heal also lands on the next lowest-health ally', [rule('heal_split')], true)],
    way('Long Reach', 'Greater Mend range +1 tile', [rule('heal_range')]),
    [opt('thrifty_mending', 'Thrifty Mending', '50% mana back on allies near fall-back', [rule('mana_back_near_fall')], true),
      opt('lingering_mending', 'Lingering Mending', '25% of the heal again over 4 s', [rule('heal_over_time')]),
      opt('reaching_mending', 'Reaching Mending', '+3 tiles range', [rule('heal_range')])],
    way('Spare Water', 'Greater Mend −2 mana', [mod('greater_mend', { mana: -2 })])),
  ...road(R, 'circle_of_renewal', 'greater_mend.x1',
    [opt('lasting_circle', 'Lasting Circle', 'Heals over 6 s · +30% healing', [rule('heal_over_time')], true),
      opt('tight_circle', 'Tight Circle', 'Allies within 3 tiles only · +40% healing', [mod('circle_of_renewal', { radius: -5, outPm: 400 })]),
      opt('light_circle', 'Light Circle', '−40% mana · −25% healing', [mod('circle_of_renewal', { manaPm: -400, outPm: -250 })])],
    way('Thin Ring', 'Circle −5 mana', [mod('circle_of_renewal', { mana: -5 })]),
    [opt('rallying_circle', 'Rallying Circle', '+30% healing on allies near fall-back', [rule('heal_more_near_fall')]),
      opt('mana_circle', 'Mana Circle', '+2% mana to each ally healed', [rule('mana_to_healed')], true),
      opt('front_circle', 'Front Circle', '+15% healing on the front row · −15% on the back row', [rule('heal_by_row')])],
    way('Front Ring', 'Circle: +5% healing on the front row', [rule('heal_by_row')])),
  ...road(R, 'spring_tide', 'circle_of_renewal.x1',
    [opt('ebb_tide', 'Ebb Tide', '−50% healing, cooldown and mana', [mod('spring_tide', { outPm: -500, cdPm: -500, manaPm: -500 })]),
      opt('high_tide', 'High Tide', 'Healing past full health stays as a shield', [mod('spring_tide', { overShieldPm: 1000 })], true),
      opt('turning_tide', 'Turning Tide', '+50% healing on allies near fall-back · −25% on the rest', [rule('heal_more_near_fall')])],
    way('Full Spring', 'Spring Tide: +2% mana to you', [rule('mana_on_cast')]),
    [opt('rising_tide', 'Rising Tide', '−15 s cooldown', [mod('spring_tide', { cdMs: -15000 })], true),
      opt('clearing_tide', 'Clearing Tide', 'Removes 1 harmful effect from each ally healed', [rule('cleanse')]),
      opt('deep_tide', 'Deep Tide', '+30% healing · +20 s cooldown', [mod('spring_tide', { outPm: 300, cdMs: 20000 })])],
    way('Quick Spring', 'Spring Tide −10 s cooldown', [mod('spring_tide', { cdMs: -10000 })])),
  ...road(R, 'green_sickness', 'spring_tide.x1',
    [opt('lingering_sickness', 'Lingering Sickness', 'Sickness 10 s (from 6 s) · −30% damage', [mod('green_sickness', { statusMs: 4000, outPm: -300 })], true),
      opt('single_dose', 'Single Dose', 'Target only · Sickness 20% (from 10%)', [rule('sickness_single_strong')]),
      opt('draining_sickness', 'Draining Sickness', 'Heals the lowest-health ally for 20% of damage dealt', [rule('damage_to_heal')])],
    way('Long Fever', 'Sickness +1 s', [mod('green_sickness', { statusMs: 1000 })]),
    [opt('weakening_sickness', 'Weakening Sickness', 'Sick enemies: −6% damage dealt', [rule('sick_deal_less')], true),
      opt('wide_sickness', 'Wide Sickness', 'Also hits enemies next to the target · −20% damage', [rule('sickness_splash')]),
      opt('fast_sickness', 'Fast Sickness', '−3 s cooldown · −20% damage', [mod('green_sickness', { cdMs: -3000, outPm: -200 })])],
    way('Thin Dose', 'Green Sickness −2 mana', [mod('green_sickness', { mana: -2 })])),
  ...road(R, 'protective_ward', 'green_sickness.x1',
    [opt('tank_ward', 'Tank Ward', '+40% shield · Ally with the most enemies on them only', [rule('ward_on_most_held')], true),
      opt('twin_ward', 'Twin Ward', 'Shields 2 allies · −40% shield each', [rule('ward_two')]),
      opt('lasting_ward', 'Lasting Ward', 'Unused shield returns as mana on recast · −20% shield', [rule('ward_refund'), mod('protective_ward', { outPm: -200 })])],
    way('Long Ward', 'Ward +1 s', [rule('shield_duration')]),
    [opt('quick_ward', 'Quick Ward', '−30% cooldown · −20% shield', [mod('protective_ward', { cdPm: -300, outPm: -200 })], true),
      opt('mending_ward', 'Mending Ward', '+6% healing received while the ward holds', [rule('heal_in_shielded')]),
      opt('deep_ward', 'Deep Ward', '+30% shield · +6 s cooldown', [mod('protective_ward', { outPm: 300, cdMs: 6000 })])],
    way('Tank\'s Ward', 'Ward: +10% shield on your tank', [rule('ward_tank_bonus')])),
  node({ id: 'vow.watchful_healing', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Watchful Healing', tip: 'Enemy winding up: +20% healing · −3% healing',
    effects: [rule('heal_more_on_windup'), mod('*heal', { outPm: -30 })] }),
  node({ id: 'vow.still_mind', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Still Mind', tip: '3 s without casting: +50% mana regen · +10% spell mana cost',
    effects: [rule('regen_when_still'), mod('*spell', { manaPm: 100 })] }),
  node({ id: 'vow.battle_healer', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Battle Healer', tip: 'Green Sickness +20% damage · −3% healing',
    effects: [mod('green_sickness', { outPm: 200 }), mod('*heal', { outPm: -30 })] }),
  node({ id: 'vow.lifeline', kind: 'vow', country: R, after: ['greater_mend.x1'], n: 'Lifeline', tip: 'Ally near fall-back: next heal instant, no mana · 10 s per ally · −3% healing',
    effects: [rule('free_heal_near_fall'), mod('*heal', { outPm: -30 })] }),
];

/* ── THE SHIELD · RESTORATION BORDER (17 section 6): its road leaves either country's first move road at crossroads I ── */
const SR = ['shield', 'restoration'];
const BORDER_NODES = [
  node({ id: 'border.shield_restoration.town', kind: 'border', countries: SR, after: ['challenge.x1', 'greater_mend.x1'], n: 'Border town',
    options: [opt('use_greater_mend', 'Use Greater Mend', 'Use Greater Mend with any weapon', [borrow('greater_mend')]),
      opt('use_shelter', 'Use Shelter', 'Use Shelter with any weapon', [borrow('shelter')])] }),
  node({ id: 'border.shield_restoration.x', kind: 'hybrid', countries: SR, after: ['border.shield_restoration.town'], n: 'Hybrid crossroads',
    needs: { crossroadsIn: SR },
    options: [opt('healing_shelter', 'Healing Shelter', 'Shelter heals 50% of the shield', [rule('shelter_heals')], true),
      opt('guarded_mend', 'Guarded Mend', '+20% Greater Mend on taunting allies', [rule('heal_more_on_taunting')]),
      opt('taunting_guard', 'Taunting Guard', 'Challenge: shield of 2% max health per enemy taunted', [rule('challenge_shields')])] }),
  node({ id: 'border.shield_restoration.vow', kind: 'vow', countries: SR, after: ['border.shield_restoration.x'], n: 'Shield Priest',
    needs: { crossroadsIn: SR }, tip: 'Challenge cast: heal yourself 3% max health · −3% healing on others',
    effects: [rule('challenge_self_heal'), mod('*heal', { outPm: -30 })] }),
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
export const MOD_NUMBERS = Object.freeze(['cdMs', 'cdPm', 'mana', 'manaPm', 'outPm', 'statusMs', 'holdMs', 'tauntRadius', 'r', 'radius', 'maxHits', 'overShieldPm']);
export const MOD_WHOLE = Object.freeze(['tauntRadius', 'r', 'radius', 'maxHits', 'overShieldPm', 'solo']);
/* the wildcard moves a mod may name */
export const MOD_GROUPS = Object.freeze(['*heal', '*spell']);

/** Every problem with the map (or `nodes`, a map of the same shape: a test plants a defective row), as strings. Empty = valid. */
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
            if (k === 'solo') { if (e.solo !== true) out.push(where + 'solo is true or absent'); continue; }
            if (!MOD_NUMBERS.includes(k)) out.push(where + 'mod field ' + k + ' is not one the engine reads');
            else if (!Number.isInteger(e[k])) out.push(where + 'mod ' + k + ' is a whole number');
            else if (/Pm$/.test(k) && k !== 'overShieldPm' && (e[k] <= -1000 || e[k] > 1000)) out.push(where + 'mod ' + k + ' is a permille over -1000');
          }
        } else if (e.kind === 'borrow') {
          if (!Object.prototype.hasOwnProperty.call(BORROW_VALUES, e.move)) out.push(where + 'borrow ' + e.move + ' has no row in BORROW_VALUES');
        } else if (e.kind === 'rule') {
          if (typeof e.id !== 'string' || !/^[a-z_]{1,48}$/.test(e.id)) out.push(where + 'a rule names its id');
        } else out.push(where + 'effect kind ' + e.kind + ' is not step, mod, borrow or rule');
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
