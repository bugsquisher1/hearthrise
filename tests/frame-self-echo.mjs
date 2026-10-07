#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/frame-self-echo.mjs — A PLAYER'S OWN WRITE IS NOT PUSHED BACK TO THEM;
//                             EVERYTHING ELSE STILL IS; NO CLIENT CAN FORGE IT.
//
//   node tests/frame-self-echo.mjs            # the guard
//   node tests/frame-self-echo.mjs --mutate   # plant each defect, require it caught
//
// Ships with supabase/migrations/2026-10-09-frame-self-echo.sql and
// supabase/functions/hr-accrue/frame-self.js. The client half (the gap heal
// that replaces the self-frame as the safety net) is tests/live-frame-subscribe.mjs
// L15–L20.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   F1  EDGE MARKER  frameSelfMarker is '<lower uuid>:<slot>' for a verified
//                    identity and null for anything else.
//   F2  EDGE SITES   every PLAYER-PATH transaction in index.ts marks itself
//                    right after `set local role hr_engine`, the marker is
//                    built from the verified `user`, and the TICK path
//                    (execTick) never marks.
//   F3  LATER FILES  every literal `create or replace function
//                    public.hr_frame_wanted(` at or after the file reads the
//                    tick origin BEFORE the self marker and keeps the engine
//                    role and JWT-claim bindings (a restatement from an older
//                    text would silently reopen what this closes).
//   F4  ★ EXECUTED on the replayed chain's FINAL state (so a later file that
//                    restates the gate is measured, not only this file's own
//                    self-check at its own position):
//                    · own HTTP write under the marker → NO frame on own topic
//                    · the same write unmarked → ONE frame (the control)
//                    · another character written in the marked transaction → sent
//                    · ★ a WORLD-TICK settle for the same character, online,
//                      marker still set → ONE frame (attended tick)
//                    · an OFFLINE tick → no frame (away: unchanged 10-07 rule)
//                    · ★ FORGED: the marker in a PostgREST-shaped request (JWT
//                      claims present) → frame sent; in an owner session → sent
//   --mutate         plants five defects into the migration and requires its
//                    own §9 self-check to refuse each one (the mutation proof
//                    that a forged/client-set marker cannot suppress a frame),
//                    plus two edge defects F2 must catch.
//
// Exit: 0 green · 1 a finding · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { frameSelfMarker } from '../supabase/functions/hr-accrue/frame-self.js';

const OWN = '2026-10-09-frame-self-echo.sql';
const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => {
  let inStr = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "'") inStr = !inStr;
    else if (!inStr && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');

// ── F1 ──────────────────────────────────────────────────────────────────
function checkMarker() {
  const u = '0B5E7C1A-1111-4222-8333-944455556666';
  ok(frameSelfMarker(u, 0) === u.toLowerCase() + ':0', 'F1', 'a verified identity did not mark as <lower uuid>:<slot>');
  ok(frameSelfMarker(u, 5) === u.toLowerCase() + ':5', 'F1', 'slot 5 did not mark');
  for (const [uu, s] of [[u, 6], [u, -1], [u, 1.5], [u, '0'], ['not-a-uuid', 0], [null, 0], [u + 'x', 0], [{}, 0]]) {
    ok(frameSelfMarker(uu, s) === null, 'F1', 'a malformed identity (' + String(uu) + ', ' + String(s) + ') marked');
  }
}

// ── F2 ──────────────────────────────────────────────────────────────────
export function checkEdge(ts) {
  const found = [];
  const say = (m) => found.push('F2: ' + m);
  const code = ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const role = [...code.matchAll(/await tx`set local role hr_engine`;/g)];
  const tickAt = code.indexOf('const execTick');
  const tickEnd = tickAt < 0 ? -1 : code.indexOf('}) as unknown as Record<string, any>[];', tickAt);
  if (tickAt < 0 || tickEnd < 0) { say('index.ts has no execTick, so the tick path cannot be told apart'); return found; }
  if (/markSelf|hr\.frame_self/.test(code.slice(tickAt, tickEnd))) say('the TICK path marks itself as a requester');
  let player = 0;
  for (const m of role) {
    if (m.index > tickAt && m.index < tickEnd) continue;
    player += 1;
    const next = code.slice(m.index + m[0].length).trimStart();
    if (!next.startsWith('await markSelf(tx);')) {
      say('a player-path transaction at offset ' + m.index + ' does not mark itself right after its role');
    }
  }
  if (player < 5) say('only ' + player + ' player-path transactions found (expected >= 5: exec, read, seed, two applies)');
  if (!/const selfMarker = frameSelfMarker\(user, slot\);/.test(code)) {
    say('the marker is not built from the verified `user` and the parsed `slot`');
  }
  if (!/set_config\('hr\.frame_self', \$\{selfMarker\}, true\)/.test(code)) {
    say('markSelf does not set hr.frame_self TRANSACTION-locally from selfMarker');
  }
  return found;
}

// ── F3 ──────────────────────────────────────────────────────────────────
export function checkLaterFiles(files) {
  const found = [];
  const at = files.findIndex((f) => f.name === OWN);
  if (at < 0) return [`F3: ${OWN} is not in the apply order`];
  for (const f of files.slice(at)) {
    const sql = strip(f.text);
    const re = /create\s+or\s+replace\s+function\s+public\.hr_frame_wanted\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const end = sql.indexOf('$fn$;', m.index);
      const body = sql.slice(m.index, end < 0 ? sql.length : end);
      const o = body.indexOf("current_setting('hr.frame_origin', true)");
      const s = body.indexOf("current_setting('hr.frame_self', true)");
      if (o < 0 || s < 0 || o > s) found.push(`F3: ${f.name} defines hr_frame_wanted without the tick branch before the self branch`);
      if (!/current_setting\('role', true\)/.test(body) || !/is distinct from 'hr_engine'/.test(body)) {
        found.push(`F3: ${f.name} defines hr_frame_wanted without the hr_engine role binding`);
      }
      if (!/request\.jwt\.claims/.test(body) || !/request\.jwt\.claim\.sub/.test(body)) {
        found.push(`F3: ${f.name} defines hr_frame_wanted without the JWT-claim binding`);
      }
    }
  }
  return found;
}

