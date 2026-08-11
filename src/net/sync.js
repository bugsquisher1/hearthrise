// Cloud sync adapter — Supabase-ready stub.
//
// Subscribes to the state-event bus (src/net/events.js), batches changes,
// and POSTs them to a configurable endpoint. Falls back to localStorage when
// the network is unavailable or the endpoint is not configured.
//
// Usage (when Supabase is set up):
//   import { setupSync } from './net/sync.js?v=316';
//   setupSync({
//     endpoint: 'https://<project>.supabase.co/rest/v1/game_events',
//     authToken: () => window.localStorage.getItem('supabaseSession'),
//     userId: () => window.G?.userId,
//     batchIntervalMs: 5000,
//   });
//
// During local-only play, call setupSync() with no args — it stays in offline
// mode and just buffers events to localStorage for later replay.

import { on, snapshot } from './events.js?v=316';

const BUFFER_KEY = 'hearthrise:syncBuffer';
const SNAPSHOT_KEY = 'hearthrise:cloudSnapshot';
const DEVICE_KEY = 'hr:deviceId';
const MAX_BUFFER = 500;
// b301: how recently ANOTHER device must have written for us to call the account
// "active elsewhere". Two devices both save on the ~60s cadence, so a 2.5-min
// window reliably catches a genuinely concurrent session without false-positiving
// on a device you closed a few minutes ago.
const CONCURRENT_WINDOW_MS = 150000;
// b303: how long an owner's heartbeat can go quiet before another tab may take
// over its claim. Poll is ~15s and heartbeat rides every poll, so 3 missed beats
// = the owner is really gone (tab closed), and the surviving tab reclaims instead
// of falsely locking itself out.
const CLAIM_STALE_MS = 50000;
const INSTANCE_KEY = 'hr:instanceId';

let config = null;
let buffer = [];
let flushTimer = null;
let concurrencyTimer = null;
let claimTimer = null;
let lastSnapshotAt = 0;
let lastCloudSaveAt = 0;   // b299: last CONFIRMED cloud upload (for the verify tool + status)
let concurrentWarned = false;
let paused = false;        // b302: set when this device is evicted — stops all cloud writes
let evicted = false;       // b302: latch so we fire onEvicted once

/**
 * b301 — a stable per-DEVICE id (not per-account). Persisted in localStorage so
 * it survives reloads; a fresh install / cleared storage gets a new one. Stamped
 * into every uploaded snapshot so any device can tell whether the last cloud
 * write came from ITSELF or from another device signed into the same account.
 */
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = 'd-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch (e) { return 'd-ephemeral'; }
}

/**
 * b303 — a per-TAB instance id, stored in sessionStorage. Unlike the device id
 * (localStorage, shared by every tab of a browser), sessionStorage is scoped to
 * a single tab and SURVIVES a reload — so it is exactly "one running game
 * instance". This is what the single-active-session claim keys on: two tabs of
 * the same browser are two instances and must not both run. The device id was
 * wrong for this (both tabs shared it, so neither ever saw a "different owner").
 */
