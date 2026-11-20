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
// target, effect fields, active, versions?, lvPm? }.
//   rune: the Chalked rune of the spell's FAMILY (runes.js; version I, the item its
//     store row partners): a cast spends one carried rune of that family, the
//     highest tier the hero has unlocked (src/core/hunt/abilities.js runeFor), or the
//     store's when the slot names it. The rune is the family's, never one tier's.
//   lvPm: permille of the row's numbers added per level of its skill above 1
//     (outputPm; the same for every version).
//   target: taunt | mark | enemy | area | line | ring | cleave | self | ally | party
//     area   the 3x3 round its best aim; line: `len` tiles from the hero through its best aim;
//     ring   every monster within `r` (default 1) of the hero, up to `maxHits` (AREA_TARGETS, areaSpec:
//            src/core/hunt/shapes.js is the one geometry, the monsters' spells' too)
//   dmg [lo, hi], or hitPm: each hit is a share of the hero's OWN largest blow (its unit's maxHit),
//     permille, rolled from half that to that (the rule a monster's spell hits by), so it grows
//     with the weapon and the skill; element (an elements.js id), hits, maxHits, status (a
//     statuses.js id, H3), bonusPct + durMs (mark), shield, heal [lo, hi], whenBelowPct, minHurt,
//   radius (party heal or party shield, tiles)
//     A SHAPE (area, line, ring) with a `status` and no dmg or hitPm lands only its status: no blow,
//     no kill, no weapon XP (Frost Slam). A `party` row heals or shields every living hero in its
//     radius, never both; a party shield never lowers a bigger shell already standing.
//   alone: true = cast only while no other living hero shares the caster's world (Tyler 2026-11-09:
//     "a new spell that can only be used when not in a party"), read at each cast as the kill XP
//     reads the living heroes (src/core/hunt/abilities.js aloneIn); a death or a leave changes the
//     next cast. Otherwise the slot falls through to the next, as a slot that cannot act does.
//   party: true = its mirror, cast only while another living hero shares the caster's world (the
//     tank's rune spells, Tyler 2026-11-19: "Tank spells should be party only I think"). Never with
//     `alone`; the bar and Configure action say "Party only", as an alone row says "Solo only".
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
//   versions: a RUNE spell's versions I..V (Tyler 2026-10-23, src/data/runes.js), up to five
//     { mana, outPm }: version N is cast by spending a tier-N rune at level versionLevel(N) in
//     the row's skill (ABILITY_SKILL), costs `mana` and lands `outPm` permille of the row's
//     dmg / heal / shield (numbers only: never its area, targets, duration or cooldown). Mana
//     never grows with level; it may rise between versions (designer d3-manacost). A row with
//     no `versions` casts every version at its own mana and numbers (outPm 1000) until the
//     designer sizes them. `whenBelowPct`, `minHurt` and ABILITY_RULES.areaMin are the
//     conditions a NEW slot of the ability starts with (conditions.js suggestedConditions):
//     shown on the slot, never applied behind it.
// `active: false` holds a row whose rune is not a carried supply yet: no
// ability may name an item a hunt bag cannot hold (spec §1.2). None is held
// since the rune families landed (Rend on Rupture, Frost Lance on Ice, 2026-10-23).
//
// Numbers: designer ruling 2026-10-15 via the hunt sim (combat-data.js, a
// SPEC — never source); names and every number are the Game Designer's to
// retune here. Integer ms and percent only.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SUPPLIES } from './supplies.js?v=0.2.141';
import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.141';
import { isElement } from './elements.js?v=0.2.141';
import { ITEMS } from './items.js?v=0.2.141';
import { isRune, runeTierOf, RUNE_TIERS } from './runes.js?v=0.2.141';
import { shapeProblem } from '../core/hunt/shapes.js?v=0.2.141';
import { FIST_LINE, FIST_ELEMENTS } from './fists.js?v=0.2.141';
import { NECROTIC_STORM } from './necrotic-storm.js?v=0.2.141';

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
  disciplines: Object.freeze(o.disciplines), ...(o.dmg ? { dmg: Object.freeze(o.dmg) } : {}), ...(o.heal ? { heal: Object.freeze(o.heal) } : {}),
  ...(o.versions ? { versions: Object.freeze(o.versions.map(([mana, outPm]) => Object.freeze({ mana, outPm }))) } : {}) });

