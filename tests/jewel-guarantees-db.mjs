#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/jewel-guarantees-db.mjs — CRAFTED JEWELRY'S GUARANTEE LAYER, PLAYED ON THE REPLAYED CHAIN WITH THE SHIPPED ENGINE
//   (Tyler 2026-11-14: crafted high-end jewelry "RNG", "with some items that can guarantee some things"; board 2026-11-15 (d);
//   src/data/jewelry.js JEWEL_GUARANTEES, supabase/migrations/2027-05-16-jewel-guarantees*.sql, hr-accrue set-activity.js).
//   Rescued from lane/c-crafted-jewelry onto each piece's own bench: the Banded Signet's guarantee jobs are Smithing's.
//
//   G-DARK     the chain as applied holds jewel_guarantees off, for no account
//   G-OFF      with the switch off: the hero's envelope `features` leaves it out, and set_activity on a dark job answers
//              activity_unsupported naming the switch, before anything moves (pointer, bag, purse, ledger)
//   G-ON       the switch on for this account: its envelope's `features` lists it; another account's doesn't
//   G-VIEWED   the real door: set_activity starts "a Crown Shard and the Rat King's Crown in a Banded Signet" on Smithing, the owner's stop
//              settles it: each job spent one of each input and made one Hallmarked Banded Signet with Follow-through, no gold moved
//   G-CLOSED   the same job with the browser closed (the world tick): the same spend, the same guarantee on every piece made
//   G-FORGED   no client door makes a roll or a perk: hr_apply is the engine's alone, a Hallmark to a pair the catalogue doesn't hold is
//              refused, and a recipe id that isn't a catalogue job is unknown_activity
//   G-IDEM     a second apply of the three files (their self-checks included) moves nothing, and a re-apply keeps the switch where it was.
//              Judged on the chain as it stood when they landed (upTo: the switch file), not at head: the two generated files are
//              catalogue snapshots that every later generation restates whole (2027-05-22-cookbook-cut-* cut three cookbook jobs), so a
//              05-16 re-apply at head puts 05-16's catalogue back. That is apply order's business, not this file's second apply.
//              The other arms run at head.
//
//   node tests/jewel-guarantees-db.mjs            the guard
//   node tests/jewel-guarantees-db.mjs --mutate   planted defects (edge copy, or the migration)
//
//   --mutate speaks tests/mutant-control.mjs's protocol (`[mutants] N`, `[mutant] <id> caught|survived`) and is on its register.
//   Under HR_MUTANT_CONTROL=1 it plants NOTHING: an edge mutant's copy is made with its anchor checked and left as it was (before
//   lane/c-guard-batch-142, plant() wrote the defect regardless, so all four edge mutants read caught with nothing planted), and the
//   SQL mutants' patches and G-IDEM's re-plant are dropped. Every arm must then read survived.
//
// mutant-anchors: supabase/functions/hr-accrue/set-activity.js src/core/artisan.js supabase/functions/hr-accrue/catalogue.js supabase/migrations/2027-05-16-jewel-guarantees.sql
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { plant } from './hunt-core/fixtures/h1.js';
import { ARTISAN_RECIPES_EVERY } from '../src/data/recipes.js';
import { JEWEL_SWITCH, JEWELRY_ITEMS } from '../src/data/jewelry.js';
import { recipeInputs } from '../src/core/artisan.js';

const MUTATE = process.argv.includes('--mutate');
const CONTROL = !!process.env.HR_MUTANT_CONTROL;
const FN = 'supabase/functions/hr-accrue';
const MIG = '2027-05-16-jewel-guarantees.sql';
const FILES = ['2027-05-16-jewel-guarantees-items-catalogue.generated.sql', '2027-05-16-jewel-guarantees-bench-inputs.generated.sql', MIG];
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
const BENCH = 'smithing';
const DARK = ARTISAN_RECIPES_EVERY[BENCH].filter((r) => r.switch === JEWEL_SWITCH);
const BOTH = DARK.find((r) => r.perk && r.roll === 'seal');
/* How many jobs each bench path runs. The job's ring rolls two of three perks (keen, surge, follow); a bench that forgot the boss gem's
   perk still draws Follow-through on a piece 2 times in 3, from a stream seeded per run. At 6 jobs that mutant (edge-perk-forgotten)
   survived (2/3)^6 = 8.8% of runs (lane/c-guard-batch-142 saw it MISSED once in its first run); at 40 it survives (2/3)^40 < 1e-7.
   40 jobs of 3 s fit the 600 s each path rewinds. */
