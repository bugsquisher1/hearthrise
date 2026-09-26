// ============================================================================
// src/net/party.js — CLIENT TRANSPORT FOR M8 SLICE 1: PARTY MEMBERSHIP.
//
// The server half is applied: supabase/migrations/2026-09-23-m8-parties-s1-
// {1-tables,2-verbs,3-client-surface}.sql. Five SECURITY DEFINER verbs
// (hr_party_create / _invite / _accept / _leave / _kick), one frozen cross-user
// read (hr_party_view), and three tables that no client may write — every one
// of them has SELECT policies only, so a forged membership is refused by the
// ABSENCE of a policy rather than by a predicate.
//
// This file is the wire and nothing else. It holds no rule, computes no number,
// and never decides who is in a party: it posts an intent and re-reads what the
// realm answers. src/render/party-panel.js draws whatever it finds here.
//
// ── §6: THE BROWSER NEVER SAYS ONE THING WHILE THE SERVER SAYS ANOTHER ──────
// There is NO predicted membership anywhere in this module. A create, an accept
// or a leave does not write a member into `G._party` and hope; it fires the
// intent and then RE-READS, and the panel repaints from the re-read. The whole
// projection is REPLACED on every read — never merged upward — so a roster the
// server no longer agrees with cannot survive one refresh. A player who is
// kicked while their panel is open sees it on the next read, and there is no
// state in which the panel shows a member the server would refuse to act on.
//
// `G._party` is `_`-prefixed SCRATCH (CLAUDE.md §6): it is never persisted, and
// NOTHING is added to RESIDUE_FIELDS for it. A reload re-reads from the realm.
//
// ── THE READ CADENCE IS THE SECURITY REVIEW'S, NOT A CONVENIENCE ────────────
// docs/planning/SEC_PARTIES_M8_2026-09-23.md §5.3, findings B7 and B8:
//
//   B7  hr_party_view transitively writes (the rate bucket upserts), so it
//       must never run in a READ ONLY transaction. B7 assumed only GET did
//       that; live play proved PostgREST opens one for ANY STABLE function,
//       POST included (405 / 25006), so the function is now VOLATILE
//       (2026-09-26-party-view-volatile.sql; tests/readonly-rpc.mjs). This
//       module still POSTs everything through rpcPost(), the ONLY door, since
//       PostgREST refuses a VOLATILE function over GET.
//   B8  the read spends the SAME 12/min `party` bucket as the five write verbs.
//       A panel polling at the envelope's cadence would spend half a player's
//       own membership budget on looking at it. So the read happens exactly
//       three ways and no others:
//         · when the panel is opened,
//         · immediately after one of the PLAYER'S OWN party verbs,
//         · on a slow refresh, no faster than SLOW_REFRESH_MS, and only while
//           the panel is actually on screen.
//       `viewReads` and `lastViewAt` below are the measurement, and the suite's
//       negative arm reads them: two view reads inside sixty idle seconds is a
//       regression, not a tuning preference.
//
// ── WHY THE ROSTER IS AN RPC AND THE REST ARE TABLE READS ───────────────────
// `party_member`'s SELECT policy is `auth.uid() = user_id` — your OWN row, and
// the migration explains at length why it cannot be widened to co-members
// without recursing. So the client learns THREE different things three ways:
//   · WHICH party I am in        → party_member, my own row (a table read)
//   · how big it may get         → party, readable by its live members
//   · WHO ELSE IS IN IT          → hr_party_view, the one reviewed cross-user
//                                  read, whose column set is frozen
// The party row is selected as `id,size_cap` and deliberately NOT `leader_user`:
// a user id is an addressable handle to a player, the frozen view refuses to
// carry one, and a transport has no business smuggling one in through a table.
//
// Classic script, no ESM export, published on window — the render half and the
// in-page suite both reach it from the classic side. Same transport shape as
// src/net/goal-claim.js: cfg()/session()/headers(), the shared
// HearthriseRpc.mayCall() session guard, a uuid idempotency key per gesture and
// a ten-minute negative probe so a session open across a deploy self-heals.
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

  /* The active character slot, derived from the profile and clamped to [0,5].
     Mirrors goal-claim.js activeSlot(); the server re-derives everything else
     from auth.uid() and refuses a slot it does not own. */
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

  /* A client-generated idempotency key. A RETRY of the same gesture carries the
     same key so a replayed accept cannot join twice; a NEW gesture gets a fresh
     one. The server stores it in player_intents and answers the stored result
     with `replayed:true`. */
  function newIdem() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // One negative probe per RPC name; expires in ten minutes. A migration can
  // only ever ADD a function while a session is open, so "absent" is the answer
  // that can go stale and "present" is the one that cannot.
  var probe = {};
  function missing(n) { var p = probe[n]; return !!(p && p.known === false && (Date.now() - p.at) < 600000); }
  function note(n, present) { probe[n] = { known: present, at: Date.now() }; }
  function isMissingShape(json, status) {
    if (status === 404) return true;
    return !!(json && (json.code === 'PGRST202'
      || (typeof json.message === 'string' && /could not find the function/i.test(json.message))));
  }

  /* ══════════════════════════════════════════════════════════════════════
     WHAT A REFUSAL CODE MEANS TO A PERSON.

     Every string the server can answer with gets ONE short sentence, and the
     map is exhaustive on purpose: an unmapped code falls through to a plain
     "that did not work" rather than to silence, because a gesture that quietly
     does nothing is the worst of the three outcomes.

     `invite_target_unavailable` gets ONE sentence because the server gives one
     string — S-13 collapses no-such-name, already-partied, that-is-you, the
     receiver's five-live clamp and their twenty-a-day clamp into a single
     answer so the sender cannot use the invite box as a directory. Writing a
     more specific sentence here would be inventing the distinction the server
     deliberately refuses to make.
     ══════════════════════════════════════════════════════════════════════ */
  var SENTENCES = {
    not_signed_in:             'Sign in to play with other people.',
    rate_limited:              'Slow down a moment.',
    already_in_party:          'You are already in a party.',
    not_in_party:              'You are not in a party.',
    not_party_leader:          'Only the party leader can do that.',
    invite_target_unavailable: 'That adventurer cannot be invited right now.',
    party_full:                'That party is full.',
    party_level_spread:        'Your combat levels are too far apart.',
    party_hunt_running:        'That party is out on a hunt right now.',
    party_daily_cap:           'That is enough party business for one day.',
    invite_gone:               'That invitation is no longer open.',
    invite_expired:            'That invitation has expired.',
    unknown_party:             'That party no longer exists.',
    intent_in_flight:          'Still going through — give it a moment.',
    intent_mismatch:           'Still going through — give it a moment.',
    no_character:              'Choose a character first.',
    bad_slot:                  'Something was wrong with that request.',
    bad_party:                 'Something was wrong with that request.',
    rpc_missing:               'Parties are not open on this realm yet.',
    no_config:                 'Not connected to the realm.',
    bad_response:              'The realm gave an answer we could not read.',
    network:                   'The realm did not answer. Try again.'
  };
  function refusalSentence(code) {
    if (!code) return 'That did not work.';
    return SENTENCES[String(code)] || 'That did not work.';
  }

  /* ── THE ONE DOOR OUT (B7) ───────────────────────────────────────────────
     Every verb and the roster read leave through here, and here always POSTs.
     supabase-js's `.rpc(name, args, { get: true })` is the shape B7 warns
     about; this is a bare fetch and there is no options object to pass one
     through, which is the cheapest possible way to make the landmine
     unreachable. */
  async function rpcPost(name, body) {
    var R = window.HearthriseRpc;
    if (R && typeof R.mayCall === 'function' && !R.mayCall(name, isSignedIn())) {
      return { ok: false, error: 'not_signed_in', refused: true };
    }
    if (missing(name)) return { ok: false, error: 'rpc_missing' };
    var c = cfg();
    if (!c) return { ok: false, error: 'no_config' };
    try {
      var res = await fetch(c.url + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: headers(), body: JSON.stringify(body || {})
      });
      var json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (isMissingShape(json, res.status)) { note(name, false); return { ok: false, error: 'rpc_missing' }; }
      note(name, true);
      if (json && typeof json === 'object') return json;
      return { ok: false, error: 'bad_response', status: res.status };
    } catch (e) {
      return { ok: false, error: 'network' };
    }
  }

  /** A PostgREST table read under the caller's own RLS. Answers an array, or
      null when the request could not be made or understood — null is "we do not
      know", and every caller below fails safe to "not in a party" on it. */
  async function tableGet(path) {
    if (!isSignedIn()) return null;
    var c = cfg();
    if (!c) return null;
    try {
      var res = await fetch(c.url + '/rest/v1/' + path, { method: 'GET', headers: headers() });
      if (!res.ok) return null;
      var json = await res.json();
      return Array.isArray(json) ? json : null;
    } catch (e) {
      return null;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE PROJECTION. Scratch, replaced whole, never merged.
     ══════════════════════════════════════════════════════════════════════ */
  function blank() {
    return {
      known: false,      // has a read ever landed? until then the panel says so
      signedOut: false,  // the realm was never asked, and why
      partyId: null,
      role: null,        // 'leader' | 'member' — the server's word, from my row
      sizeCap: null,     // the party's own cap; null when I am in no party
      members: [],       // hr_party_view's frozen rows, verbatim
      invites: [],       // party_invite rows addressed to ME, live, unexpired
      notice: null,      // the sentence from my last refused gesture
      rosterUnread: false, // in a party, but no roster read has landed for it
      readNotice: null,    // the notice a failed roster read set; a landed read clears it
      busy: false,
      readAt: 0
    };
  }

  function state() {
    var G = window.G;
    if (!G) return blank();
    if (!G._party) G._party = blank();
    return G._party;
  }
  function put(next) {
    var G = window.G;
    if (G) G._party = next;
    repaint();
    return next;
  }
  function repaint() {
    try { if (typeof window.renderParty === 'function') window.renderParty(); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE CADENCE METER (B8). Public because the suite reads it: a guard that
     cannot be measured from the outside is a comment.
     ══════════════════════════════════════════════════════════════════════ */
  var SLOW_REFRESH_MS = 75000;   // > the 60 s floor §5.3 sets, and 0.8 of the
                                 // 12/min bucket per minute rather than half it
  /* TWO CLOCKS, and the difference matters. `lastReadAt` is when this module
     last spoke to the realm AT ALL and is what the idle floor consults — without
     it a player sitting on the EMPTY panel would re-read their membership and
     their inbox on every tick for ever, because no roster read had happened to
     move the meter. `lastViewAt` is the roster read specifically, which is the
     one B8 is about and the one the suite measures. */
  var stats = { viewReads: 0, lastViewAt: 0, lastReadAt: 0, verbCalls: 0 };
  var visible = false;
  var timer = null;
  var inFlight = null;
  /* ── THE READ'S GENERATION, and it exists because dropping the HANDLE to an
     in-flight read does not stop the read.
     `doRefresh` is three sequential requests. `setVisible(false)` and
     `__resetForTest` both used to null `inFlight` and walk away — so a read
     caught between its first and second request went on to make the other two,
     against whatever `window.fetch` was by then, and to `put()` a projection
     for a panel that had been closed or reset. Under the suite that is a stray
     request arriving in a LATER test's recorded calls: PARTY-2's last arm read
     `a closed panel made 1 requests` on a loaded runner, green on CI, on one
     SHA, and the request was a previous arm's read still talking.
     A read now carries the generation it started in and abandons itself — no
     further request, no `put` — the moment that generation is retired. It
     returns the CURRENT projection, so nothing is restored or evicted on the
     uncertainty (§6); the panel keeps saying what it last heard. */
  var epoch = 0;

  /** True when a SLOW (idle) refresh is allowed to spend a read right now. A
      gesture and a panel-open do not ask this — they are the player acting. */
  function slowRefreshDue(nowMs) {
    if (!visible) return false;
    return (nowMs - stats.lastReadAt) >= SLOW_REFRESH_MS;
  }

  /* ── THE READ ────────────────────────────────────────────────────────────
     Three requests at most, in dependency order: my own membership row tells me
     WHICH party, and only then is there a party to view or a cap to read. Out
     of a party it is my row plus the inbox, and no roster read at all; IN one
     it is the party row and the roster, and no inbox read — the panel does not
     offer an invite you could only be refused for accepting (already_in_party),
     so fetching it would be a request spent on something nobody can see.

     SINGLE-FLIGHTED, and the floor is NOT consulted here — a caller has already
     decided it is entitled to a read (a panel open, a gesture, or a slow tick
     that passed slowRefreshDue). Joining the flight in progress is what stops a
     gesture's re-read and an idle tick from racing two rosters into one
     projection, and it is also why the meter cannot be gamed by calling this
     twice. */
  function refresh(reason) {
    if (inFlight) return inFlight;
    var p = doRefresh(reason).then(function (v) { inFlight = null; return v; },
                                   function (e) { inFlight = null; throw e; });
    inFlight = p;
    return p;
  }

  async function doRefresh(reason) {
    var myEpoch = epoch;
    var stale = function () { return myEpoch !== epoch; };
    /* SIGNED OUT IS A STATE, NOT A PAUSE. Answering `known:false` would leave
       the panel saying "asking the realm…" for ever at a door it never knocked
       on — a spinner is a promise, and this one could not be kept. */
    if (!isSignedIn()) return put(Object.assign(blank(), { known: true, signedOut: true }));
    var cur = state();
    var next = blank();
    next.notice = cur.notice;      // a refusal the player has not acknowledged
                                   // outlives the read that follows it
    next.readNotice = cur.readNotice;
    var mine = await tableGet('party_member?select=party_id,role&left_at=is.null&slot=eq.'
      + encodeURIComponent(String(activeSlot())));
    if (stale()) return cur;               // the panel closed or reset under us
    if (mine === null) {
      /* The read did not land. NEVER restore or evict on uncertainty (§6): the
         last known projection stands, and the panel keeps saying what it last
         heard rather than telling the player their party vanished. */
      return cur;
    }
    next.known = true;
    next.readAt = Date.now();
    stats.lastReadAt = next.readAt;

    if (!mine.length) {                           // out of a party: no roster read
      next.invites = await inboxRows();
      if (stale()) return cur;
      return put(next);
    }
    next.partyId = mine[0].party_id || null;
    next.role = mine[0].role || null;

    var rows = await tableGet('party?select=id,size_cap&id=eq.' + encodeURIComponent(next.partyId));
    if (stale()) return cur;
    if (rows && rows.length) next.sizeCap = rows[0].size_cap;

    stats.viewReads += 1;
    stats.lastViewAt = Date.now();
    var view = await rpcPost('hr_party_view', { p_party: next.partyId });
    if (stale()) return cur;
    if (view && view.ok === true && Array.isArray(view.members)) {
      next.members = view.members;
      // The read landed, so the sentence saying it had not is now false.
      if (cur.notice && cur.notice === cur.readNotice) next.notice = null;
    } else if (view && view.error === 'not_in_party') {
      /* The realm and my own row disagree, which means the row is stale — I was
         kicked or the party dissolved between the two reads. The SERVER wins:
         the panel shows the empty state, not a roster nothing backs. */
      next.partyId = null; next.role = null; next.sizeCap = null;
    } else {
      /* THE ROSTER COULD NOT BE READ — a refusal, an HTTP error, or a PostgREST
         {code,message} body with no `ok` at all (live: 405 / 25006). An
         empty list here would paint "0 of 4" under a leader the realm just
         seated. Keep the last roster read for this same party, else say so and
         draw no count; never invent a member. */
      var sameParty = cur.partyId === next.partyId && Array.isArray(cur.members) && cur.members.length;
      next.members = sameParty ? cur.members : [];
      next.rosterUnread = !sameParty;
      if (next.rosterUnread) {
        next.notice = next.readNotice = (view && view.error && SENTENCES[String(view.error)])
          || 'Could not load your party right now.';
      }
    }
    return put(next);
  }

  /** The invites addressed to ME: live, unrevoked, and not yet expired BY THE
      SERVER'S CLOCK. `expires_at=gt.now` is Postgres's `'now'::timestamptz`, so
      the fifteen-minute window is judged where the clock is authoritative and a
      browser with a wrong clock cannot conjure or hide a card. */
  async function inboxRows() {
    var rows = await tableGet('party_invite?select=id,party_id,created_at,expires_at'
      + '&accepted_at=is.null&revoked_at=is.null&expires_at=gt.now&order=created_at.desc&limit=5');
    return rows || [];
  }

  /* ── THE FIVE VERBS ──────────────────────────────────────────────────────
     Each one: fire the intent, put the refusal sentence (if any) on the
     projection, and RE-READ. The re-read is what the panel renders — the
     answer's own `members` count and `role` are never written into the
     projection, because a count is not a roster and the one thing this module
     must never do is paint a membership the realm has not stated. */
  async function gesture(name, body) {
    var cur = state();
    put(Object.assign({}, cur, { busy: true, notice: null }));
    stats.verbCalls += 1;
    var res = await rpcPost(name, body);
    var sentence = (res && res.ok === true) ? null : refusalSentence(res && res.error);
    var after = Object.assign({}, state(), { busy: false, notice: sentence });
    put(after);
    /* THE RE-READ IS UNCONDITIONAL, refusal included. `already_in_party` means
       the projection is out of date, and that is exactly the case where showing
       the player the truth matters most. */
    await refresh(name);
    return res;
  }

  function createParty() { return gesture('hr_party_create', { p_slot: activeSlot(), p_idem: newIdem() }); }
  function invite(name) {
    return gesture('hr_party_invite', { p_slot: activeSlot(), p_name: String(name == null ? '' : name), p_idem: newIdem() });
  }
  function accept(inviteId) {
    return gesture('hr_party_accept', { p_slot: activeSlot(), p_invite: String(inviteId || ''), p_idem: newIdem() });
  }
  function leave() { return gesture('hr_party_leave', { p_slot: activeSlot(), p_idem: newIdem() }); }
  function kick(name) {
    return gesture('hr_party_kick', { p_slot: activeSlot(), p_name: String(name == null ? '' : name), p_idem: newIdem() });
  }

  /* ── VISIBILITY: THE ONLY THING THAT ARMS THE SLOW REFRESH ───────────────
     A closed panel reads NOTHING. The timer ticks at a third of the refresh
     interval so a panel opened just before a due moment does not wait a whole
     interval for it, and the floor above — not the timer — is what decides
     whether a tick spends a read. */
  function setVisible(on) {
    visible = !!on;
    if (visible) {
      if (!timer) timer = setInterval(pollNow, Math.round(SLOW_REFRESH_MS / 3));
      refresh('open');
    } else {
      /* CLOSING RETIRES THE READ IN FLIGHT, which is what makes the module's own
         first line — "A closed panel reads NOTHING" — true of a panel closed
         mid-read as well as one closed between reads. Unconditional: a flight
         can be open with no timer (a gesture's re-read), and that flight is
         exactly the one that used to keep spending requests after the close. */
      epoch += 1; inFlight = null;
      if (timer) { clearInterval(timer); timer = null; }
    }
  }

  /** One tick of the slow refresh. Exported so the suite can drive it without
      a wall-clock wait: the property under test is "an idle tick does not spend
      a read", and that is a property of this function. */
  function pollNow() {
    if (!slowRefreshDue(Date.now())) return null;
    return refresh('slow');
  }

  window.HearthriseParty = {
    isSignedIn: isSignedIn,
    activeSlot: activeSlot,
    refusalSentence: refusalSentence,
    SLOW_REFRESH_MS: SLOW_REFRESH_MS,
    getState: state,
    stats: function () {
      return { viewReads: stats.viewReads, lastViewAt: stats.lastViewAt,
               lastReadAt: stats.lastReadAt, verbCalls: stats.verbCalls };
    },
    setVisible: setVisible,
    pollNow: pollNow,
    refresh: refresh,
    createParty: createParty,
    invite: invite,
    accept: accept,
    leave: leave,
    kick: kick,
    /* Test seam: the suite drives a stubbed fetch and needs the module back at
       its boot state between arms. It resets the METER and the projection, and
       nothing else — there is no hidden state for it to miss. */
    __resetForTest: function () {
      stats = { viewReads: 0, lastViewAt: 0, lastReadAt: 0, verbCalls: 0 };
      probe = {};
      /* The generation FIRST: nulling inFlight only drops the handle, and a read
         still in flight would otherwise finish against the next test's stub. */
      epoch += 1;
      inFlight = null;
      visible = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (window.G) window.G._party = blank();
    }
  };
}());
