// Companions feature module — full lifecycle in one file.
//
// Imports:
//   - COMPANIONS data from src/data/companions.js
//   - state event bus for cloud-sync hooks
// Exports:
//   - setupCompanions() — wires hooks, renders UI, must be called once at boot
//   - getCompanionBonus() — read-only stat lookup (also exposed on window for legacy callers)
//   - awardCompanionXp(amount) — typed XP award
//   - unlockCompanion(id) — adds to stable, emits 'companionUnlock'
//   - equipCompanion(id) / unequipCompanion()
//
// Online-readiness: every state mutation here goes through emit() so a future
// network adapter can ship companion changes to the backend.

import { COMPANIONS } from '../data/companions.js?v=505';
import { emit } from '../net/events.js?v=505';
/* THE SERVER-OF-RECORD ARM SWITCH for companion XP. While false (DORMANT) the
   client awards companion XP locally exactly as before. When flipped true, the
   accrual engine becomes the sole writer (a `stat companion_xp:<id>` op priced
   at settle/away) and the local award below MUST stop, or the two double-count:
   the server accrues the same role-matched actions this client seam does. The
   passive bonus already reads server companion XP through hr_perks_of, so under
   arm the level shown reconciles to server truth. */
import { COMPANION_XP_SERVER_BACKED } from '../core/companion-xp.js?v=505';

// b229 (Asset Director — "pet icons"): every companion in COMPANIONS still
// carries an emoji `icon` field (data stays as-authored — other consumers may
// still want a text label), but render sites bypass it through the shared
// helper legacy.js defines (`companionIconHtml()`, alongside the
// COMPANION_PORTRAIT map + the honest-match reasoning for why only 2 of the
// 22 have painted art yet). legacy.js loads before this module's render
// functions ever run, so the window binding is always present by call time;
// the ternary is defense-in-depth only, and it degrades to nothing — never
// back to the emoji — if it's ever missing.
function companionIconHtml(id, px) {
  return (typeof window.companionIconHtml === 'function') ? window.companionIconHtml(id, px) : '';
}

// ── b371 (F20) — THE LOCK HINT IS COPY, NOT A KEY ────────────────────────
//
// The Stable printed `Locked · ${def.source}` straight from the data, so the
// player was shown "Locked · shop:8000:cooking25", "Locked · drop:small_wolf",
// "Locked · hatch:dragon_egg" and "Locked · skill:fishing:2500" — nineteen
// internal identifiers, on the screen whose entire job is to tell you how to
// get the thing. `small_wolf` is not even the monster's name (it is "Wolf
// Cub"), so the one hint a player could half-parse pointed at a creature that
// does not exist under that name anywhere in the game.
//
// Every part is resolved from the same tables the rest of the UI reads, so a
// renamed monster or a re-tuned rate updates here for free. Anything this
// function cannot resolve degrades to the id it was given rather than to a
// blank — an unhelpful hint beats a missing one, and it stays greppable.
/* Last-resort humaniser. `hatch:dragon_egg` was the case that proved it is
   needed: there is no `dragon_egg` row in ITEMS at all (it is a hatch source
   with no inventory entry), so the lookup fell through and my first pass
   printed "Hatched from a dragon_egg" — the very defect companionSourceLabel
   exists to remove, reintroduced by its own fallback. Caught by reading the
   render, not the code.

   b499: hoisted to module scope (verbatim) because the REFUSAL copy needs the
   same item humaniser — `missing_req_item` names the item the server wanted,
   and `dragon_egg` is exactly the id with no ITEMS row. Two copies of this
   would drift the moment one of them learned about a new catalogue. */
