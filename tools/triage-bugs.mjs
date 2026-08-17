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
//   node tools/triage-bugs.mjs incidents [--min-n 5] [--days 7] [--json]
//
// ── WHY `list` READS hr_rejections TOO (b370) ───────────────────────────────
// A player-filed bug report is the SLOWEST detector this project has: it needs
// a player to notice, care, and type. The server already knows — hr_apply
// records every refusal into public.hr_rejections and DERIVES a severity from
// the code, where `incident` means "a caller proposed something an honest game
// loop cannot propose" (2026-08-11-player-state.sql §6b-ii). On the night of
// 2026-08-17, 51 aggregated `unknown_skill` rejections at severity `incident`
// accumulated there and were read by nobody until morning, because the ONLY
// thing the triage loop looked at was bug_reports. A signal nobody reads is not
// a signal, and the loop that runs on a schedule is this file.
//
// So the queue read now has two halves, and the server's half prints FIRST.
// It is deliberately NOT a second command an operator has to remember: the
// incident that motivated it happened while somebody was, in fact, running
// `list`.
//
// ⚠ hr_rejections IS ALREADY AN AGGREGATE — one row per (user, slot, day, code)
//   with a counter, precisely so it cannot become game_events (1.6M rows from
//   six players; journal rule 6). This tool aggregates it AGAIN, to one line per
//   code, and never prints a user_id: the operator question is "which refusal is
//   firing", and a per-player dump would be both a privacy leak into a shared
//   terminal and unreadable at scale. `--json` carries the same shape.
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
import { pathToFileURL } from 'node:url';

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

// ── THE SERVER'S OWN QUEUE — hr_rejections, thresholded ─────────────────────
// Exported and PURE so tests/bug-triage.mjs can run these exact bytes against a
// real PostgreSQL fixture. A query that is only ever built inside a function
// that also does a network call is a query nobody can grade, and this one has a
// threshold in it — the single most testable and most silently-wrong kind of
// number.
export const INCIDENT_DEFAULTS = { minN: 5, days: 7, limit: 20 };

/**
 * One line per refusal code: how many times, how many characters, when last.
 *
 * ⚠ THE THRESHOLD IS ON THE *SUM*, NOT ON A ROW'S `n`. hr_rejections keys on
 *   (user, slot, day, code), so 51 rejections spread over three players and two
 *   days is six rows of n=8..9 — every one of them under a per-row threshold of
 *   10, and the outage invisible. That is the exact shape of the night this
 *   function exists for, so the HAVING clause sums first. A per-row filter is
 *   the plausible-looking version of this query and it is wrong.
 *
 * ⚠ SEVERITY IS NOT A PARAMETER. `incident` is derived server-side from the
 *   code by hr_record_rejection and cannot be supplied by a caller — that is
 *   what makes it trustworthy — so this reads the derivation rather than
 *   re-deciding what is serious, and a caller cannot widen it into a firehose.
 */
export function incidentsQuery({ minN, days, limit } = {}) {
  const n = Math.max(1, parseInt(minN ?? INCIDENT_DEFAULTS.minN, 10) || INCIDENT_DEFAULTS.minN);
  const d = Math.max(1, parseInt(days ?? INCIDENT_DEFAULTS.days, 10) || INCIDENT_DEFAULTS.days);
  const l = Math.min(200, Math.max(1, parseInt(limit ?? INCIDENT_DEFAULTS.limit, 10)
    || INCIDENT_DEFAULTS.limit));
  return `
    select code,
           sum(n)::bigint                        as total,
           count(distinct (user_id, slot))::int  as characters,
           min(first_at)                         as first_at,
           max(last_at)                          as last_at,
           (array_agg(intent order by last_at desc))[1]      as last_intent,
           (array_agg(last_detail order by last_at desc))[1] as last_detail
      from public.hr_rejections
     where severity = 'incident'
       and last_at > now() - interval '${d} days'
     group by code
    having sum(n) >= ${n}
     order by sum(n) desc
     limit ${l}`;
}

