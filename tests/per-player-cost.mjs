#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/per-player-cost.mjs — WHAT ONE HERO COSTS THE SERVER ONLY GOES DOWN
// (architecture audit 2026-11-18, new rule 10; CLAUDE.md §6; balance program build row L11, calls 28-10 and 28 step 10)
//
//   node tests/per-player-cost.mjs                     the ratchet (replays the chain, plays the shipped engine)
//   node tests/per-player-cost.mjs --write "<why>"     re-pin the baseline to this tree's measurement; the why (20+ characters) is
//                                                      recorded beside the numbers in its history, whether a number fell or rose
//   node tests/per-player-cost.mjs --only <fixture>    one fixture (a name or a part of one), for a quick look; never with --write
//   node tests/per-player-cost.mjs --selftest          the planted regressions each turn EVERY fixture red; the clean control passes
//   node tests/per-player-cost.mjs --lit               the same ratchet with the v0.3.0 drop switches ON (V030_SWITCHES: personal loot,
//                                                      Trait pieces and drops, Signatures, the Inner Flame), lit in the replay only,
//                                                      judged against the SAME baseline: what a hero costs once the release flips them
//                                                      (20-v030-the-roads.md section 4 Band 6 LT, gate 10). Never with --write or --selftest
//
// ci-step: pg17-lt | Per-hero server cost with the v0.3.0 drop switches on, every fixture inside the shipped baseline (rule 10, gate 10)
// ci-run: node tests/per-player-cost.mjs --lit
//
// mutant-anchors: none — --selftest plants a journal row a kill (a trigger on the tally and the bag), one more statement a settle
//   (this file's own counting exec), a settle four times slower (a burn inside the timed settle), an index.ts that lost its marker
//   (an in-memory copy), drifted budgets, a calibration part free after its first reading, and dice events on the watched door (a
//   poll that saves as a Rare's would: once a span, and every third poll), all in memory or in the rolled-back replay; no tracked
//   file is patched
//
// ── WHY ────────────────────────────────────────────────────────────────────
// The 2026-11-19 server audit (tools/qa/audit-2026-11-19-server/findings.md) put the ceiling at about 110-130 accounts online and
// named per-hero cost as the lever. A cost nobody measures only grows (game_events reached 94% of the database at six players, by
// logging one row a kill). And the guard's first two fixtures (a Level 10 lone hero, a Level 20 four, almost no supplies) read
// 44-48 journal rows a hero-hour where production read 216, and the heavy four's Krell hunt 426 (docs/design/balance-program/
// 11-krell-hunt-2026-11-20.md §6). Bigger fights cost every hero forever (28-platform.md §2 level 2, call 28-10), so before any
// engine change merges the team sees the cost of the shapes real players run:
//
// ── THE FIXTURES (each on the replayed chain with the SHIPPED edge: tick.js runTick, hunt-settle.js settleHunt) ──────────
//   lone_L10_meadowbrook_thicket   a lone hero, browser closed (the audit's fixture)
//   party4_L20_millrace_sewer      a party of four accounts, browser closed (the audit's fixture)
//   town_hour_bench                A TOWN HOUR: one hero feeding the Hearth's fuel stand (a bench run) with the browser closed, settled
//                                  by the world tick's roster one flush a fire (the bench is the armed town channel: the chain arms
//                                  `artisan` and leaves `gather` disarmed, so an away gatherer costs nothing until its return)
//   krell4_L80_deadly_watched      THE HEAVY FOUR (one account, four heroes, one party) on Krell's Hold, Deadly, sized like the real
//                                  one (11-krell §1, §4): a hammer tank in tier-6 plate on his own swordfish and whetstones, a bow on
//                                  store mithril arrows, a Mage on her own Carved fire runes and store ice, a Healer on her own Chalked
//                                  water runes; the played bars (tools/balance-sim/played.mjs). Its tab open, as 87% of the real hunt
//                                  was: a poll every 16 s and 0.6 early asks a poll (the client's cadence, tools/beta-load.mjs C). THE FLUSH
//                                  (lane/c-settle-flush, 30-plan L12): the poll of a running prediction CONFIRMS (hunt-ask.js confirm)
//                                  and saves only at the 90 s flush or at once on a death, a Level or a rare drop (hunt-settle.js flushDue).
//                                  READ AT ITS LAST SAVE, ON THREE DICE (lane/rel-cost-lt): every number over the span's complete flush
//                                  cycles, the median of WATCHED_DICE, so one dice event in 6.4 minutes is not read as a cost (measure)
//   krell4_L80_deadly_closed       the same four, browser closed (its away hours; with the watched row, the nightly's band, below)
//   tower4_L80_climb               the same four climbing the Burning Tower from floor 1 (a party climbs as one instance), closed, to
//                                  its first death or 12 windows. From floor 1, not landing 30, since the Tower's floors are formulas
//                                  (lane/tower-boss-formula: a four tops out near its Level + 25 to 35): from landing 30 three of the four
//                                  died 9.5 minutes in, so the hour measured a party mostly dead; from floor 1 one seat falls about 12.5
//                                  minutes in and three climb the whole 20 (MEASURED 2026-11-23)
//   supply4_L50_hasks_ford_deadly  THE SUPPLY-HEAVY FOUR, the Own four's shape (28's REAL 216-row mix): Level 50 on Hask's Ford,
//                                  Deadly, tier-4 kit, every role on its played bar, a third of its supplies carried, closed
//
// ── THE NUMBERS (one row a fixture, in tests/per-player-cost.baseline.json) ─────────────────────────────────────────────
//   statements_a_settle       payload statements the engine sends a settle (median; a SAVE: an unsaved confirm counts in the hour's
//                             totals only): exact, 0%
//   statements_a_hero_hour    payload statements a hero-hour at the door's cadence: 2% (a statement more a settle is +7% or more)
//   round_trips_a_hero_hour   network round trips a hero-hour, modelled from index.ts's transaction shapes (TRIPS, pinned below by
//                             RT-PIN): a pooled transaction is BEGIN, SET LOCAL ROLE, [the self marker], its statements, COMMIT; the
//                             hello's read is one transaction of six statements, five in savepoints. 2%
//   ledger_rows_a_hero_hour   player_ledger rows a hero-hour (wall 4, the journal): 20%, sized from the audit's spread (43-49 over
//                             36 windows); a row a kill is +88% (the lone Level 10, 2026-11-26) or more on every hunting fixture (MEASURED by --selftest)
//   row_writes_a_settle       inserts + updates + deletes a settle (median, a save; WAL, wall 1): 20%
//   row_writes_a_hero_hour    inserts + updates + deletes a hero-hour, every ask and fire counted (WAL, wall 1): 20%. THE FLUSH's
//                             number: a watched four wrote a save every 16 s and writes one about every 90 s
//   party_reads_a_settle      hr_hunt_instance_read calls a landed settle (median; track_functions = all): exact, 0%. READ ONCE
//                             (study 48 section 8): the settle read's `r` CTE is materialized, so the party is read once a settle,
//                             not once a reference (3 a closed save inlined). 0 on the town fixture, which reads no party
//   member_reads_a_settle     hr_hunt_member_read calls a landed settle (median): exact, 0%. One a member (1046-settle-plans.sql's
//                             offset-0 fences: unfenced, the instance read made 6 a member)
//   state_reads_a_settle      hr_state_of calls a landed settle (median): exact, 0%. THE NARROW TOWN READ (1048-narrow-town-read.sql):
//                             the world tick reads a town hero's engine inputs (hr_tick_town_state), never the whole hero, so the
//                             town fixture reads 0 (it read 1 a settle); a watched save's commit still answers with the asker's
//                             envelope
//   settle_cpu_ms_a_hero_hour the settle's time a hero-hour (PGlite and the engine, both in this process), as CPU time and not wall
//                             time (cpuMs below: a loaded box doubles the wall), in THIS run's calibration: the baseline holds the
//                             writer's ms and its calibration_ms, and a run scales the cap by its own (a fixed SQL + JSON workload, the
//                             median of seven; no part a JIT tier makes cheaper, see calibrate()). A SMOKE ALARM, not a ratchet: +100% (a doubling: Krell is 1.9x the Thicket's engine
//                             time, 28 §2). Counts are the ratchet; milliseconds only catch the gross step
//
// THE NIGHTLY (call 28 step 10). tools/beta-load.mjs --shape=krell4 plays the heavy four at the beta's concurrency on a real
// PostgreSQL 17 and judges its per-hero journal rows and statements against THIS baseline's two Krell rows, blended by its share of
// open tabs (concurrencyBand below): a regression past CONCURRENCY.band is red there. The release path runs only this replay.
//
// BUDGET-PIN. The capacity sampler (1002-ops-capacity-sample.sql) reads a body's engine time against
// hr_ops.capacity_config.edge_budget_ms; this run also holds that number to the shipped HUNT_ENGINE_BUDGET_MS.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';
import { HARNESS } from './hunt-sessions-settle.mjs';
import { bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { playedBar, PLAYED_OPTIONS } from '../tools/balance-sim/played.mjs';

const { ROOT, loadEdge, pinDice, character, one, q, makeExec, groundsOf } = HARNESS;
const BASELINE = join(ROOT, 'tests', 'per-player-cost.baseline.json');
const argv = process.argv.slice(2);
const WINDOWS = 12;          // closed door: steady 100 s world-tick windows (20 minutes of hunt)
const WINDOW_MS = 100000;
const POLLS = 24;            // watched door: landed settles 16 s apart (6.4 minutes of hunt)
const POLL_MS = 16000;       // src/session/config.js's viewed-hunt poll (tools/beta-load.mjs C.huntPollMs)
const EARLY = [3, 5];        // 0.6 early asks a poll (tools/beta-load.mjs C.earlyAsksPerPoll), spread evenly
const TOL = Object.freeze({ statements_a_settle: 0, statements_a_hero_hour: 0.02, round_trips_a_hero_hour: 0.02,
  ledger_rows_a_hero_hour: 0.2, row_writes_a_settle: 0.2, row_writes_a_hero_hour: 0.2, party_reads_a_settle: 0, member_reads_a_settle: 0, state_reads_a_settle: 0,
  settle_cpu_ms_a_hero_hour: 1.0 });
const METRICS = Object.keys(TOL);
const uidOf = (i) => '00000000-0000-4000-8000-0000003c' + String(i).padStart(4, '0');
const idem = () => crypto.randomUUID();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r1 = (x) => Math.round(x * 10) / 10;
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
/* THIS PROCESS'S CPU TIME, ms (PGlite runs in-process, so a settle's database work and its engine work are both here). Not wall time:
   on a box running other lanes the same settles read 2x the wall time from one run to the next (MEASURED 2026-11-20, town 1,676 ->
   3,889 ms a hero-hour), and CPU time does not wait in the scheduler's queue. */
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };

