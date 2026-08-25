// ============================================================================
// src/net/client-state.js — THE HOME (client half) FOR NON-AUTHORITY RESIDUE.
//
// The server-authority program moved every AUTHORITY field into the fail-closed
// record framework (src/net/record.js): gold, gems, skills, equipment, rooms,
// marks, rested XP, plus the inventory/farming/companion mechanisms. What is
// LEFT in the client-authored snapshot() blob is NON-AUTHORITY residue —
// self-only data that, by CLAUDE.md's mandate, "cannot cross into another
// player's economy or ranking", so it does NOT need the record framework's
// fail-closed accessor + fingerprint + UNKNOWN machinery. It needs a HOME so
// the blob can be retired.
//
// THE RESIDUE (the fields the capstone will route through here):
//   · bountyHunter (MINUS marks — marks is already a record field)
//   · stats            (kills/gathered/harvested/rareDrops/playMs — counters)
//   · chronicle        (the permanent achievement log)
//   · activeStyle      (which loadout is active — a pref)
//   · foodSlot         (equipped-food pointer — a pref; the food itself is
//                       server-owned inventory)
//   … plus the wider self-only tail the census names (settings, ownedThemes,
//   ownedCosmetics, houseTheme, daily, collection, quests, entitlements, …) —
//   the capstone decides the exact set; this store is a generic verbatim bag,
//   so adding a field is a client decision, not a schema change.
//
// ── THE CONTRACT, DELIBERATELY SIMPLER THAN record.js ───────────────────────
// This is NOT the record framework and must not be mistaken for it. It is a
// VERBATIM key/value store. A forged value here is self-only (the server never
// computes authority on client_state), so there is no fingerprint, no
// fail-closed UNKNOWN, no strip. The one rule it shares with record.js: while
// DORMANT it changes NOTHING — every read falls through to the blob (`G[field]`)
// exactly as today.
//
//   DORMANT  (CLIENT_STATE_SERVER_BACKED=false, or the master switch off):
//            clientField(G, f) === G[f]. The uploader is a no-op seam.
//   ARMED    (flag true AND the master accrual switch on, POST-WIPE only):
//            clientField(G, f) reads the server envelope's `client_state[f]`;
//            putClientState() ships changes to hr_put_client_state.
//
// ── THE SWITCH (post-wipe capstone) ─────────────────────────────────────────
// Flipping CLIENT_STATE_SERVER_BACKED to true is NOT this file's job. It is the
// capstone, and it additionally requires: (1) every residue READ routed through
// clientField / the typed helpers; (2) the residue fields dropped from
// snapshot() (or the blob stops being uploaded entirely); (3) putClientState
// wired into the save loop so a change is persisted; (4) POST-WIPE. Until then
// the const ships false and this module is inert.
//
// DOM-free. Node-importable. `fetch` resolves at call time (accrue.js's rule),
// so a test's override IS the transport.
// ============================================================================

import { isServerAccrualEnabled, resolveActiveSlot } from './accrue.js?v=481';

/* ── THE DORMANT ARM ─────────────────────────────────────────────────────────
   Same shape as record.js's per-field arms (SKILLS_RECORD_ARM_ENABLED et al):
   a greppable const defaulting OFF, a test override seam, and a runtime
   predicate that ALSO requires the master accrual switch — so the store can
   never be "server-backed" while the record system as a whole is off (which
   would read residue server-first while the blob still authored it). */
export const CLIENT_STATE_SERVER_BACKED = false;   // DORMANT — post-wipe capstone only
let armOverride = null;
/* THE CAPSTONE COUPLING. The blob-retire capstone (src/net/capstone.js) is the
   SINGLE switch for the whole finish line, and residue reads must follow it — so
   when the capstone is armed, this store is server-backed too, without a second
   flag to flip. Read off the window global at CALL time (not a static import) to
   keep this low-level module free of an import cycle with capstone.js, which
   imports THIS module for isClientStateFromServer. In a Node test with no window,
   this is inert and the armed path is driven via __setClientStateArm instead. */
function capstoneArmed() {
  try {
    if (typeof window !== 'undefined' && window.HearthriseCapstone
        && typeof window.HearthriseCapstone.isBlobRetired === 'function') {
      return !!window.HearthriseCapstone.isBlobRetired();
    }
  } catch (e) {}
  return false;
}
export function isClientStateServerBacked() {
  const on = armOverride !== null ? armOverride : (CLIENT_STATE_SERVER_BACKED || capstoneArmed());
  return !!on && isServerAccrualEnabled();
}
/** Test seam, same spirit as record.js's __setSkillsRecordArm. */
export function __setClientStateArm(v) {
  armOverride = (v === null || v === undefined) ? null : !!v;
  return isClientStateServerBacked();
}

