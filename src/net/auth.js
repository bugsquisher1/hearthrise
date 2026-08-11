// Supabase auth scaffold — drop-in module that handles sign-in / sign-up flows
// and wires the resulting session into the cloud-sync adapter.
//
// Tyler hasn't created the Supabase project yet, so this module is INERT until
// he calls setupAuth({url, anonKey}). When he does, signIn() / signUp() / signOut()
// become live, and cloud-sync auto-upgrades from offline to live.

import { setupSync, pullLatestDetailed, holdSnapshots, releaseSnapshots } from './sync.js?v=330';

let supabase = null;       // lazy-loaded supabase client
let authConfig = null;     // {url, anonKey}
let session = null;        // current session

const LOCAL_KEY = 'hearthrise:supabaseSession';

/**
 * WHAT AN AUTH EVENT MEANS FOR THE CACHED SESSION — pure, and exported so the
 * suite can prove it (b226).
 *
 * The cached session under LOCAL_KEY is not a convenience: src/net/account-gate.js
 * opens the front door on it, so deleting it is equivalent to signing the
 * player out of the product. Before b226 the handler cleared it on ANY event
 * that arrived without a session, and supabase-js emits several — an
 * INITIAL_SESSION replay, a TOKEN_REFRESHED that has not resolved yet, a
 * transient network blip during refresh. One of those and a signed-in player
 * met the wall on their next load and had to sign in again. That is the
 * "logging in doesn't seem very seamless" report, in one line.
 *
 *   'persist' — an event carrying a session. Always wins.
 *   'clear'   — an EXPLICIT end of the account's session on this device.
 *   'ignore'  — a null we cannot interpret as an intentional sign-out. Keep
 *               the cache; supabase-js keeps retrying, and if the session
 *               really is dead the gate's lapsed-session sheet asks — beside a
 *               running game, which is the behaviour the account ruling
 *               requires.
 * @returns {'persist'|'clear'|'ignore'}
 */
export function decideSessionEvent(event, newSession) {
  if (newSession) return 'persist';
  return (event === 'SIGNED_OUT' || event === 'USER_DELETED') ? 'clear' : 'ignore';
}

/**
 * Initialise auth + cloud sync.
 * @param {{url: string, anonKey: string}} config
 */
export async function setupAuth(config) {
  authConfig = config;
  if (!config?.url || !config?.anonKey) {
    console.log('[Auth] no config — staying in offline mode');
    return;
  }
  // Dynamic import so this module loads even when supabase-js isn't available
  try {
    const mod = await import('https://cdn.skypack.dev/@supabase/supabase-js');
    // Explicit auth options so we don't rely on library defaults: keep the
    // access token auto-refreshing in the background (tokens expire ~1h) and
    // persisted, so long play sessions don't silently stop syncing (b149).
    supabase = mod.createClient(config.url, config.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true },
    });
  } catch (e) {
    console.warn('[Auth] failed to load supabase-js:', e.message);
    return;
  }

  // Restore prior session if present
  const cached = localStorage.getItem(LOCAL_KEY);
  if (cached) {
    try {
      session = JSON.parse(cached);
      await supabase.auth.setSession(session);
    } catch {}
  }

  // Auth state listener — keep session in localStorage + reconfigure sync.
  // The rule itself is decideSessionEvent() below, so it can be proved.
  supabase.auth.onAuthStateChange((event, newSession) => {
    const act = decideSessionEvent(event, newSession);
    if (act === 'ignore') return;                    // transient null — keep what we have
    if (act === 'persist') {
      session = newSession;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(newSession));
      enableLiveSync();
    } else {
      session = null;
      localStorage.removeItem(LOCAL_KEY);
      // Sync stays in offline mode (events buffer to localStorage)
    }
    renderAuthUi();
    // Trigger a full panel re-render so the Profile sheet's
    // "Offline play / Sign in" subtitle + button update to
    // reflect the new session state.
    try {
      if (typeof window.render === 'function') window.render();
      if (typeof window.renderProfile === 'function') window.renderProfile();
    } catch {}
  });

  if (session) enableLiveSync();
  renderAuthUi();
}