const CRAFTS = 40;

let seq = 0;
const nextUid = () => `000000c2-0000-4000-8000-0000000d${String(++seq).padStart(4, '0')}`;
const idem = () => crypto.randomUUID();
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  catch (e) { return { threw: String(e.message).split('\n')[0] }; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

/* A hero made the real way: Level 20, Smithing `smith`, a purse, a bag. */
async function hero(db, { smith = 37, bag = {}, purse = 1000 } = {}) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Jeweler ' + seq]);
  const name = 'Jeweler' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [uid]);
  for (const [id, n] of Object.entries(bag)) await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [uid, id, n]);
  await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = $1 and slot = 0', [uid]);
  await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, public.hr_skill_xp_for_level($2, $3))
                  on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, BENCH, smith]);
  await db.query('update public.account_wallet set gold = $2 where user_id = $1', [uid, purse]);
  return uid;
}
const switchOn = (db, uids) => db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id = $2", [uids, JEWEL_SWITCH]);
const switchOff = (db) => db.query("update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = $1", [JEWEL_SWITCH]);
const featuresOf = async (db, uid) => (await one(db, 'select public.hr_state_of($1, 0) s', [uid]) || {}).features;
const bagOf = async (db, uid) => Object.fromEntries((await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [uid])).rows.map((r) => [r.item_id, Number(r.qty)]));
const viewOf = async (db, uid) => {
  const r = (await db.query(`select ps.active_kind, ps.active_id, (select gold from public.account_wallet w where w.user_id = ps.user_id)::bigint as purse
                               from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
  return { kind: r.active_kind, id: r.active_id, purse: Number(r.purse), bag: await bagOf(db, uid),
    crafts: Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft'", [uid])) };
};
async function rewind(db, uid, agoS) {
  await db.query('update public.player_state set active_since = active_since - make_interval(secs => $2), accrued_to = accrued_to - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
}
async function fire(db, tick, uids) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query('select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)', [holder]);
  try {
    return (await tick.runTick({ exec: engineExec(db), body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}

/* What a guarantee job made: every made row its outcome, its perk and its grade; the inputs spent whole jobs. */
function judgeRun(job, before, after) {
  const per = recipeInputs(job);
  const spent = Object.keys(per).map((id) => ((before[id] || 0) - (after[id] || 0)) / per[id]);
  const made = Object.entries(after).filter(([id, q]) => JEWELRY_ITEMS[id] && q > (before[id] || 0)).map(([id, q]) => [id, q - (before[id] || 0)]);
  const pieces = made.reduce((a, [, q]) => a + q, 0);
  if (!(spent[0] > 0) || spent.some((n) => n !== spent[0])) return `spent ${js(spent)} jobs of ${js(per)}`;
  if (pieces !== spent[0]) return `${pieces} pieces for ${spent[0]} jobs`;
  for (const [id] of made) {
    const it = JEWELRY_ITEMS[id];
    if (!job.outcomes.includes(id)) return `made ${id}, not one of the job's outcomes`;
    if (job.perk && !(job.perk in it.jewelPerks)) return `made ${id} without ${job.perk}`;
    if (job.roll === 'seal' && it.jewelGrade !== 'hallmarked') return `made a ${it.jewelGrade} ${id}`;
  }
  return null;
}

async function arms(db, edge) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.query('delete from public.hr_rate_counters');
  const stock = Object.fromEntries(Object.entries(recipeInputs(BOTH)).map(([id, q]) => [id, q * CRAFTS]));
  const start = (uid, job) => edge.setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity: { kind: 'artisan', id: job.id } });
  const stop = (uid) => edge.setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null } });

  /* ── G-DARK: the chain as applied leaves the switch off for everyone ── */
  const applied = (await db.query('select scope, accounts from public.hr_feature_switches where switch_id = $1', [JEWEL_SWITCH])).rows[0];
  arm('G-DARK', !!applied && applied.scope === 'off' && applied.accounts.length === 0, `the applied chain holds ${JEWEL_SWITCH} off, for no account`,
    `the applied switch reads ${js(applied)}`);

  /* ── G-OFF ── */
  await switchOff(db);
  const off = await hero(db, { bag: stock });
  const f0 = await featuresOf(db, off);
  const before0 = await viewOf(db, off);
  const r0 = await start(off, BOTH);
  const after0 = await viewOf(db, off);
  arm('G-OFF', Array.isArray(f0) && !f0.includes(JEWEL_SWITCH)
      && r0.status === 409 && r0.body.error === 'activity_unsupported' && r0.body.switch === JEWEL_SWITCH
      && js(after0) === js(before0) && after0.kind === 'idle',
    `the envelope's features leave ${JEWEL_SWITCH} out; set_activity refused ${BOTH.id} naming it, nothing moved`,
    `switch off: ${js({ features: f0, answer: r0, before0, after0 }).slice(0, 700)}`);

  /* ── G-ON ── */
  const on = await hero(db, { bag: stock });
  const other = await hero(db);
  await switchOn(db, [on]);
  const fOn = await featuresOf(db, on), fOther = await featuresOf(db, other);
  arm('G-ON', Array.isArray(fOn) && fOn.includes(JEWEL_SWITCH) && Array.isArray(fOther) && !fOther.includes(JEWEL_SWITCH),
    'the account the switch names reads it in its features; another account does not',
    `switch on: ${js({ on: fOn, other: fOther })}`);

  /* ── G-VIEWED: the real start, ten minutes, the owner's stop ── */
  const vb = await bagOf(db, on);
  const sv = await start(on, BOTH);
  await rewind(db, on, 600);
  const st = await stop(on);
  const va = await viewOf(db, on);
  const vWhy = judgeRun(BOTH, vb, va.bag);
  arm('G-VIEWED', sv.status === 200 && st.status === 200 && !vWhy && va.purse === 1000 && va.crafts >= 1 && va.kind === 'idle',
    `set_activity started ${BOTH.id} on ${BENCH}; the stop paid ${CRAFTS - (va.bag.banded_signet || 0)} Hallmarked Follow-through rings for their inputs, no gold, journalled`,
    `the viewed path: ${js({ start: sv.status, startErr: sv.body && sv.body.error, stop: st.status, why: vWhy, va }).slice(0, 700)}`);

  /* ── G-CLOSED: the same job, browser closed, the world tick ── */
  const closed = await hero(db, { bag: stock });
  await switchOn(db, [on, closed]);
  const cb = await bagOf(db, closed);
  const sc = await start(closed, BOTH);
  /* the browser closes: no presence, so the world tick owns the hero */
  await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [closed]);
  await db.query('select public.hr_tick_enrol(200)');
  await rewind(db, closed, 600);
  const fc = await fire(db, edge.tick, [closed]);
  const ca = await viewOf(db, closed);
  const cWhy = judgeRun(BOTH, cb, ca.bag);
  arm('G-CLOSED', sc.status === 200 && !cWhy && ca.purse === 1000 && ca.crafts >= 1,
    'the world tick with the browser closed paid the same guarantee on every piece, no gold, journalled',
    `the closed path: ${js({ start: sc.status, fire: fc, why: cWhy, ca }).slice(0, 700)}`);

  /* ── G-FORGED ── */
  const forged = await hero(db, { bag: { banded_signet_follow: 1, road_carnelian: 1 }, smith: 45, purse: 100000 });
  const viaApply = await as(db, forged, `select public.hr_apply($1::uuid, 0, (select version from public.player_state where user_id = $1 and slot = 0), $2::uuid,
      '{"items": {"banded_signet_keen_follow": 1}}'::jsonb)`, [forged, idem()]);
  const viaHallmark = await as(db, forged, 'select public.hr_hallmark(0, $1, $2, 25000, $3::uuid)', ['banded_signet_follow', 'banded_signet_keen_surge', idem()]);
  await switchOn(db, [on, closed, forged]);
  const viaRecipe = await edge.setActivity({ exec: engineExec(db), user: forged, slot: 0, intentId: idem(), activity: { kind: 'artisan', id: BOTH.id + '_x' } });
  const fa = await viewOf(db, forged);
  arm('G-FORGED', !!(viaApply && viaApply.threw && /permission denied/.test(viaApply.threw))
      && viaHallmark && viaHallmark.error === 'unknown_hallmark' && viaRecipe.status === 409 && viaRecipe.body.error === 'unknown_activity'
      && fa.purse === 100000 && !fa.bag.banded_signet_keen_follow && !fa.bag.banded_signet_keen_surge && fa.bag.banded_signet_follow === 1,
    'a client cannot reach hr_apply, a Hallmark to an unpaired row is unknown_hallmark, a made-up job id is unknown_activity; nothing moved',
    `forged: ${js({ viaApply, viaHallmark, viaRecipe: viaRecipe.body, fa }).slice(0, 700)}`);
  return red;
}

