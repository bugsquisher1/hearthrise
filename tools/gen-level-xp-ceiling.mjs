#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-level-xp-ceiling.mjs — GENERATE THE SERVER'S LEVEL XP CEILING.
//
// Level XP is the ranked number. The settle already bounds what one WINDOW may
// credit by its kills (hr_hunt_apply_member: journalled kills x the ground's
// best kill x headroom), but nothing bounded a hero's HOUR or DAY: the best
// kill is a boss's, the headroom is 3, and a window's kill bound carries a
// slack that adds up over a day of short windows (DISCOVERIES 2026-11-10 row 4:
// "level_xp is ranked with no daily ceiling"). This is that ceiling, and it is
// DERIVED, not typed: the most Level XP an hour the balance sheet lets the top
// ground pay with every dial at its best, times a safety factor.
//
//   hour = contract(top Level) x band max x party max x tier max x event max x SAFETY
//     contract(L)   src/data/balance-sheet.js contractXpPerH (LEVEL_PACE.contract: what a ground pays at its own Level)
//     top Level     tools/balance-sim/level-pace.json `ceiling` (no ground pays past it; the economy watch reads the same)
//     band max      BALANCE_SHEET.normal.xpVsContract.max (how far over the contract a ground may pay on Normal)
//     party max     BALANCE_SHEET.party.fourVsSolo[1] (the most a head of a mixed four earns over the same hero alone)
//     tier max      the largest TIER_DIALS xpPm (Deadly)
//     event max     LIVE_EVENT_TYPES.xp_bonus.range[1] (the most live events may add, all of them together)
//     SAFETY        below: what the sheet does not model (a hero far over a ground's band clearing it faster)
//   day  = hour x 24 (a hero may hunt every hour of a day: stamina refills are sold)
//
// Emitted as hr_level_xp_ceiling (ONE row, every factor beside the result, so the
// number can be shown and re-derived). hr_hunt_apply_member reads it from
// 2027-04-02-level-xp-ceiling.sql on.
//
//   Regenerate:  node tools/gen-level-xp-ceiling.mjs
//   Verify:      node tools/gen-level-xp-ceiling.mjs --check     (exit 1 on drift: the twin guard)
//   Selftest:    node tools/gen-level-xp-ceiling.mjs --selftest  (every refusal bites)
//
// A MOVED INPUT (a new top ground, a re-fitted contract, a new tier or event
// dial) is a NEW dated file: move OUT_FILE, regenerate, apply it BEFORE the
// engine that pays the new rate, or its honest settles are refused value_over.
//
// REFUSES (throws, nothing written): an input that is missing or not a positive
// number; a dial under 1000; an hour ceiling under twice the highest rate the
// real engine was MEASURED at (level-pace.json `ladder`): a ceiling an honest
// hero could reach is a bug, not a bound.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* The dated file this generator writes. A moved input is a new dated file; an applied one stays as history. */
export const OUT_FILE = '2027-04-02-level-xp-ceiling.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
/* What the sheet does not model, as a permille: twice its own best hour. Measured 2026-11-09 (level-pace.json): the real
   engine's highest Level XP an hour is 222,774 (Coppercap Warrens, Normal, alone); the ceiling this gives is about 5.4x that. */
export const SAFETY_PM = 2000;
export const HOURS_A_DAY = 24;
/* The ceiling must clear the highest MEASURED rate by at least this, or the generator refuses. */
export const MEASURED_HEADROOM = 2;

