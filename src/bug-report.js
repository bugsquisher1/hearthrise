// ============================================================
// src/bug-report.js
//
// One-click bug reporter for beta testers. Renders a tiny "🐛 Report
// bug" button into the topbar. On click, captures:
//
//   • Build version (from build-info.js)
//   • Recent console errors (last 50, intercepted at boot)
//   • Current tab + active activity
//   • Lightweight game state snapshot (~no PII, no save dump)
//   • User-typed description
//
// Sends to:
//   1. Discord webhook (if HearthriseBugReport.webhookUrl is set)
//   2. Supabase `bug_reports` table (always, if signed in)
//   3. localStorage queue (last resort, retried on next load)
//
// Tyler: paste a Discord webhook URL into the constant below.
// To create one: Discord server → Channel settings → Integrations
// → Webhooks → New Webhook → "Copy Webhook URL".
// ============================================================

const DISCORD_WEBHOOK_URL = ''; // ← paste yours here, or set window.HearthriseBugReport.webhookUrl at runtime

const MAX_CONSOLE_BUFFER = 50;
const QUEUE_KEY = 'hearthrise:bug-queue';
const consoleBuffer = [];

// Intercept console.error / .warn so we can attach recent errors to reports.
function installConsoleHook() {
  ['error', 'warn'].forEach((level) => {
    const orig = console[level];
    console[level] = function (...args) {
      try {
        consoleBuffer.push({
          level, ts: Date.now(),
          msg: args.map(a => {
            if (a instanceof Error) return a.stack || a.message;
            try { return typeof a === 'string' ? a : JSON.stringify(a); }
            catch { return String(a); }
          }).join(' '),
        });
        if (consoleBuffer.length > MAX_CONSOLE_BUFFER) consoleBuffer.shift();
      } catch {}
      return orig.apply(this, args);
    };
  });
  // Also catch uncaught errors
  window.addEventListener('error', (e) => {
    consoleBuffer.push({ level: 'uncaught', ts: Date.now(),
      msg: (e.error?.stack || e.message || String(e)) });
    if (consoleBuffer.length > MAX_CONSOLE_BUFFER) consoleBuffer.shift();
  });
  window.addEventListener('unhandledrejection', (e) => {
    consoleBuffer.push({ level: 'rejection', ts: Date.now(),
      msg: String(e.reason?.stack || e.reason || e) });
    if (consoleBuffer.length > MAX_CONSOLE_BUFFER) consoleBuffer.shift();
  });
}

function gameStateSnapshot() {
  const G = window.G || {};
  // Keep this small + safe — no full save dump, no PII.
  const skills = G.skills || {};
  const skillLevels = Object.fromEntries(
    Object.entries(skills).map(([k, v]) => [k, (v && v.level) || 0])
  );
  return {
    playerName: G.playerName || null,
    activeTab: window.activeTab || G.activeTab || null,
    totalLevel: G.totalLevel || 0,
    gold: G.gold || 0,
    activity: G.activity || G.currentActivity || null,
    skillLevels,
    inventoryCount: Array.isArray(G.inventory) ? G.inventory.length : 0,
    sessionMin: G.sessionStart ? Math.round((Date.now() - G.sessionStart) / 60000) : null,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ua: navigator.userAgent.slice(0, 200),
  };
}

function buildVersionString() {
  return (window.HearthriseBuild && window.HearthriseBuild.buildString && window.HearthriseBuild.buildString())
      || 'unknown-build';
}

async function sendDiscord(payload) {
  const url = (window.HearthriseBugReport && window.HearthriseBugReport.webhookUrl) || DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: true };
  const body = {
    username: 'Hearthrise Beta Bot',
    embeds: [{
      title: '🐛 ' + (payload.summary || 'Bug report'),
      description: payload.description || '(no description)',
      color: 0xe88a8a,
      fields: [
        { name: 'Build',  value: '`' + payload.build + '`', inline: true },
        { name: 'Player', value: payload.user || 'guest',     inline: true },
        { name: 'Tab',    value: String(payload.state.activeTab || '—'), inline: true },
        { name: 'State',  value: '```json\n' + JSON.stringify(payload.state, null, 2).slice(0, 900) + '\n```' },
        { name: 'Recent errors', value: payload.errors.length
            ? '```\n' + payload.errors.map(e => `[${e.level}] ${e.msg}`).join('\n').slice(0, 900) + '\n```'
            : '_(none)_' },
      ],
      timestamp: new Date().toISOString(),
    }],
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendSupabase(payload) {
  const cfg = window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig();
  const session = window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession();
  if (!cfg || !session) return { ok: false, skipped: true };
  try {
    const res = await fetch(cfg.url + '/rest/v1/bug_reports', {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        build_version: payload.build,
        summary: payload.summary,
        description: payload.description,
        state: payload.state,
        errors: payload.errors,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function enqueue(payload) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-25))); // cap
  } catch {}
}

