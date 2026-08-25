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
// Sends to (in order — first success wins, no fan-out):
//   1. Supabase Edge Function `bug-report-bridge` → Discord (preferred)
//   2. Supabase `bug_reports` table directly (if the relay is unreachable)
//   3. localStorage queue (last resort, retried on next load)
//
// ════════════════════════════════════════════════════════════════════
// NO SECRETS IN THIS FILE. EVER. THIS IS THE RULE, NOT A PREFERENCE.
//
// This file is compiled into the public bundle AND hearthrise.net is GitHub
// Pages serving a PUBLIC repo, so anything written here is readable by anyone
// — and stays readable in git history forever, even after it is deleted.
//
// Until 2026-08-11 this file hard-coded a LIVE Discord webhook URL. A webhook
// token permits POST (fake reports), PATCH (rename) and DELETE (destroy the
// webhook). The failure mode of a bug reporter is SILENCE, so if someone had
// deleted it, reports would simply have stopped arriving and nobody would have
// noticed. It has been regenerated; the new value exists ONLY as the Supabase
// Edge Function secret DISCORD_WEBHOOK_URL and must never re-enter source, a
// prompt, or a log.
//
// Do not add a URL, token, PAT or key constant here — not even a blank one to
// "fill in later". `tests/run-smoke.mjs` fails the build on any webhook URL
// found anywhere in the repo. If a delivery target needs a credential, it goes
// behind an Edge Function, like this one does.
// ════════════════════════════════════════════════════════════════════

// Path of the authenticated relay, appended to the configured Supabase URL.
// Not a secret: it is a public endpoint that requires a valid user JWT and
// rate-limits per account server-side.
const RELAY_PATH = '/functions/v1/bug-report-bridge';

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
  // b309: skills are stored as XP NUMBERS (not {level} objects), so the old
  // `v.level` read reported every skill as 0 while totalLevel showed 483 — the
  // report was self-contradicting garbage. Convert XP → level properly.
  const skills = G.skills || {};
  const lvl = (typeof window.levelFromXp === 'function') ? window.levelFromXp : null;
  const skillLevels = Object.fromEntries(
    Object.entries(skills).map(([k, v]) => [k, lvl ? lvl(v || 0) : (typeof v === 'number' ? v : ((v && v.level) || 0))])
  );
  // b309: inventory is an OBJECT {itemId: qty}, not an array — Array.isArray was
  // always false so this always reported 0. And derive the real current activity
  // + tab from the fields the engine actually uses.
  const inv = G.inventory && typeof G.inventory === 'object' ? Object.keys(G.inventory).length : 0;
  const activity = G.activeMonster ? ('combat:' + G.activeMonster)
    : (G.activeSkill ? (G.activeSkill + (G.skillTargetId ? ':' + G.skillTargetId : '')) : null);
  let tab = window.activeTab || G.activeTab || null;
  if (!tab) { try { const p = document.querySelector('#app .panel.active, .panel.active'); tab = p ? p.id : null; } catch (e) {} }
  return {
    playerName: G.playerName || null,
    activeTab: tab,
    totalLevel: (typeof window.getTotalLevel === 'function') ? window.getTotalLevel() : (G.totalLevel || 0),
    /* A bug report must say WHICH state the client was in. `G.gold || 0` would
       report "0 gold" for a player whose balance simply had not arrived — the
       single most misleading line this payload could carry, because it turns a
       transport problem into what looks like a lost fortune. */
    gold: (window.HearthriseBalance && typeof window.HearthriseBalance.balanceState === 'function')
      ? window.HearthriseBalance.balanceState(G).gold
      : (G.gold === undefined ? 'UNKNOWN:absent' : (G.gold || 0)),
    activity: activity,
    skillLevels,
    inventoryCount: inv,
    sessionMin: G.sessionStart ? Math.round((Date.now() - G.sessionStart) / 60000) : null,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    device: describeDevice(),
    orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
    ua: navigator.userAgent.slice(0, 200),
    // b308: the metrics that actually explain a "crunched UI" on one device but
    // not another — DPR, the physical screen vs the layout viewport (a big gap =
    // Desktop-site mode), page zoom, and the root font-size (a value above ~16px
    // means the OS Display/Font size is boosted, which squeezes every layout).
    metrics: deviceMetrics(),
  };
}

