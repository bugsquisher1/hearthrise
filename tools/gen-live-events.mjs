#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-live-events.mjs — GENERATE THE SERVER'S LIVE-EVENT CATALOGUE (lane/c-live-events; Tyler 2026-11-07 approved "live events from
// data"; the design: docs/planning/PRIORITY_BOARD.md "2026-11-07 Live events").
//
// src/data/live-events.js is the one source: the types (one permille dial each, or none, its range, its stacking rule, its scope's kind,
// the switch that arms it) and the events (type, pm or 'fire', scope, the schedule as an offset from CALENDAR_ANCHOR, the words the server
// writes itself). src/data/hearthrise.js is the Hearthrise's fire rule. This writes the three tables whole:
//   hr_live_event_types   a row a type: switch_id, dial (null: it moves no number), lo, hi, stack, scope_kind
//   hr_live_events        a row an event: type_id, pm, sized_by ('fire': the server reads the size from the fire at the lighting, and pm
//                         is the floor), boss (a world boss row's boss), scope (text[]: '{world}' or ground / call ids), first_at, hours,
//                         every_days, until_at, name, start_words, end_words (the System lines the announcer writes at a window's edges)
//   hr_hearth_fire_rule   one row: the fire's share, day cap, marks, floor, step, days, a named fuel's worth, fuel per active day
// 2027-03-22-live-events.sql and 1043-hearthrise.sql read them (hr_live_events_at, hr_live_xp_windows, the section, the announcer, the fire).
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
// never overlaps itself); `until` before `first`; a `first` that isn't a UTC instant; a scope naming no ground (an XP type) or no call
// (a fee type); words missing a name, a start or an end line, a System line past the chat's 240 characters once filled, or words that
// break the copy rules (a semicolon, a dash, a colon joining two clauses).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE WORDS AS LABELS (lane/a-text-short, 2026-11-16, Tyler's labels ruling): 2027-03-22-live-events-catalogue is APPLIED history; the events'
   announcement words moved, so the whole catalogue went again in ONE forward file (set/v0.2.135, 2027-05-01-v0135-live-events-catalogue, APPLIED).
   OPEN HALLS STOPS SAYING FREE (designer lane/d-coherence-fixes 2026-11-16, board "2026-11-15 Coherence pass" C10; re-landed by
   lane/a-honesty-rescue): a called fight costs stamina, so its two announcer lines say "costs no gold, only stamina" and "costs gold again".
   The same full rewrite in the next forward file; no date, kind, size or schedule moves. */
/* THE CALENDAR'S 28 DAY CYCLE (designer D-7, lane/c-social FB-12): the Hearthrise sized by the fire replaces the fortnightly bonus weekend,
   Mossback's world boss row is new (FB-13 reads it), Open Halls is retired, the XP range narrows to [1100, 1250], every row is an offset
   from CALENDAR_ANCHOR, and the fire's rule joins the catalogue. */