/** The inputs, read from a tree (the repo, or a mutant copy). */
export async function inputs(root) {
  const u = (p) => pathToFileURL(join(root, ...p.split('/'))).href;
  const [sheet, live] = await Promise.all(['src/data/balance-sheet.js', 'src/data/live-events.js'].map((p) => import(u(p))));
  const pace = JSON.parse(readFileSync(join(root, 'tools', 'balance-sim', 'level-pace.json'), 'utf8'));
  return {
    level: pace.ceiling,
    contract: typeof sheet.contractXpPerH === 'function' && Number.isFinite(Number(pace.ceiling)) ? sheet.contractXpPerH(Number(pace.ceiling)) : NaN,
    bandPm: Math.round(Number(sheet.BALANCE_SHEET && sheet.BALANCE_SHEET.normal && sheet.BALANCE_SHEET.normal.xpVsContract && sheet.BALANCE_SHEET.normal.xpVsContract.max) * 1000),
    partyPm: Math.round(Number(sheet.BALANCE_SHEET && sheet.BALANCE_SHEET.party && sheet.BALANCE_SHEET.party.fourVsSolo && sheet.BALANCE_SHEET.party.fourVsSolo[1]) * 1000),
    tierPm: Math.max(...Object.values(sheet.TIER_DIALS || {}).map((t) => Number(t && t.xpPm))),
    eventPm: Number(live.LIVE_EVENT_TYPES && live.LIVE_EVENT_TYPES.xp_bonus && live.LIVE_EVENT_TYPES.xp_bonus.range && live.LIVE_EVENT_TYPES.xp_bonus.range[1]),
    measured: Math.max(...((pace.ladder && pace.ladder.points) || []).map((p) => Number(p[1]))),
    safetyPm: SAFETY_PM,
  };
}

/** The one row, validated. */
export function ceiling(I) {
  const problems = [];
  if (!Number.isInteger(I.level) || I.level < 1 || I.level > 100000) problems.push('the top Level ' + I.level + ' is not a Level');
  if (!(I.contract > 0) || !Number.isFinite(I.contract)) problems.push('the contract at the top Level is ' + I.contract);
  for (const k of ['bandPm', 'partyPm', 'tierPm', 'eventPm', 'safetyPm']) {
    if (!Number.isInteger(I[k]) || I[k] < 1000 || I[k] > 100000) problems.push(k + ' ' + I[k] + ' is not a permille from 1000 (a dial at its best never pays less than no dial)');
  }
  if (!(I.measured > 0) || !Number.isFinite(I.measured)) problems.push('no measured rate (level-pace.json `ladder`)');
  if (problems.length) throw new Error('gen-level-xp-ceiling: ' + problems.join('; '));
  const sheetHour = I.contract * (I.bandPm / 1000) * (I.partyPm / 1000) * (I.tierPm / 1000) * (I.eventPm / 1000);
  const hour = Math.ceil((sheetHour * I.safetyPm) / 1000 / 1000) * 1000;   // up to the next thousand
  if (hour < I.measured * MEASURED_HEADROOM) {
    throw new Error('gen-level-xp-ceiling: the hour ceiling ' + hour + ' is under ' + MEASURED_HEADROOM + 'x the highest measured rate ' + I.measured
      + ': an honest hero could reach it');
  }
  return { level: I.level, contract: Math.round(I.contract), bandPm: I.bandPm, partyPm: I.partyPm, tierPm: I.tierPm, eventPm: I.eventPm, safetyPm: I.safetyPm,
    measured: Math.round(I.measured), hour, day: hour * HOURS_A_DAY };
}

