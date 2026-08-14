// ============================================================================
// src/net/accrue.js — THE CLIENT HALF OF SERVER-AUTHORITATIVE AWAY TIME (b337).
//
// Roadmap item 2 of the server-authority program, scoped to ONE vertical slice:
// away-time accrual. On return from an absence the client ASKS THE SERVER what
// it earned and renders the answer. It computes nothing.
//
// ── THE ONE PROPERTY THIS FILE EXISTS TO HOLD ───────────────────────────────
// **THERE IS NO FALLBACK TO LOCAL COMPUTATION. NONE.** A silent fallback is the
// single most dangerous thing that could be built here, because it looks exactly
// like success while the client quietly keeps authoring its own progression —
// and it would be discovered only by an economy that no longer balances. So:
//
//   • when the switch is OFF, this module is not consulted at all and
//     legacy.js's processOffline() behaves EXACTLY as it did in b336;
//   • when the switch is ON, processOffline() returns before it computes
//     anything, unconditionally — including when the server is unreachable,
//     rate-limited, 500ing, or says the character does not exist. The absence
//     is simply not credited, and the player is TOLD.
//
// That is deliberately the harsher of the two behaviours. "Credited nothing and
// said so" is recoverable; "credited a number this device invented" is not.
//
// ── THE CONTRACT, AS FOUND (not as guessed) ─────────────────────────────────
// Source: supabase/functions/hr-accrue/index.ts + request.js + accrual.js, and
// the envelope built by hr_state_of in
// supabase/migrations/2026-08-11-apply-engine.sql:205-259.
//
//   REQUEST   POST <SUPABASE_URL>/functions/v1/hr-accrue
//             Authorization: Bearer <user JWT>      (verified in-function
//                                                    against the project JWKS)
//             apikey: <anon key>                    (the gateway wants one)
//             Content-Type: application/json
//             body {"slot": N}                      — request.js reads NOTHING
//                                                     else, ever; `slot` is
//                                                     coerced to an integer in
//                                                     [0, MAX_SLOT=5].
//
//   RESPONSE  200 {ok:true, accrued:true,  ...envelope, levels, away:{…}}
//             200 {ok:true, accrued:false, reason, version, now}
//             200 {ok:true, accrued:false, reason:'replayed'|'clamped', …}
//             401 {ok:false, error:'not_signed_in'}
//             409 {ok:false, error:'no_character'}         (empty slot)
//             409 {ok:false, error:<hr_apply code>, detail}
//             429 {ok:false, error:'rate_limited'}
//             503 {ok:false, error:'engine_unconfigured'|'auth_unavailable'}
//             500 {ok:false, error:'server_error'}
//             GET  200 {ok:true, fn:'hr-accrue', payload_sha256}  — health only
//
//   ENVELOPE  {version, now, state:{slot,gold,gems,hearth_tokens,hp,max_hp,
//             bank_cap,active_kind,active_id,active_since,accrued_to},
//             skills:{<id>:{xp,level}}, inventory:{<id>:qty},
//             equipment:{<slot>:<item>}, farm:[…], progress:[…],
//             progress_truncated, total_level}
//
//   away:     {grantMs, capped, tickMs, kills, crits, died, blessed,
//              buffsPaused, featuredMs, featuredDropMult, gold, xp, items,
//              levelUps, events}   — the receipt, STATED by the simulation so
//              no renderer can invent a bonus that was not applied.
//
// ── WHAT ACTUALLY GATES THIS (b339 — the previous paragraph was FALSE) ──────
// This block used to say: "the DEPLOYED function has no CORS headers, so a
// browser preflight fails and every call here lands on `unreachable`." That was
// true when it was written and is NOT true now. Verified against production:
// a preflight from hearthrise.net returns 204 with the right
// `Access-Control-Allow-Origin`, a POST reaches the function's own body (it
// answers `not_signed_in`), and the deployed `payload_sha256` equals
// `node tools/pack-edge.mjs hr-accrue --hash`.
//
// **NOBODY MAY REASON "the switch is inert because CORS fails."** It is not
// inert; it is SWITCHED OFF. Exactly two things gate this module today:
//
//   1. THE KILL SWITCH (`ACCRUE_KILL_KEY`), which defaults OFF. This is the
//      whole of the safety argument, and it is one localStorage write away
//      from not being one.
//   2. Until `2026-08-14-character-bootstrap.sql` is APPLIED, the production
//      `hr_create_character` returns no `created` flag, so character.js
//      classifies it `malformed`/`no_created_flag` and every accrual that
//      follows answers `no_character`. That is a second, temporary gate that
//      DISAPPEARS the moment the migration lands — it is not a safety property
//      and must not be treated as one.
//
// A stale safety argument is worse than no safety argument: it is believed —
// and unlike a stale assertion, no test can catch a stale sentence. What IS
// asserted, because it is behaviour: the switch defaults off (b337 test 1), and
// a pre-b338 server is refused rather than latched (B339-6).
// `tests/cors-preflight.mjs` C4 remains the live gate for the transport.
//
// ── WHY A KILL SWITCH, AND WHY IT DEFAULTS OFF (b319 precedent) ─────────────
// Same shape as sync.js's event-log switch: a localStorage key plus a config
// override, readable and writable at runtime, so this ships DARK and is turned
// on for one tester without a client redeploy. Unlike b319's it defaults OFF,
// because b319 was containing a live incident and this is arming a new authority.
//
// DOM-free except for one honesty sheet at the bottom, which is guarded on
// `typeof document` and is the ONLY thing in this file that touches the page.
// ============================================================================

