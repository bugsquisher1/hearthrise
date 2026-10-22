#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/core-loop.mjs — THE LOOP GATE. Does the game still PLAY?
//
//   node tests/core-loop.mjs               five loops, one step table, exit 1 on any red step
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
// PORTED TO HUNT SESSIONS (lane C2, master plan M3): a fight is a session —
// hr_hunt_enter with a packed bag, the one hunt settle (hunt-settle.js
// settleHunt, the function the world tick and the player's hunt verbs run),
// an end that sends the character back to its last activity.
//
// ── THE LOOP MAP: which system answers each step, and what it feeds ────────
// A later lane that swaps one of these systems must keep its arrow alive.
//
//   LOOP-1, a fresh character from the real start kit
//    1    log in                    hr_create_hero <- src/data/start-kit.js        all
//    2    fish                      set_activity gather:shrimp_s, settle            3
//    3    cook a heal               set_activity artisan:cook_shrimp, settle        6
//    4    the NPC prices food per use hr_hunt_basic_supplies: the tier-1 shop heal   6
//                                   is priced per use, and no counter sells food
//                                   below it (master plan row 2)
//    5    enter a hunt              hr_hunt_enter mill_cellar with a packed bag     6
//                                   (a hunt above my band is refused)
//    6    kills pay                 settleHunt -> computeAccrual (session) ->       7
//                                   hr_hunt_apply (one statement)
//    7    leave the hunt            hr_hunt_leave: the bag comes home               8
//    8    sell the loot             vendor_sell_many (catalogue.vendorPriceOf)      9
//    9    buy an upgrade            shop_buy equip.* the character can wield        10
//   10    equip it                  equip -> hr_apply equipment                     11
//   11    hunt again, better        a new session, the same dice, the new kit       12
//   12    reload                    hr_load (the boot read) == the last envelope    -
//   13    a settle pays once        a second settle of one window writes nothing    -
//
//   LOOP-2, a mid-level character (Combat 40)
//    1    a Level-15 character      fixture levels + gold + iron kit, REAL equip    all
//    2    pick a hunt for my level  src/data/hunts.js band contains my level        4
//    3    switch the shop heal on   hr_action_set_put: the bar buys a heal per use  4
//                                   (master plan rows 1 and 25: off for a new bar)
//    4    enter with an empty bag   hr_hunt_enter, the gold is the supply           5
//    5    the hunt buys and loots   settleHunt: kills, loot, XP, shop heals paid    6
//                                   per use (supply_buy), never below the floor
//    6    leave and sell            hr_hunt_leave, vendor_sell_many                 7
//    7    the hour pays for itself  loot + coins - the shop's gold > 0              8
//    8    keep hunting              a new session pays the next hour                9
//    9    reload                    hr_load == the last envelope                    -
//
//   LOOP-3, a CRAFTED supply beats its basic (master plan M3: the hybrid supply)
//    1    a fresh character         hr_create_hero                                  2
//    2    fish                      gather:shrimp_s                                 3
//    3    cook                      artisan:cook_shrimp                             5
//    4    the crafted heal is better hr_items heals vs hr_hunt_basic_supplies:      5
//                                   more per use, less gold per point
//    5    the bag is spent first    a hunt with the crafted bag AND the shop slot   -
//                                   on eats the bag before the shop bills a coin
//
//   LOOP-4, the first night with only the kit (Hunt Sessions)
//    1    hunt all night            hr_hunt_enter mill_cellar, a 10 h settle        2
//    2    the hunt ends on its own  falls / heals_out / stamina — an automatic end  3
//    3    back to work              the pointer is the last activity, fishing       4
//                                   (default resume), journalled `resume`
//    4    never stranded            fishing pays, shop_buy food still accepted      5
//    5    back on the hunt          a new session pays                              -
//
//   LOOP-5, an L100 day (Combat 99, 12 h of stamina)
//    1    a Combat-99 character     fixture levels + gold + a big bag, a gather     2
//                                   set first (the activity a day resumes)
//    2    hunt until stamina ends   settleHunt over 13 h of clock: the hunt ends    3
//                                   `stamina` after ~12 h of hunting
//    3    the day resumes           back to the gather, a fresh presence anchor     4
//    4    rest pays                 12 h later the gather pays and stamina is full  -
//
// Every verb's envelope is also compared with hr_load the moment it lands
// (readBack): the browser never says one thing while the server says another.
//
// ── WHAT IT DRIVES ─────────────────────────────────────────────────────────
// The REAL edge verbs (set-activity.js, shop-buy.js, vendor-sell.js, equip.js,
// hunt-settle.js), each fed by request.js parseIntent from a RAW
// body exactly as index.ts composes them, and the hunt RPCs (hr_hunt_enter /
// hr_hunt_leave) as the signed-in player calls them, against the REAL migration
// chain replayed into PGlite (tests/schema-replay.mjs). Every assertion reads the
// SERVER: hr_load, the envelope a verb returned, the session rows, or the ledger.
//
// ── THE HARNESS PRIVILEGES, STATED (each is a test fixture, never a game rule) ──
//   1. THE DICE. hr_seed's `seed` column is replaced by one constant, so every
//      window rolls the same dice (tests/absence-priced-at-return.mjs does the
//      same); a hunt's per-swing secret is the session's own (hunt-seed.js).
//   2. TIME. `elapse()` moves every timestamptz column of the character's
//      player_state row, its hunt sessions and its presence anchor back by N
//      seconds: N seconds pass for that character. The column lists are READ
//      from the catalogue, so a new watermark is moved with the rest.
//   3. THE RATE GATE. hr_rate_counters is cleared before each gesture: a real
//      player's gestures are minutes apart, these are milliseconds apart.
//   4. THE SETTLE. index.ts's `accrue` verb is Deno and cannot be imported, so
//      a gather's return settle is collectCurrentWindow (set-activity.js); a
//      hunt's is settleHunt (hunt-settle.js), the function the tick runs.
//   5. LOOP-2's and LOOP-5's levels, gold, kit and bag are written as a
//      fixture: playing to Combat 40 / 99 inside a replay is days of engine
//      time. Their EQUIP is real.
//
// ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
// The browser (the in-page suite owns the screens), the world tick's cron
// driver (tests/hunt-sessions-settle.mjs TICK-0), JWT/pooler/CORS, true
// concurrency.
// ════════════════════════════════════════════════════════════════════════

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { ITEMS } from '../src/data/items.js';
import { HUNTS } from '../src/data/hunts.js';
import { START_KIT } from '../src/data/start-kit.js';
import { charLevelFromXp, charXpForLevel, skillXpForLevel } from '../src/core/xp.js';
import { BASIC_INDEX } from '../src/data/supply-basics.js';
import { STAMINA_MAX_MS as STAMINA_CAPS, DEFAULT_RESUME, SESSION_LIMITS } from '../src/data/hunt-sessions.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { recommendedHunt, huntRows } from '../src/shell/hunt-list.js';
/* A free character's pool (lane S1: the cap is per character, free 8 h / premium 12 h). */
const STAMINA_MAX_MS = STAMINA_CAPS.free;
/* The hunts a character can enter: lane S1 fights only on a ground. */
const GROUNDED = new Set(Object.values(HUNT_GROUNDS).map((g) => g.hunt));

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
   wrong file. The anchors below are declared for tools/guard-anchors.mjs, so a
   lane that moves one re-proves this gate in lane-done instead of at night. */
