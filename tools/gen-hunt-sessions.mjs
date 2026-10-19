#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hunt-sessions.mjs — GENERATE THE SERVER CATALOGUE HUNT SESSIONS
// NEED (ruling HR-2026-10-14, lanes C1 / C2 / S1).
//
// Postgres validates every hunt intent and re-proves every settle against
// these rows and never against a client value. Every row comes from src/data,
// which stays the one source of game content:
//   hr_hunt_supplies       src/data/supplies.js SUPPLIES (kind, essential, heals, buff type)
//   hr_hunt_basic_supplies src/data/supply-basics.js BASIC_SUPPLIES — the store's
//                          supplies paid per use: kind, crafted partner, heals |
//                          mana, gold price, the hunt tiers it serves
//   hr_hunt_travel         src/data/hunts.js HUNTS + trainingHunt() of every
//                          non-boss, non-champion monster (travelS, tier)
//   hr_hunt_target_modes   rule-subjects.js TARGET_MODES
//   hr_hunt_resumable_kinds hunt-sessions.js RESUMABLE_KINDS ('training' reserved)
//   hr_hunt_limits         rule-subjects.js ACTION_SET_LIMITS + HERO_DISTANCE,
//                          hunt-sessions.js SESSION_LIMITS + STAMINA_LOW_MIN +
//                          SESSIONS_KEPT + KNOCKOUT_MS + GOLD_FLOOR + THRESHOLD_PCT +
//                          STAMINA_MAX_MS { free, premium } (as `stamina_free_min` /
//                          `stamina_premium_min`) + DEATH_XP_LOSS (`death_xp_permille`)
//                          + VALUE_HEADROOM, COMBAT_BALANCE.tickMs (`swing_interval_ms`),
//                          party.js PARTY.maxSize (`party_max`), session/config.js
//                          maxConcurrentCharacters (`max_concurrent`), hunt-tuning.js
//                          worldMaxBytes (`world_max_bytes`), abilities.js' largest
//                          per-cast ammo (`ability_ammo_max`)
//   hr_hunt_lanes          the cooldown lanes, ONE source each: consumables.js
//                          CONSUMABLE_RULES.laneMs (food and drink, `consumable`)
//                          and abilities.js ABILITY_LANES (`offense`, `heal`)
//   hr_hunt_abilities      abilities.js ABILITIES (the bar's vocabulary; `ord` = its order there,
//                          the default bar's order)
//   hr_hunt_roles          hunt-roles.js HUNT_ROLES: each role's ability discipline
//   hr_hunt_set_options    hunt-sessions.js ACTION_SET_OPTIONS (target / limit / enum / bool)
//   hr_hunt_grounds        hunt-grounds.js HUNT_GROUNDS: per hunt, its ground, seats,
//   hr_hunt_ground_spawns  pockets, respawn and every spawn (the settle's kill bound)
//   hr_hunt_world_shape    world-state.js WORLD_VERSION + SHAPE (a world encoded under
//                          any other field list is refused by the settle) + FIELDS as
//                          name -> column index, so SQL reads a unit's field by name
//   hr_hunt_cover_items    hunt-sessions.js coverSellable over every common monster drop
//                          (>= 5%) the vendor buys: what sell-to-cover may sell
//   hr_hunt_end_reasons    hunt-sessions.js END_ORDER (reason, position) + RESUME_AFTER_END
//   hr_hunt_kill_bounds    the most ONE kill of each monster can pay (the value bound)
//   hr_hunt_vendor_value   vendorPriceOf (supabase/functions/hr-accrue/catalogue.js)
//   hr_premium_login_reward premium.js PREMIUM_LOGIN_REWARD
//   + CHECKS GENERATED FROM DATA on tables other files own: hunt_sessions
//     end_reason, player_action_sets slots (the bar's length), the timeline's
//     event types, player_state.last_activity_* (RESUMABLE_KINDS, DEFAULT_RESUME)
//
// RETIRED with the C2 action bar (lane S1, 2026-10-17; the bar is configuration,
// hunts are idle): hr_hunt_rule_subjects, hr_hunt_buff_types, hr_hunt_slot_kinds,
// hr_hunt_slot_targets, hr_hunt_default_preset, the pull count and its cap and
// the per-group cooldown limits. This generator no longer writes them;
// 2026-10-23-hunt-settings-options.sql drops them with their last readers.
//
// ── WHICH FILE (the forward-file rule) ───────────────────────────────────────
// The catalogue is a FORWARD file: an applied generated file is history and is
// never regenerated in place. 2026-10-21 (C1), 2026-10-22 (C2) and
// 2026-10-23-demolition-hunt-catalogue.generated.sql (P0, applied 2026-10-17)
// are history; lane S1's data moves (the bar retired, abilities and grounds
// catalogued, food and drink on one 1 s lane, the switch default, premium's
// stamina caps, the party size, the world's shape) start
// 2026-10-23-hunt-sessions-catalogue.generated.sql (APPLIED 2026-10-18, history).
// Lane S2's drinks (six packable mana supplies, kind 'mana') and the action
// engine's data moves (END_ORDER's `rule`, the density and gathering options,
// the world's ruleHold + density) share ONE forward file,
// 2026-10-25-hunt-sessions-catalogue.generated.sql (integration v0.2.1), which
// rewrites every table it names wholesale, widens hr_hunt_supplies' kind to
// 'mana' and precedes 2026-10-25-action-conditions.sql.
//
//   Regenerate:  node tools/gen-hunt-sessions.mjs
//   Verify:      node tools/gen-hunt-sessions.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-hunt-sessions.mjs --selftest  (the refusals bite)
//
// REFUSES (throws, nothing written): a bad id shape, a supply whose kind is not
// heal/buff/ammo, a heal that heals nothing, a buff with no combat buff type, a
// travel time that is not a multiple of 10 in 10..300, an ability with an
// unknown lane, a ground naming an unknown hunt or monster, an on-empty default
// that is not `switch`, a stamina cap that is not a whole minute or a premium
// cap below the free one, and a training id that collides with a named hunt.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { HUNTS, trainingHunt } from '../src/data/hunts.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { SUPPLIES, COMBAT_BUFF_TYPES, BAG_GUIDE_BY_HUNT } from '../src/data/supplies.js';
import { BASIC_SUPPLIES } from '../src/data/supply-basics.js';
import { DRINK_ITEMS } from '../src/data/drinks.js';
import { ACTION_SET_LIMITS, TARGET_MODES, DEFAULT_TARGET_MODE, HERO_DISTANCE } from '../src/data/rule-subjects.js';
import { SESSION_LIMITS, END_ORDER, STAMINA_LOW_MIN, SESSIONS_KEPT, DEATH_XP_LOSS, DEATH_XP_BASE, STAMINA_MAX_MS,
  RESUMABLE_KINDS, RESUME_AFTER_END, GOLD_FLOOR, SUPPLY_SOURCE, ON_EMPTY, ACTION_SET_OPTIONS, VALUE_HEADROOM,
  DEFAULT_RESUME, EVENT_COPY, THRESHOLD_PCT, GATHER_SHARE, coverSellable } from '../src/data/hunt-sessions.js';
import { CONSUMABLE_RULES } from '../src/data/consumables.js';
import { ABILITIES, ABILITY_LANES, ABILITY_RULES } from '../src/data/abilities.js';
import { HUNT_ROLES, WEAPON_ROLES } from '../src/data/hunt-roles.js';
import { HUNT_XP } from '../src/data/hunt-xp.js';
import { HUNT_GROUNDS, DENSITY_PICK } from '../src/data/hunt-grounds.js';
import { HUNT_TUNING } from '../src/data/hunt-tuning.js';
import { PARTY } from '../src/data/party.js';
import { SESSION_CONFIG } from '../src/session/config.js';
import { PREMIUM_LOGIN_REWARD } from '../src/data/premium.js';
import { WORLD_VERSION, SHAPE, FIELDS as WORLD_FIELDS } from '../src/core/hunt/world-state.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { COMBAT_BALANCE } from '../src/core/combat.js';
import { LEVEL_CURVE, SKILL_CURVE, VITALS, ARMOUR_SLOTS, COMBAT_XP, PRAYER_REGEN } from '../src/data/core-model.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The world fields SQL reads by name (hr_hunt_section_view / hr_hunt_settings_view, 2026-10-23-hunt-world-state.sql;
    hr_hunt_party_view, 2026-10-23-hunt-party.sql). */
