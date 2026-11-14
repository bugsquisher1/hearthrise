#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-shows-race.mjs — WHAT GOLD BUYS IN HAVORA, ON REAL BACKENDS: THE RACES PGLITE CAN'T RUN.
//
//   HR_PG_PORT=<free port> HR_PG_DATA=<scratch dir> node tests/town-shows-race.mjs [--mutate] [--only=R1,R3]
//
// PostgreSQL 17, real connections, each press its own transaction as PostgREST sends it. Each race is pinned open by a gate: a connection that holds the lock the presses meet,
// until pg_stat_activity shows each press blocked there, so the interleaving is the one named, every run.
//   R1  two heroes on one account press together at the SAME price (gate: the purse): one pays it, the other is told the next. Without hr:sink:<uid> both pay the first price
//   R2  two heroes press together, the second at the next price (gate: the purse): the first pays the first price, the second pays the next
//   R3  two accounts race for the Hearth's last booking (gate: the Hearth's key): one is booked, the other is refused show_busy and every trace of its charge rolls back
//   R4  a named fuel and a powder at once, both orders, on one account: both land, no deadlock; the powder keeps every second. FOUND BY THIS RACE: hr_hearth_burn held the Hearth's
//       key over its hr_apply, so the burn waited on a row the powder held while the powder waited on the key (2027-02-27-town-shows.sql §7 moves the key after the charge)
//   R5  two accounts race for the Crier's 30 s (gate: the Crier's key): one line; the other refused crier_busy and charged nothing
//   R6  one key pressed twice at once: one charge, one row, one line
//   THE TOWN WORKS (2027-03-04-town-works.sql):
//   R7  two heroes on one account press together for more than the day holds (gate: the purse): the account gives 25,000 and no more; the other is told what's left and charged nothing
//   R8  two accounts race for what's left on the project (gate: the project's key): it fills exactly; the other is refused works_short and every trace of its charge rolls back
//   R9  two accounts' gifts cross one stage at once (gate: the project's key): the town says it once, and the total is the sum of both
//   R10 one gift's key pressed twice at once: one charge, one row, one gift
// CI: smoke.yml's pg17 job, plain + --mutate (.github/actions/postgres-17, since 2026-11-14). Never touches production or the machine's own PostgreSQL service: it starts tools/pg-replay.mjs's
// scratch cluster. HR_PG_TEMPLATE = an existing chain database to clone, this lane's files applied over it, instead of the build of the whole chain.
// mutant-anchors: supabase/migrations/2027-02-27-town-shows.sql, supabase/migrations/2027-03-04-town-works.sql
// Exit: 0 green (--mutate: every mutant caught) · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootPg, attachPg } from '../tools/pg-replay.mjs';
import { ownHeroSlots } from './_slots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const TEMPLATE = process.env.HR_PG_TEMPLATE || undefined;
const LANE_FILES = ['2027-02-27-gold-sinks-catalogue.generated.sql', '2027-02-27-gold-sinks-seams.sql', '2027-02-27-gold-given.sql', '2027-02-27-town-crier.sql', '2027-02-27-town-shows.sql', '2027-03-04-town-works-catalogue.generated.sql', '2027-03-04-town-works.sql'];
const MAP = 'town_common';
const SHOW = 'public.hr_town_show(integer,text,bigint,uuid)';
const CRY = 'public.hr_crier_send(integer,text,bigint,uuid)';
const BURN = 'public.hr_hearth_burn(integer,text,uuid)';
const GIVE = 'public.hr_town_works_give(integer,text,bigint,uuid)';
const idem = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let serial = 0;
const newUser = () => '000000c0-0000-4000-a000-0000901e' + String(++serial).padStart(4, '0');

/* THE RATE BUCKET'S ROW ALSO SERIALIZES ONE VERB ACROSS HEROES (hr_rate_ok's upsert holds it to commit), by accident, not by contract: a bucket can be moved or dropped. So the
   sink key's own proof takes the bucket out with it, and a control proves the key alone holds the race. */
