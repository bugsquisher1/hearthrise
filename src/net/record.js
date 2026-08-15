// ============================================================================
// src/net/record.js — MOVING THE RECORD, NOT JUST THE COMPUTATION (b340).
//
// b337 moved a COMPUTATION to the server: on return from an absence the client
// asks `hr-accrue` what it earned instead of working it out. b338/b339 gave the
// server a character to compute against. Security's summary of all three was
// exact and unflattering: **that moved the computation, not the record.** The
// server's answer was written into `G`, `saveLocal()` stamped `lastSeen`, and
// the whole thing went up into `game_saves.snapshot` — a client-authored blob a
// player can edit in devtools. Server-computed, client-recorded, which is
// client-authored with extra steps.
//
// This file is the seam that moves a RECORD. It is deliberately a registry plus
// four small pure functions rather than a feature: the hard part of moving the
// record is not moving one field, it is making sure a moved field has exactly
// ONE source afterwards.
//
// ── THE FAILURE CLASS THIS EXISTS TO PREVENT ────────────────────────────────
// A value with two sources. This program has now shipped that bug twice and
// both times it was invisible until something downstream stopped adding up:
//   • the starting kit existed in `legacy.js`'s fresh-G literal AND in SQL, in
//     two languages in two files, and they disagreed (0 gold + no weapon
//     server-side against 500 gold + a Bronze Sword client-side);
//   • the FNV-1a hash existed in five copies and one of them multiplied in
//     floating point, which silently deleted content.
// A field that is "owned by the server" but still READ BACK OUT OF THE BLOB is
// the same bug wearing a security hat, and it is worse than not moving it at
// all — because everyone downstream now believes it is authoritative.
//
// So the rule this file enforces is mechanical, not cultural:
//
//   **A field on the SERVER_OF_RECORD registry is DELETED from every save blob
//   on the way IN, and is only ever written by applyRecord() from a server
//   envelope. There is no third writer and no fallback.**
//
// ── WHAT `game_saves.snapshot` BECOMES ──────────────────────────────────────
// A CACHE and an offline journal — which is what CLAUDE.md save-invariant #1
// already calls it — and NOT a record. Concretely, and this is the whole reason
// the transition is safe:
//
//   • `snapshot()` in src/net/events.js is UNCHANGED. It is a DENYLIST
//     (invariant #3) and nothing is added to `NO_SYNC`. A moved field keeps
//     riding to the cloud exactly as it did.
//   • b302 (single-active-session), the b305 stress battery and the b314
//     snapshot hold all key off that blob and all keep working, because the
//     blob still contains every field it used to and is still written on the
//     same schedule.
//   • What changes is the READ. A moved field is stripped on the way in, so the
//     blob's copy is never consulted for authority again. Writing it and not
//     reading it is exactly what "cache" means.
//
// That asymmetry is deliberate. Stopping the WRITE would mean adding a
// persistent-progress field to `NO_SYNC`, which CLAUDE.md forbids outright and
// which would make the blob's shape depend on a kill switch — so a save taken
// with the switch on would be missing fields when read with it off. Stopping
// the READ costs nothing and cannot lose data: the worst case is that a field
// is briefly UNKNOWN until the server answers, which is a state this module has
// and which is never silently replaced with a local number.
//
// ── THE READ PATH ───────────────────────────────────────────────────────────
// `hr_load(p_slot)` — `SECURITY DEFINER`, `authenticated`-only, returns the
// whole character in one round trip with its `version`. It is the read half of
// the same envelope `hr_state_of` builds for hr-accrue, so there is one shape,
// not two. See supabase/migrations/2026-08-11-apply-engine.sql §3.
//
//   REQUEST   POST <SUPABASE_URL>/rest/v1/rpc/hr_load
//             Authorization: Bearer <user JWT>   — auth.uid() IS the identity;
//                                                  there is no p_user, so no
//                                                  player can name another.
//             apikey: <anon key>
//             body {"p_slot": N}                 — one integer, re-clamped
//                                                  server-side.
//
//   RESPONSE  200 {ok:true, version, now, state:{…}, skills, inventory, …}
//             200 {ok:false, error:'no_character'}
//             200 {ok:false, error:'rate_limited'}      (180/min)
//             200 {ok:false, error:'not_signed_in'}
//             401/403 / 404 / 5xx
//
// ── WHEN THE SERVER DISAGREES WITH LOCAL ────────────────────────────────────
// It does not disagree. There is nothing to disagree WITH: by the time the
// envelope arrives the blob's copy has already been deleted, so the server is
// not overruling a local value, it is supplying the only one. That is the
// difference between "server authoritative" and "server wins the argument", and
// it is why the strip happens at LOAD rather than at APPLY. A reconciliation
// step is a place where a local number can survive; a deletion is not.
//
// The one ordering rule that IS needed: applyRecord() refuses an envelope whose
// `version` is older than the one already applied this session. hr_load and
// hr-accrue can be in flight at the same time, both answer truthfully, and
// without this the slower one could put back a watermark the faster one had
// already advanced.
//
// ── NO SILENT FALLBACK, SAME AS b337 ────────────────────────────────────────
// If the server cannot be reached, a moved field is UNKNOWN. `recordValue()`
// returns `{known:false}` and every consumer must handle that; nothing in this
// file substitutes a local value, a default, or a zero. `0` is the most
// dangerous possible fallback for a watermark — it means "you were last paid in
// 1970" — so it is not reachable: a field is written only when it decoded from
// a server envelope, and `known` says so.
//
// DOM-free. Node-importable. No fetch seam — `fetch` resolves at call time, so
// a test's override IS the transport (accrue.js's rule, same reason).
// ============================================================================

