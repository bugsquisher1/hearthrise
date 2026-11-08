#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-scaled-hunts.mjs — GENERATE THE SERVER'S SCALED-HUNTS CATALOGUE (lane/c-scaled-hunts; Tyler 2026-11-07 "an option to
// 'scale' early game hunts up with gold", "make it a per hour slider", "up to 24 hours", "the time only ticks down while in the spawn").
//
// src/data/scaled-hunts.js is the one source: the slider's clamps, the bank, the day's clamp, the top Level, the price a Level, which
// grounds scale and their bands, and the rows a scaled ground fights with (scaledMonsters). The server never types a number of it:
//   hr_scaled_hunt_rule      ONE row: min_hours, max_hours, bank_max_hours, day_max_hours, top_level, price_per_level
//   hr_scaled_grounds        a row per scalable ground: its band (floor, top)
//   hr_scaled_kill_bounds    a row per scalable ground and every Level it can be scaled to (top + 1 .. top_level): the most one kill of
//                            its roster on its scaled rows can pay (gold: the top coin roll; XP: every HP of damage at the Melee / Ranged
//                            rate plus the kill's Level XP, gen-hunt-sessions.mjs killBounds' own formula) and the highest scaled monster
//                            Level (what a blow trains Defense by). hr_hunt_apply_member bounds a window the commit proved scaled by
//                            these, beside the ground's own (2027-03-21-scaled-hunts.sql), so the server never clamps an honest scaled kill.
// tests/scaled-hunts-server.mjs `catalogue` holds the file's rows equal to the data digit for digit; --check is the CI half.
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new dated file (OUT_NAME).
//
//   node tools/gen-scaled-hunts.mjs            write OUT_NAME
//   node tools/gen-scaled-hunts.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-scaled-hunts.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a clamp the buy can't honour (hours not whole, a bank under one purchase, a day under one bank),
// a price that isn't whole and positive, a scalable ground the hunt catalogue doesn't open or whose band isn't the hunt's, a ground
// that doesn't scale past its band's top, a scaled tier dial past the server's value bound (hr_hunt_apply_member allows a kill K times
// its row: hunt-sessions.js VALUE_HEADROOM; a scaled Dangerous lifts HP and XP by its dials, so a dial over K x 1000 would see honest
// play refused), and a scaled kill that pays less than the same monster unscaled (the bound would then shrink).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 2027-03-21-scaled-hunts-catalogue.generated.sql is APPLIED history (v0.2.109). The re-tune's kill pay (lane/b-one-difficulty, 2026-11-08: the stat formula's
   floor fit and coin line) moves the scaled rows' most-a-kill bounds, so they are a new dated file. */
export const OUT_NAME = '2027-03-23-one-difficulty-scaled-hunts-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const whole = (n) => Number.isInteger(n) && n >= 1;

