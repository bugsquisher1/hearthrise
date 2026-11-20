#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-luck.mjs — GENERATE LUCK'S SERVER CATALOGUE (src/data/luck.js, src/data/jewelry.js LUCKY_OFFERS; itemization plan §15).
//
// src/data/luck.js is the single source of the Luck bar's curve, the salvage feed, the Bestiary's stages and the Lucky ring. Postgres
// needs them to pay and price every Luck movement by itself (NNNN-luck.sql: Dispatch's salvage and use arms, the Lucky job, the section,
// hr_magic_find_of): a client never names an amount, a rank or a price. Emitted as five tables, each a full delete + insert:
//   hr_luck_rules     one row: the curve's step and far stop, the Trophy curve, the per-press clamp, the item, the switch, the day limit
//   hr_luck_salvage   item -> the rivets one salvaged piece pays (worn gear that a drop row names, by tier and its lowest band; a
//                     Very Rare piece and any piece no drop row names pay nothing and are absent)
//   hr_luck_stages    stage -> the account kills of one creature it takes, the Luck it pays once
//   hr_luck_ring_pct  a Lucky ring row -> the Magic Find it gives its wearer
//   hr_lucky_offers   a plain ring -> its Fine Lucky row, the rivets, the fee, the bench and its level
//
//   Regenerate:  node tools/gen-luck.mjs
//   Verify:      node tools/gen-luck.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-luck.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a salvage row whose item is not worn gear or pays under 1 or over the unique ceiling; the luck
// item salvaging, or itself bound-less or priced; a stage list that isn't ascending in kills or pays nothing; a ring row whose percent
// isn't its tier's LUCKY_PERK_PCT; an offer that isn't a plain ring into its Fine Lucky row at its tier's rivets, fee and level.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { LUCK_RULES, LUCK_ITEM, LUCK_SWITCH, LUCK_STAGES, LUCKY_PERK_PCT, LUCKY_RIVET_STEP, LUCKY_DAY_LIMIT, SALVAGE_RIVETS } from '../src/data/luck.js';
import { LUCKY_OFFERS, JEWEL_TIERS, JEWELRY_ITEMS } from '../src/data/jewelry.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { LOOT_BANDS } from '../src/data/loot-bands.js';
import { bandOf } from '../src/core/drops.js';
import { salvageRivetsOf } from '../src/core/luck.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a new number moves OUT_FILE to a forward file, like every generated catalogue. */
export const OUT_FILE = '1005-luck-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);
const ID = /^[a-z0-9_]{1,48}$/;

