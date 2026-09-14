// ============================================================================
// src/features/gem-unlocks.js — WHO OWNS A THEME OR A COSMETIC, AND HOW ONE IS
//                               BOUGHT. Extracted from src/legacy.js (2026-09-14)
//                               with the server verb it now talks to.
//
// ── WHY THIS IS A MODULE AND NOT TWENTY MORE LINES OF THE MONOLITH ──────────
// It is net-facing flow, not UI glue: an intent, a verdict, a reconcile and a
// set of honest refusals. legacy.js keeps the GESTURES (buyTheme / buyCosmetic /
// setTheme are onclick targets and paint their own screens) and calls in here
// for the decision. That is the §7 direction of travel, and it is what lets the
// purchase path be read in one screen instead of grepped out of 20k lines.
//
// ── THE DEFECT ALL OF THIS CLOSES (b371, live at three sites at once) ───────
// `gems` is on SERVER_OF_RECORD (src/net/record.js) with NO dormant gate — it is
// ARMED — so accrue.js writes it ABSOLUTELY on every envelope:
//
//     if (Number.isFinite(Number(st.gems))) G.gems = Number(st.gems);
//
// A local `G.gems -= price` was therefore never a payment. It was a PREDICTION
// the next envelope retired — while the THING BOUGHT sat in `G.ownedThemes` /
// `G.ownedCosmetics`, RESIDUE, which hr_put_client_state stored verbatim. The
// gems came back and the theme stayed: a free, repeatable premium purchase, and
// an "entitlement" a console could grant itself by typing one array.
//
// Both halves are gone. hr_buy_gem_unlock (2026-09-14-gem-unlock-buy.sql) debits
// the server-owned balance and writes a player_progress flag in ONE transaction;
// hr_state_of projects the ACCOUNT's owned set as a top-level `gem_unlocks`
// array; accrue.js reconcileGemUnlocks lands it in `G._gemUnlocks` scratch; and
// the two residue fields left RESIDUE_FIELDS in the same build. There is exactly
// one answer to "do you own this" and it is the realm's.
//
// ── THE FALLBACK DIRECTION, WHICH IS THE WHOLE SAFETY ARGUMENT ──────────────
// With no bag left to fall back to, an ABSENT projection answers NOT OWNED —
// "unknown", which renders a live Buy offer. That is safe in one direction only,
// and this is the direction: pressing Buy on something the account already owns
// is refused `already_owned`, comes back carrying the whole owned set, and heals
// the view in that same round trip WITHOUT charging a gem. Granting on silence
// cannot be undone by a round trip; it is the residue-ahead class.
//
// And `reconcileGemUnlocks` NEVER NARROWS: a body with no `gem_unlocks`, or a
// garbage one, leaves the last known set standing. So "unknown" only ever means
// "not heard yet", never "heard, and forgot" — the two things a paying player
// would experience identically, as theft.
// ============================================================================

const G = () => (typeof window !== 'undefined' ? window.G : null);

/** The server's owned set, or `null` when the realm has not spoken yet. */
export function gemUnlockServerSet() {
  const g = G();
  const s = g && g._gemUnlocks;
  return (s && Array.isArray(s.owned)) ? s.owned : null;
}

/** Has the realm answered at all? Ownership never depends on this — surfaces
 *  that want to say "checking…" rather than draw a price do. */
export function gemUnlocksKnown() { return gemUnlockServerSet() !== null; }

/** The ONE ownership read. `kind` is the catalogue namespace ('theme',
 *  'cosmetic'); the projected ids are `<namespace>:<id>`. */
export function ownsGemUnlock(kind, id) {
  const srv = gemUnlockServerSet();
  if (!srv) return false;
  return srv.indexOf(kind + ':' + id) >= 0;
}

/* THE EQUIPPED THEME FAILS CLOSED. `houseTheme` stays residue — it is a
   per-character display pointer the server has no column for — but a pointer at
   a theme the owned set does not carry paints `default`, SILENTLY and WITHOUT
   re-granting anything. So a forged `G.houseTheme` can only ever show you a wall
   you already own, and the read does not rewrite the player's choice: a theme
   they own again tomorrow comes back by itself. */
export function activeHouseTheme() {
  const g = G();
  const id = (g && g.houseTheme) || 'default';
  return ownsGemUnlock('theme', id) ? id : 'default';
}

/* The honest toast for each machine code hr_buy_gem_unlock can answer. Named per
   error rather than one opaque "unavailable" (the b494 voice): a player told
   "not enough gems" when the real answer is "sign in" files the wrong bug. */
export const GEM_UNLOCK_TOASTS = Object.freeze({
  bad_unlock_id:        'That is not something the realm sells',
  unknown_unlock:       'That is not something the realm sells',
  not_for_sale:         'That one is free — it does not need buying',
  insufficient_gems:    'Not enough gems',
  gem_unlock_daily_cap: 'That is enough new finery for today',
  no_character:         'Your character is still loading — try again in a moment',
  intent_mismatch:      'That went out twice — try again in a moment',
  rate_limited:         'Slow down a moment, then try again',
  not_signed_in:        'Sign in to buy that',
  rpc_missing:          'The store is unavailable right now',
  no_config:            'The store is unavailable right now',
  network:              'No connection — your purchase did not go through',
  bad_response:         'The realm is busy — try that again in a moment',
});

