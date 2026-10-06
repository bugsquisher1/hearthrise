// ============================================================================
// tests/world-tick-channel-arm.mjs — EACH CHANNEL ARMS ALONE; ONE STATEMENT
//                                      DE-ARMS ALL; SHADOW ADMISSION ENDS LOUDLY
//
//   node tests/world-tick-channel-arm.mjs              the guard
//   node tests/world-tick-channel-arm.mjs --selftest   every mutant must go RED
//
// docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md rulings 5 and 1 (admission),
// implemented by supabase/migrations/2026-10-06-world-tick-channel-arm.sql.
// The migration's own §9 self-check runs as the APPLYING role, which
// hr_apply refuses by design (S-1's literal hr_engine seam), so it can prove
// which BRANCH a window takes but not what the paying branch WRITES. This
// guard presents `hr_engine` exactly as the edge does and measures the rows.
//
//   P-IDEM  the file re-applies byte-identically: its self-check passes a
//           second time, and the schema inventory and the eight bodies it
//           defines do not move
//   A1      armed {gather}: two gather windows write EXACTLY TWO player_ledger
//           rows (one per settled window) and no shadow row; a combat window
//           writes ZERO player_ledger rows and one hr_tick_shadow row
//   A2      the mirror, armed {combat}: a gather window writes ZERO ledger rows
//           and journals in shadow; the combat window takes the armed branch
//   A3      THE ONE-STATEMENT KILL: armed {combat,gather}, then
//           `set armed_channels = '{}'` — the next gather window writes ZERO
//           ledger rows and journals in shadow
//   A4      armed fence unchanged: armed gather, raw accrued_to 25 h old,
//           shadow mark now() → ZERO roster rows (S-14's arm)
//   A5      shadow admission: raw 25 h old + current chain → rostered;
//           7 d + 1 min → not rostered, AND hr_tick_cron_run's `empty` note
//           carries detail.admission.shadow_expired = 1 (loud, not silent)
//   A6      the CHECK: a channel outside `channels`, a NULL element, a NULL
//           array and a 2-D array are each refused
//   A7      a party hunt is COMBAT: gather armed → the party fence answers
//           shadow (naming combat) and hr_party_mark chains on the shadow mark;
//           combat armed → armed, and the mark is the paid one
//   A8      C1 (2026-10-06-world-tick-arm-guards.sql): armed gather, raw
//           accrued_to 25 h old on a CURRENT shadow chain (the roster admitted
//           it in shadow, then the operator armed) → the armed settle is
//           refused fenced_24h and writes ZERO ledger rows; 11 h old pays
//           (inside the 12 h offline cap: since 2026-10-07-world-tick-armed-cap.sql
//           an armed mark past the cap is refused fenced_cap, its own guard
//           tests/world-tick-armed-cap.mjs)
//   A9      C2: gather armed, a combat sentinel, two hours of rostered fires,
//           gather-only shadow rows → hr_tick_stall_status judges the combat
//           shadow and reads STALLED; the same history with nothing armed is ok
//
// P-IDEM re-applies BOTH files in chain order: the guards file restates
// hr_tick_settle and hr_tick_stall_status over the channel-arm file.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, chainFiles, inventory, ROOT } from './schema-replay.mjs';

const SELFTEST = process.argv.includes('--selftest');
const MIG = '2026-10-06-world-tick-channel-arm.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const GUARDS = '2026-10-06-world-tick-arm-guards.sql';
const GUARDS_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', GUARDS), 'utf8')).replace(/\r\n/g, '\n');
const FNS = ['hr_tick_admit', 'hr_tick_roster', 'hr_tick_settle', 'hr_party_mark', 'hr_party_roster',
  'hr_party_tick_settle', 'hr_tick_cron_run', 'hr_tick_stall_status'];

