// ============================================================================
// tools/triage-bugs.mjs — the operator side of the bug-report pipe.
//
// Reports arrive from the game, are attributed to a verified auth.uid(), rate
// limited, deduplicated, and forwarded to Discord. Until now the only way to act
// on one was for Tyler to WATCH that Discord channel. This is what the scheduled
// triage session calls instead, so the loop runs whether or not anyone is
// looking. The loop it serves is docs/design/bug-triage-loop.md.
//
//   node tools/triage-bugs.mjs list   [--status new] [--limit 20] [--json]
//   node tools/triage-bugs.mjs show   <id> [--json]
//   node tools/triage-bugs.mjs mark   <id> <new|triaged|fixed|wontfix> [--note "..."]
//   node tools/triage-bugs.mjs stats
//
// ── WHY THE MANAGEMENT API AND NOT THE ANON CLIENT ──────────────────────────
// public.bug_reports is deliberately write-only to the client: there is no
// UPDATE or DELETE policy, and SELECT is scoped to the reporter's own rows. That
// is the point — a player must not be able to mark their own bug fixed. So
// triage cannot go through the game's client at all; it goes through the same
// management path tools/apply-migration.mjs uses, with the token from
// ~/.supabase-token. The token is read from that file directly, never from argv
// (where it would land in shell history and the process table) and never
// printed.
//
// ── EVERY VALUE THAT REACHES SQL IS BOUND OR REFUSED ────────────────────────
// The management endpoint takes a SQL STRING, not parameters, so there is no
// driver to bind for us. Rather than hand-roll escaping and hope, this file
// refuses anything it cannot prove safe: an id must match /^\d+$/, a status must
// be one of four literals compared against the SAME list the CHECK constraint
// holds, and a note is dollar-quoted with a tag that is re-generated until it
// does not occur in the text. A triage note is prose typed by an operator or
// written by an agent summarising a bug — i.e. attacker-adjacent input on a
// privileged connection — so it gets the same treatment as a client value.
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'nezapsylztqbbwuwembx';
const URL_Q = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

// The same closed vocabulary as bug_reports_status_chk. Two copies of one list
// is a drift risk, so `mark` VERIFIES its value against the live constraint
// before writing rather than trusting this array alone.
const STATUSES = ['new', 'triaged', 'fixed', 'wontfix'];

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

function die(msg, code = 2) { console.error(msg); process.exit(code); }

function token() {
  /* Cloud-routine fallback: the scheduled triage agent runs in a fresh cloud
     clone with no home-dir token files; its environment supplies the secret. */
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try { return readFileSync(`${homedir()}/.supabase-token`, 'utf8').trim(); }
  catch { die('no SUPABASE_ACCESS_TOKEN env and no ~/.supabase-token — cannot reach the management API'); }
}

async function q(query) {
  const r = await fetch(URL_Q, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return []; }
}

// A dollar-quote tag that provably does not occur in the payload. Looping until
// the tag is absent is what makes this safe for ARBITRARY text — a fixed tag is
// escapable the moment the text contains it.
function dollarQuote(s) {
  let tag = 'note';
  let i = 0;
  while (s.includes(`$${tag}$`)) tag = `note${++i}`;
  return `$${tag}$${s}$${tag}$`;
}

const intId = (v) => {
  if (!/^\d+$/.test(String(v || ''))) die(`bad report id: ${v} (must be a positive integer)`);
  return String(v);
};

// ── the queue read ──────────────────────────────────────────────────────────
// Projects the SPA screen and the device line out of the state jsonb rather than
// duplicating them into columns, and counts the errors instead of dumping them,
// so a list stays readable at a hundred rows. `show` has the full blob.
async function list() {
  const status = flag('status', 'new');
  if (status !== 'all' && !STATUSES.includes(status)) die(`bad --status ${status} (one of: ${STATUSES.join(', ')}, all)`);
  const limit = Math.min(200, Math.max(1, parseInt(flag('limit', '20'), 10) || 20));

  const rows = await q(`
    select id, created_at, build_version, status, summary,
           state->>'activeTab'   as screen,
           state->>'device'      as device,
           state->>'orientation' as orient,
           coalesce((state->>'hasScreenshot')::boolean, false) as shot,
           coalesce(jsonb_array_length(errors), 0) as errs,
           triage_note
      from public.bug_reports
     ${status === 'all' ? '' : `where status = '${status}'`}
     order by created_at asc
     limit ${limit}`);

  if (has('json')) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log(`no reports with status=${status} — the queue is empty.`); return; }

  console.log(`${rows.length} report(s), status=${status}, oldest first:\n`);
  for (const r of rows) {
    const when = String(r.created_at).replace('T', ' ').slice(0, 16);
    console.log(`  #${r.id}  [${r.status}]  ${when}  ${r.build_version || 'unknown build'}`);
    console.log(`      ${r.summary}`);
    console.log(`      screen=${r.screen || '—'} · ${r.device || '—'} ${r.orient || ''}`
      + ` · ${r.errs} console error(s)${r.shot ? ' · screenshot in Discord' : ''}`);
    if (r.triage_note) console.log(`      note: ${r.triage_note}`);
    console.log('');
  }
}

