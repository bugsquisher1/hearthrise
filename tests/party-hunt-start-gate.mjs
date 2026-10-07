// ============================================================================
// tests/party-hunt-start-gate.mjs — A PARTY HUNT ONLY STARTS WHEN SOMETHING
//                                   WILL TICK IT
//
//   node tests/party-hunt-start-gate.mjs            the guard
//   node tests/party-hunt-start-gate.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-09-party-hunt-start-gate.sql, answering Security
// P3 on the party-reaper verdict (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md):
// a hunt started while combat is disarmed is never ticked, so every member's
// accrue is refused party_settle_required for up to 24 h. The file's §3 runs
// the scenario once at apply time; this guard re-measures it on every push on
// the PGlite chain replay, built with `upTo` so a newer file cannot blind it,
// and proves each arm can fail.
//
//   P-IDEM  the file re-applies byte-identically
//   G1  ★ disarmed: refused hunt_channel_disarmed, NOTHING written (hunt, key,
//           boundary, player_state)
//   G2  gather-only armed is still refused
//   G3  combat armed but the tick disabled is refused
//   G4  the refusal is journalled in hr_rejections (intent party_hunt_start)
//   G5  ★ combat armed + enabled: the SAME key starts (the refusal never
//           claimed it)
//   G6  an accepted start replays its stored result after a disarm
//   G7  grants exact: authenticated only; anon/service_role/hr_engine/hr_tick
//           refused
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-09-party-hunt-start-gate.sql';
const MIG_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SIG = 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)';

/** The `create or replace function public.hr_party_hunt_start(` statement, verbatim, through `end $fn$;`. */
function fnSource(sql) {
  const start = sql.indexOf('create or replace function public.hr_party_hunt_start(');
  const end = sql.indexOf('end $fn$;', start);
  if (start < 0 || end < 0) throw Object.assign(new Error('hr_party_hunt_start not found'), { harness: true });
  return sql.slice(start, end + 'end $fn$;'.length);
}

let RUN = 0;
const uid = (n) => `00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}0001${n.toString(16).padStart(4, '0')}`;
const key = (n) => `00000000-0000-4000-9000-${RUN.toString(16).padStart(4, '0')}0002${n.toString(16).padStart(4, '0')}`;

