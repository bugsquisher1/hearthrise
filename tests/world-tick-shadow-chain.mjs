// ============================================================================
// tests/world-tick-shadow-chain.mjs — SECURITY PROOF (2026-09-21, M1 review)
//
//   node tests/world-tick-shadow-chain.mjs
//
// THE SHADOW RUN STALLS AFTER ONE WINDOW PER CHARACTER, SO THE 48-HOUR PARITY
// MEASUREMENT THAT GATES ARMING CANNOT BE TAKEN.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────
// f970f66 ("chain SHADOW on its own watermark; split the two bearers") added
// `hr_tick_ownership.shadow_accrued_to` because in SHADOW the tick pays
// nothing, so `player_state.accrued_to` never moves and a tick chaining on it
// would propose [T0,T0+90], [T0,T0+180], [T0,T0+270] — overlapping windows,
// every one journalled, and a parity sum counting the same minutes repeatedly.
//
// The column landed. `hr_tick_roster` computes it, returns it, and seeds the
// per-window PRNG label from it. `hr_tick_settle` compares against it.
//
// BUT THE DRIVER NEVER SENDS IT. `hr_tick_cron_run`'s payload projection
// (2026-09-21-world-tick-cron.sql §2 step 3) lists ten keys and
// `shadow_accrued_to` is not among them, so the edge — the only thing that
// decides where a window starts — receives the FROZEN `accrued_to` and
// re-proposes the same first window on every fire. The fence then refuses
// every one of them after the first, correctly, as `window_already_settled`.
//
// Net: 1 shadow row per character instead of one per flush, forever. Over 48 h
// at a 90 s flush that is 1 row where 1,920 are expected — the tick reads as
// paying ~0.05% of what accrual pays. Read one way that blocks a correct
// rollout; read the other way somebody "fixes" the stall by loosening the CAS,
// which is the double pay S-3 exists to prevent.
//
// ── WHY NO EXISTING GUARD SEES IT ───────────────────────────────────────────
// tests/world-tick-double-pay.mjs D4e–D4g call `hr_tick_settle` DIRECTLY with a
// hand-supplied `window_from` already chained on the shadow mark, so they prove
// the FENCE chains correctly and are blind to whether the DRIVER ever delivers
// the mark to the caller that computes windows. No test in the repo reads
// `hr_tick_cron_run`'s payload. That is why the lane is green and wrong.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// Writes NOTHING to production. Every arm runs against a PGlite database
// rebuilt from supabase/migrations in tests/schema-apply-order.json order, on
// synthetic uuids `gen_random_uuid()` cannot mint (CLAUDE.md §2).
//
// Exit: 0 the chain survives the driver · 1 the shadow run stalls · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