export const OUT_NAME = '1042-hearthrise-live-events-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const DIALS = Object.freeze({ xpPm: 'grounds', feePm: 'calls' });
/* A type with no dial opens something on its window (D-7's world_boss) and names the world. */
const NO_DIAL_SCOPE = 'world';
/* No event over +25% (27-5): an XP type's top, and the fire's top (floor + step x marks). */
const XP_CEILING_PM = 1250;
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
    if (t.dial === null) {
      /* NO DIAL: no range, no stack, the world. It moves no number, so the server stores lo = hi = 1000 and no stack. */
      if (t.range !== null || t.stack !== null || t.scope !== NO_DIAL_SCOPE) throw new Error(at + ': a type with no dial carries a range, a stack or a scope');
      types.push({ id, switchId: t.switch, dial: null, lo: 1000, hi: 1000, stack: null, scopeKind: NO_DIAL_SCOPE });
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(DIALS, t.dial)) throw new Error(at + ': a dial the server does not know (' + t.dial + ')');
    if (DIALS[t.dial] !== t.scope) throw new Error(at + ': a ' + t.dial + ' dial scoped by ' + t.scope + ', want ' + DIALS[t.dial]);
    if (!STACKS.includes(t.stack)) throw new Error(at + ': a stacking rule the server does not know (' + t.stack + ')');
    const [lo, hi] = t.range || [];
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || lo > hi || hi > 10000) throw new Error(at + ': a range of ' + JSON.stringify(t.range));
    if (t.dial === 'xpPm' && (lo < 1000 || t.stack !== 'add')) throw new Error(at + ': an XP dial never starts under the row (1000) and adds');
    if (t.dial === 'xpPm' && hi > XP_CEILING_PM) throw new Error(at + ': an XP dial past +25% (27-5: no event over +25%)');
    if (t.dial === 'feePm' && (hi !== 1000 || t.stack !== 'min')) throw new Error(at + ': a fee dial never rises past the row\'s fee (1000) and the lowest wins');
    types.push({ id, switchId: t.switch, dial: t.dial, lo, hi, stack: t.stack, scopeKind: t.scope });
  }
  for (const id of Object.keys(D.E).sort()) {
    const e = D.E[id], at = 'gen-live-events: event ' + id;
    const t = D.T[e.type];
    if (!ID.test(id) || !t) throw new Error(at + ': an id not [a-z0-9_] or no such type ' + e.type);
    /* THE SIZE: a number in the type's range; or 'fire', an XP row the server sizes from the Hearthrise's fire at the lighting (it
       stores the type's floor); or nothing at all on a type with no dial, whose row must name its boss. */
    let pm, sizedBy = null, boss = null;
    if (t.dial === null) {
      if (e.pm !== undefined || typeof e.boss !== 'string' || !ID.test(e.boss)) throw new Error(at + ': a row of a type with no dial names a boss and no pm');
      pm = 1000; boss = e.boss;
    } else if (e.pm === 'fire') {
      if (t.dial !== 'xpPm') throw new Error(at + ': only an XP row is sized by the fire');
      pm = t.range[0]; sizedBy = 'fire';
    } else {
      if (!Number.isInteger(e.pm) || e.pm < t.range[0] || e.pm > t.range[1]) throw new Error(at + ': pm ' + e.pm + ' outside its type\'s range ' + JSON.stringify(t.range));
      if (e.boss !== undefined) throw new Error(at + ': a dialled row names a boss');
      pm = e.pm;
    }
    if (!Number.isInteger(e.hours) || e.hours < 1 || e.hours > 168) throw new Error(at + ': a window of ' + e.hours + ' h');
    if (e.everyDays !== null && (!Number.isInteger(e.everyDays) || e.everyDays < 1 || e.everyDays > 90 || e.hours > e.everyDays * 24)) {
      throw new Error(at + ': a repeat every ' + e.everyDays + ' days for a ' + e.hours + ' h window (it would overlap itself)'); }
    /* THE FIRST WINDOW (D-7): the anchor, a Friday 12:00 UTC, plus a whole number of days. */
    const anchor = typeof D.anchor === 'string' ? Date.parse(D.anchor) : NaN;
    if (!/T12:00:00(\.000)?Z$/.test(String(D.anchor)) || !Number.isFinite(anchor) || new Date(anchor).getUTCDay() !== 5) {
      throw new Error('gen-live-events: CALENDAR_ANCHOR ' + D.anchor + ' is not a Friday 12:00 UTC'); }
    if (!Number.isInteger(e.offsetDays) || e.offsetDays < 0 || e.offsetDays > 365) throw new Error(at + ': an offset of ' + e.offsetDays + ' days from the anchor');
    const first = anchor + e.offsetDays * 86400000;
    const until = e.until === null ? null : Date.parse(e.until);
    if (e.until !== null && (typeof e.until !== 'string' || !/Z$/.test(e.until) || !Number.isFinite(until) || until < first)) throw new Error(at + ': until ' + e.until + ' is not a UTC instant at or after first');
    const scope = e.scope === 'world' ? ['world'] : Array.isArray(e.scope) ? e.scope.slice().sort() : null;
    const known = t.scope === 'grounds' ? D.grounds : t.scope === 'calls' ? D.calls : [];
    if (!scope || !scope.length || (scope[0] !== 'world' && !scope.every((s) => known.includes(s)))) throw new Error(at + ': a scope naming no ' + t.scope + ' (' + JSON.stringify(e.scope) + ')');
    const w = e.words || {};
    for (const k of ['name', 'start', 'end']) if (typeof w[k] !== 'string' || !w[k].trim()) throw new Error(at + ': no ' + k + ' words');
    for (const [k, v] of Object.entries(w)) for (const [re, what] of COPY) if (re.test(v)) throw new Error(at + ': the ' + k + ' words carry ' + what + ': ' + v);
    for (const k of ['start', 'end']) {
      const filled = w[k].replace(/\{pct\}/g, '50').replace(/\{(end|next|start)\}/g, LONG_TIME);
      if (filled.length > CHAT_MAX) throw new Error(at + ': the ' + k + ' line runs ' + filled.length + ' characters filled (chat holds ' + CHAT_MAX + ')');
    }
    events.push({ id, type: e.type, pm, sizedBy, boss, scope, first: new Date(first).toISOString(), hours: e.hours, everyDays: e.everyDays,
      until: until === null ? null : new Date(until).toISOString(), name: w.name, start: w.start, end: w.end });
  }
  /* NEVER TWO AT ONCE (27-5): no two rows' windows overlap in the year after the earliest first (each row repeats on its own cycle). */
  const windows = (e) => {
    const s0 = Date.parse(e.first), step = (e.everyDays || 0) * 86400000, out = [];
    for (let k = 0; k < (step ? Math.ceil(366 / e.everyDays) : 1); k++) out.push([s0 + k * step, s0 + k * step + e.hours * 3600000]);
    return out;
  };
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      for (const [a0, a1] of windows(events[i])) {
        for (const [b0, b1] of windows(events[j])) {
          if (a0 < b1 && b0 < a1) throw new Error('gen-live-events: ' + events[i].id + ' and ' + events[j].id + ' run at once (27-5: never two at once)');
        }
      }
    }
  }
  return { types, events, fire: fireRuleOf(D.fire) };
}

