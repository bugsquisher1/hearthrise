// ============================================================================
// src/net/town.js — THE COMMON: the second, explicitly NON-AUTHORITATIVE read
// channel (the live-world program, week 1 client half).
//
// WHAT THIS IS. Three verbs, all of them display-only or presence-only, on
// their own cadence, parked in `_`-prefixed scratch and rendered by
// src/render/town-panel.js:
//
//   hr_town_of(p_zone)                     who else is in the realm and what
//                                          the crier has to say  → `G._town`
//   hr_heartbeat(p_slot)                   "I am at the keyboard", stamped by
//                                          the SERVER's clock (never ours)
//   hr_set_presence_quiet(p_slot,p_quiet)  the opt-out: a public activity
//                                          projection is a stalking surface,
//                                          so every player can leave it
//
// ── WHY IT IS ITS OWN CHANNEL AND NOT PART OF THE ENVELOPE ──────────────────
// `hr_state_of` is VERSION-GATED: the client applies an envelope only when the
// version it carries is the one it expects. Peers change every few seconds and
// belong to nobody, so folding them into the envelope would turn other people
// moving around into a `version_conflict` storm on the one call that owns gold,
// XP and inventory. This is a SEPARATE, UNVERSIONED read with its own cadence;
// `SETTLE_INTERVAL_MS` is untouched by anything in this file. The one piece of
// presence that IS the player's own — `place:{zone,quiet}` — rides the envelope
// and is mirrored here into `G._place` by `notePlace`.
//
// ── WHAT IT MAY NEVER BECOME ────────────────────────────────────────────────
//   · NOT authority. No number here is applied to a record field. The module
//     writes exactly two properties, `G._town` and `G._place`, both `_`-scratch
//     that snapshotG never sees and the residue allowlist must never gain
//     (TOWN-1 asserts it). `zone`, `pos` and `quiet` in the residue would be a
//     client-owned copy of a server capability — the residue-ahead class.
//   · NOT a gate. No capability, unlock, price or reward may read `_town`.
//   · NOT a store. A successful read replaces the view wholesale; a failure
//     leaves the last good answer exactly as it was, because a flaky connection
//     must never turn a populated realm into an empty one.
//
// ── FAIL-SAFE: ABSENT MEANS INVISIBLE ───────────────────────────────────────
// Until the lane-C migration applies, these verbs DO NOT EXIST and answer
// 404 / PGRST202 / 42883. That, a `{ok:true, off:true}` body (the server flag
// down), a refusal (`rate_limited` / `bad_zone` / `unauthenticated`), a network
// failure and a garbage body all resolve to the SAME outcome: the panel is not
// rendered at all, nothing else changes, no toast is raised and the console
// gets ONE debug line for the whole session — a feature the realm has not
// turned on must be silent, not noisy.
//
// Absence is PROVEN, not assumed: the missing-verb decision comes from the one
// place that owns it (`window.HearthriseRpc.isMissingRpc`), so a 401 or a rate
// refusal is never read as "the realm has no common", and the negative that
// records expires in ten minutes — a session left open across the apply starts
// showing the Common with no reload.
// ============================================================================

/* 25 seconds — the study's number, and the floor the heartbeat bucket wants
   (6/min). Slow enough that a hundred idle Home tabs are one cached view read
   each, fast enough that somebody joining a node appears while you are still
   looking. Polling stops dead when Home is not visible or the tab is hidden. */
export const TOWN_POLL_MS = 25000;

const TOWN_RPC = 'hr_town_of';
const BEAT_RPC = 'hr_heartbeat';
const QUIET_RPC = 'hr_set_presence_quiet';
const ZONE = 'the_common';

/* A refusal parks the channel rather than hammering it. The server's bucket is
   30/min for the read; one minute off is far inside it and costs the player at
   most one stale panel. */
const REFUSAL_BACKOFF_MS = 60000;

/* The client keeps a couple more crier lines than it shows, so a burst between
   two polls is not lost — and refuses to grow without bound on a lucky day. */
const CRIER_KEEP = 8;

const w = () => (typeof window !== 'undefined' ? window : {});

function cfg() {
  const S = w().HearthriseSupabase;
  return (S && typeof S.getConfig === 'function' && S.getConfig()) || null;
}
function session() {
  const A = w().HearthriseAuth;
  return (A && typeof A.getSession === 'function' && A.getSession()) || null;
}
function signedIn() { const s = session(); return !!(s && s.user && cfg()); }

/** The active character slot, from the profile, clamped. Mirrors net/workers.js. */
function activeSlot() {
  try {
    const P = w().HearthriseProfile;
    if (P && typeof P.activeSlot === 'function') {
      const s = P.activeSlot();
      if (typeof s === 'number' && s >= 0 && s <= 5) return s | 0;
    }
  } catch (e) {}
  return 0;
}