function enableLiveSync() {
  if (!authConfig || !session) return;
  setupSync({
    endpoint: `${authConfig.url}/rest/v1/game_events`,
    snapshotEndpoint: `${authConfig.url}/rest/v1/game_saves`,
    claimEndpoint: `${authConfig.url}/rest/v1/session_claims`,   // b302 single-active-device
    apiKey: authConfig.anonKey,
    authToken: () => session?.access_token,
    userId: () => session?.user?.id,
    // G has no stored totalLevel — it's summed from skills. Feed it in so the
    // snapshot carries it (populates game_saves.total_level + the restore gate).
    totalLevel: () => (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0),
    // b149 — token expiry hardening. If a save fails on an expired token, sync
    // asks us to refresh + retries once; and we surface sync health to the UI
    // so a player knows when their progress isn't reaching the cloud.
    onAuthError: async () => {
      try {
        const { data } = await supabase.auth.refreshSession();
        if (data?.session) {
          session = data.session;
          localStorage.setItem(LOCAL_KEY, JSON.stringify(session));
        }
      } catch (e) { console.warn('[Auth] token refresh failed:', e.message); }
    },
    onSyncFailure: () => {
      if (typeof window.notify === 'function') window.notify('⚠️ Reconnecting… your progress is saved locally.', 'kill');
      const pill = document.getElementById('status-pill') || document.getElementById('hr-auth-banner');
      if (pill) pill.textContent = '🟠 Reconnecting…';
    },
    onSyncRecovered: () => {
      if (typeof window.notify === 'function') window.notify('✅ Back online — progress synced.', 'info');
      renderAuthUi();
    },
    // b301: another device is signed into this account and actively saving. We
    // can't force it out, but we warn — two devices at once clobber each other's
    // saves (last writer wins). Fired once per session.
    onConcurrentDevice: () => {
      if (typeof window.notify === 'function') {
        window.notify('⚠️ This account is being played on another device. Two at once can overwrite each other — close one to keep your progress safe.', 'kill');
      }
    },
    // b302: this device LOST the single-active-session claim — the account was
    // opened on another device (new device wins). Stop everything that could
    // clobber the new device's save, and lock this one out with a clear notice.
    onEvicted: () => { showEvictedGate(); },
    batchIntervalMs: 5000,
    snapshotIntervalMs: 60000,
  });
  // Pull cloud snapshot on first connection if local save is older
  pullAndMaybeRestore();
}

/**
 * THE SAVE-CONFLICT RULE, pure and exported so it can be tested without a
 * network, a session, or a live G.
 *
 * b300 — CLOUD IS AUTHORITATIVE (Tyler). The old rule compared TOTAL LEVEL and
 * prompted when cloud was ahead. That was wrong twice over: total level ignores
 * everything non-level (gold, items, kills gained since), and a level TIE kept
 * local — so a stale local save could silently overwrite newer cloud progress.
 * In an online-only, account-walled game the cloud is the single source of
 * truth and local is a cache; the correct question is not "who has more levels"
 * but "which save is NEWER". So we compare timestamps and the freshest wins,
 * with cloud as the canonical store.
 *
 *   'restore' — the cloud save is NEWER than local. Cloud wins: the caller
 *               overlays it and reloads. (No prompt — auto-newest, per Tyler.)
 *   'adopt'   — local is same-age-or-newer (offline play, a failed prior sync,
 *               or a same-device reopen where they match). Local stays live and
 *               sync.js uploads it. Ties favour local so a same-device reopen
 *               never needlessly reloads.
 *   'none'    — no cloud snapshot at all (first sign-in on an account). Local
 *               is adopted; reported separately from 'adopt' for clarity.
 *
 * SAFETY GUARD: a cloud save only wins if it is newer AND not obviously thin /
 * corrupt — its total level must be at least half of local's. Total level only
 * ever grows, so a newer cloud that is dramatically smaller is a partial or
 * damaged save (e.g. a pre-b288 thin snapshot with a fresh timestamp), and must
 * never be allowed to roll a real save back. When in doubt, keep local.
 *
 * SYMMETRIC ANTI-CLOBBER GUARD (b314): the mirror of the thin-cloud guard. That
 * one stops a newer-but-tiny CLOUD from rolling back a real LOCAL. This one stops
 * a fresh/empty LOCAL from clobbering a real CLOUD even though local wins on time.
 * It closes the hole that reset a live account: a freshly-added iOS Home Screen
 * PWA gets its OWN empty storage sandbox, boots an EMPTY character with a current
 * lastSeen (so local is "newer"), then uploads that emptiness over a substantial
 * cloud. Total level only ever grows, so a local still at the fresh-character
 * FLOOR while the cloud holds real, much larger progress is not "newer play" — it
 * is a fresh/cleared/corrupt local and must NEVER win. We key on LOCAL's OWN total
 * (which this device can trust) sitting at the floor, NOT on the cloud's
 * (self-forgeable) size being large — so it cannot be tripped by a garbage-inflated
 * cloud level, and it cannot regress the anti-rollback invariant for a genuinely
 * progressed local (a real save sits far above FRESH_FLOOR, so that branch is
 * never entered). Known limitation: two BOTH-near-floor saves (local & cloud each
 * ≤ FRESH_FLOOR) still resolve by time — an intentionally conservative choice, as
 * a sub-floor save is worth only minutes and we refuse to risk a false restore.
 *
 * @param {{lastSeen:number, totalLevel:number}} local  local freshness + size
 * @param {object|null} snap  cloud snapshot; reads snap.__cloudSavedAt (ms) with
 *                            snap.lastSeen as a fallback, and snap.totalLevel.
 * @returns {{action:'none'|'adopt'|'restore', localAt:number, cloudAt:number,
 *            localTotalLv:number, cloudTotalLv:number, reason:string}}
 */
