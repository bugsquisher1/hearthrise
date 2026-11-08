#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-live-events.mjs — GENERATE THE SERVER'S LIVE-EVENT CATALOGUE (lane/c-live-events; Tyler 2026-11-07 approved "live events from
// data"; the design: docs/planning/PRIORITY_BOARD.md "2026-11-07 Live events").
//
// src/data/live-events.js is the one source: the types (one permille dial each, its range, its stacking rule, its scope's kind, the switch
// that arms it) and the events (type, pm, scope, the schedule, the words the server writes itself). This writes both tables whole:
//   hr_live_event_types   a row a type: switch_id, dial, lo, hi, stack, scope_kind
//   hr_live_events        a row an event: type_id, pm, scope (text[]: '{world}' or ground / call ids), first_at, hours, every_days, until_at,
//                         name, start_words, end_words (the System lines the announcer writes at a window's edges)
// 2027-03-22-live-events.sql reads them (hr_live_events_at, hr_live_xp_windows, hr_live_fee_pm, the section, the announcer).
// tests/live-events.mjs `catalogue` holds the tables equal to the data on the replayed chain; --check is the CI half.
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; a moved row is a new dated file (OUT_NAME).
//
//   node tools/gen-live-events.mjs            write OUT_NAME
//   node tools/gen-live-events.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-live-events.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a type whose dial, range, stack or scope the server doesn't know; an event of no type; a pm outside
// its type's range; a window of 0 or more than 168 hours; a repeat of 0 or more than 90 days, or shorter than its own window (an event
// never overlaps itself); `until` before `first`; a `first` that isn't a UTC instant; a scope naming no ground (xp_bonus) or no call
// (open_halls); words missing a name, a start or an end line, a System line past the chat's 240 characters once filled, or words that
// break the copy rules (a semicolon, a dash, a colon joining two clauses).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2027-03-22-live-events-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const DIALS = Object.freeze({ xpPm: 'grounds', feePm: 'calls' });
const STACKS = Object.freeze(['add', 'min']);
/* THE COPY RULES the words are held to (player-text-plain-english): no semicolon, no dash, no colon-joined clause. */
const COPY = [[/;/, 'a semicolon'], [/[–—]| - /, 'a dash'], [/:\s+[A-Za-z]/, 'a colon joining two clauses']];
/* The longest a filled System line may run (chat_messages.body: 1 to 240), with the longest UTC time the announcer writes. */
const LONG_TIME = 'Wednesday 18 November at 17:00 UTC';
const CHAT_MAX = 240;