// mutant-anchors: supabase/functions/hr-accrue/accrual.js supabase/functions/hr-accrue/vendor-sell.js supabase/functions/hr-accrue/catalogue.js supabase/functions/hr-accrue/equip.js src/core/action-rules.js
const MUTATIONS = {
  cooking_unpayable: {
    file: 'catalogue.js', by: 'LOOP-1 step 3',
    why: 'the cooking bench falls out of the payable set: a caught fish can never become a heal',
    find: 'export const ARTISAN_RECIPES_PAYABLE = payableRecipeIndex(ARTISAN_RECIPES_ALL);',
    repl: 'export const ARTISAN_RECIPES_PAYABLE = Object.fromEntries(Object.entries('
      + "payableRecipeIndex(ARTISAN_RECIPES_ALL)).filter(([, r]) => r.skill !== 'cooking'));",
  },
  hunt_drops_nothing: {
    file: '../../../src/core/member.js', by: 'LOOP-1 step 6',
    why: 'kills stop dropping loot server-side: the hunt pays XP and nothing to sell',
    /* Re-anchored: the hunt's loot sink is memberSide's addItem (src/core/member.js since option B). */
    find: '      itemDelta[id] = (itemDelta[id] || 0) + n;\n      hs.tally.loot[id] = (hs.tally.loot[id] || 0) + n;',
    repl: '      return;',
  },
  sell_pays_nothing: {
    file: 'vendor-sell.js', by: 'LOOP-1 step 8',
    why: 'the vendor takes the loot and pays no gold: nothing funds an upgrade',
    find: '    gold += s.unit * s.qty;',
    repl: '    gold += 0;',
  },
  shop_sells_no_gear: {
    file: 'catalogue.js', by: 'LOOP-1 step 9',
    why: 'the NPC counter stops selling equipment: gold has nothing to become',
    find: 'export const GOLD_OFFERS = Object.freeze(goldOffers);',
    repl: 'export const GOLD_OFFERS = Object.freeze(Object.fromEntries(Object.entries(goldOffers)'
      + ".filter(([k]) => !k.startsWith('equip.'))));",
  },
  equip_refuses_everything: {
    file: 'equip.js', by: 'LOOP-1 step 10',
    why: 'every equip is refused as wrong_slot: the upgrade sits in the bag forever',
    find: '    if (fits[s] !== true) {',
    repl: '    if (fits) {',
  },
  bag_ignored: {
    /* Re-pointed lane S1: the one supply resolver (action-rules.js resolveLine)
       never reaches the bag, so the packed food is never eaten and the store
       feeds the hero instead — LOOP-3 step 5's "the bag is spent first". */
    file: '../../../src/core/action-rules.js', by: 'LOOP-3 step 5',
    why: 'the resolver never picks a packed heal: the packed food is never eaten',
    find: '    const own = pickOwn(hs, want, Math.max(1, int(need, 1)));',
    repl: '    const own = null;',
  },
  stamina_never_ends: {
    /* Lane S1: a fresh character's night now ends on stamina (its eight hours), so LOOP-4 goes red first. */
    file: '../../../src/core/action-rules.js', by: 'LOOP-4 step 2',
    why: 'an empty stamina pool ends nothing: a hunt runs forever and the day never turns',
    find: "  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),",
    repl: '  stamina: () => false,',
  },
};

