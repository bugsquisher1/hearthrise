#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-alpha-catalogue.mjs — THE SERVER CATALOGUE OF THE ALPHA SHOP,
// THE STAMINA REFILL AND THE BLESSINGS (lane S2).
//
// Three data files are the only source of these numbers; Postgres needs them
// to price a purchase by itself (a client never names a price):
//   src/data/supply-basics.js   SUPPLY_SHOP_OFFERS  -> hr_shop_supply_offers
//   src/data/stamina-refill.js  STAMINA_REFILL      -> hr_stamina_refill_rule
//   src/data/blessings.js       BLESSING_RULES/TIERS -> hr_blessing_rule, hr_blessing_tiers
//
//   Regenerate:  node tools/gen-alpha-catalogue.mjs
//   Verify:      node tools/gen-alpha-catalogue.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-alpha-catalogue.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a supply offer for an unknown item, for an
// item that is not a packable hunt supply (src/data/supplies.js), whose kind is
// not the item's own, whose basic row is unknown or not its partner, a price
// that is not the designer's rate (designerPrice: the basic's gold a point x the
// item's own points; a shot at its basic's price), a duplicate item; a tool that is not a
// tier-1 gathering tool; a GEAR row (the outfitter, designer 2026-10-22) for a slot a
// walked ground drops (SHOP_GEAR_SLOTS), a piece above Level 1, a bound piece, a field-salvage
// find, or one not at SHOP_PREMIUM x its book value; and any refill or blessing table its own
// validate() rejects.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPLY_SHOP_OFFERS, BASIC_INDEX, SHOP_PREMIUM, SHOP_GEAR_SLOTS } from '../src/data/supply-basics.js';
import { SUPPLIES } from '../src/data/supplies.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { STAMINA_REFILL, validate as validateRefill } from '../src/data/stamina-refill.js';
import { BLESSING_RULES, BLESSING_TIERS, validate as validateBlessings } from '../src/data/blessings.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE FORWARD FILE (lane/b-gold-sinks, 2026-10-22): 2026-10-25- and 2026-11-03-alpha-catalogue.generated.sql are
   APPLIED history, never regenerated; the outfitter's gear rows (designer 2026-10-22) land in this forward file,
   the same full delete+insert replace, with the kind check widened to 'gear'. */
export const OUT_NAME = '2026-11-20-alpha-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* The shop's word for a supply kind (what the Shop window files it under). */
const SHOP_KIND = Object.freeze({ heal: 'food', mana: 'drink', ammo: 'ammo' });

/** The designer's rate for a packed item: its basic's gold per point times the item's own
    points (heal or mana); a shot costs its basic's per-shot price. */
export function designerPrice(b, item) {
  if (b.kind === 'ammo') return b.price;
  const per = b.kind === 'heal' ? b.heals : b.mana;
  const own = b.kind === 'heal' ? Number(item.heals) : Number(item.mana);
  return Math.ceil(b.price * own / per);
}

