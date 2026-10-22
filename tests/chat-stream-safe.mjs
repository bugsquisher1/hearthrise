#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/chat-stream-safe.mjs — THE CHAT A NEW PLAYER SEES IS STREAM-SAFE.
//
//   node tests/chat-stream-safe.mjs            the arms, on the chain replayed up to the file
//   node tests/chat-stream-safe.mjs --mutate   every planted defect must turn the §7 self-check
//                                              or an arm red
//
// supabase/migrations/2026-11-19-chat-stream-safe.sql (found by the 2026-10-22
// playtest: a fresh hero's first Global showed weeks of dev chat, profanity
// included). Its §7 self-check runs inside the replay; these arms add what a
// CLIENT does, as the anon and authenticated roles over the replayed chain:
//   S1  a second apply is byte-identical (schema, bodies, the config row)
//   S2  a line older than the floor is never returned: not by hr_chat_recent,
//       not by a direct select (authenticated or anon), not by hr_whispers_recent
//   S3  a listed word is masked on write (chat and whisper), item link kept,
//       the Scunthorpe set untouched; a word listed later is masked on read
//   S4  a client reads the window but cannot move it, nor run the mask
// mutant-anchors: supabase/migrations/2026-11-19-chat-stream-safe.sql
// --mutate replays only UP TO this file (tests/schema-replay.mjs replayScopeError).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2026-11-19-chat-stream-safe.sql';

const MUTATIONS = {
  no_floor_policy: { why: 'chat_messages has no floor policy: a direct select reads the dev chat',
    pairs: [[`create policy hr_chat_history_floor on public.chat_messages as restrictive
  for select using (created_at >= (select public.hr_chat_history_floor()));`, '']] },
  no_epoch: { why: 'the floor ignores the epoch: only the horizon hides old lines',
    pairs: [['select coalesce((select greatest(c.history_epoch, now() - make_interval(hours => c.history_hours))',
      'select coalesce((select (now() - make_interval(hours => c.history_hours))']] },
  recent_unfloored: { why: 'hr_chat_recent reads global below the floor',
    pairs: [["(select * from public.chat_messages m where m.channel = 'global' and m.created_at >= v_floor",
      "(select * from public.chat_messages m where m.channel = 'global'"]] },
  no_write_filter: { why: 'chat_messages has no word-filter trigger: the listed word is stored',
    pairs: [[`create trigger hr_chat_word_filter before insert on public.chat_messages
  for each row execute function public.hr_chat_word_filter();`, '']] },
  no_read_mask: { why: 'hr_chat_recent returns the stored body unmasked (a word listed later shows)',
    pairs: [["select jsonb_agg(public.hr_chat_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))",
      'select jsonb_agg(public.hr_chat_row(x)']] },
  mask_drops_links: { why: 'the mask runs over item-link markers too',
    pairs: [["      when v_tok ~ '^\\[\\[item:[a-z0-9_]{1,64}\\]\\]$' or not public.hr_name_blocked(v_tok) then v_tok",
      "      when not public.hr_name_blocked(v_tok) and v_tok !~ 'item' then v_tok"]] },
  epoch_backward: { why: 'the epoch can be moved backward, re-exposing old chat',
    pairs: [['  if tg_op = \'UPDATE\' and new.history_epoch < old.history_epoch then', '  if false then']] },
  mask_granted: { why: 'hr_chat_mask is executable by a client',
    pairs: [['revoke execute on function public.hr_chat_mask(text) from public, anon, authenticated, service_role;',
      'revoke execute on function public.hr_chat_mask(text) from public, anon, service_role;\ngrant execute on function public.hr_chat_mask(text) to authenticated;']] },
};

async function migText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (mutate) for (const [f, r] of MUTATIONS[mutate].pairs) {
    if (!sql.includes(f)) throw new Error(`mutant ${mutate}: anchor not found`);
    sql = sql.replace(f, () => r);
  }
  return sql;
}

