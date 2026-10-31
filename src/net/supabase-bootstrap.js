// ════════════════════════════════════════════════════════════════════════
// src/net/supabase-bootstrap.js — THE PROJECT, AND THE ONE CLIENT FOR IT.
//
// The production project URL and its PUBLIC anon key (designed to be shipped:
// it grants only what Row-Level Security allows). The service-role key is never
// in this repo (CLAUDE.md §2).
//
// createSupabaseClient builds the supabase-js client the account session uses
// for auth and the push channel. Its session lives in the storage the caller
// hands it (src/platform/storage.js — the device store or the tab store), under
// one key, so sign-out knows exactly what to clear. Its auth steps run under OUR lock
// (authLockFor, src/net/auth-lock.js): a session that still lasts waits on no other tab.
// ════════════════════════════════════════════════════════════════════════

import { createAuthLock } from './auth-lock.js?v=0.2.78';

export const SUPABASE_CONFIG = Object.freeze({
  url: 'https://nezapsylztqbbwuwembx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lemFwc3lsenRxYmJ3dXdlbWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzM0NzYsImV4cCI6MjA5MzQwOTQ3Nn0.pd7ZT9M7dd8CtyQPLafCNib9m3S6BSVLRCfvZgql1MM',
  /* The database is in us-west-2. An Edge Function left to the nearest region runs a coast away
     from it and pays that distance on every sequential query of a settle (p50 4 s vs 1 s, 2026-10-20). */
  functionRegion: 'us-west-2',
});

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
  return sdk.createClient(cfg.url, cfg.anonKey, {
    auth: { storage: storageAdapter(store), storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, lock },
  });
}
