// ============================================================
// src/observability.js
//
// Crash reporting + analytics in a single file because they share
// the same buffering / context-tagging plumbing.
//
// Crash reporting → Sentry browser SDK loaded via CDN. Captures
//   window.onerror, unhandledrejection, and a public
//   window.captureException(err, ctx) for engine hot paths to call.
//   No-ops cleanly if SENTRY_DSN isn't configured.
//
// Analytics → lightweight event tracker that buffers to
//   localStorage and POSTs to Supabase 'game_events' table when
//   configured. Hooks the existing HearthriseEvents bus so we
//   don't have to scatter emit calls across the codebase.
//
// Configure by editing CONFIG below or by setting
//   window.HEARTHRISE_OBSERVABILITY = {
//     sentryDsn: '...',
//     analyticsEndpoint: '...',  // posts JSON to this URL
//     release: 'hearthrise@0.4.0',
//     environment: 'beta',
//   }
// before this script loads.
// ============================================================

(function(){
  'use strict';

  // b144 (beta launch prep): release pulled from window.HearthriseBuild
  // dynamically so we don't drift between this file and build-info.js.
  // Environment auto-detected from BUILD.channel ('dev' | 'beta' | 'live').
  // Sentry DSN still requires manual paste — Tyler creates a Sentry
  // project + drops the DSN into HEARTHRISE_OBSERVABILITY before launch.
  var __build = (typeof window !== 'undefined') ? window.HearthriseBuild : null;
  var __releaseTag = __build && __build.version
    ? ('hearthrise@' + __build.version + (__build.commit ? '+' + __build.commit.slice(0,7) : ''))
    : 'hearthrise@unknown';
  var __envFromChannel = (__build && __build.channel)
    ? (__build.channel === 'live' ? 'production' : __build.channel)  // 'dev' | 'beta' | 'production'
    : 'dev';
  var DEFAULTS = {
    sentryDsn: 'https://f19b6d8040e335fa3f7d3aafdd6f6d72@o4511870588944384.ingest.us.sentry.io/4511870595039232',  // beta crash reporting (public DSN — safe to commit)
    sentryCdnUrl: 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js',
    // SUBRESOURCE INTEGRITY — the CDN is third-party, so it is not trusted, it
    // is VERIFIED. Without this, whoever can serve browser.sentry-cdn.com can
    // run arbitrary JavaScript in every player's page, with the Supabase session
    // token sitting in localStorage next to it: a CDN compromise would be a full
    // compromise of every Hearthrise account. Computed 2026-08-23 from two
    // independent fetches of this exact versioned URL (112,959 bytes, byte
    // identical). If the version above ever moves, this hash MUST move with it —
    // the script will simply refuse to load otherwise, which is the correct
    // failure direction for crash reporting.
    sentryCdnIntegrity: 'sha384-rZu69pPOmCbAWY6noj9hSNHZJHE4KW80YWowiNKTJWLsUT8dhyTjlqKGruotLZGH',
    analyticsEndpoint: null,         // null = no remote sink yet (still buffers locally)
    release: __releaseTag,           // tracks BUILD.version automatically
    environment: __envFromChannel,   // tracks BUILD.channel automatically
    flushIntervalMs: 30000,          // flush analytics every 30s
    bufferCap: 500,                  // localStorage buffer cap
    enableInProd: true,
    enableInDev: true,
    // b144: Sentry tracesSampleRate defaults to 0.1 (10%) so we don't blow
    // through the free tier's quota on a beta cohort. Pure error-capture
    // stays at 100% — only the perf-trace data is sampled. Flip to 1.0 if
    // you upgrade to a paid plan.
    tracesSampleRate: 0.1,
  };
  var CONFIG = Object.assign({}, DEFAULTS, (window.HEARTHRISE_OBSERVABILITY || {}));

  // ── Session id (per page load) ────────────────────────────────
  var SESSION_ID = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // ── Common context the player carries on every event ──────────
  function commonContext(){
    var charSlot = (window.HearthriseProfile && window.HearthriseProfile.profile)
      ? window.HearthriseProfile.profile.activeSlot : null;
    return {
      session: SESSION_ID,
      release: CONFIG.release,
      env: CONFIG.environment,
      charSlot: charSlot,
      activeSkill: window.G ? window.G.activeSkill : null,
      activeMonster: window.G ? window.G.activeMonster : null,
      /* A DIAGNOSTIC, so `null` is the honest answer for a balance the client
         has not been told — and it is a different fact from `0`, which is what
         a raw read would have reported once the server owns the field.
         Guarded: this file loads before legacy.js publishes the accessor. */
      gold: (typeof window.balOr === 'function')
        ? window.balOr('gold', null)
        : (window.G ? window.G.gold : null),
      kills: window.G && window.G.stats ? window.G.stats.kills : null,
      ts: Date.now(),
    };
  }

  // ════════════════════════════════════════════════════════════
  // CRASH REPORTING (Sentry)
  // ════════════════════════════════════════════════════════════
  var sentryReady = false;
  var sentryErrorQueue = [];

  function loadSentry(){
    if(!CONFIG.sentryDsn){
      console.log('[observability] Sentry DSN not set — crashes captured locally only');
      return;
    }
    // An override of sentryCdnUrl MUST bring its own integrity hash. Otherwise
    // `window.HEARTHRISE_OBSERVABILITY = {sentryCdnUrl:'…'}` — a global that any
    // injected script could set before this file runs — would be a one-line
    // bypass of the SRI pin below, i.e. an arbitrary-script-loader we shipped
    // ourselves. No hash, no load; crash reporting degrades, nothing else does.
    var integrity = CONFIG.sentryCdnIntegrity;
    if (CONFIG.sentryCdnUrl !== DEFAULTS.sentryCdnUrl && integrity === DEFAULTS.sentryCdnIntegrity) {
      console.warn('[observability] sentryCdnUrl was overridden without a matching sentryCdnIntegrity — refusing to load an unverified third-party script');
      return;
    }
    var s = document.createElement('script');
    s.src = CONFIG.sentryCdnUrl;
    s.async = true;
    // crossOrigin is a PREREQUISITE for integrity on a cross-origin script, not
    // a substitute for it. Both, or the check is decorative.
    s.crossOrigin = 'anonymous';
    if (integrity) s.integrity = integrity;
    s.onload = function(){
      try {
        if(!window.Sentry){ console.warn('[observability] Sentry CDN loaded but window.Sentry missing'); return; }
        window.Sentry.init({
          dsn: CONFIG.sentryDsn,
          release: CONFIG.release,
          environment: CONFIG.environment,
          // b144: read from CONFIG so HEARTHRISE_OBSERVABILITY override works.
          // Default in DEFAULTS is 0.1 (10%); bump to 1.0 if you have a paid Sentry plan.
          tracesSampleRate: (typeof CONFIG.tracesSampleRate === 'number') ? CONFIG.tracesSampleRate : 0.05,
          beforeSend: function(ev){
            // Tag every event with current player context.
            var ctx = commonContext();
            ev.tags = ev.tags || {};
            ev.tags.session = ctx.session;
            ev.tags.charSlot = String(ctx.charSlot);
            ev.contexts = ev.contexts || {};
            ev.contexts.player = {
              activeSkill: ctx.activeSkill,
              activeMonster: ctx.activeMonster,
              gold: ctx.gold,
              kills: ctx.kills,
            };
            return ev;
          },
        });
        sentryReady = true;
        // Flush any errors captured while waiting for the SDK.
        sentryErrorQueue.splice(0).forEach(function(item){
          window.Sentry.captureException(item.err, item.opts);
        });
        console.log('[observability] Sentry ready (' + CONFIG.environment + ' / ' + CONFIG.release + ')');
      } catch(e){
        console.warn('[observability] Sentry init failed', e);
      }
    };
    s.onerror = function(){ console.warn('[observability] Sentry CDN load failed'); };
    document.head.appendChild(s);
  }

  // Public API: window.captureException(err, ctx?)
  window.captureException = function(err, ctx){
    var ctxFull = Object.assign({}, commonContext(), ctx || {});
    // Always log to console — easier debugging in dev
    console.error('[capture]', err, ctxFull);
    // Forward to Sentry if available
    if(sentryReady && window.Sentry){
      window.Sentry.captureException(err, { contexts: { capture: ctxFull } });
    } else if(CONFIG.sentryDsn){
      sentryErrorQueue.push({ err: err, opts: { contexts: { capture: ctxFull } } });
    }
    // Also log to local error journal (so we can see crashes even without Sentry)
    pushLocalError(err, ctxFull);
  };

  // Local error journal — last 20 errors persisted to localStorage so
  // beta testers can DM us a screenshot via the admin tool.
  function pushLocalError(err, ctx){
    try {
      var key = 'hearthrise:errors';
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.push({
        msg: (err && err.message) || String(err),
        stack: (err && err.stack) || null,
        ctx: ctx,
        ts: Date.now(),
      });
      while(arr.length > 20) arr.shift();
      localStorage.setItem(key, JSON.stringify(arr));
    } catch(e){}
  }
  window.getLocalErrors = function(){
    try { return JSON.parse(localStorage.getItem('hearthrise:errors') || '[]'); }
    catch(e){ return []; }
  };

  // window.onerror + unhandledrejection global capture
  window.addEventListener('error', function(e){
    if(e.error){ window.captureException(e.error, { source: 'window.onerror' }); }
    else { window.captureException(new Error(e.message || 'window error'), { source: 'window.onerror', filename: e.filename, lineno: e.lineno }); }
  });
  window.addEventListener('unhandledrejection', function(e){
    var err = (e.reason instanceof Error) ? e.reason : new Error(String(e.reason));
    window.captureException(err, { source: 'unhandledrejection' });
  });

  // ════════════════════════════════════════════════════════════
  // ANALYTICS EVENT FUNNEL
  // ════════════════════════════════════════════════════════════
  // Buffer in localStorage; flush in batches.
  var ANALYTICS_KEY = 'hearthrise:analytics:buffer';

  /* ── THE BUFFER IS IN MEMORY; localStorage IS ITS DURABLE COPY ──────────
     This used to be a full read-modify-write of a 500-entry JSON array PER
     EVENT: parse the whole buffer out of localStorage, push one row,
     stringify the whole thing, write it back. The analytics bridge below
     subscribes with `on('*')`, so that ran on every kill, every gathered
     item, every level-up — synchronously, on the main thread.

     Measured with the CPU profiler during a 12-hour away catch-up (~970
     kills): loadBuffer + saveBuffer + localStorage.setItem were 46% of the
     entire replay. It is the same shape as the incident sync.js documents at
     the top of its EVENT_ALLOWLIST — an uncontained `on('*')` — and it costs
     LIVE play too, on every single kill.

     The buffer is now held in memory and persisted on a 1s trailing debounce,
     plus IMMEDIATELY on the paths where durability actually matters: an
     uncaught error, a flush, and page hide. So a crash still lands with its
     breadcrumbs, and a thousand kills cost one write instead of a thousand. */
  var _buf = null;
  var _dirty = false;
  var _persistTimer = null;
  var PERSIST_DEBOUNCE_MS = 1000;

  function loadBuffer(){
    if(_buf) return _buf;
    try { _buf = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '[]'); }
    catch(e){ _buf = []; }
    if(!Array.isArray(_buf)) _buf = [];
    return _buf;
  }
  function persistNow(){
    if(_persistTimer != null){ clearTimeout(_persistTimer); _persistTimer = null; }
    if(!_dirty) return;
    _dirty = false;
    try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(_buf || [])); }
    catch(e){}
  }
  function saveBuffer(arr){
    _buf = Array.isArray(arr) ? arr : [];
    _dirty = true;
    if(_persistTimer == null) _persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
  }
  /* Exposed so the suite can assert the durable copy without waiting a second,
     and so any future caller that genuinely needs a synchronous write has one. */
  window.__hrPersistAnalytics = persistNow;

  function track(eventName, props){
    var ev = {
      name: eventName,
      ts: Date.now(),
      props: props || {},
      ctx: commonContext(),
    };
    var buf = loadBuffer();
    buf.push(ev);
    while(buf.length > CONFIG.bufferCap) buf.shift();
    saveBuffer(buf);
    // Mirror as Sentry breadcrumb (helpful when a crash happens later)
    if(sentryReady && window.Sentry){
      try {
        window.Sentry.addBreadcrumb({
          category: 'analytics',
          message: eventName,
          level: 'info',
          data: props || {},
        });
      } catch(e){}
    }
  }
  window.trackEvent = track;

  function flush(){
    if(!CONFIG.analyticsEndpoint) return;
    var buf = loadBuffer();
    if(!buf.length) return;
    // Send and clear on 2xx; keep on failure.
    try {
      fetch(CONFIG.analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: buf }),
        keepalive: true,
      }).then(function(r){
        if(r.ok){ saveBuffer([]); persistNow(); }
      }).catch(function(){ /* keep buffer for next flush */ });
    } catch(e){ /* ditto */ }
  }
  window.flushAnalytics = flush;
  setInterval(flush, CONFIG.flushIntervalMs);
  /* Page hide / unload: write the in-memory buffer through BEFORE attempting
     the network flush. The debounce is what makes the hot path cheap; this is
     what keeps it honest — the durable copy must never be more than one tab
     close behind. */
  window.addEventListener('pagehide', function(){ persistNow(); flush(); });
  window.addEventListener('beforeunload', function(){ persistNow(); flush(); });
  /* A crash is exactly when the breadcrumbs matter, so those two paths write
     synchronously rather than waiting out the debounce. */
  window.addEventListener('error', persistNow);
  window.addEventListener('unhandledrejection', persistNow);

  // Local-only: dump to console for dev visibility
  window.dumpAnalytics = function(){
    var buf = loadBuffer();
    console.table(buf.map(function(e){ return { name: e.name, ts: new Date(e.ts).toLocaleTimeString(), session: e.ctx.session, slot: e.ctx.charSlot, props: JSON.stringify(e.props) }; }));
    return buf;
  };

  // ── Event hookups ─────────────────────────────────────────────
  // The existing HearthriseEvents bus emits engine-level events.
  // Mirror them all into analytics with the same name.
  function hookHearthriseEvents(){
    if(!window.HearthriseEvents || typeof window.HearthriseEvents.on !== 'function'){
      setTimeout(hookHearthriseEvents, 200);
      return;
    }
    if(window.__obsEventsHooked) return;
    window.__obsEventsHooked = true;
    window.HearthriseEvents.on('*', function(eventName, payload){
      track(eventName, payload || {});
    });
    console.log('[observability] HearthriseEvents → analytics bridge live');
  }

  // showTab → tab_change event.
  // b405: was a PRE-hook (tracked before the base showTab ran); as a registry
  // post-tap it now records tab_change AFTER the panel paints. This is analytics
  // only — the event still fires once per navigation with the same tab name, so
  // the recorded signal is identical; only the fire order relative to render
  // moved, which nothing downstream depends on.
  function hookShowTab(){
    window.HearthriseShowTab.wrapShowTab('obs-tabchange', function(name){
      track('tab_change', { tab: name });
    });
  }

  // Track session_start now (after a tick so contexts are settled)
  function emitSessionStart(){
    track('session_start', {
      ua: navigator.userAgent,
      lang: navigator.language,
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  // ── Boot ──────────────────────────────────────────────────────
  function start(){
    loadSentry();
    hookHearthriseEvents();
    hookShowTab();
    setTimeout(emitSessionStart, 200);
  }
  if(document.readyState !== 'loading') setTimeout(start, 0);
  else document.addEventListener('DOMContentLoaded', start);

  console.log('[observability] loaded — crash + analytics scaffolding ready');
})();