const RATE = "  if not public.hr_rate_ok(v_uid, 'town_show', v_rule.per_minute, interval '1 minute') then\n    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;\n";
const WORKS_RATE = "  if not public.hr_rate_ok(v_uid, 'town_works', v_p.per_minute, interval '1 minute') then\n    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;\n";
const CONTROLS = {
  works_key_alone: { race: 'R7', why: 'with no rate bucket in the way, hr:sink:<uid> alone holds the day\'s cap', fn: GIVE, find: WORKS_RATE, repl: '' },
  the_key_alone: { race: 'R1', why: 'with no rate bucket in the way, hr:sink:<uid> alone holds the climb', fn: SHOW, find: RATE, repl: '' },
  the_key_alone_next_price: { race: 'R2', why: 'with no rate bucket in the way, hr:sink:<uid> alone pays the next price', fn: SHOW, find: RATE, repl: '' },
};
const MUTANTS = {
  sink_lock_gone: { race: 'R1', why: 'two heroes both read the count before either pays', fn: SHOW, find: RATE, repl: '', find2: '  perform public.hr_sink_lock(v_uid);\n', repl2: '' },
  recheck_gone: { race: 'R3', why: 'the queue is never read again under the Hearth\'s key, so both are booked past the cap', fn: SHOW,
    find: "    if v_free > now() + make_interval(secs => v_rule.book_s) then raise exception using errcode = 'HR938', message = 'show_busy'; end if;\n", repl: '' },
  crier_recheck_gone: { race: 'R5', why: 'the gap is never read again under the Crier\'s key, so two lines go out', fn: CRY,
    find: "    if v_wait > 0 then raise exception using errcode = 'HR939', message = 'crier_busy'; end if;\n", repl: '' },
  works_sink_lock_gone: { race: 'R7', why: 'two heroes both read what\'s left before either pays, so the account gives past its cap', fn: GIVE, find: WORKS_RATE, repl: '', find2: '  perform public.hr_sink_lock(v_uid);\n', repl2: '' },
  works_recheck_gone: { race: 'R8', why: 'what\'s left is never read again under the project\'s key, so the project overfills', fn: GIVE,
    find: "    if v_fault is not null then raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;\n", repl: '' },
  works_race_charges: { race: 'R8', why: 'a gift that lost the race keeps its charge', fn: GIVE,
    find: "raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;", repl: "return v_fault || jsonb_build_object('ok', false, 'project', p_project); end if;" },
  works_stale_total: { race: 'R9', why: 'the total isn\'t read again under the key: the second gift overwrites the first and the stage speaks twice', fn: GIVE,
    find: "    v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);\n    v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);\n    if v_fault is not null then raise", repl: '    if v_fault is not null then raise' },
  works_second_replay_gone: { race: 'R10', why: 'a second press of one key that waited on the hero\'s lock is never answered from the first', fn: GIVE,
    find: "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;\n  select version into v_ver", repl: '  select version into v_ver' },
  burn_holds_the_key: { race: 'R4', why: 'the burn holds the Hearth\'s key over its charge, against a powder holding its row and waiting on the key', fn: BURN,
    find: "    -- THE BURN: the item and the XP, journalled, exactly once on this key\n", repl: "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n" },
};

async function world(plant) {
  const { db, name } = await bootPg({ template: TEMPLATE, log: (s) => console.log(s) });
  if (TEMPLATE) for (const f of LANE_FILES) await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n'));
  if (plant) {
    const def = String((await db.query('select pg_get_functiondef($1::regprocedure) d', [plant.fn])).rows[0].d).split(String.fromCharCode(13)).join('');
    if (def.split(plant.find).length !== 2) throw Object.assign(new Error('mutant anchor not found once: ' + plant.find.slice(0, 80)), { harness: true });
    let body = def.replace(plant.find, () => plant.repl);
    if (plant.find2) {
      if (body.split(plant.find2).length !== 2) throw Object.assign(new Error('mutant anchor not found once: ' + plant.find2.slice(0, 80)), { harness: true });
      body = body.replace(plant.find2, () => plant.repl2);
    }
    await db.exec(body);
  }
  const conns = [];
  const open = async () => { const c = await attachPg(name); c.pid = (await c.query('select pg_backend_pid() as p')).rows[0].p; conns.push(c); return c; };
  const w = { db, name, conns };
  w.gate = await open(); w.watch = await open(); w.A = await open(); w.B = await open();
  w.close = async () => { for (const c of conns) await c.close().catch(() => {}); await db.close().catch(() => {}); };
  return w;
}

