#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/pattern-learn.mjs — A PATTERN TEACHES THE HERO WHO READS IT, AND NO OTHER (src/data/patterns.js; itemization plan §5
// "Patterns", designer 2026-11-19: per hero, through the live server verb hr_recipe_learn, 2026-09-14-recipe-learn.sql).
//
//   node tests/pattern-learn.mjs
//
// The patterns ship HIDDEN (PATTERN_LINE.live false), so every case but PL-1 plays a PLANTED copy of the tree with the switch on
// (tests/hunt-core/fixtures/h1.js plant): the rows as written, through the modules a player's page and the server run.
//   PL-1 HIDDEN       the shipped tree holds no pattern: no item, no flavour line, no gated recipe, no drop row (nothing a generated
//                     catalogue reads moves while the switch is off)
//   PL-2 THE ROWS     switched on, the Kingsgrate Rivets is an item that `teaches` the Steelgrate reforge and never carries `recipe`
//                     (the old b352 scroll shape, cut from the engine 2026-11-18), the reforge's gate names it, gen-unlocks' gate ids catalogue it, and both
//                     Rat Kings carry it among their Rares, before the trophy
//   PL-3 AN ITEM      on the real settle (play-ground: hr-accrue accrueHunt) a Rat King kill credits the pattern to the bag as an ITEM, so a
//                     hero can read, store or trade it (the row's chance raised in this fixture only, so the first kill lands it)
//   PL-4 THE BENCH    the Work window's row (town-work.js workBlock) reads THIS hero's learned set from its envelope: closed with no
//                     set (not read yet) or an empty one, open once the server lists the pattern; the bag offers Learn until then
//   PL-5 THE SERVER   on the replayed chain (PGlite), with the pattern's catalogue rows as TEST FIXTURES (the generated catalogues move
//                     only when the switch does): the bag's own Learn (pattern.js -> recipe-intents.js) sends hr_recipe_learn as the
//                     signed-in player, named arguments as PostgREST resolves them; the account's SECOND hero (its bought slot 1)
//                     learns it (one pattern taken, one journal row on its slot, its envelope and hr_perks_of list it), a second read
//                     is refused already_learned and eats nothing, and hero 0 of the same account does not know it; the bench opens for
//                     the reader and stays closed for hero 0, on screen (workBlock off each hero's envelope) and in the engine
//                     (computeAccrual on each hero's hr_perks_of set: the reader makes a Steelgrate, hero 0 stops at the gate, unpaid)
//
// Exit: 0 green · 1 a real problem · 2 harness problem. NO ?v= on this file's own imports of the repo (tests/**, b332); a planted
// module is imported WITH the build's ?v= so it shares instances with the imports inside it.
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { bootReplay } from './schema-replay.mjs';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const PATTERN = 'kingsgrate_rivets', RECIPE = 'reforge_steelgrate';
const UID = '00000a7e-0000-4000-8000-00000000c0de';
const MAXED = 13034431;   // level 99 XP: the bench's level is never the reason a row is closed here
const GATE = 'Needs the Kingsgrate Rivets recipe.';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const harness = (msg) => Object.assign(new Error(msg), { harness: true });

