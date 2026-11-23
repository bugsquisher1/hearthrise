#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-factions.mjs — GENERATE THE FACTIONS' SERVER CATALOGUE (lane/c-faction-standing 2026-11-14; moved forward by
//   lane/factions-morrow-hills 2026-11-23 for docs/design/redesign/25-factions.md: the company's side and the quartermaster's stock).
//
// src/data/factions.js and the hunt rows (src/data/hunts.js `standingFor`) are the single source of who may join, what a swap costs, which
// ground pays which side and what standing unlocks. Postgres must know them to do what only it may: count the company's Krell kill, credit
// standing from a settled window on its own clock, clamp the day, re-read a piece's mark and re-price a paid piece under the lock.
// Emitted as hr_factions, hr_faction_rule, hr_faction_grounds, hr_faction_outfits (the wearable pieces, the outfit catalogue's view),
// hr_faction_stock (every piece: kind, mark, price in wage-hour thousandths, open) and hr_faction_piece_price (src/data/factions.js
// stockPrice's twin, pinned in the file's §4 at four Levels to the JS's own answers). Read by supabase/migrations/1068-faction-company.sql.
//
//   Regenerate:  node tools/gen-factions.mjs
//   Verify:      node tools/gen-factions.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-factions.mjs --selftest  (every refusal bites)
//
// A WHOLE FILE (tools/pack/whole.mjs): it carries the base and the FOLDED ground packs only, so opening a pack moves nothing here; the
// pack's own file (tools/pack.mjs ship, tools/pack/ship.mjs COVERED) carries its hr_faction_grounds row, keyed on its hunt.
// hr_factions is UPSERTED, never deleted and re-inserted: a company's side points at it. The other tables are rewritten whole.
// REFUSES (throws, nothing written): the rules', sides' or stock's problems (factions.js validateFactions); an open ground or hall paying a
// side that is no side. The rule (every ground after Krell pays one side, evenly per region) is tests/faction-ground-balance.mjs.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { wholeViewOrRerun } from './pack/whole.mjs';
import { FACTION_RULES, FACTION_OUTFITS, FACTIONS, FACTION_STOCK, STOCK_KINDS, validateFactions, stockOpen, stockPrice } from '../src/data/factions.js';
import { STANDING_SIDES } from '../src/data/grounds/shape.js';
import { OPEN_HUNTS, OPEN_HALL_HUNTS } from '../src/data/hunts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Once this file is APPLIED it is history: a changed row moves OUT_NAME to a forward file, like every generated catalogue.
   (2027-04-22-faction-catalogue.generated.sql is the applied per-hero catalogue this one moves forward.) */
export const OUT_NAME = '1067-faction-company-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const MIN = 60000;
/* The Levels the SQL price is pinned at in the file's own §4: the JS answers, emitted as literals. */
const PIN_LEVELS = Object.freeze([1, 85, 200, 1000]);

/** The catalogue's rows, or a throw naming every problem. Pure. */
export function catalogueRows({ rules = FACTION_RULES, outfits = FACTION_OUTFITS, sides: factions = FACTIONS, stock = FACTION_STOCK,
  hunts = [...OPEN_HUNTS, ...OPEN_HALL_HUNTS], sides = STANDING_SIDES } = {}) {
  const problems = validateFactions(rules, outfits, factions, stock);
  const grounds = hunts.filter((h) => 'standingFor' in h).map((h) => ({ hunt: h.id, side: h.standingFor }));
  for (const g of grounds) if (!sides.includes(g.side)) problems.push(`${g.hunt} pays standing to ${g.side}, which is no side`);
  if (new Set(grounds.map((g) => g.hunt)).size !== grounds.length) problems.push('a hunt pays standing twice');
  if (problems.length) throw new Error('gen-factions: ' + problems.join('; '));
  return {
    sides: sides.map((id, ord) => ({ id, ord })),
    rule: { join: rules.joinAfter, swapMs: rules.swapHeroMinutes * MIN, cooldownMs: rules.swapCooldownDays * 24 * 60 * MIN,
      dayCapMs: rules.dayCapMinutes * MIN, frontCapMs: rules.frontCapHeroMinutes * MIN },
    grounds: grounds.sort((a, b) => (a.hunt < b.hunt ? -1 : 1)),
    pieces: Object.entries(outfits).map(([id, p], ord) => ({ id, side: p.side, needMs: p.hours * 60 * MIN, ord })),
    stock: Object.entries(stock).map(([id, p], ord) => ({ id, side: p.side, needMs: p.mark * MIN, kind: p.kind,
      wageHoursPm: STOCK_KINDS[p.kind].paid ? p.wageHoursPm : null, open: stockOpen(p), ord,
      pins: STOCK_KINDS[p.kind].paid ? PIN_LEVELS.map((L) => [L, stockPrice(id, L, stock)]) : [] })),
  };
}

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const KIND_IDS = Object.keys(STOCK_KINDS).map(lit).join(', ');
const FREE_KINDS = Object.entries(STOCK_KINDS).filter(([, k]) => !k.paid).map(([id]) => lit(id)).join(', ');

