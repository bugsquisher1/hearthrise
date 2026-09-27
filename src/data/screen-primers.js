// ============================================================
// src/data/screen-primers.js — "what is this screen for?", once per screen
//
// One row per panel id (the id of `main .panel.active`, never the tab name:
// 'shops', 'shop', 'premium' and 'market' reach two panels). Copy only — no
// numbers, no markup, nothing that describes one player's server state, so a
// row can never disagree with the envelope. Rendered by
// src/features/screen-primers.js; pinned by tests/screen-primers.mjs (G1-G8).
// ============================================================

const row = (title, body) => Object.freeze({ title, body });

export const SCREEN_PRIMERS = Object.freeze({
  'panel-farming': row('The Farm',
    'Crops grow in real time, even while you are away. Plant a seed from the Local Shop, water it to hurry it along, and carry the harvest to Cooking. Plant all and Water all save you the clicking.'),
  'panel-house': row('Your homestead',
    'Your home grows from a camp to a castle, one property tier at a time, paid in gold and in things you gathered and made. Each tier adds farm plots and hired hands, most open new rooms, and every room makes part of your day quicker or richer.'),
  'panel-stable': row('The Stable',
    'Companions travel with you one at a time. The one you equip lends you its bonus and earns experience of its own, and every locked card says where the others are found.'),
  'panel-shop': row('Shops',
    'The Local Shop sells starter gear, seeds and supplies for gold, and the Market beside it is where players trade. The Premium Shop lists gem packs, Hearth Tokens and Hearth Hall Premium; the web beta cannot buy them yet.'),
  'panel-market': row('The Market',
    'Every listing here was put up by a player, and every sale is settled by the realm rather than by either side. What you list stays up while you are away, until it sells or its time runs out.'),
  'panel-bounty': row('The Bounty Board',
    'Take a contract, slay what it names, and turn it in for gold, Bounty Marks and Bounty Hunter experience. One contract runs at a time, and Marks buy the upgrades in the shop beside the board.'),
  'panel-events': row('Events',
    'The day\'s blessing lives here, and so do the dungeons. A dungeon asks for a combat level and a key before it opens, rests between runs, and its boss keeps loot the open field never gives up.'),
  'panel-social': row('Leaderboards',
    'Every board here is ranked by the realm from what the server has counted, and your own place is pinned to each one. Find your name, then find the name just above it.'),
});
