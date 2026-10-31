// ════════════════════════════════════════════════════════════════════════
// src/session/honor-roll.js — ONE BOARD OF THE ROLL OF HONOR, AS THE SERVER RANKS IT.
//
//   readBoard(account, cs, board)  ONE hr_leaderboard read (2027-02-12-leaderboard-heroes.sql):
//                                  the board's top heroes and every one of this account's heroes
//                                  on it, each with the heroes either side. A read the player asked
//                                  for (opening the window, picking a board), tracked in the
//                                  account's ledger (askVia) like her board in Tamsin's tally.
//   parseBoard(body)               that answer, checked field by field and frozen; null when it
//                                  is not the server's shape (the window then says so, it never
//                                  invents a row).
// The client sends a board id and a row count; it authors no name, place, level or score. Every
// number shown is the server's (CLAUDE.md §1, §6): the place (shared on a tie), the level, the score
// and when the boards were last rebuilt. No account id crosses: the server marks the caller's own
// heroes (`mine`, with their slot) and nobody else's.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.76';
import { HONOR_TOP, honorBoard } from '../data/honor-roll.js?v=0.2.76';

const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const NAME_MAX = 40;

/* One ranked row: rank (strict order), place (shared on a tie), name, level, score; mine + slot on the caller's own. */
function rowOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const rank = count(r.rank), place = count(r.place), level = count(r.level), score = count(r.score);
  if (!rank || !place || level === null || score === null || typeof r.name !== 'string' || !r.name) return null;
  const mine = r.mine === true && Number.isInteger(r.slot) && r.slot >= 0 && r.slot <= 5;
  return Object.freeze({ rank, place, name: r.name.slice(0, NAME_MAX), level, score, mine, slot: mine ? r.slot : null });
}
const rowsOf = (a) => Object.freeze((Array.isArray(a) ? a : []).map(rowOf).filter(Boolean).sort((x, y) => x.rank - y.rank));

/**
 * The server's answer as the window reads it, or null when it is not that shape.
 * @returns {null|{board:string, available:boolean, refreshedAt:number|null, total:number, top:object[], mine:object[]}}
 */
export function parseBoard(body) {
  if (!body || typeof body !== 'object' || body.ok !== true || typeof body.board !== 'string') return null;
  const at = typeof body.refreshed_at === 'string' ? Date.parse(body.refreshed_at) : NaN;
  const mine = (Array.isArray(body.mine) ? body.mine : []).map((m) => {
    const r = rowOf(m);
    return r && r.mine ? Object.freeze(Object.assign({}, r, { near: rowsOf(m.near) })) : null;
  }).filter(Boolean);
  return Object.freeze({
    board: body.board,
    available: body.available === true,
    refreshedAt: Number.isFinite(at) ? at : null,
    total: count(body.total) || 0,
    top: rowsOf(body.top),
    mine: Object.freeze(mine),
  });
}

/** One board, read: { ok: true, roll } or { ok: false, error }. Only a board this client offers is asked for. */
export function readBoard(account, cs, board) {
  if (!account || !account.server || !cs || !honorBoard(board)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'honor_roll', async () => {
    const ans = await account.server.rpc('hr_leaderboard', { p_board: board, p_limit: HONOR_TOP, p_span: 1 });
    const b = ans && ans.body && typeof ans.body === 'object' && !Array.isArray(ans.body) ? ans.body : {};
    const roll = ans && ans.ok ? parseBoard(b) : null;
    if (!roll || roll.board !== board) return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    return { ok: true, roll };
  });
}
