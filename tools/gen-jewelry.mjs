#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-jewelry.mjs — GENERATE CRAFTED JEWELRY'S SERVER CATALOGUE (src/data/jewelry.js; Tyler 2026-11-05).
//
// src/data/jewelry.js is the single source of the Hallmark step (which Fine piece becomes which Hallmarked one, with which gem,
// for how much gold, at which Crafting level), the step's day limit and the market's per-row ceiling for each graded row.
// Postgres needs them to price a Hallmark by itself (hr_hallmark, 2027-03-14-jewelry-hallmark.sql: a client never names a price
// it isn't quoted) and to let a Hallmarked ring list above 100x its book. Emitted as three tables, each a full delete + insert.
// The roll's odds are NOT here: the bench rolls in the engine (src/core/artisan.js rollJewel), which imports the data itself.
//
//   Regenerate:  node tools/gen-jewelry.mjs
//   Verify:      node tools/gen-jewelry.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-jewelry.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): an offer whose pieces aren't a Fine row and the Hallmarked row holding its perk and one more,
// a gem that isn't its tier's, a fee or level that isn't its tier's, a day limit outside 1..1000, a ceiling under 100x book.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, JEWEL_CEILINGS, JEWEL_TIERS, JEWELRY_ITEMS } from '../src/data/jewelry.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a new number moves OUT_FILE to a forward file, like every generated catalogue. */
export const OUT_FILE = '2027-03-14-jewelry-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const ID = /^[a-z0-9_]{1,48}$/;