/* ── MODULES ───────────────────────────────────────────────────────────── */
async function loadModules(mutate) {
  let dir = FN('');
  let base = null;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) throw Object.assign(new Error(`unknown mutation "${mutate}"`), { harness: true });
    const src = (await readFile(join(FN(''), m.file), 'utf8')).replace(/\r\n/g, '\n');
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
    cat: await imp('catalogue.js'),
    hs: await imp('hunt-settle.js'),
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
  const colsOf = async (t) => (await q(`select column_name c from information_schema.columns
     where table_schema='public' and table_name=$1
       and data_type='timestamp with time zone' order by ordinal_position`, [t])).map((r) => r.c);
  const tsCols = await colsOf('player_state');
  const huntCols = await colsOf('hunt_sessions');
  /* Lane S1: a hunt's clock is its INSTANCE's too (hunt_instances.settled_to / next_swing_at). */
  const instCols = await colsOf('hunt_instances');
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
      /* The one creation door (2026-11-02-hero-creation.sql): a hero with no name does not enter the world. */
      return asUser(uid, async () => (await q("select public.hr_create_hero(0, $1, '{\"head\": 13, \"body\": 5, \"legs\": 3, \"feet\": 0}'::jsonb, gen_random_uuid()) r", [name]))[0].r);
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
      if (huntCols.length) {
        const hs = huntCols.map((c) => `${c} = ${c} - make_interval(secs => $2)`).join(', ');
        await q(`update public.hunt_sessions set ${hs} where user_id = $1 and slot = 0`, [uid, secs]);
      }
      if (instCols.length) {
        const is = instCols.map((c) => `${c} = ${c} - make_interval(secs => $2)`).join(', ');
        await q(`update public.hunt_instances set ${is} where id in (select instance_id from public.hunt_sessions
                   where user_id = $1 and slot = 0 and ended_at is null)`, [uid, secs]);
      }
      await q(`update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2)
                where user_id = $1 and slot = 0`, [uid, secs]);
    },
    /** A hunt RPC as the signed-in player (hr_hunt_enter / hr_hunt_leave / options). */
    async rpc(uid, sql, params) {
      await clearGate();
      return asUser(uid, async () => (await q(sql, params))[0].r);
    },
    /** The hunt's settle: settleHunt, the function the world tick runs. */
    async huntSettle(uid) {
      await clearGate();
      return M.hs.settleHunt({ exec, user: uid, slot: 0, mode: 'tick' });
    },
    async session(uid) {
      return (await q(`select h.*, row_to_json(t) as tally from public.hunt_sessions h
                         left join public.hunt_session_tally t on t.session_id = h.id
                        where h.user_id = $1 and h.slot = 0 order by h.entered_at desc limit 1`, [uid]))[0] || null;
    },
    /** A raw body through parseIntent into the verb, the way index.ts
        composes it. Returns `{ status, body }`. */
    async send(uid, raw) {
      await clearGate();
      const it = M.req.parseIntent({ slot: 0, intentId: uuid(), ...raw });
      const base = { exec, user: uid, slot: 0, intentId: it.intentId };
      if (it.verb === 'set_activity') return M.sa.runSetActivity({ ...base, activity: it.activity });
      if (it.verb === 'equip') return M.eq.runEquip({ ...base, equip: it.equip });
      if (it.verb === 'shop_buy') return M.sb.runShopBuy({ ...base, offer: it.offer, qty: it.qty });
      if (it.verb === 'vendor_sell_many') {
        return M.vs.runVendorSellMany({ ...base, lines: it.lines });
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
const COMBAT_SKILLS = ['melee', 'defense', 'ranged', 'magic', 'prayer'];
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

/** Fight one stretch of the open hunt and read what it paid, from the server.
    Settles in at most 6 h steps (the settle's own window fuse) until the clock
    is caught up or the hunt ends. */
async function huntWindow(S, uid, mins, t) {
  const before = await S.load(uid);
  const s0 = await S.session(uid);
  await S.elapse(uid, mins * MIN);
  let c = null;
  let paid = false;
  for (let k = 0; k < 200; k++) {   // successive fires: a settle simulates at most HUNT_SETTLE_SPAN_MS
    c = await S.huntSettle(uid);
    if (c.outcome === 'paid') paid = true;
    const sess = await S.session(uid);
    if (c.outcome !== 'paid' || (sess && sess.ended_at)) break;
  }
  const after = await readBack(S, uid, t, 'the hunt settle', null);
  const s1 = await S.session(uid);
  const d = bagDelta(before, after);
  const loot = Object.fromEntries(Object.entries(d).filter(([, k]) => k > 0));
  const tally = (s1 && s1.tally) || {};
  const tally0 = (s0 && s0.id === (s1 && s1.id) && s0.tally) || {};
  const sup = (o) => Object.values(o.supplies || {}).reduce((a, n) => a + num(n), 0);
  return {
    c, paid, before, after, d, loot, session: s1,
    kills: num(tally.kills) - num(tally0.kills),
    ate: sup(tally) - sup(tally0),
    xp: combatXp(after) - combatXp(before),
    gold: num(after.state.gold) - num(before.state.gold),
    deaths: num(tally.deaths) - num(tally0.deaths),
    ended: s1 && s1.end_reason,
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
/* The character's Level: the server's state.level_xp on the shared curve (the core rebuild: Level from kills). */
const combatOf = (env) => charLevelFromXp(num(env && env.state && env.state.level_xp));

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
    /** One stretch of the open hunt, read from the server. */
    async hunt(t, mins) {
      const h = await huntWindow(S, uid, mins, t);
      t.ok(h.paid || h.ended, `${mins} min of ${h.before.state.active_id} settled as ${h.c && h.c.outcome} ${brief(h.c && h.c.body && h.c.body.reason)}`);
      p.env = h.after;
      p.seen = h.after;
      return h;
    },
    /** Enter a hunt with a bag {item: qty} (the player's own RPC). */
    async enter(t, hunt, bag) {
      /* A hunt starts from town: the client stops (and the edge collects) the
         current activity first — hr_hunt_enter refuses `activity_running`. */
      if (p.env && p.env.state && p.env.state.active_kind !== 'idle') {
        await p.act(t, 'set_activity idle (leave for the hunt)', { verb: 'set_activity', activity: { kind: 'idle', id: null } });
      }
      const lines = Object.entries(bag || {}).filter(([, n]) => n > 0).map(([item, qty]) => ({ item, qty }));
      const r = await S.rpc(uid, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid) r',
        [hunt, JSON.stringify(lines), uuid()]);
      t.ok(r && r.ok === true, `hr_hunt_enter ${hunt} refused: ${brief(r)}`);
      p.env = await readBack(S, uid, t, `enter ${hunt}`, null);
      return r;
    },
    /** Leave the hunt: settle, ask to leave, let the look-ahead pass, settle again (it closes then). */
    async leave(t) {
      await S.huntSettle(uid);
      /* A hunt that ended on its own (stamina, gold, falls) has already walked home: nothing to leave. */
      const open = await S.session(uid);
      if (open && open.ended_at) { t.note(`already ended ${open.end_reason}`); p.env = p.seen = await readBack(S, uid, t, 'leave', null); return { ok: true, ended: open.end_reason }; }
      const r = await S.rpc(uid, 'select public.hr_hunt_leave(0, $1::uuid) r', [uuid()]);
      t.ok(r && r.ok === true, `hr_hunt_leave refused: ${brief(r)}`);
      /* A leave PENDS past the live look-ahead (2026-10-31-live-horizon.sql, 32 s): let it pass, then settle. */
      if (r.pending) { await S.elapse(uid, 40); await S.huntSettle(uid); }
      const sess = await S.session(uid);
      t.ok(sess && sess.ended_at, `the hunt did not close on leave (${brief(sess)})`);
      p.env = p.seen = await readBack(S, uid, t, 'leave', null);
      return r;
    },
  };
  return p;
}
const huntNote = (h, food) => `${h.kills} kills, +${h.xp} combat XP, ${h.ate} ${food || 'supplies'} used, +${h.gold} gold, loot ${brief(h.loot)}`
  + (h.deaths ? `, ${h.deaths} fall(s)` : '') + (h.ended ? `, ended ${h.ended}` : '');

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
    t.ok(cr && cr.ok === true, `hr_create_hero refused: ${brief(cr)}`);
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

  await step(4, 'the NPC prices food per use', async (t) => {
    /* Master plan rows 1-2 (hybrid supplies): the NPC sells a heal PER USE from
       a shop slot that shows its price; no counter sells cooked food below it. */
    /* The store's cheapest heal per point (the bar slot picks the store food; no hunt tier does). */
    const basic = (await S.q(`select basic_id, heals, price from public.hr_hunt_basic_supplies
                               where kind = 'heal' order by price::numeric / heals, basic_id limit 1`))[0];
    t.ok(basic && num(basic.price) > 0 && num(basic.heals) > 0, `the server prices no store heal: ${brief(basic)}`);
    const cheap = foodOffers(M).filter((o) => basic && o.gold / (o.amount * o.heals) < num(basic.price) / num(basic.heals));
    t.ok(cheap.length === 0, `a counter undercuts the shop heal: ${cheap.map((o) => o.id).join(', ')}`);
    t.note(`${basic && basic.basic_id}: ${basic && basic.heals} hp for ${basic && basic.price} g a use; ${foodOffers(M).length} counter food offer(s)`);
  });

  await step(5, 'enter a hunt (Mill Cellar)', async (t) => {
    const cl = combatOf(p.env);
    /* The floor is a warning (Tyler 10-18): only SESSION_LIMITS.belowRangeRefuse or more levels under it is refused. */
    const locked = HUNTS.filter((h) => h.band[0] - cl >= SESSION_LIMITS.belowRangeRefuse).sort((a, b) => a.band[0] - b.band[0])[0];
    if (locked) {
      const no = await S.rpc(p.uid, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid) r',
        [locked.id, '[]', uuid()]);
      t.ok(!(no && no.ok === true), `a combat-${cl} character was let into ${locked.id} (band floor ${locked.band[0]}, ${SESSION_LIMITS.belowRangeRefuse}+ under is refused)`);
      t.note(`${locked.id} refused at combat ${cl}: ${no && no.error}`);
    }
    await p.enter(t, HUNT, { cooked_shrimp: inv(p.env, 'cooked_shrimp') });
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === HUNT,
      `the server pointer is ${p.env.state.active_kind}:${p.env.state.active_id}, not combat:${HUNT}`);
  });

  await step(6, 'kills pay XP and loot', async (t) => {
    hunt1 = await p.hunt(t, HUNT_MIN);
    t.ok(hunt1.kills > 0, `${HUNT_MIN} min of ${HUNT} killed ${hunt1.kills}`);
    t.ok(hunt1.xp > 0, `${hunt1.kills} kills credited ${hunt1.xp} combat XP`);
    t.ok(Object.keys(hunt1.loot).length > 0, `${hunt1.kills} kills dropped no loot server-side (bag delta ${brief(hunt1.d)})`);
    t.note(huntNote(hunt1));
  });

  await step(7, 'leave the hunt (the bag comes home)', async (t) => {
    const s0 = await S.session(p.uid);
    const left = await S.q('select coalesce(sum(qty_left), 0)::int n from public.hunt_bag where session_id = $1', [s0.id]);
    const before = inv(p.env, 'cooked_shrimp');
    await p.leave(t);
    t.ok(inv(p.env, 'cooked_shrimp') === before + num(left[0].n), `the ${left[0].n} shrimp left in the bag did not come home`);
  });

  await step(8, 'sell the loot', async (t) => {
    const s = await sellLoot(S, M, p, hunt1.loot, t);
    t.note(`+${s.got} gold from loot (now ${p.env.state.gold})`);
  });

  await step(9, 'buy an upgrade', async (t) => {
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
    t.note(`${pick.o.id} (${pick.it.slot}, +${pick.gain} bonus) for ${pick.o.gold}; ${afford.length} of ${cands.length} NPC upgrades affordable`);
  });

  await step(10, 'equip it', async (t) => {
    await equipFromBag(p, t, bought.slot, bought.id);
  });

  await step(11, 'hunt again, better', async (t) => {
    await p.enter(t, HUNT, { cooked_shrimp: inv(p.env, 'cooked_shrimp') });
    const h2 = await p.hunt(t, HUNT_MIN);
    const per = (h) => (h.kills ? h.ate / h.kills : Infinity);
    /* Mill Cellar is SPAWN-LIMITED (src/data/hunts.js respawnMs): a better
       weapon cannot kill foes that have not come back, so on that ground it
       shows as fewer heals a kill at (about) the same kill count. */
    const better = h2.kills > hunt1.kills || (h2.kills >= Math.floor(hunt1.kills * 0.95) && per(h2) < per(hunt1))
      || (h2.kills === hunt1.kills && per(h2) <= per(hunt1)) || h2.deaths < hunt1.deaths;
    t.ok(better, `same hunt, ${bought.id} on: ${h2.kills} kills / ${h2.ate} heals / ${h2.deaths} falls vs ${hunt1.kills} / ${hunt1.ate} / ${hunt1.deaths} before`);
    t.note(`${hunt1.kills} -> ${h2.kills} kills, heals/kill ${per(hunt1).toFixed(2)} -> ${per(h2).toFixed(2)}, +${h2.xp} XP`);
  });

  await step(12, 'reload, everything still there', async (t) => {
    const reread = await S.load(p.uid);
    sameWorld(t, 'reload', p.seen, reread, 'the last envelope', 'hr_load after reload');
    t.ok(reread.equipment[bought.slot] === bought.id, `the ${bought.id} is gone from ${bought.slot} after a reload`);
    p.env = reread;
  });

  await step(13, 'a hunt settle pays once', async (t) => {
    /* Every interval of the session's clock is paid or knocked out EXACTLY
       once, however many settles walked it: paid + down = settled_to − hunt_from
       (less the 1 ms an end-only window stands on). */
    await S.elapse(p.uid, 5 * MIN);
    await S.huntSettle(p.uid);
    await S.huntSettle(p.uid);
    const sess = await S.session(p.uid);
    const ms = (v) => new Date(v).getTime();
    const span = ms(sess.settled_to) - ms(sess.hunt_from);
    const walked = num(sess.tally.paid_ms) + num(sess.tally.down_ms);
    t.ok(walked <= span && span - walked <= 10, `the session walked ${walked} ms of a ${span} ms clock: a window was paid twice or skipped`);
    t.note(`${(span / 60000).toFixed(1)} min of clock, ${(walked / 60000).toFixed(1)} min walked`);
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

/* ══ LOOP-2 — A MID-LEVEL CHARACTER (LEVEL 15, the Thicket's top) ═══════ */
/* Level 15 with Melee and Defense at 15 (the iron kit asks 15) in the iron kit: the top of Meadowbrook
   Thicket's solo band (5-15). The Sewer (8-25) is a party ground (Tyler 2026-10-21: "The Sewer is a party hunt"),
   so a lone hero over 15 is told no solo ground fits yet (src/shell/hunt-list.js recommendation) — a designer
   gap until Mosslight Glade lands, not this loop's question. */
const MID_LEVEL = 15;
const MID_CHAR_LEVEL = 15;
const MID_KIT = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody',
  boots: 'iron_boots', gloves: 'iron_gauntlets', belt: 'iron_belt' };
const MID_GOLD = 6000;

async function loop2(S, M, tag, rows) {
  const step = makeLoop('LOOP-2', rows);
  const p = makePlayer(S, `00000000-0000-4000-a200-${tag}00000002`);
  const HOUR_MIN = 60;
  let hunt = null;
  let food = null;
  let hour = null;
  let lootGold = 0;

  await step(1, 'a Level-15 character', async (t) => {
    const cr = await S.create(p.uid, `Loop2${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_hero refused: ${brief(cr)}`);
    for (const sk of ['melee', 'defense']) {
      await S.q('update public.player_skills set xp = $3 where user_id=$1 and slot=0 and skill_id=$2', [p.uid, sk, skillXpForLevel(sk, MID_LEVEL)]);
    }
    /* Level XP is the hunt settle's to credit; the fixture writes the column the settle would have. */
    await S.q('update public.player_state set gold=$2, level_xp=$3, hp=100000 where user_id=$1 and slot=0', [p.uid, MID_GOLD, charXpForLevel(MID_CHAR_LEVEL)]);
    for (const id of Object.values(MID_KIT)) {
      await S.q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,1)
                 on conflict (user_id, slot, item_id) do update set qty = player_inventory.qty + 1`, [p.uid, id]);
    }
    await p.act(t, 'equip the iron kit', { verb: 'equip', equip: { ...MID_KIT } });
    for (const [s, id] of Object.entries(MID_KIT)) t.ok(p.env.equipment[s] === id, `${s} is ${p.env.equipment[s]}, not ${id}`);
    const cl = combatOf(p.env);
    t.ok(cl === MID_CHAR_LEVEL, `the fixture is Level ${cl}, not ${MID_CHAR_LEVEL}`);
    t.note(`Level ${cl}, hp ${p.env.state.max_hp}, ${p.env.state.gold} gold, iron kit equipped`);
  });

  await step(2, 'pick a hunt for my level', async (t) => {
    const cl = combatOf(p.env);
    const fit = HUNTS.filter((h) => GROUNDED.has(h.id) && h.band[0] <= cl && cl <= h.band[1]);
    t.ok(fit.length > 0, `no named hunt's band holds combat ${cl} (${HUNTS.map((h) => `${h.id}[${h.band}]`).join(' ')})`);
    /* the player's move: the hunt the Hunts window recommends a lone hero of this level (the one chooser) */
    const rec = recommendedHunt(cl, 1, huntRows());
    hunt = rec && HUNTS.find((h) => h.id === rec.hunt);
    t.ok(!!hunt && fit.includes(hunt), `the Hunts window recommends ${rec && rec.hunt}, which is not a ground in band for combat ${cl}`);
    if (!hunt) return;
    t.note(`${hunt.id} [${hunt.band}] (recommended alone; ${fit.length} of ${HUNTS.length} hunts fit combat ${cl})`);
  });

  await step(3, 'switch the shop heal on', async (t) => {
    /* Lane S1: hunts are idle and the bar is ability ids; the supply setting is
       the hero's option (spec §3.8). */
    /* …and chooses "Use Store Supplies" (Master Design Reference §4): the store
       is never used without the player's choice. */
    /* …and eats at 80% HP: a Combat 40 hero in the sewer drops under the default 50% only a few times
       an hour (3 meals on one dice stream, 0 on another), so the default left this step to the dice. */
    /* STORE BY SLOT (2026-11-07-store-by-slot.sql): the game never picks a supply, so the player's move is the
       store's food ON THE BAR, eaten under 80% HP (the starter bar's 60% leaves a Thicket hour to the dice). */
    const bar = [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 80 }], join: 'and' }];
    const pick = await S.rpc(p.uid, `select public.hr_action_set_options(0, 0, $2::jsonb, $1::uuid) r`, [uuid(), JSON.stringify({ supply_source: 'store', slots: bar })]);
    t.ok(pick && pick.ok === true && pick.options && pick.options.supply_source === 'store', `the supplies choice was refused: ${brief(pick)}`);
    food = { item: '*heal_shop' };
  });

  await step(4, 'enter with an empty bag', async (t) => {
    await p.enter(t, hunt.id, {});
    t.ok(p.env.state.active_kind === 'combat' && p.env.state.active_id === hunt.id, `the pointer is ${p.env.state.active_id}`);
  });

  await step(5, 'the hunt buys heals and loots', async (t) => {
    hour = await p.hunt(t, HOUR_MIN);
    const tally = (hour.session && hour.session.tally) || {};
    const bought = Object.values(tally.bought || {}).reduce((a, n) => a + num(n), 0);
    t.ok(hour.kills > 0, `an hour of ${hunt.id} at combat 40 killed ${hour.kills}`);
    t.ok(hour.xp > 0, 'the kills paid no combat XP');
    t.ok(Object.keys(hour.loot).length > 0, `${hour.kills} kills dropped no loot`);
    t.ok(bought > 0 && num(tally.supply_gold) > 0, `an hour of ${hunt.id} bought no shop heal (${hour.kills} kills): the per-use shop is not part of this hunt`);
    t.ok(num(p.env.state.gold) >= 300, `the shop took the purse to ${p.env.state.gold}, below the 300 floor`);
    food.bought = bought; food.gold = num(tally.supply_gold);
    t.note(`${huntNote(hour)}; ${bought} shop heals for ${tally.supply_gold} g`);
  });

  await step(6, 'leave and sell the loot', async (t) => {
    await p.leave(t);
    const s = await sellLoot(S, M, p, hour.loot, t);
    lootGold = s.got + hour.gold;
    t.note(`+${s.got} gold from loot, +${hour.gold} gold dropped`);
  });

  await step(7, 'the hour pays for itself', async (t) => {
    /* hour.gold is the purse's move over the hour: coins dropped minus the
       shop's per-use debits, so the sale on top of it is the hour's net. */
    const net = lootGold;
    t.ok(net > 0, `an hour of ${hunt.id} on the shop's heals lost gold: net ${net} (shop took ${food.gold})`);
    t.note(`hour net ${net >= 0 ? '+' : ''}${net} gold (the shop's ${food.gold} included)`);
  });

  await step(8, 'keep hunting', async (t) => {
    await p.enter(t, hunt.id, {});
    const h2 = await p.hunt(t, HOUR_MIN);
    t.ok(h2.kills > 0, `the next hour of ${hunt.id} killed ${h2.kills}`);
    t.note(`${h2.kills} kills, ${h2.ate} eaten`);
  });

  await step(9, 'reload, everything still there', async (t) => {
    sameWorld(t, 'reload', p.seen, await S.load(p.uid), 'the last envelope', 'hr_load after reload');
  });
}

