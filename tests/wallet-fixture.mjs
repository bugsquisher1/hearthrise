// ============================================================================
// tests/wallet-fixture.mjs — READ AND FUND A GEM BALANCE ON WHICHEVER SCHEMA
//                            THE REPLAY STOPPED AT.
//
// 2026-10-19-account-wallet.sql moved gems from player_state.gems (one per
// hero) to public.account_wallet (one per account) and dropped the column. A
// guard's plain run replays the whole chain (the wallet); its --mutate runs stop
// at the guard's own older file (the column). One helper, asked once per
// database, so a fixture never names a column the replay does not have — and
// never fakes the answer: on the wallet schema `slot` is ignored because there
// is no per-hero balance left to address.
//
// PRE_WALLET — the last chain position whose schema still HAS player_state.gems.
// A historical migration's own §4 fixture inserts that column, so a guard that
// RE-APPLIES such a file (an idempotency arm) must do it there, not at the chain
// end where the wallet has dropped it. Derived from tests/schema-apply-order/
// (the file immediately before the wallet), never typed, so a file inserted
// before the wallet moves it with no edit here.
// ============================================================================
import { readFileSync } from 'node:fs';
import { loadApplyOrder } from '../tools/lib/apply-order.mjs';

export const WALLET_MIGRATION = '2026-10-19-account-wallet.sql';
export const PRE_WALLET = (() => {
  const order = loadApplyOrder().order;
  const i = order.indexOf(WALLET_MIGRATION);
  if (i < 1) throw new Error(`tests/wallet-fixture.mjs: ${WALLET_MIGRATION} is not in the apply order`);
  return order[i - 1];
})();

/** @param {{query: (sql: string, params?: any[]) => Promise<{rows: any[]}>}} db */
export async function walletFixture(db) {
  const wallet = (await db.query(
    "select to_regclass('public.account_wallet') is not null as w")).rows[0].w === true;
  return {
    wallet,
    /** The balance the account (wallet) or the hero (column) holds. */
    async gemsOf(uid, slot = 0) {
      const r = wallet
        ? await db.query('select gems::text g from public.account_wallet where user_id = $1', [uid])
        : await db.query('select gems::text g from public.player_state where user_id = $1 and slot = $2', [uid, slot]);
      return Number(r.rows[0]?.g ?? 0);
    },
    /** FIXTURE FUNDING ONLY (a test database): set the balance outright. */
    async setGems(uid, slot, n) {
      if (wallet) {
        await db.query(`insert into public.account_wallet (user_id, gems) values ($1, $2)
                          on conflict (user_id) do update set gems = excluded.gems`, [uid, n]);
      } else {
        await db.query('update public.player_state set gems = $3 where user_id = $1 and slot = $2', [uid, slot, n]);
      }
    },
  };
}