// ── one report, in full ─────────────────────────────────────────────────────
async function show() {
  const id = intId(argv[1]);
  const rows = await q(`
    select id, created_at, user_id, build_version, source, status, triage_note, triaged_at,
           summary, description, state, errors
      from public.bug_reports where id = ${id}`);
  if (!rows.length) die(`no report #${id}`, 1);
  const r = rows[0];
  if (has('json')) { console.log(JSON.stringify(r, null, 2)); return; }

  console.log(`#${r.id}  [${r.status}]  ${r.created_at}  (source: ${r.source})`);
  console.log(`build:    ${r.build_version || 'unknown'}`);
  console.log(`reporter: ${r.user_id || '(none)'}`);
  if (r.triaged_at) console.log(`triaged:  ${r.triaged_at}`);
  if (r.triage_note) console.log(`note:     ${r.triage_note}`);
  console.log(`\nSUMMARY\n  ${r.summary}`);
  console.log(`\nDESCRIPTION\n  ${(r.description || '(none)').split('\n').join('\n  ')}`);
  console.log(`\nSTATE\n${JSON.stringify(r.state, null, 2)}`);
  const errs = Array.isArray(r.errors) ? r.errors : [];
  console.log(`\nCONSOLE (${errs.length})`);
  for (const e of errs) console.log(`  [${e.level}] ${e.msg}`);
  if (r.state && r.state.hasScreenshot) {
    console.log('\nA screenshot for this report was attached to the Discord message '
      + '(deliberately not stored here — see 2026-08-17-bug-triage.sql).');
  }
}

// ── the write ───────────────────────────────────────────────────────────────
// `resolved` and `triaged_at` are NOT set here. Both are derived server-side by
// bug_reports_triage_sync_trg, so this writes exactly one field of truth and
// cannot produce a row whose boolean disagrees with its status.
async function mark() {
  const id = intId(argv[1]);
  const status = argv[2];
  if (!STATUSES.includes(status)) die(`bad status ${status} (one of: ${STATUSES.join(', ')})`);
  const note = flag('note');
  if (note && note.length > 2000) die('note is longer than the 2000-char column constraint');

  // Verify this tool's vocabulary against the database's, so the two copies
  // cannot drift silently — a status this tool believes in but the CHECK
  // rejects would otherwise surface as an opaque 23514 at write time.
  const [{ def }] = await q(`select pg_get_constraintdef(oid) as def from pg_constraint
                              where conrelid = 'public.bug_reports'::regclass
                                and conname  = 'bug_reports_status_chk'`);
  for (const s of STATUSES) {
    if (!def.includes(`'${s}'`)) die(`vocabulary drift: this tool offers '${s}' but the CHECK constraint does not: ${def}`);
  }

  const sets = [`status = '${status}'`];
  if (note !== null) sets.push(`triage_note = ${dollarQuote(note)}`);

  const rows = await q(`update public.bug_reports set ${sets.join(', ')}
                         where id = ${id}
                     returning id, status, resolved, triaged_at, triage_note`);
  if (!rows.length) die(`no report #${id}`, 1);
  const r = rows[0];
  console.log(`#${r.id} → ${r.status} (resolved=${r.resolved}, triaged_at=${r.triaged_at || 'null'})`);
  if (r.triage_note) console.log(`note: ${r.triage_note}`);
}

// ── the shape of the backlog ────────────────────────────────────────────────
async function stats() {
  const rows = await q(`
    select status, count(*) as n,
           min(created_at) as oldest,
           count(*) filter (where created_at > now() - interval '24 hours') as last_24h
      from public.bug_reports group by status order by status`);
  if (has('json')) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log('bug_reports is empty.'); return; }
  console.log('status    count   last 24h   oldest');
  for (const r of rows) {
    console.log(`${String(r.status).padEnd(9)} ${String(r.n).padStart(5)}   ${String(r.last_24h).padStart(8)}   ${r.oldest ? String(r.oldest).slice(0, 16).replace('T', ' ') : '—'}`);
  }
  const news = rows.find((r) => r.status === 'new');
  if (news && Number(news.n) > 0) {
    console.log(`\n${news.n} report(s) awaiting triage — node tools/triage-bugs.mjs list`);
  }
}

const COMMANDS = { list, show, mark, stats };
if (!cmd || !COMMANDS[cmd]) {
  die(`usage:
  node tools/triage-bugs.mjs list  [--status new|triaged|fixed|wontfix|all] [--limit 20] [--json]
  node tools/triage-bugs.mjs show  <id> [--json]
  node tools/triage-bugs.mjs mark  <id> <new|triaged|fixed|wontfix> [--note "why"]
  node tools/triage-bugs.mjs stats`);
}
COMMANDS[cmd]().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