let saidOnce = false;
/** ONE debug line per session for the whole "not applied yet" state. */
function noteOnce(msg) {
  if (saidOnce) return;
  saidOnce = true;
  try { console.debug('[town] ' + msg); } catch (e) {}
}

/**
 * THE GATEWAY. Both decisions that must not differ between callers come from
 * `window.HearthriseRpc` — "may this call go out at all" (`mayCall`, so a
 * pre-auth boot call is refused here instead of firing a 42501) and "does the
 * server have this verb" (`isMissingRpc` / `note`, with its ten-minute negative
 * TTL). The transport stays local, exactly as server-rpc.js's charter says:
 * every caller owns its own fetch and its own auth rules.
 *
 * Returns the server's own body, or `{ok:false, error:…}`. Never throws.
 */
async function call(name, body) {
  const gen = epoch;
  const R = w().HearthriseRpc;
  if (R && typeof R.mayCall === 'function' && !R.mayCall(name, signedIn())) return { ok: false, error: 'not_signed_in' };
  if (R && typeof R.shouldTry === 'function' && !R.shouldTry(name)) return { ok: false, error: 'rpc_missing' };
  const c = cfg();
  if (!c) return { ok: false, error: 'no_config' };
  const s = session();
  let res = null, json = null;
  /* Last thing before the wire, so an await added above this line can never
     reopen the window: a retired generation spends nothing. */
  if (paused || gen !== epoch) return { ok: false, error: 'paused' };
  try {
    res = await fetch(c.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: c.anonKey,
        Authorization: 'Bearer ' + ((s && s.access_token) || c.anonKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });
    try { json = await res.json(); } catch (e) { json = null; }
  } catch (e) { return { ok: false, error: 'network' }; }
  if (R && typeof R.isMissingRpc === 'function' && R.isMissingRpc(res.status, json)) {
    if (typeof R.note === 'function') R.note(name, false);
    noteOnce(name + ' is not applied yet — the Common stays hidden');
    return { ok: false, error: 'rpc_missing' };
  }
  if (R && typeof R.note === 'function') R.note(name, true);
  if (!res.ok || !json || typeof json !== 'object') return { ok: false, error: 'http_' + res.status };
  return json;
}

/* ── THE SHAPE ────────────────────────────────────────────────────────────── */

/** A finite integer ≥ 0, or null — never NaN into a renderer. */
function int(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
function str(v, max) { return String(v == null ? '' : v).slice(0, max); }

const OFF_VIEW = Object.freeze({ status: 'off', at: 0, zone: null, here: null, shown: null, staleS: null, peers: [], crier: [] });

/**
 * One `hr_town_of` body → the shape the panel reads. PURE, so the suite drives
 * the whole renderer from a fixture with no network.
 *
 * THE SEVEN PEER KEYS AND THE SIX CRIER KEYS ARE AN ALLOWLIST, coerced on the
 * way in. This is the one read in the client whose contents nobody in this
 * session controls, so a name is escaped by the renderer, a level band is a
 * string we print and never compare, and an `activity_kind` this build has
 * never heard of is KEPT and grouped rather than dropped (the AWAY_SCOPE
 * discipline: an unknown kind must show up as people, not as a hole).
 */
function normalizeTown(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || raw.off === true) return OFF_VIEW;
  if (!Array.isArray(raw.peers) && !Array.isArray(raw.crier)) return OFF_VIEW;
  const peers = (Array.isArray(raw.peers) ? raw.peers : []).map((p) => {
    if (!p || typeof p !== 'object') return null;
    const name = str(p.name, 24);
    if (!name) return null;
    return {
      name,
      kind: str(p.activity_kind, 24) || 'idle',
      activityId: str(p.activity_id, 48) || null,
      label: str(p.activity_label, 40),
      /* AN INTEGER DECADE FLOOR from hr_total_level, not a printable string —
         the server sends 40 and the RENDERER decides it reads "Lv 40-49". */
      band: int(p.level_band),
      seenAgoS: int(p.seen_ago_s),
      away: p.away === true,
    };
  }).filter(Boolean);
  const crier = (Array.isArray(raw.crier) ? raw.crier : []).map((c) => {
    if (!c || typeof c !== 'object') return null;
    const itemId = str(c.item_id, 48);
    if (!itemId) return null;
    return {
      name: str(c.name, 24),
      itemId,
      sourceKind: str(c.source_kind, 24),
      sourceId: str(c.source_id, 48),
      oneIn: int(c.one_in),
      foundAgoS: int(c.found_ago_s),
    };
  }).filter(Boolean).slice(0, CRIER_KEEP);
  const t = raw.now ? Date.parse(raw.now) : NaN;
  return {
    status: 'ok',
    zone: str(raw.zone, 32) || ZONE,
    at: Number.isFinite(t) && t > 0 ? t : Date.now(),
    /* `here` is the realm's true population and is NEVER painted as a count —
       it exists only so the rail can say "shown of many" when the server
       capped the list. See the design rule in src/render/town-panel.js. */
    here: int(raw.here),
    shown: int(raw.shown),
    staleS: int(raw.stale_s),
    peers,
    crier,
  };
}

