// ════════════════════════════════════════════════════════════════════════
// src/data/social-settings.js — THE SOCIAL SIDE'S SETTINGS, AS REGISTRY ROWS.
//
// The settings window is becoming a categorised registry (src/data/settings.js,
// lane/settings-organized: rows { id, category, label, help, type, default,
// scope }). Until it lands on this base, the social side keeps its rows here
// for the integrator to fold in under "Chat & Social"; nothing is wedged into
// the Settings markup. A row of type 'panel' is drawn by the module it names
// (`panel`), which owns its reads and its intents; the Friends window shows the
// same panel today, so every row here is reachable before the fold.
//   blocked-players   the account's block list, each with Unblock
//                     (src/shell/windows/block-list.js; hr_block_set). Server
//                     state, so scope 'account' and no client default.
// ════════════════════════════════════════════════════════════════════════

export const SOCIAL_SETTINGS = Object.freeze([
  Object.freeze({
    id: 'blocked-players',
    category: 'Chat & Social',
    label: 'Blocked players',
    help: 'You see nothing they say, and they cannot message you, ask to be friends or inspect you.',
    type: 'panel',
    default: null,
    scope: 'account',
    panel: 'src/shell/windows/block-list.js',
  }),
]);
