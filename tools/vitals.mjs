// ============================================================================
// tools/vitals.mjs — the §3.4 dead-feature vitals, read-only, from production.
//
//   node tools/vitals.mjs            # last 7 days, per day
//   node tools/vitals.mjs --refusals # why calls were REFUSED, by code and verb, plus
//                                    # the deny-list codes per (user, slot)
//   node tools/vitals.mjs --world-tick # the tick's fire log per hour (24 h) and the
//                                    # shadow journal per day (7 d), with the STALL rule
//   node tools/vitals.mjs --selftest # the world-tick aggregation and STALL rule on
//                                    # fixture rows, mutation-proved; no token, no DB
//
// Runs ONE fixed SELECT over public.player_ledger through the same management
// endpoint tools/apply-migration.mjs uses (token from ~/.supabase-token, read
// as file bytes, never printed, never argv). The query text is SELECT-only and
// the tool refuses to send anything that is not: this is a read, never a write.
// A feature at zero for two days is a P1 by definition (CLAUDE.md §3.4).
// Vocabulary measured from production 2026-09-07: ledger kinds farm/combat/gather/
// craft/worker/shop/quest/daily with intents farm_plant|farm_water|farm_harvest,
// xp_credit|accrue|death, shop_buy:*, unlock_buy:room.*; the market lives in its
// own tables (market_listings.posted_at, market_sales.at).
//
// ── THE `refused` COLUMN (2026-09-12) ───────────────────────────────────────
// It used to read player_intents with `result->>'ok' <> 'true'` and was
// STRUCTURALLY ALWAYS ZERO: measured 2026-09-11, player_intents held 955 rows of
// which 0 were non-ok, because every refusal returns BEFORE the intent row is
// claimed. The header then described that zero as "not journalled", which read
// as a known gap and was in fact a broken gauge — the journal existed.
//
// It now reads public.hr_rejections, which is the journal
// (2026-08-11-player-state.sql §6b-ii) and which
// 2026-09-12-hr-rejections-journal.sql extended to carry the VERB and to cover
// every gated wrapper plus the seven self-gating player verbs. Two things to
// know when reading it:
//   · hr_rejections is a DAILY AGGREGATE, one row per (user, slot, day, code),
//     so `refused` is a sum of occurrences, not a row count — and a rolling
//     24h window is not available. --refusals says "day bucket" for that reason
//     rather than pretending to a rolling window.
//   · `rate_limited` is SAMPLED by hr_rate_gate (the sample carries its own
//     weight), so its count is a weighted estimate while every other code is
//     exact.
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Read lazily, on the first query, so --selftest runs with no token at all.
let token = null;
const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';

const QUERY = `
with days as (
  select generate_series(((now() at time zone 'UTC')::date - 7)::timestamp, (now() at time zone 'UTC')::date::timestamp, interval '1 day')::date as day),
led as (
  select (l.at at time zone 'UTC')::date as day,
         count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_plant')             as plants,
         count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_water')             as waters,
         count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_harvest')           as harvests,
         count(*) filter (where l.kind = 'combat' and l.intent in ('xp_credit','accrue'))  as fights,
         count(*) filter (where l.kind = 'combat' and l.intent = 'death')                  as deaths,
         count(*) filter (where l.kind = 'gather')                                         as gathers,
         count(*) filter (where l.kind = 'craft')                                          as crafts,
         count(*) filter (where l.kind = 'worker')                                         as workers,
         count(*) filter (where l.kind = 'shop'   and l.intent like 'shop_buy:%')          as buys,
         count(*) filter (where l.kind = 'shop'   and l.intent like 'unlock_buy:room.%')   as rooms,
         count(*) filter (where l.kind in ('quest','daily'))                               as claims,
         count(distinct l.user_id)                                                         as users
  from public.player_ledger l where l.at >= now() - interval '8 days' group by 1),
mk as (select (posted_at at time zone 'UTC')::date as day, count(*) as listings from public.market_listings where posted_at >= now() - interval '8 days' group by 1),
ms as (select (at at time zone 'UTC')::date as day, count(*) as sales from public.market_sales where at >= now() - interval '8 days' group by 1),
rf as (select day, sum(n) as refused from public.hr_rejections where day >= ((now() at time zone 'UTC')::date - 8) group by 1),
-- COMPANION XP, read from player_progress rather than the ledger. hr_apply
-- journals a progress op as a KEY NAME ONLY in meta.k (the game_events lesson:
-- 1.6M rows / 229 MB from six players in four days), so the ledger cannot answer
-- "did a pet earn anything today" and no other column here could. player_progress
-- carries updated_at, which can. Security review 2026-09-20, finding S-PX-2:
-- companion XP was at zero from the day it shipped until a player said so twice,
-- and nothing in this table could have shown it. A feature at zero for two days
-- is a P1 by definition (CLAUDE.md §3.4) — so it has to be countable.
pet as (select (updated_at at time zone 'UTC')::date as day,
               count(*) as pets_xp, sum(value) as pet_xp
          from public.player_progress
         where kind = 'stat' and key like 'companion_xp:%' and period_key = ''
           and updated_at >= now() - interval '8 days' group by 1)
select d.day, coalesce(plants,0) plants, coalesce(waters,0) waters, coalesce(harvests,0) harvests, coalesce(fights,0) fights, coalesce(deaths,0) deaths,
       coalesce(gathers,0) gathers, coalesce(crafts,0) crafts, coalesce(workers,0) workers, coalesce(buys,0) buys, coalesce(rooms,0) rooms, coalesce(claims,0) claims,
       coalesce(pets_xp,0) pets_xp, coalesce(pet_xp,0) pet_xp,
       coalesce(listings,0) listings, coalesce(sales,0) sales, coalesce(refused,0) refused, coalesce(users,0) users
from days d left join led using (day) left join mk using (day) left join ms using (day) left join rf using (day)
         left join pet using (day)
order by d.day desc`;

