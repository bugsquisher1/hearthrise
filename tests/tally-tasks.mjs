#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tally-tasks.mjs — TAMSIN'S TALLY: SERVER-COUNTED KILL TASKS, PAID ONCE ON
// THE WAY BACK TO TOWN (2026-12-23-tally-tasks.sql + its generated catalogue).
//
//   node tests/tally-tasks.mjs             the guard
//   node tests/tally-tasks.mjs --list      the mutation catalogue
//   node tests/tally-tasks.mjs --selftest  every planted defect must turn its arm red
//   node tests/tally-tasks.mjs --mutate=<id>
//
// Real RPCs and the REAL hunt settle (supabase/functions/hr-accrue/hunt-settle.js over
// the replayed chain, the tests/hunt-sessions-settle.mjs harness), production untouched:
//   TT-1  CATALOGUE  the server's tasks, materials and limits are src/data/tally-tasks.js;
//                    its pieces are the generator's Scarce armour of each ground.
//   TT-2  COUNT      a party of two holds the cellar task: through the world tick (browser
//                    closed) and the player's settle (hunt viewed), EVERY hero's task moves by
//                    exactly that hero's own rat kills (its bestiary count), both alike; a held
//                    task on another ground does not move.
//   TT-3  PAY        a finished task is NOT paid mid-hunt; the settle that brings the hero back
//                    to town (Leave) pays it ONCE, both doors: the catalogue's gold into the
//                    ACCOUNT purse, her pick into the bag, one ledger row (tally_pay, gold_kind
//                    tally, the hunt's session, the purse after), one claim row; the task goes.
//   TT-4  CAP        three claims today: a fourth done task waits (`cap`, nothing moves) through
//                    the return-to-town settle; today's count is what holds it (the next day pays).
//   TT-5  RETRY      the same commit landed twice answers `replayed` and pays nothing more; a
//                    town visit replayed by key answers the same; a new key finds nothing due;
//                    a forged kills-by-monster past the window's kills is refused, moving nothing.
//   TT-6  PICK       weight medium at the Thicket: helmet, body, legs, boots (her order), then the
//                    task's materials in turn; never a piece twice (even sold back out of the
//                    bag); a piece the hero carries is skipped; the hero's own slot order leads.
//   TT-7  KEEP       "Keep this task": paid, then held again at once with a fresh count; off: gone.
//   TT-8  OWN        no verb takes a target hero; a stranger's drop / set touches only its own
//                    rows; no client may write a tally table.
//   TT-9  REFUSE     the refusals in words: weight_needed, tally_full, tally_in_town (taking a
//                    task while hunting), tally_pays_in_town, bad_order, unknown_task, not_held.
//   TT-10 PROJECTION the client's reader (src/session/tally-sections.js) reads the real section
//                    and is REPLACED by the next envelope, never merged.
//   TT-11 REAPPLY    a second apply of both files is byte-identical (bodies, rows, constraints).
// TRUE CONCURRENCY is unverified locally (PGlite is one backend); the lock order is pinned in
// the migration header and its §8.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const MIG = '2026-12-23-tally-tasks.sql';
/* the generator's current file (it moves forward when the last one is APPLIED history): a second apply of an older
   catalogue would rewrite the rows the chain's last one wrote */
const { OUT_FILE: CAT } = await import('../tools/gen-tally-tasks.mjs');
const CELLAR = 'cellar_giant_rats';
const THICKET = 'thicket_gray_wolves';
const idem = () => crypto.randomUUID();

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db:  a live body edited inside the arm's transaction (fn, find, replace).
   ddl: a statement run inside the arm's transaction before it.
   js:  the client reader, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  count_first_member: { arm: 'TT-2', why: 'the settle counts only the first member of a party',
    db: ['public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
      "    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop\n      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');\n      perform public.hr_tally_count(",
      "    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int limit 1 loop\n      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');\n      perform public.hr_tally_count("] },
  count_any_ground: { arm: 'TT-2', why: 'a kill counts toward a task on another ground',
    db: ['public.hr_tally_count(uuid,integer,uuid,jsonb)', 'and c.hunt_id = v_hunt and t.done_at is null', 'and t.done_at is null'] },
  count_all_kills: { arm: 'TT-2', why: 'every kill counts, not the task monster\'s',
    db: ['public.hr_tally_count(uuid,integer,uuid,jsonb)', "coalesce((p_meta->'km'->>v_r.monster_id)::bigint, 0)", 'v_sum::bigint'] },
  pay_mid_hunt: { arm: 'TT-3', why: 'a finished task is paid while the hero is still hunting',
    db: ['public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
      'h.id = (v_m->>\'session\')::uuid and h.ended_at is not null) then', 'h.id = (v_m->>\'session\')::uuid) then'] },
  pay_to_hero_gold: { arm: 'TT-3', why: 'the gold is credited without moving the account purse',
    db: ['public.hr_tally_claim(uuid,integer,uuid)', 'v_purse := public.hr_purse_move(p_user, v_r.gold, 0);', 'v_purse := public.hr_purse_of(p_user);'] },
  no_cap: { arm: 'TT-4', why: 'the per-day cap is never read: a fourth task pays (ordinal 4 is refused by the CHECK)',
    db: ['public.hr_tally_claim(uuid,integer,uuid)', 'if v_n >= v_cfg.paid_per_day then', 'if false then'] },
  pay_twice: { arm: 'TT-5', why: 'a paid task stays done: the next settle or visit pays it again',
    db: ['public.hr_tally_claim(uuid,integer,uuid)', '      delete from public.hero_tally_tasks where user_id = p_user and slot = p_slot and place = v_r.place;\n',
      '      null;\n'] },
  forged_km: { arm: 'TT-5b', why: 'a kills-by-monster summing past the window\'s bounded kills is counted',
    db: ['public.hr_tally_count(uuid,integer,uuid,jsonb)', 'if v_sum > v_kills then', 'if false then'] },
  pick_repeats: { arm: 'TT-6', why: 'her pick forgets what she gave: a piece sold out of the bag is given again',
    db: ['public.hr_tally_pick(uuid,integer,text)',
      'and not exists (select 1 from public.hero_tally_given g where g.user_id = p_user and g.slot = p_slot and g.item_id = p.item_id)', 'and true'] },
  pick_ignores_order: { arm: 'TT-6', why: 'her pick ignores the hero\'s slot order',
    db: ['public.hr_tally_pick(uuid,integer,text)', 'order by coalesce(array_position(v_order, p.equip_slot), 99), p.tier desc, p.item_id', 'order by p.item_id'] },
  keep_ignored: { arm: 'TT-7', why: '"Keep this task" is never honoured',
    db: ['public.hr_tally_claim(uuid,integer,uuid)', '    if v_r.keep then', '    if false then'] },
  drop_any_hero: { arm: 'TT-8', why: 'a drop finds and deletes that task on any hero in the slot',
    db: ['public.hr_tally_drop(integer,text,uuid)', [
      ['select * into v_t from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = p_task;',
        'select * into v_t from public.hero_tally_tasks x where x.slot = p_slot and x.task_id = p_task order by x.user_id <> v_uid limit 1;'],
      ['delete from public.hero_tally_tasks where user_id = v_uid and slot = p_slot and place = v_t.place;',
        'delete from public.hero_tally_tasks where slot = p_slot and task_id = p_task;']]] },
  client_write: { arm: 'TT-8', why: 'authenticated may INSERT a held task directly',
    ddl: 'grant insert on public.hero_tally_tasks to authenticated; create policy "tt mutant" on public.hero_tally_tasks for insert with check (true)' },
  accept_while_hunting: { arm: 'TT-9', why: 'a task is taken mid-hunt',
    db: ['public.hr_tally_accept(integer,text,text,uuid)', '  if v_s.id is not null then', '  if false then'] },
  reader_keeps_first: { arm: 'TT-10', why: 'the client keeps the first envelope\'s tally (not replaced by the next)',
    js: ['src/session/tally-sections.js', [['const SEEN = new WeakMap();', 'const SEEN = new WeakMap();\nlet FIRST = null;'],
      ['  SEEN.set(raw, out);\n  return out;', '  SEEN.set(raw, out);\n  FIRST = FIRST || out;\n  return FIRST;']]] },
  notice_every_page: { arm: 'TT-12', why: 'the payment notice is not keyed by the claim: every page tells it again',
    js: ['src/shell/alerts.js', [["out.push({ id: 'tally:' + p.claim,", "out.push({ id: 'tally:' + p.claim + ':' + Math.random(),"]]] },
  reapply_dupes: { arm: 'TT-11', why: 'a second apply re-seeds the section registry under a new key',
    file: [MIG, "  ('tally', 'hr_tally_section',", "  ('tally_' || md5(clock_timestamp()::text), 'hr_tally_section',"] },
};