/* ══ LOOP-3 — A CRAFTED SUPPLY BEATS ITS BASIC (master plan M3) ═══════════ */
async function loop3(S, M, tag, rows) {
  const step = makeLoop('LOOP-3', rows);
  const p = makePlayer(S, `00000000-0000-4000-a300-${tag}00000003`);

  await step(1, 'a fresh character', async (t) => {
    const cr = await S.create(p.uid, `Loop3${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_hero refused: ${brief(cr)}`);
    p.env = p.seen = await readBack(S, p.uid, t, 'first load', null);
  });

  await step(2, 'fish', async (t) => {
    await p.act(t, 'set_activity gather:shrimp_s', { verb: 'set_activity', activity: { kind: 'gather', id: 'shrimp_s' } });
    const before = await p.settleAfter(t, 'fishing', 20);
    t.ok(inv(p.env, 'shrimp') > inv(before, 'shrimp'), 'twenty minutes of fishing banked no shrimp');
  });

  await step(3, 'cook', async (t) => {
    await p.act(t, 'set_activity artisan:cook_shrimp', { verb: 'set_activity', activity: { kind: 'artisan', id: 'cook_shrimp' } });
    const before = await p.settleAfter(t, 'cooking', 10);
    t.ok(inv(p.env, 'cooked_shrimp') > inv(before, 'cooked_shrimp'), 'cooking made no cooked shrimp');
    t.note(`${inv(p.env, 'cooked_shrimp')} cooked shrimp in the bag`);
  });

  await step(4, 'the crafted heal is better than its basic', async (t) => {
    const basic = (await S.q(`select basic_id, heals, price from public.hr_hunt_basic_supplies where partner = 'cooked_shrimp' and kind = 'heal'`))[0];
    const crafted = (await S.q(`select heals from public.hr_items where item_id = 'cooked_shrimp'`))[0];
    const book = M.cat.vendorPriceOf ? num(ITEMS.cooked_shrimp.v) : num(ITEMS.cooked_shrimp.v);
    t.ok(basic && crafted, 'the server has no shop heal partnered with Cooked Shrimp, or no Cooked Shrimp');
    t.ok(num(crafted.heals) > num(basic.heals), `Cooked Shrimp heals ${crafted.heals}, its shop basic ${basic.basic_id} ${basic.heals}`);
    const perPointCrafted = book / num(crafted.heals);
    const perPointBasic = num(basic.price) / num(basic.heals);
    t.ok(perPointCrafted < perPointBasic, `crafted ${perPointCrafted.toFixed(1)} g/point at book vs shop ${perPointBasic.toFixed(1)} g/point`);
    t.note(`cooked ${crafted.heals} hp at ${book} g book vs ${basic.basic_id} ${basic.heals} hp at ${basic.price} g`);
    t.ok(BASIC_INDEX[basic.basic_id] && BASIC_INDEX[basic.basic_id].price === num(basic.price), 'the server price is not supply-basics.js');
  });

  await step(5, 'the bag is spent before the shop bills a coin', async (t) => {
    /* "Use My Supplies, Switch to Store Supplies when they run out" (MDR §4). */
    /* (food_below_pct 99: the hero eats on any wound, so the order — bag before store — is what is graded, not the dice) */
    const pick = await S.rpc(p.uid, `select public.hr_action_set_options(0, 0, '{"supply_source":"mine","on_empty":"switch","food_below_pct":99}'::jsonb, $1::uuid) r`, [uuid()]);
    t.ok(pick && pick.ok === true && pick.options && pick.options.on_empty === 'switch', `the supplies choice was refused: ${brief(pick)}`);
    const packed = inv(p.env, 'cooked_shrimp');
    await p.enter(t, 'mill_cellar', { cooked_shrimp: packed });
    const h = await p.hunt(t, 30);
    const s1 = h.session || {};
    const used = num((s1.tally && s1.tally.supplies && s1.tally.supplies.cooked_shrimp) || 0);
    /* The bag's HEAL is spent before the shop's heal (a drink has no bag line to spend first). */
    const bought = Object.entries((s1.tally && s1.tally.bought) || {}).filter(([id]) => BASIC_INDEX[id] && BASIC_INDEX[id].kind === 'heal').reduce((a, [, n]) => a + num(n), 0);
    t.ok(used > 0, `a 30-minute hunt with ${packed} cooked shrimp packed ate none of them`);
    const left = (await S.q('select coalesce(sum(qty_left), 0)::int n from public.hunt_bag where session_id = $1 and item_id = $2', [s1.id, 'cooked_shrimp']))[0].n;
    t.ok(bought === 0 || num(left) === 0, `the shop billed ${bought} use(s) while ${left} cooked shrimp were still in the bag`);
    t.note(`${used} cooked shrimp eaten, ${bought} shop heals bought, ${left} left; ${huntNote(h)}`);
  });
}

