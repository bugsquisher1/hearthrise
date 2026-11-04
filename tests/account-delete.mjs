#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/account-delete.mjs — A PLAYER'S OWN WAY OUT: IT STOPS PLAY AT ONCE, IT CAN BE TAKEN BACK FOR 30 DAYS, AND THE
//   PURGE LEAVES NOTHING THAT NAMES THEM, CHECKED BY READING THE WHOLE DATABASE (supabase/migrations/2027-02-25-account-delete.sql).
//
//   node tests/account-delete.mjs            the guard
//   node tests/account-delete.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-02-25-account-delete.sql
//
// One boot of the chain up to the file before it; each run applies the file (planted or not) inside a transaction that rolls back.
//
//   AD-ORDER    the file is last in the apply order, with a dated note
//   AD-APPLY    it applies: its own §10 ran a probe through request, keep, request, purge, and the second apply is the same
//   AD-RULE     the 30 days the client says is the server's 30 days; the Settings row and the window row exist
//   AD-SHAPE    the verbs take no account id: there is nothing to forge
//   AD-FRESH    a request needs the signed token's own recent password sign-in: stale, absent, refresh-only or malformed is refused
//   AD-OTHER    someone else's account can't be touched: no table write, no owner function, one player's verbs reach only them
//   AD-IDEM     a second request is the first one; an old retry can't delete a kept account; a retried Keep can't cancel a later request
//   AD-HOOK     the pre-request hook: a leaving account reaches two paths and the date; a closed-mode one reaches only the request
//   AD-GATES    L2 (hr_rpc_gate), L3 (hr_rate_gate, the engine's) and L4 (RLS) refuse a leaving account
//   AD-QUIET    at the request: a party hunt ends for them alone, the seat and lead move, listings come home journalled, jobs stop
//   AD-PURGE    the job's own command, after 30 days: no row in ANY table of ANY schema holds the id as text; what must stay stays
//   AD-FUTURE   a table added later is purged with no edit here; a catalogue or config table with a person column must have a rule
//   AD-LOCK     player_ledger and beta_signup_log stay append-only: only the anonymizing shape under the purge's own setting passes
//   AD-SWEEP    a hunt or listing that slipped past the request (the accepted race) is ended by the next run, not at day 30
//   AD-BATCH    a ledger past one batch resumes on the next run, and is not left behind
//   AD-FAIL     a purge that can't finish rolls back whole, says so with no id in the alert, and finishes when it can
//   AD-KEEP     Keep undoes the waiting: boards back, admitted, the job leaves it alone; a keep after the purge says account_gone
//   AD-CLIENT   the client's half: the refusal reads as closed and keeps the date; a wrong password asks the game's server nothing
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, manifest, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FILE = '2027-02-25-account-delete.sql';
const SRC = (await readFile(join(ROOT, 'supabase', 'migrations', FILE), 'utf8')).replace(/\r\n/g, '\n');
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const uid = (n) => '000000c1-0000-4000-8000-0000a0de' + String(n).padStart(4, '0');
const key = () => crypto.randomUUID();
let DB_NOW = 0;   /* now() in the one open transaction: it doesn't move, and the amr check reads it */
const nowS = () => DB_NOW;
const fresh = (u) => JSON.stringify({ sub: u, role: 'authenticated', amr: [{ method: 'password', timestamp: nowS() }] });

function world(db) {
  const one = async (sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  /* Everything a request sets: PostgREST's GUCs. */
  const claims = (u, o = {}) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true),
      set_config('request.headers', $3, true), set_config('request.path', $4, true)`,
  [u || '', o.claims !== undefined ? o.claims : (u ? fresh(u) : ''), JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (u ? parseInt(u.slice(-2), 16) % 200 + 10 : 1) }), o.path || '']);
  const attempt = async (fn) => {
    await db.exec('savepoint ad');
    try { const r = await fn(); await db.exec('release savepoint ad'); return { r }; }
    catch (e) { await db.exec('rollback to savepoint ad'); return { e }; }
  };
  /* As the client's own role. A refusal comes back as { e } with the role undone. */
  const as = (u, fn, o = {}) => attempt(async () => {
    await claims(u, o);
    await db.exec('set local role ' + (o.role || 'authenticated'));
    const r = await fn();
    await db.exec('reset role');
    await claims(null);
    return r;
  });
  const ask = async (u, sql, params, o) => { const a = await as(u, () => one(sql, params), o); return a.e ? { raised: a.e.message, code: a.e.code } : a.r; };
  const request = (u, o, k) => ask(u, 'select public.hr_account_delete_request($1, $2::uuid)', [o && o.word !== undefined ? o.word : 'DELETE', k || key()], o);
  const keep = (u, k) => ask(u, 'select public.hr_account_keep($1::uuid)', [k || key()]);
  const account = async (n) => {
    const u = uid(n);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'account-delete guard') on conflict (user_id) do nothing`, [u]);
    await claims(u);
    const made = await one('select public.hr_create_character(0)');
    if (!made || made.ok !== true) throw Object.assign(new Error('harness: hr_create_character refused: ' + js(made)), { harness: true });
    await db.query('update public.player_state set level_xp = 100000000, stamina_ms = 28800000, stamina_at = now() where user_id = $1', [u]);
    await claims(null);
    return u;
  };
  /* Backdate a waiting deletion past its day and run the job's own command. */
  const due = (u) => db.query(`update public.hr_account_deletions set requested_at = now() - interval '31 days', purge_at = now() - interval '1 second' where user_id = $1`, [u]);
  const job = async () => one((await db.query(`select command from cron.job where jobname = 'hr-account-purge'`)).rows[0].command);
  return { one, claims, attempt, as, ask, request, keep, account, due, job };
}