// A brand-new Hearthrise character's total level: 12 skills at level 1 plus
// hitpoints seeded to level 10 (1154 xp) = 22. A save still at or below this
// floor has effectively no progress; a real save climbs far past it quickly. We
// leave headroom above the true floor so a few minutes of first-session play is
// still treated as "fresh" for the anti-clobber guard.
const FRESH_FLOOR = 40;

/**
 * WHO OWNS THE LOCAL SAVE (b318 — V2 cross-account clobber). Pure.
 *
 * THE HOLE: signOut() cleared only the session, never SAVE_KEY. Account B signs
 * in on a device where account A played; loadLocal() reads A's save into G;
 * decideRestore compares A's local against B's cloud on TIMESTAMP alone, A is
 * newer, verdict 'adopt' → the next snapshot uploads A's character over B's
 * cloud save. B's progress is destroyed and B is playing A's character. Neither
 * existing guard fires: A's save is substantial, so the b314 thin/fresh-floor
 * guards see two perfectly healthy saves and let time decide.
 *
 * The fix is identity, not size: a local save is only a candidate to upload if
 * it BELONGS to the signed-in account.
 *
 *   'same'    — stamped with the signed-in user. Normal freshness rules apply.
 *   'foreign' — stamped with a DIFFERENT user. Never adoptable, never uploadable.
 *   'unstamped'      — a pre-b318 install. See the legacy policy below.
 *   'unknown-session' — we cannot tell who is signed in (auth not up yet, offline
 *                       boot). Never accuse a save of being foreign on a guess;
 *                       fall through to the normal rules, which are unchanged.
 *
 * LEGACY POLICY (unstamped → treated as 'same', stamped on first save): every
 * existing player's save predates the stamp, and discarding those would wipe the
 * entire live beta on upgrade — categorically worse than the bug being fixed.
 * It is safe against the V2 scenario because the stamp is written on the FIRST
 * save after upgrade, i.e. by the account that is actually playing: the window
 * in which a save can be mistaken for someone else's is one boot on a device
 * that has ALREADY had two accounts on it before ever running b318. From the
 * first stamped save onward the device is protected forever. And the stamp is
 * only ever written when ABSENT (legacy.js saveLocal), so a foreign save can
 * never be re-labelled as the current user's on the way past the guard.
 */
export function decideLocalOwnership(localOwner, currentUser) {
  if (!currentUser || typeof currentUser !== 'string') return 'unknown-session';
  if (!localOwner || typeof localOwner !== 'string') return 'unstamped';
  return localOwner === currentUser ? 'same' : 'foreign';
}

