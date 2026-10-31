// ============================================================================
// src/core/member.js — THE CHARACTER AS THE HUNT ENGINE READS IT.
//
// ONE assembly of a hunt member (its state, its value sinks, its rolls) for the
// two places a hunt instance runs: the edge settle (supabase/functions/hr-accrue
// accrual.js accrueHunt, the authority) and the browser's live view of the
// VIEWED character's instance (src/hunt-view/live-engine.js, prediction only:
// nothing it computes is spent or credited; the server's commit is the truth).
// Moved here from accrual.js (2026-10-19, option B) so the two cannot drift.
// Also the bonus chain (perks + companion + timed buffs) every engine path prices
// with, and the weapon family's stat profile.
//
// PURE ESM, Node + Deno + browser.
// ============================================================================

import { DEFAULT_PROFILE, equipmentStats, armorSetBonus, playerCombatRolls, weaknessInfo } from './combat.js?v=0.2.76';
import { makeBonus, EMPTY_PERKS } from './perks.js?v=0.2.76';
import { companionBonus } from './companion-perk.js?v=0.2.76';
import { buffQueueFromServer, buffBonusFor } from './buffs.js?v=0.2.76';
import { grantXp, normaliseXpFrac } from './progression.js?v=0.2.76';
import { charLevelFromXp, levelsOf, levelOf, skillXpForLevel } from './xp.js?v=0.2.76';
import { vitalsOf, wearsArmour, holdsShield } from './vitals.js?v=0.2.76';
import { newHuntSession, takeLine } from './action-rules.js?v=0.2.76';
import { makeGoalCounter, makeBestiaryCounter, makeCollectionCounter } from './goals.js?v=0.2.76';
import { MONSTERS } from '../data/monsters.js?v=0.2.76';
import { honeOf, honeWornAt, ammoPerShot } from './ammo.js?v=0.2.76';
import { mitigationFor, NO_MITIGATION } from './mitigation.js?v=0.2.76';
import { isRune } from '../data/runes.js?v=0.2.76';
import { ABILITIES, abilitySkill } from '../data/abilities.js?v=0.2.76';
import { STATUSES } from '../data/statuses.js?v=0.2.76';
import { BASIC_EFFECT_SHARE } from '../data/supply-basics.js?v=0.2.76';
import { LANE_OF } from './hunt/conditions.js?v=0.2.76';

/* A finite, non-negative number or the fallback (every number that crosses in from a row). */
function nat(v, fallback) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : fallback;
}

/* The engine's bonus function for a given perk state. `null`/absent state →
   EMPTY_PERKS → 0 for every key.

   ⚠ TWO LAYERS, SUMMED — mirroring the client's getBonus chain exactly.
   `makeBonus` is LAYER 0 (rooms/plots/property/renown), clamped by the
   PERMANENT_CAP fuse because on the server that IS the whole layer-0 chain.
   `companionBonus` is LAYER 1 — the equipped companion, added ON TOP of the
   fused number precisely as src/features/companions.js wraps window.getBonus
   with `v += cb[key]` AFTER the base returned. Folding the companion into
   layer 0 would clamp (rooms + companion) together and disagree with the
   client near the cap; keeping it a separate additive layer keeps the two
   byte-identical. companionBonus draws NO rng and pays on AWAY_SCOPE.permanent
   (true), so away and live share every seeded draw and AWAY-1 stays byte-for-
   byte — a companion changes the totals, but away==live for the same setup.
   EMPTY_PERKS carries no `companion`, so companionBonus returns 0 for every
   key and this degrades to the pre-companion behaviour exactly. */
/* The account bestiary's largest relic multiplier (stage 4, x1.25; lane c-bestiary). */
const RELIC_MULT_MAX = 1.25;