/* Every row of every table and matview in every schema a player's data could sit in, read as text. */
async function namesIn(db, id) {
  const rels = (await db.query(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'm') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')`)).rows;
  const hits = [];
  for (const { s, t } of rels) {
    const q = `select count(*)::int n from "${s}"."${t}" x where x::text like $1`;
    const n = (await db.query(q, ['%' + id + '%'])).rows[0].n;
    if (n) hits.push(`${s}.${t}: ${n}`);
  }
  return { hits, read: rels.length };
}

async function scenario(db, sql) {
  const red = new Map();
  const arm = (id, ok, good, bad) => { console.log(ok ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`); if (!ok) red.set(id, bad); };
  const w = world(db);
  const { one, claims, as, ask, request, keep, account, due, job, attempt } = w;
  /* A fixture that may not fit a table's rules: the sweep is the judge, and it has more to read when it lands. Never aborts the transaction. */
  const opt = (sql, params) => attempt(() => db.query(sql, params)).then((a) => { if (a.e && process.env.AD_DEBUG) console.log('    fixture refused: ' + sql.slice(0, 60) + ': ' + a.e.message); return a; });
  await db.exec('begin');
  try {
    DB_NOW = await one('select floor(extract(epoch from now()))::int');
    /* AD-APPLY: the file, twice */
    let applyError = null;
    try {
      await db.exec(sql);
      await db.exec(sql);
    } catch (e) { applyError = e; }
    arm('AD-APPLY', !applyError, 'it applies twice: its §10 ran a probe through request, keep, request, purge', 'the file refused: ' + (applyError && String(applyError.message).slice(0, 300)));
    if (applyError) return red;

    await db.query('update public.hr_hunt_config set enabled = true where id');

    /* AD-RULE */
    const { ACCOUNT_GRACE_DAYS } = await import('../src/data/account-rules.js');
    const { SETTINGS } = await import('../src/data/settings.js');
    const { SHELL_WINDOWS } = await import('../src/data/shell-windows.js');
    const graceDays = await one(`select extract(day from public.hr_account_grace())::int`);
    const row = SETTINGS.find((r) => r.id === 'account.delete');
    const winRow = SHELL_WINDOWS.find((r) => r.id === 'account-delete');
    arm('AD-RULE', graceDays === ACCOUNT_GRACE_DAYS && row && row.category === 'account' && row.open === 'account-delete' && winRow && winRow.modal === true && winRow.key === null,
      `the server's grace is the ${ACCOUNT_GRACE_DAYS} days the client says; Settings, Account opens a window with no key`,
      js({ graceDays, ACCOUNT_GRACE_DAYS, row, winRow }));

    /* AD-SHAPE */
    const shape = (await db.query(`select p.proname n, pg_get_function_identity_arguments(p.oid) a from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('hr_account_delete_request', 'hr_account_keep') order by 1`)).rows;
    arm('AD-SHAPE', js(shape) === js([{ n: 'hr_account_delete_request', a: 'p_confirm text, p_idem uuid' }, { n: 'hr_account_keep', a: 'p_idem uuid' }]),
      'neither verb takes an account id', js(shape));

    /* AD-FRESH */
    const A = await account(1);
    const tries = [
      ['no amr', { claims: JSON.stringify({ sub: A, role: 'authenticated' }) }],
      ['an hour old', { claims: JSON.stringify({ sub: A, role: 'authenticated', amr: [{ method: 'password', timestamp: nowS() - 3600 }] }) }],
      ['a refresh, not a password', { claims: JSON.stringify({ sub: A, role: 'authenticated', amr: [{ method: 'token_refresh', timestamp: nowS() }] }) }],
      ['amr of strings', { claims: JSON.stringify({ sub: A, role: 'authenticated', amr: ['password'] }) }],
      ['in the future', { claims: JSON.stringify({ sub: A, role: 'authenticated', amr: [{ method: 'password', timestamp: nowS() + 3600 }] }) }],
    ];
    const refused = [];
    for (const [name, o] of tries) { const r = await request(A, o); if (r.error !== 'stale_signin') refused.push(name + ': ' + js(r)); }
    const badWord = await request(A, { word: 'delete' });
    const none = await one('select count(*)::int from public.hr_account_deletions where user_id = $1', [A]);
    arm('AD-FRESH', !refused.length && badWord.error === 'bad_confirm' && none === 0, 'stale, absent, refresh-only, malformed and future sign-ins are refused, as is the wrong word; nothing is written',
      js({ refused, badWord, none }));

    /* AD-OTHER */
    const B = await account(2);
    const write = await as(A, () => db.query(`insert into public.hr_account_deletions (user_id, purge_at) values ($1, now())`, [B]));
    const steal = await as(A, () => db.query(`delete from auth.users where id = $1`, [B]));
    const owners = [];
    for (const f of [`public.hr_account_purge('${B}'::uuid)`, `public.hr_account_quiet('${B}'::uuid)`, 'public.hr_account_purge_run()', 'public.hr_account_person_columns()']) {
      for (const role of ['authenticated', 'anon', 'service_role']) {
        const a = await as(role === 'authenticated' ? A : null, () => db.query('select ' + f), { role });
        if (!a.e || !/permission denied/.test(a.e.message)) owners.push(role + ' ' + f + ': ' + (a.e ? a.e.message : 'ran'));
      }
    }
    const otherSees = await as(A, () => one('select count(*)::int from public.hr_account_deletions where user_id = $1', [B]));
    const askA = await request(A);
    const asideB = await ask(B, 'select public.hr_admitted($1::uuid)', [B]);
    const readB = await as(B, () => one('select count(*)::int from public.hr_account_deletions'));
    const keepB = await keep(B);
    const stillA = await one('select count(*)::int from public.hr_account_deletions where user_id = $1', [A]);
    arm('AD-OTHER', !!write.e && !!steal.e && !owners.length && otherSees.r === 0 && askA.ok === true && asideB === true && readB.r === 0 && keepB.kept === false && stillA === 1,
      'no client role can write the table, reach auth.users or run an owner function; A\'s request moved only A, and B\'s Keep can\'t cancel it',
      js({ write: write.e && write.e.message, steal: steal.e && steal.e.message, owners, otherSees, askA, asideB, readB, keepB, stillA }));

    /* AD-HOOK */
    const leaving = (path) => as(A, () => db.query('select public.hr_access_check()'), { path });
    const onLoad = await leaving('/rpc/hr_load');
    const onKeep = await leaving('/rpc/hr_account_keep');
    const onAsk = await leaving('/rpc/hr_account_delete_request');
    const onBoth = await leaving('/rest/v1/rpc/hr_account_keep');
    const onTable = await leaving('/player_state');
    const onTrick = await leaving('/rpc/hr_load/rpc/hr_account_keep');
    const onNone = await leaving('');
    let leftBody = null;
    try { leftBody = JSON.parse(onLoad.e.message); } catch { leftBody = null; }
    const leavePurge = await one('select purge_at from public.hr_account_deletions where user_id = $1', [A]);
    const C = uid(3);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [C]);
    const closedLoad = await as(C, () => db.query('select public.hr_access_check()'), { path: '/rpc/hr_load' });
    const closedAsk = await as(C, () => db.query('select public.hr_access_check()'), { path: '/rpc/hr_account_delete_request' });
    const closedKeep = await as(C, () => db.query('select public.hr_access_check()'), { path: '/rpc/hr_account_keep' });
    const closedReq = await request(C);
    await as(C, () => one('select 1'));
    const closedKept = await keep(C);
    const closedAgain = await as(C, () => db.query('select public.hr_access_check()'), { path: '/rpc/hr_load' });
    arm('AD-HOOK', onLoad.e && onLoad.e.code === 'PGRST' && leftBody && leftBody.code === 'hr_account_leaving' && Date.parse(leftBody.details) === new Date(leavePurge).setMilliseconds(0)
        && !onKeep.e && !onAsk.e && !onBoth.e && onTable.e && onTrick.e && onNone.e
        && closedLoad.e && /hr_closed/.test(closedLoad.e.message) && !closedAsk.e && closedKeep.e && /hr_closed/.test(closedKeep.e.message)
        && closedReq.ok === true && closedKept.kept === true && closedAgain.e && /hr_closed/.test(closedAgain.e.message),
      'a leaving account reaches Keep and the request and reads its date; every other path is refused; a closed-mode account may ask to leave, and is closed again if it stays',
      js({ onLoad: onLoad.e && onLoad.e.message, onKeep: onKeep.e && onKeep.e.message, onTable: !!(onTable.e), onTrick: !!(onTrick.e), onNone: !!(onNone.e), leavePurge,
        closedLoad: closedLoad.e && closedLoad.e.message, closedAsk: closedAsk.e && closedAsk.e.message, closedKeep: closedKeep.e && closedKeep.e.message, closedReq, closedKept }));

    /* AD-GATES */
    const l1 = await ask(A, 'select public.hr_admitted($1::uuid)', [A]);
    const l3 = await one(`select public.hr_rate_gate($1::uuid, 0, 'accrue')`, [A]);
    const l4 = await as(A, () => db.query('insert into public.chat_blocks (blocker_id, blocked_id) values ($1, $2)', [A, B]));
    const l2 = await as(A, () => one(`select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, gen_random_uuid())`), { path: '/rpc/hr_hunt_enter' });
    arm('AD-GATES', l1 === false && l3 === false && !!l4.e && !!l2.e && /hr_account_leaving/.test(l2.e.message), 'L2, L3 and L4 all refuse a leaving account, and the engine\'s gate reads the same line', js({ l1, l3, l4: l4.e && l4.e.message, l2 }));

    /* AD-IDEM */
    const D = await account(4);
    const k1 = key();
    const first = await request(D, undefined, k1);
    const second = await request(D);
    const logged = await one(`select count(*)::int from public.hr_account_deletion_log l join public.hr_account_deletions d on d.stand_in = l.stand_in where d.user_id = $1 and l.event = 'requested'`, [D]);
    const kk = key();
    const kept = await keep(D, kk);
    const oldRetry = await request(D, undefined, k1);
    const afterRetry = await one('select count(*)::int from public.hr_account_deletions where user_id = $1', [D]);
    const third = await request(D);
    const keepRetry = await keep(D, kk);
    const stillWaiting = await one('select count(*)::int from public.hr_account_deletions where user_id = $1', [D]);
    const crossKey = await keep(D, k1);
    arm('AD-IDEM', first.ok === true && second.purge_at === first.purge_at && second.replayed === true && logged === 1 && kept.kept === true && oldRetry.error === 'already_kept' && afterRetry === 0
        && third.ok === true && keepRetry.kept === true && stillWaiting === 1 && crossKey.error === 'intent_mismatch',
      'a second request is the first; an old retry can\'t delete a kept account; a retried Keep can\'t cancel a later request',
      js({ first, second, logged, kept, oldRetry, afterRetry, third, keepRetry, stillWaiting, crossKey }));

    /* AD-QUIET: a party of two accounts hunting one ground; a listing; a town job on a second hero. */
    const E = await account(5);
    const F = await account(6);
    const hunt = await one(`select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1`);
    const item = await one('select m.item_id from public.hr_market_items m where m.listable order by m.item_id limit 1');
    await claims(E);
    const party = await one('select public.hr_party_open($1::uuid, 0)', [E]);
    await one('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [party, F]);
    await claims(null);
    const start = await ask(E, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [hunt, key()]);
    const open = await one('select count(*)::int from public.hunt_sessions where instance_id = $1 and ended_at is null', [party]);
    if (open !== 2) throw Object.assign(new Error('harness: the party hunt did not start: ' + js(start)), { harness: true });
    await db.query(`insert into public.market_listings (user_id, slot, source, item_id, qty, qty_listed, ask_each, fee, expires_at) values ($1, 0, 'storage', $2, 5, 5, 10, 1, now() + interval '1 day')`, [E, item]);
    await db.query(`insert into public.town_seen (user_id, slot, seen_at) values ($1, 0, now())`, [E]);
    const bankBefore = await one('select coalesce(sum(qty), 0)::int from public.account_bank where user_id = $1 and item_id = $2', [E, item]);
    const answer = await request(E);
    const mine = (await db.query(`select end_reason, forfeit, ended_at is not null as ended from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1`, [E])).rows[0];
    const theirs = (await db.query(`select end_reason, ended_at is null as open from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1`, [F])).rows[0];
    const lead = (await db.query('select leader_user, closed_at from public.hunt_parties where id = $1', [party])).rows[0];
    const seat = await one('select count(*)::int from public.hunt_party_members where party_id = $1 and user_id = $2', [party, E]);
    const told = await one(`select count(*)::int from public.party_notices where user_id = $1 and kind = 'left' and actor_user = $2`, [F, E]);
    const bankAfter = await one('select coalesce(sum(qty), 0)::int from public.account_bank where user_id = $1 and item_id = $2', [E, item]);
    const listed = await one('select count(*)::int from public.market_listings where user_id = $1', [E]);
    const journal = await one(`select count(*)::int from public.player_ledger where user_id = $1 and kind = 'trade' and intent like 'market_expire:%' and meta->>'reason' = 'account_closing'`, [E]);
    const forfeits = await one(`select count(*)::int from public.player_ledger where user_id = $1 and intent = 'window_forfeit'`, [E]);
    const idle = await one(`select active_kind from public.player_state where user_id = $1 and slot = 0`, [E]);
    const seen = await one('select count(*)::int from public.town_seen where user_id = $1', [E]);
    const hidden = await one(`select reason from public.hr_lb_hidden where user_id = $1 and slot is null`, [E]);
    arm('AD-QUIET', answer.ok === true && answer.purge_at && mine.ended && mine.end_reason === 'left' && !mine.forfeit && theirs.open && lead.leader_user === F && lead.closed_at === null && seat === 0 && told === 1
        && bankAfter === bankBefore + 5 && listed === 0 && journal === 1 && forfeits === 1 && idle === 'idle' && seen === 0 && hidden === 'leaving',
      'the leaver\'s hunt ends "left", the partner hunts on and leads and is told; the listing is home and journalled; the hero idles; presence and the boards let go',
      js({ answer, mine, theirs, lead, seat, told, bankBefore, bankAfter, listed, journal, forfeits, idle, seen, hidden }));

    /* AD-KEEP: nothing about the waiting survives it */
    const Kp = await account(7);
    await request(Kp);
    const kpKept = await keep(Kp);
    await due(Kp);
    const jobAfterKeep = await db.query(`select public.hr_account_purge($1::uuid) as r`, [Kp]);
    const kpAdmitted = await ask(Kp, 'select public.hr_admitted($1::uuid)', [Kp]);
    const kpHidden = await one('select count(*)::int from public.hr_lb_hidden where user_id = $1', [Kp]);
    arm('AD-KEEP', kpKept.kept === true && kpAdmitted === true && kpHidden === 0 && jobAfterKeep.rows[0].r.status === 'not_due',
      'admitted again, on the boards again, and the job leaves it alone', js({ kpKept, kpAdmitted, kpHidden, job: jobAfterKeep.rows[0].r }));

    /* AD-LOCK */
    const L = await account(8);
    const ledgerRow = (await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, 'shop', 'hero_rename:mira', 0, '{"name":"Mira"}') returning at, id`, [L])).rows[0];
    const lk = `at = '${new Date(ledgerRow.at).toISOString()}' and id = ${ledgerRow.id}`;
    const standIn = '000000c1-0000-4000-8000-00000000beef';
    const guc = (v) => db.query(`select set_config('hr.account_purge', $1, true)`, [v]);
    const up = (set) => attempt(() => db.query(`update public.player_ledger set ${set} where ${lk}`));
    const plainUp = await up(`user_id = '${standIn}', meta = '{}', intent = 'hero_rename'`);
    await guc(L + ':' + standIn);
    const moneyUp = await up(`user_id = '${standIn}', meta = '{}', intent = 'hero_rename', gold = 5`);
    const metaUp = await up(`user_id = '${standIn}', intent = 'hero_rename'`);
    const intentUp = await up(`user_id = '${standIn}', meta = '{}', intent = 'hero_rename:mira'`);
    const wrongIn = await up(`user_id = '${B}', meta = '{}', intent = 'hero_rename'`);
    await guc('');
    const delIn = await attempt(() => db.query(`delete from public.player_ledger where ${lk}`));
    await db.query(`insert into public.beta_signup_log (outcome, user_id, ip, email_domain, detail) values ('open', $1, '198.51.100.9', 'example.org', '{"x":1}')`, [L]);
    const su = (set) => attempt(() => db.query(`update public.beta_signup_log set ${set} where user_id = $1 and ip = '198.51.100.9'`, [L]));
    const suPlain = await su(`user_id = null, ip = null, email_domain = null, detail = null`);
    await guc(L + ':' + standIn);
    const suPart = await su(`user_id = null, email_domain = null, detail = null`);
    const suOutcome = await su(`user_id = null, ip = null, email_domain = null, detail = null, outcome = 'granted'`);
    const suRight = await su(`user_id = null, ip = null, email_domain = null, detail = null`);
    await guc('');
    arm('AD-LOCK', !!plainUp.e && !!moneyUp.e && !!metaUp.e && !!intentUp.e && !!wrongIn.e && !!delIn.e && !!suPlain.e && !!suPart.e && !!suOutcome.e && !suRight.e,
      'outside the purge an update raises; inside it, moving money, keeping meta or the intent\'s tail, or the wrong stand-in raises too; the signup log likewise',
      js({ plainUp: !!plainUp.e, moneyUp: !!moneyUp.e, metaUp: !!metaUp.e, intentUp: !!intentUp.e, wrongIn: !!wrongIn.e, delIn: !!delIn.e, suPlain: !!suPlain.e, suPart: !!suPart.e, suOutcome: !!suOutcome.e, suRight: suRight.e && suRight.e.message }));

    /* AD-SWEEP: the accepted race, played: a hunt and a listing landing after the request */
    const S = await account(9);
    await ask(S, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())`, [hunt]);
    const slipSession = await one('select id from public.hunt_sessions where user_id = $1 and ended_at is null', [S]);
    await db.query('insert into public.hr_account_deletions (user_id, purge_at) values ($1, now() + interval \'30 days\')', [S]);
    await db.query(`insert into public.market_listings (user_id, slot, source, item_id, qty, qty_listed, ask_each, fee, expires_at) values ($1, 0, 'storage', $2, 2, 2, 10, 1, now() + interval '1 day')`, [S, item]);
    const swept = await job();
    const sOpen = await one('select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null', [S]);
    const sList = await one('select count(*)::int from public.market_listings where user_id = $1', [S]);
    arm('AD-SWEEP', !!slipSession && swept.quiet >= 1 && sOpen === 0 && sList === 0, 'a hunt and a listing that slipped past the request end at the next run, not at day 30', js({ slipSession, swept, sOpen, sList }));

    /* AD-BATCH: one row past the batch */
    const Bt = await account(10);
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) select $1, 0, 'presence', 'probe', 0, '{}' from generate_series(1, 50000)`, [Bt]);
    await request(Bt);
    await due(Bt);
    const step1 = (await db.query('select public.hr_account_purge($1::uuid) as r', [Bt])).rows[0].r;
    const rest1 = await one('select count(*)::int from public.player_ledger where user_id = $1', [Bt]);
    const alive = await one('select count(*)::int from auth.users where id = $1', [Bt]);
    const step2 = (await db.query('select public.hr_account_purge($1::uuid) as r', [Bt])).rows[0].r;
    const rest2 = await one('select count(*)::int from public.player_ledger where user_id = $1', [Bt]);
    const gone = await one('select count(*)::int from auth.users where id = $1', [Bt]);
    arm('AD-BATCH', step1.status === 'more' && rest1 > 0 && alive === 1 && step2.status === 'purged' && rest2 === 0 && gone === 0,
      'a long ledger takes another run: the account stays until every row is anonymized', js({ step1, rest1, alive, step2, rest2, gone }));

    /* AD-FAIL: something the purge doesn't know refuses the auth delete */
    const Fa = await account(11);
    await request(Fa);
    await due(Fa);
    await db.exec('create table public.hr__ad_blocker (who uuid references auth.users (id))');
    await db.query('insert into public.hr__ad_blocker values ($1)', [Fa]);
    const failed = await job();
    const faRows = await one('select count(*)::int from public.player_state where user_id = $1', [Fa]);
    const faWaiting = await one('select count(*)::int from public.hr_account_deletions where user_id = $1', [Fa]);
    const alert = (await db.query(`select severity, ref, message, detail::text as d from public.maintenance_alerts where ref like 'account-delete:purge:%' order by id desc limit 1`)).rows[0];
    /* A second table with no foreign key: `hr__ad_blocker.who` is a person column, so the fix is only to drop the key. */
    await db.exec('alter table public.hr__ad_blocker drop constraint hr__ad_blocker_who_fkey');
    const retried = await job();
    const faGone = await one('select count(*)::int from auth.users where id = $1', [Fa]);
    const planted = await one('select count(*)::int from public.hr__ad_blocker where who = $1', [Fa]);
    await db.exec('drop table public.hr__ad_blocker');
    arm('AD-FAIL', failed.failed >= 1 && faRows === 1 && faWaiting === 1 && alert && alert.severity === 'critical' && !alert.ref.includes(Fa) && !alert.d.includes(Fa) && !alert.message.includes(Fa)
        && retried.purged >= 1 && faGone === 0 && planted === 0,
      'it rolled back whole, filed a critical alert with no id in it, and finished on the next run once it could', js({ failed, faRows, faWaiting, alert, retried, faGone, planted }));

    /* AD-FUTURE: a table nobody here has heard of */
    await db.exec('create table public.hr__ad_future (holder uuid, among uuid[], note text)');
    const Ft = await account(12);
    await db.query(`insert into public.hr__ad_future values ($1, null, 'a'), (null, array[$1::uuid], 'b'), ($2, null, 'someone else')`, [Ft, B]);
    await request(Ft);
    await due(Ft);
    const ftJob = await job();
    const ftLeft = (await db.query('select note from public.hr__ad_future order by note')).rows.map((r) => r.note);
    await db.exec('drop table public.hr__ad_future');
    const census = JSON.parse(await readFile(join(ROOT, 'tests', 'restore-census.baseline.json'), 'utf8'));
    const persons = (await db.query('select tbl, col, action from public.hr_account_person_columns()')).rows;
    const unruled = persons.filter((p) => p.action === 'delete' && ['seeded', 'operator_tunable'].includes((census.tables[p.tbl] || {}).class)).map((p) => p.tbl + '.' + p.col);
    const undefinedClass = persons.filter((p) => !census.tables[p.tbl]).map((p) => p.tbl);
    arm('AD-FUTURE', ftJob.purged >= 1 && js(ftLeft) === js(['someone else']) && !unruled.length && !undefinedClass.length,
      `a new table's rows go with no edit here, another player's stay; ${persons.length} person columns read from the catalog, none in a catalogue or config table without a rule`,
      js({ ftJob, ftLeft, unruled, undefinedClass }));

    /* AD-PURGE: the fullest account we can build, through the job's own command, then read every row of every relation */
    const P = await account(13);
    const Q = await account(14);
    const qGoldBefore = await one('select gold from public.account_wallet where user_id = $1', [Q]);
    const qHero = await one('select count(*)::int from public.player_state where user_id = $1', [Q]);
    const qLedger = await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, 'trade', 'probe', 0, '{}')`, [Q]);
    const qLedgerN = await one('select count(*)::int from public.player_ledger where user_id = $1', [Q]);
    await db.query(`update public.hr_tick_config set cursor_user = $1 where id`, [P]);
    await db.query(`insert into public.hr_tick_shard_cursor (shard, cursor_user) values (0, $1) on conflict (shard) do update set cursor_user = excluded.cursor_user`, [P]);
    await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) values ($1, 0, 'shop', 'hero_rename:mira', 0, '{"name":"Mira"}')`, [P]);
    await db.query(`insert into public.player_ledger_rollup (user_id, slot, month, kind, n, gold_in, gold_out, xp_in, xp_out, qty_in, qty_out, gems_in) values ($1, 0, '2026-10-01', 'shop', 3, 0, 0, 0, 0, 0, 0, 0)`, [P]);
    const list1 = key();
    await db.query(`insert into public.market_sales (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot, item_id, qty, gold_gross, tax, gold_net) values ($1, $2, 0, $3, 0, $4, 1, 10, 0, 10)`, [list1, P, Q, item]);
    await db.query(`insert into public.market_sales (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot, item_id, qty, gold_gross, tax, gold_net) values ($1, $2, 0, $3, 0, $4, 2, 20, 0, 20)`, [key(), Q, P, item]);
    await db.query(`insert into public.hr_name_holds (fold, user_id) values ('adguardfold', $1)`, [P]);
    await db.query(`insert into public.beta_signup_log (outcome, user_id, ip, email_domain, detail) values ('open', $1, '198.51.100.44', 'example.org', '{"who":"x"}')`, [P]);
    await db.query(`insert into public.beta_invites (code, used_by, used_at) values ('AD-GUARD-CODE', $1, now())`, [P]);
    await opt(`insert into public.bug_reports (user_id, summary, source, status) values ($1, 'a report', 'client', 'new')`, [P]);
    await db.query(`insert into public.chat_messages (channel, from_id, from_name, body) values ('global', $1, 'x', 'hello')`, [P]);
    await db.query(`insert into public.chat_messages (channel, from_id, from_name, body, audience) values ('party:x', $1, 'x', 'in the party', array[$1, $2]::uuid[])`, [Q, P]);
    await db.query(`insert into public.chat_whispers (from_id, from_name, to_id, to_name, body) values ($1, 'x', $2, 'y', 'psst'), ($2, 'y', $1, 'x', 'back')`, [P, Q]);
    await db.query(`insert into public.chat_blocks (blocker_id, blocked_id) values ($1, $2), ($2, $1)`, [Q, P]);
    const [lo, hi] = [P, Q].sort();
    await db.query(`insert into public.friend_links (user_lo, user_hi) values ($1, $2)`, [lo, hi]);
    await opt(`insert into public.friend_requests (from_id, to_id) values ($1, $2)`, [Q, P]);
    const clanWith = key(), clanAlone = key();
    await db.query(`insert into public.clans (id, name, created_by) values ($1, 'Addleby', $2), ($3, 'Tessmoor', $2)`, [clanWith, P, clanAlone]);
    await db.query(`insert into public.clan_members (clan_id, user_id, role) values ($1, $2, 'leader'), ($1, $3, 'member')`, [clanWith, P, Q]);
    await opt(`insert into public.clan_ledger (clan_id, user_id, kind) values ($1, $2, 'role')`, [clanWith, P]);
    await opt(`insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in) values ($1, 0, $2, 'monster', 'x', 100)`, [P, item]);
    await opt(`insert into public.hearthfind_log (user_id, slot, item_id, nth_ever) values ($1, 0, $2, 1)`, [P, item]);
    await opt(`insert into public.game_events (user_id, event_type, payload) values ($1, 'x', '{}')`, [P]);
    await opt(`insert into public.party_notices (user_id, slot, kind, actor_user, actor_slot) values ($1, 0, 'left', $2, 0)`, [Q, P]);
    await db.query(`select public.hr_record_rejection($1::uuid, 0, 'probe', 'probe_code', '{}'::jsonb, 1)`, [P]);
    await opt(`insert into public.hunt_bests (user_id, slot, hunt_id) values ($1, 0, $2)`, [P, hunt]);
    /* A real hunt of theirs, so its instance, bag and tally exist, and a town job's rows. */
    await ask(P, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())`, [hunt]);
    const pInst = await one('select instance_id from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1', [P]);
    const standBefore = await request(P);
    const pStand = await one('select stand_in from public.hr_account_deletions where user_id = $1', [P]);
    await due(P);
    const before = await namesIn(db, P);
    const pJob = await job();
    await opt(`select public.hr_town_refresh()`);
    await opt(`select public.hr_leaderboard_refresh(true)`);
    const after = await namesIn(db, P);
    const cfg = await one('select cursor_user from public.hr_tick_config where id');
    const cfgThere = await one('select count(*)::int from public.hr_tick_config where id');
    const shard = await one('select cursor_user from public.hr_tick_shard_cursor where shard = 0');
    const lr = (await db.query(`select meta, intent, kind, gold from public.player_ledger where user_id = $1 and kind = 'shop' order by id desc limit 1`, [pStand])).rows[0];
    const roll = await one(`select count(*)::int from public.player_ledger_rollup where user_id = $1`, [pStand]);
    const soldTo = await one(`select count(*)::int from public.market_sales where seller_user_id = $1 and buyer_user_id = $2`, [pStand, Q]);
    const boughtFrom = await one(`select count(*)::int from public.market_sales where seller_user_id = $1 and buyer_user_id = $2`, [Q, pStand]);
    const hold = (await db.query(`select user_id from public.hr_name_holds where fold = 'adguardfold'`)).rows[0];
    const su0 = (await db.query(`select user_id, ip, email_domain, detail from public.beta_signup_log where outcome = 'open' and code is null and ip is null and detail is null order by id desc limit 1`)).rows[0];
    const clanKept = await one('select created_by from public.clans where id = $1', [clanWith]);
    const clanGone = await one('select count(*)::int from public.clans where id = $1', [clanAlone]);
    const instGone = await one('select count(*)::int from public.hunt_instances where id = $1', [pInst]);
    const logRow = (await db.query(`select detail from public.hr_account_deletion_log where stand_in = $1 and event = 'purged'`, [pStand])).rows[0];
    const qGold = await one('select gold from public.account_wallet where user_id = $1', [Q]);
    const qHeroN = await one('select count(*)::int from public.player_state where user_id = $1', [Q]);
    const qLedgerAfter = await one('select count(*)::int from public.player_ledger where user_id = $1', [Q]);
    const qAuth = await one('select count(*)::int from auth.users where id = $1', [Q]);
    const allow = await one('select count(*)::int from public.hr_access_allowlist where user_id = $1', [P]);
    arm('AD-PURGE', !!standBefore.ok && pJob.purged >= 1 && before.hits.length >= 20 && !after.hits.length && after.read > 200 && lr && js(lr.meta) === '{}' && lr.intent === 'hero_rename' && roll === 1 && soldTo === 1 && boughtFrom === 1
        && hold && hold.user_id === null && su0 && su0.user_id === null && cfg === null && cfgThere === 1 && shard === null && clanKept === Q && clanGone === 0 && instGone === 0 && logRow && !js(logRow).includes(P)
        && String(qGold) === String(qGoldBefore) && qHeroN === qHero && qLedgerAfter === qLedgerN && qAuth === 1 && allow === 0,
      `${before.hits.length} relations named them, ${after.read} read after, none does; the ledger, both sides of each sale, the signup log, the moderation hold, the clan and the tick's config all stand; the other player is whole`,
      js({ pJob, before: before.hits.length, after: after.hits, read: after.read, lr, roll, soldTo, boughtFrom, hold, su0, cfg, cfgThere, shard, clanKept, clanGone, instGone, qGold, qGoldBefore, qHeroN, qHero, qLedgerAfter, qLedgerN, allow }));

    /* A token outlives the purge by up to an hour. */
    const gone1 = await keep(P);
    arm('AD-GONE', gone1.error === 'account_gone', 'a Keep from a token that outlived the purge says the account is gone', js(gone1));

    /* AD-CLIENT */
    const { leavingOf, isClosedAnswer, createServerLink } = await import('../src/session/server.js');
    const { requestDeletion, keepAccount, wordTyped, DELETE_WORD } = await import('../src/session/account-leaving.js');
    const purgeAt = '2027-03-04T10:00:00Z';
    const link = createServerLink({ url: 'http://x', publishableKey: 'k', token: () => 't',
      fetch: async () => new Response(JSON.stringify({ code: 'hr_account_leaving', message: 'x', details: purgeAt, hint: null }), { status: 403 }) });
    const ans = await link.rpc('hr_load', { p_slot: 0 });
    const calls = [];
    const fakeAccount = (over = {}) => ({
      auth: { email: () => 'a@b.c', signIn: async () => (over.signIn || { ok: true, message: '' }) },
      server: { rpc: async (name, args) => { calls.push([name, args]); return over.rpc || { ok: true, status: 200, body: { ok: true, purge_at: purgeAt } }; } },
      noteLeaving: (p) => { calls.push(['noteLeaving', p]); },
    });
    const wrong = await requestDeletion(fakeAccount({ signIn: { ok: false, message: 'That email and password do not match an account.' } }), 'bad', 'delete ');
    const wrongCalls = calls.length;
    const yes = await requestDeletion(fakeAccount(), 'good', ' delete ', 'k1');
    const noWord = await requestDeletion(fakeAccount(), 'good', 'please');
    const staleWords = await requestDeletion(fakeAccount({ rpc: { ok: true, status: 200, body: { ok: false, error: 'stale_signin' } } }), 'good', 'DELETE');
    const down = await requestDeletion(fakeAccount({ rpc: { ok: false, status: 0, error: 'network' } }), 'good', 'DELETE');
    const keptYes = await keepAccount(fakeAccount({ rpc: { ok: true, status: 200, body: { ok: true, kept: true } } }));
    const keptDown = await keepAccount(fakeAccount({ rpc: { ok: false, status: 0, error: 'network' } }));
    arm('AD-CLIENT', ans.closed === true && ans.ok === false && link.leaving() && link.leaving().purgeAt === purgeAt && leavingOf(403, { code: 'hr_closed' }) === null && !isClosedAnswer(403, { code: 'hr_account_leaving' })
        && !wrong.ok && /password/.test(wrong.message) && /nothing was deleted/.test(wrong.message) && wrongCalls === 0
        && yes.ok === true && calls.some(([n, a]) => n === 'hr_account_delete_request' && a.p_confirm === DELETE_WORD && a.p_idem === 'k1') && calls.some(([n, a]) => n === 'noteLeaving' && a === purgeAt)
        && !noWord.ok && !staleWords.ok && /nothing was deleted/.test(staleWords.message) && !down.ok && /nothing was deleted/.test(down.message)
        && keptYes.ok === true && !keptDown.ok && wordTyped(' delete ') && !wordTyped('deleted'),
      'the refusal reads as closed and keeps the date; a wrong password never reaches the game\'s server; every refusal says nothing was deleted',
      js({ ans, wrong, wrongCalls, yes, noWord, staleWords, down, keptYes, keptDown }));
    return red;
  } finally {
    await db.exec('rollback').catch(() => {});
    await db.exec('reset role').catch(() => {});
  }
}

