#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-jewelry.mjs — GENERATE CRAFTED JEWELRY'S SERVER CATALOGUE (src/data/jewelry.js; Tyler 2026-11-05, 2026-11-18).
//
// src/data/jewelry.js is the single source of the Hallmark step (which Fine piece becomes which Hallmarked one, with which gem,
// for how much gold, at which level of the piece's own skill), the jewel reforge (which Hallmarked piece becomes the next tier's,
// with which metal, gem, fee difference and level), the steps' day limit and the market's per-row ceiling for each graded row.
// Postgres needs them to price both steps by itself (hr_hallmark, 2027-03-14-jewelry-hallmark.sql; hr_jewel_reforge,
// 2027-05-09-jewel-reforge.sql: a client never names a price it isn't quoted) and to let a Hallmarked ring list above 100x its
// book. Emitted as four tables, each a full delete + insert. The roll's odds are NOT here: the bench rolls in the engine
// (src/core/artisan.js rollJewel), which imports the data itself.
//
//   Regenerate:  node tools/gen-jewelry.mjs
//   Verify:      node tools/gen-jewelry.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-jewelry.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): an offer whose pieces aren't a Fine row and the Hallmarked row holding its perk and one more,
// a gem that isn't its tier's, a fee or level that isn't its tier's, a skill that isn't the piece's own bench; a reforge that isn't
// a Hallmarked piece into the Hallmarked piece of the tier above with the same perks, at that tier's metal, bars, gem, level and the
// fee difference; a day limit outside 1..1000, a ceiling under 100x book.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, JEWEL_CEILINGS, JEWEL_TIERS, JEWELRY_ITEMS, REFORGE_OFFERS, jewelSkillOf } from '../src/data/jewelry.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a new number moves OUT_FILE to a forward file, like every generated catalogue.
   THE PHASE 2 SAMPLE (lane/d-jewelry-sample, 2026-11-18): 2027-03-14-jewelry-catalogue is APPLIED history. Every Hallmark offer names the
   piece's own bench (Smithing for every jewel: Tyler 2026-11-18), the Seam Jasper Band and the Fang Studs bring their offers and ceilings,
   and the jewel reforge's table is new: the same full delete + insert of each table. */
/* LUCK (lane/d-luck-build, 2026-11-20): 2027-05-09-jewelry-sample-catalogue is APPLIED history; the Lucky Fine rows' Hallmark offers and the eight
   Lucky rows' market ceilings land in this forward file, the same full delete + insert. */
export const OUT_FILE = '1011-luck-jewelry-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const ID = /^[a-z0-9_]{1,48}$/;

