// Supabase auth scaffold — drop-in module that handles sign-in / sign-up flows
// and wires the resulting session into the cloud-sync adapter.
//
// Tyler hasn't created the Supabase project yet, so this module is INERT until
// he calls setupAuth({url, anonKey}). When he does, signIn() / signUp() / signOut()
// become live, and cloud-sync auto-upgrades from offline to live.

import { setupSync, pullLatestDetailed, holdSnapshots, releaseSnapshots,
         tokenStatus, resetAuthGate, isClockTrusted } from './sync.js?v=355';

let supabase = null;       // lazy-loaded supabase client
let authConfig = null;     // {url, anonKey}
let session = null;        // current session

const LOCAL_KEY = 'hearthrise:supabaseSession';

/**
 * WHAT AN AUTH EVENT MEANS FOR THE CACHED SESSION — pure, and exported so the
 * suite can prove it (b226).
 *
 * The cached session under LOCAL_KEY is not a convenience: src/net/account-gate.js
 * opens the front door on it, so deleting it is equivalent to signing the
 * player out of the product. Before b226 the handler cleared it on ANY event
 * that arrived without a session, and supabase-js emits several — an
 * INITIAL_SESSION replay, a TOKEN_REFRESHED that has not resolved yet, a
 * transient network blip during refresh. One of those and a signed-in player
 * met the wall on their next load and had to sign in again. That is the
 * "logging in doesn't seem very seamless" report, in one line.
 *
 *   'persist' — an event carrying a session. Always wins.
 *   'clear'   — an EXPLICIT end of the account's session on this device.
 *   'ignore'  — a null we cannot interpret as an intentional sign-out. Keep
 *               the cache; supabase-js keeps retrying, and if the session
 *               really is dead the gate's lapsed-session sheet asks — beside a
 *               running game, which is the behaviour the account ruling
 *               requires.
 * @returns {'persist'|'clear'|'ignore'}
 */
export function decideSessionEvent(event, newSession) {
  if (newSession) return 'persist';
  return (event === 'SIGNED_OUT' || event === 'USER_DELETED') ? 'clear' : 'ignore';
}

/* ── b331: THE OTHER HALF OF THAT RULE ───────────────────────────────────────
   'ignore' is right — a transient null must not sign a player out — but it was
   the ONLY thing standing between "supabase-js lost its session" and "this
   module keeps handing out a dead access token forever". Production proof: a
   player's requests on 2026-08-12 carried a token ISSUED ON 2026-08-11, replayed
   for three hours against 3,087 PGRST303s. `decideSessionEvent` protects the
   CACHE; nothing protected the TOKEN. The recovery ladder below is that half:
   recover over the real network, or terminate into a state the player can act on.
   The one thing it must never do is settle. */

let recoverInFlight = null;
let syncDownSince = 0;
let refreshTimer = null;

function readCachedSession() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { return null; }
}

function adoptSession(s) {
  session = s;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch (e) {}
  try { resetAuthGate(); } catch (e) {}          // the breaker may open again
  syncDownSince = 0;
  hideAuthExpiredGate();
}

/**
 * THE RECOVERY LADDER. Returns true only if a LIVE access token now exists.
 *
 * Step 1 is what the old handler did, and on its own it is the bug: when
 * supabase-js has dropped its own session, `refreshSession()` rejects with
 * AuthSessionMissingError WITHOUT MAKING A NETWORK CALL — which is exactly what
 * the edge logs showed (~25 `/auth/v1/token` requests in a day against 3,087
 * 401s). Steps 2 and 3 re-arm the library from the refresh token we hold in
 * LOCAL_KEY, which forces a real POST to the token endpoint.
 *
 * Single-flight: six failing requests a minute must not become six refreshes.
 */
export async function recoverSession() {
  if (recoverInFlight) return recoverInFlight;
  recoverInFlight = (async () => {
    if (!supabase) return false;
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data && data.session && data.session.access_token) { adoptSession(data.session); return true; }
    } catch (e) { /* AuthSessionMissingError lands here, silently and offline */ }

    const cached = readCachedSession();
    const rt = cached && cached.refresh_token;
    if (rt) {
      try {
        const { data } = await supabase.auth.setSession({
          access_token: (cached && cached.access_token) || '', refresh_token: rt });
        if (data && data.session && data.session.access_token) { adoptSession(data.session); return true; }
      } catch (e) {}
      try {
        const { data } = await supabase.auth.refreshSession({ refresh_token: rt });
        if (data && data.session && data.session.access_token) { adoptSession(data.session); return true; }
      } catch (e) {}
    }
    console.warn('[Auth] the session could not be refreshed — this token is dead; the player must sign in again.');
    return false;                                  // DEFINITIVE: sync stops asking
  })();
  try { return await recoverInFlight; } finally { recoverInFlight = null; }
}

/**
 * What the player is told when sync is down. Pure, so the escalation is provable.
 *
 * "⚠️ Reconnecting… your progress is saved locally" is honest for a network
 * blip. It is a LIE after twenty minutes of dead auth: nothing is reconnecting,
 * and "saved locally" is one cache-clear from gone. So a definitively-expired
 * session, or auth failure that has persisted past ESCALATE_AFTER_MS, says so.
 */
export const ESCALATE_AFTER_MS = 180000;   // 3 minutes
export function syncFailureMessage(reason, downMs) {
  if (reason === 'auth-expired' || (reason === 'auth' && Number(downMs) >= ESCALATE_AFTER_MS)) {
    return '🔒 Your sign-in has expired — nothing is reaching the cloud. Sign in again to save your progress.';
  }
  return '⚠️ Reconnecting… your progress is saved locally.';
}

/**
 * Initialise auth + cloud sync.
 * @param {{url: string, anonKey: string}} config
 */