import { isServerAccrualEnabled, resolveActiveSlot } from './accrue.js?v=348';

/* THE SAME SWITCH AS b337/b338, DELIBERATELY. A separate switch would create a
   state where the record has moved but the computation has not, or the reverse
   — and "which half is on" is not a question anybody should have to ask during
   an incident. One switch, one authority. */
export function isRecordActive() { return isServerAccrualEnabled(); }

/* ── THE REGISTRY ───────────────────────────────────────────────────────────
   DATA, not code, so moving the second field is an entry and not a refactor —
   and so the set of moved fields is greppable in one place rather than being an
   emergent property of scattered `if` statements.

   ORDER OF MIGRATION, and the rule behind it: **the record follows the writer.**
   A field may move only after EVERY path that mutates it has moved, because a
   field with a server record and a live client writer is precisely the
   two-sources bug above — the server's copy goes stale, the strip throws away
   the fresh local value, and the player loses progress. That rule is what puts
   `offlineBudget` first and everything else later:

   | field                    | writer today                  | may move when |
   |--------------------------|-------------------------------|---------------|
   | offlineBudget (accrued_to)| SERVER already (b337 owns it — | NOW. This is  |
   |                          | processOffline returns before  | the only field|
   |                          | claimOfflineMs under the switch| whose writer  |
   |                          | and accrue.js deliberately     | has already   |
   |                          | never advances the watermark)  | moved.        |
   | gold                     | ~40 client sites               | after a gold  |
   |                          |                               | intent surface|
   | inventory qty            | addItem/removeItem everywhere  | after craft/  |
   |                          |                               | gather intents|
   | skills xp                | addXp                          | after the     |
   |                          |                               | activity      |
   |                          |                               | intents       |
   | hearth_token             | 1 mint (IAP) + 4 spends        | after a spend |
   |                          | (dungeons ×3, redeem)          | intent — it is|
   |                          |                               | the smallest  |
   |                          |                               | surface after |
   |                          |                               | this one      |

   `from` names a key inside the envelope's `state` object. `decode` turns the
   wire value into the client's representation and MUST return `null` for
   anything it is not certain about — that is what makes `known:false` reachable
   rather than theoretical.

   `fingerprint` is b347's addition and it is what makes the rule CHECKABLE at
   runtime rather than merely stated. See "THE ACCESSOR MUST NOT VOUCH FOR A
   NUMBER IT DID NOT SEE ARRIVE" below. Every entry must carry all four keys —
   REGISTRY_FIELDS is exported so the guard reads the contract instead of
   restating it, the same shape hr-accrue/intents.js uses for its verb registry
   (a hard-coded list cannot notice a column being ADDED). */
export const REGISTRY_FIELDS = Object.freeze(['field', 'from', 'decode', 'fingerprint']);