/** What is wrong with the rows, as sentences. */
export function problemsOf(offers, limit, ceilings, items = ITEMS, reforges = REFORGE_OFFERS) {
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
    if (o.skill !== jewelSkillOf(o.from)) out.push(`${key}: ${o.skill} is not the piece's own bench (${jewelSkillOf(o.from)})`);
    if (!t) { out.push(`${key}: tier ${o.tier} has no row in JEWEL_TIERS`); continue; }
    if (o.gem !== t.gem || !items[o.gem]) out.push(`${key}: the gem ${o.gem} is not tier ${o.tier}'s (${t.gem})`);
    if (o.gold !== t.hallmark.gold || !(o.gold >= 1)) out.push(`${key}: ${o.gold} g is not tier ${o.tier}'s fee (${t.hallmark.gold})`);
    if (o.level !== t.hallmark.level || !(o.level >= 1 && o.level <= 99)) out.push(`${key}: level ${o.level} is not tier ${o.tier}'s (${t.hallmark.level})`);
  }
  const seenR = new Set();
  for (const r of reforges) {
    const from = items[r.from], to = items[r.to], t = JEWEL_TIERS[r.tier], was = from && JEWEL_TIERS[from.tier];
    const key = 'reforge ' + r.from + '>' + r.to;
    if (seenR.has(r.from)) out.push(`${key}: a piece reforges one way only`);
    seenR.add(r.from);
    if (![r.from, r.to, r.metal, r.gem].every((x) => ID.test(String(x)))) { out.push(`${key}: an id is not a catalogue id`); continue; }
    if (!from || from.jewelGrade !== 'hallmarked') out.push(`${key}: ${r.from} is not a Hallmarked row`);
    if (!to || to.jewelGrade !== 'hallmarked') out.push(`${key}: ${r.to} is not a Hallmarked row`);
    if (from && to) {
      if (to.slot !== from.slot || to.tier !== from.tier + 1 || r.tier !== to.tier) out.push(`${key}: not the same slot one tier up`);
      if (Object.keys(from.jewelPerks || {}).sort().join('+') !== Object.keys(to.jewelPerks || {}).sort().join('+')) out.push(`${key}: the perks are not kept`);
    }
    if (r.skill !== jewelSkillOf(r.to)) out.push(`${key}: ${r.skill} is not the new piece's bench (${jewelSkillOf(r.to)})`);
    if (!t || !t.reforge || !was) { out.push(`${key}: tier ${r.tier} has no reforge row`); continue; }
    if (r.metal !== t.metal || !items[r.metal] || r.bars !== t.reforge.bars || !(r.bars >= 1 && r.bars <= 1000)) out.push(`${key}: ${r.bars} ${r.metal} is not tier ${r.tier}'s (${t.reforge.bars} ${t.metal})`);
    if (r.gem !== t.gem || !items[r.gem]) out.push(`${key}: the gem ${r.gem} is not tier ${r.tier}'s (${t.gem})`);
    if (r.gold !== t.hallmark.gold - was.hallmark.gold || !(r.gold >= 1)) out.push(`${key}: ${r.gold} g is not the fee difference (${t.hallmark.gold - was.hallmark.gold})`);
    if (r.level !== t.hallmark.level || !(r.level >= 1 && r.level <= 99)) out.push(`${key}: level ${r.level} is not tier ${r.tier}'s Hallmark level (${t.hallmark.level})`);
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

export function build(offers = HALLMARK_OFFERS, limit = HALLMARK_DAY_LIMIT, ceilings = JEWEL_CEILINGS, reforges = REFORGE_OFFERS) {
  const problems = problemsOf(offers, limit, ceilings, ITEMS, reforges);
  if (problems.length) throw new Error('gen-jewelry: ' + problems.join('; '));
  if (!reforges.length) throw new Error('gen-jewelry: no reforge offer (the table would be empty)');
  const rows = [...offers].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1))
    .map((o) => `  (${lit(o.from)}, ${lit(o.to)}, ${lit(o.perk)}, ${lit(o.gem)}, ${o.gold}, ${lit(o.skill)}, ${o.level}, ${o.tier})`);
  const ref = [...reforges].sort((a, b) => (a.from < b.from ? -1 : 1))
    .map((r) => `  (${lit(r.from)}, ${lit(r.to)}, ${lit(r.metal)}, ${r.bars}, ${lit(r.gem)}, ${r.gold}, ${lit(r.skill)}, ${r.level}, ${r.tier})`);
  const cel = Object.keys(ceilings).sort().map((id) => `  (${lit(id)}, ${ceilings[id]})`);
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — CRAFTED JEWELRY'S SERVER CATALOGUE: THE HALLMARK STEP, THE JEWEL REFORGE AND THE GRADED ROWS' MARKET CEILINGS.
-- Generated by tools/gen-jewelry.mjs from src/data/jewelry.js. Any hand edit FAILS \`node tools/gen-jewelry.mjs --check\`.
--   hr_hallmark_offers      one row per (Fine piece, second perk): the Hallmarked row it makes, the gem it takes, the gold, the level in the
--                           piece's own bench (Smithing for every jewel: Tyler 2026-11-18).
--   hr_jewel_reforge_offers one row per Hallmarked piece with a tier above it: the Hallmarked row of that tier with the SAME perks, the new
--                           tier's metal and bars, its gem, the fee difference, the new tier's Hallmark level in the new piece's bench.
--   hr_hallmark_rule        the most of EACH step one account takes in a UTC day (a blast-radius bound, not a pace).
--   hr_market_ceilings      a graded row's own ceiling, which hr_market_items reads above 100x book (2027-03-14-jewelry-hallmark.sql).
-- NEW IN THIS FILE (lane/d-luck-build, systems-engineer, 2026-11-20; itemization plan §15): it carries 2027-05-09-jewelry-sample-catalogue
-- (applied) whole. The two Lucky Fine rings' Hallmark offers (a second perk beside Lucky, at their tier's gem, fee and level) and the eight
-- Lucky rows' market ceilings are new (the Lucky ring trades like all jewelry: Tyler 2026-11-20). Nothing else moves.
-- A row moves no value: each verb re-quotes from it under the hero's lock and answers quote_changed if the gold moved.
-- RLS on, no policy, no client grant. No begin/commit. ON THE EA SECURITY LIST (a money surface).
-- APPLY ORDER: after 1009-luck-items-catalogue.generated.sql (hr_items holds the rows).
-- REVERSIBLE: drop the tables with the verbs and the view's join that read them.
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

create table if not exists public.hr_jewel_reforge_offers (
  from_item text primary key check (from_item ~ '^[a-z0-9_]{1,48}$'),
  to_item   text not null check (to_item ~ '^[a-z0-9_]{1,48}$'),
  metal     text not null check (metal ~ '^[a-z0-9_]{1,48}$'),
  bars      int not null check (bars between 1 and 1000),
  gem       text not null check (gem ~ '^[a-z0-9_]{1,48}$'),
  gold      bigint not null check (gold between 1 and 1000000000),
  skill     text not null,
  level     int not null check (level between 1 and 99),
  tier      int not null check (tier between 2 and 7),
  check (from_item <> to_item)
);
alter table public.hr_jewel_reforge_offers enable row level security;
revoke all on table public.hr_jewel_reforge_offers from public, anon, authenticated, service_role;
comment on table public.hr_jewel_reforge_offers is
  '${OUT_FILE}: the jewel reforge (src/data/jewelry.js REFORGE_OFFERS): a Hallmarked piece + the new tier''s metal, gem and the fee difference makes the next tier''s Hallmarked row with the same perks. Read only by SECURITY DEFINER bodies.';

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

delete from public.hr_jewel_reforge_offers;
insert into public.hr_jewel_reforge_offers (from_item, to_item, metal, bars, gem, gold, skill, level, tier) values
${ref.join(',\n')};

delete from public.hr_hallmark_rule;
insert into public.hr_hallmark_rule (id, day_limit) values (true, ${limit});

delete from public.hr_market_ceilings;
insert into public.hr_market_ceilings (item_id, ceiling) values
${cel.join(',\n')};

-- §4 SELF-CHECK: every id is a catalogue item, the skill a skill, the counts the generator's, a reforge keeps its perks, and no client can
-- read or write a table.
do $$
declare v text;
begin
  if (select count(*) from public.hr_hallmark_offers) <> ${offers.length} then raise exception 'jewelry-catalogue §4: hr_hallmark_offers is not the generator''s ${offers.length} rows'; end if;
  if (select count(*) from public.hr_jewel_reforge_offers) <> ${reforges.length} then raise exception 'jewelry-catalogue §4: hr_jewel_reforge_offers is not the generator''s ${reforges.length} rows'; end if;
  if (select count(*) from public.hr_market_ceilings) <> ${cel.length} then raise exception 'jewelry-catalogue §4: hr_market_ceilings is not the generator''s ${cel.length} rows'; end if;
  select o.from_item || '>' || o.to_item into v from public.hr_hallmark_offers o
   where not exists (select 1 from public.hr_items i where i.item_id = o.from_item)
      or not exists (select 1 from public.hr_items i where i.item_id = o.to_item)
      or not exists (select 1 from public.hr_items i where i.item_id = o.gem)
      or not exists (select 1 from public.hr_skills s where s.skill_id = o.skill) limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: % names an item or skill the catalogue does not hold', v; end if;
  select r.from_item || '>' || r.to_item into v from public.hr_jewel_reforge_offers r
   where not exists (select 1 from public.hr_items i where i.item_id = r.from_item)
      or not exists (select 1 from public.hr_items i where i.item_id = r.to_item)
      or not exists (select 1 from public.hr_items i where i.item_id = r.metal)
      or not exists (select 1 from public.hr_items i where i.item_id = r.gem)
      or not exists (select 1 from public.hr_skills s where s.skill_id = r.skill)
      or r.gold <> (select h.gold from public.hr_hallmark_offers h where h.to_item = r.to_item limit 1)
                   - (select h.gold from public.hr_hallmark_offers h where h.to_item = r.from_item limit 1) limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: reforge % names an item or skill the catalogue does not hold, or its gold is not the fee difference', v; end if;
  select c.item_id into v from public.hr_market_ceilings c
   where not exists (select 1 from public.hr_items i where i.item_id = c.item_id and i.tradeable and c.ceiling >= 100 * i.value) limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: % is not a tradeable item or its ceiling is under 100x its book', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_hallmark_offers', 'hr_jewel_reforge_offers', 'hr_hallmark_rule', 'hr_market_ceilings')) then
    raise exception 'jewelry-catalogue §4: a policy opens a table to a client'; end if;
  select t into v from unnest(array['public.hr_hallmark_offers', 'public.hr_jewel_reforge_offers', 'public.hr_hallmark_rule', 'public.hr_market_ceilings']) t
   where has_table_privilege('authenticated', t, 'select,insert,update,delete') or has_table_privilege('anon', t, 'select,insert,update,delete') limit 1;
  if v is not null then raise exception 'jewelry-catalogue §4: a client role holds a grant on %', v; end if;
  raise notice 'jewelry-catalogue OK: ${offers.length} Hallmark offers, ${reforges.length} reforges, a day limit of ${limit}, ${cel.length} ceilings';
end $$;
`;
}