/* ══ LOOP-4 — THE FIRST NIGHT WITH ONLY THE KIT ══════════════════════════════ */
async function loop4(S, M, tag, rows) {
  const step = makeLoop('LOOP-4', rows);
  const p = makePlayer(S, `00000000-0000-4000-a400-${tag}00000004`);
  const NIGHT_MIN = 10 * 60;
  let night = null;

  await step(1, 'a night on Mill Cellar with the kit', async (t) => {
    const cr = await S.create(p.uid, `Loop4${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_hero refused: ${brief(cr)}`);
    p.env = await readBack(S, p.uid, t, 'first load', null);
    await p.enter(t, 'mill_cellar', { cooked_shrimp: inv(p.env, 'cooked_shrimp') });
    night = await p.hunt(t, NIGHT_MIN);
    t.ok(night.kills > 0, `a ten-hour night on Mill Cellar killed ${night.kills}`);
    t.note(huntNote(night));
  });

  await step(2, 'the hunt ends on its own', async (t) => {
    const reason = night.session && night.session.end_reason;
    t.ok(['died', 'heals_out', 'gold_out', 'stamina', 'ammo_out'].includes(reason),
      `ten hours with only the kit left the hunt ${reason || 'open'}: a night must end on an automatic reason`);
    t.note(`ended ${reason}`);
  });

  /* A hero that never chose an activity goes idle after the hunt (live v0.2.11: it used to start fishing,
     invisibly); only an activity the player chose resumes (DEFAULT_RESUME is null). */
  await step(3, 'back in town: idle, nothing started behind the player', async (t) => {
    const now = await S.load(p.uid);
    t.ok(DEFAULT_RESUME === null && now.state.active_kind === 'idle',
      `after the hunt the pointer is ${now.state.active_kind}:${now.state.active_id}, not idle`);
    const r = await S.q(`select meta from public.player_ledger where user_id = $1 and kind = 'hunt' and intent = 'resume'
                          order by id desc limit 1`, [p.uid]);
    t.ok(r[0] && r[0].meta && r[0].meta.resumed === false, `the resume was not journalled as nothing resumed: ${brief(r[0])}`);
    p.env = now;
  });

  await step(4, 'never stranded: fishing pays, food can be bought', async (t) => {
    /* The player picks fishing itself (nothing resumes behind it). */
    await p.act(t, 'set_activity gather:shrimp_s', { verb: 'set_activity', activity: { kind: 'gather', id: 'shrimp_s' } });
    const before = await p.settleAfter(t, 'fishing after the hunt', 20);
    t.ok(inv(p.env, 'shrimp') > inv(before, 'shrimp'), 'fishing after the hunt paid nothing');
    const o = cheapestFood(M);
    if (o) {
      t.ok(num(p.env.state.gold) >= o.gold, `the player has ${p.env.state.gold} gold and the cheapest food costs ${o.gold}`);
      await p.act(t, `shop_buy ${o.id}`, { verb: 'shop_buy', offer: o.id, qty: 1 });
    } else {
      t.note('the counter sells no cooked food (the shop slot is the fallback)');
    }
  });

  await step(5, 'back on the hunt', async (t) => {
    await p.enter(t, 'mill_cellar', { cooked_shrimp: inv(p.env, 'cooked_shrimp') });
    const h = await p.hunt(t, 10);
    t.ok(h.kills > 0, `ten minutes back on Mill Cellar killed ${h.kills}`);
    t.note(huntNote(h));
  });
}