export function bonusFor(perkState, buffHost, away) {
  const base = makeBonus(perkState || EMPTY_PERKS);
  const comp = companionBonus(perkState || EMPTY_PERKS);
  /* ── LAYER 2 — THE TIMED CONSUMABLE QUEUE (2026-09-13) ───────────────────
     A third additive layer, mirroring the client's getBonus chain, which asks
     the buff queue after rooms and companions. It is read LIVE, through
     `buffHost.buffs`, and that is the load-bearing part: the simulators DRAIN
     the queue tick by tick (combat-sim `simulateSpan`, skill/artisan
     `sliceSpan`) and REASSIGN `state.buffs` when they prune, so a captured
     array would go stale exactly where a buff expires mid-absence — the b326
     bug in reverse, paying a dead buff instead of freezing a live one.

     `away` defaults to TRUE because every caller here is the accrual engine and
     the accrual engine is the away path; `AWAY_SCOPE.buff` is open (a buff is
     PERSONAL — Tyler, 2026-08-14), so the channel pays, and it drains in the
     same breath because the two halves are one rule.

     `buffHost` absent → this term is 0 for every key, which is byte-for-byte the
     pre-2026-09-13 behaviour and the reason an Edge deployed against a database
     with no `buffs` column pays nobody. */
  const buffCtx = { away: away !== false };
  if (!buffHost) return (key) => base(key) + comp(key);
  return (key) => base(key) + comp(key) + buffBonusFor(buffHost.buffs, key, buffCtx);
}

/* THE LIVE VIEW a `bonusFor` layer-2 reads through. A getter, not the array:
   see the reassignment note above. One idiom for all three activity builders so
   the combat path and the gather/artisan paths cannot drift — and it works in
   the two orders the builders happen to have (combat builds `state` before its
   bonus, gather and artisan build the bonus first), because the getter is not
   evaluated until the simulation asks for a key. */
export function liveBuffHost(get) {
  return { get buffs() { return get(); } };
}

/** The stat profile, derived from the equipped weapon family. Mirrors
    legacy.js:7906 getCombatStatProfile, which reads the same weapon type. */
