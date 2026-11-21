// ════════════════════════════════════════════════════════════════════════
// src/social/friend-link.js — THE FRIEND LINK AT SIGN-UP (GR-72; supabase/migrations/1038-friend-link.sql) AND QUIET PRESENCE FOR THE
// ACCOUNT (MM-20; 1039-ground-presence.sql), lane/c-social FB-12.
//
// A player shares play.html?friend=<code> (their code is the SERVER's, made on first ask). A new player who arrives by it carries the
// code through sign-up (the confirmation email returns to the same address, src/app/boot.js redirectTo) and, once signed in, asks the
// server ONCE to make them friends. The server decides whether it may (a new account, once, no block) and moves nothing else: no
// reward. The address loses the code after the ask, whatever the answer, so a reload never asks again.
//   codeOf(search)            the code a page address carries, or null (the server's shape: 10 of [a-z0-9])
//   linkOf(account)           hr_friend_link: { ok, code } (made on first ask)
//   linkUrl(base, code)       the address a player shares
//   redeem(account, code)     hr_friend_link_redeem: { ok, person } or { ok:false, error, verb: 'friend_link' }
//   setQuiet(account, on)     hr_presence_quiet_set: every hero of the account off (or back on) every list other players see
// ════════════════════════════════════════════════════════════════════════
import { askVia } from '../session/intent-ledger.js';

export const FRIEND_PARAM = 'friend';
const CODE = /^[a-z0-9]{10}$/;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** The friend code a page address carries, or null. Pure. */
export function codeOf(search) {
  try {
    const v = new URLSearchParams(String(search || '')).get(FRIEND_PARAM);
    const c = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return CODE.test(c) ? c : null;
  } catch (e) { return null; }
}

/** The address a player shares. Pure. */
export function linkUrl(base, code) { return CODE.test(String(code || '')) ? base + '?' + FRIEND_PARAM + '=' + code : null; }

/* One ask: `call(server)` names the RPC (tests/client-intent-surface.mjs reads every name this file sends). */
async function ask(account, verb, call, wordsVerb) {
  if (!account || !account.server || typeof account.server.rpc !== 'function') return { ok: false, error: 'bad_intent' };
  return askVia(account, verb, async () => {
    const ans = await call(account.server);
    const b = ans && obj(ans.body);
    if (!(ans && ans.ok && b && b.ok === true)) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb: wordsVerb };
    return { ok: true, body: b };
  });
}

/** This account's friend code. */
export async function linkOf(account) {
  const r = await ask(account, 'friend_link', (server) => server.rpc('hr_friend_link', {}), 'friend_link');
  return r.ok && CODE.test(String(r.body.code)) ? { ok: true, code: r.body.code } : r.ok ? { ok: false, error: 'refused' } : r;
}

/** Arrive by a friend's link: one ask, then the friends list is read again. */
export async function redeem(account, code) {
  if (!CODE.test(String(code || ''))) return { ok: false, error: 'bad_code', verb: 'friend_link' };
  const r = await ask(account, 'friend_link_redeem', (server) => server.rpc('hr_friend_link_redeem', { p_code: code }), 'friend_link');
  if (!r.ok) return r;
  const social = account.social;
  if (social && typeof social.reread === 'function') social.reread();
  const p = obj(r.body.person);
  return { ok: true, name: p && typeof p.name === 'string' ? p.name : null };
}

/**
 * A page opened by a friend's link, once signed in: the address loses the code first (a reload never asks again), then ONE ask.
 * Resolves to the redeem's answer, or null when the page carried no code. Display only follows: the friends list is re-read.
 */
export async function arriveByLink(win, account) {
  const code = codeOf(win && win.location ? win.location.search : '');
  if (!code) return null;
  try {
    const q = new URLSearchParams(win.location.search);
    q.delete(FRIEND_PARAM);
    const rest = q.toString();
    win.history.replaceState(null, '', win.location.pathname + (rest ? '?' + rest : ''));
  } catch (e) { /* an address the page can't rewrite keeps its code: the server answers `used` to a second ask */ }
  return redeem(account, code);
}

/** Quiet presence for every hero of the account; the setting reads back from the server's `presence` section. */
export async function setQuiet(account, on) {
  const r = await ask(account, 'presence_quiet', (server) => server.rpc('hr_presence_quiet_set', { p_quiet: !!on }), 'presence');
  return r.ok ? { ok: true, quiet: r.body.quiet === true } : r;
}