export const SERVER_OF_RECORD = Object.freeze([
  Object.freeze({
    field: 'offlineBudget',
    from: 'accrued_to',
    since: 'b340',
    /* `accrued_to` is the instant the server has already PAID UP TO. G's
       `offlineBudget.at` is the instant the client has already accounted for.
       They are the same fact, and CLAUDE.md save-invariant #5 exists entirely
       to defend the client's copy of it — with a cap, because a blob-edited
       watermark of 1970 is otherwise an unbounded mint. Moving the record
       replaces that defence with an absence: there is no local copy to edit. */
    decode: (v) => {
      if (v === null || typeof v === 'undefined') return null;
      const ms = typeof v === 'number' ? v : Date.parse(String(v));
      /* Save-invariant #2's rule, applied to a field instead of a save: act
         only on CERTAINTY. A NaN, a negative, or a zero epoch is not a
         watermark, and answering "1970" would grant a whole capped window. */
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return { at: ms };
    },
    /* NOT JSON.stringify. The watermark is one number inside a wrapper object,
       and the wrapper may legitimately grow a key (b226's `dayKey`/`usedMs` ride
       in the same object); fingerprinting the whole object would report a
       harmless neighbour as tampering. Fingerprint exactly the value the server
       supplied and nothing else. Never NaN and never empty, so `want === have`
       is a real comparison rather than two unknowns matching by accident. */
    fingerprint: (v) => {
      const at = v && typeof v === 'object' ? Number(v.at) : NaN;
      return Number.isFinite(at) ? 'at=' + at : 'absent';
    },
  }),
]);

export function serverOfRecordFields() { return SERVER_OF_RECORD.map((e) => e.field); }
export function isServerOfRecord(field) { return serverOfRecordFields().indexOf(field) !== -1; }
export function recordEntry(field) {
  for (const e of SERVER_OF_RECORD) if (e.field === field) return e;
  return null;
}

/* ── MAY THE CLIENT WRITE THIS FIELD? (b347) ────────────────────────────────
   THE RULE THE HEADER ALREADY STATED AND NOTHING ENFORCED. "There is no third
   writer and no fallback" was true of record.js and false of the game: two
   client sites went on writing `offlineBudget` after the strip had deleted it —
   `saveLocal()` advanced it to `lastSeen` on every autosave, and the cloud
   overlay re-stamped it to the snapshot's save time two lines after stripping
   it out of that same snapshot. Measured: the server said 06:00Z and the client
   reported 09:30Z.

   ⚠ THIS IS THE TEMPLATE, WHICH IS WHY A FOUR-LINE PREDICATE IS WORTH A BLOCK
     OF PROSE. Gold (~40 writers), inventory, skill xp and hearth tokens all
     follow this field, and the ordering rule in the table above — the record
     follows the writer — is exactly the rule this function makes askable. Every
     one of those migrations ends with the same sentence at its write sites:
     `if (!mayClientWrite('gold')) return;`

   EXEMPT, DELIBERATELY, AND THE ONLY EXEMPTION: accrue.js's
   `stampAwayWatermarks`, which runs from `setServerAccrualEnabled` at the exact
   instant authority CHANGES HANDS. Flipping ON hands the span to the server
   before any envelope has arrived (nothing is `known` yet, so nothing can be
   overwritten); flipping OFF hands it back, and refusing the write there would
   leave the client with no watermark at all and re-pay the whole span. A
   steady-state writer asks; the switch does not, because it is not a writer of
   the record — it is the thing that decides whose record it is. */
export function clientMayWrite(field) {
  if (!isServerOfRecord(field)) return true;   // not moved — the client still owns it
  return !isRecordActive();                    // moved AND armed — applyRecord is the only writer
}

/* ── THE STRIP ──────────────────────────────────────────────────────────────
   PURE, and it never mutates its argument: the caller may be holding the parsed
   cloud snapshot for logging, and a strip that reached back into it would make
   the log lie about what arrived.

   Called at BOTH blob→G seams, which is the whole of the coverage argument:
     • legacy.js loadLocal()          — the local blob AND the v1 migration path
     • auth.js pullAndMaybeRestore()  — the cloud overlay

   ⚠ A THIRD SEAM WOULD BE A HOLE, AND NOTHING GUARDS AGAINST ONE. This sentence
   originally read "B340-3 asserts there is no other `Object.assign(G, …)` of a
   parsed save". It does not, and no test does — which would have made it the
   eleventh entry in the assertion-that-asserts-nothing family, in a comment,
   where no test can catch it. What is actually true: `grep -rn
   'Object\.assign(\(window\.\)\?G,' src/` on 2026-08-14 returned exactly the
   three lines above (two in loadLocal, one in the overlay) and nothing else.
   That is a fact about one commit, not a guard. Re-run it before adding a
   field, and prefer converting it into a real check to trusting this note. */
