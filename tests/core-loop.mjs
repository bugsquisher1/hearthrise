#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/core-loop.mjs — THE LOOP GATE. Does the game still PLAY?
//
//   node tests/core-loop.mjs               both loops, one step table, exit 1 on any red step
//   node tests/core-loop.mjs --list        the mutation catalogue
//   node tests/core-loop.mjs --selftest    every planted dead end must turn its NAMED step red
//   node tests/core-loop.mjs --mutate=<id> one planted dead end
//
// Tyler, 2026-10-14: "we need to make sure the game still PLAYS as we are
// expecting, there's still a loop." The game is being rebuilt system by system
// (named hunts, the pixel World, hunt sessions with supply bags replacing
// "away", hybrid NPC + crafted supplies, gear enhancement) under one rule:
// swap, then delete, and every release keeps a playable loop. This file is that
// rule as an exit code. It runs ONCE A DAY (.github/workflows/nightly-loop.yml,
// Tyler 2026-10-14: "once a day"), never on the release path, and by hand.
//
// ── THE LOOP MAP: which system answers each step, and what it feeds ────────
// A later lane that swaps one of these systems must keep its arrow alive.
//
//   LOOP-1, a fresh character from the real start kit
//   step  what the player does      the server half that answers          feeds
//    1    log in                    hr_create_character <- src/data/start-kit.js   all
//    2    fish                      set_activity gather:shrimp_s, settle            3
//                                   (computeAccrual gather <- GATHER_NODES)
//    3    cook a heal               set_activity artisan:cook_shrimp, settle        6
//                                   (ARTISAN_RECIPES_PAYABLE, burn maths)
//    4    buy basic food            shop_buy, the cheapest healing NPC offer        6
//                                   (GOLD_OFFERS <- src/data/shops.js; the NPC
//                                   half of hybrid supplies)
//    5    set a hunt                set_activity combat:mill_cellar                 6
//                                   (src/data/hunts.js -> hr_hunts band floor)
//    6    kills pay                 settle -> computeAccrual -> simulateSpan        7
//                                   (src/core/combat-sim.js, auto-eat, loot,
//                                   combat XP) -> hr_apply
//    7    sell the loot             vendor_sell_many (catalogue.vendorPriceOf)      8
//    8    buy an upgrade            shop_buy equip.* the character can wield        9
//    9    equip it                  equip -> hr_apply equipment                     10
//   10    hunt again, better        the same hunt, the same dice, the new kit       11
//   11    reload                    hr_load (the boot read) == the last envelope    -
//   12    return settle pays once   a second settle of one window pays nothing      -
//
//   LOOP-2, a mid-level character (Combat 40)
//    1    a Combat-40 character     start kit + the levels and steel kit a          all
//                                   Combat-40 player owns (fixture), equipped
//                                   through the REAL equip verb
//    2    pick a hunt for my level  src/data/hunts.js band contains my level        4
//    3    buy supplies              shop_buy, the best NPC food I can afford        5
//    4    set the hunt              set_activity combat:<that hunt>                 5
//    5    the hunt burns supplies   settle: kills, loot, XP, food eaten             6
//    6    sell the loot             vendor_sell_many                                7
//    7    restock                   shop_buy the food the hour burnt                8
//    8    keep hunting              the pointer survived; the next hour pays        9
//    9    reload                    hr_load == the last envelope                    -
//
//   LOOP-3, the crafted upgrade (the "crafted better" half of hybrid supplies)
//    1    a fresh character         hr_create_character                             2
//    2    mine copper               set_activity gather:copper_rock, settle         3
//    3    smelt bronze              set_activity artisan:smelt_bronze               4
//    4    forge a piece I can wear  the best smithing recipe my SERVER level and    5
//                                   bag allow (ARTISAN_RECIPES_PAYABLE, hr_apply
//                                   activity_locked below the recipe level)
//    5    equip it                  equip                                           -
//
//   LOOP-4, the first night with only the kit (Recovery Rule, src/core/away.js)
//    1    hunt all night            set_activity combat:mill_cellar, a 10 h settle  2
//    2    knocked out               set_activity combat refuses `recovering`,       3
//                                   by name, with its `until`
//    3    never stranded            gather and shop_buy food still accepted         4
//                                   (RECOVERY_REFUSED_KINDS is combat only)
//    4    back on the hunt          after recovering_until, the hunt sets and pays  -
//
// Every verb's envelope is also compared with hr_load the moment it lands
// (readBack): the browser never says one thing while the server says another.
//
// ── WHAT IT DRIVES ─────────────────────────────────────────────────────────
// The REAL edge verbs (set-activity.js, shop-buy.js, vendor-sell.js, equip.js,
// party-fence.js), each fed by request.js parseIntent from a RAW body exactly
// as index.ts composes them, against the REAL migration chain replayed into
// PGlite (tests/schema-replay.mjs: the final hr_apply, hr_state_of, hr_load,
// the generated catalogues). Every assertion reads the SERVER: hr_load, the
// envelope a verb returned, or the ledger. Nothing is a client prediction.
//
// The table prints every step with what it measured (kills, gold, food per kill,
// the hour's net), so the nightly log doubles as the loop's balance sheet.
//
// ── THE HARNESS PRIVILEGES, STATED (each is a test fixture, never a game rule) ──
//   1. THE DICE. hr_seed's `seed` column is replaced by one constant, so every
//      window rolls the same dice and step 10's "better" is the kit and the
//      levels, not luck (tests/absence-priced-at-return.mjs does the same).
//   2. TIME. `elapse()` moves every timestamptz column of the character's
//      player_state row back by N seconds: N seconds pass for that character.
//      The column list is READ from the catalogue, so a new watermark is moved
//      with the rest instead of being left behind.
//   3. THE RATE GATE. hr_rate_counters is cleared before each gesture: a real
//      player's gestures are minutes apart, these are milliseconds apart.
//   4. THE SETTLE. index.ts's `accrue` verb is Deno and cannot be imported, so
//      the return settle is collectCurrentWindow (set-activity.js), the same
//      stand-in tests/absence-priced-at-return.mjs uses; both call sites hand
//      computeAccrual one literal (activity-intent A14 holds that).
//   5. LOOP-2's levels, gold and steel kit are written as a fixture: playing to
//      Combat 40 inside a replay is hours of engine time. Its EQUIP is real.
//
// ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
// The browser (the in-page suite owns the screens), the world tick's 10 s
// combat/gather writers (tests/world-tick-*.mjs), the attended kill credit
// (tests/attended-loot-credit.mjs), JWT/pooler/CORS, true concurrency.
// ════════════════════════════════════════════════════════════════════════

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { ITEMS } from '../src/data/items.js';
import { HUNTS } from '../src/data/hunts.js';
import { START_KIT } from '../src/data/start-kit.js';
import { combatLevel, xpForLevel } from '../src/core/xp.js';

