// ════════════════════════════════════════════════════════════════════════
// src/session/party-intents.js — THE PARTY VERBS OF THE ONE-WAY FLOW.
//
// PARTY_SPEC.md (2026-10-19) and supabase/migrations/2026-10-28-party-flow.sql.
// The verbs CharacterSession already carries (invite by name, accept / decline,
// leave, kick, join, the finder) stay there; these are the ones the new flow
// adds, each ONE intent naming only this character's slot and a hunt id or an
// own slot (never a user id, never a number of the server's):
//   startPartyHunt(account, cs, hunt)   the leader picks the ground at Start;
//                                       every member walks in, or nobody
//                                       (`not_ready` names each seat and why)
//   disbandParty(account, cs)           the leader closes the party, in town
//   inviteOwn(account, cs, otherSlot)   one of this account's own characters
//                                       joins at once (no accept step)
//   invitePlayer(account, cs, id, slot) a player by the account id the menu target
//                                       carries (a name may be the "Adventurer" fallback)
//   listParty(account, cs, on)          the leader shows the party in the
//                                       finder or hides it (private = invite only)
//   setHoldSeat(account, cs, seat)      the leader picks who holds the pack: a
//                                       tank's seat, or null (take turns)
//   afterLeave(account, cs, send)       a CharacterSession leave / kick, then
//                                       the account's other partied characters
//                                       re-read too
// A party verb changes the records of every one of this account's characters
// in that party, so on ok each of them (and the character that joined) is
// RE-READ: the screen shows only the server's answer, never a prediction.
// Each verb is ONE ask in the account's intent ledger (cs.intents, intent-ledger.js)
// from its send until those re-reads are applied: the pressed control waits on it.
// ════════════════════════════════════════════════════════════════════════
import { partyMembershipOf } from './party-sections.js?v=0.2.32';
import { askVia } from './intent-ledger.js?v=0.2.32';

const HUNT_ID = /^[a-z0-9_]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLOT = 5;
const newIdem = () => globalThis.crypto.randomUUID();

/** The account's open characters seated in the same party as `cs` (cs included), by the server's party id. */
export function partyPeersOf(account, cs) {
  const p = partyMembershipOf(cs);
  const all = account && typeof account.characters === 'function' ? account.characters() : [cs];
  if (!p) return [cs];
  return all.filter((o) => o === cs || (partyMembershipOf(o) || {}).id === p.id);
}

/* The not_ready seats as the server named them: [{ seat, name, error }] (bounded, strings only). */
function seatsOf(b) {
  if (!Array.isArray(b.seats)) return [];
  return b.seats.slice(0, 8).filter((s) => s && typeof s === 'object').map((s) => ({
    seat: Number.isInteger(s.seat) ? s.seat : null,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : 'A member',
    error: typeof s.error === 'string' ? s.error.slice(0, 40) : 'refused',
    hunt: typeof s.hunt === 'string' && HUNT_ID.test(s.hunt) ? s.hunt : null,
  }));
}

/* One answer: on ok every touched character is re-read; a refusal re-reads nobody and carries the server's detail. */
async function settled(ans, reread) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) {
    await Promise.all(Array.from(new Set(reread)).filter((o) => o && o.status !== 'closed').map((o) => o.load()));
    return { ok: true };
  }
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', seats: seatsOf(b),
    name: typeof b.name === 'string' ? b.name.slice(0, 40) : null };
}

/* The town activities a hunt replaces (the server makes them yield; settling first through the engine pays the
   stretch since their last settle, which SQL cannot). */
const TOWN_KINDS = Object.freeze(['gather', 'artisan', 'training']);

/**
 * Before a hunt: an own character still gathering, on an artisan run or training is stopped through the engine
 * (set_activity idle collects before it switches), so what it earned is paid. A refusal here does not stop the
 * hunt: the server makes the activity yield anyway.
 */
export async function settleTownActivity(cs) {
  const st = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  if (!st || !TOWN_KINDS.includes(st.active_kind) || typeof cs.edgeIntent !== 'function') return { ok: true, skipped: true };
  try { return await cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }); } catch (e) { return { ok: false, error: 'network' }; }
}

const usable = (account, cs) => !!account && !!account.server && !!cs && cs.status !== 'closed';

