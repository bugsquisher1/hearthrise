#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-creation.mjs — A NEW HERO IS NAMED, COLOURED AND KITTED, ONCE.
//
// Tyler 2026-10-20: creating a hero is a short step (a name, colours for Head,
// Body, Legs and Feet, a preview that follows the picks), the hero enters the
// world only once named, and every new hero owns ALL six starter weapon sets.
// The same day (q02): the Shop sells NO supplies (food, drink, ammo); it keeps
// gear and tools, and supplies come from the action bar at the store price per use.
//
//   H-D  the data: the four regions equal the server's hr_base_regions(); the
//        six starter sets are in the kit, each plays its role, and no practice
//        item sells or trades (a fresh account mints no gold from its kit)
//   H-C  the client step: the preview repaints a region with the picked dye;
//        every server refusal reads as a sentence. H-C3: the Shop has no Refill
//        tab, Hunt prep no refill, the hunt summary no Restock, and the session
//        drops any supply offer a server still sends (the browser half of
//        2026-11-02-shop-no-supplies.sql; its server half is tests/alpha-server.mjs
//        A-NO-SUPPLY, the per-use bar charge tests/hunt-sessions-settle.mjs STORE)
//   H-S  the server, on the replayed chain as the client role: hr_create_hero
//        names, colours and kits a hero in one intent; the six sets are owned;
//        hr_load refuses an unnamed character (needs_name, with hero_slots);
//        refusals create nothing; a second apply of this file and of
//        2026-11-02-shop-no-supplies.sql is byte-identical
//
//   node tests/hero-creation.mjs            the guard
//   node tests/hero-creation.mjs --mutate   each planted defect must turn it red
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { ITEMS } from '../src/data/items.js';
import { START_INVENTORY, START_EQUIPMENT, STARTER_SETS } from '../src/data/start-kit.js';
import { BASE_REGIONS, BASE_DEFAULT_COLORS } from '../src/data/outfits.js';
import { roleForWeapon, roleWeaponOf } from '../src/data/hunt-roles.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { heroCells, refusalText } from '../src/app/hero-create.js';
import { shopOf } from '../src/session/item-sections.js';
import { renderShop } from '../src/shell/windows/shop.js';
import { renderHuntSummary } from '../src/shell/windows/hunt-summary.js';
import { renderHuntPrep } from '../src/shell/windows/hunt-prep.js';

const MIG = '2026-11-02-hero-creation.sql';
const SHOP_MIG = '2026-11-02-shop-no-supplies.sql';
/* What each starter set's weapon plays (hunt-roles.js), the set's purpose. */
const SET_ROLE = { tank: 'tank', dual_axes: 'melee_dps', club: 'melee_dps', mage: 'mage', ranger: 'ranger', healer: 'healer' };

