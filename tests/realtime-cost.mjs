#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/realtime-cost.mjs — THE REALTIME PUBLICATION IS EXACTLY WHAT THE
//                           CLIENT SUBSCRIBES TO. NOT ONE TABLE MORE.
//
//   node tests/realtime-cost.mjs             # the guard
//   node tests/realtime-cost.mjs --list      # the mutation catalogue
//   node tests/realtime-cost.mjs --selftest  # every mutation must be CAUGHT
//   node tests/realtime-cost.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-06-realtime-publication-trim.sql
// Re-pointed by: 2026-12-26-chat-broadcast.sql + 2026-12-27-chat-unpublish.sql
//   (lane/c-realtime, 2026-10-23). Chat left postgres_changes for private
//   Broadcast: the WAL poller was 38.6 % of ALL database time (52.3M of
//   135.4M ms, 8.57M calls since 08-17) for the two chat tables. The equality
//   below now holds at {} = {}, and R4 is the control that makes {} = {} mean
//   "chat moved to Broadcast", not "chat stopped": the server sends every line
//   (the two AFTER INSERT triggers exist in the rebuilt chain) and the client
//   joins the private chat topics (src/social/realtime.js).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
// Measured on production (nezapsylztqbbwuwembx) 2026-09-06 over a 20.25-day
// pg_stat_statements window: the Realtime WAL poller is 2,706,517 calls /
// 15,669 s / mean 5.79 ms / max 9,847 ms — ~61% of all exec time in the
// database and ~36x the #2 statement. For TWO published tables, of which one
// (`market_buy_offers`) had no subscriber in src/** at all, and a third
// (`market_listings`) that the repo chain published, production never did, and
// a dead-code client subscription pointed at.
//
// That is the shape of the failure this guard exists to make impossible: the
// publication and the client's subscriptions drifting apart in EITHER
// direction. Published-but-unsubscribed is pure cost — per-write WAL decode
// plus an RLS evaluation per connected client, for events nobody reads.
// Subscribed-but-unpublished is a feature that silently never fires, which is
// exactly what the market panel shipped for months.
//
// So the assertion is an EQUALITY, not a budget:
//     {tables in publication supabase_realtime, per the repo chain}
//   == {tables named in a postgres_changes subscription under src/**}
// A cost cap alone would pass a database publishing the wrong table.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, replayed in
// PGlite (real PostgreSQL, in process), then `pg_publication_tables` is read
// out of the rebuilt catalog. The client half is a source scan of src/**,
// vendor excluded. Both halves are mutable, because a guard that can only be
// broken from one side is half a guard.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · What PRODUCTION publishes right now. This asserts the repo's chain.
//     The live set is measured by hand / by the ops pass; on 2026-09-06 it was
//     {chat_messages, market_buy_offers} and the chain said all three.
//   · The Realtime poll CADENCE. The 2.7M call count is the tenant's
//     poll_interval_ms, which is not a GUC, not SQL-settable and not exposed
//     in the dashboard — no repo-side guard can reach it.
//   · That chat actually delivers. That is a play-gate question.
// ════════════════════════════════════════════════════════════════════════
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT } from './schema-replay.mjs';

const MIG = '2026-09-06-realtime-publication-trim.sql';

/* THE LOAD-BEARING SET IS EMPTY since 2026-12-27-chat-unpublish.sql: no table is
   published and nothing under src/** is a postgres_changes subscription. A peer's
   line and a whisper reach another client by the server's private Broadcast
   (2026-12-26-chat-broadcast.sql), which R4 proves is in place. */
const EXPECTED = [];
const UNPUBLISH = '2026-12-27-chat-unpublish.sql';
/* A SQL mutant on the TRIM file replays only up to it (REPLAY SCOPE), where the
   publication was exactly chat_messages; it is judged on the publication alone
   (R1), because the client scanned is today's, not the one of that date. */
const AT_TRIM = ['chat_messages'];

/* ── A CONSUMER THAT IS COMING BACK, WITH A DATE ────────────────────────────
   A published table whose subscriber is being rebuilt may carry one dated row
   here ({ until, owner }); after `until` R3/R4 go red. It held chat_messages
   from the client reset (2026-10-17) until the chat window subscribed again
   (lane/chat, 2026-10-18), and is empty now: one row with a date and an owner
   when needed, never a standing exemption. */
