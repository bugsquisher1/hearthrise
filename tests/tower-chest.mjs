#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/tower-chest.mjs — THE HEARTH CHEST: A KEY FROM EVERY LANDING (BOTH DOORS), AN OPEN ON THE SERVER'S DICE AT THE DESIGN'S ODDS, THE
//   HEARTH'S WARMTH AND THE STOKES, AND EVERY FORGED VALUE REFUSED (lane/c-tower-chest; Tyler 2026-11-14, the board's "2026-11-14 The Burning
//   Tower" §5; src/data/chests.js, supabase/migrations/2027-04-27-tower-chest.sql). On the replayed chain with the shipped engine.
//
//   node tests/tower-chest.mjs              the guard
//   node tests/tower-chest.mjs --arm=odds   one arm
//   node tests/tower-chest.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: src/data/chests.js, supabase/migrations/2027-04-27-tower-chest.sql
//
//   TCH-DATA    the table is Tyler's (16 / 8 / 4.5 / 2%, x1.7 / 2.5 / 3.3 for 3 / 7 / 12 keys' Cinders, +4% of base a dry key to 3x at 50);
//               the design's warmth table read back through src/data/chests.js; the server's chance (hr_chest_chance_ppm) and the data's
//               (chestChancePpm) agree on every key, warmth 0..60 and stoke 0..3; the open table (keyForLanding: the top row open-ended);
//               the salts are the highest tempering tier's at or under each key's weapons (the coherence pass's C4); the catalogue rows
//               are the data's; the load-time rule refuses a higher key with better odds
//   TCH-ODDS    the server's roll (hr_chest_roll) over 20,000 keys a cell: a weapon at the chance it was handed (each key's base, a warm and
//               stoked cell), within 4.5 standard deviations; half the weapons the family worn, the rest even over the other six; no family
//               worn, even over all seven
//   TCH-MINT    a climb past its landings, BOTH PATHS (CLAUDE.md §4: the browser closed, the world tick; the hunt viewed, the player's
//               settle): one key a landing row in the bag (the landing's own key row), one tower_key ledger row each, the two doors alike;
//               a second climb the same week through the same landing mints nothing more
//   TCH-OPEN    the open on a real hero: a key's chance is the base x its warmth x its stoke, the warmth grows by a dry key and caps at 3x,
//               a weapon cools it to nothing; a stoke multiplies the chance and burns its Cinders from the bag, then Storage, net of what
//               the press paid; a press short of Cinders stokes what they cover; the saved default stokes a key sent with none; the
//               haul is the key's row; every move journalled
//   TCH-FORGED  a forged chest, key, count or stoke, a key with no weapons built, a count over the keys held, a used key, a replayed key,
//               a key reused for another press, a hero in a hunt, a full bag (before any roll) and the day's clamp are each refused and
//               move nothing; the client can call the two verbs and none of the helpers, and no verb takes a chance, warmth or family
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const C = (await import('./tower-climb.mjs')).HARNESS;
const { one, q } = H;
const ROOT = H.ROOT;
const UID = C.UID;
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
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
   weapon a family: gear-tiers.js WEAPON_FAMILIES), so the open can play before the tower weapons are built */
