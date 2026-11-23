#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-chest.mjs — THE HEARTH CHEST: A KEY FROM EVERY LANDING A RUN CLEARS (BOTH DOORS) UNDER ITS FAMILY'S HELD LIMIT, SIX OPENS A
//   FAMILY A WEEK, AN OPEN ON THE SERVER'S DICE AT THE DESIGN'S ODDS, THE HEARTH'S WARMTH AND THE STOKES, AND EVERY FORGED VALUE REFUSED
//   (lane/c-tower-chest; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §5; Tyler 2026-11-16, KEY FAMILIES: the weekly cap is
//   chests opened per family, not keys earned, with a held limit; src/data/chests.js, supabase/migrations/2027-04-27-tower-chest.sql). On the
//   replayed chain with the shipped engine.
//
//   node tests/tower-chest.mjs              the guard
//   node tests/tower-chest.mjs --arm=odds   one arm
//   node tests/tower-chest.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: src/data/chests.js, supabase/migrations/2027-04-27-tower-chest.sql, supabase/migrations/2027-04-30-sweeps-coat.sql, src/shell/windows/inventory/outfit-bundle.js
//
//   TCH-DATA    the table is Tyler's (16 / 8 / 4.5 / 2%, x1.7 / 2.5 / 3.3 for 3 / 7 / 12 keys' Cinders, +4% of base a dry key to 3x at 50);
//               the design's warmth table read back through src/data/chests.js; the server's chance (hr_chest_chance_ppm) and the data's
//               (chestChancePpm) agree on every key, warmth 0..60 and stoke 0..3; the open table (keyForLanding: the top row open-ended);
//               the salts are the highest tempering tier's at or under each key's weapons (the coherence pass's C4); the catalogue rows
//               are the data's; the load-time rule refuses a higher key with better odds; every key in the Tower family, its caps the
//               data's and Tyler's six a week, the open table read inside the Tower family alone
//   TCH-ODDS    the server's roll (hr_chest_roll) over 20,000 keys a cell: a weapon at the chance it was handed (each key's base, a warm and
//               stoked cell), within 4.5 standard deviations; half the weapons the family worn, the rest even over the other six; no family
//               worn, even over all seven
//   TCH-MINT    a climb past its landings, BOTH PATHS (CLAUDE.md §4: the browser closed, the world tick; the hunt viewed, the player's
//               settle): one key a landing the run cleared in the bag (the landing's own key row), one tower_key ledger row each, the two
//               doors alike; a second climb the same week through the same landings mints them AGAIN (no weekly earn cap); the open
//               table on a run's own row, split over windows, each landing once
//   TCH-HELD    the held limit: a hero at the Tower family's held_max (bag plus Storage) gets no new key, the skip journalled with no item;
//               under it again, keys drop again; keys of another family never count
//   TCH-RING    THE KEY RING (lane/c-key-ring, Tyler 2026-11-16), the happy path: locked, the section offers it at the server's price; the
//               real spend RPC (hr_unlock_buy key_ring.0) charges the price once (a replay charges nothing) and moves the bag's keys onto
//               the ring; a key minted after it lands on the ring and the bag's stack count does not move; a reload (hr_load) still shows the
//               ring and its keys and no key in the bag (hr_state_of, the envelope hr_load answers); the held count counts ring keys; a key opens from the ring (ring first); ring keys
//               go into Storage; a hero short of gold is refused and gets no ring; while the Tower is hidden a hand-made unlock_buy is
//               refused feature_off with the purse untouched; a key withdrawn from Storage into a FULL bag lands on the ring (bag_full
//               without one)
//   TCH-OPEN    the open on a real hero: a key's chance is the base x its warmth x its stoke, the warmth grows by a dry key and caps at 3x,
//               a weapon cools it to nothing; a stoke multiplies the chance and burns its Cinders from the bag, then Storage, net of what
//               the press paid; a press short of Cinders stokes what they cover; the saved default stokes a key sent with none; the
//               haul is the key's row; every move journalled
//   TCH-FORGED  a forged chest, key, count or stoke, a key with no weapons built, a count over the keys held, a used key, a replayed key,
//               a key reused for another press, a hero in a hunt, a full bag (before any roll) and the family's week (six opens since Monday
//               00:00 UTC; last week's and another family's opens never count) are each refused and move nothing; the client can call the two verbs and none of the helpers, and no verb takes a chance, warmth or family
//   TCH-OUTFIT  THE SWEEP'S COAT (lane/c-sweeps-coat-drop; Tyler 2026-11-14, a super-rare outfit from any chest): the data's 0.2 / 0.3 /
//               0.4 / 0.5% on the server's rows, the bundle a tradeable item of book value; the server's outfit roll over 20,000 keys at
//               each key's chance, on its own stream (even odds with the weapon's roll meet a quarter of the time); a near miss finds
//               nothing; a seeded open finds the coat through the verb (its bundle in the bag, the row's outfit and roll, ONE System line
//               naming the key's metal; a replay none; a quiet hero none); the bag's worst case counts the bundle before any roll; the
//               bundle used (2027-04-30-sweeps-coat.sql hr_outfit_bundle_use): one taken, owned, worn, a reload says so, journalled once,
//               a replay moves nothing, a second bundle on an owned coat is kept (already_owned); a hero with none can't own, wear or use it
//   TCH-SELFCHECK the migration's own §9 passes on a pinned prng secret whose first probe key already finds the outfit (it rolls on a
//               random secret every replay, so it must pass on all of them; lane/fix135-chest-midnight)
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const C = (await import('./tower-climb.mjs')).HARNESS;
const { one, q } = H;
const ROOT = H.ROOT;
const UID = C.UID;
const V = sourceQuery(ROOT);
const idem = () => crypto.randomUUID();
const N = 20000;   // keys a cell in TCH-ODDS
const Z = 4.5;     // the measurement's tolerance, in standard deviations

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { ...(await C.load(root)), CH: await import(u('src/data/chests.js') + V), GT: await import(u('src/data/gear-tiers.js') + V),
    TM: await import(u('src/data/temper.js') + V), ITEMS: (await import(u('src/data/items.js') + V)).ITEMS, root };
}

/* the signed-in hero calls a verb (its rate counters cleared first: the arms call far more often than a player) */
async function call(db, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID]);
  const r = await one(db, sql, params);
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  return r;
}
const open = (db, key, count, stokes, id = idem(), chest = 'great_hearth') =>
  call(db, 'select public.hr_chest_open(0, $1, $2, $3, $4, $5::uuid)', [chest, key, count, stokes, id]);

/* a hero at Level 12 with the bag `inv`, the switch on for it, and seven stand-in weapons on each key in `ready` (the tier's standard
   weapon a family: gear-tiers.js WEAPON_FAMILIES), so the open can play before the tower weapons are built. The arms that measure the
   odds and the open use hundreds of keys, so the families' weekly cap is lifted for them (`week`: in their own rolled-back transaction);
   TCH-FORGED keeps the catalogue's cap and proves it. */
async function hero(db, M, inv = {}, ready = ['bronze', 'silver', 'gold', 'platinum'], week = 1000) {
  if (week !== null) await db.query('update public.hr_chest_key_families set opens_per_week = $1, held_max = greatest(held_max, $1)', [week]);
  await H.character(db, M, UID, { level: 12, inv, gold: 0 });
  await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
  for (const k of M.CH.CHEST_KEYS.filter((x) => ready.includes(x.id))) {
    for (const f of M.GT.WEAPON_FAMILIES) {
      const item = f.ids[k.weaponTier - 1];
      if (item) await db.query('insert into public.hr_chest_weapons (key_id, family, item_id) values ($1, $2, $3) on conflict do nothing', [k.id, f.key, item]);
    }
  }
  await db.query('update public.player_state set bank_cap = 200 where user_id = $1 and slot = 0', [UID]);
}
const bag = async (db, item) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [UID, item]));
const store = async (db, item) => Number(await one(db, 'select coalesce((select qty from public.account_bank where user_id = $1 and item_id = $2), 0)', [UID, item]));
const opensOf = (db) => q(db, 'select n, key_id, stokes, cinders_spent, dry, chance_ppm, roll, family, weapon from public.chest_opens where user_id = $1 order by n', [UID]);

/* ── TCH-DATA ─────────────────────────────────────────────────────────────── */
async function dataArm(db, M) {
  const bad = [];
  const { CHEST_KEYS: K, CHEST_LUCK: L, KEY_FAMILIES: KF, chestChancePpm, keyForLanding, keySalts, validateChests, stokeCost } = M.CH;
  const by = Object.fromEntries(K.map((k) => [k.id, k]));
  /* Tyler's numbers (2026-11-14) */
  const rows = K.map((k) => `${k.id}@${k.from}=${k.weaponPm}`).join(',');
  /* the first landing and the odds are generated (lane/tower-boss-formula): the landing whose floor Level reaches the weapons' item Level, and
     the chance halved a metal; the oracle re-derives both from the floors' Level row and the gear table */
  const lvlPm = M.TD.TOWER_RULES.steps.levelPm, every = M.TD.TOWER_RULES.landingEvery;
  const firstAt = (iL) => { let f = every; while (Math.ceil((f * lvlPm) / 1000) < iL) f += every; return f; };
  const gen = K.map((k, i) => `${k.id}@${firstAt(20 * k.weaponTier)}=${Math.round(160 / 2 ** i)}`).join(',');
  if (rows !== gen || rows !== 'bronze@40=160,silver@80=80,gold@120=40,platinum@140=20') bad.push('TCH-DATA the key table reads ' + rows + ' (the formulas: ' + gen + ')');
  if (JSON.stringify(L.stokes) !== JSON.stringify([{ pm: 1700, keys: 3 }, { pm: 2500, keys: 7 }, { pm: 3300, keys: 12 }])) bad.push('TCH-DATA the stokes read ' + JSON.stringify(L.stokes));
  if (L.warmthStepPm !== 40 || L.warmthCapPm !== 3000 || L.ownPm !== 500) bad.push(`TCH-DATA the warmth is ${L.warmthStepPm} a dry key to ${L.warmthCapPm}, own ${L.ownPm}`);
  /* the key families (Tyler 2026-11-16): every Tower key in one family, the Catacombs' in their own (lane/c-catacombs); six opened a week each;
     a held limit of at least a week's opens; each behind its own switch */
  if (K.some((k) => k.family !== 'tower') || Object.keys(KF).sort().join(',') !== 'catacomb,tower' || Object.values(KF).some((x) => x.opensPerWeek !== 6 || !(x.heldMax >= x.opensPerWeek))
      || KF.tower.switch !== 'burning_tower' || KF.catacomb.switch !== 'unmarked_catacombs' || M.CH.CATACOMB_KEYS.some((k) => k.family !== 'catacomb')) {
    bad.push('TCH-DATA the key families read ' + JSON.stringify({ keys: K.map((k) => k.family), families: KF }));
  }
  const kfDb = await q(db, 'select key_family, opens_per_week, held_max, switch_id from public.hr_chest_key_families order by key_family');
  const kfWant = Object.values(KF).map((f) => [f.id, f.opensPerWeek, f.heldMax, f.switch].join(':')).sort().join('|');
  if (kfDb.map((r) => [r.key_family, r.opens_per_week, r.held_max, r.switch_id].join(':')).join('|') !== kfWant) bad.push(`TCH-DATA hr_chest_key_families reads ${JSON.stringify(kfDb)}, the data ${kfWant}`);
  /* the open table is the Tower family's alone: a later family's row starting low never hands out a Tower landing's key */
  const other = [...K, { ...K[3], id: 'deep_wing', family: 'catacomb', item: 'deep_wing_key', from: 10 }];
  if (keyForLanding(150, other).id !== 'platinum' || keyForLanding(40, other).id !== 'bronze') bad.push('TCH-DATA the open table read another family\'s row for a Tower landing');
  if (!validateChests(K.map((k, j) => (j === 1 ? { ...k, family: 'arena' } : k))).some((x) => x.includes('is no key family'))) bad.push('TCH-DATA the table let a key of no family load');
  /* the design's warmth table (the board's §5 "(a) The Hearth's warmth"), in hundredths of a percent */
  const table = { bronze: [1600, 1920, 2240, 2880, 3840, 4800], silver: [800, 960, 1120, 1440, 1920, 2400], gold: [400, 480, 560, 720, 960, 1200], platinum: [200, 240, 280, 360, 480, 600] };
  for (const [id, want] of Object.entries(table)) {
    const got = [0, 5, 10, 20, 35, 50].map((d) => chestChancePpm(by[id], d, 0) / 100);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`TCH-DATA ${id}'s warmth reads ${got}, the design's ${want}`);
    if (chestChancePpm(by[id], 80, 0) !== chestChancePpm(by[id], 50, 0)) bad.push(`TCH-DATA ${id}'s warmth does not cap at 50`);
  }
  /* the stoke table's prices (the design's 150 / 350 / 600 ... 1,800 / 4,200 / 7,200) */
  const prices = K.map((k) => [1, 2, 3].map((s) => stokeCost(k, s)).join('/')).join(' ');
  if (prices !== '150/350/600 450/1050/1800 900/2100/3600 1800/4200/7200') bad.push('TCH-DATA the stokes cost ' + prices);
  /* the server's sum and the data's agree */
  const cells = [];
  for (const k of K) for (let d = 0; d <= 60; d += 3) for (let s = 0; s <= 3; s++) cells.push([k.weaponPm, d, s, chestChancePpm(k, d, s)]);
  const sql = await q(db, 'select b, d, s, public.hr_chest_chance_ppm(b, d, s) as c from jsonb_to_recordset($1::jsonb) as t(b int, d int, s int)',
    [JSON.stringify(cells.map(([b, d, s]) => ({ b, d, s })))]);
  const off = sql.filter((r, i) => Number(r.c) !== cells[i][3]);
  if (off.length) bad.push(`TCH-DATA the server's chance differs from the data's on ${off.length} cell(s): ${JSON.stringify(off[0])} vs ${cells[sql.indexOf(off[0])][3]}`);
  if ((await one(db, 'select public.hr_chest_chance_ppm(160, 0, 4)')) !== null) bad.push('TCH-DATA a stoke count no row has priced a chance');
  /* the open table */
  const lands = [40, 70, 80, 110, 120, 130, 140, 200, 1500].map((l) => keyForLanding(l).id).join(',');
  if (lands !== 'bronze,bronze,silver,silver,gold,gold,platinum,platinum,platinum' || keyForLanding(30) !== null) bad.push('TCH-DATA the landings hand out ' + lands);
  const sqlLands = await one(db, `select string_agg((select k.key_id from public.hr_chest_keys k where k.ground = 'the_burning_tower' and k.from_landing <= l order by k.from_landing desc limit 1), ',' order by l)
    from unnest(array[40, 70, 80, 110, 120, 130, 140, 200, 1500]) l`);
  if (sqlLands !== lands) bad.push('TCH-DATA the server\'s open table reads ' + sqlLands);
  /* C4: the salts of the highest tempering tier at or under the key's weapons, never a tier under the hero's gear when a ladder exists */
  const tiers = Object.keys(M.TM.TEMPER_MATERIALS).map(Number);
  for (const k of K) {
    const t = Math.max(...tiers.filter((x) => x <= k.weaponTier));
    if (keySalts(k) !== M.TM.TEMPER_MATERIALS[t].item) bad.push(`TCH-DATA ${k.id} pays ${keySalts(k)}, not tier ${t}'s ${M.TM.TEMPER_MATERIALS[t].item}`);
  }
  /* the catalogue rows are the data's */
  const cat = await q(db, "select key_id, key_family, item_id, from_landing, weapon_pm, cinders, salts_item, salts_qty, food_item, food_qty, skill_plus from public.hr_chest_keys where key_family = 'tower' order by key_family, from_landing");
  const want = K.map((k) => [k.id, k.family, k.item, k.from, k.weaponPm, k.cinders, keySalts(k), k.saltsQty, k.food, k.foodQty, k.skillPlus].join(':')).join('|');
  const got = cat.map((r) => [r.key_id, r.key_family, r.item_id, r.from_landing, r.weapon_pm, r.cinders, r.salts_item, r.salts_qty, r.food_item, r.food_qty, r.skill_plus].join(':')).join('|');
  if (got !== want) bad.push(`TCH-DATA hr_chest_keys reads ${got}, the data ${want}`);
  /* the keys and the Cinders are bound items of no value (the market, the shop and the dispatch refuse them) */
  const items = await q(db, "select item_id, tradeable, value from public.hr_items where item_id like 'tower\\_key\\_%' or item_id = 'tower_cinders' order by item_id");
  if (items.length !== 5 || items.some((r) => r.tradeable !== false || Number(r.value) !== 0)) bad.push('TCH-DATA the keys or the Cinders trade: ' + JSON.stringify(items));
  /* the load-time rule */
  const swap = (i, row) => K.map((k, j) => (j === i ? { ...k, ...row } : k));
  if (!validateChests(swap(2, { weaponPm: 90 })).some((p) => p.includes('odds fall'))) bad.push('TCH-DATA the table let a higher key roll better odds');
  if (!validateChests(swap(1, { cinders: 10 })).some((p) => p.includes('no more Cinders'))) bad.push('TCH-DATA the table let a higher key hold less');
  return bad;
}

