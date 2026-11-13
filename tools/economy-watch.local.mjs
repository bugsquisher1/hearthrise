// tools/economy-watch.local.mjs — GOLD IN AGAINST GOLD OUT, per UTC day, from the server's own journal. Read-only, one screen.
//
//   node tools/economy-watch.local.mjs             the last 7 UTC days and today so far: gold in by source, out by sink, the net,
//                                                  gold held, per active hero, the top 5 heroes, then the alarms
//   node tools/economy-watch.local.mjs --selftest  every alarm on a planted in-memory ledger, then each alarm's mutants (no token, no DB).
//                                                  --mutate is the same proof.
//
// WHAT IT READS. public.player_ledger, the append-only journal every value movement writes (CLAUDE.md §6): gold > 0 entered a
// purse, gold < 0 left one. Beside it public.account_wallet (the purses), player_state.level_xp (each active hero's Level) and
// the ledger's own kind CHECK. SELECT-only through the Management API with ~/.supabase-token (read as file bytes, never printed,
// never in argv) inside a READ ONLY transaction, as tools/hunt-health.local.mjs does. The walled game master accounts
// (hr_gm_accounts) are left out of every figure. Only 8-character account prefixes leave the database (the repo is public).
// Its cost: two scans of the journal's last 8 days through its (at, id) primary key (76k rows on 2026-11-07, well under a
// second) and one sum over the whole journal for the reconcile line. Local tool, its --selftest runs in CI.
//
// SOURCES AND SINKS COME FROM THE DATA. Every kind:verb the journal holds is a row here, under its name when GOLD_KEYS knows
// it and under its raw key when it doesn't (and then it alarms). A verb that names a catalogue family splits by it
// (unlock_buy:temper.* is tempering, unlock_buy:room.* house rooms, town_show:<offer> a powder or a round by gold-sinks.js), so
// a new family reads apart and alarms too. A row the server marks meta.transfer (the market's buy and its sale) moves gold
// between players: it is neither a source nor a sink, and only the market's cut leaves the game.
//
// THE ALARMS, each with the number that justifies it (exit 1 when any fires, 2 when a read fails):
//   A1 A SOURCE RUNNING AWAY. On the newest complete UTC day a source paid more than 100% more gold per active hero than the
//      day before. Per active hero so a growing population never trips it, only a source paying each hero more does. Judged
//      only when both days had at least 10 active heroes and the source was at least 10% of the day's gold in. Measured
//      2026-11-02..06 with 5-13 heroes: monster coin per active hero moved -51%, +9%, +9% and -50% day to day, and vendor sales
//      went from 0 to 50k a hero on 11-05, when two accounts sold 655k of stored loot to pay 1.52M for tempering the day it
//      shipped. One account was 46% to 100% of every day's vendor gold that week: under about ten heroes a per-hero figure is
//      one player's day, so the rule waits. Doubling is past every upward move coin made that week. 10% keeps a 2% source's
//      noise out (kill tasks were 2% of gold in) while monster coin (56%) and vendor sales (43%) are judged.
//   A2 NET INFLOW PER ACTIVE HERO PAST THE SHEET. Over the complete days, net gold per active hero-day against what the sheet
//      pays for the hours those heroes really hunted, at their own Levels. The sheet's coin an hour at Level L = Level XP an
//      hour (the measured pace in tools/balance-sim/level-pace.json or the contract x BALANCE_SHEET's xpVsContract max,
//      whichever is higher, times the party ceiling fourVsSolo max) x the formula's best coin per Level XP (formulaStats over
//      every role, fit and ground), read no higher than the content ceiling (level-pace.json `ceiling`, 50: no ground pays past
//      it). Income = coin x INCOME_PER_COIN (coin 1, commons 1.15, gear 0.5, rares 0.25, kill tasks 0.35, each part's source on
//      the constant). Supplies are not taken off, so this is a ceiling: past it, gold is entering that the game is not built to
//      pay (a mint, a mispriced vendor row, a source the sheet doesn't know). It is not a drift alarm (A1 is). Measured
//      2026-11-07: live monster coin ran 3.4k-6.9k a hunted hour, a third to two thirds of the formula's ceiling at those
//      heroes' Levels, and net per active hero-day was +1.4k against a 193k ceiling (tempering took 1.52M of the week's 1.99M out).
//   A3 A RECURRING SINK AT ZERO for the last 2 complete days and so far today, when its RPC is on the server. A feature at zero
//      for two days is a P1 (CLAUDE.md §3.4). Only sinks a hero can pay again tomorrow are watched (watch: true). A bought-out
//      ladder (rooms, hero slots, setup slots, chests, plots, titles) at zero is not a broken drain.
//   A4 ANYTHING THE WATCH DOESN'T KNOW. A ledger kind in the journal or in its CHECK that KNOWN_KINDS lacks, a gold-moving key
//      GOLD_KEYS lacks, or a known key moving gold the wrong way (a sink paying in, a source taking out).
//   A5 THE PURSES AND THE JOURNAL DISAGREE. The gold every account holds must equal the journal's sum (plus the monthly rollup
//      the retention prune leaves). Measured 2026-11-07: 2,175,954 g both ways. Any gap is gold that moved with no journal row.
//
// THE SELFTEST lifts the ECONOMY RULES block out of this file, runs planted in-memory ledgers through it (each alarm silent on
// a healthy fixture and firing on its planted one), then plants each mutant and requires an assertion to go red.
// mutant-anchors: none — the proof lifts the ECONOMY RULES block out of this file and plants into fixtures (a guard is its own anchor)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formulaStats, contractXpPerH, BALANCE_SHEET, MONSTER_ROLES, GROUND_XP_FIT } from '../src/data/balance-sheet.js';
import { SINK_RULES } from '../src/data/gold-sinks.js';
import { charLevelFromXp } from '../src/core/xp.js';

const REF = 'nezapsylztqbbwuwembx';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELFTEST = process.argv.includes('--selftest') || process.argv.includes('--mutate');

/* Every kind player_ledger_kind_check allowed on 2026-11-07 (33). A kind the CHECK gains later alarms (A4) before a row lands. */
const KNOWN_KINDS = Object.freeze(['accrue', 'admin', 'bank', 'bounty', 'clan', 'collection', 'combat', 'craft', 'daily', 'discord_gift',
  'dungeon', 'enchant', 'equip', 'farm', 'gather', 'gem_unlock', 'hearthfind', 'hero_slot', 'hunt', 'iap', 'moderation_rename', 'presence',
  'quest', 'raid', 'rally', 'recipe', 'renown', 'shop', 'trade', 'trait', 'vigour', 'wallet', 'worker']);

/* Verbs whose second intent segment names a catalogue family (unlock_buy:room.cellar.2:2). */
const FAMILY_VERBS = Object.freeze(['unlock_buy', 'shop_buy', 'town_show']);
/* town_show's offers, read from gold-sinks.js: each powder color files under its sink row. */
const FAMILY_OF = Object.freeze(Object.fromEntries(Object.entries(SINK_RULES)
  .flatMap(([sink, r]) => (r.offers || []).map((o) => ['town_show.' + o, sink]))));

/* Every gold-moving key the journal held from 2026-10-19 to 2026-11-07, plus the live sink verbs that had not moved gold yet.
   role: source (gold the server creates), sink (gold it destroys), transfer (between players). watch: a recurring sink (A3).
   rpc: the server function that writes it, so a sink not yet applied is not judged (null: written by the engine itself). */
