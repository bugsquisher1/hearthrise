// ════════════════════════════════════════════════════════════════════════
// src/session/account-leaving.js — DELETING AN ACCOUNT, AND THE WAY BACK: TWO INTENTS.
//
// The server decides everything (2027-02-25-account-delete.sql): who (its auth.uid(), so no id is sent), when
// (its clock; the date comes back in the answer) and whether the sign-in is fresh (the token's own signed `amr`).
//   requestDeletion   the password is the auth server's to check: a real sign-in, which refreshes the token the
//                     request then carries. A wrong one asks nothing of the game's server. One hr_account_delete_request.
//   keepAccount       one hr_account_keep. Moves nothing else; the page reloads to the characters screen.
// A yes to the request tells the AccountSession, and every screen gives way to the way back (boot.js showClosed).
// ════════════════════════════════════════════════════════════════════════
import { AUTH_COPY } from '../net/auth.js?v=0.2.87';
import { newIdem } from './catch-up.js?v=0.2.87';

/** What the player types, and what the server's request wants (its p_confirm). */
export const DELETE_WORD = 'DELETE';

/** Did the player type the word? Spaces and capitals don't count: a phone's keyboard picks those, not the player. Pure. */
export function wordTyped(typed) { return String(typed || '').trim().toUpperCase() === DELETE_WORD; }

const NOTHING = 'nothing was deleted';
const SAY = Object.freeze({
  word: 'Type ' + DELETE_WORD + ' to confirm.',
  password: "That password isn't right, so " + NOTHING + '.',
  stale_signin: "Your sign-in couldn't be confirmed, so " + NOTHING + '. Enter your password again.',
  rate_limited: "There've been too many tries just now. Try again in a minute.",
  network: "The server didn't answer, so " + NOTHING + '. Check your connection and try again.',
  other: "That didn't go through, so " + NOTHING + '. Try again in a minute.',
  keep_network: "The server didn't answer, so your account is still set to be deleted. Check your connection and try again.",
});

/**
 * Ask to delete this account. { ok: true } once the server holds the request (the AccountSession has been told),
 * else { ok: false, message } in plain words.
 * @param {object} account  the AccountSession
 * @param {string} password
 * @param {string} typed    what the player typed
 * @param {string} [key]    the idempotency key: the same press retried keeps it
 */
export async function requestDeletion(account, password, typed, key) {
  if (!wordTyped(typed)) return { ok: false, message: SAY.word };
  if (!password) return { ok: false, message: SAY.password };
  const proof = await account.auth.signIn(account.auth.email(), password);
  if (!proof.ok) return { ok: false, message: proof.message === AUTH_COPY.signInFailed ? SAY.password : proof.message };
  const ans = await account.server.rpc('hr_account_delete_request', { p_confirm: DELETE_WORD, p_idem: key || newIdem() });
  const body = ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans.ok && body.ok === true) { account.noteLeaving(body.purge_at); return { ok: true }; }
  if (ans.status === 0) return { ok: false, message: SAY.network };
  return { ok: false, message: SAY[body.error] || SAY.other };
}

/** Cancel the deletion. { ok: true } on the server's yes, else { ok: false, message }. */
export async function keepAccount(account, key) {
  const ans = await account.server.rpc('hr_account_keep', { p_idem: key || newIdem() });
  const body = ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans.ok && body.ok === true) return { ok: true };
  if (ans.status === 0) return { ok: false, message: SAY.keep_network };
  return { ok: false, message: SAY[body.error] || SAY.keep_network };
}