/* ── THE ROUND-TRIP MODEL: index.ts's transaction shapes (RT-PIN holds it to the file) ───────────────────────────────── */
export const TRIPS = Object.freeze({
  tick: 3,                                     // execTick: BEGIN, set local role hr_engine, COMMIT around its one statement
  player: 4,                                   // exec: the same and the self-echo marker
  helloRead: Object.freeze({ statements: 6, savepoints: 5 }),   // the accrue read: one transaction, five reads in savepoints
});
const tripsOf = (mode) => TRIPS[mode] + 1;
const HELLO_READ_TRIPS = TRIPS.player + TRIPS.helloRead.statements + 2 * TRIPS.helloRead.savepoints;
/** RT-PIN: the shapes TRIPS models, read out of supabase/functions/hr-accrue/index.ts. Null = they hold. */
export function tripsPin(src) {
  const block = (from, to) => { const a = src.indexOf(from); const b = a < 0 ? -1 : src.indexOf(to, a + from.length); return a < 0 || b < 0 ? null : src.slice(a, b); };
  const tick = block('const execTick = async', 'const out = await runTick');
  const exec = block('    const exec = async (text: string', '/* ── THE CLOSED-MODE ANSWER');
  const read = block('const read = await sql.begin', '\n    });');
  const count = (s, re) => (s.match(re) || []).length;
  const bad = [];
  if (!tick || count(tick, /set local role hr_engine/g) !== 1 || count(tick, /tx\.unsafe\(/g) !== 1 || /markSelf/.test(tick)) bad.push('execTick is not BEGIN, role, one statement, COMMIT');
  if (!exec || count(exec, /set local role hr_engine/g) !== 1 || count(exec, /markSelf\(tx\)/g) !== 1 || count(exec, /tx\.unsafe\(/g) !== 1) bad.push('exec is not BEGIN, role, marker, one statement, COMMIT');
  if (!read || count(read, /tx\.savepoint\(/g) !== TRIPS.helloRead.savepoints || count(read, /hr_rate_gate/g) !== 1) bad.push(`the accrue read is not one gate and ${TRIPS.helloRead.savepoints} savepoint reads`);
  return bad.length ? bad.join('; ') : null;
}

/* ── THE WORLD TICK, as the cron drives it ─────────────────────────────────────────────────────────────────────────── */
async function armCron(db) {
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200,
                    lease_ms = 30000, shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 4, hunt_bodies_max = 32,
                    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  await db.query('delete from net.http_request_queue');   // SHIM_NET: a queue table, no network
}
async function fire(db) {
  await db.query('delete from net.http_request_queue');
  await one(db, 'select public.hr_tick_cron_run()');
  return (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`)).map((r) => JSON.parse(r.b));
}
const tuples = async (db) => Object.fromEntries((await q(db, `select relname, (n_tup_ins + n_tup_upd + n_tup_del)::int as n
  from pg_stat_xact_user_tables where schemaname = 'public'`)).map((r) => [r.relname, r.n]));

/* The party reads and member reads this transaction has made so far (pg_stat_xact_user_functions, track_functions = all, set by
   measureAll): { party, member, state } (state: hr_state_of, the whole hero). */
const partyReads = async (db) => {
  const r = (await q(db, `select coalesce(sum(calls) filter (where funcname = 'hr_hunt_instance_read'), 0)::int as party,
      coalesce(sum(calls) filter (where funcname = 'hr_hunt_member_read'), 0)::int as member,
      coalesce(sum(calls) filter (where funcname = 'hr_state_of'), 0)::int as state
    from pg_stat_xact_user_functions where schemaname = 'public'`))[0];
  return { party: Number(r.party), member: Number(r.member), state: Number(r.state) };
};
/** The edge's exec as index.ts runs it (one pooled transaction a statement), counted: payload statements and round trips.
    THE PLANT `read_inlined` (--selftest): the settle read as it was before read once, its `r` CTE inlined into each reference.
    THE PLANT `town_whole_read`: the world tick reading a town hero whole again (hr_state_of for 1048's hr_tick_town_state). */
function countedExec(db, mode, stat, plant = null) {
  const base = makeExec(db);
  return async (text, params) => {
    stat.stmts += 1; stat.trips += tripsOf(mode);
    let sent = plant === 'read_inlined' ? String(text).replace('r as materialized (select g.allowed', 'r as (select g.allowed') : text;
    if (plant === 'read_inlined' && text === sent && /hr_hunt_instance_read/.test(String(text))) throw new Error('read_inlined: the settle read has no materialized r to inline');
    if (plant === 'town_whole_read') sent = String(text).replace('public.hr_tick_town_state(', 'public.hr_state_of(');
    return base(sent, params);
  };
}
/* THE PLANT `extra_statement`: one more round trip on the settle path, sent through the settle's own exec once it has landed. */
const plantExtra = async (exec, plant) => { if (plant === 'extra_statement') await exec('select 1', []); };
/* THE PLANT `slow_settle`: the settle's own time burnt three times more inside the timed region (an engine four times slower). */
const plantSlow = (plant, since) => { if (plant !== 'slow_settle') return; const until = cpuMs() + 3 * (cpuMs() - since); while (cpuMs() < until) { /* burn */ } };

/* ── THE HEAVY FOUR, AND THE OWN FOUR: one account, four heroes, one party (shared with tools/beta-load.mjs --shape=krell4) ── */
const ARMOR = Object.freeze({
  plate6: { helmet: 'ember_helm', body: 'ember_platebody', pants: 'ember_platelegs', boots: 'ember_boots', gloves: 'ember_gauntlets', belt: 'ember_belt' },
  leather6: { helmet: 'dragonhide_helmet', body: 'dragonhide_body', pants: 'dragonhide_pants', boots: 'dragonhide_boots', gloves: 'dragonhide_gloves', belt: 'dragonhide_belt' },
  cloth6: { helmet: 'archmage_helmet', body: 'archmage_body', pants: 'archmage_pants', boots: 'archmage_boots', gloves: 'archmage_gloves', belt: 'archmage_belt' },
  plate4: { helmet: 'mithril_helm', body: 'mithril_platebody', pants: 'mithril_platelegs', boots: 'mithril_boots', gloves: 'mithril_gauntlets', belt: 'mithril_belt' },
  leather4: { helmet: 'snakeskin_helmet', body: 'snakeskin_body', pants: 'snakeskin_pants', boots: 'snakeskin_boots', gloves: 'snakeskin_gloves', belt: 'snakeskin_belt' },
  cloth4: { helmet: 'warlock_helmet', body: 'warlock_body', pants: 'warlock_pants', boots: 'warlock_boots', gloves: 'warlock_gloves', belt: 'warlock_belt' },
});
/* A seat: its role (played.mjs), skills, worn kit, the bar's inputs (playedBar's o) and its own stock (held, and carried in). */
const seat = (role, skills, gear, bar, own) => Object.freeze({ role, skills, gear, bar, own: own || {} });
/** THE HEAVY FOUR at Krell's Hold (11-krell-hunt-2026-11-20.md §1, §4): Levels 78-80, main skills 60-64, three of four on their own
    supplies (the tank's swordfish and whetstones, the Mage's Carved fire runes, the Healer's Chalked water runes and suppers), the bow
    on store arrows (562 an hour at 4 gold: mithril), the casters on store drinks and the Mage on store ice. */
export const HEAVY_FOUR = Object.freeze({
  /* (its Deadly tier retired with the tier rows, lane/retire-tier-chain 2026-11-26: the four plays Krell's Hold on the Danger scale, Steady, the
     party's default; the fixture keeps its key) */
  hunt: 'krells_hold', level: 80,
  seats: Object.freeze([
    seat('tank', { melee: 61, defense: 60, magic: 30, ranged: 20 }, { ...ARMOR.plate6, weapon: 'ember_warhammer' },
      { magic: 30, food: 'cooked_swordfish', storeFood: 'salted_shrimp' }, { cooked_swordfish: 500, rune_whetstone: 500, etched_fire_rune: 1500 }),
    seat('ranger', { ranged: 62, defense: 40, magic: 30, melee: 20 }, { ...ARMOR.leather6, weapon: 'runewood_bow', ammo: 'mithril_arrows' },
      { magic: 30, storeFood: 'salted_shrimp', storeDrink: 'thin_pumpkin_cider', arrows: 'mithril_arrows' }, { mithril_arrows: 60 }),
    seat('mage', { magic: 60, defense: 25, melee: 10, ranged: 10 }, { ...ARMOR.cloth6, weapon: 'runewood_wand', shield: 'runewood_codex' },
      { magic: 45, storeFood: 'salted_shrimp', storeDrink: 'thin_pumpkin_cider' }, { carved_fire_rune: 2500 }),
    seat('healer', { magic: 64, defense: 34, melee: 10, ranged: 10 }, { ...ARMOR.cloth6, weapon: 'runewood_staff' },
      { magic: 1, food: 'cooked_swordfish', storeFood: 'salted_shrimp', storeDrink: 'thin_pumpkin_cider' }, { chalked_water_rune: 4000, cooked_swordfish: 80 }),
  ]),
});
/** THE OWN FOUR's shape at its band (balance-program ref point `ford`: Level 50, Deadly; 28's reference "Own four": a third of its
    supplies its own): tier-4 kit, the same four roles on their played bars, every kind of supply on the bar, a third of it carried. */
export const OWN_FOUR = Object.freeze({
  hunt: 'hasks_ford', level: 50,
  seats: Object.freeze([
    seat('tank', { melee: 46, defense: 45, magic: 30, ranged: 10 }, { ...ARMOR.plate4, weapon: 'mithril_warhammer' },
      { magic: 30, food: 'cooked_lobster', storeFood: 'salted_trout', storeDrink: 'thin_tomato_juice' }, { cooked_lobster: 120, steel_whetstone: 300 }),
    seat('ranger', { ranged: 47, defense: 30, magic: 30, melee: 10 }, { ...ARMOR.leather4, weapon: 'maple_bow', ammo: 'mithril_arrows' },
      { magic: 30, storeFood: 'salted_trout', storeDrink: 'thin_tomato_juice', arrows: 'mithril_arrows' }, { mithril_arrows: 400, etched_fire_rune: 150 }),
    seat('mage', { magic: 46, defense: 22, melee: 10, ranged: 10 }, { ...ARMOR.cloth4, weapon: 'maple_wand', shield: 'maple_spellbook' },
      { magic: 45, storeFood: 'salted_trout', storeDrink: 'thin_tomato_juice' }, { carved_fire_rune: 300 }),
    seat('healer', { magic: 47, defense: 25, melee: 10, ranged: 10 }, { ...ARMOR.cloth4, weapon: 'maple_staff' },
      { magic: 45, food: 'cooked_lobster', storeFood: 'salted_trout', storeDrink: 'thin_tomato_juice' }, { carved_water_rune: 400, cooked_lobster: 40 }),
  ]),
});

/**
 * One account's four heroes, dressed, barred and stocked, seated in one party on `shape.hunt` and entered (a scale ground: Steady, the default).
 * `as(uid)` sets the caller's claim (transaction-local on the replay, session-level on tools/beta-load.mjs's PostgreSQL 17). Extra hero
 * slots are bought with gold in play: the caller opens them (hr_hero_slots.starter) while the fixture builds. Answers { slots, sids }.
 */
export async function buildFour(db, M, uid, shape, { as, gold = 2000000, name = null } = {}) {
  const ask = async (sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const need = (r, what) => { if (!r || !(r.ok === true || r.created === true)) throw new Error(`${what} refused: ${JSON.stringify(r).slice(0, 300)}`); return r; };
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'per-player-cost') on conflict (user_id) do nothing`, [uid]);
  await as(uid);
  const slots = shape.seats.map((_, s) => s);
  for (const [s, st] of shape.seats.entries()) {
    need(await ask('select public.hr_create_character($1::int)', [s]), `hero ${s}`);
    await db.query(`update public.player_state set active_kind = 'idle', active_id = null, level_xp = $3 where user_id = $1 and slot = $2`,
      [uid, s, M.XP.charXpForLevel(shape.level)]);
    for (const [k, lv] of Object.entries(st.skills)) {
      await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, $3, $4)
                        on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, s, k, M.XP.skillXpForLevel(k, lv)]);
    }
    await db.query('delete from public.player_inventory where user_id = $1 and slot = $2', [uid, s]);
    for (const [item, qty] of Object.entries(st.own)) {
      await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, $3, $4)', [uid, s, item, qty]);
    }
    await db.query('delete from public.player_equipment where user_id = $1 and slot = $2', [uid, s]);
    for (const [eq, item] of Object.entries(st.gear)) {
      await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, $2, $3, $4)', [uid, s, eq, item]);
    }
    need(await ask('select public.hr_action_set_options($1::int, 0, $2::jsonb, $3::uuid)',
      [s, JSON.stringify({ slots: playedBar(st.role, st.bar), ...PLAYED_OPTIONS[st.role] }), crypto.randomUUID()]), `the ${st.role}'s bar`);
    if (name) need(await ask('select public.hr_character_name_set($1::int, $2, $3::uuid)', [s, name(s), crypto.randomUUID()]), `the ${st.role}'s name`);
  }
  await db.query(`insert into public.account_wallet (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = excluded.gold`, [uid, gold]);
  const pid = await ask('select public.hr_party_open($1::uuid, 0)', [uid]);
  for (const s of slots.slice(1)) await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, $3::int)', [pid, uid, s]);
  await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [pid, shape.hunt]);
  await as(uid);
  const sids = [];
  if (shape.tower) {
    /* a climb starts at a landing each seat has reached (tower_progress, tests/tower-climb.mjs's `best`) */
    for (const s of slots) {
      await db.query(`insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing) values ($1, $2, $3, $4, $5)
                        on conflict do nothing`, [uid, s, shape.hunt, shape.tower.landing + 5, shape.tower.landing]);
    }
    const r = need(await ask('select public.hr_tower_start(0, $1, $2::uuid)', [shape.tower.landing, crypto.randomUUID()]), 'the climb');
    sids.push(...(await db.query('select id from public.hunt_sessions where instance_id = (select instance_id from public.hunt_sessions where id = $1) order by slot', [r.session_id])).rows.map((x) => x.id));
  } else {
    for (const [s, st] of shape.seats.entries()) {
      const bag = Object.entries(st.own).map(([item, qty]) => ({ item, qty }));
      const e = need(await ask('select public.hr_hunt_enter($1::int, $2, $3::jsonb, 0, null, $4::uuid)', [s, shape.hunt, JSON.stringify(bag), crypto.randomUUID()]), `the ${st.role}'s enter`);
      sids.push(e.session.id);
    }
  }
  return { slots, sids };
}

