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
 * Reads from G.playerName, falls back to the profile's displayName,
 * and finally to a generic placeholder.
 *
 * @returns {string}
 */
export function getDisplayName() {
  if (window.G && window.G.playerName) return window.G.playerName;
  const prof = window.HearthriseProfile && window.HearthriseProfile.profile;
  if (prof && prof.displayName) return prof.displayName;
  return 'Adventurer';
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

// Classic-script bridge
if (typeof window !== 'undefined') {
  window.HearthriseIdentity = {
    getActiveSlot, getActiveCharId, getDisplayName, getActiveClan,
  };
}
