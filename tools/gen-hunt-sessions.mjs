#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hunt-sessions.mjs — GENERATE THE SERVER CATALOGUE HUNT SESSIONS
// NEED (ruling HR-2026-10-14, lane C1).
//
// Postgres validates every hunt-session intent against these rows and never
// against a client value. Every row comes from src/data, which stays the one
// source of game content:
//   hr_hunt_supplies       src/data/supplies.js SUPPLIES (kind, essential, heals, buff type)
//   hr_hunt_basic_supplies src/data/supply-basics.js BASIC_SUPPLIES — the shop's
//                          supplies paid per use (Tyler 2026-10-14): kind, crafted
//                          partner, heals | mana, gold price, the hunt tiers it serves
//   hr_hunt_slot_targets   rule-subjects.js SLOT_TARGETS (*heal, *heal_shop, *mana, *mana_shop)
//   hr_hunt_travel.tier    a named hunt's tier (supplies.js BAG_GUIDE_BY_HUNT), a
//                          training fight's monster tier — what a shop slot resolves by
//   hr_hunt_slot_kinds     rule-subjects.js SLOT_KINDS (spell reserved: active false)
//   hr_hunt_target_modes   rule-subjects.js TARGET_MODES (follow: parties only)
//   hr_hunt_resumable_kinds hunt-sessions.js RESUMABLE_KINDS ('training' reserved)
//   + CHECKS GENERATED FROM DATA on tables other files own: hunt_sessions
//     end_reason / presses, player_action_sets slots / target_mode / pull_count,
//     player_state.last_activity_kind (hunt-sessions.js RESUMABLE_KINDS)
//   hr_hunt_travel         src/data/hunts.js HUNTS + trainingHunt() of every
//                          non-boss, non-champion monster (travelS)
//   hr_hunt_rule_subjects  src/data/rule-subjects.js RULE_SUBJECTS
//   hr_hunt_buff_types     src/data/supplies.js COMBAT_BUFF_TYPES (a `buff` param)
//   hr_hunt_limits         rule-subjects.js ACTION_SET_LIMITS + COOLDOWN_LANES (the active lanes' ms),
//                          hunt-sessions.js SESSION_LIMITS + STAMINA_LOW_MIN + SESSIONS_KEPT
//                          + KNOCKOUT_MS + GOLD_FLOOR (lane C2, master plan rows 3/4/16)
//   hr_hunt_cover_items    hunt-sessions.js coverSellable over every common monster drop
//                          (>= 5%) the vendor buys: what sell-to-cover may sell
//                          + DEATH_XP_LOSS (as `death_xp_permille`, lane C2)
//                          + STAMINA_MAX_MS (as `stamina_max_min`, lane C2)
//   hr_hunt_end_reasons    hunt-sessions.js END_ORDER (reason, position) + RESUME_AFTER_END
//                          (`resumes`: an automatic end sends the character back to
//                          its last non-hunt activity) — and,
//                          from the C2 file on, hunt_sessions.end_reason's CHECK
//   hr_hunt_default_preset rule-subjects.js DEFAULT_PRESET
//   hr_hunt_vendor_value   vendorPriceOf (supabase/functions/hr-accrue/catalogue.js)
//                          for every item a vendor buys: the Analyzer's
//                          "Gold at vendor value" and "Waste".
//
// ── WHICH FILE (lane C2, 2026-10-14) ─────────────────────────────────────────
// The catalogue is a FORWARD file: an applied generated file is history and is
// never regenerated in place. 2026-10-21-hunt-sessions-catalogue.generated.sql
// (C1) was APPLIED 2026-10-14 13:39 UTC with 'vigour' in the end order and no
// death-XP row; lane C2's data moved (Vigour ends no hunt; a fall costs XP), so
// and the hunt's meter became stamina (Tyler, same day: 'stamina' takes
// Vigour's place in the end order; the pool's cap is a limits row), so
// the generator now writes 2026-10-22-hunt-sessions-catalogue.generated.sql,
// which the replay applies after C1's and which rewrites every table wholesale.
// The next data move after C2 applies starts a new dated file the same way:
// the 2026-10-14 demolition deleted monster drops (keys, seals, tomes, essences,
// scrolls) that hr_hunt_kill_bounds and hr_hunt_vendor_value still named, so
// the generator writes 2026-10-23-demolition-hunt-catalogue.generated.sql,
// applied after the demolition catalogue regen (Security N2, 2026-10-15).
//
//   Regenerate:  node tools/gen-hunt-sessions.mjs
//   Verify:      node tools/gen-hunt-sessions.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-hunt-sessions.mjs --selftest  (the refusals bite)
//
// REFUSES (throws, nothing written): a bad id shape, a supply whose kind is not
// heal/buff/ammo, a heal that heals nothing, a buff with no combat buff type, a
// travel time that is not a multiple of 10 in 10..300, a subject whose range is
// inverted, a default preset slot that names an item no supply row has, and a
// training id that collides with a named hunt.
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
import { RULE_SUBJECTS, COOLDOWN_LANES, ACTION_SET_LIMITS, HEAL_ANY, DEFAULT_PRESET,
  SLOT_KINDS, TARGET_MODES, DEFAULT_TARGET_MODE, PULL_COUNT, PULL_CAP, SLOT_TARGETS } from '../src/data/rule-subjects.js';
import { SESSION_LIMITS, END_ORDER, STAMINA_LOW_MIN, SESSIONS_KEPT, DEATH_XP_LOSS, STAMINA_MAX_MS,
  RESUMABLE_KINDS, RESUME_AFTER_END, KNOCKOUT_MS, GOLD_FLOOR, SUPPLY_SOURCE, ON_EMPTY, ACTION_SET_OPTIONS, VALUE_HEADROOM, DEFAULT_RESUME, EVENT_COPY,
  coverSellable } from '../src/data/hunt-sessions.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { COMBAT_BALANCE } from '../src/core/combat.js';
