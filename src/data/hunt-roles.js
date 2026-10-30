// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-roles.js — WHAT A HERO DOES IN A HUNT (HUNT_SCREEN_SPEC §1.2, §3.2)
//
// Role comes from the WORN SET (the weapon, and the shield beside it), never the
// outfit (Tyler 2026-10-16; RO-18). No vocation names anywhere. A role row is a
// function, not a spec (RO-17): THE SHIELD makes a Melee tank (Tyler 2026-10-23:
// a one-hand melee weapon and a shield; it pulls, holds and Challenges), a sword
// alone, two axes or a club a Melee DPS (stands by the tank's target), a bow or
// crossbow a Ranger (a crossbow and a shield: a Ranger WITH GUARD, never a tank;
// a bow fills both hands), a wand a Mage (its spellbook rides in the off-hand), a
// staff a Healer (Tyler 2026-10-19). The worn set's ROLE KEY (roleKeyOf) names
// its role and its ability discipline (ROLE_KEYS), all in data.
//
// UNITS (hunt-tuning.js): speed in millitiles per second, range in tiles,
// chances in permille, clocks in integer ms.
//
// The role NUMBERS live here (spec §1.2: peel chance, spot hysteresis, the
// Challenge radius and cooldown). World numbers stay in hunt-tuning.js. Every
// ASSUMED value is spec §5's.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { DISCIPLINES } from './abilities.js?v=0.2.74';
import { isShield } from './shields.js?v=0.2.74';

/* role id → row.
   melee     true = attacks only from an adjacent tile, and only standing on it (RO-19)
   range     tiles; a ranged role also needs line of sight (TG-02)
   tank      true = holds, and Challenges what is not on him (spec §3.2 #2, #14)
   peel      permille: a basic attack of this role draws a queued monster onto it (TG-07, ASSUMED)
   (the abilities a hero's bar may hold are its ROLE KEY's discipline, ROLE_KEYS below: a role is played by
   several keys, a sword alone and a club both Melee DPS on their own lists)
   basic     a CASTER's basic attack (Tyler 10-15 K3, 10-23: a wand or staff basic costs a little mana and
             trains Magic; runes fuel spells only): { mana it spends a swing (no mana, no swing: AB-12),
             magicXpMult (the abilities.js scale: permille of the mana spent, x1000) }. PROVISIONAL
             (lane b-spell-core): 1 mana, so regeneration alone carries it at every Level, at the staff
             spells' 1600; the designer retunes both (balance p30/p31). A role with no `basic` swings free.
   A role sets no HP or mana: those come from the character's Level and armour
   (src/core/vitals.js, CORE_MODEL.md §3). */
export const HUNT_ROLES = Object.freeze({
  tank: Object.freeze({ label: 'Melee (shield)', melee: true, range: 1, tank: true, speed: 3200, peel: 0 }),
  melee_dps: Object.freeze({ label: 'Melee', melee: true, range: 1, tank: false, speed: 3200, peel: 0 }),
  ranger: Object.freeze({ label: 'Ranger', melee: false, range: 7, tank: false, speed: 3200, peel: 0 }),
  mage: Object.freeze({ label: 'Mage', melee: false, range: 7, tank: false, speed: 3200, peel: 0,
    basic: Object.freeze({ mana: 1, magicXpMult: 1600 }) }),
  healer: Object.freeze({ label: 'Healer', melee: false, range: 7, tank: false, speed: 3200, peel: 180,
    basic: Object.freeze({ mana: 1, magicXpMult: 1600 }) }),
});

/* WHO LEADS THE PULL (spec §3.2 #3, ASSUMED): the first hero in this order, ties by unit id. */
export const ROLE_ORDER = Object.freeze(['tank', 'melee_dps', 'ranger', 'mage', 'healer']);

/* THE ROLE KEYS: what a worn set plays. key → { roles (the first the default), discipline (the
   src/data/abilities.js DISCIPLINES list the bar may hold) }. The key is roleKeyOf(weapon, off-hand):
   the weapon's roleWeaponOf key (its weaponType; a magic weapon by its `discipline`, gear-tiers.js:
   destruction = 'wand' (Mage), restoration = 'staff' (Healer), Tyler 2026-10-19), turned into its
   SHIELD_ARM key when a shield is worn beside it. This table is the ONE weapon -> role source: the
   server (hr_hunt_weapon_roles, generated, with the shield arm), hunt-spawn heroSetup and the client
   (import roleForWeapon, never a copy). items.js weaponType stays the COMBAT style (accuracy skill,
   weakness), so the rows are mapped here, not renamed. Bows and crossbows ship as `ranged` (a bow is
   two-handed: items.js `twoHanded`, so it never wears a shield). The `bow`, `crossbow`, `dual_axe` and
   `club` keys are the party finder's words for a weapon no item plays by that name. */