/* ── THE RESIDUE ALLOWLIST — THE HYDRATE SECURITY BOUNDARY ────────────────────
   This list lives HERE, in the low-level store, because hydrateInto() below is
   the security-critical writer and MUST NOT trust the bag's key set. `cs` is
   `res.client_state` = the raw `player_state.client_state` jsonb, which
   hr_put_client_state merges VERBATIM — a malicious client can call it on its
   OWN row (RLS permits) with a forged AUTHORITY key (`gold`, `skills`,
   `inventory`, …). If hydrateInto splatted every bag key into G, that forged
   value would poison G.gold / G.skills — a latent authority-forge vector (the
   gold census forbids exactly this). So hydrateInto iterates THIS allowlist and
   writes ONLY these self-only fields; an authority key in the bag is IGNORED.

   capstone.js imports RESIDUE_FIELDS from here (it already depends on this
   module), so there is one list and no cycle. The server enforces the same
   boundary independently (hr_put_client_state deny-list) — defense in depth. */
export const RESIDUE_FIELDS = Object.freeze([
  'bountyHunter',   // WHOLLY residue now (marks migrated to top-level G.marks); hydrateInto drops any stray nested marks
  'stats',          // kills/gathered/harvested/rareDrops/playMs counters
  'chronicle',      // the permanent achievement log
  'activeStyle',    // active loadout pointer (a pref)
  'foodSlot',       // equipped-food pointer (the food itself is server inventory)
  'settings',
  'ownedThemes',
  'ownedCosmetics',
  'houseTheme',
  'plotBuildings',
  'daily',
  'collection',
  'quests',
  'entitlements',
  'playerName',     // the player's OWN copy; cross-player name is server-derived
  'lastSeen',       // the client's own last-active stamp (NOT the authority watermark)
  'autoEatPct',     // auto-eat threshold pref (the authoritative eat is server combat;
                    // this is the client's own slider position — self-only, would reset to 0.5 otherwise)
  'createdAt',      // the account's Founder date — self-only display; would be lost under arm otherwise
  'heroSlotsUnlocked', // b459: hero-slot ENTITLEMENT (the gems payment is the record side; this is
                    // which slots the account owns). Was stranded under arm — a purchased slot
                    // would vanish on reload; caught while fixing SLOT-BUY-1.
  /* b462 — THE "SHOWN TODAY" MARKERS. These four were self-only flags that
     lived in the save blob; with the blob retired every reload forgot them, so
     the daily-reward sheet re-opened on every refresh (Tyler, beta morning:
     "every refresh i get a new daily reward"). The SERVER once-guards the pay
     (claim_reward refuses the second claim — those were the not_claimable
     blips) so no gold moved twice, but the player was shown a reward that did
     not land, every time. None of these is an authority field: the server
     derives the real streak from its own claim rows and the quest modal reads
     hr_goal_state under arm; these are "what have I already been shown". */
  'dailyReward',    // { lastClaimDay } — the daily login sheet's shown-today cache
  'streak',         // { count, lastDay } — the streak the sheet DISPLAYS (server derives the paid one)
  'dailyGoals',     // quest-modal day picks + local claimed/startValues (server state is the truth under arm)
  'weeklyGoals',    // same, weekly
  /* b462 — THE SWEEP (CLAUDE.md session criterion 3: kill the class). Every
     `G.<field>` the game writes, minus record ∪ residue ∪ NO_SYNC, classified.
     These twelve are self-only prefs/markers the blob used to carry and nothing
     else persists — each one was a "forgotten on reload" bug waiting for a
     player to report it. None is an authority field (the server's deny-list
     and this allowlist both agree); each is the client's own memory of a
     choice it already made or a sheet it already showed. */
  'combatStyle',    // the style picked per weapon family (reset to default every reload)
  'loadouts',       // saved gear loadouts (the SET is client-authored; equipping still goes through hr_equip)
  'lockedItems',    // items locked against selling
  'autoActions',    // auto-eat food pick / auto-replant prefs (the auto-eat TRIGGER itself is server: hr_set_auto_eat)
  'lastWelcome',    // welcome/changelog modal "shown for this build" stamp
  'achievements',   // {id:{progress,unlocked}} — re-deriving from stats re-toasts every unlock on reload
  'dungeons',       // { lastRun:{id:ms} } — dungeon cooldowns (the b288 exploit: reload = free runs)
  'renown',         // { claimed:[], seenRank } — claimed ranks are server once-guarded; this is the shown state
  'unlockedRecipes',// gated recipe unlocks the client has learned (server rows exist; this is the read cache)
  'tools',          // tool slots in the loadout kit
  'buffs',          // active consumable buffs (remainingMs) — short-lived, but a potion must survive a reload
  'lastActivity',   // the launchpad's "resume what you were doing" card
  /* ── b466 — THE SECOND SWEEP (paione, live open beta: "Bestiary achievements
     keep resetting every time you log out and in"). The b462 sweep above was
     run by hand against a hand-typed census, so it only ever found the fields
     somebody remembered to type — `bestiary` had been written by the game since
     b288 and was on no list at all. Re-run MECHANICALLY (every `G.<field>` write
     scanned out of src/ vs record ∪ residue ∪ mechanism ∪ NO_SYNC) it surfaced
     nineteen strands: these FIFTEEN are self-only PROGRESS and reset on every
     single reload today, three are in-flight scratch (now declared in NO_SYNC)
     and one — `traits` — already had a server mechanism (see the note below).
     tests/arm-homing-guard.mjs now derives that census from source, so this
     class cannot come back one player report at a time.
     None of these is an authority field: each name was checked against the
     hr_put_client_state deny-list (gold, gems, hearthTokens, skills, inventory,
     bank, equipment, rooms, marks, restedXp, restedAt, farmPlots, farm,
     companions, offlineBudget) — no collision, so none of these can be refused
     by the server as a forbidden_field. */
  'bestiary',       // {monsterId:{kills,firstKill}} — THE REPORTED BUG; the bestiary IS the kill record
  'dropLog',        // per-monster drop discovery ("have I ever seen this drop?")
  'collectionLog',  // {claimed:[]} — collection MILESTONE claims. NOT an alias of `collection`
                    // above: `collection` is {itemId:count} (what you have found),
                    // this is which milestone rewards you have taken. Both are real.
  /* ⚠ `traits` is DELIBERATELY NOT HERE. It looks exactly like the rest of this
     list (paid with Marks, self-only, reset on reload) and was the first thing
     the sweep wanted to add — but it already HAS a server home:
     accrue.js reconcileTraits() unions `res.traits` (hr_state_of projects the
     player_progress `trait:<id>` rows hr_trait_buy writes) into G.traits on
     every envelope. Adding it here would give one paid entitlement TWO sources
     — the b443 nested-marks bug in a new costume — and would let a forged
     client_state key hydrate a trait the server never sold. It is registered in
     the guard's SERVER_MECHANISM_FIELDS instead. */
  'lifetimeKills',  // the ratcheting all-time kill counter (falls back to stats.kills, which under-counts)
  'renownHigh',     // the renown high-water mark every rank claim is gated on
  'homestead',      // {tier} — the purchased homestead tier; without it the boot RE-DERIVES a
                    // grandfathered tier from rooms/skills, silently demoting a paid upgrade
  'wieldGrandfather', // {itemId:true} — "once worn, always re-wearable"; losing it can un-wield live gear
  'currentCombatTier', // which monster tier the combat picker is showing (b213 saved it on purpose)
  'toolCarry',      // fractional gather carry-over per tool — mutated by reference each tick
  'buyback',        // the 15-entry recently-sold list; a reload must not eat a misclick's undo
  'dailyGoldStart', // {day,gold,earned} — the day's gold baseline the daily goals measure against;
                    // reset on reload = the gold-earned goal restarts from the current balance
  'raids',          // {lastStrikeDay, solo:{week,…}, claimed:{}} — weekly raid progress AND the
                    // claim/cooldown markers (the b288 dungeon lesson: a forgotten cooldown is a faucet)
  'muster',         // the daily muster's day/slot/claimed state (server once-guards the pay; this is
                    // what the player has already been shown and taken)
  'rallyPledge',    // a pledge deliberately OUTLIVES the UTC day roll — settlement clears it, not time
  'pendingItemSpends', // item-ledger.js's outstanding client-authored trades. Its own header: an
                    // outstanding trade that did not survive a reload "would be reverted by the first
                    // envelope after it, taking the player's blueprint with it"
]);
const RESIDUE_SET = new Set(RESIDUE_FIELDS);

