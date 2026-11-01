#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/house-pelts.mjs — A HERO EARNS THE KEEP'S BEAR PELTS AND BUYS THE KEEP (Andy's report, 2026-10-31: "don't forget
// about getting bear pelts into the game or changing the house level 5 requirements").
//
//   node tests/house-pelts.mjs             the guard
//   node tests/house-pelts.mjs --only=HP-2 one arm
//   node tests/house-pelts.mjs --selftest  every planted defect must turn its arm red
//
// Real RPCs and the REAL hunt settle (hunt-settle.js over the replayed chain, the tests/hunt-sessions-settle.mjs harness),
// on the real Glade and the real tables, production untouched:
//   HP-1 CLOSED + THE BUY  browser closed (the world tick): a Level 24 hero at Mosslight Glade with a pull of 3 kills Brook
//                Bears and is credited 5 Bear Pelts by the settle, never refused (the 10-29 raw_bear_meat refusal: bound 0,
//                value_over). Those pelts, and only the rest of the price seeded, buy the ladder to the Keep through
//                hr_unlock_buy; then the Trophy Room to its top visible rung.
//   HP-2 VIEWED  hunt viewed (the player's settle): the same hunt on the other door credits a pelt the same way.
//   HP-3 HELD    the Castle and the rung 5s are refused by name, hr_home_view stops at the Keep and at four rungs a room,
//                and no sellable row costs an item the catalogue cannot reach.
//   HP-4 SELF-CHECK the two 2027-02-16 files refuse their own apply on a visible rung with a dead item, a sold Castle, and a
//                bear whose kill bound forgets the pelt; a second apply of both, with the catalogue that carries them forward
//                (the next full replace, the party pull's), is byte-identical.
//   HP-5 THE WORDS (no database) no Brook Bear below a pull of 3 (the pull's own rows: a lone hero asks for it, and a Glade
//                party's default of 3 meets it, hunt-grounds.js partyPull), and the player reading for a pelt is told: the item tip's
//                "Comes from" names the bear and not the six monsters no ground spawns, the House's short cost line and the
//                Glade's page say a bigger pull brings it, a held-enough line and an as-built creature's item say nothing.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plant } from './hunt-core/fixtures/h1.js';
import { isMain } from './_is-main.mjs';

const OFFERS = '2027-02-16-house-pelts-unlock-offers.generated.sql';
const BOUNDS = '2027-02-16-house-pelts-hunt-sessions-catalogue.generated.sql';
/* The newest forward catalogue, applied after these two: a full replace that carries the bear's bound. */
const CARRIES = '2027-02-18-craft-economy-hunt-sessions-catalogue.generated.sql';
const GLADE = 'mosslight_glade';
const NEEDED = 5;
const STEP_MS = 2 * 60000;           // one settle fire's reach (HUNT_SETTLE_SPAN_MS: a longer backlog lands in slices)
const MAX_HOURS = 3;                 // past the hour the pace promises (drop-tables big-pull): a miss here is a wall
const idem = () => crypto.randomUUID();

async function q(db, sql, p) { return (await db.query(sql, p)).rows; }
async function one(db, sql, p) { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; }
const asUser = (db, uid) => db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
const calm = (db) => db.query('delete from public.hr_rate_counters');
const bagOf = async (db, uid, item) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text', [uid, item]));

