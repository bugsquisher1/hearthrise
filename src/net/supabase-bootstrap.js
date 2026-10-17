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
// one key, so sign-out knows exactly what to clear.
// ════════════════════════════════════════════════════════════════════════

export const SUPABASE_CONFIG = Object.freeze({
  url: 'https://nezapsylztqbbwuwembx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lemFwc3lsenRxYmJ3dXdlbWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzM0NzYsImV4cCI6MjA5MzQwOTQ3Nn0.pd7ZT9M7dd8CtyQPLafCNib9m3S6BSVLRCfvZgql1MM',
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
 * @param {object} sdk           the supabase-js namespace (window.supabase from the vendored UMD)
 * @param {object} store         a HearthriseStorage store
 * @param {string} storageKey
 * @param {object} [cfg]         defaults to SUPABASE_CONFIG
 */
export function createSupabaseClient(sdk, store, storageKey, cfg = SUPABASE_CONFIG) {
  if (!sdk || typeof sdk.createClient !== 'function') throw new Error('supabase-js did not load');
  return sdk.createClient(cfg.url, cfg.anonKey, {
    auth: { storage: storageAdapter(store), storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