/** The leader starts the party's hunt on `hunt`: every member with its own saved setup, or the server says who is not ready. */
export async function startPartyHunt(account, cs, hunt) {
  if (!usable(account, cs) || !HUNT_ID.test(String(hunt))) return { ok: false, error: 'bad_intent', seats: [] };
  const peers = partyPeersOf(account, cs);
  return askVia(cs, 'hunt_party_start', async () => {
    for (const o of peers) await settleTownActivity(o);
    return settled(await account.server.rpc('hr_hunt_party_start', { p_slot: cs.slot, p_hunt: hunt, p_idem: newIdem() }), peers);
  });
}

/** The leader closes the party (in town only; the server refuses `party_hunting` otherwise). */
export async function disbandParty(account, cs) {
  if (!usable(account, cs)) return { ok: false, error: 'bad_intent', seats: [] };
  const peers = partyPeersOf(account, cs);
  return askVia(cs, 'hunt_party_disband', async () => settled(await account.server.rpc('hr_hunt_party_disband', { p_slot: cs.slot, p_idem: newIdem() }), peers));
}

/** One of this account's own characters joins `cs`'s party at once (the party is made if `cs` has none). */
export async function inviteOwn(account, cs, otherSlot) {
  if (!usable(account, cs) || !Number.isInteger(otherSlot) || otherSlot < 0 || otherSlot > MAX_SLOT || otherSlot === cs.slot) {
    return { ok: false, error: 'bad_intent', seats: [] };
  }
  const other = typeof account.character === 'function' ? account.character(otherSlot) : null;
  const peers = partyPeersOf(account, cs).concat(other ? [other] : []);
  return askVia(cs, 'hunt_party_invite_own', async () => settled(await account.server.rpc('hr_hunt_party_invite_own', { p_slot: cs.slot, p_other_slot: otherSlot, p_idem: newIdem() }), peers));
}

/**
 * Invite the player a menu targets, by the SERVER's account id it carries (and its character slot when the
 * target names one: town and hunt peers do; a friend row does not, and the server picks). Works for a player
 * with no claimed name, whom no name can find (live v0.2.11).
 */
export async function invitePlayer(account, cs, userId, slot) {
  if (!usable(account, cs) || !UUID.test(String(userId)) || (slot !== null && slot !== undefined && !(Number.isInteger(slot) && slot >= 0 && slot <= MAX_SLOT))) {
    return { ok: false, error: 'bad_intent', seats: [] };
  }
  const peers = partyPeersOf(account, cs);
  return askVia(cs, 'hunt_party_invite_player', async () => settled(await account.server.rpc('hr_hunt_party_invite_player', { p_slot: cs.slot, p_target: String(userId), p_target_slot: Number.isInteger(slot) ? slot : null, p_idem: newIdem() }), peers));
}

/** The leader shows its party in the finder (`on`) or hides it; until listed, a party is joined by invite only. */
export async function listParty(account, cs, on) {
  if (!usable(account, cs) || typeof on !== 'boolean') return { ok: false, error: 'bad_intent', seats: [] };
  const peers = partyPeersOf(account, cs);
  return askVia(cs, 'hunt_party_list', async () => settled(await account.server.rpc('hr_hunt_party_list', { p_slot: cs.slot, p_listed: on, p_idem: newIdem() }), peers));
}

/**
 * WHO HOLDS THE PACK (Tyler 2026-10-22): the leader names a tank's seat (One tank holds) or null (Take turns).
 * The server checks the leader, the seat and that it is a tank (not_leader / bad_seat / not_a_tank); the
 * engine applies it at the next lap.
 */
export async function setHoldSeat(account, cs, seat) {
  if (!usable(account, cs) || !(seat === null || (Number.isInteger(seat) && seat >= 0 && seat <= 7))) return { ok: false, error: 'bad_intent', seats: [] };
  const peers = partyPeersOf(account, cs);
  return askVia(cs, 'party_hold_set', async () => settled(await account.server.rpc('hr_party_hold_set', { p_slot: cs.slot, p_seat: seat, p_idem: newIdem() }), peers));
}

/**
 * A CharacterSession party verb (`send()`, which re-reads `cs` itself), then the
 * account's other characters that sat in that party re-read too.
 */
export async function afterLeave(account, cs, send) {
  const peers = partyPeersOf(account, cs).filter((o) => o !== cs);
  return askVia(cs, 'party_reread', async () => {
    const r = await send();
    if (r && r.ok) await Promise.all(peers.filter((o) => o.status !== 'closed').map((o) => o.load()));
    return r;
  });
}