export function decideRestore(local, snap, ownership) {
  local = local || {};
  // Ownership may be passed explicitly (tests, callers that already resolved it)
  // or derived from the local descriptor. Absent both, it is 'unknown-session'
  // and behaviour is byte-for-byte what it was before b318.
  const own = ownership || decideLocalOwnership(local.owner, local.currentUser);
  if (own === 'foreign') {
    // A save belonging to another account. It is not "older" or "smaller" — it
    // is NOT THIS PLAYER'S, so freshness is meaningless and it must never reach
    // the cloud. The caller parks it and starts this account clean.
    return {
      action: 'foreign', reason: 'local-owned-by-another-account', ownership: own,
      localAt: Number(local.lastSeen) || 0, cloudAt: Number(snap && (snap.__cloudSavedAt || snap.lastSeen)) || 0,
      localTotalLv: Number(local.totalLevel) || 0, cloudTotalLv: Number(snap && snap.totalLevel) || 0,
    };
  }
  const localAt = Number(local.lastSeen) || 0;
  const localTL = Number(local.totalLevel) || 0;
  const base = { localAt, cloudAt: 0, localTotalLv: localTL, cloudTotalLv: 0, ownership: own };
  if (!snap || typeof snap !== 'object') return { action: 'none', reason: 'no-cloud', ...base };
  const cloudAt = Number(snap.__cloudSavedAt) || Number(snap.lastSeen) || 0;
  const cloudTL = Number(snap.totalLevel) || 0;
  const full = { ...base, cloudAt, cloudTotalLv: cloudTL };
  // Cloud must be strictly newer to win; ties keep local (no needless reload).
  if (cloudAt > localAt) {
    // Thin/corrupt guard: don't let a newer-but-tiny cloud roll a real save back.
    if (localTL > 0 && cloudTL < localTL * 0.5) return { action: 'adopt', reason: 'cloud-newer-but-thin', ...full };
    return { action: 'restore', reason: 'cloud-newer', ...full };
  }
  // Local wins on time — but a fresh/empty local (fresh-storage sandbox: a
  // re-added PWA, cleared cache, corrupt save) must NEVER upload over a real,
  // substantial cloud. See the SYMMETRIC ANTI-CLOBBER GUARD note above.
  if (localTL <= FRESH_FLOOR && cloudTL > FRESH_FLOOR && cloudTL >= localTL * 2) {
    return { action: 'restore', reason: 'local-fresh-vs-substantial-cloud', ...full };
  }
  return { action: 'adopt', reason: 'local-fresh', ...full };
}

// b314: bounded retry counter for a cloud pull that keeps failing. While the
// pull is UNKNOWN (network down / non-200) the snapshot gate stays HELD so a
// fresh/empty local can never upload over a cloud we could not read — the exact
// data-loss the reconcile gate exists to prevent. Local persistence (saveLocal +
// the event buffer) is untouched, so nothing is lost; uploads simply wait until
// we get a definitive read. Backoff caps so we don't hammer a dead endpoint.
let reconcileAttempts = 0;
const RECONCILE_MAX_DELAY = 30000;