async function hero(db, M, inv = {}, ready = ['bronze', 'silver', 'gold', 'platinum']) {
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
  const { CHEST_KEYS: K, CHEST_LUCK: L, chestChancePpm, keyForLanding, keySalts, validateChests, stokeCost } = M.CH;
  const by = Object.fromEntries(K.map((k) => [k.id, k]));
  /* Tyler's numbers (2026-11-14) */
  const rows = K.map((k) => `${k.id}@${k.from}=${k.weaponPm}`).join(',');
  if (rows !== 'bronze@10=160,silver@40=80,gold@70=45,platinum@100=20') bad.push('TCH-DATA the key table reads ' + rows);
  if (JSON.stringify(L.stokes) !== JSON.stringify([{ pm: 1700, keys: 3 }, { pm: 2500, keys: 7 }, { pm: 3300, keys: 12 }])) bad.push('TCH-DATA the stokes read ' + JSON.stringify(L.stokes));
  if (L.warmthStepPm !== 40 || L.warmthCapPm !== 3000 || L.ownPm !== 500) bad.push(`TCH-DATA the warmth is ${L.warmthStepPm} a dry key to ${L.warmthCapPm}, own ${L.ownPm}`);
  /* the design's warmth table (the board's §5 "(a) The Hearth's warmth"), in hundredths of a percent */
  const table = { bronze: [1600, 1920, 2240, 2880, 3840, 4800], silver: [800, 960, 1120, 1440, 1920, 2400], gold: [450, 540, 630, 810, 1080, 1350], platinum: [200, 240, 280, 360, 480, 600] };
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
  const lands = [10, 30, 40, 60, 70, 90, 100, 130, 300].map((l) => keyForLanding(l).id).join(',');
  if (lands !== 'bronze,bronze,silver,silver,gold,gold,platinum,platinum,platinum' || keyForLanding(9) !== null) bad.push('TCH-DATA the landings hand out ' + lands);
  const sqlLands = await one(db, `select string_agg((select k.key_id from public.hr_chest_keys k where k.from_landing <= l order by k.from_landing desc limit 1), ',' order by l)
    from unnest(array[10, 30, 40, 60, 70, 90, 100, 130, 300]) l`);
  if (sqlLands !== lands) bad.push('TCH-DATA the server\'s open table reads ' + sqlLands);
  /* C4: the salts of the highest tempering tier at or under the key's weapons, never a tier under the hero's gear when a ladder exists */
  const tiers = Object.keys(M.TM.TEMPER_MATERIALS).map(Number);
  for (const k of K) {
    const t = Math.max(...tiers.filter((x) => x <= k.weaponTier));
    if (keySalts(k) !== M.TM.TEMPER_MATERIALS[t].item) bad.push(`TCH-DATA ${k.id} pays ${keySalts(k)}, not tier ${t}'s ${M.TM.TEMPER_MATERIALS[t].item}`);
  }
  /* the catalogue rows are the data's */
  const cat = await q(db, 'select key_id, item_id, from_landing, weapon_pm, cinders, salts_item, salts_qty, food_item, food_qty, skill_plus from public.hr_chest_keys order by from_landing');
  const want = K.map((k) => [k.id, k.item, k.from, k.weaponPm, k.cinders, keySalts(k), k.saltsQty, k.food, k.foodQty, k.skillPlus].join(':')).join('|');
  const got = cat.map((r) => [r.key_id, r.item_id, r.from_landing, r.weapon_pm, r.cinders, r.salts_item, r.salts_qty, r.food_item, r.food_qty, r.skill_plus].join(':')).join('|');
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
  return bad;
}

