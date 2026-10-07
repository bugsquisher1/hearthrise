// ============================================================================
// src/net/live.js — THE PUSH CHANNEL'S CLIENT HALF (M5, "pushed live counters").
//
// The server half is applied: every accepted `hr_apply` write calls
// `hr_frame_send`, which broadcasts `{t:'delta', frame, patch}` from inside the
// database to ONE private topic `hr:<auth.uid()>:<slot>` (event 'frame'), gated
// by `hr_tick_config.frame_push`. RLS lets a subscriber RECEIVE only its own
// topic and nobody SEND on any (2026-09-22-frame-push-channel.sql §6).
//
// This module is TRANSPORT ONLY. It subscribes, routes each frame to
// accrue.js `applyFrame` (the one gate, the one applier), and heals:
//   · version-gated — `classifyFrame`: only a strictly newer frame writes;
//   · REPLACED, never merged — whole top-level keys through applyEnvelopeState;
//   · reconnect — backoff, and on every SUBSCRIBED one `hello` (the existing
//     hr-accrue round trip, which re-reads hr_state_of), so a gap is closed;
//   · a floor stuck too HIGH (SEC S3) — after LIVE_HEAL_AFTER_DROPS consecutive
//     `reorder`s ONE forced hello is sent under accrue.js `beginFloorHeal`; the
//     floor stays shut, and only THAT answer may set it lower (SEC C1);
//   · cost (SEC C2) — the backoff resets only after a join held
//     LIVE_STABLE_JOIN_MS, and join hellos are at most one per
//     LIVE_HELLO_MIN_INTERVAL_MS, so a flapping channel cannot spend Edge calls;
//   · no client, no session, no Realtime, frame_push=false — nothing arrives,
//     and the 90 s settle poll (untouched) is today's game exactly.
//
// It authors no number. The activity bar re-reads G every 100 ms, so XP, bag
// and kills tick up from frames with no display code of their own, and no gate
// reads anything this module writes. NOTHING here is persisted: the floor is
// session state, restated by the hello after a reload (RESIDUE_FIELDS gains
// nothing). ONE Realtime client: auth.js's shared one; this never creates one.
// ============================================================================

import { applyFrame, frameRefusal, getFrameDrops, beginFloorHeal, getFloorHeal, getAppliedFrame,
  requestAccrual, bootSettlePending, settleInFlight, resolveActiveSlot, MAX_SLOT,
  armGapHeal, requestGapHeal, getGapHealState } from './accrue.js?v=563';

export const LIVE_EVENT = 'frame';
const LIVE_BACKOFF_BASE_MS = 1000;
export const LIVE_BACKOFF_MAX_MS = 60000;
export const LIVE_HEAL_AFTER_DROPS = 3;
export const LIVE_HEAL_MIN_INTERVAL_MS = 60000;
export const LIVE_STABLE_JOIN_MS = 30000;
export const LIVE_HELLO_MIN_INTERVAL_MS = 30000;
const LIVE_WATCH_MS = 15000;
const LIVE_REPAINT_MIN_MS = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The topic `hr_frame_topic` spells, or null. Pure. */
export function liveTopic(uid, slot) {
  if (typeof uid !== 'string' || !UUID.test(uid)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) return null;
  return 'hr:' + uid.toLowerCase() + ':' + slot;
}

/** Exponential reconnect delay with ±20% jitter, capped. `rand` for tests. */
export function liveBackoffMs(attempt, rand) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const base = Math.min(LIVE_BACKOFF_MAX_MS, LIVE_BACKOFF_BASE_MS * Math.pow(2, Math.min(n, 20) - 1));
  const r = (typeof rand === 'number' && rand >= 0 && rand <= 1) ? rand : Math.random();
  return Math.round(base * (0.8 + 0.4 * r));
}

function win() { return (typeof window !== 'undefined') ? window : null; }