const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);
const SEED = 0x10091;
const MIN = 60;
const uuid = () => crypto.randomUUID();
const num = (v) => Number(v ?? 0);

/* ── THE DEAD ENDS THIS GATE CLAIMS TO SEE ────────────────────────────────
   Each is planted in the shipping edge bytes (copied to a temp root at the same
   depth so relative imports resolve). `by` is the step that must go red FIRST:
   a mutation caught by some later, unrelated step is reported as caught by the
   wrong step, because a gate that names the wrong step sends a lane to the
   wrong file. */
const MUTATIONS = {
  hunt_unsettable: {
    file: 'set-activity.js', by: 'LOOP-1 step 5',
    why: 'a named hunt is no longer a combat target: the new player cannot start Mill Cellar',
    find: "if (decl.kind === 'combat' && !catalogueHas(MONSTERS, decl.id) && !huntFor(decl.id)) {",
    repl: "if (decl.kind === 'combat' && !catalogueHas(MONSTERS, decl.id)) {",
  },
  hunt_drops_nothing: {
    file: 'accrual.js', by: 'LOOP-1 step 6',
    why: 'kills stop dropping loot server-side: the hunt pays XP and nothing to sell',
    find: '      itemDelta[id] = (itemDelta[id] || 0) + n;\n      bag[id] = (bag[id] || 0) + n;      // edible from the moment it drops',
    repl: '      return;',
  },
  sell_pays_nothing: {
    file: 'vendor-sell.js', by: 'LOOP-1 step 7',
    why: 'the vendor takes the loot and pays no gold: nothing funds an upgrade',
    find: '    gold += s.unit * s.qty;',
    repl: '    gold += 0;',
  },
  shop_sells_no_gear: {
    file: 'catalogue.js', by: 'LOOP-1 step 8',
    why: 'the NPC counter stops selling equipment: gold has nothing to become',
    find: 'export const GOLD_OFFERS = Object.freeze(goldOffers);',
    repl: 'export const GOLD_OFFERS = Object.freeze(Object.fromEntries(Object.entries(goldOffers)'
      + ".filter(([k]) => !k.startsWith('equip.'))));",
  },
  equip_refuses_everything: {
    file: 'equip.js', by: 'LOOP-1 step 9',
    why: 'every equip is refused as wrong_slot: the upgrade sits in the bag forever',
    find: '    if (fits[s] !== true) {',
    repl: '    if (fits) {',
  },
  smithing_unpayable: {
    file: 'catalogue.js', by: 'LOOP-3 step 3',
    why: 'the smithing bench falls out of the payable set: ore can never become a crafted upgrade',
    find: 'export const ARTISAN_RECIPES_PAYABLE = payableRecipeIndex(ARTISAN_RECIPES_ALL);',
    repl: 'export const ARTISAN_RECIPES_PAYABLE = Object.fromEntries(Object.entries('
      + "payableRecipeIndex(ARTISAN_RECIPES_ALL)).filter(([, r]) => r.skill !== 'smithing'));",
  },
  recovery_strands: {
    file: 'set-activity.js', by: 'LOOP-4 step 3',
    why: 'the knockout refuses every kind again (Recovery rev. 2, measured live 2026-09-08): a '
      + 'foodless knocked-out player has no legal move until the clock runs out',
    find: '  if (recoveryRefuses(decl.kind)) {',
    repl: "  if (decl.kind !== 'idle') {",
  },
};

/* ── MODULES ───────────────────────────────────────────────────────────── */
async function loadModules(mutate) {
  let dir = FN('');
  let base = null;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) throw Object.assign(new Error(`unknown mutation "${mutate}"`), { harness: true });
    const src = (await readFile(FN(m.file), 'utf8')).replace(/\r\n/g, '\n');
    const n = src.split(m.find).length - 1;
    if (n !== 1) {
      throw Object.assign(new Error(`mutation "${mutate}" anchor matched ${n} times in ${m.file} (need 1)`),
        { harness: true });
    }
    base = await mkdtemp(join(tmpdir(), 'hr-loop-'));
    dir = join(base, 'supabase', 'functions', 'hr-accrue');
    await cp(FN(''), dir, { recursive: true });
    await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
    await writeFile(join(dir, m.file), src.replace(m.find, () => m.repl), 'utf8');
  }
  const bust = `?t=${Date.now()}${Math.random()}`;
  const imp = (f) => import(pathToFileURL(join(dir, f)).href + bust);
  return {
    base,
    req: await imp('request.js'),
    sa: await imp('set-activity.js'),
    sb: await imp('shop-buy.js'),
    vs: await imp('vendor-sell.js'),
    eq: await imp('equip.js'),
    pf: await imp('party-fence.js'),
    cat: await imp('catalogue.js'),
  };
}