const titleizeId = (id) => String(id || '')
  .split(/[_\-:]/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(' ');
const itemLabel = (id) => {
  const it = window.ITEMS && window.ITEMS[id];
  return (it && (it.n || it.name)) || titleizeId(id);
};

export function companionSourceLabel(source) {
  const raw = String(source || '');
  const p = raw.split(':');
  const titleize = titleizeId;
  const monster = (id) => {
    const m = window.MONSTERS && window.MONSTERS[id];
    return (m && (m.name || m.n)) || titleize(id);
  };
  const item = itemLabel;
  const skill = (id) => {
    const s = window.SKILLS_DEF && window.SKILLS_DEF[id];
    return (s && s.name) || titleize(id);
  };
  const num = (n) => Number(n || 0).toLocaleString();

  switch (p[0]) {
    case 'starter': return 'Yours from the start';
    case 'drop':    return `Rare drop from ${monster(p[1])}`;
    case 'hatch':   return `Hatched from a ${item(p[1])}`;
    /* Exactly one quest source exists today (`quest:harvest100`, the Bunny).
       A table rather than a parse, because "harvest100" is a milestone name,
       not a grammar — guessing a sentence out of it would be inventing copy. */
    case 'quest':   return ({ harvest100: 'Reward for harvesting 100 crops' })[p[1]] || 'Quest reward';
    case 'shop':
      // shop:GOLD  |  shop:GOLD:skillLEVEL  (e.g. shop:8000:cooking25)
      if (p[2]) {
        const gate = /^([a-z]+)(\d+)$/.exec(p[2]);
        if (gate) return `Stable shop · ${num(p[1])} gold · needs ${skill(gate[1])} ${gate[2]}`;
        return `Stable shop · ${num(p[1])} gold`;
      }
      return `Stable shop · ${num(p[1])} gold`;
    case 'skill':   return `1 in ${num(p[2])} ${skill(p[1])} actions`;
    case 'boss':    return `1 in ${num(p[2])} ${monster(p[1])} kills`;
    default:        return `Locked · ${raw}`;
  }
}

// XP curve: cumulative XP needed to reach level L.
//
// b228 — THE CAP DID NOT MATCH THE CURVE. The comment here said "~50K at L30"
// and awardCompanionXp clamped cumulative XP to 50,000; the curve actually
// needs 792,783 to reach 30. So every pet in the game stopped dead at level 14,
// halfway up a bar the Stable draws as "Lv N / 30", and the last sixteen levels
// were unreachable. Found by the rebase, because the power budget's companion
// share is stated at level 30 (×2.45) and a pet that can never get there is a
// budget line nobody can spend.
//
// The cap is now DERIVED from the curve — one source of truth, so the two can
// never disagree again. This is a power increase, and it lands in the same
// commit as the magnitudes that pay for it: a maxed pet is +2.45% on its key,
// which is the share §2.2 budgets for "a 1-in-2,500 pet at level 30".
export const COMPANION_MAX_LEVEL = 30;
export function companionXpToReach(L) {
  if (L <= 1) return 0;
  let total = 0;
  for (let i = 1; i < L; i++) total += Math.floor(50 * Math.pow(1.18, i - 1) * i);
  return total;
}
export const COMPANION_XP_CAP = companionXpToReach(COMPANION_MAX_LEVEL);

export function companionLevelFromXp(xp) {
  for (let L = 30; L >= 1; L--) {
    if (xp >= companionXpToReach(L)) return L;
  }
  return 1;
}

/* Is the blob-retire capstone armed? Read at call time off the window global —
   companions.js must stay free of an import cycle with the net layer, and the
   capstone flag is published there. Dormant (prod) → false, so every gate below is
   byte-for-byte today's behaviour. */
function blobRetired() {
  try {
    return !!(window.HearthriseCapstone
      && typeof window.HearthriseCapstone.isBlobRetired === 'function'
      && window.HearthriseCapstone.isBlobRetired());
  } catch (e) { return false; }
}

function ensureState() {
  const G = window.G;
  if (!G) return;
  /* ⚠ FAIL-CLOSED UNDER ARM (critical blocker) — mirror of legacy.js
     ensureCompanionState. Under the blob-retire arm the SERVER owns the roster
     (rebuilt by accrue.js reconcileCompanions from the envelope); seeding the
     starter fox here BEFORE that envelope arrives would silently reset the player.
     So under arm we seed an EMPTY roster, never fox, and never read a client
     equip value. Dormant, the original block runs unchanged. */
  if (blobRetired()) {
    if (!G.companions) G.companions = { ownedIds: [], xp: {}, equipped: null };
    return;
  }
  if (!G.companions) {
    G.companions = {
      ownedIds: ['fox'],
      xp: { fox: 0 },
      equipped: (window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(G, 'companion') : (G.equipment && G.equipment.companion)) === 'fox_companion' ? 'fox' : null,
    };
  }
  if ((window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(G, 'companion') : (G.equipment && G.equipment.companion)) === 'fox_companion' && !G.companions.equipped) {
    G.companions.equipped = 'fox';
  }
}

// ── Stat queries ──

export function getCompanionBonus() {
  ensureState();
  const out = {
    strB: 0, atkB: 0, defB: 0, crit: 0, allXP: 0,
    gatherSpeed: 0, farmYield: 0, cookSpeed: 0, smithSpeed: 0,
    craftSpeed: 0, prayerSpeed: 0, rareDrop: 0, goldFind: 0, hpRegen: 0,
  };
  const eq = window.G?.companions?.equipped;
  if (!eq) return out;
  const def = COMPANIONS[eq];
  if (!def) return out;
  const xp = window.G.companions.xp[eq] || 0;
  const lv = companionLevelFromXp(xp);
  const scale = 1 + (lv - 1) * 0.05;  // +5% per level above 1
  for (const [k, v] of Object.entries(def.bonus || {})) {
    out[k] = (out[k] || 0) + v * scale;
  }
  return out;
}

// ── Mutations ──

export function awardCompanionXp(amount) {
  /* ⚠ SERVER-OF-RECORD GATE (dormant). When companion XP is server-backed the
     accrual engine writes it (per role-matched action, at settle/away) and this
     local award would DOUBLE-COUNT — so it no-ops entirely. The equipped pet's
     level then comes from the server (hr_perks_of companion xp), reconciled on
     the next envelope, never authored here. While dormant this is inert and the
     client remains the writer, so there is no regression. */
  if (COMPANION_XP_SERVER_BACKED) return;
  /* ⚠ ALSO GATED OFF UNDER THE BLOB-RETIRE ARM. Companion XP is a SERVER-OWNED
     aggregate (player_progress kind='stat' key='companion_xp:<id>') the accrual
     engine writes, and under arm reconcileCompanions rebuilds G.companions.xp from
     the envelope every load. A local award would be authored-then-discarded (the
     blob is not uploaded under arm), so at best it makes the XP bar climb and then
     snap back to server truth on the next envelope. The client renders server
     state; it never authors an authoritative number. Dormant this is inert. */
  if (blobRetired()) return;
  ensureState();
  const eq = window.G?.companions?.equipped;
  if (!eq) return;
  const before = window.G.companions.xp[eq] || 0;
  const beforeLv = companionLevelFromXp(before);
  const next = Math.min(COMPANION_XP_CAP, before + amount);
  window.G.companions.xp[eq] = next;
  const afterLv = companionLevelFromXp(next);
  if (afterLv > beforeLv) {
    emit('companionLevelUp', { id: eq, level: afterLv });
    /* b313 (paione — companion stats mismatch): the equipment doll's Companion
       pane is only rebuilt when the doll is, so after a pet LEVELS UP it kept
       showing the old level/stats while inventory + combat (which read the live
       companion bonus every call) already showed the higher numbers. Refresh the
       doll on the level change so both agree. Guarded; only fires on a level-up. */
    try { if (typeof window.refreshAllDolls === 'function') window.refreshAllDolls(); } catch (e) {}
    try { if (typeof window.renderStable === 'function' && window.activeTab === 'stable') window.renderStable(); } catch (e) {}
  }
}

/**
 * Acquire a companion.
 *
 * @param id          the companion id
 * @param onUnlocked  OPTIONAL, called with (id) the moment the companion really
 *                    joins the stable — synchronously on the dormant path, and
 *                    only AFTER the server verdict under the capstone arm. Call
 *                    sites put their own celebration here (the drop's big toast,
 *                    pets.js's "a wild friend!", the hatch's egg consume) so a
 *                    refused acquisition never gets a party thrown for it.
 * @returns true only when the companion is in the local stable NOW. A dispatched
 *          (armed, awaiting verdict) grant returns false — it is not owned yet,
 *          and saying otherwise is the bug this function was rewritten to kill.
 */
export function unlockCompanion(id, onUnlocked) {
  ensureState();
  if (!COMPANIONS[id]) return false;
  if (window.G.companions.ownedIds.includes(id)) return false;
  /* ⚠ SERVER-CONFIRMED BEFORE IT APPEARS (b499). See requestServerUnlock. */
  if (needsServerConfirm(id)) { requestServerUnlock(id, onUnlocked); return false; }
  applyUnlockLocally(id, onUnlocked);
  return true;
}

/* The local half of an acquisition — VERBATIM the body unlockCompanion used to
   have, minus the transport. Extracted so the armed path can run exactly the
   same writes a beat later, rather than growing a second (drifting) copy. */
function applyUnlockLocally(id, onUnlocked) {
  window.G.companions.ownedIds.push(id);
  window.G.companions.xp[id] = 0;
  if (typeof window.notify === 'function') {
    /* b465: the trailing `${...icon}` pasted the data row's raw emoji into a
       plain-text toast — the Final Directive's no-emoji-as-art rule, in a
       string. The companion's NAME is the thing worth saying. */
    window.notify(`Companion unlocked: ${COMPANIONS[id].n}`, 'loot');
  }
  emit('companionUnlock', { id });
  if (typeof onUnlocked === 'function') { try { onUnlocked(id); } catch (e) {} }
}

/* ── SERVER TRANSPORT (companion-grant) — persist a NON-SHOP acquisition ──────
   Every non-shop companion reaches G.companions.ownedIds through unlockCompanion
   (drops + hatch here, the bunny quest here, and pets.js skill/boss pets all call
   window.unlockCompanion). Under the blob-retire capstone arm the client stops
   loading the save blob and reconcileCompanions (accrue.js) rebuilds G.companions
   from the SERVER owned-set (companion:<id> unlock rows), so a companion acquired
   with no server row is DROPPED on the next reload — a real player loss. This
   call writes that server row (hr_companion_grant), so the acquisition survives.

   ── THE ORDERING DEFECT THIS REPLACES (b499, and the arm is LIVE) ────────────
   unlockCompanion PUSHED the id into ownedIds, toasted "Companion unlocked",
   emitted, and only THEN fired hr_companion_grant fire-and-forget with a bare
   `.catch(noop)`. So under arm a refused grant produced: a toast, a Stable card,
   a chronicle line — and then reconcileCompanions rebuilt G.companions from the
   server owned-set on the very next envelope and the companion VANISHED, with
   nothing said. That is b494's rank-claim defect in companion form (a local
   write committed ahead of a verdict that can say no, against state the server
   rebuilds), and the hardening migration made it worse in the only way that
   matters: the refusals are now MACHINE CODES the client can read
   (`unknown_unlock:<key>`, `missing_req_item`, `not_grantable`) instead of a 500,
   so swallowing them is now a choice rather than an inability.

   THE RULE: under arm the companion appears only once the SERVER has recorded
   it. Nothing is shown, nothing is spent, and a refusal is said out loud.

   ── WHAT IS AND IS NOT RETRIED ───────────────────────────────────────────────
   A TRANSPORT failure never decided the acquisition, so it is retried on a
   bounded ladder (~103 s, five attempts, none of which reaches the database on
   the failing paths). A DEFINITIVE refusal is not retried — the server already
   answered, and re-asking burns the 60/hour budget (a rejected call still
   consumes it, A9) to be told the same thing.

   IDEMPOTENCY: each attempt takes a fresh key from goal-claim's newIdem(), which
   is correct here — hr_companion_grant is owned-ONCE by the `companion:<id>`
   progress row, not by the idem key, so a retry of a call that actually landed
   comes back `already_owned:true` and writes nothing twice. That envelope is
   treated as success below, which is what makes the ladder safe.

   SHOP companions are skipped — they already get their server row from
   hr_unlock_buy (legacy.js buy → HearthriseGold.buyUnlock), and hr_companion_grant
   would refuse them 'not_grantable' anyway. The starter fox is owned by grammar
   (no row). DORMANT is byte-unchanged: needsServerConfirm() is false, so the
   local write runs inline exactly as it did before this change and no network
   call is made at all. */
function grantKind(id) {
  const def = COMPANIONS[id];
  return String((def && def.source) || '').split(':')[0];
}
/* ⚠ NEVER A BARE `window` ON THE ASYNC PATH.
   Every other reference in this file is reached only from a live page, so a bare
   `window` is safe there. The grant ladder is NOT: it sleeps between rungs and
   therefore OUTLIVES whatever set the context up, and a bare `window` is a
   ReferenceError — not an undefined property — the moment that context is gone.
   Measured, and it did not merely fail a test: tests/companions-record.mjs §6
   arms the capstone, calls unlockCompanion, and its `finally` runs
   `delete globalThis.window` while the ladder is still sleeping. grantTransport()
   threw ReferenceError, the .catch handler below then threw the SAME error
   dereferencing `window.notify`, and the unhandled rejection killed the whole
   `node tests/run-smoke.mjs` process before it ever reached the browser. Same
   idiom blobRetired() above already uses. */
function win() {
  try {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined' && globalThis.window) return globalThis.window;
  } catch (e) {}
  return null;
}
function grantTransport() {
  const w = win();
  const gc = w && w.HearthriseGoalClaim;
  return (gc && typeof gc.grantCompanion === 'function') ? gc : null;
}
/** Is this acquisition one the SERVER has to record before it can be shown? */
export function needsServerConfirm(id) {
  try {
    if (!blobRetired()) return false;                 // DORMANT: byte-unchanged
    const kind = grantKind(id);
    if (!kind || kind === 'shop' || kind === 'starter') return false;
    return !!grantTransport();
  } catch (e) { return false; }
}

/* ── ASK ONCE, NOT ONCE PER HARVEST ──────────────────────────────────────────
   THE TRIGGER IS NOT ALWAYS A ONE-SHOT, and the old code hid that: it pushed
   the id into ownedIds immediately, so the `ownedIds.includes(id)` guard at the
   top of unlockCompanion stopped every later call. Waiting for the server means
   that guard no longer closes, and the repeating triggers are real —
   wireBunnyQuest calls unlockCompanion('bunny') on EVERY harvest once the
   hundredth crop is in, and the drop/skill/boss rolls re-roll for anything
   un-owned. Without this, one refusal becomes a refusal PER HARVEST: an RPC
   each, the 60/hour budget gone, an hr_rejections row each, and the same toast
   over and over.

   A DEFINITIVE refusal blocks for the session (the server decided; re-asking
   cannot change its mind). An exhausted TRANSPORT ladder blocks for five
   minutes only, because the thing that failed was the network and a reconnect
   deserves another go — which is also a second chance at a 1-in-2,500 drop. */
const GRANT_TRANSPORT_COOLDOWN_MS = 300000;
const _grantBlocked = Object.create(null);    // id → epoch ms until (Infinity = session)

/* ⚠ PARKED FOR THE SUITE — the same treatment runSmokeTest already gives the
   90 s settle loop, the autosave and the auto-eat settings sync, and it is here
   because this ladder proved the need. `b202: pets` drives
   `P.rollSkillPet('woodcutting', () => 0)` with a FORCED win; under the live
   capstone arm that dispatches a real hr_companion_grant, the suite is signed
   out, `not_signed_in` is retryable, and the ladder then slept 3 s / 10 s / 30 s
   / 60 s — a hundred seconds of timers running THROUGH the rest of the suite,
   ending in a `notify()` toast and a possible `G.companions` write long after
   that test's `finally` had restored everything. Two of them, from one test.
   That is a cross-test state leak by construction, and no amount of care inside
   the individual tests can close it: the leak is the ladder outliving them.
   Default OFF; production never touches it. */
let _grantsParked = false;
/** Park/unpark the grant ladder. Returns the PREVIOUS state so a caller can
 *  restore what it found rather than assuming. */
export function __parkGrants(on) {
  const was = _grantsParked;
  _grantsParked = !!on;
  return was;
}
function grantBlocked(id) {
  const until = _grantBlocked[id];
  if (until === undefined) return false;
  if (until === Infinity) return true;
  if (Date.now() < until) return true;
  delete _grantBlocked[id];
  return false;
}
/** TEST-ONLY. Forget every refusal memo. */
export function __clearGrantBlocks() {
  for (const k of Object.keys(_grantBlocked)) delete _grantBlocked[k];
}

/* Bounded, transport-only. Nothing here reaches the database on the paths it
   covers (a refused session and a negative RPC probe both answer locally), so
   the cost of the ladder is five timers, and the benefit is that a twenty-second
   reconnect no longer eats a 1-in-2,500 drop. */
const GRANT_RETRY_DEFAULT_MS = Object.freeze([0, 3000, 10000, 30000, 60000]);
let GRANT_RETRY_MS = GRANT_RETRY_DEFAULT_MS;
/** TEST-ONLY seam (same spirit as record.js's __set* arms). Pass nothing to
 *  restore the shipped ladder — a suite must never leave it shortened. */
export function __setGrantRetryMs(arr) {
  GRANT_RETRY_MS = (Array.isArray(arr) && arr.length) ? arr.slice() : GRANT_RETRY_DEFAULT_MS;
  return GRANT_RETRY_MS;
}
/* "The acquisition was never decided" — everything the transport itself can
   answer, plus the two server codes that mean "not yet" rather than "no".
   An UNKNOWN code is NOT retried: the server answered something, and guessing
   that an unrecognised verdict is retryable is how a refusal becomes a loop. */
const GRANT_RETRYABLE = new Set([
  'network', 'no_config', 'rpc_missing', 'bad_response', 'not_signed_in', 'no_character',
]);
const _grantInFlight = Object.create(null);   // id → true while a verdict is pending

/* Every refusal answers in a SENTENCE — an error code is a note to us, not a
   sentence to the player (b465), and the renown rank-claim (b494) set the house
   voice: say what happened, and say what is still safe. */
export function grantRefusalMessage(res, id) {
  const def = COMPANIONS[id] || {};
  const name = def.n || titleizeId(id);
  const why = String((res && res.error) || 'network');
  if (why === 'missing_req_item') {
    const item = itemLabel((res && res.item) || String(def.source || '').split(':')[1]);
    return `The realm has no record of your ${item}, so ${name} could not hatch. `
      + `Nothing was consumed — your ${item} is still in your bag.`;
  }
  if (why.indexOf('unknown_unlock:') === 0) {
    return `The realm cannot record ${name} yet — that is our fault, not yours, and it has been `
      + `reported. Nothing was spent.`;
  }
  if (why === 'not_grantable') {
    return `The realm does not recognise ${name} as an earnable companion. Nothing was spent; `
      + `this has been reported.`;
  }
  if (why === 'rate_limited') {
    return `That arrived faster than the realm could write it down, so ${name} was not recorded. `
      + `Nothing else was affected.`;
  }
  if (why === 'bad_slot' || why === 'unknown_companion') {
    return `${name} could not be recorded — this has been reported. Nothing was spent.`;
  }
  return `The realm couldn't record ${name} — try again shortly. Nothing was spent.`;
}

/* Ask the server, then — and only then — hand the companion over. Returns a
   promise for the tests; no caller awaits it (an acquisition is not a gesture
   the player is standing on). It never rejects. */
export function requestServerUnlock(id, onUnlocked) {
  if (_grantsParked) return Promise.resolve(false);
  if (_grantInFlight[id]) return Promise.resolve(false);
  if (grantBlocked(id)) return Promise.resolve(false);
  _grantInFlight[id] = true;
  const def = COMPANIONS[id] || {};
  const source = String(def.source || '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    let last = { ok: false, error: 'network' };
    for (let i = 0; i < GRANT_RETRY_MS.length; i++) {
      if (GRANT_RETRY_MS[i] > 0) await sleep(GRANT_RETRY_MS[i]);
      const gc = grantTransport();
      /* ⚠ THE TRANSPORT VANISHED — STOP, do not keep sleeping through the ladder.
         needsServerConfirm() required a transport before this was ever dispatched,
         so a null one HERE means the context went away underneath us: a torn-down
         test fixture, or a page being unloaded. There is nothing to retry against
         and the remaining rungs are ~100 s of timers firing into a dead world. */
      if (!gc) return { ok: false, error: 'network', gone: true };
      try { last = await gc.grantCompanion(id, source); }
      catch (e) { last = { ok: false, error: 'network' }; }
      /* ok — including `already_owned:true`, which is a landed grant seen twice. */
      if (last && last.ok) return last;
      /* A response that is not an envelope at all is not a verdict. Treat it as a
         transport failure (the safe direction — nothing was decided), but do NOT
         spin the full ladder on it: a caller wired to the old fire-and-forget
         contract returns a bare thenable-less object every time, and retrying it
         four more times just burns ~100 s to be handed the same non-answer. */
      if (!last || typeof last !== 'object'
          || (last.ok === undefined && last.error === undefined)) {
        return { ok: false, error: 'network', unshaped: true };
      }
      if (!GRANT_RETRYABLE.has(String(last.error || 'network'))) return last;
    }
    return last;
  };

  const settle = (res, threw) => {
    delete _grantInFlight[id];
    const w = win();
    /* Re-read ownership: an envelope may have reconciled the companion in while
       the verdict was in flight, and pushing it twice would duplicate the card. */
    if (!threw && res && res.ok) {
      /* No world to hand it to (the context was torn down mid-flight) — the
         server row EXISTS, which is the durable half, and reconcileCompanions
         will deliver it from the owned-set on the next envelope. Applying into a
         dead `window` would only throw. */
      if (!w) return false;
      ensureState();
      const owned = !!(w.G && w.G.companions
        && Array.isArray(w.G.companions.ownedIds)
        && w.G.companions.ownedIds.includes(id));
      if (!owned) applyUnlockLocally(id, onUnlocked);
      return true;
    }
    /* REFUSED. Nothing was written: no ownedIds push, no xp row, no toast, no
       chronicle line, no consume at the call site (the callback never ran). The
       player is told, once, in a sentence. */
    const why = threw ? 'network' : String((res && res.error) || 'network');
    /* …and ONCE is enforced here, not hoped for: the trigger may repeat (the
       bunny quest fires on every harvest). See the block table above. */
    _grantBlocked[id] = GRANT_RETRYABLE.has(why) ? (Date.now() + GRANT_TRANSPORT_COOLDOWN_MS) : Infinity;
    try { console.warn('[Companions] grant refused:', why, id); } catch (e) {}
    /* ⚠ SAY NOTHING INTO A DEAD CONTEXT. If the world this acquisition belonged
       to is gone (`gone`, or no window at all), there is no player to tell and a
       toast would only be an exception. The memo above still stands. */
    if (w && !(res && res.gone) && typeof w.notify === 'function') {
      w.notify(grantRefusalMessage(threw ? null : res, id), 'kill');
    }
    return false;
  };

  return run().then((res) => settle(res, false), (e) => {
    try { console.warn('[Companions] grant threw:', e && e.message); } catch (_) {}
    return settle(null, true);
  });
}

export function equipCompanion(id) {
  ensureState();
  if (!window.G.companions.ownedIds.includes(id)) {
    if (typeof window.notify === 'function') window.notify("You don't own that companion", 'kill');
    return;
  }
  window.G.companions.equipped = id;
  if (window.G.equipment) window.G.equipment.companion = id === 'fox' ? 'fox_companion' : id;
  /* SERVER TRANSPORT (b420) — tell the server which companion is equipped so
     hr_perks_of prices its passive bonus at accrual. The local write above is a
     DISPLAY PREDICTION for responsiveness; the server owns the equipped id
     (player_state.companion_equipped, written only by hr_companion_equip after an
     ownership check) and reconciles on the next envelope. Fire-and-forget: a
     refusal (not_owned / collect_first) costs nothing the client authored — the
     bonus is server-priced off the SERVER's equipped id, never this local one. */
  try {
    var _gc = window.HearthriseGoalClaim;
    if (_gc && typeof _gc.equipCompanion === 'function') {
      var _p = _gc.equipCompanion(id);
      if (_p && _p.catch) _p.catch(function () {});
    }
  } catch (e) {}
  emit('companionEquip', { id });
  if (typeof window.renderProfile === 'function') window.renderProfile();
  if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
  // Re-render stable if visible
  renderStable();
}

export function unequipCompanion() {
  ensureState();
  window.G.companions.equipped = null;
  if (window.G.equipment) window.G.equipment.companion = null;
  /* SERVER TRANSPORT (b420) — clear the server-owned equipped id (unequip is
     always allowed server-side). Same fire-and-forget display-prediction shape as
     equipCompanion above. */
  try {
    var _gc = window.HearthriseGoalClaim;
    if (_gc && typeof _gc.unequipCompanion === 'function') {
      var _p = _gc.unequipCompanion();
      if (_p && _p.catch) _p.catch(function () {});
    }
  } catch (e) {}
  emit('companionEquip', { id: null });
  if (typeof window.renderProfile === 'function') window.renderProfile();
  if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
  renderStable();
}

// ── Hooks (XP gain + procs + drops) ──

const DROP_CHANCES = {
  wolf_pup: 0.01, badger: 0.005, hawk: 0.01, scorpion: 0.005, tortoise: 0.005,
};

function parseSource(src) {
  if (!src) return null;
  const [kind, arg1, arg2] = src.split(':');
  return { kind, arg1, arg2 };
}

function awardXpForRole(activityType) {
  const G = window.G;
  if (!G || !G.companions) return;
  const eq = G.companions.equipped;
  if (!eq) return;
  const role = COMPANIONS[eq]?.role;
  if (!role) return;
  let xp = 0;
  const isUtility = role === 'utility' || role === 'hybrid';
  if (activityType === 'combat-kill' && (role === 'combat' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (activityType === 'gather' && (role === 'gather' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (activityType === 'artisan' && (role === 'artisan' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (xp) awardCompanionXp(xp);
}

function showProc(label) {
  if (typeof window.notify === 'function') window.notify(label, 'loot');
  try {
    const el = document.createElement('div');
    el.textContent = label;
    /* Font floor (project HARD RULE, enforced by the b227 document scan): the proc
       toast was 13.5px — below the 14.5px floor. It slips past the scan only when
       no toast is live, so it was a latent violation; the headless page throttles
       the removal timer below, which can keep the toast alive long enough for the
       scan to catch it. Use the scalable floor form the rest of the UI uses
       (calc(14.5px * --ui-scale)). Colour left as-is and flagged to the Art
       Director in CONFLICTS.md (the toast bg/ink are hardcoded, not tokens). */
    el.style.cssText = 'position:fixed;top:60px;right:20px;z-index:99998;background:rgba(127,154,79,.95);'
      + 'color:#0f1320;padding:6px 12px;border-radius:6px;font-weight:800;font-size:calc(14.5px * var(--ui-scale, 1));'
      + 'box-shadow:0 4px 12px rgba(0,0,0,.3);animation:proc-fade 1.6s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  } catch {}
}

function rollProc(triggerType, ctx) {
  const G = window.G;
  if (!G?.companions?.equipped) return;
  const def = COMPANIONS[G.companions.equipped];
  if (!def?.proc || def.proc.trigger !== triggerType) return;
  /* Through the SEEDED session stream, not Math.random() — the same rule the
     drop roll below and dungeons.js's key drop already follow, and the last of
     the three deferred in b342.

     Every proc trigger is reachable from the AWAY replay: 'kill' rides the
     killMonster wrapper (23 draws in a 30-minute away night on the lich,
     measured), 'gather' and 'cook' ride the addItem wrapper (400 draws in a
     400-action away gather night, measured). A proc PAYS — the raccoon's
     `extraGold` is 5 gold a kill — so a bare draw here means the server and
     the client compute different totals for the same absence from the same
     seed: measured at 7,899 gold against 7,789 for one identical pinned-seed
     night, varying nothing but Math.random(). Falls back only if the core has
     not booted. */
  const C = window.HearthriseCore;
  const hit = (C && C.rng) ? C.rng.chance(def.proc.chance) : (Math.random() < def.proc.chance);
  if (!hit) return;
  const e = def.proc.effect;
  /* ARM-SAFE (gold flip): a companion gold proc is a live client-authored grant
     (its away-replay twin is priced by combat-sim, but the LIVE tick here is not
     server-credited). Under arm the gold credit no-ops, so DEFER the whole proc —
     do NOT show a "+Xg" proc animation or record a contribution the pet did not
     make. A proc latches nothing, so deferring is simply firing nothing this
     draw. No-op until gold is armed, so seeded parity is unchanged. */
  if ((e === 'gold' || e === 'extraGold')
      && window.clientMayWriteRecordField && !window.clientMayWriteRecordField('gold')) return;
  switch (e) {
    case 'gold': G.gold = (G.gold || 0) + (def.proc.amount || 1); break;
    case 'extraGold': G.gold = (G.gold || 0) + (def.proc.amount || 5); break;
    case 'doubleDrop':
      if (ctx?.lastDrop?.id && G.inventory) {
        G.inventory[ctx.lastDrop.id] = (G.inventory[ctx.lastDrop.id] || 0) + (ctx.lastDrop.qty || 1);
      } break;
    case 'doubleYield':
      if (ctx?.cropId && G.inventory) {
        G.inventory[ctx.cropId] = (G.inventory[ctx.cropId] || 0) + (ctx.qty || 1);
      } break;
    case 'instant': if (typeof G.skillProgress === 'number') G.skillProgress = 1; break;
    case 'refundIngredients':
      if (ctx?.inputs && G.inventory) {
        for (const [k, v] of Object.entries(ctx.inputs)) G.inventory[k] = (G.inventory[k] || 0) + v;
      } break;
    case 'guaranteedRare': G._companionRareNext = true; break;
    case 'fireDot':
      if (G.activeMonster) G.activeMonster.hp = Math.max(0, (G.activeMonster.hp || 0) - 5);
      break;
  }
  showProc(def.proc.label);
  // b269: record the pet's real, concrete contribution for the session-impact
  // panel — the amount/ctx here are exactly what the effect above paid out.
  if (window.HearthrisePetSession) {
    try { window.HearthrisePetSession.recordProc(e, def.proc.amount, ctx); } catch (err) {}
  }
  emit('companionProc', { id: G.companions.equipped, effect: e });
}

/* monsterId -> [[companionId, def]] for every `drop:<monsterId>` source.
   Built once, lazily, and keyed on the table's identity so a data reload or a
   test substituting the catalogue invalidates it rather than serving a stale
   index. Scales with content: adding fifty companions adds fifty rows here,
   not fifty comparisons per kill. */
let _dropIndex = null, _dropIndexFor = null;
function dropSourcesFor(monsterId) {
  if (_dropIndexFor !== COMPANIONS) {
    _dropIndexFor = COMPANIONS;
    _dropIndex = Object.create(null);
    for (const [id, def] of Object.entries(COMPANIONS)) {
      const src = parseSource(def.source);
      if (src?.kind !== 'drop' || !src.arg1) continue;
      (_dropIndex[src.arg1] || (_dropIndex[src.arg1] = [])).push([id, def]);
    }
  }
  return _dropIndex[monsterId] || [];
}

function wireKillHook() {
  if (typeof window.killMonster !== 'function') return;
  const orig = window.killMonster;
  window.killMonster = function (m) {
    const r = orig.apply(this, arguments);
    let monsterId = (typeof m === 'string') ? m : (m?.id || m?.key);
    if (!monsterId && typeof window.MONSTERS === 'object') {
      for (const k in window.MONSTERS) {
        if (window.MONSTERS[k] === m) { monsterId = k; break; }
      }
    }
    if (monsterId) {
      awardXpForRole('combat-kill');
      rollProc('kill', {});
      /* Drop check, through a PREBUILT index. This used to walk the whole
         COMPANIONS table (Object.entries + a string split per row) on every
         kill; a 12-hour away catch-up is ~1,000 kills, and since the away
         unification an away kill comes through this wrapper too. The index is
         a pure lookup — same rows, same order, no behaviour change. */
      for (const [id, def] of dropSourcesFor(monsterId)) {
        if (window.G.companions?.ownedIds?.includes(id)) continue;
        const chance = DROP_CHANCES[id] ?? 0.01;
        /* Through the SEEDED session stream, not Math.random(): this roll is
           part of what a kill pays, and a kill must be replayable end to end
           or a server-side accrual dispute cannot be adjudicated. Falls back
           only if the core has not booted. */
        const C = window.HearthriseCore;
        const hit = (C && C.rng) ? C.rng.chance(chance) : (Math.random() < chance);
        /* b499: the celebration rides the unlock's own callback instead of the
           next statement. Dormant that is the same order it always was (the
           toast still fires straight after the emit); under the capstone arm it
           waits for the server verdict, so a refused grant never shows a
           "New companion unlocked!" banner for a companion the next envelope
           is about to take away. */
        if (hit) unlockCompanion(id, () => showCompanionUnlockedToast(def));
      }
      emit('kill', { monsterId });
    }
    return r;
  };
}

function showCompanionUnlockedToast(def) {
  try {
    const t = document.createElement('div');
    t.textContent = `New companion unlocked: ${def.n}!`;
    t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:99999;'
      + 'background:linear-gradient(180deg,#7f9a4f,#3a8a52);color:#fff;padding:14px 22px;border-radius:8px;'
      + 'font-weight:800;font-size:15px;box-shadow:0 8px 32px rgba(0,0,0,.5);'
      + 'border:2px solid #f3d181;animation:bigtoast 4s ease-out forwards';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  } catch {}
}

function wireCombatTickProc() {
  if (typeof window.combatTick !== 'function') return;
  const orig = window.combatTick;
  window.combatTick = function () {
    const r = orig.apply(this, arguments);
    if (window.G?.activeMonster) rollProc('combatHit', {});
    return r;
  };
}

function wireAddItemForGather() {
  if (typeof window.addItem !== 'function') return;
  const orig = window.addItem;
  window.addItem = function (id, qty) {
    const r = orig.apply(this, arguments);
    const G = window.G;
    if (G?.activeArtisanRecipe) {
      awardXpForRole('artisan');
      rollProc('cook', { inputs: {} });
    } else if (G?.activeSkill && ['mining', 'woodcutting', 'fishing', 'farming'].includes(G.activeSkill)) {
      awardXpForRole('gather');
      rollProc('gather', { lastDrop: { id, qty } });
      emit('gather', { skill: G.activeSkill, item: id, qty });
    }
    return r;
  };
}

function wireBunnyQuest() {
  if (typeof window.harvestPlot !== 'function') return;
  const orig = window.harvestPlot;
  window.harvestPlot = function () {
    const r = orig.apply(this, arguments);
    const G = window.G;
    if (!G) return r;
    G.stats = G.stats || {};
    G.stats.cropsHarvested = (G.stats.cropsHarvested || 0) + 1;
    if (G.stats.cropsHarvested >= 100 && !G.companions?.ownedIds?.includes('bunny')) {
      unlockCompanion('bunny');
    }
    return r;
  };
}

function wireDragonEggHatch() {
  if (typeof window.invItemTap !== 'function') return;
  const orig = window.invItemTap;
  window.invItemTap = function (id) {
    if (id === 'dragon_egg' && window.G?.inventory?.dragon_egg > 0) {
      /* b373: in-game modal, never window.confirm — the native dialog blocks
         the renderer (src/utils/dialog.js). The egg is re-checked INSIDE the
         answer: the modal does not stop the game, so the stack can change (a
         second tap, a market sale) between the question and the hatch, and
         consuming an egg the player no longer has would mint a companion. */
      const D = window.HearthriseDialog;
      if (D && D.confirm) {
        D.confirm({ title: 'Hatch the Dragon Egg?',
          body: 'The egg is consumed and a Whelp joins you as a companion.',
          confirmLabel: 'Hatch' }).then(function (ok) {
          if (!ok) return;
          if (!(window.G?.inventory?.dragon_egg > 0)) return;
          if (window.G.companions?.ownedIds?.includes('whelp')) {
            if (typeof window.notify === 'function') {
              window.notify('A Whelp already follows you — your egg is untouched.', 'info');
            }
            return;
          }
          /* b499 — THE EGG IS SPENT ONLY ON A RECORDED HATCH.
             This used to decrement first and unlock second, which under the
             capstone arm meant a `missing_req_item` refusal (the server enforces
             the req_item since 2026-09-06-companion-grant-hardening.sql C2) ate
             the egg AND showed a Whelp that the next envelope removed. Moving
             the consume into the unlock's callback makes the two atomic from the
             player's side on BOTH paths: dormant it runs inline exactly as
             before (two independent writes, no observer between them), and armed
             it runs only after the server has written the ownership row — the
             same transaction in which the server consumes its own copy of the
             egg. It also stops a second egg being burnt for a Whelp already
             owned, which the old order did silently. */
          unlockCompanion('whelp', function () {
            if (window.G?.inventory?.dragon_egg > 0) window.G.inventory.dragon_egg--;
            if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
          });
        });
        return;
      }
    }
    return orig.apply(this, arguments);
  };
}

// ── UI: Stable panel, profile card, sidebar nav ──

function injectNavButton() {
  const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
  if (!sidebar || document.querySelector('[data-tab="stable"]')) return;
  // b269: the Stable belongs under Homestead (Tyler) — pets are a homestead
  // fixture, not an adventuring activity. Final placement (incl. timing retries)
  // is owned by legacy.js moveStableNav(); this just creates the button under
  // Homestead when the label is present.
  const labels = sidebar.querySelectorAll('.nav-group-label');
  let groupLabel = null;
  labels.forEach((l) => { if (l.textContent.trim() === 'Homestead') groupLabel = l; });
  const btn = document.createElement('button');
  btn.className = 'nav-btn';
  btn.dataset.tab = 'stable';
  btn.innerHTML = '<span class="ic">' + ((window.HR && window.HR.icon) ? (window.HR.icon('navStable', 19, 'currentColor') || '') : '') + '</span><span class="lbl">Stable</span>';
  btn.addEventListener('click', () => window.showTab && window.showTab('stable'));
  if (groupLabel) {
    let next = groupLabel.nextElementSibling;
    while (next && !next.classList.contains('nav-group-label')) next = next.nextElementSibling;
    if (next) sidebar.insertBefore(btn, next);
    else sidebar.appendChild(btn);
  } else {
    sidebar.appendChild(btn);
  }
}

function injectPanel() {
  if (document.getElementById('panel-stable')) return;
  const main = document.querySelector('main.main') || document.querySelector('main');
  if (!main) return;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'panel-stable';
  panel.innerHTML = '<div class="card" style="flex:1;overflow:auto"><div class="card-head">'
    + '<div class="card-title">Stable</div>'
    + '<span class="card-sub" id="stable-sub">0 companions owned</span></div>'
    + '<div class="card-body" id="stable-body"></div></div>';
  main.appendChild(panel);
}

function renderStable() {
  ensureState();
  const G = window.G;
  if (!G?.companions) return;
  const body = document.getElementById('stable-body');
  if (!body) return;
  const sub = document.getElementById('stable-sub');
  if (sub) sub.textContent = `${G.companions.ownedIds.length}/${Object.keys(COMPANIONS).length} companions owned`;

  /* b371 — was five literal hexes, one of them (#d4a8e8) a LAVENDER, which is
     the exact palette drift the art direction forbids: there is no lavender
     anywhere else in Hearthrise. These are the project's own semantic roles,
     so they re-tint with the theme instead of being a private palette that
     only this file knows about. */
  const roleColor = {
    combat:  'var(--red-line)',
    gather:  'var(--green)',
    artisan: 'var(--gold-2)',
    utility: 'var(--steel)',
    hybrid:  'var(--ink-3)',
  };
  // b228: the three misspelled keys are gone from the data, so the Stable now
  // labels the real ones. `farmYield` moves out of the percent list — it is a
  // count of extra crops and always was.
  const labelMap = {
    strB: 'STR', atkB: 'ATK', defB: 'DEF', crit: 'Crit', allXP: 'All XP',
    gatherSpeed: 'Gather', farmYield: 'Farm yield', cookSpeed: 'Cook speed',
    smithSpeed: 'Smith speed', craftSpeed: 'Craft speed', prayerSpeed: 'Prayer speed',
    rareDrop: 'Rare drop', goldFind: 'Gold find', hpRegen: 'HP/sec',
  };
  const isPercent = (k) => ['crit', 'allXP', 'gatherSpeed', 'cookSpeed', 'smithSpeed',
    'craftSpeed', 'prayerSpeed', 'rareDrop', 'goldFind'].includes(k);

  const cards = Object.entries(COMPANIONS).map(([id, def]) => {
    const owned = G.companions.ownedIds.includes(id);
    const equipped = G.companions.equipped === id;
    const xp = (G.companions.xp && G.companions.xp[id]) || 0;
    const lv = companionLevelFromXp(xp);
    const nextXp = companionXpToReach(lv + 1);
    const thisLvXp = companionXpToReach(lv);
    const pct = nextXp > thisLvXp ? Math.min(100, ((xp - thisLvXp) / (nextXp - thisLvXp)) * 100) : 100;
    const bonuses = Object.entries(def.bonus || {}).map(([k, v]) => {
      const display = isPercent(k) ? `+${(v * 100).toFixed(0)}%` : `+${v}`;
      return `<span><b>${display}</b> ${labelMap[k] || k}</span>`;
    }).join(' &nbsp;·&nbsp; ');

    return `<div class="stable-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}">
      <span class="sc-lvl">Lv ${lv}</span>
      <div class="sc-row">
        <span class="sc-icon">${companionIconHtml(id, 44)}</span>
        <div>
          <div class="sc-name">${def.n}</div>
          <div class="sc-role" style="color:${roleColor[def.role] || '#9aa3b0'}">${def.role}</div>
        </div>
      </div>
      <div class="sc-bonuses">${bonuses}</div>
      ${owned ? `
        <div class="sc-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div style="font-size:13.5px;color:var(--ink-3)">${xp.toLocaleString()} / ${nextXp.toLocaleString()} XP</div>
        ${def.proc ? `<div class="sc-bonuses" style="font-size:13.5px;font-style:italic">${def.proc.label} (${(def.proc.chance * 100).toFixed(0)}% on ${def.proc.trigger})</div>` : ''}
        <button class="sc-equip" onclick="${equipped ? 'window.unequipCompanion()' : `window.equipCompanion('${id}')`}">${equipped ? 'Unequip' : 'Equip'}</button>
      ` : `<div class="sc-source">${companionSourceLabel(def.source)}</div>`}
    </div>`;
  }).join('');

  body.innerHTML = `<div class="stable-grid">${cards}</div>`;
}

function injectProfileCard() {
  const dashUserBody = document.getElementById('dash-user-body');
  if (!dashUserBody) return;
  if (dashUserBody.querySelector('.companion-card')) return;
  const G = window.G;
  if (!G?.companions?.equipped) return;
  const id = G.companions.equipped;
  const def = COMPANIONS[id];
  if (!def) return;
  const xp = (G.companions.xp && G.companions.xp[id]) || 0;
  const lv = companionLevelFromXp(xp);
  const nextXp = companionXpToReach(lv + 1);
  const thisLvXp = companionXpToReach(lv);
  const pct = nextXp > thisLvXp ? Math.min(100, ((xp - thisLvXp) / (nextXp - thisLvXp)) * 100) : 100;
  const card = document.createElement('div');
  card.className = 'companion-card';
  card.innerHTML = `<div class="cc-icon">${companionIconHtml(id, 32)}</div>
    <div class="cc-info">
      <div class="cc-name">${def.n} (Lv ${lv})</div>
      <div class="cc-meta">${def.role} companion</div>
      <div class="cc-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>`;
  dashUserBody.appendChild(card);
}

// ── Boot ──

export function setupCompanions() {
  // Expose APIs on window for legacy code paths
  window.COMPANIONS = COMPANIONS;
  window.companionXpToReach = companionXpToReach;
  window.companionLevelFromXp = companionLevelFromXp;
  window.getCompanionBonus = getCompanionBonus;
  window.awardCompanionXp = awardCompanionXp;
  window.unlockCompanion = unlockCompanion;
  window.equipCompanion = equipCompanion;
  // b229: expose so the smoke test can force a synchronous re-render instead
  // of racing the 30ms setTimeout the showTab hook below schedules — the
  // Stable emoji-sweep guard needs to inspect the DOM right after mutating
  // G.companions, not after an arbitrary timer fires.
  window.renderStable = renderStable;
  window.unequipCompanion = unequipCompanion;
  /* b371 (F20): the lock-hint humaniser is pure and is exactly the kind of copy
     that rots silently when a monster or a skill is renamed, so it is published
     for the guard that walks every authored `source` in the data. */
  window.HearthriseCompanions = Object.assign(window.HearthriseCompanions || {}, {
    sourceLabel: companionSourceLabel,
    /* b499 — the server-confirmed acquisition path, published so the regression
       suite can drive it directly (it is async and has a retry ladder; a test
       that could only reach it through a 1-in-2,500 drop roll would not exist).
       `requestServerUnlock` returns a promise that resolves true only when the
       companion really joined. */
    needsServerConfirm, requestServerUnlock, grantRefusalMessage,
    __setGrantRetryMs, __clearGrantBlocks, __parkGrants,
  });

  // Hook into existing engine functions
  wireKillHook();
  wireCombatTickProc();
  wireAddItemForGather();
  wireBunnyQuest();
  wireDragonEggHatch();

  // Hook into existing getBonus + getEquipmentStats so companion bonuses apply
  if (typeof window.getBonus === 'function') {
    const orig = window.getBonus;
    window.getBonus = function (key) {
      let v = orig.apply(this, arguments) || 0;
      const cb = getCompanionBonus();
      if (typeof cb[key] === 'number') v += cb[key];
      return v;
    };
  }
  if (typeof window.getEquipmentStats === 'function') {
    const orig = window.getEquipmentStats;
    window.getEquipmentStats = function () {
      const s = orig.apply(this, arguments) || {};
      const cb = getCompanionBonus();
      for (const k of ['strB', 'atkB', 'defB', 'rangeStrB', 'rangeAtkB', 'magicStrB', 'magicAtkB']) {
        if (typeof cb[k] === 'number') s[k] = (s[k] || 0) + cb[k];
      }
      if (typeof cb.crit === 'number') s.critB = (s.critB || 0) + cb.crit;
      return s;
    };
  }

  // Hook showTab for stable rendering
  window.HearthriseShowTab.wrapShowTab('stable-render', function (name) {
    if (name === 'stable') setTimeout(renderStable, 30);
  });

  // Hook renderProfile for companion card
  if (typeof window.renderProfile === 'function') {
    const orig = window.renderProfile;
    window.renderProfile = function () {
      const r = orig.apply(this, arguments);
      setTimeout(injectProfileCard, 30);
      return r;
    };
  }

  // Boot UI
  function boot() {
    injectNavButton();
    injectPanel();
    ensureState();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
  } else {
    setTimeout(boot, 300);
  }

  // Inject toast keyframe once
  if (!document.getElementById('comp-bigtoast-css')) {
    const s = document.createElement('style');
    s.id = 'comp-bigtoast-css';
    s.textContent = `
      @keyframes proc-fade{0%{opacity:0;transform:translateY(-10px)}20%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(20px)}}
      @keyframes bigtoast{0%{opacity:0;transform:translate(-50%,-20px)}15%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,20px)}}
    `;
    document.head.appendChild(s);
  }

  console.log(`[Companions ESM] loaded — ${Object.keys(COMPANIONS).length} companions`);
}