/** The generated SQL. */
export function buildSql(C) {
  const n = (v) => Number(v).toLocaleString('en-US');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Generated by tools/gen-level-xp-ceiling.mjs from src/data/balance-sheet.js (the contract, the Normal band,
-- the party ceiling, the tier dials), src/data/live-events.js (the event dial's range) and the measured pace
-- (tools/balance-sim/level-pace.json). Do not hand-edit: any hand edit FAILS
-- \`node tools/gen-level-xp-ceiling.mjs --check\`.
-- THE LEVEL XP CEILING (DISCOVERIES 2026-11-10 row 4; lane/c-server-debt): the most Level XP the server will
-- credit one hero in an hour and in a UTC day. ${n(C.hour)} an hour = the contract at Level ${C.level} (${n(C.contract)})
-- x the Normal band's top ${C.bandPm / 1000} x the party ceiling ${C.partyPm / 1000} x the best tier ${C.tierPm / 1000} x the event range ${C.eventPm / 1000}
-- x safety ${C.safetyPm / 1000}, rounded up; ${n(C.day)} a day (${HOURS_A_DAY} such hours). The real engine's highest measured hour is
-- ${n(C.measured)}. ONE ROW; no player row, no value. hr_hunt_apply_member reads it from
-- 2027-04-02-level-xp-ceiling.sql on. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_level_xp_ceiling (
  id         boolean primary key default true check (id),            -- one row
  hour_max   bigint  not null check (hour_max >= 1),                 -- the most Level XP one hero is credited in an hour
  day_max    bigint  not null check (day_max >= hour_max),           -- ... and in a UTC day
  top_level  integer not null check (top_level >= 1),                -- the Level the contract was read at
  contract   bigint  not null check (contract >= 1),                 -- contract XP an hour at that Level
  band_pm    integer not null check (band_pm >= 1000),
  party_pm   integer not null check (party_pm >= 1000),
  tier_pm    integer not null check (tier_pm >= 1000),
  event_pm   integer not null check (event_pm >= 1000),
  safety_pm  integer not null check (safety_pm >= 1000),
  measured   bigint  not null check (measured >= 1)                  -- the real engine's highest measured hour, for the record
);
alter table public.hr_level_xp_ceiling enable row level security;
revoke all on public.hr_level_xp_ceiling from public, anon, authenticated, service_role;
comment on table public.hr_level_xp_ceiling is
  'GENERATED by tools/gen-level-xp-ceiling.mjs: the most Level XP the settle credits one hero in an hour and a UTC day, with every factor it was derived from. Read only by hr_hunt_apply_member. No client grant, no policy.';

insert into public.hr_level_xp_ceiling (id, hour_max, day_max, top_level, contract, band_pm, party_pm, tier_pm, event_pm, safety_pm, measured) values
  (true, ${C.hour}, ${C.day}, ${C.level}, ${C.contract}, ${C.bandPm}, ${C.partyPm}, ${C.tierPm}, ${C.eventPm}, ${C.safetyPm}, ${C.measured})
  on conflict (id) do update set hour_max = excluded.hour_max, day_max = excluded.day_max, top_level = excluded.top_level, contract = excluded.contract,
    band_pm = excluded.band_pm, party_pm = excluded.party_pm, tier_pm = excluded.tier_pm, event_pm = excluded.event_pm, safety_pm = excluded.safety_pm,
    measured = excluded.measured;

-- SELF-CHECK (CLAUDE.md §4), executed.
do $chk$
declare r text; c public.hr_level_xp_ceiling%rowtype;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_table_privilege(r, 'public.hr_level_xp_ceiling', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'level-xp-ceiling: % holds a privilege on hr_level_xp_ceiling', r; end if;
  end loop;
  if not (select k.relrowsecurity from pg_class k where k.oid = 'public.hr_level_xp_ceiling'::regclass) then
    raise exception 'level-xp-ceiling: row level security is off on hr_level_xp_ceiling'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_level_xp_ceiling') then
    raise exception 'level-xp-ceiling: a policy stands on hr_level_xp_ceiling'; end if;
  select * into c from public.hr_level_xp_ceiling where id;
  if not found or (select count(*) from public.hr_level_xp_ceiling) <> 1 then raise exception 'level-xp-ceiling: not exactly one row'; end if;
  -- the row is its own arithmetic: the factors give the hour, the hour gives the day, and it clears the measured engine
  --   (the contract is stored to the whole XP, the hour rounded up to the next thousand: within 1,010 above, 10 below)
  if c.hour_max - c.contract::numeric * c.band_pm * c.party_pm * c.tier_pm * c.event_pm * c.safety_pm / 1e15 not between -10 and 1010 then
    raise exception 'level-xp-ceiling: hour_max % is not its factors'' product %', c.hour_max,
      round(c.contract::numeric * c.band_pm * c.party_pm * c.tier_pm * c.event_pm * c.safety_pm / 1e15); end if;
  if c.day_max <> c.hour_max * ${HOURS_A_DAY} then raise exception 'level-xp-ceiling: day_max % is not ${HOURS_A_DAY} hours of %', c.day_max, c.hour_max; end if;
  if c.hour_max < c.measured * ${MEASURED_HEADROOM} then raise exception 'level-xp-ceiling: hour_max % is under ${MEASURED_HEADROOM}x the measured %', c.hour_max, c.measured; end if;
  raise notice 'level-xp-ceiling: % Level XP an hour, % a day (the measured best hour is %); all green', c.hour_max, c.day_max, c.measured;
end $chk$;
`;
}

async function selftest() {
  let bad = 0;
  const I = await inputs(ROOT);
  const expectThrow = (name, edit, want) => {
    const J = Object.assign({}, I); edit(J);
    try { ceiling(J); console.error('  MISSED  ' + name); bad++; }
    catch (e) { if (String(e.message).includes(want)) console.log('  caught  ' + name); else { console.error('  MISSED  ' + name + ' (threw: ' + e.message + ')'); bad++; } }
  };
  try { const C = ceiling(I); console.log('  ok      the real inputs generate: ' + C.hour + ' an hour, ' + C.day + ' a day (measured ' + C.measured + ')'); }
  catch (e) { console.error('  FAIL    the real inputs do not generate: ' + e.message); bad++; }
  expectThrow('no top Level', (J) => { J.level = undefined; }, 'is not a Level');
  expectThrow('a contract that is not a number', (J) => { J.contract = NaN; }, 'the contract at the top Level');
  expectThrow('a tier dial that pays less than Normal', (J) => { J.tierPm = 900; }, 'tierPm 900 is not a permille from 1000');
  expectThrow('an event dial read as a fraction', (J) => { J.eventPm = 1.5; }, 'eventPm 1.5 is not a permille');
  expectThrow('a missing party ceiling', (J) => { J.partyPm = NaN; }, 'partyPm NaN is not a permille');
  expectThrow('no measured rate', (J) => { J.measured = -Infinity; }, 'no measured rate');
  expectThrow('a ceiling an honest hero could reach', (J) => { J.measured = J.contract * 100; }, 'an honest hero could reach it');
  /* the arithmetic: doubling a dial doubles the hour (to the rounding), the day is 24 of them */
  const a = ceiling(I), b = ceiling(Object.assign({}, I, { eventPm: I.eventPm * 2 }));
  if (Math.abs(b.hour - a.hour * 2) > 1000 || a.day !== a.hour * HOURS_A_DAY || a.hour % 1000 !== 0) { console.error('  FAIL    the arithmetic: ' + JSON.stringify([a, b])); bad++; }
  else console.log('  ok      a doubled dial doubles the hour; the day is ' + HOURS_A_DAY + ' hours');
  console.log(bad ? 'gen-level-xp-ceiling --selftest: ' + bad + ' arm(s) failed' : 'gen-level-xp-ceiling --selftest: every refusal bites');
  return bad ? 1 : 0;
}

async function main() {
  if (process.argv.includes('--selftest')) process.exit(await selftest());
  const wanted = buildSql(ceiling(await inputs(ROOT)));
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').then((s) => s.replace(/\r\n/g, '\n'), () => null);
    if (have !== wanted) {
      console.error('gen-level-xp-ceiling: supabase/migrations/' + OUT_FILE + ' is not what the sheet generates.\n'
        + '  A moved input needs a NEW dated ceiling (move OUT_FILE, regenerate), applied before the engine that pays the new rate.');
      process.exit(1);
    }
    console.log('gen-level-xp-ceiling: ' + OUT_FILE + ' is in sync with the sheet');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-level-xp-ceiling: wrote supabase/migrations/' + OUT_FILE);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