export function build(input) {
  const r = catalogueRows(input);
  const ids = r.sides.map((s) => lit(s.id)).join(', ');
  const groundRows = r.grounds.map((g) => `  (${lit(g.hunt)}, ${lit(g.side)})`).join(',\n');
  const pins = r.stock.flatMap((p) => p.pins.map(([L, gold]) => `    (${lit(p.id)}, ${L}, ${gold})`)).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- ${OUT_NAME} — THE TWO SIDES: WHO MAY JOIN, WHAT A SWAP COSTS, WHICH GROUND PAYS WHICH SIDE, WHAT EACH QUARTERMASTER KEEPS.
-- Generated by tools/gen-factions.mjs from src/data/factions.js and the hunt rows' \`standingFor\` (src/data/hunts.js).
--   Any hand edit FAILS \`node tools/gen-factions.mjs --check\`.
-- STATUS: supabase/migration-notes/${OUT_NAME}.json (STAGED until the Coordinator applies it). ORDER: the sequence in its name, before
--   1068-faction-company.sql, which reads every table here. Moves 2027-04-22-faction-catalogue.generated.sql (applied) forward.
-- THE DESIGN (docs/design/redesign/25-factions.md): the COMPANY holds the side. The rule's swap is company hero-minutes (40 h), the
--   week's cap is held for its close (ships with the social layer). hr_faction_stock is each quartermaster's stock: free outfit pieces and
--   paid hall and mount pieces, priced in thousandths of an hour of the wage at the company's top Level (hr_faction_piece_price, the twin
--   of src/data/factions.js stockPrice, pinned below at ${PIN_LEVELS.join(', ')}). A closed row (open false) waits for the system that shows it.
--   hr_faction_outfits stays the wearable pieces (the outfit catalogue's view, hr_outfits.pieces names them).
-- A row moves no value: the verbs and the settle read it under their locks, on the server's clock. hr_factions is upserted; the rule is one
-- row; the grounds, the outfits and the stock are rewritten whole, so a second apply is byte-identical. hr_faction_grounds holds OPEN
-- grounds only (a staged one is served nowhere). RLS on, no policy, no client grant: only SECURITY DEFINER functions read them.
-- ON THE EA SECURITY LIST (13-security-list.md N-10). REVERSIBLE: re-apply 2027-04-22-faction-catalogue.generated.sql's rows; drop
-- hr_faction_stock, hr_faction_piece_price and the rule's front_cap_ms after 1068-faction-company.sql's reversal.
-- ════════════════════════════════════════════════════════════════════════
do $mig$
begin
  if to_regprocedure('public.hr_wage(integer)') is null or to_regclass('public.hr_hunts') is null then
    raise exception 'PRECONDITION: the wage (1058-hunting-blocks-catalogue.generated.sql) and the hunt catalogue first'; end if;
end $mig$;

create table if not exists public.hr_factions (
  faction_id text primary key check (faction_id ~ '^[a-z0-9_]{1,32}$'),
  ord        int  not null
);
create table if not exists public.hr_faction_rule (
  id           boolean primary key default true check (id),
  join_monster text   not null check (join_monster ~ '^[a-z0-9_]{1,40}$'),
  swap_ms      bigint not null check (swap_ms > 0),
  cooldown_ms  bigint not null check (cooldown_ms >= 0),
  day_cap_ms   bigint not null check (day_cap_ms between 60000 and 86400000)
);
alter table public.hr_faction_rule add column if not exists front_cap_ms bigint check (front_cap_ms > 0);
create table if not exists public.hr_faction_grounds (
  hunt_id text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  faction text not null references public.hr_factions (faction_id)
);
create table if not exists public.hr_faction_outfits (
  piece_id text   primary key check (piece_id ~ '^[a-z0-9_]{1,32}$'),
  faction  text   not null references public.hr_factions (faction_id),
  need_ms  bigint not null check (need_ms > 0),
  ord      int    not null
);
create table if not exists public.hr_faction_stock (
  piece_id      text    primary key check (piece_id ~ '^[a-z0-9_]{1,32}$'),
  faction       text    not null references public.hr_factions (faction_id),
  need_ms       bigint  not null check (need_ms > 0),
  kind          text    not null check (kind in (${KIND_IDS})),
  wage_hours_pm bigint  check (wage_hours_pm between 1 and 1000000),
  open          boolean not null,
  ord           int     not null,
  check ((wage_hours_pm is null) = (kind in (${FREE_KINDS})))
);
do $$
declare t text;
begin
  foreach t in array array['hr_factions', 'hr_faction_rule', 'hr_faction_grounds', 'hr_faction_outfits', 'hr_faction_stock'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_factions is '${OUT_NAME}: the two sides (src/data/grounds/shape.js STANDING_SIDES). Upserted, never re-inserted: a company''s side points here.';
comment on table public.hr_faction_rule is '${OUT_NAME}: the join monster, the swap''s company hunting time, the swap cooldown, a hero''s day ceiling and the week''s company cap (src/data/factions.js FACTION_RULES), in ms.';
comment on table public.hr_faction_grounds is '${OUT_NAME}: each OPEN ground (and keyed hall) whose settled hunting time pays standing, and to which side (hunt rows'' standingFor).';
comment on table public.hr_faction_outfits is '${OUT_NAME}: the wearable pieces (src/data/factions.js FACTION_OUTFITS), the outfit catalogue''s view of hr_faction_stock.';
comment on table public.hr_faction_stock is '${OUT_NAME}: each quartermaster''s stock (src/data/factions.js FACTION_STOCK): side, mark, kind, price in wage-hour thousandths (null: free), open.';

insert into public.hr_factions (faction_id, ord) values
${r.sides.map((s) => `  (${lit(s.id)}, ${s.ord})`).join(',\n')}
on conflict (faction_id) do update set ord = excluded.ord;

insert into public.hr_faction_rule (id, join_monster, swap_ms, cooldown_ms, day_cap_ms, front_cap_ms) values
  (true, ${lit(r.rule.join)}, ${r.rule.swapMs}, ${r.rule.cooldownMs}, ${r.rule.dayCapMs}, ${r.rule.frontCapMs})
on conflict (id) do update set join_monster = excluded.join_monster, swap_ms = excluded.swap_ms, cooldown_ms = excluded.cooldown_ms,
  day_cap_ms = excluded.day_cap_ms, front_cap_ms = excluded.front_cap_ms;
alter table public.hr_faction_rule alter column front_cap_ms set not null;

delete from public.hr_faction_grounds;
${groundRows ? `insert into public.hr_faction_grounds (hunt_id, faction) values\n${groundRows};` : '-- (no open ground pays standing in the data: the Morrow Hills are not open)'}

delete from public.hr_faction_outfits;
insert into public.hr_faction_outfits (piece_id, faction, need_ms, ord) values
${r.pieces.map((p) => `  (${lit(p.id)}, ${lit(p.side)}, ${p.needMs}, ${p.ord})`).join(',\n')};

delete from public.hr_faction_stock;
insert into public.hr_faction_stock (piece_id, faction, need_ms, kind, wage_hours_pm, open, ord) values
${r.stock.map((p) => `  (${lit(p.id)}, ${lit(p.side)}, ${p.needMs}, ${lit(p.kind)}, ${p.wageHoursPm == null ? 'null' : p.wageHoursPm}, ${p.open}, ${p.ord})`).join(',\n')};

-- A side dropped from the data goes last, once nothing of the catalogue names it (a company's side still naming it refuses, loudly).
delete from public.hr_factions where faction_id <> all (array[${ids}]::text[]);

-- THE PRICE'S TWIN (internal): src/data/factions.js stockPrice. A paid piece costs wage_hours_pm thousandths of an hour of the wage at
-- the Level (the company's top hero's, read by the caller), rounded up; a free piece 0; no such piece null. Exact numeric.
create or replace function public.hr_faction_piece_price(p_piece text, p_level int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare s public.hr_faction_stock%rowtype;
begin
  select * into s from public.hr_faction_stock x where x.piece_id = p_piece;
  if not found then return null; end if;
  if s.wage_hours_pm is null then return 0; end if;
  return div(s.wage_hours_pm::numeric * public.hr_wage(greatest(1, coalesce(p_level, 1))) + 999, 1000)::bigint;
end $fn$;
revoke all on function public.hr_faction_piece_price(text, int) from public, anon, authenticated, service_role;

-- §4 SELF-CHECK: the sides, one rule, an open piece for each side, the wearable pieces inside the stock, every paying ground a hunt the
-- server knows, the price equal to the JS's at every pinned Level, and no client can read or write a table or run the price.
do $$
declare t text; v_role text; v_p record;
begin
  if (select count(*) from public.hr_factions) <> ${r.sides.length} then raise exception 'faction-catalogue §4: hr_factions does not hold the ${r.sides.length} sides'; end if;
  if not exists (select 1 from public.hr_faction_rule where id) then raise exception 'faction-catalogue §4: no rule row'; end if;
  if exists (select 1 from public.hr_factions f where not exists (select 1 from public.hr_faction_stock s where s.faction = f.faction_id and s.open)) then
    raise exception 'faction-catalogue §4: a side has no open piece to claim'; end if;
  if exists (select 1 from public.hr_faction_outfits o where not exists (select 1 from public.hr_faction_stock s
              where s.piece_id = o.piece_id and s.faction = o.faction and s.need_ms = o.need_ms and s.kind in (${FREE_KINDS}))) then
    raise exception 'faction-catalogue §4: a wearable piece is not a free stock row on its side at its mark'; end if;
  if exists (select 1 from public.hr_faction_grounds g where not exists (select 1 from public.hr_hunts h where h.hunt_id = g.hunt_id)) then
    raise exception 'faction-catalogue §4: a paying ground is no hunt the server serves'; end if;
  for v_p in select * from (values
${pins || "    ('', 0, 0)"}
  ) as x(piece, lv, gold) where x.piece <> '' loop
    if public.hr_faction_piece_price(v_p.piece, v_p.lv) is distinct from v_p.gold::bigint then
      raise exception 'faction-catalogue §4: % at Level % costs % on the server and % in src/data/factions.js', v_p.piece, v_p.lv,
        public.hr_faction_piece_price(v_p.piece, v_p.lv), v_p.gold; end if;
  end loop;
  if public.hr_faction_piece_price('zz_no_piece', 100) is not null then raise exception 'faction-catalogue §4: a piece that does not exist has a price'; end if;
  if exists (select 1 from public.hr_faction_stock s where s.wage_hours_pm is null and public.hr_faction_piece_price(s.piece_id, 100) <> 0) then
    raise exception 'faction-catalogue §4: a free piece has a price'; end if;
  foreach t in array array['hr_factions', 'hr_faction_rule', 'hr_faction_grounds', 'hr_faction_outfits', 'hr_faction_stock'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception 'faction-catalogue §4: a policy opens % to a client', t; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || t, 'select') or has_table_privilege(v_role, 'public.' || t, 'insert,update,delete') then
        raise exception 'faction-catalogue §4: % holds a grant on %', v_role, t; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_faction_piece_price(text,integer)', 'execute') then
      raise exception 'faction-catalogue §4: % may run hr_faction_piece_price', v_role; end if;
  end loop;
end $$;
`;
}