const key = (roles, discipline) => Object.freeze({ roles: Object.freeze(roles), discipline });
export const ROLE_KEYS = Object.freeze({
  /* a one-hand melee weapon with a shield: the anchor, the tank (Tyler 2026-10-23: the SHIELD makes the tank) */
  shield: key(['tank'], 'shield'),
  /* a sword ALONE: Melee damage, the blade's own strikes (Tyler 2026-10-23) */
  sword: key(['melee_dps'], 'sword'),
  dual_axe: key(['melee_dps'], 'dual_axe'),
  /* a pair of axes (the Practice Hatchets): weaponType 'axe', the Melee family (skills.js FAMILY_SKILL) */
  axe: key(['melee_dps'], 'dual_axe'),
  /* the club: its own discipline (roadmap p15); a two-hand hammer is a club */
  club: key(['melee_dps'], 'club'),
  hammer: key(['melee_dps'], 'club'),
  /* bare hands: Melee damage on the club's blunt list (no rune spell, no bleed) */
  neutral: key(['melee_dps'], 'club'),
  bow: key(['ranger'], 'ranged'),
  crossbow: key(['ranger'], 'ranged'),
  ranged: key(['ranger'], 'ranged'),
  staff: key(['healer'], 'restoration'),
  wand: key(['mage'], 'destruction'),
});
/* ROLE KEY → the roles it can play (ROLE_KEYS' `roles`), the shape every reader takes. */
export const WEAPON_ROLES = Object.freeze(Object.fromEntries(Object.entries(ROLE_KEYS).map(([k, r]) => [k, r.roles])));

/* THE SHIELD ARM: weapon key → the key it plays with a shield worn beside it. Only a one-hand MELEE
   weapon becomes the tank (a sword, or bare hands); a crossbow, a wand (or anything else one-handed)
   keeps its own key and gains only the shield's guard; a two-handed weapon cannot wear one at all
   (hr_apply refuses the pair, `two_handed`). */
export const SHIELD_ARM = Object.freeze({ sword: 'shield', neutral: 'shield' });

/* The magic disciplines' role keys (Tyler 2026-10-19). */
const MAGIC_ROLE_WEAPON = Object.freeze({ destruction: 'wand', restoration: 'staff' });

/** The WEAPON_ROLES key an equipped weapon item plays: a magic weapon by its discipline
 *  (wand / staff), any other by its weaponType; 'neutral' for no weapon. Every magic weapon
 *  names its discipline (roadmap p23, m03: the Demoncaller staff and the Void Censer heal, the
 *  Whispering Codex and the Voidmaw Scepter strike; tests/hunt-core/roles.mjs holds it); one
 *  that named none would fall to the Mage. */
export function roleWeaponOf(item) {
  if (!item) return 'neutral';
  if (item.weaponType === 'magic') return MAGIC_ROLE_WEAPON[item.discipline] || 'wand';
  return item.weaponType || 'neutral';
}

/** THE ROLE KEY a weapon item and an off-hand item play together: the weapon's key (roleWeaponOf),
 *  or its SHIELD_ARM key when `offhand` is a shield (shields.js isShield). */
export function roleKeyOf(weapon, offhand) {
  const k = roleWeaponOf(weapon);
  return isShield(offhand) && SHIELD_ARM[k] ? SHIELD_ARM[k] : k;
}

/** roleKeyOf over a worn set ({ equip slot: item id }) and an item catalogue: the weapon slot and the shield slot. */
export function wornRoleKey(equipment, items) {
  const e = equipment || {};
  return roleKeyOf(items && e.weapon ? items[e.weapon] : null, items && e.shield ? items[e.shield] : null);
}

/** The ability discipline a role key plays (ROLE_KEYS), or null for no row. */
export const disciplineOf = (k) => (ROLE_KEYS[k] ? ROLE_KEYS[k].discipline : null);