// b308 — layout-diagnostic metrics for the "works on my other Android, not this
// one" class of report. All best-effort; never throws.
function deviceMetrics() {
  const m = {};
  try { m.dpr = +(window.devicePixelRatio || 1).toFixed(2); } catch (e) {}
  try { m.screen = (window.screen ? `${screen.width}x${screen.height}` : '—'); } catch (e) {}
  try { m.zoom = (window.visualViewport && window.visualViewport.scale) ? +window.visualViewport.scale.toFixed(2) : 1; } catch (e) {}
  try { m.rootFont = getComputedStyle(document.documentElement).fontSize; } catch (e) {}
  // Layout-viewport-wider-than-physical-screen is the Desktop-site signature.
  try {
    const vw = window.innerWidth || 0, sw = screen.width || 0;
    m.desktopMode = (typeof window.__hrDesktopModeCheck === 'function')
      ? window.__hrDesktopModeCheck()
      : (sw > 0 && vw > sw * 1.4);
  } catch (e) {}
  // b316: the resolved safe-area insets (notch / home-indicator / rounded-corner
  // padding). The single most-requested field for debugging the remaining
  // iPhone layout bugs — a nonzero top/bottom explains clipped headers & nav.
  try { m.safeArea = readSafeAreaInsets(); } catch (e) {}
  return m;
}
if (typeof window !== 'undefined') window.__hrDeviceMetrics = deviceMetrics; // b308: exposed for the guard test

// A one-line human device/OS summary parsed from the UA — so a bug report reads
// "Android phone · landscape · build 262" at a glance instead of a raw UA blob.
// Most of this session's bugs were platform/orientation-specific, so this is the
// single most useful triage field. Best-effort; falls back to "Unknown device".
function describeDevice() {
  try {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 0 || /Mobi|Touch/.test(ua);
    let os = 'Unknown OS';
    if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone/.test(ua)) os = 'iOS (iPhone)';
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) os = 'iPadOS';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    const form = /iPad/.test(ua) ? 'tablet'
      : /Android/.test(ua) ? (/Mobi/.test(ua) ? 'phone' : 'tablet')
      : /iPhone/.test(ua) ? 'phone'
      : touch ? 'touch device' : 'desktop';
    const pwa = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone
      ? ' · installed PWA' : '';
    return `${os} ${form}${pwa}`;
  } catch (e) { return 'Unknown device'; }
}

// b316 — THE MOBILE FREEZE, CORRECTLY. b314 wrapped capture in withTimeout()
// using setTimeout, but the primary capture path (html-to-image toJpeg on
// document.body) walks the ENTIRE DOM calling getComputedStyle on every node and
// serialises an SVG <foreignObject> — all SYNCHRONOUSLY on the main thread. While
// that runs the event loop is blocked, so the setTimeout timeout callback CANNOT
// fire until the freeze is already over. The timeout only bounds the async CDN
// import(), never the rasterisation itself. So on a real phone the game still
// froze. The correct fix: never enter the heavy capture on a touch device, and
// never let the send await it. A text-only report is fully triageable.
//
// Detect by CAPABILITY (coarse pointer / touch points), not UA sniffing — that
// catches iOS Safari, Android, and any touch tablet without a brittle UA regex.
// `__hrForceTouch` is a test/override seam (true/false forces the answer).
function isTouchLikeDevice() {
  try {
    if (typeof window !== 'undefined' && window.__hrForceTouch === true) return true;
    if (typeof window !== 'undefined' && window.__hrForceTouch === false) return false;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return coarse || touch;
  } catch (e) { return false; }
}
if (typeof window !== 'undefined') window.__hrIsTouchDevice = isTouchLikeDevice;