function getInstanceId() {
  try {
    let id = sessionStorage.getItem(INSTANCE_KEY);
    if (!id) { id = 'i-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36); sessionStorage.setItem(INSTANCE_KEY, id); }
    return id;
  } catch (e) { return getDeviceId(); }
}

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

// ── Auth-aware fetch with refresh-and-retry (b149) ──────────────────────
// Supabase access tokens expire (~1h). Previously a save/flush that failed on
// an expired token was caught + console.warn'd and dropped SILENTLY — a player
// could lose a whole session's cloud progress with no signal. Now: on an auth
// error we ask the auth layer to refresh the token (config.onAuthError) and
// retry once, and we report sync-health transitions (config.onSyncFailure /
// onSyncRecovered) so the UI can warn "reconnecting — progress saved locally".
let syncHealthy = true;

function safeCall(fn, arg) { if (typeof fn === 'function') { try { return fn(arg); } catch {} } }

function reportSync(ok, info) {
  if (ok === syncHealthy) return;        // only fire on a health transition
  syncHealthy = ok;
  if (ok) safeCall(config.onSyncRecovered);
  else safeCall(config.onSyncFailure, info);
}

/** Fresh Authorization + apikey headers — read per-call so a retry picks up a refreshed token. */
function withAuthHeaders(base) {
  const h = { ...base };
  if (config.authToken) {
    const tok = typeof config.authToken === 'function' ? config.authToken() : config.authToken;
    if (tok) h['Authorization'] = `Bearer ${tok}`;
  }
  if (config.apiKey) {
    h['apikey'] = typeof config.apiKey === 'function' ? config.apiKey() : config.apiKey;
  }
  return h;
}

/** True if a failed response looks like an expired/invalid token worth a refresh. */
export function isAuthError(status, bodyText) {
  if (status === 401 || status === 403) return true;
  return /jwt expired|pgrst303|token is expired|invalid (jwt|token)/i.test(bodyText || '');
}

/**
 * fetch() with one refresh-and-retry on an auth error. `initFn()` is called
 * fresh per attempt so the retry uses newly-refreshed auth headers. Reports sync
 * health. Returns the Response (ok or not), or null on a hard network failure.
 */
async function fetchWithAuthRetry(url, initFn, label) {
  let res;
  try { res = await fetch(url, initFn()); }
  catch (e) { console.warn('[sync] ' + label + ' network error:', e.message); reportSync(false, 'offline'); return null; }
  if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 400)) {
    let body = ''; try { body = await res.clone().text(); } catch {}
    if (isAuthError(res.status, body) && config.onAuthError) {
      try { await config.onAuthError(); } catch {}
      try { res = await fetch(url, initFn()); }
      catch (e) { console.warn('[sync] ' + label + ' retry network error:', e.message); reportSync(false, 'offline'); return null; }
    }
  }
  if (res.ok) { reportSync(true); }
  else {
    let body = ''; try { body = await res.clone().text(); } catch {}
    console.warn('[sync] ' + label + ' failed:', res.status, body.slice(0, 140));
    reportSync(false, 'auth');
  }
  return res;
}

