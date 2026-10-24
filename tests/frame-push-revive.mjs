#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/frame-push-revive.mjs — A COMMITTED SETTLE AND AN ACCEPTED WRITE EACH
//                               PUSH THE WHOLE CHARACTER, ONCE, TO AN OPEN CLIENT.
//
//   node tests/frame-push-revive.mjs           # the guard
//   node tests/frame-push-revive.mjs --mutate  # plant each defect, require its named refusal
//
// Ships with supabase/migrations/2026-12-25-frame-push-revive.sql (the push
// channel was dead: frame_push never armed, the instance settle never emitted,
// the online gate read a stamp nothing writes). The client half is
// tests/session-core.mjs (ENV-3/ENV-4/CHAN-2/HUNT-3).
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   P1  FINAL STATE, CATALOG: the replayed chain's LAST hr_hunt_apply_instance
//       sets hr.frame_defer before its member sub-transaction, clears it on the
//       refused exit and at the commit point, and calls hr_frame_send in a loop
//       AFTER the instance row is written; hr_frame_send reads the switch, the
//       defer, the gate and the size ceiling before realtime.send; hr_frame_wanted
//       reads character_presence; frame_push is armed; the key-subset delta
//       (frame_keys, hr_frame_payload(jsonb,text[])) is gone. So a later file
//       that restates any of the three from an older text is red here, not
//       silent (the file's own §6 only runs at its own position).
//   P2  LATER FILES: every literal `create or replace function
//       public.hr_frame_send(` at or after the file keeps the defer before the
//       gate before the send.
//   --mutate  plants twelve defects into the migration and requires its §6 to
//       refuse each by NAME (an apply that fails for another reason is not a
//       catch): the defer gone, the commit-point loop gone, the gate open to
//       closed characters, the TTL widened, a future stamp counted, the echo
//       rule gone, a delta payload, the arm missing, the RLS uid binding gone,
//       a client write policy, the defer never cleared (commit point, refused
//       exit); and a stale later restatement P2 must name.
//
// Exit: 0 green · 1 a finding · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';

const OWN = '2026-12-25-frame-push-revive.sql';
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

/** Positions of each needle in order; true when every one is present and they appear in that order. */
const inOrder = (text, needles) => {
  let at = -1;
  for (const n of needles) { const i = text.indexOf(n, at + 1); if (i < 0 || i <= at) return false; at = i; }
  return true;
};

// ── P1 ──────────────────────────────────────────────────────────────────
async function finalState(db) {
  const one = async (s) => (await db.query(s)).rows[0];
  const def = async (sig) => {
    const r = await one(`select replace(pg_get_functiondef(to_regprocedure('${sig}')), chr(13), '') as d`);
    return r && r.d ? strip(r.d) : '';
  };
  const inst = await def('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)');
  ok(inOrder(inst, ["set_config('hr.frame_defer', 'instance', true)", 'public.hr_hunt_apply_member(']), 'P1',
    'hr_hunt_apply_instance no longer defers hr_apply\'s frame call before the member loop');
  ok(inOrder(inst, ["exception when sqlstate 'HR000' then", "set_config('hr.frame_defer', '', true)", 'public.hr_hunt_settle_refused(']), 'P1',
    'hr_hunt_apply_instance\'s refused exit no longer clears hr.frame_defer (every later write in the transaction would be silent)');
  ok(inOrder(inst, ['update public.hunt_instances', "set_config('hr.frame_defer', '', true)", 'public.hr_frame_send(', "return jsonb_build_object('ok', true, 'members'"]), 'P1',
    'hr_hunt_apply_instance no longer sends one frame per member AFTER the instance row lands (the settle push is dead again)');
  const send = await def('public.hr_frame_send(uuid,integer,jsonb)');
  ok(inOrder(send, ['coalesce(v_on, false)', 'hr.frame_defer', 'public.hr_frame_wanted(p_user, p_slot)', 'c_max_bytes then', 'perform realtime.send(']), 'P1',
    'hr_frame_send no longer reads switch -> defer -> gate -> size -> send in order');
  ok(/'state'/.test(await def('public.hr_frame_payload(jsonb)')), 'P1', 'hr_frame_payload(jsonb) is missing or no longer builds the whole-state frame');
  ok(/public\.character_presence/.test(await def('public.hr_frame_wanted(uuid,integer)')), 'P1',
    'hr_frame_wanted no longer reads character_presence (the stamp the rebuilt client writes)');
  const cfg = await one(`select frame_push,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'frame_keys') as keys,
      to_regprocedure('public.hr_frame_payload(jsonb,text[])') is not null as delta
    from public.hr_tick_config where id`);
  ok(cfg && cfg.frame_push === true, 'P1', 'frame_push is not armed in the replayed chain');
  ok(cfg && !cfg.keys && !cfg.delta, 'P1', 'the key-subset delta (frame_keys / hr_frame_payload(jsonb,text[])) is back');
}

