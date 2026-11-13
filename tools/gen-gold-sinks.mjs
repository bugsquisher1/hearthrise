#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-gold-sinks.mjs — GENERATE THE GOLD SINKS' SERVER CATALOGUE.
//
// src/data/gold-sinks.js is the single source of what a sink costs; Postgres must know it to do what only it may: re-quote a
// purchase under the lock, on its own clock. Emitted as hr_sink_rules, one row per sink, a full delete + insert replace.
//
//   Regenerate:  node tools/gen-gold-sinks.mjs
//   Verify:      node tools/gen-gold-sinks.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-gold-sinks.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a sink the design names going missing; a price that is not a whole number; a ladder that
// doesn't climb; a day's cap that isn't its ladder's length; setup slots whose free + prices isn't the hero's setup limit; a
// powder that sells one of the Hearth's named flames, which are never for sale; an offer on two rows; a row with two prices or
// none; a show that can't fit its own booking; a Crier that takes more than a chat line does.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { SINK_RULES, SHOW_FLAMES, ROUND_OFFER } from '../src/data/gold-sinks.js';
import { ACTION_SET_LIMITS } from '../src/data/rule-subjects.js';
import { FLAMES } from '../src/data/hearth.js';
import { CHAT_LIMITS } from '../src/data/chat-channels.js';
import { TRAINING_SKILLS } from '../src/data/training.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 2027-02-27-gold-sinks-catalogue.generated.sql is APPLIED history (2 free setups). 2027-03-07 re-issued the whole table (3 free, Tyler 2026-11-05).
   This forward file re-issues it again with the house dummy (lane/c-combat-training, Tyler 2026-11-08; src/data/training.js): one row more, every other
   row unchanged. The next number moves OUT_FILE again. */
export const OUT_FILE = '2027-04-16-combat-training-gold-sinks-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);