const src = (label) => Object.freeze({ label, role: 'source' });
const sink = (label, watch = false, rpc = null) => Object.freeze({ label, role: 'sink', watch, rpc });
const GOLD_KEYS = Object.freeze({
  'combat:accrue': src('monster coin'),
  'shop:vendor_sell_many': src('loot sold to vendors'),
  'shop:loot_sell': src('loot sold (old shop path)'),
  'hunt:loot_sell': src('loot sold on the hunt (old path)'),
  'hunt:tally_pay': src('kill tasks paid'),
  'admin:create_character': src('new hero starting gold'),
  'admin:gm_grant': src('game master grant'),
  'trade:market_buy': Object.freeze({ label: 'market purchases', role: 'transfer' }),
  'trade:market_sold': Object.freeze({ label: 'market sales', role: 'transfer' }),
  'hunt:supply_buy': sink('store supplies on the hunt', true),
  'shop:shop_buy.supply': sink('shop supplies and seeds', true),
  'shop:farm_replant_seed': sink('replant seeds', true),
  'shop:stamina_refill': sink('stamina refills', true, 'hr_stamina_refill'),
  'shop:blessing_buy': sink('blessings', true, 'hr_blessing_buy'),
  'shop:unlock_buy.temper': sink('tempering', true, 'hr_unlock_buy'),
  'shop:town_show.powder': sink('hearth powders', true, 'hr_town_show'),
  'shop:town_show.round': sink('tavern rounds', true, 'hr_town_show'),
  'shop:crier': sink('town crier lines', true, 'hr_crier_send'),
  'shop:town_works': sink('town works gifts', true, 'hr_town_works_give'),
  'shop:hero_colors_set': sink('hero dye changes', true, 'hr_hero_colors_set'),
  'shop:boss_call': sink('boss calls', true, 'hr_boss_call'),
  'shop:hallmark': sink('jewelry hallmarks', true, 'hr_hallmark'),
  'shop:training_start': sink('combat training, the first hour', true, 'hr_training_start'),
  'shop:training_fee': sink('combat training, each hour after', true, 'hr_training_hour'),
  'shop:house_dummy': sink('house training dummy', false, 'hr_house_dummy_unlock'),
  'trade:market_list': sink('market listing fees', true, 'hr_market_list'),
  'craft:accrue': sink('bench tax', true),
  'shop:unlock_buy.room': sink('house rooms'),
  'shop:unlock_buy.property': sink('house properties'),
  'shop:storage_chest': sink('storage chests'),
  'shop:setup_slot_buy': sink('action bar setups'),
  'shop:title_buy': sink('titles'),
  'shop:hero_rename': sink('hero renames'),
  'farm:farm_upgrade_plot': sink('farm plot upgrades'),
  'hero_slot:hero_slot_buy': sink('hero slots'),
});
/* Each gold-sinks.js row's journal key (the selftest fails when a row has none, so a new sink cannot ship unwatched). */
const SINK_RULE_KEYS = Object.freeze({ powder: 'shop:town_show.powder', round: 'shop:town_show.round', crier: 'shop:crier',
  setup_slot: 'shop:setup_slot_buy', hero_colors: 'shop:hero_colors_set', house_dummy: 'shop:house_dummy' });

/* WHAT A COIN BRINGS WITH IT, as the most the sheet's loot and tasks add to monster coin an hour:
     commons 1.15  src/data/supply-basics.js: a measured hour, 691 g of coins against 793 g of common drops
     gear    0.50  src/data/loot-bands.js VENDOR_GEAR_RATES: gear sells so a ground's gear stays under half its coin
     rares   0.25  the loot redesign (Tyler 2026-10-23): rare items' total value at most +25% over coin
     tasks   0.35  src/data/tally-tasks.js: a kill task is about an hour and pays about 35% of that hour's coin */
const INCOME_PARTS = Object.freeze({ coin: 1, commons: 1.15, gear: 0.5, rares: 0.25, tasks: 0.35 });
const INCOME_PER_COIN = Object.values(INCOME_PARTS).reduce((a, b) => a + b, 0);

const RULE = Object.freeze({ growthPct: 100, minHeroes: 10, minShare: 0.10, netOverSheet: 1, zeroDays: 2 });

// ── ECONOMY RULES BEGIN ──────────────────────────────────────────────────────
// Pure and self-contained: --selftest lifts this exact text, plants one defect at a time and requires a fixture to go red.
// K = { kinds, gold, familyVerbs, familyOf }, the vocabulary, passed in.

/* The key a journal group files under: kind:verb, plus .family for a verb that names a catalogue family. */
function keyOf(g, K) {
  if (!K.familyVerbs.includes(g.verb)) return g.kind + ':' + g.verb;
  const fam = K.familyOf[g.verb + '.' + g.fam] || g.fam;
  return g.kind + ':' + g.verb + (fam ? '.' + fam : '');
}

/* THE SQL'S GROUP BY, restated for an in-memory ledger (the selftest's fixtures): raw rows {at, acct, slot, kind, intent, gold,
   meta} into the flows {day, kind, verb, fam, xfer, n, g_in, g_out} and the heroes {day, acct, slot, g_in, g_out, hunted_ms,
   coin, level} the live queries return. */
function aggregate(rows, K, levels) {
  const flows = new Map(), heroes = new Map();
  for (const r of rows) {
    const day = new Date(r.at).toISOString().slice(0, 10);
    const parts = String(r.intent || '').split(':');
    const verb = parts[0];
    const fam = K.familyVerbs.includes(verb) ? String(parts[1] || '').split('.')[0] : '';
    const xfer = !!r.meta && String(r.meta.transfer) === 'true';
    const gold = Number(r.gold) || 0;
    const fk = [day, r.kind, verb, fam, xfer].join('|');
    const f = flows.get(fk) || flows.set(fk, { day, kind: r.kind, verb, fam, xfer, n: 0, g_in: 0, g_out: 0 }).get(fk);
    f.n += 1; if (gold > 0) f.g_in += gold; if (gold < 0) f.g_out -= gold;
    const hk = [day, r.acct, r.slot].join('|');
    const h = heroes.get(hk) || heroes.set(hk, { day, acct: r.acct, slot: r.slot, g_in: 0, g_out: 0, hunted_ms: 0, coin: 0, level: levels[r.acct + ':' + r.slot] || 1 }).get(hk);
    if (gold > 0) h.g_in += gold; if (gold < 0) h.g_out -= gold;
    const ms = r.meta && Number(r.meta.ms);
    if (r.kind === 'combat' && Number.isFinite(ms) && ms > 0) h.hunted_ms += ms;
    if (r.kind === 'combat' && gold > 0) h.coin += gold;
  }
  return { flows: [...flows.values()], heroes: [...heroes.values()] };
}

/* Per UTC day (`days`, oldest first): gold in by source, out by sink, the market's transfers, the net and the active heroes. */
function dailyBook(flows, heroes, days, K) {
  const book = new Map(days.map((d) => [d, { day: d, in: 0, out: 0, xferIn: 0, xferOut: 0, net: 0, heroes: 0, src: {}, sink: {} }]));
  for (const g of flows) {
    const b = book.get(g.day);
    const gin = Number(g.g_in) || 0, gout = Number(g.g_out) || 0;
    if (!b || (!gin && !gout)) continue;
    if (g.xfer === true || String(g.xfer) === 'true') { b.xferIn += gin; b.xferOut += gout; continue; }
    const key = keyOf(g, K);
    b.in += gin; b.out += gout;
    if (gin) b.src[key] = (b.src[key] || 0) + gin;
    if (gout) b.sink[key] = (b.sink[key] || 0) + gout;
  }
  for (const h of heroes) { const b = book.get(h.day); if (b) b.heroes += 1; }
  for (const b of book.values()) b.net = b.in + b.xferIn - b.out - b.xferOut;
  return [...book.values()];
}