/* ── The kill switch ────────────────────────────────────────────────────────
   'on' enables. Anything else — including absent — is OFF. Stated positively on
   purpose: b319's key is `'off' disables`, which is right for a switch that
   defaults on and wrong for one that defaults off, because a typo'd value would
   then ENABLE a new authority. */
export const ACCRUE_KILL_KEY = 'hr:serverAccrual';

let config = null;          // {url, apiKey, authToken, slot}
let override = null;        // in-memory switch state; null = consult storage

export function isServerAccrualEnabled() {
  if (override !== null) return override;
  try { return localStorage.getItem(ACCRUE_KILL_KEY) === 'on'; } catch (e) { return false; }
}

/* ── THE WATERMARKS, AND WHY FLIPPING THE SWITCH MUST MOVE THEM (b339) ──────
   The server path deliberately never advances `G.offlineBudget.at` or
   `G.restedAt`. That is correct while the switch is ON — the server owns the
   accrued_to watermark, and having the client advance a watermark it does not
   own is how a real absence gets confiscated.

   But it makes the switch NOT SAFELY REVERSIBLE, which is the property it was
   sold on. Flip ON at t1, play for an hour, flip OFF at t2: the local watermark
   is still whatever it was before t1, so the first processOffline() after t2
   measures the whole span [t1, t2] — a span the SERVER has already been paying
   for — and pays it AGAIN, locally, capped only by offlineCapHours. A kill
   switch whose "off" position mints progress is not a kill switch.

   So both watermarks are stamped to now on every flip, IN BOTH DIRECTIONS.
   Symmetry is the point: ON hands the span to the server (nothing local may
   later claim it), OFF hands it back (nothing local may claim what the server
   already paid). One side alone leaves the other direction minting.

   THE COST, STATED: an UNCLAIMED local absence at the instant of a flip is
   confiscated. That is real, it is the safe direction, and the flip is a
   console/devtools action taken by a tester — not something a player does
   mid-session. Minting is unrecoverable; a confiscated test absence is not. */
export function stampAwayWatermarks(G, now) {
  if (!G || typeof G !== 'object') return null;
  const t = Number.isFinite(Number(now)) ? Number(now) : nowMs();
  if (!G.offlineBudget || typeof G.offlineBudget !== 'object') G.offlineBudget = {};
  G.offlineBudget.at = t;
  G.restedAt = t;
  return { offlineBudgetAt: t, restedAt: t };
}

/** Flip the switch. Persists, so a reload keeps the tester's choice. */
export function setServerAccrualEnabled(on) {
  const was = isServerAccrualEnabled();
  override = !!on;
  try {
    if (on) localStorage.setItem(ACCRUE_KILL_KEY, 'on');
    else localStorage.removeItem(ACCRUE_KILL_KEY);
  } catch (e) {}
  const now = isServerAccrualEnabled();
  /* Only on an actual CHANGE. Re-asserting the current position (the suite does
     this constantly, and so does a reload) must not keep pushing the watermark
     forward, or a page that calls this on every boot would quietly become a
     permanent "you were never away". */
  if (now !== was) {
    try { stampAwayWatermarks(typeof window !== 'undefined' ? window.G : null, nowMs()); } catch (e) {}
  }
  return now;
}

/** Test seam: forget the in-memory override and go back to reading storage. */
export function __clearAccrualOverride() { override = null; }

/* ── WHICH CHARACTER ARE WE TALKING ABOUT? (b339) ───────────────────────────
   `slot: 0`, hard-coded in auth.js, was wired at sign-in and never revisited —
   while `src/multi-character.js` gives every account up to 5 characters with a
   SELECTED one. So a player on slot 2 ensured and accrued against slot 0: the
   wrong character's away time, and (through applyEnvelope, which replaces G
   wholesale) slot 0's server state landing in slot 2's local save.

   Resolved AT CALL TIME, never captured — the same rule the auth token follows
   and for the same reason. The slot changes while the module stays configured
   (`switchSlot` rewrites the profile and reloads), and a value captured at
   sign-in is a value that is wrong by the time it is used.

   multi-character.js OWNS the answer and publishes it (`HearthriseProfile
   .activeSlot()`); this file does not parse the profile record or name its
   storage key, because a second reader of that record is a second thing to
   drift. If the profile module has not loaded, the fallback is 0 — which is
   exactly, and only, today's behaviour. */