// ── H-D ─────────────────────────────────────────────────────────────────────
export function checkData({ items = ITEMS, inv = START_INVENTORY, eq = START_EQUIPMENT, sets = STARTER_SETS, sql } = {}) {
  const out = [];
  const m = /array\[([^\]]*)\]::text\[\]/.exec(sql || '');
  const server = m ? m[1].split(',').map((s) => s.trim().replace(/'/g, '')) : null;
  if (JSON.stringify(server) !== JSON.stringify(BASE_REGIONS)) out.push(`H-D1 hr_base_regions() ${JSON.stringify(server)} != BASE_REGIONS ${JSON.stringify(BASE_REGIONS)}`);
  if (Object.keys(sets).length !== 6) out.push(`H-D2 ${Object.keys(sets).length} starter sets, not six`);
  const owned = new Set([...Object.keys(inv).filter((k) => inv[k] > 0), ...Object.values(eq)]);
  for (const [set, ids] of Object.entries(sets)) {
    for (const id of ids) {
      if (!owned.has(id)) out.push(`H-D2 ${set}: ${id} is not in the start kit`);
      const it = items[id];
      if (!it) { out.push(`H-D2 ${set}: ${id} is not an item`); continue; }
      if (!it.bop || vendorPriceOf(items, id) !== 0) out.push(`H-D3 ${id} sells for ${vendorPriceOf(items, id)} or trades (bop ${!!it.bop})`);
    }
    const weapon = ids.map((id) => items[id]).find((it) => it && it.slot === 'weapon');
    for (const id of ids) {
      const it = items[id];
      if (it && it.slot === 'weapon') {
        const role = roleForWeapon(roleWeaponOf(it));
        if (role !== SET_ROLE[set]) out.push(`H-D4 ${set}: ${id} plays ${role}, not ${SET_ROLE[set]}`);
      }
    }
    if (!weapon) out.push(`H-D4 ${set}: no weapon`);
  }
  return out;
}

// ── H-C ─────────────────────────────────────────────────────────────────────
const TOKENS = { 'hero-skin': '#dcae86', 'hero-skin-shade': '#b5835f', 'hero-outline': '#17141a' };
for (let i = 0; i < 16; i++) TOKENS['dye-' + i] = '#' + (i * 0x0f0f0f + 0x101010).toString(16).padStart(6, '0').slice(-6);
/* A server that still offers supplies (the pre-2026-11-02 shop section). */
const OLD_SHOP = { offers: [{ offer: 'supply.cooked_shrimp', item: 'cooked_shrimp', kind: 'food', price: 19 },
  { offer: 'supply.turnip_juice', item: 'turnip_juice', kind: 'drink', price: 8 }, { offer: 'supply.barbed_arrows', item: 'barbed_arrows', kind: 'ammo', price: 2 },
  { offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }], bids: {}, refill: { lines: [], total: 0 } };
const WINDOWS = { shop: renderShop, summary: renderHuntSummary, prep: renderHuntPrep };
export function checkClient({ cells = heroCells, text = refusalText, shop = shopOf, windows = WINDOWS } = {}) {
  const out = [];
  const colorOf = (t) => TOKENS[t];
  const a = cells(BASE_DEFAULT_COLORS, colorOf);
  for (const g of BASE_REGIONS) {
    const next = Object.assign({}, BASE_DEFAULT_COLORS, { [g]: (BASE_DEFAULT_COLORS[g] + 7) % 16 });
    const b = cells(next, colorOf);
    const changed = a.filter((c, i) => b[i] && String(b[i].rgb) !== String(c.rgb)).length;
    if (!changed) out.push(`H-C1 picking a new ${g} colour repainted nothing`);
    const other = BASE_REGIONS.find((x) => x !== g);
    const sameOther = cells(Object.assign({}, BASE_DEFAULT_COLORS, { [other]: BASE_DEFAULT_COLORS[other] }), colorOf);
    if (JSON.stringify(sameOther) !== JSON.stringify(a)) out.push('H-C1 the preview is not a function of the picks');
  }
  if (!a.length) out.push('H-C1 the preview paints no cell');
  for (const r of ['name_taken', 'slot_not_owned', 'rate_limited', 'already_created']) {
    const s = text({ ok: false, reason: r });
    if (!s || /could not be made|did not go through/.test(s)) out.push(`H-C2 ${r} reads as the generic failure`);
  }
  if (!/3 letters/.test(text({ ok: false, reason: 'bad_name', nameReason: 'short' }))) out.push('H-C2 a short name does not say why');
  // H-C3 no supplies for sale anywhere, no refill, no Restock.
  const sh = shop({ read: (k) => (k === 'shop' ? OLD_SHOP : undefined) });
  if (!sh || sh.offers.map((o) => o.item).join() !== 'bronze_axe' || 'refill' in sh) out.push('H-C3 the session reads the shop as ' + JSON.stringify(sh));
  if (/data-tab="refill"|data-hs-act="refill"/.test(windows.shop())) out.push('H-C3 the Shop still has a Refill');
  if (/data-hs-act="refill"/.test(windows.prep())) out.push('H-C3 Hunt prep still offers a refill');
  if (/restock/i.test(windows.summary())) out.push('H-C3 the hunt summary still offers Restock');
  return out;
}

// ── H-S ─────────────────────────────────────────────────────────────────────
/* A mutant also trips the file's own §6; it is skipped so THIS guard is what must see the defect. */
const SILENCE_SELF_CHECK = ["begin\n  -- The probe names are drawn until hr_create_hero would ACCEPT them",
  "begin\n  return;\n  -- The probe names are drawn until hr_create_hero would ACCEPT them"];
const SQL_MUTANTS = {
  no_name_gate: { why: 'hr_load lets an unnamed character into the world', pairs: [
    ["  if exists (select 1 from public.player_state where user_id = v_uid and slot = coalesce(p_slot, 0))\n     and not exists", "  if false and not exists"]] },
  dyes_unchecked: { why: 'any number is accepted as a dye', pairs: [
    ["       or not exists (select 1 from public.hr_outfit_dyes d where d.idx = (v_v #>> '{}')::int) then", '       or false then']] },
  name_not_claimed: { why: 'the hero is created but its name is never claimed', pairs: [
    ['    insert into public.character_names (user_id, slot, name, canonical, updated_at)\n      values (v_uid, p_slot, v_name, v_canon, now());', '    null;']] },
  colours_not_stored: { why: 'the colours are checked and dropped', pairs: [
    ["      values (v_uid, p_slot, null, '{}'::jsonb, p_colors, now())", "      values (v_uid, p_slot, null, '{}'::jsonb, '{}'::jsonb, now())"],
    ['on conflict (user_id, slot) do update set base_colors = excluded.base_colors, updated_at = now();', 'on conflict (user_id, slot) do nothing;']] },
};

export async function checkServer(mutant) {
  const out = [];
  const pairs = mutant ? [SILENCE_SELF_CHECK, ...SQL_MUTANTS[mutant].pairs] : null;
  let boot;
  try { boot = await bootReplay(pairs ? { patches: new Map([[MIG, pairs]]), upTo: MIG } : { upTo: SHOP_MIG }); }
  catch (e) {
    if (e && e.replay && mutant) return [`REPLAY: ${String(e.failures?.at(-1)?.error || e.message).slice(0, 200)}`];
    throw e;
  }
  const { db } = boot;
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    catch (e) { return { thrown: String(e.message).split('\n')[0] }; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const mk = async (tag) => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [uid, `${tag}@probe.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'hero-creation probe') on conflict do nothing", [uid]);
    return uid;
  };
  const idem = async () => (await q('select gen_random_uuid() as i'))[0].i;
  const colors = { head: 13, body: 5, legs: 3, feet: 0 };
  const create = async (uid, name, c = colors) => as(uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid) as r', [name, JSON.stringify(c), await idem()]);
  try {
    // B1: a second apply changes nothing.
    if (!mutant) {
      const bodies = async () => JSON.stringify((await db.query(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, coalesce(p.proacl::text, '') as acl
        from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows);
      for (const file of [MIG, SHOP_MIG]) {
        const sqlText = (await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8')).replace(/\r\n/g, '\n');
        const before = JSON.stringify([await inventory(db), await bodies()]);
        let err = null;
        try { await db.exec(`begin;\n${sqlText}\ncommit;`); } catch (e) { err = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
        if (err) out.push(`H-S0 a second apply of ${file} raised: ${err}`);
        if (before !== JSON.stringify([await inventory(db), await bodies()])) out.push(`H-S0 a second apply of ${file} changed the schema or a body`);
      }
    }
    // H-S1 the happy path.
    const A = await mk('hc-a');
    const r = await create(A, 'Marrowind');
    if (!r || r.ok !== true || r.name !== 'Marrowind') out.push(`H-S1 hr_create_hero answered ${JSON.stringify(r)}`);
    const load = await as(A, 'select public.hr_load(0) as r');
    if (!load || load.ok !== true || load.name !== 'Marrowind') out.push(`H-S1 the hero does not load by its name: ${JSON.stringify(load && (load.error || load.name))}`);
    const base = (load && load.outfit && load.outfit.base) || {};
    if (BASE_REGIONS.some((g) => base[g] !== colors[g]) || Object.keys(base).length !== BASE_REGIONS.length) out.push(`H-S1 the colours read back ${JSON.stringify(load && load.outfit)}`);
    const held = new Set((await q(`select item_id from public.player_inventory where user_id = $1 and slot = 0 and qty > 0
      union select item_id from public.player_equipment where user_id = $1 and slot = 0`, [A])).map((x) => x.item_id));
    for (const [set, ids] of Object.entries(STARTER_SETS)) for (const id of ids) if (!held.has(id)) out.push(`H-S2 the new hero lacks ${set}: ${id}`);
    // H-S3 no name, no world: an unnamed character (the old door) answers needs_name with the owned slots.
    const B = await mk('hc-b');
    await as(B, 'select public.hr_create_character(0) as r');
    const nb = await as(B, 'select public.hr_load(0) as r');
    if (!nb || nb.error !== 'needs_name' || !Array.isArray(nb.hero_slots)) out.push(`H-S3 an unnamed hero loads: ${JSON.stringify(nb && (nb.error || nb.ok))}`);
    const named = await create(B, 'Thistlewade');
    const nb2 = await as(B, 'select public.hr_load(0) as r');
    if (!named || named.ok !== true || !nb2 || nb2.ok !== true) out.push(`H-S3 naming the unnamed hero did not let it in: ${JSON.stringify(named)}`);
    // H-S4 refusals create nothing.
    const C = await mk('hc-c');
    const taken = await create(C, 'marrowind');
    if (!taken || taken.error !== 'name_taken') out.push(`H-S4 a taken name answered ${JSON.stringify(taken)}`);
    const dye = await create(C, 'Fenwhistle', { head: 13, body: 5, legs: 3, feet: 99 });
    if (!dye || dye.error !== 'bad_dye') out.push(`H-S4 an unknown dye answered ${JSON.stringify(dye)}`);
    const few = await create(C, 'Fenwhistle', { head: 13, body: 5, legs: 3 });
    if (!few || few.error !== 'bad_colors') out.push(`H-S4 three colours answered ${JSON.stringify(few)}`);
    const n = (await q('select count(*)::int n from public.player_state where user_id = $1', [C]))[0].n;
    if (n !== 0) out.push('H-S4 a refused creation left a character');
    const anon = await (async () => { await q('set role anon'); try { await db.query("select public.hr_create_hero(0, 'X', '{}'::jsonb, gen_random_uuid())"); return 'ran'; } catch (e) { return 'refused'; } finally { await db.query('reset role').catch(() => {}); } })();
    if (anon !== 'refused') out.push('H-S4 anon reaches hr_create_hero');
  } finally {
    await db.close?.().catch?.(() => {});
  }
  return out;
}

// ── data / client mutants (in memory) ──────────────────────────────────────
const DATA_MUTANTS = {
  kit_missing_crossbow: { why: 'the crossbow leaves the kit', run: (sql) => checkData({ sql, inv: Object.fromEntries(Object.entries(START_INVENTORY).filter(([k]) => k !== 'practice_crossbow')) }) },
  kit_sells: { why: 'a practice item is worth gold', run: (sql) => checkData({ sql, items: Object.assign({}, ITEMS, { practice_staff: Object.assign({}, ITEMS.practice_staff, { v: 80 }) }) }) },
  hatchets_tank: { why: 'the hatchets play the tank', run: (sql) => checkData({ sql, items: Object.assign({}, ITEMS, { practice_hatchets: Object.assign({}, ITEMS.practice_hatchets, { weaponType: 'sword' }) }) }) },
  regions_drift: { why: 'the server names a fifth region', run: (sql) => checkData({ sql: sql.replace("array['head', 'body', 'legs', 'feet']::text[]", "array['head', 'body', 'legs', 'feet', 'cape']::text[]") }) },
  preview_ignores_pick: { why: 'the preview paints the default colours whatever is picked', run: () => checkClient({ cells: (c, f) => heroCells(BASE_DEFAULT_COLORS, f) }) },
  shop_sells_food: { why: 'the session keeps a food offer a server still sends', run: () => checkClient({ shop: (cs) => ({ offers: cs.read('shop').offers, bids: new Map() }) }) },
  summary_restock: { why: 'the hunt summary offers Restock again', run: () => checkClient({ windows: { ...WINDOWS, summary: () => renderHuntSummary() + '<button data-hs-act="restock">Restock</button>' } }) },
};

if (isMain(import.meta.url)) {
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [k, m] of Object.entries(DATA_MUTANTS)) {
      const p = m.run(sql);
      console.log(`${p.length ? 'CAUGHT' : 'MISSED'} ${k}: ${m.why}${p.length ? ' -> ' + p[0] : ''}`);
      if (!p.length) missed++;
    }
    for (const [k, m] of Object.entries(SQL_MUTANTS)) {
      const p = await checkServer(k);
      console.log(`${p.length ? 'CAUGHT' : 'MISSED'} ${k}: ${m.why}${p.length ? ' -> ' + p[0] : ''}`);
      if (!p.length) missed++;
    }
    if (missed) { console.error(`hero-creation --mutate: ${missed} mutant(s) MISSED`); process.exit(1); }
    console.log('hero-creation --mutate: every planted defect is caught');
  } else {
    const problems = [...checkData({ sql }), ...checkClient(), ...await checkServer(null)];
    if (problems.length) { console.error('hero-creation: RED\n  ' + problems.join('\n  ')); process.exit(1); }
    console.log('hero-creation: a hero is named, coloured and given all six starter sets in one intent; no name, no world; the Shop sells no supplies and nothing refills; green');
  }
}
