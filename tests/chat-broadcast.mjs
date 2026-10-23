#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/chat-broadcast.mjs — EVERY STORED CHAT LINE AND WHISPER IS BROADCAST,
//                            ONCE, TO EXACTLY WHO MAY HEAR IT.
//
//   node tests/chat-broadcast.mjs           # the guard
//   node tests/chat-broadcast.mjs --mutate  # plant each defect, require its named refusal
//
// Ships with supabase/migrations/2026-12-26-chat-broadcast.sql and
// 2026-12-27-chat-unpublish.sql (chat left the postgres_changes WAL poller,
// 38.6 % of all database time, for private Broadcast). The client half is
// tests/chat-social.mjs RT-1/RT-2/RC-1/BL-2; the publication equality is
// tests/realtime-cost.mjs.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   B1  FINAL STATE, CATALOG: both senders are AFTER INSERT triggers, enabled, on
//       chat_messages / chat_whispers; hr_chat_broadcast fans a party line to the
//       audience's inboxes (never the sender, never a blocker) and a public line to
//       its one topic; hr_whisper_broadcast sends to the recipient's inbox only;
//       hr_realtime_policies installs the frame policy and hr_chat_receive (an
//       admitted player; the inbox by EQUALITY to auth.uid()) and no write policy;
//       the four functions are executable by no client role; supabase_realtime
//       carries neither chat table. So a later restatement from an older text is
//       red here, not silent (the files' self-checks run only at their position).
//   --mutate  plants twelve defects into 2026-12-26-chat-broadcast.sql and
//       requires its §5 to refuse each by NAME (an apply that fails for another
//       reason is not a catch).
//
// Exit: 0 green · 1 a finding · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';

const OWN = '2026-12-26-chat-broadcast.sql';
const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