const UG = '00000000-0000-4000-8000-0000000c1006';   // gather
const UC = '00000000-0000-4000-8000-0000000c2006';   // combat
const UA = '00000000-0000-4000-8000-0000000c3006';   // admission
const UP = '00000000-0000-4000-8000-0000000c4006';   // party
const KEY = (n) => `0000c006-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOLDER = 'cron:postgres';

/** Run every arm against one booted database; return the ids that went red. */
async function arms(db, { log = true } = {}) {
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  const n = async (sql, p) => Number(Object.values(await one(sql, p))[0]);
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('no gather/combat activity in hr_activities'), { harness: true });

  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}'");
  await db.exec(`insert into auth.users (id) values ('${UG}'), ('${UC}'), ('${UA}'), ('${UP}') on conflict do nothing;`);
  const makeChar = async (u, kind, act, accruedSql) => {
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
    await db.exec(`
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                       active_kind, active_id, active_since)
      values ('${u}', 0, 0, 0, 10, 10, 1, ${accruedSql}, '${kind}', '${act}', now() - interval '30 days')
      on conflict (user_id, slot) do update
        set version = 1, gold = 0, accrued_to = ${accruedSql}, active_kind = '${kind}', active_id = '${act}';`);
    await db.exec(`
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
      values ('${u}', 0, '${kind}', true, '${HOLDER}', now() + interval '10 minutes');`);
  };
  const mark0 = async (u) => new Date((await one(
    'select accrued_to from public.player_state where user_id = $1 and slot = 0', [u])).accrued_to);
  const iso = (d, s) => new Date(d.getTime() + s * 1000).toISOString();
  const version = async (u) => Number((await one(
    'select version from public.player_state where user_id = $1 and slot = 0', [u])).version);
  /* A settle as the EDGE issues it: `set local role hr_engine` inside its own
     transaction. Without the role, hr_apply refuses `forbidden_impersonation`
     and an "armed window wrote one ledger row" arm would measure nothing. */
  const settle = async (u, ch, from, to, key) => {
    const meta = ch === 'gather' ? "'src','tick','qty',2,'ticks',1" : "'src','tick','ticks',1,'kills',0";
    const ver = await version(u);
    await db.exec('begin; set local role hr_engine;');
    try {
      return (await one(`
        select public.hr_tick_settle($1, $2::uuid, 0, $3, $4::bigint, $5::timestamptz, $6::timestamptz,
                 $7::uuid,
                 jsonb_build_object('gold', 3, 'accrued_to', to_jsonb($6::timestamptz),
                   'journal', jsonb_build_object('kind', $3::text, 'intent', 'accrue',
                     'meta', jsonb_build_object(${meta})))) as r`,
      [HOLDER, u, ch, ver, from, to, key])).r;
    } finally { await db.exec('commit;'); }
  };
  const ledger = (u) => n('select count(*) from public.player_ledger where user_id = $1', [u]);
  const shadowRows = (u) => n('select count(*) from public.hr_tick_shadow where user_id = $1', [u]);
  /* THE WINDOW'S OWN ROWS: kind = channel, intent = 'accrue'. hr_apply also
     writes one-off side rows that are not per window (measured: the first
     paid settle of a character writes a `renown_ratchet` row), so "one per
     settled window" is counted on the window's own kind. */
  const windowRows = (u, ch) => n(`select count(*) from public.player_ledger
                                    where user_id = $1 and kind = $2 and intent = 'accrue'`, [u, ch]);

  // ── A1 armed {gather}
  await makeChar(UG, 'gather', gact, "now() - interval '30 minutes'");
  await makeChar(UC, 'combat', cact, "now() - interval '30 minutes'");
  await cfg("armed_channels = array['gather']");
  {
    const m = await mark0(UG);
    const l0 = await windowRows(UG, 'gather');
    const g1 = await settle(UG, 'gather', m.toISOString(), iso(m, 90), KEY(1));
    const g2 = await settle(UG, 'gather', iso(m, 90), iso(m, 180), KEY(2));
    const gl = (await windowRows(UG, 'gather')) - l0;
    const mc = await mark0(UC);
    const c1 = await settle(UC, 'combat', mc.toISOString(), iso(mc, 90), KEY(3));
    const cl = await ledger(UC);
    const cs = await shadowRows(UC);
    ok('A1', g1.mode === 'armed' && g1.paid === true && g2.paid === true && gl === 2
        && (await shadowRows(UG)) === 0 && c1.mode === 'shadow' && c1.channel === 'combat'
        && cl === 0 && cs === 1,
      'gather armed alone: two gather windows wrote exactly 2 gather/accrue ledger rows and no shadow row; '
      + 'the combat window wrote 0 ledger rows and 1 shadow row',
      `gather ${JSON.stringify(g1)} / ${JSON.stringify(g2)} ledger +${gl}; combat ${JSON.stringify(c1)} `
      + `ledger ${cl} shadow ${cs}`);
  }

  // ── A2 the mirror, armed {combat}
  await makeChar(UG, 'gather', gact, "now() - interval '30 minutes'");
  await makeChar(UC, 'combat', cact, "now() - interval '30 minutes'");
  await cfg("armed_channels = array['combat']");
  {
    const l0 = await ledger(UG);
    const s0 = await shadowRows(UG);
    const m = await mark0(UG);
    const g = await settle(UG, 'gather', m.toISOString(), iso(m, 90), KEY(11));
    const mc = await mark0(UC);
    const c = await settle(UC, 'combat', mc.toISOString(), iso(mc, 90), KEY(12));
    ok('A2', g.mode === 'shadow' && g.channel === 'gather' && (await ledger(UG)) === l0
        && (await shadowRows(UG)) === s0 + 1 && c.mode === 'armed' && c.channel === 'combat',
      'combat armed alone: the gather window journalled in shadow and wrote 0 ledger rows; the combat '
      + `window took the armed branch (paid=${c.paid})`,
      `gather ${JSON.stringify(g)}; combat ${JSON.stringify(c)}`);
  }

  // ── A3 the kill
  await makeChar(UG, 'gather', gact, "now() - interval '30 minutes'");
  await cfg("armed_channels = array['combat','gather']");
  await cfg("armed_channels = '{}'");
  {
    const l0 = await ledger(UG);
    const m = await mark0(UG);
    const g = await settle(UG, 'gather', m.toISOString(), iso(m, 90), KEY(21));
    const armed = (await one('select armed_channels from public.hr_tick_config where id')).armed_channels;
    ok('A3', g.mode === 'shadow' && (await ledger(UG)) === l0 && armed.length === 0,
      'one statement (`set armed_channels = \'{}\'`) de-armed both channels: the next gather window '
      + 'journalled in shadow and wrote 0 ledger rows',
      `after the kill: ${JSON.stringify(g)}, armed ${JSON.stringify(armed)}`);
  }

  const rostered = async (u, kind) => {
    await db.exec(`update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = '${u}';`);
    return n(`select count(*) from public.hr_tick_roster(array['${kind}'], 0, 500, 'arm-guard', 30000)
               where user_id = $1`, [u]);
  };

  // ── A4 the armed fence, unchanged
  await makeChar(UA, 'gather', gact, "now() - interval '25 hours'");
  await db.exec(`update public.hr_tick_ownership set shadow_accrued_to = now() where user_id = '${UA}';`);
  await cfg("armed_channels = array['gather']");
  {
    const r = await rostered(UA, 'gather');
    ok('A4', r === 0,
      'ARMED gather, raw accrued_to 25 h old, shadow mark now(): zero roster rows — the raw 24 h fence holds',
      `an armed channel admitted a 25 h-absent character on its shadow mark (${r} rows) — S-14 broken`);
  }

  // ── A5 shadow admission, and its loud end
  await cfg("armed_channels = '{}', edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue'");
  {
    await db.exec(`update public.hr_tick_ownership set shadow_accrued_to = now() - interval '1 minute' where user_id = '${UA}';`);
    const r25 = await rostered(UA, 'gather');
    await db.exec(`update public.player_state set accrued_to = now() - interval '7 days' - interval '1 minute'
                    where user_id = '${UA}';`);
    const r7 = await rostered(UA, 'gather');
    // Only UA is owned now, so the driver's roster is EMPTY and the fire logs `empty`.
    await db.exec(`delete from public.hr_tick_ownership where user_id in ('${UG}', '${UC}');`);
    await db.exec(`update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = '${UA}';`);
    await db.exec("update public.hr_tick_config set channels = array['gather'], cursor_at = null, cursor_user = null, cursor_slot = null where id;");
    const out = (await one('select public.hr_tick_cron_run() as r')).r;
    const note = (await one(`select outcome, detail from public.hr_tick_cron_log
                              where at > now() - interval '1 minute' order by id desc limit 1`)) || {};
    ok('A5', r25 === 1 && r7 === 0 && out.outcome === 'empty' && note.outcome === 'empty'
        && Number(note.detail?.admission?.shadow_expired) === 1,
      'shadow gather admits a 25 h-absent character on its current chain, ends at 7 days, and the fire '
      + `that dropped it logged detail.admission = ${JSON.stringify(note.detail?.admission)}`,
      `25 h: ${r25} row(s); 7 d + 1 min: ${r7} row(s); fire ${JSON.stringify(out)}; note ${JSON.stringify(note)}`);
    await db.exec("update public.hr_tick_config set channels = array['combat','gather','artisan'] where id;");
  }

  // ── A6 the CHECK
  {
    const refused = async (set, code) => {
      try { await db.exec('savepoint a6;'); await cfg(set); await db.exec('release savepoint a6;'); return false; }
      catch (e) { await db.exec('rollback to savepoint a6;'); return e.code === code; }
    };
    await db.exec('begin;');
    await cfg("channels = array['gather'], armed_channels = '{}'");
    const r1 = await refused("armed_channels = array['combat']", '23514');
    const r2 = await refused("armed_channels = array['gather', null]", '23514');
    const r3 = await refused('armed_channels = null', '23502');
    const r4 = await refused("armed_channels = array[array['gather']]", '23514');
    await db.exec('rollback;');
    ok('A6', r1 && r2 && r3 && r4,
      'the CHECK refuses an unowned channel, a NULL element, a NULL array and a 2-D array',
      `refused: unowned ${r1}, null element ${r2}, null array ${r3}, 2-D ${r4}`);
  }
  // ── A7 a party hunt is COMBAT: its mode follows combat, not "the tick"
  {
    await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}'");
    await makeChar(UP, 'combat', cact, "now() - interval '30 minutes'");
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${UP}';`);
    const from = (await one("select date_trunc('second', now()) - interval '30 minutes' as t")).t;
    const party = (await one(
      'insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [UP])).id;
    await db.query("insert into public.party_member (party_id, user_id, slot, role) values ($1, $2, 0, 'leader')",
      [party, UP]);
    await db.query("insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, $3)",
      [party, cact, from]);
    await db.query(`insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until, shadow_accrued_to)
                    values ($1, true, $2, now() + interval '5 minutes', $3::timestamptz + interval '60 seconds')
                    on conflict (party_id) do update set owned = true, lease_holder = excluded.lease_holder,
                      lease_until = excluded.lease_until, shadow_accrued_to = excluded.shadow_accrued_to`,
    [party, HOLDER, from]);
    const probe = async () => (await one(`
      select public.hr_party_tick_settle($1, $2::uuid, '1970-01-01T00:00:00Z'::timestamptz, now(),
               '00000000-0000-0000-0000-000000000000'::uuid,
               jsonb_build_array(jsonb_build_object('user', $3::text, 'slot', 0,
                 'delta', jsonb_build_object('accrued_to', to_jsonb(now()))))) as r`,
    [HOLDER, party, UP])).r;
    const markOf = async () => new Date((await one('select public.hr_party_mark($1::uuid) as m', [party])).m).getTime();
    const fromMs = new Date(from).getTime();
    await cfg("armed_channels = array['gather']");
    const pg = await probe();
    const mg = await markOf();
    await cfg("armed_channels = array['combat']");
    const pc = await probe();
    const mc = await markOf();
    await cfg("armed_channels = '{}'");
    ok('A7', pg.error === 'party_window_already_settled' && pg.shadow === true && pg.channel === 'combat'
        && mg === fromMs + 60000 && pc.shadow === false && pc.channel === 'combat' && mc === fromMs,
      'gather armed: the party fence answers SHADOW for combat and hr_party_mark chains on the shadow '
      + 'mark; combat armed: ARMED, and the mark is the paid one',
      `gather-armed ${JSON.stringify(pg)} mark ${mg - fromMs} ms; combat-armed ${JSON.stringify(pc)} mark ${mc - fromMs} ms`);
  }

  // ── A8 C1: an armed window pays only a character the raw fence admits
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}'");
  {
    await makeChar(UG, 'gather', gact, "date_trunc('second', now()) - interval '25 hours'");
    await db.exec(`update public.hr_tick_ownership set shadow_accrued_to = now() - interval '1 minute' where user_id = '${UG}';`);
    const r25 = await rostered(UG, 'gather');           // admitted in SHADOW on its chain...
    await db.exec(`update public.hr_tick_ownership set lease_holder = '${HOLDER}', lease_until = now() + interval '10 minutes' where user_id = '${UG}';`);
    await cfg("armed_channels = array['gather']");      // ...then the operator arms
    const m = await mark0(UG);
    const l0 = await ledger(UG);
    const v0 = await version(UG);
    const f = await settle(UG, 'gather', m.toISOString(), iso(m, 90), KEY(81));
    const fl = (await ledger(UG)) - l0;
    const fv = await version(UG);
    await makeChar(UG, 'gather', gact, "date_trunc('second', now()) - interval '11 hours'");
    const m2 = await mark0(UG);
    const w0 = await windowRows(UG, 'gather');
    const p = await settle(UG, 'gather', m2.toISOString(), iso(m2, 90), KEY(82));
    const pw = (await windowRows(UG, 'gather')) - w0;
    ok('A8', r25 === 1 && f.error === 'fenced_24h' && f.channel === 'gather' && fl === 0 && fv === v0
        && p.mode === 'armed' && p.paid === true && pw === 1,
      'shadow-admitted at raw 25 h, then armed: the settle is refused fenced_24h and writes 0 ledger rows; '
      + 'raw 11 h pays exactly one window',
      `rostered ${r25}; 25 h ${JSON.stringify(f)} ledger +${fl} version ${v0}->${fv}; 11 h ${JSON.stringify(p)} rows +${pw}`);
    await cfg("armed_channels = '{}'");
  }

  // ── A9 C2: the combat shadow is still watched while gather pays
  {
    const AT = '2005-01-01 12:00:00+00';
    await makeChar(UC, 'combat', cact, "now() - interval '5 minutes'");
    // The sentinel's activity must predate the judged window (planted at AT).
    await db.exec(`update public.player_state set active_since = '2000-01-01 00:00:00+00' where user_id = '${UC}';`);
    await db.exec(`delete from public.hr_tick_ownership where user_id <> '${UC}';`);
    await db.query(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
                    select $1::timestamptz - make_interval(secs => g * 10), 'posted', 5, 2, 10
                      from generate_series(1, 719) g`, [AT]);
    await db.query(`insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                                       version, intent_id, delta)
                    select $1::timestamptz - make_interval(secs => g * 90), $2::uuid, 0, 'gather', 'arm-guard',
                           $1::timestamptz - make_interval(secs => g * 90 + 90), $1::timestamptz - make_interval(secs => g * 90),
                           1, gen_random_uuid(), '{}'::jsonb
                      from generate_series(1, 79) g`, [AT, UG]);
    const st = async () => (await one('select public.hr_tick_stall_status($1::timestamptz, 2, 30) as s', [AT])).s;
    await cfg("armed_channels = array['gather']");
    const armed = await st();
    await cfg("armed_channels = '{}'");
    const none = await st();
    ok('A9', armed.judged === true && armed.stalled === true && armed.mode === 'partial'
        && armed.watched_channels.includes('combat') && !armed.watched_channels.includes('gather')
        && none.judged === true && none.stalled === false,
      'gather armed: 2 h of gather-only shadow rows with a combat sentinel reads STALLED (combat watched); '
      + 'nothing armed: the same history reads ok',
      `armed ${JSON.stringify({ ...armed, buckets: undefined })}; none ${JSON.stringify({ ...none, buckets: undefined })}`);
  }

  await cfg("armed_channels = '{}'");
  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any($1::text[]) order by 1`, [FNS])).rows
  .map((r) => r.h).join(',');

