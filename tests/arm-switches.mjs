#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/arm-switches.mjs — THE ARMED FEATURES, PLAYED BY A STRANGER (lane/c-arm-switches; supabase/migrations/2027-05-14-arm-switches.sql,
// the live events, and 2027-05-18-arm-scaled-hunts.sql, the scaled hunts, on for everyone; 2027-05-17-scaled-best.sql, a scaled run sets
// no best; Tyler's "ARM features built but OFF", master backlog 2026-11-18 item 4).
//
//   node tests/arm-switches.mjs            the guard
//   node tests/arm-switches.mjs --mutate   every planted defect must turn its arm red
//   node tests/arm-switches.mjs --only=AS-SCALED,AS-XP   those arms alone
//
// mutant-anchors: supabase/migrations/2027-05-17-scaled-best.sql (the body mutants read the replay's own body back; the rest plant a switch row
//   or boot the guards' calendar where the live one is asked for)
//
// The real replayed chain (PGlite) booted with `liveCalendar: true` (tests/schema-replay.mjs), so the switches read as the chain leaves
// them; the real edge settle (H.loadEdge); fixture accounts on NO switch list and with no flip written by the test: what a new player
// meets once the arm is applied. The feature's own rules are their guards' (tests/scaled-hunts-server.mjs, tests/live-events.mjs,
// tests/live-events-window.mjs); this one plays each feature once, the happy path, as armed.
//
// ARMS (the live calendar)
//   AS-ROWS    the chain leaves event_xp_bonus, event_open_halls and scaled_hunts at everyone with no account list, a stranger's
//              `features` names all three, a second apply of both arm files moves no switch row (updated_at included), and a second
//              apply of 2027-05-17-scaled-best.sql leaves both its bodies and its column byte for byte
//   AS-SCALED  SCALED HUNTS: a Level 20 stranger in its Level's iron hunting the Mill Cellar reads it in its `scaled_hunts` section at Level 20 for 40 x 20
//              gold an hour, buys one hour at that price (one shop row, the purse down by exactly it), and its next settles play the
//              Cellar at Level 20 and spend the hour by the world's swings; a re-read of the hero (a reload) projects the hours left,
//              on, and the hunt playing at Level 20; the Hunts list's tag and the hunt bar read "Scaled: Level 20" from that section;
//              the hunt ends past the best's ten minutes and sets NO personal best (its tally keeps the scaled time)
//   AS-XP      THE BONUS XP WEEKEND: the catalogue's own row, its window moved to hold the server instant (a test cannot wait for Friday):
//              a stranger's hunt earns +25% Level XP a kill on the tally's xp_event (the event's part a quarter of the rest, to rounding),
//              its `live_events` section lists the weekend live at the row's dial, the World's plate reads "+25% Level XP", and the
//              analyzer reads the event's part on its own "Weekend bonus" row (the server's xp_event)
//   AS-HALLS   OPEN HALLS: the catalogue's own row moved to hold now: a stranger with the Rat King's natural wins is quoted 0 gold
//              naming open_halls, calls one fight at 0 (seated, the purse untouched, one journalled row with the dial and the event,
//              the fight's stamina spent), and Call out's line reads the event
// ARMS (the guards' calendar, a plain bootReplay)
//   AS-QUIET   THE GUARDS' QUIET CALENDAR: every other guard boots with the event switches off (tests/schema-replay.mjs quietCalendar),
//              so inside an Open Halls window a quote still reads the row's fee and a Wednesday evening reads like a Tuesday; the
//              scaled_hunts switch, which runs on no clock, stays as the chain armed it
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { one, q, inTx, UIDS } = H;
const MIN = 60000, HOUR = 3600000;
const ARM_FILES = ['2027-05-14-arm-switches.sql', '2027-05-18-arm-scaled-hunts.sql'];
const SWITCHES = ['event_open_halls', 'event_xp_bonus', 'scaled_hunts'];
const ARMS = ['AS-ROWS', 'AS-SCALED', 'AS-XP', 'AS-HALLS', 'AS-QUIET'];
const BEST_FN = 'public.hr_hunt_best_fold(uuid)', APPLY_FN = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
const LIVE_ARMS = ARMS.filter((a) => a !== 'AS-QUIET');

