// ════════════════════════════════════════════════════════════════════════
// src/net/auth.js — SIGN IN, CREATE AN ACCOUNT, RESET A PASSWORD, SIGN OUT.
//
// createAuth wraps one supabase-js client (src/net/supabase-bootstrap.js). It
// owns the account's sign-in and nothing about characters. Every answer is
// { ok, message } in plain English, never a throw.
//
// HONEST COPY, AND NO ACCOUNT PROBING. Creating an account with an email that
// already has one gets the same answer as a new one ("check your email … if you
// already have an account, sign in"), and a reset request always answers "if
// that email has an account, a link is on its way". The copy is true in every
// case and never says which emails exist.
//
// A REFUSAL SAYS WHY (Tyler 10-24: a 9-character password read "try again in a
// minute"). authErrorCopy reads supabase-js's error.code, then its status, then
// its message, and names the AUTH_COPY line that answers it: too short, leaked,
// address refused, too many tries, sign-ups closed, email not confirmed yet. Each
// call takes only the answers that cannot probe an account (sign-in tells apart
// nothing but "not confirmed yet", which the auth server says only to the right
// password); anything unknown reads as that call's own generic line.
//
// SIGN-OUT CLEARS EVERY COPY: supabase-js forgets the session, then every key
// that can hold a token on this device — the auth key in BOTH the device and
// the tab store, any `sb-*` key, the retired pre-reset keys — and the tab's
// session id, so the next sign-in is a new session.
//
// THE RECOVERY LINK: a password-reset email opens the client with a recovery
// token in the URL; supabase-js signs the link in and reports PASSWORD_RECOVERY,
// which the app turns into the set-new-password screen (onChange 'recovery').
//
// THE TOKEN EVERY SERVER CALL CARRIES (live 2026-10-20: one player's tabs sent a
// token dead for 14 h, 805 times). supabase-js stops its refresh timer while a
// tab is hidden, so the cached access token went stale and every hunt poll from
// a background tab was refused (401) and the live view starved. Now:
//   freshToken()    a token valid for at least TOKEN_MARGIN_MS more; a stale one
//                   is refreshed first. One refresh at a time, shared by every
//                   caller in the tab (all CharacterSessions use one link).
//   renewToken(bad) after a 401: a newer token if one already arrived, else one
//                   forced refresh (shared the same way).
//   A refresh the server refuses ends the session: the token is gone, every later
//   call sends nothing (no request without a token), and onChange hears
//   'expired' so the app shows sign-in. A refresh lost to the network keeps the
//   session and simply sends nothing this time.
//   Waking a hidden tab checks the token before anything else is sent.
// ════════════════════════════════════════════════════════════════════════

import { SESSION_CONFIG } from '../session/config.js?v=0.2.46';
import { PASSWORD_MIN_LENGTH } from '../data/account-rules.js?v=0.2.46';

/** A token closer than this to its expiry is refreshed before it is sent. */
export const TOKEN_MARGIN_MS = 60000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AUTH_COPY = Object.freeze({
  badEmail: 'Enter the email address for your account.',
  passwordRule: 'At least ' + PASSWORD_MIN_LENGTH + ' characters.',
  shortPassword: 'Use at least ' + PASSWORD_MIN_LENGTH + ' characters.',
  leakedPassword: 'That password has shown up in a data leak. Pick a different one.',
  weakPassword: 'That password is too easy to guess. Pick a different one.',
  samePassword: "That's the password you have now. Pick a new one.",
  mismatch: 'The two passwords do not match.',
  signInFailed: 'That email and password do not match an account.',
  notConfirmed: "Your email isn't confirmed yet. Open the link we sent you, then sign in.",
  signUpSent: 'Check your email for a link to finish creating your account. If you already have an account, sign in instead.',
  emailRefused: "That email address can't be used. Check it, or use a different one.",
  rateLimited: "There've been too many tries just now. Try again in a minute.",
  signUpsClosed: "New accounts can't be made right now. Sign-ups are closed.",
  signUpFailed: "Your account couldn't be created. Try again.",
  resetSent:'If that email has an account, a link to reset your password is on its way.',
  passwordSet: 'Your new password is saved. You are signed in.',
  passwordFailed: 'That reset link has expired. Ask for a new one from the sign-in screen.',
  network: 'Could not reach the server. Check your connection and try again.',
  signedOut: 'You were signed out. Sign in again.',
});

const fail = (message) => ({ ok: false, message });
const isNetwork = (e) => !!e && (e.status === 0 || /fetch|network/i.test(String(e.message || '')));
const isRetryable = (e) => isNetwork(e) || (!!e && e.name === 'AuthRetryableFetchError');

/* supabase-js error.code -> the AUTH_COPY line. An email that already has an account is answered
   exactly as a new one (signUpSent: "if you already have an account, sign in"), never told apart. */
