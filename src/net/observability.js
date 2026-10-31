// ════════════════════════════════════════════════════════════════════════
// src/net/observability.js — ERRORS AND REPLAYS FROM REAL PLAYERS (telemetry only).
//
// Started once by src/app/boot.js. On a sending host (observability-config.js
// `hosts`, with `enabled` on and no ?noanalytics=1) it loads the vendored SDKs
// from our own origin and wires:
//   Sentry   uncaught errors, unhandled rejections and console.error (sampleRate 1),
//            through ONE send gate per page load (createSendGate): at most
//            SEND_LIMITS.perFingerprint of each error and SEND_LIMITS.perLoad in all,
//            network weather (a fetch the network dropped) not at all, so one loop
//            can never spend the plan's quota again (2026-10-21: a week of every
//            event refused as error_usage_exceeded); plus ONE message on the first
//            main-thread hang (src/net/diagnostics.js onHang) with each open hunt's
//            id, swing and live-engine state, and what held the page: the longest frames
//            in the stall and their scripts (Chromium), the long-task counts, the last
//            console warnings and errors; release = BUILD.version; no tracing,
//            no replay; user = the account id; URLs leave without query or fragment
//   PostHog  identified_only profiles keyed by the account id, kept in memory only,
//            its script fetched (on idle) and started only once the account id is known (its bootstrap distinct id: no
//            anonymous id is ever minted or merged, nothing runs on the sign-in screen);
//            no pageviews and no ordinary clicks: ONLY rage clicks and dead clicks (a stuck player) are on, on the
//            characters and game screens, as the element's tag, classes and ids (no text, no value, nothing inside
//            .ph-no-capture, .ph-mask (the chat) or an input), each capped per load (CLICK_MAX); every event carries
//            `release` = BUILD.version; session replay only while the game
//            screen shows, every input masked, chat text masked (.ph-mask),
//            .ph-no-capture blocked
// Anywhere else (localhost, a preview host, the kill switch) nothing loads and
// every call below is a no-op.
//
// The named events come from places that already exist: hunt_started and
// hunt_ended from each character's server sections, live_view_stall from the
// live view's own emits (live-link.js: 'live', 'reseed') and its engine's
// running(), read and never changed; leave_hunt_clicked and character_created
// from their buttons (track). Nothing here is ever read back by the game (§1).
//
// THE FUNNEL (where a new player stops), display-only, each once per its scope in one page load (PostHog's funnel takes
// a person's first; a reload may send a step again, never more than once):
//   signup_done        the characters screen with no hero yet (boot.js; the sign-up form cannot send: no account id
//                      exists until the email link is opened)        per account
//   first_town         a hero's first read, no hunt on record yet     per hero
//   first_hunt_left    the end of the first hunt a hero ever had, seen live, with its reason   per hero
//   first_sale         the server confirmed a sale (the shop's, or Dispatch loot with sold stacks)  per account (the intent ledger is the account's)
//   first_gear_equipped  the server confirmed an equip                                          per account
//   tutorial_card      the coach moved to a card ({ card, state: 'shown' | 'done' })              per hero and card
//   level_reached      the hero's Level rose between two server answers                           per hero and level
//   session_return     a hero's first read finds its last hunt over: minutes since it ended, by the server's clock  per hero
// Every event is bounded: EVENT_MAX named events per load, CLICK_MAX of each click kind (a loop cannot spend the quota).
// ════════════════════════════════════════════════════════════════════════

import { OBSERVABILITY_CONFIG } from './observability-config.js?v=0.2.77';
import { BUILD } from '../build-info.js?v=0.2.77';
import { observeSessions } from '../session/character-session.js?v=0.2.77';
import { partyOf, huntOf, huntDensityOf } from '../session/hunt-sections.js?v=0.2.77';
import { levelOf } from '../session/character-sections.js?v=0.2.77';
import { startDiagnostics } from './diagnostics.js?v=0.2.77';
import { endedSessionOf } from '../hunt-view/summary-model.js?v=0.2.77';