/* A hero on the real Glade MAX_HOURS + 1 ago, its pull at 3 (the smallest that brings the bear). */
async function gladeHunter(db, H, M, uid) {
  await H.character(db, M, uid, { level: 24, gold: 5000000, inv: {} });
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await asUser(db, uid);
  await calm(db);
  const d = await one(db, 'select public.hr_hunt_density_set(0, $1, 3, $2::uuid)', [GLADE, idem()]);
  if (!d || d.ok !== true) throw new Error('density refused: ' + JSON.stringify(d));
  const e = await one(db, "select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)", [GLADE, idem()]);
  if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
  await asUser(db, '');
  const sid = e.session.id;
  const t = `date_trunc('second', now() - make_interval(hours => ${MAX_HOURS + 1}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  await db.query('update public.player_state set stamina_ms = 43200000, stamina_at = (select hunt_from from public.hunt_sessions where id = $2) where user_id = $1 and slot = 0', [uid, sid]);
  const from = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [inst]));
  return { sid, from };
}

const settleOf = (H, M, db, uid, h, door) => {
  const exec = H.makeExec(db);
  return (atMs) => M.HS.settleHunt(door === 'closed'
    ? { exec, user: uid, slot: 0, mode: 'tick', session: h.sid, grounds: {}, atMs }
    : { exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true, grounds: {}, atMs, minWindowMs: 0 });
};

/** Settle on one door until the bag holds `want` pelts. Answers { pelts, atMs, hours, problems }. */
async function hunt(db, H, M, uid, h, door, want) {
  const go = settleOf(H, M, db, uid, h, door);
  const problems = [];
  let t = h.from;
  const end = h.from + MAX_HOURS * 3600000;
  let pelts = 0;
  while (t < end && pelts < want) {
    t += STEP_MS;
    const r = await go(t);
    if (!r || r.outcome !== 'paid') { problems.push(`${door}: the settle to +${(t - h.from) / 60000} min answered ${r && r.outcome}/${r && r.reason}`); break; }
    if (r.ended) { problems.push(`${door}: the hunt ended at +${(t - h.from) / 60000} min`); break; }
    pelts = await bagOf(db, uid, 'bear_pelt');
  }
  return { pelts, atMs: t, hours: (t - h.from) / 3600000, problems };
}

/* Leave and settle home, the way a player comes back to town (tests/tally-tasks.mjs leaveAt). */
async function comeHome(db, H, M, uid, h, atMs) {
  await asUser(db, uid);
  await calm(db);
  const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
  await asUser(db, '');
  if (!lv || lv.ok !== true) throw new Error('the leave was refused: ' + JSON.stringify(lv));
  await db.query('update public.hunt_sessions set leave_at = to_timestamp($2::bigint / 1000.0) where id = $1', [h.sid, atMs + 60000]);
  const go = settleOf(H, M, db, uid, h, 'closed');
  for (let i = 0; i < 4; i++) {
    const r = await go(atMs + 120000);
    if (!r || r.ended || r.outcome !== 'paid') break;
  }
  return one(db, 'select ended_at is not null from public.hunt_sessions where id = $1', [h.sid]);
}

/** One purchase as the edge makes it: the engine names the offer. A raised refusal answers { error }, as the edge reads it. */
async function buy(db, uid, offer) {
  await asUser(db, uid);
  await calm(db);
  const ver = Number(await one(db, 'select version::text from public.player_state where user_id = $1 and slot = 0', [uid]));
  await db.query('savepoint hp_buy');
  await db.exec('set local role hr_engine');
  try {
    const v = await one(db, 'select public.hr_unlock_buy($1, 0, $2, $4::uuid, $3) v', [uid, ver, offer, idem()]);
    await db.exec('reset role');
    return v;
  } catch (e) {
    await db.query('rollback to savepoint hp_buy');
    await db.exec('reset role');
    return { error: String(e && e.message).split(/[\s:]/)[0], raised: String(e && e.message) };
  }
}
/* A hero's materials for a purchase, seeded EXCEPT `keep` (the items the settle must have paid). */
async function seedPrice(db, uid, offer, keep = []) {
  const items = await one(db, 'select items from public.hr_unlock_offers where offer_id = $1', [offer]);
  if (!items) throw new Error(offer + ' has no price');
  for (const [item, qty] of Object.entries(items)) {
    if (keep.includes(item)) continue;
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)
                    on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + excluded.qty`, [uid, item, qty]);
  }
}