// WHY a REFUSAL BREAKDOWN is a separate query and not more columns: the vitals
// table answers "is this feature alive"; this answers "what is the server
// telling players NO about, and on which verb". Paione's 2026-09-11 afternoon —
// 4-8 taps to equip a staff, stop-combat snapping back — is one row of this
// output and was invisible in the other one.
const REFUSALS = `
with x as (
  -- NO BACKTICKS IN HERE. This is a JS template literal, so a backtick in an
  -- SQL comment ends the string and the whole tool stops parsing -- which is
  -- exactly what shipped at 52b59fe5 and was caught by node --check, not by me.
  -- The column "verbs" is read through to_jsonb(h) rather than named directly
  -- so that this tool runs BEFORE 2026-09-12-hr-rejections-journal.sql is
  -- applied as well as after: a missing column yields NULL instead of a parse
  -- error, and the breakdown shows a dash. A read-only ops tool must never be
  -- the thing that has to be deployed in lockstep with a migration.
  select h.day, h.code, h.severity, h.n,
         coalesce((to_jsonb(h) ->> 'verbs')::jsonb, '{}'::jsonb) as verbs,
         coalesce((to_jsonb(h) ->> 'whys')::jsonb, '{}'::jsonb) as whys
    from public.hr_rejections h
   where h.day >= ((now() at time zone 'UTC')::date - 1)),
v as (
  select x.day, x.code, e.key as verb, sum(e.value::bigint) as vn
    from x, lateral jsonb_each_text(x.verbs) e group by 1, 2, 3),
w as (
  select x.day, x.code, e.key as why, sum(e.value::bigint) as wn
    from x, lateral jsonb_each_text(x.whys) e group by 1, 2, 3)
select x.day, x.code, min(x.severity) as severity, sum(x.n) as n,
       count(*) as characters,
       coalesce((select string_agg(v.verb || '=' || v.vn::text, ' ' order by v.vn desc, v.verb)
                   from v where v.day = x.day and v.code = x.code), '-') as verbs,
       -- NO BACKTICKS IN HERE (see the note in the query above -- a backtick in
       -- an SQL comment ends this JS template literal). A single (none) is the
       -- whole story for a code with no reason key at all, which is most of
       -- them, so it prints as a dash rather than as noise.
       coalesce(nullif((select string_agg(w.why || '=' || w.wn::text, ' ' order by w.wn desc, w.why)
                          from w where w.day = x.day and w.code = x.code
                           and not (w.why = '(none)'
                                and 1 = (select count(*) from w w2
                                          where w2.day = x.day and w2.code = x.code))), ''), '-')
         as whys
  from x group by x.day, x.code
 order by x.day desc, sum(x.n) desc, x.code`;

// WHY THE DENY-LIST CODES GET THEIR OWN PER-(user, slot) ROWS (2026-09-23).
// hr_rejections is already a per-(user, slot, day, code) aggregate, and the
// table above then SUMS those rows away. For most codes that is the right
// reading. For the two deny-list codes it hides the only fact worth having:
// MEASURED on production, forbidden_field has run at 927-955 occurrences a day
// since 2026-09-13 20:48 UTC and every one of them is ONE CHARACTER -- user
// b94fa8c0 slot 0, a hidden pre-b544 tab still sending the retired key -- which
// is roughly 99% of the refused count the vitals table prints. Read as a total
// it looks like the server is refusing the whole player base; read per tab it is
// one browser window nobody has reloaded, and any REAL burst underneath it (an
// equip conflict, a rate-limit storm) is invisible until it is separated out.
// So: ONE TAB PRINTS AS ONE TAB.
//
// NO BACKTICKS IN THIS STRING, including in its SQL comments -- see the note in
// REFUSALS. retired_field arrives with
// 2026-09-23-client-state-retired-fields.sql; before it is applied this simply
// returns no rows for that code, which is the honest answer and not an error.
const REFUSAL_TABS = `
with x as (
  select h.day, h.code, h.severity, h.n, h.user_id, h.slot, h.last_at, h.intent,
         coalesce((to_jsonb(h) ->> 'whys')::jsonb, '{}'::jsonb) as whys
    from public.hr_rejections h
   where h.day >= ((now() at time zone 'UTC')::date - 1)
     and h.code in ('forbidden_field', 'retired_field')),
w as (
  select x.day, x.code, x.user_id, x.slot, e.key as why, sum(e.value::bigint) as wn
    from x, lateral jsonb_each_text(x.whys) e group by 1, 2, 3, 4, 5)
select x.day, x.code, x.severity,
       left(x.user_id::text, 8) as who, x.slot, x.n,
       to_char(x.last_at at time zone 'UTC', 'HH24:MI') as last_utc,
       coalesce(nullif(x.intent, ''), '-') as verb,
       coalesce(nullif((select string_agg(w.why || '=' || w.wn::text, ' ' order by w.wn desc, w.why)
                          from w where w.day = x.day and w.code = x.code
                           and w.user_id = x.user_id and w.slot = x.slot
                           and not (w.why = '(none)'
                                and 1 = (select count(*) from w w2
                                          where w2.day = x.day and w2.code = x.code
                                            and w2.user_id = x.user_id and w2.slot = x.slot))), ''), '-')
         as whys
  from x
 order by x.day desc, x.n desc, x.code, who`;