const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const key = () => crypto.randomUUID();
const HERO = { level: 20, inv: { cooked_shrimp: 60 }, bag: [{ item: 'cooked_shrimp', qty: 50 }], gold: 1000000, realGround: true };
/* THE KIT A LEVEL 20 MELEE WEARS (tests/scaled-hunts-server.mjs KIT_20: in the start kit a Level 20 hero dies in the scaled Cellar inside six
   minutes, "either strong enough or not", Tyler 11-08): a player who buys a scaled hour wears his Level's gear. */
const KIT_20 = Object.freeze([['weapon', 'iron_sword'], ['shield', 'ironbound_shield'], ['helmet', 'iron_helm'], ['body', 'iron_platebody'], ['pants', 'iron_platelegs'],
  ['boots', 'iron_boots'], ['gloves', 'iron_gauntlets'], ['belt', 'iron_belt']]);
async function wear(db, uid) {
  for (const [slot, item] of KIT_20) await db.query(
    'insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [uid, slot, item]);
}
const env = (db, uid) => one(db, 'select public.hr_state_of($1::uuid, 0) as s', [uid]);
const purse = async (db, uid) => Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [uid]));
const bankOf = async (db, uid, hunt = 'mill_cellar') => Number(await one(db,
  'select coalesce((select banked_ms from public.player_scaled_hours where user_id = $1 and slot = 0 and hunt_id = $2), 0)::text', [uid, hunt]));
/* The catalogue's own row, its window moved to hold the server instant: the arm plays the calendar's event, never a probe of its own. */
const holdNow = (db, eventId) => db.query(`update public.hr_live_events set first_at = date_trunc('second', now()) - interval '30 minutes' where event_id = $1`, [eventId]);
async function cuts(db, M, list) { for (const t of list) { const r = await H.settleTo(db, M, t); if (r && r.skipped === 'no_hunt') break; } }
/* A CharacterSession as far as the client readers ask: the envelope's sections, the server's clock. */
const csOf = (s, nowMs) => ({ slot: 0, status: 'ready', read: (k) => s[k], serverNow: () => nowMs });
const nowMs = async (db) => Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint::text'));