/** Each worn-gear item a drop row names -> the rivets one salvaged piece pays (its tier, its LOWEST band; any Very Rare row: none). */
export function salvageRows(monsters = MONSTERS, items = ITEMS) {
  const bands = new Map();
  for (const m of Object.values(monsters)) {
    for (const d of Array.isArray(m && m.drops) ? m.drops : []) {
      if (!d || typeof d.id !== 'string') continue;
      const it = items[d.id];
      if (!it || !SALVAGE_RIVETS.types.includes(it.type)) continue;
      const set = bands.get(d.id) || new Set();
      set.add(bandOf(d));
      bands.set(d.id, set);
    }
  }
  const out = {};
  for (const [id, set] of [...bands.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if ([...set].some((b) => SALVAGE_RIVETS.never.includes(b))) continue;
    const low = [...set].sort((a, b) => LOOT_BANDS.indexOf(a) - LOOT_BANDS.indexOf(b))[0];
    const n = salvageRivetsOf(items[id].tier, low);
    if (n > 0) out[id] = n;
  }
  return out;
}

/** The Lucky ring rows -> percent (each Fine or Hallmarked row carrying Lucky). */
export function ringRows(jewels = JEWELRY_ITEMS) {
  const out = {};
  for (const id of Object.keys(jewels).sort()) {
    const p = jewels[id].jewelPerks;
    if (p && Object.prototype.hasOwnProperty.call(p, 'lucky')) out[id] = Math.floor(p.lucky / 10);
  }
  return out;
}

/** What is wrong with the rows, as sentences. */
export function problemsOf({ rules = LUCK_RULES, salvage = salvageRows(), stages = LUCK_STAGES, rings = ringRows(), offers = LUCKY_OFFERS, items = ITEMS, limit = LUCKY_DAY_LIMIT } = {}) {
  const out = [];
  const pos = (v, max) => Number.isSafeInteger(v) && v >= 1 && v <= max;
  if (!pos(rules.rankStep, 100000) || !pos(rules.rankMax, 1000) || !pos(rules.trophyMaxPm, 1000) || !pos(rules.trophyHalf, 1000) || !pos(rules.pressMax, 1000000)) {
    out.push('the rules are not whole numbers in range');
  }
  if (!['highest', 'average'].includes(rules.party)) out.push(`the party rule ${rules.party} is not highest or average`);
  if (!pos(limit, 1000)) out.push(`the day limit ${limit} is not 1..1000`);
  const rv = items[LUCK_ITEM];
  if (!rv) out.push(`${LUCK_ITEM} is not a catalogue item`);
  else if (rv.bop !== true || Number(rv.v) !== 0) out.push(`${LUCK_ITEM} must be bound (bop) and worth 0: no Luck crosses accounts or reaches the shop`);
  if (!ID.test(LUCK_SWITCH)) out.push('the switch id is not an id');
  const top = SALVAGE_RIVETS.uniquePerBand * 18;
  for (const [id, n] of Object.entries(salvage)) {
    if (!ID.test(id) || !items[id] || !SALVAGE_RIVETS.types.includes(items[id].type)) out.push(`salvage ${id}: not worn gear`);
    if (!pos(n, top)) out.push(`salvage ${id}: ${n} rivets is not 1..${top}`);
    if (id === LUCK_ITEM) out.push('the luck item salvages for itself');
  }
  if (!Object.keys(salvage).length) out.push('no gear salvages (the table would be empty)');
  let last = 0;
  stages.forEach((s, i) => {
    if (!pos(s.kills, 1e9) || s.kills <= last) out.push(`stage ${i + 1}: ${s.kills} kills is not above the last`);
    if (!pos(s.luck, 1e7)) out.push(`stage ${i + 1}: pays ${s.luck}`);
    last = s.kills;
  });
  for (const [id, pct] of Object.entries(rings)) {
    const it = items[id];
    if (!it || !it.jewelGrade) { out.push(`ring ${id}: not a graded jewelry row`); continue; }
    if (pct !== LUCKY_PERK_PCT[it.tier] || !(pct >= 1)) out.push(`ring ${id}: +${pct}% is not tier ${it.tier}'s (${LUCKY_PERK_PCT[it.tier]})`);
  }
  for (const o of offers) {
    const from = items[o.from], to = items[o.to], t = JEWEL_TIERS[o.tier];
    const key = 'lucky ' + o.from + '>' + o.to;
    if (!from || from.jewelGrade || from.slot !== 'ring') out.push(`${key}: ${o.from} is not a plain ring`);
    if (!to || to.jewelGrade !== 'fine' || to.jewelBase !== o.from || Object.keys(to.jewelPerks || {}).join() !== 'lucky') out.push(`${key}: ${o.to} is not its Fine Lucky row`);
    if (!t) { out.push(`${key}: tier ${o.tier} has no row`); continue; }
    if (o.rivet !== LUCK_ITEM || o.rivets !== LUCKY_RIVET_STEP * o.tier * o.tier) out.push(`${key}: ${o.rivets} ${o.rivet} is not ${LUCKY_RIVET_STEP} x tier^2 ${LUCK_ITEM}`);
    if (o.gold !== t.hallmark.gold || o.level !== t.hallmark.level) out.push(`${key}: the fee or the level is not tier ${o.tier}'s Hallmark`);
    if (o.switch !== LUCK_SWITCH) out.push(`${key}: not behind ${LUCK_SWITCH}`);
  }
  if (!offers.length) out.push('no Lucky job (the table would be empty)');
  return out;
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

export function build() {
  const salvage = salvageRows(), rings = ringRows();
  const problems = problemsOf({ salvage, rings });
  if (problems.length) throw new Error('gen-luck: ' + problems.join('; '));
  const sal = Object.keys(salvage).sort().map((id) => `  (${lit(id)}, ${salvage[id]})`);
  const stg = LUCK_STAGES.map((s, i) => `  (${i + 1}, ${s.kills}, ${s.luck})`);
  const rng = Object.keys(rings).sort().map((id) => `  (${lit(id)}, ${rings[id]})`);
  const off = [...LUCKY_OFFERS].sort((a, b) => (a.from < b.from ? -1 : 1))
    .map((o) => `  (${lit(o.from)}, ${lit(o.to)}, ${o.tier}, ${o.rivets}, ${o.gold}, ${lit(o.skill)}, ${o.level})`);
  const R = LUCK_RULES;
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — LUCK'S SERVER CATALOGUE: THE BAR, THE SALVAGE FEED, THE BESTIARY'S STAGES, THE LUCKY RING (itemization plan §15).
-- Generated by tools/gen-luck.mjs from src/data/luck.js and src/data/jewelry.js. Any hand edit FAILS \`node tools/gen-luck.mjs --check\`.
--   hr_luck_rules     the one row: rank n costs rank_step x n^2 Luck, the far stop rank_max, the Trophy curve (trophy_max_pm, trophy_half),
--                     the party's one number (party), the most one press moves (press_max), the item, the switch, the Lucky job's day limit
--   hr_luck_salvage   worn gear a drop row names -> the Lucky Rivets one salvaged piece pays (2 x tier; Rare x 5; a unique 50 x band)
--   hr_luck_stages    the Bestiary: account kills of one creature -> the Luck paid once
--   hr_luck_ring_pct  a Lucky ring row -> the Magic Find its wearer gets
--   hr_lucky_offers   the Lucky job: a plain ring + rivets + the tier's Hallmark fee -> its Fine Lucky row, at its bench and level
-- A row moves no value: NNNN-luck.sql's verbs read it under the hero's lock. RLS on, no policy, no client grant. No begin/commit.
-- ON THE EA SECURITY LIST (a ranked, account-wide surface and a gold sink).
-- APPLY ORDER: after the items catalogue that holds ${LUCK_ITEM} and the Lucky ring rows; before the luck migration that reads it.
-- REVERSIBLE: drop the tables with the verbs that read them.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_luck_rules (
  id              boolean primary key default true check (id),
  rank_step       bigint not null check (rank_step between 1 and 100000),
  rank_max        int    not null check (rank_max between 1 and 1000),
  trophy_max_pm   int    not null check (trophy_max_pm between 1 and 1000),
  trophy_half     int    not null check (trophy_half between 1 and 1000),
  party           text   not null check (party in ('highest', 'average')),
  press_max       bigint not null check (press_max between 1 and 1000000),
  item_id         text   not null check (item_id ~ '^[a-z0-9_]{1,48}$'),
  switch_id       text   not null check (switch_id ~ '^[a-z0-9_]{1,64}$'),
  lucky_day_limit int    not null check (lucky_day_limit between 1 and 1000)
);
alter table public.hr_luck_rules enable row level security;
revoke all on table public.hr_luck_rules from public, anon, authenticated, service_role;
comment on table public.hr_luck_rules is
  '${OUT_FILE}: Luck''s one rule row (src/data/luck.js LUCK_RULES). Read only by SECURITY DEFINER bodies.';

create table if not exists public.hr_luck_salvage (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,48}$'),
  rivets  int  not null check (rivets between 1 and 100000)
);
alter table public.hr_luck_salvage enable row level security;
revoke all on table public.hr_luck_salvage from public, anon, authenticated, service_role;
comment on table public.hr_luck_salvage is
  '${OUT_FILE}: the Lucky Rivets one salvaged piece pays (src/core/luck.js salvageRivetsOf over every drop row). An item absent here pays none.';

create table if not exists public.hr_luck_stages (
  stage int    primary key check (stage between 1 and 64),
  kills bigint not null check (kills between 1 and 1000000000),
  luck  bigint not null check (luck between 1 and 10000000)
);
alter table public.hr_luck_stages enable row level security;
revoke all on table public.hr_luck_stages from public, anon, authenticated, service_role;

create table if not exists public.hr_luck_ring_pct (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,48}$'),
  pct     int  not null check (pct between 1 and 100)
);
alter table public.hr_luck_ring_pct enable row level security;
revoke all on table public.hr_luck_ring_pct from public, anon, authenticated, service_role;

create table if not exists public.hr_lucky_offers (
  from_item text primary key check (from_item ~ '^[a-z0-9_]{1,48}$'),
  to_item   text not null unique check (to_item ~ '^[a-z0-9_]{1,48}$'),
  tier      int not null check (tier between 2 and 7),
  rivets    bigint not null check (rivets between 1 and 1000000),
  gold      bigint not null check (gold between 1 and 1000000000),
  skill     text not null,
  level     int not null check (level between 1 and 99),
  check (from_item <> to_item)
);
alter table public.hr_lucky_offers enable row level security;
revoke all on table public.hr_lucky_offers from public, anon, authenticated, service_role;

delete from public.hr_luck_rules;
insert into public.hr_luck_rules (id, rank_step, rank_max, trophy_max_pm, trophy_half, party, press_max, item_id, switch_id, lucky_day_limit) values
  (true, ${R.rankStep}, ${R.rankMax}, ${R.trophyMaxPm}, ${R.trophyHalf}, ${lit(R.party)}, ${R.pressMax}, ${lit(LUCK_ITEM)}, ${lit(LUCK_SWITCH)}, ${LUCKY_DAY_LIMIT});

delete from public.hr_luck_salvage;
insert into public.hr_luck_salvage (item_id, rivets) values
${sal.join(',\n')};

delete from public.hr_luck_stages;
insert into public.hr_luck_stages (stage, kills, luck) values
${stg.join(',\n')};

delete from public.hr_luck_ring_pct;
insert into public.hr_luck_ring_pct (item_id, pct) values
${rng.join(',\n')};

delete from public.hr_lucky_offers;
insert into public.hr_lucky_offers (from_item, to_item, tier, rivets, gold, skill, level) values
${off.join(',\n')};

-- §4 SELF-CHECK: the counts are the generator's, every id is a catalogue item (the rivet bound and unpriced, never salvaged), every skill a
-- skill, and no client can read or write a table.
do $$
declare v text;
begin
  if (select count(*) from public.hr_luck_salvage) <> ${sal.length} or (select count(*) from public.hr_luck_stages) <> ${stg.length}
     or (select count(*) from public.hr_luck_ring_pct) <> ${rng.length} or (select count(*) from public.hr_lucky_offers) <> ${off.length} then
    raise exception 'luck-catalogue §4: a table is not the generator''s rows (${sal.length} / ${stg.length} / ${rng.length} / ${off.length})'; end if;
  if not exists (select 1 from public.hr_items i join public.hr_luck_rules r on r.item_id = i.item_id where not i.tradeable) then
    raise exception 'luck-catalogue §4: the luck item is not a bound catalogue item'; end if;
  if exists (select 1 from public.hr_luck_salvage s join public.hr_luck_rules r on r.item_id = s.item_id) then
    raise exception 'luck-catalogue §4: the luck item salvages for itself'; end if;
  select x.id into v from (
    select item_id as id from public.hr_luck_salvage union all select item_id from public.hr_luck_ring_pct
    union all select from_item from public.hr_lucky_offers union all select to_item from public.hr_lucky_offers) x
   where not exists (select 1 from public.hr_items i where i.item_id = x.id) limit 1;
  if v is not null then raise exception 'luck-catalogue §4: % is not a catalogue item', v; end if;
  if exists (select 1 from public.hr_lucky_offers o where not exists (select 1 from public.hr_skills s where s.skill_id = o.skill))
     or exists (select 1 from public.hr_lucky_offers o where not exists (select 1 from public.hr_luck_ring_pct p where p.item_id = o.to_item)) then
    raise exception 'luck-catalogue §4: a Lucky job names a skill that is not one, or makes a row with no Magic Find'; end if;
  if exists (select 1 from unnest(array['hr_luck_rules', 'hr_luck_salvage', 'hr_luck_stages', 'hr_luck_ring_pct', 'hr_lucky_offers']) t(n),
                           unnest(array['anon', 'authenticated', 'service_role']) r(role)
              where has_table_privilege(r.role, 'public.' || t.n, 'select') or has_table_privilege(r.role, 'public.' || t.n, 'insert')) then
    raise exception 'luck-catalogue §4: a client role can read or write a catalogue table'; end if;
end $$;
`;
}

async function selftest() {
  const bad = [];
  const expect = (name, args) => { if (!problemsOf(args).length) bad.push(name); };
  expect('a free rivet', { items: { ...ITEMS, [LUCK_ITEM]: { ...ITEMS[LUCK_ITEM], v: 3 } } });
  expect('a tradeable rivet', { items: { ...ITEMS, [LUCK_ITEM]: { ...ITEMS[LUCK_ITEM], bop: false } } });
  expect('the rivet salvages', { salvage: { ...salvageRows(), [LUCK_ITEM]: 2 } });
  expect('a non-gear item salvages', { salvage: { ...salvageRows(), bronze_bar: 2 } });
  expect('a stage out of order', { stages: [LUCK_STAGES[1], LUCK_STAGES[0]] });
  expect('a ring too lucky', { rings: { ...ringRows(), banded_signet_lucky: 3 } });
  expect('a cheap Lucky job', { offers: LUCKY_OFFERS.map((o) => ({ ...o, rivets: o.rivets - 1 })) });
  expect('a Lucky job past the switch', { offers: LUCKY_OFFERS.map((o) => ({ ...o, switch: 'other' })) });
  expect('an averaging typo', { rules: { ...LUCK_RULES, party: 'mean' } });
  expect('no Lucky job', { offers: [] });
  if (problemsOf().length) bad.push('CONTROL: the shipped rows are refused: ' + problemsOf().join('; '));
  if (bad.length) { console.error('gen-luck --selftest: NOT caught: ' + bad.join(', ')); process.exit(1); }
  console.log('gen-luck --selftest: 10/10 refusals bite, the shipped rows pass');
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) await selftest();
  else {
    const text = build();
    if (argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r\n/g, '\n') !== text) { console.error(`gen-luck --check FAILED: ${OUT_FILE} is stale. Run: node tools/gen-luck.mjs`); process.exit(1); }
      console.log(`gen-luck --check: ${OUT_FILE} matches src/data/luck.js`);
    } else {
      await writeFile(OUT, text);
      console.log(`gen-luck: wrote ${OUT_FILE}`);
    }
  }
}