export function deriveProfile(weaponType) {
  if (weaponType === 'magic') {
    return { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic',
             accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' };
  }
  if (weaponType === 'ranged') {
    return { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged',
             accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
  }
  return Object.assign({}, DEFAULT_PROFILE, { type: weaponType || 'sword' });
}

/* THE COMBAT SNAPSHOT a hero's unit carries (src/core/hunt/damage.js reads it):
   accuracy (permille) and max hit against a ZERO-defence foe — the target's own
   defence, element and stance are applied by damage.js hurt() at the blow —
   and the hero's defence as a monster swing reads it. From server-owned gear
   and skills, through the SAME combat.js functions every fight is priced by. */
const NEUTRAL_FOE = Object.freeze({});
export function heroSnapshot(state, c) {
  const roll = playerCombatRolls(NEUTRAL_FOE, { eq: c.eq, equipment: c.equipment, items: c.items, skills: state.skills,
    bonus: c.bonus, setBonus: c.setBonus, profile: c.profile });
  /* `def` is the monster's TO-HIT roll: the Defense skill, the gear outside the armour weights
     (combat.js guardB: a shield, a cape) and a defence buff. `mit` is what the armour does to a
     blow that lands (ruling K7, src/core/mitigation.js), at the hero's Level now. */
  const def = Math.floor((Number(levelsOf(state.skills).defense) || 1) + (Number(c.eq.guardB) || 0) + (Number(c.bonus('defense')) || 0));
  const mit = mitigationFor(c.equipment, c.items, charLevelFromXp(state.levelXp));
  return { acc: Math.round(roll.accuracy * 1000), maxHit: Math.max(1, Math.floor(roll.maxHit)), def, mit };
}

/* THE SET A FIGHT IS PRICED BY (Tyler 2026-10-23: runes fuel SPELLS only, caster basics cost mana): the
   worn set with a RUNE in the ammo slot taken out, so a loaded rune adds nothing to any blow, the snapshot
   or the character sheet (src/data/runes.js isRune). Every other occupant stays. */
export function combatWorn(equipment, items) {
  const e = equipment || {};
  if (!e.ammo || !isRune(items && items[e.ammo])) return e;
  const o = Object.assign({}, e);
  delete o.ammo;
  return o;
}

/* THE LOADOUT a hero fights with: the worn set's stats, its armour-set bonus
   and the stat profile its weapon family reads, from server state. One assembly
   for the hunt member and the character sheet (./character-sheet.js), so the
   sheet shows the numbers a fight is priced by (both pass combatWorn's set). There
   is no combat style to pick: the weapon family is the style (CORE_MODEL.md §4). */
export function loadoutOf(equipment, items) {
  const eq = equipmentStats(equipment, items);
  return { eq, setBonus: armorSetBonus(equipment, items), profile: deriveProfile(eq.weaponType) };
}

/* A member's vitals at its state NOW (src/core/vitals.js), into the state the engine reads. */
function applyVitals(state, equipment, items) {
  const v = vitalsOf({ levelXp: state.levelXp, skills: state.skills, equipment, items });
  state.playerMaxHp = Math.max(state.playerMaxHp || 0, v.maxHp);
  state.playerMaxMana = Math.max(state.playerMaxMana || 0, v.maxMana);
  state.regenPm = v.regenPm;
}

/* ONE MEMBER'S SIDE OF THE SPAN: its state, its value sinks and the counters
   its delta is built from. The fx handlers are the ONE set every fight's value
   flows through (tests/goal-counters.mjs anchors them). */
export function memberSide(mi, ctx) {
  const items = ctx.items;
  /* `let`: a spent whetstone swaps the loadout mid-hunt (the hone, below); the seam reads these live.
     The set a fight prices: a loaded rune is no ammo (combatWorn), so the hero's `ammo` is never a rune. */
  let equipment = combatWorn(mi.equipment, items);
  let { eq, setBonus, profile } = loadoutOf(equipment, items);
  const skills0 = {};
  for (const k in (mi.skills || {})) skills0[k] = nat(mi.skills[k], 0);
  const levelXp0 = Math.floor(nat(mi.levelXp, 0));
  const xpFrac0 = normaliseXpFrac(mi.xpFrac);
  const state = {
    playerHp: 0,
    playerMaxHp: 0,
    playerMaxMana: 0,
    regenPm: 1000,
    levelXp: levelXp0,                       // the character's Level XP (a COPY the death debits)
    gold: 0,                                 // a DELTA accumulator (hr_apply's gold is a delta)
    skills: { ...skills0 },                  // a COPY: grantXp mutates it
    xpFrac: xpFrac0 ? { ...xpFrac0 } : undefined,
    stats: {},
    /* THE TIMED BUFF QUEUE, re-measured at every swing boundary (buffsAt below)
       from the server's absolute rows, so a buff pays exactly while it runs
       however the windows are cut (TICK-1). A hunt FIRES no buff (buff foods are
       parked; food is HP, drink is mana): it only reads the queue. */
    buffs: [],
  };
  applyVitals(state, equipment, items);
  state.playerHp = Math.min(state.playerMaxHp, Math.max(0, nat(mi.hp, state.playerMaxHp)));
  let levelGained = 0;
  const buffRows = Array.isArray(mi.buffs) ? mi.buffs : [];
  const bonus = bonusFor(mi.perks, liveBuffHost(() => state.buffs));
  const goals = makeGoalCounter();
  const bestiary = makeBestiaryCounter();
  const collection = makeCollectionCounter();
  const itemDelta = Object.create(null);
  const events = [];
  const xpGained = Object.create(null);
  const finds = [];
  const hs = newHuntSession(Object.assign({}, mi.huntSession, { tally: null, endedReason: null, endedAtMs: null,
    /* THE PURSE a store supply is paid from: the character's gold as the server
       projected it at the window start; kill coins join it as they drop. */
    purse: nat(mi.gold, 0) }));
  const fx = {
    /* SKILL XP through the SHARED grant (perks, the carried remainder). A
       Inner Flame level raises the regen rate from the next swing. */
    addXp(skillId, amt) {
      const before = Number(state.skills[skillId]) || 0;
      grantXp(state, skillId, amt, { bonus, restedQuantum: 0, authored: false });
      const applied = (Number(state.skills[skillId]) || 0) - before;
      if (applied > 0) xpGained[skillId] = (xpGained[skillId] || 0) + applied;
      hs.tally.xp[skillId] = (hs.tally.xp[skillId] || 0) + (Number(amt) || 0);
      if (skillId === 'inner_flame' && applied > 0) applyVitals(state, equipment, items);
    },
    /* LEVEL XP: the kill share xp-share.js already split, whole (Level comes from
       kills only). A Level raises max HP and max mana from the next swing. */
    addLevelXp(amt) {
      const n = Math.max(0, Math.floor(Number(amt) || 0));
      if (!n) return;
      const lv0 = charLevelFromXp(state.levelXp);
      state.levelXp += n;
      levelGained += n;
      hs.tally.xp.level = (hs.tally.xp.level || 0) + n;
      if (charLevelFromXp(state.levelXp) > lv0) applyVitals(state, equipment, items);
    },
    addItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      itemDelta[id] = (itemDelta[id] || 0) + n;
      hs.tally.loot[id] = (hs.tally.loot[id] || 0) + n;
      /* Loot the session may sell to cover a store charge joins the pool as it drops. */
      if (hs.cover[id]) hs.cover[id].avail += n;
      collection.record(id, n);
    },
    /* The coins a kill drops are in the purse at once: a store use later in the
       same window may spend them (the database credits them in the same settle,
       before the buys are debited). */
    onLoot(gp) {
      const g = Math.max(0, Math.floor(Number(gp) || 0));
      hs.tally.coins += g;
      hs.purse = Math.max(0, Math.floor(Number(hs.purse) || 0)) + g;
    },
    onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },
    /* THE HEARTHFIND: a CLAIM; hr_apply re-derives everything about it. */
    onHearthfind(f) { if (f && f.item) finds.push({ item: f.item, source_kind: f.kind, source_id: f.id }); },
    /* THE GOAL / BESTIARY COUNTERS, fed from the kill seams (kept separate:
       one aggregate, one per-monster count, never double-counted). */
    updateQuest(type, amt, meta) {
      goals.quest(type, amt == null ? 1 : amt);
      bestiary.record(type, amt == null ? 1 : amt, meta);
    },
  };
  const h = mi.hero || {};
  const snapCtx = { eq, equipment, items, bonus, setBonus, profile };
  /* THE HONE (src/core/ammo.js honeOf, lane c-work-fixes 2026-10-22): a whetstone is worn by this
     hero's swing clock (honeWornAt over the persisted swing index) from the hunt's own stock, and it
     pays its bonus only while the hunt still carries one: a spent or unpacked stone is the bare
     loadout from that swing on. Both paths build the member here, so the server's settle and the
     browser's live view wear the same stone on the same swing. */
  const hone = honeOf(equipment, items);
  const honePer = hone ? ammoPerShot(items[hone]) : 0;
  const honeLeft = () => (hone && hs.bag[hone] ? Math.max(0, Math.floor(Number(hs.bag[hone].left) || 0)) : 0);
  const unhone = () => {
    equipment = Object.assign({}, equipment);
    delete equipment.ammo;
    ({ eq, setBonus, profile } = loadoutOf(equipment, items));
    Object.assign(snapCtx, { eq, equipment, setBonus, profile });
  };
  if (hone && honeLeft() <= 0) unhone();
  const wear = (atMs) => {
    if (!hone || equipment.ammo !== hone) return;
    const n = Math.min(honeLeft(), honeWornAt(hs.swingIndex, honePer));
    for (let i = 0; i < n; i++) takeLine(hs, { id: hone, source: 'own' }, atMs);
    if (honeLeft() <= 0) unhone();
  };
  /* THE ENGINE SEAM a blow is priced through (tests/trophy-call-sites.mjs lifts
     and executes these two lines): the hero's rolls AGAINST the monster it
     swings at — accuracy over the monster's defence and the weapon weakness —
     and the weakness the drops and damage read. */
  const rollsVs = (m) => playerCombatRolls(m, { eq, equipment, items, skills: state.skills, bonus, setBonus, profile });
  const weakness = (m) => weaknessInfo(m, eq);
  /* ⟦end engine seam⟧ */
  /* THE ITEM A SHOT SPENT PRICES ITS BLOW (src/core/hunt/damage.js blow): the same rolls with `ammo` in
     the ammo slot instead of the loaded one (null = none: a caster's bare swing once its runes are
     spent). `m` null = the neutral foe, the snapshot's max hit. One loadout per ammo id, rebuilt when the
     worn set changes (a spent whetstone, unhone above); skills and buffs are read live, as rollsVs reads them. */
  /* `sharePm` (permille, default 1000): the share of the ammo's bonus the shot gets — a STORE shot is its
     crafted partner's basic version (supply-basics.js BASIC_EFFECT_SHARE; combat.js ammoShare). */
  let shotSet = null; let shotLoadouts = null;
  const shotRolls = (m, ammo, sharePm) => {
    if (shotSet !== equipment) { shotSet = equipment; shotLoadouts = new Map(); }
    const k = typeof ammo === 'string' ? ammo : '';
    let l = shotLoadouts.get(k);
    if (!l) {
      const e = Object.assign({}, equipment);
      if (k) e.ammo = k; else delete e.ammo;
      l = Object.assign({ equipment: e }, loadoutOf(e, items));
      shotLoadouts.set(k, l);
    }
    const share = Number.isInteger(sharePm) && sharePm >= 0 && sharePm < 1000 ? { ammoShare: sharePm / 1000 } : {};
    return playerCombatRolls(m || NEUTRAL_FOE, Object.assign({ eq: l.eq, equipment: l.equipment, items, skills: state.skills, bonus, setBonus: l.setBonus, profile: l.profile }, share));
  };
  return {
    mi, hs, state, fx, eq, skills0, levelXp0, levelGained: () => levelGained, xpFrac0, catalogue: items, goals, bestiary, collection, itemDelta, events, xpGained, finds,
    member: {
      key: mi.key, seat: mi.seat, unitId: Number.isInteger(mi.unitId) ? mi.unitId : null, hs, state, fx,
      /* Wears the whetstone at this member's boundary (combat-sim, before the unit re-reads its snapshot). */
      wear,
      /* THE XP ROUTE INPUTS (hunt-rewards.js): the weapon family, whether any armour
         is worn (Defense trains only then; a shield counts) and whether the hero holds a
         shield in its off-hand (its blocks train extra), whatever its role: a crossbow
         Ranger behind a shield blocks too (Tyler 2026-10-23). */
      family: eq.weaponType,
      armoured: wearsArmour(equipment, items),
      shield: holdsShield(equipment, items),
      buffsAt: (atMs) => { state.buffs = buffQueueFromServer(buffRows, atMs); },
      bonus, weakness, rollsVs, shotRolls,
      /* THE RELIC MULTIPLIER (lane c-bestiary): the member's OWN account_bestiary.relic_mult
         { monster kind: mult } (mi.relicMults, server-side only: drops are never rolled for the
         browser), read by hunt-rewards.js as lead.relicMult(kind); 1 when absent, clamped to
         [1, RELIC_MULT_MAX]. */
      relicMult: (kind) => {
        const r = mi.relicMults && typeof mi.relicMults === 'object' ? mi.relicMults : null;
        const v = r && Object.prototype.hasOwnProperty.call(r, kind) ? Number(r[kind]) : NaN;
        return Number.isFinite(v) ? Math.min(RELIC_MULT_MAX, Math.max(1, v)) : 1;
      },
      snapshot: (st) => heroSnapshot(st, snapCtx),
      hero: { role: h.role, element: h.element || '', settings: h.settings || null,
        slots: h.slots || [], stopRules: h.stopRules || [], density: h.density || 0, lead: h.lead === true,
        hold: Number.isInteger(h.hold) ? h.hold : null,
        leaveTogether: h.leaveTogether === true,
        actionSet: h.actionSet || 'hunt', range: h.range || 1, ammo: equipment.ammo || null },
    },
  };
}