async function pullAndMaybeRestore() {
  // b314: hold snapshot uploads until we have pulled the cloud and reconciled.
  // A fresh/empty local must never race an upload out ahead of this decision.
  try { holdSnapshots(); } catch (e) {}
  try {
    // b300: one cloud-restore per tab session. The restore path reloads, and
    // after the reload local == cloud so decideRestore returns 'adopt' — but this
    // guard is belt-and-suspenders against clock skew making cloudAt persistently
    // look newer and re-triggering a reload loop.
    let restoredAlready = false;
    try { restoredAlready = sessionStorage.getItem('hr:cloudRestoreDone') === '1'; } catch (e) {}

    const pull = await pullLatestDetailed();

    // UNKNOWN cloud (network error / non-200). We must NOT release the gate and
    // let a possibly-fresh local upload over a cloud we never read. Stay held and
    // retry with backoff; a returning device keeps playing offline meanwhile.
    if (pull.status === 'error') {
      reconcileAttempts++;
      const delay = Math.min(RECONCILE_MAX_DELAY, 4000 * reconcileAttempts);
      console.warn(`[Auth] cloud pull failed (attempt ${reconcileAttempts}); snapshot uploads held, retrying in ${delay}ms.`);
      setTimeout(() => { pullAndMaybeRestore(); }, delay);
      return;   // gate stays HELD — the finally below must not run a release for this path
    }
    reconcileAttempts = 0;

    const snap = pull.snap;   // null for 'empty'/'skip' → decideRestore returns none/adopt
    const local = {
      lastSeen: (window.G && Number(window.G.lastSeen)) || 0,
      totalLevel: (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0)
        || (window.G && window.G.totalLevel) || 0,
      owner: (window.G && window.G._saveOwner) || null,
      currentUser: currentUserId(),
    };
    const d = decideRestore(local, snap);

    // b318 (V2): the live save belongs to a DIFFERENT account. Do not merge it,
    // do not upload it, do not reason about its timestamp. Park it (recoverable
    // — that player gets it back when they sign in here again) and reload, so
    // this account boots either its own parked save or a clean character and
    // then reconciles against its own cloud through the normal path.
    if (d.action === 'foreign') {
      let already = false;
      try { already = sessionStorage.getItem('hr:foreignParked') === local.currentUser; } catch (e) {}
      console.warn(`[Auth] local save is owned by another account (${d.localAt} / Lv ${d.localTotalLv}); parking it instead of uploading.`);
      if (already) return;   // belt-and-braces: never loop on a park that didn't take. Gate stays HELD.
      try { sessionStorage.setItem('hr:foreignParked', local.currentUser); } catch (e) {}
      try { if (typeof window.parkLocalSave === 'function') window.parkLocalSave('foreign'); } catch (e) {}
      // Gate deliberately stays HELD — no snapshot may leave this tab before the
      // reload replaces G with something this account actually owns.
      location.reload();
      return;
    }

    if (d.action !== 'restore' || restoredAlready || !window.G) {
      // 'none'/'adopt' → local stays live and sync.js uploads it (that IS adoption
      // in a cloud-authoritative model: cloud simply catches up to local).
      console.log(`[Auth] keeping local save (${d.action}/${d.reason}; localAt ${d.localAt} vs cloudAt ${d.cloudAt}, Lv ${d.localTotalLv} vs ${d.cloudTotalLv}).`);
      releaseSnapshots();   // definitive decision reached → uploads may resume
      return;
    }

    // Cloud is newer → it is authoritative. Overlay its fields onto G. snapshot()
    // omits the NO_SYNC set (in-flight combat/activity, combatLog,
    // lastOfflineSummary, derived totalLevel/combatLevel) and `_`-prefixed
    // scratch — including the b318 `_saveOwner` stamp, which is device-local
    // identity and must never ride to the cloud — so those survive the overlay.
    // b318 CORRECTION: this comment previously claimed lastSeen and
    // offlineBudget were NO_SYNC device-local journal. They are NOT in NO_SYNC
    // (src/net/events.js) — both ARE uploaded, and both are explicitly
    // re-stamped to cloudAt immediately below precisely because the overlay
    // brings the cloud's copies with it. Behaviour unchanged; the comment was
    // simply wrong and would have misled the next person to touch this.
    const cloudAt = d.cloudAt || Date.now();
    delete snap.__cloudSavedAt;                       // never let our meta keys land in G
    delete snap.__device;                             // (b301 concurrent-device marker)
    Object.assign(window.G, snap);
    // Reset the offline watermark to the cloud's save time so the returning-
    // player catch-up credits the gap since the account was LAST active anywhere,
    // not since this (possibly long-idle) device last saved.
    window.G.lastSeen = cloudAt;
    if (window.G.offlineBudget && typeof window.G.offlineBudget === 'object') {
      window.G.offlineBudget.at = cloudAt;
    }
    try { sessionStorage.setItem('hr:cloudRestoreDone', '1'); } catch (e) {}
    try { sessionStorage.setItem('hr:restoredFromCloud', '1'); } catch (e) {}   // toast after reload
    console.log(`[Auth] restoring newer cloud save (cloudAt ${cloudAt} > localAt ${d.localAt}; Lv ${d.cloudTotalLv}).`);
    releaseSnapshots();   // we have the authoritative save; the reload re-reconciles cleanly
    if (typeof window.saveLocal === 'function') window.saveLocal();
    location.reload();
  } catch (e) {
    // An UNEXPECTED failure mid-reconcile is treated exactly like an unknown
    // cloud: keep the gate HELD (never upload a possibly-fresh local over an
    // unread cloud) and retry with backoff.
    console.warn('[Auth] reconcile failed:', e && e.message);
    reconcileAttempts++;
    const delay = Math.min(RECONCILE_MAX_DELAY, 4000 * reconcileAttempts);
    setTimeout(() => { pullAndMaybeRestore(); }, delay);
  }
}