const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** The two tables' rows from the data (D: { T: LIVE_EVENT_TYPES, E: LIVE_EVENTS, grounds: [ids], calls: [ids] }). */
export function catalogueOf(D) {
  const types = [], events = [];
  for (const id of Object.keys(D.T).sort()) {
    const t = D.T[id], at = 'gen-live-events: type ' + id;
    if (!ID.test(id) || !ID.test(String(t.switch))) throw new Error(at + ': an id or a switch not [a-z0-9_]');
    if (!Object.prototype.hasOwnProperty.call(DIALS, t.dial)) throw new Error(at + ': a dial the server does not know (' + t.dial + ')');
    if (DIALS[t.dial] !== t.scope) throw new Error(at + ': a ' + t.dial + ' dial scoped by ' + t.scope + ', want ' + DIALS[t.dial]);
    if (!STACKS.includes(t.stack)) throw new Error(at + ': a stacking rule the server does not know (' + t.stack + ')');
    const [lo, hi] = t.range || [];
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || lo > hi || hi > 10000) throw new Error(at + ': a range of ' + JSON.stringify(t.range));
    if (t.dial === 'xpPm' && (lo !== 1000 || t.stack !== 'add')) throw new Error(at + ': an XP dial must start at the row (1000) and add');
    if (t.dial === 'feePm' && (hi !== 1000 || t.stack !== 'min')) throw new Error(at + ': a fee dial never rises past the row\'s fee (1000) and the lowest wins');
    types.push({ id, switchId: t.switch, dial: t.dial, lo, hi, stack: t.stack, scopeKind: t.scope });
  }
  for (const id of Object.keys(D.E).sort()) {
    const e = D.E[id], at = 'gen-live-events: event ' + id;
    const t = D.T[e.type];
    if (!ID.test(id) || !t) throw new Error(at + ': an id not [a-z0-9_] or no such type ' + e.type);
    if (!Number.isInteger(e.pm) || e.pm < t.range[0] || e.pm > t.range[1]) throw new Error(at + ': pm ' + e.pm + ' outside its type\'s range ' + JSON.stringify(t.range));
    if (!Number.isInteger(e.hours) || e.hours < 1 || e.hours > 168) throw new Error(at + ': a window of ' + e.hours + ' h');
    if (e.everyDays !== null && (!Number.isInteger(e.everyDays) || e.everyDays < 1 || e.everyDays > 90 || e.hours > e.everyDays * 24)) {
      throw new Error(at + ': a repeat every ' + e.everyDays + ' days for a ' + e.hours + ' h window (it would overlap itself)'); }
    const first = Date.parse(e.first);
    if (typeof e.first !== 'string' || !/Z$/.test(e.first) || !Number.isFinite(first)) throw new Error(at + ': first ' + e.first + ' is not a UTC instant');
    const until = e.until === null ? null : Date.parse(e.until);
    if (e.until !== null && (typeof e.until !== 'string' || !/Z$/.test(e.until) || !Number.isFinite(until) || until < first)) throw new Error(at + ': until ' + e.until + ' is not a UTC instant at or after first');
    const scope = e.scope === 'world' ? ['world'] : Array.isArray(e.scope) ? e.scope.slice().sort() : null;
    const known = t.scope === 'grounds' ? D.grounds : D.calls;
    if (!scope || !scope.length || (scope[0] !== 'world' && !scope.every((s) => known.includes(s)))) throw new Error(at + ': a scope naming no ' + t.scope + ' (' + JSON.stringify(e.scope) + ')');
    const w = e.words || {};
    for (const k of ['name', 'start', 'end']) if (typeof w[k] !== 'string' || !w[k].trim()) throw new Error(at + ': no ' + k + ' words');
    for (const [k, v] of Object.entries(w)) for (const [re, what] of COPY) if (re.test(v)) throw new Error(at + ': the ' + k + ' words carry ' + what + ': ' + v);
    for (const k of ['start', 'end']) {
      const filled = w[k].replace(/\{pct\}/g, '50').replace(/\{(end|next|start)\}/g, LONG_TIME);
      if (filled.length > CHAT_MAX) throw new Error(at + ': the ' + k + ' line runs ' + filled.length + ' characters filled (chat holds ' + CHAT_MAX + ')');
    }
    events.push({ id, type: e.type, pm: e.pm, scope, first: new Date(first).toISOString(), hours: e.hours, everyDays: e.everyDays,
      until: until === null ? null : new Date(until).toISOString(), name: w.name, start: w.start, end: w.end });
  }
  return { types, events };
}