export async function setupAuth(config) {
  authConfig = config;
  if (!config?.url || !config?.anonKey) {
    console.log('[Auth] no config — staying in offline mode');
    return;
  }
  // Dynamic import so this module loads even when supabase-js isn't available
  try {
    const mod = await import('https://cdn.skypack.dev/@supabase/supabase-js');
    // Explicit auth options so we don't rely on library defaults: keep the
    // access token auto-refreshing in the background (tokens expire ~1h) and
    // persisted, so long play sessions don't silently stop syncing (b149).
    supabase = mod.createClient(config.url, config.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true },
    });
  } catch (e) {
    console.warn('[Auth] failed to load supabase-js:', e.message);
    return;
  }

  // Restore prior session if present
  const cached = localStorage.getItem(LOCAL_KEY);
  if (cached) {
    try {
      session = JSON.parse(cached);
      await supabase.auth.setSession(session);
    } catch {}
  }

  // Auth state listener — keep session in localStorage + reconfigure sync.
  // The rule itself is decideSessionEvent() below, so it can be proved.
  supabase.auth.onAuthStateChange((event, newSession) => {
    const act = decideSessionEvent(event, newSession);
    if (act === 'ignore') return;                    // transient null — keep what we have
    if (act === 'persist') {
      session = newSession;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(newSession));
      enableLiveSync();
    } else {
      session = null;
      localStorage.removeItem(LOCAL_KEY);
      // Sync stays in offline mode (events buffer to localStorage)
    }
    renderAuthUi();
    // Trigger a full panel re-render so the Profile sheet's
    // "Offline play / Sign in" subtitle + button update to
    // reflect the new session state.
    try {
      // b334: this called window.render(), which has never been a global —
      // the typeof guard meant the "full panel re-render" silently never
      // happened, and the guard made that invisible. refreshAll() is the
      // engine's actual full repaint.
      if (typeof window.refreshAll === 'function') window.refreshAll();
      if (typeof window.renderProfile === 'function') window.renderProfile();
    } catch {}
  });

  if (session) enableLiveSync();
  renderAuthUi();
}

function enableLiveSync() {
  if (!authConfig || !session) return;
  setupSync({
    ...buildSaveWiring(authConfig),
    authToken: () => session?.access_token,
    userId: () => session?.user?.id,
    // G has no stored totalLevel — it's summed from skills. Feed it in so the
    // snapshot carries it (populates game_saves.total_level + the restore gate).
    totalLevel: () => (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0),
    // b149 — token expiry hardening. If a save fails on an expired token, sync
    // asks us to refresh + retries once; and we surface sync health to the UI
    // so a player knows when their progress isn't reaching the cloud.
    // b331: returns TRUE only when a live token now exists. sync.js uses that
    // answer to decide whether retrying is worth a request at all.
    onAuthError: async () => recoverSession(),
    // b331: the breaker has declared this session unrecoverable. Stop pretending
    // we are "reconnecting" and give the player the one control that fixes it.
    onAuthExpired: (info) => { showAuthExpiredGate(info); },
    onSyncFailure: (reason) => {
      if (!syncDownSince) syncDownSince = Date.now();
      const msg = syncFailureMessage(reason, Date.now() - syncDownSince);
      if (typeof window.notify === 'function') window.notify(msg, 'kill');
      const pill = document.getElementById('status-pill') || document.getElementById('hr-auth-banner');
      const label = (pill && pill.querySelector('span:last-child')) || pill;
      if (label) label.textContent = (reason === 'auth-expired') ? 'Sign in to save' : 'Reconnecting…';
      if (pill) pill.classList.add('off');
    },
    onSyncRecovered: () => {
      syncDownSince = 0;
      hideAuthExpiredGate();
      if (typeof window.notify === 'function') window.notify('✅ Back online — progress synced.', 'info');
      renderAuthUi();
    },
    // b301: another device is signed into this account and actively saving. We
    // can't force it out, but we warn — two devices at once clobber each other's
    // saves (last writer wins). Fired once per session.
    onConcurrentDevice: () => {
      if (typeof window.notify === 'function') {
        window.notify('⚠️ This account is being played on another device. Two at once can overwrite each other — close one to keep your progress safe.', 'kill');
      }
    },
    // b302: this device LOST the single-active-session claim — the account was
    // opened on another device (new device wins). Stop everything that could
    // clobber the new device's save, and lock this one out with a clear notice.
    onEvicted: () => { showEvictedGate(); },
    batchIntervalMs: 5000,
    snapshotIntervalMs: 60000,
  });
  /* b337/b338, restructured in b339 — see wireServerIntents(). Both server
     intents get their credentials from the SAME place sync.js does, at the same
     moment, through ONE function the suite can drive with spies. */
  wireServerIntents(window, {
    url: authConfig.url,
    anonKey: authConfig.anonKey,
    authToken: () => session?.access_token,
    userId: () => currentUserId(),
  });
  // b331 — PROACTIVE REFRESH. supabase-js is supposed to do this itself
  // (autoRefreshToken:true), and in the incident it demonstrably stopped without
  // saying so. A token five minutes from death is refreshed here, so the whole
  // expired-token class costs zero failed requests in the normal case.
  if (refreshTimer) clearInterval(refreshTimer);
  // The 5-minute `skewMs` lead is why this fires BEFORE the token dies rather
  // than after. It is skipped entirely once sync has caught this device's clock
  // lying, because on a fast clock this condition is permanently true and would
  // otherwise refresh on every tick forever.
  refreshTimer = setInterval(() => {
    const tok = session && session.access_token;
    if (!tok || !isClockTrusted()) return;
    if (tokenStatus(tok, Date.now(), 300000) === 'expired') recoverSession();
  }, 60000);
  // Pull cloud snapshot on first connection if local save is older
  pullAndMaybeRestore();
}