function defaultEnv() {
  return {
    client: () => { try { return win()?.HearthriseAuth?.getClient?.() || null; } catch (e) { return null; } },
    identity: () => {
      const A = win()?.HearthriseAuth;
      let uid = null; let token = null;
      try { uid = A?.currentUserId?.() || null; } catch (e) {}
      try { token = A?.getSession?.()?.access_token || null; } catch (e) {}
      return { uid, token, slot: resolveActiveSlot() };
    },
    G: () => win()?.G || null,
    hello: () => requestAccrual({}),
    heal: (token) => requestAccrual({ force: true, heal: token }),
    /* THE GAP HEAL'S READ: record.js's hr_load, in its heal mode (verdict only,
       no boot hydration). Through the window for the reason accrue.js reads it
       that way: record.js imports accrue.js. */
    reread: () => {
      const R = win()?.HearthriseRecord;
      return (R && typeof R.requestRecord === 'function') ? R.requestRecord({ heal: true }) : Promise.resolve(null);
    },
    applied: (written) => repaintAfterFrame(written),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => { if (h != null) clearTimeout(h); },
  };
}
let envOverride = null;
function env() { return envOverride || defaultEnv(); }
/** Test seam. `null` restores the real client, session, clock and applier hook. */
export function setLiveEnv(e) { envOverride = e ? { ...defaultEnv(), ...e } : null; return !!envOverride; }

function freshState() {
  return { topic: null, status: 'idle', attempt: 0, joins: 0, hellos: 0, heals: 0,
    applied: 0, dropped: 0, lastFrame: null, lastBytes: 0, lastAt: 0, lastRefusal: null, lastHealAt: 0,
    joinedAt: 0, lastHelloAt: 0, hellosDeferred: 0, gaps: 0 };
}
let st = freshState();
let channel = null;
let channelClient = null;
let retryTimer = null;
let helloTimer = null;
let epoch = 0;
let paused = 0;
let watch = null;
const authWired = new WeakSet();

/** Diagnostics (bug report / devtools). Read-only copy. */
export function getLiveState() {
  return { ...st, paused: paused > 0, floor: getAppliedFrame(), heal: getFloorHeal(), gapHeal: getGapHealState(),
    ...getFrameDrops() };
}