/* ── G-IDEM, on a database booted upTo MIG (see the header): the Coordinator's scope set, the three files applied again in order, the
   activities, the bench inputs and the switch read the same. `edits` re-plants a migration mutant in the re-applied switch file; the mutant
   control (HR_MUTANT_CONTROL, or a replay-scope control that drops the chain's patches) plants nothing here either. */
const IDEM_ACCOUNTS = ['000000c2-0000-4000-8000-0000000e0001', '000000c2-0000-4000-8000-0000000e0002'];
const UNPLANTED = CONTROL || ['scoped', 'full'].includes(process.env.HR_REPLAY_SCOPE_CONTROL);
async function idemAt(db, edits = []) {
  const SNAP = `select (select md5(string_agg(a::text, ',' order by a.kind, a.activity_id)) from public.hr_activities a) a,
                       md5(public.hr_bench_inputs()::text) b,
                       (select scope || ':' || accounts::text from public.hr_feature_switches where switch_id = '${JEWEL_SWITCH}') s`;
  await db.query("update public.hr_feature_switches set scope = 'testers', accounts = $2::uuid[] where switch_id = $1", [JEWEL_SWITCH, IDEM_ACCOUNTS]);
  const s1 = (await db.query(SNAP)).rows[0];
  for (const f of FILES) {
    let src = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
    if (f === MIG && !UNPLANTED) for (const [from, to] of edits) src = src.replace(from, () => to);
    try { await db.exec(`begin;\n${src}\ncommit;`); }
    catch (e) { await db.exec('rollback').catch(() => {}); return `${f} refused a second apply: ${String(e.message).split('\n')[0]}`; }
  }
  const s2 = (await db.query(SNAP)).rows[0];
  const set = `testers:{${IDEM_ACCOUNTS.join(',')}}`;
  if (s1.s !== set) return `the switch never read the scope set before the re-apply: ${js(s1)}`;
  return js(s1) === js(s2) ? null : `the second apply moved state: ${js(s1)} -> ${js(s2)}`;
}

