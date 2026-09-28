// src/data/standings.js — the crown each skill board's rank 1 wears.
//
// Client-only display copy: the crown each skill board's rank 1 wears. No src/core or src/data module may import it (tests/standings.mjs STAND-3).
// The rank behind a crown is the server's; this file only names it. Add a row, not code.

export const STANDING_CROWNS = Object.freeze({ attack: 'the First Blade', strength: 'the Iron Arm', defense: 'the Steadfast', hitpoints: 'the Unbowed', prayer: 'the Graveward', magic: 'the Spellwright', ranged: 'the Farshot', woodcutting: 'the Oakfeller', mining: 'the Veinfinder', fishing: 'the Netmaster', farming: 'the Harvest Keeper', cooking: 'the Feastmaker', crafting: 'the Fine Hand', smithing: 'the Anvil', runecrafting: 'the Sealmaker', stonemason: 'the Wallwright', bountyHunter: 'the Huntmaster' });
