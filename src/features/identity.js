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
  var DEFAULT_AVATAR   = 'assets/icons-bundle/painted/npc/player.png';

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
  function session() {
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

  // "Must we PROMPT this player?" — uniqueness is a signed-in feature, and a
  // PROVISIONAL name is already a finished choice: the player picked it, so
  // they are never asked twice. It re-claims silently instead (reconcile()).
  // The only prompts are: no name at all, or a different account on this
  // device. That is what "prompted once on next login" actually means.
  function mustPrompt() {
    if (!isSignedIn()) return false;
    load();
    if (rec.userId && rec.userId !== userId()) return true;
    return !rec.name;
  }

  // "Are we still OWED a prompt right now?" — the question other first-run
  // flows need. It goes false once we have asked (including after "Not now"),
  // so post-signup-welcome.js can wait its turn without waiting forever.
  function owedPrompt() { return !promptedThisSession && mustPrompt(); }

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
  async function setAvatarFromFile(file) {
    var img = await fileToImage(file);
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
      '.hr-id-wrap h3{margin:0 0 4px;font-family:var(--f-display,inherit);font-size:21px;color:var(--ink,#efe6d6)}',
      '.hr-id-lead{font-size:12.5px;color:var(--ink-3,#a2968a);line-height:1.5;margin:0 0 14px}',
      '.hr-id-field{display:flex;gap:8px;align-items:stretch}',
      '.hr-id-field input{flex:1;padding:9px 12px;font-size:15px;font-weight:700;letter-spacing:.01em;',
      '  color:var(--ink,#efe6d6);background:rgba(0,0,0,.30);border:1px solid var(--line,rgba(255,255,255,.14));',
      '  border-radius:8px;font-family:inherit;min-width:0}',
      '.hr-id-field input:focus{outline:none;border-color:var(--gold-2,#c9a24a)}',
      '.hr-id-note{min-height:17px;font-size:12px;margin:8px 2px 0;line-height:1.35}',
      '.hr-id-note[data-tone="ok"]{color:var(--gold-2,#c9a24a)}',
      '.hr-id-note[data-tone="bad"]{color:#d98b7a}',
      '.hr-id-note[data-tone="muted"]{color:var(--ink-3,#a2968a)}',
      '.hr-id-rules{font-size:11.5px;color:var(--ink-3,#a2968a);margin:10px 2px 0;line-height:1.5}',
      '.hr-id-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}',
      '.hr-id-row .btn{flex:0 0 auto}',
      /* the character-page portrait becomes an upload target */
      '.cr-hero-portrait{position:relative}',
      '.hr-id-upload{position:absolute;left:0;right:0;bottom:0;border:0;width:100%;',
      '  padding:5px 4px;font:inherit;font-size:10px;font-weight:800;letter-spacing:.09em;',
      '  text-transform:uppercase;color:var(--ink,#efe6d6);background:rgba(0,0,0,.66);',
      '  cursor:pointer;text-align:center;line-height:1.2}',
      '.hr-id-upload:hover{background:rgba(0,0,0,.82);color:var(--gold-2,#c9a24a)}',
      '.hr-id-upload:disabled{cursor:progress;opacity:.7}',
      '.hr-id-namebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}',
      '.hr-id-badge{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;',
      '  padding:2px 7px;border-radius:99px;border:1px solid var(--line,rgba(255,255,255,.14));',
      '  color:var(--ink-3,#a2968a)}',
      '.hr-id-badge[data-tone="ok"]{color:var(--gold-2,#c9a24a);border-color:rgba(201,162,74,.5)}',
      '.hr-id-link{background:none;border:0;padding:0;font:inherit;font-size:11.5px;',
      '  color:var(--ink-3,#a2968a);text-decoration:underline;cursor:pointer}',
      '.hr-id-link:hover{color:var(--gold-2,#c9a24a)}'
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
        ensureFileInput().click();
      });
      portrait.appendChild(btn);
    }
    btn.textContent = uploading ? 'Working…' : (avatarIsCustom() ? 'Change portrait' : 'Upload portrait');
    btn.disabled = uploading;
    btn.title = 'PNG, JPG or WEBP. Cropped square to ' + AVATAR_PX + '×' + AVATAR_PX + '.';

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
  var FRONT_DOOR = '.ftue-root, .hr-id-scrim';
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
    clearAvatar: clearAvatar, applyAvatar: applyAvatar,
    decorateCharacterPage: decorateCharacterPage,
    // server-contract seams — pure, no I/O. Exposed for the regression suite.
    _reduceClaim: reduceClaim, _reduceAvailability: reduceAvailability,
    _reduceUpload: reduceUpload, _isMissingRpc: isMissingRpc,
    _FRONT_DOOR: FRONT_DOOR, _frontDoorBusy: frontDoorBusy,
    _record: function () { return load(); },
    _adopt: adopt, _reset: _reset, _persist: persist,
    _resetProbes: _resetProbes, _b64Bytes: b64Bytes
  });
})();
