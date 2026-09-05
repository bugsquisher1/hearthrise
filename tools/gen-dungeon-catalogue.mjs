#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-dungeon-catalogue.mjs — GENERATE THE SERVER DUNGEON CATALOGUE.
//
// hr_dungeon_settle (2026-09-10-dungeon-settle.sql) credits scrip + run loot
// into player_state.dungeon_scrip / player_inventory server-side — otherwise the
// reward is a client mint (awardDungeonScrip / awardLoot → window.addItem) that
// BLOB_RETIRED wipes on reload (docs/design/dungeon-settlement.md §0/§2). To do
// that it needs a SERVER-KNOWN catalogue: each dungeon's required combat level,
// its cooldown, the entry key it consumes, the scrip base for a full clear, and
// its loot table (id, quantity range, drop chance, bop flag).
//
// Source of truth is src/data/dungeons.js (the SAME records the client card reads
// via window.DUNGEONS, published by src/main.js). Copying game DATA into SQL by
// hand is the src/main.js `unifyObject` failure; this file is machine-written
// from that single source and drift-guarded, so the copy cannot rot.
//
//   Regenerate:  node tools/gen-dungeon-catalogue.mjs
//   Verify:      node tools/gen-dungeon-catalogue.mjs --check   (run in run-smoke)
//
// ⚠ LOOT ORDER IS LOAD-BEARING. `ord` preserves the loot array index — the
// settle RPC salts each roll's PRNG with the ordinal, so the SAME absence
// replays to the SAME rolls (a dispute is resolvable from the ledger).
//
// ⚠ THE `bop` COLUMN IS INFORMATIONAL, not a control. Most dungeon loot is
// ordinary tradeable material (26 of 33 ids); only 7 signature spoils are BoP.
// That is FINE: hr_dungeon_settle rolls loot from the catalogue with the SERVER
// PRNG and DOES NOT scale it by any client value (only self-only scrip scales by
// the clamped p_quality). So loot is server-authored exactly like a combat drop,
// and no forged client value inflates it. The column is emitted so the RPC can
// carry it in the journal and so a future policy that wants BoP-only loot has the
// fact to assert against — see the settle migration's §0 for the reasoning.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DUNGEONS, dungeonScripBase, QM_STOCK } from '../src/data/dungeons.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'migrations', '2026-09-10-dungeon-catalogue.generated.sql');

const ID_RE = /^[a-z0-9_]+$/;

function rows() {
  const dungeons = [];
  const loot = [];
  for (const id of Object.keys(DUNGEONS)) {
    const d = DUNGEONS[id];
    if (!ID_RE.test(id)) throw new Error(`dungeon id ${id} is not [a-z0-9_]`);
    if (!d.kind || !ID_RE.test(d.kind)) throw new Error(`dungeon ${id} has no valid kind (${d.kind})`);
    if (!Number.isInteger(d.reqLv) || d.reqLv < 1) throw new Error(`dungeon ${id} reqLv is not a positive int (${d.reqLv})`);
    if (!Number.isInteger(d.cooldownH) || d.cooldownH < 0) throw new Error(`dungeon ${id} cooldownH invalid (${d.cooldownH})`);
    const costKey = d.cost && d.cost.key;
    if (!costKey || !ID_RE.test(costKey)) {
      throw new Error(`dungeon ${id} has no valid entry key cost.key (${costKey}) — the settle RPC consumes a key, so a keyless dungeon has no server-side entry gate`);
    }
    if (!ITEMS[costKey]) throw new Error(`dungeon ${id} entry key ${costKey} is not in ITEMS`);
    if (!Array.isArray(d.loot) || d.loot.length === 0) throw new Error(`dungeon ${id} has no loot`);
    const scripBase = dungeonScripBase(d.reqLv);
    if (!Number.isInteger(scripBase) || scripBase < 1) throw new Error(`dungeon ${id} scripBase invalid (${scripBase})`);
    dungeons.push({
      id, kind: d.kind, reqLv: d.reqLv, cooldownS: d.cooldownH * 3600,
      costKey, scripBase,
    });
    d.loot.forEach((l, ord) => {
      if (!l || !ID_RE.test(l.id)) throw new Error(`dungeon ${id} loot #${ord} id invalid (${l && l.id})`);
      const it = ITEMS[l.id];
      if (!it) throw new Error(`dungeon ${id} loot ${l.id} is not in ITEMS — hr_apply/settle would refuse an unknown item`);
      const q = l.qty;
      if (!Array.isArray(q) || q.length !== 2 || !Number.isInteger(q[0]) || !Number.isInteger(q[1])
          || q[0] < 1 || q[1] < q[0]) {
        throw new Error(`dungeon ${id} loot ${l.id} qty must be [min,max] ints with 1<=min<=max (${JSON.stringify(q)})`);
      }
      if (typeof l.chance !== 'number' || l.chance <= 0 || l.chance > 1) {
        throw new Error(`dungeon ${id} loot ${l.id} chance must be in (0,1] (${l.chance})`);
      }
      loot.push({
        dungeon: id, ord, item: l.id, qmin: q[0], qmax: q[1],
        chance: l.chance, bop: !!it.bop,
      });
    });
  }
  return { dungeons, loot };
}