const ARMS = {
  'HP-1': async (db, H, M) => {
    const U = H.UIDS[0];
    const h = await gladeHunter(db, H, M, U);
    const r = await hunt(db, H, M, U, h, 'closed', NEEDED);
    const problems = [...r.problems];
    if (r.pelts < NEEDED) { problems.push(`closed: ${r.pelts} Bear Pelts after ${r.hours} h at the Glade, the Keep asks for ${NEEDED}`); return problems; }
    const loot = await one(db, 'select loot from public.hunt_session_tally where session_id = $1', [h.sid]);
    if (!loot || Number(loot.bear_pelt) !== r.pelts) problems.push(`closed: the hunt's tally says ${loot && loot.bear_pelt} pelts, the bag ${r.pelts}`);
    const paid = await one(db, `select count(*)::int from public.player_ledger where user_id = $1 and session_id = $2 and meta::text like '%bear_pelt%'`, [U, h.sid]);
    if (!(paid > 0)) problems.push('closed: no ledger row journals a Bear Pelt');
    console.log(`  closed: ${r.pelts} pelts in ${r.hours.toFixed(2)} h`);
    if (!(await comeHome(db, H, M, U, h, r.atMs))) { problems.push('CONTROL: the hero did not come home'); return problems; }
    const earned = await bagOf(db, U, 'bear_pelt');
    for (const offer of ['property.homestead', 'property.farmstead', 'property.manor']) {
      await seedPrice(db, U, offer);
      const v = await buy(db, U, offer);
      if (!v || v.ok !== true) problems.push(`${offer} refused: ${JSON.stringify(v).slice(0, 200)}`);
    }
    await seedPrice(db, U, 'property.keep', ['bear_pelt']);
    const keep = await buy(db, U, 'property.keep');
    if (!keep || keep.ok !== true) problems.push(`the Keep refused with ${earned} earned pelts: ${JSON.stringify(keep).slice(0, 240)}`);
    const tier = await one(db, 'select public.hr_account_property_tier($1)', [U]);
    if (tier !== 4) problems.push(`the account's home is tier ${tier} after the Keep, want 4`);
    const left = await bagOf(db, U, 'bear_pelt');
    if (left !== earned - NEEDED) problems.push(`the Keep took ${earned - left} pelts, want ${NEEDED}`);
    /* The Trophy Room, the other house line that asks for pelts: every visible rung sells at the Keep. */
    for (let n = 1; n <= 4; n++) {
      const offer = 'room.trophy.' + n;
      await seedPrice(db, U, offer);
      const v = await buy(db, U, offer);
      if (!v || v.ok !== true) problems.push(`${offer} refused at the Keep: ${JSON.stringify(v).slice(0, 200)}`);
    }
    return problems;
  },
  'HP-2': async (db, H, M) => {
    const U = H.UIDS[0];
    const h = await gladeHunter(db, H, M, U);
    const r = await hunt(db, H, M, U, h, 'viewed', 1);
    const problems = [...r.problems];
    if (r.pelts < 1) problems.push(`viewed: no Bear Pelt after ${r.hours} h at the Glade`);
    if (!problems.length) console.log(`  viewed: ${r.pelts} pelt(s) in ${r.hours.toFixed(2)} h`);
    return problems;
  },
  'HP-3': async (db, H, M) => {
    const U = H.UIDS[0];
    const problems = [];
    await H.character(db, M, U, { level: 24, gold: 5000000, inv: {} });
    for (const offer of ['property.castle', 'room.kitchen.5', 'room.trophy.5']) {
      const v = await buy(db, U, offer);
      if (!v || v.error !== 'offer_unsupported') problems.push(`${offer} answered ${JSON.stringify(v).slice(0, 200)}, want offer_unsupported`);
    }
    const home = await one(db, 'select public.hr_home_view($1, 0)', [U]);
    const names = home.tiers.map((t) => t.offer);
    if (names.includes('property.castle')) problems.push('the House window lists the Castle');
    if (!names.includes('property.keep')) problems.push('the House window does not list the Keep');
    const tall = home.rooms.filter((r) => r.rungs !== 4);
    if (tall.length) problems.push(`rooms not at four visible rungs: ${tall.map((r) => r.room + '=' + r.rungs).join(', ')}`);
    /* The class, as the server holds it: no price in the window names an item the catalogue cannot reach. */
    const { reachableSources } = await import('../src/data/catalogue-coherence.js');
    const reach = reachableSources();
    const rows = await q(db, `select o.offer_id, k as item from public.hr_unlock_offers o, jsonb_object_keys(coalesce(o.items, '{}'::jsonb)) k where o.refusal is null`);
    const dead = rows.filter((r) => !reach.has(r.item));
    if (dead.length) problems.push('sellable rows cost unreachable items: ' + dead.map((r) => r.offer_id + ':' + r.item).join(', '));
    return problems;
  },
  /* The two files' own self-checks refuse the apply: the file's text, one row edited, run over the chain. */
  'HP-4': async (db, H) => {
    const problems = [];
    const refuses = async (file, pairs, want, what) => {
      let sql = readFileSync(join(H.ROOT, 'supabase', 'migrations', file), 'utf8').split('\r\n').join('\n');
      for (const [find, repl] of pairs) {
        if (sql.split(find).length !== 2) { problems.push(`${what}: the anchor is not in ${file} exactly once: ${find.slice(0, 70)}`); return; }
        sql = sql.replace(find, () => repl);
      }
      await db.query('savepoint hp_self');
      let err = null;
      try { await db.exec(sql); } catch (e) { err = String(e && e.message); }
      await db.query('rollback to savepoint hp_self');
      if (!err || !err.includes(want)) problems.push(`${what}: the self-check answered ${err ? err.slice(0, 160) : 'nothing (it applied)'}, want "${want}"`);
    };
    await refuses(OFFERS, [[`'{"bear_pelt":4}'::jsonb`, `'{"dragon_scale":2}'::jsonb`]], 'cost an item no player can reach', 'a visible rung on a dead item');
    await refuses(OFFERS, [[`('property.castle', 'property', 'Hearthrise Castle', 'property:castle', 5, null, null, null, null, 'held:its_materials_have_no_source_yet', 'gen-unlock-offers')`,
      `('property.castle', 'property', 'Hearthrise Castle', 'property:castle', 5, 150000, '{"mithril_bar":40}'::jsonb, 4, null, null, 'gen-unlock-offers')`],
    ['if v_n <> 36 then', 'if v_n <> 37 then']], 'held house rows are sellable', 'the Castle sold');
    await refuses(BOUNDS, [[`'{"raw_bear_meat":1,"bear_pelt":1,"brook_bear_tooth":1,"bear_claw":1}'::jsonb`, `'{"raw_bear_meat":1,"brook_bear_tooth":1,"bear_claw":1}'::jsonb`]],
      'item bound is under', 'the bear\'s bound forgets the pelt');
    /* A SECOND APPLY IS BYTE-IDENTICAL: both files over themselves, the tables they write and the schema around them. */
    const image = async () => {
      const out = {};
      for (const t of ['hr_unlock_offers', 'hr_hunt_kill_bounds', 'hr_hunt_ground_spawns', 'hr_hunt_grounds', 'hr_hunt_limits', 'hr_hunt_vendor_value', 'hr_hunt_cover_items', 'hr_hunt_world_shape']) {
        out[t] = await one(db, `select md5(coalesce(string_agg(x.r, '|' order by x.r), '')) from (select t::text r from public.${t} t) x`);
      }
      out.functions = await one(db, `select md5(string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`);
      return JSON.stringify(out);
    };
    const before = await image();
    for (const f of [BOUNDS, OFFERS, CARRIES]) await db.exec(readFileSync(join(H.ROOT, 'supabase', 'migrations', f), 'utf8'));
    const after = await image();
    if (before !== after) problems.push(`a second apply moved something: ${before} -> ${after}`);
    return problems;
  },
};

