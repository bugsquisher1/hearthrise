// ════════════════════════════════════════════════════════════════════════
// src/shell/intent-words.js — WHAT A REFUSED INTENT MEANS, IN PLAIN WORDS.
//
// PURE. Every item window says why the server refused, the same way. A code
// not listed reads as a plain "not done" line: the server's value stays on
// screen either way, because nothing was changed before the server answered.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from '../data/hunts.js?v=0.2.27';

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
  stamina_full: 'Your stamina is already full.',
  refill_limit: 'No more stamina refills today.',
  already_blessed: 'You already hold that blessing.',
  needs_previous: 'Take the blessing before it first.',
  unknown_tier: 'There is no such blessing.',
  name_taken: 'Someone already goes by that name.',
  bad_name: 'Names are 3 to 20 letters, numbers and spaces.',
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
  no_ground: 'That hunt is not open yet.',
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
  /* The one-way party flow (2026-10-28-party-flow.sql). */
  party_hunting: 'Not while your party is hunting. Wait until everyone is back in town.',
  already_member: 'They are already in your party.',
  too_many_invites: 'Too many invites are waiting. Wait for answers first.',
  invite_expired: 'That invite has run out.',
  no_invite: 'That invite has gone.',
  already_hunting: 'Everyone in the party is already hunting.',
  away: 'They are away from the game.',
  not_listed: 'That party is not open to join. Ask its leader for an invite.',
  /* Going hunting (hr_hunt_enter) and the storage (hr_bank_move). */
  activity_locked: 'Your combat level is too low for that hunt yet.',
  activity_running: 'Your hero is busy with something else (burying, say). Stop it in the Inventory first.',
  unknown_hunt: 'The server does not know that hunt.',
  unknown_preset: 'That setup is gone. Pick another under Saved setups.',
  /* Naming, saving and removing a setup (2026-11-15-preset-names.sql). */
  bad_preset_name: 'Names are 1 to 24 characters, and some words are not allowed.',
  setup_in_use: 'That setup is in use. Put another one on first.',
  unknown_supply: 'One of the things packed is not a hunt supply.',
  bad_bag: 'The packed supplies were not valid, so nothing was sent.',
  too_many_lines: 'Too many kinds of supplies packed.',
  rate_limited: 'Too fast. Wait a moment and try again.',
  bank_full: 'Your storage is full.',
  bag_full: 'Your bag is full. Make room first.',
  insufficient_bank: 'Your storage no longer has that many.',
  /* Chat and the social side (2026-10-25-chat-channels.sql, 2026-10-25-social.sql). */
  empty: 'Type something first.',
  too_long: 'That message is too long.',
  too_many_links: 'Link at most three items in one message.',
  bad_link: 'One of those item links is not a real item.',
  not_in_party: 'You are not in a party.',
  no_character: 'Pick a character first.',
  no_player: 'No player by that name.',
  self: 'That is you.',
  unavailable: 'You cannot reach that player.',
  already_friends: 'You are already friends.',
  too_many: 'Your list is full.',
  no_request: 'That request has gone.',
  read_only: 'Nothing can be typed here.',
});

/** The plain-words reason for a refusal code. */
export function refusalWords(code) {
  return WORDS[code] || 'Not done: the server refused it.';
}

/* Why one seat held the party's start back, after its name. */
const SEAT_WORDS = Object.freeze({
  away: 'is away', no_stamina: 'has no stamina left', hunt_open: 'is still hunting', activity_running: 'is busy in town',
  insufficient_item: 'is short of supplies', activity_locked: 'is too low a level for that hunt', hunts_paused: 'cannot go while hunts are paused',
});

/**
 * A refused intent in plain words, with the server's detail when it sent one. A start that waited names every seat that
 * was not ready ("Nobody went in: Mira is away; Oren has no stamina left."); an
 * own character the server named says who. Pure.
 */
export function refusalText(r) {
  const seats = r && Array.isArray(r.seats) ? r.seats : [];
  if (r && r.error === 'not_ready' && seats.length) {
    return 'Nobody went in: ' + seats.map((x) => x.name + ' ' + (x.error === 'hunt_open' && x.hunt && HUNT_INDEX[x.hunt]
      ? 'is still hunting in ' + HUNT_INDEX[x.hunt].name : SEAT_WORDS[x.error] || 'is not ready')).join('; ') + '.';
  }
  if (r && r.error === 'member_hunting' && r.name) return r.name + ' is hunting. Invite them once that hunt ends.';
  return refusalWords(r && r.error);
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
  sc.msg = r.ok ? (done ? done(r) : '') : refusalText(r);
  repaint();
  return r;
}