/* ── THE SERVER-SUPPLIED VERBATIM BAG ────────────────────────────────────────
   Populated from an envelope's top-level `client_state`. Module-scoped rather
   than stamped onto G, because it is NOT part of the save blob and must never
   ride back up into it — the whole point is to get this OUT of the blob. A
   monotonic-ish guard is unnecessary: this is a verbatim store, not a watermark,
   and a stale envelope simply re-supplies the same bag. */
let serverBag = null;   // null = never received; an object once an envelope arrives.
/* b455 — has the bag been WRITTEN INTO G this session? The bag itself is
   refreshed by every envelope; the hydrate happens once. See applyClientState. */
let hydratedOnce = false;

/** Feed a server envelope (the hr_load / hr-accrue shape) into the store. Only
 *  consulted while ARMED, but always safe to call. A malformed / absent
 *  client_state leaves the previous bag untouched (an absent key is not a
 *  reason to forget what the last good envelope supplied).
 *
 *  ── HYDRATE-INTO-G (the capstone model) ──────────────────────────────────────
 *  When `G` is supplied, every residue field is written STRAIGHT INTO G from the
 *  bag, so G becomes server truth and every existing `G.<residue>` read site is
 *  already correct with ZERO per-site routing — this is what retires the
 *  1,001-site read sweep. Residue is NON-AUTHORITY (self-only), so there is no
 *  forgery concern and no fail-closed per-site accessor is needed: a hydrated G
 *  is exactly as trustworthy as the server bag it came from.
 *
 *  ⚠ bountyHunter USED TO HOLD A NESTED AUTHORITY FIELD (bountyHunter.marks). Marks
 *  have MIGRATED to the top-level scalar `G.marks` — a plain record field like gold
 *  — so bountyHunter is now WHOLLY residue. hydrateInto still DROPS any `marks` key
 *  defensively (a forged bag key or a stray legacy nested marks must never shadow the
 *  top-level record authority), and buildResiduePatch (capstone.js) likewise excludes
 *  it on the way out. No residue field carries a nested field owned elsewhere anymore
 *  (audited: stats/chronicle/collection/daily/quests/settings/… are wholly self-only). */