// b316 — resolve the four env(safe-area-inset-*) values to ACTUAL pixels. Reading
// the CSS custom props (--safe-t etc.) directly is useless: a custom property
// stores the unresolved `env(...)` token, not the computed inset. A hidden probe
// whose padding is set to the env() functions makes the browser resolve them, and
// getComputedStyle then returns real px — exactly the notch/home-indicator data
// needed to debug the other layout bugs. Best-effort; never throws.
function readSafeAreaInsets() {
  const out = { t: '0px', b: '0px', l: '0px', r: '0px' };
  try {
    if (!document.body) return out;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;'
      + 'pointer-events:none;padding-top:env(safe-area-inset-top,0px);'
      + 'padding-bottom:env(safe-area-inset-bottom,0px);'
      + 'padding-left:env(safe-area-inset-left,0px);'
      + 'padding-right:env(safe-area-inset-right,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    out.t = cs.paddingTop || '0px';
    out.b = cs.paddingBottom || '0px';
    out.l = cs.paddingLeft || '0px';
    out.r = cs.paddingRight || '0px';
    probe.remove();
  } catch (e) {}
  return out;
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
// b295: html2canvas ships a CSS-Color-3 parser and throws
// "Attempting to parse an unsupported color function 'color'" the moment it
// meets a `color(srgb …)` value. Modern browsers serialise the COMPUTED result
// of our `color-mix(in srgb, …)` rules (20+ of them) in exactly that form, so a
// single such element anywhere on screen killed the whole screenshot — the one
// thing we most need from a bug report. Rather than tear color-mix out of the
// stylesheets, rewrite the offending computed values to plain rgb()/rgba() in
// the cloned DOM html2canvas is about to read. `in srgb` means the channels are
// already sRGB 0–1, so this is a lossless remap; display-p3/other spaces are
// approximated (fine for a screenshot).
// Pure: rewrite every CSS-Color-4 `color(<space> r g b [/ a])` token in a value
// string to plain rgb()/rgba(). Exposed for the smoke test. `in srgb` channels
// are already 0–1 sRGB, so this is exact; wide-gamut spaces are approximated.
function convertColorFns(v) {
  return String(v).replace(
    /color\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)/gi,
    (_, r, g, b, a) => {
      const c = (x) => Math.max(0, Math.min(255, Math.round(parseFloat(x) * 255)));
      return a != null ? `rgba(${c(r)},${c(g)},${c(b)},${a})` : `rgb(${c(r)},${c(g)},${c(b)})`;
    });
}
if (typeof window !== 'undefined') window.__hrConvertColorFns = convertColorFns;

function normalizeModernColors(doc) {
  const CONV = convertColorFns;
  const win = doc.defaultView || window;
  const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'background',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'boxShadow', 'textShadow', 'fill', 'stroke', 'caretColor'];
  const all = doc.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    let cs; try { cs = win.getComputedStyle(el); } catch (e) { continue; }
    for (let j = 0; j < PROPS.length; j++) {
      const p = PROPS[j];
      const val = cs[p];
      if (val && val.indexOf('color(') !== -1) {
        try { el.style[p] = CONV(val); } catch (e) {}
      }
    }
  }
}

// Floating UI that sits over the game and isn't what a report is about.
function isOverlayChrome(el) {
  if (!el || el.nodeType !== 1 || !el.id) return false;
  return el.id === 'hr-bug-modal'
      || el.id === 'hr-bug-btn'
      || el.id === 'chat-dock'
      || el.id === 'more-modal';
}