// ── F4 ──────────────────────────────────────────────────────────────────
const U = '00000000-0000-4000-8000-0000000f5e11';
const O = '00000000-0000-4000-8000-0000000f5e12';
async function executed(db) {
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const frames = async (u) => Number((await one(
    'select count(*)::int as n from realtime.messages where topic = public.hr_frame_topic($1::uuid, 0)', [u])).n);
  const apply = async (u, id) => {
    const { version } = await one('select version from public.player_state where user_id = $1 and slot = 0', [u]);
    await db.exec('set local role hr_engine');
    const r = (await one(`select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid,
        jsonb_build_object('gold', 13, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
          'meta', jsonb_build_object('src', 'guard-http', 'qty', 1)))) as r`, [u, version, id])).r;
    await db.exec('reset role');
    if (!r || r.ok !== true) throw new Error('harness: probe hr_apply refused: ' + JSON.stringify(r));
  };
  const mark = (v) => db.query("select set_config('hr.frame_self', $1, true)", [v]);
  await db.exec('begin');
  try {
    const realtimeAbsent = !(await one("select to_regnamespace('realtime') is not null as x")).x;
    if (realtimeAbsent) {
      await db.exec(`create schema realtime;
        create table realtime.messages (id bigserial primary key, topic text not null, event text, payload jsonb,
          private boolean, inserted_at timestamptz not null default now());
        create function realtime.send(jsonb, text, text, boolean default true) returns void language sql as
          'insert into realtime.messages (topic, event, payload, private) values ($3, $2, $1, $4)';`);
    }
    const act = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1")).activity_id;
    await db.query('insert into auth.users (id) values ($1), ($2) on conflict do nothing', [U, O]);
    await db.query(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
        active_kind, active_id, active_since)
      values ($1, 0, 1000, 0, 10, 10, 1, date_trunc('second', now()) - interval '20 minutes', 'gather', $3,
              date_trunc('second', now()) - interval '80 minutes'),
             ($2, 0, 1000, 0, 10, 10, 1, date_trunc('second', now()) - interval '20 minutes', 'idle', null, null)`,
    [U, O, act]);
    await db.query(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
      values ($1, 0, 'gather', true, 'guard-selfecho', now() + interval '5 minutes')`, [U]);
    await db.exec(`update public.hr_tick_config set enabled = true,
        channels = (select array_agg(distinct c order by c) from unnest(channels || array['gather']) c),
        frame_push = true where id;
      update public.hr_tick_config set armed_channels = array['gather'] where id;`);

    /* Every count is a DELTA across one step, so one regression reads as one finding. */
    const step = async (u, fn) => { const a = await frames(u); await fn(); return (await frames(u)) - a; };
    ok(await step(U, () => apply(U, '00000000-0000-4000-8000-0000000f5d00')) === 1, 'F4',
      'the unmarked control write did not push exactly one frame');
    await mark(U + ':0');
    ok(await step(U, () => apply(U, '00000000-0000-4000-8000-0000000f5d01')) === 0, 'F4',
      '★ the player\'s OWN write was pushed back to the player\'s own topic');
    ok(await step(O, () => apply(O, '00000000-0000-4000-8000-0000000f5d02')) === 1, 'F4',
      'another character written inside the marked transaction got no frame');

    /* ★ WORLD-TICK, ONLINE (attended), marker still set → a frame. */
    await db.query('update public.player_state set last_seen_at = now() where user_id = $1 and slot = 0', [U]);
    const tick = async (from, to, id) => {
      const { version } = await one('select version from public.player_state where user_id = $1 and slot = 0', [U]);
      await db.exec('set local role hr_engine');
      const r = (await one(`select public.hr_tick_settle('guard-selfecho', $1::uuid, 0, 'gather', $2::bigint,
          date_trunc('second', now()) - $3::interval, date_trunc('second', now()) - $4::interval, $5::uuid,
          jsonb_build_object('gold', 13, 'accrued_to', to_jsonb(date_trunc('second', now()) - $4::interval),
            'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
              'meta', jsonb_build_object('src', 'tick', 'qty', 1, 'ticks', 1)))) as r`,
      [U, version, from, to, id])).r;
      await db.exec('reset role');
      await db.query("select set_config('hr.frame_origin', '', true)");
      if (!r || r.ok !== true || r.mode !== 'armed') throw new Error('harness: probe tick settle did not pay: ' + JSON.stringify(r));
    };
    ok(await step(U, () => tick('20 minutes', '16 minutes', '00000000-0000-4000-8000-0000000f5d03')) === 1, 'F4', '★ a WORLD-TICK settle for the requester (online) was not pushed — the marker silenced a tick frame');
    /* AWAY: offline → no tick frame, marker or not (the 10-07 rule, unchanged). */
    await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [U]);
    ok(await step(U, () => tick('16 minutes', '12 minutes', '00000000-0000-4000-8000-0000000f5d04')) === 0, 'F4', 'an OFFLINE tick settle pushed a frame (the 10-07 online-only rule regressed)');

    /* ★ FORGED: client-shaped request (JWT claims present) and an owner session. */
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U, role: 'authenticated' })]);
    const forged = await step(U, () => apply(U, '00000000-0000-4000-8000-0000000f5d05'));
    await db.query("select set_config('request.jwt.claims', '', true)");
    ok(forged === 1, 'F4', '★ a self marker inside a client-shaped request (JWT claims) suppressed a frame');
    const owner = (await one('select public.hr_frame_wanted($1::uuid, 0) as w', [U])).w;
    ok(owner === true, 'F4', 'an OWNER session honoured the self marker; only the engine role may');
  } finally {
    await db.exec('rollback');
  }
}

