// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-sections.js — THE HUNT'S ENVELOPE SECTIONS, READ SAFELY.
//
// PURE. HUNT_SCREEN_SPEC §1.5: the server projects six hunt sections into a
// character's envelope (hunt, hunt_analyzer, hunt_settings, party, premium,
// stamina). Each one is REPLACED whole by every envelope (src/session/envelope.js
// E1/E2); this module only READS the record the CharacterSession holds and
// answers each section in the shape the panels draw, or null when the server
// did not send it or sent something malformed. Null always means "show
// nothing", never "show a default": a missing number is not invented.
//
// The shapes below are the SERVER's (lane S1: hr_hunt_section_view,
// hr_hunt_settings_view, hr_hunt_analyzer_view, hr_hunt_party_view,
// hr_stamina_view, hr_premium_view); tests/envelope-contract.mjs feeds the real
// projections through these readers, and tests/fixtures/hunt-envelope.json
// follows the same shapes.
// A field this reader does not know is ignored; a field it needs and cannot
// read makes that ROW null, not the whole section.
// ════════════════════════════════════════════════════════════════════════

import { roleForWeapon } from '../data/hunt-roles.js?v=0.2.25';
import { VITALS } from '../data/core-model.js?v=0.2.25';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.length <= 200 ? v : null);
const bool = (v) => v === true;
const list = (v, fn, max = 64) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);
const counts = (v) => {
  const out = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (num(n) !== null && k.length <= 64) out[k] = n;
  return out;
};

function section(cs, key) {
  const v = cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
  return isObj(v) ? v : null;
}

/* The pose's units as unit id -> { kind, side, boss, name, hp, hpMax }: the log's names, the scene's bars. */
function unitsOf(pose) {
  const out = new Map();
  for (const u of isObj(pose) ? list(pose.units, (x) => x, 64) : []) {
    if (isObj(u) && int(u.u) !== null) out.set(u.u, { kind: str(u.kind), side: u.side === 'hero' ? 'hero' : 'monster', boss: bool(u.boss), name: str(u.name),
      hp: num(u.hp), hpMax: num(u.hp_max) });
  }
  return out;
}

/** The pending leave's server instant (ms) of a raw `hunt` section, or null (none asked, or the hunt is over). */
export function leaveAtOf(h) {
  if (!isObj(h) || bool(h.ended) || !isObj(h.session) || !str(h.session.leave_at)) return null;
  const ms = Date.parse(h.session.leave_at);
  return Number.isFinite(ms) ? ms : null;
}

/** `hunt`: the session (and why it ended), the viewed hero's vitals and the instance's units (who is who). */
export function huntOf(cs) {
  const h = section(cs, 'hunt');
  if (!h || !str(h.session_id)) return null;
  const hero = isObj(h.hero) ? h.hero : {};
  return {
    sessionId: h.session_id,
    huntId: str(h.hunt_id),
    ended: bool(h.ended),
    endReason: isObj(h.session) ? str(h.session.end_reason) : null,
    /* When the hunt's engine starts (the end of the travel, hr_hunt_travel): before it the hero walks. */
    huntFromMs: isObj(h.session) && str(h.session.hunt_from) ? Date.parse(h.session.hunt_from) || null : null,
    units: unitsOf(h.pose),
    hero: {
      unit: int(hero.unit), name: str(hero.name), level: int(hero.level),
      hp: num(hero.hp), hpMax: num(hero.hp_max), mana: num(hero.mana), manaMax: num(hero.mana_max),
      shield: num(hero.shield),
      xpPct: num(hero.xp_pct), regenPm: int(hero.regen_pm),
      /* PER SECOND, the rates the engine runs while the hunt fights (src/core/hunt/pull-cycle.js
         tickHeroes; src/core/hunt/abilities.js mana): HP at VITALS.inFightRegenPermillePerS of the
         server's max HP, mana the server's per-minute figure (Prayer's regen_pm is in both). */
      hpPerS: num(hero.hp_max) !== null && int(hero.regen_pm) !== null
        ? (hero.hp_max * VITALS.inFightRegenPermillePerS * hero.regen_pm) / 1e6 : null,
      manaPerS: num(hero.mana_regen) !== null ? hero.mana_regen / 60 : null,
    },
  };
}

const ACTION = /^(ability|consume|attack_with_item)$/;
const JOIN = /^(and|or)$/;

function conditionOf(c) {
  if (!isObj(c) || !str(c.metric) || !str(c.op)) return null;
  const v = c.value;
  const value = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? v : str(v);
  return { metric: c.metric, op: c.op, value, subject: str(c.subject) };
}

/* One bar slot: the server's action + conditions (the wire shape the editor sends back,
   src/data/condition-metrics.js), plus its display fields (usable, mana, count). */