/* ══ LOOP-5 — AN L100 DAY: 12 h OF STAMINA, THEN THE DAY TURNS ════════════════ */
async function loop5(S, M, tag, rows) {
  const step = makeLoop('LOOP-5', rows);
  const p = makePlayer(S, `00000000-0000-4000-a500-${tag}00000005`);
  const KIT = { weapon: 'rune_sword', helmet: 'rune_helm', body: 'rune_platebody' };
  let day = null;

  await step(1, 'a Combat-99 character', async (t) => {
    const cr = await S.create(p.uid, `Loop5${tag}`);
    t.ok(cr && cr.ok === true, `hr_create_hero refused: ${brief(cr)}`);
    for (const sk of ['melee', 'defense']) {
      await S.q('update public.player_skills set xp = $3 where user_id=$1 and slot=0 and skill_id=$2', [p.uid, sk, skillXpForLevel(sk, 99)]);
    }
    await S.q('update public.player_state set gold=$2, level_xp=$3, hp=100000 where user_id=$1 and slot=0', [p.uid, 200000, charXpForLevel(99)]);
    await S.q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,'cooked_shark',1500)
               on conflict (user_id, slot, item_id) do update set qty = 1500`, [p.uid]);
    const kit = Object.fromEntries(Object.entries(KIT).filter(([, id]) => ITEMS[id]));
    for (const id of Object.values(kit)) {
      await S.q(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,1)
                 on conflict (user_id, slot, item_id) do update set qty = player_inventory.qty + 1`, [p.uid, id]);
    }
    if (Object.keys(kit).length) await p.act(t, 'equip the kit', { verb: 'equip', equip: kit });
    /* The activity the day resumes: a gather set before the hunt. */
    await p.act(t, 'set_activity gather:shrimp_s', { verb: 'set_activity', activity: { kind: 'gather', id: 'shrimp_s' } });
    t.note(`combat ${combatOf(p.env)}, ${p.env.state.gold} gold, 1500 sharks, kit ${Object.values(kit).join(',')}`);
  });

  await step(2, 'hunt until stamina ends the day', async (t) => {
    const top = HUNTS.filter((h) => GROUNDED.has(h.id) && h.band[0] <= combatOf(p.env)).sort((a, b) => b.band[0] - a.band[0])[0];
    await p.enter(t, top.id, { cooked_shark: 1500 });
    day = await p.hunt(t, 13 * 60);
    const sess = day.session || {};
    t.ok(sess.end_reason === 'stamina', `13 h of clock ended the hunt '${sess.end_reason || 'open'}', not on stamina`);
    const hunted = num(sess.tally && sess.tally.paid_ms) - 0;
    t.ok(hunted >= STAMINA_MAX_MS - 10 * 60000 && hunted <= STAMINA_MAX_MS + 10 * 60000,
      `the hunt fought ${(hunted / 3600000).toFixed(2)} h on a ${(STAMINA_MAX_MS / 3600000)} h pool`);
    t.note(`${top.id}: ${huntNote(day)}, fought ${(hunted / 3600000).toFixed(2)} h`);
  });

  await step(3, 'the day resumes, with a fresh presence anchor', async (t) => {
    const now = await S.load(p.uid);
    t.ok(now.state.active_kind === 'gather' && now.state.active_id === 'shrimp_s',
      `after the stamina end the pointer is ${now.state.active_kind}:${now.state.active_id}, not gather:shrimp_s`);
    const a = (await S.q('select real_return_at from public.hr_return_anchor where user_id = $1 and slot = 0', [p.uid]))[0];
    t.ok(a && new Date(a.real_return_at).getTime() >= new Date(now.state.active_since).getTime(),
      `the automatic end stamped no presence anchor at the walk home (anchor ${a && a.real_return_at}, resumed from ${now.state.active_since})`);
    p.env = now;
  });

  await step(4, 'twelve hours of rest pay, and the pool is full again', async (t) => {
    const before = await p.settleAfter(t, 'twelve hours of fishing', 12 * 60);
    t.ok(inv(p.env, 'shrimp') > inv(before, 'shrimp'), 'twelve hours of resumed fishing paid nothing');
    const st = p.env.stamina || {};
    t.ok(num(st.ms) >= STAMINA_MAX_MS, `after twelve hours of rest the pool is ${st.ms} of ${STAMINA_MAX_MS}`);
    t.note(`+${inv(p.env, 'shrimp') - inv(before, 'shrimp')} shrimp, stamina ${(num(st.ms) / 3600000).toFixed(2)} h`);
  });
}

/* ── ONE PLAY-THROUGH ──────────────────────────────────────────────────── */
async function play(db, mutate, tag) {
  const M = await loadModules(mutate);
  try {
    const S = await makeServer(db, M);
    const rows = [];
    for (const loop of [loop1, loop2, loop3, loop4, loop5]) await loop(S, M, tag, rows);
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
  /* PINNED DICE (lane S1): a hunt's swings are seeded by hr_seed(instance id) and the
     instance id is a gen_random_uuid, so every run rolled a different hunt and a
     marginal step (LOOP-2's break-even hour) could flip. A fixed PRNG secret and a
     counting uuid make every run roll the same dice (the clean run, then each mutant
     in order). */
  await db.query(`update public.hr_server_secrets set secret = sha256(convert_to('core-loop:fixed-prng:1', 'utf8')) where name = 'prng'`);
  await db.exec(`create sequence if not exists public.hr_test_uuid_seq;
    create or replace function pg_catalog.gen_random_uuid() returns uuid language sql volatile as
      $f$ select ('00000000-0000-4000-8000-' || lpad(to_hex(nextval('public.hr_test_uuid_seq')), 12, '0'))::uuid $f$;`);

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