/* THE TANK'S AUTO-CHALLENGE (spec §3.2 #14, ASSUMED numbers): any engaged monster
   within `radius` tiles (Chebyshev, "on screen") that is not on the tank is pulled
   onto him and HELD there `holdMs` (no other tank's Challenge takes it meanwhile),
   at most once per the `challenge` ability's cdMs (src/data/abilities.js, the one
   cooldown). No player input. The hold EQUALS the cooldown (designer 2026-10-21): a
   lone tank's pack is never free between two Challenges (a 6 s hold left it 2 s in
   every 8 to turn on the Healer). With two or more tanks ONE holds a lap
   (src/core/hunt/targeting.js holderTank: designer 2026-10-21, Option A); the others
   take only what is on a hero that is not a tank.
   holderMinHpPm: A TANK MUCH WEAKER THAN THE PARTY'S STRONGEST NEVER HOLDS (designer
   2026-10-21: an L9 + L19 pair at Sewer density 7 died in 2 min, the L9 holding the
   pack every other lap). The measure is the unit's maxHp, the one the engine carries
   (vitals.js: Level plus heavy armour): a tank holds a lap only while its maxHp is at
   least this permille of the strongest living tank's. 900 = about 3 Levels under an
   L19, 6 under an L50, 20 under an L200 (the gap grows with Level, as max HP does).
   Measured at Sewer density 7 beside an L19 (play-ground.mjs, 3 seeds, 30 min): with
   no floor an L11 (827) and an L13 (894) holding died; L15 and up lived. At 900 every
   pair lived. The weaker tank still takes the overflow off the casters, and joins the
   rotation once the party's shared XP levels it close enough. */
export const CHALLENGE = Object.freeze({ radius: 6, holdMs: 8000, holderMinHpPm: 900 });

/* THE RANGED SPOT (spec §3.1 #10, §5 #4, ASSUMED). A spot is valid while its
   distance d from the hero's own target is in [want - bandBelow, want + bandAbove]
   (tenths of a tile); a held spot is given up only for one scoring
   `hysteresis` better. `searchRadius` bounds the candidate square round the target.
   Score weights (lower is better): off-distance, walk, and a reward for room. */
export const SPOT = Object.freeze({
  bandBelowTenths: 10, bandAboveTenths: 12, searchRadius: 8, hysteresis: 0.5,
  weightOffDistance: 2, weightWalk: 0.35, weightRoomPerMonster: 0.15, roomCap: 6,
});

/* KITING (spec §3.2 #5, #8, #9; RO-10..12). A kiter looks for a retreat tile within
   `searchRadius`; a tile must lie at least `awayMin` farther from the pack centre than
   the hero stands now, and at least min(dist, `minGap`) from every monster. */
export const KITE = Object.freeze({ searchRadius: 5, awayMin: 0.5, minGap: 2, shortPenalty: 3, noSightPenalty: 4 });

/* How often a monster re-picks its surround slot, and the ring extras queue on (RO-02). */
export const SURROUND = Object.freeze({ repathMs: 500, queueRing: 2 });

/* THE OPEN GROUND (Tyler + Andy 2026-10-25: "fix pathing so that the tank doesn't stand next to the wall. During an
   8 box it ruins the whole point"). A holding tank whose pack is still walking in, more of it than his tile's box
   can take, steps at most `steps` moves (round the monsters, inside the pack area) to a tile with more room before
   he plants (src/core/hunt/roles.js plantOpen). A tile's room is read `wayRound` tiles round it: how far a monster
   is looked for a way round the box to its far side (roles.js roomAt). Measured on the real grounds at density 8
   (tests/hunt-core/roles.mjs tank-plants-on-open-ground). */
export const OPEN_GROUND = Object.freeze({ steps: 2, wayRound: 4 });

/* How often the travelling leader / a positioning hero re-aims (RO-05, PC-03). */
export const AI_REPATH_MS = Object.freeze({ travel: 1500, ranged: 1000, melee: 500, kite: 600 });

/** The role a weapon type plays: `pick` when the weapon allows it, else its default; null for no row. */
export function roleForWeapon(weaponType, pick) {
  const roles = WEAPON_ROLES[weaponType];
  if (!roles) return null;
  return pick && roles.includes(pick) ? pick : roles[0];
}

/* WHAT A ROLE'S SHOT CAN LOOSE (Andy 2026-10-23: a Ranger's bow loosed his Copper Whetstones, one
   a shot, from an attack slot ahead of his arrows): an AMMO item whose own `reqSkill` is the role's
   shot skill. A bow or crossbow shoots Ranged ammo (arrows, bolts); a staff or wand shoots nothing (its
   basic spends mana and a rune fuels spells only: Tyler 2026-10-23, COMBAT AUDIT ANSWERS), nor does a Melee
   hero. A whetstone is Melee ammo: it sharpens a blade worn in the ammo slot (src/core/ammo.js honeOf) and is
   no one's shot. */
const SHOT_SKILL = Object.freeze({ ranger: 'ranged' });

/** Can a hero of `role` loose `item` (an items.js row) as a shot? */
export function shootsItem(role, item) {
  const skill = Object.prototype.hasOwnProperty.call(SHOT_SKILL, role) ? SHOT_SKILL[role] : null;
  return !!skill && !!item && item.slot === 'ammo' && item.reqSkill === skill;
}