import { HIT_XP_PER_DAMAGE, HIT_HP_XP_PER_DAMAGE } from '../src/core/styles.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2026-10-23-demolition-hunt-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Every input, validated and normalised into sorted rows. Throws on any defect. */
export function catalogueRows(src = {}) {
  const S = {
    hunts: HUNTS, monsters: MONSTERS, items: ITEMS, supplies: SUPPLIES, buffTypes: COMBAT_BUFF_TYPES,
    subjects: RULE_SUBJECTS, cooldowns: COOLDOWN_LANES, setLimits: ACTION_SET_LIMITS,
    sessionLimits: SESSION_LIMITS, endOrder: END_ORDER, preset: DEFAULT_PRESET,
    staminaLow: STAMINA_LOW_MIN, kept: SESSIONS_KEPT, deathXpLoss: DEATH_XP_LOSS, staminaMaxMs: STAMINA_MAX_MS,
    knockoutMs: KNOCKOUT_MS, floor: GOLD_FLOOR, supplySource: SUPPLY_SOURCE, onEmpty: ON_EMPTY, setOptions: ACTION_SET_OPTIONS,
    swingIntervalMs: COMBAT_BALANCE.tickMs, valueHeadroom: VALUE_HEADROOM, defaultResume: DEFAULT_RESUME, events: EVENT_COPY,
    basics: BASIC_SUPPLIES, slotTargets: SLOT_TARGETS, huntTiers: BAG_GUIDE_BY_HUNT, drinks: DRINK_ITEMS,
    slotKinds: SLOT_KINDS, targetModes: TARGET_MODES, defaultTarget: DEFAULT_TARGET_MODE,
    pull: PULL_COUNT, pullCap: PULL_CAP, resumable: RESUMABLE_KINDS, resumeAfter: RESUME_AFTER_END, ...src,
  };
  /* THE SHOP (Tyler 2026-10-14): each row is gold per use, never an item. */
  const basicSeen = new Set();
  const basics = [...S.basics].map((b) => {
    if (!ID.test(b.id) || own(S.items, b.id) || own(S.slotTargets, b.id) || basicSeen.has(b.id)) {
      throw new Error(`shop supply ${b.id} is not a fresh [a-z0-9_]{1,64} id (an item, a slot target or a repeat)`);
    }
    basicSeen.add(b.id);
    if (!['heal', 'mana', 'ammo'].includes(b.kind)) throw new Error(`shop supply ${b.id} has kind ${b.kind}`);
    /* A shop drink's partner is a STAGED drink (drinks.js) until the mana engine
       merges them into ITEMS; every other partner is a catalogued item. */
    if (!own(S.items, b.partner) && !(b.kind === 'mana' && own(S.drinks, b.partner))) {
      throw new Error(`shop supply ${b.id} names partner ${b.partner}, which is no item (or staged drink)`);
    }
    if (!(Number.isInteger(b.price) && b.price >= 1 && b.price <= 1e9)) throw new Error(`shop supply ${b.id} price ${b.price} is not whole gold in 1..1e9`);
    const heals = b.kind === 'heal' ? b.heals : 0;
    const mana = b.kind === 'mana' ? b.mana : 0;
    if (b.kind === 'heal' && !(Number.isInteger(heals) && heals > 0)) throw new Error(`shop heal ${b.id} heals ${heals}`);
    if (b.kind === 'mana' && !(Number.isInteger(mana) && mana > 0)) throw new Error(`shop drink ${b.id} restores ${mana}`);
    if (b.kind === 'ammo' && !(own(S.supplies, b.partner) && S.supplies[b.partner].kind === 'ammo')) {
      throw new Error(`shop shot ${b.id} names partner ${b.partner}, which is no packed ammo`);
    }
    const tiers = [...(b.tiers || [])];
    for (const t of tiers) if (!(Number.isInteger(t) && t >= 1 && t <= 99)) throw new Error(`shop supply ${b.id} tier ${t}`);
    return { id: b.id, kind: b.kind, partner: b.partner, heals, mana, price: b.price, tiers };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const kind of ['heal', 'mana']) {
    const owner = new Map();
    for (const b of basics.filter((x) => x.kind === kind)) {
      for (const t of b.tiers) {
        if (owner.has(t)) throw new Error(`shop ${kind} tier ${t} resolves to both ${owner.get(t)} and ${b.id}`);
        owner.set(t, b.id);
      }
    }
  }
  const partners = new Map();
  for (const b of basics.filter((x) => x.kind === 'ammo')) {
    if (partners.has(b.partner)) throw new Error(`two shop shots share the partner ${b.partner}`);
    partners.set(b.partner, b.id);
  }
  const slotTargets = Object.keys(S.slotTargets).sort().map((t) => {
    const x = S.slotTargets[t];
    if (!/^\*[a-z_]{1,32}$/.test(t)) throw new Error(`slot target ${t} is not *[a-z_]`);
    if (!['heal', 'mana'].includes(x.kind) || !['bag', 'shop'].includes(x.from)) throw new Error(`slot target ${t} is ${JSON.stringify(x)}`);
    return { t, kind: x.kind, from: x.from };
  });
  const supplies = Object.keys(S.supplies).sort().map((id) => {
    const s = S.supplies[id];
    if (!ID.test(id) || !own(S.items, id)) throw new Error(`supply ${id} is not a catalogued item id`);
    if (!['heal', 'buff', 'ammo'].includes(s.kind)) throw new Error(`supply ${id} has kind ${s.kind}`);
    if (s.kind === 'heal' && !(Number.isInteger(s.heals) && s.heals > 0)) throw new Error(`heal ${id} heals ${s.heals}`);
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
    if (!(Number.isInteger(h.travelS) && h.travelS >= 10 && h.travelS <= 300 && h.travelS % 10 === 0)) {
      throw new Error(`hunt ${h.id} travelS ${h.travelS} is not a multiple of 10 in 10..300`);
    }
    if (!(Number.isInteger(h.tier) && h.tier >= 1 && h.tier <= 99)) throw new Error(`hunt ${h.id} has no tier (${h.tier})`);
    /* THE SPAWN CYCLE (Security design review 2026-10-14 item 1): a ground's pull
       size and the time a pull takes to come back. Data, never a literal in SQL. */
    if (!(Number.isInteger(h.pull) && h.pull >= 1 && h.pull <= 8)) throw new Error(`hunt ${h.id} pull ${h.pull} is not a whole 1..8`);
    if (!(Number.isInteger(h.respawnMs) && h.respawnMs >= 1000 * h.pull && h.respawnMs <= 600000)) {
      throw new Error(`hunt ${h.id} respawnMs ${h.respawnMs} is not a whole 1 s per foe .. 10 min`);
    }
    travel.push({ id: h.id, s: h.travelS, training, tier: h.tier, pull: h.pull, respawn: h.respawnMs });
  };
  /* The TIER a shop slot resolves by: a named hunt's own (its bag guide), a
     training fight's monster's. */
  for (const h of S.hunts) addTravel({ ...h, tier: (S.huntTiers[h.id] || {}).tier }, false);
  for (const id of Object.keys(S.monsters).sort()) {
    const m = S.monsters[id];
    if (m.boss || m.champion) continue;
    addTravel({ ...trainingHunt(id, m), tier: m.tier }, true);
  }
  travel.sort((a, b) => (a.id < b.id ? -1 : 1));
  const subjects = Object.keys(S.subjects).sort().map((k) => {
    const s = S.subjects[k];
    if (!ID.test(k)) throw new Error(`subject ${k} is not [a-z0-9_]{1,64}`);
    if (s.param !== null && !['buff', 'item'].includes(s.param)) throw new Error(`subject ${k} param ${s.param}`);
    const r = s.range;
    if (r !== null && !(Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] <= r[1])) {
      throw new Error(`subject ${k} range ${JSON.stringify(r)} is not [lo, hi]`);
    }
    return { k, param: s.param, lo: r ? r[0] : null, hi: r ? r[1] : null };
  });
  const buffTypes = [...S.buffTypes].sort();
  for (const t of buffTypes) if (!ID.test(t)) throw new Error(`buff type ${t} is not [a-z0-9_]{1,64}`);
  const lim = {
    presets: S.setLimits.presets, slots: S.setLimits.slots, conditions: S.setLimits.conditions,
    bag_lines: S.sessionLimits.bagLines,
    falls_min: S.sessionLimits.falls.min, falls_max: S.sessionLimits.falls.max, falls_default: S.sessionLimits.falls.default,
    hours_min: S.sessionLimits.hours.min, hours_max: S.sessionLimits.hours.max,
    /* THE ONE BASIC-ATTACK INTERVAL (Tyler 2026-10-14; architecture contracts
       S3/X1): COMBAT_BALANCE.tickMs, the engine's own constant, so the settle
       can hold hunting time to the exact swing count. The cooldown LANES are
       their own table (hr_hunt_lanes), not limits rows. */
    swing_interval_ms: S.swingIntervalMs,
    /* The value bound's blast-radius multiplier (VALUE_HEADROOM). */
    value_headroom: S.valueHeadroom,
    stamina_low_min: S.staminaLow, sessions_kept: S.kept,
    /* A knockout inside a hunt (flat, master plan row 16) and the gold floor's
       range and default (row 3). */
    knockout_ms: S.knockoutMs,
    gold_floor_min: S.floor.min, gold_floor_max: S.floor.max, gold_floor_default: S.floor.default,
    /* The price of a fall, in permille of the level's gap. Refused unless the
       fraction is a whole permille in (0, 1000], so the engine's fraction and the
       database's row are the same number exactly — not two roundings of it. */
    death_xp_permille: Math.round(Number(S.deathXpLoss) * 1000),
    /* The stamina pool's cap in WHOLE MINUTES (the limits column is an int up
       to 100000); refused unless STAMINA_MAX_MS is a whole minute > 0. */
    stamina_max_min: Number(S.staminaMaxMs) / 60000,
    /* The pull count an action set may store (Huntera's 1-8; default 1). */
    pull_min: S.pull.min, pull_max: S.pull.max, pull_default: S.pull.default,
    /* The ONE clamp on the pull a hunt runs (rule-subjects.js PULL_CAP; 0 = the
       ground's own), read by hr_hunt_pull_of. */
    pull_cap: S.pullCap,
  };
  if (!(lim.gold_floor_min <= lim.gold_floor_default && lim.gold_floor_default <= lim.gold_floor_max)) {
    throw new Error(`GOLD_FLOOR ${JSON.stringify(S.floor)} is not min <= default <= max`);
  }
  if (!(lim.knockout_ms >= 1000)) throw new Error(`KNOCKOUT_MS ${S.knockoutMs} is under a second`);
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
  if (!(lim.pull_min >= 1 && lim.pull_min <= lim.pull_default && lim.pull_default <= lim.pull_max)) {
    throw new Error(`PULL_COUNT ${JSON.stringify(S.pull)} is not 1 <= min <= default <= max`);
  }
  for (const [l, x] of Object.entries(S.cooldowns)) {
    if (!ID.test(l)) throw new Error(`cooldown lane ${l} is not [a-z0-9_]{1,64}`);
    if (x.active === true ? !(Number.isInteger(x.ms) && x.ms > 0) : x.ms !== null) {
      throw new Error(`cooldown lane ${l}: an active lane needs a positive ms, a reserved one none (${JSON.stringify(x)})`);
    }
  }
  if (!(S.cooldowns.consumable && S.cooldowns.consumable.active === true)) throw new Error('COOLDOWN_LANES has no active consumable lane');
  if (!(Number.isInteger(lim.value_headroom) && lim.value_headroom >= 1 && lim.value_headroom <= 10)) {
    throw new Error(`VALUE_HEADROOM ${S.valueHeadroom} is not a whole multiplier in [1, 10]`);
  }
  /* THE KILL BOUNDS (Security GO item 3): per combat monster, the most one kill
     can pay — gold (the top gp roll), XP (every HP of damage at the fallback
     route's attack + strength + hitpoints rate, plus the kill XP; overkill pays
     nothing, so damage per kill <= hp) and each item (one unit per drop row
     naming it). Derived, never typed. */
  const xpPerHp = 2 * HIT_XP_PER_DAMAGE + HIT_HP_XP_PER_DAMAGE;
  const killBounds = Object.keys(S.monsters).sort().map((id) => {
    const m = S.monsters[id];
    if (!ID.test(id)) throw new Error(`monster id ${id} is not [a-z0-9_]{1,64}`);
    const drops = {};
    for (const d of (m.drops || [])) if (d && d.id && ID.test(d.id)) drops[d.id] = (drops[d.id] || 0) + 1;
    const gold = Math.max(0, Math.ceil(Number((m.gp || [0, 0])[1]) || 0));
    const xp = Math.ceil(Math.max(1, Number(m.hp) || 1) * xpPerHp + Math.max(0, Number(m.xp) || 0));
    return { id, gold, xp, drops };
  });
  const lanes = Object.keys(S.cooldowns).sort().map((l) => ({ l, ms: S.cooldowns[l].ms, active: S.cooldowns[l].active === true }));
  if (!(Number.isInteger(lim.swing_interval_ms) && lim.swing_interval_ms >= 600)) {
    throw new Error(`the swing interval ${S.swingIntervalMs} is not a whole number of ms >= 600`);
  }
  const setOptions = Object.keys(S.setOptions).sort().map((k) => {
    const o = S.setOptions[k];
    if (!ID.test(k)) throw new Error(`action-set option ${k} is not [a-z0-9_]{1,64}`);
    if (o.kind === 'enum') {
      if (!Array.isArray(o.values) || !o.values.length || !o.values.every((v) => ID.test(v))) throw new Error(`option ${k}: an enum needs [a-z0-9_] values`);
      return { k, kind: 'enum', limit: null, values: [...o.values] };
    }
    if (o.kind === 'limit') {
      if (!own(lim, `${o.limit}_min`) || !own(lim, `${o.limit}_max`)) throw new Error(`option ${k}: no ${o.limit}_min / _max limits row`);
      return { k, kind: 'limit', limit: o.limit, values: null };
    }
    if (o.kind === 'target') return { k, kind: 'target', limit: null, values: null };
    throw new Error(`option ${k}: unknown kind ${o.kind}`);
  });
  const slotKinds = Object.keys(S.slotKinds).sort().map((k) => {
    if (!ID.test(k)) throw new Error(`slot kind ${k} is not [a-z0-9_]{1,64}`);
    return { k, active: S.slotKinds[k].active === true };
  });
  if (!slotKinds.some((x) => x.k === 'supply' && x.active)) throw new Error("SLOT_KINDS has no active 'supply'");
  const targets = Object.keys(S.targetModes).sort().map((m) => {
    if (!ID.test(m)) throw new Error(`target mode ${m} is not [a-z0-9_]{1,64}`);
    return { m, solo: S.targetModes[m].solo === true };
  });
  if (!targets.some((x) => x.m === S.defaultTarget && x.solo)) throw new Error(`DEFAULT_TARGET_MODE ${S.defaultTarget} is not a solo mode`);
  const resumable = [...S.resumable];
  for (const k of resumable) {
    if (!ID.test(k) || k === 'combat' || k === 'idle') throw new Error(`resumable kind ${k} is not a non-hunt activity kind`);
  }
  if (!(Number.isInteger(lim.stamina_max_min) && lim.stamina_max_min > 0)) {
    throw new Error(`STAMINA_MAX_MS ${S.staminaMaxMs} is not a whole number of minutes > 0`);
  }
  if (!(lim.death_xp_permille > 0 && lim.death_xp_permille <= 1000 && lim.death_xp_permille / 1000 === Number(S.deathXpLoss))) {
    throw new Error(`DEATH_XP_LOSS ${S.deathXpLoss} is not a whole permille in (0, 1]`);
  }
  for (const [k, v] of Object.entries(lim)) {
    if (!(Number.isInteger(v) && v >= 0 && v <= 100000)) throw new Error(`limit ${k} = ${v} is not a whole number in 0..100000`);
  }
  if (!(lim.falls_min <= lim.falls_default && lim.falls_default <= lim.falls_max)) throw new Error('falls default outside its range');
  const ends = S.endOrder.map((r, i) => {
    if (!ID.test(r)) throw new Error(`end reason ${r} is not [a-z0-9_]{1,64}`);
    /* The 2026-10-14 loop-check ruling: Vigour ends no hunt ("no cap on combat"). */
    if (r === 'vigour') throw new Error("END_ORDER names 'vigour': Vigour ends no hunt (designer ruling 2026-10-14)");
    return { r, i: i + 1, resumes: S.resumeAfter.includes(r) };
  });
  for (const r of S.resumeAfter) {
    if (!S.endOrder.includes(r)) throw new Error(`RESUME_AFTER_END names ${r}, which is not an end reason`);
    if (r === 'left' || r === 'changed') throw new Error(`RESUME_AFTER_END names ${r}: a hunt the player left or changed resumes nothing`);
  }
  const preset = { name: String(S.preset.name), slots: S.preset.slots.map((sl) => {
    if (!own(S.slotTargets, sl.item) && !basicSeen.has(sl.item)
        && !(own(S.supplies, sl.item) && ['heal', 'buff'].includes(S.supplies[sl.item].kind))) {
      throw new Error(`the default preset names ${sl.item}: no slot target, shop supply or heal/buff supply row`);
    }
    return { item: sl.item, on: !!sl.on, conditions: sl.conditions.map((c) => ({ subject: c.subject, op: c.op, value: c.value })) };
  }) };
  const vendor = Object.keys(S.items).sort().map((id) => ({ id, unit: vendorPriceOf(S.items, id) }))
    .filter((r) => r.unit > 0);
  for (const r of vendor) {
    if (!ID.test(r.id) || !Number.isInteger(r.unit)) throw new Error(`vendor value ${r.id} = ${r.unit}`);
  }
  const supplySource = { modes: [...S.supplySource.modes], default: S.supplySource.default };
  if (!supplySource.modes.every((m) => ID.test(m)) || !supplySource.modes.includes('mine')
      || supplySource.default !== 'mine') {
    throw new Error(`SUPPLY_SOURCE ${JSON.stringify(S.supplySource)} must offer 'mine' and default to it (the store is never silent)`);
  }
  const onEmpty = { modes: [...S.onEmpty.modes], default: S.onEmpty.default };
  if (!onEmpty.modes.every((m) => ID.test(m)) || !onEmpty.modes.includes('end') || onEmpty.default !== 'end') {
    throw new Error(`ON_EMPTY ${JSON.stringify(S.onEmpty)} must offer 'end' and default to it (the store is never silent)`);
  }
  return { supplySource, onEmpty, lanes, setOptions, killBounds, supplies, travel, subjects, buffTypes, lim, ends, preset, vendor, slotKinds, targets, resumable, basics, slotTargets,
    cover, resume, eventTypes,
    defaultTarget: S.defaultTarget, slotsMax: S.setLimits.slots };
}

export function render(src) {
  const r = catalogueRows(src);
  const digest = createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const supplyValues = r.supplies.map((s) => `  (${sq(s.id)}, ${sq(s.kind)}, ${s.essential}, ${s.heals}, ${s.bt ? sq(s.bt) : 'null'})`).join(',\n');
  const basicValues = r.basics.map((b) => `  (${sq(b.id)}, ${sq(b.kind)}, ${sq(b.partner)}, ${b.heals}, ${b.mana}, ${b.price}, '{${b.tiers.join(',')}}'::int[])`).join(',\n');
  const targetRowValues = r.slotTargets.map((x) => `  (${sq(x.t)}, ${sq(x.kind)}, ${sq(x.from)})`).join(',\n');
  const coverValues = r.cover.map((c) => `  (${sq(c.id)}, ${c.unit})`).join(',\n');
  const eventList = r.eventTypes.map(sq).join(', ');
  const slotKindValues = r.slotKinds.map((x) => `  (${sq(x.k)}, ${x.active})`).join(',\n');
  const boundValues = r.killBounds.map((b) => `  (${sq(b.id)}, ${b.gold}, ${b.xp}, ${sq(JSON.stringify(b.drops))}::jsonb)`).join(',\n');
  const laneValues = r.lanes.map((x) => `  (${sq(x.l)}, ${x.ms ?? 'null'}, ${x.active})`).join(',\n');
  const optionValues = r.setOptions.map((x) => `  (${sq(x.k)}, ${sq(x.kind)}, ${x.limit ? sq(x.limit) : 'null'}, `
    + `${x.values ? `array[${x.values.map(sq).join(', ')}]::text[]` : 'null'})`).join(',\n');
  const targetValues = r.targets.map((x) => `  (${sq(x.m)}, ${x.solo})`).join(',\n');
  const targetList = r.targets.map((x) => sq(x.m)).join(', ');
  const resumeList = r.resumable.map(sq).join(', ');

  const travelValues = r.travel.map((t) => `  (${sq(t.id)}, ${t.s}, ${t.training}, ${t.tier}, ${t.pull}, ${t.respawn})`).join(',\n');
  const subjectValues = r.subjects.map((s) => `  (${sq(s.k)}, ${s.param ? sq(s.param) : 'null'}, ${s.lo ?? 'null'}, ${s.hi ?? 'null'})`).join(',\n');
  const buffValues = r.buffTypes.map((t) => `  (${sq(t)})`).join(',\n');
  const limValues = Object.entries(r.lim).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `  (${sq(k)}, ${v})`).join(',\n');
  const endValues = r.ends.map((e) => `  (${sq(e.r)}, ${e.i}, ${e.resumes})`).join(',\n');
  const resumableValues = r.resumable.map((k) => `  (${sq(k)})`).join(',\n');
  const endList = r.ends.map((e) => sq(e.r)).join(', ');
  const vendorValues = r.vendor.map((v) => `  (${sq(v.id)}, ${v.unit})`).join(',\n');
  const preset = JSON.stringify(r.preset.slots);
  const nLim = Object.keys(r.lim).length;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT SESSION CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-hunt-sessions.mjs from src/data/supplies.js,
--   src/data/rule-subjects.js, src/data/hunt-sessions.js, src/data/hunts.js,
--   src/data/monsters.js and the vendor price (hr-accrue/catalogue.js).
--   Any hand edit FAILS \`node tools/gen-hunt-sessions.mjs --check\`.
--
--   digest: ${digest}
--   ${r.supplies.length} supplies, ${r.travel.length} hunts (named + training), ${r.subjects.length} rule subjects,
--   ${r.buffTypes.length} combat buff types, ${nLim} limits, ${r.ends.length} end reasons, ${r.vendor.length} vendor values,
--   ${r.basics.length} shop supplies paid per use, ${r.slotTargets.length} slot targets, ${r.slotKinds.length} slot kinds,
--   ${r.targets.length} target modes
--
-- SUPERSEDES 2026-10-22-hunt-sessions-catalogue.generated.sql (applied; history,
-- never regenerated): every table below is rewritten wholesale.
--
-- Read by the hunt-session RPCs (2026-10-21-hunt-sessions.sql). Server-only:
-- RLS on, NO policy, no client grant (the client reads src/data). Idempotent:
-- delete + insert; nothing references these rows by foreign key.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_hunt_supplies (
  item_id   text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  kind      text not null check (kind in ('heal', 'buff', 'ammo')),
  essential boolean not null,
  heals     int  not null check (heals >= 0),
  buff_type text,
  constraint hr_hunt_supplies_shape_ck check (
    (kind = 'heal' and heals > 0 and buff_type is null)
    or (kind = 'buff' and heals = 0 and buff_type is not null)
    or (kind = 'ammo' and heals = 0 and buff_type is null))
);
create table if not exists public.hr_hunt_travel (
  hunt_id  text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  travel_s int  not null check (travel_s between 10 and 300 and travel_s % 10 = 0),
  training boolean not null
);
create table if not exists public.hr_hunt_rule_subjects (
  subject text primary key check (subject ~ '^[a-z0-9_]{1,64}$'),
  param   text check (param in ('buff', 'item')),
  lo      int,
  hi      int,
  constraint hr_hunt_rule_subjects_range_ck check ((lo is null) = (hi is null) and (lo is null or lo <= hi))
);
create table if not exists public.hr_hunt_buff_types (
  buff_type text primary key check (buff_type ~ '^[a-z0-9_]{1,64}$')
);
create table if not exists public.hr_hunt_limits (
  key   text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value int  not null check (value between 0 and 100000)
);
create table if not exists public.hr_hunt_end_reasons (
  reason text primary key check (reason ~ '^[a-z0-9_]{1,64}$'),
  ord    int  not null unique check (ord >= 1)
);
create table if not exists public.hr_hunt_default_preset (
  id    boolean primary key default true check (id),
  name  text  not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array')
);
create table if not exists public.hr_hunt_vendor_value (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  unit    bigint not null check (unit >= 1)
);
-- THE SHOP (Tyler 2026-10-14): supplies paid per use, never items.
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
create table if not exists public.hr_hunt_slot_targets (
  target text primary key check (target ~ '^[*][a-z_]{1,32}$'),
  kind   text not null check (kind in ('heal', 'mana')),
  src    text not null check (src in ('bag', 'shop'))
);
-- The tier a shop slot resolves by (a named hunt's bag guide; a training
-- fight's monster).
alter table public.hr_hunt_travel add column if not exists tier int;
-- THE SPAWN CYCLE (Security design review 2026-10-14 item 1): the ground's pull
-- size and the time a pull takes to come back (src/data/hunts.js pull / respawnMs).
alter table public.hr_hunt_travel add column if not exists pull_size int;
alter table public.hr_hunt_travel add column if not exists respawn_ms int;
create table if not exists public.hr_hunt_slot_kinds (
  kind   text primary key check (kind ~ '^[a-z0-9_]{1,64}$'),
  active boolean not null
);
create table if not exists public.hr_hunt_target_modes (
  mode text primary key check (mode ~ '^[a-z0-9_]{1,64}$'),
  solo boolean not null
);
create table if not exists public.hr_hunt_resumable_kinds (
  kind text primary key check (kind ~ '^[a-z0-9_]{1,64}$')
);
-- THE COOLDOWN LANES (rule-subjects.js COOLDOWN_LANES; architecture contracts
-- S3): an active lane has a cooldown, a reserved one none. The settle reads its
-- cooldown keys and caps from HERE, never from a literal.
create table if not exists public.hr_hunt_lanes (
  lane   text primary key check (lane ~ '^[a-z0-9_]{1,64}$'),
  ms     int check (ms is null or ms > 0),
  active boolean not null,
  check (active = (ms is not null))
);
-- THE KILL BOUNDS (Security GO item 3): the most ONE kill of each monster can
-- pay. Read by the value bound (2026-10-22-hunt-sessions-value-bound.sql).
create table if not exists public.hr_hunt_kill_bounds (
  monster_id text primary key check (monster_id ~ '^[a-z0-9_]{1,64}$'),
  gold_max   bigint not null check (gold_max >= 0),
  xp_max     bigint not null check (xp_max >= 1),
  drops      jsonb  not null check (jsonb_typeof(drops) = 'object')
);
-- THE ACTION SET'S OPTIONS (hunt-sessions.js ACTION_SET_OPTIONS; contracts S4).
create table if not exists public.hr_hunt_set_options (
  opt       text primary key check (opt ~ '^[a-z0-9_]{1,64}$'),
  kind      text not null check (kind in ('target', 'limit', 'enum')),
  limit_key text check (limit_key is null or limit_key ~ '^[a-z0-9_]{1,64}$'),
  vals      text[],
  check ((kind = 'limit') = (limit_key is not null)),
  check ((kind = 'enum') = (vals is not null))
);
alter table public.hr_hunt_end_reasons add column if not exists resumes boolean not null default false;
alter table public.hr_hunt_supplies       enable row level security;
alter table public.hr_hunt_travel         enable row level security;
alter table public.hr_hunt_rule_subjects  enable row level security;
alter table public.hr_hunt_buff_types     enable row level security;
alter table public.hr_hunt_limits         enable row level security;
alter table public.hr_hunt_end_reasons    enable row level security;
alter table public.hr_hunt_default_preset enable row level security;
alter table public.hr_hunt_vendor_value   enable row level security;
alter table public.hr_hunt_slot_kinds     enable row level security;
alter table public.hr_hunt_target_modes   enable row level security;
alter table public.hr_hunt_resumable_kinds enable row level security;
alter table public.hr_hunt_basic_supplies enable row level security;
alter table public.hr_hunt_slot_targets   enable row level security;
alter table public.hr_hunt_cover_items    enable row level security;
alter table public.hr_hunt_lanes          enable row level security;
alter table public.hr_hunt_set_options    enable row level security;
alter table public.hr_hunt_kill_bounds    enable row level security;
revoke all on public.hr_hunt_lanes, public.hr_hunt_set_options, public.hr_hunt_kill_bounds from public, anon, authenticated, service_role;
revoke all on public.hr_hunt_supplies, public.hr_hunt_travel, public.hr_hunt_rule_subjects,
              public.hr_hunt_buff_types, public.hr_hunt_limits, public.hr_hunt_end_reasons,
              public.hr_hunt_default_preset, public.hr_hunt_vendor_value,
              public.hr_hunt_slot_kinds, public.hr_hunt_target_modes, public.hr_hunt_resumable_kinds,
              public.hr_hunt_basic_supplies, public.hr_hunt_slot_targets, public.hr_hunt_cover_items
  from public, anon, authenticated, service_role;

delete from public.hr_hunt_supplies;
insert into public.hr_hunt_supplies (item_id, kind, essential, heals, buff_type) values
${supplyValues};
delete from public.hr_hunt_basic_supplies;
insert into public.hr_hunt_basic_supplies (basic_id, kind, partner, heals, mana, price, tiers) values
${basicValues};
delete from public.hr_hunt_slot_targets;
insert into public.hr_hunt_slot_targets (target, kind, src) values
${targetRowValues};
delete from public.hr_hunt_cover_items;
${r.cover.length ? `insert into public.hr_hunt_cover_items (item_id, unit) values
${coverValues};` : '-- (no item is flagged junk: sell-to-cover is inert until one is)'}
delete from public.hr_hunt_slot_kinds;
insert into public.hr_hunt_slot_kinds (kind, active) values
${slotKindValues};
delete from public.hr_hunt_lanes;
insert into public.hr_hunt_lanes (lane, ms, active) values
${laneValues};
delete from public.hr_hunt_set_options;
insert into public.hr_hunt_set_options (opt, kind, limit_key, vals) values
${optionValues};
delete from public.hr_hunt_kill_bounds;
insert into public.hr_hunt_kill_bounds (monster_id, gold_max, xp_max, drops) values
${boundValues};
delete from public.hr_hunt_target_modes;
insert into public.hr_hunt_target_modes (mode, solo) values
${targetValues};
delete from public.hr_hunt_travel;
insert into public.hr_hunt_travel (hunt_id, travel_s, training, tier, pull_size, respawn_ms) values
${travelValues};
delete from public.hr_hunt_rule_subjects;
insert into public.hr_hunt_rule_subjects (subject, param, lo, hi) values
${subjectValues};
delete from public.hr_hunt_buff_types;
insert into public.hr_hunt_buff_types (buff_type) values
${buffValues};
delete from public.hr_hunt_limits;
insert into public.hr_hunt_limits (key, value) values
${limValues};
delete from public.hr_hunt_end_reasons;
insert into public.hr_hunt_end_reasons (reason, ord, resumes) values
${endValues};
delete from public.hr_hunt_resumable_kinds;
insert into public.hr_hunt_resumable_kinds (kind) values
${resumableValues};
-- hunt_sessions.end_reason's CHECK is END_ORDER too. C1 typed it inline in
-- 2026-10-21-hunt-sessions.sql; from this file on the generator owns it, so the
-- wall and the catalogue cannot name different reasons (2026-10-14: 'vigour'
-- left both). Applies after that file (the table must exist).
alter table public.hunt_sessions drop constraint if exists hunt_sessions_end_reason_check;
alter table public.hunt_sessions add constraint hunt_sessions_end_reason_check
  check (end_reason in (${endList}));
-- The action bar's size is ACTION_SET_LIMITS.slots (Huntera's two rows of ten,
-- Tyler 2026-10-14): the stored bar and the queued presses, both walls.
alter table public.player_action_sets drop constraint if exists player_action_sets_slots_check;
alter table public.player_action_sets add constraint player_action_sets_slots_check
  check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= ${r.slotsMax});
alter table public.hunt_sessions drop constraint if exists hunt_sessions_presses_check;
alter table public.hunt_sessions add constraint hunt_sessions_presses_check
  check (jsonb_typeof(presses) = 'array' and jsonb_array_length(presses) <= ${r.slotsMax});
-- The timeline's event types are EVENT_COPY's keys (2026-10-14: stamina_low
-- replaces vigour_low; cover is sell-to-cover).
alter table public.hunt_session_events drop constraint if exists hunt_session_events_type_check;
alter table public.hunt_session_events add constraint hunt_session_events_type_check
  check (type in (${eventList}));
-- Each action set's GOLD FLOOR (master plan row 3): a shop use never takes the
-- character's gold below it.
alter table public.player_action_sets add column if not exists gold_floor bigint;
update public.player_action_sets set gold_floor = ${r.lim.gold_floor_default} where gold_floor is null;
alter table public.player_action_sets alter column gold_floor set default ${r.lim.gold_floor_default};
alter table public.player_action_sets alter column gold_floor set not null;
alter table public.player_action_sets drop constraint if exists player_action_sets_gold_floor_ck;
alter table public.player_action_sets add constraint player_action_sets_gold_floor_ck
  check (gold_floor between ${r.lim.gold_floor_min} and ${r.lim.gold_floor_max});
-- Each action set's HUNT SUPPLIES choice (hunt-sessions.js SUPPLY_SOURCE /
-- ON_EMPTY; Master Design Reference §4): supply_source 'mine' | 'store',
-- on_empty 'end' | 'switch'. Defaults 'mine' + 'end' — the store is never silent.
alter table public.player_action_sets add column if not exists supply_source text;
update public.player_action_sets set supply_source = ${sq(r.supplySource.default)} where supply_source is null;
alter table public.player_action_sets alter column supply_source set default ${sq(r.supplySource.default)};
alter table public.player_action_sets alter column supply_source set not null;
alter table public.player_action_sets drop constraint if exists player_action_sets_supply_source_ck;
alter table public.player_action_sets add constraint player_action_sets_supply_source_ck
  check (supply_source in (${r.supplySource.modes.map(sq).join(', ')}));
alter table public.player_action_sets add column if not exists on_empty text;
update public.player_action_sets set on_empty = ${sq(r.onEmpty.default)} where on_empty is null;
alter table public.player_action_sets alter column on_empty set default ${sq(r.onEmpty.default)};
alter table public.player_action_sets alter column on_empty set not null;
alter table public.player_action_sets drop constraint if exists player_action_sets_on_empty_ck;
alter table public.player_action_sets add constraint player_action_sets_on_empty_ck
  check (on_empty in (${r.onEmpty.modes.map(sq).join(', ')}));
-- Each action set's TARGET MODE and PULL COUNT (Huntera's bar), stored server-side.
alter table public.player_action_sets add column if not exists target_mode text;
alter table public.player_action_sets add column if not exists pull_count smallint;
update public.player_action_sets set target_mode = ${sq(r.defaultTarget)} where target_mode is null;
update public.player_action_sets set pull_count = ${r.lim.pull_default} where pull_count is null;
alter table public.player_action_sets alter column target_mode set default ${sq(r.defaultTarget)};
alter table public.player_action_sets alter column target_mode set not null;
alter table public.player_action_sets alter column pull_count set default ${r.lim.pull_default};
alter table public.player_action_sets alter column pull_count set not null;
alter table public.player_action_sets drop constraint if exists player_action_sets_target_mode_ck;
alter table public.player_action_sets add constraint player_action_sets_target_mode_ck
  check (target_mode in (${targetList}));
alter table public.player_action_sets drop constraint if exists player_action_sets_pull_count_ck;
alter table public.player_action_sets add constraint player_action_sets_pull_count_ck
  check (pull_count between ${r.lim.pull_min} and ${r.lim.pull_max});
-- THE LAST NON-HUNT ACTIVITY an automatic hunt end resumes (Tyler 2026-10-14);
-- written by the trigger 2026-10-22-hunt-sessions-settle.sql installs.
alter table public.player_state add column if not exists last_activity_kind text;
alter table public.player_state add column if not exists last_activity_id text;
-- A new character resumes fishing the Shrimp Spot (master plan row 25).
alter table public.player_state alter column last_activity_kind set default ${sq(r.resume.kind)};
alter table public.player_state alter column last_activity_id set default ${sq(r.resume.id)};
alter table public.player_state drop constraint if exists player_state_last_activity_ck;
alter table public.player_state add constraint player_state_last_activity_ck
  check ((last_activity_kind is null) = (last_activity_id is null)
         and (last_activity_kind is null or last_activity_kind in (${resumeList}))
         and (last_activity_id is null or last_activity_id ~ '^[a-z0-9_]{1,64}$'));
delete from public.hr_hunt_default_preset;
insert into public.hr_hunt_default_preset (id, name, slots) values
  (true, ${sq(r.preset.name)}, ${sq(preset)}::jsonb);
delete from public.hr_hunt_vendor_value;
insert into public.hr_hunt_vendor_value (item_id, unit) values
${vendorValues};

do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_hunt_supplies) <> ${r.supplies.length}
     or (select count(*) from public.hr_hunt_travel) <> ${r.travel.length}
     or (select count(*) from public.hr_hunt_rule_subjects) <> ${r.subjects.length}
     or (select count(*) from public.hr_hunt_buff_types) <> ${r.buffTypes.length}
     or (select count(*) from public.hr_hunt_limits) <> ${nLim}
     or (select count(*) from public.hr_hunt_end_reasons) <> ${r.ends.length}
     or (select count(*) from public.hr_hunt_default_preset) <> 1
     or (select count(*) from public.hr_hunt_vendor_value) <> ${r.vendor.length}
     or (select count(*) from public.hr_hunt_basic_supplies) <> ${r.basics.length}
     or (select count(*) from public.hr_hunt_slot_targets) <> ${r.slotTargets.length}
     or (select count(*) from public.hr_hunt_cover_items) <> ${r.cover.length}
     or (select count(*) from public.hr_hunt_travel where tier is null) <> 0
     or (select count(*) from public.hr_hunt_travel where pull_size is null or pull_size not between 1 and 8
            or respawn_ms is null or respawn_ms < 1000 * pull_size) <> 0
     or (select count(*) from public.hr_hunt_slot_kinds) <> ${r.slotKinds.length}
     or (select count(*) from public.hr_hunt_target_modes) <> ${r.targets.length}
     or (select count(*) from public.hr_hunt_resumable_kinds) <> ${r.resumable.length}
     or (select count(*) from public.hr_hunt_lanes) <> ${r.lanes.length}
     or (select count(*) from public.hr_hunt_set_options) <> ${r.setOptions.length}
     or (select count(*) from public.hr_hunt_kill_bounds) <> ${r.killBounds.length}
     or (select count(*) from public.hr_hunt_end_reasons where resumes) <> ${r.ends.filter((e) => e.resumes).length} then
    raise exception 'hunt-session catalogue row counts moved from the generator''s'; end if;
  -- Every supply and every vendor value is a catalogued item; every named hunt is
  -- in hr_hunts; every training id is a non-boss combat target.
  if exists (select 1 from public.hr_hunt_supplies s where not exists (select 1 from public.hr_items i where i.item_id = s.item_id))
     or exists (select 1 from public.hr_hunt_vendor_value v where not exists (select 1 from public.hr_items i where i.item_id = v.item_id)) then
    raise exception 'a supply or vendor-value row names an item hr_items does not have'; end if;
  if exists (select 1 from public.hr_hunt_travel t where not t.training
               and not exists (select 1 from public.hr_hunts h where h.hunt_id = t.hunt_id)) then
    raise exception 'a named hunt in hr_hunt_travel is not in hr_hunts'; end if;
  if exists (select 1 from public.hr_hunt_travel t where t.training
               and not exists (select 1 from public.hr_activities a
                                where a.kind = 'combat' and a.activity_id = t.hunt_id and not a.is_boss)) then
    raise exception 'a training id in hr_hunt_travel is not a non-boss combat target'; end if;
  if exists (select 1 from public.hr_hunt_supplies s where s.kind = 'buff'
               and not exists (select 1 from public.hr_hunt_buff_types b where b.buff_type = s.buff_type)) then
    raise exception 'a buff supply names a buff type outside the combat list'; end if;
  -- No client role reads or writes any of them; no policy exists.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_t in array array['hr_hunt_supplies', 'hr_hunt_travel', 'hr_hunt_rule_subjects', 'hr_hunt_buff_types',
                               'hr_hunt_limits', 'hr_hunt_end_reasons', 'hr_hunt_default_preset', 'hr_hunt_vendor_value',
                               'hr_hunt_slot_kinds', 'hr_hunt_target_modes', 'hr_hunt_resumable_kinds',
                               'hr_hunt_basic_supplies', 'hr_hunt_slot_targets', 'hr_hunt_cover_items', 'hr_hunt_lanes', 'hr_hunt_set_options', 'hr_hunt_kill_bounds'] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'select,insert,update,delete,truncate') then
        raise exception '% holds a privilege on %', v_role, v_t; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
               and tablename in ('hr_hunt_supplies', 'hr_hunt_travel', 'hr_hunt_rule_subjects', 'hr_hunt_buff_types',
                                 'hr_hunt_limits', 'hr_hunt_end_reasons', 'hr_hunt_default_preset', 'hr_hunt_vendor_value',
                                 'hr_hunt_slot_kinds', 'hr_hunt_target_modes', 'hr_hunt_resumable_kinds',
                                 'hr_hunt_basic_supplies', 'hr_hunt_slot_targets', 'hr_hunt_cover_items', 'hr_hunt_lanes', 'hr_hunt_set_options', 'hr_hunt_kill_bounds')) then
    raise exception 'a policy exists on the hunt-session catalogue'; end if;
end $$;
`;
}

