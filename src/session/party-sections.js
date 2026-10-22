// ════════════════════════════════════════════════════════════════════════
// src/session/party-sections.js — THE PARTY, THE INVITES, THE ACCOUNT'S LIMIT,
// AND WHAT EACH CHARACTER IS DOING, READ SAFELY.
//
// PURE. Like hunt-sections.js, this only READS the record a CharacterSession
// holds; null means "show nothing / keep the control off", never a default.
//
// What the S1 server projects (supabase/migrations/2026-10-23-hunt-party.sql,
// hr_hunt_party_view; ONE shape, also read by hunt-sections.js partyOf):
//   party   { id, hunt, max, open, listed, leader: unit, self: unit, leader_seat, self_seat,
//             members: [{ unit, seat, hunting, name, level, weapon, role_pick, hp, hp_max, mana,
//                         mana_max, dealt, healed, dps, hps, down, eating, drinking, aggro,
//                         away, seat_ms, outfit }], leader_density }   (away / seat_ms: 2026-10-28-party-flow.sql;
//             leader_density: the leader's density pick, 2026-11-01-party-leader-density.sql; outfit
//             { id, colors } or null: 2026-11-04-party-outfits.sql, read by hunt-sections.js memberOf)
//   (a solo hunt is a party of one with id null: no party membership here)
// The finder's answer (hr_hunt_party_finder) keeps its own { seats: [{ seat, weapon, role, name }] }.
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

import { roleForWeapon, WEAPON_ROLES } from '../data/hunt-roles.js?v=0.2.25';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.25';
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js?v=0.2.25';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.25';
import { huntOf, staminaOf } from './hunt-sections.js?v=0.2.25';
import { heroVitalsOf } from './character-sections.js?v=0.2.25';

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
  const pick = typeof s.role_pick === 'string' ? s.role_pick : typeof s.role === 'string' ? s.role : null;
  return {
    seat: s.seat, name: name(s.name), weapon: w, role: roleForWeapon(w, pick),
    hunting: s.hunting === true, hp: num(s.hp), hpMax: num(s.hp_max), dealt: num(s.dealt), healed: num(s.healed),
    level: Number.isInteger(s.level) && s.level >= 0 ? s.level : null,
    /* 2026-10-28-party-flow.sql: an away member keeps its seat for `seat_ms` more (ms; null when not away). */
    away: s.away === true, seatMs: s.away === true && num(s.seat_ms) !== null && s.seat_ms >= 0 ? s.seat_ms : null,
  };
}

/** `party` as S1 projects it: this character's own party, or null when it is in none. */
export function partyMembershipOf(cs) {
  const p = read(cs, 'party');
  if (!isObj(p) || typeof p.id !== 'string' || !UUID.test(p.id) || !Array.isArray(p.members)) return null;
  const seats = p.members.slice(0, 8).map(seatOf).filter(Boolean).sort((a, b) => a.seat - b.seat);
  const me = seatNo(p.self_seat);
  if (me === null || !seats.some((s) => s.seat === me)) return null;
  const max = Number.isInteger(p.max) && p.max >= 1 && p.max <= 8 ? p.max : null;
  return {
    id: p.id, hunt: typeof p.hunt === 'string' && HUNT.test(p.hunt) ? p.hunt : null, max,
    leader: seatNo(p.leader_seat), me, seats,
    isLeader: seatNo(p.leader_seat) === me,
    /* THE LEADER CHOOSES THE HUNT SETTINGS (Tyler 2026-10-20): its density pick is the party's pull,
       shown read-only to the others; null when the server did not say. */
    density: Number.isInteger(p.leader_density) && p.leader_density >= 0 ? p.leader_density : null,
    leaderName: (seats.find((s) => s.seat === seatNo(p.leader_seat)) || {}).name || null,
    anyHunting: seats.some((s) => s.hunting),
    full: max !== null && seats.length >= max,
  };
}

/**
 * `party_people` (2026-10-25-social.sql hr_social_party_view): who sits in each
 * seat of this character's party, with the SERVER's account id, as the player
 * menu targets them: Map(seat -> { id, slot, name }). Empty when the server sends none.
 */
export function partyPeopleOf(cs) {
  const v = read(cs, 'party_people');
  const out = new Map();
  if (!Array.isArray(v)) return out;
  for (const p of v.slice(0, 8)) {
    if (!isObj(p) || seatNo(p.seat) === null || typeof p.user !== 'string' || !UUID.test(p.user)) continue;
    out.set(p.seat, { id: p.user, slot: Number.isInteger(p.slot) ? p.slot : null, name: name(p.name) });
  }
  return out;
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

/* A town activity in words, keyed kind:id (the catalogue the engine runs); a row it does not know falls back to its kind. */
const TOWN_WORDS = new Map([
  ...TREES.map((n) => ['gather:' + n.id, 'chopping the ' + n.name]),
  ...ROCKS.map((n) => ['gather:' + n.id, 'mining the ' + n.name]),
  ...FISH_SPOTS.map((n) => ['gather:' + n.id, 'fishing at the ' + n.name]),
  ...Object.values(ARTISAN_RECIPES).flat().map((r) => ['artisan:' + r.id, 'working on ' + r.name]),
]);
const TOWN_KIND_WORDS = Object.freeze({ gather: 'gathering', artisan: 'at a workbench', training: 'training' });

/** The town activity the server's pointer names ("fishing at the Shrimp Spot"), or null when there is none. Pure. */
export function townActivityWords(st) {
  if (!isObj(st) || !Object.prototype.hasOwnProperty.call(TOWN_KIND_WORDS, st.active_kind)) return null;
  return TOWN_WORDS.get(st.active_kind + ':' + st.active_id) || TOWN_KIND_WORDS[st.active_kind];
}

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
  const what = townActivityWords(st) || String(st.active_kind).replace(/_/g, ' ');
  return { kind: 'busy', where: null, text: 'In town, ' + what };
}

/** HP, mana and stamina as the server says: HP and mana from character-sections.js heroVitalsOf (the
    one reader the HUD and the Character tab share, r09), stamina from staminaOf. */
export function vitalsOf(cs) {
  const v = heroVitalsOf(cs);
  const s = staminaOf(cs);
  return {
    hp: v.hp, hpMax: v.hpMax, mana: v.mana, manaMax: v.manaMax,
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