const EARLY_MAX = 10;        // errors held while Sentry loads
const QUEUE_MAX = 20;        // events held while PostHog loads
const EVENT_MAX = 400;       // named events per page load, all kinds together: a loop must not spend the quota
const CLICK_MAX = 20;        // $rageclick and $dead_click, each, per page load
const CLICK_SCREENS = new Set(['characters', 'game']);   // where those clicks may leave: signed in, past the sign-in form
const STALL_MAX = 50;        // live_view_stall per page load: a stuck loop must not spend the quota
const DIFF_MAX = 12;         // live_diverged per page load: the first few name a cause; the rest would repeat it
const STALL_POLL_MS = 1000;  // how often a running live engine is looked at (starving emits nothing)
const HANG_PRINT = 'main-thread-hang';
const HANG_READ_MS = 1000;   // the hang report waits this long for the frame that held the page to be reported
const POSTHOG_IDLE_MAX_MS = 3000;   // PostHog's script waits for an idle moment after sign-in, at most this long

/** What one page load may send to Sentry: each error a few times, and a ceiling over all of them. */
export const SEND_LIMITS = Object.freeze({ perFingerprint: 5, perLoad: 25 });

/* Network weather, not a bug in the game: a fetch the network dropped (Chrome, Firefox, Safari
   words) and supabase-js's own retry log of it. The game already shows the player a refused ask. */