// b298 — THE ROOT-CAUSE FIX (proven in-browser, not guessed).
//
// html2canvas ships its OWN JavaScript CSS parser, and that parser predates
// CSS Color 4. The moment it meets a `color(srgb …)` value — which every modern
// browser produces as the COMPUTED form of our 20+ `color-mix(in srgb, …)` rules
// — it throws "Attempting to parse an unsupported color function 'color'" and the
// whole screenshot dies. b295/b296 tried to pre-rewrite those values in an
// onclone hook, but that can only touch element inline styles: it can NEVER reach
// PSEUDO-ELEMENTS (::before/::after), which is exactly where our themed color-mix
// rules live — so the crash kept happening (paione, twice).
//
// html-to-image takes a fundamentally different approach: it serialises the DOM
// into an SVG <foreignObject> and lets the BROWSER'S OWN renderer draw it. There
// is no JS color parser, so every CSS feature the browser supports — color-mix,
// color(), oklch, gradients, pseudo-elements — renders correctly. A minimal
// repro (docs: color-mix on an element AND a ::before) confirmed html2canvas
// FAILS with the exact error and html-to-image SUCCEEDS. This kills the entire
// bug class, permanently, regardless of what CSS we add later.
// b314 — THE MOBILE FREEZE FIX.
//
// Symptom (Tyler, iOS Safari): tapping "Send report" hung the whole game on
// "Sending…" forever. Root cause: submit() awaits captureScreenshot()
// UNCONDITIONALLY with no timeout, and captureScreenshot()'s primary path (a) does
// a bare `import()` of html-to-image from a CDN — which never resolves on a slow or
// dropped mobile connection — and (b) rasterises the ENTIRE document.body into an
// SVG <foreignObject>, which on iOS Safari with a large DOM can pin the main thread
// for tens of seconds or stall outright. Either way the report never sends and the
// UI is frozen.
//
// Fix: the screenshot is a NICE-TO-HAVE; the report is the point. Bound the whole
// capture with a hard timeout — if it doesn't finish, resolve null and let the
// report send text-only. Same guard wraps the CDN import so a hung fetch can't
// block forever. A report that arrives without a screenshot beats one that never
// arrives and takes the game down with it.
const CAPTURE_TIMEOUT_MS = 6000;

// Race a promise against a timer; resolve to `fallback` if it doesn't settle in ms.
// Never rejects — the timeout path is a resolve, so callers can always continue.
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      ()  => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }
    );
  });
}
if (typeof window !== 'undefined') window.__hrWithTimeout = withTimeout; // b314: exposed for the guard test

// Public entry: bound the real capture so it can NEVER hang the bug report.
// b316: on a touch/coarse-pointer device, DO NOT enter the raw capture at all —
// its foreignObject rasterisation is a synchronous main-thread lock that no
// timeout can interrupt (see isTouchLikeDevice's note). Skip to null unless a
// caller explicitly forces it (desktop keeps the screenshot). This makes the
// capability itself phone-safe even if a future caller forgets to gate.
function captureScreenshot(timeoutMs = CAPTURE_TIMEOUT_MS, opts) {
  if ((!opts || !opts.force) && isTouchLikeDevice()) return Promise.resolve(null);
  return withTimeout(captureScreenshotRaw(), timeoutMs, null);
}

// ── VENDORED, LAZY, SAME-ORIGIN. NO CDN. ───────────────────────────────────
// Both screenshot engines used to arrive as `import('https://cdn.skypack.dev/
// …')` — unpinned third-party script, injected into the live page of anybody
// who opens the bug reporter, with full DOM and session access. That is the
// same supply-chain hole src/net/auth.js had (see its setupAuth comment), just
// on a colder path. The bundles now live in src/vendor/, byte-for-byte from the
// npm tarballs whose registry sha512 was verified at vendoring time.
//
// Still LAZY — a <script> injected on demand, not a tag in index.html — because
// html2canvas is 194 KB and almost nobody files a bug. The cost of the fix is
// therefore zero on the normal path. There is deliberately NO CDN fallback: a
// fallback that fires when the local file is unreachable hands the whole fix
// back to anyone who can make it unreachable.
const VENDOR_SCRIPTS = {
  htmlToImage: 'src/vendor/html-to-image-1.11.13.umd.js?v=480',
  html2canvas: 'src/vendor/html2canvas-1.4.1.min.js?v=480',
};
const _vendorLoads = {};
function loadVendor(globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (_vendorLoads[globalName]) return _vendorLoads[globalName];
  const src = VENDOR_SCRIPTS[globalName];
  if (!src) return Promise.reject(new Error('unknown vendor bundle ' + globalName));
  _vendorLoads[globalName] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => window[globalName]
      ? resolve(window[globalName])
      : reject(new Error(globalName + ' loaded but the global is missing'));
    s.onerror = () => { _vendorLoads[globalName] = null; reject(new Error(globalName + ' failed to load')); };
    document.head.appendChild(s);
  });
  return _vendorLoads[globalName];
}