/** The current view, always an object. 'unknown' until a read lands. */
function readTown() {
  const G = w().G;
  const t = G && G._town;
  return (t && typeof t === 'object' && typeof t.status === 'string') ? t : { status: 'unknown', at: 0, zone: null, here: null, shown: null, staleS: null, peers: [], crier: [] };
}

/** The player's OWN presence block, mirrored off the envelope. Never authority. */
function readPlace() {
  const G = w().G;
  const p = G && G._place;
  return (p && typeof p === 'object') ? p : { zone: null, quiet: false };
}

function park(view) {
  const G = w().G;
  if (G && typeof G === 'object') G._town = view;
  return view;
}

/**
 * Mirror the envelope's own `place:{zone,quiet}` block into `G._place`.
 * OBSERVATION ONLY, and guarded — an observation must never break a load.
 * Called from the same place the property and renown mirrors are taken
 * (src/net/client-state.js applyClientState), so the boot load feeds it too.
 */
function notePlace(res) {
  try {
    const pl = res && typeof res === 'object' && res.place;
    if (!pl || typeof pl !== 'object') return false;
    const G = w().G;
    if (!G || typeof G !== 'object') return false;
    G._place = { zone: str(pl.zone, 32) || null, quiet: pl.quiet === true };
    return true;
  } catch (e) { return false; }
}

/** Test seam: park a raw body (`{off:true}` included) as the server would send it. */
function setTown(raw) { return park(normalizeTown(raw)); }

/* ── THE READ ─────────────────────────────────────────────────────────────── */

let inFlight = null;
let nextTownAt = 0;

async function refreshTown(nowMs) {
  const now = Number(nowMs) || Date.now();
  if (paused || inFlight || now < nextTownAt) return readTown();
  inFlight = (async () => {
    /* NO p_zone. The verb defaults to the realm's own zone and refuses any
       other string with bad_zone, so naming it here would be the client
       asserting a zone it does not own — and would break the day the realm
       renames the place. */
    const body = await call(TOWN_RPC, {});
    if (body.ok === true && body.off !== true && (Array.isArray(body.peers) || Array.isArray(body.crier))) {
      nextTownAt = 0;
      return park(normalizeTown(body));
    }
    if (body.ok === true) return park(OFF_VIEW);          // the realm says the common is closed
    /* A REFUSAL IS NOT AN ABSENCE. Back off (hard on rate_limited, which is the
       one the bucket will actually hand out) and KEEP the last good view: the
       player is looking at a panel, and blanking it on one bad answer is a
       worse lie than showing a 25-second-old one. */
    if (body.error === 'rate_limited') nextTownAt = now + REFUSAL_BACKOFF_MS;
    const prev = readTown();
    return prev.status === 'ok' ? prev : park(OFF_VIEW);
  })();
  try { return await inFlight; } finally { inFlight = null; }
}

/* ── THE HEARTBEAT ────────────────────────────────────────────────────────── */

let nextBeatAt = 0;
let beatInFlight = false;

/**
 * "I am at the keyboard", stamped by the SERVER. Never by us: a client-written
 * liveness stamp is a client-asserted presence, which is exactly the forgeable
 * shape the study rejected Realtime Presence for.
 *
 * The bucket is 6/min and the cadence is one per poll (25s), so the only way to
 * meet the limiter is a burst of visibility flips — and when the server DOES
 * throttle, it says `next_in_s` and we wait exactly that long rather than
 * guessing. Foreground only; a background tab is not a person.
 */
async function heartbeat(nowMs) {
  const now = Number(nowMs) || Date.now();
  if (paused || beatInFlight || now < nextBeatAt || !signedIn()) return false;
  beatInFlight = true;
  try {
    const body = await call(BEAT_RPC, { p_slot: activeSlot() });
    /* THE BEAT ALSO ANSWERS WITH THE PLAYER'S OWN PLACE, throttled or not, so
       the Quiet control is correct from the first beat instead of waiting for
       an envelope. Server value only, never the one we asked for. */
    if (body && body.ok === true) notePlace({ place: { zone: body.zone, quiet: body.quiet } });
    if (body && body.throttled) {
      const wait = int(body.next_in_s);
      nextBeatAt = now + (wait === null ? 60 : wait) * 1000;
      return false;
    }
    if (body && body.ok === true) { nextBeatAt = now + TOWN_POLL_MS; return true; }
    nextBeatAt = now + REFUSAL_BACKOFF_MS;
    return false;
  } finally { beatInFlight = false; }
}