function selftest() {
  let bad = 0;
  try { catalogueRows(); } catch (e) { console.error('gen-factions --selftest: the tree is not clean: ' + e.message); process.exit(2); }
  const bites = (name, want, input) => {
    let msg = '';
    try { catalogueRows(input); } catch (e) { msg = e.message; }
    const hit = msg.includes(want);
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${name}`);
    if (!hit) bad++;
  };
  const R = FACTION_RULES, S = FACTION_STOCK;
  bites('a piece of no side', 'names no side', { stock: { ...S, zz: { side: 'the_crown', mark: 60, kind: 'outfit' } } });
  bites('a piece with no mark', 'no whole number of hero-minutes', { stock: { ...S, zz: { side: STANDING_SIDES[0], mark: 0, kind: 'outfit' } } });
  bites('a side with nothing open to claim', 'has no open piece', { stock: Object.fromEntries(Object.entries(S).filter(([, p]) => p.side !== STANDING_SIDES[1])) });
  bites('a piece that names a stat', 'gives no stat', { stock: { ...S, zz: { side: STANDING_SIDES[0], mark: 60, kind: 'outfit', hpPm: 10 } } });
  bites('a wearable piece the stock lacks', 'does not hold as it says', { outfits: { ...FACTION_OUTFITS, zz: { side: STANDING_SIDES[0], hours: 1 } } });
  bites('a swap of no time', 'swapHeroMinutes', { rules: { ...R, swapHeroMinutes: 0 } });
  bites('a week with no cap', 'frontCapHeroMinutes', { rules: { ...R, frontCapHeroMinutes: 0 } });
  bites('a day longer than a day', 'dayCapMinutes', { rules: { ...R, dayCapMinutes: 24 * 60 + 1 } });
  bites('a join monster that is no id', 'joinAfter', { rules: { ...R, joinAfter: 'Lord Krell' } });
  bites('an open ground paying no side', 'which is no side', { hunts: [{ id: 'zz_ground', standingFor: 'the_crown' }] });
  bites('one hunt paying twice', 'pays standing twice', { hunts: [{ id: 'zz_ground', standingFor: STANDING_SIDES[0] }, { id: 'zz_ground', standingFor: STANDING_SIDES[1] }] });
  /* a ground that pays emits its row, a staged one is never handed in (OPEN_HUNTS): the rows say what the input says */
  const two = catalogueRows({ hunts: [{ id: 'zz_b', standingFor: STANDING_SIDES[1] }, { id: 'zz_a', standingFor: STANDING_SIDES[0] }, { id: 'zz_c' }] }).grounds;
  const ok = two.length === 2 && two[0].hunt === 'zz_a' && two[1].side === STANDING_SIDES[1];
  console.log(`  ${ok ? 'CAUGHT' : 'MISSED'} paying grounds become rows, in id order, and a ground that pays nobody does not`);
  if (!ok) bad++;
  const sql = build({ hunts: [{ id: 'zz_a', standingFor: STANDING_SIDES[0] }] });
  const row = sql.includes(`insert into public.hr_faction_grounds (hunt_id, faction) values\n  ('zz_a', '${STANDING_SIDES[0]}');`);
  console.log(`  ${row ? 'CAUGHT' : 'MISSED'} a paying ground is one insert line a pack's diff can read (tools/pack/sql.mjs rowsOf)`);
  if (!row) bad++;
  /* every paid piece is pinned at every pinned Level to the JS's own price, and a closed piece is written closed */
  const rows = catalogueRows().stock;
  const paid = rows.filter((p) => p.wageHoursPm != null);
  const pinned = paid.length > 0 && paid.every((p) => p.pins.length === PIN_LEVELS.length && p.pins.every(([L, g]) => g === stockPrice(p.id, L) && g > 0))
    && build().includes(`(${lit(paid[0].id)}, ${PIN_LEVELS[1]}, ${stockPrice(paid[0].id, PIN_LEVELS[1])})`);
  console.log(`  ${pinned ? 'CAUGHT' : 'MISSED'} every paid piece's server price is pinned to src/data/factions.js stockPrice`);
  if (!pinned) bad++;
  const closed = rows.filter((p) => !p.open).every((p) => build().includes(`(${lit(p.id)}, ${lit(p.side)}, ${p.needMs}, ${lit(p.kind)}, ${p.wageHoursPm ?? 'null'}, false,`));
  console.log(`  ${closed ? 'CAUGHT' : 'MISSED'} a closed piece is written closed`);
  if (!closed) bad++;
  if (bad) { console.error(`gen-factions --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-factions --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8').catch(() => '');
    if (was.replace(/\r/g, '') !== build()) { console.error(`gen-factions --check: ${OUT_NAME} is stale; run node tools/gen-factions.mjs`); process.exit(1); }
    console.log('gen-factions --check: OK');
    return;
  }
  await writeFile(OUT, build());
  console.log('gen-factions: wrote ' + OUT_NAME);
}

/* GROUND PACKS: a whole file carries the base and the FOLDED ground packs only (tools/pack/whole.mjs), so a new pack re-issues nothing */
if (isMain(import.meta.url) && wholeViewOrRerun(import.meta.url, OUT_NAME)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