async function captureScreenshotRaw() {
  // Primary: foreignObject renderer — supports all modern CSS.
  try {
    const mod = await withTimeout(loadVendor('htmlToImage'), 4000, null);
    if (!mod) throw new Error('html-to-image load timed out');
    // pixelRatio 0.5 halves resolution (~25% file size) — plenty for a bug shot,
    // and mobile reports benefit most from the smaller payload. skipFonts avoids
    // fetching/inlining Google Fonts (slow, occasionally CORS-blocked); the
    // screenshot is about layout/state, not typography. cacheBust dodges stale
    // cross-origin image caching that can taint the canvas.
    return await mod.toJpeg(document.body, {
      quality: 0.7,
      pixelRatio: 0.5,
      backgroundColor: '#12161c',
      skipFonts: true,
      cacheBust: true,
      filter: (node) => !isOverlayChrome(node),
    });
  } catch (err) {
    console.warn('[bug-report] html-to-image failed, falling back to html2canvas:', err && err.message);
  }
  // Fallback: html2canvas with the color() normaliser. Kept only as a safety net
  // if the foreignObject path ever fails; it cannot handle pseudo-element
  // color-mix (see above), so it is second, not first.
  try {
    const mod = await withTimeout(loadVendor('html2canvas'), 4000, null);
    if (!mod) throw new Error('html2canvas load timed out');
    const h2c = mod.default || mod;
    const canvas = await h2c(document.body, {
      scale: 0.5,
      logging: false,
      backgroundColor: null,
      useCORS: true,
      imageTimeout: 1500,
      removeContainer: true,
      onclone: function(clonedDoc) { try { normalizeModernColors(clonedDoc); } catch (e) {} },
      ignoreElements: isOverlayChrome,
    });
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (err) {
    console.warn('[bug-report] screenshot capture failed (both engines):', err && err.message);
    return null;
  }
}

// A per-report idempotency key. The relay collapses a replay of the SAME key
// from the SAME account to the stored row and does NOT re-post to Discord — so
// a retry (queue flush, double-tap, flaky connection) can never duplicate a
// report. Generated once when the payload is built and carried through the
// localStorage queue.
function newIdemKey() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  } catch (e) {}
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Send through the authenticated Edge Function relay.
//
// The relay is the ONLY path to Discord. It requires a valid Supabase JWT,
// attributes the report to the server-verified auth.uid() (the `user` field in
// the payload is display-only and is ignored server-side, same class of fix as
// the chat `from_name` bug), rate-limits per account, and holds the webhook as
// a server secret. Signed out → skipped, and the caller falls back.
async function sendRelay(payload) {
  const cfg = window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig();
  const session = window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession();
  if (!cfg || !session || !session.access_token) return { ok: false, skipped: true };
  try {
    const res = await fetch(cfg.url.replace(/\/$/, '') + RELAY_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        summary: payload.summary,
        description: payload.description,
        build: payload.build,
        state: payload.state,
        errors: payload.errors,
        // Desktop only — b316 keeps touch devices text-only, so this is null on
        // a phone and the relay never sees an image from one.
        screenshot: payload.screenshot || null,
        idem_key: payload.idem_key,
      }),
    });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    const status = (body && body.status) || (res.ok ? 'accepted' : 'failed');
    return {
      ok: !!res.ok && !!(body && body.ok),
      http: res.status,
      status,
      // 429 means the server said "later" — not a delivery failure to retry now.
      rateLimited: res.status === 429,
      retryAfter: (body && body.retry_after_s) || 0,
    };
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
        // The RLS INSERT policy pins this to auth.uid() server-side, so a
        // forged id is rejected rather than silently attributed.
        user_id: session.user.id,
        build_version: payload.build,
        summary: payload.summary,
        description: payload.description,
        state: payload.state,
        errors: payload.errors,
        // Deliberately NOT sending idem_key / source here. Those columns are
        // added by 2026-08-11-bug-report-relay.sql, and PostgREST 400s on an
        // unknown column — so sending them would make this fallback depend on
        // migration ordering. The fallback's whole job is to work when the
        // preferred path does not; idempotency is the relay's responsibility.
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
    // Same ordering as submit(): relay first, direct table write only if the
    // relay is unavailable. Each queued payload kept its idem_key, so a flush
    // that races a successful earlier send collapses instead of duplicating.
    const relay = await sendRelay(p);
    if (relay.ok) continue;                       // delivered — drop from the queue
    let direct = { ok: false, skipped: true };
    if (!relay.rateLimited) direct = await sendSupabase(p);
    // KEEP anything that was not actually delivered. The old logic dropped the
    // item when both paths were "skipped" — i.e. flushing while signed out
    // silently deleted every queued report, which is the one thing a queue
    // exists to prevent. The queue is capped at 25, so keeping is safe.
    if (!direct.ok) remaining.push(p);
  }
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining)); } catch {}
}

