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

import { roleForWeapon } from '../data/hunt-roles.js?v=0.2.35';
import { VITALS } from '../data/core-model.js?v=0.2.35';

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
   src/data/condition-metrics.js), plus its display fields (usable, why, mana, count). */
function slotOf(s) {
  if (!isObj(s) || !isObj(s.action) || !ACTION.test(String(s.action.type)) || !str(s.action.id)) return { empty: true };
  const conditions = list(s.conditions, conditionOf, 4);
  return {
    /* `id`: the rule's STABLE id (the server's; the hunt summary names a decision by it). */
    empty: false, id: str(s.id), item: s.action.id,
    /* `store`: the store row the PLAYER chose to back this slot (Tyler 2026-10-19), when it names one. */
    action: Object.assign({ type: s.action.type, id: s.action.id }, str(s.action.store) ? { store: s.action.store } : {}),
    conditions, join: JOIN.test(String(s.join)) ? s.join : 'and',
    usable: s.usable !== false, mana: int(s.mana), count: int(s.count),
    /* WHY THE SERVER STRUCK IT (hr_hunt_settings_view): none_left (own stock gone) | store_off; null when it can fire. */
    why: str(s.why),
  };
}

/** A slot back in the wire shape (null = empty), for an intent that restates the bar. */
export function wireSlot(s) {
  if (!s || s.empty) return null;
  return { action: Object.assign({ type: s.action.type, id: s.action.id }, s.action.store ? { store: s.action.store } : {}),
    conditions: s.conditions.map((c) => Object.assign({ metric: c.metric, op: c.op, value: c.value }, c.subject ? { subject: c.subject } : {})),
    join: s.join };
}

/**
 * THE SUPPLIES AN OPEN HUNT CARRIES, [{ id, qty }] largest first: the server's hunt bag
 * (`hunt.session.bag`, each line's `left`). Enter MOVES the supplies out of the bag into it
 * (hr_hunt_enter_for), so while a hunt runs the bag no longer holds them: every count of what
 * the hero can eat or drink reads this (Brannoc 10-22: "Food ×0" with 20 Cooked Shrimp in the
 * hunt bag). Null when no hunt is open (the bag holds them then). Replaced by each envelope. Pure.
 */
export function huntBagOf(cs) {
  const h = section(cs, 'hunt');
  if (!h || !str(h.session_id) || bool(h.ended) || !isObj(h.session) || !Array.isArray(h.session.bag)) return null;
  return h.session.bag.slice(0, 64)
    .map((l) => (isObj(l) && str(l.item) && int(l.left) !== null && l.left > 0 ? { id: l.item, qty: l.left } : null))
    .filter(Boolean)
    .sort((a, b) => b.qty - a.qty || (a.id < b.id ? -1 : 1));
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
    /* The gathering share (INERT until gathering lands). Density is no setting: huntDensityOf, per ground. */
    gatherShare: int(s.gather_share), gatherInert: s.gather_inert === true,
    stopRules: list(s.stop_rules, (r) => (isObj(r) && Array.isArray(r.conditions) ? { conditions: list(r.conditions, conditionOf, 4), join: JOIN.test(String(r.join)) ? r.join : 'and', forMs: int(r.forMs) || 0 } : null), 3),
    grounds: list(s.grounds, (g) => str(g), 32),
    slots: Array.isArray(s.slots) ? s.slots.slice(0, 20).map(slotOf) : [],
    /* The bar as the player SAVED it (hunt_settings.bar; empty for a new hero, whose shown bar is the start kit's). */
    storedBar: Array.isArray(s.bar) ? s.bar.slice(0, 20).filter(isObj) : [],
    /* THE STORE the slots may buy from, as the SERVER prices it (hr_hunt_basic_supplies via
       hr_hunt_settings_view): every number the Configure action picker shows comes from here. */
    store: list(s.store, storeRowOf, 64),
  };
}

