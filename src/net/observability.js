// ════════════════════════════════════════════════════════════════════════
// src/net/observability.js — ERRORS AND REPLAYS FROM REAL PLAYERS (telemetry only).
//
// Started once by src/app/boot.js. On a sending host (observability-config.js
// `hosts`, with `enabled` on and no ?noanalytics=1) it loads the vendored SDKs
// from our own origin and wires:
//   Sentry   uncaught errors, unhandled rejections and console.error, every one
//            (sampleRate 1); release = BUILD.version; no tracing, no replay;
//            user = the account id; URLs leave without query or fragment
//   PostHog  identified_only profiles keyed by the account id, kept in memory only;
//            no autocapture or pageviews; session replay only while the game
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
// ════════════════════════════════════════════════════════════════════════

import { OBSERVABILITY_CONFIG } from './observability-config.js?v=0.2.23';
import { BUILD } from '../build-info.js?v=0.2.23';
import { observeSessions } from '../session/character-session.js?v=0.2.23';
import { partyOf, settingsOf } from '../session/hunt-sections.js?v=0.2.23';
import { endedSessionOf } from '../hunt-view/summary-model.js?v=0.2.23';

const EARLY_MAX = 10;        // errors held while Sentry loads
const QUEUE_MAX = 20;        // events held while PostHog loads
const STALL_MAX = 50;        // live_view_stall per page load: a stuck loop must not spend the quota
const STALL_POLL_MS = 1000;  // how often a running live engine is looked at (starving emits nothing)

const NOOP = Object.freeze({ environment: 'dev', send: false, identify() {}, forget() {}, screen() {}, track() {} });
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

function sentryOptions(cfg, env, S) {
  return {
    dsn: cfg.sentry.dsn, release: BUILD.version, environment: env.environment,
    sampleRate: 1, sendDefaultPii: false, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    integrations: (defaults) => defaults.concat(typeof S.captureConsoleIntegration === 'function' ? [S.captureConsoleIntegration({ levels: ['error'] })] : []),
    beforeSend(event) {
      if (event.request) { event.request.url = bare(event.request.url); delete event.request.cookies; if (event.request.headers) delete event.request.headers.Referer; }
      return event;
    },
    beforeBreadcrumb(c) {
      if (c && c.category === 'navigation' && c.data) { c.data.from = bare(c.data.from); c.data.to = bare(c.data.to); }
      return c;
    },
  };
}

function posthogOptions(cfg, win) {
  return {
    api_host: cfg.posthog.host, person_profiles: 'identified_only',
    persistence: 'memory',   // nothing on the device: the distinct id is the account id once identified
    autocapture: false, capture_pageview: false, capture_pageleave: false, capture_dead_clicks: false, capture_heatmaps: false,
    capture_performance: false, capture_exceptions: false, rageclick: false, disable_surveys: true,
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
  if (!w.seen) { if (cs.record) { w.seen = true; w.open = open; w.sid = open ? s.id : null; } return; }
  if (w.open && (!open || s.id !== w.sid)) {
    const e = s && s.id === w.sid ? s : null;
    if (w.starvedAt !== null) { w.stall('starve', now - w.starvedAt); w.starvedAt = null; }
    send('hunt_ended', { reason: e ? e.reason : null,
      seconds: e && e.enteredMs !== null && e.endedMs !== null ? Math.round((e.endedMs - e.enteredMs) / 1000) : null });
    w.open = false; w.sid = null; w.reseeds = 0;
  }
  if (open && s.id !== w.sid) {
    const party = partyOf(cs);
    const set = settingsOf(cs);
    send('hunt_started', { hunt: s.hunt, party_size: party ? party.members.length : 1, density: set ? set.density : null });
    w.open = true; w.sid = s.id; w.reseeds = 0;
  }
}

/* live_view_stall: `starve` ms = from the engine seen stopped (hunt still open) to its next start
   point; `reseed` ms = how long the prediction ran before the server's world corrected it. */
function watchLive(cs, w, why, now) {
  /* a prediction that ran to the hunt's end (live-link.js ended) is not starving */
  const running = !!(cs.live && (cs.live.running() || (typeof cs.live.ended === 'function' && cs.live.ended())));
  if (why === 'reseed') { w.reseeds++; w.stall('reseed', now - w.since); w.since = now; }
  else if (why === 'live') { if (w.starvedAt !== null) { w.stall('starve', now - w.starvedAt); w.starvedAt = null; } w.since = now; }
  else if (w.open && w.running && !running && w.starvedAt === null) w.starvedAt = now;
  w.running = running;
}

/** One named event (telemetry only, never read back). A no-op where nothing sends. */
export function track(name, props) { safe(() => active.track(name, props)); }

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
  const st = { uid: null, game: false, queue: [], stalls: 0 };
  let sentry = null;
  let ph = null;

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
  });
  load(doc, cfg.posthog.scripts, () => {
    const P = win.posthog;
    if (!P || typeof P.init !== 'function') return;
    ph = P.init(cfg.posthog.key, posthogOptions(cfg, win)) || P;
    if (st.uid) ph.identify(st.uid);
    if (st.game) ph.startSessionRecording();
    for (const [n, p] of st.queue.splice(0)) safe(() => ph.capture(n, p));
  });

  const send = (name, props) => {
    const p = Object.assign({}, props || {});
    if (ph) safe(() => ph.capture(name, p)); else if (st.queue.length < QUEUE_MAX) st.queue.push([name, p]);
  };
  const watched = new Map();
  observeSessions((cs) => {
    const w = { seen: false, open: false, sid: null, running: false, since: now(), starvedAt: null, reseeds: 0,
      stall: (kind, ms) => { if (st.stalls < STALL_MAX) { st.stalls++; send('live_view_stall', { kind, ms: Math.round(ms), reseeds: w.reseeds }); } } };
    watched.set(cs, w);
    cs.subscribe((c, why) => safe(() => {
      if (why === 'closed') { watched.delete(cs); return; }
      watchHunt(cs, w, now(), send);
      watchLive(cs, w, why, now());
    }));
  });
  win.setInterval(() => { for (const [cs, w] of watched) if (w.open) safe(() => watchLive(cs, w, null, now())); }, STALL_POLL_MS);

  active = {
    environment: env.environment, send: true,
    identify(uid) {
      st.uid = typeof uid === 'string' && uid ? uid : null;
      if (!st.uid) return;
      if (sentry) safe(() => sentry.setUser({ id: st.uid }));
      if (ph) safe(() => ph.identify(st.uid));
    },
    forget() {
      st.uid = null;
      if (sentry) safe(() => sentry.setUser(null));
      if (ph) safe(() => ph.reset());
    },
    /* Replay records the game screen only: never sign-in, the characters list (it names the email) or the closed notice. */
    screen(name) {
      const game = name === 'game';
      if (game === st.game) return;
      st.game = game;
      if (ph) safe(() => (game ? ph.startSessionRecording() : ph.stopSessionRecording()));
    },
    track: send,
  };
  return active;
}
