// ============================================================
// src/features/identity.js  (b221, backlog #9)
//
// WHO YOU ARE — a unique display name, chosen at first sign-in, and a
// portrait the player uploads themselves.
//
// ── WHY UNIQUENESS IS THE FEATURE ───────────────────────────
// A name in a social game is not a preference, it is an ADDRESS. Chat
// whispers you by name, the market attributes a listing by name, the
// leaderboard ranks you by name. Every one of those is a lie the moment two
// players share one — and "Adventurer" was the default for everybody, so
// today every one of them IS a lie. This module makes the name real.
//
// ── WHERE THE RULES LIVE ────────────────────────────────────
// Uniqueness is a claim about EVERY OTHER PLAYER, and no client can make
// one. The SERVER owns it, as a primary key:
//   • public.display_names.canonical IS the unique index
//   • claim_display_name() is the only writer — check-then-insert has a
//     race window; a primary key does not
//   • a rename MOVES the key in one statement, so the old name is released
//     only if the new one is actually acquired
// Everything in this file is a MIRROR for UX plus the flow that reaches it.
// See supabase/migrations/2026-08-08-unique-names.sql.
//
// ── CLIENT-FIRST COMPATIBILITY ──────────────────────────────
// This ships BEFORE the migration is applied and must work anyway. Both
// RPCs are FEATURE-DETECTED (404 / PGRST202 → 'unsupported') with a
// negative probe that expires after ten minutes, so a session left open
// across the migration heals itself without a reload. With no server the
// player still picks a name and still plays under it — but it is marked
// PROVISIONAL and re-claimed silently the moment the RPC exists, because a
// client cannot honestly promise uniqueness and must not pretend to.
//
// ── THE IDENTITY SEAM ───────────────────────────────────────
// window.HearthriseIdentity (src/utils/profile.js, b214, 0 consumers until
// now) is the READ seam: "what name do I render, what portrait do I draw".
// This file is the WRITE authority and MERGES into that same global rather
// than replacing it, so there is exactly one identity object and load order
// does not matter. profile.js stays what it is — thin accessors — and
// finally has callers.
//
// ── THE AVATAR ──────────────────────────────────────────────
// Never ship the original bytes. The file is decoded, centre-cropped square
// and re-encoded from PIXELS onto a 256x256 canvas, which caps size, fixes
// dimensions, and drops every scrap of metadata (EXIF GPS included) that
// rode in on the upload. Path is derived — avatars/<uid>/avatar.webp — so
// there is no column to migrate and no way for the path to disagree with
// who owns it. Anonymous players keep a local-only portrait; it works
// offline, and it is honestly labelled as this-device-only.
// ============================================================
(function () {
  'use strict';

  // ── Rules (mirrored byte-for-byte in the migration) ─────────
  var MIN_LEN = 3;
  var MAX_LEN = 20;
  // Hyphen LAST so it is a literal, not a range. Must start and end
  // alphanumeric: that is what stops "   .-.   " and lookalike padding.
  var CHARSET_RE = /^[A-Za-z0-9][A-Za-z0-9 _'’.-]*[A-Za-z0-9]$/;
  var RESERVED = [
    'admin', 'administrator', 'moderator', 'moderators', 'mod', 'gm', 'game master',
    'hearthrise', 'system', 'server', 'support', 'staff', 'dev', 'developer',
    'null', 'undefined', 'anonymous', 'adventurer'
  ];
  var RESERVED_TIGHT = RESERVED.map(function (s) { return s.replace(/\s+/g, ''); });

  var AVATAR_PX        = 256;
  var AVATAR_MAX_BYTES = 512 * 1024;              // hard cap, post-processing
  var AVATAR_TYPES     = ['image/png', 'image/jpeg', 'image/webp'];
  var AVATAR_RAW_MAX   = 16 * 1024 * 1024;        // refuse to DECODE more than this
  var AVATAR_QUALITY   = [0.85, 0.72, 0.6, 0.5, 0.4];
  // b360: the shown default is a NEUTRAL SILHOUETTE, not a painted face. Two
  // reasons. (1) "Adventurer" was one shared name and player.png was one shared
  // face — a default that looks like a real person invites the player to think
  // it IS their portrait, and makes the picker feel skippable. A universal
  // "no portrait yet" bust reads as "pick one", which is exactly the nudge the
  // new picker wants. (2) It is a 1 KB shipped asset that can never 404, so the
  // render seam never produces a broken image. player.png is retained only as a
  // deep onerror last-ditch in index.html — never the face a new player sees.
  var DEFAULT_AVATAR   = 'assets/avatars/_placeholder.webp';

  // ── Prefab portrait catalogue (b360, backlog #26) ────────────
  // Ten Recraft-painted faces, processed to the SAME 256² the upload pipeline
  // produces and shipped as webp under assets/avatars/. This array is the ONE
  // manifest both the picker grid and the smoke suite read — add a face by
  // adding a row here plus its <id>.webp, nothing else. A prefab is NOT a
  // "preset id": choosing one runs the exact upload pipeline (processImage →
  // local save → cloud upload), so it persists and syncs across devices like
  // any uploaded portrait. There is deliberately no stored "which prefab" — a
  // chosen prefab becomes a portrait, indistinguishable from an upload, which
  // is what gets it cross-device sync for free.
  var PREFAB_BASE = 'assets/avatars/';
  var PREFABS = [
    { id: 'knight',     name: 'Knight'     },
    { id: 'ranger',     name: 'Ranger'     },
    { id: 'scholar',    name: 'Scholar'    },
    { id: 'archer',     name: 'Archer'     },
    { id: 'rogue',      name: 'Rogue'      },
    { id: 'farmer',     name: 'Farmer'     },
    { id: 'merchant',   name: 'Merchant'   },
    { id: 'blacksmith', name: 'Blacksmith' },
    { id: 'craftsman',  name: 'Craftsman'  },
    { id: 'veteran',    name: 'Veteran'    }
  ].map(function (p) { return { id: p.id, name: p.name, src: PREFAB_BASE + p.id + '.webp' }; });
  function prefabById(id) {
    for (var i = 0; i < PREFABS.length; i++) if (PREFABS[i].id === id) return PREFABS[i];
    return null;
  }

  var STORE_KEY = 'hearthrise:identity';

  // ════════════════════════════════════════════════════════════
  // 1 · PURE: canonical form + validation
  // ════════════════════════════════════════════════════════════
  // The canonical form is the uniqueness key, so "Sir_Bob", "sir bob" and
  // "SIR   BOB" are ONE name. Impersonation by punctuation is the cheapest
  // attack on a name system and it costs nothing to close.
  // ⚠ MUST agree with public.hr_canon_display_name(). The b221 suite and
  // the migration's self-check assert the same pairs from both sides.
  function canon(name) {
    return String(name == null ? '' : name)
      .toLowerCase()
      .replace(/[_\-.]/g, ' ')
      .replace(/['’]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Display normalisation: collapse whitespace runs, strip the ends. The
  // stored name can therefore never carry leading/trailing spaces — the
  // rule is enforced by normalising, not by scolding the player for a
  // trailing space they cannot see.
  function normalize(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  }

  var REASONS = {
    empty:     'Choose a name',
    short:     'At least ' + MIN_LEN + ' characters',
    long:      'At most ' + MAX_LEN + ' characters',
    charset:   'Letters, numbers, spaces and _ ’ . - only, starting and ending with a letter or number',
    reserved:  'That name is reserved',
    profanity: 'Choose a different name'
  };

  /**
   * The whole rule set, pure and DOM-free.
   * @returns {{ok:boolean, name?:string, canonical?:string, reason?:string, message?:string}}
   */
  function validateName(raw) {
    var name = normalize(raw);
    if (!name)                 return { ok: false, reason: 'empty',   message: REASONS.empty };
    if (name.length < MIN_LEN) return { ok: false, reason: 'short',   message: REASONS.short };
    if (name.length > MAX_LEN) return { ok: false, reason: 'long',    message: REASONS.long };
    if (!CHARSET_RE.test(name)) return { ok: false, reason: 'charset', message: REASONS.charset };
    var c = canon(name);
    // A name has to survive canonicalisation or it is not addressable.
    if (c.length < MIN_LEN)    return { ok: false, reason: 'short',   message: REASONS.short };
    // Reserved names are matched with separators REMOVED, not merely folded.
    // canon() folds "_" to a space, so "Adm_in" canonicalises to "adm in" and
    // would otherwise sail past a plain lookup — as would "A d m i n". This
    // stricter fold applies ONLY to the reserved list: the uniqueness key
    // itself keeps spaces, because "Iron Vale" and "Ironvale" are two players'
    // names, not one impersonation attempt.
    if (RESERVED_TIGHT.indexOf(c.replace(/\s+/g, '')) !== -1) {
      return { ok: false, reason: 'reserved', message: REASONS.reserved };
    }
    // The profanity guard the codebase already has. Deliberately NOT
    // duplicated in SQL — two curated word lists always drift apart, and
    // the one that ships with the client is the one that gets tuned.
    try {
      if (window.ChatFilter && typeof window.ChatFilter.contains === 'function' &&
          window.ChatFilter.contains(name)) {
        return { ok: false, reason: 'profanity', message: REASONS.profanity };
      }
    } catch (e) { /* a filter failure must never block a legal name */ }
    return { ok: true, name: name, canonical: c };
  }

  // ════════════════════════════════════════════════════════════
  // 2 · PURE REDUCERS (the whole server contract, no I/O)
  // ════════════════════════════════════════════════════════════
  function isMissingRpc(status, out) {
    return status === 404 ||
      (out && (out.code === 'PGRST202' || out.code === '42883' || out.code === '42P01'));
  }

  var CLAIM_ERRORS = {
    taken:         'That name is already taken',
    not_signed_in: 'Sign in to claim a unique name',
    network:       'Could not reach the server — try again in a moment'
  };

  /**
   * claim_display_name() → one of:
   *   {action:'confirmed', name, canonical, renamed}
   *   {action:'taken'   , message}
   *   {action:'invalid' , reason, message}
   *   {action:'signedout'|'fail', message}
   *   {action:'unsupported'}            ← no migration yet; caller goes provisional
   */
  function reduceClaim(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    // Anything that is not the RPC's own {ok:boolean,…} envelope is a
    // refusal, never a confirmation. A 401 body has no `ok` field, and
    // treating one as success would hand a player a name they do not hold.
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: CLAIM_ERRORS.network };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'taken') return { action: 'taken', message: CLAIM_ERRORS.taken };
      if (err === 'invalid') {
        var r = out.reason || 'charset';
        return { action: 'invalid', reason: r, message: REASONS[r] || REASONS.charset };
      }
      if (err === 'not_signed_in') return { action: 'signedout', message: CLAIM_ERRORS.not_signed_in };
      return { action: 'fail', message: CLAIM_ERRORS.network };
    }
    if (!out.name) return { action: 'fail', message: CLAIM_ERRORS.network };
    return {
      action: 'confirmed',
      name: String(out.name),
      canonical: out.canonical ? String(out.canonical) : canon(out.name),
      renamed: !!out.renamed
    };
  }

  /**
   * hr_display_name_available() → {action:'available'|'taken'|'invalid'|'unsupported'|'unknown'}
   * Availability is UX ONLY. A green tick is never a reservation — the
   * claim is what decides, and it can still lose. The modal says so.
   */
  function reduceAvailability(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'unknown' };
    }
    if (out.ok === false) {
      var r = out.reason || 'charset';
      return { action: 'invalid', reason: r, message: REASONS[r] || REASONS.charset };
    }
    return {
      action: out.available ? 'available' : 'taken',
      mine: !!out.mine,
      name: out.name || '',
      canonical: out.canonical || ''
    };
  }

  /** Supabase Storage upload → {action:'accept'|'unsupported'|'too_large'|'bad_type'|'denied'|'fail'} */
  function reduceUpload(status, out) {
    // Success is checked FIRST. Every branch below matches on a message
    // substring, and a message-shaped success body must never be able to fall
    // into a failure branch and discard an upload that actually landed.
    if (status >= 200 && status < 300) return { action: 'accept' };
    var msg = '';
    if (out && typeof out === 'object') msg = String(out.message || out.error || '');
    if (status === 404 || /bucket not found/i.test(msg)) return { action: 'unsupported' };
    if (status === 413 || /maximum allowed size|payload too large|entity too large/i.test(msg)) {
      return { action: 'too_large', message: 'That portrait is too large' };
    }
    if (/mime type|not supported/i.test(msg)) {
      return { action: 'bad_type', message: 'That image type is not supported' };
    }
    if (status === 401 || status === 403) {
      return { action: 'denied', message: 'Sign in again to upload a portrait' };
    }
    return { action: 'fail', message: 'Upload failed — your portrait is saved on this device' };
  }

  // ════════════════════════════════════════════════════════════
  // 3 · THE LOCAL RECORD (storage seam, not the save)
  // ════════════════════════════════════════════════════════════
  // Deliberately NOT in G: the name is ACCOUNT-level (it matches
  // profiles.id = auth.uid(), which is what the leaderboard view already
  // reads), so it must survive a character switch — and a 512 KB avatar
  // dataURL inside a snapshot that uploads to game_saves every 60s would be
  // indefensible. HearthriseStorage is the platform seam; Steam and mobile
  // swap the backend there without this file changing.
  var rec = null;

  function blank() {
    return {
      v: 1, userId: null, name: '', canonical: '', status: null, at: 0,
      avatar: { data: null, remote: null, status: null, at: 0 }
    };
  }
  function store() { return window.HearthriseStorage || null; }
  function load() {
    if (rec) return rec;
    var s = store();
    var raw = null;
    try {
      raw = s ? s.getJSON(STORE_KEY, null)
              : JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (e) { raw = null; }
    rec = (raw && typeof raw === 'object') ? raw : blank();
    if (!rec.avatar || typeof rec.avatar !== 'object') rec.avatar = blank().avatar;
    return rec;
  }
  function persist() {
    var s = store();
    try {
      if (s) s.setJSON(STORE_KEY, rec);
      else localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    } catch (e) { /* private mode: the session still works, it just won't persist */ }
  }
  function _reset() { rec = blank(); }

  // ════════════════════════════════════════════════════════════
  // 4 · SESSION + TRANSPORT
  // ════════════════════════════════════════════════════════════
  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig &&
            window.HearthriseSupabase.getConfig()) || null;
  }
  /* ── b368: THE SIMULATED-IDENTITY HARNESS SEAM (TEST-ONLY) ──────────────
     Every automated pass this project has ever run plays SIGNED OUT. The
     account gate has a harness bypass, so the suite gets into the game — but it
     gets in as nobody: no user id, no display name, no portrait. That means no
     signed-in-only rendering path has ever been exercised automatically, which
     is exactly how the Fight screen shipped a champion plate that ignores the
     player's chosen avatar. A whole class of defect was invisible because the
     test player has no identity to render.

     `installHarnessIdentity()` produces the CLIENT-SIDE STATE a signed-in
     player has — a session object with a user id, a claimed display name, and a
     portrait already stored locally as a data URL — WITHOUT a real Supabase
     session and without touching the network. `avatar.data` is the "this
     device, instant" branch of `avatarUrl()`, so nothing is fetched and
     `hydrateRemoteAvatar()` correctly declines (a local copy always wins).

     GUARDED THE SAME WAY THE ACCOUNT WALL IS, and deliberately by DELEGATION to
     that same predicate rather than a second copy of the rule: an explicit
     global AND a non-player origin. On hearthrise.net this function cannot do
     anything, whatever anybody sets. It is a fake identity, never a fake
     credential — it grants no server access, because a simulated session has no
     token any server would accept. Surfaces that genuinely need the wire still
     stub the transport, exactly as the b337/b368 accrual tests do.

     FIDELITY LIMIT, stated plainly: this cannot exercise the real RPCs (name
     claim, avatar upload, profile reconcile). Full fidelity needs a dedicated
     test account in the project's own Supabase — recorded in DISCOVERIES for
     Tyler, and NOT something this seam pretends to provide. */
  var harnessSession = null;
  function harnessAllowed() {
    try {
      if (window.__HR_TEST_HARNESS__ !== true) return false;
      var g = window.HearthriseGate;
      if (g && typeof g.isHarnessContext === 'function') return g.isHarnessContext(window);
      return false;   // fail CLOSED: no gate module, no simulated identity
    } catch (e) { return false; }
  }
  function installHarnessIdentity(opts) {
    if (!harnessAllowed()) return null;
    var o = opts || {};
    var uid = o.userId || '00000000-0000-4000-8000-00000000cafe';
    harnessSession = {
      access_token: 'harness-not-a-credential',
      refresh_token: 'harness-not-a-credential',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: o.email || 'harness@localhost' }
    };
    load();
    rec.userId = uid;
    if (o.name) { rec.name = o.name; rec.canonical = canon(o.name); rec.status = 'claimed'; rec.at = Date.now(); }
    if (o.avatar) {
      rec.avatar = { data: o.avatar, remote: null, status: 'local', at: Date.now() };
    }
    persist();
    /* A SIMULATED IDENTITY MUST NOT TRIGGER REAL SERVER RECONCILIATION. `tick()`
       fires `hydrateRemoteAvatar` / `resolveServerName` / `reconcile` the first
       time it sees a NEW user id — three live Supabase reads that, against a
       simulated session, can only fail. (Measured: two unhandled `Failed to
       fetch` rejections, which the suite's own clean-log guard correctly reported
       as errors.) Adopting the id as already-seen is not a workaround, it is the
       seam's contract: it fabricates client STATE, never server access. Anything
       that genuinely needs the wire stubs the transport instead. The name prompt
       is likewise pre-answered so a fake identity can never open a modal over a
       test or a screenshot. */
    lastUser = uid;
    promptedThisSession = true;
    applyAvatar();
    return { userId: uid, avatar: avatarUrl(), name: rec.name };
  }
  function clearHarnessIdentity() {
    if (!harnessAllowed()) { harnessSession = null; return false; }
    harnessSession = null;
    _reset(); persist();
    lastUser = null; promptedThisSession = false;
    applyAvatar();
    return true;
  }

  function session() {
    if (harnessSession && harnessAllowed()) return harnessSession;
    return (window.HearthriseAuth && window.HearthriseAuth.getSession &&
            window.HearthriseAuth.getSession()) || null;
  }
  function userId() { var s = session(); return (s && s.user && s.user.id) || null; }
  function isSignedIn() { return !!(userId() && cfg()); }

  function headers(json) {
    var c = cfg(), s = session();
    var h = {
      apikey: c.anonKey,
      Authorization: 'Bearer ' + ((s && s.access_token) || c.anonKey)
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  // One probe per RPC. A NEGATIVE result expires after ten minutes so a
  // session that was open while the migration was applied starts using the
  // server path without a reload.
  var probe = {};
  function rpcMissing(n) {
    var p = probe[n];
    return !!(p && p.known === false && (Date.now() - p.at) < 600000);
  }
  function noteRpc(n, present) { probe[n] = { known: present, at: Date.now() }; }
  function _resetProbes() { probe = {}; }

  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body || {})
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json };
  }

  // ════════════════════════════════════════════════════════════
  // 5 · NAME: check + claim
  // ════════════════════════════════════════════════════════════
  async function checkAvailability(raw) {
    var v = validateName(raw);
    if (!v.ok) return { action: 'invalid', reason: v.reason, message: v.message };
    if (!isSignedIn() || rpcMissing('hr_display_name_available')) return { action: 'unsupported' };
    var r;
    try { r = await rpc('hr_display_name_available', { p_name: v.name }); }
    catch (e) { return { action: 'unknown' }; }
    var d = reduceAvailability(r.status, r.json);
    noteRpc('hr_display_name_available', d.action !== 'unsupported');
    return d;
  }

  /**
   * Claim `raw` for the signed-in account. Returns the reducer verdict,
   * with the local record already updated on success.
   * Anonymous / un-migrated → 'provisional' (kept locally, re-claimed later).
   */
  async function claimName(raw) {
    var v = validateName(raw);
    if (!v.ok) return { action: 'invalid', reason: v.reason, message: v.message };

    if (isSignedIn() && !rpcMissing('claim_display_name')) {
      var r;
      try { r = await rpc('claim_display_name', { p_name: v.name }); }
      catch (e) { return { action: 'fail', message: CLAIM_ERRORS.network }; }
      var d = reduceClaim(r.status, r.json);
      noteRpc('claim_display_name', d.action !== 'unsupported');
      if (d.action === 'confirmed') { adopt(d.name, d.canonical, 'confirmed'); return d; }
      if (d.action !== 'unsupported') return d;
      // 'unsupported' falls through: the migration is not applied yet.
    }
    // Degraded path. The name is real to this player and to this device, and
    // it is honestly labelled as not yet unique.
    adopt(v.name, v.canonical, 'provisional');
    return { action: 'provisional', name: v.name, canonical: v.canonical };
  }

  // Write the confirmed name everywhere the game already reads a name from.
  // Setting G.playerName too is deliberate: ~30 legacy call sites read it
  // directly, and one writer is far safer than thirty rewrites.
  function adopt(name, canonical, status) {
    load();
    rec.userId = userId();
    rec.name = name;
    rec.canonical = canonical || canon(name);
    rec.status = status;
    rec.at = Date.now();
    persist();
    try {
      if (window.G) {
        window.G.playerName = name;
        if (typeof window.saveLocal === 'function') window.saveLocal();
      }
    } catch (e) {}
    refreshUi();
    return rec;
  }

  /** The name to render. Confirmed/provisional beats G.playerName. */
  function displayName() {
    load();
    if (rec.name && (!rec.userId || rec.userId === userId() || !isSignedIn())) return rec.name;
    if (window.G && window.G.playerName) return window.G.playerName;
    var p = window.HearthriseProfile && window.HearthriseProfile.profile;
    if (p && p.displayName) return p.displayName;
    return 'Adventurer';
  }
  function nameStatus() {
    load();
    if (!rec.name) return 'none';
    if (isSignedIn() && rec.userId && rec.userId !== userId()) return 'none';
    return rec.status || 'provisional';
  }
  /** Anonymous play keeps a local name that is explicitly NOT unique. */
  function isUnique() { return nameStatus() === 'confirmed'; }

  // ════════════════════════════════════════════════════════════
  // 5b · THE SERVER IS THE SOURCE OF TRUTH FOR "DO I HAVE A NAME"
  // ════════════════════════════════════════════════════════════
  // b226 — the live bug this section exists to close.
  //
  // b221 answered "does this account have a name?" from the LOCAL record
  // alone. That record is only ever written by adopt(), i.e. by a claim this
  // browser performed. So every account whose name reached the server by any
  // OTHER route was, to this client, nameless — and was shown the
  // "Choose your name" modal for a name it already owned.
  //
  // That is not an edge case, it is the DEFAULT for the existing player base:
  // section 4 of the unique-names migration BACKFILLED display_names from
  // profiles.display_name, so every beta player holds a claim that no client
  // ever wrote a local record for. Same bug, same cause, on a second device or
  // after clearing site data.
  //
  // The read is one row, by primary-key-adjacent unique index, on a table with
  // `for select using (true)` — so the anon key is enough and it costs a single
  // small GET. It is memoised per user id, so it happens ONCE per session, not
  // per tick and not per render.
  //
  // The prompt decision is now: never ask from local ignorance. Until the
  // server has answered we say nothing; if it answers "no claim" we ask; if it
  // cannot be reached we still say nothing, because a missed prompt costs the
  // player one login (the Character screen also offers "Choose a name") while a
  // wrong prompt takes the game away and invites them to rename themselves.
  //
  // The deadline exists because "we are still asking" is a state other first-run
  // flows WAIT on (owedPrompt below), and a request that never settles must not
  // hold the welcome sheet hostage forever. After it, an unresolved read counts
  // as an answer we do not have — which means silence, not a prompt.
  var SERVER_NAME_DEADLINE_MS = 15000;
  var srv = { uid: null, state: 'idle', answer: null, promise: null, at: 0 };
  function _resetServerName() { srv = { uid: null, state: 'idle', answer: null, promise: null, at: 0 }; }

  /**
   * PURE. What a `display_names?user_id=eq.<uid>` response means. Same shape
   * as reduceClaim/reduceAvailability above, for the same reason: the decision
   * that matters is testable without a network.
   *
   * 'none' is a DEFINITE answer — including a 404 on the table itself, because
   * no namespace means no claims, which is exactly the pre-migration state the
   * provisional path was built for. 'unknown' means we could not ask, and is
   * never grounds for a prompt.
   * @returns {{action:'found',name,canonical}|{action:'none'}|{action:'unknown'}}
   */
  function reduceServerName(status, json) {
    if (status === 404 || (json && !Array.isArray(json) &&
        (json.code === 'PGRST205' || json.code === 'PGRST202' || json.code === '42P01'))) {
      return { action: 'none' };
    }
    if (status < 200 || status >= 300 || !Array.isArray(json)) return { action: 'unknown' };
    var row = json[0];
    if (!row || !row.name) return { action: 'none' };
    return {
      action: 'found',
      name: String(row.name),
      canonical: row.canonical ? String(row.canonical) : canon(row.name)
    };
  }

  /** One read: does `uid` already hold a claimed name? */
  async function fetchServerName(uid) {
    var c = cfg();
    if (!c || !uid) return { action: 'unknown' };
    var res, json = null;
    try {
      res = await fetch(c.url + '/rest/v1/display_names?select=name,canonical&user_id=eq.' +
                        encodeURIComponent(uid) + '&limit=1',
                        { method: 'GET', headers: headers(false) });
      try { json = await res.json(); } catch (e) { json = null; }
    } catch (e) {
      return { action: 'unknown' };
    }
    return reduceServerName(res.status, json);
  }

  /**
   * Adopt a server-held name into the local record. Pure policy, exported for
   * the suite — the three cases it has to get right:
   *   • no local name for this account  → adopt (this is the b226 fix)
   *   • a local PROVISIONAL name        → leave it; the player chose it and
   *                                       reconcile() is already claiming it.
   *                                       Overwriting would silently discard a
   *                                       rename the player asked for.
   *   • a local CONFIRMED name that differs → the server wins (another device
   *                                       renamed this account)
   * @returns {boolean} whether the local record should be rewritten
   */
  function shouldAdoptServerName(record, uid, found) {
    if (!found || !found.name) return false;
    if (!record || !record.name) return true;
    if (record.userId && record.userId !== uid) return true;     // stale record
    if (record.status !== 'confirmed') return false;             // provisional wins
    return record.canonical !== found.canonical || record.name !== found.name;
  }

  /** Settle the answer for `uid` and adopt a found name. Synchronous. */
  function applyServerName(uid, d) {
    if (!uid) return d;
    if (srv.uid !== uid) srv = { uid: uid, state: 'pending', answer: null, promise: srv.promise, at: Date.now() };
    srv.state = 'done';
    srv.answer = d;
    if (d && d.action === 'found') {
      load();
      if (shouldAdoptServerName(rec, uid, d)) adopt(d.name, d.canonical, 'confirmed');
    }
    return d;
  }

  /** Memoised: one in-flight read per account, not one per tick. */
  function resolveServerName() {
    var uid = userId();
    if (!uid) return Promise.resolve({ action: 'unknown' });
    if (srv.uid === uid && srv.promise) return srv.promise;
    srv = { uid: uid, state: 'pending', answer: null, promise: null, at: Date.now() };
    var p = fetchServerName(uid)
      .catch(function () { return { action: 'unknown' }; })
      // A response that arrives after the account changed is stale: it must not
      // settle the new account's answer, and above all must not adopt the old
      // account's name onto it.
      .then(function (d) { return srv.uid === uid ? applyServerName(uid, d) : d; });
    srv.promise = p;
    return p;
  }

  /** The settled answer for the CURRENT account, or null while we do not know. */
  function serverAnswer() {
    var uid = userId();
    if (!uid || srv.uid !== uid || srv.state !== 'done') return null;
    return srv.answer;
  }

  /** Are we still waiting to find out? Bounded — see SERVER_NAME_DEADLINE_MS. */
  function serverPending() {
    var uid = userId();
    if (!uid || srv.uid !== uid || srv.state !== 'pending') return false;
    return (Date.now() - (srv.at || 0)) < SERVER_NAME_DEADLINE_MS;
  }

  // "Must we PROMPT this player?" — uniqueness is a signed-in feature, and a
  // PROVISIONAL name is already a finished choice: the player picked it, so
  // they are never asked twice. It re-claims silently instead (reconcile()).
  //
  // b226: the remaining case — "this device does not know this account's name"
  // — is no longer decided here. It is decided by the server (above). A device
  // that has never seen the account is IGNORANT, not authoritative, and b221
  // treated the two as the same thing.
  function mustPrompt() {
    if (!isSignedIn()) return false;
    load();
    var mine = !rec.userId || rec.userId === userId();
    if (mine && rec.name) return false;
    var d = serverAnswer();
    return !!(d && d.action === 'none');
  }

  // "Are we still OWED a prompt right now?" — the question other first-run
  // flows need. It goes false once we have asked (including after "Not now"),
  // so post-signup-welcome.js can wait its turn without waiting forever.
  //
  // b226: it must also be true while the SERVER READ IS STILL IN FLIGHT.
  // mustPrompt() is deliberately strict — it only says yes to a definite "this
  // account holds no name" — but "we have not found out yet" is exactly the
  // state in which the welcome sheet must keep waiting, or it opens in the gap
  // and the name modal lands on top of it a moment later. The deadline keeps
  // that wait bounded, so a hung request can never suppress the sheet forever.
  function owedPrompt() { return !promptedThisSession && (mustPrompt() || serverPending()); }

  /**
   * Re-claim a provisional name once the RPC exists. Silent by design: the
   * player already made this choice and must not be asked twice. If the
   * name was taken in the meantime they are prompted — once — to pick
   * another, because that is the only honest outcome.
   */
  async function reconcile() {
    load();
    if (!isSignedIn()) return { action: 'skip' };
    if (rec.userId && rec.userId !== userId()) return { action: 'skip' };
    if (!rec.name || rec.status === 'confirmed') return { action: 'skip' };
    if (rpcMissing('claim_display_name')) return { action: 'skip' };
    var d = await claimName(rec.name);
    if (d.action === 'taken') {
      openNameModal({ taken: rec.name });
    }
    return d;
  }

  // ════════════════════════════════════════════════════════════
  // 6 · AVATAR: the pipeline
  // ════════════════════════════════════════════════════════════
  // Pure-ish and directly unit-tested: hand it anything drawable (Image,
  // ImageBitmap, canvas) and it returns a square 256x256 re-encode under the
  // hard cap. Nothing about the original file survives except its pixels.
  function b64Bytes(dataUrl) {
    var i = String(dataUrl).indexOf(',');
    if (i < 0) return 0;
    var b64 = dataUrl.slice(i + 1);
    var pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    var bin = atob(parts[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /**
   * @param {CanvasImageSource & {width:number,height:number}} src
   * @returns {{dataUrl,blob,width,height,bytes,type}}
   */
  function processImage(src, opts) {
    opts = opts || {};
    var px = opts.px || AVATAR_PX;
    var maxBytes = opts.maxBytes || AVATAR_MAX_BYTES;
    var sw = src.width || src.naturalWidth || 0;
    var sh = src.height || src.naturalHeight || 0;
    if (!sw || !sh) throw new Error('That file is not an image we can read');

    // Centre-crop to a square first, THEN scale. Cropping after scaling
    // would squash a portrait, which is the one thing a portrait must not do.
    var side = Math.min(sw, sh);
    var sx = Math.floor((sw - side) / 2);
    var sy = Math.floor((sh - side) / 2);

    var cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.drawImage(src, sx, sy, side, side, 0, 0, px, px);

    // Step the quality down until it fits. webp where available, jpeg
    // otherwise — never png, which would blow the cap on a photograph.
    var dataUrl = '', type = '', bytes = 0;
    var formats = ['image/webp', 'image/jpeg'];
    for (var f = 0; f < formats.length; f++) {
      for (var q = 0; q < AVATAR_QUALITY.length; q++) {
        var url = cv.toDataURL(formats[f], AVATAR_QUALITY[q]);
        // A canvas that cannot encode webp silently returns image/png.
        if (url.indexOf('data:' + formats[f]) !== 0) break;
        dataUrl = url; type = formats[f]; bytes = b64Bytes(url);
        if (bytes <= maxBytes) {
          return { dataUrl: dataUrl, blob: dataUrlToBlob(dataUrl),
                   width: px, height: px, bytes: bytes, type: type };
        }
      }
    }
    if (!dataUrl) {           // neither webp nor jpeg encoded — very old engine
      dataUrl = cv.toDataURL('image/png');
      type = 'image/png';
      bytes = b64Bytes(dataUrl);
    }
    if (bytes > maxBytes) throw new Error('Could not compress that image under 512 KB');
    return { dataUrl: dataUrl, blob: dataUrlToBlob(dataUrl),
             width: px, height: px, bytes: bytes, type: type };
  }

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file chosen')); return; }
      if (AVATAR_TYPES.indexOf(file.type) === -1) {
        reject(new Error('Use a PNG, JPG or WEBP image')); return;
      }
      // Refuse to DECODE something enormous. Decoding is the expensive,
      // memory-unbounded step, so the guard belongs before it, not after.
      if (file.size > AVATAR_RAW_MAX) {
        reject(new Error('That file is over 16 MB — pick a smaller image')); return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That image could not be read')); };
      img.src = url;
    });
  }

  function avatarPath(uid) { return 'avatars/' + uid + '/avatar.webp'; }
  function avatarPublicUrl(uid, v) {
    var c = cfg();
    if (!c || !uid) return null;
    return c.url + '/storage/v1/object/public/' + avatarPath(uid) + (v ? ('?v=' + v) : '');
  }

  async function uploadAvatar(blob) {
    var uid = userId();
    if (!uid || !cfg()) return { action: 'unsupported' };
    if (rpcMissing('storage:avatars')) return { action: 'unsupported' };
    var h = headers(false);
    h['Content-Type'] = blob.type || 'image/webp';
    h['x-upsert'] = 'true';
    h['cache-control'] = 'max-age=60';
    var res, json = null;
    try {
      res = await fetch(cfg().url + '/storage/v1/object/' + avatarPath(uid),
                        { method: 'POST', headers: h, body: blob });
      try { json = await res.json(); } catch (e) { json = null; }
    } catch (e) {
      return { action: 'fail', message: 'Could not reach the server — your portrait is saved on this device' };
    }
    var d = reduceUpload(res.status, json);
    noteRpc('storage:avatars', d.action !== 'unsupported');
    return d;
  }

  /**
   * The whole player-facing flow: process → keep locally → try to upload.
   * The LOCAL copy is written first and unconditionally, so an upload
   * failure costs the player nothing they can see.
   */
  // b360: the ONE persist+upload path, shared by uploads and prefab picks. A
  // prefab is fetched, drawn to the same canvas and re-encoded exactly like an
  // upload, so nothing downstream can tell the two apart — which is precisely
  // why a prefab choice syncs across devices with no new code.
  async function setAvatarFromImage(img) {
    var out = processImage(img);
    load();
    rec.avatar.data = out.dataUrl;
    rec.avatar.at = Date.now();
    rec.avatar.status = 'local';
    persist();
    applyAvatar();

    if (!isSignedIn()) return { action: 'local', bytes: out.bytes, type: out.type };

    var d = await uploadAvatar(out.blob);
    if (d.action === 'accept') {
      rec.avatar.remote = avatarPublicUrl(userId(), rec.avatar.at);
      rec.avatar.status = 'synced';
      persist();
      return { action: 'synced', bytes: out.bytes, type: out.type };
    }
    rec.avatar.status = 'local';
    persist();
    return { action: d.action === 'unsupported' ? 'local' : 'partial',
             bytes: out.bytes, type: out.type, message: d.message };
  }

  async function setAvatarFromFile(file) {
    var img = await fileToImage(file);
    return setAvatarFromImage(img);
  }

  // Load a bundled prefab portrait. Same-origin on the deploy, so the canvas
  // processImage draws onto stays untainted and toDataURL succeeds; a move to a
  // cross-origin CDN would need CORS headers, and until then a taint would
  // surface as a caught "could not set" rather than a silent blank.
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That portrait could not be loaded')); };
      img.src = src;
    });
  }
  async function setAvatarFromPrefab(id) {
    var p = prefabById(id);
    if (!p) throw new Error('Unknown portrait');
    var img = await loadImage(p.src);
    return setAvatarFromImage(img);
  }

  function clearAvatar() {
    load();
    rec.avatar = blank().avatar;
    persist();
    applyAvatar();
  }

  // ── Rendering: never a broken image ─────────────────────────
  // window._playerAvatar is the seam the topbar, the character page and the
  // home dashboard already read at render time, so writing it once updates
  // every portrait in the game. A REMOTE url is only promoted into it after
  // it has actually loaded — an avatars bucket that 404s must look like
  // "no portrait yet", never like a broken game.
  function preload(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(false); return; }
      var i = new Image();
      i.onload = function () { resolve(true); };
      i.onerror = function () { resolve(false); };
      i.src = url;
    });
  }

  function avatarUrl() {
    load();
    if (rec.avatar && rec.avatar.data) return rec.avatar.data;      // this device, instant
    if (rec.avatar && rec.avatar.remote) return rec.avatar.remote;  // already verified
    return DEFAULT_AVATAR;
  }

  function applyAvatar() {
    window._playerAvatar = avatarUrl();
    refreshUi();
  }

  // Signed in on a device that has never seen this portrait: fetch it, and
  // only adopt it once the browser confirms it decodes.
  async function hydrateRemoteAvatar() {
    load();
    if (!isSignedIn()) return false;
    if (rec.avatar && rec.avatar.data) return false;     // local copy already wins
    var url = avatarPublicUrl(userId(), rec.avatar && rec.avatar.at ? rec.avatar.at : '');
    if (!url) return false;
    var ok = await preload(url);
    if (!ok) return false;
    rec.avatar.remote = url;
    rec.avatar.status = 'synced';
    persist();
    applyAvatar();
    return true;
  }

  function refreshUi() {
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
    try { if (typeof window.renderCharacter === 'function') window.renderCharacter(); } catch (e) {}
    try {
      var pa = document.querySelector('.player-avatar img');
      if (pa) {
        // Clear the markup's one-shot fallback latch, or a portrait that
        // failed once can never be replaced by a good one.
        delete pa.dataset.fellBack;
        pa.src = window._playerAvatar || DEFAULT_AVATAR;
        pa.style.display = 'block';
      }
    } catch (e) {}
    try { decorateTopbarAvatar(); } catch (e) {}
  }

  // b229: the topbar portrait, same rule as the Character page — click (or
  // Enter/Space when focused) opens the SAME upload flow. `.player-avatar`
  // is a static node from index.html (only its <img src> is ever swapped,
  // never the container), so this wires once and is safe to call again on
  // every avatar change — it just refreshes the tooltip label.
  var topbarAvatarWired = false;
  function decorateTopbarAvatar() {
    var el = document.querySelector('.player-avatar');
    if (!el) return;
    el.title = avatarIsCustom() ? 'Change portrait' : 'Upload portrait';
    if (topbarAvatarWired) return;
    topbarAvatarWired = true;
    ensureStyle();
    el.classList.add('hr-id-clickable');
    el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      openAvatarPicker();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAvatarPicker();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // 7 · PRESENTATION
  // ════════════════════════════════════════════════════════════
  // Styles are injected by this module rather than added to a shared sheet:
  // three stylesheets already fight each other on specificity in this repo,
  // and a self-contained feature has no business making that worse.
  var STYLE_ID = 'hr-identity-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.hr-id-scrim{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.78);',
      '  backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-id-wrap{background:var(--surface-2,#221b14);border:1px solid var(--line,rgba(255,255,255,.12));',
      '  border-radius:14px;max-width:460px;width:100%;padding:22px;',
      '  box-shadow:0 24px 60px -20px rgba(0,0,0,.9)}',
      '.hr-id-wrap h3{margin:0 0 4px;font-family:var(--f-display,inherit);font-size:calc(22px * var(--ui-scale, 1));color:var(--ink,#efe6d6)}',
      '.hr-id-lead{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a2968a);line-height:1.5;margin:0 0 14px}',
      '.hr-id-field{display:flex;gap:8px;align-items:stretch}',
      '.hr-id-field input{flex:1;padding:9px 12px;font-size:calc(16px * var(--ui-scale, 1));font-weight:700;letter-spacing:.01em;',
      '  color:var(--ink,#efe6d6);background:rgba(0,0,0,.30);border:1px solid var(--line,rgba(255,255,255,.14));',
      '  border-radius:8px;font-family:inherit;min-width:0}',
      '.hr-id-field input:focus{outline:none;border-color:var(--gold-2,#c9a24a)}',
      '.hr-id-note{min-height:17px;font-size:calc(14.5px * var(--ui-scale, 1));margin:8px 2px 0;line-height:1.35}',
      '.hr-id-note[data-tone="ok"]{color:var(--gold-2,#c9a24a)}',
      '.hr-id-note[data-tone="bad"]{color:#d98b7a}',
      '.hr-id-note[data-tone="muted"]{color:var(--ink-3,#a2968a)}',
      '.hr-id-rules{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a2968a);margin:10px 2px 0;line-height:1.5}',
      '.hr-id-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}',
      '.hr-id-row .btn{flex:0 0 auto}',
      /* b229: the portrait ITSELF is a click/keyboard target — topbar avatar
         and Character-page hero portrait alike. Ring, not a filled state:
         readable on both the dark topbar chip and the gilt hero frame
         without fighting either one's own border.
         Specificity note: src/styles/art-direction.css sets a baseline
         `body[data-theme] .player-avatar` box-shadow at (0,2,1) — one
         selector heavier than a bare `.hr-id-clickable:hover` (0,2,0), so
         the generic rule silently lost on the topbar (confirmed by
         computed-style check in browser verification: hover produced the
         SAME box-shadow as idle). Pairing the class with each host
         selector below wins the cascade outright, on both surfaces. */
      '.hr-id-clickable{cursor:pointer;transition:box-shadow .15s ease}',
      '.player-avatar.hr-id-clickable:hover,.cr-hero-portrait.hr-id-clickable:hover,',
      '.player-avatar.hr-id-clickable:focus-visible,.cr-hero-portrait.hr-id-clickable:focus-visible{',
      '  outline:none;box-shadow:0 0 0 2px var(--bg-1,#17140f),0 0 0 4px var(--gold-2,#e3c77e)}',
      /* the character-page portrait becomes an upload target */
      '.cr-hero-portrait{position:relative}',
      '.hr-id-upload{position:absolute;left:0;right:0;bottom:0;border:0;width:100%;',
      '  padding:5px 4px;font:inherit;font-size:calc(14.5px * var(--ui-scale, 1));font-weight:800;letter-spacing:.09em;',
      '  text-transform:uppercase;color:var(--ink,#efe6d6);background:rgba(0,0,0,.66);',
      '  cursor:pointer;text-align:center;line-height:1.2}',
      '.hr-id-upload:hover{background:rgba(0,0,0,.82);color:var(--gold-2,#c9a24a)}',
      '.hr-id-upload:disabled{cursor:progress;opacity:.7}',
      '.hr-id-namebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}',
      '.hr-id-badge{font-size:calc(14.5px * var(--ui-scale, 1));font-weight:800;letter-spacing:.08em;text-transform:uppercase;',
      '  padding:2px 7px;border-radius:99px;border:1px solid var(--line,rgba(255,255,255,.14));',
      '  color:var(--ink-3,#a2968a)}',
      '.hr-id-badge[data-tone="ok"]{color:var(--gold-2,#c9a24a);border-color:rgba(201,162,74,.5)}',
      '.hr-id-link{background:none;border:0;padding:0;font:inherit;font-size:calc(14.5px * var(--ui-scale, 1));',
      '  color:var(--ink-3,#a2968a);text-decoration:underline;cursor:pointer}',
      '.hr-id-link:hover{color:var(--gold-2,#c9a24a)}',
      /* b360: the prefab portrait picker. Tokens only, same palette as the name
         modal. The grid is auto-fill so it stays square and reflows on a phone
         instead of overflowing a fixed column count. */
      '.hr-id-wrap-wide{max-width:560px}',
      '.hr-id-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px;margin:4px 0 2px}',
      '.hr-id-tile{position:relative;padding:0;overflow:hidden;cursor:pointer;aspect-ratio:1/1;',
      '  border:1px solid var(--line,rgba(255,255,255,.14));background:rgba(0,0,0,.28);border-radius:10px;',
      '  transition:box-shadow .15s ease,border-color .15s ease}',
      '.hr-id-tile img{width:100%;height:100%;object-fit:cover;display:block}',
      '.hr-id-tile:hover,.hr-id-tile:focus-visible{outline:none;border-color:var(--gold-2,#c9a24a);',
      '  box-shadow:0 0 0 2px var(--bg-1,#17140f),0 0 0 4px var(--gold-2,#e3c77e)}',
      '.hr-id-tile:disabled{cursor:progress;opacity:.55}',
      '.hr-id-pick-foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px}',
      '.hr-id-pick-foot .btn{flex:0 0 auto}',
      '.hr-id-pick-spacer{flex:1 1 auto}'
    ].join('');
    document.head.appendChild(s);
  }

  function closeModal() {
    var m = document.querySelector('.hr-id-scrim');
    if (m) m.remove();
  }

  var promptedThisSession = false;

  /**
   * The name-choice modal. Every player-supplied string reaches the DOM via
   * textContent — b214 shipped a stored-XSS hole by putting a player name
   * into innerHTML, and a name modal is exactly where that lesson applies.
   */
  function openNameModal(opts) {
    opts = opts || {};
    ensureStyle();
    closeModal();
    load();

    var renaming = !!rec.name && !opts.taken;
    var scrim = document.createElement('div');
    scrim.className = 'hr-id-scrim';
    var wrap = document.createElement('div');
    wrap.className = 'hr-id-wrap';

    var h = document.createElement('h3');
    h.textContent = renaming ? 'Change your name' : 'Choose your name';
    wrap.appendChild(h);

    var lead = document.createElement('p');
    lead.className = 'hr-id-lead';
    if (opts.taken) {
      lead.textContent = 'Someone claimed ' + opts.taken + ' first. Pick another name — ' +
        'this one will be yours alone.';
    } else if (!isSignedIn()) {
      lead.textContent = 'You are playing offline, so this name is yours on this device only. ' +
        'Sign in to claim a name nobody else in the realm can use.';
    } else {
      lead.textContent = 'This is how the realm will know you — in chat, on the market and on ' +
        'the leaderboards. No two adventurers can share a name.';
    }
    wrap.appendChild(lead);

    var field = document.createElement('div');
    field.className = 'hr-id-field';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Your name';
    input.value = opts.taken ? '' : (rec.name || (window.G && window.G.playerName) || '');
    if (input.value === 'Adventurer') input.value = '';
    field.appendChild(input);
    wrap.appendChild(field);

    var note = document.createElement('div');
    note.className = 'hr-id-note';
    note.setAttribute('data-tone', 'muted');
    wrap.appendChild(note);

    var rules = document.createElement('div');
    rules.className = 'hr-id-rules';
    rules.textContent = MIN_LEN + '–' + MAX_LEN + ' characters. Letters, numbers, spaces and ' +
      '_ ’ . - are allowed. Capitalisation is yours to choose, but it does not make a ' +
      'name different: Sir_Bob and sir bob are the same name.';
    wrap.appendChild(rules);

    var row = document.createElement('div');
    row.className = 'hr-id-row';
    var confirm = document.createElement('button');
    confirm.className = 'btn btn-primary btn-sm';
    confirm.type = 'button';
    confirm.textContent = renaming ? 'Save name' : 'Claim this name';
    confirm.disabled = true;
    row.appendChild(confirm);

    var later = document.createElement('button');
    later.className = 'btn btn-sm';
    later.type = 'button';
    later.textContent = renaming ? 'Cancel' : 'Not now';
    row.appendChild(later);
    wrap.appendChild(row);

    scrim.appendChild(wrap);
    document.body.appendChild(scrim);
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 40);

    function say(text, tone) {
      note.textContent = text || '';
      note.setAttribute('data-tone', tone || 'muted');
    }

    // Availability is checked live but is NEVER a reservation — between the
    // tick and the claim someone else can win, and the claim is the only
    // thing that decides. The copy never promises more than that.
    var timer = null, seq = 0;
    function onInput() {
      var raw = input.value;
      var v = validateName(raw);
      confirm.disabled = !v.ok;
      if (timer) { clearTimeout(timer); timer = null; }
      if (!v.ok) { say(raw ? v.message : '', 'bad'); return; }
      if (!isSignedIn()) { say('Local name — offline play', 'muted'); return; }
      say('Checking…', 'muted');
      var mine = ++seq;
      timer = setTimeout(function () {
        checkAvailability(raw).then(function (d) {
          if (mine !== seq) return;                       // a newer keystroke won
          if (d.action === 'available') say(d.mine ? 'This is already your name' : v.name + ' is available', 'ok');
          else if (d.action === 'taken') { say(v.name + ' is taken', 'bad'); }
          else if (d.action === 'invalid') { say(d.message, 'bad'); confirm.disabled = true; }
          else if (d.action === 'unsupported') say('Name checking is offline — you can still claim it', 'muted');
          else say('', 'muted');
        }).catch(function () { if (mine === seq) say('', 'muted'); });
      }, 350);
    }
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !confirm.disabled) { e.preventDefault(); submit(); }
    });
    onInput();

    function submit() {
      confirm.disabled = true;
      say('Claiming…', 'muted');
      claimName(input.value).then(function (d) {
        if (d.action === 'confirmed') {
          closeModal();
          toast('You are known as ' + d.name + ' throughout the realm.', 'levelup');
          return;
        }
        if (d.action === 'provisional') {
          closeModal();
          toast(isSignedIn()
            ? 'Name set to ' + d.name + '. It will be reserved as soon as the realm’s registry is reachable.'
            : 'Name set to ' + d.name + ' on this device. Sign in to claim it for good.', 'info');
          return;
        }
        say(d.message || 'That name could not be claimed', 'bad');
        confirm.disabled = false;
        if (d.action === 'taken') { try { input.select(); } catch (e) {} }
      }).catch(function () {
        say(CLAIM_ERRORS.network, 'bad');
        confirm.disabled = false;
      });
    }
    confirm.addEventListener('click', submit);

    later.addEventListener('click', function () {
      closeModal();
      // Deliberately NOT persisted: "not now" defers to the NEXT login, it
      // does not opt out forever. Blocking play outright would be hostile,
      // and would brick a session if the registry were unreachable.
      if (!renaming) promptedThisSession = true;
    });
    // No scrim-to-close and no Escape on the first-run prompt: the player is
    // being DIRECTED here, and a stray click should not skip it silently.
    if (renaming) {
      scrim.addEventListener('click', function (e) { if (e.target === scrim) closeModal(); });
    }
    return scrim;
  }

  function toast(msg, kind) {
    if (typeof window.notify === 'function') window.notify(msg, kind || 'info');
  }

  // ── The character-screen affordance ─────────────────────────
  // Injected rather than templated into character-page.js so the two files
  // do not have to agree on markup: the page re-renders freely and this
  // re-attaches. One hidden file input, reused.
  var fileInput = null;
  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = AVATAR_TYPES.join(',');
    fileInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) handleUpload(f);
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }

  // b229 (Tyler): "clicking on the icon should give me the opportunity to
  // upload an avatar" — the portrait itself is the affordance, on the
  // Character page AND the topbar, and both call ONE trigger rather than each
  // reimplementing it. b360: that trigger now opens the PICKER (prefab grid +
  // upload), not the raw file dialog. openUploadDialog() is the old behaviour,
  // reached from the picker's "Upload your own…" affordance.
  function openUploadDialog() {
    if (uploading) return;
    ensureFileInput().click();
  }

  // b360 — the prefab picker modal. Same scrim/wrap chrome and token colours as
  // the name modal (openNameModal): one visual language, tokens only. This is a
  // USER-INVOKED chooser, not the directed first-run prompt, so it closes on
  // scrim-click, Escape and Cancel.
  function openAvatarPicker() {
    ensureStyle();
    closeModal();

    var scrim = document.createElement('div');
    scrim.className = 'hr-id-scrim';
    var wrap = document.createElement('div');
    wrap.className = 'hr-id-wrap hr-id-wrap-wide';

    var h = document.createElement('h3');
    h.textContent = 'Choose your portrait';
    wrap.appendChild(h);

    var lead = document.createElement('p');
    lead.className = 'hr-id-lead';
    lead.textContent = isSignedIn()
      ? 'Pick a face for your adventurer — it follows you to every device. Or upload your own.'
      : 'Pick a face for your adventurer, or upload your own. Sign in to carry it across devices.';
    wrap.appendChild(lead);

    var grid = document.createElement('div');
    grid.className = 'hr-id-grid';
    PREFABS.forEach(function (p) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'hr-id-tile';
      tile.title = p.name;
      tile.setAttribute('aria-label', 'Choose the ' + p.name + ' portrait');
      var img = document.createElement('img');
      img.alt = '';
      // Eager, not lazy: ten ~13 KB webps total, and lazy leaves tiles blank
      // below the fold on a short screen until the grid is scrolled.
      img.src = p.src;
      tile.appendChild(img);
      // The name lives on title + aria-label, not a baked-in caption: a caption
      // small enough to fit an 84px tile would fall under the 14.5px readability
      // floor (b227), and a portrait picker reads fine by face alone.
      tile.addEventListener('click', function () { choosePrefab(p.id, scrim); });
      grid.appendChild(tile);
    });
    wrap.appendChild(grid);

    var note = document.createElement('div');
    note.className = 'hr-id-note';
    note.setAttribute('data-tone', 'muted');
    wrap.appendChild(note);

    var foot = document.createElement('div');
    foot.className = 'hr-id-pick-foot';
    var upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'btn btn-sm';
    upload.textContent = 'Upload your own…';
    upload.addEventListener('click', function () { closeModal(); openUploadDialog(); });
    foot.appendChild(upload);
    var spacer = document.createElement('span');
    spacer.className = 'hr-id-pick-spacer';
    foot.appendChild(spacer);
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-sm';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { closeModal(); });
    foot.appendChild(cancel);
    wrap.appendChild(foot);

    scrim.appendChild(wrap);
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeModal(); });
    function onKey(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);
    return scrim;
  }

  // Selecting a prefab runs the SAME pipeline as an upload — process, persist,
  // upload — so it is a portrait, not a preset, and syncs cross-device. Guarded
  // by the same `uploading` latch so a pick and an upload cannot race.
  function choosePrefab(id, scrim) {
    if (uploading) return;
    uploading = true;
    var note = scrim && scrim.querySelector('.hr-id-note');
    var tiles = scrim ? scrim.querySelectorAll('.hr-id-tile') : [];
    if (note) { note.textContent = 'Setting your portrait…'; note.setAttribute('data-tone', 'muted'); }
    Array.prototype.forEach.call(tiles, function (t) { t.disabled = true; });
    setAvatarFromPrefab(id).then(function (d) {
      if (d.action === 'synced') toast('Portrait set — it will follow you to every device.', 'levelup');
      else if (d.action === 'local') toast(isSignedIn()
        ? 'Portrait set on this device. It will sync once portrait storage is live.'
        : 'Portrait set on this device.', 'info');
      else toast(d.message || 'Portrait set on this device.', 'info');
      closeModal();
    }).catch(function (e) {
      if (note) { note.textContent = (e && e.message) || 'That portrait could not be set.'; note.setAttribute('data-tone', 'bad'); }
      Array.prototype.forEach.call(tiles, function (t) { t.disabled = false; });
    }).then(function () {
      uploading = false;
      try { decorateCharacterPage(); } catch (e) {}
    });
  }

  var uploading = false;
  function handleUpload(file) {
    if (uploading) return;
    uploading = true;
    setUploadLabel('Working…', true);
    setAvatarFromFile(file).then(function (d) {
      if (d.action === 'synced') toast('Portrait updated — it will follow you to every device.', 'levelup');
      else if (d.action === 'local') toast(isSignedIn()
        ? 'Portrait updated on this device. It will sync once portrait storage is live.'
        : 'Portrait updated on this device.', 'info');
      else toast(d.message || 'Portrait saved on this device.', 'info');
    }).catch(function (e) {
      toast((e && e.message) || 'That image could not be used.', 'kill');
    }).then(function () {
      uploading = false;
      setUploadLabel(null, false);
      decorateCharacterPage();
    });
  }
  function setUploadLabel(text, busy) {
    var b = document.querySelector('.hr-id-upload');
    if (!b) return;
    b.textContent = text || (avatarIsCustom() ? 'Change portrait' : 'Upload portrait');
    b.disabled = !!busy;
  }
  function avatarIsCustom() {
    load();
    return !!(rec.avatar && (rec.avatar.data || rec.avatar.remote));
  }

  /**
   * Attach the portrait uploader + the name row to the character screen.
   * Idempotent, and safe to call after every re-render.
   */
  function decorateCharacterPage() {
    var portrait = document.querySelector('#panel-character .cr-hero-portrait');
    if (!portrait) return;
    ensureStyle();
    var btn = portrait.querySelector('.hr-id-upload');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hr-id-upload';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openAvatarPicker();
      });
      portrait.appendChild(btn);
    }
    btn.textContent = uploading ? 'Working…' : (avatarIsCustom() ? 'Change portrait' : 'Upload portrait');
    btn.disabled = uploading;
    btn.title = 'PNG, JPG or WEBP. Cropped square to ' + AVATAR_PX + '×' + AVATAR_PX + '.';

    // b229: the AVATAR ITSELF is the affordance, not just the label bar
    // pinned to its bottom edge — the whole portrait is a clickable,
    // keyboard-reachable target that opens the same upload flow. renderCharacter()
    // rebuilds this element from scratch on every render (buildHeroCard()),
    // so it is normally a fresh node with no listeners yet; the data attribute
    // guards the one case where decorateCharacterPage() re-runs on the SAME
    // node (a completed upload, with no intervening re-render).
    if (!portrait.hasAttribute('data-hr-clickable')) {
      portrait.setAttribute('data-hr-clickable', '1');
      portrait.classList.add('hr-id-clickable');
      portrait.setAttribute('role', 'button');
      if (!portrait.hasAttribute('tabindex')) portrait.setAttribute('tabindex', '0');
      // The bottom-bar button already stopPropagation()s its own click, so
      // this cannot double-open the file picker when the button is hit.
      portrait.addEventListener('click', function () { openAvatarPicker(); });
      portrait.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAvatarPicker();
        }
      });
    }
    portrait.title = avatarIsCustom() ? 'Change portrait' : 'Upload portrait';

    // The name row, under the hero name: what your name IS, and whether it
    // is actually yours. A provisional name that pretended to be unique
    // would be the fake this project's directive forbids.
    var idBox = document.querySelector('#panel-character .cr-hero-id');
    if (!idBox) return;
    var bar = idBox.querySelector('.hr-id-namebar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'hr-id-namebar';
      var nameEl = idBox.querySelector('.cr-name');
      if (nameEl && nameEl.nextSibling) idBox.insertBefore(bar, nameEl.nextSibling);
      else idBox.appendChild(bar);
    }
    while (bar.firstChild) bar.removeChild(bar.firstChild);

    var st = nameStatus();
    var badge = document.createElement('span');
    badge.className = 'hr-id-badge';
    if (st === 'confirmed') { badge.textContent = 'Unique name'; badge.setAttribute('data-tone', 'ok'); }
    else if (st === 'provisional') badge.textContent = isSignedIn() ? 'Reserving…' : 'This device only';
    else badge.textContent = isSignedIn() ? 'Name not claimed' : 'Offline name';
    bar.appendChild(badge);

    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'hr-id-link';
    link.textContent = st === 'none' ? 'Choose a name' : 'Change name';
    link.addEventListener('click', function () { openNameModal(); });
    bar.appendChild(link);

    if (avatarIsCustom()) {
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'hr-id-link';
      reset.textContent = 'Reset portrait';
      reset.addEventListener('click', function () {
        clearAvatar();
        decorateCharacterPage();
        toast('Portrait reset to the default.', 'info');
      });
      bar.appendChild(reset);
    }
  }

  // ════════════════════════════════════════════════════════════
  // 8 · BOOT
  // ════════════════════════════════════════════════════════════
  function wireCharacterPage() {
    var orig = window.showTab;
    if (typeof orig !== 'function') { setTimeout(wireCharacterPage, 150); return; }
    if (!window.__identityTabHooked) {
      window.__identityTabHooked = true;
      window.showTab = function (name) {
        var r = orig.apply(this, arguments);
        if (name === 'character') setTimeout(decorateCharacterPage, 60);
        return r;
      };
    }
    // renderCharacter() rebuilds the panel wholesale, so the affordance has to
    // be re-attached after it. That function is published by an ESM module
    // (features/character-page.js) whose execution is deferred, so this file —
    // a classic script — can genuinely arrive first. Keep looking rather than
    // silently losing the hook, which is exactly how "works on reload only"
    // bugs are born.
    if (!window.__identityRenderHooked) {
      var origRender = window.renderCharacter;
      if (typeof origRender !== 'function') { setTimeout(wireCharacterPage, 250); return; }
      window.__identityRenderHooked = true;
      window.renderCharacter = function () {
        var r = origRender.apply(this, arguments);
        try { decorateCharacterPage(); } catch (e) {}
        return r;
      };
    }
  }

  // The first-sign-in prompt. Polls for a session the same way
  // post-signup-welcome.js does — auth.js exposes no subscribe hook — and
  // deliberately queues behind FTUE and the post-signup modal so a new
  // player never meets two modals at once.
  // The overlays this prompt must never land on. `.ftue-root` — not
  // `.ftue-card.show` — because the tour is "up" from the moment it builds its
  // root, not from the moment its card finishes animating in. Exposed so the
  // regression suite can assert the guard rather than infer it from timing.
  // b226: `.hr-dl-scrim` added. Walking the real sequence showed the daily
  // reward sheet opening at ~2.5s and this modal landing on top of it at ~3.5s
  // — the same stacking bug as the one b224 closed against FTUE, in the one
  // direction nobody had checked. daily-reward.js now blocks on `.hr-id-scrim`
  // too, so the two are mutually exclusive in BOTH directions and whichever is
  // ready first simply goes first. Deliberately still NOT blocking on
  // `#hr-post-signup-modal`: that sheet greets the player by the prefix of
  // their email address, which is precisely the name this modal exists to
  // replace, so naming keeps its precedence over it.
  var FRONT_DOOR = '.ftue-root, .hr-id-scrim, .hr-dl-scrim';
  function frontDoorBusy() { return !!document.querySelector(FRONT_DOOR); }

  var lastUser = null;
  function tick() {
    var uid = userId();
    if (uid !== lastUser) {
      lastUser = uid;
      promptedThisSession = false;
      if (uid) {
        load();
        if (rec.userId && rec.userId !== uid) _reset();   // different account, same device
        hydrateRemoteAvatar().catch(function () {});
        // b226: ASK THE SERVER FIRST. This is what makes the name modal a
        // consequence of the account genuinely having no name, rather than of
        // this browser not knowing about one. mustPrompt() stays quiet until
        // this settles, so the read is on the critical path of the prompt and
        // of nothing else the player can see.
        resolveServerName().catch(function () {});
        reconcile().catch(function () {});
      }
      applyAvatar();
    }
    if (!uid || promptedThisSession) return;
    if (!mustPrompt()) return;
    // Queue behind the FTUE tutorial only. NOTE the selector: FTUE renders
    // `.ftue-root > .ftue-card.show` — the `.hr-ftue` that post-signup-welcome
    // has been guarding on since b141 matches nothing, which is why that
    // modal has always been able to land on top of the tutorial.
    //
    // b224: `.ftue-card.show` alone still lost a RACE. FTUE builds `.ftue-root`
    // at DOMContentLoaded+600 and only adds `.show` ~80ms later; this tick also
    // ran at +600 (see boot below, now +1200). On a first sign-in the name
    // modal therefore opened a hair before the tour's card appeared, and the
    // player met both at once — the exact stacking bug b221/b223 kept closing
    // elsewhere. Guard on the ROOT, which exists the instant the tour starts.
    if (frontDoorBusy()) return;
    // Deliberately NOT queued behind #hr-post-signup-modal: that sheet greets
    // the player by the prefix of their email address, which is precisely the
    // name this modal exists to replace. Naming comes first; the welcome then
    // greets them by the name they actually chose.
    promptedThisSession = true;
    openNameModal();
  }

  function boot() {
    try {
      ensureStyle();
      load();
      applyAvatar();
      wireCharacterPage();
      tick();
      setInterval(tick, 2000);
    } catch (e) {
      try { console.warn('[identity] boot failed', e); } catch (e2) {}
    }
  }
  // b224: the name modal is a FIRST-SIGN-IN flow, so it waits for the account
  // wall to open. The seam below is still published immediately — load order
  // must not depend on the gate — only the polling/prompting boot is deferred.
  // b224: +1200, not +600. FTUE starts at DOMContentLoaded+600, so a first
  // tick at +600 was a coin toss against it. Being late costs a new player
  // nothing — the tick repeats every 2s and they are reading a tutorial —
  // while being early costs them two modals stacked on their first minute.
  function arm() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1200); });
    } else {
      setTimeout(boot, 1200);
    }
  }
  if (window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  // ── The seam ────────────────────────────────────────────────
  // MERGE, never replace: src/utils/profile.js merges its read accessors
  // into this same object, and neither file may care which loaded first.
  window.HearthriseIdentity = Object.assign(window.HearthriseIdentity || {}, {
    // rules
    MIN_LEN: MIN_LEN, MAX_LEN: MAX_LEN, AVATAR_PX: AVATAR_PX,
    AVATAR_MAX_BYTES: AVATAR_MAX_BYTES, AVATAR_TYPES: AVATAR_TYPES,
    DEFAULT_AVATAR: DEFAULT_AVATAR,
    canon: canon, normalizeName: normalize, validateName: validateName,
    // name
    displayName: displayName, nameStatus: nameStatus, isUniqueName: isUnique,
    mustPromptForName: owedPrompt, claimName: claimName,
    checkAvailability: checkAvailability, reconcile: reconcile,
    openNameModal: openNameModal,
    // avatar
    avatarUrl: avatarUrl, avatarPublicUrl: avatarPublicUrl,
    processImage: processImage, setAvatarFromFile: setAvatarFromFile,
    setAvatarFromImage: setAvatarFromImage,
    clearAvatar: clearAvatar, applyAvatar: applyAvatar,
    decorateCharacterPage: decorateCharacterPage,
    // b229: the one trigger both click affordances call — reused, not forked.
    openAvatarPicker: openAvatarPicker, decorateTopbarAvatar: decorateTopbarAvatar,
    avatarIsCustom: avatarIsCustom,
    // b360: prefab picker — the manifest both the grid and the suite read.
    PREFABS: PREFABS, prefabById: prefabById,
    setAvatarFromPrefab: setAvatarFromPrefab, openUploadDialog: openUploadDialog,
    // server-contract seams — pure, no I/O. Exposed for the regression suite.
    _reduceClaim: reduceClaim, _reduceAvailability: reduceAvailability,
    _reduceUpload: reduceUpload, _isMissingRpc: isMissingRpc,
    _FRONT_DOOR: FRONT_DOOR, _frontDoorBusy: frontDoorBusy,
    _record: function () { return load(); },
    _adopt: adopt, _reset: _reset, _persist: persist,
    _resetProbes: _resetProbes, _b64Bytes: b64Bytes,
    // b226 — server-truth name resolution
    _reduceServerName: reduceServerName, _fetchServerName: fetchServerName,
    _resolveServerName: resolveServerName, _applyServerName: applyServerName,
    _serverAnswer: serverAnswer, _serverPending: serverPending,
    _resetServerName: _resetServerName, _SERVER_NAME_DEADLINE_MS: SERVER_NAME_DEADLINE_MS,
    _shouldAdoptServerName: shouldAdoptServerName, _mustPrompt: mustPrompt,
    /* b368 — TEST-ONLY. Inert on a player origin (see installHarnessIdentity). */
    _installHarnessIdentity: installHarnessIdentity,
    _clearHarnessIdentity: clearHarnessIdentity,
    _harnessAllowed: harnessAllowed
  });
})();