/* ── TCH-MINT ─────────────────────────────────────────────────────────────── */
async function mintArm(db, M) {
  const bad = [];
  const runs = {};
  for (const door of ['closed', 'viewed']) {
    const r = await H.inTx(db, async () => {
      const h = await C.climber(db, M, {});
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
      if (!s.landings.length) { bad.push(`${tag} CONTROL: ${when} took no landing`); continue; }
      const want = {};
      for (const l of s.landings) { const k = M.CH.keyForLanding(l); want[k.item] = (want[k.item] || 0) + 1; }
      if (JSON.stringify(s.keys) !== JSON.stringify(want)) bad.push(`${tag} ${when}: the bag holds ${JSON.stringify(s.keys)} for landings ${s.landings}, not ${JSON.stringify(want)}`);
      if (s.mint_rows !== s.landings.length || s.mint_bad !== 0) bad.push(`${tag} ${when}: ${s.mint_rows} tower_key ledger rows (${s.mint_bad} malformed) for ${s.landings.length} landings`);
    }
    if (r.second.landings.filter((l) => r.first.landings.includes(l)).length !== r.first.landings.length) bad.push(`${tag} the second climb lost a landing row`);
  }
  /* THE OPEN TABLE ON THE MINT: landings past a climb's reach, written the way the settle writes them (hr_tower_write's insert, on conflict
     do nothing), each the key of the highest row at or under it; a landing written twice is one key */
  const table = await H.inTx(db, async () => {
    await H.character(db, M, UID, { level: 12, inv: {}, gold: 0 });
    const sid = idem();
    for (const l of [10, 30, 40, 60, 70, 100, 130, 130]) {
      await db.query('insert into public.tower_landings (user_id, slot, week, landing, session_id, at) values ($1, 0, public.hr_tower_week(now()), $2, $3::uuid, now()) on conflict do nothing', [UID, l, sid]);
    }
    return state(db);
  });
  const want = {};
  for (const l of [10, 30, 40, 60, 70, 100, 130]) { const k = M.CH.keyForLanding(l); want[k.item] = (want[k.item] || 0) + 1; }
  const sorted = (o) => JSON.stringify(Object.keys(o || {}).sort().map((x) => [x, o[x]]));
  if (sorted(table.keys) !== sorted(want) || table.mint_rows !== 7) bad.push(`TCH-MINT landings 10 to 130 minted ${JSON.stringify(table.keys)} (${table.mint_rows} rows), not ${JSON.stringify(want)}`);
  if (runs.closed && runs.viewed && JSON.stringify(runs.closed.first) !== JSON.stringify(runs.viewed.first)) {
    bad.push(`TCH-MINT the browser closed mints ${JSON.stringify(runs.closed.first)}, the hunt viewed ${JSON.stringify(runs.viewed.first)}`);
  }
  return bad;
}
/* A SECOND CLIMB by the same hero, from floor 1 again, 40 minutes on (the server clock pinned: hr.test_now, this transaction), so its
   windows follow the first climb's: the same session setup as tests/tower-climb.mjs climber, on the hero that already exists. */
async function climbAgain(db) {
  await db.query("select set_config('hr.test_now', (transaction_timestamp() + interval '40 minutes')::text, true)");
  const r = await call(db, 'select public.hr_tower_start(0, 1, $1::uuid)', [idem()]);
  if (!r || r.ok !== true) throw new Error('the second hr_tower_start refused: ' + JSON.stringify(r));
  const sid = r.session_id;
  const t = "date_trunc('second', now() - make_interval(mins => 25))";
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
  return { sid, inst, from };
}
async function state(db) {
  return one(db, `select jsonb_build_object(
      'landings', coalesce((select jsonb_agg(l.landing order by l.landing) from public.tower_landings l where l.user_id = $1 and l.slot = 0), '[]'::jsonb),
      'keys', coalesce((select jsonb_object_agg(i.item_id, i.qty) from public.player_inventory i where i.user_id = $1 and i.slot = 0 and i.item_id like 'tower\\_key\\_%'), '{}'::jsonb),
      'mint_rows', (select count(*) from public.player_ledger g where g.user_id = $1 and g.intent = 'tower_key'),
      'mint_bad', (select count(*) from public.player_ledger g where g.user_id = $1 and g.intent = 'tower_key' and (g.qty <> 1 or g.session_id is null or g.kind <> 'hunt')))`, [UID]);
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
    await db.query('update public.chest_luck set dry = 49 where user_id = $1 and slot = 0', [UID]);
    for (let i = 0; i < 3; i++) await open(db, 'platinum', 1, 0);
    out.capRows = (await opensOf(db)).slice(-3);
    /* (3) A WEAPON COOLS IT: a Bronze Key three times stoked at 50 dry keys is a sure thing (160 x 3 x 3.3 > 100%) */
    await db.query('update public.chest_luck set dry = 50 where user_id = $1 and slot = 0', [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 600) on conflict (user_id, slot, item_id) do update set qty = 600", [UID]);
    out.sure = await open(db, 'bronze', 1, 3);
    out.afterSure = await one(db, 'select dry from public.chest_luck where user_id = $1 and slot = 0', [UID]);
    out.weaponInBag = out.sure && out.sure.opens && out.sure.opens[0].weapon ? await bag(db, out.sure.opens[0].weapon) : null;
    out.own = own;
    /* (4) THE STOKES: each count at a cold Hearth, its chance and its Cinders: 100 in the bag, 2,000 in Storage */
    await db.query("delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'tower_cinders'", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 100)", [UID]);
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_cinders', 2000) on conflict (user_id, item_id) do update set qty = 2000", [UID]);
    out.stoke = [];
    for (const s of [1, 2, 3]) {
      await db.query('update public.chest_luck set dry = 0 where user_id = $1 and slot = 0', [UID]);
      const before = [await bag(db, 'tower_cinders'), await store(db, 'tower_cinders')];
      const res = await open(db, 'bronze', 1, s);
      out.stoke.push({ s, res, before, after: [await bag(db, 'tower_cinders'), await store(db, 'tower_cinders')],
        took: await q(db, `select item_id, qty, meta->'took' as took from public.player_ledger where user_id = $1 and intent = $2 and qty < 0 order by item_id`, [UID, 'chest_open:great_hearth:bronze:1:' + s]) });
    }
    /* (5) SHORT OF CINDERS: none anywhere, three Bronze Keys asked to stoke once: each goes in with what the press has paid by its turn */
    await db.query("delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'tower_cinders'", [UID]);
    await db.query("delete from public.account_bank where user_id = $1 and item_id = 'tower_cinders'", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'tower_cinders', 100)", [UID]);
    await db.query('update public.chest_luck set dry = 0 where user_id = $1 and slot = 0', [UID]);
    out.short = await open(db, 'bronze', 3, 1);
    out.shortCinders = await bag(db, 'tower_cinders');
    /* (6) THE DEFAULT: Silver saved at two stokes, sent with none */
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'tower_cinders', 5000) on conflict (user_id, item_id) do update set qty = 5000", [UID]);
    out.def = await call(db, 'select public.hr_chest_stoke_default(0, $1, $2, $3::uuid)', ['silver', 2, idem()]);
    await db.query('update public.chest_luck set dry = 0 where user_id = $1 and slot = 0', [UID]);
    out.defOpen = await open(db, 'silver', 1, null);
    /* (7) THE HAUL: one cold, unstoked Silver Key on a fresh count of its own items */
    for (const it of ['fine_temper_salts', 'cooked_lobster']) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, it]);
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
    await hero(db, M, { tower_key_bronze: 1, tower_key_gold: 3 }, ['bronze']);
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
    for (const it of ['temper_salts', 'cooked_shrimp', 'tower_cinders']) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [UID, it]);
    await db.query('update public.player_state set bank_cap = (select count(*) from public.player_inventory where user_id = $1 and slot = 0) where user_id = $1 and slot = 0', [UID]);
    const n0 = Number(await one(db, 'select opens from public.chest_luck where user_id = $1 and slot = 0', [UID]));
    out.full = await open(db, 'bronze', 1, 0);
    out.fullRows = [n0, Number(await one(db, 'select opens from public.chest_luck where user_id = $1 and slot = 0', [UID])), Number(await one(db, 'select count(*) from public.chest_opens where user_id = $1', [UID]))];
    await db.query('update public.player_state set bank_cap = 200 where user_id = $1 and slot = 0', [UID]);
    /* the day's clamp, counted from chest_opens */
    const per = Number(await one(db, 'select per_day from public.hr_chest_luck where id'));
    await db.query(`insert into public.chest_opens (user_id, slot, n, chest_id, key_id, stokes, cinders_spent, dry, chance_ppm, roll, intent_id)
      select $1, 0, 1000 + g, 'great_hearth', 'bronze', 0, 0, 0, 0, 999999, $2::uuid from generate_series(1, $3) g`, [UID, idem(), per - 1]);
    out.day = await open(db, 'bronze', 1, 0);
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
  if (!r.day || r.day.error !== 'day_limit') bad.push('TCH-FORGED the day\'s clamp answered ' + JSON.stringify(r.day).slice(0, 160));
  if (!r.off || r.off.error !== 'feature_off' || !r.offDefault || r.offDefault.error !== 'feature_off') bad.push(`TCH-FORGED the switch off answered ${JSON.stringify(r.off)} / ${JSON.stringify(r.offDefault)}`);
  if (r.badDefault[0].error !== 'bad_stokes' || r.badDefault[1].error !== 'bad_key') bad.push('TCH-FORGED a forged default answered ' + JSON.stringify(r.badDefault));
  /* the client's reach: two verbs, no helper; no verb takes a chance, a warmth, a family or a weapon */
  const priv = await q(db, `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon,
      coalesce(array_to_string(p.proargnames, ','), '') as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('hr_chest_open', 'hr_chest_stoke_default', 'hr_chest_roll', 'hr_chest_chance_ppm', 'hr_chest_held', 'hr_chest_section', 'hr_tower_key_mint')`);
  for (const p of priv) {
    const verb = ['hr_chest_open', 'hr_chest_stoke_default'].includes(p.proname);
    if (p.auth !== verb || p.anon) bad.push(`TCH-FORGED ${p.proname}: authenticated ${p.auth}, anon ${p.anon}`);
    if (verb && /chance|dry|warm|family|weapon|cinder|roll|price/.test(p.args)) bad.push(`TCH-FORGED ${p.proname} takes ${p.args}`);
  }
  if (priv.length !== 7) bad.push('TCH-FORGED HARNESS: found ' + priv.map((p) => p.proname));
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

