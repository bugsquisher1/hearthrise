// ============================================================
// src/network-status.js
//
// Small banner that appears when the player goes offline or when
// Supabase requests start failing. Disappears once connectivity
// returns. Beta-tester quality-of-life — without this, network
// blips look like the game broke.
//
// Triggers:
//   • navigator offline event → banner: "You're offline — playing locally"
//   • 3 consecutive Supabase 5xx within 30s → banner: "Cloud is slow — local mode"
//   • Recovery (online + 1 successful request) → banner fades out
// ============================================================

(function(){
  'use strict';
  if (window.HearthriseNetStatus) return;

  let banner = null;
  let consecutiveErrors = 0;
  let lastErrorTs = 0;
  let mode = 'ok'; // 'ok' | 'offline' | 'degraded'

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'hr-net-banner';
    banner.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99997;padding:6px 14px;background:rgba(232,138,138,.95);color:#0f1320;border-radius:20px;font:600 12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:opacity .3s, transform .3s;opacity:0;pointer-events:none';
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
    if (mode === next) return;
    mode = next;
    if (next === 'offline') {
      show('🔌 You\'re offline — your save is local until reconnected', 'rgba(232,138,138,.95)');
    } else if (next === 'degraded') {
      show('☁️ Cloud is slow — playing in local mode', 'rgba(232,200,120,.95)');
    } else {
      show('✓ Back online', 'rgba(95,204,124,.95)');
      setTimeout(hide, 1800);
    }
  }

  // Browser-level offline / online events
  window.addEventListener('offline', () => setMode('offline'));
  window.addEventListener('online', () => {
    consecutiveErrors = 0;
    setMode('ok');
  });

  // Patch fetch to count Supabase failures
  const cfgUrl = () => (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()?.url) || null;
  const origFetch = window.fetch;
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