const NEUTER_C = ["    if v->>'error' is distinct from 'already_kept' or exists (select 1 from public.hr_account_deletions where user_id = c_a) then\n      raise exception 'VERIFY(c): an old retry after a keep answered %', v; end if;\n", ''];
/* Most of these the file's own §10 refuses before behaviour runs (AD-APPLY), which is the §4 self-check doing its job. */
const MUTANTS = [
  { id: 'no_fresh_check', arm: 'AD-APPLY', why: 'any session can delete the account',
    edits: [["  if not public.hr_account_signin_fresh() then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'stale_signin')); end if;\n", '']] },
  { id: 'refresh_counts', arm: 'AD-FRESH', why: 'a token refresh reads as a fresh sign-in',
    edits: [["where jsonb_typeof(e) = 'object' and e->>'method' = 'password' and jsonb_typeof(e->'timestamp') = 'number'", "where jsonb_typeof(e) = 'object' and jsonb_typeof(e->'timestamp') = 'number'"]] },
  { id: 'future_counts', arm: 'AD-FRESH', why: 'a token claiming tomorrow reads as fresh',
    edits: [[" and to_timestamp(v_at) <= now() + interval '1 minute'", '']] },
  { id: 'request_moves_date', arm: 'AD-APPLY', why: 'a second request pushes the purge back',
    edits: [["  if found then\n    return jsonb_build_object('ok', true, 'replayed', true, 'requested_at', v_d.requested_at, 'purge_at', v_d.purge_at);", "  if found then\n    update public.hr_account_deletions set purge_at = purge_at + interval '1 day' where user_id = v_uid returning * into v_d;\n    return jsonb_build_object('ok', true, 'replayed', true, 'requested_at', v_d.requested_at, 'purge_at', v_d.purge_at);"]] },
  { id: 'hook_lets_all', arm: 'AD-APPLY', why: 'a leaving account keeps playing',
    edits: [["    if v_path in ('/rpc/hr_account_keep', '/rpc/hr_account_delete_request') then return; end if;", '    return;']] },
  { id: 'hook_any_path_ends_in_keep', arm: 'AD-HOOK', why: 'a crafted path passes the hook',
    edits: [["    if v_path in ('/rpc/hr_account_keep', '/rpc/hr_account_delete_request') then return; end if;", "    if v_path like '%/rpc/hr_account_keep' or v_path = '/rpc/hr_account_delete_request' then return; end if;"]] },
  { id: 'closed_mode_opens', arm: 'AD-HOOK', why: 'a closed-mode account gets past the hook on every path',
    edits: [["  if v_path = '/rpc/hr_account_delete_request' then return; end if;", '  return;']] },
  { id: 'still_admitted', arm: 'AD-APPLY', why: 'the engine and the RPC gates still let a leaving account play',
    edits: [['     and not exists (select 1 from public.hr_account_deletions d where d.user_id = p_user)\n', '']] },
  { id: 'old_retry_deletes', arm: 'AD-IDEM', why: 'a delayed retry deletes an account its owner kept (the §10 line neutered too)',
    edits: [["    if coalesce(v_r->>'ok', '') = 'true' then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'already_kept')); end if;\n    return v_r;\n", "    if coalesce(v_r->>'ok', '') <> 'true' then return v_r; end if;\n"], NEUTER_C] },
  { id: 'keep_no_replay', arm: 'AD-APPLY', why: 'a retried Keep cancels a later request',
    edits: [["  -- A RETRIED KEEP MAY NOT CANCEL A LATER REQUEST.\n  v_r := public.hr_intent_replay(v_uid, 0, p_idem, c_verb);\n  if v_r is not null then return v_r; end if;\n", '']] },
  { id: 'keep_stays_hidden', arm: 'AD-APPLY', why: 'a kept account stays off the boards',
    edits: [["  delete from public.hr_lb_hidden where user_id = v_uid and reason = 'leaving';\n", '']] },
  { id: 'rule_tick_config', arm: 'AD-PURGE', why: 'a purge takes the world tick\'s config row with it',
    edits: [["    ('hr_tick_config', 'cursor_user', 'clear'),\n", '']] },
  { id: 'rule_name_hold', arm: 'AD-PURGE', why: 'a moderated name comes back when its owner leaves',
    edits: [["    ('hr_name_holds', 'user_id', 'clear'),\n", '']] },
  { id: 'default_keeps', arm: 'AD-APPLY', why: 'a table nobody ruled on keeps the rows',
    edits: [["select c.tbl, c.col, c.is_array, coalesce(r.action, 'delete')", "select c.tbl, c.col, c.is_array, coalesce(r.action, 'keep')"]] },
  { id: 'sale_deleted', arm: 'AD-APPLY', why: 'one player leaving rewrites another player\'s purchases',
    edits: [["    ('market_sales', 'seller_user_id', 'stand_in'),\n", '']] },
  { id: 'ledger_left', arm: 'AD-APPLY', why: 'the ledger still names them',
    edits: [['    from batch b where l.at = b.at and l.id = b.id;\n', '    from batch b where l.at = b.at and l.id = b.id and false;\n']] },
  { id: 'trigger_open', arm: 'AD-LOCK', why: 'the purge\'s setting opens the ledger to any write',
    edits: [["     and (to_jsonb(new) - array['user_id', 'meta', 'intent', 'purse', 'gold_kind']) = (to_jsonb(old) - array['user_id', 'meta', 'intent', 'purse', 'gold_kind'])\n", '']] },
  { id: 'signup_log_kept', arm: 'AD-APPLY', why: 'their IP stays in the abuse trail under their id',
    edits: [['  update public.beta_signup_log set user_id = null, ip = null, email_domain = null, detail = null where user_id = p_user;\n', '']] },
  { id: 'no_sweep', arm: 'AD-SWEEP', why: 'a hunt that slipped past the request runs for 30 days',
    edits: [['        perform public.hr_account_quiet(r.user_id);\n        v_quiet := v_quiet + 1;\n', '        v_quiet := v_quiet + 1;\n']] },
  { id: 'batch_ignored', arm: 'AD-BATCH', why: 'the purge finishes with ledger rows still naming them (§10 has too few rows to see it)',
    edits: [['  if v_n >= c_batch then\n', '  if false then\n']] },
  { id: 'alert_silent', arm: 'AD-FAIL', why: 'a purge fails with nobody told',
    edits: [["          jsonb_build_object('stand_in', p_stand_in, 'sqlstate', p_state, 'table', p_table, 'constraint', p_constraint))\n  on conflict (ref) do nothing;", "          jsonb_build_object('stand_in', p_stand_in, 'sqlstate', p_state, 'table', p_table, 'constraint', p_constraint))\n  on conflict (ref) do nothing;\n  delete from public.maintenance_alerts where ref like 'account-delete:%';"]] },
  { id: 'purge_public', arm: 'AD-APPLY', why: 'a client can run the purge',
    edits: [['revoke execute on function public.hr_account_purge(uuid) from public, anon, authenticated, service_role;\n', 'grant execute on function public.hr_account_purge(uuid) to authenticated;\n']] },
  { id: 'party_ends_for_all', arm: 'AD-QUIET', why: 'one player leaving ends the partner\'s hunt',
    edits: [["    if exists (select 1 from public.hunt_sessions o where o.instance_id = v_i and o.ended_at is null and o.user_id <> p_user) then\n", '    if false then\n']] },
];