/** Flush buffered events to the configured endpoint. */
async function flush() {
  if (paused) return;                   // b302: evicted device stops all cloud writes
  if (!config?.endpoint) return;        // No endpoint configured — stay in offline mode
  if (buffer.length === 0) return;
  if (!navigator.onLine) return;        // Browser offline — keep buffered

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

  const res = await fetchWithAuthRetry(config.endpoint, () => ({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }), 'flush');
  if (res && res.ok) {
    // Drop only the events we successfully sent (anything new arrived during the request stays)
    buffer = buffer.slice(batch.length);
    saveBuffer();
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

/**
 * Sum boss kills out of the bestiary. Exported + pure so the leaderboard
 * contract is testable without a live G. Returns null when the save carries no
 * bestiary at all — an ABSENT field, never a fabricated zero, because "no data"
 * and "zero bosses killed" are different claims and the Bosses board excludes
 * the first while ranking the second.
 */
export function countBossKills(G, MONSTERS) {
  if (!G || !G.bestiary || typeof G.bestiary !== 'object' || !MONSTERS) return null;
  let n = 0;
  for (const id in G.bestiary) {
    if (!Object.prototype.hasOwnProperty.call(G.bestiary, id)) continue;
    const def = MONSTERS[id];
    if (def && def.boss) n += (G.bestiary[id] && G.bestiary[id].kills) || 0;
  }
  return n;
}

/**
 * The DERIVED fields a save snapshot must carry so the SERVER can rank it.
 *
 * `snapshot()` (net/events.js) is a deliberate allowlist of *stored* state, and
 * none of these four are stored — they are all computed from it. But the
 * leaderboard views read `snapshot->>'<field>'`, so anything the server has to
 * sort by has to be written down at save time. This function is the one place
 * that decision lives.
 *
 *   totalLevel   — pre-existing (b146). Also gates cloud restore in auth.js.
 *   combatLevel  — b222. `public.leaderboard` has read snapshot->>'combatLevel'
 *                  since b205 and NOTHING has ever written it: the Combat board
 *                  ranked every player as null. This is that bug's fix.
 *   renown       — b222. The Throne board's score (leaderboards.md §3.2). The
 *                  ladder itself stays client-side; only the integer ships.
 *   bossKills    — b222. The Bosses board. The server cannot compute this — it
 *                  has no MONSTERS table and so no idea which kills were bosses.
 *
 * Each value comes from an explicit config provider when one is wired, else
 * from the live globals, else it is OMITTED. A field is never guessed: a client
 * that cannot compute renown does not appear on the Throne board, which is the
 * honest outcome.
 *
 * Pure apart from the reads it is handed — exported for the regression suite.
 */
export function derivedSnapshotFields(cfg, win) {
  win = win || (typeof window !== 'undefined' ? window : {});
  const out = {};
  const read = (name, fallback) => {
    const p = cfg ? cfg[name] : null;
    if (p != null) {
      try { return typeof p === 'function' ? p() : p; } catch { return null; }
    }
    try { return fallback(); } catch { return null; }
  };
  const whole = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : null);
  const G = win.G;

  const tl = whole(read('totalLevel', () => (typeof win.getTotalLevel === 'function' ? win.getTotalLevel() : null)));
  if (tl != null) out.totalLevel = tl;

  const cl = whole(read('combatLevel', () => (typeof win.getCombatLevel === 'function' ? win.getCombatLevel() : null)));
  if (cl != null) out.combatLevel = cl;

  const rn = whole(read('renown', () => (
    win.HearthriseRenown && typeof win.HearthriseRenown.compute === 'function'
      ? win.HearthriseRenown.compute(G) : null
  )));
  if (rn != null) out.renown = rn;

  const bk = whole(read('bossKills', () => countBossKills(G, win.MONSTERS)));
  if (bk != null) out.bossKills = bk;

  return out;
}

/**
 * Snapshot full game state to the server (idempotent upsert).
 * @param {boolean} force  bypass the interval throttle (used on hide/close so a
 *                         session's tail isn't lost to the 60s cadence).
 * @param {boolean} keepalive  use fetch keepalive so the request survives the
 *                         page being torn down (pagehide/unload).
 * @returns {boolean} true if an upload was attempted and the server accepted it.
 */
async function snapshotIfDue(force, keepalive) {
  if (paused) return false;                 // b302: evicted device must not clobber the cloud
  if (!config?.snapshotEndpoint) return false;
  const now = Date.now();
  if (!force && now - lastSnapshotAt < (config.snapshotIntervalMs || 60000)) return false;
  lastSnapshotAt = now;
  const snap = snapshot(window.G);
  if (!snap) return false;
  // Stamp the derived, server-sortable fields (totalLevel, combatLevel, renown,
  // bossKills). See derivedSnapshotFields for why each one has to be written
  // down rather than computed server-side.
  Object.assign(snap, derivedSnapshotFields(config, window));
  // b301: stamp the writing device so any client can detect a concurrent session
  // on the same account. `__`-prefixed so snapshot() never re-reads it off G and
  // restore strips it before merge.
  snap.__device = getDeviceId();
  // Always cache locally for offline-load
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
  if (!navigator.onLine) return false;

  const userId = config.userId
    ? (typeof config.userId === 'function' ? config.userId() : config.userId)
    : null;
  const req = buildSnapshotRequest(config, userId, snap, now);
  // Auth-aware: refresh + retry once on an expired token, and surface failures
  // instead of swallowing them. Headers rebuilt per attempt for the fresh token.
  const res = await fetchWithAuthRetry(req.url, () => {
    const init = {
      method: req.method,
      headers: withAuthHeaders(req.headers),
      body: JSON.stringify(req.body),
    };
    if (keepalive) init.keepalive = true;   // survive page teardown on close
    return init;
  }, 'snapshot');
  const ok = !!(res && res.ok);
  /* b299: the REAL sync now records that it succeeded, on G where the player can
     see it (Settings "Last synced"). Before this, cloudSyncedAt was only ever set
     by the DEAD mock cloudSync() path (legacy NetClient, no endpoint), so the
     indicator said "never" forever even while snapshots uploaded fine — which is
     exactly why cloud save felt unverifiable. Also tracked as lastCloudSaveAt for
     the verify tool + health readout. */
  if (ok && window.G) {
    window.G.cloudSyncedAt = now;
    lastCloudSaveAt = now;
  }
  return ok;
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
    const row = rows && rows[0];
    const snap = row && row.snapshot;
    if (!snap || typeof snap !== 'object') return null;
    // b300: attach the authoritative server save time (ms) so decideRestore can
    // compare freshness. Namespaced key, stripped before it is ever merged into G.
    try {
      const t = row.saved_at ? Date.parse(row.saved_at) : 0;
      if (t) snap.__cloudSavedAt = t;
    } catch (e) {}
    return snap;
  } catch (e) {
    console.warn('[sync] pull failed:', e.message);
    return null;
  }
}

