// ════════════════════════════════════════════════════════════════════════
// src/data/abilities.js — THE ACTION BAR'S ABILITIES (HUNT_SCREEN_SPEC §1.2;
// architecture contracts §1.1; parity AB-01..AB-17)
//
// A discipline is the WEAPON's, never a vocation (Tyler 2026-10-16): the
// worn set's ROLE KEY names it (src/data/hunt-roles.js ROLE_KEYS): sword and
// shield = the tank's Melee, a sword alone and the club each their own Melee
// damage, dual axes the bleed, bow/crossbow = Ranger, wand = Mage
// (destruction), staff = Healer (restoration). DISCIPLINES below is the one
// list. Hunts are idle: the bar is configuration, the first usable ability in
// bar order fires (AB-10, AB-17).
//
// THE ROW. { id, n, disciplines[], lane, cdMs, mana, magicXpMult (permille of
// the mana spent, x1000), rune | null, ammo (shots of the hero's loaded ammo),
// target, effect fields, active, versions? }.
//   rune: the Chalked rune of the spell's FAMILY (runes.js; version I, the item its
//     store row partners): a cast spends one carried rune of that family, the
//     highest tier the hero has unlocked (src/core/hunt/abilities.js runeFor), or the
//     store's when the slot names it. The rune is the family's, never one tier's.
//   THE SPELL RULE (Tyler 2026-11-21, calls 21-5, 21-6, 32-4, 32-8; balance program 21-combat.md B5, plan lane L17): EVERY CAST IS A
//     SHARE OF ITS CASTER'S OWN BLOW, the largest the weapon in hand lands (its unit's maxHit: the skill, the weapon, worn +skill), so
//     one thing grows a hero's output at every Level and nothing a cast does stops at skill 60. A number a cast lands is one of:
//       hitPm     a hit: permille of the blow, rolled from half that to that (blowShare, the rule a monster's spell hits by); the
//                 monster's defence comes off it once, as off a swing (src/core/hunt/damage.js hurt)
//       healPm    a heal: permille of the blow, whole (castAmount)
//       shieldPm  a shell: permille of the blow, whole
//       healHpPm  a heal as permille of the caster's OWN max HP (Mend alone, Tyler 32-4: "about 11% of max HP at every Level", the
//                 one exception: as a share of the blow the hardest hitter would be the best self-healer)
//     times the version's step (versions, runes.js RUNE_TIERS stepPm) and the store's share when a store rune pays. Each share was
//     fitted so the cast lands today's Level 60 worth (tools/balance-sim/staged/spell-audit.mjs), the rows with no versions on
//     21-combat B5's openings (Power Strike and Precision Shot 1.2 average swings), Turning Cut and Raking Shot on their built shares.
//   target: taunt | mark | enemy | area | line | ring | self | ally | party
//     area   the 3x3 round its best aim; line: `len` tiles from the hero through its best aim;
//     ring   every monster within `r` (default 1) of the hero, up to `maxHits` (AREA_TARGETS, areaSpec:
//            src/core/hunt/shapes.js is the one geometry, the monsters' spells' too)
//   hitPm (above); element (an elements.js id), hits, maxHits, status (a statuses.js id, H3), bonusPct +
//     durMs (mark), shieldPm, healPm or healHpPm (above), whenBelowPct, minHurt,
//   radius (party heal or party shield, tiles)
//     A SHAPE (area, line, ring) with a `status` and no hitPm lands only its status: no blow,
//     no kill, no weapon XP (Frost Slam). A `party` row heals or shields every living hero in its
//     radius, never both; a party shield never lowers a bigger shell already standing.
//   alone: true = cast only while no other living hero shares the caster's world (Tyler 2026-11-09:
//     "a new spell that can only be used when not in a party"), read at each cast as the kill XP
//     reads the living heroes (src/core/hunt/abilities.js aloneIn); a death or a leave changes the
//     next cast. Otherwise the slot falls through to the next, as a slot that cannot act does.
//   party: true = its mirror, cast only while another living hero shares the caster's world (the
//     tank's rune spells, Tyler 2026-11-19: "Tank spells should be party only I think"). Never with
//     `alone`; the bar and Configure action say "Party only", as an alone row says "Solo only".
//     Or a LIST of hunt roles (hunt-roles.js HUNT_ROLES): party only for a caster playing one of them, any
//     other caster's at any time (Brand and Reave: ['tank'], the designer 2026-11-20, whole-game audit §6:
//     "with a shield worn they are party only, the same rule as Frost Slam and Shelter"; a sword alone casts
//     them alone). partyOnly() below is the one reading, the engine's and the bar's.
//   replaces: the rows a cast of it STANDS IN FOR (the whole-game audit's change 3: a new ability is a sidegrade
//     to a slot, never an addition to the bar). It fires only while one of their cooldowns is up, and its cast
//     starts the first of them that is up, as that row's own cast would (its own cdMs too), so a bar holding it
//     casts no more of them than a bar without it: a cast REPLACES one. Each is a row of its own lane that every
//     discipline it names holds, and replaces nothing itself (src/core/hunt/abilities.js clockOf).
//   skill: THE ROW'S OWN SKILL, when it is not its discipline's (itemization plan §7: the fist line's strikes level on
//     Magic while its blows read Melee). Its unlock, rune versions and numbers read that skill (abilitySkill), and its
//     hits train it: a weapon skill by damage, Magic by none (Magic is paid per mana spent, magicXpMult; ownHitSkill,
//     src/core/hunt-rewards.js). A universal row (the self-heal) always names one. Absent: the discipline's.
//   weakPm: permille of a monster's WEAKNESS to the row's element its hits land (plan §7, the fist's element by choice:
//     half the weak-side bonus, so picking the weak element is worth half what a fixed one is); a resistance lands in
//     full. Absent: all of it (src/core/hunt/damage.js hurt).
//   leechPm: permille of the HP each of its hits took that comes back to the caster as a heal (the Necrotic spells' drain, plan
//     Appendix B3), cut like any heal on a Withered caster (src/core/hunt/heal-cut.js), never past max HP
//   manaPerHit, manaPerKill: mana back to the caster for each monster a hit of the cast landed on / each one it killed (the Storm
//     spells, B3), never more in all than the cast cost (a spell is never a mana engine) and never past max mana. Magic XP is paid
//     on the mana the cast kept (src/core/hunt/abilities.js fire: the cast event's `mana` is net of it, as a shell's refund is)
//   unlock: a level in the row's own skill (abilitySkill) the ability waits for: a slot set up
//     early is kept and waits (`level`, the wait a locked rune version gives), never refused
//   trigger: the conditions a NEW slot of the row starts with, when suggestedTrigger's generic one
//     is not right (a party heal kept for the fight: "the fight is on")
//   versions: a RUNE spell's versions I..V (Tyler 2026-10-23, src/data/runes.js): the MANA of each, up to five whole numbers.
//     Version N is cast by spending a tier-N rune at level versionLevel(N) in the row's skill (abilitySkill), costs its mana
//     and lands the tier's step (runes.js versionStep: +10% a tier) of the row's share (numbers only: never its area, targets,
//     duration or cooldown). Mana never grows with level; it may rise between versions (designer d3-manacost). A row with no
//     `versions` casts every version at its own mana and share. `whenBelowPct`, `minHurt` and ABILITY_RULES.areaMin are the
//     conditions a NEW slot of the ability starts with (conditions.js suggestedConditions):
//     shown on the slot, never applied behind it.
// `active: false` holds a row whose rune is not a carried supply yet: no
// ability may name an item a hunt bag cannot hold (spec §1.2). None is held
// since the rune families landed (Rend on Rupture, Frost Lance on Ice, 2026-10-23).
//
// Numbers: the spell rule's shares (above, lane/c-spell-rule 2026-11-21); names and every number are the
// Game Designer's to retune here. Integer ms and permille only.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SUPPLIES } from './supplies.js';
import { HUNT_TUNING } from './hunt-tuning.js';
import { isElement } from './elements.js';
import { ITEMS } from './items.js';
import { isRune, runeTierOf, RUNE_TIERS, versionStep } from './runes.js';
import { shapeProblem } from './shape-kinds.js';
import { FIST_LINE, FIST_ELEMENTS } from './fists.js';
import { NECROTIC_STORM } from './necrotic-storm.js';