async function flushQueue() {
  let q;
  try { q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return; }
  if (!q.length) return;
  const remaining = [];
  for (const p of q) {
    const [a, b] = await Promise.all([sendDiscord(p), sendSupabase(p)]);
    if (!a.ok && !b.ok && !(a.skipped && b.skipped)) remaining.push(p);
  }
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining)); } catch {}
}

async function submit({ summary, description }) {
  const payload = {
    summary: summary || '(no summary)',
    description: description || '',
    build: buildVersionString(),
    user: (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()?.user?.email)
       || (window.G && window.G.playerName) || 'guest',
    state: gameStateSnapshot(),
    errors: consoleBuffer.slice(-20),
    ts: new Date().toISOString(),
  };
  const [a, b] = await Promise.all([sendDiscord(payload), sendSupabase(payload)]);
  const ok = a.ok || b.ok;
  if (!ok && !(a.skipped && b.skipped)) enqueue(payload);
  return { ok, discord: a, supabase: b };
}

// ── UI ────────────────────────────────────────────────────────

function renderButton() {
  if (document.getElementById('hr-bug-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'hr-bug-btn';
  btn.className = 'btn btn-sm';
  btn.title = 'Report a bug';
  btn.textContent = '🐛';
  // Position above the chat dock so they don't overlap.
  // Chat lives at right:12px;bottom:12px, so we sit on top of it.
  btn.style.cssText = 'position:fixed;right:12px;bottom:60px;z-index:9998;padding:6px 9px;background:rgba(20,25,40,.85);color:#f3d181;border:1px solid #2a3142;border-radius:8px;font-size:14px;cursor:pointer;backdrop-filter:blur(4px);line-height:1';
  btn.addEventListener('click', openModal);
  document.body.appendChild(btn);
}

function openModal() {
  if (document.getElementById('hr-bug-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'hr-bug-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <form style="background:#1a1f2e;border:2px solid #f3d181;border-radius:8px;padding:18px;max-width:440px;width:100%;display:flex;flex-direction:column;gap:10px;color:#dfe9ee;font-family:system-ui,sans-serif">
      <h3 style="margin:0;color:#f3d181">🐛 Report a bug</h3>
      <p style="margin:0;font-size:12px;color:#9aa3b0">Thanks for testing! We'll auto-attach your build version, current tab, and recent errors. Don't include passwords or anything private.</p>
      <input name="summary" placeholder="One-line summary (e.g. 'inventory empty after combat')" required maxlength="120" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />
      <textarea name="description" placeholder="What happened? What did you expect? Steps to reproduce?" rows="5" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit"></textarea>
      <div style="display:flex;gap:8px">
        <button type="submit" style="flex:1;padding:8px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Send report</button>
        <button type="button" data-act="cancel" style="padding:8px 14px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer">Cancel</button>
      </div>
      <div data-status style="font-size:11px;color:#9aa3b0;min-height:14px;text-align:center"></div>
    </form>
  `;
  const form = overlay.querySelector('form');
  const status = overlay.querySelector('[data-status]');
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Sending…';
    const result = await submit({
      summary: form.summary.value.trim(),
      description: form.description.value.trim(),
    });
    if (result.ok) {
      status.style.color = '#5fcc7c';
      status.textContent = '✓ Sent. Thanks!';
      setTimeout(close, 1100);
    } else if (result.discord?.skipped && result.supabase?.skipped) {
      status.style.color = '#e8c878';
      status.textContent = 'Saved locally — will send when online.';
      setTimeout(close, 1500);
    } else {
      status.style.color = '#e88a8a';
      status.textContent = 'Send failed — saved locally, will retry.';
    }
  });
  document.body.appendChild(overlay);
  setTimeout(() => form.summary.focus(), 50);
}

// ── Boot ──────────────────────────────────────────────────────

installConsoleHook();
window.HearthriseBugReport = {
  open: openModal,
  submit,
  webhookUrl: DISCORD_WEBHOOK_URL,
  flushQueue,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderButton(); flushQueue(); });
} else {
  renderButton();
  flushQueue();
}
