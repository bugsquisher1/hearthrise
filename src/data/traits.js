// ════════════════════════════════════════════════════════════════════════
// src/data/traits.js — THE 40 TRAITS (designer, lane/traits-20, 2026-11-22; Tyler picked all 40 of
// docs/design/redesign/14-trait-candidates.md: "Sadly I like them all").
//
// A Trait is a RULE on a Rare piece: while its `when` holds, its rank's steps (src/data/gear-steps.js GEAR_STEPS.traitSteps, the
// sizing of record, 04-math-strategy.md section 10) raise one thing:
//   offense  what the hero's blows and spells land        defense  what reaches the hero is lighter        heal  what the hero's heals restore
// `when` is ONE of the bar's own conditions (src/data/condition-metrics.js METRICS, OPERATORS), so combat needs no new math (02 package 2).
//   key      no stacking (04 guard 3): Traits of one key on a hero, or a party-wide Trait across a party, count the larger. Every pair
//            or group the candidates doc calls similar shares one key, so they never stack (Tyler: keep them all, they won't stack)
//   scope    'self', or 'party': every hero in the party gains it, and only one copy in a party counts
//   move     optional: only that kind of move ('area', 'spell', 'ranged'), else every blow or heal of its kind
//   source   the ground it rolls on (its pool, traitPool). The two Catacomb wings are 12-targets section 7's grounds.
//            A Rare rolls its slot first (the piece that dropped), then one Trait of its (ground, slot) cell (GEAR_STEPS.traitRoll), so a
//            Trait rolls only where its home DROPS its slot (tests/content-coherence.mjs CC-8). RE-HOMED (the designer, lane/band-floor
//            2026-11-22, 24-content-pipeline.md G4: Hask's Ford was on the scale with no Trait, and of the scale grounds' 17 only 7 sat on a
//            slot their ground drops): to Hask's Ford, Hask's Bargain (the toll Hask took at this ford), Slack Water (a river's still
//            water), Numbed (cold ford water), Goaded (teams driven across) and Carter's Flight (the flight across the water); to Muster
//            Barrows, Snuffed (barrow candles) and Long Rite (the officers' burial rite; Pyre Field keeps its twin, Pyre Tender); Keeper's
//            Carry to the Flooded Wing, Keeper Dunn's own. The Bone Wing's helmet cell held three, over traitRoll.cellMax.
//            RE-HOMED AGAIN (the designer, lane/designer-reads-1123 2026-11-23, 29-tuning-pass.md 7.8): the Slake joins the scale with no
//            pool, so Slack Water (the Slake is where the river goes slack) and Numbed (its cold bilge water) move there from Hask's Ford.
//            The Slake drops both slots (pants on the Bargeman, belts as its Rares) and serves two seats (ranger, tank); the Ford keeps
//            three Traits on two seats (melee, healer), over traitRoll.seatsMin
//   best     the seat (src/data/hunt-roles.js HUNT_ROLES) and ground it is sized on (04 guard 1)
//   tip      the tooltip, in the doc's genre style: {pct} is the rank's shown percent (GEAR_STEPS.shownPct.rank), {gain} a trade's (shownPct.tradeGain)
//   trade    a gain with a cost (#37): offense rises by GEAR_STEPS.tradeSteps and defense FALLS by traitSteps while `when` holds.
//            Net it is never over one rank's budget (tests/gear-steps.mjs GS-4)
//   fixedOn  optional: { itemId: rank } for a named piece that always carries this Trait in place of a roll (the designer, lane/named-pieces
//            2026-11-23, docs/design/redesign/28-named-pieces.md outcome (b)); the item is its slot's plain piece. tests/gear-stats.mjs GSF-8
//   startMin a floor on the stock the hero STARTED THE HUNT with, for a Trait whose `when` reads running low (#36): a Trait that pays
//            for few arrows left counts only when the hunt began with at least twice that many, so packing 50 arrows never keeps it on
//
// TRAITS ARE HIDDEN. Nothing rolls them, no drop table names them, no fight reads them and no screen shows them until wave 4 (half-built
// features stay hidden). tests/gear-steps.mjs GS-6 holds that only src/data/gear-steps.js imports this file (and re-exports it).
// THE VERY RARE PAIR RULE (12-targets section 8.1) is the roller's (wave 4): GEAR_STEPS.traitSlots, GEAR_STEPS.veryRareBanned and the
// keys here are its data, and GS-5 proves every slot can roll a pair of two keys.
//
// PURE ESM. Data only. Imports nothing.
// ════════════════════════════════════════════════════════════════════════