/** The rows the server holds, from the data (D: { S (scaled-hunts.js), MONSTERS, OPEN_GROUNDS, HUNT_INDEX, ROSTER, COMBAT_XP, headroom }). */
export function catalogueOf(D) {
  const H = D.S.SCALED_HUNTS;
  if (!whole(H.minHours) || !whole(H.maxHours) || H.maxHours < H.minHours) throw new Error('gen-scaled-hunts: the slider ' + H.minHours + '-' + H.maxHours + ' is not whole hours');
  if (!whole(H.bankMaxHours) || H.bankMaxHours < H.maxHours) throw new Error('gen-scaled-hunts: a bank of ' + H.bankMaxHours + ' h holds less than one purchase');
  if (!whole(H.buyMaxHoursPerDay) || H.buyMaxHoursPerDay < H.bankMaxHours) throw new Error('gen-scaled-hunts: a day of ' + H.buyMaxHoursPerDay + ' h is under one bank');
  if (!whole(H.topLevel)) throw new Error('gen-scaled-hunts: topLevel ' + H.topLevel);
  if (!whole(H.price && H.price.perLevel)) throw new Error('gen-scaled-hunts: a price a Level of ' + (H.price && H.price.perLevel));
  if (!whole(D.headroom)) throw new Error('gen-scaled-hunts: a value headroom of ' + D.headroom);
  const rule = { min: H.minHours, max: H.maxHours, bank: H.bankMaxHours, day: H.buyMaxHoursPerDay, top: H.topLevel, perLevel: H.price.perLevel };
  const grounds = [], bounds = [];
  const xpPerHp = D.COMBAT_XP.hitXpPerDamage;
  const killOf = (m) => ({ gold: Math.max(0, Math.ceil(Number((m.gp || [0, 0])[1]) || 0)),
    xp: Math.ceil(Math.max(1, Number(m.hp) || 1) * xpPerHp + Math.max(0, Number(m.xp) || 0)), level: Math.max(0, Math.floor(Number(m.level) || 0)) });
  for (const gid of Object.keys(D.S.SCALABLE_GROUNDS).sort()) {
    const g = D.S.SCALABLE_GROUNDS[gid];
    const at = 'gen-scaled-hunts: ' + gid;
    if (!ID.test(gid) || !D.OPEN_GROUNDS[gid]) throw new Error(at + ' is not an open ground');
    const band = D.HUNT_INDEX[D.OPEN_GROUNDS[gid].hunt] && D.HUNT_INDEX[D.OPEN_GROUNDS[gid].hunt].band;
    if (!band || band[0] !== g.floor || band[1] !== g.top) throw new Error(at + ' band ' + g.floor + '-' + g.top + ', the hunt\'s ' + JSON.stringify(band));
    if (!(g.top < H.topLevel) || D.S.scaleLevelFor(gid, g.top) !== null || D.S.scaleLevelFor(gid, g.top + 1) !== g.top + 1) throw new Error(at + ' does not scale past its band\'s top');
    grounds.push({ hunt: gid, floor: g.floor, top: g.top });
    const roster = Object.keys(D.ROSTER[gid] || {}).filter((id) => D.MONSTERS[id]).sort();
    if (!roster.length) throw new Error(at + ' has no roster to scale');
    for (let L = g.top + 1; L <= H.topLevel; L++) {
      const rows = D.S.scaledMonsters(D.MONSTERS, gid, L);
      let gold = 0, xp = 0, level = 0;
      for (const id of roster) {
        const r = rows[id];
        if (!r || r === D.MONSTERS[id]) throw new Error(at + ' L' + L + ': ' + id + ' does not scale');
        const k = killOf(r), own = killOf(D.MONSTERS[id]);
        if (k.xp < own.xp || k.level < own.level) throw new Error(at + ' L' + L + ': ' + id + ' pays less scaled than unscaled');
        gold = Math.max(gold, k.gold); xp = Math.max(xp, k.xp); level = Math.max(level, k.level);
      }
      for (const t of ['normal', 'dangerous', 'deadly']) {
        const row = D.S.scaledTierRow(gid, t, L);
        if (!row) continue;
        for (const k of ['hpPm', 'xpPm']) if (!(Number.isInteger(row[k]) && row[k] <= D.headroom * 1000)) throw new Error(at + ' L' + L + ' ' + t + ': ' + k + ' ' + row[k] + ' is past the value bound (' + D.headroom + 'x a kill)');
        if (!(Number.isInteger(row.dmgPm) && row.dmgPm <= 4000)) throw new Error(at + ' L' + L + ' ' + t + ': dmgPm ' + row.dmgPm + ' is past the Defense term (4000)');
      }
      bounds.push({ hunt: gid, level: L, gold, xp, levelMax: level });
    }
  }
  return { rule, grounds, bounds };
}