async function arms(db, { log = true } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); } else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (u) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [u]);
  const call = async (sql, p) => (await one(`select ${sql} as r`, p)).r;
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const ungate = () => db.exec('delete from public.hr_rate_counters;');
  const harness = (m) => Object.assign(new Error(m), { harness: true });
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!cact) throw harness('no combat activity in hr_activities');
  const name = (u) => `Gate ${u.slice(-12)}`;

  // ── fixture: a two-member party, formed through the real verbs, one watermark
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = '{}'");
  const [A, B] = [uid(1), uid(2)];
  for (const u of [A, B]) {
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await as(u);
    if ((await call('public.hr_create_character(0)'))?.ok !== true) throw harness(`no character for ${u}`);
    if ((await call('public.claim_display_name($1)', [name(u)]))?.ok !== true) throw harness(`no name for ${u}`);
  }
  await as(A);
  const pid = (await call('public.hr_party_create(0, gen_random_uuid())'))?.party_id;
  if (!pid) throw harness('could not form the probe party');
  if ((await call('public.hr_party_invite(0, $1, gen_random_uuid())', [name(B)]))?.ok !== true) throw harness('invite refused');
  const inv = (await one('select id from public.party_invite where party_id = $1 and user_id = $2', [pid, B]))?.id;
  await as(B);
  if ((await call('public.hr_party_accept(0, $1::uuid, gen_random_uuid())', [inv]))?.ok !== true) throw harness('accept refused');
  await as('');
  await q("update public.player_state set accrued_to = date_trunc('second', now()) - interval '30 seconds' where user_id = any($1::uuid[]) and slot = 0", [[A, B]]);
  await ungate();
  const snap = async () => JSON.stringify(await q('select to_jsonb(ps) as s from public.player_state ps where user_id = any($1::uuid[]) order by user_id', [[A, B]]));
  const s0 = await snap();
  const K = key(1);
  const start = async (u, k) => { await as(u); try { return await call(`${SIG.replace('(integer,text,text,jsonb,uuid)', '')}(0, $1, 'steady', '{}'::jsonb, $2::uuid)`, [cact, k]); } finally { await as(''); } };

  // ── G1 disarmed
  const r1 = await start(A, K);
  const wrote = Number((await one(`select (select count(*) from public.party_hunt where party_id = $1)
                                       + (select count(*) from public.player_intents where user_id = $2 and intent_id = $3)
                                       + (select count(*) from public.party_settle_boundary where party_id = $1) as n`, [pid, A, K])).n);
  ok('G1', r1?.ok === false && r1?.error === 'hunt_channel_disarmed' && Object.keys(r1).length === 2
    && wrote === 0 && (await snap()) === s0,
    'combat DISARMED: refused hunt_channel_disarmed (code only), no hunt, no key, no boundary, no player_state moved',
    JSON.stringify({ r1, wrote, state: (await snap()) === s0 }));

  // ── G2 gather only
  await cfg("armed_channels = array['gather']");
  const r2 = await start(A, K);
  ok('G2', r2?.error === 'hunt_channel_disarmed', 'only GATHER armed: still refused', JSON.stringify(r2));

  // ── G3 tick disabled
  await cfg("enabled = false, armed_channels = array['combat']");
  const r3 = await start(A, K);
  ok('G3', r3?.error === 'hunt_channel_disarmed', 'combat armed but the tick DISABLED: refused', JSON.stringify(r3));

  // ── G4 journalled
  const j = await one(`select coalesce(sum(n), 0)::int as n from public.hr_rejections
                        where user_id = $1 and slot = 0 and code = 'hunt_channel_disarmed' and intent = 'party_hunt_start'`, [A]);
  ok('G4', Number(j.n) === 3, 'every refusal journalled in hr_rejections (intent party_hunt_start, 3 occurrences)',
    `hr_rejections counts ${j.n}`);
  await ungate();

  // ── G5 armed + enabled: the same key starts
  await cfg("enabled = true, armed_channels = array['combat']");
  const r5 = await start(A, K);
  const live = Number((await one('select count(*)::int as n from public.party_hunt where party_id = $1 and ended_at is null', [pid])).n);
  ok('G5', r5?.ok === true && live === 1, 'combat ARMED: the SAME key starts the hunt (the refusals never claimed it)',
    JSON.stringify({ r5, live }));

  // ── G6 replay after a disarm
  await cfg("armed_channels = '{}'");
  const r6 = await start(A, K);
  ok('G6', r6?.ok === true && r6?.replayed === true && r6?.hunt_id === r5?.hunt_id,
    'an accepted start replays its stored result after a disarm', JSON.stringify(r6));

  // ── G7 grants
  {
    const grants = (await q(`select r.role, has_function_privilege(r.role, '${SIG}', 'execute') as x
                               from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
                              where r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role)`))
      .filter((g) => g.x).map((g) => g.role);
    ok('G7', JSON.stringify(grants) === JSON.stringify(['authenticated']),
      'EXECUTE held by authenticated alone', JSON.stringify(grants));
  }
  await cfg("armed_channels = '{}'");
  await ungate();
  return red;
}

const body = async (db) => (await db.query(
  `select md5(pg_get_functiondef('${SIG}'::regprocedure)) as h`)).rows[0].h;

async function boot() {
  const { db } = await bootReplay({ upTo: MIG });
  return db;
}