const PENDING_CONSUMERS = {};
const pendingNow = (today, table) => !!PENDING_CONSUMERS[table] && today <= PENDING_CONSUMERS[table].until;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// ── mutations ───────────────────────────────────────────────────────────
// Two kinds: `sql` patches the migration text before replay; `src` patches the
// scanned client source in memory. Both must be CAUGHT by a named assertion.
const MUTATIONS = {
  buy_offers_left_published: {
    why: 'the market_buy_offers unpublish is neutered (and the migration\'s own self-check is '
       + 'widened so it does not abort first) — i.e. the exact pre-change state comes back: a '
       + 'published table with zero subscribers, paying WAL decode + per-client RLS forever. R1 must catch it.',
    sql: [
      ["                and schemaname = 'public' and tablename = 'market_buy_offers') then\n    alter publication supabase_realtime drop table public.market_buy_offers;",
       "                and schemaname = 'public' and tablename = 'market_buy_offers') and false then\n    alter publication supabase_realtime drop table public.market_buy_offers;"],
      ["declare v_set text; v_expected constant text := 'chat_messages';",
       "declare v_set text; v_expected text := 'chat_messages';"],
      ["  if v_set is distinct from v_expected then",
       "  v_expected := v_set;\n  if v_set is distinct from v_expected then"],
    ],
  },
  /* NOTE ON THE MUTATION THAT IS NOT HERE. "neuter the market_listings drop"
     is unobservable, and the reason is a finding in itself: 2026-08-17-market-v2
     does `drop table ... cascade` on market_listings, and dropping a table
     removes it from every publication. So §2 of the migration is a proven no-op
     against a clean replay. The observable defect in that direction is someone
     PUBLISHING it again, which is what this mutates instead. */
  listings_republished: {
    why: 'market_listings is put back in the publication with no client subscriber — WAL decode plus '
       + 'an RLS evaluation per connected player, on the busiest write path in the economy, delivered '
       + 'to nobody. This is the shape the whole file exists to prevent. R1 and R3 must catch it.',
    sql: [
      ["-- ── 4. SELF-CHECK — the commit gate ────────────────────────────────────────",
       "do $$ begin alter publication supabase_realtime add table public.market_listings;\n"
       + "exception when duplicate_object then null; end $$;\n"
       + "-- ── 4. SELF-CHECK — the commit gate ────────────────────────────────────────"],
      ["declare v_set text; v_expected constant text := 'chat_messages';",
       "declare v_set text; v_expected text := 'chat_messages';"],
      ["  if v_set is distinct from v_expected then",
       "  v_expected := v_set;\n  if v_set is distinct from v_expected then"],
    ],
  },
  chat_unpublished: {
    why: 'the trim goes one table too far and unpublishes chat_messages. This is the DANGEROUS '
       + 'direction — it is the cheapest possible database and multiplayer chat silently stops '
       + 'delivering, because nothing polls chat_messages. R1 and R3 must catch it. A guard that only '
       + 'watched cost would call this an improvement.',
    sql: [
      ["-- ── 4. SELF-CHECK — the commit gate ────────────────────────────────────────",
       "do $$ begin\n  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'\n"
       + "              and schemaname = 'public' and tablename = 'chat_messages') then\n"
       + "    alter publication supabase_realtime drop table public.chat_messages;\n  end if;\n"
       + "exception when undefined_object then null; end $$;\n"
       + "-- ── 4. SELF-CHECK — the commit gate ────────────────────────────────────────"],
      ["declare v_set text; v_expected constant text := 'chat_messages';",
       "declare v_set text; v_expected text := 'chat_messages';"],
      ["  if v_set is distinct from v_expected then",
       "  v_expected := v_set;\n  if v_set is distinct from v_expected then"],
      ["  if not exists (select 1 from pg_publication_tables\n                  where pubname = 'supabase_realtime'\n                    and schemaname = 'public' and tablename = 'chat_messages') then",
       "  if false then"],
    ],
  },
  market_subscription_returns: {
    why: 'a market_listings postgres_changes subscription is put in the client without the table '
       + 'being published — the original defect, a handler that can never fire, plus a live '
       + 'websocket channel per player for nothing. R2 must catch it.',
    srcExtra: { 'src/app/market-probe.js': "export const sub = (client, onChange) => client.channel('market-listings')\n"
      + "  .on('postgres_changes', { event: '*', schema: 'public', table: 'market_listings' }, () => onChange()).subscribe();\n" },
  },
  chat_consumer_removed: {
    why: 'the chat window\'s Broadcast joins are deleted (src/social/realtime.js gone): the server still '
       + 'sends every line and no client hears one — the {} = {} publication looks like a saving and is a '
       + 'dead chat. R4 must catch it.',
    srcDrop: ['src/social/realtime.js'],
  },
  chat_republished: {
    why: 'a later file puts chat_messages back in supabase_realtime (and the unpublish self-check is '
       + 'neutered so it does not abort first): the WAL poller decodes every chat write again for a '
       + 'client that no longer subscribes. R1 and R3 must catch it.',
    file: UNPUBLISH,
    sql: [
      ['-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────',
       'alter publication supabase_realtime add table public.chat_messages;\n'
       + '-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────'],
      ["  if v_txt is not null then raise exception 'u1:", "  if false then raise exception 'u1:"],
    ],
  },
  broadcast_sender_dropped: {
    why: 'the chat_messages broadcast trigger is dropped after the publication goes (and the unpublish '
       + 'checks are neutered): nothing publishes, nothing broadcasts, and chat is silently dead. '
       + 'R4 must catch it.',
    file: UNPUBLISH,
    sql: [
      ['-- ── §1 UNPUBLISH ─────', 'drop trigger hr_chat_broadcast on public.chat_messages;\n-- ── §1 UNPUBLISH ─────'],
      ["    raise exception 'u2:", "    raise notice 'u2:"],
    ],
  },
  postgres_changes_returns: {
    why: 'the chat client subscribes to chat_messages by postgres_changes again while the table is '
       + 'unpublished: a handler that can never fire, and the poller would be asked for it. R2 must catch it.',
    srcExtra: { 'src/social/chat-probe.js': "export const sub = (client, onRow) => client.channel('hr-chat-x')\n"
      + "  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.global' }, (m) => onRow(m.new)).subscribe();\n" },
  },
};