/* HP-5, on the tree at `root` (a planted copy for its mutants). */
async function wordsFails(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const F = await imp('src/shell/hunt-ground-facts.js');
  const { sourcesOf } = await imp('src/shell/item-lore.js');
  const { costLines } = await imp('src/shell/windows/house.js');
  const G = await imp('src/data/hunt-grounds.js');
  const out = [];
  const glade = G.HUNT_GROUNDS[GLADE];
  const at = (n) => glade.pockets.some((_, p) => G.pullRows(glade, p, n).some((s) => s.monster === 'brook_bear'));
  if (at(2) || !at(3)) out.push('CONTROL: the engine brings the bear at pull 2 ' + at(2) + ', at pull 3 ' + at(3) + ': the words below state 3');
  const told = /The Brook Bear only comes to a pull of 3 or more at Mosslight Glade/;
  const src = sourcesOf('bear_pelt').join('. ');
  if (!/^Dropped by Brook Bear\./.test(src) || !told.test(src)) out.push('the tip\'s Comes from reads: ' + src);
  const step = { gold: 40000, items: [{ id: 'bear_pelt', qty: 5 }, { id: 'oak_log', qty: 1 }] };
  const shortLine = costLines(step, 50000, [], []).lines.find((l) => l.key === 'bear_pelt');
  if (!told.test(shortLine.label) || !shortLine.short) out.push('the House\'s short pelt line reads: ' + shortLine.label);
  const heldLine = costLines(step, 50000, [{ id: 'bear_pelt', qty: 5 }], []).lines.find((l) => l.key === 'bear_pelt');
  if (/pull/.test(heldLine.label)) out.push('the House tells a hero holding the pelts to pull more: ' + heldLine.label);
  const page = F.bigPullLine(GLADE);
  if (!/Brook Bear \(3 or more a pull\)/.test(page) || !/Bear Pelt/.test(page)) out.push('the Glade\'s page reads: ' + page);
  if (F.raresOf(GLADE).every((x) => x.id !== 'bear_claw')) out.push('the Glade\'s Rare list leaves out the Bear Claw');
  if (F.bigPullWords('wolf_pelt') !== '') out.push('an as-built creature\'s item is told to pull more: ' + F.bigPullWords('wolf_pelt'));
  if (F.bigPullLine('mill_cellar') !== '') out.push('a ground with no such creature says: ' + F.bigPullLine('mill_cellar'));
  return out;
}
const WORD_TREES = ['src/shell', 'src/render', 'src/session', 'src/utils', 'src/net', 'src/platform', 'src/app', 'src/social', 'src/world', 'src/hunt-view'];
const WORD_MUTANTS = [
  { name: 'the tip lists every catalogue monster again', edits: [['src/shell/item-lore.js', 'const met = r.drops.filter(onOpenGround);', 'const met = r.drops;']] },
  { name: 'the tip drops the pull', edits: [['src/shell/item-lore.js', 'if (pull) out.push(pull);', '']] },
  { name: 'the House\'s short line drops the pull', edits: [['src/shell/windows/house.js', "const pull = short ? bigPullWords(it.id) : '';", "const pull = '';"]] },
  { name: 'the House tells everyone', edits: [['src/shell/windows/house.js', "const pull = short ? bigPullWords(it.id) : '';", 'const pull = bigPullWords(it.id);']] },
  { name: 'the page names no bear', edits: [['src/shell/hunt-ground-facts.js', "return said.length ? 'Bigger pulls also bring '", "return said.length > 9 ? 'Bigger pulls also bring '"]] },
  { name: 'the bear moves back a row: a pull of 3 no longer brings it', edits: [
    ['src/data/hunt-grounds.js', "['brook_bear', 'walking_vine', 'carrion_crow', 'goblin_sluicer', 'walking_vine', 'carrion_crow']", "['walking_vine', 'brook_bear', 'carrion_crow', 'goblin_sluicer', 'walking_vine', 'carrion_crow']"],
    ['src/data/hunt-grounds.js', "['brook_bear', 'walking_vine', 'glade_poacher', 'carrion_crow', 'carrion_crow', 'walking_vine']", "['walking_vine', 'brook_bear', 'glade_poacher', 'carrion_crow', 'carrion_crow', 'walking_vine']"]] },
];