/* A1: a source paying more than growthPct% more per active hero on `last` than on `prev` (both complete days). */
function growthAlarms(prev, last, R) {
  if (!prev || !last) return { judged: false, why: 'under two complete days', alarms: [] };
  if (prev.heroes < R.minHeroes || last.heroes < R.minHeroes) {
    return { judged: false, why: `${prev.heroes} and ${last.heroes} active heroes on ${prev.day} and ${last.day}, the rule needs ${R.minHeroes} on both`, alarms: [] };
  }
  const alarms = [];
  for (const [key, g] of Object.entries(last.src)) {
    if (g < R.minShare * last.in) continue;
    const a = (prev.src[key] || 0) / prev.heroes, b = g / last.heroes;
    if (b > a * (1 + R.growthPct / 100)) alarms.push({ key, before: a, after: b, pct: a > 0 ? Math.round((b / a - 1) * 100) : null });
  }
  return { judged: true, why: `${prev.day} to ${last.day}`, alarms };
}

/* The sheet's monster coin an hour at Level L (S: the formula, the pace and the ceilings, passed in). A hero past the content
   ceiling hunts the top ground, so it reads at the ceiling. */
function sheetCoinPerH(L0, S) {
  const L = Math.min(L0, S.levelCap);
  let best = 0;
  for (const role of S.roles) for (const fit of S.fits) for (const floor of S.floors) for (const ground of S.grounds) {
    const m = S.formulaStats({ level: L, role, tier: 3, floor, fit, ground });
    best = Math.max(best, (m.gp[0] + m.gp[1]) / 2 / m.xp);
  }
  const xph = Math.max(Number(S.paceRate[L]) || 0, S.contractXpPerH(L) * S.xpVsContractMax) * S.partyMax;
  return xph * best;
}

/* A2: net per active hero-day over the complete days against the sheet's income for the hours those heroes hunted. */
function netAlarm(book, heroes, incomePerH, R) {
  if (!heroes.length) return { judged: false, why: 'no active hero on a complete day', alarm: false };
  const days = new Set(book.map((b) => b.day));
  const hs = heroes.filter((h) => days.has(h.day));
  if (!hs.length) return { judged: false, why: 'no active hero on a complete day', alarm: false };
  const net = book.reduce((s, b) => s + b.net, 0);
  const expected = hs.reduce((s, h) => s + (Number(h.hunted_ms) / 3600000) * incomePerH(Number(h.level) || 1), 0);
  const perHero = net / hs.length, sheetPerHero = expected / hs.length;
  return { judged: true, perHero, sheetPerHero, heroDays: hs.length, alarm: net > 0 && perHero > sheetPerHero * R.netOverSheet };
}

/* A3: a watched sink with no gold out on each of the last zeroDays complete days and none so far today. */
function sinkZeroAlarms(book, today, K, live, R) {
  const lastN = book.slice(-R.zeroDays);
  if (lastN.length < R.zeroDays) return [];
  const seen = new Set(book.flatMap((b) => Object.keys(b.sink)));
  return Object.entries(K.gold)
    .filter(([key, k]) => k.role === 'sink' && k.watch && live(k.rpc))
    .filter(([key]) => lastN.every((b) => !(b.sink[key] > 0)) && !(today && today.sink[key] > 0))
    .map(([key]) => ({ key, usedThisWeek: seen.has(key) }));
}