const CODE_COPY = Object.freeze({
  user_already_exists: 'signUpSent', email_exists: 'signUpSent',
  email_address_invalid: 'emailRefused',
  over_email_send_rate_limit: 'rateLimited', over_request_rate_limit: 'rateLimited',
  signup_disabled: 'signUpsClosed',
  email_not_confirmed: 'notConfirmed',
  same_password: 'samePassword',
});
/* The same answers read from the message, for an answer without a code. */
const MESSAGE_COPY = Object.freeze([
  [/already (registered|exists)/i, 'signUpSent'],
  [/password should be at least/i, 'shortPassword'],
  [/pwned|data leak|leaked/i, 'leakedPassword'],
  [/signups? not allowed|signups? (are )?disabled/i, 'signUpsClosed'],
  [/invalid format|email address .*invalid/i, 'emailRefused'],
  [/rate limit/i, 'rateLimited'],
  [/email not confirmed/i, 'notConfirmed'],
]);
const WEAK_REASON_COPY = Object.freeze([['length', 'shortPassword'], ['pwned', 'leakedPassword']]);

/** The AUTH_COPY key that answers a refused auth call (by error.code, then status, then message), or null when it is unknown. */
function authErrorCopy(error) {
  if (!error) return null;
  if (isNetwork(error)) return 'network';
  const code = typeof error.code === 'string' ? error.code : '';
  const msg = String(error.message || '');
  const fromMessage = () => { for (const [re, key] of MESSAGE_COPY) if (re.test(msg)) return key; return null; };
  if (code === 'weak_password' || error.name === 'AuthWeakPasswordError') {
    const why = Array.isArray(error.reasons) ? error.reasons : [];
    for (const [reason, key] of WEAK_REASON_COPY) if (why.includes(reason)) return key;
    return fromMessage() || 'weakPassword';
  }
  if (Object.prototype.hasOwnProperty.call(CODE_COPY, code)) return CODE_COPY[code];
  if (error.status === 429) return 'rateLimited';
  return fromMessage();
}

/* What each call may tell the player; anything else reads as the call's own generic line. */
const SIGN_IN_SAYS = new Set(['network', 'rateLimited', 'notConfirmed']);
const SIGN_UP_SAYS = new Set(['network', 'shortPassword', 'leakedPassword', 'weakPassword', 'emailRefused', 'rateLimited', 'signUpsClosed', 'signUpSent']);
const NEW_PASSWORD_SAYS = new Set(['network', 'shortPassword', 'leakedPassword', 'weakPassword', 'samePassword', 'rateLimited']);
const copyFor = (error, says, other) => { const key = authErrorCopy(error); return says.has(key) ? key : other; };

/**
 * @param {object} o
 * @param {object} o.client      the supabase-js client
 * @param {object} o.device      HearthriseStorage (device store)
 * @param {object} o.tab         HearthriseStorage.session (tab store)
 * @param {string} o.redirectTo  where a reset or confirmation email sends the player back
 * @param {object} [o.config]    defaults to SESSION_CONFIG
 * @param {object} [o.doc]       the document, to check the token when a hidden tab wakes
 * @param {() => number} [o.now] the clock, for tests
 */
