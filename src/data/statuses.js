// ════════════════════════════════════════════════════════════════════════
// src/data/statuses.js — STATUS ROWS (HUNT_SCREEN_SPEC §3.3, parity ST-01..06; the general status system, lane/e2-e3-statuses, E2)
//
// One row per status. The pure engine (src/core/hunt/status.js, its readers src/core/hunt/status-effects.js) is generic: it knows
// stacks, ticks, keys, refresh and expiry, never a status by name. A NEW STATUS IS A ROW HERE, NOT CODE.
//
// ROW SHAPE. Every row: { id, name, key, durationMs, maxStacks, refresh?, hidden? } and ONE OR MORE EFFECTS:
//   key           its STACKING KEY (STATUS_KEYS below, docs/design/redesign/15-signature-candidates.md "Stacking keys"): rows of one key
//                 are one effect. maxStacks and the refresh count every stack of the key on a unit (a `strongest` key) or of the row
//                 (an `add` key, whose different rows add); the readers count one value a key (STATUS_KEYS combine)
//   durationMs    a stack lasts this long (a whole number of sub-steps)
//   maxStacks     stacks one unit may carry at once, any sources
//   refresh       what a new landing does to the stacks already there (default 'restart'):
//                   restart  every stack of the key (an `add` key: of the row) restarts its time; a stack that does not tick is lifted
//                            to a stronger landing's scale (never lowered); one more stack is added under maxStacks; at maxStacks a
//                            weaker stack of ANOTHER row of the key is replaced by the landing (15: "the stronger one replaces")
//                   keep     the stacks there keep their own clocks; at maxStacks the oldest goes; the landing is added (a ground patch)
//   hidden        true: no player meets it yet (no move, Trait or Signature lands it). Not offered to the bar's effect picker
//                 (condition-metrics.js EFFECT_IDS, the server's catalogue), not a stacks subject; the engine and its tests read it
// EFFECTS (any combination, except that one stack has ONE scale, so a tick, a tiered slow and a guarded heal cut never share a row):
//   tick          a TICKING status (damage over time, or heal over time with `heals`):
//                   tick [min, max]  the base roll of one tick, inclusive ([1, 1]: a fixed tick, no draw)
//                   everyMs          one tick every this long (a whole number of sub-steps)
//                   blowPm           permille of the SOURCE's own largest blow (its unit's maxHit, the caller passes it: source.maxHit)
//                                    one tick of the base roll lands (THE SPELL RULE, lane/c-spell-rule: a tick grows with the weapon
//                                    and the skill as the cast that landed it does)
//                   tierPermille     multiplier by rune tier, permille, index 0 = tier 1; a source with no rune is tier 1
//                   damageType       the element each tick is dealt as ('physical' or an elements.js id), or
//                   heals            true: each tick HEALS its unit (heal-cut.js healTaken, never past its max HP) instead
//                 A stack's scale is FIXED when it lands (spec §3.3 #6):
//                   scale = max(tierPermille[tier-1], floor(maxHit x blowPm x tierPermille[tier-1] / 1000))
//                   tick  = round(roll(tick) x scale / 1000)
//   ground        { r }: a GROUND status (burning ground). Its stack is held by the unit that placed it, at a tile (`at`), and each
//                 tick lands on every enemy of its holder within r tiles (Chebyshev) of that tile, in id order, one roll for all.
//                 A ticking, damaging row; nothing else; refresh 'keep' (each patch its own place and clock)
//   takenPm       permille MORE (or, negative, LESS) damage its unit takes from every blow while it lasts (damage.js landHit, beside
//                 Hunter's Mark): Sickness +100, a hero's guard -100. Fixed: never scaled by skill or rune tier (Bible §17)
//   dealtPm       permille MORE (or LESS) damage every blow its unit lands deals (damage.js landHit): Weakened -80. Fixed
//   armorPm       permille MORE (or LESS) defence a MONSTER keeps against a blow (damage.js hurt, where defenceReduction comes off):
//                 Armor Break -250. A hero's armour is its gear's (mitigation.js), so on a hero it reads nothing. Fixed
//   slowPm        permille LONGER its unit's next swing interval and its next spell windup run, fixed as each one starts (damage.js
//                 slowed: the swing clock; monster-spells.js: the windup). A slowing row may carry tierPermille (its slow by the rune
//                 tier of the cast that landed it, the tank rune spells 2026-11-19): slow = round(slowPm x tierPermille[tier-1] / 1000)
//   silence       true: its unit starts no spell while it lasts (monster-spells.js: its cooldowns still run; a windup already started
//                 still lands, ending one is Stagger's, 23 section 4)
//   parry         true: its unit's NEXT BLOW lands nothing, and the stack is spent on it (damage.js resolveAttacks: a swing and its
//                 splash; monster-spells.js land: a wind-up's landing, which is its caster's blow; a mend strikes no hero and spends
//                 none). A tick is no blow. Fixed: never scaled by skill or rune tier
//   healCutPm    { hero, monster } permille LESS of every heal its unit takes while it lasts, by the unit's side (heal-cut.js healTaken,
//                 the one reader). guard (optional): an element; a HERO's resistance to it lowers the hero's cut by the same percent,
//                 fixed as the stack lands: cut = floor(healCutPm.hero x taken / 1000). A monster's cut is never guarded
// THE KEYS' COUNT (status-effects.js effectPm): a unit's value of one effect is, over its keys, the key's value summed:
//   strongest  the largest (by size) live stack of the key counts, alone (15: "doesn't stack, the largest counts")
//   add        the strongest stack of each ROW of the key counts, the rows added, held to the key's capPm (15: "different sources add")
//
// Numbers: Bleed's stacks 5 and 6 s are DECIDED (week plan item 6); the tick's share and the +10% tiers are the spell rule's.
// Bleed is generic (Tyler 10-16): heroes and monsters both carry it, and it is physical damage (Tyler 10-16).
// Every HIDDEN row's number is PROVISIONAL (docs/design/redesign 15, 22, 23): the designer's to set when its move ships.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js';
import { PHYSICAL, isElement } from './elements.js';
import { NECROTIC_STORM } from './necrotic-storm.js';