/* ── WHERE THIS ACCOUNT'S SAVE LIVES (b342) ─────────────────────────────────
   The three table addresses, plus the key, as ONE named thing a test can drive
   — because this was the THIRD caller of the b339 slot bug and the only silent
   one. accrue.js and character.js were fixed then; the save blob was not.

   NO `slot` KEY, and that omission is now the whole point. sync.js's write
   (buildSnapshotRequest) and read (pullLatestDetailed) both resolve the ACTIVE
   character from src/multi-character.js when no slot is pinned, so leaving it
   out is what addresses the live character. Adding `slot: 0` back here sends
   every autosave to character 1 again, silently, on a 60s cadence.

   It is deliberately NOT resolved here and passed down. A slot captured at
   sign-in is a slot that is wrong the moment the player switches character —
   the same rule the token and the user id follow, and for the same reason.

   Mutation-checked twice over: `slot: 0` anywhere in the setupSync config turns
   B342-1 red (this function) AND the save-slot guard in tests/run-smoke.mjs
   red (the whole literal, read off the wire). */
export function buildSaveWiring(cfg) {
  const base = String((cfg && cfg.url) || '').replace(/\/+$/, '');
  return {
    endpoint: `${base}/rest/v1/game_events`,
    snapshotEndpoint: `${base}/rest/v1/game_saves`,
    claimEndpoint: `${base}/rest/v1/session_claims`,   // b302 single-active-device
    apiKey: cfg && cfg.anonKey,
  };
}

/* ── HOW THE TWO SERVER INTENTS ARE WIRED (b339) ────────────────────────────
   This used to be two inline object literals inside enableLiveSync(), which is
   unreachable from a test without a live session — so a test could prove that
   accrue.js RESOLVES the active slot while auth.js quietly went on pinning
   `slot: 0`, which is exactly the bug S6 found and exactly the "proof of the
   adjacent thing" family this program keeps meeting. Mutation-checked: putting
   `slot: 0` back anywhere below turns B339-3b red.

   `authToken` and `userId` are ACCESSORS, never captured values. A token
   refreshed five minutes from now must reach hr-accrue too (a captured one is
   how the b331 dead-token loop started), and the user id must be the one
   signed in NOW or the character latch stops being an identity.

   NO `slot`. It is resolved per call from src/multi-character.js, the module
   that owns which character is live.

   Wiring is not enabling: the b337 kill switch is separate and defaults OFF. */
export function buildIntentWiring(cfg) {
  const c = cfg || {};
  const base = { url: c.url, apiKey: c.anonKey, authToken: c.authToken };
  /* b340 — the record read (`hr_load`) is wired from the SAME base as the other
     two. Three copies of a url would be three things to drift; the b332 lesson
     about five copies of one hash is recent enough not to need restating. */
  /* b347 — the ACTIVITY intent is wired from the same base for the same reason.
     Four copies of a url would be four things to drift. */
  /* b354 — the three economy verbs ride the same base. Five copies of a url
     would be five things to drift; the b332 lesson about five copies of one
     hash is recent enough not to need restating. */
  return { accrual: { ...base }, character: { ...base, userId: c.userId },
    record: { ...base }, activity: { ...base }, gold: { ...base } };
}

/** Apply that wiring to whatever `win` publishes. Returns what was passed, so a
 *  test asserts the LITERAL configuration rather than that code exists which
 *  might produce it. Each side is independently guarded: a throw in one must
 *  not leave the other unwired. */
export function wireServerIntents(win, cfg) {
  const w = buildIntentWiring(cfg);
  try { if (win && win.HearthriseAccrual) win.HearthriseAccrual.configureAccrual(w.accrual); }
  catch (e) { console.warn('[auth] accrual wiring skipped:', e && e.message); }
  try { if (win && win.HearthriseCharacter) win.HearthriseCharacter.configureCharacter(w.character); }
  catch (e) { console.warn('[auth] character wiring skipped:', e && e.message); }
  try { if (win && win.HearthriseRecord) win.HearthriseRecord.configureRecord(w.record); }
  catch (e) { console.warn('[auth] record wiring skipped:', e && e.message); }
  try { if (win && win.HearthriseActivity) win.HearthriseActivity.configureActivity(w.activity); }
  catch (e) { console.warn('[auth] activity wiring skipped:', e && e.message); }
  try { if (win && win.HearthriseGold) win.HearthriseGold.configureGold(w.gold); }
  catch (e) { console.warn('[auth] gold wiring skipped:', e && e.message); }
  return w;
}

/* ── b340: THE CLOUD OVERLAY IS A CACHE READ, AND IT IS STRIPPED ────────────
   Exported because the strip that matters is the one AT THE CALL SITE. B339's
   post-mortem is the reason: a test drove accrue.js's slot resolver, proved it
   correct, and auth.js went on pinning `slot: 0` — a mutation in the CALLER
   slipped past a test of the callee. So this is a named function a test can
   drive, and B340-4 mutates it rather than record.js.

   FAILS LOUD, NEVER SILENT. If the switch is on and record.js did not load,
   this throws instead of returning the blob: returning it would read a
   server-owned field back out of a client-authored save, which is the exact
   two-sources bug the seam exists to prevent, and it would do it invisibly. The
   throw is caught by pullAndMaybeRestore's own handler, which holds the
   snapshot gate and retries — i.e. it degrades into "we did not restore", never
   into "we restored a forgeable value". */
export function stripRecordFieldsForOverlay(snap, win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  /* The SWITCH is read from accrue.js, not from record.js — deliberately. If it
     were read from record.js then a missing record.js would read as "switch
     off" and the strip would silently not happen, which is the failure this
     function is guarding. The switch and the field list live in different
     modules precisely so one cannot vouch for the other. */
  const A = w && w.HearthriseAccrual;
  const on = !!(A && typeof A.isServerAccrualEnabled === 'function' && A.isServerAccrualEnabled());
  if (!on) return snap;
  const R = w && w.HearthriseRecord;
  if (!R || typeof R.stripServerOfRecord !== 'function') {
    throw new Error('server accrual is ON but src/net/record.js did not load — refusing to overlay a '
      + 'cloud save that still carries server-owned fields');
  }
  return R.stripServerOfRecord(snap).blob;
}