// ── THE WORLD TICK (2026-09-28) ─────────────────────────────────────────────
// 2026-09-28-world-tick-stall-observability.sql (applied 05:34 UTC) makes every
// posted fire write detail.edge into hr_tick_cron_log: the SUM over the tick's
// own pg_net responses since the previous fire of {responses, non_tick,
// timed_out, settled, shadowed, skipped, refused, below_flush}, plus last_id,
// last_status and ONE top_reason/top_n (the largest skip/refuse reason other
// than below_flush, which is the benign reason on 8 of every 9 fires). A
// harvest that threw leaves edge = {harvest_error: sqlstate} instead.
//
// WHY THE STALL IS COMPUTED HERE AND NOT CALLED: the management endpoint runs as
// supabase_read_only_user, which CAN read hr_tick_cron_log (measured 2026-09-28;
// hr_tick_shadow is assumed, not measured: if it cannot, the read fails loudly
// with exit 1) but CANNOT execute hr_tick_stall_status() (owner-only, 42501). So the rule is
// restated in JS below and fed from the same two tables, bucketed exactly as
// the function buckets them: whole hours ENDING NOW, [now-(i+1)h, now-ih).
// tests/world-tick-stall-guard.mjs is the guard over the function; --selftest
// here is the guard over this restatement of it.
//
// NO BACKTICKS IN THIS STRING (see REFUSALS). No "update"/"delete"/"do" etc.
// either, not even in a comment: selectOnly() reads the words, not the grammar.
const edgeNum = (k) => `coalesce(sum(case when (e ->> '${k}') ~ '^[0-9]{1,12}$' then (e ->> '${k}')::bigint end), 0) as ${k}`;
const WORLD_TICK = `
with lg as (
  select ceil(extract(epoch from (now() - l.at)) / 3600)::int - 1 as i,
         l.outcome, l.rostered, l.detail -> 'edge' as e
    from public.hr_tick_cron_log l
   where l.at >= now() - interval '168 hours' and l.at < now()),
f as (
  select i, count(*) as fires,
         count(*) filter (where outcome = 'posted' and rostered >= 1) as rost_fires,
         coalesce(max(rostered), 0) as rostered,
         count(*) filter (where jsonb_typeof(e) = 'object') as harvested,
         ${['responses', 'settled', 'shadowed', 'skipped', 'refused', 'below_flush', 'timed_out', 'non_tick'].map(edgeNum).join(',\n         ')}
    from lg group by i),
rs as (
  select i, left(e ->> 'top_reason', 64) as reason,
         sum(case when (e ->> 'top_n') ~ '^[0-9]{1,12}$' then (e ->> 'top_n')::bigint else 0 end) as n
    from lg where (e ->> 'top_reason') is not null group by 1, 2
  union all
  select i, 'harvest_error:' || left(e ->> 'harvest_error', 16), count(*)
    from lg where (e ->> 'harvest_error') is not null group by 1, 2),
rt as (
  select i, string_agg(reason || '=' || n::text, ' ' order by n desc, reason) as reasons
    from (select rs.*, row_number() over (partition by i order by n desc, reason) as rn from rs) z
   where rn <= 3 group by i),
sh as (
  select ceil(extract(epoch from (now() - s.at)) / 3600)::int - 1 as i, count(*) as shadow_rows
    from public.hr_tick_shadow s
   where s.at >= now() - interval '168 hours' and s.at < now() group by 1)
select g.i,
       to_char((now() - make_interval(hours => g.i + 1)) at time zone 'UTC', 'MM-DD HH24:MI') as from_utc,
       ((now() - make_interval(hours => g.i + 1)) at time zone 'UTC')::date::text as day,
       coalesce(f.fires, 0) fires, coalesce(f.rost_fires, 0) rost_fires, coalesce(f.rostered, 0) rostered,
       coalesce(sh.shadow_rows, 0) shadow_rows, coalesce(f.harvested, 0) harvested,
       coalesce(f.responses, 0) responses, coalesce(f.settled, 0) settled, coalesce(f.shadowed, 0) shadowed,
       coalesce(f.skipped, 0) skipped, coalesce(f.refused, 0) refused, coalesce(f.below_flush, 0) below_flush,
       coalesce(f.timed_out, 0) timed_out, coalesce(f.non_tick, 0) non_tick,
       coalesce(rt.reasons, '-') as reasons
  from generate_series(0, 167) g(i)
  left join f on f.i = g.i left join sh on sh.i = g.i left join rt on rt.i = g.i
 order by g.i`;

// The mode decides whether the rule judges at all (armed: shadow rows are zero
// by design). hr_tick_config is read separately so that a read-only role that
// cannot see it costs the mode, never the table: the verdict then says "mode
// unread" and judges as if in shadow.
const WORLD_TICK_MODE = `
select case when not coalesce(c.enabled, false) then 'off'
            when coalesce(cardinality(c.armed_channels), 0) = 0 then 'shadow'
            when c.channels <@ c.armed_channels then 'armed' else 'partial' end as mode
  from public.hr_tick_config c where c.id`;