/** THE HEARTHRISE'S FIRE RULE (src/data/hearthrise.js), checked: integers in range, and the top never past +25% (27-5). */
export function fireRuleOf(F) {
  const at = 'gen-live-events: HEARTHRISE_FIRE';
  if (!F || !F.rule) throw new Error(at + ' is missing');
  const r = F.rule;
  const int = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(at + ': ' + what + ' ' + v + ' outside [' + lo + ', ' + hi + ']'); return v; };
  const out = {
    sharePm: int(r.fireShare, 1, 1000, 'fireShare'),
    dayCapShares: int(r.fireDayCapShares, 1, 100, 'fireDayCapShares'),
    marks: int(r.marks, 1, 10, 'marks'),
    floorPm: int(r.floorPm, 1000, XP_CEILING_PM, 'floorPm'),
    stepPm: int(r.stepPm, 1, 250, 'stepPm'),
    maxDays: int(r.maxDays, 1, 90, 'maxDays'),
    namedFuel: int(r.namedFuelFire, 1, 100000, 'namedFuelFire'),
    refDay: int(F.refDay, 1, 10000000, 'the reference day'),
    perActiveDay: int(F.perActiveDay, 1, 10000000, 'fuelPerActiveDay'),
  };
  if (out.floorPm + out.stepPm * out.marks > XP_CEILING_PM) throw new Error(at + ': a full fire lights at ' + (out.floorPm + out.stepPm * out.marks) + ', past +25%');
  if (out.perActiveDay !== Math.floor((out.refDay * out.sharePm) / 1000)) throw new Error(at + ': fuelPerActiveDay is not fireShare x the reference day');
  return out;
}