/* ── TCH-ODDS ─────────────────────────────────────────────────────────────── */
async function oddsArm(db, M) {
  const bad = [];
  const FAMS = M.CH.WEAPON_FAMILY_KEYS;
  const by = Object.fromEntries(M.CH.CHEST_KEYS.map((k) => [k.id, k]));
  const cells = [['bronze', 0, 0], ['silver', 0, 0], ['gold', 0, 0], ['platinum', 0, 0], ['platinum', 50, 3], ['silver', 12, 1]];
  for (const [id, dry, st] of cells) {
    const chance = M.CH.chestChancePpm(by[id], dry, st);
    for (const own of ['bow', null]) {
      const groups = await q(db, `select (r->>'weapon')::boolean as w, r->>'family' as fam, count(*)::int as n
          from (select public.hr_chest_roll($1, 0, n, $2, $3, $4::text[]) r from generate_series(1, $5) n) x group by 1, 2`,
        [UID, chance, own, FAMS, N]);
      const fams = Object.fromEntries(groups.filter((g) => g.w).map((g) => [g.fam, g.n]));
      const r = { hits: groups.filter((g) => g.w).reduce((a2, g) => a2 + g.n, 0) };
      const hits = Number(r.hits), p = chance / 1e6;
      const z = (hits - N * p) / Math.sqrt(N * p * (1 - p));
      const tag = `TCH-ODDS ${id} warm ${dry} stoked ${st} (${(p * 100).toFixed(2)}%), ${own ? 'wearing a ' + own : 'no weapon worn'}`;
      if (!(Math.abs(z) < Z)) bad.push(`${tag}: ${hits} weapons in ${N} keys, ${(hits / N * 100).toFixed(2)}% (z ${z.toFixed(1)})`);
      if (own === 'bow' && id !== 'bronze') continue;   /* the family split is read on the cells with the most weapons */
      const total = Object.values(fams).reduce((a, b) => a + b, 0);
      if (total !== hits) bad.push(`${tag}: ${hits} weapons, ${total} with a family`);
      const share = (f, w) => { const n = fams[f] || 0; const zz = (n - total * w) / Math.sqrt(total * w * (1 - w)); if (!(Math.abs(zz) < Z)) bad.push(`${tag}: ${f} is ${n} of ${total} weapons (want ${(w * 100).toFixed(1)}%, z ${zz.toFixed(1)})`); };
      if (own) { share(own, 0.5); for (const f of FAMS) if (f !== own) share(f, 0.5 / (FAMS.length - 1)); }
      else for (const f of FAMS) share(f, 1 / FAMS.length);
      if (Object.keys(fams).some((f) => !FAMS.includes(f))) bad.push(`${tag}: a family no key has: ${Object.keys(fams)}`);
    }
  }
  /* a sure thing is sure, nothing is nothing, and the same hero's n-th key rolls the same number every time it is asked */
  const sure = Number(await one(db, `select count(*) filter (where (public.hr_chest_roll($1, 0, n, 1000000, null, $2::text[])->>'weapon')::boolean) from generate_series(1, 500) n`, [UID, FAMS]));
  const none = Number(await one(db, `select count(*) filter (where (public.hr_chest_roll($1, 0, n, 0, null, $2::text[])->>'weapon')::boolean) from generate_series(1, 500) n`, [UID, FAMS]));
  if (sure !== 500 || none !== 0) bad.push(`TCH-ODDS a sure chance found ${sure} of 500, no chance ${none}`);
  const a = await one(db, `select public.hr_chest_roll($1, 0, 77, 160000, 'bow', $2::text[])`, [UID, FAMS]);
  const b = await one(db, `select public.hr_chest_roll($1, 0, 77, 160000, 'bow', $2::text[])`, [UID, FAMS]);
  if (JSON.stringify(a) !== JSON.stringify(b)) bad.push('TCH-ODDS one key rolled twice read two numbers');
  /* END TO END: 200 Bronze Keys through the verb itself, 20 a press (the family's week lifted, hero()): the weapons found sum to the chances the rows were rolled at
     (the warmth moving between keys), within the same tolerance */
  const e2e = await H.inTx(db, async () => {
    await hero(db, M, { tower_key_bronze: 200 }, ['bronze']);
    const refused = [];
    /* a press that throws (chest_opens_hit: the table itself refuses a weapon recorded over its roll) is a refusal here too */
    for (let i = 0; i < 10; i++) {
      await db.query('savepoint tch_e2e');
      try { const res = await open(db, 'bronze', 20, 0); if (!res || res.ok !== true) refused.push(res); await db.query('release savepoint tch_e2e'); }
      catch (e) { await db.query('rollback to savepoint tch_e2e'); refused.push({ threw: String(e.message).slice(0, 160) }); }
    }
    return { refused, rows: await opensOf(db) };
  });
  if (e2e.refused.length) bad.push('TCH-ODDS end to end: a press was refused: ' + JSON.stringify(e2e.refused[0]).slice(0, 200));
  else {
    const mean = e2e.rows.reduce((s, x) => s + x.chance_ppm / 1e6, 0), sd = Math.sqrt(e2e.rows.reduce((s, x) => s + (x.chance_ppm / 1e6) * (1 - x.chance_ppm / 1e6), 0));
    const hits = e2e.rows.filter((x) => x.weapon).length, z = (hits - mean) / sd;
    if (e2e.rows.length !== 200 || !(Math.abs(z) < Z)) bad.push(`TCH-ODDS end to end: ${hits} weapons in ${e2e.rows.length} keys against ${mean.toFixed(1)} expected (z ${z.toFixed(1)})`);
    if (e2e.rows.some((x) => (x.weapon !== null) !== (x.roll < x.chance_ppm) || x.chance_ppm !== M.CH.chestChancePpm(by.bronze, x.dry, 0))) bad.push('TCH-ODDS end to end: a row\'s weapon or chance is not its roll\'s and warmth\'s');
  }
  return bad;
}
/* ── TCH-MINT ─────────────────────────────────────────────────────────────── */
/* the iron kit (tools/balance-sim/gear.mjs kitOf('tank', 20), the shield making a tank), worn by the climber's hero */
const IRON_KIT = [['weapon', 'iron_sword'], ['shield', 'ironbound_shield'], ['helmet', 'iron_helm'], ['body', 'iron_platebody'], ['pants', 'iron_platelegs'],
  ['boots', 'iron_boots'], ['gloves', 'iron_gauntlets'], ['belt', 'iron_belt']];