async function submit({ summary, description }) {
  // b316: the text report is the payload that matters — build, device metrics,
  // safe-area insets, console errors, game-state snapshot. The screenshot is a
  // desktop nice-to-have. On a touch device we must NEVER call captureScreenshot
  // (its raw path is a synchronous main-thread freeze on iOS Safari that no
  // timeout can break), and the send must NEVER await it. So: skip capture
  // entirely on touch and send text-only, instantly. On desktop, keep the
  // existing behaviour — capture first (before the modal closes) and attach it.
  // Call through the public reference so the capture path is mockable in tests
  // (the guard test stubs it to prove submit never invokes it on touch).
  const capFn = (window.HearthriseBugReport && typeof window.HearthriseBugReport.captureScreenshot === 'function')
    ? window.HearthriseBugReport.captureScreenshot : captureScreenshot;
  const screenshot = isTouchLikeDevice() ? null : await capFn();

  const payload = {
    summary: summary || '(no summary)',
    description: description || '',
    build: buildVersionString(),
    // DISPLAY ONLY, and only for the local "Copy" dump. The relay ignores this
    // field entirely and derives the reporter from the verified auth.uid() —
    // never trust a client-supplied identity that crosses to someone else's
    // screen (the same class of bug as a client-set chat `from_name`).
    user: (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()?.user?.email)
       || (window.G && window.G.playerName) || 'guest',
    state: gameStateSnapshot(),
    errors: consoleBuffer.slice(-20),
    screenshot,
    idem_key: newIdemKey(),
    ts: new Date().toISOString(),
  };
  // ORDERED, not fanned out. The relay is the only path to Discord and it
  // already writes the bug_reports row, so firing the direct table write in
  // parallel would file every report twice. Direct write is a FALLBACK for
  // "the relay is unreachable", not redundancy.
  const relay = await sendRelay(payload);
  let direct = { ok: false, skipped: true };
  if (!relay.ok && !relay.rateLimited) direct = await sendSupabase(payload);

  const ok = relay.ok || direct.ok;
  // A 429 is the server saying "later", not a delivery failure: queuing it
  // would just replay into the same limit. Everything else that genuinely
  // failed (and wasn't simply skipped for being signed out) gets queued.
  if (!ok && !relay.rateLimited && !(relay.skipped && direct.skipped)) {
    // Don't queue the screenshot — too large for localStorage in volume.
    enqueue({ ...payload, screenshot: null });
  }
  return { ok, relay, supabase: direct, rateLimited: !!relay.rateLimited, retryAfter: relay.retryAfter || 0 };
}

// ── UI ────────────────────────────────────────────────────────