/* ── b347: THE WHOLE CLOUD→G SEAM, IN ONE FUNCTION A TEST CAN DRIVE ─────────
   This used to be five inline statements inside pullAndMaybeRestore(), which
   needs a live Supabase session to reach — and two of them undid each other:
   `stripRecordFieldsForOverlay` deleted `offlineBudget` from the snapshot, and
   three lines later the watermark was re-stamped to the snapshot's OWN save
   time out of `cloudAt`. The strip removed the field from the blob and the very
   next statement put a blob-derived number back into G under the server's name.
   Measured with a control: server 06:00Z, this line 09:30Z.

   So the whole seam is one named export and pullAndMaybeRestore holds no blob→G
   statement of its own. That is B339's lesson applied as far as it goes here: a
   test cannot reach pullAndMaybeRestore, but it CAN drive every line that
   touches G, and the remaining untested surface is a single call expression
   rather than five statements nobody can see.

   `lastSeen` is NOT on the registry and stays client-owned; the watermark is,
   and asks. Returns what it did, so the test asserts the effect rather than
   that code exists which might produce it. */
export function applyCloudOverlay(G, snap, cloudAt, win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const overlay = stripRecordFieldsForOverlay(snap, w);
  Object.assign(G, overlay);
  // Reset the offline watermark to the cloud's save time so the returning-
  // player catch-up credits the gap since the account was LAST active anywhere,
  // not since this (possibly long-idle) device last saved.
  G.lastSeen = cloudAt;
  const A = w && w.HearthriseAccrual;
  /* FAIL CLOSED, and through accrue.js's single implementation. A missing
     accrue.js means the switch cannot be on, which is why `true` is the right
     answer to an absent module here and `false` is the right answer to an absent
     record.js inside it. */
  const mayWrite = !A || typeof A.mayClientWrite !== 'function'
    ? true : A.mayClientWrite('offlineBudget', w) !== false;
  const restamped = !!(mayWrite && G.offlineBudget && typeof G.offlineBudget === 'object');
  if (restamped) G.offlineBudget.at = cloudAt;
  return { stripped: overlay !== snap, restampedWatermark: restamped, lastSeen: cloudAt };
}

/**
 * THE SAVE-CONFLICT RULE, pure and exported so it can be tested without a
 * network, a session, or a live G.
 *
 * b300 — CLOUD IS AUTHORITATIVE (Tyler). The old rule compared TOTAL LEVEL and
 * prompted when cloud was ahead. That was wrong twice over: total level ignores
 * everything non-level (gold, items, kills gained since), and a level TIE kept
 * local — so a stale local save could silently overwrite newer cloud progress.
 * In an online-only, account-walled game the cloud is the single source of
 * truth and local is a cache; the correct question is not "who has more levels"
 * but "which save is NEWER". So we compare timestamps and the freshest wins,
 * with cloud as the canonical store.
 *
 *   'restore' — the cloud save is NEWER than local. Cloud wins: the caller
 *               overlays it and reloads. (No prompt — auto-newest, per Tyler.)
 *   'adopt'   — local is same-age-or-newer (offline play, a failed prior sync,
 *               or a same-device reopen where they match). Local stays live and
 *               sync.js uploads it. Ties favour local so a same-device reopen
 *               never needlessly reloads.
 *   'none'    — no cloud snapshot at all (first sign-in on an account). Local
 *               is adopted; reported separately from 'adopt' for clarity.
 *
 * SAFETY GUARD: a cloud save only wins if it is newer AND not obviously thin /
 * corrupt — its total level must be at least half of local's. Total level only
 * ever grows, so a newer cloud that is dramatically smaller is a partial or
 * damaged save (e.g. a pre-b288 thin snapshot with a fresh timestamp), and must
 * never be allowed to roll a real save back. When in doubt, keep local.
 *
 * SYMMETRIC ANTI-CLOBBER GUARD (b314): the mirror of the thin-cloud guard. That
 * one stops a newer-but-tiny CLOUD from rolling back a real LOCAL. This one stops
 * a fresh/empty LOCAL from clobbering a real CLOUD even though local wins on time.
 * It closes the hole that reset a live account: a freshly-added iOS Home Screen
 * PWA gets its OWN empty storage sandbox, boots an EMPTY character with a current
 * lastSeen (so local is "newer"), then uploads that emptiness over a substantial
 * cloud. Total level only ever grows, so a local still at the fresh-character
 * FLOOR while the cloud holds real, much larger progress is not "newer play" — it
 * is a fresh/cleared/corrupt local and must NEVER win. We key on LOCAL's OWN total
 * (which this device can trust) sitting at the floor, NOT on the cloud's
 * (self-forgeable) size being large — so it cannot be tripped by a garbage-inflated
 * cloud level, and it cannot regress the anti-rollback invariant for a genuinely
 * progressed local (a real save sits far above FRESH_FLOOR, so that branch is
 * never entered). Known limitation: two BOTH-near-floor saves (local & cloud each
 * ≤ FRESH_FLOOR) still resolve by time — an intentionally conservative choice, as
 * a sub-floor save is worth only minutes and we refuse to risk a false restore.
 *
 * @param {{lastSeen:number, totalLevel:number}} local  local freshness + size
 * @param {object|null} snap  cloud snapshot; reads snap.__cloudSavedAt (ms) with
 *                            snap.lastSeen as a fallback, and snap.totalLevel.
 * @returns {{action:'none'|'adopt'|'restore', localAt:number, cloudAt:number,
 *            localTotalLv:number, cloudTotalLv:number, reason:string}}
 */
// A brand-new Hearthrise character's total level: 12 skills at level 1 plus
// hitpoints seeded to level 10 (1154 xp) = 22. A save still at or below this
// floor has effectively no progress; a real save climbs far past it quickly. We
// leave headroom above the true floor so a few minutes of first-session play is
// still treated as "fresh" for the anti-clobber guard.
const FRESH_FLOOR = 40;