/* One client intent, as PostgREST sends it: its own transaction, `authenticated`, the claim local to it. */
async function asClient(c, uid, sql, params) {
  await c.exec('begin');
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
      [uid, JSON.stringify({ sub: uid, role: 'authenticated' }), JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (parseInt(uid.slice(-2), 16) % 200 + 10) })]);
    await c.exec('set local role authenticated');
    const r = await c.query(sql, params);
    await c.exec('commit');
    return Object.values(r.rows[0])[0];
  } catch (e) { await c.exec('rollback').catch(() => {}); throw e; }
}
const press = (c, uid, slot, show, price, key = idem()) => asClient(c, uid, 'select public.hr_town_show($1::int, $2, $3::bigint, $4::uuid) r', [slot, show, price, key]);
const gift = (c, uid, slot, amount, key = idem()) => asClient(c, uid, 'select public.hr_town_works_give($1::int, $2, $3::bigint, $4::uuid) r', [slot, 'weighhouse', amount, key]);
const cry = (c, uid, slot, body, price, key = idem()) => asClient(c, uid, 'select public.hr_crier_send($1::int, $2, $3::bigint, $4::uuid) r', [slot, body, price, key]);

async function account(w, heroes) {
  const u = newUser();
  await w.db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
  await w.db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-shows-race') on conflict (user_id) do nothing`, [u]);
  const dye = (await w.db.query('select min(idx) m from public.hr_outfit_dyes')).rows[0].m;
  for (let s = 0; s < heroes; s++) {
    /* an account starts with one hero slot (2027-03-25-hero-slots-one.sql): the second is owned as a buyer owns it, after
       slot 0's hero exists (tests/_slots.mjs). This harness ran by hand only and answered slot_not_owned from that file on. */
    if (s === 1) await ownHeroSlots((sql, params) => w.db.query(sql, params), u, heroes - 1);
    const r = await asClient(w.watch, u, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid) r', [s, 'Racer' + 'abcdefghijklmnopqrstuvwxyz'[serial % 26] + 'abcdefghijklmnopqrstuvwxyz'[s], JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
    if (!r || r.ok !== true) throw Object.assign(new Error('hr_create_hero: ' + JSON.stringify(r)), { harness: true });
  }
  await w.db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [u]);
  await w.db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(12) where user_id = $1', [u]);
  return u;
}
const purse = async (w, u) => Number((await w.db.query('select gold from public.account_wallet where user_id = $1', [u])).rows[0].gold);
const shopRows = async (w, u) => (await w.db.query("select slot, intent from public.player_ledger where user_id = $1 and kind = 'shop' order by at, intent", [u])).rows;
/* until pg_stat_activity shows this press blocked on a lock, or it answered first */
async function blocked(w, c, promise, ms = 15000) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (done) return false;
    const r = (await w.watch.query('select wait_event_type t from pg_stat_activity where pid = $1', [c.pid])).rows[0];
    if (r && r.t === 'Lock') return true;
    await sleep(25);
  }
  throw Object.assign(new Error('a press neither blocked nor answered within ' + ms + ' ms'), { harness: true });
}
const holdPurse = async (w, u) => { await w.gate.exec('begin'); await w.gate.query('select 1 from public.account_wallet where user_id = $1 for update', [u]); };
const holdKey = async (w, key) => { await w.gate.exec('begin'); await w.gate.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [key]); };
const open = (w) => w.gate.exec('commit');
const clearTown = async (w) => {
  await w.db.query('delete from public.town_shows');
  await w.db.query('delete from public.hearth_flames');
  await w.db.query('delete from public.town_works_gifts');
  await w.db.query('delete from public.town_works_totals');
  await w.db.exec('alter table public.chat_messages disable trigger hr_chat_immutable');
  await w.db.query("delete from public.chat_messages where crier or from_name = 'The Weighhouse'");
  await w.db.exec('alter table public.chat_messages enable trigger hr_chat_immutable');
};

