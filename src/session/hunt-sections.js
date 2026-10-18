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
// The shapes below are the client's reading of the spec while the S1 server
// lane finishes the sections; tests/fixtures/hunt-envelope.json is the fixture.
// A field this reader does not know is ignored; a field it needs and cannot
// read makes that ROW null, not the whole section.
// ════════════════════════════════════════════════════════════════════════

import { roleForWeapon } from '../data/hunt-roles.js?v=0.1.0';

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

/* The pose's units as unit id -> { kind, side, boss }: the combat log's names. */
function unitsOf(pose) {
  const out = new Map();
  for (const u of isObj(pose) ? list(pose.units, (x) => x, 64) : []) {
    if (isObj(u) && int(u.u) !== null) out.set(u.u, { kind: str(u.kind), side: u.side === 'hero' ? 'hero' : 'monster', boss: bool(u.boss), name: str(u.name) });
  }
  return out;
}

/** `hunt`: the session, the viewed hero's vitals and the instance's units (who is who). */
export function huntOf(cs) {
  const h = section(cs, 'hunt');
  if (!h || !str(h.session_id)) return null;
  const hero = isObj(h.hero) ? h.hero : {};
  return {
    sessionId: h.session_id,
    huntId: str(h.hunt_id),
    ended: bool(h.ended),
    units: unitsOf(h.pose),
    hero: {
      unit: int(hero.unit), name: str(hero.name), level: int(hero.level),
      hp: num(hero.hp), hpMax: num(hero.hp_max), mana: num(hero.mana), manaMax: num(hero.mana_max),
      hpRegen: num(hero.hp_regen), manaRegen: num(hero.mana_regen), shield: num(hero.shield),
      xpPct: num(hero.xp_pct), falls: int(hero.falls),
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
  const conditions = list(s.conditions, conditionOf, 3);
  return {
    empty: false, item: s.action.id, action: { type: s.action.type, id: s.action.id },
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
    presets: list(s.presets, (p) => (isObj(p) && int(p.preset) !== null && str(p.name) ? { preset: p.preset, name: p.name } : null), 8),
    targetMode: str(s.target_mode), stance: str(s.stance), distance: int(s.distance),
    chase: typeof s.chase === 'boolean' ? s.chase : null,
    foodPct: int(s.food_pct), drinkPct: int(s.drink_pct), supplySource: str(s.supply_source), onEmpty: str(s.on_empty),
    slots: Array.isArray(s.slots) ? s.slots.slice(0, 20).map(slotOf) : [],
  };
}

function memberOf(m) {
  if (!isObj(m) || int(m.unit) === null) return null;
  return {
    unit: m.unit, name: str(m.name) || 'Hero', level: int(m.level),
    role: roleForWeapon(str(m.weapon), str(m.role_pick)),
    hp: num(m.hp), hpMax: num(m.hp_max), mana: num(m.mana), manaMax: num(m.mana_max), staminaMs: num(m.stamina_ms),
    dealt: num(m.dealt), healed: num(m.healed), dps: num(m.dps), hps: num(m.hps),
    down: bool(m.down), eating: bool(m.eating), drinking: bool(m.drinking), aggro: bool(m.aggro),
  };
}

/** `party`: own membership plus instance-scoped peers. A solo hunt is a party of one. */
export function partyOf(cs) {
  const p = section(cs, 'party');
  if (!p) return null;
  const members = list(p.members, memberOf, 8);
  if (!members.length) return null;
  return { leader: int(p.leader), self: int(p.self), open: p.open !== false, members };
}

/** `premium`: is THIS character premium right now, as the server says. Fails safe to false. */
export function isPremium(cs) {
  const p = section(cs, 'premium');
  return !!p && p.active === true;
}

/** `stamina`: time left and the cap, ms. */
export function staminaOf(cs) {
  const s = section(cs, 'stamina');
  if (!s || num(s.ms_left) === null) return null;
  return { msLeft: s.ms_left, capMs: num(s.cap_ms) };
}

function viewOf(v) {
  if (!isObj(v)) return null;
  const ph = isObj(v.per_hour) ? v.per_hour : {};
  const lines = (a, fn) => list(a, fn, 100);
  return {
    kills: num(v.kills), xp: num(v.xp), rawXp: num(v.raw_xp), gold: num(v.gold), waste: num(v.waste), balance: num(v.balance),
    perHour: { xp: num(ph.xp), rawXp: num(ph.raw_xp), gold: num(ph.gold), waste: num(ph.waste), balance: num(ph.balance) },
    supplies: lines(v.supplies, (s) => (isObj(s) && str(s.item) && (s.source === 'own' || s.source === 'store')
      ? { item: s.item, source: s.source, count: num(s.count), gold: num(s.gold) } : null)),
    loot: lines(v.loot, (l) => (isObj(l) && str(l.item) ? { item: l.item, count: num(l.count), value: num(l.value) } : null)),
    takenByMonster: counts(v.taken && v.taken.by_monster), takenByElement: counts(v.taken && v.taken.by_element),
    dealtByAbility: counts(v.dealt && v.dealt.by_ability), dealtByElement: counts(v.dealt && v.dealt.by_element),
  };
}

/** `hunt_analyzer`: the server's session stats, hero and party. Null for a free character or no hunt. */
export function analyzerOf(cs) {
  const a = section(cs, 'hunt_analyzer');
  if (!a) return null;
  const hero = viewOf(a.hero);
  if (!hero) return null;
  return { sessionMs: num(a.session_ms), nextLevelMs: num(a.next_level_ms), ended: bool(a.ended), hero, party: viewOf(a.party) };
}
