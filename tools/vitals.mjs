// ============================================================================
// tools/vitals.mjs — the §3.4 dead-feature vitals, read-only, from production.
//
//   node tools/vitals.mjs            # last 7 days, per day
//
// Runs ONE fixed SELECT over public.player_ledger through the same management
// endpoint tools/apply-migration.mjs uses (token from ~/.supabase-token, read
// as file bytes, never printed, never argv). The query text is SELECT-only and
// the tool refuses to send anything that is not: this is a read, never a write.
// A feature at zero for two days is a P1 by definition (CLAUDE.md §3.4).
// Vocabulary measured from production 2026-09-07: ledger kinds farm/combat/gather/
// craft/worker/shop/quest/daily with intents farm_plant|farm_water|farm_harvest,
// xp_credit|accrue|death, shop_buy:*, unlock_buy:room.*; the market lives in its
// own tables (market_listings.posted_at, market_sales.at); player_intents is the
// intent journal — as of 2026-09-07 it holds only accepted rows (refused = 0 is
// "not journalled", not "nothing refused"; journalling refusals is a queued lane).
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
rf as (select (at at time zone 'UTC')::date as day, count(*) as refused from public.player_intents where at >= now() - interval '8 days' and coalesce(result->>'ok','true') <> 'true' group by 1)
select d.day, coalesce(plants,0) plants, coalesce(waters,0) waters, coalesce(harvests,0) harvests, coalesce(fights,0) fights, coalesce(deaths,0) deaths,
       coalesce(gathers,0) gathers, coalesce(crafts,0) crafts, coalesce(workers,0) workers, coalesce(buys,0) buys, coalesce(rooms,0) rooms, coalesce(claims,0) claims,
       coalesce(listings,0) listings, coalesce(sales,0) sales, coalesce(refused,0) refused, coalesce(users,0) users
from days d left join led using (day) left join mk using (day) left join ms using (day) left join rf using (day)
order by d.day desc`;

if (/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i.test(QUERY)) {
  console.error('vitals: refusing — query is not SELECT-only'); process.exitCode = 2; throw new Error('not select-only');
}

const r = await fetch(URL_Q, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
});
const text = await r.text();
if (!r.ok) { console.error(`vitals: HTTP ${r.status}: ${text.slice(0, 400)}`); process.exitCode = 1; throw new Error('query failed'); }
const rows = JSON.parse(text);
const cols = ['day','plants','waters','harvests','fights','deaths','gathers','crafts','workers','buys','rooms','claims','listings','sales','refused','users'];
console.log(cols.map((c) => String(c).padStart(c === 'day' ? 10 : 8)).join(' '));
for (const row of rows) console.log(cols.map((c) => String(row[c] ?? '').padStart(c === 'day' ? 10 : 8)).join(' '));
const zeroTwoDays = ['plants','fights','gathers','buys','claims'].filter((c) => rows.slice(0, 2).every((row) => Number(row[c]) === 0));
if (rows.length >= 2 && zeroTwoDays.length) console.log(`\nP1 by definition — zero for two days: ${zeroTwoDays.join(', ')}`);