/* THE STACKING KEYS a status row may name (15 "Stacking keys", 22 section 4.2): how a key's stacks count. capPm: an `add` key's total
   held to this size, permille (absent: no cap). */
export const STATUS_KEYS = Object.freeze({
  bleed: Object.freeze({ combine: 'strongest' }),               // one count of stacks per monster, from every source
  monster_takes_more: Object.freeze({ combine: 'strongest' }),  // Sickness: one a monster, the stronger replaces
  chill: Object.freeze({ combine: 'strongest' }),               // one Chill a monster, a new one restarts the time and keeps the stronger
  withered: Object.freeze({ combine: 'strongest' }),
  poison: Object.freeze({ combine: 'strongest' }),
  armor_break: Object.freeze({ combine: 'strongest' }),         // one a monster, the largest counts
  monster_deals_less: Object.freeze({ combine: 'strongest' }),  // Weakened, Shaken, Hard Challenge: the largest counts
  silenced: Object.freeze({ combine: 'strongest' }),            // one at a time, restarts the time
  parried: Object.freeze({ combine: 'strongest' }),             // one at a time: a second Parry restarts the window, never a second blow
  burning_ground: Object.freeze({ combine: 'strongest' }),
  /* "different sources add, the Lab sets one cap for the total" (15): PROVISIONAL caps, the Lab's to set */
  hero_takes_less: Object.freeze({ combine: 'add', capPm: 300 }),
  hero_deals_more: Object.freeze({ combine: 'add', capPm: 300 }),
  heal_over_time: Object.freeze({ combine: 'add' }),
  /* THE ENGINE PIECES' STACKS (lane/talent-effects: src/core/hunt/heal-rules.js, reactions.js). Each stack of a ticking row here carries
     its own fixed tick (`amt`, whole HP, fixed as it lands: a share of the heal or blow that laid it), so it reads no blow and no roll */
  mending: Object.freeze({ combine: 'add' }),          // a heal laid over time: each caster's its own stack
  echo: Object.freeze({ combine: 'add' }),             // a second hit a few seconds later
  frozen_ground: Object.freeze({ combine: 'strongest' }),
});

const TIERS = Object.freeze([1000, 1100, 1200, 1300, 1400]);

