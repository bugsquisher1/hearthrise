// ============================================================
// src/core-ready.js — THE CORE READINESS GATE (b323 hotfix)
//
// THE BUG THIS EXISTS TO KILL
// legacy.js and the feature scripts are CLASSIC scripts: they execute the
// instant the parser reaches them. src/core-bridge.js is a MODULE, and
// modules are deferred — they evaluate after the document has finished
// parsing. Phase 0 moved ~50 simulation call sites in legacy.js onto
// window.HearthriseCore, so between "legacy.js parsed" and "core-bridge
// evaluated" the engine is armed but its maths is missing.
//
// Nothing in that window runs from DOMContentLoaded (that fires AFTER
// deferred modules, by spec, which is why boot() is safe). The ONLY thing
// that can run there is work the classic scripts SCHEDULED at parse time:
// legacy.js alone registers 21 top-level setTimeout/setInterval calls. On a
// cold mobile load the module graph (core-bridge + 12 core modules) can take
// seconds to arrive, and those timers fire into a coreless engine:
//
//   TypeError: Cannot read properties of undefined (reading 'xp')
//     at getCombatLevel (legacy.js:1508)   <- renderMonsterList x3
//   TypeError: Cannot read properties of undefined (reading 'combat')
//     at getArmorSetBonus (legacy.js:1484) <- applyAll x2
//   TypeError: Cannot read properties of undefined (reading 'xp')
//     at getLevel (legacy.js:1506)         <- checkAchievements x1
//
// Six pageerrors, reproducible by delaying only /src/core/ and
// /src/core-bridge.js responses. Guarded by the cold-load battery in
// tests/visual-qa.mjs (`node tests/visual-qa.mjs --cold`).
//
// WHY A SCHEDULER GATE AND NOT FIFTY GUARDS
// Guarding each accessor is O(call sites), regresses the moment somebody
// adds site 51, and a guard that returns 0 makes a renderer quietly paint a
// wrong number — worse than throwing. Making the core synchronous is the
// other honest fix, but src/core/* MUST stay ESM (a Supabase Edge Function
// imports the same files), and a classic mirror would be a second copy of
// the rules — exactly the "one identity" property Phase 0 bought.
//
// So the gate is installed at the ONE choke point the whole failure class
// passes through: the timer queue, during the boot window only. Every
// setTimeout/setInterval registered by a script loaded AFTER this file and
// BEFORE the core is online is parked and released, in registration order,
// the moment the core comes up. setTimeout/setInterval then UNINSTALL
// THEMSELVES — steady state schedules on the platform's own functions with
// zero overhead. (clearTimeout/clearInterval stay wrapped for as long as a
// boot-registered INTERVAL is still alive, because the id the caller holds is
// the parking id, not the live one. That is one Map lookup on a rarely-called
// function, and it too goes native once nothing is remapped.) Behaviour is
// unchanged either way. Because registration order is file order, scripts that
// load before this one (theme-picker, observability, storage, the account
// gate) are never touched: they are not engine code and must not wait.
//
// The invariant this buys, which no per-site guard can: NO CODE SCHEDULED BY
// ANY ENGINE SCRIPT EXECUTES BEFORE THE CORE IS ONLINE. It also removes the
// nondeterminism — previously whether a boot timer beat the module graph
// depended on the network.
//
// requestAnimationFrame is deliberately NOT intercepted: legacy.js has one
// rAF call and it is inside a function, not parse-time, so it cannot land in
// the boot window. Add it here if that ever changes.
//
// FAILSAFE
// If the core never arrives (404, offline, a syntax error in a core module)
// the page first reloads ONCE per tab session (see retryOnce below — this
// covers the CORE_READY_TIMEOUT_MS path as well as a failed core-bridge.js),
// and only a second coreless release in the same session releases everything
// anyway and logs loudly. A frozen game is a worse failure than a noisy one,
// and we do not silently swallow: the original TypeErrors will surface with
// their real stacks, which is what a bug report needs.
// ============================================================
(function () {
  'use strict';
  if (window.HearthriseCoreReady) return;           // idempotent

  /* Generous on purpose. The failsafe is for "the core is never coming"
     (404 / syntax error / dead link), NOT for "the network is slow" — the
     module graph is 13 files, and releasing early on a genuinely bad mobile
     connection would recreate the exact crash this file exists to stop. The
     404 case does not wait for it: the script error listener below fires at
     once. */
  var CORE_READY_TIMEOUT_MS = 30000;

  var ready = false;
  var waiters = [];                                  // whenCoreReady callbacks
  var resolveReady;
  var readyPromise = (typeof Promise === 'function')
    ? new Promise(function (res) { resolveReady = res; })
    : null;

  /* Keep BOTH: the raw originals (restored on uninstall, so anything comparing
     window.setTimeout to the platform function still sees identity) and bound
     copies for our own calls. */
  var rawSetT = window.setTimeout, rawSetI = window.setInterval,
      rawClrT = window.clearTimeout, rawClrI = window.clearInterval;
  var natSetT = rawSetT.bind(window), natSetI = rawSetI.bind(window),
      natClrT = rawClrT.bind(window), natClrI = rawClrI.bind(window);

  /* Parked schedules, in registration order. Keyed by a REAL platform timer id
     (a never-firing parking timer) so that a caller's clearTimeout(id) still
     works on the platform side even if it never reaches our override. */
  var parked = new Map();
  /* parkedId -> the live platform id a released schedule is really running
     under. A caller that kept the id we handed out during the boot window must
     still be able to cancel the work with it — this is what makes a debounce
     registered pre-core behave exactly as it would have. Entries are removed
     when a released timeout fires or when either clear* cancels one. */
  var remap = new Map();
  var NEVER = 0x7ffffff;                             // ~2.3 days; never fires

  function park(kind, fn, ms, args) {
    var id = natSetT(function () {}, NEVER);
    parked.set(id, { kind: kind, fn: fn, ms: ms, args: args });
    return id;
  }

  /* Named, so the gate can be asked "is MY wrapper still installed?" — the only
     honest form of that question (b334). Identity against the platform function
     cannot answer it: Sentry's tracing bundle re-wraps setTimeout/setInterval in
     its setupOnce AFTER this uninstalls, and it copies toString(), so
     `String(window.setTimeout)` reports "[native code]" for a function that is
     not native at all. A string test therefore cannot distinguish "the gate
     uninstalled and Sentry wrapped" from "the gate never uninstalled". */
  var gateSetT = function (fn, ms) {
    if (ready || typeof fn !== 'function') return natSetT.apply(null, arguments);
    return park('t', fn, ms, Array.prototype.slice.call(arguments, 2));
  };
  var gateSetI = function (fn, ms) {
    if (ready || typeof fn !== 'function') return natSetI.apply(null, arguments);
    return park('i', fn, ms, Array.prototype.slice.call(arguments, 2));
  };
  var gateClrT = function (id) {
    if (parked.has(id)) { parked.delete(id); natClrT(id); return; }
    if (remap.has(id)) { natClrT(remap.get(id)); remap.delete(id); natClrT(id); maybeUnwrapClears(); return; }
    natClrT(id);
  };
  var gateClrI = function (id) {
    if (parked.has(id)) { parked.delete(id); natClrT(id); return; }
    if (remap.has(id)) { natClrI(remap.get(id)); remap.delete(id); natClrT(id); maybeUnwrapClears(); return; }
    natClrI(id);
  };
  window.setTimeout = gateSetT;
  window.setInterval = gateSetI;
  window.clearTimeout = gateClrT;
  window.clearInterval = gateClrI;

  /* The clear* wrappers survive only as long as a released interval is still
     living under a substituted platform id; after that everything is native.
     `releasing` is load-bearing (b334): during release() there is a window in
     which `parked` has been drained and `remap` has not been filled yet, and
     unwrapping there strands every boot-registered interval — see release(). */
  var releasing = false;
  function maybeUnwrapClears() {
    if (ready && !releasing && !parked.size && !remap.size) {
      window.clearTimeout = rawClrT; window.clearInterval = rawClrI;
    }
  }

  function uninstall() {
    window.setTimeout = rawSetT;
    window.setInterval = rawSetI;
    maybeUnwrapClears();
  }

  /* A CORE THAT DID NOT ARRIVE IS RETRIED ONCE, AND NOTHING BOOTS INTO
     IT MEANWHILE. Live 2026-09-29, first load after a version bump: the
     service-worker kill-switch in <head> unregisters the old service worker and deletes its
     caches while this page is still fetching its module graph, core-bridge.js
     fails to load, the gate released WITHOUT a core, and DOMContentLoaded booted
     the engine into it — getTotalLevel/getCombatLevel "reading 'xp'",
     getEquipmentStats "reading 'combat'", and the error boundary painting
     "Something broke here" over Home until the kill-switch's own reload landed.
     The engine must never render numbers it cannot compute, so on the first
     coreless release of a tab session the page reloads instead of releasing.
     What that holds back is the BOOT, and only the boot: parked timers stay
     parked, and boot() and every other DOMContentLoaded/load listener never
     run on the coreless page. Chromium gets that by itself — it aborts the
     document inside location.reload() (measured: beforeunload, readyState
     "complete", no DOMContentLoaded). An engine that starts the navigation
     asynchronously can still reach DOMContentLoaded/load on the old document,
     so both are also stopped at the window capture phase (this file's listener
     is registered before any engine script's, and window is first on the
     capture path of a document event). It is NOT "no engine code runs": the
     classic scripts' parse-time top level has already run by now (as on every
     load, cold or warm), and handlers that are not boot events — pageshow/
     focus/visibilitychange resume (try-wrapped, gated on the account gate),
     input, rAF, promise continuations — are not held; coreRetryGuard's
     zero-pageerror arm is the evidence that none of them throws meanwhile.
     A second coreless release in the same session is a genuinely broken deploy
     and releases loudly as before — a reload loop would hide the fault.
     The CORE_READY_TIMEOUT_MS failsafe goes through the same decision, so a core
     that is merely 30 s late now costs one reload before it releases loudly.
     The storage READ is inside the try on purpose: where site data is blocked
     (the itch.io iframe in an Incognito window, a sandboxed iframe) merely
     touching window.sessionStorage throws SecurityError, and a throw here would
     escape release('core') itself — the happy path — and the gate would never
     open. No readable store = the loop cannot be bounded = release loudly.
     `host` (whose .sessionStorage is read; window in production) and `reload`
     are injectable so the in-page suite can drive the decision without
     navigating; tests/run-smoke.mjs coreRetryGuard drives the real one. */
  var RETRY_KEY = 'hr-core-retry';
  var reloading = false;
  function retryOnce(reason, host, reload) {
    var store = null;
    try { store = host.sessionStorage || null; } catch (e) {}
    if (reason === 'core') { try { if (store) store.removeItem(RETRY_KEY); } catch (e) {} return false; }
    if (!store) return false;                        // cannot bound the loop → release loudly
    try {
      if (store.getItem(RETRY_KEY)) return false;
      store.setItem(RETRY_KEY, String(reason));
      reload();
    } catch (e) { return false; }                    // storage refused, or the reload did → release loudly
    return true;
  }
  window.__hrCoreRetry = retryOnce;
  function holdBootEvent(ev) { if (reloading) ev.stopImmediatePropagation(); }
  window.addEventListener('DOMContentLoaded', holdBootEvent, true);
  window.addEventListener('load', holdBootEvent, true);

  function release(reason) {
    if (ready || reloading) return;
    if (retryOnce(reason, window, function () { location.reload(); })) {
      reloading = true;
      console.warn('[core-ready] core did not arrive (' + reason + ') — reloading once before the engine boots');
      return;
    }
    ready = true;
    releasing = true;
    var entries = Array.from(parked.entries());
    parked.clear();
    /* b334 — ORDER IS THE WHOLE BUG. This used to call uninstall() HERE, and
       uninstall() calls maybeUnwrapClears(), which at this exact instant sees
       ready=true, parked empty and remap still empty — so it restored the
       platform clearTimeout/clearInterval one statement BEFORE the loop below
       fills remap. Every interval registered in the boot window was then live
       under a substituted platform id while its caller held the parking id, and
       the only table that could translate the two had just been unhooked. The
       caller's clearInterval(id) went straight to the platform, where that id
       named a parking timeout that release() had already cleared: a silent
       no-op, forever. src/error-boundary.js self-cancels on its first tick and
       so logged its "wrapped ×N" line five times a second for the lifetime of
       the page; every other self-cancelling boot interval (beta-banner,
       nav-consolidation, settings-page, post-signup-welcome) leaked the same
       way, invisibly, because they cancel quietly.
       So: fill remap FIRST, uninstall after, and `releasing` makes the
       invariant — never unwrap the clears while a remap entry is owed —
       hold regardless of statement order, which is how this got in. */
    /* Delays are honoured FROM RELEASE, not from registration: the staggered
       boot passes (applyAll at 300ms then 1200ms) are meant to be spaced
       relative to the engine coming up, and the engine comes up now. */
    entries.forEach(function (pair) {
      var id = pair[0], e = pair[1];
      natClrT(id);                                   // free the parking timer
      if (e.kind === 'i') {
        remap.set(id, natSetI.apply(null, [e.fn, e.ms].concat(e.args)));
      } else {
        /* A released timeout drops out of the remap the moment it fires, so the
           table cannot grow into a leak and the clear* wrappers can go native. */
        remap.set(id, natSetT.apply(null, [function () {
          remap.delete(id); maybeUnwrapClears();
          e.fn.apply(null, e.args);
        }, e.ms]));
      }
    });
    releasing = false;
    uninstall();                                     // also calls maybeUnwrapClears()
    if (resolveReady) resolveReady(window.HearthriseCore || null);
    var w = waiters; waiters = [];
    w.forEach(function (fn) { try { fn(window.HearthriseCore); } catch (err) { console.error('[core-ready] waiter threw', err); } });
    if (reason !== 'core') {
      console.error('[core-ready] RELEASED WITHOUT A CORE (' + reason + ') — ' +
        'window.HearthriseCore never arrived. The engine will now throw on any ' +
        'simulation call; that is intentional (a frozen page hides the real fault).');
    }
  }

  /* core-bridge.js calls this as its last statement. */
  window.__hearthriseCoreOnline = function () { release('core'); };
  window.isCoreReady = function () { return ready; };
  window.whenCoreReady = function (fn) {
    if (typeof fn !== 'function') return;
    if (ready) { fn(window.HearthriseCore); return; }
    waiters.push(fn);
  };
  window.HearthriseCoreReady = readyPromise || { then: function (f) { window.whenCoreReady(f); return this; } };

  /* b334 — the observation seam the runaway-interval bug needed and did not
     have. `remapped` is the count of boot-registered intervals still running
     under a substituted platform id; while that is non-zero the clear*
     wrappers MUST still be installed, or those ids name nothing. The smoke
     suite asserts exactly that implication. Read-only, no behaviour. */
  window.__hrCoreGateStats = function () {
    return {
      ready: ready,
      parked: parked.size,
      remapped: remap.size,
      clearsWrapped: window.clearInterval === gateClrI && window.clearTimeout === gateClrT,
      schedulersParked: window.setTimeout === gateSetT || window.setInterval === gateSetI,
    };
  };

  /* A core that 404s or fails to parse must not cost the player 30 seconds of
     a dead screen. `error` does not bubble, so this listens in the CAPTURE
     phase — the same trick the observability script uses for resource errors. */
  window.addEventListener('error', function (ev) {
    var t = ev && ev.target;
    if (t && t.tagName === 'SCRIPT' && /core-bridge\.js/.test(t.src || '')) release('core-bridge failed to load');
  }, true);

  natSetT(function () { release('timeout after ' + CORE_READY_TIMEOUT_MS + 'ms'); }, CORE_READY_TIMEOUT_MS);
})();