/* --selftest: every refusal bites, and the shipped data passes. */
function selftest() {
  catalogueRows();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S = { supplies: clone(SUPPLIES), hunts: clone(HUNTS), subjects: clone(RULE_SUBJECTS), preset: clone(DEFAULT_PRESET) };
  const cases = {
    'supply of unknown kind': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, kind: 'snack' } } }),
    'heal that heals nothing': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, heals: 0 } } }),
    'supply not an item': () => ({ supplies: { ...S.supplies, not_an_item: { kind: 'heal', essential: true, heals: 3 } } }),
    'buff with an idle type': () => ({ supplies: { ...S.supplies, tomato_soup: { ...S.supplies.tomato_soup, buff: { type: 'gather_speed' } } } }),
    'travel not a multiple of 10': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 25 })) }),
    'travel too long': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 310 })) }),
    'a ground with no pull': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, pull: 0 })) }),
    'a respawn under a second a foe': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, pull: 3, respawnMs: 2999 })) }),
    'training id collides': () => ({ hunts: [...S.hunts, { ...S.hunts[0], id: 'rat' }] }),
    'inverted subject range': () => ({ subjects: { ...S.subjects, self_hp_pct: { ...S.subjects.self_hp_pct, range: [99, 1] } } }),
    'unknown subject param': () => ({ subjects: { ...S.subjects, self_hp_pct: { ...S.subjects.self_hp_pct, param: 'monster' } } }),
    'preset names a non-supply': () => ({ preset: { ...S.preset, slots: [{ item: 'iron_bar', on: true, conditions: [] }] } }),
    'vigour back in the end order': () => ({ endOrder: [...END_ORDER, 'vigour'] }),
    'a death XP loss that is not a whole permille': () => ({ deathXpLoss: 0.0205 }),
    'a death XP loss of nothing': () => ({ deathXpLoss: 0 }),
    'a stamina cap that is not a whole minute': () => ({ staminaMaxMs: 12 * 3600000 + 1 }),
    'no stamina cap': () => ({ staminaMaxMs: 0 }),
    'a shop supply that is an item': () => ({ basics: [...BASIC_SUPPLIES, { ...BASIC_SUPPLIES[0], id: 'cooked_shrimp' }] }),
    'a shop price that is not whole gold': () => ({ basics: BASIC_SUPPLIES.map((b, i) => (i ? b : { ...b, price: 2.5 })) }),
    'two shop heals for one tier': () => ({ basics: BASIC_SUPPLIES.map((b, i) => (i === 1 ? { ...b, tiers: [1] } : b)) }),
    'a shop shot whose partner is no ammo': () => ({ basics: BASIC_SUPPLIES.map((b) => (b.kind === 'ammo' ? { ...b, partner: 'cooked_shrimp' } : b)) }),
    'a named hunt with no tier': () => ({ huntTiers: {} }),
    'a supply source that defaults to the store': () => ({ supplySource: { modes: ['mine', 'store'], default: 'store' } }),
    'a supply source with no mine': () => ({ supplySource: { modes: ['store'], default: 'store' } }),
    'an on-empty default that switches': () => ({ onEmpty: { modes: ['end', 'switch'], default: 'switch' } }),
    'an on-empty choice with no end': () => ({ onEmpty: { modes: ['switch'], default: 'switch' } }),
    'a gold floor default above its max': () => ({ floor: { min: 0, max: 100, default: 300 } }),
    'a default resume that is a hunt': () => ({ defaultResume: { kind: 'combat', id: 'rat' } }),
    'no active consumable lane': () => ({ cooldowns: { consumable: { ms: 2000, active: false }, offense: { ms: null, active: false } } }),
    'a reserved lane with a cooldown': () => ({ cooldowns: { consumable: { ms: 2000, active: true }, offense: { ms: 500, active: false } } }),
    'no active supply slot kind': () => ({ slotKinds: { supply: { active: false }, spell: { active: false } } }),
    'a default target mode that is party-only': () => ({ defaultTarget: 'follow' }),
    'a pull default outside its range': () => ({ pull: { min: 1, max: 8, default: 9 } }),
    'combat as a resumable kind': () => ({ resumable: ['gather', 'combat'] }),
    'a manual leave that resumes': () => ({ resumeAfter: ['falls', 'left'] }),
  };
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