export const MAX_SLOT = 5;

/* STRICT — no string coercion. The slot ends up in a request body the server
   re-validates, and a client that can send '2' is a client that can send
   something else; failing to the fallback is both safer and easier to see. */
export function clampSlot(v, fallback) {
  if (Number.isInteger(v) && v >= 0 && v <= MAX_SLOT) return v;
  if (Number.isInteger(fallback) && fallback >= 0 && fallback <= MAX_SLOT) return fallback;
  return 0;
}

export function resolveActiveSlot(pinned) {
  /* An explicitly pinned integer wins — that is the seam the suite drives, and
     the one a future "accrue for a specific slot" caller would use. */
  if (Number.isInteger(pinned)) return clampSlot(pinned, 0);
  try {
    const P = (typeof window !== 'undefined') && window.HearthriseProfile;
    if (P && typeof P.activeSlot === 'function') return clampSlot(P.activeSlot(), 0);
  } catch (e) {}
  return 0;
}

/**
 * Wire the endpoint. Called from auth.js's enableLiveSync() with the same
 * credentials sync.js gets, so there is ONE source of the url/key/token and no
 * second copy to drift.
 *
 * `slot` is OPTIONAL and means "pin to this slot". Absent — which is what
 * auth.js passes — the active slot is resolved live on every call.
 */
export function configureAccrual(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getAccrualConfig();
}

export function getAccrualConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: accrueEndpoint(config.url) };
}

/** The URL, derived once from the project URL. Never hand-copied. */
export function accrueEndpoint(base) {
  return String(base || '').replace(/\/+$/, '') + '/functions/v1/hr-accrue';
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

/* ── THE REQUEST, AS DATA ───────────────────────────────────────────────────
   PURE, and exported, so a test can assert the LITERAL bytes that go on the
   wire — method, headers, body — rather than asserting that some code exists
   which might build them. Twelve times this codebase has shipped an assertion
   that asserted nothing; a network test that cannot observe a request is the
   thirteenth waiting to happen. */
export function buildAccrueRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  /* The body is CONSTRUCTED, never a filtered copy of anything — the mirror of
     request.js's null-prototype rule on the server side. One integer. */
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= 5 ? o.slot : 0;
  return {
    url: accrueEndpoint(o.url),
    init: { method: 'POST', headers, body: JSON.stringify({ slot }) },
  };
}

/* ── THE ANSWER, AS A VERDICT ───────────────────────────────────────────────
   PURE. One outcome carries a grant — 'accrued' — and it is the only one this
   whole module can produce that changes a game value. Everything else changes
   nothing, by construction rather than by discipline. */
export const ACCRUE_OUTCOMES = [
  'accrued',        // the server paid, and the envelope is the new truth
  'nothing',        // the server answered, and there was nothing to pay
  'no-character',   // 409 — there is no character in this slot on the server
  'rate-limited',   // 429
  'not-signed-in',  // 401 — b331's business, not ours
  'unavailable',    // 500/503 — the engine is up but cannot answer
  'rejected',       // 409 with an hr_apply code — an incident, recorded server-side
  'malformed',      // a 200 we cannot trust: no envelope, no away receipt
  'unreachable',    // the request never got an answer (CORS, DNS, offline)
  'unconfigured',   // no endpoint / no token on this device
];

/** Does this envelope carry enough to BE the truth? Fail closed. */
export function isEnvelopeApplicable(res) {
  if (!res || res.ok !== true || res.accrued !== true) return false;
  if (!res.state || typeof res.state !== 'object') return false;
  if (!res.skills || typeof res.skills !== 'object') return false;
  if (!res.inventory || typeof res.inventory !== 'object') return false;
  if (!res.away || typeof res.away !== 'object') return false;
  if (!Number.isFinite(Number(res.version))) return false;
  return true;
}

export function classifyAccrueResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 200) {
    if (!b || b.ok !== true) return { outcome: 'malformed', body: b };
    if (b.accrued === true) {
      return isEnvelopeApplicable(b)
        ? { outcome: 'accrued', body: b }
        : { outcome: 'malformed', body: b, reason: 'envelope_incomplete' };
    }
    /* accrued:false is the server saying "nothing to pay" — including the
       `replayed` and `clamped` receipts, both of which deliberately carry NO
       away block because this invocation's delta was not applied. */
    return { outcome: 'nothing', body: b, reason: b.reason || 'none' };
  }
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 429) return { outcome: 'rate-limited', body: b };
  if (status === 409) {
    const err = b && b.error;
    return err === 'no_character'
      ? { outcome: 'no-character', body: b }
      : { outcome: 'rejected', body: b, reason: err || 'apply_failed' };
  }
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: (b && b.error) || 'server_error' };
  return { outcome: 'malformed', body: b, reason: 'http_' + status };
}