function selftest() {
  const clean = problemsOf(HALLMARK_OFFERS, HALLMARK_DAY_LIMIT, JEWEL_CEILINGS);
  if (clean.length) { console.error('gen-jewelry --selftest: the tree is not clean: ' + clean.join('; ')); process.exit(2); }
  const o0 = HALLMARK_OFFERS[0], r0 = REFORGE_OFFERS[0];
  const one = (patch) => HALLMARK_OFFERS.map((o, i) => (i === 0 ? Object.assign({}, o, patch) : o));
  const oneR = (patch) => REFORGE_OFFERS.map((r, i) => (i === 0 ? Object.assign({}, r, patch) : r));
  const plainId = Object.values(JEWELRY_ITEMS)[0].jewelBase;
  const L = HALLMARK_DAY_LIMIT, C = JEWEL_CEILINGS, H = HALLMARK_OFFERS;
  /* a Hallmarked row of the new piece with OTHER perks than r0's */
  const otherTo = REFORGE_OFFERS.find((r) => r.to !== r0.to).to;
  const cases = [
    ['a Hallmark that starts from a plain piece', one({ from: plainId }), L, C],
    ['a Hallmark that makes a Fine piece', one({ to: o0.from === Object.keys(JEWELRY_ITEMS)[1] ? Object.keys(JEWELRY_ITEMS)[0] : Object.keys(JEWELRY_ITEMS)[1] }), L, C],
    ['a Hallmark that drops the Fine perk', one({ to: HALLMARK_OFFERS.find((o) => o.from !== o0.from && !o.to.includes(Object.keys(JEWELRY_ITEMS[o0.from].jewelPerks)[0])).to }), L, C],
    ['a Hallmark with another tier\'s gem', one({ gem: 'ruby' }), L, C],
    ['a Hallmark under its fee', one({ gold: o0.gold - 1 }), L, C],
    ['a Hallmark at the wrong level', one({ level: o0.level - 1 }), L, C],
    ['a Hallmark at another bench', one({ skill: o0.skill === 'smithing' ? 'crafting' : 'smithing' }), L, C],
    ['a Hallmark listed twice', HALLMARK_OFFERS.concat([o0]), L, C],
    ['a day limit of zero', HALLMARK_OFFERS, 0, C],
    ['a ceiling under 100x book', HALLMARK_OFFERS, L, Object.assign({}, C, { [o0.to]: 100 })],
    ['a ceiling for a plain piece', HALLMARK_OFFERS, L, Object.assign({}, C, { [plainId]: 100000 })],
    ['a reforge that swaps a perk', H, L, C, oneR({ to: otherTo })],
    ['a reforge that starts from a Fine piece', H, L, C, oneR({ from: o0.from })],
    ['a reforge that stays on its tier', H, L, C, oneR({ to: o0.to })],
    ['a reforge charging the whole new fee', H, L, C, oneR({ gold: JEWEL_TIERS[r0.tier].hallmark.gold })],
    ['a reforge a coin under the fee difference', H, L, C, oneR({ gold: r0.gold - 1 })],
    ['a reforge with the old tier\'s metal', H, L, C, oneR({ metal: JEWEL_TIERS[r0.tier - 1].metal })],
    ['a reforge with one bar fewer', H, L, C, oneR({ bars: r0.bars - 1 })],
    ['a reforge with the old tier\'s gem', H, L, C, oneR({ gem: JEWEL_TIERS[r0.tier - 1].gem })],
    ['a reforge at the craft level, not the Hallmark level', H, L, C, oneR({ level: r0.level - 15 })],
    ['a reforge at another bench', H, L, C, oneR({ skill: r0.skill === 'smithing' ? 'crafting' : 'smithing' })],
    ['a piece that reforges two ways', H, L, C, REFORGE_OFFERS.concat([Object.assign({}, r0, { to: otherTo })])],
  ];
  let bad = 0;
  for (const [why, offers, limit, ceilings, reforges] of cases) {
    if (problemsOf(offers, limit, ceilings, ITEMS, reforges || REFORGE_OFFERS).length) console.log('  ✓ ' + why + ': refused');
    else { console.error('  ✗ ' + why + ': NOT refused'); bad++; }
  }
  if (bad) { console.error(`gen-jewelry --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log(`gen-jewelry --selftest: every refusal bites (${cases.length})`);
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
