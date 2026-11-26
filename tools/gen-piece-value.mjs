#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-piece-value.mjs — GENERATE THE PRICE THE STORE PAYS FOR A TRAIT PIECE (lane/t1b-piece-verbs, backend-architect, 2026-11-26;
// docs/design/redesign/13-market.md section 3.2, 20-v030-the-roads.md section 1.2).
//
// src/data is the one source of the price: src/data/gear-steps.js PIECE_VALUE (sharePm, rankValuePm), src/data/drop-hours.js
// DROP_HOURS.rarity (everyHours, as milli-hours) and src/core/piece-value.js (the formula). The store's floor share is the trades
// catalogue's (hr_trade_levers.floor_share_pm, generated from TRADE_LEVERS.store.floorShare by tools/gen-trades.mjs), read, not copied.
//   hr_piece_value_rules   one row: share_pm, rank_value_pm, sell_day (SELL_DAY below)
//   hr_piece_value_hours   every rarity the drop table authors hours for: hours_pm
//   hr_piece_store_bid(rarity, item_level, top_rank)   internal: the twin of piece-value.js pieceStoreBid, pinned in the self-check at
//                          every rarity x every rank x item Levels across the wage's range against the JS
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-piece-value.mjs            write OUT_NAME
//   node tools/gen-piece-value.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-piece-value.mjs --selftest every refusal bites
//
// REFUSES (throws, nothing written): a share or rank value outside 0..1000 permille, a rarity whose hours are not positive, a rarity the
// piece table does not hold, a JS twin that is not a whole non-negative number or that falls as the rank or the item Level climbs, a fuse
// under one sale.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1072-piece-verbs-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
/* THE FUSE (a server safety clamp, not a balance number): the most pieces one account may sell the store in a UTC day. An honest company
   of four finds about two a day at the drop table's rates (a Rare every 40 hunted hours a hero); twenty lets a week away sell in one
   visit, and caps what a defect upstream of the sale (a forged piece) could turn into gold in a day. */
export const SELL_DAY = 20;
/* the rarities trait_pieces holds (1071-trait-pieces.sql's check) */
const PIECE_RARITIES = ['rare', 'very_rare', 'signature'];
const PIN_LEVELS = [0, 1, 20, 40, 60, 80, 100, 140, 200, 500, 1000, 2000, 4000];

async function load(root) {
  const v = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + v);
  const [gs, dh, pv] = await Promise.all([imp('src/data/gear-steps.js'), imp('src/data/drop-hours.js'), imp('src/core/piece-value.js')]);
  return { gs, dh, pv };
}

const permille = (x) => Number.isInteger(x) && x >= 0 && x <= 1000;

/** The resolved rows of the data, refused on a defect. */
export function rowsOf({ gs, dh, pv }) {
  const P = gs.PIECE_VALUE;
  if (!permille(P.sharePm) || !permille(P.rankValuePm)) throw new Error('gen-piece-value: sharePm ' + P.sharePm + ' or rankValuePm ' + P.rankValuePm + ' is not a whole permille');
  if (!(Number.isInteger(SELL_DAY) && SELL_DAY >= 1)) throw new Error('gen-piece-value: the day fuse ' + SELL_DAY + ' is under one sale');
  const hours = [];
  for (const rarity of Object.keys(dh.DROP_HOURS.rarity).sort()) {
    const h = dh.DROP_HOURS.rarity[rarity].everyHours;
    if (h === undefined) continue;                       /* plain: a band, not a piece */
    if (!PIECE_RARITIES.includes(rarity)) throw new Error('gen-piece-value: rarity ' + rarity + ' has hours but no piece is of it');
    const pm = Math.round(Number(h) * 1000);
    if (!(pm > 0)) throw new Error('gen-piece-value: rarity ' + rarity + ' every ' + h + ' hours is not a positive time');
    if (pv.rarityHoursPm(rarity) !== pm) throw new Error('gen-piece-value: the core reads ' + rarity + ' as ' + pv.rarityHoursPm(rarity) + ' milli-hours, the data ' + pm);
    hours.push({ rarity, pm });
  }
  if (!hours.length) throw new Error('gen-piece-value: no rarity has hours');
  const ranks = gs.GEAR_STEPS.traitSteps.length;
  const pins = [];
  for (const { rarity } of hours) {
    let prevRank = -1;
    for (let rank = 1; rank <= ranks; rank++) {
      let prevIl = -1;
      for (const il of PIN_LEVELS) {
        const bid = pv.pieceStoreBid({ rarity, il, traits: rarity === 'signature' ? [] : [{ id: 'pin', rank }] });
        if (!Number.isSafeInteger(bid) || bid < 0) throw new Error('gen-piece-value: the JS bid for ' + rarity + ' rank ' + rank + ' at ' + il + ' is ' + bid);
        if (bid < prevIl) throw new Error('gen-piece-value: the bid for ' + rarity + ' rank ' + rank + ' falls as the item Level climbs to ' + il);
        prevIl = bid;
        pins.push({ rarity, il, rank: rarity === 'signature' ? 1 : rank, bid });
      }
      const at60 = pv.pieceStoreBid({ rarity, il: 60, traits: [{ id: 'pin', rank }] });
      if (rarity !== 'signature' && at60 < prevRank) throw new Error('gen-piece-value: the bid for ' + rarity + ' falls as the rank climbs to ' + rank);
      prevRank = at60;
      if (rarity === 'signature') break;
    }
  }
  return { share: P.sharePm, rankValue: P.rankValuePm, sellDay: SELL_DAY, hours, pins };
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const chunk = (rows, n) => { const out = []; for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n).join(', ')); return out.join(',\n    '); };

