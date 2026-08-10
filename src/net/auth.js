// Supabase auth scaffold — drop-in module that handles sign-in / sign-up flows
// and wires the resulting session into the cloud-sync adapter.
//
// Tyler hasn't created the Supabase project yet, so this module is INERT until
// he calls setupAuth({url, anonKey}). When he does, signIn() / signUp() / signOut()
// become live, and cloud-sync auto-upgrades from offline to live.

import { setupSync, pullLatest } from './sync.js?v=310';

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
 * @param {{lastSeen:number, totalLevel:number}} local  local freshness + size
 * @param {object|null} snap  cloud snapshot; reads snap.__cloudSavedAt (ms) with
 *                            snap.lastSeen as a fallback, and snap.totalLevel.
 * @returns {{action:'none'|'adopt'|'restore', localAt:number, cloudAt:number,
 *            localTotalLv:number, cloudTotalLv:number, reason:string}}
 */
export function decideRestore(local, snap) {
  local = local || {};
  const localAt = Number(local.lastSeen) || 0;
  const localTL = Number(local.totalLevel) || 0;
  const base = { localAt, cloudAt: 0, localTotalLv: localTL, cloudTotalLv: 0 };
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
  return { action: 'adopt', reason: 'local-fresh', ...full };
}

async function pullAndMaybeRestore() {
  try {
    // b300: one cloud-restore per tab session. The restore path reloads, and
    // after the reload local == cloud so decideRestore returns 'adopt' — but this
    // guard is belt-and-suspenders against clock skew making cloudAt persistently
    // look newer and re-triggering a reload loop.
    let restoredAlready = false;
    try { restoredAlready = sessionStorage.getItem('hr:cloudRestoreDone') === '1'; } catch (e) {}

    const snap = await pullLatest();
    const local = {
      lastSeen: (window.G && Number(window.G.lastSeen)) || 0,
      totalLevel: (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0)
        || (window.G && window.G.totalLevel) || 0,
    };
    const d = decideRestore(local, snap);

    if (d.action !== 'restore' || restoredAlready || !window.G) {
      // 'none'/'adopt' → local stays live and sync.js uploads it (that IS adoption
      // in a cloud-authoritative model: cloud simply catches up to local).
      console.log(`[Auth] keeping local save (${d.action}/${d.reason}; localAt ${d.localAt} vs cloudAt ${d.cloudAt}, Lv ${d.localTotalLv} vs ${d.cloudTotalLv}).`);
      return;
    }

    // Cloud is newer → it is authoritative. Overlay its fields onto G. Because
    // snapshot() excludes the NO_SYNC device-local journal (activeMonster,
    // activeSkill, lastSeen, offlineBudget…), those survive the overlay — the
    // cloud wins only for the SYNCED progress (skills/gold/items/quests/…).
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
    if (typeof window.saveLocal === 'function') window.saveLocal();
    location.reload();
  } catch (e) {
    console.warn('[Auth] pull failed:', e.message);
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
  if (!supabase) return;
  await supabase.auth.signOut();
  session = null;
  localStorage.removeItem(LOCAL_KEY);
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
window.HearthriseAuth = { setupAuth, signUp, signIn, signOut, getSession, isSignedIn, getClient };

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