/* THE MIGRATION'S OWN §8 MUST REFUSE TO APPLY a body that breaks its rules (each replays the chain to it). */
export const SQL_MUTANTS = {
  self_cap_off: { why: '§8(e): the per-day cap is never read',
    find: '    if v_n >= v_cfg.paid_per_day then v_why := \'cap\'; exit; end if;', repl: '    null;' },
  self_pay_twice: { why: '§8(c): a paid task stays held and pays again',
    find: '      delete from public.hero_tally_tasks where user_id = p_user and slot = p_slot and place = v_r.place;\n', repl: '      null;\n' },
  self_any_hero: { why: '§8(g): a drop reaches another hero\'s task',
    pairs: [['  select * into v_t from public.hero_tally_tasks x where x.user_id = v_uid and x.slot = p_slot and x.task_id = p_task;',
      '  select * into v_t from public.hero_tally_tasks x where x.slot = p_slot and x.task_id = p_task order by x.user_id <> v_uid limit 1;'],
    ['  delete from public.hero_tally_tasks where user_id = v_uid and slot = p_slot and place = v_t.place;',
      '  delete from public.hero_tally_tasks where slot = p_slot and task_id = p_task;']] },
  self_client_write: { why: '§8(g): a client may write a held task',
    find: "    execute format('grant select on public.%I to authenticated', v_t);",
    repl: "    execute format('grant select, insert on public.%I to authenticated', v_t);" },
  self_one_member: { why: '§8(b): the settle counts one member only',
    find: "    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop\n      perform public.hr_tally_count(",
    repl: "    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int limit 1 loop\n      perform public.hr_tally_count(" },
};

async function q(db, sql, p) { return (await db.query(sql, p)).rows; }
async function one(db, sql, p) { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; }
const asUser = (db, uid) => db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
const calm = (db) => db.query('delete from public.hr_rate_counters');
async function rpc(db, uid, sql, p) { await asUser(db, uid); await calm(db); return one(db, sql, p); }
const take = (db, uid, task, weight) => rpc(db, uid, 'select public.hr_tally_accept(0, $1, $2, $3::uuid)', [task, weight, idem()]);
const purse = async (db, uid) => Number(await one(db, 'select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text', [uid]));
const heldRow = (db, uid, task) => q(db, 'select place, kills, target, keep, done_at, wait from public.hero_tally_tasks where user_id = $1 and slot = 0 and task_id = $2', [uid, task]).then((r) => r[0] || null);
const ratKills = async (db, uid) => Number(await one(db, `select coalesce((select value from public.player_progress where user_id = $1 and slot = 0
  and kind = 'stat' and key = 'ev:kill_monster:rat' and period_key = ''), 0)::text`, [uid]));
const finish = (db, uid, task) => db.query('update public.hero_tally_tasks set kills = target, done_at = now() where user_id = $1 and slot = 0 and task_id = $2', [uid, task]);
const payRows = (db, uid, task) => q(db, `select gold::text, session_id, gold_kind, purse::text, item_id, qty::int from public.player_ledger
  where user_id = $1 and intent = $2 order by id`, [uid, 'tally_pay:' + task]);

