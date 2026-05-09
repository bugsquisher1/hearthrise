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
    sentryDsn: null,                 // ⬅ Tyler: paste your real Sentry DSN here before launch (or set window.HEARTHRISE_OBSERVABILITY = {sentryDsn:'...'} pre-load)
    sentryCdnUrl: 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js',
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
      gold: window.G ? window.G.gold : null,
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
    var s = document.createElement('script');
    s.src = CONFIG.sentryCdnUrl;
    s.async = true;
    s.crossOrigin = 'anonymous';
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
  function loadBuffer(){
    try { return JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '[]'); }
    catch(e){ return []; }
  }
  function saveBuffer(arr){
    try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(arr)); }
    catch(e){}
  }

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
        if(r.ok){ saveBuffer([]); }
      }).catch(function(){ /* keep buffer for next flush */ });
    } catch(e){ /* ditto */ }
  }
  window.flushAnalytics = flush;
  setInterval(flush, CONFIG.flushIntervalMs);
  // Also flush on page hide (tab close / nav away)
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

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

  // showTab → tab_change event
  function hookShowTab(){
    if(typeof window.showTab !== 'function'){ setTimeout(hookShowTab, 200); return; }
    if(window.__obsTabHooked) return;
    window.__obsTabHooked = true;
    var orig = window.showTab;
    window.showTab = function(name){
      track('tab_change', { tab: name });
      return orig.apply(this, arguments);
    };
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