const ARM_FNS = {
  'AS-ROWS': async (db) => {
    const bad = [];
    const rows = await q(db, `select switch_id, scope, accounts::text as a from public.hr_feature_switches where switch_id = any($1) order by switch_id`, [SWITCHES]);
    if (rows.length !== 3 || rows.some((r) => r.scope !== 'everyone' || r.a !== '{}')) bad.push('the chain leaves the switches at ' + JSON.stringify(rows));
    const stranger = '000000c0-0000-4000-a000-0000a2e5ff01';
    const f = await one(db, 'select public.hr_features_view($1::uuid, 0)', [stranger]);
    for (const s of SWITCHES) if (!(f || []).includes(s)) bad.push('a stranger\'s features section reads ' + JSON.stringify(f) + ', without ' + s);
    const before = JSON.stringify(await q(db, 'select switch_id, scope, accounts::text as a, note, updated_at::text as t from public.hr_feature_switches order by switch_id'));
    for (const f of ARM_FILES) await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8').replace(/\r\n/g, '\n'));
    const after = JSON.stringify(await q(db, 'select switch_id, scope, accounts::text as a, note, updated_at::text as t from public.hr_feature_switches order by switch_id'));
    if (after !== before) bad.push('a second apply of the arm moved a switch row');
    /* 2027-05-17-scaled-best.sql applied a second time: both spliced bodies and the column byte for byte (its markers skip the splices) */
    const shape = async () => JSON.stringify(await q(db, `select md5(pg_get_functiondef($1::regprocedure)) as a, md5(pg_get_functiondef($2::regprocedure)) as b,
      (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute t on t.attrelid = d.adrelid and t.attnum = d.adnum
        where d.adrelid = 'public.hunt_session_tally'::regclass and t.attname = 'scaled_ms') as c`, [APPLY_FN, BEST_FN]));
    const b0 = await shape();
    await db.exec(readFileSync(join(ROOT, 'supabase/migrations', '2027-05-17-scaled-best.sql'), 'utf8').replace(/\r\n/g, '\n'));
    if (await shape() !== b0) bad.push('a second apply of 2027-05-17-scaled-best.sql moved a body or the column');
    return bad;
  },

  'AS-SCALED': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 13, beforeEnter: () => wear(db, U) });
    const e0 = await env(db, U);
    const g0 = e0.scaled_hunts && e0.scaled_hunts.grounds && e0.scaled_hunts.grounds.mill_cellar;
    const price = Number(await one(db, 'select price_per_level::text from public.hr_scaled_hunt_rule where id')) * 20;
    if (!g0 || g0.level !== 20 || Number(g0.price) !== price || g0.banked_ms !== 0) bad.push('the stranger reads the Cellar in its section as ' + JSON.stringify(g0) + ' (want Level 20 at ' + price + ' an hour, none banked)');
    const gold0 = await purse(db, U);
    await db.query('delete from public.hr_rate_counters where user_id = $1', [U]);
    await asUser(db, U);
    const r = await one(db, 'select public.hr_scaled_hunt_buy(0, $1, $2, $3::bigint, $4::uuid)', ['mill_cellar', 1, price, key()]);
    await asUser(db, '');
    const rows = await q(db, `select gold::text as g from public.player_ledger where user_id = $1 and intent like 'scaled\\_hunt\\_buy:%'`, [U]);
    if (!r || r.ok !== true || await purse(db, U) !== gold0 - price || rows.length !== 1 || Number(rows[0].g) !== -price || await bankOf(db, U) !== HOUR)
      bad.push('the purchase answered ' + JSON.stringify(r).slice(0, 200) + ' (purse ' + (gold0 - await purse(db, U)) + ' down, rows ' + JSON.stringify(rows) + ', bank ' + await bankOf(db, U) + ')');
    await cuts(db, M, [h.from + 3 * MIN, h.from + 6 * MIN, h.from + 12 * MIN]);
    const inst = await one(db, 'select scale_level from public.hunt_instances where id = $1', [h.inst]);
    const left = await bankOf(db, U);
    if (inst !== 20 || !(left < HOUR) || !(left > HOUR - 13 * MIN)) bad.push('twelve minutes on the Cellar played at ' + inst + ' and left ' + left + ' ms banked (want Level 20, under an hour, about twelve minutes spent)');
    /* THE RELOAD: the hero as the server projects it now */
    const e1 = await env(db, U);
    const s1 = e1.scaled_hunts, g1 = s1 && s1.grounds && s1.grounds.mill_cellar;
    if (!g1 || g1.banked_ms !== left || g1.on !== true || !s1.playing || s1.playing.hunt !== 'mill_cellar' || s1.playing.level !== 20)
      bad.push('a reload projects ' + JSON.stringify({ g1, playing: s1 && s1.playing }));
    const SP = await import(pathToFileURL(join(ROOT, 'src/shell/windows/scale-pane.js')).href + V);
    const tag = SP.scaleTag(csOf(e1, await nowMs(db)), 'mill_cellar');
    if (tag !== 'Scaled: Level 20') bad.push('the Hunts list tags the Cellar "' + tag + '"');
    /* the hunt bar says the open hunt is spending scaled hours (local world 2026-11-18: nothing on the hunt screen said so) */
    const bar = SP.scalePlaying(csOf(e1, await nowMs(db)), 'mill_cellar');
    if (bar !== 'Scaled: Level 20' || SP.scalePlaying(csOf(e1, await nowMs(db)), 'meadowbrook_thicket') !== '') bad.push('the hunt bar reads "' + bar + '" on the Cellar');
    /* THE CARD SAYS BOTH MULTIPLES (the designer 2026-11-18): Gold × and Drops ×, the drops the server's own row (hr_scaled_kill_bounds.loot_pm) */
    const S = await import(pathToFileURL(join(ROOT, 'src/data/scaled-hunts.js')).href + V);
    const W = await import(pathToFileURL(join(ROOT, 'src/render/player-text.js')).href + V);
    const card = S.scaleFor('mill_cellar', 20), lootPm = Number(await one(db, "select loot_pm::text from public.hr_scaled_kill_bounds where hunt_id = 'mill_cellar' and level = 20"));
    const words = [W.t('hunts.scale_gold', { times: '6' }), W.t('hunts.scale_drops', { times: '2.4' })].join(' · ');
    if (!card || card.dropsPm !== lootPm || !(card.dropsPm > 1000 && card.dropsPm < card.coinPm) || words !== 'Gold ×6 · Drops ×2.4')
      bad.push('the Cellar at 20 reads Gold ' + (card && card.coinPm) + ', Drops ' + (card && card.dropsPm) + ' (the server\'s ' + lootPm + ') as "' + words + '"');
    /* A SCALED RUN SETS NO BEST (2027-05-17-scaled-best.sql; local world 2026-11-18: 15 scaled minutes moved a Cellar best 9,235 -> 18,521) */
    await db.query("select public.hr_hunt_close($1::uuid, 'server', now(), true)", [h.sid]);
    await db.query('select public.hr_hunt_best_fold($1::uuid)', [h.sid]);
    const scaledMs = Number(await one(db, 'select coalesce((select scaled_ms from public.hunt_session_tally where session_id = $1), 0)::text', [h.sid]));
    const wallMin = Number(await one(db, 'select (extract(epoch from ended_at - entered_at) / 60)::int::text from public.hunt_sessions where id = $1', [h.sid]));
    const best = await q(db, "select xp_h::text as x from public.hunt_bests where user_id = $1 and slot = 0 and hunt_id = 'mill_cellar'", [U]);
    if (!(wallMin >= 10)) bad.push('CONTROL: the hunt lasted ' + wallMin + ' min, under the best\'s ten');
    if (!(scaledMs >= HOUR - left - 2000) || best.length) bad.push('the scaled run kept ' + scaledMs + ' ms scaled on its tally and wrote the best ' + JSON.stringify(best) + ' (want the scaled time kept, no best)');
    console.log('  AS-SCALED a stranger at Level 20 bought 1 h for ' + price + ' gp; twelve minutes on the Cellar at Level ' + inst + ' left ' + Math.round(left / 1000) + ' s banked; tag "' + tag + '"; ended after ' + wallMin + ' min, ' + Math.round(scaledMs / 1000) + ' s scaled, bests ' + best.length);
    return bad;
  },

  'AS-XP': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    const row = (await q(db, `select e.pm from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id where e.event_id = 'bonus_weekend' and t.dial = 'xpPm'`))[0];
    if (!row) return ['the catalogue has no bonus_weekend xp row'];
    await holdNow(db, 'bonus_weekend');
    /* premium: the replay turns the betas' every-hero premium off (schema-replay.mjs premiumPerCharacter), and the analyzer section is premium's */
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 8, premium: true });
    const lx0 = Number(M.XP.charXpForLevel(20));
    await cuts(db, M, [h.from + 7 * MIN]);
    const s = await H.snapshot(db, h.sid, U);
    const ev = Number((s.tally && s.tally.xp_event) || 0), gained = Number(s.level_xp) - lx0, base = gained - ev;
    const share = base > 0 ? ev / base : 0, want = (row.pm - 1000) / 1000;
    if (!(ev > 0) || Math.abs(share - want) > 0.02) bad.push('seven minutes inside the weekend earned ' + gained + ' Level XP, ' + ev + ' of it the event\'s (' + (100 * share).toFixed(1) + '% over the rest, want ' + (100 * want) + '%)');
    const e = await env(db, U);
    const we = (e.live_events || []).find((x) => x.id === 'bonus_weekend');
    if (!we || we.live !== true || we.pm !== row.pm || we.dial !== 'xpPm') bad.push('the stranger\'s live_events section reads ' + JSON.stringify(e.live_events));
    const LV = await import(pathToFileURL(join(ROOT, 'src/shell/live-events-view.js')).href + V);
    const plate = LV.plateLines(csOf(e, await nowMs(db))).find((l) => l.id === 'bonus_weekend');
    if (!plate || plate.head !== '+' + (100 * want) + '% Level XP' || plate.soon !== false) bad.push('the World\'s plate reads ' + JSON.stringify(plate));
    /* THE ANALYZER SAYS IT (§6): the hero's view carries the server's xp_event, the row named by the event's own words */
    const HS = await import(pathToFileURL(join(ROOT, 'src/session/hunt-sections.js')).href + V);
    const view = HS.analyzerFrom(csOf(e, await nowMs(db)), e.hunt_analyzer);
    if (!view || view.hero.eventXp !== ev || !(view.hero.levelXp >= ev)) bad.push('the analyzer reads the event\'s part as ' + (view && view.hero.eventXp) + ', the tally ' + ev);
    const T = await import(pathToFileURL(join(ROOT, 'src/data/live-events.js')).href + V);
    if (T.LIVE_EVENTS.bonus_weekend.words.analyzer !== 'Weekend bonus') bad.push('the weekend\'s analyzer row is named ' + T.LIVE_EVENTS.bonus_weekend.words.analyzer);
    const W = await import(pathToFileURL(join(ROOT, 'src/render/player-text.js')).href + V);
    if (!/event bonus\)$/.test(W.t('hud.an_raw_xp_h'))) bad.push('the raw Level XP line reads "' + W.t('hud.an_raw_xp_h') + '", silent on the event');
    console.log('  AS-XP seven minutes on the Cellar at Level 20 inside the weekend: ' + gained + ' Level XP, ' + ev + ' the event\'s; the plate "' + (plate && plate.head) + ' ' + (plate && plate.when) + '"');
    return bad;
  },

  'AS-HALLS': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    await H.character(db, M, U, { level: 20, gold: 100000 });
    /* the Rat King's natural wins (2027-05-05-entry-gates.sql), as the settle writes them: this arm plays the fee, not the gate */
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
      select $1, 0, 'stat', 'ev:kill_monster:' || c.boss_id, '', c.wins, now() from public.hr_boss_calls c where c.call_id = 'rat_king'`, [U]);
    await holdNow(db, 'open_halls');
    const stam = Number(await one(db, `select fight_stamina_ms::text from public.hr_boss_calls where call_id = 'rat_king'`));
    const pool0 = Number(await one(db, 'select public.hr_stamina_of($1::uuid, 0, now())::text', [U]));
    const quote = await one(db, `select public.hr_boss_call_quote($1::uuid, 0, 'rat_king')`, [U]);
    if (!quote || Number(quote.price) !== 0 || quote.fee_pm !== 0 || quote.event !== 'open_halls') bad.push('the stranger is quoted ' + JSON.stringify(quote));
    await db.query('delete from public.hr_rate_counters where user_id = $1', [U]);
    await asUser(db, U);
    const r = await one(db, `select public.hr_boss_call(0, 'rat_king', 1, 0, $1::uuid)`, [key()]);
    await asUser(db, '');
    const led = await q(db, `select intent, gold, meta from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%'`, [U]);
    const seated = Number(await one(db, `select count(*)::text from public.hunt_sessions where user_id = $1 and ended_at is null and hunt_id = 'millrace_sewer_called'`, [U]));
    if (!r || r.ok !== true || await purse(db, U) !== 100000 || seated !== 1) bad.push('the free call answered ' + JSON.stringify(r).slice(0, 200) + ' (purse ' + await purse(db, U) + ', seated ' + seated + ')');
    if (led.length !== 1 || Number(led[0].gold || 0) !== 0 || led[0].meta.fee_pm !== 0 || led[0].meta.event !== 'open_halls') bad.push('the free call journalled ' + JSON.stringify(led));
    const pool1 = Number(await one(db, 'select stamina_ms::text from public.player_state where user_id = $1 and slot = 0', [U]));
    if (pool1 > pool0 - stam + 5000 || pool1 < pool0 - stam) bad.push('the fight left the stamina pool at ' + pool1 + ' of ' + pool0 + ' (want one fight, ' + stam + ' ms, off)');
    const e = await env(db, U);
    const LV = await import(pathToFileURL(join(ROOT, 'src/shell/live-events-view.js')).href + V);
    const { BOSS_CALLS } = await import(pathToFileURL(join(ROOT, 'src/data/boss-calls.js')).href + V);
    const words = LV.callEventWords(csOf(e, await nowMs(db)), BOSS_CALLS.rat_king, { price: 0, event: 'open_halls' });
    if (!words || !/^Open Halls is on until /.test(words.line)) bad.push('Call out reads ' + JSON.stringify(words));
    console.log('  AS-HALLS quoted ' + (quote && quote.price) + ' gp (' + (quote && quote.event) + '), one fight at 0: ' + (r && r.ok) + '; Call out reads "' + (words && words.line) + '"');
    return bad;
  },

  'AS-QUIET': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    const rows = await q(db, `select switch_id, scope from public.hr_feature_switches where switch_id = any($1) order by switch_id`, [SWITCHES]);
    const want = { event_open_halls: 'off', event_xp_bonus: 'off', scaled_hunts: 'everyone' };
    if (rows.length !== 3 || rows.some((r) => r.scope !== want[r.switch_id])) bad.push('the guards\' calendar reads ' + JSON.stringify(rows) + ' (want the events off, scaled_hunts as armed)');
    await H.character(db, M, U, { level: 20, gold: 100000 });
    await holdNow(db, 'open_halls');
    const fee = Number(await one(db, `select fight_fee::text from public.hr_boss_calls where call_id = 'rat_king'`));
    const quote = await one(db, `select public.hr_boss_call_quote($1::uuid, 0, 'rat_king')`, [U]);
    if (!quote || Number(quote.price) !== fee || quote.event !== null) bad.push('inside an Open Halls window a guard is quoted ' + JSON.stringify(quote) + ' (want the row\'s ' + fee + ' gp, no event)');
    return bad;
  },
};