/* The five rune tiers (src/data/runes.js): Rend's bleed lands +10% a tier above Chalked, the step every rune spell takes
   (runes.js RUNE_TIERS stepPm), so a Graven Rupture Rune's bleed ticks 1.4x a Chalked one's.
   UNDER THE SPELL RULE (Tyler 2026-11-21, call 21-5; plan lane L17: "Rend ... with its bleed converted") a tick rolls its 1-3 times
   the larger of its rune tier's share and 3.3% of the axes' own largest blow (blowPm), fixed as the stack lands: its Level 60 worth
   before the rule (5 stacks held, 15% of a same-Level monster a second), where the old +0.4% a Melee level fell to 10% at Level 110
   (tools/balance-sim/staged/spell-audit.mjs section 4); under about a blow of 30 the tier alone holds it, the first hours' bleed
   (abilities.js `base`, the beginner's floor, Tyler 32-8). */
export const STATUSES = Object.freeze({
  bleed: Object.freeze({
    id: 'bleed', name: 'Bleed', key: 'bleed',
    tick: Object.freeze([1, 3]), everyMs: 1000, durationMs: 6000, maxStacks: 5,
    blowPm: 33,
    tierPermille: TIERS,
    damageType: 'physical',
  }),
  /* GREEN SICKNESS's mark (Bible §17 Restoration: "lower-power AoE plus a fixed, non-stacking ~10% damage-taken
     vulnerability for a short duration"; lane b-spell-content, PROVISIONAL): one stack, 6 s, +10% from every blow. */
  sickness: Object.freeze({ id: 'sickness', name: 'Sickness', key: 'monster_takes_more', durationMs: 6000, maxStacks: 1, takenPm: 100 }),
  /* PARRIED (the sword's Parry, docs/design/redesign/23-spell-audit.md section 4: "your target's next blow within 2 s lands 0"): the
     monster's next blow, a swing or a wind-up's landing, lands nothing, and the stack is spent on it. Its 2 s is Parry's window. */
  parried: Object.freeze({ id: 'parried', name: 'Parried', key: 'parried', durationMs: 2000, maxStacks: 1, parry: true }),
  /* CHILL (Tyler 2026-11-08, the area-spells design: Hoarfrost's frost; PROVISIONAL, the designer's numbers): its unit's
     swings and spell windups run 30% longer for 4 s, one stack. BY RUNE TIER (the tank rune spells, board 2026-11-19 piece 3):
     30 / 35 / 40 / 45 / 50% on a Chalked .. Graven Ice Rune's cast, for every Ice spell (Hoarfrost, Frost Slam). */
  chill: Object.freeze({ id: 'chill', name: 'Chill', key: 'chill', durationMs: 4000, maxStacks: 1, slowPm: 300,
    tierPermille: Object.freeze([1000, 1167, 1333, 1500, 1667]) }),
  /* WITHERED (itemization plan Appendix B1 and B3; only while the Necrotic switch is on, src/data/necrotic-storm.js): every heal its
     unit takes lands cut for 6 s, one stack, a new landing restarting the 6 s ("It does not stack. A new hit restarts the 6
     seconds"). A HERO loses 30% (a necrotic hit, elements.js ELEMENT_ON_HERO), its necrotic guard lowering that by the same percent
     (at the 40% cap a hero still loses 18%); a MONSTER loses half ("it heals half as much", the hero's Blight). Fixed: never scaled
     by skill or rune tier. PROPOSED, the designer's numbers. */
  ...(NECROTIC_STORM.live ? { withered: Object.freeze({ id: 'withered', name: 'Withered', key: 'withered', durationMs: 6000, maxStacks: 1,
    healCutPm: Object.freeze({ hero: 300, monster: 500 }), guard: 'necrotic' }) } : {}),

  /* ── HIDDEN: the engine's vocabulary for the Roads, the Wraps, Signatures and Traits (E2). No move lands any yet. ── */
  /* POISON (15 #7 Floodwater Hatchets: "Rend also applies Poison, 20% of Rend's damage over 6 s"): a poison tick beside Bleed, a share of
     the source's blow as Bleed's is. One stack; a new one restarts it. */
  poison: Object.freeze({ id: 'poison', name: 'Poison', key: 'poison', hidden: true,
    tick: Object.freeze([1, 3]), everyMs: 1000, durationMs: 6000, maxStacks: 1, blowPm: 20, tierPermille: TIERS, damageType: 'poison' }),
  /* ARMOR BREAK (22 Coal Hands, Coal Palm: "-25% armor for 6 s"): the monster keeps a quarter less of its defence. One a monster. */
  armor_break: Object.freeze({ id: 'armor_break', name: 'Armor Break', key: 'armor_break', hidden: true, durationMs: 6000, maxStacks: 1, armorPm: -250 }),
  /* WEAKENED (22 Lye: "-8% damage dealt for 8 s"): on the "monster deals less" key with Shaken and Hard Challenge. */
  weakened: Object.freeze({ id: 'weakened', name: 'Weakened', key: 'monster_deals_less', hidden: true, durationMs: 8000, maxStacks: 1, dealtPm: -80 }),
  /* SILENCED (22 Cold Palm: "can't start a spell for 3 s"; 15 #15): one at a time, a new one restarts the time. */
  silenced: Object.freeze({ id: 'silenced', name: 'Silenced', key: 'silenced', hidden: true, durationMs: 3000, maxStacks: 1, silence: true }),
  /* BURNING GROUND (15 #10 Coal Runner's Bow: "Flame Volley leaves the ground burning for 4 s, 10% of its damage a second"): a patch
     round the tile it lands on, each its own; three at most from one hero. */
  burning_ground: Object.freeze({ id: 'burning_ground', name: 'Burning Ground', key: 'burning_ground', hidden: true, refresh: 'keep',
    ground: Object.freeze({ r: 1 }), tick: Object.freeze([1, 1]), everyMs: 1000, durationMs: 4000, maxStacks: 3, blowPm: 100,
    tierPermille: TIERS, damageType: 'ember' }),
  /* E2's three hero statuses (20 band 1): a hero takes less (Guard Strike, #17), deals more (#16, #18, #38), heals over time
     (Lasting Circle, Steady Mend). Each on an `add` key: different sources add, under the key's cap. */
  guarded: Object.freeze({ id: 'guarded', name: 'Guarded', key: 'hero_takes_less', hidden: true, durationMs: 4000, maxStacks: 1, takenPm: -100 }),
  emboldened: Object.freeze({ id: 'emboldened', name: 'Emboldened', key: 'hero_deals_more', hidden: true, durationMs: 6000, maxStacks: 1, dealtPm: 100 }),
  renewing: Object.freeze({ id: 'renewing', name: 'Renewing', key: 'heal_over_time', hidden: true,
    tick: Object.freeze([1, 1]), everyMs: 1000, durationMs: 6000, maxStacks: 1, blowPm: 150, tierPermille: TIERS, heals: true }),

  /* ── THE ENGINE PIECES (lane/talent-effects; the Roads, Signatures and Traits share them). Hidden: no live move lands one. ── */
  /* MENDING (Steady Mend, Lingering Mending, Lasting Circle: "heals over N s"): a heal laid over time. Its stack's tick is the heal's
     share, fixed as it lands (`amt`), and its time the move's (`hotMs`, a whole number of ticks); up to 4 casters' at once, each its own. */
  mending: Object.freeze({ id: 'mending', name: 'Mending', key: 'mending', hidden: true, refresh: 'keep',
    tick: Object.freeze([1, 1]), everyMs: 1000, durationMs: 6000, maxStacks: 4, blowPm: 1, tierPermille: TIERS, heals: true }),
  /* ECHO (15 "a second hit a few seconds later", Slow Burn): one tick of a fixed share of the blow that laid it, at the end of its time */
  echo: Object.freeze({ id: 'echo', name: 'Echo', key: 'echo', hidden: true, refresh: 'keep',
    tick: Object.freeze([1, 1]), everyMs: 2000, durationMs: 2000, maxStacks: 5, blowPm: 1, tierPermille: TIERS, damageType: 'physical' }),
  /* SAPPED (Weakening Sickness: "Sick enemies: -6% damage dealt"): beside Sickness, on the "monster deals less" key */
  sapped: Object.freeze({ id: 'sapped', name: 'Sapped', key: 'monster_deals_less', hidden: true, durationMs: 6000, maxStacks: 1, dealtPm: -60 }),
  /* FROZEN GROUND (Cold Ground: "Frozen ground 4 s, chills enemies on it"): a patch round the tank that lays Chill on every enemy in it
     each second (`lays`), one a hero */
  frozen_ground: Object.freeze({ id: 'frozen_ground', name: 'Frozen Ground', key: 'frozen_ground', hidden: true, refresh: 'keep',
    ground: Object.freeze({ r: 1 }), tick: Object.freeze([1, 1]), everyMs: 1000, durationMs: 4000, maxStacks: 1, blowPm: 1,
    tierPermille: TIERS, lays: 'chill' }),
});