export function stripServerOfRecord(blob) {
  if (!blob || typeof blob !== 'object') return { blob, stripped: [] };
  const fields = serverOfRecordFields();
  const stripped = [];
  const out = {};
  for (const k in blob) {
    if (!Object.prototype.hasOwnProperty.call(blob, k)) continue;
    if (fields.indexOf(k) !== -1) { stripped.push(k); continue; }
    out[k] = blob[k];
  }
  return { blob: out, stripped };
}

/** Delete the moved fields from a LIVE G. Separate from stripServerOfRecord
 *  because a blob is copied and G must not be — every module in the game holds
 *  the same `window.G` reference (the b127 rule). */
export function forgetServerOfRecord(G) {
  if (!G || typeof G !== 'object') return [];
  const forgotten = [];
  for (const f of serverOfRecordFields()) {
    if (Object.prototype.hasOwnProperty.call(G, f)) { delete G[f]; forgotten.push(f); }
  }
  /* FOUND BY B340-3, and it is the two-sources bug in miniature. `_record` is
     `_`-prefixed so it never syncs — but it survives a loadLocal() in memory,
     and a stale `known` list would report a field this function has just
     DELETED as authoritative. `recordValue` reads that list rather than the
     field's presence precisely so a leftover value cannot be reported as
     server-supplied; forgetting the value without forgetting the claim would
     have inverted that into reporting `undefined` as server-supplied. */
  if (G._record) G._record = { ...G._record, known: [], stamp: {}, forgottenAt: Date.now() };
  return forgotten;
}

/* ── DECODING AN ENVELOPE ───────────────────────────────────────────────────
   PURE. Fail-closed at every step: a field that is absent, malformed or
   undecodable is reported as MISSING, never defaulted. */
export function decodeRecord(res) {
  const out = { ok: false, version: null, fields: {}, missing: [], reason: null };
  if (!res || typeof res !== 'object' || res.ok !== true) { out.reason = 'not_ok'; return out; }
  const st = res.state;
  if (!st || typeof st !== 'object') { out.reason = 'no_state'; return out; }
  const version = Number(res.version);
  if (!Number.isFinite(version)) { out.reason = 'no_version'; return out; }
  out.version = version;
  for (const entry of SERVER_OF_RECORD) {
    const raw = Object.prototype.hasOwnProperty.call(st, entry.from) ? st[entry.from] : undefined;
    const decoded = entry.decode(raw);
    if (decoded === null) { out.missing.push(entry.field); continue; }
    out.fields[entry.field] = decoded;
  }
  out.ok = true;
  return out;
}

/* ── APPLYING IT — THE ONLY WRITER ──────────────────────────────────────────
   Every moved field in the game is written here and nowhere else. accrue.js's
   applyEnvelope does NOT write them (it writes gold/skills/inventory, none of
   which have moved), and legacy.js routes hr-accrue's envelope through this
   same function, so there is one writer for two callers rather than two
   implementations that agree today. */
export function applyRecord(G, res) {
  const dec = decodeRecord(res);
  if (!G || typeof G !== 'object' || !dec.ok) {
    return { written: [], skipped: 'undecodable', reason: dec.reason || 'no_g' };
  }
  /* MONOTONIC. hr_load and hr-accrue race by design (one is a read, the other
     pays), both answer truthfully, and the slower answer is the OLDER one. */
  const prev = G._record && Number(G._record.version);
  if (Number.isFinite(prev) && dec.version < prev) {
    return { written: [], skipped: 'stale', version: dec.version, have: prev };
  }
  const written = [];
  for (const f of Object.keys(dec.fields)) { G[f] = dec.fields[f]; written.push(f); }
  /* FOUND BY B340-6. An envelope that supplies NO record must change NOTHING —
     not even the provenance stamp. Stamping it is an assertion that an
     authoritative read happened, and doing that on an answer which carried no
     record is how "the server told us" ends up meaning "the server was asked".
     b337's failure battery holds the same property for grants; this is it for
     the record. The `missing` list still goes to the caller and the console,
     which is where a diagnostic belongs. */
  if (!written.length) {
    return { written: [], missing: dec.missing, skipped: 'no_record_fields', version: dec.version };
  }
  /* THE FINGERPRINT OF WHAT ARRIVED (b347). Taken here, from the decoded value,
     at the only moment this module can honestly claim to have seen the server's
     number. `recordValue` compares against it; without it the accessor reports
     whatever is in G under the server's name, which is how a client write comes
     back labelled `source:'server'`. */
  const stamp = {};
  for (const f of written) {
    const e = recordEntry(f);
    stamp[f] = e && typeof e.fingerprint === 'function' ? e.fingerprint(G[f]) : null;
  }
  G._record = {
    version: dec.version,
    at: Date.now(),
    serverNow: res.now || null,
    known: written.slice(),
    missing: dec.missing.slice(),
    stamp,
  };
  return { written, missing: dec.missing, version: dec.version };
}