/**
 * WHO OWNS THE LOCAL SAVE (b318 — V2 cross-account clobber). Pure.
 *
 * THE HOLE: signOut() cleared only the session, never SAVE_KEY. Account B signs
 * in on a device where account A played; loadLocal() reads A's save into G;
 * decideRestore compares A's local against B's cloud on TIMESTAMP alone, A is
 * newer, verdict 'adopt' → the next snapshot uploads A's character over B's
 * cloud save. B's progress is destroyed and B is playing A's character. Neither
 * existing guard fires: A's save is substantial, so the b314 thin/fresh-floor
 * guards see two perfectly healthy saves and let time decide.
 *
 * The fix is identity, not size: a local save is only a candidate to upload if
 * it BELONGS to the signed-in account.
 *
 *   'same'    — stamped with the signed-in user. Normal freshness rules apply.
 *   'foreign' — stamped with a DIFFERENT user. Never adoptable, never uploadable.
 *   'unstamped'      — a pre-b318 install. See the legacy policy below.
 *   'unknown-session' — we cannot tell who is signed in (auth not up yet, offline
 *                       boot). Never accuse a save of being foreign on a guess;
 *                       fall through to the normal rules, which are unchanged.
 *
 * LEGACY POLICY (unstamped → treated as 'same', stamped on first save): every
 * existing player's save predates the stamp, and discarding those would wipe the
 * entire live beta on upgrade — categorically worse than the bug being fixed.
 * It is safe against the V2 scenario because the stamp is written on the FIRST
 * save after upgrade, i.e. by the account that is actually playing: the window
 * in which a save can be mistaken for someone else's is one boot on a device
 * that has ALREADY had two accounts on it before ever running b318. From the
 * first stamped save onward the device is protected forever. And the stamp is
 * only ever written when ABSENT (legacy.js saveLocal), so a foreign save can
 * never be re-labelled as the current user's on the way past the guard.
 */
export function decideLocalOwnership(localOwner, currentUser) {
  if (!currentUser || typeof currentUser !== 'string') return 'unknown-session';
  if (!localOwner || typeof localOwner !== 'string') return 'unstamped';
  return localOwner === currentUser ? 'same' : 'foreign';
}

export function decideRestore(local, snap, ownership) {
  local = local || {};
  // Ownership may be passed explicitly (tests, callers that already resolved it)
  // or derived from the local descriptor. Absent both, it is 'unknown-session'
  // and behaviour is byte-for-byte what it was before b318.
  const own = ownership || decideLocalOwnership(local.owner, local.currentUser);
  if (own === 'foreign') {
    // A save belonging to another account. It is not "older" or "smaller" — it
    // is NOT THIS PLAYER'S, so freshness is meaningless and it must never reach
    // the cloud. The caller parks it and starts this account clean.
    return {
      action: 'foreign', reason: 'local-owned-by-another-account', ownership: own,
      localAt: Number(local.lastSeen) || 0, cloudAt: Number(snap && (snap.__cloudSavedAt || snap.lastSeen)) || 0,
      localTotalLv: Number(local.totalLevel) || 0, cloudTotalLv: Number(snap && snap.totalLevel) || 0,
    };
  }
  const localAt = Number(local.lastSeen) || 0;
  const localTL = Number(local.totalLevel) || 0;
  const base = { localAt, cloudAt: 0, localTotalLv: localTL, cloudTotalLv: 0, ownership: own };
  if (!snap || typeof snap !== 'object') return { action: 'none', reason: 'no-cloud', ...base };
  const cloudAt = Number(snap.__cloudSavedAt) || Number(snap.lastSeen) || 0;
  const cloudTL = Number(snap.totalLevel) || 0;
  const full = { ...base, cloudAt, cloudTotalLv: cloudTL };
  // Cloud must be strictly newer to win; ties keep local (no needless reload).
  if (cloudAt > localAt) {
    // Thin/corrupt guard: don't let a newer-but-tiny cloud roll a real save back.
    if (localTL > 0 && cloudTL < localTL * 0.5) return { action: 'adopt', reason: 'cloud-newer-but-thin', ...full };
    return { action: 'restore', reason: 'cloud-newer', ...full };
  }
  // Local wins on time — but a fresh/empty local (fresh-storage sandbox: a
  // re-added PWA, cleared cache, corrupt save) must NEVER upload over a real,
  // substantial cloud. See the SYMMETRIC ANTI-CLOBBER GUARD note above.
  if (localTL <= FRESH_FLOOR && cloudTL > FRESH_FLOOR && cloudTL >= localTL * 2) {
    return { action: 'restore', reason: 'local-fresh-vs-substantial-cloud', ...full };
  }
  return { action: 'adopt', reason: 'local-fresh', ...full };
}

// b314: bounded retry counter for a cloud pull that keeps failing. While the
// pull is UNKNOWN (network down / non-200) the snapshot gate stays HELD so a
// fresh/empty local can never upload over a cloud we could not read — the exact
// data-loss the reconcile gate exists to prevent. Local persistence (saveLocal +
// the event buffer) is untouched, so nothing is lost; uploads simply wait until
// we get a definitive read. Backoff caps so we don't hammer a dead endpoint.
// b331: the cap was 30s, so an unreadable cloud meant a GET every 30 seconds
// FOREVER — 120/hr, all of them 401, for the whole of a three-hour session. The
// gate must still stay held (that part is right), but holding it does not
// require hammering: 5 minutes recovers just as fast in every case a human
// notices, and the breaker in sync.js keeps the blocked attempts off the network
// entirely. This loop deliberately never gives up, so a background refresh that
// succeeds always gets the reconcile — and therefore the upload — restarted.
let reconcileAttempts = 0;
const RECONCILE_MAX_DELAY = 300000;