/** What is wrong with the rows, as sentences. */
export function problemsOf(offers, limit, ceilings, items = ITEMS) {
  const out = [];
  const seen = new Set();
  for (const o of offers) {
    const from = items[o.from], to = items[o.to], t = JEWEL_TIERS[o.tier];
    const key = o.from + '>' + o.to;
    if (seen.has(key)) out.push(`${key}: listed twice`);
    seen.add(key);
    if (![o.from, o.to, o.gem, o.perk].every((x) => ID.test(String(x)))) { out.push(`${key}: an id is not a catalogue id`); continue; }
    if (!from || from.jewelGrade !== 'fine') out.push(`${key}: ${o.from} is not a Fine row`);
    if (!to || to.jewelGrade !== 'hallmarked') out.push(`${key}: ${o.to} is not a Hallmarked row`);
    if (from && to) {
      const want = Object.keys(from.jewelPerks || {}).concat([o.perk]).sort().join('+');
      if (from.jewelBase !== to.jewelBase || Object.keys(to.jewelPerks || {}).sort().join('+') !== want) out.push(`${key}: the Hallmarked row is not the Fine row's perk and ${o.perk}`);
      if (from.tier !== o.tier || to.tier !== o.tier) out.push(`${key}: tier ${o.tier} is not the pieces' own`);
    }
    if (!t) { out.push(`${key}: tier ${o.tier} has no row in JEWEL_TIERS`); continue; }
    if (o.gem !== t.gem || !items[o.gem]) out.push(`${key}: the gem ${o.gem} is not tier ${o.tier}'s (${t.gem})`);
    if (o.gold !== t.hallmark.gold || !(o.gold >= 1)) out.push(`${key}: ${o.gold} g is not tier ${o.tier}'s fee (${t.hallmark.gold})`);
    if (o.level !== t.hallmark.level || !(o.level >= 1 && o.level <= 99)) out.push(`${key}: Crafting ${o.level} is not tier ${o.tier}'s (${t.hallmark.level})`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) out.push(`the day limit ${limit} is not 1..1000`);
  for (const [id, c] of Object.entries(ceilings)) {
    const it = items[id];
    if (!it || !it.jewelGrade) out.push(`ceiling ${id}: not a graded jewelry row`);
    else if (!Number.isSafeInteger(c) || c < 100 * it.v || c > 1000000000) out.push(`ceiling ${id}: ${c} is under 100x its book (${it.v}) or over 1,000,000,000`);
  }
  return out;
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

export function build(offers = HALLMARK_OFFERS, limit = HALLMARK_DAY_LIMIT, ceilings = JEWEL_CEILINGS) {
  const problems = problemsOf(offers, limit, ceilings);
  if (problems.length) throw new Error('gen-jewelry: ' + problems.join('; '));
  const rows = [...offers].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1))
    .map((o) => `  (${lit(o.from)}, ${lit(o.to)}, ${lit(o.perk)}, ${lit(o.gem)}, ${o.gold}, ${lit(o.skill)}, ${o.level}, ${o.tier})`);
  const cel = Object.keys(ceilings).sort().map((id) => `  (${lit(id)}, ${ceilings[id]})`);
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — CRAFTED JEWELRY'S SERVER CATALOGUE: THE HALLMARK STEP AND THE GRADED ROWS' MARKET CEILINGS.
-- Generated by tools/gen-jewelry.mjs from src/data/jewelry.js. Any hand edit FAILS \`node tools/gen-jewelry.mjs --check\`.
--   hr_hallmark_offers   one row per (Fine piece, second perk): the Hallmarked row it makes, the gem it takes, the gold, the Crafting level.
--   hr_hallmark_rule     the most Hallmark steps one account takes in a UTC day (a blast-radius bound, not a pace).
--   hr_market_ceilings   a graded row's own ceiling, which hr_market_items reads above 100x book (2027-03-14-jewelry-hallmark.sql).
-- A row moves no value: hr_hallmark re-quotes from it under the hero's lock and answers quote_changed if the gold moved.
-- RLS on, no policy, no client grant. No begin/commit. ON THE EA SECURITY LIST (a money surface).
-- APPLY ORDER: after 2027-03-14-jewelry-items-catalogue.generated.sql (hr_items holds the rows); before 2027-03-14-jewelry-hallmark.sql.
-- REVERSIBLE: drop the three tables with the verb and the view's join that read them.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_hallmark_offers (
  from_item text not null check (from_item ~ '^[a-z0-9_]{1,48}$'),
  to_item   text not null check (to_item ~ '^[a-z0-9_]{1,48}$'),
  perk      text not null check (perk ~ '^[a-z_]{1,24}$'),
  gem       text not null check (gem ~ '^[a-z0-9_]{1,48}$'),
  gold      bigint not null check (gold between 1 and 1000000000),
  skill     text not null,
  level     int not null check (level between 1 and 99),
  tier      int not null check (tier between 1 and 7),
  primary key (from_item, to_item),
  check (from_item <> to_item)
);
alter table public.hr_hallmark_offers enable row level security;
revoke all on table public.hr_hallmark_offers from public, anon, authenticated, service_role;
comment on table public.hr_hallmark_offers is
  '${OUT_FILE}: the Hallmark step (src/data/jewelry.js HALLMARK_OFFERS): a Fine piece + its tier''s gem + gold makes the Hallmarked row. Read only by SECURITY DEFINER bodies.';

create table if not exists public.hr_hallmark_rule (
  id        boolean primary key default true check (id),
  day_limit int not null check (day_limit between 1 and 1000)
);
alter table public.hr_hallmark_rule enable row level security;
revoke all on table public.hr_hallmark_rule from public, anon, authenticated, service_role;

create table if not exists public.hr_market_ceilings (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,48}$'),
  ceiling bigint not null check (ceiling between 1 and 1000000000)
);
alter table public.hr_market_ceilings enable row level security;
revoke all on table public.hr_market_ceilings from public, anon, authenticated, service_role;

delete from public.hr_hallmark_offers;
insert into public.hr_hallmark_offers (from_item, to_item, perk, gem, gold, skill, level, tier) values
${rows.join(',\n')};

delete from public.hr_hallmark_rule;
insert into public.hr_hallmark_rule (id, day_limit) values (true, ${limit});

delete from public.hr_market_ceilings;
insert into public.hr_market_ceilings (item_id, ceiling) values
${cel.join(',\n')};

-- §4 SELF-CHECK: every id is a catalogue item, the skill a skill, the counts the generator's, and no client can read or write a table.
do $$
declare v text;
begin
  if (select count(*) from public.hr_hallmark_offers) <> ${offers.length} then raise exception 'jewelry-catalogue §4: hr_hallmark_offers is not the generator''s ${offers.length} rows'; end if;
  if (select count(*) from public.hr_market_ceilings) <> ${cel.length} then raise exception 'jewelry-catalogue §4: hr_market_ceilings is not the generator''s ${cel.length} rows'; end if;
  select o.from_item || '>' || o.to_item into v from public.hr_hallmark_offers o
   where not exists (select 1 from public.hr_items i where i.item_id = o.from_item)
      or not exists (select 1 from public.hr_items i where i.item_id = o.to_item)
      or not exists (select 1 from public.hr_items i where i.item_id = o.gem)
      or not exists (select 1 from public.hr_skills s where s.skill_id = o.skill) limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: % names an item or skill the catalogue does not hold', v; end if;
  select c.item_id into v from public.hr_market_ceilings c
   where not exists (select 1 from public.hr_items i where i.item_id = c.item_id and i.tradeable and c.ceiling >= 100 * i.value) limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: % is not a tradeable item or its ceiling is under 100x its book', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_hallmark_offers', 'hr_hallmark_rule', 'hr_market_ceilings')) then
    raise exception 'jewelry-catalogue §4: a policy opens a table to a client'; end if;
  select t into v from unnest(array['public.hr_hallmark_offers', 'public.hr_hallmark_rule', 'public.hr_market_ceilings']) t
   where has_table_privilege('authenticated', t, 'select,insert,update,delete') or has_table_privilege('anon', t, 'select,insert,update,delete') limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: a client role holds a grant on %', v; end if;
  raise notice 'jewelry-catalogue OK: ${offers.length} Hallmark offers, a day limit of ${limit}, ${cel.length} ceilings';
end $$;
`;
}