// ── B1 ──────────────────────────────────────────────────────────────────
async function finalState(db) {
  const one = async (s) => (await db.query(s)).rows[0];
  const def = async (sig) => {
    const r = await one(`select replace(pg_get_functiondef(to_regprocedure('${sig}')), chr(13), '') as d`);
    return (r && r.d) || '';
  };
  const trg = await one(`select count(*)::int n from pg_trigger t
      where not t.tgisinternal and t.tgenabled <> 'D' and (t.tgtype & 4) = 4 and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1
        and ((t.tgrelid = 'public.chat_messages'::regclass and t.tgname = 'hr_chat_broadcast' and t.tgfoid = 'public.hr_chat_broadcast()'::regprocedure)
          or (t.tgrelid = 'public.chat_whispers'::regclass and t.tgname = 'hr_whisper_broadcast' and t.tgfoid = 'public.hr_whisper_broadcast()'::regprocedure))`);
  ok(trg && trg.n === 2, 'B1', `the two senders are not both AFTER INSERT FOR EACH ROW triggers, enabled (found ${trg && trg.n})`);
  const chat = await def('public.hr_chat_broadcast()');
  ok(/unnest\(coalesce\(new\.audience/.test(chat) && /a is distinct from new\.from_id/.test(chat)
    && /b\.blocker_id = a and b\.blocked_id = new\.from_id/.test(chat) && /public\.hr_chat_inbox_topic\(v_u\)/.test(chat)
    && /public\.hr_chat_topic\(new\.channel\)/.test(chat) && /public\.hr_chat_row\(new\)/.test(chat), 'B1',
    'hr_chat_broadcast no longer fans a party line to the audience inboxes (minus the sender and blockers) and a public line to its topic');
  const wh = await def('public.hr_whisper_broadcast()');
  ok(/public\.hr_chat_inbox_topic\(new\.to_id\)/.test(wh) && /b\.blocker_id = new\.to_id and b\.blocked_id = new\.from_id/.test(wh), 'B1',
    'hr_whisper_broadcast no longer sends to the recipient\'s inbox only, or no longer skips a blocker');
  const pol = await def('public.hr_realtime_policies()');
  ok(/"hr_frame_receive_own_topic"/.test(pol) && /"hr_chat_receive"/.test(pol)
    && /= 'chat:inbox:' \|\| \(select auth\.uid\(\)\)::text/.test(pol) && /public\.hr_admitted\(/.test(pol)
    && !/for\s+(insert|update|delete|all)\b/i.test(pol), 'B1',
    'hr_realtime_policies no longer installs the two receive-only policies (inbox by equality, admitted players), or installs a write policy');
  for (const sig of ['public.hr_chat_topic(text)', 'public.hr_chat_inbox_topic(uuid)', 'public.hr_chat_broadcast()', 'public.hr_whisper_broadcast()', 'public.hr_realtime_policies()']) {
    const g = await one(`select bool_or(has_function_privilege(r, '${sig}', 'EXECUTE')) x
        from unnest(array['anon', 'authenticated', 'service_role']) r where exists (select 1 from pg_roles where rolname = r)`);
    ok(g && g.x === false, 'B1', sig + ' is executable by a client role');
  }
  const pub = await one(`select count(*)::int n from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('chat_messages', 'chat_whispers')`);
  ok(pub && pub.n === 0, 'B1', 'supabase_realtime still publishes a chat table (the WAL poller decodes it for nobody)');
}

/** The mutation catalogue: each plants one defect in the migration; its §5 must refuse it with `expect`. */
const SQL_MUTANTS = [
  { id: 'party_to_sender', expect: 'c3b', why: 'a party line is pushed back to its own sender',
    from: '                  where a is not null and a is distinct from new.from_id\n', to: '                  where a is not null\n' },
  { id: 'party_ignores_block', expect: 'c3f', why: 'a party line reaches a member who blocked its sender',
    from: '                    and not exists (select 1 from public.chat_blocks b where b.blocker_id = a and b.blocked_id = new.from_id)\n', to: '' },
  { id: 'party_topic', expect: 'c3a', why: 'party lines go to one shared party topic whose join outlives the membership',
    from: "        perform realtime.send(v_msg, 'line', public.hr_chat_inbox_topic(v_u), true);",
    to: "        perform realtime.send(v_msg, 'line', 'chat:' || new.channel, true); exit;" },
  { id: 'no_global_topic', expect: 'c1a', why: 'the global channel has no topic, so no global line arrives live',
    from: "  select case when p_channel in ('global', 'system') or", to: "  select case when p_channel in ('system') or" },
  { id: 'audience_leaks', expect: 'c1b', why: 'the pushed line is the raw row, party audience (user ids) included',
    from: "    v_msg := jsonb_build_object('t', 'line', 'line', public.hr_chat_row(new));",
    to: "    v_msg := jsonb_build_object('t', 'line', 'line', to_jsonb(new));" },
  { id: 'whisper_to_global', expect: 'c4a', why: 'a whisper is broadcast on chat:global, to everyone',
    from: "                          public.hr_chat_inbox_topic(new.to_id), true);", to: "                          'chat:global', true);" },
  { id: 'whisper_ignores_block', expect: 'c4d', why: 'a whisper that reached the table past a block is still pushed to the blocker',
    from: "       or exists (select 1 from public.chat_blocks b where b.blocker_id = new.to_id and b.blocked_id = new.from_id) then",
    to: '       then' },
  { id: 'inbox_any_uid', expect: 'c5a', why: 'any player may join any inbox (a prefix test, not an equality)',
    from: "             or (select realtime.topic()) = 'chat:inbox:' || (select auth.uid())::text)",
    to: "             or (select realtime.topic()) like 'chat:inbox:%')" },
  { id: 'inbox_suffix', expect: 'c5g', why: 'an inbox topic with a suffix is receivable (a prefix bound by the uid, not the whole topic)',
    from: "             or (select realtime.topic()) = 'chat:inbox:' || (select auth.uid())::text)",
    to: "             or (select realtime.topic()) like 'chat:inbox:' || (select auth.uid())::text || '%')" },
  { id: 'not_admitted_hears', expect: 'c5f', why: 'a player the closed game does not admit hears chat:global',
    from: "        and (select public.hr_admitted((select auth.uid())))\n", to: '' },
  { id: 'client_write_policy', expect: 'c5h', why: 'an INSERT policy lets a client broadcast a line as anyone',
    from: "  return 2;\nend $fn$;", to: "  execute 'create policy \"hr_probe_client_send\" on realtime.messages for insert to authenticated with check (true)';\n  return 2;\nend $fn$;" },
  { id: 'push_fails_line', expect: 'c6', why: 'a push failure rolls back the line it was pushing',
    from: "  exception when others then\n    raise warning 'hr_chat_broadcast: line % not pushed (%) — it is stored; the next read shows it', new.id, sqlerrm;\n  end;",
    to: '  end;' },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay({})); } catch (e) {
    console.error('harness: the chain does not replay: ' + ((e && e.message) || e));
    process.exit(2);
  }
  await finalState(db);

  if (MUTATE) {
    let bad = 0;
    const own = (await readFile(join(ROOT, 'supabase', 'migrations', OWN), 'utf8')).replace(/\r\n/g, '\n');
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
      if (caught) console.log('  ✓ ' + m.id + ' refused by §5 ' + m.expect + ' — ' + m.why);
      else { bad += 1; console.error('  ✗ ' + m.id + ' NOT refused by §5 ' + m.expect + ' (' + verdict.split('\n')[0].slice(0, 240) + ')'); }
    }
    if (bad) { console.error('chat-broadcast --mutate: ' + bad + ' defect(s) not caught'); process.exit(1); }
  }

  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  console.log('chat-broadcast: OK — every stored line and whisper is broadcast once, to exactly who may hear it; '
    + 'no client can send; the chat tables are unpublished' + (MUTATE ? '; every planted defect refused by name.' : '.'));
  process.exit(0);
}

main().catch((e) => { console.error('harness: ' + ((e && e.stack) || e)); process.exit(2); });