// ── STALL RULE BEGIN ─────────────────────────────────────────────────────────
// Everything between BEGIN and END is pure and self-contained: --selftest lifts
// this exact text out of the file, plants one defect at a time and requires the
// fixtures to go red. Keep it free of references to anything outside it.
//
// hr_tick_stall_status(now(), 2, 30), restated: STALLED when the tick is in
// SHADOW mode and EVERY one of the last `hours` whole-hour buckets had >= 1
// posted fire with rostered >= 1 AND fewer than `minRowsPerHour` hr_tick_shadow
// rows. A bucket with no rostered fire means nobody was there to tick: the
// function reads that as ok; this says NO VERDICT, because it is not a green.
// buckets[0] is the hour ending now, as the function orders them.
function tickStallVerdict(buckets, mode, rule) {
  const win = buckets.slice(0, rule.hours);
  if (win.length < rule.hours) return { verdict: 'NO VERDICT', why: `under ${rule.hours} h of history` };
  if (mode === 'armed' || mode === 'off') {
    return { verdict: 'NOT JUDGED', why: `tick is ${mode}; shadow rows are zero by design` };
  }
  // PARTIAL (some channels armed): hr_tick_stall_status judges the UNARMED
  // channels with a sentinel character (2026-10-06-world-tick-arm-guards.sql
  // C2); that needs hr_tick_admit, which this read-only role cannot execute,
  // so the restatement declines rather than guess.
  if (mode === 'partial') {
    return { verdict: 'NOT JUDGED', why: 'tick is partially armed; read hr_tick_stall_status() (per unarmed channel)' };
  }
  if (win.some((b) => Number(b.rost_fires) < 1)) {
    return { verdict: 'NO VERDICT', why: 'an hour with nothing rostered' };
  }
  const stalled = win.every((b) => Number(b.shadow_rows) < rule.minRowsPerHour);
  return stalled
    ? { verdict: 'STALL', why: `${rule.hours} h rostered with < ${rule.minRowsPerHour} shadow rows/h` }
    : { verdict: 'OK', why: `an hour with >= ${rule.minRowsPerHour} shadow rows` };
}
// Per UTC day (of each bucket's start): shadow rows/h over the buckets that day
// holds, and how many 2 h windows STARTING in that day the rule calls STALL
// (history is judged as if in shadow mode throughout: the mode is not logged).
function tickDayRollup(buckets, rule, verdict) {
  const days = new Map();
  buckets.forEach((b, i) => {
    const d = days.get(b.day) || { day: b.day, hours: 0, shadow_rows: 0, rost_fires: 0, refused: 0,
      stall_windows: 0, judged_windows: 0 };
    d.hours += 1;
    d.shadow_rows += Number(b.shadow_rows);
    d.rost_fires += Number(b.rost_fires);
    d.refused += Number(b.refused);
    const v = verdict(buckets.slice(i, i + rule.hours), 'shadow', rule).verdict;
    if (v === 'STALL' || v === 'OK') d.judged_windows += 1;
    if (v === 'STALL') d.stall_windows += 1;
    days.set(b.day, d);
  });
  return [...days.values()].map((d) => ({ ...d,
    rows_per_h: d.hours ? Math.round((d.shadow_rows / d.hours) * 10) / 10 : 0,
    stall: d.stall_windows > 0 ? 'STALL' : (d.judged_windows ? 'ok' : 'no verdict') }));
}
// ARMED channels (2026-10-07-world-tick-armed-cap.sql, Security F2):
// hr_tick_stall_status's armed judge, restated for ONE armed channel. `rows` is
// that channel's whole-hour buckets ENDING NOW, newest first, each carrying
// rost_fires, tick_rows (player_ledger rows of the channel's kind with
// meta.src = 'tick'), shadow_rows (hr_tick_shadow rows of the channel; they
// carry the arm boundary) and the channel's sentinel counts: `sentinels`
// (owned, on the channel 2 h+, raw mark < 24 h) and `online_sentinels` (those
// with a NON-tick ledger row of the channel's kind in the judged window, i.e.
// a client accrue settle — the player was ONLINE and the tick rightly stood
// aside; 2026-10-08-world-tick-party-fences.sql F2b, mirrored here per the
// Security review's G1). STALL when an OFFLINE sentinel exists and EVERY hour
// had >= 1 rostered fire and fewer than minRowsPerHour tick + shadow windows.
// No offline sentinel / no roster = NO VERDICT.
function armedStallVerdict(rows, rule) {
  const win = rows.slice(0, rule.hours);
  if (win.length < rule.hours) return { verdict: 'NO VERDICT', why: `under ${rule.hours} h of history` };
  const offline = Number(win[0].sentinels) - Number(win[0].online_sentinels);
  if (!(offline >= 1)) {
    return { verdict: 'NO VERDICT', why: Number(win[0].sentinels) >= 1
      ? 'every armed sentinel is ONLINE (client settles in the window): not a stall (F2b)'
      : 'no armed sentinel (owned, on the channel 2 h+, raw mark < 24 h)' };
  }
  if (win.some((r) => Number(r.rost_fires) < 1)) return { verdict: 'NO VERDICT', why: 'an hour with nothing rostered' };
  const stalled = win.every((r) => Number(r.tick_rows) + Number(r.shadow_rows) < rule.minRowsPerHour);
  return stalled
    ? { verdict: 'STALL', why: `${rule.hours} h rostered with < ${rule.minRowsPerHour} tick+shadow windows/h` }
    : { verdict: 'OK', why: `an hour with >= ${rule.minRowsPerHour} tick+shadow windows` };
}
// PARTY HUNTS NOBODY CAN TICK (Security PD1, 2026-10-08-world-tick-party-reaper.sql):
// a live party_hunt whose mark is > 24 h behind is never rostered, so its
// members are refused every accrue. The operator check is `stale` = 0; the
// reaper (hr-party-reap, 10 min) should hold it there. ANY stale hunt is an
// ALARM: before the reaper applies it is PD1 itself, after it the cron is down.
function partyStaleVerdict(row) {
  const stale = Number(row?.stale);
  if (!Number.isFinite(stale)) return { verdict: 'UNREAD', why: 'no count' };
  if (stale > 0) return { verdict: 'ALARM', why: `${stale} live party hunt(s) > 24 h behind: members refused every accrue (PD1; is hr-party-reap running?)` };
  return { verdict: 'OK', why: 'no live party hunt > 24 h behind' };
}
// ── STALL RULE END ───────────────────────────────────────────────────────────
const STALL_RULE = { hours: 2, minRowsPerHour: 30 };
const STALL_RULE_TEXT = `STALL = tick in SHADOW mode and EACH of the last ${STALL_RULE.hours} whole hours ending now had`
  + ` >= 1 posted fire with rostered >= 1 AND < ${STALL_RULE.minRowsPerHour} hr_tick_shadow rows`
  + ' (hr_tick_stall_status(now(), 2, 30), restated; an hour with no rostered fire = NO VERDICT).';

// ── REALTIME SLOT HEALTH (2026-10-07, REL_M5_FLIP W2/W3) ─────────────────────
// ONE call, no restatement: public.hr_slot_health() is SELECT-only and holds the
// rule (0 pgoutput slots, a slot not 'reserved', safe WAL < 384 MB, frame rows
// not in exactly one publication). 2026-10-07-frame-emit-online-only.sql grants
// it to supabase_read_only_user, which is who this endpoint runs as. Before that
// file is applied the call fails and the line says so.
const SLOT_HEALTH = 'select public.hr_slot_health() as h';

// ── PARTY HUNTS > 24 h BEHIND (Security PD1) ────────────────────────────────
// The interim operator check, verbatim, plus what the reaper ended in 7 days.
const PARTY_STALE = `
select (select count(*) from public.party_hunt
         where ended_at is null and accrued_to < now() - interval '24 hours') as stale,
       (select count(*) from public.party_hunt
         where stopped_by = 'stale_hunt' and ended_at >= now() - interval '7 days') as reaped_7d`;