/* THE TWO DOORS: the world tick (browser closed) and the player's settle (hunt viewed). */
function doorsOf(M, H, exec, uid, sid) {
  return {
    closed: (t) => M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'tick', session: sid, grounds: H.groundsOf(M), atMs: t }),
    viewed: (t) => M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true,
      grounds: H.groundsOf(M), atMs: t, minWindowMs: 0 }),
  };
}
async function leaveAt(db, H, uid, sid, atMs) {
  await asUser(db, uid);
  await calm(db);
  const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
  await asUser(db, '');
  if (!lv || lv.ok !== true) throw new Error('the leave was refused: ' + JSON.stringify(lv));
  await db.query('update public.hunt_sessions set leave_at = to_timestamp($2::bigint / 1000.0) where id = $1', [sid, atMs]);
}

const ARMS = {
  'TT-1': async (db, M, X) => {
    const problems = [];
    const tasks = await q(db, 'select task_id, hunt_id, monster_id, target, gold::int, party from public.hr_tally_tasks order by ord');
    const want = X.T.TALLY_TASKS.map((t) => ({ task_id: t.id, hunt_id: t.hunt, monster_id: t.monster, target: t.count, gold: t.gold, party: t.party }));
    if (JSON.stringify(tasks) !== JSON.stringify(want)) problems.push('hr_tally_tasks ' + JSON.stringify(tasks) + ' is not the data ' + JSON.stringify(want));
    const mats = (await q(db, 'select task_id, ord, item_id, qty from public.hr_tally_materials'))
      .sort((a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : a.ord - b.ord));
    const wantM = X.T.TALLY_TASKS.flatMap((t) => t.materials.map((m, i) => ({ task_id: t.id, ord: i + 1, item_id: m.item, qty: m.qty })))
      .sort((a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : a.ord - b.ord));
    if (JSON.stringify(mats) !== JSON.stringify(wantM)) problems.push('hr_tally_materials is not the data');
    const cfg = await q(db, 'select held_max, paid_per_day, weights, slot_order from public.hr_tally_config');
    if (!cfg[0] || cfg[0].held_max !== X.T.TALLY_RULES.heldMax || cfg[0].paid_per_day !== X.T.TALLY_RULES.paidPerDay
      || JSON.stringify(cfg[0].slot_order) !== JSON.stringify(X.T.TALLY_RULES.slotOrder)) problems.push('hr_tally_config ' + JSON.stringify(cfg) + ' is not TALLY_RULES');
    const D = await X.G.inputs(X.H.ROOT);
    for (const t of X.T.TALLY_TASKS) {
      const g = Object.values(D.grounds).find((x) => x.hunt === t.hunt);
      const exp = X.G.groundPieces(g, { ...D, slotOrder: X.T.TALLY_RULES.slotOrder }).map((p) => p.item).sort();
      const got = (await q(db, 'select item_id from public.hr_tally_pieces where hunt_id = $1', [t.hunt])).map((r) => r.item_id).sort();
      if (JSON.stringify(got) !== JSON.stringify(exp)) problems.push(`${t.hunt}: pieces ${got} are not the ground's Scarce armour ${exp}`);
    }
    return problems;
  },

  'TT-2': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const P = { ...H.STRONG, minutesAgo: 12 };
    const h = await H.hunter(db, M, { party: [{ ...P }, { ...P }], beforeEnter: async () => {
      for (const u of [H.UIDS[0], H.UIDS[1]]) {
        const r = await take(db, u, CELLAR, 'light');
        if (!r || r.ok !== true) throw new Error('take refused: ' + JSON.stringify(r));
      }
      const r2 = await take(db, H.UIDS[0], THICKET, null);
      if (!r2 || r2.ok !== true) throw new Error('second take refused: ' + JSON.stringify(r2));
    } });
    const exec = H.makeExec(db);
    await db.query('savepoint tt2');
    for (const door of ['closed', 'viewed']) {
      const go = doorsOf(M, H, exec, H.UIDS[0], h.sid)[door];
      for (const t of [h.from + 4 * 60000, h.from + 8 * 60000, h.from + 11 * 60000]) {
        const r = await go(t);
        if (!r || r.outcome !== 'paid') { problems.push(`${door}: the window to +${t - h.from} ms answered ${r && r.outcome}/${r && r.reason}`); break; }
      }
      const a = await heldRow(db, H.UIDS[0], CELLAR), b = await heldRow(db, H.UIDS[1], CELLAR);
      const ra = await ratKills(db, H.UIDS[0]), rb = await ratKills(db, H.UIDS[1]);
      if (!(ra > 0)) problems.push(`${door}: CONTROL: the party killed no rat`);
      if (!a || a.kills !== Math.min(a.target, ra)) problems.push(`${door}: the first hero's task reads ${a && a.kills}, its own rat kills ${ra}`);
      if (!b || b.kills !== Math.min(b.target, rb)) problems.push(`${door}: the second hero's task reads ${b && b.kills}, its own rat kills ${rb}`);
      if (a && b && (a.kills !== b.kills || ra !== rb)) problems.push(`${door}: a party kill did not count for both heroes (${a.kills} / ${b.kills}, bestiary ${ra} / ${rb})`);
      const w = await heldRow(db, H.UIDS[0], THICKET);
      if (!w || w.kills !== 0) problems.push(`${door}: the Thicket task moved to ${w && w.kills} in the Cellar`);
      /* The fixture fields no gray wolf: hand the count a Cellar window that did kill some (within its kills). */
      await db.query(`select public.hr_tally_count($1, 0, $2, '{"kills": 3, "km": {"gray_wolf": 3}}'::jsonb)`, [H.UIDS[0], h.sid]);
      const w2 = await heldRow(db, H.UIDS[0], THICKET);
      if (!w2 || w2.kills !== 0) problems.push(`${door}: gray wolves killed in the Cellar moved the Thicket task to ${w2 && w2.kills}`);
      await db.query('rollback to savepoint tt2');
    }
    return problems;
  },

  'TT-3': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 12, beforeEnter: async () => {
      const r = await take(db, U, CELLAR, 'light');
      if (!r || r.ok !== true) throw new Error('take refused: ' + JSON.stringify(r));
    } });
    const exec = H.makeExec(db);
    const gold = await one(db, 'select gold::int from public.hr_tally_tasks where task_id = $1', [CELLAR]);
    await db.query('savepoint tt3');
    for (const door of ['closed', 'viewed']) {
      const go = doorsOf(M, H, exec, U, h.sid)[door];
      await db.query('update public.hero_tally_tasks set kills = target - 1 where user_id = $1 and task_id = $2', [U, CELLAR]);
      let r = await go(h.from + 5 * 60000);
      const mid = await heldRow(db, U, CELLAR);
      if (!r || r.outcome !== 'paid') problems.push(`${door}: CONTROL: the first window answered ${r && r.outcome}/${r && r.reason}`);
      if (!mid || !mid.done_at) problems.push(`${door}: the last rat did not finish the task (${JSON.stringify(mid)})`);
      if ((await payRows(db, U, CELLAR)).length) problems.push(`${door}: the task was paid while the hero was still hunting`);
      await leaveAt(db, H, U, h.sid, h.from + 6 * 60000);
      for (let i = 0; i < 3 && r && r.outcome === 'paid' && !r.ended; i++) r = await go(h.from + 7 * 60000);
      const s = await q(db, 'select ended_at, end_reason from public.hunt_sessions where id = $1', [h.sid]);
      if (!s[0] || !s[0].ended_at) { problems.push(`${door}: CONTROL: the hunt did not end (${r && r.outcome}/${r && r.reason})`); await db.query('rollback to savepoint tt3'); continue; }
      const rows = await payRows(db, U, CELLAR);
      if (rows.length !== 1) problems.push(`${door}: ${rows.length} tally_pay rows after the hero came home, want 1`);
      else {
        const p = rows[0];
        if (Number(p.gold) !== gold || p.gold_kind !== 'tally' || p.session_id !== h.sid || Number(p.purse) !== (await purse(db, U)))
          problems.push(`${door}: the payment row reads ${JSON.stringify(p)} (want ${gold} g, gold_kind tally, session ${h.sid})`);
        if (p.item_id !== 'apprentice_helmet' || p.qty !== 1) problems.push(`${door}: her pick was ${p.item_id} x${p.qty}, want the Cellar's light helm`);
        /* THE PURSE MOVED BY IT: the account's gold row before it states the purse this row's gold was added to. */
        const prev = await q(db, `select purse::text from public.player_ledger where user_id = $1 and coalesce(gold, 0) <> 0
                                   and id < (select id from public.player_ledger where user_id = $1 and intent = $2) order by id desc limit 1`, [U, 'tally_pay:' + CELLAR]);
        if (!prev[0] || Number(p.purse) !== Number(prev[0].purse) + gold) problems.push(`${door}: the purse went ${prev[0] && prev[0].purse} -> ${p.purse} on a ${gold} g payment`);
      }
      const claims = await q(db, 'select session_id, gold::int, item_id from public.hero_tally_claims where user_id = $1', [U]);
      if (claims.length !== 1 || claims[0].session_id !== h.sid) problems.push(`${door}: claims ${JSON.stringify(claims)}`);
      const inv = Number(await one(db, "select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'apprentice_helmet'), 0)::text", [U]));
      if (inv !== 1) problems.push(`${door}: the bag holds ${inv} Apprentice Hat, want 1`);
      if (await heldRow(db, U, CELLAR)) problems.push(`${door}: the paid task is still held (keep was off)`);
      await db.query('rollback to savepoint tt3');
    }
    return problems;
  },

  'TT-4': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 8, beforeEnter: async () => {
      const r = await take(db, U, CELLAR, 'light');
      if (!r || r.ok !== true) throw new Error('take refused: ' + JSON.stringify(r));
    } });
    const exec = H.makeExec(db);
    /* Three claims already paid today (rows the server itself would have written). */
    await db.query(`insert into public.hero_tally_claims (user_id, slot, day, ordinal, task_id, hunt_id, kills, gold, pick, item_id, qty)
                    select $1, 0, (now() at time zone 'UTC')::date, g, $2, 'mill_cellar', 1, 1, 'material', 'bones', 1 from generate_series(1, 3) g`, [U, CELLAR]);
    await finish(db, U, CELLAR);
    const g0 = await purse(db, U);
    const go = doorsOf(M, H, exec, U, h.sid).closed;
    await go(h.from + 2 * 60000);
    await leaveAt(db, H, U, h.sid, h.from + 3 * 60000);
    let r = null;
    for (let i = 0; i < 3; i++) { r = await go(h.from + 4 * 60000); if (!r || r.ended || r.outcome !== 'paid') break; }
    const ended = await one(db, 'select ended_at is not null from public.hunt_sessions where id = $1', [h.sid]);
    if (!ended) problems.push('CONTROL: the hunt did not end (' + (r && r.outcome) + '/' + (r && r.reason) + ')');
    if ((await payRows(db, U, CELLAR)).length) problems.push('a fourth task was paid on a day that had three');
    const sec = await one(db, "select public.hr_state_of($1, 0)->'tally'", [U]);
    if (!sec || sec.paid_today !== 3 || !(sec.held[0] && sec.held[0].done)) problems.push('the section after the cap reads ' + JSON.stringify(sec));
    const coins = Number(await one(db, `select coalesce(sum(gold), 0)::text from public.player_ledger where user_id = $1 and session_id = $2`, [U, h.sid]));
    if ((await purse(db, U)) !== g0 + coins) problems.push(`the purse moved past the hunt's own ${coins} g`);
    /* The next day: yesterday's three no longer count, and her visit pays. */
    await db.query('delete from public.hero_tally_claims where user_id = $1', [U]);
    await db.query(`insert into public.hero_tally_claims (user_id, slot, day, ordinal, task_id, hunt_id, kills, gold, pick, item_id, qty)
                    select $1, 0, (now() at time zone 'UTC')::date - 1, g, $2, 'mill_cellar', 1, 1, 'material', 'bones', 1 from generate_series(1, 3) g`, [U, CELLAR]);
    const v = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
    if (!v || v.ok !== true || !Array.isArray(v.paid) || v.paid.length !== 1) problems.push('the next day\'s visit answered ' + JSON.stringify(v));
    return problems;
  },

  'TT-5': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 8, beforeEnter: async () => {
      const r = await take(db, U, CELLAR, 'light');
      if (!r || r.ok !== true) throw new Error('take refused: ' + JSON.stringify(r));
    } });
    const exec = H.makeExec(db);
    await finish(db, U, CELLAR);
    await leaveAt(db, H, U, h.sid, h.from + 2 * 60000);
    /* The ending window, committed, then the SAME commit again (a retried request). Settled to 90 s first, so the
       ending window [90 s, 3 min] is one settle's span (hunt-settle.js HUNT_SETTLE_SPAN_MS, 2 min since lane/c-tick-span). */
    await H.settleTo(db, M, h.from + 90000);
    const plan = await M.HS.readHuntSettle({ exec, user: U, slot: 0, grounds: H.groundsOf(M), atMs: h.from + 3 * 60000 }, 'tick');
    if (!plan.answer && plan.toMs !== h.from + 3 * 60000) return [`CONTROL: the ending window ends at +${plan.toMs - h.from} ms, not +180000 (past the span?)`];
    if (plan.answer) return ['CONTROL: the read answered ' + JSON.stringify(plan.answer).slice(0, 200)];
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const first = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    const g1 = await purse(db, U);
    const again = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    if (!first || first.ok !== true) problems.push('CONTROL: the ending window was refused ' + JSON.stringify(first).slice(0, 300));
    if (!again || again.stage !== 'replayed') problems.push('the same commit again answered ' + JSON.stringify(again).slice(0, 200));
    if ((await payRows(db, U, CELLAR)).length !== 1 || (await purse(db, U)) !== g1) problems.push('the retried commit paid again');
    /* The town visit: a replayed key answers the same; a new key finds nothing more due. */
    const k = idem();
    const v1 = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [k]);
    const v2 = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [k]);
    const v3 = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
    if (!v1 || v1.ok !== true || JSON.stringify(v1.paid) !== JSON.stringify(v2 && v2.paid) || (v3 && v3.paid || []).length) problems.push('the visit retried: ' + JSON.stringify([v1, v2, v3]).slice(0, 300));
    if ((await payRows(db, U, CELLAR)).length !== 1 || (await purse(db, U)) !== g1) problems.push('a retried visit paid again');
    return problems;
  },

  'TT-5b': async (db, M, X) => forgedKm(db, M, X),

  'TT-6': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    await H.character(db, M, U, {});
    const t1 = await take(db, U, THICKET, 'medium');
    if (!t1 || t1.ok !== true) return ['CONTROL: take refused ' + JSON.stringify(t1)];
    await rpc(db, U, 'select public.hr_tally_set(0, $1, true, null, null, $2::uuid)', [THICKET, idem()]);
    const got = [];
    for (let i = 0; i < 6; i++) {
      if (i === 3) await db.query('delete from public.hero_tally_claims where user_id = $1', [U]);   // the next day
      await finish(db, U, THICKET);
      const v = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
      const item = v && v.paid && v.paid[0] && v.paid[0].item;
      got.push(item);
      /* Sold back out of the bag: the given record alone must keep it from coming again. */
      if (item && /helmet|body|pants|boots/.test(item)) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [U, item]);
    }
    const want = ['leather_helmet', 'leather_body', 'leather_pants', 'leather_boots', 'raw_wolf_meat', 'bones'];
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push('her picks at the Thicket (medium) were ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
    if (new Set(got.filter((x) => /leather/.test(String(x)))).size !== 4) problems.push('a piece came twice: ' + JSON.stringify(got));
    /* Her slot order is the hero's to set; a carried piece is skipped. */
    await db.query('delete from public.hero_tally_given where user_id = $1', [U]);
    await db.query('delete from public.hero_tally_claims where user_id = $1', [U]);
    const set = await rpc(db, U, 'select public.hr_tally_set(0, null, null, null, $1::text[], $2::uuid)', [['boots', 'pants', 'body', 'helmet', 'gloves', 'belt'], idem()]);
    if (!set || set.ok !== true) problems.push('the slot order was refused ' + JSON.stringify(set));
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'leather_boots', 1) on conflict (user_id, slot, item_id) do update set qty = 1", [U]);
    const pick = await one(db, 'select public.hr_tally_pick($1, 0, $2)', [U, THICKET]);
    if (!pick || pick.item !== 'leather_pants') problems.push('with her order boots-first and boots in the bag she would pick ' + JSON.stringify(pick) + ', want leather_pants');
    return problems;
  },

  'TT-7': async (db, M, X) => {
    const problems = [];
    const U = X.H.UIDS[0];
    await X.H.character(db, M, U, {});
    await take(db, U, CELLAR, 'heavy');
    await rpc(db, U, 'select public.hr_tally_set(0, $1, true, null, null, $2::uuid)', [CELLAR, idem()]);
    const before = await heldRow(db, U, CELLAR);
    await finish(db, U, CELLAR);
    let v = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
    const after = await heldRow(db, U, CELLAR);
    if (!v || !v.paid || v.paid.length !== 1) problems.push('CONTROL: the kept task was not paid ' + JSON.stringify(v));
    if (!after || after.kills !== 0 || after.done_at || after.place !== before.place || !after.keep) problems.push('a kept task after payment reads ' + JSON.stringify(after));
    await rpc(db, U, 'select public.hr_tally_set(0, $1, false, null, null, $2::uuid)', [CELLAR, idem()]);
    await finish(db, U, CELLAR);
    v = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
    if (await heldRow(db, U, CELLAR)) problems.push('a task with keep off is still held after it paid');
    return problems;
  },

  'TT-8': async (db, M, X) => {
    const problems = [];
    const [A, B] = X.H.UIDS;
    await X.H.character(db, M, A, {});
    await X.H.character(db, M, B, {});
    await take(db, A, CELLAR, 'light');
    await db.query('update public.hero_tally_tasks set kills = 7 where user_id = $1', [A]);
    const d = await rpc(db, B, 'select public.hr_tally_drop(0, $1, $2::uuid)', [CELLAR, idem()]);
    const s = await rpc(db, B, 'select public.hr_tally_set(0, $1, true, null, null, $2::uuid)', [CELLAR, idem()]);
    const a = await heldRow(db, A, CELLAR);
    if (!a || a.kills !== 7 || a.keep) problems.push('a stranger\'s drop / set reached A\'s task: ' + JSON.stringify({ a, d, s }));
    if (!d || d.error !== 'not_held' || !s || s.error !== 'not_held') problems.push('a stranger naming A\'s task answered ' + JSON.stringify({ d, s }));
    const args = await q(db, `select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p
                               where p.proname in ('hr_tally_view', 'hr_tally_accept', 'hr_tally_drop', 'hr_tally_set', 'hr_tally_collect')`);
    if (args.length !== 5 || args.some((r) => /p_user|p_target|p_uid/.test(r.a) || /\buuid\b/.test(r.a.replace('p_idem uuid', '')))) {
      problems.push('a tally verb names a target hero: ' + JSON.stringify(args));
    }
    await db.query('savepoint tt8');
    try {
      await db.query('set role authenticated');
      await asUser(db, A);
      await db.query("insert into public.hero_tally_tasks (user_id, slot, place, task_id, target) values ($1, 0, 3, $2, 1)", [A, THICKET]);
      problems.push('authenticated inserted a held task straight into hero_tally_tasks');
    } catch { /* refused: good */ } finally { await db.query('rollback to savepoint tt8'); await db.query('reset role'); }
    return problems;
  },

  'TT-9': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    const words = X.W.REFUSAL_WORDS;
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 4, beforeEnter: async () => {
      const w = await take(db, U, CELLAR, null);
      if (!w || w.error !== 'weight_needed') problems.push('a first take with no weight answered ' + JSON.stringify(w));
      for (const t of [CELLAR, THICKET, 'sewer_rat_king']) await take(db, U, t, 'light');
      const full = await take(db, U, 'glade_poachers', null);
      if (!full || full.error !== 'tally_full') problems.push('a fourth take answered ' + JSON.stringify(full));
      const unk = await take(db, U, 'no_such_task', null);
      if (!unk || unk.error !== 'unknown_task') problems.push('an unknown task answered ' + JSON.stringify(unk));
      const ord = await rpc(db, U, 'select public.hr_tally_set(0, null, null, null, $1::text[], $2::uuid)', [['helmet', 'helmet'], idem()]);
      if (!ord || ord.error !== 'bad_order') problems.push('a repeated slot order answered ' + JSON.stringify(ord));
      const nh = await rpc(db, U, 'select public.hr_tally_drop(0, $1, $2::uuid)', ['glade_poachers', idem()]);
      if (!nh || nh.error !== 'not_held') problems.push('dropping an unheld task answered ' + JSON.stringify(nh));
      await rpc(db, U, 'select public.hr_tally_drop(0, $1, $2::uuid)', ['sewer_rat_king', idem()]);
    } });
    void h;
    const town = await take(db, U, 'sewer_rat_king', null);
    if (!town || town.error !== 'tally_in_town') problems.push('a take while hunting answered ' + JSON.stringify(town));
    const pay = await rpc(db, U, 'select public.hr_tally_collect(0, $1::uuid)', [idem()]);
    if (!pay || pay.error !== 'tally_pays_in_town') problems.push('a visit while hunting answered ' + JSON.stringify(pay));
    for (const c of ['weight_needed', 'tally_full', 'tally_in_town', 'tally_pays_in_town', 'unknown_task', 'not_held', 'already_held']) {
      if (!words[c]) problems.push(`refusal ${c} has no words in src/data/refusal-words.js`);
    }
    return problems;
  },

  'TT-10': async (db, M, X) => {
    const problems = [];
    const U = X.H.UIDS[0];
    await X.H.character(db, M, U, {});
    await take(db, U, CELLAR, 'light');
    await take(db, U, THICKET, null);
    await db.query('update public.hero_tally_tasks set kills = 12 where user_id = $1 and task_id = $2', [U, THICKET]);
    const one1 = await one(db, "select public.hr_state_of($1, 0)->'tally'", [U]);
    const S = X.S;
    const a = S.tallyOf({ read: (k) => (k === 'tally' ? one1 : undefined) });
    const th = a && a.held.find((x) => x.task === THICKET);
    if (!a || a.held.length !== 2 || !th || th.kills !== 12 || S.tallyLine(th) !== 'Gray Wolves 12/200' || a.weight !== 'light') {
      problems.push('the reader of the real section reads ' + JSON.stringify(a) + ' / ' + (th && S.tallyLine(th)));
    }
    await rpc(db, U, 'select public.hr_tally_drop(0, $1, $2::uuid)', [CELLAR, idem()]);
    const two = await one(db, "select public.hr_state_of($1, 0)->'tally'", [U]);
    const b = S.tallyOf({ read: (k) => (k === 'tally' ? two : undefined) });
    if (!b || b.held.length !== 1 || b.held[0].task !== THICKET) problems.push('the next envelope did not REPLACE the tally: ' + JSON.stringify(b && b.held));
    if (S.tallyOf({ read: () => undefined }) !== null) problems.push('no section read as something');
    return problems;
  },

  /* THE HAPPY PATH, PLAYED: take a task in town, hunt it viewed (the player's door, each answer taken by the client's
     own CharacterSession), come home, be paid (one notice), reload (a fresh session from hr_load) — then the same
     hunt with the browser closed (the tick's door only), seen on the next load. */
  'TT-12': async (db, M, X) => {
    const problems = [];
    const H = X.H;
    const U = H.UIDS[0];
    const gold = await one(db, 'select gold::int from public.hr_tally_tasks where task_id = $1', [CELLAR]);
    const session = () => new X.CSN.CharacterSession({ slot: 0, uid: U, server: {}, now: () => 1e6, setTimer: () => null, clearTimer: () => {} });
    const load = async (cs) => cs._take(await rpc(db, U, 'select public.hr_load(0)'), 'load');
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 12, beforeEnter: async () => {
      const n = await rpc(db, U, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Tally Hunter', idem()]);
      if (!n || n.ok !== true) throw new Error('name refused: ' + JSON.stringify(n));
      const r = await take(db, U, CELLAR, 'light');
      if (!r || r.ok !== true) throw new Error('take refused: ' + JSON.stringify(r));
    } });
    const exec = H.makeExec(db);
    await db.query('savepoint tt12');
    for (const path of ['viewed', 'closed']) {
      const cs = session();
      const go = doorsOf(M, H, exec, U, h.sid)[path];
      const show = async (t) => { const v = await go(t); if (path === 'viewed' && v && v.body && v.body.ok) cs._take(v.body, 'settle'); return v; };
      if (path === 'closed' && !(await load(cs))) { problems.push('closed: CONTROL: the first load was refused ' + cs.lastVerdict); continue; }
      let v = await show(h.from + 3 * 60000);
      if (!v || v.outcome !== 'paid') { problems.push(`${path}: CONTROL: the first window answered ${v && v.outcome}/${v && v.reason}`); continue; }
      if (path === 'closed') await load(cs);
      const t1 = X.S.tallyOf(cs);
      const k1 = t1 && t1.held[0] ? t1.held[0].kills : null;
      const dbKills = (await heldRow(db, U, CELLAR) || {}).kills;
      if (!(k1 > 0) || k1 !== dbKills) problems.push(`${path}: the client shows ${k1} kills, the server holds ${dbKills}`);
      await db.query('update public.hero_tally_tasks set kills = target - 1 where user_id = $1 and task_id = $2', [U, CELLAR]);
      await show(h.from + 6 * 60000);
      await leaveAt(db, H, U, h.sid, h.from + 7 * 60000);
      for (let i = 0; i < 3 && v && v.outcome === 'paid' && !v.ended; i++) v = await show(h.from + 8 * 60000);
      const fresh = session();
      if (!(await load(fresh))) { problems.push(`${path}: the reload was refused ${fresh.lastVerdict}`); continue; }
      for (const [who, c] of path === 'viewed' ? [['the viewed client', cs], ['the reload', fresh]] : [['the reload', fresh]]) {
        const t = X.S.tallyOf(c);
        const paid = t && t.recent.find((p) => p.task === CELLAR);
        if (!t || t.held.length || !paid || paid.gold !== gold || paid.item !== 'apprentice_helmet') problems.push(`${path}: ${who} reads ${JSON.stringify(t)}`);
      }
      const bag = (fresh.read('inventory') || {}).apprentice_helmet;
      if (bag !== 1) problems.push(`${path}: the reloaded bag holds ${bag} Apprentice Hat`);
      /* ONE notice: the alert centre fires it once, and a second scan of the same envelope adds none. */
      const account = { viewed: 0, characters: () => [fresh], character: () => fresh, subscribe: () => () => {} };
      const ac = X.AL.createAlertCenter(account);
      const notes = ac.list().filter((a) => a.kind === 'tally');
      if (notes.length !== 1 || !/Tamsin paid .* for Giant Rats\./.test(notes[0].text)) problems.push(`${path}: the payment notices read ${JSON.stringify(notes)}`);
      ac.destroy();
      /* The next page (the residue remembers it): the same payment is no news. */
      const ac2 = X.AL.createAlertCenter(account);
      if (ac2.list().some((a) => a.kind === 'tally')) problems.push(`${path}: the same payment notified again on the next page`);
      ac2.destroy();
      await db.query('rollback to savepoint tt12');
    }
    return problems;
  },

  'TT-11': async (whole, M, X) => {
    /* AT THE FILES' OWN POSITION (the replay-scope rule): a LATER file may legitimately restate a body these two pin
       (2026-12-25-frame-push-revive.sql splices hr_hunt_apply_instance), and then a re-apply on the WHOLE chain is
       refused by 12-23's own §0 pin, which is right. So the second apply is judged on the chain booted to 12-23,
       where nothing newer has moved anything; the whole chain is used only when 12-23 is still its last file. */
    const { bootReplay, chainFiles } = await import('./schema-replay.mjs');
    const order = (await chainFiles()).map(([n]) => n);
    const db = order[order.length - 1] === MIG ? whole : (await bootReplay({ upTo: MIG })).db;
    const snap = async () => one(db, `select jsonb_build_object(
      'fns', (select jsonb_object_agg(p.oid::regprocedure::text, md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), ''))
                from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'hr_tally%' or p.proname in ('hr_hunt_apply_instance', 'hr_gold_kind'))),
      'cons', (select jsonb_object_agg(conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)) from pg_constraint
                where conrelid::regclass::text in ('hero_tally', 'hero_tally_tasks', 'hero_tally_given', 'hero_tally_claims', 'hr_tally_tasks',
                  'hr_tally_pieces', 'hr_tally_materials', 'hr_tally_config') or conname = 'player_ledger_gold_kind'),
      'rows', jsonb_build_array((select jsonb_agg(t order by task_id) from public.hr_tally_tasks t), (select jsonb_agg(p order by hunt_id, item_id) from public.hr_tally_pieces p),
        (select jsonb_agg(m order by task_id, ord) from public.hr_tally_materials m), (select jsonb_agg(c) from public.hr_tally_config c),
        (select jsonb_agg(s order by key) from public.hr_state_sections s where s.fn like 'hr_tally%'),
        (select jsonb_agg(b order by proname) from (select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname like 'hr_tally%') b)),
      'pol', (select jsonb_agg(policyname order by tablename, policyname) from pg_policies where tablename like 'hero_tally%'),
      'trg', (select jsonb_agg(tgname order by tgname) from pg_trigger where tgname like 'hr_tally%'))`);
    const a = await snap();
    for (const f of [CAT, MIG]) {
      const sql = (X.patchFile && X.patchFile[0] === f ? X.patchFile[1] : readFileSync(join(X.H.ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
      await db.exec(sql);
    }
    const b = await snap();
    return JSON.stringify(a) === JSON.stringify(b) ? [] : ['a second apply moved the server: ' + firstDiff(JSON.stringify(a), JSON.stringify(b))];
  },
};

function firstDiff(a, b) {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}: …${a.slice(Math.max(0, i - 120), i + 80)}… vs …${b.slice(Math.max(0, i - 120), i + 80)}…`;
}

/* A FORGED PROPOSAL: the ending commit's journal claims more rats than the window's kills. Refused, nothing moves. */
async function forgedKm(db, M, X) {
  const H = X.H;
  await db.query('savepoint forged');
  try {
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 6, beforeEnter: async () => { await take(db, H.UIDS[0], CELLAR, 'light'); } });
    const exec = H.makeExec(db);
    const plan = await M.HS.readHuntSettle({ exec, user: H.UIDS[0], slot: 0, grounds: H.groundsOf(M), atMs: h.from + 3 * 60000 }, 'tick');
    if (plan.answer) return ['CONTROL: the forged-km read answered ' + JSON.stringify(plan.answer).slice(0, 200)];
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const meta = p.commit.members[0].delta.journal.meta;
    meta.km = { ...(meta.km || {}), rat: Number(meta.kills || 0) + 50 };
    const r = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    const row = await heldRow(db, H.UIDS[0], CELLAR);
    const out = [];
    if (r && r.ok === true) out.push('a kills-by-monster 50 past the window\'s kills was accepted');
    if (!row || row.kills !== 0) out.push('the forged rats moved the task to ' + (row && row.kills));
    return out;
  } finally { await db.query('rollback to savepoint forged'); }
}

async function loadReaders(root) {
  return {
    T: await import(pathToFileURL(join(root, 'src', 'data', 'tally-tasks.js')).href),
    S: await import(pathToFileURL(join(root, 'src', 'session', 'tally-sections.js')).href),
    W: await import(pathToFileURL(join(root, 'src', 'data', 'refusal-words.js')).href),
    CSN: await import(pathToFileURL(join(root, 'src', 'session', 'character-session.js')).href),
    AL: await import(pathToFileURL(join(root, 'src', 'shell', 'alerts.js')).href),
  };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, M, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, ...rest] = mutant.db;
      const pairs = Array.isArray(rest[0]) ? rest[0] : [[rest[0], rest[1]]];
      let def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      for (const [find, repl] of pairs) {
        if (def.split(find).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${find.slice(0, 80)}`), { harness: true });
        def = def.replace(find, () => repl);
      }
      await db.exec(def);
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, M, X);
  } finally { await db.query('rollback'); }
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  const G = await import('../tools/gen-tally-tasks.mjs');
  const list = process.argv.includes('--list');
  if (list) {
    for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`);
    for (const [id, m] of Object.entries(SQL_MUTANTS)) console.log(`${id}  [${MIG} §8]  ${m.why}`);
    return;
  }
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  const X = { H, G, ...(await loadReaders(H.ROOT)) };
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  const selftest = process.argv.includes('--selftest') || !!pick;
  if (!selftest) {
    let bad = 0;
    const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    for (const id of Object.keys(ARMS).filter((k) => !only || only.split(',').includes(k))) {
      let p;
      try { p = await runArm(db, M, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 500)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    const ran = Object.keys(ARMS).filter((k) => !only || only.split(',').includes(k)).length;
    console.log(bad ? `tally-tasks: ${bad} arm(s) red` : `tally-tasks: all ${ran} arms green`);
    process.exit(bad ? 1 : 0);
  }
  let missed = 0;
  if (pick && !MUTANTS[pick] && !SQL_MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  const ids = pick ? (MUTANTS[pick] ? [pick] : []) : Object.keys(MUTANTS);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p; let XX = X;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-tt-'));
        try {
          cpSync(join(H.ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
          const f = join(dir, m.js[0]);
          let src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
          for (const [find, repl] of m.js[1]) {
            if (src.split(find).length !== 2) throw Object.assign(new Error('js mutant anchor not found once: ' + find.slice(0, 60)), { harness: true });
            src = src.replace(find, () => repl);
          }
          writeFileSync(f, src);
          XX = { ...X, ...(await loadReaders(dir)) };
          p = await runArm(db, M, XX, m.arm, null);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } else if (m.file) {
        const text = readFileSync(join(H.ROOT, 'supabase', 'migrations', m.file[0]), 'utf8').replace(/\r\n/g, '\n');
        if (text.split(m.file[1]).length !== 2) throw new Error('file mutant anchor not found once');
        p = await runArm(db, M, { ...X, patchFile: [m.file[0], text.replace(m.file[1], () => m.file[2])] }, m.arm, null);
      } else {
        p = await runArm(db, M, X, m.arm, m);
      }
    } catch (e) {
      if (e && e.harness) { console.error(`✗ ${id}: harness: ${e.message}`); missed++; continue; }
      p = ['threw: ' + String(e && e.message || e).slice(0, 200)];
    }
    if (p.length) console.log(`✓ ${m.arm} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.arm} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  /* The migration's own §8: each planted body must make the file REFUSE to apply (its VERIFY, not a harness slip). */
  const sqlIds = pick ? Object.keys(SQL_MUTANTS).filter((k) => k === pick) : Object.keys(SQL_MUTANTS);
  for (const id of sqlIds) {
    const m = SQL_MUTANTS[id];
    let refused = null;
    try { await bootReplay({ patches: new Map([[MIG, m.pairs || [[m.find, m.repl]]]]), upTo: MIG }); } catch (e) { refused = e; }
    /* Its own VERIFY, or (the cap) the claim table's ordinal CHECK — never a syntax slip in the plant. */
    const said = String(refused && refused.message);
    if (refused && !refused.harness && /VERIFY\(|hero_tally_claims_ordinal_check/.test(said) && !/syntax error/.test(said)) {
      console.log(`✓ the §8 of ${MIG} refuses ${id}: ${m.why} (${(said.match(/VERIFY\([a-z]\)[^\n]{0,60}|hero_tally_claims_ordinal_check/) || [''])[0]})`);
    }
    else { console.error(`✗ ${MIG} applied ${id} (${m.why})${refused ? ': ' + String(refused.message).slice(0, 200) : ''}`); missed++; }
  }
  const total = ids.length + sqlIds.length;
  console.log(missed ? `tally-tasks --selftest: ${missed} of ${total} mutant(s) survived` : `tally-tasks --selftest: all ${total} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
