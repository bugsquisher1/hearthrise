// ════════════════════════════════════════════════════════════════════════
// src/net/supabase-bootstrap.js — THE PROJECT, AND THE ONE CLIENT FOR IT.
//
// Each project's URL and its PUBLISHABLE key (designed to be shipped: it
// grants only what Row-Level Security allows). No secret key, and no legacy JWT
// key, is ever in this repo (CLAUDE.md §2; tests/legacy-keys.mjs).
//
// WHICH PROJECT A PAGE PLAYS IS ITS ORIGIN'S ANSWER, NEVER A SETTING (lane/a-staging):
//   a staging site (STAGING_ORIGINS)   → the staging project: a release's dress rehearsal, data thrown away
//   every other site                   → production
//   a host that SAYS staging but is not listed, or a staging project not wired yet → nothing: the page stops
// A host says staging by carrying the word in a label of its name; no production host does. So production's
// origin can never reach the staging project, and a staging site can never reach production
// (tests/staging-origin.mjs holds both, with mutants).
//
// createSupabaseClient builds the supabase-js client the account session uses
// for auth and the push channel. Its session lives in the storage the caller
// hands it (src/platform/storage.js — the device store or the tab store), under
// one key, so sign-out knows exactly what to clear. Its auth steps run under OUR lock
// (authLockFor, src/net/auth-lock.js): a session that still lasts waits on no other tab.
// ════════════════════════════════════════════════════════════════════════

import { createAuthLock } from './auth-lock.js?v=0.2.114';

const PRODUCTION = Object.freeze({
  env: 'production',
  url: 'https://nezapsylztqbbwuwembx.supabase.co',
  publishableKey: 'sb_publishable_0nx0mXKTfnU01UM4ZESflQ_RjYBEUU9',
  /* The database is in us-west-2. An Edge Function left to the nearest region runs a coast away
     from it and pays that distance on every sequential query of a settle (p50 4 s vs 1 s, 2026-10-20). */
  functionRegion: 'us-west-2',
});

export const SUPABASE_ENVS = Object.freeze({
  production: PRODUCTION,
  /* Empty until the staging project exists: `node tools/staging-bootstrap.local.mjs wire` writes both values
     (and play.html's connect-src). While either is empty a staging site starts nothing. The staging project
     is made in production's region, so a rehearsal pays the same distances. */
  staging: Object.freeze({ env: 'staging', url: '', publishableKey: '', functionRegion: PRODUCTION.functionRegion }),
});

/** The sites that play the staging project. Each host carries `staging` in a label (hr-accrue's cors.js lists the same). */
export const STAGING_ORIGINS = Object.freeze(['https://staging.hearthrise.net']);

/** Whether a host name says staging: one of its labels holds the word. */
export function isStagingHost(host) {
  return String(host || '').toLowerCase().split('.').some((label) => label.includes('staging'));
}

/** 'staging' for a staging site; 'unknown' for a host that says staging and is not one; else 'production'. Pure. */
export function envOfOrigin(origin) {
  const o = String(origin || '');
  if (STAGING_ORIGINS.includes(o)) return 'staging';
  let host = '';
  try { host = new URL(o).hostname; } catch (e) { host = ''; }
  return isStagingHost(host) ? 'unknown' : 'production';
}

/** A project nothing can be sent to: what a page gets when its origin has none. */
const NONE = '';
const NO_PROJECT = (env) => Object.freeze({ env, url: NONE, publishableKey: NONE, functionRegion: NONE });

/**
 * The project the page at `origin` plays, from `envs` (SUPABASE_ENVS). Pure. Never falls back across projects:
 * a staging site whose project is not wired gets the empty project, never production's.
 */
export function supabaseConfigFor(origin, envs = SUPABASE_ENVS) {
  const env = envOfOrigin(origin);
  const c = env === 'unknown' ? null : envs[env];
  return c && c.url && c.publishableKey ? c : NO_PROJECT(env);
}

/** This page's project. `url` is '' when its origin has none (boot.js stops there and says so). */
export const SUPABASE_CONFIG = supabaseConfigFor(globalThis.location ? globalThis.location.origin : '');

/** A supabase-js storage adapter over one HearthriseStorage store. */
function storageAdapter(store) {
  return {
    getItem: (k) => store.get(k),
    setItem: (k, v) => { store.set(k, v, { durable: true }); },
    removeItem: (k) => { store.remove(k); },
  };
}

/**
 * The lock for the session one store keeps: it asks the other tabs only when that session is near its refresh.
 * @param {Window} win
 * @param {object} store         a HearthriseStorage store
 * @param {string} storageKey
 */
export function authLockFor(win, store, storageKey) {
  return createAuthLock({
    locks: win.navigator ? win.navigator.locks : undefined,
    expiresAt: () => {
      try { const s = JSON.parse(store.get(storageKey) || 'null'); return s && Number.isFinite(s.expires_at) ? s.expires_at : null; } catch (e) { return null; }
    },
  });
}

/**
 * @param {object} sdk           the supabase-js namespace (window.supabase from the vendored UMD)
 * @param {object} store         a HearthriseStorage store
 * @param {string} storageKey
 * @param {Function} lock        its auth steps' lock (authLockFor(...).lock)
 * @param {object} [cfg]         defaults to SUPABASE_CONFIG
 */
export function createSupabaseClient(sdk, store, storageKey, lock, cfg = SUPABASE_CONFIG) {
  if (!sdk || typeof sdk.createClient !== 'function') throw new Error('supabase-js did not load');
  return sdk.createClient(cfg.url, cfg.publishableKey, {
    auth: { storage: storageAdapter(store), storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, lock },
  });
}