async function pullAndMaybeRestore() {
  // b314: hold snapshot uploads until we have pulled the cloud and reconciled.
  // A fresh/empty local must never race an upload out ahead of this decision.
  try { holdSnapshots(); } catch (e) {}
  try {
    // b300: one cloud-restore per tab session. The restore path reloads, and
    // after the reload local == cloud so decideRestore returns 'adopt' — but this
    // guard is belt-and-suspenders against clock skew making cloudAt persistently
    // look newer and re-triggering a reload loop.
    let restoredAlready = false;
    try { restoredAlready = sessionStorage.getItem('hr:cloudRestoreDone') === '1'; } catch (e) {}

    const pull = await pullLatestDetailed();

    // UNKNOWN cloud (network error / non-200). We must NOT release the gate and
    // let a possibly-fresh local upload over a cloud we never read. Stay held and
    // retry with backoff; a returning device keeps playing offline meanwhile.
    if (pull.status === 'error') {
      reconcileAttempts++;
      const delay = Math.min(RECONCILE_MAX_DELAY, 4000 * reconcileAttempts);
      console.warn(`[Auth] cloud pull failed (attempt ${reconcileAttempts}); snapshot uploads held, retrying in ${delay}ms.`);
      setTimeout(() => { pullAndMaybeRestore(); }, delay);
      return;   // gate stays HELD — the finally below must not run a release for this path
    }
    reconcileAttempts = 0;

    const snap = pull.snap;   // null for 'empty'/'skip' → decideRestore returns none/adopt
    const local = {
      lastSeen: (window.G && Number(window.G.lastSeen)) || 0,
      totalLevel: (typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : 0)
        || (window.G && window.G.totalLevel) || 0,
      owner: (window.G && window.G._saveOwner) || null,
      currentUser: currentUserId(),
    };
    const d = decideRestore(local, snap);

    // b318 (V2): the live save belongs to a DIFFERENT account. Do not merge it,
    // do not upload it, do not reason about its timestamp. Park it (recoverable
    // — that player gets it back when they sign in here again) and reload, so
    // this account boots either its own parked save or a clean character and
    // then reconciles against its own cloud through the normal path.
    if (d.action === 'foreign') {
      let already = false;
      try { already = sessionStorage.getItem('hr:foreignParked') === local.currentUser; } catch (e) {}
      console.warn(`[Auth] local save is owned by another account (${d.localAt} / Lv ${d.localTotalLv}); parking it instead of uploading.`);
      if (already) return;   // belt-and-braces: never loop on a park that didn't take. Gate stays HELD.
      try { sessionStorage.setItem('hr:foreignParked', local.currentUser); } catch (e) {}
      try { if (typeof window.parkLocalSave === 'function') window.parkLocalSave('foreign'); } catch (e) {}
      // Gate deliberately stays HELD — no snapshot may leave this tab before the
      // reload replaces G with something this account actually owns.
      location.reload();
      return;
    }

    if (d.action !== 'restore' || restoredAlready || !window.G) {
      // 'none'/'adopt' → local stays live and sync.js uploads it (that IS adoption
      // in a cloud-authoritative model: cloud simply catches up to local).
      console.log(`[Auth] keeping local save (${d.action}/${d.reason}; localAt ${d.localAt} vs cloudAt ${d.cloudAt}, Lv ${d.localTotalLv} vs ${d.cloudTotalLv}).`);
      releaseSnapshots();   // definitive decision reached → uploads may resume
      return;
    }

    // Cloud is newer → it is authoritative. Overlay its fields onto G. snapshot()
    // omits the NO_SYNC set (in-flight combat/activity, combatLog,
    // lastOfflineSummary, derived totalLevel/combatLevel) and `_`-prefixed
    // scratch — including the b318 `_saveOwner` stamp, which is device-local
    // identity and must never ride to the cloud — so those survive the overlay.
    // b318 CORRECTION: this comment previously claimed lastSeen and
    // offlineBudget were NO_SYNC device-local journal. They are NOT in NO_SYNC
    // (src/net/events.js) — both ARE uploaded, and both are explicitly
    // re-stamped to cloudAt immediately below precisely because the overlay
    // brings the cloud's copies with it. Behaviour unchanged; the comment was
    // simply wrong and would have misled the next person to touch this.
    const cloudAt = d.cloudAt || Date.now();
    delete snap.__cloudSavedAt;                       // never let our meta keys land in G
    delete snap.__device;                             // (b301 concurrent-device marker)
    /* b340 — THE SECOND BLOB→G SEAM. The cloud snapshot is still a client-
       authored blob; it is a CACHE, not a record. Any field the server owns is
       deleted on the way in so it cannot be read back out of it — see
       src/net/record.js. No-op while the b337 switch is off, so every restore
       path b305 exercises is byte-for-byte unchanged.
       b347 — and the watermark re-stamp that followed it is INSIDE the same
       function now, because it was undoing the strip. This line is the whole of
       the cloud→G seam; there is deliberately nothing left inline. */
    applyCloudOverlay(window.G, snap, cloudAt);
    try { sessionStorage.setItem('hr:cloudRestoreDone', '1'); } catch (e) {}
    try { sessionStorage.setItem('hr:restoredFromCloud', '1'); } catch (e) {}   // toast after reload
    console.log(`[Auth] restoring newer cloud save (cloudAt ${cloudAt} > localAt ${d.localAt}; Lv ${d.cloudTotalLv}).`);
    releaseSnapshots();   // we have the authoritative save; the reload re-reconciles cleanly
    if (typeof window.saveLocal === 'function') window.saveLocal();
    location.reload();
  } catch (e) {
    // An UNEXPECTED failure mid-reconcile is treated exactly like an unknown
    // cloud: keep the gate HELD (never upload a possibly-fresh local over an
    // unread cloud) and retry with backoff.
    console.warn('[Auth] reconcile failed:', e && e.message);
    reconcileAttempts++;
    const delay = Math.min(RECONCILE_MAX_DELAY, 4000 * reconcileAttempts);
    setTimeout(() => { pullAndMaybeRestore(); }, delay);
  }
}

// ── Public actions ──