/* ── THE SERVER, AS A PLAYER MEETS IT ──────────────────────────────────── */
async function makeServer(db, M) {
  const q = async (text, params) => (await db.query(text, params)).rows;
  /* The seam index.ts hands every verb: one statement, as hr_engine. */
  const exec = async (text, params) => {
    await db.exec('set role hr_engine');
    let rows;
    try { rows = (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
    if (/hr_seed\(/.test(text) && rows[0] && 'seed' in rows[0]) rows[0] = { ...rows[0], seed: SEED };
    return rows;
  };
  const tsCols = (await q(`select column_name c from information_schema.columns
     where table_schema='public' and table_name='player_state'
       and data_type='timestamp with time zone' order by ordinal_position`)).map((r) => r.c);
  if (!tsCols.includes('accrued_to')) {
    throw Object.assign(new Error('player_state has no accrued_to: the harness cannot pass time'), { harness: true });
  }
  const clearGate = () => db.query('delete from public.hr_rate_counters');
  const asUser = async (uid, fn) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    try { return await fn(); } finally { await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
  };

  return {
    q,
    async create(uid, name) {
      await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
      await db.query('insert into profiles(id, display_name) values ($1,$2) on conflict (id) do nothing', [uid, name]);
      return asUser(uid, async () => (await q('select public.hr_create_character(0) r'))[0].r);
    },
    /** THE RELOAD: hr_load as `authenticated`, the read the client boots from. */
    async load(uid) {
      return asUser(uid, async () => {
        await db.exec('set role authenticated');
        try { return (await q('select public.hr_load(0) r'))[0].r; } finally { await db.exec('reset role'); }
      });
    },
    async elapse(uid, secs) {
      const set = tsCols.map((c) => `${c} = ${c} - make_interval(secs => $2)`).join(', ');
      await q(`update public.player_state set ${set} where user_id = $1 and slot = 0`, [uid, secs]);
    },
    /** A raw body through parseIntent and the party fence into the verb, the
        way index.ts composes it. Returns `{ status, body }`. */
    async send(uid, raw) {
      await clearGate();
      const it = M.req.parseIntent({ slot: 0, intentId: uuid(), ...raw });
      const fence = await M.pf.partyIntentFence({ exec, user: uid, slot: 0, verb: it.verb });
      const partyOwnsWindow = !!(fence && fence.partyOwnsWindow === true);
      if (fence && !partyOwnsWindow) return fence;
      const base = { exec, user: uid, slot: 0, intentId: it.intentId };
      if (it.verb === 'set_activity') return M.sa.runSetActivity({ ...base, activity: it.activity });
      if (it.verb === 'equip') return M.eq.runEquip({ ...base, equip: it.equip });
      if (it.verb === 'shop_buy') return M.sb.runShopBuy({ ...base, partyOwnsWindow, offer: it.offer, qty: it.qty });
      if (it.verb === 'vendor_sell_many') {
        return M.vs.runVendorSellMany({ ...base, partyOwnsWindow, lines: it.lines });
      }
      throw Object.assign(new Error(`the harness does not route verb ${it.verb}`), { harness: true });
    },
    /** The return settle (harness privilege 4). */
    async settle(uid) {
      await clearGate();
      const [read] = await exec(M.sa.READ_SQL, [uid, 0, 'accrue']);
      const env = read.state;
      return M.sa.collectCurrentWindow({
        exec, user: uid, slot: 0, env, st: env.state,
        nowMs: new Date(read.now).getTime(), capMs: Number(read.cap_ms) || 0,
      });
    },
    /** The settle's own ledger row (a renown ratchet row can land after it). */
    async lastSettleRow(uid) {
      return (await q(`select kind, intent, meta from public.player_ledger
                        where user_id=$1 and kind='combat' and intent='accrue'
                        order by id desc limit 1`, [uid]))[0] || null;
    },
  };
}

/* ── THE STEP RUNNER ───────────────────────────────────────────────────── */
class StepRed extends Error {}

function makeLoop(loopId, rows) {
  let blockedBy = null;
  return async function step(n, name, fn) {
    const id = `${loopId} step ${n}`;
    if (blockedBy) {
      rows.push({ id, name, status: 'BLOCKED', note: `not reached: ${blockedBy} is red` });
      return;
    }
    const notes = [];
    const t = {
      ok(cond, msg) { if (!cond) throw new StepRed(msg); },
      note(s) { notes.push(s); },
    };
    try {
      await fn(t);
      rows.push({ id, name, status: 'pass', note: notes.join('; ') });
    } catch (e) {
      if (e && e.harness) throw e;
      const msg = e instanceof StepRed ? e.message : `threw ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`;
      rows.push({ id, name, status: 'FAIL', note: `${id} (${name}): ${msg}` + (notes.length ? ` [${notes.join('; ')}]` : '') });
      blockedBy = id;
    }
  };
}

/* ── READING THE SERVER ────────────────────────────────────────────────── */
const inv = (env, id) => num(env && env.inventory && env.inventory[id]);
const xpOf = (env, sk) => num(env && env.skills && env.skills[sk] && env.skills[sk].xp);
const lvOf = (env, sk) => num(env && env.skills && env.skills[sk] && env.skills[sk].level);
const COMBAT_SKILLS = ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic'];
const combatXp = (env) => COMBAT_SKILLS.reduce((s, k) => s + xpOf(env, k), 0);
const heals = (id) => num(ITEMS[id] && ITEMS[id].heals);
const isFood = (id) => heals(id) > 0;
function bagDelta(before, after) {
  const d = {};
  const ids = new Set([...Object.keys(before.inventory || {}), ...Object.keys(after.inventory || {})]);
  for (const id of ids) { const k = inv(after, id) - inv(before, id); if (k) d[id] = k; }
  return d;
}
const brief = (o) => String(JSON.stringify(o)).slice(0, 260);
/** A refusal's own fields, without the state envelope it carries. */
const ENVELOPE_KEYS = new Set(['now', 'bank', 'farm', 'buffs', 'place', 'state', 'bounty', 'skills', 'traits',
  'vigour', 'enchant', 'workers', 'progress', 'equipment', 'inventory', 'companions', 'hero_slots', 'gem_unlocks',
  'client_state', 'hunt_analyzer', 'unlocked_recipes', 'dungeon_cooldowns', 'version', 'must_rename',
  'renown_high', 'total_level', 'inventory_complete', 'progress_truncated']);
const bodyOf = (r) => brief(r && r.body && Object.fromEntries(Object.entries(r.body).filter(([k]) => !ENVELOPE_KEYS.has(k))));
/** The combat value of an item for its slot, by the bonuses a melee kit reads. */
const melee = (id) => { const i = ITEMS[id] || {}; return num(i.atkB) + num(i.strB) + num(i.defB); };

/** THE BROWSER NEVER SAYS ONE THING WHILE THE SERVER SAYS ANOTHER (CLAUDE.md §6):
    every envelope a verb hands the client must equal what hr_load reads back. */
async function readBack(S, uid, t, label, envelope) {
  const now = await S.load(uid);
  t.ok(now && now.ok === true, `${label}: hr_load refused ${brief(now)}`);
  if (envelope) sameWorld(t, label, envelope, now, 'the envelope', 'hr_load');
  return now;
}

/** Fight one window of a hunt and read what it paid, from the server. */
async function huntWindow(S, uid, mins, t) {
  const before = await S.load(uid);
  await S.elapse(uid, mins * MIN);
  const c = await S.settle(uid);
  const after = await readBack(S, uid, t, 'the hunt settle', c.env);
  const led = await S.lastSettleRow(uid);
  const d = bagDelta(before, after);
  const ate = Object.entries(d).filter(([id, k]) => k < 0 && isFood(id)).reduce((s, [, k]) => s - k, 0);
  /* Everything that arrived is loot, wheat included: the vendor decides what it buys. */
  const loot = Object.fromEntries(Object.entries(d).filter(([, k]) => k > 0));
  return {
    c, before, after, d, ate, loot,
    kills: num(c.receipt && c.receipt.kills),
    ledgerKills: num(led && led.meta && led.meta.kills),
    xp: combatXp(after) - combatXp(before),
    gold: num(after.state.gold) - num(before.state.gold),
    died: !!(c.receipt && c.receipt.died),
    deaths: num(after.state.deaths_lifetime) - num(before.state.deaths_lifetime),
  };
}

/** Sell every unit of `loot` the vendor will buy. */
async function sellLoot(S, M, p, loot, t) {
  const uid = p.uid;
  const lines = [];
  const kept = [];
  for (const [item, qty] of Object.entries(loot)) {
    if (M.vs.resolveSale(item).ok) lines.push({ item, qty: Math.min(qty, M.req.MAX_QTY) });
    else kept.push(item);
  }
  if (kept.length) t.note(`unsellable loot kept: ${kept.join(',')}`);
  t.ok(lines.length > 0, `the hunt dropped nothing the vendor buys (loot ${brief(loot)})`);
  const before = await S.load(uid);
  const r = await S.send(uid, { verb: 'vendor_sell_many', lines });
  t.ok(r.status === 200 && r.body.ok === true, `the vendor refused the loot: ${r.status} ${bodyOf(r)}`);
  const after = await readBack(S, uid, t, 'vendor_sell_many', r.body);
  const got = num(after.state.gold) - num(before.state.gold);
  t.ok(got > 0, `selling ${lines.length} loot stack(s) paid ${got} gold`);
  t.ok(got === num(r.body.receipt && r.body.receipt.gold),
    `the receipt says ${r.body.receipt && r.body.receipt.gold} gold, the server moved ${got}`);
  for (const l of lines) t.ok(inv(after, l.item) === inv(before, l.item) - l.qty, `${l.item} did not leave the bag`);
  p.env = after;
  p.seen = r.body;
  return { got };
}

/** Two server reads of one character agree on every number a player acts on. */
function sameWorld(t, label, a, b, aName = 'before', bName = 'after reload') {
  t.ok(b && b.ok === true && b.state, `${label}: ${bName} is not an envelope ${brief(b)}`);
  t.ok(a && a.state, `${label}: ${aName} is not an envelope ${brief(a)}`);
  const say = (what, x, y) => `${label}: ${what} ${x} (${aName}) vs ${y} (${bName})`;
  t.ok(num(a.state.gold) === num(b.state.gold), say('gold', a.state.gold, b.state.gold));
  t.ok(num(a.state.hp) === num(b.state.hp), say('hp', a.state.hp, b.state.hp));
  const ids = new Set([...Object.keys(a.inventory || {}), ...Object.keys(b.inventory || {})]);
  for (const id of ids) t.ok(inv(a, id) === inv(b, id), say(id, inv(a, id), inv(b, id)));
  const slots = new Set([...Object.keys(a.equipment || {}), ...Object.keys(b.equipment || {})]);
  for (const s of slots) t.ok((a.equipment || {})[s] === (b.equipment || {})[s], say(`equipment.${s}`, (a.equipment || {})[s], (b.equipment || {})[s]));
  const sks = new Set([...Object.keys(a.skills || {}), ...Object.keys(b.skills || {})]);
  for (const sk of sks) t.ok(xpOf(a, sk) === xpOf(b, sk), say(`${sk} XP`, xpOf(a, sk), xpOf(b, sk)));
  t.ok(a.state.active_kind === b.state.active_kind && a.state.active_id === b.state.active_id,
    say('activity', `${a.state.active_kind}:${a.state.active_id}`, `${b.state.active_kind}:${b.state.active_id}`));
}

/* ── ONE PLAYER: what the server last said, and the two moves every loop makes ── */
const levelsOf = (env) => Object.fromEntries(Object.keys(env.skills || {}).map((k) => [k, xpOf(env, k)]));
const combatOf = (env) => combatLevel(levelsOf(env));

function makePlayer(S, uid) {
  const p = {
    uid,
    env: null,                  // the latest hr_load: what the assertions read
    seen: null,                 // the latest envelope a verb handed the client
    /** One gesture: the body must be a 200 and its envelope must equal hr_load. */
    async act(t, what, raw) {
      const r = await S.send(uid, raw);
      t.ok(r.status === 200 && r.body.ok === true, `${what} refused: ${r.status} ${bodyOf(r)}`);
      p.seen = r.body;
      p.env = await readBack(S, uid, t, what, r.body);
      return r;
    },
    /** `mins` pass on the current activity, then the return settle pays them. */
    async settleAfter(t, what, mins) {
      const before = await S.load(uid);
      await S.elapse(uid, mins * MIN);
      const c = await S.settle(uid);
      t.ok(c.outcome === 'paid', `${what}: ${mins} min settled as ${c.outcome} ${brief(c)}`);
      p.seen = c.env;
      p.env = await readBack(S, uid, t, `${what} settle`, c.env);
      return before;
    },
    /** One window of the current hunt, read from the server. */
    async hunt(t, mins) {
      const h = await huntWindow(S, uid, mins, t);
      t.ok(h.c.outcome === 'paid', `${mins} min of ${h.before.state.active_id} settled as ${h.c.outcome} ${brief(h.c)}`);
      p.env = h.after;
      p.seen = h.c.env;
      return h;
    },
  };
  return p;
}
const huntNote = (h, food) => `${h.kills} kills, +${h.xp} combat XP, ${h.ate} ${food || 'food'} eaten, +${h.gold} gold, loot ${brief(h.loot)}`
  + (h.died ? `, DIED to ${h.c.receipt.diedTo}` : '');

/* ══ LOOP-1 — A NEW PLAYER'S FIRST SESSION ═══════════════════════════════ */
async function loop1(S, M, tag, rows) {
  const step = makeLoop('LOOP-1', rows);
  const p = makePlayer(S, `00000000-0000-4000-a100-${tag}00000001`);
  const HUNT = 'mill_cellar';
  const HUNT_MIN = 30;
  let hunt1 = null;
  let bought = null;

  await step(1, 'start kit', async (t) => {
    const cr = await S.create(p.uid, `Loop1${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_character refused: ${brief(cr)}`);
    p.env = p.seen = await readBack(S, p.uid, t, 'first load', null);
    const e = p.env;
    t.ok(num(e.state.gold) === START_KIT.currency.gold, `gold ${e.state.gold}, the kit says ${START_KIT.currency.gold}`);
    for (const [s, id] of Object.entries(START_KIT.equipment)) t.ok(e.equipment[s] === id, `${s} is ${e.equipment[s]}, the kit says ${id}`);
    for (const [id, n] of Object.entries(START_KIT.inventory)) t.ok(inv(e, id) === n, `${id} x${inv(e, id)}, the kit says ${n}`);
    t.note(`${e.state.gold} gold, ${e.equipment.weapon}, ${inv(e, 'cooked_shrimp')} cooked shrimp, combat ${combatOf(e)}`);
  });

  await step(2, 'gather (fish)', async (t) => {
    await p.act(t, 'set_activity gather:shrimp_s', { verb: 'set_activity', activity: { kind: 'gather', id: 'shrimp_s' } });
    const before = await p.settleAfter(t, 'fishing', 10);
    const got = inv(p.env, 'shrimp') - inv(before, 'shrimp');
    t.ok(got > 0, `ten minutes at the shrimp spot banked ${got} shrimp`);
    t.ok(xpOf(p.env, 'fishing') > xpOf(before, 'fishing'), 'fishing paid no XP');
    t.note(`+${got} shrimp, fishing L${lvOf(p.env, 'fishing')}`);
  });

  await step(3, 'cook a heal', async (t) => {
    await p.act(t, 'set_activity artisan:cook_shrimp', { verb: 'set_activity', activity: { kind: 'artisan', id: 'cook_shrimp' } });
    const before = await p.settleAfter(t, 'cooking', 10);
    const cooked = inv(p.env, 'cooked_shrimp') - inv(before, 'cooked_shrimp');
    const used = inv(before, 'shrimp') - inv(p.env, 'shrimp');
    t.ok(used > 0, 'the cook used no raw shrimp');
    t.ok(cooked > 0, `cooking ${used} raw shrimp made ${cooked} cooked shrimp`);
    t.ok(xpOf(p.env, 'cooking') > xpOf(before, 'cooking'), 'cooking paid no XP');
    t.note(`${used} raw -> +${cooked} cooked, +${inv(p.env, 'burnt_food') - inv(before, 'burnt_food')} burnt, cooking L${lvOf(p.env, 'cooking')}`);
  });

  await step(4, 'buy basic food (NPC)', async (t) => {
    const o = cheapestFood(M);
    t.ok(o, 'the NPC counter sells no healing food at all');
    const before = p.env;
    t.ok(num(before.state.gold) >= o.gold, `the cheapest food (${o.id}) costs ${o.gold}, the player has ${before.state.gold}`);
    await p.act(t, `shop_buy ${o.id}`, { verb: 'shop_buy', offer: o.id, qty: 1 });
    t.ok(inv(p.env, o.item) === inv(before, o.item) + o.amount, `${o.id} did not deliver ${o.amount} ${o.item}`);
    t.ok(num(p.env.state.gold) === num(before.state.gold) - o.gold, `${o.id} charged ${num(before.state.gold) - num(p.env.state.gold)}, the catalogue says ${o.gold}`);
    t.note(`${o.id}: ${o.amount} ${o.item} for ${o.gold} gold`);
  });

  await step(5, 'set a hunt (Mill Cellar)', async (t) => {
    const cl = combatOf(p.env);
    const locked = HUNTS.filter((h) => h.band[0] > cl).sort((a, b) => a.band[0] - b.band[0])[0];
    if (locked) {
      const no = await S.send(p.uid, { verb: 'set_activity', activity: { kind: 'combat', id: locked.id } });
      t.ok(no.status !== 200, `a combat-${cl} character was let into ${locked.id} (band floor ${locked.band[0]})`);
      t.note(`${locked.id} refused at combat ${cl}: ${no.body && no.body.error}`);
    }
    await p.act(t, `set_activity combat:${HUNT}`, { verb: 'set_activity', activity: { kind: 'combat', id: HUNT } });
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === HUNT,
      `the server pointer is ${p.env.state.active_kind}:${p.env.state.active_id}, not combat:${HUNT}`);
  });

  await step(6, 'kills pay XP and loot', async (t) => {
    hunt1 = await p.hunt(t, HUNT_MIN);
    t.ok(hunt1.kills > 0 && hunt1.ledgerKills === hunt1.kills, `the receipt says ${hunt1.kills} kills, the ledger ${hunt1.ledgerKills}`);
    t.ok(hunt1.xp > 0, `${hunt1.kills} kills credited ${hunt1.xp} combat XP`);
    t.ok(Object.keys(hunt1.loot).length > 0, `${hunt1.kills} kills dropped no loot server-side (bag delta ${brief(hunt1.d)})`);
    t.note(huntNote(hunt1));
  });

  await step(7, 'sell the loot', async (t) => {
    const s = await sellLoot(S, M, p, hunt1.loot, t);
    t.note(`+${s.got} gold from loot (now ${p.env.state.gold})`);
  });

  await step(8, 'buy an upgrade', async (t) => {
    const gold = num(p.env.state.gold);
    const cands = npcUpgrades(M, p.env);
    t.ok(cands.length > 0, 'the NPC counter sells no equipment this character can wield that beats its kit');
    const cheapest = [...cands].sort((a, b) => a.o.gold - b.o.gold)[0];
    const afford = cands.filter((c) => c.o.gold <= gold).sort((a, b) => (b.gain - a.gain) || (a.o.gold - b.o.gold));
    t.ok(afford.length > 0,
      `no upgrade reachable from the gold earned: ${gold} gold, the cheapest upgrade ${cheapest.o.id} costs ${cheapest.o.gold}`);
    const pick = afford[0];
    const before = p.env;
    await p.act(t, `shop_buy ${pick.o.id}`, { verb: 'shop_buy', offer: pick.o.id, qty: 1 });
    t.ok(inv(p.env, pick.id) === inv(before, pick.id) + 1, `${pick.o.id} did not deliver ${pick.id}`);
    t.ok(num(p.env.state.gold) === gold - pick.o.gold, `${pick.o.id} charged ${gold - num(p.env.state.gold)}, the catalogue says ${pick.o.gold}`);
    bought = { id: pick.id, slot: pick.it.slot, was: before.equipment[pick.it.slot] || null };
    const total = cands.reduce((s, c) => s + c.o.gold, 0);
    t.note(`${pick.o.id} (${pick.it.slot}, +${pick.gain} bonus) for ${pick.o.gold}; ${afford.length} of ${cands.length} NPC upgrades affordable, all ${cands.length} cost ${total}`);
  });

  await step(9, 'equip it', async (t) => {
    await equipFromBag(p, t, bought.slot, bought.id);
  });

  await step(10, 'hunt again, better', async (t) => {
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === HUNT,
      `the equip moved the pointer to ${p.env.state.active_kind}:${p.env.state.active_id}`);
    const h2 = await p.hunt(t, HUNT_MIN);
    const per = (h) => (h.kills ? h.ate / h.kills : Infinity);
    const better = h2.kills > hunt1.kills || (h2.kills === hunt1.kills && per(h2) < per(hunt1)) || (hunt1.died && !h2.died);
    t.ok(better, `same hunt, same dice, ${bought.id} on: ${h2.kills} kills / ${h2.ate} food vs ${hunt1.kills} / ${hunt1.ate} before`);
    t.note(`${hunt1.kills} -> ${h2.kills} kills, food/kill ${per(hunt1).toFixed(2)} -> ${per(h2).toFixed(2)}, +${h2.xp} XP`
      + (h2.died ? `, DIED to ${h2.c.receipt.diedTo}` : ''));
  });

  await step(11, 'reload, everything still there', async (t) => {
    const reread = await S.load(p.uid);
    sameWorld(t, 'reload', p.seen, reread, 'the last envelope', 'hr_load after reload');
    t.ok(reread.equipment[bought.slot] === bought.id, `the ${bought.id} is gone from ${bought.slot} after a reload`);
    p.env = reread;
  });

  await step(12, 'the return settle pays once', async (t) => {
    await p.settleAfter(t, 'five minutes away', 5);
    const mid = p.env;
    const again = await S.settle(p.uid);
    t.ok(again.outcome === 'nothing', `a second settle of the same window answered ${again.outcome} ${brief(again.receipt)}`);
    sameWorld(t, 'second settle', mid, await S.load(p.uid), 'after the first settle', 'after the second');
  });
}

/** The NPC food offers: one healing item, gold price. Read from what the server sells. */
function foodOffers(M) {
  return Object.values(M.cat.GOLD_OFFERS)
    .filter((o) => o.grant.length === 1 && isFood(o.grant[0].id))
    .map((o) => ({ id: o.id, item: o.grant[0].id, amount: o.grant[0].amount, gold: o.gold, heals: heals(o.grant[0].id) }));
}
const cheapestFood = (M) => foodOffers(M).sort((a, b) => a.gold - b.gold)[0] || null;

/** Every NPC equipment offer this character can wield that beats what it wears. */
function npcUpgrades(M, env) {
  const wielded = ITEMS[env.equipment.weapon] || {};
  return Object.values(M.cat.GOLD_OFFERS).filter((o) => o.id.startsWith('equip.') && o.grant.length === 1)
    .map((o) => ({ o, id: o.grant[0].id, it: ITEMS[o.grant[0].id] || {} }))
    .filter((c) => c.it.slot && (!c.it.reqSkill || lvOf(env, c.it.reqSkill) >= num(c.it.reqLv)))
    /* A melee player upgrades melee: a bow or a staff is a new style, not a better sword. */
    .filter((c) => c.it.slot !== 'weapon' || !['ranged', 'magic'].includes(c.it.weaponType) || c.it.weaponType === wielded.weaponType)
    .map((c) => ({ ...c, gain: melee(c.id) - melee(env.equipment[c.it.slot]) }))
    .filter((c) => c.gain > 0);
}

/** Equip one item from the bag through the real verb and read the swap back. */
async function equipFromBag(p, t, slot, id) {
  const before = p.env;
  const was = before.equipment[slot] || null;
  await p.act(t, `equip ${slot}=${id}`, { verb: 'equip', equip: { [slot]: id } });
  t.ok(p.env.equipment[slot] === id, `the server slot ${slot} holds ${p.env.equipment[slot]}`);
  t.ok(inv(p.env, id) === inv(before, id) - 1, `${id} did not leave the bag`);
  if (was) t.ok(inv(p.env, was) === inv(before, was) + 1, `the old ${was} did not return to the bag`);
}

/* ══ LOOP-2 — A MID-LEVEL CHARACTER (COMBAT 40) ══════════════════════════ */
const MID_LEVEL = 35;                       // attack/strength/defence/hitpoints -> combat 40
const MID_KIT = { weapon: 'steel_sword', helmet: 'steel_helm', body: 'steel_platebody',
  boots: 'steel_boots', gloves: 'steel_gauntlets', belt: 'steel_belt' };
const MID_GOLD = 6000;

async function loop2(S, M, tag, rows) {
  const step = makeLoop('LOOP-2', rows);
  const p = makePlayer(S, `00000000-0000-4000-a200-${tag}00000002`);
  const HOUR_MIN = 60;
  let hunt = null;
  let food = null;
  let hour = null;
  let lootGold = 0;

  await step(1, 'a Combat-40 character', async (t) => {
    const cr = await S.create(p.uid, `Loop2${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_character refused: ${brief(cr)}`);
    for (const sk of ['attack', 'strength', 'defense', 'hitpoints']) {
      await S.q('update public.player_skills set xp = $3 where user_id=$1 and slot=0 and skill_id=$2', [p.uid, sk, xpForLevel(MID_LEVEL)]);
    }
    await S.q('update public.player_state set gold=$2, hp=$3, max_hp=$3 where user_id=$1 and slot=0', [p.uid, MID_GOLD, MID_LEVEL]);
    for (const id of Object.values(MID_KIT)) {
      await S.q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,1)
                 on conflict (user_id, slot, item_id) do update set qty = player_inventory.qty + 1`, [p.uid, id]);
    }
    await p.act(t, 'equip the steel kit', { verb: 'equip', equip: { ...MID_KIT } });
    for (const [s, id] of Object.entries(MID_KIT)) t.ok(p.env.equipment[s] === id, `${s} is ${p.env.equipment[s]}, not ${id}`);
    const cl = combatOf(p.env);
    t.ok(cl >= 38 && cl <= 42, `the fixture is combat ${cl}, not ~40`);
    t.note(`combat ${cl}, hp ${p.env.state.max_hp}, ${p.env.state.gold} gold, steel kit equipped`);
  });

  await step(2, 'pick a hunt for my level', async (t) => {
    const cl = combatOf(p.env);
    const fit = HUNTS.filter((h) => h.band[0] <= cl && cl <= h.band[1]).sort((a, b) => b.band[0] - a.band[0]);
    t.ok(fit.length > 0, `no named hunt's band holds combat ${cl} (${HUNTS.map((h) => `${h.id}[${h.band}]`).join(' ')})`);
    hunt = fit[0];
    t.note(`${hunt.id} [${hunt.band}] (${fit.length} of ${HUNTS.length} hunts fit combat ${cl})`);
  });

  await step(3, 'buy supplies', async (t) => {
    const offers = foodOffers(M).filter((o) => o.gold * 4 <= num(p.env.state.gold)).sort((a, b) => b.heals - a.heals);
    t.ok(offers.length > 0, `no NPC food is affordable four times over on ${p.env.state.gold} gold`);
    food = offers[0];
    const before = p.env;
    await p.act(t, `shop_buy ${food.id} x4`, { verb: 'shop_buy', offer: food.id, qty: 4 });
    t.ok(inv(p.env, food.item) === inv(before, food.item) + 4 * food.amount, `${food.id} did not deliver`);
    t.note(`4 x ${food.id} = ${4 * food.amount} ${food.item} (heals ${food.heals}) for ${4 * food.gold}`);
  });

  await step(4, 'set the hunt', async (t) => {
    await p.act(t, `set_activity combat:${hunt.id}`, { verb: 'set_activity', activity: { kind: 'combat', id: hunt.id } });
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === hunt.id, `the pointer is ${p.env.state.active_id}`);
  });

  await step(5, 'the hunt burns supplies and loots', async (t) => {
    hour = await p.hunt(t, HOUR_MIN);
    t.ok(hour.kills > 0, `an hour of ${hunt.id} at combat 40 killed ${hour.kills}`);
    t.ok(hour.xp > 0, 'the kills paid no combat XP');
    t.ok(Object.keys(hour.loot).length > 0, `${hour.kills} kills dropped no loot`);
    t.ok(hour.ate > 0, `an hour of ${hunt.id} burnt no supplies (${hour.kills} kills): food is not part of this hunt`);
    t.note(huntNote(hour, food.item));
  });

  await step(6, 'sell the loot', async (t) => {
    const s = await sellLoot(S, M, p, hour.loot, t);
    lootGold = s.got + hour.gold;
    t.note(`+${s.got} gold from loot, +${hour.gold} gold dropped`);
  });

  await step(7, 'restock', async (t) => {
    const packs = Math.max(1, Math.ceil(hour.ate / food.amount));
    const cost = packs * food.gold;
    t.ok(num(p.env.state.gold) >= cost, `restocking ${hour.ate} ${food.item} costs ${cost}, the player has ${p.env.state.gold}`);
    const before = p.env;
    await p.act(t, `shop_buy ${food.id} x${packs}`, { verb: 'shop_buy', offer: food.id, qty: packs });
    t.ok(inv(p.env, food.item) === inv(before, food.item) + packs * food.amount, 'the restock did not deliver');
    t.note(`hour net ${lootGold - cost >= 0 ? '+' : ''}${lootGold - cost} gold (loot ${lootGold} - food ${cost})`);
  });

  await step(8, 'keep hunting', async (t) => {
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === hunt.id,
      `the restock moved the pointer to ${p.env.state.active_kind}:${p.env.state.active_id}`);
    const h2 = await p.hunt(t, HOUR_MIN);
    t.ok(h2.kills > 0, `the next hour of ${hunt.id} killed ${h2.kills}`);
    t.note(`${h2.kills} kills, ${h2.ate} eaten`);
  });

  await step(9, 'reload, everything still there', async (t) => {
    sameWorld(t, 'reload', p.seen, await S.load(p.uid), 'the last envelope', 'hr_load after reload');
  });
}

