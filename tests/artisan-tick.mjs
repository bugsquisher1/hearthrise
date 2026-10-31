#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/artisan-tick.mjs — A TOWN BENCH RUN IS SETTLED BY THE SERVER WITH ITS
//   OWNER'S BROWSER CLOSED: A SPENT HEARTH RUN STOPS READING "FUELING" TO OTHER
//   PLAYERS WITHIN ONE FIRE (report #68; 2027-02-10-artisan-tick.sql +
//   supabase/functions/hr-accrue/tick-artisan.js).
//
//   node tests/artisan-tick.mjs            the guard (the whole replayed chain, the shipped runTick)
//   node tests/artisan-tick.mjs --mutate   every planted defect (edge copy or SQL) must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-02-10-artisan-tick.sql, supabase/migrations/2027-02-11-bag-over-cap.sql, supabase/functions/hr-accrue/tick-artisan.js, supabase/functions/hr-accrue/tick.js, supabase/functions/hr-accrue/tick-shadow.js
//
// Every hero here is created through hr_create_hero and then put on a bench the
// way the settle writes it (the pointer, the bag); NONE has a heartbeat, a
// keepalive, a publish or a client: the owner's browser is closed. The world tick
// is driven as production drives it — hr_tick_enrol (the minute cron), then
// hr_tick_roster under the edge's own holder, then the SHIPPED runTick through a
// real connection as hr_engine (the role the edge reaches Postgres as).
//
//   A-SPENT    a Hearth run with 20 bones, 10 min old: ONE fire burns all 20, pays the
//              Inner Flame XP, ends the run (pointer idle), journals ONE `craft` row
//              (meta src:'tick', ticks 20).
//   A-TOWN     another player's town read showed the hero working on the Hearth's fuel
//              stand before the fire and does not after it.
//   A-PARITY   the tick paid exactly what the owner's own stop pays for the same run
//              (a twin hero settled by set_activity idle: the collect path): XP and bones.
//   A-RUNNING  a run with 1,000 bones is settled one flush (90 s) a fire: the bag and
//              the XP move, the run is NOT ended, one row per window.
//   A-ONCE     a second fire over the spent hero pays nothing and journals nothing.
//   A-OVERCAP  a bag one stack over its cap (a hunt came home) still burns bones, on the tick's door and the
//              owner's own stop (2027-02-11-bag-over-cap.sql; live bf18bd7f:0 wedged 9.7 h on 10-30).
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FN = 'supabase/functions/hr-accrue';
const MIG = '2027-02-10-artisan-tick.sql';
const RECIPE = 'fuel_bones';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

let seq = 0;
const nextUid = () => `000000c1-0000-4000-8000-0000000a${String(++seq).padStart(4, '0')}`;
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const js = (v) => String(JSON.stringify(v === undefined ? null : v));

async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
/* The seam index.ts hands the engine: one statement, its own transaction, as hr_engine. */
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

/* A hero made the real way, then put on the Hearth with `bones` in the bag, its window `agoS` old, browser closed. */
async function hearthHero(db, bones, agoS = 600) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query("insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name",
    [uid, 'Fueler ' + seq]);
  const name = 'Fueler' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query("delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'bones'", [uid]);
  await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'bones', $2)", [uid, bones]);
  /* The bench starts NOW (set_activity stamps both watermarks), the minute cron enrols the fresh run, then the
     owner closes the browser and `agoS` passes (both watermarks and the return anchor move back together). */
  await db.query(`update public.player_state
                     set active_kind = 'artisan', active_id = $2, active_since = now(), accrued_to = now(), last_seen_at = null
                   where user_id = $1 and slot = 0`, [uid, RECIPE]);
  await db.query('select public.hr_tick_enrol(200)');
  await db.query(`update public.player_state
                     set active_since = active_since - make_interval(secs => $2), accrued_to = accrued_to - make_interval(secs => $2)
                   where user_id = $1 and slot = 0`, [uid, agoS]);
  await db.query(`update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2)
                   where user_id = $1 and slot = 0`, [uid, agoS]);
  return uid;
}