/** The SQL for the catalogue `c` (catalogueOf). */
export function buildSql(c) {
  const r = c.rule;
  const groundValues = c.grounds.map((g) => `  ('${g.hunt}', ${g.floor}, ${g.top})`).join(',\n');
  const boundValues = c.bounds.map((b) => `  ('${b.hunt}', ${b.level}, ${b.gold}, ${b.xp}, ${b.levelMax})`).join(',\n');
  /* the self-check's copy, written another way on purpose: the catalogue guard reads the inserts' form only */
  const sums = c.grounds.map((g) => {
    const mine = c.bounds.filter((b) => b.hunt === g.hunt);
    return `('${g.hunt}', ${mine.length}, ${mine.reduce((s, b) => s + b.gold, 0)}, ${mine.reduce((s, b) => s + b.xp, 0)}, ${mine.reduce((s, b) => s + b.levelMax, 0)})`;
  }).join(',\n      ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SCALED HUNTS' CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-scaled-hunts.mjs from src/data/scaled-hunts.js (SCALED_HUNTS, SCALABLE_GROUNDS, scaledMonsters, scaledTierRow).
--   Any hand edit FAILS \`node tools/gen-scaled-hunts.mjs --check\` and tests/scaled-hunts-server.mjs \`catalogue\`.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-scaled-hunts, backend-architect, 2026-11-07). The Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit). ON THE EA SECURITY LIST with 2027-03-21-scaled-hunts.sql: it prices a gold purchase and it
-- moves the most a kill can pay on a scaled window.
-- WHAT: three server-only catalogues, each rewritten whole. hr_scaled_hunt_rule (one row: the slider ${r.min}-${r.max} h, the bank ${r.bank} h,
-- the day ${r.day} h, the top Level ${r.top}, ${r.perLevel} gold a banked hour for each Level scaled to); hr_scaled_grounds (${c.grounds.length} grounds and
-- their bands); hr_scaled_kill_bounds (${c.bounds.length} rows: per ground and every Level it scales to, the most one kill of its roster pays on the
-- scaled rows, and the highest scaled monster Level). No function, grant or client verb here: 2027-03-21-scaled-hunts.sql reads them.
-- ORDER: before 2027-03-21-scaled-hunts.sql; after the hunt-sessions catalogue (hr_hunt_grounds: every ground here is one of its rows).
-- Idempotent: the tables are made if absent and every row rewritten whole, so a second apply is byte-identical. No begin/commit.
-- REVERSIBLE: drop the three tables (2027-03-21-scaled-hunts.sql first: it reads them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_grounds') is null or to_regprocedure('public.hr_hunt_limit(text)') is null then
    raise exception 'PRECONDITION: the hunt-sessions catalogue first (hr_hunt_grounds, hr_hunt_limit)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_scaled_hunt_rule (
  id              boolean primary key default true check (id),
  min_hours       int not null check (min_hours >= 1),
  max_hours       int not null check (max_hours >= min_hours),
  bank_max_hours  int not null check (bank_max_hours >= max_hours),
  day_max_hours   int not null check (day_max_hours >= bank_max_hours),
  top_level       int not null check (top_level >= 1),
  price_per_level int not null check (price_per_level >= 1)
);
create table if not exists public.hr_scaled_grounds (
  hunt_id text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  floor   int not null check (floor >= 1),
  top     int not null,
  check (floor <= top)
);
create table if not exists public.hr_scaled_kill_bounds (
  hunt_id   text   not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  level     int    not null check (level >= 1),
  gold_max  bigint not null check (gold_max >= 0),
  xp_max    bigint not null check (xp_max >= 1),
  level_max int    not null check (level_max >= 1),
  primary key (hunt_id, level)
);
alter table public.hr_scaled_hunt_rule enable row level security;
alter table public.hr_scaled_grounds enable row level security;
alter table public.hr_scaled_kill_bounds enable row level security;
revoke all on public.hr_scaled_hunt_rule from public, anon, authenticated, service_role;
revoke all on public.hr_scaled_grounds from public, anon, authenticated, service_role;
revoke all on public.hr_scaled_kill_bounds from public, anon, authenticated, service_role;
comment on table public.hr_scaled_hunt_rule is
  '${OUT_NAME}: the scaled hunts'' one rule row (src/data/scaled-hunts.js SCALED_HUNTS through tools/gen-scaled-hunts.mjs): the slider, the bank, the day''s clamp, the top Level, the price a Level. Server-only.';
comment on table public.hr_scaled_grounds is
  '${OUT_NAME}: the grounds a leader may scale and their bands (src/data/scaled-hunts.js SCALABLE_GROUNDS). Server-only. No row = not scalable.';
comment on table public.hr_scaled_kill_bounds is
  '${OUT_NAME}: per scalable ground and scaled Level, the most one kill of its roster pays on the scaled rows (gold, XP) and the highest scaled monster Level (src/data/scaled-hunts.js scaledMonsters). Read by hr_hunt_apply_member on a window the commit proved scaled. Server-only.';

-- ── §2 THE ROWS ──────────────────────────────────────────────────────────────
delete from public.hr_scaled_hunt_rule;
insert into public.hr_scaled_hunt_rule (id, min_hours, max_hours, bank_max_hours, day_max_hours, top_level, price_per_level) values
  (true, ${r.min}, ${r.max}, ${r.bank}, ${r.day}, ${r.top}, ${r.perLevel});
delete from public.hr_scaled_grounds;
insert into public.hr_scaled_grounds (hunt_id, floor, top) values
${groundValues};
delete from public.hr_scaled_kill_bounds;
insert into public.hr_scaled_kill_bounds (hunt_id, level, gold_max, xp_max, level_max) values
${boundValues};

-- ── §3 SELF-CHECK (CLAUDE.md §4) ──────────────────────────────────────────────
-- The rule is the data's; every ground is a ground the hunt catalogue holds and scales from its top + 1 to the top Level, one bound row
-- a Level and no other; the bounds are exactly the generated set (count and sums a ground); a scaled kill pays at least what the
-- ground's own most-paying kill does at its first scaled Level and never falls as the Level climbs; no client reaches any of the three.
do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_scaled_hunt_rule) <> 1
     or not exists (select 1 from public.hr_scaled_hunt_rule where min_hours = ${r.min} and max_hours = ${r.max} and bank_max_hours = ${r.bank}
                      and day_max_hours = ${r.day} and top_level = ${r.top} and price_per_level = ${r.perLevel}) then
    raise exception 'scaled-hunts-catalogue: hr_scaled_hunt_rule is not the generated row'; end if;
  if (select count(*) from public.hr_scaled_grounds) <> ${c.grounds.length}
     or exists (select 1 from public.hr_scaled_grounds s where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = s.hunt_id)) then
    raise exception 'scaled-hunts-catalogue: a scalable ground is not one the hunt catalogue holds'; end if;
  if exists (select 1 from public.hr_scaled_grounds s cross join public.hr_scaled_hunt_rule r
              where (select count(*) from public.hr_scaled_kill_bounds b where b.hunt_id = s.hunt_id) <> r.top_level - s.top
                 or exists (select 1 from public.hr_scaled_kill_bounds b where b.hunt_id = s.hunt_id and (b.level <= s.top or b.level > r.top_level)))
     or exists (select 1 from public.hr_scaled_kill_bounds b where not exists (select 1 from public.hr_scaled_grounds s where s.hunt_id = b.hunt_id)) then
    raise exception 'scaled-hunts-catalogue: a ground does not hold one bound a Level from its top + 1 to the top Level'; end if;
  if exists (select 1 from (values
      ${sums}) d(hunt_id, n, gold, xp, lv)
              where (select count(*) from public.hr_scaled_kill_bounds b where b.hunt_id = d.hunt_id) <> d.n
                 or (select sum(b.gold_max) from public.hr_scaled_kill_bounds b where b.hunt_id = d.hunt_id) <> d.gold
                 or (select sum(b.xp_max) from public.hr_scaled_kill_bounds b where b.hunt_id = d.hunt_id) <> d.xp
                 or (select sum(b.level_max) from public.hr_scaled_kill_bounds b where b.hunt_id = d.hunt_id) <> d.lv) then
    raise exception 'scaled-hunts-catalogue: hr_scaled_kill_bounds is not the generated set'; end if;
  if exists (select 1 from public.hr_scaled_kill_bounds a join public.hr_scaled_kill_bounds b on b.hunt_id = a.hunt_id and b.level = a.level + 1
              where b.xp_max < a.xp_max or b.level_max < a.level_max) then
    raise exception 'scaled-hunts-catalogue: a scaled kill pays less at a higher Level'; end if;
  foreach v_t in array array['hr_scaled_hunt_rule', 'hr_scaled_grounds', 'hr_scaled_kill_bounds'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, ('public.' || v_t)::regclass, 'select,insert,update,delete') then
        raise exception 'scaled-hunts-catalogue: % reaches %', v_role, v_t; end if;
    end loop;
  end loop;
end $$;
`;
}

async function loadData(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const S = await import(u('src/data/scaled-hunts.js'));
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const { OPEN_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const { GROUND_ROSTER } = await import(u('src/data/balance-sheet.js'));
  const { COMBAT_XP } = await import(u('src/data/core-model.js'));
  const { VALUE_HEADROOM } = await import(u('src/data/hunt-sessions.js'));
  return { S, MONSTERS, OPEN_GROUNDS, HUNT_INDEX, ROSTER: GROUND_ROSTER, COMBAT_XP, headroom: VALUE_HEADROOM };
}

/* Say what was written, in one line. */
const said = (c) => c.grounds.length + ' grounds (' + c.grounds.map((g) => g.hunt + ' ' + (g.top + 1) + '-' + c.rule.top).join(', ') + '), '
  + c.bounds.length + ' bound rows, ' + c.rule.perLevel + ' g a Level an hour, slider ' + c.rule.min + '-' + c.rule.max + ' h, bank ' + c.rule.bank + ' h, day ' + c.rule.day + ' h';

async function selftest() {
  const D = await loadData(ROOT);
  let bad = 0;
  const H = D.S.SCALED_HUNTS;
  const plant = (patch) => ({ ...D, S: { ...D.S, ...patch(D.S) } });
  const expectThrow = (name, Dx) => { try { catalogueOf(Dx); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  expectThrow('a slider of half hours', plant(() => ({ SCALED_HUNTS: { ...H, maxHours: 24.5 } })));
  expectThrow('a bank under one purchase', plant(() => ({ SCALED_HUNTS: { ...H, bankMaxHours: 12 } })));
  expectThrow('a day under one bank', plant(() => ({ SCALED_HUNTS: { ...H, buyMaxHoursPerDay: 20 } })));
  expectThrow('a free hour', plant(() => ({ SCALED_HUNTS: { ...H, price: { perLevel: 0 } } })));
  expectThrow('the Warrens offered (no right-Level ground above it)', plant((S) => ({ SCALABLE_GROUNDS: { ...S.SCALABLE_GROUNDS, coppercap_warrens: { floor: 32, top: 50, fit: 'party' } } })));
  expectThrow('a band restated wrong', plant((S) => ({ SCALABLE_GROUNDS: { ...S.SCALABLE_GROUNDS, wickstead: { ...S.SCALABLE_GROUNDS.wickstead, top: 20 } } })));
  expectThrow('a ground nobody can open', plant((S) => ({ SCALABLE_GROUNDS: { ...S.SCALABLE_GROUNDS, nowhere: { floor: 1, top: 5, fit: 'solo' } } })));
  expectThrow('a scaled Dangerous past the value bound', plant((S) => ({ scaledTierRow: (g, t, L) => { const r = S.scaledTierRow(g, t, L); return r && t === 'dangerous' ? { ...r, xpPm: 3500 } : r; } })));
  expectThrow('a scaled kill that pays less than its own row', plant((S) => ({ scaledMonsters: (M, g, L) => Object.fromEntries(Object.entries(S.scaledMonsters(M, g, L)).map(([id, r]) => [id, { ...r, hp: 1, xp: 1 }])) })));
  expectThrow('a tighter value bound', { ...D, headroom: 1 });
  const sql = buildSql(catalogueOf(D));
  const inserts = [...sql.matchAll(/^ {2}\('([a-z_]+)', (\d+), (\d+), (\d+), (\d+)\)/gm)].length;
  if (inserts !== catalogueOf(D).bounds.length) { console.error('  MISSED  the catalogue guard would read ' + inserts + ' bound rows'); bad++; }
  else console.log('  caught  a self-check the catalogue guard would read twice');
  if (bad) { console.error('gen-scaled-hunts --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-scaled-hunts --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const c = catalogueOf(await loadData(ROOT));
  const wanted = buildSql(c);
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) { console.error('gen-scaled-hunts --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-scaled-hunts.mjs'); process.exit(1); }
    console.log('gen-scaled-hunts --check: ' + OUT_NAME + ' matches src/data/scaled-hunts.js (' + said(c) + ')');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-scaled-hunts: wrote ' + OUT_NAME + ' (' + said(c) + ')');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
