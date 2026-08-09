// ============================================================
// src/network-status.js
//
// Owns TWO presentations of the same connectivity state:
//   1. A floating banner (top-center) for offline/degraded blips —
//      beta-tester quality-of-life, so a network hiccup doesn't look
//      like the game broke.
//   2. The sidebar-foot indicator (#net-status, bottom-left of the nav
//      rail). b229 (Tyler): in an online-only, account-walled realm,
//      "connected" is the NORMAL state and deserves no badge at all —
//      the indicator is hidden while connected and only appears as an
//      honest, live "Reconnecting…" while genuinely disconnected. This
//      used to be driven by legacy.js's updateNetStatus(), which read a
//      dead NetClient.online() (hardcoded ENDPOINT=null, a pre-Supabase
//      relic) and so reported "Offline" permanently for every player.
//      That write was removed from legacy.js; this module is now the
//      only thing that touches #net-status.
//
// Triggers:
//   • navigator offline event → immediate: banner + sidebar "Reconnecting…"
//   • navigator online event → CONFIRMED via a probe against the actual
//     Supabase host before declaring recovery (an interface reconnecting
//     to a captive portal / dead wifi still fires 'online' with no real
//     route out)
//   • 3 consecutive Supabase 5xx within 30s → degraded: banner + sidebar
//     "Reconnecting…"
//   • While disconnected, a background probe polls the Supabase host every
//     4s so the sidebar badge clears itself the moment real connectivity
//     returns, even if the browser never fires 'online'
// ============================================================

(function(){
  'use strict';
  if (window.HearthriseNetStatus) return;

  let banner = null;
  let consecutiveErrors = 0;
  let lastErrorTs = 0;
  let mode = 'ok'; // 'ok' | 'offline' | 'degraded'
  let reconnectTimer = null;
  const origFetch = window.fetch;
  const cfgUrl = () => (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()?.url) || null;

  // ── Sidebar foot (#net-status) ──────────────────────────────
  function updateNavFoot() {
    const foot = document.getElementById('net-status');
    if (!foot) return;
    if (mode === 'ok') {
      foot.classList.add('hide');
      return;
    }
    foot.classList.remove('hide');
    const dot = foot.querySelector('.dot');
    if (dot) { dot.classList.remove('off'); dot.classList.add('warn'); }
    const label = foot.querySelector('span:last-child');
    if (label) label.textContent = 'Reconnecting…';
  }

  // Real connectivity probe against the Supabase host itself — not a
  // hardcoded ping target (e.g. a generic CDN). navigator.onLine only
  // reflects whether the OS thinks a network interface is up; it says
  // nothing about whether OUR backend is actually reachable (captive
  // portal, DNS block, a downed project). A no-cors HEAD request can't be
  // read for status (opaque response), but a genuine network failure —
  // DNS, connection refused, no route — rejects the promise, which is the
  // one signal this needs.
  function probeHost() {
    const url = cfgUrl();
    if (!url) return Promise.resolve(navigator.onLine);
    const hasAbort = typeof AbortController !== 'undefined';
    const ctrl = hasAbort ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
    return origFetch(url, {
      method: 'HEAD', mode: 'no-cors', cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    }).then(() => { if (timer) clearTimeout(timer); return true; })
      .catch(() => { if (timer) clearTimeout(timer); return false; });
  }

  function stopReconnectPoll() {
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
  }
  function startReconnectPoll() {
    if (reconnectTimer) return;
    reconnectTimer = setInterval(() => {
      if (!navigator.onLine) return; // browser already says no network — nothing to confirm yet
      probeHost().then((ok) => { if (ok) { consecutiveErrors = 0; setMode('ok'); } });
    }, 4000);
  }

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'hr-net-banner';
    banner.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99997;padding:6px 14px;background:rgba(232,138,138,.95);color:#0f1320;border-radius:20px;font-weight:600;font-size:calc(14.5px * var(--ui-scale, 1));font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:opacity .3s, transform .3s;opacity:0;pointer-events:none';
    document.body.appendChild(banner);
    return banner;
  }

  function show(text, color) {
    const b = ensureBanner();
    b.textContent = text;
    if (color) b.style.background = color;
    b.style.opacity = '1';
  }
  function hide() {
    if (!banner) return;
    banner.style.opacity = '0';
  }

  function setMode(next) {
    if (mode !== next) {
      mode = next;
      if (next === 'offline') {
        show('🔌 You\'re offline — your save is local until reconnected', 'rgba(232,138,138,.95)');
      } else if (next === 'degraded') {
        show('☁️ Cloud is slow — playing in local mode', 'rgba(232,200,120,.95)');
      } else {
        show('✓ Back online', 'rgba(127,154,79,.95)');
        setTimeout(hide, 1800);
      }
      if (next === 'ok') stopReconnectPoll(); else startReconnectPoll();
      // b229: announce the flip. The blessing gate (legacy.js) reads THIS
      // module as its single connectivity oracle, and legacy.js loads BEFORE
      // this file — so it cannot subscribe through an API at boot, and a plain
      // window 'offline' listener there would fire ahead of the assignment
      // above and read the stale mode. Publishing the change after the state
      // is settled makes the ordering impossible to get wrong, and keeps the
      // oracle singular: consumers are told, they never sample a second source.
      try { window.dispatchEvent(new CustomEvent('hearthrise:netmode', { detail: { mode: next } })); } catch (e) {}
    }
    updateNavFoot();
  }

  // Browser-level offline / online events
  window.addEventListener('offline', () => setMode('offline'));
  window.addEventListener('online', () => {
    // A browser 'online' event fires on any interface change — wifi
    // reconnecting to a captive portal with no real internet still fires
    // it. Confirm against the actual backend before declaring recovery,
    // otherwise leave the reconnect poll (started by setMode) to keep
    // trying.
    probeHost().then((ok) => {
      if (ok) { consecutiveErrors = 0; setMode('ok'); }
      else setMode('offline');
    });
  });

  // Patch fetch to count Supabase failures
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const isSb = cfgUrl() && url.startsWith(cfgUrl());
    try {
      const res = await origFetch.apply(this, args);
      if (isSb) {
        if (res.ok) {
          if (mode === 'degraded') setMode('ok');
          consecutiveErrors = 0;
        } else if (res.status >= 500) {
          consecutiveErrors++;
          lastErrorTs = Date.now();
          if (consecutiveErrors >= 3 && mode === 'ok' && navigator.onLine) {
            setMode('degraded');
          }
        }
      }
      return res;
    } catch (e) {
      if (isSb) {
        consecutiveErrors++;
        lastErrorTs = Date.now();
        if (consecutiveErrors >= 3 && mode === 'ok') {
          setMode(navigator.onLine ? 'degraded' : 'offline');
        }
      }
      throw e;
    }
  };

  // Decay error counter — if no failures in 30s, reset
  setInterval(() => {
    if (consecutiveErrors > 0 && Date.now() - lastErrorTs > 30000) {
      consecutiveErrors = 0;
      if (mode === 'degraded') setMode('ok');
    }
  }, 5000);

  // Initial check
  if (!navigator.onLine) setMode('offline');

  window.HearthriseNetStatus = { setMode, getMode: () => mode };
})();