export const WORLD_FIELDS_READ = Object.freeze({
  unit: Object.freeze(['id', 'side', 'kind', 'alive', 'x', 'y', 'hp', 'maxHp', 'target', 'mana', 'maxMana', 'shield', 'otHp', 'otMana',
    'role', 'dist', 'chase', 'tmode', 'stance']),
  world: Object.freeze(['leader']),
});
export const OUT_NAME = '2026-10-27-hunt-sessions-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const whole = (v) => Number.isInteger(v);

/** The hr_hunt_grounds / hr_hunt_ground_spawns rows of a ground table (also what
    a test fixture ground is inserted as, so a fixture and a shipped ground are
    the same rows). Throws on a defect. */
export function groundRows(grounds, refs = {}) {
  const hunts = refs.hunts || HUNTS.reduce((a, h) => { a[h.id] = h; return a; }, {});
  const monsters = refs.monsters || MONSTERS;
  const rows = []; const spawns = [];
  const seenHunt = new Set();
  for (const id of Object.keys(grounds).sort()) {
    const g = grounds[id];
    if (!ID.test(id) || g.id !== id) throw new Error(`ground ${id} is not a [a-z0-9_] id matching its key`);
    if (!own(hunts, g.hunt)) throw new Error(`ground ${id} names hunt ${g.hunt}, which is no named hunt`);
    if (seenHunt.has(g.hunt)) throw new Error(`hunt ${g.hunt} has two grounds`);
    seenHunt.add(g.hunt);
    if (!whole(g.respawnMs) || g.respawnMs < 1000 || g.respawnMs > 600000) throw new Error(`ground ${id} respawnMs ${g.respawnMs} is not 1 s .. 10 min`);
    const counts = {};
    let n = 0;
    for (const p of g.pockets || []) for (const s of p.spawns || []) {
      if (!own(monsters, s.monster)) throw new Error(`ground ${id} spawns unknown monster ${s.monster}`);
      counts[s.monster] = (counts[s.monster] || 0) + 1; n++;
    }
    if (!n) throw new Error(`ground ${id} spawns nothing`);
    rows.push({ hunt: g.hunt, ground: id, pockets: g.pockets.length, spawns: n, respawn: g.respawnMs, seats: g.start.length });
    for (const m of Object.keys(counts).sort()) spawns.push({ hunt: g.hunt, monster: m, n: counts[m] });
  }
  return { rows, spawns };
}