// ── ARMED CHANNELS (2026-10-07-world-tick-armed-cap.sql, Security F2) ───────
// hr_tick_stall_status() is owner-only (42501 for this endpoint), so its armed
// judge is restated here over the same three tables, per armed channel, for the
// last 2 whole hours ending now, newest first (i = 0). The sentinel is the
// function's, minus hr_partied (not executable here): a partied character is
// combat, and only matters once combat is armed. Its F2b half (online = not a
// sentinel) is counted here as `online_sentinels` and subtracted in
// armedStallVerdict() above, so the rule — not this query — is what the
// --selftest mutants bite. An artisan window journals as 'craft'.
const ARMED_TICK = `
with c as (
  select distinct a as ch
    from public.hr_tick_config cfg cross join lateral unnest(cfg.armed_channels) a
   where cfg.id and a = any (cfg.channels)),
h as (
  select g as i, now() - make_interval(hours => g + 1) as lo, now() - make_interval(hours => g) as hi
    from generate_series(0, 1) g)
select c.ch as channel, h.i,
       (select count(*) from public.hr_tick_cron_log l
         where l.at >= h.lo and l.at < h.hi and l.outcome = 'posted' and l.rostered >= 1) as rost_fires,
       (select count(*) from public.player_ledger pl
         where pl.at >= h.lo and pl.at < h.hi
           and pl.kind = (case c.ch when 'artisan' then 'craft' else c.ch end)
           and pl.meta ->> 'src' = 'tick') as tick_rows,
       (select count(*) from public.hr_tick_shadow s
         where s.at >= h.lo and s.at < h.hi and s.channel = c.ch) as shadow_rows,
       (select count(*) from public.hr_tick_ownership o
          join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
         where o.owned and o.channel = c.ch and ps.active_kind = c.ch
           and ps.active_since <= now() - interval '2 hours'
           and ps.accrued_to > now() - interval '24 hours') as sentinels,
       (select count(*) from public.hr_tick_ownership o
          join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
         where o.owned and o.channel = c.ch and ps.active_kind = c.ch
           and ps.active_since <= now() - interval '2 hours'
           and ps.accrued_to > now() - interval '24 hours'
           and exists (select 1 from public.player_ledger pl
                        where pl.user_id = o.user_id and pl.slot = o.slot
                          and pl.at >= now() - interval '2 hours' and pl.at < now()
                          and pl.kind = (case c.ch when 'artisan' then 'craft' else c.ch end)
                          and pl.meta ->> 'src' is distinct from 'tick')) as online_sentinels
  from c cross join h
 order by c.ch, h.i`;
const armedLines = (rows) => {
  const by = new Map();
  for (const r of rows) by.set(r.channel, [...(by.get(r.channel) || []), r]);
  if (!by.size) return ['armed channels: none (nothing armed; the shadow rule above is the whole verdict)'];
  return [...by].map(([ch, rs]) => {
    const v = armedStallVerdict(rs, STALL_RULE);
    return `armed ${ch}: ${v.verdict} — ${v.why} | tick rows ${rs.map((r) => r.tick_rows).join('/')}, `
      + `shadow rows ${rs.map((r) => r.shadow_rows).join('/')}, rostered fires ${rs.map((r) => r.rost_fires).join('/')}`;
  });
};

const refusalsMode = process.argv.includes('--refusals');
const worldTickMode = process.argv.includes('--world-tick');
const selftestMode = process.argv.includes('--selftest');
const chosen = refusalsMode ? REFUSALS : worldTickMode ? WORLD_TICK : QUERY;

// The secret guard is the contract (CLAUDE.md s2): EVERY query this tool can
// send is checked, not just the one the flag selected. A second query added
// later must not be able to ride in unchecked behind the first one's clearance.
const selectOnly = (sql) => !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i.test(sql);
for (const sql of [QUERY, REFUSALS, REFUSAL_TABS, WORLD_TICK, WORLD_TICK_MODE, SLOT_HEALTH, ARMED_TICK, PARTY_STALE]) {
  if (!selectOnly(sql)) {
    console.error('vitals: refusing — query is not SELECT-only'); process.exitCode = 2; throw new Error('not select-only');
  }
}

const ask = async (sql, { soft = false } = {}) => {
  if (token === null) token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const res = await fetch(URL_Q, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`vitals: HTTP ${res.status}: ${body.slice(0, 400)}`);
    if (!soft) process.exitCode = 1;
    throw new Error('query failed');
  }
  return JSON.parse(body);
};

const readTickMode = async () => {
  try { return (await ask(WORLD_TICK_MODE, { soft: true }))[0]?.mode || 'unread'; } catch { return 'unread'; }
};
const verdictLine = (v, mode) => `${v.verdict} — ${v.why}${mode === 'unread' ? ' (mode unread; judged as if shadow)' : ''}`;

function printWorldTick(buckets, mode) {
  const hc = ['from_utc', 'fires', 'rost_fires', 'rostered', 'shadow_rows', 'settled', 'shadowed', 'skipped',
    'refused', 'below_flush', 'timed_out', 'non_tick', 'harvested', 'reasons'];
  const hw = { from_utc: 11, fires: 5, rost_fires: 10, rostered: 8, shadow_rows: 11, settled: 7, shadowed: 8,
    skipped: 7, refused: 7, below_flush: 11, timed_out: 9, non_tick: 8, harvested: 9 };
  const line = (row) => hc.map((c) => (hw[c] ? String(row[c] ?? '').padStart(hw[c]) : `  ${String(row[c] ?? '')}`)).join(' ');
  console.log('world tick — hr_tick_cron_log per whole hour ENDING NOW (from_utc = the hour\'s start), last 24 h.');
  console.log('fires = log rows; rost_fires = posted fires with rostered >= 1 (the rule\'s input); rostered = max;');
  console.log('shadow_rows = hr_tick_shadow rows in the hour. settled..non_tick are sums of detail.edge, which');
  console.log('lags one fire and exists only since 2026-09-28 05:34 UTC (harvested = fires carrying it).');
  console.log('reasons = the harvest\'s per-fire top_reason (below_flush excluded by design), summed top_n, top 3;');
  console.log('harvest_error:<sqlstate> = fires whose harvest threw.\n');
  console.log(hc.map((c) => (hw[c] ? c.padStart(hw[c]) : `  ${c}`)).join(' '));
  for (const row of buckets.slice(0, 24)) console.log(line(row));

  const days = tickDayRollup(buckets, STALL_RULE, tickStallVerdict);
  const dc = ['day', 'hours', 'shadow_rows', 'rows_per_h', 'rost_fires', 'refused', 'stall_windows', 'stall'];
  const dw = { day: 10, hours: 5, shadow_rows: 11, rows_per_h: 10, rost_fires: 10, refused: 8, stall_windows: 13 };
  console.log('\nshadow journal per UTC day (of each hour\'s start), 7 days. rows_per_h = shadow_rows / hours;');
  console.log('stall_windows = 2 h windows starting that day the rule calls STALL (judged as if in shadow mode');
  console.log('throughout — the mode is not logged per hour). The partial first and last days hold fewer hours.');
  console.log(dc.map((c) => (dw[c] ? c.padStart(dw[c]) : `  ${c}`)).join(' '));
  for (const d of days) console.log(dc.map((c) => (dw[c] ? String(d[c]).padStart(dw[c]) : `  ${d[c]}`)).join(' '));

  console.log(`\nrule: ${STALL_RULE_TEXT}`);
  console.log(`mode: ${mode}`);
  console.log(`STALL: ${verdictLine(tickStallVerdict(buckets, mode, STALL_RULE), mode)}`);
}

