// Cloud sync adapter — Supabase-ready stub.
//
// Subscribes to the state-event bus (src/net/events.js), batches changes,
// and POSTs them to a configurable endpoint. Falls back to localStorage when
// the network is unavailable or the endpoint is not configured.
//
// Usage (when Supabase is set up):
//   import { setupSync } from './net/sync.js?v=148';
//   setupSync({
//     endpoint: 'https://<project>.supabase.co/rest/v1/game_events',
//     authToken: () => window.localStorage.getItem('supabaseSession'),
//     userId: () => window.G?.userId,
//     batchIntervalMs: 5000,
//   });
//
// During local-only play, call setupSync() with no args — it stays in offline
// mode and just buffers events to localStorage for later replay.

import { on, snapshot } from './events.js?v=148';

const BUFFER_KEY = 'hearthrise:syncBuffer';
const SNAPSHOT_KEY = 'hearthrise:cloudSnapshot';
const MAX_BUFFER = 500;

let config = null;
let buffer = [];
let flushTimer = null;
let lastSnapshotAt = 0;

/** Load the offline buffer (events captured while offline / pre-config). */
function loadBuffer() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (raw) buffer = JSON.parse(raw);
  } catch {}
}

function saveBuffer() {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {}
}

/** Push an event into the buffer, trimming if too large. */
function enqueue(ev) {
  buffer.push(ev);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  saveBuffer();
}

/** Flush buffered events to the configured endpoint. */
async function flush() {
  if (!config?.endpoint) return;        // No endpoint configured — stay in offline mode
  if (buffer.length === 0) return;
  if (!navigator.onLine) return;        // Browser offline — keep buffered

  const headers = {
    'Content-Type': 'application/json',
  };
  if (config.authToken) {
    const tok = typeof config.authToken === 'function' ? config.authToken() : config.authToken;
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
  }
  if (config.apiKey) {
    headers['apikey'] = typeof config.apiKey === 'function' ? config.apiKey() : config.apiKey;
  }
  const userId = config.userId
    ? (typeof config.userId === 'function' ? config.userId() : config.userId)
    : null;

  const batch = buffer.slice(0);
  const payload = batch.map((ev) => ({
    user_id: userId,
    event_type: ev.type,
    payload: ev.payload,
    occurred_at: new Date(ev.ts).toISOString(),
  }));

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      // Drop only the events we successfully sent (anything new arrived during the request stays)
      buffer = buffer.slice(batch.length);
      saveBuffer();
    } else {
      console.warn('[sync] flush failed:', res.status, res.statusText);
    }
  } catch (e) {
    console.warn('[sync] network error, will retry:', e.message);
  }
}

/**
 * Pure builder for the snapshot upsert request. Exported so the smoke test can
 * assert the b146 contract without a live network: correct table (via cfg's
 * snapshotEndpoint — must be game_saves, NOT the non-existent game_snapshots),
 * a `slot` value (NOT NULL on the table), and upsert-on-conflict semantics
 * (game_saves has `unique (user_id, slot)`, so a plain insert 409s every save
 * after the first).
 */
export function buildSnapshotRequest(cfg, userId, snap, nowMs) {
  // `slot` is NOT NULL on game_saves. Single-character today = slot 0; the
  // leaderboard views also join on slot = 0. Parameterise when multi-char ships.
  const slot = (cfg && cfg.slot != null) ? cfg.slot : 0;
  const headers = {
    'Content-Type': 'application/json',
    // resolution=merge-duplicates + on_conflict turns POST into an upsert.
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  };
  return {
    url: `${cfg.snapshotEndpoint}?on_conflict=user_id,slot`,
    method: 'POST',
    headers,
    body: { user_id: userId, slot, snapshot: snap, saved_at: new Date(nowMs).toISOString() },
  };
}

/** Periodically snapshot full game state to the server (idempotent upsert). */
async function snapshotIfDue() {
  if (!config?.snapshotEndpoint) return;
  const now = Date.now();
  if (now - lastSnapshotAt < (config.snapshotIntervalMs || 60000)) return;
  lastSnapshotAt = now;
  const snap = snapshot(window.G);
  if (!snap) return;
  // Stamp totalLevel INTO the snapshot. `game_saves.total_level` is a generated
  // column that reads `snapshot->>'totalLevel'`, and the sign-in restore gate in
  // auth.js compares snap.totalLevel — but G has no totalLevel field (it's
  // computed from skills via getTotalLevel()). Without this the column is always
  // null AND cloud restore never fires (0 > 0). See config.totalLevel provider.
  if (config.totalLevel != null) {
    const tl = typeof config.totalLevel === 'function' ? config.totalLevel() : config.totalLevel;
    if (tl != null) snap.totalLevel = tl;
  }
  // Always cache locally for offline-load
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
  if (!navigator.onLine) return;

  const userId = config.userId
    ? (typeof config.userId === 'function' ? config.userId() : config.userId)
    : null;
  const req = buildSnapshotRequest(config, userId, snap, now);
  if (config.authToken) {
    const tok = typeof config.authToken === 'function' ? config.authToken() : config.authToken;
    if (tok) req.headers['Authorization'] = `Bearer ${tok}`;
  }
  if (config.apiKey) {
    req.headers['apikey'] = typeof config.apiKey === 'function' ? config.apiKey() : config.apiKey;
  }
  try {
    await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) });
  } catch (e) {
    console.warn('[sync] snapshot failed:', e.message);
  }
}

/** Replay-from-server stub — call after sign-in to pull the latest snapshot. */
export async function pullLatest() {
  if (!config?.snapshotEndpoint) return null;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return null;
  try {
    const headers = {};
    if (config.authToken) {
      const tok = typeof config.authToken === 'function' ? config.authToken() : config.authToken;
      if (tok) headers['Authorization'] = `Bearer ${tok}`;
    }
    if (config.apiKey) headers['apikey'] = typeof config.apiKey === 'function' ? config.apiKey() : config.apiKey;
    const slot = (config.slot != null) ? config.slot : 0;
    const res = await fetch(`${config.snapshotEndpoint}?user_id=eq.${encodeURIComponent(userId)}&slot=eq.${slot}&order=saved_at.desc&limit=1`, { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.snapshot || null;
  } catch (e) {
    console.warn('[sync] pull failed:', e.message);
    return null;
  }
}

/** Setup. Pass config on first call; passing nothing keeps offline mode active. */
export function setupSync(opts = {}) {
  config = { ...config, ...opts };
  loadBuffer();

  // Subscribe to every event
  on('*', (_payload, ev) => {
    enqueue(ev);
  });

  // Periodic flush (whatever interval is configured, default 5s)
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => {
    flush();
    snapshotIfDue();
  }, config.batchIntervalMs || 5000);

  // Flush immediately on visibility change (best effort, don't rely on it)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // And one immediate attempt
  setTimeout(flush, 1000);

  console.log('[Cloud Sync]', config.endpoint ? 'configured: ' + config.endpoint : 'offline mode (no endpoint)');
}

// Expose for manual use during dev / migration. getConfig is read-only-ish
// (returns a shallow copy) so tests + debugging can inspect the live wiring —
// e.g. assert snapshotEndpoint targets game_saves, not game_snapshots.
window.HearthriseSync = {
  setupSync, flush, snapshotIfDue, pullLatest, buildSnapshotRequest,
  getConfig: () => (config ? { ...config } : null),
};

// Default: kick off in offline mode so the buffer + snapshot start populating
// the moment any module fires emit(). When you add Supabase config later,
// just call setupSync({endpoint:..., authToken:...}) again to upgrade.
setupSync();