/* ── THE ONLY READ ACCESSOR ─────────────────────────────────────────────────
   A consumer that reads `G.offlineBudget` directly gets whatever is there,
   which under the switch is `undefined` — safe, but it does not say WHY. This
   says why, and `known:false` is the answer a consumer has to handle. It reads
   `G._record.known` rather than the presence of the field, so a value left over
   from before a strip can never be reported as authoritative.

   ── THE ACCESSOR MUST NOT VOUCH FOR A NUMBER IT DID NOT SEE ARRIVE (b347) ──
   The `known` list is a claim about the PAST — "an envelope wrote this field
   during this session". It says nothing about the present, and the whole point
   of an accessor built to catch a second writer is that a second writer may
   have run since. Measured, with a control: the server said 06:00Z, a client
   write moved it to 09:30Z, and this function answered
   `{known:true, source:'server'}` — the forged number wearing the server's
   name, which is strictly worse than not having moved the record at all,
   because everyone downstream now believes it.

   So the claim is checked, not trusted. `_record.stamp` holds the fingerprint
   of what applyRecord actually wrote; a mismatch means SOMETHING ELSE wrote it
   and the honest answer is `known:false` — fail-closed, the same direction as
   every other refusal in this file, and a state every consumer already has to
   handle. `source` names the fault so a bug report can say which of the two
   possible bugs it is (a stale claim, or a live second writer).

   THE STALE-SESSION CASE FALLS OUT FOR FREE, and it was a real hole: `_record`
   is `_`-prefixed so it never reaches the cloud, but saveLocal() writes all of
   G, so a `_record` from a PREVIOUS session survives a reload while
   stripServerOfRecord deletes the field it claims. That combination reported
   `known:true, value:undefined`. It now reports `known:false`. */
export function recordValue(G, field) {
  if (!isServerOfRecord(field)) return { known: false, value: undefined, source: 'not-moved' };
  const rec = G && G._record;
  const claimed = !!(rec && Array.isArray(rec.known) && rec.known.indexOf(field) !== -1);
  if (!claimed) return { known: false, value: undefined, source: 'unknown' };
  const entry = recordEntry(field);
  const want = rec.stamp && Object.prototype.hasOwnProperty.call(rec.stamp, field)
    ? rec.stamp[field] : null;
  const have = entry && typeof entry.fingerprint === 'function' ? entry.fingerprint(G[field]) : null;
  if (want === null || want !== have) {
    return {
      known: false, value: G[field], source: 'client-overwrote',
      expected: want, found: have, version: rec.version,
    };
  }
  return { known: true, value: G[field], source: 'server', version: rec.version };
}

/* ── TRANSPORT ──────────────────────────────────────────────────────────────
   Same shape as accrue.js and character.js: config wired once from auth.js,
   accessors never captured, request built as pure data so a test asserts the
   literal bytes. */
let config = null;
let inFlight = null;
let last = null;

export function configureRecord(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  return getRecordConfig();
}

export function getRecordConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: recordEndpoint(config.url) };
}

export function recordEndpoint(base) {
  return String(base || '').replace(/\/+$/, '') + '/rest/v1/rpc/hr_load';
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

export function buildLoadRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  /* CONSTRUCTED, never a filtered copy and never a spread of a caller's object.
     One integer — the same rule accrue.js's buildAccrueRequest follows, for the
     same reason: a body assembled by spreading is a body a future field rides
     into. */
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= 5 ? o.slot : 0;
  return {
    url: recordEndpoint(o.url),
    init: { method: 'POST', headers, body: JSON.stringify({ p_slot: slot }) },
  };
}

export const RECORD_OUTCOMES = [
  'loaded',         // the envelope is the record
  'no-character',   // ok:false no_character — nothing to be the record of
  'rate-limited',   // ok:false rate_limited (180/min)
  'not-signed-in',  // ok:false not_signed_in, or HTTP 401/403
  'not-deployed',   // HTTP 404 — hr_load is not in this database
  'unavailable',    // HTTP 5xx
  'refused',        // ok:false with a code this build does not know
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'unconfigured',   // no endpoint / no token on this device
];

