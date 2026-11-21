// ════════════════════════════════════════════════════════════════════════
// src/data/clans.js — CLANS IN THE FIRST BUILD: THE ROSTER, THE CLAN CHAT TAB AND THE BROWSER (chapter 06 section 2.4 and 2.11, MM-8;
// Tyler's rulings 25-3, 25-6 and 25-7 of 2026-11-20; built by lane/c-social, FB-12).
//
// A clan is one for each account, and all four heroes carry it (25-7). Founding one costs gold, paid by RPC and journalled (25-6). Finding
// one is a browser with search (25-3) and it has one chat tab (25-3). The castle, its votes, upkeep, treasury, rations and work orders
// wait until clans exist and people are in them (13 section 1.2): their server calls stay on the server, HIDDEN from every client, never
// dropped, because chapter 14 builds the castle on them (Part C X-04).
//
// The server holds its own copy of these rules, seeded by supabase/migrations/1036-social-clans.sql (hr_clan_rules); tests/clans.mjs
// holds the two equal on the replayed chain. Every number a player can act on (the price, a clan's members, its cap) is read from the
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

/* THE CASTLE'S SERVER CALLS, HIDDEN AND KEPT (Part C X-04, T-12): no client may run them in the first build, and no migration drops them.
   1036-social-clans.sql §4 asserts both on every replay; the four clan guards (tests/clan-*.mjs) read this list. */
export const CLAN_HIDDEN_CALLS = Object.freeze([
  'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
  'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit', 'clan_feast_deposit__ungated',
  'clan_invite', 'clan_invites_list', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read', 'clan_seat_read__ungated',
  'clan_upkeep_settle', 'clan_vice_set', 'clan_vice_set__ungated',
  'clan_vote_cast', 'clan_vote_cast__ungated', 'clan_vote_close', 'clan_vote_close__ungated',
  'clan_vote_open', 'clan_vote_open__ungated', 'clan_vote_read', 'clan_vote_read__ungated',
  'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
  'clan_work_supply', 'clan_work_supply__ungated',
]);

/* THE CALLS A PLAYER USES (the first build): each is client-executable and on hr_client_rpc_baseline. */
export const CLAN_OPEN_CALLS = Object.freeze([
  'hr_clan_found', 'hr_clan_browser', 'hr_clan_roster', 'hr_clan_invite', 'hr_clan_rank',
  'clan_join', 'clan_leave', 'clan_kick', 'clan_invite_revoke', 'clan_join_policy_set',
]);