/* THE ABILITY LANES and their lockouts (AB-02; Tyler 2026-10-19: attack, support and healing are separate
   groups; 2026-10-23 COMBAT AUDIT ANSWERS: offense 2 s, support 2 s, healing 1 s). A cast locks its row's lane;
   a lane locks only its own rows. SUPPORT holds what helps without striking or healing: the Challenge, the
   Hunter's Mark and the shields (roadmap p12). Food and drink keep their own 2 s lane (consumables.js). Every
   ability fires through the one path (src/core/hunt/abilities.js castAbilities), the Challenge included. */
export const ABILITY_LANES = Object.freeze({ offense: 2000, support: 2000, heal: 1000 });

/* THE DISCIPLINES: the ability lists a WEAPON KEY plays (src/data/hunt-roles.js ROLE_KEYS names each key's), and
   the skill each one's abilities level on (designer d3-weaponskill "own", Tyler 2026-10-23: a weapon ability on its
   weapon's own skill, a spell on Magic). The ONE list: hunt-roles.js validates against it, a universal row (the
   self-heal) is every discipline's by construction, and a discipline's abilities are the rows naming it
   (roadmap p15: the club is its own discipline; no "exactly three" count). */
export const DISCIPLINES = Object.freeze({
  shield: Object.freeze({ skill: 'melee' }),        // a one-hand blade and a shield: the tank (Challenge)
  sword: Object.freeze({ skill: 'melee' }),         // a sword alone: Melee damage, the blade's own strikes
  dual_axe: Object.freeze({ skill: 'melee' }),      // two axes: bleed
  club: Object.freeze({ skill: 'melee' }),          // a two-handed club: crush (no stagger, Tyler 2026-10-23)
  ranged: Object.freeze({ skill: 'ranged' }),       // a bow or a crossbow
  destruction: Object.freeze({ skill: 'magic' }),   // a wand (and its spellbook): the Mage
  restoration: Object.freeze({ skill: 'magic' }),   // a staff: the Healer
  /* wraps: the fist line (src/data/fists.js), its blows on Melee, its strikes naming Magic; only while the sample is live */
  ...(FIST_LINE.live ? { [FIST_LINE.family]: Object.freeze({ skill: 'melee' }) } : {}),
});
export const DISCIPLINE_IDS = Object.freeze(Object.keys(DISCIPLINES));

export const ABILITY_RULES = Object.freeze({
  /* Mana regenerates 25% of max a minute (designer ruling 2026-10-15, AB-13). */
  manaRegenPctPerMin: 25,
  /* An area ability's suggested trigger: at least this many monsters in its footprint (AB-03; a NEW slot's
     starting condition, suggestedTrigger, never a hidden one). */
  areaMin: 2,
  /* THE AREA'S SIZE: an 'area' row strikes the areaSide x areaSide square round its best aim (Fireball's 3x3; areaSpec). */
  areaSide: 3,
  /* A hitPm row's roll (blowShare): from hitLowPm permille of its top to the top, the rule a monster's spell hits by. */
  hitLowPm: 500,
});

/* Which abilities an action set skips (AB-11; presets ASSUMED, spec §3.7). */
export const ACTION_SET_SKIPS = Object.freeze({
  hunt: Object.freeze({ rune: false, area: false }),
  mana_train: Object.freeze({ rune: true, area: false }),
  boss: Object.freeze({ rune: false, area: true }),
});

const ab = (o) => Object.freeze({ rune: null, ammo: 0, magicXpMult: 0, active: true, ...o,
  disciplines: Object.freeze(o.disciplines), ...(o.versions ? { versions: Object.freeze([...o.versions]) } : {}) });

/* ── THE VERSION LADDER (Tyler 2026-10-23: versions I-V at level 1/15/30/45/60, each on its tier's rune; mana never grows with level
   but may rise from one version to the next, d3-manacost "perversion"). Each spell's `versions` are the mana of I..V (x1.2 a version,
   rounded; the designer's Greater Mend example 25/30/36/43/52); what each lands is the rune tier's step (runes.js RUNE_TIERS stepPm,
   one ladder for every spell). Output no longer grows with the row's own skill level (the `lvPm` of 2026-10-23 is retired with the
   spell rule): the caster's blow carries the skill and the weapon, the step carries the rune. */

