// ============================================================
// src/bug-report.js
//
// One-click bug reporter for beta testers. Renders a tiny "🐛 Report
// bug" button. On click, captures:
//
//   • Build version (from build-info.js)
//   • Recent console errors (last 50, intercepted at boot)
//   • Current tab + active activity
//   • Lightweight game state snapshot (no PII, no save dump)
//   • User-typed description
//   • SCREENSHOT of the current viewport (b117) via html2canvas
//
// Sends to (in order, fan-out via Cloudflare Worker if BRIDGE_URL set):
//   1. Bridge worker → Discord channel + GitHub Issue (preferred)
//   2. Discord webhook directly (fallback)
//   3. Supabase `bug_reports` table (if signed in)
//   4. localStorage queue (last resort, retried on next load)
//
// Setup: see BUG_REPORT_PIPELINE.md
// ============================================================

// Bridge worker URL — Cloudflare Worker that forwards to Discord + GitHub.
// When configured, this single endpoint replaces the Discord-only path:
// game → BRIDGE_URL → Discord channel + GitHub Issue (with screenshot inline).
// Until the worker is deployed, leave blank; the direct Discord path below
// is the active route.
const BRIDGE_URL = ''; // ← paste Cloudflare Worker URL here once deployed

// Direct Discord webhook URL — TEMPORARY until BRIDGE_URL is configured.
// This URL is in the public JS bundle, so it's scrapable. Risk profile:
//   • Worst case: someone scrapes + spams the #bug-reports channel
//   • Mitigation: regenerate the webhook URL in Discord (30 seconds)
// Once the bridge worker is deployed, the URL moves to a Cloudflare secret
// and this constant goes back to ''.
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1500768393299759277/R6nNNFABoL3FeYj3tA9XimwCKW6m1oaYv0LHQYaqEezsdzcSiAouKyYe2Brm8Uzyu5k0';

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