// ── P2 ──────────────────────────────────────────────────────────────────
export function checkLaterFiles(files) {
  const found = [];
  const at = files.findIndex((f) => f.name === OWN);
  if (at < 0) return [`P2: ${OWN} is not in the apply order`];
  for (const f of files.slice(at)) {
    const sql = strip(f.text);
    for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+public\.hr_frame_send\s*\(/gi)) {
      const end = sql.indexOf('$fn$;', m.index);
      const body = sql.slice(m.index, end < 0 ? sql.length : end);
      if (!inOrder(body, ['hr.frame_defer', 'public.hr_frame_wanted(p_user, p_slot)', 'perform realtime.send('])) {
        found.push(`P2: ${f.name} defines hr_frame_send without the defer before the gate before the send`);
      }
    }
  }
  return found;
}

/** The mutation catalogue: each plants one defect in the migration; its §6 must refuse it with `expect`. */
const SQL_MUTANTS = [
  { id: 'no_defer', expect: 's4a', why: 'hr_frame_send ignores hr.frame_defer, so hr_apply pushes a half-written settle from inside the member loop',
    from: "    if coalesce(current_setting('hr.frame_defer', true), '') <> '' then return; end if;\n", to: '' },
  { id: 'no_commit_frames', expect: 's4a', why: 'the commit-point loop sends nothing, so a settle (the one source of hunt news) pushes no frame',
    from: "      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,\n        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);",
    to: '      null;' },
  { id: 'closed_wanted', expect: 's2a', why: 'the presence gate is gone, so every write costs a frame to a topic nobody holds',
    from: "  if not exists (select 1 from public.character_presence cp\n                  where cp.user_id = p_user and cp.slot = p_slot\n                    and cp.seen_at >  now() - c_ttl\n                    and cp.seen_at <= now() + interval '60 seconds') then\n    return false;\n  end if;\n",
    to: '' },
  { id: 'ttl_hour', expect: 's2b', why: 'the open window is widened to an hour, so a tab closed 59 minutes ago still costs a frame per settle',
    from: "  c_ttl  constant interval := interval '75 seconds';", to: "  c_ttl  constant interval := interval '1 hour';" },
  { id: 'future_counts', expect: 's2c', why: 'a presence stamp from the future reads as open, so one bad clock pins frames on forever',
    from: "                    and cp.seen_at <= now() + interval '60 seconds') then", to: '                    ) then' },
  { id: 'no_echo_rule', expect: 's3h', why: 'the requester\'s own write is echoed back to the browser that already holds the envelope',
    from: "  if v_role is distinct from 'hr_engine' then return true; end if;", to: '  return true;' },
  { id: 'delta_payload', expect: 's3b', why: 'the frame is a key subset again, a record that claims a version it does not hold',
    from: "  return jsonb_build_object('t', 'state', 'frame', v_frame, 'env', p_env);",
    to: "  return jsonb_build_object('t', 'delta', 'frame', v_frame, 'patch', jsonb_build_object('state', p_env->'state'));" },
  { id: 'not_armed', expect: 's1', why: 'the arm is dropped, so the channel stays as dead as it was',
    from: 'update public.hr_tick_config set frame_push = true where id and not frame_push;', to: '' },
  { id: 'rls_any_uid', expect: 's5a', why: 'the frame policy stops binding the topic to auth.uid(), so any player receives any player\'s envelope',
    from: "        and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text\n", to: '' },
  { id: 'client_write_policy', expect: 's5f', why: 'an INSERT policy lets a client write its own topic: server impersonation',
    from: "  return 1;\nend $fn$;\nrevoke execute on function public.hr_realtime_policies() from public;",
    to: "  execute 'create policy \"hr_probe_client_send\" on realtime.messages for insert to authenticated with check (true)';\n  return 1;\nend $fn$;\nrevoke execute on function public.hr_realtime_policies() from public;" },
  { id: 'commit_defer_sticks', expect: 's4a', why: 'the commit point never clears hr.frame_defer, so its own frames and every later write are silent',
    from: "  perform set_config('hr.frame_defer', '', true);\n  v_proj := case", to: '  v_proj := case' },
  { id: 'refused_defer_sticks', expect: 's4h', why: 'a settle refused inside its member loop leaves hr.frame_defer set, so the rest of the transaction is silent',
    from: "    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing\n", to: '' },
];