/* ══ LOOP-3 — THE CRAFTED UPGRADE (the "crafted better" half of supplies) ═══ */
async function loop3(S, M, tag, rows) {
  const step = makeLoop('LOOP-3', rows);
  const p = makePlayer(S, `00000000-0000-4000-a300-${tag}00000003`);
  /* The ore and the bars are named; the PIECE is whatever the server lets this
     smith forge from that bag, so a re-tuned recipe level moves the pick, not the gate. */
  const ROUTE = [
    { kind: 'gather', id: 'copper_rock', mins: 10, makes: 'copper_ore', skill: 'mining' },
    { kind: 'artisan', id: 'smelt_bronze', mins: 5, makes: 'bronze_bar', skill: 'smithing' },
    { kind: 'artisan', id: null, mins: 1, makes: null, skill: 'smithing' },
  ];
  const forgeable = () => Object.entries(M.cat.ARTISAN_RECIPES_PAYABLE)
    .filter(([, r]) => r.skill === 'smithing' && num(r.recipe.req) <= lvOf(p.env, 'smithing'))
    .map(([id, r]) => ({ id, out: r.recipe.output, ins: r.recipe.inputs || (r.recipe.input ? { [r.recipe.input]: 1 } : {}) }))
    .filter((r) => Object.entries(r.ins).every(([i, k]) => inv(p.env, i) >= k))
    .map((r) => ({ ...r, it: ITEMS[r.out] || {} }))
    .filter((r) => r.it.slot && (!r.it.reqSkill || lvOf(p.env, r.it.reqSkill) >= num(r.it.reqLv)))
    .map((r) => ({ ...r, gain: melee(r.out) - melee(p.env.equipment[r.it.slot]) }))
    .filter((r) => r.gain > 0)
    .sort((a, b) => b.gain - a.gain);

  await step(1, 'a fresh character', async (t) => {
    const cr = await S.create(p.uid, `Loop3${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_character refused: ${brief(cr)}`);
    p.env = p.seen = await readBack(S, p.uid, t, 'first load', null);
  });

  let n = 1;
  for (const r of ROUTE) {
    n++;
    await step(n, r.id ? `${r.kind} ${r.id}` : 'forge a piece I can wear', async (t) => {
      if (!r.id) {
        const pick = forgeable()[0];
        t.ok(pick, `smithing L${lvOf(p.env, 'smithing')} with ${inv(p.env, 'bronze_bar')} bronze bars can forge nothing wearable that beats the kit`);
        r.id = pick.id;
        r.makes = pick.out;
      }
      await p.act(t, `set_activity ${r.kind}:${r.id}`, { verb: 'set_activity', activity: { kind: r.kind, id: r.id } });
      const before = await p.settleAfter(t, r.id, r.mins);
      const got = inv(p.env, r.makes) - inv(before, r.makes);
      t.ok(got > 0, `${r.mins} min of ${r.id} made ${got} ${r.makes} (bag delta ${brief(bagDelta(before, p.env))})`);
      t.ok(xpOf(p.env, r.skill) > xpOf(before, r.skill), `${r.id} paid no ${r.skill} XP`);
      t.note(`+${got} ${r.makes}, ${r.skill} L${lvOf(p.env, r.skill)}`);
    });
  }

  await step(n + 1, 'equip the crafted piece', async (t) => {
    const made = ROUTE[ROUTE.length - 1].makes;
    const it = ITEMS[made] || {};
    t.ok(it.slot && (!it.reqSkill || lvOf(p.env, it.reqSkill) >= num(it.reqLv)), `${made} is not equipment this character can wear`);
    t.ok(melee(made) > melee(p.env.equipment[it.slot]), `${made} does not beat what is in ${it.slot}`);
    await equipFromBag(p, t, it.slot, made);
  });
}