const ARMS = { data: dataArm, odds: oddsArm, mint: mintArm, open: openArm, forged: forgedArm };
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
  { name: 'a landing mints two keys', arm: 'mint', want: /^TCH-MINT/, fn: 'public.hr_tower_key_mint()',
    find: 'values (new.user_id, new.slot, v_k.item_id, 1)', replace: 'values (new.user_id, new.slot, v_k.item_id, 2)' },
  { name: 'a landing mints the lowest key', arm: 'mint', want: /^TCH-MINT/, fn: 'public.hr_tower_key_mint()',
    find: 'order by from_landing desc limit 1', replace: 'order by from_landing limit 1' },
  { name: 'the key is not taken', arm: 'forged', want: /^TCH-FORGED (a used key|the replayed)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: "jsonb_build_object(v_k.item_id, p_count)\n                || case", replace: "jsonb_build_object(v_k.item_id, 0)\n                || case" },
  { name: 'the count is not clamped', arm: 'forged', want: /^TCH-FORGED 21 keys/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if p_count is null or p_count < 1 or p_count > v_lk.per_call then', replace: '  if p_count is null or p_count < 1 then' },
  { name: 'the stokes are free', arm: 'open', want: /^TCH-OPEN (\d stoke|short)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '      v_spent := v_spent + v_cost;', replace: '      v_spent := v_spent;' },
  { name: 'a weapon leaves the Hearth warm', arm: 'open', want: /^TCH-OPEN (a weapon left|key \d+ opened)/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '      v_dry := case when v_weapon is null then v_dry + 1 else 0 end;', replace: '      v_dry := v_dry + 1;' },
  { name: 'a hero in a hunt opens the chest', arm: 'forged', want: /^TCH-FORGED a hero on a climb/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: "  if v_s.id is not null then return", replace: "  if false then return" },
  { name: 'a key with no weapons opens', arm: 'forged', want: /^TCH-FORGED a key with no weapons/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if cardinality(v_fams) <> (select count(*) from public.hr_chest_families) then', replace: '  if cardinality(v_fams) = 0 and false then' },
  { name: 'the bag is checked after the roll', arm: 'forged', want: /^TCH-FORGED a full bag/, fn: 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
    find: '  if v_new > 0 and v_stacks + v_new > v_cap then', replace: '  if false then' },
  { name: 'the data\'s warmth cap moves', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js', from: '  warmthCapPm: 3000,', to: '  warmthCapPm: 2500,' },
  { name: 'the data\'s Platinum odds move', arm: 'data', want: /^TCH-DATA/, file: 'src/data/chests.js',
    from: "key('platinum', 'tower_key_platinum', 'Platinum Key', 100, 20,", to: "key('platinum', 'tower_key_platinum', 'Platinum Key', 100, 40," },
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
          for (const d of ['src/core', 'src/data', 'src/session', join('supabase', 'functions', 'hr-accrue'), 'tests/hunt-core/fixtures']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
          cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
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
  console.log(bad.length ? `tower-chest: ${bad.length} FAILED` : 'tower-chest: green (the table, the odds, the mint on both doors, the open, every forged value refused)');
  process.exit(bad.length ? 1 : 0);
}

void CHEST_SQL;
if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
