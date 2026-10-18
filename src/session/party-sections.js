// ════════════════════════════════════════════════════════════════════════
// src/session/party-sections.js — THE PARTY, THE INVITES, THE ACCOUNT'S LIMIT,
// AND WHAT EACH CHARACTER IS DOING, READ SAFELY.
//
// PURE. Like hunt-sections.js, this only READS the record a CharacterSession
// holds; null means "show nothing / keep the control off", never a default.
//
// What the S1 server projects (supabase/migrations/2026-10-23-hunt-party.sql,
// hr_hunt_party_view, on lane/s1-hunt-server):
//   party   { id, hunt, max, leader: seat, me: seat,
//             seats: [{ seat, weapon, role, name, hunting, hp, max_hp, dealt, healed }] }
// What this lane asks the server for (CONFLICTS.md 2026-10-18 party UI; the
// fixture is tests/fixtures/party-envelope.json):
//   party_invites  [{ id, party, hunt, from }]      invites to THIS character
//   account        { max_concurrent }               the account's concurrent-play
//                                                   limit (read by AccountSession.limit)
// The finder's answer (hr_hunt_party_finder) is read by finderRows.
//
// The role is ALWAYS roleForWeapon(weapon, pick) from src/data/hunt-roles.js:
// the server's `role` is only the pick, kept when the weapon allows it.
// ════════════════════════════════════════════════════════════════════════

import { roleForWeapon, WEAPON_ROLES } from '../data/hunt-roles.js?v=0.1.0';
import { HUNT_INDEX } from '../data/hunts.js?v=0.1.0';
import { huntOf, staminaOf } from './hunt-sections.js?v=0.1.0';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HUNT = /^[a-z0-9_]{1,64}$/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const seatNo = (v) => (Number.isInteger(v) && v >= 0 && v <= 7 ? v : null);
const name = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : 'Adventurer');
const weapon = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPON_ROLES, v) ? v : null);

function read(cs, key) {
  const v = cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
  return v;
}

function seatOf(s) {
  if (!isObj(s) || seatNo(s.seat) === null) return null;
  const w = weapon(s.weapon);
  return {
    seat: s.seat, name: name(s.name), weapon: w, role: roleForWeapon(w, typeof s.role === 'string' ? s.role : null),
    hunting: s.hunting === true, hp: num(s.hp), hpMax: num(s.max_hp), dealt: num(s.dealt), healed: num(s.healed),
  };
}

/** `party` as S1 projects it: this character's own party, or null when it is in none. */
export function partyMembershipOf(cs) {
  const p = read(cs, 'party');
  if (!isObj(p) || typeof p.id !== 'string' || !UUID.test(p.id) || !Array.isArray(p.seats)) return null;
  const seats = p.seats.slice(0, 8).map(seatOf).filter(Boolean).sort((a, b) => a.seat - b.seat);
  const me = seatNo(p.me);
  if (me === null || !seats.some((s) => s.seat === me)) return null;
  const max = Number.isInteger(p.max) && p.max >= 1 && p.max <= 8 ? p.max : null;
  return {
    id: p.id, hunt: typeof p.hunt === 'string' && HUNT.test(p.hunt) ? p.hunt : null, max,
    leader: seatNo(p.leader), me, seats,
    isLeader: seatNo(p.leader) === me,
    anyHunting: seats.some((s) => s.hunting),
    full: max !== null && seats.length >= max,
  };
}

/** `party_invites`: invites waiting for THIS character, or null when the server sends none. */
export function invitesOf(cs) {
  const v = read(cs, 'party_invites');
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const i of v.slice(0, 16)) {
    if (!isObj(i) || typeof i.id !== 'string' || !UUID.test(i.id)) continue;
    out.push({ id: i.id, hunt: typeof i.hunt === 'string' && HUNT.test(i.hunt) ? i.hunt : null, from: name(i.from) });
  }
  return out;
}

/** The finder's answer as rows: [{ id, hunt, max, seats: [{ seat, weapon, role, name }] }]. */
export function finderRows(body) {
  if (!isObj(body) || body.ok !== true || !Array.isArray(body.parties)) return null;
  const out = [];
  for (const p of body.parties.slice(0, 50)) {
    if (!isObj(p) || typeof p.id !== 'string' || !UUID.test(p.id)) continue;
    const seats = (Array.isArray(p.seats) ? p.seats.slice(0, 8) : []).map(seatOf).filter(Boolean);
    out.push({ id: p.id, hunt: typeof p.hunt === 'string' && HUNT.test(p.hunt) ? p.hunt : null,
      max: Number.isInteger(p.max) ? p.max : null, seats });
  }
  return out;
}

/** A hunt's player-facing name. */
export function huntName(id) { return (id && HUNT_INDEX[id] && HUNT_INDEX[id].name) || 'a hunt'; }

/**
 * What a character is doing, as the server says: { kind: 'hunting'|'idle'|'busy'|'unknown', where, text }.
 * A hunt the server still holds open is "hunting"; an idle state is "in town".
 */
export function assignmentOf(cs) {
  const h = huntOf(cs);
  if (h && !h.ended) return { kind: 'hunting', where: h.huntId, text: 'Hunting in ' + huntName(h.huntId) };
  const st = read(cs, 'state');
  if (!isObj(st)) return { kind: 'unknown', where: null, text: 'Not read yet' };
  if (st.active_kind === 'combat' && typeof st.active_id === 'string') return { kind: 'hunting', where: st.active_id, text: 'Hunting in ' + huntName(st.active_id) };
  if (!st.active_kind || st.active_kind === 'idle') return { kind: 'idle', where: null, text: h && h.ended ? 'In town, the hunt is over' : 'In town, idle' };
  const what = String(st.active_kind).replace(/_/g, ' ');
  return { kind: 'busy', where: null, text: 'In town, ' + what };
}

/** HP, mana and stamina as the server says: the hunt hero's when hunting, else the character's own state. */
export function vitalsOf(cs) {
  const h = huntOf(cs);
  const st = isObj(read(cs, 'state')) ? read(cs, 'state') : {};
  const hero = h && !h.ended ? h.hero : null;
  const s = staminaOf(cs);
  return {
    hp: hero ? hero.hp : num(st.hp), hpMax: hero ? hero.hpMax : num(st.max_hp),
    mana: hero ? hero.mana : num(st.mana), manaMax: hero ? hero.manaMax : num(st.max_mana),
    staminaMs: s ? s.msLeft : null, staminaCapMs: s ? s.capMs : null,
  };
}

/** The hunt role this character's weapon plays: roleForWeapon over the server's `role` section, else its party seat's. */
export function roleIdOf(cs) {
  const r = read(cs, 'role');
  if (isObj(r)) {
    const id = roleForWeapon(weapon(r.weapon), typeof r.id === 'string' ? r.id : null);
    if (id) return id;
  }
  const p = partyMembershipOf(cs);
  const mine = p && p.seats.find((s) => s.seat === p.me);
  return mine ? mine.role : null;
}