/* ── THE BREAKER (b331's posture, applied to a second endpoint) ─────────────
   sync.js's b331 block is the reference: never an unbounded loop against an
   endpoint that cannot answer, back off, and then TERMINATE into a state the
   player is told about exactly once. The difference in kind is that b331's
   terminal state stops WRITES; this one stops nothing, because nothing was ever
   being granted — it exists to stop the pretending. */
export const ACCRUE_BACKOFF_BASE_MS = 5000;
export const ACCRUE_BACKOFF_MAX_MS = 300000;
export const ACCRUE_HALT_AFTER_TRIES = 3;

/** Outcomes that mean "the server did not tell us what we earned". Pure. */
export function isAccrualFailure(outcome) {
  return outcome !== 'accrued' && outcome !== 'nothing';
}

export function newAccrualGate() {
  return { streak: 0, firstAt: 0, blockedUntil: 0, halted: false, lastOutcome: null, lastAt: 0, lastReason: null };
}

export function nextAccrualBackoffMs(streak) {
  const s = Math.max(1, Math.floor(Number(streak) || 1));
  return Math.min(ACCRUE_BACKOFF_MAX_MS, ACCRUE_BACKOFF_BASE_MS * Math.pow(2, Math.min(s, 20) - 1));
}

/** May we put an accrual request on the wire right now? Pure. */
export function decideAccrualGate(st, now) {
  if (!st) return { allow: true, reason: 'no-state' };
  if (st.blockedUntil > now) return { allow: false, reason: 'backoff' };
  return { allow: true, reason: 'ok' };
}

/**
 * The reducer. A success resets everything INCLUDING the halt — a server that
 * came back is a server that came back, and leaving the sheet's latch set would
 * mean a recovered player is told they are broken forever.
 *
 * 'rate-limited' backs off but does NOT count toward the halt: the server
 * working correctly and telling us to slow down is not an outage, and treating
 * it as one would put a scary sheet in front of a player whose only sin was
 * reloading four times.
 */
export function accrualGateStep(st, outcome, now, reason) {
  const s = st || newAccrualGate();
  if (!isAccrualFailure(outcome)) {
    return { ...newAccrualGate(), lastOutcome: outcome, lastAt: now, lastReason: reason || null };
  }
  const counts = outcome !== 'rate-limited';
  const streak = (s.streak || 0) + (counts ? 1 : 0);
  const firstAt = s.firstAt || now;
  const halted = !!s.halted || (counts && streak >= ACCRUE_HALT_AFTER_TRIES);
  return {
    streak, firstAt, halted,
    blockedUntil: now + nextAccrualBackoffMs((s.streak || 0) + 1),
    lastOutcome: outcome, lastAt: now, lastReason: reason || null,
  };
}

let gate = newAccrualGate();
let inFlight = null;
let haltAnnounced = false;

export function getAccrualState() {
  const now = nowMs();
  return {
    enabled: isServerAccrualEnabled(),
    configured: !!config,
    pending: !!inFlight,
    ...gate,
    ...decideAccrualGate(gate, now),
  };
}

export function resetAccrualGate(seed) {
  gate = seed ? { ...newAccrualGate(), ...seed } : newAccrualGate();
  haltAnnounced = false;
  return gate;
}

/* NO FETCH SEAM ON PURPOSE. The b331 battery swaps `window.fetch` itself and
   asserts on what actually went out; a private injection point would be one
   more thing that can be correct while the real call site is not. `fetch` is
   resolved at call time, so a test's override is the transport. */
function nowMs() { return Date.now(); }

/* Hooks the game layer wires. Kept as config rather than imports so this module
   stays DOM-free and Node-importable. */
let hooks = { onApplied: null, onOutcome: null, onHalt: null };
export function setAccrualHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
function fire(name, arg) {
  const fn = hooks && hooks[name];
  if (typeof fn !== 'function') return;
  try { fn(arg); } catch (e) { console.warn('[accrue] hook ' + name + ' threw:', e && e.message); }
}

/**
 * ASK THE SERVER. Returns a verdict; NEVER a number this device computed.
 *
 * One request in flight at a time — two concurrent accruals would both be
 * answered correctly by the server's derived idempotency key, but they would
 * cost two rate-gate spends for one absence and the second would come back
 * `replayed`, which reads as "nothing to pay" and would confuse the receipt.
 */