/* The audit's original fixtures: four ACCOUNTS of one hero each, invited by name (2026-11-19). */
const WORDS = ['Alder', 'Birch', 'Cedar', 'Dogwood'];
async function accountsParty(db, M, size, hunt, kit, base) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const uids = Array.from({ length: size }, (_, i) => uidOf(base + i));
  for (const uid of uids) await character(db, M, uid, kit);
  if (size > 1) {
    for (let i = 1; i < size; i++) {
      await asUser(db, uids[i]);
      const nm = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', [`${WORDS[0]}cost ${'ABCDEF'[i]}`, idem()]);
      if (!nm || nm.ok !== true) throw new Error('name refused: ' + JSON.stringify(nm));
    }
    await asUser(db, uids[0]);
    const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [`${WORDS[0]}cost B`, idem()]);
    if (!inv || inv.ok !== true) throw new Error('invite refused: ' + JSON.stringify(inv));
    const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
    await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [pid, hunt]);
    /* No party finder (1059-no-party-finder.sql): the rest are invited by account, and each accepts. */
    for (let i = 1; i < size; i++) {
      if (i > 1) {
        await asUser(db, uids[0]);
        const more = await one(db, 'select public.hr_hunt_party_invite_player(0, $1::uuid, 0, $2::uuid)', [uids[i], idem()]);
        if (!more || more.ok !== true) throw new Error('invite refused: ' + JSON.stringify(more));
      }
      await asUser(db, uids[i]);
      const inviteId = await one(db, 'select id from public.hunt_party_invites where to_user = $1::uuid and to_slot = 0 and party_id = $2::uuid', [uids[i], pid]);
      const j = await one(db, 'select public.hr_hunt_party_accept(0, $1::uuid, $2::uuid)', [inviteId, idem()]);
      if (!j || j.ok !== true) throw new Error('accept refused: ' + JSON.stringify(j));
    }
  }
  const sids = [];
  for (const uid of uids) {
    await asUser(db, uid);
    const e = await one(db, 'select public.hr_hunt_enter(0, $1, $2::jsonb, 0, null, $3::uuid)', [hunt, JSON.stringify(kit.bag), idem()]);
    if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
    sids.push(e.session.id);
  }
  return { heroes: uids.map((u) => [u, 0]), sids };
}
async function oneAccountFour(db, M, shape, base) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_hero_slots set starter = true');   // the extra slots, opened while the fixture builds (rolled back)
  const uid = uidOf(base);
  const { slots, sids } = await buildFour(db, M, uid, shape, { as: (u) => asUser(db, u) });
  return { heroes: slots.map((s) => [uid, s]), sids };
}
/* A TOWN HOUR: a hero on the Hearth's fuel stand with no client (tests/artisan-tick.mjs's bench run, bones enough for the hour),
   enrolled by the minute cron with the tick on. */