/* ── THE VERSION LADDER (Tyler 2026-10-23: versions I-V at level 1/15/30/45/60, each on its tier's rune; mana never
   grows with level but may rise from one version to the next, d3-manacost "perversion"; output grows with level).
   PROVISIONAL: the designer re-tunes every number in the balance phase (p30/p31). The Bible gives none but the
   designer's Greater Mend example (25/30/36/43/52 mana), so each spell's `versions` ([mana, outPm] pairs) follow it:
     mana    x1.2 a version (rounded), version I = the row's mana;
     outPm   1000 / 1600 / 2230 / 2870 / 3510, and `lvPm` 20 (+2% of the row's numbers a level above 1),
   sized so version N at its unlock level lands N's share of a same-level hero's HP scale (vitals: 150 + 10 a Level,
   1.00 / 1.88 / 2.81 / 3.75 / 4.69 of Level 1's): II at 15 = 1880, III at 30 = 2810, IV at 45 = 3750, V at 60 =
   4690. Version I keeps scaling, more slowly (2180 at 60): the deeper rune is the way up. MEASURED on the real
   settle (lane b-spell-content): +4% a level put the Warrens' boss under its rare pace (more kills an hour). */
const LV_PM = 10;

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
    target: 'ring', maxHits: 8, status: 'chill', magicXpMult: 250,
    versions: [[6, 1000], [7, 1000], [8, 1000], [10, 1000], [12, 1000]] }),
  /* SHELTER: an EARTH rune spell, the stone shields' family. Every living hero within 8 tiles, the tank too, gets a shell of 30
     (version I; 56 / 84 / 112 / 140 at each version's own Melee, +1% of the base a Melee level; the store's rune lands 75%),
     never lowering a bigger shell already standing. A new slot starts on a monster's cast warning (`trigger`): it shells the
     party before a group spell lands. Every 30 s. */
  ab({ id: 'shelter', n: 'Shelter', disciplines: ['shield'], party: true, lane: 'support', cdMs: 30000, mana: 25, rune: 'chalked_earth_rune', unlock: 20,
    target: 'party', shield: 30, radius: 8, magicXpMult: 250,
    trigger: [{ metric: 'enemy_casting', op: 'gte', value: 1, subject: 'any' }],
    versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  /* The blade's own strikes: a sword swings them with a shield (the tank) or alone (Melee damage, Tyler 2026-10-23). */
  ab({ id: 'flame_strike', n: 'Flame Strike', disciplines: ['shield', 'sword'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_fire_rune',
    target: 'enemy', dmg: [8, 14], element: 'ember', magicXpMult: 250,
    versions: [[10, 1000], [12, 1740], [14, 2520], [17, 3310], [21, 4100]], lvPm: LV_PM }),
  /* (the fist line plays it too while its sample is live: src/data/fists.js) */
  ab({ id: 'power_strike', n: 'Power Strike', disciplines: ['shield', 'sword', 'dual_axe', 'club', ...(FIST_LINE.live ? [FIST_LINE.family] : [])], lane: 'offense', cdMs: 6000, mana: 6,
    target: 'enemy', dmg: [7, 13] }),
  /* TURNING CUT (the area-spells design, lane/b-area-data; Tyler 2026-11-08: "our heros some more aoe spells"): every melee
     weapon WITHOUT a shield (Tyler 2026-11-16, from Andy: "Give it to all melee that doesn't have a shield on": a sword alone, two
     axes, a club or hammer, bare hands), every monster beside the hero, each for 60% of the hero's own largest blow (hitPm), so it
     grows with the weapon. Worse than Power Strike on one or two, better from three: a new slot starts "when it would hit at
     least 3". The tank gets nothing new (its job is holding). MEASURED (lane/d-turning-cut-melee, the balance sim on the real
     engine, default bars, 2 seeds): Normal moves at most +1.4% Level XP an hour (its pulls rarely put 3 beside a hero); a mixed
     four 0 to +5%, a tank + hammer + axes + healer four up to +9% on Dangerous and Deadly; ALONE on Dangerous, where it fires most, the
     sword gains +31% to +62%, a hammer +18% to +33%, axes +16% to +34% (they had Cleave already). One share for every weapon:
     after it a lone hammer stands +23% over a lone wand at the Glade (24, iron), +5-7% at Hask's Ford and the Slake, -3% at
     the Pyre Field and -15% at Krell's Hold, so no weapon leads everywhere; the numbers are on the board's 2026-11-16 section. */
  ab({ id: 'turning_cut', n: 'Turning Cut', disciplines: ['sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 8000, mana: 8, unlock: 10, target: 'ring', maxHits: 8, hitPm: 600,
    trigger: [{ metric: 'enemies_in_aoe', op: 'gte', value: 3 }] }),
  /* dual axes — Melee DPS (bleed); the club shares the sweep, never the bleed */
  ab({ id: 'cleave', n: 'Cleave', disciplines: ['dual_axe', 'club'], lane: 'offense', cdMs: 6000, mana: 8, target: 'cleave', dmg: [6, 11], maxHits: 3 }),
  /* Rend spends the RUPTURE family (Tyler 2026-10-23: its old Life rune is the Rupture rune); a deeper rune also
     bleeds harder (statuses.js bleed tierPermille). */
  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe'], lane: 'offense', cdMs: 6000, mana: 8, rune: 'chalked_rupture_rune', target: 'enemy',
    dmg: [2, 4], hits: 2, status: 'bleed', versions: [[8, 1000], [10, 1740], [12, 2520], [14, 3310], [17, 4100]], lvPm: LV_PM }),
  /* bow / crossbow — Ranger */
  ab({ id: 'hunters_mark', n: "Hunter's Mark", disciplines: ['ranged'], lane: 'support', cdMs: 12000, mana: 8, target: 'mark',
    bonusPct: 20, durMs: 8000 }),
  ab({ id: 'flame_volley', n: 'Flame Volley', disciplines: ['ranged'], lane: 'offense', cdMs: 10000, mana: 15, rune: 'chalked_fire_rune', ammo: 3,
    target: 'area', dmg: [5, 9], element: 'ember', magicXpMult: 250,
    versions: [[15, 1000], [18, 1740], [22, 2520], [26, 3310], [31, 4100]], lvPm: LV_PM }),
  ab({ id: 'precision_shot', n: 'Precision Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 6000, mana: 6, ammo: 1,
    target: 'enemy', dmg: [7, 12] }),
  /* RAKING SHOT (the area-spells design): an arrow line with no element, 4 tiles from the hero through its aim, each monster on
     it hit for 80% of the hero's own largest blow (hitPm). Two shots of the bar's ammo a cast. The Ranger's area that a slime's
     element resistance never touches (Andy 11-06: every Ranger area was fire). PROVISIONAL, unmeasured. */
  ab({ id: 'raking_shot', n: 'Raking Shot', disciplines: ['ranged'], lane: 'offense', cdMs: 8000, mana: 10, ammo: 2, unlock: 10, target: 'line', len: 4, hitPm: 800 }),
  /* staff — Mage (destruction) */
  /* Fireball is a FIRE rune spell (Tyler 2026-10-23, the approved spell map: "gold per cast covers heroes without
     runes"): a hero with no Fire Rune casts it on the store's, which the Mage's default slot names (rule-subjects.js). */
  ab({ id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'chalked_fire_rune',
    target: 'area', dmg: [7, 12], element: 'ember', magicXpMult: 1600,
    versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  ab({ id: 'frost_lance', n: 'Frost Lance', disciplines: ['destruction'], lane: 'offense', cdMs: 6000, mana: 20, rune: 'chalked_ice_rune',
    target: 'enemy', dmg: [12, 18], element: 'frost', magicXpMult: 1600,
    versions: [[20, 1000], [24, 1740], [29, 2520], [35, 3310], [41, 4100]], lvPm: LV_PM }),
  /* HOARFROST (the area-spells design): an ICE rune spell on Fireball's 3x3, and every monster it hits is Chilled (statuses.js:
     its swings and spell windups run 30% slower for 4 s), so frost slows a pack and its casts where fire burns hardest.
     PROVISIONAL, unmeasured. */
  ab({ id: 'hoarfrost', n: 'Hoarfrost', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 22, rune: 'chalked_ice_rune', unlock: 14,
    target: 'area', dmg: [5, 9], element: 'frost', status: 'chill', magicXpMult: 1600,
    versions: [[22, 1000], [26, 1740], [32, 2520], [38, 3310], [46, 4100]], lvPm: LV_PM }),
  /* An EARTH rune spell (a shell of stone, the approved spell map). Self-only (Tyler 2026-10-23, Andy's report);
     recast while its shell still stands, the unused part comes back as mana (abilities.js barrierRefund). */
  ab({ id: 'arcane_barrier', n: 'Arcane Barrier', disciplines: ['destruction'], lane: 'support', cdMs: 20000, mana: 30, rune: 'chalked_earth_rune', target: 'self',
    shield: 40, whenBelowPct: 85, magicXpMult: 1600,
    versions: [[30, 1000], [36, 1740], [43, 2520], [52, 3310], [62, 4100]], lvPm: LV_PM }),
  /* staff — Healer (restoration). Its heals are WATER rune spells (spring water closes wounds, the approved map);
     Greater Mend's mana ladder is the designer's own example (25/30/36/43/52, d3-manacost). */
  ab({ id: 'greater_mend', n: 'Greater Mend', disciplines: ['restoration'], lane: 'heal', cdMs: 2000, mana: 25, rune: 'chalked_water_rune', target: 'ally',
    heal: [40, 60], whenBelowPct: 70, magicXpMult: 1600,
    versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  ab({ id: 'circle_of_renewal', n: 'Circle of Renewal', disciplines: ['restoration'], lane: 'heal', cdMs: 12000, mana: 50, rune: 'chalked_water_rune', target: 'party',
    heal: [20, 30], whenBelowPct: 80, minHurt: 2, radius: 8, magicXpMult: 1600,
    versions: [[50, 1000], [60, 1740], [72, 2520], [86, 3310], [104, 4100]], lvPm: LV_PM }),
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
    target: 'party', heal: [120, 180], radius: 8, magicXpMult: 1600,
    trigger: [{ metric: 'party_hp_pct', op: 'lt', value: 85 }, { metric: 'in_fight', op: 'eq', value: true }, { metric: 'self_mana_pct', op: 'gte', value: 50 }],
    versions: [[120, 1000], [144, 1740], [173, 2520], [207, 3310], [249, 4100]], lvPm: LV_PM }),
  /* GREEN SICKNESS (was Nature's Wrath; Tyler 2026-10-23: a POISON rune spell, its element poison): Restoration's
     lower-power area spell, and every monster it hits takes more from every blow for a while (statuses.js sickness,
     Bible §17: a fixed, non-stacking vulnerability that no rune tier raises). */
  ab({ id: 'green_sickness', n: 'Green Sickness', disciplines: ['restoration'], lane: 'offense', cdMs: 10000, mana: 20, rune: 'chalked_poison_rune',
    target: 'area', dmg: [3, 6], element: 'poison', status: 'sickness', magicXpMult: 1600,
    versions: [[20, 1000], [24, 1740], [29, 2520], [35, 3310], [41, 4100]], lvPm: LV_PM }),
  /* PROTECTIVE WARD (Bible §17: Restoration's friend shield; roadmap p22; the name is the Bible's, the designer's to
     keep): an EARTH rune spell that shields the ally its conditions name (else the lowest wounded one in reach)
     while that ally holds no shield. PROVISIONAL numbers: a shield of 30 at version I, three quarters of Arcane
     Barrier's self-only 40, on the support lane with every shield (roadmap p12). */
  ab({ id: 'protective_ward', n: 'Protective Ward', disciplines: ['restoration'], lane: 'support', cdMs: 12000, mana: 25, rune: 'chalked_earth_rune',
    target: 'ally', shield: 30, whenBelowPct: 80, magicXpMult: 1600,
    versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  /* UNDERTOW (Tyler 2026-11-09: "Give the healer a little more damage by giving it a new spell that can only be used when
     not in a party"): the Healer's own strike, a WATER rune spell (the spring that closes wounds drags a foe under), on one
     target, cast only while the Healer hunts alone (`alone`). A lone Healer killed slowest of every way to fight (0.46-0.48
     of the pace of record at the Thicket's and Wickstead's floors); a party never sees it fire. About a Mend's mana. */
  ab({ id: 'undertow', n: 'Undertow', disciplines: ['restoration'], lane: 'offense', cdMs: 20000, mana: 15, rune: 'chalked_water_rune', alone: true,
    target: 'enemy', dmg: [8, 13], magicXpMult: 1600,
    versions: [[15, 1000], [18, 1740], [22, 2520], [26, 3310], [31, 4100]], lvPm: LV_PM }),
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
  ...(FIST_LINE.live ? FIST_ELEMENTS.flatMap(([family, element, word]) => [
    ab({ id: family + '_hands', n: word + ' Hands', disciplines: [FIST_LINE.family], skill: 'magic', lane: 'offense', cdMs: 6000, mana: 8,
      target: 'enemy', dmg: [8, 14], element, weakPm: 500, magicXpMult: 1600, lvPm: LV_PM }),
    ab({ id: family + '_palm', n: word + ' Palm', disciplines: [FIST_LINE.family], skill: 'magic', lane: 'offense', cdMs: 8000, mana: 12,
      rune: 'chalked_' + family + '_rune', target: 'enemy', dmg: [10, 18], element, weakPm: 500, magicXpMult: 1600,
      versions: [[12, 1000], [14, 1740], [17, 2520], [21, 3310], [25, 4100]], lvPm: LV_PM }),
  ]) : []),
  /* NECROTIC AND STORM, THE SAMPLE (itemization plan Appendix B3 and §11 phase 6b; Tyler 2026-11-18: "i want each weapon type to have a
     spell for both"): the sword's pair and the wand's pair, in this table only while their switch is on (src/data/necrotic-storm.js).
     A Storm spell is fast and pays back in mana, on the Storm family (the old Air); a Necrotic one drains or Withers, on the Bone family.
     Storm unlocks at 25 and Necrotic at 40 in the weapon's own skill (a sword's Melee, a wand's Magic), so at its unlock a hero already
     casts the Scored (Storm) or Etched (Necrotic) version. Versions on the built ladder (mana x1.2 a version). Magic XP: the sword's at a
     quarter (Flame Strike's 250), the wand's in full. Neither is on any default bar: the new-spell prompt offers each at its unlock.
     THE SWORD'S PAIR is the sword ALONE's: the tank's list takes neither (Tyler 2026-11-19, newer than the plan's "on the tank's list as
     well": tank spells hold and protect, and never make a lone tank kill faster; the designer's call whether the tank gets them as
     party-only). Damage beside Flame Strike's [8, 14] on one target.
       BRAND    Storm, one target, a kill gives 4 mana back. 10 mana, 8 s.
       REAVE    Necrotic, one target, 30% of the HP it took comes back as HP. 12 mana, 10 s.
     THE WAND'S PAIR, on Fireball's 3x3 (Fireball [7, 12], 25 mana, 8 s; Hoarfrost [5, 9], 22 mana, 10 s).
       UPDRAFT  Storm, an area under Fireball's damage, 3 mana back for each monster it hits. 22 mana, 10 s.
       BLIGHT   Necrotic, an area, everything it hits Withered (statuses.js: a monster heals half as much for 6 s). 25 mana, 10 s.
     Every number PROPOSED by the designer (B3) or placed beside the built spell of the same shape (the damage, which B3 leaves open);
     measured in tools/balance-sim/elements-6b-table.mjs. */
  ...(NECROTIC_STORM.live ? [
    ab({ id: 'brand', n: 'Brand', disciplines: ['sword'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_storm_rune', unlock: 25,
      target: 'enemy', dmg: [8, 14], element: 'storm', manaPerKill: 4, magicXpMult: 250,
      versions: [[10, 1000], [12, 1740], [14, 2520], [17, 3310], [21, 4100]], lvPm: LV_PM }),
    ab({ id: 'reave', n: 'Reave', disciplines: ['sword'], lane: 'offense', cdMs: 10000, mana: 12, rune: 'chalked_bone_rune', unlock: 40,
      target: 'enemy', dmg: [8, 14], element: 'necrotic', leechPm: 300, magicXpMult: 250,
      versions: [[12, 1000], [14, 1740], [17, 2520], [21, 3310], [25, 4100]], lvPm: LV_PM }),
    ab({ id: 'updraft', n: 'Updraft', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 22, rune: 'chalked_storm_rune', unlock: 25,
      target: 'area', dmg: [5, 9], element: 'storm', manaPerHit: 3, magicXpMult: 1600,
      versions: [[22, 1000], [26, 1740], [32, 2520], [38, 3310], [46, 4100]], lvPm: LV_PM }),
    ab({ id: 'blight', n: 'Blight', disciplines: ['destruction'], lane: 'offense', cdMs: 10000, mana: 25, rune: 'chalked_bone_rune', unlock: 40,
      target: 'area', dmg: [6, 10], element: 'necrotic', status: 'withered', magicXpMult: 1600,
      versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  ] : []),
  /* MEND, THE UNIVERSAL SELF-HEAL (Bible §4.1 / §17 CONFIRMED; roadmap p21): every loadout heals itself with mana on
     the heal lane, outside its three discipline abilities. It needs missing HP (a hero at full health never casts it,
     so a full-health cast never pays Magic XP) and spends no rune: the free floor. It levels on Magic, and pays Magic
     at the physical builds' quarter (Bible §5.1, 0.25). PROVISIONAL numbers, the designer's to set: half Greater
     Mend's heal at a little more than half its mana, every 6 s. */
  ab({ id: 'mend', n: 'Mend', disciplines: DISCIPLINE_IDS, universal: true, skill: 'magic',
    lane: 'heal', cdMs: 6000, mana: 15, target: 'self', heal: [20, 30], whenBelowPct: 50, magicXpMult: 250, lvPm: LV_PM }),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

const TARGETS = ['taunt', 'mark', 'enemy', 'area', 'line', 'ring', 'cleave', 'self', 'ally', 'party'];
/* The targets that strike a SHAPE (src/core/hunt/shapes.js): an action set that skips area abilities skips them all,
   and a new slot of one starts "when it would hit at least ABILITY_RULES.areaMin". */
export const AREA_TARGETS = Object.freeze(['area', 'line', 'ring']);
/* The targets that land damage on monsters. */
const DAMAGING = Object.freeze(['enemy', 'cleave', ...AREA_TARGETS]);

/** Does `row` land a BLOW (dmg or a share of the hero's own blow)? A shape row with only a `status` lands none (Frost Slam). */
export const landsBlow = (row) => !!row && (!!row.dmg || Number.isInteger(row.hitPm));

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

/** Version `n` (1..5) of `row`: { mana, outPm }. A row with no `versions` row for it casts at its own mana and numbers. */
export function versionOf(row, n) {
  const v = row && Array.isArray(row.versions) ? row.versions[n - 1] : null;
  return v ? { mana: v.mana, outPm: v.outPm } : { mana: row ? row.mana : 0, outPm: 1000 };
}

/** WHAT VERSION `n` OF `row` LANDS AT LEVEL `level` in the row's skill, in permille of the row's numbers (Tyler
    2026-10-23, d-scaling: "the first heal tier should scale up with magic level, the next tier a higher base heal,
    same scaling"): the version's own `outPm` plus the row's `lvPm` for every level above 1. The mana never grows
    with level (versionOf). A row with no `lvPm` lands at its version's numbers at every level. */
export function outputPm(row, n, level) {
  const lv = Number.isInteger(level) && level > 1 ? level : 1;
  return versionOf(row, n).outPm + (row && Number.isInteger(row.lvPm) ? row.lvPm * (lv - 1) : 0);
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
    for (const k of ['dmg', 'heal']) if (r[k] && !(r[k].length === 2 && r[k].every(Number.isInteger) && r[k][0] > 0 && r[k][0] <= r[k][1])) bad(k + ' must be [lo, hi]');
    /* A damaging target lands dmg [lo, hi] OR a share of the hero's own largest blow (hitPm), never both. A SHAPE may land only
       its status instead (Frost Slam: no blow, no kill); a shape with neither numbers nor a status does nothing. */
    if (DAMAGING.includes(r.target) && !r.dmg && r.hitPm === undefined && !(AREA_TARGETS.includes(r.target) && r.status)) {
      bad(AREA_TARGETS.includes(r.target) ? 'a shape with no dmg, no hitPm and no status' : 'a damaging target with no dmg and no hitPm');
    }
    /* A row that lands no blow has no element to land it as (its words would name one that never strikes). */
    if (DAMAGING.includes(r.target) && !landsBlow(r) && 'element' in r) bad('an element on a row that lands no blow');
    if (r.hitPm !== undefined && (!DAMAGING.includes(r.target) || r.dmg || !Number.isInteger(r.hitPm) || r.hitPm < 100 || r.hitPm > 4000)) bad('hitPm is a damaging row\'s whole share of the blow, 100..4000, in place of dmg');
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
    /* A friendly target heals or shields: `heal` [lo, hi] or a whole `shield` (an ally one: the friend shield). */
    if (['ally', 'self'].includes(r.target) && !r.heal && !(Number.isInteger(r.shield) && r.shield > 0)) bad('a friendly target with no heal and no shield');
    if (['ally', 'self'].includes(r.target) && r.heal && r.shield !== undefined) bad('a friendly target heals or shields, never both');
    /* A PARTY row heals or shields every living hero within its radius (the tiles round the caster), never both. */
    if (r.target === 'party' && !r.heal && !(Number.isInteger(r.shield) && r.shield > 0)) bad('a party row with neither heal nor shield');
    if (r.target === 'party' && r.heal && r.shield !== undefined) bad('a party row heals or shields, never both');
    if (r.target === 'party' && !(Number.isInteger(r.radius) && r.radius >= 1)) bad('a party row reaches a whole radius of 1 or more tiles');
    /* One vocabulary (elements.js): a name outside it would match no monster's element profile. */
    if ('element' in r && !isElement(r.element)) bad('unknown element ' + r.element);
    /* No ability may name a missing item (spec §1.2): an active rune is a carried supply line of a rune family. */
    if (r.rune && r.active && !(SUPPLIES[r.rune] && SUPPLIES[r.rune].kind === 'ammo' && isRune(ITEMS[r.rune]))) bad('rune ' + r.rune + ' is not a carried rune line');
    /* The family's version-I rune: the one its store row partners (a cast spends any tier of the family). */
    if (r.rune && r.active && runeTierOf(ITEMS[r.rune]) !== 1) bad('rune ' + r.rune + ' is not its family\'s Chalked rune');
    if (r.lvPm !== undefined && !(Number.isInteger(r.lvPm) && r.lvPm >= 0)) bad('lvPm must be an integer >= 0');
    /* A CAST'S RETURNS (the Necrotic and Storm spells): a leech is a whole permille of a blow it lands, mana back a whole number a
       hit or a kill, each only on a row that lands blows (a status-only shape, a heal or a shield has none to return from). */
    if (r.leechPm !== undefined && !(Number.isInteger(r.leechPm) && r.leechPm > 0 && r.leechPm <= 1000 && DAMAGING.includes(r.target) && landsBlow(r))) bad('leechPm is a whole permille 1..1000 on a row that lands blows');
    for (const k of ['manaPerHit', 'manaPerKill']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] > 0 && DAMAGING.includes(r.target) && landsBlow(r))) bad(k + ' is a whole number of mana >= 1 on a row that lands blows');
    /* Alone-only is a strike's rule: a row everyone holds (the self-heal) or one that helps a friend would never help one. */
    if (r.alone !== undefined && (r.alone !== true || r.universal || !['enemy', 'area', 'cleave'].includes(r.target))) bad('alone is true on a damaging, non-universal row, or absent');
    /* Party-only is the mirror (the tank's rune spells): never on a row everyone holds, never beside `alone` (it could never fire). */
    if (r.party !== undefined && (r.party !== true || r.universal)) bad('party is true on a non-universal row, or absent');
    if (r.party === true && r.alone === true) bad('a row is alone or party only, never both');
    if (!r.universal && new Set(r.disciplines.map((d) => DISCIPLINE_SKILL[d])).size !== 1) bad('its disciplines level on different skills');
    if (r.versions !== undefined) {
      const vs = r.versions;
      if (!r.rune) bad('only a rune spell has versions');
      if (!Array.isArray(vs) || !vs.length || vs.length > RUNE_TIERS.length) bad('versions must list 1..' + RUNE_TIERS.length);
      else vs.forEach((v, i) => {
        const prev = i ? vs[i - 1] : { mana: 0, outPm: 1000 };
        if (!v || !Number.isInteger(v.mana) || !Number.isInteger(v.outPm) || v.mana < prev.mana || v.outPm < prev.outPm) bad('version ' + (i + 1) + ' must cost and land at least version ' + i + "'s (whole mana, permille)");
      });
      if (Array.isArray(vs) && vs[0] && vs[0].mana !== r.mana) bad("version I's mana is the row's mana");
    }
  }
  /* Every discipline a weapon can play holds at least one ability of its own (no fixed count: a discipline grows
     by data rows). */
  for (const [d, n] of Object.entries(per)) if (n < 1) out.push(d + ' has no ability of its own');
  return out;
}