/* ── ONE PURSE PER ACCOUNT (Tyler 2026-10-23; 2026-12-15-account-gold.sql) ──────
   Gold is the ACCOUNT's, so the heroes of one account in one instance spend ONE purse,
   in time order: the coins any of them loots, a sale any of them makes and a store use
   any of them buys move the same gold, and each use keeps the purse at its OWN hero's
   floor (action-rules.js floorOf). The settle reads every member's state in one
   statement, so their start purses agree; the first side's is kept. The database pays
   the window's store bills after every member's credits (hr_hunt_apply_instance), which
   this time order keeps payable. Links each grouped side's session purse to one box. */
export function sharePurses(sides) {
  const byUser = new Map();
  for (const s of sides || []) {
    const u = s && s.mi && s.mi.user != null ? String(s.mi.user) : null;
    if (u === null || !s.hs) continue;
    if (!byUser.has(u)) byUser.set(u, []);
    byUser.get(u).push(s);
  }
  for (const group of byUser.values()) {
    if (group.length < 2) continue;
    const box = { gold: Math.max(0, Math.floor(Number(group[0].hs.purse) || 0)) };
    for (const s of group) {
      Object.defineProperty(s.hs, 'purse', { get: () => box.gold, set: (v) => { box.gold = v; }, enumerable: true, configurable: true });
    }
  }
  return sides;
}