async function runArms(db, M, names, plant) {
  const out = {};
  for (const name of names) {
    try {
      out[name] = await inTx(db, async () => {
        if (plant && plant.fn) {
          const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [plant.fn])).split(String.fromCharCode(13)).join('');
          if (def.split(plant.find).length !== 2) throw new Error('HARNESS: ' + plant.fn + ' has no ' + JSON.stringify(plant.find.slice(0, 70)));
          await db.exec(def.replace(plant.find, () => plant.replace));
        } else if (plant) await db.exec(plant);
        return ARM_FNS[name](db, M);
      });
    } catch (e) {
      const m = String(e && e.message);
      out[name] = [(/^settle to \S+ refused:/.test(m) ? 'a window was refused: ' : 'threw: ') + m.slice(0, 400)];
    }
  }
  return out;
}

/* STATE MUTANTS: a planted switch row is the defect "the arm did not reach everyone"; `calendar` boots the other calendar. */
const STATE_MUTANTS = [
  { arm: 'AS-ROWS', name: 'one switch left at the testers', plant: "update public.hr_feature_switches set scope = 'testers' where switch_id = 'event_xp_bonus'" },
  { arm: 'AS-SCALED', name: 'scaled_hunts left at the testers (a stranger is refused)', plant: "update public.hr_feature_switches set scope = 'testers' where switch_id = 'scaled_hunts'" },
  { arm: 'AS-XP', name: 'event_xp_bonus left off', plant: "update public.hr_feature_switches set scope = 'off' where switch_id = 'event_xp_bonus'" },
  { arm: 'AS-HALLS', name: 'event_open_halls left for one other account', plant: "update public.hr_feature_switches set scope = 'accounts', accounts = array['000000c0-0000-4000-a000-0000a2e5ff02'::uuid] where switch_id = 'event_open_halls'" },
  { arm: 'AS-QUIET', name: 'the harness keeps the live calendar for every guard', calendar: 'live' },
  { arm: 'AS-QUIET', name: 'the guards\' calendar quiets scaled_hunts too (the arm unseen by every guard)', plant: "update public.hr_feature_switches set scope = 'off' where switch_id = 'scaled_hunts'" },
  /* the body mutants: the replay's own body read back, one line taken out, re-created inside the arm's transaction (rolled back with it) */
  { arm: 'AS-SCALED', name: 'a scaled run folds its best', fn: BEST_FN,
    find: '  if coalesce((select t.scaled_ms from public.hunt_session_tally t where t.session_id = p_session), 0) > 0 then return; end if;\n', replace: '' },
  { arm: 'AS-SCALED', name: 'the settle never marks a scaled window', fn: APPLY_FN,
    find: '        on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;', replace: '        on conflict (session_id) do nothing;' },
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let live, quiet;
  try {
    ({ db: live } = await bootReplay({ liveCalendar: true }));
    ({ db: quiet } = await bootReplay());
  } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  for (const d of [live, quiet]) await H.pinDice(d);
  const M = { ...(await H.loadEdge(ROOT)), root: ROOT };
  const dbOf = (name, calendar) => ((calendar || (name === 'AS-QUIET' ? 'quiet' : 'live')) === 'live' ? live : quiet);
  if (MUTATE) {
    let bad = 0;
    for (const m of STATE_MUTANTS) {
      const res = await runArms(dbOf(m.arm, m.calendar), M, [m.arm], m.fn ? m : m.plant);
      const p = (res[m.arm] || [])[0];
      if (!p) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; continue; }
      if (/^threw/.test(p)) { console.error('✗ harness: ' + m.arm + ' threw on: ' + m.name + ' (' + p.slice(0, 160) + ')'); bad++; continue; }
      console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + p.slice(0, 110) + ')');
    }
    console.log(bad ? 'arm-switches --mutate: ' + bad + ' mutant(s) survived' : 'arm-switches --mutate: all ' + STATE_MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const res = {};
  const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  for (const name of ARMS.filter((n) => !only.length || only.includes(n))) Object.assign(res, await runArms(dbOf(name), M, [name]));
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); }
    else console.log('✓ ' + name);
  }
  const nLive = Object.keys(res).filter((n) => LIVE_ARMS.includes(n)).length;
  console.log(red ? 'arm-switches: ' + red + ' arm(s) red' : 'arm-switches: all ' + Object.keys(res).length + ' arms green (' + nLive + ' on the live calendar, '
    + (Object.keys(res).length - nLive) + ' on the guards\')');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
