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
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';

const QUERY = `
select (l.at at time zone 'UTC')::date as day,
       count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_plant')                       as plants,
       count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_water')                       as waters,
       count(*) filter (where l.kind = 'farm'   and l.intent = 'farm_harvest')                     as harvests,
       count(*) filter (where l.kind = 'combat' and l.intent in ('xp_credit','accrue'))            as fights,
       count(*) filter (where l.kind = 'combat' and l.intent = 'death')                            as deaths,
       count(*) filter (where l.kind = 'gather')                                                   as gathers,
       count(*) filter (where l.kind = 'craft')                                                    as crafts,
       count(*) filter (where l.kind = 'worker')                                                   as workers,
       count(*) filter (where l.kind = 'shop'   and l.intent like 'shop_buy:%')                    as buys,
       count(*) filter (where l.kind = 'shop'   and l.intent like 'unlock_buy:room.%')             as rooms,
       count(*) filter (where l.kind in ('quest','daily'))                                         as claims,
       count(distinct l.user_id)                                                                   as users
from public.player_ledger l
where l.at >= now() - interval '7 days'
group by 1 order by 1 desc`;

if (/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i.test(QUERY)) {
  console.error('vitals: refusing — query is not SELECT-only'); process.exit(2);
}

const r = await fetch(URL_Q, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
});
const text = await r.text();
if (!r.ok) { console.error(`vitals: HTTP ${r.status}: ${text.slice(0, 400)}`); process.exit(1); }
const rows = JSON.parse(text);
const cols = ['day','plants','waters','harvests','fights','deaths','gathers','crafts','workers','buys','rooms','claims','users'];
console.log(cols.map((c) => String(c).padStart(c === 'day' ? 10 : 8)).join(' '));
for (const row of rows) console.log(cols.map((c) => String(row[c] ?? '').padStart(c === 'day' ? 10 : 8)).join(' '));
const zeroTwoDays = ['plants','fights','gathers','buys','claims'].filter((c) => rows.slice(0, 2).every((row) => Number(row[c]) === 0));
if (rows.length >= 2 && zeroTwoDays.length) console.log(`\nP1 by definition — zero for two days: ${zeroTwoDays.join(', ')}`);