// ── --selftest ───────────────────────────────────────────────────────────────
// Fixture rows shaped exactly like WORLD_TICK's output go through the rule and
// the day roll-up, lifted from THIS file's text; then each mutant re-lifts the
// text with one line broken and must turn at least one assertion red. The first
// lift is unmutated: it is the positive control that the lift itself works.
async function selftest() {
  const { readFileSync: rf } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const SRC = rf(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const a = SRC.indexOf('// ── STALL RULE BEGIN');
  const b = SRC.indexOf('// ── STALL RULE END');
  if (a < 0 || b < 0) { console.error('vitals --selftest: the STALL RULE markers are gone'); return 2; }
  const RULE_SRC = SRC.slice(a, b);
  const lift = (src) => new Function(`${src}\nreturn { tickStallVerdict, tickDayRollup, armedStallVerdict, partyStaleVerdict };`)();

  const hour = (o) => ({ day: '2026-09-28', fires: 360, rost_fires: 360, rostered: 1, shadow_rows: 0, refused: 0, ...o });
  const checks = (L) => {
    const V = (bs, mode = 'shadow') => L.tickStallVerdict(bs, mode, STALL_RULE).verdict;
    const out = [];
    const t = (id, got, want) => out.push({ id, ok: got === want, got, want });
    t('S1 2 h rostered 1, 0 rows/h -> STALL', V([hour({}), hour({})]), 'STALL');
    t('S2 29 + 29 rows/h -> STALL', V([hour({ shadow_rows: 29 }), hour({ shadow_rows: 29 })]), 'STALL');
    t('S3 31 + 31 rows/h -> OK', V([hour({ shadow_rows: 31 }), hour({ shadow_rows: 31 })]), 'OK');
    t('S4 30 + 30 rows/h -> OK (the threshold is < 30)', V([hour({ shadow_rows: 30 }), hour({ shadow_rows: 30 })]), 'OK');
    t('S5 29 then 31 -> OK (one healthy hour of two)', V([hour({ shadow_rows: 29 }), hour({ shadow_rows: 31 })]), 'OK');
    t('S6 rostered 0 both hours -> NO VERDICT',
      V([hour({ rost_fires: 0, rostered: 0 }), hour({ rost_fires: 0, rostered: 0 })]), 'NO VERDICT');
    t('S7 rostered 0 in one hour -> NO VERDICT, never STALL',
      V([hour({ rost_fires: 0, rostered: 0 }), hour({})]), 'NO VERDICT');
    t('S8 only the last 2 h count: a healthy 3rd hour back does not clear a stall',
      V([hour({}), hour({}), hour({ shadow_rows: 500 })]), 'STALL');
    t('S9 a stalled last hour after a healthy one -> OK', V([hour({}), hour({ shadow_rows: 40 })]), 'OK');
    t('S10 armed -> NOT JUDGED', V([hour({}), hour({})], 'armed'), 'NOT JUDGED');
    t('S10b partially armed -> NOT JUDGED, never a false STALL', V([hour({}), hour({})], 'partial'), 'NOT JUDGED');
    t('S11 one hour of history -> NO VERDICT', V([hour({})]), 'NO VERDICT');
    // A day of 24 hours: healthy (40/h) except a 3-hour stall at i = 5..7 -> 2 stalled windows.
    const day = Array.from({ length: 24 }, (_, i) => hour({ shadow_rows: i >= 5 && i <= 7 ? 0 : 40, refused: i >= 5 && i <= 7 ? 360 : 0 }));
    const r = L.tickDayRollup(day, STALL_RULE, L.tickStallVerdict)[0] || {};
    t('D1 a 3 h stall inside a day = 2 stalled windows', r.stall_windows, 2);
    t('D2 that day reads STALL', r.stall, 'STALL');
    t('D3 rows/h = 840 / 24 = 35', r.rows_per_h, 35);
    t('D4 refused sums across the day', r.refused, 1080);
    const healthy = L.tickDayRollup(Array.from({ length: 24 }, () => hour({ shadow_rows: 31 })), STALL_RULE, L.tickStallVerdict)[0] || {};
    t('D5 a day at 31 rows/h reads ok', healthy.stall, 'ok');
    const quiet = L.tickDayRollup(Array.from({ length: 24 }, () => hour({ rost_fires: 0, rostered: 0 })), STALL_RULE, L.tickStallVerdict)[0] || {};
    t('D6 a day with nothing rostered reads no verdict', quiet.stall, 'no verdict');
    // The ARMED judge: rows newest first, one channel.
    const arm = (o) => ({ channel: 'gather', rost_fires: 360, tick_rows: 0, shadow_rows: 0, sentinels: 1, online_sentinels: 0, ...o });
    const AV = (rs) => L.armedStallVerdict(rs, STALL_RULE).verdict;
    t('A1 armed, 2 h rostered, 0 windows, sentinel -> STALL', AV([arm({}), arm({})]), 'STALL');
    t('A2 40 tick rows/h -> OK', AV([arm({ tick_rows: 40 }), arm({ tick_rows: 40 })]), 'OK');
    t('A3 the arm boundary: 20 tick + 19 shadow, then 39 shadow -> OK',
      AV([arm({ tick_rows: 20, shadow_rows: 19 }), arm({ shadow_rows: 39 })]), 'OK');
    t('A4 29 + 29 tick rows/h -> STALL', AV([arm({ tick_rows: 29 }), arm({ tick_rows: 29 })]), 'STALL');
    t('A5 no sentinel -> NO VERDICT, never STALL', AV([arm({ sentinels: 0 }), arm({ sentinels: 0 })]), 'NO VERDICT');
    // G1 (Security, party-fences review): F2b mirrored. 10-05 QA gather slot 2
    // online: 250 client accrue rows and 0 tick windows for ~2 h.
    t('A9 the only sentinel is ONLINE, 0 windows -> NO VERDICT, never STALL',
      AV([arm({ online_sentinels: 1 }), arm({ online_sentinels: 1 })]), 'NO VERDICT');
    t('A10 one online + one offline sentinel, 0 windows -> STALL (the offline one is still judged)',
      AV([arm({ sentinels: 2, online_sentinels: 1 }), arm({ sentinels: 2, online_sentinels: 1 })]), 'STALL');
    t('A6 an hour with nothing rostered -> NO VERDICT', AV([arm({ rost_fires: 0 }), arm({})]), 'NO VERDICT');
    t('A7 one hour of history -> NO VERDICT', AV([arm({})]), 'NO VERDICT');
    t('A8 a stalled newest hour after a healthy one -> OK', AV([arm({}), arm({ tick_rows: 40 })]), 'OK');
    // Security PD1: the operator check `stale = 0`.
    const PV = (row) => L.partyStaleVerdict(row).verdict;
    t('P1 no live party hunt > 24 h behind -> OK', PV({ stale: 0, reaped_7d: 3 }), 'OK');
    t('P2 one stale party hunt -> ALARM', PV({ stale: 1, reaped_7d: 0 }), 'ALARM');
    t('P3 the count as the endpoint returns it (a string) -> ALARM', PV({ stale: '2' }), 'ALARM');
    t('P4 no count -> UNREAD, never OK', PV({}), 'UNREAD');
    return out;
  };

  console.log('\nvitals --selftest: the world-tick STALL rule and day roll-up, on fixture rows (no DB, no token)');
  let real;
  try { real = checks(lift(RULE_SRC)); } catch (e) { console.log(`  ✗ the unmutated lift threw: ${e.message}`); return 1; }
  for (const c of real) console.log(`  ${c.ok ? '✓' : '✗'} ${c.id}${c.ok ? '' : ` — got ${c.got}, want ${c.want}`}`);
  const realRed = real.filter((c) => !c.ok).length;

  const MUTANTS = [
    { name: 'threshold300', find: 'Number(b.shadow_rows) < rule.minRowsPerHour', repl: 'Number(b.shadow_rows) < 300' },
    { name: 'thresholdInclusive', find: 'Number(b.shadow_rows) < rule.minRowsPerHour', repl: 'Number(b.shadow_rows) <= rule.minRowsPerHour' },
    { name: 'oneHourIsEnough', find: 'buckets.slice(0, rule.hours)', repl: 'buckets.slice(0, 1)' },
    { name: 'wholeHistory', find: 'buckets.slice(0, rule.hours)', repl: 'buckets.slice(0)' },
    { name: 'rosterIgnored', find: 'win.some((b) => Number(b.rost_fires) < 1)', repl: 'false' },
    { name: 'anyHourStalls', find: 'win.every((b) => Number(b.shadow_rows)', repl: 'win.some((b) => Number(b.shadow_rows)' },
    { name: 'armedJudged', find: "mode === 'armed' || mode === 'off'", repl: "mode === 'off'" },
    { name: 'dayWindowOne', find: 'buckets.slice(i, i + rule.hours)', repl: 'buckets.slice(i, i + 1)' },
    { name: 'dayRowsPerFire', find: 'd.shadow_rows / d.hours', repl: 'd.shadow_rows / d.rost_fires' },
    { name: 'armedTickOnly', find: 'Number(r.tick_rows) + Number(r.shadow_rows) < rule.minRowsPerHour',
      repl: 'Number(r.tick_rows) < rule.minRowsPerHour' },
    { name: 'armedSentinelIgnored', find: 'if (!(offline >= 1)) {', repl: 'if (false) {' },
    { name: 'armedOnlineIsSentinel', find: 'Number(win[0].sentinels) - Number(win[0].online_sentinels)',
      repl: 'Number(win[0].sentinels)' },
    { name: 'armedAnyOnlineUnjudges', find: 'Number(win[0].sentinels) - Number(win[0].online_sentinels)',
      repl: '(Number(win[0].online_sentinels) > 0 ? 0 : Number(win[0].sentinels))' },
    { name: 'armedRosterIgnored', find: "if (win.some((r) => Number(r.rost_fires) < 1)) return { verdict: 'NO VERDICT', why: 'an hour with nothing rostered' };",
      repl: '' },
    { name: 'armedAnyHourStalls', find: 'win.every((r) => Number(r.tick_rows)', repl: 'win.some((r) => Number(r.tick_rows)' },
    { name: 'partyStaleTolerated', find: 'if (stale > 0) return', repl: 'if (stale > 1) return' },
    { name: 'partyStaleUnreadIsOk', find: "if (!Number.isFinite(stale)) return { verdict: 'UNREAD', why: 'no count' };", repl: '' },
  ];
  let missed = 0;
  for (const m of MUTANTS) {
    if (!RULE_SRC.includes(m.find)) { console.error(`vitals --selftest: mutant ${m.name} cannot be planted — its anchor is gone`); return 2; }
    let red;
    try { red = checks(lift(RULE_SRC.replace(m.find, m.repl))).filter((c) => !c.ok).map((c) => c.id.split(' ')[0]); } catch (e) { red = [`threw: ${e.message}`]; }
    if (red.length) console.log(`  CAUGHT ${m.name} by ${red.join(', ')}`);
    else { missed += 1; console.log(`  MISSED ${m.name}: every assertion stayed green`); }
  }
  if (realRed || missed) {
    console.log(`\nvitals --selftest: RED — ${realRed} assertion(s) red on the real rule, ${missed} mutant(s) survived`);
    return 1;
  }
  console.log(`\nvitals --selftest: green — ${real.length} assertions on the real rule, all ${MUTANTS.length} mutants caught.`);
  return 0;
}

if (selftestMode) {
  process.exitCode = await selftest();
} else if (worldTickMode) {
  const buckets = await ask(WORLD_TICK);
  printWorldTick(buckets, await readTickMode());
  try { for (const l of armedLines(await ask(ARMED_TICK, { soft: true }))) console.log(l); }
  catch (e) { console.log(`armed channels: UNREAD — ${e.message}`); process.exitCode = 1; }
} else {
  const rows = await ask(chosen);


  if (refusalsMode) {
    const rc = ['day', 'code', 'severity', 'n', 'characters', 'verbs', 'whys'];
    const w = { day: 10, code: 22, severity: 9, n: 6, characters: 11, verbs: 0, whys: 0 };
    console.log('refusals — hr_rejections, the last two UTC DAY BUCKETS (not a rolling 24h: the table');
    console.log('is a per-(user, slot, day, code) aggregate). rate_limited is sampled; the rest exact.');
    console.log('verbs = which gesture was refused (server-supplied for the buff family, bad_zone and');
    console.log('forbidden_field). whys = the code broken down by its reason, and it SUMS TO n: on');
    console.log('buff_at_max, segment_budget is the 9th-segment cost fuse and (none) is the 60-minute');
    console.log('duration cap. A dash means the code carries no why. Needs');
    console.log('2026-09-13-rejections-verb-map-2.sql applied; before that whys reads "-" everywhere.\n');
    console.log(rc.map((c) => (w[c] ? String(c).padStart(w[c]) : `  ${c}`)).join(' '));
    for (const row of rows) {
      console.log(rc.map((c) => (w[c] ? String(row[c] ?? '').padStart(w[c]) : `  ${String(row[c] ?? '')}`)).join(' '));
    }
    if (!rows.length) console.log('  (no refusals recorded in the last two day buckets)');

    // THE DENY-LIST CODES, PER TAB. See the header on REFUSAL_TABS: summed, these
    // two codes read as a server refusing everybody; per (user, slot) they read as
    // the handful of browser windows they actually are.
    const tabs = await ask(REFUSAL_TABS);
    const tc = ['day', 'code', 'severity', 'who', 'slot', 'n', 'last_utc', 'verb', 'whys'];
    const tw = { day: 10, code: 16, severity: 9, who: 10, slot: 5, n: 7, last_utc: 9 };
    console.log('\ndeny-list refusals PER (user, slot) — one tab prints as one tab. forbidden_field is');
    console.log('a whole-patch refusal on an AUTHORITY key; retired_field is a key STRIPPED from an');
    console.log('otherwise honest patch (2026-09-23-client-state-retired-fields.sql; no rows before it');
    console.log('is applied). whys names WHICH key, which is what says which build the tab is running.');
    console.log(tc.map((c) => (tw[c] ? String(c).padStart(tw[c]) : `  ${c}`)).join(' '));
    for (const row of tabs) {
      console.log(tc.map((c) => (tw[c] ? String(row[c] ?? '').padStart(tw[c]) : `  ${String(row[c] ?? '')}`)).join(' '));
    }
    if (!tabs.length) console.log('  (no deny-list refusals in the last two day buckets)');
    // NO process.exit() HERE. fetch() leaves a keep-alive socket on the loop, and
    // tearing the process down under it aborts libuv on Windows ("Assertion
    // failed: !(handle->flags & UV_HANDLE_CLOSING)") with exit 127 AFTER the
    // correct output has already been printed - i.e. a read-only ops tool that
    // looks broken to anyone who checks its exit code, and looks fine to anyone
    // who only reads the table. Fall off the end instead.
  } else {
    const cols = ['day','plants','waters','harvests','fights','deaths','gathers','crafts','workers','buys','rooms','claims','pets_xp','pet_xp','listings','sales','refused','users'];
    console.log(cols.map((c) => String(c).padStart(c === 'day' ? 10 : 8)).join(' '));
    for (const row of rows) console.log(cols.map((c) => String(row[c] ?? '').padStart(c === 'day' ? 10 : 8)).join(' '));
    // pets_xp joins the zero-watch: it is the column S-PX-2 exists for, and a
    // feature at zero for two days is a P1 by definition (CLAUDE.md §3.4). pet_xp
    // is the running total and does not fall back to zero, so it is not watched.
    const zeroTwoDays = ['plants','fights','gathers','buys','claims','pets_xp'].filter((c) => rows.slice(0, 2).every((row) => Number(row[c]) === 0));
    if (rows.length >= 2 && zeroTwoDays.length) console.log(`\nP1 by definition — zero for two days: ${zeroTwoDays.join(', ')}`);
  }

  // THE ONE-LINE WORLD-TICK SUMMARY rides every default run, because the
  // 2026-09-26/27 stall sat 21.9 h behind green vitals: nobody runs a flag they
  // do not already suspect. --world-tick has the hours behind it.
  if (!refusalsMode) {
    try {
      const buckets = await ask(WORLD_TICK);
      const mode = await readTickMode();
      const [h0 = {}, h1 = {}] = buckets;
      console.log(`\nworld tick, last 2 h (newest first): shadow rows ${h0.shadow_rows}/${h1.shadow_rows}, `
        + `rostered fires ${h0.rost_fires}/${h1.rost_fires}, edge refused ${h0.refused}/${h1.refused}, `
        + `top reason ${h0.reasons} | STALL rule: ${verdictLine(tickStallVerdict(buckets, mode, STALL_RULE), mode)}`
        + ' | --world-tick for the hours');
    } catch (e) {
      console.log(`\nworld tick: UNREAD — ${e.message} (the exit code says so)`);
    }
    // The ARMED judge (Security F2): once a channel arms, the shadow rule above
    // stops seeing it, and this line is the only gather-stall read a person sees.
    try {
      for (const l of armedLines(await ask(ARMED_TICK))) console.log(l);
    } catch (e) {
      console.log(`armed channels: UNREAD — ${e.message} (the exit code says so)`);
    }
    // Security PD1: a party hunt nobody can tick. Must read 0.
    try {
      const row = (await ask(PARTY_STALE))[0] || {};
      const v = partyStaleVerdict(row);
      console.log(`party hunts > 24 h behind: ${row.stale} (want 0) — ${v.verdict}: ${v.why} | reaped (stale_hunt) last 7 d: ${row.reaped_7d}`);
      if (v.verdict !== 'OK') process.exitCode = 1;
    } catch (e) {
      console.log(`party hunts > 24 h behind: UNREAD — ${e.message} (the exit code says so)`);
    }
    // The cron job hr-slot-health files maintenance_alerts on the same rule;
    // this line is the read a person sees at session start.
    try {
      const h = (await ask(SLOT_HEALTH, { soft: true }))[0]?.h || {};
      const codes = (h.alarms || []).map((a) => `${a.code}(${a.severity})`).join(' ');
      console.log(`realtime slots: ${h.ok ? 'OK' : `ALARM ${codes}`} — pgoutput ${h.pgoutput_slots}/${h.slots} slot(s), `
        + `min safe ${h.min_safe_mb ?? '?'} MB (line 384)`);
    } catch (e) {
      console.log(`realtime slots: UNREAD — hr_slot_health() not callable (${e.message}); `
        + 'is 2026-10-07-frame-emit-online-only.sql applied?');
    }
  }
}
