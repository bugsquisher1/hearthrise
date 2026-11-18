// ════════════════════════════════════════════════════════════════════════
// src/session/faction-intents.js — THE FACTIONS' FOUR PRESSES (supabase/migrations/2027-04-22-faction-standing.sql).
//
// Each is ONE intent naming only this character's slot, a side or a piece id, and a fresh key. Never a number: the server reads the
// Krell count, the standing, the swap time and the cooldown itself, under the hero's lock, on its own clock. On ok the character is
// RE-READ, so the Faction tab changes only from the envelope.
//   joinFaction(account, cs, side)      hr_faction_join          refuses join_locked, already_joined, feature_off
//   startSwap(account, cs, side)        hr_faction_swap_start    refuses swap_cooldown { ready_at }, swap_open, same_faction
//   finishSwap(account, cs)             hr_faction_swap_finish   refuses swap_short { need_ms, have_ms }, no_swap
//   claimPiece(account, cs, piece)      hr_faction_outfit_claim  refuses standing_short { need_ms, have_ms }, piece_owned
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.138';

const WORD = /^[a-z0-9_]{1,32}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const bodyOf = (ans) => (ans && isObj(ans.body) ? ans.body : {});
const newIdem = () => globalThis.crypto.randomUUID();
/* Refusals that mean the screen was behind the server: the character is re-read so the tab shows what the server holds. */
const RE_READS = Object.freeze(['already_joined', 'not_member', 'swap_open', 'no_swap', 'swap_cooldown', 'piece_owned', 'feature_off', 'join_locked']);

/* A refused answer, with the figures the server sent (src/shell/faction-words.js says them). */
function refused(ans, verb) {
  const b = bodyOf(ans);
  const readyAt = typeof b.ready_at === 'string' && Number.isFinite(Date.parse(b.ready_at)) ? Date.parse(b.ready_at) : null;
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    piece: typeof b.piece === 'string' && WORD.test(b.piece) ? b.piece : null, needMs: nat(b.need_ms), haveMs: nat(b.have_ms), readyAt };
}

/* One verb: the ask (its RPC named where it is called), then the re-read on ok. */
function send(cs, verb, ask) {
  return askVia(cs, verb, async () => {
    const ans = await ask();
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) {
      const r = refused(ans, verb);
      if (RE_READS.includes(r.error) && cs.status !== 'closed' && typeof cs.load === 'function') await cs.load();
      return r;
    }
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true };
  });
}

const bad = (verb) => Promise.resolve({ ok: false, error: 'bad_intent', verb });

/** Join a side, once. */
export function joinFaction(account, cs, side) {
  if (!usable(account, cs) || !WORD.test(String(side))) return bad('faction_join');
  return send(cs, 'faction_join', () => account.server.rpc('hr_faction_join', { p_slot: cs.slot, p_faction: side, p_idem: newIdem() }));
}

/** Start a swap to the other side. */
export function startSwap(account, cs, side) {
  if (!usable(account, cs) || !WORD.test(String(side))) return bad('faction_swap_start');
  return send(cs, 'faction_swap_start', () => account.server.rpc('hr_faction_swap_start', { p_slot: cs.slot, p_faction: side, p_idem: newIdem() }));
}

/** Finish the open swap once the server has credited its hunting time. */
export function finishSwap(account, cs) {
  if (!usable(account, cs)) return bad('faction_swap_finish');
  return send(cs, 'faction_swap_finish', () => account.server.rpc('hr_faction_swap_finish', { p_slot: cs.slot, p_idem: newIdem() }));
}

/** Claim one outfit piece the hero's standing has earned. */
export function claimPiece(account, cs, piece) {
  if (!usable(account, cs) || !WORD.test(String(piece))) return bad('faction_outfit_claim');
  return send(cs, 'faction_outfit_claim', () => account.server.rpc('hr_faction_outfit_claim', { p_slot: cs.slot, p_piece: piece, p_idem: newIdem() }));
}