async function loadFiles() {
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  return Promise.all(order.map(async (name) => ({
    name, text: (await readFile(join(ROOT, 'supabase', 'migrations', name), 'utf8')).replace(/\r\n/g, '\n') })));
}

async function main() {
  const files = await loadFiles();
  problems.push(...checkLaterFiles(files));
  let db;
  try { ({ db } = await bootReplay({})); } catch (e) {
    console.error('harness: the chain does not replay: ' + ((e && e.message) || e));
    process.exit(2);
  }
  await finalState(db);

  if (MUTATE) {
    let bad = 0;
    const own = files.find((f) => f.name === OWN).text;
    for (const m of SQL_MUTANTS) {
      if (own.split(m.from).length !== 2) { bad += 1; console.error('  ✗ ' + m.id + ': anchor matched ' + (own.split(m.from).length - 1) + ' times — the guard is stale'); continue; }
      let verdict = 'APPLIED';
      try {
        await bootReplay({ patches: new Map([[OWN, [[m.from, m.to]]]]), upTo: LAST_PATCHED });
      } catch (e) {
        verdict = String((e && e.message) || e);
        if (e && e.harness) { console.error('  ✗ ' + m.id + ': harness — ' + verdict.split('\n')[0]); bad += 1; continue; }
      }
      const caught = verdict !== 'APPLIED' && new RegExp('\\b' + m.expect + '\\b').test(verdict);
      if (caught) console.log('  ✓ ' + m.id + ' refused by §6 ' + m.expect + ' — ' + m.why);
      else { bad += 1; console.error('  ✗ ' + m.id + ' NOT refused by §6 ' + m.expect + ' (' + verdict.split('\n')[0].slice(0, 240) + ')'); }
    }
    /* P2's own proof: a later file restating hr_frame_send from the 10-07 text (no defer) is named. */
    const stale = files.concat([{ name: '2099-01-01-stale-send.sql',
      text: files.find((f) => f.name === '2026-10-07-frame-emit-online-only.sql').text }]);
    if (checkLaterFiles(stale).some((p) => p.includes('2099-01-01-stale-send.sql'))) console.log('  ✓ stale_restatement caught by P2');
    else { bad += 1; console.error('  ✗ stale_restatement NOT caught by P2'); }
    if (bad) { console.error('frame-push-revive --mutate: ' + bad + ' defect(s) not caught'); process.exit(1); }
  }

  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  console.log('frame-push-revive: OK — settles and accepted writes push the whole character once to an open client; '
    + 'the defer, the gate and the RLS hold' + (MUTATE ? '; every planted defect refused by name.' : '.'));
  process.exit(0);
}

main().catch((e) => { console.error('harness: ' + ((e && e.stack) || e)); process.exit(2); });