export function gemUnlockToast(res, what) {
  const code = String((res && res.error) || '');
  if (code === 'insufficient_gems' && res && typeof res.short_by === 'number') {
    return 'Not enough gems — you need ' + res.short_by + ' more';
  }
  if (GEM_UNLOCK_TOASTS[code]) return GEM_UNLOCK_TOASTS[code];
  return 'The realm couldn’t record ' + what + ' — nothing was spent.';
}

function say(msg, kind) {
  try { if (typeof window.notify === 'function') window.notify(msg, kind); } catch (e) { /* a toast is never the thing that breaks a purchase */ }
}

/* ADOPT THE SERVER'S WHOLE SET, on success AND on already_owned: both answers
   carry it, and `already_owned` means our picture was stale rather than that
   anything failed. Routed through accrue.js's reconciler so a purchase receipt
   and an ordinary envelope land ownership by exactly ONE code path — two would
   be two chances to disagree about what ownership is. */
function adoptGemUnlocks(res) {
  try {
    const A = window.HearthriseAccrual;
    if (A && typeof A.reconcileGemUnlocks === 'function') A.reconcileGemUnlocks(G(), res);
  } catch (e) { /* a malformed body must not take the gesture down with it */ }
}

/* ONE PURCHASE IN FLIGHT PER UNLOCK. A double tap must not spend two intent keys
   on one gesture: the second is refused `already_owned` and reads to the player
   as a failure. */
const _inflight = Object.create(null);

/**
 * Buy one gem unlock. Sends an unlock id and an idempotency key and NOTHING
 * ELSE — no price crosses, because the price is read from public.hr_gem_unlocks
 * under the character lock. NOTHING LOCAL IS DEBITED, not even optimistically.
 *
 * @param {string} unlockId  '<namespace>:<id>', the catalogue's own key
 * @param {string} what      what to name in a refusal ('that theme')
 * @param {function} [onOwned] called with the verdict when the realm says the
 *        ACCOUNT already owns it — by then the owned set has been adopted, so a
 *        caller can simply equip.
 * @returns {Promise<object>} the verdict, always (never rejects).
 */
export function buyGemUnlock(unlockId, what, onOwned) {
  const GC = window.HearthriseGoalClaim;
  if (!GC || typeof GC.buyGemUnlock !== 'function') {
    say(GEM_UNLOCK_TOASTS.rpc_missing, 'kill');
    return Promise.resolve({ ok: false, error: 'rpc_missing' });
  }
  if (_inflight[unlockId]) return Promise.resolve({ ok: false, inflight: true });
  _inflight[unlockId] = true;
  let p;
  try { p = GC.buyGemUnlock(unlockId); } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') {
    _inflight[unlockId] = false;
    say(GEM_UNLOCK_TOASTS.rpc_missing, 'kill');
    return Promise.resolve({ ok: false, error: 'rpc_missing' });
  }
  return Promise.resolve(p).then((res) => {
    if (res && Array.isArray(res.gem_unlocks)) adoptGemUnlocks(res);
    if (res && res.ok === true) {
      /* The balance comes back for RENDERING; the RECORD is what every
         affordability check reads, so ask for a fresh one rather than believing
         the receipt. Without the topbar repaint the gem chip shows the
         pre-purchase number until a reload — the b371 pairing. */
      try {
        const R = window.HearthriseRecord;
        if (R && typeof R.requestRecord === 'function') {
          const r = R.requestRecord(); if (r && r.catch) r.catch(() => {});
        }
      } catch (e) { /* rendering, not authority */ }
      try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
      return res;
    }
    if (res && res.error === 'already_owned') {
      if (typeof onOwned === 'function') onOwned(res);
      return res;
    }
    say(gemUnlockToast(res, what), 'kill');
    return res || { ok: false, error: 'bad_response' };
  }).catch(() => {
    say(GEM_UNLOCK_TOASTS.network, 'kill');
    return { ok: false, error: 'network' };
  }).then((r) => { _inflight[unlockId] = false; return r; });
}

/* PUBLISHED ON `window` because legacy.js's House and Shop renderers are a
   classic script and cannot import. The namespace is for anything that can. */
if (typeof window !== 'undefined') {
  window.gemUnlockServerSet = gemUnlockServerSet;
  window.gemUnlocksKnown = gemUnlocksKnown;
  window.ownsGemUnlock = ownsGemUnlock;
  window.activeHouseTheme = activeHouseTheme;
  window.buyGemUnlock = buyGemUnlock;
  window.HearthriseGemUnlocks = {
    gemUnlockServerSet, gemUnlocksKnown, ownsGemUnlock, activeHouseTheme,
    buyGemUnlock, gemUnlockToast, GEM_UNLOCK_TOASTS,
  };
}