export function createAuth(o) {
  const cfg = o.config || SESSION_CONFIG;
  const auth = o.client.auth;
  const now = o.now || (() => Date.now());
  let session = null;
  let renewing = null;
  const changeFns = new Set();
  const tell = (ev) => { for (const fn of Array.from(changeFns)) { try { fn(ev); } catch (e) { console.error('[auth] a listener failed', e); } } };

  async function refresh() {
    try { const { data } = await auth.getSession(); session = (data && data.session) || null; } catch (e) { session = null; }
    return session;
  }

  const tokenOf = (s) => (s && s.access_token) || null;
  const lasts = (s) => !!tokenOf(s) && (!s.expires_at || s.expires_at * 1000 - now() > TOKEN_MARGIN_MS);

  /* The session is over: forget it here and tell the app once. */
  function expire() {
    if (!session) return null;
    session = null;
    tell('expired');
    return null;
  }

  /* One refresh at a time for the tab. `force` skips the stored copy (it is the one the server refused). */
  function renew(force) {
    if (renewing) return renewing;
    const p = (async () => {
      try {
        if (!force) {
          /* getSession re-reads the shared store (another tab may have refreshed already) and refreshes a stale one. */
          const { data } = await auth.getSession();
          const s = (data && data.session) || null;
          if (lasts(s)) { session = s; return tokenOf(s); }
        }
        const { data, error } = await auth.refreshSession();
        const s = (data && data.session) || null;
        if (lasts(s)) { session = s; return tokenOf(s); }
        if (error && isRetryable(error)) return null;
        return expire();
      } catch (e) {
        return isRetryable(e) ? null : expire();
      }
    })();
    renewing = p;
    p.then(() => { if (renewing === p) renewing = null; });
    return p;
  }

  async function freshToken() {
    if (lasts(session)) return tokenOf(session);
    if (!session) return null;
    return renew(false);
  }

  async function renewToken(bad) {
    if (!session) return null;
    if (lasts(session) && tokenOf(session) !== bad) return tokenOf(session);
    return renew(true);
  }

  if (o.doc && typeof o.doc.addEventListener === 'function') {
    o.doc.addEventListener('visibilitychange', () => { if (o.doc.visibilityState === 'visible') freshToken(); });
  }

  /** Every key on this device that can hold a token or a tab session. */
  function clearCopies() {
    for (const store of [o.device, o.tab]) {
      if (!store) continue;
      for (const k of store.keys()) if (k === cfg.authKey || k.startsWith(cfg.authKey + '-') || k.startsWith('sb-')) store.remove(k);
      for (const k of cfg.retiredAuthKeys) store.remove(k);
    }
    if (o.tab) o.tab.remove(cfg.tabKey);
  }

  return {
    refresh,
    session: () => session,
    userId: () => (session && session.user && session.user.id) || null,
    email: () => (session && session.user && session.user.email) || null,
    token: () => tokenOf(session),
    freshToken,
    renewToken,

    async signIn(email, password) {
      const e = String(email || '').trim();
      if (!EMAIL.test(e)) return fail(AUTH_COPY.badEmail);
      if (!password) return fail(AUTH_COPY.signInFailed);
      try {
        const { data, error } = await auth.signInWithPassword({ email: e, password });
        if (error) return fail(AUTH_COPY[copyFor(error, SIGN_IN_SAYS, 'signInFailed')]);
        session = data.session || null;
        return { ok: !!session, message: session ? '' : AUTH_COPY.signInFailed };
      } catch (err) { return fail(AUTH_COPY.network); }
    },

    async signUp(email, password, confirm) {
      const e = String(email || '').trim();
      if (!EMAIL.test(e)) return fail(AUTH_COPY.badEmail);
      if (String(password || '').length < PASSWORD_MIN_LENGTH) return fail(AUTH_COPY.shortPassword);
      if (password !== confirm) return fail(AUTH_COPY.mismatch);
      try {
        const { error } = await auth.signUp({ email: e, password, options: { emailRedirectTo: o.redirectTo } });
        /* An email that already has an account gets the same words as a new one (CODE_COPY). */
        const key = error ? copyFor(error, SIGN_UP_SAYS, 'signUpFailed') : 'signUpSent';
        return key === 'signUpSent' ? { ok: true, message: AUTH_COPY.signUpSent } : fail(AUTH_COPY[key]);
      } catch (err) { return fail(AUTH_COPY.network); }
    },

    async requestReset(email) {
      const e = String(email || '').trim();
      if (!EMAIL.test(e)) return fail(AUTH_COPY.badEmail);
      try {
        const { error } = await auth.resetPasswordForEmail(e, { redirectTo: o.redirectTo });
        if (error && isNetwork(error)) return fail(AUTH_COPY.network);
        return { ok: true, message: AUTH_COPY.resetSent };
      } catch (err) { return fail(AUTH_COPY.network); }
    },

    async setNewPassword(password, confirm) {
      if (String(password || '').length < PASSWORD_MIN_LENGTH) return fail(AUTH_COPY.shortPassword);
      if (password !== confirm) return fail(AUTH_COPY.mismatch);
      try {
        const { error } = await auth.updateUser({ password });
        if (error) return fail(AUTH_COPY[copyFor(error, NEW_PASSWORD_SAYS, 'passwordFailed')]);
        await refresh();
        return { ok: true, message: AUTH_COPY.passwordSet };
      } catch (err) { return fail(AUTH_COPY.network); }
    },

    /** Forget the session everywhere on this device. Resolves after the copies are gone. */
    async signOut() {
      try { await auth.signOut({ scope: 'local' }); } catch (e) { /* the copies below are the guarantee */ }
      session = null;
      clearCopies();
    },

    /** fn('signed-in' | 'signed-out' | 'recovery' | 'refreshed' | 'expired') on every auth event. */
    onChange(fn) {
      changeFns.add(fn);
      const { data } = auth.onAuthStateChange((event, s) => {
        session = s || null;
        if (event === 'PASSWORD_RECOVERY') fn('recovery');
        else if (event === 'SIGNED_OUT') fn('signed-out');
        else if (event === 'TOKEN_REFRESHED') fn('refreshed');
        else if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) fn('signed-in');
      });
      return () => { changeFns.delete(fn); try { data.subscription.unsubscribe(); } catch (e) { /* gone */ } };
    },
  };
}