/* ══ LOOP-4 — THE FIRST NIGHT WITH ONLY THE KIT: KNOCKED OUT IS NEVER STRANDED ══ */
async function loop4(S, M, tag, rows) {
  const step = makeLoop('LOOP-4', rows);
  const p = makePlayer(S, `00000000-0000-4000-a400-${tag}00000004`);
  const NIGHT_MIN = 10 * 60;
  let night = null;

  await step(1, 'a night on Mill Cellar with the kit', async (t) => {
    const cr = await S.create(p.uid, `Loop4${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_character refused: ${brief(cr)}`);
    await p.act(t, 'set_activity combat:mill_cellar', { verb: 'set_activity', activity: { kind: 'combat', id: 'mill_cellar' } });
    night = await p.hunt(t, NIGHT_MIN);
    t.ok(night.kills > 0, `a ten-hour night on Mill Cellar killed ${night.kills}`);
    const paid = num(night.c.receipt && night.c.receipt.paidMs);
    t.note(`${night.kills} kills, ${night.deaths} death(s), fought ${(paid / 60000).toFixed(1)} of ${NIGHT_MIN} min, `
      + `${inv(p.env, 'cooked_shrimp')} cooked shrimp left, hp ${p.env.state.hp}/${p.env.state.max_hp}`);
  });

  await step(2, 'knocked out: the hunt refuses by name', async (t) => {
    const until = Date.parse(p.env.state.recovering_until);
    if (!(until > Date.parse(p.env.now))) { t.note('not knocked out at the end of the night'); return; }
    const r = await S.send(p.uid, { verb: 'set_activity', activity: { kind: 'combat', id: 'mill_cellar' } });
    t.ok(r.status === 409 && r.body.error === 'recovering' && r.body.until,
      `a knocked-out hunt answered ${r.status} ${bodyOf(r)} — want 409 recovering with its until`);
    t.note(`recovering for ${Math.round(num(r.body.remaining_ms) / 60000)} min`);
  });

  await step(3, 'never stranded: gather and buy food', async (t) => {
    await p.act(t, 'set_activity gather:shrimp_s while recovering', { verb: 'set_activity', activity: { kind: 'gather', id: 'shrimp_s' } });
    const o = cheapestFood(M);
    t.ok(o && num(p.env.state.gold) >= o.gold, `the knocked-out player has ${p.env.state.gold} gold and the cheapest food costs ${o && o.gold}`);
    await p.act(t, `shop_buy ${o.id} while recovering`, { verb: 'shop_buy', offer: o.id, qty: 1 });
  });

  await step(4, 'back on the hunt after recovering', async (t) => {
    const until = Date.parse(p.env.state.recovering_until);
    const wait = until > Date.parse(p.env.now) ? Math.ceil((until - Date.parse(p.env.now)) / 60000) + 1 : 1;
    await p.settleAfter(t, 'fishing out the recovery', wait);
    await p.act(t, 'set_activity combat:mill_cellar after recovery', { verb: 'set_activity', activity: { kind: 'combat', id: 'mill_cellar' } });
    const h = await p.hunt(t, 10);
    t.ok(h.kills > 0, `ten minutes back on Mill Cellar killed ${h.kills}`);
    t.note(`waited ${wait} min fishing, then ${huntNote(h)}`);
  });
}