// ── the client half: which tables does src/** subscribe to? ─────────────
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

async function subscribedTables(srcExtra, srcDrop) {
  const files = await walk(join(ROOT, 'src'));
  const texts = [];
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (!(srcDrop || []).includes(rel)) texts.push([rel, (await readFile(f, 'utf8')).replace(/\r\n/g, '\n')]);
  }
  for (const [rel, text] of Object.entries(srcExtra || {})) texts.push([rel, text]);
  const found = new Map(); // table -> [where]
  for (const [rel, text] of texts) {
    if (!text.includes('postgres_changes')) continue;
    // every `table: '<name>'` inside a postgres_changes subscription object
    for (const m of text.matchAll(/postgres_changes'?\s*,\s*\{[^}]*table:\s*'([^']+)'/g)) {
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(rel);
    }
  }
  return found;
}

/* The client half of chat's Broadcast path: some file under src/** joins the private chat topics on the
   broadcast extension (the public channels' chat:<channel> and the account's chat:inbox:<uid>). */
async function chatBroadcastClient(srcExtra, srcDrop) {
  const files = await walk(join(ROOT, 'src'));
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
    if ((srcDrop || []).includes(rel)) continue;
    const text = (await readFile(f, 'utf8')).replace(/\r\n/g, '\n');
    if (/\.on\(\s*'broadcast'/.test(text) && text.includes("'chat:inbox:'") && /'chat:' \+/.test(text)
        && /private:\s*true/.test(text)) return true;
  }
  return Object.values(srcExtra || {}).some((t) => /\.on\(\s*'broadcast'/.test(t) && t.includes("'chat:inbox:'"));
}

// ── the database half ───────────────────────────────────────────────────
async function readDatabase(sqlPatches, file) {
  const patches = sqlPatches ? new Map([[file || MIG, sqlPatches]]) : undefined;
  const { db } = await bootReplay({ patches, upTo: LAST_PATCHED });
  const r = await db.query(
    `select tablename from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
      order by tablename`);
  const t = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relname in ('market_listings','market_buy_offers','chat_messages')`);
  /* THE SERVER HALF of chat's Broadcast path (2026-12-26-chat-broadcast.sql): both senders, enabled. */
  const s = await db.query(
    `select count(*)::int n from pg_trigger
      where not tgisinternal and tgenabled <> 'D'
        and ((tgrelid = to_regclass('public.chat_messages') and tgname = 'hr_chat_broadcast')
          or (tgrelid = to_regclass('public.chat_whispers') and tgname = 'hr_whisper_broadcast'))`);
  return { published: r.rows.map(x => x.tablename), tablesAlive: t.rows[0].n, senders: s.rows[0].n };
}

// ── the run ─────────────────────────────────────────────────────────────
async function run(mutation) {
  problems.length = 0;
  const m = mutation ? MUTATIONS[mutation] : null;
  if (mutation && !m) { console.error(`unknown mutation "${mutation}"`); process.exit(2); }

  const { published, tablesAlive, senders } = await readDatabase(m && m.sql, m && m.file);
  const subs = await subscribedTables(m && m.srcExtra, m && m.srcDrop);
  /* A mutant on the TRIM file is a database of that date: judged on its publication (R1) and R5 only. */
  const atTrim = !!(m && m.sql && !m.file);
  const expected = atTrim ? AT_TRIM : EXPECTED;
  const subscribed = [...subs.keys()].sort();
  const today = (m && m.today) || new Date().toISOString().slice(0, 10);
  const consumed = (t) => subscribed.includes(t) || pendingNow(today, t);

  // R1 — the publication is exactly the load-bearing set.
  ok(published.join(',') === expected.join(','),
    `R1 publication supabase_realtime should publish exactly [${expected.join(', ')}], `
    + `the repo chain publishes [${published.join(', ') || '(none)'}]`);
  if (atTrim) {
    ok(tablesAlive === 3, `R5 all three tables must still EXIST after the trim (unpublishing is not dropping); found ${tablesAlive}/3`);
    return problems.slice();
  }

  // R2 — nothing is subscribed that is not published (a handler that can never fire).
  for (const t of subscribed) {
    ok(published.includes(t),
      `R2 src/** subscribes to postgres_changes on "${t}" (${subs.get(t).join(', ')}) but the repo `
      + 'chain never publishes it — that handler can never fire, and it still costs a websocket channel');
  }

  // R3 — nothing is published that nobody subscribes to (pure poller cost).
  for (const t of published) {
    ok(consumed(t),
      `R3 publication carries "${t}" but no file under src/** subscribes to it`
      + (PENDING_CONSUMERS[t] ? ` and its pending consumer (${PENDING_CONSUMERS[t].owner}) was due by ${PENDING_CONSUMERS[t].until}` : '')
      + ' — every published table is WAL-decoded and RLS-evaluated per connected client on every poll, for nobody');
  }

  // R4 — CONTROL. R1-R3 are all satisfied by an EMPTY publication and an empty
  // client: two empty sets are equal, and that database is the cheapest one
  // there is. It is the right one only because chat moved to Broadcast: the
  // server sends every line (both senders in the chain) AND the client joins the
  // private chat topics. Either half missing is a dead chat, not a saving.
  ok(senders === 2,
    `R4 the chain installs ${senders}/2 chat broadcast senders (hr_chat_broadcast, hr_whisper_broadcast, enabled) — `
    + 'with the tables unpublished, nothing else delivers a peer\'s line or a whisper');
  ok(await chatBroadcastClient(m && m.srcExtra, m && m.srcDrop),
    'R4 no file under src/** joins the private chat topics on Broadcast (chat:<channel>, chat:inbox:<uid>) — '
    + 'the server sends every line to nobody');

  // R5 — CONTROL. The trim must UNPUBLISH, never DROP. A migration that deleted
  // the tables would satisfy R1-R4 and destroy the market.
  ok(tablesAlive === 3,
    `R5 all three tables must still EXIST after the trim (unpublishing is not dropping); found ${tablesAlive}/3`);

  return problems.slice();
}

const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
  process.exit(0);
}

const one = argv.find(a => a.startsWith('--mutate='));
if (argv.includes('--selftest')) {
  const base = await run(null);
  if (base.length) {
    console.error('SELFTEST ABORTED — the unmutated chain is already red:');
    for (const p of base) console.error('  ✗ ' + p);
    process.exit(1);
  }
  console.log('base: green');
  let bad = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    let caught;
    try { caught = await run(id); }
    catch (e) { caught = ['(replay threw: ' + e.message.split('\n')[0] + ')']; }
    if (caught.length) console.log(`  ✓ ${id} CAUGHT — ${caught[0]}`);
    else { bad++; console.error(`  ✗ ${id} NOT CAUGHT — ${m.why}`); }
  }
  if (bad) { console.error(`\nrealtime-cost: ${bad} mutation(s) slipped through.`); process.exit(1); }
  console.log(`\nrealtime-cost: base green, ${Object.keys(MUTATIONS).length}/${Object.keys(MUTATIONS).length} mutations caught.`);
  process.exit(0);
}

const res = await run(one ? one.split('=')[1] : null);
if (res.length) {
  for (const p of res) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('realtime-cost: OK — publication == client subscriptions == [' + EXPECTED.join(', ')
  + '], and chat is delivered by Broadcast (both senders in the chain, the client joins the private topics)');
