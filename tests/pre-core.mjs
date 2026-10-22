// ============================================================================
// tests/pre-core.mjs — THE LAST CHAIN POSITION BEFORE THE CORE REBUILD.
//
// 2026-10-27-core-schema.sql deletes the old model outright (the knockout, the
// combat styles, the stored max HP, the M8 party world tick and its
// hr_party_tick_settle). A guard that RE-APPLIES a historical migration whose own
// preconditions or §4 fixture name those objects (an arming file, an idempotency
// arm) must do it where they still exist, not at the chain end. Derived from
// tests/schema-apply-order/ (the file immediately before the core schema),
// never typed, so a file inserted before it moves it with no edit here — the
// wallet's PRE_WALLET (tests/wallet-fixture.mjs) is the same idea.
// ============================================================================
import { readFileSync } from 'node:fs';
import { loadApplyOrder } from '../tools/lib/apply-order.mjs';

export const CORE_MIGRATION = '2026-10-27-core-schema.sql';
export const PRE_CORE = (() => {
  const order = loadApplyOrder().order;
  const i = order.indexOf(CORE_MIGRATION);
  if (i < 1) throw new Error(`tests/pre-core.mjs: ${CORE_MIGRATION} is not in the apply order`);
  return order[i - 1];
})();
