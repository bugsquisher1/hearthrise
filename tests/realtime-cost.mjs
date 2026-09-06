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
import { bootReplay, ROOT } from './schema-replay.mjs';

const MIG = '2026-09-06-realtime-publication-trim.sql';

/* THE LOAD-BEARING SET. `chat_messages` is the only table with a real
   subscriber and no fallback: src/net/supabase-chat-backend.js:150 is the ONLY
   path by which a peer's message reaches another client — the backend has
   fetch(channel, sinceTs) but nothing polls it. */
const EXPECTED = ['chat_messages'];

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
    why: 'the removed market_listings postgres_changes subscription is put back in the client without '
       + 'the table being published — the original defect, a handler that can never fire, plus a live '
       + 'websocket channel per player for nothing. R2 must catch it.',
    src: [['     Reinstating this needs the table published in the SAME change. */',
           "     Reinstating this needs the table published in the SAME change. */\n"
           + "  subscribe(onChange) {\n"
           + "    this._sub = client.channel('market-listings')\n"
           + "      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_listings' },\n"
           + "        () => onChange()).subscribe();\n"
           + "  },"]],
  },
  chat_subscription_lost: {
    why: 'the chat postgres_changes subscription is deleted from the client while the table stays '
       + 'published — chat stops working AND the publication keeps paying for it. R3 must catch it.',
    src: [["table: 'chat_messages'", "table: 'chat_messages_REMOVED'"]],
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

async function subscribedTables(srcPatches) {
  const files = await walk(join(ROOT, 'src'));
  const found = new Map(); // table -> [where]
  for (const f of files) {
    let text = (await readFile(f, 'utf8')).replace(/\r\n/g, '\n');
    if (srcPatches && f.endsWith('supabase-market-backend.js')) {
      for (const [find, repl] of srcPatches) {
        if (text.includes(find)) text = text.split(find).join(repl);
      }
    }
    if (srcPatches && f.endsWith('supabase-chat-backend.js')) {
      for (const [find, repl] of srcPatches) {
        if (text.includes(find)) text = text.split(find).join(repl);
      }
    }
    if (!text.includes('postgres_changes')) continue;
    // every `table: '<name>'` inside a postgres_changes subscription object
    for (const m of text.matchAll(/postgres_changes'?\s*,\s*\{[^}]*table:\s*'([^']+)'/g)) {
      const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(rel);
    }
  }
  return found;
}

// ── the database half ───────────────────────────────────────────────────
async function readDatabase(sqlPatches) {
  const patches = sqlPatches ? new Map([[MIG, sqlPatches]]) : undefined;
  const { db } = await bootReplay({ patches });
  const r = await db.query(
    `select tablename from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
      order by tablename`);
  const t = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relname in ('market_listings','market_buy_offers','chat_messages')`);
  return { published: r.rows.map(x => x.tablename), tablesAlive: t.rows[0].n };
}

// ── the run ─────────────────────────────────────────────────────────────
async function run(mutation) {
  problems.length = 0;
  const m = mutation ? MUTATIONS[mutation] : null;
  if (mutation && !m) { console.error(`unknown mutation "${mutation}"`); process.exit(2); }

  const { published, tablesAlive } = await readDatabase(m && m.sql);
  const subs = await subscribedTables(m && m.src);
  const subscribed = [...subs.keys()].sort();

  // R1 — the publication is exactly the load-bearing set.
  ok(published.join(',') === EXPECTED.join(','),
    `R1 publication supabase_realtime should publish exactly [${EXPECTED.join(', ')}], `
    + `the repo chain publishes [${published.join(', ') || '(none)'}]`);

  // R2 — nothing is subscribed that is not published (a handler that can never fire).
  for (const t of subscribed) {
    ok(published.includes(t),
      `R2 src/** subscribes to postgres_changes on "${t}" (${subs.get(t).join(', ')}) but the repo `
      + 'chain never publishes it — that handler can never fire, and it still costs a websocket channel');
  }

  // R3 — nothing is published that nobody subscribes to (pure poller cost).
  for (const t of published) {
    ok(subscribed.includes(t),
      `R3 publication carries "${t}" but no file under src/** subscribes to it — every published `
      + 'table is WAL-decoded and RLS-evaluated per connected client on every poll, for nobody');
  }

  // R4 — CONTROL. R1-R3 are all satisfied by an EMPTY publication and an empty
  // client: two empty sets are equal, and that database is the cheapest one
  // there is. Name the table whose absence is a broken game, not a saving.
  ok(published.includes('chat_messages') && subscribed.includes('chat_messages'),
    'R4 chat_messages must be BOTH published and subscribed — src/net/supabase-chat-backend.js:150 is '
    + 'the only peer-delivery path in the game and nothing polls chat_messages as a fallback');

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
console.log('realtime-cost: OK — publication == client subscriptions == [' + EXPECTED.join(', ') + ']');