/* ── ONE PLAY-THROUGH ──────────────────────────────────────────────────── */
async function play(db, mutate, tag) {
  const M = await loadModules(mutate);
  try {
    const S = await makeServer(db, M);
    const rows = [];
    for (const loop of [loop1, loop2, loop3, loop4]) await loop(S, M, tag, rows);
    return rows;
  } finally {
    if (M.base) await rm(M.base, { recursive: true, force: true });
  }
}

function printTable(rows) {
  const w = Math.max(...rows.map((r) => `${r.id} ${r.name}`.length));
  for (const r of rows) {
    console.log(`  ${r.status.padEnd(7)} ${`${r.id} ${r.name}`.padEnd(w)}  ${r.note || ''}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(26)} ${m.by.padEnd(14)} ${m.why}`);
    return 0;
  }
  const one = (argv.find((a) => a.startsWith('--mutate=')) || '').slice('--mutate='.length) || null;
  const proof = argv.includes('--selftest') || argv.includes('--mutate');

  const t0 = Date.now();
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    console.error(`core-loop: the migration chain would not replay: ${e.message}`);
    return 2;
  }
  console.log(`CORE LOOP — the chain replayed in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

  /* THE CLEAN RUN ALWAYS RUNS FIRST: a proof that never sees green cannot tell
     a caught dead end from its own corpse (guard-hygiene RULE 3). */
  const clean = await play(db, null, '0000');
  printTable(clean);
  const red = clean.filter((r) => r.status === 'FAIL');
  if (red.length) {
    console.error(`\nCORE LOOP RED — ${red.length} step(s) failed, ${clean.filter((r) => r.status === 'BLOCKED').length} blocked:`);
    for (const r of red) console.error(`  ✗ ${r.note}`);
  } else {
    console.log(`\nCORE LOOP GREEN — ${clean.length} steps, every loop played end to end.`);
  }
  if (!proof && !one) return red.length ? 1 : 0;
  if (red.length) { console.error('\ncore-loop --selftest: the clean run is red; the proof cannot run on a broken floor.'); return 1; }

  const ids = one ? [one] : Object.keys(MUTATIONS);
  let slipped = 0;
  let n = 0;
  for (const id of ids) {
    n++;
    const rows = await play(db, id, String(n).padStart(4, '0'));
    const first = rows.find((r) => r.status === 'FAIL');
    const by = MUTATIONS[id].by;
    if (first && first.id === by) {
      console.log(`  caught   ${id.padEnd(26)} by ${first.id}: ${first.note.slice(0, 150)}`);
    } else {
      slipped++;
      console.error(`  SLIPPED  ${id.padEnd(26)} wanted ${by} red first, got ${first ? first.id : 'all green'}`);
    }
  }
  console.log(slipped ? `\n${slipped} of ${ids.length} dead end(s) SLIPPED` : `\nall ${ids.length} planted dead ends caught by their named step`);
  return slipped ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`core-loop HARNESS: ${e && e.stack ? e.stack : e}`);
  process.exit(2);
});