/* THE PLANTED DEFECTS: each runs inside its arm's transaction, before the arm. `js` plants on the edge's own data. */
const MUTANTS = {
  bear_has_no_pelt: { arm: 'HP-2', why: 'the bug Andy hit: the bear drops no pelt, so nothing can pay the Keep',
    js: (M) => { const b = M.MONSTERS.brook_bear; const was = b.drops; b.drops = was.filter((d) => d.id !== 'bear_pelt'); return () => { b.drops = was; }; } },
  bound_forgets_pelt: { arm: 'HP-2', why: 'the 10-29 class: the kill bound omits the drop, a window with a pelt is refused value_over',
    ddl: "update public.hr_hunt_kill_bounds set drops = drops - 'bear_pelt'" },
  castle_sold: { arm: 'HP-3', why: 'the Castle is sold though its scales have no source',
    ddl: `update public.hr_unlock_offers set refusal = null, gold = 150000, items = '{"dragon_scale": 4}'::jsonb, req_property_tier = 4 where offer_id = 'property.castle'` },
  rung_needs_dead_item: { arm: 'HP-3', why: 'a visible Trophy rung costs an item nobody can hold',
    ddl: `update public.hr_unlock_offers set items = items || '{"dragon_gem": 1}'::jsonb where offer_id = 'room.trophy.3'` },
  keep_asks_more: { arm: 'HP-1', why: 'the Keep\'s price drifts past what the hero earned',
    ddl: `update public.hr_unlock_offers set items = items || '{"bear_pelt": 500}'::jsonb where offer_id = 'property.keep'` },
};

