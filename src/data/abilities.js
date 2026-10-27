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
//   target: taunt | mark | enemy | area | cleave | self | ally | party
//   dmg [lo, hi], element (an elements.js id), hits, maxHits, status (a statuses.js id, H3),
//   bonusPct + durMs (mark), shield, heal [lo, hi], whenBelowPct, minHurt,
//   radius (party heal, tiles)
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

import { SUPPLIES } from './supplies.js?v=0.2.54';
import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.54';
import { isElement } from './elements.js?v=0.2.54';
import { ITEMS } from './items.js?v=0.2.54';
import { isRune, runeTierOf, RUNE_TIERS } from './runes.js?v=0.2.54';

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
});
export const DISCIPLINE_IDS = Object.freeze(Object.keys(DISCIPLINES));

export const ABILITY_RULES = Object.freeze({
  /* Mana regenerates 25% of max a minute (designer ruling 2026-10-15, AB-13). */
  manaRegenPctPerMin: 25,
  /* An area ability's suggested trigger: at least this many monsters in its footprint (AB-03; a NEW slot's
     starting condition, suggestedTrigger, never a hidden one). */
  areaMin: 2,
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
  /* The blade's own strikes: a sword swings them with a shield (the tank) or alone (Melee damage, Tyler 2026-10-23). */
  ab({ id: 'flame_strike', n: 'Flame Strike', disciplines: ['shield', 'sword'], lane: 'offense', cdMs: 8000, mana: 10, rune: 'chalked_fire_rune',
    target: 'enemy', dmg: [8, 14], element: 'ember', magicXpMult: 250,
    versions: [[10, 1000], [12, 1740], [14, 2520], [17, 3310], [21, 4100]], lvPm: LV_PM }),
  ab({ id: 'power_strike', n: 'Power Strike', disciplines: ['shield', 'sword', 'dual_axe', 'club'], lane: 'offense', cdMs: 6000, mana: 6,
    target: 'enemy', dmg: [7, 13] }),
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
  /* staff — Mage (destruction) */
  /* Fireball is a FIRE rune spell (Tyler 2026-10-23, the approved spell map: "gold per cast covers heroes without
     runes"): a hero with no Fire Rune casts it on the store's, which the Mage's default slot names (rule-subjects.js). */
  ab({ id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'chalked_fire_rune',
    target: 'area', dmg: [7, 12], element: 'ember', magicXpMult: 1600,
    versions: [[25, 1000], [30, 1740], [36, 2520], [43, 3310], [52, 4100]], lvPm: LV_PM }),
  ab({ id: 'frost_lance', n: 'Frost Lance', disciplines: ['destruction'], lane: 'offense', cdMs: 6000, mana: 20, rune: 'chalked_ice_rune',
    target: 'enemy', dmg: [12, 18], element: 'frost', magicXpMult: 1600,
    versions: [[20, 1000], [24, 1740], [29, 2520], [35, 3310], [41, 4100]], lvPm: LV_PM }),
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
  /* MEND, THE UNIVERSAL SELF-HEAL (Bible §4.1 / §17 CONFIRMED; roadmap p21): every loadout heals itself with mana on
     the heal lane, outside its three discipline abilities. It needs missing HP (a hero at full health never casts it,
     so a full-health cast never pays Magic XP) and spends no rune: the free floor. It levels on Magic, and pays Magic
     at the physical builds' quarter (Bible §5.1, 0.25). PROVISIONAL numbers, the designer's to set: half Greater
     Mend's heal at a little more than half its mana, every 6 s. */
  ab({ id: 'mend', n: 'Mend', disciplines: DISCIPLINE_IDS, universal: true, skill: 'magic',
    lane: 'heal', cdMs: 6000, mana: 15, target: 'self', heal: [20, 30], whenBelowPct: 50, magicXpMult: 250, lvPm: LV_PM }),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

const TARGETS = ['taunt', 'mark', 'enemy', 'area', 'cleave', 'self', 'ally', 'party'];

/* THE SKILL A DISCIPLINE'S VERSIONS LEVEL ON (DISCIPLINES above). A universal row names its own `skill`. */
export const DISCIPLINE_SKILL = Object.freeze(Object.fromEntries(DISCIPLINE_IDS.map((d) => [d, DISCIPLINES[d].skill])));
/** The ability ids discipline `d` may hold, in data order (its own rows and every universal row). */
export const disciplineAbilities = (d) => Object.values(ABILITIES).filter((a) => a.disciplines.includes(d)).map((a) => a.id);
/** The skill `row`'s versions and output level on. */
export const abilitySkill = (row) => (row && row.universal && row.skill) || DISCIPLINE_SKILL[row && row.disciplines && row.disciplines[0]] || 'magic';

/** THE TRIGGER A NEW SLOT OF `row` STARTS WITH, as conditions written ON the slot (the role rule sets,
    rule-subjects.js ROLE_RULES, and a slot the player adds: conditions.js suggestedConditions). Never
    applied behind a slot: one with no conditions fires whenever it is ready (Tyler 2026-10-23, c21). */
export function suggestedTrigger(row) {
  if (!row) return [];
  if (row.target === 'self') return [{ metric: 'self_hp_pct', op: 'lt', value: row.whenBelowPct }];
  if (row.target === 'ally') return [{ metric: 'ally_hp_pct', op: 'lt', value: row.whenBelowPct, subject: 'lowest' }];
  if (row.target === 'area') return [{ metric: 'enemies_in_aoe', op: 'gte', value: ABILITY_RULES.areaMin }];
  if (row.target === 'party') return [{ metric: 'allies_below', op: 'gte', value: row.minHurt, subject: 'under_' + row.whenBelowPct }];
  return [];
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

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const step = HUNT_TUNING.stepMs;
  for (const [lane, ms] of Object.entries(ABILITY_LANES)) if (!Number.isInteger(ms) || ms <= 0 || ms % step) out.push('lane ' + lane + ' ' + ms + ' ms is not a whole number of sub-steps');
  for (const [d, row] of Object.entries(DISCIPLINES)) if (!/^[a-z_]{1,32}$/.test(d) || !['melee', 'ranged', 'magic'].includes(row.skill)) out.push('discipline ' + d + ': a [a-z_] id levelling on melee, ranged or magic');
  const per = Object.fromEntries(DISCIPLINE_IDS.map((d) => [d, 0]));
  for (const r of Object.values(ABILITIES)) {
    const bad = (m) => out.push(r.id + ': ' + m);
    if (!ABILITY_LANES[r.lane]) bad('unknown lane ' + r.lane);
    if (!TARGETS.includes(r.target)) bad('unknown target ' + r.target);
    if (!Number.isInteger(r.cdMs) || r.cdMs <= 0 || r.cdMs % step) bad('cdMs is not a whole number of sub-steps');
    for (const k of ['mana', 'ammo', 'magicXpMult']) if (!Number.isInteger(r[k]) || r[k] < 0) bad(k + ' must be an integer >= 0');
    for (const d of r.disciplines) { if (!(d in per)) bad('unknown discipline ' + d); else if (!r.universal) per[d]++; }
    /* A universal row is every discipline's, on a skill it names (the self-heal: Magic). */
    if (r.universal && (DISCIPLINE_IDS.some((d) => !r.disciplines.includes(d)) || !Object.values(DISCIPLINE_SKILL).includes(r.skill))) bad('a universal row lists every discipline and names its skill');
    if (new Set(r.disciplines).size !== r.disciplines.length) bad('a discipline is listed twice');
    for (const k of ['dmg', 'heal']) if (r[k] && !(r[k].length === 2 && r[k].every(Number.isInteger) && r[k][0] > 0 && r[k][0] <= r[k][1])) bad(k + ' must be [lo, hi]');
    if (['enemy', 'area', 'cleave'].includes(r.target) && !r.dmg) bad('a damaging target with no dmg');
    /* A friendly target heals or shields: `heal` [lo, hi] or a whole `shield` (an ally one: the friend shield). */
    if (['ally', 'self'].includes(r.target) && !r.heal && !(Number.isInteger(r.shield) && r.shield > 0)) bad('a friendly target with no heal and no shield');
    if (['ally', 'self'].includes(r.target) && r.heal && r.shield !== undefined) bad('a friendly target heals or shields, never both');
    if (r.target === 'party' && !r.heal) bad('a heal target with no heal');
    /* One vocabulary (elements.js): a name outside it would match no weakness, resist or immunity. */
    if ('element' in r && !isElement(r.element)) bad('unknown element ' + r.element);
    /* No ability may name a missing item (spec §1.2): an active rune is a carried supply line of a rune family. */
    if (r.rune && r.active && !(SUPPLIES[r.rune] && SUPPLIES[r.rune].kind === 'ammo' && isRune(ITEMS[r.rune]))) bad('rune ' + r.rune + ' is not a carried rune line');
    /* The family's version-I rune: the one its store row partners (a cast spends any tier of the family). */
    if (r.rune && r.active && runeTierOf(ITEMS[r.rune]) !== 1) bad('rune ' + r.rune + ' is not its family\'s Chalked rune');
    if (r.lvPm !== undefined && !(Number.isInteger(r.lvPm) && r.lvPm >= 0)) bad('lvPm must be an integer >= 0');
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