/* ── A PARTY MEMBER AS THE VIEWER'S BROWSER SEES IT (Tyler 2026-10-20) ──────────
   hunt_live gives the viewer its OWN member's full setup, but every OTHER member only
   the numbers the engine needs to simulate and draw it, frozen at the block's boundary:
   its vitals, its blow and defence (the snapshot), its rolls against each monster
   kind the ground fields (snap: acc, maxHit, def and its armour's mitigation, mitigation.js),
   its weapon family / armour / shield, its hunt setup (role,
   settings, bar, range) and its supply session (bag counts, the store catalogue, its
   pending ends). Never its skills, gear, perks, buffs, premium, purse, cover list,
   stamina or bestiary. FROZEN_KEYS / FROZEN_SESSION_KEYS are the allowlist
   (tests/hunt-live.mjs LV-P).
   EVERY INPUT THE ENGINE READS OFF A HERO, AS A NUMBER (Andy #64/#65, live v0.2.45: match 0 in a
   4-hero party, every commit re-seeded): `lv` is the LEVEL (never the XP) of each skill its bar's
   abilities grow with (abilitySkill: a spell's version and output, Tyler 10-23; a status's
   scalesWith), so a peer's Fireball lands as hard in the browser as on the server; `shots` is its
   blow priced by every item its attack lane can spend other than the worn ammo as worn (a bar's
   other arrows, and any store shot at the store's share: member shotRolls), so a peer shooting
   store arrows hits as it does on the server. Without them a peer cast at Magic 1 and shot at its
   worn arrows' strength, and the prediction left the server's world at nearly every commit. */