// Capture a screenshot of the current viewport via html2canvas (CDN).
// Returns a base64 JPEG data URL or null on failure. Doesn't throw —
// bug reporting must keep working even if screenshot capture fails.
//
// b121: filter out the bug-report modal itself + the 🐛 button so the
// screenshot shows what the user was actually looking at, not the modal
// they just opened. Also filter the chat dock if it's open — those float
// over content and aren't usually what the report is about.
async function captureScreenshot() {
  try {
    // Dynamic import keeps html2canvas (~50KB) out of the main bundle.
    const mod = await import('https://cdn.skypack.dev/html2canvas');
    const h2c = mod.default || mod;
    // scale: 0.5 cuts resolution in half — usable detail at ~25% file size.
    // Mobile bug reports especially benefit from smaller payloads.
    const canvas = await h2c(document.body, {
      scale: 0.5,
      logging: false,
      backgroundColor: null,
      useCORS: true,
      // Skip pseudo-elements + bg images that often cause CORS errors —
      // we want a screenshot, not a perfect render.
      imageTimeout: 1500,
      removeContainer: true,
      // Exclude floating UI that obscures the actual game state.
      ignoreElements: function(el) {
        if (!el || !el.id) return false;
        return el.id === 'hr-bug-modal'
            || el.id === 'hr-bug-btn'
            || el.id === 'chat-dock'
            || el.id === 'more-modal';
      },
    });
    // 0.7 quality JPEG keeps file size ~30-80KB at 0.5 scale.
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (err) {
    console.warn('[bug-report] screenshot capture failed:', err.message);
    return null;
  }
}

// Send to the bridge worker — single endpoint, fans out to Discord + GitHub.
async function sendBridge(payload) {
  const url = (window.HearthriseBugReport && window.HearthriseBugReport.bridgeUrl) || BRIDGE_URL;
  if (!url) return { ok: false, skipped: true };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Convert a data: URL into a Blob for FormData attachment.
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function sendDiscord(payload) {
  const url = (window.HearthriseBugReport && window.HearthriseBugReport.webhookUrl) || DISCORD_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: true };

  const embed = {
    title: '🐛 ' + (payload.summary || 'Bug report'),
    description: payload.description || '(no description)',
    color: 0xd44a3a,
    fields: [
      { name: 'Build',    value: '`' + payload.build + '`', inline: true },
      { name: 'Player',   value: payload.user || 'guest',    inline: true },
      { name: 'Tab',      value: String(payload.state.activeTab || '—'), inline: true },
      { name: 'Viewport', value: String(payload.state.viewport || '—'), inline: true },
      { name: 'State',    value: '```json\n' + JSON.stringify(payload.state, null, 2).slice(0, 900) + '\n```' },
      { name: 'Recent errors', value: payload.errors.length
          ? '```\n' + payload.errors.map(e => `[${e.level}] ${e.msg}`).join('\n').slice(0, 900) + '\n```'
          : '_(none)_' },
    ],
    timestamp: new Date().toISOString(),
  };

  // b120: when we have a screenshot, attach it via multipart form-data and
  // reference it in the embed's image field so Discord renders it inline.
  // Without this, the screenshot was being captured but never appeared in
  // the channel — Tyler asked specifically to see it in the message.
  if (payload.screenshot && payload.screenshot.startsWith('data:image/')) {
    embed.image = { url: 'attachment://screenshot.jpg' };
    const body = {
      username: 'Hearthrise Bug Bot',
      embeds: [embed],
      attachments: [{ id: 0, filename: 'screenshot.jpg', description: 'Bug report screenshot' }],
    };
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(body));
    fd.append('files[0]', dataUrlToBlob(payload.screenshot), 'screenshot.jpg');
    try {
      const res = await fetch(url, { method: 'POST', body: fd });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // No screenshot — fall back to JSON-only embed.
  const body = {
    username: 'Hearthrise Bug Bot',
    embeds: [embed],
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
  // Capture screenshot first — must happen before the modal closes
  // (otherwise we'd screenshot the closing modal, which is meaningless).
  // Fail-soft: if capture errors, payload.screenshot stays null.
  const screenshot = await captureScreenshot();

  const payload = {
    summary: summary || '(no summary)',
    description: description || '',
    build: buildVersionString(),
    user: (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()?.user?.email)
       || (window.G && window.G.playerName) || 'guest',
    state: gameStateSnapshot(),
    errors: consoleBuffer.slice(-20),
    screenshot,
    ts: new Date().toISOString(),
  };
  // Fan-out: bridge worker first (covers Discord + GitHub in one POST),
  // then the legacy direct paths as fallbacks. If bridge succeeds the
  // others are still useful as redundancy but not required.
  const [bridge, discord, supabase] = await Promise.all([
    sendBridge(payload),
    sendDiscord(payload),
    sendSupabase(payload),
  ]);
  const ok = bridge.ok || discord.ok || supabase.ok;
  if (!ok && !(bridge.skipped && discord.skipped && supabase.skipped)) {
    // Don't queue the screenshot — too large for localStorage in volume.
    enqueue({ ...payload, screenshot: null });
  }
  return { ok, bridge, discord, supabase };
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" style="flex:1;min-width:120px;padding:8px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Send report</button>
        <button type="button" data-act="copy" title="Copy report to clipboard so you can paste into Discord/email/etc" style="padding:8px 12px;background:#2a3142;color:#f3d181;border:1px solid #3a4252;border-radius:4px;cursor:pointer;font-weight:600">📋 Copy</button>
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
  overlay.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    // Build a Markdown-formatted dump the user can paste anywhere.
    // Captures a screenshot (b117) and embeds it as a base64 data URL —
    // works when pasted into anything that renders markdown (GitHub
    // Issues, our chat, etc.). Discord and similar will show the link.
    status.textContent = 'Capturing…';
    const screenshot = await captureScreenshot();
    const payload = {
      summary: form.summary.value.trim() || '(no summary)',
      description: form.description.value.trim() || '',
      build: buildVersionString(),
      user: (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()?.user?.email)
         || (window.G && window.G.playerName) || 'guest',
      state: gameStateSnapshot(),
      errors: consoleBuffer.slice(-20),
      screenshot,
      ts: new Date().toISOString(),
    };
    const md = ''
      + '## 🐛 ' + payload.summary + '\n\n'
      + (payload.description ? payload.description + '\n\n' : '')
      + '**Build:** `' + payload.build + '`  \n'
      + '**Player:** ' + payload.user + '  \n'
      + '**Tab:** ' + (payload.state.activeTab || '—') + '  \n'
      + '**Viewport:** ' + (payload.state.viewport || '—') + '  \n'
      + '**Time:** ' + payload.ts + '\n\n'
      + (screenshot ? '![screenshot](' + screenshot + ')\n\n' : '_(screenshot capture failed)_\n\n')
      + '<details><summary>State</summary>\n\n```json\n'
      + JSON.stringify(payload.state, null, 2)
      + '\n```\n\n</details>\n\n'
      + '<details><summary>Recent errors (' + payload.errors.length + ')</summary>\n\n```\n'
      + (payload.errors.length ? payload.errors.map(e => '[' + e.level + '] ' + e.msg).join('\n') : '(none)')
      + '\n```\n\n</details>\n';
    try {
      await navigator.clipboard.writeText(md);
      status.style.color = '#5fcc7c';
      status.textContent = '✓ Copied to clipboard — paste anywhere.';
    } catch (err) {
      // Clipboard API requires a secure context + user gesture; fall back
      // to selecting the text in a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = md; ta.style.cssText = 'position:fixed;top:-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); status.textContent = '✓ Copied (legacy mode).'; }
      catch { status.textContent = 'Copy failed — your browser blocked clipboard access.'; }
      ta.remove();
    }
  });
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
  bridgeUrl: BRIDGE_URL,
  captureScreenshot,
  flushQueue,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderButton(); flushQueue(); });
} else {
  renderButton();
  flushQueue();
}