/** Validated supply offer rows, or throw. */
export function supplyRows(offers = SUPPLY_SHOP_OFFERS, { items = ITEMS, supplies = SUPPLIES, basics = BASIC_INDEX, monsters = MONSTERS } = {}) {
  const seen = new Set();
  /* item -> the monster whose field-salvage row drops it (a salvage piece is never shop stock) */
  const salvaged = new Map();
  for (const [mid, m] of Object.entries(monsters)) for (const d of (m && m.drops) || []) if (d && d.salvage) salvaged.set(d.id, mid);
  return offers.map((o) => {
    if (!o || !/^[a-z0-9_]{1,64}$/.test(o.item) || o.offer !== 'supply.' + o.item) throw new Error(`supply offer ${o && o.offer} is not supply.<item id>`);
    if (seen.has(o.item)) throw new Error(`supply offer ${o.item} is listed twice`);
    seen.add(o.item);
    if (!own(items, o.item)) throw new Error(`supply offer ${o.item} names no item`);
    if (o.kind === 'tool') {
      /* A tier-1 gathering tool (Tyler 10-18), at the premium floor over its book value. */
      const it = items[o.item];
      if (it.type !== 'tool' || it.toolTier !== 1 || o.basic !== null) throw new Error(`tool offer ${o.item} is not a tier-1 gathering tool with no basic`);
      if (o.price !== SHOP_PREMIUM * Number(it.v)) throw new Error(`tool offer ${o.item} at ${o.price} g is not ${SHOP_PREMIUM} x its book value ${it.v}`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    if (o.kind === 'gear') {
      /* The outfitter (designer 2026-10-22): a Level-1, unbound piece for a slot no walked ground drops, at the
         premium over its book value (the vendor pays at most half the shop price: buy-then-sell loses). */
      const it = items[o.item];
      if (!SHOP_GEAR_SLOTS.includes(it.slot) || o.basic !== null) throw new Error(`gear offer ${o.item} (slot ${it.slot}) is not an outfitter slot (${SHOP_GEAR_SLOTS.join(', ')}) with no basic`);
      if ((Number(it.reqLv) || 1) > 1 || (Number(it.tier) || 1) > 1) throw new Error(`gear offer ${o.item} is above tier 1 / Level 1: better pieces come from drops and crafting`);
      if (it.bop || !(Number(it.v) > 0)) throw new Error(`gear offer ${o.item} is bound or has no book value`);
      if (salvaged.has(o.item)) throw new Error(`gear offer ${o.item} is a field-salvage find (${salvaged.get(o.item)}): never shop stock (tests/field-salvage.mjs (a))`);
      if (o.price !== SHOP_PREMIUM * Number(it.v)) throw new Error(`gear offer ${o.item} at ${o.price} g is not ${SHOP_PREMIUM} x its book value ${it.v}`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    if (!own(supplies, o.item)) throw new Error(`supply offer ${o.item} is not a packable hunt supply (src/data/supplies.js)`);
    if (SHOP_KIND[supplies[o.item].kind] !== o.kind) throw new Error(`supply offer ${o.item} is filed as ${o.kind}, the item is a ${supplies[o.item].kind}`);
    const b = basics[o.basic];
    if (!b || b.partner !== o.item) throw new Error(`supply offer ${o.item} names basic ${o.basic}, which is not its partner`);
    if (!Number.isSafeInteger(o.price) || o.price < 1) throw new Error(`supply offer ${o.item} has no positive integer price`);
    const want = designerPrice(b, items[o.item]);
    if (o.price !== want) throw new Error(`supply offer ${o.item} at ${o.price} g is not the designer's rate (${b.id}: ${want} g)`);
    return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
  });
}

function rules() {
  const bad = validateRefill().concat(validateBlessings());
  if (bad.length) throw new Error('refill / blessing tables are invalid: ' + bad.join('; '));
  return { refill: STAMINA_REFILL, bless: BLESSING_RULES, tiers: BLESSING_TIERS };
}

const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** md5 of the offer rows as the self-check folds them in SQL (byte order, as collate "C"). */
const offersMd5 = (offers) => createHash('md5').update([...offers]
  .sort((a, b) => Buffer.compare(Buffer.from(a.offer), Buffer.from(b.offer)))
  .map((o) => `${o.offer}:${o.item}:${o.kind}:${o.price}`).join(',')).digest('hex');

export function render(offers = supplyRows(), r = rules()) {
  const digest = createHash('sha256').update(JSON.stringify({ offers, refill: r.refill, bless: r.bless, tiers: r.tiers })).digest('hex');
  const R = r.refill;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ALPHA SHOP, STAMINA REFILL AND BLESSING CATALOGUE
-- (GENERATED by tools/gen-alpha-catalogue.mjs — DO NOT EDIT BY HAND; lane S2)
--
--   hr_shop_supply_offers   src/data/supply-basics.js SUPPLY_SHOP_OFFERS
--   hr_stamina_refill_rule  src/data/stamina-refill.js STAMINA_REFILL
--   hr_blessing_rule        src/data/blessings.js BLESSING_RULES
--   hr_blessing_tiers       src/data/blessings.js BLESSING_TIERS
--   digest ${digest}
--
-- Server-only: RLS on, NO policy, no client grant (the client reads src/data and
-- the envelope's quotes). Idempotent: delete + insert; nothing references these
-- rows by foreign key. Any hand edit FAILS \`node tools/gen-alpha-catalogue.mjs --check\`.
-- SUPERSEDES 2026-11-03-alpha-catalogue.generated.sql (applied; history, never
-- regenerated): the outfitter's six gear rows join the tools (designer ruling
-- 2026-10-22, lane/b-gold-sinks: leather gloves, a bronze belt, a cape,
-- earrings, a ring and a necklace, at 2 x book value); every other row is the
-- 11-03 file's. hr_shop_view lists them: 2026-11-20-shop-outfitter.sql.
-- ORDER: after 2026-11-09-armour-class-catalogue.generated.sql (needs hr_items, hr_hunt_supplies).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

do $pre$
begin
  if to_regclass('public.hr_items') is null or to_regclass('public.hr_hunt_supplies') is null then
    raise exception 'PRECONDITION: hr_items / hr_hunt_supplies are absent (apply the item and hunt catalogues first)'; end if;
end $pre$;

create table if not exists public.hr_shop_supply_offers (
  offer_id text primary key check (offer_id ~ '^supply\\.[a-z0-9_]{1,64}$'),
  item_id  text not null unique check (item_id ~ '^[a-z0-9_]{1,64}$'),
  kind     text not null check (kind in ('food', 'drink', 'ammo', 'tool', 'gear')),
  price    bigint not null check (price between 1 and 1000000000),
  constraint hr_shop_supply_offers_id_ck check (offer_id = 'supply.' || item_id)
);
create table if not exists public.hr_stamina_refill_rule (
  id        boolean primary key default true check (id),
  base      int not null check (base > 0),
  per_level int not null check (per_level >= 0),
  max_min   int not null check (max_min between 1 and 240),
  per_day   int not null check (per_day between 1 and 100),
  step_num  int not null check (step_num >= 0),
  step_den  int not null check (step_den > 0)
);
create table if not exists public.hr_blessing_rule (
  id               boolean primary key default true check (id),
  free_until_level int not null check (free_until_level between 1 and 200)
);
create table if not exists public.hr_blessing_tiers (
  tier      smallint primary key check (tier between 1 and 9),
  permille  int not null check (permille between 1 and 1000),
  base      int not null check (base > 0),
  per_level int not null check (per_level >= 0)
);
-- The outfitter's 'gear' kind (designer 2026-10-22): the 10-25 table was created with the four kinds before it.
alter table public.hr_shop_supply_offers drop constraint if exists hr_shop_supply_offers_kind_check;
alter table public.hr_shop_supply_offers add constraint hr_shop_supply_offers_kind_check
  check (kind in ('food', 'drink', 'ammo', 'tool', 'gear'));
alter table public.hr_shop_supply_offers enable row level security;
alter table public.hr_stamina_refill_rule enable row level security;
alter table public.hr_blessing_rule enable row level security;
alter table public.hr_blessing_tiers enable row level security;
revoke all on public.hr_shop_supply_offers, public.hr_stamina_refill_rule, public.hr_blessing_rule, public.hr_blessing_tiers
  from public, anon, authenticated, service_role;

delete from public.hr_shop_supply_offers;
insert into public.hr_shop_supply_offers (offer_id, item_id, kind, price) values
${offers.map((o) => `  (${sq(o.offer)}, ${sq(o.item)}, ${sq(o.kind)}, ${o.price})`).join(',\n')};

delete from public.hr_stamina_refill_rule;
insert into public.hr_stamina_refill_rule (id, base, per_level, max_min, per_day, step_num, step_den)
  values (true, ${R.base}, ${R.perLevel}, ${R.maxMinPerBuy}, ${R.perDay}, ${R.stepNum}, ${R.stepDen});

delete from public.hr_blessing_rule;
insert into public.hr_blessing_rule (id, free_until_level) values (true, ${r.bless.freeUntilLevel});
delete from public.hr_blessing_tiers;
insert into public.hr_blessing_tiers (tier, permille, base, per_level) values
${r.tiers.map((t) => `  (${t.tier}, ${t.xpLossReductionPermille}, ${t.base}, ${t.perLevel})`).join(',\n')};

-- §4 SELF-CHECK (CLAUDE.md §4): the rows are the data's, every offer sells a real
-- packable item, the tiers rise, and no client role reaches a table.
do $chk$
declare v_role text;
begin
  if (select count(*) from public.hr_shop_supply_offers) <> ${offers.length}
     or (select count(*) from public.hr_blessing_tiers) <> ${r.tiers.length}
     or (select count(*) from public.hr_stamina_refill_rule) <> 1 or (select count(*) from public.hr_blessing_rule) <> 1 then
    raise exception 'VERIFY: the alpha catalogue row counts are not the data''s'; end if;
  if (select md5(string_agg(offer_id || ':' || item_id || ':' || kind || ':' || price, ',' order by offer_id collate "C"))
        from public.hr_shop_supply_offers) is distinct from ${sq(offersMd5(offers))} then
    raise exception 'VERIFY: the supply offers are not the data''s rows and prices'; end if;
  if exists (select 1 from public.hr_shop_supply_offers o
              where not exists (select 1 from public.hr_items i where i.item_id = o.item_id)
                 or (o.kind not in ('tool', 'gear') and not exists (select 1 from public.hr_hunt_supplies s where s.item_id = o.item_id))) then
    raise exception 'VERIFY: a supply offer sells an item that is not a packable hunt supply (or a tool or gear)'; end if;
  if exists (select 1 from public.hr_shop_supply_offers o join public.hr_hunt_vendor_value v on v.item_id = o.item_id
              where o.kind in ('tool', 'gear') and v.unit * 2 > o.price) then
    raise exception 'VERIFY: the vendor bids more than half the shop price of a tool or gear piece (buy-then-sell would pay)'; end if;
  if exists (select 1 from public.hr_blessing_tiers a join public.hr_blessing_tiers b on b.tier = a.tier + 1
              where b.permille <= a.permille or b.base <= a.base) then
    raise exception 'VERIFY: a blessing tier does not protect more and cost more than the one below it'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_shop_supply_offers', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_stamina_refill_rule', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_blessing_rule', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_blessing_tiers', 'select,insert,update,delete') then
      raise exception 'VERIFY: % reaches an alpha catalogue table', v_role; end if;
  end loop;
  raise notice 'alpha catalogue: % supply offers, the refill rule, % blessing tiers; all green', ${offers.length}, ${r.tiers.length};
end $chk$;
`;
}

/* The outfitter's refusals, each planted on the first real gear row (designer 2026-10-22). */
function gearCases(base) {
  const at = base.findIndex((o) => o.kind === 'gear');
  if (at < 0) return [['no gear row to plant on', null]];
  const g = (patch) => base.map((o, i) => (i === at ? { ...o, ...patch } : o));
  const v = (id) => SHOP_PREMIUM * Number(ITEMS[id].v);
  return [
    ['gear for a slot a ground drops (a helmet)', g({ item: 'leather_helmet', offer: 'supply.leather_helmet', price: v('leather_helmet') })],
    ['gear above Level 1', g({ item: 'studded_belt', offer: 'supply.studded_belt', price: v('studded_belt') })],
    ['gear that is a field-salvage find', g({ item: 'apprentice_gloves', offer: 'supply.apprentice_gloves', price: v('apprentice_gloves') })],
    ['gear under the premium', g({ price: v(base[at].item) - 1 })],
    ['gear with a basic', g({ basic: 'salted_shrimp' })],
  ];
}

function selftest() {
  const base = SUPPLY_SHOP_OFFERS;
  const one = (patch) => base.map((o, i) => (i === 0 ? { ...o, ...patch } : o));
  const cases = [
    ['unknown item', one({ item: 'not_an_item', offer: 'supply.not_an_item' })],
    ['not packable', one({ item: 'bronze_sword', offer: 'supply.bronze_sword' })],
    ['wrong kind', one({ kind: 'ammo' })],
    ['basic not its partner', one({ basic: 'salted_trout' })],
    ['off the designer rate', one({ price: 18 })],
    ['offer id not supply.<item>', one({ offer: 'equip.cooked_shrimp' })],
    ['duplicate item', base.concat([base[0]])],
    ...gearCases(base),
  ];
  let bad = 0;
  for (const [why, rows] of cases) {
    try { supplyRows(rows); console.error(`  ✗ ${why}: NOT refused`); bad++; } catch { console.log(`  ✓ ${why}: refused`); }
  }
  try { supplyRows(); console.log('  ✓ the shipped rows pass'); } catch (e) { console.error('  ✗ the shipped rows are refused: ' + e.message); bad++; }
  if (bad) { console.error(`gen-alpha-catalogue --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log(`gen-alpha-catalogue --selftest: all ${cases.length + 1} cases right`);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const wanted = render();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = (await readFile(OUT, 'utf8')).replace(/\r\n/g, '\n'); } catch { /* absent */ }
    if (have !== wanted) {
      console.error(`gen-alpha-catalogue --check FAILED: ${OUT_NAME} is stale. Run: node tools/gen-alpha-catalogue.mjs`);
      process.exit(1);
    }
    console.log('gen-alpha-catalogue --check: catalogue matches src/data');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('wrote ' + OUT);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('gen-alpha-catalogue: ' + e.message); process.exit(1); });