const RACES = {
  R1: async (w) => {
    const out = [];
    await clearTown(w);
    const u = await account(w, 2);
    await holdPurse(w, u);
    const p0 = press(w.A, u, 0, 'cinnabar', 2000);
    const b0 = await blocked(w, w.A, p0);
    const p1 = press(w.B, u, 1, 'borax', 2000);
    const b1 = await blocked(w, w.B, p1);
    await open(w);
    const [r0, r1] = await Promise.all([p0, p1]);
    if (!b0 || !b1) out.push('the race never opened: ' + JSON.stringify({ b0, b1, r0, r1 }));
    const oks = [r0, r1].filter((r) => r.ok === true);
    const refused = [r0, r1].filter((r) => r.error === 'quote_changed' && Number(r.price) === 4000);
    if (oks.length !== 1 || refused.length !== 1) out.push('at one price, two heroes answered ' + JSON.stringify([r0, r1]));
    if ((await purse(w, u)) !== 998000) out.push('the purse reads ' + (await purse(w, u)));
    if ((await shopRows(w, u)).length !== 1) out.push('the journal reads ' + JSON.stringify(await shopRows(w, u)));
    return out;
  },
  R2: async (w) => {
    const out = [];
    await clearTown(w);
    const u = await account(w, 2);
    await holdPurse(w, u);
    const p0 = press(w.A, u, 0, 'cinnabar', 2000);
    const b0 = await blocked(w, w.A, p0);
    const p1 = press(w.B, u, 1, 'borax', 4000);
    const b1 = await blocked(w, w.B, p1);
    await open(w);
    const [r0, r1] = await Promise.all([p0, p1]);
    if (!b0 || !b1) out.push('the race never opened: ' + JSON.stringify({ b0, b1, r0, r1 }));
    if (r0.ok !== true || Number(r0.price) !== 2000 || r0.n !== 1) out.push('the first hero answered ' + JSON.stringify(r0));
    if (r1.ok !== true || Number(r1.price) !== 4000 || r1.n !== 2) out.push('the second hero answered ' + JSON.stringify(r1));
    if ((await purse(w, u)) !== 994000) out.push('the purse reads ' + (await purse(w, u)));
    const rows = await shopRows(w, u);
    if (rows.length !== 2 || !rows.some((x) => x.slot === 0 && x.intent === 'town_show:cinnabar:2000') || !rows.some((x) => x.slot === 1 && x.intent === 'town_show:borax:4000')) out.push('the journal reads ' + JSON.stringify(rows));
    return out;
  },
  R3: async (w) => {
    const out = [];
    await clearTown(w);
    const [a, b, filler] = [await account(w, 1), await account(w, 1), await account(w, 1)];
    /* the queue has room for exactly one more: booked to 280 s of the 300 */
    await w.db.query("insert into public.town_shows (map_id, sink_id, show_id, user_id, slot, price, starts_at, ends_at) values ($1, 'powder', 'borax', $2, 0, 1, now(), now() + interval '280 seconds')", [MAP, filler]);
    await holdKey(w, 'hr:hearth:' + MAP);
    const pa = press(w.A, a, 0, 'cinnabar', 2000);
    const ba = await blocked(w, w.A, pa);
    const pb = press(w.B, b, 0, 'quicklime', 2000);
    const bb = await blocked(w, w.B, pb);
    await open(w);
    const [ra, rb] = await Promise.all([pa, pb]);
    if (!ba || !bb) out.push('the race never opened: ' + JSON.stringify({ ba, bb, ra, rb }));
    const won = ra.ok === true ? a : b, lost = ra.ok === true ? b : a;
    const answers = [ra, rb];
    if (answers.filter((r) => r.ok === true).length !== 1 || answers.filter((r) => r.error === 'show_busy').length !== 1) out.push('the race for the last booking answered ' + JSON.stringify(answers));
    if ((await purse(w, won)) !== 998000) out.push('the winner\'s purse reads ' + (await purse(w, won)));
    if ((await purse(w, lost)) !== 1000000) out.push('the loser was charged: ' + (await purse(w, lost)));
    if ((await shopRows(w, lost)).length) out.push('the loser was journalled');
    if (Number((await w.db.query('select count(*) n from public.player_intents where user_id = $1', [lost])).rows[0].n) > 1) out.push('the loser spent a key');
    if (Number((await w.db.query('select count(*) n from public.town_shows where user_id = $1', [lost])).rows[0].n)) out.push('the loser was booked');
    if (Number((await w.db.query('select count(*) n from public.account_gold_given where user_id = $1', [lost])).rows[0].n)) out.push('the loser counted on the board');
    if (Number((await w.db.query('select count(*) n from public.chat_messages where from_id = $1', [lost])).rows[0].n)) out.push('the loser posted a line');
    return out;
  },
  R4: async (w) => {
    const out = [];
    for (const first of ['powder', 'named']) {
      await clearTown(w);
      const u = await account(w, 2);
      await w.db.query("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 1, 'inner_flame', 50000000) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp", [u]);
      await w.db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 1, 'den_knot', 2) on conflict (user_id, slot, item_id) do update set qty = excluded.qty", [u]);
      /* the powder holds the purse and waits on the Hearth's key; the named fuel holds that key and, if it took a purse too, would wait on this one: a deadlock */
      await holdKey(w, 'hr:hearth:' + MAP);
      const powder = () => press(w.A, u, 0, 'cinnabar', 2000);
      const named = () => asClient(w.B, u, 'select public.hr_hearth_burn(1, $1, $2::uuid) r', ['den_knot', idem()]);
      const p1 = first === 'powder' ? powder() : named();
      await blocked(w, first === 'powder' ? w.A : w.B, p1);
      const p2 = first === 'powder' ? named() : powder();
      await blocked(w, first === 'powder' ? w.B : w.A, p2);
      await open(w);
      const settled = await Promise.race([Promise.allSettled([p1, p2]), sleep(30000).then(() => null)]);
      if (!settled) { out.push(first + ' first: the two never finished'); continue; }
      const [a1, a2] = settled;
      const dead = settled.filter((s) => s.status === 'rejected').map((s) => String(s.reason && s.reason.message).slice(0, 120) + ' | ' + String(s.reason && s.reason.detail).slice(0, 400) + ' | ' + String(s.reason && s.reason.where).slice(0, 500));
      if (dead.length) { out.push(first + ' first: ' + dead.join('; ')); continue; }
      const [rp, rn] = first === 'powder' ? [a1.value, a2.value] : [a2.value, a1.value];
      if (rp.ok !== true || rn.ok !== true) out.push(first + ' first: ' + JSON.stringify({ rp, rn }));
      const row = (await w.db.query("select extract(epoch from starts_at) * 1000 s, extract(epoch from ends_at) * 1000 e from public.town_shows where user_id = $1", [u])).rows[0];
      const flame = (await w.db.query('select extract(epoch from starts_at) * 1000 s, extract(epoch from ends_at) * 1000 e from public.hearth_flames where user_id = $1', [u])).rows[0];
      const overlap = Math.max(0, Math.min(Number(row.e), Number(flame.e)) - Math.max(Number(row.s), Number(flame.s)));
      const shown = (Number(row.e) - Number(row.s) - overlap) / 1000;
      if (Math.abs(shown - 30) > 0.5) out.push(`${first} first: the powder shows for ${shown} s of its 30`);
    }
    return out;
  },
  R5: async (w) => {
    const out = [];
    await clearTown(w);
    const [a, b] = [await account(w, 1), await account(w, 1)];
    await holdKey(w, 'hr:crier');
    const pa = cry(w.A, a, 0, 'selling rat tails', 1000);
    const ba = await blocked(w, w.A, pa);
    const pb = cry(w.B, b, 0, 'buying rat tails', 1000);
    const bb = await blocked(w, w.B, pb);
    await open(w);
    const [ra, rb] = await Promise.all([pa, pb]);
    if (!ba || !bb) out.push('the race never opened: ' + JSON.stringify({ ba, bb, ra, rb }));
    const answers = [ra, rb];
    if (answers.filter((r) => r.ok === true).length !== 1 || answers.filter((r) => r.error === 'crier_busy').length !== 1) out.push('the race for the Crier answered ' + JSON.stringify(answers));
    const lost = ra.ok === true ? b : a;
    if ((await purse(w, lost)) !== 1000000) out.push('the loser was charged: ' + (await purse(w, lost)));
    if ((await shopRows(w, lost)).length) out.push('the loser was journalled');
    if (Number((await w.db.query('select count(*) n from public.chat_messages where crier')).rows[0].n) !== 1) out.push('two lines went out');
    return out;
  },
  R6: async (w) => {
    const out = [];
    await clearTown(w);
    const u = await account(w, 1);
    const key = idem();
    await holdPurse(w, u);
    const p0 = press(w.A, u, 0, 'cinnabar', 2000, key);
    await blocked(w, w.A, p0);
    const p1 = press(w.B, u, 0, 'cinnabar', 2000, key);
    await blocked(w, w.B, p1);
    await open(w);
    const [r0, r1] = await Promise.all([p0, p1]);
    if (r0.ok !== true || r1.ok !== true) out.push('one key twice answered ' + JSON.stringify([r0, r1]));
    if ((await purse(w, u)) !== 998000) out.push('one key twice left the purse at ' + (await purse(w, u)));
    if ((await shopRows(w, u)).length !== 1) out.push('one key twice journalled ' + JSON.stringify(await shopRows(w, u)));
    if (Number((await w.db.query('select count(*) n from public.town_shows where user_id = $1', [u])).rows[0].n) !== 1) out.push('one key twice booked twice');
    return out;
  },
  /* THE TOWN WORKS */
  R7: async (w) => {
    const out = [];
    await clearTown(w);
    const u = await account(w, 2);
    await holdPurse(w, u);
    const p0 = gift(w.A, u, 0, 15000);
    const b0 = await blocked(w, w.A, p0);
    const p1 = gift(w.B, u, 1, 15000);
    const b1 = await blocked(w, w.B, p1);
    await open(w);
    const [r0, r1] = await Promise.all([p0, p1]);
    if (!b0 || !b1) out.push('the race never opened: ' + JSON.stringify({ b0, b1, r0, r1 }));
    const oks = [r0, r1].filter((r) => r.ok === true);
    const refused = [r0, r1].filter((r) => r.error === 'works_over' && Number(r.left) === 10000);
    if (oks.length !== 1 || refused.length !== 1) out.push('two heroes over the cap answered ' + JSON.stringify([r0, r1]));
    if ((await purse(w, u)) !== 985000) out.push('the purse reads ' + (await purse(w, u)));
    if ((await shopRows(w, u)).length !== 1) out.push('the journal reads ' + JSON.stringify(await shopRows(w, u)));
    const given = (await w.db.query('select coalesce(sum(day_gold), 0) n from public.town_works_gifts where user_id = $1', [u])).rows[0].n;
    if (Number(given) !== 15000) out.push('the account gave ' + given + ' today');
    return out;
  },
  R8: async (w) => {
    const out = [];
    await clearTown(w);
    const [a, b] = [await account(w, 1), await account(w, 1)];
    /* the project has room for one of these two, not both */
    await w.db.query("insert into public.town_works_totals (project_id, total) values ('weighhouse', 999000)");
    await holdKey(w, 'hr:works:weighhouse');
    const pa = gift(w.A, a, 0, 1000);
    const ba = await blocked(w, w.A, pa);
    const pb = gift(w.B, b, 0, 1000);
    const bb = await blocked(w, w.B, pb);
    await open(w);
    const [ra, rb] = await Promise.all([pa, pb]);
    if (!ba || !bb) out.push('the race never opened: ' + JSON.stringify({ ba, bb, ra, rb }));
    const answers = [ra, rb];
    if (answers.filter((r) => r.ok === true).length !== 1 || answers.filter((r) => r.error === 'works_done').length !== 1) out.push('the race for the last gift answered ' + JSON.stringify(answers));
    const total = Number((await w.db.query("select total from public.town_works_totals where project_id = 'weighhouse'")).rows[0].total);
    if (total !== 1000000) out.push('the project reads ' + total);
    const won = ra.ok === true ? a : b, lost = ra.ok === true ? b : a;
    if ((await purse(w, won)) !== 999000) out.push('the winner\'s purse reads ' + (await purse(w, won)));
    if ((await purse(w, lost)) !== 1000000) out.push('the loser was charged: ' + (await purse(w, lost)));
    if ((await shopRows(w, lost)).length) out.push('the loser was journalled');
    if (Number((await w.db.query('select count(*) n from public.player_intents where user_id = $1', [lost])).rows[0].n) > 1) out.push('the loser spent a key');
    if (Number((await w.db.query('select count(*) n from public.town_works_gifts where user_id = $1', [lost])).rows[0].n)) out.push('the loser wrote a gift');
    if (Number((await w.db.query('select count(*) n from public.account_gold_given where user_id = $1', [lost])).rows[0].n)) out.push('the loser counted on the board');
    const said = (await w.db.query("select body from public.chat_messages where from_name = 'The Weighhouse'")).rows.map((r) => r.body);
    if (said.join() !== 'is finished.') out.push('the finish said ' + said);
    return out;
  },
  R9: async (w) => {
    const out = [];
    await clearTown(w);
    const [a, b] = [await account(w, 1), await account(w, 1)];
    /* each gift alone crosses 100,000: only the first to hold the key does */
    await w.db.query("insert into public.town_works_totals (project_id, total) values ('weighhouse', 99500)");
    await holdKey(w, 'hr:works:weighhouse');
    const pa = gift(w.A, a, 0, 1000);
    const ba = await blocked(w, w.A, pa);
    const pb = gift(w.B, b, 0, 1000);
    const bb = await blocked(w, w.B, pb);
    await open(w);
    const [ra, rb] = await Promise.all([pa, pb]);
    if (!ba || !bb) out.push('the race never opened: ' + JSON.stringify({ ba, bb, ra, rb }));
    if (ra.ok !== true || rb.ok !== true) out.push('the two gifts answered ' + JSON.stringify([ra, rb]));
    const total = Number((await w.db.query("select total from public.town_works_totals where project_id = 'weighhouse'")).rows[0].total);
    if (total !== 101500) out.push('the total reads ' + total + ': a gift was lost');
    const rows = (await w.db.query("select from_id, body from public.chat_messages where from_name = 'The Weighhouse'")).rows;
    if (rows.length !== 1 || rows[0].body !== 'has its footings.') out.push('the stage spoke ' + JSON.stringify(rows));
    /* AS THE TOWN, ON REAL CLAIMS: the session's sub and its claims both come off for the one insert */
    if (rows[0] && rows[0].from_id !== null) out.push('the line is stamped with a giver');
    return out;
  },
  R10: async (w) => {
    const out = [];
    await clearTown(w);
    const u = await account(w, 1);
    const key = idem();
    await holdPurse(w, u);
    const p0 = gift(w.A, u, 0, 1000, key);
    await blocked(w, w.A, p0);
    const p1 = gift(w.B, u, 0, 1000, key);
    await blocked(w, w.B, p1);
    await open(w);
    const [r0, r1] = await Promise.all([p0, p1]);
    if (r0.ok !== true || r1.ok !== true) out.push('one key twice answered ' + JSON.stringify([r0, r1]));
    if ((await purse(w, u)) !== 999000) out.push('one key twice left the purse at ' + (await purse(w, u)));
    if ((await shopRows(w, u)).length !== 1) out.push('one key twice journalled ' + JSON.stringify(await shopRows(w, u)));
    if (Number((await w.db.query('select gold from public.town_works_gifts where user_id = $1', [u])).rows[0].gold) !== 1000) out.push('one key twice gave twice');
    return out;
  },
};

