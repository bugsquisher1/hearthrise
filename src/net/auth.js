// Supabase auth scaffold — drop-in module that handles sign-in / sign-up flows
// and wires the resulting session into the cloud-sync adapter.
//
// Tyler hasn't created the Supabase project yet, so this module is INERT until
// he calls setupAuth({url, anonKey}). When he does, signIn() / signUp() / signOut()
// become live, and cloud-sync auto-upgrades from offline to live.

import { setupSync, pullLatest } from './sync.js';

let supabase = null;       // lazy-loaded supabase client
let authConfig = null;     // {url, anonKey}
let session = null;        // current session

const LOCAL_KEY = 'hearthrise:supabaseSession';

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
    supabase = mod.createClient(config.url, config.anonKey);
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

  // Auth state listener — keep session in localStorage + reconfigure sync
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (newSession) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(newSession));
      enableLiveSync();
    } else {
      localStorage.removeItem(LOCAL_KEY);
      // Sync stays in offline mode (events buffer to localStorage)
    }
    renderAuthUi();
  });

  if (session) enableLiveSync();
  renderAuthUi();
}

function enableLiveSync() {
  if (!authConfig || !session) return;
  setupSync({
    endpoint: `${authConfig.url}/rest/v1/game_events`,
    snapshotEndpoint: `${authConfig.url}/rest/v1/game_snapshots`,
    apiKey: authConfig.anonKey,
    authToken: () => session?.access_token,
    userId: () => session?.user?.id,
    batchIntervalMs: 5000,
    snapshotIntervalMs: 60000,
  });
  // Pull cloud snapshot on first connection if local save is older
  pullAndMaybeRestore();
}

async function pullAndMaybeRestore() {
  try {
    const snap = await pullLatest();
    if (!snap) return;
    // Conflict resolution: take whichever has the higher totalLevel +
    // most recent saveAt. This is a v1 stub; refine later.
    const localTotalLv = window.G && (window.G.totalLevel || 0);
    const cloudTotalLv = snap.totalLevel || 0;
    if (cloudTotalLv > localTotalLv) {
      const ok = confirm(
        `Cloud save found (Total Lv ${cloudTotalLv} vs local Lv ${localTotalLv}).\n\n` +
        `Restore from cloud?`
      );
      if (ok && window.G) {
        Object.assign(window.G, snap);
        if (typeof window.saveLocal === 'function') window.saveLocal();
        location.reload();
      }
    }
  } catch (e) {
    console.warn('[Auth] pull failed:', e.message);
  }
}

// ── Public actions ──

export async function signUp(email, password) {
  if (!supabase) throw new Error('Auth not configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
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

// ── UI: replace the topbar Sign In button with a real flow ──

function renderAuthUi() {
  const banner = document.getElementById('status-pill') || document.getElementById('hr-auth-banner');
  if (banner) {
    if (session?.user) {
      banner.textContent = '🟢 ' + (session.user.email || 'Online');
    } else if (authConfig) {
      banner.textContent = '⚪ Offline · sign in to sync';
    } else {
      banner.textContent = '⚪ Offline play';
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
      <p style="margin:0;font-size:12px;color:#9aa3b0">Sync your save across devices, join clans, climb leaderboards.</p>
      <input type="email" name="email" placeholder="Email" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />
      <input type="password" name="password" placeholder="Password" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" data-action="signin" style="flex:1;padding:8px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Sign In</button>
        <button type="button" data-action="signup" style="flex:1;padding:8px;background:#5fcc7c;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Create Account</button>
      </div>
      <button type="button" data-action="cancel" style="padding:6px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer;font-size:11px">Cancel · Continue Offline</button>
      <div data-status style="font-size:11px;color:#e88a8a;min-height:14px;text-align:center"></div>
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
window.HearthriseAuth = { setupAuth, signUp, signIn, signOut, getSession, isSignedIn };

// Auto-render banner state once on load (in case the user is already signed in)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderAuthUi, 500));
} else {
  setTimeout(renderAuthUi, 500);
}
