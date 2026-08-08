// ============================================================
// src/utils/profile.js
//
// Player identity helpers. Replaces the triple-conditional pattern
// repeated across market.js, chat.js, multi-character.js:
//
//   var prof = window.HearthriseProfile && window.HearthriseProfile.profile;
//   if(prof) return 'slot-' + prof.activeSlot;
//
// Centralised so when the profile shape changes (e.g. once cloud
// auth lands and slots get UUIDs), we update one file.
// ============================================================

/**
 * Active character slot (0-4) for the currently-loaded profile.
 * Falls back to 0 if no profile is loaded yet.
 *
 * @returns {number}
 */
export function getActiveSlot() {
  const prof = window.HearthriseProfile && window.HearthriseProfile.profile;
  if (prof && typeof prof.activeSlot === 'number') return prof.activeSlot;
  return 0;
}

/**
 * Stable identifier for the active character — used as `seller_id` /
 * `buyer_id` / `from_id` in market and chat.
 *
 * Local-mode format: `slot-<n>` (no cloud account)
 * Cloud-mode format: `<auth_uid>:slot-<n>` (post Phase 2)
 *
 * @returns {string}
 */
export function getActiveCharId() {
  const prof = window.HearthriseProfile && window.HearthriseProfile.profile;
  const slot = (prof && typeof prof.activeSlot === 'number') ? prof.activeSlot : 0;
  const acct = window.G && window.G.account;
  if (acct && acct.id) return acct.id + ':slot-' + slot;
  return 'slot-' + slot;
}

/**
 * Display name to show on chat messages, market listings, etc.
 *
 * b221: the CONFIRMED unique name wins when there is one. That name is
 * account-level and server-arbitrated (src/features/identity.js +
 * supabase/migrations/2026-08-08-unique-names.sql); G.playerName is
 * per-character and, for an anonymous player, not unique at all. Falling
 * through to it keeps offline play working exactly as before.
 *
 * @returns {string}
 */
export function getDisplayName() {
  const id = window.HearthriseIdentity;
  if (id && typeof id.displayName === 'function') {
    const n = id.displayName();
    if (n) return n;
  }
  if (window.G && window.G.playerName) return window.G.playerName;
  const prof = window.HearthriseProfile && window.HearthriseProfile.profile;
  if (prof && prof.displayName) return prof.displayName;
  return 'Adventurer';
}

/**
 * True only when the display name is server-confirmed unique. Anonymous and
 * offline players keep a local name that is explicitly NOT unique, and any
 * UI that implies otherwise is lying to them.
 *
 * @returns {boolean}
 */
export function hasUniqueName() {
  const id = window.HearthriseIdentity;
  return !!(id && typeof id.isUniqueName === 'function' && id.isUniqueName());
}

/**
 * Portrait to draw for the active player. Always resolves to something that
 * loads — the uploaded portrait if there is one, the painted default if not.
 *
 * @returns {string}
 */
export function getAvatarUrl() {
  const id = window.HearthriseIdentity;
  if (id && typeof id.avatarUrl === 'function') {
    const u = id.avatarUrl();
    if (u) return u;
  }
  return window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png';
}

/**
 * Active clan id, or null if the player isn't in a clan.
 * Used by chat to gate the Clan channel.
 *
 * @returns {string | null}
 */
export function getActiveClan() {
  return (window.G && window.G.clanName) ? window.G.clanName : null;
}

// Classic-script bridge.
//
// MERGE, never replace: src/features/identity.js publishes the write half of
// this same seam (validation, claim, avatar pipeline, the modal) as a classic
// script, and this module is ESM — so which one runs first is a load-order
// accident nobody should have to reason about. Both merge; there is exactly
// one window.HearthriseIdentity either way.
if (typeof window !== 'undefined') {
  window.HearthriseIdentity = Object.assign(window.HearthriseIdentity || {}, {
    getActiveSlot, getActiveCharId, getDisplayName, getActiveClan,
    hasUniqueName, getAvatarUrl,
  });
}