/** Every input, validated and normalised into sorted rows. Throws on any defect. */
export function catalogueRows(src = {}) {
  const S = {
    hunts: HUNTS, monsters: MONSTERS, items: ITEMS, supplies: SUPPLIES, buffTypes: COMBAT_BUFF_TYPES,
    setLimits: ACTION_SET_LIMITS, distance: HERO_DISTANCE, thresholds: THRESHOLD_PCT,
    sessionLimits: SESSION_LIMITS, endOrder: END_ORDER,
    staminaLow: STAMINA_LOW_MIN, kept: SESSIONS_KEPT, deathXpLoss: DEATH_XP_LOSS, stamina: STAMINA_MAX_MS,
    floor: GOLD_FLOOR, supplySource: SUPPLY_SOURCE, onEmpty: ON_EMPTY, setOptions: ACTION_SET_OPTIONS,
    swingIntervalMs: COMBAT_BALANCE.tickMs, valueHeadroom: VALUE_HEADROOM, defaultResume: DEFAULT_RESUME, events: EVENT_COPY,
    basics: BASIC_SUPPLIES, huntTiers: BAG_GUIDE_BY_HUNT, drinks: DRINK_ITEMS,
    targetModes: TARGET_MODES, defaultTarget: DEFAULT_TARGET_MODE,
    resumable: RESUMABLE_KINDS, resumeAfter: RESUME_AFTER_END,
    consumableLaneMs: CONSUMABLE_RULES.laneMs, foodBelowPct: CONSUMABLE_RULES.foodBelowPct, drinkBelowPct: CONSUMABLE_RULES.drinkBelowPct, abilityLanes: ABILITY_LANES, abilities: ABILITIES,
    grounds: HUNT_GROUNDS, worldMaxBytes: HUNT_TUNING.worldMaxBytes, partyMax: PARTY.maxSize,
    maxConcurrent: SESSION_CONFIG.maxConcurrentCharacters, maxSlot: SESSION_CONFIG.maxSlot,
    loginReward: PREMIUM_LOGIN_REWARD, worldVersion: WORLD_VERSION, worldShape: SHAPE, worldFields: WORLD_FIELDS,
    roles: HUNT_ROLES, weaponRoles: WEAPON_ROLES, manaRegenPct: ABILITY_RULES.manaRegenPctPerMin, magicXpPermille: HUNT_XP.magicXpPermillePerMana, ...src,
  };
  /* THE STORE (Tyler 2026-10-14): each row is gold per use, never an item. */
  const basicSeen = new Set();
  const basics = [...S.basics].map((b) => {
    if (!ID.test(b.id) || own(S.items, b.id) || basicSeen.has(b.id)) {
      throw new Error(`store supply ${b.id} is not a fresh [a-z0-9_]{1,64} id (an item or a repeat)`);
    }
    basicSeen.add(b.id);
    if (!['heal', 'mana', 'ammo'].includes(b.kind)) throw new Error(`store supply ${b.id} has kind ${b.kind}`);
    /* A store drink's partner is a STAGED drink (drinks.js) until the drinks join
       ITEMS; every other partner is a catalogued item. */
    if (!own(S.items, b.partner) && !(b.kind === 'mana' && own(S.drinks, b.partner))) {
      throw new Error(`store supply ${b.id} names partner ${b.partner}, which is no item (or staged drink)`);
    }
    if (!(whole(b.price) && b.price >= 1 && b.price <= 1e9)) throw new Error(`store supply ${b.id} price ${b.price} is not whole gold in 1..1e9`);
    const heals = b.kind === 'heal' ? b.heals : 0;
    const mana = b.kind === 'mana' ? b.mana : 0;
    if (b.kind === 'heal' && !(whole(heals) && heals > 0)) throw new Error(`store heal ${b.id} heals ${heals}`);
    if (b.kind === 'mana' && !(whole(mana) && mana > 0)) throw new Error(`store drink ${b.id} restores ${mana}`);
    if (b.kind === 'ammo' && !(own(S.supplies, b.partner) && S.supplies[b.partner].kind === 'ammo')) {
      throw new Error(`store shot ${b.id} names partner ${b.partner}, which is no packed ammo`);
    }
    const tiers = [...(b.tiers || [])];
    for (const t of tiers) if (!(whole(t) && t >= 1 && t <= 99)) throw new Error(`store supply ${b.id} tier ${t}`);
    return { id: b.id, kind: b.kind, partner: b.partner, heals, mana, price: b.price, tiers };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const kind of ['heal', 'mana']) {
    const owner = new Map();
    for (const b of basics.filter((x) => x.kind === kind)) {
      for (const t of b.tiers) {
        if (owner.has(t)) throw new Error(`store ${kind} tier ${t} resolves to both ${owner.get(t)} and ${b.id}`);
        owner.set(t, b.id);
      }
    }
  }
  const partners = new Map();
  for (const b of basics.filter((x) => x.kind === 'ammo')) {
    if (partners.has(b.partner)) throw new Error(`two store shots share the partner ${b.partner}`);
    partners.set(b.partner, b.id);
  }
  const supplies = Object.keys(S.supplies).sort().map((id) => {
    const s = S.supplies[id];
    if (!ID.test(id) || !own(S.items, id)) throw new Error(`supply ${id} is not a catalogued item id`);
    if (!['heal', 'mana', 'buff', 'ammo'].includes(s.kind)) throw new Error(`supply ${id} has kind ${s.kind}`);
    if (s.kind === 'heal' && !(whole(s.heals) && s.heals > 0)) throw new Error(`heal ${id} heals ${s.heals}`);
    const bt = s.kind === 'buff' ? (s.buff && s.buff.type) : null;
    if (s.kind === 'buff' && !S.buffTypes.includes(bt)) throw new Error(`buff ${id} has no combat buff type (${bt})`);
    return { id, kind: s.kind, essential: !!s.essential, heals: s.kind === 'heal' ? s.heals : 0, bt };
  });
  const travel = [];
  const seen = new Set();
  const addTravel = (h, training) => {
    if (!ID.test(h.id)) throw new Error(`hunt id ${h.id} is not [a-z0-9_]{1,64}`);
    if (seen.has(h.id)) throw new Error(`hunt id ${h.id} appears twice (a training id collides with a named hunt)`);
    seen.add(h.id);
    if (!(whole(h.travelS) && h.travelS >= 10 && h.travelS <= 300 && h.travelS % 10 === 0)) {
      throw new Error(`hunt ${h.id} travelS ${h.travelS} is not a multiple of 10 in 10..300`);
    }
    if (!(whole(h.tier) && h.tier >= 1 && h.tier <= 99)) throw new Error(`hunt ${h.id} has no tier (${h.tier})`);
    travel.push({ id: h.id, s: h.travelS, training, tier: h.tier });
  };
  /* The TIER a store row resolves by: a named hunt's own (its bag guide), a
     training fight's monster's. */
  for (const h of S.hunts) addTravel({ ...h, tier: (S.huntTiers[h.id] || {}).tier }, false);
  for (const id of Object.keys(S.monsters).sort()) {
    const m = S.monsters[id];
    if (m.boss || m.champion) continue;
    addTravel({ ...trainingHunt(id, m), tier: m.tier }, true);
  }
  travel.sort((a, b) => (a.id < b.id ? -1 : 1));
  /* THE STAMINA CAPS, in whole minutes; premium may never be below free. */
  const st = S.stamina || {};
  const staminaFree = Number(st.free) / 60000;
  const staminaPremium = Number(st.premium) / 60000;
  /* THE ABILITIES (the bar's vocabulary) and the largest per-cast shot count. */
  const lanesIn = { consumable: S.consumableLaneMs, ...S.abilityLanes };
  const abilityOrder = Object.keys(S.abilities);
  const abilities = Object.keys(S.abilities).sort().map((id) => {
    const a = S.abilities[id];
    if (!ID.test(id) || a.id !== id) throw new Error(`ability ${id} is not a [a-z0-9_] id matching its key`);
    if (!own(S.abilityLanes, a.lane)) throw new Error(`ability ${id} names lane ${a.lane}, which is no ability lane`);
    if (!(whole(a.cdMs) && a.cdMs > 0)) throw new Error(`ability ${id} cooldown ${a.cdMs}`);
    if (!(whole(a.mana) && a.mana >= 0) || !(whole(a.ammo) && a.ammo >= 0)) throw new Error(`ability ${id} mana / ammo`);
    /* An INACTIVE row may wait on a rune that is not a supply yet (abilities.js header). */
    if (a.active && a.rune !== null && !(own(S.supplies, a.rune))) throw new Error(`ability ${id} names rune ${a.rune}, which is no supply`);
    return { id, ord: abilityOrder.indexOf(id), disciplines: [...a.disciplines].sort(), lane: a.lane, cd: a.cdMs, mana: a.mana, rune: a.rune, ammo: a.ammo, active: a.active === true };
  });
  const lim = {
    presets: S.setLimits.presets, slots: S.setLimits.slots,
    bag_lines: S.sessionLimits.bagLines,
    hours_min: S.sessionLimits.hours.min, hours_max: S.sessionLimits.hours.max,
    /* THE ONE BASIC-ATTACK INTERVAL (architecture contracts S3/X1): the engine's own
       constant, so the settle holds hunting time to the exact swing count. */
    swing_interval_ms: S.swingIntervalMs,
    value_headroom: S.valueHeadroom,
    stamina_low_min: S.staminaLow, sessions_kept: S.kept,
    gold_floor_min: S.floor.min, gold_floor_max: S.floor.max, gold_floor_default: S.floor.default,
    death_xp_permille: Math.round(Number(S.deathXpLoss) * 1000),
    /* What the Level's death loss is a share of: 0 total Level XP, 1 the current Level's span. */
    death_xp_base: { total: 0, level: 1 }[DEATH_XP_BASE],
    stamina_free_min: staminaFree, stamina_premium_min: staminaPremium,
    distance_min: S.distance.min, distance_max: S.distance.max,
    threshold_pct_min: S.thresholds.min, threshold_pct_max: S.thresholds.max,
    density_min: DENSITY_PICK.min, density_max: DENSITY_PICK.max,
    gather_share_min: GATHER_SHARE.min, gather_share_max: GATHER_SHARE.max,
    party_max: S.partyMax,
    /* The level floor is a warning: refused only this many levels under band[0] (Tyler 10-18). */
    below_range_refuse: S.sessionLimits.belowRangeRefuse,
    max_concurrent: S.maxConcurrent,
    /* The hero's regen rates the hunt section shows (abilities.js / hunt-tuning.js, one source). */
    mana_regen_pct_min: S.manaRegenPct,
    ooc_regen_permille_s: HUNT_TUNING.oocRegenPermillePerS,
    world_max_bytes: S.worldMaxBytes,
    ability_ammo_max: Math.max(0, ...abilities.map((a) => a.ammo)),
    /* THE MAGIC-XP BLAST RADIUS (the value bound): Magic XP is paid per mana
       spent, not per kill, so a window's is bounded by the mana the hero can
       have: its own max mana (hr_vitals_of) at once, then its regen, plus the
       most a drink every lane a minute restores. Derived, never typed. */
    drink_mana_per_min_max: Math.floor(60000 / S.consumableLaneMs) * Math.max(0, ...Object.values(S.drinks).map((d) => d.mana),
      ...[...S.basics].filter((b) => b.kind === 'mana').map((b) => b.mana)),
    magic_xp_permille: S.magicXpPermille,
    /* The largest ability Magic-XP multiplier (permille; abilities.js magicXpMult): the magic bound's top. */
    magic_xp_mult_max: Math.max(1000, ...Object.values(S.abilities).map((a) => a.magicXpMult || 0)),
    /* THE CORE MODEL (src/data/core-model.js; CORE_MODEL.md): the curves and the
       vitals the server derives Level, skill levels, max HP / mana and the regen
       rate from (hr_char_level, hr_skill_level, hr_vitals_of), and the combat XP
       rates the value bound prices. One source; tests/core-curves.mjs pins the
       SQL twins to src/core/xp.js and src/core/vitals.js. */
    level_quartic: LEVEL_CURVE.quartic, level_cubic: LEVEL_CURVE.cubic, level_linear: LEVEL_CURVE.linear,
    skill_base: SKILL_CURVE.base, skill_growth_permille: SKILL_CURVE.growthPermille,
    hp_base: VITALS.hpBase, hp_per_level: VITALS.hpPerLevel, mana_base: VITALS.manaBase, mana_per_level: VITALS.manaPerLevel,
    heavy_hp_permille: VITALS.heavyHpPermille, light_mana_permille: VITALS.lightManaPermille, armour_slots: ARMOUR_SLOTS.length,
    in_fight_regen_permille_s: VITALS.inFightRegenPermillePerS,
    prayer_regen_max_permille: PRAYER_REGEN.maxPermille, prayer_regen_k: PRAYER_REGEN.k,
    hit_xp_permille: Math.round(COMBAT_XP.hitXpPerDamage * 1000),
    defense_xp_level_permille: COMBAT_XP.defenseXpPerLevelPermille, block_mult: COMBAT_XP.blockMult,
  };
  if (!(lim.gold_floor_min <= lim.gold_floor_default && lim.gold_floor_default <= lim.gold_floor_max)) {
    throw new Error(`GOLD_FLOOR ${JSON.stringify(S.floor)} is not min <= default <= max`);
  }
  if (lim.death_xp_base === undefined) throw new Error(`DEATH_XP_BASE ${DEATH_XP_BASE} is not 'total' or 'level'`);
  if (lim.hit_xp_permille / 1000 !== COMBAT_XP.hitXpPerDamage) throw new Error(`COMBAT_XP.hitXpPerDamage ${COMBAT_XP.hitXpPerDamage} is not a whole permille`);
  if (!(whole(lim.stamina_free_min) && lim.stamina_free_min > 0 && whole(lim.stamina_premium_min) && lim.stamina_premium_min >= lim.stamina_free_min)) {
    throw new Error(`STAMINA_MAX_MS ${JSON.stringify(st)} is not whole minutes with premium >= free > 0`);
  }
  if (!(lim.distance_min >= 1 && lim.distance_min <= lim.distance_max)) throw new Error(`HERO_DISTANCE ${JSON.stringify(S.distance)}`);
  if (!(lim.threshold_pct_min >= 1 && lim.threshold_pct_min <= lim.threshold_pct_max && lim.threshold_pct_max <= 99)) {
    throw new Error(`THRESHOLD_PCT ${JSON.stringify(S.thresholds)}`);
  }
  if (!(whole(lim.below_range_refuse) && lim.below_range_refuse >= 1 && lim.below_range_refuse <= 100)) {
    throw new Error(`SESSION_LIMITS.belowRangeRefuse ${S.sessionLimits.belowRangeRefuse} is not 1..100`);
  }
  if (!(whole(lim.party_max) && lim.party_max >= 1 && lim.party_max <= 5)) throw new Error(`PARTY.maxSize ${S.partyMax} is not 1..5`);
  if (!(whole(lim.max_concurrent) && lim.max_concurrent >= 1 && lim.max_concurrent <= S.maxSlot + 1)) {
    throw new Error(`maxConcurrentCharacters ${S.maxConcurrent} is not 1..${S.maxSlot + 1} (one per slot at most)`);
  }
  /* SELL-TO-COVER: every common (>= 5%) monster drop the rule admits and the vendor buys. */
  const dropIds = new Set();
  for (const m of Object.values(S.monsters)) {
    for (const d of (m.drops || [])) if (d && d.id && Number(d.ch) >= 0.05) dropIds.add(d.id);
  }
  const partnerIds = new Set(basics.map((b) => b.partner));
  const cover = [...dropIds].filter((id) => own(S.items, id)
    && coverSellable(S.items[id], own(S.supplies, id) || partnerIds.has(id)))
    .map((id) => ({ id, unit: vendorPriceOf(S.items, id) })).filter((r) => r.unit >= 1)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const resume = S.defaultResume;
  if (!resume || !S.resumable.includes(resume.kind) || !ID.test(resume.id)) {
    throw new Error(`DEFAULT_RESUME ${JSON.stringify(resume)} is not a resumable kind and id`);
  }
  const eventTypes = Object.keys(S.events);
  for (const t of eventTypes) if (!ID.test(t)) throw new Error(`event type ${t} is not [a-z0-9_]{1,64}`);
  /* THE LANES: food and drink on ONE consumable lane (consumables.js laneMs,
     spec §3.4 #3), the ability lanes (abilities.js). One source each. */
  const lanes = Object.keys(lanesIn).sort().map((l) => {
    if (!ID.test(l)) throw new Error(`lane ${l} is not [a-z0-9_]{1,64}`);
    if (!(whole(lanesIn[l]) && lanesIn[l] > 0 && lanesIn[l] % 100 === 0)) throw new Error(`lane ${l} ms ${lanesIn[l]} is not a whole number of sub-steps`);
    return { l, ms: lanesIn[l] };
  });
  if (!(whole(lim.value_headroom) && lim.value_headroom >= 1 && lim.value_headroom <= 10)) {
    throw new Error(`VALUE_HEADROOM ${S.valueHeadroom} is not a whole multiplier in [1, 10]`);
  }
  /* THE KILL BOUNDS (Security GO item 3): per combat monster, the most one kill
     can pay — gold (the top gp roll), XP (every HP of damage at the Melee / Ranged
     rate, plus the kill's Level XP) and each item (one unit per drop row naming
     it). Derived, never typed. */
  const xpPerHp = COMBAT_XP.hitXpPerDamage;
  const killBounds = Object.keys(S.monsters).sort().map((id) => {
    const m = S.monsters[id];
    if (!ID.test(id)) throw new Error(`monster id ${id} is not [a-z0-9_]{1,64}`);
    const drops = {};
    for (const d of (m.drops || [])) if (d && d.id && ID.test(d.id)) drops[d.id] = (drops[d.id] || 0) + 1;
    const gold = Math.max(0, Math.ceil(Number((m.gp || [0, 0])[1]) || 0));
    const xp = Math.ceil(Math.max(1, Number(m.hp) || 1) * xpPerHp + Math.max(0, Number(m.xp) || 0));
    return { id, gold, xp, drops };
  });
  if (!(whole(lim.swing_interval_ms) && lim.swing_interval_ms >= 600)) {
    throw new Error(`the swing interval ${S.swingIntervalMs} is not a whole number of ms >= 600`);
  }
  /* The default a setting takes when the hero never set it: the data row's own, else the
     engine's (consumables.js thresholds); null = the role's default for its party (roles.js). */
  const THRESHOLD_DEFAULT = { food_below_pct: S.foodBelowPct, drink_below_pct: S.drinkBelowPct };
  const dfltOf = (k, o) => (o.default !== undefined ? o.default : own(THRESHOLD_DEFAULT, k) ? THRESHOLD_DEFAULT[k] : null);
  const setOptions = Object.keys(S.setOptions).sort().map((k) => ({ ...setOption(k, S.setOptions[k]), dflt: dfltOf(k, S.setOptions[k]) }));
  function setOption(k, o) {
    if (!ID.test(k)) throw new Error(`action-set option ${k} is not [a-z0-9_]{1,64}`);
    if (o.kind === 'enum') {
      if (!Array.isArray(o.values) || !o.values.length || !o.values.every((v) => ID.test(v))) throw new Error(`option ${k}: an enum needs [a-z0-9_] values`);
      return { k, kind: 'enum', limit: null, values: [...o.values] };
    }
    if (o.kind === 'limit') {
      if (!own(lim, `${o.limit}_min`) || !own(lim, `${o.limit}_max`)) throw new Error(`option ${k}: no ${o.limit}_min / _max limits row`);
      return { k, kind: 'limit', limit: o.limit, values: null };
    }
    if (o.kind === 'target' || o.kind === 'bool') return { k, kind: o.kind, limit: null, values: null };
    throw new Error(`option ${k}: unknown kind ${o.kind}`);
  }
  const targets = Object.keys(S.targetModes).sort().map((m) => {
    if (!ID.test(m)) throw new Error(`target mode ${m} is not [a-z0-9_]{1,64}`);
    return { m };
  });
  if (!targets.some((x) => x.m === S.defaultTarget)) throw new Error(`DEFAULT_TARGET_MODE ${S.defaultTarget} is not a target mode`);
  const resumable = [...S.resumable];
  for (const k of resumable) {
    if (!ID.test(k) || k === 'combat' || k === 'idle') throw new Error(`resumable kind ${k} is not a non-hunt activity kind`);
  }
  if (!(lim.death_xp_permille > 0 && lim.death_xp_permille <= 1000 && lim.death_xp_permille / 1000 === Number(S.deathXpLoss))) {
    throw new Error(`DEATH_XP_LOSS ${S.deathXpLoss} is not a whole permille in (0, 1]`);
  }
  for (const [k, v] of Object.entries(lim)) {
    if (!(whole(v) && v >= 0 && v <= 100000)) throw new Error(`limit ${k} = ${v} is not a whole number in 0..100000`);
  }
  const ends = S.endOrder.map((r, i) => {
    if (!ID.test(r)) throw new Error(`end reason ${r} is not [a-z0-9_]{1,64}`);
    if (r === 'vigour') throw new Error("END_ORDER names 'vigour': Vigour ends no hunt (designer ruling 2026-10-14)");
    return { r, i: i + 1, resumes: S.resumeAfter.includes(r) };
  });
  for (const r of S.resumeAfter) {
    if (!S.endOrder.includes(r)) throw new Error(`RESUME_AFTER_END names ${r}, which is not an end reason`);
    if (r === 'left' || r === 'changed') throw new Error(`RESUME_AFTER_END names ${r}: a hunt the player left or changed resumes nothing`);
  }
  const vendor = Object.keys(S.items).sort().map((id) => ({ id, unit: vendorPriceOf(S.items, id) }))
    .filter((r) => r.unit > 0);
  for (const r of vendor) {
    if (!ID.test(r.id) || !whole(r.unit)) throw new Error(`vendor value ${r.id} = ${r.unit}`);
  }
  const supplySource = { modes: [...S.supplySource.modes], default: S.supplySource.default };
  if (!supplySource.modes.every((m) => ID.test(m)) || !supplySource.modes.includes('mine') || !supplySource.modes.includes(supplySource.default)) {
    throw new Error(`SUPPLY_SOURCE ${JSON.stringify(S.supplySource)} must offer 'mine' and default to one of its modes`);
  }
  /* A HUNT NEVER STOPS FOR LACK OF STOCK (Tyler 2026-10-16): the default is
     `switch`; `end` stays an explicit opt-in (heals_out / ammo_out stay reachable). */
  const onEmpty = { modes: [...S.onEmpty.modes], default: S.onEmpty.default };
  if (!onEmpty.modes.every((m) => ID.test(m)) || !onEmpty.modes.includes('end') || onEmpty.default !== 'switch') {
    throw new Error(`ON_EMPTY ${JSON.stringify(S.onEmpty)} must default to 'switch' and keep 'end' as an opt-in`);
  }
  const { rows: grounds, spawns: groundSpawns } = groundRows(S.grounds, { hunts: S.hunts.reduce((a, h) => { a[h.id] = h; return a; }, {}), monsters: S.monsters });
  if (!(whole(S.worldVersion) && S.worldVersion >= 1 && whole(S.worldShape) && S.worldShape >= 0 && S.worldShape <= 0xffffffff)) {
    throw new Error(`the world shape ${S.worldVersion}/${S.worldShape} is not a version and a uint32 fingerprint`);
  }
  /* WHAT A WEAPON MAKES A HERO (hunt-roles.js WEAPON_ROLES; spec §3.2 #1): every
     equippable weapon's type, and the roles a type plays (the first the default).
     The party finder filters on the type; the party view shows the role. */
  const weapons = Object.keys(S.items).sort().filter((id) => S.items[id].slot === 'weapon').map((id) => {
    const t = S.items[id].weaponType;
    if (!ID.test(String(t)) || !own(S.weaponRoles, t)) throw new Error(`weapon ${id} has type ${t}, which plays no role (hunt-roles.js WEAPON_ROLES)`);
    return { id, t };
  });
  const weaponRoles = Object.keys(S.weaponRoles).sort().map((t) => {
    const roles = [...S.weaponRoles[t]];
    if (!ID.test(t) || !roles.length || !roles.every((x) => own(S.roles, x))) throw new Error(`weapon type ${t} names an unknown role`);
    return { t, roles };
  });
  if (!own(S.weaponRoles, 'neutral')) throw new Error('WEAPON_ROLES has no neutral row (an unarmed hero)');
  const roleRows = Object.keys(S.roles).sort().map((role) => {
    const d = S.roles[role].discipline;
    if (!ID.test(role) || !ID.test(String(d)) || !abilities.some((a) => a.disciplines.includes(d))) throw new Error(`role ${role} has discipline ${d}, which no ability holds`);
    return { role, d };
  });
  const lr = S.loginReward || {};
  if (lr.item !== null && !(ID.test(String(lr.item)) && own(S.items, lr.item))) throw new Error(`PREMIUM_LOGIN_REWARD.item ${lr.item} is no item`);
  if (!(whole(lr.qty) && lr.qty >= 1 && lr.qty <= 10)) throw new Error(`PREMIUM_LOGIN_REWARD.qty ${lr.qty} is not 1..10`);
  /* The world's field positions by name (the party section reads a unit's vitals off the pose). */
  const fieldIdx = (part) => Object.fromEntries((S.worldFields[part] || []).map(([n], i) => [n, i]));
  const worldFields = { unit: fieldIdx('unit'), world: fieldIdx('world') };
  for (const n of WORLD_FIELDS_READ.unit) if (!own(worldFields.unit, n)) throw new Error(`world unit field ${n} (read by the party section) is not persisted`);
  for (const n of WORLD_FIELDS_READ.world) if (!own(worldFields.world, n)) throw new Error(`world field ${n} (read by the party section) is not persisted`);
  return { supplySource, onEmpty, lanes, setOptions, killBounds, supplies, travel, lim, ends, vendor, targets, resumable, basics,
    cover, resume, eventTypes, abilities, grounds, groundSpawns, world: { v: S.worldVersion, shape: S.worldShape, fields: worldFields },
    login: { item: lr.item ?? null, qty: lr.qty }, weapons, weaponRoles, roleRows,
    defaultTarget: S.defaultTarget, slotsMax: S.setLimits.slots };
}

export function render(src) {
  const r = catalogueRows(src);
  const digest = createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const supplyValues = r.supplies.map((s) => `  (${sq(s.id)}, ${sq(s.kind)}, ${s.essential}, ${s.heals}, ${s.bt ? sq(s.bt) : 'null'})`).join(',\n');
  const basicValues = r.basics.map((b) => `  (${sq(b.id)}, ${sq(b.kind)}, ${sq(b.partner)}, ${b.heals}, ${b.mana}, ${b.price}, '{${b.tiers.join(',')}}'::int[])`).join(',\n');
  const coverValues = r.cover.map((c) => `  (${sq(c.id)}, ${c.unit})`).join(',\n');
  const eventList = r.eventTypes.map(sq).join(', ');
  const boundValues = r.killBounds.map((b) => `  (${sq(b.id)}, ${b.gold}, ${b.xp}, ${sq(JSON.stringify(b.drops))}::jsonb)`).join(',\n');
  const laneValues = r.lanes.map((x) => `  (${sq(x.l)}, ${x.ms}, true)`).join(',\n');
  const optionValues = r.setOptions.map((x) => `  (${sq(x.k)}, ${sq(x.kind)}, ${x.limit ? sq(x.limit) : 'null'}, `
    + `${x.values ? `array[${x.values.map(sq).join(', ')}]::text[]` : 'null'}, ${x.dflt === null ? 'null' : sq(JSON.stringify(x.dflt)) + '::jsonb'})`).join(',\n');
  const roleValues = r.roleRows.map((x) => `  (${sq(x.role)}, ${sq(x.d)})`).join(',\n');
  const targetValues = r.targets.map((x) => `  (${sq(x.m)})`).join(',\n');
  const resumeList = r.resumable.map(sq).join(', ');
  const abilityValues = r.abilities.map((a) => `  (${sq(a.id)}, array[${a.disciplines.map(sq).join(', ')}]::text[], ${sq(a.lane)}, ${a.cd}, `
    + `${a.mana}, ${a.rune ? sq(a.rune) : 'null'}, ${a.ammo}, ${a.active}, ${a.ord})`).join(',\n');
  const groundValues = r.grounds.map((g) => `  (${sq(g.hunt)}, ${sq(g.ground)}, ${g.pockets}, ${g.spawns}, ${g.respawn}, ${g.seats})`).join(',\n');
  const weaponValues = r.weapons.map((w) => `  (${sq(w.id)}, ${sq(w.t)})`).join(',\n');
  const weaponRoleValues = r.weaponRoles.map((w) => `  (${sq(w.t)}, array[${w.roles.map(sq).join(', ')}]::text[])`).join(',\n');
  const groundSpawnValues = r.groundSpawns.map((s) => `  (${sq(s.hunt)}, ${sq(s.monster)}, ${s.n})`).join(',\n');
  const travelValues = r.travel.map((t) => `  (${sq(t.id)}, ${t.s}, ${t.training}, ${t.tier})`).join(',\n');
  const limValues = Object.entries(r.lim).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `  (${sq(k)}, ${v})`).join(',\n');
  const endValues = r.ends.map((e) => `  (${sq(e.r)}, ${e.i}, ${e.resumes})`).join(',\n');
  const resumableValues = r.resumable.map((k) => `  (${sq(k)})`).join(',\n');
  const endList = r.ends.map((e) => sq(e.r)).join(', ');
  const vendorValues = r.vendor.map((v) => `  (${sq(v.id)}, ${v.unit})`).join(',\n');
  const nLim = Object.keys(r.lim).length;
  const CATALOGUE = ['hr_hunt_supplies', 'hr_hunt_travel', 'hr_hunt_limits', 'hr_hunt_end_reasons', 'hr_hunt_vendor_value',
    'hr_hunt_target_modes', 'hr_hunt_resumable_kinds', 'hr_hunt_basic_supplies', 'hr_hunt_cover_items', 'hr_hunt_lanes',
    'hr_hunt_set_options', 'hr_hunt_kill_bounds', 'hr_hunt_abilities', 'hr_hunt_grounds', 'hr_hunt_ground_spawns',
    'hr_hunt_world_shape', 'hr_premium_login_reward', 'hr_hunt_weapons', 'hr_hunt_weapon_roles', 'hr_hunt_roles'];
  const tableList = CATALOGUE.map(sq).join(', ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT SESSION CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-hunt-sessions.mjs from src/data/supplies.js,
--   src/data/rule-subjects.js, src/data/hunt-sessions.js, src/data/hunts.js,
--   src/data/monsters.js, src/data/consumables.js, src/data/abilities.js,
--   src/data/hunt-grounds.js, src/data/hunt-tuning.js, src/data/party.js,
--   src/data/premium.js, src/core/hunt/world-state.js and the vendor price
--   (hr-accrue/catalogue.js). Any hand edit FAILS \`node tools/gen-hunt-sessions.mjs --check\`.
--
--   digest: ${digest}
--   ${r.supplies.length} supplies, ${r.travel.length} hunts (named + training), ${nLim} limits, ${r.ends.length} end reasons,
--   ${r.vendor.length} vendor values, ${r.basics.length} store supplies paid per use, ${r.targets.length} target modes,
--   ${r.lanes.length} lanes, ${r.abilities.length} abilities, ${r.setOptions.length} action-set options, ${r.grounds.length} hunt grounds
--
-- SUPERSEDES 2026-10-25-hunt-sessions-catalogue.generated.sql (applied; history,
-- never regenerated): every table below is rewritten wholesale. THE CORE REBUILD
-- (docs/design/CORE_MODEL.md, 2026-10-19): END_ORDER's 'died' and
-- 'party_member_died' replace 'falls'; the falls and knockout limits go; the core
-- model's curve, vitals and combat-XP rows join hr_hunt_limits; the magic bound
-- reads the hero's own max mana; the kill bound prices Melee / Ranged XP per HP
-- and the kill's Level XP; the world loses 'downMs' / 'ward' and gains 'regenPm'.
-- Apply after 2026-10-27-core-schema.sql, before 2026-10-27-core-bodies.sql.
--
-- Server-only: RLS on, NO policy, no client grant (the client reads src/data).
-- Idempotent: delete + insert; nothing references these rows by foreign key.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_hunt_supplies (
  item_id   text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  kind      text not null check (kind in ('heal', 'mana', 'buff', 'ammo')),
  essential boolean not null,
  heals     int  not null check (heals >= 0),
  buff_type text,
  constraint hr_hunt_supplies_shape_ck check (
    (kind = 'heal' and heals > 0 and buff_type is null)
    or (kind = 'mana' and heals = 0 and buff_type is null)
    or (kind = 'buff' and heals = 0 and buff_type is not null)
    or (kind = 'ammo' and heals = 0 and buff_type is null))
);
-- An existing table (created by an applied catalogue) learns kind 'mana'.
alter table public.hr_hunt_supplies drop constraint if exists hr_hunt_supplies_kind_check;
alter table public.hr_hunt_supplies add constraint hr_hunt_supplies_kind_check check (kind in ('heal', 'mana', 'buff', 'ammo'));
alter table public.hr_hunt_supplies drop constraint if exists hr_hunt_supplies_shape_ck;
alter table public.hr_hunt_supplies add constraint hr_hunt_supplies_shape_ck check (
    (kind = 'heal' and heals > 0 and buff_type is null)
    or (kind = 'mana' and heals = 0 and buff_type is null)
    or (kind = 'buff' and heals = 0 and buff_type is not null)
    or (kind = 'ammo' and heals = 0 and buff_type is null));
create table if not exists public.hr_hunt_travel (
  hunt_id  text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  travel_s int  not null check (travel_s between 10 and 300 and travel_s % 10 = 0),
  training boolean not null
);
alter table public.hr_hunt_travel add column if not exists tier int;
-- THE SPAWN CYCLE of the single-foe engine lived here (pull_size, respawn_ms);
-- a hunt's cycle is its GROUND now (hr_hunt_grounds, the world's packs).
alter table public.hr_hunt_travel drop column if exists pull_size;
alter table public.hr_hunt_travel drop column if exists respawn_ms;
create table if not exists public.hr_hunt_limits (
  key   text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value int  not null check (value between 0 and 100000)
);
create table if not exists public.hr_hunt_end_reasons (
  reason text primary key check (reason ~ '^[a-z0-9_]{1,64}$'),
  ord    int  not null unique check (ord >= 1)
);
alter table public.hr_hunt_end_reasons add column if not exists resumes boolean not null default false;
create table if not exists public.hr_hunt_vendor_value (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  unit    bigint not null check (unit >= 1)
);
create table if not exists public.hr_hunt_basic_supplies (
  basic_id text primary key check (basic_id ~ '^[a-z0-9_]{1,64}$'),
  kind     text not null check (kind in ('heal', 'mana', 'ammo')),
  partner  text not null check (partner ~ '^[a-z0-9_]{1,64}$'),
  heals    int  not null check (heals >= 0),
  mana     int  not null check (mana >= 0),
  price    bigint not null check (price between 1 and 1000000000),
  tiers    int[] not null
);
create table if not exists public.hr_hunt_cover_items (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  unit    bigint not null check (unit >= 1)
);
create table if not exists public.hr_hunt_target_modes (
  mode text primary key check (mode ~ '^[a-z0-9_]{1,64}$')
);
-- A solo hunt is a party of one: no mode is party-only any more.
alter table public.hr_hunt_target_modes drop column if exists solo;
create table if not exists public.hr_hunt_resumable_kinds (
  kind text primary key check (kind ~ '^[a-z0-9_]{1,64}$')
);
-- THE LANES: food and drink share ONE (consumables.js laneMs); the ability lanes
-- are abilities.js'. The settle's use caps read their ms from HERE.
create table if not exists public.hr_hunt_lanes (
  lane   text primary key check (lane ~ '^[a-z0-9_]{1,64}$'),
  ms     int check (ms is null or ms > 0),
  active boolean not null,
  check (active = (ms is not null))
);
create table if not exists public.hr_hunt_kill_bounds (
  monster_id text primary key check (monster_id ~ '^[a-z0-9_]{1,64}$'),
  gold_max   bigint not null check (gold_max >= 0),
  xp_max     bigint not null check (xp_max >= 1),
  drops      jsonb  not null check (jsonb_typeof(drops) = 'object')
);
create table if not exists public.hr_hunt_set_options (
  opt       text primary key check (opt ~ '^[a-z0-9_]{1,64}$'),
  kind      text not null,
  limit_key text check (limit_key is null or limit_key ~ '^[a-z0-9_]{1,64}$'),
  vals      text[],
  check ((kind = 'limit') = (limit_key is not null)),
  check ((kind = 'enum') = (vals is not null)),
  dflt      jsonb
);
-- The value an unset option takes (null = the role's default for its party).
alter table public.hr_hunt_set_options add column if not exists dflt jsonb;
-- A per-hero switch is an option too (chase on / off): kind 'bool'.
alter table public.hr_hunt_set_options drop constraint if exists hr_hunt_set_options_kind_check;
alter table public.hr_hunt_set_options add constraint hr_hunt_set_options_kind_check
  check (kind in ('target', 'limit', 'enum', 'bool'));
-- THE BAR'S VOCABULARY (abilities.js): what an action set's bar may hold.
create table if not exists public.hr_hunt_abilities (
  ability_id  text primary key check (ability_id ~ '^[a-z0-9_]{1,64}$'),
  disciplines text[] not null check (cardinality(disciplines) between 1 and 5),
  lane        text not null check (lane ~ '^[a-z0-9_]{1,64}$'),
  cd_ms       int  not null check (cd_ms > 0),
  mana        int  not null check (mana >= 0),
  rune        text check (rune is null or rune ~ '^[a-z0-9_]{1,64}$'),
  ammo        int  not null check (ammo >= 0),
  active      boolean not null,
  ord         int  not null default 0 check (ord >= 0)
);
alter table public.hr_hunt_abilities add column if not exists ord int not null default 0;
-- EACH ROLE'S ABILITY DISCIPLINE (hunt-roles.js HUNT_ROLES): the default bar.
create table if not exists public.hr_hunt_roles (
  role       text primary key check (role ~ '^[a-z0-9_]{1,64}$'),
  discipline text not null check (discipline ~ '^[a-z0-9_]{1,64}$')
);
-- WHERE A HUNT IS FOUGHT (hunt-grounds.js): a hunt with no row here cannot be
-- entered (no_ground) and its settle has nothing to step. The spawns bound the
-- kills a window can carry (hr_hunt_apply_member).
create table if not exists public.hr_hunt_grounds (
  hunt_id    text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  ground_id  text not null unique check (ground_id ~ '^[a-z0-9_]{1,40}$'),
  pockets    int  not null check (pockets between 1 and 64),
  spawns     int  not null check (spawns between 1 and 256),
  respawn_ms int  not null check (respawn_ms between 1000 and 600000),
  seats      int  not null check (seats between 1 and 5)
);
create table if not exists public.hr_hunt_ground_spawns (
  hunt_id    text not null references public.hr_hunt_grounds (hunt_id) on delete cascade,
  monster_id text not null check (monster_id ~ '^[a-z0-9_]{1,64}$'),
  n          int  not null check (n between 1 and 256),
  primary key (hunt_id, monster_id)
);
-- THE WORLD'S SHAPE (world-state.js): the version and field-list fingerprint
-- every encoded hunt_instances.world must carry.
create table if not exists public.hr_hunt_world_shape (
  id      boolean primary key default true check (id),
  version int    not null check (version >= 1),
  shape   bigint not null check (shape between 0 and 4294967295),
  fields  jsonb  not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object')
);
alter table public.hr_hunt_world_shape add column if not exists fields jsonb not null default '{}'::jsonb;
-- THE PREMIUM DAILY LOGIN REWARD (premium.js): the item a claim pays (null =
-- nothing yet) and how many.
create table if not exists public.hr_premium_login_reward (
  id      boolean primary key default true check (id),
  item_id text check (item_id is null or item_id ~ '^[a-z0-9_]{1,64}$'),
  qty     int  not null check (qty between 1 and 10)
);
-- WHAT A WEAPON MAKES A HERO (hunt-roles.js WEAPON_ROLES): each weapon's type,
-- and the roles a type plays, the first the default.
create table if not exists public.hr_hunt_weapons (
  item_id     text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  weapon_type text not null check (weapon_type ~ '^[a-z0-9_]{1,32}$')
);
create table if not exists public.hr_hunt_weapon_roles (
  weapon_type text primary key check (weapon_type ~ '^[a-z0-9_]{1,32}$'),
  roles       text[] not null check (cardinality(roles) between 1 and 5)
);
do $$
declare v_t text;
begin
  foreach v_t in array array[${tableList}] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $$;

delete from public.hr_hunt_supplies;
insert into public.hr_hunt_supplies (item_id, kind, essential, heals, buff_type) values
${supplyValues};
delete from public.hr_hunt_basic_supplies;
insert into public.hr_hunt_basic_supplies (basic_id, kind, partner, heals, mana, price, tiers) values
${basicValues};
delete from public.hr_hunt_cover_items;
${r.cover.length ? `insert into public.hr_hunt_cover_items (item_id, unit) values
${coverValues};` : '-- (no item is flagged junk: sell-to-cover is inert until one is)'}
delete from public.hr_hunt_lanes;
insert into public.hr_hunt_lanes (lane, ms, active) values
${laneValues};
delete from public.hr_hunt_set_options;
insert into public.hr_hunt_set_options (opt, kind, limit_key, vals, dflt) values
${optionValues};
delete from public.hr_hunt_kill_bounds;
insert into public.hr_hunt_kill_bounds (monster_id, gold_max, xp_max, drops) values
${boundValues};
delete from public.hr_hunt_target_modes;
insert into public.hr_hunt_target_modes (mode) values
${targetValues};
delete from public.hr_hunt_abilities;
insert into public.hr_hunt_abilities (ability_id, disciplines, lane, cd_ms, mana, rune, ammo, active, ord) values
${abilityValues};
delete from public.hr_hunt_ground_spawns;
delete from public.hr_hunt_grounds;
${r.grounds.length ? `insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats) values
${groundValues};
insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values
${groundSpawnValues};` : '-- (no hunt ground ships yet: every hunt answers no_ground until the content lane adds one)'}
delete from public.hr_hunt_weapons;
insert into public.hr_hunt_weapons (item_id, weapon_type) values
${weaponValues};
delete from public.hr_hunt_weapon_roles;
insert into public.hr_hunt_weapon_roles (weapon_type, roles) values
${weaponRoleValues};
delete from public.hr_hunt_roles;
insert into public.hr_hunt_roles (role, discipline) values
${roleValues};
delete from public.hr_hunt_world_shape;
insert into public.hr_hunt_world_shape (id, version, shape, fields) values (true, ${r.world.v}, ${r.world.shape}, ${sq(JSON.stringify(r.world.fields))}::jsonb);
delete from public.hr_premium_login_reward;
insert into public.hr_premium_login_reward (id, item_id, qty) values (true, ${r.login.item ? sq(r.login.item) : 'null'}, ${r.login.qty});
delete from public.hr_hunt_travel;
insert into public.hr_hunt_travel (hunt_id, travel_s, training, tier) values
${travelValues};
delete from public.hr_hunt_limits;
insert into public.hr_hunt_limits (key, value) values
${limValues};
delete from public.hr_hunt_end_reasons;
insert into public.hr_hunt_end_reasons (reason, ord, resumes) values
${endValues};
delete from public.hr_hunt_resumable_kinds;
insert into public.hr_hunt_resumable_kinds (kind) values
${resumableValues};
-- hunt_sessions.end_reason's CHECK is END_ORDER (the generator owns it).
alter table public.hunt_sessions drop constraint if exists hunt_sessions_end_reason_check;
alter table public.hunt_sessions add constraint hunt_sessions_end_reason_check
  check (end_reason in (${endList}));
-- The bar's size is ACTION_SET_LIMITS.slots (Huntera's two rows of ten).
alter table public.player_action_sets drop constraint if exists player_action_sets_slots_check;
alter table public.player_action_sets add constraint player_action_sets_slots_check
  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= ${r.slotsMax});
-- The timeline's event types are EVENT_COPY's keys.
alter table public.hunt_session_events drop constraint if exists hunt_session_events_type_check;
alter table public.hunt_session_events add constraint hunt_session_events_type_check
  check (type in (${eventList}));
-- THE LAST NON-HUNT ACTIVITY an automatic hunt end resumes (Tyler 2026-10-14).
alter table public.player_state add column if not exists last_activity_kind text;
alter table public.player_state add column if not exists last_activity_id text;
alter table public.player_state alter column last_activity_kind set default ${sq(r.resume.kind)};
alter table public.player_state alter column last_activity_id set default ${sq(r.resume.id)};
alter table public.player_state drop constraint if exists player_state_last_activity_ck;
alter table public.player_state add constraint player_state_last_activity_ck
  check ((last_activity_kind is null) = (last_activity_id is null)
         and (last_activity_kind is null or last_activity_kind in (${resumeList}))
         and (last_activity_id is null or last_activity_id ~ '^[a-z0-9_]{1,64}$'));
delete from public.hr_hunt_vendor_value;
insert into public.hr_hunt_vendor_value (item_id, unit) values
${vendorValues};

-- ── SELF-CHECK (CLAUDE.md §4): the rows the generator wrote, and nothing more ──
do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_hunt_supplies) <> ${r.supplies.length}
     or (select count(*) from public.hr_hunt_travel) <> ${r.travel.length}
     or (select count(*) from public.hr_hunt_limits) <> ${nLim}
     or (select count(*) from public.hr_hunt_end_reasons) <> ${r.ends.length}
     or (select count(*) from public.hr_hunt_vendor_value) <> ${r.vendor.length}
     or (select count(*) from public.hr_hunt_basic_supplies) <> ${r.basics.length}
     or (select count(*) from public.hr_hunt_cover_items) <> ${r.cover.length}
     or (select count(*) from public.hr_hunt_travel where tier is null) <> 0
     or (select count(*) from public.hr_hunt_target_modes) <> ${r.targets.length}
     or (select count(*) from public.hr_hunt_resumable_kinds) <> ${r.resumable.length}
     or (select count(*) from public.hr_hunt_lanes) <> ${r.lanes.length}
     or (select count(*) from public.hr_hunt_set_options) <> ${r.setOptions.length}
     or (select count(*) from public.hr_hunt_kill_bounds) <> ${r.killBounds.length}
     or (select count(*) from public.hr_hunt_abilities) <> ${r.abilities.length}
     or (select count(*) from public.hr_hunt_grounds) <> ${r.grounds.length}
     or (select count(*) from public.hr_hunt_ground_spawns) <> ${r.groundSpawns.length}
     or (select count(*) from public.hr_hunt_world_shape) <> 1
     or (select count(*) from public.hr_premium_login_reward) <> 1
     or (select count(*) from public.hr_hunt_weapons) <> ${r.weapons.length}
     or (select count(*) from public.hr_hunt_weapon_roles) <> ${r.weaponRoles.length}
     or (select count(*) from public.hr_hunt_roles) <> ${r.roleRows.length}
     or (select count(*) from public.hr_hunt_end_reasons where resumes) <> ${r.ends.filter((e) => e.resumes).length} then
    raise exception 'hunt-session catalogue row counts moved from the generator''s'; end if;
  -- The world fields the party section reads by name are all there, at the generator's positions.
  if (select fields from public.hr_hunt_world_shape) is distinct from ${sq(JSON.stringify(r.world.fields))}::jsonb
     or exists (select 1 from unnest(array[${WORLD_FIELDS_READ.unit.map(sq).join(', ')}]) n
                 where not ((select fields->'unit' from public.hr_hunt_world_shape) ? n)) then
    raise exception 'hr_hunt_world_shape.fields is not world-state.js FIELDS'; end if;
  -- ONE consumable lane, at the data file's ms (the food-lane ruling, spec §3.4 #3).
  if (select ms from public.hr_hunt_lanes where lane = 'consumable') is distinct from ${r.lanes.find((x) => x.l === 'consumable').ms} then
    raise exception 'the consumable lane is not consumables.js laneMs'; end if;
  -- Premium may never rest less than free; the core model's curves are live (a Level and a skill both start at 0 XP).
  if public.hr_hunt_limit('stamina_premium_min') < public.hr_hunt_limit('stamina_free_min')
     or coalesce(public.hr_hunt_limit('level_cubic'), 0) <= 0 or coalesce(public.hr_hunt_limit('skill_base'), 0) <= 0
     or coalesce(public.hr_hunt_limit('armour_slots'), 0) <= 0 then
    raise exception 'the stamina caps or the core model rows are malformed'; end if;
  -- Every supply, vendor value, ability rune and login reward is a catalogued item;
  -- every named hunt and ground hunt is in hr_hunts; every training id is a
  -- non-boss combat target; every ground spawn has a kill bound.
  if exists (select 1 from public.hr_hunt_supplies s where not exists (select 1 from public.hr_items i where i.item_id = s.item_id))
     or exists (select 1 from public.hr_hunt_vendor_value v where not exists (select 1 from public.hr_items i where i.item_id = v.item_id))
     or exists (select 1 from public.hr_hunt_abilities a where a.active and a.rune is not null
                  and not exists (select 1 from public.hr_items i where i.item_id = a.rune))
     or exists (select 1 from public.hr_premium_login_reward l where l.item_id is not null
                  and not exists (select 1 from public.hr_items i where i.item_id = l.item_id)) then
    raise exception 'a supply, vendor-value, ability-rune or login-reward row names an item hr_items does not have'; end if;
  if exists (select 1 from public.hr_hunt_travel t where not t.training
               and not exists (select 1 from public.hr_hunts h where h.hunt_id = t.hunt_id))
     or exists (select 1 from public.hr_hunt_grounds g where not exists (select 1 from public.hr_hunts h where h.hunt_id = g.hunt_id)) then
    raise exception 'a named hunt or a ground hunt is not in hr_hunts'; end if;
  if exists (select 1 from public.hr_hunt_travel t where t.training
               and not exists (select 1 from public.hr_activities a
                                where a.kind = 'combat' and a.activity_id = t.hunt_id and not a.is_boss)) then
    raise exception 'a training id in hr_hunt_travel is not a non-boss combat target'; end if;
  if exists (select 1 from public.hr_hunt_ground_spawns s
               where not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = s.monster_id)) then
    raise exception 'a ground spawns a monster with no kill bound'; end if;
  -- No client role reads or writes any of them; no policy exists.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_t in array array[${tableList}] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'select,insert,update,delete,truncate') then
        raise exception '% holds a privilege on %', v_role, v_t; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in (${tableList})) then
    raise exception 'a policy exists on the hunt-session catalogue'; end if;
end $$;
`;
}