export async function requestAccrual(opts) {
  const o = opts || {};
  if (inFlight) return inFlight;
  const now = nowMs();

  if (!config) return settle({ outcome: 'unconfigured', reason: 'no_endpoint' }, now);
  const token = tokenOf();
  if (!token) return settle({ outcome: 'unconfigured', reason: 'no_token' }, now);
  if (!o.force && !decideAccrualGate(gate, now).allow) {
    return { outcome: gate.lastOutcome || 'unreachable', throttled: true, applied: false };
  }

  const slot = resolveActiveSlot(Number.isInteger(o.slot) ? o.slot : config.slot);
  const { url, init } = buildAccrueRequest({ url: config.url, apiKey: config.apiKey, token, slot });

  inFlight = (async () => {
    let res = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      /* A CORS preflight failure, a DNS failure and a dead network are
         indistinguishable here BY DESIGN of the fetch spec. All three mean the
         same thing to us: we were not told what the player earned. */
      return settle({ outcome: 'unreachable', reason: String((e && e.message) || e) }, nowMs());
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return settle({ ...classifyAccrueResponse(res.status, body), status: res.status }, nowMs());
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

/** The ONE place an outcome becomes state. Everything funnels here. */
function settle(verdict, now) {
  const wasHalted = gate.halted;
  gate = accrualGateStep(gate, verdict.outcome, now, verdict.reason);
  let applied = false;
  if (verdict.outcome === 'accrued') {
    fire('onApplied', verdict.body);
    applied = true;
  }
  fire('onOutcome', { outcome: verdict.outcome, reason: verdict.reason || null, status: verdict.status || 0 });
  if (gate.halted && !wasHalted && !haltAnnounced) {
    haltAnnounced = true;
    console.warn('[accrue] the server has not answered ' + gate.streak
      + ' times (' + verdict.outcome + ') — away time is NOT being credited, and this device will not guess.');
    fire('onHalt', { outcome: verdict.outcome, reason: verdict.reason || null, streak: gate.streak });
    showAccrualHaltedSheet(verdict.outcome);
  }
  if (!gate.halted) haltAnnounced = false;
  return { ...verdict, applied };
}

/* ── APPLYING THE SERVER'S ANSWER ───────────────────────────────────────────
   The envelope IS the truth. This is a whole-value replacement, not a merge:
   merging would mean the client's copy of a number survives contact with the
   server's, which is the exact property server authority removes. It runs ONLY
   on `accrued:true` with a complete envelope (isEnvelopeApplicable), so a
   half-parsed 200 can never blank a save.

   Pure in the sense that matters: it takes the target object explicitly and
   returns what it wrote, so the suite can drive it without a live G. */
/* ── THE REPLACEMENT IS DESTRUCTIVE, AND IT MUST BE SAID OUT LOUD (b339) ────
   `applyEnvelope` rebuilds `G.skills` and `G.inventory` from the envelope
   ALONE. `saveLocal()` then stamps `lastSeen`, and "newest wins" makes that the
   authoritative save — cloud included. The server character is DELIBERATELY
   fresh (`hr_create_character` never reads `game_saves.snapshot`; see the
   migration header for why importing a client-authored blob would launder the
   exploit the whole program exists to close). So the first successful accrual
   on a device holding real beta progress REPLACES IT WITH A STARTING KIT,
   permanently.

   THAT IS THE DESIGNED BEHAVIOUR AND IT IS NOT CHANGED HERE. A merge would put
   the client's numbers back in charge, which is the one thing server authority
   removes. The beta is being wiped at cutover, so the loss is already sunk.

   What is NOT acceptable is that it happens SILENTLY. So the first replacement
   that would actually destroy something asks, once, in words that name the
   consequence. Everything after the acknowledgement is silent, because by then
   the player has been told.

   Reachability, stated honestly: today this cannot fire, because accrual.js
   refuses any `activeKind !== 'combat'` and a fresh character is idle. That is
   an argument for building the confirmation NOW, while it costs nothing, not
   for leaving it out. */
export const ACCRUE_REPLACE_ACK_KEY = 'hr:serverAccrual:replaceAck';
export const ACCRUE_REPLACE_SHEET_ID = 'hr-accrual-replace-gate';

export function isReplacementAcknowledged() {
  try { return localStorage.getItem(ACCRUE_REPLACE_ACK_KEY) === 'yes'; } catch (e) { return false; }
}

export function acknowledgeReplacement(on) {
  try {
    if (on === false) localStorage.removeItem(ACCRUE_REPLACE_ACK_KEY);
    else localStorage.setItem(ACCRUE_REPLACE_ACK_KEY, 'yes');
  } catch (e) {}
  return isReplacementAcknowledged();
}

/**
 * WHAT WOULD BE LOST. Pure, and it measures the ENVELOPE against the LOCAL save
 * rather than asking "does this save look big" — the question is not whether
 * the player has progress, it is whether this specific write would take any of
 * it away. A brand-new device (nothing local) is therefore not destructive and
 * never sees a sheet.
 */
export function describeReplacement(G, res) {
  const empty = { destructive: false, gold: 0, skillXp: 0, items: 0, skills: [] };
  if (!G || typeof G !== 'object' || !res || typeof res !== 'object') return empty;
  const st = res.state || {};
  const srvGold = Number(st.gold);
  const gold = Number.isFinite(srvGold) ? Math.max(0, (Number(G.gold) || 0) - srvGold) : 0;

  let skillXp = 0;
  const skills = [];
  const srvSkills = (res.skills && typeof res.skills === 'object') ? res.skills : {};
  const locSkills = (G.skills && typeof G.skills === 'object') ? G.skills : {};
  for (const k of Object.keys(locSkills)) {
    const have = Number(locSkills[k]) || 0;
    const get = Number(srvSkills[k] && srvSkills[k].xp) || 0;
    if (have > get) { skillXp += have - get; skills.push(k); }
  }

  let items = 0;
  const srvInv = (res.inventory && typeof res.inventory === 'object') ? res.inventory : {};
  const locInv = (G.inventory && typeof G.inventory === 'object') ? G.inventory : {};
  for (const k of Object.keys(locInv)) {
    const have = Number(locInv[k]) || 0;
    const get = Number(srvInv[k]) || 0;
    if (have > get) items += have - get;
  }

  return { destructive: gold > 0 || skillXp > 0 || items > 0, gold, skillXp, items, skills };
}

export function applyEnvelope(G, res) {
  if (!G || !isEnvelopeApplicable(res)) return null;
  /* THE ONE GATE. Refusing here writes nothing at all — the server has already
     recorded the grant against its own watermark, so the next accrual returns
     the same truth and nothing is lost by waiting for an answer. */
  const loss = describeReplacement(G, res);
  if (loss.destructive && !isReplacementAcknowledged()) {
    console.warn('[accrue] REFUSING to overwrite local progress with the server character '
      + 'until the player confirms — would lose ' + loss.gold + ' gold, ' + loss.skillXp
      + ' skill XP and ' + loss.items + ' item(s). This is permanent and there is no merge.');
    showReplacementSheet(loss, G, res);
    return null;
  }
  const st = res.state || {};
  const written = { skills: {}, inventory: 0 };

  if (Number.isFinite(Number(st.gold))) { G.gold = Number(st.gold); written.gold = G.gold; }
  if (Number.isFinite(Number(st.hp))) { G.playerHp = Number(st.hp); written.hp = G.playerHp; }
  if (Number.isFinite(Number(st.max_hp))) { G.playerMaxHp = Number(st.max_hp); written.maxHp = G.playerMaxHp; }

  /* skills: {<id>:{xp,level}} on the wire, {<id>: xp} in G. The LEVEL is
     derived from xp everywhere in this client, so taking the server's xp and
     letting the existing derivation run keeps one source of that rule. */
  const skills = {};
  for (const k of Object.keys(res.skills)) {
    const xp = Number(res.skills[k] && res.skills[k].xp);
    if (Number.isFinite(xp)) { skills[k] = xp; written.skills[k] = xp; }
  }
  G.skills = skills;

  const inv = {};
  for (const k of Object.keys(res.inventory)) {
    const q = Number(res.inventory[k]);
    if (Number.isFinite(q) && q > 0) inv[k] = q;
  }
  G.inventory = inv;
  written.inventory = Object.keys(inv).length;

  /* The receipt. Shaped to the SAME contract legacy.js's local summary uses, so
     every welcome-back renderer keeps working unchanged — and every field is a
     value the SERVER stated, never one this file inferred. `serverAuthoritative`
     is the flag that lets a renderer (or a bug report) tell the two apart. */
  G.lastOfflineSummary = summaryFromAway(res.away, res);
  written.summary = true;

  /* The server owns `accrued_to`. Parking it here is what makes it visible to
     the countdown UI and to a bug report; nothing reads it as authority. */
  G._serverAccrual = {
    version: Number(res.version),
    accruedTo: st.accrued_to || null,
    serverNow: res.now || null,
    at: nowMs(),
  };
  return written;
}

/** The away receipt, translated into the shape lastOfflineSummary renderers read. */
export function summaryFromAway(away, res) {
  const a = away || {};
  const ms = Number(a.grantMs) || 0;
  const items = a.items && typeof a.items === 'object'
    ? Object.keys(a.items).reduce((s, k) => s + (Number(a.items[k]) || 0), 0) : 0;
  const xp = a.xp && typeof a.xp === 'object'
    ? Object.keys(a.xp).reduce((s, k) => s + (Number(a.xp[k]) || 0), 0) : (Number(a.xp) || 0);
  return {
    hrs: +(ms / 3600000).toFixed(1),
    awayMs: ms,
    gainedItems: items,
    gainedXp: xp,
    gainedGold: Number(a.gold) || 0,
    gainedKills: Number(a.kills) || 0,
    burnt: 0,
    combat: a.kills ? { kills: Number(a.kills) || 0, crits: Number(a.crits) || 0, died: !!a.died } : null,
    capped: !!a.capped,
    blessed: !!a.blessed,
    buffsPaused: !!a.buffsPaused,
    crits: Number(a.crits) || 0,
    featuredMs: Number(a.featuredMs) || 0,
    featuredDropMult: Number(a.featuredDropMult) || 1,
    levelUps: Array.isArray(a.levelUps) ? a.levelUps : [],
    at: nowMs(),
    /* THE HONEST LABEL. A renderer, a screenshot and a bug report can all tell
       a server-stated receipt from a locally-computed one. */
    serverAuthoritative: true,
    version: Number(res && res.version) || null,
  };
}

/* ── THE HONESTY SHEET (b331's posture, not a rival modal) ──────────────────
   b331 owns "your session is broken"; b302 owns "you were signed out here".
   This owns a third, genuinely different sentence — "we could not find out what
   you earned" — and it defers to both of the others rather than drawing over
   them, exactly as b333's escalation defers to b302.

   It is DISMISSIBLE. The game is running and nothing is at risk; blocking play
   over an accrual that did not resolve would be a worse bug than the one it
   reports. And it never claims anything was credited. */
export const ACCRUE_SHEET_ID = 'hr-accrual-halted-gate';

const HALT_COPY = {
  'no-character': 'This character has no record on the progress server yet, so there is nothing for it to credit.',
  'not-signed-in': 'Your sign-in is not being accepted, so the server will not say what you earned.',
  'unreachable': 'The progress server could not be reached from this device.',
  'unavailable': 'The progress server is up but could not answer.',
  'rejected': 'The progress server refused the result and recorded it for review.',
  'malformed': 'The progress server sent an answer this build could not read.',
  'unconfigured': 'This device is not wired to the progress server.',
};

export function showAccrualHaltedSheet(outcome) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (document.getElementById('hr-evicted-gate')) return null;        // b302 wins
  if (document.getElementById('hr-auth-expired-gate')) return null;   // b331 wins
  const existing = document.getElementById(ACCRUE_SHEET_ID);
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = ACCRUE_SHEET_ID;
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:18px',
    'z-index:2147483645', 'max-width:440px', 'width:calc(100% - 24px)',
    'background:rgba(9,12,17,.96)', 'color:#f2e9d8', 'border:1px solid #d9a441',
    'border-radius:12px', 'padding:16px 18px', 'box-sizing:border-box',
    'font:400 14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,.5)',
  ].join(';');
  const why = HALT_COPY[outcome] || HALT_COPY.unreachable;
  el.innerHTML =
    '<div style="font:700 16px/1.3 system-ui,sans-serif;margin-bottom:6px">⏳ Away progress is paused</div>'
    + '<p style="margin:0 0 6px">' + why + ' <strong>Nothing has been credited for your time away</strong>, '
    + 'and this device will not guess at the numbers.</p>'
    + '<p style="margin:0 0 12px;opacity:.75">Your saved progress is untouched. Away time is credited by the '
    + 'server, so it will be there once it answers.</p>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="hr-accrue-retry" style="flex:1;font:600 15px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:8px;padding:11px 16px;cursor:pointer">Try again</button>'
    + '<button id="hr-accrue-later" style="font:500 14px/1 system-ui,sans-serif;background:transparent;color:#c9c2b4;border:1px solid #3a4154;border-radius:8px;padding:11px 14px;cursor:pointer">Not now</button>'
    + '</div>';
  document.body.appendChild(el);
  const retry = el.querySelector('#hr-accrue-retry');
  if (retry) retry.addEventListener('click', () => {
    retry.disabled = true; retry.textContent = 'Asking the server…';
    requestAccrual({ force: true }).then((r) => {
      if (r && r.outcome === 'accrued') { hideAccrualHaltedSheet(); return; }
      if (r && r.outcome === 'nothing') { hideAccrualHaltedSheet(); return; }
      retry.disabled = false; retry.textContent = 'Try again';
    });
  });
  const later = el.querySelector('#hr-accrue-later');
  if (later) later.addEventListener('click', () => hideAccrualHaltedSheet());
  return el;
}

/* ── THE REPLACEMENT SHEET (b339) ───────────────────────────────────────────
   Deliberately NOT dismissible-by-default the way the halted sheet is: the
   halted sheet reports a non-event ("nothing was credited"), this one asks for
   consent to an irreversible one. It still defers to b302/b331, because a
   player who has been evicted or signed out has a more urgent problem and two
   sheets arguing is worse than either.

   It states NUMBERS, not adjectives. "Your local progress will be replaced" is
   a sentence somebody clicks through; "1,240 gold, 3 skills and 27 items will
   be gone" is one they read. */
/* 5000000 is a number a player skims; 5,000,000 is one they read. Grouped with
   the page's locale, and never used for anything but display. */
function num(v) {
  const n = Math.round(Number(v) || 0);
  try { return n.toLocaleString(); } catch (e) { return String(n); }
}

export function showReplacementSheet(loss, G, res) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (document.getElementById('hr-evicted-gate')) return null;        // b302 wins
  if (document.getElementById('hr-auth-expired-gate')) return null;   // b331 wins
  const existing = document.getElementById(ACCRUE_REPLACE_SHEET_ID);
  if (existing) return existing;
  const l = loss || { gold: 0, skillXp: 0, items: 0 };
  const el = document.createElement('div');
  el.id = ACCRUE_REPLACE_SHEET_ID;
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'z-index:2147483646', 'max-width:460px', 'width:calc(100% - 24px)',
    'background:rgba(9,12,17,.98)', 'color:#f2e9d8', 'border:1px solid #d9a441',
    'border-radius:12px', 'padding:18px 20px', 'box-sizing:border-box',
    'font:400 14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 40px rgba(0,0,0,.65)',
  ].join(';');
  el.innerHTML =
    '<div style="font:700 16px/1.3 system-ui,sans-serif;margin-bottom:8px">⚠️ This will replace your local progress</div>'
    + '<p style="margin:0 0 8px">Away time is now credited by the progress server, and the server keeps '
    + 'its own copy of your character. Applying it <strong>replaces what is saved on this device</strong> — '
    + 'the two are not merged.</p>'
    + '<p style="margin:0 0 8px">Compared with the server\'s character, this device is currently ahead by '
    + '<strong>' + num(l.gold) + ' gold</strong>, <strong>' + num(l.skillXp)
    + ' skill XP</strong> and <strong>' + num(l.items) + ' item(s)</strong>. '
    + 'That difference will be <strong>permanently gone</strong>.</p>'
    + '<p style="margin:0 0 12px;opacity:.75">If this is not what you expected, choose “Keep my local save”. '
    + 'Nothing is credited until you decide, and you can ask again at any time.</p>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button id="hr-accrue-replace" style="flex:1;min-width:180px;font:600 15px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:8px;padding:11px 16px;cursor:pointer">Use the server’s character</button>'
    + '<button id="hr-accrue-keep" style="font:500 14px/1 system-ui,sans-serif;background:transparent;color:#c9c2b4;border:1px solid #3a4154;border-radius:8px;padding:11px 14px;cursor:pointer">Keep my local save</button>'
    + '</div>';
  document.body.appendChild(el);
  const go = el.querySelector('#hr-accrue-replace');
  if (go) go.addEventListener('click', () => {
    acknowledgeReplacement(true);
    hideReplacementSheet();
    /* Replay the SAME envelope the player just saw the numbers for — not a
       fresh request, whose answer could differ from what was consented to.
       Through the HOOK, so the save + repaint + receipt that legacy.js owns all
       happen exactly as they would have on the original apply. Only if nothing
       is wired does this apply the envelope itself. */
    try {
      if (typeof (hooks && hooks.onApplied) === 'function') fire('onApplied', res);
      else applyEnvelope(G, res);
    } catch (e) { console.warn('[accrue] replacement apply failed:', e && e.message); }
  });
  const keep = el.querySelector('#hr-accrue-keep');
  if (keep) keep.addEventListener('click', () => hideReplacementSheet());
  return el;
}