async function loadEdge(root) {
  const tick = await import(pathToFileURL(join(root, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(root, FN, 'set-activity.js')).href + `?m=${seq}`);
  return { tick, setActivity: sa.runSetActivity };
}
async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'jewel-guarantees-db') on conflict (key) do update set enabled = true");
  await db.query('update public.hr_tick_config set enabled = true where id');
}

/* An edge mutant runs the arms on a planted copy; a migration mutant must be refused by the file's own §4 or turn an arm (or G-IDEM) red.
   An edge catch counts only when its named arm is red for the mutant's own reason (`want`, read against the arm's whole message): an arm
   red for anything else is not this defect's proof. */
const EDGE_MUTANTS = [
  { id: 'edge-switch-unasked', arm: 'G-OFF', why: 'set_activity never asks the switch', want: /"answer":\{"status":200\b/,
    file: `${FN}/set-activity.js`, from: '  if (!sw) return true;\n  const on', to: '  return true;\n  const on' },
  { id: 'edge-switch-in-state', arm: 'G-VIEWED', why: 'set_activity reads the switch inside `state` (so it is never on)', want: /"start":409,"startErr":"activity_unsupported"/,
    file: `${FN}/set-activity.js`, from: 'const on = env && env.features;', to: 'const on = env && env.state && env.state.features;' },
  { id: 'edge-perk-forgotten', arm: 'G-VIEWED', why: 'the bench forgets the boss gem\'s perk', want: /"start":200,"stop":200,"why":"made \w+(, not one of the job's outcomes| without )/,
    file: 'src/core/artisan.js', from: 'const fixed = recipe.perk || null;', to: 'const fixed = null;' },
  { id: 'edge-open-jobs-only', arm: 'G-VIEWED', why: 'the engine indexes only the open jobs', want: /"startErr":"unknown_activity"/,
    file: `${FN}/catalogue.js`,
    from: "import { ARTISAN_RECIPES_EVERY as ARTISAN_RECIPES } from '../../../src/data/recipes.js';", to: "import { ARTISAN_RECIPES } from '../../../src/data/recipes.js';" },
];
const SQL_MUTANTS = [
  { id: 'sql-opens-everyone', why: 'the file opens the switch for everyone', expect: /^$/, edits: [["('jewel_guarantees', 'off',", "('jewel_guarantees', 'everyone',"]], arm: 'G-DARK' },
  { id: 'sql-selfcheck-blind', why: 'the self-check lets the switch read on while off', expect: /jewel-guarantees §4\(c\)/,
    edits: [["update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'jewel_guarantees';\n    if public",
      "update public.hr_feature_switches set scope = 'everyone', accounts = '{}' where switch_id = 'jewel_guarantees';\n    if public"]] },
  /* applies clean and reads dark (the arms stay green): only a second apply over a scope the Coordinator set shows it */
  { id: 'sql-reapply-resets', why: 'a re-apply resets the scope the Coordinator set', expect: /^$/, idem: true,
    edits: [['  on conflict (switch_id) do nothing;', "  on conflict (switch_id) do update set scope = 'off', accounts = '{}';"]] },
];

/* The edge copy a mutant runs on. Under the control the copy is made the same way, its anchor still checked once by plant(), but the
   text is written back unchanged: nothing is planted, so the arms judge the shipped engine. */
const plantEdge = (mu) => plant([[mu.file, mu.from, CONTROL ? mu.from : mu.to]], [FN]);

async function main() {
  let db;
  if (!BOTH || DARK.length !== 3) { console.error(`jewel-guarantees-db: HARNESS — the ${BENCH} bench holds ${DARK.length} dark jobs, not the sample's three`); process.exit(2); }
  if (!MUTATE) {
    try { ({ db } = await bootReplay()); } catch (e) { console.error(`jewel-guarantees-db: HARNESS — ${String(e.message).split('\n').slice(0, 3).join(' ').slice(0, 900)}`); process.exit(2); }
    try {
      await prepare(db);
      const edge = await loadEdge(ROOT);
      console.log('\njewel-guarantees-db — a boss gem fixes a perk, a boss Trophy fixes Hallmarked, dark until the switch names you\n');
      /* the arms at head: G-DARK reads the switch as the chain applied it */
      const red = await arms(db, edge);
      /* G-IDEM on the chain as of the three files (the header says why not at head) */
      const { db: at } = await bootReplay({ upTo: MIG });
      let idemWhy;
      try { idemWhy = await idemAt(at); } finally { await at.close().catch(() => {}); }
      console.log(!idemWhy ? `  ✓ G-IDEM — on the chain as of ${MIG}, a second apply of the three files (their self-checks included) moves nothing, the switch stays where it was set`
        : `  ✗ G-IDEM — ${idemWhy}`);
      if (idemWhy) red.set('G-IDEM', idemWhy);
      console.log(red.size ? `\njewel-guarantees-db: RED (${red.size})` : '\njewel-guarantees-db: green');
      process.exitCode = red.size ? 1 : 0;
    } catch (e) {
      console.error(`jewel-guarantees-db: HARNESS — ${String(e.stack || e.message).slice(0, 900)}`); process.exitCode = 2;
    } finally { await db.close().catch(() => {}); }
    return;
  }
  const total = EDGE_MUTANTS.length + SQL_MUTANTS.length;
  console.log(`\njewel-guarantees-db --mutate${CONTROL ? ' (HR_MUTANT_CONTROL: nothing planted)' : ''}\n`);
  console.log(`[mutants] ${total}`);
  let survived = 0;
  const verdict = (mu, caught) => {
    console.log(`[mutant] ${mu.id} ${caught ? 'caught' : 'survived'}`);
    if (caught) console.log(`  CAUGHT  ${mu.why} -> ${caught.slice(0, 220)}`);
    else {
      survived++;
      if (CONTROL) console.log(`  held    ${mu.why}${mu.arm ? ` (${mu.arm})` : ''}, nothing planted`);
      else console.error(`  MISSED  ${mu.why}${mu.arm ? ` (${mu.arm})` : ''}`);
    }
  };
  for (const mu of EDGE_MUTANTS) {
    const p = plantEdge(mu);
    try {
      ({ db } = await bootReplay());
      await prepare(db);
      const red = await arms(db, await loadEdge(p.root));
      const bad = red.has(mu.arm) ? String(red.get(mu.arm)) : '';
      if (bad && !mu.want.test(bad)) console.error(`  ${mu.arm} red, but not for this defect (${mu.want}): ${bad.slice(0, 300)}`);
      verdict(mu, bad && mu.want.test(bad) ? `${mu.arm}: ${bad}` : null);
    } catch (e) { console.error(`jewel-guarantees-db: HARNESS — ${mu.why}: ${e.message}`); process.exit(2); }
    finally { await db.close().catch(() => {}); p.done(); }
  }
  for (const mu of SQL_MUTANTS) {
    let mdb = null, caught = null;
    try { ({ db: mdb } = await bootReplay({ patches: new Map([[MIG, mu.edits]]), upTo: MIG })); }
    catch (e) {
      if (e && e.harness) { console.error(`jewel-guarantees-db: HARNESS — ${mu.why}: ${e.message}`); process.exit(2); }
      if (mu.expect.test(String(e.message))) caught = 'the file\'s own §4 refused it: ' + String(e.message).split('\n')[0];
    }
    if (!caught && mdb) {
      try {
        if (mu.arm) {
          /* the file applied with its defect: the arms judge the database it built */
          await prepare(mdb);
          const red = await arms(mdb, await loadEdge(ROOT));
          if (red.has(mu.arm)) caught = mu.arm + ': ' + String(red.get(mu.arm)).slice(0, 160);
        }
        if (mu.idem) {
          const why = await idemAt(mdb, mu.edits);
          if (why) caught = 'G-IDEM: ' + why.slice(0, 160);
        }
      } finally { await mdb.close().catch(() => {}); }
    } else if (mdb) await mdb.close().catch(() => {});
    verdict(mu, caught);
  }
  if (CONTROL) {
    /* tests/mutant-control.mjs judges the arm lines; every one must read survived */
    console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${total - survived} arm(s) read caught`);
    process.exitCode = 0;
    return;
  }
  console.log(survived ? `\njewel-guarantees-db --mutate: ${survived} of ${total} survived` : `\njewel-guarantees-db --mutate: ${total} mutants, 0 survived`);
  process.exitCode = survived ? 1 : 0;
}

main();