/* ── THE QUARTERMASTER OFFERS (docs/design/dungeon-settlement.md §4) ──────────
   hr_qm_offers(offer_id pk, item_id, scrip_cost). The OFFER ID is `qm.<item_id>`
   — the `<namespace>.<row>` convention every other offer follows (equip.*, room.*),
   and the shape the Edge's OFFER_ID_RE / readOffer requires (a plain item id has
   no dot and would be rejected on the wire). Each offer grants one unit of the
   item after the dot; no item appears twice, so the id is unique. quartermaster_buy
   (2026-09-11-quartermaster-buy.sql) prices from this; the client sends only an
   offer_id and the SERVER owns the price + the item. */
function qmRows() {
  const seen = new Set();
  return QM_STOCK.map((o) => {
    if (!o || !ID_RE.test(o.id)) throw new Error(`QM offer item id invalid (${o && o.id})`);
    if (seen.has(o.id)) throw new Error(`QM offer ${o.id} appears twice — the item is the PK`);
    seen.add(o.id);
    if (!ITEMS[o.id]) throw new Error(`QM offer ${o.id} is not in ITEMS — quartermaster_buy would grant an unknown item`);
    if (!Number.isInteger(o.scrip) || o.scrip < 1) {
      throw new Error(`QM offer ${o.id} scrip must be a positive int (${o.scrip}) — a spend is never free or negative`);
    }
    return { offer: `qm.${o.id}`, item: o.id, scrip: o.scrip };
  });
}