/** The mutation catalogue: each plants a defect in the migration; the file's
 *  own §9 must refuse it with the named check. */
const SQL_MUTANTS = [
  { id: 'claims_binding_dropped', expect: 'e5', why: 'a client-shaped request (JWT claims) can silence a frame',
    from: "  if nullif(current_setting('request.jwt.claims', true), '') is not null\n     or nullif(current_setting('request.jwt.claim.sub', true), '') is not null then\n    return true;\n  end if;\n  return false;",
    to: '  return false;' },
  { id: 'role_binding_dropped', expect: 'c1', why: 'any session (owner, migration) honours the marker',
    from: "  if v_role is distinct from 'hr_engine' then return true; end if;", to: '' },
  { id: 'marker_unbound', expect: 'e2', why: 'the marker silences every frame in the transaction, not only the requester\'s',
    from: "  if lower(v_self) <> p_user::text || ':' || p_slot::text then return true; end if;", to: '' },
  { id: 'self_before_tick', expect: 'c0b', why: 'the self marker is read before the tick origin, so it can reach a tick frame',
    from: "  -- ── (1) A TICK. Checked FIRST",
    to: "  if coalesce(current_setting('hr.frame_self', true), '') = p_user::text || ':' || p_slot::text\n     and coalesce(current_setting('role', true), '') = 'hr_engine' then return false; end if;\n  -- ── (1) A TICK. Checked FIRST" },
  { id: 'never_suppresses', expect: 'e1', why: 'the marker is read and ignored, so every self-echo still ships',
    from: "    return true;\n  end if;\n  return false;\nend $fn$;", to: "    return true;\n  end if;\n  return true;\nend $fn$;" },
];