async function kitUp(db) {
  for (const [slot, item] of IRON_KIT) await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [UID, slot, item]);
}
async function mintArm(db, M) {
  const bad = [];
  const runs = {};
  for (const door of ['closed', 'viewed']) {
    const r = await H.inTx(db, async () => {
      /* a Level 60 tank in an iron kit: its climb passes the Bronze Key's generated first landing (40) inside the span (a bare hero tops out
         near floor 15: lane/tower-boss-formula) */
      const h = await C.climber(db, M, { level: 60, before: () => kitUp(db) });
      try { await C.drive(db, M, door, h); } catch (e) { return { err: String(e.message).slice(0, 400) }; }
      const first = await state(db);
      /* a second climb the same week, from floor 1 again, through the same landings */
      const h2 = await climbAgain(db);
      try { await C.drive(db, M, door, h2); } catch (e) { return { err: 'the second climb: ' + String(e.message).slice(0, 400) }; }
      return { first, second: await state(db) };
    });
    const tag = `TCH-MINT the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    runs[door] = r;
    for (const [when, s] of [['the first climb', r.first], ['after a second climb', r.second]]) {
      /* the landings that hand out a key (Bronze's generated first landing on) */
      const keyed = s.landings.filter((l) => M.CH.keyForLanding(l));
      if (!keyed.length) { bad.push(`${tag} CONTROL: ${when} took no landing with a key (landings ${s.landings})`); continue; }
      if (s.withheld !== 0) bad.push(`${tag} ${when}: ${s.withheld} key(s) withheld under the held limit`);
      const want = {};
      for (const l of keyed) { const k = M.CH.keyForLanding(l); want[k.item] = (want[k.item] || 0) + 1; }
      if (JSON.stringify(s.keys) !== JSON.stringify(want)) bad.push(`${tag} ${when}: the bag holds ${JSON.stringify(s.keys)} for landings ${s.landings}, not ${JSON.stringify(want)}`);
      if (s.mint_rows !== keyed.length || s.mint_bad !== 0) bad.push(`${tag} ${when}: ${s.mint_rows} tower_key ledger rows (${s.mint_bad} malformed) for ${keyed.length} keyed landings`);
    }
    /* NO WEEKLY EARN CAP (Tyler 2026-11-16): the second climb's landings are keys again, on top of the first's */
    const total = (o) => Object.values(o || {}).reduce((a, b) => a + Number(b), 0);
    if (!(total(r.second.keys) > total(r.first.keys)) || !(r.second.mint_rows > r.first.mint_rows)) {
      bad.push(`${tag} the second climb through the same landings minted no more keys (${JSON.stringify(r.first.keys)} -> ${JSON.stringify(r.second.keys)})`);
    }
  }
  /* THE OPEN TABLE ON THE MINT: a run's own row raised the way the settle raises it (hr_tower_write: the top floor, over windows), past a
     climb's reach, each landing the key of the highest Tower row at or under it; a window that raises no floor mints nothing, and a window
     that starts on the floor after a landing never mints that landing twice */
  const table = await H.inTx(db, async () => {
    await H.character(db, M, UID, { level: 12, inv: {}, gold: 0 });
    const sid = idem();
    await db.query("insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor) values ($1::uuid, $2, 0, $3::uuid, 'the_burning_tower', 1)", [sid, UID, idem()]);
    for (const [top, kills] of [[60, 0], [60, 5], [130, 0]]) {
      await db.query('update public.tower_runs set top_floor = $2, floors = $2, kills = kills + $3 where session_id = $1::uuid', [sid, top, kills]);
    }
    return state(db);
  });
  const want = {};
  const lands = []; for (let l = 10; l <= 130; l += 10) lands.push(l);
  const keyed = lands.filter((l) => M.CH.keyForLanding(l));
  for (const l of keyed) { const k = M.CH.keyForLanding(l); want[k.item] = (want[k.item] || 0) + 1; }
  const sorted = (o) => JSON.stringify(Object.keys(o || {}).sort().map((x) => [x, o[x]]));
  if (sorted(table.keys) !== sorted(want) || table.mint_rows !== keyed.length || JSON.stringify(table.landings) !== JSON.stringify(lands)) {
    bad.push(`TCH-MINT a run to floor 130 minted ${JSON.stringify(table.keys)} (${table.mint_rows} rows, landings ${table.landings}), not ${JSON.stringify(want)}`);
  }
  if (runs.closed && runs.viewed && JSON.stringify(runs.closed.first) !== JSON.stringify(runs.viewed.first)) {
    bad.push(`TCH-MINT the browser closed mints ${JSON.stringify(runs.closed.first)}, the hunt viewed ${JSON.stringify(runs.viewed.first)}`);
  }
  return bad;
}
/* A SECOND CLIMB by the same hero, from floor 1 again (checkpoint 0: any checkpoint up to the best may be picked), 40 minutes on (the server clock pinned: hr.test_now, this transaction), so its
   windows follow the first climb's: the same session setup as tests/tower-climb.mjs climber, on the hero that already exists. */
async function climbAgain(db) {
  await db.query("select set_config('hr.test_now', (transaction_timestamp() + interval '40 minutes')::text, true)");
  const r = await call(db, 'select public.hr_tower_start(0, 0, $1::uuid)', [idem()]);
  if (!r || r.ok !== true) throw new Error('the second hr_tower_start refused: ' + JSON.stringify(r));
  const sid = r.session_id;
  const t = "date_trunc('second', now() - make_interval(mins => 25))";
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
  return { sid, inst, from };
}
/* the hero's keys against every landing its runs cleared (each run's start to its top, the multiples of the landing step, repeats kept) */
async function state(db) {
  return one(db, `select jsonb_build_object(
      'landings', coalesce((select jsonb_agg(f order by f) from public.tower_runs r, generate_series(r.start_floor, coalesce(r.top_floor, 0)) f
                             where r.user_id = $1 and r.slot = 0 and f % (select t.landing_every from public.hr_tower_rules t where t.id) = 0), '[]'::jsonb),
      'withheld', (select count(*) from public.player_ledger g where g.user_id = $1 and g.intent = 'tower_key_withheld'),
      'keys', coalesce((select jsonb_object_agg(i.item_id, i.qty) from public.player_inventory i where i.user_id = $1 and i.slot = 0 and i.item_id like 'tower\\_key\\_%'), '{}'::jsonb),
      'mint_rows', (select count(*) from public.player_ledger g where g.user_id = $1 and g.intent = 'tower_key'),
      'mint_bad', (select count(*) from public.player_ledger g where g.user_id = $1 and g.intent = 'tower_key' and (g.qty <> 1 or g.session_id is null or g.kind <> 'hunt')))`, [UID]);
}

/* ── TCH-HELD ─────────────────────────────────────────────────────────────── */
async function heldArm(db, M) {
  const bad = [];
  const max = M.CH.KEY_FAMILIES.tower.heldMax;
  const r = await H.inTx(db, async () => {
    const out = {};
    /* held - 1 Tower keys: 10 Silver in the bag, the rest Gold in the account's Storage; a stand-in key of another family on an item
       the hero holds plenty of (it must never count against the Tower's limit) */
    await H.character(db, M, UID, { level: 12, inv: { tower_key_silver: 10, bones: 500 }, gold: 0 });
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_key_gold', $2) on conflict (user_id, item_id) do update set qty = $2", [UID, max - 11]);
    await db.query("insert into public.hr_chest_key_families (key_family, name, opens_per_week, held_max, switch_id) values ('deep_wing', 'Stand-in', 6, 30, 'burning_tower')");
    await db.query(`insert into public.hr_chest_keys (key_id, key_family, item_id, name, from_landing, weapon_pm, weapon_tier, skill_plus, cinders, salts_item, salts_qty, food_item, food_qty, ground, gear)
      values ('deep_bronze', 'deep_wing', 'bones', 'Stand-in Key', 10, 160, 2, 1, 50, 'temper_salts', 15, 'cooked_shrimp', 20, 'deep_wing_ground', 'weapon')`);
    const run = async (top) => {
      const sid = idem();
      await db.query("insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor) values ($1::uuid, $2, 0, $3::uuid, 'the_burning_tower', 1)", [sid, UID, idem()]);
      await db.query('update public.tower_runs set top_floor = $2, floors = $2 where session_id = $1::uuid', [sid, top]);
      return sid;
    };
    const keysOf = () => q(db, "select item_id, qty from public.player_inventory where user_id = $1 and slot = 0 and item_id like 'tower\\_key\\_%' order by item_id", [UID]);
    out.heldBefore = Number(await one(db, "select public.hr_chest_family_held($1, 0, 'tower')", [UID]));
    /* a run over landings 40, 50 and 60 (Bronze's generated first landing on): 40's Bronze drops (the limit reached), 50's and 60's are withheld */
    const s1 = await run(60);
    out.keys1 = await keysOf();
    out.held1 = Number(await one(db, "select public.hr_chest_family_held($1, 0, 'tower')", [UID]));
    out.rows1 = await q(db, `select intent, item_id, qty, (meta->>'landing')::int as landing, (meta->>'held')::int as held, (meta->>'max')::int as max
      from public.player_ledger where user_id = $1 and session_id = $2::uuid order by (meta->>'landing')::int`, [UID, s1]);
    /* five Gold Keys leave Storage (another hero took them): under the limit again, the next run's landings drop until it is reached */
    await db.query("update public.account_bank set qty = qty - 5 where user_id = $1 and item_id = 'tower_key_gold'", [UID]);
    const s2 = await run(100);
    out.rows2 = await q(db, `select intent, (meta->>'landing')::int as landing from public.player_ledger where user_id = $1 and session_id = $2::uuid order by (meta->>'landing')::int`, [UID, s2]);
    out.held2 = Number(await one(db, "select public.hr_chest_family_held($1, 0, 'tower')", [UID]));
    return out;
  });
  if (r.heldBefore !== max - 1) bad.push(`TCH-HELD CONTROL: the hero held ${r.heldBefore} Tower keys, not ${max - 1} (the stand-in family counted?)`);
  const minted = r.rows1.filter((x) => x.intent === 'tower_key'), withheld = r.rows1.filter((x) => x.intent === 'tower_key_withheld');
  if (minted.length !== 1 || minted[0].landing !== 40 || Number(minted[0].qty) !== 1 || r.held1 !== max) {
    bad.push(`TCH-HELD under the limit by one: ${JSON.stringify(r.rows1)} minted, held ${r.held1} (want landing 40's key alone, held ${max})`);
  }
  if (withheld.length !== 2 || withheld.some((x) => x.item_id !== null || Number(x.qty || 0) !== 0 || x.held !== max || x.max !== max)
      || withheld.map((x) => x.landing).join(',') !== '50,60') {
    bad.push(`TCH-HELD at the limit the landings past it read ${JSON.stringify(withheld)} (want 50 and 60 withheld, journalled with no item)`);
  }
  const bronze = (r.keys1.find((x) => x.item_id === 'tower_key_bronze') || {}).qty;
  if (Number(bronze) !== 1) bad.push(`TCH-HELD the bag holds ${JSON.stringify(r.keys1)} after the limit`);
  /* five out: landings 10 to 50 drop (five), 60 and 70 are withheld again */
  const m2 = r.rows2.filter((x) => x.intent === 'tower_key').map((x) => x.landing).join(','), w2 = r.rows2.filter((x) => x.intent === 'tower_key_withheld').map((x) => x.landing).join(',');
  if (m2 !== '40,50,60,70,80' || w2 !== '90,100' || r.held2 !== max) bad.push(`TCH-HELD five keys out: minted ${m2}, withheld ${w2}, held ${r.held2} (want 40..80, then 90,100 withheld, held ${max})`);
  return bad;
}

/* ── TCH-RING ─────────────────────────────────────────────────────────────── */
async function ringArm(db, M) {
  const bad = [];
  const GOLD = (await import(pathToFileURL(join(M.root, 'src/data/gold-ladders.js')).href + V)).KEY_RING_GOLD;
  const stacks = async () => Number(await one(db, 'select count(*) from public.player_inventory where user_id = $1 and slot = 0', [UID]));
  const ring = async () => (await one(db, 'select coalesce(jsonb_object_agg(item_id, qty), \'{}\'::jsonb) from public.player_key_ring where user_id = $1 and slot = 0', [UID]));
  const bagKeys = async () => Number(await one(db, 'select count(*) from public.player_inventory i join public.hr_chest_keys k on k.item_id = i.item_id where i.user_id = $1 and i.slot = 0', [UID]));
  const buy = async (key) => {
    const ver = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [UID]);
    return call(db, 'select public.hr_unlock_buy($1::uuid, 0, $2::bigint, $3::uuid, $4)', [UID, ver, key, 'key_ring.0']);
  };
  const r = await H.inTx(db, async () => {
    const out = {};
    await H.character(db, M, UID, { level: 12, inv: { tower_key_bronze: 2, tower_key_silver: 1 }, gold: 100000 });
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
    for (const f of M.GT.WEAPON_FAMILIES) if (f.ids[1]) await db.query('insert into public.hr_chest_weapons (key_id, family, item_id) values ($1, $2, $3) on conflict do nothing', ['bronze', f.key, f.ids[1]]);
    await db.query('update public.player_state set bank_cap = 200 where user_id = $1 and slot = 0', [UID]);
    out.locked = await one(db, 'select public.hr_key_ring_section($1, 0)', [UID]);
    out.stacks0 = await stacks();
    out.gold0 = await one(db, 'select gold from public.account_wallet where user_id = $1', [UID]);
    const key = idem();
    out.buy = await buy(key);
    out.gold1 = await one(db, 'select gold from public.account_wallet where user_id = $1', [UID]);
    out.replay = await buy(key);
    out.again = await buy(idem());
    out.gold2 = await one(db, 'select gold from public.account_wallet where user_id = $1', [UID]);
    out.sorted = { ring: await ring(), bagKeys: await bagKeys(), stacks: await stacks() };
    /* a key drops after it: a run over landing 40 */
    const sid = idem();
    await db.query("insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor) values ($1::uuid, $2, 0, $3::uuid, 'the_burning_tower', 1)", [sid, UID, idem()]);
    await db.query('update public.tower_runs set top_floor = 40, floors = 40 where session_id = $1::uuid', [sid]);
    out.dropped = { ring: await ring(), bagKeys: await bagKeys(), stacks: await stacks(), held: Number(await one(db, "select public.hr_chest_family_held($1, 0, 'tower')", [UID])) };
    /* a reload: the envelope the client applies */
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [UID]);
    /* hr_state_of: what hr_load answers a named hero (the needs_name gate aside) and every settle's envelope */
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [UID]);
    await db.query("select set_config('request.jwt.claim.sub', '', true)");
    out.reload = { ring: env && env.key_ring, inv: env && (env.inventory || env.bag || null) };
    /* a key opens from the ring */
    out.open = await open(db, 'bronze', 1, 0);
    out.afterOpen = { ring: await ring(), took: await one(db, "select meta->'took' from public.player_ledger where user_id = $1 and intent = 'chest_open:great_hearth:bronze:1:0' and item_id = 'tower_key_bronze'", [UID]) };
    /* ring keys into Storage */
    out.store = await call(db, 'select public.hr_key_ring_store(0, $1, 1, $2::uuid)', ['tower_key_silver', idem()]);
    out.afterStore = { ring: await ring(), storage: await store(db, 'tower_key_silver'), bag: await bag(db, 'tower_key_silver') };
    return out;
  });
  if (!r.locked || r.locked.unlocked !== false || !r.locked.offer || r.locked.offer.gold !== GOLD || r.locked.offer.offer !== 'key_ring.0') bad.push('TCH-RING locked, the section reads ' + JSON.stringify(r.locked));
  if (!r.buy || r.buy.ok !== true || Number(r.gold0) - Number(r.gold1) !== GOLD) bad.push(`TCH-RING the purchase answered ${JSON.stringify(r.buy).slice(0, 200)} (gold ${r.gold0} -> ${r.gold1}, price ${GOLD})`);
  if (Number(r.gold2) !== Number(r.gold1)) bad.push(`TCH-RING a replayed or second purchase charged again (${r.gold1} -> ${r.gold2}; ${JSON.stringify(r.again).slice(0, 120)})`);
  if (r.sorted.bagKeys !== 0 || r.sorted.ring.tower_key_bronze !== 2 || r.sorted.ring.tower_key_silver !== 1 || r.sorted.stacks !== r.stacks0 - 2) {
    bad.push(`TCH-RING the purchase left ${JSON.stringify(r.sorted)} (bag stacks were ${r.stacks0})`);
  }
  if (r.dropped.bagKeys !== 0 || r.dropped.ring.tower_key_bronze !== 3 || r.dropped.stacks !== r.sorted.stacks || r.dropped.held !== 4) {
    bad.push(`TCH-RING a key dropped after the ring read ${JSON.stringify(r.dropped)} (the bag had ${r.sorted.stacks} stacks)`);
  }
  const rl = r.reload.ring;
  const rlKeys = rl && Array.isArray(rl.keys) ? Object.fromEntries(rl.keys.map((x) => [x.item, x.qty])) : null;
  const invHasKey = JSON.stringify(r.reload.inv || '').includes('tower_key_');
  if (!rl || rl.unlocked !== true || !rlKeys || rlKeys.tower_key_bronze !== 3 || invHasKey) bad.push(`TCH-RING a reload reads the ring ${JSON.stringify(rl)} and a bag key ${invHasKey}`);
  if (!r.open || r.open.ok !== true || r.afterOpen.ring.tower_key_bronze !== 2 || !r.afterOpen.took || Number(r.afterOpen.took.ring) !== 1) {
    bad.push(`TCH-RING a key from the ring opened ${JSON.stringify(r.open).slice(0, 160)}, the ring ${JSON.stringify(r.afterOpen)}`);
  }
  if (!r.store || r.store.ok !== true || r.afterStore.ring.tower_key_silver !== undefined || r.afterStore.storage !== 1 || r.afterStore.bag !== 0) {
    bad.push(`TCH-RING a ring key into Storage answered ${JSON.stringify(r.store).slice(0, 160)}, then ${JSON.stringify(r.afterStore)}`);
  }
  /* short of gold: refused, nothing bought */
  const poor = await H.inTx(db, async () => {
    await H.character(db, M, UID, { level: 12, inv: { tower_key_bronze: 1 }, gold: GOLD - 1 });
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
    const res = await buy(idem());
    return { res, owned: await one(db, 'select public.hr_key_ring_owned($1, 0)', [UID]), bagKeys: await bagKeys() };
  });
  if (!poor.res || poor.res.ok === true || poor.owned !== false || poor.bagKeys !== 1) bad.push(`TCH-RING a hero short of gold answered ${JSON.stringify(poor.res).slice(0, 160)} (owned ${poor.owned})`);
  /* THE TOWER HIDDEN (CLAUDE.md §3.5): a hand-made unlock_buy of the ring is refused, the purse untouched, no ring */
  const hidden = await H.inTx(db, async () => {
    await H.character(db, M, UID, { level: 12, inv: { tower_key_bronze: 1 }, gold: 100000 });
    await db.query("update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower'");
    const g0 = await one(db, 'select gold from public.account_wallet where user_id = $1', [UID]);
    const res = await buy(idem());
    return { res, g0, g1: await one(db, 'select gold from public.account_wallet where user_id = $1', [UID]), owned: await one(db, 'select public.hr_key_ring_owned($1, 0)', [UID]),
      rows: Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and intent like 'unlock_buy:key_ring%'", [UID])) };
  });
  if (!hidden.res || hidden.res.error !== 'feature_off' || Number(hidden.g1) !== Number(hidden.g0) || hidden.owned !== false || hidden.rows !== 0) {
    bad.push(`TCH-RING the Tower hidden, a hand-made buy answered ${JSON.stringify(hidden.res).slice(0, 160)} (gold ${hidden.g0} -> ${hidden.g1}, owned ${hidden.owned}, ${hidden.rows} rows)`);
  }
  /* A KEY WITHDRAWN INTO A FULL BAG: onto the ring with one; bag_full without */
  const full = {};
  for (const withRing of [true, false]) {
    full[withRing] = await H.inTx(db, async () => {
      await H.character(db, M, UID, { level: 12, inv: {}, gold: 100000 });
      await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
      if (withRing) await db.query("insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values ($1, 0, 'unlock', 'key_ring', '', 1, now())", [UID]);
      await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_key_gold', 2) on conflict (user_id, item_id) do update set qty = 2", [UID]);
      /* the bag filled to its cap with stacks of other kinds (bank_cap has a floor, so the bag fills rather than the cap shrinks) */
      await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty)
        select $1, 0, i.item_id, 1 from public.hr_items i
         where not exists (select 1 from public.player_inventory v where v.user_id = $1 and v.slot = 0 and v.item_id = i.item_id)
           and not exists (select 1 from public.hr_chest_keys k where k.item_id = i.item_id)
         order by i.item_id
         limit greatest(0, (select bank_cap from public.player_state where user_id = $1 and slot = 0)
                           - (select count(*) from public.player_inventory where user_id = $1 and slot = 0))`, [UID]);
      const s0 = await stacks();
      const cap = Number(await one(db, 'select bank_cap from public.player_state where user_id = $1 and slot = 0', [UID]));
      if (s0 < cap) throw new Error('the bag did not fill: ' + s0 + ' of ' + cap);
      const res = await call(db, 'select public.hr_bank_move(0, $1, 2, $2, $3::uuid)', ['tower_key_gold', 'withdraw', idem()]);
      return { res, s0, s1: await stacks(), ring: await ring(), storage: await store(db, 'tower_key_gold') };
    });
  }
  const w = full.true, wo = full.false;
  if (!w.res || w.res.ok !== true || w.ring.tower_key_gold !== 2 || w.s1 !== w.s0 || w.storage !== 0) {
    bad.push(`TCH-RING a key withdrawn into a full bag with a ring answered ${JSON.stringify(w.res).slice(0, 160)} (ring ${JSON.stringify(w.ring)}, stacks ${w.s0} -> ${w.s1})`);
  }
  if (!wo.res || wo.res.error !== 'bag_full' || wo.storage !== 2 || wo.s1 !== wo.s0) bad.push(`TCH-RING a key withdrawn into a full bag with no ring answered ${JSON.stringify(wo.res).slice(0, 160)}`);
  return bad;
}

/* ── TCH-OPEN ─────────────────────────────────────────────────────────────── */
async function openArm(db, M) {
  const bad = [];
  const by = Object.fromEntries(M.CH.CHEST_KEYS.map((k) => [k.id, k]));
  const r = await H.inTx(db, async () => {
    const out = {};
    await hero(db, M, { tower_key_bronze: 40, tower_key_silver: 10, tower_key_platinum: 20 });
    const own = await one(db, `select f.family from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
      where e.user_id = $1 and e.slot = 0 and e.equip_slot = 'weapon'`, [UID]);
    /* (1) THE WARMTH: twelve Platinum Keys one at a time, unstoked */
    out.warm = [];
    for (let i = 0; i < 12; i++) out.warm.push(await open(db, 'platinum', 1, 0));
    out.warmRows = await opensOf(db);
    /* (2) THE CAP: the Hearth at 49 dry keys, three more */
    await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 49) on conflict (user_id, slot, key_family) do update set dry = excluded.dry", [UID]);
    for (let i = 0; i < 3; i++) await open(db, 'platinum', 1, 0);
    out.capRows = (await opensOf(db)).slice(-3);
    /* (3) A WEAPON COOLS IT: a Bronze Key three times stoked at 50 dry keys is a sure thing (160 x 3 x 3.3 > 100%) */
    await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 50) on conflict (user_id, slot, key_family) do update set dry = excluded.dry", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 600) on conflict (user_id, slot, item_id) do update set qty = 600", [UID]);
    out.sure = await open(db, 'bronze', 1, 3);
    out.afterSure = await one(db, "select dry from public.chest_warmth where user_id = $1 and slot = 0 and key_family = 'tower'", [UID]);
    out.weaponInBag = out.sure && out.sure.opens && out.sure.opens[0].weapon ? await bag(db, out.sure.opens[0].weapon) : null;
    out.own = own;
    /* (4) THE STOKES: each count at a cold Hearth, its chance and its Cinders: 100 in the bag, 2,000 in Storage */
    await db.query("delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'tower_cinders'", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 100)", [UID]);
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_cinders', 2000) on conflict (user_id, item_id) do update set qty = 2000", [UID]);
    out.stoke = [];
    for (const s of [1, 2, 3]) {
      await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 0) on conflict (user_id, slot, key_family) do update set dry = excluded.dry", [UID]);
      const before = [await bag(db, 'tower_cinders'), await store(db, 'tower_cinders')];
      const res = await open(db, 'bronze', 1, s);
      out.stoke.push({ s, res, before, after: [await bag(db, 'tower_cinders'), await store(db, 'tower_cinders')],
        took: await q(db, `select item_id, qty, meta->'took' as took from public.player_ledger where user_id = $1 and intent = $2 and qty < 0 order by item_id`, [UID, 'chest_open:great_hearth:bronze:1:' + s]) });
    }
    /* (5) SHORT OF CINDERS: none anywhere, three Bronze Keys asked to stoke once: each goes in with what the press has paid by its turn */
    await db.query("delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'tower_cinders'", [UID]);
    await db.query("delete from public.account_bank where user_id = $1 and item_id = 'tower_cinders'", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 100)", [UID]);
    await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 0) on conflict (user_id, slot, key_family) do update set dry = excluded.dry", [UID]);
    out.short = await open(db, 'bronze', 3, 1);
    out.shortCinders = await bag(db, 'tower_cinders');
    /* (6) THE DEFAULT: Silver saved at two stokes, sent with none */
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_cinders', 5000) on conflict (user_id, item_id) do update set qty = 5000", [UID]);
    out.def = await call(db, 'select public.hr_chest_stoke_default(0, $1, $2, $3::uuid)', ['silver', 2, idem()]);
    await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 0) on conflict (user_id, slot, key_family) do update set dry = excluded.dry", [UID]);
    out.defOpen = await open(db, 'silver', 1, null);
    /* (7) THE HAUL: one cold, unstoked Silver Key on a fresh count of its own items. Which salts is the data's (keySalts), never a written
       id: (6)'s Silver Key paid them too, and a stale id here counted both keys' salts once the Silver Key moved to Mithril (C4). */
    for (const it of [M.CH.keySalts(by.silver), by.silver.food]) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, it]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 1000) on conflict (user_id, slot, item_id) do update set qty = 1000", [UID]);
    const keys0 = await bag(db, 'tower_key_silver');
    out.haul = await open(db, 'silver', 1, 0);
    out.haulBag = { salts: await bag(db, M.CH.keySalts(by.silver)), food: await bag(db, 'cooked_lobster'), cinders: await bag(db, 'tower_cinders'),
      keys: [keys0, await bag(db, 'tower_key_silver')] };
    out.haulLedger = await q(db, `select kind, item_id, qty, meta from public.player_ledger where user_id = $1 and intent = 'chest_open:great_hearth:silver:1:0' order by id`, [UID]);
    out.luck = await one(db, 'select to_jsonb(c) - $2 from public.chest_luck c where user_id = $1 and slot = 0', [UID, 'updated_at']);
    out.total = Number(await one(db, 'select count(*) from public.chest_opens where user_id = $1', [UID]));
    return out;
  });
  const P = by.platinum, B = by.bronze, S = by.silver;
  /* (1) the warmth grows by one dry key at a time from cold, each row's chance its own warmth's */
  const w = r.warmRows;
  if (r.warm.some((x) => !x || x.ok !== true)) bad.push('TCH-OPEN a Platinum Key was refused: ' + JSON.stringify(r.warm.find((x) => !x || x.ok !== true)));
  let dry = 0;
  for (const row of w) {
    if (row.dry !== dry) bad.push(`TCH-OPEN key ${row.n} opened at warmth ${row.dry}, not ${dry}`);
    if (row.chance_ppm !== M.CH.chestChancePpm(P, row.dry, 0)) bad.push(`TCH-OPEN key ${row.n} at warmth ${row.dry} had ${row.chance_ppm} ppm, not ${M.CH.chestChancePpm(P, row.dry, 0)}`);
    if ((row.weapon !== null) !== (row.roll < row.chance_ppm)) bad.push(`TCH-OPEN key ${row.n} rolled ${row.roll} under ${row.chance_ppm} and ${row.weapon ? 'found' : 'missed'}`);
    dry = row.weapon ? 0 : dry + 1;
  }
  if (!(w.length === 12 && w[w.length - 1].chance_ppm > w[0].chance_ppm)) bad.push(`TCH-OPEN the warmth did not grow over 12 dry keys: ${w.map((x) => x.chance_ppm)}`);
  /* (2) the cap */
  const capWant = r.capRows.map((row) => M.CH.chestChancePpm(P, row.dry, 0));
  if (r.capRows[0].dry !== 49 || JSON.stringify(r.capRows.map((x) => x.chance_ppm)) !== JSON.stringify(capWant) || capWant.some((c) => c > 3 * P.weaponPm * 1000)
      || (!r.capRows[0].weapon && r.capRows[1].chance_ppm !== 3 * P.weaponPm * 1000)) {
    bad.push(`TCH-OPEN the cap: warmth ${r.capRows.map((x) => x.dry)} read ${r.capRows.map((x) => x.chance_ppm)} ppm (3x is ${3 * P.weaponPm * 1000})`);
  }
  /* (3) a sure weapon, in the bag, of the family worn or another key family, and the Hearth cold after it */
  const sw = r.sure && r.sure.opens && r.sure.opens[0];
  if (!sw || sw.chance_ppm !== 1000000 || !sw.weapon || sw.stokes !== 3) bad.push('TCH-OPEN a sure Bronze Key answered ' + JSON.stringify(r.sure).slice(0, 300));
  else {
    if (r.weaponInBag !== 1) bad.push(`TCH-OPEN the weapon ${sw.weapon} is not in the bag (${r.weaponInBag})`);
    if (r.afterSure !== 0) bad.push(`TCH-OPEN a weapon left the Hearth at warmth ${r.afterSure}`);
    if (!r.own) bad.push('TCH-OPEN CONTROL: the hero wears no weapon of a family');
  }
  /* (4) the stokes multiply the chance and burn their Cinders net of the key's own, the bag first, then Storage */
  for (const x of r.stoke) {
    const o = x.res && x.res.opens && x.res.opens[0];
    const cost = M.CH.stokeCost(B, x.s);
    if (!o || o.stokes !== x.s || o.chance_ppm !== M.CH.chestChancePpm(B, 0, x.s)) { bad.push(`TCH-OPEN ${x.s} stoke(s) answered ${JSON.stringify(x.res).slice(0, 300)}`); continue; }
    const net = cost - B.cinders;
    const fromBag = Math.min(x.before[0], net);
    const want = [x.before[0] - fromBag, x.before[1] - (net - fromBag)];
    if (JSON.stringify(x.after) !== JSON.stringify(want)) bad.push(`TCH-OPEN ${x.s} stoke(s) (${cost} Cinders, the key pays ${B.cinders}) moved bag/Storage ${x.before} -> ${x.after}, not ${want}`);
    const took = x.took.find((t) => t.item_id === 'tower_cinders');
    if (!took || Number(took.qty) !== -net || took.took.bag + took.took.storage !== net) bad.push(`TCH-OPEN ${x.s} stoke(s): the Cinders' ledger row reads ${JSON.stringify(took)}`);
  }
  if (r.stoke.length === 3 && !(r.stoke[0].res.opens[0].chance_ppm < r.stoke[1].res.opens[0].chance_ppm && r.stoke[1].res.opens[0].chance_ppm < r.stoke[2].res.opens[0].chance_ppm)) {
    bad.push('TCH-OPEN more stokes did not mean more chance');
  }
  /* (5) short: 100 Cinders, one stoke asked on three keys (150 each): the first goes in cold (100 < 150), the second stoked (100 + 50 paid),
     the third cold again (0 + 50) */
  const sh = r.short && r.short.opens;
  if (!sh || sh.map((x) => x.stokes).join(',') !== '0,1,0' || r.shortCinders !== 100 + 3 * B.cinders - 150) {
    bad.push(`TCH-OPEN short of Cinders the stokes went ${sh && sh.map((x) => x.stokes)} and left ${r.shortCinders} (want 0,1,0 and ${100 + 3 * B.cinders - 150})`);
  }
  /* (6) the saved default */
  if (!r.def || r.def.ok !== true || !r.defOpen || r.defOpen.ok !== true || r.defOpen.opens[0].stokes !== 2) bad.push(`TCH-OPEN the default answered ${JSON.stringify(r.def).slice(0, 120)}, then ${JSON.stringify(r.defOpen).slice(0, 200)}`);
  /* (7) the haul is the key's row, the key is gone, and every move is journalled */
  const ho = r.haul && r.haul.opens && r.haul.opens[0];
  const extraFood = ho && ho.weapon === 'cooked_lobster' ? 1 : 0;
  if (!ho || r.haulBag.salts !== S.saltsQty || r.haulBag.food !== S.foodQty + extraFood || r.haulBag.cinders !== 1000 + S.cinders || r.haulBag.keys[1] !== r.haulBag.keys[0] - 1) {
    bad.push(`TCH-OPEN one Silver Key paid ${JSON.stringify(r.haulBag)} (want ${S.saltsQty} salts, ${S.foodQty} food, ${S.cinders} Cinders, one key gone)`);
  }
  const hl = r.haulLedger;
  const key = hl.find((x) => x.item_id === S.item), app = hl.find((x) => x.item_id === null);
  if (!key || Number(key.qty) !== -1 || key.kind !== 'hunt' || !app || app.meta.reason !== 'chest_open' || !Array.isArray(app.meta.opens) || app.meta.opens.length !== 1
      /* hr_apply journals its delta compacted: items under `i` */
      || Number(app.meta.delta && app.meta.delta.i && app.meta.delta.i[M.CH.keySalts(S)]) !== S.saltsQty) {
    bad.push('TCH-OPEN the Silver Key\'s ledger reads ' + JSON.stringify(hl).slice(0, 400));
  }
  if (!r.luck || Number(r.luck.opens) !== r.total) bad.push(`TCH-OPEN the hero's key count reads ${r.luck && r.luck.opens}, chest_opens ${r.total}`);
  return bad;
}

/* ── TCH-FORGED ───────────────────────────────────────────────────────────── */
async function forgedArm(db, M) {
  const bad = [];
  const r = await H.inTx(db, async () => {
    const out = {};
    await hero(db, M, { tower_key_bronze: 1, tower_key_gold: 3 }, ['bronze'], null);
    /* the Gold Key missing one of its seven (since lane/d-tower-weapons every key's are built in the catalogue: a key short of one is
       still never opened) */
    await db.query("delete from public.hr_chest_weapons where key_id = 'gold' and family = 'crossbow'");
    const snap = async () => JSON.stringify([await q(db, 'select item_id, qty from public.player_inventory where user_id = $1 order by item_id', [UID]),
      await q(db, 'select count(*) from public.chest_opens where user_id = $1', [UID]), await q(db, 'select count(*) from public.player_ledger where user_id = $1', [UID])]);
    const s0 = await snap();
    out.shape = [];
    for (const [name, want, args] of [['no such chest', 'bad_chest', ['bronze', 1, 0, idem(), 'nowhere']], ['no such key', 'bad_key', ['diamond', 1, 0]],
      ['no keys', 'bad_count', ['bronze', 0, 0]], ['21 keys', 'bad_count', ['bronze', 21, 0]], ['no count', 'bad_count', ['bronze', null, 0]],
      ['four stokes', 'bad_stokes', ['bronze', 1, 4]], ['minus a stoke', 'bad_stokes', ['bronze', 1, -1]],
      ['a key with no weapons built', 'chest_not_ready', ['gold', 1, 0]], ['two keys from one', 'no_key', ['bronze', 2, 0]]]) {
      const res = await open(db, args[0], args[1], args[2], args[3] || idem(), args[4] || 'great_hearth');
      out.shape.push({ name, want, got: res && res.error, ok: res && res.ok === true });
    }
    out.s1 = await snap();
    out.s0 = s0;
    /* a key opened once: the next press has none; the same key replays its receipt; the key reused for another press is refused */
    const k1 = idem();
    out.first = await open(db, 'bronze', 1, 0, k1);
    out.again = await open(db, 'bronze', 1, 0);
    out.replay = await open(db, 'bronze', 1, 0, k1);
    out.reuse = await open(db, 'bronze', 1, 1, k1);
    out.rows = Number(await one(db, 'select count(*) from public.chest_opens where user_id = $1', [UID]));
    /* the full bag: refused BEFORE any roll (no row, no count moved) */
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_key_bronze', 1) on conflict (user_id, slot, item_id) do update set qty = 1", [UID]);
    for (const it of Object.keys(M.CH.keyHaul(M.CH.CHEST_KEYS.find((k) => k.id === 'bronze')))) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, it]);
    await db.query('update public.player_state set bank_cap = (select count(*) from public.player_inventory where user_id = $1 and slot = 0) where user_id = $1 and slot = 0', [UID]);
    const n0 = Number(await one(db, 'select opens from public.chest_luck where user_id = $1 and slot = 0', [UID]));
    out.full = await open(db, 'bronze', 1, 0);
    out.fullRows = [n0, Number(await one(db, 'select opens from public.chest_luck where user_id = $1 and slot = 0', [UID])), Number(await one(db, 'select count(*) from public.chest_opens where user_id = $1', [UID]))];
    await db.query('update public.player_state set bank_cap = 200 where user_id = $1 and slot = 0', [UID]);
    /* THE FAMILY'S WEEK, counted from chest_opens: one key used, (week - 2) more Tower keys this week, three last week and a week's worth of
       another family's this week: the next key is the week's last and opens, the one after it is week_limit and moves nothing */
    const week = Number(await one(db, "select opens_per_week from public.hr_chest_key_families where key_family = 'tower'"));
    out.week = week;
    const filler = (n0, count, family, at) => db.query(`insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, intent_id, at)
      select $1, 0, $2 + g, 'great_hearth', 'bronze', $4, 0, 0, 0, 0, 999999, $3::uuid, ${at} from generate_series(1, $5) g`, [UID, n0, idem(), family, count]);
    await filler(1000, week - 2, 'tower', 'now()');
    await filler(2000, 3, 'tower', "now() - interval '8 days'");
    await filler(3000, week, 'catacomb', 'now()');
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_key_bronze', 2) on conflict (user_id, slot, item_id) do update set qty = 2", [UID]);
    /* two at once with one left in the week: refused whole, not one of the two */
    const w1 = await snap();
    out.weekTwo = await open(db, 'bronze', 2, 0);
    out.weekTwoMoved = (await snap()) !== w1;
    out.lastOfWeek = await open(db, 'bronze', 1, 0);
    const w0 = await snap();
    out.weekOver = await open(db, 'bronze', 1, 0);
    out.weekMoved = (await snap()) !== w0;
    /* the switch off */
    await db.query("update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower'");
    out.off = await open(db, 'bronze', 1, 0);
    out.offDefault = await call(db, 'select public.hr_chest_stoke_default(0, $1, $2, $3::uuid)', ['bronze', 1, idem()]);
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'burning_tower'", [UID]);
    out.badDefault = [await call(db, 'select public.hr_chest_stoke_default(0, $1, $2, $3::uuid)', ['bronze', 7, idem()]),
      await call(db, 'select public.hr_chest_stoke_default(0, $1, $2, $3::uuid)', ['diamond', 1, idem()])];
    return out;
  });
  for (const x of r.shape) if (x.ok || x.got !== x.want) bad.push(`TCH-FORGED ${x.name} answered ${x.ok ? 'ok' : x.got}, not ${x.want}`);
  if (r.s1 !== r.s0) bad.push('TCH-FORGED a refused press moved the bag, chest_opens or the ledger');
  if (!r.first || r.first.ok !== true) bad.push('TCH-FORGED CONTROL: the one Bronze Key was refused: ' + JSON.stringify(r.first).slice(0, 200));
  if (!r.again || r.again.error !== 'no_key') bad.push('TCH-FORGED a used key answered ' + JSON.stringify(r.again).slice(0, 160));
  if (!r.replay || JSON.stringify(r.replay.opens) !== JSON.stringify(r.first && r.first.opens) || r.rows !== 1) bad.push(`TCH-FORGED the replayed key answered ${JSON.stringify(r.replay).slice(0, 160)} (${r.rows} rows)`);
  if (!r.reuse || r.reuse.error !== 'intent_mismatch') bad.push('TCH-FORGED a key reused for another press answered ' + JSON.stringify(r.reuse).slice(0, 160));
  if (!r.full || r.full.error !== 'bag_full' || r.fullRows[0] !== r.fullRows[1] || r.fullRows[2] !== 1) bad.push(`TCH-FORGED a full bag answered ${JSON.stringify(r.full).slice(0, 160)} with counts ${r.fullRows}`);
  if (!r.lastOfWeek || r.lastOfWeek.ok !== true) bad.push(`TCH-FORGED the week's ${r.week}th key (last week's and another family's opens not counted) answered ${JSON.stringify(r.lastOfWeek).slice(0, 160)}`);
  if (!r.weekOver || r.weekOver.error !== 'week_limit' || r.weekOver.family !== 'tower' || r.weekOver.used !== r.week || r.weekOver.limit !== r.week || r.weekMoved) {
    bad.push(`TCH-FORGED the family's week answered ${JSON.stringify(r.weekOver).slice(0, 160)}${r.weekMoved ? ' and moved something' : ''}`);
  }
  if (!r.weekTwo || r.weekTwo.error !== 'week_limit' || r.weekTwoMoved) bad.push('TCH-FORGED two keys past the week answered ' + JSON.stringify(r.weekTwo).slice(0, 160));
  if (!r.off || r.off.error !== 'feature_off' || !r.offDefault || r.offDefault.error !== 'feature_off') bad.push(`TCH-FORGED the switch off answered ${JSON.stringify(r.off)} / ${JSON.stringify(r.offDefault)}`);
  if (r.badDefault[0].error !== 'bad_stokes' || r.badDefault[1].error !== 'bad_key') bad.push('TCH-FORGED a forged default answered ' + JSON.stringify(r.badDefault));
  /* the client's reach: two verbs, no helper; no verb takes a chance, a warmth, a family or a weapon */
  const priv = await q(db, `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon,
      coalesce(array_to_string(p.proargnames, ','), '') as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('hr_chest_open', 'hr_chest_stoke_default', 'hr_chest_roll', 'hr_chest_chance_ppm', 'hr_chest_held', 'hr_chest_family_held', 'hr_chest_week_start',
       'hr_chest_section', 'hr_tower_key_mint')`);
  for (const p of priv) {
    const verb = ['hr_chest_open', 'hr_chest_stoke_default'].includes(p.proname);
    if (p.auth !== verb || p.anon) bad.push(`TCH-FORGED ${p.proname}: authenticated ${p.auth}, anon ${p.anon}`);
    if (verb && /chance|dry|warm|family|weapon|cinder|roll|price|week|held|used/.test(p.args)) bad.push(`TCH-FORGED ${p.proname} takes ${p.args}`);
  }
  if (priv.length !== 9) bad.push('TCH-FORGED HARNESS: found ' + priv.map((p) => p.proname));
  /* a hero in a hunt opens nothing (the chest stands in town) */
  const hunt = await H.inTx(db, async () => {
    await C.climber(db, M, {});
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_key_bronze', 1) on conflict (user_id, slot, item_id) do update set qty = 1", [UID]);
    for (const f of M.GT.WEAPON_FAMILIES) if (f.ids[1]) await db.query('insert into public.hr_chest_weapons (key_id, family, item_id) values ($1, $2, $3) on conflict do nothing', ['bronze', f.key, f.ids[1]]);
    return open(db, 'bronze', 1, 0);
  });
  if (!hunt || hunt.error !== 'in_hunt') bad.push('TCH-FORGED a hero on a climb answered ' + JSON.stringify(hunt).slice(0, 160));
  return bad;
}

