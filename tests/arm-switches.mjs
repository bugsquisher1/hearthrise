#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/arm-switches.mjs — THE ARMED FEATURES, PLAYED BY A STRANGER (lane/c-arm-switches; supabase/migrations/2027-05-14-arm-switches.sql,
// the live events on for everyone; Tyler's "ARM features built but OFF", master backlog 2026-11-18 item 4). The scaled hunts' arm
// (2027-05-18-arm-scaled-hunts.sql) left with the scaled hunts (1072-retire-tier-chain.sql, lane/retire-tier-chain 2026-11-26).
//
//   node tests/arm-switches.mjs            the guard
//   node tests/arm-switches.mjs --mutate   every planted defect must turn its arm red
//   node tests/arm-switches.mjs --only=AS-ROWS,AS-XP   those arms alone
//
// mutant-anchors: none — every mutant plants a switch row or boots the guards' calendar where the live one is asked for
//
// The real replayed chain (PGlite) booted with `liveCalendar: true` (tests/schema-replay.mjs), so the switches read as the chain leaves
// them; the real edge settle (H.loadEdge); fixture accounts on NO switch list and with no flip written by the test: what a new player
// meets once the arm is applied. The feature's own rules are their guards' (tests/live-events.mjs,
// tests/live-events-window.mjs); this one plays each feature once, the happy path, as armed.
//
// ARMS (the live calendar)
//   AS-ROWS    the chain leaves event_xp_bonus at everyone with no account list (event_open_halls is gone with its type, 1043-hearthrise.sql,
//              D-7; scaled_hunts with the scaled hunts, 1071), and a stranger's `features` names it and not the retired one.
//              2027-05-14-arm-switches.sql is applied history whose precondition names the retired Open Halls switch: never re-run
//   AS-XP      THE HEARTHRISE (D-7): the catalogue's own row, its window moved to hold the server instant (a test cannot wait for Friday)
//              and not yet lit, so it pays the floor: a stranger's hunt earns +10% Level XP a kill on the tally's xp_event (the event's
//              part a tenth of the rest, to rounding), its `live_events` section lists the Hearthrise live at that size, the World's plate
//              reads "+10% Level XP", and the analyzer reads the event's part on its own "Hearthrise" row (the server's xp_event)
// ARMS (the guards' calendar, a plain bootReplay)
//   AS-QUIET   THE GUARDS' QUIET CALENDAR: every other guard boots with the event switches off (tests/schema-replay.mjs quietCalendar),
//              so inside a Hearthrise window a hunt reads no XP window and a Friday reads like a Tuesday
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const V = sourceQuery(ROOT);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { one, q, inTx, UIDS } = H;
const MIN = 60000;
const SWITCHES = ['event_xp_bonus'];
/* switches the chain retired with their features: never a row, never in a stranger's `features` */
const GONE = ['event_open_halls', 'scaled_hunts'];
const ARMS = ['AS-ROWS', 'AS-XP', 'AS-QUIET'];
const LIVE_ARMS = ARMS.filter((a) => a !== 'AS-QUIET');

