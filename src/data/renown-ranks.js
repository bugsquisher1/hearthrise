// ════════════════════════════════════════════════════════════════════════
// src/data/renown-ranks.js — THE SERVER-OWNED RENOWN RANK-REWARD CATALOGUE.
//
// The Renown THRESHOLD (`min`) and the GOLD/GEM REWARD for every rank the server
// credits under `hr_claim_rank`
// (supabase/migrations/2026-08-22-renown-claim.sql). This is the SINGLE SOURCE
// for those numbers; the SQL RPC embeds a copy and
// tests/collection-renown-claim-drift.mjs binds THREE sides so none can drift
// in silence:
//   (1) this module,
//   (2) the authored client ladder in src/features/renown.js (RANKS),
//   (3) the server catalogue inside the migration SQL.
//
// ── WHY THIS FILE EXISTS (and did not before) ───────────────────────────────
// 2026-08-20-renown.sql already server-derives the renown SCORE (hr_renown_of)
// and embeds the FOUR allXP thresholds (squire/baron/duke/highking) for the perk
// channel — but NOT the rank REWARD amounts, which stayed client-authored. The
// claim RPC must own the payout, so the whole reward ladder is lifted here. It is
// a strict superset of renown.sql's four thresholds (that file's fidelity note #1
// names this extraction as its scheduled follow-up).
//
// ── WHAT THE SERVER DECIDES ─────────────────────────────────────────────────
// A rank is CLAIMABLE when the character's SERVER HIGH-WATER renown
// (player_state.renown_high, a monotonic ratchet the server advances) is >=
// `min`. The client-supplied rank id + slot are the ONLY things that cross the
// wire; NO client value determines the rank reached or the amount paid.
//
// `peasant` (min 0) has no reward and is deliberately ABSENT — a rank with no
// gold/gems never fires a claim.
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

export const RENOWN_RANK_REWARDS = Object.freeze({
  serf:     Object.freeze({ min: 400,    gold: 250 }),
  squire:   Object.freeze({ min: 900,    gold: 750 }),
  knight:   Object.freeze({ min: 2200,   gold: 2000 }),
  baron:    Object.freeze({ min: 4500,   gold: 5000,    gems: 25 }),
  viscount: Object.freeze({ min: 8000,   gold: 10000 }),
  count:    Object.freeze({ min: 13500,  gold: 20000,   gems: 50 }),
  marquis:  Object.freeze({ min: 21000,  gold: 40000 }),
  duke:     Object.freeze({ min: 32000,  gold: 75000,   gems: 100 }),
  prince:   Object.freeze({ min: 48000,  gold: 150000 }),
  king:     Object.freeze({ min: 72000,  gold: 300000,  gems: 250 }),
  highking: Object.freeze({ min: 120000, gold: 1000000, gems: 500 }),
});