/**
 * b299 — CLOUD SAVE SELF-TEST. Forces an upload, pulls it straight back, and
 * diffs the round-tripped fields against the live game. This is the answer to
 * "how do I know cloud save is actually working?": it exercises the real write
 * AND read path end-to-end and reports, in plain terms, what matched.
 * Returns { ok, error, offline, signedIn, checks:[{label,cloud,local,match}] }.
 */
export async function verifyCloudSave() {
  const out = { ok: false, error: null, offline: false, signedIn: false, checks: [] };
  try {
    if (!config?.snapshotEndpoint) { out.error = 'Cloud is not configured (offline mode).'; return out; }
    if (!navigator.onLine) { out.offline = true; out.error = 'You are offline — connect to test cloud save.'; return out; }
    const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
    if (!userId) { out.error = 'Not signed in — cloud save needs an account.'; return out; }
    out.signedIn = true;

    const uploaded = await snapshotIfDue(true, false);      // force a fresh upload
    if (!uploaded) { out.error = 'Upload was rejected (auth or network). Try again in a moment.'; return out; }

    const cloud = await pullLatest();                        // read it straight back
    if (!cloud) { out.error = 'Uploaded, but reading it back returned nothing.'; return out; }

    const G = window.G || {};
    const invCount = (o) => (o && typeof o === 'object') ? Object.keys(o).length : 0;
    const rows = [
      ['Total level', cloud.totalLevel, (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : undefined)],
      ['Gold', cloud.gold, G.gold],
      ['Gems', cloud.gems, G.gems],
      ['Kills', cloud.stats && cloud.stats.kills, G.stats && G.stats.kills],
      ['Inventory item types', invCount(cloud.inventory), invCount(G.inventory)],
      ['Name', cloud.playerName, G.playerName],
    ];
    out.checks = rows.map(([label, c, l]) => ({ label, cloud: c, local: l, match: String(c) === String(l) }));
    out.ok = out.checks.every((c) => c.match);
    if (!out.ok) out.error = 'Round-trip completed but some fields did not match — see the details.';
    return out;
  } catch (e) {
    out.error = (e && e.message) || String(e);
    return out;
  }
}

