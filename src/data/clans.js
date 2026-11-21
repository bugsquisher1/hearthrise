// ════════════════════════════════════════════════════════════════════════
// src/data/clans.js — CLANS IN THE FIRST BUILD: THE ROSTER, THE CLAN CHAT TAB AND THE BROWSER (chapter 06 section 2.4 and 2.11, MM-8;
// Tyler's rulings 25-3, 25-6 and 25-7 of 2026-11-20; built by lane/c-social, FB-12).
//
// A clan is one for each account, and all four heroes carry it (25-7). Founding one costs gold, paid by RPC and journalled (25-6). Finding
// one is a browser with search (25-3) and it has one chat tab (25-3). The castle, its votes, upkeep, treasury, rations and work orders
// wait until clans exist and people are in them (13 section 1.2): their server calls stay on the server, HIDDEN from every client, never
// dropped, because chapter 14 builds the castle on them (Part C X-04).
//
// The server holds its own copy of these rules, written by tools/gen-social-catalogue.mjs (hr_clan_rules; --check holds the two equal). Every number a player can act on (the price, a clan's members, its cap) is read from the
// server's answer, never from here: this file is the source the server row is checked against.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/*   foundGold   the gold founding a clan costs (25-6, RULED 2026-11-20), from the founder's purse, journalled
     nameMin/Max a clan's name, in characters (the clans table's own check)
     tagMin/Max  a clan's tag, letters and digits, shown in capitals beside a name on the roster, the browser and the presence strip
     browserMax  clans one browser read lists at most (the server clamps any ask)
     inviteDays  an invite stands this many days */
export const CLAN_RULES = Object.freeze({
  foundGold: 100000,
  nameMin: 3, nameMax: 24,
  tagMin: 2, tagMax: 4,
  browserMax: 50,
  inviteDays: 7,
});

/* THE RANKS, in the roster's order (MM-8: leader, officer, member). A leader and an officer may invite and remove members; only the
   leader sets a rank or hands the clan on. */
export const CLAN_RANKS = Object.freeze(['leader', 'officer', 'member']);

/* HOW ONE JOINS: open (anyone joins from the browser) or invite (only an invited account). */
export const CLAN_POLICIES = Object.freeze(['open', 'invite']);