/* ── TCH-OUTFIT ───────────────────────────────────────────────────────────── */
const UID2 = '000000c0-0000-4000-a000-00005c0a7c02';
/* the first key index past `from` whose outfit roll is `want` (true: under `under` ppm, a find; false: in [under, 2 x under), a near miss) */
async function nextRoll(db, from, under, want) {
  return Number(await one(db, `select n from generate_series($1::bigint + 1, $1::bigint + 400000) n
     where ${want ? 'public.hr_chest_outfit_roll($2, 0, n) < $3' : 'public.hr_chest_outfit_roll($2, 0, n) between $3 and 2 * $3 - 1'} limit 1`, [from, UID, under]));
}
async function outfitArm(db, M) {
  const bad = [];
  const O = M.CH.CHEST_OUTFITS;
  const coat = O[0];
  if (!coat || coat.outfit !== 'sweeps_coat' || coat.item !== 'sweeps_coat_bundle') return ['TCH-OUTFIT the data has no Key Warden row: ' + JSON.stringify(coat)];
  /* (1) THE DATA: Tyler's super-rare from any chest, the designer's 0.2 / 0.3 / 0.4 / 0.5%; the server's rows are the data's; the bundle
     trades (the board: "it trades, until someone wears it") at its book value */
  /* every key of both families (the descent design §3: "every key at the chest rolls the coat"), each its metal's chance */
  const METAL = { bronze: 2, silver: 3, gold: 4, platinum: 5 };
  if (Object.keys(coat.pm).length !== M.CH.HEARTH_CHEST_KEYS.length || M.CH.HEARTH_CHEST_KEYS.some((k) => coat.pm[k.id] !== METAL[k.id.split('_').pop()])) bad.push('TCH-OUTFIT the coat\'s chances read ' + JSON.stringify(coat.pm));
  const rows = await q(db, 'select key_id, outfit_id, item_id, pm from public.hr_chest_outfits order by key_id');
  const want = M.CH.HEARTH_CHEST_KEYS.flatMap((k) => O.map((o) => [k.id, o.outfit, o.item, o.pm[k.id]].join(':'))).sort().join('|');
  if (rows.map((r) => [r.key_id, r.outfit_id, r.item_id, r.pm].join(':')).sort().join('|') !== want) bad.push('TCH-OUTFIT hr_chest_outfits reads ' + JSON.stringify(rows));
  const item = await q(db, 'select tradeable, value from public.hr_items where item_id = $1', [coat.item]);
  if (!item.length || item[0].tradeable !== true || Number(item[0].value) !== coat.value) bad.push('TCH-OUTFIT the bundle\'s item row reads ' + JSON.stringify(item));
  /* (2) THE RATE A KEY: the server's outfit roll over N keys a key, each key's chance within Z standard deviations; and its OWN stream:
     against the weapon's roll at even odds, both hit about a quarter of the time (one stream would make it a half) */
  const N2 = 20000;
  for (const k of M.CH.CHEST_KEYS) {
    const p = coat.pm[k.id] / 1000;
    const hits = Number(await one(db, 'select count(*) from generate_series(1, $2) n where public.hr_chest_outfit_roll($1, 0, n) < $3', [UID, N2, coat.pm[k.id] * 1000]));
    const z = (hits - N2 * p) / Math.sqrt(N2 * p * (1 - p));
    if (!(Math.abs(z) < Z)) bad.push(`TCH-OUTFIT the ${k.id} key found ${hits} coats in ${N2} keys, ${(hits / N2 * 100).toFixed(3)}% against ${(p * 100).toFixed(1)}% (z ${z.toFixed(1)})`);
  }
  const both = Number(await one(db, `select count(*) from generate_series(1, $2) n where public.hr_chest_outfit_roll($1, 0, n) < 500000
      and (public.hr_chest_roll($1, 0, n, 500000, null, $3::text[])->>'weapon')::boolean`, [UID, N2, M.CH.WEAPON_FAMILY_KEYS]));
  const zb = (both - N2 / 4) / Math.sqrt(N2 * 0.25 * 0.75);
  if (!(Math.abs(zb) < Z)) bad.push(`TCH-OUTFIT the outfit roll is not its own stream: ${both} of ${N2} keys hit both at even odds (z ${zb.toFixed(1)})`);
  /* (3) A SEEDED OPEN THAT FINDS THE COAT, THROUGH THE VERB: the hero's next key set to the first index whose roll finds it */
  const r = await H.inTx(db, async () => {
    const out = {};
    await hero(db, M, { tower_key_silver: 6, tower_key_gold: 2 });
    const lines = async () => q(db, "select body from public.chat_messages where from_id = $1 and channel = 'system' order by created_at, id", [UID]);
    await db.query('insert into public.chest_luck (user_id, slot) values ($1, 0) on conflict (user_id, slot) do nothing', [UID]);
    const silver = coat.pm.silver * 1000;
    /* a near miss first: a roll just over the silver chance finds nothing */
    out.near = await nextRoll(db, 0, silver, false);
    await db.query('update public.chest_luck set opens = $2 where user_id = $1 and slot = 0', [UID, out.near - 1]);
    out.miss = await open(db, 'silver', 1, 0);
    out.n = await nextRoll(db, out.near, silver, true);
    await db.query('update public.chest_luck set opens = $2 where user_id = $1 and slot = 0', [UID, out.n - 1]);
    const key = idem();
    out.hit = await open(db, 'silver', 1, 0, key);
    out.again = await open(db, 'silver', 1, 0, key);
    out.bag = await bag(db, coat.item);
    out.row = await q(db, 'select n, outfit, outfit_roll from public.chest_opens where user_id = $1 and outfit is not null', [UID]);
    out.lines = await lines();
    /* the quiet hero's find is told to nobody */
    await db.query('update public.player_state set presence_quiet = true where user_id = $1 and slot = 0', [UID]);
    out.n2 = await nextRoll(db, out.n, silver, true);
    await db.query('update public.chest_luck set opens = $2 where user_id = $1 and slot = 0', [UID, out.n2 - 1]);
    out.quiet = await open(db, 'silver', 1, 0);
    out.linesQuiet = await lines();
    /* THE BAG, BEFORE THE ROLL: a bag with room for the haul and the weapon but not the bundle is refused, and with a bundle held it fits */
    await db.query('update public.player_state set presence_quiet = false where user_id = $1 and slot = 0', [UID]);
    await db.query(`delete from public.player_inventory where user_id = $1 and slot = 0 and item_id not in ('tower_key_gold', $2)`, [UID, coat.item]);
    await db.query(`delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2`, [UID, coat.item]);
    const stacks = Number(await one(db, 'select count(*) from public.player_inventory where user_id = $1 and slot = 0', [UID]));
    /* the gold key's press needs: Cinders, salts, food (3 new stacks) + a weapon + the bundle; its key stack stays (2 held, 1 used) */
    await db.query('update public.player_state set bank_cap = $2 where user_id = $1 and slot = 0', [UID, stacks + 4]);
    out.full = await open(db, 'gold', 1, 0);
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1)', [UID, coat.item]);
    await db.query('update public.player_state set bank_cap = $2 where user_id = $1 and slot = 0', [UID, stacks + 5]);
    out.fits = await open(db, 'gold', 1, 0);
    /* (4) THE BUNDLE IN THE BAG, USED: this hero owns the coat and wears it; a hero with none can't wear it */
    await db.query('update public.player_state set bank_cap = 200 where user_id = $1 and slot = 0', [UID]);
    const use = (uid, it, k = idem()) => (async () => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      try { return await one(db, 'select public.hr_outfit_bundle_use(0, $1, $2::uuid)', [it, k]); }
      finally { await db.query(`select set_config('request.jwt.claim.sub', '', true)`); }
    })();
    const wear = async (uid, outfit) => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      try { return await one(db, `select public.hr_outfit_set(0, $1, '{}'::jsonb, $2::uuid)`, [outfit, idem()]); }
      finally { await db.query(`select set_config('request.jwt.claim.sub', '', true)`); }
    };
    const owned = async (uid) => one(db, 'select public.hr_outfit_owned($1::uuid, 0)', [uid]);
    await db.query('update public.player_inventory set qty = 2 where user_id = $1 and slot = 0 and item_id = $2', [UID, coat.item]);
    out.ownedBefore = await owned(UID);
    out.wearBefore = await wear(UID, coat.outfit);
    out.bagBefore = await bag(db, coat.item);
    const ukey = idem();
    out.use = await use(UID, coat.item, ukey);
    out.useAgain = await use(UID, coat.item, ukey);
    out.bagAfter = await bag(db, coat.item);
    out.ownedAfter = await owned(UID);
    out.second = await use(UID, coat.item);
    out.bagKept = await bag(db, coat.item);
    out.wearAfter = await wear(UID, coat.outfit);
    out.ledger = await q(db, 'select qty, meta from public.player_ledger where user_id = $1 and intent = $2', [UID, 'outfit_bundle_use:' + coat.item]);
    /* a reload: the envelope (hr_load's hr_state_of) says owned and worn */
    out.env = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [UID])).outfit;
    await H.character(db, M, UID2, { level: 12, inv: {}, gold: 0 });
    out.other = { owned: await owned(UID2), wear: await wear(UID2, coat.outfit), use: await use(UID2, coat.item) };
    out.forged = await use(UID, 'tower_cinders');
    /* (5) THE BAG'S USE, CLIENT TO SERVER: the bag's own module (src/shell/windows/inventory/outfit-bundle.js) on a hero with one bundle sends
       ONE hr_outfit_bundle_use (the slot, the item, a key: nothing else) through the session's intent, the verb runs on this chain, the
       re-read envelope says owned, and the bag's Use is then off with why */
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1)', [UID2, coat.item]);
    const B = await import(pathToFileURL(join(M.root, 'src/shell/windows/inventory/outfit-bundle.js')).href + V);
    const calls = [];
    const account = { server: { rpc: async (name, args) => {
      calls.push({ name, keys: Object.keys(args).sort().join() });
      await db.query('delete from public.hr_rate_counters where user_id = $1', [UID2]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [UID2]);
      try { return { ok: true, body: await one(db, `select public.${name}($1, $2, $3::uuid)`, [args.p_slot, args.p_item, args.p_idem]) }; }
      finally { await db.query(`select set_config('request.jwt.claim.sub', '', true)`); }
    } } };
    const cs = { slot: 0, status: 'open', env: null, loads: 0, read(k) { return this.env ? this.env[k] : undefined; },
      async load() { this.loads++; this.env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [UID2]); } };
    await cs.load();
    out.client = { before: B.bundleUseBlock(cs, coat.item) };
    out.client.said = await B.useBundle(account, cs, coat.item, (fn, busy, done) => fn().then((x) => (x && x.ok ? { ok: true, said: done(x), busy } : x)));
    Object.assign(out.client, { calls, loads: cs.loads, after: B.bundleUseBlock(cs, coat.item), owned: await owned(UID2), bag: await one(db,
      'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [UID2, coat.item]) });
    /* the bag's two presses (a tradeable item used for good): the first arms, a second on the same bundle within 10 s uses it; another
       bundle or a late press arms again */
    const sc = {};
    out.client.arm = [B.armBundle(sc, coat.item, 0), B.armBundle(sc, coat.item, 4000), B.armBundle(sc, coat.item, 5000), B.armBundle(sc, coat.item, 20000),
      B.armBundle(sc, 'other_bundle', 21000), B.armBundle(sc, coat.item, 22000)];
    return out;
  });
  const hitOpen = r.hit && r.hit.opens && r.hit.opens[0];
  if (!r.miss || r.miss.ok !== true || r.miss.opens[0].outfit !== null || r.miss.haul[coat.item]) bad.push('TCH-OUTFIT a near miss (a roll just over the chance) answered ' + JSON.stringify(r.miss).slice(0, 200));
  if (!hitOpen || hitOpen.outfit !== coat.outfit || hitOpen.bundle !== coat.item || r.hit.haul[coat.item] !== 1 || r.bag !== 1) bad.push(`TCH-OUTFIT key ${r.n}, rolled to find the coat, answered ${JSON.stringify(r.hit).slice(0, 240)} (bag ${r.bag})`);
  if (!r.again || JSON.stringify(r.again.opens) !== JSON.stringify(r.hit.opens) || r.bag !== 1) bad.push('TCH-OUTFIT a replayed press answered ' + JSON.stringify(r.again).slice(0, 160));
  if (r.row.length !== 1 || Number(r.row[0].n) !== r.n || r.row[0].outfit !== coat.outfit || !(r.row[0].outfit_roll < coat.pm.silver * 1000)) bad.push('TCH-OUTFIT the find\'s chest_opens row reads ' + JSON.stringify(r.row));
  const said = 'found the [[item:' + coat.item + ']] in the Hearth Chest (' + M.CH.CHEST_KEYS.find((k) => k.id === 'silver').name + ')';
  if (r.lines.length !== 1 || r.lines[0].body !== said) bad.push(`TCH-OUTFIT the call-out reads ${JSON.stringify(r.lines)}, want one line ${JSON.stringify(said)}`);
  if (!r.quiet || r.quiet.ok !== true || r.quiet.opens[0].outfit !== coat.outfit || r.linesQuiet.length !== 1) bad.push('TCH-OUTFIT a quiet hero\'s find was called out, or not found: ' + JSON.stringify(r.linesQuiet));
  if (!r.full || r.full.error !== 'bag_full' || !r.fits || r.fits.ok !== true) bad.push(`TCH-OUTFIT the bag's worst case misses the bundle: ${JSON.stringify(r.full).slice(0, 120)} / with one held ${JSON.stringify(r.fits).slice(0, 120)}`);
  if ((r.ownedBefore || []).includes(coat.outfit) || !r.wearBefore || r.wearBefore.error !== 'not_owned' || r.bagBefore !== 2) bad.push(`TCH-OUTFIT before the bundle is used the hero owns or wears the coat: ${JSON.stringify([r.ownedBefore, r.wearBefore])}`);
  if (!r.use || r.use.ok !== true || r.use.outfit !== coat.outfit || r.bagAfter !== r.bagBefore - 1 || !(r.ownedAfter || []).includes(coat.outfit)) bad.push(`TCH-OUTFIT the use answered ${JSON.stringify(r.use).slice(0, 200)} (bag ${r.bagBefore} -> ${r.bagAfter}, owned ${r.ownedAfter})`);
  if (!r.useAgain || r.useAgain.version !== r.use.version) bad.push('TCH-OUTFIT a replayed use answered ' + JSON.stringify(r.useAgain).slice(0, 160));
  if (!r.second || r.second.error !== 'already_owned' || r.bagKept !== 1 || r.bagAfter !== 1) bad.push(`TCH-OUTFIT a second bundle on an owned coat answered ${JSON.stringify(r.second)} (bag ${r.bagAfter} -> ${r.bagKept})`);
  if (!r.wearAfter || r.wearAfter.ok !== true || !r.env || r.env.worn !== coat.outfit || !(r.env.owned || []).includes(coat.outfit)) bad.push(`TCH-OUTFIT the owner can't wear it, or a reload says otherwise: ${JSON.stringify([r.wearAfter, r.env]).slice(0, 240)}`);
  if (r.ledger.length !== 1 || Number(r.ledger[0].qty) !== -1 || r.ledger[0].meta.outfit !== coat.outfit || r.ledger[0].meta.from !== 'bag') bad.push('TCH-OUTFIT the use is not journalled once: ' + JSON.stringify(r.ledger));
  if ((r.other.owned || []).includes(coat.outfit) || !r.other.wear || r.other.wear.error !== 'not_owned' || !r.other.use || r.other.use.error !== 'none_held') bad.push('TCH-OUTFIT a hero with no bundle owns, wears or uses the coat: ' + JSON.stringify(r.other).slice(0, 240));
  if (!r.forged || r.forged.error !== 'bad_item') bad.push('TCH-OUTFIT a use of an item no outfit names answered ' + JSON.stringify(r.forged));
  const cl = r.client;
  if (cl.before !== '' || !cl.said || cl.said.ok !== true || cl.said.said !== 'Outfit unlocked: Key Warden' || cl.calls.length !== 1
    || cl.calls[0].name !== 'hr_outfit_bundle_use' || cl.calls[0].keys !== 'p_idem,p_item,p_slot' || cl.loads !== 2
    || cl.after !== 'Outfit already owned' || !(cl.owned || []).includes(coat.outfit) || Number(cl.bag) !== 0) {
    bad.push('TCH-OUTFIT the bag\'s Use, client to server, reads ' + JSON.stringify(cl).slice(0, 300));
  }
  if (JSON.stringify(cl.arm) !== JSON.stringify([false, true, false, false, false, false])) bad.push('TCH-OUTFIT the bag\'s two presses read ' + JSON.stringify(cl.arm));
  return bad;
}

