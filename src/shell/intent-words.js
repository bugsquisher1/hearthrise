// ════════════════════════════════════════════════════════════════════════
// src/shell/intent-words.js — WHAT A REFUSED INTENT MEANS, IN PLAIN WORDS.
//
// PURE. Every item window says why the server refused, the same way. A code
// not listed reads as a plain "not done" line: the server's value stays on
// screen either way, because nothing was changed before the server answered.
// ════════════════════════════════════════════════════════════════════════

const WORDS = Object.freeze({
  rate_limited: 'Too many changes at once. Try again in a moment.',
  settle_first: 'The hunt is catching up. Try again in a few seconds.',
  network: 'No connection. Nothing was changed.',
  no_token: 'You are signed out. Sign in again to keep playing.',
  http_404: 'The server does not take this yet.',
  bad_option: 'The server does not take this yet.',
  bad_intent: 'That request was not valid, so nothing was sent.',
  insufficient_item: 'You no longer have that many.',
  insufficient_gold: 'Not enough gold.',
  item_locked: 'That item is locked. Unlock it first.',
  quote_changed: 'Prices or your bag changed. Check the new total and try again.',
  offer_unsupported: 'The shop does not sell that.',
  unknown_offer: 'The shop does not sell that.',
  unknown_item: 'The server does not know that item.',
  unknown_equip_slot: 'That item does not go in that slot.',
  not_equippable: 'That item cannot be worn.',
  wrong_slot: 'That item does not go in that slot.',
  level_too_low: 'Your skill is too low to use that yet.',
  no_bar: 'Start a hunt to set up the action bar.',
  bar_full: 'The action bar is full. Empty a slot first.',
  not_for_bar: 'Only food, drinks and ammo go on the action bar.',
  hunt_open: 'Not while a hunt is running.',
  closed: 'This character is closed.',
  /* The party (S1 hr_hunt_party_* and this lane's asks). */
  no_ground: 'That hunt is not open to parties yet.',
  already_in_party: 'This character is already in a party. Leave it first.',
  party_full: 'That party is full.',
  no_party: 'That party is gone.',
  not_leader: 'Only the party leader can do that.',
  bad_seat: 'That seat is empty now.',
  member_hunting: 'Not while that member is hunting.',
  party_hunt_mismatch: 'Your party hunts somewhere else.',
  party_hunt: 'A party hunts one ground. Leave the party to change it.',
  no_such_name: 'No character goes by that name.',
  not_ready: 'Not everyone in the party is ready.',
  no_stamina: 'No stamina left: rest first.',
  hunts_paused: 'Hunts are paused for a moment.',
  bad_weapon: 'The server does not know that weapon.',
});

/** The plain-words reason for a refusal code. */
export function refusalWords(code) {
  return WORDS[code] || 'Not done: the server refused it.';
}

/**
 * Run one intent for a window: its controls go off at once (`sc.pending`),
 * `busy` shows while the server works, and the answer's words replace it.
 * The window's numbers change only from the re-read envelope.
 * @param {{pending:boolean, msg:string}} sc   the window's scratch
 * @param {() => void} repaint
 * @param {() => Promise<{ok:boolean, error?:string}>} send
 * @param {string} busy                        e.g. 'Selling…'
 * @param {(r: object) => string} [done]       the line after a success ('' for none)
 */
export async function runIntent(sc, repaint, send, busy, done) {
  if (sc.pending) return { ok: false, error: 'busy' };
  sc.pending = true;
  sc.msg = busy;
  repaint();
  let r;
  try { r = await send(); } catch (e) { r = { ok: false, error: 'network' }; }
  sc.pending = false;
  sc.msg = r.ok ? (done ? done(r) : '') : refusalWords(r.error);
  repaint();
  return r;
}