const W = (metric, op, value, subject) => Object.freeze(subject === undefined ? { metric, op, value } : { metric, op, value, subject });
const on = (effect) => W('effect_missing', 'has_effect', effect, 'target');
const T = ({ seat, ...o }) => Object.freeze({ scope: 'self', ...o, best: Object.freeze({ seat, ground: o.source }) });

/* In the candidates doc's order (its numbers in the comments). */
export const TRAITS = Object.freeze({
  /* weapon */
  file_breaker: T({ n: 1, name: 'File Breaker', slot: 'weapon', raises: 'offense', move: 'area', key: 'crowd', source: 'muster_barrows', seat: 'mage',
    when: W('enemies_in_aoe', 'gte', 3), tip: '+{pct}% area damage when hitting 3+ enemies' }),
  soft_scale: T({ n: 2, name: 'Soft Scale', slot: 'weapon', raises: 'offense', key: 'weakness', source: 'wyvern_roost', seat: 'ranger',
    when: W('target_weak', 'eq', true), tip: '+{pct}% damage vs targets weak to your attack' }),
  rams_head: T({ n: 3, name: 'Ram\'s Head', slot: 'weapon', raises: 'offense', key: 'weakness', source: 'krells_hold', seat: 'melee_dps',
    when: W('target_resists', 'eq', true), tip: '+{pct}% damage vs targets that resist your attack' }),
  worrier: T({ n: 4, name: 'Worrier', slot: 'weapon', raises: 'offense', key: 'bleed', source: 'pyre_field', seat: 'melee_dps',
    when: on('bleed'), tip: '+{pct}% damage vs bleeding targets' }),
  snuffed: T({ n: 5, name: 'Snuffed', slot: 'weapon', raises: 'offense', key: 'chill', scope: 'party', source: 'muster_barrows', seat: 'melee_dps',
    when: on('chill'), tip: 'Party: +{pct}% damage vs chilled targets' }),
  /* shield */
  last_file: T({ n: 6, name: 'Last File', slot: 'shield', raises: 'defense', key: 'low_hp', source: 'muster_barrows', seat: 'tank',
    when: W('self_hp_pct', 'lt', 40), tip: '−{pct}% damage taken below 40% health' }),
  bailey_stand: T({ n: 7, name: 'Bailey Stand', slot: 'shield', raises: 'defense', key: 'boss_guard', source: 'krells_hold', seat: 'tank',
    when: W('target_is_boss', 'eq', true), tip: '−{pct}% damage taken vs bosses' }),
  barred_door: T({ n: 8, name: 'Barred Door', slot: 'shield', raises: 'defense', key: 'party_hurt', source: 'carters_rest', seat: 'tank',
    when: W('allies_below', 'gte', 2, 'under_70'), tip: '−{pct}% damage taken while 2+ party members are below 70% health' }),
  /* body */
  tarred_through: T({ n: 9, name: 'Tarred Through', slot: 'body', raises: 'defense', key: 'casting', source: 'krells_hold', seat: 'tank',
    when: W('enemy_casting', 'gte', 2, 'any'), tip: '−{pct}% damage taken while 2+ enemies are casting' }),
  first_rank: T({ n: 10, name: 'First Rank', slot: 'body', raises: 'defense', key: 'fresh', source: 'muster_barrows', seat: 'tank',
    when: W('self_hp_pct', 'gt', 90), tip: '−{pct}% damage taken above 90% health' }),
  pyre_tender: T({ n: 11, name: 'Pyre Tender', slot: 'body', raises: 'heal', key: 'mass_heal', source: 'pyre_field', seat: 'healer',
    when: W('allies_below', 'gte', 2, 'under_50'), tip: '+{pct}% healing while 2+ party members are below 50% health' }),
  /* legs */
  empty_wagon: T({ n: 12, name: 'Empty Wagon', slot: 'pants', raises: 'heal', key: 'dry_heal', source: 'ox_road', seat: 'healer',
    when: W('self_mana_pct', 'lt', 30), tip: '+{pct}% healing below 30% mana' }),
  slack_water: T({ n: 13, name: 'Slack Water', slot: 'pants', raises: 'offense', key: 'unhurt', source: 'the_slake', seat: 'ranger',
    when: W('party_hp_pct', 'gt', 90), tip: '+{pct}% damage while the party is above 90% health' }),
  goaded: T({ n: 14, name: 'Goaded', slot: 'pants', raises: 'offense', key: 'rally', source: 'hasks_ford', seat: 'melee_dps',
    when: W('allies_below', 'gte', 2, 'under_70'), tip: '+{pct}% damage while 2+ party members are below 70% health' }),
  /* helmet */
  keepers_carry: T({ n: 15, name: 'Keeper\'s Carry', slot: 'helmet', raises: 'heal', key: 'rescue', source: 'catacomb_flooded_wing', seat: 'healer',
    when: W('ally_hp_pct', 'lt', 50, 'lowest'), tip: '+{pct}% healing on targets below 50% health' }),
  full_wick: T({ n: 16, name: 'Full Wick', slot: 'helmet', raises: 'offense', move: 'spell', key: 'mana', source: 'catacomb_bone_wing', seat: 'mage',
    when: W('self_mana_pct', 'gt', 80), tip: '+{pct}% spell damage above 80% mana' }),
  paupers_share: T({ n: 17, name: 'Pauper\'s Share', slot: 'helmet', raises: 'defense', key: 'dry_healer', source: 'catacomb_bone_wing', seat: 'tank',
    when: W('ally_mana_pct', 'lt', 30, 'healer'), tip: '−{pct}% damage taken while your healer is below 30% mana' }),
  /* boots */
  floodmark: T({ n: 18, name: 'Floodmark', slot: 'boots', raises: 'defense', key: 'casting', source: 'catacomb_flooded_wing', seat: 'ranger',
    when: W('enemy_casting', 'gte', 1, 'self'), tip: '−{pct}% damage taken while an enemy is casting on you' }),
  ledge_footing: T({ n: 19, name: 'Ledge Footing', slot: 'boots', raises: 'offense', key: 'unhurt', source: 'wyvern_roost', seat: 'ranger',
    when: W('allies_below', 'eq', 0, 'under_70'), tip: '+{pct}% damage while no party member is below 70% health' }),
  carters_flight: T({ n: 20, name: 'Carter\'s Flight', slot: 'boots', raises: 'defense', key: 'retreat', source: 'hasks_ford', seat: 'healer',
    when: W('party_hp_pct', 'lt', 50), tip: '−{pct}% damage taken while the party is below 50% health' }),
  /* gloves */
  scorched_grip: T({ n: 21, name: 'Scorched Grip', slot: 'gloves', raises: 'offense', key: 'desperate', source: 'pyre_field', seat: 'melee_dps',
    when: W('self_hp_pct', 'lt', 50), tip: '+{pct}% damage below 50% health' }),
  slate_hand: T({ n: 22, name: 'Slate Hand', slot: 'gloves', raises: 'offense', key: 'caster_hunt', source: 'carters_rest', seat: 'ranger',
    when: W('enemy_casting', 'gte', 1, 'any'), tip: '+{pct}% damage while an enemy is casting' }),
  behind_the_bar: T({ n: 23, name: 'Behind the Bar', slot: 'gloves', raises: 'heal', key: 'self_mend', source: 'carters_rest', seat: 'healer',
    when: W('self_hp_pct', 'lt', 50), tip: '+{pct}% healing while you\'re below 50% health' }),
  /* belt */
  banked_coals: T({ n: 24, name: 'Banked Coals', slot: 'belt', raises: 'offense', move: 'spell', key: 'mana', source: 'ox_road', seat: 'mage',
    when: W('self_mana_pct', 'lt', 30), tip: '+{pct}% spell damage below 30% mana' }),
  numbed: T({ n: 25, name: 'Numbed', slot: 'belt', raises: 'defense', key: 'status_guard', source: 'the_slake', seat: 'tank',
    when: on('chill'), tip: '−{pct}% damage taken from chilled enemies' }),
  long_rite: T({ n: 26, name: 'Long Rite', slot: 'belt', raises: 'heal', key: 'mass_heal', source: 'muster_barrows', seat: 'healer',
    when: W('party_hp_pct', 'lt', 50), tip: '+{pct}% healing while the party is below 50% health' }),
  /* cape */
  captains_due: T({ n: 27, name: 'Captain\'s Due', slot: 'cape', raises: 'offense', key: 'boss', source: 'muster_barrows', seat: 'melee_dps',
    when: W('target_is_boss', 'eq', true), tip: '+{pct}% damage vs bosses',
    /* a named piece that always carries it, at this rank (docs/design/redesign/28-named-pieces.md (b)): the Barrow-King's Mantle */
    fixedOn: Object.freeze({ barrowking_mantle: 1 }) }),
  raised_colors: T({ n: 28, name: 'Raised Colors', slot: 'cape', raises: 'offense', key: 'boss', scope: 'party', source: 'krells_hold', seat: 'melee_dps',
    when: W('target_is_boss', 'eq', true), tip: 'Party: +{pct}% damage vs bosses' }),
  crag_shelter: T({ n: 29, name: 'Crag Shelter', slot: 'cape', raises: 'defense', key: 'dry_guard', source: 'wyvern_roost', seat: 'healer',
    when: W('self_mana_pct', 'lt', 30), tip: '−{pct}% damage taken below 30% mana' }),
  /* necklace */
  lime_pit: T({ n: 30, name: 'Lime Pit', slot: 'necklace', raises: 'offense', key: 'poison', source: 'catacomb_flooded_wing', seat: 'mage',
    when: on('sickness'), tip: '+{pct}% damage vs poisoned targets' }),
  dunns_warning: T({ n: 31, name: 'Dunn\'s Warning', slot: 'necklace', raises: 'heal', key: 'forewarn', source: 'catacomb_bone_wing', seat: 'healer',
    when: W('enemy_casting', 'gte', 1, 'any'), tip: '+{pct}% healing while an enemy is casting' }),
  early_start: T({ n: 32, name: 'Early Start', slot: 'necklace', raises: 'offense', key: 'fresh', source: 'ox_road', seat: 'melee_dps',
    when: W('self_hp_pct', 'gt', 90), tip: '+{pct}% damage above 90% health' }),
  /* ring */
  banded_oath: T({ n: 33, name: 'Banded Oath', slot: 'ring', raises: 'defense', key: 'party_hurt', scope: 'party', source: 'muster_barrows', seat: 'tank',
    when: W('allies_below', 'gte', 2, 'under_50'), tip: 'Party: −{pct}% damage taken while 2+ party members are below 50% health' }),
  lookouts_promise: T({ n: 34, name: 'Lookout\'s Promise', slot: 'ring', raises: 'offense', key: 'cover', source: 'krells_hold', seat: 'ranger',
    when: W('ally_hp_pct', 'lt', 50, 'tank'), tip: '+{pct}% damage while your tank is below 50% health' }),
  full_cellar: T({ n: 35, name: 'Full Cellar', slot: 'ring', raises: 'heal', key: 'mana', source: 'carters_rest', seat: 'healer',
    when: W('self_mana_pct', 'gt', 80), tip: '+{pct}% healing above 80% mana' }),
  bottom_of_the_quiver: T({ n: 36, name: 'Bottom of the Quiver', slot: 'ring', raises: 'offense', move: 'ranged', key: 'quiver', source: 'wyvern_roost', seat: 'ranger',
    when: W('item_qty', 'lte', 50, 'ammo'), startMin: Object.freeze({ subject: 'ammo', value: 100 }),
    tip: '+{pct}% ranged damage with 50 or fewer arrows left, if you started the hunt with 100+' }),
  hasks_bargain: T({ n: 37, name: 'Hask\'s Bargain', slot: 'ring', raises: 'offense', key: 'bargain', source: 'hasks_ford', seat: 'melee_dps', trade: true,
    when: W('self_hp_pct', 'gt', 90), tip: '+{gain}% damage above 90% health, but +{pct}% damage taken' }),
  /* earrings */
  stair_bearer: T({ n: 38, name: 'Stair Bearer', slot: 'earrings', raises: 'heal', key: 'rescue', source: 'catacomb_bone_wing', seat: 'healer',
    when: W('ally_hp_pct', 'lt', 50, 'tank'), tip: '+{pct}% healing on your tank below 50% health' }),
  bolting_team: T({ n: 39, name: 'Bolting Team', slot: 'earrings', raises: 'offense', key: 'rally', source: 'ox_road', seat: 'melee_dps',
    when: W('party_hp_pct', 'lt', 50), tip: '+{pct}% damage while the party is below 50% health' }),
  sour_vault: T({ n: 40, name: 'Sour Vault', slot: 'earrings', raises: 'defense', key: 'status_guard', source: 'catacomb_flooded_wing', seat: 'tank',
    when: on('sickness'), tip: '−{pct}% damage taken from poisoned enemies' }),
});

/** The Traits that roll on `source` (a ground's pool, 02 package 2: "chasing a Trait means choosing a ground"). */
export const traitPool = (source) => Object.freeze(Object.keys(TRAITS).filter((id) => TRAITS[id].source === source));
