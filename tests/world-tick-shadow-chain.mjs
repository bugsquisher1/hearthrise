// ============================================================================
// tests/world-tick-shadow-chain.mjs — SECURITY PROOF (2026-09-21, M1 review)
//
//   node tests/world-tick-shadow-chain.mjs
//   node tests/world-tick-shadow-chain.mjs --mutate            every mutant must go RED
//   node tests/world-tick-shadow-chain.mjs --mutate --<name>   one of them
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
import { applyShadowState, SHADOW_STATE_V } from '../supabase/functions/hr-accrue/tick-contract.js';

/* ── THE MUTATION PROOF (Security S-2, 2026-09-23) ──────────────────────────
   Until today this file took `--mutate` and IGNORED it: the flag parsed
   nowhere, the ten arms ran unchanged and the process exited 0. A guard that
   has never been red is not a guard (CLAUDE.md §4), and a flag that answers
   green without doing anything is worse than no flag — it answers the question
   "has this been mutation-proved?" with a lie that costs one command to check.
   Each mutant below breaks ONE load-bearing line of the chain and names the
   arm that must go red because of it. */
const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const MUTATION = (ARGS.find((a) => a.startsWith('--') && a !== '--mutate') || '').replace(/^--/, '');
const MIG = '2026-09-23-world-tick-shadow-state-chain.sql';