/** The SQL for the catalogue `c` (catalogueOf). */
export function buildSql(c) {
  const nq = (v) => (v === null ? 'null' : sq(v));
  const typeValues = c.types.map((t) => `  (${sq(t.id)}, ${sq(t.switchId)}, ${nq(t.dial)}, ${t.lo}, ${t.hi}, ${nq(t.stack)}, ${sq(t.scopeKind)})`).join(',\n');
  const eventValues = c.events.map((e) => `  (${sq(e.id)}, ${sq(e.type)}, ${e.pm}, ${nq(e.sizedBy)}, ${nq(e.boss)}, '{${e.scope.join(',')}}'::text[], ${sq(e.first)}::timestamptz, ${e.hours}, `
    + `${e.everyDays === null ? 'null' : e.everyDays}, ${e.until === null ? 'null' : sq(e.until) + '::timestamptz'}, ${sq(e.name)}, ${sq(e.start)}, ${sq(e.end)})`).join(',\n');
  const f = c.fire;
  /* the self-check's copy, written another way on purpose: the catalogue guard reads the inserts' form only */
  const checkTypes = c.types.map((t) => `(${[sq(t.id), sq(t.switchId), t.dial === null ? 'null::text' : sq(t.dial), t.lo, t.hi, t.stack === null ? 'null::text' : sq(t.stack), sq(t.scopeKind)].join(',')})`).join(',\n      ');
  const checkEvents = c.events.map((e) => `(${[sq(e.id), sq(e.type), e.pm, e.sizedBy === null ? 'null::text' : sq(e.sizedBy), e.boss === null ? 'null::text' : sq(e.boss),
    'array[' + e.scope.map(sq).join(',') + ']', sq(e.first), e.hours, e.everyDays === null ? 'null::int' : e.everyDays,
    e.until === null ? 'null::timestamptz' : sq(e.until) + '::timestamptz', 'md5(' + sq(e.name + '|' + e.start + '|' + e.end) + ')'].join(',')})`).join(',\n      ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE LIVE EVENTS' CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-live-events.mjs from src/data/live-events.js (CALENDAR_ANCHOR, LIVE_EVENT_TYPES, LIVE_EVENTS, WORDS) and
--   src/data/hearthrise.js (HEARTHRISE_FIRE, the reference day). Any hand edit FAILS \`node tools/gen-live-events.mjs --check\` and
--   tests/live-events.mjs \`catalogue\`.
--
-- STATUS: supabase/migration-notes/${OUT_NAME}.json (each forward file of this generator is its own apply; the first was lane/c-live-events,
-- backend-architect, 2026-11-07; this one lane/c-social, FB-12, the designer's ruling D-7). The Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit). ON THE EA SECURITY LIST with 2027-03-22-live-events.sql and 1043-hearthrise.sql: a row here moves
-- Level XP (a ranked board).
-- WHAT: three server-only catalogues, each rewritten whole. hr_live_event_types (${c.types.length} rows: one permille dial a type or none, its
-- range, how two live rows combine, its scope's kind, the switch that arms it), hr_live_events (${c.events.length} rows: type, pm, sized_by,
-- boss, scope, a first window, its hours, how often it comes back, until when, and the System lines the announcer writes at a window's start
-- and end) and hr_hearth_fire_rule (one row: what sizes the Hearthrise from the Great Hearth's fire). THE SHAPE MOVES ONCE, here: a type
-- may carry no dial (a world boss opens his room and moves no number), and an event may be sized by the fire (its pm is the floor; the
-- server reads the size at the lighting) or name its boss. A guard trigger holds every pm inside its type's range. No function, grant or
-- client verb here beyond that trigger.
-- ORDER: after every file of this generator before it. 1043-hearthrise.sql reads the new columns and the fire rule.
-- Idempotent: the tables are made if absent, the shape's constraints dropped and re-made, every row rewritten whole, so a second apply is
-- byte-identical. No begin/commit.
-- REVERSIBLE: re-apply 2027-05-07-open-halls-words-live-events-catalogue.generated.sql after dropping hr_live_events.sized_by and .boss,
-- the shape constraint and hr_hearth_fire_rule (1043-hearthrise.sql first: it reads them).
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
-- THE SHAPE (D-7): a type with no dial (no stack, the world, lo = hi = 1000), and an event sized by the fire or naming its boss.
alter table public.hr_live_event_types alter column dial drop not null;
alter table public.hr_live_event_types alter column stack drop not null;
alter table public.hr_live_event_types drop constraint if exists hr_live_event_types_dial_check;
alter table public.hr_live_event_types drop constraint if exists hr_live_event_types_stack_check;
alter table public.hr_live_event_types drop constraint if exists hr_live_event_types_scope_kind_check;
alter table public.hr_live_event_types drop constraint if exists hr_live_event_types_shape;
alter table public.hr_live_event_types add constraint hr_live_event_types_shape check (
  (dial in ('xpPm', 'feePm') and stack in ('add', 'min') and scope_kind in ('grounds', 'calls'))
  or (dial is null and stack is null and scope_kind = 'world' and lo = 1000 and hi = 1000));
alter table public.hr_live_events add column if not exists sized_by text;
alter table public.hr_live_events add column if not exists boss text;
alter table public.hr_live_events drop constraint if exists hr_live_events_sized;
alter table public.hr_live_events add constraint hr_live_events_sized check (
  (sized_by is null or sized_by = 'fire') and (boss is null or boss ~ '^[a-z0-9_]{1,64}$') and not (sized_by is not null and boss is not null));
create table if not exists public.hr_hearth_fire_rule (
  id             boolean primary key default true check (id),
  share_pm       int    not null check (share_pm between 1 and 1000),
  day_cap_shares int    not null check (day_cap_shares between 1 and 100),
  marks          int    not null check (marks between 1 and 10),
  floor_pm       int    not null check (floor_pm between 1000 and 1250),
  step_pm        int    not null check (step_pm between 1 and 250),
  max_days       int    not null check (max_days between 1 and 90),
  named_fuel     int    not null check (named_fuel >= 1),
  ref_day        bigint not null check (ref_day >= 1),
  per_active_day bigint not null check (per_active_day >= 1),
  check (floor_pm + step_pm * marks <= 1250)
);
alter table public.hr_live_event_types enable row level security;
alter table public.hr_live_events enable row level security;
alter table public.hr_hearth_fire_rule enable row level security;
revoke all on public.hr_live_event_types from public, anon, authenticated, service_role;
revoke all on public.hr_live_events from public, anon, authenticated, service_role;
revoke all on public.hr_hearth_fire_rule from public, anon, authenticated, service_role;
comment on table public.hr_live_event_types is
  '${OUT_NAME}: what a live-event type may move (src/data/live-events.js LIVE_EVENT_TYPES through tools/gen-live-events.mjs): one permille dial or none, its range, its stacking rule, its scope''s kind, the switch that arms it. Server-only.';
comment on table public.hr_live_events is
  '${OUT_NAME}: the live events (src/data/live-events.js LIVE_EVENTS): type, pm (the floor when sized_by is fire), boss, scope, the schedule (first_at, hours, every_days, until_at) and the System lines of a window''s edges. Server-only.';
comment on table public.hr_hearth_fire_rule is
  '${OUT_NAME}: the Hearthrise''s fire rule (src/data/hearthrise.js HEARTHRISE_FIRE, designer D-7): share, day cap, marks, floor, step, days, a named fuel''s worth, fuel per active day. Server-only. Read by 1043-hearthrise.sql.';

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
insert into public.hr_live_events (event_id, type_id, pm, sized_by, boss, scope, first_at, hours, every_days, until_at, name, start_words, end_words) values
${eventValues};
delete from public.hr_hearth_fire_rule;
insert into public.hr_hearth_fire_rule (id, share_pm, day_cap_shares, marks, floor_pm, step_pm, max_days, named_fuel, ref_day, per_active_day) values
  (true, ${f.sharePm}, ${f.dayCapShares}, ${f.marks}, ${f.floorPm}, ${f.stepPm}, ${f.maxDays}, ${f.namedFuel}, ${f.refDay}, ${f.perActiveDay});

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rows are exactly the generated sets; a pm outside its type's range is refused; a fire past +25% is refused; no client reaches a table.
do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_live_event_types) <> ${c.types.length}
     or exists (select 1 from (values
      ${checkTypes}) d(type_id, switch_id, dial, lo, hi, stack, scope_kind)
                 where not exists (select 1 from public.hr_live_event_types t where t.type_id = d.type_id and t.switch_id = d.switch_id
                                     and t.dial is not distinct from d.dial and t.lo = d.lo and t.hi = d.hi
                                     and t.stack is not distinct from d.stack and t.scope_kind = d.scope_kind)) then
    raise exception 'live-events-catalogue: hr_live_event_types is not the generated set'; end if;
  if (select count(*) from public.hr_live_events) <> ${c.events.length}
     or exists (select 1 from (values
      ${checkEvents}) d(event_id, type_id, pm, sized_by, boss, scope, first_at, hours, every_days, until_at, words)
                 where not exists (select 1 from public.hr_live_events e
                                    where e.event_id = d.event_id and e.type_id = d.type_id and e.pm = d.pm and e.scope = d.scope
                                      and e.sized_by is not distinct from d.sized_by and e.boss is not distinct from d.boss
                                      and e.first_at = d.first_at::timestamptz and e.hours = d.hours and e.every_days is not distinct from d.every_days
                                      and e.until_at is not distinct from d.until_at and md5(e.name || '|' || e.start_words || '|' || e.end_words) = d.words)) then
    raise exception 'live-events-catalogue: hr_live_events is not the generated set'; end if;
  if not exists (select 1 from public.hr_hearth_fire_rule r where r.id and (r.share_pm, r.day_cap_shares, r.marks, r.floor_pm, r.step_pm, r.max_days, r.named_fuel, r.ref_day, r.per_active_day)
                   = (${f.sharePm}, ${f.dayCapShares}, ${f.marks}, ${f.floorPm}, ${f.stepPm}, ${f.maxDays}, ${f.namedFuel}, ${f.refDay}::bigint, ${f.perActiveDay}::bigint))
     or (select count(*) from public.hr_hearth_fire_rule) <> 1 then
    raise exception 'live-events-catalogue: hr_hearth_fire_rule is not the generated row'; end if;
  begin
    update public.hr_live_events e set pm = (select t.hi + 1 from public.hr_live_event_types t where t.type_id = e.type_id);
    raise exception 'live-events-catalogue: a pm past its type''s range was stored';
  exception when check_violation then null;
  end;
  begin
    update public.hr_hearth_fire_rule set step_pm = step_pm + 1;
    raise exception 'live-events-catalogue: a fire that lights past +25%% was stored';
  exception when check_violation then null;
  end;
  foreach v_t in array array['hr_live_event_types', 'hr_live_events', 'hr_hearth_fire_rule'] loop
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
  const H = await import(u('src/data/hearthrise.js'));
  const { OPEN_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { BOSS_CALLS } = await import(u('src/data/boss-calls.js'));
  return { T: L.LIVE_EVENT_TYPES, E: L.LIVE_EVENTS, anchor: L.CALENDAR_ANCHOR, grounds: Object.keys(OPEN_GROUNDS), calls: Object.keys(BOSS_CALLS),
    fire: { rule: H.HEARTHRISE_FIRE, refDay: H.FIRE_REFERENCE_DAY.fuel, perActiveDay: H.fuelPerActiveDay } };
}

const said = (c) => c.types.length + ' types (' + c.types.map((t) => t.id + ' ' + t.dial + ' ' + t.stack).join(', ') + '), ' + c.events.length + ' events ('
  + c.events.map((e) => e.id + ' ' + (e.sizedBy || e.pm) + ' from ' + e.first + ' for ' + e.hours + ' h every ' + e.everyDays + ' d').join(', ') + '), the fire '
  + c.fire.perActiveDay + ' a day a share';

/* The insert rows' form the catalogue guard (tests/live-events.mjs `catalogue`) reads: id, type, pm, sized_by, boss, scope. */
export const EVENT_ROW = /^ {2}\('([a-z0-9_]+)', '([a-z0-9_]+)', (\d+), (null|'[a-z]+'), (null|'[a-z0-9_]+'), '\{[a-z0-9_,]+\}'::text\[\]/gm;

async function selftest() {
  const D = await loadData(ROOT);
  let bad = 0;
  const ev = (id, patch) => ({ ...D, E: { ...D.E, [id]: { ...D.E[id], ...patch } } });
  const ty = (id, patch) => ({ ...D, T: { ...D.T, [id]: { ...D.T[id], ...patch } } });
  const fr = (patch) => ({ ...D, fire: { ...D.fire, rule: { ...D.fire.rule, ...patch } } });
  const expectThrow = (name, Dx) => { try { catalogueOf(Dx); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  expectThrow('an XP range past +25%', ty('xp_bonus', { range: [1100, 1300] }));
  expectThrow('a typed size past the range', ev('hearthrise', { pm: 1300 }));
  expectThrow('an XP dial that stacks by the lowest', ty('xp_bonus', { stack: 'min' }));
  expectThrow('a dial the server does not know', ty('xp_bonus', { dial: 'coinPm' }));
  expectThrow('a type with no dial that carries a range', ty('world_boss', { range: [1000, 1100] }));
  expectThrow('a world boss row that names no boss', ev('mossback', { boss: undefined }));
  expectThrow('a world boss row with a size', ev('mossback', { pm: 1100 }));
  expectThrow('a window of 0 hours', ev('hearthrise', { hours: 0 }));
  expectThrow('a window that overlaps its own repeat', ev('hearthrise', { hours: 72, everyDays: 2 }));
  expectThrow('two events at once (27-5)', ev('mossback', { offsetDays: 14 }));
  expectThrow('an offset that is no whole day', ev('hearthrise', { offsetDays: 14.5 }));
  expectThrow('an anchor that is no Friday 12:00 UTC', { ...D, anchor: '2027-01-02T12:00:00Z' });
  expectThrow('until before first', ev('hearthrise', { until: '2026-01-01T00:00:00Z' }));
  expectThrow('a scope naming no ground', ev('hearthrise', { scope: ['nowhere'] }));
  expectThrow('an event of no type', ev('hearthrise', { type: 'lucky_weekend' }));
  expectThrow('words with a semicolon', ev('hearthrise', { words: { ...D.E.hearthrise.words, end: 'Hearthrise over; next one soon.' } }));
  expectThrow('a System line past the chat\'s length', ev('hearthrise', { words: { ...D.E.hearthrise.words, start: 'x'.repeat(230) + ' {end}' } }));
  expectThrow('a full fire past +25%', fr({ stepPm: 31 }));
  expectThrow('a fire share of nothing', fr({ fireShare: 0 }));
  expectThrow('fuel per active day not read from the reference day', { ...D, fire: { ...D.fire, perActiveDay: D.fire.perActiveDay + 1 } });
  const sql = buildSql(catalogueOf(D));
  const inserts = [...sql.matchAll(EVENT_ROW)].length;
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