/** True when a row ticks (damage or heal over time; a ground patch ticks too). */
export const ticks = (row) => Array.isArray(row.tick);

/** A HARMFUL row on a hero (a cleanse takes it off, src/core/hunt/heal-rules.js): a damage tick, a heal cut, a slow, a silence, more
    taken, less dealt, less armor. A ground patch is its holder's, never on it. */
export const harmful = (row) => !!row && !row.ground && ((ticks(row) && !row.heals) || !!row.healCutPm || row.slowPm > 0 || row.silence === true
  || row.parry === true || row.takenPm > 0 || row.dealtPm < 0 || row.armorPm < 0);

/** A SLOWING STACK'S SLOW, permille, at its fixed `scale` (status.js stackScale: the landing's tier share, 1000 with none):
    round(slowPm x scale / 1000). One formula for the engine (damage.js slowed) and the bar's words. 0 for a row that slows nothing. */
export function slowAt(row, scale) {
  if (!row || !Number.isInteger(row.slowPm)) return 0;
  const s = Number.isInteger(scale) ? scale : 1000;
  return Math.floor((row.slowPm * s + 500) / 1000);
}

/** The permille a slowing row's stack lands at from a cast of rune tier `tier` (its `tierPermille`, 1000 with none or no tier). */
export function slowScaleAt(row, tier) {
  const list = row && Array.isArray(row.tierPermille) ? row.tierPermille : null;
  return list && Number.isInteger(tier) && tier >= 1 && tier <= list.length ? list[tier - 1] : 1000;
}

