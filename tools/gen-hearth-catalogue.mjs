#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hearth-catalogue.mjs — THE GREAT HEARTH'S SERVER CATALOGUE
// (lane/b-inner-flame, 2026-10-27; Tyler 2026-10-25: Inner Flame replaces Prayer).
//
// src/data/hearth.js is the only source of these numbers; Postgres needs them to
// burn a named fuel by itself (hr_hearth_burn, 2027-01-31-inner-flame.sql: a
// client names a fuel, never its XP, colour, duration or a clamp):
//   NAMED_FUELS  -> hr_hearth_named (item, the XP the burn PAYS after the pacing
//                   dial, the Inner Flame level, the colour, the seconds)
//   HEARTH_RULE  -> hr_hearth_rule  (named burns a hero a UTC day; the queue's reach)
// The tables are 2027-01-31-inner-flame.sql's (§3); this file is a full delete +
// insert of their rows, with a self-check that each fuel is a live item.
//
//   Regenerate:  node tools/gen-hearth-catalogue.mjs
//   Verify:      node tools/gen-hearth-catalogue.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-hearth-catalogue.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a named fuel that is no item; that is also an
// everyday fuel (HEARTH_FUELS: a bench run) or any recipe's input (a fuel burns
// alone, never in a Fuel all); that no monster drops (no item without a source);
// whose paid XP is not a whole number of at least 1; a level outside 1-500; a colour
// FLAMES does not draw; seconds outside 10-600; a rule outside its CHECKs.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NAMED_FUELS, HEARTH_FUELS, HEARTH_RULE, FLAMES } from '../src/data/hearth.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { recipeInputs } from '../src/core/artisan.js';
import { pacedXp } from '../src/core/pacing.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2027-01-31-hearth-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ID = /^[a-z0-9_]{1,64}$/;

/** The XP a burn PAYS: the authored (pre-dial) burst through the pacing dial, whole (the engine floors the same way). */
export const paidXp = (xp) => Math.floor(pacedXp('inner_flame', xp) + 1e-9);

/** Validated hr_hearth_named rows, or throw. */
export function namedRows(named = NAMED_FUELS, { items = ITEMS, monsters = MONSTERS, everyday = HEARTH_FUELS, recipes = ARTISAN_RECIPES, flames = FLAMES } = {}) {
  const inputs = new Set();
  for (const rows of Object.values(recipes)) for (const r of rows || []) for (const id of Object.keys(recipeInputs(r) || {})) inputs.add(id);
  const dropped = new Set();
  for (const m of Object.values(monsters)) for (const d of (m && m.drops) || []) if (d && d.id) dropped.add(d.id);
  const bench = new Set(everyday.map((f) => f.item));
  return Object.keys(named).sort().map((id) => {
    const f = named[id];
    if (!ID.test(id) || !own(items, id)) throw new Error(`named fuel ${id} is no item`);
    if (bench.has(id) || inputs.has(id)) throw new Error(`named fuel ${id} is also a bench input: a named fuel burns alone`);
    if (!dropped.has(id)) throw new Error(`named fuel ${id} has no source: no monster drops it`);
    const xp = paidXp(f.xp);
    if (!Number.isInteger(xp) || xp < 1 || xp > 1000000) throw new Error(`named fuel ${id} pays ${xp} XP, not a whole 1..1000000`);
    if (!Number.isInteger(f.req) || f.req < 1 || f.req > 500) throw new Error(`named fuel ${id} needs Inner Flame ${f.req}, not 1..500`);
    if (!own(flames, f.flame) || f.flame === 'fire' || !/^[a-z0-9_]{1,32}$/.test(f.flame)) throw new Error(`named fuel ${id} burns ${f.flame}, a colour FLAMES does not draw`);
    if (!Number.isInteger(f.secs) || f.secs < 10 || f.secs > 600) throw new Error(`named fuel ${id} burns ${f.secs} s, not 10..600`);
    return { item: id, xp, req: f.req, flame: f.flame, secs: f.secs };
  });
}