const HERO = { level: 20, inv: { cooked_shrimp: 60 }, bag: [{ item: 'cooked_shrimp', qty: 50 }], gold: 1000000, realGround: true };
const env = (db, uid) => one(db, 'select public.hr_state_of($1::uuid, 0) as s', [uid]);
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
    if (rows.length !== SWITCHES.length || rows.some((r) => r.scope !== 'everyone' || r.a !== '{}')) bad.push('the chain leaves the switches at ' + JSON.stringify(rows));
    for (const g of GONE) if (Number(await one(db, `select count(*)::text from public.hr_feature_switches where switch_id = $1`, [g])) !== 0) bad.push('the retired ' + g + ' switch is still a row');
    const stranger = '000000c0-0000-4000-a000-0000a2e5ff01';
    const f = await one(db, 'select public.hr_features_view($1::uuid, 0)', [stranger]);
    for (const s of SWITCHES) if (!(f || []).includes(s)) bad.push('a stranger\'s features section reads ' + JSON.stringify(f) + ', without ' + s);
    for (const g of GONE) if ((f || []).includes(g)) bad.push('a stranger\'s features section still names the retired ' + g);
    return bad;
  },

  'AS-XP': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    const row = (await q(db, `select e.pm from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id where e.event_id = 'hearthrise' and t.dial = 'xpPm' and e.sized_by = 'fire'`))[0];
    if (!row) return ['the catalogue has no hearthrise xp row sized by the fire'];
    await holdNow(db, 'hearthrise');
    /* premium: the replay turns the betas' every-hero premium off (schema-replay.mjs premiumPerCharacter), and the analyzer section is premium's */
    /* on a ground with no exit (the Cellar's hunt ends at Level 5 unscaled, hunt-grounds.js endsAtLevel): the weekend's XP is this arm's subject */
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 8, premium: true, hunt: 'meadowbrook_thicket' });
    const lx0 = Number(M.XP.charXpForLevel(20));
    await cuts(db, M, [h.from + 7 * MIN]);
    const s = await H.snapshot(db, h.sid, U);
    const ev = Number((s.tally && s.tally.xp_event) || 0), gained = Number(s.level_xp) - lx0, base = gained - ev;
    const share = base > 0 ? ev / base : 0, want = (row.pm - 1000) / 1000;
    if (!(ev > 0) || Math.abs(share - want) > 0.02) bad.push('seven minutes inside the weekend earned ' + gained + ' Level XP, ' + ev + ' of it the event\'s (' + (100 * share).toFixed(1) + '% over the rest, want ' + (100 * want) + '%)');
    const e = await env(db, U);
    const we = (e.live_events || []).find((x) => x.id === 'hearthrise');
    if (!we || we.live !== true || we.pm !== row.pm || we.dial !== 'xpPm' || we.lit !== false) bad.push('the stranger\'s live_events section reads ' + JSON.stringify(e.live_events));
    const LV = await import(pathToFileURL(join(ROOT, 'src/shell/live-events-view.js')).href + V);
    const plate = LV.plateLines(csOf(e, await nowMs(db))).find((l) => l.id === 'hearthrise');
    if (!plate || plate.head !== '+' + (100 * want) + '% Level XP' || plate.soon !== false) bad.push('the World\'s plate reads ' + JSON.stringify(plate));
    /* THE ANALYZER SAYS IT (§6): the hero's view carries the server's xp_event, the row named by the event's own words */
    const HS = await import(pathToFileURL(join(ROOT, 'src/session/hunt-sections.js')).href + V);
    const view = HS.analyzerFrom(csOf(e, await nowMs(db)), e.hunt_analyzer);
    if (!view || view.hero.eventXp !== ev || !(view.hero.levelXp >= ev)) bad.push('the analyzer reads the event\'s part as ' + (view && view.hero.eventXp) + ', the tally ' + ev);
    const T = await import(pathToFileURL(join(ROOT, 'src/data/live-events.js')).href + V);
    if (T.LIVE_EVENTS.hearthrise.words.analyzer !== 'Hearthrise') bad.push('the weekend\'s analyzer row is named ' + T.LIVE_EVENTS.hearthrise.words.analyzer);
    const W = await import(pathToFileURL(join(ROOT, 'src/render/player-text.js')).href + V);
    if (!/event bonus\)$/.test(W.t('hud.an_raw_xp_h'))) bad.push('the raw Level XP line reads "' + W.t('hud.an_raw_xp_h') + '", silent on the event');
    console.log('  AS-XP seven minutes on the Cellar at Level 20 inside the weekend: ' + gained + ' Level XP, ' + ev + ' the event\'s; the plate "' + (plate && plate.head) + ' ' + (plate && plate.when) + '"');
    return bad;
  },

  'AS-QUIET': async (db, M) => {
    const bad = [];
    const U = UIDS[0];
    const rows = await q(db, `select switch_id, scope from public.hr_feature_switches where switch_id = any($1) order by switch_id`, [SWITCHES]);
    if (rows.length !== SWITCHES.length || rows.some((r) => r.scope !== 'off')) bad.push('the guards\' calendar reads ' + JSON.stringify(rows) + ' (want the events off)');
    await holdNow(db, 'hearthrise');
    const w = await one(db, `select public.hr_live_xp_windows($1::uuid, 'mill_cellar', now() - interval '1 hour', now() + interval '1 hour')`, [U]);
    if (JSON.stringify(w) !== '[]') bad.push('inside a Hearthrise window a guard reads the XP windows ' + JSON.stringify(w) + ' (want none)');
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
  { arm: 'AS-XP', name: 'event_xp_bonus left off', plant: "update public.hr_feature_switches set scope = 'off' where switch_id = 'event_xp_bonus'" },
  { arm: 'AS-QUIET', name: 'the harness keeps the live calendar for every guard', calendar: 'live' },
  { arm: 'AS-ROWS', name: 'a retired switch comes back as a row', plant: "insert into public.hr_feature_switches (switch_id, scope, accounts, note) values ('scaled_hunts', 'everyone', '{}', 'planted')" },
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
