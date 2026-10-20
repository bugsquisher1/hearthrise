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
// SIGN-OUT CLEARS EVERY COPY: supabase-js forgets the session, then every key
// that can hold a token on this device — the auth key in BOTH the device and
// the tab store, any `sb-*` key, the retired pre-reset keys — and the tab's
// session id, so the next sign-in is a new session.
//
// THE RECOVERY LINK: a password-reset email opens the client with a recovery
// token in the URL; supabase-js signs the link in and reports PASSWORD_RECOVERY,
// which the app turns into the set-new-password screen (onChange 'recovery').
// ════════════════════════════════════════════════════════════════════════

import { SESSION_CONFIG } from '../session/config.js?v=0.2.11';

export const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AUTH_COPY = Object.freeze({
  badEmail: 'Enter the email address for your account.',
  shortPassword: 'Use at least ' + MIN_PASSWORD + ' characters for your password.',
  mismatch: 'The two passwords do not match.',
  signInFailed: 'That email and password do not match an account.',
  signUpSent: 'Check your email for a link to finish creating your account. If you already have an account, sign in instead.',
  signUpFailed: 'The account could not be created. Try again in a minute.',
  resetSent:'If that email has an account, a link to reset your password is on its way.',
  passwordSet: 'Your new password is saved. You are signed in.',
  passwordFailed: 'That reset link has expired. Ask for a new one from the sign-in screen.',
  network: 'Could not reach the server. Check your connection and try again.',
});

const fail = (message) => ({ ok: false, message });
const isNetwork = (e) => !!e && (e.status === 0 || /fetch|network/i.test(String(e.message || '')));

/**
 * @param {object} o
 * @param {object} o.client      the supabase-js client
 * @param {object} o.device      HearthriseStorage (device store)
 * @param {object} o.tab         HearthriseStorage.session (tab store)
 * @param {string} o.redirectTo  where a reset or confirmation email sends the player back
 * @param {object} [o.config]    defaults to SESSION_CONFIG
 */
export function createAuth(o) {
  const cfg = o.config || SESSION_CONFIG;
  const auth = o.client.auth;
  let session = null;

  async function refresh() {
    try { const { data } = await auth.getSession(); session = (data && data.session) || null; } catch (e) { session = null; }
    return session;
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
    token: () => (session && session.access_token) || null,

    async signIn(email, password) {
      const e = String(email || '').trim();
      if (!EMAIL.test(e)) return fail(AUTH_COPY.badEmail);
      if (!password) return fail(AUTH_COPY.signInFailed);
      try {
        const { data, error } = await auth.signInWithPassword({ email: e, password });
        if (error) return fail(isNetwork(error) ? AUTH_COPY.network : AUTH_COPY.signInFailed);
        session = data.session || null;
        return { ok: !!session, message: session ? '' : AUTH_COPY.signInFailed };
      } catch (err) { return fail(AUTH_COPY.network); }
    },

    async signUp(email, password, confirm) {
      const e = String(email || '').trim();
      if (!EMAIL.test(e)) return fail(AUTH_COPY.badEmail);
      if (String(password || '').length < MIN_PASSWORD) return fail(AUTH_COPY.shortPassword);
      if (password !== confirm) return fail(AUTH_COPY.mismatch);
      try {
        const { error } = await auth.signUp({ email: e, password, options: { emailRedirectTo: o.redirectTo } });
        if (error && isNetwork(error)) return fail(AUTH_COPY.network);
        /* An email that already has an account gets the same words as a new one. */
        if (error && !/already (registered|exists)/i.test(String(error.message || ''))) return fail(AUTH_COPY.signUpFailed);
        return { ok: true, message: AUTH_COPY.signUpSent };
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
      if (String(password || '').length < MIN_PASSWORD) return fail(AUTH_COPY.shortPassword);
      if (password !== confirm) return fail(AUTH_COPY.mismatch);
      try {
        const { error } = await auth.updateUser({ password });
        if (error) return fail(isNetwork(error) ? AUTH_COPY.network : AUTH_COPY.passwordFailed);
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

    /** fn('signed-in' | 'signed-out' | 'recovery' | 'refreshed') on every auth event. */
    onChange(fn) {
      const { data } = auth.onAuthStateChange((event, s) => {
        session = s || null;
        if (event === 'PASSWORD_RECOVERY') fn('recovery');
        else if (event === 'SIGNED_OUT') fn('signed-out');
        else if (event === 'TOKEN_REFRESHED') fn('refreshed');
        else if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) fn('signed-in');
      });
      return () => { try { data.subscription.unsubscribe(); } catch (e) { /* gone */ } };
    },
  };
}