/** Chain files AFTER the guards file that patch one of FNS through pg_get_functiondef. */
async function laterPatchers() {
  const files = await chainFiles();
  const names = files.map(([name]) => name);
  const at = names.indexOf(GUARDS);
  if (at < 0) throw Object.assign(new Error(`${GUARDS} is not in the chain`), { harness: true });
  const out = [];
  for (const [, path] of files.slice(at + 1)) {
    const sql = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    // …and every later file that RESTATES one of them whole (`create or
    // replace`): since 2026-10-07-world-tick-armed-cap.sql the chain-end
    // hr_tick_settle and hr_tick_stall_status are that file's.
    if (FNS.some((fn) => sql.includes(`pg_get_functiondef(\n    'public.${fn}(`)
                       || sql.includes(`pg_get_functiondef('public.${fn}(`)
                       || sql.includes(`create or replace function public.${fn}(`))) out.push(sql);
  }
  return out;
}

async function boot(patches, file = MIG) {
  const r = await bootReplay(patches ? { patches: new Map([[file, patches]]), tolerant: true } : {});
  return r;
}

// ── THE GUARD ───────────────────────────────────────────────────────────────
if (!SELFTEST) {
  console.log('\nworld-tick-channel-arm: per-channel arming, the one-statement kill, shadow-chain admission');
  let db;
  try { ({ db } = await boot()); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  // P-IDEM
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try {
    await db.exec(MIG_SQL); await db.exec(GUARDS_SQL);
    // …then every LATER chain file that patches one of these bodies in place
    // (pg_get_functiondef + replace), in chain order. Re-applying an older
    // `create or replace` drops a later file's anchored line, and that is the
    // apply order doing its job, not a second apply that moved anything.
    // 2026-10-07-frame-emit-online-only.sql splices the tick marker into
    // hr_tick_settle and hr_party_tick_settle this way.
    for (const later of await laterPatchers()) await db.exec(later);
  } catch (e) { err = String(e.message).split('\n')[0]; }
  const inv1 = JSON.stringify(await inventory(db));
  const b1 = await bodies(db);
  const idem = !err && inv0 === inv1 && b0 === b1 && b0.split(',').length === FNS.length;
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} + ${GUARDS} re-apply byte-identically (self-check passed twice; inventory and ${FNS.length} bodies unchanged)`
    : `  ✗ P-IDEM — second apply: ${err || (inv0 !== inv1 ? 'the schema inventory moved' : `bodies moved (${b0.split(',').length} found)`)}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: every channel arms alone, one statement de-arms all, admission ends loudly');
  process.exit(red.length ? 1 : 0);
}