export function formatIncidents(rows, { minN, days } = {}) {
  const n = minN ?? INCIDENT_DEFAULTS.minN;
  const d = days ?? INCIDENT_DEFAULTS.days;
  if (!rows.length) {
    return [`no severity=incident rejections with ${n}+ occurrences in the last ${d} day(s).`];
  }
  const out = [
    `⚠ ${rows.length} SERVER-SIDE INCIDENT CODE(S) in the last ${d} day(s), `
    + `${n}+ occurrences — hr_rejections. The server noticed these before any player did:`,
    '',
  ];
  for (const r of rows) {
    const when = String(r.last_at).replace('T', ' ').slice(0, 16);
    out.push(`  ${String(r.code).padEnd(24)} ${String(r.total).padStart(6)}×  `
      + `${String(r.characters).padStart(4)} character(s)  last ${when}`
      + (r.last_intent ? `  via ${r.last_intent}` : ''));
    const detail = r.last_detail && typeof r.last_detail === 'object'
      ? JSON.stringify(r.last_detail) : String(r.last_detail || '');
    if (detail && detail !== '{}') out.push(`      last detail: ${detail.slice(0, 200)}`);
  }
  out.push('');
  return out;
}

const intId = (v) => {
  if (!/^\d+$/.test(String(v || ''))) die(`bad report id: ${v} (must be a positive integer)`);
  return String(v);
};

// ── the queue read ──────────────────────────────────────────────────────────
// Projects the SPA screen and the device line out of the state jsonb rather than
// duplicating them into columns, and counts the errors instead of dumping them,
// so a list stays readable at a hundred rows. `show` has the full blob.
async function incidents() {
  const opts = { minN: flag('min-n'), days: flag('days'), limit: flag('limit') };
  const rows = await q(incidentsQuery(opts));
  if (has('json')) { console.log(JSON.stringify(rows, null, 2)); return rows; }
  for (const line of formatIncidents(rows, opts)) console.log(line);
  return rows;
}

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

  /* THE SERVER'S HALF OF THE QUEUE, FIRST AND UNCONDITIONALLY. `--no-incidents`
     exists for a scripted consumer that only wants reports; there is
     deliberately no way to make the human path quiet, because "nobody looked"
     is the failure this closes. */
  const incOpts = { minN: flag('min-n'), days: flag('days') };
  let incRows = [];
  if (!has('no-incidents')) {
    try { incRows = await q(incidentsQuery(incOpts)); }
    catch (e) {
      /* FAIL SOFT, LOUDLY. A missing hr_rejections (an old database, a partial
         replay) must not take the bug queue offline — but it must not be
         silent either, or the tool reports an all-clear it never checked. */
      console.log(`(could not read hr_rejections — ${e.message.slice(0, 120)})\n`);
    }
  }

  if (has('json')) {
    /* ⚠ SHAPE CHANGE, DELIBERATE AND CALLED OUT: `list --json` was a bare array
       of reports and is now { reports, incidents }. A consumer that kept the
       array shape would silently never see the server's half, which is the
       whole defect. `--no-incidents` still returns the bare array for anything
       that genuinely only wants reports. */
    console.log(JSON.stringify(has('no-incidents') ? rows : { reports: rows, incidents: incRows },
      null, 2));
    return;
  }
  if (!has('no-incidents')) for (const line of formatIncidents(incRows, incOpts)) console.log(line);
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
  // The server's half, here too: `stats` is what the scheduled session runs
  // first, and a shape-of-the-backlog that omits the backlog the SERVER is
  // keeping is the omission this whole change is about.
  console.log('');
  try {
    for (const line of formatIncidents(await q(incidentsQuery({})))) console.log(line);
  } catch (e) { console.log(`(could not read hr_rejections — ${e.message.slice(0, 120)})`); }
}

const COMMANDS = { list, show, mark, stats, incidents };

/* ⚠ THE CLI IS BEHIND A MAIN GUARD (b370). It used to dispatch at import time,
   which meant `import { incidentsQuery } from './triage-bugs.mjs'` printed a
   usage message and called process.exit(2) — i.e. the query could not be
   tested without a live management token, so it would not have been. A guard
   that cannot be exercised is the always-null probe with a network call. */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (!cmd || !COMMANDS[cmd]) {
    die(`usage:
  node tools/triage-bugs.mjs list      [--status new|triaged|fixed|wontfix|all] [--limit 20]
                                       [--min-n 5] [--days 7] [--no-incidents] [--json]
  node tools/triage-bugs.mjs show      <id> [--json]
  node tools/triage-bugs.mjs mark      <id> <new|triaged|fixed|wontfix> [--note "why"]
  node tools/triage-bugs.mjs stats
  node tools/triage-bugs.mjs incidents [--min-n 5] [--days 7] [--limit 20] [--json]`);
  }
  COMMANDS[cmd]().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
}