const U = (n) => `00000000-0000-4000-8000-00000000e${String(n).padStart(3, '0')}`;
const KEY = (n) => `0000eeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FIRES = 4;                       // four driver fires; an honest chain tiles four windows

const problems = [];
const bad = (id, msg) => { problems.push(`${id}: ${msg}`); console.log(`  ✗ ${id} — ${msg}`); };
const good = (id, msg) => console.log(`  ✓ ${id} — ${msg}`);
const judge = (id, ok, okMsg, badMsg) => ok ? good(id, okMsg) : bad(id, badMsg);

let ACT = null;

async function makeChar(db, u) {
  await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
  await db.exec(`
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since)
    values ('${u}', 0, 0, 0, 10, 10, 1, now() - interval '30 minutes',
            'gather', '${ACT}', now() - interval '2 hours')
    on conflict (user_id, slot) do update
      set version = 1, gold = 0, accrued_to = now() - interval '30 minutes',
          active_kind = 'gather', active_id = '${ACT}';`);
  await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
  await db.exec(`
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values ('${u}', 0, 'gather', true, 'cron:postgres', now() + interval '10 minutes');`);
}

/* ONE DRIVER FIRE, projected EXACTLY as hr_tick_cron_run §2 step (3) does.
   `keys` is the payload key list; the point of the whole file is that the real
   driver's list omits `shadow_accrued_to`. */
async function fire(db, u, keys) {
  const proj = keys.map((k) => `'${k}', r.${k}`).join(', ');
  const { rows } = await db.query(`
    select jsonb_agg(jsonb_build_object(${proj}) order by r.accrued_to, r.user_id, r.slot) as batch
      from public.hr_tick_roster(array['gather']::text[], 0, 200, 'cron:postgres', 30000,
                                 null::timestamptz, null::uuid, null::int) r
     where r.user_id = '${u}'`);
  return rows[0].batch?.[0] ?? null;
}

/* The edge's half: it chains from whatever watermark the payload gave it. */
async function settleFrom(db, u, mark, n) {
  const { rows } = await db.query(`
    select public.hr_tick_settle('cron:postgres', '${u}'::uuid, 0, 'gather', 1::bigint,
             '${mark}'::timestamptz, '${mark}'::timestamptz + interval '90 seconds',
             '${KEY(n)}'::uuid,
             jsonb_build_object('gold', 100,
               'accrued_to', to_jsonb('${mark}'::timestamptz + interval '90 seconds'),
               'journal', jsonb_build_object('kind','gather','intent','accrue',
                 'meta', jsonb_build_object('src','tick','qty',7,'ticks',3)))) as r`);
  return rows[0].r;
}

const shadowRows = async (db, u) => Number((await db.query(
  `select count(*)::int as n from public.hr_tick_shadow where user_id = '${u}'`)).rows[0].n);

/* Run FIRES driver fires, chaining on whichever payload key the driver shipped. */
async function run(db, u, keys, chainKey) {
  await makeChar(db, u);
  await db.exec(`update public.hr_tick_config set enabled = true, shadow = true where id;`);
  const errs = [];
  for (let i = 0; i < FIRES; i++) {
    const row = await fire(db, u, keys);
    if (!row) { errs.push('roster returned nothing'); break; }
    const mark = row[chainKey] ?? row.accrued_to;
    const out = await settleFrom(db, u, mark, i);
    if (out.ok !== true) errs.push(out.error);
  }
  return { rows: await shadowRows(db, u), errs };
}

// ── main ────────────────────────────────────────────────────────────────────
console.log('world-tick-shadow-chain: the SHADOW parity run must survive its own driver');

const SRC = await readFile('supabase/migrations/2026-09-21-world-tick-cron.sql', 'utf8');
const { db, failures } = await bootReplay({});
if (failures.length) { console.error('the schema replay did not complete:', failures); process.exit(2); }

try {
  ACT = (await db.query("select activity_id from public.hr_activities where kind = 'gather' limit 1"))
    .rows[0]?.activity_id;
  if (!ACT) { console.error('no gather activity in hr_activities'); process.exit(2); }

  // ── SC-1 STRUCTURAL. The driver's payload must carry the watermark the tick
  //        chains on while shadowed, or the edge cannot chain at all.
  const proj = SRC.match(/select jsonb_agg\(jsonb_build_object\(([\s\S]*?)\)\s*\n\s*order by/);
  const keys = proj ? [...proj[1].matchAll(/'([a-z_]+)',\s*r\./g)].map((m) => m[1]) : [];
  judge('SC-1', keys.includes('shadow_accrued_to'),
    `hr_tick_cron_run projects the shadow watermark (${keys.length} payload keys)`,
    'hr_tick_cron_run\'s payload omits `shadow_accrued_to` — the roster RETURNS it and the fence '
    + `compares against it, but the edge is handed only the frozen accrued_to. Keys sent: ${keys.join(', ')}`);

  // ── SC-2 BEHAVIOURAL. Four fires through the driver's ACTUAL payload.
  const actual = await run(db, U(1), keys, 'accrued_to');
  judge('SC-2', actual.rows === FIRES,
    `${FIRES} fires journalled ${actual.rows} shadow windows — the chain tiles`,
    `${FIRES} fires journalled only ${actual.rows} shadow window(s); fires 2..${FIRES} were refused `
    + `[${[...new Set(actual.errs)].join(', ')}]. The parity run stalls after the first window and `
    + 'the 48 h measurement that gates arming cannot be taken.');

  // ── SC-3 THE CONTROL. The same four fires, chaining on the column the roster
  //        already computes. If this is green the column is right and ONLY the
  //        driver's projection is at fault — which is the one-line fix.
  const fixed = await run(db, U(2), [...keys, 'shadow_accrued_to'], 'shadow_accrued_to');
  judge('SC-3', fixed.rows === FIRES,
    `chaining on the roster's shadow_accrued_to tiles all ${FIRES} windows — the column is correct `
    + 'and the defect is confined to the driver\'s payload projection',
    `even chaining on shadow_accrued_to only ${fixed.rows} window(s) landed `
    + `[${[...new Set(fixed.errs)].join(', ')}] — the defect is deeper than the projection`);
} finally {
  await db.close();
}

console.log('');
if (problems.length) {
  console.log(`world-tick-shadow-chain: ${problems.length} failure(s) — SHADOW cannot be measured on production.`);
  process.exitCode = 1;
} else {
  console.log('world-tick-shadow-chain: green — the driver hands the edge the watermark it chains on.');
}