// ── Public actions ──

export async function signUp(email, password, metadata) {
  if (!supabase) throw new Error('Auth not configured');
  const opts = metadata ? { email, password, options: { data: metadata } } : { email, password };
  const { data, error } = await supabase.auth.signUp(opts);
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Auth not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // b318 (V2): signing out used to remove ONLY the session key, leaving this
  // account's SAVE_KEY blob live in localStorage. The next account to sign in on
  // this device booted the PREVIOUS player's character and — if it was newer —
  // uploaded it over their own cloud save. Park the save (never destroy it: a
  // same-owner sign-in un-parks it, so unsynced offline progress survives) and
  // stop uploads so nothing can be written after the session ends.
  try { holdSnapshots(); } catch (e) {}
  try { if (typeof window.parkLocalSave === 'function') window.parkLocalSave('signout'); } catch (e) {}
  if (!supabase) { session = null; try { localStorage.removeItem(LOCAL_KEY); } catch (e) {} return; }
  await supabase.auth.signOut();
  session = null;
  localStorage.removeItem(LOCAL_KEY);
}

/** The user id carried by a supabase session object, or null. Pure. */
export function readUserIdFromSession(s) {
  const id = s && s.user && s.user.id;
  return (typeof id === 'string' && id) ? id : null;
}

/**
 * The signed-in user id, readable at ANY point in boot — from the live session
 * if setupAuth() has run, otherwise from the cached session blob. legacy.js
 * needs this inside loadLocal()/saveLocal(), which run before this module's
 * session variable is necessarily populated, so it must not depend on init order.
 */
export function currentUserId() {
  const live = readUserIdFromSession(session);
  if (live) return live;
  try { return readUserIdFromSession(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')); }
  catch (e) { return null; }
}

export function getSession() {
  return session;
}

export function isSignedIn() {
  return !!session?.access_token;
}

// Expose the shared Supabase client so other backends (chat, market, etc.)
// can reuse it instead of each calling createClient() and tripping the
// "Multiple GoTrueClient instances detected" warning. Returns null until
// setupAuth() has finished — callers should fall through to createClient
// in that case.
export function getClient() {
  return supabase;
}

// ── UI: replace the topbar Sign In button with a real flow ──

function renderAuthUi() {
  const banner = document.getElementById('status-pill') || document.getElementById('hr-auth-banner');
  if (banner) {
    /* b217: this wrote the whole pill as textContent with a 🟢/⚪ emoji in
       front — which also blew away the styled `.dot` span the markup ships,
       replacing a themed status light with a system pictograph. Set the LABEL
       and let the class drive the light. */
    const label = banner.querySelector('span:last-child') || banner;
    if (session?.user) {
      banner.classList.remove('off');
      /* b241 (paione): this printed the raw account EMAIL on the topbar status
         pill — long enough to overlap the stat chips on a phone, and it leaked
         the address into every screenshot. The pill is a CONNECTION indicator
         (the green dot is the signal); the player's name is already shown beside
         it. So it reads "Online", not an email. */
      label.textContent = 'Online';
    } else {
      banner.classList.add('off');
      /* b224: was "Offline · sign in to sync" / "Offline play" — a standing
         invitation to play without an account, which the product no longer
         offers. Inside a session this state means the token lapsed or the
         network went, not that account-less play is on the menu. */
      label.textContent = authConfig ? 'Signed out' : 'Offline';
    }
  }
  // Replace the "Sign in" button on the profile dashboard if it exists
  document.querySelectorAll('button').forEach((b) => {
    if (b.textContent.trim() === 'Sign in' && !b._authPatched) {
      b._authPatched = true;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthModal();
      });
    }
  });
}