export function buildSql(r) {
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PRICE THE STORE PAYS FOR A TRAIT PIECE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-piece-value.mjs from src/data/gear-steps.js PIECE_VALUE, src/data/drop-hours.js DROP_HOURS.rarity and
--   src/core/piece-value.js. Any hand edit FAILS \`node tools/gen-piece-value.mjs --check\`.
--
-- WHAT (lane/t1b-piece-verbs, backend-architect, 2026-11-26; 13-market.md 3.2, 20-v030-the-roads.md 1.2): the numbers 1072-piece-verbs.sql
-- prices a sale with, so none is typed twice: hr_piece_value_rules (one row: share_pm ${r.share}, rank_value_pm ${r.rankValue}, sell_day ${r.sellDay}),
-- hr_piece_value_hours (${r.hours.length} rarities), rewritten whole; hr_piece_store_bid(rarity, item_level, top_rank), internal (no client grant),
-- the twin of piece-value.js pieceStoreBid, its floor share read from hr_trade_levers, pinned at ${r.pins.length} points (§3).
-- ORDER: 1072 in its name, before 1072-piece-verbs.sql (its reader). Idempotent: the tables are made if missing and their rows rewritten
-- whole, the function restated, so a second apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added. Catalogue tables, RLS on, no policy, no grant to any client role; one internal function revoked from every
-- client role. No value moves here. ON THE PRE-EA SECURITY LIST as the price of S-23 (a sale that mints gold).
-- REVERSIBLE: drop the function and the two tables (after 1072-piece-verbs.sql's readers are gone).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_trade_levers') is null or to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the trades catalogue and the wage first (hr_trade_levers, hr_wage)'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_piece_value_rules (
  id            boolean primary key default true check (id),
  share_pm      int not null check (share_pm between 0 and 1000),
  rank_value_pm int not null check (rank_value_pm between 0 and 1000),
  sell_day      int not null check (sell_day >= 1)
);
create table if not exists public.hr_piece_value_hours (
  rarity   text primary key check (rarity in ('rare', 'very_rare', 'signature')),
  hours_pm bigint not null check (hours_pm > 0)
);
do $mig$
declare t text;
begin
  foreach t in array array['hr_piece_value_rules', 'hr_piece_value_hours'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $mig$;
comment on table public.hr_piece_value_rules is '${OUT_NAME}: V of a Trait piece (13-market 3.2) and the store''s day fuse on piece sales. Generated; no client read.';
comment on table public.hr_piece_value_hours is '${OUT_NAME}: each piece rarity''s "one in about N hunted hours" (drop-hours.js), milli-hours. Generated; no client read.';

-- ── §2 THE ROWS (rewritten whole) ────────────────────────────────────────────
delete from public.hr_piece_value_hours where rarity not in (${r.hours.map((h) => q(h.rarity)).join(', ')});
insert into public.hr_piece_value_hours (rarity, hours_pm) values
  ${r.hours.map((h) => `(${q(h.rarity)}, ${h.pm})`).join(', ')}
on conflict (rarity) do update set hours_pm = excluded.hours_pm;
insert into public.hr_piece_value_rules (id, share_pm, rank_value_pm, sell_day) values (true, ${r.share}, ${r.rankValue}, ${r.sellDay})
on conflict (id) do update set share_pm = excluded.share_pm, rank_value_pm = excluded.rank_value_pm, sell_day = excluded.sell_day;

-- ── §2b THE TWIN (internal; plpgsql, so a call is plan-cached: tests/settle-budget.mjs SB-3) ──
create or replace function public.hr_piece_store_bid(p_rarity text, p_item_level int, p_top_rank int)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare r public.hr_piece_value_rules%rowtype; v_h bigint; v_floor int; v_v numeric;
begin
  -- PIECE-VALUE (${OUT_NAME}; src/core/piece-value.js pieceStoreBid): floor(floor_share x V / 1000), V = floor(share x hours x
  -- (1000 + rank_value x (top - 1)) x wage(item Level) / 10^9). null for a rarity with no hours: the store does not buy it.
  select * into r from public.hr_piece_value_rules where id;
  select h.hours_pm into v_h from public.hr_piece_value_hours h where h.rarity = p_rarity;
  select c.floor_share_pm into v_floor from public.hr_trade_levers c;
  if r.id is null or v_h is null or v_floor is null then return null; end if;
  v_v := div(r.share_pm::numeric * v_h * (1000 + r.rank_value_pm::numeric * (greatest(coalesce(p_top_rank, 1), 1) - 1))
             * public.hr_wage(case when p_item_level is null then 1 else p_item_level end), 1000000000);
  return div(v_floor::numeric * v_v, 1000)::bigint;
end $fn$;
revoke execute on function public.hr_piece_store_bid(text, int, int) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ─────────────────────────────────────────────
do $mig$
declare v_r record;
begin
  if (select count(*) from public.hr_piece_value_rules) <> 1 or (select count(*) from public.hr_piece_value_hours) <> ${r.hours.length} then
    raise exception 'VERIFY(a): the catalogue holds the wrong counts'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r)
              where has_table_privilege(g.r, 'public.hr_piece_value_rules', 'select') or has_table_privilege(g.r, 'public.hr_piece_value_hours', 'select')
                 or has_function_privilege(g.r, 'public.hr_piece_store_bid(text,integer,integer)', 'execute')) then
    raise exception 'VERIFY(b): a client role reads the piece price'; end if;
  for v_r in select * from (values
    ${chunk(r.pins.map((p) => `(${q(p.rarity)}, ${p.il}, ${p.rank}, ${p.bid}::bigint)`), 4)}) p(rarity, il, rank, bid) loop
    if public.hr_piece_store_bid(v_r.rarity, v_r.il, v_r.rank) is distinct from v_r.bid then
      raise exception 'VERIFY(c): a % rank % at item Level % sells for % in SQL, % in the core', v_r.rarity, v_r.rank, v_r.il,
        public.hr_piece_store_bid(v_r.rarity, v_r.il, v_r.rank), v_r.bid; end if;
  end loop;
  if public.hr_piece_store_bid('plain', 60, 1) is not null then raise exception 'VERIFY(c): the store prices a rarity with no hours'; end if;
  raise notice 'gen-piece-value: % rarities, the twin pinned at % points; all green', ${r.hours.length}, ${r.pins.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const tryRows = (name, patch) => {
    const m = patch(base);
    try { rowsOf({ ...base, ...m }); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  const P = base.gs.PIECE_VALUE, R = base.dh.DROP_HOURS.rarity;
  const gsWith = (pv) => ({ gs: { ...base.gs, PIECE_VALUE: { ...P, ...pv } } });
  const dhWith = (rar) => ({ dh: { ...base.dh, DROP_HOURS: { ...base.dh.DROP_HOURS, rarity: { ...R, ...rar } } } });
  tryRows('a share past 1000 permille', () => gsWith({ sharePm: 1001 }));
  tryRows('a fractional rank value', () => gsWith({ rankValuePm: 12.5 }));
  tryRows('a rarity of no hours', () => dhWith({ rare: { ...R.rare, everyHours: 0 } }));
  tryRows('hours on a rarity no piece is of', () => dhWith({ legendary: { everyHours: 900 } }));
  tryRows('a core that reads other hours than the data', () => ({ pv: { ...base.pv, rarityHoursPm: (r) => (r === 'rare' ? 1 : base.pv.rarityHoursPm(r)) } }));
  tryRows('a bid that falls as the item Level climbs', () => ({ pv: { ...base.pv, pieceStoreBid: (p) => (p.il === 4000 ? 1 : base.pv.pieceStoreBid(p)) } }));
  tryRows('a bid that falls as the rank climbs', () => ({ pv: { ...base.pv, pieceStoreBid: (p) => (p.il === 60 && p.traits[0] && p.traits[0].rank === 3 ? 0 : base.pv.pieceStoreBid(p)) } }));
  tryRows('a bid that is not a whole number', () => ({ pv: { ...base.pv, pieceStoreBid: (p) => base.pv.pieceStoreBid(p) + 0.5 } }));
  /* the twin is pinned at every rarity the table prices, where the rank and the item Level both move the price */
  { const r = rowsOf(base); if (!r.hours.every((h) => r.pins.some((p) => p.rarity === h.rarity)) || !r.pins.some((p) => p.rank === 3)) bites.push('the twin is not pinned at every rarity and rank'); }
  /* the SQL names the floor share the trades catalogue holds, never a typed one */
  { const sql = buildSql(rowsOf(base)); if (!/from public\.hr_trade_levers/.test(sql) || /floor_share_pm\s+int\b/.test(sql)) bites.push('the floor share is typed into this catalogue'); }
  if (bites.length) { console.error('gen-piece-value --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-piece-value --selftest: 8 refusals bite, the twin pinned at every rarity and rank, the floor share read from the trades catalogue');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-piece-value --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-piece-value.mjs'); process.exit(1); }
      console.log('gen-piece-value --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