if (!MUTATE) {
  console.log('\nparty-hunt-start-gate: a party hunt starts only when the tick is enabled and combat is armed');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await body(db);
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await body(db)) === b0;
  console.log(idem
    ? `  ✓ P-IDEM — ${MIG} re-applied byte-identically (§0 accepted its own body, §3 passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or the body'}`);
  let red;
  try { red = await arms(db); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: a start is refused hunt_channel_disarmed unless something will tick it; journalled; key and replay intact');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: the verb re-created from THIS file's text with one line broken
//    (the file's own §3 md5 pin would refuse a patched FILE before any
//    behaviour ran, which proves the pin, not the arms).
const FN = fnSource(MIG_SQL);
const GATE_IF = "  if not coalesce(v_on, false) or not coalesce(v_armed, false) then\n";
const GATE_START = '  select coalesce(c.enabled, false), coalesce(\'combat\' = any (c.armed_channels), false)\n';
const GATE_END = "    return jsonb_build_object('ok', false, 'error', 'hunt_channel_disarmed'); end if;\n";
const gateBlock = FN.slice(FN.indexOf(GATE_START), FN.indexOf(GATE_END) + GATE_END.length);
const REPLAY = '  select result, intent into v_out, v_prev\n';
const CLAIM = '  insert into public.player_intents (user_id, intent_id, slot, intent)\n';
const MUTANTS = [
  { name: 'noGate', why: 'the gate is gone (a disarmed start wedges its members)', expect: /G1/,
    find: GATE_IF, repl: '  if false then\n' },
  { name: 'anyChannel', why: 'any armed channel opens the gate (gather-only starts a hunt)', expect: /G2/,
    find: "coalesce('combat' = any (c.armed_channels), false)", repl: "coalesce(cardinality(c.armed_channels) > 0, false)" },
  { name: 'ignoresEnabled', why: 'a disabled tick is not checked', expect: /G3/,
    find: 'coalesce(c.enabled, false), coalesce(', repl: 'true, coalesce(' },
  { name: 'notJournalled', why: 'the refusal is not journalled', expect: /G4/,
    find: "    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_channel_disarmed',\n",
    repl: "    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_channel_disarmed_x',\n" },
  { name: 'gateAfterClaim', why: 'the gate runs after the key is claimed (an honest retry is refused intent_in_flight)', expect: /G5/,
    find: gateBlock, repl: '', and: [CLAIM, gateBlock.replace("return jsonb_build_object('ok', false, 'error', 'hunt_channel_disarmed'); end if;",
      "insert into public.player_intents (user_id, intent_id, slot, intent) values (v_uid, p_idem, v_slot, 'party_hunt_start') on conflict do nothing;\n    return jsonb_build_object('ok', false, 'error', 'hunt_channel_disarmed'); end if;") + CLAIM] },
  { name: 'gateBeforeReplay', why: 'the gate precedes the replay (a disarm rewrites an accepted start)', expect: /G6/,
    find: gateBlock, repl: '', and: [REPLAY, gateBlock + REPLAY] },
  { name: 'grantAnon', why: 'anon is granted EXECUTE', expect: /G7/, find: null,
    repl: `\ngrant execute on function ${SIG} to anon;` },
];

console.log('\nparty-hunt-start-gate --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const control = await arms(db, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
if (!gateBlock || gateBlock.length < 100) { console.error('harness: gate block not found'); process.exit(2); }
const RESTORE = `${FN}\nrevoke execute on function ${SIG} from public, anon, authenticated, service_role;\ngrant execute on function ${SIG} to authenticated;`;
let survived = 0;
for (const m of MUTANTS) {
  let src;
  if (m.find === null) src = FN + m.repl;
  else {
    if (FN.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${FN.split(m.find).length - 1}x`); process.exit(2); }
    src = FN.replace(m.find, () => m.repl);
    if (m.and) {
      if (src.split(m.and[0]).length !== 2) { console.error(`harness: ${m.name}: second anchor matched ${src.split(m.and[0]).length - 1}x`); process.exit(2); }
      src = src.replace(m.and[0], () => m.and[1]);
    }
  }
  try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
  let red;
  try { red = await arms(db, { log: false }); } catch (e) { red = [`threw: ${e.message}`]; }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  await db.exec(RESTORE);
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false });
if (after.length) { console.error(`harness: the restored body is red (${after.join(', ')})`); process.exit(2); }
await db.close();
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