/**
 * b301 — CONCURRENT-DEVICE DETECTION. Pull the latest cloud save and see who
 * wrote it and when. If the last writer was a DIFFERENT device within the recent
 * window, the account is being played in two places at once — which, in a
 * last-writer-wins model, silently clobbers whichever device saves second.
 * We can only WARN (a web idle game can't force-log-out another tab), but a
 * warning lets the player stop before they lose progress.
 *
 * Reuses game_saves (device id lives inside the snapshot JSON) — no schema change.
 * Returns { concurrent, otherDevice, agoMs }.
 */
export async function checkConcurrentDevice() {
  const out = { concurrent: false, otherDevice: null, agoMs: null };
  if (!config?.snapshotEndpoint || !navigator.onLine) return out;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return out;
  const snap = await pullLatest();
  if (!snap) return out;
  const me = getDeviceId();
  const other = snap.__device;
  const at = Number(snap.__cloudSavedAt) || 0;
  const ago = at ? (Date.now() - at) : Infinity;
  if (other && other !== me && ago >= 0 && ago < CONCURRENT_WINDOW_MS) {
    out.concurrent = true; out.otherDevice = other; out.agoMs = ago;
    if (!concurrentWarned) { concurrentWarned = true; safeCall(config.onConcurrentDevice, out); }
  }
  return out;
}

// ── b302: SINGLE ACTIVE DEVICE (session claim) ──────────────────────────────
// "New device wins." claimSession() takes ownership (upsert); checkSessionClaim()
// polls and, if another device now owns the account, evicts THIS device. The
// cardinal rule: evict ONLY on a definitive "a different device owns this" row —
// never on a network error, a missing table, or being signed out — or a flaky
// connection would lock a player out of their own account.

/** Claim the account's single active-session slot for THIS tab (instance). */
export async function claimSession() {
  if (!config?.claimEndpoint) return false;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return false;
  const now = new Date().toISOString();
  const body = { user_id: userId, device_id: getInstanceId(), claimed_at: now, heartbeat_at: now };
  const res = await fetchWithAuthRetry(`${config.claimEndpoint}?on_conflict=user_id`, () => ({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body),
  }), 'claim');
  if (res && res.ok) { evicted = false; }   // we are the owner now
  return !!(res && res.ok);
}

/** Refresh our heartbeat — ONLY updates the row while WE still own it (the
 *  device_id filter means an evicted instance can never resurrect its claim). */
async function heartbeatClaim() {
  if (paused || !config?.claimEndpoint || !navigator.onLine) return;
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return;
  const url = `${config.claimEndpoint}?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(getInstanceId())}`;
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: withAuthHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ heartbeat_at: new Date().toISOString() }),
    });
  } catch (e) { /* a missed heartbeat is harmless — the next poll retries */ }
}

/**
 * Poll the claim. Returns {status}: 'owner'|'evicted'|'reclaimed'|'claimed'|'skip'|'error'.
 * Fires config.onEvicted ONCE when — and only when — a DIFFERENT, still-alive
 * instance owns the account. An owner whose heartbeat has gone stale (a closed
 * tab) is taken over silently, so closing one tab never locks out the other.
 * Errors/absent rows/offline never evict.
 */
export async function checkSessionClaim() {
  if (paused) return { status: 'paused' };
  if (!config?.claimEndpoint || !navigator.onLine) return { status: 'skip' };
  const userId = config.userId ? (typeof config.userId === 'function' ? config.userId() : config.userId) : null;
  if (!userId) return { status: 'skip' };
  const me = getInstanceId();
  let res;
  try { res = await fetch(`${config.claimEndpoint}?user_id=eq.${encodeURIComponent(userId)}&select=device_id,heartbeat_at`, { headers: withAuthHeaders({}) }); }
  catch (e) { return { status: 'error' }; }              // network error → NEVER evict
  if (!res.ok) return { status: 'error' };               // table missing / auth → NEVER evict
  let rows; try { rows = await res.json(); } catch (e) { return { status: 'error' }; }
  const row = rows && rows[0];
  const owner = row && row.device_id;
  if (!owner) { await claimSession(); return { status: 'claimed' }; }   // nobody owns → take it
  if (owner === me) { heartbeatClaim(); return { status: 'owner' }; }   // still ours → keep alive
  // A different instance owns it. Is it actually still alive?
  const hb = row.heartbeat_at ? Date.parse(row.heartbeat_at) : 0;
  const fresh = hb && (Date.now() - hb) < CLAIM_STALE_MS;
  if (fresh) {                                            // genuinely active elsewhere → evict us
    if (!evicted) { evicted = true; safeCall(config.onEvicted, { owner }); }
    return { status: 'evicted', owner };
  }
  await claimSession();                                   // owner abandoned (stale) → take over
  return { status: 'reclaimed', from: owner };
}