/* One store row: { id, kind, partner, amount (HP or mana a use; 0 for ammo), price (gold a use) }. */
function storeRowOf(b) {
  if (!isObj(b) || !str(b.id) || !['heal', 'mana', 'ammo'].includes(b.kind) || !(int(b.price) > 0)) return null;
  return { id: b.id, kind: b.kind, partner: str(b.partner), amount: b.kind === 'heal' ? int(b.heals) || 0 : b.kind === 'mana' ? int(b.mana) || 0 : 0, price: b.price };
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

/* LEVEL XP AND TRAINING XP ARE NEVER ADDED TOGETHER (Tyler 2026-10-22: "divvy up level exp vs training
   exp"). The server's xp / raw_xp maps carry the Level under `level` and each combat skill under its id;
   the Level's is one figure, the skills' are the training rows (premium's Training tab). */
const levelOf = (m) => (isObj(m) ? (num(m.level) ?? 0) : null);
const trainingOf = (m) => (isObj(m) ? Object.entries(m).filter(([k]) => k !== 'level') : []);
/* A next-level eta in ms from the server's `eta_h` (hours) on a level or skill read; 0 (maxed) or absent reads null. */
const etaMs = (r) => { const h = isObj(r) ? num(r.eta_h) : null; return h !== null && h > 0 ? Math.round(h * 3600000) : null; };

/* One analyzer view (hr_hunt_analyzer: kills, xp {level|skill: n}, raw_xp {level|skill: n}, coins, loot_value,
   gold (= coins + loot_value, gold_basis 'vendor_value'), waste, balance (= gold - waste),
   per_hour { xp: Level, raw_xp: Level, training_xp: the skills, gold, waste, balance }, skills { skill: { per_hour } }
   (the hero's, premium), supplies { own: {item: n}, store: {item: n}, store_gold }, loot {item: n},
   taken / dealt { total, byMonster | byAbility, byElement }). */
function viewOf(v) {
  if (!isObj(v)) return null;
  const ph = isObj(v.per_hour) ? v.per_hour : {};
  const sup = isObj(v.supplies) ? v.supplies : {};
  const tk = isObj(v.taken) ? v.taken : {};
  const dl = isObj(v.dealt) ? v.dealt : {};
  const sk = isObj(v.skills) ? v.skills : {};
  const train = trainingOf(v.xp).filter(([k, n]) => str(k) && num(n) !== null && n > 0);
  return {
    /* GOLD IS COIN RECEIVED, never loot at its shop price (Brannoc 10-22: 5,386 gp shown, 2,443 gp credited). The
       server's `gold` is coins + loot value; the loot's unsold value is its own line, and balance keeps the server's
       definition (coins + loot value - store supplies), labelled so. */
    kills: num(v.kills), levelXp: levelOf(v.xp), rawLevelXp: levelOf(v.raw_xp), gold: num(v.coins), lootValue: num(v.loot_value),
    waste: num(v.waste), balance: num(v.balance),
    trainingXp: isObj(v.xp) ? total(Object.fromEntries(train)) : null,
    /* Each combat skill trained this session, most first: its XP and (the hero's, rated) its XP an hour and the
       time to its next level (the server's eta_h, hours; 0 = maxed and absent = unrated or the party's: null). */
    training: train.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 16)
      .map(([skill, n]) => ({ skill, xp: n, perHour: isObj(sk[skill]) ? num(sk[skill].per_hour) : null, nextMs: etaMs(sk[skill]) })),
    /* `rated`: the server sent rates. It sends none (per_hour null) until the session has
       ANALYZER_RATE_AFTER_MS of wall time (2026-11-06-hunt-analyzer-min-window.sql). */
    rated: isObj(v.per_hour),
    perHour: { levelXp: num(ph.xp), rawLevelXp: num(ph.raw_xp), trainingXp: num(ph.training_xp), goldAndLoot: num(ph.gold), waste: num(ph.waste), balance: num(ph.balance) },
    supplies: rowsOf(sup.own, ([item, n]) => ({ item, source: 'own', count: n, gold: 0 }))
      .concat(rowsOf(sup.store, ([item, n]) => ({ item, source: 'store', count: n, gold: null }))),
    loot: rowsOf(v.loot, ([item, n]) => ({ item, count: n, value: null })),
    takenByMonster: counts(tk.byMonster), takenByElement: counts(tk.byElement),
    dealtByAbility: counts(dl.byAbility), dealtByElement: counts(dl.byElement),
  };
}

/* One mode's personal best ({ xp_h, balance_h }, whole numbers an hour), or null. */
const bestOf = (b) => (isObj(b) && int(b.xp_h) !== null && int(b.balance_h) !== null ? { xpH: b.xp_h, balanceH: b.balance_h } : null);

/**
 * `hunt_bests` (hr_hunt_bests_view): THIS hero's best XP per hour and best balance per hour on each
 * ground, solo and party apart, from its finished hunts of at least `min_ms` (each figure its own best).
 * { minMs, grounds: { [hunt]: { solo: {xpH, balanceH}|null, party: ...|null } } }, or null (nothing sent).
 */
export function huntBestsOf(cs) {
  const b = section(cs, 'hunt_bests');
  if (!b || int(b.min_ms) === null || b.min_ms <= 0) return null;
  const grounds = {};
  if (isObj(b.grounds)) {
    for (const [hunt, m] of Object.entries(b.grounds).slice(0, 256)) {
      if (str(hunt) && isObj(m)) grounds[hunt] = { solo: bestOf(m.solo), party: bestOf(m.party) };
    }
  }
  return { minMs: b.min_ms, grounds };
}

/**
 * A DENSITY MAP as the server projects it ({ [hunt]: pick }, a whole number of monsters per pull, 0 = as
 * built), or null when it is not one. This hero's `hunt_density` and the party's `leader_densities`.
 */
export function densityMapOf(v) {
  if (!isObj(v)) return null;
  const out = {};
  for (const [hunt, n] of Object.entries(v).slice(0, 256)) if (str(hunt) && int(n) !== null && n >= 0) out[hunt] = n;
  return out;
}

/**
 * `hunt_density` (hr_hunt_density_view, 2026-11-17-hunt-density-home.sql): THIS hero's density pick on
 * each ground (rulings H4: chosen with the hunt, remembered per ground). A ground with no key is 0 (as
 * built); null = the server sent no section, and the picker shows no number.
 */
export function huntDensityOf(cs) {
  return densityMapOf(section(cs, 'hunt_density'));
}

/** `hunt_analyzer`: the server's session stats, hero and party. Null for a free character or no hunt. */
export function analyzerOf(cs) {
  const a = section(cs, 'hunt_analyzer');
  if (!a) return null;
  const hero = viewOf(a.hero);
  if (!hero) return null;
  /* The next Level (Level is not a skill): the server's `hero.level.eta_h` (hours). Never a skill's eta, which the server
     floors at 0 once the skill is maxed; a 0 or absent eta is unknown and reads null (the widget shows the dash). */
  const next = etaMs(a.hero.level);
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