const WEATHER = [
  /^TypeError: (?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/,
  /^Auto refresh tick failed with error\. This is likely a transient error\./,
];

const NOOP = Object.freeze({ environment: 'dev', send: false, identify() {}, forget() {}, screen() {}, track() {}, once() {} });
let active = NOOP;

/* Telemetry never breaks the game: every SDK call goes through here. */
const safe = (fn) => { try { fn(); } catch (e) { /* dropped */ } };
/* A URL without query or fragment (a recovery link carries its tokens in the fragment). */
const bare = (u) => String(u || '').split(/[?#]/)[0];

/* Where this load sends, from the host and the two switches. */
function environmentOf(loc, cfg) {
  const environment = cfg.hosts[String((loc && loc.hostname) || '').toLowerCase()] || 'dev';
  const killed = /(?:^|[?&])noanalytics=1(?:&|$)/.test(String((loc && loc.search) || ''));
  return { environment, send: cfg.enabled === true && environment === 'production' && !killed };
}

/* The scripts in order, each from our origin with its pinned hash; `done` after the last. */
function load(doc, scripts, done, i = 0) {
  if (i >= scripts.length) { safe(done); return; }
  const s = doc.createElement('script');
  s.src = scripts[i].src;
  s.integrity = scripts[i].integrity;
  s.crossOrigin = 'anonymous';
  s.onload = () => load(doc, scripts, done, i + 1);
  doc.head.appendChild(s);   // a blocked or missing script: the game runs without telemetry
}

/* An event's first line: the exception's type and value, else its message. */
function headline(event) {
  const ex = event && event.exception && Array.isArray(event.exception.values) ? event.exception.values[0] : null;
  if (ex) return (ex.type || 'Error') + ': ' + (ex.value || '');
  return String((event && (event.message || (event.logentry && event.logentry.message))) || '');
}

/** The same error twice has one fingerprint: its first line with numbers blurred, and where it threw. */
function fingerprintOf(event) {
  if (event && Array.isArray(event.fingerprint) && event.fingerprint.length) return event.fingerprint.join('|');
  const ex = event && event.exception && Array.isArray(event.exception.values) ? event.exception.values[0] : null;
  const frames = ex && ex.stacktrace && Array.isArray(ex.stacktrace.frames) ? ex.stacktrace.frames : [];
  const top = frames.length ? frames[frames.length - 1] : null;
  const where = top ? bare(top.filename).split('/').pop() + ':' + (top.function || '?') : '';
  return headline(event).replace(/\d+/g, '#').slice(0, 200) + '|' + where;
}

/**
 * The send gate for one page load (Sentry's beforeSend runs every event through it): network
 * weather is dropped, each fingerprint is sent at most `perFingerprint` times and all of them at
 * most `perLoad` times (the one hang message aside). A sent event carries its occurrence number
 * and how many were held back before it. Answers the event, or null to drop it.
 */
export function createSendGate(limits = SEND_LIMITS) {
  const seen = new Map();
  let sent = 0;
  let held = 0;
  return (event) => {
    if (WEATHER.some((r) => r.test(headline(event)))) return null;
    const fp = fingerprintOf(event);
    const hang = fp === HANG_PRINT;
    if (!hang && sent >= limits.perLoad) { held++; return null; }
    const n = (seen.get(fp) || 0) + 1;
    seen.set(fp, n);
    if (n > limits.perFingerprint) { held++; return null; }
    if (!hang) sent++;
    event.extra = Object.assign({}, event.extra, { occurrence: n, held_back: held });
    return event;
  };
}

/* Each open hunt this load watches, as the hang report states it. */
function openHunts(watched) {
  const out = [];
  for (const cs of watched.keys()) {
    const h = huntOf(cs);
    if (!h || h.ended) continue;
    const live = cs.live || {};
    const call = (fn) => (typeof fn === 'function' ? fn() : null);
    out.push({ slot: cs.slot, hunt: h.huntId, session: h.sessionId, version: cs.record ? cs.record.version : null,
      swing: call(live.swingIndex), running: call(live.running), ended: call(live.ended), stalled: call(live.stalled),
      stats: typeof cs.liveStats === 'function' ? cs.liveStats() : null });
  }
  return out;
}

function sentryOptions(cfg, env, S) {
  const gate = createSendGate();
  return {
    dsn: cfg.sentry.dsn, release: BUILD.version, environment: env.environment,
    sampleRate: 1, sendDefaultPii: false, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    /* Without BrowserApiErrors, which wraps every timer, frame and event callback: Chromium names the script that held
       a frame by its entry point, and wrapped, every long frame read "sentry-browser: sentryWrapped" (the hang report's
       long_frames). An uncaught error in a callback still reaches Sentry through its global handlers. */
    integrations: (defaults) => defaults.filter((i) => i && i.name !== 'BrowserApiErrors')
      .concat(typeof S.captureConsoleIntegration === 'function' ? [S.captureConsoleIntegration({ levels: ['error'] })] : []),
    beforeSend(event) {
      if (event.request) { event.request.url = bare(event.request.url); delete event.request.cookies; if (event.request.headers) delete event.request.headers.Referer; }
      return gate(event);
    },
    beforeBreadcrumb(c) {
      if (c && c.category === 'navigation' && c.data) { c.data.from = bare(c.data.from); c.data.to = bare(c.data.to); }
      return c;
    },
  };
}

/* RAGE AND DEAD CLICKS ONLY. The SDK raises $rageclick from inside its autocapture (a rage click is a run of clicks it
   sees), so autocapture is on for 'click' alone and sdkGate drops every ordinary $autocapture before it is queued. A click
   event carries the element chain WITHOUT text (mask_all_text) and without the attributes that hold words (CLICK_ATTRS);
   a click in a field, in the chat (.ph-mask) or inside .ph-no-capture raises nothing at all. */
const CLICK_SKIP = ['.ph-no-capture', '.ph-mask', '.ph-no-rageclick', '.ph-no-deadclick', 'input', 'textarea', 'select', '[contenteditable]'];
const CLICK_ATTRS = ['value', 'placeholder', 'title', 'aria-label', 'alt', 'href', 'src', 'name'];

/** Every event the SDK is about to queue (PostHog's before_send): an ordinary click never leaves; a rage or dead click leaves
    only from the characters and game screens, with an account behind it, CLICK_MAX of each kind per load; all carry the release. */
function sdkGate(st, event) {
  const n = event && event.event;
  if (n === '$autocapture') return null;
  if (n === '$rageclick' || n === '$dead_click') {
    if (!st.uid || !CLICK_SCREENS.has(st.screen)) return null;
    st.clicks[n] = (st.clicks[n] || 0) + 1;
    if (st.clicks[n] > CLICK_MAX) return null;
  }
  if (event) event.properties = Object.assign({}, event.properties, { release: BUILD.version });
  return event;
}

/* `uid` is the account id: PostHog starts only once it is known (startPostHog), so the account id is
   its distinct id from the very first call. Nothing is stored on the device (persistence 'memory'),
   which is why the id must be handed in: left to itself the SDK mints an anonymous id on every page
   load and identify() merges it onto the person (the SDK's own warning, Andy's report #61). */
function posthogOptions(cfg, win, uid, gate) {
  return {
    api_host: cfg.posthog.host, person_profiles: 'identified_only',
    persistence: 'memory',
    bootstrap: { distinctID: uid, isIdentifiedID: true },
    autocapture: { dom_event_allowlist: ['click'], element_attribute_ignorelist: CLICK_ATTRS.slice() },
    rageclick: { css_selector_ignorelist: CLICK_SKIP.slice(), ignore_text_selection: true },
    capture_dead_clicks: { css_selector_ignorelist: CLICK_SKIP.slice(), element_attribute_ignorelist: CLICK_ATTRS.slice(), capture_dead_swipes: false },
    mask_all_text: true, before_send: gate,
    capture_pageview: false, capture_pageleave: false, capture_heatmaps: false,
    capture_performance: false, capture_exceptions: false, disable_surveys: true,
    disable_external_dependency_loading: true, save_referrer: false, mask_personal_data_properties: true,
    get_current_url: () => bare(win.location.href),
    disable_session_recording: true,   // on only while the game screen shows (screen('game'))
    session_recording: { maskAllInputs: true, maskTextSelector: '.ph-mask, input, textarea', blockClass: 'ph-no-capture', recordHeaders: false, recordBody: false },
  };
}

/* hunt_started / hunt_ended: the transitions THIS load saw in the server's `hunt` section. */
function watchHunt(cs, w, now, send) {
  const s = endedSessionOf(cs);
  const open = !!s && !s.ended;
  if (!w.seen) { if (cs.record) { w.seen = true; w.open = open; w.sid = open ? s.id : null; w.never = !s; } return; }
  if (w.open && (!open || s.id !== w.sid)) {
    const e = s && s.id === w.sid ? s : null;
    if (w.starvedAt !== null) { w.stall('starve', now - w.starvedAt); w.starvedAt = null; }
    const ended = { reason: e ? e.reason : null,
      seconds: e && e.enteredMs !== null && e.endedMs !== null ? Math.round((e.endedMs - e.enteredMs) / 1000) : null };
    /* reseeds_total: every reseed this page load saw, all heroes (live_view_stall stops at STALL_MAX, this does not) */
    send('hunt_ended', Object.assign({ reseeds_total: w.total() }, ended));
    if (w.never) { w.never = false; send('first_hunt_left', Object.assign({ slot: cs.slot }, ended)); }   // the first hunt this hero ever had
    w.open = false; w.sid = null; w.reseeds = 0;
  }
  if (open && s.id !== w.sid) {
    const party = partyOf(cs);
    /* The hero's own pick on this ground (hunt_density; no key = 0, as built); null when the server sent none. */
    const picks = huntDensityOf(cs);
    send('hunt_started', { hunt: s.hunt, party_size: party ? party.members.length : 1,
      density: picks ? (Number.isInteger(picks[s.hunt]) ? picks[s.hunt] : 0) : null });
    w.open = true; w.sid = s.id; w.reseeds = 0;
  }
}

/* live_view_stall: `starve` ms = from the engine seen stopped (hunt still open) to its next start
   point; `reseed` ms = how long the prediction ran before the server's world corrected it. */
function watchLive(cs, w, why, now) {
  /* a prediction that ran to the hunt's end (live-link.js ended) is not starving */
  const running = !!(cs.live && (cs.live.running() || (typeof cs.live.ended === 'function' && cs.live.ended())));
  if (why === 'reseed') {
    /* 'reseed' is every eased restart: a correction from the server's world, or a catch-up (a frame late over a swing
       boundary, a tab back from the background) that corrected nothing. Counted as one, a slow machine read as a
       server disagreement. */
    const did = cs.liveStats().reseeds;
    if (did !== w.reseedsSeen) {
      w.reseedsSeen = did; w.reseeds++; w.count(); w.stall('reseed', now - w.since); w.since = now;
      const d = cs.liveLink && typeof cs.liveLink.takeDiff === 'function' ? cs.liveLink.takeDiff() : null;
      if (d) w.diverged(d);
    } else { w.stall('catchup', now - w.caughtAt); w.caughtAt = now; }
  } else if (why === 'live') { if (w.starvedAt !== null) { w.stall('starve', now - w.starvedAt); w.starvedAt = null; } w.since = now; w.caughtAt = now; }
  /* A prediction that STOPPED is not one that starved: a viewed hero switched away from drops its engine (live-link.js
     off), and its "starve" read the time the player spent on another hero. Out of seeds it holds a world (stalled). */
  else if (w.open && w.running && !running && w.starvedAt === null && cs.live.stalled()) w.starvedAt = now;
  w.running = running;
}

/* The funnel steps read off one hero's server projection (`once(name, props, scope)`: sent at most once per scope this
   load). The first read is the baseline: a hero in town that has never hunted is in its first town visit; a hero whose last
   hunt is over is returning, minutes by the server's clock. Later reads: a Level above the baseline's is a level reached. */
function watchFunnel(cs, w, once) {
  if (!cs.record) return;
  const lv = levelOf(cs);
  const slot = cs.slot;
  if (!w.based) {
    w.based = true;
    w.level = lv ? lv.level : null;
    const s = endedSessionOf(cs);
    if (!s) once('first_town', { slot }, 'town:' + slot);
    else if (s.ended && s.endedMs !== null && typeof cs.serverNow === 'function') {
      const t = cs.serverNow();
      if (Number.isFinite(t)) once('session_return', { slot, minutes: Math.max(0, Math.round((t - s.endedMs) / 60000)), reason: s.reason }, 'return:' + slot);
    }
    return;
  }
  if (!lv) return;
  if (w.level !== null && lv.level > w.level) once('level_reached', { slot, level: lv.level }, 'level:' + slot + ':' + lv.level);
  w.level = lv.level;
}

/** One named event (telemetry only, never read back). A no-op where nothing sends. */
export function track(name, props) { safe(() => active.track(name, props)); }
/** One named event at most once per `scope` (a string) in this page load and account; the same no-op. */
export function trackOnce(name, props, scope) { safe(() => active.once(name, props, scope)); }

/**
 * Start telemetry for this page load (once). Returns { environment, send, identify(uid),
 * forget(), screen(name), track(name, props) }; every method is a no-op where nothing sends.
 */
export function startObservability(win, cfg = OBSERVABILITY_CONFIG) {
  if (active !== NOOP) return active;
  const env = environmentOf(win.location, cfg);
  if (!env.send) return Object.assign({}, NOOP, { environment: env.environment });
  const doc = win.document;
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const st = { uid: null, game: false, screen: null, queue: [], stalls: 0, diffs: 0, hung: false, hang: null,
    sent: 0, reseeds: 0, clicks: {}, onceKeys: new Set() };
  let sentry = null;
  let ph = null;       // the PostHog instance, started by the first account id
  let phSdk = null;    // window.posthog once its script has loaded: nothing runs until an account is known
  let phUid = null;    // the account id ph is currently seeded with

  /* Errors before Sentry is up are held, then reported once it is. */
  const early = [];
  const hold = (e) => { if (early.length < EARLY_MAX) early.push(e); };
  const onError = (ev) => hold(ev.error || new Error(String(ev.message)));
  const onReject = (ev) => hold(ev.reason);
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onReject);
  load(doc, cfg.sentry.scripts, () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onReject);
    const S = win.Sentry;
    if (!S || typeof S.init !== 'function') return;
    S.init(sentryOptions(cfg, env, S));
    sentry = S;
    if (st.uid) S.setUser({ id: st.uid });
    for (const e of early.splice(0)) safe(() => S.captureException(e));
    if (st.hang) safe(() => st.hang(S));
  });
  /* PostHog starts when its script is loaded AND the account id is known, whichever comes last, with
     that id as its distinct id (posthogOptions): no anonymous id is ever minted, sent or merged. A
     second sign-in in the same load re-seeds the same instance with the new id the same way. */
  const startPostHog = () => {
    if (!phSdk || !st.uid || phUid === st.uid) return;
    if (!ph) ph = phSdk.init(cfg.posthog.key, posthogOptions(cfg, win, st.uid, (event) => sdkGate(st, event))) || phSdk;
    else ph.reset({ bootstrap: { distinctID: st.uid, isIdentifiedID: true } });
    phUid = st.uid;
    if (st.game) ph.startSessionRecording();
    for (const [n, p] of st.queue.splice(0)) safe(() => ph.capture(n, p));
  };
  /* Its 200 KB script is fetched only once an account is known, when the page is next idle: the sign-in
     screen never pays for it (opt-review 2026-10-28: a quarter of a first visit's bytes), and nothing can be
     sent before then anyway. Sentry stays first, above, so a boot error is still caught. */
  let phLoading = false;
  const loadPostHog = () => {
    if (phLoading) return;
    phLoading = true;
    const go = () => load(doc, cfg.posthog.scripts, () => {
      const P = win.posthog;
      if (!P || typeof P.init !== 'function') return;
      phSdk = P;
      safe(startPostHog);
    });
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(go, { timeout: POSTHOG_IDLE_MAX_MS });
    else win.setTimeout(go, 0);
  };

  /* An event with no account behind it has no distinct id to carry: it is not sent, and not held for
     whoever signs in next. */
  const send = (name, props) => {
    if (st.sent >= EVENT_MAX) return;
    if (!st.uid) return;
    const p = Object.assign({}, props || {});
    st.sent++;
    if (ph) safe(() => ph.capture(name, p)); else if (st.queue.length < QUEUE_MAX) st.queue.push([name, p]);
  };
  /* A funnel step: once per scope for this account in this load (a new sign-in starts the scopes afresh). */
  const once = (name, props, scope) => {
    const key = name + '|' + scope;
    if (!st.uid || st.onceKeys.has(key)) return;
    st.onceKeys.add(key);
    send(name, props);
  };
  const watched = new Map();
  const ledgers = new WeakSet();
  /* first_sale / first_gear_equipped: the account's intent ledger (src/session/intent-ledger.js) says what the server confirmed.
     The ledger is the account's, shared by its heroes, so these two are per account. */
  const watchLedger = (ledger) => {
    if (!ledger || typeof ledger.subscribe !== 'function' || ledgers.has(ledger)) return;
    ledgers.add(ledger);
    ledger.subscribe((kind, e) => safe(() => {
      const r = kind === 'end' && e.result && e.result.ok ? e.result : null;
      if (!r) return;
      if (e.verb === 'vendor_sell_many' || (e.verb === 'loot_dispatch' && r.dispatch && r.dispatch.sold && r.dispatch.sold.stacks > 0)) once('first_sale', {}, 'sale');
      else if (e.verb === 'equip') once('first_gear_equipped', {}, 'gear');
    }));
  };
  observeSessions((cs) => {
    const w = { seen: false, open: false, sid: null, running: false, since: now(), caughtAt: now(), starvedAt: null, reseeds: 0, reseedsSeen: 0,
      never: false, based: false, level: null,
      /* reseeds_total (hunt_ended): every real reseed this page load saw, all heroes, past live_view_stall's STALL_MAX */
      total: () => st.reseeds, count: () => { st.reseeds++; },
      stall: (kind, ms) => { if (st.stalls < STALL_MAX) { st.stalls++; send('live_view_stall', { kind, ms: Math.round(ms), reseeds: w.reseeds }); } },
      /* WHAT DIFFERED at a correction (live-diff.js), with the build that predicted it: a tab left on an older build
         than the server's differs at every commit, and this event names that or the input that really differs. */
      diverged: (d) => { if (st.diffs < DIFF_MAX) { st.diffs++; send('live_diverged', { version: BUILD.version, hunt: d.hunt, swing: d.swing, count: d.count, by: d.by, lines: d.lines, page_s: Math.round(now() / 1000) }); } } };
    watched.set(cs, w);
    watchLedger(cs.intents);
    cs.subscribe((c, why) => safe(() => {
      if (why === 'closed') { watched.delete(cs); return; }
      watchHunt(cs, w, now(), send);
      watchLive(cs, w, why, now());
      watchFunnel(cs, w, once);
    }));
  });
  win.setInterval(() => { for (const [cs, w] of watched) if (w.open) safe(() => watchLive(cs, w, null, now())); }, STALL_POLL_MS);

  /* THE HANG: the first main-thread stall over 3 s with the tab visible, ONCE per load. A stall
     throws nothing, so without this a frozen tab never reached Sentry at all. */
  const diag = startDiagnostics(win);
  diag.onHang(({ ms, from }) => safe(() => {
    if (st.hung) return;
    st.hung = true;
    const hunts = openHunts(watched);
    send('page_hang', { ms, hunts: hunts.length });
    /* WHAT HELD IT (Sentry JAVASCRIPT-4B: 18 stalls with nothing to name them): the stall's frames and their scripts,
       read a moment after (Chromium reports a Long Animation Frame some time after it renders, after the heartbeat
       that saw the stall: read at once, or a frame later, it named none), at once where no frame comes. No long frame
       and no long task in a stall is a page that ran nothing (a suspended machine, a throttled tab). */
    const report = () => safe(() => {
      /* each frame's scripts as one line: Sentry keeps three levels of `extra` and would send them as "[Array]" */
      const frames = diag.longFrames(Number.isFinite(from) ? from : 0).map((f) => ({ at: f.at, ms: f.ms, blocking: f.blocking,
        scripts: f.scripts.map((x) => x.ms + ' ms ' + x.invoker + ' ' + x.source).join(' | ') }));
      const held = { long_frames: frames, perf: diag.perf(),
        recent: diag.recent().slice(-5).map((r) => ({ level: r.level, msg: r.msg.slice(0, 160) })) };
      st.hang = (S) => S.captureMessage('The page stalled for ' + (ms / 1000).toFixed(1) + ' s', {
        level: 'warning', fingerprint: [HANG_PRINT], tags: { hang: 'main-thread' },
        extra: Object.assign({ stall_ms: ms, version: BUILD.version, hunts }, held) });
      if (sentry) { const h = st.hang; st.hang = null; h(sentry); }
    });
    if (typeof win.requestAnimationFrame === 'function' && doc.visibilityState !== 'hidden') win.setTimeout(report, HANG_READ_MS);
    else report();
  }));

  active = {
    environment: env.environment, send: true,
    identify(uid) {
      const next = typeof uid === 'string' && uid ? uid : null;
      if (next !== st.uid) st.onceKeys.clear();
      st.uid = next;
      if (!st.uid) return;
      if (sentry) safe(() => sentry.setUser({ id: st.uid }));
      safe(loadPostHog);
      safe(startPostHog);
    },
    /* PostHog's identity is replaced at the next sign-in (startPostHog); until then `send` has no uid, so
       nothing can leave under the old account, and a reset here would only mint an anonymous id. */
    forget() {
      st.uid = null;
      phUid = null;
      st.queue.length = 0;
      if (sentry) safe(() => sentry.setUser(null));
    },
    /* Replay records the game screen only: never sign-in, the characters list (it names the email) or the closed notice. */
    screen(name) {
      st.screen = name;
      const game = name === 'game';
      if (game === st.game) return;
      st.game = game;
      if (ph) safe(() => (game ? ph.startSessionRecording() : ph.stopSessionRecording()));
    },
    track: send,
    once,
  };
  return active;
}