function slotOf(s) {
  if (!isObj(s) || !isObj(s.action) || !ACTION.test(String(s.action.type)) || !str(s.action.id)) return { empty: true };
  const conditions = list(s.conditions, conditionOf, 4);
  return {
    /* `id`: the rule's STABLE id (the server's; the hunt summary names a decision by it). */
    empty: false, id: str(s.id), item: s.action.id, action: { type: s.action.type, id: s.action.id },
    conditions, join: JOIN.test(String(s.join)) ? s.join : 'and',
    usable: s.usable !== false, mana: int(s.mana), count: int(s.count),
  };
}

/** A slot back in the wire shape (null = empty), for an intent that restates the bar. */
export function wireSlot(s) {
  if (!s || s.empty) return null;
  return { action: { type: s.action.type, id: s.action.id },
    conditions: s.conditions.map((c) => Object.assign({ metric: c.metric, op: c.op, value: c.value }, c.subject ? { subject: c.subject } : {})),
    join: s.join };
}

/** `hunt_settings`: the per-hero options of the active preset, and its bar. */
export function settingsOf(cs) {
  const s = section(cs, 'hunt_settings');
  if (!s || int(s.preset) === null) return null;
  return {
    preset: s.preset,
    /* The hunt role the worn weapon gives (the server's; the ability list follows it). */
    role: str(s.role),
    presets: list(s.presets, (p) => (isObj(p) && int(p.preset) !== null && str(p.name) ? { preset: p.preset, name: p.name } : null), 8),
    targetMode: str(s.target_mode), stance: str(s.stance), distance: int(s.distance),
    chase: typeof s.chase === 'boolean' ? s.chase : null,
    foodPct: int(s.food_pct), drinkPct: int(s.drink_pct), supplySource: str(s.supply_source), onEmpty: str(s.on_empty),
    /* The gold the store never spends below (hunt_settings.gold_floor; null until hr_hunt_settings_view projects it). */
    goldFloor: int(s.gold_floor),
    /* Monster density (the pick; the settle clamps it to the ground) and the gathering share (INERT until gathering lands). */
    density: int(s.density), gatherShare: int(s.gather_share), gatherInert: s.gather_inert === true,
    stopRules: list(s.stop_rules, (r) => (isObj(r) && Array.isArray(r.conditions) ? { conditions: list(r.conditions, conditionOf, 4), join: JOIN.test(String(r.join)) ? r.join : 'and', forMs: int(r.forMs) || 0 } : null), 3),
    grounds: list(s.grounds, (g) => str(g), 32),
    slots: Array.isArray(s.slots) ? s.slots.slice(0, 20).map(slotOf) : [],
  };
}

/* The outfit a member wears, as the party section names it ({ id, colors }: 2026-11-04-party-outfits.sql,
   the walker's shape in town), or null: the hunt draws it in its role's outfit then. */
const OUTFIT_ID = /^[a-z0-9_]{1,32}$/;
const outfitIdOf = (o) => (isObj(o) && typeof o.id === 'string' && OUTFIT_ID.test(o.id) ? o.id : null);

/**
 * THE HP A HUNT UNIT SHOWS NOW: the character's timeline at its display clock (timeline.js
 * hpAt, T6), the one number the hero's bar over its head reads, or null (no timeline, no
 * unit, nothing booked yet). Every HP readout of a hunting hero reads it so none lags the
 * bar: the envelope's `hp` is the last commit's, up to a commit window old (Andy 2026-10-21,
 * the Warrens: the hub and the party panel showed the HP of seconds before the death).
 */
export function liveHpOf(cs, unit) {
  const tl = cs && cs.timeline;
  if (!Number.isInteger(unit) || !tl || typeof tl.hpAt !== 'function' || typeof cs.now !== 'function') return null;
  const r = tl.hpAt(unit, cs.now());
  return r && Number.isFinite(r.hp) && Number.isFinite(r.maxHp) && r.maxHp > 0 ? r : null;
}

/* A party member. `unit` is its hero in the hunt instance, null while the party is in town (it is
   listed all the same: the Party panel shows the party wherever it is). */
function memberOf(m) {
  if (!isObj(m) || int(m.seat) === null) return null;
  return {
    unit: int(m.unit), seat: m.seat, name: str(m.name) || 'Hero', level: int(m.level), outfit: outfitIdOf(m.outfit),
    role: roleForWeapon(str(m.weapon), str(m.role_pick)),
    hp: num(m.hp), hpMax: num(m.hp_max), mana: num(m.mana), manaMax: num(m.mana_max), staminaMs: num(m.stamina_ms),
    dealt: num(m.dealt), healed: num(m.healed), dps: num(m.dps), hps: num(m.hps),
    eating: bool(m.eating), drinking: bool(m.drinking), aggro: bool(m.aggro),
  };
}

/** `party`: own membership plus instance-scoped peers. A solo hunt is a party of one. */
export function partyOf(cs) {
  const p = section(cs, 'party');
  if (!p) return null;
  const members = list(p.members, memberOf, 8);
  if (!members.length) return null;
  return { leader: int(p.leader), self: int(p.self), leaderSeat: int(p.leader_seat), selfSeat: int(p.self_seat), open: p.open !== false, members };
}

/** `premium`: is THIS character premium right now, as the server says. Fails safe to false. */
export function isPremium(cs) {
  const p = section(cs, 'premium');
  return !!p && p.active === true;
}

