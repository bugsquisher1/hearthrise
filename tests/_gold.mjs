// ════════════════════════════════════════════════════════════════════════
// tests/_gold.mjs — A TEST'S GOLD, ON EITHER SIDE OF 2026-12-15-account-gold.sql.
//
// Gold is ONE purse per ACCOUNT (public.account_wallet.gold) from that file on;
// before it, each hero carried player_state.gold. Guards that replay the whole
// chain seed and read the purse; their mutation arms often stop at an OLDER file
// (upTo LAST_PATCHED), where the per-hero column still exists. These helpers
// answer the same question on both schemas, so one fixture serves both.
//
//   q(sql, params) -> rows   the caller's own query function (any role it likes)
//   accountGold(q)           true when the schema keeps gold per account
//   goldOf(q, uid, slot)     the gold the hero spends (its account's purse, or its own)
//   setGold(q, uid, slot, n) set it (a FIXTURE write, no journal row: never a real path)
// ════════════════════════════════════════════════════════════════════════

const memo = new WeakMap();

export async function accountGold(q) {
  if (memo.has(q)) return memo.get(q);
  const rows = await q(`select exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'account_wallet' and column_name = 'gold') as a`);
  const v = !!(rows[0] && rows[0].a);
  memo.set(q, v);
  return v;
}

export async function goldOf(q, uid, slot = 0) {
  if (await accountGold(q)) {
    const r = await q('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text as g', [uid]);
    return Number(r[0].g);
  }
  const r = await q('select gold::text as g from public.player_state where user_id = $1 and slot = $2', [uid, slot]);
  return r[0] ? Number(r[0].g) : null;
}

export async function setGold(q, uid, slot, n) {
  if (await accountGold(q)) {
    await q(`insert into public.account_wallet as w (user_id, gold) values ($1, $2)
             on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [uid, n]);
    return;
  }
  await q('update public.player_state set gold = $3 where user_id = $1 and slot = $2', [uid, slot, n]);
}
