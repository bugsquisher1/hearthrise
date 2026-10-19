// ════════════════════════════════════════════════════════════════════════
// src/data/social-menu.js — THE RIGHT-CLICK MENU'S ENTRIES, AS DATA.
//
// The menu (src/shell/context-menu.js) lists these rows in `order` for a
// target, keeping each row a provider says applies. The menu itself knows no
// system: a row names its provider, the provider (registered by the system that
// owns the verb) answers `when` and `run`. A row with `hidden` ships no button.
//   id        stable entry id
//   label     the button's words; a function of the target when it names it
//   provider  which system's provider owns the entry
//   targets   the target kinds it can apply to (player | monster)
// ════════════════════════════════════════════════════════════════════════

export const MENU_ENTRIES = Object.freeze([
  Object.freeze({ id: 'inspect', label: 'Inspect gear', provider: 'inspect', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'message', label: 'Message', provider: 'whispers', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'friend-add', label: 'Add friend', provider: 'friends', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'friend-remove', label: 'Remove friend', provider: 'friends', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'party-invite', label: 'Invite to party', provider: 'party', targets: Object.freeze(['player']) }),
  /* One of your own characters (its strip tab) that sits in a party: that character leaves it. */
  Object.freeze({ id: 'party-leave', label: 'Leave party', provider: 'party', targets: Object.freeze(['player']) }),
  /* Trade moves gold and items between players: it gets its own server lane and the Security review first. */
  Object.freeze({ id: 'trade', label: 'Trade', provider: 'trade', targets: Object.freeze(['player']), hidden: true }),
  Object.freeze({ id: 'block', label: 'Block', provider: 'blocks', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'unblock', label: 'Unblock', provider: 'blocks', targets: Object.freeze(['player']) }),
  Object.freeze({ id: 'look', label: 'Look', provider: 'look', targets: Object.freeze(['monster']) }),
].map((r, i) => Object.freeze(Object.assign({ order: i }, r))));