export function render() {
  const { dungeons, loot } = rows();
  const qm = qmRows();
  const nD = dungeons.length;
  const nL = loot.length;
  const nQ = qm.length;
  const digest = createHash('sha256')
    .update(JSON.stringify({ dungeons, loot, qm })).digest('hex');

  const dVals = dungeons.map((d) =>
    `  ('${d.id}', '${d.kind}', ${d.reqLv}, ${d.cooldownS}, '${d.costKey}', ${d.scripBase})`
  ).join(',\n');
  const lVals = loot.map((l) =>
    `  ('${l.dungeon}', ${l.ord}, '${l.item}', ${l.qmin}, ${l.qmax}, ${l.chance}, ${l.bop})`
  ).join(',\n');
  const qVals = qm.map((o) =>
    `  ('${o.offer}', '${o.item}', ${o.scrip})`
  ).join(',\n');

  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SERVER DUNGEON CATALOGUE  (GENERATED — DO NOT EDIT)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Applied by the Coordinator after the
--     security review, in apply order (before 2026-09-10-dungeon-settle.sql,
--     which fails closed without these tables).
--
--   Generated by tools/gen-dungeon-catalogue.mjs from src/data/dungeons.js.
--   Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-dungeon-catalogue.mjs --check\` (a preflight in
--   tests/run-smoke.mjs).
--
--   dungeon-catalogue digest: ${digest}
--   ${nD} dungeons · ${nL} loot rows · ${nQ} Quartermaster offers
--   loot ord = src/data/dungeons.js loot index (the settle RPC salts each roll's
--   PRNG with the ordinal -> replayable).
--
-- Read by hr_dungeon_settle (2026-09-10-dungeon-settle.sql) to credit scrip +
-- run loot, and by quartermaster_buy (2026-09-11-quartermaster-buy.sql) to price
-- + grant a Quartermaster purchase. Numbers/ids only; no client value crosses.
-- Idempotent: delete+insert inside the migration transaction.
-- ════════════════════════════════════════════════════════════════════════

-- ── hr_dungeons: per-dungeon gate + scrip base ─────────────────────────────
do $$
begin
  if to_regclass('public.hr_dungeons') is null then
    create table public.hr_dungeons (
      dungeon_id text primary key,
      kind       text   not null,
      req_lv     int    not null check (req_lv >= 1),
      cooldown_s int    not null check (cooldown_s >= 0),
      cost_key   text   not null,
      scrip_base int    not null check (scrip_base >= 1)
    );
    alter table public.hr_dungeons enable row level security;
  end if;
  if to_regclass('public.hr_dungeon_loot') is null then
    create table public.hr_dungeon_loot (
      dungeon_id text    not null references public.hr_dungeons(dungeon_id) on delete cascade,
      ord        int     not null,
      item_id    text    not null,
      qty_min    int     not null check (qty_min >= 1),
      qty_max    int     not null check (qty_max >= qty_min),
      chance     numeric not null check (chance > 0 and chance <= 1),
      bop        boolean not null,
      primary key (dungeon_id, item_id)
    );
    alter table public.hr_dungeon_loot enable row level security;
  end if;
  if to_regclass('public.hr_qm_offers') is null then
    create table public.hr_qm_offers (
      offer_id   text primary key,
      item_id    text   not null,
      scrip_cost bigint not null check (scrip_cost >= 1)
    );
    alter table public.hr_qm_offers enable row level security;
  end if;
end $$;

-- Read-only catalogues: RLS on, NO client write grant. Kept UNREADABLE by
-- clients (SELECT revoked too): the client already has these numbers (it authored
-- them — src/data/dungeons.js is what the card renders), so exposing the table is
-- a second copy of a rate with no reader. Only SECURITY DEFINER functions read it.
do $$
begin
  revoke all on public.hr_dungeons     from public, anon, authenticated, service_role;
  revoke all on public.hr_dungeon_loot from public, anon, authenticated, service_role;
  revoke all on public.hr_qm_offers    from public, anon, authenticated, service_role;
end $$;

delete from public.hr_dungeon_loot;
delete from public.hr_dungeons;
delete from public.hr_qm_offers;
insert into public.hr_dungeons (dungeon_id, kind, req_lv, cooldown_s, cost_key, scrip_base) values
${dVals};
insert into public.hr_dungeon_loot (dungeon_id, ord, item_id, qty_min, qty_max, chance, bop) values
${lVals};
insert into public.hr_qm_offers (offer_id, item_id, scrip_cost) values
${qVals};

-- ── Self-verification ──────────────────────────────────────────────────────
do $$
declare v_d int; v_l int; v_q int; v_bad int;
begin
  select count(*) into v_d from public.hr_dungeons;
  if v_d <> ${nD} then raise exception 'hr_dungeons has % rows, expected ${nD}', v_d; end if;
  select count(*) into v_l from public.hr_dungeon_loot;
  if v_l <> ${nL} then raise exception 'hr_dungeon_loot has % rows, expected ${nL}', v_l; end if;
  select count(*) into v_q from public.hr_qm_offers;
  if v_q <> ${nQ} then raise exception 'hr_qm_offers has % rows, expected ${nQ}', v_q; end if;

  -- Every dungeon has at least one loot row and a positive scrip base.
  select count(*) into v_bad from public.hr_dungeons d
    where not exists (select 1 from public.hr_dungeon_loot l where l.dungeon_id = d.dungeon_id);
  if v_bad > 0 then raise exception '% dungeons have no loot rows', v_bad; end if;

  -- No client write policy may exist on any catalogue.
  select count(*) into v_bad from pg_policies
    where schemaname = 'public' and tablename in ('hr_dungeons','hr_dungeon_loot','hr_qm_offers')
      and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on the dungeon catalogue', v_bad; end if;

  -- No client grant beyond nothing (catalogues are engine-only reads).
  select count(*) into v_bad from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('hr_dungeons','hr_dungeon_loot','hr_qm_offers')
      and grantee in ('anon','authenticated','service_role','PUBLIC');
  if v_bad > 0 then raise exception '% client grants on the dungeon catalogue', v_bad; end if;
end $$;
`;
}

const wanted = render();
if (process.argv.includes('--check')) {
  const have = await readFile(OUT, 'utf8').catch(() => '');
  if (have.replace(/\r\n/g, '\n') !== wanted.replace(/\r\n/g, '\n')) {
    console.error('gen-dungeon-catalogue --check FAILED: '
      + '2026-09-10-dungeon-catalogue.generated.sql is stale. Run: node tools/gen-dungeon-catalogue.mjs');
    process.exit(1);
  }
  console.log('gen-dungeon-catalogue --check: catalogue matches src/data/dungeons.js');
} else {
  await writeFile(OUT, wanted);
  console.log(`wrote ${OUT}`);
}