export function classifyLoadResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 404) return { outcome: 'not-deployed', body: b };
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: 'http_' + status };
  if (status !== 200) return { outcome: 'malformed', body: b, reason: 'http_' + status };
  if (!b) return { outcome: 'malformed', body: b, reason: 'no_body' };
  if (b.ok === true) {
    /* A 200 that says ok but carries no decodable record is NOT a load. This is
       the branch that keeps the increment independent of whether
       2026-08-11-apply-engine.sql has been applied: an older hr_load whose
       envelope lacks `accrued_to` lands here, the field stays UNKNOWN, and
       nothing local is substituted. */
    const dec = decodeRecord(b);
    if (!dec.ok) return { outcome: 'malformed', body: b, reason: dec.reason };
    if (!Object.keys(dec.fields).length) {
      return { outcome: 'malformed', body: b, reason: 'no_record_fields', missing: dec.missing };
    }
    return { outcome: 'loaded', body: b, version: dec.version, missing: dec.missing };
  }
  switch (b.error) {
    case 'no_character':  return { outcome: 'no-character', body: b };
    case 'rate_limited':  return { outcome: 'rate-limited', body: b };
    case 'not_signed_in': return { outcome: 'not-signed-in', body: b };
    default:              return { outcome: 'refused', body: b, reason: b.error || 'unknown' };
  }
}

export function getRecordState() {
  return { active: isRecordActive(), configured: !!config, pending: !!inFlight, last };
}

export function resetRecord() { inFlight = null; last = null; }

/**
 * ASK THE SERVER FOR THE RECORD. Returns a verdict; on `loaded` it has already
 * been applied, because there is nothing a caller could usefully do with an
 * envelope that this module would not do with it.
 *
 * Deliberately NO breaker and NO sheet: accrue.js already owns the "the server
 * is not answering" conversation with the player, and a second modal for one
 * outage is two sheets arguing. A failed load leaves the field UNKNOWN, which
 * is the honest state and is visible in getRecordState().
 */
export async function requestRecord(opts) {
  const o = opts || {};
  if (inFlight) return inFlight;
  if (!config) return (last = { outcome: 'unconfigured', reason: 'no_endpoint', applied: false });
  const token = tokenOf();
  if (!token) return (last = { outcome: 'unconfigured', reason: 'no_token', applied: false });

  const slot = resolveActiveSlot(Number.isInteger(o.slot) ? o.slot : config.slot);
  const { url, init } = buildLoadRequest({ url: config.url, apiKey: config.apiKey, token, slot });

  inFlight = (async () => {
    let res = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      return settle({ outcome: 'unreachable', reason: String((e && e.message) || e) });
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return settle({ ...classifyLoadResponse(res.status, body), status: res.status });
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

function settle(verdict) {
  let applied = null;
  if (verdict.outcome === 'loaded') {
    const G = (typeof window !== 'undefined') ? window.G : null;
    applied = applyRecord(G, verdict.body);
  } else {
    console.warn('[record] the server did not supply the record (' + verdict.outcome
      + (verdict.reason ? ': ' + verdict.reason : '') + ') — '
      + serverOfRecordFields().join(', ') + ' stay UNKNOWN, and this device will not guess.');
  }
  last = { outcome: verdict.outcome, reason: verdict.reason || null, at: Date.now(),
    applied: !!(applied && applied.written && applied.written.length) };
  return { ...verdict, applied };
}

/** The entry point legacy.js's b337 gate calls, after the character ensure.
 *  Fire-and-forget for the same reason accrue.js's is: the game must not block
 *  a frame on a round trip. */
export function beginRecordLoad(opts) {
  const p = requestRecord(opts);
  p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseRecord = {
    SERVER_OF_RECORD, RECORD_OUTCOMES, REGISTRY_FIELDS,
    isRecordActive, serverOfRecordFields, isServerOfRecord, recordEntry, clientMayWrite,
    stripServerOfRecord, forgetServerOfRecord,
    decodeRecord, applyRecord, recordValue,
    configureRecord, getRecordConfig, recordEndpoint,
    buildLoadRequest, classifyLoadResponse,
    requestRecord, beginRecordLoad, getRecordState, resetRecord,
  };
}