export const FROZEN_KEYS = Object.freeze(['hp', 'maxHp', 'maxMana', 'regenPm', 'snap', 'vs', 'family', 'armoured', 'shield', 'hero', 'session', 'lv', 'shots']);
export const FROZEN_SESSION_KEYS = Object.freeze(['huntFromMs', 'nextSwingAtMs', 'swingIndex', 'bag', 'basics', 'shop',
  'supplySource', 'onEmpty', 'goldFloor', 'leaveAtMs', 'changeAtMs', 'stopAtMs', 'kicked']);
const finiteOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/* The store's share of a shot's bonus, permille (damage.js BASIC_SHOT_PM: a store shot is its partner's basic version). */
const STORE_SHOT_PM = Math.round(BASIC_EFFECT_SHARE * 1000);
/* A shot's key in the frozen `shots` table: the item it spent and its share (1000 = carried, whole). */
const shotKey = (ammo, sharePm) => String(ammo) + '|' + (Number.isInteger(sharePm) && sharePm >= 0 && sharePm < 1000 ? sharePm : 1000);
/* One roll against a monster, as the frozen row keeps it (frozenSide gives it back in playerCombatRolls' shape). */
const vsRow = (r) => ({ accuracy: finiteOr(r.accuracy, 0), critChance: finiteOr(r.critChance, 0), damageMult: finiteOr(r.weak && r.weak.damageMult, 1) });

/** The skills whose LEVEL the engine reads for a hero running `slots` (heroSlots rows): each ability's own skill and its status's scalesWith. */
export function engineSkillsOf(slots) {
  const out = new Set();
  for (const r of Array.isArray(slots) ? slots : []) {
    const a = r && r.slot && r.slot.action;
    const row = a && a.type === 'ability' ? ABILITIES[a.id] : null;
    if (!row) continue;
    out.add(abilitySkill(row));
    const st = row.status ? STATUSES[row.status] : null;
    if (st && typeof st.scalesWith === 'string') out.add(st.scalesWith);
  }
  return Array.from(out).sort();
}

/** The items a hero's attack lane can price a blow by (every attack slot's item and the worn ammo), sorted. */
function shotItemsOf(hero) {
  const out = new Set();
  for (const r of Array.isArray(hero.slots) ? hero.slots : []) {
    const a = r && r.slot && r.slot.action;
    if (a && LANE_OF[a.type] === 'attack' && typeof a.id === 'string') out.add(a.id === 'loaded' ? hero.ammo : a.id);
  }
  if (hero.ammo) out.add(hero.ammo);
  out.delete(null); out.delete(undefined);
  return Array.from(out).sort();
}