function plant(sql, edits) {
  let s = sql;
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) throw Object.assign(new Error(`mutant anchor matched ${n} times: ${find.slice(0, 80)}`), { harness: true });
    s = s.replace(find, () => repl);
  }
  return s;
}

async function main() {
  const m = await manifest();
  const order = m.order || [];
  const prev = order[order.indexOf(FILE) - 1];
  let db;
  try { ({ db } = await bootReplay({ keepClosed: true, upTo: prev })); }
  catch (e) { console.error(`account-delete: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
  try {
    if (!MUTATE) {
      console.log('\naccount-delete — a player\'s own way out, on the replayed chain\n');
      const note = String((m._order_notes || {})[FILE] || '');
      const ok = order.includes(FILE) && /\b(STAGED|APPLIED)\b/.test(note);
      console.log(ok ? `  ✓ AD-ORDER — ${FILE} is in the apply order with a dated note` : `  ✗ AD-ORDER — ${FILE} must be in \`order\` with a STAGED or APPLIED note`);
      let red;
      try { red = await scenario(db, SRC); }
      catch (e) { console.error(`account-delete: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
      const n = red.size + (ok ? 0 : 1);
      console.log(n ? `\naccount-delete: RED (${n})` : '\naccount-delete: green');
      process.exitCode = n ? 1 : 0;
      return;
    }
    console.log('\naccount-delete --mutate\n');
    let survived = 0;
    const log = console.log;
    for (const mu of MUTANTS) {
      let sql = SRC;
      try { if (!CONTROL) sql = plant(SRC, mu.edits); }
      catch (e) { log(`account-delete: HARNESS — ${e.message}`); process.exit(2); }
      let red;
      console.log = () => {};
      try { red = await scenario(db, sql); }
      catch (e) {
        console.log = log;
        if (e.harness) { log(`account-delete: HARNESS — ${mu.id}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
        /* a planted defect that breaks a later arm's setup is a survivor unless its own arm already spoke */
        red = red || new Map([['THREW', String(e.message)]]);
      }
      console.log = log;
      const caught = red.has(mu.arm);
      log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})`
        : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red arms: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    }
    log(survived ? `\naccount-delete --mutate: ${survived} survived` : `\naccount-delete --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exitCode = survived ? 1 : 0;
  } finally {
    await db.close().catch(() => {});
  }
}

await main();