const NEEDED = ['powder', 'round', 'crier', 'setup_slot', 'hero_colors', 'house_dummy'];
const PRICE_MAX = 1000000000;
const whole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** What is wrong with the rows, as sentences. Pure. */
export function problemsOf(rules, ctx = {}) {
  const limit = ctx.setupLimit === undefined ? ACTION_SET_LIMITS.presets : ctx.setupLimit;
  const flames = ctx.flames || FLAMES;
  const lineMax = ctx.lineMax === undefined ? CHAT_LIMITS.bodyMax : ctx.lineMax;
  const out = [];
  for (const id of NEEDED) if (!rules[id]) out.push(`the sink ${id} is missing`);
  const offered = new Set();
  for (const [id, r] of Object.entries(rules)) {
    if (!/^[a-z0-9_]{1,32}$/.test(id)) out.push(`${id} is not a sink id`);
    if (r.scope !== 'account' && r.scope !== 'hero') out.push(`${id}: scope ${r.scope} is neither account nor hero`);
    const ladder = r.prices || [];
    const byLevel = r.priceBase !== undefined || r.pricePerLevel !== undefined;
    if (!!ladder.length === byLevel) out.push(`${id}: needs a ladder or a Level price, exactly one`);
    ladder.forEach((p, i) => {
      if (!whole(p, 1, PRICE_MAX)) out.push(`${id}: ${p} is not a whole price`);
      if (i && !(p > ladder[i - 1])) out.push(`${id}: the ladder must climb, and ${p} follows ${ladder[i - 1]}`);
    });
    if (byLevel && (!whole(r.priceBase, 1, PRICE_MAX) || !whole(r.pricePerLevel, 0, PRICE_MAX))) out.push(`${id}: its Level price is not whole numbers`);
    if (r.perDay !== undefined && !whole(r.perDay, 1, 1000)) out.push(`${id}: perDay ${r.perDay} is not a whole count`);
    if (ladder.length && r.perDay !== undefined && r.perDay !== ladder.length) out.push(`${id}: a ladder of ${ladder.length} with ${r.perDay} a day: the cap and the climb must be one number`);
    for (const offer of r.offers || []) {
      if (!/^[a-z0-9_]{1,32}$/.test(offer)) out.push(`${id}: the offer ${offer} is not an id`);
      if (offered.has(offer)) out.push(`${id}: the offer ${offer} is on two rows`);
      offered.add(offer);
      if (flames[offer]) out.push(`${id}: ${offer} is a named flame, and those are never for sale`);
    }
    if (r.seconds !== undefined) {
      if (!whole(r.seconds, 10, 600)) out.push(`${id}: seconds ${r.seconds} is outside 10 to 600`);
      if (!whole(r.bookS, r.seconds, 3600)) out.push(`${id}: bookS ${r.bookS} can't fit one show`);
      if (!(r.offers || []).length) out.push(`${id}: a show with nothing to name`);
    }
    if (r.perMinute !== undefined && !whole(r.perMinute, 1, 600)) out.push(`${id}: perMinute ${r.perMinute} is not a whole count`);
    if (r.gapS !== undefined && !whole(r.gapS, 1, 3600)) out.push(`${id}: gapS ${r.gapS} is not a whole count`);
    if (r.minLevel !== undefined && !whole(r.minLevel, 1, 10000)) out.push(`${id}: minLevel ${r.minLevel} is not a Level`);
    if (r.maxLetters !== undefined && !whole(r.maxLetters, 1, lineMax)) out.push(`${id}: ${r.maxLetters} letters is more than a chat line takes`);
  }
  /* what the World and the window can draw is what the server may sell */
  for (const offer of (rules.powder && rules.powder.offers) || []) if (!(ctx.showFlames || SHOW_FLAMES)[offer]) out.push(`powder: ${offer} has no flame to draw (SHOW_FLAMES)`);
  if (rules.round && !(rules.round.offers || []).includes(ROUND_OFFER)) out.push(`round: its offer is not ${ROUND_OFFER}`);
  /* THE HOUSE DUMMY (src/data/training.js): one account ladder, a rung for each skill a hero can train, and nothing else. */
  const dummy = rules.house_dummy;
  const skills = ctx.trainingSkills || TRAINING_SKILLS;
  if (dummy) {
    if (dummy.scope !== 'account') out.push('house_dummy: one dummy an account, so its ladder is the account\'s');
    if (JSON.stringify([...(dummy.offers || [])].sort()) !== JSON.stringify([...skills].sort())) out.push(`house_dummy: its offers are not the trained skills (${skills.join(', ')})`);
    if ((dummy.prices || []).length !== skills.length) out.push(`house_dummy: ${(dummy.prices || []).length} rungs for ${skills.length} trained skills`);
    if (dummy.perDay !== undefined || dummy.free !== undefined) out.push('house_dummy: a one-time unlock has no day cap and no free rung');
  }
  const setup = rules.setup_slot;
  if (setup) {
    const has = (setup.free === undefined ? 0 : setup.free) + (setup.prices || []).length;
    if (!whole(setup.free, 1, limit)) out.push(`setup_slot: free ${setup.free} is not 1 to ${limit}`);
    if (has !== limit) out.push(`setup_slot: free + prices is ${has}, and a hero's setup limit is ${limit}`);
  }
  return out;
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const num = (v) => (v === undefined ? 'null' : String(v));
const texts = (a) => (a && a.length ? `array[${a.map(lit).join(', ')}]::text[]` : `'{}'::text[]`);
const bigs = (a) => (a && a.length ? `array[${a.join(', ')}]::bigint[]` : `'{}'::bigint[]`);

export function build(rules = SINK_RULES) {
  const problems = problemsOf(rules);
  if (problems.length) throw new Error('gen-gold-sinks: ' + problems.join('; '));
  const rows = Object.keys(rules).sort().map((id) => {
    const r = rules[id];
    return `  (${lit(id)}, ${lit(r.scope)}, ${texts(r.offers)}, ${bigs(r.prices)}, ${r.free === undefined ? 0 : r.free}, ${num(r.priceBase)}, ${num(r.pricePerLevel)}, ${num(r.perDay)}, ${num(r.seconds)}, ${num(r.bookS)}, ${num(r.gapS)}, ${num(r.minLevel)}, ${num(r.maxLetters)}, ${num(r.perMinute)})`;
  });
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_FILE} — WHAT GOLD BUYS BEYOND SUPPLIES: PRICES, CLIMBS, CAPS AND SECONDS.
-- Generated by tools/gen-gold-sinks.mjs from src/data/gold-sinks.js.
--   Any hand edit FAILS \`node tools/gen-gold-sinks.mjs --check\`.
-- A row moves no value: a verb re-quotes from it under its lock, journals kind \`shop\`, and answers quote_changed if the price moved.
-- RLS on, no policy, no client grant: a client reads a quote through a verb's own read. No begin/commit.
-- REVERSIBLE: drop the table with the verbs that read it. ON THE EA SECURITY LIST.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.hr_sink_rules (
  sink_id         text primary key check (sink_id ~ '^[a-z0-9_]{1,32}$'),
  scope           text not null check (scope in ('account', 'hero')),
  offers          text[] not null default '{}',
  prices          bigint[] not null default '{}',
  free            int not null default 0 check (free >= 0),
  price_base      bigint check (price_base >= 1),
  price_per_level bigint check (price_per_level >= 0),
  per_day         int check (per_day >= 1),
  seconds         int check (seconds >= 1),
  book_s          int check (book_s >= 1),
  gap_s           int check (gap_s >= 1),
  min_level       int check (min_level >= 1),
  max_letters     int check (max_letters >= 1),
  per_minute      int check (per_minute >= 1),
  check ((cardinality(prices) > 0) <> (price_base is not null))
);
alter table public.hr_sink_rules enable row level security;
revoke all on table public.hr_sink_rules from public, anon, authenticated, service_role;
comment on table public.hr_sink_rules is
  '${OUT_FILE}: one row per gold sink (src/data/gold-sinks.js): the (n+1)th purchase costs prices[n], or price_base + price_per_level x Level. Read only by SECURITY DEFINER verbs.';

delete from public.hr_sink_rules;
insert into public.hr_sink_rules (sink_id, scope, offers, prices, free, price_base, price_per_level, per_day, seconds, book_s, gap_s, min_level, max_letters, per_minute) values
${rows.join(',\n')};

-- §4 SELF-CHECK: the ladders climb, a hero's setups add up to its limit, nothing sold is a named flame, and no client can write or read the table.
do $$
declare v text;
begin
  select r.sink_id into v from public.hr_sink_rules r
   where exists (select 1 from generate_subscripts(r.prices, 1) i where i > 1 and r.prices[i] <= r.prices[i - 1]) limit 1;
  if v is not null then raise exception 'gold-sinks-catalogue §4: the ladder of % does not climb', v; end if;
  if (select free + cardinality(prices) from public.hr_sink_rules where sink_id = 'setup_slot') is distinct from public.hr_hunt_limit('presets') then
    raise exception 'gold-sinks-catalogue §4: setup_slot''s free + prices is not hr_hunt_limit(presets)'; end if;
  if (select free from public.hr_sink_rules where sink_id = 'setup_slot') is distinct from ${rules.setup_slot.free} then
    raise exception 'gold-sinks-catalogue §4: setup_slot is not ${rules.setup_slot.free} free'; end if;
  if (select prices from public.hr_sink_rules where sink_id = 'setup_slot') is distinct from ${bigs(rules.setup_slot.prices)} then
    raise exception 'gold-sinks-catalogue §4: setup_slot''s prices are not the row in src/data/gold-sinks.js'; end if;
  if (select prices from public.hr_sink_rules where sink_id = 'house_dummy') is distinct from ${bigs(rules.house_dummy.prices)}
     or (select scope from public.hr_sink_rules where sink_id = 'house_dummy') is distinct from 'account'
     or (select offers from public.hr_sink_rules where sink_id = 'house_dummy') is distinct from ${texts(rules.house_dummy.offers)} then
    raise exception 'gold-sinks-catalogue §4: house_dummy is not the account ladder in src/data/gold-sinks.js'; end if;
  select o into v from public.hr_sink_rules r cross join lateral unnest(r.offers) o
   where o in (select n.flame from public.hr_hearth_named n) limit 1;
  if v is not null then raise exception 'gold-sinks-catalogue §4: % is a named flame, and those are never for sale', v; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_sink_rules') then
    raise exception 'gold-sinks-catalogue §4: a policy opens the table to a client'; end if;
  if has_table_privilege('authenticated', 'public.hr_sink_rules', 'select') or has_table_privilege('anon', 'public.hr_sink_rules', 'select')
     or has_table_privilege('authenticated', 'public.hr_sink_rules', 'insert,update,delete') or has_table_privilege('anon', 'public.hr_sink_rules', 'insert,update,delete') then
    raise exception 'gold-sinks-catalogue §4: a client role holds a grant'; end if;
end $$;
`;
}