/** Leave the current topic now. Any callback of the old channel is dead (epoch). */
export function leave(why) {
  epoch += 1;
  if (retryTimer != null) { env().clearTimer(retryTimer); retryTimer = null; }
  if (helloTimer != null) { env().clearTimer(helloTimer); helloTimer = null; }
  const ch = channel; const c = channelClient;
  channel = null; channelClient = null;
  if (ch && c) { try { const p = c.removeChannel(ch); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  st.topic = null;
  st.status = 'idle';
  /* No channel, no self-frame to have relied on: the gap heal stands down. */
  armGapHeal(null);
  if (why === 'identity' || why === 'signout') st.attempt = 0;
  return st.status;
}

function wireAuth(c) {
  if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function' || authWired.has(c)) return;
  authWired.add(c);
  try {
    c.auth.onAuthStateChange((event, session) => {
      /* SEC: re-run setAuth on every token refresh, or a private channel silently
         stops authorizing and this client silently stops receiving. */
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session && session.access_token) {
        try { const p = c.realtime?.setAuth?.(session.access_token); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      }
      if (event === 'SIGNED_OUT') leave('signout');
      ensureLive();
    });
  } catch (e) {}
}

/** Bring the subscription in line with WHO is playing. Idempotent; cheap. */
export function ensureLive() {
  if (paused) return st.status;
  const e = env();
  const id = e.identity() || {};
  const want = id.token ? liveTopic(id.uid, id.slot) : null;
  if (want && want === st.topic && (channel || retryTimer != null)) return st.status;
  if (st.topic && want !== st.topic) leave(want ? 'identity' : 'signout');
  if (!want) return st.status;
  const c = e.client();
  if (!c || typeof c.channel !== 'function' || typeof c.removeChannel !== 'function') return st.status;
  wireAuth(c);
  join(c, want, id.token);
  return st.status;
}

function join(c, topic, token) {
  const my = ++epoch;
  try { const p = c.realtime?.setAuth?.(token); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  let ch = null;
  try {
    ch = c.channel(topic, { config: { private: true } });
    ch.on('broadcast', { event: LIVE_EVENT }, (m) => { if (my === epoch) onFrame(topic, m && m.payload); });
    ch.subscribe((status) => { if (my === epoch) onStatus(status); });
  } catch (err) {
    channel = ch; channelClient = c; st.topic = topic;
    scheduleRetry();
    return;
  }
  channel = ch; channelClient = c;
  st.topic = topic;
  st.status = 'joining';
}

function onStatus(status) {
  if (status === 'SUBSCRIBED') {
    st.status = 'joined';
    /* SEC C2: NOT `attempt = 0` here — a subscribe→close flap would then retry
       at the base delay forever. The backoff resets in scheduleRetry, and only
       for a join that held LIVE_STABLE_JOIN_MS. */
    st.joinedAt = env().now();
    st.joins += 1;
    armGap();
    joinHello();
    return;
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') scheduleRetry();
}

/* THE GAP HEAL IS ARMED WHILE JOINED (2026-10-09-frame-self-echo.sql). The
   server stopped pushing a player's own write back to them, so while frames
   flow, a write whose answer never arrived, a frame that skips a version and a
   poll that states a newer version each re-read the projection once
   (accrue.js requestGapHeal). Every callback reads THIS module's env at call
   time, so the test seam reaches it. */
function armGap() {
  armGapHeal({
    read: () => env().reread(),
    G: () => env().G(),
    applied: (written) => env().applied(written),
    now: () => env().now(),
    setTimer: (fn, ms) => env().setTimer(fn, ms),
    clearTimer: (h) => env().clearTimer(h),
  });
}

/* SEC C2: at most one join hello per LIVE_HELLO_MIN_INTERVAL_MS. A join inside
   the window DEFERS its hello to the window's end (one timer, dropped if the
   channel leaves first) instead of dropping it — the gap still closes, and the
   90 s settle poll is the floor beneath both. */
function joinHello() {
  const e = env();
  const wait = st.lastHelloAt ? (st.lastHelloAt + LIVE_HELLO_MIN_INTERVAL_MS) - e.now() : 0;
  if (wait <= 0) { hello(); return; }
  if (helloTimer != null) return;
  st.hellosDeferred += 1;
  const my = epoch;
  const h = helloTimer = e.setTimer(() => {
    if (helloTimer === h) helloTimer = null;
    if (my === epoch && st.status === 'joined') hello();
  }, wait);
}

function scheduleRetry() {
  const topic = st.topic;
  const held = st.status === 'joined' && st.joinedAt > 0 && env().now() - st.joinedAt >= LIVE_STABLE_JOIN_MS;
  const attempt = (held ? 0 : st.attempt) + 1;
  leave('retry');
  st.topic = topic;          // still the topic we want; ensureLive re-joins it
  st.status = 'retrying';
  st.attempt = attempt;
  retryTimer = env().setTimer(() => { retryTimer = null; st.topic = null; ensureLive(); }, liveBackoffMs(attempt));
}

/** The reconnect re-read: ONE hr-accrue round trip through the normal applier.
 *  At boot the boot settle IS the hello, so none is added (frame_push=false
 *  then costs nothing). If a settle is in flight it may predate the join, so
 *  the hello waits for it and asks once more. */
export function hello() {
  const e = env();
  if (bootSettlePending() && !settleInFlight()) return 'boot';
  const ask = () => { st.hellos += 1; st.lastHelloAt = e.now(); try { const p = e.hello(); if (p && p.catch) p.catch(() => {}); return p; } catch (x) { return null; } };
  if (settleInFlight()) {
    const p = requestAccrual({});
    Promise.resolve(p).catch(() => {}).then(() => ask());
    return 'after-settle';
  }
  ask();
  return 'sent';
}

function onFrame(topic, payload) {
  const e = env();
  const id = e.identity() || {};
  /* The frame must be for the character in G NOW, not the one we joined for. */
  if (topic !== st.topic || topic !== liveTopic(id.uid, id.slot)) { leave('identity'); ensureLive(); return; }
  const G = e.G();
  const written = applyFrame(G, payload);
  st.lastAt = e.now();
  try { st.lastBytes = JSON.stringify(payload).length; } catch (x) { st.lastBytes = 0; }
  if (!written) {
    st.dropped += 1;
    st.lastRefusal = frameRefusal();
    healStuckFloor();
    return;
  }
  st.applied += 1;
  st.lastFrame = written.envelope.version;
  st.lastRefusal = null;
  try { e.applied(written); } catch (x) {}
  /* A SKIPPED VERSION: this frame is partial, so re-read the projection. */
  if (written.gap) { st.gaps += 1; requestGapHeal('frame_gap'); }
}

/** SEC S3: a floor ABOVE the server refuses every frame AND the hello. After
 *  enough consecutive reorders, send ONE forced hello, rate-limited.
 *  SEC C1: THE FLOOR IS KEPT. Reorders are also what a socket does on a good
 *  day (a newer answer beat an older frame), and an opened floor let every
 *  stale frame or answer still in flight land as fresh. `beginFloorHeal` marks
 *  the floor; only the answer to THIS request may set it lower, and only if
 *  nothing fresher landed meanwhile (accrue.js `healAnswer`/`applyEnvelope`).
 *  ⚠ Runs only while the channel is joined: Realtime down or past its user cap
 *  means no heal (LIVE_COUNTERS_PUSH.md §5 D4). */
export function healStuckFloor() {
  const e = env();
  const d = getFrameDrops();
  if (d.drops < LIVE_HEAL_AFTER_DROPS || d.verdict !== 'reorder') return false;
  if (st.status !== 'joined') return false;
  const now = e.now();
  if (st.lastHealAt && now - st.lastHealAt < LIVE_HEAL_MIN_INTERVAL_MS) return false;
  const token = beginFloorHeal();
  if (token == null) return false;
  st.lastHealAt = now;
  st.heals += 1;
  st.hellos += 1;
  st.lastHelloAt = now;
  try { const p = e.heal(token); if (p && p.catch) p.catch(() => {}); } catch (x) {}
  return true;
}

let lastRepaintAt = 0;
function repaintAfterFrame(written) {
  const w = win();
  if (!w) return;
  try { w.HearthriseRecord?.applyRecord?.(w.G, written.envelope); } catch (e) {}
  try { if (typeof w.refreshActivityBar === 'function') w.refreshActivityBar(); } catch (e) {}
  const now = Date.now();
  if (now - lastRepaintAt < LIVE_REPAINT_MIN_MS) return;
  lastRepaintAt = now;
  try { if (typeof w.refreshAll === 'function') w.refreshAll(); } catch (e) {}
}

/** Start once per tab: a slow watchdog keeps the topic matched to the identity
 *  and runs the stuck-floor healer; visibility return re-checks at once. */
export function startLive() {
  if (watch) return false;
  watch = setInterval(() => { ensureLive(); healStuckFloor(); }, LIVE_WATCH_MS);
  const d = (typeof document !== 'undefined') ? document : null;
  if (d && typeof d.addEventListener === 'function') {
    d.addEventListener('visibilitychange', () => { if (!d.hidden) ensureLive(); });
  }
  ensureLive();
  return true;
}

/** TEST SEAMS — the harness pauses the channel around a stubbed session, and
 *  `__resetLive` returns the module to boot state. */
function pauseForTest() { paused += 1; leave('paused'); return paused; }
function resumeForTest() { paused = paused > 0 ? paused - 1 : 0; return paused; }
export function __resetLive() { leave('reset'); st = freshState(); lastRepaintAt = 0; return getLiveState(); }

if (typeof window !== 'undefined') {
  window.HearthriseLive = {
    LIVE_EVENT, LIVE_HEAL_AFTER_DROPS, LIVE_HEAL_MIN_INTERVAL_MS, LIVE_BACKOFF_MAX_MS,
    LIVE_STABLE_JOIN_MS, LIVE_HELLO_MIN_INTERVAL_MS,
    liveTopic, liveBackoffMs, getLiveState, ensureLive, leave, hello, healStuckFloor, startLive,
    setLiveEnv, __resetLive, __pauseForTest: pauseForTest, __resumeForTest: resumeForTest,
  };
}