/** The SQL for the catalogue `c` (catalogueOf). */
export function buildSql(c) {
  const typeValues = c.types.map((t) => `  (${sq(t.id)}, ${sq(t.switchId)}, ${sq(t.dial)}, ${t.lo}, ${t.hi}, ${sq(t.stack)}, ${sq(t.scopeKind)})`).join(',\n');
  const eventValues = c.events.map((e) => `  (${sq(e.id)}, ${sq(e.type)}, ${e.pm}, '{${e.scope.join(',')}}'::text[], ${sq(e.first)}::timestamptz, ${e.hours}, `
    + `${e.everyDays === null ? 'null' : e.everyDays}, ${e.until === null ? 'null' : sq(e.until) + '::timestamptz'}, ${sq(e.name)}, ${sq(e.start)}, ${sq(e.end)})`).join(',\n');
  /* the self-check's copy, written another way on purpose: the catalogue guard reads the inserts' form only */
  const checkTypes = c.types.map((t) => `(${[sq(t.id), sq(t.switchId), sq(t.dial), t.lo, t.hi, sq(t.stack), sq(t.scopeKind)].join(',')})`).join(',\n      ');
  const checkEvents = c.events.map((e) => `(${[sq(e.id), sq(e.type), e.pm, 'array[' + e.scope.map(sq).join(',') + ']', sq(e.first), e.hours, e.everyDays === null ? 'null::int' : e.everyDays,
    e.until === null ? 'null::timestamptz' : sq(e.until) + '::timestamptz', 'md5(' + sq(e.name + '|' + e.start + '|' + e.end) + ')'].join(',')})`).join(',\n      ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE LIVE EVENTS' CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-live-events.mjs from src/data/live-events.js (LIVE_EVENT_TYPES, LIVE_EVENTS, WORDS). Any hand edit FAILS
--   \`node tools/gen-live-events.mjs --check\` and tests/live-events.mjs \`catalogue\`.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-live-events, backend-architect, 2026-11-07). The Coordinator applies (tools/apply-migration.mjs, one
-- file, never inside begin/commit). ON THE EA SECURITY LIST with 2027-03-22-live-events.sql: a row here moves Level XP (a ranked board) and
-- a Call out's price.
-- WHAT: two server-only catalogues, each rewritten whole. hr_live_event_types (${c.types.length} rows: one permille dial a type, its range, how
-- two live rows combine, its scope's kind, the switch that arms it) and hr_live_events (${c.events.length} rows: type, pm, scope, a first window,
-- its hours, how often it comes back, until when, and the System lines the announcer writes at a window's start and end). A guard trigger
-- holds every pm inside its type's range. No function, grant or client verb here beyond that trigger: 2027-03-22-live-events.sql reads them.
-- ORDER: after 2027-03-21-feature-switches.sql; before 2027-03-22-live-events.sql.
-- Idempotent: the tables are made if absent and every row rewritten whole, so a second apply is byte-identical. No begin/commit.
-- REVERSIBLE: drop the two tables and the trigger function (2027-03-22-live-events.sql first: it reads them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-feature-switches.sql first (the switches that arm each type)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_live_event_types (
  type_id    text primary key check (type_id ~ '^[a-z0-9_]{1,64}$'),
  switch_id  text not null check (switch_id ~ '^[a-z0-9_]{1,64}$'),
  dial       text not null check (dial in ('xpPm', 'feePm')),
  lo         int  not null,
  hi         int  not null,
  stack      text not null check (stack in ('add', 'min')),
  scope_kind text not null check (scope_kind in ('grounds', 'calls')),
  check (0 <= lo and lo <= hi and hi <= 10000)
);
create table if not exists public.hr_live_events (
  event_id    text        primary key check (event_id ~ '^[a-z0-9_]{1,64}$'),
  type_id     text        not null references public.hr_live_event_types (type_id),
  pm          int         not null,
  scope       text[]      not null check (cardinality(scope) between 1 and 32),
  first_at    timestamptz not null,
  hours       int         not null check (hours between 1 and 168),
  every_days  int         check (every_days is null or every_days between 1 and 90),
  until_at    timestamptz,
  name        text        not null check (length(name) between 1 and 60),
  start_words text        not null check (length(start_words) between 1 and 200),
  end_words   text        not null check (length(end_words) between 1 and 200),
  check (every_days is null or hours <= every_days * 24),
  check (until_at is null or until_at >= first_at)
);
alter table public.hr_live_event_types enable row level security;
alter table public.hr_live_events enable row level security;
revoke all on public.hr_live_event_types from public, anon, authenticated, service_role;
revoke all on public.hr_live_events from public, anon, authenticated, service_role;
comment on table public.hr_live_event_types is
  '${OUT_NAME}: what a live-event type may move (src/data/live-events.js LIVE_EVENT_TYPES through tools/gen-live-events.mjs): one permille dial, its range, its stacking rule, its scope''s kind, the switch that arms it. Server-only.';
comment on table public.hr_live_events is
  '${OUT_NAME}: the live events (src/data/live-events.js LIVE_EVENTS): type, pm, scope, the schedule (first_at, hours, every_days, until_at) and the System lines of a window''s edges. Server-only. Read by 2027-03-22-live-events.sql.';

-- THE RANGE, held by the database too: a row's pm inside its type's (a table CHECK can't read another table).
create or replace function public.hr_live_events_guard()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
declare v_lo int; v_hi int;
begin
  select t.lo, t.hi into v_lo, v_hi from public.hr_live_event_types t where t.type_id = new.type_id;
  if v_lo is null or new.pm < v_lo or new.pm > v_hi then
    raise exception 'hr_live_events: % pm % outside its type''s range [%, %]', new.event_id, new.pm, v_lo, v_hi using errcode = 'check_violation'; end if;
  return new;
end $fn$;
revoke all on function public.hr_live_events_guard() from public, anon, authenticated, service_role;
drop trigger if exists hr_live_events_guard on public.hr_live_events;
create trigger hr_live_events_guard before insert or update on public.hr_live_events for each row execute function public.hr_live_events_guard();

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_live_events;
delete from public.hr_live_event_types;
insert into public.hr_live_event_types (type_id, switch_id, dial, lo, hi, stack, scope_kind) values
${typeValues};
insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
${eventValues};

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rows are exactly the generated sets; a pm outside its type's range is refused; no client reaches either table.
do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_live_event_types) <> ${c.types.length}
     or exists (select 1 from (values
      ${checkTypes}) d(type_id, switch_id, dial, lo, hi, stack, scope_kind)
                 where not exists (select 1 from public.hr_live_event_types t where (t.type_id, t.switch_id, t.dial, t.lo, t.hi, t.stack, t.scope_kind)
                                                                                   = (d.type_id, d.switch_id, d.dial, d.lo, d.hi, d.stack, d.scope_kind))) then
    raise exception 'live-events-catalogue: hr_live_event_types is not the generated set'; end if;
  if (select count(*) from public.hr_live_events) <> ${c.events.length}
     or exists (select 1 from (values
      ${checkEvents}) d(event_id, type_id, pm, scope, first_at, hours, every_days, until_at, words)
                 where not exists (select 1 from public.hr_live_events e
                                    where e.event_id = d.event_id and e.type_id = d.type_id and e.pm = d.pm and e.scope = d.scope
                                      and e.first_at = d.first_at::timestamptz and e.hours = d.hours and e.every_days is not distinct from d.every_days
                                      and e.until_at is not distinct from d.until_at and md5(e.name || '|' || e.start_words || '|' || e.end_words) = d.words)) then
    raise exception 'live-events-catalogue: hr_live_events is not the generated set'; end if;
  begin
    update public.hr_live_events e set pm = (select t.hi + 1 from public.hr_live_event_types t where t.type_id = e.type_id);
    raise exception 'live-events-catalogue: a pm past its type''s range was stored';
  exception when check_violation then null;
  end;
  foreach v_t in array array['hr_live_event_types', 'hr_live_events'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, ('public.' || v_t)::regclass, 'select,insert,update,delete') then
        raise exception 'live-events-catalogue: % reaches %', v_role, v_t; end if;
    end loop;
  end loop;
end $$;
`;
}

export async function loadData(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const L = await import(u('src/data/live-events.js'));
  const { OPEN_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { BOSS_CALLS } = await import(u('src/data/boss-calls.js'));
  return { T: L.LIVE_EVENT_TYPES, E: L.LIVE_EVENTS, grounds: Object.keys(OPEN_GROUNDS), calls: Object.keys(BOSS_CALLS) };
}

const said = (c) => c.types.length + ' types (' + c.types.map((t) => t.id + ' ' + t.dial + ' ' + t.stack).join(', ') + '), ' + c.events.length + ' events ('
  + c.events.map((e) => e.id + ' ' + e.pm + ' from ' + e.first + ' for ' + e.hours + ' h every ' + e.everyDays + ' d').join(', ') + ')';

async function selftest() {
  const D = await loadData(ROOT);
  let bad = 0;
  const ev = (id, patch) => ({ ...D, E: { ...D.E, [id]: { ...D.E[id], ...patch } } });
  const ty = (id, patch) => ({ ...D, T: { ...D.T, [id]: { ...D.T[id], ...patch } } });
  const expectThrow = (name, Dx) => { try { catalogueOf(Dx); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  expectThrow('a weekend past +50%', ev('bonus_weekend', { pm: 1600 }));
  expectThrow('a fee above the row\'s', ev('open_halls', { pm: 1200 }));
  expectThrow('an XP dial that stacks by the lowest', ty('xp_bonus', { stack: 'min' }));
  expectThrow('a dial the server does not know', ty('xp_bonus', { dial: 'coinPm' }));
  expectThrow('a window of 0 hours', ev('bonus_weekend', { hours: 0 }));
  expectThrow('a window that overlaps its own repeat', ev('bonus_weekend', { hours: 72, everyDays: 2 }));
  expectThrow('until before first', ev('open_halls', { until: '2026-01-01T00:00:00Z' }));
  expectThrow('a first that is no UTC instant', ev('open_halls', { first: '2026-11-18 17:00' }));
  expectThrow('a scope naming no ground', ev('bonus_weekend', { scope: ['nowhere'] }));
  expectThrow('an event of no type', ev('open_halls', { type: 'lucky_weekend' }));
  expectThrow('words with a semicolon', ev('open_halls', { words: { ...D.E.open_halls.words, end: 'The halls are closed; calling out costs its fee.' } }));
  expectThrow('a System line past the chat\'s length', ev('bonus_weekend', { words: { ...D.E.bonus_weekend.words, start: 'x'.repeat(230) + ' {end}' } }));
  const sql = buildSql(catalogueOf(D));
  const inserts = [...sql.matchAll(/^ {2}\('([a-z0-9_]+)', '([a-z0-9_]+)', (\d+), '\{[a-z0-9_,]+\}'::text\[\]/gm)].length;
  if (inserts !== Object.keys(D.E).length) { console.error('  MISSED  the catalogue guard would read ' + inserts + ' event rows'); bad++; }
  else console.log('  caught  a self-check the catalogue guard would read twice');
  if (bad) { console.error('gen-live-events --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-live-events --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const c = catalogueOf(await loadData(ROOT));
  const wanted = buildSql(c);
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) { console.error('gen-live-events --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-live-events.mjs'); process.exit(1); }
    console.log('gen-live-events --check: ' + OUT_NAME + ' matches src/data/live-events.js (' + said(c) + ')');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-live-events: wrote ' + OUT_NAME + ' (' + said(c) + ')');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
