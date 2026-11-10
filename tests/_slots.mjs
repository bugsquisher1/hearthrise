// ════════════════════════════════════════════════════════════════════════
// tests/_slots.mjs — HERO SLOTS FOR FIXTURES, SINCE AN ACCOUNT STARTS WITH ONE (Tyler 2026-11-09;
// supabase/migrations/2027-03-25-hero-slots-one.sql).
//
// Until that file every account owned slot 1 as a starter, so many fixtures made a second hero there
// unpaid. A fixture that needs more heroes now OWNS the slot the way a buyer does: the account-row flag
// `character_slot:<n>` hr_buy_hero_slot writes (hr_hero_slots_of clause 2). The purchase itself (price,
// ladder, journal) is graded where it lives: tests/hero-slot-buy.mjs and tests/hero-slots-one.mjs.
//
// asOldLadder(): an APPLIED file whose own self-check makes a second hero unpaid (it was written against
// the one-free-slot ladder) can only be re-applied over the chain that ladder stood in. A second-apply arm
// runs it with slot 1 a starter again and puts the row back after, so the arm still judges what it is for
// (the file re-applies byte for byte) and nothing of the ladder leaks past it.
// ════════════════════════════════════════════════════════════════════════

/**
 * Give an account hero slots 1..`upTo` as bought (the flag row, no gold moved). Its slot-0 hero must exist first
 * (player_progress references player_state).
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query  runs one statement
 */
export async function ownHeroSlots(query, uid, upTo = 1) {
  for (let n = 1; n <= upTo; n++) {
    await query("insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at) "
      + "values ($1, 0, 'flag', $2, 1, '', null, now()) on conflict do nothing", [uid, 'character_slot:' + n]);
  }
}

/**
 * Run `fn` with slot 1 a starter again (the ladder an older file's self-check was written against), then
 * restore the row exactly. @param {(sql: string) => Promise<unknown>} exec  runs SQL text
 */
export async function asOldLadder(exec, fn) {
  await exec("create temp table if not exists zz_slot_ladder as select * from public.hr_hero_slots where slot_id = 1");
  await exec('update public.hr_hero_slots set starter = true where slot_id = 1');
  try { return await fn(); } finally {
    try {
      await exec('update public.hr_hero_slots h set starter = z.starter, cost_gold = z.cost_gold from zz_slot_ladder z where h.slot_id = z.slot_id');
      await exec('drop table if exists zz_slot_ladder');
    } catch { /* an aborted transaction: the caller's rollback takes the update with it, and fn's own error is the one to see */ }
  }
}