export function applyClientState(res, G) {
  if (!res || typeof res !== 'object' || res.ok !== true) return false;
  const cs = res.client_state;
  if (cs === null || typeof cs !== 'object' || Array.isArray(cs)) return false;
  serverBag = cs;
  /* HYDRATE ONLY WHEN ARMED. Populating serverBag is inert while dormant (nothing
     reads it), but WRITING into G is observable — so the hydrate is gated on the
     arm, keeping the dormant load path byte-for-byte unchanged even though
     record.js calls this on every load. */
  if (!G || typeof G !== 'object' || !isClientStateServerBacked()) return true;
  /* ── b455 — HYDRATE **ONCE**. A LOAD IS NOT A RECONCILE. ────────────────────
     MEASURED LIVE, in a 12-second window mid-fight:
         start {kills:3756, …}   ← the kill landed instantly
         +12s  {kills:3755, …}   ← this function put the old number back
     The residue bag is SELF-ONLY and the CLIENT is its only writer; the server
     merely stores it and returns whatever was last uploaded, which is by
     definition BEHIND the live session (the residue rides the save cadence).
     record.js calls this on every `hr_load`, and processOffline re-runs one on
     every visibility return / focus — so re-hydrating meant a stale, uploaded
     copy of the player's own counters overwriting the ones they were watching
     move. Kills, quest progress, the collection log and the chronicle all
     rubber-banded backwards.

     There is nothing to reconcile here and no authority to defer to: hydrating
     is a LOAD, it happens once per session, and after that the live G is the
     freshest copy in existence. Later envelopes still refresh `serverBag` above
     (so `clientField` and `isClientStateFromServer` stay current) — only the
     WRITE into G is once.

     ⚠ The latch is cleared by `__resetClientState`, which is the sign-out /
       fresh-character seam. A slot switch reloads the page, so a new character
       always gets its own hydrate. */
  if (hydratedOnce) return true;
  hydratedOnce = true;
  hydrateInto(G, cs);
  return true;
}

/** Has the residue been written into G this session? Exported so a diagnostic
 *  (and the guard) can tell "the bag arrived" from "the bag was applied". */
export function isClientStateHydrated() { return hydratedOnce; }

/** Write the residue bag into G — ALLOWLISTED. Iterates RESIDUE_FIELDS, never the
 *  bag's own key set, so a forged AUTHORITY key in `cs` (gold/skills/inventory/…)
 *  is IGNORED and can never reach G. This is the security boundary: the bag is the
 *  raw, client-writable player_state.client_state, so it is untrusted input. The
 *  bountyHunter/marks carve-out preserves the record-owned marks. */
/* EXPORTED (b466) so the round-trip is testable as a PURE function. The live
   hydrate is once-per-session and latched (see applyClientState), so a test that
   drove it through the envelope path would either be vacuous — the latch is
   already closed on a booted page — or would have to reset the session's own
   bag. This is the same function the load path calls, on a caller-supplied
   object; nothing about the session is touched. */