/* ── THE OPT-OUT ──────────────────────────────────────────────────────────── */

/**
 * Leave (or rejoin) the public projection. The SERVER's answer is what lands in
 * `G._place` — never the value we asked for, so a refused toggle cannot leave
 * the client believing it is hidden when the realm still shows it. That
 * direction matters more than any other in this file: a player who thinks they
 * are invisible and is not has been failed in a way a stale roster never does.
 */
async function setQuiet(quiet) {
  const want = quiet === true;
  const body = await call(QUIET_RPC, { p_slot: activeSlot(), p_quiet: want });
  if (!body || body.ok !== true) return { ok: false, error: (body && body.error) || 'failed' };
  const G = w().G;
  if (G && typeof G === 'object') G._place = { zone: readPlace().zone, quiet: body.quiet === true };
  nextTownAt = 0;
  refreshTown().catch(() => {});
  return { ok: true, quiet: body.quiet === true };
}

/* ── THE CADENCE ──────────────────────────────────────────────────────────── */

let timer = null;

/* ── THE PAUSE, AND WHY A DISPLAY-ONLY CHANNEL NEEDS ONE ────────────────────
   The suite hands the page a fake session (`stubSignedIn` in
   src/features/smoke/_harness.js), and with it a fake config whose origin is
   `https://test.local`. Both of this channel's cadences keep running while that
   stub is installed, so a tick lands on the stub origin, the page's CSP refuses
   the request, and the run cannot claim a clean console — GitHub 36001561175
   read `passed 1354/1367 failed 0` and still exited 1 on two page errors, one
   per verb. Nothing was lost (both verbs are display-only), but a console gate
   that cannot be trusted is not a gate.

   So the stub PAUSES the channel for its lifetime and resumes it on restore,
   through this module's own hooks — the suite never reaches in for the timer
   and never swaps `window.fetch` to do it. Depth-counted, because a nested stub
   must not resume the outer one's channel.

   `epoch` is party.js's generation pattern: a call that began in one generation
   abandons itself the moment that generation is retired, so a tick caught
   mid-flight at teardown cannot go on to spend a request against whatever
   config is installed by the time it reaches the wire.

   NO BEHAVIOUR CHANGE FOR PLAYERS: nothing in the shipped game calls either
   hook, and with neither called `paused` is false and `epoch` never moves. */
let paused = false;
let pauseDepth = 0;
let epoch = 0;

/** TEST SEAM. Both return the resulting depth, so a caller can prove it balanced. */
function pauseForTest() { pauseDepth += 1; paused = true; epoch += 1; return pauseDepth; }
function resumeForTest() {
  pauseDepth = pauseDepth > 0 ? pauseDepth - 1 : 0;
  if (!pauseDepth) paused = false;
  epoch += 1;
  return pauseDepth;
}

/** Home visible AND the tab in front. Either falsy ⇒ no read goes out. */
function shouldPoll() {
  const d = (typeof document !== 'undefined') ? document : null;
  if (!d || d.hidden) return false;
  const panel = d.getElementById('panel-profile');
  return !!(panel && panel.classList.contains('active'));
}

function tick() {
  const d = (typeof document !== 'undefined') ? document : null;
  if (paused) return;                    // a stubbed session is not a player
  if (!d || d.hidden) return;            // a background tab is not a person
  heartbeat().catch(() => {});
  if (shouldPoll()) refreshTown().catch(() => {});
}

/**
 * Start the channel. Idempotent — a second call must not add a second timer
 * (two timers would double the realm's read load for one panel).
 *
 * ONE interval for the life of the tab rather than start/stop on every tab
 * change: the gate is inside `tick()` and is re-read every time, so a hidden
 * tab or any screen other than Home costs one predicate and zero requests. A
 * visibility return ticks immediately, so coming back does not show a
 * 25-second-old Common.
 */
export function startTownChannel() {
  if (timer) return;
  timer = setInterval(tick, TOWN_POLL_MS);
  const d = (typeof document !== 'undefined') ? document : null;
  if (d && typeof d.addEventListener === 'function') {
    d.addEventListener('visibilitychange', () => { if (!d.hidden) tick(); });
  }
  tick();
}

if (typeof window !== 'undefined') {
  window.HearthriseTown = {
    TOWN_POLL_MS, TOWN_RPC, BEAT_RPC, QUIET_RPC, ZONE,
    normalizeTown, readTown, readPlace, notePlace,
    refreshTown, heartbeat, setQuiet, shouldPoll, startTownChannel,
    /** TEST SEAM — park a fixture body. Writes only `G._town`. */
    __setTown: setTown,
    /** TEST SEAM — stop/restart both cadences around a stubbed session. */
    __pauseForTest: pauseForTest,
    __resumeForTest: resumeForTest,
  };
}
