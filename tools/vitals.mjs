// ============================================================================
// tools/vitals.mjs — the §3.4 dead-feature vitals, read-only, from production.
//
//   node tools/vitals.mjs            # last 7 days, per day
//   node tools/vitals.mjs --refusals # why calls were REFUSED, by code and verb
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

const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
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
rf as (select day, sum(n) as refused from public.hr_rejections where day >= ((now() at time zone 'UTC')::date - 8) group by 1)
select d.day, coalesce(plants,0) plants, coalesce(waters,0) waters, coalesce(harvests,0) harvests, coalesce(fights,0) fights, coalesce(deaths,0) deaths,
       coalesce(gathers,0) gathers, coalesce(crafts,0) crafts, coalesce(workers,0) workers, coalesce(buys,0) buys, coalesce(rooms,0) rooms, coalesce(claims,0) claims,
       coalesce(listings,0) listings, coalesce(sales,0) sales, coalesce(refused,0) refused, coalesce(users,0) users
from days d left join led using (day) left join mk using (day) left join ms using (day) left join rf using (day)
order by d.day desc`;

// WHY a REFUSAL BREAKDOWN is a separate query and not more columns: the vitals
// table answers "is this feature alive"; this answers "what is the server
// telling players NO about, and on which verb". Paione's 2026-09-11 afternoon —
// 4-8 taps to equip a staff, stop-combat snapping back — is one row of this
// output and was invisible in the other one.
const REFUSALS = `
with x as (
  -- `verbs` is read through to_jsonb(h) rather than named directly so that this
  -- tool runs BEFORE 2026-09-12-hr-rejections-journal.sql is applied as well as
  -- after: a missing column yields NULL instead of a parse error, and the
  -- breakdown shows '-'. A read-only ops tool must never be the thing that has
  -- to be deployed in lockstep with a migration.
  select h.day, h.code, h.severity, h.n,
         coalesce((to_jsonb(h) ->> 'verbs')::jsonb, '{}'::jsonb) as verbs
    from public.hr_rejections h
   where h.day >= ((now() at time zone 'UTC')::date - 1)),
v as (
  select x.day, x.code, e.key as verb, sum(e.value::bigint) as vn
    from x, lateral jsonb_each_text(x.verbs) e group by 1, 2, 3)
select x.day, x.code, min(x.severity) as severity, sum(x.n) as n,
       count(*) as characters,
       coalesce((select string_agg(v.verb || '=' || v.vn::text, ' ' order by v.vn desc, v.verb)
                   from v where v.day = x.day and v.code = x.code), '-') as verbs
  from x group by x.day, x.code
 order by x.day desc, sum(x.n) desc, x.code`;

const refusalsMode = process.argv.includes('--refusals');
const chosen = refusalsMode ? REFUSALS : QUERY;

if (/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i.test(chosen)) {
  console.error('vitals: refusing — query is not SELECT-only'); process.exitCode = 2; throw new Error('not select-only');
}

const r = await fetch(URL_Q, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: chosen }),
});
const text = await r.text();
if (!r.ok) { console.error(`vitals: HTTP ${r.status}: ${text.slice(0, 400)}`); process.exitCode = 1; throw new Error('query failed'); }
const rows = JSON.parse(text);

if (refusalsMode) {
  const rc = ['day', 'code', 'severity', 'n', 'characters', 'verbs'];
  const w = { day: 10, code: 22, severity: 9, n: 6, characters: 11, verbs: 0 };
  console.log('refusals — hr_rejections, the last two UTC DAY BUCKETS (not a rolling 24h: the table');
  console.log('is a per-(user, slot, day, code) aggregate). rate_limited is sampled; the rest exact.\n');
  console.log(rc.map((c) => (w[c] ? String(c).padStart(w[c]) : `  ${c}`)).join(' '));
  for (const row of rows) {
    console.log(rc.map((c) => (w[c] ? String(row[c] ?? '').padStart(w[c]) : `  ${String(row[c] ?? '')}`)).join(' '));
  }
  if (!rows.length) console.log('  (no refusals recorded in the last two day buckets)');
  process.exit(0);
}
const cols = ['day','plants','waters','harvests','fights','deaths','gathers','crafts','workers','buys','rooms','claims','listings','sales','refused','users'];
console.log(cols.map((c) => String(c).padStart(c === 'day' ? 10 : 8)).join(' '));
for (const row of rows) console.log(cols.map((c) => String(row[c] ?? '').padStart(c === 'day' ? 10 : 8)).join(' '));
const zeroTwoDays = ['plants','fights','gathers','buys','claims'].filter((c) => rows.slice(0, 2).every((row) => Number(row[c]) === 0));
if (rows.length >= 2 && zeroTwoDays.length) console.log(`\nP1 by definition — zero for two days: ${zeroTwoDays.join(', ')}`);