function selftest() {
  const clean = problemsOf(HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, JEWEL_CEILINGS);
  if (clean.length) { console.error('gen-jewelry --selftest: the tree is not clean: ' + clean.join('; ')); process.exit(2); }
  const o0 = HALLMARK_OFFERS[0];
  const one = (patch) => HALLMARK_OFFERS.map((o, i) => (i === 0 ? Object.assign({}, o, patch) : o));
  const plainId = Object.values(JEWELRY_ITEMS)[0].jewelBase;
  const cases = [
    ['a Hallmark that starts from a plain piece', one({ from: plainId }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark that makes a Fine piece', one({ to: o0.from === Object.keys(JEWELRY_ITEMS)[1] ? Object.keys(JEWELRY_ITEMS)[0] : Object.keys(JEWELRY_ITEMS)[1] }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark that drops the Fine perk', one({ to: HALLMARK_OFFERS.find((o) => o.from !== o0.from && !o.to.includes(Object.keys(JEWELRY_ITEMS[o0.from].jewelPerks)[0])).to }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark with another tier\'s gem', one({ gem: 'ruby' }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark under its fee', one({ gold: o0.gold - 1 }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark at the wrong level', one({ level: o0.level - 1 }), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a Hallmark listed twice', HALLMARK_OFFERS.concat([o0]), HALLMARK_DAY_LIMIT, JEWEL_CEILINGS],
    ['a day limit of zero', HALLMARK_OFFERS, 0, JEWEL_CEILINGS],
    ['a ceiling under 100x book', HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, Object.assign({}, JEWEL_CEILINGS, { [o0.to]: 100 })],
    ['a ceiling for a plain piece', HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, Object.assign({}, JEWEL_CEILINGS, { [plainId]: 100000 })],
  ];
  let bad = 0;
  for (const [why, offers, limit, ceilings] of cases) {
    if (problemsOf(offers, limit, ceilings).length) console.log('  ✓ ' + why + ': refused');
    else { console.error('  ✗ ' + why + ': NOT refused'); bad++; }
  }
  if (bad) { console.error(`gen-jewelry --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-jewelry --selftest: every refusal bites');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-jewelry --check: ${OUT_FILE} is stale; run node tools/gen-jewelry.mjs`); process.exit(1); }
    console.log('gen-jewelry --check: OK');
  } else {
    await writeFile(OUT, build());
    console.log('wrote ' + OUT);
  }
}
