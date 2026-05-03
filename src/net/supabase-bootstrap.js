// ============================================================
// src/net/supabase-bootstrap.js
//
// Single entry point for "go live with Supabase." Reads stored
// credentials from localStorage (or DEFAULT_CONFIG below for
// hard-coded production deploys), then wires:
//
//   • src/net/auth.js   — sign-in / sign-up / session
//   • src/net/sync.js   — cloud save snapshots + event log
//   • src/net/supabase-chat-backend.js — realtime chat (lazy)
//   • src/net/supabase-market-backend.js — realtime market (lazy)
//
// If no credentials are configured, we stay in fully offline mode
// — every game system already gracefully no-ops the cloud path
// (chat falls back to LocalBackend, market saves to localStorage,
// sync.js buffers events to localStorage for later replay).
//
// Public API (all on `window.HearthriseSupabase`):
//   configure({url, anonKey})  — persist + boot
//   isConfigured()             — boolean
//   getConfig()                — {url, anonKey} | null
//   reset()                    — wipe local config (does NOT sign out)
//
// The Settings → Account "Cloud setup" form calls configure() with
// what the player pastes in.
// ============================================================

import { setupAuth } from './auth.js';

// ============================================================
// PRODUCTION CREDENTIALS — paste once, ship to players.
// ============================================================
// This is the ONE place to wire your live Supabase project into the
// build. Both fields below get embedded in the shipped game; players
// never see a "paste your URL" form.
//
// To go live:
//   1. Open your Supabase project dashboard → Settings → API
//   2. Copy "Project URL"  → DEFAULT_CONFIG.url
//   3. Copy "anon public"  → DEFAULT_CONFIG.anonKey
//   4. Bump the cache buster (?v=) in index.html and ship.
//
// SECURITY NOTE: the anon key is *designed* to be public. It only grants
// the access you've authorised via Row-Level Security policies (set up
// in SUPABASE_SETUP.md). Never paste the SERVICE ROLE key here — that
// one is admin and must stay server-side.
//
// To run a self-hosted / dev fork against a different project, leave
// these blank and add `?cloudConfig=1` to the URL — the in-game paste
// form will appear in Settings → Account.
const DEFAULT_CONFIG = {
  url: 'https://nezapsylztqbbwuwembx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lemFwc3lsenRxYmJ3dXdlbWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzM0NzYsImV4cCI6MjA5MzQwOTQ3Nn0.pd7ZT9M7dd8CtyQPLafCNib9m3S6BSVLRCfvZgql1MM',
};

const CONFIG_KEY = 'hearthrise:supabase:config';

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveStoredConfig(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return true;
  } catch (e) {
    console.warn('[supabase-bootstrap] failed to save config:', e.message);
    return false;
  }
}

function clearStoredConfig() {
  try { localStorage.removeItem(CONFIG_KEY); } catch (e) {}
}

function pickConfig() {
  const stored = loadStoredConfig();
  if (stored && stored.url && stored.anonKey) return stored;
  if (DEFAULT_CONFIG.url && DEFAULT_CONFIG.anonKey) return DEFAULT_CONFIG;
  return null;
}

/**
 * Persist credentials and (re)initialise auth + cloud sync.
 * On a fresh first call this triggers Supabase client load + session
 * restore. Subsequent calls update the stored config but require a
 * page reload to take full effect (the client we already loaded keeps
 * its in-memory state).
 *
 * @param {{url:string, anonKey:string}} cfg
 * @returns {{ok: boolean, reason?: string, requiresReload?: boolean}}
 */
export async function configure(cfg) {
  if (!cfg || !cfg.url || !cfg.anonKey) {
    return { ok: false, reason: 'Both URL and anon key are required.' };
  }
  // Light validation — Supabase URLs always end in .supabase.co; anon keys are
  // JWTs so they always start with 'eyJ'. Saves a wasted boot if something's
  // obviously wrong.
  if (!/\.supabase\.co\/?$/.test(cfg.url.replace(/\/$/, ''))) {
    console.warn('[supabase-bootstrap] URL doesn\'t look like a Supabase URL:', cfg.url);
  }
  if (cfg.anonKey.indexOf('eyJ') !== 0) {
    return { ok: false, reason: 'Anon key should start with "eyJ" (JWT format).' };
  }
  const had = !!loadStoredConfig();
  saveStoredConfig({ url: cfg.url.replace(/\/$/, ''), anonKey: cfg.anonKey });
  if (had) {
    return { ok: true, requiresReload: true };
  }
  // First-time configuration — boot live without reload.
  await setupAuth(cfg);
  // Lazy-load the realtime backends now that we have a client.
  await importBackendsLazily();
  return { ok: true };
}

/**
 * Lazily import the realtime backends only when Supabase is configured.
 * Keeps the offline-only build slim and avoids loading supabase-js if
 * the player never signs in.
 */
async function importBackendsLazily() {
  // Each backend self-installs a `window.HearthriseChat.setBackend(...)` /
  // `HearthriseMarket.setBackend(...)` swap, so chat + market upgrade
  // from local to cloud automatically once they're loaded.
  try { await import('./supabase-chat-backend.js'); }
  catch (e) { console.warn('[supabase-bootstrap] chat backend skipped:', e.message); }
  try { await import('./supabase-market-backend.js'); }
  catch (e) { console.warn('[supabase-bootstrap] market backend skipped:', e.message); }
}

export function isConfigured() {
  return !!pickConfig();
}

export function getConfig() {
  return pickConfig();
}

/**
 * Wipe stored credentials. Intentionally does NOT sign the player
 * out (signOut() is a separate auth.js call). Useful when the player
 * wants to point the game at a different Supabase project.
 */
export function reset() {
  clearStoredConfig();
}

// ── Auto-boot on module load ────────────────────────────────
// If credentials are already stored, fire the auth init now so
// session restoration + cloud-save pull happen during boot.
const cfg = pickConfig();
if (cfg) {
  setupAuth(cfg).then(() => importBackendsLazily());
  console.log('[supabase-bootstrap] live mode — connecting to', cfg.url);
} else {
  console.log('[supabase-bootstrap] offline mode — no Supabase credentials configured');
}

// Expose for the Settings UI + devtools.
if (typeof window !== 'undefined') {
  window.HearthriseSupabase = { configure, isConfigured, getConfig, reset };
}