/* TCH-SELFCHECK (lane/fix135-chest-midnight; GitHub run 44144849725, utc-midnight-replay "+0 s", not a clock bug): the migration's
   own §9 must pass on EVERY prng secret. §9(c)'s two keys roll the Bronze Key's 0.2% outfit on the database's own random secret, so
   about 1 replay in 250 one of them finds the bundle before §9(e) plants its find, and §9(e) counted the bag and the named call-out
   from zero. Pinned: a secret on which the probe hero's FIRST key finds the outfit, then the §9 block as the file ships it. */
const SELFCHECK_SECRET = '76531864643bf73c780984cd0b445566ef549ffe13e6e6101a248385d59e78b4';
/* Judged where its file sits in the chain (upTo it): 2027-05-08-catacombs-chest-catalogue.generated.sql adds the Catacomb family's keys after it, a
   later table this §9 (Tyler's four Tower keys) was never written against. */
async function selfcheckArm(_db, M) {
  const { db } = await bootReplay({ upTo: CHEST_SQL.split('/').pop() });
  try { return await selfcheckAt(db, M); } finally { await db.close(); }
}
async function selfcheckAt(db, M) {
  const src = readFileSync(join(M.root, CHEST_SQL), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf('-- ── §9 SELF-CHECK');
  const u = at < 0 ? null : /v_u\s+constant uuid := '([0-9a-f-]{36})'/.exec(src.slice(at));
  if (!u) return ['TCH-SELFCHECK HARNESS: no §9 block (or its probe hero) in ' + CHEST_SQL];
  return H.inTx(db, async () => {
    await db.query(`update public.hr_server_secrets set secret = decode($1, 'hex') where name = 'prng'`, [SELFCHECK_SECRET]);
    const finds = await one(db, `select public.hr_chest_outfit_roll($1::uuid, 0, 1) < (select min(pm) * 1000 from public.hr_chest_outfits where key_id = 'bronze')`, [u[1]]);
    if (finds !== true) return ['TCH-SELFCHECK HARNESS: the pinned secret no longer finds the outfit on the probe hero\'s first key'];
    try { await db.exec(src.slice(at)); } catch (e) { return ['TCH-SELFCHECK §9 refused on a secret whose first key finds the outfit: ' + String(e.message).slice(0, 240)]; }
    return [];
  });
}

const ARMS = { data: dataArm, odds: oddsArm, mint: mintArm, held: heldArm, ring: ringArm, open: openArm, forged: forgedArm, outfit: outfitArm,
  selfcheck: selfcheckArm };
const CHEST_SQL = 'supabase/migrations/2027-04-27-tower-chest.sql';
const MUTANTS = [
  { name: 'the chance ignores the warmth', arm: 'data', want: /^TCH-DATA the server's chance/, fn: 'public.hr_chest_chance_ppm(integer,integer,integer)',
    find: 'least(greatest(coalesce(p_dry, 0), 0)::bigint * l.warmth_step_pm, l.warmth_cap_pm - 1000)', replace: '0' },
  { name: 'the warmth has no cap', arm: 'open', want: /^TCH-OPEN the cap/, fn: 'public.hr_chest_chance_ppm(integer,integer,integer)',
    find: 'least(greatest(coalesce(p_dry, 0), 0)::bigint * l.warmth_step_pm, l.warmth_cap_pm - 1000)', replace: 'greatest(coalesce(p_dry, 0), 0)::bigint * l.warmth_step_pm' },
  { name: 'a stoke multiplies nothing', arm: 'open', want: /^TCH-OPEN (\d stoke|more stokes)/, fn: 'public.hr_chest_chance_ppm(integer,integer,integer)',
    find: '(case when p_stokes = 0 then 1000 else s.pm end)', replace: '1000' },
  { name: 'the roll is twice as kind', arm: 'odds', want: /^TCH-ODDS/, fn: 'public.hr_chest_roll(uuid,integer,bigint,integer,text,text[])',
    find: '  if v_r >= coalesce(p_chance, 0) or', replace: '  if v_r >= 2 * coalesce(p_chance, 0) or' },
  { name: 'the family worn has no weight', arm: 'odds', want: /^TCH-ODDS .*wearing/, fn: 'public.hr_chest_roll(uuid,integer,bigint,integer,text,text[])',
    find: '  if p_own is not null and p_own = any (p_families) then', replace: '  if false then' },
  { name: 'the open rolls a chance it does not record', arm: 'odds', want: /^TCH-ODDS end to end/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: 'v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, v_own, v_fams);', replace: 'v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, 2 * v_chance, v_own, v_fams);' },
  { name: 'a landing mints two keys', arm: 'mint', want: /^TCH-MINT/, fn: 'public.hr_tower_key_mint()',
    find: 'values (new.user_id, new.slot, v_k.item_id, 1)', replace: 'values (new.user_id, new.slot, v_k.item_id, 2)' },
  { name: 'a landing mints the lowest key', arm: 'mint', want: /^TCH-MINT/, fn: 'public.hr_tower_key_mint()',
    find: 'order by k.from_landing desc limit 1', replace: 'order by k.from_landing limit 1' },
  { name: 'a window re-mints the floor it starts after', arm: 'mint', want: /^TCH-MINT a run to floor 130/, fn: 'public.hr_tower_key_mint()',
    find: 'generate_series(coalesce(old.top_floor, new.start_floor - 1) + 1, new.top_floor)', replace: 'generate_series(coalesce(old.top_floor, new.start_floor - 1), new.top_floor)' },
  { name: 'keys drop once a week (the old earn cap)', arm: 'mint', want: /^TCH-MINT .*minted no more keys/, fn: 'public.hr_tower_key_mint()',
    find: '    continue when v_k.key_id is null;', replace: "    continue when v_k.key_id is null or exists (select 1 from public.player_ledger g where g.user_id = new.user_id and g.slot = new.slot and g.intent = 'tower_key' and (g.meta->>'landing')::int = v_l and g.at >= public.hr_chest_week_start(now()));" },
  { name: 'the mint ignores the held limit', arm: 'held', want: /^TCH-HELD/, fn: 'public.hr_tower_key_mint()',
    find: '    if v_held >= v_cap then', replace: '    if false then' },
  { name: 'the held limit reads the bag alone', arm: 'held', want: /^TCH-HELD/, fn: 'public.hr_chest_family_held(uuid,integer,text)',
    find: "+ coalesce((select sum(b.qty)", replace: "+ 0 * coalesce((select sum(b.qty)" },
  { name: 'the held limit counts every family', arm: 'held', want: /^TCH-HELD/, fn: 'public.hr_chest_family_held(uuid,integer,text)',
    find: 'where i.user_id = p_user and k.key_family = p_family', replace: 'where i.user_id = p_user' },
  { name: 'the week counts every family', arm: 'forged', want: /^TCH-FORGED the week's/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: 'o.key_family = v_k.key_family\n', replace: 'true\n' },
  { name: 'the week never resets', arm: 'forged', want: /^TCH-FORGED the week's/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: 'and o.at >= public.hr_chest_week_start(now()))::int;', replace: ')::int;' },
  { name: 'the week is not clamped', arm: 'forged', want: /^TCH-FORGED (the family's week|two keys past)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if v_week + p_count > coalesce(v_f.opens_per_week, 0) then', replace: '  if false then' },
  { name: 'the week counts one key of a press', arm: 'forged', want: /^TCH-FORGED two keys past/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if v_week + p_count > coalesce(v_f.opens_per_week, 0) then', replace: '  if v_week + 1 > coalesce(v_f.opens_per_week, 0) then' },
  { name: 'the key is not taken', arm: 'forged', want: /^TCH-FORGED (a used key|the replayed)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '    v_need := case when v_rest > 0 then', replace: '    v_need := case when false then' },
  { name: 'a new key skips the ring', arm: 'ring', want: /^TCH-RING a key dropped/, fn: 'public.hr_key_ring_on_bag()',
    find: '  if not public.hr_key_ring_owned(new.user_id, new.slot) then return null; end if;', replace: '  return null;' },
  { name: 'the purchase does not sort the bag', arm: 'ring', want: /^TCH-RING the purchase left/, fn: 'public.hr_key_ring_on_unlock()',
    find: '  v_n := public.hr_key_ring_sweep(new.user_id, new.slot);', replace: '  v_n := 0;' },
  { name: 'the open ignores the ring', arm: 'ring', want: /^TCH-RING a key from the ring/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: "  v_ring := least((v_keys->>'ring')::bigint, p_count);", replace: '  v_ring := 0;' },
  { name: 'the ring is sold while the Tower is hidden', arm: 'ring', want: /^TCH-RING the Tower hidden/, fn: 'public.hr_key_ring_gate()',
    find: "  if not public.hr_feature_on('burning_tower', new.user_id) then", replace: '  if false then' },
  { name: 'a key into a full bag ignores the ring', arm: 'ring', want: /^TCH-RING a key withdrawn into a full bag with a ring/, fn: 'public.hr_bank_move_stack(uuid,integer,text,bigint,text,integer)',
    find: '       and not (exists (select 1 from public.hr_chest_keys k where k.item_id = p_item) and public.hr_key_ring_owned(p_user, p_slot)) then', replace: '       then' },
  { name: 'the held count misses the ring', arm: 'ring', want: /^TCH-RING a key dropped/, fn: 'public.hr_chest_family_held(uuid,integer,text)',
    find: '+ coalesce((select sum(r.qty) from public.player_key_ring r', replace: '+ 0 * coalesce((select sum(r.qty) from public.player_key_ring r' },
  { name: 'the count is not clamped', arm: 'forged', want: /^TCH-FORGED 21 keys/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if p_count is null or p_count < 1 or p_count > v_lk.per_call then', replace: '  if p_count is null or p_count < 1 then' },
  { name: 'the stokes are free', arm: 'open', want: /^TCH-OPEN (\d stoke|short)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '      v_spent := v_spent + v_cost;', replace: '      v_spent := v_spent;' },
  { name: 'a weapon leaves the Hearth warm', arm: 'open', want: /^TCH-OPEN (a weapon left|key \d+ opened)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '      v_dry := case when v_weapon is null and v_armor is null then v_dry + 1 else 0 end;', replace: '      v_dry := v_dry + 1;' },
  { name: 'a hero in a hunt opens the chest', arm: 'forged', want: /^TCH-FORGED a hero on a climb/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: "  if v_s.id is not null then return", replace: "  if false then return" },
  { name: 'a key with no weapons opens', arm: 'forged', want: /^TCH-FORGED a key with no weapons/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if cardinality(v_fams) <> (select count(*) from public.hr_chest_families) then', replace: '  if cardinality(v_fams) = 0 and false then' },
  { name: 'the bag is checked after the roll', arm: 'forged', want: /^TCH-FORGED a full bag/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if v_new > 0 and v_stacks + v_new > v_cap then', replace: '  if false then' },
  /* TCH-OUTFIT: the Key Warden (lane/c-sweeps-coat-drop) */
  { name: 'the outfit rides the weapon\'s stream', arm: 'outfit', want: /^TCH-OUTFIT the outfit roll is not its own stream/, fn: 'public.hr_chest_outfit_roll(uuid,integer,bigint)',
    find: "'chest:' || p_n || ':outfit'", replace: "'chest:' || p_n" },
  { name: 'the open finds an outfit at twice its chance', arm: 'outfit', want: /^TCH-OUTFIT a near miss/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '        v_cum := v_cum + v_orow.pm * 1000;', replace: '        v_cum := v_cum + v_orow.pm * 2000;' },
  { name: 'the bag\'s worst case forgets the bundle', arm: 'outfit', want: /^TCH-OUTFIT the bag's worst case/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '+ least(p_count, (select count(*) from public.hr_chest_outfits o', replace: '+ 0 * least(p_count, (select count(*) from public.hr_chest_outfits o' },
  { name: 'a find is not called out', arm: 'outfit', want: /^TCH-OUTFIT the call-out/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '    if jsonb_array_length(v_finds) > 0\n', replace: '    if false\n' },
  { name: 'a quiet hero is called out', arm: 'outfit', want: /^TCH-OUTFIT a quiet hero/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: 'and not coalesce((select ps.presence_quiet', replace: 'and not coalesce(false and (select ps.presence_quiet' },
  { name: 'every hero owns a bundle outfit', arm: 'outfit', want: /^TCH-OUTFIT (before the bundle|a hero with no bundle)/, fn: 'public.hr_outfit_owned(uuid,integer)',
    find: 'then exists (select 1 from public.player_cosmetics c', replace: 'then true or exists (select 1 from public.player_cosmetics c' },
  { name: 'an owned outfit burns another bundle', arm: 'outfit', want: /^(TCH-OUTFIT a second bundle|THREW)/, fn: 'public.hr_outfit_bundle_use(integer,text,uuid)',
    find: '  if exists (select 1 from public.player_cosmetics c where c.user_id = v_uid', replace: '  if false and exists (select 1 from public.player_cosmetics c where c.user_id = v_uid' },
  { name: 'the use takes no bundle', arm: 'outfit', want: /^TCH-OUTFIT the use answered/, fn: 'public.hr_outfit_bundle_use(integer,text,uuid)',
    find: '  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(p_item, 1), true);',
    replace: "  v_take := jsonb_build_object('ok', true, 'from', jsonb_build_object('bag', jsonb_build_object(p_item, 1)));" },
  { name: 'the bag\'s Use stays on for an owned outfit', arm: 'outfit', want: /^TCH-OUTFIT the bag's Use/, file: 'src/shell/windows/inventory/outfit-bundle.js',
    from: "  return o && o.owned.has(outfit) ? t('bag.bundle_owned') : '';", to: "  return '';" },
  { name: 'one press uses a bundle', arm: 'outfit', want: /^TCH-OUTFIT the bag's two presses/, file: 'src/shell/windows/inventory/outfit-bundle.js',
    from: '  if (a && a.id === id && now - a.at <= ARM_MS) { sc.bundleArm = null; return true; }', to: '  if (true) { sc.bundleArm = null; return true; }' },
  { name: 'the data\'s Silver coat chance moves', arm: 'outfit', want: /^TCH-OUTFIT the coat's chances/, file: 'src/data/chests.js',
    from: 'pm: Object.freeze({ bronze: 2, silver: 3, gold: 4, platinum: 5,', to: 'pm: Object.freeze({ bronze: 2, silver: 6, gold: 4, platinum: 5,' },
  { name: 'the data\'s warmth cap moves', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js', from: '  warmthCapPm: 3000,', to: '  warmthCapPm: 2500,' },
  { name: 'the data\'s Platinum odds move', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js',
    from: "export const KEY_ODDS = Object.freeze({ firstPm: 160, fallPm: 500 });", to: "export const KEY_ODDS = Object.freeze({ firstPm: 160, fallPm: 600 });" },
  { name: 'a key opens a band early', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js',
    from: '  while (towerLevelAt(f, rules) < iL) f += every;', to: '  while (towerLevelAt(f, rules) < iL - 20) f += every;' },
  { name: 'the data\'s Tower week moves', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js',
    from: "name: 'Tower', opensPerWeek: 6, heldMax: 30,", to: "name: 'Tower', opensPerWeek: 7, heldMax: 30," },
  /* TCH-SELFCHECK: §9(e) counting from zero again (the shape GitHub run 44144849725 caught at random) */
  { name: '§9(e) counts the bag from zero', arm: 'selfcheck', want: /^TCH-SELFCHECK §9 refused/, file: CHEST_SQL,
    from: 'and item_id = v_fam.item_id) is distinct from v_had + 1', to: 'and item_id = v_fam.item_id) is distinct from 1' },
  { name: '§9(e) counts the call-out from zero', arm: 'selfcheck', want: /^TCH-SELFCHECK §9 refused/, file: CHEST_SQL,
    from: "and body = v_body) <> v_said + 1", to: "and body = v_body) <> 1" },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await C.boot(); } catch (e) { console.error('tower-chest: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      let got = [];
      if (m.fn) {
        const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
        if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 70))}`); process.exit(2); }
        await db.exec(def.replace(m.find, () => m.replace));
        try { got = await runArm(db, await load(ROOT), m.arm); } finally { await db.exec(def); }
      } else {
        const dir = mkdtempSync(join(tmpdir(), 'hr-tch-'));
        try {
          /* src/shell and src/render: TCH-OUTFIT drives the bag's own outfit-bundle module against the chain */
          for (const d of ['src/core', 'src/data', 'src/session', 'src/shell', 'src/render', join('supabase', 'functions', 'hr-accrue'), 'tests/hunt-core/fixtures']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
          cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
          cpSync(join(ROOT, CHEST_SQL), join(dir, CHEST_SQL));   /* TCH-SELFCHECK runs the file's own §9 */
          const p = join(dir, m.file);
          let src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
          if (src.split(m.from).length !== 2) { console.error(`HARNESS: ${m.file} has no single ${JSON.stringify(m.from.slice(0, 70))}`); process.exit(2); }
          writeFileSync(p, src.replace(m.from, () => m.to));
          let M;
          try { M = await load(dir); } catch (e) { got = ['TCH-DATA THREW loading the mutated tree: ' + String(e.message).slice(0, 160)]; }
          if (M) got = await runArm(db, M, m.arm);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `tower-chest --mutate: ${escaped} ESCAPED` : `tower-chest --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const M = await load(ROOT);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `tower-chest: ${bad.length} FAILED` : 'tower-chest: green (the table, the odds, the mint on both doors with no earn cap, the held limit, the Key Ring, the open, six a family a week, every forged value refused, the Key Warden found, used and worn)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