const ID = /^[a-z0-9_]{1,32}$/;
/* the effect fields, and the fields a ticking effect owns */
const SIGNED = Object.freeze(['takenPm', 'dealtPm', 'armorPm']);
const TICK_FIELDS = Object.freeze(['tick', 'everyMs', 'blowPm', 'damageType', 'heals', 'lays']);
const KNOWN = new Set(['id', 'name', 'key', 'durationMs', 'maxStacks', 'refresh', 'hidden', ...TICK_FIELDS, 'tierPermille', 'ground',
  ...SIGNED, 'slowPm', 'silence', 'parry', 'healCutPm', 'guard']);
/** The effects a row carries, by name: tick, ground, takenPm, dealtPm, armorPm, slowPm, silence, parry, healCutPm. */
export function effectsOf(row) {
  const out = [];
  if (row.tick !== undefined) out.push('tick');
  if (row.ground !== undefined) out.push('ground');
  for (const k of [...SIGNED, 'slowPm', 'silence', 'parry', 'healCutPm']) if (row[k] !== undefined) out.push(k);
  return out;
}

const tierListProblem = (tp) => (!Array.isArray(tp) || !tp.length || !tp.every((n) => Number.isInteger(n) && n >= 1000) ? 'tierPermille must be a non-empty list of integers >= 1000'
  : tp.some((n, i) => i && n < tp[i - 1]) ? 'tierPermille must not fall with tier' : null);