/** Every problem with the tables, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const roleIds = Object.keys(HUNT_ROLES);
  if (ROLE_ORDER.length !== roleIds.length || !roleIds.every((r) => ROLE_ORDER.includes(r))) out.push('ROLE_ORDER must list every role once');
  for (const [id, r] of Object.entries(HUNT_ROLES)) {
    if (!/^[a-z_]{1,32}$/.test(id)) out.push(id + ': bad id');
    if (typeof r.melee !== 'boolean' || typeof r.tank !== 'boolean') out.push(id + ': melee and tank are booleans');
    if (!Number.isInteger(r.range) || r.range < 1 || r.range > 12) out.push(id + ': range must be 1..12 tiles');
    if (r.melee && r.range !== 1) out.push(id + ': a melee role has range 1');
    if (!Number.isInteger(r.speed) || r.speed <= 0) out.push(id + ': speed must be a positive integer');
    if (!Number.isInteger(r.peel) || r.peel < 0 || r.peel > 1000) out.push(id + ': peel is permille 0..1000');
    if (r.basic !== undefined && !(r.basic && Number.isInteger(r.basic.mana) && r.basic.mana > 0 && Number.isInteger(r.basic.magicXpMult)
      && r.basic.magicXpMult >= 0 && !r.melee)) out.push(id + ': a basic costs whole mana > 0 at a whole magicXpMult >= 0, and only a ranged role casts one');
  }
  for (const [w, row] of Object.entries(ROLE_KEYS)) {
    if (!/^[a-z_]{1,32}$/.test(w)) out.push('role key ' + w + ': bad id');
    if (!row.roles.length || !row.roles.every((r) => HUNT_ROLES[r])) out.push('weapon ' + w + ' names an unknown role');
    /* the one discipline list (abilities.js DISCIPLINES): a key naming any other plays an empty bar */
    if (!Object.prototype.hasOwnProperty.call(DISCIPLINES, row.discipline)) out.push('weapon ' + w + ': unknown discipline ' + row.discipline);
  }
  /* The tank's key is the shield's (Tyler 2026-10-23): only a key a shield arm leads to plays the tank. */
  for (const [w, row] of Object.entries(ROLE_KEYS)) {
    const tanks = row.roles.some((r) => HUNT_ROLES[r] && HUNT_ROLES[r].tank);
    if (tanks !== Object.values(SHIELD_ARM).includes(w)) out.push('weapon ' + w + (tanks ? ' plays the tank without a shield' : ' is a shield arm that plays no tank'));
  }
  for (const [w, to] of Object.entries(SHIELD_ARM)) if (!ROLE_KEYS[w] || !ROLE_KEYS[to]) out.push('shield arm ' + w + ' -> ' + to + ' names an unknown key');
  if (!ROLE_KEYS.neutral) out.push('ROLE_KEYS has no neutral row (an unarmed hero)');
  for (const r of Object.keys(SHOT_SKILL)) if (!HUNT_ROLES[r] || HUNT_ROLES[r].melee) out.push('SHOT_SKILL ' + r + ': not a ranged role');
  if (!Number.isInteger(CHALLENGE.radius) || CHALLENGE.radius < 1) out.push('CHALLENGE.radius must be a positive integer');
  if (!Number.isInteger(CHALLENGE.holdMs) || CHALLENGE.holdMs <= 0 || CHALLENGE.holdMs % 100 !== 0) out.push('CHALLENGE.holdMs must be a whole number of 100 ms sub-steps');
  if (!Number.isInteger(CHALLENGE.holderMinHpPm) || CHALLENGE.holderMinHpPm < 0 || CHALLENGE.holderMinHpPm > 1000) out.push('CHALLENGE.holderMinHpPm is permille 0..1000');
  for (const [k, v] of Object.entries(AI_REPATH_MS)) if (!Number.isInteger(v) || v <= 0 || v % 100 !== 0) out.push('AI_REPATH_MS.' + k + ' must be a whole number of sub-steps');
  if (!Number.isInteger(SURROUND.repathMs) || SURROUND.repathMs % 100 !== 0) out.push('SURROUND.repathMs must be a whole number of sub-steps');
  if (!Number.isInteger(OPEN_GROUND.steps) || OPEN_GROUND.steps < 0 || OPEN_GROUND.steps > 4) out.push('OPEN_GROUND.steps must be a whole number of moves 0..4 (a small step, never a walk across the room)');
  if (!Number.isInteger(OPEN_GROUND.wayRound) || OPEN_GROUND.wayRound < 2 || OPEN_GROUND.wayRound > 8) out.push('OPEN_GROUND.wayRound must be a whole number of tiles 2..8 (the box and its ring, at least)');
  if (!(SPOT.hysteresis >= 0)) out.push('SPOT.hysteresis must be >= 0');
  return out;
}
