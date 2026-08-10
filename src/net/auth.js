// Supabase auth scaffold — drop-in module that handles sign-in / sign-up flows
// and wires the resulting session into the cloud-sync adapter.
//
// Tyler hasn't created the Supabase project yet, so this module is INERT until
// he calls setupAuth({url, anonKey}). When he does, signIn() / signUp() / signOut()
// become live, and cloud-sync auto-upgrades from offline to live.

import { setupSync, pullLatest } from './sync.js?v=279';

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
    batchIntervalMs: 5000,
    snapshotIntervalMs: 60000,
  });
  // Pull cloud snapshot on first connection if local save is older
  pullAndMaybeRestore();
}

/**
 * THE SAVE-CONFLICT RULE, pure and exported so it can be tested without a
 * network, a session, or a live G. (b224 — it used to be inlined inside
 * pullAndMaybeRestore(), which made the one promise this project cannot break
 * — "a local save is never discarded silently" — unprovable.)
 *
 * The account wall means every player now signs in, and a beta player signing
 * in for the first time arrives here with a real local save and (usually) an
 * empty cloud. The three outcomes, and why:
 *
 *   'adopt'  — the cloud has nothing (or nothing better). The LOCAL save stays
 *              live and sync.js's next snapshot uploads it. This is what
 *              "adoption" mechanically is: we do nothing, and the local save
 *              becomes the account's save.
 *   'prompt' — both exist and the cloud is further along. The player is ASKED.
 *              Never resolved for them.
 *   'none'   — no cloud snapshot at all. Same practical effect as 'adopt',
 *              reported separately so the caller can tell "nothing to compare"
 *              from "compared, local won".
 *
 * There is deliberately NO branch that overwrites a local save without asking.
 * @returns {{action:'none'|'adopt'|'prompt', localTotalLv:number, cloudTotalLv:number}}
 */
export function decideRestore(localTotalLv, snap) {
  const local = Number(localTotalLv) || 0;
  if (!snap || typeof snap !== 'object') return { action: 'none', localTotalLv: local, cloudTotalLv: 0 };
  const cloud = Number(snap.totalLevel) || 0;
  if (cloud > local) return { action: 'prompt', localTotalLv: local, cloudTotalLv: cloud };
  return { action: 'adopt', localTotalLv: local, cloudTotalLv: cloud };
}

async function pullAndMaybeRestore() {
  try {
    const snap = await pullLatest();
    // NOTE: G has no stored `totalLevel` — it's computed from skills via
    // getTotalLevel(). Using G.totalLevel (undefined) made this gate always
    // 0 > 0 = false, so cloud restore NEVER fired and cross-device / fresh-
    // login progress silently failed to load.
    const localTotalLv = (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0)
      || (window.G && window.G.totalLevel) || 0;
    const d = decideRestore(localTotalLv, snap);
    if (d.action === 'none') return;
    if (d.action === 'adopt') {
      // The local save wins and is about to be uploaded by sync.js. Say so —
      // an existing beta player deserves to know their save was carried in.
      console.log(`[Auth] local save kept (Total Lv ${d.localTotalLv} vs cloud ${d.cloudTotalLv}) — it will be synced to this account.`);
      return;
    }
    const ok = confirm(
      `Cloud save found (Total Lv ${d.cloudTotalLv} vs local Lv ${d.localTotalLv}).\n\n` +
      `Restore from cloud?`
    );
    if (ok && window.G) {
      Object.assign(window.G, snap);
      if (typeof window.saveLocal === 'function') window.saveLocal();
      location.reload();
    }
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

// Expose for legacy callers
window.HearthriseAuth = { setupAuth, signUp, signIn, signOut, getSession, isSignedIn, getClient };

// Auto-render banner state once on load (in case the user is already signed in)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderAuthUi, 500));
} else {
  setTimeout(renderAuthUi, 500);
}