async function main() {
  if (!MUTATE) {
    const w = await world(null);
    let red = 0;
    try {
      for (const [id, race] of Object.entries(RACES)) {
        if (ONLY.length && !ONLY.includes(id)) continue;
        let p;
        try { p = await race(w); } catch (e) { if (e.harness) throw e; p = ['threw: ' + String(e && e.stack || e).slice(0, 500)]; }
        if (p.length) { red++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
      }
    } finally { await w.close(); }
    console.log(red ? `town-shows-race: ${red} race(s) red` : 'town-shows-race: every race green');
    process.exit(red ? 1 : 0);
  }
  let missed = 0;
  for (const [id, m] of Object.entries(CONTROLS)) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    const w = await world(m);
    let p;
    try { p = await RACES[m.race](w); } catch (e) { if (e.harness) throw e; p = ['threw: ' + String(e && e.message).slice(0, 200)]; } finally { await w.close(); }
    if (p.length) { console.error(`✗ the control ${id} went RED: ${p.join('; ').slice(0, 300)}`); missed++; }
    else console.log(`✓ control ${id}: ${m.why}`);
  }
  for (const [id, m] of Object.entries(MUTANTS)) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    const w = await world(m);
    let p;
    try { p = await RACES[m.race](w); } catch (e) { if (e.harness) throw e; p = ['threw: ' + String(e && e.message).slice(0, 200)]; } finally { await w.close(); }
    if (p.length) console.log(`✓ ${m.race} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.race} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  console.log(missed ? `town-shows-race --mutate: ${missed} survived` : `town-shows-race --mutate: all ${Object.keys(MUTANTS).length} caught`);
  process.exit(missed ? 1 : 0);
}

main().catch((e) => { console.error('town-shows-race: HARNESS ' + String(e && e.message || e).slice(0, 800)); process.exit(2); });