// ── --selftest: each mutant must go RED (its self-check refuses the file, or an arm) ──
const MUTANTS = [
  { name: 'combatTreatedAsArmed', why: 'the fence reads every channel as armed',
    expect: /c4c|c4h|c6b/,
    patch: [["  select c.enabled, not coalesce(p_channel = any (c.armed_channels), false)",
             "  select c.enabled, not coalesce(true, false)"]] },
  /* The roster ALSO hands an armed channel its PAID mark, so c7e holds even
     under this mutant (defence in depth, measured); c7f is the arm that
     executes the predicate's armed branch directly. */
  { name: 'shadowBranchOnArmed', why: 'shadow-chain admission applies to an ARMED channel',
    expect: /c7e|c7f/,
    patch: [['    when p_armed is not false then\n', '    when p_armed is true and false then\n']] },
  { name: 'noSevenDayEnd', why: 'shadow admission never ends',
    expect: /c7b/,
    patch: [["    when p_accrued_to is null or p_accrued_to <= now() - interval '7 days' then 'shadow_expired'\n", '']] },
  { name: 'flatArrayArms', why: 'the 1-D clause is dropped from the CHECK (<@ flattens)',
    expect: /c2d/,
    patch: [['        coalesce(array_ndims(armed_channels), 1) = 1\n    and armed_channels <@ channels,',
             '        armed_channels <@ channels,']] },
  { name: 'silentDrop', why: 'the cron fire drops the admission counter',
    expect: null,
    patch: [['  select case when count(*) = 0 then null\n              else jsonb_object_agg(x.why, x.n) end',
             '  select case when true then null\n              else jsonb_object_agg(x.why, x.n) end']] },
  { name: 'partySettleFollowsGather', why: 'the party fence reads gather\'s mode instead of combat\'s',
    expect: null,
    patch: [['  select c.enabled, not coalesce(c_channel = any (c.armed_channels), false)',
             "  select c.enabled, not coalesce('gather' = any (c.armed_channels), false)"]] },
  { name: 'partyMarkFollowsGather', why: 'hr_party_mark reads gather\'s mode instead of combat\'s',
    expect: null,
    patch: [["  select case when not coalesce('combat' = any (cfg.armed_channels), false)",
             "  select case when not coalesce('gather' = any (cfg.armed_channels), false)"]] },
  /* C1 / C2 — patched into the GUARDS file, which owns the chain-end bodies. */
  { name: 'armedIgnoresRawFence', file: GUARDS, why: 'the armed settle pays a shadow-admitted character past 24 h',
    expect: /g1:|g1c/,
    patch: [["  if public.hr_tick_admit(false, v_st.accrued_to, null) <> 'admit' then",
             '  if false then']] },
  { name: 'armedFenceUsesChain', file: GUARDS, why: 'the C1 fence reads the shadow chain instead of the raw mark',
    expect: /g1:|g1c/,
    patch: [["  if public.hr_tick_admit(false, v_st.accrued_to, null) <> 'admit' then",
             "  if public.hr_tick_admit(false, v_st.accrued_to, v_own.shadow_accrued_to) <> 'admit' then"]] },
  { name: 'stallBlindWhenArmed', file: GUARDS, why: 'the stall rule stops judging once any channel arms',
    expect: /g2:/,
    patch: [['  v_judged := coalesce(v_cfg.enabled, false) and cardinality(v_unarmed) > 0 and v_sentinel;',
             '  v_judged := coalesce(v_cfg.enabled, false) and cardinality(v_armed) = 0 and v_sentinel;']] },
  { name: 'armedRowsCounted', file: GUARDS, why: "an armed channel's rows hide an unarmed channel's stall",
    expect: /g2:/,
    patch: [['                               where s.at >= b.lo and s.at < b.hi\n                                 and not (s.channel = any (v_armed))),',
             '                               where s.at >= b.lo and s.at < b.hi),']] },
  { name: 'noSentinel', file: GUARDS, why: 'an empty unarmed channel is judged a stall',
    expect: /g2b/,
    patch: [['  v_sentinel := cardinality(v_armed) = 0 or exists (', '  v_sentinel := true or exists (']] },
  { name: 'rosterIgnoresChannelMode', why: 'the roster reads one mode for every channel',
    expect: /c7e/,
    patch: [['        select coalesce(o.channel = any (v_armed), false) as armed) a\n      cross join lateral (\n        select case when not a.armed',
             "        select coalesce('combat' = any (v_armed), false) as armed) a\n      cross join lateral (\n        select case when not a.armed"]] },
];