function renderButton() {
  if (document.getElementById('hr-bug-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'hr-bug-btn';
  btn.className = 'btn btn-sm';
  btn.title = 'Report a bug';
  /* b213 (phase 2): line-art bug glyph instead of the emoji */
  btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:15px;height:15px;display:block" aria-hidden="true">'
    + '<path fill="currentColor" d="M12 4a4 4 0 0 1 4 4v1h2l2-2 1.4 1.4L19 10.8V12h3v2h-3v1.2l2.4 2.4L20 19l-2-2h-1.3A5 5 0 0 1 13 20.9V12h-2v8.9A5 5 0 0 1 7.3 17H6l-2 2-1.4-1.4L5 15.2V14H2v-2h3v-1.2L2.6 8.4 4 7l2 2h2V8a4 4 0 0 1 4-4z"/></svg>';
  btn.title = 'Report a bug';
  // Position above the chat dock so they don't overlap.
  // Chat lives at right:12px;bottom:12px, so we sit on top of it.
  btn.style.cssText = 'position:fixed;right:12px;bottom:62px;z-index:9998;padding:6px 9px;background:rgba(26,21,15,.9);color:#c4b79e;border:1px solid rgba(201,162,74,.28);border-radius:3px;font-size:calc(14.5px * var(--ui-scale, 1));cursor:pointer;backdrop-filter:blur(4px);line-height:1';
  btn.addEventListener('click', openModal);
  document.body.appendChild(btn);
}

function openModal() {
  if (document.getElementById('hr-bug-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'hr-bug-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <form style="background:linear-gradient(180deg,#262019,#16120d);border:1px solid rgba(201,162,74,.55);border-radius:5px;padding:18px;max-width:440px;width:100%;display:flex;flex-direction:column;gap:10px;color:#ece1cc;font-family:var(--f-ui,system-ui),sans-serif">
      <h3 style="margin:0;color:#f3d181">Report a bug</h3>
      <p style="margin:0;font-size:calc(14.5px * var(--ui-scale, 1));color:#9aa3b0">Thanks for testing! We'll auto-attach your build version, current tab, and recent errors. Don't include passwords or anything private.</p>
      <input name="summary" placeholder="One-line summary (e.g. 'inventory empty after combat')" required maxlength="120" style="padding:8px 12px;background:rgba(0,0,0,.34);border:1px solid rgba(236,225,204,.10);color:#ece1cc;border-radius:2px;font-size:calc(14.5px * var(--ui-scale, 1))" />
      <textarea name="description" placeholder="What happened? What did you expect? Steps to reproduce?" rows="5" style="padding:8px 12px;background:rgba(0,0,0,.34);border:1px solid rgba(236,225,204,.10);color:#ece1cc;border-radius:2px;font-size:calc(14.5px * var(--ui-scale, 1));resize:vertical;font-family:inherit"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" style="flex:1;min-width:120px;padding:8px;background:linear-gradient(180deg,#d9b361,#a67c28);color:#221803;border:1px solid #e6cd93;border-radius:3px;font-weight:700;cursor:pointer">Send report</button>
        <button type="button" data-act="copy" title="Copy report to clipboard so you can paste into Discord/email/etc" style="padding:8px 12px;background:rgba(255,236,200,.06);color:#c4b79e;border:1px solid rgba(236,225,204,.12);border-radius:3px;cursor:pointer;font-weight:600">Copy</button>
        <button type="button" data-act="cancel" style="padding:8px 14px;background:transparent;color:#8f7d63;border:1px solid rgba(236,225,204,.1);border-radius:3px;cursor:pointer">Cancel</button>
      </div>
      <div data-status style="font-size:calc(14.5px * var(--ui-scale, 1));color:#9aa3b0;min-height:14px;text-align:center"></div>
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
    // b316: skip the heavy screenshot on touch devices (see submit) — a phone
    // "Copy" builds a text-only report instantly instead of freezing.
    const touch = isTouchLikeDevice();
    status.textContent = touch ? 'Building report…' : 'Capturing…';
    const screenshot = touch ? null : await captureScreenshot();
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
    } else if (result.rateLimited) {
      // Honest and specific: the report was refused on purpose, not lost.
      const mins = Math.max(1, Math.round((result.retryAfter || 60) / 60));
      status.style.color = '#e8c878';
      status.textContent = 'That\'s a lot of reports — try again in about ' + mins + ' min.';
    } else if (result.relay?.skipped && result.supabase?.skipped) {
      status.style.color = '#e8c878';
      status.textContent = 'Saved locally — will send when you\'re signed in.';
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
  // No `webhookUrl` / `bridgeUrl` here, ever. Publishing a delivery credential
  // on `window` is the same exposure as hard-coding it — anyone can read it
  // from the console. The relay path is derived from the Supabase config.
  relayPath: RELAY_PATH,
  captureScreenshot,
  flushQueue,
  _stateSnapshot: gameStateSnapshot,   // b309: exposed for the guard test
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderButton(); flushQueue(); });
} else {
  renderButton();
  flushQueue();
}