async function runArm(db, H, M, id, mutant) {
  await db.query('begin');
  let undo = null;
  try {
    if (mutant && mutant.js) undo = mutant.js(M);
    if (mutant && mutant.ddl) await db.query(mutant.ddl);
    return await ARMS[id](db, H, M);
  } finally {
    if (undo) undo();
    await db.query('rollback');
  }
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  if (process.argv.includes('--selftest')) {
    let missed = 0;
    for (const [id, m] of Object.entries(MUTANTS)) {
      let p;
      try { p = await runArm(db, H, M, m.arm, m); } catch (e) { p = ['threw: ' + String(e && e.message).slice(0, 200)]; }
      console.log(`  ${p.length ? 'CAUGHT' : 'MISSED'} ${id} [${m.arm}]: ${m.why}${p.length ? ' (' + p[0].slice(0, 110) + ')' : ''}`);
      if (!p.length) missed++;
    }
    for (const mu of WORD_MUTANTS) {
      const p = plant(mu.edits, WORD_TREES);
      let f;
      try { f = await wordsFails(p.root); } catch (e) { f = ['threw: ' + String(e && e.message).slice(0, 200)]; } finally { p.done(); }
      console.log(`  ${f.length ? 'CAUGHT' : 'MISSED'} ${mu.name} [HP-5]${f.length ? ' (' + f[0].slice(0, 110) + ')' : ''}`);
      if (!f.length) missed++;
    }
    console.log(`house-pelts --selftest: ${Object.keys(MUTANTS).length + WORD_MUTANTS.length} mutants, ${missed} missed`);
    process.exit(missed ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const ids = Object.keys(ARMS).filter((k) => !only || only.split(',').includes(k));
  let bad = 0;
  for (const id of ids) {
    let p;
    try { p = await runArm(db, H, M, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 500)]; }
    if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
  }
  if (!only || only.split(',').includes('HP-5')) {
    const f = await wordsFails(H.ROOT);
    if (f.length) { bad++; for (const m of f) console.error(`✗ HP-5: ${m}`); } else console.log('✓ HP-5');
  }
  console.log(bad ? `house-pelts: ${bad} arm(s) red` : 'house-pelts: green');
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
