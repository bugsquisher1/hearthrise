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
//   isConfigured()             — boolean
//   getConfig()                — {url, anonKey} | null
//
// The realm is DEFAULT_CONFIG and nothing else. The device-stored override
// (`hearthrise:supabase:config`) and the configure()/reset() pair that wrote it
// were the backend of the Settings "Cloud setup" paste form, deleted 2026-10-08:
// a localStorage value must never choose which server a client talks to.
// ============================================================

import { setupAuth } from './auth.js?v=564';

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
// A dev fork points at a different project by editing DEFAULT_CONFIG (the
// in-game `?cloudConfig=1` paste form in Settings was deleted 2026-10-08).
const DEFAULT_CONFIG = {
  url: 'https://nezapsylztqbbwuwembx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lemFwc3lsenRxYmJ3dXdlbWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzM0NzYsImV4cCI6MjA5MzQwOTQ3Nn0.pd7ZT9M7dd8CtyQPLafCNib9m3S6BSVLRCfvZgql1MM',
};

function pickConfig() {
  if (DEFAULT_CONFIG.url && DEFAULT_CONFIG.anonKey) return DEFAULT_CONFIG;
  return null;
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
  try { await import('./supabase-chat-backend.js?v=564'); }
  catch (e) { console.warn('[supabase-bootstrap] chat backend skipped:', e.message); }
  try { await import('./supabase-market-backend.js?v=564'); }
  catch (e) { console.warn('[supabase-bootstrap] market backend skipped:', e.message); }
}

export function isConfigured() {
  return !!pickConfig();
}

export function getConfig() {
  return pickConfig();
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
  window.HearthriseSupabase = { isConfigured, getConfig };
}
