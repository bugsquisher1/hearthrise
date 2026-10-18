// ════════════════════════════════════════════════════════════════════════
// src/data/social-settings.js — THE SOCIAL SIDE'S ROWS IN THE SETTINGS REGISTRY.
//
// Spread into SETTINGS by src/data/settings.js (category chat_social, "Chat &
// Social"); the Settings window draws them like any row and holds no logic of
// the social side. A row that needs a panel of its own is an action row that
// OPENS the window owning that panel:
//   social.blocked   Blocked players: opens Friends, whose block list
//                    (src/shell/windows/block-list.js) lists each block with
//                    Unblock — ONE hr_block_set. Server state (chat_blocks), so
//                    nothing is kept in residue and nothing has a client default.
// ════════════════════════════════════════════════════════════════════════

export const SOCIAL_SETTINGS = Object.freeze([
  Object.freeze({
    id: 'social.blocked',
    category: 'chat_social',
    label: 'Blocked players',
    help: 'You see nothing they say, and they cannot message you, ask to be friends or inspect you.',
    type: 'action',
    open: 'friends',
  }),
]);