export function hideReplacementSheet() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(ACCRUE_REPLACE_SHEET_ID);
  if (el) el.remove();
}

export function hideAccrualHaltedSheet() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(ACCRUE_SHEET_ID);
  if (el) el.remove();
}

/* ── THE ENTRY POINT legacy.js CALLS ────────────────────────────────────────
   processOffline() returns immediately after calling this. It is async and its
   promise is deliberately NOT awaited by the caller: the game must not block a
   frame on a network round trip, and there is nothing for the caller to do with
   the answer that this module does not already do. */
export function beginServerAccrual(opts) {
  const p = requestAccrual(opts);
  p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseAccrual = {
    ACCRUE_KILL_KEY, ACCRUE_OUTCOMES, ACCRUE_SHEET_ID,
    ACCRUE_REPLACE_ACK_KEY, ACCRUE_REPLACE_SHEET_ID, MAX_SLOT,
    isServerAccrualEnabled, setServerAccrualEnabled, __clearAccrualOverride,
    stampAwayWatermarks, clampSlot, resolveActiveSlot,
    describeReplacement, isReplacementAcknowledged, acknowledgeReplacement,
    showReplacementSheet, hideReplacementSheet,
    configureAccrual, getAccrualConfig, accrueEndpoint,
    buildAccrueRequest, classifyAccrueResponse, isEnvelopeApplicable,
    isAccrualFailure, newAccrualGate, accrualGateStep, decideAccrualGate,
    nextAccrualBackoffMs, ACCRUE_HALT_AFTER_TRIES,
    requestAccrual, beginServerAccrual, applyEnvelope, summaryFromAway,
    getAccrualState, resetAccrualGate, setAccrualHooks,
    showAccrualHaltedSheet, hideAccrualHaltedSheet,
  };
}