/** `stamina` (hr_stamina_view { ms, at, max_ms, hunting }): the pool at `at` and the cap, ms. */
export function staminaOf(cs) {
  const s = section(cs, 'stamina');
  if (!s || num(s.ms) === null) return null;
  const at = typeof s.at === 'string' ? Date.parse(s.at) : NaN;
  return { msLeft: s.ms, capMs: num(s.max_ms), atMs: Number.isFinite(at) ? at : null, hunting: bool(s.hunting) };
}

/* A per-skill XP object summed (the analyzer's totals), or the number itself; null when neither. */
const total = (v) => {
  if (num(v) !== null) return v;
  if (!isObj(v)) return null;
  let t = 0;
  for (const n of Object.values(v)) if (num(n) !== null) t += n;
  return t;
};
/* { item: count } as rows, largest first (ties by id). */
const rowsOf = (o, fn) => Object.entries(counts(o)).filter(([k]) => str(k)).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 100).map(fn);

/* One analyzer view (hr_hunt_analyzer: kills, xp {skill: n}, raw_xp {skill: n}, gold, waste, balance,
   per_hour, supplies { own: {item: n}, store: {item: n}, store_gold }, loot {item: n}, taken / dealt
   { total, byMonster | byAbility, byElement }). */
function viewOf(v) {
  if (!isObj(v)) return null;
  const ph = isObj(v.per_hour) ? v.per_hour : {};
  const sup = isObj(v.supplies) ? v.supplies : {};
  const tk = isObj(v.taken) ? v.taken : {};
  const dl = isObj(v.dealt) ? v.dealt : {};
  return {
    kills: num(v.kills), xp: total(v.xp), rawXp: total(v.raw_xp), gold: num(v.gold), waste: num(v.waste), balance: num(v.balance),
    /* `rated`: the server sent rates. It sends none (per_hour null) until the session has
       ANALYZER_RATE_AFTER_MS of wall time (2026-11-06-hunt-analyzer-min-window.sql). */
    rated: isObj(v.per_hour),
    perHour: { xp: total(ph.xp), rawXp: total(ph.raw_xp), gold: num(ph.gold), waste: num(ph.waste), balance: num(ph.balance) },
    supplies: rowsOf(sup.own, ([item, n]) => ({ item, source: 'own', count: n, gold: 0 }))
      .concat(rowsOf(sup.store, ([item, n]) => ({ item, source: 'store', count: n, gold: null }))),
    loot: rowsOf(v.loot, ([item, n]) => ({ item, count: n, value: null })),
    takenByMonster: counts(tk.byMonster), takenByElement: counts(tk.byElement),
    dealtByAbility: counts(dl.byAbility), dealtByElement: counts(dl.byElement),
  };
}

/** `hunt_analyzer`: the server's session stats, hero and party. Null for a free character or no hunt. */
export function analyzerOf(cs) {
  const a = section(cs, 'hunt_analyzer');
  if (!a) return null;
  const hero = viewOf(a.hero);
  if (!hero) return null;
  /* The next Level (Level is not a skill): the server's `hero.level.eta_h` (hours). Never a skill's eta, which the server
     floors at 0 once the skill is maxed; a 0 or absent eta is unknown and reads null (the widget shows the dash). */
  const lvEta = isObj(a.hero.level) ? num(a.hero.level.eta_h) : null;
  const next = lvEta !== null && lvEta > 0 ? Math.round(lvEta * 3600000) : null;
  const sess = isObj(a.session) ? a.session : {};
  const settled = str(sess.settled_to) ? Date.parse(sess.settled_to) : NaN;
  return { sessionMs: num(a.hunt_ms), settledMs: Number.isFinite(settled) ? settled : null, nextLevelMs: next,
    ended: typeof sess.ended_at === 'string', hero, party: viewOf(a.party) };
}

/** A character's server clock now (ms), or null before it has one or for a reader without one. */
export const serverNowOf = (cs) => (cs && typeof cs.serverNow === 'function' ? cs.serverNow() : null);

/**
 * THE HUNT'S SESSION CLOCK (ms) at the server instant `serverNowMs` (CharacterSession.serverNow): the
 * server's `hunt_ms` is the time hunted up to its last settle (`settled_to`), so the clock runs on from
 * THAT instant on the server's clock. Every answer restates the same instant, so the clock never steps
 * back (live v0.2.23, Andy: it ran from the answer's arrival and fell back by the settle lag, up to 10 s,
 * on every answer between settles). An ended hunt, or no server clock yet, reads `hunt_ms` as sent. Pure.
 * @param {ReturnType<typeof analyzerOf>} a
 * @param {number|null} serverNowMs
 */
export function sessionClockMs(a, serverNowMs) {
  if (!a || a.sessionMs === null) return null;
  if (a.ended || a.settledMs === null || !Number.isFinite(serverNowMs)) return a.sessionMs;
  return a.sessionMs + Math.max(0, serverNowMs - a.settledMs);
}