function showAuthModal() {
  if (!authConfig) {
    alert('Cloud sync isn\'t configured yet. Talk to your developer to set up Supabase.');
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <form style="background:#1a1f2e;border:2px solid #f3d181;border-radius:8px;padding:20px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px;color:#dfe9ee;font-family:system-ui,sans-serif">
      <h3 style="margin:0;color:#f3d181">Sign in to Hearthrise</h3>
      <p style="margin:0;font-size:calc(14.5px * var(--ui-scale, 1));color:#9aa3b0">Sync your save across devices, join clans, climb leaderboards.</p>
      <input type="email" name="email" placeholder="Email" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />
      <input type="password" name="password" placeholder="Password" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" data-action="signin" style="flex:1;padding:8px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Sign In</button>
        <button type="button" data-action="signup" style="flex:1;padding:8px;background:#5fcc7c;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Create Account</button>
      </div>
      <button type="button" data-action="cancel" style="padding:6px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1))">Cancel</button>
      <div data-status style="font-size:calc(14.5px * var(--ui-scale, 1));color:#e88a8a;min-height:14px;text-align:center"></div>
    </form>
  `;
  const form = overlay.querySelector('form');
  const status = overlay.querySelector('[data-status]');
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('[data-action="cancel"]').onclick = close;

  async function attempt(fn) {
    status.textContent = 'Working…';
    try {
      const email = form.email.value.trim();
      const password = form.password.value;
      const data = await fn(email, password);
      status.style.color = '#5fcc7c';
      status.textContent = '✓ Signed in. Syncing…';
      setTimeout(close, 800);
    } catch (e) {
      status.style.color = '#e88a8a';
      status.textContent = e.message || 'Sign in failed';
    }
  }
  overlay.querySelector('[data-action="signin"]').onclick = (e) => { e.preventDefault(); attempt(signIn); };
  overlay.querySelector('[data-action="signup"]').onclick = (e) => { e.preventDefault(); attempt(signUp); };
  document.body.appendChild(overlay);
}

// b302: this device was kicked (account opened elsewhere). Stop everything that
// could overwrite the new device's save, then show a blocking, self-contained
// lock screen. Inline styles + max z-index on purpose — it must render even if
// the game's own CSS is mid-teardown. "Use here instead" re-claims for this
// device and reloads (which then evicts the other one on its next poll).
function showEvictedGate() {
  try { if (window.HearthriseSync && window.HearthriseSync.pauseSync) window.HearthriseSync.pauseSync(); } catch (e) {}
  try { if (typeof window.stopCombat === 'function') window.stopCombat(); } catch (e) {}
  try { if (typeof window.stopSkill === 'function') window.stopSkill(); } catch (e) {}
  if (document.getElementById('hr-evicted-gate')) return;
  const el = document.createElement('div');
  el.id = 'hr-evicted-gate';
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(9,12,17,.94)', 'color:#f2e9d8',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'text-align:center', 'padding:24px', 'box-sizing:border-box',
    'font:400 16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'backdrop-filter:blur(3px)'
  ].join(';');
  el.innerHTML =
    '<div style="max-width:460px">' +
    '<div style="font-size:44px;margin-bottom:8px">🔒</div>' +
    '<h2 style="font-family:Cinzel,serif;font-size:24px;margin:0 0 10px">Signed out here</h2>' +
    '<p style="margin:0 0 6px">Your account was just opened on another device.</p>' +
    '<p style="margin:0 0 20px;opacity:.8">Hearthrise runs on one device at a time, so this one has paused to keep your progress safe.</p>' +
    '<button id="hr-evicted-usehere" style="font:600 16px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:10px;padding:14px 22px;cursor:pointer">Use this device instead</button>' +
    '<div style="margin-top:14px;font-size:13px;opacity:.6">Tap above to move your session here (this will sign the other device out).</div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(el);
  const btn = el.querySelector('#hr-evicted-usehere');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Moving your session…';
    try { if (window.HearthriseSync && window.HearthriseSync.claimSession) await window.HearthriseSync.claimSession(); } catch (e) {}
    location.reload();
  });
}

// Expose for legacy callers
window.HearthriseAuth = { setupAuth, signUp, signIn, signOut, getSession, isSignedIn, getClient, currentUserId, decideLocalOwnership };

// Auto-render banner state once on load (in case the user is already signed in)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderAuthUi, 500));
} else {
  setTimeout(renderAuthUi, 500);
}

// b300: after a cloud-restore reload, tell the player their newer save was
// pulled in — a silent state swap on sign-in would otherwise look like a bug.
try {
  if (sessionStorage.getItem('hr:restoredFromCloud') === '1') {
    sessionStorage.removeItem('hr:restoredFromCloud');
    setTimeout(() => { if (typeof window.notify === 'function') window.notify('☁️ Restored your latest progress from the cloud.', 'info'); }, 1800);
  }
} catch (e) {}
