// ============================================================
// src/net/signup-door.js — THE SIGN-UP DOOR, as decisions rather than as UI.
//
// Every rule the front door needs in order to stop being a dead end lives
// here, PURE: no DOM, no network, no clock of its own, no Supabase. The gate
// (src/net/account-gate.js) and the auth layer (src/net/auth.js) both read it,
// so the two cannot disagree about what "the confirm link comes back here"
// means, and a Node guard (tests/signup-door.mjs) can grade every branch
// without a browser.
//
// ── WHAT WENT WRONG, MEASURED ───────────────────────────────────────────────
// The beta-2 funnel lost 11 of 49 sign-ups at the email wall. The client had
// three separate holes, all of them still in the code byte for byte:
//
//   1. `signUp()` was called with NO `emailRedirectTo`, so GoTrue redirected
//      the confirm link to whatever the project's Site URL happens to be. If
//      that is not this game, the player confirms and lands NOWHERE.
//   2. There was no resend anywhere in the client. A lost or expired mail was
//      the end of that account.
//   3. The success copy read "Confirm the link in your email, then sign in" —
//      i.e. the product asking the player to find it again and authenticate a
//      second time, which is the dead end stated out loud.
//
// ── WHAT THIS FILE CANNOT FIX, AND SAYS SO ──────────────────────────────────
// Passing `emailRedirectTo` PROVES NOTHING ABOUT PRODUCTION on its own.
// GoTrue silently falls back to the Site URL when the redirect is not in the
// project's Auth redirect allowlist, so a green test here is compatible with a
// completely dead confirm link in the live game. The three gates that live
// outside any assertion in this repo are written up in
// docs/design/signup-door-config-gates.md. Do not mark this door "done" on a
// green suite.
//
// ── DUAL RUNTIME ────────────────────────────────────────────────────────────
// No `import`, no `export`: this file is simultaneously a valid classic script
// (index.html loads it just before the account wall, which needs it at parse
// time) and a valid ES module with no bindings (the Node guard `import()`s it
// and reads the global it publishes). Keep it that way — the wall runs BEFORE
// any deferred module, so a real `export` here would make the door's rules
// arrive after the door.
// ============================================================
(function (root) {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // 0 · Tiny shared parsing
  // ════════════════════════════════════════════════════════════

  /**
   * Parse a `#…` or `?…` fragment into a plain object. Deliberately hand-rolled
   * rather than `URLSearchParams`: GoTrue puts the implicit-grant result in the
   * HASH, and `new URL(href).searchParams` cannot see it, so the two halves of
   * this module would otherwise be reading the URL through two different lenses.
   */
  function parseParams(s) {
    var out = {};
    s = String(s == null ? '' : s).replace(/^[#?]+/, '');
    if (!s) return out;
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i];
      if (!kv) continue;
      var eq = kv.indexOf('=');
      var k = eq < 0 ? kv : kv.slice(0, eq);
      var v = eq < 0 ? '' : kv.slice(eq + 1);
      try { out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' ')); }
      catch (e) { out[k] = v; }        // a malformed %XX must not lose the rest
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════
  // 1 · WHERE THE CONFIRM LINK COMES BACK TO
  // ════════════════════════════════════════════════════════════

  /**
   * The absolute URL to hand GoTrue as `emailRedirectTo` — i.e. THIS GAME,
   * wherever it is currently being served from.
   *
   * Derived from the live location rather than hard-coded, and that is a
   * decision with two reasons behind it. The game is served from at least three
   * origins that matter (hearthrise.net, bugsquisher1.github.io, and the itch
   * wrapper's iframe src), and a hard-coded host would send a github.io player
   * to hearthrise.net — a different storage partition, so a session established
   * there is invisible where they were actually playing. And in dev/CI the
   * origin is localhost, where a hard-coded production URL would be an outright
   * lie about where the link should land.
   *
   * NORMALISED to the directory: `/index.html` and `/` are the same door, and
   * the project's Auth redirect allowlist is exact-match, so collapsing them
   * means ONE allowlist entry covers both instead of one covering half the
   * players. Query and hash are dropped by construction — an invite code or a
   * stale `#access_token` riding back into the confirm link would be a leak.
   *
   * @returns {string|null} null when there is no http(s) origin to return to
   *   (file://, an opaque origin, a malformed Location). Null is the honest
   *   answer, and the caller must then OMIT the option rather than send junk:
   *   GoTrue rejects an unparseable redirect for the whole request.
   */
  function signupRedirectTarget(loc) {
    if (!loc) return null;
    var origin = String(loc.origin == null ? '' : loc.origin);
    if (!/^https?:\/\/[^/\s]+$/i.test(origin)) return null;
    var path = String(loc.pathname == null ? '/' : loc.pathname);
    if (path.charAt(0) !== '/') path = '/' + path;
    path = path.replace(/index\.html?$/i, '');
    if (!path) path = '/';
    return origin + path;
  }

  // ════════════════════════════════════════════════════════════
  // 2 · WHAT KIND OF ARRIVAL IS THIS?
  // ════════════════════════════════════════════════════════════

  /* A GoTrue auth code is an opaque token, and the ONLY reason this predicate
     exists is that `?code=` is a param name anything could use. A false
     positive costs a few seconds of "Completing sign-in…" before the door
     falls back to the form, which is why the bar is deliberately low rather
     than a format pin that would rot the first time GoTrue changes shape. */
  function looksLikeAuthCode(v) {
    return typeof v === 'string' && v.length >= 20 && !/\s/.test(v);
  }

  /**
   * Read the URL the player arrived on and say what it IS.
   *
   *   'implicit' — GoTrue's confirm/magic-link landing: `#access_token=…`.
   *                supabase-js consumes this itself (detectSessionInUrl), so
   *                the door's job is only to hold the sign-in FORM back while
   *                that happens, instead of showing a wall to somebody who is
   *                three hundred milliseconds from being signed in.
   *   'pkce'     — `?code=…`. Not reachable while auth.js pins the implicit
   *                flow, and handled anyway because the flow is one line away
   *                from changing and a silent regression here is invisible.
   *   'error'    — `error=` / `error_code=` / `error_description=`, which
   *                GoTrue puts in the HASH for the implicit flow and in the
   *                QUERY for pkce. `otp_expired` is the one every player meets:
   *                the confirm link is single-use and time-boxed.
   *   'none'     — an ordinary load.
   */
  function classifyArrival(loc) {
    var hash = parseParams(loc && loc.hash);
    var query = parseParams(loc && loc.search);
    var errBag = null;
    if (hash.error || hash.error_code || hash.error_description) errBag = hash;
    else if (query.error || query.error_code || query.error_description) errBag = query;
    if (errBag) {
      var code = String(errBag.error_code || errBag.error || 'unspecified');
      var desc = String(errBag.error_description || '');
      return {
        kind: 'error',
        code: code,
        description: desc,
        // The single most common one, and the only one with a real remedy
        // (resend). Matched on either field because GoTrue has shipped it in
        // both: `error_code=otp_expired` and, older, only in the description.
        expired: /expired/i.test(code) || /expired/i.test(desc)
      };
    }
    if (hash.access_token) return { kind: 'implicit', type: String(hash.type || ''), code: '', description: '', expired: false };
    if (looksLikeAuthCode(query.code)) return { kind: 'pkce', type: String(query.type || ''), code: '', description: '', expired: false };
    return { kind: 'none', type: '', code: '', description: '', expired: false };
  }

  /** True for the two arrivals where a session is about to exist. */
  function arrivalIsPending(a) {
    return !!a && (a.kind === 'implicit' || a.kind === 'pkce');
  }

  /**
   * What to tell a player whose confirm link did not work. Never the raw
   * `error_description` — GoTrue's is written for a developer ("Email link is
   * invalid or has expired") and does not say what to do next.
   */
  function arrivalErrorMessage(a) {
    if (!a || a.kind !== 'error') return '';
    /* Names the control rather than a direction. The message renders UNDER the
       form and the resend link sits above it, so "below" was pointing at the
       wrong half of the panel — caught by looking at the screen, not by a
       measurement. */
    var how = 'Enter your email, then use “Didn’t get the confirmation email?” for a fresh one.';
    if (a.expired) return 'That confirmation link has expired or was already used. ' + how;
    if (/access_denied/i.test(a.code)) return 'That confirmation link was not accepted. ' + how;
    return 'Something went wrong opening that link. ' + how;
  }

  // ════════════════════════════════════════════════════════════
  // 3 · RESEND — the cooldown, and the honesty rule
  // ════════════════════════════════════════════════════════════

  /* Sixty seconds. Not a guess: Supabase's built-in SMTP enforces a per-email
     minimum interval (60s by default) and answers a faster request with 429.
     A client cooldown SHORTER than the server's turns every eager second press
     into a rate-limit error the player reads as "it is broken"; a much longer
     one strands somebody whose first mail genuinely vanished. Matching it means
     the button is enabled exactly when pressing it can work. */
  var RESEND_COOLDOWN_MS = 60000;

  /**
   * May the resend button fire? Pure, so "the cooldown is respected" is a
   * property with a test rather than a `setTimeout` nobody can observe.
   *
   * @param {{now:number, lastSentAt:number|null, cooldownMs?:number, inFlight?:boolean}} state
   * @returns {{allowed:boolean, reason:'ready'|'cooldown'|'inflight', waitMs:number}}
   */
  function resendDecision(state) {
    state = state || {};
    var cd = (typeof state.cooldownMs === 'number' && isFinite(state.cooldownMs) && state.cooldownMs >= 0)
      ? state.cooldownMs : RESEND_COOLDOWN_MS;
    if (state.inFlight) return { allowed: false, reason: 'inflight', waitMs: 0 };
    var last = state.lastSentAt;
    if (typeof last !== 'number' || !isFinite(last)) return { allowed: true, reason: 'ready', waitMs: 0 };
    var now = (typeof state.now === 'number' && isFinite(state.now)) ? state.now : 0;
    var wait = last + cd - now;
    /* A clock that jumps BACKWARD (a device correcting its time, a VM resume)
       would otherwise leave `wait` larger than the whole cooldown and lock the
       only recovery control the player has, for as long as the jump. The
       cooldown is a duration, so a wait longer than the duration is not a
       cooldown — it is a broken clock, and the safe direction is to allow. */
    if (wait > cd) return { allowed: true, reason: 'ready', waitMs: 0 };
    if (wait > 0) return { allowed: false, reason: 'cooldown', waitMs: wait };
    return { allowed: true, reason: 'ready', waitMs: 0 };
  }

  /** "Resend in 43s" / "Resend email" — one place, so the label cannot drift. */
  function resendLabel(decision) {
    if (decision && decision.reason === 'inflight') return 'Sending…';
    if (decision && decision.reason === 'cooldown') {
      return 'Resend in ' + Math.max(1, Math.ceil(decision.waitMs / 1000)) + 's';
    }
    return 'Resend email';
  }

  /**
   * THE HONESTY RULE, and it is the whole reason this is a function instead of
   * a `.then(() => say('Sent'))`.
   *
   * supabase-js `auth.resend()` does NOT throw on failure — it RESOLVES with
   * `{ data, error }`. A caller that only handles the rejection path therefore
   * renders "Sent. Check your email" for a rate-limited or outright failed
   * request, and the player waits for a mail that was never dispatched. That is
   * strictly worse than no resend button at all: it converts a recoverable
   * state into one the player has been told to stop working on.
   *
   * `kind` is machine-readable and `kind === 'sent'` is the ONLY value that may
   * be rendered as success.
   */
  function resendOutcome(res) {
    var err = res && res.error;
    if (!err) {
      return {
        ok: true, kind: 'sent', tone: 'ok',
        message: 'Sent. Open the link in your email — it can take a minute, and it sometimes lands in spam.'
      };
    }
    var msg = String(err.message == null ? '' : err.message);
    var status = Number(err.status || (err.context && err.context.status) || 0);
    if (status === 429 || /rate limit|for security purposes|too many|after \d+ seconds/i.test(msg)) {
      return {
        ok: false, kind: 'rate_limited', tone: 'bad',
        message: 'Too many requests just now — wait a minute, then try again.'
      };
    }
    /* GoTrue answers a resend for an ALREADY-CONFIRMED address with an error,
       and that is good news wearing a bad hat: the player is done and simply
       needs to sign in. Rendering it as a failure sends a finished account away
       from the door. */
    if (/already (been )?confirmed|already registered|already exists/i.test(msg)) {
      return {
        ok: false, kind: 'already_confirmed', tone: 'ok',
        message: 'That address is already confirmed — sign in and you are through.'
      };
    }
    return {
      ok: false, kind: 'failed', tone: 'bad',
      message: 'That did not send' + (msg ? ' (' + msg + ')' : '') + '. Try again in a moment, or ask in the Discord.'
    };
  }

  /** What a "have you confirmed yet?" sign-in retry means, in words. */
  function confirmRetryOutcome(err) {
    if (!err) return { ok: true, kind: 'signed_in', tone: 'ok', message: 'Entering the realm…' };
    var msg = String(err.message == null ? '' : err.message);
    if (/not confirmed|email not confirmed/i.test(msg)) {
      return {
        ok: false, kind: 'not_confirmed', tone: 'muted',
        message: 'Not confirmed yet — open the link in your email first, then try again.'
      };
    }
    if (/invalid login credentials/i.test(msg)) {
      return {
        ok: false, kind: 'bad_credentials', tone: 'bad',
        message: 'That email and password do not match an account yet. Check them and try again.'
      };
    }
    return { ok: false, kind: 'failed', tone: 'bad', message: msg || 'That did not work — try again.' };
  }

  // ════════════════════════════════════════════════════════════
  // 4 · THE INVITE CODE AS A LINK
  // ════════════════════════════════════════════════════════════

  /* `invite`, NOT `code`. `?code=` is what GoTrue's PKCE callback uses, and a
     door that cannot tell an invite from an auth code would try to complete a
     session out of somebody's invite link. One-word decision, permanent class
     of bug avoided. */
  var INVITE_PARAM = 'invite';
  var INVITE_MAX_LEN = 64;

  /**
   * The canonical form of a code, whether it was typed or arrived in a link.
   * Upper-cased and trimmed here AND normalised again server-side — the client
   * copy is so the player sees what will be sent; the server's is because the
   * client's is not evidence of anything.
   *
   * Returns '' for anything that cannot be a code, which is how a garbage or
   * hostile `?invite=` value gets dropped instead of being pre-filled into a
   * form and blamed on the player.
   */
  function normaliseInviteCode(raw) {
    if (typeof raw !== 'string') return '';
    var s = raw.trim().toUpperCase();
    if (!s || s.length > INVITE_MAX_LEN) return '';
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(s)) return '';
    return s;
  }

  /**
   * Read an invite code out of the URL a player followed.
   *
   * @returns {{present:boolean, code:string, malformed:boolean}}
   *   `present` — the link carried the parameter at all;
   *   `code`    — the canonical code, '' when it could not be one;
   *   `malformed` — present but unusable, which is a DIFFERENT thing to say
   *                 than "unknown code" and must not be reported as one.
   */
  function readInviteFromUrl(loc) {
    var q = parseParams(loc && loc.search);
    var h = parseParams(loc && loc.hash);
    var raw = (q[INVITE_PARAM] != null) ? q[INVITE_PARAM] : h[INVITE_PARAM];
    var present = (raw != null && String(raw).trim() !== '');
    var code = present ? normaliseInviteCode(String(raw)) : '';
    return { present: present, code: code, malformed: present && !code };
  }

  /**
   * The same href with the invite parameter removed, for `history.replaceState`.
   *
   * This is not tidiness. A code sitting in the address bar rides out in the
   * `Referer` of the next outbound click (the door has a Discord link, and it
   * is `target=_blank`), gets bookmarked, gets pasted into a screenshot, and
   * survives in the tab's session history. The migration that owns the check
   * already refuses to put a code in a GET for exactly this reason — an invite
   * LINK cannot honour that on arrival, so it honours it one tick later.
   *
   * Returns the input unchanged when there is nothing to strip, so the caller
   * can skip a needless history entry by comparing.
   */
  function stripInviteFromHref(href) {
    var s = String(href == null ? '' : href);
    if (s.indexOf(INVITE_PARAM + '=') === -1) return s;
    var drop = function (frag, lead) {
      if (!frag) return '';
      var body = frag.replace(/^[#?]+/, '');
      if (!body) return '';
      var kept = body.split('&').filter(function (kv) {
        if (!kv) return false;
        var eq = kv.indexOf('=');
        var k = eq < 0 ? kv : kv.slice(0, eq);
        try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) {}
        return k !== INVITE_PARAM;
      });
      return kept.length ? lead + kept.join('&') : '';
    };
    var hashAt = s.indexOf('#');
    var hash = hashAt >= 0 ? s.slice(hashAt) : '';
    var head = hashAt >= 0 ? s.slice(0, hashAt) : s;
    var qAt = head.indexOf('?');
    var query = qAt >= 0 ? head.slice(qAt) : '';
    var base = qAt >= 0 ? head.slice(0, qAt) : head;
    return base + drop(query, '?') + drop(hash, '#');
  }

  // ════════════════════════════════════════════════════════════
  // 5 · WHY A CODE WAS REFUSED — and saying WHICH
  // ════════════════════════════════════════════════════════════
  //
  // beta-2 logged 13 `refused_unknown` against 5 redeemed: roughly three
  // refusals per success. The client's answer to every one of them was the
  // same sentence, so a player could not tell "you typed it wrong" from "this
  // code is spent" from "the check could not run" — and the three have three
  // different next actions (retype / ask for a new one / try again).
  //
  // ⚠ THE SERVER'S RULES ARE NOT TOUCHED HERE. This maps the answer the server
  // already gives onto a sentence that names the cause. Two sources, in
  // priority order:
  //
  //   1. A MACHINE code, if one is present. `hr_beta_gate_reason()` already
  //      speaks this vocabulary internally (`invite_unknown`, `invite_used`,
  //      `invite_required`) and `beta_signup_log.outcome` records it
  //      (`refused_unknown`, `refused_used`, …). `beta_invite_check` does not
  //      yet RETURN it — adding `reason_code` to its payload is an additive,
  //      rules-unchanged server change written up as an ops gate. Reading it
  //      first means the day it lands, this file already prefers it.
  //   2. The PROSE the server ships today. Matching on a string is brittle and
  //      is chosen with eyes open: the alternative is showing the player one
  //      undifferentiated sentence, which is the defect. Every pattern below is
  //      quoted from the migration that emits it, and the fallback for an
  //      unrecognised sentence is the honest generic — never a guess.
  //
  // ⚠ `expired` IS UNREACHABLE TODAY, deliberately and knowingly.
  // `public.beta_invites` is (code, note, used_by, used_at, created_at) — there
  // is no expiry column, so no server answer can mean "expired". The branch
  // exists because the vocabulary was specified and because a code lifetime is
  // an obvious future rule; it is documented as unreachable rather than
  // presented as working. Do NOT write a client-side expiry check to "make it
  // fire" — the client is not the authority on when a code dies.

  var INVITE_REFUSAL = {
    unknown: 'We do not recognise that invite code. Check it for typos, or ask in the Discord for a new one.',
    used: 'That invite code has already been used — each code makes one account. If that was you, sign in instead.',
    expired: 'That invite code has expired. Ask in the Discord for a fresh one.',
    throttled: 'Too many invite attempts from this connection. Wait a minute, then try again.',
    blank: 'Enter your invite code, or use the invite link you were sent.',
    unreachable: 'We could not check that code just now. Check your connection and try again.',
    refused: 'That invite code cannot be used right now. Tell us in the Discord and we will sort it out.'
  };

  /* The machine vocabulary, from supabase/migrations/2026-08-23-beta-invite-gate.sql
     (`hr_beta_gate_reason` returns the `invite_*` forms; the signup log stores
     the `refused_*` forms). Both spellings map to the same player-facing
     meaning, because which one arrives depends on which layer refused. */
  var INVITE_MACHINE = {
    invite_unknown: 'unknown', refused_unknown: 'unknown',
    invite_used: 'used', refused_used: 'used',
    invite_required: 'blank', refused_required: 'blank', refused_missing: 'blank',
    invite_expired: 'expired', refused_expired: 'expired',
    refused_throttled: 'throttled', invite_throttled: 'throttled'
  };

  /* The prose, quoted from the two functions that emit it:
       beta_invite_check   (2026-08-11-live-market-rls.sql §3a)
         'Invalid invite code.' | 'Code already used.' | 'Too many attempts. Try again in a minute.'
       hr_beta_gate_message (2026-08-23-beta-invite-gate.sql §3)
         '…was not recognised…' | '…has already been used…' | '…closed beta. Enter the invite code…'
         | 'Too many invite attempts from this connection…'
     ORDER MATTERS: 'already been used' must be tested before the generic
     'invalid', or a used code would be reported as a typo. */
  var INVITE_PROSE = [
    [/already (been )?used|code already used/i, 'used'],
    [/expired/i, 'expired'],
    [/too many/i, 'throttled'],
    [/not recognised|not recognized|invalid invite code/i, 'unknown'],
    [/closed beta|enter the invite code/i, 'blank'],
    [/could not check|network error|try again in a moment/i, 'unreachable']
  ];

  /**
   * @param {{ok?:boolean, reason?:string, reason_code?:string, code?:string, transport?:string}} payload
   * @returns {{kind:string, message:string, serverSaid:string}}
   *   `kind` is one of unknown|used|expired|throttled|blank|unreachable|refused.
   *   `serverSaid` is kept so a bug report can carry the server's own words even
   *   though the player is shown ours.
   */
  function classifyInviteRefusal(payload) {
    payload = payload || {};
    var said = String(payload.reason == null ? '' : payload.reason);
    var machine = String(payload.reason_code || payload.code || '').toLowerCase();
    var kind = INVITE_MACHINE[machine] || null;
    if (!kind && payload.transport === 'unreachable') kind = 'unreachable';
    if (!kind && said) {
      for (var i = 0; i < INVITE_PROSE.length; i++) {
        if (INVITE_PROSE[i][0].test(said)) { kind = INVITE_PROSE[i][1]; break; }
      }
    }
    if (!kind) kind = 'refused';
    return { kind: kind, message: INVITE_REFUSAL[kind], serverSaid: said };
  }

  // ════════════════════════════════════════════════════════════
  // 6 · THE COPY THAT REPLACED THE DEAD END
  // ════════════════════════════════════════════════════════════
  //
  // The old sentence — "Account created. Confirm the link in your email, then
  // sign in." — described the product asking the player to leave, find it
  // again, and authenticate a second time. It is replaced by a STATE, not a
  // sentence: the door stays open on a "check your email" panel that carries
  // the two controls that actually recover the two ways this fails (the mail
  // did not arrive → resend; the link signed you in somewhere else, e.g. a
  // different storage partition than the itch.io iframe → confirm-and-continue).
  //
  // ⚠ The copy deliberately does NOT promise "you will land back here signed
  // in". That promise is only true when the project's Site URL and redirect
  // allowlist are configured (see docs/design/signup-door-config-gates.md), and
  // this client cannot verify either. It says what we DID (sent a link) and
  // what to do (open it), and the panel is built so that either outcome —
  // landing back in the game, or landing on a sign-in form somewhere else —
  // ends with the player inside.

  function signupSentCopy(opts) {
    opts = opts || {};
    var addr = String(opts.email || '').trim();
    var where = addr ? ' to ' + addr : '';
    /* ⚠ IT DOES NOT PROMISE "and you will land back here signed in". That is
       only true when the project's Site URL and redirect allowlist are
       configured (docs/design/signup-door-config-gates.md) and when the link is
       opened in a browser that shares this document's storage partition —
       neither of which this client can verify. It states what we DID, and the
       hint names the control that covers the case where the link worked
       somewhere we cannot see. */
    return {
      title: 'Check your email',
      body: 'We sent a confirmation link' + where + '. Open it to finish creating your account.'
          + (opts.usedCode ? ' Your invite code is now used.' : ''),
      hint: 'No email after a minute? Check spam, or resend it below. '
          + 'Already opened the link somewhere else? Use “I’ve confirmed”.'
    };
  }

  // ════════════════════════════════════════════════════════════
  // 7 · Publication
  // ════════════════════════════════════════════════════════════
  var API = {
    parseParams: parseParams,
    signupRedirectTarget: signupRedirectTarget,
    classifyArrival: classifyArrival,
    arrivalIsPending: arrivalIsPending,
    arrivalErrorMessage: arrivalErrorMessage,
    RESEND_COOLDOWN_MS: RESEND_COOLDOWN_MS,
    resendDecision: resendDecision,
    resendLabel: resendLabel,
    resendOutcome: resendOutcome,
    confirmRetryOutcome: confirmRetryOutcome,
    INVITE_PARAM: INVITE_PARAM,
    normaliseInviteCode: normaliseInviteCode,
    readInviteFromUrl: readInviteFromUrl,
    stripInviteFromHref: stripInviteFromHref,
    classifyInviteRefusal: classifyInviteRefusal,
    INVITE_REFUSAL: INVITE_REFUSAL,
    signupSentCopy: signupSentCopy
  };
  root.HearthriseSignupDoor = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