/* The kinds a CHECK constraint's text allows. */
function kindsOfCheck(def) { return [...String(def || '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]); }

/* A4: a kind or a gold key the vocabulary doesn't hold, or a known key moving gold the wrong way. */
function unknownAlarms(flows, allowed, K) {
  const out = [], seen = new Set();
  const add = (what, key) => { if (!seen.has(what + key)) { seen.add(what + key); out.push({ what, key }); } };
  for (const k of allowed) if (!K.kinds.includes(k)) add('a kind the journal now allows', k);
  for (const g of flows) {
    if (!K.kinds.includes(g.kind)) add('a kind in the journal', g.kind);
    const gin = Number(g.g_in) || 0, gout = Number(g.g_out) || 0;
    if (!gin && !gout) continue;
    const key = keyOf(g, K), k = K.gold[key];
    if (!k) { add('a gold key', key); continue; }
    if (k.role === 'sink' && gin > 0) add('a sink paying gold in', key);
    if (k.role === 'source' && gout > 0) add('a source taking gold out', key);
  }
  return out;
}

/* A5: every purse against the journal (plus the rollup the prune leaves). */
function reconcileVerdict(r) {
  const held = Number(r && r.held_all), journal = Number(r && r.journal) + Number(r && r.rolled);
  if (!r || r.held_all == null || r.journal == null || !Number.isFinite(held) || !Number.isFinite(journal)) return { verdict: 'UNREAD', gap: null };
  return held === journal ? { verdict: 'OK', gap: 0 } : { verdict: 'ALARM', gap: held - journal };
}

/* Gold held at the end of each day: today's purses, walked back by each later day's net. */
function heldByDay(heldNow, book) {
  const out = {};
  let h = Number(heldNow) || 0;
  for (let i = book.length - 1; i >= 0; i--) { out[book[i].day] = h; h -= book[i].net; }
  return out;
}
// ── ECONOMY RULES END ────────────────────────────────────────────────────────

const VOCAB = Object.freeze({ kinds: KNOWN_KINDS, gold: GOLD_KEYS, familyVerbs: FAMILY_VERBS, familyOf: FAMILY_OF });

/* THE SHEET'S INPUTS, from the data (src/data/balance-sheet.js and the measured pace). */
function sheetInputs() {
  const pace = JSON.parse(readFileSync(join(ROOT, 'tools', 'balance-sim', 'level-pace.json'), 'utf8'));
  return {
    formulaStats, contractXpPerH,
    roles: Object.keys(MONSTER_ROLES).filter((r) => r !== 'boss'),
    fits: ['solo', 'both', 'party'],
    floors: [1, 8, 16],
    grounds: [undefined, ...Object.keys(GROUND_XP_FIT)],
    paceRate: pace.rate || {},
    levelCap: Number(pace.ceiling) || Infinity,
    xpVsContractMax: BALANCE_SHEET.normal.xpVsContract.max,
    partyMax: BALANCE_SHEET.party.fourVsSolo[1],
  };
}

// ── THE LIVE READ ────────────────────────────────────────────────────────────
// NO BACKTICKS in the SQL below (they end the JS template literal), and no write keyword even in a comment: readOnly() reads words.
const FROM = "((((now() at time zone 'UTC')::date) - 7)::timestamp at time zone 'UTC')";
const NOT_GM = 'not exists (select 1 from public.hr_gm_accounts gm where gm.user_id = x.user_id)';
const FLOWS = `
select (x.at at time zone 'UTC')::date::text as day, x.kind, split_part(coalesce(x.intent, ''), ':', 1) as verb,
       case when split_part(coalesce(x.intent, ''), ':', 1) in (${FAMILY_VERBS.map((v) => `'${v}'`).join(', ')})
            then split_part(split_part(x.intent, ':', 2), '.', 1) else '' end as fam,
       coalesce(x.meta ->> 'transfer', '') = 'true' as xfer,
       count(*) as n,
       coalesce(sum(x.gold) filter (where x.gold > 0), 0) as g_in,
       coalesce(sum(-x.gold) filter (where x.gold < 0), 0) as g_out
  from public.player_ledger x
 where x.at >= ${FROM} and ${NOT_GM}
 group by 1, 2, 3, 4, 5`;
const HEROES = `
with h as (
  select (x.at at time zone 'UTC')::date as d, x.user_id, x.slot,
         coalesce(sum(x.gold) filter (where x.gold > 0), 0) as g_in,
         coalesce(sum(-x.gold) filter (where x.gold < 0), 0) as g_out,
         coalesce(sum(case when x.kind = 'combat' and (x.meta ->> 'ms') ~ '^[0-9]{1,9}$' then (x.meta ->> 'ms')::bigint end), 0) as hunted_ms,
         coalesce(sum(x.gold) filter (where x.kind = 'combat' and x.gold > 0), 0) as coin
    from public.player_ledger x
   where x.at >= ${FROM} and ${NOT_GM}
   group by 1, 2, 3)
select h.d::text as day, left(h.user_id::text, 8) as acct, h.slot, h.g_in, h.g_out, h.hunted_ms, h.coin, coalesce(ps.level_xp, 0) as level_xp
  from h left join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot`;
const HELD = `
select (now() at time zone 'UTC')::date::text as today,
       (select coalesce(sum(w.gold), 0) from public.account_wallet w
         where not exists (select 1 from public.hr_gm_accounts gm where gm.user_id = w.user_id)) as held,
       (select count(*) from public.account_wallet w
         where not exists (select 1 from public.hr_gm_accounts gm where gm.user_id = w.user_id)) as accounts,
       (select coalesce(sum(w.gold), 0) from public.account_wallet w) as held_all,
       (select coalesce(sum(x.gold), 0) from public.player_ledger x
         where exists (select 1 from public.account_wallet w where w.user_id = x.user_id)) as journal,
       (select coalesce(sum(r.gold_in - r.gold_out), 0) from public.player_ledger_rollup r
         where exists (select 1 from public.account_wallet w where w.user_id = r.user_id)) as rolled,
       pg_total_relation_size('public.player_ledger') as journal_bytes,
       (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.player_ledger'::regclass and c.conname = 'player_ledger_kind_check') as kind_check`;
const RPCS = [...new Set(Object.values(GOLD_KEYS).map((k) => k.rpc).filter(Boolean))];
const LIVE_RPCS = `
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in (${RPCS.map((r) => `'${r}'`).join(', ')})`;

const readOnly = (sql) => /^\s*(select|with)\b/i.test(sql) && !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do|copy|vacuum)\b/i.test(sql);
for (const sql of [FLOWS, HEROES, HELD, LIVE_RPCS]) if (!readOnly(sql)) throw new Error('economy-watch: a query is not SELECT-only');
if (!RPCS.every((r) => /^[a-z_]+$/.test(r))) throw new Error('economy-watch: an rpc name is not a plain identifier');

let token = null;
async function q(sql) {
  if (!readOnly(sql)) throw new Error('read-only queries only');
  if (token === null) token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error('the database answered ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
}

// ── THE SCREEN ───────────────────────────────────────────────────────────────
const fmt = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  if (!a) return '-';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return Math.round(v / 1e3) + 'k';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
};
const signed = (n) => (Number(n) > 0 ? '+' : '') + fmt(n);
const LW = 30, CW = 8;
const labelOf = (key) => (GOLD_KEYS[key] ? GOLD_KEYS[key].label : '?? ' + key);
const line = (label, cells) => console.log('  ' + label.slice(0, LW).padEnd(LW) + cells.map((c) => String(c).padStart(CW)).join(''));

async function live() {
  const t0 = Date.now();
  const [flows, heroRows, [held], rpcRows] = await Promise.all([q(FLOWS), q(HEROES), q(HELD), q(LIVE_RPCS)]);
  const readS = (Date.now() - t0) / 1000;
  const today = held.today;
  const days = Array.from({ length: 8 }, (_, i) => new Date(Date.parse(today + 'T00:00:00Z') - (7 - i) * 86400000).toISOString().slice(0, 10));
  const complete = days.slice(0, 7);
  const heroes = heroRows.map((h) => ({ ...h, slot: Number(h.slot), level: charLevelFromXp(Number(h.level_xp) || 0) }));
  const book = dailyBook(flows, heroes, days, VOCAB);
  const done = book.slice(0, 7), now = book[7];
  const S = sheetInputs();
  const coinMemo = new Map();
  const coinPerH = (L) => coinMemo.get(L) ?? coinMemo.set(L, sheetCoinPerH(L, S)).get(L);
  const incomePerH = (L) => coinPerH(L) * INCOME_PER_COIN;
  const liveRpcs = new Set(rpcRows.map((r) => r.proname));
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  console.log(`\nEconomy watch at ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, from the journal (player_ledger), read-only.`);
  console.log(`  ${held.accounts} accounts, game master accounts left out. Each day is a UTC day, * is today so far, "7 days" adds the complete ones.`);
  const head = days.map((d, i) => d.slice(5) + (i === 7 ? '*' : ''));
  const keysOf = (side) => [...new Set(book.flatMap((b) => Object.keys(b[side])))].sort((a, b) => sum(done, (x) => x[side][b]) - sum(done, (x) => x[side][a]) || a.localeCompare(b));
  const rows = (side) => {
    for (const k of keysOf(side)) line(labelOf(k), [...book.map((b) => fmt(b[side][k])), fmt(sum(done, (x) => x[side][k]))]);
  };
  console.log('\n  ' + 'GOLD IN by source'.padEnd(LW) + [...head, '7 days'].map((h) => h.padStart(CW)).join(''));
  rows('src');
  line('total in', [...book.map((b) => fmt(b.in)), fmt(sum(done, (b) => b.in))]);
  console.log('  GOLD OUT by sink');
  rows('sink');
  line('total out', [...book.map((b) => fmt(b.out)), fmt(sum(done, (b) => b.out))]);
  if (book.some((b) => b.xferIn || b.xferOut)) {
    line('market, bought by players', [...book.map((b) => fmt(b.xferOut)), fmt(sum(done, (b) => b.xferOut))]);
    line('market, paid to sellers', [...book.map((b) => fmt(b.xferIn)), fmt(sum(done, (b) => b.xferIn))]);
  }
  console.log('');
  line('net (in minus out)', [...book.map((b) => signed(b.net)), signed(sum(done, (b) => b.net))]);
  line('active heroes', [...book.map((b) => b.heroes || '-'), '']);
  line('net per active hero', [...book.map((b) => (b.heroes ? signed(b.net / b.heroes) : '-')), '']);
  const sheetDay = (d) => sum(heroes.filter((h) => h.day === d), (h) => (h.hunted_ms / 3600000) * incomePerH(h.level));
  line('sheet ceiling per active hero', [...book.map((b) => (b.heroes ? fmt(sheetDay(b.day) / b.heroes) : '-')), '']);
  const hb = heldByDay(held.held, book);
  line("gold held at the day's end", [...book.map((b) => fmt(hb[b.day])), '']);
  line('gold held per active hero', [...book.map((b) => (b.heroes ? fmt(hb[b.day] / b.heroes) : '-')), '']);
  const hunted = (d) => sum(heroes.filter((h) => h.day === d), (h) => h.hunted_ms) / 3600000;
  line('hours hunted', [...book.map((b) => (hunted(b.day) ? hunted(b.day).toFixed(1) : '-')), sum(complete, hunted).toFixed(1)]);
  line('monster coin per hunted hour', [...book.map((b) => { const h = hunted(b.day); return h ? fmt(sum(heroes.filter((x) => x.day === b.day), (x) => x.coin) / h) : '-'; }), '']);
  line("the formula's coin an hour", [...book.map((b) => { const h = hunted(b.day); return h ? fmt(sum(heroes.filter((x) => x.day === b.day), (x) => (x.hunted_ms / 3600000) * coinPerH(x.level)) / h) : '-'; }), '']);

  /* THE TOP 5, by gold gained over every shown day: account prefix and hero slot only. */
  const by = new Map();
  for (const h of heroes) {
    const k = h.acct + ':' + h.slot;
    const t = by.get(k) || by.set(k, { k, level: h.level, gin: 0, gout: 0, ms: 0 }).get(k);
    t.gin += Number(h.g_in) || 0; t.gout += Number(h.g_out) || 0; t.ms += Number(h.hunted_ms) || 0;
  }
  console.log('\n  TOP 5 heroes by gold gained, every day shown (account prefix:hero slot)');
  for (const t of [...by.values()].sort((a, b) => b.gin - a.gin).slice(0, 5)) {
    console.log(`  ${t.k.padEnd(11)} Level ${String(t.level).padEnd(4)} gained ${fmt(t.gin).padStart(6)}   net ${signed(t.gin - t.gout).padStart(7)}   hunted ${(t.ms / 3600000).toFixed(1)} h`);
  }

  /* THE ALARMS. */
  const alarms = [];
  const say = (ok, text) => { console.log(`  ${ok ? 'OK  ' : 'ALARM'} ${text}`); if (!ok) alarms.push(text); };
  console.log('\n  ALARMS');
  const g = growthAlarms(done[5], done[6], RULE);
  if (!g.judged) say(true, `A1 source growth not judged: ${g.why}.`);
  else if (!g.alarms.length) say(true, `A1 no source grew past ${RULE.growthPct}% a hero, ${g.why}.`);
  for (const a of g.alarms) say(false, `A1 ${labelOf(a.key)} paid ${fmt(a.after)} a hero on ${done[6].day} against ${fmt(a.before)} the day before (${a.pct === null ? 'new' : '+' + a.pct + '%'}).`);
  const n = netAlarm(done, heroes, incomePerH, RULE);
  if (!n.judged) say(true, `A2 net per hero not judged: ${n.why}.`);
  else say(!n.alarm, `A2 net per active hero-day ${signed(n.perHero)} over ${n.heroDays} hero-days, the sheet's ceiling for the hours they hunted ${fmt(n.sheetPerHero)} (coin an hour x ${INCOME_PER_COIN.toFixed(2)}).`);
  const z = sinkZeroAlarms(done, now, VOCAB, (rpc) => !rpc || liveRpcs.has(rpc), RULE);
  if (!z.length) say(true, `A3 every watched sink took gold on ${done[5].day}, ${done[6].day} or today.`);
  else say(false, `A3 P1, at zero on ${done[5].day}, ${done[6].day} and today so far: ${z.map((x) => labelOf(x.key) + (x.usedThisWeek ? ' (stopped)' : ' (not used this week)')).join(', ')}.`);
  const u = unknownAlarms(flows, kindsOfCheck(held.kind_check), VOCAB);
  if (!held.kind_check) say(false, 'A4 the journal\'s kind CHECK is unreadable.');
  else if (!u.length) say(true, `A4 every kind and gold key in the journal is known (${KNOWN_KINDS.length} kinds, ${Object.keys(GOLD_KEYS).length} gold keys).`);
  for (const x of u) say(false, `A4 ${x.what} the watch doesn't know: ${x.key}.`);
  const r = reconcileVerdict(held);
  if (r.verdict === 'OK') say(true, `A5 the purses hold exactly what the journal says, ${Number(held.held_all).toLocaleString('en-US')} g.`);
  else if (r.verdict === 'UNREAD') say(false, 'A5 the purses or the journal could not be read.');
  else say(false, `A5 the purses hold ${r.gap > 0 ? 'more' : 'less'} than the journal says, by ${Math.abs(r.gap).toLocaleString('en-US')} g. Gold moved with no journal row.`);
  /* A5 sums the WHOLE journal. Measured 2026-11-07: 275k rows, 170 MB, under 0.1 s of database time. At 90 days' retention it
     holds about 1 GB per 10 accounts at today's play; past a few GB that sum belongs in a nightly server summary. */
  console.log(`\n  Read ${sum(flows, (f) => f.n).toLocaleString('en-US')} journal rows of the last 8 days in ${readS.toFixed(1)} s. The whole journal is ${Math.round(Number(held.journal_bytes) / 1048576)} MB.`);
  process.exitCode = alarms.length ? 1 : 0;
}

// ── --selftest ───────────────────────────────────────────────────────────────
async function selftest() {
  const SRC = readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const a = SRC.indexOf('// ── ECONOMY RULES BEGIN'), b = SRC.indexOf('// ── ECONOMY RULES END');
  if (a < 0 || b < 0) { console.error('economy-watch --selftest: the ECONOMY RULES markers are gone'); return 2; }
  const RULES = SRC.slice(a, b);
  const lift = (text) => new Function(`${text}\nreturn { keyOf, aggregate, dailyBook, growthAlarms, sheetCoinPerH, netAlarm, sinkZeroAlarms, kindsOfCheck, unknownAlarms, reconcileVerdict, heldByDay };`)();
  const R = RULE, K = VOCAB;

  /* THE PLANTED LEDGERS. Eight UTC days ending 2026-11-08 (today), eleven heroes, one account prefix each. */
  const DAYS = Array.from({ length: 8 }, (_, i) => `2026-11-0${i + 1}`);
  const at = (d, h = 12) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;
  const IDS = Array.from({ length: 11 }, (_, i) => 'acc' + String(i).padStart(5, '0'));
  const LV = Object.fromEntries(IDS.map((h) => [h + ':0', 25]));
  const row = (d, acct, kind, intent, gold, meta = {}) => ({ at: at(d), acct, slot: 0, kind, intent, gold, meta });
  /* A healthy day: every hero hunts an hour for 1,000 coin, buys 300 of supplies, sells 400 of loot. Every watched sink takes 10 g
     on it from one hero so A3 stays quiet. A family sink's intent names its family (a powder names its first gold-sinks offer). */
  const WATCHED = Object.entries(K.gold).filter(([, k]) => k.watch).map(([key]) => key);
  const intentOf = (key) => {
    const [verb, fam] = key.slice(key.indexOf(':') + 1).split('.');
    if (!fam) return verb + ':1';
    const offer = Object.entries(K.familyOf).find(([o, s]) => s === fam && o.startsWith(verb + '.'));
    return verb + ':' + (offer ? offer[0].slice(verb.length + 1) : fam + '.x') + ':1';
  };
  const healthy = (d, heroes = IDS) => [
    ...heroes.flatMap((h) => [row(d, h, 'combat', 'accrue', 1000, { ms: 3600000 }), row(d, h, 'hunt', 'supply_buy', -300),
      row(d, h, 'shop', 'vendor_sell_many:3:abc', 400), row(d, h, 'gather', 'accrue', null)]),
    ...WATCHED.map((key) => row(d, heroes[0], key.slice(0, key.indexOf(':')), intentOf(key), -10)),
  ];
  const week = (patch = {}) => DAYS.flatMap((d) => (patch[d] ? patch[d] : healthy(d)));
  const run = (L, rows, opts = {}) => {
    const { flows, heroes } = L.aggregate(rows, K, opts.levels || LV);
    const book = L.dailyBook(flows, heroes, DAYS, K);
    const done = book.slice(0, 7), today = book[7];
    return { flows, heroes, book, done, today };
  };
  const incomePerH = () => 3000;   // the fixture's sheet: an hour hunted may bring up to 3,000 g

  const checks = (L) => {
    const out = [];
    const t = (id, got, want) => out.push({ id, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
    // KEYS AND THE BOOK
    t('K1 a family verb splits by its family', L.keyOf({ kind: 'shop', verb: 'unlock_buy', fam: 'temper' }, K), 'shop:unlock_buy.temper');
    t('K2 a powder offer files under its gold-sinks row', L.keyOf({ kind: 'shop', verb: 'town_show', fam: 'borax' }, K), 'shop:town_show.powder');
    t('K3 a plain verb is kind:verb', L.keyOf({ kind: 'combat', verb: 'accrue', fam: '' }, K), 'combat:accrue');
    const w = run(L, week());
    const d7 = w.done[6];
    t('B1 a healthy day: gold in is coin plus vendor sales', d7.in, 11 * 1400);
    t('B2 monster coin files as a source', d7.src['combat:accrue'], 11000);
    const gw = run(L, [...week(), row(DAYS[6], 'gatherer', 'gather', 'accrue', null)]);
    t('B3 a hero with no gold row (a gatherer) is an active hero too', [d7.heroes, gw.done[6].heroes], [11, 12]);
    t('B4 net = in minus out', d7.net, d7.in - d7.out);
    const mk = run(L, [...week(), row(DAYS[6], IDS[1], 'trade', 'market_buy:L1:1', -500, { transfer: true }),
      row(DAYS[6], IDS[2], 'trade', 'market_sold:L1:1', 450, { transfer: true })]);
    t('B5 a market sale is a transfer, not a source', mk.done[6].src['trade:market_sold'], undefined);
    t('B6 only the market cut leaves the net', mk.done[6].net - w.done[6].net, -50);
    const hb = L.heldByDay(10000, [{ day: 'a', net: 100 }, { day: 'b', net: -300 }, { day: 'c', net: 50 }]);
    t('B7 gold held walks back from today by each later net', hb, { c: 10000, b: 9950, a: 10250 });
    // A1 A SOURCE RUNNING AWAY
    const quiet = L.growthAlarms(w.done[5], w.done[6], R);
    t('G1 a healthy week: judged, nothing grows', [quiet.judged, quiet.alarms.length], [true, 0]);
    const spike = run(L, week({ [DAYS[6]]: [...healthy(DAYS[6]), ...IDS.map((h) => row(DAYS[6], h, 'shop', 'vendor_sell_many:9:x', 900))] }));
    const g2 = L.growthAlarms(spike.done[5], spike.done[6], R);
    t('G2 vendor sales 400 -> 1,300 a hero (+225%) fires', g2.alarms.map((x) => x.key), ['shop:vendor_sell_many']);
    const just = run(L, week({ [DAYS[6]]: [...healthy(DAYS[6]), ...IDS.map((h) => row(DAYS[6], h, 'shop', 'vendor_sell_many:9:x', 380))] }));
    t('G3 vendor sales 400 -> 780 a hero (+95%) stays quiet', L.growthAlarms(just.done[5], just.done[6], R).alarms.length, 0);
    const exact = run(L, week({ [DAYS[6]]: [...healthy(DAYS[6]), ...IDS.map((h) => row(DAYS[6], h, 'shop', 'vendor_sell_many:9:x', 400))] }));
    t('G4 exactly double (+100%) stays quiet, the rule is past 100%', L.growthAlarms(exact.done[5], exact.done[6], R).alarms.length, 0);
    const crowd = run(L, week({ [DAYS[6]]: ['acc', 'new', 'one'].flatMap((p) => healthy(DAYS[6], IDS.map((h) => h.replace('acc', p)))) }), { levels: {} });
    t('G5 three times the heroes and three times the coin is not growth (per hero)', L.growthAlarms(crowd.done[5], crowd.done[6], R).alarms.length, 0);
    const few = IDS.slice(0, 9);
    const small = run(L, week({ [DAYS[5]]: healthy(DAYS[5], few), [DAYS[6]]: [...healthy(DAYS[6], few), ...few.map((h) => row(DAYS[6], h, 'shop', 'vendor_sell_many:9:x', 5000))] }));
    const g6 = L.growthAlarms(small.done[5], small.done[6], R);
    t('G6 nine heroes: not judged, however big the jump', [g6.judged, g6.alarms.length], [false, 0]);
    const newSrc = run(L, week({ [DAYS[6]]: [...healthy(DAYS[6]), ...IDS.map((h) => row(DAYS[6], h, 'hunt', 'tally_pay:t', 300))] }));
    t('G7 a new source at 13% of the day fires as new', L.growthAlarms(newSrc.done[5], newSrc.done[6], R).alarms.map((x) => [x.key, x.pct]), [['hunt:tally_pay', null]]);
    const tiny = run(L, week({ [DAYS[6]]: [...healthy(DAYS[6]), ...IDS.map((h) => row(DAYS[6], h, 'hunt', 'tally_pay:t', 100))] }));
    t('G8 a new source under 10% of the day stays quiet', L.growthAlarms(tiny.done[5], tiny.done[6], R).alarms.length, 0);
    // A2 NET PAST THE SHEET
    const n1 = L.netAlarm(w.done, w.heroes, incomePerH, R);
    t('N1 a healthy week: about 1,090 a hero-day against the sheet\'s 3,000, quiet', [n1.judged, n1.alarm, Math.round(n1.perHero), n1.heroDays],
      [true, false, Math.round((11 * 1100 - 10 * WATCHED.length) / 11), 77]);
    const mint = run(L, week({ [DAYS[3]]: [...healthy(DAYS[3]), row(DAYS[3], IDS[4], 'shop', 'vendor_sell_many:1:z', 1_000_000)] }));
    const n2 = L.netAlarm(mint.done, mint.heroes, incomePerH, R);
    t('N2 one million from one sale: past the sheet, fires', n2.alarm, true);
    const lazy = run(L, week(Object.fromEntries(DAYS.slice(0, 7).map((d) => [d, healthy(d).map((r) => (r.kind === 'combat' ? { ...r, meta: { ms: 1200000 } } : r))]))));
    const n3 = L.netAlarm(lazy.done, lazy.heroes, incomePerH, R);
    t('N3 the same gold from a third of the hours: past the sheet for the hours hunted, fires', n3.alarm, true);
    t('N4 the sheet counts the hours hunted: twenty minutes a day is 1,000 of sheet a hero', Math.round(n3.sheetPerHero), 1000);
    const leveled = L.netAlarm(lazy.done, lazy.heroes, (Lv) => (Lv >= 25 ? 30000 : 0), R);
    t('N5 the sheet is read at each hero\'s Level', leveled.alarm, false);
    const spend = run(L, week({ [DAYS[3]]: [...healthy(DAYS[3]), row(DAYS[3], IDS[4], 'shop', 'vendor_sell_many:1:z', 1_000_000), row(DAYS[3], IDS[4], 'shop', 'unlock_buy:room.cellar.2:2', -1_000_000)] }));
    t('N6 the same sale spent on a room the same week: net is what counts, quiet', L.netAlarm(spend.done, spend.heroes, incomePerH, R).alarm, false);
    const today = run(L, week({ [DAYS[7]]: [...healthy(DAYS[7]), row(DAYS[7], IDS[4], 'shop', 'vendor_sell_many:1:z', 1_000_000)] }));
    t('N7 today so far is not judged (complete days only)', L.netAlarm(today.done, today.heroes, incomePerH, R).alarm, false);
    // A3 A SINK AT ZERO
    const liveAll = () => true;
    t('Z1 a healthy week: every watched sink took gold', L.sinkZeroAlarms(w.done, w.today, K, liveAll, R), []);
    const noTemper = (d) => healthy(d).filter((r) => !String(r.intent).startsWith('unlock_buy:temper'));
    const z2 = run(L, week({ [DAYS[5]]: noTemper(DAYS[5]), [DAYS[6]]: noTemper(DAYS[6]), [DAYS[7]]: noTemper(DAYS[7]) }));
    t('Z2 tempering at zero for two days and today: P1, stopped', L.sinkZeroAlarms(z2.done, z2.today, K, liveAll, R), [{ key: 'shop:unlock_buy.temper', usedThisWeek: true }]);
    const z3 = run(L, week({ [DAYS[6]]: noTemper(DAYS[6]), [DAYS[7]]: noTemper(DAYS[7]) }));
    t('Z3 at zero for one day only: quiet', L.sinkZeroAlarms(z3.done, z3.today, K, liveAll, R), []);
    const z4 = run(L, week({ [DAYS[5]]: noTemper(DAYS[5]), [DAYS[6]]: noTemper(DAYS[6]) }));
    t('Z4 zero two days but used today: quiet, the sink is alive', L.sinkZeroAlarms(z4.done, z4.today, K, liveAll, R), []);
    t('Z5 its RPC not on the server: not judged', L.sinkZeroAlarms(z2.done, z2.today, K, (rpc) => rpc !== 'hr_unlock_buy', R), []);
    const noRoom = run(L, week());
    t('Z6 a bought-out ladder (house rooms) at zero is not watched', L.sinkZeroAlarms(noRoom.done, noRoom.today, K, liveAll, R).some((x) => x.key === 'shop:unlock_buy.room'), false);
    const noSupply = (d) => healthy(d).filter((r) => !String(r.intent).startsWith('supply_buy'));
    const z7 = run(L, week(Object.fromEntries(DAYS.map((d) => [d, noSupply(d)]))));
    t('Z7 a sink unused all week reads as never used', L.sinkZeroAlarms(z7.done, z7.today, K, liveAll, R).find((x) => x.key === 'hunt:supply_buy'), { key: 'hunt:supply_buy', usedThisWeek: false });
    // A4 THE UNKNOWN
    const allowed = L.kindsOfCheck("CHECK ((kind = ANY (ARRAY['combat'::text, 'shop'::text, 'hero_slot'::text])))");
    t('U1 the CHECK text parses to its kinds', allowed, ['combat', 'shop', 'hero_slot']);
    t('U2 a healthy week: nothing unknown', L.unknownAlarms(w.flows, allowed, K), []);
    t('U3 a kind the CHECK allows but the watch lacks', L.unknownAlarms([], ['combat', 'auction'], K), [{ what: 'a kind the journal now allows', key: 'auction' }]);
    const odd = run(L, [...week(), row(DAYS[6], IDS[0], 'auction', 'auction_win:1', 50)]);
    t('U4 a kind in the journal the watch lacks', L.unknownAlarms(odd.flows, [], K).map((x) => x.what), ['a kind in the journal', 'a gold key']);
    const scaled = run(L, [...week(), row(DAYS[6], IDS[0], 'shop', 'unlock_buy:scale.glade.2:1', -5000)]);
    t('U5 a new family under a known verb (scaled hunts) is a gold key the watch lacks', L.unknownAlarms(scaled.flows, [], K), [{ what: 'a gold key', key: 'shop:unlock_buy.scale' }]);
    const back = run(L, [...week(), row(DAYS[6], IDS[0], 'shop', 'stamina_refill:5750', 5750)]);
    t('U6 a sink paying gold in', L.unknownAlarms(back.flows, [], K), [{ what: 'a sink paying gold in', key: 'shop:stamina_refill' }]);
    const takes = run(L, [...week(), row(DAYS[6], IDS[0], 'combat', 'accrue', -40, { ms: 1 })]);
    t('U7 a source taking gold out', L.unknownAlarms(takes.flows, [], K), [{ what: 'a source taking gold out', key: 'combat:accrue' }]);
    const quietKind = run(L, [...week(), row(DAYS[6], IDS[0], 'renown', 'renown_ratchet', null)]);
    t('U8 a known kind with no gold stays quiet', L.unknownAlarms(quietKind.flows, [], K), []);
    // A5 THE PURSES AGAINST THE JOURNAL
    t('R1 equal: OK', L.reconcileVerdict({ held_all: '2175954', journal: '2175954', rolled: '0' }).verdict, 'OK');
    t('R2 the rollup counts: OK', L.reconcileVerdict({ held_all: '1500', journal: '1000', rolled: '500' }).verdict, 'OK');
    t('R3 a purse ahead of its journal by 1 g: ALARM', L.reconcileVerdict({ held_all: '2175955', journal: '2175954', rolled: '0' }), { verdict: 'ALARM', gap: 1 });
    t('R4 a purse behind its journal: ALARM', L.reconcileVerdict({ held_all: '100', journal: '300', rolled: '0' }).gap, -200);
    t('R5 nothing read: UNREAD, never OK', L.reconcileVerdict({}).verdict, 'UNREAD');
    // THE SHEET'S COIN AN HOUR (a stub formula, so the arithmetic is exact)
    const S = { roles: ['regular', 'elite'], fits: ['solo'], floors: [16], grounds: [undefined],
      formulaStats: ({ role }) => (role === 'regular' ? { gp: [5, 15], xp: 100 } : { gp: [1, 3], xp: 100 }),
      contractXpPerH: (Lv) => Lv * 100, xpVsContractMax: 1.1, paceRate: { 10: 2000 }, partyMax: 1.25, levelCap: 30 };
    t('S1 the measured pace when it pays more: 2,000 x 1.25 x 0.10', L.sheetCoinPerH(10, S), 250);
    t('S2 the contract ceiling past the measured Levels: 2,000 x 1.1 x 1.25 x 0.10', Math.round(L.sheetCoinPerH(20, S) * 1000) / 1000, 275);
    t('S3 a hero past the content ceiling reads at it: Level 60 pays as Level 30', L.sheetCoinPerH(60, S), L.sheetCoinPerH(30, S));
    return out;
  };

  console.log('\neconomy-watch --selftest: every alarm on planted in-memory ledgers (no DB, no token)');
  let real;
  try { real = checks(lift(RULES)); } catch (e) { console.log(`  FAIL the unmutated lift threw: ${e.stack}`); return 1; }
  for (const c of real) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id}${c.ok ? '' : `, got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)}`}`);
  /* THE DATA CONTRACT (real files, no mutants): the watch knows every gold-sinks.js row, the sheet reads, the queries stay read-only. */
  const contract = [];
  const ct = (id, ok, why = '') => contract.push({ id, ok, why });
  for (const s of Object.keys(SINK_RULES)) ct(`D1 gold-sinks.js row "${s}" has a journal key the watch knows`, !!(SINK_RULE_KEYS[s] && GOLD_KEYS[SINK_RULE_KEYS[s]]), `add it to SINK_RULE_KEYS and GOLD_KEYS in ${'tools/economy-watch.local.mjs'}`);
  const L0 = lift(RULES), SI = sheetInputs();
  for (const lv of [1, 25, 50]) { const c = L0.sheetCoinPerH(lv, SI); ct(`D2 the real sheet's coin an hour at Level ${lv} is a positive number (${Math.round(c)})`, Number.isFinite(c) && c > 0); }
  ct('D3 every query is SELECT-only', [FLOWS, HEROES, HELD, LIVE_RPCS].every(readOnly));
  const finalSel = HEROES.slice(HEROES.lastIndexOf('\nselect'), HEROES.indexOf('\n  from h'));
  ct('D4 the per-hero query returns 8-character account prefixes, never a whole account id',
    (finalSel.match(/user_id/g) || []).length === 1 && finalSel.includes('left(h.user_id::text, 8) as acct') && !/user_id/.test(FLOWS.slice(0, FLOWS.indexOf('from public.player_ledger'))));
  for (const c of contract) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id}${c.ok ? '' : (c.why ? ', ' + c.why : '')}`);
  const realRed = real.filter((c) => !c.ok).length + contract.filter((c) => !c.ok).length;

  const MUTANTS = [
    ['familyIgnored', 'if (!K.familyVerbs.includes(g.verb)) return g.kind + \':\' + g.verb;', 'return g.kind + \':\' + g.verb;'],
    ['powderUnmapped', 'const fam = K.familyOf[g.verb + \'.\' + g.fam] || g.fam;', 'const fam = g.fam;'],
    ['transferCounted', 'if (g.xfer === true || String(g.xfer) === \'true\') { b.xferIn += gin; b.xferOut += gout; continue; }', ''],
    ['heroesOnlyGold', 'for (const h of heroes) { const b = book.get(h.day); if (b) b.heroes += 1; }', 'for (const h of heroes) { const b = book.get(h.day); if (b && (h.g_in || h.g_out)) b.heroes += 1; }'],
    ['netIgnoresMarket', 'b.net = b.in + b.xferIn - b.out - b.xferOut;', 'b.net = b.in - b.out;'],
    ['growthNotPerHero', 'const a = (prev.src[key] || 0) / prev.heroes, b = g / last.heroes;', 'const a = (prev.src[key] || 0), b = g;'],
    ['growthInclusive', 'if (b > a * (1 + R.growthPct / 100))', 'if (b >= a * (1 + R.growthPct / 100))'],
    ['growthAt50', 'if (b > a * (1 + R.growthPct / 100))', 'if (b > a * 1.5)'],
    ['growthNoHeroFloor', 'if (prev.heroes < R.minHeroes || last.heroes < R.minHeroes) {', 'if (false) {'],
    ['growthNoShareFloor', 'if (g < R.minShare * last.in) continue;', ''],
    ['growthNewIgnored', 'if (b > a * (1 + R.growthPct / 100)) alarms.push', 'if (a > 0 && b > a * (1 + R.growthPct / 100)) alarms.push'],
    ['netPerDayNotHours', '(Number(h.hunted_ms) / 3600000) * incomePerH', '24 * incomePerH'],
    ['netIgnoresLevel', 'incomePerH(Number(h.level) || 1)', 'incomePerH(1)'],
    ['netCountsToday', 'const hs = heroes.filter((h) => days.has(h.day));', 'const hs = heroes;'],
    ['netDoubleSlack', 'perHero > sheetPerHero * R.netOverSheet', 'perHero > sheetPerHero * 2'],
    ['netGrossNotNet', 'const net = book.reduce((s, b) => s + b.net, 0);', 'const net = book.reduce((s, b) => s + b.in, 0);'],
    ['zeroOneDay', 'const lastN = book.slice(-R.zeroDays);', 'const lastN = book.slice(-1);'],
    ['zeroTodayIgnored', ' && !(today && today.sink[key] > 0))', ')'],
    ['zeroAllSinks', ".filter(([key, k]) => k.role === 'sink' && k.watch && live(k.rpc))", ".filter(([key, k]) => k.role === 'sink' && live(k.rpc))"],
    ['zeroLiveIgnored', ".filter(([key, k]) => k.role === 'sink' && k.watch && live(k.rpc))", ".filter(([key, k]) => k.role === 'sink' && k.watch)"],
    ['zeroAnyDay', 'lastN.every((b) => !(b.sink[key] > 0))', 'lastN.some((b) => !(b.sink[key] > 0))'],
    ['unknownCheckIgnored', 'for (const k of allowed) if (!K.kinds.includes(k)) add', 'for (const k of []) if (!K.kinds.includes(k)) add'],
    ['unknownKindIgnored', "if (!K.kinds.includes(g.kind)) add('a kind in the journal', g.kind);", ''],
    ['unknownKeyIgnored', "if (!k) { add('a gold key', key); continue; }", 'if (!k) continue;'],
    ['wrongWaySink', "if (k.role === 'sink' && gin > 0) add", "if (false) add"],
    ['wrongWaySource', "if (k.role === 'source' && gout > 0) add", "if (false) add"],
    ['checkParseLoose', "/'([a-z_]+)'::text/g", "/'([a-z]+)'::text/g"],
    ['reconcileRollupIgnored', 'Number(r && r.journal) + Number(r && r.rolled)', 'Number(r && r.journal)'],
    ['reconcileUnreadIsOk', "if (!r || r.held_all == null || r.journal == null || !Number.isFinite(held) || !Number.isFinite(journal)) return { verdict: 'UNREAD', gap: null };", ''],
    ['reconcileTolerant', "held === journal ? { verdict: 'OK'", "Math.abs(held - journal) <= 1 ? { verdict: 'OK'"],
    ['heldForward', 'h -= book[i].net;', 'h += book[i].net;'],
    ['sheetWorstMonster', 'best = Math.max(best, (m.gp[0] + m.gp[1]) / 2 / m.xp);', 'best = best ? Math.min(best, (m.gp[0] + m.gp[1]) / 2 / m.xp) : (m.gp[0] + m.gp[1]) / 2 / m.xp;'],
    ['sheetNoContract', 'Math.max(Number(S.paceRate[L]) || 0, S.contractXpPerH(L) * S.xpVsContractMax)', '(Number(S.paceRate[L]) || S.contractXpPerH(L))'],
    ['sheetNoParty', ' * S.partyMax;', ';'],
    ['sheetGpHighOnly', '(m.gp[0] + m.gp[1]) / 2 / m.xp', 'm.gp[1] / m.xp'],
    ['sheetNoLevelCap', 'const L = Math.min(L0, S.levelCap);', 'const L = L0;'],
  ];
  let missed = 0;
  for (const [name, find, repl] of MUTANTS) {
    if (!RULES.includes(find)) { console.error(`economy-watch --selftest: mutant ${name} cannot be planted, its anchor is gone`); return 2; }
    let red;
    try { red = checks(lift(RULES.replace(find, repl))).filter((c) => !c.ok).map((c) => c.id.split(' ')[0]); } catch (e) { red = [`threw (${e.message})`]; }
    if (red.length) console.log(`  CAUGHT ${name} by ${red.join(', ')}`);
    else { missed += 1; console.log(`  MISSED ${name}, every assertion stayed green`); }
  }
  if (realRed || missed) { console.log(`\neconomy-watch --selftest: RED, ${realRed} assertion(s) red on the real rules, ${missed} mutant(s) survived`); return 1; }
  console.log(`\neconomy-watch --selftest: green, ${real.length} assertions and ${contract.length} data checks on the real rules, all ${MUTANTS.length} mutants caught.`);
  return 0;
}

if (SELFTEST) process.exitCode = await selftest();
else await live().catch((e) => { console.error('economy-watch: ' + e.message); process.exitCode = 2; });