/** Every problem with one status row, as strings. Empty = valid. */
export function validateStatus(row) {
  if (!row || typeof row !== 'object') return ['status row is not an object'];
  const out = [];
  const at = 'status ' + row.id + ': ';
  const posInt = (k) => { if (!Number.isInteger(row[k]) || row[k] <= 0) out.push(at + k + ' must be a positive integer, got ' + row[k]); };
  const onGrid = (k) => { if (Number.isInteger(row[k]) && row[k] % HUNT_TUNING.stepMs !== 0) out.push(at + k + ' ' + row[k] + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps'); };
  if (typeof row.id !== 'string' || !ID.test(row.id)) out.push('status id ' + row.id + ' is not [a-z0-9_]');
  if (typeof row.name !== 'string' || !row.name) out.push(at + 'needs a name');
  for (const k of Object.keys(row)) if (!KNOWN.has(k)) out.push(at + k + ' is no status field' + (['scalesWith', 'skillPermillePerLevel'].includes(k) ? ' (retired by the spell rule: a tick is a share of its source\'s blow, blowPm)' : ''));
  if (!Object.prototype.hasOwnProperty.call(STATUS_KEYS, row.key)) out.push(at + 'key ' + row.key + ' is no stacking key (STATUS_KEYS)');
  if (row.refresh !== undefined && row.refresh !== 'restart' && row.refresh !== 'keep') out.push(at + 'refresh is restart or keep');
  if (row.hidden !== undefined && row.hidden !== true) out.push(at + 'hidden is true or absent');
  for (const k of ['durationMs', 'maxStacks']) posInt(k);
  onGrid('durationMs');
  const fx = effectsOf(row);
  if (!fx.length) out.push(at + 'does nothing: it needs an effect (tick, ground, takenPm, dealtPm, armorPm, slowPm, silence, parry or healCutPm)');
  /* ONE SCALE A STACK: a tick's (its source's blow), a tiered slow's (its rune tier) or a guarded heal cut's (the hero's guard) */
  const scaled = [row.tick !== undefined, row.slowPm !== undefined && row.tierPermille !== undefined, row.healCutPm !== undefined].filter(Boolean).length;
  if (scaled > 1) out.push(at + 'a tick, a tiered slow and a heal cut each fix a stack\'s scale: one a row');
  if (row.tick !== undefined && row.slowPm !== undefined) out.push(at + 'a ticking status never slows (its scale is its tick\'s)');
  for (const k of SIGNED) {
    if (row[k] !== undefined && (!Number.isInteger(row[k]) || row[k] === 0 || row[k] < -999 || row[k] > 1000)) out.push(at + k + ' must be a non-zero integer -999..1000');
  }
  if (row.slowPm !== undefined && (!Number.isInteger(row.slowPm) || row.slowPm <= 0 || row.slowPm > 1000)) out.push(at + 'slowPm must be an integer 1..1000');
  if (row.silence !== undefined && row.silence !== true) out.push(at + 'silence is true or absent');
  if (row.parry !== undefined && row.parry !== true) out.push(at + 'parry is true or absent');
  if (row.healCutPm !== undefined) {
    const c = row.healCutPm;
    if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'hero,monster' || !['hero', 'monster'].every((k) => Number.isInteger(c[k]) && c[k] > 0 && c[k] < 1000)) {
      out.push(at + 'healCutPm must be { hero, monster }, each an integer 1..999 (a cut never stops a heal whole)');
    }
  }
  if (row.guard !== undefined && (row.healCutPm === undefined || !isElement(row.guard))) out.push(at + 'guard is an element id on a heal-cutting status');
  /* tierPermille: a ticking row's (required) or a slowing row's (optional), never a fixed one's (Bible §17) */
  if (row.tierPermille !== undefined && row.tick === undefined && row.slowPm === undefined) out.push(at + 'only a ticking or a slowing status has a tierPermille');
  if (row.tierPermille !== undefined) {
    const p = tierListProblem(row.tierPermille);
    if (p) out.push(at + p);
    else if (row.slowPm !== undefined && slowAt(row, row.tierPermille[row.tierPermille.length - 1]) > 1000) out.push(at + 'its deepest tier slows more than 1000 permille');
  }
  if (row.tick !== undefined) {
    if (!Array.isArray(row.tick) || row.tick.length !== 2 || !row.tick.every((n) => Number.isInteger(n) && n >= 1) || row.tick[0] > row.tick[1]) {
      out.push(at + 'tick must be [min, max], integers >= 1, min <= max');
    }
    posInt('everyMs');
    onGrid('everyMs');
    /* THE SPELL RULE (lane/c-spell-rule): a tick is a share of its source's own blow, never a number that grows with a skill level. */
    if (!Number.isInteger(row.blowPm) || row.blowPm < 1 || row.blowPm > 1000) out.push(at + 'blowPm must be an integer 1..1000 (permille of the source\'s largest blow a tick)');
    if (row.tierPermille === undefined) out.push(at + 'tierPermille must be a non-empty list of integers >= 1000');
    /* a tick hurts as 'physical' or an element (src/data/elements.js, contract §1.5), or heals: one or the other */
    if (row.heals !== undefined && (row.heals !== true || row.damageType !== undefined)) out.push(at + 'a tick heals (heals: true) or deals a damageType, never both');
    /* LAYS (frozen ground): a ground patch whose tick lays a status on every enemy in it instead of dealing damage */
    if (row.lays !== undefined) {
      if (row.ground === undefined || row.damageType !== undefined || row.heals !== undefined) out.push(at + 'a patch that lays a status is a ground status with no damageType');
      if (typeof row.lays !== 'string' || !ID.test(row.lays) || row.lays === row.id) out.push(at + 'lays names another status id');
    } else if (row.heals === undefined && row.damageType !== PHYSICAL && !isElement(row.damageType)) out.push(at + 'damageType must be physical or an element id, got ' + row.damageType);
  } else {
    for (const k of TICK_FIELDS) if (row[k] !== undefined) out.push(at + 'a status that does not tick has no ' + k);
  }
  if (row.ground !== undefined) {
    const g = row.ground;
    if (!g || typeof g !== 'object' || Object.keys(g).join() !== 'r' || !Number.isInteger(g.r) || g.r < 0 || g.r > 3) out.push(at + 'ground is { r }, a whole radius 0..3 tiles');
    if (row.tick === undefined || row.heals !== undefined) out.push(at + 'a ground status ticks damage (or lays a status)');
    if (fx.some((k) => k !== 'tick' && k !== 'ground')) out.push(at + 'a ground status only ticks (its holder carries nothing else)');
    if (row.refresh !== 'keep') out.push(at + 'a ground status keeps each patch (refresh keep)');
  }
  return out;
}

/** Every problem with the table, as strings. Empty = valid. */
/** @param {Record<string, any>} [rows] */
export function validate(rows = /** @type {Record<string, any>} */ (STATUSES)) {
  const out = [];
  const byKey = new Map();
  for (const [key, row] of Object.entries(rows)) {
    if (!row || row.id !== key) out.push('status key ' + key + ' must equal its row id');
    out.push(...validateStatus(row));
    if (row && row.lays !== undefined && !(Object.prototype.hasOwnProperty.call(rows, row.lays) && !rows[row.lays].ground)) out.push('status ' + key + ': lays ' + row.lays + ', no status row that is not a ground');
    if (row && Object.prototype.hasOwnProperty.call(STATUS_KEYS, row.key)) { if (!byKey.has(row.key)) byKey.set(row.key, []); byKey.get(row.key).push(row); }
  }
  /* ONE KEY, ONE EFFECT: rows sharing a key do the same things (so "the stronger" compares like with like), stack to the same count,
     and either all tick or none do */
  for (const [key, list] of byKey) {
    const shape = (r) => effectsOf(r).join() + '|' + r.maxStacks + '|' + (r.refresh || 'restart');
    if (new Set(list.map(shape)).size > 1) out.push('stacking key ' + key + ': its rows ' + list.map((r) => r.id).join(', ') + ' differ in effect, maxStacks or refresh');
  }
  for (const [key, kRow] of Object.entries(STATUS_KEYS)) {
    /** @type {any} */ const k = kRow;
    if (!ID.test(key)) out.push('stacking key ' + key + ' is not [a-z0-9_]');
    if (!k || (k.combine !== 'strongest' && k.combine !== 'add')) out.push('stacking key ' + key + ': combine is strongest or add');
    if (k && k.capPm !== undefined && !(k.combine === 'add' && Number.isInteger(k.capPm) && k.capPm > 0 && k.capPm <= 1000)) out.push('stacking key ' + key + ': capPm is an add key\'s whole cap 1..1000');
  }
  return out;
}