/** The frozen numbers of an assembled member side at server instant `atMs`, against the monster `kinds`. */
export function frozenOf(side, kinds, atMs) {
  const m = side.member;
  if (typeof m.buffsAt === 'function') m.buffsAt(atMs);
  const snap = m.snapshot(m.state);
  const vs = {};
  for (const k of kinds) {
    const row = MONSTERS[k];
    const r = row ? m.rollsVs(row) : null;
    if (r) vs[k] = vsRow(r);
  }
  const lv = {};
  for (const k of engineSkillsOf(m.hero.slots)) lv[k] = levelOf(m.state.skills, k);
  /* damage.js blow: a shot spending the worn ammo whole is the worn rolls (snap / vs); every other is shotRolls'. */
  const shots = {};
  if (typeof m.shotRolls === 'function') {
    for (const id of shotItemsOf(m.hero)) {
      for (const pm of [1000, STORE_SHOT_PM]) {
        if (pm === 1000 && id === m.hero.ammo) continue;
        const share = pm < 1000 ? pm : undefined;
        const base = m.shotRolls(null, id, share);
        const per = {};
        for (const k of kinds) if (MONSTERS[k]) per[k] = vsRow(m.shotRolls(MONSTERS[k], id, share));
        shots[shotKey(id, share)] = { maxHit: finiteOr(base && base.maxHit, 1), vs: per };
      }
    }
  }
  const hs = side.mi.huntSession || {};
  const session = {};
  for (const k of FROZEN_SESSION_KEYS) if (hs[k] !== undefined) session[k] = hs[k];
  return { hp: m.state.playerHp, maxHp: m.state.playerMaxHp, maxMana: m.state.playerMaxMana, regenPm: m.state.regenPm,
    snap: { acc: snap.acc, maxHit: snap.maxHit, def: snap.def, mit: snap.mit || NO_MITIGATION }, vs, family: m.family, armoured: m.armoured === true,
    shield: m.shield === true, hero: m.hero, session, lv, shots };
}

/* A monster ROW back to its kind (damage.js hands rollsVs the row). */
const KIND_OF = new Map(Object.entries(MONSTERS).map(([k, row]) => [row, k]));

/** The engine member of a frozen row (the browser's peer): its numbers, an inert fx, an unbounded purse. */
export function frozenSide(row) {
  const f = row.frozen || {};
  /* Each frozen LEVEL back as the XP that reaches it (levelOf gives the level back exactly): the engine reads levels only. */
  const skills = {};
  for (const [k, lv] of Object.entries(f.lv && typeof f.lv === 'object' ? f.lv : {})) if (Number.isInteger(lv) && lv >= 1) skills[k] = skillXpForLevel(k, lv);
  const state = { playerHp: f.hp, playerMaxHp: f.maxHp, playerMaxMana: f.maxMana, regenPm: f.regenPm,
    levelXp: 0, gold: 0, skills, stats: {}, buffs: [] };
  const hs = newHuntSession(Object.assign({}, f.session, { purse: Number.MAX_SAFE_INTEGER, cover: {}, staminaMs: null,
    tally: null, endedReason: null, endedAtMs: null }));
  const snap = f.snap || { acc: 0, maxHit: 1, def: 0, mit: NO_MITIGATION };
  const vs = f.vs || {};
  const shots = f.shots && typeof f.shots === 'object' ? f.shots : {};
  const rolled = (v) => ({ accuracy: v.accuracy, critChance: v.critChance, weak: { damageMult: v.damageMult } });
  const member = {
    key: row.key, seat: row.seat, unitId: Number.isInteger(row.unitId) ? row.unitId : null, hs, state, fx: {},
    family: f.family, armoured: f.armoured === true, shield: f.shield === true,
    bonus: () => 0, weakness: () => ({ dropMult: 1, damageMult: 1 }), relicMult: () => 1,
    rollsVs: (r) => {
      const v = vs[KIND_OF.get(r)];
      return v ? rolled(v) : null;
    },
    /* A blow priced by a shot the frozen row holds (frozenOf `shots`); one it does not hold is the worn
       rolls, as before (the server's commit then reconciles it). `m` null = the neutral foe: the max hit. */
    shotRolls: (m, ammo, sharePm) => {
      const s = shots[shotKey(ammo, sharePm)];
      if (m === null || m === undefined) return { maxHit: s ? s.maxHit : snap.maxHit };
      const v = s ? s.vs[KIND_OF.get(m)] : vs[KIND_OF.get(m)];
      return v ? rolled(v) : { accuracy: snap.acc / 1000, critChance: 0, weak: { damageMult: 1 } };
    },
    snapshot: () => snap,
    hero: f.hero || {},
  };
  return { mi: row, hs, state, member };
}