const U = (n) => `00000000-0000-4000-8000-00000000e${String(n).padStart(3, '0')}`;
const KEY = (n) => `0000eeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FIRES = 4;                       // four driver fires; an honest chain tiles four windows

let problems = [];
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
console.log('  SC-1..SC-3 the watermark reaches the edge · SC-4..SC-10 the CHARACTER does too');

const SRC = await readFile('supabase/migrations/2026-09-21-world-tick-cron.sql', 'utf8');
const TICK_FILE = await readFile('supabase/functions/hr-accrue/tick.js', 'utf8');

/* The whole suite, so a mutant can re-run it against a patched schema (and a
   patched driver source) instead of the shipped one. `patches` is
   bootReplay's filename -> [[find, replace]] map; `tickSource` stands in for
   tick.js where an arm reads the driver's own decision. */
async function runSuite({ patches, tickSource, allowReplayFailure = false } = {}) {
  problems = [];
  const TICK_SRC = tickSource ?? TICK_FILE;
  /* A MUTANT MAY BE CAUGHT BEFORE ANY ARM RUNS, and that is the strongest
     verdict available: the migration's own §5 self-check EXECUTES against the
     mutated body at apply time, so a broken carrier makes the file refuse to
     apply at all. `tolerant` collects that instead of throwing, and the mutant
     driver counts it RED — naming which self-check arm bit. Unmutated, a
     replay failure is still a hole in disaster recovery and still exits 2. */
  const { db, failures } = await bootReplay(
    patches ? { patches, tolerant: allowReplayFailure } : { tolerant: allowReplayFailure });
  if (failures.length) {
    if (allowReplayFailure) {
      if (db) await db.close();
      return { problems: [], replayRefused: failures };
    }
    console.error('the schema replay did not complete:', failures); process.exit(2);
  }

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

    // ══════════════════════════════════════════════════════════════════════════
    // SC-4 .. SC-9 — THE CARRIER (M3, 2026-09-23)
    //
    // SC-1..SC-3 proved the WATERMARK reaches the edge. The watermark is not the
    // chain: it says WHEN the next window starts and nothing about WHO starts it.
    // Measured on production 2026-09-23 16:40 UTC (QA slot 1, hp 4/10, no food,
    // auto-eat off, armed in shadow at 15:36): 42 windows in 62 minutes,
    // `would_deaths = 1` in 41 of them, `would_hp = 4` in ALL of them,
    // `would_recovering_until` ~31 minutes past the end of every one. A chained
    // character is knocked out ONCE and then files zero kills for twenty windows.
    // Every window was re-simulated from the same frozen `player_state` row,
    // because SHADOW pays nothing and nothing else carried the character.
    //
    // These arms run the REAL `hr_tick_settle` against the REAL fence on a
    // database rebuilt from supabase/migrations, and assert the round trip:
    // stored on the shadow branch under the mark's own lock, handed back on the
    // `window_already_settled` refusal the driver already reads the mark from,
    // refused on the armed branch, and cleared when an armed settle pays.
    // ══════════════════════════════════════════════════════════════════════════
    /* jsonb DOES NOT PRESERVE KEY ORDER (it stores a sorted, deduplicated object),
       so `JSON.stringify` is not a comparison — it is a comparison of Postgres's
       storage order against ours, and it fails on a carrier that round-tripped
       perfectly. Canonicalise both sides. */
    const canon = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(canon);
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
      return out;
    };
    const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

    const U4 = U(4);
    const ST1 = { v: 1, base_version: 1, hp: 4, consec_falls: 2, gold: 17,
      items: { cooked_trout: -3 }, recovering_until: 0 };
    const ST2 = { v: 1, base_version: 1, hp: 9, consec_falls: 0 };

    await makeChar(db, U4);
    await db.exec('update public.hr_tick_config set enabled = true, shadow = true where id;');

    const settle = async (mark, toIso, key, state) => (await db.query(`
      select public.hr_tick_settle('cron:postgres', $1::uuid, 0, 'gather', 1::bigint,
               $2::timestamptz, $3::timestamptz, $4::uuid,
               jsonb_build_object('gold', 100, 'accrued_to', to_jsonb($3::timestamptz),
                 'journal', jsonb_build_object('kind','gather','intent','accrue',
                   'meta', jsonb_build_object('src','tick','qty',7,'ticks',3))),
               $5::jsonb) as r`,
      [U4, mark, toIso, key, state == null ? null : JSON.stringify(state)])).rows[0].r;

    /* THE DRIVER'S OWN READ PATH, verbatim: `probeWatermark` names a window that
       starts at the epoch, which is already settled for every character that
       exists, and reads the mark off the refusal. */
    const probe = async () => (await db.query(`
      select public.hr_tick_settle('cron:postgres', $1::uuid, 0, 'gather', null::bigint,
               '1970-01-01T00:00:00Z'::timestamptz, now(),
               '00000000-0000-0000-0000-000000000000'::uuid,
               jsonb_build_object('accrued_to', to_jsonb(now()))) as r`, [U4])).rows[0].r;

    const ownRow = async () => (await db.query(
      'select shadow_accrued_to, shadow_state from public.hr_tick_ownership'
      + " where user_id = $1 and slot = 0 and channel = 'gather'", [U4])).rows[0];

    const mark0 = (await db.query(
      'select accrued_to from public.player_state where user_id = $1 and slot = 0', [U4]))
      .rows[0].accrued_to;
    const plus = (t, s) => new Date(new Date(t).getTime() + s * 1000).toISOString();
    const t1 = plus(mark0, 90);
    const t2 = plus(mark0, 180);

    // ── SC-4: a shadow settle STORES the carrier and MOVES the mark, together.
    const w1 = await settle(new Date(mark0).toISOString(), t1, KEY(41), ST1);
    const own1 = await ownRow();
    judge('SC-4', w1.ok === true && own1.shadow_state != null
          && same(own1.shadow_state, ST1)
          && own1.shadow_accrued_to != null,
      'a shadow settle stored the continuation state VERBATIM and moved shadow_accrued_to '
      + 'in one statement under the row lock',
      `the shadow branch did not carry the state — settle ${JSON.stringify(w1)}, `
      + `row ${JSON.stringify(own1)}`);

    // ── SC-5: e15 still holds. NOTHING a player owns moved.
    const ps1 = (await db.query(
      'select gold, version, accrued_to from public.player_state where user_id = $1 and slot = 0',
      [U4])).rows[0];
    judge('SC-5', Number(ps1.gold) === 0 && Number(ps1.version) === 1
          && new Date(ps1.accrued_to).getTime() === new Date(mark0).getTime(),
      'the shadow settle that stored a carrier still paid NOTHING — gold, version and '
      + 'accrued_to all unmoved (e15)',
      `a shadow settle MOVED player value: ${JSON.stringify(ps1)}`);

    // ── SC-6: THE READ PATH. The carrier comes back on the same refusal the
    //        driver already reads the mark from. Without this the chain is
    //        write-only and the production defect is untouched.
    const pr = await probe();
    judge('SC-6', pr.error === 'window_already_settled' && pr.shadow === true
          && same(pr.shadow_state, ST1),
      'probeWatermark\'s refusal carries the stored state back to the driver, under the '
      + 'fence\'s own row lock, in the settling role\'s own transaction',
      `the probe did not return the carrier: ${JSON.stringify(pr)}`);

    // ── SC-7: A REPLAY IS A NO-OP FOR BOTH. The watermark CAS refuses the
    //        replayed window before §8, so neither the journal nor the carrier
    //        moves — and crucially the replay's OWN state does not overwrite the
    //        stored one.
    const before = await shadowRows(db, U4);
    const rep = await settle(new Date(mark0).toISOString(), t1, KEY(41), ST2);
    const own2 = await ownRow();
    judge('SC-7', rep.ok !== true && (await shadowRows(db, U4)) === before
          && same(own2.shadow_state, ST1),
      `a replayed shadow window was refused (${rep.error}) and moved neither the journal nor `
      + 'the carrier',
      `the replay was not a no-op: ${JSON.stringify(rep)} / ${JSON.stringify(own2)}`);

    // ── SC-8: THE CHAIN TILES. The next window is accepted and REPLACES the
    //        carrier rather than merging into it.
    const w2 = await settle(t1, t2, KEY(42), ST2);
    const own3 = await ownRow();
    judge('SC-8', w2.ok === true && same(own3.shadow_state, ST2),
      'the next window chained and replaced the carrier with its own output state',
      `the chain did not advance: ${JSON.stringify(w2)} / ${JSON.stringify(own3)}`);

    // ── SC-9: AN ARMED WINDOW MAY NOT CARRY ONE. Refused, never ignored: a
    //        carrier silently dropped on the branch that PAYS is how a proposal
    //        built in the other mode gets believed by the writer.
    await db.exec('update public.hr_tick_config set shadow = false where id;');
    const armedWithState = await settle(t2, plus(mark0, 270), KEY(43), ST2);
    const goldAfter = Number((await db.query(
      'select gold from public.player_state where user_id = $1 and slot = 0', [U4])).rows[0].gold);
    judge('SC-9', armedWithState.error === 'shadow_state_while_armed' && goldAfter === 0,
      'an ARMED settle REFUSES a carrier before hr_apply is reached, and pays nothing',
      `the armed branch accepted or mispriced a carrier: ${JSON.stringify(armedWithState)} `
      + `gold=${goldAfter}`);

    // ── SC-10: AND AN ARMED PAYMENT CLEARS THE MARK AND THE CARRIER TOGETHER.
    //        ⚠ THIS ARM MUST PRESENT `hr_engine` OR IT ASSERTS NOTHING. hr_apply's
    //          impersonation seam tests `current_setting('role') = 'hr_engine'`
    //          LITERALLY (Security S-1), so a settle from the replay's default
    //          role is refused `forbidden_impersonation` and the payment never
    //          lands — which would leave this arm passing on a settle that did
    //          not happen. The edge issues exactly this `set local role` inside
    //          its apply transaction, so presenting it here is reproducing
    //          production, not working around a check.
    //          Measured before this was added: the armed branch answered
    //          {"ok":false,"error":"forbidden_impersonation"} and the clearing
    //          half of §9 had never once been executed by any guard.
    await db.exec('begin; set local role hr_engine;');
    const armedClean = await settle(t2, plus(mark0, 270), KEY(44), null);
    await db.exec('commit;');
    const own4 = await ownRow();
    const paidGold = Number((await db.query(
      'select gold from public.player_state where user_id = $1 and slot = 0', [U4])).rows[0].gold);
    judge('SC-10', armedClean.ok === true && armedClean.paid === true && paidGold > 0
          && own4.shadow_state == null && own4.shadow_accrued_to == null,
      `an armed payment landed (gold ${paidGold}) and cleared the shadow mark AND the `
      + 'carrier together — no stale continuation state survives arming',
      `the armed payment did not clear the chain: paid=${JSON.stringify(armedClean)} `
      + `gold=${paidGold} row=${JSON.stringify(own4)}`);
    // ══════════════════════════════════════════════════════════════════════════
    // SC-11 — "WE OVERLAID" AND "WE CARRY SOMETHING" ARE ONE DECISION
    //         (Security S-1, 2026-09-23)
    //
    // tick.js lays the shadow's proposals over a session when `chaining`, and
    // sends a carrier when `probe.shadow && atMark && shadowStateOf() !== null`.
    // Those are NOT the same condition. `shadowStateOf` returns null by design
    // when the bound breaks, and `atMark` is false when the settle loop ran past
    // the intent being fenced — so a window could be settled from an OVERLAID
    // session with a NULL tenth argument. The fence's `shadow_state_while_armed`
    // refusal keys on a non-null argument, so an operator arming between
    // `probeWatermark` and that settle would have the ARMED branch accept it and
    // hr_apply PAY a delta computed from the shadow's own proposals — the precise
    // failure design constraint 2 forbids, reached through the gap between the
    // two conditions rather than through the branch itself.
    //
    // The fix makes anything that overlaid send a RESTART MARKER: a carrier with
    // no state in it. SC-11 proves the marker does the two things that makes it
    // safe (refused when armed, inert when read back); SC-11b proves the driver
    // actually sends it.
    // ══════════════════════════════════════════════════════════════════════════
    const U5 = U(5);
    await makeChar(db, U5);
    await db.exec('update public.hr_tick_config set enabled = true, shadow = false where id;');
    const MARKER = { v: SHADOW_STATE_V, base_version: 1, restart: true };
    const m0 = (await db.query(
      'select accrued_to from public.player_state where user_id = $1 and slot = 0', [U5]))
      .rows[0].accrued_to;
    const armedMarker = (await db.query(`
      select public.hr_tick_settle('cron:postgres', $1::uuid, 0, 'gather', 1::bigint,
               $2::timestamptz, $3::timestamptz, $4::uuid,
               jsonb_build_object('gold', 100, 'accrued_to', to_jsonb($3::timestamptz),
                 'journal', jsonb_build_object('kind','gather','intent','accrue',
                   'meta', jsonb_build_object('src','tick','qty',7,'ticks',3))),
               $5::jsonb) as r`,
      [U5, new Date(m0).toISOString(), plus(m0, 90), KEY(51), JSON.stringify(MARKER)])).rows[0].r;
    const gold5 = Number((await db.query(
      'select gold from public.player_state where user_id = $1 and slot = 0', [U5])).rows[0].gold);
    /* ...and read back over a session it must not disturb. The marker names no
       field, so every number stays the session's own and `_chain` opens empty —
       which IS the restart `carried === null` already meant. */
    const sess = applyShadowState(
      { version: 1, hp: 7, gold: 40, inventory: { bread: 2 }, skills: { attack: 10 } }, MARKER);
    const inert = sess.hp === 7 && sess.gold === 40 && sess.inventory.bread === 2
      && sess.skills.attack === 10 && !!sess._chain && sess._chain.gold === 0
      && Object.keys(sess._chain.items).length === 0;
    judge('SC-11', armedMarker.error === 'shadow_state_while_armed' && gold5 === 0 && inert,
      'the restart marker an overlaid window must send is REFUSED on the armed branch, pays '
      + 'nothing, and applies nothing when read back',
      `the marker is not safe to send: settle=${JSON.stringify(armedMarker)} gold=${gold5} `
      + `inert=${inert}`);

    // ── SC-11b: and the DRIVER actually sends one on every overlaid window.
    judge('SC-11b', /const carry = carried\s*\|\|\s*\(chaining \?/.test(TICK_SRC),
      'tick.js sends a carrier on EVERY window it overlaid — `carried || (chaining ? marker : null)` '
      + '— so an arm flip between the probe and the settle always meets shadow_state_while_armed',
      'tick.js can overlay a session and still send a NULL tenth argument (bound breach, or the '
      + 'settle loop running past the fenced intent). An operator arming between probeWatermark and '
      + 'that settle would have hr_apply PAY a delta computed from the shadow overlay.');

  } finally {
    await db.close();
  }
  return { problems: problems.slice(), replayRefused: null };
}

/* ── THE MUTANTS ────────────────────────────────────────────────────────────
   Each breaks exactly one load-bearing line and names the arm that must go red.
   `sql` patches the staged migration before the replay applies it; `tick`
   patches the driver source an arm reads. */
const MUTANTS = {
  carrierNotStored: {
    want: 'SC-4',
    why: 'the shadow branch moves the mark but stores no state — the M3 defect, exactly',
    sql: [['         set shadow_accrued_to = p_window_to,\n             shadow_state      = p_shadow_state,\n',
           '         set shadow_accrued_to = p_window_to,\n']],
  },
  noProbeCarrier: {
    want: 'SC-6',
    why: 'the state is stored but never handed back, so the chain is write-only',
    sql: [['  v_chain := case\n    when v_cfg.shadow\n', '  v_chain := case\n    when false\n']],
  },
  noArmedRefusal: {
    want: 'SC-9',
    why: 'the armed branch stops refusing a carrier built in the other mode',
    sql: [["  if p_shadow_state is not null and not v_cfg.shadow then\n    return jsonb_build_object('ok', false, 'error', 'shadow_state_while_armed');\n  end if;\n",
           '  -- mutant noArmedRefusal: the armed refusal removed\n']],
  },
  noClearOnPay: {
    want: 'SC-10',
    why: 'an armed payment leaves a stale carrier behind for the next shadow run to believe',
    sql: [['       set shadow_accrued_to = null, shadow_state = null, updated_at = now()\n',
           '       set shadow_accrued_to = null, updated_at = now()\n']],
  },
  armedPaysOverlay: {
    want: 'SC-11b',
    why: 'the driver may overlay a session and still send a NULL tenth argument, so an arm flip '
       + 'between the probe and the settle has hr_apply pay a delta computed from the overlay',
    tick: [['const carry = carried\n    || (chaining ? { v: SHADOW_STATE_V, base_version: env.version, restart: true } : null);',
            'const carry = carried;']],
  },
};

const patchesFor = (m) => (m.sql ? new Map([[MIG, m.sql]]) : undefined);
const tickFor = (m) => {
  if (!m.tick) return undefined;
  let out = TICK_FILE;
  for (const [find, rep] of m.tick) {
    if (!out.includes(find)) {
      console.error(`world-tick-shadow-chain --mutate: the tick.js anchor is gone:\n${find}`);
      process.exit(2);
    }
    out = out.split(find).join(rep);
  }
  return out;
};

if (MUTATE) {
  const names = MUTATION ? [MUTATION] : Object.keys(MUTANTS);
  for (const n of names) {
    if (!MUTANTS[n]) {
      console.error(`unknown mutant "${n}". known: ${Object.keys(MUTANTS).join(', ')}`);
      process.exit(2);
    }
  }
  let allRed = true;
  for (const n of names) {
    const m = MUTANTS[n];
    console.log(`\n── mutant ${n} — ${m.why}`);
    const { problems: probs, replayRefused } = await runSuite({
      patches: patchesFor(m), tickSource: tickFor(m), allowReplayFailure: true });
    if (replayRefused) {
      /* Caught at APPLY time by the migration's own executed self-check — the
         arm below never got to run because the file refused to install. */
      console.log(`   ${n}: RED — the migration REFUSED TO APPLY: `
        + `${replayRefused.map((f) => f.error).join(' | ')}`);
      continue;
    }
    const red = probs.some((x) => x.startsWith(`${m.want}:`));
    if (red) {
      console.log(`   ${n}: RED at ${m.want}, as required.`);
    } else {
      allRed = false;
      console.error(`   ${n}: the mutation changed NOTHING — ${m.want} stayed green. `
        + `That arm is not proving what it claims.\n   problems seen: ${probs.join(' | ') || '(none)'}`);
    }
  }
  console.log('');
  if (allRed) {
    console.log(`world-tick-shadow-chain --mutate: all ${names.length} mutant(s) RED, as required.`);
    process.exitCode = 0;
  } else {
    console.log('world-tick-shadow-chain --mutate: at least one mutant left its arm green.');
    process.exitCode = 1;
  }
} else {
  const { problems: probs } = await runSuite();
  console.log('');
  if (probs.length) {
    console.log(`world-tick-shadow-chain: ${probs.length} failure(s) — SHADOW cannot be measured on production.`);
    process.exitCode = 1;
  } else {
    console.log('world-tick-shadow-chain: green — the driver hands the edge the watermark it chains on.');
  }
  console.log('\n   mutation proof: node tests/world-tick-shadow-chain.mjs --mutate');
}