export function hydrateInto(G, cs) {
  for (const f of RESIDUE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(cs, f)) continue;   // bag didn't supply it
    if (f === 'bountyHunter') {
      /* Marks MIGRATED to the top-level scalar `G.marks` (a record field like gold),
         so bountyHunter is now WHOLLY residue — there is no nested authority to
         preserve. We still DROP any `marks` key defensively: a forged marks in the
         bag, or a stray nested marks from a legacy blob, must never land inside
         G.bountyHunter and shadow the record's top-level authority. */
      const bagBH = cs[f];
      if (bagBH === null || typeof bagBH !== 'object' || Array.isArray(bagBH)) { G[f] = bagBH; continue; }
      const merged = { ...bagBH };
      delete merged.marks;                  // never a nested marks — top-level G.marks is authority
      G[f] = merged;
      continue;
    }
    G[f] = cs[f];
  }
}

/** Test / boot seam: forget the server bag (a fresh character, a sign-out). */
export function __resetClientState() { serverBag = null; hydratedOnce = false; }

/* ── THE READ ────────────────────────────────────────────────────────────────
   The ONE accessor every residue read should route through. DORMANT → the blob
   value, byte-for-byte as today. ARMED → the server bag's value; a key the
   server has never supplied yields `fallback` (default undefined), matching how
   a fresh field reads before it is ever written. There is no UNKNOWN/fail-closed
   state, on purpose: a self-only pref that briefly reads as its default cannot
   be exploited, and blocking the UI on it (the record framework's behaviour for
   money) would be user-hostile for zero security benefit. */
export function clientField(G, field, fallback) {
  if (!G || typeof G !== 'object') return fallback;
  if (!isClientStateServerBacked()) {
    return Object.prototype.hasOwnProperty.call(G, field) ? G[field] : fallback;
  }
  if (serverBag && Object.prototype.hasOwnProperty.call(serverBag, field)) {
    return serverBag[field];
  }
  return fallback;
}

/** Is the residue currently sourced from the server (armed AND a bag received)? */
export function isClientStateFromServer() {
  return isClientStateServerBacked() && serverBag !== null;
}

/* ── THE WRITE (dormant seam) ────────────────────────────────────────────────
   Builds and POSTs a shallow-merge patch to hr_put_client_state. It is EXPORTED
   but NOT wired into the live save loop — the capstone does that. Dormant, it is
   never called; armed, the caller passes the SUPABASE_URL, an anon key, a JWT
   and a fetch (resolved at call time so a test can inject transport). The patch
   is a plain object of the residue fields that changed; the server merges it
   over the stored bag. p_idem makes a replay a no-op (the merge is naturally
   idempotent regardless).

   Returns {ok, ...} from the RPC, or {ok:false, error} on a transport failure —
   a failed put is NEVER fatal (residue is self-only), it just retries next save. */
export async function putClientState(patch, opts) {
  const o = opts || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'bad_patch' };
  }
  const url = o.url;
  const anonKey = o.anonKey;
  const jwt = o.jwt;
  if (!url || !anonKey || !jwt) return { ok: false, error: 'not_configured' };
  const slot = (o.slot !== undefined && o.slot !== null) ? o.slot : resolveActiveSlot(o.pinnedSlot);
  const idem = o.idem || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9));
  /* b459: honor an injected transport FIRST — sync.js passes fetchWithAuthRetry
     here so the capstone save write gets the gateway-retry + auth-accounting
     hardening (the bare global fetch had silently bypassed both), and a test's
     override really is the transport, as the header promises. */
  const f = (typeof o.fetch === 'function') ? o.fetch
    : (typeof fetch !== 'undefined') ? fetch : null;
  if (!f) return { ok: false, error: 'no_fetch' };
  try {
    const resp = await f(url.replace(/\/$/, '') + '/rest/v1/rpc/hr_put_client_state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + jwt,
      },
      body: JSON.stringify({ p_slot: slot, p_patch: patch, p_idem: idem }),
    });
    if (!resp || !resp.ok) return { ok: false, error: 'http_' + (resp && resp.status) };
    return await resp.json();
  } catch (e) {
    return { ok: false, error: 'transport', detail: e && e.message };
  }
}

if (typeof window !== 'undefined') {
  window.HearthriseClientState = {
    clientField, isClientStateServerBacked, isClientStateFromServer,
    applyClientState, putClientState, isClientStateHydrated,
    hydrateInto, RESIDUE_FIELDS,
  };
}