function selftest() {
  let bad = 0;
  const clean = problemsOf(SINK_RULES);
  if (clean.length) { console.error('gen-gold-sinks --selftest: the tree is not clean: ' + clean.join('; ')); process.exit(2); }
  const bites = (name, want, rules, ctx) => {
    const hit = problemsOf(rules, ctx).some((p) => p.includes(want));
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const R = SINK_RULES;
  const { hero_colors, ...noColors } = R;
  bites('a sink the design names goes missing', 'hero_colors is missing', noColors);
  bites('a ladder that falls', 'must climb', { ...R, round: { ...R.round, prices: [5000, 4000, 20000] } });
  bites('a fractional price', '2.5 is not a whole price', { ...R, crier: { ...R.crier, prices: [2.5, 2000, 4000, 8000, 16000] } });
  bites('a day cap that is not the climb', 'one number', { ...R, powder: { ...R.powder, perDay: 6 } });
  bites('two prices on one row', 'exactly one', { ...R, hero_colors: { ...R.hero_colors, prices: [100] } });
  bites('no price at all', 'exactly one', { ...R, hero_colors: { scope: 'hero', offers: [] } });
  bites('setups that outrun the limit', 'setup limit is 5', { ...R, setup_slot: { ...R.setup_slot, free: 4 } });
  bites('a named flame for sale', 'never for sale', { ...R, powder: { ...R.powder, offers: ['honey', 'borax'] } }, { flames: { honey: {} } });
  bites('an offer on two rows', 'on two rows', { ...R, round: { ...R.round, offers: ['borax'] } });
  bites('a powder with no flame to draw', 'no flame to draw', { ...R, powder: { ...R.powder, offers: ['cinnabar', 'quicklime', 'saltpeter'] } });
  bites('a round the client can not name', 'its offer is not', { ...R, round: { ...R.round, offers: ['toast'] } });
  bites('a show longer than its booking', "can't fit one show", { ...R, round: { ...R.round, bookS: 10 } });
  bites('a Crier line longer than chat takes', 'more than a chat line', { ...R, crier: { ...R.crier, maxLetters: 100000 } });
  bites('a house dummy that misses a trained skill', 'not the trained skills', { ...R, house_dummy: { ...R.house_dummy, offers: ['melee', 'ranged', 'magic'], prices: [150000, 250000, 400000] } });
  bites('a house dummy rung short', 'rungs for', { ...R, house_dummy: { ...R.house_dummy, prices: [150000, 250000, 400000] } });
  bites('a house dummy on a hero ladder', 'one dummy an account', { ...R, house_dummy: { ...R.house_dummy, scope: 'hero' } });
  bites('a house dummy with a day cap', 'one-time unlock', { ...R, house_dummy: { ...R.house_dummy, perDay: 4 } });
  /* Tyler may flip the free count again: it is one row, and it stays legal. */
  const three = problemsOf({ ...R, setup_slot: { ...R.setup_slot, free: 2, prices: [5000, 15000, 40000] } });
  console.log(`  ${three.length ? 'MISSED' : 'CAUGHT'} two free setups are one legal row`);
  if (three.length) bad++;
  if (bad) { console.error(`gen-gold-sinks --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-gold-sinks --selftest: every refusal bites');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-gold-sinks --check: ${OUT_FILE} is stale; run node tools/gen-gold-sinks.mjs`); process.exit(1); }
    console.log('gen-gold-sinks --check: OK');
  } else {
    await writeFile(OUT, build());
    console.log('gen-gold-sinks: wrote ' + OUT_FILE);
  }
}