async function townHero(db, M, base) {
  const uid = uidOf(base);
  await character(db, M, uid, { level: 20, inv: { bones: 3000 }, gold: 200000 });
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query(`update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_since = now(), accrued_to = now(),
                    last_seen_at = null where user_id = $1 and slot = 0`, [uid]);
  await db.query('select public.hr_tick_enrol(200)');
  return { heroes: [[uid, 0]], sids: [] };
}

const KIT10 = { level: 10, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const KIT20 = { level: 20, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 200000 };
const TOWER_FOUR = Object.freeze({ ...HEAVY_FOUR, hunt: 'the_burning_tower', tower: Object.freeze({ landing: 0 }) });
export const FIXTURES = Object.freeze({
  lone_L10_meadowbrook_thicket: { door: 'closed', build: (db, M) => accountsParty(db, M, 1, 'meadowbrook_thicket', KIT10, 100) },
  party4_L20_millrace_sewer: { door: 'closed', build: (db, M) => accountsParty(db, M, 4, 'millrace_sewer', KIT20, 200) },
  town_hour_bench: { door: 'roster', build: (db, M) => townHero(db, M, 300) },
  krell4_L80_deadly_watched: { door: 'watched', build: (db, M) => oneAccountFour(db, M, HEAVY_FOUR, 400) },
  krell4_L80_deadly_closed: { door: 'closed', build: (db, M) => oneAccountFour(db, M, HEAVY_FOUR, 500) },
  /* A climb ends at its first death (about 15-22 minutes for this four from any landing, measured 2026-11-20): it is measured to its
     end or 12 windows, whichever comes first, and only a climb shorter than 6 windows (10 minutes) no longer lasts a measurement. */
  tower4_L80_climb: { door: 'closed', minSettles: 6, build: (db, M) => oneAccountFour(db, M, TOWER_FOUR, 600) },
  supply4_L50_hasks_ford_deadly: { door: 'closed', build: (db, M) => oneAccountFour(db, M, OWN_FOUR, 700) },
});

/* ── THE MEASUREMENT ─────────────────────────────────────────────────────────────────────────────────────────────────── */
async function backdate(db, fx, secs) {
  const t = `date_trunc('second', now() - make_interval(secs => ${Number(secs)}))`;
  if (fx.sids.length) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                      next_swing_at = ${t} where id = any ($1::uuid[])`, [fx.sids]);
    await db.query(`update public.hunt_instances i set settled_to = ${t}, next_swing_at = ${t}
                      from public.hunt_sessions h where h.instance_id = i.id and h.id = any ($1::uuid[])`, [fx.sids]);
  }
  for (const [u, s] of fx.heroes) {
    if (fx.sids.length) continue;
    await db.query(`update public.player_state set active_since = ${t}, accrued_to = ${t} where user_id = $1 and slot = $2`, [u, s]);
    await db.query(`update public.hr_return_anchor set real_return_at = ${t} where user_id = $1 and slot = $2`, [u, s]);
  }
}
/* The span the heroes were paid for, summed: the hunt sessions' clocks, or the town heroes' watermarks (ms). */
const paidMs = async (db, fx) => (fx.sids.length
  ? Number(await one(db, 'select coalesce(sum(floor(extract(epoch from settled_to) * 1000)), 0)::bigint from public.hunt_sessions where id = any ($1::uuid[])', [fx.sids]))
  : Number(await one(db, `select coalesce(sum(floor(extract(epoch from accrued_to) * 1000)), 0)::bigint from public.player_state
      where (user_id, slot) in (select x.u, x.s from unnest($1::uuid[], $2::int[]) as x(u, s))`, [fx.heroes.map((h) => h[0]), fx.heroes.map((h) => h[1])])));
const ledgerOf = async (db, fx) => Number(await one(db, 'select count(*) from public.player_ledger where user_id = any ($1::uuid[])', [[...new Set(fx.heroes.map((h) => h[0]))]]));

/** A browser's hello, as index.ts sends it: the accrue read (one transaction), the seed read, then the hunt settle as the player. */
async function hello(db, M, stat, plant, viewer, o) {
  const base = makeExec(db);
  const [u, s] = viewer;
  await base(`select public.hr_rate_gate($1::uuid, $2::int, 'accrue'::text) as allowed`, [u, s]);
  await base('select public.hr_accrue_read($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now', [u, s]);
  await base('select monster_id, kills from public.hr_bestiary_of($1::uuid, $2::int)', [u, s]);
  await base('select monster_id, stage from public.hr_trophy_of($1::uuid, $2::int)', [u, s]);
  await base('select public.hr_hunt_open_of($1::uuid, $2::int) as session', [u, s]);
  await base('select count(*)::int as n from public.hr_collection_of($1::uuid, $2::int)', [u, s]);
  stat.stmts += TRIPS.helloRead.statements; stat.trips += HELLO_READ_TRIPS;
  const exec = countedExec(db, 'player', stat, plant);
  await exec(`select (public.hr_seed($1::uuid, $2::int, $3) & 4294967295)::bigint as seed,
             public.hr_seed($1::uuid, $2::int, $4)::text as salt, public.hr_perks_of($1::uuid, $2::int) as perks`, [u, s, 'accrue:x', 'intent:accrue:x']);
  const v = await M.HS.settleHunt({ exec, user: u, slot: s, mode: 'settle', bucket: null, project: true, live: true, grounds: groundsOf(M), ...o });
  if (v.outcome === 'paid' || v.outcome === 'confirmed') await plantExtra(exec, plant);
  return v;
}

/** One fixture's numbers: `door` closed (the world tick's bodies), roster (the tick's town roster) or watched (the hello). */
export async function measure(db, M, fx, door, plant, minSettles = null) {
  const n = door === 'watched' ? POLLS : WINDOWS;
  const step = door === 'watched' ? POLL_MS : WINDOW_MS;
  const behind = Math.ceil(((n + 2) * step) / 1000);
  await backdate(db, fx, behind);
  await armCron(db);
  const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const start = Math.floor((nowMs - behind * 1000) / 1000) * 1000;
  const stat = { stmts: 0, trips: 0 };
  const mine = (b) => (Array.isArray(b.hunts) && b.hunts.some((h) => fx.sids.includes(h.session_id)))
    || (Array.isArray(b.roster) && b.roster.some((r) => fx.heroes.some(([u, s]) => r.user_id === u && Number(r.slot) === s)));
  const led0 = await ledgerOf(db, fx); const paid0 = await paidMs(db, fx);
  /* cpu: every settle but the first (the engine's JIT and the plans' first touch), scaled back to the hours it covers */
  const per = []; const rows = []; const reads = []; let cpu = 0; let held = null; let polls = 0; let unsaved = null;
  /* THE WATCHED SPAN ENDS AT ITS LAST SAVE (lane/rel-cost-lt, 2026-11-27). A dice event (a Rare, a Level, a death) saves at once and
     restarts the 90 s flush, so the polls after the span's last save are unsaved. They used to be saved by one more settle and counted:
     a whole save's hunt, supply and instance rows for one to five polls of hunt, +25% row writes a hero-hour on the Krell four from ONE
     event on one seed (personal loot's Rare on seed 0, and the dark chain's own Rare on dice offset 4, MEASURED over 13 seeds). Every
     number is now read at the last save: the saves, the confirms, the journal and the hours paid over the same complete flush cycles
     (a renewal count). A span that ends on a save (the baseline's) reads exactly as before. `atSave` holds that reading. */
  let atSave = null;
  const all0 = await tuples(db);
  for (let k = 1; k <= n; k++) {
    let s0 = stat.stmts; let t0 = await tuples(db); let r0 = await partyReads(db);
    if (door === 'watched') {
      /* the live view's asks below the floor first (they answer the start point and settle nothing), then the landed poll */
      const early = Math.floor((k * EARLY[0]) / EARLY[1]) - Math.floor(((k - 1) * EARLY[0]) / EARLY[1]);
      const viewer = fx.heroes[0];
      let a = cpuMs();
      for (let i = 0; i < early; i++) {
        const e = await hello(db, M, stat, plant, viewer, { minWindowMs: 1e15, ...(held === null ? {} : { have: held }) });
        if (e.reason !== 'below_min_span') throw new Error(`poll ${k}: an early ask answered ${e.outcome}/${e.reason}`);
      }
      if (k > 1) cpu += cpuMs() - a;
      s0 = stat.stmts; t0 = await tuples(db); r0 = await partyReads(db);
      a = cpuMs();
      /* THE FLUSH (lane/c-settle-flush): the poll of a running prediction CONFIRMS; it saves at the 90 s flush or at once on an event
         (a planted dice event, --selftest: this poll saves the way a Rare's would, plantedEvent) */
      const v = await hello(db, M, stat, plant, viewer, { atMs: start + k * step, ...(plantedEvent(plant, k, n) ? {} : { confirm: true }),
        ...(held === null ? {} : { have: held }) });
      plantSlow(plant, a);
      if (k > 1) cpu += cpuMs() - a;
      if (v.outcome !== 'paid' && v.outcome !== 'confirmed') throw new Error(`poll ${k} neither saved nor confirmed: ${v.outcome}/${v.reason}`);
      polls += 1; unsaved = v.outcome === 'confirmed' ? start + k * step : null;
      if (v.body && v.body.state && Number.isSafeInteger(v.body.version)) held = v.body.version;
      if (v.body && v.body.hunt_ended) break;
      /* a settle's own numbers are a SAVE's: an unsaved confirm is counted in the hour's totals only */
      if (v.outcome !== 'paid') continue;
    } else {
      /* the fixture's own leases end, so this fire serves it again: the hunts' (hunt_tick_lease) or the bench's (hr_tick_ownership) */
      if (fx.sids.length) await db.query(`update public.hunt_tick_lease set lease_until = now() - interval '1 second' where session_id = any ($1::uuid[])`, [fx.sids]);
      else await db.query(`update public.hr_tick_ownership set lease_until = now() - interval '1 second' where user_id = any ($1::uuid[])`, [fx.heroes.map((x) => x[0])]);
      s0 = stat.stmts; t0 = await tuples(db); r0 = await partyReads(db);   // the cron fire's own writes (its leases, its queue) are the settle's cost too
      const bodies = (await fire(db)).filter(mine);
      if (!bodies.length) throw new Error(`no tick body served the fixture at window ${k}`);
      const exec = countedExec(db, 'tick', stat, plant);
      let h = null;
      const a = cpuMs();
      for (const b of bodies) h = (await M.TK.runTick({ exec, atMs: start + k * step, body: b, grounds: groundsOf(M) })).body;
      plantSlow(plant, a);
      if (k > 1) cpu += cpuMs() - a;
      if (door === 'closed' && !(h && h.hunts && h.hunts.settled)) throw new Error(`window ${k} did not settle: ${JSON.stringify(h && h.hunts)}`);
      if (door === 'roster' && !(h && h.processed > 0)) throw new Error(`window ${k}: the roster settled nothing: ${JSON.stringify(h).slice(0, 300)}`);
      await plantExtra(exec, plant);
      if (h && h.hunts && h.hunts.ended) break;
    }
    const t1 = await tuples(db);
    rows.push(Object.keys(t1).reduce((x, t) => x + (t1[t] - (t0[t] || 0)), 0));
    per.push(stat.stmts - s0);
    const rN = await partyReads(db);
    reads.push({ party: rN.party - r0.party, member: rN.member - r0.member, state: rN.state - r0.state });
    if (door === 'watched') atSave = { stmts: stat.stmts, trips: stat.trips, all: await tuples(db), led: await ledgerOf(db, fx), paid: await paidMs(db, fx), cpu, polls };
  }
  if (Math.max(per.length, polls) < (minSettles || n)) {
    const why = fx.sids.length ? (await q(db, 'select end_reason as r, count(*)::int as n from public.hunt_sessions where id = any ($1::uuid[]) group by 1', [fx.sids])).map((x) => `${x.r} x${x.n}`).join(', ') : 'the bench stopped';
    throw new Error(`the fixture ended after ${per.length} of ${n} settles (${why}): it no longer lasts a measurement`);
  }
  /* the span's numbers: at its last save when polls after it went unsaved (atSave, above), else at its end */
  if (unsaved !== null && !atSave) throw new Error('the watched span saved nothing: no flush cycle to measure');
  const end = unsaved !== null ? atSave
    : { stmts: stat.stmts, trips: stat.trips, all: await tuples(db), led: await ledgerOf(db, fx), paid: await paidMs(db, fx), cpu, polls: Math.max(per.length, polls) };
  /* ...then the unsaved polls are saved, uncounted, so a caller that reads the database after (tests/frame-delta.mjs, ledger-hours.mjs)
     finds every polled second paid, as before */
  if (unsaved !== null) await M.HS.settleHunt({ exec: makeExec(db), user: fx.heroes[0][0], slot: fx.heroes[0][1], mode: 'settle', bucket: null, grounds: groundsOf(M), atMs: unsaved });
  const numbers = (e) => {
    const heroHours = (e.paid - paid0) / 3600000;
    if (!(heroHours > 0)) throw new Error('the fixture paid no time');
    const written = Object.keys(e.all).reduce((x, t) => x + (e.all[t] - (all0[t] || 0)), 0);
    return { statements_a_settle: med(per), statements_a_hero_hour: r1(e.stmts / heroHours), round_trips_a_hero_hour: r1(e.trips / heroHours),
      ledger_rows_a_hero_hour: r1((e.led - led0) / heroHours), row_writes_a_settle: med(rows), row_writes_a_hero_hour: r1(written / heroHours),
      party_reads_a_settle: med(reads.map((x) => x.party)),
      member_reads_a_settle: med(reads.map((x) => x.member)), state_reads_a_settle: med(reads.map((x) => x.state)),
      settle_cpu_ms_a_hero_hour: Math.round(e.cpu / (heroHours * (e.polls - 1) / e.polls)) };
  };
  const out = numbers(end);
  /* --selftest's proof that the cut matters: a planted run also reads the span the old way, its unsaved polls saved and counted */
  if (plant && unsaved !== null) {
    Object.defineProperty(out, 'tailCounted', { enumerable: false, value: numbers({ stmts: stat.stmts, trips: stat.trips,
      all: await tuples(db), led: await ledgerOf(db, fx), paid: await paidMs(db, fx), cpu, polls: Math.max(per.length, polls) }) });
  }
  return out;
}

/* ── THE WATCHED DOOR, READ ON THREE DICE (lane/rel-cost-lt, 2026-11-27) ─────────────────────────────────────────────────────
   24 polls are 6.4 minutes of a four's hunt, and a dice event lands in some of them and not others: on the Krell four 2 of 26 spans
   (13 dice offsets, dark and lit, MEASURED 2026-11-27) held one Rare. Read at its last save (measure, above) such a span still reads
   +4% (the event 5 polls after a save) to +24% (1 poll after: a whole save for 16 s of hunt) where the long-run cost of Krell's Rare
   rate is about +1%, so with personal loot's honest +6% a save the four had 10% of headroom and an event 1 to 4 polls after a save
   read red. The watched door is measured on WATCHED_DICE (the uuid sequence rewound to DICE0 + each), every metric the MEDIAN: one
   span's dice event is outvoted, a cost every span pays (a row, a statement, a save more a flush) is in all three. The closed doors
   save every window, so a dice event moves no save there: one reading. */
const WATCHED_DICE = Object.freeze([0, 1, 2]);
/* --selftest's line between a dice event read as its rate and one read as a save's fixed rows (MEASURED 2026-11-27 on the dark
   chain: the planted events' median +3.9%; the late event with its unsaved poll saved and counted +11.7%, the save's fixed rows over
   24 polls; the event one poll after a save on its own dice +16.1%) */
const EVENT_BAND = 0.08;
/* THE PLANTED DICE EVENTS (--selftest): a poll that saves as a Rare's would (no `confirm`, so it saves whatever the flush says).
   'dice_event' plants the worst place (one poll after a flush save, n - 5) on the first dice and the place that turned the Krell four
   red (n - 1) on the others; 'event_often' an event every third poll on every dice (saves twice as often: a real cost, red). */
const plantedEvent = (plant, k, n) => (plant === 'event_early' && k === n - 5) || (plant === 'event_late' && k === n - 1)
  || (plant === 'event_often' && k % 3 === 0);
const dicePlant = (plant, i) => (plant === 'dice_event' ? (i === 0 ? 'event_early' : 'event_late') : plant);
/** Every metric's median over the dice's readings; the readings themselves ride along, unenumerated (never written). */
function medianOf(readings) {
  const out = Object.fromEntries(METRICS.map((k) => [k, med(readings.map((r) => r[k]))]));
  Object.defineProperty(out, 'dice', { enumerable: false, value: readings });
  return out;
}

/* ── THE PLANTS (--selftest): a journal row a unit of work, game_events' old shape: a kill (the hunt's tally), or a unit a town job
   moved through the bag (the bench's bones burnt, a gatherer's logs) for a hero with no hunt open ───────────────────────────── */
const UNIT_ROW = `
  create or replace function public.hr_planted_unit_rows() returns trigger language plpgsql security definer set search_path = public, pg_catalog as $p$
  declare v_n int; v_u uuid; v_s int;
  begin
    if tg_table_name = 'hunt_session_tally' then
      v_n := coalesce(new.kills, 0) - (case when tg_op = 'UPDATE' then coalesce(old.kills, 0) else 0 end);
      if v_n > 0 then
        insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, session_id, at)
        select h.user_id, h.slot, 'hunt', 'planted_unit', 0, '{}'::jsonb, h.id, now() from public.hunt_sessions h, generate_series(1, v_n) where h.id = new.session_id;
      end if;
      return null;
    end if;
    if tg_op = 'DELETE' then v_u := old.user_id; v_s := old.slot; v_n := old.qty;
    else v_u := new.user_id; v_s := new.slot; v_n := abs(new.qty - (case when tg_op = 'UPDATE' then old.qty else 0 end)); end if;
    if v_n > 0 and not exists (select 1 from public.hunt_sessions h where h.user_id = v_u and h.slot = v_s and h.ended_at is null) then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      select v_u, v_s, 'craft', 'planted_unit', 0, '{}'::jsonb, now() from generate_series(1, v_n);
    end if;
    return null;
  end $p$;
  create trigger hr_planted_unit_tally after insert or update on public.hunt_session_tally for each row execute function public.hr_planted_unit_rows();
  create trigger hr_planted_unit_bag after insert or update or delete on public.player_inventory for each row execute function public.hr_planted_unit_rows();`;

/* THE PLANT `member_unfenced`: the instance read and the member read without 1046-settle-plans.sql's offset-0 fences (rolled back). */
async function unfence(db) {
  for (const fn of ['public.hr_hunt_instance_read(uuid,integer)', 'public.hr_hunt_member_read(public.hunt_sessions)']) {
    const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn]));
    const un = def.split(' offset 0) ').join(') ');
    if (un === def) throw new Error(`member_unfenced: ${fn} holds no offset-0 fence`);
    await db.exec(un);
  }
}

/* EVERY FIXTURE ROLLS ITS OWN DICE (set reds 5, 2026-11-23). pinDice's counting gen_random_uuid is a SEQUENCE, and a sequence is not
   rolled back with the savepoint: unrewound, a fixture's session and instance ids (the keys of its hunt seed) were the count every
   fixture before it drew, so the Tower four's climb died earlier in the full run than alone (statements/hero hour 44.3 full, 39.8
   --only tower4, 37.7 --only L80: one settle count, a different paid-hours denominator). Rewound to the value read before the first
   fixture, each fixture plays the same swings whatever ran before it, whatever --only names and in every --selftest plant. */
let DICE0 = null;
/** The uuid sequence back to DICE0 (+ `offset`: another set of dice, the watched door's WATCHED_DICE). */
async function rewindDice(db, offset = 0) {
  if (DICE0 === null) [DICE0] = await q(db, 'select last_value::text as v, is_called as c from public.hr_test_uuid_seq');
  await db.query(`select setval('public.hr_test_uuid_seq', $1::bigint, $2::boolean)`, [String(BigInt(DICE0.v) + BigInt(offset)), DICE0.c]);
}

/** Every fixture (or `only`), each built and measured inside its own rolled-back savepoint, the watched door once on each of
    WATCHED_DICE (its median, medianOf). `plant`: the selftest's defect. */
async function measureAll(db, M, { plant = null, only = null } = {}) {
  const out = {};
  await db.query(`set track_functions = 'all'`);   // party_reads_a_settle (pg_stat_xact_user_functions)
  await db.query('begin');
  try {
    for (const [name, f] of Object.entries(FIXTURES)) {
      if (only && !name.includes(only)) continue;
      const dice = f.door === 'watched' ? WATCHED_DICE : [0];
      const readings = [];
      for (const [i, offset] of dice.entries()) {
        await rewindDice(db, offset);
        await db.query('savepoint fx');
        try {
          if (plant === 'unit_row') await db.exec(UNIT_ROW);
          if (plant === 'member_unfenced') await unfence(db);
          const fx = await f.build(db, M);
          readings.push(await measure(db, M, fx, f.door, dicePlant(plant, i), f.minSettles));
        } catch (e) { throw new Error(`${name}${dice.length > 1 ? ` (dice +${offset})` : ''}: ${e.message}`); } finally { await db.query('rollback to savepoint fx'); }
      }
      out[name] = readings.length === 1 ? readings[0] : medianOf(readings);
    }
  } finally { await db.query('rollback'); }
  return out;
}

/* THE MACHINE'S SPEED: a fixed workload of the settle's own two kinds, about 170 CPU ms a round (Windows counts CPU time in 15.6 ms
   ticks): a PGlite query (the database half, WASM) and a JSON round trip of small objects (the engine half, allocation and GC). Two
   warm-up rounds, then the MEDIAN of seven (the settle is a sum over many windows, an average case, so its unit is one too), taken after
   the fixtures have run (the engine and PGlite warm, as the baseline's was). settle_cpu_ms is judged in units of it.
   NO PART A JIT TIER MAKES CHEAPER (lane/c-engine-reds, next run 44863151394): the old workload's third part, a tight integer loop, ran
   110-125 ms until V8's optimizing tier replaced it mid-run and 15-31 ms after, so the fastest of four read ~200 or ~110 ms by when the
   tier landed: 141 ms in CI's plain run and 90 ms in its --selftest, the same job, where the settle itself read 1,791 and 1,892. Half a
   unit halves every cap, and the tree that wrote the baseline read red on it here (3,733 > 3,244 at x0.84). --selftest's CALIBRATION
   arm holds three readings in one process within CAL_SPREAD of each other. `plant` 'warm_calibration' (the proof): the database half
   answered from a memo after the first reading, the class of a part a warm process does for free. */
const CAL_SPREAD = 1.5;
let calMemo = null;
export async function calibrate(db, plant = null) {
  const t = []; let sink = 0;
  const warm = plant === 'warm_calibration' && calMemo !== null;   // the proof's plant: free after the first reading
  for (let i = 0; i < 9; i++) {
    const a = cpuMs();
    if (warm) sink += calMemo;
    else sink += (calMemo = Number(await one(db, 'select count(distinct md5(i::text)) from generate_series(1, 100000) i')));
    sink += JSON.parse(JSON.stringify(Array.from({ length: 120000 }, (_, k) => ({ k, s: 'x' + k, v: [k, k + 1] })))).length;
    if (i > 1) t.push(cpuMs() - a);
  }
  return sink > 0 ? Math.round(med(t) * 10) / 10 : NaN;
}
/** Three readings of one machine in one process: { spread: max / min, readings }. */
async function calibrationSpread(db, plant = null) {
  calMemo = null;
  const readings = [await calibrate(db, plant), await calibrate(db, plant), await calibrate(db, plant)];
  return { spread: Math.max(...readings) / Math.min(...readings), readings };
}

/* THE CAPACITY SAMPLER READS THE SAME BUDGET (supabase/migrations/1002-ops-capacity-sample.sql): its edge wall is a body's
   engine time over hr_ops.capacity_config.edge_budget_ms, which must be the shipped engine's HUNT_ENGINE_BUDGET_MS, or the
   wall reads the wrong ceiling. Null = the sampler is not in this chain. */
async function budgetPin(db, M) {
  if (!(await one(db, "select to_regclass('hr_ops.capacity_config') is not null"))) return null;
  const sql = Number(await one(db, 'select edge_budget_ms from hr_ops.capacity_config where id'));
  return sql === Number(M.HS.HUNT_ENGINE_BUDGET_MS) ? null : `hr_ops.capacity_config.edge_budget_ms ${sql} != hunt-settle.js HUNT_ENGINE_BUDGET_MS ${M.HS.HUNT_ENGINE_BUDGET_MS}`;
}

/** Red lines: a measured value above its baseline by more than its tolerance (settle_cpu_ms scaled by this run's calibration). */
export function judge(measured, base, calibration = null) {
  const red = []; const tighter = [];
  const scale = Number.isFinite(calibration) && Number(base.calibration_ms) > 0 ? calibration / Number(base.calibration_ms) : 1;
  for (const [fx, m] of Object.entries(measured)) {
    const b = (base.fixtures || {})[fx];
    if (!b) { red.push(`${fx}: no baseline (run --write "<why>")`); continue; }
    for (const k of METRICS) {
      if (!Number.isFinite(b[k])) { red.push(`${fx} ${k}: no baseline (run --write "<why>")`); continue; }
      const at = k === 'settle_cpu_ms_a_hero_hour' ? b[k] * scale : b[k];
      const cap = at * (1 + TOL[k]);
      if (m[k] > cap) red.push(`${fx} ${k}: ${m[k]} > ${r1(at)}${TOL[k] ? ` (+${TOL[k] * 100}% = ${r1(cap)})` : ''}${k === 'settle_cpu_ms_a_hero_hour' ? ` (calibration x${scale.toFixed(2)})` : ''}`);
      else if (m[k] < at * (1 - TOL[k]) || (TOL[k] === 0 && m[k] < at)) tighter.push(`${fx} ${k}: ${m[k]} < ${r1(at)}`);
    }
  }
  return { red, tighter };
}

/* ── THE NIGHTLY'S BAND (tools/beta-load.mjs --shape=krell4) ────────────────────────────────────────────────────────── */
/** The heavy four at concurrency is judged against the two Krell rows, blended by its share of open tabs. */
export const CONCURRENCY = Object.freeze({ watched: 'krell4_L80_deadly_watched', closed: 'krell4_L80_deadly_closed',
  metrics: Object.freeze(['ledger_rows_a_hero_hour', 'statements_a_hero_hour']), band: 0.25 });
/**
 * measured: { ledger_rows_a_hero_hour, statements_a_hero_hour } over every hero of the population; tabs: the share of fours whose tab
 * is open (0..1). Red: a number above the blend by more than CONCURRENCY.band (concurrency may add a retry or a deferral, never a
 * quarter of a hero's cost). Low: under half the blend (the population did not settle at its cadence: a saturated bench or a broken door).
 */
export function concurrencyBand(measured, base, tabs) {
  const w = base && base.fixtures && base.fixtures[CONCURRENCY.watched]; const c = base && base.fixtures && base.fixtures[CONCURRENCY.closed];
  if (!w || !c) return { red: [`no ${CONCURRENCY.watched} / ${CONCURRENCY.closed} baseline in tests/per-player-cost.baseline.json`], low: [], expected: null };
  if (!(tabs >= 0 && tabs <= 1)) return { red: [`tabs ${tabs} is not a share`], low: [], expected: null };
  const red = []; const low = []; const expected = {};
  for (const k of CONCURRENCY.metrics) {
    const e = tabs * w[k] + (1 - tabs) * c[k];
    expected[k] = r1(e);
    const m = Number(measured && measured[k]);
    if (!Number.isFinite(m)) red.push(`${k}: not measured`);
    else if (m > e * (1 + CONCURRENCY.band)) red.push(`${k}: ${r1(m)} > ${r1(e)} (+${CONCURRENCY.band * 100}% = ${r1(e * (1 + CONCURRENCY.band))})`);
    else if (m < e * 0.5) low.push(`${k}: ${r1(m)} < half of ${r1(e)}`);
  }
  return { red, low, expected };
}

/* ── THE v0.3.0 SWITCHES (--lit; tools/beta-load.mjs --shape=lt lights the same list) ─────────────────────────────────── */
/** The drop and flame switches v0.3.0 flips, dark on the chain until then (20-v030-the-roads.md section 4 Band 6 LT): personal loot's
    pity (1063-flame-temper.sql), the Trait piece readers, Signatures and the settle's Trait roll (1071-trait-pieces.sql), and the Inner
    Flame (1063, walked in the settle by 1074-inner-flame-luck.sql). */
export const V030_SWITCHES = Object.freeze(['personal_loot', 'trait_pieces', 'signatures', 'trait_drops', 'inner_flame']);
/** Light `keys` in THIS database (a replay or a scratch clone, never production); a key with no hr_flags row is a harness fault. */
export async function lightSwitches(db, keys = V030_SWITCHES) {
  const lit = (await db.query('update public.hr_flags set enabled = true where key = any ($1::text[]) returning key', [[...keys]])).rows.map((r) => r.key);
  const missing = keys.filter((k) => !lit.includes(k));
  if (missing.length) throw new Error(`lightSwitches: no hr_flags row for ${missing.join(', ')} on this chain`);
  return lit.sort();
}

/** The why after --write (--raise, the old spelling, is accepted before it). */
function whyOf() {
  const at = argv.indexOf('--write');
  if (at < 0) return undefined;
  let w = argv[at + 1];
  if (w === '--raise') w = argv[at + 2];
  return w && !w.startsWith('--') ? w : null;
}

async function main() {
  /* --lit: the release's switches on in this replay, the same fixtures and the same baseline (a baseline is the chain as it ships) */
  const lit = argv.includes('--lit');
  if (lit && (argv.includes('--write') || argv.includes('--selftest'))) { console.error('--lit measures only: the baseline is the chain as it ships (drop --write / --selftest)'); return 2; }
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const pinned = tripsPin(readFileSync(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8'));
  const { db } = await bootReplay();
  await pinDice(db);
  const M = await loadEdge(ROOT);
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;

  if (argv.includes('--selftest')) {
    if (!base) { console.error('per-player-cost: no baseline; run --write "<why>" first'); return 2; }
    const fails = [];
    const arm = (label, cond, detail) => { console.log(`  ${cond ? 'ok    ' : 'FAILED'}  ${label}  ${detail}`); if (!cond) fails.push(label); };
    const cleanM = await measureAll(db, M, { only });
    const calibration = await calibrate(db);
    const clean = judge(cleanM, base, calibration);
    arm('CONTROL: the tree as it is measures inside its baseline', clean.red.length === 0, clean.red.join('; ') || 'green');
    /* each plant must turn EVERY fixture red on each metric it moves */
    for (const [plant, metrics, what] of [['unit_row', ['ledger_rows_a_hero_hour', 'row_writes_a_settle'], 'a journal row a kill, or a unit a town job moves'],
      ['extra_statement', ['statements_a_settle', 'statements_a_hero_hour', 'round_trips_a_hero_hour'], 'one more statement a settle']]) {
      const planted = await measureAll(db, M, { plant, only }); const excused = [];
      const r = judge(planted, base, calibration);
      for (const fx of Object.keys(FIXTURES).filter((x) => !only || x.includes(only))) {
        /* A ROW A KILL A SETTLE, read off the JOURNAL (the plant's other metric, so never off the metric it excuses): the planted
           journal rows a hero-hour over the saves a hero-hour (the clean run's row writes a hero-hour over its row writes a save, so a
           watched four's confirms never count as saves). row_writes_a_settle can only see the plant where that is past its
           own tolerance of the baseline (with a fifth to spare): the lone Level 10 at the Thicket kills about 2 a settle on 25 rows
           (2026-11-26), under the 5 a 20% band can see, and its journal still goes red. Every other fixture is held to it. */
        const reach = (k) => {
          if (plant !== 'unit_row' || k !== 'row_writes_a_settle') return true;
          const c = cleanM[fx]; const p = planted[fx];
          const aSettle = (p.ledger_rows_a_hero_hour - c.ledger_rows_a_hero_hour) * c.row_writes_a_settle / c.row_writes_a_hero_hour;
          return aSettle >= 1.2 * TOL.row_writes_a_settle * base.fixtures[fx].row_writes_a_settle;
        };
        const unseen = metrics.filter((k) => !reach(k));
        if (unseen.length) { excused.push(fx); console.log(`  note    ${plant} on ${fx}: ${unseen.join(', ')} not held (the plant is under its band's reach; the journal is held)`); }
        const missed = metrics.filter((k) => reach(k) && !r.red.some((x) => x.startsWith(`${fx} ${k}:`)));
        arm(`MUTANT ${plant} (${what}): ${fx} is red`, missed.length === 0,
          missed.length ? `NOT red on ${missed.join(', ')}` : r.red.filter((x) => x.startsWith(fx + ' ')).map((x) => x.slice(fx.length + 1)).join('; '));
      }
      /* the reach never excuses the metric everywhere: a row a kill is red on row writes a settle somewhere, or the proof proves nothing for it */
      const all = Object.keys(FIXTURES).filter((x) => !only || x.includes(only));
      if (plant === 'unit_row' && all.length > 1) arm('CONTROL: the row writes a settle are held on most fixtures (' + (all.length - excused.length) + ' of ' + all.length + ')', excused.length * 2 < all.length, excused.join(', ') || 'none excused');
    }
    /* READ ONCE: the settle read with its party read inlined again is red on every fixture that reads a party (the town reads none) */
    const inl = judge(await measureAll(db, M, { plant: 'read_inlined', only }), base, calibration);
    for (const fx of Object.keys(FIXTURES).filter((x) => (!only || x.includes(only)) && FIXTURES[x].door !== 'roster')) {
      const hit = inl.red.filter((x) => x.startsWith(`${fx} party_reads_a_settle:`));
      arm(`MUTANT read_inlined (the party read once a reference, not once a settle): ${fx} is red`, hit.length === 1,
        hit.length ? hit[0].slice(fx.length + 1) : 'NOT red on party_reads_a_settle');
    }
    /* THE NARROW TOWN READ: the tick reading a town hero whole again is red on the town fixture */
    if (!only || 'town_hour_bench'.includes(only)) {
      const twr = judge(await measureAll(db, M, { plant: 'town_whole_read', only: 'town_hour_bench' }), base, calibration);
      const hit = twr.red.filter((x) => x.startsWith('town_hour_bench state_reads_a_settle:'));
      arm('MUTANT town_whole_read (the tick reads a town hero whole again): town_hour_bench is red', hit.length === 1,
        hit.length ? hit[0].slice('town_hour_bench '.length) : 'NOT red on state_reads_a_settle');
    }
    /* ...and with the member read copied into each reference again (the offset-0 fences gone) */
    const unf = judge(await measureAll(db, M, { plant: 'member_unfenced', only }), base, calibration);
    for (const fx of Object.keys(FIXTURES).filter((x) => (!only || x.includes(only)) && FIXTURES[x].door !== 'roster')) {
      const hit = unf.red.filter((x) => x.startsWith(`${fx} member_reads_a_settle:`));
      arm(`MUTANT member_unfenced (the member read once a reference, not once a member): ${fx} is red`, hit.length === 1,
        hit.length ? hit[0].slice(fx.length + 1) : 'NOT red on member_reads_a_settle');
    }
    /* THE WATCHED DOOR'S DICE (lane/rel-cost-lt): one dice event in a span moves the watched four's row writes a hero-hour by under
       EVENT_BAND of the same tree's clean reading, read at the last save and as the median of WATCHED_DICE; each half of that is
       load-bearing (the same events read on one dice, or with the unsaved poll saved and counted, move it by more); an event every
       third poll on every dice (twice the saves, a cost every span pays) is red against the baseline */
    const wfx = CONCURRENCY.watched;
    if ((!only || wfx.includes(only)) && cleanM[wfx] && cleanM[wfx].dice) {
      const k = 'row_writes_a_hero_hour';
      const rise = (m, c) => m[k] / c[k] - 1;
      const pc = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
      const ev = (await measureAll(db, M, { plant: 'dice_event', only: wfx }))[wfx];
      const evR = judge({ [wfx]: ev }, base, calibration);
      arm(`CONTROL: a dice event in every span (one poll after a save on the first dice, the last poll but one on the others) moves the watched four under ${EVENT_BAND * 100}% and inside its baseline`,
        evR.red.length === 0 && rise(ev, cleanM[wfx]) < EVENT_BAND,
        `${k} ${ev[k]} (${pc(rise(ev, cleanM[wfx]))}; the dice ${ev.dice.map((d) => d[k]).join(' / ')})${evR.red.length ? '; ' + evR.red.join('; ') : ''}`);
      const lone = rise(ev.dice[0], cleanM[wfx].dice[0]);
      arm(`MUTANT one_dice: the event one poll after a save, read on its one dice (no median), moves it ${EVENT_BAND * 100}% or more`, lone >= EVENT_BAND, `${pc(lone)}`);
      const tail = ev.dice[1].tailCounted;
      const tl = tail ? rise(tail, cleanM[wfx].dice[1]) : NaN;
      arm(`MUTANT tail_counted: the late event with its unsaved poll saved and counted (no cut at the last save) moves it ${EVENT_BAND * 100}% or more`,
        tl >= EVENT_BAND, tail ? `${pc(tl)} (cut at the last save ${pc(rise(ev.dice[1], cleanM[wfx].dice[1]))})` : 'NO unsaved poll: the plant did not shift the flush');
      const often = (await measureAll(db, M, { plant: 'event_often', only: wfx }))[wfx];
      const oR = judge({ [wfx]: often }, base, calibration);
      arm('MUTANT event_often: a dice event every third poll on every dice (twice the saves) is red', oR.red.some((x) => x.startsWith(`${wfx} ${k}:`)),
        oR.red.filter((x) => x.startsWith(wfx + ' ')).map((x) => x.slice(wfx.length + 1)).join('; ') || `NOT red (${often[k]})`);
    }
    /* THE SMOKE ALARM: a settle four times slower (the engine's time burnt three times over, inside the timed settle) is red on one fixture;
       and the cap follows the machine: a settle 2.5x the baseline's is green on a machine whose calibration reads 2x, red on the same one */
    const slowAt = 'krell4_L80_deadly_closed';
    const slowM = await measureAll(db, M, { plant: 'slow_settle', only: slowAt });
    const slow = judge(slowM, base, calibration);
    arm(`MUTANT slow_settle (a settle four times slower): ${slowAt} is red`, slow.red.some((x) => x.startsWith(`${slowAt} settle_cpu_ms`)),
      slow.red.join('; ') || `NOT red (${JSON.stringify(slowM[slowAt])}, calibration ${calibration})`);
    const b = base.fixtures[slowAt]; const at = { [slowAt]: { ...b, settle_cpu_ms_a_hero_hour: b.settle_cpu_ms_a_hero_hour * 2.5 } };
    const slower = judge(at, base, base.calibration_ms * 2); const same = judge(at, base, base.calibration_ms);
    arm('CONTROL: a slower machine\'s calibration widens the cap (2.5x on a 2x machine is green, on the same machine red)',
      slower.red.length === 0 && same.red.some((x) => x.includes('settle_cpu_ms')), `${slower.red.join('; ') || 'green'} | ${same.red.join('; ') || 'NOT red'}`);
    /* THE UNIT HOLDS STILL: three readings of this machine agree, and a part a warm process does for free (the JIT-tiered loop's class)
       is red here */
    const cal = await calibrationSpread(db);
    arm(`CONTROL: the calibration reads one machine the same way three times (within x${CAL_SPREAD})`, cal.spread <= CAL_SPREAD,
      `${cal.readings.join(' / ')} ms, x${cal.spread.toFixed(2)}`);
    const calWarm = await calibrationSpread(db, 'warm_calibration');
    arm('MUTANT warm_calibration (a calibration part free after the first reading) is red', calWarm.spread > CAL_SPREAD,
      `${calWarm.readings.join(' / ')} ms, x${calWarm.spread.toFixed(2)}`);
    arm('CONTROL: the round-trip model is index.ts\'s (RT-PIN)', pinned === null, pinned || 'pinned');
    const drift = tripsPin(readFileSync(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8').replace('await markSelf(tx);\n        return await tx.unsafe', 'return await tx.unsafe'));
    arm('MUTANT trips_drift: a player exec that lost its marker is red', drift !== null, drift || 'NOT red');
    arm('CONTROL: the sampler\'s edge budget is the engine\'s', (await budgetPin(db, M)) === null, (await budgetPin(db, M)) || 'pinned');
    await db.query('begin');
    try {
      await db.query('update hr_ops.capacity_config set edge_budget_ms = edge_budget_ms + 100 where id');
      const pin = await budgetPin(db, M);
      arm('MUTANT budget_drift: a sampler budget off the engine\'s is red', pin !== null, pin || 'NOT red');
    } finally { await db.query('rollback'); }
    /* THE NIGHTLY'S BAND bites on the same two defects, as the concurrency run would read them */
    const w = base.fixtures[CONCURRENCY.watched]; const c = base.fixtures[CONCURRENCY.closed];
    const blend = (k, x) => (0.5 * w[k] + 0.5 * c[k]) * x;
    const ok = concurrencyBand({ ledger_rows_a_hero_hour: blend('ledger_rows_a_hero_hour', 1.1), statements_a_hero_hour: blend('statements_a_hero_hour', 1.1) }, base, 0.5);
    arm('CONTROL: the nightly band holds a population 10% over the blend', ok.red.length === 0, ok.red.join('; ') || 'green');
    const rows = concurrencyBand({ ledger_rows_a_hero_hour: blend('ledger_rows_a_hero_hour', 4), statements_a_hero_hour: blend('statements_a_hero_hour', 1) }, base, 0.5);
    arm('MUTANT band_rows: a row a kill at concurrency is red', rows.red.some((x) => x.startsWith('ledger_rows')), rows.red.join('; ') || 'NOT red');
    const st = concurrencyBand({ ledger_rows_a_hero_hour: blend('ledger_rows_a_hero_hour', 1), statements_a_hero_hour: blend('statements_a_hero_hour', 1.3) }, base, 0.5);
    arm('MUTANT band_statements: a third more statements at concurrency is red', st.red.some((x) => x.startsWith('statements')), st.red.join('; ') || 'NOT red');
    /* --lit IS NOT HOLLOW: it lights every v0.3.0 switch, a switch the chain lacks is a fault (never a silent dark run), and the lit
       Krell four writes what the switches write (its pity and its fire: row writes a settle above the dark run's) */
    if (!only || slowAt.includes(only)) {
      const lit = await lightSwitches(db);
      try {
        arm('CONTROL: --lit lights every v0.3.0 switch', lit.join() === [...V030_SWITCHES].sort().join(), lit.join(', '));
        const litM = (await measureAll(db, M, { only: slowAt }))[slowAt];
        arm('CONTROL: a lit Krell four writes its pity and its fire (row writes a settle above the dark run\'s)',
          litM.row_writes_a_settle > cleanM[slowAt].row_writes_a_settle, `${litM.row_writes_a_settle} lit, ${cleanM[slowAt].row_writes_a_settle} dark`);
        let threw = null;
        try { await lightSwitches(db, [...V030_SWITCHES, 'no_such_switch']); } catch (e) { threw = e.message; }
        arm('MUTANT lit_missing: a switch the chain lacks is a fault, not a dark run', threw !== null && threw.includes('no_such_switch'), threw || 'NOT red');
      } finally { await db.query('update public.hr_flags set enabled = false where key = any ($1::text[])', [[...V030_SWITCHES]]); }
    }
    return fails.length ? 1 : 0;
  }

  if (lit) console.log(`  lit in this replay: ${(await lightSwitches(db)).join(', ')}`);
  const measured = await measureAll(db, M, { only });
  const calibration = await calibrate(db);
  console.log(`  calibration ${calibration} ms${base && base.calibration_ms ? ` (the baseline's ${base.calibration_ms} ms)` : ''}`);
  for (const [fx, m] of Object.entries(measured)) console.log(`  ${fx.padEnd(30)} ${METRICS.map((k) => `${k.replace(/_a_/g, '/').replace(/_/g, ' ')} ${m[k]}`).join(', ')}`);

  const why = whyOf();
  if (why !== undefined) {
    if (only) { console.error('--write measures every fixture: drop --only'); return 1; }
    if (!why || why.length < 20) { console.error('--write needs a reason of at least 20 characters: node tests/per-player-cost.mjs --write "<why>"'); return 1; }
    const judged = base ? judge(measured, base, calibration).red : [];
    const up = judged.filter((x) => !x.includes('no baseline'));
    const added = judged.filter((x) => x.includes('no baseline')).map((x) => x.split(':')[0]);
    const history = [...((base && base.history) || []), { at: new Date().toISOString().slice(0, 10), why, ...(up.length ? { raised: up } : {}),
      ...(added.length ? { added } : {}), calibration_ms: calibration, fixtures: measured }].slice(-20);
    writeFileSync(BASELINE, JSON.stringify({ _readme: [
      'Per-hero server cost, measured by tests/per-player-cost.mjs (CLAUDE.md §6 rule 10; balance program L11). It moves only with a',
      'stated reason: node tests/per-player-cost.mjs --write "<why>", recorded in history with every number that rose.',
      'settle_cpu_ms_a_hero_hour is in this file\'s calibration_ms; a run scales it by its own (a smoke alarm, +100%).',
    ], windows: WINDOWS, polls: POLLS, tolerance: TOL, calibration_ms: calibration, fixtures: measured, history }, null, 1) + '\n');
    console.log(`per-player-cost: baseline written (${up.length ? up.length + ' number(s) rose' : 'nothing rose'})`);
    return 0;
  }

  if (!base) { console.error('per-player-cost: no baseline; run --write "<why>"'); return 2; }
  const { red, tighter } = judge(measured, base, calibration);
  if (pinned) red.push(`RT-PIN ${pinned}: update TRIPS (the round-trip model) with index.ts`);
  const pin = await budgetPin(db, M);
  if (pin) red.push(`BUDGET-PIN ${pin}`);
  if (red.length) {
    for (const r of red) console.error(`  RED  ${r}`);
    if (lit) {
      console.error(`\nper-player-cost --lit: a hero costs the server more than the baseline once ${V030_SWITCHES.join(', ')} are on (rule 10).`);
      console.error('  Cut it in the settle the switch lights, before the release flips it (the baseline is the chain as it ships)');
      return 1;
    }
    console.error('\nper-player-cost: a hero costs the server more than the baseline (rule 10). Cut it, or');
    console.error('  node tests/per-player-cost.mjs --write "<why this cost is worth it>"');
    return 1;
  }
  if (!lit) for (const t of tighter) console.log(`  can tighten: ${t}  (node tests/per-player-cost.mjs --write "<why>")`);
  console.log(lit ? `per-player-cost --lit: green — with ${V030_SWITCHES.join(', ')} on, no hero costs more than the baseline`
    : 'per-player-cost: green — no hero costs more than the baseline');
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.stack || e.message); process.exit(2); });