async function run(mutate) {
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };
  const sqlText = await migText(mutate);
  const patches = mutate ? new Map([[MIG, MUTATIONS[mutate].pairs]]) : undefined;
  let boot;
  try { boot = await bootReplay(mutate ? { patches, upTo: MIG } : { upTo: MIG }); }
  catch (e) {
    if (e && e.replay && mutate) return [`REPLAY: ${String(e.failures?.at(-1)?.error || e.message).slice(0, 200)}`];
    throw e;
  }
  const { db } = boot;
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (role, uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(uid ? { sub: uid, role } : { role })]);
    await q(`set role ${role}`);
    try { return { r: (await db.query(sql, p)).rows[0]?.r }; }
    catch (e) { return { err: String(e.message).split('\n')[0], code: e.code }; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  try {
    // ── S1. SECOND APPLY ────────────────────────────────────────────────────
    const bodies = () => q(`select p.proname, md5(p.prosrc) h, p.proacl::text acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
       and p.proname in ('hr_chat_mask','hr_chat_history_floor','hr_chat_word_filter','hr_chat_epoch_forward',
                         'hr_chat_recent','hr_whispers_recent') order by 1`);
    const cfg = () => q('select history_epoch::text e, history_hours h from public.hr_chat_config');
    {
      const before = JSON.stringify([await inventory(db), await bodies(), await cfg()]);
      let err = null;
      try { await db.exec(`begin;\n${sqlText}\ncommit;`); } catch (e) { err = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
      ok('S1', !err, `a second apply raised: ${err}`);
      ok('S1', before === JSON.stringify([await inventory(db), await bodies(), await cfg()]),
        'a second apply changed the schema, a body or the config row');
    }

    // ── the world: two allowlisted heroes, old dev chat, then the epoch moves to now ──
    const A = '000000c0-0000-4000-8000-0000005a7e0a';
    const B = '000000c0-0000-4000-8000-0000005a7e0b';
    for (const [u, n] of [[A, 'Alder'], [B, 'Birch']]) {
      await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
      await q('insert into public.profiles (id, display_name) values ($1,$2) on conflict (id) do update set display_name = excluded.display_name', [u, n]);
      await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'chat-stream-safe test') on conflict do nothing", [u]);
      const c = await as('authenticated', u, 'select public.hr_create_character(0) as r');
      if (c.err || c.r?.ok !== true) throw new Error(`HARNESS: hr_create_character for ${n}: ${c.err || JSON.stringify(c.r)}`);
    }
    await q("select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false)");
    const old = (await q(`insert into public.chat_messages (channel, from_id, from_name, body, created_at)
      values ('global', $1, 'x', 'omg this is all broken', now() - interval '1 hour') returning id`, [A]))[0].id;
    const oldW = (await q(`insert into public.chat_whispers (from_id, from_name, to_id, to_name, body, created_at)
      values ($1, 'Alder', $2, 'Birch', 'an old whisper', now() - interval '1 hour') returning id`, [A, B]))[0].id;
    await q("update public.hr_chat_config set history_epoch = now() where id");
    const item = (await q("select item_id from public.hr_items where item_id ~ '^[a-z0-9_]{1,64}$' order by item_id limit 1"))[0]?.item_id;
    const gate = () => q('delete from public.hr_rate_counters');

    // ── S3. ON WRITE ────────────────────────────────────────────────────────
    const sent = await as('authenticated', A, 'select public.hr_chat_send(0, $1, $2) as r',
      ['global', `what the FUCK, Sh1t. Scunthorpe classic [[item:${item}]]`]);
    ok('S3', sent.r?.line?.body === `what the ***** ***** Scunthorpe classic [[item:${item}]]`,
      `the sent line came back ${sent.err || JSON.stringify(sent.r)}`);
    const stored = await q("select count(*)::int n from public.chat_messages where body ~* 'fuck|sh1t'");
    ok('S3', stored[0].n === 0, `${stored[0].n} stored line(s) keep the listed word`);
    await gate();
    const w = await as('authenticated', A, 'select public.hr_whisper_send(0, $1, $2) as r', [B, 'you are a bitch']);
    ok('S3', w.r?.line?.body === 'you are a *****', `the whisper came back ${w.err || JSON.stringify(w.r)}`);
    await gate();
    const later = await as('authenticated', A, 'select public.hr_chat_send(0, $1, $2) as r', ['global', 'zqxlater is fine today']);
    ok('S3', later.r?.line?.body === 'zqxlater is fine today', `CONTROL: an unlisted word came back ${later.err || JSON.stringify(later.r)}`);
    await q("insert into public.hr_name_blocklist (stem, kind, match) values ('zqxlater', 'obscene', 'substring')");

    // ── S2 + S3 ON READ: the new player's history ──────────────────────────
    await gate();
    const hist = await as('authenticated', B, 'select public.hr_chat_recent(0) as r');
    const bodiesOf = (hist.r?.lines || []).map((l) => l.body);
    ok('S2', hist.r?.ok === true && !(hist.r.lines || []).some((l) => l.id === old),
      `hr_chat_recent returned the line from before the epoch: ${hist.err || JSON.stringify(bodiesOf)}`);
    ok('S2', bodiesOf.includes(`what the ***** ***** Scunthorpe classic [[item:${item}]]`), `CONTROL: the fresh line is missing: ${JSON.stringify(bodiesOf)}`);
    ok('S3', bodiesOf.includes('******** is fine today') && !bodiesOf.some((b) => /zqxlater/.test(b)),
      `a word listed after the line was written is not masked in the history: ${JSON.stringify(bodiesOf)}`);
    for (const role of ['authenticated', 'anon']) {
      const d = await as(role, role === 'anon' ? null : B, 'select count(*)::int as r from public.chat_messages where id = $1', [old]);
      ok('S2', !d.err && d.r === 0, `${role} read the line from before the epoch directly (${d.err || d.r})`);
    }
    const dw = await as('authenticated', B, 'select count(*)::int as r from public.chat_whispers where id = $1', [oldW]);
    ok('S2', !dw.err && dw.r === 0, `the recipient read the whisper from before the epoch directly (${dw.err || dw.r})`);
    const live = await as('authenticated', B, "select count(*)::int as r from public.chat_messages where channel = 'global'");
    ok('S2', !live.err && live.r === 2, `CONTROL: a direct select sees ${live.err || live.r} fresh global line(s), expected 2`);
    await gate();
    const wh = await as('authenticated', B, 'select public.hr_whispers_recent() as r');
    const wl = wh.r?.lines || [];
    ok('S2', wh.r?.ok === true && !wl.some((l) => l.id === oldW) && wl.some((l) => l.body === 'you are a *****'),
      `hr_whispers_recent answered ${wh.err || JSON.stringify(wl.map((l) => l.body))}`);

    // ── S4. NO CLIENT BYPASS ────────────────────────────────────────────────
    for (const role of ['authenticated', 'anon']) {
      const uid = role === 'anon' ? null : B;
      const r = await as(role, uid, 'select history_hours as r from public.hr_chat_config');
      ok('S4', !r.err && r.r === 24, `CONTROL: ${role} cannot read the window the floor needs (${r.err || r.r})`);
      const u = await as(role, uid, "update public.hr_chat_config set history_epoch = '2000-01-01' where id returning 1 as r");
      ok('S4', !!u.err || u.r === undefined, `${role} moved the epoch`);
      const m = await as(role, uid, "select public.hr_chat_mask('x') as r");
      ok('S4', !!m.err, `${role} ran hr_chat_mask`);
    }
    let back = null;
    try { await q("update public.hr_chat_config set history_epoch = now() - interval '30 days' where id"); }
    catch (e) { back = e.message; }
    ok('S4', !!back, 'the owner moved the epoch backward (the dev chat would come back)');
  } finally {
    await db.close?.();
  }
  return fails;
}

const mutate = process.argv.includes('--mutate');
if (!mutate) {
  const fails = await run(null);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `chat-stream-safe: ${fails.length} arm(s) RED`
    : 'chat-stream-safe: history from the epoch only; listed words masked on write and read; links kept; no client bypass');
  process.exit(fails.length ? 1 : 0);
}
let bad = 0;
const clean = await run(null);
if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
console.log('  ✓ clean control green');
for (const name of Object.keys(MUTATIONS)) {
  let fails;
  try { fails = await run(name); } catch (e) { fails = null; console.log(`  ✗ ${name} — harness error: ${String(e.message).split('\n')[0]}`); bad++; continue; }
  if (fails.length) console.log(`  ✓ ${name} — caught (${fails[0].slice(0, 110)})`);
  else { console.log(`  ✗ ${name} — NOT caught (${MUTATIONS[name].why})`); bad++; }
}
const n = Object.keys(MUTATIONS).length;
console.log(bad ? `chat-stream-safe --mutate: ${bad} escaped` : `chat-stream-safe --mutate: ${n}/${n} mutants caught`);
process.exit(bad ? 1 : 0);