const stateOf = async (db, uid) => (await db.query(
  `select ps.active_kind, ps.active_id, ps.accrued_to, ps.version,
          coalesce((select qty from public.player_inventory i where i.user_id = ps.user_id and i.slot = 0 and i.item_id = 'bones'), 0)::int as bones,
          coalesce((select xp from public.player_skills k where k.user_id = ps.user_id and k.slot = 0 and k.skill_id = 'inner_flame'), 0)::bigint as xp
     from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
const craftRows = async (db, uid) => (await db.query(
  "select meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft' order by id", [uid])).rows.map((r) => r.meta);

/* One world-tick fire for these heroes, the way the cron drives it: enrol, roster under the edge's holder, runTick. */
async function fire(db, tick, uids) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query("select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)", [holder]);
  try {
    return (await tick.runTick({ exec: engineExec(db),
      body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}

/* Another player's town read, as hr_town_view answers it: is `uid` drawn WORKING? (null = not drawn) */
async function seenWorking(db, viewer, uid, at) {
  await as(db, viewer, 'select public.hr_town_view(0, $1, $2, $3, null, null, null)', [at.map, at.x, at.y]);   // places + applies notes
  const v = await as(db, viewer, 'select public.hr_town_view(0, $1, $2, $3, null, null, null)', [at.map, at.x, at.y]);
  const w = ((v && v.walkers) || []).find((x) => x.id === uid && x.slot === 0);
  return w ? w.work === true : null;
}

async function arms(db, tick, setActivity) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.query('delete from public.hr_rate_counters');

  const map = await one(db, 'select map_id from public.hr_town_maps where main limit 1');
  const station = await one(db, "select public.hr_town_station_for($1, 'artisan', $2)", [map, RECIPE]);
  const tile = (await db.query('select x, y from public.hr_town_stands where map_id = $1 and station_id = $2 order by stand_no limit 1',
    [map, station])).rows[0] || { x: 0, y: 0 };
  const at = { map, x: tile.x, y: tile.y };

  /* A viewer: another account, in town, idle. */
  const viewer = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [viewer]);
  await db.query("insert into public.profiles (id, display_name) values ($1, 'Onlooker') on conflict (id) do nothing", [viewer]);
  const vname = 'Onlooker' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const vh = await as(db, viewer, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [vname, COLORS, idem()]);
  if (!vh || vh.ok !== true) throw Object.assign(new Error('viewer hr_create_hero refused: ' + js(vh)), { harness: true });

  /* ── A-SPENT / A-TOWN / A-ONCE ── */
  const a = await hearthHero(db, 20);
  const twin = await hearthHero(db, 20);
  const before = await stateOf(db, a);
  const workingBefore = await seenWorking(db, viewer, a, at);
  const f1 = await fire(db, tick, [a]);
  const after = await stateOf(db, a);
  const rows = await craftRows(db, a);
  const m = rows[rows.length - 1] || {};
  arm('A-SPENT', after.active_kind === 'idle' && after.bones === 0 && Number(after.xp) > Number(before.xp)
      && rows.length === 1 && m.src === 'tick' && Number(m.ticks) === 20 && m.recipe === RECIPE,
    `one fire burnt all 20 bones (+${Number(after.xp) - Number(before.xp)} Inner Flame XP), ended the run and journalled ONE craft row (src tick, ticks 20)`,
    `the spent run was not settled by the server: ${js({ fire: f1, before, after, rows })}`);
  const workingAfter = await seenWorking(db, viewer, a, at);
  arm('A-TOWN', workingBefore === true && workingAfter !== true,
    'another player saw the hero working the Hearth before the fire, and not after it',
    `the town read did not follow: working before ${workingBefore}, after ${workingAfter}`);

  /* ── A-PARITY: the owner's own stop over the twin, the collect path ── */
  const tb = await stateOf(db, twin);
  const stop = await setActivity({ exec: engineExec(db), user: twin, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null } });
  const ta = await stateOf(db, twin);
  const tickXp = Number(after.xp) - Number(before.xp);
  const stopXp = Number(ta.xp) - Number(tb.xp);
  arm('A-PARITY', ta.active_kind === 'idle' && ta.bones === after.bones && stopXp === tickXp && tickXp > 0,
    `the tick paid what the owner's own stop pays for the same run (${tickXp} XP, ${before.bones - after.bones} bones each)`,
    `the tick and the owner's settle disagree: tick ${tickXp} XP / ${after.bones} bones left, stop ${stopXp} XP / ${ta.bones} left (${js(stop && (stop.body || stop)).slice(0, 200)})`);

  /* ── A-ONCE ── */
  const ledgerBefore = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [a]);
  const f2 = await fire(db, tick, [a]);
  const ledgerAfter = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [a]);
  const again = await stateOf(db, a);
  arm('A-ONCE', ledgerAfter === ledgerBefore && again.version === after.version && Number(again.xp) === Number(after.xp),
    `a second fire over the spent hero pays and journals nothing (${js(f2 && f2.reasons)})`,
    `a second fire moved the spent hero: ledger ${ledgerBefore} -> ${ledgerAfter}, version ${after.version} -> ${again.version}`);

  /* ── A-RUNNING ── */
  const r = await hearthHero(db, 1000);
  const rb = await stateOf(db, r);
  await fire(db, tick, [r]);
  const ra = await stateOf(db, r);
  const rr = await craftRows(db, r);
  const movedMs = Date.parse(ra.accrued_to) - Date.parse(rb.accrued_to);
  arm('A-RUNNING', ra.active_kind === 'artisan' && ra.bones < 1000 && ra.bones > 0 && Number(ra.xp) > Number(rb.xp)
      && rr.length === 1 && movedMs > 0 && movedMs <= 90000,
    `a long run is settled one window a fire and keeps running (${1000 - ra.bones} bones, watermark +${movedMs} ms, one row)`,
    `a running bench was not settled as a window: ${js({ rb, ra, rows: rr.length, movedMs })}`);

  /* ── A-OVERCAP (2027-02-11-bag-over-cap.sql, live bf18bd7f:0 10-30): a hunt's bag came home over the cap, then the
        hero resumed the Hearth. A bench that only burns bones is paid on BOTH doors; a new stack is still refused. ── */
  const overBag = async () => {
    const h = await hearthHero(db, 1000);
    const cap = await one(db, 'select bank_cap from public.player_state where user_id = $1 and slot = 0', [h]);
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty)
                    select $1, 0, i.item_id, 1 from public.hr_items i
                     where not exists (select 1 from public.player_inventory p where p.user_id = $1 and p.slot = 0 and p.item_id = i.item_id)
                     order by i.item_id
                     limit greatest(0, $2::int + 1 - (select count(*)::int from public.player_inventory p where p.user_id = $1 and p.slot = 0))`, [h, cap]);
    const stacks = await one(db, 'select count(*)::int from public.player_inventory where user_id = $1 and slot = 0', [h]);
    return { h, cap, stacks };
  };
  const ot = await overBag();
  const otb = await stateOf(db, ot.h);
  const of1 = await fire(db, tick, [ot.h]);
  const ota = await stateOf(db, ot.h);
  const otRows = await craftRows(db, ot.h);
  const overTick = ot.stacks === ot.cap + 1 && ota.bones < otb.bones && Number(ota.xp) > Number(otb.xp) && otRows.length === 1
    && ota.active_kind === 'artisan' && Date.parse(ota.accrued_to) > Date.parse(otb.accrued_to);
  const oo = await overBag();
  const oob = await stateOf(db, oo.h);
  const oStop = await setActivity({ exec: engineExec(db), user: oo.h, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null } });
  const ooa = await stateOf(db, oo.h);
  const overOwner = oo.stacks === oo.cap + 1 && ooa.active_kind === 'idle' && ooa.bones < oob.bones && Number(ooa.xp) > Number(oob.xp);
  arm('A-OVERCAP', overTick && overOwner,
    `a bag at cap + 1 (${ot.stacks} of ${ot.cap}) burns bones on the tick's door (${otb.bones - ota.bones}, one row) and on the owner's own stop (${oob.bones - ooa.bones})`,
    `an over-cap bag wedged the bench: ${js({ tick: { stacks: ot.stacks, cap: ot.cap, otb, ota, rows: otRows.length, fire: of1 }, owner: { stacks: oo.stacks, oob, ooa, stop: oStop && (oStop.body || oStop) } }).slice(0, 700)}`);
  return red;
}

async function loadEdge(dir) {
  const tick = await import(pathToFileURL(join(dir, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(dir, FN, 'set-activity.js')).href + `?m=${seq}`);
  return { tick, setActivity: sa.runSetActivity };
}

async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'artisan-tick') on conflict (key) do update set enabled = true");
  /* the replay lands the tick DISABLED (production runs it); the channels and arm are the migration's */
  await db.query('update public.hr_tick_config set enabled = true where id');
}

const JS_MUTANTS = [
  { id: 'undriven', arm: 'A-SPENT', file: `${FN}/tick.js`, why: 'artisan left undriven (the pre-fix dispatch)',
    from: '  [ARTISAN_CHANNEL]: Object.freeze({\n    channel: ARTISAN_CHANNEL,', to: '  [ARTISAN_CHANNEL + "_off"]: Object.freeze({\n    channel: ARTISAN_CHANNEL,' },
  { id: 'no_recipes', arm: 'A-SPENT', file: `${FN}/tick-shadow.js`, why: 'the recipe index is not forwarded to the engine',
    from: '    ...(catalogues.recipes ? { recipes: catalogues.recipes } : {}),', to: '' },
  { id: 'short_window', arm: 'A-PARITY', file: `${FN}/tick-artisan.js`, why: 'the window pays a different span than the accrue path (half the window)',
    from: '  const res = artisanTick(char, watermarkMs, toMs, o);', to: '  const res = artisanTick(char, watermarkMs, watermarkMs + Math.floor((toMs - watermarkMs) / 8), o);' },
  { id: 'no_marker', arm: 'A-SPENT', file: `${FN}/tick-artisan.js`, why: 'the journal row is indistinguishable from an accrue (no src tick)',
    from: "  d.journal = { ...j, meta: { ...(j.meta || {}), src: 'tick' } };", to: '  d.journal = { ...j };' },
];
/* SQL mutants on the migration: caught when its own §4 refuses the file (the replay names it) or, if a defect
   slips the self-check, when the arm goes red on the chain it built. */
const SQL_MUTANTS = [
  { id: 'not_armed', arm: 'A-SPENT', why: 'the channel is driven but never armed (the fence shadows it, nothing pays)',
    edits: [["       armed_channels = case when 'artisan' = any (armed_channels) then armed_channels\n                             else array_append(armed_channels, 'artisan') end,",
             '       armed_channels = armed_channels,']] },
  { id: 'not_driven', arm: 'A-SPENT', why: 'the channel never joins hr_tick_config.channels (the roster never leases it)',
    edits: [["   set channels       = case when 'artisan' = any (channels) then channels\n                             else array_append(channels, 'artisan') end,",
             '   set channels       = channels,'],
            ["       armed_channels = case when 'artisan' = any (armed_channels) then armed_channels\n                             else array_append(armed_channels, 'artisan') end,",
             '       armed_channels = armed_channels,']] },
  { id: 'nobody_enrolled', arm: 'A-SPENT', why: 'the cohort admits no one (permille 0): no hero is ever tick-owned',
    edits: [["values ('artisan', 1000, 100, 600,", "values ('artisan', 0, 100, 600,"]] },
  { id: 'journal_closed', arm: 'A-SPENT', why: 'the enrolment journal still admits gather only (every enrolment raises)',
    /* the §4 k3 enrolment is the judge: it raises the journal's CHECK inside the file */
    expect: /hr_tick_enrolment_channel_ck/,
    edits: [["    alter table public.hr_tick_enrolment add constraint hr_tick_enrolment_channel_ck\n      check (channel in ('gather', 'artisan'));",
             "    alter table public.hr_tick_enrolment add constraint hr_tick_enrolment_channel_ck\n      check (channel in ('gather', 'artisan_x'));"]] },
  /* 2027-02-11-bag-over-cap.sql: the old absolute test (its §2 v3 refuses the file). */
  { id: 'over_cap_wedges', arm: 'A-OVERCAP', file: '2027-02-11-bag-over-cap.sql', expect: /bag-over-cap §2 v3/,
    why: 'an over-cap bag refuses every item delta (the wedge, live bf18bd7f:0)',
    edits: [['      if v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then', '      if v_stacks > v_st.bank_cap then']] },
  { id: 'over_cap_grows', arm: 'A-OVERCAP', file: '2027-02-11-bag-over-cap.sql', expect: /bag-over-cap §2 v[25]/,
    why: 'the cap stops biting altogether',
    edits: [['      if v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then', '      if false then']] },
];

async function main() {
  let db;
  if (!MUTATE) {
    try { ({ db } = await bootReplay()); } catch (e) { console.error(`artisan-tick: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
    try {
      await prepare(db);
      const { tick, setActivity } = await loadEdge(ROOT);
      console.log('\nartisan-tick — a town bench run settled by the server, owner\'s browser closed\n');
      /* A-IDEM: a second apply of the file (its §4 included) moves nothing: the config row keeps its tuple and
         stamp, the cohort rows and the two CHECKs are identical. */
      const SNAP = `select 'cfg' k, c.channels::text || '|' || c.armed_channels::text || '|' || c.updated_at::text || '|' || c.ctid::text v
                      from public.hr_tick_config c
                    union all select 'coh:' || channel, permille || '|' || max_owned || '|' || fresh_s || '|' || coalesce(note, '') || '|' || ctid::text
                      from public.hr_tick_cohort
                    union all select 'ck:' || conname, pg_get_constraintdef(oid) from pg_constraint
                     where conname in ('hr_tick_cohort_channel_ck', 'hr_tick_enrolment_channel_ck')
                    order by 1`;
      const s1 = JSON.stringify((await db.query(SNAP)).rows);
      const src = readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8').replace(/\r\n/g, '\n');
      let again = null;
      try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); again = String(e.message).split('\n')[0]; }
      const s2 = JSON.stringify((await db.query(SNAP)).rows);
      const idem = again === null && s1 === s2;
      console.log(idem ? '  ✓ A-IDEM — a second apply (its §4 included) moves nothing: config tuple, cohort rows, CHECKs identical'
        : `  ✗ A-IDEM — the second apply ${again ? 'refused: ' + again : 'moved state'}`);
      const red = await arms(db, tick, setActivity);
      if (!idem) red.set('A-IDEM', 'second apply');
      console.log(red.size ? `\nartisan-tick: RED (${red.size})` : '\nartisan-tick: green');
      process.exitCode = red.size ? 1 : 0;
    } catch (e) {
      console.error(`artisan-tick: HARNESS — ${String(e.message).slice(0, 400)}`); process.exitCode = 2;
    } finally { await db.close().catch(() => {}); }
    return;
  }
  console.log('\nartisan-tick --mutate\n');
  let survived = 0;
  try { ({ db } = await bootReplay()); } catch (e) { console.error(`artisan-tick: HARNESS — ${e.message}`); process.exit(2); }
  try {
    await prepare(db);
    for (const mu of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-artisan-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, mu.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(mu.from).length !== 2) { console.error(`artisan-tick: HARNESS — mutant ${mu.id}: anchor not found once in ${mu.file}`); process.exit(2); }
        if (!CONTROL) writeFileSync(p, src.replace(mu.from, () => mu.to));
        const { tick, setActivity } = await loadEdge(dir);
        const red = await arms(db, tick, setActivity);
        const caught = red.has(mu.arm);
        console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
        if (!caught) survived++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  } finally { await db.close().catch(() => {}); }
  for (const mu of SQL_MUTANTS) {
    let mdb;
    try { ({ db: mdb } = await bootReplay(CONTROL ? {} : { patches: new Map([[mu.file || MIG, mu.edits]]), upTo: LAST_PATCHED })); }
    catch (e) {
      if (e && e.harness) { console.error(`artisan-tick: HARNESS — mutant ${mu.id}: ${e.message}`); process.exit(2); }
      const msg = String(e.message);
      const refused = msg.includes(`${mu.file || MIG} failed to apply`) && (mu.expect || /artisan-tick §4/).test(msg);
      console.log(refused ? `  ✓ ${mu.id} — refused by the file's own §4 (${mu.why}): ${msg.split('\n')[1].trim().slice(0, 140)}`
        : `  ✗ ${mu.id} — the chain failed for another reason: ${msg.split('\n').slice(0, 2).join(' ').slice(0, 200)}`);
      if (!refused) survived++;
      continue;
    }
    try {
      await prepare(mdb);
      const { tick, setActivity } = await loadEdge(ROOT);
      const red = await arms(mdb, tick, setActivity);
      const caught = red.has(mu.arm);
      console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    } finally { await mdb.close().catch(() => {}); }
  }
  const total = JS_MUTANTS.length + SQL_MUTANTS.length;
  console.log(survived ? `\nartisan-tick --mutate: ${survived} survived` : `\nartisan-tick --mutate: ${total}/${total} caught`);
  process.exitCode = survived ? 1 : 0;
}

await main();
