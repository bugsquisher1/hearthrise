// ============================================================================
// src/net/vigour.js — THE VIGOUR REFILL: ONE CATALOGUE READ AND ONE GOLD VERB.
//
// Server half: supabase/migrations/2026-09-22-vigour-daily.sql (the meter,
// `hr_vigour_of`, projected on every envelope as `res.vigour`) and
// 2026-09-22-vigour-refill.sql (the verb `hr_vigour_refill` and the price
// catalogue `hr_vigour_prices`, readable by signed-in clients). Design:
// docs/design/HUNTS_AND_ANALYZER.md §4.4.
//
// This file is the wire and nothing else. It prices nothing, counts nothing
// and never touches a balance: it READS the catalogue the server charges from,
// POSTS one intent, and hands the server's answer to the panel.
//
// ── THE SWITCH IS THE CATALOGUE (Security C-1, condition 5) ─────────────────
// The bar is drawn only when the server has priced rows. Today the catalogue
// ships EMPTY (or, before the refill migration applies, does not exist), so
// `G._vigourPrices.rows` is `[]` and src/render/hunt-panel.js draws NOTHING —
// no meter, no button. The reviewed INSERT of Tyler's prices is the only thing
// that turns it on; there is no client flag to flip.
//   · a read that cannot be made (network) leaves the last answer standing —
//     "not heard yet" is null, and null draws nothing either;
//   · a 404 / missing table / refused read answers `[]`, the same as empty;
//   · a refill answered `rpc_missing` or `refill_unpriced` re-closes the switch
//     in the same round trip, so a bar can never outlive the server's prices.
//
// ── GOLD ONLY, AND NOT FROM HERE ────────────────────────────────────────────
// The intent carries a slot and an idempotency key. No amount, no price, no
// currency: the verb reads `player_state.gold` under the character lock and
// the price from its own catalogue. Gems and Hearth Tokens cannot buy hunting
// time (design §4.4) and are not named anywhere on this path. Nothing local is
// debited, not even optimistically: the top bar repaints from a record read.
//
// `G._vigourPrices` and `G._vigourRefill` are `_`-prefixed SCRATCH (§6): never
// persisted, never in RESIDUE_FIELDS, re-read after a reload.
// ============================================================================
(function () {
  'use strict';

  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig
      && window.HearthriseSupabase.getConfig()) || null;
  }
  function session() {
    return (window.HearthriseAuth && window.HearthriseAuth.getSession
      && window.HearthriseAuth.getSession()) || null;
  }
  function isSignedIn() { var s = session(); return !!(s && s.user && cfg()); }
  function headers() {
    var c = cfg(), s = session();
    return {
      'apikey': c.anonKey,
      'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey),
      'Content-Type': 'application/json'
    };
  }

  /* The active character slot, clamped to [0,5]. Mirrors goal-claim.js; the
     server refuses a slot the caller does not own. */
  function activeSlot() {
    try {
      var P = window.HearthriseProfile;
      if (P && typeof P.activeSlot === 'function') {
        var s = P.activeSlot();
        if (typeof s === 'number' && s >= 0 && s <= 5) return s | 0;
      }
    } catch (e) {}
    return 0;
  }

  function newIdem() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function isMissingShape(json, status) {
    if (status === 404) return true;
    return !!(json && (json.code === 'PGRST202'
      || (typeof json.message === 'string' && /could not find the function/i.test(json.message))));
  }

  /* WHAT A REFUSAL CODE MEANS TO A PERSON. Every code the verb can answer gets
     one sentence; an unmapped code says plainly that nothing was spent. The
     two that carry numbers quote the SERVER's own fields and nothing else. */
  var SENTENCES = {
    missing_idem:     'That request was incomplete — nothing was spent.',
    refill_unpriced:  'Refills are not on sale yet — nothing was spent.',
    vigour_daily_cap: 'No more refills today. They come back when the day turns (UTC).',
    no_character:     'Your character is still loading — try again in a moment.',
    bad_slot:         'Something was wrong with that request — nothing was spent.',
    intent_mismatch:  'That went out twice — try again in a moment.',
    rate_limited:     'Slow down a moment, then try again.',
    not_signed_in:    'Sign in to buy a refill.',
    rpc_missing:      'Refills are not on sale yet — nothing was spent.',
    no_config:        'Not connected to the realm — nothing was spent.',
    network:          'No connection — your refill did not go through.',
    bad_response:     'The realm is busy — try that again in a moment.'
  };
  function refusalSentence(res) {
    var code = String((res && res.error) || '');
    if (code === 'insufficient_gold' && res && res.short_by != null) {
      return 'Not enough gold — you need ' + Number(res.short_by).toLocaleString('en-US') + ' more.';
    }
    if (code === 'vigour_ceiling' && res && res.would_deliver != null && res.minutes != null) {
      return 'Not sold: that refill would add only ' + res.would_deliver + ' of its '
        + res.minutes + ' minutes before today’s limit.';
    }
    return SENTENCES[code] || 'That refill did not go through — nothing was spent.';
  }

  function G() { return window.G || null; }
  function setPrices(rows) {
    var g = G();
    if (g) g._vigourPrices = { rows: rows, at: Date.now() };
  }

  /* A priced row, or nothing. A malformed row is dropped rather than drawn: a
     price read from garbage is a price a player would act on. */
  function cleanRows(json) {
    if (!Array.isArray(json)) return [];
    var out = [];
    for (var i = 0; i < json.length; i++) {
      var r = json[i];
      if (r && Number.isFinite(Number(r.nth)) && Number.isFinite(Number(r.cost_gold))
          && Number.isFinite(Number(r.minutes))) {
        out.push({ nth: Number(r.nth), cost_gold: Number(r.cost_gold), minutes: Number(r.minutes) });
      }
    }
    return out;
  }

  /* ── THE CATALOGUE READ ─────────────────────────────────────────────────
     Re-read at most every READ_TTL_MS, and only while signed in. It spends no
     rate bucket (a plain RLS table read), and prices only ever change by a
     reviewed INSERT/UPDATE, so ten minutes is generous. */
  var READ_TTL_MS = 600000;
  var _reading = null;
  function pricesStale() {
    var g = G(), p = g && g._vigourPrices;
    return !p || !(Date.now() - (p.at || 0) < READ_TTL_MS);
  }
  function readPrices() {
    if (_reading) return _reading;
    if (!isSignedIn()) return Promise.resolve(null);
    var c = cfg();
    _reading = Promise.resolve().then(function () {
      return fetch(c.url + '/rest/v1/hr_vigour_prices?select=nth,cost_gold,minutes&order=nth.asc',
        { method: 'GET', headers: headers() });
    }).then(function (res) {
      if (!res || !res.ok) { setPrices([]); return []; }
      return Promise.resolve(res.json()).then(function (json) {
        var rows = cleanRows(json);
        setPrices(rows);
        return rows;
      }, function () { setPrices([]); return []; });
    }, function () { return null; })
      .then(function (r) { _reading = null; return r; });
    return _reading;
  }

  /* ── THE REFILL ─────────────────────────────────────────────────────────
     ONE IN FLIGHT. A double tap is one gesture, not two purchases.
     ONE KEY PER GESTURE, KEPT ACROSS A LOST ANSWER. A `network` failure keeps
     the key, so the next tap is a RETRY of the same gesture and the server's
     cached success (if the first one landed) is replayed rather than charged
     again. Any answer the server actually gave retires the key. */
  var _pendingIdem = null;
  var _inflight = null;

  function adoptMeter(res) {
    var v = res && res.vigour;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    try {
      var A = window.HearthriseAccrual;
      if (A && typeof A.hydrateHunt === 'function') A.hydrateHunt(G(), { vigour: v });
    } catch (e) { /* a malformed body must not take the gesture down with it */ }
  }

  function refreshBalance() {
    try {
      var R = window.HearthriseRecord;
      if (R && typeof R.requestRecord === 'function') {
        var p = R.requestRecord(); if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* rendering, not authority */ }
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
  }

  function setRefill(next) {
    var g = G();
    if (g) g._vigourRefill = next;
    return next;
  }

  async function post(body) {
    var R = window.HearthriseRpc;
    if (R && typeof R.mayCall === 'function' && !R.mayCall('hr_vigour_refill', isSignedIn())) {
      return { ok: false, error: 'not_signed_in', refused: true };
    }
    var c = cfg();
    if (!c) return { ok: false, error: 'no_config' };
    try {
      var res = await fetch(c.url + '/rest/v1/rpc/hr_vigour_refill', {
        method: 'POST', headers: headers(), body: JSON.stringify(body)
      });
      var json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (isMissingShape(json, res.status)) return { ok: false, error: 'rpc_missing' };
      if (json && typeof json === 'object') return json;
      return { ok: false, error: 'bad_response', status: res.status };
    } catch (e) {
      return { ok: false, error: 'network' };
    }
  }

  /** Buy one refill. Resolves with the server's verdict, never rejects. */
  function refill() {
    if (_inflight) return _inflight;
    if (!_pendingIdem) _pendingIdem = newIdem();
    setRefill({ busy: true, ok: null, notice: null });
    _inflight = post({ p_slot: activeSlot(), p_idem: _pendingIdem }).then(function (res) {
      if (!res || res.error !== 'network') _pendingIdem = null;
      adoptMeter(res);
      if (res && res.ok === true) {
        refreshBalance();
        setRefill({ busy: false, ok: true, receipt: {
          minutes: res.minutes, cost: res.cost, gold: res.gold, nth: res.nth
        }, notice: null });
        return res;
      }
      /* THE SERVER SAYS THERE IS NOTHING TO SELL: close the switch now rather
         than on the next catalogue read. */
      if (res && (res.error === 'rpc_missing' || res.error === 'refill_unpriced')) setPrices([]);
      setRefill({ busy: false, ok: false, error: (res && res.error) || 'bad_response',
        notice: refusalSentence(res) });
      return res || { ok: false, error: 'bad_response' };
    }).then(function (r) { _inflight = null; return r; });
    return _inflight;
  }

  function __resetForTest() {
    _pendingIdem = null; _inflight = null; _reading = null;
    var g = G();
    if (g) { delete g._vigourPrices; delete g._vigourRefill; }
  }

  window.HearthriseVigour = {
    readPrices: readPrices,
    pricesStale: pricesStale,
    refill: refill,
    refusalSentence: refusalSentence,
    __resetForTest: __resetForTest
  };
})();