export async function signUp(email, password, metadata) {
  if (!supabase) throw new Error('Auth not configured');
  const opts = metadata ? { email, password, options: { data: metadata } } : { email, password };
  const { data, error } = await supabase.auth.signUp(opts);
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Auth not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // b318 (V2): signing out used to remove ONLY the session key, leaving this
  // account's SAVE_KEY blob live in localStorage. The next account to sign in on
  // this device booted the PREVIOUS player's character and — if it was newer —
  // uploaded it over their own cloud save. Park the save (never destroy it: a
  // same-owner sign-in un-parks it, so unsynced offline progress survives) and
  // stop uploads so nothing can be written after the session ends.
  try { holdSnapshots(); } catch (e) {}
  try { if (typeof window.parkLocalSave === 'function') window.parkLocalSave('signout'); } catch (e) {}
  /* b339 — character.js has documented `resetCharacterIntent()` as "the thing
     auth.js calls on sign-out" since b338, and grep found NO caller anywhere in
     src/. The latch key now carries the live user id, so a stale latch can no
     longer match a different account on its own; this drops the in-flight
     request and the stop latch too, which the key cannot do. A documented
     collaborator with no call site is a comment, not a seam. */
  try { window.HearthriseCharacter?.resetCharacterIntent?.(); } catch (e) {}
  try { window.HearthriseAccrual?.resetAccrualGate?.(); } catch (e) {}
  if (!supabase) { session = null; try { localStorage.removeItem(LOCAL_KEY); } catch (e) {} return; }
  await supabase.auth.signOut();
  session = null;
  localStorage.removeItem(LOCAL_KEY);
}

/** The user id carried by a supabase session object, or null. Pure. */
export function readUserIdFromSession(s) {
  const id = s && s.user && s.user.id;
  return (typeof id === 'string' && id) ? id : null;
}

/**
 * The signed-in user id, readable at ANY point in boot — from the live session
 * if setupAuth() has run, otherwise from the cached session blob. legacy.js
 * needs this inside loadLocal()/saveLocal(), which run before this module's
 * session variable is necessarily populated, so it must not depend on init order.
 */
export function currentUserId() {
  const live = readUserIdFromSession(session);
  if (live) return live;
  try { return readUserIdFromSession(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')); }
  catch (e) { return null; }
}

export function getSession() {
  return session;
}

export function isSignedIn() {
  return !!session?.access_token;
}

// Expose the shared Supabase client so other backends (chat, market, etc.)
// can reuse it instead of each calling createClient() and tripping the
// "Multiple GoTrueClient instances detected" warning. Returns null until
// setupAuth() has finished — callers should fall through to createClient
// in that case.
export function getClient() {
  return supabase;
}

// ── UI: replace the topbar Sign In button with a real flow ──

function renderAuthUi() {
  const banner = document.getElementById('status-pill') || document.getElementById('hr-auth-banner');
  if (banner) {
    /* b217: this wrote the whole pill as textContent with a 🟢/⚪ emoji in
       front — which also blew away the styled `.dot` span the markup ships,
       replacing a themed status light with a system pictograph. Set the LABEL
       and let the class drive the light. */
    const label = banner.querySelector('span:last-child') || banner;
    if (session?.user) {
      banner.classList.remove('off');
      /* b241 (paione): this printed the raw account EMAIL on the topbar status
         pill — long enough to overlap the stat chips on a phone, and it leaked
         the address into every screenshot. The pill is a CONNECTION indicator
         (the green dot is the signal); the player's name is already shown beside
         it. So it reads "Online", not an email. */
      label.textContent = 'Online';
    } else {
      banner.classList.add('off');
      /* b224: was "Offline · sign in to sync" / "Offline play" — a standing
         invitation to play without an account, which the product no longer
         offers. Inside a session this state means the token lapsed or the
         network went, not that account-less play is on the menu. */
      label.textContent = authConfig ? 'Signed out' : 'Offline';
    }
  }
  // Replace the "Sign in" button on the profile dashboard if it exists
  document.querySelectorAll('button').forEach((b) => {
    if (b.textContent.trim() === 'Sign in' && !b._authPatched) {
      b._authPatched = true;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthModal();
      });
    }
  });
}