/* --selftest: every refusal bites, and the shipped data passes. */
function selftest() {
  catalogueRows();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S = { supplies: clone(SUPPLIES), hunts: clone(HUNTS) };
  const fixtureGround = { g1: { id: 'g1', hunt: HUNTS[0].id, map: 'x', start: [[1, 1]], route: [0], respawnMs: 60000, pullDist: 2,
    pockets: [{ room: [0, 0, 4, 4], spawns: [{ monster: HUNTS[0].spawns[0].monster, x: 2, y: 2 }] }] } };
  const cases = {
    'supply of unknown kind': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, kind: 'snack' } } }),
    'heal that heals nothing': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, heals: 0 } } }),
    'supply not an item': () => ({ supplies: { ...S.supplies, not_an_item: { kind: 'heal', essential: true, heals: 3 } } }),
    'buff with an idle type': () => ({ supplies: { ...S.supplies, tomato_soup: { ...S.supplies.tomato_soup, buff: { type: 'gather_speed' } } } }),
    'travel not a multiple of 10': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 25 })) }),
    'travel too long': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 310 })) }),
    'training id collides': () => ({ hunts: [...S.hunts, { ...S.hunts[0], id: 'rat' }] }),
    'vigour back in the end order': () => ({ endOrder: [...END_ORDER, 'vigour'] }),
    'a death XP loss that is not a whole permille': () => ({ deathXpLoss: 0.0205 }),
    'a death XP loss of nothing': () => ({ deathXpLoss: 0 }),
    'more characters at once than slots': () => ({ maxConcurrent: SESSION_CONFIG.maxSlot + 2 }),
    'a world without the mana field the party section reads': () => ({ worldFields: { unit: WORLD_FIELDS.unit.filter(([n]) => n !== 'mana'), world: WORLD_FIELDS.world } }),
    'a stamina cap that is not a whole minute': () => ({ stamina: { free: 8 * 3600000 + 1, premium: 12 * 3600000 } }),
    'a premium cap below the free cap': () => ({ stamina: { free: 12 * 3600000, premium: 8 * 3600000 } }),
    'no stamina cap': () => ({ stamina: { free: 0, premium: 0 } }),
    'a store supply that is an item': () => ({ basics: [...BASIC_SUPPLIES, { ...BASIC_SUPPLIES[0], id: 'cooked_shrimp' }] }),
    'a store price that is not whole gold': () => ({ basics: BASIC_SUPPLIES.map((b, i) => (i ? b : { ...b, price: 2.5 })) }),
    'two store heals for one tier': () => ({ basics: BASIC_SUPPLIES.map((b, i) => (i === 1 ? { ...b, tiers: [1] } : b)) }),
    'a store shot whose partner is no ammo': () => ({ basics: BASIC_SUPPLIES.map((b) => (b.kind === 'ammo' ? { ...b, partner: 'cooked_shrimp' } : b)) }),
    'a named hunt with no tier': () => ({ huntTiers: {} }),
    'a supply source with no mine': () => ({ supplySource: { modes: ['store'], default: 'store' } }),
    'an on-empty default that ends the hunt': () => ({ onEmpty: { modes: ['switch', 'end'], default: 'end' } }),
    'an on-empty choice with no end opt-in': () => ({ onEmpty: { modes: ['switch'], default: 'switch' } }),
    'a gold floor default above its max': () => ({ floor: { min: 0, max: 100, default: 300 } }),
    'a default resume that is a hunt': () => ({ defaultResume: { kind: 'combat', id: 'rat' } }),
    'a consumable lane that is not whole sub-steps': () => ({ consumableLaneMs: 1050 }),
    'an ability on an unknown lane': () => ({ abilities: { ...ABILITIES, cleave: { ...ABILITIES.cleave, lane: 'nope' } } }),
    'a default target mode that is no mode': () => ({ defaultTarget: 'loudest' }),
    'combat as a resumable kind': () => ({ resumable: ['gather', 'combat'] }),
    'a manual leave that resumes': () => ({ resumeAfter: ['died', 'left'] }),
    'a ground on an unknown hunt': () => ({ grounds: { g1: { ...fixtureGround.g1, hunt: 'nowhere' } } }),
    'a ground spawning an unknown monster': () => ({ grounds: { g1: { ...fixtureGround.g1,
      pockets: [{ room: [0, 0, 4, 4], spawns: [{ monster: 'dragon_of_nowhere', x: 2, y: 2 }] }] } } }),
    'a party of six': () => ({ partyMax: 6 }),
    'a login reward that is no item': () => ({ loginReward: { item: 'not_an_item', qty: 1 } }),
  };
  /* The fixture ground itself must pass (the arm proves the ground path is live). */
  catalogueRows({ grounds: fixtureGround });
  let bad = 0;
  for (const [name, mk] of Object.entries(cases)) {
    let threw = false;
    try { catalogueRows(mk()); } catch { threw = true; }
    console.log(`  ${threw ? 'ok ' : 'RED'} refuses: ${name}`);
    if (!threw) bad++;
  }
  if (bad) { console.error(`gen-hunt-sessions --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-hunt-sessions --selftest: every refusal bites; shipped data passes');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest();
  } else {
    const wanted = render();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r\n/g, '\n') !== wanted) {
        console.error(`gen-hunt-sessions --check FAILED: ${OUT_NAME} is stale. Run: node tools/gen-hunt-sessions.mjs`);
        process.exit(1);
      }
      console.log('gen-hunt-sessions --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, wanted);
      console.log(`wrote ${OUT}`);
    }
  }
}