/* ── PL-1: the shipped tree ───────────────────────────────────────────── */
async function hidden() {
  const { PATTERN_LINE, PATTERNS, PATTERN_ITEMS, PATTERN_DROPS, PATTERN_GATES } = await import('../src/data/patterns.js');
  const { ITEMS } = await import('../src/data/items.js');
  const { ITEM_DESC } = await import('../src/data/item-descriptions.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const { ARTISAN_RECIPES_EVERY } = await import('../src/data/recipes.js');
  ok(PATTERN_LINE.live === false, 'PL-1 the patterns ship switched on (src/data/patterns.js PATTERN_LINE.live): this lane ships them hidden');
  ok(Object.keys(PATTERNS).includes(PATTERN), 'PL-1 src/data/patterns.js no longer authors ' + PATTERN + ': every case below would read nothing');
  ok(!Object.keys(PATTERN_ITEMS).length && !Object.keys(PATTERN_DROPS).length && !Object.keys(PATTERN_GATES).length,
    'PL-1 a hidden pattern still builds rows: ' + JSON.stringify({ items: Object.keys(PATTERN_ITEMS), drops: Object.keys(PATTERN_DROPS), gates: Object.keys(PATTERN_GATES) }));
  const leaks = [];
  for (const id of Object.keys(PATTERNS)) {
    if (ITEMS[id]) leaks.push('ITEMS.' + id);
    if (ITEM_DESC[id]) leaks.push('ITEM_DESC.' + id);
    for (const [mid, m] of Object.entries(MONSTERS)) if ((m.drops || []).some((d) => d.id === id)) leaks.push('MONSTERS.' + mid + ' drops ' + id);
    for (const [skill, list] of Object.entries(ARTISAN_RECIPES_EVERY)) for (const r of list) if (r.gated === id) leaks.push(skill + '.' + r.id + ' gated');
  }
  ok(!leaks.length, 'PL-1 the hidden pattern shows in the shipped tables: ' + leaks.join(', '));
}

/* ── the planted copy, switched on ────────────────────────────────────── */
async function loadLive(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + V;
  return {
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
    LB: await import(u('src/data/loot-bands.js')),
    REC: await import(u('src/data/recipes.js')),
    TW: await import(u('src/shell/town-work.js')),
    PAT: await import(u('src/shell/windows/inventory/pattern.js')),
    ST: await import(u('src/shell/windows/inventory/state.js')),
    AC: await import(pathToFileURL(join(root, 'supabase/functions/hr-accrue/accrual.js')).href),
    CAT: await import(pathToFileURL(join(root, 'supabase/functions/hr-accrue/catalogue.js')).href),
    PLAY: await import(pathToFileURL(join(root, 'tests/hunt-core/fixtures/play-ground.mjs')).href),
    G: await import(u('src/data/hunt-grounds.js')),
    HUNTS: (await import(u('src/data/hunts.js'))).HUNT_INDEX,
  };
}

/* ── PL-2: the rows the switch adds ───────────────────────────────────── */
function rows(L) {
  const it = L.ITEMS[PATTERN];
  ok(!!it && it.teaches === RECIPE, 'PL-2 the live item ' + PATTERN + ' reads ' + JSON.stringify(it) + ', want teaches ' + RECIPE);
  ok(!!it && !('recipe' in it), 'PL-2 the live pattern carries `recipe`: the old b352 scroll shape, refused by tests/catalogue-coherence.mjs C16: a pattern is an item that teaches');
  const r = L.REC.ARTISAN_RECIPES.smithing.find((x) => x.id === RECIPE);
  ok(!!r && r.gated === PATTERN, 'PL-2 ' + RECIPE + ' is gated by ' + (r && r.gated) + ', want ' + PATTERN);
  const every = L.REC.ARTISAN_RECIPES_EVERY.smithing.find((x) => x.id === RECIPE);
  ok(!!every && every.gated === PATTERN, 'PL-2 the switch-aware index (the server\'s) does not gate ' + RECIPE);
  /* gen-unlocks' source (a), the gate ids: the catalogue row recipe:<pattern> hr_recipe_learn reads comes from here */
  const gateIds = new Set(Object.values(L.REC.ARTISAN_RECIPES).flat().filter((x) => x.gated).map((x) => x.gated));
  ok(gateIds.has(PATTERN), 'PL-2 tools/gen-unlocks.mjs would not catalogue recipe:' + PATTERN + ' (no recipe is gated by it)');
  for (const mid of ['rat_king', 'rat_king_called']) {
    const d = L.MONSTERS[mid].drops, i = d.findIndex((x) => x.id === PATTERN);
    const rank = (x) => L.LB.LOOT_BANDS.indexOf(x.band);
    ok(i >= 0 && d[i].band === 'rare' && d[i].ch > 0 && d[i].ch <= 0.05, 'PL-2 ' + mid + ' carries ' + JSON.stringify(d[i]) + ', want one Rare row at 5% or less');
    ok(i >= 0 && d.slice(0, i).every((x) => rank(x) <= rank(d[i])) && d.slice(0, i + 1).filter((x) => x.band === 'trophy').length === 0,
      'PL-2 ' + mid + '\'s pattern row is not among its Rares before the trophy: ' + d.map((x) => x.id + '/' + x.band).join(', '));
  }
}

/* ── PL-3: a kill credits the pattern as an item ──────────────────────── */
function credited(L, root) {
  return L.PLAY.loadPlay(root).then((P) => {
    const gid = 'millrace_sewer', floor = L.HUNTS[L.G.HUNT_GROUNDS[gid].hunt].band[0];
    /* the fixture's table: the row as written, its chance raised so the first Rat King kill lands it (this run only) */
    const monsters = Object.assign({}, P.MONSTERS, { rat_king: { ...P.MONSTERS.rat_king,
      drops: P.MONSTERS.rat_king.drops.map((d) => (d.id === PATTERN ? { ...d, ch: 0.95 } : d)) } });
    const x = P.run(gid, floor, ['tank', 'ranger', 'mage', 'healer'], { spanMs: 1800000, fullSet: true, monsters });
    const kills = x.killsBy.rat_king || 0;
    ok(kills > 0, 'PL-3 HARNESS: no Rat King died in the half hour; nothing below was measured');
    ok((x.items[PATTERN] || 0) > 0, 'PL-3 ' + kills + ' Rat King kill(s) at 95% credited ' + (x.items[PATTERN] || 0) + ' ' + PATTERN
      + ' to a bag (rare rolls ' + x.rareRolls.filter((id) => id === PATTERN).length + '): the drop never became an item');
    return { kills, got: x.items[PATTERN] || 0 };
  });
}

/* A hero as the Work window and the bag read it: the envelope's sections, by key. */
const heroOf = (env, slot) => ({ slot, status: 'open', read: (k) => (env ? env[k] : undefined) });
const smithEnv = (learned) => ({ skills: { smithing: { level: 99, xp: MAXED } }, inventory: { kingsgrate: 1, steel_bar: 3, [PATTERN]: 1 }, equipment: {},
  ...(learned === undefined ? {} : { unlocked_recipes: learned }) });

/* ── PL-4: the bench and the bag read this hero's learned set ─────────── */
function bench(L) {
  const w = L.TW.workRow('artisan', RECIPE);
  ok(!!w && w.row.gated === PATTERN, 'PL-4 the Work window\'s row for ' + RECIPE + ' is not gated');
  if (!w) return;
  const says = (learned) => L.TW.workBlock(heroOf(smithEnv(learned), 0), w, false);
  ok(says(undefined) === GATE, 'PL-4 a hero whose learned set is not read yet sees ' + JSON.stringify(says(undefined)) + ', want the closed bench');
  ok(says({}) === GATE, 'PL-4 a hero who has learned nothing sees ' + JSON.stringify(says({})));
  ok(says({ some_other_pattern: true }) === GATE, 'PL-4 another pattern opened ' + RECIPE);
  ok(says({ [PATTERN]: false }) === GATE, 'PL-4 a learned set naming the pattern as not learned (false) opened ' + RECIPE);
  ok(says({ [PATTERN]: true }) !== GATE, 'PL-4 a hero the server lists as knowing ' + PATTERN + ' still sees the closed bench');
  ok(L.PAT.patternRowOf(PATTERN) && L.PAT.patternRowOf(PATTERN).id === RECIPE, 'PL-4 the bag does not see ' + PATTERN + ' as the pattern of ' + RECIPE);
  ok(L.PAT.patternRowOf('kingsgrate') === null && L.PAT.patternRowOf('steel_bar') === null, 'PL-4 the bag reads a plain item as a pattern');
  const st = (learned) => ({ cs: heroOf(smithEnv(learned), 0), qty: new Map([[PATTERN, 1]]), eq: {}, bar: null, shop: { bids: new Map([[PATTERN, 10]]) }, rules: null });
  const p0 = L.ST.primaryOf(st({}), PATTERN), p1 = L.ST.primaryOf(st({ [PATTERN]: true }), PATTERN);
  ok(Array.isArray(p0) && p0[0] === 'learn', 'PL-4 the bag\'s press on an unread pattern is ' + JSON.stringify(p0) + ', want Learn');
  ok(Array.isArray(p1) && p1[0] === 'sell', 'PL-4 the bag\'s press on a pattern this hero knows is ' + JSON.stringify(p1) + ', want Sell (it is kept to sell or trade)');
  ok(L.PAT.learnBlock(heroOf(smithEnv({ [PATTERN]: true }), 0), PATTERN) === 'Pattern already learned' && L.PAT.learnBlock(heroOf(smithEnv({}), 0), PATTERN) === '',
    'PL-4 the menu\'s Learn says why it is off only for a hero the server lists as knowing it');
  const sc = {};
  const arm = [L.PAT.armLearn(sc, PATTERN, 0), L.PAT.armLearn(sc, PATTERN, 4000), L.PAT.armLearn(sc, PATTERN, 5000), L.PAT.armLearn(sc, PATTERN, 20000)];
  ok(JSON.stringify(arm) === '[false,true,false,false]', 'PL-4 the two presses read ' + JSON.stringify(arm) + ' (arm, learn, arm, a late press arms again)');
}

/* ── PL-5: the server, two heroes of one account ──────────────────────── */
async function server(L) {
  const { db } = await bootReplay();
  const one = async (sql, p) => (await db.query(sql, p)).rows[0];
  /* THE PATTERN'S CATALOGUE ROWS, AS TEST FIXTURES (tests/recipe-learn.mjs's shape): what gen-catalogues and gen-unlocks emit for it once
     the switch is on. Catalogue rows in this replay only, never player state. */
  await db.query(`insert into public.hr_items select (jsonb_populate_record(null::public.hr_items, to_jsonb(i) || jsonb_build_object('item_id', $1::text, 'name', $2::text))).*
                    from public.hr_items i order by i.item_id limit 1`, [PATTERN, L.ITEMS[PATTERN].n]);
  await db.query(`insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs) values ($1, 'recipe', 'flag', 'flag', null, null)`, ['recipe:' + PATTERN]);

  await db.query('insert into auth.users (id) values ($1)', [UID]);
  const as = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await as(UID);
  for (const slot of [0, 1]) {
    /* the second hero's slot is bought, as a player buys it: the account's purse is funded to the server's own offer (a test fixture) */
    if (slot === 1) {
      const offer = (await one('select public.hr_account_view($1::uuid, 0) v', [UID])).v.hero_slot_offer;
      if (!offer || offer.slot_id !== 1) throw harness('the account is offered ' + JSON.stringify(offer) + ', not slot 1');
      await db.query(`insert into public.account_wallet as w (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = excluded.gold`, [UID, offer.cost_gold]);
      const b = (await one(`select public.hr_buy_hero_slot__ungated(1, 0, '00000a7e-0000-4000-8000-0000000051a1') b`)).b;
      if (!b || b.ok !== true) throw harness('buying slot 1 answered ' + JSON.stringify(b));
    }
    const r = (await one('select public.hr_create_character($1) r', [slot])).r;
    if (!r || r.created !== true) throw harness('hr_create_character(' + slot + ') answered ' + JSON.stringify(r));
    /* both heroes at Smithing 99 with the reforge's inputs, so the gate is the only thing between them and the bench */
    await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, 'smithing', $3)
                    on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [UID, slot, MAXED]);
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, 'kingsgrate', 1), ($1, $2, 'steel_bar', 3)
                    on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [UID, slot]);
  }
  /* THE READER is the account's SECOND hero (slot 1, so a press that names another hero's slot cannot pass for this one's): it holds two
     patterns (the second proves a re-read eats nothing). Hero 0 holds none and reads nothing. */
  const R = 1, O = 0;
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, $3, 2)`, [UID, R, PATTERN]);

  /* THE LINK, as PostgREST answers a POST: the RPC's named arguments, as the signed-in player. */
  const calls = [];
  const account = { server: { rpc: async (name, args) => {
    calls.push({ name, keys: Object.keys(args).sort().join() });
    await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
    await as(UID);
    const keys = Object.keys(args);
    try { return { ok: true, body: (await one(`select public.${name}(${keys.map((k, i) => k + ' => $' + (i + 1)).join(', ')}) as body`, keys.map((k) => args[k]))).body }; }
    catch (e) { return { ok: false, error: 'http_400', body: { message: String(e.message) } }; }
  } } };
  const envOf = async (slot) => (await one('select public.hr_state_of($1::uuid, $2) e', [UID, slot])).e;
  const csOf = (slot) => ({ slot, status: 'open', env: null, loads: 0, read(k) { return this.env ? this.env[k] : undefined; },
    async load() { this.loads++; this.env = await envOf(slot); } });
  const send = (fn, busy, done) => fn().then((x) => (x && x.ok ? { ok: true, said: done(x), busy } : x));
  const bagOf = async (slot, id) => Number((await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = $2 and item_id = $3), 0) q', [UID, slot, id])).q);
  const perksOf = async (slot) => (await one('select public.hr_perks_of($1::uuid, $2) p', [UID, slot])).p;

  const hr = csOf(R), ho = csOf(O);
  await hr.load(); await ho.load();
  const w = L.TW.workRow('artisan', RECIPE);
  ok(L.TW.workBlock(hr, w, false) === GATE && L.TW.workBlock(ho, w, false) === GATE,
    'PL-5 before any read the bench says ' + JSON.stringify([L.TW.workBlock(hr, w, false), L.TW.workBlock(ho, w, false)]) + ', want it closed for both heroes');
  ok(L.PAT.learnBlock(hr, PATTERN) === '', 'PL-5 the reader\'s Learn is off before it read anything');

  const said = await L.PAT.learnPattern(account, hr, PATTERN, send);
  ok(said && said.ok === true && said.said === 'Recipe learned: Reforge the Kingsgrate as Steelgrate', 'PL-5 the bag\'s Learn answered ' + JSON.stringify(said));
  ok(calls.length === 1 && calls[0].name === 'hr_recipe_learn' && calls[0].keys === 'p_idem,p_item,p_slot', 'PL-5 the press sent ' + JSON.stringify(calls));
  ok(hr.loads === 2, 'PL-5 the reader was re-read ' + (hr.loads - 1) + ' time(s) after the learn, want once (the bench opens only from the envelope)');
  ok(await bagOf(R, PATTERN) === 1, 'PL-5 the reader holds ' + await bagOf(R, PATTERN) + ' of 2 patterns after one read, want 1');
  const led = (await db.query(`select slot, intent, meta from public.player_ledger where user_id = $1 and kind = 'recipe'`, [UID])).rows;
  ok(led.length === 1 && led[0].slot === R && led[0].meta.item === PATTERN, 'PL-5 the read is journalled as ' + JSON.stringify(led));

  const er = hr.env.unlocked_recipes, eo = (await envOf(O)).unlocked_recipes;
  ok(JSON.stringify(er) === JSON.stringify({ [PATTERN]: true }), 'PL-5 the reader\'s envelope lists ' + JSON.stringify(er));
  ok(JSON.stringify(eo) === '{}', 'PL-5 the other hero, which never read it, lists ' + JSON.stringify(eo) + ': a pattern teaches one hero');
  const pr = await perksOf(R), po = await perksOf(O);
  ok(JSON.stringify(pr && pr.unlockedRecipes) === JSON.stringify(er) && JSON.stringify(po && po.unlockedRecipes) === JSON.stringify(eo),
    'PL-5 the engine\'s sets (hr_perks_of) ' + JSON.stringify([pr && pr.unlockedRecipes, po && po.unlockedRecipes]) + ' are not the envelopes\'');

  await ho.load();
  const whyR = L.TW.workBlock(hr, w, false), whyO = L.TW.workBlock(ho, w, false);
  ok(whyR !== GATE, 'PL-5 the reader read the pattern and its bench still says ' + JSON.stringify(whyR));
  ok(whyO === GATE, 'PL-5 the other hero\'s bench says ' + JSON.stringify(whyO) + ', want closed: it never read the pattern');
  ok(L.PAT.learnBlock(hr, PATTERN) === 'Pattern already learned', 'PL-5 the reader\'s Learn is not off once the server lists the pattern');

  /* a second read: refused before the take (already_learned), the second pattern kept */
  const again = await L.PAT.learnPattern(account, hr, PATTERN, send);
  ok(again && again.ok === false && again.error === 'already_learned', 'PL-5 a second read answered ' + JSON.stringify(again));
  ok(await bagOf(R, PATTERN) === 1, 'PL-5 the refused second read took a pattern');

  /* THE ENGINE: the reforge on each hero's own set, as hr-accrue hands it in (perkEnv.unlockedRecipes) */
  const T0 = Date.UTC(2026, 10, 19, 12, 0, 0);
  const night = (slot, set) => L.AC.computeAccrual({ userId: UID, slot, nowMs: T0 + 3600000, accruedToMs: T0, activeSinceMs: T0, activeKind: 'artisan',
    activeId: RECIPE, capMs: 12 * 3600000, seed: 7, hp: 60, maxHp: 60, gold: 0, skills: { smithing: MAXED }, equipment: {},
    inventory: { kingsgrate: 1, steel_bar: 3 }, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {}, perks: null,
    unlockedRecipes: set, items: L.ITEMS, monsters: L.MONSTERS, nodes: L.CAT.GATHER_NODES, recipes: L.CAT.ARTISAN_RECIPES_ALL });
  const nr = night(R, pr.unlockedRecipes), no = night(O, po.unlockedRecipes);
  ok(nr.accrued === true && nr.delta.items && nr.delta.items.steelgrate === 1, 'PL-5 the reader\'s reforge on the engine made ' + JSON.stringify(nr.accrued ? nr.delta.items : nr.reason));
  ok(no.accrued === true && no.summary.ticks === 0 && !no.delta.items && no.delta.journal.meta.stopped === 'gate',
    'PL-5 the other hero\'s reforge ran ' + (no.summary && no.summary.ticks) + ' action(s), stopped ' + JSON.stringify(no.delta && no.delta.journal && no.delta.journal.meta.stopped) + ': the gate must hold it at tick 0');
  await db.close();
  return { why: whyR, ledger: led.length };
}

let pl = null;
try {
  await hidden();
  pl = plant([['src/data/patterns.js', 'live: false,', 'live: true,']], ['src', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures']);
  const L = await loadLive(pl.root);
  rows(L);
  const kill = await credited(L, pl.root);
  bench(L);
  const srv = await server(L);
  if (!problems.length) {
    console.log('pattern-learn: hidden in the shipped tree; switched on, the Kingsgrate Rivets teaches the Steelgrate reforge as an item ('
      + kill.got + ' credited on ' + kill.kills + ' Rat King kill(s) at the fixture\'s 95%), the bench opens only off this hero\'s learned set, and on the '
      + 'replayed chain the second hero\'s Learn takes one pattern and opens its bench (now: ' + JSON.stringify(srv.why || 'open') + ') while hero 0 stays closed, on screen and on the engine.');
  }
} catch (e) {
  if (e && e.harness) { console.error('pattern-learn HARNESS: ' + e.message); process.exit(2); }
  throw e;
} finally { if (pl) pl.done(); }
if (problems.length) { console.error('pattern-learn: ' + problems.length + ' problem(s):\n  x ' + problems.join('\n  x ')); process.exit(1); }
process.exit(0);
