// ════════════════════════════════════════════════════════════════════════
// tools/lib/hr-apply-replay.mjs — ONE CHARACTER, SEEDED FROM AN ENGINE SESSION,
//                                 PAID THROUGH THE REPLAYED hr_apply.
//
// Two readers apply engine deltas through this checkout's replayed migration
// chain (tests/schema-replay.mjs, PGlite) and read back what the server wrote:
//   tools/deploy-differential.mjs (iii)   old pack vs new pack, same answers,
//                                         state and ledger
//   tests/world-tick-combat-replay.mjs R1 a recorded probe's one-span delta,
//                                         state and ledger equal to its result
// Moved here from deploy-differential.mjs (2026-10-14) so the seeding rule
// (which session field lands in which column) and the hr_engine call are
// written once.
//
// A session is the engine's input shape (tick-shadow.js hydrate / a probe's
// stored input): gold, hp, maxHp, accruedToMs, activeKind, activeId,
// activeSinceMs, perks.companion, toolCarry, skills, inventory.
//
// Read-only on production: no network, no credentials. The caller owns the
// transaction (`applyAsEngine` uses a savepoint and `set local role`).
// ════════════════════════════════════════════════════════════════════════

/** What the replayed chain has, read rather than assumed (gems moved to account_wallet 2026-10-19). */
export async function replayCaps(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    hasGemsCol: (await q(`select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'player_state' and column_name = 'gems'`)).length > 0,
    hasWallet: (await q("select to_regclass('public.account_wallet') as t"))[0].t !== null,
  };
}

/** A fresh slot-0 character for `uid`, seeded from an engine session. */
export async function seedCharacter(db, caps, uid, s) {
  const q = (sql, p) => db.query(sql, p);
  await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
  await q(`insert into public.player_state (user_id, slot, gold, ${caps.hasGemsCol ? 'gems, ' : ''}hp, max_hp, version, accrued_to,
             active_kind, active_id, active_since, companion_equipped)
           values ($1, 0, $2, ${caps.hasGemsCol ? '0, ' : ''}$3, $4, 1, to_timestamp($5::double precision / 1000), $6, $7,
                   to_timestamp($8::double precision / 1000), $9)`,
  [uid, Math.max(0, Math.floor(s.gold || 0)), s.hp, s.maxHp, s.accruedToMs, s.activeKind,
    s.activeId, s.activeSinceMs ?? s.accruedToMs, s.perks?.companion?.id ?? null]);
  if (s.toolCarry) await q('update public.player_state set tool_carry = $2::jsonb where user_id = $1', [uid, JSON.stringify(s.toolCarry)]);
  for (const [k, v] of Object.entries(s.skills || {})) {
    if (Number(v) > 0) await q('insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, $3)', [uid, k, Math.floor(v)]);
  }
  for (const [k, v] of Object.entries(s.inventory || {})) {
    if (Number(v) > 0) await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [uid, k, Math.floor(v)]);
  }
}

/** hr_apply as hr_engine at the row's current version. A throw is a refusal, never a pass. */
export async function applyAsEngine(db, uid, delta, intentId) {
  const v = (await db.query('select version from public.player_state where user_id = $1 and slot = 0', [uid])).rows[0].version;
  await db.exec('savepoint hr_apply_replay'); await db.exec('set local role hr_engine');
  try {
    const r = (await db.query('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
      [uid, v, intentId, JSON.stringify(delta)])).rows[0].r;
    await db.exec('reset role'); await db.exec('release savepoint hr_apply_replay');
    return r;
  } catch (e) {
    await db.exec('rollback to savepoint hr_apply_replay'); await db.exec('reset role');
    return { ok: false, error: `threw: ${String(e.message).slice(0, 100)}` };
  }
}

export const answerOf = (r) => (r && r.ok === true ? 'ok' : `refused:${(r && (r.error || r.why)) || '?'}`);

const STRIP = new Set(['user_id', 'id', 'ts', 'at', 'created_at', 'updated_at']);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !STRIP.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)));

/** Every player table's rows for `uid`, ids and timestamps stripped, as sorted JSON lines. */
export async function stateOf(db, caps, uid) {
  const out = {};
  for (const t of ['player_state', 'player_skills', 'player_inventory', 'player_progress', 'player_equipment', 'player_bank',
    ...(caps.hasWallet ? ['account_wallet'] : [])]) {
    out[t] = (await db.query(`select to_jsonb(t) as j from public.${t} t where user_id = $1`, [uid])).rows
      .map((r) => JSON.stringify(clean(r.j))).sort();
  }
  return out;
}

/* Ledger rows minus ids and timestamps; `meta.intent_id` is shared (one id per
   window index, the same for both characters), so it is compared. */
export async function ledgerOf(db, uid) {
  return (await db.query(
    'select kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta from public.player_ledger where user_id = $1 order by id', [uid])).rows
    .map((r) => { if (r.meta && typeof r.meta === 'object') delete r.meta.nth_ever; return JSON.stringify(r); });
}
