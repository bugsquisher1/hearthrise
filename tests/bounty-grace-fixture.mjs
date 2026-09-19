// ════════════════════════════════════════════════════════════════════════
// tests/bounty-grace-fixture.mjs — BURN THE FIRST-CONTRACT GRACE THE WAY A
// TURN-IN DOES. Shared by the bounty guards; not a guard itself (it is
// "chained from another guard" to tests/guard-hygiene.mjs).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// hr_bounty_first_contract widens the required-kill FLOOR while a character
// has fewer than three turn-ins, so any guard measuring the TIER table must
// burn the grace first or it silently measures the beginner bracket — the
// always-null probe family. Two guards need that (bounty-difficulty-count,
// bounty-accept-bh-clamp) and both used to do it by writing SIX
// `bounty_turnin:` rows into public.player_ledger, because that is where the
// reader counted them.
//
// 2026-09-19-lifetime-facts-off-the-ledger.sql MOVED THE FACT. A lifetime
// count may not live in a table with a 90-day retention, so the turn-in now
// increments a durable counter — player_progress(kind='stat',
// key='bounty_turnins', period_key='') — and hr_bounty_first_contract reads
// THAT. The ledger-only fixture therefore stopped burning anything the moment
// the migration entered the chain, and both guards went red against a correct
// server. This is a FIXTURE defect, not a behaviour change: a real player's
// turn-in writes both halves, and every pre-migration turn-in is carried into
// the counter by the migration's own hr_backfill_lifetime_facts() run.
//
// ── THE RULE THIS FILE ENCODES ──────────────────────────────────────────
// Burn it the way hr_claim_bounty__ungated does, in the same order: the
// durable counter first, then the journal row it mirrors. Writing BOTH halves
// is what keeps the fixture honest across the chain boundary — a guard booted
// with `upTo` a migration BEFORE 2026-09-19 still reads the ledger, and one
// booted on the full chain reads the counter. A fixture that wrote only the
// new half would silently stop burning on the pre-migration replay AC-8 uses,
// which is the same defect in the other direction.
//
// If a future migration moves the fact again, it moves HERE, once.
// ════════════════════════════════════════════════════════════════════════

/** The turn-in count at or above which the beginner grace is spent. */
export const BOUNTY_FIRST_CONTRACT_GRACE = 3;

/**
 * Burn a character's first-contract grace as `n` completed cull turn-ins.
 *
 * @param {(sql: string, params?: any[]) => Promise<any[]>} q  a raw SQL runner
 *   (superuser / definer-equivalent — this is fixture seeding, not an intent).
 * @param {string} uid   the character's user id
 * @param {object} [opts]
 * @param {number} [opts.slot=0]
 * @param {number} [opts.n=6]  turn-ins to record; must exceed the grace so the
 *   burn is unambiguous rather than landing exactly on the boundary.
 */
export async function burnBountyGrace(q, uid, { slot = 0, n = 6 } = {}) {
  if (n <= BOUNTY_FIRST_CONTRACT_GRACE) {
    throw Object.assign(
      new Error(`burnBountyGrace: n=${n} does not exceed the grace of `
        + `${BOUNTY_FIRST_CONTRACT_GRACE} — the fixture would not burn it`),
      { harness: true },
    );
  }
  // (1) THE DURABLE COUNTER — what hr_bounty_first_contract reads from
  //     2026-09-19 on. An UPSERT because a character who has never turned one
  //     in holds no row, which is precisely the population the grace is for.
  await q(`insert into public.player_progress as pp
             (user_id, slot, kind, key, value, period_key, updated_at)
           values ($1, $2, 'stat', 'bounty_turnins', $3, '', now())
           on conflict (user_id, slot, kind, key, period_key) do update
             set value = pp.value + excluded.value, updated_at = now()`,
  [uid, slot, n]);
  // (2) THE JOURNAL ROWS the counter mirrors — what the reader counted BEFORE
  //     2026-09-19, and what the audit trail still carries after it.
  await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta)
           select $1, $2, 'bounty', 'bounty_turnin:burn', '{}'::jsonb
             from generate_series(1, $3)`, [uid, slot, n]);
}