export const ABILITIES = Object.freeze([
  /* shield — the tank's Melee. The Challenge is a SUPPORT cast (it strikes nothing): the bar fires it like every
     other ability, and its target rule finds a monster only while one is off the tank (targeting.js challengeable). */
  ab({ id: 'challenge', n: 'Challenge', disciplines: ['shield'], lane: 'support', cdMs: 8000, mana: 0, target: 'taunt' }),
  /* THE TANK'S RUNE SPELLS (Tyler 2026-11-19: "tanks should have rune spells that are tank spells", "Tank spells should be party only
     I think"; the designer's board section "2026-11-19 Tank rune spells"). They hold and protect, never kill: a tank alone levels
     slowly on purpose (Tyler 2026-11-19), so both are PARTY ONLY (`party`) and neither is on a default bar (the new-spell prompt
     offers each at its `unlock`). Their versions read Melee, the shield's skill (I-V at Melee 1 / 15 / 30 / 45 / 60).
     FROST SLAM: an ICE rune spell, every monster beside the tank (up to 8) Chilled for 4 s, no damage (a ring that lands only its
     status); its version is the rune tier, so its chill is 30 / 35 / 40 / 45 / 50% (statuses.js chill tierPermille) at the
     version's full strength (a status is never cut by the store's share). Every 6 s: chilled two thirds of the time. */
  ab({ id: 'frost_slam', n: 'Frost Slam', disciplines: ['shield'], party: true, lane: 'support', cdMs: 6000, mana: 6, rune: 'chalked_ice_rune', unlock: 12,
    target: 'ring', maxHits: 8, status: 'chill', magicXpMult: 250, versions: [6, 7, 8, 10, 12] }),
  /* SHELTER: an EARTH rune spell, the stone shields' family. Every living hero within 8 tiles, the tank too, gets a shell of 289% of
     the tank's own largest blow (version I; the step a deeper rune buys on top, runes.js; the store's rune lands 75%), never lowering a
     bigger shell already standing: 0.85 of a same-Level monster's largest blow at Level 60 on a Graven rune, as before the spell rule.
     A new slot starts on a monster's cast warning (`trigger`): it shells the party before a group spell lands. Every 30 s. */
  ab({ id: 'shelter', n: 'Shelter', disciplines: ['shield'], party: true, lane: 'support', cdMs: 30000, mana: 25, rune: 'chalked_earth_rune', unlock: 20,
    target: 'party', shieldPm: 2890, radius: 8, magicXpMult: 250,
    trigger: [{ metric: 'enemy_casting', op: 'gte', value: 1, subject: 'any' }], versions: [25, 30, 36, 43, 52] }),
  /* The blade's own strikes: a sword swings them with a shield (the tank) or alone (Melee damage, Tyler 2026-10-23). */
  ab({ id: 'flame_strike', n: 'Flame Strike', disciplines: ['shield', 'sword'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_fire_rune',
    target: 'enemy', hitPm: 1400, element: 'ember', magicXpMult: 250, versions: [10, 12, 14, 17, 21] }),
  /* POWER STRIKE, the free strike every melee hero starts with (the fist line plays it too while its sample is live: src/data/fists.js),
     1.2 of the hero's own average landed swings at every Level (21-combat B5's opening: it was half a swing by Level 60). NOT the two
     axes' (Tyler 2026-11-21, call 32-3: Rend stays at 6 s and the axes lose Power Strike, so their offense fits the bar budget). */
  ab({ id: 'power_strike', n: 'Power Strike', disciplines: ['shield', 'sword', 'club', ...(FIST_LINE.live ? [FIST_LINE.family] : [])], lane: 'offense', cdMs: 6000, mana: 6,
    target: 'enemy', hitPm: 700 }),
  /* TURNING CUT (the area-spells design, lane/b-area-data; Tyler 2026-11-08: "our heros some more aoe spells"): every melee
     weapon WITHOUT a shield (Tyler 2026-11-16, from Andy: "Give it to all melee that doesn't have a shield on": a sword alone, two
     axes, a club or hammer, bare hands), every monster beside the hero, each for 60% of the hero's own largest blow (hitPm), so it
     grows with the weapon. CLEAVE MERGED INTO IT (Tyler 2026-11-21, call 32-2: "the hit-several button" twice, and the row that put the
     axes and the hammer over the bar budget), so a new slot starts at the generic area trigger, "when it would hit at least 2"
     (ABILITY_RULES.areaMin). The tank gets nothing new (its job is holding). MEASURED before the merge (lane/d-turning-cut-melee, 2
     seeds): Normal moved at most +1.4% Level XP an hour; ALONE on Dangerous the sword gained +31% to +62%, a hammer +18% to +33%. */
  ab({ id: 'turning_cut', n: 'Turning Cut', disciplines: ['sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10, target: 'ring', maxHits: 8, hitPm: 600 }),
  /* REND, the two axes' strike (Tyler 2026-11-21, call 32-3: it stays at 6 s): two hits and a bleed a hit, on the RUPTURE family
     (Tyler 2026-10-23); its bleed ticks a share of the axes' own blow at the rune's tier (statuses.js bleed blowPm, tierPermille). */
  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, rune: 'chalked_rupture_rune', target: 'enemy',
    hitPm: 390, hits: 2, status: 'bleed', versions: [8, 10, 12, 14, 17] }),
  /* QUARRY BLOW, the hammer's rune strike (Tyler 2026-11-21, call 32-5: "a hammer-only strike that spends an Earth rune, so it has a rune
     choice from Level 1", as the sword has Flame Strike and the axes Rend). One target, the hammer's own blow at the blade's rune strike's
     share, no element (Earth is the stone the hammer drives, never an element a monster resists). Inside the hammer's bar budget: Power
     Strike 6 s, Turning Cut 8 s and this 8 s fill 0.83 of the offense lane, the sword's own fill. Off the default bar, as every weapon's
     rune strike is: the player's pick, offered by the new-spell prompt. */
  ab({ id: 'quarry_blow', n: 'Quarry Blow', disciplines: ['club'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_earth_rune',
    target: 'enemy', hitPm: 1400, magicXpMult: 250, versions: [10, 12, 14, 17, 21] }),
  /* bow / crossbow — Ranger */
  ab({ id: 'hunters_mark', n: "Hunter's Mark", disciplines: ['ranged'], lane: 'support', cdMs: 12000, mana: 8, target: 'mark',
    bonusPct: 20, durMs: 8000 }),
  ab({ id: 'flame_volley', n: 'Flame Volley', disciplines: ['ranged'], lane: 'offense', cdMs: 10000, mana: 15, rune: 'chalked_fire_rune', ammo: 3,
    target: 'area', hitPm: 860, element: 'ember', magicXpMult: 250, versions: [15, 18, 22, 26, 31] }),
  /* the Ranger's free shot, 1.2 of the bow's own average landed shots (21-combat B5's opening, as Power Strike) */
  ab({ id: 'precision_shot', n: 'Precision Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 6000, mana: 6, ammo: 1,
    target: 'enemy', hitPm: 750 }),
  /* RAKING SHOT (the area-spells design): an arrow line with no element, 4 tiles from the hero through its aim, each monster on
     it hit for 80% of the hero's own largest blow (hitPm). Two shots of the bar's ammo a cast. The Ranger's area that a slime's
     element resistance never touches (Andy 11-06: every Ranger area was fire). PROVISIONAL, unmeasured. */
  ab({ id: 'raking_shot', n: 'Raking Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 8000, mana: 10, ammo: 2, unlock: 10, target: 'line', len: 4, hitPm: 800 }),
  /* staff — Mage (destruction) */
  /* Fireball is a FIRE rune spell (Tyler 2026-10-23, the approved spell map: "gold per cast covers heroes without
     runes"): a hero with no Fire Rune casts it on the store's, which the Mage's default slot names (rule-subjects.js). */
  ab({ id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'chalked_fire_rune',
    target: 'area', hitPm: 730, element: 'ember', magicXpMult: 1600, versions: [25, 30, 36, 43, 52] }),
  /* (it no longer kills a Level 10 monster in one cast: 126% of one before the spell rule, about two thirds now) */
  ab({ id: 'frost_lance', n: 'Frost Lance', disciplines: ['destruction'], lane: 'offense', cdMs: 6000, mana: 20, rune: 'chalked_ice_rune',
    target: 'enemy', hitPm: 1140, element: 'frost', magicXpMult: 1600, versions: [20, 24, 29, 35, 41] }),
  /* HOARFROST (the area-spells design): an ICE rune spell on Fireball's 3x3, and every monster it hits is Chilled (statuses.js:
     its swings and spell windups run 30% slower for 4 s), so frost slows a pack and its casts where fire burns hardest.
     PROVISIONAL, unmeasured. */
  ab({ id: 'hoarfrost', n: 'Hoarfrost', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 22, rune: 'chalked_ice_rune', unlock: 14,
    target: 'area', hitPm: 530, element: 'frost', status: 'chill', magicXpMult: 1600, versions: [22, 26, 32, 38, 46] }),
  /* An EARTH rune spell (a shell of stone, the approved spell map). Self-only (Tyler 2026-10-23, Andy's report);
     recast while its shell still stands, the unused part comes back as mana (abilities.js barrierRefund). */
  ab({ id: 'arcane_barrier', n: 'Arcane Barrier', disciplines: ['destruction'], lane: 'support', cdMs: 20000, mana: 30, rune: 'chalked_earth_rune', target: 'self',
    shieldPm: 2290, whenBelowPct: 85, magicXpMult: 1600, versions: [30, 36, 43, 52, 62] }),
  /* staff — Healer (restoration). Its heals are WATER rune spells (spring water closes wounds, the approved map);
     Greater Mend's mana ladder is the designer's own example (25/30/36/43/52, d3-manacost). A heal is a share of the staff's own blow
     (the spell rule), sized to today's Level 60: Greater Mend 1.42 of a same-Level monster's largest blow on a Graven rune. */
  ab({ id: 'greater_mend', n: 'Greater Mend', disciplines: ['restoration'], lane: 'heal', cdMs: 2000, mana: 25, rune: 'chalked_water_rune', target: 'ally',
    healPm: 3170, whenBelowPct: 70, magicXpMult: 1600, versions: [25, 30, 36, 43, 52] }),
  ab({ id: 'circle_of_renewal', n: 'Circle of Renewal', disciplines: ['restoration'], lane: 'heal', cdMs: 12000, mana: 50, rune: 'chalked_water_rune', target: 'party',
    healPm: 1600, whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1600, versions: [50, 60, 72, 86, 104] }),
  /* SPRING TIDE (Tyler 2026-11-08: "instead of a healer area spell lets just do a party heal with a long cooldown", "and
     expensive, and make sure the conditions are available that make sense"): the once-a-minute save beside Circle of
     Renewal's steady top-up, a WATER rune spell on every hero within 8 tiles.
     ITS RULE AND ITS COST (lane/d-spell-tuning, Tyler 2026-11-08: its first rule never fired, and it starved the healer at the
     Chief). A group spell hurts every hero a little, so "two allies under 60%" almost never came true. The rule now reads the
     whole party: the party's HP under 85%, the fight on, and the healer's own mana at 50% or more, so it is never the cast that
     leaves Greater Mend dry. Measured in Deadly fours buying every rune and drink (Warrens 32, Glade 24, 2 seeds x 1 h): the old rule 0 casts
     an hour, and under 75% 0 too; "the fight is on" alone 59 an hour for 37 to 75% more drinks; this rule 6.5 and 13.5 an hour, the drinks
     within 15% of none, and the Warrens four 578 g an hour a head better off. 120 mana (was 160): 44% of a fresh healer's pool at Magic 20, still 2.4 times Circle of Renewal's
     cost on five times its cooldown. Each number is measured in the lane's board section. */
  ab({ id: 'spring_tide', n: 'Spring Tide', disciplines: ['restoration'], lane: 'heal', cdMs: 60000, mana: 120, rune: 'chalked_water_rune', unlock: 20,
    target: 'party', healPm: 9510, radius: 8, magicXpMult: 1600,
    trigger: [{ metric: 'party_hp_pct', op: 'lt', value: 85 }, { metric: 'in_fight', op: 'eq', value: true }, { metric: 'self_mana_pct', op: 'gte', value: 50 }],
    versions: [120, 144, 173, 207, 249] }),
  /* GREEN SICKNESS (was Nature's Wrath; Tyler 2026-10-23: a POISON rune spell, its element poison): Restoration's
     lower-power area spell, and every monster it hits takes more from every blow for a while (statuses.js sickness,
     Bible §17: a fixed, non-stacking vulnerability that no rune tier raises). */
  ab({ id: 'green_sickness', n: 'Green Sickness', disciplines: ['restoration'], lane: 'offense', cdMs: 10000, mana: 20, rune: 'chalked_poison_rune',
    target: 'area', hitPm: 400, element: 'poison', status: 'sickness', magicXpMult: 1600, versions: [20, 24, 29, 35, 41] }),
  /* PROTECTIVE WARD (Bible §17: Restoration's friend shield; roadmap p22; the name is the Bible's, the designer's to
     keep): an EARTH rune spell that shields the ally its conditions name (else the lowest wounded one in reach)
     while that ally holds no shield. Its shell is a share of the staff's blow sized to today's Level 60 (0.85 of a monster's
     largest blow on a Graven rune), on the support lane with every shield (roadmap p12). */
  ab({ id: 'protective_ward', n: 'Protective Ward', disciplines: ['restoration'], lane: 'support', cdMs: 12000, mana: 25, rune: 'chalked_earth_rune',
    target: 'ally', shieldPm: 1910, whenBelowPct: 80, magicXpMult: 1600, versions: [25, 30, 36, 43, 52] }),
  /* UNDERTOW (Tyler 2026-11-09: "Give the healer a little more damage by giving it a new spell that can only be used when
     not in a party"): the Healer's own strike, a WATER rune spell (the spring that closes wounds drags a foe under), on one
     target, cast only while the Healer hunts alone (`alone`). A lone Healer killed slowest of every way to fight (0.46-0.48
     of the pace of record at the Thicket's and Wickstead's floors); a party never sees it fire. About a Mend's mana. */
  ab({ id: 'undertow', n: 'Undertow', disciplines: ['restoration'], lane: 'offense', cdMs: 20000, mana: 15, rune: 'chalked_water_rune', alone: true,
    target: 'enemy', hitPm: 890, magicXpMult: 1600, versions: [15, 18, 22, 26, 31] }),
  /* THE FIST LINE'S TWO STRIKES (itemization plan §7, phase 1; src/data/fists.js: HIDDEN, in this table only while the sample is
     live). One target each, no area. Each comes in fire, ice and poison (FIST_ELEMENTS): the element is the player's choice, the
     row its bar slots, and it lands half a weakness's bonus (weakPm 500). Both name MAGIC as their own skill (`skill`): their
     numbers grow with Magic and they train Magic per mana at the spell rate, while the wraps' blows train Melee.
       CHARGED HANDS (`<element>_hands`): the strike on mana alone, no rune.
       THE PALM (`<element>_palm`): the optional stronger cast, a rune of its element's family, its version by the rune's tier.
     PROVISIONAL numbers beside the built strikes (Flame Strike 10 mana, Power Strike 6). MEASURED (tools/balance-sim/fist-table.mjs,
     lane/d-fists-phase1, alone on Normal at Levels 10 to 57): the mana is not what limits them. Hands at 8, 6 or 4 mana cast within 1%
     as often and moved Level XP under 1% (they wait on their cooldown and the fight), and only the drink bill fell (30 to 8 an hour at
     the Thicket); so the mana stays 8 and 12, which keeps Magic training beside Melee (Magic 19 and Melee 18 at Level 10). */
  /* UNDER THE SPELL RULE (lane/c-spell-rule, 2026-11-21) both strikes are a share of the wraps' own blow, converted at their Level 60
     worth on the hammer's kit (the stand-in the fist tables read): Hands 51%, Palm 136%. Their clocks (one for the Hands whatever the
     element, the Palm standing in for them) and their sizes are lane L43's (32-spell-audit.md C1, C5 row 1). */
  ...(FIST_LINE.live ? FIST_ELEMENTS.flatMap(([family, element, word]) => [
    ab({ id: family + '_hands', n: word + ' Hands', disciplines: [FIST_LINE.family], skill: 'magic', lane: 'offense', cdMs: 6000, mana: 8,
      target: 'enemy', hitPm: 510, element, weakPm: 500, magicXpMult: 1600 }),
    ab({ id: family + '_palm', n: word + ' Palm', disciplines: [FIST_LINE.family], skill: 'magic', lane: 'offense', cdMs: 8000, mana: 12,
      rune: 'chalked_' + family + '_rune', target: 'enemy', hitPm: 1360, element, weakPm: 500, magicXpMult: 1600, versions: [12, 14, 17, 21, 25] }),
  ]) : []),
  /* NECROTIC AND STORM, THE SAMPLE (itemization plan Appendix B3 and §11 phase 6b; Tyler 2026-11-18: "i want each weapon type to have a
     spell for both"): the sword's pair and the wand's pair, in this table only while their switch is on (src/data/necrotic-storm.js).
     A Storm spell is fast and pays back in mana, on the Storm family (the old Air); a Necrotic one drains or Withers, on the Bone family.
     Storm unlocks at 25 and Necrotic at 40 in the weapon's own skill (a sword's Melee, a wand's Magic), so at its unlock a hero already
     casts the Scored (Storm) or Etched (Necrotic) version. Versions on the built ladder (mana x1.2 a version). Magic XP: the sword's at a
     quarter (Flame Strike's 250), the wand's in full. Neither is on any default bar: the new-spell prompt offers each at its unlock.
     THE SWORD'S PAIR (the designer's rulings, whole-game audit 2026-11-20 §6). On the sword's list and the tank's, as Flame Strike is,
     but PARTY ONLY for the tank (`party: ['tank']`, the rule Frost Slam and Shelter keep: Tyler 2026-11-19, tank spells never make a lone
     tank kill faster); a sword alone casts both alone. Each STANDS IN FOR a strike (`replaces`, the audit's change 3): it shares Flame
     Strike's and Power Strike's cooldowns, so a cast replaces one of theirs and the bar never casts more strikes for holding it.
       BRAND    Storm, one target, a kill gives 4 mana back. 10 mana, 8 s.
       REAVE    Necrotic, one target, 30% of the HP it took comes back as HP. 12 mana, 10 s.
     THE WAND'S PAIR, on Fireball's 3x3 (Fireball [7, 12], 25 mana, 8 s; Hoarfrost [5, 9], 22 mana, 10 s).
       UPDRAFT  Storm, an area under Fireball's damage, 3 mana back for each monster it hits. 22 mana, 10 s.
       BLIGHT   Necrotic, an area, everything it hits Withered (statuses.js: a monster heals half as much for 6 s). 25 mana, 10 s. Its
                damage is under Updraft's (the designer: its worth is Withered, and the Mage is already ahead).
     Mana, cooldowns and returns PROPOSED by the designer (B3); the damages are the designer's §6 rulings (Updraft [5, 9] stands, Blight
     about [4, 7]) and, for the sword's pair, MEASURED to its band (Brand about +5% Level XP an hour for a lone sword on a neutral monster,
     the pair at most +10%) in tools/balance-sim/elements-6b-table.mjs (lane/d-elements-6b-rulings, 6 seeds x 2 h, paired, --neutral).
     At the ruled [5, 9] Brand lost 6-8% in place of Flame Strike, so it is [7, 13]: -1.3% / -1.5% in place of Flame Strike (Melee 25 /
     40), +4.2% / +8.8% after it, on Power Strike's turns (the better bar); with Reave [5, 9] the pair lands +1.0%, +6.1% or +8.8% by
     bar order, never more. [8, 14] crossed +10% at 40. Power Strike never scales and a rune strike does, so the gain on its turn grows
     with Melee: re-read at a higher band before going live.
     UNDER THE SPELL RULE (lane/c-spell-rule, 2026-11-21) each damage is a share of the caster's own blow, converted at its Level 60 worth
     (Brand and Reave on the sword's, in Flame Strike's proportion: [7, 13] and [5, 9] of its [8, 14]; Updraft and Blight on the wand's,
     in Hoarfrost's: [5, 9] and [4, 7] of its [5, 9]). Their sizes inside the bar budget, and Updraft's and Blight's stand-ins, are lane
     L44's (32-spell-audit.md C1, E). */
  ...(NECROTIC_STORM.live ? [
    ab({ id: 'brand', n: 'Brand', disciplines: ['shield', 'sword'], party: ['tank'], replaces: ['flame_strike', 'power_strike'], lane: 'offense', cdMs: 8000, mana: 10,
      rune: 'chalked_storm_rune', unlock: 25, target: 'enemy', hitPm: 1270, element: 'storm', manaPerKill: 4, magicXpMult: 250, versions: [10, 12, 14, 17, 21] }),
    ab({ id: 'reave', n: 'Reave', disciplines: ['shield', 'sword'], party: ['tank'], replaces: ['flame_strike', 'power_strike'], lane: 'offense', cdMs: 10000, mana: 12,
      rune: 'chalked_bone_rune', unlock: 40, target: 'enemy', hitPm: 890, element: 'necrotic', leechPm: 300, magicXpMult: 250, versions: [12, 14, 17, 21, 25] }),
    ab({ id: 'updraft', n: 'Updraft', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 22, rune: 'chalked_storm_rune', unlock: 25,
      target: 'area', hitPm: 530, element: 'storm', manaPerHit: 3, magicXpMult: 1600, versions: [22, 26, 32, 38, 46] }),
    ab({ id: 'blight', n: 'Blight', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 25, rune: 'chalked_bone_rune', unlock: 40,
      target: 'area', hitPm: 420, element: 'necrotic', status: 'withered', magicXpMult: 1600, versions: [25, 30, 36, 43, 52] }),
  ] : []),
  /* MEND, THE UNIVERSAL SELF-HEAL (Bible §4.1 / §17 CONFIRMED; roadmap p21): every loadout heals itself with mana on
     the heal lane, outside its three discipline abilities. It needs missing HP (a hero at full health never casts it,
     so a full-health cast never pays Magic XP) and spends no rune: the free floor. It levels on Magic, and pays Magic
     at the physical builds' quarter (Bible §5.1, 0.25). It heals 11% of the caster's OWN max HP at every Level (Tyler
     2026-11-21, call 32-4: the one exception to the spell rule; its Level 10 worth before it, half a monster's largest blow). */
  ab({ id: 'mend', n: 'Mend', disciplines: DISCIPLINE_IDS, universal: true, skill: 'magic',
    lane: 'heal', cdMs: 6000, mana: 15, target: 'self', healHpPm: 110, whenBelowPct: 50, magicXpMult: 250 }),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

const TARGETS = ['taunt', 'mark', 'enemy', 'area', 'line', 'ring', 'self', 'ally', 'party'];
/* The targets that strike a SHAPE (src/core/hunt/shapes.js): an action set that skips area abilities skips them all,
   and a new slot of one starts "when it would hit at least ABILITY_RULES.areaMin". */
export const AREA_TARGETS = Object.freeze(['area', 'line', 'ring']);
/* The targets that land damage on monsters. */
const DAMAGING = Object.freeze(['enemy', ...AREA_TARGETS]);
/* THE NUMBER FIELDS (the header's spell rule): what a cast lands, each read off its caster as castAmount reads it. */
const NUMBER_FIELDS = Object.freeze(['hitPm', 'healPm', 'shieldPm', 'healHpPm']);

/** Does `row` land a BLOW (a share of the hero's own blow, hitPm)? A shape row with only a `status` lands none (Frost Slam). */
export const landsBlow = (row) => !!row && Number.isInteger(row.hitPm);
/** Does `row` HEAL (a share of the caster's blow, or Mend's share of its max HP)? */
export const heals = (row) => !!row && (Number.isInteger(row.healPm) || Number.isInteger(row.healHpPm));
/** Does `row` lay a SHELL (a share of the caster's blow)? */
export const shells = (row) => !!row && Number.isInteger(row.shieldPm);

/** WHAT ONE CAST OF `row` LANDS FOR A CASTER whose largest blow is `maxHit` and whose max HP is `maxHp`, at `pm` permille (the
    version's step, the store's share, a Surge: the cast's power), as the engine lands it (a wiki formula, the spell rule):
      a hit     [low, top] of blowShare(maxHit, row), then the monster's defence, then x pm / 1000 (src/core/hunt/damage.js hurt)
      a heal    floor(floor(maxHit x healPm / 1000) x pm / 1000), Mend's floor(floor(maxHp x healHpPm / 1000) x pm / 1000)
      a shell   floor(floor(maxHit x shieldPm / 1000) x pm / 1000)
    each at least 1. Answers { hit: [low, top] } | { heal: n } | { shield: n } | null for a row that lands no number. */
export function castAmount(row, maxHit, maxHp, pm) {
  if (!row) return null;
  const at = (n) => Math.max(1, pm === 1000 || !Number.isInteger(pm) ? n : Math.floor((n * pm) / 1000));
  const of = (base, share) => Math.max(1, Math.floor((Math.max(1, Math.floor(Number(base) || 1)) * share) / 1000));
  if (landsBlow(row)) return { hit: blowShare(maxHit, row) };
  if (Number.isInteger(row.healPm)) return { heal: at(of(maxHit, row.healPm)) };
  if (Number.isInteger(row.healHpPm)) return { heal: at(of(maxHp, row.healHpPm)) };
  if (shells(row)) return { shield: at(of(maxHit, row.shieldPm)) };
  return null;
}

/** The shape spec an area row strikes (src/core/hunt/shapes.js): the 3x3 on its aim, a line of `len` from the hero
    through its aim, a ring of `r` round the hero; null for a row that strikes no shape. */
export function areaSpec(row) {
  if (!row) return null;
  if (row.target === 'area') return { shape: 'square', n: ABILITY_RULES.areaSide };
  if (row.target === 'line') return { shape: 'line', len: row.len };
  if (row.target === 'ring') return { shape: 'ring', r: Number.isInteger(row.r) ? row.r : 1 };
  return null;
}

/* THE SKILL A DISCIPLINE'S VERSIONS LEVEL ON (DISCIPLINES above). A universal row names its own `skill`. */
export const DISCIPLINE_SKILL = Object.freeze(Object.fromEntries(DISCIPLINE_IDS.map((d) => [d, DISCIPLINES[d].skill])));
/** IS `row` PARTY ONLY for a caster playing hunt role `role` (hunt-roles.js HUNT_ROLES)? `party: true` for every caster, a list of
    roles for a caster playing one of them (Brand and Reave: the tank). The engine's gate (src/core/hunt/abilities.js firstUsable, the
    unit's role) and the bar's words (src/shell/action-facts.js, the server's hunt_settings role) read this one rule. */
export const partyOnly = (row, role) => !!row && (row.party === true || (Array.isArray(row.party) && row.party.includes(role)));
/** The ability ids discipline `d` may hold, in data order (its own rows and every universal row). */
export const disciplineAbilities = (d) => Object.values(ABILITIES).filter((a) => a.disciplines.includes(d)).map((a) => a.id);
/** The skill `row`'s unlock, versions and output level on: its own `skill` when it names one (a universal row always does), else
    its discipline's. */
export const abilitySkill = (row) => (row && typeof row.skill === 'string' && row.skill) || DISCIPLINE_SKILL[row && row.disciplines && row.disciplines[0]] || 'magic';
/** THE SKILL A ROW'S HITS TRAIN, when it names its own (`skill` on a discipline's row, the header's field): a weapon skill by the
    damage it lands, null for Magic (Magic is paid per mana spent, never by damage: skills.js DAMAGE_XP_FAMILIES). Undefined for every
    other row, a basic blow and an unknown id: those hits train the weapon family's skill (src/core/hunt-rewards.js). */
export const ownHitSkill = (row) => (row && !row.universal && typeof row.skill === 'string' ? (row.skill === 'magic' ? null : row.skill) : undefined);

/** THE TRIGGER A NEW SLOT OF `row` STARTS WITH, as conditions written ON the slot (the role rule sets,
    rule-subjects.js ROLE_RULES, and a slot the player adds: conditions.js suggestedConditions). Never
    applied behind a slot: one with no conditions fires whenever it is ready (Tyler 2026-10-23, c21). */
export function suggestedTrigger(row) {
  if (!row) return [];
  /* A row's own starting rule (`trigger`), when the generic one below is not right. */
  if (Array.isArray(row.trigger)) return row.trigger.map((c) => Object.assign({}, c));
  if (row.target === 'self') return [{ metric: 'self_hp_pct', op: 'lt', value: row.whenBelowPct }];
  if (row.target === 'ally') return [{ metric: 'ally_hp_pct', op: 'lt', value: row.whenBelowPct, subject: 'lowest' }];
  if (AREA_TARGETS.includes(row.target)) return [{ metric: 'enemies_in_aoe', op: 'gte', value: ABILITY_RULES.areaMin }];
  if (row.target === 'party') return [{ metric: 'allies_below', op: 'gte', value: row.minHurt, subject: 'under_' + row.whenBelowPct }];
  return [];
}

/** WHAT A hitPm ROW HITS FOR (a wiki formula): with M the hero's own largest blow (its unit's maxHit),
      top = max(1, floor(M x hitPm / 1000)),  low = max(1, ceil(top x hitLowPm / 1000)),
    and each hit rolls a whole number from low to top. Answers [low, top]. */
export function blowShare(maxHit, row) {
  const top = Math.max(1, Math.floor((Math.max(1, Math.floor(Number(maxHit) || 1)) * row.hitPm) / 1000));
  return [Math.max(1, Math.ceil((top * ABILITY_RULES.hitLowPm) / 1000)), top];
}

/** Version `n` (1..5) of `row`: { mana, outPm }: the version's mana, and what it lands, permille of the row's share (its rune tier's
    step, runes.js versionStep). A row with no `versions` casts every version at its own mana and share (outPm 1000). */
export function versionOf(row, n) {
  const mana = row && Array.isArray(row.versions) ? row.versions[n - 1] : undefined;
  return Number.isInteger(mana) ? { mana, outPm: versionStep(n) } : { mana: row ? row.mana : 0, outPm: 1000 };
}

/** Every problem with the table (or `rows`, a table of the same shape: a test plants a defective row), as strings. Empty = valid. */
export function validate(rows = ABILITIES) {
  const out = [];
  const step = HUNT_TUNING.stepMs;
  for (const [lane, ms] of Object.entries(ABILITY_LANES)) if (!Number.isInteger(ms) || ms <= 0 || ms % step) out.push('lane ' + lane + ' ' + ms + ' ms is not a whole number of sub-steps');
  for (const [d, row] of Object.entries(DISCIPLINES)) if (!/^[a-z_]{1,32}$/.test(d) || !['melee', 'ranged', 'magic'].includes(row.skill)) out.push('discipline ' + d + ': a [a-z_] id leveling on melee, ranged or magic');
  const per = Object.fromEntries(DISCIPLINE_IDS.map((d) => [d, 0]));
  for (const r of Object.values(rows)) {
    const bad = (m) => out.push(r.id + ': ' + m);
    if (!ABILITY_LANES[r.lane]) bad('unknown lane ' + r.lane);
    if (!TARGETS.includes(r.target)) bad('unknown target ' + r.target);
    if (!Number.isInteger(r.cdMs) || r.cdMs <= 0 || r.cdMs % step) bad('cdMs is not a whole number of sub-steps');
    for (const k of ['mana', 'ammo', 'magicXpMult']) if (!Number.isInteger(r[k]) || r[k] < 0) bad(k + ' must be an integer >= 0');
    for (const d of r.disciplines) { if (!(d in per)) bad('unknown discipline ' + d); else if (!r.universal) per[d]++; }
    /* A universal row is every discipline's, on a skill it names (the self-heal: Magic). */
    if (r.universal && (DISCIPLINE_IDS.some((d) => !r.disciplines.includes(d)) || !Object.values(DISCIPLINE_SKILL).includes(r.skill))) bad('a universal row lists every discipline and names its skill');
    /* A row's OWN skill is a combat skill a discipline levels on, and it differs from its discipline's (else it says nothing). */
    if (!r.universal && r.skill !== undefined && (!Object.values(DISCIPLINE_SKILL).includes(r.skill) || r.disciplines.some((d) => DISCIPLINE_SKILL[d] === r.skill))) bad('its own skill must be another combat skill than its discipline\'s');
    /* A weakness share is a striking row's with an element: whole permille 0..1000 of the bonus. */
    if (r.weakPm !== undefined && (!Number.isInteger(r.weakPm) || r.weakPm < 0 || r.weakPm > 1000 || !r.element || !DAMAGING.includes(r.target))) bad('weakPm is a whole permille 0..1000 on a damaging row with an element');
    if (new Set(r.disciplines).size !== r.disciplines.length) bad('a discipline is listed twice');
    /* THE SPELL RULE (the header): a cast's number is a share of its caster's blow (hitPm, healPm, shieldPm) or Mend's of its max HP
       (healHpPm), never a fixed number: the retired fields would land the same at Level 10 and Level 400. */
    for (const k of ['dmg', 'heal', 'shield', 'lvPm']) if (r[k] !== undefined) bad(k + ' is retired by the spell rule: a cast is a share of its caster\'s blow (' + NUMBER_FIELDS.join(', ') + ')');
    const nums = NUMBER_FIELDS.filter((k) => r[k] !== undefined);
    if (nums.length > 1) bad('a cast lands one number: ' + nums.join(' and '));
    /* A damaging target lands a share of the hero's own largest blow (hitPm). A SHAPE may land only its status instead (Frost Slam:
       no blow, no kill); a shape with neither numbers nor a status does nothing. */
    if (DAMAGING.includes(r.target) && r.hitPm === undefined && !(AREA_TARGETS.includes(r.target) && r.status)) {
      bad(AREA_TARGETS.includes(r.target) ? 'a shape with no hitPm and no status' : 'a damaging target with no hitPm');
    }
    /* A row that lands no blow has no element to land it as (its words would name one that never strikes). */
    if (DAMAGING.includes(r.target) && !landsBlow(r) && 'element' in r) bad('an element on a row that lands no blow');
    if (r.hitPm !== undefined && (!DAMAGING.includes(r.target) || !Number.isInteger(r.hitPm) || r.hitPm < 100 || r.hitPm > 4000)) bad('hitPm is a damaging row\'s whole share of the blow, 100..4000');
    for (const k of ['healPm', 'shieldPm']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] >= 100 && r[k] <= 20000)) bad(k + ' is a whole share of the blow, 100..20000');
    if (r.healHpPm !== undefined && !(Number.isInteger(r.healHpPm) && r.healHpPm >= 1 && r.healHpPm <= 1000 && r.target === 'self')) bad('healHpPm is a self-heal\'s whole share of its own max HP, 1..1000');
    /* The shape an area row strikes, in the one geometry's bounds (shapes.js: a line at most 4 long, a ring at most 2 out). */
    const spec = areaSpec(r);
    if (spec && shapeProblem(spec)) bad(shapeProblem(spec));
    if (r.len !== undefined && r.target !== 'line') bad('only a line has a len');
    if (r.r !== undefined && r.target !== 'ring') bad('only a ring has an r');
    if (r.unlock !== undefined && !(Number.isInteger(r.unlock) && r.unlock >= 2 && r.unlock <= 99)) bad('unlock is a level 2..99 in the row\'s skill');
    /* A row's own starting rule: at most three plain conditions (conditions.js slotProblem judges each against the registry:
       tests/hunt-core/abilities.mjs rows-validate). */
    if (r.trigger !== undefined && !(Array.isArray(r.trigger) && r.trigger.length >= 1 && r.trigger.length <= 3
      && r.trigger.every((c) => c && typeof c === 'object' && typeof c.metric === 'string' && typeof c.op === 'string'))) bad('trigger is one to three { metric, op, value, subject? } conditions');
    /* A friendly target heals or shields (an ally one: the friend shield), never both (one number field, above). */
    if (['ally', 'self'].includes(r.target) && !heals(r) && !shells(r)) bad('a friendly target with no heal and no shield');
    /* A PARTY row heals or shields every living hero within its radius (the tiles round the caster), never both. */
    if (r.target === 'party' && !heals(r) && !shells(r)) bad('a party row with neither heal nor shield');
    /* A heal or a shell lands on a friend, never on a monster. */
    if ((heals(r) || shells(r)) && !['ally', 'self', 'party'].includes(r.target)) bad('a heal or a shell on a target that is no friend');
    if (r.target === 'party' && !(Number.isInteger(r.radius) && r.radius >= 1)) bad('a party row reaches a whole radius of 1 or more tiles');
    /* One vocabulary (elements.js): a name outside it would match no monster's element profile. */
    if ('element' in r && !isElement(r.element)) bad('unknown element ' + r.element);
    /* No ability may name a missing item (spec §1.2): an active rune is a carried supply line of a rune family. */
    if (r.rune && r.active && !(SUPPLIES[r.rune] && SUPPLIES[r.rune].kind === 'ammo' && isRune(ITEMS[r.rune]))) bad('rune ' + r.rune + ' is not a carried rune line');
    /* The family's version-I rune: the one its store row partners (a cast spends any tier of the family). */
    if (r.rune && r.active && runeTierOf(ITEMS[r.rune]) !== 1) bad('rune ' + r.rune + ' is not its family\'s Chalked rune');
    /* A CAST'S RETURNS (the Necrotic and Storm spells): a leech is a whole permille of a blow it lands, mana back a whole number a
       hit or a kill, each only on a row that lands blows (a status-only shape, a heal or a shield has none to return from). */
    if (r.leechPm !== undefined && !(Number.isInteger(r.leechPm) && r.leechPm > 0 && r.leechPm <= 1000 && DAMAGING.includes(r.target) && landsBlow(r))) bad('leechPm is a whole permille 1..1000 on a row that lands blows');
    for (const k of ['manaPerHit', 'manaPerKill']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] > 0 && DAMAGING.includes(r.target) && landsBlow(r))) bad(k + ' is a whole number of mana >= 1 on a row that lands blows');
    /* Alone-only is a strike's rule: a row everyone holds (the self-heal) or one that helps a friend would never help one. */
    if (r.alone !== undefined && (r.alone !== true || r.universal || !['enemy', 'area'].includes(r.target))) bad('alone is true on a damaging, non-universal row, or absent');
    /* Party-only is the mirror (the tank's rune spells): never on a row everyone holds, never beside `alone` (it could never fire). A
       list names the hunt roles it binds, each once (hunt-roles.js validate holds each to a role one of the row's disciplines plays). */
    const partyList = Array.isArray(r.party) && r.party.length >= 1 && r.party.every((x) => typeof x === 'string' && /^[a-z_]{1,32}$/.test(x)) && new Set(r.party).size === r.party.length;
    if (r.party !== undefined && ((r.party !== true && !partyList) || r.universal)) bad('party is true or a list of hunt roles on a non-universal row, or absent');
    if (r.party !== undefined && r.alone === true) bad('a row is alone or party only, never both');
    /* WHAT A ROW STANDS IN FOR (`replaces`, change 3): other rows of its lane, each held by every discipline it names, none replacing
       anything itself (a clock is a row's own cooldown, never a chain of them). */
    if (r.replaces !== undefined) {
      const ok = Array.isArray(r.replaces) && r.replaces.length >= 1 && new Set(r.replaces).size === r.replaces.length;
      if (!ok || r.universal) bad('replaces is a list of other rows, each once, on a non-universal row');
      else for (const id of r.replaces) {
        const o = rows[id];
        if (!o || id === r.id) bad('replaces ' + id + ': not another row');
        else if (o.lane !== r.lane) bad('replaces ' + id + ': another lane');
        else if (o.replaces !== undefined) bad('replaces ' + id + ', which replaces another itself');
        else if (r.disciplines.some((d) => !o.disciplines.includes(d))) bad('replaces ' + id + ', which a discipline it names does not hold');
      }
    }
    if (!r.universal && new Set(r.disciplines.map((d) => DISCIPLINE_SKILL[d])).size !== 1) bad('its disciplines level on different skills');
    if (r.versions !== undefined) {
      const vs = r.versions;
      if (!r.rune) bad('only a rune spell has versions');
      if (!Array.isArray(vs) || !vs.length || vs.length > RUNE_TIERS.length) bad('versions must list 1..' + RUNE_TIERS.length);
      else vs.forEach((mana, i) => {
        if (!Number.isInteger(mana) || mana < (i ? vs[i - 1] : 0)) bad('version ' + (i + 1) + ' must cost at least version ' + i + "'s (whole mana)");
      });
      if (Array.isArray(vs) && vs[0] !== r.mana) bad("version I's mana is the row's mana");
    }
  }
  /* Every discipline a weapon can play holds at least one ability of its own (no fixed count: a discipline grows
     by data rows). */
  for (const [d, n] of Object.entries(per)) if (n < 1) out.push(d + ' has no ability of its own');
  return out;
}