function showAuthModal() {
  if (!authConfig) {
    alert('Cloud sync isn\'t configured yet. Talk to your developer to set up Supabase.');
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <form style="background:#1a1f2e;border:2px solid #f3d181;border-radius:8px;padding:20px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px;color:#dfe9ee;font-family:system-ui,sans-serif">
      <h3 style="margin:0;color:#f3d181">Sign in to Hearthrise</h3>
      <p style="margin:0;font-size:calc(14.5px * var(--ui-scale, 1));color:#9aa3b0">Sync your save across devices, join clans, climb leaderboards.</p>
      <input type="email" name="email" placeholder="Email" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />
      <input type="password" name="password" placeholder="Password" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="submit" data-action="signin" style="flex:1;padding:8px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Sign In</button>
        <button type="button" data-action="signup" style="flex:1;padding:8px;background:#5fcc7c;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">Create Account</button>
      </div>
      <button type="button" data-action="cancel" style="padding:6px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1))">Cancel</button>
      <div data-status style="font-size:calc(14.5px * var(--ui-scale, 1));color:#e88a8a;min-height:14px;text-align:center"></div>
    </form>
  `;
  const form = overlay.querySelector('form');
  const status = overlay.querySelector('[data-status]');
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('[data-action="cancel"]').onclick = close;

  async function attempt(fn) {
    status.textContent = 'Working…';
    try {
      const email = form.email.value.trim();
      const password = form.password.value;
      const data = await fn(email, password);
      status.style.color = '#5fcc7c';
      status.textContent = '✓ Signed in. Syncing…';
      setTimeout(close, 800);
    } catch (e) {
      status.style.color = '#e88a8a';
      status.textContent = e.message || 'Sign in failed';
    }
  }
  overlay.querySelector('[data-action="signin"]').onclick = (e) => { e.preventDefault(); attempt(signIn); };
  overlay.querySelector('[data-action="signup"]').onclick = (e) => { e.preventDefault(); attempt(signUp); };
  document.body.appendChild(overlay);
}

// b302: this device was kicked (account opened elsewhere). Stop everything that
// could overwrite the new device's save, then show a blocking, self-contained
// lock screen. Inline styles + max z-index on purpose — it must render even if
// the game's own CSS is mid-teardown. "Use here instead" re-claims for this
// device and reloads (which then evicts the other one on its next poll).
/* ── b331: THE SIGN-IN-EXPIRED SHEET ─────────────────────────────────────────
   The honest version of "⚠️ Reconnecting…". By the time this shows, the breaker
   has proved the token cannot be refreshed, so there is nothing to reconnect to
   and no amount of waiting will help. It states where the progress actually is,
   what would destroy it, and offers the single control that fixes it.

   It does NOT stop the game and does NOT clear LOCAL_KEY — that key is what the
   account gate opens on, and the refresh token inside it is the only thing that
   can still recover this session. Deliberately DISMISSIBLE, unlike the b302
   eviction gate: eviction protects another device's save (blocking), this one
   protects this device's, and locking a player out of a running game because
   their token lapsed would be a worse bug than the one it reports.

   Coordination with b302: eviction is the stronger state. This sheet never draws
   over the eviction gate, and the eviction gate removes it on the way up. */
export function showAuthExpiredGate(info) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (document.getElementById('hr-evicted-gate')) return null;   // b302 wins
  const existing = document.getElementById('hr-auth-expired-gate');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'hr-auth-expired-gate';
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:18px',
    'z-index:2147483646', 'max-width:440px', 'width:calc(100% - 24px)',
    'background:rgba(9,12,17,.96)', 'color:#f2e9d8', 'border:1px solid #d9a441',
    'border-radius:12px', 'padding:16px 18px', 'box-sizing:border-box',
    'font:400 14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,.5)'
  ].join(';');
  el.innerHTML =
    '<div style="font:700 16px/1.3 system-ui,sans-serif;margin-bottom:6px">🔒 Your sign-in expired</div>' +
    '<p style="margin:0 0 6px">Hearthrise has stopped saving to the cloud. Everything since then is stored '
    + '<strong>on this device only</strong> — clearing your browser data would lose it.</p>' +
    '<p style="margin:0 0 12px;opacity:.75">Sign in again and your progress uploads straight away.</p>' +
    '<div style="display:flex;gap:8px">' +
    '<button id="hr-authexp-signin" style="flex:1;font:600 15px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:8px;padding:11px 16px;cursor:pointer">Sign in again</button>' +
    '<button id="hr-authexp-later" style="font:500 14px/1 system-ui,sans-serif;background:transparent;color:#c9c2b4;border:1px solid #3a4154;border-radius:8px;padding:11px 14px;cursor:pointer">Not now</button>' +
    '</div>';
  document.body.appendChild(el);
  const go = el.querySelector('#hr-authexp-signin');
  if (go) go.addEventListener('click', () => { try { showAuthModal(); } catch (e) {} });
  const later = el.querySelector('#hr-authexp-later');
  if (later) later.addEventListener('click', () => hideAuthExpiredGate());
  return el;
}

export function hideAuthExpiredGate() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('hr-auth-expired-gate');
  if (el) el.remove();
}

function showEvictedGate() {
  hideAuthExpiredGate();                                     // b331: eviction outranks it
  try { if (window.HearthriseSync && window.HearthriseSync.pauseSync) window.HearthriseSync.pauseSync(); } catch (e) {}
  try { if (typeof window.stopCombat === 'function') window.stopCombat(); } catch (e) {}
  try { if (typeof window.stopSkill === 'function') window.stopSkill(); } catch (e) {}
  if (document.getElementById('hr-evicted-gate')) return;
  const el = document.createElement('div');
  el.id = 'hr-evicted-gate';
  el.setAttribute('role', 'dialog');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(9,12,17,.94)', 'color:#f2e9d8',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'text-align:center', 'padding:24px', 'box-sizing:border-box',
    'font:400 16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'backdrop-filter:blur(3px)'
  ].join(';');
  el.innerHTML =
    '<div style="max-width:460px">' +
    '<div style="font-size:44px;margin-bottom:8px">🔒</div>' +
    '<h2 style="font-family:Cinzel,serif;font-size:24px;margin:0 0 10px">Signed out here</h2>' +
    '<p style="margin:0 0 6px">Your account was just opened on another device.</p>' +
    '<p style="margin:0 0 20px;opacity:.8">Hearthrise runs on one device at a time, so this one has paused to keep your progress safe.</p>' +
    '<button id="hr-evicted-usehere" style="font:600 16px/1 system-ui,sans-serif;background:#d9a441;color:#1a130a;border:0;border-radius:10px;padding:14px 22px;cursor:pointer">Use this device instead</button>' +
    '<div style="margin-top:14px;font-size:13px;opacity:.6">Tap above to move your session here (this will sign the other device out).</div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(el);
  const btn = el.querySelector('#hr-evicted-usehere');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Moving your session…';
    try { if (window.HearthriseSync && window.HearthriseSync.claimSession) await window.HearthriseSync.claimSession(); } catch (e) {}
    location.reload();
  });
}

// Expose for legacy callers
window.HearthriseAuth = {
  setupAuth, signUp, signIn, signOut, getSession, isSignedIn, getClient, currentUserId,
  decideLocalOwnership, buildIntentWiring, wireServerIntents, buildSaveWiring,
  // b340 — the cloud half of the record strip, exported so the test drives the
  // CALLER rather than re-deriving what the caller ought to do (B339's lesson).
  stripRecordFieldsForOverlay,
  // b347 — the whole cloud→G seam, exported for the same reason: the strip and
  // the watermark re-stamp were undoing each other and no test could see either.
  applyCloudOverlay,
  // b331 — expired-session recovery + the sheet that tells the player the truth
  recoverSession, syncFailureMessage, ESCALATE_AFTER_MS,
  showAuthExpiredGate, hideAuthExpiredGate,
};

// Auto-render banner state once on load (in case the user is already signed in)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderAuthUi, 500));
} else {
  setTimeout(renderAuthUi, 500);
}

// b300: after a cloud-restore reload, tell the player their newer save was
// pulled in — a silent state swap on sign-in would otherwise look like a bug.
try {
  if (sessionStorage.getItem('hr:restoredFromCloud') === '1') {
    sessionStorage.removeItem('hr:restoredFromCloud');
    setTimeout(() => { if (typeof window.notify === 'function') window.notify('☁️ Restored your latest progress from the cloud.', 'info'); }, 1800);
  }
} catch (e) {}