/** Stop ALL cloud writes from this device (used when evicted). Idempotent. */
export function pauseSync() {
  paused = true;
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (concurrencyTimer) { clearInterval(concurrencyTimer); concurrencyTimer = null; }
  if (claimTimer) { clearInterval(claimTimer); claimTimer = null; }
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

  // b299: on hide/close, force BOTH the event flush AND a full cloud snapshot,
  // with keepalive so it survives the page being torn down. Before this only the
  // event buffer flushed on hide; the authoritative save (game_saves) waited for
  // the 60s timer, so closing the app could leave the cloud up to a minute stale
  // — or empty for a short session. Now the tail is captured on the way out.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flush(); snapshotIfDue(true, true); }
  });
  window.addEventListener('pagehide', () => { flush(); snapshotIfDue(true, true); });

  // b301: poll for a concurrent session on its own slower cadence (a GET each
  // time — kept off the 5s flush loop). One check shortly after connect catches
  // the "already open elsewhere" case fast.
  if (concurrencyTimer) clearInterval(concurrencyTimer);
  if (config.snapshotEndpoint) {
    concurrencyTimer = setInterval(() => { checkConcurrentDevice(); }, config.concurrencyIntervalMs || 45000);
    setTimeout(() => { checkConcurrentDevice(); }, 4000);
  }

  // b302: single active device. Claim the account for THIS device on connect
  // (new device wins), then poll for eviction. Inert until the session_claims
  // table + claimEndpoint exist — claim/poll simply no-op or error out safely.
  if (claimTimer) clearInterval(claimTimer);
  if (config.claimEndpoint && !paused) {
    setTimeout(() => { claimSession(); }, 1500);                       // take ownership
    setTimeout(() => { checkSessionClaim(); }, 6000);                  // first eviction check
    claimTimer = setInterval(() => { checkSessionClaim(); }, config.claimIntervalMs || 15000);
    // Re-check the moment the tab regains focus, so a kicked device locks out on return.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSessionClaim(); });
  }

  // And one immediate attempt
  setTimeout(flush, 1000);

  console.log('[Cloud Sync]', config.endpoint ? 'configured: ' + config.endpoint : 'offline mode (no endpoint)');
}

// Expose for manual use during dev / migration. getConfig is read-only-ish
// (returns a shallow copy) so tests + debugging can inspect the live wiring —
// e.g. assert snapshotEndpoint targets game_saves, not game_snapshots.
window.HearthriseSync = {
  setupSync, flush, snapshotIfDue, pullLatest, buildSnapshotRequest, isAuthError,
  derivedSnapshotFields, countBossKills, verifyCloudSave, checkConcurrentDevice,
  claimSession, checkSessionClaim, pauseSync,
  getConfig: () => (config ? { ...config } : null),
  getSyncHealthy: () => syncHealthy,
  getLastCloudSaveAt: () => lastCloudSaveAt,
  getDeviceId,
  isPaused: () => paused,
};

// Default: kick off in offline mode so the buffer + snapshot start populating
// the moment any module fires emit(). When you add Supabase config later,
// just call setupSync({endpoint:..., authToken:...}) again to upgrade.
setupSync();