/** The validated rule row, or throw. */
export function ruleRow(rule = HEARTH_RULE) {
  if (!Number.isInteger(rule.perDay) || rule.perDay < 1 || rule.perDay > 100) throw new Error(`HEARTH_RULE.perDay ${rule.perDay} is not 1..100`);
  if (!Number.isInteger(rule.queueS) || rule.queueS < 60 || rule.queueS > 3600) throw new Error(`HEARTH_RULE.queueS ${rule.queueS} is not 60..3600`);
  return { perDay: rule.perDay, queueS: rule.queueS };
}

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function render(rows = namedRows(), rule = ruleRow()) {
  const digest = createHash('sha256').update(JSON.stringify({ rows, rule })).digest('hex');
  const values = rows.map((r) => `  (${sq(r.item)}, ${r.xp}, ${r.req}, ${sq(r.flame)}, ${r.secs})`).join(',\n');
  const ids = rows.map((r) => sq(r.item)).join(', ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Generated by tools/gen-hearth-catalogue.mjs from src/data/hearth.js (NAMED_FUELS, HEARTH_RULE).
-- Do not hand-edit: any hand edit FAILS \`node tools/gen-hearth-catalogue.mjs --check\`.
--   digest ${digest}
-- The Great Hearth's named fuels (the XP a burn PAYS, after the pacing dial) and its rule, read by
-- hr_hearth_burn (2027-01-31-inner-flame.sql). A full delete + insert of both tables. No value moves.
-- ORDER: after 2027-01-31-inner-flame.sql (the tables) and 2027-01-31-items-catalogue.generated.sql (the items).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════
do $mig$
begin
  if to_regclass('public.hr_hearth_named') is null or to_regclass('public.hr_hearth_rule') is null then
    raise exception 'PRECONDITION: apply 2027-01-31-inner-flame.sql first (the Hearth''s tables)'; end if;
end $mig$;

delete from public.hr_hearth_named;
insert into public.hr_hearth_named (item_id, xp, req_lv, flame, secs) values
${values};

delete from public.hr_hearth_rule;
insert into public.hr_hearth_rule (id, per_day, queue_s) values (true, ${rule.perDay}, ${rule.queueS});

-- SELF-CHECK (CLAUDE.md §4): the rows landed whole, each fuel is a live item, and none is a bench input.
do $chk$
declare v_bad text;
begin
  if (select count(*) from public.hr_hearth_named) <> ${rows.length} or (select count(*) from public.hr_hearth_rule) <> 1 then
    raise exception 'hearth catalogue: % named fuels and % rules landed, expected ${rows.length} and 1',
      (select count(*) from public.hr_hearth_named), (select count(*) from public.hr_hearth_rule); end if;
  select string_agg(n.item_id, ', ') into v_bad from public.hr_hearth_named n
   where not exists (select 1 from public.hr_items i where i.item_id = n.item_id);
  if v_bad is not null then raise exception 'hearth catalogue: named fuels that are no item: %', v_bad; end if;
  select string_agg(n.item_id, ', ') into v_bad from public.hr_hearth_named n
   where n.item_id not in (${ids});
  if v_bad is not null then raise exception 'hearth catalogue: rows the generator did not emit: %', v_bad; end if;
  raise notice 'hearth catalogue: ${rows.length} named fuels, % a hero a day, colours booked up to % s ahead; digest ${digest.slice(0, 12)}',
    (select per_day from public.hr_hearth_rule), (select queue_s from public.hr_hearth_rule);
end $chk$;
`;
}

/* --selftest: each planted defect must be refused by its named rule; the shipped data must pass. */
function selftest() {
  const fails = [];
  const expect = (label, fn, re) => {
    try { fn(); fails.push(`${label}: not refused`); } catch (e) { if (!re.test(e.message)) fails.push(`${label}: refused for the wrong reason: ${e.message}`); }
  };
  const base = NAMED_FUELS;
  const one = (id, patch) => ({ ...base, [id]: { ...base[id], ...patch } });
  expect('an unknown item', () => namedRows({ ...base, zz_nothing: { ...base.queens_comb } }), /is no item/);
  expect('a bench fuel', () => namedRows({ ...base, bones: { ...base.queens_comb } }), /bench input/);
  expect('a fuel no monster drops', () => namedRows(base, { monsters: {} }), /no source/);
  expect('XP under 1', () => namedRows(one('queens_comb', { xp: 1 })), /not a whole/);
  expect('a level of 0', () => namedRows(one('queens_comb', { req: 0 })), /not 1\.\.500/);
  expect('an undrawn colour', () => namedRows(one('queens_comb', { flame: 'violet' })), /does not draw/);
  expect('the everyday fire as a colour', () => namedRows(one('queens_comb', { flame: 'fire' })), /does not draw/);
  expect('a 5 s colour', () => namedRows(one('queens_comb', { secs: 5 })), /not 10\.\.600/);
  expect('a rule of 0 a day', () => ruleRow({ perDay: 0, queueS: 600 }), /perDay/);
  expect('a 10 s queue', () => ruleRow({ perDay: 20, queueS: 10 }), /queueS/);
  try { namedRows(); ruleRow(); } catch (e) { fails.push('the shipped data is refused: ' + e.message); }
  if (fails.length) { console.error('gen-hearth-catalogue --selftest FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('gen-hearth-catalogue --selftest: 10/10 planted defects refused by their rule; the shipped data passes');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) { selftest(); return; }
  const wanted = render();
  if (argv.includes('--check')) {
    let have = null;
    try { have = (await readFile(OUT, 'utf8')).replace(/\r\n/g, '\n'); } catch { /* absent */ }
    if (have !== wanted) { console.error('gen-hearth-catalogue --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-hearth-catalogue.mjs'); process.exit(1); }
    console.log('gen-hearth-catalogue --check: ' + OUT_NAME + ' matches src/data/hearth.js');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('wrote ' + OUT);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('gen-hearth-catalogue: ' + e.message); process.exit(2); });