console.log('\nworld-tick-channel-arm --selftest: every mutant must go RED');
let survived = 0;
for (const m of MUTANTS) {
  let verdict;
  let r;
  try { r = await boot(m.patch, m.file || MIG); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  if (r.failures.length) {
    /* A mutant of the channel-arm file refuses THAT file; the guards file
       downstream then refuses on its own §0 precondition, by name, and so does
       2026-10-07-frame-emit-online-only.sql, which patches the bodies the
       guards file installs. Those named cascades are expected; any other
       failure is the wrong reason. */
    const own = r.failures.filter((f) => f.file === (m.file || MIG));
    const cascade = r.failures.filter((f) => f.file !== (m.file || MIG));
    const msg = own.map((f) => f.error).join(' | ');
    const mine = own.length > 0
      && cascade.every((f) => ((m.file || MIG) === MIG && f.file === GUARDS
             && /PRECONDITION: 2026-10-06-world-tick-channel-arm\.sql is not applied/.test(f.error))
          || (f.file === '2026-10-07-frame-emit-online-only.sql'
             && /PRECONDITION: 2026-10-06-world-tick-arm-guards\.sql is not applied/.test(f.error))
          /* 2026-10-07-world-tick-armed-cap.sql restates the two chain-end
             bodies only over the exact ones measured live (its §0 md5 lock),
             so it refuses by name whenever an upstream mutant left another. */
          || (f.file === '2026-10-07-world-tick-armed-cap.sql'
             && /PRECONDITION: hr_tick_(settle|stall_status) prosrc md5 is/.test(f.error)))
      && (!m.expect || m.expect.test(msg));
    verdict = mine ? `RED via the file's own self-check (${msg.slice(0, 90)})` : null;
    if (!mine) { console.log(`  ✗ ${m.name} — refused for the WRONG reason: ${msg.slice(0, 200)}`); survived++; continue; }
  } else {
    const red = await arms(r.db, { log: false });
    verdict = red.length ? `RED via ${red.join(', ')}` : null;
  }
  if (verdict) console.log(`  ✓ ${m.name} — ${m.why}: ${verdict}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: SURVIVED`); }
  if (r.db) await r.db.close();
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red`);
process.exit(survived ? 1 : 0);