async function loadFiles() {
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  return Promise.all(order.map(async (name) => ({
    name, text: (await readFile(join(ROOT, 'supabase', 'migrations', name), 'utf8')).replace(/\r\n/g, '\n') })));
}

async function main() {
  const ts = (await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8')).replace(/\r\n/g, '\n');
  checkMarker();
  problems.push(...checkEdge(ts));
  const files = await loadFiles();
  problems.push(...checkLaterFiles(files));

  let db;
  try { ({ db } = await bootReplay({})); } catch (e) {
    console.error('harness: the chain does not replay: ' + ((e && e.message) || e));
    process.exit(2);
  }
  try { await executed(db); } catch (e) {
    if (String(e && e.message).startsWith('harness:')) { console.error(e.message); process.exit(2); }
    throw e;
  }

  if (MUTATE) {
    let bad = 0;
    for (const m of SQL_MUTANTS) {
      let verdict = 'APPLIED';
      try {
        await bootReplay({ patches: new Map([[OWN, [[m.from, m.to]]]]), upTo: LAST_PATCHED });
      } catch (e) {
        verdict = String((e && e.message) || e);
        if (e && e.harness) { console.error('  ✗ ' + m.id + ': harness — ' + verdict.split('\n')[0]); bad += 1; continue; }
      }
      const caught = verdict !== 'APPLIED' && new RegExp('\\b' + m.expect + '\\b').test(verdict);
      if (caught) console.log('  ✓ ' + m.id + ' refused by §9 ' + m.expect + ' — ' + m.why);
      else { bad += 1; console.error('  ✗ ' + m.id + ' NOT refused by §9 ' + m.expect + ' (' + verdict.split('\n')[0].slice(0, 200) + ')'); }
    }
    /* F4's NEGATIVE CONTROL: the same executed claims against the chain WITHOUT
       this file (the 10-07 gate) must report the own-write echo, and nothing
       about tick or forged frames — so F4's green above is this file's doing. */
    {
      const order = files.map((f) => f.name);
      const prev = order[order.indexOf(OWN) - 1];
      const { db: before } = await bootReplay({ upTo: prev });
      const saved = problems.splice(0);
      await executed(before);
      const got = problems.splice(0);
      problems.push(...saved);
      const echo = got.some((p) => p.includes("OWN write was pushed back"));
      const other = got.filter((p) => !p.includes("OWN write was pushed back"));
      if (echo && !other.length) console.log('  ✓ F4 negative control: without the file, the own-write echo is reported (and only it)');
      else { bad += 1; console.error('  ✗ F4 negative control: without the file F4 reported ' + JSON.stringify(got)); }
    }
    const EDGE = [
      { id: 'tick_marks', from: '          await tx`set local role hr_engine`;\n          return await tx.unsafe(text, params as any[]);',
        to: '          await tx`set local role hr_engine`;\n          await markSelf(tx);\n          return await tx.unsafe(text, params as any[]);' },
      { id: 'apply_unmarked', from: '        await tx`set local role hr_engine`;\n        await markSelf(tx);\n        /* ⚠ `::text::jsonb`',
        to: '        await tx`set local role hr_engine`;\n        /* ⚠ `::text::jsonb`' },
    ];
    for (const m of EDGE) {
      if (ts.split(m.from).length !== 2) { bad += 1; console.error('  ✗ ' + m.id + ': anchor gone — the guard is stale'); continue; }
      const found = checkEdge(ts.replace(m.from, () => m.to));
      if (found.length) console.log('  ✓ ' + m.id + ' caught by F2');
      else { bad += 1; console.error('  ✗ ' + m.id + ' NOT caught by F2'); }
    }
    if (bad) { console.error('frame-self-echo --mutate: ' + bad + ' defect(s) not caught'); process.exit(1); }
  }

  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  console.log('frame-self-echo: OK — own writes are not echoed to their own topic; other characters, world-tick '
    + 'settles and every client-shaped request still get their frames' + (MUTATE ? '; every planted defect refused.' : '.'));
  process.exit(0);
}

main().catch((e) => { console.error('harness: ' + ((e && e.stack) || e)); process.exit(2); });
